/**
 * emergency-detail.js - Detalle y gestion de una emergencia.
 *
 * Es la pantalla donde el operador realmente trabaja: ve todo lo que se sabe
 * del incidente, asigna personal, cambia el estado y la prioridad, y registra
 * avances. Todo queda en la linea de tiempo.
 *
 * Las acciones disponibles dependen del rol, pero la decision final es del
 * backend: aqui solo se evita mostrar botones que darian 403.
 */

import { ROLES, ROUTES, SOCKET_EVENTS } from '../core/config.js';
import { requireAuth, session } from '../core/auth.js';
import { api } from '../core/api.js';
import { realtime } from '../core/socket.js';
import { mountLayout, setSubtitle } from '../components/layout.js';
import { createMiniMap, isLeafletReady, directionsLinksHtml } from '../components/map.js';
import {
  notify, notifyApiError, modal, confirmDialog, formModal, busyButton,
} from '../core/ui.js';
import {
  $, escapeHtml, formatDateTime, timeAgo, formatDuration, formatCoords, getParam, initials,
} from '../core/utils.js';

/** Emergencia actualmente cargada. */
let emergency = null;
let currentUser = null;
/** Mensajes del chat interno. Vacio si el rol no puede verlo (el ciudadano). */
let messages = [];

const emergencyId = Number.parseInt(getParam('id'), 10);

/* ==========================================================================
   Bloques de la vista
   ========================================================================== */

function headerBlock() {
  const canManage = session.isControlRoom();
  const canChangeStatus = canManage || session.isResponder();
  const isFinal = emergency.status_is_final;

  const actions = [];

  if (canChangeStatus && !isFinal) {
    if (emergency.status_code === 'PENDIENTE') {
      actions.push(`<button type="button" class="btn btn--primary btn--sm" data-action="status" data-status="EN_PROCESO">
        Marcar en proceso</button>`);
    }
    if (emergency.status_code === 'EN_PROCESO') {
      actions.push(`<button type="button" class="btn btn--success btn--sm" data-action="status" data-status="RESUELTO">
        Resolver</button>`);
    }
  }

  if (canManage && !isFinal) {
    actions.push(`<button type="button" class="btn btn--ghost btn--sm" data-action="assign">Asignar personal</button>`);
    actions.push(`<button type="button" class="btn btn--ghost btn--sm" data-action="priority">Cambiar prioridad</button>`);
    actions.push(`<button type="button" class="btn btn--ghost btn--sm" data-action="status" data-status="CANCELADO">
      Cancelar</button>`);
  }

  return `
    <div class="detail-header ${emergency.is_sos ? 'is-sos' : ''}">
      <div style="min-width: 0;">
        <p class="detail-header__code">${escapeHtml(emergency.code)}</p>
        <h2 class="detail-header__title">${escapeHtml(emergency.title)}</h2>
        <div class="detail-header__badges">
          ${emergency.is_sos ? '<span class="badge badge--sos">🆘 SOS</span>' : ''}
          <span class="badge badge--status" data-status="${emergency.status_code}">
            ${escapeHtml(emergency.status_name)}
          </span>
          <span class="badge badge--priority" data-priority="${emergency.priority_code}">
            Prioridad ${escapeHtml(emergency.priority_name)}
          </span>
          <span class="type-tag">
            <span aria-hidden="true">${emergency.type_icon || '⚠'}</span>
            ${escapeHtml(emergency.type_name)}
          </span>
        </div>
      </div>
      <div class="detail-header__actions">
        <a href="${ROUTES.emergencies}" class="btn btn--ghost btn--sm">← Volver</a>
        ${actions.join('')}
      </div>
    </div>`;
}

