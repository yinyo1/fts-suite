/* ═══════════════════════════════════════════════════════════════════════════
 * bancos/edo_resultados/calcular.js · Estado de resultados 2026 v1 (issue #348)
 *
 * Servicios FTS SA de CV (company_id = 1). Meses con banco: de enero al último estado validado;
 * el mes siguiente sólo con ventas. Todo SIN IVA. Determinista: mismos insumos → misma huella.
 * Sin montos ni cuentas en este archivo (repo público): todo dato llega en `insumos`, que arma el
 * workflow fts_bancos_estado_resultados leyendo la base por las vistas v_* (rol bancos_er, hereda
 * bancos_lector) y Odoo en SOLO LECTURA.
 *
 * Corre igual en node (require) y dentro de un Code node de n8n (new Function con module/exports).
 * Aritmética en CENTAVOS enteros; los dólares se convierten con el tipo de cambio de Odoo.
 *
 * Vistas: A (ventas confirmadas, Conmet por avance), B (A sin Conmet), C (facturado, sin Conmet),
 * D (escenarios de utilidad retenida: interactiva, sólo en el HTML, fuera de la huella).
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const VERSION = 'er-2026-v1.2';
const ANIO = '2026';
const NOMBRE_MES = { '01': 'ene', '02': 'feb', '03': 'mar', '04': 'abr', '05': 'may', '06': 'jun', '07': 'jul', '08': 'ago', '09': 'sep', '10': 'oct', '11': 'nov', '12': 'dic' };
const CONMET_SO = 'SO11771';                 // contrato Conmet (decisión de Esteban: renglón propio)
const PLANES_PROYECTO = [1, 18];             // planes analíticos de proyecto (CLAUDE.md §17, Frente A)
const VENTANA_CFDI_DIAS = 15;                // ajuste C
const VENTANA_DEVOLUCION_DIAS = 5;
const CUENTAS = ['General', 'Nomina', 'USD'];
const TODAS = { d1: true, d2: true, d3: true, d5: true, d6: true, d7: true, r1: true, r2: true };
// Catálogo de destinos de la Vista E (espejo de bancos.destinos_edo_resultados; se usa si la tabla llega vacía)
const DESTINOS_DEFECTO = [
  ['costo_proveedores', 'egreso', 'costo', 'Costo · proveedores', 'costo_prov', true, 'costo_proveedor'],
  ['costo_subcontratos', 'egreso', 'costo', 'Costo · subcontratos', 'costo_subcontratos', true, 'costo_subcontratos'],
  ['costo_nomina_proyectos', 'egreso', 'costo', 'Costo · nómina de proyectos', 'costo_nomina', true, 'nomina_proyectos'],
  ['costo_jeeves', 'egreso', 'costo', 'Costo · Jeeves', 'costo_jeeves', true, 'costo_jeeves_reclasificado'],
  ['costo_payana', 'egreso', 'costo', 'Costo · Payana', 'costo_payana_proy', true, 'costo_payana_proyecto'],
  ['costo_otros', 'egreso', 'costo', 'Costo · otros costos', 'costo_otros', true, 'costo_otros'],
  ['admin_nomina_comun', 'egreso', 'administrativo', 'Administrativo · nómina de cuentas comunes', 'ga_nomina_oficina', true, 'nomina_comun'],
  ['admin_renta', 'egreso', 'administrativo', 'Administrativo · renta', 'ga_admin_renta_oficina', true, 'admin_renta_oficina'],
  ['admin_software', 'egreso', 'administrativo', 'Administrativo · software', 'ga_admin_software', true, 'admin_software'],
  ['admin_servicios_oficina', 'egreso', 'administrativo', 'Administrativo · servicios de oficina', 'ga_admin_servicios_oficina', true, 'admin_servicios_oficina'],
  ['admin_contabilidad_legal', 'egreso', 'administrativo', 'Administrativo · contabilidad y legal', 'ga_admin_contabilidad_legal', true, 'admin_contabilidad_legal'],
  ['admin_comisiones', 'egreso', 'administrativo', 'Administrativo · comisiones bancarias', 'ga_admin_comisiones_bancarias', true, 'admin_comisiones_bancarias'],
  ['admin_otros', 'egreso', 'administrativo', 'Administrativo · otros administrativos', 'ga_admin_otros', true, 'admin_otros'],
  ['partidas', 'egreso', 'partidas', 'Partidas por identificar', 'partidas', true, 'partida_reclasificada'],
  ['fuera_prestamo', 'egreso', 'fuera', 'Fuera del resultado · pago de préstamo', null, false, 'excl_financiamiento'],
  ['fuera_devolucion_aportacion', 'egreso', 'fuera', 'Fuera del resultado · devolución de aportación a socios', null, false, 'excl_devolucion_aportacion'],
  ['fuera_traspaso', 'egreso', 'fuera', 'Fuera del resultado · traspaso entre cuentas propias', null, false, 'excl_traspaso'],
  ['fuera_activo_fijo', 'egreso', 'fuera', 'Fuera del resultado · activo fijo', null, false, 'activo_fijo'],
  ['fuera_anticipo_proveedor', 'egreso', 'fuera', 'Fuera del resultado · anticipo a proveedor', null, false, 'excl_anticipo_proveedor'],
  ['fuera_impuestos', 'egreso', 'fuera', 'Fuera del resultado · impuestos y cuotas (informativo)', null, false, 'impuestos_reclasificado'],
  ['fuera_sin_clasificar', 'egreso', 'fuera', 'Fuera del resultado · excluir sin clasificar', null, false, 'excl_sin_clasificar'],
  ['ingreso_cobro_cliente', 'ingreso', 'informativo', 'Informativo · cobro de cliente', null, false, 'info_cobro_cliente'],
  ['ingreso_anticipo_cliente', 'ingreso', 'informativo', 'Informativo · anticipo de cliente', null, false, 'info_anticipo_cliente'],
  ['ingreso_financiamiento', 'ingreso', 'fuera', 'Fuera del resultado · financiamiento recibido', null, false, 'info_entrada_financiamiento'],
  ['ingreso_aportacion_socio', 'ingreso', 'fuera', 'Fuera del resultado · aportación de socio', null, false, 'info_aportacion_socio'],
  ['ingreso_traspaso', 'ingreso', 'fuera', 'Fuera del resultado · traspaso propio', null, false, 'info_traspaso_recibido'],
  ['ingreso_devolucion', 'ingreso', 'fuera', 'Fuera del resultado · devolución', null, false, 'info_devolucion_recibida'],
  ['otros_ingresos', 'ingreso', 'otros_ingresos', 'Entra al resultado · otros ingresos', 'otros_ingresos', true, 'otros_ingresos'],
].map(([clave, tipo, seccion, etiqueta, renglon, entra, destino_motor], i) => ({ clave, tipo, seccion, etiqueta, renglon, entra, destino_motor, orden: i + 1 }));
function leerCatalogo(filas) {
  const xs = (filas && filas.length ? filas : DESTINOS_DEFECTO).filter(d => d.activo !== false && d.activo !== 'f');
  const C = {}; for (const d of ordenar(xs.map(d => Object.assign({}, d, { orden: Number(d.orden) || 0, entra: d.entra === true || d.entra === 't' })), 'orden', 'clave')) C[d.clave] = d;
  return C;
}
const UMBRAL_HORAS_MEDIDAS = 0.8;          // R1: un mes de una persona se toma como medido si ≥80 % de sus horas tiene proyecto o bolsa

// ── utilidades ───────────────────────────────────────────────────────────────
const cents = v => (v === null || v === undefined || v === '' || v === false) ? 0 : Math.round(Number(v) * 100);
const m2o = v => Array.isArray(v) ? { id: v[0], name: String(v[1] || '') }
  : (v && typeof v === 'object') ? { id: v.id, name: String(v.name || v.display_name || '') }
  : (v ? { id: v, name: '' } : { id: null, name: '' });
const dia = s => String(s || '').slice(0, 10);
const diasEntre = (a, b) => Math.round((Date.parse(dia(a) + 'T00:00:00Z') - Date.parse(dia(b) + 'T00:00:00Z')) / 86400000);
const fechaLocalMty = s => {                 // Odoo manda datetime UTC sin Z (CLAUDE.md §11 #1); Monterrey = UTC-6 sin horario de verano
  const t = Date.parse(String(s).replace(' ', 'T') + 'Z');
  return new Date(t - 6 * 3600000).toISOString().slice(0, 10);
};
const norm = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const fmt = c => {                            // centavos → '1,234,567.89' (sin signo de pesos, a propósito)
  const neg = c < 0; const a = Math.abs(Math.round(c)); const e = Math.floor(a / 100), d = a % 100;
  return (neg ? '-' : '') + String(e).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + String(d).padStart(2, '0');
};
const pct = (n, d) => d ? (Math.round(n * 10000 / d) / 100).toFixed(2) + '%' : 'n/a';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const csvCampo = v => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = filas => filas.map(f => f.map(csvCampo).join(',')).join('\n') + '\n';
const ordenar = (arr, ...claves) => arr.slice().sort((a, b) => { for (const k of claves) { const x = a[k], y = b[k]; if (x < y) return -1; if (x > y) return 1; } return 0; });
const mesSig = p => { const y = +p.slice(0, 4), m = +p.slice(5, 7); return m === 12 ? (y + 1) + '-01' : y + '-' + String(m + 1).padStart(2, '0'); };
const nombreMes = p => p === 'acum' ? 'Acumulado' : (NOMBRE_MES[p.slice(5)] + ' ' + p.slice(2, 4));
const enmascarar = s => String(s || '').replace(/\d{6,}/g, x => '…' + x.slice(-4));

// JSON canónico (llaves ordenadas) y SHA-256 en JS puro: el sandbox de n8n no expone crypto (CLAUDE.md §15)
function canon(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}
function sha256(texto) {
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const b = new TextEncoder().encode(texto);
  const l = b.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
  m.set(b); m[l] = 0x80;
  const bits = l * 8; for (let i = 0; i < 8; i++) m[n - 1 - i] = Math.floor(bits / Math.pow(2, 8 * i)) & 0xff;
  let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array(64), r = (x, k) => (x >>> k) | (x << (32 - k));
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, bb, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    H = [H[0] + a, H[1] + bb, H[2] + c, H[3] + d, H[4] + e, H[5] + f, H[6] + g, H[7] + h].map(x => x | 0);
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

// ── reglas editables (bancos.reglas_edo_resultados) ─────────────────────────
function compilarReglas(filas) {
  const R = [];
  for (const f of ordenar(filas || [], 'prioridad', 'id')) {
    let re = null; try { re = new RegExp(f.patron, 'i'); } catch (e) { re = null; }
    if (re) R.push({ id: f.id, prioridad: f.prioridad, destino: f.destino, campo: f.campo, re, subcategoria: f.subcategoria || null, patron: f.patron });
  }
  return {
    primera(destino, valores) {           // valores: {descripcion, proveedor_odoo, categoria, comercio_jeeves, cliente_odoo, plan_analitico}
      for (const r of R) if ((destino === null || r.destino === destino) && valores[r.campo] && r.re.test(valores[r.campo])) return r;
      return null;
    },
    primeraDe(destinos, valores) {
      for (const r of R) if (destinos.includes(r.destino) && valores[r.campo] && r.re.test(valores[r.campo])) return r;
      return null;
    },
    todas: R,
  };
}

// ── tipo de cambio USD→MXN (Odoo res.currency.rate; FIX de Banxico no alcanzable: SUPUESTO S1) ──
function crearTC(tasas) {
  const T = ordenar((tasas || []).map(t => ({ d: dia(t.name), v: Number(t.inverse_company_rate) || (Number(t.rate) ? 1 / Number(t.rate) : 0) }))
    .filter(t => t.v > 0), 'd');
  return fecha => {
    let v = null; for (const t of T) { if (t.d <= dia(fecha)) v = t; else break; }
    if (!v) v = T[0];
    return v ? { tc: Math.round(v.v * 1e6) / 1e6, fecha_tc: v.d } : { tc: 0, fecha_tc: null };
  };
}

// ── parámetros editables (bancos.er_parametros) ─────────────────────────────
function leerParametros(filas) {
  const P = { depreciacion_vehiculos_anual_pct: 25, umbral_partida_por_identificar_mxn: 100000, casa_cambio_ventana_dias: 5,
    casa_cambio_tolerancia_pct: 3, conmet_costo_total_estimado_mxn: null, correo_umbral_cambio_utilidad_pct: 1 };
  for (const f of (filas || [])) if (f && f.clave in P) P[f.clave] = (f.valor === null || f.valor === undefined || f.valor === '') ? null : Number(f.valor);
  return P;
}

// ════════════════════════════════════════════════════════════════════════════
// MOTOR: clasifica cada movimiento. F = decisiones D1..D7 encendidas (todas en el v1; apagadas = reglas del v0)
function motor(ins, F) {
  const O = ins.odoo || {};
  const P = leerParametros(ins.parametros);
  const reglas = compilarReglas(ins.reglas);
  const tcDe = crearTC(O.tc);
  const aMXN = (c, moneda, fecha) => {
    if (moneda !== 'USD') return { mxn: c, tc: null, fecha_tc: null };
    const t = tcDe(fecha); return { mxn: Math.round(c * t.tc), tc: t.tc, fecha_tc: t.fecha_tc };
  };

  // ── meses: de enero al último estado validado; el siguiente sólo con ventas ──
  const estados = (ins.estados || []).filter(e => String(e.periodo).slice(0, 4) === ANIO);
  const ultimo = estados.reduce((m, e) => e.periodo > m ? e.periodo : m, ANIO + '-01');
  const MESES = []; for (let p = ANIO + '-01'; p <= ultimo; p = mesSig(p)) MESES.push(p);
  const MV = mesSig(ultimo).slice(0, 4) === ANIO ? mesSig(ultimo) : null;       // mes de ventas sin banco
  const rojos = new Set((ins.auditoria || []).filter(a => a.rojo === true || a.rojo === 't').map(a => String(a.estado_id)));
  const hay = {}; for (const e of estados) hay[e.alias + '|' + e.periodo] = e;
  const cobertura = {};
  for (const p of MESES) {
    const faltan = CUENTAS.filter(a => !hay[a + '|' + p]);
    const enRevision = estados.filter(e => e.periodo === p && rojos.has(String(e.estado_id))).map(e => e.alias);
    let estado = 'completo', nota = '';
    if (faltan.includes('General') || faltan.includes('USD')) { estado = 'INCOMPLETO'; nota = 'faltan: ' + faltan.join(', ') + '. No se estima.'; }
    else if (faltan.includes('Nomina')) nota = 'falta el estado de Nómina; la nómina sale de los fondeos desde la General, que sí está.';
    if (enRevision.length) { estado = estado === 'INCOMPLETO' ? 'INCOMPLETO' : 'EN REVISIÓN'; nota = (nota ? nota + ' ' : '') + 'En revisión por el auditor: ' + enRevision.join(', ') + '.'; }
    cobertura[p] = { estado, faltan, nota, en_revision: enRevision };
  }

  // ── Odoo: facturas de proveedor, líneas, analíticas ──
  const analitica = {};
  for (const a of (O.analiticas || [])) analitica[String(a.id)] = { plan: m2o(a.root_plan_id).id || m2o(a.plan_id).id, nombre: a.name, creada: dia(a.create_date) };
  const facturas = {}; const facturaPorNombre = {};
  for (const f of (O.facturas || [])) {
    const cur = m2o(f.currency_id).name || 'MXN', p = m2o(f.partner_id);
    const x = { id: f.id, name: f.name, move_type: f.move_type, partner: p.name, partner_id: p.id, moneda: /USD/.test(cur) ? 'USD' : 'MXN',
      total: cents(f.amount_total), sin_iva: cents(f.amount_untaxed), invoice_date: dia(f.invoice_date), date: dia(f.date), proyecto: false, planes: [], cuentasProyecto: [] };
    facturas[f.id] = x; if (f.name) facturaPorNombre[f.name] = x;
  }
  for (const l of (O.lineas || [])) {
    const f = facturas[m2o(l.move_id).id]; if (!f) continue;
    let ad = l.analytic_distribution; if (typeof ad === 'string') { try { ad = JSON.parse(ad); } catch (e) { ad = null; } }
    if (!ad || typeof ad !== 'object') continue;
    for (const k of Object.keys(ad)) for (const id of k.split(',')) {
      const a = analitica[id.trim()]; if (!a) continue;
      if (!f.planes.includes(a.plan)) f.planes.push(a.plan);
      if (PLANES_PROYECTO.includes(a.plan)) { f.proyecto = true; if (!f.cuentasProyecto.includes(id.trim())) f.cuentasProyecto.push(id.trim()); }
    }
  }
  for (const f of Object.values(facturas)) { f.planes.sort((a, b) => a - b); f.cuentasProyecto.sort(); }
  // R2: reparto analítico de la factura por subtotal de línea: proyecto (plan 1/18), común (plan 2) o ninguna.
  // El plan 20 (rubro) no es ni proyecto ni común: se ignora. Otros planes (activos, combustible, flota…) cuentan como «ninguna» (SUPUESTO S23).
  for (const f of Object.values(facturas)) f.dist = { p: 0, c: 0, n: 0 };
  for (const l of (O.lineas || [])) {
    const f = facturas[m2o(l.move_id).id]; if (!f) continue;
    const w = Math.abs(cents(l.price_subtotal)); if (!w) continue;
    let ad = l.analytic_distribution; if (typeof ad === 'string') { try { ad = JSON.parse(ad); } catch (e) { ad = null; } }
    const partes = [];
    if (ad && typeof ad === 'object') for (const k of Object.keys(ad)) {
      const pl = k.split(',').map(id => (analitica[id.trim()] || {}).plan);
      const c = pl.some(x => PLANES_PROYECTO.includes(x)) ? 'p' : pl.includes(2) ? 'c' : pl.every(x => x === 20) ? null : 'n';
      if (c) partes.push([c, Number(ad[k]) || 0]);
    }
    const tot = partes.reduce((a, x) => a + x[1], 0);
    if (!tot) { f.dist.n += w; continue; }
    for (const [c, v] of partes) f.dist[c] += w * v / tot;
  }
  // proyecto vendido antes del año: todas sus cuentas analíticas de proyecto nacieron antes del 1-ene (SUPUESTO S17)
  const proyectoPrevio = f => !!(f && f.cuentasProyecto.length && f.cuentasProyecto.every(id => (analitica[id].creada || '9999') < ANIO + '-01-01'));
  const ratio = f => (f && f.total > 0) ? { num: f.sin_iva, den: f.total } : null;
  const aplicarRatio = (c, r) => r ? Math.round(c * r.num / r.den) : c;
  const billDe = (...ss) => { for (const s of ss) { const x = String(s || '').match(/BILL\d+/); if (x) return x[0]; } return null; };

  // pagos registrados en Odoo (journal 8 General, 75 USD) ligados a una factura BILL
  const pagosOdoo = (O.pagos || []).map(p => {
    const j = m2o(p.journal_id).id, bill = billDe(p.ref, p.name, m2o(p.move_id).name);
    return { id: p.id, journal: j, fecha: dia(p.date), monto: j === 75 ? -cents(p.amount_currency) : -cents(p.balance), bill, factura: bill ? facturaPorNombre[bill] || null : null };
  }).filter(p => p.monto > 0 && p.factura);
  const pagoUsado = new Set(), facturaUsada = new Set();
  function buscarCFDI(m) {
    const jr = m.alias === 'USD' ? 75 : 8;
    let cand = pagosOdoo.filter(p => !pagoUsado.has(p.id) && p.journal === jr && p.monto === m.cargo_nat && Math.abs(diasEntre(p.fecha, m.fecha)) <= VENTANA_CFDI_DIAS);
    if (cand.length) {
      cand = ordenar(cand.map(p => ({ p, dd: Math.abs(diasEntre(p.fecha, m.fecha)), id: p.id })), 'dd', 'id');
      const p = cand[0].p; pagoUsado.add(p.id);
      return { via: 'pago_odoo', factura: p.factura, ref_odoo: 'account.move.line ' + p.id + ' · ' + p.bill };
    }
    const mon = m.alias === 'USD' ? 'USD' : 'MXN', txt = norm(m.descripcion);
    let fc = Object.values(facturas).filter(f => f.move_type === 'in_invoice' && !facturaUsada.has(f.id) && f.moneda === mon && f.total === m.cargo_nat &&
      (Math.abs(diasEntre(f.invoice_date, m.fecha)) <= VENTANA_CFDI_DIAS || Math.abs(diasEntre(f.date, m.fecha)) <= VENTANA_CFDI_DIAS));
    if (fc.length) {
      fc = ordenar(fc.map(f => {
        const tok = norm(f.partner).split(/[^A-Z0-9]+/).filter(t => t.length >= 4);
        return { f, nom: tok.some(t => txt.includes(t)) ? 0 : 1, dd: Math.min(Math.abs(diasEntre(f.invoice_date, m.fecha)), Math.abs(diasEntre(f.date, m.fecha))), id: f.id };
      }), 'nom', 'dd', 'id');
      const f = fc[0].f; facturaUsada.add(f.id);
      return { via: 'monto_fecha', factura: f, ref_odoo: 'account.move ' + f.id + ' · ' + f.name };
    }
    return null;
  }

  // ── personal de oficina (D1) ──
  const oficina = (ins.nomina_oficina || []).map(o => ({ nombre: norm(o.beneficiario || '').replace(/\s+/g, ' ').trim(), mask: String(o.cuenta_mask || '').trim(),
    desde: dia(o.vigente_desde) || '0000-00-00', hasta: dia(o.vigente_hasta) || '9999-12-31' }));
  const esOficina = (texto, fecha) => {
    if (!F.d1 || F.r1 || !oficina.length) return false;
    const t = norm(texto).replace(/\s+/g, ' '), nums = (String(texto).match(/\d{10,18}/g) || []);
    return oficina.some(o => fecha >= o.desde && fecha <= o.hasta && ((o.nombre && t.includes(o.nombre)) || (o.mask && nums.some(n => n.slice(-4) === o.mask))));
  };

  // ── decisiones de Esteban sobre partidas (bancos.partidas_identificadas) ──
  const decision = {};
  for (const d of (ins.partidas || [])) if (d.movimiento_hash && d.clasificacion) decision[d.movimiento_hash] = { clasificacion: d.clasificacion, nota: d.nota || '' };
  const yaListadas = new Set((ins.partidas || []).map(d => d.movimiento_hash));

  // ── movimientos bancarios ──
  const banco = ordenar((ins.banco || []).map(r => ({
    id: r.movimiento_id, hash: r.hash, alias: r.alias, mask: r.numero_mask || '', moneda: r.moneda, periodo: r.periodo, fecha: dia(r.fecha), renglon: Number(r.renglon) || 0,
    codigo: r.codigo || '', descripcion: String(r.descripcion || ''), referencia: String(r.referencia || ''), cargo_nat: cents(r.cargo), abono_nat: cents(r.abono),
    categoria: r.categoria || '', subcategoria: r.subcategoria || '', ti: r.es_traspaso_interno === true || r.es_traspaso_interno === 't',
    archivo: r.archivo, pagina: r.pagina, sha256: r.sha256,
  })).filter(r => MESES.includes(r.periodo)), 'fecha', 'renglon', 'id');
  for (const r of banco) {
    const c = aMXN(r.cargo_nat || r.abono_nat, r.moneda, r.fecha); r.tc = c.tc; r.fecha_tc = c.fecha_tc;
    r.cargo = r.cargo_nat ? aMXN(r.cargo_nat, r.moneda, r.fecha).mxn : 0; r.abono = r.abono_nat ? aMXN(r.abono_nat, r.moneda, r.fecha).mxn : 0;
  }

  // devoluciones SPEI: un abono "DEVUELTO" regresa un cargo del mismo monto en los 5 días previos
  const devueltos = new Set(), abonoDevolucion = new Set();
  const tokDev = t => { const x = norm(t).match(/SPEI (?:ENVIADO|DEVUELTO)\s*([A-Z]+)[^0-9]*(\d{7})/); return x ? x[1] + '|' + x[2] : null; };
  for (const a of banco.filter(x => x.abono_nat > 0 && (/DEVUELTO/i.test(x.descripcion) || x.codigo === 'T22'))) {
    const c = banco.filter(x => x.alias === a.alias && x.cargo_nat === a.abono_nat && !devueltos.has(x.id) && diasEntre(a.fecha, x.fecha) >= 0 && diasEntre(a.fecha, x.fecha) <= VENTANA_DEVOLUCION_DIAS);
    const ta = tokDev(a.descripcion);
    if (c.length) { const x = ordenar(c.map(v => ({ v, tok: ta && tokDev(v.descripcion) === ta ? 0 : 1, dd: diasEntre(a.fecha, v.fecha), id: v.id })), 'tok', 'dd', 'id')[0].v; devueltos.add(x.id); abonoDevolucion.add(a.id); }
  }
  const entradaUsada = new Set();

  const items = [];
  const push = o => { items.push(o); return o; };

  // ── Vista E: capa de reclasificación (los datos bancarios no se tocan) ──
  // Prioridad: reclasificación vigente del movimiento > regla de Esteban > reglas del v1 > clasificación del servicio.
  const CAT = leerCatalogo(ins.destinos);
  const RM = {};
  for (const r of (ins.reclasificaciones || [])) {
    if (r.tipo !== 'movimiento' || r.vigente === false || r.vigente === 'f' || !r.movimiento_id) continue;
    (RM[r.movimiento_id] || (RM[r.movimiento_id] = [])).push(r);
  }
  const reclasInvalidas = [];
  const compatible = (clave, tipo) => CAT[clave] && ((tipo === 'abono') === (CAT[clave].tipo === 'ingreso'));
  function override(key, v, tipo) {
    const xs = RM[key];
    if (xs && xs.length) {
      const partes = ordenar(xs.map(r => ({ parte: Number(r.parte) || 1, clave: r.destino, pct: Number(r.porcentaje), proyecto: r.proyecto || '', nota: r.nota || '' })), 'parte');
      const suma = partes.reduce((a, x) => a + x.pct, 0);
      if (partes.every(x => compatible(x.clave, tipo)) && Math.abs(suma - 100) < 1e-6 && partes.length <= 5)
        return { fuente: 'movimiento', partes, archivo: xs[0].archivo_origen || '', aplicada_en: String(xs[0].aplicada_en || '').slice(0, 16), lote: xs[0].lote || '' };
      reclasInvalidas.push({ mov: key, motivo: 'partes o destino inválidos' });
    }
    for (const r of reglas.todas) if (r.destino === 'reclasificacion' && v[r.campo] && r.re.test(v[r.campo]) && compatible(r.subcategoria, tipo))
      return { fuente: 'regla', partes: [{ parte: 1, clave: r.subcategoria, pct: 100, proyecto: '', nota: '' }], regla_id: r.id };
    return null;
  }
  const destinoDeCatalogo = (clave, o) => { const d = CAT[clave].destino_motor; return d === 'costo_proveedor' ? (o.cfdi ? 'costo_proveedor_con_cfdi' : 'costo_proveedor_sin_cfdi') : d; };
  function emitirReclas(o, ov) {
    let rb = o.bruto, rn = o.neto;
    ov.partes.forEach((x, k) => {
      const ult = k === ov.partes.length - 1;
      const b = ult ? rb : Math.round(o.bruto * x.pct / 100), n = ult ? rn : Math.round(o.neto * x.pct / 100); rb -= b; rn -= n;
      const destino = destinoDeCatalogo(x.clave, o);
      push(Object.assign({}, o, { id: o.id + (ov.partes.length > 1 ? '#r' + x.parte : ''), destino, bruto: b, neto: n, destino_v1: o.destino, regla_v1: o.regla,
        regla: 'reclasificación de Esteban (' + (ov.fuente === 'movimiento' ? 'archivo ' + ov.archivo + ', ' + ov.aplicada_en : 'regla ' + ov.regla_id) + ') · antes: ' + o.destino,
        reclas: { fuente: ov.fuente, clave: x.clave, pct: x.pct, parte: x.parte, partes: ov.partes.length, proyecto: x.proyecto, nota: x.nota, archivo: ov.archivo || '', aplicada_en: ov.aplicada_en || '', regla_id: ov.regla_id || null } }));
      if (destino === 'activo_fijo' && o.destino !== 'activo_fijo') activos.push({ periodo: o.periodo, base: n, ref: o.id, concepto: o.concepto });
    });
  }
  const conOverride = (o, v) => { const ov = override(o.mov, v, o.tipo_mov); if (ov) { emitirReclas(o, ov); return true; } push(o); return false; };
  const itemizados = new Set();
  const itemBanco = (m, destino, extra) => {
    itemizados.add(m.id);
    const o = Object.assign({
      fuente: 'banco', id: 'mov ' + m.id, mov_id: m.id, hash: m.hash, mov: 'b:' + m.hash, tipo_mov: m.cargo_nat > 0 ? 'cargo' : 'abono', periodo: m.periodo, fecha: m.fecha, renglon: m.renglon, cuenta: m.alias, mask: m.mask, moneda: m.moneda,
      monto_nat: m.cargo_nat || m.abono_nat, tc: m.tc, bruto: m.cargo || m.abono, neto: m.cargo || m.abono, destino, concepto: m.descripcion,
      archivo: m.archivo, pagina: m.pagina, sha256: m.sha256, cfdi: null, proveedor: '', regla: null, conmet: false, previo: false, iva_estimado: false,
    }, extra || {});
    o.contraparte = o.proveedor || '';
    conOverride(o, { contraparte: o.contraparte, descripcion: m.descripcion + ' ' + m.referencia });
    return o;
  };
  const itemAjuste = (periodo, destino, monto, concepto, extra) => push(Object.assign({ fuente: 'ajuste', id: 'ajuste ' + destino + ' ' + periodo + ' ' + (extra && extra.ref || ''),
    periodo, fecha: periodo + '-01', renglon: 0, cuenta: 'cálculo', mask: '', moneda: 'MXN', monto_nat: monto, tc: null, bruto: monto, neto: monto, destino, concepto,
    archivo: null, pagina: null, sha256: null, cfdi: null, proveedor: '', regla: 'cálculo', conmet: false, previo: false, iva_estimado: false }, extra || {}));

  const candidatasPartida = [];
  // R2: parte un monto según el reparto analítico de su factura (resto al último para cuadrar al centavo)
  const partirPorAnalitica = (f, monto) => {
    const d = f && f.dist; const t = d ? d.p + d.c + d.n : 0;
    if (!t) return { p: 0, c: 0, n: monto };
    const pp = Math.round(monto * d.p / t), cc = Math.round(monto * d.c / t);
    return { p: pp, c: cc, n: monto - pp - cc };
  };
  const activos = [];

  // ── R1: reparto de la nómina por dónde carga horas cada persona ──
  function repartirNomina() {
    const NOM = ['nomina_fondeo', 'nomina_directa', 'nomina_fondeo_lado_nomina', 'nomina_oficina'];
    const emp = {}; for (const e of (O.empleados || [])) emp[e.id] = { id: e.id, nombre: String(e.name || ''), activo: e.active === true || e.active === 't', creado: dia(e.create_date) };
    const H = {}, MO = {}, mesesMO = new Set(), conHoras = new Set();
    for (const a of (O.asistencias || [])) {
      const e = m2o(a.employee_id).id; if (!e) continue;
      const mes = fechaLocalMty(a.check_in).slice(0, 7), h = Number(a.worked_hours) || 0; if (h <= 0) continue;
      const k = e + '|' + mes, o = H[k] || (H[k] = { t: 0, p: 0, c: 0 }); conHoras.add(e);
      o.t += h; if (a.x_studio_sales_order_2) o.p += h; else if (a.x_studio_many2one_field_GUbBF) o.c += h;
      if (!emp[e]) emp[e] = { id: e, nombre: m2o(a.employee_id).name, activo: true, creado: '' };
    }
    for (const l of (O.carga_mo || [])) {
      const x = String(l.name || '').match(/^MO S(\d+)\/2026 · emp(\d+) · ([PB])/); if (!x) continue;
      const e = +x[2], mes = dia(l.date).slice(0, 7), a = Math.abs(cents(l.amount)); if (!a) continue;
      const k = e + '|' + mes, o = MO[k] || (MO[k] = { t: 0, p: 0 }); o.t += a; if (x[3] === 'P' && l.account_id) o.p += a;
      mesesMO.add(mes); conHoras.add(e);
      if (!emp[e]) emp[e] = { id: e, nombre: 'empleado ' + e, activo: true, creado: '' };
    }
    const forzado = (e, mes) => oficina.some(o => o.nombre && norm(emp[e].nombre).replace(/\s+/g, ' ').includes(o.nombre) && (mes + '-31') >= o.desde && (mes + '-01') <= o.hasta);
    const medido = (e, mes) => {
      if (forzado(e, mes)) return { pct: 0, fuente: 'corrección manual (bancos.nomina_oficina)' };
      const mo = MO[e + '|' + mes]; if (mo && mo.t > 0) return { pct: mo.p / mo.t, fuente: 'Carga MO' };
      const h = H[e + '|' + mes]; if (h && h.t > 0 && (h.p + h.c) > 0 && (h.p + h.c) >= h.t * UMBRAL_HORAS_MEDIDAS) return { pct: h.p / (h.p + h.c), fuente: 'horas' };
      return null;
    };
    const todosMeses = Array.from(new Set(Object.keys(H).concat(Object.keys(MO)).map(k => k.split('|')[1]))).sort();
    const hist = {}; let gN = 0, gD = 0;
    for (const e of Object.keys(emp)) {
      const ms = todosMeses.map(mes => medido(e, mes)).filter(Boolean);
      if (ms.length) { hist[e] = ms.reduce((a, x) => a + x.pct, 0) / ms.length; }
    }
    for (const k of Object.keys(H)) { const h = H[k]; if ((h.p + h.c) >= h.t * UMBRAL_HORAS_MEDIDAS && h.p + h.c > 0) { gN += h.p; gD += h.p + h.c; } }
    // ventana de cada persona (primer y último mes con horas o Carga MO) y sus horas promedio por mes con datos
    const ventana = {};
    for (const k of Object.keys(H).concat(Object.keys(MO))) {
      const [e, mes] = k.split('|'); const v = ventana[e] || (ventana[e] = { ini: mes, fin: mes, meses: new Set(), horas: 0 });
      if (mes < v.ini) v.ini = mes; if (mes > v.fin) v.fin = mes; v.meses.add(mes);
    }
    for (const k of Object.keys(H)) { const e = k.split('|')[0]; ventana[e].horas += H[k].t; }
    const global = gD ? gN / gD : 1;
    const out = {};
    for (const mes of MESES) {
      const N = items.filter(i => i.fuente === 'banco' && NOM.includes(i.destino) && i.periodo === mes).reduce((a, i) => a + i.bruto, 0);
      const miembros = Object.keys(emp).filter(e => (H[e + '|' + mes] && H[e + '|' + mes].t > 0) || (MO[e + '|' + mes] && MO[e + '|' + mes].t > 0));
      // en nómina pero sin horas este mes (vacaciones, incapacidad…): dentro de su ventana y, si ya no está activa, antes de su último mes con datos
      const ausentes = Object.keys(emp).filter(e => !miembros.includes(e) && ventana[e] && ventana[e].ini <= mes && (emp[e].activo || ventana[e].fin >= mes));
      let rate = 0;
      if (mesesMO.has(mes)) { let a = 0, h = 0; for (const e of miembros) { const mo = MO[e + '|' + mes], hh = H[e + '|' + mes]; if (mo && hh) { a += mo.t; h += hh.t; } } rate = h ? a / h : 0; }
      const personas = miembros.map(e => {
        const mo = MO[e + '|' + mes], hh = H[e + '|' + mes] || { t: 0 };
        const w = mo ? mo.t : (rate ? hh.t * rate : hh.t);
        const m1 = medido(e, mes);
        const r = m1 ? Object.assign({ tipo: 'medido' }, m1) : (e in hist ? { pct: hist[e], fuente: 'estimado por historial', tipo: 'historial' } : { pct: global, fuente: 'estimado con el % global', tipo: 'global' });
        return { id: +e, nombre: emp[e].nombre, horas: Math.round(hh.t * 100) / 100, peso: w, pct: r.pct, fuente: r.fuente, tipo: r.tipo };
      }).concat(ausentes.map(e => {
        const hp = ventana[e].horas / Math.max(1, ventana[e].meses.size), w = rate ? hp * rate : hp;
        const r = forzado(e, mes) ? { pct: 0, fuente: 'corrección manual (bancos.nomina_oficina)', tipo: 'medido' } : (e in hist ? { pct: hist[e], fuente: 'sin horas este mes · estimado por historial', tipo: 'historial' } : { pct: global, fuente: 'sin horas este mes · estimado con el % global', tipo: 'global' });
        return { id: +e, nombre: emp[e].nombre, horas: 0, peso: w || 1, pct: r.pct, fuente: r.fuente, tipo: r.tipo };
      }));
      const W0 = personas.reduce((a, x) => a + x.peso, 0), wProm = personas.length ? W0 / personas.length : 0;
      const sinHoras = Object.keys(emp).filter(e => !conHoras.has(+e) && !conHoras.has(e) && emp[e].activo && (!emp[e].creado || emp[e].creado <= mes + '-31'))
        .map(e => ({ id: +e, nombre: emp[e].nombre, horas: 0, peso: wProm || 1, pct: 0, fuente: 'nunca ha cargado horas', tipo: 'sin_horas' }));
      const todos = personas.concat(sinHoras), W = todos.reduce((a, x) => a + x.peso, 0);
      let costo, sin;
      if (W > 0) { costo = Math.round(N * personas.reduce((a, x) => a + x.peso * x.pct, 0) / W); sin = Math.round(N * sinHoras.reduce((a, x) => a + x.peso, 0) / W); }
      else { costo = Math.round(N * global); sin = 0; }
      const comun = N - costo - sin;
      const medidoW = personas.filter(x => x.tipo === 'medido').reduce((a, x) => a + x.peso, 0);
      out[mes] = { N, costo, comun, sin, pct_proyecto: N ? costo / N : 0, personas: ordenar(todos, 'nombre', 'id'), estimado: medidoW === 0,
        cuenta: { medido: personas.filter(x => x.tipo === 'medido').length, historial: personas.filter(x => x.tipo === 'historial').length, global: personas.filter(x => x.tipo === 'global').length, sin_horas: sinHoras.length },
        base: mesesMO.has(mes) ? 'Carga MO (monto por persona)' : 'horas de asistencia', global };
      const et = ' · reparto R1 (' + out[mes].base + (out[mes].estimado ? ', mes estimado' : '') + ')';
      if (costo) itemAjuste(mes, 'nomina_proyectos', costo, 'nómina × % a proyecto' + et, { ref: 'r1' });
      if (comun) itemAjuste(mes, 'nomina_comun', comun, 'nómina × % común' + et, { ref: 'r1' });
      if (sin) itemAjuste(mes, 'nomina_sin_horas', sin, 'nómina de personas sin horas cargadas' + et, { ref: 'r1' });
    }
    out.global = global;
    return out;
  }

  // ── cargos del banco ──
  for (const m of banco.filter(x => x.cargo_nat > 0)) {
    const v = { descripcion: m.descripcion + ' ' + m.referencia, categoria: m.categoria, proveedor_odoo: '' };
    let r;
    if (m.alias === 'Nomina') {
      itemBanco(m, 'excl_cubierto_fondeo_nomina', { regla: 'cuenta Nómina: la cubren los fondeos desde la General (ajuste B)', oficina: esOficina(v.descripcion, m.fecha) });
      continue;
    }
    if (devueltos.has(m.id)) { itemBanco(m, 'excl_devolucion', { regla: 'devuelto por el banco (SPEI DEVUELTO)' }); continue; }
    const dec = F.d5 ? decision[m.hash] : null;
    if (dec && dec.clasificacion !== 'costo') {
      const map = { pago_prestamo: 'excl_financiamiento', devolucion_aportacion: 'excl_financiamiento', traspaso_propio: 'excl_traspaso', otro: 'partida_otro' };
      itemBanco(m, map[dec.clasificacion], { regla: 'decisión de Esteban: ' + dec.clasificacion + (dec.nota ? ' · ' + dec.nota : ''), decidida: dec.clasificacion });
      continue;
    }
    if ((r = reglas.primera('excluir_fondeo_payana', v))) { itemBanco(m, 'excl_fondeo_payana', { regla: 'regla ' + r.id }); continue; }
    if ((r = reglas.primera('excluir_fondeo_jeeves', v))) { itemBanco(m, 'excl_fondeo_jeeves', { regla: 'regla ' + r.id }); continue; }
    if (m.ti && /NOMINA/.test(norm(m.subcategoria))) { itemBanco(m, 'nomina_fondeo', { regla: 'traspaso General→Nómina emparejado por el servicio' }); continue; }
    if ((r = reglas.primera('excluir_traspaso', v)) || m.ti) { itemBanco(m, 'excl_traspaso', { regla: r ? 'regla ' + r.id : 'traspaso interno (servicio)' }); continue; }
    if ((r = reglas.primera('excluir_financiamiento', v)) || m.categoria === 'credito_financiamiento') { itemBanco(m, 'excl_financiamiento', { regla: r ? 'regla ' + r.id : 'categoría crédito/financiamiento' }); continue; }
    if ((r = reglas.primera('impuestos_cuotas', v))) { itemBanco(m, 'impuestos_' + (r.subcategoria || 'otros'), { regla: 'regla ' + r.id }); continue; }
    if (F.d6 && (r = reglas.primera('casa_cambio', v))) {
      // traspaso propio si hay una entrada equivalente (±ventana días, ±tolerancia %) en otra cuenta propia
      const tol = (P.casa_cambio_tolerancia_pct || 0) / 100, ven = P.casa_cambio_ventana_dias || 0;
      const e = ordenar(banco.filter(x => x.abono_nat > 0 && x.alias !== m.alias && !entradaUsada.has(x.id) && Math.abs(diasEntre(x.fecha, m.fecha)) <= ven &&
        Math.abs(x.abono - m.cargo) <= Math.round(m.cargo * tol)).map(x => ({ x, dd: Math.abs(diasEntre(x.fecha, m.fecha)), id: x.id })), 'dd', 'id')[0];
      if (e) { entradaUsada.add(e.x.id); itemBanco(m, 'excl_traspaso', { regla: 'casa de cambio con entrada equivalente (mov ' + e.x.id + ')' }); }
      else itemBanco(m, 'partida_por_identificar', { regla: 'regla ' + r.id + ': casa de cambio sin entrada equivalente', motivo_partida: 'casa_cambio' });
      continue;
    }
    if (m.alias === 'General' && (r = reglas.primera('nomina_directa', v))) {
      itemBanco(m, esOficina(v.descripcion, m.fecha) ? 'nomina_oficina' : 'nomina_directa', { regla: 'regla ' + r.id }); continue;
    }
    // egreso operativo: buscar su CFDI (ajuste C)
    const cf = buscarCFDI(m);
    const prov = cf ? cf.factura.partner : '';
    v.proveedor_odoo = prov;
    const rr = ratio(cf && cf.factura);
    const neto = rr ? aplicarRatio(m.cargo, rr) : m.cargo;
    const base = { cfdi: cf ? { via: cf.via, ref: cf.ref_odoo, factura: cf.factura.name, sin_iva_sobre_total: cf.factura.sin_iva + '/' + cf.factura.total } : null,
      proveedor: prov, neto, previo: proyectoPrevio(cf && cf.factura) };
    if (F.d6 && (r = reglas.primera('activo_fijo', v))) {
      itemBanco(m, 'activo_fijo', Object.assign(base, { regla: 'regla ' + r.id + ': activo fijo (fuera del resultado)' }));
      activos.push({ periodo: m.periodo, base: neto, ref: 'mov ' + m.id, concepto: m.descripcion });
      continue;
    }
    const rc = reglas.primera('conmet', v);
    if (rc) {
      let n = neto, cfd = base.cfdi;
      if (!cf) {   // anticipo sin factura exacta: IVA por la proporción de las facturas del proveedor del proyecto (SUPUESTO S7)
        const mon = m.alias === 'USD' ? 'USD' : 'MXN';
        const fs = Object.values(facturas).filter(f => f.move_type === 'in_invoice' && f.moneda === mon && reglas.todas.some(q => q.destino === 'conmet' && q.campo === 'proveedor_odoo' && q.re.test(f.partner)));
        const tot = fs.reduce((s, f) => s + f.total, 0), sin = fs.reduce((s, f) => s + f.sin_iva, 0);
        if (tot > 0) { n = Math.round(m.cargo * sin / tot); cfd = { via: 'proveedor_conmet', ref: fs.map(f => 'account.move ' + f.id + ' · ' + f.name).join(', '), factura: 'proporción de ' + fs.length + ' facturas', sin_iva_sobre_total: sin + '/' + tot }; }
      }
      itemBanco(m, 'costo_conmet', Object.assign(base, { neto: n, cfdi: cfd, conmet: true, regla: 'regla ' + rc.id })); continue;
    }
    const ra = reglas.primera('administrativo', v);
    if (ra) { itemBanco(m, 'admin_' + (ra.subcategoria || 'otros'), Object.assign(base, { regla: 'regla ' + ra.id })); continue; }
    if (!cf && F.d5 && m.cargo >= Math.round((P.umbral_partida_por_identificar_mxn || 0) * 100) && !(dec && dec.clasificacion === 'costo')) {
      itemBanco(m, 'partida_por_identificar', Object.assign(base, { regla: 'sin concepto ni CFDI desde el umbral (D5)', motivo_partida: 'sin_cfdi_grande' }));
      continue;
    }
    itemBanco(m, cf ? 'costo_proveedor_con_cfdi' : 'costo_proveedor_sin_cfdi', Object.assign(base, { regla: dec ? 'decisión de Esteban: costo' : 'costo por omisión (regla 2 de Esteban)' }));
  }
  for (const it of items) if (it.destino === 'partida_por_identificar' && !yaListadas.has(it.hash)) candidatasPartida.push({ movimiento_hash: it.hash, movimiento_id: it.mov_id, periodo: it.periodo });

  // nómina de meses sin estado de la General: fondeo leído del lado Nómina (dato real, no estimado). SUPUESTO S4
  for (const m of banco.filter(x => x.alias === 'Nomina' && x.abono_nat > 0 && x.ti && /NOMINA/.test(norm(x.subcategoria)))) {
    if (!cobertura[m.periodo].faltan.includes('General')) continue;
    itemBanco(m, 'nomina_fondeo_lado_nomina', { regla: 'mes sin estado de la General: fondeo leído en el estado de Nómina' });
  }
  // D1: la parte de oficina pagada desde la cuenta Nómina sale de la nómina de campo (ajuste que suma cero)
  const repartoNomina = F.r1 ? repartirNomina() : null;
  if (F.d1 && !F.r1) for (const p of MESES) {
    const x = items.filter(i => i.fuente === 'banco' && i.destino === 'excl_cubierto_fondeo_nomina' && i.oficina && i.periodo === p).reduce((s, i) => s + i.bruto, 0);
    if (x) { itemAjuste(p, 'nomina_oficina', x, 'nómina de oficina pagada desde la cuenta Nómina (D1)'); itemAjuste(p, 'nomina_fondeo', -x, 'se resta de la nómina de campo (D1)'); }
  }
  // abonos: todos quedan listados (Vista E); sólo algunos tienen renglón informativo
  for (const m of banco.filter(x => x.abono_nat > 0)) {
    if (itemizados.has(m.id)) continue;
    const v = { descripcion: m.descripcion + ' ' + m.referencia };
    if (m.categoria === 'credito_financiamiento') itemBanco(m, 'info_entrada_financiamiento', { regla: 'categoría crédito/financiamiento' });
    else if (abonoDevolucion.has(m.id)) itemBanco(m, 'info_devolucion_recibida', { regla: 'SPEI DEVUELTO' });
    else if (reglas.primera('conmet', v)) itemBanco(m, 'info_anticipo_conmet_cobrado', { regla: 'cobro del contrato Conmet', conmet: true, neto: Math.round(m.abono * 100 / 116) });
    else itemBanco(m, 'info_abono_sin_clasificar', { regla: m.ti ? 'traspaso entre cuentas propias (servicio)' : 'abono sin renglón (informativo; las ventas salen de Odoo)' });
  }

  // ── Jeeves: consumos de la tarjeta (diario 61) por tipo de comercio (D3) ──
  for (const j of ordenar(O.jeeves || [], 'date', 'id')) {
    const f = dia(j.date), p = f.slice(0, 7); if (!MESES.includes(p)) continue;
    const c = cents(j.amount), ref = String(j.payment_ref || '');
    const comercio = norm(ref.replace(/^\[[^\]]*\]\s*/, ''));
    const base = { fuente: 'odoo', id: 'account.bank.statement.line ' + j.id, periodo: p, fecha: f, renglon: 0, cuenta: 'Jeeves (diario 61)', mask: '', moneda: 'MXN', monto_nat: Math.abs(c), tc: null,
      concepto: ref, archivo: null, pagina: null, sha256: null, cfdi: null, proveedor: '', conmet: false, previo: false, iva_estimado: false,
      mov: 'j:' + j.id, tipo_mov: /\[FONDEO\]/i.test(ref) ? 'abono' : 'cargo', contraparte: ref.replace(/^\[[^\]]*\]\s*/, '') };
    const vE = { contraparte: base.contraparte, descripcion: ref };
    if (/\[FONDEO\]/i.test(ref)) { conOverride(Object.assign(base, { destino: 'info_fondeo_jeeves_odoo', bruto: Math.abs(c), neto: Math.abs(c), regla: 'fondeo registrado en Jeeves' }), vE); continue; }
    if (!F.d3) {
      if (c < 0) push(Object.assign(base, { destino: 'costo_jeeves', bruto: -c, neto: -c, regla: 'consumo de tarjeta (regla 3 de Esteban)' }));
      else push(Object.assign(base, { destino: 'costo_jeeves_devolucion', bruto: -c, neto: -c, regla: 'devolución de comercio' }));
      continue;
    }
    const vj = { comercio_jeeves: comercio };
    const ext = reglas.primera('jeeves_extranjero', vj);
    const bruto = -c, iva = b => ext ? b : Math.round(b * 100 / 116);        // IVA estimado (D3), sin cambio en R2
    const notaIva = ext ? ' · comercio extranjero, sin IVA' : ' · IVA estimado ÷1.16, sin CFDI';
    if (c > 0) { conOverride(Object.assign(base, { destino: 'costo_jeeves_devolucion', bruto, neto: iva(bruto), iva_estimado: !ext, regla: 'devolución de comercio' + notaIva }), vE); continue; }
    { const ov = override(base.mov, vE, 'cargo');
      if (ov) { emitirReclas(Object.assign({}, base, { destino: 'costo_jeeves (v1.1)', bruto, neto: iva(bruto), iva_estimado: !ext, regla: 'consumo de Jeeves' + notaIva }), ov); continue; } }
    // R2: primero la analítica de la factura con la que se concilió el consumo
    const fac = (F.r2 && (j.is_reconciled === true || j.is_reconciled === 't') && j.reconciled_lines_name) ? facturaPorNombre[String(j.reconciled_lines_name).match(/BILL\d+/) ? String(j.reconciled_lines_name).match(/BILL\d+/)[0] : ''] || null : null;
    const pz = F.r2 ? partirPorAnalitica(fac, bruto) : { p: 0, c: 0, n: bruto };
    const refF = fac ? ' · ' + fac.name : '';
    if (pz.p) push(Object.assign({}, base, { id: base.id + (pz.c || pz.n ? '#p' : ''), destino: 'costo_jeeves_proyecto', bruto: pz.p, neto: iva(pz.p), iva_estimado: !ext, via: 'analitica', proveedor: fac.partner, previo: proyectoPrevio(fac), regla: 'analítica de proyecto (plan 1/18) de la factura conciliada' + refF + notaIva }));
    if (pz.c) push(Object.assign({}, base, { id: base.id + (pz.p || pz.n ? '#c' : ''), destino: 'admin_jeeves_analitica_comun', bruto: pz.c, neto: iva(pz.c), iva_estimado: !ext, via: 'analitica', proveedor: fac.partner, regla: 'analítica común (plan 2) de la factura conciliada' + refF + notaIva }));
    if (pz.n) {
      const rj = reglas.primeraDe(['jeeves_costo', 'jeeves_admin'], vj);
      const destino = !rj ? 'costo_jeeves_sin_clasificar' : (rj.destino === 'jeeves_admin' ? 'admin_jeeves_' : 'costo_jeeves_') + (rj.subcategoria || 'otros');
      push(Object.assign({}, base, { id: base.id + (pz.p || pz.c ? '#n' : ''), destino, bruto: pz.n, neto: iva(pz.n), iva_estimado: !ext, via: rj ? 'regla' : 'sin_clasificar',
        regla: (rj ? 'regla ' + rj.id + (F.r2 ? ' · clasificado por regla, sin analítica' : '') : 'sin regla de comercio') + notaIva }));
    }
  }

  // ── Payana: pagos del diario 74 cotejados contra facturas de proveedor ──
  for (const y of ordenar(O.payana || [], 'date', 'id')) {
    const f = dia(y.date), p = f.slice(0, 7); if (!MESES.includes(p)) continue;
    const cr = cents(y.credit), db = cents(y.debit), prov = m2o(y.partner_id).name;
    const bill = billDe(y.ref, y.name, m2o(y.move_id).name), fac = bill ? facturaPorNombre[bill] || null : null;
    const base = { fuente: 'odoo', id: 'account.move.line ' + y.id, periodo: p, fecha: f, renglon: 0, cuenta: 'Payana (diario 74)', mask: '', moneda: 'MXN', monto_nat: cr || db, tc: null,
      concepto: [bill, prov].filter(Boolean).join(' · '), archivo: null, pagina: null, sha256: null, proveedor: fac ? fac.partner : prov, conmet: false, previo: proyectoPrevio(fac), iva_estimado: false,
      mov: 'y:' + y.id, tipo_mov: cr > 0 ? 'cargo' : 'abono', contraparte: fac ? fac.partner : prov };
    const vY = { contraparte: base.contraparte, descripcion: base.concepto };
    if (!(cr > 0)) { conOverride(Object.assign(base, { destino: 'info_payana_entrada', bruto: db, neto: db, cfdi: null, regla: 'entrada en Payana (no es pago)' }), vY); continue; }
    const rr = ratio(fac), neto = rr ? aplicarRatio(cr, rr) : cr;
    const cfdi = fac ? { via: 'factura_del_pago', ref: 'account.move ' + fac.id + ' · ' + fac.name, factura: fac.name, sin_iva_sobre_total: fac.sin_iva + '/' + fac.total } : null;
    { const ov = override(base.mov, vY, 'cargo');
      if (ov) { emitirReclas(Object.assign({}, base, { destino: 'payana (v1.1)', bruto: cr, neto, cfdi, regla: 'pago de Payana' }), ov); continue; } }
    const v = { descripcion: base.concepto, categoria: '', proveedor_odoo: base.proveedor, plan_analitico: fac && !fac.proyecto ? fac.planes.join(',') : '' };
    let r;
    if (F.d6 && (r = reglas.primera('activo_fijo', v))) {
      push(Object.assign(base, { destino: 'activo_fijo', bruto: cr, neto, cfdi, regla: 'regla ' + r.id + ': activo fijo' }));
      activos.push({ periodo: p, base: neto, ref: base.id, concepto: base.concepto }); continue;
    }
    if ((r = reglas.primera('conmet', v))) { push(Object.assign(base, { destino: 'costo_conmet', bruto: cr, neto, cfdi, conmet: true, regla: 'regla ' + r.id })); continue; }
    if (!F.r2) {
      if (fac && fac.proyecto) { push(Object.assign(base, { destino: 'costo_payana_proyecto', bruto: cr, neto, cfdi, regla: 'factura con cuenta analítica de proyecto (plan 1/18)' })); continue; }
      const ra = F.d2 ? reglas.primera('administrativo', v) : reglas.primera('administrativo', Object.assign({}, v, { plan_analitico: '' }));
      if (ra) { push(Object.assign(base, { destino: 'admin_' + (ra.subcategoria || 'otros'), bruto: cr, neto, cfdi, regla: 'regla ' + ra.id })); continue; }
      push(Object.assign(base, { destino: 'costo_payana_sin_clasificar', bruto: cr, neto, cfdi, regla: fac ? 'factura sin proyecto (planes ' + (fac.planes.join('/') || 'ninguno') + ')' : 'sin factura ligada' }));
      continue;
    }
    // R2: proyecto → costo; común (plan 2) → administrativo; mixta → se parte; sin analítica → regla de proveedor; sin regla → costo sin clasificar
    const pb = partirPorAnalitica(fac, cr), pn = partirPorAnalitica(fac, neto);
    const pieza = (suf, destino, b, n, regla, extra) => push(Object.assign({}, base, { id: base.id + suf, destino, bruto: b, neto: n, cfdi, regla }, extra || {}));
    const hay = [pb.p, pb.c, pb.n].filter(x => x).length > 1;
    if (pb.p) pieza(hay ? '#p' : '', 'costo_payana_proyecto', pb.p, pn.p, 'analítica de proyecto (plan 1/18) de ' + (fac && fac.name), { via: 'analitica' });
    if (pb.c) pieza(hay ? '#c' : '', 'admin_payana_indirecto', pb.c, pn.c, 'analítica común (plan 2) de ' + (fac && fac.name), { via: 'analitica' });
    if (pb.n) {
      const ra = reglas.primera('administrativo', Object.assign({}, v, { plan_analitico: '' }));
      if (ra) pieza(hay ? '#n' : '', 'admin_' + (ra.subcategoria || 'otros'), pb.n, pn.n, 'regla ' + ra.id + ' · clasificado por regla, sin analítica', { via: 'regla' });
      else pieza(hay ? '#n' : '', 'costo_payana_sin_clasificar', pb.n, pn.n, fac ? 'factura sin analítica de proyecto ni común, y sin regla de proveedor' : 'sin factura ligada', { via: 'sin_clasificar' });
    }
  }

  // ── D6: depreciación de activo fijo, línea recta desde el mes de compra ──
  const tasaMes = (P.depreciacion_vehiculos_anual_pct || 0) / 100 / 12;
  for (const a of activos) for (const p of MESES) if (p >= a.periodo) itemAjuste(p, 'costo_depreciacion', Math.round(a.base * tasaMes), 'depreciación de ' + a.concepto, { ref: a.ref });

  // ── ventas confirmadas (Odoo sale.order state=sale, subtotal sin IVA, mes de date_order en Monterrey) ──
  const MV_OK = p => MESES.includes(p) || p === MV;
  const ventas = [];
  for (const s of ordenar(O.ventas || [], 'name')) {
    const fl = fechaLocalMty(s.date_order), p = fl.slice(0, 7), cli = m2o(s.partner_id).name;
    if (!MV_OK(p)) continue;
    if (/^ZZ[- ]?PRUEBA/i.test(cli)) { ventas.push({ id: s.id, name: s.name, periodo: p, fecha: fl, cliente: cli, moneda: '', monto_nat: cents(s.amount_untaxed), tc: null, mxn: 0, excluida: 'orden de prueba (cliente ZZ-PRUEBA)' }); continue; }
    const mon = /USD/.test(m2o(s.currency_id).name) ? 'USD' : 'MXN', c = cents(s.amount_untaxed), x = aMXN(c, mon, fl);
    ventas.push({ id: s.id, name: s.name, periodo: p, fecha: fl, cliente: cli, moneda: mon, monto_nat: c, tc: x.tc, fecha_tc: x.fecha_tc, mxn: x.mxn, conmet: s.name === CONMET_SO, excluida: null });
  }

  // ── facturado (Vista C): facturas de cliente publicadas menos notas de crédito, sin IVA, por fecha de factura ──
  const facturado = [];
  for (const f of ordenar(O.facturas_cliente || [], 'invoice_date', 'id')) {
    const p = dia(f.invoice_date).slice(0, 7); if (!MV_OK(p)) continue;
    const cli = m2o(f.partner_id).name;
    const conmet = !!(reglas.primera('conmet', { cliente_odoo: cli }) || String(f.invoice_origin || '').includes(CONMET_SO));
    facturado.push({ id: f.id, name: f.name, periodo: p, fecha: dia(f.invoice_date), cliente: cli, move_type: f.move_type, mxn: cents(f.amount_untaxed_signed), conmet,
      excluida: /^ZZ[- ]?PRUEBA/i.test(cli) ? 'factura de prueba' : null });
  }

  // ── D7: Conmet por avance de obra ──
  const contrato = ventas.filter(v => v.conmet).reduce((s, v) => s + v.mxn, 0);
  const estimado = P.conmet_costo_total_estimado_mxn ? Math.round(P.conmet_costo_total_estimado_mxn * 100) : contrato;   // vacío = margen cero (SUPUESTO S18)
  const conmetMes = {}; let acumCosto = 0, acumRec = 0;
  const costoConmetMes = p => items.filter(i => i.destino === 'costo_conmet' && i.periodo === p).reduce((s, i) => s + i.neto, 0);
  const cobradoMes = p => items.filter(i => i.destino === 'info_anticipo_conmet_cobrado' && i.periodo === p).reduce((s, i) => s + i.neto, 0);
  let acumCobrado = 0;
  for (const p of MESES) {
    acumCosto += costoConmetMes(p); acumCobrado += cobradoMes(p);
    const avance = estimado > 0 ? Math.min(1, acumCosto / estimado) : 0;
    const recAcum = Math.round(contrato * avance);
    conmetMes[p] = { venta: recAcum - acumRec, avance, costo_acum: acumCosto, reconocido_acum: recAcum, cobrado_acum: acumCobrado };
    acumRec = recAcum;
  }
  if (MV) conmetMes[MV] = { venta: 0, avance: acumRec && contrato ? acumRec / contrato : 0, costo_acum: acumCosto, reconocido_acum: acumRec, cobrado_acum: acumCobrado };

  // ── R3: conciliación de cada intermediario contra BBVA (todo peso del estado sale de BBVA) ──
  const conciliacion = { jeeves: {}, payana: {}, nomina: {} };
  const sumI = (pred, p) => items.filter(i => pred(i) && i.periodo === p).reduce((a, i) => a + i.bruto, 0);
  let acJ = 0, acY = 0;
  for (const p of MESES) {
    const fJ = sumI(i => i.destino === 'excl_fondeo_jeeves', p);
    const cJ = sumI(i => i.cuenta.indexOf('Jeeves') === 0 && i.destino.indexOf('info_') !== 0, p);      // consumos − devoluciones
    acJ += fJ - cJ;
    conciliacion.jeeves[p] = { fondeos: fJ, consumos: cJ, dif_mes: fJ - cJ, acumulado: acJ, pendiente_fondear: acJ < 0 ? -acJ : 0, diferencia: acJ > 0 ? acJ : 0 };
    const fY = sumI(i => i.destino === 'excl_fondeo_payana', p);
    const cY = sumI(i => i.cuenta.indexOf('Payana') === 0 && i.destino.indexOf('info_') !== 0, p);       // pagos (incluye activo fijo pagado por Payana)
    acY += fY - cY;
    conciliacion.payana[p] = { fondeos: fY, consumos: cY, dif_mes: fY - cY, acumulado: acY, pendiente_fondear: acY < 0 ? -acY : 0, diferencia: acY > 0 ? acY : 0 };
    const eN = estados.find(e => e.alias === 'Nomina' && e.periodo === p);
    const fN = sumI(i => i.destino === 'nomina_fondeo' || i.destino === 'nomina_fondeo_lado_nomina', p);
    const dN = sumI(i => i.destino === 'excl_cubierto_fondeo_nomina', p);
    const dS = eN && eN.saldo_final != null && eN.saldo_inicial != null ? cents(eN.saldo_final) - cents(eN.saldo_inicial) : null;
    conciliacion.nomina[p] = { fondeos: fN, consumos: dN, var_saldo: dS, dif_mes: dS === null ? null : fN - dN - dS, sin_estado: !eN };
  }

  return { MESES, MV, cobertura, items, ventas, facturado, P, contrato, estimado, conmetMes, candidatasPartida, activos, reglas, repartoNomina, conciliacion };
}

