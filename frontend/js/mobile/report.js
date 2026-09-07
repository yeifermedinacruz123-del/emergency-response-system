/**
 * report.js - Formulario de reporte de emergencia (PWA).
 *
 * Reune las tres capacidades del telefono que necesita el sistema:
 *   - Geolocation API para la ubicacion.
 *   - Camara y galeria para las fotografias.
 *   - Envio multipart al backend.
 *
 * Las fotos se REDUCEN en el navegador antes de subirlas. Una foto de un movil
 * actual pesa entre 3 y 8 MB; el limite del servidor es 5 MB y una conexion
 * movil en una emergencia puede ser mala. Redimensionar a 1600 px deja
 * archivos de unos 300 KB sin perder detalle util para el operador.
 */

import { initMobilePage, vibrate } from './app.js';
import { api } from '../core/api.js';
import { askForLocation, explainLocationProblem, isCoarse } from '../core/geo.js';
import { $, $$, escapeHtml, formatCoords, getParam } from '../core/utils.js';
import { notify, notifyApiError, busyButton } from '../core/ui.js';
import { queueReport } from '../core/offlineQueue.js';

/** Limites, alineados con la configuracion del backend. */
const MAX_PHOTOS = 5;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

/** Duracion maxima de la nota de voz, en segundos. */
const MAX_AUDIO_SECONDS = 90;

/** Estado del formulario. */
const state = {
  location: null,
  photos: [], // { file, url }
  audio: null, // { blob, url }
};

/* ==========================================================================
   Tipos de emergencia
   ========================================================================== */

async function loadTypes() {
  const picker = $('#type-picker');

  try {
    const types = await api.get('/catalogs/types');

    picker.innerHTML = types
      .map((type, index) => `
        <label class="type-option">
          <input type="radio" name="type" value="${escapeHtml(type.code)}" ${index === 0 ? '' : ''} required>
          <span class="type-option__icon" aria-hidden="true">${type.icon || '⚠'}</span>
          <span class="type-option__label">${escapeHtml(type.name)}</span>
        </label>`)
      .join('');
  } catch {
    picker.innerHTML = `<p class="text-muted" style="font-size: var(--text-sm);">
      No se pudieron cargar los tipos. Comprueba tu conexion.</p>`;
  }
}

/* ==========================================================================
   Ubicacion
   ========================================================================== */

function setLocationState(state_, text, coords = '') {
  const box = $('#location-status');
  box.dataset.state = state_;
  $('#location-text').textContent = text;
  $('#location-coords').textContent = coords;

  // El enlace de ayuda pertenece al error anterior: se retira siempre y lo
  // vuelve a poner quien lo necesite. Asi no sobrevive a un reintento correcto.
  const help = box.querySelector('.location-help');
  if (help) help.remove();
}

/**
 * Pide la ubicacion y refleja el resultado en la interfaz.
 *
 * @param {object} [options]
 * @param {boolean} [options.silent] Sin vibracion, para la carga inicial.
 * @param {boolean} [options.explain] Abrir la ventana con los pasos si falla.
 */
async function requestLocation({ silent = false, explain = true } = {}) {
  setLocationState('loading', 'Obteniendo tu ubicacion…');

  const result = await askForLocation({
    explain,
    /*
     * Aqui no hay la prisa del SOS, asi que se puede esperar un poco mas y
     * exigir una lectura mejor: la direccion a la que va a salir la unidad
     * sale de estas coordenadas.
     */
    timeout: 20000,
    desiredAccuracy: 15,
    onProgress: (accuracy) =>
      setLocationState('loading', `Afinando la ubicacion… ±${Math.round(accuracy)} m`),
    // Reintentar desde la propia ventana, sin volver a abrirla si falla otra
    // vez: dos ventanas encadenadas encima de la misma pantalla marean.
    onRetry: () => requestLocation({ explain: false }),
  });

  if (result.ok) {
    state.location = result;

    /*
     * Una lectura de 2 km cuenta como exito para el navegador, pero no sirve
     * para mandar una unidad. Aqui no hay la prisa del SOS, asi que se marca
     * en amarillo y se ofrece la explicacion: es el momento de arreglarlo,
     * antes de enviar el reporte y no despues.
     */
    if (isCoarse(result.accuracy)) {
      setLocationState(
        'warning',
        `Ubicacion poco precisa · error de ${Math.round(result.accuracy)} m`,
        formatCoords(result.latitude, result.longitude)
      );
      showLocationHelpLink('COARSE');
      return true;
    }

    setLocationState(
      'ok',
      `Ubicacion obtenida · precision de ${Math.round(result.accuracy)} m`,
      formatCoords(result.latitude, result.longitude)
    );
    if (!silent) vibrate(50);
    return true;
  }

  state.location = null;

  // Se deja a mano el enlace para volver a abrir la explicacion: el aviso de
  // una linea no cabe los pasos, y el usuario ya cerro la ventana.
  setLocationState('error', result.message);
  showLocationHelpLink(result.code);
  return false;
}

