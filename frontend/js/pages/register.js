/**
 * register.js - Alta de una cuenta ciudadana.
 *
 * El registro publico crea SIEMPRE un ciudadano: el rol no se envia ni se
 * puede elegir. Los demas roles solo los crea un administrador desde
 * /api/users, y esa regla la impone el backend, no esta pagina.
 *
 * Al terminar, el servidor ya devuelve la sesion iniciada, asi que se entra
 * directo a la aplicacion en lugar de pedir el correo otra vez.
 */

import { register, redirectIfAuthenticated, homeForRole } from '../core/auth.js';
import { $, $$, validators } from '../core/utils.js';
import { busyButton } from '../core/ui.js';

const form = $('#register-form');
const submitButton = $('#btn-submit');
const alertBox = $('#alert');
const alertText = $('#alert-text');

const passwordInput = $('#password');
const confirmInput = $('#passwordConfirm');

/* --------------------------------------------------------------------------
 *  Mensajes de error
 * ------------------------------------------------------------------------ */

function showAlert(message) {
  alertText.textContent = message;
  alertBox.classList.add('is-visible');
  alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideAlert() {
  alertBox.classList.remove('is-visible');
}

function setFieldError(input, message) {
  input.classList.add('is-invalid');
  const field = input.closest('.field');
  if (!field.querySelector('.field__error')) {
    const error = document.createElement('p');
    error.className = 'field__error';
    error.textContent = message;
    field.appendChild(error);
  }
}

function clearFieldErrors() {
  form.querySelectorAll('.is-invalid').forEach((node) => node.classList.remove('is-invalid'));
  form.querySelectorAll('.field__error').forEach((node) => node.remove());
}

/* --------------------------------------------------------------------------
 *  Validacion en el cliente
 * ------------------------------------------------------------------------ */

/**
 * Las mismas reglas que aplica el backend en `common.validator`. Se repiten
 * aqui a proposito para no gastar una peticion en lo que ya se ve, pero la
 * palabra final siempre la tiene el servidor: si las dos versiones dejaran de
 * coincidir, gana la suya y su mensaje se pinta igualmente sobre el campo.
 */
function validate() {
  clearFieldErrors();
  let valid = true;

  const required = [
    ['#firstName', 'El nombre es obligatorio'],
    ['#lastName', 'El apellido es obligatorio'],
    ['#documentNumber', 'El numero de documento es obligatorio'],
    ['#email', 'El correo es obligatorio'],
    ['#password', 'La contrasena es obligatoria'],
  ];

  required.forEach(([selector, message]) => {
    const input = $(selector);
    if (!input.value.trim()) {
      setFieldError(input, message);
      valid = false;
    }
  });

  const email = $('#email');
  if (email.value.trim() && !validators.email(email.value.trim())) {
    setFieldError(email, 'El correo no tiene un formato valido');
    valid = false;
  }

  const document_ = $('#documentNumber');
  if (document_.value.trim() && !/^[A-Za-z0-9-]{5,20}$/.test(document_.value.trim())) {
    setFieldError(document_, 'Entre 5 y 20 caracteres: letras, numeros y guiones');
    valid = false;
  }

  const phone = $('#phone');
  if (phone.value.trim() && !validators.phone(phone.value.trim())) {
    setFieldError(phone, 'El telefono no tiene un formato valido');
    valid = false;
  }

  // El backend exige mayuscula, minuscula y numero. `validators.password` solo
  // comprueba letra y numero, asi que la mayuscula se revisa aparte.
  if (passwordInput.value) {
    if (passwordInput.value.length < 8) {
      setFieldError(passwordInput, 'La contrasena debe tener al menos 8 caracteres');
      valid = false;
    } else if (!/[a-z]/.test(passwordInput.value)) {
      setFieldError(passwordInput, 'Debe incluir al menos una letra minuscula');
      valid = false;
    } else if (!/[A-Z]/.test(passwordInput.value)) {
      setFieldError(passwordInput, 'Debe incluir al menos una letra mayuscula');
      valid = false;
    } else if (!/\d/.test(passwordInput.value)) {
      setFieldError(passwordInput, 'Debe incluir al menos un numero');
      valid = false;
    }
  }

  if (passwordInput.value !== confirmInput.value) {
    setFieldError(confirmInput, 'Las dos contrasenas no coinciden');
    valid = false;
  }

  return valid;
}

/* --------------------------------------------------------------------------
 *  Envio
 * ------------------------------------------------------------------------ */

async function handleSubmit(event) {
  event.preventDefault();
  hideAlert();

  if (!validate()) return;

  const restore = busyButton(submitButton, 'Creando la cuenta…');

  // Los opcionales vacios no se envian: el validador del backend los acepta
  // ausentes, pero rechaza una cadena vacia como telefono.
  const payload = {
    firstName: $('#firstName').value.trim(),
    lastName: $('#lastName').value.trim(),
    documentType: $('#documentType').value,
    documentNumber: $('#documentNumber').value.trim(),
    email: $('#email').value.trim(),
    password: passwordInput.value,
  };

  const phone = $('#phone').value.trim();
  const address = $('#address').value.trim();
  if (phone) payload.phone = phone;
  if (address) payload.address = address;

  try {
    const user = await register(payload);
    window.location.href = homeForRole(user.role_code);
  } catch (error) {
    restore();

    if (error.status === 409) {
      // Correo o documento ya registrados: el backend dice cual en `errors`.
      if (error.errors?.length) {
        error.errors.forEach((item) => {
          const input = form.querySelector(`[name="${item.field}"]`);
          if (input) setFieldError(input, item.message);
        });
        showAlert(error.message);
      } else {
        showAlert(error.message || 'Ya existe una cuenta con esos datos.');
      }
    } else if (error.status === 422 && error.errors?.length) {
      error.errors.forEach((item) => {
        const input = form.querySelector(`[name="${item.field}"]`);
        if (input) setFieldError(input, item.message);
      });
      showAlert('Revisa los campos marcados.');
    } else if (error.status === 429) {
      showAlert('Demasiados intentos. Espera unos minutos antes de volver a probar.');
    } else {
      showAlert(error.message || 'No se pudo conectar con el servidor.');
    }
  }
}

/* -------------------------------------------------------------------------- */

function init() {
  // Con sesion abierta esta pagina no tiene sentido.
  if (redirectIfAuthenticated()) return;

  form.addEventListener('submit', handleSubmit);

  // Al escribir se limpia el error de ese campo: mantenerlo confunde.
  $$('.input, .select', form).forEach((input) => {
    input.addEventListener('input', () => {
      input.classList.remove('is-invalid');
      const error = input.closest('.field').querySelector('.field__error');
      if (error) error.remove();
      hideAlert();
    });
  });
}

init();
