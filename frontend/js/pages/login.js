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

/**
 * ?next= puede venir de requireAuth. Solo se acepta una ruta de este mismo
 * sitio: si se admitiera cualquier URL, un enlace malicioso podria mandar al
 * usuario a otro sitio despues de iniciar sesion (open redirect).
 *
 * Se resuelve con URL y se compara el origen, en vez de mirar si empieza por
 * "/": el navegador trata "/\otro-sitio.com" como "//otro-sitio.com", y esa
 * comprobacion lo dejaba pasar.
 *
 * @returns {string|null} Ruta interna segura, o null.
 */
function safeNext(next) {
  if (!next) return null;
  try {
    const target = new URL(next, window.location.origin);
    if (target.origin !== window.location.origin) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

/** Envio del formulario. */
async function handleSubmit(event) {
  event.preventDefault();
  hideAlert();

  if (!validate()) return;

  const restore = busyButton(submitButton, 'Entrando…');

  try {
    const user = await login(emailInput.value.trim(), passwordInput.value);

    window.location.href = safeNext(getParam('next')) || homeForRole(user.role_code);
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

  // api.js manda aqui con ?expired=1 cuando la sesion ya no se pudo renovar:
  // sin este aviso, el usuario aparecia en el login sin saber por que.
  if (getParam('expired') === '1') {
    showAlert('Tu sesion expiro. Inicia sesion de nuevo para continuar.');
  }

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
