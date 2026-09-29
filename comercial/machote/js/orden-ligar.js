/* ═══ Ligar una cotización a una orden de venta ═════════════════════════════
 *
 * La liga va en los DOS sentidos y es la misma: desde la orden se elige el
 * machote, y desde el machote se elige la orden. Las dos pantallas llaman aquí,
 * por lo mismo de siempre — dos selectores acaban escribiendo la liga de dos
 * formas distintas y el día que difieran nadie sabrá cuál creer.
 *
 * ── DÓNDE VIVE LA LIGA, Y POR QUÉ NO DONDE VIVÍA ────────────────────────────
 * En la base (migración 011), no en la libreta del navegador. La libreta está
 * indexada por `id_local` y guarda **sólo lo propio**, así que una orden creada
 * por otra persona contestaba `null` y la pantalla decía «Sin orden ligada» de
 * algo que sí existe: el defecto exacto de CLAUDE.md §20 #13.
 *
 * ── LO QUE PASA SI DOS MACHOTES APUNTAN A LA MISMA ORDEN ────────────────────
 * Se permite, y **uno manda**. Impedirlo obligaría a desligar el bueno para
 * poder probar con otro, y el modo de fallo de eso es que alguien suelte la
 * liga correcta. Permitirlo sin más dejaría a la Confirmación sin saber de cuál
 * leer el contacto y el IVA, que no se puede dejar al azar de un ORDER BY. Los
 * dos índices de la 011 son esa decisión escrita en la base.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (G) {
  'use strict';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  var _st = { soId: null, soName: null, alTerminar: null, q: '' };

  /** Las cotizaciones entre las que se puede elegir: las de ESTE navegador.
   *  Si una no está aquí no se puede ofrecer, y eso se dice — ofrecer una lista
   *  corta sin avisar se lee como «no hay más», que es el mismo vacío que se
   *  confunde con una respuesta (§20 #11). */
  function candidatas() {
    var todos = (G.MachoteApp && G.MachoteApp.todos) ? G.MachoteApp.todos() : [];
    var q = norm(_st.q);
    var vivos = todos.filter(function (m) { return !m.archivado && !m.borrado; });
    if (!q) return vivos.slice(0, 40);
    return vivos.filter(function (m) {
      return norm(m.nombre).indexOf(q) >= 0 ||
             norm(m.cliente).indexOf(q) >= 0 ||
             norm(m.folio_txt || m.folio || '').indexOf(q) >= 0 ||
             norm(m.id).indexOf(q) >= 0;
    }).slice(0, 40);
  }

  /** Lo que la libreta de sincronización sabe de este machote. El uuid Y el
   *  folio viven ahí, no en el documento: el folio lo asigna el servidor. Leer
   *  `m.folio` devuelve vacío y la lista sale mostrando el id de pantalla, que
   *  no es el número por el que nadie conoce la cotización. */
  function libretaDe(m) {
    if (!m) return null;
    try {
      var s = JSON.parse(localStorage.getItem('fts_machote_sync_v1') || '{}') || {};
      return s[m.id] || null;
    } catch (e) { return null; }
  }
  function uuidDe(m) { var l = libretaDe(m); return (l && l.machote_id) || null; }
  function folioDe(m) {
    var l = libretaDe(m);
    return (l && (l.folio_txt || l.folio)) || m.folio_txt || m.folio || m.id;
  }

  function html() {
    var lista = candidatas();
    var filas = lista.length
      ? lista.map(function (m) {
          var uuid = uuidDe(m);
          return '<label class="lg-fila' + (uuid ? '' : ' sin') + '">' +
            '<input type="radio" name="lgM" value="' + esc(m.id) + '"' +
              (uuid ? '' : ' disabled') + ' />' +
            '<span class="lg-tx">' +
              '<b>' + esc(folioDe(m)) + '</b> · ' + esc(m.nombre) +
              '<span class="tiny nota">' + esc(m.cliente || 'sin cliente') +
                (uuid ? '' : ' · <b>todavía no ha subido al servidor</b>, y una liga ' +
                  'necesita su identidad de allá') + '</span>' +
            '</span></label>';
        }).join('')
      : '<p class="tiny nota">Ninguna cotización de este navegador casa con eso. ' +
        '<b>Quita la búsqueda antes de concluir que no existe</b>: aquí sólo salen las ' +
        'de este navegador, no las de todo el equipo.</p>';

    return '<div class="pu-modal">' +
      '<div class="pu-cab"><h3>Ligar una cotización a ' + esc(_st.soName || 'la orden') + '</h3>' +
        '<button class="btn" id="lgX">×</button></div>' +
      '<div class="pu-cuerpo">' +
        '<p class="tiny">La liga se escribe en la base, no en este navegador: así la ve ' +
          'todo el equipo y no sólo quien la puso.</p>' +
        '<label class="campo"><span>Buscar por folio, nombre o cliente</span>' +
          '<input type="text" id="lgQ" value="' + esc(_st.q) + '" ' +
          'placeholder="COT-00…, nombre del proyecto, cliente" /></label>' +
        '<div class="lg-lista">' + filas + '</div>' +
        '<label class="lg-pri"><input type="checkbox" id="lgPri" checked /> ' +
          '<span>Que ésta sea la que manda para la Confirmación' +
          '<span class="tiny nota">Si la orden ya tiene otra ligada, aquélla se queda ' +
          'ligada y deja de mandar. Nada se borra.</span></span></label>' +
      '</div>' +
      '<div class="pu-pie">' +
        '<button class="btn" id="lgCancel">Cancelar</button>' +
        '<button class="btn primario" id="lgOk" disabled>Ligar</button>' +
      '</div></div>';
  }

  function caja() {
    var c = document.getElementById('lgVelo');
    if (c) return c;
    c = document.createElement('div');
    c.id = 'lgVelo'; c.className = 'pu-velo';
    document.body.appendChild(c);
    return c;
  }

  function pintar() {
    var c = caja();
    c.innerHTML = html();
    c.classList.add('abierto');

    var q = c.querySelector('#lgQ');
    if (q) {
      q.addEventListener('input', function () {
        _st.q = q.value;
        var pos = q.selectionStart;
        pintar();
        var q2 = document.querySelector('#lgQ');
        if (q2) { q2.focus(); try { q2.setSelectionRange(pos, pos); } catch (e) {} }
      });
    }
    c.querySelectorAll('input[name="lgM"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var ok = c.querySelector('#lgOk');
        if (ok) ok.disabled = false;
      });
    });
    var x = c.querySelector('#lgX'), cn = c.querySelector('#lgCancel');
    if (x) x.addEventListener('click', cerrar);
    if (cn) cn.addEventListener('click', cerrar);

    var ok = c.querySelector('#lgOk');
    if (ok) ok.addEventListener('click', ligar);
  }

  function ligar() {
    var c = caja();
    var sel = c.querySelector('input[name="lgM"]:checked');
    if (!sel) return;
    var todos = (G.MachoteApp && G.MachoteApp.todos) ? G.MachoteApp.todos() : [];
    var m = todos.filter(function (x) { return x.id === sel.value; })[0];
    var uuid = uuidDe(m);
    if (!uuid) { G.alert('Esa cotización todavía no ha subido al servidor.'); return; }

    var principal = !!(c.querySelector('#lgPri') || {}).checked;
    var q = 'Vas a ligar ' + folioDe(m) + ' a ' + (_st.soName || 'la orden') + '.' +
      (principal ? '\n\nY va a ser la que MANDA para la Confirmación.' : '') +
      '\n\n¿Seguir?';
    if (!G.confirm(q)) return;

    var A = G.MachoteAlmacen;
    if (!A || !A.ligarOrden) { G.alert('No está cargada la pieza que habla con el servidor.'); return; }
    var b = c.querySelector('#lgOk');
    if (b) { b.disabled = true; b.textContent = 'Ligando…'; }

    A.ligarOrden(_st.soId, _st.soName, uuid, principal).then(function (r) {
      if (r && r.ok) {
        cerrar();
        if (_st.alTerminar) _st.alTerminar(r);
      } else {
        if (b) { b.disabled = false; b.textContent = 'Ligar'; }
        G.alert((r && r.mensaje) || 'No se pudo ligar. Nada cambió.');
      }
    });
  }

  function cerrar() {
    var c = document.getElementById('lgVelo');
    if (c) c.classList.remove('abierto');
  }

  function abrir(soId, alTerminar, soName) {
    _st.soId = soId; _st.soName = soName || null;
    _st.alTerminar = alTerminar || null; _st.q = '';
    pintar();
  }

  G.OrdenLigar = { abrir: abrir, cerrar: cerrar, _candidatas: candidatas };
})(window);
