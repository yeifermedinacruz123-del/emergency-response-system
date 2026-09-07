/**
 * geo.js - Ubicacion del usuario, con la explicacion delante.
 *
 * LO PRIMERO QUE HAY QUE SABER
 * ----------------------------
 * Una pagina web NO puede abrir la ventana de permiso del navegador cuando le
 * apetezca. Esa ventana la saca el navegador, sola, y solo en un caso: cuando
 * el permiso esta "por preguntar" y la pagina llama a getCurrentPosition().
 *
 *   - Si el usuario ya dijo que NO, no vuelve a aparecer por mucho que se
 *     insista. Hay que cambiarlo a mano en los ajustes del sitio.
 *   - Si la pagina no esta en contexto seguro (HTTPS o localhost), el
 *     navegador deniega el permiso el solo y tampoco pregunta nada.
 *
 * Por eso este modulo no intenta forzar la ventana del navegador: averigua en
 * cual de los tres casos esta y, cuando no hay ventana que mostrar, abre una
 * propia con los pasos exactos para arreglarlo. Un mensaje generico del tipo
 * "activa el permiso en los ajustes" no sirve: en el caso del contexto no
 * seguro, ese ajuste NO EXISTE y manda al usuario a buscar algo que no va a
 * encontrar.
 */

import { modal } from './ui.js';

/* --------------------------------------------------------------------------
 *  Diagnostico
 * ------------------------------------------------------------------------ */

/**
 * Estado del permiso segun el navegador.
 * @returns {Promise<'granted'|'prompt'|'denied'|'unknown'>}
 */
export async function permissionState() {
  if (!navigator.permissions?.query) return 'unknown';

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    // Safari antiguo no admite 'geolocation' en la Permissions API.
    return 'unknown';
  }
}

/**
 * Por que no se va a poder pedir la ubicacion, si es que no se va a poder.
 * @returns {Promise<{ok: boolean, code?: string}>}
 */
export async function checkLocationSupport() {
  if (!('geolocation' in navigator)) return { ok: false, code: 'UNSUPPORTED' };

  /*
   * Contexto seguro = HTTPS o localhost. Se comprueba ANTES de llamar al GPS
   * porque en este caso la llamada devuelve el mismo error que un rechazo del
   * usuario (codigo 1), y confundir los dos casos es justo lo que lleva a dar
   * instrucciones inutiles.
   */
  if (!window.isSecureContext) return { ok: false, code: 'INSECURE' };

  if ((await permissionState()) === 'denied') return { ok: false, code: 'DENIED' };

  return { ok: true };
}

/* --------------------------------------------------------------------------
 *  Lectura del GPS
 * ------------------------------------------------------------------------ */

/** Mensajes de error, compartidos por todas las salidas del GPS. */
const GPS_MESSAGES = {
  UNSUPPORTED: 'Este navegador no puede obtener tu ubicacion.',
  INSECURE: 'Esta direccion no permite usar el GPS.',
  DENIED: 'El permiso de ubicacion esta bloqueado.',
  UNAVAILABLE: 'No se pudo determinar tu ubicacion. Comprueba que el GPS este encendido.',
  TIMEOUT: 'La ubicacion tardo demasiado. Sal a un lugar despejado e intentalo de nuevo.',
};

/**
 * A partir de cuantos metros una lectura deja de servir para mandar una unidad.
 *
 * No es un numero caprichoso: Android, cuando el permiso de ubicacion esta en
 * modo "aproximada", devuelve SIEMPRE una posicion de unos 2000 m de error, la
 * misma una y otra vez. Cualquier cosa por encima de este umbral significa que
 * la lectura no viene del GPS sino de la antena o del Wi-Fi, y con ese margen
 * la ambulancia se va a otro barrio.
 */
export const COARSE_ACCURACY_M = 150;

/** ¿Esta lectura es tan imprecisa que hay que avisar al usuario? */
export function isCoarse(accuracy) {
  return typeof accuracy === 'number' && accuracy > COARSE_ACCURACY_M;
}