/**
 * Pone bajo el aviso de error un enlace que reabre la ventana con los pasos.
 */
function showLocationHelpLink(code) {
  const box = $('#location-status');
  if (!box || box.querySelector('.location-help')) return;

  // Dentro del cuerpo, no del recuadro: el recuadro es flex en horizontal y
  // el enlace acabaria al lado del icono en vez de debajo del texto.
  const target = box.querySelector('.location-status__body') || box;

  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'location-help btn btn--link';
  link.textContent = code === 'COARSE' ? 'Como la mejoro?' : 'Como lo activo?';
  link.addEventListener('click', () => {
    explainLocationProblem(code, () => requestLocation({ explain: false }));
  });

  target.appendChild(link);
}

/* ==========================================================================
   Fotografias
   ========================================================================== */

/**
 * Redimensiona una imagen manteniendo su proporcion.
 * Si algo falla (formato raro, imagen corrupta), se devuelve el archivo
 * original: es mejor subir una foto grande que perderla.
 *
 * @param {File} file
 * @returns {Promise<File>}
 */
function resizeImage(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);

      const { width, height } = image;
      const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));

      // Ya es pequeña: no se toca.
      if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
        resolve(file);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);

      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          const name = file.name.replace(/\.[^.]+$/, '') || 'foto';
          resolve(new File([blob], `${name}.jpg`, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    image.src = url;
  });
}

/** Pinta las miniaturas. */
function renderPhotos() {
  const picker = $('#photo-picker');

  // Se quitan solo las miniaturas: los dos botones se conservan.
  $$('.photo-thumb', picker).forEach((node) => node.remove());

  state.photos.forEach((photo, index) => {
    const thumb = document.createElement('div');
    thumb.className = 'photo-thumb';
    thumb.innerHTML = `
      <img src="${photo.url}" alt="Fotografia ${index + 1}">
      <button type="button" class="photo-thumb__remove" data-remove="${index}"
              aria-label="Quitar fotografia ${index + 1}">✕</button>`;
    picker.insertBefore(thumb, picker.firstChild);
  });

  const remaining = MAX_PHOTOS - state.photos.length;
  $('#photo-count').textContent = state.photos.length > 0 ? `(${state.photos.length}/${MAX_PHOTOS})` : '';

  const totalKb = state.photos.reduce((sum, photo) => sum + photo.file.size, 0) / 1024;
  $('#photo-hint').textContent = state.photos.length === 0
    ? `Puedes adjuntar hasta ${MAX_PHOTOS} fotografias.`
    : `${state.photos.length} de ${MAX_PHOTOS} · ${totalKb.toFixed(0)} KB en total`;

  // Sin espacio libre se ocultan los botones de añadir.
  $('#btn-camera').hidden = remaining <= 0;
  $('#btn-gallery').hidden = remaining <= 0;
}

/** Procesa los archivos elegidos. */
async function addPhotos(fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) return;

  const free = MAX_PHOTOS - state.photos.length;
  if (free <= 0) {
    notify.warning(`Ya tienes el maximo de ${MAX_PHOTOS} fotografias.`);
    return;
  }

  if (files.length > free) {
    notify.warning(`Solo caben ${free} fotografia(s) mas. Se tomaran las primeras.`);
  }

  const accepted = files.slice(0, free);

  for (const file of accepted) {
    if (!file.type.startsWith('image/')) {
      notify.error(`"${file.name}" no es una imagen.`);
      continue;
    }

    const resized = await resizeImage(file);
    state.photos.push({ file: resized, url: URL.createObjectURL(resized) });
  }

  renderPhotos();
  vibrate(40);
}

