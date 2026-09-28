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

const VERSION = 'er-2026-v1.0';
const ANIO = '2026';
const NOMBRE_MES = { '01': 'ene', '02': 'feb', '03': 'mar', '04': 'abr', '05': 'may', '06': 'jun', '07': 'jul', '08': 'ago', '09': 'sep', '10': 'oct', '11': 'nov', '12': 'dic' };
const CONMET_SO = 'SO11771';                 // contrato Conmet (decisión de Esteban: renglón propio)
const PLANES_PROYECTO = [1, 18];             // planes analíticos de proyecto (CLAUDE.md §17, Frente A)
const VENTANA_CFDI_DIAS = 15;                // ajuste C
const VENTANA_DEVOLUCION_DIAS = 5;
const CUENTAS = ['General', 'Nomina', 'USD'];
const TODAS = { d1: true, d2: true, d3: true, d5: true, d6: true, d7: true };

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
    if (!F.d1 || !oficina.length) return false;
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
  const itemBanco = (m, destino, extra) => push(Object.assign({
    fuente: 'banco', id: 'mov ' + m.id, mov_id: m.id, hash: m.hash, periodo: m.periodo, fecha: m.fecha, renglon: m.renglon, cuenta: m.alias, mask: m.mask, moneda: m.moneda,
    monto_nat: m.cargo_nat || m.abono_nat, tc: m.tc, bruto: m.cargo || m.abono, neto: m.cargo || m.abono, destino, concepto: m.descripcion,
    archivo: m.archivo, pagina: m.pagina, sha256: m.sha256, cfdi: null, proveedor: '', regla: null, conmet: false, previo: false, iva_estimado: false,
  }, extra || {}));
  const itemAjuste = (periodo, destino, monto, concepto, extra) => push(Object.assign({ fuente: 'ajuste', id: 'ajuste ' + destino + ' ' + periodo + ' ' + (extra && extra.ref || ''),
    periodo, fecha: periodo + '-01', renglon: 0, cuenta: 'cálculo', mask: '', moneda: 'MXN', monto_nat: monto, tc: null, bruto: monto, neto: monto, destino, concepto,
    archivo: null, pagina: null, sha256: null, cfdi: null, proveedor: '', regla: 'cálculo', conmet: false, previo: false, iva_estimado: false }, extra || {}));

  const candidatasPartida = [];
  const activos = [];

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
  if (F.d1) for (const p of MESES) {
    const x = items.filter(i => i.fuente === 'banco' && i.destino === 'excl_cubierto_fondeo_nomina' && i.oficina && i.periodo === p).reduce((s, i) => s + i.bruto, 0);
    if (x) { itemAjuste(p, 'nomina_oficina', x, 'nómina de oficina pagada desde la cuenta Nómina (D1)'); itemAjuste(p, 'nomina_fondeo', -x, 'se resta de la nómina de campo (D1)'); }
  }
  // abonos informativos
  for (const m of banco.filter(x => x.abono_nat > 0)) {
    const v = { descripcion: m.descripcion + ' ' + m.referencia };
    if (m.categoria === 'credito_financiamiento') itemBanco(m, 'info_entrada_financiamiento', { regla: 'categoría crédito/financiamiento' });
    else if (abonoDevolucion.has(m.id)) itemBanco(m, 'info_devolucion_recibida', { regla: 'SPEI DEVUELTO' });
    else if (reglas.primera('conmet', v)) itemBanco(m, 'info_anticipo_conmet_cobrado', { regla: 'cobro del contrato Conmet', conmet: true, neto: Math.round(m.abono * 100 / 116) });
  }

  // ── Jeeves: consumos de la tarjeta (diario 61) por tipo de comercio (D3) ──
  for (const j of ordenar(O.jeeves || [], 'date', 'id')) {
    const f = dia(j.date), p = f.slice(0, 7); if (!MESES.includes(p)) continue;
    const c = cents(j.amount), ref = String(j.payment_ref || '');
    const comercio = norm(ref.replace(/^\[[^\]]*\]\s*/, ''));
    const base = { fuente: 'odoo', id: 'account.bank.statement.line ' + j.id, periodo: p, fecha: f, renglon: 0, cuenta: 'Jeeves (diario 61)', mask: '', moneda: 'MXN', monto_nat: Math.abs(c), tc: null,
      concepto: ref, archivo: null, pagina: null, sha256: null, cfdi: null, proveedor: '', conmet: false, previo: false, iva_estimado: false };
    if (/\[FONDEO\]/i.test(ref)) { push(Object.assign(base, { destino: 'info_fondeo_jeeves_odoo', bruto: Math.abs(c), neto: Math.abs(c), regla: 'fondeo registrado en Jeeves' })); continue; }
    if (!F.d3) {
      if (c < 0) push(Object.assign(base, { destino: 'costo_jeeves', bruto: -c, neto: -c, regla: 'consumo de tarjeta (regla 3 de Esteban)' }));
      else push(Object.assign(base, { destino: 'costo_jeeves_devolucion', bruto: -c, neto: -c, regla: 'devolución de comercio' }));
      continue;
    }
    const vj = { comercio_jeeves: comercio };
    const ext = reglas.primera('jeeves_extranjero', vj);
    const rj = reglas.primeraDe(['jeeves_costo', 'jeeves_admin'], vj);
    const bruto = -c, neto = ext ? bruto : Math.round(bruto * 100 / 116);      // IVA estimado (D3)
    let destino;
    if (c > 0) destino = 'costo_jeeves_devolucion';
    else if (!rj) destino = 'costo_jeeves_sin_clasificar';
    else destino = (rj.destino === 'jeeves_admin' ? 'admin_jeeves_' : 'costo_jeeves_') + (rj.subcategoria || 'otros');
    push(Object.assign(base, { destino, bruto, neto, iva_estimado: !ext, regla: (rj ? 'regla ' + rj.id : 'sin regla de comercio') + (ext ? ' · comercio extranjero, sin IVA' : ' · IVA estimado ÷1.16, sin CFDI') }));
  }

  // ── Payana: pagos del diario 74 cotejados contra facturas de proveedor ──
  for (const y of ordenar(O.payana || [], 'date', 'id')) {
    const f = dia(y.date), p = f.slice(0, 7); if (!MESES.includes(p)) continue;
    const cr = cents(y.credit), db = cents(y.debit), prov = m2o(y.partner_id).name;
    const bill = billDe(y.ref, y.name, m2o(y.move_id).name), fac = bill ? facturaPorNombre[bill] || null : null;
    const base = { fuente: 'odoo', id: 'account.move.line ' + y.id, periodo: p, fecha: f, renglon: 0, cuenta: 'Payana (diario 74)', mask: '', moneda: 'MXN', monto_nat: cr || db, tc: null,
      concepto: [bill, prov].filter(Boolean).join(' · '), archivo: null, pagina: null, sha256: null, proveedor: fac ? fac.partner : prov, conmet: false, previo: proyectoPrevio(fac), iva_estimado: false };
    if (!(cr > 0)) { push(Object.assign(base, { destino: 'info_payana_entrada', bruto: db, neto: db, cfdi: null, regla: 'entrada en Payana (no es pago)' })); continue; }
    const rr = ratio(fac), neto = rr ? aplicarRatio(cr, rr) : cr;
    const cfdi = fac ? { via: 'factura_del_pago', ref: 'account.move ' + fac.id + ' · ' + fac.name, factura: fac.name, sin_iva_sobre_total: fac.sin_iva + '/' + fac.total } : null;
    const v = { descripcion: base.concepto, categoria: '', proveedor_odoo: base.proveedor, plan_analitico: fac && !fac.proyecto ? fac.planes.join(',') : '' };
    let r;
    if (F.d6 && (r = reglas.primera('activo_fijo', v))) {
      push(Object.assign(base, { destino: 'activo_fijo', bruto: cr, neto, cfdi, regla: 'regla ' + r.id + ': activo fijo' }));
      activos.push({ periodo: p, base: neto, ref: base.id, concepto: base.concepto }); continue;
    }
    if ((r = reglas.primera('conmet', v))) { push(Object.assign(base, { destino: 'costo_conmet', bruto: cr, neto, cfdi, conmet: true, regla: 'regla ' + r.id })); continue; }
    if (fac && fac.proyecto) { push(Object.assign(base, { destino: 'costo_payana_proyecto', bruto: cr, neto, cfdi, regla: 'factura con cuenta analítica de proyecto (plan 1/18)' })); continue; }
    const ra = F.d2 ? reglas.primera('administrativo', v) : reglas.primera('administrativo', Object.assign({}, v, { plan_analitico: '' }));
    if (ra) { push(Object.assign(base, { destino: 'admin_' + (ra.subcategoria || 'otros'), bruto: cr, neto, cfdi, regla: 'regla ' + ra.id })); continue; }
    push(Object.assign(base, { destino: 'costo_payana_por_clasificar', bruto: cr, neto, cfdi,
      regla: fac ? 'factura sin proyecto (planes ' + (fac.planes.join('/') || 'ninguno') + ')' : 'sin factura ligada' }));
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

  return { MESES, MV, cobertura, items, ventas, facturado, P, contrato, estimado, conmetMes, candidatasPartida, activos, reglas };
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
      renglon('costo_jeeves', F.d3 ? 'Jeeves costo (IVA estimado, sin CFDI)' : 'Jeeves: consumos (bruto)', i => i.destino.indexOf('costo_jeeves') === 0 && i.destino !== 'costo_jeeves_sin_clasificar' && i.destino !== 'costo_jeeves_devolucion', 'Odoo diario 61 · consumos por tipo de comercio (D3)'),
      renglon('costo_jeeves_sin', 'Jeeves sin clasificar (IVA estimado)', D('costo_jeeves_sin_clasificar'), 'Odoo diario 61 · comercio sin regla'),
      renglon('costo_jeeves_dev', 'Jeeves: devoluciones de comercio', D('costo_jeeves_devolucion'), 'Odoo diario 61 · [DEVOLUCIÓN]'),
      renglon('costo_payana_proy', 'Payana: facturas de proyecto (sin IVA)', D('costo_payana_proyecto'), 'Odoo diario 74 · factura con analítica plan 1/18'),
      renglon('costo_payana_pc', 'Payana: por clasificar', D('costo_payana_por_clasificar'), 'Odoo diario 74 · sin factura o sin proyecto'),
      renglon('costo_nomina', F.d1 ? 'Nómina de campo' : 'Nómina (sin separar campo/oficina)', i => NOMINA.includes(i.destino), 'fondeos General→Nómina + pagos directos (− oficina, D1)'),
      renglon('costo_depreciacion', 'Depreciación asignable (activo fijo)', D('costo_depreciacion'), '25 % anual en línea recta desde el mes de compra (D6)'),
    ];
    if (tipo === 'A') cs.push(renglon('costo_conmet', 'Conmet: costo del proyecto (sin IVA)', D('costo_conmet'), 'cargos con CONMET o proveedor del proyecto'));
    const C = linea('costo', 'Costo de ventas', 1, p => cs.reduce((s, x) => s + x[p], 0));
    const UB = linea('utilidad_bruta', 'Utilidad bruta', 1, p => V[p] - C[p]);
    L.push({ clave: 'margen', etiqueta: 'Margen bruto', nivel: 3, vals: Object.fromEntries(COLS.concat(['acum']).map(p => [p, V[p] ? Math.round((UB[p] * 10000) / V[p]) : null])), es_pct: true });
    // gastos administrativos
    const ga = [renglon('ga_nomina_oficina', 'Nómina de oficina', D('nomina_oficina'), 'personal de bancos.nomina_oficina (D1)'),
      renglon('ga_jeeves', 'Jeeves administrativo (IVA estimado)', P('admin_jeeves_'), 'Odoo diario 61 · software, papelería, restaurantes en Monterrey (D3)'),
      renglon('ga_payana', 'Payana indirecto (plan 2)', D('admin_payana_indirecto'), 'Odoo diario 74 · analítica plan 2 sin proyecto (D2)')];
    const otros = Array.from(new Set(items.filter(i => i.destino.indexOf('admin_') === 0 && i.destino.indexOf('admin_jeeves_') !== 0 && i.destino !== 'admin_payana_indirecto').map(i => i.destino))).sort();
    for (const d of otros) ga.push(renglon('ga_' + d, d.replace('admin_', '').replace(/_/g, ' ').replace(/^./, x => x.toUpperCase()), D(d), 'reglas administrativo (bancos.reglas_edo_resultados)'));
    const GA = linea('gastos_admin', 'Gastos administrativos', 1, p => ga.reduce((s, x) => s + x[p], 0));
    const UO = linea('utilidad_operacion', 'Utilidad de operación', 1, p => UB[p] - GA[p]);
    const PI = renglon('partidas', 'Partidas por identificar (pendiente de Esteban)', i => i.destino === 'partida_por_identificar' || i.destino === 'partida_otro', 'D5 · SPEI sin concepto ni CFDI desde el umbral, casa de cambio sin entrada, y las marcadas «otro»');
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