/**
 * Pide la posicion al navegador. Nivel bajo: no muestra nada por pantalla.
 *
 * POR QUE NO ES UN getCurrentPosition Y YA
 * ----------------------------------------
 * En un telefono la primera lectura casi nunca viene del GPS. El sistema
 * responde de inmediato con lo que tiene a mano —la antena de telefonia o las
 * redes Wi-Fi de alrededor—, y eso ubica al usuario con un error de cientos de
 * metros o de kilometros enteros. El chip GPS necesita unos segundos mas para
 * fijar los satelites, y solo entonces la lectura baja a unos pocos metros.
 *
 * Por eso aqui no se toma la primera respuesta: se abre `watchPosition`, que
 * va entregando lecturas cada vez mejores, se guarda siempre la mas precisa y
 * se corta en cuanto llega a `desiredAccuracy` o se agota el tiempo. Si el
 * tiempo se acaba antes, se devuelve la mejor lectura conseguida, nunca la
 * primera.
 *
 * `maximumAge: 0` es igual de importante: sin eso el navegador puede devolver
 * una posicion guardada de hace un rato —de otro barrio, si el usuario se
 * movio— sin llegar a encender el GPS.
 *
 * @param {object} [options]
 * @param {number} [options.timeout=15000] Tiempo maximo total, en ms.
 * @param {boolean} [options.highAccuracy=true] Pedir el chip GPS, no la red.
 * @param {number} [options.desiredAccuracy=20] Metros a partir de los cuales
 *   la lectura ya se considera buena y se deja de esperar.
 * @param {Function} [options.onProgress] Se llama con cada lectura mejor que
 *   la anterior, para poder ir mostrando la precision al usuario.
 * @returns {Promise<{ok: boolean, latitude?: number, longitude?: number,
 *                    accuracy?: number, message?: string, code?: string}>}
 */
export function getPosition({
  timeout = 15000,
  highAccuracy = true,
  desiredAccuracy = 20,
  onProgress,
} = {}) {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ ok: false, code: 'UNSUPPORTED', message: GPS_MESSAGES.UNSUPPORTED });
      return;
    }

    let best = null;
    let watchId = null;
    let timer = null;
    let done = false;

    /** Cierra el watcher una sola vez y entrega el resultado. */
    function finish(result) {
      if (done) return;
      done = true;

      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (timer !== null) clearTimeout(timer);

      resolve(result);
    }

    /** La mejor lectura conseguida, o el error correspondiente si no hubo. */
    function finishWithBest(fallbackCode) {
      if (best) {
        finish({
          ok: true,
          latitude: best.coords.latitude,
          longitude: best.coords.longitude,
          accuracy: best.coords.accuracy,
        });
        return;
      }

      finish({
        ok: false,
        code: fallbackCode,
        message: GPS_MESSAGES[fallbackCode] || 'No se pudo obtener tu ubicacion.',
      });
    }

    // Tope absoluto: pasado este tiempo se entrega lo mejor que haya llegado.
    timer = setTimeout(() => finishWithBest('TIMEOUT'), timeout);

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        // Solo interesa si mejora lo que ya se tenia: el sistema tambien
        // manda lecturas peores cuando pierde satelites.
        if (best && position.coords.accuracy >= best.coords.accuracy) return;

        best = position;
        onProgress?.(position.coords.accuracy);

        // Ya es suficientemente buena: no tiene sentido hacer esperar mas.
        if (position.coords.accuracy <= desiredAccuracy) finishWithBest('TIMEOUT');
      },
      (error) => {
        // El codigo 1 significa "denegado", pero no dice por quien: puede ser
        // el usuario o el propio navegador por el origen inseguro.
        const denied = error.code === 1;
        const code = denied && !window.isSecureContext
          ? 'INSECURE'
          : ['UNSUPPORTED', 'DENIED', 'UNAVAILABLE', 'TIMEOUT'][error.code] || 'ERROR';

        // Un permiso denegado no se arregla esperando: se corta ya. Los otros
        // fallos son pasajeros (tunel, GPS frio), asi que si ya habia una
        // lectura buena se aprovecha en lugar de tirarla.
        if (code === 'DENIED' || code === 'INSECURE') {
          finish({ ok: false, code, message: GPS_MESSAGES[code] });
          return;
        }

        finishWithBest(code);
      },
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: 0 }
    );
  });
}

/* --------------------------------------------------------------------------
 *  La ventana con los pasos
 * ------------------------------------------------------------------------ */

/** Lista de pasos numerados. */
function steps(items) {
  return `<ol class="steps">${items.map((item) => `<li>${item}</li>`).join('')}</ol>`;
}

/**
 * La misma pagina, pero en el puerto HTTPS del servidor.
 *
 * Es la salida del caso INSECURE: el backend levanta HTTPS en 4443 con un
 * certificado propio (backend/scripts/make-cert.js), y en HTTPS el navegador
 * si pide el permiso de ubicacion.
 */
const HTTPS_PORT = 4443;

function secureUrl() {
  const { hostname, pathname, search } = window.location;
  return `https://${hostname}:${HTTPS_PORT}${pathname}${search}`;
}