function setupPhotos() {
  $('#btn-camera').addEventListener('click', () => $('#input-camera').click());
  $('#btn-gallery').addEventListener('click', () => $('#input-gallery').click());

  ['#input-camera', '#input-gallery'].forEach((selector) => {
    $(selector).addEventListener('change', async (event) => {
      await addPhotos(event.target.files);
      // Se limpia para poder elegir el mismo archivo otra vez.
      event.target.value = '';
    });
  });

  $('#photo-picker').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove]');
    if (!button) return;

    const index = Number.parseInt(button.dataset.remove, 10);
    const [removed] = state.photos.splice(index, 1);

    // Se libera la memoria de la vista previa.
    if (removed) URL.revokeObjectURL(removed.url);

    renderPhotos();
  });

  renderPhotos();
}

/* ==========================================================================
   Nota de voz
   ========================================================================== */

/** true si el navegador puede grabar audio del microfono. */
function isAudioSupported() {
  return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

/** El primer formato que el navegador sepa grabar, de la lista preferida. */
function pickAudioMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];
let audioTimer = null;

/** Muestra solo uno de los tres paneles: inicial, grabando, o ya grabado. */
function showAudioPanel(panel) {
  $('#audio-idle').hidden = panel !== 'idle';
  $('#audio-recording').hidden = panel !== 'recording';
  $('#audio-done').hidden = panel !== 'done';
}

async function startRecording() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    notify.error('No se pudo acceder al microfono. Revisa los permisos del navegador.');
    return;
  }

  const mimeType = pickAudioMimeType();
  mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
  audioChunks = [];

  mediaRecorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) audioChunks.push(event.data);
  });

  mediaRecorder.addEventListener('stop', () => {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;

    if (state.audio) URL.revokeObjectURL(state.audio.url);

    const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || mimeType || 'audio/webm' });
    const url = URL.createObjectURL(blob);
    state.audio = { blob, url };

    $('#audio-preview').src = url;
    showAudioPanel('done');
  });

  mediaRecorder.start();
  showAudioPanel('recording');
  vibrate(40);

  let elapsed = 0;
  $('#audio-timer').textContent = '0:00';

  audioTimer = setInterval(() => {
    elapsed += 1;
    const minutes = Math.floor(elapsed / 60);
    const seconds = String(elapsed % 60).padStart(2, '0');
    $('#audio-timer').textContent = `${minutes}:${seconds}`;

    if (elapsed >= MAX_AUDIO_SECONDS) stopRecording();
  }, 1000);
}

function stopRecording() {
  clearInterval(audioTimer);
  audioTimer = null;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
}

function discardRecording() {
  if (state.audio) URL.revokeObjectURL(state.audio.url);
  state.audio = null;
  $('#audio-preview').removeAttribute('src');
  showAudioPanel('idle');
}

function setupAudioRecorder() {
  if (!isAudioSupported()) return;

  $('#audio-section').hidden = false;
  showAudioPanel('idle');

  $('#btn-record').addEventListener('click', startRecording);
  $('#btn-stop-record').addEventListener('click', stopRecording);
  $('#btn-discard-record').addEventListener('click', discardRecording);
}

/* ==========================================================================
   Envio
   ========================================================================== */

function markInvalid(input, message) {
  input.classList.add('is-invalid');
  const field = input.closest('.field') || input.parentElement;
  if (!field.querySelector('.field__error')) {
    const error = document.createElement('p');
    error.className = 'field__error';
    error.textContent = message;
    field.appendChild(error);
  }
}

function clearErrors() {
  $$('.is-invalid').forEach((node) => node.classList.remove('is-invalid'));
  $$('.field__error').forEach((node) => node.remove());
}

