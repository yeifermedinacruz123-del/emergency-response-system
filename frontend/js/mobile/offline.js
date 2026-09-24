/**
 * offline.js - Pantalla "Sin conexion" de la PWA.
 *
 * Va en un archivo aparte y no dentro del HTML: la politica de seguridad
 * (CSP) del servidor no permite scripts en linea, y con el codigo dentro de
 * la pagina el boton "Reintentar" no hacia nada.
 *
 * Sin modulos ni dependencias: esta pagina debe funcionar cuando todo lo
 * demas ha fallado.
 */

(function () {
  'use strict';

  function retry() {
    window.location.reload();
  }

  var button = document.getElementById('btn-retry');
  if (button) button.addEventListener('click', retry);

  // En cuanto vuelva la red, se recarga sola.
  window.addEventListener('online', retry);
})();