/**
 * Texto de cada situacion.
 * Se separa del resto para que se lea de un vistazo que ve el usuario en cada
 * caso, que es lo que de verdad importa aqui.
 */
function guideFor(code) {
  switch (code) {
    /*
     * El caso mas confuso de los tres: el usuario no ha denegado nada, pero el
     * navegador responde "denegado" igual. Pasa al abrir la aplicacion por la
     * IP de la red local, que es como se prueba en un telefono sin cable.
     */
    case 'INSECURE':
      return {
        title: 'El GPS no funciona en esta direccion',
        content: `
          <p class="modal__lead">
            No es culpa tuya ni hace falta que cambies ningun ajuste: el
            navegador <strong>bloquea el GPS</strong> en las direcciones que
            empiezan por <code>http://</code> y un numero, como esta
            (<code>${escapeCode(window.location.host)}</code>).
          </p>
          <p>Solo lo permite en <strong>HTTPS</strong> o en <strong>localhost</strong>.</p>

          <p class="modal__sub">Abre la misma pagina en HTTPS:</p>
          ${steps([
            `Toca este enlace: <a href="${escapeCode(secureUrl())}">${escapeCode(secureUrl())}</a>`,
            'El telefono avisara que el certificado no es de confianza. Es lo esperado: lo firma este mismo proyecto, no una empresa externa.',
            'Entra en <strong>Configuracion avanzada</strong> y pulsa <strong>Continuar</strong>.',
            'Vuelve a intentarlo: ahora si saldra la ventana pidiendote la ubicacion.',
          ])}
          <p class="modal__note">
            Mientras tanto puedes reportar igual: escribe la direccion a mano en
            el formulario y el centro de control la recibira.
          </p>`,
      };

    /*
     * Aqui si fue el usuario. La ventana del navegador ya no vuelve a salir,
     * asi que lo unico util es decirle donde esta el ajuste.
     */
    case 'DENIED':
      return {
        title: 'Diste "Bloquear" a la ubicacion',
        content: `
          <p class="modal__lead">
            El navegador ya no volvera a preguntartelo solo, asi que hay que
            reactivarlo a mano. Son diez segundos.
          </p>

          <p class="modal__sub">En Chrome (Android):</p>
          ${steps([
            'Toca el icono <strong>⚠</strong> o <strong>🔒</strong> que hay a la izquierda de la direccion, arriba.',
            'Entra en <strong>Permisos</strong> (o <strong>Configuracion del sitio</strong>).',
            'Busca <strong>Ubicacion</strong> y cambialo a <strong>Permitir</strong>.',
            'Vuelve aqui y pulsa <strong>Reintentar</strong>.',
          ])}

          <p class="modal__sub">En Safari (iPhone):</p>
          ${steps([
            'Abre <strong>Ajustes</strong> → <strong>Safari</strong> → <strong>Ubicacion</strong>.',
            'Elige <strong>Preguntar</strong> o <strong>Permitir</strong>.',
            'Comprueba tambien <strong>Ajustes</strong> → <strong>Privacidad</strong> → <strong>Localizacion</strong>.',
          ])}`,
      };

    /*
     * El permiso esta concedido y el GPS responde, pero con un error enorme y
     * SIEMPRE el mismo. Es el modo "ubicacion aproximada" de Android: el
     * sistema entrega a proposito una posicion difuminada de la zona, sin
     * encender el chip GPS. El usuario no tiene forma de adivinarlo —la app
     * dice que todo fue bien— asi que hay que nombrarlo.
     */
    case 'COARSE':
      return {
        title: 'Tu telefono esta dando una ubicacion aproximada',
        content: `
          <p class="modal__lead">
            La ubicacion llego, pero con un error de <strong>cientos o miles de
            metros</strong>: no viene del GPS, sino de la antena de telefonia.
            Con ese margen la unidad no llega a tu puerta.
          </p>
          <p>
            Casi siempre es un ajuste del telefono, no de esta aplicacion:
            Android tiene un modo de <strong>ubicacion aproximada</strong> que
            difumina la posicion a proposito.
          </p>

          <p class="modal__sub">En Android (el ajuste que suele faltar):</p>
          ${steps([
            'Abre <strong>Ajustes</strong> → <strong>Aplicaciones</strong> → <strong>Chrome</strong> → <strong>Permisos</strong> → <strong>Ubicacion</strong>.',
            'Activa <strong>Usar ubicacion precisa</strong> (o <strong>Ubicacion exacta</strong>). Si esta en <strong>Aproximada</strong>, ese es el problema.',
            'Vuelve a <strong>Ajustes</strong> → <strong>Ubicacion</strong> y comprueba que este encendida y en modo <strong>Alta precision</strong>.',
            'Sal al exterior o acercate a una ventana: bajo techo el GPS no ve satelites.',
            'Vuelve a pedir la ubicacion desde la aplicacion.',
          ])}
          <p class="modal__note">
            Si estas bajo techo y la cifra no baja de 50 m, es normal: el GPS
            necesita cielo abierto. A la intemperie deberia quedar en 5-15 m.
          </p>`,
      };

    case 'UNAVAILABLE':
      return {
        title: 'No se encuentra tu ubicacion',
        content: `
          <p class="modal__lead">
            El permiso esta bien, pero el telefono no consigue fijar la posicion.
          </p>
          ${steps([
            'Comprueba que el <strong>GPS</strong> del telefono este encendido.',
            'Sal al exterior o acercate a una ventana: bajo techo la senal se pierde.',
            'Espera unos segundos y pulsa <strong>Reintentar</strong>.',
          ])}`,
      };

    case 'TIMEOUT':
      return {
        title: 'La ubicacion tardo demasiado',
        content: `
          <p class="modal__lead">
            El telefono no respondio a tiempo. Suele pasar dentro de edificios.
          </p>
          ${steps([
            'Acercate a una ventana o sal al exterior.',
            'Pulsa <strong>Reintentar</strong>.',
          ])}`,
      };

    case 'UNSUPPORTED':
      return {
        title: 'Este navegador no puede darnos tu ubicacion',
        content: `
          <p class="modal__lead">
            No admite la funcion de geolocalizacion. Prueba con Chrome, Edge,
            Firefox o Safari actualizados.
          </p>
          <p class="modal__note">
            Puedes reportar igualmente escribiendo la direccion a mano.
          </p>`,
      };

    default:
      return {
        title: 'No se pudo obtener tu ubicacion',
        content: `
          <p class="modal__lead">
            Ha ocurrido un problema inesperado al leer el GPS.
          </p>
          ${steps(['Comprueba que el GPS este encendido.', 'Pulsa <strong>Reintentar</strong>.'])}`,
      };
  }
}

