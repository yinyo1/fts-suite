// ═══ Nómina · Incidencias — pantalla ═══
//
// Render y eventos. Toda decisión de "esto se puede enviar / esto falta" vive en
// logica.js; aquí solo se pinta lo que esa capa dice. Si una regla de negocio aparece
// en este archivo, está en el lugar equivocado.
//
// Se expone window.NomApp para que el gate lo monte en jsdom sin navegador.

(function () {
  'use strict';

  var Cat, Log, Des;
  var S = null;          // estado de la semana cargado
  var PANTALLA = 1;      // 1 roster · 2 disputas · 3 cierre
  var FILTRO = 'todos';
  var ACTIVO = null;     // id de la persona abierta en el cajón
  var SUCIO = false;     // hay cambios sin enviar
  // Copia de la persona tal como estaba AL ABRIR el cajón. Sin ella no hay forma de
  // saber qué estado se quitó: la lista nueva solo dice lo que quedó, y un estado
  // retirado hay que cerrarlo explícitamente en el server, no dejarlo vivo.
  var ORIG = null;
  // montar() dejó de correr una sola vez: desde que hay pantalla de semanas se puede
  // entrar y salir de una semana cuantas veces se quiera. Los listeners se enganchan
  // UNA vez y nunca más — engancharlos en cada montaje haría que el segundo clic en
  // "Enviar" mandara la semana dos veces, y el cajón se abriría por duplicado.
  var CABLEADO = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function persona(id) {
    for (var i = 0; i < S.personas.length; i++) if (S.personas[i].id === id) return S.personas[i];
    return null;
  }
  function nombreCorto(n) { return String(n).split(' ').slice(0, 2).join(' '); }

  // Lo que vale HOY para el premio de puntualidad: la decision de RH si la hay,
  // y si no, la sugerencia del sistema. La sugerencia NO es una decision — por eso
  // se distinguen: una palomita puesta por una persona y una calculada no valen
  // lo mismo cuando alguien reclama su premio tres semanas despues.
  function ppaVale(p) {
    if (p.ppa_decidido === true || p.ppa_decidido === false) return p.ppa_decidido;
    return !!(p.ppa && p.ppa.sugerido);
  }
  function ppaDecidido(p) { return p.ppa_decidido === true || p.ppa_decidido === false; }

  // ─── El envío de la semana ───
  // Siempre se lee del estado que vino del SERVER. Nunca hay una marca local de
  // "ya lo mandé": el 200 no prueba que quedó y una marca local sobrevive a un
  // fallo que el server nunca vio (CLAUDE.md §8, la UI no es fuente de verdad).
  var ENVIO_VACIO = { estado: 'borrador', version: 0, actor: null, enviado_en: null,
                      nombre_archivo: null, archivo: null, motivo: null,
                      bitacora: [], cambios_despues: 0 };
  function envio() { return (S && S.envio) || ENVIO_VACIO; }
  function yaEnviada() { var e = envio(); return e.estado === 'enviada' && Number(e.version) > 0; }

  // Odoo y las tablas guardan UTC; la gente lee CST. La conversión se hace SIEMPRE
  // al pintar y nunca al guardar, para que no haya dos husos en la misma columna.
  function fechaHoraCst(iso) {
    if (!iso) return '—';
    var ms = Date.parse(iso);
    if (isNaN(ms)) return String(iso);
    var d = new Date(ms - 6 * 3600000);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear() +
           ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ' CST';
  }

  // La descarga sale del navegador, sin pasar por el server: los datos ya están
  // aquí y un viaje de ida y vuelta solo agrega una forma más de fallar.
  function descargar(nombre, texto) {
    var blob = new Blob([texto], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // Lo mismo, pero para bytes. El .xlsx no es texto: si se le pasa a Blob como
  // cadena, el navegador lo re-codifica en UTF-8 y Excel abre un archivo corrupto.
  function descargarBytes(nombre, bytes) {
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // El archivo con lo que hay AHORA en pantalla. La versión que le toca es la
  // siguiente a la del último envío: así el nombre del archivo distingue la
  // corrección del original en la carpeta de descargas de Ulises.
  function archivoDeAhora() {
    var v = (Number(envio().version) || 0) + 1;
    var ses = window.NomAuth.getSession() || {};
    var meta = { version: v, actor: ses.user || ses.nombre || 'RH',
                 fecha: new Date().toISOString().slice(0, 16).replace('T', ' ') };
    // El CSV y el Excel salen del MISMO estado y la MISMA meta, en la misma llamada.
    // Si se armaran en dos momentos, una captura entre uno y otro los separaría y el
    // Excel que Magaly revisa no sería el archivo que se manda.
    return { version: v,
             nombre: Des.nombreArchivo(S.semana, v),
             texto: Des.texto(S, meta),
             nombre_excel: Des.nombreExcel(S.semana, v),
             hojas: Des.hojas(S, meta) };
  }

  // Aviso de guardado. Se pinta ANTES de saber el resultado solo como "guardando";
  // el "guardado" nunca se pinta hasta que el server contestó. Pintar el éxito antes
  // del POST es el anti-patrón que costó el incidente del 27-may (CLAUDE.md §14 #15).
  function aviso(estado, texto) {
    var el = $('guardado');
    if (!el) return;
    el.className = 'guardado ' + estado;
    el.textContent = texto;
    if (estado === 'ok') setTimeout(function () {
      if (el.textContent === texto) { el.className = 'guardado'; el.textContent = ''; }
    }, 4000);
  }

  // ─── Filtros del roster ───
  // "Pendientes" es el que de verdad se usa el viernes; va primero después de Todos.
  var FILTROS = [
    ['todos',     'Todos',            function () { return true; }],
    ['pend',      'Pendientes',       function (p) { return Log.bloqueos(p, S.semana, S.disputas).length > 0; }],
    ['inc',       'Con incidencia',   function (p) { return (p.declaraciones || []).length > 0; }],
    ['sin',       'Sin incidencia',   function (p) { return (p.declaraciones || []).length === 0; }],
    ['bono',      'Con bono',         function (p) { return (p.declaraciones || []).some(function (d) { return d.tipo === 'bono_proyecto'; }); }],
    ['estado',    'Con estado vivo',  function (p) { return Log.estadosVigentes(p, S.semana.hasta).length > 0; }]
  ];

  // ══════════════════════════ BANNER ══════════════════════════
  function pintarBanner() {
    var r = Log.resumenSemana(S.personas, S.semana, S.disputas);
    var el = $('banner'), btn = $('enviar');
    if (!el) return r;

    if (r.lista_para_enviar) {
      el.innerHTML = '<div class="banner ok"><span class="ico">✓</span><div>' +
        '<h3>La semana ' + esc(S.semana.id) + ' está lista para enviar</h3>' +
        '<div style="font-size:13px;color:var(--muted2)">' + r.personas +
        ' personas en el roster, todas con sus días cuadrados, sin declaraciones incompletas y sin checadas en disputa.</div>' +
        '</div></div>';
      if (btn) { btn.disabled = false; btn.textContent = etiquetaBoton(); }
      return r;
    }

    var li = '';
    for (var i = 0; i < r.detalle.length; i++) {
      var d = r.detalle[i];
      li += '<li><b>' + esc(nombreCorto(d.persona.nombre)) + '</b> — ' +
        esc(d.bloqueos.map(function (x) { return x.texto; }).join(' · ')) + '</li>';
    }
    el.innerHTML = '<div class="banner bad"><span class="ico">⛔</span><div>' +
      '<h3>No se puede enviar: ' + r.bloqueos_totales + ' cosa' + (r.bloqueos_totales > 1 ? 's' : '') +
      ' abierta' + (r.bloqueos_totales > 1 ? 's' : '') + ' en ' + r.con_bloqueo +
      ' persona' + (r.con_bloqueo > 1 ? 's' : '') + '</h3><ul>' + li + '</ul></div></div>';
    if (btn) { btn.disabled = true; btn.textContent = etiquetaBoton() + ' (' + r.bloqueos_totales + ' pendientes)'; }
    return r;
  }

  // Una semana ya enviada NO se cierra: se puede seguir capturando y volver a
  // mandar. Lo que cambia es el nombre del botón, para que nadie crea que está
  // mandando por primera vez algo que el despacho ya recibió.
  function etiquetaBoton() {
    return yaEnviada() ? 'Reenviar corregida a Nóminas FTS' : 'Enviar a Nóminas FTS';
  }

  // ══════════════════════════ PANTALLA 1 ══════════════════════════
  function pintarFiltros() {
    var h = '';
    for (var i = 0; i < FILTROS.length; i++) {
      var f = FILTROS[i], n = S.personas.filter(f[2]).length;
      h += '<button class="chipf" data-f="' + f[0] + '" aria-pressed="' + (FILTRO === f[0]) + '">' +
        f[1] + '<span class="n num">' + n + '</span></button>';
    }
    $('filtros').innerHTML = h;
  }

  function pintarTabla() {
    var f = FILTROS.filter(function (x) { return x[0] === FILTRO; })[0] || FILTROS[0];
    var lista = S.personas.filter(f[2]), h = '';

    for (var i = 0; i < lista.length; i++) {
      var p = lista[i];
      var c = Log.contarDias(p, S.semana);
      var b = Log.bloqueos(p, S.semana, S.disputas);
      var L = p.declaraciones || [];
      var color = b.length ? 'var(--red)' : (L.length ? 'var(--green)' : 'var(--border)');

      var tags = '';
      for (var k = 0; k < L.length; k++) {
        var mm = Cat.meta(L[k].tipo);
        if (mm) tags += '<span class="pill p-info">' + esc(mm.def.label) + '</span>';
      }
      if (!L.length) tags = '<span class="pill p-none">sin declarar</span>';

      // El motivo, en la fila. Antes habia que abrir el cajon o subir al aviso para
      // saberlo; con treinta renglones y el aviso fuera de pantalla, "esta en rojo y
      // no se por que" es un callejon sin salida. Se listan hasta dos y se dice
      // cuantos faltan: si se pintan los seis, el renglon se vuelve un parrafo.
      var porque = '';
      if (b.length) {
        var vistos = [];
        for (var bz = 0; bz < b.length && bz < 2; bz++) vistos.push(esc(b[bz].texto));
        porque = '<div class="porque">' + vistos.join(' \u00b7 ') +
                 (b.length > 2 ? ' \u00b7 y ' + (b.length - 2) + ' mas' : '') + '</div>';
      }

      var dinero = '<span style="color:var(--muted)">—</span>', partes = [];
      for (var q = 0; q < L.length; q++) {
        var m2 = Cat.meta(L[q].tipo);
        if (!m2 || m2.grupo === 'dias') continue;
        if (m2.def.multi) {
          var R = (L[q].valores && L[q].valores.renglones) || [];
          for (var w = 0; w < R.length; w++) {
            partes.push('<span class="pill ' + (R[w].so ? 'p-ok' : 'p-bad') + '">$' +
              Log.moneda(R[w].monto) + (R[w].so ? '' : ' · sin proyecto') + '</span>');
          }
        } else if (Number(L[q].valores && L[q].valores.monto) > 0) {
          partes.push('<span class="pill ' + (L[q].fuente || !m2.def.fuente ? 'p-ok' : 'p-bad') + '">$' +
            Log.moneda(L[q].valores.monto) + (m2.def.fuente && !L[q].fuente ? ' · sin fuente' : '') + '</span>');
        }
      }
      if (partes.length) dinero = partes.join(' ');

      var vig = Log.estadosVigentes(p, S.semana.hasta), et = '';
      for (var z = 0; z < vig.length; z++) {
        var m3 = Cat.meta(vig[z].tipo);
        if (m3) et += '<span class="pill p-warn">' + esc(m3.def.label) + '</span>';
      }
      if (!et) et = '<span style="color:var(--muted)">—</span>';

      // PPA. Se pinta SIEMPRE, incluso cuando no aplica: un hueco en la columna
      // se lee como "se me olvido", y aqui el "no aplica" es una respuesta.
      // El boton se pinta SIEMPRE, tambien para quien su ficha dice que no aplica:
      // ese es justo el caso que RH necesita poder forzar, y sin boton no se podia.
      var vale = ppaVale(p), dec = ppaDecidido(p);
      var noAplica = !(p.ppa && p.ppa.aplica);
      var ppaCel = '<button class="ppa ' + (vale ? 'si' : 'no') + (dec ? ' dec' : '') +
          (noAplica && !dec ? ' na' : '') + '" data-ppa="' + p.id + '" ' +
          'title="' + esc((p.ppa && p.ppa.motivo) || '') + (p.ppa_nota ? ' | Nota: ' + esc(p.ppa_nota) : '') + '">' +
          (noAplica && !dec ? 'no aplica' : (vale ? '&#10003; si' : '&#10007; no')) +
          '<span class="q">' + (dec ? 'decidido' : 'sugerido') + '</span></button>' +
          (p.ppa && p.ppa.revisar && !dec ? '<span class="pill p-bad">revisar</span>' : '');

      var diasCel = p.inactivo
        ? '<span class="pill p-none">n/a</span>'
        : '<span class="pill ' + (c.cuadra ? 'p-ok' : 'p-bad') + '">' + c.total + ' / ' + c.esperado + '</span>';

      h += '<tr data-id="' + p.id + '" tabindex="0">' +
        '<td class="st" style="background:' + color + '"></td>' +
        '<td><div class="nm">' + esc(p.nombre) +
          (p.inactivo ? ' <span class="pill p-warn">inactivo</span>' : '') + '</div>' +
          '<div class="rol">' + esc(p.puesto) + ' · ' + esc(p.departamento) + '</div>' + porque + '</td>' +
        '<td class="num">' + diasCel + '</td>' +
        '<td><div class="tags">' + tags + '</div></td>' +
        '<td><div class="tags">' + dinero + '</div></td>' +
        '<td><div class="tags">' + et + '</div></td>' +
        '<td><div class="tags">' + ppaCel + '</div></td></tr>';
    }
    $('tb').innerHTML = h || '<tr><td colspan="7" class="vacio">Nadie cae en este filtro.</td></tr>';

    // El clic en la palomita NO debe abrir el cajon: son dos acciones distintas
    // sobre el mismo renglon.
    var ps = $('tb').querySelectorAll('[data-ppa]');
    for (var pi = 0; pi < ps.length; pi++) {
      ps[pi].addEventListener('click', function (ev) {
        ev.stopPropagation();
        abrirPpa(Number(ev.currentTarget.getAttribute('data-ppa')));
      });
    }
  }

  // Guarda contra el doble clic. Escribir + releer tarda varios segundos contra
  // produccion; sin este candado, el segundo clic sale del estado VIEJO y deshace
  // el primero — y desde fuera se ve como si el boton no sirviera. Fue exactamente
  // lo que reporto Esteban.
  var PPA_EN_VUELO = false;

  function abrirPpa(id) {
    if (PPA_EN_VUELO) return;
    var p = persona(id);
    if (!p) return;
    pedirNotaPpa(p);
  }

  // Cambiar el premio a mano EXIGE decir por que. La nota no es un adorno: es lo
  // unico que queda cuando alguien reclama su premio tres semanas despues, y el
  // server la exige tambien — aqui solo se pide bien.
  function pedirNotaPpa(p) {
    var vale = ppaVale(p), nuevo = !vale, dec = ppaDecidido(p);
    var d = document.createElement('div');
    d.className = 'modal';
    d.innerHTML =
      '<div class="mpanel">' +
        '<h3>' + (nuevo ? 'Dar' : 'Quitar') + ' el premio a ' + esc(nombreCorto(p.nombre)) + '</h3>' +
        '<div class="msub">' + esc((p.ppa && p.ppa.motivo) || 'Sin datos de puntualidad.') + '</div>' +
        (dec && p.ppa_nota ? '<div class="mprev">Nota actual: ' + esc(p.ppa_nota) + '</div>' : '') +
        '<label for="ppaNota">¿Por qué? <span class="req">obligatorio</span></label>' +
        '<textarea id="ppaNota" rows="3" maxlength="500" placeholder="Ej.: Felipe lo citó 08:00 el martes, no llegó tarde."></textarea>' +
        '<div class="merr hid" id="ppaErr"></div>' +
        '<div class="mact">' +
          '<button class="btn" id="ppaCancel">Cancelar</button>' +
          '<button class="btn pri" id="ppaOk">' + (nuevo ? 'Dar el premio' : 'Quitar el premio') + '</button>' +
          (dec ? '<button class="btn" id="ppaReset" title="Vuelve a lo que sugiere el sistema">Volver a la sugerencia</button>' : '') +
        '</div>' +
      '</div>';
    document.body.appendChild(d);
    var ta = d.querySelector('#ppaNota');
    ta.focus();

    function cerrarModal() { if (d.parentNode) d.parentNode.removeChild(d); }
    function fallo(msg) {
      var e = d.querySelector('#ppaErr');
      e.textContent = msg; e.className = 'merr';
    }

    d.querySelector('#ppaCancel').addEventListener('click', cerrarModal);
    d.addEventListener('click', function (ev) { if (ev.target === d) cerrarModal(); });

    d.querySelector('#ppaOk').addEventListener('click', async function () {
      var nota = ta.value.trim();
      // La condicion es dura: sin nota NO se guarda. Dejarlo pasar convertiria la
      // nota en un campo que se aprende a saltar.
      if (nota.length < 4) { fallo('Escribe por qué. Sin eso no se guarda el cambio.'); ta.focus(); return; }
      cerrarModal();
      await escribirPpa(p, nuevo ? 'si' : 'no', nota);
    });

    var rst = d.querySelector('#ppaReset');
    if (rst) rst.addEventListener('click', async function () {
      cerrarModal();
      await escribirPpa(p, '', '');
    });
  }

  // La escritura: se manda, se relee del server, y solo entonces se pinta.
  async function escribirPpa(p, valor, nota) {
    var comoQueda = valor === '' ? 'sin decidir' : (valor === 'si' ? 'otorgado' : 'quitado');
    if (window.NomClient.modo() === 'demo') {
      p.ppa_decidido = valor === '' ? null : (valor === 'si');
      p.ppa_nota = nota;
      refrescar();
      aviso('ok', 'En práctica no se guarda, pero así se vería');
      return;
    }
    PPA_EN_VUELO = true;
    marcarPpaEnVuelo(p.id, true);
    aviso('yendo', 'Guardando el premio de ' + nombreCorto(p.nombre) + '…');
    try {
      await window.NomClient.guardarPersona(S.semana.id, p, valor, nota);
      await recargar();
      aviso('ok', 'Premio ' + comoQueda + ' · ' + nombreCorto(p.nombre));
    } catch (err) {
      marcarPpaEnVuelo(p.id, false);
      aviso('mal', 'NO se guardó el premio: ' + (err && err.msg ? err.msg : 'error desconocido'));
    }
    PPA_EN_VUELO = false;
  }

  // Mientras el server contesta, el botón se apaga y lo dice. Un botón que no
  // responde durante cuatro segundos sin decir nada se lee como un botón roto.
  function marcarPpaEnVuelo(id, si) {
    var b = document.querySelector('[data-ppa="' + id + '"]');
    if (!b) return;
    b.disabled = si;
    if (si) { b.dataset.antes = b.innerHTML; b.innerHTML = 'guardando…'; }
    else if (b.dataset.antes) { b.innerHTML = b.dataset.antes; }
  }

  // ══════════════════════════ CAJÓN DE CAPTURA ══════════════════════════
  function abrir(id) {
    ACTIVO = id;
    var p = persona(id);
    if (!p) return;
    $('dnom').textContent = p.nombre + (p.inactivo ? ' · inactivo' : '');
    $('dsub').textContent = p.puesto + ' · ' + p.departamento + ' · empleado ' + p.id;
    ORIG = JSON.parse(JSON.stringify(p));
    pintarCajon();
    $('drawer').setAttribute('open', '');
  }

  // Cerrar el cajón ES el momento de guardar: es cuando la persona termina de capturar
  // a alguien. No hay botón "guardar" aparte porque un botón que se puede olvidar es
  // una forma de perder trabajo.
  async function cerrar() {
    var p = persona(ACTIVO);
    var previo = ORIG;
    $('drawer').removeAttribute('open');
    ACTIVO = null; ORIG = null;
    if (!p || !previo) return;
    if (window.NomClient.modo() === 'demo') return;
    if (JSON.stringify(p) === JSON.stringify(previo)) return;   // nada cambió: no se escribe
    await guardarPersona(p, previo);
  }

  // Guarda una persona y RELEE la semana del server. La relectura no es paranoia: es
  // la única forma de que la pantalla muestre lo que Odoo y las tablas realmente
  // tienen, en vez de lo que el navegador cree haber mandado (CLAUDE.md §8).
  async function guardarPersona(p, previo) {
    aviso('yendo', 'Guardando ' + nombreCorto(p.nombre) + '…');
    try {
      // Se reenvia la decision de premio TAL COMO ESTA, con su nota. Si no, cerrar
      // el cajon para corregir unos dias borraria de rebote una decision que nadie
      // pidio deshacer — y el server la rechazaria por venir sin nota.
      await window.NomClient.guardarPersona(S.semana.id, p,
        ppaDecidido(p) ? (p.ppa_decidido ? 'si' : 'no') : '', p.ppa_nota || '');

      // Los estados viven en su propia tabla porque cruzan semanas. Los nuevos se
      // abren; los que la persona quitó se CIERRAN (vigente:false) en vez de
      // borrarse, para que quede la historia de que existieron.
      var antes = {}, ahora = {};
      (previo.estados || []).forEach(function (e) { antes[e.tipo] = e; });
      (p.estados || []).forEach(function (e) { ahora[e.tipo] = e; });
      for (var t in ahora) {
        if (JSON.stringify(ahora[t]) !== JSON.stringify(antes[t])) {
          await window.NomClient.guardarEstado(p.id, ahora[t], true);
        }
      }
      for (var t2 in antes) {
        if (!ahora[t2]) await window.NomClient.guardarEstado(p.id, antes[t2], false);
      }

      await recargar();
      aviso('ok', 'Guardado · ' + nombreCorto(p.nombre));
    } catch (err) {
      // El fallo se DICE. Un catch mudo aquí repetiría el bug #2 del kiosk: el
      // usuario cree que quedó y no quedó.
      aviso('mal', 'NO se guardó ' + nombreCorto(p.nombre) + ': ' + (err && err.msg ? err.msg : 'error desconocido'));
    }
  }

  // Relee la semana del server y repinta desde ahí.
  async function recargar() {
    var fresca = await window.NomClient.cargarSemana(S.semana.id);
    S = fresca;
    SUCIO = false;
    refrescar();
  }

  function pintarCajon() {
    var p = persona(ACTIVO);
    if (!p) return;
    var c = Log.contarDias(p, S.semana);
    var h = '';

    // Candado aritmético, con los días de México EDITABLES: es el único número que la
    // persona teclea directo; el resto sale de lo declarado. Verlo sumar en vivo es lo
    // que convierte el candado en herramienta y no en regaño al final.
    h += '<div class="box"><h4>Candado aritmético</h4><div class="calc">' +
      '<div>Días trabajados en México</div>' +
      '<div class="v"><input type="number" min="0" max="' + S.semana.dias + '" id="fmx" value="' + c.mexico + '" ' + (p.inactivo ? 'disabled' : '') + '></div>' +
      // Lo que Odoo registró va AL LADO del campo, no dentro: es un dato de apoyo,
      // no la respuesta. Quien captura decide, pero decide viendo las checadas.
      (p.dias_odoo === undefined ? '' :
        '<div style="grid-column:1/3;font-size:12px;color:var(--muted);margin:-4px 0 6px">' +
        'El kiosko registró <b>' + p.dias_odoo + '</b> ' + (p.dias_odoo === 1 ? 'día' : 'días') + ' con checada esta semana' +
        (p.dias_odoo === c.mexico ? '' : ' · lo capturado dice ' + c.mexico) +
        (p.capturado ? ' · ya capturado por RH' : '') + '</div>') +
      '<div>Días en USA</div><div class="v num">' + c.usa + '</div>' +
      '<div>Vacaciones y festivos</div><div class="v num">' + c.vac + '</div>' +
      '<div>Faltas, permisos e incapacidad</div><div class="v num">' + c.falta + '</div>' +
      '<div class="tot">Suma</div><div class="v tot num" style="color:' +
        (c.cuadra ? 'var(--green)' : 'var(--red)') + '">' + c.total + ' / ' + c.esperado + '</div>' +
      '</div>';
    if (p.inactivo) h += '<div class="aviso">Persona inactiva: no se le exigen días. Lo que se le declare sí se valida.</div>';
    h += '</div>';

    // El premio, con la evidencia dia por dia. Una sugerencia sin el detalle de
    // contra que se comparo no se puede discutir con quien reclama.
    {
      var vale2 = ppaVale(p), dec2 = ppaDecidido(p);
      h += '<div class="box"><h4>Premio de puntualidad</h4>' +
        '<div class="ppa-cab"><button class="ppa ' + (vale2 ? 'si' : 'no') + (dec2 ? ' dec' : '') +
          '" id="ppaTog">' + (vale2 ? '&#10003; se le da' : '&#10007; no se le da') + '</button>' +
        '<span class="q">' + (dec2 ? 'decidido por RH' : 'sugerido por el sistema') + '</span></div>' +
        '<div class="ppa-mot">' + esc((p.ppa && p.ppa.motivo) || 'Sin datos de puntualidad.') + '</div>' +
        (dec2 && p.ppa_nota
          ? '<div class="ppa-nota"><b>Nota:</b> ' + esc(p.ppa_nota) +
            '<div class="firma">' + esc(p.ppa_actor || '') +
            (p.ppa_fecha ? ' · ' + esc(String(p.ppa_fecha).slice(0, 10)) : '') + '</div></div>'
          : '');
      var DD = (p.ppa && p.ppa.dias) || [];
      if (DD.length) {
        h += '<table class="ppa-dias"><tr><th>Día</th><th>Entró</th><th>Contra ' + esc(p.ppa.hora_base) + '</th></tr>';
        for (var dd = 0; dd < DD.length; dd++) {
          var x = DD[dd];
          h += '<tr><td>' + esc(x.fecha) + '</td><td>' + esc(x.entrada) + '</td><td class="' +
            (x.otro_turno ? 'turno' : (x.ok ? 'ok' : 'mal')) + '">' +
            (x.otro_turno ? 'otro turno' : (x.retraso_min <= 0 ? (-x.retraso_min) + ' min antes' : x.retraso_min + ' min después')) +
            '</td></tr>';
        }
        h += '</table>';
      }
      h += '</div>';
    }

    var L = p.declaraciones || [];
    h += '<div class="box"><h4>Declaraciones de la semana</h4>';
    if (!L.length) h += '<div style="font-size:13px;color:var(--muted);margin-bottom:9px">Nada declarado todavía.</div>';
    for (var i = 0; i < L.length; i++) h += renglon(L[i], i, false);
    h += '<button class="add" id="addDecl">+ Agregar declaración</button><div id="zonaDecl"></div></div>';

    var E = p.estados || [];
    h += '<div class="box"><h4>Estado de la persona <span style="text-transform:none;font-weight:400">· dura semanas, no se redeclara</span></h4>';
    if (!E.length) h += '<div style="font-size:13px;color:var(--muted);margin-bottom:9px">Sin estados registrados.</div>';
    for (var k = 0; k < E.length; k++) h += renglon(E[k], k, true);
    h += '<button class="add" id="addEst">+ Agregar estado</button><div id="zonaEst"></div></div>';

    $('dbody').innerHTML = h;
    cablearCajon();
  }

  function renglon(d, idx, esEstado) {
    var mm = Cat.meta(d.tipo);
    if (!mm) return '';
    var det = [];

    if (mm.def.multi) {
      var R = (d.valores && d.valores.renglones) || [];
      for (var i = 0; i < R.length; i++) {
        det.push('$' + Log.moneda(R[i].monto) + ' → ' + (R[i].so || '⚠ sin proyecto'));
      }
    } else {
      var C = mm.def.campos || [];
      for (var k = 0; k < C.length; k++) {
        var v = d.valores ? d.valores[C[k][0]] : null;
        if (v === undefined || v === null || v === '' || v === false) continue;
        det.push(C[k][1] + ': ' + (v === true ? 'sí' : String(v)));
      }
    }
    if (d.fuente) {
      var f = Log.derivarFuente(d.fuente);
      if (f) det.push('Fuente: ' + f.clave + ' ' + f.nombre + ' · ' + f.empresa + ' · ' + f.moneda);
    } else if (mm.def.fuente) {
      det.push('⚠ sin fuente de pago');
    }
    if (mm.def.no_costo) det.push('no es costo del proyecto: es un préstamo');

    return '<div class="item"><div class="cuerpo"><div class="tit">' + esc(mm.def.label) + '</div>' +
      '<div class="det">' + esc(det.join(' · ')) + '</div></div>' +
      '<button class="quitar" data-quitar="' + idx + '" data-est="' + (esEstado ? '1' : '') + '">quitar</button></div>';
  }

  // Formulario de alta: los campos cambian con el tipo elegido. Un formulario fijo con
  // todos los campos de los 26 tipos sería ilegible y pediría datos que no aplican.
  function formulario(zonaId, soloEstados, alAgregar) {
    var zona = $(zonaId);
    if (!zona) return;
    var opts = '';
    for (var g in Cat.CATALOGO) {
      var G = Cat.CATALOGO[g];
      if (!!G.es_estado !== !!soloEstados) continue;
      opts += '<optgroup label="' + esc(G.titulo) + '">';
      for (var t in G.items) opts += '<option value="' + t + '">' + esc(G.items[t].label) + '</option>';
      opts += '</optgroup>';
    }
    zona.innerHTML = '<div class="box" style="margin-top:9px;border-color:var(--green)">' +
      '<label for="ntipo">Tipo</label><select id="ntipo">' + opts + '</select>' +
      '<div id="ncampos"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button class="btn pri" id="nok">Agregar</button>' +
      '<button class="btn" id="ncancel">Cancelar</button></div></div>';

    function pintarCampos() {
      var tipo = $('ntipo').value, mm = Cat.meta(tipo), h = '';
      if (!mm) { $('ncampos').innerHTML = ''; return; }

      if (mm.def.multi) {
        h += '<label for="c_monto">Monto</label><input type="number" id="c_monto" step="0.01">' +
             '<label for="c_so">Proyecto</label>' + selectProyecto('c_so');
      } else {
        var C = mm.def.campos || [];
        for (var i = 0; i < C.length; i++) {
          var nom = C[i][0], et = C[i][1], ti = C[i][2];
          h += '<label for="c_' + nom + '">' + esc(et) + '</label>';
          if (ti === 'bool') {
            h += '<select id="c_' + nom + '"><option value="">No</option><option value="1">Sí</option></select>';
          } else if (ti === 'so') {
            h += selectProyecto('c_' + nom);
          } else if (Array.isArray(ti)) {
            h += '<select id="c_' + nom + '"><option value="">—</option>';
            for (var j = 0; j < ti.length; j++) h += '<option>' + esc(ti[j]) + '</option>';
            h += '</select>';
          } else {
            h += '<input type="' + (ti === 'num' ? 'number' : (ti === 'date' ? 'date' : 'text')) + '" id="c_' + nom + '"' + (ti === 'num' ? ' step="0.01"' : '') + '>';
          }
        }
      }

      if (mm.def.fuente) {
        h += '<label for="c_fuente">Fuente de pago</label><select id="c_fuente"><option value="">— elige la fuente —</option>';
        for (var f in Cat.JOURNALS) h += '<option value="' + f + '">' + f + ' · ' + esc(Cat.JOURNALS[f].nombre) + '</option>';
        h += '</select><div class="derv" id="derv">La empresa y la moneda se derivan de la fuente.</div>';
      }
      if (mm.def.rubro) {
        var p = persona(ACTIVO), r = Cat.rubroBono(p);
        h += '<div class="derv">Rubro derivado del puesto: <b>' + esc(r || 'sin rubro de obra — este puesto no cobra bono de proyecto') + '</b></div>';
      }
      if (mm.def.no_costo) {
        h += '<div class="aviso">Esto es un <b>préstamo</b>, no costo del proyecto. No entra al reparto de mano de obra; se registra contra la cuenta de anticipos y se descuenta en semanas siguientes.</div>';
      }
      $('ncampos').innerHTML = h;

      var sel = $('c_fuente');
      if (sel) {
        sel.addEventListener('change', function () {
          var d = Log.derivarFuente(sel.value);
          $('derv').innerHTML = d
            ? 'Empresa: <b>' + esc(d.empresa) + '</b> · Moneda: <b>' + esc(d.moneda) + '</b>'
            : 'La empresa y la moneda se derivan de la fuente.';
        });
      }
    }

    $('ntipo').addEventListener('change', pintarCampos);
    pintarCampos();

    $('ncancel').addEventListener('click', function () { zona.innerHTML = ''; });
    $('nok').addEventListener('click', function () {
      var tipo = $('ntipo').value, mm = Cat.meta(tipo);
      if (!mm) return;
      var reg = { tipo: tipo, valores: {} };

      if (mm.def.multi) {
        reg.valores.renglones = [{ monto: Number($('c_monto').value) || 0, so: $('c_so').value || '' }];
      } else {
        var C = mm.def.campos || [];
        for (var i = 0; i < C.length; i++) {
          var nom = C[i][0], ti = C[i][2], el = $('c_' + nom);
          if (!el) continue;
          reg.valores[nom] = (ti === 'bool') ? (el.value === '1')
            : (ti === 'num' ? (Number(el.value) || 0) : el.value);
        }
      }
      if (mm.def.fuente) reg.fuente = $('c_fuente') ? $('c_fuente').value : '';
      zona.innerHTML = '';
      alAgregar(reg);
    });
  }

  function selectProyecto(id) {
    var P = S.proyectos || [];
    var lista = 'dl-' + id;
    var h = '<input id="' + id + '" list="' + lista + '" autocomplete="off" spellcheck="false" ' +
            'placeholder="Escribe SO, cliente o parte del nombre...">';
    h += '<datalist id="' + lista + '">';
    for (var i = 0; i < P.length; i++) h += '<option value="' + esc(P[i]) + '"></option>';
    h += '</datalist>';
    h += '<div class="pista">' + P.length + ' proyectos activos, de Mexico y de USA. ' +
         'Se escribe y se filtra solo; tambien se puede pegar el nombre completo.</div>';
    return h;
  }

  function cablearCajon() {
    var mx = $('fmx');
    if (mx) {
      mx.addEventListener('input', function () {
        var p = persona(ACTIVO);
        p.dias_mexico = Number(mx.value) || 0;
        SUCIO = true;
        // Se repinta el candado y la tabla, NO el cajón completo: repintarlo le robaría
        // el foco al campo mientras se teclea.
        actualizarCandado();
        pintarBanner(); pintarTabla();
      });
    }
    var pt = $('ppaTog');
    if (pt) pt.addEventListener('click', function () { abrirPpa(ACTIVO); });

    var ad = $('addDecl');
    if (ad) ad.addEventListener('click', function () {
      formulario('zonaDecl', false, function (reg) {
        persona(ACTIVO).declaraciones.push(reg); SUCIO = true; pintarCajon(); refrescar();
      });
    });
    var ae = $('addEst');
    if (ae) ae.addEventListener('click', function () {
      formulario('zonaEst', true, function (reg) {
        persona(ACTIVO).estados.push(reg); SUCIO = true; pintarCajon(); refrescar();
      });
    });
    var qs = $('dbody').querySelectorAll('[data-quitar]');
    for (var i = 0; i < qs.length; i++) {
      qs[i].addEventListener('click', function (ev) {
        var idx = Number(ev.currentTarget.getAttribute('data-quitar'));
        var est = ev.currentTarget.getAttribute('data-est') === '1';
        var p = persona(ACTIVO);
        (est ? p.estados : p.declaraciones).splice(idx, 1);
        SUCIO = true; pintarCajon(); refrescar();
      });
    }
  }

  function actualizarCandado() {
    var p = persona(ACTIVO);
    if (!p) return;
    var c = Log.contarDias(p, S.semana);
    var celdas = $('dbody').querySelectorAll('.calc .v');
    if (celdas.length >= 5) {
      celdas[1].textContent = c.usa;
      celdas[2].textContent = c.vac;
      celdas[3].textContent = c.falta;
      celdas[4].textContent = c.total + ' / ' + c.esperado;
      celdas[4].style.color = c.cuadra ? 'var(--green)' : 'var(--red)';
    }
  }

  // ══════════════════════════ PANTALLA 2 · DISPUTAS ══════════════════════════
  function pintarDisputas() {
    var D = S.disputas || [], h = '';
    var abiertas = D.filter(function (d) { return d.abierta; });

    // Rezago: checadas marcadas en disputa de semanas ANTERIORES. No frenan esta
    // nómina —si lo hicieran, no cerraría nunca— pero tampoco se ocultan: son deuda
    // real y su conteo tiene que doler un poco cada semana hasta que se limpie.
    var rz = S.rezago;
    if (rz && rz.total > 0) {
      h += '<div class="banner warn"><span class="ico">⏳</span><div>' +
        '<h3>' + rz.total + ' checadas en disputa de semanas anteriores</h3>' +
        '<div style="font-size:13px;color:var(--muted2)">Tocan a ' + rz.personas +
        ' persona' + (rz.personas === 1 ? '' : 's') + ' y la más vieja es del ' + esc(rz.desde) + '. ' +
        'No bloquean esta semana a propósito, pero siguen abiertas en Odoo. ' +
        'Se limpian desde el panel de incidencias, no desde aquí.</div></div></div>';
    }

    if (!abiertas.length) {
      h = '<div class="banner ok"><span class="ico">✓</span><div><h3>No queda ninguna checada en disputa</h3>' +
        '<div style="font-size:13px;color:var(--muted2)">Las disputas se resuelven aquí porque es el momento en que alguien puede resolverlas: ' +
        'antes vivían en el panel del supervisor y el freno aparecía una semana después, en la carga de mano de obra.</div></div></div>';
    }
    for (var i = 0; i < D.length; i++) {
      var d = D[i], p = persona(d.empleado_id);
      if (!p) continue;
      h += '<div class="disp" data-disputa="' + d.id + '">' +
        '<div class="top"><b>' + esc(p.nombre) + '</b>' +
        '<span class="pill p-info">' + esc(d.fecha) + '</span>' +
        (d.abierta ? '<span class="pill p-bad">abierta</span>' : '<span class="pill p-ok">resuelta</span>') +
        '<span style="font-size:12px;color:var(--muted)">asistencia ' + esc(d.attendance_id) + '</span></div>' +
        '<div class="ev"><b>Propuesta:</b> ' + esc(d.propuesta) + '<br><b>Evidencia:</b> ' + esc(d.evidencia) + '</div>';
      if (d.abierta) {
        h += '<div class="acc"><button class="btn pri" data-acc="resolver" data-id="' + d.id + '">Resolver esta checada</button>' +
          '<span class="pista">Abre el mismo flujo de aprobación del panel de incidencias.</span></div>';
      }
      h += '</div>';
    }
    $('p2').innerHTML = h;

    var bs = $('p2').querySelectorAll('[data-acc]');
    for (var k = 0; k < bs.length; k++) {
      bs[k].addEventListener('click', function (ev) {
        abrirResolver(Number(ev.currentTarget.getAttribute('data-id')));
      });
    }
  }

  // ══════════════ RESOLVER UNA CHECADA · el flujo del panel ══════════════
  // No se marca nada en local: se manda al MISMO resolver que usan supervisores y
  // RH desde Mi Perfil, y despues se relee. Marcar aqui y escribir alla serian dos
  // caminos para el mismo dato (CLAUDE.md §20.4), y el que pierde no deja rastro.

  var RESOLVIENDO = false;

  async function abrirResolver(idDisputa) {
    if (RESOLVIENDO) return;
    var d = null;
    for (var i = 0; i < (S.disputas || []).length; i++) if (S.disputas[i].id === idDisputa) d = S.disputas[i];
    if (!d) return;

    var quien = persona(d.empleado_id);
    var nombre = d.empleado_nombre || (quien && quien.nombre) || ('empleado ' + d.empleado_id);
    var caja = modal('Resolver la checada de ' + esc(nombreCorto(nombre)),
      '<div class="cargando">Leyendo la incidencia…</div>');

    var inc = null;
    if (window.NomClient.modo() === 'demo') {
      inc = { id_interno: d.folio, status: 'pendiente_rh', empleado_id: d.empleado_id,
              empleado_nombre: nombre,
              tipo: /AUTO-CIERRE/.test(d.folio || '') ? 'auto_cierre_pendiente'
                  : (/CHK/.test(d.folio || '') ? 'olvido_checkout' : 'olvido_entrada'),
              propuestas: [{ rol: 'empleado', comentario: 'Olvidé marcar la salida.' }] };
    } else {
      try {
        await window.NomResolver.cargarIncidencias(true);
        inc = window.NomResolver.porFolio(d.folio);
      } catch (err) {
        pintarResolver(caja, d, null, err && err.msg);
        return;
      }
    }
    pintarResolver(caja, d, inc, null);
  }

  function modal(titulo, cuerpo) {
    var el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = '<div class="mpanel ancho"><h3>' + titulo + '</h3><div class="mcuerpo"></div></div>';
    el.querySelector('.mcuerpo').innerHTML = cuerpo;
    el.addEventListener('click', function (ev) { if (ev.target === el && !RESOLVIENDO) cerrarModal(el); });
    document.body.appendChild(el);
    return el;
  }
  function cerrarModal(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

  function pintarResolver(caja, d, inc, errorCarga) {
    var cuerpo = caja.querySelector('.mcuerpo');
    var ses = window.NomAuth.getSession() || {};
    var yo = ses.empleado_id;

    // Sin incidencia en el almacen no hay nada que resolver por aqui: el TAG quedo
    // huerfano. Se dice y se manda a donde SI se puede limpiar, en vez de ofrecer
    // un boton que va a fallar.
    if (errorCarga || !inc) {
      cuerpo.innerHTML =
        '<div class="banner bad" style="margin:0"><span class="ico">⛔</span><div>' +
        '<h3>Esta checada no se puede resolver desde aquí</h3>' +
        '<div style="font-size:13px">' +
        (errorCarga ? esc(errorCarga)
                    : 'El TAG en Odoo apunta al folio <code>' + esc(d.folio) + '</code>, pero no existe ' +
                      'ninguna incidencia con ese folio. Es un TAG huérfano: se limpia desde Odoo o desde ' +
                      'el panel de incidencias, no desde aquí.') +
        '</div></div></div>' +
        '<div class="mact"><button class="btn" data-cerrar>Cerrar</button></div>';
      cuerpo.querySelector('[data-cerrar]').addEventListener('click', function () { cerrarModal(caja); });
      return;
    }

    // Salvaguarda anti-auto-aprobación (CLAUDE.md §3): nadie resuelve lo suyo.
    if (yo && inc.empleado_id === yo) {
      cuerpo.innerHTML =
        '<div class="banner bad" style="margin:0"><span class="ico">⛔</span><div>' +
        '<h3>Es tu propia checada</h3>' +
        '<div style="font-size:13px">No puedes resolver una incidencia tuya. Pídesela a otra persona de RH ' +
        'o a Dirección.</div></div></div>' +
        '<div class="mact"><button class="btn" data-cerrar>Cerrar</button></div>';
      cuerpo.querySelector('[data-cerrar]').addEventListener('click', function () { cerrarModal(caja); });
      return;
    }

    var ROL = 'rh';   // este módulo es de RH; el resolver decide si el estado lo permite
    var A = window.NomResolver.ACCIONES;
    var ult = (inc.propuestas && inc.propuestas.length) ? inc.propuestas[inc.propuestas.length - 1] : null;

    var h =
      '<div class="rctx">' +
        '<div><b>Empleado</b> ' + esc(inc.empleado_nombre || d.empleado_nombre ||
            ((persona(d.empleado_id) || {}).nombre) || '—') + ' · id ' + esc(inc.empleado_id || d.empleado_id) + '</div>' +
        '<div><b>Fecha</b> ' + esc(d.fecha) + ' · <b>asistencia</b> ' + esc(d.attendance_id) + '</div>' +
        '<div><b>Estado</b> ' + esc(inc.status || '—') + ' · <b>tipo</b> ' + esc(inc.tipo || '—') + '</div>' +
        '<div><b>Evidencia</b> ' + esc(d.evidencia) + '</div>' +
        (d.propuesta ? '<div><b>Proyecto propuesto</b> ' + esc(d.propuesta) + '</div>' : '') +
        (ult && ult.comentario ? '<div class="ult">Última nota (' + esc(ult.rol || '—') + '): «' + esc(ult.comentario) + '»</div>' : '') +
        '<div class="folio">' + esc(inc.id_interno) + '</div>' +
      '</div>' +
      '<div class="racciones">';
    for (var k in A) h += '<button class="racc ' + A[k].clase + '" data-accion="' + k + '">' + A[k].label + '</button>';
    h +=
      '</div>' +
      '<div id="rdet" class="hid">' +
        '<label for="rhora" id="rhoraLbl">Hora final <span class="req">se aplica en Odoo</span></label>' +
        '<input id="rhora" type="time" step="60">' +
        '<label for="rcom">Comentario <span class="req">obligatorio</span></label>' +
        '<textarea id="rcom" rows="3" maxlength="500" placeholder="Qué se decidió y por qué. Lo va a leer quien revise esto después."></textarea>' +
        '<div class="merr hid" id="rerr"></div>' +
        '<div class="mact">' +
          '<button class="btn" data-cerrar>Cancelar</button>' +
          '<button class="btn pri" id="rok">Confirmar</button>' +
          '<span class="pista">Actúas como <b>RH</b>.</span>' +
        '</div>' +
      '</div>';
    cuerpo.innerHTML = h;

    var elegida = null;
    var det = cuerpo.querySelector('#rdet');
    var btns = cuerpo.querySelectorAll('[data-accion]');
    for (var b = 0; b < btns.length; b++) {
      btns[b].addEventListener('click', function (ev) {
        elegida = ev.currentTarget.getAttribute('data-accion');
        // La elegida se queda viva y las demas se apagan. Cual accion esta elegida
        // decide lo que pasa en Odoo: si hay que adivinarlo por un borde, se va a
        // adivinar mal alguna vez.
        for (var z = 0; z < btns.length; z++) {
          var esta = btns[z] === ev.currentTarget;
          btns[z].classList.toggle('sel', esta);
          btns[z].classList.toggle('apagada', !esta);
        }
        det.className = '';
        // La hora solo se pide cuando de verdad se aplica. Pedirla siempre entrena
        // a rellenarla sin mirarla.
        var pide = window.NomResolver.requiereHora(elegida, ROL);
        cuerpo.querySelector('#rhora').className = pide ? '' : 'hid';
        cuerpo.querySelector('#rhoraLbl').className = pide ? '' : 'hid';
        cuerpo.querySelector('#rcom').focus();
      });
    }

    cuerpo.querySelector('[data-cerrar]').addEventListener('click', function () { cerrarModal(caja); });

    cuerpo.querySelector('#rok').addEventListener('click', async function () {
      var err = cuerpo.querySelector('#rerr');
      function fallo(m) { err.textContent = m; err.className = 'merr'; }
      if (!elegida) return fallo('Elige primero qué vas a hacer con la checada.');

      var com  = cuerpo.querySelector('#rcom').value;
      var hora = window.NomResolver.requiereHora(elegida, ROL) ? cuerpo.querySelector('#rhora').value : null;
      var malo = window.NomResolver.validar(elegida, ROL, com, hora);
      if (malo) return fallo(malo);

      if (window.NomClient.modo() === 'demo') {
        cerrarModal(caja);
        aviso('ok', 'En práctica no se manda nada al resolver');
        return;
      }

      var ok = cuerpo.querySelector('#rok');
      RESOLVIENDO = true;
      ok.disabled = true; ok.textContent = 'Enviando…';
      aviso('yendo', 'Enviando al resolver…');
      try {
        var r = await window.NomResolver.resolver({
          id_interno: inc.id_interno, accion: elegida, rol: ROL,
          actor_id: (window.NomAuth.getSession() || {}).empleado_id,
          actor_nombre: (window.NomAuth.getSession() || {}).nombre,
          comentario: com, hora_cst: hora
        });
        cerrarModal(caja);
        // Se relee: el TAG lo limpia el resolver en Odoo, y esta pantalla lee las
        // disputas de ese TAG. Hasta que no se relea, no sabemos que quedó.
        await recargar();
        aviso('ok', r.mensaje || 'Checada resuelta');
      } catch (e2) {
        ok.disabled = false; ok.textContent = 'Reintentar';
        fallo((e2 && e2.msg) || 'No se pudo resolver.');
        aviso('mal', 'NO se resolvió: ' + ((e2 && e2.msg) || 'error desconocido'));
      }
      RESOLVIENDO = false;
    });
  }

  // ══════════════════════════ PANTALLA 3 · CIERRE ══════════════════════════
  function pintarCierre() {
    var r = Log.resumenSemana(S.personas, S.semana, S.disputas);
    var t = Log.totalesDinero(S.personas);
    var conDecl = S.personas.filter(function (p) { return (p.declaraciones || []).length > 0; }).length;

    var h = '<div class="cierre-grid">' +
      kpi('Personas en el roster', r.personas, conDecl + ' con algo declarado') +
      kpi('Percepciones', '$' + Log.moneda(t.percepciones), 'bonos, primas, tiempo extra') +
      kpi('Descuentos', '$' + Log.moneda(t.descuentos), 'lo que se resta del neto') +
      kpi('Préstamos (no es costo)', '$' + Log.moneda(t.no_costo), 'anticipos: se recuperan') +
      '</div>';

    h += cajaEnvio();
    h += cajaArchivo();

    h += '<div class="box" style="background:var(--card)"><h4>Qué se verificó</h4>' +
      chk(r.bloqueos_totales === 0, 'Los días de cada persona suman ' + S.semana.dias) +
      chk(r.bloqueos_totales === 0, 'Ninguna declaración quedó sin fuente de pago ni sin proyecto') +
      chk(r.disputas_abiertas === 0, 'No queda ninguna checada en disputa') +
      '</div>';

    h += '<div class="box" style="background:var(--card)"><h4>Qué NO se verificó</h4>' +
      '<div style="font-size:13px;line-height:1.7;color:var(--muted2)">' +
      '· Que los montos sean los correctos: el módulo verifica que estén completos, no que estén bien.<br>' +
      '· Que las horas del kiosko cuadren con lo declarado: eso lo hace la carga de mano de obra, después.<br>' +
      '· Que el despacho capture lo que se manda: el archivo sale de aquí, pero el acuse de Ulises todavía no existe. El envío es de ida.' +
      '</div></div>';

    if (Object.keys(t.por_fuente).length) {
      h += '<div class="box" style="background:var(--card)"><h4>Por fuente de pago</h4><div class="tags">';
      for (var f in t.por_fuente) {
        var d = Log.derivarFuente(f);
        h += '<span class="pill ' + (d ? 'p-info' : 'p-bad') + '">' + esc(f) +
          (d ? ' · ' + esc(d.moneda) : ' · sin fuente') + ' · $' + Log.moneda(t.por_fuente[f]) + '</span>';
      }
      h += '</div></div>';
    }
    $('p3').innerHTML = h;

    var bA = $('bajar-archivo');
    if (bA) bA.addEventListener('click', function () {
      var a = archivoDeAhora();
      descargar(a.nombre, a.texto);
      aviso('ok', 'Archivo descargado: ' + a.nombre);
    });
    var bX = $('bajar-excel');
    if (bX) bX.addEventListener('click', function () {
      var a = archivoDeAhora();
      descargarBytes(a.nombre_excel, window.NomExcel.libro(a.hojas));
      aviso('ok', 'Previa en Excel: ' + a.nombre_excel);
    });
    // Lo que se ENVIÓ y lo que hay AHORA son dos archivos distintos en cuanto
    // alguien corrige un día. Por eso son dos botones y no uno: el de arriba baja
    // el congelado, tal como salió; el de abajo baja lo de este momento.
    var bE = $('bajar-enviado');
    if (bE) bE.addEventListener('click', function () {
      var e = envio();
      descargar(e.nombre_archivo || Des.nombreArchivo(S.semana, e.version), e.archivo || '');
      aviso('ok', 'Descargado lo que se envió (v' + e.version + ')');
    });
  }
  // ─── Estado del envío ───
  // Es lo primero que hay que ver al volver a una semana: si ya se mandó, cuándo,
  // quién, en qué versión, y —lo que de verdad importa— si hay capturas posteriores
  // que el despacho todavía no tiene. Ese conteo lo hace el SERVER comparando fechas
  // de guardado contra la del envío; la pantalla solo lo pinta.
  function cajaEnvio() {
    var e = envio();
    if (!yaEnviada()) {
      return '<div class="box" style="background:var(--card)"><h4>Estado del envío</h4>' +
        '<div style="font-size:13px;color:var(--muted2)">Esta semana todavía <b>no se ha enviado</b>. ' +
        'Puedes bajar el archivo de aquí abajo las veces que quieras para revisarlo antes de mandarlo.</div></div>';
    }
    var atrasado = Number(e.cambios_despues) > 0;
    var h = '<div class="box" style="background:' + (atrasado ? 'var(--amber-l)' : 'var(--green-l)') + '">' +
      '<h4>Estado del envío</h4>' +
      '<div style="font-size:14px;font-weight:700;margin-bottom:5px">' +
      (atrasado ? '⚠ Enviada, pero con cambios posteriores' : '✓ Enviada') +
      ' · versión ' + esc(e.version) + '</div>' +
      '<div style="font-size:13px;line-height:1.7;color:var(--muted2)">' +
      'El ' + esc(fechaHoraCst(e.enviado_en)) + ' por <b>' + esc(e.actor || '—') + '</b>' +
      (e.nombre_archivo ? ' · archivo <code>' + esc(e.nombre_archivo) + '</code>' : '') +
      (e.motivo ? '<br>Última corrección: ' + esc(e.motivo) : '') +
      '</div>';

    if (atrasado) {
      h += '<div style="font-size:13px;line-height:1.6;margin-top:9px">' +
        '<b>' + esc(e.cambios_despues) + ' persona' + (Number(e.cambios_despues) > 1 ? 's se han capturado' : ' se ha capturado') +
        ' después del envío.</b> Lo que tiene el despacho es la versión ' + esc(e.version) +
        '; para que le llegue lo corregido hay que <b>reenviar</b>.</div>';
    }

    h += '<div class="mact" style="margin-top:12px">' +
      (e.archivo ? '<button class="btn" id="bajar-enviado">Bajar lo que se envió (v' + esc(e.version) + ')</button>' : '') +
      '</div>';

    // La bitácora: quién mandó qué y por qué, en orden. Es lo único que queda cuando
    // alguien pregunta tres semanas después por qué la nómina de esa semana cambió.
    var B = e.bitacora || [];
    if (B.length) {
      h += '<div style="margin-top:12px"><h4 style="margin-bottom:6px">Movimientos</h4>' +
        '<div style="font-size:12px;line-height:1.8;color:var(--muted2)">';
      for (var i = B.length - 1; i >= 0; i--) {
        h += '· v' + esc(B[i].version) + ' ' + esc(B[i].accion) + ' — ' + esc(fechaHoraCst(B[i].ts)) +
          ' por ' + esc(B[i].actor || '—') + (B[i].motivo ? ' · ' + esc(B[i].motivo) : '') + '<br>';
      }
      h += '</div></div>';
    }
    return h + '</div>';
  }

  // ─── El archivo para el despacho ───
  // La vista previa NO enseña las 28 columnas: enseña la que se lee. La columna
  // INSTRUCCION es una frase en español con todo lo que hay que hacerle a esa
  // persona, y es ahí donde Magaly cacha un error antes de mandarlo — no en una
  // rejilla de veintiocho celdas casi todas vacías.
  function cajaArchivo() {
    var F = Des.filas(S), T = Des.totales(F);
    var h = '<div class="box" style="background:var(--card)"><h4>Archivo para el despacho</h4>' +
      '<div style="font-size:13px;color:var(--muted2);line-height:1.6;margin-bottom:11px">' +
      'Un renglón por persona con la instrucción de qué hacerle. ' +
      '<b>' + F.length + ' renglones</b> y ' + Des.COLUMNAS.length + ' columnas: ' +
      Des.COLUMNAS.map(function (c) { return c.t.toLowerCase(); }).join(', ') + '. ' +
      'El renglón de quien tiene una semana normal va <b>en blanco</b>, igual que en la lista ' +
      'de raya de Magaly: solo se escribe lo que hay que hacer, con su cantidad y su concepto.' +
      '</div>';

    h += '<div class="tabla-wrap" style="margin-bottom:11px"><table><thead><tr>' +
      '<th>#</th><th>Persona</th><th>Días</th><th>Premio</th><th>Instrucción</th></tr></thead><tbody>';
    for (var i = 0; i < F.length; i++) {
      var f = F[i];
      h += '<tr' + (f.revisar ? ' style="background:var(--amber-l)"' : '') + '>' +
        '<td class="num">' + esc(f.no_empleado) + '</td>' +
        '<td>' + esc(nombreCorto(f.nombre)) + '</td>' +
        '<td class="num">' + esc(f.dias_mx + f.dias_usa) + '</td>' +
        '<td>' + esc(f.ppa) + '</td>' +
        '<td style="font-size:12px;line-height:1.55">' + esc(f.instruccion) +
        (f.revisar ? '<div style="color:var(--amber);font-weight:700;margin-top:3px">⚠ ' + esc(f.revisar) + '</div>' : '') +
        '</td></tr>';
    }
    h += '<tr><td></td><td><b>' + esc(T.nombre) + '</b></td>' +
      '<td class="num"><b>' + esc(T.dias_mx + T.dias_usa) + '</b></td>' +
      '<td><b>' + esc(T.ppa) + '</b></td><td></td></tr>';
    h += '</tbody></table></div>';

    // Dos botones, dos usos. El .csv es EL ARCHIVO: es lo que se congela al enviar y
    // lo que el despacho captura. El .xlsx es la VISTA para revisarlo antes de
    // mandarlo —se lee mucho mejor que un CSV— y trae una segunda pestaña con el
    // detalle por concepto para quien quiera ver de dónde salió cada instrucción.
    h += '<div class="mact">' +
      '<button class="btn pri" id="bajar-archivo">Descargar el archivo (.csv)</button>' +
      '<button class="btn" id="bajar-excel">Ver la previa en Excel (2 hojas)</button>' +
      '</div>';
    return h + '</div>';
  }

  function kpi(k, v, s) {
    return '<div class="kpi"><div class="k">' + esc(k) + '</div><div class="v num">' + esc(v) +
      '</div><div class="s">' + esc(s) + '</div></div>';
  }
  function chk(ok, txt) {
    return '<div style="font-size:13px;line-height:1.9">' + (ok ? '✓ ' : '⛔ ') + esc(txt) + '</div>';
  }

  // ══════════════════════════ ORQUESTACIÓN ══════════════════════════
  function refrescar() {
    pintarBanner();
    if (PANTALLA === 1) { pintarFiltros(); pintarTabla(); }
    if (PANTALLA === 2) pintarDisputas();
    if (PANTALLA === 3) pintarCierre();
    pintarTabs();
  }

  function pintarTabs() {
    var r = Log.resumenSemana(S.personas, S.semana, S.disputas);
    var defs = [
      [1, 'Semana', r.con_bloqueo],
      [2, 'Disputas', r.disputas_abiertas],
      [3, 'Cierre', null]
    ];
    var h = '';
    for (var i = 0; i < defs.length; i++) {
      h += '<button class="tab" data-p="' + defs[i][0] + '" aria-selected="' + (PANTALLA === defs[i][0]) + '">' +
        defs[i][1] + (defs[i][2] ? '<span class="n num">' + defs[i][2] + '</span>' : '') + '</button>';
    }
    $('tabs').innerHTML = h;
    var bs = $('tabs').querySelectorAll('.tab');
    for (var k = 0; k < bs.length; k++) {
      bs[k].addEventListener('click', function (ev) { irA(Number(ev.currentTarget.getAttribute('data-p'))); });
    }
  }

  function irA(n) {
    PANTALLA = n;
    $('p1').className = n === 1 ? '' : 'hid';
    $('p2').className = n === 2 ? '' : 'hid';
    $('p3').className = n === 3 ? '' : 'hid';
    refrescar();
  }

  function montar(estado) {
    Cat = window.NomCatalogo; Log = window.NomLogica; Des = window.NomDespacho;
    S = estado;
    $('semana-id').textContent = S.semana.id;
    $('semana-rango').textContent = 'del ' + S.semana.desde + ' al ' + S.semana.hasta + ' · ' + S.semana.dias + ' días';

    // La insignia de modo la pinta el arranque de index.html, NO aquí. Antes la
    // escribían los dos y ganaba el último: el pie decía PRÁCTICA y la insignia
    // decía otra cosa. Un solo escritor por campo (CLAUDE.md §20.4), y tiene que
    // ser el arranque porque la insignia debe ser correcta aunque la semana falle
    // al cargar y montar() nunca corra.

    // Cada semana se abre limpia: en el roster y sin filtro. Heredar la pestaña de
    // cierre o el filtro "pendientes" de la semana anterior haría que la nueva
    // pareciera vacía sin decir por qué.
    FILTRO = 'todos';
    ACTIVO = null;
    SUCIO = false;
    irA(1);

    if (CABLEADO) return S;
    CABLEADO = true;

    $('tb').addEventListener('click', function (ev) {
      var tr = ev.target.closest ? ev.target.closest('tr[data-id]') : null;
      if (tr) abrir(Number(tr.getAttribute('data-id')));
    });
    $('filtros').addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-f]') : null;
      if (b) { FILTRO = b.getAttribute('data-f'); pintarFiltros(); pintarTabla(); }
    });
    $('dx').addEventListener('click', cerrar);
    $('dcerrar').addEventListener('click', cerrar);
    $('drawer').addEventListener('click', function (ev) { if (ev.target === $('drawer')) cerrar(); });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') cerrar(); });

    var env = $('enviar');
    if (env) env.addEventListener('click', enviar);
    return S;
  }

  // ══════════════════════════ ENVIAR ══════════════════════════
  // Enviar hace DOS cosas y ninguna se puede quedar a medias: genera el archivo que
  // Ulises captura en CONTPAQi, y deja la semana marcada como enviada. El archivo se
  // manda al server y ahí se congela, para que 'bajar lo que se envió' devuelva los
  // mismos bytes aunque mañana se corrija un día.
  //
  // El éxito NUNCA se pinta antes de que el server conteste, y después del OK se
  // RELEE la semana: el 200 no prueba que quedó (CLAUDE.md §20.5), y el anti-patrón
  // que costó el incidente del 27-may fue exactamente pintar el ✓ antes del POST.
  var ENVIANDO = false;

  async function enviar() {
    if (ENVIANDO) return;
    irA(3);
    var el = $('banner');
    if (window.NomClient.modo() === 'demo') {
      el.innerHTML = '<div class="banner warn"><span class="ico">⚠</span><div>' +
        '<h3>Estás en modo práctica: esto no se envió</h3>' +
        '<div style="font-size:13px;color:var(--muted2)">El módulo revisó todo y la semana pasa, ' +
        'y el archivo de aquí abajo se puede bajar para verlo. Pero en PRÁCTICA nada sale de tu ' +
        'navegador: cambia a REAL en la insignia de arriba para enviar de verdad.' +
        '</div></div></div>';
      return;
    }

    // Reenviar una semana ya enviada exige decir qué se corrigió. El server lo vuelve
    // a exigir (REENVIO_SIN_MOTIVO): preguntarlo aquí es para que la persona no se
    // tope con el rechazo después de haber apretado el botón.
    var motivo = '';
    if (yaEnviada()) {
      motivo = await pedirMotivoCorreccion();
      if (motivo === null) return;      // se arrepintió
    }
    await mandar(motivo);
  }

  async function mandar(motivo) {
    ENVIANDO = true;
    var el = $('banner'), btn = $('enviar');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
    var r = Log.resumenSemana(S.personas, S.semana, S.disputas);
    var t = Log.totalesDinero(S.personas);
    var arch = archivoDeAhora();
    aviso('yendo', 'Enviando la semana…');
    try {
      await window.NomClient.guardarEnvio(S.semana.id, {
        personas: r.personas, con_bloqueo: r.con_bloqueo, bloqueos: r.bloqueos_totales,
        con_declaracion: r.con_declaracion, disputas_abiertas: r.disputas_abiertas,
        renglones: Des.filas(S).length,
        dinero: { percepciones: t.percepciones, descuentos: t.descuentos, no_costo: t.no_costo }
      }, arch.texto, arch.nombre, motivo || '');
      await recargar();
      aviso('ok', 'Semana ' + S.semana.id + ' enviada (v' + arch.version + ')');
      irA(3);
      // La descarga sale sola: el archivo es el producto del envío, y obligar a un
      // clic más es la forma de que alguien mande la semana y se le olvide bajarlo.
      descargar(arch.nombre, arch.texto);
    } catch (err) {
      aviso('mal', 'NO se envió: ' + (err && err.msg ? err.msg : 'error desconocido'));
      el.innerHTML = '<div class="banner bad"><span class="ico">⛔</span><div>' +
        '<h3>La semana NO se envió</h3><div style="font-size:13px;color:var(--muted2)">' +
        esc(err && err.msg ? err.msg : 'Error desconocido') +
        (err && err.code ? ' (' + esc(err.code) + ')' : '') + '</div></div></div>';
    } finally {
      ENVIANDO = false;
      pintarBanner();
    }
  }

  // Diálogo del motivo de la corrección. Devuelve el texto, o null si se cancela.
  function pedirMotivoCorreccion() {
    return new Promise(function (resolve) {
      var e = envio();
      var caja = modal('Corregir una semana ya enviada',
        '<div class="msub">La semana ' + esc(S.semana.id) + ' se envió el ' + esc(fechaHoraCst(e.enviado_en)) +
        ' por ' + esc(e.actor || '—') + ' (versión ' + esc(e.version) + '). ' +
        'Vas a mandar la <b>versión ' + (Number(e.version) + 1) + '</b>, que reemplaza a la anterior ' +
        'ante el despacho.</div>' +
        '<div class="mprev">Lo que se envió antes NO se borra: queda guardado y se puede volver a bajar.</div>' +
        '<label for="mot">¿Qué se corrigió? <span class="req">obligatorio</span></label>' +
        '<textarea id="mot" rows="3" placeholder="Ej.: a Pedro le faltaba 1 día de incapacidad con folio"></textarea>' +
        '<div id="moterr"></div>' +
        '<div class="mact"><button class="btn pri" id="motok">Reenviar corregida</button>' +
        '<button class="btn" data-cerrar>Cancelar</button></div>');
      var cuerpo = caja.querySelector('.mpanel');
      var listo = false;
      function cerrar(valor) { if (listo) return; listo = true; cerrarModal(caja); resolve(valor); }
      caja.addEventListener('click', function (ev) { if (ev.target === caja) cerrar(null); });
      cuerpo.querySelector('[data-cerrar]').addEventListener('click', function () { cerrar(null); });
      cuerpo.querySelector('#motok').addEventListener('click', function () {
        var v = ('' + cuerpo.querySelector('#mot').value).trim();
        if (v.length < 4) {
          var err = cuerpo.querySelector('#moterr');
          err.textContent = 'Escribe qué se corrigió: el server no acepta un reenvío sin motivo.';
          err.className = 'merr';
          return;
        }
        cerrar(v);
      });
      var ta = cuerpo.querySelector('#mot');
      if (ta && ta.focus) ta.focus();
    });
  }

  window.NomApp = {
    montar: montar,
    refrescar: refrescar,
    irA: irA,
    abrir: abrir,
    cerrar: cerrar,
    estado: function () { return S; },
    filtro: function (f) { if (f !== undefined) { FILTRO = f; pintarFiltros(); pintarTabla(); } return FILTRO; },
    abrirResolver: abrirResolver,
    recargar: recargar,
    sucio: function () { return SUCIO; }
  };
})();
