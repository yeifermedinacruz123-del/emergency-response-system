/**
 * ui.js - Piezas de interfaz compartidas: avisos, modales y estados de carga.
 *
 * Se centralizan aqui para que un error se vea igual en todas las pantallas y
 * para no repetir el mismo HTML de modal en cada pagina.
 */

import { $, el, escapeHtml } from './utils.js';

/* ==========================================================================
   Avisos (toasts)
   ========================================================================== */

const TOAST_ICONS = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

/** Contenedor de avisos, creado la primera vez que se necesita. */
function toastContainer() {
  let container = $('#toast-container');
  if (!container) {
    container = el('div', { id: 'toast-container', class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Muestra un aviso temporal.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration ms. 0 = no se cierra solo.
 */
export function toast(message, type = 'info', duration = 4000) {
  const node = el('div', { class: `toast toast--${type}`, role: 'alert' }, [
    el('span', { class: 'toast__icon', 'aria-hidden': 'true', text: TOAST_ICONS[type] || TOAST_ICONS.info }),
    el('p', { class: 'toast__message', text: message }),
    el('button', {
      class: 'toast__close',
      type: 'button',
      'aria-label': 'Cerrar aviso',
      text: '×',
      onclick: () => dismiss(),
    }),
  ]);

  function dismiss() {
    node.classList.add('toast--leaving');
    node.addEventListener('animationend', () => node.remove(), { once: true });
    // Respaldo por si la animacion no llega a dispararse.
    setTimeout(() => node.remove(), 400);
  }

  toastContainer().appendChild(node);
  if (duration > 0) setTimeout(dismiss, duration);

  return dismiss;
}

export const notify = {
  success: (message, duration) => toast(message, 'success', duration),
  error: (message, duration) => toast(message, 'error', duration ?? 6000),
  warning: (message, duration) => toast(message, 'warning', duration),
  info: (message, duration) => toast(message, 'info', duration),
};

/**
 * Traduce un error de la API a un aviso entendible.
 * Si el error trae detalle por campo, se muestra el primero: es el que el
 * usuario tiene que corregir.
 */
export function notifyApiError(error, fallback = 'Ocurrio un error inesperado') {
  if (!error) return notify.error(fallback);

  if (Array.isArray(error.errors) && error.errors.length > 0) {
    return notify.error(error.errors[0].message || error.message || fallback);
  }

  return notify.error(error.message || fallback);
}

/* ==========================================================================
   Modales
   ========================================================================== */

/** Modal abierto, para poder cerrarlo con Escape. */
let openModal = null;

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && openModal) openModal.close();
});

/**
 * Abre un modal.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string|Node} options.content  HTML o nodo. Si es texto, se inserta
 *        tal cual: SOLO se debe pasar HTML construido por la aplicacion, nunca
 *        texto escrito por un usuario sin escapar.
 * @param {Array} [options.actions]  [{ label, variant, onClick, closeOnClick }]
 * @param {string} [options.size]    'sm' | 'md' | 'lg'
 * @returns {{close: Function, element: HTMLElement}}
 */
export function modal({ title, content, actions = [], size = 'md', onClose } = {}) {
  const body = el('div', { class: 'modal__body' });
  if (content instanceof Node) body.appendChild(content);
  else body.innerHTML = content || '';

  const footer = el('div', { class: 'modal__footer' });

  const dialog = el('div', {
    class: `modal modal--${size}`,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title || 'Ventana',
  }, [
    el('header', { class: 'modal__header' }, [
      el('h2', { class: 'modal__title', text: title || '' }),
      el('button', {
        class: 'modal__close',
        type: 'button',
        'aria-label': 'Cerrar',
        text: '×',
        onclick: () => close(),
      }),
    ]),
    body,
    footer,
  ]);

  const overlay = el('div', { class: 'modal-overlay' }, [dialog]);

  // Clic fuera del cuadro = cerrar.
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) close();
  });

  actions.forEach((action) => {
    footer.appendChild(
      el('button', {
        type: 'button',
        class: `btn btn--${action.variant || 'ghost'}`,
        text: action.label,
        onclick: async (event) => {
          const button = event.currentTarget;
          if (action.onClick) {
            button.disabled = true;
            try {
              const result = await action.onClick();
              if (result === false) return; // el manejador cancelo el cierre
            } finally {
              button.disabled = false;
            }
          }
          if (action.closeOnClick !== false) close();
        },
      })
    );
  });

  if (actions.length === 0) footer.remove();

  function close() {
    overlay.classList.add('modal-overlay--leaving');
    setTimeout(() => {
      overlay.remove();
      document.body.classList.remove('has-modal');
      if (openModal && openModal.element === overlay) openModal = null;
      if (onClose) onClose();
    }, 150);
  }

  document.body.appendChild(overlay);
  document.body.classList.add('has-modal');
  openModal = { close, element: overlay };

  // Foco al primer control, para poder usar el modal con el teclado.
  const focusable = dialog.querySelector('input, select, textarea, button');
  if (focusable) focusable.focus();

  return { close, element: dialog, body };
}