// ── puente banco → estado (Vista A) ──
function armarPuente(m, A) {
  const { MESES, items } = m;
  const suma = (pred, campo, p) => items.filter(i => pred(i) && i.periodo === p).reduce((s, i) => s + i[campo], 0);
  const EXCL = [['excl_cubierto_fondeo_nomina', 'Salidas de la cuenta Nómina (cubiertas por los fondeos)'], ['excl_traspaso', 'Traspasos entre cuentas propias (no Nómina)'],
    ['excl_fondeo_payana', 'Fondeos a Payana'], ['excl_fondeo_jeeves', 'Fondeos / pagos a Jeeves'], ['excl_financiamiento', 'Pagos de financiamiento, préstamos y aportaciones'],
    ['impuestos_', 'Impuestos y cuotas (SAT, IMSS/INFONAVIT, ISN)'], ['excl_devolucion', 'Cargos devueltos por el banco'], ['activo_fijo', 'Compras de activo fijo (fuera del resultado)']];
  const puente = [];
  const pl = (clave, etiqueta, fn, signo) => { const vals = {}; for (const p of MESES) vals[p] = fn(p); vals.acum = MESES.reduce((s, p) => s + vals[p], 0); puente.push({ clave, etiqueta, signo, vals }); return vals; };
  const esBancoCargo = i => i.fuente === 'banco' && i.destino.indexOf('info_') !== 0 && i.destino !== 'nomina_fondeo_lado_nomina';
  const bS = pl('salidas', 'Total de salidas del banco (cargos de General, Nómina y USD en pesos)', p => suma(esBancoCargo, 'bruto', p), '');
  const exs = EXCL.map(([d, et]) => pl(d, 'menos ' + et, p => -suma(i => i.fuente === 'banco' && (d.slice(-1) === '_' ? i.destino.indexOf(d) === 0 : i.destino === d), 'bruto', p), '−'));
  const bE = pl('egresos_estado', 'Egresos bancarios que entran al estado o a partidas (bruto)', p => bS[p] + exs.reduce((s, x) => s + x[p], 0), '=');
  const bJ = pl('mas_jeeves', 'más Jeeves: consumos netos de devoluciones (diario 61, bruto)', p => suma(i => i.fuente === 'odoo' && i.cuenta.indexOf('Jeeves') === 0 && i.destino.indexOf('info_') !== 0, 'bruto', p), '+');
  const bP = pl('mas_payana', 'más Payana: pagos (diario 74, bruto)', p => suma(i => i.fuente === 'odoo' && i.cuenta.indexOf('Payana') === 0 && i.destino.indexOf('info_') !== 0 && i.destino !== 'activo_fijo', 'bruto', p), '+');
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

// ── decisión de versión y de correo ──
function decidir(res, opciones) {
  const ult = opciones.ultimo_calculo || null, ver = opciones.ultima_version || null;
  const motivos = [];
  const nuevaVersion = !ver || ver.huella_resultados !== res.huella;
  if (!ver) motivos.push('primera versión del estado automático (v1)');
  const cobPrev = {}; for (const c of ((ult && ult.resumen && ult.resumen.cobertura) || [])) cobPrev[c.periodo] = c.estado;
  for (const c of res.resumen.cobertura) if (cobPrev[c.periodo] === 'INCOMPLETO' && c.estado !== 'INCOMPLETO') motivos.push(nombreMes(c.periodo) + ' pasó de INCOMPLETO a ' + c.estado.toLowerCase());
  const um = (res.resumen.parametros && res.resumen.parametros.correo_umbral_cambio_utilidad_pct) || 1;
  const uoPrev = (ver && ver.resumen && ver.resumen.utilidad_operacion) || null;
  if (uoPrev) for (const k of ['A', 'B', 'C']) {
    const a = uoPrev[k], b = res.resumen.utilidad_operacion[k];
    if (typeof a === 'number' && Math.abs(b - a) > Math.abs(a) * um / 100) motivos.push('la utilidad de operación de la Vista ' + k + ' cambió ' + (a ? ((b - a) * 100 / Math.abs(a)).toFixed(2) : '∞') + ' %');
  }
  if (ult && opciones.firma && ult.firma_tablas && opciones.firma.tablas !== ult.firma_tablas) motivos.push('cambió una tabla editable (reglas, nómina de oficina, partidas o parámetros)');
  return { version: nuevaVersion ? ((ver && ver.version) || 0) + 1 : null, nueva_version: nuevaVersion, motivos, enviar_correo: motivos.length > 0 };
}

// ════════════════════════════════════════════════════════════════════════════
function calcular(insumos, opciones) {
  opciones = opciones || {};
  const ins = insumos || {};
  const m = motor(ins, TODAS);
  const { MESES, MV, cobertura, items, ventas, facturado, P } = m;
  const vistas = armarVistas(m, TODAS);
  const { A, B, C, COLS } = vistas;
  const pz = armarPuente(m, A);

  // ── qué cambió contra el v0: decisiones encendidas una a una, en orden ──
  const pasos = [['v0', {}], ['D1 nómina de oficina', { d1: 1 }], ['D2 administrativo literal', { d1: 1, d2: 1 }], ['D3 Jeeves por comercio', { d1: 1, d2: 1, d3: 1 }],
    ['D4 sin CFDI en su renglón (sin efecto en cifras)', { d1: 1, d2: 1, d3: 1 }], ['D5 partidas por identificar', { d1: 1, d2: 1, d3: 1, d5: 1 }],
    ['D6 activo fijo y casa de cambio', { d1: 1, d2: 1, d3: 1, d5: 1, d6: 1 }], ['D7 Conmet por avance de obra', TODAS]];
  const cambios = []; let prev = null;
  for (const [nombre, f] of pasos) {
    const ff = { d1: !!f.d1, d2: !!f.d2, d3: !!f.d3, d5: !!f.d5, d6: !!f.d6, d7: !!f.d7 };
    const vv = armarVistas(motor(ins, ff), ff).A.tot;
    const x = { paso: nombre, uo: vv.UO.acum, uop: vv.UOP.acum };
    x.efecto_uo = prev ? x.uo - prev.uo : 0; x.efecto_uop = prev ? x.uop - prev.uop : 0; cambios.push(x); prev = x;
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
    ['S9', 'Payana (D2)', 'Factura con analítica de proyecto (plan 1/18) → costo; con analítica plan 2 sin proyecto, o de proveedor administrativo → gastos; lo demás → costo «por clasificar».'],
    ['S10', 'CFDI', 'Un egreso se liga a factura si hay un pago en Odoo del mismo monto (±15 días) que apunta a un BILL, o una factura de proveedor con el mismo total (±15 días). Cada factura y cada pago se usan una vez.'],
    ['S11', 'Devoluciones', 'Un «SPEI DEVUELTO» anula el cargo con el mismo banco y la misma referencia de los 5 días previos.'],
    ['S13', 'Escrituras', 'El recálculo sólo escribe en bancos.er_calculos y bancos.partidas_identificadas (pendientes nuevas), con el rol bancos_er.'],
    ['S14', 'Nómina de oficina (D1)', 'Se reconoce por nombre o por los últimos 4 dígitos de la cuenta en el concepto del banco. Las dispersiones masivas de la cuenta Nómina (sin beneficiario en el concepto) no se pueden separar y quedan en campo.'],
    ['S15', 'Partidas por identificar (D5)', 'Cargo sin concepto ni CFDI desde ' + fmt(Math.round((P.umbral_partida_por_identificar_mxn || 0) * 100)) + ' pesos (parámetro editable), más los envíos a casa de cambio sin entrada equivalente.'],
    ['S16', 'Activo fijo (D6)', 'Compras de vehículos a activo fijo; depreciación ' + P.depreciacion_vehiculos_anual_pct + ' % anual en línea recta desde el mes de compra, prorrateada por mes, sobre el subtotal sin IVA.'],
    ['S17', 'Proyectos vendidos antes del año', 'Un costo es de un proyecto vendido antes de ' + ANIO + ' si todas las cuentas analíticas de proyecto de su factura se crearon antes del 1 de enero.'],
    ['S18', 'Conmet por avance (D7)', P.conmet_costo_total_estimado_mxn ? 'Costo total estimado tomado del parámetro conmet_costo_total_estimado_mxn.' :
      'En Odoo el costo cotizado de la SO11771 está vacío (costo por línea en cero y presupuesto de materiales y mano de obra en 1). Se usa margen cero (NIIF 15 párrafo 45): costo total estimado = contrato, y la venta reconocida iguala al costo incurrido. Cuando exista el estimado, se captura en er_parametros y el recálculo lo toma.'],
    ['S19', 'Conmet cobrado', 'El cobro de Conmet se muestra sin IVA (÷1.16) como informativo, contra lo reconocido.'],
    ['S20', 'Vista D', 'Los «últimos 10» se ordenan por fecha de operación y, dentro del día, por el renglón del estado (el banco no imprime hora).'],
  ];
  const decisiones = [
    'Llenar bancos.nomina_oficina con el personal de oficina (RH).',
    'Decidir cada partida por identificar en bancos.partidas_identificadas.',
    'Capturar el costo total estimado de Conmet en bancos.er_parametros si se quiere reconocer margen por avance.',
    'Revisar la lista de reglas de Jeeves sin clasificar y ampliar bancos.reglas_edo_resultados.',
  ];

  const resultado = { A: A.lineas.map(l => ({ clave: l.clave, vals: l.vals })), B: B.lineas.map(l => ({ clave: l.clave, vals: l.vals })),
    C: C.lineas.map(l => ({ clave: l.clave, vals: l.vals })), puente: pz.puente.map(l => ({ clave: l.clave, vals: l.vals })), cuadre: pz.cuadre };
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
    parametros: P, insumos: { banco: (ins.banco || []).length, estados: (ins.estados || []).length, reglas: (ins.reglas || []).length,
      odoo: Object.fromEntries(Object.keys(ins.odoo || {}).sort().map(k => [k, (ins.odoo[k] || []).length])) },
  };
  const out = { version: VERSION, huella, huella_insumos: huellaInsumos, resumen, candidatas_partida: m.candidatasPartida };
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
    for (const i of lista) if (ult10.includes(i.mov_id) || top10.includes(i.mov_id)) vd.movs.push({ id: i.mov_id, mes: p, fecha: i.fecha, renglon: i.renglon, cuenta: i.cuenta + ' ' + i.mask,
      concepto: enmascarar(i.concepto), contraparte: i.proveedor || '', bruto: i.bruto, destino: i.destino, renglon_er: renglonDe(i.destino), conmet: i.conmet,
      origen: (i.archivo || '') + ' · p. ' + (i.pagina || ''), ult: ult10.includes(i.mov_id), top: top10.includes(i.mov_id) });
  }
  for (const [k, V] of [['A', A], ['B', B], ['C', C]]) { const b = {}; for (const p of MESES) b[p] = V.tot.UOP[p]; b.acum = V.tot.UOP.acum; vd.base[k] = b; }

  // ═══ archivos privados ═══
  const nv = out.decision.version || (opciones.ultima_version && opciones.ultima_version.version) || 1;
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

  const html = armarHTML({ A, B, C, pz, items, ventas, facturado, cobertura, supuestos, decisiones, partidas, conteos, baseC, sinC, huella, huellaInsumos,
    opciones, COLS, MESES, MV, incompletos, cambios, vd, m, jeev, jSin, nv, decision: out.decision });
  const cab = 'Estado de resultados ' + ANIO + ' v' + nv + ' · Servicios FTS SA de CV · sin IVA · pesos · huella ' + huella.slice(0, 16) + '\n';
  const base = [
    ['vista_A.csv', csvVista(A)], ['vista_B_sin_Conmet.csv', csvVista(B)], ['vista_C_facturado.csv', csvVista(C)],
    ['puente.csv', csvPuente], ['movimientos.csv', csvMovs], ['ventas_y_facturas.csv', csvVentas], ['partidas_por_identificar.csv', csvPartidas]];
  out.archivos = [{ nombre: 'ER_' + ANIO + '_actual.html', carpeta: '', tipo: 'text/html; charset=utf-8', contenido: html }];
  if (out.decision.nueva_version) {
    out.archivos.push({ nombre: 'ER_' + ANIO + '_v' + nv + '.html', carpeta: 'historial', tipo: 'text/html; charset=utf-8', contenido: html });
    for (const [n, c] of base) out.archivos.push({ nombre: 'ER_' + ANIO + '_v' + nv + '_' + n, carpeta: 'historial', tipo: 'text/csv; charset=utf-8', contenido: cab + c });
  }
  for (const [n, c] of base) out.archivos.push({ nombre: 'ER_' + ANIO + '_actual_' + n, carpeta: '', tipo: 'text/csv; charset=utf-8', contenido: cab + c });
  const f3 = k => [fmt(A.tot[k].acum), fmt(B.tot[k].acum), fmt(C.tot[k].acum)];
  out.correo = {
    asunto: 'Estado de resultados ' + ANIO + ' v' + nv + (out.decision.motivos.length ? ' · ' + out.decision.motivos[0] : ''),
    renglones: [['Ventas'].concat(f3('V')), ['Costo de ventas'].concat(f3('C')), ['Utilidad bruta'].concat(f3('UB')), ['Gastos administrativos'].concat(f3('GA')),
      ['Utilidad de operación'].concat(f3('UO')), ['Partidas por identificar'].concat(f3('PI')), ['Utilidad de operación después de partidas'].concat(f3('UOP'))],
    motivos: out.decision.motivos, cambios: cambios.map(c => [c.paso, fmt(c.efecto_uo), fmt(c.efecto_uop)]),
    incompletos: incompletos.length ? incompletos.map(p => nombreMes(p) + ' (' + cobertura[p].estado.toLowerCase() + (cobertura[p].faltan.length ? ', faltan ' + cobertura[p].faltan.join(', ') : '') + ')').join('; ') : 'ninguno',
    vista_d: 'Vista D: descarga el HTML y ábrelo en el navegador; marca cargos, pon el % de costo financiero y verás la utilidad hipotética (subtotal = bruto ÷ 1.16).',
  };
  return out;
}

