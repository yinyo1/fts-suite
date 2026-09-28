/* ═══════════════════════════════════════════════════════════════════════════
 * bancos/edo_resultados/calcular.js · Estado de resultados 2026 v0 (issue #348)
 *
 * Servicios FTS SA de CV (company_id = 1), enero a agosto 2026 con banco, septiembre sólo ventas.
 * Todo SIN IVA. Determinista: mismos insumos → misma huella. Sin montos ni cuentas en este archivo
 * (repo público): todo dato llega en `insumos`, que arma el workflow TMP de n8n leyendo la base
 * bancaria por las vistas v_* (rol bancos_lector) y Odoo en SOLO LECTURA.
 *
 * Corre igual en node (require) y dentro de un Code node de n8n (new Function con module/exports).
 * Aritmética en CENTAVOS enteros; los dólares se convierten con el tipo de cambio de Odoo.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const VERSION = 'er-2026-v0.2';
const MESES = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
const MES_VENTAS_SIN_BANCO = '2026-09';
const NOMBRE_MES = { '01': 'ene', '02': 'feb', '03': 'mar', '04': 'abr', '05': 'may', '06': 'jun', '07': 'jul', '08': 'ago', '09': 'sep' };
const CONMET_SO = 'SO11771';                 // contrato Conmet (decisión de Esteban: renglón propio)
const PLANES_PROYECTO = [1, 18];             // planes analíticos de proyecto (CLAUDE.md §17, Frente A)
const VENTANA_CFDI_DIAS = 15;                // ajuste C
const VENTANA_DEVOLUCION_DIAS = 5;
const CUENTAS = ['General', 'Nomina', 'USD'];

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
  const neg = c < 0; let a = Math.abs(c); const e = Math.floor(a / 100), d = a % 100;
  return (neg ? '-' : '') + String(e).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + String(d).padStart(2, '0');
};
const pct = (n, d) => d ? (Math.round(n * 10000 / d) / 100).toFixed(2) + '%' : 'n/a';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const csvCampo = v => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = filas => filas.map(f => f.map(csvCampo).join(',')).join('\n') + '\n';
const ordenar = (arr, ...claves) => arr.slice().sort((a, b) => { for (const k of claves) { const x = a[k], y = b[k]; if (x < y) return -1; if (x > y) return 1; } return 0; });

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
    primera(destino, valores) {           // valores: {descripcion, proveedor_odoo, categoria}
      for (const r of R) if (r.destino === destino && valores[r.campo] && r.re.test(valores[r.campo])) return r;
      return null;
    },
    todas: R,
  };
}

// ── tipo de cambio USD→MXN (Odoo res.currency.rate; FIX de Banxico no alcanzable: SUPUESTO) ──
function crearTC(tasas) {
  const T = ordenar((tasas || []).map(t => ({ d: dia(t.name), v: Number(t.inverse_company_rate) || (Number(t.rate) ? 1 / Number(t.rate) : 0) }))
    .filter(t => t.v > 0), 'd');
  return fecha => {
    let v = null; for (const t of T) { if (t.d <= dia(fecha)) v = t; else break; }
    if (!v) v = T[0];
    return v ? { tc: Math.round(v.v * 1e6) / 1e6, fecha_tc: v.d } : { tc: 0, fecha_tc: null };
  };
}

// ════════════════════════════════════════════════════════════════════════════
function calcular(insumos, opciones) {
  opciones = opciones || {};
  const ins = insumos || {}, O = ins.odoo || {};
  const reglas = compilarReglas(ins.reglas);
  const tcDe = crearTC(O.tc);
  const aMXN = (c, moneda, fecha) => {
    if (moneda !== 'USD') return { mxn: c, tc: null, fecha_tc: null };
    const t = tcDe(fecha); return { mxn: Math.round(c * t.tc), tc: t.tc, fecha_tc: t.fecha_tc };
  };

  // ── cobertura bancaria por mes ──
  const estados = ins.estados || [];
  const hay = {}; for (const e of estados) hay[e.alias + '|' + e.periodo] = e;
  const cobertura = {};
  for (const p of MESES) {
    const faltan = CUENTAS.filter(a => !hay[a + '|' + p]);
    let estado = 'completo', nota = '';
    if (faltan.includes('General') || faltan.includes('USD')) { estado = 'INCOMPLETO'; nota = 'faltan: ' + faltan.join(', ') + '. No se estima.'; }
    else if (faltan.includes('Nomina')) { estado = 'completo'; nota = 'falta el estado de Nómina; la nómina sale de los fondeos desde la General, que sí está.'; }
    cobertura[p] = { estado, faltan, nota };
  }

  // ── análisis de Odoo: facturas, líneas, analíticas ──
  const analitica = {}; for (const a of (O.analiticas || [])) analitica[String(a.id)] = { plan: m2o(a.root_plan_id).id || m2o(a.plan_id).id, nombre: a.name };
  const facturas = {}; const facturaPorNombre = {};
  for (const f of (O.facturas || [])) {
    const cur = m2o(f.currency_id).name || 'MXN', p = m2o(f.partner_id);
    const x = { id: f.id, name: f.name, move_type: f.move_type, partner: p.name, partner_id: p.id, moneda: /USD/.test(cur) ? 'USD' : 'MXN',
      total: cents(f.amount_total), sin_iva: cents(f.amount_untaxed), invoice_date: dia(f.invoice_date), date: dia(f.date), proyecto: false, planes: [] };
    facturas[f.id] = x; if (f.name) facturaPorNombre[f.name] = x;
  }
  for (const l of (O.lineas || [])) {
    const f = facturas[m2o(l.move_id).id]; if (!f) continue;
    let ad = l.analytic_distribution; if (typeof ad === 'string') { try { ad = JSON.parse(ad); } catch (e) { ad = null; } }
    if (!ad || typeof ad !== 'object') continue;
    for (const k of Object.keys(ad)) for (const id of k.split(',')) {
      const a = analitica[id.trim()]; if (!a) continue;
      if (!f.planes.includes(a.plan)) f.planes.push(a.plan);
      if (PLANES_PROYECTO.includes(a.plan)) f.proyecto = true;
    }
  }
  const ratio = f => (f && f.total > 0) ? { num: f.sin_iva, den: f.total } : null;
  const aplicarRatio = (c, r) => r ? Math.round(c * r.num / r.den) : c;
  const billDe = (...ss) => { for (const s of ss) { const m = String(s || '').match(/BILL\d+/); if (m) return m[0]; } return null; };

  // pagos registrados en Odoo (journal 8 General, 75 USD) ligados a una factura BILL
  const pagosOdoo = (O.pagos || []).map(p => {
    const j = m2o(p.journal_id).id, bill = billDe(p.ref, p.name, m2o(p.move_id).name);
    return { id: p.id, journal: j, fecha: dia(p.date), monto: j === 75 ? -cents(p.amount_currency) : -cents(p.balance), bill, factura: bill ? facturaPorNombre[bill] || null : null };
  }).filter(p => p.monto > 0 && p.factura);
  const pagoUsado = new Set(), facturaUsada = new Set();

  function buscarCFDI(m) {
    // 1) pago registrado en Odoo (monto exacto, ±15 días) que apunta a una factura
    const jr = m.alias === 'USD' ? 75 : 8;
    let cand = pagosOdoo.filter(p => !pagoUsado.has(p.id) && p.journal === jr && p.monto === m.cargo_nat && Math.abs(diasEntre(p.fecha, m.fecha)) <= VENTANA_CFDI_DIAS);
    if (cand.length) {
      cand = ordenar(cand.map(p => ({ p, dd: Math.abs(diasEntre(p.fecha, m.fecha)), id: p.id })), 'dd', 'id');
      const p = cand[0].p; pagoUsado.add(p.id);
      return { via: 'pago_odoo', factura: p.factura, ref_odoo: 'account.move.line ' + p.id + ' · ' + p.bill };
    }
    // 2) factura con total exacto y fecha ±15 días (proveedor en el texto desempata)
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

  // ── movimientos bancarios ──
  const banco = ordenar((ins.banco || []).map(r => ({
    id: r.movimiento_id, alias: r.alias, moneda: r.moneda, periodo: r.periodo, fecha: dia(r.fecha), renglon: r.renglon, codigo: r.codigo || '',
    descripcion: String(r.descripcion || ''), referencia: String(r.referencia || ''), cargo_nat: cents(r.cargo), abono_nat: cents(r.abono),
    categoria: r.categoria || '', subcategoria: r.subcategoria || '', ti: r.es_traspaso_interno === true || r.es_traspaso_interno === 't',
    archivo: r.archivo, pagina: r.pagina, sha256: r.sha256,
  })).filter(r => MESES.includes(r.periodo)), 'fecha', 'id');
  for (const r of banco) { const c = aMXN(r.cargo_nat || r.abono_nat, r.moneda, r.fecha); r.tc = c.tc; r.fecha_tc = c.fecha_tc;
    r.cargo = r.cargo_nat ? aMXN(r.cargo_nat, r.moneda, r.fecha).mxn : 0; r.abono = r.abono_nat ? aMXN(r.abono_nat, r.moneda, r.fecha).mxn : 0; }

  // devoluciones SPEI: un abono "DEVUELTO" regresa un cargo del mismo monto en los 5 días previos
  const devueltos = new Set(), abonoDevolucion = new Set();
  const tokDev = t => { const x = norm(t).match(/SPEI (?:ENVIADO|DEVUELTO)\s*([A-Z]+)[^0-9]*(\d{7})/); return x ? x[1] + '|' + x[2] : null; };
  for (const a of banco.filter(x => x.abono_nat > 0 && (/DEVUELTO/i.test(x.descripcion) || x.codigo === 'T22'))) {
    const c = banco.filter(x => x.alias === a.alias && x.cargo_nat === a.abono_nat && !devueltos.has(x.id) && diasEntre(a.fecha, x.fecha) >= 0 && diasEntre(a.fecha, x.fecha) <= VENTANA_DEVOLUCION_DIAS);
    // prefiere el cargo con el mismo banco destino y la misma referencia de 7 dígitos (el reenvío posterior no la comparte)
    const ta = tokDev(a.descripcion);
    if (c.length) { const x = ordenar(c.map(v => ({ v, tok: ta && tokDev(v.descripcion) === ta ? 0 : 1, dd: diasEntre(a.fecha, v.fecha), id: v.id })), 'tok', 'dd', 'id')[0].v; devueltos.add(x.id); abonoDevolucion.add(a.id); }
  }

  const items = [];           // todo lo que entra o se excluye, con su destino y rastreo
  const push = o => { items.push(o); return o; };
  const itemBanco = (m, destino, extra) => push(Object.assign({
    fuente: 'banco', id: 'mov ' + m.id, periodo: m.periodo, fecha: m.fecha, cuenta: m.alias, moneda: m.moneda, monto_nat: m.cargo_nat || m.abono_nat,
    tc: m.tc, bruto: m.cargo || m.abono, neto: m.cargo || m.abono, destino, concepto: m.descripcion, archivo: m.archivo, pagina: m.pagina, sha256: m.sha256,
    cfdi: null, proveedor: '', regla: null, conmet: false,
  }, extra || {}));

  // ── cargos del banco ──
  for (const m of banco.filter(x => x.cargo_nat > 0)) {
    const v = { descripcion: m.descripcion + ' ' + m.referencia, categoria: m.categoria, proveedor_odoo: '' };
    let r;
    if (m.alias === 'Nomina') { itemBanco(m, 'excl_cubierto_fondeo_nomina', { regla: 'cuenta Nómina: la cubren los fondeos desde la General (ajuste B)' }); continue; }
    if (devueltos.has(m.id)) { itemBanco(m, 'excl_devolucion', { regla: 'devuelto por el banco (SPEI DEVUELTO)' }); continue; }
    if ((r = reglas.primera('excluir_fondeo_payana', v))) { itemBanco(m, 'excl_fondeo_payana', { regla: 'regla ' + r.id }); continue; }
    if ((r = reglas.primera('excluir_fondeo_jeeves', v))) { itemBanco(m, 'excl_fondeo_jeeves', { regla: 'regla ' + r.id }); continue; }
    if (m.ti && /nomina/i.test(norm(m.subcategoria))) { itemBanco(m, 'nomina_fondeo', { regla: 'traspaso General→Nómina emparejado por el servicio' }); continue; }
    if ((r = reglas.primera('excluir_traspaso', v)) || m.ti) { itemBanco(m, 'excl_traspaso', { regla: r ? 'regla ' + r.id : 'traspaso interno (servicio)' }); continue; }
    if ((r = reglas.primera('excluir_financiamiento', v)) || m.categoria === 'credito_financiamiento') { itemBanco(m, 'excl_financiamiento', { regla: r ? 'regla ' + r.id : 'categoría crédito/financiamiento' }); continue; }
    if ((r = reglas.primera('impuestos_cuotas', v))) { itemBanco(m, 'impuestos_' + (r.subcategoria || 'otros'), { regla: 'regla ' + r.id }); continue; }
    if (m.alias === 'General' && (r = reglas.primera('nomina_directa', v))) { itemBanco(m, 'nomina_directa', { regla: 'regla ' + r.id }); continue; }
    // egreso operativo: buscar su CFDI (ajuste C)
    const cf = buscarCFDI(m);
    const prov = cf ? cf.factura.partner : '';
    v.proveedor_odoo = prov;
    const rr = ratio(cf && cf.factura);
    const neto = rr ? aplicarRatio(m.cargo, rr) : m.cargo;
    const base = { cfdi: cf ? { via: cf.via, ref: cf.ref_odoo, factura: cf.factura.name, sin_iva_sobre_total: cf.factura.sin_iva + '/' + cf.factura.total } : null, proveedor: prov, neto };
    const rc = reglas.primera('conmet', v);
    if (rc) {
      let n = neto, cfd = base.cfdi;
      if (!cf) {   // anticipo sin factura exacta: IVA por proveedor (proporción de sus facturas en la misma moneda). SUPUESTO S7
        const mon = m.alias === 'USD' ? 'USD' : 'MXN';
        const fs = Object.values(facturas).filter(f => f.move_type === 'in_invoice' && f.moneda === mon && reglas.todas.some(q => q.destino === 'conmet' && q.campo === 'proveedor_odoo' && q.re.test(f.partner)));
        const tot = fs.reduce((s, f) => s + f.total, 0), sin = fs.reduce((s, f) => s + f.sin_iva, 0);
        if (tot > 0) { n = Math.round(m.cargo * sin / tot); cfd = { via: 'proveedor_conmet', ref: fs.map(f => 'account.move ' + f.id + ' · ' + f.name).join(', '), factura: 'proporción de ' + fs.length + ' facturas', sin_iva_sobre_total: sin + '/' + tot }; }
      }
      itemBanco(m, 'costo_conmet', Object.assign(base, { neto: n, cfdi: cfd, conmet: true, regla: 'regla ' + rc.id })); continue;
    }
    const ra = reglas.primera('administrativo', v);
    if (ra) { itemBanco(m, 'admin_' + (ra.subcategoria || 'otros'), Object.assign(base, { regla: 'regla ' + ra.id })); continue; }
    itemBanco(m, cf ? 'costo_proveedor_con_cfdi' : 'costo_proveedor_sin_cfdi', Object.assign(base, { regla: 'costo por omisión (regla 2 de Esteban)' }));
  }

  // nómina de meses sin estado de la General: se toma el fondeo del lado Nómina (dato real, no estimado). SUPUESTO S4
  for (const m of banco.filter(x => x.alias === 'Nomina' && x.abono_nat > 0 && x.ti && /nomina/i.test(norm(x.subcategoria)))) {
    if (!cobertura[m.periodo].faltan.includes('General')) continue;
    itemBanco(m, 'nomina_fondeo_lado_nomina', { regla: 'mes sin estado de la General: fondeo leído en el estado de Nómina' });
  }
  // abonos informativos (no entran: las ventas salen de Odoo)
  for (const m of banco.filter(x => x.abono_nat > 0)) {
    if (m.categoria === 'credito_financiamiento') itemBanco(m, 'info_entrada_financiamiento', { regla: 'categoría crédito/financiamiento' });
    else if (abonoDevolucion.has(m.id)) itemBanco(m, 'info_devolucion_recibida', { regla: 'SPEI DEVUELTO' });
  }

  // ── Jeeves: consumos de la tarjeta (diario 61), no los fondeos ──
  for (const j of ordenar(O.jeeves || [], 'date', 'id')) {
    const f = dia(j.date), p = f.slice(0, 7); if (!MESES.includes(p)) continue;
    const c = cents(j.amount), ref = String(j.payment_ref || '');
    const base = { fuente: 'odoo', id: 'account.bank.statement.line ' + j.id, periodo: p, fecha: f, cuenta: 'Jeeves (diario 61)', moneda: 'MXN', monto_nat: Math.abs(c), tc: null,
      concepto: ref, archivo: null, pagina: null, sha256: null, cfdi: null, proveedor: '', conmet: false };
    if (/\[FONDEO\]/i.test(ref)) push(Object.assign(base, { destino: 'info_fondeo_jeeves_odoo', bruto: Math.abs(c), neto: Math.abs(c), regla: 'fondeo registrado en Jeeves' }));
    else if (c < 0) push(Object.assign(base, { destino: 'costo_jeeves', bruto: -c, neto: -c, regla: 'consumo de tarjeta (regla 3 de Esteban)' }));
    else push(Object.assign(base, { destino: 'costo_jeeves_devolucion', bruto: -c, neto: -c, regla: 'devolución de comercio a la tarjeta' }));
  }

  // ── Payana: pagos del diario 74 cotejados contra facturas de proveedor ──
  for (const y of ordenar(O.payana || [], 'date', 'id')) {
    const f = dia(y.date), p = f.slice(0, 7); if (!MESES.includes(p)) continue;
    const cr = cents(y.credit), db = cents(y.debit), prov = m2o(y.partner_id).name;
    const bill = billDe(y.ref, y.name, m2o(y.move_id).name), fac = bill ? facturaPorNombre[bill] || null : null;
    const base = { fuente: 'odoo', id: 'account.move.line ' + y.id, periodo: p, fecha: f, cuenta: 'Payana (diario 74)', moneda: 'MXN', monto_nat: cr || db, tc: null,
      concepto: [bill, prov].filter(Boolean).join(' · '), archivo: null, pagina: null, sha256: null, proveedor: fac ? fac.partner : prov, conmet: false };
    if (!(cr > 0)) { push(Object.assign(base, { destino: 'info_payana_entrada', bruto: db, neto: db, cfdi: null, regla: 'entrada en Payana (no es pago)' })); continue; }
    const rr = ratio(fac), neto = rr ? aplicarRatio(cr, rr) : cr;
    const cfdi = fac ? { via: 'factura_del_pago', ref: 'account.move ' + fac.id + ' · ' + fac.name, factura: fac.name, sin_iva_sobre_total: fac.sin_iva + '/' + fac.total } : null;
    const v = { descripcion: base.concepto, categoria: '', proveedor_odoo: base.proveedor };
    const rc = reglas.primera('conmet', v);
    if (rc) { push(Object.assign(base, { destino: 'costo_conmet', bruto: cr, neto, cfdi, conmet: true, regla: 'regla ' + rc.id })); continue; }
    if (fac && fac.proyecto) { push(Object.assign(base, { destino: 'costo_payana_proyecto', bruto: cr, neto, cfdi, regla: 'factura con cuenta analítica de proyecto (plan 1/18)' })); continue; }
    const ra = reglas.primera('administrativo', v);
    if (ra) { push(Object.assign(base, { destino: 'admin_' + (ra.subcategoria || 'otros'), bruto: cr, neto, cfdi, regla: 'regla ' + ra.id })); continue; }
    push(Object.assign(base, { destino: 'costo_payana_por_clasificar', bruto: cr, neto, cfdi,
      regla: fac ? 'factura sin proyecto (planes ' + (fac.planes.join('/') || 'ninguno') + ')' : 'sin factura ligada' }));
  }

  // ── ventas (Odoo sale.order state=sale, subtotal sin IVA, mes de date_order en Monterrey) ──
  const ventas = [];
  for (const s of ordenar(O.ventas || [], 'name')) {
    const fl = fechaLocalMty(s.date_order), p = fl.slice(0, 7), cli = m2o(s.partner_id).name;
    if (!MESES.includes(p) && p !== MES_VENTAS_SIN_BANCO) continue;
    if (/^ZZ[- ]?PRUEBA/i.test(cli)) { ventas.push({ id: s.id, name: s.name, periodo: p, fecha: fl, cliente: cli, moneda: '', monto_nat: cents(s.amount_untaxed), tc: null, mxn: 0, excluida: 'orden de prueba (cliente ZZ-PRUEBA)' }); continue; }
    const mon = /USD/.test(m2o(s.currency_id).name) ? 'USD' : 'MXN', c = cents(s.amount_untaxed), x = aMXN(c, mon, fl);
    ventas.push({ id: s.id, name: s.name, periodo: p, fecha: fl, cliente: cli, moneda: mon, monto_nat: c, tc: x.tc, fecha_tc: x.fecha_tc, mxn: x.mxn, conmet: s.name === CONMET_SO, excluida: null });
  }

  // ═══ armar el estado de resultados ═══
  const COLS = MESES.concat([MES_VENTAS_SIN_BANCO]);
  const suma = (pred, campo, per) => items.filter(i => pred(i) && (!per || i.periodo === per)).reduce((s, i) => s + i[campo], 0);
  const cnt = (pred, per) => items.filter(i => pred(i) && (!per || i.periodo === per)).length;
  const D = d => i => i.destino === d, P = pref => i => i.destino.indexOf(pref) === 0;

  function vista(sinConmet) {
    const ok = i => !(sinConmet && i.conmet);
    const L = [];
    const linea = (clave, etiqueta, nivel, fn, meta) => { const vals = {}; for (const p of COLS) vals[p] = fn(p); vals.acum = MESES.reduce((s, p) => s + vals[p], 0); vals.total_con_sep = vals.acum + vals[MES_VENTAS_SIN_BANCO];
      L.push(Object.assign({ clave, etiqueta, nivel, vals }, meta || {})); return vals; };
    const renglon = (clave, etiqueta, pred, campo, fuente) => linea(clave, etiqueta, 2, p => MESES.includes(p) ? suma(i => pred(i) && ok(i), campo, p) : 0,
      { fuente, n: cnt(i => pred(i) && ok(i)), pred: i => pred(i) && ok(i) });
    const vS = linea('ventas_sin_conmet', 'Ventas (sin Conmet)', 2, p => ventas.filter(v => !v.excluida && !v.conmet && v.periodo === p).reduce((s, v) => s + v.mxn, 0),
      { fuente: 'Odoo sale.order · state=sale · company 1 · amount_untaxed · mes de date_order (Monterrey)', n: ventas.filter(v => !v.excluida && !v.conmet).length, ventas: v => !v.excluida && !v.conmet });
    const vC = sinConmet ? null : linea('ventas_conmet', 'Conmet ' + CONMET_SO + ' (contrato completo)', 2, p => ventas.filter(v => v.conmet && v.periodo === p).reduce((s, v) => s + v.mxn, 0),
      { fuente: 'Odoo sale.order ' + CONMET_SO, n: ventas.filter(v => v.conmet).length, ventas: v => v.conmet });
    const V = linea('ventas', 'Ventas', 1, p => vS[p] + (vC ? vC[p] : 0));
    const c1 = renglon('costo_prov_cfdi', 'Proveedores con CFDI ligado (sin IVA)', D('costo_proveedor_con_cfdi'), 'neto', 'v_movimientos_validados · cargos operativos con factura de proveedor en Odoo');
    const c2 = renglon('costo_prov_sin', 'Proveedores sin CFDI ligado (bruto)', D('costo_proveedor_sin_cfdi'), 'neto', 'v_movimientos_validados · cargos operativos sin factura encontrada (monto exacto ±15 días)');
    const c3 = renglon('costo_jeeves', 'Jeeves: consumos de tarjeta (bruto)', D('costo_jeeves'), 'neto', 'Odoo account.bank.statement.line · diario 61 · amount < 0 sin [FONDEO]');
    const c3b = renglon('costo_jeeves_dev', 'Jeeves: devoluciones de comercio', D('costo_jeeves_devolucion'), 'neto', 'Odoo account.bank.statement.line · diario 61 · [DEVOLUCIÓN]');
    const c4 = renglon('costo_payana_proy', 'Payana: facturas de proyecto (sin IVA)', D('costo_payana_proyecto'), 'neto', 'Odoo account.move.line · diario 74 · factura con analítica plan 1/18');
    const c5 = renglon('costo_payana_pc', 'Payana: por clasificar', D('costo_payana_por_clasificar'), 'neto', 'Odoo account.move.line · diario 74 · sin factura o factura sin proyecto');
    const c6 = renglon('costo_nomina', 'Nómina (sin separar campo/oficina)', i => ['nomina_fondeo', 'nomina_directa', 'nomina_fondeo_lado_nomina'].includes(i.destino), 'neto', 'v_movimientos_validados · fondeos General→Nómina + pagos de nómina directos desde la General (+ julio desde el estado de Nómina)');
    const c7 = sinConmet ? null : renglon('costo_conmet', 'Conmet: pagos del proyecto (sin IVA)', D('costo_conmet'), 'neto', 'cargos con CONMET en el concepto o proveedor Mayoreo Eléctrico');
    const C = linea('costo', 'Costo de ventas', 1, p => [c1, c2, c3, c3b, c4, c5, c6, c7].filter(Boolean).reduce((s, x) => s + x[p], 0));
    const UB = linea('utilidad_bruta', 'Utilidad bruta', 1, p => V[p] - C[p]);
    L.push({ clave: 'margen', etiqueta: 'Margen bruto', nivel: 3, vals: Object.fromEntries(COLS.concat(['acum']).map(p => [p, V[p] ? Math.round((UB[p] * 10000) / V[p]) : null])), es_pct: true });
    const subsAdmin = Array.from(new Set(items.filter(P('admin_')).map(i => i.destino))).sort();
    const ga = subsAdmin.map(d => renglon('ga_' + d, 'Administrativo · ' + d.replace('admin_', '').replace(/_/g, ' '), D(d), 'neto', 'reglas administrativo (bancos.reglas_edo_resultados)'));
    const GA = linea('gastos_admin', 'Gastos administrativos', 1, p => ga.reduce((s, x) => s + x[p], 0));
    const UO = linea('utilidad_operacion', 'Utilidad de operación', 1, p => UB[p] - GA[p]);
    const imp = ['impuestos_sat', 'impuestos_imss_infonavit', 'impuestos_isn'].map(d => renglon('info_' + d, 'Informativo · ' + d.replace('impuestos_', '').replace(/_/g, ' '), D(d), 'bruto', 'v_movimientos_validados · reglas impuestos_cuotas'));
    linea('impuestos', 'Impuestos y cuotas pagados (informativo, no es costo)', 1, p => imp.reduce((s, x) => s + x[p], 0));
    return { lineas: L, tot: { V, C, UB, GA, UO } };
  }
  const A = vista(false), B = vista(true);

  // ── puente banco → estado (Vista A), por mes y acumulado ──
  const cargosBanco = p => banco.filter(m => m.cargo_nat > 0 && m.periodo === p).reduce((s, m) => s + m.cargo, 0);
  const nat = p => estados.filter(e => e.periodo === p).map(e => ({ alias: e.alias, resumen: cents(e.total_cargos), movs: banco.filter(m => m.alias === e.alias && m.periodo === p).reduce((s, m) => s + m.cargo_nat, 0) }));
  const EXCL = [['excl_cubierto_fondeo_nomina', 'Salidas de la cuenta Nómina (cubiertas por los fondeos)'], ['excl_traspaso', 'Traspasos entre cuentas propias (no Nómina)'],
    ['excl_fondeo_payana', 'Fondeos a Payana'], ['excl_fondeo_jeeves', 'Fondeos / pagos a Jeeves'], ['excl_financiamiento', 'Pagos de financiamiento y préstamos'],
    ['impuestos_', 'Impuestos y cuotas (SAT, IMSS/INFONAVIT, ISN)'], ['excl_devolucion', 'Cargos devueltos por el banco']];
  const puente = [];
  const pl = (clave, etiqueta, fn, signo) => { const vals = {}; for (const p of MESES) vals[p] = fn(p); vals.acum = MESES.reduce((s, p) => s + vals[p], 0); puente.push({ clave, etiqueta, signo, vals }); return vals; };
  const bS = pl('salidas', 'Total de salidas del banco (cargos de General, Nómina y USD en pesos)', cargosBanco, '');
  const exs = EXCL.map(([d, et]) => pl(d, 'menos ' + et, p => -suma(i => i.fuente === 'banco' && (d.slice(-1) === '_' ? i.destino.indexOf(d) === 0 : i.destino === d), 'bruto', p), '−'));
  const bE = pl('egresos_estado', 'Egresos bancarios que entran al estado (bruto)', p => bS[p] + exs.reduce((s, x) => s + x[p], 0), '=');
  const bJ = pl('mas_jeeves', 'más Jeeves: consumos netos de devoluciones (diario 61)', p => suma(i => i.destino === 'costo_jeeves' || i.destino === 'costo_jeeves_devolucion', 'bruto', p), '+');
  const bP = pl('mas_payana', 'más Payana: pagos (diario 74)', p => suma(i => i.fuente === 'odoo' && i.cuenta.indexOf('Payana') === 0 && i.destino.indexOf('info_') !== 0, 'bruto', p), '+');
  const bN = pl('mas_nomina_lado_nomina', 'más nómina de meses sin estado de la General (leída en el estado de Nómina)', p => suma(D('nomina_fondeo_lado_nomina'), 'bruto', p), '+');
  const bI = pl('menos_iva', 'menos IVA de los egresos con CFDI ligado', p => -suma(i => (i.destino.indexOf('costo_') === 0 || i.destino.indexOf('admin_') === 0 || i.destino.indexOf('nomina') === 0), 'bruto', p) + suma(i => (i.destino.indexOf('costo_') === 0 || i.destino.indexOf('admin_') === 0 || i.destino.indexOf('nomina') === 0), 'neto', p), '−');
  const bF = pl('fin', 'Costo de ventas + gastos administrativos del estado', p => bE[p] + bJ[p] + bP[p] + bN[p] + bI[p], '=');
  const cuadre = {}; let cuadraTodo = true;
  for (const p of MESES.concat(['acum'])) { const d = bF[p] - (A.tot.C[p] + A.tot.GA[p]); cuadre[p] = d; if (d !== 0) cuadraTodo = false; }
  const cuadreResumen = {}; let resumenCuadra = true;
  for (const p of MESES) { cuadreResumen[p] = nat(p).map(x => ({ alias: x.alias, diferencia: x.resumen - x.movs })); if (cuadreResumen[p].some(x => x.diferencia !== 0)) resumenCuadra = false; }

  // ── indicadores ──
  const costoNoNomina = i => (i.destino.indexOf('costo_') === 0);
  const sinCfdi = i => costoNoNomina(i) && !i.cfdi && i.destino !== 'costo_jeeves_devolucion';
  const base = suma(costoNoNomina, 'neto'), sinC = suma(sinCfdi, 'neto');
  const costoTotalA = A.tot.C.acum;
  const conteos = {};
  for (const i of items) conteos[i.destino] = (conteos[i.destino] || 0) + 1;
  conteos.ventas = ventas.filter(v => !v.excluida).length; conteos.ventas_excluidas = ventas.filter(v => v.excluida).length;
  const incompletos = MESES.filter(p => cobertura[p].estado === 'INCOMPLETO');
  const porClasificar = ordenar(items.filter(D('costo_payana_por_clasificar')), 'fecha', 'id');
  const revisar = ordenar(items.filter(i => i.destino === 'costo_proveedor_sin_cfdi'), 'bruto').reverse().slice(0, 40);

  const supuestos = [
    ['S1', 'Tipo de cambio', 'El FIX de Banxico no es alcanzable desde el sistema. Se usa el tipo de cambio de Odoo (res.currency.rate, USD, empresa 1, el vigente a la fecha). Aplica a la venta en dólares y a los cargos de la cuenta USD.'],
    ['S2', 'Ventas de prueba', 'Se excluyen órdenes cuyo cliente empieza con ZZ-PRUEBA (' + conteos.ventas_excluidas + ').'],
    ['S3', 'Mes de la venta', 'El mes sale de date_order convertido a hora de Monterrey (UTC-6).'],
    ['S4', 'Nómina de julio', 'Falta el estado de la General de julio. La nómina de julio se toma de los fondeos que registra el estado de Nómina (dato del banco, no estimado); el resto de julio queda incompleto.'],
    ['S5', 'Cuenta Nómina', 'Todo cargo de la cuenta Nómina se excluye: lo cubren los fondeos desde la General, que son el renglón de nómina (ajuste B). Incluye comisiones y el fondo de ahorro que salen de Nómina.'],
    ['S6', 'ISN', 'Los pagos a la Secretaría de Finanzas (referencia CIE) se tratan como Impuesto sobre Nómina.'],
    ['S7', 'Conmet', 'Los anticipos de Conmet sin factura del mismo monto toman el IVA de la proporción de las facturas del proveedor (Mayoreo Eléctrico) en la misma moneda.'],
    ['S8', 'Jeeves', 'Los consumos de la tarjeta no tienen CFDI ligado en Odoo: van brutos (con IVA) y cuentan como sin CFDI. Las devoluciones de comercio restan dentro del renglón Jeeves.'],
    ['S9', 'Payana', 'Se toman los pagos (crédito) del diario 74. Si la factura del pago tiene cuenta analítica de proyecto (plan 1 o 18) va a costo de proyecto; si es de proveedor administrativo, a gastos; lo demás, a costo "por clasificar".'],
    ['S10', 'CFDI', 'Un egreso se liga a factura si hay un pago en Odoo del mismo monto (±15 días) que apunta a un BILL, o una factura de proveedor con el mismo total (±15 días). Cada factura y cada pago se usan una sola vez.'],
    ['S11', 'Devoluciones', 'Un abono "SPEI DEVUELTO" anula el cargo del mismo monto de los 5 días previos en la misma cuenta; los dos quedan fuera del resultado.'],
    ['S12', 'Monex, vehículos y seguros', 'No son administrativo literal: quedan en costo. Van en la lista de revisión.'],
  ];
  const decisiones = [
    'Separar la nómina en campo (costo) y oficina (administrativo).',
    'Confirmar la lista de administrativo literal (tabla bancos.reglas_edo_resultados): renta, contabilidad y legal no tienen proveedor identificado todavía.',
    'Conmet: reconocer la venta por avance de obra en lugar del contrato completo en julio.',
    'Qué hacer con lo sin CFDI: buscar las facturas, o aceptar el costo bruto.',
  ];

  const resultado = { vistaA: A.lineas.map(l => ({ clave: l.clave, vals: l.vals })), vistaB: B.lineas.map(l => ({ clave: l.clave, vals: l.vals })),
    puente: puente.map(l => ({ clave: l.clave, vals: l.vals })), cuadre };
  const huella = sha256(canon(resultado));
  const huellaInsumos = sha256(canon(ins));

  const resumen = {
    version: VERSION, cuadra_al_centavo: cuadraTodo, diferencia_puente_acum: cuadre.acum, movimientos_banco_igual_resumen_pdf: resumenCuadra,
    conteos, porcentaje_costo_sin_cfdi: pct(sinC, base), porcentaje_costo_sin_cfdi_sobre_costo_total: pct(sinC, costoTotalA),
    meses_incompletos: incompletos.map(p => ({ periodo: p, faltan: cobertura[p].faltan })), cobertura: MESES.map(p => ({ periodo: p, estado: cobertura[p].estado, faltan: cobertura[p].faltan })),
    por_clasificar: porClasificar.length, insumos: { banco: (ins.banco || []).length, estados: estados.length, reglas: (ins.reglas || []).length,
      odoo: Object.fromEntries(Object.keys(O).sort().map(k => [k, (O[k] || []).length])) },
    supuestos: supuestos.map(s => s[0] + ' ' + s[1]),
  };

  const out = { version: VERSION, huella, huella_insumos: huellaInsumos, resumen };
  if (opciones.sin_archivos) return Object.assign(out, { _interno: { A, B, puente, items, ventas } });

  // ═══ archivos privados ═══
  const nombreMes = p => p === 'acum' ? 'Acum. ene–ago' : (NOMBRE_MES[p.slice(5)] + ' ' + p.slice(2, 4));
  const colsVista = COLS.concat(['acum']);
  const csvVista = V => csv([['concepto'].concat(colsVista.map(nombreMes), ['movimientos', 'fuente'])].concat(V.lineas.map(l =>
    [l.etiqueta].concat(colsVista.map(p => l.es_pct ? (l.vals[p] === null ? '' : (l.vals[p] / 100).toFixed(2) + '%') : (l.vals[p] / 100).toFixed(2)), [l.n == null ? '' : l.n, l.fuente || '']))));
  const csvPuente = csv([['concepto'].concat(MESES.concat(['acum']).map(nombreMes))].concat(puente.map(l => [l.etiqueta].concat(MESES.concat(['acum']).map(p => (l.vals[p] / 100).toFixed(2)))),
    [['diferencia contra el estado'].concat(MESES.concat(['acum']).map(p => (cuadre[p] / 100).toFixed(2)))]));
  const csvMovs = csv([['fuente', 'id', 'periodo', 'fecha', 'cuenta', 'moneda', 'monto_original', 'tipo_cambio', 'bruto_mxn', 'sin_iva_mxn', 'destino', 'regla', 'proveedor', 'cfdi', 'concepto', 'archivo', 'pagina', 'sha256']]
    .concat(ordenar(items, 'fecha', 'id').map(i => [i.fuente, i.id, i.periodo, i.fecha, i.cuenta, i.moneda, (i.monto_nat / 100).toFixed(2), i.tc || '', (i.bruto / 100).toFixed(2), (i.neto / 100).toFixed(2),
      i.destino, i.regla || '', i.proveedor || '', i.cfdi ? i.cfdi.ref : '', i.concepto, i.archivo || '', i.pagina || '', i.sha256 || ''])));
  const csvVentas = csv([['id', 'orden', 'periodo', 'fecha_local', 'cliente', 'moneda', 'subtotal_original', 'tipo_cambio', 'subtotal_mxn', 'conmet', 'excluida']]
    .concat(ventas.map(v => [v.id, v.name, v.periodo, v.fecha, v.cliente, v.moneda, (v.monto_nat / 100).toFixed(2), v.tc || '', (v.mxn / 100).toFixed(2), v.conmet ? 'si' : '', v.excluida || ''])));

  const html = armarHTML({ A, B, puente, cuadre, cuadraTodo, resumenCuadra, cuadreResumen, items, ventas, cobertura, supuestos, decisiones, porClasificar, revisar,
    conteos, base, sinC, costoTotalA, huella, huellaInsumos, opciones, COLS, nombreMes, incompletos });
  const cabecera = 'Estado de resultados 2026 v0 (preliminar) · Servicios FTS SA de CV · sin IVA · pesos · huella ' + huella.slice(0, 16) + '\n';
  out.archivos = [
    { nombre: 'ER_2026_v0.html', tipo: 'text/html; charset=utf-8', contenido: html },
    { nombre: 'ER_2026_v0_vista_A.csv', tipo: 'text/csv; charset=utf-8', contenido: cabecera + csvVista(A) },
    { nombre: 'ER_2026_v0_vista_B_sin_Conmet.csv', tipo: 'text/csv; charset=utf-8', contenido: cabecera + csvVista(B) },
    { nombre: 'ER_2026_v0_puente.csv', tipo: 'text/csv; charset=utf-8', contenido: cabecera + csvPuente },
    { nombre: 'ER_2026_v0_movimientos.csv', tipo: 'text/csv; charset=utf-8', contenido: cabecera + csvMovs },
    { nombre: 'ER_2026_v0_ventas.csv', tipo: 'text/csv; charset=utf-8', contenido: cabecera + csvVentas },
  ];
  out.correo = {
    renglones: [['Ventas', fmt(A.tot.V.acum), fmt(B.tot.V.acum)], ['Costo de ventas', fmt(A.tot.C.acum), fmt(B.tot.C.acum)],
      ['Utilidad bruta', fmt(A.tot.UB.acum), fmt(B.tot.UB.acum)], ['Utilidad de operación', fmt(A.tot.UO.acum), fmt(B.tot.UO.acum)]],
    incompletos: incompletos.length ? incompletos.map(p => nombreMes(p) + ' (faltan ' + cobertura[p].faltan.join(', ') + ')').join('; ') : 'ninguno',
  };
  return out;
}

// ═══ HTML privado, autocontenido ═══════════════════════════════════════════
function armarHTML(z) {
  const { A, B, puente, cuadre, items, ventas, cobertura, supuestos, decisiones, porClasificar, revisar, COLS, nombreMes } = z;
  const cols = COLS.concat(['acum']);
  const celda = (l, p) => l.es_pct ? (l.vals[p] === null ? '—' : (l.vals[p] / 100).toFixed(1) + '%') : fmt(l.vals[p]);
  const detalleItems = lista => '<div class="scroll"><table class="det"><tr><th>fecha</th><th>cuenta</th><th>concepto</th><th>proveedor / CFDI</th><th class="n">bruto</th><th class="n">sin IVA</th><th>origen</th></tr>' +
    lista.map(i => '<tr><td>' + esc(i.fecha) + '</td><td>' + esc(i.cuenta) + (i.moneda === 'USD' ? ' (USD ' + fmt(i.monto_nat) + ' × ' + i.tc + ')' : '') + '</td><td>' + esc(i.concepto) + '</td><td>' +
      esc(i.proveedor || '') + (i.cfdi ? '<br><span class="mut">' + esc(i.cfdi.ref) + '</span>' : '') + '</td><td class="n">' + fmt(i.bruto) + '</td><td class="n">' + fmt(i.neto) + '</td><td class="mut">' +
      (i.fuente === 'banco' ? esc(i.archivo) + ' · p. ' + esc(i.pagina) + '<br>sha256 ' + esc(String(i.sha256 || '').slice(0, 16)) + '… · ' + esc(i.id) : esc(i.id)) + '</td></tr>').join('') + '</table></div>';
  const detalleVentas = lista => '<div class="scroll"><table class="det"><tr><th>orden</th><th>fecha</th><th>cliente</th><th class="n">subtotal</th><th class="n">pesos</th><th>origen</th></tr>' +
    lista.map(v => '<tr><td>' + esc(v.name) + '</td><td>' + esc(v.fecha) + '</td><td>' + esc(v.cliente) + '</td><td class="n">' + esc(v.moneda) + ' ' + fmt(v.monto_nat) + (v.tc ? ' × ' + v.tc : '') +
      '</td><td class="n">' + fmt(v.mxn) + '</td><td class="mut">sale.order ' + esc(v.id) + '</td></tr>').join('') + '</table></div>';
  const tablaVista = (V, titulo, id, conDetalle) => {
    let h = '<h2 id="' + id + '">' + esc(titulo) + '</h2><div class="scroll"><table class="er"><thead><tr><th>Concepto</th>' + cols.map(p => '<th class="n' + (p === 'acum' ? ' acum' : '') + (p === '2026-09' ? ' sep' : '') + (cobertura[p] && cobertura[p].estado === 'INCOMPLETO' ? ' inc' : '') + '">' + esc(nombreMes(p)) +
      (cobertura[p] && cobertura[p].estado === 'INCOMPLETO' ? '<br><span class="tag">INCOMPLETO</span>' : '') + (p === '2026-09' ? '<br><span class="tag">sin banco hasta el 1-oct</span>' : '') + '</th>').join('') + '</tr></thead><tbody>';
    for (const l of V.lineas) {
      h += '<tr class="lv' + l.nivel + '"><td>' + esc(l.etiqueta) + (l.fuente ? '<div class="src">' + esc(l.fuente) + ' · ' + l.n + ' mov.</div>' : '') + '</td>' + cols.map(p => '<td class="n' + (p === 'acum' ? ' acum' : '') + (l.vals[p] < 0 && !l.es_pct ? ' neg' : '') + '">' + celda(l, p) + '</td>').join('') + '</tr>';
      if (conDetalle && (l.pred || l.ventas)) {
        const lista = l.pred ? ordenar(items.filter(l.pred), 'fecha', 'id') : ventas.filter(l.ventas);
        if (lista.length) h += '<tr class="dt"><td colspan="' + (cols.length + 1) + '"><details><summary>Ver detalle (' + lista.length + ' ' + (l.pred ? 'mov.' : 'órdenes') + ')</summary>' + (l.pred ? detalleItems(lista) : detalleVentas(lista)) + '</details></td></tr>';
      }
    }
    return h + '</tbody></table></div>';
  };
  const mesesP = COLS.filter(p => p !== '2026-09').concat(['acum']);
  let hp = '<h2 id="puente">Puente: del banco al estado (Vista A)</h2><div class="scroll"><table class="er"><thead><tr><th>Concepto</th>' + mesesP.map(p => '<th class="n' + (p === 'acum' ? ' acum' : '') + '">' + esc(nombreMes(p)) + '</th>').join('') + '</tr></thead><tbody>';
  for (const l of puente) hp += '<tr class="' + (l.signo === '=' || l.clave === 'salidas' ? 'lv1' : 'lv2') + '"><td>' + esc(l.etiqueta) + '</td>' + mesesP.map(p => '<td class="n' + (p === 'acum' ? ' acum' : '') + '">' + fmt(l.vals[p]) + '</td>').join('') + '</tr>';
  hp += '<tr class="lv1 ' + (z.cuadraTodo ? 'ok' : 'bad') + '"><td>Diferencia contra costo + gastos del estado</td>' + mesesP.map(p => '<td class="n">' + fmt(cuadre[p]) + '</td>').join('') + '</tr></tbody></table></div>' +
    '<p class="' + (z.cuadraTodo ? 'ok' : 'bad') + '">' + (z.cuadraTodo ? 'El puente cuadra al centavo en todos los meses y en el acumulado.' : 'El puente NO cuadra; ver diferencias.') + ' ' +
    (z.resumenCuadra ? 'Los cargos de cada estado leído suman exactamente el total de cargos del resumen del PDF (V1).' : 'Hay cuentas cuyo total de cargos no coincide con el resumen del PDF.') + '</p>';
  const cob = '<div class="scroll"><table class="det"><tr><th>mes</th><th>estado</th><th>nota</th></tr>' + Object.keys(cobertura).map(p => '<tr><td>' + esc(nombreMes(p)) + '</td><td class="' + (cobertura[p].estado === 'INCOMPLETO' ? 'bad' : 'ok') + '">' + esc(cobertura[p].estado) + '</td><td>' + esc(cobertura[p].nota || 'General, Nómina y USD validados') + '</td></tr>').join('') + '</table></div>';
  const excl = ['excl_cubierto_fondeo_nomina', 'excl_traspaso', 'excl_fondeo_payana', 'excl_fondeo_jeeves', 'excl_financiamiento', 'excl_devolucion', 'info_entrada_financiamiento', 'info_devolucion_recibida', 'info_fondeo_jeeves_odoo'];
  const hExcl = excl.map(d => { const l = ordenar(items.filter(i => i.destino === d), 'fecha', 'id'); return '<details><summary>' + esc(d) + ' · ' + l.length + ' mov. · ' + fmt(l.reduce((s, i) => s + i.bruto, 0)) + '</summary>' + detalleItems(l) + '</details>'; }).join('');
  const hPc = '<p>' + porClasificar.length + ' pagos de Payana por clasificar, ' + fmt(porClasificar.reduce((s, i) => s + i.neto, 0)) + ' (dentro de costo).</p>' + detalleItems(porClasificar);
  const hRev = '<p>Los 40 egresos más grandes que quedaron en costo sin CFDI ligado (incluye Monex, vehículos y seguros).</p>' + detalleItems(revisar);
  const css = ':root{--bg:#fff;--fg:#1a1a1a;--mut:#666;--line:#e3e3e3;--head:#f5f5f3;--acc:#0f5132;--bad:#b42318;--ok:#1e7b34;--sep:#fff7e0}' +
    '@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#eee;--mut:#9a9a9a;--line:#333;--head:#222;--acc:#7dd3a8;--bad:#ff8a80;--ok:#7dd3a8;--sep:#2b2616}}' +
    'body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,Segoe UI,Arial,sans-serif;margin:0;padding:24px 16px;max-width:1600px;overflow-wrap:anywhere}' +
    'h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}.mut,.src{color:var(--mut);font-size:12px}' +
    '.scroll{overflow-x:auto;max-width:100%}table.er tr:not(.dt) td:first-child,table.er th:first-child{position:sticky;left:0;background:var(--bg);z-index:1;min-width:190px;max-width:260px}table.er th:first-child{background:var(--head);z-index:2}table.det td,table.det th{overflow-wrap:normal}table{border-collapse:collapse}table.er{min-width:100%;font-variant-numeric:tabular-nums}th,td{border-bottom:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}' +
    'th{background:var(--head);font-weight:600;position:sticky;top:0}.n{text-align:right;white-space:nowrap}.acum{font-weight:600;background:var(--head)}.sep{background:var(--sep)}' +
    'tr.lv1 td{font-weight:700}tr.lv3 td{color:var(--mut);font-style:italic}tr.dt td{padding:0 8px 6px;border:0}.neg{color:var(--bad)}.tag{font-size:10px;font-weight:600;color:var(--bad)}' +
    '.ok{color:var(--ok)}.bad{color:var(--bad)}table.det{font-size:12px;margin:6px 0 10px}summary{cursor:pointer;color:var(--acc);font-size:12px}nav a{margin-right:14px;color:var(--acc)}';
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Estado de resultados 2026 v0</title><style>' + css + '</style></head><body>' +
    '<h1>Estado de resultados 2026 v0 · preliminar</h1><div class="mut">Servicios FTS SA de CV · enero a agosto 2026 con banco, septiembre sólo ventas · pesos · <b>sin IVA</b> · privado<br>' +
    'Huella de resultados ' + esc(z.huella) + ' · huella de insumos ' + esc(z.huellaInsumos.slice(0, 16)) + '… · calcular.js ' + esc(VERSION) + (z.opciones.sha ? ' @ ' + esc(String(z.opciones.sha).slice(0, 7)) : '') + (z.opciones.generado_at ? ' · generado ' + esc(z.opciones.generado_at) + ' UTC' : '') + '</div>' +
    '<nav style="margin:12px 0"><a href="#vA">Vista A</a><a href="#vB">Vista B</a><a href="#puente">Puente</a><a href="#cob">Meses</a><a href="#sup">Supuestos</a><a href="#pc">Por clasificar</a><a href="#excl">Excluido</a><a href="#dec">Decisiones</a></nav>' +
    '<p>Costo sin CFDI ligado: <b>' + pct(z.sinC, z.base) + '</b> del costo sin nómina (' + pct(z.sinC, z.costoTotalA) + ' del costo total).</p>' +
    tablaVista(A, 'Vista A · reglas de Esteban con ajustes A a F', 'vA', true) + tablaVista(B, 'Vista B · la misma, sin Conmet (ni su venta ni sus pagos)', 'vB', false) + '<p class="mut">El detalle de cada renglón de la Vista B es el mismo de la Vista A sin los movimientos de Conmet.</p>' + hp +
    '<h2 id="cob">Meses y cobertura bancaria</h2>' + cob +
    '<h2 id="sup">Supuestos</h2><div class="scroll"><table class="det">' + supuestos.map(s => '<tr><td>' + esc(s[0]) + '</td><td><b>' + esc(s[1]) + '</b></td><td>' + esc(s[2]) + '</td></tr>').join('') + '</table></div>' +
    '<h2 id="pc">Por clasificar</h2>' + hPc + '<h2>Revisar (costo sin CFDI)</h2>' + hRev +
    '<h2 id="excl">Excluido del resultado (renglones informativos)</h2>' + hExcl +
    '<h2 id="dec">Decisiones pendientes para Esteban</h2><ol>' + decisiones.map(d => '<li>' + esc(d) + '</li>').join('') + '</ol>' +
    '<p class="mut">Fuentes: base bancaria (esquema bancos, vistas v_movimientos_validados, v_estados_validados, v_saldos_mensuales, con el rol bancos_lector) y Odoo en solo lectura. Reglas editables en bancos.reglas_edo_resultados. Issue #348.</p></body></html>';
}

module.exports = { calcular, sha256, canon, VERSION };
