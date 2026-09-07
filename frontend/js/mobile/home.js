/**
 * home.js - Pantalla de inicio de la PWA. Contiene el boton SOS.
 *
 * Diseño del SOS, y por que:
 *
 *   1. Se activa MANTENIENDO PULSADO 2 segundos, no con un toque. Un boton
 *      rojo enorme que dispara al primer roce se activaria solo dentro del
 *      bolsillo. Mantener pulsado exige intencion.
 *   2. Durante esos 2 segundos el boton muestra la cuenta atras y se puede
 *      soltar para cancelar.
 *   3. Se pide la ubicacion ANTES de enviar. Un SOS sin coordenadas obliga al
 *      operador a llamar para preguntar donde es, que es justo lo que este
 *      sistema quiere evitar.
 *   4. Si el GPS falla, se pregunta si enviar igualmente sin ubicacion: es
 *      preferible un aviso sin coordenadas a ningun aviso.
 */

import { initMobilePage, vibrate } from './app.js';
import { api } from '../core/api.js';
import { askForLocation, explainLocationProblem, isCoarse } from '../core/geo.js';
import { $, escapeHtml, timeAgo, getParam } from '../core/utils.js';
import { notify, notifyApiError, confirmDialog } from '../core/ui.js';
import * as seismic from './seismic.js';
import { countQueuedReports } from '../core/offlineQueue.js';

/** Tiempo que hay que mantener pulsado, en milisegundos. */
const HOLD_MS = 2000;

const button = $('#btn-sos');
const label = button.querySelector('.sos-button__label');
const hint = button.querySelector('.sos-button__hint');

let holdTimer = null;
let countdownTimer = null;
let isSending = false;

/* ==========================================================================
   Envio del SOS
   ========================================================================== */

/** Devuelve el boton a su estado normal. */
function resetButton() {
  clearInterval(countdownTimer);
  clearTimeout(holdTimer);
  holdTimer = null;
  countdownTimer = null;

  button.classList.remove('is-sending');
  button.disabled = false;
  label.textContent = 'SOS';
  hint.textContent = 'Mantener pulsado';
}