// ════════════════════════════════════════════════════════════════════════════
// VISTAS A, B, C
function armarVistas(m, F) {
  const { MESES, MV, items, ventas, facturado, conmetMes } = m;
  const COLS = MV ? MESES.concat([MV]) : MESES.slice();
  const suma = (pred, campo, per) => items.filter(i => pred(i) && (!per || i.periodo === per)).reduce((s, i) => s + i[campo], 0);
  const cnt = pred => items.filter(pred).length;
  const D = d => i => i.destino === d, P = pref => i => i.destino.indexOf(pref) === 0;
  const NOMINA = ['nomina_fondeo', 'nomina_directa', 'nomina_fondeo_lado_nomina'];

  function vista(tipo) {
    const sinConmet = tipo !== 'A';
    const ok = i => !(sinConmet && i.conmet);
    const L = [];
    const linea = (clave, etiqueta, nivel, fn, meta) => {
      const vals = {}; for (const p of COLS) vals[p] = fn(p); vals.acum = MESES.reduce((s, p) => s + vals[p], 0);
      L.push(Object.assign({ clave, etiqueta, nivel, vals }, meta || {})); return vals;
    };
    const renglon = (clave, etiqueta, pred, fuente, campo) => linea(clave, etiqueta, 2, p => MESES.includes(p) ? suma(i => pred(i) && ok(i), campo || 'neto', p) : 0,
      { fuente, n: cnt(i => pred(i) && ok(i)), pred: i => pred(i) && ok(i) });
    // ventas
    let V;
    if (tipo === 'C') {
      const vf = linea('ventas_facturadas', 'Facturado (facturas menos notas de crédito, sin Conmet)', 2, p => facturado.filter(f => !f.excluida && !f.conmet && f.periodo === p).reduce((s, f) => s + f.mxn, 0),
        { fuente: 'Odoo account.move out_invoice/out_refund · publicadas · empresa 1 · amount_untaxed_signed · fecha de factura', n: facturado.filter(f => !f.excluida && !f.conmet).length, facturas: f => !f.excluida && !f.conmet });
      V = linea('ventas', 'Ventas', 1, p => vf[p]);
    } else {
      const vS = linea('ventas_sin_conmet', 'Ventas confirmadas (sin Conmet)', 2, p => ventas.filter(v => !v.excluida && !v.conmet && v.periodo === p).reduce((s, v) => s + v.mxn, 0),
        { fuente: 'Odoo sale.order · state=sale · empresa 1 · amount_untaxed · mes de date_order (Monterrey)', n: ventas.filter(v => !v.excluida && !v.conmet).length, ventas: v => !v.excluida && !v.conmet });
      let vC = null;
      if (tipo === 'A') vC = linea('ventas_conmet', F.d7 ? 'Conmet ' + CONMET_SO + ' por avance de obra' : 'Conmet ' + CONMET_SO + ' (contrato completo)', 2,
        p => F.d7 ? (conmetMes[p] ? conmetMes[p].venta : 0) : ventas.filter(v => v.conmet && v.periodo === p).reduce((s, v) => s + v.mxn, 0),
        { fuente: F.d7 ? 'contrato sin IVA × % de avance acumulado − lo ya reconocido (D7)' : 'Odoo sale.order ' + CONMET_SO, n: ventas.filter(v => v.conmet).length, ventas: v => v.conmet });
      V = linea('ventas', 'Ventas', 1, p => vS[p] + (vC ? vC[p] : 0));
    }
    // costo
    const cs = [
      renglon('costo_prov_cfdi', 'Proveedores con CFDI ligado (sin IVA)', D('costo_proveedor_con_cfdi'), 'v_movimientos_validados · cargos con factura de proveedor en Odoo'),
      renglon('costo_prov_sin', 'Proveedores sin CFDI ligado (bruto)', D('costo_proveedor_sin_cfdi'), 'v_movimientos_validados · cargos sin factura (monto exacto ±15 días)'),
      renglon('costo_jeeves_proy', 'Jeeves con analítica de proyecto (IVA estimado)', D('costo_jeeves_proyecto'), 'Odoo diario 61 · consumo conciliado con factura con analítica plan 1/18 (R2)'),
      renglon('costo_jeeves', F.d3 ? 'Jeeves costo por regla de comercio (IVA estimado, sin CFDI)' : 'Jeeves: consumos (bruto)', i => i.destino.indexOf('costo_jeeves') === 0 && ['costo_jeeves_sin_clasificar', 'costo_jeeves_devolucion', 'costo_jeeves_proyecto'].indexOf(i.destino) < 0, 'Odoo diario 61 · sin analítica: reglas por tipo de comercio (D3)'),
      renglon('costo_jeeves_sin', 'Jeeves sin clasificar (IVA estimado)', D('costo_jeeves_sin_clasificar'), 'Odoo diario 61 · comercio sin regla'),
      renglon('costo_jeeves_dev', 'Jeeves: devoluciones de comercio', D('costo_jeeves_devolucion'), 'Odoo diario 61 · [DEVOLUCIÓN]'),
      renglon('costo_payana_proy', 'Payana con analítica de proyecto (sin IVA)', D('costo_payana_proyecto'), 'Odoo diario 74 · factura con analítica plan 1/18; las mixtas se parten (R2)'),
      renglon('costo_payana_pc', 'Payana sin clasificar (sin analítica ni regla)', D('costo_payana_sin_clasificar'), 'Odoo diario 74 · factura sin analítica de proyecto ni común y sin regla de proveedor (R2)'),
      F.r1 ? renglon('costo_nomina', 'Nómina de proyectos (reparto por horas)', D('nomina_proyectos'), 'nómina total del banco × % de horas o Carga MO a proyecto, por persona y mes (R1) · ver «Reparto de nómina»')
        : renglon('costo_nomina', F.d1 ? 'Nómina de campo' : 'Nómina (sin separar campo/oficina)', i => NOMINA.includes(i.destino), 'fondeos General→Nómina + pagos directos (− oficina, D1)'),
      renglon('costo_depreciacion', 'Depreciación asignable (activo fijo)', D('costo_depreciacion'), '25 % anual en línea recta desde el mes de compra (D6)'),
    ];
    if (items.some(D('costo_subcontratos'))) cs.push(renglon('costo_subcontratos', 'Subcontratos (reclasificado)', D('costo_subcontratos'), 'reclasificación de Esteban (Vista E)'));
    if (items.some(D('costo_otros'))) cs.push(renglon('costo_otros', 'Otros costos (reclasificado)', D('costo_otros'), 'reclasificación de Esteban (Vista E)'));
    if (tipo === 'A') cs.push(renglon('costo_conmet', 'Conmet: costo del proyecto (sin IVA)', D('costo_conmet'), 'cargos con CONMET o proveedor del proyecto'));
    const C = linea('costo', 'Costo de ventas', 1, p => cs.reduce((s, x) => s + x[p], 0));
    const UB = linea('utilidad_bruta', 'Utilidad bruta', 1, p => V[p] - C[p]);
    L.push({ clave: 'margen', etiqueta: 'Margen bruto', nivel: 3, vals: Object.fromEntries(COLS.concat(['acum']).map(p => [p, V[p] ? Math.round((UB[p] * 10000) / V[p]) : null])), es_pct: true });
    // gastos administrativos
    const ga = F.r1 ? [renglon('ga_nomina_oficina', 'Nómina de cuentas comunes (reparto por horas)', D('nomina_comun'), 'nómina total del banco × % de horas o Carga MO a bolsas comunes (R1) · ver «Reparto de nómina»'),
        renglon('ga_nomina_sin_horas', 'Nómina sin horas cargadas', D('nomina_sin_horas'), 'personas activas que nunca han cargado horas (R1)')]
      : [renglon('ga_nomina_oficina', 'Nómina de oficina', D('nomina_oficina'), 'personal de bancos.nomina_oficina (D1)')];
    ga.push(renglon('ga_jeeves_an', 'Jeeves con analítica común (IVA estimado)', D('admin_jeeves_analitica_comun'), 'Odoo diario 61 · factura conciliada con analítica plan 2 (R2)'),
      renglon('ga_jeeves', 'Jeeves administrativo por regla de comercio (IVA estimado)', i => i.destino.indexOf('admin_jeeves_') === 0 && i.destino !== 'admin_jeeves_analitica_comun', 'Odoo diario 61 · software, papelería, restaurantes en Monterrey (D3)'),
      renglon('ga_payana', 'Payana con analítica común (plan 2)', D('admin_payana_indirecto'), 'Odoo diario 74 · factura con analítica plan 2; las mixtas se parten (R2)'));
    const otros = Array.from(new Set(items.filter(i => i.destino.indexOf('admin_') === 0 && i.destino.indexOf('admin_jeeves_') !== 0 && i.destino !== 'admin_payana_indirecto').map(i => i.destino))).sort();
    for (const d of otros) ga.push(renglon('ga_' + d, d.replace('admin_', '').replace(/_/g, ' ').replace(/^./, x => x.toUpperCase()), D(d), 'reglas administrativo (bancos.reglas_edo_resultados)'));
    const GA = linea('gastos_admin', 'Gastos administrativos', 1, p => ga.reduce((s, x) => s + x[p], 0));
    const OI = items.some(D('otros_ingresos')) ? renglon('otros_ingresos', 'Otros ingresos (reclasificado)', D('otros_ingresos'), 'abonos reclasificados por Esteban (Vista E)') : null;
    const UO = linea('utilidad_operacion', 'Utilidad de operación', 1, p => UB[p] - GA[p] + (OI ? OI[p] : 0));
    const PI = renglon('partidas', 'Partidas por identificar (pendiente de Esteban)', P('partida_'), 'D5 · SPEI sin concepto ni CFDI desde el umbral, casa de cambio sin entrada, las marcadas «otro» y las reclasificadas');
    L[L.length - 1].nivel = 1;
    const UOP = linea('utilidad_operacion_partidas', 'Utilidad de operación después de partidas', 1, p => UO[p] - PI[p]);
    // informativos
    const imp = ['impuestos_sat', 'impuestos_imss_infonavit', 'impuestos_isn'].map(d => renglon('info_' + d, 'Informativo · ' + d.replace('impuestos_', '').replace(/_/g, ' '), D(d), 'reglas impuestos_cuotas', 'bruto'));
    linea('impuestos', 'Impuestos y cuotas pagados (informativo)', 4, p => imp.reduce((s, x) => s + x[p], 0));
    renglon('info_financiamiento', 'Financiamiento pagado (informativo)', D('excl_financiamiento'), 'préstamos y decisiones de Esteban', 'bruto');
    renglon('info_financiamiento_entrada', 'Financiamiento y aportaciones recibidas (informativo)', D('info_entrada_financiamiento'), 'abonos de crédito o aportación', 'bruto');
    renglon('info_activo_fijo', 'Compras de activo fijo, sin IVA (informativo)', D('activo_fijo'), 'fuera del resultado; entra sólo la depreciación (D6)');
    renglon('info_previo', 'Costo de proyectos vendidos antes de ' + ANIO + ' (informativo, ya incluido arriba)', i => i.previo && (i.destino.indexOf('costo_') === 0), 'factura ligada con analítica de proyecto creada antes del año');
    if (tipo === 'A' && F.d7) {
      linea('info_conmet_cobrado', 'Conmet: cobrado acumulado sin IVA (informativo)', 4, p => conmetMes[p] ? (p === 'acum' ? 0 : conmetMes[p].cobrado_acum) : 0, { es_acum: true });
      linea('info_conmet_anticipo', 'Conmet: anticipo cobrado no devengado (informativo)', 4, p => conmetMes[p] ? conmetMes[p].cobrado_acum - conmetMes[p].reconocido_acum : 0, { es_acum: true });
    }
    for (const l of L) if (l.es_acum) l.vals.acum = l.vals[MESES[MESES.length - 1]];
    return { tipo, lineas: L, tot: { V, C, UB, GA, UO, PI, UOP } };
  }
  return { COLS, A: vista('A'), B: vista('B'), C: vista('C') };
}

