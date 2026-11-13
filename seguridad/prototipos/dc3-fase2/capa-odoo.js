/* ═══ PROTOTIPO DC-3 Fase 2 (#507) · capa «trabajadores desde Odoo» ═══
 *
 * Se inyecta DESPUÉS del código real de seguridad/index.html v1.2.0. No reescribe la app:
 * agrega el buscador de Odoo (simulado) y envuelve cuatro funciones existentes:
 *   addWorker        → la misma captura manual, más el formato oficial de la CURP
 *   renderWorkerList → la misma lista, más origen, puesto y lo que falta por capturar
 *   validarGenerar   → las mismas reglas de fechas, más «trabajador incompleto bloquea»
 *   _loteValidar     → las mismas reglas del lote, más «trabajador incompleto bloquea»
 * El PDF lo arma el mismo buildPage de producción; la casilla Puesto* toma worker.puesto.
 *
 * Odoo está SIMULADO aquí adentro: empleados INVENTADOS, ninguno es una persona real.
 * En la versión real, PROTO_ODOO.buscar será el webhook seguridad/dc3-empleados (n8n + Odoo).
 */
(function () {
  'use strict';

  // ── Datos demo (inventados; las CURP llevan XXX para que se note que no son reales) ──
  const EMPLEADOS = [
    { id: 9001, activo: true,  name: 'Laura Patricia Gómez Treviño', ap: 'GOMEZ', am: 'TREVIÑO', nom: 'LAURA PATRICIA', curp: 'GOTL900215MNLXXX04', puesto: 'Segurista' },
    { id: 9002, activo: true,  name: 'Rodrigo Villarreal Ochoa',     ap: 'VILLARREAL', am: 'OCHOA', nom: 'RODRIGO', curp: 'VIOR880702HNLXXX09', puesto: 'Técnico Electromecánico' },
    { id: 9003, activo: true,  name: 'Martín Elizondo Cárdenas',     ap: 'ELIZONDO', am: 'CARDENAS', nom: 'MARTIN', curp: '', puesto: 'Soldador' },
    { id: 9004, activo: true,  name: 'Sofía Ramírez Garza',          ap: '', am: '', nom: '', curp: 'RAGS950911MNLXXX02', puesto: 'Auxiliar de Operaciones' },
    { id: 9005, activo: true,  name: 'Héctor Iván Saldívar Peña',    ap: 'SALDIVAR', am: 'PEÑA', nom: 'HECTOR IVAN', curp: 'SAPH910310HNLXXX0', puesto: 'Chofer' },
    { id: 9006, activo: true,  name: 'Gabriela Treviño Leal',        ap: 'TREVIÑO', am: 'LEAL', nom: 'GABRIELA', curp: 'TELG970120MNLXXX06', puesto: 'Coordinadora de Seguridad' },
    { id: 9007, activo: true,  name: 'Diego Alberto Cantú Morales',  ap: 'CANTU', am: 'MORALES', nom: 'DIEGO ALBERTO', curp: 'CAMD920505HNLXXX01', puesto: 'Soldador' },
    { id: 9008, activo: true,  name: 'Ana Karen Mendoza Ríos',       ap: 'MENDOZA', am: 'RIOS', nom: 'ANA KAREN', curp: 'MERA930303MNLXXX05', puesto: 'Técnica Electromecánica' },
    // Duplicado archivado de Rodrigo (mismo CURP): la búsqueda lo oculta.
    { id: 8102, activo: false, name: 'Rodrigo Villarreal Ochoa',     ap: 'VILLARREAL', am: 'OCHOA', nom: 'RODRIGO', curp: 'VIOR880702HNLXXX09', puesto: 'Técnico Electromecánico' },
  ];
  const CURP_RE = /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HMX](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;
  const ESPERA_OK = 450, ESPERA_CAIDA = 3000; // en la versión real el tope es 8 s
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const P = window.PROTO_ODOO = {
    responde: true, cayo: false, CURP_RE, EMPLEADOS,
    // Simula el webhook: solo activos de la empresa, sin duplicados (CURP o nombre normalizado).
    buscar(q) {
      const n = norm(q);
      return new Promise((ok, mal) => {
        if (!P.responde) return setTimeout(() => mal(new Error('SIN_RESPUESTA')), ESPERA_CAIDA);
        setTimeout(() => {
          if (n.length < 3) return ok([]);
          const uno = new Map();
          EMPLEADOS.filter(e => e.activo).forEach(e => { const k = e.curp || norm(e.name); if (!uno.has(k)) uno.set(k, e); });
          ok([...uno.values()].filter(e => norm(e.name).includes(n) || norm(e.ap + ' ' + e.am + ' ' + e.nom).includes(n) || (e.curp && e.curp.startsWith(n))).slice(0, 10)
            .map(e => ({ id: e.id, name: e.name, puesto: e.puesto, tiene_curp: !!e.curp, curp_valida: CURP_RE.test(e.curp) })));
        }, ESPERA_OK);
      });
    },
    // Simula la acción «detalle»: la CURP solo viaja al elegir a la persona.
    detalle(id) {
      return new Promise((ok, mal) => {
        if (!P.responde) return setTimeout(() => mal(new Error('SIN_RESPUESTA')), ESPERA_CAIDA);
        setTimeout(() => { const e = EMPLEADOS.find(x => x.id === id && x.activo); ok(e ? Object.assign({}, e) : null); }, 200);
      });
    },
  };

  // ── Qué le falta a un trabajador para poder imprimir ──
  function faltan(w) {
    const f = [];
    if (!w.ap || !w.nom) f.push('nombre');
    if (!w.curp) f.push('curp');
    else if (!CURP_RE.test(w.curp)) f.push('curp_invalida');
    return f;
  }
  const TXT = { nombre: 'nombre sin separar en apellidos', curp: 'sin CURP', curp_invalida: 'CURP inválida' };
  P.faltan = faltan;
  function armarNombre(w) { w.name = (w.ap + ' ' + (w.am || '') + ' ' + w.nom).replace(/\s+/g, ' ').trim(); }

  // ── Alta de un trabajador elegido en Odoo ──
  async function elegir(id, ctx) {
    if (inst.workers.some(w => w.odoo_id === id)) {
      const i = inst.workers.findIndex(w => w.odoo_id === id); inst.selWorkers.add(i);
      toast('ℹ️ Ya estaba en la lista; quedó seleccionado'); refrescar(); return;
    }
    let e;
    try { e = await P.detalle(id); } catch (err) { caida(ctx); return; }
    if (!e) { toast('⚠️ Ese empleado ya no está activo en Odoo'); return; }
    const w = { fuente: 'odoo', odoo_id: e.id, nombreOdoo: e.name, ap: e.ap, am: e.am, nom: e.nom, curp: e.curp, puesto: e.puesto, name: '' };
    if (w.ap && w.nom) armarNombre(w); else w.name = norm(e.name);
    inst.workers.push(w);
    inst.selWorkers.add(inst.workers.length - 1);
    toast(faltan(w).length ? '⚠️ Agregado, pero ' + faltan(w).map(k => TXT[k]).join(' y ') : '✅ Trabajador agregado desde Odoo');
    refrescar();
  }

  function refrescar() {
    renderWorkerList();
    if (typeof renderGenSummary === 'function') renderGenSummary();
    if (document.getElementById('tp-lote').classList.contains('on')) renderLote();
    pintarSeleccion();
  }

  // ── Odoo no respondió: aviso, y a captura manual sin perder nada ──
  function caida(ctx) {
    P.cayo = true;
    document.querySelectorAll('.po-res').forEach(r => { r.innerHTML = ''; });
    pintarAvisos();
    toast('⚠️ Odoo no respondió. Pasé a captura manual');
    if (ctx !== 'w') { const tb = document.querySelector('#s-inst .tab-row .tab'); tb.click(); tb.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    const x = document.getElementById('new-ap'); if (x) x.focus();
  }
  function pintarAvisos() {
    document.querySelectorAll('.po-aviso').forEach(a => {
      a.innerHTML = P.cayo
        ? '<div class="po-caida"><b>Odoo no respondió.</b> Sigue con la captura manual (Apellido paterno, materno, nombre y CURP). Lo que ya elegiste se conserva.</div>'
        : '';
    });
  }

  // ── Buscador (uno por pestaña) ──
  function buscador(ctx, titulo, sub) {
    const d = document.createElement('div');
    d.className = 'card po-card'; d.id = 'po-' + ctx;
    d.innerHTML =
      '<div class="card-hd"><div class="card-icon" style="font-size:16px">🔎</div><div><div class="card-title">' + titulo + '</div><div class="card-sub">' + sub + '</div></div></div>' +
      '<div class="card-body" style="display:flex;flex-direction:column;gap:8px">' +
      '<div class="po-aviso"></div>' +
      '<div class="po-fila"><input type="text" class="po-q" id="po-q-' + ctx + '" placeholder="Nombre o CURP (mín. 3 letras)" autocomplete="off" aria-label="Buscar empleado en Odoo">' +
      (ctx === 'w' ? '' : '<button class="btn btn-s po-manual" type="button">✍️ Capturar a mano</button>') + '</div>' +
      '<div class="po-res" id="po-res-' + ctx + '"></div>' +
      (ctx === 'w' ? '' : '<div class="po-sel" id="po-sel-' + ctx + '"></div>') +
      '</div>';
    const q = d.querySelector('.po-q'), res = d.querySelector('.po-res');
    let t = null, turno = 0;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(correr, 250); });
    async function correr() {
      const mio = ++turno, txt = q.value;
      if (norm(txt).length < 3) { res.innerHTML = ''; return; }
      res.innerHTML = '<div class="po-hint">Buscando en Odoo…</div>';
      let lista;
      try { lista = await P.buscar(txt); } catch (e) { if (mio === turno) caida(ctx); return; }
      if (mio !== turno) return;
      if (P.cayo) { P.cayo = false; pintarAvisos(); }
      if (!lista.length) { res.innerHTML = '<div class="po-hint">Sin coincidencias en empleados activos. Revisa la ortografía o captura a mano.</div>'; return; }
      res.innerHTML = '<div class="po-lista">' + lista.map(e => {
        const ch = (!e.tiene_curp ? '<span class="po-chip bad">Sin CURP</span>' : (!e.curp_valida ? '<span class="po-chip bad">CURP inválida</span>' : '')) +
          (e.puesto ? '' : '<span class="po-chip warn">Sin puesto</span>');
        return '<button type="button" class="po-it" data-id="' + e.id + '"><span class="po-who"><b>' + esc(e.name) + '</b><span>' + esc(e.puesto || '—') + '</span>' +
          (ch ? '<span class="po-chips">' + ch + '</span>' : '') + '</span><span class="po-mas">＋</span></button>';
      }).join('') + '</div>';
      res.querySelectorAll('.po-it').forEach(b => b.addEventListener('click', async () => { await elegir(Number(b.dataset.id), ctx); q.value = ''; res.innerHTML = ''; }));
    }
    const m = d.querySelector('.po-manual');
    if (m) m.addEventListener('click', () => { document.querySelector('#s-inst .tab-row .tab').click(); setTimeout(() => document.getElementById('new-ap').focus(), 60); });
    return d;
  }
  // Seleccionados (Generar) o trabajadores del lote, con su estado
  function pintarSeleccion() {
    ['g', 'l'].forEach(ctx => {
      const el = document.getElementById('po-sel-' + ctx); if (!el) return;
      const lista = inst.workers.map((w, i) => ({ w, i })).filter(x => ctx === 'l' || inst.selWorkers.has(x.i));
      el.innerHTML = lista.length
        ? '<div class="po-hint">' + (ctx === 'g' ? 'Seleccionados para este DC-3:' : 'Trabajadores en la lista:') + '</div><div class="po-chips">' +
          lista.map(({ w }) => { const f = faltan(w); return '<span class="po-chip ' + (f.length ? 'bad' : 'ok') + '">' + (w.fuente === 'odoo' ? '🔗 ' : '✍️ ') + esc(w.name) + (f.length ? ' · ' + f.map(k => TXT[k]).join(', ') : '') + '</span>'; }).join('') + '</div>'
        : '<div class="po-hint">Aún no hay trabajadores. Búscalos aquí o captúralos a mano.</div>';
    });
  }

  // ── Envolturas de funciones existentes ──
  window.addWorker = function () {
    const ap = document.getElementById('new-ap').value.trim().toUpperCase();
    const am = document.getElementById('new-am').value.trim().toUpperCase();
    const nom = document.getElementById('new-nom').value.trim().toUpperCase();
    const curp = document.getElementById('new-curp').value.trim().toUpperCase();
    if (!ap) { toast('⚠️ Ingresa el apellido paterno'); return; }
    if (!nom) { toast('⚠️ Ingresa el nombre'); return; }
    if (curp.length !== 18) { toast('⚠️ CURP debe tener 18 caracteres'); return; }
    if (!CURP_RE.test(curp)) { toast('⚠️ La CURP no tiene el formato oficial'); return; }
    const w = { fuente: 'manual', ap, am, nom, curp, puesto: '', name: '' }; armarNombre(w);
    inst.workers.push(w);
    inst.selWorkers.add(inst.workers.length - 1);
    ['new-ap', 'new-am', 'new-nom', 'new-curp'].forEach(id => { document.getElementById(id).value = ''; });
    refrescar();
    toast('✅ Trabajador agregado');
  };

  window.renderWorkerList = function () {
    const el = document.getElementById('worker-list');
    if (!inst.workers.length) {
      el.innerHTML = '<p style="font-size:13px;color:var(--muted2);text-align:center;padding:16px">No hay trabajadores. Agrégalos arriba.</p>';
      return;
    }
    el.innerHTML = inst.workers.map((w, i) => {
      const f = faltan(w);
      const fix = f.length ? '<div class="po-fix" onclick="event.stopPropagation()">' +
        '<div class="po-fix-t">⛔ ' + f.map(k => TXT[k]).join(' y ').replace(/^./, c => c.toUpperCase()) + '. Complétalo para imprimir. Lo que captures aquí solo va al PDF; no se escribe en Odoo.' + (w.nombreOdoo && f.includes('nombre') ? ' En Odoo: «' + esc(w.nombreOdoo) + '».' : '') + '</div>' +
        (f.includes('nombre') ? '<div class="po-fix-g"><input data-i="' + i + '" data-k="ap" placeholder="Apellido paterno" value="' + esc(w.ap) + '"><input data-i="' + i + '" data-k="am" placeholder="Apellido materno" value="' + esc(w.am) + '"><input data-i="' + i + '" data-k="nom" placeholder="Nombre(s)" value="' + esc(w.nom) + '"></div>' : '') +
        (f.some(k => k.startsWith('curp')) ? '<div class="po-fix-g"><input data-i="' + i + '" data-k="curp" maxlength="18" placeholder="CURP (18 caracteres)" value="' + esc(w.curp) + '"></div>' : '') +
        '<button type="button" class="btn btn-s po-fix-ok" data-i="' + i + '">Guardar para este PDF</button></div>' : '';
      return '<div class="worker-row ' + (inst.selWorkers.has(i) ? 'sel' : '') + (f.length ? ' po-mal' : '') + '" onclick="toggleWorker(' + i + ')">' +
        '<div class="wr-chk">' + (inst.selWorkers.has(i) ? '✓' : '') + '</div>' +
        '<div class="wr-info"><strong>' + esc(w.name) + '</strong><span>' + esc(w.curp || '— sin CURP —') + '</span>' +
        '<span class="po-org">' + (w.fuente === 'odoo' ? '🔗 Odoo · ' + esc(w.puesto || 'sin puesto') : '✍️ Captura manual') + '</span>' + fix + '</div></div>';
    }).join('');
    el.querySelectorAll('.po-fix input').forEach(x => x.addEventListener('input', () => { x.value = x.value.toUpperCase(); }));
    el.querySelectorAll('.po-fix-ok').forEach(b => b.addEventListener('click', ev => {
      ev.stopPropagation();
      const i = Number(b.dataset.i), w = inst.workers[i], val = k => { const x = el.querySelector('.po-fix input[data-i="' + i + '"][data-k="' + k + '"]'); return x ? x.value.trim().toUpperCase() : null; };
      const c = { ap: val('ap'), am: val('am'), nom: val('nom'), curp: val('curp') };
      if (c.ap !== null && !c.ap) { toast('⚠️ Ingresa el apellido paterno'); return; }
      if (c.nom !== null && !c.nom) { toast('⚠️ Ingresa el nombre'); return; }
      if (c.curp !== null && c.curp.length !== 18) { toast('⚠️ CURP debe tener 18 caracteres'); return; }
      if (c.curp !== null && !CURP_RE.test(c.curp)) { toast('⚠️ La CURP no tiene el formato oficial'); return; }
      Object.keys(c).forEach(k => { if (c[k] !== null) w[k] = c[k]; });
      w.manual = true; armarNombre(w); refrescar(); toast('✅ Datos completados para este PDF');
    }));
  };
  const _toggle = window.toggleWorker;
  window.toggleWorker = function (i) { _toggle(i); pintarSeleccion(); renderGenSummary(); };

  const _validarGenerar = window.validarGenerar;
  window.validarGenerar = function () {
    const v = _validarGenerar();
    const malos = [...inst.selWorkers].map(i => inst.workers[i]).filter(w => w && faltan(w).length);
    if (!malos.length) return v;
    const err = malos.map(w => w.name + ': ' + faltan(w).map(k => TXT[k]).join(' y ') + ' (complétalo en Trabajadores)');
    return { ok: false, msg: malos.length + ' trabajador(es) con datos por completar', errores: err.concat(v.errores || []), ini: v.ini, fin: v.fin };
  };

  const _loteValidar = window._loteValidar;
  window._loteValidar = function () {
    const r = _loteValidar();
    lote.asg.forEach(a => {
      const w = inst.workers[a.empleado], f = w ? faltan(w) : [];
      if (f.length) r.porAsignacion[a.id].errores.unshift({ tipo: 'trabajador', texto: 'Faltan datos del trabajador (' + f.map(k => TXT[k]).join(' y ') + '). Complétalo en Trabajadores' });
    });
    r.conError = lote.asg.filter(a => r.porAsignacion[a.id].errores.length).length;
    return r;
  };
  const _renderLote = window.renderLote;
  window.renderLote = function () { _renderLote(); pintarSeleccion(); };

  // ── Descargas dentro del visor de artefactos de claude.ai ──
  // Ahí una descarga iniciada por la página (doc.save / <a download>) no hace nada; el visor
  // ofrece la capacidad «downloads», que pide confirmación al usuario. Fuera del visor
  // (archivo abierto directo en el navegador) se usa la descarga normal de producción.
  const blobs = new Map();
  const _crear = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (o) { const u = _crear(o); if (o instanceof Blob) blobs.set(u, o); return u; };
  let dl = null;
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('downloads').then(x => { dl = x; }).catch(() => {});
  }
  function guardar(nombre, blob) {
    return dl.save({ filename: nombre, data: blob }).then(() => toast('✅ ' + nombre), e => { if (e && e.code !== 'declined') toast('⚠️ No se pudo guardar: ' + (e.code || e.message)); });
  }
  const _click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (dl && this.download && blobs.has(this.href)) { guardar(this.download, blobs.get(this.href)); return; }
    return _click.apply(this, arguments);
  };
  // El PDF individual sale de doc.save(); se cambia SOLO ese método del documento ya armado
  // por el _docDC3 de producción, y solo dentro del visor.
  const _docDC3 = window._docDC3;
  window._docDC3 = function () {
    const doc = _docDC3.apply(this, arguments);
    if (dl) doc.save = function (nombre) { guardar(nombre, doc.output('blob')); return doc; };
    return doc;
  };
  // Ningún dato sale del archivo: GitHub y Railway quedan bloqueados aunque haya red.
  const _fetch = window.fetch;
  window.fetch = function (u) { const s = String(u && u.url || u); if (/github|railway\.app/i.test(s)) return Promise.reject(new Error('PROTOTIPO_SIN_RED')); return _fetch.apply(this, arguments); };

  // ── Prototipo: sin red, sesión demo, directo al Panel del Instructor ──
  window.checkVersion = async function () { updateStatusBar('ok'); const l = document.getElementById('sb-status'); if (l) l.textContent = 'PROTOTIPO · sin red'; };
  window.fetchAuthUsers = function () {};
  // El heartbeat real consulta GitHub cada 15 s y, sin red, cierra la sesión a los ~2 min: aquí no corre.
  window.startHeartbeat = function () { window.checkVersion(); };
  window.reconnectNow = function () { window.checkVersion(); };

  function montar() {
    document.getElementById('tp-workers').prepend(buscador('w', 'Buscar en Odoo', 'Empleados activos de SERVICIOS FTS. O captúralo a mano abajo.'));
    document.getElementById('tp-generate').prepend(buscador('g', 'Trabajadores', 'Busca en Odoo para agregar y seleccionar'));
    document.getElementById('tp-lote').prepend(buscador('l', 'Trabajadores', 'Busca en Odoo para agregarlos a la matriz'));
    const tira = document.createElement('div');
    tira.className = 'po-tira'; tira.id = 'po-tira';
    tira.innerHTML = '<span class="po-marca">PROTOTIPO · datos demo</span><span class="po-sw"><span>Odoo</span>' +
      '<button type="button" id="po-on" aria-pressed="true">Responde</button><button type="button" id="po-off" aria-pressed="false">No responde</button></span>';
    const si = document.getElementById('s-inst'); si.insertBefore(tira, si.firstChild);
    const sw = on => { P.responde = on; document.getElementById('po-on').setAttribute('aria-pressed', on); document.getElementById('po-off').setAttribute('aria-pressed', !on); };
    document.getElementById('po-on').addEventListener('click', () => sw(true));
    document.getElementById('po-off').addEventListener('click', () => sw(false));
    const marca = document.createElement('div'); marca.className = 'po-agua'; marca.textContent = 'PROTOTIPO · datos demo'; document.body.appendChild(marca);
    // «← Suite» se ve igual que en producción, pero aquí no hay Suite a la cual regresar.
    const suite = document.getElementById('btn-suite-global');
    if (suite) suite.addEventListener('click', ev => { ev.preventDefault(); toast('ℹ️ En el prototipo no hay Suite: es solo el módulo DC-3'); });
    pintarAvisos(); pintarSeleccion();
  }
  window.addEventListener('load', () => {
    montar();
    goInstPin();
    // Igual que el login de instructor de producción: listas pintadas y fechas de hoy por omisión.
    loadInstDashboard(); pintarSeleccion();
  });
})();