/** Envia la emergencia critica. */
async function sendSos() {
  if (isSending) return;
  isSending = true;

  button.disabled = true;
  button.classList.add('is-sending');
  label.textContent = '📍';
  hint.textContent = 'Buscando tu ubicacion…';

  vibrate([100, 50, 100]);

  /*
   * `explain: false` a proposito. En el SOS no se abre la ventana de ayuda
   * antes de preguntar: primero hay que resolver lo urgente —enviar la alerta
   * como sea— y solo despues se explica lo del permiso. Al reves, el usuario
   * se encontraria un tutorial delante en mitad de una emergencia.
   */
  /*
   * La precision importa tanto como la rapidez: una alerta con un error de un
   * kilometro manda a la ambulancia al barrio equivocado. Por eso se espera a
   * que el GPS afine hasta 20 m, con un tope de 15 s, y se va contando al
   * usuario como mejora para que la espera no parezca que se colgo.
   *
   * Si a los 15 s no ha bajado de 20 m, se envia igual con la mejor lectura
   * conseguida: en una emergencia una posicion aproximada llega antes que
   * ninguna.
   */
  const location = await askForLocation({
    timeout: 15000,
    desiredAccuracy: 20,
    explain: false,
    onProgress: (accuracy) => {
      hint.textContent = `Afinando la ubicacion… ±${Math.round(accuracy)} m`;
    },
  });

  let payload;

  if (location.ok) {
    payload = {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
    };
  } else {
    /*
     * Sin ubicacion el SOS pierde casi todo su valor, pero no todo: el centro
     * de control sabe QUIEN pidio ayuda y tiene su telefono. Se pregunta en
     * lugar de decidir por el usuario.
     */
    resetButton();
    isSending = false;

    const sendAnyway = await confirmDialog({
      title: 'Sin ubicacion',
      message: `${location.message}\n\nPuedes enviar el SOS igualmente: el centro de control vera tus datos y te llamara, pero tardara mas en llegar.`,
      confirmLabel: 'Enviar sin ubicacion',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });

    // Si decide no enviarlo, ya no hay prisa: es el momento de contarle por
    // que fallo la ubicacion y como dejarla lista para la proxima vez.
    if (!sendAnyway) {
      explainLocationProblem(location.code, () => sendSos());
      return;
    }

    // El backend exige coordenadas, asi que se envia por el formulario
    // normal de reporte, donde la ubicacion se puede escribir a mano.
    notify.info('Describe la emergencia y tu direccion en el formulario.');
    window.location.href = '/app/report.html?sos=1';
    return;
  }

  hint.textContent = 'Enviando alerta…';

  try {
    const emergency = await api.post('/emergencies/sos', payload);

    vibrate([200, 100, 200]);
    label.textContent = '✓';
    hint.textContent = 'Alerta enviada';

    /*
     * Se avisa DESPUES de enviar, nunca antes: en una emergencia lo urgente es
     * que la alerta salga, aunque la posicion sea mala. Pero callarselo seria
     * peor que no avisar: el usuario creeria que mandaron una unidad a su
     * puerta cuando en realidad va a un punto a un kilometro.
     */
    if (isCoarse(payload.accuracy)) {
      notify.warning(
        `SOS ${emergency.code} enviado, pero la ubicacion tiene un error de ` +
          `${Math.round(payload.accuracy)} m. Llama tambien por telefono.`,
        10000
      );
      explainLocationProblem('COARSE');
    } else {
      notify.success(
        `SOS ${emergency.code} enviado con una precision de ${Math.round(payload.accuracy)} m. ` +
          'El centro de control ya fue notificado.',
        8000
      );
    }

    // Se lleva al ciudadano al seguimiento: lo que quiere ahora es saber que
    // pasa con su alerta.
    setTimeout(() => {
      window.location.href = `/app/emergency.html?id=${emergency.id}`;
    }, 1200);
  } catch (error) {
    resetButton();
    isSending = false;

    if (error.status === 429) {
      notify.error('Has enviado varios SOS seguidos. Si es una emergencia real, llama al 123.', 10000);
    } else {
      notifyApiError(error, 'No se pudo enviar el SOS. Comprueba tu conexion.');
    }
  }
}

/* ==========================================================================
   Mantener pulsado
   ========================================================================== */

/** Empieza la cuenta atras al presionar. */
function startHold(event) {
  // Solo boton principal del raton; en tactil no aplica.
  if (event.type === 'mousedown' && event.button !== 0) return;
  if (isSending || holdTimer) return;

  event.preventDefault();
  vibrate(40);

  let remaining = HOLD_MS / 1000;
  label.textContent = remaining.toFixed(0);
  hint.textContent = 'Suelta para cancelar';

  countdownTimer = setInterval(() => {
    remaining -= 0.1;
    if (remaining > 0) label.textContent = remaining.toFixed(1);
  }, 100);

  holdTimer = setTimeout(() => {
    clearInterval(countdownTimer);
    sendSos();
  }, HOLD_MS);
}

/** Cancela si se suelta antes de tiempo. */
function cancelHold() {
  if (isSending || !holdTimer) return;
  resetButton();
  hint.textContent = 'Mantener pulsado';
}

function setupSosButton() {
  // Tactil y raton: se cubren ambos para que funcione en telefono y en
  // escritorio (util para la demostracion).
  button.addEventListener('touchstart', startHold, { passive: false });
  button.addEventListener('touchend', cancelHold);
  button.addEventListener('touchcancel', cancelHold);

  button.addEventListener('mousedown', startHold);
  button.addEventListener('mouseup', cancelHold);
  button.addEventListener('mouseleave', cancelHold);

  // Accesibilidad: con teclado se usa Enter o Espacio, manteniendo pulsado.
  button.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) startHold(event);
  });
  button.addEventListener('keyup', cancelHold);

  // El menu contextual del navegador interrumpe el gesto de mantener pulsado.
  button.addEventListener('contextmenu', (event) => event.preventDefault());
}

