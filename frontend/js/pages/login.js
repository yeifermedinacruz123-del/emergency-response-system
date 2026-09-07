/**
 * login.js - Pagina de acceso.
 *
 * Al entrar correctamente lleva al usuario a la pagina que corresponde a su
 * rol, o de vuelta a donde intentaba ir antes de que se le pidiera la sesion
 * (parametro ?next=).
 */

import { login, redirectIfAuthenticated, homeForRole } from '../core/auth.js';
import { $, getParam, validators } from '../core/utils.js';
import { busyButton } from '../core/ui.js';

/*
 * Aqui habia una lista de accesos de demostracion que rellenaba el formulario
 * con un clic. Se retiro: mostrar correos y contrasenas validos en la propia
 * pantalla de acceso es justo lo que un sistema de emergencias no debe hacer,
 * aunque solo se vieran en desarrollo.
 *
 * Esos accesos siguen disponibles para las pruebas, pero fuera de la vista de
 * cualquiera que abra la pagina: el administrador los descarga desde
 * Usuarios -> "Excel de accesos".
 */

const form = $('#login-form');
const emailInput = $('#email');
const passwordInput = $('#password');
const submitButton = $('#btn-submit');
const alertBox = $('#alert');
const alertText = $('#alert-text');

/** Muestra un error sobre el formulario. */
function showAlert(message) {
  alertText.textContent = message;
  alertBox.classList.add('is-visible');
}

function hideAlert() {
  alertBox.classList.remove('is-visible');
}

/** Marca un campo como invalido y coloca el mensaje debajo. */
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

/** Validacion en el cliente, para no gastar una peticion en lo evidente. */
function validate() {
  clearFieldErrors();
  let valid = true;

  if (!emailInput.value.trim()) {
    setFieldError(emailInput, 'El correo es obligatorio');
    valid = false;
  } else if (!validators.email(emailInput.value.trim())) {
    setFieldError(emailInput, 'El correo no tiene un formato valido');
    valid = false;
  }

  if (!passwordInput.value) {
    setFieldError(passwordInput, 'La contrasena es obligatoria');
    valid = false;
  }

  return valid;
}

/** Envio del formulario. */
async function handleSubmit(event) {
  event.preventDefault();
  hideAlert();

  if (!validate()) return;

  const restore = busyButton(submitButton, 'Entrando…');

  try {
    const user = await login(emailInput.value.trim(), passwordInput.value);

    /*
     * ?next= puede venir de requireAuth. Solo se acepta una ruta interna:
     * si se admitiera cualquier URL, un enlace malicioso podria mandar al
     * usuario a otro sitio despues de iniciar sesion (open redirect).
     */
    const next = getParam('next');
    const isInternal = next && next.startsWith('/') && !next.startsWith('//');

    window.location.href = isInternal ? next : homeForRole(user.role_code);
  } catch (error) {
    restore();

    if (error.status === 401) {
      showAlert('Correo o contrasena incorrectos.');
      passwordInput.value = '';
      passwordInput.focus();
    } else if (error.status === 403) {
      showAlert(error.message || 'Tu cuenta esta desactivada.');
    } else if (error.status === 429) {
      showAlert('Demasiados intentos. Espera unos minutos antes de volver a probar.');
    } else if (error.status === 422 && error.errors?.length) {
      error.errors.forEach((item) => {
        const input = form.querySelector(`[name="${item.field}"]`);
        if (input) setFieldError(input, item.message);
      });
    } else {
      showAlert(error.message || 'No se pudo conectar con el servidor.');
    }
  }
}

/* -------------------------------------------------------------------------- */

function init() {
  // Si ya hay sesion, esta pagina no tiene sentido.
  if (redirectIfAuthenticated()) return;

  form.addEventListener('submit', handleSubmit);

  // Al escribir se limpia el error anterior: no tiene sentido mantenerlo.
  [emailInput, passwordInput].forEach((input) => {
    input.addEventListener('input', () => {
      input.classList.remove('is-invalid');
      const error = input.closest('.field').querySelector('.field__error');
      if (error) error.remove();
      hideAlert();
    });
  });
}

init();