function infoBlock() {
  const rows = [
    ['Reportada', `${formatDateTime(emergency.reported_at)}<br><small class="text-muted">${timeAgo(emergency.reported_at)}</small>`],
    ['Ciudadano', `${escapeHtml(emergency.reporter_name)}<br><small class="text-muted">${escapeHtml(emergency.reporter_phone || 'Sin telefono')}</small>`],
    ['Direccion', escapeHtml(emergency.address || 'Sin direccion registrada')],
    ['Referencia', escapeHtml(emergency.reference || '—')],
    ['Zona', escapeHtml(emergency.zone_name || 'Sin zona')],
    ['Coordenadas', `<span class="data-pair__value--mono">${formatCoords(emergency.latitude, emergency.longitude)}</span>`],
  ];

  if (emergency.assigned_at) {
    const minutes = (new Date(emergency.assigned_at) - new Date(emergency.reported_at)) / 60000;
    rows.push(['Asignada', `${formatDateTime(emergency.assigned_at)}<br><small class="text-muted">${formatDuration(minutes)} despues del reporte</small>`]);
  }

  if (emergency.resolved_at) {
    const minutes = (new Date(emergency.resolved_at) - new Date(emergency.reported_at)) / 60000;
    rows.push(['Resuelta', `${formatDateTime(emergency.resolved_at)}<br><small class="text-muted">${formatDuration(minutes)} en total</small>`]);
  }

  const notes = emergency.resolution_notes || emergency.cancel_reason;
  const notesLabel = emergency.resolution_notes ? 'Notas de cierre' : 'Motivo de cancelacion';

  return `
    <section class="panel page__section" aria-labelledby="info-title">
      <div class="panel__head">
        <h3 id="info-title" class="panel__title">Informacion</h3>
      </div>

      ${emergency.description ? `
        <p class="data-pair__value" style="margin-bottom: var(--space-5); line-height: 1.6;">
          ${escapeHtml(emergency.description)}
        </p>` : ''}

      <div class="data-pairs">
        ${rows.map(([label, value]) => `
          <div class="data-pair">
            <span class="data-pair__label">${escapeHtml(label)}</span>
            <span class="data-pair__value">${value}</span>
          </div>`).join('')}
      </div>

      ${notes ? `
        <div class="data-pair" style="margin-top: var(--space-5);">
          <span class="data-pair__label">${escapeHtml(notesLabel)}</span>
          <span class="data-pair__value">${escapeHtml(notes)}</span>
        </div>` : ''}
    </section>`;
}

/**
 * Mapa de la ubicacion.
 * El contenedor se pinta vacio y Leaflet lo rellena despues, en mountMiniMap:
 * la libreria necesita que el elemento exista y tenga altura antes de
 * inicializarse.
 */
function locationBlock() {
  if (!emergency.latitude || !emergency.longitude) return '';

  return `
    <section class="panel page__section" aria-labelledby="ubicacion-title">
      <div class="panel__head">
        <h3 id="ubicacion-title" class="panel__title">Ubicacion</h3>
        <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
          ${directionsLinksHtml(emergency.latitude, emergency.longitude)}
          <a class="btn btn--ghost btn--sm" target="_blank" rel="noopener noreferrer"
             href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(emergency.latitude)}&mlon=${encodeURIComponent(emergency.longitude)}#map=17/${encodeURIComponent(emergency.latitude)}/${encodeURIComponent(emergency.longitude)}">
            OpenStreetMap ↗
          </a>
        </div>
      </div>
      <div class="map-mini" id="detail-map"></div>
      <p class="panel__hint">
        ${escapeHtml(emergency.address || 'Sin direccion registrada')}
        ${emergency.accuracy_m ? ` · precision del GPS: ${Math.round(emergency.accuracy_m)} m` : ''}
      </p>
    </section>`;
}

/** Inicializa el mapa una vez que el contenedor ya esta en el documento. */
function mountMiniMap() {
  if (!emergency.latitude || !emergency.longitude) return;
  if (!isLeafletReady() || !document.getElementById('detail-map')) return;

  createMiniMap('detail-map', emergency.latitude, emergency.longitude, emergency);
}

function photosBlock() {
  const attachments = emergency.photos || [];
  if (attachments.length === 0) return '';

  // La nota de voz se guarda en la misma tabla que las fotos (misma fila
  // generica: nombre, ruta, tipo MIME). El tipo MIME es lo unico que dice
  // cual es cual a la hora de mostrarla.
  const images = attachments.filter((item) => !item.mime_type?.startsWith('audio/'));
  const audioNotes = attachments.filter((item) => item.mime_type?.startsWith('audio/'));

  return `
    ${images.length > 0 ? `
      <section class="panel page__section" aria-labelledby="fotos-title">
        <div class="panel__head">
          <h3 id="fotos-title" class="panel__title">Fotografias (${images.length})</h3>
        </div>
        <div class="photo-grid">
          ${images.map((photo) => `
            <div class="photo-grid__item" data-photo="${escapeHtml(photo.file_path)}">
              <img src="${escapeHtml(photo.file_path)}" alt="Fotografia de la emergencia" loading="lazy">
            </div>`).join('')}
        </div>
      </section>` : ''}

    ${audioNotes.map((audio) => `
      <section class="panel page__section" aria-labelledby="audio-title">
        <div class="panel__head">
          <h3 id="audio-title" class="panel__title">🎙️ Nota de voz</h3>
        </div>
        <audio controls style="width: 100%;" src="${escapeHtml(audio.file_path)}"></audio>
      </section>`).join('')}`;
}

