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
 * Rutas:  #/  lista · #/m/:id  el libro · #/rev/:id  revisión
 *         #/orden/:id  cierre de orden · #/ap/:id  aprobación
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
  const VERSION = 'V1.14';
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const clon = (x) => JSON.parse(JSON.stringify(x));

  const A = G.MachoteAlmacen;

  /* Lo guardado manda sobre los datos de ejemplo. Si el almacen esta vacio o
   * corrupto se arranca con la demo, que es lo que espera quien abre la pagina
   * por primera vez. */
  const _guardado = A ? A.leer() : null;
  const ST = {
    verVacios: false,
    machotes: _guardado ? _guardado.machotes : clon(D.MACHOTES),
    ordenes:  clon(D.ORDENES),
    handoff: _guardado ? (_guardado.handoff || {}) : {},
    confirmadas: {},
    hoja: 'desglose', simMargen: null,
    busca: '', filtro: 'todos',
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
    const T = { limpio: 'guardado', sucio: 'sin guardar', guardando: 'guardando…',
                guardado: 'guardado', 'sin-almacen': 'sin guardar' };
    el.className = 'pulso p-' + ST.pulso;
    tx.textContent = T[ST.pulso] || '';
    el.title = ST.pulso === 'sin-almacen'
      ? 'Este navegador no deja guardar (modo privado o datos del sitio bloqueados). Lo que captures se pierde al salir.'
      : 'Se guarda solo, en este navegador. Todavia no viaja a ningun servidor.';
  }

  /** Guarda ya, sin esperar el retardo. Devuelve si de verdad quedo. */
  function guardarYa() {
    if (!A || !A.disponible()) { ST.pulso = 'sin-almacen'; pintarPulso(); return false; }
    if (_reloj) { clearTimeout(_reloj); _reloj = null; }
    ST.pulso = 'guardando'; pintarPulso();
    const ok = A.escribir({ machotes: ST.machotes, handoff: ST.handoff });
    ST.pulso = ok ? 'guardado' : 'sin-almacen';
    pintarPulso();
    return ok;
  }

  /** Marca sucio y programa el guardado. Es lo que llama toda edicion. */
  function tocado() {
    if (!A || !A.disponible()) { ST.pulso = 'sin-almacen'; pintarPulso(); return; }
    ST.pulso = 'sucio'; pintarPulso();
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
  const borrable = (m) => !((D.ESTADOS[m && m.estado] || {}).sin_borrar);

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

  const mach  = (id) => ST.machotes.find(m => m.id === id);
  const orden = (id) => ST.ordenes.find(o => o.id === id);
  const hoff  = (id) => ST.handoff[id] || (ST.handoff[id] = { entregables: {}, notas: '' });

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
    pintarPulso();
    pintarUsuario();
    const p = (location.hash || '#/').replace(/^#\//, '').split('/');
    if (p[0] === '')      return vHome();
    if (p[0] === 'nuevo') return vNuevo();
    if (p[0] === 'm')     return vMachote(p[1]);
    if (p[0] === 'rev')   return vRevision(p[1]);
    if (p[0] === 'orden') return vOrden(p[1]);
    if (p[0] === 'ap')    return vAprobar(p[1]);
    location.hash = '#/';
  }
  function top(t, s, b, back, sinVersion) {
    $('#tbT').textContent = t;
    $('#tbS').textContent = sinVersion ? s : s + ' · ' + VERSION;
    $('#tbB').textContent = b || 'DEMO';
    $('#btnBack').onclick = () => { if (back) location.hash = back; };
    $('#btnBack').style.visibility = back ? 'visible' : 'hidden';
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
    const t = [m.nombre, cli(m), m.cliente, m.so, m.id, m.cliente_id]
      .map(x => String(x || '').toLowerCase()).join(' | ');
    // Cada palabra por separado: "topo chico" y "chico topo" encuentran lo mismo.
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => t.indexOf(w) >= 0);
  }

  function vHome() {
    top('Machote y órdenes', 'Comercial · prototipo', 'DEMO', null, true);
    $('#fija').innerHTML = '';
    const est = D.ESTADOS;

    // Los contadores salen del universo COMPLETO, no de lo ya filtrado: un
    // contador que cambia al filtrar no sirve para saber cuántos hay.
    const cuenta = { todos: ST.machotes.length };
    D.FLUJO.forEach(k => { cuenta[k] = ST.machotes.filter(m => m.estado === k).length; });

    const visibles = ST.machotes.filter(m =>
      (ST.filtro === 'todos' || m.estado === ST.filtro) && coincide(m, ST.busca));

    const chip = (k, etiqueta) =>
      '<button class="fchip' + (ST.filtro === k ? ' on' : '') + '" data-filtro="' + k + '">' +
      esc(etiqueta) + ' <span class="n">' + (cuenta[k] || 0) + '</span></button>';

    const buscador =
      '<div class="buscador">' +
      '<input id="q" type="search" placeholder="Buscar por nombre, cliente u orden…" ' +
      'value="' + esc(ST.busca) + '" autocomplete="off" enterkeyhint="search">' +
      '<a class="btn nuevo" href="#/nuevo">+ Nuevo</a>' +
      '</div>' +
      '<div class="fchips">' + chip('todos', 'Todos') +
      D.FLUJO.map(k => chip(k, D.ESTADOS[k].label)).join('') + '</div>';

    const filas = visibles.map(m => {
      const rev = R.revisar(m), c = rev.calc;
      return '<div class="fila">' +
        '<a class="item" href="#/m/' + m.id + '">' +
        '<div class="grow"><strong>' + esc(m.nombre) + '</strong>' +
        '<div class="tiny">' + esc(cli(m)) + (m.so ? ' · ' + esc(m.so) : '') + ' · ' + m.id + '</div></div>' +
        '<div class="right"><span class="chip" style="background:' + est[m.estado].color + '">' + est[m.estado].label + '</span>' +
        '<div class="tiny mono n-' + (c.costoIncompleto ? 'warn' : nivelMargen(c.margen)) + '">' +
        mx(c.precio) + ' · ' + pc(c.margen) + (c.costoIncompleto ? '*' : '') + '</div>' +
        '<div class="tiny">' + (rev.duras.length ? '⛔ ' + rev.duras.length + ' duras' : '✓ sin duras') + '</div></div></a>' +
        (borrable(m)
          ? '<button class="ico peligro borrar" data-borrar="' + m.id + '" title="Eliminar machote">×</button>'
          : '<span class="ico candado" title="Enviado a Odoo: no se borra, sólo cambia de estado">🔒</span>') +
        '</div>';
    }).join('');

    const ords = ST.ordenes.map(o =>
      '<a class="item" href="#/orden/' + o.id + '">' +
      '<div class="grow"><strong>' + esc(o.nombre) + '</strong>' +
      '<div class="tiny">' + esc(o.cliente) + ' · ' + esc(o.so) + '</div></div>' +
      '<div class="right"><div class="mono">' + mx(o.monto) + ' ' + esc(o.moneda) + '</div>' +
      '<div class="tiny">' + (ST.confirmadas[o.id] ? '✓ confirmada' : 'pendiente') + '</div></div></a>').join('');

    // Un "no hay nada" tiene que decir POR QUÉ no hay nada: si la lista sale
    // vacía por un filtro puesto hace un minuto y no lo dice, parece que se
    // perdieron los machotes.
    const vacio = ST.busca
      ? '<div class="vacio">Ningún machote coincide con «' + esc(ST.busca) + '»' +
        (ST.filtro !== 'todos' ? ' en ' + esc(est[ST.filtro].label).toLowerCase() : '') + '.</div>'
      : '<div class="vacio">No hay machotes en ' + esc(est[ST.filtro] ? est[ST.filtro].label.toLowerCase() : 'este estado') + '.</div>';

    $('#vista').innerHTML =
      '<div class="pad"><div class="aviso">La retícula reproduce el machote real de FTS, verificada en cinco cotizaciones de 2026. ' +
      'Los datos de las cotizaciones de abajo son demo.</div>' +
      '<h3>Estación 2.0 · armar la cotización</h3>' +
      buscador +
      (visibles.length ? filas : vacio) +
      '<h3 style="margin-top:22px">Estación 3.0 · confirmar la orden</h3>' + ords +
      '<div class="ver">versión <strong>' + VERSION + '</strong></div></div>';

    // Se repinta sólo la lista al teclear, no la vista: repintar entera mata
    // el foco del buscador a media palabra.
    const q = $('#q');
    if (q) q.oninput = () => { ST.busca = q.value; vHome(); $('#q').focus();
                               $('#q').setSelectionRange(ST.busca.length, ST.busca.length); };
    $$('[data-filtro]').forEach(b => b.onclick = () => { ST.filtro = b.dataset.filtro; vHome(); });

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
      guardarYa();
      vHome();
      toast('Machote eliminado.');
    });
  }

  /* ── Machote nuevo ─────────────────────────────────────────────────────
   * La orden es OPCIONAL a propósito: el machote casi siempre nace antes que
   * la orden. Lo que no se puede es ENVIARLO a Odoo sin ella (V1.07). */
  function vNuevo() {
    top('Nuevo machote', 'Comercial · prototipo', 'DEMO', '#/');
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
      const m = C.machoteNuevo({
        nombre: nombre,
        cliente: hit ? hit.nombre : txtCliente,
        cliente_id: hit ? hit.id : null,
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
    top(cli(m), m.id + (m.so ? ' · ' + m.so : ''), 'MACHOTE', '#/');

    const hojas = [{ id: 'desglose', label: 'DESGLOSE COTIZACIÓN' }]
      .concat(m.secciones.map(s => ({ id: s.id, label: s.nombre || 'SECCIÓN' })));
    if (!hojas.some(h => h.id === ST.hoja)) ST.hoja = 'desglose';

    $('#vista').innerHTML =
      '<div class="libro">' +
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
        m.secciones.push({ id: 's-' + Date.now(), nombre: 'SECCION ' + (m.secciones.length + 1), mo: [], partidas: [] });
        ST.hoja = m.secciones[m.secciones.length - 1].id; return vMachote(id);
      }
    };
    pintarHoja(m);
    barra(m, c);
  }

  /** El HTML de la hoja abierta. Separado del pintado para poder renderizar a
   *  memoria y comparar, sin tocar el DOM vivo. */
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
    const mg = c.margenes;

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

    const der = [
      ['Programador', 'margenes.programador', mg.programador],
      ['Mano de obra', 'margenes.mano_obra', mg.mano_obra],
      ['Materiales', 'margenes.materiales', mg.materiales],
      ['Servicios', 'margenes.servicios', mg.servicios]
    ].map(r => '<tr><td class="et">' + r[0] + '</td><td>' + celNum(r[1], r[2], 'w70') + '</td></tr>').join('') +
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
      '<div class="tiny nota">Horas extras = mano de obra × 2 = <strong>' + mg.extra + '</strong>. No se captura, igual que en el Excel.</div>' +
      '</div></div>';

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
                 esc(g.label) + '</td></tr>';
      roles.forEach(rol => {
        let i = s.mo.findIndex(l => l.rol === rol.id);
        if (i < 0) { s.mo.push({ rol: rol.id, qty: '', personas: 1, pu: rol.pu, moneda: m.moneda }); i = s.mo.length - 1; }
        const l = s.mo[i], cl = C.costoMo(l, m), p = 's:' + s.id + ':mo:' + i + ':';
        const vacia = !(Number(l.qty) > 0);
        // Verde = cantidad Y precio. Con sólo horas, el renglón está a medias y
        // no aporta un peso al total; pintarlo diría "listo" de algo que todavía
        // no suma.
        const cls = C.capturada(l) ? 'capturada' : (vacia ? 'enCero' : '');
        filasMo +=
          '<tr class="' + cls + '">' +
          '<td class="rotulo" data-l="Renglón">' + esc(rol.label) + '</td>' +
          '<td data-l="QTY (horas)">' + celNum(p + 'qty', l.qty, 'w60') + '</td>' +
          '<td class="ro solo-ancho" data-l="Unidad">Horas</td>' +
          '<td data-l="Personas">' + celNum(p + 'personas', l.personas, 'w60') + '</td>' +
          '<td data-l="Precio unitario">' + celNum(p + 'pu', l.pu, 'w80') + '</td>' +
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

    // COSTO MATERIALES Y SERVICIOS
    const filasMat = (s.partidas || []).map((l, j) => {
      const cl = C.costoPartida(l, m), p = 's:' + s.id + ':partidas:' + j + ':';
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
        '<td data-l="Precio unitario">' + celNum(p + 'pu', l.pu, 'w80') + '</td>' +
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

    return listaUnidades + cab + leyenda() + tablaMo + tablaMat;
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
      '</tbody></table></div></div>' +
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
      tocado();
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
      '<a class="btn" href="#/rev/' + m.id + '">Revisar</a></div>';
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
        aplicar();
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
        tocado();
        pintarHoja(m); barra(m, C.calcular(m));
      };
      if (!esSel) el.oninput = () => {
        aplicar(); tocado();
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
      m.estado = nuevo; tocado(); vMachote(m.id);
    };
    const vv = $('#verVacios');
    if (vv) vv.onchange = () => { ST.verVacios = vv.checked; pintarHoja(m); };
    $$('[data-esc]').forEach(b => b.onclick = () => {
      m.escenario = b.dataset.esc; tocado(); pintarHoja(m); barra(m, C.calcular(m));
    });
    $$('[data-add]').forEach(b => b.onclick = () => {
      const s = m.secciones.find(x => x.id === b.dataset.add); if (!s) return;
      s.partidas.push({ qty: 1, unidad: 'Pieza', tipo: 'Materiales', descripcion: '', modelo: '', marca: '',
                        pu: null, moneda: m.moneda, margen: null, link: '', comentario: '' });
      tocado(); pintarHoja(m); barra(m, C.calcular(m));
    });
    const seccionDe = (ref) => {
      const [sid, j] = ref.split('#');
      return { s: m.secciones.find(x => x.id === sid), j: parseInt(j, 10) };
    };
    const refrescar = () => { tocado(); pintarHoja(m); barra(m, C.calcular(m)); };

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
      m.secciones.splice(i, 1); ST.hoja = 'desglose'; tocado(); vMachote(m.id);
    });
    $$('[data-dupsec]').forEach(b => b.onclick = () => {
      const i = m.secciones.findIndex(x => x.id === b.dataset.dupsec); if (i < 0) return;
      const copia = JSON.parse(JSON.stringify(m.secciones[i]));
      copia.id = 's-' + Date.now();
      copia.nombre = (copia.nombre || 'SECCIÓN') + ' (copia)';
      m.secciones.splice(i + 1, 0, copia);
      ST.hoja = copia.id; tocado(); vMachote(m.id);
    });
    $$('[data-movsec]').forEach(b => b.onclick = () => {
      const [sid, d] = b.dataset.movsec.split('|');
      const i = m.secciones.findIndex(x => x.id === sid);
      const k = i + parseInt(d, 10);
      if (i < 0 || k < 0 || k >= m.secciones.length) return;
      // La ranura la da la POSICIÓN, no el nombre: mover una sección cambia a
      // qué renglón del RESUMEN va a caer.
      const t = m.secciones[i]; m.secciones[i] = m.secciones[k]; m.secciones[k] = t;
      tocado(); vMachote(m.id);
    });
  }

  /* ── Revisión ────────────────────────────────────────────────────────── */
  function vRevision(id) {
    const m = mach(id); if (!m) { location.hash = '#/'; return; }
    const rev = R.revisar(m), c = rev.calc;
    top('Revisión', m.id + ' · ' + m.nombre, 'REVISOR', '#/m/' + id);
    $('#fija').innerHTML = '<div class="fija"><div class="grow"><div class="tiny">' +
      (rev.puedeConfirmar ? '✓ Se puede mandar' : '⛔ ' + rev.duras.length + ' hallazgo(s) duro(s)') +
      '</div></div><a class="btn" href="#/m/' + id + '">Volver a la hoja</a></div>';

    const bloque = (t, arr, cls) => !arr.length ? '' :
      '<h3 class="' + cls + '">' + t + ' (' + arr.length + ')</h3>' + arr.map(h =>
        '<div class="wg ' + cls + '"><strong>' + esc(h.titulo) + '</strong>' +
        '<div class="tiny oc">' + esc(h.area) + '</div><div>' + esc(h.detalle) + '</div>' +
        (h.items.length ? '<ul class="tiny">' + h.items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>' : '') +
        '<div class="btnrow"><button class="btn" data-goto="' + esc((h.destino && h.destino.tab) || '') + '">Ir a arreglarlo</button></div>' +
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
      ST.hoja = (t === 'secc' && m.secciones[0]) ? m.secciones[0].id : 'desglose';
      location.hash = '#/m/' + id;
    });
  }

  /* ── Estación 3.0 ────────────────────────────────────────────────────── */
  const ENTREGABLES = [
    { id: 'alcance',   label: 'Alcance escrito y aceptado por el cliente' },
    { id: 'po',        label: 'Orden de compra o correo de autorización' },
    { id: 'contacto',  label: 'Contacto de sitio con teléfono' },
    { id: 'fechas',    label: 'Fecha de inicio y fin acordadas' },
    { id: 'accesos',   label: 'Requisitos de acceso y seguridad de la planta' },
    { id: 'facturaci', label: 'Datos de facturación confirmados' }
  ];

  function vOrden(id) {
    const o = orden(id); if (!o) { location.hash = '#/'; return; }
    const h = hoff(o.id);
    top('Confirmar orden', o.so + ' · ' + o.cliente, 'ORDEN', '#/');
    $('#vista').innerHTML = '<div class="pad"><h2>' + esc(o.nombre) + '</h2>' +
      '<div class="tiny">Confirmada el ' + esc(o.fecha_confirmacion) + ' · ' + mx(o.monto) + ' ' + esc(o.moneda) + '</div>' +
      (ST.confirmadas[o.id] ? '<div class="aviso ok">Handoff cerrado. Operaciones ya tiene lo que necesita.</div>' : '') +
      '<div class="wg"><h4>Qué tiene que quedar antes de soltarla a operaciones</h4>' +
      ENTREGABLES.map(e => '<label class="row"><input type="checkbox" data-ent="' + e.id + '"' +
        (h.entregables[e.id] ? ' checked' : '') + '><span class="grow">' + esc(e.label) + '</span></label>').join('') +
      '</div><div class="wg"><h4>Notas para operaciones</h4>' +
      '<textarea id="notas" rows="4" placeholder="Lo que no cabe en una casilla.">' + esc(h.notas) + '</textarea></div></div>';
    barraOrden(o, h);
    $$('[data-ent]').forEach(cb => cb.onchange = () => { h.entregables[cb.dataset.ent] = cb.checked; barraOrden(o, h); });
    $('#notas').oninput = (e) => { h.notas = e.target.value; };
  }

  function barraOrden(o, h) {
    const listo = ENTREGABLES.every(e => h.entregables[e.id]);
    const ya = !!ST.confirmadas[o.id];
    $('#fija').innerHTML = '<div class="fija"><div class="grow"><div class="tiny">' +
      (listo ? '✓ Completo' : ENTREGABLES.filter(e => !h.entregables[e.id]).length + ' pendiente(s)') + '</div></div>' +
      '<button class="btn" id="btnConf"' + (listo && !ya ? '' : ' disabled') + '>Cerrar handoff</button></div>';
    $('#btnConf').onclick = () => {
      ST.confirmadas[o.id] = { fecha: new Date().toISOString() };
      toast('Handoff cerrado'); vOrden(o.id);
    };
  }

  /* ── Aprobación ──────────────────────────────────────────────────────── */
  function vAprobar(id) {
    const m = mach(id); if (!m) { location.hash = '#/'; return; }
    const rev = R.revisar(m), c = rev.calc;
    top('Aprobación', m.id, 'DIRECCIÓN', '#/m/' + id);
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

  render();
  avisoPassword();

  /* El catálogo se pide UNA vez al arrancar, en segundo plano. La pantalla no
   * lo espera: se pinta con el nombre de respaldo y se repinta sola cuando
   * Odoo contesta. Sólo se repinta si de verdad hay algo que cambiar —un
   * machote con `cliente_id`—, para no parpadear de gratis. */
  if (G.Clientes && ST.machotes.some(m => m.cliente_id)) {
    G.Clientes.cargar().then(r => { if (r.ok) render(); });
  }
})(window);