/**
 * Pregunta de confirmacion.
 * @returns {Promise<boolean>} true si el usuario confirmo.
 */
export function confirmDialog({
  title = 'Confirmar accion',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'primary',
} = {}) {
  return new Promise((resolve) => {
    let answered = false;

    modal({
      title,
      size: 'sm',
      content: `<p class="modal__text">${escapeHtml(message)}</p>`,
      actions: [
        {
          label: cancelLabel,
          variant: 'ghost',
          onClick: () => {
            answered = true;
            resolve(false);
          },
        },
        {
          label: confirmLabel,
          variant,
          onClick: () => {
            answered = true;
            resolve(true);
          },
        },
      ],
      onClose: () => {
        // Cerrar con Escape o clic fuera equivale a cancelar.
        if (!answered) resolve(false);
      },
    });
  });
}

/**
 * Modal con un formulario. Devuelve los datos o null si se cancelo.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.formHtml  HTML del formulario (sin la etiqueta form)
 * @param {Function} [options.onSubmit] Recibe los datos; puede lanzar para
 *        mantener el modal abierto y mostrar el error.
 */
export function formModal({ title, formHtml, submitLabel = 'Guardar', size = 'md', onSubmit }) {
  return new Promise((resolve) => {
    const form = el('form', { class: 'form', novalidate: 'true' });
    form.innerHTML = formHtml;

    let answered = false;

    const instance = modal({
      title,
      size,
      content: form,
      actions: [
        {
          label: 'Cancelar',
          variant: 'ghost',
          onClick: () => {
            answered = true;
            resolve(null);
          },
        },
        {
          label: submitLabel,
          variant: 'primary',
          closeOnClick: false,
          onClick: async () => {
            const data = Object.fromEntries(new FormData(form).entries());

            if (onSubmit) {
              try {
                await onSubmit(data, form);
              } catch (error) {
                showFormErrors(form, error);
                return false;
              }
            }

            answered = true;
            resolve(data);
            instance.close();
            return true;
          },
        },
      ],
      onClose: () => {
        if (!answered) resolve(null);
      },
    });

    // Enter dentro del formulario equivale a pulsar Guardar.
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const submitButton = instance.element.querySelector('.modal__footer .btn--primary');
      if (submitButton) submitButton.click();
    });
  });
}

/**
 * Pinta los errores de la API debajo de cada campo del formulario.
 * Requiere que cada input tenga un name igual al "field" que devuelve la API.
 */
export function showFormErrors(form, error) {
  form.querySelectorAll('.field__error').forEach((node) => node.remove());
  form.querySelectorAll('.is-invalid').forEach((node) => node.classList.remove('is-invalid'));

  const errors = Array.isArray(error?.errors) ? error.errors : [];

  if (errors.length === 0) {
    notifyApiError(error);
    return;
  }

  let firstInvalid = null;

  errors.forEach((item) => {
    const input = form.querySelector(`[name="${item.field}"]`);
    if (!input) return;

    input.classList.add('is-invalid');
    if (!firstInvalid) firstInvalid = input;

    const message = el('p', { class: 'field__error', text: item.message });
    (input.closest('.field') || input.parentElement).appendChild(message);
  });

  // Errores que no corresponden a ningun campo visible: se avisan aparte.
  const unmatched = errors.filter((item) => !form.querySelector(`[name="${item.field}"]`));
  if (unmatched.length > 0) notify.error(unmatched[0].message);

  if (firstInvalid) firstInvalid.focus();
}

/* ==========================================================================
   Estados de carga y vacio
   ========================================================================== */

/** Marca un boton como "trabajando" y devuelve la funcion para restaurarlo. */
export function busyButton(button, label = 'Procesando…') {
  const original = button.innerHTML;
  const wasDisabled = button.disabled;

  button.disabled = true;
  button.innerHTML = `<span class="spinner spinner--inline" aria-hidden="true"></span> ${escapeHtml(label)}`;

  return () => {
    button.innerHTML = original;
    button.disabled = wasDisabled;
  };
}

/** Fila de tabla que ocupa todo el ancho, para cargando / vacio / error. */
export function tableMessage(columns, { icon = '', title, description = '', variant = 'empty' }) {
  return `
    <tr class="table__message-row">
      <td colspan="${columns}">
        <div class="table-message table-message--${variant}">
          ${icon ? `<span class="table-message__icon" aria-hidden="true">${icon}</span>` : ''}
          <p class="table-message__title">${escapeHtml(title)}</p>
          ${description ? `<p class="table-message__text">${escapeHtml(description)}</p>` : ''}
        </div>
      </td>
    </tr>`;
}

/** Fila de "cargando" con el mismo ancho que la tabla. */
export function tableLoading(columns, text = 'Cargando…') {
  return `
    <tr class="table__message-row">
      <td colspan="${columns}">
        <div class="table-message">
          <span class="spinner" aria-hidden="true"></span>
          <p class="table-message__text">${escapeHtml(text)}</p>
        </div>
      </td>
    </tr>`;
}

export default { toast, notify, notifyApiError, modal, confirmDialog, formModal, showFormErrors };