function timelineBlock() {
  const history = emergency.history || [];

  return `
    <section class="panel page__section" aria-labelledby="historial-title">
      <div class="panel__head">
        <h3 id="historial-title" class="panel__title">Historial</h3>
        ${session.isControlRoom() || session.isResponder()
          ? '<button type="button" class="btn btn--ghost btn--sm" data-action="comment">Registrar avance</button>'
          : ''}
      </div>

      ${history.length === 0
        ? '<p class="text-muted">Sin movimientos registrados.</p>'
        : `<div class="timeline">
            ${history.map((entry) => `
              <article class="timeline__item" data-action="${escapeHtml(entry.action)}">
                <span class="timeline__dot" aria-hidden="true"></span>
                <div class="timeline__head">
                  <span class="timeline__action">${escapeHtml(entry.action.replace(/_/g, ' '))}</span>
                  <span class="timeline__time" title="${escapeHtml(formatDateTime(entry.created_at))}">
                    ${escapeHtml(formatDateTime(entry.created_at))}
                  </span>
                </div>
                <p class="timeline__text">${escapeHtml(entry.description)}</p>
                <p class="timeline__author">${escapeHtml(entry.user_name)}${entry.user_role ? ` · ${escapeHtml(entry.user_role)}` : ''}</p>
              </article>`).join('')}
          </div>`}
    </section>`;
}

function assignmentsBlock() {
  const assignments = emergency.assignments || [];
  const active = assignments.filter((item) => item.status !== 'CANCELADO');
  const canManage = session.isControlRoom();

  return `
    <section class="panel page__section" aria-labelledby="personal-title">
      <div class="panel__head">
        <h3 id="personal-title" class="panel__title">Personal asignado</h3>
        ${canManage && !emergency.status_is_final
          ? '<button type="button" class="btn btn--ghost btn--sm" data-action="assign">Asignar</button>'
          : ''}
      </div>

      ${active.length === 0
        ? '<p class="text-muted">Todavia no hay personal asignado.</p>'
        : assignments.map((item) => `
            <div class="assignment ${item.status === 'CANCELADO' ? 'is-cancelled' : ''}">
              <span class="avatar avatar--sm" aria-hidden="true">${escapeHtml(initials(item.responder_name))}</span>
              <div class="assignment__body">
                <p class="assignment__unit">${escapeHtml(item.unit_code)}</p>
                <p class="assignment__name">
                  ${escapeHtml(item.responder_name)} · ${escapeHtml(item.responder_type)}
                </p>
              </div>
              <div class="data-list__aside">
                <span class="badge badge--neutral">${escapeHtml(item.status.replace(/_/g, ' ').toLowerCase())}</span>
                ${canManage && item.status !== 'CANCELADO' && !emergency.status_is_final
                  ? `<button type="button" class="btn-icon" data-action="unassign"
                       data-assignment="${item.id}" title="Retirar ${escapeHtml(item.unit_code)}"
                       aria-label="Retirar ${escapeHtml(item.unit_code)}">✕</button>`
                  : ''}
              </div>
            </div>`).join('')}
    </section>`;
}

/** Una burbuja del chat. */
function messageBubble(item) {
  const mine = item.sender_id === currentUser.id;
  return `
    <div class="chat__msg ${mine ? 'is-mine' : ''}">
      <p class="chat__author">${escapeHtml(item.sender_name || 'Alguien')}${item.sender_role_code ? ` · ${escapeHtml(item.sender_role_code)}` : ''}</p>
      <p class="chat__text">${escapeHtml(item.message)}</p>
      <p class="chat__time">${escapeHtml(formatDateTime(item.created_at))}</p>
    </div>`;
}