// renglón del estado (clave de armarVistas) donde cae cada destino interno; '__nomina' = se reparte por R1
function renglonPieza(d) {
  if (['nomina_fondeo', 'nomina_directa', 'nomina_fondeo_lado_nomina', 'nomina_oficina'].includes(d)) return '__nomina';
  const M = { costo_proveedor_con_cfdi: 'costo_prov_cfdi', costo_proveedor_sin_cfdi: 'costo_prov_sin', costo_jeeves_proyecto: 'costo_jeeves_proy', costo_jeeves_sin_clasificar: 'costo_jeeves_sin',
    costo_jeeves_devolucion: 'costo_jeeves_dev', costo_payana_proyecto: 'costo_payana_proy', costo_payana_sin_clasificar: 'costo_payana_pc', nomina_proyectos: 'costo_nomina', nomina_comun: 'ga_nomina_oficina',
    nomina_sin_horas: 'ga_nomina_sin_horas', admin_jeeves_analitica_comun: 'ga_jeeves_an', admin_payana_indirecto: 'ga_payana', otros_ingresos: 'otros_ingresos' };
  if (M[d]) return M[d];
  if (['costo_depreciacion', 'costo_conmet', 'costo_subcontratos', 'costo_otros'].includes(d)) return d;
  if (d.indexOf('costo_jeeves') === 0) return 'costo_jeeves';
  if (d.indexOf('admin_jeeves_') === 0) return 'ga_jeeves';
  if (d.indexOf('admin_') === 0) return 'ga_' + d;
  if (d.indexOf('partida_') === 0) return 'partidas';
  return null;
}

// ── puente banco → estado (Vista A) ──
function armarPuente(m, A) {
  const { MESES, items } = m;
  const suma = (pred, campo, p) => items.filter(i => pred(i) && i.periodo === p).reduce((s, i) => s + i[campo], 0);
  const EXCL = [['excl_cubierto_fondeo_nomina', 'dispersiones de la cuenta Nómina (ya contadas en los fondeos General → Nómina)'], ['excl_traspaso', 'traspasos entre cuentas BBVA propias (no Nómina)'],
    ['excl_fondeo_payana', 'fondeos BBVA → Payana'], ['excl_fondeo_jeeves', 'fondeos BBVA → Jeeves'], ['excl_financiamiento', 'Pagos de financiamiento, préstamos y aportaciones'],
    ['impuestos_', 'Impuestos y cuotas (SAT, IMSS/INFONAVIT, ISN)'], ['excl_devolucion', 'Cargos devueltos por el banco'], ['activo_fijo', 'Compras de activo fijo (fuera del resultado)']]
    .concat([['excl_devolucion_aportacion', 'devoluciones de aportación a socios (reclasificado)'], ['excl_anticipo_proveedor', 'anticipos a proveedor (reclasificado)'], ['excl_sin_clasificar', 'excluidos sin clasificar (reclasificado)']]
      .filter(([d]) => items.some(i => i.fuente === 'banco' && i.destino === d)));
  const puente = [];
  const pl = (clave, etiqueta, fn, signo) => { const vals = {}; for (const p of MESES) vals[p] = fn(p); vals.acum = MESES.reduce((s, p) => s + vals[p], 0); puente.push({ clave, etiqueta, signo, vals }); return vals; };
  const esBancoCargo = i => i.fuente === 'banco' && i.destino.indexOf('info_') !== 0 && i.destino !== 'nomina_fondeo_lado_nomina';
  const bS = pl('salidas', 'Total de cargos BBVA (General, Nómina y USD en pesos)', p => suma(esBancoCargo, 'bruto', p), '');
  const exs = EXCL.map(([d, et]) => pl(d, 'menos ' + et, p => -suma(i => i.fuente === 'banco' && (d.slice(-1) === '_' ? i.destino.indexOf(d) === 0 : i.destino === d), 'bruto', p), '−'));
  const bE = pl('egresos_estado', 'Egresos bancarios que entran al estado o a partidas (bruto)', p => bS[p] + exs.reduce((s, x) => s + x[p], 0), '=');
  const bJ = pl('mas_jeeves', 'más consumos de Jeeves que entran al estado, netos de devoluciones (diario 61, bruto) · diferencia contra los fondeos en «Conciliación contra BBVA»', p => suma(i => i.fuente === 'odoo' && i.cuenta.indexOf('Jeeves') === 0 && i.destino.indexOf('info_') !== 0, 'bruto', p), '+');
  const bP = pl('mas_payana', 'más pagos de Payana que entran al estado (diario 74, bruto) · diferencia contra los fondeos en «Conciliación contra BBVA»', p => suma(i => i.fuente === 'odoo' && i.cuenta.indexOf('Payana') === 0 && i.destino.indexOf('info_') !== 0 && i.destino !== 'activo_fijo', 'bruto', p), '+');
  const bN = pl('mas_nomina_lado_nomina', 'más nómina de meses sin estado de la General (leída en el estado de Nómina)', p => suma(i => i.destino === 'nomina_fondeo_lado_nomina', 'bruto', p), '+');
  const bD = pl('mas_depreciacion', 'más depreciación del activo fijo (no es salida de banco)', p => suma(i => i.destino === 'costo_depreciacion', 'bruto', p), '+');
  const enER = i => i.destino.indexOf('costo_') === 0 || i.destino.indexOf('admin_') === 0 || i.destino.indexOf('nomina') === 0 || i.destino.indexOf('partida_') === 0;
  const bI = pl('menos_iva', 'menos IVA (CFDI ligado y estimado en Jeeves)', p => -suma(i => enER(i) && i.fuente !== 'ajuste', 'bruto', p) + suma(i => enER(i) && i.fuente !== 'ajuste', 'neto', p), '−');
  const bF = pl('fin', 'Costo de ventas + gastos administrativos + partidas por identificar', p => bE[p] + bJ[p] + bP[p] + bN[p] + bD[p] + bI[p], '=');
  const cuadre = {}; let cuadraTodo = true;
  for (const p of MESES.concat(['acum'])) { const d = bF[p] - (A.tot.C[p] + A.tot.GA[p] + A.tot.PI[p]); cuadre[p] = d; if (d !== 0) cuadraTodo = false; }
  return { puente, cuadre, cuadraTodo };
}

// ── Vista D: núcleo del escenario (se incrusta tal cual en el HTML y se prueba en node) ──
function escenarioCore(base, movs, seleccion, pctFin) {
  // base: {mes: centavos, acum: centavos}; movs: [{id, mes, bruto}] en centavos; seleccion: arreglo de ids; pctFin: número 0..100
  const sel = {}; for (const id of seleccion) sel[String(id)] = true;
  const p = Math.min(100, Math.max(0, Number(pctFin) || 0));
  const out = {}; const meses = Object.keys(base).filter(k => k !== 'acum');
  const vacio = () => ({ n: 0, bruto: 0, subtotal: 0, costo: 0, neto: 0, base: 0, hipotetica: 0 });
  for (const k of meses.concat(['acum'])) { out[k] = vacio(); out[k].base = base[k]; }
  for (const mv of movs) {
    if (!sel[String(mv.id)] || !out[mv.mes]) continue;
    const sub = mv.bruto * 100 / 116;                   // subtotal = bruto ÷ 1.16, precisión completa
    for (const k of [mv.mes, 'acum']) { out[k].n++; out[k].bruto += mv.bruto; out[k].subtotal += sub; }
  }
  for (const k of meses.concat(['acum'])) {
    const o = out[k]; o.costo = o.subtotal * p / 100; o.neto = o.subtotal - o.costo; o.hipotetica = o.base + o.subtotal - o.costo;
  }
  return out;
}

