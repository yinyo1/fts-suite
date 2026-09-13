/* ═══ Machote · la hoja ═══
 *
 * Reescrito el 2026-09-03 para que la pantalla se parezca al libro de Excel
 * en vez de a un formulario. La retícula de abajo es la del machote real,
 * verificada en cinco cotizaciones de 2026 (SO11737, SO11738, SO11790,
 * SO11836 y el USD de calbee): mismos encabezados, mismas doce filas de mano
 * de obra, mismos bloques y en el mismo orden.
 *
 * Ninguna vista calcula. Todo número sale de MachoteCalc.
 *
 * Rutas:  #/  lista · #/nuevo  crear · #/m/:id  el libro
 *         #/rev/:id  revisión · #/ap/:id  aprobación · #/control  tablero
 *
 * `#/orden/:id` se retiró en V1.25 con `vOrden` (ver más abajo, y
 * `docs/comercial/ANDAMIO.md`). Un hash desconocido cae al `#/` de `render()`.
 */
(function (G) {
  'use strict';

  // El gate de `shared/auth-jwt.js` corre antes, en el <head>. Si negó el paso
  // ya disparó la navegación al login, pero un `throw` suyo NO detiene a este
  // script: sin esta línea, el libro alcanza a pintarse mientras el navegador
  // se va. La marca es la que de verdad lo impide.
  if (G.__ftsSinAcceso) return;

  const C = G.MachoteCalc, R = G.REGLAS, D = G.DEMO;

  /* Versión visible en pantalla.
   *
   * Esquema: `V<mayor>.<menor de dos dígitos>`. **Un incremento de 0.01 por
   * cada merge a `main`.** Al pasar de `.99` sube el mayor y el menor vuelve
   * a `00` (V1.99 → V2.00).
   *
   * Sirve para una cosa concreta: abrir la página y saber de un vistazo si lo
   * que ves es lo último o el caché del navegador. Sin esto, "ya lo cambié" y
   * "yo no lo veo" no se distinguen sin abrir las herramientas de desarrollo.
   *
   * ⚠️ Vive aquí y en `version.json`, y hay una prueba que falla si se
   * separan: una pantalla que miente sobre su versión es peor que no tener
   * indicador.
   *
   * ⚠️ El CONTADOR es de ESTE módulo: `finanzas` también usa V1.xx desde el
   * 2026-09-03 (por instrucción de Esteban), pero lleva el suyo aparte y va en
   * V1.00. Planeación sigue en `2.4.1` y el kiosko sólo con cadena de build;
   * a esos no se propaga. */
  /* ── La versión, que ya no se puede AFIRMAR: se LEE ──────────────────
   *
   * Antes era una constante suelta, y una constante suelta describe el archivo
   * que la contiene — no el juego de archivos que el navegador acabó cargando.
   * Con `max-age=600` y sin versión en la URL (medido el 10-sep, ejecución
   * 94341) cada archivo se cacheaba por su cuenta, así que se podía correr
   * `app.js` de una versión con `calc.js` de otra y el pie describía la mitad.
   *
   * Ahora hay tres lecturas y las tres tienen que coincidir:
   *   1. la constante de ESTE archivo,
   *   2. el `?v=` de la URL con la que el navegador lo bajó,
   *   3. la que declara cada pieza que se carga aparte (hoy el motor).
   * Si discrepan, la pantalla lo DICE en vez de correr a medias. */
  const VERSION_ARCHIVO = 'V1.28';

  const VERSION_URL = (function () {
    try {
      const src = (document.currentScript && document.currentScript.src) || '';
      const m = src.match(/[?&]v=([^&]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  })();

  /* Las piezas que se cargan por separado y declaran la suya. Se listan por
   * NOMBRE DE ARCHIVO porque el aviso lo va a leer una persona, no un log. */
  const PIEZAS = { 'calc.js': (C && C.VERSION) || null };

  const MEZCLA = (function () {
    const out = [];
    if (VERSION_URL && VERSION_URL !== VERSION_ARCHIVO) {
      out.push('app.js se pidió como ' + VERSION_URL + ' y el archivo dice ' + VERSION_ARCHIVO);
    }
    Object.keys(PIEZAS).forEach(function (k) {
      if (PIEZAS[k] && PIEZAS[k] !== VERSION_ARCHIVO) {
        out.push(k + ' es ' + PIEZAS[k] + ' y app.js es ' + VERSION_ARCHIVO);
      }
    });
    return out;
  })();

  const VERSION = MEZCLA.length ? (VERSION_ARCHIVO + ' ⚠ mezcla') : VERSION_ARCHIVO;

  /* Para `shared/version-check.js` (el del kiosko, adoptado tal cual): compara
   * esto contra `version.json` y recarga una vez si el navegador quedó atrás.
   * Se publica lo que DE VERDAD corre, no lo que se pidió. */
  G.MACHOTE_BUILD = VERSION_ARCHIVO;
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const clon = (x) => JSON.parse(JSON.stringify(x));

  const A = G.MachoteAlmacen;

  /* Lo guardado manda sobre los datos de ejemplo. Si el almacen esta vacio o
   * corrupto se arranca con la demo, que es lo que espera quien abre la pagina
   * por primera vez. */
  const _guardado = A ? A.leer() : null;

  /* ── V1.27 · LOS EJEMPLOS SALEN DE LA LISTA ──────────────────────────────
   *
   * Se conservaban para el navegador nuevo. Ese caso ya no existe: las cinco
   * personas del módulo tienen trabajo real, y lo que los ejemplos producen
   * hoy es daño. Van TRES veces:
   *
   *   Esteban   8-sep  → M-1041…M-1044 en producción (borrados después)
   *   Ricardo   8-sep  → los mismos cuatro otra vez (borrados después)
   *   Montalvo 10-sep  → otra vez, y estos siguen vivos: quemaron los folios
   *                      COT-0009 a COT-0012
   *
   * El mecanismo no es un descuido, es el diseño: `tocado()` le quita el
   * `_demo` en cuanto alguien teclea encima —a propósito, para no atrapar
   * trabajo real dentro de un ejemplo—. Así que basta con ABRIR un ejemplo y
   * escribir algo para convertirlo en una cotización que sube. Y los ejemplos
   * salían al entrar, o sea que el camino estaba servido.
   *
   * La marca `_demo` y el candado de `empujar` se QUEDAN: son defensa en
   * profundidad para lo que ya esté guardado en algún navegador. Lo que se
   * retira es la puerta.
   *
   * `D.MACHOTES` sigue exportado: lo usan las pruebas y los ejemplos del
   * pegado. Lo que deja de hacer es sembrar la pantalla. */
  const _limpiado = (function () {
    if (!_guardado || !Array.isArray(_guardado.machotes)) return null;
    /* Se quitan SÓLO los que siguen marcados como ejemplo, o sea los que
     * nadie tocó. En cuanto alguien escribió encima dejaron de ser ejemplo y
     * son trabajo suyo — eso NO se borra, ni aquí ni en ningún lado. */
    const sinDemo = _guardado.machotes.filter(m => !(m && m._demo === true));
    if (sinDemo.length === _guardado.machotes.length) return _guardado.machotes;
    // Se persiste para que no reaparezcan en la siguiente carga.
    try { if (A) A.escribirLocal({ machotes: sinDemo, handoff: _guardado.handoff || {} }); }
    catch (e) { /* si no se deja escribir, al menos no se pintan */ }
    return sinDemo;
  })();

  const ST = {
    verVacios: false,
    // Por qué cambió cada machote, para el historial. Se vacía al guardar.
    motivos: {},
    machotes: _limpiado || [],
    /* Trabajo de OTRAS personas, en memoria y nada más. Nunca se escribe en
     * `fts_machote_v1`: el respaldo de cada quien lleva lo suyo.
     *
     * V1.24: llega para TODOS. Antes hacía falta `comercial:admin`; hoy
     * cualquiera del módulo ve lo de todos, en lectura. Lo que no cambió es
     * que se abre trabado y no se puede guardar — eso lo decide el servidor
     * por el token, no esta pantalla. */
    ajenos: [],
    /* V1.25: se fueron `ordenes`, `handoff` y `confirmadas`. Sólo existían
     * para `vOrden`, la pantalla de cierre de handoff, que quedó huérfana al
     * retirar la sección «Confirmar la orden» en V1.24 y corría sobre datos
     * de ejemplo. La llave `handoff` del sobre de `fts_machote_v1` SE QUEDA
     * en `almacen.js` a propósito: es formato de almacenamiento ya escrito en
     * los navegadores del equipo, y quitarla de ahí sería reescribirles el
     * archivo para ahorrar un objeto vacío. */
    hoja: 'desglose', simMargen: null,
    busca: '',
    /* Los filtros de la lista (V1.21). Sustituyen al `filtro: 'todos'` de las
     * píldoras, que sólo sabía de estado.
     *
     * `persona` ARRANCA VACÍO — o sea en «Todas las personas» (V1.25).
     * Hasta V1.24 arrancaba en quien entró, que tenía sentido cuando cada
     * quien sólo veía lo suyo. Con la lectura abierta pasó a ser un filtro
     * puesto de fábrica que escondía justo lo que se acababa de abrir: quien
     * entraba veía 2 de 7 y tenía que descubrir el desplegable para ver el
     * resto. Con siete machotes no hay ruido que filtrar; cuando el equipo
     * crezca se revisa.
     *
     * Lo que NO cambia por esto: el encabezado sigue diciendo cuántas son
     * TUYAS, y el respaldo sigue llevándose sólo lo tuyo. Ver `vHome`. */
    filtros: { persona: '', estado: '', moneda: '' },
    // 'limpio' | 'sucio' | 'guardando' | 'guardado' | 'sin-almacen'
    pulso: (A && A.disponible()) ? 'limpio' : 'sin-almacen'
  };

  /* ── Autoguardado ──────────────────────────────────────────────────────
   *
   * No hay boton de guardar y no debe haberlo: un capturista que pierde media
   * hora de trabajo por no haber apretado un boton tiene razon en enojarse.
   *
   * El retardo es a proposito. Escribir en cada tecla pelearia con el teclado;
   * medio segundo despues de la ultima, no. Y en cada salida -cambiar de
   * pantalla, cambiar de pestaña del navegador, cerrar- se fuerza el guardado
   * pendiente, que es el momento en que de verdad se pierde el trabajo. */
  var _reloj = null;

  function pintarPulso() {
    const el = $('#pulso'), tx = $('#pulsoTx');
    if (!el || !tx) return;
    /* 'pendiente' es un estado NUEVO y es el honesto: está en este navegador
     * pero todavía no en el servidor. Antes no existía porque no había
     * servidor; ahora fingir que 'guardado' y 'guardado en el servidor' son
     * lo mismo sería el anti-patrón del kiosko (CLAUDE.md hallazgo #15). */
    const T = { limpio: 'guardado', sucio: 'sin guardar', guardando: 'guardando…',
                guardado: 'guardado', pendiente: 'guardado aquí',
                'sin-almacen': 'sin guardar' };
    el.className = 'pulso p-' + ST.pulso;
    tx.textContent = T[ST.pulso] || '';
    el.title = ST.pulso === 'sin-almacen'
      ? 'Este navegador no deja guardar (modo privado o datos del sitio bloqueados). Lo que captures se pierde al salir.'
      : ST.pulso === 'pendiente'
      ? 'Guardado en este navegador, pero todavía no en el servidor. Se reintenta solo; no cierres sin conexión si puedes evitarlo.'
      : 'Guardado en el servidor.';
  }

  /* El pulso es un punto de color: dice la verdad, pero se puede mirar sin
   * verlo mientras se captura. Cuando el guardado DEJA de funcionar eso no
   * alcanza — a partir de ahí todo lo que se teclee se pierde al cerrar, y
   * quien captura no tiene por qué adivinarlo.
   *
   * Esta barra tapa parte de la pantalla a propósito y no se va sola. Trae el
   * exportar al lado porque avisar sin dar salida es solo asustar. */
  function avisarNoGuarda() {
    if ($('#noGuarda')) return;                       // ya está puesta
    const b = document.createElement('div');
    b.id = 'noGuarda'; b.className = 'nogda';
    b.setAttribute('role', 'alert');
    b.innerHTML =
      '<span><strong>No se está guardando.</strong> Este navegador ya no acepta guardar ' +
      '(modo privado, o se llenó el espacio). Lo que captures se pierde al cerrar.</span>' +
      '<span class="nogda-b"><button class="btn" id="ngExp">Exportar ahora</button>' +
      '<button class="btn fantasma" id="ngX">Entendido</button></span>';
    document.body.appendChild(b);
    $('#ngExp').onclick = () => exportarRespaldo();
    $('#ngX').onclick = () => b.remove();
  }
  function quitarAvisoNoGuarda() { const b = $('#noGuarda'); if (b) b.remove(); }

  /** Guarda ya, sin esperar el retardo.
   *
   *  Devuelve si quedó EN ESTE NAVEGADOR, que es síncrono y es lo que importa
   *  para no perder lo tecleado — por eso `beforeunload` puede seguir
   *  llamándolo y confiar en el valor. La subida al servidor va después y
   *  actualiza el pulso cuando conteste; el pulso NO dice 'guardado' hasta
   *  que el servidor lo confirmó. */
  function guardarYa() {
    if (!A || !A.disponible()) { ST.pulso = 'sin-almacen'; pintarPulso(); pintarPendientes(); avisarNoGuarda(); return false; }
    if (_reloj) { clearTimeout(_reloj); _reloj = null; }
    ST.pulso = 'guardando'; pintarPulso(); pintarPendientes();

    const local = A.escribirLocal({ machotes: ST.machotes });
    if (!local) { ST.pulso = 'sin-almacen'; pintarPulso(); pintarPendientes(); avisarNoGuarda(); return false; }

    /* Lo PRESTADO se guarda en su propio cajón, síncrono y antes de cualquier
     * red — es la promesa que sostiene todo el préstamo: el servidor puede
     * negarse a guardar (permiso vencido, permiso recogido, choque de
     * versión), pero no puede costarle a nadie lo que tecleó. */
    (ST.ajenos || []).forEach(m => {
      if (A.prestadoAMi && A.prestadoAMi(m) && A.guardarPrestadoLocal) A.guardarPrestadoLocal(m);
    });
    quitarAvisoNoGuarda();

    // Ya está a salvo aquí. Lo de arriba fue síncrono a propósito.
    ST.pulso = 'pendiente'; pintarPulso(); pintarPendientes();

    /* Los motivos que esta pantalla tenga anotados —hoy sólo el renombrado—
     * viajan con el empujón: es lo que hace que el historial diga POR QUÉ
     * cambió una versión y no sólo que cambió. Se limpian al salir, hayan
     * subido o no: si el guardado falló, el nombre nuevo sigue local y el
     * siguiente intento lo vuelve a mandar con su motivo. */
    const motivos = ST.motivos; ST.motivos = {};
    A.empujar(ST.machotes, motivos).then(r => {
      if (r && r.ok && r.subidos >= 0) {
        ST.pulso = A.pendientes(ST.machotes) === 0 ? 'guardado' : 'pendiente';
      } else {
        ST.pulso = 'pendiente';
        avisarPendiente(r);
      }
      pintarPulso(); pintarPendientes();
    });

    /* Y los prestados suben por separado: `empujar` recorre `ST.machotes`, que
     * es lo mío, y lo ajeno nunca entra ahí a propósito. */
    empujarPrestados();

    return true;
  }

  /** Sube los machotes prestados que estén abiertos y con permiso vigente.
   *
   *  Va uno por uno y NO se mezcla con `empujar`: son dos contabilidades de
   *  versiones distintas (la libreta para lo mío, el cajón para lo prestado)
   *  y juntarlas es cómo el `M-1041` de Ricardo acabaría pisando el propio. */
  function empujarPrestados() {
    if (!A || !A.empujarUno || !A.prestadoAMi) return;
    const ses = (G.SuiteAuth && G.SuiteAuth.getToken && G.SuiteAuth.getToken()) ? true : false;
    if (!ses) return;
    (ST.ajenos || []).forEach(m => {
      if (!A.prestadoAMi(m)) return;
      A.empujarUno(m, { token: G.SuiteAuth.getToken() },
                   'editado con permiso de ' + (m._dueno_nombre || m._dueno || 'su dueño'))
        .then(r => {
          if (r && r.ok === true) {
            if (A.olvidarPrestado) A.olvidarPrestado(m.id);
            m._sin_subir = false;
            return;
          }
          /* Rechazado. Lo tecleado se queda en el cajón —`empujarPrestado` lo
           * escribe ANTES de llamar al servidor— y se dice con todas sus
           * letras cuál de las tres causas fue. */
          m._sin_subir = true;
          avisarPrestadoRechazado(m, r);
        });
    });
  }

  /* Las tres causas por las que un prestado no se guarda llevan a tres cosas
   * distintas: pedir el permiso otra vez, hablar con el dueño, o volver a
   * abrir el machote. Decirlas con una sola frase manda a la acción
   * equivocada — es la misma lección del historial y de la sesión muerta. */
  let _avisoPrestado = 0;
  function avisarPrestadoRechazado(m, r) {
    const err = (r && r.error) || '';
    /* Sin red no se alarma: eso se reintenta solo y ya lo dice el pulso. */
    if (err === 'SIN_RED' || err === 'SIN_SESION') return;
    const ahora = Date.now();
    if (ahora - _avisoPrestado < 20000) return;
    _avisoPrestado = ahora;

    const viejo = $('#avPrestado'); if (viejo) viejo.remove();
    const b = document.createElement('div');
    b.id = 'avPrestado'; b.className = 'nogda'; b.setAttribute('role', 'alert');
    const cola = ' <strong>Lo que escribiste sigue en este navegador y no se perdió.</strong>';
    b.innerHTML = '<span>' + (
      err === 'PRESTAMO_VENCIDO'
        ? 'Tu permiso sobre «' + esc(m.nombre || 'esa cotización') + '» venció, así que ' +
          'ya no se pudo guardar.' + cola + ' Pídele el permiso de nuevo a ' +
          esc(m._dueno_nombre || m._dueno || 'su dueño') + '.'
      : err === 'PRESTAMO_RECOGIDO'
        ? esc(m._dueno_nombre || m._dueno || 'El dueño') + ' recogió tu permiso sobre «' +
          esc(m.nombre || 'esa cotización') + '», así que ya no se pudo guardar.' + cola
      : err === 'CONFLICTO_DE_VERSION'
        /* V1.27 · CON NOMBRE cuando el servidor lo manda. «Otra persona» es un
         * misterio; «Ricardo Hernández» es una conversación. El servidor lo
         * sabe desde siempre (`machote_version.autor`, del token verificado).
         * Se conserva la frase vieja como respaldo: mientras el cambio del
         * servidor no esté publicado, esto sigue funcionando igual (regla
         * anti-trabón, CLAUDE.md §8 — el lado tolerante va primero). */
        ? esc((r && (r.autor_nombre || r.autor)) || 'Otra persona') + ' guardó «' +
          esc(m.nombre || 'esa cotización') + '» mientras la editabas.' +
          ((r && r.version_actual) ? ' Va en la versión ' + esc(r.version_actual) + '.' : '') +
          cola + ' Vuelve a abrirla antes de seguir, para no pisar su cambio.'
        : esc((r && r.mensaje) || 'No se pudo guardar esa cotización prestada.') + cola
    ) + '</span><span class="nogda-b">' +
      '<button class="btn" id="apCopiar">Copiar lo mío</button>' +
      '<button class="btn fantasma" id="apCerrar">Entendido</button></span>';
    document.body.appendChild(b);

    /* «Copiar lo mío» es la salida concreta: sin ella, «tu trabajo no se
     * perdió» es una frase amable sin manera de actuar. */
    $('#apCopiar').onclick = () => {
      const txt = JSON.stringify(m, null, 2);
      const listo = () => toast('Copiado. Pégalo donde lo necesites.');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(listo, () => respaldoCopiar(txt, listo));
      } else respaldoCopiar(txt, listo);
    };
    $('#apCerrar').onclick = () => b.remove();
  }

  /* Sin red no se traba nada: lo capturado está en el navegador y sube solo
   * al siguiente guardado. Se avisa igual —y una sola vez— porque quien
   * captura tiene derecho a saber que su trabajo todavía no salió de aquí.
   * La excepción es el choque de versión: eso NO se arregla solo y hay que
   * decirlo con todas sus letras. */
  let _avisoPend = 0;
  function avisarPendiente(r) {
    const fallos = (r && r.fallos) || [];
    const choque = fallos.find(f => f.error === 'CONFLICTO_DE_VERSION');
    const motivo = fallos.find(f => f.error === 'MOTIVO_REQUERIDO');

    /* Un choque de versión NO se arregla solo y pide una acción concreta, así
     * que va en barra fija y no en un toast de dos segundos. Lo mismo el
     * motivo faltante: son las dos cosas que la base rechaza a propósito. */
    if (choque || motivo) {
      const viejo = $('#avPend'); if (viejo) viejo.remove();
      const b = document.createElement('div');
      b.id = 'avPend'; b.className = 'nogda';
      b.setAttribute('role', 'alert');
      /* V1.27 · el nombre de quien guardó, si el servidor lo mandó. Ver el
       * aviso del prestado, arriba: mismo criterio y mismo respaldo. */
      const quien = choque ? ((choque.autor_nombre || choque.autor) || null) : null;
      const enVersion = (choque && choque.version_actual)
        ? ' Va en la versión ' + esc(choque.version_actual) + '.' : '';
      const conFolio = (choque && choque.folio_txt)
        ? ' (' + esc(choque.folio_txt) + ')' : '';
      b.innerHTML = '<span>' + (choque
        ? '<strong>' + esc(quien || 'Otra persona') + ' guardó "' +
          esc(choque.nombre || 'un machote') + '"' + conFolio +
          ' mientras lo editabas.</strong>' + enVersion +
          ' Tu cambio sigue en este navegador y NO se perdió, ' +
          'pero no se subió para no pisar el suyo. Vuelve a abrirlo antes de seguir.'
        : '<strong>Falta decir por qué.</strong> ' + esc(motivo.mensaje)) +
        '</span><span class="nogda-b"><button class="btn" id="apExp">Exportar</button>' +
        '<button class="btn fantasma" id="apX">Entendido</button></span>';
      document.body.appendChild(b);
      $('#apExp').onclick = () => exportarRespaldo();
      $('#apX').onclick = () => b.remove();
      return;
    }

    /* Lo demás (sin red, sin sesión) se reintenta solo, así que basta un aviso
     * ligero — y UNO. El autoguardado dispara medio segundo después de la
     * última tecla: sin este freno, capturar con el servidor caído sería un
     * desfile de toasts que enseña a ignorarlos. El punto del pulso es
     * justamente que no haga falta un aviso en cada guardado. */
    const ahora = Date.now();
    if (ahora - _avisoPend < 120000) return;
    _avisoPend = ahora;
    toast('Guardado aquí. Todavía no subió al servidor — se reintenta solo.');
  }

  /** Marca sucio y programa el guardado. Es lo que llama toda edicion. */
  /** Algo cambió: guarda pronto y pinta el pulso.
   *
   *  Recibe el machote que se tocó para poder QUITARLE la marca de ejemplo.
   *  Un ejemplo que la aplicación trae de fábrica no se sincroniza —ésa es la
   *  puerta que se cerró en V1.21— pero en cuanto una persona TECLEA encima,
   *  eso ya es trabajo suyo y tiene que salvarse como cualquier otro. Dejarlo
   *  marcado sería lo contrario de lo que se quería: su cotización se quedaría
   *  en el navegador para siempre, sin subir y sin avisar, que es exactamente
   *  el fallo silencioso del kiosko (CLAUDE.md hallazgo #15).
   *
   *  La garantía de D no se afloja: cubre los ejemplos TAL COMO VIENEN. Lo que
   *  nadie tocó no sale de aquí; lo que alguien escribió, sí. */
  function tocado(m) {
    if (m && m._demo) delete m._demo;
    if (!A || !A.disponible()) { ST.pulso = 'sin-almacen'; pintarPulso(); pintarPendientes(); return; }
    ST.pulso = 'sucio'; pintarPulso(); pintarPendientes();
    if (_reloj) clearTimeout(_reloj);
    _reloj = setTimeout(guardarYa, 500);
  }

  // Las tres salidas por las que se pierde trabajo, cubiertas.
  window.addEventListener('hashchange', () => { if (ST.pulso === 'sucio') guardarYa(); });
  window.addEventListener('beforeunload', () => { if (ST.pulso === 'sucio') guardarYa(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && ST.pulso === 'sucio') guardarYa();
  });

  /** Un machote enviado a Odoo ya no se toca: es el documento con el que se
   *  vendio. Editarlo despues seria reescribir la historia. */
  const congelado = (m) => !!((D.ESTADOS[m && m.estado] || {}).congelado);

  /** Un machote enviado a Odoo NO se borra nunca. Es el documento con el que se
   *  vendió: si desaparece, desaparece la única explicación de por qué el
   *  precio fue ese. Lo que se hace con él es cambiarle el estado, no borrarlo.
   *  En creación y En revisión sí se borran: ahí todavía no hay historia. */
  /* Un machote AJENO no se borra ni se edita: se consulta. Quien quiera
   * partir de uno, que lo duplique a su nombre. (V1.24: esto ya no es «lo que
   * ve dirección» sino lo que ve cualquiera — por eso importa más que antes
   * que el candado se vea y se entienda de un vistazo.) */
  const borrable = (m) => !((D.ESTADOS[m && m.estado] || {}).sin_borrar) &&
                          !(m && m._ajeno === true);

  const esc = (s) => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** El formato del machote: $ con separador de miles y sin decimales.
   *  Un vacío se pinta como " $-  ", igual que en la hoja. */
  const mx = (x) => (x === null || x === undefined || !isFinite(x)) ? '—'
    : (Math.round(x) === 0 ? '$-' : '$' + Math.round(x).toLocaleString('es-MX'));
  const mx2 = (x) => (x === null || x === undefined || !isFinite(x)) ? '—'
    : '$' + x.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pc = (x) => (x === null || x === undefined || !isFinite(x)) ? '—'
    : (x * 100).toFixed(2).replace(/\.00$/, '') + '%';
  const nn = (x) => (x === null || x === undefined || x === '') ? '' : x;

  /* Busca en las dos listas: la propia (que vive en el navegador) y la de
   * trabajo AJENO (que sólo vive en memoria). Ver `esAjeno` en almacen.js. */
  const mach  = (id) => ST.machotes.find(m => m.id === id) ||
                        ST.ajenos.find(m => m.id === id);
  const ajeno = (m) => !!(m && m._ajeno === true);
  /* Ajeno ya no implica sólo lectura: con un préstamo vigente se edita.
   * La decisión de verdad la toma el SERVIDOR en cada guardado, contra la
   * base y con su propio reloj; esto es para no hacerle perder el rato a
   * quien sí tiene permiso. Vive en el almacén para que la pantalla y el
   * empuje no puedan discrepar. */
  const puedoEscribir = (m) => !!(A && A.puedeEscribir ? A.puedeEscribir(m) : !ajeno(m));
  const prestadoAMi = (m) => !!(A && A.prestadoAMi && A.prestadoAMi(m));

  /* ── El folio (V1.23) ────────────────────────────────────────────────────
   * El número con el que se habla de una cotización: `COT-0003`. Lo reparte
   * el SERVIDOR al crear la identidad; mientras el machote no ha subido, no
   * tiene, y eso se dice con esas palabras en vez de inventar uno.
   *
   * Sale de DOS sitios según de quién sea el machote, y por eso hay una sola
   * función: lo ajeno vive en memoria y trae el folio encima; lo propio lo
   * tiene la libreta de sincronización, porque meterlo en el machote lo
   * metería en su huella y la franja diría «por subir» de algo ya guardado.
   * Devuelve la cadena ya formateada por la base, nunca armada aquí. */
  function folioDe(m) {
    if (!m) return null;
    if (m._ajeno === true) return m._folio_txt || null;
    if (!A || !A.folio) return null;
    const f = A.folio(m.id);
    return f ? f.folio_txt : null;
  }

  function toast(txt) {
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = txt; document.body.appendChild(d);
    setTimeout(() => d.classList.add('on'), 10);
    setTimeout(() => { d.classList.remove('on'); setTimeout(() => d.remove(), 300); }, 2200);
  }

  /* ── Celdas ──────────────────────────────────────────────────────────
   * Una celda es un input sin bordes hasta que se enfoca, para que la tabla
   * se lea como una hoja y no como un formulario. */
  const cel = (path, val, cls, ph) =>
    '<input class="cel ' + (cls || '') + '" data-cel="' + path + '" value="' + esc(nn(val)) + '"' +
    (ph ? ' placeholder="' + esc(ph) + '"' : '') + '>';
  /* Los números que se capturan aquí son cantidades, personas, precios y
   * multiplicadores. Ninguno tiene sentido en negativo, y un precio negativo
   * no da un error: da un total más chico y nadie lo nota. `min=0` frena las
   * flechitas y el teclado numérico del teléfono; el saneo del `setPath` frena
   * lo que se escriba o se pegue a mano. */
  const celNum = (path, val, cls, ph) =>
    '<input class="cel num ' + (cls || '') + '" type="number" step="any" min="0" data-cel="' + path + '" data-num' +
    ' value="' + esc(nn(val)) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '>';
  /* Un campo que por dentro es una RAZÓN (0.055) pero que la gente lee y
   * escribe en PORCENTAJE (5.5%). Se guarda igual que siempre —dividido entre
   * cien— para no tocar el motor ni lo ya guardado; lo único que cambia es en
   * qué unidad se ve y se teclea. Montalvo: "que las comisiones aparezcan en %
   * y no en decimales".
   *
   * El redondeo a seis decimales es a propósito: 5.5/100 en coma flotante da
   * 0.055000000000000004, y ese ruido acaba escrito en el almacén. */
  const celPct = (path, val, cls) => {
    const v = (val === null || val === undefined || val === '') ? '' :
              +(Number(val) * 100).toFixed(6);
    return '<span class="pctwrap"><input class="cel num ' + (cls || 'w70') +
      '" type="number" step="any" min="0" data-cel="' + path + '" data-num data-pct' +
      ' value="' + esc(nn(v)) + '"><i>%</i></span>';
  };

  const celSel = (path, val, ops, cls) =>
    '<select class="cel ' + (cls || '') + '" data-cel="' + path + '">' +
    ops.map(o => '<option value="' + esc(o) + '"' + (o === val ? ' selected' : '') + '>' + esc(o || '—') + '</option>').join('') +
    '</select>';

  /** Campo con catálogo sugerido y captura libre. Un `<select>` impide
   *  escribir "tramo de 6 m", que es de lo que está lleno el acervo. */
  const celLibre = (path, val, lista, cls) =>
    '<input class="cel ' + (cls || '') + '" list="' + lista + '" data-cel="' + path + '"' +
    ' value="' + esc(nn(val)) + '" autocomplete="off">';

  /** Ningún número de este machote tiene sentido en negativo: ni horas, ni
   *  personas, ni precios, ni multiplicadores. Y un negativo no se ve como un
   *  error — se ve como un total más chico, que es peor. Se corta AQUÍ, en el
   *  único escritor, y no en cada campo: el `min=0` del input frena las
   *  flechitas y el teclado, pero no frena escribir "-5" ni pegarlo. */
  const sanea = (v) => (typeof v === 'number' && v < 0) ? 0 : v;

  /** Escribe por ruta. `s:<sid>:mo:<i>:campo` · `s:<sid>:partidas:<i>:campo`
   *  `eq:<venta|ops|cli>:<i>:campo` · `nom:<sid>` · o campo anidado. */
  function setPath(m, path, val) {
    const p = path.split(':');
    if (p[0] === 'nom') { const s = m.secciones.find(x => x.id === p[1]); if (s) s.nombre = val; return; }
    /* Los multiplicadores son DE LA SECCIÓN, no del machote: `mg:<id>:<clave>`.
     * Antes se escribían en `m.margenes` y por eso mover uno en una sección
     * los movía en todas. Lo único que sigue siendo del machote entero son las
     * dos comisiones, FTS y cliente. */
    if (p[0] === 'mg') {
      const s = m.secciones.find(x => x.id === p[1]); if (!s) return;
      if (!s.margenes) s.margenes = {};
      s.margenes[p[2]] = sanea(val); return;
    }
    /* V1.28 · el recargo es DE LA SECCIÓN: `rec:<sid>:<fin_semana|festivo>`.
     * Vaciar la celda BORRA el campo en vez de escribir cero, y la diferencia
     * importa: cero es «el fin de semana no se cobra más caro» y ausente es
     * «lo que diga la plantilla». Si vaciar escribiera cero, quien quisiera
     * volver al 30% tendría que acordarse del número. */
    if (p[0] === 'rec') {
      const s = m.secciones.find(x => x.id === p[1]); if (!s) return;
      if (!s.recargos) s.recargos = {};
      if (val === null || val === undefined || val === '') delete s.recargos[p[2]];
      else s.recargos[p[2]] = sanea(val);
      return;
    }
    if (p[0] === 's') {
      const s = m.secciones.find(x => x.id === p[1]); if (!s) return;
      const arr = p[2] === 'mo' ? s.mo : s.partidas;
      const l = arr[parseInt(p[3], 10)]; if (!l) return;
      l[p[4]] = sanea(val); return;
    }
    if (p[0] === 'eq') {
      const key = p[1] === 'venta' ? 'equipo_venta' : p[1] === 'ops' ? 'equipo_operaciones' : 'equipo_cliente';
      const it = (m[key] || [])[parseInt(p[2], 10)]; if (!it) return;
      it[p[3]] = sanea(val); return;
    }
    const parts = path.split('.');
    let o = m;
    for (let i = 0; i < parts.length - 1; i++) { if (!o[parts[i]]) o[parts[i]] = {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = sanea(val);
  }

  /* ── Ruteo ───────────────────────────────────────────────────────────── */
  /* Quién entró, y cómo salir. Sin esto, en una prueba con varias personas
   * nadie sabe con qué usuario está viendo la pantalla — y el input que nos
   * den deja de ser atribuible, que es justamente para lo que se puso el
   * login. */
  function pintarUsuario() {
    const el = $('#tbUser');
    if (!el) return;
    const S = G.SuiteAuth, ses = S && S.getSession();
    if (!ses) { el.style.display = 'none'; return; }
    el.style.display = '';
    // El NOMBRE, no el usuario: `esteban.delacruz` truncado a `esteban.delac…`
    // no le dice a nadie quién está capturando. El usuario queda en el título
    // para cuando haga falta el dato exacto.
    el.textContent = ses.nombre || ses.actor;
    el.title = ses.actor;
    el.onclick = () => {
      if (!confirm('¿Cerrar la sesión de ' + (ses.nombre || ses.actor) + '?')) return;
      S.logout();
      location.replace('../login.html');
    };
  }

  /* La contraseña temporal se avisa UNA vez. La columna `debe_cambiar_password`
   * existe en la tabla pero el flujo para cambiarla NO está construido: más
   * vale decir que está pendiente que callarlo. */
  function avisoPassword() {
    try {
      if (sessionStorage.getItem('fts_suite_avisar_password') !== '1') return;
      sessionStorage.removeItem('fts_suite_avisar_password');
      toast('Estás usando una contraseña temporal. Pídele a Esteban que te la cambie.');
    } catch (e) { /* sessionStorage bloqueado: no es motivo para tumbar nada */ }
  }

  function render() {
    pintarPulso(); pintarPendientes();
    pintarUsuario();
    const p = (location.hash || '#/').replace(/^#\//, '').split('/');
    if (p[0] === '')      return vHome();
    if (p[0] === 'nuevo') return vNuevo();
    if (p[0] === 'm')     return vMachote(p[1]);
    if (p[0] === 'rev')   return vRevision(p[1]);
    if (p[0] === 'ap')    return vAprobar(p[1]);
    if (p[0] === 'control') return vControl();
    location.hash = '#/';
  }
  /* El encabezado. `back` es a dónde vuelve la flecha:
   *   · un hash ('#/')       → dentro del libro,
   *   · una ruta ('../…')    → fuera del módulo.
   * Nunca se oculta: hasta V1.20 la lista no tenía salida y había que
   * teclear la URL para volver a Comercial.
   *
   * La insignia «DEMO» se quitó en V1.21. Decía «esto es de mentiras» encima
   * de una pantalla que ya guarda en un servidor de verdad; un cartel falso
   * enseña a no creerle a los carteles. La versión se ve en el pie. */
  function top(t, s, b, back) {
    $('#tbT').textContent = t;
    $('#tbS').textContent = s;
    const v = $('#tbV');
    if (v) {
      v.textContent = VERSION;
      // Media versión no es un detalle de pie de página: se marca donde se mira.
      v.className = MEZCLA.length ? 'tb-ver mezcla' : 'tb-ver';
      v.title = MEZCLA.length
        ? 'La pantalla está corriendo archivos de dos versiones: ' + MEZCLA.join(' · ')
        : 'Versión del módulo';
    }
    const bb = $('#btnBack');
    const destino = back || '../index.html';
    if (destino.charAt(0) === '#') {
      bb.setAttribute('href', destino);
      bb.title = 'Volver';
    } else {
      bb.setAttribute('href', destino);
      bb.title = 'Volver a Comercial';
    }
  }
  /* ── El aviso de MEDIA VERSIÓN ────────────────────────────────────────
   *
   * No es un `console.warn`: nadie abre la consola. Si la pantalla está
   * corriendo archivos de dos versiones, los números pueden salir de un motor
   * que no es el que esta pantalla espera — y eso NO se puede dejar pasar en
   * silencio, que es justo el modo de falla que perseguimos en todo lo demás.
   *
   * Dice QUÉ está desfasado y ofrece la única acción que sirve: recargar
   * saltándose el caché. */
  function avisarMezcla() {
    if (!MEZCLA.length || document.getElementById('avMezcla')) return;
    const b = document.createElement('div');
    b.id = 'avMezcla';
    b.className = 'nogda mezcla';
    b.setAttribute('role', 'alert');
    b.innerHTML = '<span><strong>Esta pantalla está corriendo dos versiones a la vez.</strong> ' +
      esc(MEZCLA.join('; ')) + '. Los números pueden no ser los de esta versión. ' +
      'Recarga antes de seguir capturando.</span>' +
      '<span class="nogda-b"><button class="btn" id="mzRecargar">Recargar</button></span>';
    document.body.appendChild(b);
    const bt = document.getElementById('mzRecargar');
    if (bt) bt.addEventListener('click', function () {
      /* El `?v=` del documento lo busta; los subrecursos ya van versionados,
       * así que la recarga trae el juego completo y coherente. */
      try { location.replace(location.pathname + '?v=' + encodeURIComponent(VERSION_ARCHIVO) + location.hash); }
      catch (e) { location.reload(); }
    });
  }

  window.addEventListener('hashchange', render);

  /* El nombre del cliente sale de UNA sola función. Con el catálogo cargado
   * gana Odoo; sin él, el respaldo que quedó guardado. Que esté en un solo
   * lugar es lo que evita que media pantalla muestre el nombre vivo y la otra
   * media el congelado. */
  const cli = (m) => (G.Clientes ? G.Clientes.nombre(m) : (m && m.cliente) || '');

  const nivelMargen = (mg) => mg === null ? 'warn'
    : mg < R.UMBRALES.margen_minimo_duro ? 'bad'
    : mg < R.UMBRALES.margen_minimo_blando ? 'warn' : 'ok';

  /* ── Lista ───────────────────────────────────────────────────────────── */
  /* ¿Este machote cae en lo que se está buscando?
   * Se busca sobre lo que la gente recuerda de una cotización: el nombre, el
   * cliente y el número de orden. El id entra también porque es lo que se
   * copia y pega cuando alguien pregunta "¿y el M-1042?". */
  function coincide(m, q) {
    if (!q) return true;
    // El id de Odoo entra a la búsqueda a propósito: es lo que se guarda, y
    // quien lo tenga a la mano debe poder encontrar la cotización con él.
    // El FOLIO entra a la búsqueda antes que nada: es el número que la gente
    // va a tener apuntado y a teclear. Se busca tanto 'COT-0003' como '3'.
    const fl = folioDe(m);
    const t = [m.nombre, cli(m), m.cliente, m.so, m.id, m.cliente_id,
               fl, fl ? String(parseInt(String(fl).replace(/\D/g, ''), 10)) : '']
      .map(x => String(x || '').toLowerCase()).join(' | ');
    // Cada palabra por separado: "topo chico" y "chico topo" encuentran lo mismo.
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => t.indexOf(w) >= 0);
  }


  /** Baja el respaldo y lo dice. Vive aquí y no en `respaldo.js` porque
   *  necesita la sesión y el toast, que son de la pantalla. */
  function exportarRespaldo() {
    const S = G.SuiteAuth, ses = (S && S.getSession()) || {};
    const r = G.MachoteRespaldo.exportar(ses);
    if (!r.ok) { toast('No se pudo exportar: ' + (r.error || 'desconocido')); return; }
    toast('Bajó ' + r.nombre + ' · ' + r.machotes + ' machote(s)');
  }

  /* IMPORTAR se retiró en V1.24 junto con su botón. Existía para meter a mano
   * lo que vivía suelto en el navegador de cada quien mientras no había
   * servidor; con los machotes ya en Postgres su único efecto posible era
   * crear duplicados. `MachoteRespaldo.importarTexto` se queda en su archivo
   * —es una función pura, con sus pruebas, y fusionar sin pisar es la parte
   * difícil de esto— pero ya no hay camino desde la pantalla.
   *
   * Nota para quien lea esto y se pregunte si el respaldo sigue siendo un
   * respaldo: sí, pero de otra clase. Ya no es «de aquí se restaura», porque
   * de donde se restaura es del servidor; es «me llevo lo mío» — para revisar
   * fuera, para archivar, o para tener algo cuando el guardado se rompe. */


  /* El tablero de dirección (#140 · B). Vive en su propio archivo
   * `js/control.js`; aquí sólo se le da el hueco y el encabezado. Se puede
   * abrir siempre por la URL —para que Esteban entre esta noche sin esperar
   * el permiso—: sin la llave la pantalla lo dice y enseña una demostración,
   * en vez de rebotar a la lista. */
  function vControl() {
    top('Control', 'Comercial · dirección', null, '#/');
    $('#fija').innerHTML = '';
    $('#vista').innerHTML = '';
    if (!G.MachoteControl) {
      $('#vista').innerHTML = '<div class="pad"><div class="aviso bad">' +
        'No cargó la vista de control.</div></div>';
      return;
    }
    G.MachoteControl.montar($('#vista'));
  }

  /* ── La lista ─────────────────────────────────────────────────────────
   * Rediseñada en V1.21. Lo que cambió y por qué:
   *
   *   · TABLA con columnas en escritorio, TARJETAS con el pulgar. Antes eran
   *     tarjetas siempre; en una laptop desperdiciaban el ancho y obligaban a
   *     leer cada renglón para comparar precios o márgenes entre cotizaciones.
   *   · FILTROS como desplegables, no como una fila de píldoras. Las píldoras
   *     no escalaban: con siete personas capturando hacían falta siete más, y
   *     ya se veían como pestañas a medio hacer.
   *   · Filtro POR PERSONA, que arranca en «los míos». Es lo que alguien
   *     quiere ver al entrar; lo de los demás está a un clic. El pie lo dice
   *     con todas sus letras, porque un filtro puesto que no se anuncia hace
   *     creer que faltan machotes.
   *   · EXPORTAR e IMPORTAR arriba, junto a la acción principal. Eran la red
   *     de seguridad y vivían al fondo, después de todo.
   *   · Fuera los dos textos del encabezado. Lo que había que decir sobre los
   *     datos demo ya no hace falta: la demo se marca sola en la lista y no
   *     se sincroniza (`_demo` en demo.js).
   *
   * Se prototipó primero: docs/comercial/prototipos/v121-lista.html, con dos
   * propuestas. Ésta es la A. */
  function vHome() {
    top('Machotes', 'Comercial', null, '../index.html');
    $('#fija').innerHTML = '';
    /* `D.ESTADOS[m.estado]` con un estado desconocido devuelve undefined, y
     * leerle `.color` tumbaba TODA la lista — pantalla en blanco por un solo
     * machote raro. Pasa de verdad durante la transición: un documento viejo,
     * uno importado a mano, o uno que bajó del servidor sin `estado` dentro. */
    const edo = (m) => D.ESTADOS[m && m.estado] || D.ESTADOS.borrador;
    const A2 = G.MachoteAlmacen;
    const esDemo = (m) => !!(A2 && A2.esDemo ? A2.esDemo(m) : (m && m._demo === true));

    /* Quién es el dueño de un machote. Hasta que el documento traiga autor
     * propio, el dueño es quien lo capturó (`autor`) y, si no lo trae, quien
     * está en sesión: es lo que hace el servidor al guardarlo. */
    const ses = (G.SuiteAuth && G.SuiteAuth.getSession()) || null;
    const yo = (ses && ses.actor) || '';
    const yoNom = (ses && ses.nombre) || yo;
    /* En un ajeno el dueño lo dice el servidor (`_dueno`), no el documento:
     * el `autor` de adentro es de quien guardó esa versión, que puede ser otro. */
    const duenoDe = (m) => (m && (m._dueno || m.autor || m.dueno)) || yo;
    /* El nombre REAL, no el usuario. La columna se llama «Responsable» y para
     * los ajenos salía `francisco.montalvo` — justo las personas que dirección
     * necesita identificar de un vistazo. El servidor manda `dueno_nombre`. */
    const nombresAjenos = {};
    (ST.ajenos || []).forEach(m => { if (m._dueno) nombresAjenos[m._dueno] = m._dueno_nombre || m._dueno; });
    const nombreDe = (a) => (a === yo ? yoNom : (nombresAjenos[a] || a));

    /* El universo de personas sale de los DATOS, no de una lista escrita a
     * mano: el día que entre alguien nuevo aparece solo. */
    /* El universo de la lista son los PROPIOS más los AJENOS. Desde V1.24 los
     * ajenos le llegan a cualquiera del módulo: todos ven todo, en lectura. */
    const universo = ST.machotes.concat(ST.ajenos || []);

    const personas = [];
    universo.forEach(m => {
      const d = duenoDe(m);
      if (d && personas.indexOf(d) < 0) personas.push(d);
    });
    personas.sort();

    const f = ST.filtros;
    const pasa = (m) =>
      (f.persona === '' || duenoDe(m) === f.persona) &&
      (f.estado === '' || m.estado === f.estado) &&
      (f.moneda === '' || (m.moneda || 'MXN') === f.moneda) &&
      coincide(m, ST.busca);

    const visibles = universo.filter(pasa);

    /* La entrada al tablero de dirección sólo se ofrece a quien tiene la
     * llave. Un enlace visible para todos, que a casi todos les contestara
     * "no tienes permiso", sería ruido: la puerta se ve si se puede abrir. */
    const esDireccion = !!(G.SuiteAuth && G.SuiteAuth.tieneScope &&
                           G.MachoteControl && G.SuiteAuth.tieneScope(G.MachoteControl.SCOPE));

    const opc = (v, txt, sel) =>
      '<option value="' + esc(v) + '"' + (sel === v ? ' selected' : '') + '>' + esc(txt) + '</option>';

    const encabezado =
      '<div class="enc">' +
        '<h2>Machotes</h2>' +
        /* Con ajenos en pantalla la cuenta dice CUÁNTAS SON TUYAS. Sin eso,
         * «4 cotizaciones» al lado de «Exportar todo (1)» se lee como un error
         * de la aplicación en vez de como lo que es: el respaldo se lleva lo
         * tuyo, y tuya hay una. */
        '<div class="cuenta">' + (visibles.length === universo.length
          ? universo.length + (universo.length === 1 ? ' cotización' : ' cotizaciones') +
            ((ST.ajenos || []).length ? ' · ' + ST.machotes.length + ' tuya' +
              (ST.machotes.length === 1 ? '' : 's') : '')
          : visibles.length + ' de ' + universo.length) + '</div>' +
        '<div class="acc">' +
          (esDireccion ? '<a class="btn fantasma" href="#/control">Control</a>' : '') +
          /* Dice «todo» y dice CUÁNTOS a propósito. Con filtros en pantalla —y el
           * de persona puesto de arranque— «Exportar» a secas se lee como «exporta
           * lo que estoy viendo», que es justo lo que NO hace. El número es la
           * comprobación de un vistazo de que el respaldo lleva todo. */
          /* Cuenta `ST.machotes`, NO el universo: el respaldo se lleva lo TUYO.
           * Meter en tu archivo el trabajo de otros sería sacarlo de donde su
           * dueño lo puede gobernar. Por eso este número es casi siempre menor
           * que el del encabezado: desde V1.24 la lista enseña lo de todos. */
          /* IMPORTAR se fue en V1.24. Existía para meter a mano lo que vivía
           * en el navegador de cada quien mientras no había servidor; los 17
           * machotes ya están en Postgres y hoy el botón sólo ofrece una
           * manera de crear duplicados con `id_local` repetido. */
          /* EXPORTAR se queda, pero discreto: deja de ser un botón con conteo
           * al lado de «+ Nuevo» y pasa a un enlace pequeño al pie de la lista.
           * El porqué está en `docs/comercial/ANDAMIO.md`. */
          '<a class="btn nuevo" href="#/nuevo">+ Nuevo</a>' +
        '</div>' +
      '</div>';

    const filtros =
      '<div class="tb2">' +
        '<div class="bus"><input id="q" type="search" ' +
          'placeholder="Buscar por folio, nombre, cliente u orden…" value="' + esc(ST.busca) + '" ' +
          'autocomplete="off" enterkeyhint="search"></div>' +
        '<label class="fsel' + (f.persona ? ' puesto' : '') + '"><select id="fPersona">' +
          opc('', 'Todas las personas', f.persona) +
          /* El propio se llama «Míos» a secas: con «Míos · Jesus Esteban De La
           * Cruz» el desplegable se cortaba a media palabra en un teléfono. */
          personas.map(pp => opc(pp, pp === yo ? 'Míos' : nombreDe(pp), f.persona)).join('') +
        '</select></label>' +
        '<label class="fsel' + (f.estado ? ' puesto' : '') + '"><select id="fEstado">' +
          opc('', 'Todos los estados', f.estado) +
          D.FLUJO.map(k => opc(k, D.ESTADOS[k].label, f.estado)).join('') +
        '</select></label>' +
        '<label class="fsel' + (f.moneda ? ' puesto' : '') + '"><select id="fMoneda">' +
          opc('', 'Toda moneda', f.moneda) + opc('MXN', 'MXN', f.moneda) + opc('USD', 'USD', f.moneda) +
        '</select></label>' +
      '</div>' +
      '';

    /* Un renglón. La demo se marca y se dice por qué en el título: sin eso,
     * alguien la toma por una cotización que no sube y reporta un fallo. */
    /* El folio como se ve en la lista. UNA función para la tabla y para la
     * tarjeta: si fueran dos, un cambio de forma se aplicaría a una y no a la
     * otra, y el mismo machote se leería distinto según el ancho.
     *
     * Sin folio se muestra el id del navegador, que es lo único que hay para
     * referirse a un machote que todavía no sube — pero apagado y con el
     * porqué en el título, para que no se confunda con un folio de verdad. */
    /* El folio como se ve en la lista. UNA función para la columna de la tabla
     * y para la tarjeta del teléfono: si fueran dos, un cambio de forma se
     * aplicaría a una y no a la otra, y el mismo machote se leería distinto
     * según el ancho.
     *
     * Se copia de un toque. En un teléfono seleccionar `COT-0003` a dedo para
     * pegarlo en un correo es un pulso fino sobre once caracteres; el botón
     * lo vuelve un toque. En escritorio da igual, pero tener DOS maneras de
     * copiar el mismo dato según el ancho es peor que tener una. */
    const folioChip = (m) => {
      const f = folioDe(m);
      if (f) return '<button class="folio" type="button" data-copiar="' + esc(f) + '" ' +
        'title="Folio de la cotización. Tócalo para copiarlo.">' + esc(f) + '</button>';
      /* Sin folio y AJENO: nada. El `id` de un machote ajeno es el uuid del
       * servidor —se usa así a propósito, porque dos personas pueden tener el
       * mismo `id_local`— y enseñar un uuid de treinta y seis caracteres en la
       * lista es ruido puro. */
      if (ajeno(m)) return '<span class="folio sin" title="Sin folio.">—</span>';
      /* Sin folio y PROPIO: no se inventa un número. El folio lo reparte el
       * servidor al crear la identidad, y un folio propuesto aquí chocaría
       * con el de otra persona capturando al mismo tiempo. Se dice que aún no
       * sube, que es la verdad y además es accionable. */
      return '<span class="folio sin" title="Todavía no ha subido al servidor, ' +
        'que es quien reparte los folios.">sin folio</span>';
    };

    const fila = (m) => {
      const rev = R.revisar(m), c = rev.calc;
      const dm = esDemo(m);
      /* OJO: la clase es `rw`, NO `fila`. En este módulo `.fila` ya significa
       * `display:flex` —es la tarjeta del teléfono— y ponérsela a un `<tr>`
       * destruye el reparto de columnas de la tabla: la cabecera se va a un
       * lado y el cuerpo al otro. Lo cazó la captura, no el diff (§20 #12).
       * El resaltado de la franja engancha por `[data-mid]`, no por la clase,
       * así que sigue funcionando. */
      return '<tr class="rw" data-mid="' + esc(m.id) + '">' +
        /* El folio en COLUMNA PROPIA (V1.24). Antes iba dentro del renglón del
         * nombre, entre el cliente y la orden, y ahí no se podía recorrer con
         * la vista: para encontrar COT-0005 en una lista había que leer siete
         * líneas de texto en vez de bajar por una columna de once caracteres
         * alineados. Es el dato con el que la gente se habla por teléfono. */
        '<td class="folio-td">' + folioChip(m) + '</td>' +
        '<td><div class="nm"><a href="#/m/' + esc(m.id) + '">' + esc(m.nombre) + '</a>' +
          (dm ? ' <span class="pill" title="Ejemplo que trae la aplicación. No se guarda en el servidor.">ejemplo</span>' : '') +
          (ajeno(m) ? (prestadoAMi(m)
            ? ' <span class="pill presta" title="Su dueño te prestó la escritura. Se edita hasta que venza el permiso; borrar sigue siendo suyo.">prestada</span>'
            : ' <span class="pill aj" title="Trabajo de otra persona. Se abre en lectura: no se edita ni se borra.">sólo lectura</span>') : '') +
          '</div><div class="sub">' + esc(cli(m)) +
          (m.so ? ' · ' + esc(m.so) : '') + '</div></td>' +
        '<td class="quien-td sub" title="' + esc(nombreDe(duenoDe(m))) + '">' +
          esc(nombreDe(duenoDe(m))) + '</td>' +
        '<td><span class="pill" style="background:' + edo(m).color + '20;color:' + edo(m).color + '">' +
          esc(edo(m).label) + '</span></td>' +
        '<td class="num mono">' + mx(c.precio) + '</td>' +
        '<td class="num mono n-' + (c.costoIncompleto ? 'warn' : nivelMargen(c.margen)) + '">' +
          pc(c.margen) + (c.costoIncompleto ? '*' : '') + '</td>' +
        /* La columna «Revisión» («1 dura», «3 duras») se fue con la sección de
         * confirmar la orden: contaba las validaciones que impedían crear la
         * orden desde aquí, y ese camino ya no sale de la lista. Las duras no
         * desaparecieron —siguen dentro del machote, junto al campo que las
         * causa, que es donde se arreglan—; lo que desapareció es un número
         * suelto en una tabla, sin manera de saber a qué se refería. */
        '<td><div class="acts">' +
          '<button class="ico" data-hist="' + esc(m.id) + '" title="Ver el historial de versiones">🕘</button>' +
          (borrable(m)
            ? '<button class="ico" data-borrar="' + esc(m.id) + '" title="Eliminar machote">×</button>'
            : '<span class="ico candado" title="' + (ajeno(m)
                ? 'Es de otra persona: se puede ver, no borrar.'
                : 'Enviado a Odoo: no se borra, sólo cambia de estado') + '">🔒</span>') +
        '</div></td></tr>';
    };

    const tarjeta = (m) => {
      const rev = R.revisar(m), c = rev.calc;
      const dm = esDemo(m);
      return '<div class="fila" data-mid="' + esc(m.id) + '">' +
        /* En el teléfono el folio va ARRIBA del nombre, en su propia línea. No
         * hay columnas donde ponerlo, y metido en la línea gris de abajo
         * quedaba tercero detrás del cliente y la orden —con nombres de
         * cliente largos, fuera de pantalla—. Arriba se recorre igual que la
         * columna del escritorio. */
        '<div class="tarj-folio">' + folioChip(m) + '</div>' +
        '<a class="item" href="#/m/' + esc(m.id) + '">' +
        '<div class="grow"><strong>' + esc(m.nombre) + '</strong>' +
          (dm ? ' <span class="pill">ejemplo</span>' : '') +
          (ajeno(m) ? (prestadoAMi(m)
            ? ' <span class="pill presta">prestada</span>'
            : ' <span class="pill aj">sólo lectura</span>') : '') +
          '<div class="tiny">' + esc(cli(m)) +
          (m.so ? ' · ' + esc(m.so) : '') + ' · ' +
          esc(nombreDe(duenoDe(m))) + '</div></div>' +
        '<div class="right"><span class="chip" style="background:' + edo(m).color + '">' +
          esc(edo(m).label) + '</span>' +
        '<div class="tiny mono n-' + (c.costoIncompleto ? 'warn' : nivelMargen(c.margen)) + '">' +
          mx(c.precio) + ' · ' + pc(c.margen) + (c.costoIncompleto ? '*' : '') + '</div>' +
        /* El conteo de duras se fue de la tarjeta igual que de la columna de
         * la tabla, y por la misma razón: contaba lo que impedía crear la
         * orden desde la lista, y ese camino ya no sale de aquí. Las duras
         * siguen dentro del machote, junto al campo que las causa.
         *
         * OJO con los cierres: aquí van DOS, no tres. El `<div class="tiny">`
         * que se quitó traía pegado su propio `</div>`, y al borrar la línea
         * entera quedó un cierre de sobra que cerraba `.fila` antes de tiempo.
         * El navegador entonces sacaba las tarjetas de `.cards` —que es quien
         * las esconde en escritorio— y aparecían debajo de la tabla, con los
         * botones sueltos. Invisible releyendo el diff; evidente en la
         * captura de 1280 (CLAUDE.md §20 #12). */
        '</div></a>' +
        '<button class="ico" data-hist="' + esc(m.id) + '" title="Ver el historial de versiones">🕘</button>' +
        (borrable(m)
          ? '<button class="ico peligro borrar" data-borrar="' + esc(m.id) + '" title="Eliminar machote">×</button>'
          : '<span class="ico candado" title="' + (ajeno(m)
              ? 'Es de otra persona: se puede ver, no borrar.'
              : 'Enviado a Odoo: no se borra, sólo cambia de estado') + '">🔒</span>') +
        '</div>';
    };

    // Un "no hay nada" tiene que decir POR QUÉ no hay nada: si la lista sale
    // vacía por un filtro puesto hace un minuto y no lo dice, parece que se
    // perdieron los machotes.
    const porQue = [];
    if (ST.busca) porQue.push('«' + esc(ST.busca) + '»');
    if (f.persona) porQue.push(esc(nombreDe(f.persona)));
    if (f.estado && D.ESTADOS[f.estado]) porQue.push(esc(D.ESTADOS[f.estado].label).toLowerCase());
    if (f.moneda) porQue.push(esc(f.moneda));
    const vacio = '<div class="vacio">' +
      (porQue.length ? 'Ninguna cotización coincide con ' + porQue.join(' · ') + '.'
                     : 'Todavía no hay cotizaciones. Empieza con «+ Nuevo».') + '</div>';

    const tabla = visibles.length
      ? '<div class="tw"><table class="lista"><thead><tr>' +
          '<th style="width:92px">Folio</th>' +
          '<th style="width:34%">Cotización</th><th>Responsable</th><th>Estado</th>' +
          '<th class="num">Precio</th><th class="num">Margen</th><th style="width:72px"></th>' +
        '</tr></thead><tbody>' + visibles.map(fila).join('') + '</tbody></table>' +
        '<div class="cards">' + visibles.map(tarjeta).join('') + '</div></div>'
      : '<div class="tw">' + vacio + '</div>';

    const pieFiltro = (f.persona === yo && yo)
      ? '<div class="tiny nota">Viendo sólo lo tuyo. Cambia el filtro de persona para ver el resto.</div>'
      : '';

    /* ── Lo que NO ha subido (V1.24, reemplaza a la franja) ───────────────
     * La franja de sincronización era andamio del rescate y así quedó
     * documentada. Lo que la sustituye es esto, y la diferencia importa:
     *
     *   la franja HABLABA SIEMPRE, incluso para decir «todo a salvo»;
     *   esto sólo habla cuando hay algo atorado.
     *
     * Es deliberado. Una marca local NUNCA puede probar que todo llegó al
     * servidor —por eso la franja preguntaba allá—, pero sí puede probar que
     * algo NO ha salido de aquí. Así que este aviso sólo afirma lo que puede
     * demostrar; el silencio no dice «todo a salvo», dice «nada pendiente que
     * yo sepa», y la pregunta «¿está TODO lo mío allá?» se contesta en
     * Control, que sí le pregunta al servidor.
     *
     * Y dice CUÁLES, no sólo cuántas: un aviso que no se puede accionar es
     * ruido. Marca los renglones por `[data-mid]`, igual que hacía la franja. */
    /* Va en un HOST vacío que `pintarPendientes()` rellena, y NO se pinta
     * aquí. La razón la cazó la prueba: el aviso se rendía una vez, con lo
     * pendiente de ese instante, y cuando la subida terminaba unos segundos
     * después nadie lo volvía a mirar — quedaba en pantalla «1 sin subir» con
     * `pendientes()` ya en 0, la libreta escrita y el pulso en «guardado».
     *
     * Un aviso rancio es peor que no avisar: enseña a no creerle. La franja no
     * tenía este problema porque volvía a preguntar; ésta vuelve a MIRAR, que
     * es lo mismo por dentro. */
    const avisoPend = '<div id="avPendHost"></div>';

    /* El respaldo, al pie y en chico. Sigue existiendo porque es la única
     * salida cuando el guardado deja de funcionar —`avisarNoGuarda()` lo
     * ofrece ahí mismo— y porque llevarse lo propio no le quita nada a
     * nadie. Lo que se le quitó es el rango de botón principal. */
    const pieRespaldo = '<div class="tiny nota pie-resp">' +
      '<button class="lnk" id="bExportar" title="Baja un archivo con TODO lo capturado POR TI, ' +
      'no sólo lo que muestran los filtros">Descargar un respaldo de lo mío (' +
      ST.machotes.length + ')</button></div>';

    /* La sección «Confirmar la orden» se fue en V1.24. Listaba órdenes de
     * `D.ORDENES` —datos de ejemplo, nunca del servidor— debajo de una lista
     * de cotizaciones reales, y marcaba «confirmada» en un estado de memoria
     * que no le importa a nadie. Era andamio del prototipo. El camino de
     * verdad a una orden es el de la cotización: abrirla y «Pasar a orden». */
    $('#vista').innerHTML =
      '<div class="pad">' + encabezado + filtros + avisoPend + tabla + pieFiltro +
      pieRespaldo +
      '<div class="ver">versión <strong>' + VERSION + '</strong></div></div>';

    $('#bExportar').onclick = () => exportarRespaldo();



    // Se repinta sólo al teclear, y se devuelve el foco al final del texto:
    // repintar entera mata el foco del buscador a media palabra.
    const q = $('#q');
    if (q) q.oninput = () => { ST.busca = q.value; vHome(); const n = $('#q');
                               n.focus(); n.setSelectionRange(ST.busca.length, ST.busca.length); };
    const enlazarFiltro = (id, campo) => {
      const el = $(id);
      if (el) el.onchange = () => { ST.filtros[campo] = el.value; vHome(); };
    };
    enlazarFiltro('#fPersona', 'persona');
    enlazarFiltro('#fEstado', 'estado');
    enlazarFiltro('#fMoneda', 'moneda');

    /* El historial se abre desde la lista y NO desde adentro del machote: se
     * consulta para entender qué pasó con una cotización, casi siempre sin
     * querer editarla. */
    /* En una tabla se espera que el RENGLÓN ENTERO abra, no sólo el nombre.
     * Con tarjetas daba igual —la tarjeta era el enlace—; con columnas, dar
     * en un pixel de texto es un blanco de 200 px de ancho en una fila de
     * 1200. Los botones de acción paran la propagación, así que borrar sigue
     * sin abrir nada por error. */
    $$('tr.rw').forEach(tr => {
      tr.style.cursor = 'pointer';
      tr.onclick = (ev) => {
        if (ev.target.closest('a,button,input,label')) return;
        const id = tr.dataset.mid;
        if (id) location.hash = '#/m/' + id;
      };
    });

    pintarPendientes();
    enlazarCopiar();

    $$('[data-hist]').forEach(b => b.onclick = (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const m = mach(b.dataset.hist);
      if (m && G.MachoteHistorial) G.MachoteHistorial.abrir(m);
    });

    $$('[data-borrar]').forEach(b => b.onclick = (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const m = mach(b.dataset.borrar);
      if (!m) return;
      // Segundo candado, además de no pintar el botón: si mañana alguien pinta
      // el botón por error, esto sigue impidiendo borrar lo que ya se vendió.
      if (!borrable(m)) { toast('Un machote enviado a Odoo no se borra.'); return; }
      if (!confirm('¿Eliminar «' + m.nombre + '»?\n\nNo hay deshacer.')) return;
      const i = ST.machotes.findIndex(x => x.id === m.id);
      if (i >= 0) ST.machotes.splice(i, 1);
      /* LA LÁPIDA (V1.23). Sin esto, quitarlo de la lista no alcanzaba: la
       * siguiente bajada veía la fila en el servidor, no la encontraba aquí,
       * y la volvía a meter. Al recargar reaparecía — cada vez. Es el defecto
       * que reportó Esteban de los ejemplos, y le pasaba a cualquier machote
       * ya subido. Se sepulta ANTES de guardar: si `guardarYa` falla por
       * almacenamiento lleno, la lápida ya quedó. */
      if (A && A.marcarBorrado) A.marcarBorrado(m.id);
      guardarYa();
      vHome();
      toast('Machote eliminado.');
    });
  }

  /* ── Machote nuevo ─────────────────────────────────────────────────────
   * La orden es OPCIONAL a propósito: el machote casi siempre nace antes que
   * la orden. Lo que no se puede es ENVIARLO a Odoo sin ella (V1.07). */
  function vNuevo() {
    top('Nuevo machote', 'Comercial', null, '#/');
    $('#fija').innerHTML = '';
    $('#vista').innerHTML =
      '<div class="pad"><div class="wg">' +
      '<h4>Datos para arrancar</h4>' +
      '<label class="campo"><span>Nombre de la cotización</span>' +
      '<input id="n-nombre" class="cel" placeholder="Ej. Modificación de tren de drenado"></label>' +
      '<label class="campo"><span>Cliente</span>' +
      '<input id="n-cliente" class="cel" list="n-clientes" autocomplete="off" ' +
      'placeholder="Escribe para buscar en Odoo…">' +
      '<datalist id="n-clientes"></datalist>' +
      '<span id="n-cliente-est" class="tiny">Leyendo el catálogo de Odoo…</span></label>' +
      '<label class="campo"><span>Orden (opcional)</span>' +
      '<input id="n-so" class="cel" placeholder="SO11836 — se puede dejar vacío"></label>' +
      '<label class="campo"><span>Empresa</span>' +
      '<select id="n-empresa" class="cel">' +
      C.EMPRESAS.map(e => '<option value="' + e.id + '">' + esc(e.corto) + ' · ' + e.moneda + '</option>').join('') +
      '</select></label>' +
      '<div class="tiny nota">Va a nacer con la hoja <strong>DESGLOSE COTIZACIÓN</strong>, una ' +
      '<strong>SECCIÓN 1</strong>, los diez renglones de mano de obra con su tarifa de plantilla ' +
      'y las horas en cero, y <strong>' + C.PARTIDAS_EN_BLANCO + ' renglones de materiales</strong> ' +
      'vacíos. El Tipo (Materiales o Servicios) se elige renglón por renglón, como en el Excel.</div>' +
      '<button class="btn primario" id="n-crear">Crear machote</button>' +
      '<div id="n-err" class="tiny n-bad"></div>' +
      '</div></div>';

    $('#n-crear').onclick = () => {
      const nombre = $('#n-nombre').value.trim();
      if (!nombre) { $('#n-err').textContent = 'Ponle un nombre: es como lo vas a encontrar después.'; return; }
      // El id es lo que se guarda; el texto queda como respaldo para pintar
      // cuando Odoo no conteste. Si lo tecleado no casa con ningún cliente
      // —un prospecto que todavía no está dado de alta— se guarda tal cual y
      // `cliente_id` queda en null: NUNCA se bloquea por eso.
      const txtCliente = $('#n-cliente').value.trim();
      const hit = G.Clientes ? G.Clientes.resolver(txtCliente) : null;
      /* QUIÉN lo captura, del token. Ojo con el nombre del campo: del lado
       * del navegador la sesión lo llama `actor`, no `sub` — es el mismo dato
       * (`auth/suite-login` firma `sub` y responde `actor`), pero buscar
       * `ses.sub` devolvería undefined sin fallar. */
      const S = G.SuiteAuth, ses = (S && S.getSession()) || {};
      const m = C.machoteNuevo({
        nombre: nombre,
        cliente: hit ? hit.nombre : txtCliente,
        cliente_id: hit ? hit.id : null,
        creado_por: ses.actor || '',
        creado_por_nombre: ses.nombre || ses.actor || '',
        so: $('#n-so').value.trim() || null,
        empresa_id: Number($('#n-empresa').value)
      });
      ST.machotes.unshift(m);
      guardarYa();
      ST.hoja = 'desglose';
      location.hash = '#/m/' + m.id;
    };

    poblarClientes();
  }

  /* Llena la lista del campo Cliente. La pantalla YA está pintada cuando esto
   * corre: si Odoo tarda o no contesta, el campo se queda como texto libre y
   * el aviso lo dice — no se traba la creación (regla anti-trabón §8). */
  function poblarClientes() {
    const est = $('#n-cliente-est'), dl = $('#n-clientes');
    if (!est || !dl || !G.Clientes) return;
    G.Clientes.cargar().then(r => {
      // La vista pudo cambiar mientras la red iba y venía.
      if (!document.body.contains(est)) return;
      if (!r.ok) {
        est.className = 'tiny n-warn';
        est.textContent = 'No se pudo leer el catálogo de Odoo (' + r.error +
          '). Escribe el nombre del cliente: se guarda igual.';
        return;
      }
      dl.innerHTML = r.clientes
        .map(c => '<option value="' + esc(c.nombre) + '"></option>').join('');
      est.className = 'tiny';
      est.textContent = r.clientes.length + ' clientes de Odoo. Si el tuyo no está, ' +
        'escríbelo: se guarda como texto hasta que lo den de alta.';
    });
  }

  /* ── El libro ────────────────────────────────────────────────────────── */
  function vMachote(id) {
    const m = mach(id); if (!m) { location.hash = '#/'; return; }
    // Al cambiar de cotización se vuelve al DESGLOSE: arrastrar la hoja
    // abierta de la anterior deja al analista en una sección que no pidió.
    if (ST.libroAbierto !== id) { ST.hoja = 'desglose'; ST.libroAbierto = id; }
    const c = C.calcular(m);
    const soloLectura = !puedoEscribir(m);
    const fol = folioDe(m);
    top(cli(m), soloLectura
      ? ('de ' + (m._dueno_nombre || m._dueno || 'otra persona'))
      : ((fol || m.id) + (m.so ? ' · ' + m.so : '')), null, '#/');

    const hojas = [{ id: 'desglose', label: 'DESGLOSE COTIZACIÓN' }]
      .concat(m.secciones.map(s => ({ id: s.id, label: s.nombre || 'SECCIÓN' })));
    if (!hojas.some(h => h.id === ST.hoja)) ST.hoja = 'desglose';

    /* AVISO ARRIBA, ANTES DE LA HOJA. Un machote ajeno se ve igual que el
     * propio, así que si no se dice, alguien teclea encima creyendo que es
     * suyo y pierde el rato: los campos están bloqueados y no va a entender
     * por qué. El aviso dice de quién es y qué puede hacer en su lugar. */
    /* EL FOLIO, ARRIBA Y JUNTO AL NOMBRE. Es lo que alguien dicta por
     * teléfono, así que se puede copiar de un toque: pedirle a un vendedor
     * que seleccione texto con el dedo en un renglón de ocho caracteres es
     * pedirle que copie mal. */
    const cabecera =
      '<div class="cab-folio">' +
        (fol
          ? '<button class="folio grande" data-copiar="' + esc(fol) + '" ' +
            'title="Copiar el folio">' + esc(fol) + '</button>'
          : '<span class="folio grande sin" title="El folio lo asigna el servidor al guardar. ' +
            'Mientras tanto esta cotización se identifica por su id de captura.">sin folio</span>') +
        /* ── V1.27 · RENOMBRAR (pedido de Montalvo) ─────────────────────
         * El dueño puede, en cualquier momento y sin ceremonia: un nombre no
         * cambia ni el precio ni el permiso, y hoy la única forma de corregir
         * un «test monty usd» era crear otra cotización.
         *
         * Queda en el HISTORIAL con el nombre viejo y el nuevo, que es lo que
         * lo hace reversible: sin eso, renombrar borraría de qué se hablaba en
         * el correo de la semana pasada. */
        (soloLectura
          ? '<span class="cab-nombre">' + esc(m.nombre || 'Sin nombre') + '</span>'
          : '<input class="cab-nombre cel" data-nombre value="' + esc(m.nombre || '') + '" ' +
            'placeholder="Sin nombre" title="El nombre de la cotización. Se puede cambiar; ' +
            'el cambio queda en el historial.">') +
      '</div>';

    $('#vista').innerHTML = cabecera +
      (soloLectura
        ? '<div class="aviso-ajeno">Esta cotización es de <strong>' +
          esc(m._dueno_nombre || m._dueno || 'otra persona') + '</strong>. ' +
          'La estás viendo en <strong>sólo lectura</strong>: se puede revisar, no editar. ' +
          'Si quieres partir de ella, duplícala a tu nombre.</div>'
        : '') +
      /* La franja del préstamo. Dos caras del mismo dato: al PRESTATARIO le
       * dice hasta cuándo puede escribir; al DUEÑO, a quién le prestó y hasta
       * cuándo, con el botón de recoger. Es cortesía, no seguridad —saber que
       * el otro está adentro evita la mayoría de los choques sin candados—,
       * y por eso vive arriba, donde se ve sin buscarla. */
      (G.MachotePrestamo ? G.MachotePrestamo.franja(m) : '') +
      '<div class="libro' + (soloLectura ? ' solo-lectura' : '') + '">' +
      '<div class="hojas" id="hojas">' + hojas.map((h, i) =>
        '<button class="pestana' + (h.id === ST.hoja ? ' on' : '') +
        (i > C.MAX_SECCIONES ? ' fuera' : '') + '" data-hoja="' + esc(h.id) + '"' +
        (i > C.MAX_SECCIONES ? ' title="Fuera de las diez ranuras del machote: no llegaría al precio"' : '') +
        '>' + esc(h.label) + '</button>').join('') +
        '<button class="pestana mas" data-nueva="1" title="Nueva sección">+</button>' +
      '</div><div id="hoja"></div></div>';

    $('#hojas').onclick = (e) => {
      const b = e.target.closest('[data-hoja]');
      if (b) { ST.hoja = b.dataset.hoja; return vMachote(id); }
      if (e.target.closest('[data-nueva]')) {
        /* Por el motor, no a mano. La sección que armaba esta línea nacía
         * VACÍA —sin los diez renglones de mano de obra ni los treinta de
         * materiales— cuando el machote real tiene exactamente diez por
         * sección; y ahora, además, tiene que nacer con sus propios
         * multiplicadores. Se descubrió al hacerlos por sección.
         *
         * Arranca con los del machote, que es lo que se ve en las demás, y
         * desde ahí se mueve sin tocar a nadie. */
        const base = Object.assign({}, C.MARGENES_PLANTILLA, m.margenes || {});
        const nueva = C.seccionNueva('SECCIÓN ' + (m.secciones.length + 1), m.moneda, base);
        m.secciones.push(nueva);
        ST.hoja = nueva.id; tocado(m); return vMachote(id);
      }
    };
    enlazarCopiar();

    pintarHoja(m);
    barra(m, c);
  }

  /** Repinta el aviso de «lo que no ha subido», si la lista está en pantalla.
   *
   *  Se llama al pintar la lista Y cada vez que cambia el pulso, porque el
   *  pulso y esto miden LO MISMO —`pendientes()`, la comparación contra la
   *  libreta— y tenerlos desincronizados es tener dos verdades en pantalla: el
   *  punto en «guardado» y el aviso diciendo que falta algo.
   *
   *  Toca sólo su propio hueco, nunca repinta la lista: repintarla entera
   *  mataría el foco de quien esté tecleando en el buscador. */
  function pintarPendientes() {
    const host = $('#avPendHost');
    if (!host) return;                       // no estamos en la lista
    const n = (A && A.pendientes) ? A.pendientes(ST.machotes) : 0;

    /* ── «¿ESTÁ TODO LO MÍO EN EL SERVIDOR?» (V1.26) ──────────────────────
     * La pregunta le toca a CADA QUIEN sobre lo suyo. Que hasta ahora sólo la
     * pudiera hacer quien tuviera `comercial:admin` era un accidente de
     * historia: Control fue el primero que le preguntó al servidor y la
     * pregunta se quedó viviendo ahí.
     *
     * Se contesta sin permiso nuevo y sin endpoint nuevo, comparando lo que la
     * última bajada YA trajo contra lo que este navegador sabe sin subir.
     *
     * Y se contesta CON FECHA, siempre. «Todas están en el servidor» a secas
     * es una promesa sin plazo; «las 7 estaban a las 9:41» es una medición. */
    const comp = (A && A.comprobacion) ? A.comprobacion(ST.machotes) : null;
    const reloj = (iso) => {
      const t = Date.parse(iso);
      if (!isFinite(t)) return '';
      const d = new Date(t), hoy = new Date();
      const hora = d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
      const mismo = d.toDateString() === hoy.toDateString();
      return mismo ? ('a las ' + hora)
                   : (d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + ' ' + hora);
    };

    let linea = '';
    if (comp && comp.total > 0) {
      if (!comp.comprobado_at) {
        /* NO se ha podido preguntar. Eso NO es «falta algo» ni «está todo»:
         * es no saber, y decirlo así es la única respuesta honesta. */
        linea = '<div class="comprob no-sabe">Todavía no se ha podido comprobar con el ' +
          'servidor qué hay de lo tuyo. Lo capturado sigue guardado en este navegador.</div>';
      } else {
        /* Un punto al final, pero SIN duplicarlo: `toLocaleTimeString('es-MX')`
         * ya devuelve «6:06 p.m.» con punto, así que concatenar otro daba
         * «p.m..». Es el MISMO bug que ya se arregló en la franja de préstamo
         * (`prestamo.js` · `punto()`), reaparecido en una superficie nueva —y
         * otra vez sólo se vio en la captura, no en el diff. */
        const rel = esc(reloj(comp.comprobado_at));
        const fin = /[.!?…]$/.test(rel) ? '' : '.';
        linea = comp.faltan === 0
          ? '<div class="comprob bien">' +
            // «Tus 1 cotización» no lo dice nadie. En singular cambia el artículo.
            (comp.total === 1
              ? 'Tu cotización estaba'
              : 'Tus <strong>' + comp.total + '</strong> cotizaciones estaban') +
            ' en el servidor <strong>' + rel + '</strong>' + fin + '</div>'
          : '<div class="comprob falta"><strong>' + comp.en_servidor + ' de ' + comp.total +
            '</strong> cotizaciones tuyas estaban en el servidor ' + rel + fin + '</div>';
      }
    }

    if (!n) { host.innerHTML = linea; return; }

    host.innerHTML = linea + '<div class="aviso pend" id="avPend">' +
      '<strong>' + n + (n === 1 ? ' cotización tuya no ha subido' : ' cotizaciones tuyas no han subido') +
      '</strong> al servidor. Siguen guardadas en este navegador y se reintenta solo. ' +
      '<button class="btn fantasma chico" id="bVerPend">Cuáles son</button></div>';

    /* «Cuáles son»: marca los renglones que no han subido y lleva al primero.
     * Es lo único que la franja hacía y el pulso no podía hacer. */
    const bp = $('#bVerPend');
    if (bp) bp.onclick = () => {
      const sinSubir = ST.machotes.filter(m => A && A.pendienteUno && A.pendienteUno(m));
      if (!sinSubir.length) { pintarPendientes(); return; }
      $$('[data-mid]').forEach(el => el.classList.remove('marcado'));
      sinSubir.forEach(m => $$('[data-mid="' + m.id + '"]').forEach(el => el.classList.add('marcado')));
      const primero = $('[data-mid="' + sinSubir[0].id + '"]');
      if (primero && primero.scrollIntoView) primero.scrollIntoView({ block: 'center' });
    };
  }

  /** Engancha TODO `[data-copiar]` que haya en pantalla.
   *
   *  Vive aquí y no dentro de cada vista porque desde V1.24 hay muchos —uno
   *  por renglón de la lista, más el del encabezado del machote— y la versión
   *  anterior enganchaba `$('[data-copiar]')`, que es el PRIMERO. En la lista
   *  eso habría dejado un botón vivo y todos los demás muertos: se ven igual,
   *  y sólo el primero copia. */
  function enlazarCopiar() {
    $$('[data-copiar]').forEach(b => {
      b.onclick = (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const txt = b.dataset.copiar;
        const listo = () => toast('Folio ' + txt + ' copiado.');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(listo, () => respaldoCopiar(txt, listo));
        } else respaldoCopiar(txt, listo);
      };
    });
  }

  /* `navigator.clipboard` no existe fuera de un origen seguro ni en
   * navegadores viejos, así que hay respaldo con un textarea y `execCommand`
   * — está obsoleto y funciona, que es lo que importa cuando alguien está en
   * el celular a media planta. Y si las dos fallan, se dice; un botón que no
   * hace nada y no avisa es peor que no tenerlo. */
  function respaldoCopiar(txt, listo) {
    try {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) listo(); else toast('No se pudo copiar. El folio es ' + txt);
    } catch (e) { toast('No se pudo copiar. El folio es ' + txt); }
  }

  /** El HTML de la hoja abierta. Separado del pintado para poder renderizar a
   *  memoria y comparar, sin tocar el DOM vivo. */
  /* ── DÓNDE SE EJECUTA (V1.26) ────────────────────────────────────────────
   *
   * Va en el DESGLOSE, junto a empresa y moneda, porque es del MACHOTE: una
   * cotización se ejecuta en un lugar. Los COSTOS de viaje, en cambio, van en
   * la sección, con el resto del costo.
   *
   * El país manda sobre lo demás: si hay catálogo de estados para ese país se
   * ofrece la lista; si no, texto libre — y se DICE, en vez de enseñar un
   * desplegable vacío que se lee como «no hay estados». */
  function lugarHTML(m, c) {
    const g = G.MachoteGeo;
    const cat = g && g.datos();
    const cod = (m.pais || '').toUpperCase();
    const conEstados = !!(g && g.tieneEstados(cod));
    const foraneo = c.lugar.foraneo;

    const selPais = cat
      ? '<select class="cel" data-cel="pais">' +
          '<option value=""' + (m.pais ? '' : ' selected') + '>Elige el país…</option>' +
          g.paises().map(p => '<option value="' + esc(p.codigo) + '"' +
            (cod === p.codigo ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join('') +
        '</select>'
      /* Mientras el catálogo no llega, texto libre con lo que ya haya. No se
       * bloquea la captura por esperar a la red. */
      : cel('pais', m.pais, 'w80') + '<span class="tiny nota"> cargando países…</span>';

    const selEstado = conEstados
      ? '<select class="cel" data-cel="region">' +
          '<option value=""' + (m.region ? '' : ' selected') + '>Elige el estado…</option>' +
          g.estados(cod).map(e => '<option value="' + esc(e) + '"' +
            (m.region === e ? ' selected' : '') + '>' + esc(e) + '</option>').join('') +
        '</select>'
      : cel('region', m.region, 'desc');

    const v = c.viaje;
    /* ── FRECUENTES ARRIBA ────────────────────────────────────────────────
     * Nadie tiene que buscar en una lista de 249 países lo que usa todos los
     * días. Un toque pone país, estado y ciudad de una vez.
     *
     * Se pintan TODAS, no sólo las del país elegido: la gracia es cambiar de
     * Monterrey a San Antonio de un toque, y filtrar por el país actual
     * escondería justo la que se quiere. Salen del JSON de configuración, así
     * que agregar una ciudad no toca este archivo. */
    const frec = (g && g.frecuentes && g.frecuentes()) || [];
    const chips = frec.length
      ? '<div class="frec">' +
          '<span class="tiny nota">Frecuentes:</span>' +
          frec.map(f => {
            const puesta = C.llano(m.ciudad) === C.llano(f.ciudad) &&
                           C.llano(m.pais) === C.llano(f.pais);
            return '<button class="chip-frec' + (puesta ? ' on' : '') + (f.sede ? ' sede' : '') + '"' +
              ' data-frec="' + esc(f.pais + '|' + f.region + '|' + f.ciudad) + '"' +
              ' title="' + esc((f.nota || '') + ' ' + f.region + ', ' + paisNom(f.pais)).trim() + '">' +
              esc(f.ciudad) + (f.sede ? ' ★' : '') + '</button>';
          }).join('') +
        '</div>'
      : '';

    return '<div class="blk lugar' + (foraneo ? ' foraneo' : '') + '">' +
      '<div class="et2">DÓNDE SE EJECUTA</div>' +
      chips +
      '<table class="hoja2"><tbody>' +
      '<tr><td class="et">País</td><td>' + selPais + '</td></tr>' +
      '<tr><td class="et">Estado / Provincia</td><td>' + selEstado +
        (cod && !conEstados
          ? '<div class="tiny nota">Sin catálogo de estados para ' + esc(paisNom(cod)) +
            '. Escríbelo como venga.</div>'
          : '') + '</td></tr>' +
      '<tr><td class="et">Ciudad</td><td>' + cel('ciudad', m.ciudad, 'desc') + '</td></tr>' +
      '</tbody></table>' +
      (c.lugar.tiene
        ? '<div class="lugar-veredicto ' + (foraneo ? 'fuera' : 'sede') + '">' +
            (foraneo
              ? '<strong>Cotización foránea:</strong> se ejecuta fuera de Nuevo León, ' +
                'así que hay traslado que cobrar. En cada sección con trabajo salen ' +
                'los cinco conceptos —vuelos, hotel, viáticos, taxis y gasolina— y ' +
                'cada uno necesita una decisión: su importe, o «no se ocupa». ' +
                'Los días de viaje van en mano de obra.'
              : '<strong>En la sede.</strong> Nuevo León es local: no hace falta nada de viaje.') +
          '</div>'
        : '<div class="lugar-veredicto falta"><strong>Falta decir dónde se ejecuta.</strong> ' +
          'De ahí sale si hay que cobrar traslado.</div>') +
      (foraneo ? bloqueViajeHTML(m, c, v) : '') +
      '</div>';
  }

  const paisNom = (cod) => {
    const g = G.MachoteGeo, p = g && g.pais(cod);
    return (p && p.nombre) || cod || '';
  };

  /* Lo que sólo tiene sentido cuando la cotización es foránea: la salida
   * explícita del bloqueo, los recargos y quién paga los días. */
  function bloqueViajeHTML(m, c, v) {
    const eua = c.lugar.eua;
    return '<div class="viaje-cfg">' +
      '<label class="viaje-na"><input type="checkbox" data-viaje="no_aplica"' +
        (v.no_aplica ? ' checked' : '') + '> ' +
        '<span>No se ocupan conceptos de viaje en esta cotización</span></label>' +
      '<div class="tiny nota">Márcalo sólo si el cliente pone el traslado o la gente ya ' +
      'está en sitio. Queda anotado como decisión, no como olvido.</div>' +
      /* ── V1.28 · DOS REGLAS DISTINTAS, Y SE DICEN POR SEPARADO ──────────
       *
       * Montalvo entendió que el recargo dependía de VIAJAR, y propuso que
       * aplicara fuera de Monterrey. No es una mala lectura: estaban en la
       * misma tabla, bajo el mismo título de viaje, una debajo de la otra.
       *
       *   · Los GASTOS DE VIAJE salen de ejecutar fuera de Nuevo León.
       *   · El RECARGO sale de ejecutar en Estados Unidos, y es una regla
       *     laboral de allá — un trabajo en Ciudad Juárez es foráneo y no la
       *     lleva; uno en Dallas lleva las dos.
       *
       * Por eso el recargo ya NO se captura aquí: se captura EN LA SECCIÓN,
       * junto a la mano de obra que encarece, que además es su alcance real
       * (decisión de Esteban, 11-sep). Aquí sólo queda dicho dónde está y por
       * qué es otra cosa — si se dejara también la celda del machote habría
       * dos escritores del mismo número (§20 regla 4). */
      '<div class="viaje-reglas' + (eua ? ' eua' : '') + '">' +
        '<strong>Los gastos de viaje y el recargo de fin de semana son dos reglas distintas.</strong> ' +
        'Lo de arriba —vuelos, hotel, viáticos, taxis, gasolina— sale de ejecutar fuera de ' +
        'Nuevo León, y por eso está aquí. El recargo de fin de semana y de día festivo sale de ' +
        'ejecutar <strong>en Estados Unidos</strong>: es una regla laboral de allá, no un costo ' +
        'de viajar. ' +
        (eua
          ? 'Como este trabajo se ejecuta en Estados Unidos, el recargo se captura ' +
            '<strong>en cada sección</strong>, junto a la mano de obra que encarece — ahí es ' +
            'donde se decide, porque una sección puede trabajarse en fin de semana y otra no.'
          : 'Este trabajo no se ejecuta en Estados Unidos, así que el fin de semana va a ' +
            'tarifa normal y no hay recargo que capturar.') +
      '</div>' +
      '<table class="hoja2"><tbody>' +
      '<tr><td class="et">Quién paga los días de viaje</td><td>' +
        '<select class="cel" data-cel="viaje.paga_dias">' +
        C.PAGA_DIAS.map(o => '<option value="' + esc(o.id) + '"' +
          (v.paga_dias === o.id ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') +
        '</select>' +
        '<div class="tiny nota">Decisión de negocio abierta. El machote no la resuelve: ' +
        'la registra, para que se sepa cuál se usó.</div>' +
      '</td></tr>' +
      '</tbody></table></div>';
  }

  /* ── ATAJO A KIWI (V1.26) ────────────────────────────────────────────────
   *
   * ⚠️ NO se incrusta en un recuadro, y no es una decisión de estilo: **Kiwi lo
   * prohíbe**. Su cabecera dice
   *   `frame-ancestors 'self' kiwi.com *.kiwi.com skypicker.com *.skypicker.com`
   * y `yinyo1.github.io` no está en esa lista, así que un iframe saldría en
   * blanco — medido el 2026-09-10 contra el sitio en vivo, no supuesto. Un
   * recuadro vacío se lee como aplicación rota; una pestaña nueva, no.
   *
   * Y NO trae el precio: la persona lo consulta y lo captura. Esto es un
   * atajo, no una integración, y decirlo evita que alguien espere que el
   * número se actualice solo.
   *
   * El enlace se arma con lo que el machote YA sabe. Si el nombre de la ciudad
   * no le cuadra a Kiwi, su propia pantalla deja corregirlo: llegar con la
   * búsqueda a medio armar es mejor que llegar en blanco. */
  function kiwiURL(m) {
    const g = G.MachoteGeo;
    const trozo = (ciudad, estado, pais) => {
      const p = g && g.pais(pais);
      return [ciudad, estado, (p && p.nombre) || pais]
        .filter(Boolean).join('-')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    };
    const origen = trozo(C.SEDE.ciudad, C.SEDE.estado, C.SEDE.pais);
    const destino = trozo(m.ciudad, m.region, m.pais);
    if (!destino) return null;
    // Las fechas si las hay. Kiwi acepta el rango en la ruta; sin fechas
    // manda a la búsqueda con origen y destino puestos, que ya es el 80%.
    const f = [m.fecha_viaje_ida, m.fecha_viaje_vuelta].filter(Boolean);
    return 'https://www.kiwi.com/es/search/results/' + origen + '/' + destino +
           (f.length ? '/' + f.join('/') : '');
  }

  function kiwiBoton(m, c) {
    const u = kiwiURL(m);
    if (!u) return '';
    return '<a class="chip-viaje kiwi" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer"' +
      ' title="Abre Kiwi en otra pestaña con la búsqueda ya armada. El precio se consulta ahí y se captura aquí: ' +
      'no se trae solo.">✈ Consultar vuelos en Kiwi ↗</a>';
  }

  /** Cuántos días lleva un precio consultado, y cómo se ve. */
  function consultadoHTML(l, p) {
    const hoy = new Date();
    const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                       '-' + String(d.getDate()).padStart(2, '0');
    if (!l.consultado_at) {
      return '<button class="lnk consul" data-consul="' + esc(p) + '|' + iso(hoy) + '"' +
        ' title="Deja anotado que este precio se consultó hoy">¿de cuándo es?</button>';
    }
    const t = Date.parse(l.consultado_at + 'T12:00:00');
    const dias = isFinite(t) ? Math.round((hoy - t) / 86400000) : null;
    const viejo = dias !== null && dias > 21;
    return '<div class="tiny consul-fecha' + (viejo ? ' viejo' : '') + '"' +
      (viejo ? ' title="Más de tres semanas. Los precios de vuelo se mueven; conviene volver a consultar."' : '') +
      '>consultado ' + esc(fechaCorta(l.consultado_at)) +
      (dias === null ? '' : (dias <= 0 ? ' · hoy' : ' · hace ' + dias + ' día' + (dias === 1 ? '' : 's'))) +
      ' <button class="lnk" data-consul="' + esc(p) + '|' + iso(hoy) + '" title="Vuelve a marcar hoy">↻</button>' +
      '</div>';
  }

  const fechaCorta = (iso) => {
    const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const p = String(iso || '').split('-');
    return p.length === 3 ? (Number(p[2]) + '-' + (MES[Number(p[1]) - 1] || '?')) : String(iso || '');
  };

  function hojaHTML(m, c) {
    const s = m.secciones.find(x => x.id === ST.hoja);
    // La banda de estado encabeza TODA hoja. Si sólo saliera en el DESGLOSE,
    // una hoja de sección congelada mostraría catorce campos apagados sin
    // decir por qué — que es justo el silencio que perseguimos.
    return bloqueEstado(m) + (s ? hojaSeccion(m, s, c) : hojaDesglose(m, c));
  }

  function pintarHoja(m) {
    const c = C.calcular(m);
    $('#hoja').innerHTML = hojaHTML(m, c);
    enlazar(m);
    trabarSiNoPuedoEscribir(m);
    if (G.MachotePrestamo) G.MachotePrestamo.montar(m, vMachote);
  }

  /* Traba la hoja cuando no se puede escribir en ella: es de otra persona y
   * no me la prestó, o el préstamo ya venció.
   *
   * Va AQUÍ y no en cada sitio que pinta porque `pintarHoja` es el único punto
   * por el que pasa toda la hoja — el mismo criterio que el filtro de la demo
   * en `empujar`. Un camino nuevo que repinte queda cubierto solo.
   *
   * Esto NO es la seguridad: la seguridad es que el servidor comprueba el
   * préstamo contra la base en cada guardado, con su propio reloj, y rechaza
   * con el motivo exacto. Esto es para que nadie pierda el rato tecleando
   * encima de algo que no se va a guardar. */
  function trabarSiNoPuedoEscribir(m) {
    if (!m || puedoEscribir(m)) return;
    const hoja = $('#hoja'); if (!hoja) return;
    hoja.querySelectorAll('input, select, textarea, button').forEach(el => {
      el.disabled = true;
      el.setAttribute('aria-disabled', 'true');
      if (!el.title) el.title = 'Es de otra persona: sólo lectura.';
    });
  }

  /** Refresca SÓLO los derivados, sin repintar.
   *
   *  Repintar la hoja en cada tecla mata el foco a media cifra, así que antes
   *  los derivados no se movían hasta salir del campo: quien capturaba no veía
   *  la consecuencia de lo que escribía donde la estaba escribiendo.
   *
   *  Se renderiza la hoja a un nodo suelto, se comparan las celdas `.calc` una
   *  a una y sólo se copian las que cambiaron. Los `input` del DOM vivo no se
   *  tocan, así que el cursor se queda donde estaba. Las que cambiaron
   *  parpadean medio segundo.
   *
   *  Si el número de celdas no coincide, la estructura cambió (se agregó un
   *  renglón, se plegó un grupo) y ahí sí toca repintar entero. */
  function refrescarCalculados(m) {
    const cont = $('#hoja'); if (!cont) return;
    const c = C.calcular(m);
    const tmp = document.createElement('div');
    tmp.innerHTML = hojaHTML(m, c);

    const vivos = $$('.calc', cont), nuevos = $$('.calc', tmp);
    if (vivos.length !== nuevos.length) { pintarHoja(m); return c; }

    vivos.forEach((el, i) => {
      const html = nuevos[i].innerHTML;
      if (el.innerHTML === html) return;
      el.innerHTML = html;
      el.className = nuevos[i].className;
      el.classList.remove('cambio');
      void el.offsetWidth;          // fuerza reflujo para reiniciar la animación
      el.classList.add('cambio');
    });
    return c;
  }

  /* ── Hoja de sección ─────────────────────────────────────────────────── */
  function hojaSeccion(m, s, c) {
    const cs = c.secciones.find(x => x.id === s.id) || {};
    const idx = m.secciones.findIndex(x => x.id === s.id);
    // Los de ESTA sección, resueltos por el motor. No `c.margenes`, que es la
    // capa de arranque del machote y era lo que hacía que las cuatro cajas se
    // vieran iguales en todas las hojas.
    const mg = cs.margenes || c.margenes;

    // Bloque de encabezado: las once filas de la izquierda y la tabla de
    // márgenes de la derecha, tal como están en la hoja.
    const izq = [
      ['Mano de obra', mx(cs.costoMo)],
      ['Materiales y servicio', mx(cs.costoMat)],
      ['Costos Sumados (Mat, Servicio, Mano de obra)', mx2(cs.costo)],
      ['', ''],
      // El porcentaje al lado del importe: sin él, "Comisiones FTS $79,108"
      // no dice si eso es un 5% o un 15%, que es lo que se está decidiendo.
      ['Comisiones CLIENTE ' + pc(c.pctCli), mx(cs.venta ? c.escenario.comisionCliente * (cs.venta / (c.venta || 1)) : 0)],
      ['Comisiones FTS ' + pc(c.pctFts), mx(cs.venta ? c.escenario.comisionFts * (cs.venta / (c.venta || 1)) : 0)],
      ['Costos totales (Cuanto le cuesta a FTS?)', mx(cs.costo + (c.escenario.comisionFts + c.escenario.comisionCliente) * (cs.venta / (c.venta || 1)))],
      ['Precio de Venta FTS (Antes de comisiones)', mx(cs.venta)],
      ['Precio de Venta a cliente (Despues de comisiones)', mx2(cs.esc ? cs.esc.con_utilidad.precio : null)],
      ['Utilidad', mx2((cs.esc ? cs.esc.con_utilidad.precio : 0) - cs.costo)],
      ['% Utilidad Obtenido', pc(cs.margenObtenido)]
    ].map(r => '<tr><td class="et">' + esc(r[0]) + '</td><td class="vl mono calc">' + r[1] + '</td></tr>').join('');

    const mgp = 'mg:' + s.id + ':';
    const der = [
      ['Programador', mgp + 'programador', mg.programador],
      ['Mano de obra', mgp + 'mano_obra', mg.mano_obra],
      ['Materiales', mgp + 'materiales', mg.materiales],
      ['Servicios', mgp + 'servicios', mg.servicios]
    ].map(r => '<tr><td class="et">' + r[0] + '</td><td>' + celNum(r[1], r[2], 'w70') + '</td></tr>').join('') +
      // Las comisiones SÍ son del machote entero: se pactan una vez para la
      // cotización. Por eso siguen sin el prefijo de sección, y por eso se
      // dice en la pantalla — dos tablas pegadas con reglas distintas, si no
      // se explica, se leen como una sola.
      '<tr><td class="et">Comision FTS</td><td>' + celPct('comision_fts', m.comision_fts) + '</td></tr>' +
      '<tr><td class="et">Comision CLIENTE</td><td>' + celPct('comision_cliente', m.comision_cliente) + '</td></tr>';

    const nombreSec =
      '<div class="nomsec"><span class="et">NOMBRE DE SECCIÓN</span>' + cel('nom:' + s.id, s.nombre, 'nombre') +
      '<span class="accsec">' +
        (idx > 0 ? '<button class="ico" data-movsec="' + s.id + '|-1" title="Mover a la izquierda">←</button>' : '') +
        (idx < m.secciones.length - 1 ? '<button class="ico" data-movsec="' + s.id + '|1" title="Mover a la derecha">→</button>' : '') +
        '<button class="ico" data-dupsec="' + s.id + '" title="Duplicar sección">⧉</button>' +
        (m.secciones.length > 1 ? '<button class="ico peligro" data-delsec="' + s.id + '" title="Eliminar sección">×</button>' : '') +
      '</span></div>' +
      '<div class="tiny nota">Sección ' + (idx + 1) + ' de ' + m.secciones.length +
      (idx >= C.MAX_SECCIONES ? ' · <strong class="n-bad">fuera de las diez ranuras del machote</strong>' : '') +
      '. Las secciones ocupan la ranura por posición, no por nombre.</div>';

    const cab =
      // El nombre va PRIMERO: es lo que dice en qué sección estás parado, y
      // debajo de dos tablas de números no se lee hasta que ya te perdiste.
      nombreSec +
      '<div class="cab">' +
      '<div class="blk"><table class="hoja2"><thead><tr><th>Costos desglosados</th><th></th></tr></thead>' +
      '<tbody>' + izq +
      '<tr><td class="et">Horas sección</td><td class="vl mono calc">' + Math.round(cs.horas || 0) + '</td></tr>' +
      '</tbody></table></div>' +
      '<div class="blk"><table class="hoja2"><thead><tr><th>Concepto</th><th>Margen de utilidad</th></tr></thead>' +
      '<tbody>' + der + '</tbody></table>' +
      '<div class="tiny nota">Los cuatro multiplicadores son <strong>de esta sección</strong>; ' +
      'las dos comisiones son de toda la cotización.<br>' +
      'Horas extras = mano de obra × 2 = <strong>' + mg.extra + '</strong>. No se captura, igual que en el Excel.</div>' +
      '</div></div>';

    /* ── V1.28 · EL RECARGO DE ESTA SECCIÓN ───────────────────────────────
     *
     * Va pegado a la mano de obra porque es lo que encarece: la tarifa de las
     * horas de fin de semana y de día festivo de ESTA sección. Estaba en el
     * panel de viaje del machote, y ahí se leía como un costo de viajar y
     * valía para toda la cotización — las dos cosas mal (decisión de Esteban,
     * 11-sep).
     *
     * **Sólo se ofrece cuando se ejecuta en Estados Unidos.** En Ciudad Juárez
     * no aparece: no hay nada que decidir, y una celda que no mueve un peso
     * enseña a llenar celdas sin mirar.
     *
     * Que se haya apartado del valor de arranque SE VE, igual que un margen
     * escrito a mano encima de la fórmula. El recargo mueve el margen, y un
     * número movido que no se nota es exactamente el caso de las comisiones
     * que obligó a construir el histórico. */
    const recSec = cs.recargos || C.recargosDe(m, s);
    const filaRec = (clave, rotulo, ayuda) => {
      const r = recSec[clave];
      const porDef = (r.porDefecto === null) ? 'vacío' : Math.round(r.porDefecto * 100) + '%';
      /* La marca es `≠ 30%`, no un icono: es EXACTAMENTE el lenguaje con el
       * que ya se señala un margen escrito a mano encima de la fórmula
       * (`≠ 1.8`), así que quien aprendió a leer uno lee el otro sin que
       * nadie se lo explique. Un lápiz, además, lo pinta el sistema como
       * emoji a color y grita más que el dato. */
      const nota = r.apartado
        ? 'Apartado en esta sección. De arranque: ' + porDef + '. Sólo cambia aquí.'
        : (r.origen === 'machote'
          ? 'Viene del machote, capturado antes de que el recargo fuera por sección. ' +
            'Escribe otro y cambia sólo en esta sección.'
          // Con `porDefecto` en null —el festivo— «valor de arranque» no dice
          // nada: el arranque es que está VACÍO, y eso lo explica la ayuda.
          : (r.porDefecto === null
            ? 'Sin valor de arranque. Escribe uno y cambia sólo en esta sección.'
            : 'Valor de arranque. Escribe otro y cambia sólo en esta sección.'));
      return '<tr><td class="et">' + esc(rotulo) +
        (r.apartado ? '<span class="rec-marca" title="Apartado del valor de arranque (' +
          porDef + ') en esta sección.">≠ ' + porDef + '</span>' : '') + '</td>' +
        '<td>' + celPct('rec:' + s.id + ':' + clave, r.pct, 'w80' + (r.apartado ? ' pisado' : '')) +
          '<div class="tiny ' + (r.apartado ? 'n-warn' : 'nota') + '">' + nota + '</div>' +
          (ayuda ? '<div class="tiny nota">' + ayuda + '</div>' : '') +
        '</td></tr>';
    };
    const bloqueRecargo = c.lugar.eua
      ? '<div class="rec-sec' + (cs.recargosApartados ? ' apartado' : '') + '">' +
          '<div class="secc-tit">RECARGO DE ESTA SECCIÓN' +
            '<span class="secc-sub"> · porque se ejecuta en Estados Unidos, no porque se viaje' +
            '</span></div>' +
          '<div class="tiny nota">Encarece las <strong>horas en fin de semana</strong> y las ' +
          '<strong>horas en día festivo</strong> de abajo. Es del tramo de trabajo, no del ' +
          'proyecto: otra sección puede tener otro, y un machote nuevo arranca otra vez en el ' +
          'valor de plantilla.</div>' +
          '<table class="hoja2"><tbody>' +
            filaRec('fin_semana', 'Recargo fin de semana', 'Sábado y domingo.') +
            filaRec('festivo', 'Recargo día festivo',
              'Sin confirmar con nadie. Vacío = tarifa normal.') +
          '</tbody></table>' +
        '</div>'
      : '';

    // COSTO MANO DE OBRA — los diez renglones siempre presentes, en sus tres grupos.
    let filasMo = '';
    C.GRUPOS.forEach(g => {
      const roles = C.ROLES.filter(r => r.grupo === g.id);
      // Si todos los renglones del grupo van en cero, su rótulo se pliega con
      // ellos: un título solo, sin nada debajo, se lee como un error.
      const grupoVacio = roles.every(rol => {
        const l = s.mo.find(x => x.rol === rol.id);
        return !l || !(Number(l.qty) > 0);
      });
      filasMo += '<tr class="grupo' + (grupoVacio ? ' enCero' : '') + '"><td colspan="9">' +
                 esc(g.label) +
                 /* El grupo de viaje se explica solo: quien nunca ha cotizado
                  * fuera no sabe que existe ni para qué. */
                 (g.id === 'viaje'
                   ? '<span class="grupo-sub"> · los días de vuelo y las horas de fin de ' +
                     'semana. Se pagan distinto, pero salen de la misma cuenta.</span>'
                   : '') + '</td></tr>';
      roles.forEach(rol => {
        let i = s.mo.findIndex(l => l.rol === rol.id);
        if (i < 0) { s.mo.push({ rol: rol.id, qty: '', personas: 1, pu: rol.pu, moneda: m.moneda }); i = s.mo.length - 1; }
        // La SECCIÓN va al motor. Sin ella el renglón se calcula con los
        // multiplicadores del machote y la hoja muestra dos verdades: el total
        // de arriba con el de la sección, y la línea de abajo con el viejo.
        const l = s.mo[i], cl = C.costoMo(l, m, s), p = 's:' + s.id + ':mo:' + i + ':';
        /* La unidad la dice el ROL, no la columna: los días de viaje se
         * capturan en DÍAS. Poner «Horas» ahí haría que cinco días de vuelo se
         * leyeran como cinco horas — y el motor ya los cuenta aparte, así que
         * la pantalla tiene que decir lo mismo que la cuenta. */
        const rec = cl.recargo;
        const vacia = !(Number(l.qty) > 0);
        // Verde = cantidad Y precio. Con sólo horas, el renglón está a medias y
        // no aporta un peso al total; pintarlo diría "listo" de algo que todavía
        // no suma.
        const cls = C.capturada(l) ? 'capturada' : (vacia ? 'enCero' : '');
        filasMo +=
          '<tr class="' + cls + '">' +
          '<td class="rotulo" data-l="Renglón">' + esc(rol.label) + '</td>' +
          '<td data-l="QTY (' + esc(cl.unidad.toLowerCase()) + ')">' + celNum(p + 'qty', l.qty, 'w60') + '</td>' +
          '<td class="ro solo-ancho" data-l="Unidad">' + esc(cl.unidad) + '</td>' +
          '<td data-l="Personas">' + celNum(p + 'personas', l.personas, 'w60') + '</td>' +
          '<td data-l="Precio unitario">' + celNum(p + 'pu', l.pu, 'w80') +
            (rec.aplica
              ? '<div class="tiny recargo">+' + Math.round(rec.pct * 100) + '% → ' +
                mx(cl.puEfectivo) + '</div>'
              : (rec.motivo ? '<div class="tiny nota">' + esc(rec.motivo) + '</div>' : '')) +
          '</td>' +
          '<td class="vl mono calc" data-l="Precio total">' + mx(cl.costo) + '</td>' +
          '<td data-l="Moneda">' + celSel(p + 'moneda', l.moneda, ['MXN', 'USD']) + '</td>' +
          '<td class="ro mono calc" data-l="Margen">' + cl.mult + '</td>' +
          '<td class="vl mono calc fuerte" data-l="Precio con utilidad">' + mx(cl.conUtilidad) + '</td></tr>';
      });
    });

    const enCero = s.mo.filter(l => !(Number(l.qty) > 0)).length;
    const tablaMo =
      '<div class="secc-tit">COSTO MANO DE OBRA' +
      (enCero ? '<label class="verVacios"><input type="checkbox" id="verVacios"' +
        (ST.verVacios ? ' checked' : '') + '> ver los ' + enCero + ' en cero</label>' : '') +
      '</div>' +
      '<div class="scroll"><table class="rejilla tarjetas' + (ST.verVacios ? ' verVacios' : '') + '">' +
      '<thead><tr><th>DESCRIPCIÓN</th><th>QTY</th><th>UNIDAD</th><th>Personas</th>' +
      '<th>PRECIO UNITARIO</th><th>PRECIO TOTAL</th><th>MONEDA</th><th>Margen utilidad</th>' +
      '<th>PRECIO CON UTILIDAD</th></tr></thead><tbody>' + filasMo +
      '<tr class="total"><td class="rotulo" data-l="">TOTAL</td><td colspan="4"></td>' +
      '<td class="vl mono calc" data-l="Costo mano de obra">' + mx(cs.costoMo) +
      '</td><td colspan="2"></td><td class="vl mono calc fuerte" data-l="Con utilidad">' + mx(cs.ventaMo) + '</td></tr>' +
      '</tbody></table></div>';

    /* ⚠️ V1.26 decía aquí que «los conceptos se ELIGEN», porque meter los cinco
     * dejaría renglones vacíos que enseñan a ignorar la pantalla. Montalvo lo
     * midió al revés en el uso real, y tiene razón: lo que hay que ELEGIR es
     * lo que se olvida. Un renglón en cero se mira; uno que no está, no.
     * El razonamiento viejo se queda escrito porque el nuevo lo contesta: los
     * cinco renglones no se pueden ignorar, porque hasta que no se decidan el
     * revisador no deja terminar. */
    /* ── V1.27 · LOS CINCO CONCEPTOS, PUESTOS Y EN CERO ──────────────────
     *
     * Antes había que agregarlos con un botón. Lo que hay que agregar es
     * exactamente lo que se olvida: el presupuesto de Albuquerque salió con el
     * trabajo cobrado y sin hotel ni viáticos. Un renglón en cero que se ve es
     * un recordatorio; uno que hay que agregar es una omisión esperando.
     *
     * La retícula se AUTOCURA, igual que la de mano de obra: se pinta desde
     * `CONCEPTOS_VIAJE` y lo que falte se empuja a `s.partidas`. Por eso no
     * hace falta migrar nada — un machote viejo que se vuelve foráneo estrena
     * los cinco al abrirlo.
     *
     * ⚠️ Sólo cuando es foránea. Un machote de Nuevo León no gana renglones
     * que nadie pidió, y los ocho viejos no se tocan. */
    let cptsViaje = c.lugar.foraneo ? C.conceptosViaje(m, s) : [];
    if (c.lugar.foraneo) {
      cptsViaje.forEach(x => {
        if (x.existe) return;
        let i = (s.partidas || []).findIndex(l => !C.usadaPartida(l) && l.no_aplica !== true);
        if (i < 0) {
          s.partidas.push({ qty: '', unidad: '', tipo: '', descripcion: '',
            pu: null, moneda: m.moneda, margen: null, link: '', comentario: '' });
          i = s.partidas.length - 1;
        }
        const l = s.partidas[i];
        l.tipo = C.TIPO_VIAJE; l.descripcion = x.label; l.unidad = x.unidad;
        l.concepto = x.id;
      });
      /* ⚠️ Se vuelve a preguntar DESPUÉS de sembrar. La lista de arriba se
       * calculó cuando los renglones todavía no existían, así que traía
       * `idx: -1` para todos los que se acababan de crear — y con `idx:-1` la
       * fila se pinta sin sus campos de cantidad y precio. Se vio en la
       * captura a 380 px, no en el diff. */
      cptsViaje = C.conceptosViaje(m, s);
    }

    /* Un renglón de viaje, como se ve en el bloque: su importe y el botón de
     * «no se ocupa». Se pinta desde los conceptos, no desde las partidas, para
     * que el orden sea SIEMPRE el mismo — vuelos, hotel, viáticos, taxis,
     * gasolina — y no el del último que alguien agregó. */
    const filaCpt = (x) => {
      const l = (x.idx >= 0) ? s.partidas[x.idx] : null;
      const p = 's:' + s.id + ':partidas:' + x.idx + ':';
      const cl = l ? C.costoPartida(l, m, s) : null;
      const estado = x.confirmado
        ? '<span class="cpt-cero">no se ocupa</span>'
        : (x.tieneValor ? '<span class="cpt-ok">' + mx((cl && cl.costo) || 0) + '</span>'
                        : '<span class="cpt-falta">sin decidir</span>');
      return '<tr class="cpt' + (x.resuelto ? ' resuelto' : ' pendiente') + '">' +
        '<td class="rotulo" data-l="Concepto">' + esc(x.label) + '</td>' +
        '<td data-l="QTY (' + esc((x.unidad || '').toLowerCase()) + ')">' +
          (l ? celNum(p + 'qty', l.qty, 'w60') : '') + '</td>' +
        '<td data-l="Precio unitario">' + (l ? celNum(p + 'pu', l.pu, 'w80') : '') + '</td>' +
        '<td data-l="Importe" class="calc">' + estado + '</td>' +
        '<td data-l="">' +
          '<button class="chip-viaje mini' + (x.confirmado ? ' on' : '') + '"' +
          ' data-cero="' + esc(s.id + '|' + x.id) + '"' +
          ' title="' + (x.confirmado
            ? 'Marcado como que no se ocupa. Tócalo para deshacer.'
            : 'Marca que este concepto no se ocupa en esta cotización.') + '">' +
          (x.confirmado ? '✓ no se ocupa' : 'no se ocupa') + '</button>' +
        '</td></tr>';
    };

    const porResolver = cptsViaje.filter(x => !x.resuelto).length;
    const bloqueViaje = c.lugar.foraneo
      ? '<div class="viaje-blk' + (porResolver && !c.viaje.no_aplica ? ' falta' : '') + '">' +
          '<div class="secc-tit">VIAJE' +
            '<span class="secc-sub"> · se cobra a costo, sin utilidad</span></div>' +
          (c.viaje.no_aplica
            ? '<div class="aviso">Marcado como que <strong>no se ocupan conceptos de viaje</strong> ' +
              'en esta cotización. Queda anotado como decisión.</div>'
            : (porResolver
              ? '<div class="aviso bad">Se ejecuta en ' +
                esc([m.ciudad, m.region, paisNom(m.pais)].filter(Boolean).join(', ')) +
                ', fuera de Nuevo León. <strong>Faltan ' + porResolver +
                (porResolver === 1 ? ' concepto' : ' conceptos') + ' por decidir.</strong> ' +
                'Escríbele el importe, o márcalo como que no se ocupa. El revisador no la ' +
                'deja terminar con conceptos sin mirar.</div>'
              : '<div class="aviso ok">Los cinco conceptos están decididos.</div>')) +
          '<div class="scroll"><table class="rejilla tarjetas viaje-tbl"><thead><tr>' +
            '<th>Concepto</th><th>QTY</th><th>Precio unitario</th><th>Importe</th><th></th>' +
          '</tr></thead><tbody>' + cptsViaje.map(filaCpt).join('') + '</tbody></table></div>' +
          '<div class="viaje-btns">' + kiwiBoton(m, c) + '</div>' +
        '</div>'
      : '';

    // COSTO MATERIALES Y SERVICIOS
    const filasMat = (s.partidas || []).map((l, j) => {
      const cl = C.costoPartida(l, m, s), p = 's:' + s.id + ':partidas:' + j + ':';
      return '<tr' + (C.capturada(l) ? ' class="capturada"' : '') + '>' +
        // Pegar DESDE aquí hacia abajo. Va en la PRIMERA columna, y fija: al
        // final de trece columnas el botón caía fuera de la pantalla —medido:
        // x=1473 en una ventana de 1440— y había que arrastrar la tabla para
        // encontrarlo. Además leído de izquierda a derecha dice lo que hace:
        // se señala el renglón donde empieza el pegado.
        '<td class="acc-ini" data-l=""><button class="ico pegar" data-pegar="' + s.id + '#' + j + '"' +
        ' title="Pegar una lista a partir de este renglón" aria-label="Pegar a partir del renglón ' + (j + 1) + '">⇥</button></td>' +
        // Modelo y Marca se fueron: van DENTRO de la descripción. Eran dos
        // columnas de 200 px que empujaban la fila fuera de la pantalla y le
        // robaban ancho justo a la descripción, que es lo que hay que leer.
        '<td class="descol" data-l="Descripción">' + cel(p + 'descripcion', l.descripcion, 'desc') + '</td>' +
        '<td data-l="QTY">' + celNum(p + 'qty', l.qty, 'w60') + '</td>' +
        '<td data-l="Unidad">' + celLibre(p + 'unidad', l.unidad, 'unidades', 'w80') + '</td>' +
        '<td data-l="Tipo">' + celSel(p + 'tipo', l.tipo, [''].concat(C.TIPOS), 'wtipo') + '</td>' +
        '<td data-l="Precio unitario">' + celNum(p + 'pu', l.pu, 'w80') +
          /* CUÁNDO SE CONSULTÓ. Sólo en renglones de viaje, y sólo cuando ya
           * hay precio. Una cotización se manda semanas antes de volar, y el
           * precio de hoy no es el que se va a pagar: sin la fecha, el número
           * se lee como si fuera firme. Con ella, quien revisa sabe de cuándo
           * es y puede volver a consultar. */
          (cl.esViaje && !cl.sinPrecio ? consultadoHTML(l, p) : '') + '</td>' +
        '<td data-l="Moneda">' + celSel(p + 'moneda', l.moneda, ['MXN', 'USD'], 'wmon') + '</td>' +
        // "sin precio" SOLO en un renglón que alguien empezó a llenar. En uno
        // en blanco no es un hallazgo, es el estado normal del bloque — y con
        // treinta en blanco por sección, decirlo treinta veces es ruido.
        '<td class="vl mono calc' + (cl.sinPrecio && cl.usada ? ' n-bad' : '') + '" data-l="Precio total">' +
        (cl.sinPrecio ? (cl.usada ? 'sin precio' : '—') : mx(cl.costo)) + '</td>' +
        '<td data-l="Margen">' + celNum(p + 'margen', l.margen, 'w60' + (cl.pisado ? ' pisado' : ''), String(cl.porTipo || '')) +
          (cl.pisado ? '<span class="pisado-marca" title="Escrito a mano encima de la fórmula. Por Tipo le tocaría ' +
            cl.porTipo + '.">≠ ' + cl.porTipo + '</span>' : '') + '</td>' +
        '<td class="vl mono calc fuerte" data-l="Precio con utilidad">' + mx(cl.conUtilidad) + '</td>' +
        '<td data-l="Link">' + cel(p + 'link', l.link, 'w80', 'https://…') + '</td>' +
        '<td data-l="Comentario">' + cel(p + 'comentario', l.comentario, 'w80') + '</td>' +
        '<td class="acc" data-l="">' +
          '<button class="ico" data-mov="' + s.id + '#' + j + '|-1" title="Subir"' + (j === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button class="ico" data-mov="' + s.id + '#' + j + '|1" title="Bajar"' + (j === s.partidas.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button class="ico" data-dup="' + s.id + '#' + j + '" title="Duplicar">⧉</button>' +
          '<button class="ico peligro" data-del="' + s.id + '#' + j + '" title="Eliminar">×</button>' +
        '</td></tr>';
    }).join('');

    const tablaMat =
      '<div class="secc-tit">COSTO MATERIALES Y SERVICIOS</div>' +
      '<div class="scroll"><table class="rejilla tarjetas">' +
      '<thead><tr><th class="acc-ini" title="Pegar una lista a partir de un renglón">⇥</th>' +
      '<th class="descol">DESCRIPCIÓN <span class="hint">(incluye modelo y marca)</span></th>' +
      '<th>QTY</th><th>UNIDAD</th><th>Tipo</th>' +
      '<th>P. UNITARIO</th><th>MON.</th><th>P. TOTAL</th><th>Margen</th>' +
      '<th>CON UTILIDAD</th><th>Link</th><th>Coment.</th><th class="acc"></th></tr></thead><tbody>' +
      (filasMat || '<tr><td colspan="13" class="vacio2">Sin partidas.</td></tr>') +
      '<tr class="total"><td class="acc-ini"></td><td class="rotulo descol" data-l="">TOTAL</td><td colspan="5"></td>' +
      '<td class="vl mono calc" data-l="Costo materiales">' + mx(cs.costoMat) +
      '</td><td></td><td class="vl mono calc fuerte" data-l="Con utilidad">' + mx(cs.ventaMat) + '</td><td colspan="3"></td></tr>' +
      '</tbody></table></div>' +
      '<div class="btnrow"><button class="btn" data-add="' + s.id + '">+ partida</button>' +

      (cs.pisados ? '<span class="tiny n-warn">' + cs.pisados + ' margen(es) pisado(s) a mano en esta sección</span>' : '') +
      '</div>';

    const listaUnidades = '<datalist id="unidades">' +
      D.UNIDADES.map(u => '<option value="' + esc(u) + '">').join('') + '</datalist>';

    return listaUnidades + cab + leyenda() + bloqueRecargo + tablaMo + bloqueViaje + tablaMat;
  }

  /* ── El estado del machote ─────────────────────────────────────────────
   *
   * El machote NACE sin orden -casi siempre nace antes que la orden- y por eso
   * la SO es opcional mientras se arma. Pero al enviarlo a Odoo ya no: enviar
   * ES confirmar la venta, y una venta sin orden no existe.
   *
   * ⚠️ ENVIAR NO ESCRIBE EN ODOO todavia. La regla vigente de este modulo es
   * que Odoo solo se consulta. El estado, el candado y la exigencia de orden si
   * son reales; el envio queda esperando que Esteban levante esa regla. */
  function bloqueEstado(m) {
    const est = D.ESTADOS[m.estado] || D.ESTADOS.borrador;
    const cong = congelado(m);
    const ops = D.FLUJO.map(k =>
      '<option value="' + k + '"' + (m.estado === k ? ' selected' : '') + '>' +
      esc(D.ESTADOS[k].label) + '</option>').join('');

    return '<div class="edo' + (cong ? ' cerrado' : '') + '">' +
      '<span class="chip" style="background:' + est.color + '">' + esc(est.label) + '</span>' +
      (cong
        ? '<span class="tiny">🔒 Enviado a Odoo. Este es el documento con el que se vendió: se consulta, no se edita.</span>'
        : '<label class="tiny">Estado <select class="cel" data-estado>' + ops + '</select></label>') +
      '<span class="grow"></span>' +
      '<span class="tiny">' + (m.so
        ? 'Orden <strong>' + esc(m.so) + '</strong>'
        : '<span class="n-warn">Sin orden ligada</span> · se puede armar así, pero no enviar') +
      '</span></div>';
  }

  /* ── Hoja DESGLOSE COTIZACIÓN ────────────────────────────────────────── */
  function hojaDesglose(m, c) {
    const e = c.escenarios;
    const escOps = C.ESCENARIOS.map(x =>
      '<button class="escbtn' + (m.escenario === x.id ? ' on' : '') + '" data-esc="' + x.id + '">' +
      x.label.toUpperCase() + '</button>').join('');

    const fila = (et, p, cCosto, cUtil, cMd) =>
      '<tr><td class="et">' + et + '</td><td class="mono pctcol">' + (p || '') + '</td>' +
      '<td class="vl mono calc">' + cCosto + '</td><td class="vl mono calc">' + cUtil + '</td>' +
      '<td class="vl mono calc">' + cMd + '</td></tr>';

    const resumen =
      '<div class="secc-tit">RESUMEN BUDGET</div>' +
      '<div class="scroll"><table class="rejilla ancha">' +
      '<thead><tr><th></th><th>%</th><th>COSTO</th><th>CON UTILIDAD</th><th>MARGEN DESEADO</th></tr></thead><tbody>' +
      fila('MANO DE OBRA', pc(c.pesoMo), mx(c.costoMo), mx(c.ventaMo),
           mx(e.margen_deseado.precio === null ? null : e.margen_deseado.precio * (c.costo ? c.costoMo / c.costo : 0))) +
      fila('MATERIALES Y SERVICIOS', pc(c.pesoMat), mx(c.costoMat), mx(c.ventaMat),
           mx(e.margen_deseado.precio === null ? null : e.margen_deseado.precio * (c.costo ? c.costoMat / c.costo : 0))) +
      fila('SUMA M. DE OBRA, MATERIALES Y SERV', '', mx(c.costo), mx(c.venta),
           mx(e.margen_deseado.precio === null ? null : e.margen_deseado.precio - e.margen_deseado.comisionFts - e.margen_deseado.comisionCliente)) +
      fila('COMISIONES DE FTS', pc(c.pctFts), '', mx(e.con_utilidad.comisionFts), mx(e.margen_deseado.comisionFts)) +
      fila('COMISIONES DE CLIENTE', pc(c.pctCli), '', mx(e.con_utilidad.comisionCliente), mx(e.margen_deseado.comisionCliente)) +
      '<tr class="total"><td class="et">PRECIO DE VENTA ANTE DE IMPUESTO</td><td></td>' +
      '<td class="vl mono calc">' + mx(e.costo.precio) + '</td><td class="vl mono calc">' + mx(e.con_utilidad.precio) + '</td>' +
      '<td class="vl mono calc">' + mx(e.margen_deseado.precio) + '</td></tr>' +
      fila('Margen', '', pc(0), pc(e.con_utilidad.margen), pc(e.margen_deseado.margen)) +
      fila('Utilidad esperada Absoluta', '', mx(0), mx(e.con_utilidad.utilidad), mx(e.margen_deseado.utilidad)) +
      '</tbody></table></div>';

    const encabezado =
      '<div class="desg-top">' +
      '<div class="blk"><div class="et2">ELIGE UN ESCENARIO PARA TU COTIZACIÓN</div>' +
      '<div class="escs">' + escOps + '</div></div>' +
      '<div class="blk"><table class="hoja2"><tbody>' +
      '<tr><td class="et">MARGEN DESEADO</td><td>' + celPct('margen_deseado', m.margen_deseado, 'w80') + '</td></tr>' +
      '<tr><td class="et">HORAS PROYECTO</td><td class="vl mono calc">' + Math.round(c.horas) + '</td></tr>' +
      '<tr><td class="et">Factor_req</td><td class="vl mono calc">' + (c.factorReq ? c.factorReq.toFixed(9) : '—') + '</td></tr>' +
      '<tr><td class="et">Empresa</td><td>' +
        '<select class="cel" data-cel="empresa_id" data-num>' +
        C.EMPRESAS.map(e => '<option value="' + e.id + '"' +
          (Number(m.empresa_id) === e.id ? ' selected' : '') + '>' + esc(e.corto) + '</option>').join('') +
        '</select></td></tr>' +
      '<tr><td class="et">Moneda</td><td>' + celSel('moneda', m.moneda, ['MXN', 'USD']) +
        (m.moneda !== C.monedaPorDefecto(m)
          ? '<div class="tiny n-warn">' + esc(C.empresaDe(m).corto) + ' factura en ' +
            C.monedaPorDefecto(m) + '.</div>' : '') + '</td></tr>' +
      '<tr><td class="et">Tipo de cambio</td><td>' + celNum('tc', m.tc, 'w80') + '</td></tr>' +
      '<tr><td class="et">Factor de protección</td><td>' + celPct('factor_proteccion', m.factor_proteccion, 'w80') + '</td></tr>' +
      '<tr><td class="et">Origen del tipo de cambio</td><td>' +
        celLibre('tc_fuente', m.tc_fuente, 'fuentes-tc') + '</td></tr>' +
      '<tr><td class="et">TC efectivo</td><td class="vl mono calc">' + C.tcEfectivo(m).toFixed(4) + '</td></tr>' +
      '</tbody></table></div>' +
      lugarHTML(m, c) +
      '</div>' +
      '<datalist id="fuentes-tc">' +
        ['DOF del día', 'Banxico FIX', 'Tipo de cambio del banco', 'Acordado con el cliente']
          .map(x => '<option value="' + x + '">').join('') + '</datalist>' +
      leyenda();

    // RESUMEN por sección: diez ranuras fijas, tres grupos de columnas.
    let fSec = '';
    for (let i = 0; i < C.MAX_SECCIONES; i++) {
      const s = c.secciones[i];
      const v = s ? s.esc : null;
      fSec += '<tr' + (s ? '' : ' class="vacia"') + '><td class="mono">' + (i + 1) + '</td>' +
        '<td class="et">' + esc(s ? s.nombre : 'SECCION ' + (i + 1)) + '</td>' +
        '<td class="vl mono calc">' + mx(s ? v.costo.mo : 0) + '</td>' +
        '<td class="vl mono calc">' + mx(s ? v.costo.mat : 0) + '</td>' +
        '<td class="vl mono calc">' + mx(s ? v.costo.precio : 0) + '</td>' +
        '<td class="vl mono calc">' + mx(s ? v.con_utilidad.mo : 0) + '</td>' +
        '<td class="vl mono calc">' + mx(s ? v.con_utilidad.mat : 0) + '</td>' +
        '<td class="vl mono calc">' + mx(s ? v.con_utilidad.precio : 0) + '</td>' +
        '<td class="vl mono calc">' + mx(s ? v.margen_deseado.mo : 0) + '</td>' +
        '<td class="vl mono calc">' + mx(s ? v.margen_deseado.mat : 0) + '</td>' +
        '<td class="vl mono calc">' + mx(s ? v.margen_deseado.precio : 0) + '</td>' +
        '<td class="vl mono calc">' + (s ? Math.round(s.horas) : 0) + '</td></tr>';
    }
    const sobra = c.secciones.length > C.MAX_SECCIONES;

    const porSeccion =
      '<div class="secc-tit">RESUMEN POR SECCIÓN</div>' +
      '<div class="scroll"><table class="rejilla ancha" id="porSeccion">' +
      '<thead><tr><th colspan="2"></th><th colspan="3">COSTO</th><th colspan="3">CON UTILIDAD</th>' +
      '<th colspan="3">MARGEN DESEADO</th><th></th></tr>' +
      '<tr><th>SECCIÓN</th><th>SECCION DE COTIZACION</th>' +
      '<th>MANO DE OBRA</th><th>MATERIALES Y SERV</th><th>COSTOS TOTALES</th>' +
      '<th>MANO DE OBRA</th><th>MATERIALES Y SERV</th><th>PRECIO DE VENTA</th>' +
      '<th>MANO DE OBRA</th><th>MATERIALES Y SERV</th><th>PRECIO DE VENTA</th><th>HORAS</th></tr></thead>' +
      '<tbody>' + fSec +
      '<tr class="total"><td></td><td class="et">SUMA</td>' +
      '<td class="vl mono calc">' + mx(c.costoMo) + '</td><td class="vl mono calc">' + mx(c.costoMat) + '</td>' +
      '<td class="vl mono calc">' + mx(c.costo) + '</td>' +
      '<td class="vl mono calc">' + mx(c.ventaMo) + '</td><td class="vl mono calc">' + mx(c.ventaMat) + '</td>' +
      '<td class="vl mono calc">' + mx(e.con_utilidad.precio) + '</td>' +
      '<td class="vl mono calc">' + mx(e.margen_deseado.precio === null ? null : e.margen_deseado.precio * (c.costo ? c.costoMo / c.costo : 0)) + '</td>' +
      '<td class="vl mono calc">' + mx(e.margen_deseado.precio === null ? null : e.margen_deseado.precio * (c.costo ? c.costoMat / c.costo : 0)) + '</td>' +
      '<td class="vl mono calc">' + mx(e.margen_deseado.precio) + '</td>' +
      '<td class="vl mono calc">' + Math.round(c.horas) + '</td></tr>' +
      '</tbody></table></div>' +
      (sobra ? '<div class="aviso bad">Hay ' + c.secciones.length + ' secciones y la tabla del machote sólo tiene ' +
        C.MAX_SECCIONES + ' ranuras. Las de más no llegarían al precio.</div>' : '');

    // BUDGET ODOO
    const b = c.budget;
    const budget =
      '<div class="secc-tit">BUDGET ODOO</div>' +
      '<div class="scroll"><table class="rejilla estrecha"><tbody>' +
      '<tr><td class="et">INGRESO</td><td class="vl mono calc">' + mx(b.ingreso) + '</td></tr>' +
      '<tr><td class="et">MANO DE OBRA</td><td class="vl mono calc">' + mx(b.manoObra) + '</td></tr>' +
      '<tr><td class="et">MATERIALES Y SERVICIOS</td><td class="vl mono calc">' + mx(b.materiales) + '</td></tr>' +
      b.comisiones.map(l => '<tr><td class="et">' + esc(l.nombre) + '</td><td class="vl mono calc">' + mx(l.monto) + '</td></tr>').join('') +
      '<tr class="total"><td class="et">TOTAL (por defecto lo lanza odoo)</td><td class="vl mono calc">' + mx(b.total) + '</td></tr>' +
      '<tr><td class="et">COINCIDE CON LA TABLA?</td><td class="vl mono n-' + (b.cuadra ? 'ok' : 'bad') + '">' +
      (b.cuadra ? 'VERDADERO' : 'FALSO') + '</td></tr>' +
      '</tbody></table></div>' +
      (b.cuadra ? '' : '<div class="aviso bad">El machote muestra este mismo FALSO y aun así deja mandar la cotización. Aquí bloquea.</div>');

    // TABLA DE COMISIONES Y BONOS
    const eq = (titulo, key, rep, bolsa) => {
      const suma = (m[key] || []).reduce((a, x) => a + Number(x.pct || 0), 0);
      return '<tr class="grupo"><td colspan="3">' + titulo + ' · bolsa ' + mx(bolsa) + '</td></tr>' +
        (m[key] || []).map((it, i) =>
          '<tr><td>' + cel('eq:' + rep + ':' + i + ':nombre', it.nombre, 'desc') + '</td>' +
          '<td>' + celPct('eq:' + rep + ':' + i + ':pct', it.pct) + '</td>' +
          '<td class="vl mono calc">' + mx(bolsa * Number(it.pct)) + '</td></tr>').join('') +
        '<tr class="total"><td class="et">Suma</td><td class="vl mono n-' +
        (Math.abs(suma - 1) < 0.0001 ? 'ok' : 'bad') + '">' + pc(suma) + '</td><td></td></tr>';
    };
    const comisiones =
      '<div class="secc-tit">TABLA DE COMISIONES Y BONOS</div>' +
      '<div class="scroll"><table class="rejilla estrecha"><tbody>' +
      eq('EQUIPO DE VENTA (' + pc(Number(m.reparto.venta)) + ' de la comisión FTS)', 'equipo_venta', 'venta', c.reparto.bolsaVenta) +
      eq('EQUIPO DE OPERACIONES (' + pc(Number(m.reparto.operaciones)) + ')', 'equipo_operaciones', 'ops', c.reparto.bolsaOps) +
      eq('LADO CLIENTE', 'equipo_cliente', 'cli', c.escenario.comisionCliente) +
      '</tbody></table></div>';

    return encabezado + resumen + porSeccion + budget + comisiones;
  }

  /** Leyenda de la hoja. Un analista nuevo no tiene por qué deducir el código
   *  de colores: se le dice. */
  function leyenda() {
    return '<div class="leyenda">' +
      '<span><i class="mu-cel"></i> se captura</span>' +
      '<span><i class="mu-calc"></i> lo calcula la hoja</span>' +
      '<span><i class="mu-pisado"></i> margen escrito a mano</span>' +
      '</div>';
  }

  /* ── Pegar una tabla ───────────────────────────────────────────────────
   *
   * El proveedor ya mandó la lista escrita; volverla a teclear no es sólo lento,
   * es donde se cuela el error de dedo en el precio, que es el dato que nadie
   * vuelve a verificar.
   *
   * NADA se aplica solo. Se interpreta, se ENSEÑA lo que se entendió renglón
   * por renglón, y se escribe cuando alguien lo aprueba mirándolo. Un parser
   * que acierta el 90% y aplica solo mete un 10% de basura que nadie ve. */
  function modalPegar(m, ref) {
    const P = G.MachotePegar;
    const [sid, jTxt] = String(ref).split('#');
    const desde = parseInt(jTxt, 10) || 0;
    const sec = m.secciones.find(x => x.id === sid);
    if (!sec) return;
    const cerrar = () => { const d = $('#modal'); if (d) d.remove(); };

    const html =
      '<div class="modal" id="modal"><div class="caja">' +
      '<h3>Pegar una lista a partir del renglón ' + (desde + 1) + '</h3>' +
      '<p class="tiny nota">Pega aquí una lista de Claude, de un correo, de Excel o de una ' +
      'cotización — tabla, lista o texto corrido. Se entiende sola y ' +
      '<strong>te enseña qué entendió antes de escribir nada</strong>. ' +
      'Lo que esté <strong>arriba del renglón ' + (desde + 1) + ' no se toca</strong>.</p>' +
      '<textarea id="pg-txt" rows="7" placeholder="Cantidad | Descripción | Precio unitario&#10;4 | Rodamiento LM25UU | $4,200.00"></textarea>' +
      '<div id="pg-prev"></div>' +
      '<div class="modos">' +
      '<label><input type="radio" name="pg-modo" value="debajo" checked> ' +
      'Escribir <strong>debajo</strong> del renglón ' + (desde + 1) +
      '<span class="tiny nota">Los renglones nuevos entran después de éste.</span></label>' +
      '<label><input type="radio" name="pg-modo" value="arriba"> ' +
      'Escribir <strong>arriba</strong> del renglón ' + (desde + 1) +
      '<span class="tiny nota">Los renglones nuevos entran antes de éste.</span></label>' +
      '</div>' +
      '<p class="tiny nota">En los dos casos <strong>nada se pierde</strong>: lo que ya estaba ' +
      'se recorre, no se sobrescribe.</p>' +
      '<div class="acciones">' +
      '<button class="btn" id="pg-cancel">Cancelar</button>' +
      '<button class="btn primario" id="pg-ok" disabled>Agregar renglones</button>' +
      '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);

    const txt = $('#pg-txt'), prev = $('#pg-prev'), ok = $('#pg-ok');
    let ultimo = null;

    const revisar = () => {
      const r = P.interpretar(txt.value, { moneda: m.moneda });
      ultimo = r;
      ok.disabled = !r.ok;
      if (!txt.value.trim()) { prev.innerHTML = ''; return; }
      if (!r.ok) {
        prev.innerHTML = '<div class="aviso bad">' + esc(r.motivo) +
          '<div class="tiny">Prueba con una columna de descripción y una de precio, ' +
          'separadas por tabulador, coma o barra.</div></div>';
        return;
      }
      const conAviso = r.renglones.filter(x => x._avisos.length).length;
      prev.innerHTML =
        '<div class="aviso' + (conAviso ? ' warn' : ' ok') + '">Entendí <strong>' +
        r.renglones.length + ' renglón(es)</strong> · separador: <strong>' + esc(r.sep) + '</strong> · ' +
        (r.encabezado ? 'con encabezado' : 'sin encabezado, adiviné las columnas por su forma') +
        (conAviso ? ' · <strong class="n-warn">' + conAviso + ' con algo que revisar</strong>' : '') +
        '</div>' +
        '<div class="scroll"><table class="rejilla"><thead><tr>' +
        '<th>QTY</th><th>Unidad</th><th>Tipo</th><th>Descripción</th><th>Precio unitario</th><th>Moneda</th><th></th>' +
        '</tr></thead><tbody>' +
        r.renglones.map(x =>
          '<tr' + (x._avisos.length ? ' class="ojo"' : '') + '>' +
          '<td class="vl mono">' + esc(nn(x.qty)) + '</td>' +
          '<td>' + esc(x.unidad || '—') + '</td>' +
          '<td>' + (x.tipo ? esc(x.tipo) + (x._tipoDeducido ? ' <span class="tiny n-warn">deducido</span>' : '') : '—') + '</td>' +
          '<td>' + esc(x.descripcion || '—') + '</td>' +
          '<td class="vl mono">' + (x.pu === null ? '—' : mx(x.pu)) + '</td>' +
          '<td>' + esc(x.moneda) + '</td>' +
          '<td class="tiny n-warn">' + esc(x._avisos.join(', ')) + '</td></tr>').join('') +
        '</tbody></table></div>' +
        '<p class="tiny nota">El <strong>Tipo</strong> que no venga en la lista se ' +
        '<strong>deduce de la descripción</strong> y sale marcado como <em>deducido</em>: ' +
        'Materiales o Servicios elige el multiplicador, así que revísalo aquí. ' +
        'Si no hay señal clara se queda vacío, y la <strong>Unidad</strong> que no venga ' +
        'se hereda del renglón donde estás pegando en vez de borrarse.</p>';
    };

    txt.oninput = revisar;
    $('#pg-cancel').onclick = cerrar;
    $('#modal').onclick = (ev) => { if (ev.target.id === 'modal') cerrar(); };

    ok.onclick = () => {
      if (!ultimo || !ultimo.ok) return;
      /* Lo que el pegado NO resolvió se hereda del renglón que estaba en ese
       * lugar, no se deja en blanco. Si no, pegar una lista sin columna de
       * Unidad borraba los "Pieza" y "Horas" que ya estaban capturados —
       * reproducido: `Pieza`, `Horas` → vacío, y el Tipo igual. Un pegado que
       * borra datos que no venía a tocar es peor que no pegar. */
      const base = sec.partidas[desde] || {};
      const nuevos = ultimo.renglones.map(x => ({
        qty: x.qty,
        unidad: x.unidad || base.unidad || '',
        tipo: x.tipo || base.tipo || '',
        descripcion: x.descripcion,
        modelo: x.modelo, marca: x.marca, pu: x.pu, moneda: x.moneda,
        margen: null, link: x.link, comentario: x.comentario
      }));
      /* Arriba o debajo del renglón señalado, y en los DOS casos se recorre lo
       * que ya estaba en vez de sobrescribirlo. Antes un modo reemplazaba y el
       * otro no, y eso obligaba a entender la diferencia antes de pegar; ahora
       * la única decisión es dónde va, que es la que de verdad importa. */
      const modo = (document.querySelector('input[name="pg-modo"]:checked') || {}).value || 'debajo';
      const en = (modo === 'arriba') ? desde : desde + 1;
      sec.partidas.splice.apply(sec.partidas, [en, 0].concat(nuevos));

      /* Y se recorta la cola de renglones vacíos que el recorrido empujó: si no,
       * pegar diez deja treinta en blanco colgando y la hoja crece sin parar.
       * Sólo se quitan los que nadie ha tocado, y se dejan diez para seguir
       * capturando a mano. */
      let cola = 0;
      for (let i = sec.partidas.length - 1; i >= 0 && !C.usadaPartida(sec.partidas[i]); i--) cola++;
      if (cola > 10) sec.partidas.splice(sec.partidas.length - (cola - 10), cola - 10);

      cerrar();
      tocado(m);
      pintarHoja(m); barra(m, C.calcular(m));
      toast(nuevos.length + ' renglón(es) ' +
            (modo === 'arriba' ? 'arriba' : 'debajo') + ' del renglón ' + (desde + 1) + '.');
    };
    txt.focus();
  }

  /* ── Barra fija ──────────────────────────────────────────────────────── */
  function barra(m, c) {
    const rev = R.revisar(m);
    $('#fija').innerHTML = '<div class="fija"><div class="grow">' +
      '<div class="mono n-' + (c.costoIncompleto ? 'warn' : nivelMargen(c.margen)) + '">' +
      mx(c.precio) + ' ' + esc(m.moneda) + ' · ' + pc(c.margen) + (c.costoIncompleto ? '*' : '') + '</div>' +
      '<div class="tiny">' + esc(c.escenario.id.replace('_', ' ')) +
      (rev.duras.length ? ' · ⛔ ' + rev.duras.length + ' duras' : ' · ✓ sin duras') +
      (c.costoIncompleto ? ' · ' + c.huecos + ' huecos' : '') + '</div></div>' +
      /* El paso siguiente al machote: pasarlo a orden. Es un CASCARÓN —lo
       * dice en su propia cabecera— y por eso el botón va en secundario, al
       * lado de Revisar, sin robarle el lugar al que sí hace algo. */
      /* «Pasar a orden» NO se ofrece sobre trabajo ajeno. La barra vive FUERA
       * de `#hoja`, así que `trabarSiEsAjeno` no la alcanza —lo cazó la
       * captura, no el diff—: quedaba un botón vivo para convertir en orden la
       * cotización de otro. «Revisar» sí se queda: es de sólo lectura y es
       * justo para lo que dirección abre un machote ajeno. */
      (G.MachoteOrden && !ajeno(m)   /* pasar a orden es del DUEÑO, no de quien tiene prestado */
        ? '<button class="btn fantasma" id="btnOrden" title="Ver cómo se pasaría a orden de venta">Pasar a orden</button>'
        : '') +
      /* PRESTAR es del dueño y sólo del dueño (decisión 1 de la propuesta:
       * quien sabe que no puede meterle mano ahora es él). Y sólo tiene
       * sentido si la cotización ya llegó al servidor: prestar algo que
       * todavía vive en este navegador no le daría acceso a nadie. */
      (G.MachotePrestamo && !ajeno(m) && A && A.idServidor && A.idServidor(m.id)
        ? '<button class="btn fantasma" id="btnPrestar" title="Dejar que otra persona edite esta cotización por un rato">Prestar</button>'
        : '') +
      '<a class="btn" href="#/rev/' + m.id + '">Revisar</a></div>';
    const bo = $('#btnOrden');
    if (bo) bo.onclick = () => G.MachoteOrden.abrir(m);
    const bp = $('#btnPrestar');
    if (bp) bp.onclick = () => G.MachotePrestamo.abrir(m, personasDelEquipo(), vMachote);
  }

  /** A quién se le puede prestar: las personas que el servidor ya nombró en
   *  la lista, menos uno mismo.
   *
   *  Sale de los DATOS y no de una lista escrita a mano, por lo mismo que el
   *  filtro de persona: el día que entre alguien nuevo aparece solo. Su
   *  límite honesto es que sólo conoce a quien ya tiene algún machote — quien
   *  no ha capturado nada todavía no sale. Cuando exista un directorio del
   *  módulo, esto se cambia por él. */
  function personasDelEquipo() {
    const ses = (G.SuiteAuth && G.SuiteAuth.getSession()) || null;
    const yo = (ses && ses.actor) || '';
    const vistos = {};
    (ST.ajenos || []).forEach(m => {
      if (m && m._dueno && m._dueno !== yo) vistos[m._dueno] = m._dueno_nombre || m._dueno;
    });
    return Object.keys(vistos).sort().map(a => ({ actor: a, nombre: vistos[a] }));
  }

  /* ── Enlace de celdas ────────────────────────────────────────────────── */
  function enlazar(m) {
    /* Un machote congelado se lee, no se edita. Se apagan los campos y se
     * quitan los botones de estructura en vez de esconder la hoja: el
     * documento con el que se vendio hay que poder consultarlo. */
    if (congelado(m)) {
      $$('[data-cel]').forEach(el => { el.disabled = true; el.classList.add('bloq'); });
      // `data-nueva` es la pestaña `+`: vive fuera de la hoja, en la banda de
      // pestañas, y por eso se cuela si sólo se listan los botones de la hoja.
      $$('[data-add],[data-del],[data-dup],[data-mov],[data-delsec],[data-dupsec],' +
         '[data-movsec],[data-nueva]').forEach(b => b.remove());
      $$('[data-esc]').forEach(b => b.onclick = () => {
        m.escenario = b.dataset.esc; pintarHoja(m); barra(m, C.calcular(m));
      });
      const vvc = $('#verVacios');
      if (vvc) vvc.onchange = () => { ST.verVacios = vvc.checked; pintarHoja(m); };
      return;
    }
    /* La salida explícita del bloqueo por cotización foránea. Es un checkbox
     * y no una celda porque no es un dato del costo: es una DECISIÓN, y el
     * revisador la registra como tal. */
    /* Una chip pone los TRES campos de una vez. Es el atajo entero: quien
     * cotiza en San Antonio no debería tener que elegir país, buscar Texas y
     * escribir la ciudad tres veces por semana. */
    /* Agregar un concepto de viaje: se mete como partida de tipo Viaje, en el
     * primer renglón libre. Reusa la retícula de captura que ya existe en vez
     * de inventar una segunda forma de capturar un gasto. */
    /* V1.27 · renombrar. Se anota el motivo ANTES de tocar, con el nombre
     * viejo todavía en la mano: después ya no hay de dónde sacarlo. */
    $$('[data-nombre]').forEach(el => {
      el.onchange = () => {
        const antes = (m.nombre || '').trim();
        const ahora = (el.value || '').trim();
        if (ahora === antes) return;
        if (!ahora) { el.value = antes; toast('El nombre no puede quedar vacío.'); return; }
        m.nombre = ahora;
        ST.motivos[m.id] = 'Renombrada: «' + (antes || 'sin nombre') + '» → «' + ahora + '»';
        tocado(m);
        render();
        toast('Renombrada. El cambio queda en el historial.');
      };
    });

    $$('[data-consul]').forEach(el => {
      el.onclick = () => {
        const [ruta, hoy] = el.dataset.consul.split('|');
        setPath(m, ruta + 'consultado_at', hoy);
        tocado(m);
        pintarHoja(m); barra(m, C.calcular(m));
      };
    });
    /* V1.27 · «no se ocupa». Sustituye al botón de AGREGAR: los cinco ya
     * están, así que lo que falta no es meterlos, es DECIDIRLOS. Marcar es
     * reversible de un toque — si fuera irreversible, marcar de más costaría
     * una cotización. */
    $$('[data-cero]').forEach(el => {
      el.onclick = () => {
        const [sid, cid] = el.dataset.cero.split('|');
        const sec = (m.secciones || []).find(x => x.id === sid);
        const cpt = C.CONCEPTOS_VIAJE.find(x => x.id === cid);
        if (!sec || !cpt) return;
        const x = C.conceptosViaje(m, sec).find(y => y.id === cid);
        if (!x || x.idx < 0) return;
        const l = sec.partidas[x.idx];
        if (l.no_aplica === true) {
          delete l.no_aplica;
          toast(cpt.label + ': vuelve a estar sin decidir.');
        } else {
          /* Marcar «no se ocupa» NO borra lo capturado: si alguien puso un
           * importe y luego marca, el importe sigue ahí y vuelve al quitarlo.
           * Borrarlo sería tirar trabajo por un clic. */
          l.no_aplica = true;
          toast(cpt.label + ': marcado como que no se ocupa.');
        }
        tocado(m);
        pintarHoja(m); barra(m, C.calcular(m));
      };
    });
    $$('[data-frec]').forEach(el => {
      el.onclick = () => {
        const [pais, region, ciudad] = el.dataset.frec.split('|');
        m.pais = pais; m.region = region; m.ciudad = ciudad;
        tocado(m);
        pintarHoja(m); barra(m, C.calcular(m));
      };
    });
    $$('[data-viaje]').forEach(el => {
      el.onchange = () => {
        if (!m.viaje) m.viaje = {};
        m.viaje[el.dataset.viaje] = !!el.checked;
        tocado(m);
        pintarHoja(m); barra(m, C.calcular(m));
      };
    });
    $$('[data-cel]').forEach(el => {
      const esSel = el.tagName === 'SELECT';
      const aplicar = () => {
        let v = el.value;
        if (el.hasAttribute('data-num')) v = (v === '' ? null : (parseFloat(v) || 0));
        // Lo que se teclea en % se guarda como razón: el motor y lo ya guardado
        // siguen hablando en 0.055, y sólo la pantalla habla en 5.5.
        if (v !== null && el.hasAttribute('data-pct')) v = +(v / 100).toFixed(8);
        setPath(m, el.dataset.cel, v);
      };
      // Al salir del campo se repinta -puede haber cambiado la estructura-.
      // Al teclear sólo se refrescan los derivados, que no roba el foco.
      el.onchange = () => {
        const antes = el.dataset.cel === 'empresa_id' ? C.monedaPorDefecto(m) : null;
        const esNombre = el.dataset.cel.indexOf('nom:') === 0;
        /* ⚠️ V1.27 · al cambiar de PAÍS se limpian estado y ciudad.
         *
         * Sin esto quedaban lugares que no existen, y no es hipotético: en las
         * pruebas de Montalvo del 10-sep hay versiones guardadas con
         * «Estados Unidos · Nuevo León · Monterrey» y «México · Ciudad de
         * México · Monterrey» (COT-0013, versiones 7, 8 y 16). Eso viaja al PDF
         * del cliente. Y desde V1.27 el ESTADO decide si hay viáticos, así que
         * un estado que no es de ese país no es sólo feo: decide mal. */
        const cambiaPais = el.dataset.cel === 'pais' &&
          C.llano(el.value) !== C.llano(m.pais);
        /* ── V1.28 · mover el recargo QUEDA DICHO en el historial ──────────
         * Esteban: «como mueve el margen, registra por sección cuándo se
         * apartó del valor por defecto y hazlo visible, igual que con el
         * margen sobrescrito a mano. Es el mismo caso de las comisiones que
         * motivó el histórico».
         *
         * El valor ya viaja DENTRO del documento, así que el historial lo
         * guarda de todos modos y con su fecha y su autor. Lo que se agrega
         * aquí es que la versión lo DIGA en su motivo: un cambio que hay que
         * salir a buscar comparando dos documentos es, en la práctica, un
         * cambio que nadie encuentra. Mismo mecanismo que el renombrado. */
        const recAntes = /^rec:/.test(el.dataset.cel)
          ? (function () {
              const p2 = el.dataset.cel.split(':');
              const sx = (m.secciones || []).find(x => x.id === p2[1]);
              /* ⚠️ El valor ANTERIOR sale de `defaultValue`, NO del documento.
               * Leerlo del documento aquí da el valor NUEVO y el motivo sale
               * «45% → 45%»: cuando este `change` llega, el `input` de al lado
               * YA escribió —al teclear se refrescan los derivados sin esperar
               * al blur—, así que el documento hace rato que dejó de tener el
               * valor viejo. `defaultValue` es el atributo `value` tal como lo
               * pintó el último render, y eso sí es el de antes de editar.
               * Medido: el primer intento reportaba 0.45 → 0.45 y el motivo
               * salía vacío. */
              return sx ? { nombre: sx.nombre, clave: p2[2], txt: el.defaultValue } : null;
            })()
          : null;
        aplicar();
        if (recAntes) {
          const pc2 = (x) => (x === '' || x === null || x === undefined)
            ? 'vacío' : Math.round(Number(x)) + '%';
          const antesTxt = pc2(recAntes.txt), ahoraTxt = pc2(el.value);
          if (antesTxt !== ahoraTxt) {
            ST.motivos[m.id] = 'Recargo ' +
              (recAntes.clave === 'festivo' ? 'de día festivo' : 'de fin de semana') +
              ' en «' + recAntes.nombre + '»: ' + antesTxt + ' → ' + ahoraTxt;
          }
        }
        if (cambiaPais) { m.region = ''; m.ciudad = ''; }
        // El nombre de la sección vive en la PESTAÑA, que se pinta fuera de la
        // hoja. Se corrige la pestaña en su lugar, sin repintar el libro: este
        // `change` llega durante el blur del campo, y repintar de raíz ahí
        // arranca el nodo que el navegador todavía está soltando -eso reventaba
        // con "the node to be removed is no longer a child of this node".
        if (esNombre) {
          const sid = el.dataset.cel.slice(4);
          const pes = document.querySelector('.pestana[data-hoja="' + sid + '"]');
          const sec = m.secciones.find(x => x.id === sid);
          if (pes && sec) pes.textContent = sec.nombre || 'SECCIÓN';
        }
        // La moneda sigue a la empresa mientras no se haya tocado a mano.
        if (antes !== null && m.moneda === antes) m.moneda = C.monedaPorDefecto(m);
        tocado(m);
        pintarHoja(m); barra(m, C.calcular(m));
      };
      if (!esSel) el.oninput = () => {
        aplicar(); tocado(m);
        barra(m, refrescarCalculados(m) || C.calcular(m));
      };
    });
    $$('[data-pegar]').forEach(b => b.onclick = () => modalPegar(m, b.dataset.pegar));
    const sel = $('[data-estado]');
    if (sel) sel.onchange = () => {
      const nuevo = sel.value;
      // Enviar a Odoo exige orden. Se revierte el selector en vez de dejarlo
      // mintiendo: un desplegable que muestra un estado que no se aplico es
      // peor que no dejar cambiarlo.
      if ((D.ESTADOS[nuevo] || {}).exige_so && !m.so) {
        sel.value = m.estado;
        toast('No se puede enviar a Odoo sin una orden ligada.');
        return;
      }
      m.estado = nuevo; tocado(m); vMachote(m.id);
    };
    const vv = $('#verVacios');
    if (vv) vv.onchange = () => { ST.verVacios = vv.checked; pintarHoja(m); };
    $$('[data-esc]').forEach(b => b.onclick = () => {
      m.escenario = b.dataset.esc; tocado(m); pintarHoja(m); barra(m, C.calcular(m));
    });
    $$('[data-add]').forEach(b => b.onclick = () => {
      const s = m.secciones.find(x => x.id === b.dataset.add); if (!s) return;
      s.partidas.push({ qty: 1, unidad: 'Pieza', tipo: 'Materiales', descripcion: '', modelo: '', marca: '',
                        pu: null, moneda: m.moneda, margen: null, link: '', comentario: '' });
      tocado(m); pintarHoja(m); barra(m, C.calcular(m));
    });
    const seccionDe = (ref) => {
      const [sid, j] = ref.split('#');
      return { s: m.secciones.find(x => x.id === sid), j: parseInt(j, 10) };
    };
    const refrescar = () => { tocado(m); pintarHoja(m); barra(m, C.calcular(m)); };

    $$('[data-del]').forEach(b => b.onclick = () => {
      const { s, j } = seccionDe(b.dataset.del); if (!s) return;
      s.partidas.splice(j, 1); refrescar();
    });
    $$('[data-dup]').forEach(b => b.onclick = () => {
      const { s, j } = seccionDe(b.dataset.dup); if (!s) return;
      // Duplicar es como se arma una lista de materiales de verdad: se copia el
      // renglón parecido y se cambia lo que difiere.
      s.partidas.splice(j + 1, 0, JSON.parse(JSON.stringify(s.partidas[j])));
      refrescar();
    });
    $$('[data-mov]').forEach(b => b.onclick = () => {
      const [ref, d] = b.dataset.mov.split('|');
      const { s, j } = seccionDe(ref); if (!s) return;
      const k = j + parseInt(d, 10);
      if (k < 0 || k >= s.partidas.length) return;
      const t = s.partidas[j]; s.partidas[j] = s.partidas[k]; s.partidas[k] = t;
      refrescar();
    });
    $$('[data-delsec]').forEach(b => b.onclick = () => {
      const i = m.secciones.findIndex(x => x.id === b.dataset.delsec);
      if (i < 0 || m.secciones.length < 2) return;
      m.secciones.splice(i, 1); ST.hoja = 'desglose'; tocado(m); vMachote(m.id);
    });
    $$('[data-dupsec]').forEach(b => b.onclick = () => {
      const i = m.secciones.findIndex(x => x.id === b.dataset.dupsec); if (i < 0) return;
      const copia = JSON.parse(JSON.stringify(m.secciones[i]));
      copia.id = 's-' + Date.now();
      copia.nombre = (copia.nombre || 'SECCIÓN') + ' (copia)';
      m.secciones.splice(i + 1, 0, copia);
      ST.hoja = copia.id; tocado(m); vMachote(m.id);
    });
    $$('[data-movsec]').forEach(b => b.onclick = () => {
      const [sid, d] = b.dataset.movsec.split('|');
      const i = m.secciones.findIndex(x => x.id === sid);
      const k = i + parseInt(d, 10);
      if (i < 0 || k < 0 || k >= m.secciones.length) return;
      // La ranura la da la POSICIÓN, no el nombre: mover una sección cambia a
      // qué renglón del RESUMEN va a caer.
      const t = m.secciones[i]; m.secciones[i] = m.secciones[k]; m.secciones[k] = t;
      tocado(m); vMachote(m.id);
    });
  }

  /* ── Revisión ────────────────────────────────────────────────────────── */
  function vRevision(id) {
    const m = mach(id); if (!m) { location.hash = '#/'; return; }
    const rev = R.revisar(m), c = rev.calc;
    top('Revisión', m.id + ' · ' + m.nombre, null, '#/m/' + id);
    $('#fija').innerHTML = '<div class="fija"><div class="grow"><div class="tiny">' +
      (rev.puedeConfirmar ? '✓ Se puede mandar' : '⛔ ' + rev.duras.length + ' hallazgo(s) duro(s)') +
      '</div></div><a class="btn" href="#/m/' + id + '">Volver a la hoja</a></div>';

    const bloque = (t, arr, cls) => !arr.length ? '' :
      '<h3 class="' + cls + '">' + t + ' (' + arr.length + ')</h3>' + arr.map(h =>
        '<div class="wg ' + cls + '"><strong>' + esc(h.titulo) + '</strong>' +
        '<div class="tiny oc">' + esc(h.area) + '</div><div>' + esc(h.detalle) + '</div>' +
        (h.items.length ? '<ul class="tiny">' + h.items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>' : '') +
        '<div class="btnrow"><button class="btn" data-goto="' + esc((h.destino && h.destino.tab) || '') + '"' +
        ' data-sec="' + esc((h.destino && h.destino.seccion) || '') + '">Ir a arreglarlo</button></div>' +
        '</div>').join('');

    $('#vista').innerHTML = '<div class="pad">' +
      '<div class="kpi"><div><span class="tiny">Precio</span><strong class="mono">' + mx(c.precio) + '</strong></div>' +
      '<div><span class="tiny">Margen</span><strong class="mono n-' + nivelMargen(c.margen) + '">' + pc(c.margen) + '</strong></div>' +
      '<div><span class="tiny">Huecos</span><strong class="mono">' + c.huecos + '</strong></div></div>' +
      (rev.total === 0 ? '<div class="vacio">Sin hallazgos.</div>' : '') +
      bloque('Duras · bloquean', rev.duras, 'bad') +
      bloque('Blandas · advierten', rev.blandas, 'warn') +
      bloque('Observaciones', rev.infos, 'info') + '</div>';

    $$('[data-goto]').forEach(b => b.onclick = () => {
      const t = b.dataset.goto;
      // La regla ya sabe EN QUÉ sección está el problema: se abre esa, no la
      // primera. Con los multiplicadores por sección, "la primera" es casi
      // siempre la equivocada. Si no la dice, se cae a la primera como antes.
      const pedida = b.dataset.sec && m.secciones.some(x => x.id === b.dataset.sec)
        ? b.dataset.sec : (m.secciones[0] && m.secciones[0].id);
      ST.hoja = (t === 'secc' && pedida) ? pedida : 'desglose';
      location.hash = '#/m/' + id;
    });
  }

  /* ── Estación 3.0 ────────────────────────────────────────────────────── */
  /* ── vOrden se retiró en V1.25 ──────────────────────────────────────────
   * Era la pantalla de cierre de handoff: una lista de entregables y un botón
   * «Cerrar handoff» que marcaba la orden como confirmada en un estado en
   * memoria. Corría sobre `D.ORDENES` —datos de ejemplo, nunca del servidor—
   * y su único enlace era la sección «Confirmar la orden» que se retiró en
   * V1.24, así que llevaba una versión alcanzable sólo tecleando el hash.
   *
   * Se fue con ella: la ruta `#/orden/:id`, `barraOrden`, la lista
   * `ENTREGABLES`, los helpers `orden()` y `hoff()`, y en el estado
   * `ST.ordenes`, `ST.handoff` y `ST.confirmadas`. En `demo.js` se fue
   * `ORDENES`. Lo que NO se tocó es la llave `handoff` del sobre de
   * `fts_machote_v1`: es formato ya escrito en los navegadores del equipo. */

  /* ── Aprobación ──────────────────────────────────────────────────────── */
  function vAprobar(id) {
    const m = mach(id); if (!m) { location.hash = '#/'; return; }
    const rev = R.revisar(m), c = rev.calc;
    top('Aprobación', m.id, null, '#/m/' + id);
    $('#fija').innerHTML = '';
    $('#vista').innerHTML = '<div class="pad"><h2>' + esc(m.nombre) + '</h2>' +
      '<div class="kpi"><div><span class="tiny">Precio</span><strong class="mono">' + mx(c.precio) + '</strong></div>' +
      '<div><span class="tiny">Margen</span><strong class="mono n-' + nivelMargen(c.margen) + '">' + pc(c.margen) + '</strong></div>' +
      '<div><span class="tiny">Duras</span><strong class="mono">' + rev.duras.length + '</strong></div></div>' +
      '<div class="wg"><h4>Lo que dirección tiene que ver antes de firmar</h4>' +
      '<div class="tot"><span class="lb">Costo</span><span class="vl mono calc">' + mx(c.costo) + '</span></div>' +
      '<div class="tot"><span class="lb">Comisiones</span><span class="vl mono calc">' + mx(c.escenario.comisionFts + c.escenario.comisionCliente) + '</span></div>' +
      '<div class="tot"><span class="lb">Utilidad</span><span class="vl mono calc">' + mx(c.utilidad) + '</span></div>' +
      '<div class="tot"><span class="lb">BUDGET ODOO cuadra</span><span class="vl mono n-' + (c.budget.cuadra ? 'ok' : 'bad') + '">' +
      (c.budget.cuadra ? 'sí' : 'no') + '</span></div></div>' +
      (rev.duras.length ? '<div class="aviso bad">Tiene ' + rev.duras.length + ' hallazgo(s) duro(s). No debería llegar aquí.</div>'
                        : '<div class="aviso ok">Sin hallazgos duros.</div>') + '</div>';
  }

  /* Lo mínimo que otro archivo necesita de la aplicación. Se expone SÓLO
   * `guardarYa` —lo usa el aviso de «tu permiso está por vencer» para su
   * botón «Guardar ahora»— en vez de colgar `ST` entero de `window`: un
   * estado global que cualquiera puede escribir es cómo se llega a dos
   * verdades sobre lo que hay en pantalla. */
  G.MachoteApp = {
    guardarYa: guardarYa,
    /* Y el directorio de gente, para que la franja del préstamo pueda decir
     * «Ricardo Hernández» donde el servidor sólo manda «ricardo.hernandez».
     * El nombre NO viaja en `machote_prestamo` a propósito: no hay tabla de
     * usuarios en el esquema `comercial` (migración 005) y no se va a crear
     * una para una etiqueta. Aquí ya se conoce, porque la lista lo trae. */
    personas: personasDelEquipo
  };

  render();
  /* PRIMERO el aviso de media versión, antes que cualquier otro: si la pantalla
   * está corriendo dos versiones, eso manda sobre todo lo demás que se pueda
   * decir. */
  avisarMezcla();
  avisoPassword();

  /* ── El arranque, en dos tiempos ────────────────────────────────────────
   *
   * Primero se pinta con la caché de ESTE navegador, que es síncrona: la
   * pantalla abre al instante y funciona sin red. Después se pide al servidor
   * y se repinta si trajo algo.
   *
   * Se hace en este orden a propósito. Un arranque que espera a la red deja
   * la pantalla en blanco cuando el wifi de la planta está malo, y deja de
   * funcionar del todo sin conexión — que es justo cuando alguien está
   * capturando en sitio. La caché no es un atajo: es el modo de operar.
   *
   * `bajar()` nunca pisa un machote con cambios sin subir; eso lo garantiza
   * el almacén, no esta llamada. */
  /* Si NUNCA se ha guardado nada en este navegador, lo que está en pantalla es
   * la DEMO — datos de ejemplo, no trabajo de nadie. Eso no se sube ni se
   * pisa: subirla llenaría Postgres de cotizaciones de mentiras a nombre de
   * quien abrió la página por primera vez. */
  const _hayCaptura = !!_guardado;

  if (A && A.bajar) {
    A.bajar().then(r => {
      if (!r || !r.ok) {
        // Sin servidor se sigue trabajando con lo local. Sólo se dice si hay
        // sesión: sin sesión el gate de la página ya mandó al login.
        if (r && r.error && r.error !== 'SIN_SESION' && _hayCaptura) {
          ST.pulso = A.pendientes(ST.machotes) ? 'pendiente' : ST.pulso;
          pintarPulso(); pintarPendientes();
        }
        return;
      }

      /* Sólo se reemplaza lo de pantalla si hay algo real que poner: o el
       * servidor trajo machotes, o esta persona ya tenía capturado aquí. Si
       * las dos están vacías, se queda la demo — que es lo que espera quien
       * abre la página por primera vez. */
      /* Lo ajeno entra aparte y NO se persiste. Si el servidor todavía no
       * manda `ajenos` —la versión publicada vieja— esto queda en [] y la
       * pantalla se comporta exactamente como antes. Tolerante primero: es la
       * regla anti-trabón de CLAUDE.md §8. */
      ST.ajenos = Array.isArray(r.ajenos) ? r.ajenos : [];

      if (Array.isArray(r.machotes) && (r.machotes.length || _hayCaptura || ST.ajenos.length)) {
        ST.machotes = r.machotes;
        render();
      }

      if (!_hayCaptura && !(r.machotes || []).length) return;   // sigue la demo: nada que subir

      ST.pulso = A.pendientes(ST.machotes) === 0 ? 'guardado' : 'pendiente';
      pintarPulso(); pintarPendientes();
      if (r.nuevos) toast('Se bajaron ' + r.nuevos + ' machote(s) del servidor.');
      // Lo que quedó pendiente de subir (de una sesión anterior sin red) sale
      // ahora, sin que nadie tenga que acordarse de tocar algo.
      if (A.pendientes(ST.machotes)) guardarYa();
    });
  }

  /* El catálogo se pide UNA vez al arrancar, en segundo plano. La pantalla no
   * lo espera: se pinta con el nombre de respaldo y se repinta sola cuando
   * Odoo contesta. Sólo se repinta si de verdad hay algo que cambiar —un
   * machote con `cliente_id`—, para no parpadear de gratis. */
  if (G.Clientes && ST.machotes.some(m => m.cliente_id)) {
    G.Clientes.cargar().then(r => { if (r.ok) render(); });
  }

  /* El catálogo de países, igual: en segundo plano y sin bloquear. Mientras no
   * llega, los tres campos del lugar son texto libre y se puede capturar; en
   * cuanto llega se repinta con los desplegables.
   *
   * Se pide SIEMPRE, no sólo cuando hace falta: es un archivo del repo, no una
   * llamada a Odoo, y el campo lo pide el revisador en cada machote. */
  if (G.MachoteGeo) {
    G.MachoteGeo.cargar().then(() => { render(); });
  }
})(window);