/**
 * Chat interno entre el centro de control y el personal asignado.
 * El ciudadano no lo ve: ni la ruta se lo permite, ni esta funcion se llama
 * para su rol (session.isControlRoom() || session.isResponder() en render()).
 */
function chatBlock() {
  return `
    <section class="panel page__section" aria-labelledby="chat-title">
      <div class="panel__head">
        <h3 id="chat-title" class="panel__title">Chat con el personal</h3>
      </div>

      <div class="chat" id="chat-messages">
        ${messages.length === 0
          ? '<p class="text-muted" style="padding: var(--space-3) 0;">Sin mensajes todavia.</p>'
          : messages.map(messageBubble).join('')}
      </div>

      <form class="chat__form" id="chat-form">
        <input class="input" id="chat-input" name="message" placeholder="Escribe un mensaje…"
               maxlength="1000" autocomplete="off" required>
        <button type="submit" class="btn btn--primary btn--sm">Enviar</button>
      </form>
    </section>`;
}

/** Baja el chat hasta el ultimo mensaje. */
function scrollChatToBottom() {
  const box = $('#chat-messages');
  if (box) box.scrollTop = box.scrollHeight;
}

/** Seguimiento por pasos, pensado para el ciudadano. */
function trackerBlock() {
  const steps = [
    { label: 'Reportada', done: true },
    { label: 'Recibida en el centro de control', done: true },
    { label: 'Personal asignado', done: Boolean(emergency.assigned_at) },
    { label: 'En proceso', done: Boolean(emergency.in_progress_at) },
    { label: 'Resuelta', done: Boolean(emergency.resolved_at) },
  ];

  // El primer paso sin completar es el actual.
  const currentIndex = steps.findIndex((step) => !step.done);

  return `
    <section class="panel page__section" aria-labelledby="seguimiento-title">
      <div class="panel__head">
        <h3 id="seguimiento-title" class="panel__title">Seguimiento</h3>
      </div>
      <div class="tracker">
        ${steps.map((step, index) => {
          const state = step.done ? 'is-done' : index === currentIndex ? 'is-current' : 'is-pending';
          const mark = step.done ? '✓' : index === currentIndex ? '●' : '○';
          return `
            <div class="tracker__step ${state}">
              <span class="tracker__mark" aria-hidden="true">${mark}</span>
              <span class="tracker__label">${escapeHtml(step.label)}</span>
            </div>`;
        }).join('')}
      </div>
    </section>`;
}

/* ==========================================================================
   Pintado
   ========================================================================== */

function render() {
  const isCitizen = session.isCitizen();
  const canChat = session.isControlRoom() || session.isResponder();

  $('#detail-root').innerHTML = `
    ${headerBlock()}
    <div class="detail-grid">
      <div>
        ${infoBlock()}
        ${locationBlock()}
        ${photosBlock()}
        ${timelineBlock()}
      </div>
      <div>
        ${isCitizen ? trackerBlock() : ''}
        ${assignmentsBlock()}
        ${canChat ? chatBlock() : ''}
      </div>
    </div>`;

  // El mapa se monta despues de insertar el HTML: Leaflet necesita el
  // contenedor ya presente en el documento y con altura.
  mountMiniMap();
  if (canChat) scrollChatToBottom();

  setSubtitle(`${emergency.code} · ${emergency.status_name}`);
  document.title = `${emergency.code} · Emergency Response System`;
}

/* ==========================================================================
   Acciones
   ========================================================================== */

/** Recarga la emergencia desde la API y vuelve a pintar. */
async function reload() {
  emergency = await api.get(`/emergencies/${emergencyId}`);

  // El chat es un endpoint aparte (el ciudadano nunca lo pide): se trae solo
  // para quien de verdad lo va a ver.
  if (session.isControlRoom() || session.isResponder()) {
    try {
      messages = await api.get(`/emergencies/${emergencyId}/messages`);
    } catch {
      messages = [];
    }
  }

  render();
}