// ── Vista E: núcleo del estado personalizado (se incrusta tal cual en el HTML y se prueba en node) ──
// D: datos del motor (meses, cat, lineas por vista, ventas, nom, movs). S: estado del usuario.
// Orden de cálculo: 1) v1 · 2) reclasificaciones oficiales vigentes (ya vienen en D) · 3) reclasificaciones y particiones
// de este escenario · 4) ajustes % por movimiento · 5) ajustes % por renglón · 6) utilidad retenida (bloque aparte).
function personalizadoCore(D, S) {
  S = S || {};
  var base = S.base === 'A' || S.base === 'B' ? S.base : 'C', esc = S.modo === 'escenario';
  var meses = D.meses, cols = meses.concat(['acum']);
  var cero = function () { var o = {}; cols.forEach(function (p) { o[p] = 0; }); return o; };
  var copia = function (v) { var o = {}; cols.forEach(function (p) { o[p] = Number(v && v[p]) || 0; }); return o; };
  var cat = {}; D.cat.forEach(function (c) { cat[c.clave] = c; });
  var SEC = { costo: 'costo', administrativo: 'ga', partidas: 'pi', otros_ingresos: 'oi' };
  var L = {}, orden = [];
  D.lineas[base].forEach(function (l) { L[l.c] = { c: l.c, e: l.e, s: l.s, base: copia(l.v), v: copia(l.v), det: [] }; orden.push(l.c); });
  function linea(c, e, s) {
    if (L[c]) return L[c];
    L[c] = { c: c, e: e || c, s: s, base: cero(), v: cero(), det: [], nueva: true };
    var pos = -1; orden.forEach(function (x, i) { if (L[x].s === s) pos = i; });
    if (pos < 0) { var ordS = ['venta', 'costo', 'ga', 'oi', 'pi']; orden.forEach(function (x, i) { if (ordS.indexOf(L[x].s) < ordS.indexOf(s)) pos = i; }); }
    orden.splice(pos + 1, 0, c); return L[c];
  }
  var etiquetaDe = function (rg) { var e = null; D.cat.forEach(function (c) { if (c.renglon === rg) e = c.etiqueta; }); return e; };
  var seccionDe = function (rg) { var s = null; D.cat.forEach(function (c) { if (c.renglon === rg) s = SEC[c.seccion]; }); return s || (rg.indexOf('ga_') === 0 ? 'ga' : rg === 'partidas' ? 'pi' : rg === 'otros_ingresos' ? 'oi' : 'costo'); };
  function sumar(rg, mes, val, det) {
    if (!rg || !val) return;
    var l = L[rg] || linea(rg, etiquetaDe(rg), seccionDe(rg));
    l.v[mes] += val; l.v.acum += val; if (det) l.det.push(det);
  }
  var efectoMov = {};                                          // por clave de cambio: suma firmada por sección (para «mayores efectos»)
  function contribuir(rg, m, monto, det, clave) {
    var partes = rg === '__nomina' ? (function () { var q = D.nom[m.m] || { p: 1, c: 0, s: 0 }; return [['costo_nomina', q.p], ['ga_nomina_oficina', q.c], ['ga_nomina_sin_horas', q.s]]; })() : [[rg, 1]];
    partes.forEach(function (x) {
      if (!x[0] || !x[1]) return;
      var v = monto * x[1]; sumar(x[0], m.m, v, det && Object.assign({}, det, { monto: v }));
      if (clave) { var e = efectoMov[clave] || (efectoMov[clave] = { costo: 0, ga: 0, oi: 0, pi: 0 }); e[(L[x[0]] || {}).s || 'costo'] += v; }
    });
  }
  var tipoOk = function (dest, m) { var c = cat[dest]; return !!c && ((m.t === 'abono') === (c.tipo === 'ingreso')); };
  var renglonDe = function (dest, m) { var c = cat[dest]; if (!c || !c.renglon) return null; if (c.renglon === 'costo_prov') return m.cf ? 'costo_prov_cfdi' : 'costo_prov_sin'; return c.renglon; };
  var movMap = {}; D.movs.forEach(function (m) { movMap[m.k] = m; });
  var visible = function (m) { return base === 'A' || !m.cx; };
  // 3a) reglas propuestas: aplican a los movimientos que coinciden y no tienen cambio propio
  var cambios = {}; Object.keys(S.cambios || {}).forEach(function (k) { cambios[k] = S.cambios[k]; });
  (S.reglas || []).forEach(function (r, ir) {
    var t = String(r.texto || '').toUpperCase(); if (t.length < 3) return;
    D.movs.forEach(function (m) {
      if (cambios[m.k]) return;
      var campo = String((r.campo === 'contraparte' ? m.cp : m.co) || '').toUpperCase();
      if (campo.indexOf(t) >= 0 && tipoOk(r.dest, m)) cambios[m.k] = { partes: [{ dest: r.dest, pct: 100, proy: r.proy || '' }], regla: ir };
    });
  });
  var errores = [], avisos = [], nuevos = {}, aplicados = [], chkLineas = 0, chkMovs = 0;
  var enER = function (rg) { return rg && rg !== null; };
  var signoSec = function (rg) { var s = rg === '__nomina' ? 'costo' : (L[rg] ? L[rg].s : seccionDe(rg)); return s === 'oi' ? -1 : 1; };
  // 3b) reclasificaciones y particiones
  Object.keys(cambios).forEach(function (k) {
    var m = movMap[k]; if (!m) { errores.push({ k: k, motivo: 'el movimiento no existe' }); return; }
    if (!visible(m)) { avisos.push({ k: k, motivo: 'Conmet no está en la Vista ' + base }); return; }
    var ch = cambios[k], ps = ch.partes || [], suma = 0;
    ps.forEach(function (x) { suma += Number(x.pct) || 0; });
    var mal = !ps.length ? 'sin destino' : ps.length > 5 ? 'más de 5 partes' : Math.abs(suma - 100) > 1e-9 ? 'las partes suman ' + (Math.round(suma * 10000) / 10000) + ' %, no 100 %' :
      ps.some(function (x) { return !(Number(x.pct) > 0); }) ? 'una parte sin porcentaje' : ps.some(function (x) { return !tipoOk(x.dest, m); }) ? 'destino no válido para un ' + m.t : null;
    if (mal) { errores.push({ k: k, motivo: mal }); return; }
    m.pz.forEach(function (pz) { if (enER(pz[0])) { contribuir(pz[0], m, -pz[1], { tipo: 'sale', k: k }, k); chkMovs -= pz[1] * signoSec(pz[0]); } });
    nuevos[k] = [];
    var resto = m.n;
    ps.forEach(function (x, i) {
      var monto = i === ps.length - 1 ? resto : m.n * Number(x.pct) / 100; resto -= monto;
      var rg = renglonDe(x.dest, m);
      nuevos[k].push([rg, monto, x.dest]);
      if (rg) { contribuir(rg, m, monto, { tipo: 'entra', k: k, dest: x.dest, pct: Number(x.pct) }, k); chkMovs += monto * signoSec(rg); }
    });
    aplicados.push(k);
  });
  var piezas = function (m) { return nuevos[m.k] || m.pz; };
  var ajustes = [];
  // 4) ajuste % por movimiento (sólo escenario): monto ajustado = subtotal usado × (1 + % / 100)
  if (esc) Object.keys(S.ajMov || {}).forEach(function (k) {
    var p = Math.min(500, Math.max(-100, Number(S.ajMov[k]) || 0)), m = movMap[k]; if (!p || !m || !visible(m)) return;
    piezas(m).forEach(function (pz) {
      if (!enER(pz[0])) return;
      var d = pz[1] * p / 100; contribuir(pz[0], m, d, { tipo: 'ajuste_movimiento', k: k, pct: p, sobre: pz[1] }, 'aj:' + k);
      ajustes.push({ tipo: 'movimiento', k: k, pct: p, sobre: pz[1], monto: d * signoSec(pz[0]), mes: m.m, renglon: pz[0] });
    });
  });
  // 5) ajuste % por renglón (sólo escenario), después de 3 y 4
  if (esc) Object.keys(S.ajRen || {}).forEach(function (c) {
    var a = S.ajRen[c] || {}, p = Math.min(500, Math.max(-100, Number(a.pct) || 0)), l = L[c]; if (!p || !l) return;
    meses.forEach(function (mes) {
      if (a.meses && a.meses.length && a.meses.indexOf(mes) < 0) return;
      var sobre = l.v[mes], d = sobre * p / 100; if (!d) return;
      l.v[mes] += d; l.v.acum += d; l.det.push({ tipo: 'ajuste_renglon', mes: mes, pct: p, sobre: sobre, monto: d });
      var e = efectoMov['ren:' + c] || (efectoMov['ren:' + c] = { costo: 0, ga: 0, oi: 0, pi: 0 }); e[l.s] += d;
      ajustes.push({ tipo: 'renglon', c: c, pct: p, sobre: sobre, monto: d * (l.s === 'oi' ? -1 : 1), mes: mes, renglon: c });
    });
  });
  // totales
  var tot = function (campo) {
    var r = { V: copia(D.ventas[base]), C: cero(), GA: cero(), OI: cero(), PI: cero() };
    orden.forEach(function (c) { var l = L[c], k = l.s === 'costo' ? 'C' : l.s === 'ga' ? 'GA' : l.s === 'oi' ? 'OI' : l.s === 'pi' ? 'PI' : null; if (k) cols.forEach(function (p) { r[k][p] += l[campo][p]; }); });
    r.UB = cero(); r.UO = cero(); r.UOP = cero(); r.MB = {}; r.MO = {};
    cols.forEach(function (p) { r.UB[p] = r.V[p] - r.C[p]; r.UO[p] = r.UB[p] - r.GA[p] + r.OI[p]; r.UOP[p] = r.UO[p] - r.PI[p];
      r.MB[p] = r.V[p] ? r.UB[p] / r.V[p] : null; r.MO[p] = r.V[p] ? r.UO[p] / r.V[p] : null; });
    return r;
  };
  var T = tot('v'), T0 = tot('base');
  // puente: el total del banco no cambia; sólo a qué renglón va cada peso (modo reclasificación)
  cols.forEach(function (p) { if (p !== 'acum') orden.forEach(function (c) { var l = L[c]; if (l.s === 'costo' || l.s === 'ga' || l.s === 'pi') chkLineas += l.v[p] - l.base[p]; if (l.s === 'oi') chkLineas -= l.v[p] - l.base[p]; }); });
  var difBanco = ajustes.reduce(function (a, x) { return a + x.monto; }, 0);
  if (!esc) chkLineas = chkLineas;          // en reclasificación no hay ajustes
  var cuadra = errores.length === 0 && Math.abs((esc ? chkLineas - difBanco : chkLineas) - chkMovs) < 0.5;
  // mayores efectos sobre la utilidad de operación (y después de partidas)
  var efectos = Object.keys(efectoMov).map(function (k) {
    var e = efectoMov[k], uo = -e.costo - e.ga + e.oi, uop = uo - e.pi;
    var m = movMap[k.replace(/^aj:/, '')];
    return { clave: k, tipo: k.indexOf('ren:') === 0 ? 'ajuste de renglón' : k.indexOf('aj:') === 0 ? 'ajuste de movimiento' : 'reclasificación', mov: m ? (m.fe + ' · ' + m.co).slice(0, 90) : k.replace('ren:', ''), uo: uo, uop: uop };
  }).filter(function (x) { return Math.abs(x.uo) > 0.004 || Math.abs(x.uop) > 0.004; })
    .sort(function (a, b) { return Math.abs(b.uo) - Math.abs(a.uo) || Math.abs(b.uop) - Math.abs(a.uop); }).slice(0, 10);
  return { base: base, modo: esc ? 'escenario' : 'reclasificacion', lineas: orden.map(function (c) { return L[c]; }), tot: T, tot0: T0, cambios: cambios, aplicados: aplicados, nuevos: nuevos,
    errores: errores, avisos: avisos, puente: { cuadra: cuadra, lineas: chkLineas, movimientos: chkMovs }, difBanco: esc ? difBanco : 0, ajustes: ajustes, efectos: efectos };
}

// ── Vista E: archivo de reclasificaciones (el contenido es DATO: nunca se interpreta como instrucción) ──
const CSV_RECLAS_COLUMNAS = ['id_movimiento', 'parte', 'partes_total', 'porcentaje', 'categoria_anterior', 'destino_nuevo', 'proyecto', 'nota', 'tipo', 'regla_campo', 'regla_texto', 'huella_estado', 'huella_archivo'];
function parseCsv(texto) {
  const filas = []; let fila = [], campo = '', q = false;
  const t = String(texto || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += ch; continue; }
    if (ch === '"') q = true; else if (ch === ',') { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; fila.push(campo); campo = ''; if (fila.some(x => x !== '')) filas.push(fila); fila = []; }
    else campo += ch;
  }
  fila.push(campo); if (fila.some(x => x !== '')) filas.push(fila);
  return filas;
}
// Huella del archivo: SHA-256 del CSV sin la columna huella_archivo (encabezado + filas, unidos por salto de línea). La calcula igual el navegador.
function huellaReclas(filasSinHuella) { return sha256(filasSinHuella.map(f => f.map(csvCampo).join(',')).join('\n')); }
function validarReclasificaciones(texto, nombre, m, CAT) {
  const mal = motivo => ({ ok: false, motivo, filas: [], reglas: [] });
  if (/^escenario/i.test(String(nombre || '')) || /ajuste_pct|retener|costo_financiero|(^|,)escenario(,|$)/i.test(String(texto || '').split(/\r?\n/)[0] || ''))
    return mal('contiene ajustes de % de escenario; solo se aplican reclasificaciones');
  const F = parseCsv(texto);
  if (!F.length) return mal('el archivo está vacío');
  const cab = F[0].map(x => x.trim());
  if (cab.join(',') !== CSV_RECLAS_COLUMNAS.join(',')) return mal('encabezado distinto al esperado: ' + CSV_RECLAS_COLUMNAS.join(','));
  const filas = F.slice(1).map(f => Object.fromEntries(CSV_RECLAS_COLUMNAS.map((c, k) => [c, String(f[k] == null ? '' : f[k]).trim()])));
  if (!filas.length) return mal('el archivo no trae filas');
  if (filas.length > 5000) return mal('demasiadas filas (máximo 5000)');
  const hs = new Set(filas.map(f => f.huella_archivo));
  if (hs.size !== 1) return mal('la columna huella_archivo no es la misma en todas las filas');
  const esperada = huellaReclas([CSV_RECLAS_COLUMNAS.slice(0, -1)].concat(F.slice(1).map(f => CSV_RECLAS_COLUMNAS.slice(0, -1).map((c, k) => String(f[k] == null ? '' : f[k]).trim()))));
  const huella = filas[0].huella_archivo;
  if (huella !== esperada) return mal('la huella del archivo no coincide: el archivo se modificó después de exportarlo');
  const movs = {}; for (const i of m.items) if (i.mov && !movs[i.mov]) movs[i.mov] = { tipo: i.tipo_mov, destino: i.destino_v1 || i.destino };
  const errores = [], porMov = {}, reglas = [];
  filas.forEach((f, k) => {
    const n = k + 2;
    if (f.tipo === 'escenario') { errores.push('fila ' + n + ': tipo escenario'); return; }
    if (!CAT[f.destino_nuevo]) { errores.push('fila ' + n + ': destino «' + f.destino_nuevo.slice(0, 60) + '» no está en el catálogo'); return; }
    if (f.nota.length > 500 || f.proyecto.length > 200) { errores.push('fila ' + n + ': nota o proyecto demasiado largos'); return; }
    if (f.tipo === 'movimiento') {
      const mv = movs[f.id_movimiento];
      if (!mv) { errores.push('fila ' + n + ': el id de movimiento «' + f.id_movimiento.slice(0, 80) + '» no existe'); return; }
      if ((mv.tipo === 'abono') !== (CAT[f.destino_nuevo].tipo === 'ingreso')) { errores.push('fila ' + n + ': un ' + mv.tipo + ' no puede ir a «' + f.destino_nuevo + '»'); return; }
      const parte = Number(f.parte), total = Number(f.partes_total), pct = Number(f.porcentaje);
      if (!(parte >= 1 && parte <= 5 && total >= 1 && total <= 5 && parte <= total && pct > 0 && pct <= 100)) { errores.push('fila ' + n + ': parte, partes_total o porcentaje fuera de rango'); return; }
      (porMov[f.id_movimiento] || (porMov[f.id_movimiento] = [])).push({ parte, total, pct, f });
    } else if (f.tipo === 'regla') {
      if (!['contraparte', 'descripcion'].includes(f.regla_campo) || f.regla_texto.length < 3 || f.regla_texto.length > 120) { errores.push('fila ' + n + ': regla sin campo válido o con texto de menos de 3 caracteres'); return; }
      reglas.push({ campo: f.regla_campo, texto: f.regla_texto, destino: f.destino_nuevo, nota: f.nota });
    } else errores.push('fila ' + n + ': tipo «' + f.tipo.slice(0, 20) + '» desconocido (movimiento o regla)');
  });
  for (const id of Object.keys(porMov)) {
    const ps = ordenar(porMov[id], 'parte'), suma = ps.reduce((a, x) => a + x.pct, 0);
    if (ps.some((x, k) => x.parte !== k + 1 || x.total !== ps.length)) errores.push('movimiento ' + id.slice(0, 80) + ': las partes no son 1..' + ps.length);
    if (Math.abs(suma - 100) > 1e-4) errores.push('movimiento ' + id.slice(0, 80) + ': las partes suman ' + suma.toFixed(4) + ' %, no 100 %');
  }
  if (errores.length) return Object.assign(mal(errores.slice(0, 20).join(' · ') + (errores.length > 20 ? ' · (' + (errores.length - 20) + ' errores más)' : '')), { errores });
  const out = [];
  for (const id of Object.keys(porMov)) for (const x of ordenar(porMov[id], 'parte'))
    out.push({ lote: huella, tipo: 'movimiento', movimiento_id: id, parte: x.parte, partes_total: x.total, porcentaje: x.pct, destino: x.f.destino_nuevo, categoria_anterior: x.f.categoria_anterior || movs[id].destino,
      proyecto: x.f.proyecto || null, nota: x.f.nota || null, regla_campo: null, regla_texto: null, archivo_origen: String(nombre || ''), huella_archivo: huella });
  for (const r of reglas) out.push({ lote: huella, tipo: 'regla', movimiento_id: null, parte: 1, partes_total: 1, porcentaje: 100, destino: r.destino, categoria_anterior: null, proyecto: null, nota: r.nota || null,
    regla_campo: r.campo, regla_texto: r.texto, archivo_origen: String(nombre || ''), huella_archivo: huella });
  return { ok: true, motivo: '', filas: out, reglas: reglas.map(r => ({ prioridad: 5, destino: 'reclasificacion', campo: r.campo, patron: r.texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), subcategoria: r.destino, origen: 'reclasificación de Esteban', nota: r.nota || ('archivo ' + String(nombre || '')) })),
    lote: huella, n_movimientos: Object.keys(porMov).length, n_reglas: reglas.length };
}

// ── decisión de versión y de correo ──
function decidir(res, opciones) {
  const ult = opciones.ultimo_calculo || null, ver = opciones.ultima_version || null;
  const motivos = [];
  const cuadra = res.resumen.cuadra_al_centavo !== false;
  const nuevaVersion = cuadra && (!ver || ver.huella_resultados !== res.huella);
  if (!cuadra) motivos.push('el puente contra BBVA NO cuadra al centavo: no se publica versión nueva hasta explicarlo');
  if (!ver && cuadra) motivos.push('primera versión del estado automático (v1)');
  const cobPrev = {}; for (const c of ((ult && ult.resumen && ult.resumen.cobertura) || [])) cobPrev[c.periodo] = c.estado;
  for (const c of res.resumen.cobertura) if (cobPrev[c.periodo] === 'INCOMPLETO' && c.estado !== 'INCOMPLETO') motivos.push(nombreMes(c.periodo) + ' pasó de INCOMPLETO a ' + c.estado.toLowerCase());
  const um = (res.resumen.parametros && res.resumen.parametros.correo_umbral_cambio_utilidad_pct) || 1;
  const uoPrev = (ver && ver.resumen && ver.resumen.utilidad_operacion) || null;
  if (uoPrev) for (const k of ['A', 'B', 'C']) {
    const a = uoPrev[k], b = res.resumen.utilidad_operacion[k];
    if (typeof a === 'number' && Math.abs(b - a) > Math.abs(a) * um / 100) motivos.push('la utilidad de operación de la Vista ' + k + ' cambió ' + (a ? ((b - a) * 100 / Math.abs(a)).toFixed(2) : '∞') + ' %');
  }
  if (ult && opciones.firma && ult.firma_tablas && opciones.firma.tablas !== ult.firma_tablas) motivos.push('cambió una tabla editable (reglas, nómina de oficina, partidas o parámetros)');
  if (res.reclas) motivos.push(res.reclas.ok ? 'se aplicaron ' + res.reclas.n_movimientos + ' reclasificaciones de movimiento y ' + res.reclas.n_reglas + ' reglas del archivo ' + res.reclas.archivo
    : 'se RECHAZÓ el archivo de reclasificaciones ' + res.reclas.archivo + ': ' + res.reclas.motivo);
  return { version: nuevaVersion ? ((ver && ver.version) || 0) + 1 : null, nueva_version: nuevaVersion, motivos, enviar_correo: motivos.length > 0 };
}

