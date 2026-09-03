/* ═══ Machote · vistas y ruteo ═══
 *
 * Reescrito el 2026-09-03 sobre la estructura REAL del machote.
 * Ninguna vista calcula: todo número sale de MachoteCalc.
 *
 * Rutas:  #/            lista
 *         #/m/:id       estación 2.0 — armar el machote
 *         #/rev/:id     revisador
 *         #/orden/:id   estación 3.0 — confirmar la orden
 *         #/ap/:id      aprobación
 */
(function (G) {
  'use strict';

  const C = G.MachoteCalc, R = G.REGLAS, D = G.DEMO;
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const clon = (x) => JSON.parse(JSON.stringify(x));

  const ST = {
    machotes: clon(D.MACHOTES),
    ordenes:  clon(D.ORDENES),
    handoff: {}, confirmadas: {}, aprobaciones: {},
    tab: 'diag', abiertos: {}, simMargen: null
  };

  const esc = (s) => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const mx  = (x, mon) => (x === null || x === undefined || !isFinite(x))
    ? '—' : '$' + Math.round(x).toLocaleString('es-MX') + (mon ? ' ' + mon : '');
  const pc  = (x) => (x === null || x === undefined || !isFinite(x)) ? '—' : (x * 100).toFixed(1).replace(/\.0$/, '') + '%';
  const nn  = (x) => (x === null || x === undefined || x === '') ? '' : x;

  const mach  = (id) => ST.machotes.find(m => m.id === id);
  const orden = (id) => ST.ordenes.find(o => o.id === id);

  /** Estado de handoff creado al vuelo: si se crea sólo al pintar, todo lo que
   *  se escriba antes del primer repintado se pierde en silencio. */
  const hoff = (id) => ST.handoff[id] || (ST.handoff[id] = { entregables: {}, notas: '' });

  function toast(txt) {
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = txt; document.body.appendChild(d);
    setTimeout(() => d.classList.add('on'), 10);
    setTimeout(() => { d.classList.remove('on'); setTimeout(() => d.remove(), 300); }, 2200);
  }

  /** Escribe en el estado por ruta. Formas admitidas:
   *   "margenes.materiales"          campo simple anidado
   *   "s:<sid>:partidas:<i>:pu"      renglón de sección por índice
   *   "eq:venta:<i>:pct"             integrante de un reparto */
  function setPath(m, path, val) {
    const p = path.split(':');
    if (p[0] === 's') {
      const s = m.secciones.find(x => x.id === p[1]); if (!s) return;
      const arr = p[2] === 'partidas' ? s.partidas : s.mo;
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

  /* ── Ruteo ──────────────────────────────────────────────────────────── */
  function render() {
    const h = location.hash || '#/';
    const p = h.replace(/^#\//, '').split('/');
    if (p[0] === '')      return vHome();
    if (p[0] === 'm')     return vMachote(p[1]);
    if (p[0] === 'rev')   return vRevision(p[1]);
    if (p[0] === 'orden') return vOrden(p[1]);
    if (p[0] === 'ap')    return vAprobar(p[1]);
    location.hash = '#/';
  }
  function top(t, s, b, back) {
    $('#tbT').textContent = t; $('#tbS').textContent = s; $('#tbB').textContent = b || 'DEMO';
    $('#btnBack').onclick = () => { if (back) location.hash = back; };
    $('#btnBack').style.visibility = back ? 'visible' : 'hidden';
  }
  window.addEventListener('hashchange', render);

  /* ── Lista ──────────────────────────────────────────────────────────── */
  function vHome() {
    top('Machote y órdenes', 'Comercial · prototipo', 'DEMO', null);
    $('#fija').innerHTML = '';
    const est = D.ESTADOS;

    const filas = ST.machotes.map(m => {
      const rev = R.revisar(m), c = rev.calc;
      const nivel = c.costoIncompleto ? 'warn' : nivelMargen(c.margen);
      return '<a class="item" href="#/m/' + m.id + '">' +
        '<div class="grow"><strong>' + esc(m.nombre) + '</strong>' +
        '<div class="tiny">' + esc(m.cliente) + (m.so ? ' · ' + esc(m.so) : '') + ' · ' + m.id + '</div></div>' +
        '<div class="right"><span class="chip" style="background:' + est[m.estado].color + '">' + est[m.estado].label + '</span>' +
        '<div class="tiny mono n-' + nivel + '">' + mx(c.precio, m.moneda) + ' · ' + pc(c.margen) +
        (c.costoIncompleto ? '*' : '') + '</div>' +
        '<div class="tiny">' + (rev.duras.length ? '⛔ ' + rev.duras.length + ' duras' : '✓ sin duras') + '</div></div></a>';
    }).join('');

    const ords = ST.ordenes.map(o => {
      const listo = !!ST.confirmadas[o.id];
      return '<a class="item" href="#/orden/' + o.id + '">' +
        '<div class="grow"><strong>' + esc(o.nombre) + '</strong>' +
        '<div class="tiny">' + esc(o.cliente) + ' · ' + esc(o.so) + '</div></div>' +
        '<div class="right"><div class="mono">' + mx(o.monto, o.moneda) + '</div>' +
        '<div class="tiny">' + (listo ? '✓ confirmada' : 'pendiente de confirmar') + '</div></div></a>';
    }).join('');

    $('#vista').innerHTML =
      '<div class="pad"><div class="aviso">Prototipo con datos demo. El motor de precio reproduce el machote real ' +
      '(<code>docs/comercial/MACHOTE-ESTRUCTURA-REAL.md</code>); los datos de abajo son inventados.</div>' +
      '<h3>Estación 2.0 · armar el machote</h3>' + filas +
      '<h3 style="margin-top:22px">Estación 3.0 · confirmar la orden</h3>' + ords + '</div>';
  }

  const nivelMargen = (mg) => mg === null ? 'warn'
    : mg < R.UMBRALES.margen_minimo_duro ? 'bad'
    : mg < R.UMBRALES.margen_minimo_blando ? 'warn' : 'ok';

  /* ── Estación 2.0 ───────────────────────────────────────────────────── */
  const TABS = [
    { id: 'diag', label: 'Diagnóstico' },
    { id: 'secc', label: 'Secciones' },
    { id: 'gen',  label: 'Márgenes' },
    { id: 'com',  label: 'Comisiones' },
    { id: 'sim',  label: 'Precio' }
  ];

  function vMachote(id) {
    const m = mach(id); if (!m) { location.hash = '#/'; return; }
    top(m.cliente, m.id + ' · ' + D.ESTADOS[m.estado].label, 'MACHOTE', '#/');
    $('#vista').innerHTML =
      '<div class="pad"><h2>' + esc(m.nombre) + '</h2>' +
      '<div class="pasos" id="tabs">' + TABS.map(t =>
        '<button class="paso' + (t.id === ST.tab ? ' on' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>').join('') +
      '</div><div id="pane"></div></div>';
    $('#tabs').onclick = (e) => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      ST.tab = b.dataset.tab; vMachote(id);
    };
    pintarPane(m); barraFija(m); enlazar(m);
  }

  function pintarPane(m) {
    const c = C.calcular(m);
    $('#pane').innerHTML =
      ST.tab === 'diag' ? paneDiag(m) :
      ST.tab === 'secc' ? paneSecc(m, c) :
      ST.tab === 'gen'  ? paneGen(m, c) :
      ST.tab === 'com'  ? paneCom(m, c) : paneSim(m, c);
    enlazar(m);
  }

  function paneDiag(m) {
    const t = D.TIPOS_PROYECTO.find(x => x.id === (m.diagnostico || {}).tipo);
    const r = (m.diagnostico || {}).respuestas || {};
    return '<div class="f"><label>Tipo de proyecto</label><select data-bind="diagnostico.tipo">' +
      '<option value="">— elige —</option>' +
      D.TIPOS_PROYECTO.map(x => '<option value="' + x.id + '"' + (x.id === (m.diagnostico || {}).tipo ? ' selected' : '') + '>' +
        x.icono + ' ' + x.label + '</option>').join('') + '</select></div>' +
      '<div class="aviso tiny">Este cuestionario es un supuesto: el machote de Excel no lo tiene. Cada pregunta apunta a un costo que suele descubrirse en obra.</div>' +
      (!t ? '<div class="vacio">Elige el tipo para ver las preguntas.</div>' :
        t.preguntas.map(q =>
          '<div class="f"><label>' + (q.critica ? '<span class="chip bad">crítica</span> ' : '') + esc(q.texto) + '</label>' +
          '<input data-bind="diagnostico.respuestas.' + q.id + '" value="' + esc(r[q.id] || '') + '" placeholder="' + esc(q.implica) + '">' +
          '<div class="tiny">Si no se responde: ' + esc(q.riesgo_si_no) + '</div></div>').join(''));
  }

  function paneSecc(m, c) {
    return m.secciones.map((s) => {
      const cs = c.secciones.find(x => x.id === s.id) || {};
      return '<div class="wg"><div class="row"><div class="grow">' +
        '<input data-bind="s-nombre:' + s.id + '" value="' + esc(s.nombre) + '" style="font-weight:600">' +
        '<div class="tiny mono">costo ' + mx(cs.costo, m.moneda) + ' · venta ' + mx(cs.venta, m.moneda) +
        ' · ' + Math.round(cs.horas || 0) + ' h-hombre</div></div></div>' +

        '<div class="tiny" style="margin-top:10px"><strong>Mano de obra</strong> · tarifa × personas × horas</div>' +
        C.GRUPOS.map(g => {
          const rs = C.ROLES.filter(r => r.grupo === g.id);
          return '<div class="tiny oc">' + g.label + '</div>' + rs.map(rol => {
            const i = s.mo.findIndex(l => l.rol === rol.id);
            const l = i >= 0 ? s.mo[i] : null;
            const idx = i >= 0 ? i : null;
            return lineaMo(rol, l, idx, s, m);
          }).join('');
        }).join('') +

        '<div class="tiny" style="margin-top:14px"><strong>Materiales y servicios</strong></div>' +
        (s.partidas.length ? s.partidas.map((l, j) => lineaPartida(l, s, m, j)).join('')
                           : '<div class="tiny">Sin partidas.</div>') +
        '<div class="btnrow"><button class="btn" data-add-part="' + s.id + '">+ partida</button></div>' +
        '</div>';
    }).join('') +
    '<div class="btnrow"><button class="btn" data-add-sec="1"' +
      (m.secciones.length >= C.MAX_SECCIONES ? ' disabled' : '') + '>+ sección (' +
      m.secciones.length + '/' + C.MAX_SECCIONES + ')</button></div>';
  }

  function lineaMo(rol, l, idx, s, m) {
    const mg = C.margenes(m);
    const mult = mg[rol.mult];
    const cur = l ? C.costoMo(l, m) : null;
    const base = 's:' + s.id + ':mo:' + (idx === null ? 'NEW' : idx) + ':';
    const dis = idx === null ? ' data-mo-new="' + s.id + '|' + rol.id + '"' : '';
    return '<div class="row lin-mo"' + dis + '>' +
      '<div class="grow tiny">' + esc(rol.label) + ' <span class="mono oc">×' + mult + '</span></div>' +
      '<input class="num" type="number" step="any" placeholder="h" title="Horas" ' +
        (idx === null ? 'data-mo-init="' + s.id + '|' + rol.id + '|qty"' : 'data-num data-bind="' + base + 'qty"') +
        ' value="' + (l ? nn(l.qty) : '') + '">' +
      '<input class="num" type="number" step="any" placeholder="pers" title="Personas" ' +
        (idx === null ? 'data-mo-init="' + s.id + '|' + rol.id + '|personas"' : 'data-num data-bind="' + base + 'personas"') +
        ' value="' + (l ? nn(l.personas) : '') + '">' +
      '<input class="num" type="number" step="any" placeholder="tarifa" title="Precio unitario" ' +
        (idx === null ? 'data-mo-init="' + s.id + '|' + rol.id + '|pu"' : 'data-num-null data-bind="' + base + 'pu"') +
        ' value="' + (l ? nn(l.pu) : '') + '">' +
      '<div class="lin-tot mono tiny">' + (cur && cur.costo ? mx(cur.conUtilidad) : '—') + '</div></div>';
  }

  function lineaPartida(l, s, m, j) {
    const cur = C.costoPartida(l, m);
    const p = 's:' + s.id + ':partidas:' + j + ':';
    const ab = ST.abiertos[s.id + '#' + j];
    const cab = '<button class="lin" data-open="' + s.id + '#' + j + '">' +
      '<span class="chev">' + (ab ? '▾' : '▸') + '</span>' +
      '<span class="grow"><strong>' + esc(l.descripcion || '(sin descripción)') + '</strong>' +
      '<span class="tiny"> ' + (l.qty || 0) + ' ' + esc(l.unidad || '') +
      (l.marca ? ' · ' + esc(l.marca) : '') +
      ' · <span class="' + (cur.sinTipo ? 'n-bad' : '') + '">' + esc(l.tipo || 'sin tipo') + '</span>' +
      ' ×' + (cur.mult || 0) +
      (l.link ? ' · <span class="n-ok">con liga</span>' : ' · <span class="n-warn">sin liga</span>') +
      '</span></span>' +
      '<span class="lin-tot mono">' + (cur.sinPrecio ? '<span class="n-bad">sin precio</span>' : mx(cur.conUtilidad)) + '</span></button>';
    if (!ab) return cab;
    return cab + '<div class="fgrid">' +
      '<div class="f"><label>Descripción</label><input data-bind="' + p + 'descripcion" value="' + esc(l.descripcion) + '"></div>' +
      '<div class="f"><label>Tipo</label><select data-bind="' + p + 'tipo">' +
        '<option value="">— elige —</option>' +
        C.TIPOS.map(t => '<option' + (t === l.tipo ? ' selected' : '') + '>' + t + '</option>').join('') +
        '</select><div class="tiny">Elige el multiplicador: Materiales ×' + C.margenes(m).materiales +
        ', Servicios ×' + C.margenes(m).servicios + '.</div></div>' +
      '<div class="f"><label>Cantidad</label><input class="num" type="number" step="any" data-num data-bind="' + p + 'qty" value="' + nn(l.qty) + '"></div>' +
      '<div class="f"><label>Unidad</label><select data-bind="' + p + 'unidad">' +
        D.UNIDADES.map(u => '<option' + (u === l.unidad ? ' selected' : '') + '>' + u + '</option>').join('') + '</select></div>' +
      '<div class="f"><label>Marca</label><input data-bind="' + p + 'marca" value="' + esc(l.marca) + '"></div>' +
      '<div class="f"><label>Modelo</label><input data-bind="' + p + 'modelo" value="' + esc(l.modelo) + '"></div>' +
      '<div class="f"><label>Precio unitario</label><input class="num" type="number" step="any" data-num-null data-bind="' + p + 'pu" value="' + nn(l.pu) + '">' +
        '<div class="tiny">Vacío no es cero: se reporta como hueco.</div></div>' +
      '<div class="f"><label>Moneda</label><select data-bind="' + p + 'moneda">' +
        ['MXN', 'USD'].map(x => '<option' + (x === l.moneda ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div>' +
      '<div class="f grow2"><label>Liga al proveedor</label><input data-bind="' + p + 'link" value="' + esc(l.link) + '" placeholder="https://…">' +
        '<div class="tiny">Es el respaldo del precio. Sin ella nadie puede reverificarlo después.</div></div>' +
      '<div class="f grow2"><label>Comentario</label><input data-bind="' + p + 'comentario" value="' + esc(l.comentario) + '"></div>' +
      '<div class="btnrow"><button class="btn del" data-del="' + s.id + '#' + j + '">Eliminar partida</button></div></div>';
  }

  function paneGen(m, c) {
    const mg = c.margenes, base = C.MARGENES_PLANTILLA;
    const fila = (k, label, nota) => {
      const fuera = Math.abs(Number(mg[k]) - base[k]) > 0.001;
      return '<div class="f"><label>' + label + (fuera ? ' <span class="chip warn">≠ plantilla ' + base[k] + '</span>' : '') + '</label>' +
        '<input class="num" type="number" step="0.1" data-num data-bind="margenes.' + k + '" value="' + mg[k] + '">' +
        '<div class="tiny">' + nota + '</div></div>';
    };
    return '<div class="wg"><h4>Multiplicadores de utilidad</h4>' +
      '<div class="tiny nota">El precio de cada renglón es su costo × este número. No es un porcentaje.</div>' +
      '<div class="fgrid">' +
      fila('programador', 'Programador', 'Igual en los 8 machotes revisados: 4,4.') +
      fila('mano_obra', 'Mano de obra', 'Igual en los 8 machotes revisados: 2,5.') +
      fila('materiales', 'Materiales', 'Varía por cotización: se han visto 1,4 · 1,8 · 2,5.') +
      fila('servicios', 'Servicios', 'Varía por cotización: se han visto 1,5 · 1,7 · 1,8.') +
      '</div><div class="tot"><span class="lb">Horas extras</span><span class="vl mono">×' + mg.extra +
      '</span></div><div class="tiny">No se captura: es mano de obra × 2, igual que en el Excel.</div></div>' +

      '<div class="wg"><h4>Comisiones y moneda</h4><div class="fgrid">' +
      '<div class="f"><label>Comisión FTS</label><input class="num" type="number" step="0.001" data-num data-bind="comision_fts" value="' + m.comision_fts + '"><div class="tiny">Plantilla 0,055. Se cobra sobre el precio con utilidad.</div></div>' +
      '<div class="f"><label>Comisión cliente</label><input class="num" type="number" step="0.001" data-num data-bind="comision_cliente" value="' + m.comision_cliente + '"><div class="tiny">Va encima de la de FTS, en cascada.</div></div>' +
      '<div class="f"><label>Moneda del documento</label><select data-bind="moneda">' +
        ['MXN', 'USD'].map(x => '<option' + (x === m.moneda ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div>' +
      '<div class="f"><label>Tipo de cambio</label><input class="num" type="number" step="any" data-num data-bind="tc" value="' + m.tc + '"></div>' +
      '<div class="f"><label>Factor de protección</label><input class="num" type="number" step="0.01" data-num data-bind="factor_proteccion" value="' + m.factor_proteccion + '">' +
        '<div class="tiny">TC efectivo ' + C.tcEfectivo(m).toFixed(2) + '. El machote de Excel no convierte: suma monedas distintas.</div></div>' +
      '</div></div>';
  }

  function paneCom(m, c) {
    const eq = (titulo, key, rep, bolsa, nota) =>
      '<div class="wg"><h4>' + titulo + '</h4><div class="tiny nota">' + nota + '</div>' +
      '<div class="tot"><span class="lb">Bolsa</span><span class="vl mono">' + mx(bolsa, m.moneda) + '</span></div>' +
      (m[key] || []).map((it, i) =>
        '<div class="row"><input class="grow" data-bind="eq:' + rep + ':' + i + ':nombre" value="' + esc(it.nombre) + '">' +
        '<input class="num" type="number" step="0.05" data-num data-bind="eq:' + rep + ':' + i + ':pct" value="' + it.pct + '">' +
        '<div class="lin-tot mono tiny">' + mx(bolsa * Number(it.pct), '') + '</div></div>').join('') +
      '<div class="tot"><span class="lb">Suma de porcentajes</span><span class="vl mono n-' +
        (Math.abs((m[key] || []).reduce((a, x) => a + Number(x.pct || 0), 0) - 1) < 0.0001 ? 'ok' : 'bad') + '">' +
        pc((m[key] || []).reduce((a, x) => a + Number(x.pct || 0), 0)) + '</span></div></div>';

    const b = c.budget;
    return eq('Equipo de venta', 'equipo_venta', 'venta', c.reparto.bolsaVenta, pc(Number(m.reparto.venta)) + ' de la comisión de FTS.') +
      eq('Equipo de operaciones', 'equipo_operaciones', 'ops', c.reparto.bolsaOps, pc(Number(m.reparto.operaciones)) + ' de la comisión de FTS.') +
      eq('Lado cliente', 'equipo_cliente', 'cli', c.escenario.comisionCliente, 'Se reparte la comisión de cliente.') +
      '<div class="wg"><h4>BUDGET ODOO</h4>' +
      '<div class="tiny nota">Es lo que se capturaría como presupuesto del proyecto. Amarra con los rubros 1171 Ingreso / 1177 Mano de obra / 1176 Materiales que ya crea el workflow al confirmar la SO.</div>' +
      '<div class="tot"><span class="lb">Ingreso</span><span class="vl mono">' + mx(b.ingreso, m.moneda) + '</span></div>' +
      '<div class="tot"><span class="lb">Mano de obra</span><span class="vl mono">' + mx(b.manoObra, m.moneda) + '</span></div>' +
      '<div class="tot"><span class="lb">Materiales y servicios</span><span class="vl mono">' + mx(b.materiales, m.moneda) + '</span></div>' +
      b.comisiones.filter(l => l.monto).map(l =>
        '<div class="tot"><span class="lb tiny">' + esc(l.nombre) + '</span><span class="vl mono tiny">' + mx(l.monto, '') + '</span></div>').join('') +
      '<div class="tot"><span class="lb"><strong>Total</strong></span><span class="vl mono"><strong>' + mx(b.total, m.moneda) + '</strong></span></div>' +
      '<div class="tot"><span class="lb">¿Coincide con la tabla?</span><span class="vl mono n-' + (b.cuadra ? 'ok' : 'bad') + '">' +
        (b.cuadra ? 'VERDADERO' : 'FALSO') + '</span></div>' +
      (b.cuadra ? '' : '<div class="aviso">El machote de Excel muestra este mismo FALSO y aun así deja mandar la cotización. Aquí bloquea.</div>') +
      '</div>';
  }

  function paneSim(m, c) {
    const e = c.escenarios;
    const card = (id, label, x) =>
      '<button class="paso' + (m.escenario === id ? ' on' : '') + '" data-esc="' + id + '" style="flex-direction:column;align-items:flex-start">' +
      '<strong>' + label + '</strong><span class="mono tiny">' + mx(x.precio, '') + '</span>' +
      '<span class="tiny">margen ' + pc(x.margen) + '</span></button>';

    const sim = ST.simMargen === null ? Number(m.margen_deseado) : ST.simMargen;
    const pSim = C.precioParaMargen(c.costo, c.pctFts, c.pctCli, sim);

    return '<div class="wg"><h4>Escenario</h4>' +
      '<div class="pasos" id="escs">' + card('costo', 'Costo', e.costo) +
        card('con_utilidad', 'Con utilidad', e.con_utilidad) +
        card('margen_deseado', 'Margen deseado', e.margen_deseado) + '</div>' +
      '<div class="f"><label>Margen deseado</label><input class="num" type="number" step="0.01" data-num data-bind="margen_deseado" value="' + m.margen_deseado + '"></div>' +
      '<div class="tot"><span class="lb">Factor_req</span><span class="vl mono">' + (c.factorReq ? c.factorReq.toFixed(6) : '—') + '</span></div>' +
      '<div class="tiny">Cuántas veces el costo hay que cobrar para llegar al margen, ya con las comisiones dentro.</div></div>' +

      '<div class="wg"><h4>Resumen</h4>' +
      '<div class="tot"><span class="lb">Costo mano de obra</span><span class="vl mono">' + mx(c.costoMo, m.moneda) + ' · ' + pc(c.pesoMo) + '</span></div>' +
      '<div class="tot"><span class="lb">Costo materiales y servicios</span><span class="vl mono">' + mx(c.costoMat, m.moneda) + ' · ' + pc(c.pesoMat) + '</span></div>' +
      '<div class="tot"><span class="lb">Costo total</span><span class="vl mono">' + mx(c.costo, m.moneda) + '</span></div>' +
      '<div class="tot"><span class="lb">Comisión FTS</span><span class="vl mono">' + mx(c.escenario.comisionFts, m.moneda) + '</span></div>' +
      '<div class="tot"><span class="lb">Comisión cliente</span><span class="vl mono">' + mx(c.escenario.comisionCliente, m.moneda) + '</span></div>' +
      '<div class="tot"><span class="lb"><strong>Precio</strong></span><span class="vl mono"><strong>' + mx(c.precio, m.moneda) + '</strong></span></div>' +
      '<div class="tot"><span class="lb">Utilidad</span><span class="vl mono n-' + nivelMargen(c.margen) + '">' + mx(c.utilidad, m.moneda) + ' · ' + pc(c.margen) + '</span></div>' +
      '<div class="tot"><span class="lb">Horas proyecto</span><span class="vl mono">' + Math.round(c.horas) + '</span></div>' +
      (c.costoIncompleto ? '<div class="aviso">Hay ' + c.huecos + ' hueco(s) de captura. El margen de arriba es optimista: lo que falta sólo puede subir el costo.</div>' : '') +
      '</div>' +

      '<div class="wg sim-box"><h4>¿Y si quisiera otro margen?</h4>' +
      '<div class="f"><label>Margen objetivo</label><input class="num" type="number" step="0.01" id="simM" value="' + sim + '"></div>' +
      '<div class="sim-out mono">Precio necesario: <strong>' + mx(pSim, m.moneda) + '</strong></div>' +
      '<div class="tiny">No cambia la cotización. Es sólo la cuenta.</div></div>' +

      '<div class="wg"><h4>Por sección</h4>' +
      c.secciones.map(s => '<div class="tot"><span class="lb">' + esc(s.nombre) + '</span>' +
        '<span class="vl mono">' + mx(s.precio, '') + ' · ' + pc(s.peso) + ' del costo</span></div>').join('') +
      '<div class="tiny">En el escenario de margen deseado el precio se reparte a prorrata del costo. El margen es una restricción global, no se fija por sección.</div></div>';
  }

  function barraFija(m) {
    const rev = R.revisar(m), c = rev.calc;
    $('#fija').innerHTML = '<div class="fija"><div class="grow">' +
      '<div class="mono ' + 'n-' + (c.costoIncompleto ? 'warn' : nivelMargen(c.margen)) + '">' +
      mx(c.precio, m.moneda) + ' · ' + pc(c.margen) + (c.costoIncompleto ? '*' : '') + '</div>' +
      '<div class="tiny">' + (rev.duras.length ? '⛔ ' + rev.duras.length + ' duras' : '✓ sin duras') +
      (rev.blandas.length ? ' · ⚠ ' + rev.blandas.length : '') +
      (c.costoIncompleto ? ' · ' + c.huecos + ' huecos' : '') + '</div></div>' +
      '<a class="btn" href="#/rev/' + m.id + '">Revisar</a></div>';
  }

  /** Reconstruye lo que depende de los números sin repintar el pane entero:
   *  repintar mientras se teclea mata el foco del campo. */
  function refrescar(m) { barraFija(m); }

  /* ── Enlace de campos ───────────────────────────────────────────────── */
  function enlazar(m) {
    $$('[data-bind]').forEach(el => {
      const ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.oninput = el.onchange = () => {
        const path = el.dataset.bind;
        let v = el.value;
        if (el.hasAttribute('data-num')) v = parseFloat(v) || 0;
        if (el.hasAttribute('data-num-null')) v = (v === '' ? null : (parseFloat(v) || 0));
        if (path.indexOf('s-nombre:') === 0) {
          const s = m.secciones.find(x => x.id === path.split(':')[1]); if (s) s.nombre = v;
        } else setPath(m, path, v);
        refrescar(m);
        if (ev === 'change') pintarPane(m);
      };
    });
    // Primer valor en un renglón de mano de obra vacío: lo crea.
    $$('[data-mo-init]').forEach(el => {
      el.onchange = () => {
        const [sid, rolId, campo] = el.dataset.moInit.split('|');
        const s = m.secciones.find(x => x.id === sid); if (!s) return;
        const rol = C.ROL[rolId];
        const l = { rol: rolId, qty: 0, personas: 1, pu: rol.pu, moneda: m.moneda };
        l[campo] = parseFloat(el.value) || 0;
        s.mo.push(l); pintarPane(m); refrescar(m);
      };
    });
    $$('[data-open]').forEach(b => b.onclick = () => {
      const k = b.dataset.open; ST.abiertos[k] = !ST.abiertos[k]; pintarPane(m);
    });
    $$('[data-del]').forEach(b => b.onclick = () => {
      const [sid, j] = b.dataset.del.split('#');
      const s = m.secciones.find(x => x.id === sid); if (!s) return;
      s.partidas.splice(parseInt(j, 10), 1); ST.abiertos = {}; pintarPane(m); refrescar(m);
    });
    $$('[data-add-part]').forEach(b => b.onclick = () => {
      const s = m.secciones.find(x => x.id === b.dataset.addPart); if (!s) return;
      s.partidas.push({ qty: 1, unidad: 'Pieza', tipo: 'Materiales', descripcion: '', modelo: '', marca: '',
                        pu: null, moneda: m.moneda, link: '', comentario: '' });
      ST.abiertos[s.id + '#' + (s.partidas.length - 1)] = true; pintarPane(m); refrescar(m);
    });
    $$('[data-add-sec]').forEach(b => b.onclick = () => {
      if (m.secciones.length >= C.MAX_SECCIONES) return;
      m.secciones.push({ id: 's-' + Date.now(), nombre: 'SECCION ' + (m.secciones.length + 1), partidas: [], mo: [] });
      pintarPane(m); refrescar(m);
    });
    $$('[data-esc]').forEach(b => b.onclick = () => { m.escenario = b.dataset.esc; pintarPane(m); refrescar(m); });
    const sm = $('#simM');
    if (sm) sm.oninput = () => {
      ST.simMargen = parseFloat(sm.value) || 0;
      const c = C.calcular(m);
      const out = $('.sim-out');
      if (out) out.innerHTML = 'Precio necesario: <strong>' +
        mx(C.precioParaMargen(c.costo, c.pctFts, c.pctCli, ST.simMargen), m.moneda) + '</strong>';
    };
  }

  /* ── Revisador ──────────────────────────────────────────────────────── */
  function vRevision(id) {
    const m = mach(id); if (!m) { location.hash = '#/'; return; }
    const rev = R.revisar(m), c = rev.calc;
    top('Revisión', m.id + ' · ' + esc(m.nombre), 'REVISOR', '#/m/' + id);
    $('#fija').innerHTML = '<div class="fija"><div class="grow"><div class="tiny">' +
      (rev.puedeConfirmar ? '✓ Se puede mandar' : '⛔ ' + rev.duras.length + ' hallazgo(s) duro(s)') +
      '</div></div><a class="btn" href="#/m/' + id + '">Volver a editar</a></div>';

    const bloque = (t, arr, cls) => !arr.length ? '' :
      '<h3 class="' + cls + '">' + t + ' (' + arr.length + ')</h3>' + arr.map(h =>
        '<div class="wg ' + cls + '"><strong>' + esc(h.titulo) + '</strong>' +
        '<div class="tiny oc">' + esc(h.area) + '</div>' +
        '<div>' + esc(h.detalle) + '</div>' +
        (h.items.length ? '<ul class="tiny">' + h.items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>' : '') +
        (h.destino ? '<div class="btnrow"><button class="btn" data-goto="' + h.destino.tab + '">Ir a arreglarlo</button></div>' : '') +
        '</div>').join('');

    $('#vista').innerHTML = '<div class="pad">' +
      '<div class="kpi"><div><span class="tiny">Precio</span><strong class="mono">' + mx(c.precio, m.moneda) + '</strong></div>' +
      '<div><span class="tiny">Margen</span><strong class="mono n-' + nivelMargen(c.margen) + '">' + pc(c.margen) + '</strong></div>' +
      '<div><span class="tiny">Huecos</span><strong class="mono">' + c.huecos + '</strong></div></div>' +
      (rev.total === 0 ? '<div class="vacio">Sin hallazgos.</div>' : '') +
      bloque('Duras · bloquean', rev.duras, 'bad') +
      bloque('Blandas · advierten', rev.blandas, 'warn') +
      bloque('Observaciones', rev.infos, 'info') + '</div>';

    $$('[data-goto]').forEach(b => b.onclick = () => { ST.tab = b.dataset.goto; location.hash = '#/m/' + id; });
  }

  /* ── Estación 3.0 ───────────────────────────────────────────────────── */
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
    top('Confirmar orden', o.so + ' · ' + esc(o.cliente), 'ORDEN', '#/');
    const listo = ENTREGABLES.every(e => h.entregables[e.id]);
    const ya = !!ST.confirmadas[o.id];

    $('#vista').innerHTML = '<div class="pad"><h2>' + esc(o.nombre) + '</h2>' +
      '<div class="tiny">Confirmada el ' + esc(o.fecha_confirmacion) + ' · ' + mx(o.monto, o.moneda) + '</div>' +
      (ya ? '<div class="aviso ok">Handoff cerrado. Operaciones ya tiene lo que necesita.</div>' : '') +
      '<div class="wg"><h4>Qué tiene que quedar antes de soltarla a operaciones</h4>' +
      ENTREGABLES.map(e => '<label class="row"><input type="checkbox" data-ent="' + e.id + '"' +
        (h.entregables[e.id] ? ' checked' : '') + '><span class="grow">' + esc(e.label) + '</span></label>').join('') +
      '</div>' +
      '<div class="wg"><h4>Notas para operaciones</h4>' +
      '<textarea id="notas" rows="4" placeholder="Lo que no cabe en una casilla.">' + esc(h.notas) + '</textarea></div>' +
      '</div>';

    barraOrden(o, h);

    // Repintar la vista entera en cada palomita arranca el nodo bajo el cursor
    // (y hacía fallar el click siguiente). Sólo se refresca la barra de abajo.
    $$('[data-ent]').forEach(cb => cb.onchange = () => {
      h.entregables[cb.dataset.ent] = cb.checked;
      barraOrden(o, h);
    });
    $('#notas').oninput = (e) => { h.notas = e.target.value; };
  }

  /** Barra de la estación 3.0. Vive aparte para poder refrescarla sin
   *  reconstruir la lista de casillas. */
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

  /* ── Aprobación ─────────────────────────────────────────────────────── */
  function vAprobar(id) {
    const m = mach(id); if (!m) { location.hash = '#/'; return; }
    const rev = R.revisar(m), c = rev.calc;
    top('Aprobación', m.id, 'DIRECCIÓN', '#/m/' + id);
    $('#fija').innerHTML = '';
    $('#vista').innerHTML = '<div class="pad"><h2>' + esc(m.nombre) + '</h2>' +
      '<div class="kpi"><div><span class="tiny">Precio</span><strong class="mono">' + mx(c.precio, m.moneda) + '</strong></div>' +
      '<div><span class="tiny">Margen</span><strong class="mono n-' + nivelMargen(c.margen) + '">' + pc(c.margen) + '</strong></div>' +
      '<div><span class="tiny">Duras</span><strong class="mono">' + rev.duras.length + '</strong></div></div>' +
      '<div class="wg"><h4>Lo que dirección tiene que ver antes de firmar</h4>' +
      '<div class="tot"><span class="lb">Costo</span><span class="vl mono">' + mx(c.costo, m.moneda) + '</span></div>' +
      '<div class="tot"><span class="lb">Comisiones</span><span class="vl mono">' + mx(c.escenario.comisionFts + c.escenario.comisionCliente, m.moneda) + '</span></div>' +
      '<div class="tot"><span class="lb">Utilidad</span><span class="vl mono">' + mx(c.utilidad, m.moneda) + '</span></div>' +
      '<div class="tot"><span class="lb">BUDGET ODOO cuadra</span><span class="vl mono n-' + (c.budget.cuadra ? 'ok' : 'bad') + '">' +
        (c.budget.cuadra ? 'sí' : 'no') + '</span></div></div>' +
      (rev.duras.length ? '<div class="aviso bad">Tiene ' + rev.duras.length + ' hallazgo(s) duro(s). No debería llegar aquí.</div>'
                        : '<div class="aviso ok">Sin hallazgos duros.</div>') + '</div>';
  }

  render();
})(window);
