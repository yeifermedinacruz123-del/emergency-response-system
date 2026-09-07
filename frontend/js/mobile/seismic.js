/**
 * seismic.js - Deteccion de sismos por el acelerometro del telefono.
 *
 * Funciona como las apps ciudadanas de alerta sismica (tipo MyShake): mientras
 * la PWA esta abierta, escucha el acelerometro del telefono y, si detecta una
 * sacudida fuerte y sostenida, ofrece reportarla como emergencia sin que el
 * ciudadano tenga que abrir el formulario a mano. Nunca se envia en silencio:
 * siempre hay una cuenta atras cancelable, porque una sacudida fuerte tambien
 * puede ser que se les cayo el telefono o que iban en bus por un caminito
 * destapado.
 *
 * Limitacion real: solo funciona con la pestaña abierta en primer plano. Un
 * service worker no tiene acceso al acelerometro, asi que no hay deteccion
 * de verdad "en segundo plano" ni con el telefono bloqueado.
 */

import { api } from '../core/api.js';
import { askForLocation } from '../core/geo.js';
import { modal, notify, notifyApiError } from '../core/ui.js';
import { vibrate } from './app.js';

const STORAGE_KEY = 'ers.seismicDetection';

/*
 * Umbrales del algoritmo de sacudida.
 *
 * SHAKE_THRESHOLD: diferencia minima (m/s^2) entre dos lecturas seguidas para
 * contar como "pico". La gravedad normal ya hace vibrar un poco el sensor;
 * hace falta un salto claro para no disparar al caminar con el telefono en
 * la mano.
 *
 * SHAKE_COUNT_NEEDED dentro de SHAKE_WINDOW_MS: un solo golpe (dejar caer el
 * telefono) no cuenta. Un sismo sacude de forma sostenida, no de una vez.
 */
const SHAKE_THRESHOLD = 15;
const SHAKE_COUNT_NEEDED = 8;
const SHAKE_WINDOW_MS = 2000;

/** No volver a preguntar antes de un minuto, aunque el telefono siga vibrando. */
const COOLDOWN_MS = 60000;

/** Segundos de la cuenta atras antes de reportar solo. */
const AUTO_REPORT_SECONDS = 15;

let listening = false;
let lastValues = null;
let shakeTimestamps = [];
let lastPromptAt = 0;
let promptOpen = false;

/** true si el navegador expone el sensor de movimiento. */
export function isSupported() {
  return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
}

/** true si el ciudadano activo la deteccion (se recuerda entre visitas). */
export function isEnabled() {
  return localStorage.getItem(STORAGE_KEY) === 'on';
}

/**
 * iOS 13+ exige permiso explicito para leer el acelerometro, y solo se puede
 * pedir desde un gesto directo del usuario (un clic), nunca al cargar la
 * pagina. Android y los navegadores de escritorio no lo piden: ahi la funcion
 * no existe y se asume concedido.
 */