// ════════════════════════════════════════════════════════════════════════════
function calcular(insumos, opciones) {
  opciones = opciones || {};
  let ins = insumos || {};
  // Vista E: un archivo nuevo de reclasificaciones se valida completo; si pasa, se aplica todo; si no, nada.
  let reclas = null;
  if (opciones.reclas_csv && opciones.reclas_csv.contenido != null) {
    const nombre = String(opciones.reclas_csv.nombre || '');
    const m0 = motor(ins, TODAS), a0 = armarVistas(m0, TODAS);
    const v = validarReclasificaciones(opciones.reclas_csv.contenido, nombre, m0, leerCatalogo(ins.destinos));
    reclas = { archivo: nombre, ok: v.ok, motivo: v.motivo, n_movimientos: v.n_movimientos || 0, n_reglas: v.n_reglas || 0, filas: v.filas, reglas: v.reglas, lote: v.lote || null };
    if (v.ok) {
      const ids = new Set(v.filas.filter(f => f.tipo === 'movimiento').map(f => f.movimiento_id));
      const ahora = String(opciones.generado_at || '').slice(0, 16);
      const ins2 = Object.assign({}, ins, {
        reclasificaciones: (ins.reclasificaciones || []).filter(r => !ids.has(r.movimiento_id)).concat(v.filas.filter(f => f.tipo === 'movimiento').map(f => Object.assign({}, f, { vigente: true, aplicada_en: ahora }))),
        reglas: (ins.reglas || []).concat(v.reglas.map((r, k) => Object.assign({ id: 'nueva-' + (k + 1) }, r))) });
      const m2 = motor(ins2, TODAS), a2 = armarVistas(m2, TODAS);
      if (!armarPuente(m2, a2.A).cuadraTodo) { reclas.ok = false; reclas.motivo = 'con estos cambios el puente contra BBVA dejaría de cuadrar al centavo'; }
      else {
        reclas.efecto_uo = { A: a2.A.tot.UO.acum - a0.A.tot.UO.acum, B: a2.B.tot.UO.acum - a0.B.tot.UO.acum, C: a2.C.tot.UO.acum - a0.C.tot.UO.acum };
        reclas.efecto_uop = { A: a2.A.tot.UOP.acum - a0.A.tot.UOP.acum, B: a2.B.tot.UOP.acum - a0.B.tot.UOP.acum, C: a2.C.tot.UOP.acum - a0.C.tot.UOP.acum };
        ins = ins2;
      }
    }
    if (!reclas.ok) { reclas.filas = []; reclas.reglas = []; }
  }
  const m = motor(ins, TODAS);
  const { MESES, MV, cobertura, items, ventas, facturado, P } = m;
  const vistas = armarVistas(m, TODAS);
  const { A, B, C, COLS } = vistas;
  const pz = armarPuente(m, A);

  // ── qué cambió contra el v0: decisiones encendidas una a una, en orden ──
  const pasos = [['v0', {}], ['D1 nómina de oficina', { d1: 1 }], ['D2 administrativo literal', { d1: 1, d2: 1 }], ['D3 Jeeves por comercio', { d1: 1, d2: 1, d3: 1 }],
    ['D4 sin CFDI en su renglón (sin efecto en cifras)', { d1: 1, d2: 1, d3: 1 }], ['D5 partidas por identificar', { d1: 1, d2: 1, d3: 1, d5: 1 }],
    ['D6 activo fijo y casa de cambio', { d1: 1, d2: 1, d3: 1, d5: 1, d6: 1 }], ['D7 Conmet por avance de obra (= v1)', { d1: 1, d2: 1, d3: 1, d5: 1, d6: 1, d7: 1 }],
    ['R1 nómina repartida por horas', { d1: 1, d2: 1, d3: 1, d5: 1, d6: 1, d7: 1, r1: 1 }], ['R2 Jeeves y Payana por analítica', TODAS],
    ['R3 conciliación contra BBVA (sin efecto en cifras: sólo verifica)', TODAS]];
  const cambios = []; let prev = null;
  for (const [nombre, f] of pasos) {
    const ff = { d1: !!f.d1, d2: !!f.d2, d3: !!f.d3, d5: !!f.d5, d6: !!f.d6, d7: !!f.d7, r1: !!f.r1, r2: !!f.r2 };
    const vs = armarVistas(motor(ins, ff), ff);
    const x = { paso: nombre, grupo: /^R/.test(nombre) ? 'v1' : 'v0', uo: vs.A.tot.UO.acum, uop: vs.A.tot.UOP.acum,
      uo_abc: { A: vs.A.tot.UO.acum, B: vs.B.tot.UO.acum, C: vs.C.tot.UO.acum }, ub_abc: { A: vs.A.tot.UB.acum, B: vs.B.tot.UB.acum, C: vs.C.tot.UB.acum } };
    x.efecto_uo = prev ? x.uo - prev.uo : 0; x.efecto_uop = prev ? x.uop - prev.uop : 0;
    x.efecto_abc = prev ? { A: x.uo_abc.A - prev.uo_abc.A, B: x.uo_abc.B - prev.uo_abc.B, C: x.uo_abc.C - prev.uo_abc.C } : { A: 0, B: 0, C: 0 };
    x.efecto_ub = prev ? { A: x.ub_abc.A - prev.ub_abc.A, B: x.ub_abc.B - prev.ub_abc.B, C: x.ub_abc.C - prev.ub_abc.C } : { A: 0, B: 0, C: 0 };
    cambios.push(x); prev = x;
  }

  // ── indicadores ──
  const suma = (pred, campo) => items.filter(pred).reduce((s, i) => s + i[campo], 0);
  const costoNoNomina = i => i.destino.indexOf('costo_') === 0 && i.destino !== 'costo_depreciacion';
  const sinCfdi = i => costoNoNomina(i) && !i.cfdi && i.destino !== 'costo_jeeves_devolucion';
  const baseC = suma(costoNoNomina, 'neto'), sinC = suma(sinCfdi, 'neto');
  const jeev = items.filter(i => i.cuenta.indexOf('Jeeves') === 0 && (i.destino.indexOf('costo_jeeves') === 0 || i.destino.indexOf('admin_jeeves') === 0) && i.destino !== 'costo_jeeves_devolucion');
  const jSin = jeev.filter(i => i.destino === 'costo_jeeves_sin_clasificar');
  const conteos = {}; for (const i of items) conteos[i.destino] = (conteos[i.destino] || 0) + 1;
  conteos.ventas = ventas.filter(v => !v.excluida).length; conteos.ventas_excluidas = ventas.filter(v => v.excluida).length;
  conteos.facturas_cliente = facturado.filter(f => !f.excluida).length;
  const incompletos = MESES.filter(p => cobertura[p].estado !== 'completo');
  const partidas = ordenar(items.filter(i => i.destino === 'partida_por_identificar' || i.destino === 'partida_otro'), 'fecha', 'renglon');

  const supuestos = [
    ['S1', 'Tipo de cambio', 'El FIX de Banxico no es alcanzable desde el sistema. Se usa el tipo de cambio de Odoo (USD, empresa 1, vigente a la fecha).'],
    ['S2', 'Ventas de prueba', 'Órdenes y facturas de clientes que empiezan con ZZ-PRUEBA no son venta.'],
    ['S3', 'Mes de la venta', 'El mes sale de date_order en hora de Monterrey (UTC-6); el facturado, de la fecha de factura.'],
    ['S4', 'Nómina de meses sin la General', 'Si falta el estado de la General, la nómina del mes se lee en los fondeos del estado de Nómina (dato del banco, no estimado).'],
    ['S5', 'Cuenta Nómina', 'Los cargos de la cuenta Nómina se excluyen: los cubren los fondeos desde la General, que son el renglón de nómina.'],
    ['S6', 'ISN', 'Los pagos a la Secretaría de Finanzas se tratan como Impuesto sobre Nómina.'],
    ['S7', 'Conmet sin factura exacta', 'Los anticipos de Conmet sin factura del mismo monto toman el IVA de la proporción de las facturas del proveedor del proyecto.'],
    ['S8', 'Jeeves (D3)', 'IVA estimado: consumos de comercios mexicanos ÷ 1.16; comercios extranjeros quedan como están. Todo Jeeves va marcado «IVA estimado, sin CFDI». Un restaurante sin señal de otra ciudad se toma como de Monterrey.'],
    ['S9', 'Payana y Jeeves (R2)', 'Primero la analítica de la factura (en Jeeves, la factura con la que se concilió el consumo): proyecto (plan 1/18) → costo; común (plan 2) → gastos; mixta → se parte en la misma proporción. Sin analítica → reglas por proveedor (Payana) o por comercio (Jeeves), marcado «clasificado por regla, sin analítica». Sin regla → costo «sin clasificar».'],
    ['S10', 'CFDI', 'Un egreso se liga a factura si hay un pago en Odoo del mismo monto (±15 días) que apunta a un BILL, o una factura de proveedor con el mismo total (±15 días). Cada factura y cada pago se usan una vez.'],
    ['S11', 'Devoluciones', 'Un «SPEI DEVUELTO» anula el cargo con el mismo banco y la misma referencia de los 5 días previos.'],
    ['S13', 'Escrituras', 'El recálculo sólo escribe en bancos.er_calculos y bancos.partidas_identificadas (pendientes nuevas), con el rol bancos_er.'],
    ['S14', 'Nómina (R1)', 'La cuenta Nómina casi sólo trae dispersiones masivas, así que la nómina total del mes del banco se reparte entre las personas en proporción a su peso de mano de obra (opción b). bancos.nomina_oficina queda sólo como corrección manual: la persona cuyo nombre coincide va 100 % a cuentas comunes.'],
    ['S15', 'Partidas por identificar (D5)', 'Cargo sin concepto ni CFDI desde ' + fmt(Math.round((P.umbral_partida_por_identificar_mxn || 0) * 100)) + ' pesos (parámetro editable), más los envíos a casa de cambio sin entrada equivalente.'],
    ['S16', 'Activo fijo (D6)', 'Compras de vehículos a activo fijo; depreciación ' + P.depreciacion_vehiculos_anual_pct + ' % anual en línea recta desde el mes de compra, prorrateada por mes, sobre el subtotal sin IVA.'],
    ['S17', 'Proyectos vendidos antes del año', 'Un costo es de un proyecto vendido antes de ' + ANIO + ' si todas las cuentas analíticas de proyecto de su factura se crearon antes del 1 de enero.'],
    ['S18', 'Conmet por avance (D7)', P.conmet_costo_total_estimado_mxn ? 'Costo total estimado tomado del parámetro conmet_costo_total_estimado_mxn.' :
      'En Odoo el costo cotizado de la SO11771 está vacío (costo por línea en cero y presupuesto de materiales y mano de obra en 1). Se usa margen cero (NIIF 15 párrafo 45): costo total estimado = contrato, y la venta reconocida iguala al costo incurrido. Cuando exista el estimado, se captura en er_parametros y el recálculo lo toma.'],
    ['S19', 'Conmet cobrado', 'El cobro de Conmet se muestra sin IVA (÷1.16) como informativo, contra lo reconocido.'],
    ['S20', 'Vista D', 'Los «últimos 10» se ordenan por fecha de operación y, dentro del día, por el renglón del estado (el banco no imprime hora).'],
    ['S21', 'Ajustes de la línea de crédito de Jeeves', 'Los renglones de Jeeves marcados como ajuste de la línea de crédito se tratan como consumo (costo sin clasificar) hasta confirmar qué son.'],
    ['S22', 'Peso de cada persona (R1)', 'Monto de Carga MO de la persona en los meses que existe (desde la semana 28); en los demás, sus horas de asistencia. El costo por hora de Odoo viene en muy pocas personas y no se usa.'],
    ['S23', 'Persona-mes medida (R1)', 'Carga MO: % = monto a proyecto ÷ monto total. Asistencias: se toma como medida si al menos el ' + Math.round(UMBRAL_HORAS_MEDIDAS * 100) + ' % de sus horas tiene orden de venta (proyecto) o bolsa (común); % = horas a proyecto ÷ horas clasificadas. Si no, promedio simple de sus meses medidos («estimado por historial»); si nunca tuvo uno, el % global de horas clasificadas.'],
    ['S24', 'Meses sin horas clasificadas (R1)', 'Enero a marzo no tienen ninguna hora con proyecto ni bolsa: su reparto sale del historial o del % global y el mes se marca «reparto de nómina estimado».'],
    ['S25', 'Planes que no son ni proyecto ni común (R2)', 'El plan 20 (rubro) se ignora. Activos, combustible, inmuebles, flota y otros planes cuentan como «sin analítica» y van a las reglas.'],
    ['S26', 'Conciliación contra BBVA (R3)', 'Jeeves y Payana no traen saldo en los insumos: se muestra la diferencia ACUMULADA entre fondeos desde BBVA y consumos o pagos. Si es negativa es «pendiente de fondear desde BBVA»; si es positiva, «diferencia contra BBVA» (saldo sin gastar o faltante por explicar). Nómina: fondeos − dispersiones − variación del saldo de la cuenta Nómina.'],
    ['S27', 'Versión que no cuadra (R3)', 'Si el puente no cuadra al centavo en algún mes, el mes se marca en rojo y el recálculo no publica versión nueva ni sobrescribe el estado actual.'],
  ];
  const decisiones = [
    'Opcional: forzar personas a cuentas comunes en bancos.nomina_oficina (corrección manual; la regla general es por horas).',
    'Decidir cada partida por identificar en bancos.partidas_identificadas.',
    'Capturar el costo total estimado de Conmet en bancos.er_parametros si se quiere reconocer margen por avance.',
    'Revisar la lista de reglas de Jeeves sin clasificar y ampliar bancos.reglas_edo_resultados.',
  ];

  const resultado = { A: A.lineas.map(l => ({ clave: l.clave, vals: l.vals })), B: B.lineas.map(l => ({ clave: l.clave, vals: l.vals })),
    C: C.lineas.map(l => ({ clave: l.clave, vals: l.vals })), puente: pz.puente.map(l => ({ clave: l.clave, vals: l.vals })), cuadre: pz.cuadre,
    conciliacion: m.conciliacion, reparto: m.repartoNomina ? Object.fromEntries(MESES.map(p => [p, { N: m.repartoNomina[p].N, costo: m.repartoNomina[p].costo, comun: m.repartoNomina[p].comun, sin: m.repartoNomina[p].sin }])) : null };
  const huella = sha256(canon(resultado));
  const huellaInsumos = sha256(canon(ins));

  const resumen = {
    version_motor: VERSION, meses: MESES, mes_solo_ventas: MV, cuadra_al_centavo: pz.cuadraTodo, diferencia_puente_acum: pz.cuadre.acum, conteos,
    porcentaje_costo_sin_cfdi: pct(sinC, baseC), porcentaje_costo_sin_cfdi_sobre_costo_total: pct(sinC, A.tot.C.acum),
    jeeves: { consumos: jeev.length, sin_clasificar: jSin.length, pct_monto_sin_clasificar: pct(jSin.reduce((s, i) => s + i.bruto, 0), jeev.reduce((s, i) => s + i.bruto, 0)) },
    cobertura: MESES.map(p => ({ periodo: p, estado: cobertura[p].estado, faltan: cobertura[p].faltan })),
    partidas_por_identificar: partidas.filter(i => i.destino === 'partida_por_identificar').length, nomina_oficina_filas: (ins.nomina_oficina || []).length,
    utilidad_operacion: { A: A.tot.UO.acum, B: B.tot.UO.acum, C: C.tot.UO.acum },
    utilidad_operacion_partidas: { A: A.tot.UOP.acum, B: B.tot.UOP.acum, C: C.tot.UOP.acum },
    reparto_nomina: m.repartoNomina ? MESES.map(p => { const r = m.repartoNomina[p]; return { periodo: p, pct_proyecto: pct(r.costo, r.N), pct_comun: pct(r.comun, r.N), pct_sin_horas: pct(r.sin, r.N),
      estimado: r.estimado, base: r.base, personas: r.cuenta }; }) : null,
    clasificacion_r2: (() => { const o = {}; for (const [k, pre] of [['jeeves', 'Jeeves'], ['payana', 'Payana']]) {
      const xs = items.filter(i => i.cuenta.indexOf(pre) === 0 && i.destino.indexOf('info_') !== 0 && i.destino !== 'costo_jeeves_devolucion'), t = xs.reduce((a, i) => a + i.bruto, 0);
      const g = v => xs.filter(i => (i.via || 'regla') === v).reduce((a, i) => a + i.bruto, 0);
      o[k] = { por_analitica: pct(g('analitica'), t), por_regla: pct(g('regla'), t), sin_clasificar: pct(g('sin_clasificar'), t) }; } return o; })(),
    conciliacion_bbva: Object.fromEntries(['jeeves', 'payana'].map(k => [k, MESES.map(p => ({ periodo: p, dif_mes: m.conciliacion[k][p].dif_mes, acumulado: m.conciliacion[k][p].acumulado }))])),
    parametros: P, insumos: { banco: (ins.banco || []).length, estados: (ins.estados || []).length, reglas: (ins.reglas || []).length,
      odoo: Object.fromEntries(Object.keys(ins.odoo || {}).sort().map(k => [k, (ins.odoo[k] || []).length])) },
  };
  const out = { version: VERSION, huella, huella_insumos: huellaInsumos, resumen, candidatas_partida: m.candidatasPartida, reclas };
  Object.assign(out, { decision: decidir(out, opciones) });
  if (opciones.sin_archivos) return Object.assign(out, { _interno: { m, A, B, C, pz, cambios } });

  // ═══ Vista D: candidatos por mes (fuera de la huella) ═══
  const enVistaD = i => i.fuente === 'banco' && (i.destino.indexOf('costo_') === 0 || i.destino.indexOf('admin_') === 0 || i.destino === 'nomina_directa' || i.destino === 'nomina_oficina' || i.destino.indexOf('partida_') === 0);
  const renglonDe = d => d.indexOf('partida_') === 0 ? 'partidas' : d === 'nomina_directa' ? 'costo_nomina' : d === 'nomina_oficina' ? 'ga_nomina_oficina' :
    d === 'costo_proveedor_con_cfdi' ? 'costo_prov_cfdi' : d === 'costo_proveedor_sin_cfdi' ? 'costo_prov_sin' : d === 'costo_conmet' ? 'costo_conmet' : d.indexOf('admin_') === 0 ? 'ga_' + d : d;
  const vd = { meses: MESES, movs: [], base: {} };
  for (const p of MESES) {
    const lista = items.filter(i => enVistaD(i) && i.periodo === p);
    const ult10 = ordenar(lista, 'fecha', 'renglon', 'mov_id').reverse().slice(0, 10).map(i => i.mov_id);
    const top10 = ordenar(lista, 'bruto', 'mov_id').reverse().slice(0, 10).map(i => i.mov_id);
    for (const i of lista) if (ult10.includes(i.mov_id) || top10.includes(i.mov_id)) vd.movs.push({ id: i.mov, mes: p, fecha: i.fecha, renglon: i.renglon, cuenta: i.cuenta + ' ' + i.mask,
      concepto: enmascarar(i.concepto), contraparte: i.proveedor || '', bruto: i.bruto, destino: i.destino, renglon_er: renglonDe(i.destino), conmet: i.conmet,
      origen: (i.archivo || '') + ' · p. ' + (i.pagina || ''), ult: ult10.includes(i.mov_id), top: top10.includes(i.mov_id) });
  }
  for (const [k, V] of [['A', A], ['B', B], ['C', C]]) { const b = {}; for (const p of MESES) b[p] = V.tot.UOP[p]; b.acum = V.tot.UOP.acum; vd.base[k] = b; }

  // ═══ Vista E: todos los movimientos (incluidos los excluidos), catálogo y renglones base (fuera de la huella) ═══
  const secc = c => c.indexOf('ventas_') === 0 ? 'venta' : c.indexOf('costo_') === 0 ? 'costo' : c.indexOf('ga_') === 0 ? 'ga' : c === 'otros_ingresos' ? 'oi' : c === 'partidas' ? 'pi' : null;
  const soloMeses = v => { const o = {}; for (const p of MESES) o[p] = v[p] || 0; o.acum = v.acum || 0; return o; };
  const ve = { meses: MESES, huella, columnas: CSV_RECLAS_COLUMNAS, cat: Object.values(leerCatalogo(ins.destinos)).map(c => ({ clave: c.clave, tipo: c.tipo, seccion: c.seccion, etiqueta: c.etiqueta, renglon: c.renglon || null, entra: !!c.entra })),
    lineas: {}, ventas: {}, nom: {}, movs: [], catLabels: {},
    proyectos: ordenar((ins.odoo && ins.odoo.analiticas || []).filter(a => (a.active === true || a.active === 't') && PLANES_PROYECTO.includes(m2o(a.root_plan_id).id || m2o(a.plan_id).id)).map(a => ({ id: a.id, n: String(a.name || '') })), 'n').map(a => [a.id, a.n]) };
  for (const [k, V] of [['A', A], ['B', B], ['C', C]]) {
    ve.lineas[k] = V.lineas.filter(l => l.nivel === 2 && secc(l.clave)).map(l => ({ c: l.clave, e: l.etiqueta, s: secc(l.clave), v: soloMeses(l.vals) }));
    ve.ventas[k] = soloMeses(V.tot.V);
  }
  for (const p of MESES) { const r = m.repartoNomina && m.repartoNomina[p]; ve.nom[p] = r && r.N ? { p: r.costo / r.N, c: r.comun / r.N, s: r.sin / r.N } : { p: 1, c: 0, s: 0 }; }
  const etiquetaRenglon = {}; for (const l of A.lineas) etiquetaRenglon[l.clave] = l.etiqueta;
  const ETQ = { excl_cubierto_fondeo_nomina: 'Excluido · dispersión de la cuenta Nómina (contada en los fondeos)', excl_traspaso: 'Excluido · traspaso entre cuentas propias', excl_fondeo_payana: 'Excluido · fondeo a Payana',
    excl_fondeo_jeeves: 'Excluido · fondeo a Jeeves', excl_financiamiento: 'Excluido · financiamiento / préstamo', excl_devolucion: 'Excluido · cargo devuelto por el banco', activo_fijo: 'Excluido · activo fijo',
    excl_devolucion_aportacion: 'Excluido · devolución de aportación', excl_anticipo_proveedor: 'Excluido · anticipo a proveedor', excl_sin_clasificar: 'Excluido · sin clasificar',
    impuestos_sat: 'Informativo · SAT', impuestos_imss_infonavit: 'Informativo · IMSS / INFONAVIT', impuestos_isn: 'Informativo · ISN', impuestos_reclasificado: 'Informativo · impuestos (reclasificado)',
    nomina_fondeo: 'Nómina · fondeo General → Nómina (repartida R1)', nomina_directa: 'Nómina · pago directo (repartida R1)', nomina_fondeo_lado_nomina: 'Nómina · fondeo leído en Nómina (repartida R1)',
    info_abono_sin_clasificar: 'Abono sin renglón (informativo)', info_entrada_financiamiento: 'Abono · financiamiento recibido', info_devolucion_recibida: 'Abono · devolución recibida', info_anticipo_conmet_cobrado: 'Abono · cobro de Conmet',
    info_fondeo_jeeves_odoo: 'Jeeves · fondeo registrado', info_payana_entrada: 'Payana · entrada', info_cobro_cliente: 'Abono · cobro de cliente', info_anticipo_cliente: 'Abono · anticipo de cliente',
    info_aportacion_socio: 'Abono · aportación de socio', info_traspaso_recibido: 'Abono · traspaso propio', otros_ingresos: 'Otros ingresos' };
  const grupos = {}, ordenK = [];
  for (const i of items) { if (!i.mov) continue; if (!grupos[i.mov]) { grupos[i.mov] = []; ordenK.push(i.mov); } grupos[i.mov].push(i); }
  for (const k of ordenK) {
    const g = grupos[k], i0 = g[0], mayor = g.slice().sort((a, b) => Math.abs(b.bruto) - Math.abs(a.bruto))[0];
    const pz = g.map(i => [renglonPieza(i.destino), i.neto]);
    const ca = mayor.destino;
    if (!ve.catLabels[ca]) ve.catLabels[ca] = ETQ[ca] || etiquetaRenglon[renglonPieza(ca) || ''] || ca.replace(/_/g, ' ');
    ve.movs.push({ k, f: i0.fuente === 'banco' ? 'banco' : (i0.cuenta.indexOf('Jeeves') === 0 ? 'jeeves' : 'payana'), fe: i0.fecha, m: i0.periodo, cu: i0.cuenta + (i0.mask ? ' ' + i0.mask : ''), co: enmascarar(i0.concepto),
      cp: String(i0.contraparte || i0.proveedor || ''), t: i0.tipo_mov, b: g.reduce((a, i) => a + i.bruto, 0), n: g.reduce((a, i) => a + i.neto, 0), cf: g.some(i => !!i.cfdi), cx: g.some(i => i.conmet),
      ca, cat: ve.catLabels[ca] + (g.length > 1 ? ' (partido en ' + g.length + ')' : ''), rg: String(mayor.regla || ''), o: i0.fuente === 'banco' ? (i0.archivo || '') + ' · p. ' + (i0.pagina || '') : String(i0.id).replace(/#.*$/, ''),
      pz, ex: pz.every(x => !x[0]), pi: g.some(i => i.destino.indexOf('partida_') === 0),
      rc: i0.reclas ? (i0.reclas.fuente === 'movimiento' ? 'archivo ' + i0.reclas.archivo + ' · ' + i0.reclas.aplicada_en + ' · Esteban' : 'regla de Esteban ' + i0.reclas.regla_id) : '' });
  }

  // ═══ archivos privados ═══
  const nv = out.decision.version || (opciones.ultima_version && opciones.ultima_version.version) || 1;
  const etq = opciones.etiqueta ? String(opciones.etiqueta).replace(/[^0-9A-Za-z.]/g, '') : 'v' + nv;   // p. ej. «v1.1»; por omisión vN
  const colsV = COLS.concat(['acum']);
  const celdaCsv = (l, p) => l.es_pct ? (l.vals[p] === null ? '' : (l.vals[p] / 100).toFixed(2) + '%') : (l.vals[p] / 100).toFixed(2);
  const csvVista = V => csv([['concepto'].concat(colsV.map(nombreMes), ['movimientos', 'fuente'])].concat(V.lineas.map(l => [l.etiqueta].concat(colsV.map(p => celdaCsv(l, p)), [l.n == null ? '' : l.n, l.fuente || '']))));
  const csvPuente = csv([['concepto'].concat(MESES.concat(['acum']).map(nombreMes))].concat(pz.puente.map(l => [l.etiqueta].concat(MESES.concat(['acum']).map(p => (l.vals[p] / 100).toFixed(2)))),
    [['diferencia contra el estado'].concat(MESES.concat(['acum']).map(p => (pz.cuadre[p] / 100).toFixed(2)))]));
  const csvMovs = csv([['fuente', 'id', 'periodo', 'fecha', 'cuenta', 'moneda', 'monto_original', 'tipo_cambio', 'bruto_mxn', 'sin_iva_mxn', 'iva_estimado', 'destino', 'regla', 'proveedor', 'cfdi', 'concepto', 'archivo', 'pagina', 'sha256']]
    .concat(ordenar(items, 'fecha', 'id').map(i => [i.fuente, i.id, i.periodo, i.fecha, i.cuenta + (i.mask ? ' ' + i.mask : ''), i.moneda, (i.monto_nat / 100).toFixed(2), i.tc || '', (i.bruto / 100).toFixed(2), (i.neto / 100).toFixed(2),
      i.iva_estimado ? 'si' : '', i.destino, i.regla || '', i.proveedor || '', i.cfdi ? i.cfdi.ref : '', i.concepto, i.archivo || '', i.pagina || '', i.sha256 || ''])));
  const csvVentas = csv([['tipo', 'id', 'documento', 'periodo', 'fecha', 'cliente', 'moneda', 'subtotal_original', 'tipo_cambio', 'subtotal_mxn', 'conmet', 'excluida']]
    .concat(ventas.map(v => ['orden', v.id, v.name, v.periodo, v.fecha, v.cliente, v.moneda, (v.monto_nat / 100).toFixed(2), v.tc || '', (v.mxn / 100).toFixed(2), v.conmet ? 'si' : '', v.excluida || '']))
    .concat(facturado.map(f => [f.move_type, f.id, f.name, f.periodo, f.fecha, f.cliente, 'MXN', (f.mxn / 100).toFixed(2), '', (f.mxn / 100).toFixed(2), f.conmet ? 'si' : '', f.excluida || ''])));
  const csvPartidas = csv([['movimiento_id', 'hash', 'periodo', 'fecha', 'cuenta', 'concepto', 'bruto_mxn', 'motivo', 'decision', 'archivo', 'pagina']]
    .concat(partidas.map(i => [i.mov_id, i.hash, i.periodo, i.fecha, i.cuenta + ' ' + i.mask, i.concepto, (i.bruto / 100).toFixed(2), i.motivo_partida || '', i.decidida || 'pendiente', i.archivo, i.pagina])));

  const RN = m.repartoNomina;
  const csvReparto = RN ? csv([['periodo', 'nomina_total_banco', 'a_proyectos', 'a_cuentas_comunes', 'sin_horas', 'pct_proyecto', 'base', 'mes_estimado', 'empleado_id', 'empleado', 'horas', 'peso', 'pct_proyecto_persona', 'fuente_pct']]
    .concat(...MESES.map(p => RN[p].personas.map(x => [p, (RN[p].N / 100).toFixed(2), (RN[p].costo / 100).toFixed(2), (RN[p].comun / 100).toFixed(2), (RN[p].sin / 100).toFixed(2), (RN[p].pct_proyecto * 100).toFixed(2),
      RN[p].base, RN[p].estimado ? 'si' : '', x.id, x.nombre, x.horas, Math.round(x.peso), (x.pct * 100).toFixed(2), x.fuente])))) : '';
  const CQ = m.conciliacion;
  const csvConc = csv([['intermediario', 'periodo', 'fondeos_desde_bbva', 'consumos_o_pagos', 'variacion_saldo', 'diferencia_mes', 'diferencia_acumulada', 'pendiente_de_fondear', 'diferencia_contra_bbva']]
    .concat(...['jeeves', 'payana', 'nomina'].map(k => MESES.map(p => { const x = CQ[k][p]; const f = v => v == null ? '' : (v / 100).toFixed(2);
      return [k, p, f(x.fondeos), f(x.consumos), f(x.var_saldo), f(x.dif_mes), f(x.acumulado), f(x.pendiente_fondear), f(x.diferencia)]; }))));
  const html = armarHTML({ A, B, C, pz, items, ventas, facturado, cobertura, supuestos, decisiones, partidas, conteos, baseC, sinC, huella, huellaInsumos,
    opciones, COLS, MESES, MV, incompletos, cambios, vd, ve, m, jeev, jSin, nv, etq, decision: out.decision });
  const cab = 'Estado de resultados ' + ANIO + ' ' + etq + ' (versión ' + nv + ') · Servicios FTS SA de CV · sin IVA · pesos · huella ' + huella.slice(0, 16) + '\n';
  const base = [
    ['vista_A.csv', csvVista(A)], ['vista_B_sin_Conmet.csv', csvVista(B)], ['vista_C_facturado.csv', csvVista(C)],
    ['puente.csv', csvPuente], ['movimientos.csv', csvMovs], ['ventas_y_facturas.csv', csvVentas], ['partidas_por_identificar.csv', csvPartidas],
    ['reparto_nomina.csv', csvReparto], ['conciliacion_bbva.csv', csvConc]];
  out.archivos = [];
  if (pz.cuadraTodo) {            // R3: si el puente no cuadra no se sobrescribe el actual ni se crea versión (S27)
    out.archivos.push({ nombre: 'ER_' + ANIO + '_actual.html', carpeta: '', tipo: 'text/html; charset=utf-8', contenido: html });
    if (out.decision.nueva_version) {
      out.archivos.push({ nombre: 'ER_' + ANIO + '_' + etq + '.html', carpeta: 'historial', tipo: 'text/html; charset=utf-8', contenido: html });
      for (const [n, c] of base) out.archivos.push({ nombre: 'ER_' + ANIO + '_' + etq + '_' + n, carpeta: 'historial', tipo: 'text/csv; charset=utf-8', contenido: cab + c });
    }
    for (const [n, c] of base) out.archivos.push({ nombre: 'ER_' + ANIO + '_actual_' + n, carpeta: '', tipo: 'text/csv; charset=utf-8', contenido: cab + c });
  }
  const f3 = k => [fmt(A.tot[k].acum), fmt(B.tot[k].acum), fmt(C.tot[k].acum)];
  out.correo = {
    asunto: 'Estado de resultados ' + ANIO + ' ' + etq + (out.decision.motivos.length ? ' · ' + out.decision.motivos[0] : ''),
    renglones: [['Ventas'].concat(f3('V')), ['Costo de ventas'].concat(f3('C')), ['Utilidad bruta'].concat(f3('UB')), ['Gastos administrativos'].concat(f3('GA')),
      ['Utilidad de operación'].concat(f3('UO')), ['Partidas por identificar'].concat(f3('PI')), ['Utilidad de operación después de partidas'].concat(f3('UOP'))],
    motivos: out.decision.motivos, cambios: cambios.map(c => [c.paso, fmt(c.efecto_uo), fmt(c.efecto_uop)]),
    cambios_v1: cambios.filter(c => c.grupo === 'v1').map(c => [c.paso, fmt(c.efecto_ub.A), fmt(c.efecto_ub.B), fmt(c.efecto_ub.C), fmt(c.efecto_abc.A), fmt(c.efecto_abc.B), fmt(c.efecto_abc.C)]),
    incompletos: incompletos.length ? incompletos.map(p => nombreMes(p) + ' (' + cobertura[p].estado.toLowerCase() + (cobertura[p].faltan.length ? ', faltan ' + cobertura[p].faltan.join(', ') : '') + ')').join('; ') : 'ninguno',
    nomina_pct: RN ? MESES.map(p => [nombreMes(p), pct(RN[p].costo, RN[p].N), pct(RN[p].comun, RN[p].N), pct(RN[p].sin, RN[p].N), RN[p].estimado ? 'estimado' : 'medido']) : [],
    conciliacion: ['jeeves', 'payana'].map(k => [k === 'jeeves' ? 'Jeeves' : 'Payana'].concat(MESES.map(p => fmt(CQ[k][p].acumulado)))),
    meses: MESES.map(nombreMes), etiqueta: etq,
    vista_d: 'Vista D: descarga el HTML y ábrelo en el navegador; marca cargos, pon el % de costo financiero y verás la utilidad hipotética (subtotal = bruto ÷ 1.16).',
  };
  return out;
}

// ═══ JavaScript de la Vista D (corre en el navegador, sin conexión) ═════════
function vistaDCliente() {
  var D = window.__VD, core = window.__escenarioCore, RET = window.__RET || (window.__RET = { sel: {}, pct: 0 });
  var st = { base: 'C', criterio: 'ult', pct: RET.pct, sel: RET.sel };
  var VE = window.__VE, todos = VE ? VE.movs.filter(function (m) { return m.t === 'cargo'; }).map(function (m) { return { id: m.k, mes: m.m, bruto: m.b, conmet: m.cx, renglon_er: (m.pz[0] || [])[0] }; }) : D.movs;
  var baseDe = function (b) { return b === 'E' ? (window.__veUOP ? window.__veUOP() : D.base.C) : D.base[b]; };
  var avisarE = function () { RET.sel = st.sel; RET.pct = st.pct; if (window.__vePintar) window.__vePintar(); };
  var $ = function (id) { return document.getElementById(id); };
  var money = function (c) { var n = Math.round(c), neg = n < 0; n = Math.abs(n); var e = Math.floor(n / 100), d = n % 100;
    return (neg ? '-' : '') + String(e).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + (d < 10 ? '0' : '') + d; };
  var nm = { '01': 'ene', '02': 'feb', '03': 'mar', '04': 'abr', '05': 'may', '06': 'jun', '07': 'jul', '08': 'ago', '09': 'sep', '10': 'oct', '11': 'nov', '12': 'dic' };
  var mesN = function (p) { return p === 'acum' ? 'Acumulado' : nm[p.slice(5)] + ' ' + p.slice(2, 4); };
  var escH = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var seleccion = function () { return Object.keys(st.sel).filter(function (k) { return st.sel[k]; }); };
  function movsBase() { return todos.filter(function (m) { return !(st.base !== 'A' && st.base !== 'E' && m.conmet); }); }
  function calc() { return core(baseDe(st.base), movsBase(), seleccion(), st.pct); }
  function pintarListas() {
    var h = '';
    D.meses.forEach(function (p) {
      var lista = D.movs.filter(function (m) { return m.mes === p && (st.criterio === 'ult' ? m.ult : m.top); });
      lista.sort(st.criterio === 'ult' ? function (a, b) { return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.renglon - a.renglon; } : function (a, b) { return b.bruto - a.bruto; });
      h += '<h4>' + mesN(p) + '</h4><div class="scroll"><table class="det vd"><tr><th></th><th>fecha</th><th>cuenta</th><th>concepto</th><th>contraparte</th><th class="n">monto bruto</th><th class="n">subtotal (÷1.16)</th><th>renglón</th><th>origen</th></tr>';
      lista.forEach(function (m) {
        var off = st.base !== 'A' && st.base !== 'E' && m.conmet;
        h += '<tr' + (st.sel[m.id] ? ' class="marcado"' : '') + '><td><input type="checkbox" data-id="' + m.id + '"' + (st.sel[m.id] ? ' checked' : '') + (off ? ' disabled title="Conmet no está en esta vista"' : '') + '></td><td>' + escH(m.fecha) +
          '</td><td>' + escH(m.cuenta) + '</td><td>' + escH(m.concepto) + '</td><td>' + escH(m.contraparte) + '</td><td class="n">' + money(m.bruto) + '</td><td class="n">' + money(m.bruto * 100 / 116) +
          '</td><td>' + escH(m.renglon_er) + '</td><td class="mut">' + escH(m.origen) + '</td></tr>';
      });
      if (!lista.length) h += '<tr><td colspan="9" class="mut">Sin cargos en este mes.</td></tr>';
      h += '</table></div>';
    });
    $('vd-listas').innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll('#vd-listas input[type=checkbox]'), function (c) {
      c.addEventListener('change', function () { if (c.checked) st.sel[c.getAttribute('data-id')] = true; else delete st.sel[c.getAttribute('data-id')]; pintar(); avisarE(); });
    });
  }
  function pintarBloque() {
    var r = calc(), cols = D.meses.concat(['acum']);
    var fila = function (et, k, bold) { return '<tr' + (bold ? ' class="lv1"' : '') + '><td>' + et + '</td>' + cols.map(function (p) { return '<td class="n">' + (k === 'n' ? r[p].n : money(r[p][k])) + '</td>'; }).join('') + '</tr>'; };
    var h = '<div class="scroll"><table class="er"><tr><th>Vista ' + st.base + '</th>' + cols.map(function (p) { return '<th class="n">' + mesN(p) + '</th>'; }).join('') + '</tr>' +
      fila('Utilidad de operación después de partidas (vista base)', 'base', true) + fila('+ Utilidad retenida hipotética (suma de subtotales)', 'subtotal') +
      fila('− Costo financiero de la utilidad retenida (' + st.pct + ' % del subtotal)', 'costo') + fila('= Utilidad hipotética', 'hipotetica', true) + fila('Movimientos seleccionados', 'n') + '</table></div>';
    var a = r.acum;
    h += '<p class="mut">Bruto seleccionado ' + money(a.bruto) + ' ÷ 1.16 = subtotal ' + money(a.subtotal) + '; ' + money(a.subtotal) + ' × ' + st.pct + ' % = costo financiero ' + money(a.costo) +
      '; ' + money(a.subtotal) + ' − ' + money(a.costo) + ' = utilidad retenida neta ' + money(a.neto) + '.</p>';
    $('vd-bloque').innerHTML = h;
    // resaltar el renglón de origen de lo seleccionado, sin restarlo
    var porId = {}; todos.forEach(function (x) { porId[x.id] = x; }); D.movs.forEach(function (x) { porId[x.id] = x; });
    var cuenta = {}; seleccion().forEach(function (id) { var m = porId[id]; if (m) cuenta[m.renglon_er] = (cuenta[m.renglon_er] || 0) + 1; });
    Array.prototype.forEach.call(document.querySelectorAll('tr[data-clave]'), function (tr) {
      var n = cuenta[tr.getAttribute('data-clave')] || 0, b = tr.querySelector('.vdbadge');
      if (b) b.textContent = n ? '● ' + n + ' en Vista D' : ''; tr.classList.toggle('vdsel', n > 0);
    });
    Array.prototype.forEach.call(document.querySelectorAll('tr[data-mov]'), function (tr) { tr.classList.toggle('vdsel', !!st.sel[tr.getAttribute('data-mov')]); });
  }
  function pintar() { pintarListas(); pintarBloque(); }
  var LS = 'fts_er_escenarios_v1';
  function leerEsc() { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } }
  function guardarEsc(o) { try { localStorage.setItem(LS, JSON.stringify(o)); return true; } catch (e) { return false; } }
  function pintarEsc() {
    var e = leerEsc(), nombres = Object.keys(e).sort();
    $('vd-cargar').innerHTML = '<option value="">(escenarios guardados)</option>' + nombres.map(function (n) { return '<option>' + escH(n) + '</option>'; }).join('');
    $('vd-comparar').innerHTML = nombres.map(function (n) { return '<label><input type="checkbox" class="vdcmp" value="' + escH(n) + '"> ' + escH(n) + '</label> '; }).join('') || '<span class="mut">No hay escenarios guardados en este navegador.</span>';
    Array.prototype.forEach.call(document.querySelectorAll('.vdcmp'), function (c) { c.addEventListener('change', comparar); });
  }
  function comparar() {
    var e = leerEsc(), elegidos = Array.prototype.filter.call(document.querySelectorAll('.vdcmp'), function (c) { return c.checked; }).map(function (c) { return c.value; });
    if (elegidos.length > 3) { alert('Máximo 3 escenarios.'); this.checked = false; return comparar(); }
    var h = '<div class="scroll"><table class="er"><tr><th>Escenario</th><th>Vista</th><th class="n">% costo fin.</th><th class="n">Movs.</th><th class="n">Bruto</th><th class="n">Subtotal</th><th class="n">Costo financiero</th><th class="n">Utilidad base</th><th class="n">Utilidad hipotética</th></tr>';
    elegidos.forEach(function (n) {
      var s = e[n]; var r = core(baseDe(s.base), todos.filter(function (m) { return !(s.base !== 'A' && s.base !== 'E' && m.conmet); }), s.sel, s.pct).acum;
      h += '<tr><td>' + escH(n) + '</td><td>' + s.base + '</td><td class="n">' + s.pct + '</td><td class="n">' + r.n + '</td><td class="n">' + money(r.bruto) + '</td><td class="n">' + money(r.subtotal) +
        '</td><td class="n">' + money(r.costo) + '</td><td class="n">' + money(r.base) + '</td><td class="n">' + money(r.hipotetica) + '</td></tr>';
    });
    $('vd-tabla-cmp').innerHTML = elegidos.length ? h + '</table></div>' : '';
  }
  $('vd-base').addEventListener('change', function () { st.base = this.value; pintar(); });
  $('vd-criterio').addEventListener('change', function () { st.criterio = this.checked ? 'top' : 'ult'; pintarListas(); });
  $('vd-pct').addEventListener('input', function () { var v = parseFloat(String(this.value).replace(',', '.')); st.pct = isNaN(v) ? 0 : Math.min(100, Math.max(0, v)); pintarBloque(); avisarE(); });
  $('vd-limpiar').addEventListener('click', function () { Object.keys(st.sel).forEach(function (k) { delete st.sel[k]; }); pintar(); avisarE(); });
  $('vd-guardar').addEventListener('click', function () {
    var n = String($('vd-nombre').value || '').trim() || ('Escenario ' + new Date().toISOString().slice(0, 16).replace('T', ' '));
    var e = leerEsc(); e[n] = { base: st.base, pct: st.pct, sel: seleccion(), guardado: new Date().toISOString() };
    $('vd-msg').textContent = guardarEsc(e) ? 'Guardado: ' + n : 'El navegador no permite guardar (modo privado). Usa Exportar.'; pintarEsc();
  });
  $('vd-cargar').addEventListener('change', function () { var e = leerEsc()[this.value]; if (!e) return; st.base = e.base; st.pct = e.pct; Object.keys(st.sel).forEach(function (k) { delete st.sel[k]; }); e.sel.forEach(function (i) { st.sel[i] = true; });
    $('vd-base').value = st.base; $('vd-pct').value = st.pct; pintar(); avisarE(); });
  $('vd-exportar').addEventListener('click', function () {
    var r = calc(), sel = {}; seleccion().forEach(function (i) { sel[i] = true; });
    var q = function (s) { s = String(s == null ? '' : s); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var L = [['vista_base', 'mes', 'fecha', 'cuenta', 'concepto', 'contraparte', 'renglon', 'bruto', 'subtotal', 'pct_costo_financiero', 'costo_financiero', 'utilidad_retenida_neta']];
    var info = {}; D.movs.forEach(function (x) { info[x.id] = x; }); if (VE) VE.movs.forEach(function (x) { if (!info[x.k]) info[x.k] = { fecha: x.fe, cuenta: x.cu, concepto: x.co, contraparte: x.cp, renglon_er: (x.pz[0] || [])[0] }; });
    movsBase().filter(function (m) { return sel[m.id]; }).forEach(function (m) { var sub = m.bruto * 100 / 116, cf = sub * st.pct / 100, x = info[m.id] || {};
      L.push([st.base, m.mes, x.fecha, x.cuenta, x.concepto, x.contraparte, x.renglon_er, (m.bruto / 100).toFixed(2), (sub / 100).toFixed(2), st.pct, (cf / 100).toFixed(2), ((sub - cf) / 100).toFixed(2)]); });
    L.push([]); L.push(['total', '', '', '', '', '', '', (r.acum.bruto / 100).toFixed(2), (r.acum.subtotal / 100).toFixed(2), st.pct, (r.acum.costo / 100).toFixed(2), (r.acum.neto / 100).toFixed(2)]);
    L.push(['utilidad_base', '', '', '', '', '', '', '', '', '', '', (r.acum.base / 100).toFixed(2)]); L.push(['utilidad_hipotetica', '', '', '', '', '', '', '', '', '', '', (r.acum.hipotetica / 100).toFixed(2)]);
    var blob = new Blob(['﻿' + L.map(function (f) { return f.map(q).join(','); }).join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'escenario_vista_' + st.base + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  });
  window.__vdEstado = st; window.__vdPintar = function () { st.sel = RET.sel; st.pct = RET.pct; $('vd-pct').value = st.pct; pintar(); };
  pintarEsc(); pintar();
}

// ═══ JavaScript de la Vista E (corre en el navegador, sin conexión) ═════════
function vistaECliente() {
  var D = window.__VE, core = window.__personalizadoCore, esCore = window.__escenarioCore, sha = window.__sha256;
  if (!D) return;
  var RET = window.__RET || (window.__RET = { sel: {}, pct: 0 });
  var $ = function (id) { return document.getElementById(id); };
  var money = function (c) { if (c == null || isNaN(c)) return '—'; var n = Math.round(c), neg = n < 0; n = Math.abs(n); var e = Math.floor(n / 100), d = n % 100;
    return (neg ? '-' : '') + String(e).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + (d < 10 ? '0' : '') + d; };
  var escH = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var nm = { '01': 'ene', '02': 'feb', '03': 'mar', '04': 'abr', '05': 'may', '06': 'jun', '07': 'jul', '08': 'ago', '09': 'sep', '10': 'oct', '11': 'nov', '12': 'dic' };
  var mesN = function (p) { return p === 'acum' ? 'Acumulado' : nm[p.slice(5)] + ' ' + p.slice(2, 4); };
  var pctTxt = function (x) { return x == null ? '—' : (Math.round(x * 1000) / 10).toFixed(1) + '%'; };
  var cat = {}; D.cat.forEach(function (c) { cat[c.clave] = c; });
  var movMap = {}; D.movs.forEach(function (m) { movMap[m.k] = m; });
  var S0 = function () { return { modo: 'reclasificacion', base: 'C', cambios: {}, reglas: [], ajMov: {}, ajRen: {} }; };
  var S = S0(), hist = [], fut = [], ui = { sel: {}, limite: 100, abierto: {}, partir: null };
  var LSB = 'fts_er_ve_borrador_v1', LSE = 'fts_er_ve_escenarios_v1';
  var ls = { get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } } };
  function snap() { return JSON.stringify({ S: S, ret: RET.sel, pct: RET.pct }); }
  function cambiar(fn) { hist.push(snap()); if (hist.length > 200) hist.shift(); fut = []; fn(); ls.set(LSB, JSON.parse(snap())); pintar(); if (window.__vdPintar) window.__vdPintar(); }
  function restaurar(txt) { var o = JSON.parse(txt); S = o.S; RET.sel = o.ret || {}; RET.pct = o.pct || 0; if (window.__vdEstado) { window.__vdEstado.sel = RET.sel; } }
  var opcionesDestino = function (tipo, sel) { return '<option value="">(sin cambio)</option>' + D.cat.filter(function (c) { return (tipo === 'abono') === (c.tipo === 'ingreso'); })
    .map(function (c) { return '<option value="' + c.clave + '"' + (c.clave === sel ? ' selected' : '') + '>' + escH(c.etiqueta) + '</option>'; }).join(''); };
  var opcionesProy = function (sel) { return '<option value="">(sin proyecto)</option>' + D.proyectos.map(function (p) { return '<option value="' + escH(p[0]) + '"' + (String(p[0]) === String(sel) ? ' selected' : '') + '>' + escH(p[1]) + '</option>'; }).join(''); };
  function calc() { return core(D, S); }
  function uopMap(r) { var o = {}; D.meses.concat(['acum']).forEach(function (p) { o[p] = r.tot.UOP[p]; }); return o; }
  window.__veUOP = function () { return uopMap(calc()); };
  // ── filtros ──
  function filtrados() {
    var f = { mes: $('ve-f-mes').value, cu: $('ve-f-cuenta').value, ca: $('ve-f-cat').value, ex: $('ve-f-excl').checked, pi: $('ve-f-pi').checked,
      min: parseFloat($('ve-f-min').value), max: parseFloat($('ve-f-max').value), tx: String($('ve-f-texto').value || '').toUpperCase().trim() };
    return D.movs.filter(function (m) {
      if (f.mes && m.m !== f.mes) return false; if (f.cu && m.cu !== f.cu) return false; if (f.ca && m.ca !== f.ca) return false;
      if (f.ex && !m.ex) return false; if (f.pi && !m.pi) return false;
      var a = Math.abs(m.b) / 100; if (!isNaN(f.min) && a < f.min) return false; if (!isNaN(f.max) && a > f.max) return false;
      if (f.tx && String(m.co + ' ' + m.cp).toUpperCase().indexOf(f.tx) < 0) return false;
      return true;
    });
  }
  // ── tabla de movimientos ──
  function pintarTabla(r) {
    var xs = filtrados(), esc = S.modo === 'escenario', h = '';
    h += '<p class="mut">' + xs.length + ' movimientos con los filtros (de ' + D.movs.length + '). Seleccionados: ' + Object.keys(ui.sel).filter(function (k) { return ui.sel[k]; }).length + '.</p>';
    h += '<div class="scroll"><table class="det ve"><tr><th><input type="checkbox" id="ve-todos"></th><th>id</th><th>fecha</th><th>cuenta</th><th>concepto</th><th>contraparte</th><th>tipo</th><th class="n">bruto</th><th class="n">subtotal usado</th><th>categoría actual</th><th>por qué</th><th>Mandar a…</th><th>proyecto</th><th>nota</th>' +
      (esc ? '<th>% ajuste</th><th>retener</th>' : '') + '<th>origen</th></tr>';
    xs.slice(0, ui.limite).forEach(function (m) {
      var ch = r.cambios[m.k], exp = S.cambios[m.k], parte1 = exp && exp.partes && exp.partes[0];
      var err = r.errores.filter(function (e) { return e.k === m.k; })[0];
      var dest = exp && exp.partes && exp.partes.length === 1 ? parte1.dest : '';
      h += '<tr class="' + (ch ? 'vecambio' : '') + (err ? ' bad' : '') + (RET.sel[m.k] ? ' marcado' : '') + '" data-k="' + escH(m.k) + '"><td><input type="checkbox" class="ve-sel"' + (ui.sel[m.k] ? ' checked' : '') + '></td>' +
        '<td class="mut">' + escH(m.k.slice(0, 14)) + '</td><td>' + escH(m.fe) + '</td><td>' + escH(m.cu) + '</td><td>' + escH(m.co) + '</td><td>' + escH(m.cp) + '</td><td>' + m.t + '</td>' +
        '<td class="n">' + money(m.b) + '</td><td class="n">' + money(m.n) + '</td><td>' + escH(m.cat) + (m.rc ? '<br><span class="tag2" title="' + escH(m.rc) + '">reclasificación vigente</span>' : '') + '</td>' +
        '<td class="mut">' + escH(m.rg) + '</td><td>' + (exp && exp.partes && exp.partes.length > 1 ? '<b>partido en ' + exp.partes.length + '</b> ' : '<select class="ve-dest">' + opcionesDestino(m.t, dest) + '</select> ') +
        '<button class="ve-partir" title="Partir entre varios destinos">Partir</button>' + (ch && !exp ? '<br><span class="tag2">por regla propuesta</span>' : '') + (err ? '<br><span class="bad">' + escH(err.motivo) + '</span>' : '') + '</td>' +
        '<td><select class="ve-proy">' + opcionesProy(parte1 ? parte1.proy : '') + '</select></td><td><input class="ve-nota" value="' + escH(exp && exp.nota || '') + '" style="width:9em"></td>' +
        (esc ? '<td><input type="number" class="ve-aj" min="-100" max="500" step="0.01" value="' + (S.ajMov[m.k] == null ? '' : S.ajMov[m.k]) + '" style="width:5.5em"></td><td>' + (m.t === 'cargo' ? '<input type="checkbox" class="ve-ret"' + (RET.sel[m.k] ? ' checked' : '') + '>' : '') + '</td>' : '') +
        '<td class="mut">' + escH(m.o) + '</td></tr>';
      if (ui.partir === m.k) h += '<tr class="dt"><td colspan="' + (esc ? 17 : 15) + '">' + editorPartir(m) + '</td></tr>';
    });
    h += '</table></div>' + (xs.length > ui.limite ? '<button id="ve-mas">Mostrar ' + Math.min(100, xs.length - ui.limite) + ' más</button>' : '');
    $('ve-tabla').innerHTML = h;
  }
  function editorPartir(m) {
    var exp = S.cambios[m.k], ps = (ui.partirPartes || (exp && exp.partes) || [{ dest: '', pct: 100, proy: '' }]).slice(0, 5);
    ui.partirPartes = ps;
    var suma = ps.reduce(function (a, x) { return a + (Number(x.pct) || 0); }, 0), ok = Math.abs(suma - 100) < 1e-9;
    var h = '<div class="vepartir"><b>Partir</b> ' + escH(m.co) + ' · bruto ' + money(m.b) + ' · subtotal ' + money(m.n) + '<div class="scroll"><table class="det"><tr><th>#</th><th>destino</th><th class="n">%</th><th class="n">bruto × %</th><th class="n">subtotal × %</th><th>proyecto</th><th></th></tr>';
    ps.forEach(function (x, i) {
      h += '<tr><td>' + (i + 1) + '</td><td><select data-i="' + i + '" class="vp-dest">' + opcionesDestino(m.t, x.dest) + '</select></td><td><input data-i="' + i + '" class="vp-pct" type="number" step="0.0001" min="0" max="100" value="' + x.pct + '" style="width:6em"></td>' +
        '<td class="n">' + money(m.b * (Number(x.pct) || 0) / 100) + '</td><td class="n">' + money(m.n * (Number(x.pct) || 0) / 100) + '</td><td><select data-i="' + i + '" class="vp-proy">' + opcionesProy(x.proy) + '</select></td><td>' + (ps.length > 1 ? '<button data-i="' + i + '" class="vp-quitar">quitar</button>' : '') + '</td></tr>';
    });
    h += '</table></div><span class="' + (ok ? 'ok' : 'bad') + '">Suma: ' + (Math.round(suma * 10000) / 10000) + ' %' + (ok ? '' : ' · debe ser exactamente 100 %') + '</span> ' +
      (ps.length < 5 ? '<button class="vp-agregar">+ parte</button> ' : '') + '<button class="vp-aplicar"' + (ok && ps.every(function (x) { return x.dest; }) ? '' : ' disabled') + '>Aplicar partición</button> <button class="vp-cancelar">Cancelar</button></div>';
    return h;
  }
  // ── estado personalizado ──
  function pintarEstado(r) {
    var cols = D.meses.concat(['acum']), T = r.tot, T0 = r.tot0, h = '';
    h += '<div class="scroll"><table class="er"><thead><tr><th>Estado personalizado · base Vista ' + r.base + (r.modo === 'escenario' ? ' · ESCENARIO' : '') + '</th>' + D.meses.map(function (p) { return '<th class="n">' + mesN(p) + '</th>'; }).join('') +
      '<th class="n acum">Acum. base</th><th class="n acum">Acum. personalizado</th><th class="n acum">Diferencia</th></tr></thead><tbody>';
    var fila = function (et, vals, v0, cls, clave) {
      var dif = vals.acum - v0.acum;
      return '<tr class="' + (cls || 'lv2') + '"><td>' + et + (clave ? ' <button class="ve-dsale" data-c="' + escH(clave) + '">¿de dónde sale?</button>' : '') + '</td>' + D.meses.map(function (p) { var d = vals[p] - v0[p]; return '<td class="n">' + money(vals[p]) + (Math.abs(d) >= 0.5 ? '<br><span class="vedif">' + (d > 0 ? '+' : '') + money(d) + '</span>' : '') + '</td>'; }).join('') +
        '<td class="n acum">' + money(v0.acum) + '</td><td class="n acum">' + money(vals.acum) + '</td><td class="n acum' + (Math.abs(dif) >= 0.5 ? ' vedifc' : '') + '">' + (Math.abs(dif) >= 0.5 ? (dif > 0 ? '+' : '') + money(dif) : '') + '</td></tr>';
    };
    var sec = function (s) { return r.lineas.filter(function (l) { return l.s === s; }); };
    var detalle = function (l) {
      if (!ui.abierto[l.c]) return '';
      var d = '<tr class="dt"><td colspan="' + (D.meses.length + 4) + '"><div class="vedet"><b>¿De dónde sale «' + escH(l.e) + '»?</b><br>1) Base v1 (con las reclasificaciones oficiales vigentes): ' + money(l.base.acum);
      var ent = l.det.filter(function (x) { return x.tipo === 'entra'; }), sal = l.det.filter(function (x) { return x.tipo === 'sale'; });
      var am = l.det.filter(function (x) { return x.tipo === 'ajuste_movimiento'; }), ar = l.det.filter(function (x) { return x.tipo === 'ajuste_renglon'; });
      var lst = function (xs) { return xs.slice(0, 40).map(function (x) { var m = movMap[x.k]; return '<li>' + escH(m ? m.fe + ' · ' + m.co : x.k) + ': ' + (x.monto > 0 ? '+' : '') + money(x.monto) + (x.pct != null && x.tipo !== 'entra' ? ' (' + x.pct + ' % sobre ' + money(x.sobre) + ')' : x.pct != null && x.pct !== 100 ? ' (' + x.pct + ' % del movimiento)' : '') + '</li>'; }).join('') + (xs.length > 40 ? '<li>… ' + (xs.length - 40) + ' más</li>' : ''); };
      var sum = function (xs) { return xs.reduce(function (a, x) { return a + x.monto; }, 0); };
      d += '<br>3) Reclasificado hacia aquí: +' + money(sum(ent)) + '<ul>' + lst(ent) + '</ul>3) Reclasificado fuera de aquí: ' + money(sum(sal)) + '<ul>' + lst(sal) + '</ul>';
      if (r.modo === 'escenario') {
        d += '4) Ajustes de % por movimiento: ' + money(sum(am)) + '<ul>' + lst(am) + '</ul>5) Ajuste de % del renglón: ' + money(sum(ar)) + '<ul>' +
          ar.map(function (x) { return '<li>' + mesN(x.mes) + ': ' + x.pct + ' % × ' + money(x.sobre) + ' = ' + money(x.monto) + '</li>'; }).join('') + '</ul>';
      }
      return d + '= ' + money(l.v.acum) + '</div></td></tr>';
    };
    var bloque = function (s) { return sec(s).map(function (l) { return fila(escH(l.e) + (l.nueva ? ' <span class="tag2">nuevo</span>' : ''), l.v, l.base, 'lv2', l.c) + detalle(l); }).join(''); };
    h += bloque('venta') + fila('Ventas', T.V, T0.V, 'lv1') + bloque('costo') + fila('Costo de ventas', T.C, T0.C, 'lv1') + fila('Utilidad bruta', T.UB, T0.UB, 'lv1');
    h += '<tr class="lv3"><td>Margen bruto</td>' + D.meses.map(function (p) { return '<td class="n">' + pctTxt(T.MB[p]) + '</td>'; }).join('') + '<td class="n acum">' + pctTxt(T0.MB.acum) + '</td><td class="n acum">' + pctTxt(T.MB.acum) + '</td><td class="n acum"></td></tr>';
    h += bloque('ga') + fila('Gastos administrativos', T.GA, T0.GA, 'lv1') + bloque('oi') + fila('Utilidad de operación', T.UO, T0.UO, 'lv1');
    h += '<tr class="lv3"><td>Margen de operación</td>' + D.meses.map(function (p) { return '<td class="n">' + pctTxt(T.MO[p]) + '</td>'; }).join('') + '<td class="n acum">' + pctTxt(T0.MO.acum) + '</td><td class="n acum">' + pctTxt(T.MO.acum) + '</td><td class="n acum"></td></tr>';
    h += bloque('pi') + fila('Utilidad de operación después de partidas', T.UOP, T0.UOP, 'lv1') + '</tbody></table></div>';
    $('ve-estado').innerHTML = h;
    // puente y diferencia contra el banco
    var p = '';
    if (r.modo === 'reclasificacion') p = r.puente.cuadra ? '<p class="ok">Puente en verde: el total de cargos del banco no cambia; sólo cambia a qué renglón va cada peso (' + r.aplicados.length + ' movimientos reclasificados).</p>'
      : '<p class="bad"><b>El puente NO cuadra: no se puede exportar.</b> ' + r.errores.map(function (e) { var m = movMap[e.k]; return escH((m ? m.fe + ' · ' + m.co : e.k).slice(0, 80) + ': ' + e.motivo); }).join(' · ') + '</p>';
    else {
      p = '<p class="bad">Escenario: difiere del banco en ' + money(r.difBanco) + ' por los ajustes de %.</p>' + (r.ajustes.length ? '<details><summary>Desglose (' + r.ajustes.length + ' ajustes)</summary><div class="scroll"><table class="det"><tr><th>tipo</th><th>qué</th><th>mes</th><th class="n">%</th><th class="n">sobre</th><th class="n">efecto</th></tr>' +
        r.ajustes.map(function (a) { var m = movMap[a.k]; return '<tr><td>' + a.tipo + '</td><td>' + escH(a.tipo === 'movimiento' ? (m ? m.fe + ' · ' + m.co : a.k) : a.c) + '</td><td>' + mesN(a.mes) + '</td><td class="n">' + a.pct + '</td><td class="n">' + money(a.sobre) + '</td><td class="n">' + money(a.monto) + '</td></tr>'; }).join('') + '</table></div></details>' : '');
      if (r.errores.length) p += '<p class="bad">Particiones inválidas (no se aplican): ' + r.errores.map(function (e) { return escH(e.motivo); }).join(' · ') + '</p>';
    }
    $('ve-puente').innerHTML = p;
    $('ve-exp-reclas').disabled = !(r.modo === 'reclasificacion' && r.puente.cuadra && (Object.keys(S.cambios).length || S.reglas.length));
    // mayores efectos
    $('ve-efectos').innerHTML = r.efectos.length ? '<div class="scroll"><table class="det"><tr><th>#</th><th>cambio</th><th>qué</th><th class="n">efecto en utilidad de operación</th><th class="n">después de partidas</th></tr>' +
      r.efectos.map(function (e, i) { return '<tr><td>' + (i + 1) + '</td><td>' + e.tipo + '</td><td>' + escH(e.mov) + '</td><td class="n">' + money(e.uo) + '</td><td class="n">' + money(e.uop) + '</td></tr>'; }).join('') + '</table></div>' : '<p class="mut">Sin cambios todavía.</p>';
    // utilidad retenida (misma regla y misma selección que la Vista D)
    if (r.modo === 'escenario') {
      var movs = D.movs.filter(function (m) { return m.t === 'cargo' && (r.base === 'A' || !m.cx); }).map(function (m) { return { id: m.k, mes: m.m, bruto: m.b }; });
      var sel = Object.keys(RET.sel).filter(function (k) { return RET.sel[k]; }), q = esCore(uopMap(r), movs, sel, RET.pct), a = q.acum;
      $('ve-ret').innerHTML = '<p><b>6) Utilidad retenida hipotética</b> (no se resta arriba) · % de costo financiero <input type="number" id="ve-pct" min="0" max="100" step="0.01" value="' + RET.pct + '" style="width:6em"></p><div class="scroll"><table class="er"><tr><th></th>' + cols.map(function (p) { return '<th class="n">' + mesN(p) + '</th>'; }).join('') + '</tr>' +
        [['Utilidad después de partidas (estado resultante)', 'base'], ['+ Utilidad retenida hipotética (Σ subtotales)', 'subtotal'], ['− Costo financiero', 'costo'], ['= Utilidad hipotética', 'hipotetica'], ['Movimientos retenidos', 'n']]
          .map(function (x) { return '<tr><td>' + x[0] + '</td>' + cols.map(function (p) { return '<td class="n">' + (x[1] === 'n' ? q[p].n : money(q[p][x[1]])) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>' +
        '<p class="mut">Bruto retenido ' + money(a.bruto) + ' ÷ 1.16 = subtotal ' + money(a.subtotal) + '; ' + money(a.subtotal) + ' × ' + RET.pct + ' % = costo financiero ' + money(a.costo) + '; ' + money(a.subtotal) + ' − ' + money(a.costo) + ' = utilidad retenida neta ' + money(a.neto) + '.</p>';
    } else $('ve-ret').innerHTML = '';
    // panel de renglones (escenario)
    if (r.modo === 'escenario') {
      var rs = r.lineas.filter(function (l) { return l.s === 'costo' || l.s === 'ga' || l.s === 'pi'; });
      $('ve-renglones').innerHTML = '<b>Ajuste de % por renglón</b> (se aplica después de las reclasificaciones y de los ajustes por movimiento)<div class="scroll"><table class="det"><tr><th>renglón</th><th>% (−100 a 500)</th><th>meses (ninguno marcado = todos)</th></tr>' +
        rs.map(function (l) { var a = S.ajRen[l.c] || {}; return '<tr data-c="' + escH(l.c) + '"><td>' + escH(l.e) + '</td><td><input type="number" class="vr-pct" min="-100" max="500" step="0.01" value="' + (a.pct == null ? '' : a.pct) + '" style="width:5.5em"></td><td>' +
          D.meses.map(function (p) { return '<label class="vrm"><input type="checkbox" class="vr-mes" value="' + p + '"' + ((a.meses || []).indexOf(p) >= 0 ? ' checked' : '') + '>' + mesN(p) + '</label>'; }).join(' ') + '</td></tr>'; }).join('') + '</table></div>';
    } else $('ve-renglones').innerHTML = '';
  }
  function pintarEsc() {
    var e = ls.get(LSE, {}), ns = Object.keys(e).sort();
    $('ve-cargar').innerHTML = '<option value="">(escenarios guardados)</option>' + ns.map(function (n) { return '<option>' + escH(n) + '</option>'; }).join('');
    $('ve-comparar').innerHTML = ns.map(function (n) { return '<label><input type="checkbox" class="vecmp" value="' + escH(n) + '"> ' + escH(n) + '</label> '; }).join('') || '<span class="mut">Sin escenarios guardados en este navegador.</span>';
  }
  function comparar() {
    var e = ls.get(LSE, {}), el = Array.prototype.filter.call(document.querySelectorAll('.vecmp'), function (c) { return c.checked; }).map(function (c) { return c.value; });
    if (el.length > 3) { $('ve-msg').textContent = 'Máximo 3 escenarios a la vez.'; el = el.slice(0, 3); }
    var filas = el.map(function (n) { var s = e[n]; var r = core(D, s.S); return { n: n, s: s, r: r }; });
    $('ve-tabla-cmp').innerHTML = filas.length ? '<div class="scroll"><table class="er"><tr><th>Escenario</th><th>modo · vista</th><th class="n">Ventas</th><th class="n">Costo</th><th class="n">Utilidad bruta</th><th class="n">Margen</th><th class="n">Gastos adm.</th><th class="n">Utilidad de operación</th><th class="n">Después de partidas</th></tr>' +
      filas.map(function (x) { var T = x.r.tot; return '<tr><td>' + escH(x.n) + '</td><td>' + x.r.modo + ' · ' + x.r.base + '</td><td class="n">' + money(T.V.acum) + '</td><td class="n">' + money(T.C.acum) + '</td><td class="n">' + money(T.UB.acum) + '</td><td class="n">' + pctTxt(T.MB.acum) +
        '</td><td class="n">' + money(T.GA.acum) + '</td><td class="n">' + money(T.UO.acum) + '</td><td class="n">' + money(T.UOP.acum) + '</td></tr>'; }).join('') + '</table></div>' : '';
    window.__veComparados = filas.map(function (x) { return { n: x.n, uo: x.r.tot.UO.acum, uop: x.r.tot.UOP.acum }; });
  }
  function pintar() {
    var r = calc();
    document.querySelector('#vE').classList.toggle('escenario', S.modo === 'escenario');
    $('ve-modo-r').checked = S.modo !== 'escenario'; $('ve-modo-e').checked = S.modo === 'escenario'; $('ve-base').value = S.base;
    Array.prototype.forEach.call(document.querySelectorAll('.ve-solo-esc'), function (x) { x.style.display = S.modo === 'escenario' ? '' : 'none'; });
    pintarEstado(r); pintarTabla(r);
    $('ve-reglas').innerHTML = S.reglas.length ? '<b>Reglas propuestas:</b> ' + S.reglas.map(function (x, i) { return escH(x.campo + ' contiene «' + x.texto + '» → ' + (cat[x.dest] || {}).etiqueta) + ' <button class="ve-qregla" data-i="' + i + '">quitar</button>'; }).join(' · ') : '';
    window.__veUltimo = r;
  }
  // ── exportar ──
  var q = function (s) { s = String(s == null ? '' : s); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function descargar(nombre, filas) {
    var blob = new Blob(['﻿' + filas.map(function (f) { return f.map(q).join(','); }).join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  }
  var sello = function () { var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '_' + z(d.getHours()) + z(d.getMinutes()); };
  function filasReclas() {
    var cab = D.columnas.slice(0, -1), rows = [];
    Object.keys(S.cambios).sort().forEach(function (k) {
      var m = movMap[k], c = S.cambios[k], ps = c.partes || [];
      ps.forEach(function (x, i) { rows.push([k, String(i + 1), String(ps.length), String(Number(x.pct)), m ? m.ca || m.cat : '', x.dest, String(x.proy || '').trim(), String(c.nota || '').trim(), 'movimiento', '', '', D.huella]); });
    });
    S.reglas.forEach(function (x) { rows.push(['', '1', '1', '100', '', x.dest, '', String(x.nota || '').trim(), 'regla', x.campo, String(x.texto).trim(), D.huella]); });
    var todo = [cab].concat(rows), h = sha(todo.map(function (f) { return f.map(q).join(','); }).join('\n'));
    return [D.columnas].concat(rows.map(function (f) { return f.concat([h]); }));
  }
  window.__veFilasReclas = filasReclas;
  // ── eventos ──
  var tabla = $('ve-tabla');
  tabla.addEventListener('change', function (ev) {
    var t = ev.target, tr = t.closest('tr[data-k]'), k = tr && tr.getAttribute('data-k'), m = k && movMap[k];
    if (t.id === 've-todos') { filtrados().slice(0, ui.limite).forEach(function (x) { ui.sel[x.k] = t.checked; }); return pintar(); }
    if (t.classList.contains('vp-dest') || t.classList.contains('vp-pct') || t.classList.contains('vp-proy')) {
      var i = +t.getAttribute('data-i'), ps = ui.partirPartes; ps[i][t.classList.contains('vp-dest') ? 'dest' : t.classList.contains('vp-pct') ? 'pct' : 'proy'] = t.classList.contains('vp-pct') ? (parseFloat(String(t.value).replace(',', '.')) || 0) : t.value; return pintar();
    }
    if (!m) return;
    if (t.classList.contains('ve-sel')) { ui.sel[k] = t.checked; return; }
    if (t.classList.contains('ve-dest')) cambiar(function () { if (t.value) S.cambios[k] = { partes: [{ dest: t.value, pct: 100, proy: (S.cambios[k] && S.cambios[k].partes[0] || {}).proy || '' }], nota: (S.cambios[k] || {}).nota || '' }; else delete S.cambios[k]; });
    else if (t.classList.contains('ve-proy')) cambiar(function () { var c = S.cambios[k]; if (c) c.partes.forEach(function (x) { x.proy = t.value; }); else if (t.value) $('ve-msg').textContent = 'Elige primero un destino para poder etiquetar el proyecto.'; });
    else if (t.classList.contains('ve-nota')) cambiar(function () { if (S.cambios[k]) S.cambios[k].nota = t.value; });
    else if (t.classList.contains('ve-aj')) cambiar(function () { var v = parseFloat(String(t.value).replace(',', '.')); if (isNaN(v) || !v) delete S.ajMov[k]; else S.ajMov[k] = Math.min(500, Math.max(-100, v)); });
    else if (t.classList.contains('ve-ret')) cambiar(function () { RET.sel[k] = t.checked; if (!t.checked) delete RET.sel[k]; });
  });
  tabla.addEventListener('click', function (ev) {
    var t = ev.target, tr = t.closest('tr[data-k]') || (t.closest('tr') && t.closest('tr').previousElementSibling), k = ui.partir || (tr && tr.getAttribute('data-k'));
    if (t.id === 've-mas') { ui.limite += 100; return pintar(); }
    if (t.classList.contains('ve-partir')) { var kk = t.closest('tr[data-k]').getAttribute('data-k'); ui.partir = ui.partir === kk ? null : kk; ui.partirPartes = S.cambios[kk] ? JSON.parse(JSON.stringify(S.cambios[kk].partes)) : [{ dest: '', pct: 100, proy: '' }]; return pintar(); }
    if (t.classList.contains('vp-agregar')) { ui.partirPartes.push({ dest: '', pct: 0, proy: '' }); return pintar(); }
    if (t.classList.contains('vp-quitar')) { ui.partirPartes.splice(+t.getAttribute('data-i'), 1); return pintar(); }
    if (t.classList.contains('vp-cancelar')) { ui.partir = null; ui.partirPartes = null; return pintar(); }
    if (t.classList.contains('vp-aplicar')) { var ps = ui.partirPartes; cambiar(function () { S.cambios[ui.partir] = { partes: ps.map(function (x) { return { dest: x.dest, pct: Number(x.pct), proy: x.proy || '' }; }), nota: (S.cambios[ui.partir] || {}).nota || '' }; ui.partir = null; ui.partirPartes = null; }); }
  });
  $('ve-estado').addEventListener('click', function (ev) { var t = ev.target; if (t.classList.contains('ve-dsale')) { var c = t.getAttribute('data-c'); ui.abierto[c] = !ui.abierto[c]; pintar(); } });
  $('ve-renglones').addEventListener('change', function (ev) {
    var t = ev.target, tr = t.closest('tr[data-c]'); if (!tr) return; var c = tr.getAttribute('data-c');
    cambiar(function () { var a = S.ajRen[c] || { pct: 0, meses: [] };
      if (t.classList.contains('vr-pct')) { var v = parseFloat(String(t.value).replace(',', '.')); a.pct = isNaN(v) ? 0 : Math.min(500, Math.max(-100, v)); }
      else a.meses = Array.prototype.filter.call(tr.querySelectorAll('.vr-mes'), function (x) { return x.checked; }).map(function (x) { return x.value; });
      if (!a.pct && !a.meses.length) delete S.ajRen[c]; else S.ajRen[c] = a; });
  });
  $('ve-ret').addEventListener('input', function (ev) { if (ev.target.id === 've-pct') { var v = parseFloat(String(ev.target.value).replace(',', '.')); RET.pct = isNaN(v) ? 0 : Math.min(100, Math.max(0, v)); if (window.__vdEstado) window.__vdEstado.pct = RET.pct; var r = window.__veUltimo; clearTimeout(ui.t); ui.t = setTimeout(function () { pintar(); if (window.__vdPintar) window.__vdPintar(); }, 250); } });
  ['ve-f-mes', 've-f-cuenta', 've-f-cat', 've-f-excl', 've-f-pi', 've-f-min', 've-f-max', 've-f-texto'].forEach(function (id) { $(id).addEventListener(id === 've-f-texto' || id === 've-f-min' || id === 've-f-max' ? 'input' : 'change', function () { ui.limite = 100; clearTimeout(ui.tf); ui.tf = setTimeout(pintar, 200); }); });
  $('ve-modo-r').addEventListener('change', function () { cambiar(function () { S.modo = 'reclasificacion'; }); });
  $('ve-modo-e').addEventListener('change', function () { cambiar(function () { S.modo = 'escenario'; }); });
  $('ve-base').addEventListener('change', function () { var v = this.value; cambiar(function () { S.base = v; }); });
  var seleccion = function () { return Object.keys(ui.sel).filter(function (k) { return ui.sel[k]; }); };
  $('ve-masivo').addEventListener('click', function () { var d = $('ve-masivo-dest').value; if (!d) return; var ks = seleccion().filter(function (k) { return (movMap[k].t === 'abono') === (cat[d].tipo === 'ingreso'); });
    cambiar(function () { ks.forEach(function (k) { S.cambios[k] = { partes: [{ dest: d, pct: 100, proy: '' }], nota: (S.cambios[k] || {}).nota || '' }; }); }); $('ve-msg').textContent = ks.length + ' movimientos enviados a «' + cat[d].etiqueta + '».'; });
  $('ve-regla-cp').addEventListener('click', function () { var d = $('ve-masivo-dest').value, k = seleccion()[0]; if (!d || !k) { $('ve-msg').textContent = 'Selecciona un movimiento y un destino.'; return; }
    var cp = movMap[k].cp; if (!cp || cp.length < 3) { $('ve-msg').textContent = 'Ese movimiento no tiene contraparte.'; return; }
    cambiar(function () { S.reglas.push({ campo: 'contraparte', texto: cp, dest: d }); }); });
  $('ve-regla-tx').addEventListener('click', function () { var d = $('ve-masivo-dest').value, tx = String($('ve-f-texto').value || '').trim(); if (!d || tx.length < 3) { $('ve-msg').textContent = 'Escribe al menos 3 letras en el filtro de texto y elige un destino.'; return; }
    cambiar(function () { S.reglas.push({ campo: 'descripcion', texto: tx, dest: d }); }); });
  $('ve-reglas').addEventListener('click', function (ev) { if (ev.target.classList.contains('ve-qregla')) { var i = +ev.target.getAttribute('data-i'); cambiar(function () { S.reglas.splice(i, 1); }); } });
  var ajMasivo = function (ks) { var v = parseFloat(String($('ve-aj-masivo').value).replace(',', '.')); if (isNaN(v)) return; v = Math.min(500, Math.max(-100, v)); cambiar(function () { ks.forEach(function (k) { if (v) S.ajMov[k] = v; else delete S.ajMov[k]; }); }); };
  $('ve-aj-sel').addEventListener('click', function () { ajMasivo(seleccion()); });
  $('ve-aj-cp').addEventListener('click', function () { var k = seleccion()[0]; if (!k) return; var cp = movMap[k].cp; ajMasivo(D.movs.filter(function (m) { return m.cp && m.cp === cp; }).map(function (m) { return m.k; })); });
  $('ve-aj-filtro').addEventListener('click', function () { ajMasivo(filtrados().map(function (m) { return m.k; })); });
  $('ve-deshacer').addEventListener('click', function () { if (!hist.length) return; fut.push(snap()); restaurar(hist.pop()); pintar(); if (window.__vdPintar) window.__vdPintar(); });
  $('ve-rehacer').addEventListener('click', function () { if (!fut.length) return; hist.push(snap()); restaurar(fut.pop()); pintar(); if (window.__vdPintar) window.__vdPintar(); });
  $('ve-limpiar-aj').addEventListener('click', function () { cambiar(function () { S.ajMov = {}; S.ajRen = {}; }); });
  $('ve-limpiar').addEventListener('click', function () { cambiar(function () { var m = S.modo, b = S.base; S = S0(); S.modo = m; S.base = b; RET.sel = {}; if (window.__vdEstado) window.__vdEstado.sel = RET.sel; }); });
  $('ve-guardar').addEventListener('click', function () {
    var e = ls.get(LSE, {}), n = String($('ve-nombre').value || '').trim() || ('Escenario ' + sello());
    if (!e[n] && Object.keys(e).length >= 5) { $('ve-msg').textContent = 'Ya hay 5 escenarios guardados: borra uno (cárgalo y guarda con el mismo nombre) o usa un nombre existente.'; return; }
    e[n] = { S: JSON.parse(JSON.stringify(S)), ret: RET.sel, pct: RET.pct, guardado: new Date().toISOString() };
    $('ve-msg').textContent = ls.set(LSE, e) ? 'Guardado: ' + n : 'El navegador no deja guardar (modo privado): exporta el escenario.'; pintarEsc();
  });
  $('ve-cargar').addEventListener('change', function () { var e = ls.get(LSE, {})[this.value]; if (!e) return; cambiar(function () { S = JSON.parse(JSON.stringify(e.S)); RET.sel = e.ret || {}; RET.pct = e.pct || 0; if (window.__vdEstado) { window.__vdEstado.sel = RET.sel; window.__vdEstado.pct = RET.pct; } }); });
  $('ve-comparar').addEventListener('change', comparar);
  $('ve-exp-reclas').addEventListener('click', function () { var r = calc(); if (!(r.modo === 'reclasificacion' && r.puente.cuadra)) return; descargar('reclasificaciones_' + sello() + '.csv', filasReclas()); });
  $('ve-exp-esc').addEventListener('click', function () {
    var r = calc(), f = [['tipo', 'id_movimiento', 'destino', 'porcentaje_parte', 'ajuste_pct', 'renglon', 'meses', 'retener', 'bruto', 'subtotal', 'nota']];
    Object.keys(S.cambios).forEach(function (k) { var m = movMap[k]; S.cambios[k].partes.forEach(function (x) { f.push(['reclasificacion', k, x.dest, x.pct, '', '', '', '', (m.b / 100).toFixed(2), (m.n / 100).toFixed(2), S.cambios[k].nota || '']); }); });
    S.reglas.forEach(function (x) { f.push(['regla', x.campo + ' contiene ' + x.texto, x.dest, 100, '', '', '', '', '', '', '']); });
    Object.keys(S.ajMov).forEach(function (k) { var m = movMap[k]; f.push(['ajuste_movimiento', k, '', '', S.ajMov[k], '', '', '', (m.b / 100).toFixed(2), (m.n / 100).toFixed(2), '']); });
    Object.keys(S.ajRen).forEach(function (c) { f.push(['ajuste_renglon', '', '', '', S.ajRen[c].pct, c, (S.ajRen[c].meses || []).join(' '), '', '', '', '']); });
    Object.keys(RET.sel).filter(function (k) { return RET.sel[k]; }).forEach(function (k) { var m = movMap[k]; if (m) f.push(['retener', k, '', '', '', '', '', RET.pct, (m.b / 100).toFixed(2), (m.b / 1.16 / 100).toFixed(2), '']); });
    f.push([]); f.push(['resultado', 'vista ' + r.base, r.modo, '', '', '', '', '', '', '', '']);
    [['Utilidad de operación', 'UO'], ['Después de partidas', 'UOP']].forEach(function (x) { f.push([x[0], 'base ' + (r.tot0[x[1]].acum / 100).toFixed(2), 'resultante ' + (r.tot[x[1]].acum / 100).toFixed(2), '', '', '', '', '', '', '', '']); });
    f.push(['diferencia contra el banco por ajustes de %', (r.difBanco / 100).toFixed(2), '', '', '', '', '', '', '', '', '']);
    descargar('escenario_' + sello() + '.csv', f);
  });
  var b = ls.get(LSB, null); if (b && b.S) { S = Object.assign(S0(), b.S); RET.sel = b.ret || RET.sel; RET.pct = b.pct || RET.pct; }
  var opt = function (xs) { return '<option value="">(todos)</option>' + xs.map(function (x) { return '<option value="' + escH(x[0]) + '">' + escH(x[1]) + '</option>'; }).join(''); };
  $('ve-f-mes').innerHTML = opt(D.meses.map(function (p) { return [p, mesN(p)]; }));
  $('ve-f-cuenta').innerHTML = opt(Array.from(new Set(D.movs.map(function (m) { return m.cu; }))).sort().map(function (x) { return [x, x]; }));
  $('ve-f-cat').innerHTML = opt(Array.from(new Set(D.movs.map(function (m) { return m.ca; }))).sort().map(function (x) { return [x, (D.catLabels[x] || x)]; }));
  $('ve-masivo-dest').innerHTML = '<option value="">(destino)</option>' + D.cat.map(function (c) { return '<option value="' + c.clave + '">' + escH(c.etiqueta) + '</option>'; }).join('');
  window.__vePintar = pintar; window.__veEstado = function () { return S; }; window.__veSet = function (s) { cambiar(function () { S = Object.assign(S0(), s); }); };
  pintarEsc(); pintar();
}

// ═══ HTML privado, autocontenido ═══════════════════════════════════════════
function armarHTML(z) {
  const { A, B, C, pz, items, ventas, facturado, cobertura, supuestos, decisiones, partidas, COLS, MESES, MV, cambios, vd, ve, m, jeev, jSin, nv, etq } = z;
  const cols = COLS.concat(['acum']);
  const celda = (l, p) => l.es_pct ? (l.vals[p] === null ? '—' : (l.vals[p] / 100).toFixed(1) + '%') : fmt(l.vals[p]);
  const detalleItems = lista => '<div class="scroll"><table class="det"><tr><th>fecha</th><th>cuenta</th><th>concepto</th><th>proveedor / CFDI</th><th class="n">bruto</th><th class="n">sin IVA</th><th>origen</th></tr>' +
    lista.map(i => '<tr' + (i.mov ? ' data-mov="' + esc(i.mov) + '"' : '') + '><td>' + esc(i.fecha) + '</td><td>' + esc(i.cuenta + (i.mask ? ' ' + i.mask : '')) + (i.moneda === 'USD' ? ' (USD ' + fmt(i.monto_nat) + ' × ' + i.tc + ')' : '') + '</td><td>' + esc(i.concepto) +
      (i.iva_estimado ? ' <span class="tag2">IVA estimado</span>' : '') + '</td><td>' + esc(i.proveedor || '') + (i.cfdi ? '<br><span class="mut">' + esc(i.cfdi.ref) + '</span>' : '') + '</td><td class="n">' + fmt(i.bruto) + '</td><td class="n">' + fmt(i.neto) + '</td><td class="mut">' +
      (i.fuente === 'banco' ? esc(i.archivo) + ' · p. ' + esc(i.pagina) + '<br>sha256 ' + esc(String(i.sha256 || '').slice(0, 16)) + '… · ' + esc(i.id) : esc(i.id)) + '</td></tr>').join('') + '</table></div>';
  const detalleVentas = (lista, esFact) => '<div class="scroll"><table class="det"><tr><th>documento</th><th>fecha</th><th>cliente</th><th class="n">subtotal</th><th class="n">pesos</th><th>origen</th></tr>' +
    lista.map(v => '<tr><td>' + esc(v.name) + '</td><td>' + esc(v.fecha) + '</td><td>' + esc(v.cliente) + '</td><td class="n">' + (esFact ? '' : esc(v.moneda) + ' ' + fmt(v.monto_nat) + (v.tc ? ' × ' + v.tc : '')) +
      '</td><td class="n">' + fmt(v.mxn) + '</td><td class="mut">' + (esFact ? 'account.move ' : 'sale.order ') + esc(v.id) + '</td></tr>').join('') + '</table></div>';
  const cabecera = () => '<thead><tr><th>Concepto</th>' + cols.map(p => {
    const c = cobertura[p]; const mal = c && c.estado !== 'completo';
    return '<th class="n' + (p === 'acum' ? ' acum' : '') + (p === MV ? ' sep' : '') + (mal ? ' inc' : '') + '">' + esc(nombreMes(p)) + (mal ? '<br><span class="tag">' + esc(c.estado) + '</span>' : '') + (p === MV ? '<br><span class="tag">sin banco todavía</span>' : '') + '</th>';
  }).join('') + '</tr></thead>';
  const tablaVista = (V, titulo, id, conDetalle, nota) => {
    let h = '<h2 id="' + id + '">' + esc(titulo) + '</h2>' + (nota ? '<p class="mut">' + nota + '</p>' : '') + '<div class="scroll"><table class="er">' + cabecera() + '<tbody>';
    for (const l of V.lineas) {
      h += '<tr class="lv' + l.nivel + '" data-clave="' + esc(l.clave) + '"><td>' + esc(l.etiqueta) + ' <span class="vdbadge"></span>' + (l.fuente ? '<div class="src">' + esc(l.fuente) + ' · ' + l.n + ' mov.</div>' : '') + '</td>' +
        cols.map(p => '<td class="n' + (p === 'acum' ? ' acum' : '') + (l.vals[p] < 0 && !l.es_pct ? ' neg' : '') + '">' + celda(l, p) + '</td>').join('') + '</tr>';
      if (conDetalle && (l.pred || l.ventas || l.facturas)) {
        const lista = l.pred ? ordenar(items.filter(l.pred), 'fecha', 'id') : l.ventas ? ventas.filter(l.ventas) : facturado.filter(l.facturas);
        if (lista.length) h += '<tr class="dt"><td colspan="' + (cols.length + 1) + '"><details><summary>Ver detalle (' + lista.length + ')</summary>' + (l.pred ? detalleItems(lista) : detalleVentas(lista, !!l.facturas)) + '</details></td></tr>';
      }
    }
    return h + '</tbody></table></div>';
  };
  const mesesP = MESES.concat(['acum']);
  let hp = '<h2 id="puente">Puente: del banco al estado (Vista A)</h2><div class="scroll"><table class="er"><thead><tr><th>Concepto</th>' + mesesP.map(p => '<th class="n' + (p === 'acum' ? ' acum' : '') + '">' + esc(nombreMes(p)) + '</th>').join('') + '</tr></thead><tbody>';
  for (const l of pz.puente) hp += '<tr class="' + (l.signo === '=' || l.clave === 'salidas' ? 'lv1' : 'lv2') + '"><td>' + esc(l.etiqueta) + '</td>' + mesesP.map(p => '<td class="n' + (p === 'acum' ? ' acum' : '') + '">' + fmt(l.vals[p]) + '</td>').join('') + '</tr>';
  hp += '<tr class="lv1 ' + (pz.cuadraTodo ? 'ok' : 'bad') + '"><td>Diferencia contra costo + gastos + partidas del estado</td>' + mesesP.map(p => '<td class="n">' + fmt(pz.cuadre[p]) + '</td>').join('') + '</tr></tbody></table></div>' +
    '<p class="' + (pz.cuadraTodo ? 'ok' : 'bad') + '">' + (pz.cuadraTodo ? 'El puente cuadra al centavo en todos los meses y en el acumulado.' : 'El puente NO cuadra; ver diferencias.') + '</p>';
  const c1 = cambios.filter(c => c.grupo === 'v1'), baseV1 = cambios.filter(c => c.grupo === 'v0').slice(-1)[0];
  const hCambios = '<h2 id="cambios">Qué cambió contra el v1 (acumulado)</h2><p class="mut">R1 y R2 sólo mueven pesos entre costo de ventas y gastos administrativos: cambian la utilidad bruta y el margen, y dejan casi igual la utilidad de operación (las diferencias de centavos vienen de partir montos).</p>' +
    '<div class="scroll"><table class="er"><tr><th>Ajuste (se encienden uno a uno)</th><th class="n">Efecto en utilidad bruta A</th><th class="n">B</th><th class="n">C</th><th class="n">Efecto en utilidad de operación A</th><th class="n">B</th><th class="n">C</th></tr>' +
    '<tr class="lv1"><td>v1 (reglas D1–D7): utilidad bruta A ' + fmt(baseV1.ub_abc.A) + ' · utilidad de operación A ' + fmt(baseV1.uo) + '</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>' +
    c1.map(c => '<tr><td>' + esc(c.paso) + '</td>' + ['A', 'B', 'C'].map(k => '<td class="n">' + fmt(c.efecto_ub[k]) + '</td>').join('') + ['A', 'B', 'C'].map(k => '<td class="n">' + fmt(c.efecto_abc[k]) + '</td>').join('') + '</tr>').join('') + '</table></div>' +
    '<h2>Qué cambió contra el v0 (Vista A, acumulado)</h2><div class="scroll"><table class="er"><tr><th>Decisión (se encienden una a una, en orden)</th><th class="n">Utilidad de operación</th><th class="n">Efecto</th><th class="n">Después de partidas</th><th class="n">Efecto</th></tr>' +
    cambios.map((c, k) => '<tr' + (k === 0 ? ' class="lv1"' : '') + '><td>' + esc(c.paso) + '</td><td class="n">' + fmt(c.uo) + '</td><td class="n">' + (k ? fmt(c.efecto_uo) : '') + '</td><td class="n">' + fmt(c.uop) + '</td><td class="n">' + (k ? fmt(c.efecto_uop) : '') + '</td></tr>').join('') +
    '</table></div><p class="mut">El renglón v0 reproduce las reglas del v0 sobre los insumos de hoy (puede diferir del v0 publicado si llegaron datos nuevos).</p>';
  // R1: reparto de nómina, con «¿de dónde sale?» por mes (nombres sólo en este HTML privado)
  const RN = z.m.repartoNomina;
  const hNomina = !RN ? '' : '<h2 id="nomina">Reparto de nómina por horas (R1) · ¿de dónde sale?</h2>' +
    '<p class="mut">Nómina total del mes del banco (fondeos General → Nómina + pagos de nómina desde la General) repartida entre las personas en proporción a su peso (Carga MO desde la semana 28; horas de asistencia antes). A cada persona se le aplica su % a proyecto; el resto es cuentas comunes. La suma de los tres renglones es la nómina total del banco, al centavo.</p>' +
    '<div class="scroll"><table class="er"><thead><tr><th>mes</th><th class="n">nómina total banco</th><th class="n">a proyectos</th><th class="n">a cuentas comunes</th><th class="n">sin horas</th><th class="n">% proyecto</th><th>base</th><th>personas: medidas · historial · % global · sin horas</th></tr></thead><tbody>' +
    MESES.map(p => { const r = RN[p]; return '<tr' + (r.estimado ? ' class="inc"' : '') + '><td>' + esc(nombreMes(p)) + (r.estimado ? ' <span class="tag">reparto de nómina estimado</span>' : '') + '</td><td class="n">' + fmt(r.N) + '</td><td class="n">' + fmt(r.costo) + '</td><td class="n">' + fmt(r.comun) + '</td><td class="n">' + fmt(r.sin) +
      '</td><td class="n">' + pct(r.costo, r.N) + '</td><td>' + esc(r.base) + '</td><td>' + r.cuenta.medido + ' · ' + r.cuenta.historial + ' · ' + r.cuenta.global + ' · ' + r.cuenta.sin_horas + '</td></tr>' +
      '<tr class="dt"><td colspan="8"><details><summary>¿de dónde sale ' + esc(nombreMes(p)) + '? (' + r.personas.length + ' personas)</summary><div class="scroll"><table class="det"><tr><th>persona</th><th class="n">horas</th><th class="n">peso</th><th class="n">% a proyecto</th><th>cómo se obtuvo</th><th class="n">nómina asignada</th><th class="n">a proyecto</th></tr>' +
      (() => { const W = r.personas.reduce((a, x) => a + x.peso, 0); return r.personas.map(x => { const asig = W ? r.N * x.peso / W : 0; return '<tr><td>' + esc(x.nombre) + '</td><td class="n">' + x.horas + '</td><td class="n">' + fmt(Math.round(x.peso)) + '</td><td class="n">' + (x.pct * 100).toFixed(1) + '%</td><td>' + esc(x.fuente) + '</td><td class="n">' + fmt(Math.round(asig)) + '</td><td class="n">' + fmt(Math.round(x.tipo === 'sin_horas' ? 0 : asig * x.pct)) + '</td></tr>'; }).join(''); })() +
      '</table></div></details></td></tr>'; }).join('') + '</tbody></table></div><p class="mut">% global usado para quien no tiene ningún mes medido: ' + (RN.global * 100).toFixed(1) + ' %.</p>';
  // R3: conciliación de intermediarios contra BBVA
  const CQ = z.m.conciliacion;
  const filaC = (et, k, campo, cls) => '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + et + '</td>' + MESES.map(p => { const v = CQ[k][p][campo]; return '<td class="n' + (v && campo === 'diferencia' ? ' bad' : '') + '">' + (v == null ? '—' : fmt(v)) + '</td>'; }).join('') + '</tr>';
  const hConc = '<h2 id="bbva">Conciliación contra BBVA (R3): todo peso del estado sale de BBVA</h2><p class="mut">Sin saldo de Jeeves ni de Payana en los insumos: se muestra la diferencia ACUMULADA entre fondeos desde BBVA y consumos o pagos (S26). Negativa = pendiente de fondear desde BBVA; positiva = diferencia contra BBVA (saldo sin gastar o faltante por explicar). Nunca se reparte ni se esconde.</p>' +
    '<div class="scroll"><table class="er"><thead><tr><th>Concepto</th>' + MESES.map(p => '<th class="n">' + esc(nombreMes(p)) + '</th>').join('') + '</tr></thead><tbody>' +
    '<tr class="lv1"><td>Jeeves</td>' + MESES.map(() => '<td></td>').join('') + '</tr>' + filaC('fondeos desde BBVA', 'jeeves', 'fondeos') + filaC('consumos − devoluciones', 'jeeves', 'consumos') + filaC('diferencia del mes', 'jeeves', 'dif_mes') + filaC('pendiente de fondear desde BBVA (acumulado)', 'jeeves', 'pendiente_fondear') + filaC('Diferencia contra BBVA (acumulada)', 'jeeves', 'diferencia', 'lv1') +
    '<tr class="lv1"><td>Payana</td>' + MESES.map(() => '<td></td>').join('') + '</tr>' + filaC('fondeos desde BBVA', 'payana', 'fondeos') + filaC('pagos', 'payana', 'consumos') + filaC('diferencia del mes', 'payana', 'dif_mes') + filaC('pendiente de fondear desde BBVA (acumulado)', 'payana', 'pendiente_fondear') + filaC('Diferencia contra BBVA (acumulada)', 'payana', 'diferencia', 'lv1') +
    '<tr class="lv1"><td>Nómina</td>' + MESES.map(() => '<td></td>').join('') + '</tr>' + filaC('fondeos General → Nómina', 'nomina', 'fondeos') + filaC('dispersiones de la cuenta Nómina', 'nomina', 'consumos') + filaC('variación del saldo de la cuenta Nómina', 'nomina', 'var_saldo') +
    filaC('Diferencia contra BBVA (fondeos − dispersiones − variación de saldo; — = sin estado de Nómina)', 'nomina', 'dif_mes', 'lv1') + '</tbody></table></div>' +
    '<p class="mut">El auditor (#346) tomará esta conciliación como chequeo del Objetivo 2 cuando se active (documentado, no activado).</p>';
  const cob = '<div class="scroll"><table class="det"><tr><th>mes</th><th>estado</th><th>nota</th></tr>' + MESES.map(p => '<tr><td>' + esc(nombreMes(p)) + '</td><td class="' + (cobertura[p].estado === 'completo' ? 'ok' : 'bad') + '">' + esc(cobertura[p].estado) +
    '</td><td>' + esc(cobertura[p].nota || 'General, Nómina y USD validados') + '</td></tr>').join('') + (MV ? '<tr><td>' + esc(nombreMes(MV)) + '</td><td>sólo ventas</td><td>sin banco todavía</td></tr>' : '') + '</table></div>';
  const estimados = z.m.repartoNomina ? MESES.filter(p => z.m.repartoNomina[p].estimado) : [];
  const alertaNomina = estimados.length ? '<p class="alerta">Reparto de nómina estimado en ' + estimados.map(nombreMes).join(', ') + ': esos meses no tienen horas con proyecto ni bolsa en Odoo; se usa el historial de cada persona o el % global (R1, S24).</p>' : '';
  const conmet = z.m.conmetMes, contr = z.m.contrato;
  const hConmet = '<h2 id="conmet">Conmet por avance de obra (D7)</h2><p>Contrato sin IVA ' + fmt(contr) + ' · costo total estimado ' + fmt(z.m.estimado) + (z.m.estimado === contr ? ' (margen cero: sin estimado en Odoo)' : '') + '</p><div class="scroll"><table class="det"><tr><th>mes</th><th class="n">costo incurrido acumulado</th><th class="n">% avance</th><th class="n">venta reconocida acumulada</th><th class="n">venta del mes</th><th class="n">cobrado acumulado sin IVA</th></tr>' +
    MESES.map(p => '<tr><td>' + nombreMes(p) + '</td><td class="n">' + fmt(conmet[p].costo_acum) + '</td><td class="n">' + (conmet[p].avance * 100).toFixed(2) + '%</td><td class="n">' + fmt(conmet[p].reconocido_acum) + '</td><td class="n">' + fmt(conmet[p].venta) + '</td><td class="n">' + fmt(conmet[p].cobrado_acum) + '</td></tr>').join('') + '</table></div>';
  const excl = ['excl_cubierto_fondeo_nomina', 'excl_traspaso', 'excl_fondeo_payana', 'excl_fondeo_jeeves', 'excl_financiamiento', 'excl_devolucion', 'activo_fijo', 'info_entrada_financiamiento', 'info_devolucion_recibida', 'info_fondeo_jeeves_odoo', 'info_anticipo_conmet_cobrado'];
  const hExcl = excl.map(d => { const l = ordenar(items.filter(i => i.destino === d), 'fecha', 'id'); return '<details><summary>' + esc(d) + ' · ' + l.length + ' mov. · ' + fmt(l.reduce((s, i) => s + i.bruto, 0)) + '</summary>' + detalleItems(l) + '</details>'; }).join('');
  const pc = ordenar(items.filter(i => i.destino === 'costo_payana_sin_clasificar'), 'fecha', 'id');
  const jsin = ordenar(jSin, 'bruto').reverse().slice(0, 60);
  const hJeeves = '<p>Jeeves: ' + jeev.length + ' consumos; ' + jSin.length + ' sin clasificar (' + pct(jSin.reduce((s, i) => s + i.bruto, 0), jeev.reduce((s, i) => s + i.bruto, 0)) + ' del monto). Los 60 más grandes sin clasificar:</p>' + detalleItems(jsin);
  const vdHtml = '<h2 id="vD">Vista D · escenarios hipotéticos de utilidad retenida</h2>' +
    '<p class="leyenda">Escenario hipotético. No es un registro contable ni cambia el estado de resultados. El subtotal se calcula dividiendo el monto bruto entre 1.16 para todo movimiento seleccionado.</p>' +
    '<p class="mut">Si el visor de OneDrive no ejecuta esta sección, descarga el archivo y ábrelo en el navegador; funciona sin conexión.</p>' +
    '<div class="vdctl"><label>Vista base <select id="vd-base"><option value="A">A</option><option value="B">B</option><option value="C" selected>C</option><option value="E">E (estado personalizado)</option></select></label> ' +
    '<label><input type="checkbox" id="vd-criterio"> Mostrar los 10 más grandes del mes (en vez de los últimos 10)</label> ' +
    '<label>% de costo financiero <input type="number" id="vd-pct" value="0" min="0" max="100" step="0.01" style="width:6em"></label> ' +
    '<button id="vd-limpiar">Limpiar selección</button> <input id="vd-nombre" placeholder="nombre del escenario"> <button id="vd-guardar">Guardar escenario</button> ' +
    '<select id="vd-cargar"></select> <button id="vd-exportar">Exportar escenario</button> <span id="vd-msg" class="mut"></span></div>' +
    '<div id="vd-bloque"></div><p><b>Comparar escenarios guardados</b> (máximo 3): <span id="vd-comparar"></span></p><div id="vd-tabla-cmp"></div><div id="vd-listas"></div>' +
    '<noscript><p class="alerta">Este visor no ejecuta JavaScript: descarga el archivo y ábrelo en el navegador para usar la Vista D.</p></noscript>';
  const veHtml = '<h2 id="vE">Vista E · reclasificación personalizada y escenarios</h2>' +
    '<p class="leyenda">Los cambios en esta vista son una propuesta hasta que exportes y subas el archivo a la carpeta de Reclasificaciones.</p>' +
    '<p class="alerta ve-solo-esc" style="display:none">Modo escenario. Estos números no son contables ni cambian el estado de resultados oficial.</p>' +
    '<p class="mut">Si el visor de OneDrive no ejecuta esta sección, descarga el archivo y ábrelo en el navegador; funciona sin conexión. Orden de cálculo: 1) clasificación del v1 (reglas y tablas editables) · 2) reclasificaciones oficiales vigentes · 3) reclasificaciones y particiones de este escenario · 4) ajustes de % por movimiento · 5) ajustes de % por renglón · 6) utilidad retenida hipotética y su costo financiero.</p>' +
    '<div class="vdctl"><b>Modo</b> <label><input type="radio" name="ve-modo" id="ve-modo-r" checked> Reclasificación (puede volverse oficial)</label> <label><input type="radio" name="ve-modo" id="ve-modo-e"> Escenario (sólo hipotético)</label> ' +
    '<label>Vista base <select id="ve-base"><option>A</option><option>B</option><option selected>C</option></select></label></div>' +
    '<div class="vdctl"><button id="ve-deshacer">Deshacer</button> <button id="ve-rehacer">Rehacer</button> <button id="ve-limpiar-aj" class="ve-solo-esc" style="display:none">Limpiar ajustes de %</button> <button id="ve-limpiar">Limpiar todo</button> ' +
    '<input id="ve-nombre" placeholder="nombre del escenario"> <button id="ve-guardar">Guardar escenario</button> <select id="ve-cargar"></select> ' +
    '<button id="ve-exp-reclas" disabled>Exportar reclasificaciones</button> <button id="ve-exp-esc">Exportar escenario</button> <span id="ve-msg" class="mut"></span></div>' +
    '<p class="mut">El borrador se guarda solo en este navegador. «Exportar reclasificaciones» descarga reclasificaciones_AAAAMMDD_HHMM.csv (sólo en modo reclasificación y con el puente en verde); súbelo a Estados de resultados/Reclasificaciones y el recálculo de cada 30 minutos lo aplica o lo rechaza completo, con correo. «Exportar escenario» es sólo informativo: si se sube a la carpeta, se rechaza.</p>' +
    '<div id="ve-estado"></div><div id="ve-puente"></div><div id="ve-ret" class="ve-solo-esc"></div><div id="ve-renglones" class="ve-solo-esc"></div>' +
    '<h4>Mayores efectos del escenario</h4><div id="ve-efectos"></div><p><b>Comparar escenarios guardados</b> (hasta 5 guardados, máximo 3 a la vez): <span id="ve-comparar"></span></p><div id="ve-tabla-cmp"></div>' +
    '<h4>Movimientos</h4><div class="vdctl"><label>Mes <select id="ve-f-mes"></select></label> <label>Cuenta <select id="ve-f-cuenta"></select></label> <label>Categoría actual <select id="ve-f-cat"></select></label> ' +
    '<label><input type="checkbox" id="ve-f-excl"> sólo excluidos</label> <label><input type="checkbox" id="ve-f-pi"> sólo partidas por identificar</label> ' +
    '<label>Monto de <input id="ve-f-min" type="number" style="width:7em"> a <input id="ve-f-max" type="number" style="width:7em"></label> <label>Texto en concepto o contraparte <input id="ve-f-texto" style="width:12em"></label></div>' +
    '<div class="vdctl"><select id="ve-masivo-dest"></select> <button id="ve-masivo">Mandar seleccionados a…</button> <button id="ve-regla-cp" title="Propuesta de REGLA: todos los de la contraparte del primer seleccionado">Aplicar a todos los de esta contraparte</button> ' +
    '<button id="ve-regla-tx" title="Propuesta de REGLA: todos los que contengan el texto del filtro">…a todos los que contengan este texto</button> ' +
    '<span class="ve-solo-esc" style="display:none">% de ajuste <input id="ve-aj-masivo" type="number" min="-100" max="500" step="0.01" style="width:6em"> <button id="ve-aj-sel">a los seleccionados</button> <button id="ve-aj-cp">a toda la contraparte</button> <button id="ve-aj-filtro">a todos los del filtro</button></span></div>' +
    '<div id="ve-reglas" class="mut"></div><div id="ve-tabla"></div>' +
    '<noscript><p class="alerta">Este visor no ejecuta JavaScript: descarga el archivo y ábrelo en el navegador para usar la Vista E.</p></noscript>';
  const css = ':root{--bg:#fff;--fg:#1a1a1a;--mut:#666;--line:#e3e3e3;--head:#f5f5f3;--acc:#0f5132;--bad:#b42318;--ok:#1e7b34;--sep:#fff7e0;--sel:#fff3bf}' +
    '@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#eee;--mut:#9a9a9a;--line:#333;--head:#222;--acc:#7dd3a8;--bad:#ff8a80;--ok:#7dd3a8;--sep:#2b2616;--sel:#3a3314}}' +
    'body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,Segoe UI,Arial,sans-serif;margin:0;padding:24px 16px;max-width:1600px;overflow-wrap:anywhere}' +
    'h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}h4{margin:14px 0 4px}.mut,.src{color:var(--mut);font-size:12px}' +
    '.scroll{overflow-x:auto;max-width:100%}table.er tr:not(.dt) td:first-child,table.er th:first-child{position:sticky;left:0;background:var(--bg);z-index:1;min-width:190px;max-width:280px}table.er th:first-child{background:var(--head);z-index:2}table.det td,table.det th{overflow-wrap:normal}' +
    'table{border-collapse:collapse}table.er{min-width:100%;font-variant-numeric:tabular-nums}th,td{border-bottom:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}' +
    'th{background:var(--head);font-weight:600}.n{text-align:right;white-space:nowrap}.acum{font-weight:600;background:var(--head)}.sep{background:var(--sep)}' +
    'tr.lv1 td{font-weight:700}tr.lv3 td{color:var(--mut);font-style:italic}tr.lv4 td{color:var(--mut)}tr.dt td{padding:0 8px 6px;border:0}.neg{color:var(--bad)}.tag{font-size:10px;font-weight:600;color:var(--bad)}.tag2{font-size:10px;color:var(--mut);border:1px solid var(--line);padding:0 4px;border-radius:3px}' +
    '.ok{color:var(--ok)}.bad{color:var(--bad)}.alerta{color:var(--bad);font-weight:700;border:1px solid var(--bad);padding:8px 10px;border-radius:4px}.leyenda{border-left:4px solid var(--acc);padding:6px 10px;background:var(--head)}' +
    'table.det{font-size:12px;margin:6px 0 10px}summary{cursor:pointer;color:var(--acc);font-size:12px}nav a{margin-right:14px;color:var(--acc);white-space:nowrap;display:inline-block;overflow-wrap:normal}tr.vdsel td,tr.marcado td{background:var(--sel)}.vdbadge{font-size:11px;color:var(--acc);font-weight:600}' +
    '.vdctl{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin:8px 0}.vdctl input,.vdctl select,.vdctl button{font:inherit}' +
    'tr.vecambio td{background:var(--sel)}.vedif{font-size:11px;color:var(--acc)}.vedifc{color:var(--acc)}.vedet{font-size:12px;padding:6px 0}.vedet ul{margin:2px 0 6px 18px;padding:0}.vepartir{border:1px solid var(--line);padding:8px;margin:4px 0}' +
    '.vdctl select{max-width:100%}.vdctl label{max-width:100%}#ve-f-cat,#ve-masivo-dest{max-width:min(22em,90vw)}table.ve select{max-width:15em}table.ve td{font-size:12px}.vrm{white-space:nowrap;margin-right:6px}#vE.escenario .leyenda{border-left-color:var(--bad)}button.ve-dsale{font-size:10px;padding:0 4px}';
  const datos = JSON.stringify(vd).replace(/</g, '\\u003c'), datosE = JSON.stringify(ve).replace(/</g, '\\u003c');
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Estado de resultados ' + ANIO + ' ' + esc(etq) + '</title><style>' + css + '</style></head><body>' +
    '<h1>Estado de resultados ' + ANIO + ' ' + esc(etq) + ' · preliminar</h1><div class="mut">Servicios FTS SA de CV · ' + esc(nombreMes(MESES[0])) + ' a ' + esc(nombreMes(MESES[MESES.length - 1])) + ' con banco' + (MV ? ', ' + esc(nombreMes(MV)) + ' sólo ventas' : '') + ' · pesos · <b>sin IVA</b> · privado<br>' +
    'Huella de resultados ' + esc(z.huella) + ' · huella de insumos ' + esc(z.huellaInsumos.slice(0, 16)) + '… · calcular.js ' + esc(VERSION) + (z.opciones.sha ? ' @ ' + esc(String(z.opciones.sha).slice(0, 7)) : '') + (z.opciones.generado_at ? ' · generado ' + esc(z.opciones.generado_at) + ' UTC' : '') + '</div>' +
    '<nav style="margin:12px 0"><a href="#vA">Vista A</a><a href="#vB">Vista B</a><a href="#vC">Vista C</a><a href="#vD">Vista D</a><a href="#vE">Vista E</a><a href="#puente">Puente</a><a href="#bbva">Conciliación BBVA</a><a href="#nomina">Reparto de nómina</a><a href="#cambios">Qué cambió</a><a href="#conmet">Conmet</a><a href="#cob">Meses</a><a href="#sup">Supuestos</a><a href="#pi">Partidas</a><a href="#tablas">Tablas editables</a></nav>' +
    alertaNomina + '<p>Costo sin CFDI ligado: <b>' + pct(z.sinC, z.baseC) + '</b> del costo sin nómina (' + pct(z.sinC, A.tot.C.acum) + ' del costo total). Jeeves sin clasificar: <b>' + jSin.length + '</b> consumos, ' + pct(jSin.reduce((s, i) => s + i.bruto, 0), jeev.reduce((s, i) => s + i.bruto, 0)) + ' del monto de Jeeves.</p>' +
    tablaVista(A, 'Vista A · ventas confirmadas, Conmet por avance de obra', 'vA', true) +
    tablaVista(B, 'Vista B · igual que A, sin Conmet (ni su venta ni sus costos)', 'vB', false, 'El detalle de cada renglón es el de la Vista A sin los movimientos de Conmet.') +
    tablaVista(C, 'Vista C · ventas = facturado en ' + ANIO + ', sin Conmet («lo ejecutado»)', 'vC', true, 'Mismos costos que la Vista B; cambia la venta.') +
    vdHtml + veHtml + hp + hConc + hNomina + hCambios + hConmet +
    '<h2 id="cob">Meses y cobertura bancaria</h2>' + cob +
    '<h2 id="sup">Supuestos</h2><div class="scroll"><table class="det">' + supuestos.map(s => '<tr><td>' + esc(s[0]) + '</td><td><b>' + esc(s[1]) + '</b></td><td>' + esc(s[2]) + '</td></tr>').join('') + '</table></div>' +
    '<h2 id="pi">Partidas por identificar (pendientes de Esteban)</h2><p>' + partidas.length + ' partidas, ' + fmt(partidas.reduce((s, i) => s + i.bruto, 0)) + '. Se deciden en bancos.partidas_identificadas.</p>' + detalleItems(partidas) +
    '<h2>Payana sin clasificar</h2><p>' + pc.length + ' pagos, ' + fmt(pc.reduce((s, i) => s + i.neto, 0)) + ' (dentro de costo).</p>' + detalleItems(pc) +
    '<h2>Jeeves sin clasificar</h2>' + hJeeves +
    '<h2 id="excl">Excluido del resultado (renglones informativos)</h2>' + hExcl +
    '<h2 id="tablas">Tablas editables</h2><ul><li><b>bancos.nomina_oficina</b> (corrección manual de R1): beneficiario = nombre de la persona como está en Odoo; esa persona va 100 % a cuentas comunes entre vigente_desde y vigente_hasta. Vacía = manda la regla de horas.</li>' +
    '<li><b>bancos.partidas_identificadas</b>: clasificacion = costo · pago_prestamo · devolucion_aportacion · traspaso_propio · otro, nota, fecha_decision.</li>' +
    '<li><b>bancos.reglas_edo_resultados</b>: reglas por patrón (concepto del banco, proveedor de Odoo, comercio de Jeeves).</li><li><b>bancos.er_parametros</b>: umbral de partidas, depreciación, costo estimado de Conmet.</li></ul>' +
    '<p class="mut">Cualquier cambio en estas tablas dispara el recálculo en los siguientes 30 minutos (7:00 a 21:00) y un correo a Esteban.</p>' +
    '<h2>Pendientes para Esteban</h2><ol>' + decisiones.map(d => '<li>' + esc(d) + '</li>').join('') + '</ol>' +
    '<p class="mut">Fuentes: base bancaria (vistas v_movimientos_validados, v_estados_validados, v_saldos_mensuales, rol bancos_er/bancos_lector) y Odoo en solo lectura. Issue #348.</p>' +
    '<script>window.__VD=' + datos + ';window.__VE=' + datosE + ';window.__RET={sel:{},pct:0};window.__escenarioCore=' + escenarioCore.toString() + ';window.__personalizadoCore=' + personalizadoCore.toString() +
    ';window.__sha256=' + sha256.toString() + ';(' + vistaECliente.toString() + ')();(' + vistaDCliente.toString() + ')();</script></body></html>';
}

module.exports = { calcular, motor, armarVistas, escenarioCore, personalizadoCore, decidir, sha256, canon, VERSION, validarReclasificaciones, huellaReclas, parseCsv, CSV_RECLAS_COLUMNAS, leerCatalogo };