// ═══ JavaScript de la Vista D (corre en el navegador, sin conexión) ═════════
function vistaDCliente() {
  var D = window.__VD, core = window.__escenarioCore;
  var st = { base: 'C', criterio: 'ult', pct: 0, sel: {} };
  var $ = function (id) { return document.getElementById(id); };
  var money = function (c) { var n = Math.round(c), neg = n < 0; n = Math.abs(n); var e = Math.floor(n / 100), d = n % 100;
    return (neg ? '-' : '') + String(e).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + (d < 10 ? '0' : '') + d; };
  var nm = { '01': 'ene', '02': 'feb', '03': 'mar', '04': 'abr', '05': 'may', '06': 'jun', '07': 'jul', '08': 'ago', '09': 'sep', '10': 'oct', '11': 'nov', '12': 'dic' };
  var mesN = function (p) { return p === 'acum' ? 'Acumulado' : nm[p.slice(5)] + ' ' + p.slice(2, 4); };
  var escH = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var seleccion = function () { return Object.keys(st.sel).filter(function (k) { return st.sel[k]; }); };
  function movsBase() { return D.movs.filter(function (m) { return !(st.base !== 'A' && m.conmet); }); }
  function calc() { return core(D.base[st.base], movsBase(), seleccion(), st.pct); }
  function pintarListas() {
    var h = '';
    D.meses.forEach(function (p) {
      var lista = D.movs.filter(function (m) { return m.mes === p && (st.criterio === 'ult' ? m.ult : m.top); });
      lista.sort(st.criterio === 'ult' ? function (a, b) { return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.renglon - a.renglon; } : function (a, b) { return b.bruto - a.bruto; });
      h += '<h4>' + mesN(p) + '</h4><div class="scroll"><table class="det vd"><tr><th></th><th>fecha</th><th>cuenta</th><th>concepto</th><th>contraparte</th><th class="n">monto bruto</th><th class="n">subtotal (÷1.16)</th><th>renglón</th><th>origen</th></tr>';
      lista.forEach(function (m) {
        var off = st.base !== 'A' && m.conmet;
        h += '<tr' + (st.sel[m.id] ? ' class="marcado"' : '') + '><td><input type="checkbox" data-id="' + m.id + '"' + (st.sel[m.id] ? ' checked' : '') + (off ? ' disabled title="Conmet no está en esta vista"' : '') + '></td><td>' + escH(m.fecha) +
          '</td><td>' + escH(m.cuenta) + '</td><td>' + escH(m.concepto) + '</td><td>' + escH(m.contraparte) + '</td><td class="n">' + money(m.bruto) + '</td><td class="n">' + money(m.bruto * 100 / 116) +
          '</td><td>' + escH(m.renglon_er) + '</td><td class="mut">' + escH(m.origen) + '</td></tr>';
      });
      if (!lista.length) h += '<tr><td colspan="9" class="mut">Sin cargos en este mes.</td></tr>';
      h += '</table></div>';
    });
    $('vd-listas').innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll('#vd-listas input[type=checkbox]'), function (c) {
      c.addEventListener('change', function () { st.sel[c.getAttribute('data-id')] = c.checked; pintar(); });
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
    var cuenta = {}; seleccion().forEach(function (id) { var m = D.movs.filter(function (x) { return String(x.id) === String(id); })[0]; if (m) cuenta[m.renglon_er] = (cuenta[m.renglon_er] || 0) + 1; });
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
      var s = e[n]; var r = core(D.base[s.base], D.movs.filter(function (m) { return !(s.base !== 'A' && m.conmet); }), s.sel, s.pct).acum;
      h += '<tr><td>' + escH(n) + '</td><td>' + s.base + '</td><td class="n">' + s.pct + '</td><td class="n">' + r.n + '</td><td class="n">' + money(r.bruto) + '</td><td class="n">' + money(r.subtotal) +
        '</td><td class="n">' + money(r.costo) + '</td><td class="n">' + money(r.base) + '</td><td class="n">' + money(r.hipotetica) + '</td></tr>';
    });
    $('vd-tabla-cmp').innerHTML = elegidos.length ? h + '</table></div>' : '';
  }
  $('vd-base').addEventListener('change', function () { st.base = this.value; pintar(); });
  $('vd-criterio').addEventListener('change', function () { st.criterio = this.checked ? 'top' : 'ult'; pintarListas(); });
  $('vd-pct').addEventListener('input', function () { var v = parseFloat(String(this.value).replace(',', '.')); st.pct = isNaN(v) ? 0 : Math.min(100, Math.max(0, v)); pintarBloque(); });
  $('vd-limpiar').addEventListener('click', function () { st.sel = {}; pintar(); });
  $('vd-guardar').addEventListener('click', function () {
    var n = String($('vd-nombre').value || '').trim() || ('Escenario ' + new Date().toISOString().slice(0, 16).replace('T', ' '));
    var e = leerEsc(); e[n] = { base: st.base, pct: st.pct, sel: seleccion(), guardado: new Date().toISOString() };
    $('vd-msg').textContent = guardarEsc(e) ? 'Guardado: ' + n : 'El navegador no permite guardar (modo privado). Usa Exportar.'; pintarEsc();
  });
  $('vd-cargar').addEventListener('change', function () { var e = leerEsc()[this.value]; if (!e) return; st.base = e.base; st.pct = e.pct; st.sel = {}; e.sel.forEach(function (i) { st.sel[i] = true; });
    $('vd-base').value = st.base; $('vd-pct').value = st.pct; pintar(); });
  $('vd-exportar').addEventListener('click', function () {
    var r = calc(), sel = {}; seleccion().forEach(function (i) { sel[i] = true; });
    var q = function (s) { s = String(s == null ? '' : s); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var L = [['vista_base', 'mes', 'fecha', 'cuenta', 'concepto', 'contraparte', 'renglon', 'bruto', 'subtotal', 'pct_costo_financiero', 'costo_financiero', 'utilidad_retenida_neta']];
    movsBase().filter(function (m) { return sel[m.id]; }).forEach(function (m) { var sub = m.bruto * 100 / 116, cf = sub * st.pct / 100;
      L.push([st.base, m.mes, m.fecha, m.cuenta, m.concepto, m.contraparte, m.renglon_er, (m.bruto / 100).toFixed(2), (sub / 100).toFixed(2), st.pct, (cf / 100).toFixed(2), ((sub - cf) / 100).toFixed(2)]); });
    L.push([]); L.push(['total', '', '', '', '', '', '', (r.acum.bruto / 100).toFixed(2), (r.acum.subtotal / 100).toFixed(2), st.pct, (r.acum.costo / 100).toFixed(2), (r.acum.neto / 100).toFixed(2)]);
    L.push(['utilidad_base', '', '', '', '', '', '', '', '', '', '', (r.acum.base / 100).toFixed(2)]); L.push(['utilidad_hipotetica', '', '', '', '', '', '', '', '', '', '', (r.acum.hipotetica / 100).toFixed(2)]);
    var blob = new Blob(['﻿' + L.map(function (f) { return f.map(q).join(','); }).join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'escenario_vista_' + st.base + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  });
  window.__vdEstado = st; window.__vdPintar = pintar;
  pintarEsc(); pintar();
}

// ═══ HTML privado, autocontenido ═══════════════════════════════════════════
function armarHTML(z) {
  const { A, B, C, pz, items, ventas, facturado, cobertura, supuestos, decisiones, partidas, COLS, MESES, MV, cambios, vd, m, jeev, jSin, nv } = z;
  const cols = COLS.concat(['acum']);
  const celda = (l, p) => l.es_pct ? (l.vals[p] === null ? '—' : (l.vals[p] / 100).toFixed(1) + '%') : fmt(l.vals[p]);
  const detalleItems = lista => '<div class="scroll"><table class="det"><tr><th>fecha</th><th>cuenta</th><th>concepto</th><th>proveedor / CFDI</th><th class="n">bruto</th><th class="n">sin IVA</th><th>origen</th></tr>' +
    lista.map(i => '<tr' + (i.mov_id ? ' data-mov="' + i.mov_id + '"' : '') + '><td>' + esc(i.fecha) + '</td><td>' + esc(i.cuenta + (i.mask ? ' ' + i.mask : '')) + (i.moneda === 'USD' ? ' (USD ' + fmt(i.monto_nat) + ' × ' + i.tc + ')' : '') + '</td><td>' + esc(i.concepto) +
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
  const hCambios = '<h2 id="cambios">Qué cambió contra el v0 (Vista A, acumulado)</h2><div class="scroll"><table class="er"><tr><th>Decisión (se encienden una a una, en orden)</th><th class="n">Utilidad de operación</th><th class="n">Efecto</th><th class="n">Después de partidas</th><th class="n">Efecto</th></tr>' +
    cambios.map((c, k) => '<tr' + (k === 0 ? ' class="lv1"' : '') + '><td>' + esc(c.paso) + '</td><td class="n">' + fmt(c.uo) + '</td><td class="n">' + (k ? fmt(c.efecto_uo) : '') + '</td><td class="n">' + fmt(c.uop) + '</td><td class="n">' + (k ? fmt(c.efecto_uop) : '') + '</td></tr>').join('') +
    '</table></div><p class="mut">El renglón v0 reproduce las reglas del v0 sobre los insumos de hoy (puede diferir del v0 publicado si llegaron datos nuevos).</p>';
  const cob = '<div class="scroll"><table class="det"><tr><th>mes</th><th>estado</th><th>nota</th></tr>' + MESES.map(p => '<tr><td>' + esc(nombreMes(p)) + '</td><td class="' + (cobertura[p].estado === 'completo' ? 'ok' : 'bad') + '">' + esc(cobertura[p].estado) +
    '</td><td>' + esc(cobertura[p].nota || 'General, Nómina y USD validados') + '</td></tr>').join('') + (MV ? '<tr><td>' + esc(nombreMes(MV)) + '</td><td>sólo ventas</td><td>sin banco todavía</td></tr>' : '') + '</table></div>';
  const alertaNomina = z.m.P && (z.opciones && false) ? '' : ((z.conteos.nomina_oficina || 0) === 0 && !(items.some(i => i.destino === 'nomina_oficina')) ?
    '<p class="alerta">Pendiente: lista de personal de oficina de RH. Mientras bancos.nomina_oficina esté vacía, toda la nómina queda en costo (campo).</p>' : '');
  const conmet = z.m.conmetMes, contr = z.m.contrato;
  const hConmet = '<h2 id="conmet">Conmet por avance de obra (D7)</h2><p>Contrato sin IVA ' + fmt(contr) + ' · costo total estimado ' + fmt(z.m.estimado) + (z.m.estimado === contr ? ' (margen cero: sin estimado en Odoo)' : '') + '</p><div class="scroll"><table class="det"><tr><th>mes</th><th class="n">costo incurrido acumulado</th><th class="n">% avance</th><th class="n">venta reconocida acumulada</th><th class="n">venta del mes</th><th class="n">cobrado acumulado sin IVA</th></tr>' +
    MESES.map(p => '<tr><td>' + nombreMes(p) + '</td><td class="n">' + fmt(conmet[p].costo_acum) + '</td><td class="n">' + (conmet[p].avance * 100).toFixed(2) + '%</td><td class="n">' + fmt(conmet[p].reconocido_acum) + '</td><td class="n">' + fmt(conmet[p].venta) + '</td><td class="n">' + fmt(conmet[p].cobrado_acum) + '</td></tr>').join('') + '</table></div>';
  const excl = ['excl_cubierto_fondeo_nomina', 'excl_traspaso', 'excl_fondeo_payana', 'excl_fondeo_jeeves', 'excl_financiamiento', 'excl_devolucion', 'activo_fijo', 'info_entrada_financiamiento', 'info_devolucion_recibida', 'info_fondeo_jeeves_odoo', 'info_anticipo_conmet_cobrado'];
  const hExcl = excl.map(d => { const l = ordenar(items.filter(i => i.destino === d), 'fecha', 'id'); return '<details><summary>' + esc(d) + ' · ' + l.length + ' mov. · ' + fmt(l.reduce((s, i) => s + i.bruto, 0)) + '</summary>' + detalleItems(l) + '</details>'; }).join('');
  const pc = ordenar(items.filter(i => i.destino === 'costo_payana_por_clasificar'), 'fecha', 'id');
  const jsin = ordenar(jSin, 'bruto').reverse().slice(0, 60);
  const hJeeves = '<p>Jeeves: ' + jeev.length + ' consumos; ' + jSin.length + ' sin clasificar (' + pct(jSin.reduce((s, i) => s + i.bruto, 0), jeev.reduce((s, i) => s + i.bruto, 0)) + ' del monto). Los 60 más grandes sin clasificar:</p>' + detalleItems(jsin);
  const vdHtml = '<h2 id="vD">Vista D · escenarios hipotéticos de utilidad retenida</h2>' +
    '<p class="leyenda">Escenario hipotético. No es un registro contable ni cambia el estado de resultados. El subtotal se calcula dividiendo el monto bruto entre 1.16 para todo movimiento seleccionado.</p>' +
    '<p class="mut">Si el visor de OneDrive no ejecuta esta sección, descarga el archivo y ábrelo en el navegador; funciona sin conexión.</p>' +
    '<div class="vdctl"><label>Vista base <select id="vd-base"><option value="A">A</option><option value="B">B</option><option value="C" selected>C</option></select></label> ' +
    '<label><input type="checkbox" id="vd-criterio"> Mostrar los 10 más grandes del mes (en vez de los últimos 10)</label> ' +
    '<label>% de costo financiero <input type="number" id="vd-pct" value="0" min="0" max="100" step="0.01" style="width:6em"></label> ' +
    '<button id="vd-limpiar">Limpiar selección</button> <input id="vd-nombre" placeholder="nombre del escenario"> <button id="vd-guardar">Guardar escenario</button> ' +
    '<select id="vd-cargar"></select> <button id="vd-exportar">Exportar escenario</button> <span id="vd-msg" class="mut"></span></div>' +
    '<div id="vd-bloque"></div><p><b>Comparar escenarios guardados</b> (máximo 3): <span id="vd-comparar"></span></p><div id="vd-tabla-cmp"></div><div id="vd-listas"></div>' +
    '<noscript><p class="alerta">Este visor no ejecuta JavaScript: descarga el archivo y ábrelo en el navegador para usar la Vista D.</p></noscript>';
  const css = ':root{--bg:#fff;--fg:#1a1a1a;--mut:#666;--line:#e3e3e3;--head:#f5f5f3;--acc:#0f5132;--bad:#b42318;--ok:#1e7b34;--sep:#fff7e0;--sel:#fff3bf}' +
    '@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#eee;--mut:#9a9a9a;--line:#333;--head:#222;--acc:#7dd3a8;--bad:#ff8a80;--ok:#7dd3a8;--sep:#2b2616;--sel:#3a3314}}' +
    'body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,Segoe UI,Arial,sans-serif;margin:0;padding:24px 16px;max-width:1600px;overflow-wrap:anywhere}' +
    'h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}h4{margin:14px 0 4px}.mut,.src{color:var(--mut);font-size:12px}' +
    '.scroll{overflow-x:auto;max-width:100%}table.er tr:not(.dt) td:first-child,table.er th:first-child{position:sticky;left:0;background:var(--bg);z-index:1;min-width:190px;max-width:280px}table.er th:first-child{background:var(--head);z-index:2}table.det td,table.det th{overflow-wrap:normal}' +
    'table{border-collapse:collapse}table.er{min-width:100%;font-variant-numeric:tabular-nums}th,td{border-bottom:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}' +
    'th{background:var(--head);font-weight:600}.n{text-align:right;white-space:nowrap}.acum{font-weight:600;background:var(--head)}.sep{background:var(--sep)}' +
    'tr.lv1 td{font-weight:700}tr.lv3 td{color:var(--mut);font-style:italic}tr.lv4 td{color:var(--mut)}tr.dt td{padding:0 8px 6px;border:0}.neg{color:var(--bad)}.tag{font-size:10px;font-weight:600;color:var(--bad)}.tag2{font-size:10px;color:var(--mut);border:1px solid var(--line);padding:0 4px;border-radius:3px}' +
    '.ok{color:var(--ok)}.bad{color:var(--bad)}.alerta{color:var(--bad);font-weight:700;border:1px solid var(--bad);padding:8px 10px;border-radius:4px}.leyenda{border-left:4px solid var(--acc);padding:6px 10px;background:var(--head)}' +
    'table.det{font-size:12px;margin:6px 0 10px}summary{cursor:pointer;color:var(--acc);font-size:12px}nav a{margin-right:14px;color:var(--acc)}tr.vdsel td,tr.marcado td{background:var(--sel)}.vdbadge{font-size:11px;color:var(--acc);font-weight:600}' +
    '.vdctl{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin:8px 0}.vdctl input,.vdctl select,.vdctl button{font:inherit}';
  const datos = JSON.stringify(vd).replace(/</g, '\\u003c');
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Estado de resultados ' + ANIO + ' v' + nv + '</title><style>' + css + '</style></head><body>' +
    '<h1>Estado de resultados ' + ANIO + ' v' + nv + ' · preliminar</h1><div class="mut">Servicios FTS SA de CV · ' + esc(nombreMes(MESES[0])) + ' a ' + esc(nombreMes(MESES[MESES.length - 1])) + ' con banco' + (MV ? ', ' + esc(nombreMes(MV)) + ' sólo ventas' : '') + ' · pesos · <b>sin IVA</b> · privado<br>' +
    'Huella de resultados ' + esc(z.huella) + ' · huella de insumos ' + esc(z.huellaInsumos.slice(0, 16)) + '… · calcular.js ' + esc(VERSION) + (z.opciones.sha ? ' @ ' + esc(String(z.opciones.sha).slice(0, 7)) : '') + (z.opciones.generado_at ? ' · generado ' + esc(z.opciones.generado_at) + ' UTC' : '') + '</div>' +
    '<nav style="margin:12px 0"><a href="#vA">Vista A</a><a href="#vB">Vista B</a><a href="#vC">Vista C</a><a href="#vD">Vista D</a><a href="#puente">Puente</a><a href="#cambios">Qué cambió</a><a href="#conmet">Conmet</a><a href="#cob">Meses</a><a href="#sup">Supuestos</a><a href="#pi">Partidas</a><a href="#tablas">Tablas editables</a></nav>' +
    alertaNomina + '<p>Costo sin CFDI ligado: <b>' + pct(z.sinC, z.baseC) + '</b> del costo sin nómina (' + pct(z.sinC, A.tot.C.acum) + ' del costo total). Jeeves sin clasificar: <b>' + jSin.length + '</b> consumos, ' + pct(jSin.reduce((s, i) => s + i.bruto, 0), jeev.reduce((s, i) => s + i.bruto, 0)) + ' del monto de Jeeves.</p>' +
    tablaVista(A, 'Vista A · ventas confirmadas, Conmet por avance de obra', 'vA', true) +
    tablaVista(B, 'Vista B · igual que A, sin Conmet (ni su venta ni sus costos)', 'vB', false, 'El detalle de cada renglón es el de la Vista A sin los movimientos de Conmet.') +
    tablaVista(C, 'Vista C · ventas = facturado en ' + ANIO + ', sin Conmet («lo ejecutado»)', 'vC', true, 'Mismos costos que la Vista B; cambia la venta.') +
    vdHtml + hp + hCambios + hConmet +
    '<h2 id="cob">Meses y cobertura bancaria</h2>' + cob +
    '<h2 id="sup">Supuestos</h2><div class="scroll"><table class="det">' + supuestos.map(s => '<tr><td>' + esc(s[0]) + '</td><td><b>' + esc(s[1]) + '</b></td><td>' + esc(s[2]) + '</td></tr>').join('') + '</table></div>' +
    '<h2 id="pi">Partidas por identificar (pendientes de Esteban)</h2><p>' + partidas.length + ' partidas, ' + fmt(partidas.reduce((s, i) => s + i.bruto, 0)) + '. Se deciden en bancos.partidas_identificadas.</p>' + detalleItems(partidas) +
    '<h2>Payana por clasificar</h2><p>' + pc.length + ' pagos, ' + fmt(pc.reduce((s, i) => s + i.neto, 0)) + ' (dentro de costo).</p>' + detalleItems(pc) +
    '<h2>Jeeves sin clasificar</h2>' + hJeeves +
    '<h2 id="excl">Excluido del resultado (renglones informativos)</h2>' + hExcl +
    '<h2 id="tablas">Tablas editables</h2><ul><li><b>bancos.nomina_oficina</b>: una fila por persona de oficina: beneficiario (como aparece en el concepto del banco) o cuenta_mask (últimos 4 dígitos), vigente_desde, vigente_hasta, nota.</li>' +
    '<li><b>bancos.partidas_identificadas</b>: clasificacion = costo · pago_prestamo · devolucion_aportacion · traspaso_propio · otro, nota, fecha_decision.</li>' +
    '<li><b>bancos.reglas_edo_resultados</b>: reglas por patrón (concepto del banco, proveedor de Odoo, comercio de Jeeves).</li><li><b>bancos.er_parametros</b>: umbral de partidas, depreciación, costo estimado de Conmet.</li></ul>' +
    '<p class="mut">Cualquier cambio en estas tablas dispara el recálculo en los siguientes 30 minutos (7:00 a 21:00) y un correo a Esteban.</p>' +
    '<h2>Pendientes para Esteban</h2><ol>' + decisiones.map(d => '<li>' + esc(d) + '</li>').join('') + '</ol>' +
    '<p class="mut">Fuentes: base bancaria (vistas v_movimientos_validados, v_estados_validados, v_saldos_mensuales, rol bancos_er/bancos_lector) y Odoo en solo lectura. Issue #348.</p>' +
    '<script>window.__VD=' + datos + ';window.__escenarioCore=' + escenarioCore.toString() + ';(' + vistaDCliente.toString() + ')();</script></body></html>';
}

module.exports = { calcular, motor, armarVistas, escenarioCore, decidir, sha256, canon, VERSION };