/** Escapa lo poco que se interpola en el HTML de la ventana. */
function escapeCode(value) {
  return String(value).replace(/[&<>"]/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]
  ));
}

/**
 * Abre la ventana explicativa del problema.
 *
 * @param {string} code Codigo devuelto por getPosition o checkLocationSupport.
 * @param {Function} [onRetry] Si se pasa, se anade un boton "Reintentar".
 */
export function explainLocationProblem(code, onRetry) {
  const guide = guideFor(code);
  const actions = [];

  // Reintentar no tiene sentido si el origen no es seguro: el resultado va a
  // ser exactamente el mismo mientras no se cambie de direccion.
  if (onRetry && code !== 'INSECURE' && code !== 'UNSUPPORTED') {
    actions.push({ label: 'Reintentar', variant: 'primary', onClick: onRetry });
  }

  actions.push({ label: 'Entendido', variant: 'ghost' });

  return modal({ title: guide.title, content: guide.content, actions, size: 'md' });
}

/* --------------------------------------------------------------------------
 *  API principal
 * ------------------------------------------------------------------------ */

/**
 * Pide la ubicacion y, si no se puede, explica por que con pasos concretos.
 *
 * Cuando el permiso esta "por preguntar" NO se antepone ninguna ventana
 * propia: la del navegador sale sola y anadir una antes solo mete un toque de
 * mas. Eso importa sobre todo en el SOS, donde cada segundo cuenta.
 *
 * @param {object} [options]
 * @param {boolean} [options.explain=true] Mostrar la ventana de ayuda al fallar.
 * @param {Function} [options.onRetry] Que hacer al pulsar "Reintentar".
 * @returns {Promise<object>} El mismo objeto que getPosition.
 */
export async function askForLocation({
  explain = true,
  onRetry,
  timeout = 15000,
  highAccuracy = true,
  desiredAccuracy = 20,
  onProgress,
} = {}) {
  // Los casos que se saben de antemano se resuelven sin llamar al GPS: llamar
  // solo para recibir el error que ya se conoce anade una espera inutil.
  const support = await checkLocationSupport();

  if (!support.ok) {
    if (explain) explainLocationProblem(support.code, onRetry);
    return { ok: false, code: support.code, message: guideFor(support.code).title };
  }

  const result = await getPosition({ timeout, highAccuracy, desiredAccuracy, onProgress });

  if (!result.ok && explain) explainLocationProblem(result.code, onRetry);

  return result;
}

export default { askForLocation, getPosition, permissionState, checkLocationSupport };
