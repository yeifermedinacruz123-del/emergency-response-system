/**
 * forgot-password.js - Pide el enlace de recuperacion.
 *
 * La respuesta es siempre el mismo mensaje, exista o no la cuenta (lo decide
 * el backend): si dijera "ese correo no existe" regalaria una lista de
 * correos validos a quien probara al azar.
 */

import { api } from '../core/api.js';
import { $, validators } from '../core/utils.js';
import { busyButton } from '../core/ui.js';

const form = $('#forgot-form');
const emailInput = $('#email');
const submitButton = $('#btn-submit');
const alertBox = $('#alert');
const alertText = $('#alert-text');
const successBox = $('#success');
const successText = $('#success-text');

function showAlert(message) {
  successBox.classList.remove('is-visible');
  alertText.textContent = message;
  alertBox.classList.add('is-visible');
}

function showSuccess(message) {
  alertBox.classList.remove('is-visible');
  successText.textContent = message;
  successBox.classList.add('is-visible');
}

async function handleSubmit(event) {
  event.preventDefault();
  alertBox.classList.remove('is-visible');

  const email = emailInput.value.trim();
  if (!validators.email(email)) {
    showAlert('Escribe un correo electronico valido.');
    return;
  }

  const restore = busyButton(submitButton, 'Enviando…');

  try {
    const result = await api.post('/auth/forgot-password', { email });
    showSuccess(result.message || 'Si el correo esta registrado, te enviamos un enlace.');
    form.reset();
  } catch (error) {
    restore();
    showAlert(error.message || 'No se pudo conectar con el servidor.');
  }
}

form.addEventListener('submit', handleSubmit);
