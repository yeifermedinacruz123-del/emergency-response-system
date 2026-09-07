/**
 * contacts.js - Contactos de confianza del ciudadano.
 *
 * Se avisan por correo cuando el ciudadano activa el SOS (backend:
 * contact.service.js). Vive en la PWA, no en el panel, porque el SOS
 * tambien vive aqui.
 */

import { initMobilePage } from './app.js';
import { api } from '../core/api.js';
import { $, escapeHtml } from '../core/utils.js';
import { notify, notifyApiError, confirmDialog, busyButton, showFormErrors } from '../core/ui.js';

const MAX_CONTACTS = 3;

async function loadContacts() {
  const list = $('#list');
  list.innerHTML = '<p class="text-muted" style="padding: var(--space-4) 0;">Cargando…</p>';

  try {
    const contacts = await api.get('/contacts');
    renderContacts(contacts);
  } catch (error) {
    list.innerHTML = '';
    notifyApiError(error, 'No se pudieron cargar tus contactos');
  }
}

function renderContacts(contacts) {
  const list = $('#list');
  const formSection = $('#form-section');

  if (contacts.length === 0) {
    list.innerHTML = `
      <div class="m-empty" style="padding: var(--space-6) 0;">
        <span class="m-empty__icon" aria-hidden="true">👥</span>
        <p class="m-empty__title">Sin contactos todavia</p>
        <p class="m-empty__text">Agrega hasta ${MAX_CONTACTS} personas que quieras avisar en un SOS.</p>
      </div>`;
  } else {
    list.innerHTML = contacts.map((contact) => `
      <div class="m-card" style="margin-bottom: var(--space-3);">
        <p class="m-card__title">${escapeHtml(contact.full_name)}</p>
        <div class="m-card__meta">
          <span>${escapeHtml(contact.email)}</span>
          ${contact.phone ? `<span>· ${escapeHtml(contact.phone)}</span>` : ''}
        </div>
        <button type="button" class="btn btn--ghost btn--sm" data-remove="${contact.id}"
                style="margin-top: var(--space-3);">
          Eliminar
        </button>
      </div>`).join('');
  }

  // Sin espacio libre, se oculta el formulario en vez de dejar que el
  // backend rechace un cuarto contacto.
  formSection.hidden = contacts.length >= MAX_CONTACTS;
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = $('#contact-form');
  const submitButton = $('#btn-submit');
  const restore = busyButton(submitButton, 'Agregando…');

  const data = {
    fullName: $('#fullName').value.trim(),
    email: $('#email').value.trim(),
    phone: $('#phone').value.trim() || undefined,
  };

  try {
    await api.post('/contacts', data);
    notify.success('Contacto agregado');
    form.reset();
    await loadContacts();
  } catch (error) {
    if (error.status === 422 && error.errors) {
      showFormErrors(form, error);
    } else {
      notifyApiError(error, 'No se pudo agregar el contacto');
    }
  } finally {
    restore();
  }
}

async function handleRemove(id) {
  const confirmed = await confirmDialog({
    title: 'Eliminar contacto',
    message: 'Ya no se le avisara si activas el SOS.',
    confirmLabel: 'Eliminar',
    variant: 'danger',
  });
  if (!confirmed) return;

  try {
    await api.delete(`/contacts/${id}`);
    notify.success('Contacto eliminado');
    await loadContacts();
  } catch (error) {
    notifyApiError(error, 'No se pudo eliminar el contacto');
  }
}

async function init() {
  const user = await initMobilePage({ realtime: false });
  if (!user) return;

  $('#btn-back').addEventListener('click', () => window.location.href = '/app/index.html');
  $('#contact-form').addEventListener('submit', handleSubmit);
  $('#list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove]');
    if (button) handleRemove(button.dataset.remove);
  });

  await loadContacts();
}

init();
