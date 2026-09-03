/* ═══ Machote y órdenes · aplicación ═══
 *
 * Prototipo. Estado en memoria (se pierde al recargar, a propósito: no hay
 * localStorage ni red). Ruteo por hash.
 */
(function (G) {
  'use strict';
  const { DEMO, CALC, REGLAS } = G;

  // ── Estado ────────────────────────────────────────────────────────────────
  const clon = (x) => JSON.parse(JSON.stringify(x));
  const ST = {
    machotes: clon(DEMO.MACHOTES),
    ordenes: clon(DEMO.ORDENES),
    handoff: {},        // por orden
    confirmadas: {},    // la "foto" al confirmar
    aprobaciones: {},   // decisiones del account manager
    tab: 'diag',
    simPrecio: null,
    portapapeles: null, // resultado de widget listo para usarse
    abiertos: {}        // renglones desplegados (id -> true)
  };
  const mach = (id) => ST.machotes.find(m => m.id === id);
  const orden = (id) => ST.ordenes.find(o => o.id === id);
  /** El handoff se crea bajo demanda. Antes solo nacía al pintar la orden, así que
   *  cualquier escritura que llegara antes de un re-pintado se perdía en silencio. */
  const hoff = (id) => ST.handoff[id] || (ST.handoff[id] = {
    cuenta: '', presupuesto: '', inicio: '', fin: '', responsable: '', alcance: '', entregables: '', costo_manual: 0
  });

  // ── Utilidades ────────────────────────────────────────────────────────────
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mx = (n) => '$' + Math.round(n || 0).toLocaleString('es-MX');
  const mx2 = (n) => '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pc = (x) => x === null || x === undefined ? '—' : (x * 100).toFixed(1) + '%';
  const nivelMargen = (m) => m === null ? '' : (m < REGLAS.UMBRALES.margen_minimo_duro ? 'bad'
                            : m < REGLAS.UMBRALES.margen_minimo_blando ? 'warn' : 'ok');

  /** Nivel visual del margen. Si el costo tiene huecos, NUNCA se pinta en verde:
   *  un margen calculado sobre un costo incompleto siempre está inflado, y
   *  pintarlo de "sano" es la forma más cara de mentirle al que aprueba. */
  const nivelConHuecos = (c) => c.costoIncompleto ? 'warn' : nivelMargen(c.margen);
  const pcM = (c) => c.margen === null ? '—' : pc(c.margen) + (c.costoIncompleto ? '*' : '');
  const notaHuecos = (c) => !c.costoIncompleto ? '' :
    '* Faltan ' + c.huecos + ' renglón(es) por costear: el margen real es MENOR.';

  function toast(txt) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = txt;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  /** Escribe en el estado por ruta: "venta.precio" o "s:<sid>:bom:<lid>:pu" */
  function setPath(m, path, val) {
    const p = path.split(':');
    if (p[0] === 's') {
      const s = m.secciones.find(x => x.id === p[1]);
      if (!s) return;
      const arr = p[2] === 'bom' ? s.bom : s.mo;
      const l = arr.find(x => x.id === p[3]);
      if (l) l[p[4]] = val;
      return;
    }
    if (p[0] === 'sec') { const s = m.secciones.find(x => x.id === p[1]); if (s) s[p[2]] = val; return; }
    const parts = path.split('.');
    let o = m;
    for (let i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null) o[parts[i]] = {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = val;
  }

  // ── Router ────────────────────────────────────────────────────────────────
  const rutas = [
    { re: /^#\/?$/,                 v: () => vHome() },
    { re: /^#\/m\/([^/]+)$/,        v: (id) => vMachote(id) },
    { re: /^#\/rev\/([^/]+)$/,      v: (id) => vRevision(id) },
    { re: /^#\/orden\/([^/]+)$/,    v: (id) => vOrden(id) },
    { re: /^#\/ap\/([^/]+)$/,       v: (id) => vAprobar(id) }
  ];
  let atras = '#/';

  function render() {
    const h = location.hash || '#/';
    for (const r of rutas) {
      const m = h.match(r.re);
      if (m) { $('#fija').innerHTML = ''; r.v(m[1]); window.scrollTo(0, 0); return; }
    }
    location.hash = '#/';
  }
  function top(t, s, b, back) {
    $('#tbT').textContent = t; $('#tbS').textContent = s;
    $('#tbB').textContent = b || 'DEMO';
    atras = back || '#/';
    $('#scr').classList.toggle('ancho', !$('#scr').dataset.angosto);
  }
  function angosto(si) { $('#scr').dataset.angosto = si ? '1' : ''; $('#scr').classList.toggle('ancho', !si); }

  $('#btnBack').addEventListener('click', () => {
    if (atras === 'MODULO') location.href = '../index.html';
    else location.hash = atras;
  });
  window.addEventListener('hashchange', render);

  // ═══ PANTALLA 0 · Inicio ══════════════════════════════════════════════════
  function vHome() {
    angosto(false);
    top('Machote y órdenes', 'Comercial · prototipo', 'DEMO', 'MODULO');
    const est = DEMO.ESTADOS;

    const cards = ST.machotes.map(m => {
      const c = CALC.calcular(m);
      const r = REGLAS.revisar(m);
      const e = est[m.estado];
      return '<button class="item" data-ir="#/m/' + m.id + '">' +
        '<div class="t1"><div class="grow"><div class="nm">' + esc(m.nombre) + '</div>' +
        '<div class="cl">' + esc(m.cliente) + ' · ' + esc(m.planta) + '</div></div>' +
        '<span class="chip ' + e.color + '">' + e.etiqueta + '</span></div>' +
        '<div class="t2"><span>' + esc(m.id) + '</span>' +
        '<span>Costo <b class="mono">' + mx(c.costoTotal) + '</b></span>' +
        '<span>Margen <b class="mono" style="color:' +
          (c.margen === null ? 'var(--muted)' : nivelConHuecos(c) === 'ok' ? 'var(--green)' : nivelConHuecos(c) === 'warn' ? '#9a6700' : 'var(--red)') +
          '">' + pcM(c) + '</b></span>' +
        (r.duras.length ? '<span class="right chip rojo">' + r.duras.length + ' bloqueo' + (r.duras.length > 1 ? 's' : '') + '</span>'
                        : r.blandas.length ? '<span class="right chip ambar">' + r.blandas.length + ' aviso' + (r.blandas.length > 1 ? 's' : '') + '</span>'
                        : '<span class="right chip verde">limpio</span>') +
        '</div></button>';
    }).join('');

    const ords = ST.ordenes.map(o => {
      const conf = ST.confirmadas[o.id];
      const tot = o.lineas.reduce((a, l) => a + l.cant * l.pu, 0);
      const m = o.machote ? mach(o.machote) : null;
      const c = m ? CALC.calcular(m) : null;
      return '<button class="item" data-ir="#/orden/' + o.id + '">' +
        '<div class="t1"><div class="grow"><div class="nm">' + esc(o.id) + ' · ' + esc(o.cliente) + '</div>' +
        '<div class="cl">' + o.lineas.length + ' línea(s) · ' + (o.machote ? 'machote ' + esc(o.machote) : 'sin machote ligado') + '</div></div>' +
        (conf ? '<span class="chip azul">CONFIRMADA</span>' : '<span class="chip">Borrador</span>') + '</div>' +
        '<div class="t2"><span>Total <b class="mono">' + mx(tot) + '</b></span>' +
        (c ? '<span>Margen <b class="mono">' + pc(c.margen) + '</b></span>' : '<span style="color:var(--red)">margen sin capturar</span>') +
        '</div></button>';
    }).join('');

    $('#vista').innerHTML =
      '<div class="pad">' +
        '<div class="aviso azul">Prototipo con datos demo. No guarda nada y no habla con Odoo: al recargar vuelve al estado inicial.</div>' +
        '<h3 class="sub-t">Machotes</h3>' + cards +
        '<h3 class="sub-t">Órdenes por confirmar</h3>' + ords +
        '<h3 class="sub-t">Vista del account manager</h3>' +
        '<div class="tiny" style="margin-bottom:6px">Pantalla corta, de teléfono: margen, lo que marcó el revisador, y aprobar o devolver.</div>' +
        ST.machotes.filter(m => m.estado === 'revision' || m.estado === 'aprobado').map(m =>
          '<button class="item" data-ir="#/ap/' + m.id + '"><div class="t1"><div class="grow">' +
          '<div class="nm">Aprobar · ' + esc(m.cliente) + '</div><div class="cl">' + esc(m.nombre) + '</div></div>' +
          '<span class="chip ' + est[m.estado].color + '">' + est[m.estado].etiqueta + '</span></div></button>').join('') +
      '</div>';
  }

  // ═══ PANTALLA 1 · Machote ═════════════════════════════════════════════════
  function vMachote(id) {
    const m = mach(id); if (!m) { location.hash = '#/'; return; }
    angosto(false);
    top(m.cliente, m.id + ' · ' + DEMO.ESTADOS[m.estado].etiqueta, 'MACHOTE', '#/');
    pintarMachote(m);
  }

  function pintarMachote(m) {
    const tabs = [['diag', 'Diagnóstico'], ['secc', 'Secciones'], ['gen', 'Generales'], ['sim', 'Simulador']];
    $('#vista').innerHTML =
      '<div class="tab-row">' + tabs.map(t =>
        '<button class="tab' + (ST.tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
      '<div id="pane"></div>';
    pintarPane(m);
    barraFija(m);
  }

  function pintarPane(m) {
    const f = { diag: paneDiag, secc: paneSecc, gen: paneGen, sim: paneSim }[ST.tab] || paneDiag;
    $('#pane').innerHTML = '<div class="pad">' + f(m) + '</div>';
    if (ST.tab === 'gen') pintarWidget();   // el cuadro de cálculo se arma después del HTML
  }

  // ── Diagnóstico ──
  function paneDiag(m) {
    const t = DEMO.TIPOS_PROYECTO.find(x => x.id === m.diagnostico.tipo);
    const r = m.diagnostico.respuestas || {};
    let h = '';
    h += '<div class="f"><label>Tipo de proyecto</label><select data-re="diagnostico.tipo">' +
      '<option value="">— elige —</option>' +
      DEMO.TIPOS_PROYECTO.map(x => '<option value="' + x.id + '"' + (x.id === m.diagnostico.tipo ? ' selected' : '') + '>' +
        x.icono + ' ' + esc(x.nombre) + '</option>').join('') + '</select></div>';

    h += '<div class="fgrid"><div class="f"><label>Cliente</label><input data-bind="cliente" value="' + esc(m.cliente) + '"></div>' +
         '<div class="f"><label>Planta / sitio</label><input data-bind="planta" value="' + esc(m.planta) + '"></div></div>';

    h += '<div class="f"><label>Alcance</label><textarea data-bind="diagnostico.alcance" placeholder="Qué se va a hacer, con qué límites.">' +
         esc(m.diagnostico.alcance) + '</textarea></div>';

    h += '<h3 class="sub-t">Ubicación y cuadrilla</h3>' +
      '<div class="fgrid c3">' +
      '<div class="f"><label>Ciudad</label><input data-bind="ubicacion.ciudad" value="' + esc(m.ubicacion.ciudad) + '"></div>' +
      '<div class="f"><label>Días de obra</label><input class="num" type="number" min="0" data-bind="ubicacion.dias_obra" data-num value="' + m.ubicacion.dias_obra + '"></div>' +
      '<div class="f"><label>Personas</label><input class="num" type="number" min="0" data-bind="ubicacion.personas_cuadrilla" data-num value="' + m.ubicacion.personas_cuadrilla + '"></div>' +
      '</div>' +
      '<label class="row" style="gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" data-re="ubicacion.foraneo" data-bool' +
        (m.ubicacion.foraneo ? ' checked' : '') + '> Obra foránea (fuera de Monterrey)</label>' +
      (m.ubicacion.foraneo ? '<div class="aviso ambar">Obra foránea: el revisador va a exigir hospedaje y viáticos por los días de la cuadrilla.</div>' : '');

    if (t) {
      h += '<h3 class="sub-t">Preguntas de ' + esc(t.nombre) + '</h3>' +
           '<div class="tiny" style="margin-bottom:8px">Las marcadas con ● son críticas: sin ellas no se puede confirmar.</div>';
      h += t.preguntas.map(p => {
        const v = r[p.id];
        const marca = p.critica ? '<span style="color:var(--red)">●</span> ' : '';
        let ctl;
        if (p.tipo === 'bool') {
          ctl = '<div class="btnrow" style="margin-top:4px">' +
            ['Sí', 'No'].map((lb, i) => {
              const val = i === 0;
              const on = v === val;
              return '<button class="btn sm ' + (on ? (val ? 'btn-g' : 'btn-p') : 'btn-s') + '" data-preg="' + p.id + '" data-val="' + val + '">' + lb + '</button>';
            }).join('') + '</div>';
        } else if (p.tipo === 'opcion') {
          ctl = '<select data-preg-sel="' + p.id + '"><option value="">—</option>' +
            p.opciones.map(o => '<option' + (v === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>';
        } else {
          ctl = '<input ' + (p.tipo === 'num' ? 'class="num" type="number"' : 'type="text"') +
            ' data-preg-inp="' + p.id + '"' + (p.tipo === 'num' ? ' data-num' : '') +
            ' value="' + (v === null || v === undefined ? '' : esc(v)) + '">';
        }
        const falta = p.critica && (v === null || v === undefined || v === '');
        return '<div class="f" style="margin-bottom:9px">' +
          '<label>' + marca + esc(p.texto) + '</label>' + ctl +
          (falta ? '<div class="tiny" style="color:var(--red)">Sin responder</div>' : '') +
          (p.implica && v === true ? '<div class="tiny" style="color:#9a6700">⚠ ' + esc(p.implica) + '</div>' : '') +
          (p.riesgo_si_no && v === false ? '<div class="tiny" style="color:#9a6700">⚠ ' + esc(p.riesgo_si_no) + '</div>' : '') +
          '</div>';
      }).join('');
    } else {
      h += '<div class="aviso ambar">Elige un tipo de proyecto para ver sus preguntas de validación.</div>';
    }
    return h;
  }

  // ── Secciones ──
  function paneSecc(m) {
    const c = CALC.calcular(m);
    let h = '';
    if (c.costoIncompleto) {
      h += '<div class="aviso rojo"><b>' + c.huecos + ' renglón(es) sin costear.</b> ' +
        'Todo lo que ves abajo —costo, margen, utilidad— está calculado sin ellos, así que ' +
        'el margen real es <b>menor</b> que el que aparece.</div>';
    }
    if (ST.portapapeles) {
      h += '<div class="aviso verde row"><div class="grow">Resultado listo: <b>' + ST.portapapeles.valor + ' ' +
        esc(ST.portapapeles.unidad) + '</b> — ' + esc(ST.portapapeles.etiqueta) + '</div>' +
        '<button class="btn mini btn-s" data-limpiar-pp>Descartar</button></div>';
    }
    m.secciones.forEach((s, i) => {
      const cs = CALC.calcularSeccion(s, m);
      h += '<div class="card" style="margin-bottom:12px">' +
        '<div class="card-hd"><input data-bind="sec:' + s.id + ':nombre" value="' + esc(s.nombre) +
          '" style="border:none;background:none;font-weight:700;font-size:14px;padding:0;flex:1">' +
        '<span class="tiny mono">' + mx(cs.total) + '</span>' +
        '<button class="del" data-del-sec="' + s.id + '" title="Quitar sección">✕</button></div>' +
        '<div class="card-body">' +

        '<h3 class="sub-t" style="margin-top:0">Material (BOM)</h3>' +
        (s.bom.length ? s.bom.map((l, j) => lineaBom(l, s, m, j + 1)).join('') : '<div class="tiny">Sin partidas.</div>') +
        '<button class="btn sm btn-s" style="margin-top:8px" data-add-bom="' + s.id + '">+ Partida' +
          (ST.portapapeles ? ' (cant. ' + ST.portapapeles.valor + ')' : '') + '</button>' +

        '<h3 class="sub-t">Mano de obra</h3>' +
        '<div class="tiny" style="margin-bottom:6px">Horas como horas, por oficio. Nunca disfrazadas de piezas.</div>' +
        (s.mo.length ? s.mo.map((l, j) => lineaMo(l, s, j + 1)).join('') : '<div class="tiny">Sin mano de obra.</div>') +
        '<button class="btn sm btn-s" style="margin-top:8px" data-add-mo="' + s.id + '">+ Mano de obra</button>' +

        '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:8px">' +
        '<div class="tot"><span class="lb">Material</span><span class="vl mono">' + mx(cs.material) + '</span></div>' +
        '<div class="tot"><span class="lb">Mano de obra · ' + Math.round(cs.horasHombre) + ' HH</span><span class="vl mono">' + mx(cs.manoObra) + '</span></div>' +
        '</div></div></div>';
    });
    h += '<button class="btn btn-s" data-add-sec>+ Agregar sección de trabajo</button>';
    h += '<div class="card" style="margin-top:12px"><div class="card-body">' +
      '<div class="tot"><span class="lb">Material</span><span class="vl mono">' + mx(c.material) + '</span></div>' +
      '<div class="tot"><span class="lb">Mano de obra · ' + Math.round(c.horasHombre) + ' HH</span><span class="vl mono">' + mx(c.manoObra) + '</span></div>' +
      '<div class="tot big"><span class="lb">Costo directo</span><span class="vl mono">' + mx(c.costoDirecto) + '</span></div>' +
      '</div></div>';
    return h;
  }

  function lineaBom(l, s, m, idx) {
    const cb = CALC.costoBom(l, m);
    const o = DEMO.ORIGENES_PRECIO[l.origen] || DEMO.ORIGENES_PRECIO.sin_dato;
    const p = 's:' + s.id + ':bom:' + l.id + ':';
    const ab = ST.abiertos[l.id];

    // Cerrado: una sola fila legible. Con 16 partidas, ver los 7 campos de cada
    // una vuelve la sección un muro por el que nadie quiere pasar.
    if (!ab) {
      const mm = [l.marca, l.modelo].filter(Boolean).join(' ');
      return '<button class="lin cerrada" data-abrir="' + l.id + '">' +
        '<div class="lin-hd"><span class="idx">' + idx + '</span>' +
        '<div class="grow" style="min-width:0">' +
        '<div class="cd">' + (esc(l.desc) || '<i style="color:var(--muted)">sin descripción</i>') + '</div>' +
        '<div class="cm">' + (mm ? esc(mm) + ' · ' : '') +
          (l.cant || 0).toLocaleString('es-MX') + ' ' + esc(l.unidad) +
          (cb.sinPrecio ? '' : ' × ' + mx2(l.pu) + (l.moneda === 'USD' ? ' USD' : '')) +
          ' <span class="oc ' + o.confianza + '">' + o.confianza + '</span></div></div>' +
        '<span class="lin-tot' + (cb.sinPrecio ? ' nd' : ' mono') + '" data-tot-bom="' + l.id + '">' +
          (cb.sinPrecio ? 'SIN DATO' : mx(cb.total)) + '</span>' +
        '<span class="chev">›</span></div></button>';
    }

    return '<div class="lin abierta">' +
      '<div class="lin-hd"><span class="idx">' + idx + '</span>' +
      '<input class="grow" data-bind="' + p + 'desc" value="' + esc(l.desc) + '" placeholder="Descripción del material">' +
      '<span class="lin-tot' + (cb.sinPrecio ? ' nd' : '') + '" data-tot-bom="' + l.id + '">' +
        (cb.sinPrecio ? 'SIN DATO' : mx(cb.total)) + '</span>' +
      '<button class="del" data-cerrar="' + l.id + '" title="Cerrar">⌃</button>' +
      '<button class="del" data-del-bom="' + s.id + '|' + l.id + '">✕</button></div>' +
      '<div class="fgrid c3">' +
      '<div class="f"><label>Marca</label><input data-bind="' + p + 'marca" value="' + esc(l.marca) + '"></div>' +
      '<div class="f"><label>Modelo</label><input data-bind="' + p + 'modelo" value="' + esc(l.modelo) + '"></div>' +
      '<div class="f"><label>Cantidad</label><input class="num" type="number" step="any" data-num data-bind="' + p + 'cant" value="' + l.cant + '"></div>' +
      '<div class="f"><label>Unidad</label><select data-re="' + p + 'unidad">' +
        DEMO.UNIDADES.map(u => '<option' + (u === l.unidad ? ' selected' : '') + '>' + u + '</option>').join('') + '</select></div>' +
      '<div class="f"><label>P. unitario</label><input class="num' + (cb.sinPrecio ? ' err' : '') + '" type="number" step="any" data-num-null data-bind="' + p + 'pu" value="' +
        (l.pu === null ? '' : l.pu) + '" placeholder="sin dato"></div>' +
      '<div class="f"><label>Moneda</label><select data-re="' + p + 'moneda">' +
        ['MXN', 'USD'].map(u => '<option' + (u === l.moneda ? ' selected' : '') + '>' + u + '</option>').join('') + '</select></div>' +
      '</div>' +
      '<div class="row"><div class="f grow"><label>Origen del precio</label><select data-re="' + p + 'origen">' +
        Object.keys(DEMO.ORIGENES_PRECIO).map(k => '<option value="' + k + '"' + (k === l.origen ? ' selected' : '') + '>' +
          esc(DEMO.ORIGENES_PRECIO[k].etiqueta) + '</option>').join('') + '</select></div>' +
      '<span class="oc ' + o.confianza + '" style="align-self:flex-end;margin-bottom:9px">' + o.confianza + '</span></div>' +
      '</div>';
  }

  function lineaMo(l, s, idx) {
    const cm = CALC.costoMo(l);
    const p = 's:' + s.id + ':mo:' + l.id + ':';
    const ab = ST.abiertos[l.id];
    const of = DEMO.OFICIOS.find(o => o.id === l.oficio);

    if (!ab) {
      return '<button class="lin cerrada' + (cm.sinOficio ? ' mal' : '') + '" data-abrir="' + l.id + '">' +
        '<div class="lin-hd"><span class="idx">' + idx + '</span>' +
        '<div class="grow" style="min-width:0">' +
        '<div class="cd">' + (of ? esc(of.nombre) : '<span style="color:var(--red)">Sin oficio</span>') + '</div>' +
        '<div class="cm">' + l.horas + ' h × ' + l.personas + ' = ' + Math.round(cm.horas_hombre) + ' HH' +
          (l.horas_dobles ? ' · ' + l.horas_dobles + ' h dobles' : '') +
          (l.turno !== 'normal' ? ' · ' + esc(CALC.ETIQUETA_TURNO[l.turno]) : '') + '</div></div>' +
        '<span class="lin-tot mono" data-tot-mo="' + l.id + '">' + mx(cm.total) + '</span>' +
        '<span class="chev">›</span></div></button>';
    }

    return '<div class="lin abierta">' +
      '<div class="lin-hd"><span class="idx">' + idx + '</span>' +
      '<select class="grow' + (cm.sinOficio ? ' err' : '') + '" data-re="' + p + 'oficio">' +
        '<option value="">— elige oficio —</option>' +
        DEMO.OFICIOS.map(o => '<option value="' + o.id + '"' + (o.id === l.oficio ? ' selected' : '') + '>' + esc(o.nombre) + '</option>').join('') +
        '</select>' +
      '<span class="lin-tot mono" data-tot-mo="' + l.id + '">' + mx(cm.total) + '</span>' +
      '<button class="del" data-cerrar="' + l.id + '" title="Cerrar">⌃</button>' +
      '<button class="del" data-del-mo="' + s.id + '|' + l.id + '">✕</button></div>' +
      '<div class="fgrid c3">' +
      '<div class="f"><label>Horas / persona</label><input class="num" type="number" step="any" data-num data-bind="' + p + 'horas" value="' + l.horas + '"></div>' +
      '<div class="f"><label>Personas</label><input class="num" type="number" step="1" data-num data-bind="' + p + 'personas" value="' + l.personas + '"></div>' +
      '<div class="f"><label>Costo / hora</label><input class="num" type="number" step="any" data-num-null data-bind="' + p + 'costo_hora" value="' + (l.costo_hora === null ? '' : l.costo_hora) + '"></div>' +
      '<div class="f"><label>Turno</label><select data-re="' + p + 'turno">' +
        Object.keys(CALC.FACTOR_TURNO).map(t => '<option value="' + t + '"' + (t === l.turno ? ' selected' : '') + '>' + CALC.ETIQUETA_TURNO[t] + '</option>').join('') +
        '</select></div>' +
      '<div class="f"><label>Horas dobles</label><input class="num" type="number" step="any" data-num data-bind="' + p + 'horas_dobles" value="' + l.horas_dobles + '"></div>' +
      '<div class="f"><label>Horas-hombre</label><input class="num" value="' + Math.round(cm.horas_hombre) + '" disabled style="background:var(--d3)"></div>' +
      '</div></div>';
  }

  // ── Generales ──
  function paneGen(m) {
    const c = CALC.calcular(m);
    const g = m.generales;
    const fila = (k, lb, nota) =>
      '<div class="fgrid" style="margin-bottom:8px"><div class="f"><label>' + lb + '</label>' +
      '<input class="num" type="number" step="any" data-num data-bind="generales.' + k + '.monto" value="' + (g[k].monto || 0) + '"></div>' +
      '<div class="f"><label>Nota</label><input data-bind="generales.' + k + '.nota" value="' + esc(g[k].nota || '') + '" placeholder="' + nota + '"></div></div>';

    let h = '<h3 class="sub-t" style="margin-top:0">Moneda</h3>' +
      '<div class="fgrid c3">' +
      '<div class="f"><label>Moneda</label><select data-re="moneda"><option value="">—</option>' +
        ['MXN', 'USD'].map(x => '<option' + (x === m.moneda ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div>' +
      '<div class="f"><label>Tipo de cambio</label><input class="num" type="number" step="any" data-num data-bind="tc" value="' + m.tc + '"></div>' +
      '<div class="f"><label>Factor protección</label><input class="num" type="number" step="0.01" data-num data-bind="factor_proteccion" value="' + m.factor_proteccion + '"></div>' +
      '</div>' +
      '<div class="tiny">TC efectivo para partidas en USD: <b class="mono">' + (c.tcEfectivo ? c.tcEfectivo.toFixed(4) : '—') + '</b></div>';

    h += '<h3 class="sub-t">Generales — renglones explícitos</h3>' +
      '<div class="tiny" style="margin-bottom:8px">Cada uno se ve y se cobra por separado. Nada escondido dentro de un porcentaje.</div>' +
      fila('flete', 'Flete', 'traslados') + fila('importacion', 'Importación', 'pedimento, agente') +
      fila('viaticos', 'Viáticos', 'alimentación') + fila('hospedaje', 'Hospedaje', 'cuartos');

    h += '<div class="fgrid"><div class="f"><label>Comisión de broker (%)</label>' +
      '<input class="num" type="number" step="any" data-num data-bind="generales.comision_broker.pct" value="' + (g.comision_broker.pct || 0) + '"></div>' +
      '<div class="f"><label>Equivale a</label><input value="' + mx(c.comisionMonto) + '" disabled style="background:var(--d3)"></div></div>';

    h += '<h3 class="sub-t">Cuadros de cálculo</h3>' +
      '<div class="tiny" style="margin-bottom:8px">El resultado se captura como dato. No es una hoja libre.</div>' +
      '<div class="f"><label>Cuadro</label><select id="wgSel">' +
        Object.keys(CALC.WIDGETS).map(k => '<option value="' + k + '">' + esc(CALC.WIDGETS[k].nombre) + '</option>').join('') +
      '</select></div><div id="wgBox" style="margin-top:8px"></div>';

    return h;
  }

  function pintarWidget() {
    const box = $('#wgBox'); if (!box) return;
    const k = $('#wgSel').value;
    const w = CALC.WIDGETS[k];
    box.dataset.k = k;
    box.innerHTML = '<div class="wg"><div class="wg-t">' + esc(w.nombre) + '</div>' +
      '<div class="wg-f">' + esc(w.formula) + '</div>' +
      '<div class="tiny" style="margin:5px 0 8px">' + esc(w.ayuda) + '</div>' +
      '<div class="fgrid">' + w.campos.map(c =>
        '<div class="f"><label>' + esc(c.etiqueta) + (c.unidad ? ' (' + c.unidad + ')' : '') + '</label>' +
        '<input class="num wgi" type="number" step="any" data-c="' + c.id + '" data-pct="' + (c.pct ? '1' : '') + '" value=""></div>').join('') +
      '</div>' +
      '<div class="row" style="margin-top:10px"><div class="grow"><div class="tiny">Resultado</div>' +
      '<div class="wg-r" id="wgR">—</div></div>' +
      '<button class="btn mini btn-p" id="wgUsar">Usar este número</button></div></div>';
    box.querySelectorAll('.wgi').forEach(i => i.addEventListener('input', calcWidget));
    $('#wgUsar').addEventListener('click', usarWidget);
    calcWidget();
  }
  function leerWidget() {
    const box = $('#wgBox'), k = box.dataset.k, w = CALC.WIDGETS[k], p = {};
    box.querySelectorAll('.wgi').forEach(i => {
      let v = parseFloat(i.value); if (!isFinite(v)) v = 0;
      p[i.dataset.c] = i.dataset.pct ? v / 100 : v;
    });
    return { k, w, p, r: w.calcular(p) };
  }
  function calcWidget() {
    const { w, r } = leerWidget();
    $('#wgR').textContent = (r === null || !isFinite(r)) ? '—' : r.toLocaleString('es-MX') + ' ' + w.unidad;
  }
  function usarWidget() {
    const m = mach(location.hash.split('/')[2]);
    const { k, w, r } = leerWidget();
    if (r === null || !isFinite(r) || r === 0) { toast('Captura los datos del cuadro primero'); return; }
    if (k === 'viaticos_cuadrilla') { m.generales.viaticos.monto = r; m.generales.viaticos.nota = 'Calculado con el cuadro'; toast('Viáticos actualizados'); pintarPane(m); barraFija(m); return; }
    if (k === 'hospedaje_cuadrilla') { m.generales.hospedaje.monto = r; m.generales.hospedaje.nota = 'Calculado con el cuadro'; toast('Hospedaje actualizado'); pintarPane(m); barraFija(m); return; }
    ST.portapapeles = { valor: r, unidad: w.unidad, etiqueta: w.nombre };
    toast('Listo. Ve a Secciones y agrega la partida.');
  }

  // ── Simulador ──
  function paneSim(m) {
    const c = CALC.calcular(m);
    const base = c.costoTotal;
    const pAct = ST.simPrecio !== null ? ST.simPrecio : c.precio;
    const min = Math.round(base * 0.9), max = Math.round(Math.max(base * 2.2, pAct * 1.2, 1000));
    const sim = simular(m, pAct);
    return '<div class="aviso azul">Mueve el precio y mira el margen. O escribe el margen que quieres y te da el precio.</div>' +
      '<div class="card"><div class="card-body">' +
      '<div class="tot"><span class="lb">Costo total (directo + generales)</span><span class="vl mono">' + mx(base) + '</span></div>' +
      '<div class="f" style="margin-top:12px"><label>Precio de venta</label>' +
      '<input class="num" type="number" step="any" id="simP" value="' + Math.round(pAct) + '"></div>' +
      '<input type="range" id="simR" min="' + min + '" max="' + max + '" step="1000" value="' + Math.round(pAct) + '">' +
      '<div class="row tiny"><span>' + mx(min) + '</span><span class="right">' + mx(max) + '</span></div>' +
      '<div class="sim-out" style="margin-top:12px">' +
      '<div class="sim-box"><div class="n mono" id="simMg" style="color:' + colorMg(sim.margen) + '">' + pc(sim.margen) + '</div><div class="l">Margen</div></div>' +
      '<div class="sim-box"><div class="n mono" id="simUt">' + mx(sim.utilidad) + '</div><div class="l">Utilidad</div></div>' +
      '</div>' +
      '<div class="tot" style="margin-top:10px"><span class="lb">Comisión de broker (' + pc(c.comisionPct) + ')</span>' +
        '<span class="vl mono" id="simCm">' + mx(sim.comision) + '</span></div>' +
      '<div class="tot"><span class="lb">Markup sobre costo</span><span class="vl mono" id="simMk">' + pc(sim.markup) + '</span></div>' +
      '</div></div>' +
      '<div class="card"><div class="card-hd"><b style="font-size:13px">Al revés: quiero este margen</b></div><div class="card-body">' +
      '<div class="row"><div class="f grow"><label>Margen objetivo (%)</label>' +
      '<input class="num" type="number" step="0.5" id="objM" value="' + Math.round(REGLAS.UMBRALES.margen_minimo_blando * 100) + '"></div>' +
      '<button class="btn sm btn-p" id="objBtn" style="align-self:flex-end;margin-bottom:1px">Calcular precio</button></div>' +
      '<div id="objR" class="tiny" style="margin-top:8px"></div>' +
      '</div></div>' +
      '<button class="btn btn-p" id="simAplicar" style="margin-top:12px">Guardar ' + mx(pAct) + ' como precio de venta</button>';
  }
  const colorMg = (mg) => mg === null ? 'var(--muted)' : nivelMargen(mg) === 'ok' ? 'var(--green)' : nivelMargen(mg) === 'warn' ? '#9a6700' : 'var(--red)';
  function simular(m, precio) {
    const c = CALC.calcular(m);
    const comision = precio * c.comisionPct;
    const utilidad = precio - c.costoTotal - comision;
    return { comision, utilidad, margen: precio > 0 ? utilidad / precio : null,
             markup: c.costoTotal > 0 ? (precio - c.costoTotal) / c.costoTotal : null };
  }

  // ── Barra fija de totales ──
  function barraFija(m) {
    const c = CALC.calcular(m);
    const r = REGLAS.revisar(m);
    const n = nivelConHuecos(c);
    $('#fija').innerHTML =
      '<div class="fija">' +
      '<div class="b"><span>COSTO' + (c.costoIncompleto ? ' (INCOMPLETO)' : '') + '</span>' +
        '<b class="mono' + (c.costoIncompleto ? ' inc' : '') + '" id="fCosto">' + mx(c.costoTotal) + '</b></div>' +
      '<div class="b"><span>PRECIO</span><b class="mono" id="fPrecio">' + mx(c.precio) + '</b></div>' +
      '<div class="b mg ' + n + '"><span>MARGEN</span><b class="mono" id="fMargen">' + pcM(c) + '</b></div>' +
      '<button class="btn mini ' + (r.duras.length ? 'btn-p' : 'btn-s') + ' right" data-ir="#/rev/' + m.id + '">' +
        'Revisar' + (r.duras.length ? ' · ' + r.duras.length + '🔴' : r.blandas.length ? ' · ' + r.blandas.length + '🟡' : ' ✓') +
      '</button></div>';
  }
  /** Actualiza solo los números derivados, sin reconstruir inputs (no pierde el foco). */
  function refrescar(m) {
    const c = CALC.calcular(m);
    const set = (sel, v) => { const e = $(sel); if (e) e.textContent = v; };
    set('#fCosto', mx(c.costoTotal)); set('#fPrecio', mx(c.precio)); set('#fMargen', pcM(c));
    const mgEl = $('#fija .mg'); if (mgEl) mgEl.className = 'b mg ' + nivelConHuecos(c);
    const cEl = $('#fCosto'); if (cEl) cEl.className = 'mono' + (c.costoIncompleto ? ' inc' : '');
    const cLb = cEl && cEl.parentNode.querySelector('span');
    if (cLb) cLb.textContent = 'COSTO' + (c.costoIncompleto ? ' (INCOMPLETO)' : '');
    m.secciones.forEach(s => {
      s.bom.forEach(l => {
        const e = document.querySelector('[data-tot-bom="' + l.id + '"]'); if (!e) return;
        const cb = CALC.costoBom(l, m);
        e.textContent = cb.sinPrecio ? 'SIN DATO' : mx(cb.total);
        e.className = 'lin-tot' + (cb.sinPrecio ? ' nd' : ' mono');
      });
      s.mo.forEach(l => {
        const e = document.querySelector('[data-tot-mo="' + l.id + '"]'); if (!e) return;
        e.textContent = mx(CALC.costoMo(l).total);
      });
    });
  }

  // ═══ PANTALLA 2 · Revisador ═══════════════════════════════════════════════
  function vRevision(id) {
    const m = mach(id); if (!m) { location.hash = '#/'; return; }
    angosto(false);
    top('Revisador', m.id + ' · ' + m.cliente, 'REVISIÓN', '#/m/' + id);
    const r = REGLAS.revisar(m);
    const bloque = (lista, clase, titulo, vacio) =>
      '<h3 class="sub-t">' + titulo + ' · ' + lista.length + '</h3>' +
      (lista.length ? lista.map(h =>
        '<div class="hz ' + clase + '" style="margin-bottom:8px">' +
        '<div class="hz-a">' + esc(h.area) + '</div>' +
        '<div class="hz-t">' + esc(h.titulo) + '</div>' +
        (h.detalle ? '<div class="hz-d">' + esc(h.detalle) + '</div>' : '') +
        (h.items.length ? '<ul>' + h.items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>' : '') +
        '</div>').join('') : '<div class="tiny">' + vacio + '</div>');

    $('#vista').innerHTML = '<div class="pad">' +
      (r.duras.length
        ? '<div class="aviso rojo"><b>' + r.duras.length + ' cosa' + (r.duras.length > 1 ? 's' : '') + ' bloquea' + (r.duras.length > 1 ? 'n' : '') + ' la confirmación.</b> Hasta resolverlas, la orden no se puede confirmar.</div>'
        : '<div class="aviso verde"><b>Sin bloqueos.</b> ' + (r.blandas.length ? 'Quedan ' + r.blandas.length + ' avisos que conviene revisar.' : 'El machote está limpio.') + '</div>') +
      '<div class="tiny">Se evaluaron ' + REGLAS.REGLAS.length + ' reglas.</div>' +
      bloque(r.duras, 'dura', '🔴 Bloqueantes', 'Nada bloquea.') +
      bloque(r.blandas, 'blanda', '🟡 Avisos', 'Sin avisos.') +
      bloque(r.infos, 'info', '🔵 Observaciones', 'Sin observaciones.') +
      '<div class="btnrow" style="margin-top:14px">' +
      '<button class="btn btn-s" data-ir="#/m/' + m.id + '">Volver al machote</button>' +
      (ordenDe(m.id) ? '<button class="btn btn-p" data-ir="#/orden/' + ordenDe(m.id).id + '">Ir a la orden</button>' : '') +
      '</div></div>';
  }
  const ordenDe = (mid) => ST.ordenes.find(o => o.machote === mid);

  // ═══ PANTALLA 3 · Confirmación de orden ═══════════════════════════════════
  function vOrden(id) {
    const o = orden(id); if (!o) { location.hash = '#/'; return; }
    angosto(false);
    top('Confirmar orden', o.id + ' · ' + o.cliente, 'ORDEN', '#/');
    pintarOrden(o);
  }

  function pintarOrden(o) {
    const conf = ST.confirmadas[o.id];
    if (conf) { $('#vista').innerHTML = vistaConfirmada(o, conf); return; }

    const m = o.machote ? mach(o.machote) : null;
    const r = m ? REGLAS.revisar(m) : null;
    const total = o.lineas.reduce((a, l) => a + l.cant * l.pu, 0);
    const h = hoff(o.id);
    if (m && !h.alcance) h.alcance = m.diagnostico.alcance || '';

    const cm = m ? CALC.calcular(m) : null;
    const costo = cm ? cm.costoTotal : (h.costo_manual || 0);
    const margen = total > 0 ? (total - costo) / total : null;

    const faltan = camposFaltantes(h, m, costo);
    const bloqueado = (r && r.duras.length > 0) || faltan.length > 0;

    $('#vista').innerHTML = '<div class="pad">' +

      '<div class="card"><div class="card-hd"><b style="font-size:13px">Líneas de la orden</b>' +
      '<span class="right tiny mono">' + mx(total) + '</span></div><div class="card-body pad tight">' +
      o.lineas.map(l => '<div class="tot"><span class="lb">' + esc(l.desc) + '</span>' +
        '<span class="vl mono">' + mx(l.cant * l.pu) + '</span></div>').join('') +
      '<div class="tot big"><span class="lb">Total</span><span class="vl mono">' + mx(total) + '</span></div>' +
      '</div></div>' +

      // ── Margen ANTES de confirmar ──
      '<div class="card"><div class="card-hd"><b style="font-size:13px">Margen antes de confirmar</b></div>' +
      '<div class="card-body">' +
      (m
        ? '<div class="tiny" style="margin-bottom:8px">Costo jalado del machote <b>' + esc(m.id) + '</b>.</div>'
        : '<div class="aviso ambar" style="margin-bottom:10px">Esta orden no tiene machote ligado. Captura el costo estimado a mano o no hay con qué comparar.</div>' +
          '<div class="f"><label>Costo estimado (captura manual)</label>' +
          '<input class="num" type="number" step="any" id="costoMan" value="' + (h.costo_manual || '') + '" placeholder="0"></div>') +
      '<div class="kpi" style="padding:14px 0 6px"><div class="n mono ' +
        (cm && cm.costoIncompleto ? 'warn' : nivelMargen(margen)) + '">' + pc(margen) + (cm && cm.costoIncompleto ? '*' : '') + '</div>' +
      '<div class="l">margen sobre ' + mx(total) + '</div>' +
      '<div class="sub">Costo ' + mx(costo) + ' · Utilidad ' + mx(total - costo) + '</div>' +
      (cm && cm.costoIncompleto ? '<div class="sub" style="color:#9a6700">' + notaHuecos(cm) + '</div>' : '') + '</div>' +
      '</div></div>' +

      // ── Revisador ──
      (r ? '<div class="aviso ' + (r.duras.length ? 'rojo' : r.blandas.length ? 'ambar' : 'verde') + '">' +
        (r.duras.length
          ? '<b>El revisador encontró ' + r.duras.length + ' bloqueo(s).</b> No se puede confirmar.'
          : r.blandas.length ? '<b>Sin bloqueos</b>, con ' + r.blandas.length + ' avisos.' : '<b>Machote limpio.</b>') +
        ' <a href="#/rev/' + m.id + '" style="color:inherit;font-weight:700">Ver detalle</a></div>' : '') +

      // ── Handoff ──
      '<div class="card"><div class="card-hd"><b style="font-size:13px">Handoff a operaciones</b></div><div class="card-body">' +
      '<div class="tiny" style="margin-bottom:10px">Capturar deja de ser trámite posterior: es el requisito para confirmar.</div>' +
      '<div class="fgrid">' +
      '<div class="f"><label>Cuenta analítica</label><input data-h="cuenta" value="' + esc(h.cuenta) + '" placeholder="Se crea al confirmar"></div>' +
      '<div class="f"><label>Presupuesto de obra</label><input class="num" type="number" step="any" data-h="presupuesto" value="' + esc(h.presupuesto) + '" placeholder="' + Math.round(costo) + '"></div>' +
      '<div class="f"><label>Fecha de inicio</label><input type="date" data-h="inicio" value="' + esc(h.inicio) + '"></div>' +
      '<div class="f"><label>Fecha de fin</label><input type="date" data-h="fin" value="' + esc(h.fin) + '"></div>' +
      '</div>' +
      '<div class="f" style="margin-top:8px"><label>Responsable de obra</label><select data-h="responsable">' +
      '<option value="">— elige —</option>' +
      ['Francisco Montalvo', 'Mateo Salazar', 'Ricardo Hernández', 'Gibrán Solís'].map(x =>
        '<option' + (h.responsable === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div>' +
      '<div class="f" style="margin-top:8px"><label>Alcance comprometido</label><textarea data-h="alcance">' + esc(h.alcance) + '</textarea></div>' +
      '<div class="f" style="margin-top:8px"><label>Entregables</label><textarea data-h="entregables" placeholder="Planos as-built, memoria, pruebas, garantía…">' + esc(h.entregables) + '</textarea></div>' +
      '</div></div>' +

      '<div id="gateAviso">' + (faltan.length ? '<div class="aviso ambar"><b>Falta capturar:</b><br>' + faltan.map(esc).join(' · ') + '</div>' : '') + '</div>' +

      '<button class="btn ' + (bloqueado ? 'btn-s' : 'btn-g') + '" id="btnConf"' + (bloqueado ? ' disabled style="opacity:.5"' : '') + '>' +
        (bloqueado ? 'No se puede confirmar todavía' : 'Confirmar orden ' + o.id) + '</button>' +
      '<div id="pasos"></div>' +
      '</div>';
  }

  /** Actualiza el KPI de margen de la orden sin reconstruir el formulario. */
  function refrescarMargenOrden() {
    const o = orden(idActual()); if (!o) return;
    const m = o.machote ? mach(o.machote) : null;
    const h = hoff(o.id);
    const total = o.lineas.reduce((a, l) => a + l.cant * l.pu, 0);
    const costo = m ? CALC.calcular(m).costoTotal : (h.costo_manual || 0);
    const mg = total > 0 ? (total - costo) / total : null;
    const n = $('.kpi .n'); if (n) { n.textContent = pc(mg); n.className = 'n mono ' + nivelMargen(mg); }
    const sub = $('.kpi .sub'); if (sub) sub.textContent = 'Costo ' + mx(costo) + ' · Utilidad ' + mx(total - costo);
  }

  /** Re-evalúa el candado de confirmación en vivo, sin reconstruir el formulario.
   *  Antes solo se recalculaba al re-pintar: el analista capturaba el último campo
   *  y el botón seguía deshabilitado hasta que tocaba otra cosa. */
  function refrescarGate() {
    const o = orden(idActual()); if (!o) return;
    const m = o.machote ? mach(o.machote) : null;
    const r = m ? REGLAS.revisar(m) : null;
    const h = hoff(o.id);
    const costo = m ? CALC.calcular(m).costoTotal : (h.costo_manual || 0);
    const faltan = camposFaltantes(h, m, costo);
    const bloqueado = (r && r.duras.length > 0) || faltan.length > 0;
    const av = $('#gateAviso');
    if (av) av.innerHTML = faltan.length
      ? '<div class="aviso ambar"><b>Falta capturar:</b><br>' + faltan.map(esc).join(' · ') + '</div>' : '';
    const b = $('#btnConf');
    if (b) {
      b.disabled = bloqueado;
      b.className = 'btn ' + (bloqueado ? 'btn-s' : 'btn-g');
      b.style.opacity = bloqueado ? '.5' : '';
      b.textContent = bloqueado ? 'No se puede confirmar todavía' : 'Confirmar orden ' + o.id;
    }
  }

  function camposFaltantes(h, m, costo) {
    const f = [];
    if (!h.presupuesto) f.push('presupuesto');
    if (!h.inicio) f.push('fecha de inicio');
    if (!h.fin) f.push('fecha de fin');
    if (!h.responsable) f.push('responsable de obra');
    if (!(h.alcance || '').trim()) f.push('alcance');
    if (!(h.entregables || '').trim()) f.push('entregables');
    if (!m && !(costo > 0)) f.push('costo estimado');
    if (h.inicio && h.fin && h.fin < h.inicio) f.push('la fecha de fin es anterior al inicio');
    return f;
  }

  // ── Simulación de lo que se dispara ──
  function confirmar(o) {
    const m = o.machote ? mach(o.machote) : null;
    const h = hoff(o.id);
    const total = o.lineas.reduce((a, l) => a + l.cant * l.pu, 0);
    const costo = m ? CALC.calcular(m).costoTotal : (h.costo_manual || 0);
    const kick = new Date(); kick.setDate(kick.getDate() + 1);
    const kickTxt = kick.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) + ' 14:00';

    const pasos = [
      { t: 'Orden confirmada en Odoo', r: () => o.id + ' → estado «Orden de venta»' },
      { t: 'Proyecto creado', r: () => 'PRY-' + o.id.replace('SO', '') + ' · ' + o.cliente },
      { t: 'Cuenta analítica creada', r: () => (h.cuenta || 'AA-' + o.id.replace('SO', '')) + ' (plan 1 · México)' },
      { t: 'Presupuesto cargado', r: () => mx(h.presupuesto) + ' contra la cuenta analítica' },
      { t: 'Kickoff agendado', r: () => kickTxt + ' · ' + h.responsable }
    ];

    $('#btnConf').disabled = true;
    $('#btnConf').textContent = 'Disparando…';
    const cont = $('#pasos');
    cont.innerHTML = '<div class="card" style="margin-top:12px"><div class="card-hd"><b style="font-size:13px">Lo que se dispara ahora</b></div>' +
      '<div class="card-body"><div class="tiny" style="margin-bottom:8px">En el momento, no por cron.</div><div class="pasos" id="pl">' +
      pasos.map((p, i) => '<div class="paso wait" id="p' + i + '"><div class="mk">' + (i + 1) + '</div>' +
        '<div class="px"><div class="pt">' + esc(p.t) + '</div><div class="pr" id="pr' + i + '"></div></div></div>').join('') +
      '</div></div></div>';

    let i = 0;
    const paso = () => {
      if (i > 0) { const a = $('#p' + (i - 1)); a.className = 'paso ok'; a.querySelector('.mk').textContent = '✓'; $('#pr' + (i - 1)).textContent = pasos[i - 1].r(); }
      if (i >= pasos.length) { cerrar(); return; }
      $('#p' + i).className = 'paso run';
      i++; setTimeout(paso, 700);
    };
    const cerrar = () => {
      ST.confirmadas[o.id] = {
        por: 'A. Ruiz (analista)',
        cuando: new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }),
        margen: total > 0 ? (total - costo) / total : null,
        costo_estimado: costo, precio: total, machote: o.machote,
        kickoff: kickTxt, responsable: h.responsable, presupuesto: h.presupuesto
      };
      if (m) m.estado = 'confirmado';
      toast('Orden confirmada');
      setTimeout(() => pintarOrden(o), 600);
    };
    setTimeout(paso, 300);
  }

  function vistaConfirmada(o, c) {
    return '<div class="pad">' +
      '<div class="aviso verde"><b>Orden ' + esc(o.id) + ' confirmada.</b></div>' +
      '<div class="card"><div class="card-hd"><b style="font-size:13px">La foto del momento</b></div><div class="card-body">' +
      '<div class="tiny" style="margin-bottom:10px">Esto queda guardado: contra qué números se confirmó, y quién lo hizo.</div>' +
      '<div class="tot"><span class="lb">Confirmó</span><span class="vl">' + esc(c.por) + '</span></div>' +
      '<div class="tot"><span class="lb">Cuándo</span><span class="vl">' + esc(c.cuando) + '</span></div>' +
      '<div class="tot"><span class="lb">Precio</span><span class="vl mono">' + mx(c.precio) + '</span></div>' +
      '<div class="tot"><span class="lb">Costo estimado</span><span class="vl mono">' + mx(c.costo_estimado) + '</span></div>' +
      '<div class="tot big ' + (c.margen >= REGLAS.UMBRALES.margen_minimo_blando ? 'pos' : 'neg') + '">' +
        '<span class="lb">Margen al confirmar</span><span class="vl mono">' + pc(c.margen) + '</span></div>' +
      '<div class="tot"><span class="lb">Machote</span><span class="vl">' + esc(c.machote || 'captura manual') + '</span></div>' +
      '<div class="tot"><span class="lb">Presupuesto</span><span class="vl mono">' + mx(c.presupuesto) + '</span></div>' +
      '<div class="tot"><span class="lb">Responsable</span><span class="vl">' + esc(c.responsable) + '</span></div>' +
      '<div class="tot"><span class="lb">Kickoff</span><span class="vl">' + esc(c.kickoff) + '</span></div>' +
      '</div></div>' +
      '<button class="btn btn-s" data-ir="#/">Volver al inicio</button></div>';
  }

  // ═══ PANTALLA 4 · Aprobación del account manager ══════════════════════════
  function vAprobar(id) {
    const m = mach(id); if (!m) { location.hash = '#/'; return; }
    angosto(true);                       // esta sí es de bolsillo
    top('Aprobación', m.cliente, m.am || 'AM', '#/');
    pintarAprobar(m);
  }

  function pintarAprobar(m) {
    const c = CALC.calcular(m);
    const r = REGLAS.revisar(m);
    const dec = ST.aprobaciones[m.id];
    const n = nivelConHuecos(c);

    if (dec) {
      $('#vista').innerHTML = '<div class="pad">' +
        '<div class="aviso ' + (dec.ok ? 'verde' : 'ambar') + '"><b>' + (dec.ok ? 'Aprobado' : 'Devuelto al analista') + '.</b>' +
        (dec.comentario ? '<br>« ' + esc(dec.comentario) + ' »' : '') + '</div>' +
        '<div class="tiny">' + esc(dec.cuando) + ' · ' + esc(m.am) + '</div>' +
        '<button class="btn btn-s" style="margin-top:12px" data-ir="#/">Volver</button></div>';
      return;
    }

    $('#vista').innerHTML = '<div class="pad">' +
      '<div class="kpi"><div class="n mono ' + n + '">' + pcM(c) + '</div>' +
      '<div class="l">margen · ' + esc(m.nombre) + '</div>' +
      '<div class="sub">Precio ' + mx(c.precio) + ' &nbsp;·&nbsp; Costo ' + mx(c.costoTotal) + '</div>' +
      '<div class="sub">Utilidad ' + mx(c.utilidad) + '</div>' +
      (c.costoIncompleto ? '<div class="aviso ambar" style="margin-top:12px;text-align:left">' +
        '<b>Este margen no es de fiar.</b> ' + notaHuecos(c).replace('* ', '') + '</div>' : '') + '</div>' +

      (r.duras.length
        ? '<div class="aviso rojo"><b>' + r.duras.length + ' bloqueo(s):</b><br>' + r.duras.map(h => '· ' + esc(h.titulo)).join('<br>') + '</div>'
        : '<div class="aviso verde">Sin bloqueos del revisador.</div>') +
      (r.blandas.length ? '<div class="aviso ambar"><b>Avisos:</b><br>' + r.blandas.slice(0, 4).map(h => '· ' + esc(h.titulo)).join('<br>') +
        (r.blandas.length > 4 ? '<br>· y ' + (r.blandas.length - 4) + ' más' : '') + '</div>' : '') +

      '<h3 class="sub-t">Ajustes rápidos</h3>' +
      '<div class="fgrid">' +
      '<div class="f"><label>Precio de venta</label><input class="num" type="number" step="any" data-ap="precio" value="' + Math.round(c.precio) + '"></div>' +
      '<div class="f"><label>Comisión broker (%)</label><input class="num" type="number" step="any" data-ap="comision" value="' + (m.generales.comision_broker.pct || 0) + '"></div>' +
      '</div>' +
      '<div class="tiny">Cambia cualquiera y el margen de arriba se mueve.</div>' +

      '<div class="f" style="margin-top:12px"><label>Comentario (obligatorio si devuelves)</label>' +
      '<textarea id="apCom" placeholder="Qué hay que corregir" style="min-height:56px"></textarea></div>' +

      '<div class="btnrow" style="margin-top:6px">' +
      '<button class="btn btn-s" id="apDev">Devolver</button>' +
      '<button class="btn btn-g" id="apOk"' + (r.duras.length ? ' disabled style="opacity:.5"' : '') + '>Aprobar</button>' +
      '</div>' +
      (r.duras.length ? '<div class="tiny" style="text-align:center;color:var(--red)">No se puede aprobar con bloqueos abiertos.</div>' : '') +
      '</div>';
  }

  // ═══ Eventos (delegación) ═════════════════════════════════════════════════
  const idActual = () => (location.hash.split('/')[2] || '');

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-ir],[data-tab],[data-preg],[data-del-bom],[data-del-mo],[data-del-sec],' +
      '[data-add-bom],[data-add-mo],[data-add-sec],[data-limpiar-pp],[data-abrir],[data-cerrar],' +
      '#btnConf,#apOk,#apDev,#objBtn,#simAplicar');
    if (!t) return;
    const m = mach(idActual());

    if (t.dataset.ir) { location.hash = t.dataset.ir; return; }
    if (t.dataset.tab) { ST.tab = t.dataset.tab; ST.simPrecio = null; pintarMachote(m); return; }
    if (t.dataset.limpiarPp !== undefined) { ST.portapapeles = null; pintarPane(m); return; }
    if (t.dataset.abrir)  { ST.abiertos[t.dataset.abrir] = true;  pintarPane(m); return; }
    if (t.dataset.cerrar) { delete ST.abiertos[t.dataset.cerrar]; pintarPane(m); return; }

    if (t.dataset.preg) {
      m.diagnostico.respuestas[t.dataset.preg] = (t.dataset.val === 'true');
      pintarPane(m); barraFija(m); return;
    }
    if (t.dataset.delBom) { const [s, l] = t.dataset.delBom.split('|');
      const sec = m.secciones.find(x => x.id === s); sec.bom = sec.bom.filter(x => x.id !== l);
      pintarPane(m); barraFija(m); return; }
    if (t.dataset.delMo) { const [s, l] = t.dataset.delMo.split('|');
      const sec = m.secciones.find(x => x.id === s); sec.mo = sec.mo.filter(x => x.id !== l);
      pintarPane(m); barraFija(m); return; }
    if (t.dataset.delSec) { m.secciones = m.secciones.filter(x => x.id !== t.dataset.delSec);
      pintarPane(m); barraFija(m); return; }
    if (t.dataset.addBom) {
      const sec = m.secciones.find(x => x.id === t.dataset.addBom);
      const cant = ST.portapapeles ? ST.portapapeles.valor : 1;
      sec.bom.push({ id: 'b' + Date.now(), desc: '', marca: '', modelo: '', cant, unidad: 'pza',
                     pu: null, origen: 'sin_dato', moneda: m.moneda === 'USD' ? 'USD' : 'MXN' });
      ST.abiertos[sec.bom[sec.bom.length - 1].id] = true;
      ST.portapapeles = null; pintarPane(m); barraFija(m); return;
    }
    if (t.dataset.addMo) {
      const sec = m.secciones.find(x => x.id === t.dataset.addMo);
      sec.mo.push({ id: 'm' + Date.now(), oficio: '', horas: 8, personas: 1, costo_hora: null, turno: 'normal', horas_dobles: 0 });
      ST.abiertos[sec.mo[sec.mo.length - 1].id] = true;
      pintarPane(m); barraFija(m); return;
    }
    if (t.dataset.addSec !== undefined) {
      m.secciones.push({ id: 's' + Date.now(), nombre: 'Sección nueva', bom: [], mo: [] });
      pintarPane(m); barraFija(m); return;
    }
    if (t.id === 'objBtn') {
      const c = CALC.calcular(m);
      const obj = (parseFloat($('#objM').value) || 0) / 100;
      const p = CALC.precioParaMargen(c.costoTotal, c.comisionPct, obj);
      $('#objR').innerHTML = p === null
        ? '<span style="color:var(--red)">Con ' + pc(c.comisionPct) + ' de comisión, ese margen es inalcanzable.</span>'
        : 'Para un margen de <b>' + pc(obj) + '</b> el precio debe ser <b class="mono">' + mx(p) + '</b>.' +
          ' <button class="btn mini btn-p" id="objUsar" style="margin-top:6px">Usar este precio</button>';
      const u = $('#objUsar');
      if (u) u.addEventListener('click', () => { ST.simPrecio = Math.round(p); pintarPane(m); barraFija(m); });
      return;
    }
    if (t.id === 'simAplicar') {
      const c = CALC.calcular(m);
      m.venta.precio = ST.simPrecio !== null ? ST.simPrecio : c.precio;
      ST.simPrecio = null; toast('Precio guardado'); pintarPane(m); barraFija(m); return;
    }
    if (t.id === 'btnConf') { confirmar(orden(idActual())); return; }
    if (t.id === 'apOk' || t.id === 'apDev') {
      const ok = t.id === 'apOk';
      const com = ($('#apCom').value || '').trim();
      if (!ok && !com) { toast('Escribe por qué lo devuelves'); return; }
      ST.aprobaciones[m.id] = { ok, comentario: com, cuando: new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) };
      m.estado = ok ? 'aprobado' : 'devuelto';
      pintarAprobar(m); return;
    }
  });

  // Inputs de texto/número: actualizan estado y SOLO los números derivados.
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    const m = mach(idActual());

    if (el.dataset.bind && m) {
      let v = el.value;
      if (el.dataset.num !== undefined) v = parseFloat(v) || 0;
      if (el.dataset.numNull !== undefined) v = (v === '' ? null : (parseFloat(v) || 0));
      setPath(m, el.dataset.bind, v);
      refrescar(m);
      return;
    }
    if (el.dataset.pregInp && m) {
      let v = el.value;
      if (el.dataset.num !== undefined) v = (v === '' ? null : parseFloat(v));
      m.diagnostico.respuestas[el.dataset.pregInp] = v; return;
    }
    if (el.dataset.h) { hoff(idActual())[el.dataset.h] = el.value; refrescarGate(); return; }
    if (el.id === 'costoMan') { hoff(idActual()).costo_manual = parseFloat(el.value) || 0; refrescarMargenOrden(); refrescarGate(); return; }

    if (el.id === 'simP' || el.id === 'simR') {
      const v = parseFloat(el.value) || 0;
      ST.simPrecio = v;
      const otro = el.id === 'simP' ? $('#simR') : $('#simP');
      if (otro) otro.value = Math.round(v);
      const s = simular(m, v);
      $('#simMg').textContent = pc(s.margen); $('#simMg').style.color = colorMg(s.margen);
      $('#simUt').textContent = mx(s.utilidad);
      $('#simCm').textContent = mx(s.comision);
      $('#simMk').textContent = pc(s.markup);
      const b = $('#simAplicar'); if (b) b.textContent = 'Guardar ' + mx(v) + ' como precio de venta';
      return;
    }
    if (el.dataset.ap && m) {
      if (el.dataset.ap === 'precio') m.venta.precio = parseFloat(el.value) || 0;
      if (el.dataset.ap === 'comision') m.generales.comision_broker.pct = parseFloat(el.value) || 0;
      const c = CALC.calcular(m);
      const k = $('.kpi .n'); if (k) { k.textContent = pcM(c); k.className = 'n mono ' + nivelConHuecos(c); }
      const subs = document.querySelectorAll('.kpi .sub');
      if (subs[0]) subs[0].innerHTML = 'Precio ' + mx(c.precio) + ' &nbsp;·&nbsp; Costo ' + mx(c.costoTotal);
      if (subs[1]) subs[1].textContent = 'Utilidad ' + mx(c.utilidad);
      return;
    }
  });

  // Selects y checkboxes: cambian estructura, se re-pinta.
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    const m = mach(idActual());
    if (el.id === 'wgSel') { pintarWidget(); return; }
    if (el.dataset.re && m) {
      let v = el.value;
      if (el.dataset.bool !== undefined) v = el.checked;
      setPath(m, el.dataset.re, v);
      // Al elegir oficio, se propone su costo por hora si estaba vacío.
      if (el.dataset.re.endsWith(':oficio')) {
        const p = el.dataset.re.split(':');
        const s = m.secciones.find(x => x.id === p[1]);
        const l = s.mo.find(x => x.id === p[3]);
        const of = DEMO.OFICIOS.find(o => o.id === v);
        if (of && (l.costo_hora === null || l.costo_hora === undefined)) l.costo_hora = of.costo_hora;
      }
      if (el.dataset.re === 'diagnostico.tipo') m.diagnostico.respuestas = {};
      pintarPane(m); barraFija(m);
      return;
    }
    if (el.dataset.pregSel && m) { m.diagnostico.respuestas[el.dataset.pregSel] = el.value; pintarPane(m); barraFija(m); return; }
    if (el.dataset.h) { hoff(idActual())[el.dataset.h] = el.value; refrescarGate(); return; }
  });

  render();
})(window);