async function ensurePermission() {
  const RequestPermission = window.DeviceMotionEvent && window.DeviceMotionEvent.requestPermission;
  if (typeof RequestPermission !== 'function') return true;

  try {
    return (await RequestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** Compara la lectura actual con la anterior y acumula picos recientes. */
function handleMotion(event) {
  const acc = event.accelerationIncludingGravity || event.acceleration;
  if (!acc || acc.x === null || acc.x === undefined) return;

  if (lastValues) {
    const delta = Math.abs(acc.x - lastValues.x)
      + Math.abs(acc.y - lastValues.y)
      + Math.abs(acc.z - lastValues.z);

    if (delta > SHAKE_THRESHOLD) {
      const now = Date.now();
      shakeTimestamps.push(now);
      shakeTimestamps = shakeTimestamps.filter((t) => now - t <= SHAKE_WINDOW_MS);

      if (shakeTimestamps.length >= SHAKE_COUNT_NEEDED) {
        shakeTimestamps = [];
        maybePrompt();
      }
    }
  }

  lastValues = { x: acc.x, y: acc.y, z: acc.z };
}

function maybePrompt() {
  const now = Date.now();
  if (promptOpen || now - lastPromptAt < COOLDOWN_MS) return;

  lastPromptAt = now;
  promptOpen = true;
  vibrate([150, 80, 150, 80, 150]);
  showConfirmation();
}

/** Reporta el sismo reutilizando el mismo endpoint que el boton SOS. */
async function report() {
  notify.info('Buscando tu ubicacion para reportar el sismo…', 4000);

  const location = await askForLocation({ timeout: 15000, desiredAccuracy: 50, explain: false });

  if (!location.ok) {
    notify.warning(
      'No se pudo obtener tu ubicacion automaticamente. Si fue un sismo, ' +
        'usa "Reportar emergencia" para enviarlo con la direccion escrita a mano.',
      12000
    );
    return;
  }

  try {
    const emergency = await api.post('/emergencies/sos', {
      type: 'DESASTRE_NATURAL',
      title: 'Posible sismo detectado automaticamente',
      description:
        'El telefono del ciudadano detecto una sacudida fuerte y sostenida, ' +
        'compatible con un sismo. Reporte generado sin intervencion manual.',
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
    });

    vibrate([200, 100, 200]);
    notify.success(
      `Sismo reportado (${emergency.code}). El centro de control ya fue notificado.`,
      8000
    );
  } catch (error) {
    if (error.status === 429) {
      notify.warning('Ya se envio un reporte automatico hace poco. Si necesitas ayuda, llama al 123.');
    } else {
      notifyApiError(error, 'No se pudo reportar el sismo automaticamente.');
    }
  }
}

/** Aviso con cuenta atras cancelable antes de reportar. */
function showConfirmation() {
  let seconds = AUTO_REPORT_SECONDS;
  let cancelled = false;
  let timer = null;

  const instance = modal({
    title: '¿Sintio un sismo?',
    size: 'sm',
    content: `
      <p class="modal__text">
        Detectamos un movimiento fuerte y sostenido en el telefono, similar al de un sismo.
      </p>
      <p class="modal__text" style="font-weight: var(--weight-semibold);">
        Se reportara solo en <span id="seismic-countdown">${seconds}</span> s si no cancelas,
        para avisar al centro de control aunque no puedas hacerlo tu mismo.
      </p>`,
    actions: [
      { label: 'No fue un sismo', variant: 'ghost', onClick: () => { cancelled = true; } },
      { label: 'Reportar ahora', variant: 'danger', onClick: () => { cancelled = true; report(); } },
    ],
    onClose: () => {
      clearInterval(timer);
      promptOpen = false;
    },
  });

  timer = setInterval(() => {
    seconds -= 1;
    const countdown = instance.body.querySelector('#seismic-countdown');
    if (countdown) countdown.textContent = seconds;

    if (seconds <= 0) {
      clearInterval(timer);
      const shouldReport = !cancelled;
      instance.close();
      if (shouldReport) report();
    }
  }, 1000);
}

function start() {
  if (listening || !isSupported()) return;
  window.addEventListener('devicemotion', handleMotion);
  listening = true;
}

function stop() {
  if (!listening) return;
  window.removeEventListener('devicemotion', handleMotion);
  listening = false;
  lastValues = null;
  shakeTimestamps = [];
}

/**
 * Enciende o apaga la deteccion y lo recuerda entre visitas.
 * @returns {Promise<boolean>} false si el permiso del sensor fue denegado.
 */
export async function setEnabled(enabled) {
  if (!enabled) {
    localStorage.removeItem(STORAGE_KEY);
    stop();
    return true;
  }

  const granted = await ensurePermission();
  if (!granted) {
    notify.error('Sin permiso para usar el sensor de movimiento: no se puede activar la deteccion.');
    return false;
  }

  localStorage.setItem(STORAGE_KEY, 'on');
  start();
  return true;
}

/** Retoma la escucha al abrir cualquier pantalla, si ya estaba activada antes. */
export function resumeIfEnabled() {
  if (isSupported() && isEnabled()) start();
}

export default { isSupported, isEnabled, setEnabled, resumeIfEnabled };
