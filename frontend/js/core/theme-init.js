/**
 * theme-init.js - Aplica el tema guardado (o el del sistema) antes de pintar.
 *
 * Se carga como script clasico, sin type="module", para poder ejecutarse
 * antes de las hojas de estilo y evitar el parpadeo de tema. No puede ir
 * inline en el <head>: la Content-Security-Policy del servidor
 * (script-src 'self', sin 'unsafe-inline') bloquea cualquier script inline.
 * Un archivo servido desde el mismo origen si esta permitido.
 */
(function () {
  var saved = localStorage.getItem('ers.theme');
  var theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
})();
