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
   * ⚠️ El esquema es de ESTE módulo. El repo tiene otros en uso —finanzas va
   * en `0.5.36` con cadena de build, planeación en `2.4.1`, el kiosko sólo con
   * build— y se decidió dejarlos como están. No propagar V1.xx a esos. */
  const VERSION = 'V1.04';
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const clon = (x) => JSON.parse(JSON.stringify(x));

  const ST = {
    verVacios: false,
    machotes: clon(D.MACHOTES),
    ordenes:  clon(D.ORDENES),
    handoff: {}, confirmadas: {},
    hoja: 'desglose', simMargen: null
  };

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
  const celNum = (path, val, cls, ph) =>
    '<input class="cel num ' + (cls || '') + '" type="number" step="any" data-cel="' + path + '" data-num' +
    ' value="' + esc(nn(val)) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '>';
  const celSel = (path, val, ops) =>
    '<select class="cel" data-cel="' + path + '">' +
    ops.map(o => '<option value="' + esc(o) + '"' + (o === val ? ' selected' : '') + '>' + esc(o || '—') + '</option>').join('') +
    '</select>';

  /** Escribe por ruta. `s:<sid>:mo:<i>:campo` · `s:<sid>:partidas:<i>:campo`
   *  `eq:<venta|ops|cli>:<i>:campo` · `nom:<sid>` · o campo anidado. */
  function setPath(m, path, val) {
    const p = path.split(':');
    if (p[0] === 'nom') { const s = m.secciones.find(x => x.id === p[1]); if (s) s.nombre = val; return; }
    if (p[0] === 's') {
      const s = m.secciones.find(x => x.id === p[1]); if (!s) return;
      const arr = p[2] === 'mo' ? s.mo : s.partidas;
      const l = arr[parseInt(p[3], 10)]; if (!l) return;
      l[p[4]] = val; return;
    }
    if (p[0] === 'eq') {
      const key = p[1] === 'venta' ? 'equipo_venta' : p[1] === 'ops' ? 'equipo_operaciones' : 'equipo_cliente';
      const it = (m[key] || [])[parseInt(p[2], 10)]; if (!it) return;
      it[p[3]] = val; return;
    }
    const parts = path.split('.');
    let o = m;
    for (let i = 0; i < parts.length - 1; i++) { if (!o[parts[i]]) o[parts[i]] = {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = val;
  }

  /* ── Ruteo ───────────────────────────────────────────────────────────── */
  function render() {
    const p = (location.hash || '#/').replace(/^#\//, '').split('/');
    if (p[0] === '')      return vHome();
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

  const nivelMargen = (mg) => mg === null ? 'warn'
    : mg < R.UMBRALES.margen_minimo_duro ? 'bad'
    : mg < R.UMBRALES.margen_minimo_blando ? 'warn' : 'ok';

  /* ── Lista ───────────────────────────────────────────────────────────── */
  function vHome() {
    top('Machote y órdenes', 'Comercial · prototipo', 'DEMO', null, true);
    $('#fija').innerHTML = '';
    const est = D.ESTADOS;

    const filas = ST.machotes.map(m => {
      const rev = R.revisar(m), c = rev.calc;
      return '<a class="item" href="#/m/' + m.id + '">' +
        '<div class="grow"><strong>' + esc(m.nombre) + '</strong>' +
        '<div class="tiny">' + esc(m.cliente) + (m.so ? ' · ' + esc(m.so) : '') + ' · ' + m.id + '</div></div>' +
        '<div class="right"><span class="chip" style="background:' + est[m.estado].color + '">' + est[m.estado].label + '</span>' +
        '<div class="tiny mono n-' + (c.costoIncompleto ? 'warn' : nivelMargen(c.margen)) + '">' +
        mx(c.precio) + ' · ' + pc(c.margen) + (c.costoIncompleto ? '*' : '') + '</div>' +
        '<div class="tiny">' + (rev.duras.length ? '⛔ ' + rev.duras.length + ' duras' : '✓ sin duras') + '</div></div></a>';
    }).join('');

    const ords = ST.ordenes.map(o =>
      '<a class="item" href="#/orden/' + o.id + '">' +
      '<div class="grow"><strong>' + esc(o.nombre) + '</strong>' +
      '<div class="tiny">' + esc(o.cliente) + ' · ' + esc(o.so) + '</div></div>' +
      '<div class="right"><div class="mono">' + mx(o.monto) + ' ' + esc(o.moneda) + '</div>' +
      '<div class="tiny">' + (ST.confirmadas[o.id] ? '✓ confirmada' : 'pendiente') + '</div></div></a>').join('');

    $('#vista').innerHTML =
      '<div class="pad"><div class="aviso">La retícula reproduce el machote real de FTS, verificada en cinco cotizaciones de 2026. ' +
      'Los datos de las cotizaciones de abajo son demo.</div>' +
      '<h3>Estación 2.0 · armar la cotización</h3>' + filas +
      '<h3 style="margin-top:22px">Estación 3.0 · confirmar la orden</h3>' + ords +
      '<div class="ver">versión <strong>' + VERSION + '</strong></div></div>';
  }

  /* ── El libro ────────────────────────────────────────────────────────── */
  function vMachote(id) {
    const m = mach(id); if (!m) { location.hash = '#/'; return; }
    // Al cambiar de cotización se vuelve al DESGLOSE: arrastrar la hoja
    // abierta de la anterior deja al analista en una sección que no pidió.
    if (ST.libroAbierto !== id) { ST.hoja = 'desglose'; ST.libroAbierto = id; }
    const c = C.calcular(m);
    top(m.cliente, m.id + (m.so ? ' · ' + m.so : ''), 'MACHOTE', '#/');

    const hojas = [{ id: 'desglose', label: 'DESGLOSE COTIZACIÓN' }]
      .concat(m.secciones.map(s => ({ id: s.id, label: s.nombre || 'SECCIÓN' })));
    if (!hojas.some(h => h.id === ST.hoja)) ST.hoja = 'desglose';

    $('#vista').innerHTML =
      '<div class="libro">' +
      '<div class="hojas" id="hojas">' + hojas.map(h =>
        '<button class="pestana' + (h.id === ST.hoja ? ' on' : '') + '" data-hoja="' + esc(h.id) + '">' +
        esc(h.label) + '</button>').join('') +
        (m.secciones.length < C.MAX_SECCIONES
          ? '<button class="pestana mas" data-nueva="1" title="Nueva sección">+</button>' : '') +
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

  function pintarHoja(m) {
    const c = C.calcular(m);
    const s = m.secciones.find(x => x.id === ST.hoja);
    $('#hoja').innerHTML = s ? hojaSeccion(m, s, c) : hojaDesglose(m, c);
    enlazar(m);
  }

  /* ── Hoja de sección ─────────────────────────────────────────────────── */
  function hojaSeccion(m, s, c) {
    const cs = c.secciones.find(x => x.id === s.id) || {};
    const mg = c.margenes;

    // Bloque de encabezado: las once filas de la izquierda y la tabla de
    // márgenes de la derecha, tal como están en la hoja.
    const izq = [
      ['Mano de obra', mx(cs.costoMo)],
      ['Materiales y servicio', mx(cs.costoMat)],
      ['Costos Sumados (Mat, Servicio, Mano de obra)', mx2(cs.costo)],
      ['', ''],
      ['Comisiones CLIENTE', mx(cs.venta ? c.escenario.comisionFts * (cs.venta / (c.venta || 1)) : 0)],
      ['Comisiones FTS', mx(cs.venta ? c.escenario.comisionCliente * (cs.venta / (c.venta || 1)) : 0)],
      ['Costos totales (Cuanto le cuesta a FTS?)', mx(cs.costo + (c.escenario.comisionFts + c.escenario.comisionCliente) * (cs.venta / (c.venta || 1)))],
      ['Precio de Venta FTS (Antes de comisiones)', mx(cs.venta)],
      ['Precio de Venta a cliente (Despues de comisiones)', mx2(cs.esc ? cs.esc.con_utilidad.precio : null)],
      ['Utilidad', mx2((cs.esc ? cs.esc.con_utilidad.precio : 0) - cs.costo)],
      ['% Utilidad Obtenido', pc(cs.margenObtenido)]
    ].map(r => '<tr><td class="et">' + esc(r[0]) + '</td><td class="vl mono">' + r[1] + '</td></tr>').join('');

    const der = [
      ['Programador', 'margenes.programador', mg.programador],
      ['Mano de obra', 'margenes.mano_obra', mg.mano_obra],
      ['Materiales', 'margenes.materiales', mg.materiales],
      ['Servicios', 'margenes.servicios', mg.servicios]
    ].map(r => '<tr><td class="et">' + r[0] + '</td><td>' + celNum(r[1], r[2], 'w70') + '</td></tr>').join('') +
      '<tr><td class="et">Comision FTS</td><td>' + celNum('comision_fts', m.comision_fts, 'w70') + '</td></tr>' +
      '<tr><td class="et">Comision CLIENTE</td><td>' + celNum('comision_cliente', m.comision_cliente, 'w70') + '</td></tr>';

    const cab =
      '<div class="cab">' +
      '<div class="blk"><table class="hoja2"><thead><tr><th>Costos desglosados</th><th></th></tr></thead>' +
      '<tbody>' + izq +
      '<tr><td class="et">Horas sección</td><td class="vl mono">' + Math.round(cs.horas || 0) + '</td></tr>' +
      '</tbody></table></div>' +
      '<div class="blk"><table class="hoja2"><thead><tr><th>Concepto</th><th>Margen de utilidad</th></tr></thead>' +
      '<tbody>' + der + '</tbody></table>' +
      '<div class="tiny nota">Horas extras = mano de obra × 2 = <strong>' + mg.extra + '</strong>. No se captura, igual que en el Excel.</div>' +
      '</div></div>' +
      '<div class="nomsec"><span class="et">NOMBRE DE SECCIÓN</span>' + cel('nom:' + s.id, s.nombre, 'nombre') +
      (m.secciones.length > 1 ? '<button class="btn del" data-delsec="' + s.id + '">Eliminar sección</button>' : '') + '</div>';

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
        filasMo +=
          '<tr' + (vacia ? ' class="enCero"' : '') + '>' +
          '<td class="rotulo" data-l="Renglón">' + esc(rol.label) + '</td>' +
          '<td data-l="QTY (horas)">' + celNum(p + 'qty', l.qty, 'w60') + '</td>' +
          '<td class="ro solo-ancho" data-l="Unidad">Horas</td>' +
          '<td data-l="Personas">' + celNum(p + 'personas', l.personas, 'w60') + '</td>' +
          '<td data-l="Precio unitario">' + celNum(p + 'pu', l.pu, 'w80') + '</td>' +
          '<td class="vl mono" data-l="Precio total">' + mx(cl.costo) + '</td>' +
          '<td data-l="Moneda">' + celSel(p + 'moneda', l.moneda, ['MXN', 'USD']) + '</td>' +
          '<td class="ro mono" data-l="Margen">' + cl.mult + '</td>' +
          '<td class="vl mono fuerte" data-l="Precio con utilidad">' + mx(cl.conUtilidad) + '</td></tr>';
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
      '<td class="vl mono" data-l="Costo mano de obra">' + mx(cs.costoMo) +
      '</td><td colspan="2"></td><td class="vl mono fuerte" data-l="Con utilidad">' + mx(cs.ventaMo) + '</td></tr>' +
      '</tbody></table></div>';

    // COSTO MATERIALES Y SERVICIOS
    const filasMat = (s.partidas || []).map((l, j) => {
      const cl = C.costoPartida(l, m), p = 's:' + s.id + ':partidas:' + j + ':';
      return '<tr>' +
        '<td data-l="Descripción">' + cel(p + 'descripcion', l.descripcion, 'desc') + '</td>' +
        '<td data-l="QTY">' + celNum(p + 'qty', l.qty, 'w60') + '</td>' +
        '<td data-l="Unidad">' + celSel(p + 'unidad', l.unidad, D.UNIDADES) + '</td>' +
        '<td data-l="Tipo">' + celSel(p + 'tipo', l.tipo, [''].concat(C.TIPOS)) + '</td>' +
        '<td data-l="Modelo">' + cel(p + 'modelo', l.modelo, 'w110') + '</td>' +
        '<td data-l="Marca">' + cel(p + 'marca', l.marca, 'w90') + '</td>' +
        '<td data-l="Precio unitario">' + celNum(p + 'pu', l.pu, 'w90') + '</td>' +
        '<td data-l="Moneda">' + celSel(p + 'moneda', l.moneda, ['MXN', 'USD']) + '</td>' +
        '<td class="vl mono' + (cl.sinPrecio ? ' n-bad' : '') + '" data-l="Precio total">' + (cl.sinPrecio ? 'sin precio' : mx(cl.costo)) + '</td>' +
        '<td data-l="Margen">' + celNum(p + 'margen', l.margen, 'w60' + (cl.pisado ? ' pisado' : ''), String(cl.porTipo || '')) + '</td>' +
        '<td class="vl mono fuerte" data-l="Precio con utilidad">' + mx(cl.conUtilidad) + '</td>' +
        '<td data-l="Link">' + cel(p + 'link', l.link, 'w130', 'https://…') + '</td>' +
        '<td data-l="Comentario">' + cel(p + 'comentario', l.comentario, 'w130') + '</td>' +
        '<td class="acc"><button class="x" data-del="' + s.id + '#' + j + '" title="Eliminar partida">× eliminar</button></td></tr>';
    }).join('');

    const tablaMat =
      '<div class="secc-tit">COSTO MATERIALES Y SERVICIOS</div>' +
      '<div class="scroll"><table class="rejilla tarjetas">' +
      '<thead><tr><th>DESCRIPCIÓN</th><th>QTY</th><th>UNIDAD</th><th>Tipo</th><th>MODELO</th><th>MARCA</th>' +
      '<th>PRECIO UNITARIO</th><th>MONEDA</th><th>PRECIO TOTAL</th><th>Margen utilidad</th>' +
      '<th>PRECIO CON UTILIDAD</th><th>Link</th><th>Comentario</th><th></th></tr></thead><tbody>' +
      (filasMat || '<tr><td colspan="14" class="vacio2">Sin partidas.</td></tr>') +
      '<tr class="total"><td class="rotulo" data-l="">TOTAL</td><td colspan="7"></td>' +
      '<td class="vl mono" data-l="Costo materiales">' + mx(cs.costoMat) +
      '</td><td></td><td class="vl mono fuerte" data-l="Con utilidad">' + mx(cs.ventaMat) + '</td><td colspan="3"></td></tr>' +
      '</tbody></table></div>' +
      '<div class="btnrow"><button class="btn" data-add="' + s.id + '">+ partida</button>' +
      (cs.pisados ? '<span class="tiny n-warn">' + cs.pisados + ' margen(es) pisado(s) a mano en esta sección</span>' : '') +
      '</div>';

    return cab + tablaMo + tablaMat;
  }

  /* ── Hoja DESGLOSE COTIZACIÓN ────────────────────────────────────────── */
  function hojaDesglose(m, c) {
    const e = c.escenarios;
    const escOps = C.ESCENARIOS.map(x =>
      '<button class="escbtn' + (m.escenario === x.id ? ' on' : '') + '" data-esc="' + x.id + '">' +
      x.label.toUpperCase() + '</button>').join('');

    const fila = (et, p, cCosto, cUtil, cMd) =>
      '<tr><td class="et">' + et + '</td><td class="mono pctcol">' + (p || '') + '</td>' +
      '<td class="vl mono">' + cCosto + '</td><td class="vl mono">' + cUtil + '</td>' +
      '<td class="vl mono">' + cMd + '</td></tr>';

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
      '<td class="vl mono">' + mx(e.costo.precio) + '</td><td class="vl mono">' + mx(e.con_utilidad.precio) + '</td>' +
      '<td class="vl mono">' + mx(e.margen_deseado.precio) + '</td></tr>' +
      fila('Margen', '', pc(0), pc(e.con_utilidad.margen), pc(e.margen_deseado.margen)) +
      fila('Utilidad esperada Absoluta', '', mx(0), mx(e.con_utilidad.utilidad), mx(e.margen_deseado.utilidad)) +
      '</tbody></table></div>';

    const encabezado =
      '<div class="desg-top">' +
      '<div class="blk"><div class="et2">ELIGE UN ESCENARIO PARA TU COTIZACIÓN</div>' +
      '<div class="escs">' + escOps + '</div></div>' +
      '<div class="blk"><table class="hoja2"><tbody>' +
      '<tr><td class="et">MARGEN DESEADO</td><td>' + celNum('margen_deseado', m.margen_deseado, 'w80') + '</td></tr>' +
      '<tr><td class="et">HORAS PROYECTO</td><td class="vl mono">' + Math.round(c.horas) + '</td></tr>' +
      '<tr><td class="et">Factor_req</td><td class="vl mono">' + (c.factorReq ? c.factorReq.toFixed(9) : '—') + '</td></tr>' +
      '<tr><td class="et">Moneda</td><td>' + celSel('moneda', m.moneda, ['MXN', 'USD']) + '</td></tr>' +
      '<tr><td class="et">Tipo de cambio</td><td>' + celNum('tc', m.tc, 'w80') + '</td></tr>' +
      '</tbody></table></div></div>';

    // RESUMEN por sección: diez ranuras fijas, tres grupos de columnas.
    let fSec = '';
    for (let i = 0; i < C.MAX_SECCIONES; i++) {
      const s = c.secciones[i];
      const v = s ? s.esc : null;
      fSec += '<tr' + (s ? '' : ' class="vacia"') + '><td class="mono">' + (i + 1) + '</td>' +
        '<td class="et">' + esc(s ? s.nombre : 'SECCION ' + (i + 1)) + '</td>' +
        '<td class="vl mono">' + mx(s ? v.costo.mo : 0) + '</td>' +
        '<td class="vl mono">' + mx(s ? v.costo.mat : 0) + '</td>' +
        '<td class="vl mono">' + mx(s ? v.costo.precio : 0) + '</td>' +
        '<td class="vl mono">' + mx(s ? v.con_utilidad.mo : 0) + '</td>' +
        '<td class="vl mono">' + mx(s ? v.con_utilidad.mat : 0) + '</td>' +
        '<td class="vl mono">' + mx(s ? v.con_utilidad.precio : 0) + '</td>' +
        '<td class="vl mono">' + mx(s ? v.margen_deseado.mo : 0) + '</td>' +
        '<td class="vl mono">' + mx(s ? v.margen_deseado.mat : 0) + '</td>' +
        '<td class="vl mono">' + mx(s ? v.margen_deseado.precio : 0) + '</td>' +
        '<td class="vl mono">' + (s ? Math.round(s.horas) : 0) + '</td></tr>';
    }
    const sobra = c.secciones.length > C.MAX_SECCIONES;

    const porSeccion =
      '<div class="secc-tit">RESUMEN POR SECCIÓN</div>' +
      '<div class="scroll"><table class="rejilla ancha">' +
      '<thead><tr><th colspan="2"></th><th colspan="3">COSTO</th><th colspan="3">CON UTILIDAD</th>' +
      '<th colspan="3">MARGEN DESEADO</th><th></th></tr>' +
      '<tr><th>SECCIÓN</th><th>SECCION DE COTIZACION</th>' +
      '<th>MANO DE OBRA</th><th>MATERIALES Y SERV</th><th>COSTOS TOTALES</th>' +
      '<th>MANO DE OBRA</th><th>MATERIALES Y SERV</th><th>PRECIO DE VENTA</th>' +
      '<th>MANO DE OBRA</th><th>MATERIALES Y SERV</th><th>PRECIO DE VENTA</th><th>HORAS</th></tr></thead>' +
      '<tbody>' + fSec +
      '<tr class="total"><td></td><td class="et">SUMA</td>' +
      '<td class="vl mono">' + mx(c.costoMo) + '</td><td class="vl mono">' + mx(c.costoMat) + '</td>' +
      '<td class="vl mono">' + mx(c.costo) + '</td>' +
      '<td class="vl mono">' + mx(c.ventaMo) + '</td><td class="vl mono">' + mx(c.ventaMat) + '</td>' +
      '<td class="vl mono">' + mx(e.con_utilidad.precio) + '</td>' +
      '<td class="vl mono">' + mx(e.margen_deseado.precio === null ? null : e.margen_deseado.precio * (c.costo ? c.costoMo / c.costo : 0)) + '</td>' +
      '<td class="vl mono">' + mx(e.margen_deseado.precio === null ? null : e.margen_deseado.precio * (c.costo ? c.costoMat / c.costo : 0)) + '</td>' +
      '<td class="vl mono">' + mx(e.margen_deseado.precio) + '</td>' +
      '<td class="vl mono">' + Math.round(c.horas) + '</td></tr>' +
      '</tbody></table></div>' +
      (sobra ? '<div class="aviso bad">Hay ' + c.secciones.length + ' secciones y la tabla del machote sólo tiene ' +
        C.MAX_SECCIONES + ' ranuras. Las de más no llegarían al precio.</div>' : '');

    // BUDGET ODOO
    const b = c.budget;
    const budget =
      '<div class="secc-tit">BUDGET ODOO</div>' +
      '<div class="scroll"><table class="rejilla estrecha"><tbody>' +
      '<tr><td class="et">INGRESO</td><td class="vl mono">' + mx(b.ingreso) + '</td></tr>' +
      '<tr><td class="et">MANO DE OBRA</td><td class="vl mono">' + mx(b.manoObra) + '</td></tr>' +
      '<tr><td class="et">MATERIALES Y SERVICIOS</td><td class="vl mono">' + mx(b.materiales) + '</td></tr>' +
      b.comisiones.map(l => '<tr><td class="et">' + esc(l.nombre) + '</td><td class="vl mono">' + mx(l.monto) + '</td></tr>').join('') +
      '<tr class="total"><td class="et">TOTAL (por defecto lo lanza odoo)</td><td class="vl mono">' + mx(b.total) + '</td></tr>' +
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
          '<td>' + celNum('eq:' + rep + ':' + i + ':pct', it.pct, 'w70') + '</td>' +
          '<td class="vl mono">' + mx(bolsa * Number(it.pct)) + '</td></tr>').join('') +
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
    $$('[data-cel]').forEach(el => {
      const esSel = el.tagName === 'SELECT';
      const aplicar = () => {
        let v = el.value;
        if (el.hasAttribute('data-num')) v = (v === '' ? null : (parseFloat(v) || 0));
        setPath(m, el.dataset.cel, v);
      };
      // Se recalcula al salir del campo, no en cada tecla: repintar la hoja
      // mientras se escribe mata el foco a media cifra.
      el.onchange = () => { aplicar(); pintarHoja(m); barra(m, C.calcular(m)); };
      if (!esSel) el.oninput = () => { aplicar(); barra(m, C.calcular(m)); };
    });
    const vv = $('#verVacios');
    if (vv) vv.onchange = () => { ST.verVacios = vv.checked; pintarHoja(m); };
    $$('[data-esc]').forEach(b => b.onclick = () => {
      m.escenario = b.dataset.esc; pintarHoja(m); barra(m, C.calcular(m));
    });
    $$('[data-add]').forEach(b => b.onclick = () => {
      const s = m.secciones.find(x => x.id === b.dataset.add); if (!s) return;
      s.partidas.push({ qty: 1, unidad: 'Pieza', tipo: 'Materiales', descripcion: '', modelo: '', marca: '',
                        pu: null, moneda: m.moneda, margen: null, link: '', comentario: '' });
      pintarHoja(m); barra(m, C.calcular(m));
    });
    $$('[data-del]').forEach(b => b.onclick = () => {
      const [sid, j] = b.dataset.del.split('#');
      const s = m.secciones.find(x => x.id === sid); if (!s) return;
      s.partidas.splice(parseInt(j, 10), 1); pintarHoja(m); barra(m, C.calcular(m));
    });
    $$('[data-delsec]').forEach(b => b.onclick = () => {
      const i = m.secciones.findIndex(x => x.id === b.dataset.delsec);
      if (i < 0 || m.secciones.length < 2) return;
      m.secciones.splice(i, 1); ST.hoja = 'desglose'; vMachote(m.id);
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
      '<div class="tot"><span class="lb">Costo</span><span class="vl mono">' + mx(c.costo) + '</span></div>' +
      '<div class="tot"><span class="lb">Comisiones</span><span class="vl mono">' + mx(c.escenario.comisionFts + c.escenario.comisionCliente) + '</span></div>' +
      '<div class="tot"><span class="lb">Utilidad</span><span class="vl mono">' + mx(c.utilidad) + '</span></div>' +
      '<div class="tot"><span class="lb">BUDGET ODOO cuadra</span><span class="vl mono n-' + (c.budget.cuadra ? 'ok' : 'bad') + '">' +
      (c.budget.cuadra ? 'sí' : 'no') + '</span></div></div>' +
      (rev.duras.length ? '<div class="aviso bad">Tiene ' + rev.duras.length + ' hallazgo(s) duro(s). No debería llegar aquí.</div>'
                        : '<div class="aviso ok">Sin hallazgos duros.</div>') + '</div>';
  }

  render();
})(window);