/* ==========================================================================
   Resumen del ciudadano
   ========================================================================== */

/** Muestra el ultimo reporte y cuantos tiene abiertos. */
async function loadSummary() {
  try {
    const result = await api.get('/emergencies/mine', { limit: 1, sort: 'reported', order: 'desc' });
    const items = result.items || [];
    const total = result.meta ? result.meta.total : items.length;

    $('#reports-count').textContent = total === 0
      ? 'Aun no tienes reportes'
      : `${total} reporte(s)`;

    if (items.length === 0) return;

    const emergency = items[0];

    $('#last-emergency').innerHTML = `
      <a href="/app/emergency.html?id=${emergency.id}"
         class="m-card ${emergency.is_sos ? 'is-sos' : ''}"
         data-status="${escapeHtml(emergency.status_code)}">
        <div class="m-card__top">
          <span class="m-card__code">${escapeHtml(emergency.code)}</span>
          ${emergency.is_sos ? '<span class="badge badge--sos">SOS</span>' : ''}
        </div>
        <p class="m-card__title">${escapeHtml(emergency.title)}</p>
        <div class="m-card__meta">
          <span class="badge badge--status" data-status="${escapeHtml(emergency.status_code)}">
            ${escapeHtml(emergency.status_name)}
          </span>
          <span>${escapeHtml(timeAgo(emergency.reported_at))}</span>
        </div>
      </a>`;

    $('#last-section').hidden = false;
  } catch {
    // Sin conexion se deja la pantalla como esta: el SOS sigue siendo lo
    // importante y no debe quedar tapado por un error de carga.
  }
}

/* ==========================================================================
   Alerta sismica automatica
   ========================================================================== */

/** Muestra el interruptor solo si el telefono tiene el sensor. */
function setupSeismicToggle() {
  if (!seismic.isSupported()) return;

  const section = $('#seismic-section');
  const toggle = $('#seismic-toggle');
  section.hidden = false;
  toggle.checked = seismic.isEnabled();

  toggle.addEventListener('change', async (event) => {
    const wanted = event.target.checked;
    const applied = await seismic.setEnabled(wanted);

    // El permiso del sensor se pudo negar: el interruptor vuelve a apagado.
    if (wanted && !applied) {
      toggle.checked = false;
      return;
    }

    notify.success(
      wanted
        ? 'Deteccion de sismos activada. Mantén la app abierta para que funcione.'
        : 'Deteccion de sismos desactivada.'
    );
  });
}

/* -------------------------------------------------------------------------- */

async function init() {
  const user = await initMobilePage({ nav: 'home' });
  if (!user) return;

  $('#greeting').textContent = `Hola, ${user.first_name}`;

  setupSosButton();
  setupSeismicToggle();
  await loadSummary();

  // Si el telefono se cerro estando sin conexion, avisa de lo que quedo
  // pendiente. flushOfflineQueue() (en app.js) ya intento reenviarlos solo.
  try {
    const pending = await countQueuedReports();
    if (pending > 0) {
      notify.info(
        pending === 1
          ? 'Tienes 1 reporte guardado que se enviara solo en cuanto haya conexion.'
          : `Tienes ${pending} reportes guardados que se enviaran solos en cuanto haya conexion.`,
        8000
      );
    }
  } catch {
    // Sin IndexedDB disponible no hay cola que mostrar.
  }

  // Acceso directo del sistema operativo: /app/index.html?action=sos
  if (getParam('action') === 'sos') {
    notify.info('Manten pulsado el boton SOS para enviar la alerta.', 6000);
    button.focus();
  }
}

init();