async function handleSubmit(event) {
  event.preventDefault();
  clearErrors();

  const type = document.querySelector('input[name="type"]:checked');
  const title = $('#title');

  let valid = true;

  if (!type) {
    notify.warning('Selecciona que tipo de emergencia es.');
    $('#type-picker').scrollIntoView({ behavior: 'smooth', block: 'center' });
    valid = false;
  }

  if (!title.value.trim() || title.value.trim().length < 5) {
    markInvalid(title, 'Escribe un titulo de al menos 5 caracteres');
    valid = false;
  }

  if (!valid) return;

  // Sin ubicacion no se puede crear la emergencia: se intenta una ultima vez.
  if (!state.location) {
    notify.info('Necesito tu ubicacion para enviar el reporte…');
    const located = await requestLocation();

    if (!located) {
      notify.error('Sin ubicacion no se puede enviar el reporte. Activa el GPS e intentalo de nuevo.', 9000);
      $('#location-status').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  }

  const submitButton = $('#btn-submit');
  const restore = busyButton(submitButton, 'Enviando…');

  // Campos de texto aparte del FormData: si hay que guardar el reporte en la
  // cola sin conexion, IndexedDB necesita un objeto plano, no un FormData
  // (que no se puede clonar para guardarlo).
  const fields = {
    type: type.value,
    title: title.value.trim(),
    description: $('#description').value.trim(),
    priority: $('#priority').value,
    latitude: state.location.latitude,
    longitude: state.location.longitude,
  };
  if (state.location.accuracy) fields.accuracy = Math.round(state.location.accuracy);
  if ($('#address').value.trim()) fields.address = $('#address').value.trim();

  /*
   * multipart/form-data porque van archivos. El cliente de la API detecta el
   * FormData y NO pone Content-Type a mano: el navegador debe generarlo con
   * el "boundary" correcto.
   */
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));
  state.photos.forEach((photo) => form.append('photos', photo.file, photo.file.name));
  if (state.audio) form.append('audio', state.audio.blob, 'nota-de-voz.webm');

  try {
    const emergency = await api.upload('/emergencies', form);

    vibrate([150, 80, 150]);
    notify.success(`Reporte ${emergency.code} enviado correctamente.`, 6000);

    // Se liberan las vistas previas antes de salir.
    state.photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    if (state.audio) URL.revokeObjectURL(state.audio.url);

    window.location.href = `/app/emergency.html?id=${emergency.id}`;
  } catch (error) {
    // Sin conexion de verdad (no un rechazo del servidor): el reporte no se
    // pierde, se guarda para reintentarlo solo en cuanto vuelva la señal.
    if (error.code === 'NETWORK_ERROR' || !navigator.onLine) {
      try {
        await queueReport(
          fields,
          state.photos.map((photo) => photo.file),
          state.audio ? state.audio.blob : null
        );

        vibrate([100, 60, 100, 60, 100]);
        notify.success(
          'Sin conexion: tu reporte quedo guardado en el telefono y se enviara solo en cuanto vuelva la señal.',
          10000
        );

        state.photos.forEach((photo) => URL.revokeObjectURL(photo.url));
        if (state.audio) URL.revokeObjectURL(state.audio.url);

        window.location.href = '/app/index.html';
        return;
      } catch {
        restore();
        notify.error('No se pudo enviar ni guardar el reporte. Intentalo de nuevo.', 9000);
        return;
      }
    }

    restore();

    if (error.status === 422 && Array.isArray(error.errors)) {
      error.errors.forEach((item) => {
        const input = document.querySelector(`[name="${item.field}"], #${item.field}`);
        if (input) markInvalid(input, item.message);
      });
      notify.error(error.errors[0].message);
    } else {
      notifyApiError(error, 'No se pudo enviar el reporte. Comprueba tu conexion.');
    }
  }
}

/* -------------------------------------------------------------------------- */

async function init() {
  const user = await initMobilePage({ nav: 'report', realtime: false });
  if (!user) return;

  $('#btn-back').addEventListener('click', () => {
    if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
    if (window.history.length > 1) window.history.back();
    else window.location.href = '/app/index.html';
  });

  $('#report-form').addEventListener('submit', handleSubmit);
  $('#btn-locate').addEventListener('click', () => requestLocation());

  setupPhotos();
  setupAudioRecorder();
  await loadTypes();

  // Si se llega desde un SOS sin ubicacion, se avisa del motivo.
  if (getParam('sos') === '1') {
    $('#priority').value = 'CRITICA';
    notify.warning('No se pudo obtener tu ubicacion automaticamente. Escribe la direccion lo mas exacta que puedas.', 9000);
  }

  /*
   * La ubicacion se pide nada mas entrar: cuando el usuario termine de
   * escribir, ya estara lista.
   *
   * `explain: false` aqui: si falla, se marca el error con su enlace "Como lo
   * activo?" y nada mas. Recibir una ventana con instrucciones nada mas abrir
   * la pantalla, sin haber pedido nada, es agresivo. La ventana sale cuando el
   * usuario toca el boton de ubicacion o intenta enviar, que es cuando de
   * verdad le hace falta.
   */
  await requestLocation({ silent: true, explain: false });
}

init();