/** Envia un mensaje del chat. */
async function sendChatMessage(input) {
  const text = input.value.trim();
  if (!text) return;

  input.disabled = true;

  try {
    const message = await api.post(`/emergencies/${emergencyId}/messages`, { message: text });
    messages.push(message);
    input.value = '';

    const box = $('#chat-messages');
    if (box) {
      if (messages.length === 1) box.innerHTML = '';
      box.insertAdjacentHTML('beforeend', messageBubble(message));
      scrollChatToBottom();
    }
  } catch (error) {
    notifyApiError(error, 'No se pudo enviar el mensaje');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

/** Cambia el estado. Resolver y cancelar piden un texto obligatorio. */
async function changeStatus(newStatus) {
  const LABELS = { EN_PROCESO: 'en proceso', RESUELTO: 'resuelta', CANCELADO: 'cancelada' };

  if (newStatus === 'RESUELTO') {
    const data = await formModal({
      title: 'Resolver emergencia',
      submitLabel: 'Resolver',
      formHtml: `
        <div class="field">
          <label class="field__label" for="notes">Notas de cierre <span class="required">*</span></label>
          <textarea class="textarea" id="notes" name="notes" required
            placeholder="Que se hizo, en que estado quedo la situacion…"></textarea>
          <p class="field__hint">Queda en el historial y lo ve el ciudadano.</p>
        </div>`,
      onSubmit: async (values) => {
        if (!values.notes || values.notes.trim().length < 5) {
          throw { errors: [{ field: 'notes', message: 'Describe brevemente como se resolvio' }] };
        }
        await api.patch(`/emergencies/${emergencyId}/status`, {
          status: 'RESUELTO',
          notes: values.notes.trim(),
        });
      },
    });

    if (data) {
      notify.success('Emergencia resuelta');
      await reload();
    }
    return;
  }

  if (newStatus === 'CANCELADO') {
    const data = await formModal({
      title: 'Cancelar emergencia',
      submitLabel: 'Cancelar emergencia',
      formHtml: `
        <div class="field">
          <label class="field__label" for="reason">Motivo de la cancelacion <span class="required">*</span></label>
          <textarea class="textarea" id="reason" name="reason" required
            placeholder="Falsa alarma, duplicada, no corresponde…"></textarea>
        </div>`,
      onSubmit: async (values) => {
        if (!values.reason || values.reason.trim().length < 5) {
          throw { errors: [{ field: 'reason', message: 'Indica el motivo de la cancelacion' }] };
        }
        await api.patch(`/emergencies/${emergencyId}/status`, {
          status: 'CANCELADO',
          reason: values.reason.trim(),
        });
      },
    });

    if (data) {
      notify.success('Emergencia cancelada');
      await reload();
    }
    return;
  }

  // EN_PROCESO: basta con confirmar.
  const confirmed = await confirmDialog({
    title: 'Cambiar estado',
    message: `La emergencia ${emergency.code} pasara a estar ${LABELS[newStatus] || newStatus}.`,
    confirmLabel: 'Confirmar',
  });

  if (!confirmed) return;

  try {
    await api.patch(`/emergencies/${emergencyId}/status`, { status: newStatus });
    notify.success('Estado actualizado');
    await reload();
  } catch (error) {
    notifyApiError(error, 'No se pudo cambiar el estado');
  }
}

/** Cambia la prioridad. */
async function changePriority() {
  const priorities = await api.get('/catalogs/priorities');

  const options = priorities
    .map((priority) => `
      <label class="unit-option">
        <input type="radio" name="priority" value="${priority.code}"
               ${priority.code === emergency.priority_code ? 'checked' : ''}>
        <span class="unit-option__body">
          <strong>${escapeHtml(priority.name)}</strong>
          <span class="unit-option__distance">Objetivo de respuesta: ${priority.target_minutes} min</span>
        </span>
      </label>`)
    .join('');

  const data = await formModal({
    title: 'Cambiar prioridad',
    submitLabel: 'Guardar',
    formHtml: `<div class="unit-picker">${options}</div>`,
    onSubmit: async (values) => {
      if (!values.priority) {
        throw { errors: [{ field: 'priority', message: 'Selecciona una prioridad' }] };
      }
      if (values.priority === emergency.priority_code) {
        throw { message: 'Esa ya es la prioridad actual' };
      }
      await api.patch(`/emergencies/${emergencyId}/priority`, { priority: values.priority });
    },
  });

  if (data) {
    notify.success('Prioridad actualizada');
    await reload();
  }
}

/**
 * Asigna personal.
 * Se piden las unidades disponibles ordenadas por cercania al incidente, para
 * que el operador no tenga que calcular a ojo cual esta mas cerca.
 */
async function assignPersonnel() {
  let units;

  try {
    units = await api.get('/responders/available', {
      lat: emergency.latitude,
      lng: emergency.longitude,
      limit: 20,
    });
  } catch (error) {
    notifyApiError(error, 'No se pudieron cargar las unidades disponibles');
    return;
  }

  if (units.length === 0) {
    modal({
      title: 'Sin unidades disponibles',
      size: 'sm',
      content: `<p class="modal__text">
        No hay personal DISPONIBLE en este momento. Libera alguna unidad o
        espera a que termine su emergencia actual.</p>`,
      actions: [{ label: 'Entendido', variant: 'primary' }],
    });
    return;
  }

  const alreadyAssigned = new Set(
    (emergency.assignments || [])
      .filter((item) => item.status !== 'CANCELADO')
      .map((item) => item.responder_id)
  );

  const options = units
    .map((unit) => {
      const distance = unit.distance_km !== null && unit.distance_km !== undefined
        ? `a ${unit.distance_km.toFixed(1)} km`
        : 'sin posicion conocida';
      const isAssigned = alreadyAssigned.has(unit.id);

      return `
        <label class="unit-option" ${isAssigned ? 'style="opacity:.5"' : ''}>
          <input type="checkbox" name="responderIds" value="${unit.id}" ${isAssigned ? 'disabled' : ''}>
          <span class="unit-option__body">
            <strong>${escapeHtml(unit.unit_code)} · ${escapeHtml(unit.full_name)}</strong><br>
            <span class="unit-option__distance">
              ${escapeHtml(unit.responder_type)} · ${escapeHtml(distance)}
              ${isAssigned ? ' · ya asignada' : ''}
            </span>
          </span>
        </label>`;
    })
    .join('');

  const form = document.createElement('form');
  form.className = 'form';
  form.innerHTML = `
    <p class="text-muted" style="font-size: var(--text-sm); margin-bottom: var(--space-3);">
      Ordenadas por cercania a ${escapeHtml(emergency.address || 'la emergencia')}.
    </p>
    <div class="unit-picker">${options}</div>`;

  const instance = modal({
    title: 'Asignar personal',
    size: 'md',
    content: form,
    actions: [
      { label: 'Cancelar', variant: 'ghost' },
      {
        label: 'Asignar',
        variant: 'primary',
        closeOnClick: false,
        onClick: async () => {
          const selected = Array.from(
            form.querySelectorAll('input[name="responderIds"]:checked')
          ).map((input) => Number.parseInt(input.value, 10));

          if (selected.length === 0) {
            notify.warning('Selecciona al menos una unidad');
            return false;
          }

          try {
            await api.post(`/emergencies/${emergencyId}/assign`, { responderIds: selected });
            notify.success(`${selected.length} unidad(es) asignada(s)`);
            instance.close();
            await reload();
            return true;
          } catch (error) {
            notifyApiError(error, 'No se pudo asignar el personal');
            return false;
          }
        },
      },
    ],
  });
}

/** Retira una unidad. */
async function unassign(assignmentId, button) {
  const confirmed = await confirmDialog({
    title: 'Retirar unidad',
    message: 'La unidad quedara libre para otra emergencia. Quedara registrado en el historial.',
    confirmLabel: 'Retirar',
    variant: 'danger',
  });

  if (!confirmed) return;

  const restore = busyButton(button, '');

  try {
    await api.delete(`/emergencies/${emergencyId}/assign/${assignmentId}`);
    notify.success('Unidad retirada');
    await reload();
  } catch (error) {
    restore();
    notifyApiError(error, 'No se pudo retirar la unidad');
  }
}

/** Registra un avance en la linea de tiempo. */
async function addComment() {
  const data = await formModal({
    title: 'Registrar avance',
    submitLabel: 'Registrar',
    formHtml: `
      <div class="field">
        <label class="field__label" for="text">Que ha ocurrido <span class="required">*</span></label>
        <textarea class="textarea" id="text" name="text" required
          placeholder="Personal en camino, se requiere apoyo adicional…"></textarea>
        <p class="field__hint">Minimo 3 caracteres. Queda en el historial.</p>
      </div>`,
    onSubmit: async (values) => {
      await api.post(`/emergencies/${emergencyId}/comments`, { text: (values.text || '').trim() });
    },
  });

  if (data) {
    notify.success('Avance registrado');
    await reload();
  }
}

/** Abre una fotografia a tamano completo. */
function openPhoto(path) {
  modal({
    title: 'Fotografia',
    size: 'lg',
    content: `<img src="${escapeHtml(path)}" alt="Fotografia de la emergencia" class="photo-full">`,
    actions: [{ label: 'Cerrar', variant: 'ghost' }],
  });
}

/* ==========================================================================
   Eventos de la pagina
   ========================================================================== */

function setupActions() {
  // Un solo escucha para toda la pagina: el contenido se repinta entero en
  // cada recarga, asi que enganchar los botones uno a uno los perderia.
  $('#detail-root').addEventListener('click', (event) => {
    const photo = event.target.closest('[data-photo]');
    if (photo) return openPhoto(photo.dataset.photo);

    const button = event.target.closest('[data-action]');
    if (!button) return;

    switch (button.dataset.action) {
      case 'status':
        return changeStatus(button.dataset.status);
      case 'priority':
        return changePriority();
      case 'assign':
        return assignPersonnel();
      case 'unassign':
        return unassign(button.dataset.assignment, button);
      case 'comment':
        return addComment();
      default:
        return undefined;
    }
  });

  $('#detail-root').addEventListener('submit', (event) => {
    if (event.target.id !== 'chat-form') return;
    event.preventDefault();
    sendChatMessage($('#chat-input', event.target));
  });
}

/**
 * Tiempo real: la pagina se suscribe a ESTA emergencia y se repinta cuando
 * cambia, aunque el cambio lo haga otro operador desde otro equipo.
 */
async function setupRealtime() {
  const result = await realtime.subscribeToEmergency(emergencyId);
  if (!result.ok) {
    console.warn('No se pudo seguir la emergencia en vivo:', result.message);
  }

  const refresh = async (payload) => {
    if (payload && Number(payload.id) !== emergencyId) return;
    await reload();
  };

  [
    SOCKET_EVENTS.EMERGENCY_STATUS,
    SOCKET_EVENTS.EMERGENCY_ASSIGNED,
    SOCKET_EVENTS.EMERGENCY_UPDATE,
  ].forEach((event) => realtime.on(event, refresh));

  // El chat se pinta aparte, sin recargar toda la pantalla: perderia el texto
  // que el otro lado esta escribiendo si cada mensaje disparara un reload.
  realtime.on(SOCKET_EVENTS.EMERGENCY_MESSAGE, (message) => {
    if (Number(message.emergency_id) !== emergencyId) return;
    // El propio mensaje ya se pinto al enviarlo (sendChatMessage).
    if (message.sender_id === currentUser.id) return;

    messages.push(message);
    const box = $('#chat-messages');
    if (box) {
      if (messages.length === 1) box.innerHTML = '';
      box.insertAdjacentHTML('beforeend', messageBubble(message));
      scrollChatToBottom();
    }
  });

  // Al salir de la pagina se deja de seguir, para no recibir eventos inutiles.
  window.addEventListener('beforeunload', () => {
    realtime.unsubscribeFromEmergency(emergencyId);
  });
}

/* -------------------------------------------------------------------------- */

function renderError(message, description = '') {
  $('#detail-root').innerHTML = `
    <div class="panel">
      <div class="table-message table-message--error">
        <span class="table-message__icon" aria-hidden="true">⚠</span>
        <p class="table-message__title">${escapeHtml(message)}</p>
        ${description ? `<p class="table-message__text">${escapeHtml(description)}</p>` : ''}
        <a href="${ROUTES.emergencies}" class="btn btn--ghost btn--sm" style="margin-top: var(--space-3);">
          Volver al listado
        </a>
      </div>
    </div>`;
}

async function init() {
  currentUser = await requireAuth();
  if (!currentUser) return;

  await mountLayout({ user: currentUser, title: 'Detalle de emergencia' });

  if (Number.isNaN(emergencyId)) {
    renderError('Falta el identificador de la emergencia', 'Abre una emergencia desde el listado.');
    return;
  }

  setupActions();

  try {
    await reload();
    await setupRealtime();
  } catch (error) {
    if (error.status === 404) {
      renderError('La emergencia no existe', 'Puede que haya sido eliminada.');
    } else if (error.status === 403) {
      renderError('No tienes permiso para ver esta emergencia',
        'Solo puedes consultar las que reportaste o tienes asignadas.');
    } else {
      renderError('No se pudo cargar la emergencia', error.message);
    }
  }
}

init();
