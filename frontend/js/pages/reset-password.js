/**
 * reset-password.js - Cambia la contrasena a partir del enlace del correo.
 */

import { api } from '../core/api.js';
import { $, getParam, validators } from '../core/utils.js';
import { busyButton, notify } from '../core/ui.js';
import { CONFIG } from '../core/config.js';

const form = $('#reset-form');
const newPasswordInput = $('#newPassword');
const confirmPasswordInput = $('#confirmPassword');
const submitButton = $('#btn-submit');
const alertBox = $('#alert');
const alertText = $('#alert-text');

const token = getParam('token');

function showAlert(message) {
  alertText.textContent = message;
  alertBox.classList.add('is-visible');
}

function validate() {
  if (!validators.password(newPasswordInput.value)) {
    showAlert('La contrasena debe tener al menos 8 caracteres, con mayuscula, minuscula y numero.');
    return false;
  }
  if (newPasswordInput.value !== confirmPasswordInput.value) {
    showAlert('Las dos contrasenas no coinciden.');
    return false;
  }
  return true;
}

async function handleSubmit(event) {
  event.preventDefault();
  alertBox.classList.remove('is-visible');

  if (!validate()) return;

  const restore = busyButton(submitButton, 'Guardando…');

  try {
    await api.post('/auth/reset-password', { token, newPassword: newPasswordInput.value });
    notify.success('Contrasena actualizada. Ya puedes iniciar sesion.', 6000);
    window.location.href = CONFIG.routes.login;
  } catch (error) {
    restore();
    showAlert(error.message || 'No se pudo conectar con el servidor.');
  }
}

function init() {
  if (!token) {
    showAlert('Este enlace no es valido. Pide uno nuevo desde "Olvidaste tu contrasena".');
    form.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
    return;
  }

  form.addEventListener('submit', handleSubmit);
}

init();
