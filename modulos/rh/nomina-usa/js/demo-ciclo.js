/* ═══ RH · Nómina USA · práctica del ciclo completo (#448, MVP) ═══
 * Avisos entre pasos, vigilante, asiento de costo por SO y conciliación del registro de Auris,
 * en memoria. Misma forma que nomina_usa_0010…0012. Como en la base, los avisos de transición
 * salen de la BITÁCORA: se envuelve NusaDemo.log, igual que el trigger bitacora_avisa.
 * En práctica todo es sombra: nada sale de la pantalla.
 */
(function (G) {
  'use strict';
  var D = G.NusaDemo, S = D.estado, AU = G.NominaUSA.auris;
  Object.assign(S.config, { avisos_modo: 'sombra', vigilante_modo: 'sombra', costo_odoo_activo: false, conciliacion_activa: false,
    avisos_personas: { richard: [98], magaly: [63], erick: [149], gerardo: [59], esteban: [32] },
    costo_odoo_mapa: { company_id: 6, journal_id: null, cuenta_gasto_id: 301, cuenta_puente_id: null, analiticas: { 'COMERCIAL-USA': 3089, 'Sales FTS USA': 3089 } },
    conciliacion_formato: { separador: ',', columnas: { employee_id: ['employee id'], persona: ['employee', 'name'], neto: ['net pay'], imp_empleado: ['employee taxes'], imp_patron: ['employer taxes'], fee: ['fee'] },
      banco_journal_id: 122, banco_patrones: ['auris', 'payroll'], dias_antes: 3, dias_despues: 10, tolerancia_usd: 0.01 } });
  S.avisos = []; S.asientos = []; S.registros = [];
  // Cargos de ejemplo del banco BUS COMPLETE CHK (montos inventados para practicar; no son de Odoo).
  S.banco = [{ id: 1, fecha: '2026-11-05', ref: 'AURIS PAYROLL NET', monto: -3655.59 }, { id: 2, fecha: '2026-11-05', ref: 'AURIS PAYROLL TAXES', monto: -1016.25 },
             { id: 3, fecha: '2026-11-05', ref: 'Home Depot', monto: -214.33 }];
  var ANALITICA_SO = { 11842: 3104, 11791: 3103 };
  var usd = function (n) { return 'USD ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var c2 = function (n) { return Math.round(Number(n || 0) * 100) / 100; };
  function sol(id) { return S.solicitudes.find(function (s) { return s.id === Number(id); }); }
  function total(s, aut) { return c2(s.lineas.reduce(function (t, l) { return t + Number(aut ? (l.autorizado_monto || 0) : l.monto); }, 0)); }
  function avisar(clave, origen, evento, roles, asunto, html) {
    if (S.avisos.some(function (a) { return a.clave === clave; })) return;
    S.avisos.unshift({ id: S.avisos.length + 1, clave: clave, origen: origen, evento: evento, roles: roles, n_para: roles.length, asunto: asunto, html: html,
      modo: S.config[origen === 'vigilante' ? 'vigilante_modo' : 'avisos_modo'], encolada: false, creado_at: new Date().toISOString() });
  }
  function semTxt(s) { return s.semana; }
  var log0 = D.log;
  D.log = function (actor, evento, objeto, antes, despues, motivo) {
    log0.apply(null, arguments);
    var id = evento === 'solicitud_enviada' ? despues && despues.id : Number(String(objeto || '').split(':')[1]), s = sol(id);
    if (evento === 'solicitud_enviada' && s) avisar('enviada:' + s.id, 'aviso', 'enviada', ['magaly'], 'Nómina USA: Richard envió la solicitud de la semana ' + semTxt(s), 'Total pedido ' + usd(total(s)) + '. Te toca validar.');
    if (evento === 'solicitud_validada' && s) avisar('validada:' + s.id, 'aviso', 'validada', ['erick'], 'Nómina USA: Magaly validó la solicitud de la semana ' + semTxt(s), 'Te toca autorizar.');
    if (evento === 'solicitud_autorizada' && s) avisar('autorizada:' + s.id, 'aviso', 'autorizada', ['gerardo'], 'Nómina USA: autorizada la semana ' + semTxt(s) + ', súbela a Auris', 'Autorizado ' + usd(total(s, true)) + '. Abrir Nómina USA.');
    if (evento === 'subida_auris' && s) { avisar('subida:' + s.id, 'aviso', 'subida', ['richard', 'magaly', 'erick'], 'Nómina USA: la semana ' + semTxt(s) + ' ya está en Auris', usd(total(s, true)) + '. Auris deposita el viernes.'); prepararCosto(s); }
    if (evento === 'solicitud_devuelta' && s) avisar('devuelta:' + s.id, 'aviso', 'devuelta', ['richard'], 'Nómina USA: te devolvieron la solicitud de la semana ' + semTxt(s), 'Motivo: ' + (motivo || ''));
    if (evento === 'revision_pedida') avisar('revision:' + id, 'aviso', 'revision_pedida', ['magaly'], 'Nómina USA: revisa una incidencia en disputa', 'La solicitud está detenida hasta que la liberes.');
  };
  // El vigilante de práctica muestra cómo se ve un aviso suyo.
  avisar('vig_so_sin_avance:11791:nunca', 'vigilante', 'so_sin_avance', ['esteban', 'erick'], 'Vigilante nómina USA: SO11791 sin avance', 'SO11791 tiene 3 días con checadas de la cuadrilla y ningún avance reportado.');

  function calcCosto(s) {
    var m = S.config.costo_odoo_mapa, g = {}, falt = [];
    s.lineas.forEach(function (l) {
      var an = l.tipo === 'so' ? ANALITICA_SO[l.so_id] : m.analiticas[l.cuenta], k = l.employee_id + '|' + l.cuenta;
      g[k] = g[k] || { employee_id: l.employee_id, persona: l.alias, cuenta: l.cuenta, analytic_id: an || null, monto: 0 };
      g[k].monto = c2(g[k].monto + Number(l.autorizado_monto || 0));
    });
    var L = Object.keys(g).map(function (k) { return g[k]; }).filter(function (x) { return x.monto !== 0; });
    var tot = c2(L.reduce(function (t, x) { return t + x.monto; }, 0));
    if (!m.journal_id) falt.push('DIARIO: no hay diario de operaciones varias en la empresa 6 (costo_odoo_mapa.journal_id)');
    if (!m.cuenta_puente_id) falt.push('CUENTA_PUENTE: falta la cuenta «Nómina USA por pagar» (costo_odoo_mapa.cuenta_puente_id)');
    L.forEach(function (x) { if (!x.analytic_id && falt.indexOf('ANALITICA: sin cuenta analítica para ' + x.cuenta) < 0) falt.push('ANALITICA: sin cuenta analítica para ' + x.cuenta); });
    var lineas = L.map(function (x) { var d = {}; if (x.analytic_id) d[x.analytic_id] = 100;
      return { name: 'Nómina USA · ' + x.persona + ' · ' + x.cuenta, account_id: m.cuenta_gasto_id, debit: Math.max(x.monto, 0), credit: Math.max(-x.monto, 0), analytic_distribution: x.analytic_id ? d : null, employee_id: x.employee_id, cuenta: x.cuenta, persona: x.persona }; });
    lineas.push({ name: 'Nómina USA por pagar · semana ' + s.semana, account_id: m.cuenta_puente_id, debit: Math.max(-tot, 0), credit: Math.max(tot, 0), cuenta: 'PUENTE' });
    return { payload: { company_id: 6, journal_id: m.journal_id, move_type: 'entry', ref: 'NUSA-SOL-' + s.id + ' · Nómina USA semana ' + s.semana, lineas: lineas }, faltantes: falt, total: tot };
  }
  function prepararCosto(s) {
    var c = calcCosto(s), i = S.asientos.findIndex(function (a) { return a.solicitud_id === s.id; });
    var a = { id: s.id, solicitud_id: s.id, semana: s.semana, estado: 'vista_previa', payload: c.payload, faltantes: c.faltantes, total: c.total };
    if (i >= 0) S.asientos[i] = a; else S.asientos.push(a);
    return a;
  }
  D.reg('avisos', ['nomina_usa:validar', 'nomina_usa:autorizar', 'nomina_usa:archivo', 'nomina_usa:kiosko'], function () {
    return { ok: true, modos: { avisos: S.config.avisos_modo, vigilante: S.config.vigilante_modo }, latido_alertas: new Date(Date.now() - 6 * 60000).toISOString(), avisos: JSON.parse(JSON.stringify(S.avisos)) };
  });
  D.reg('costo_ver', ['nomina_usa:archivo', 'nomina_usa:autorizar', 'nomina_usa:validar'], function (p) {
    var s = sol(p.id); if (!s || ['autorizada', 'subida'].indexOf(s.estado) < 0) return { ok: false, error: 'NO_AUTORIZADA' };
    var a = S.asientos.find(function (x) { return x.solicitud_id === s.id; });
    if (a) return { ok: true, guardado: true, activo: S.config.costo_odoo_activo, asiento: JSON.parse(JSON.stringify(a)) };
    var c = calcCosto(s); return { ok: true, guardado: false, activo: S.config.costo_odoo_activo, asiento: { estado: 'sin_guardar', payload: c.payload, faltantes: c.faltantes, total: c.total, semana: s.semana } };
  });
  D.reg('costo_preparar', ['nomina_usa:archivo'], function (p) {
    var s = sol(p.id); if (!s || s.estado !== 'subida') return { ok: false, error: 'NO_SUBIDA', mensaje: 'El asiento se arma cuando la solicitud está marcada como subida.' };
    var a = prepararCosto(s); return { ok: true, asiento_id: a.id, estado: a.estado, faltantes: a.faltantes, total: a.total };
  });
  function conciliar(r) {
    var f = S.config.conciliacion_formato, tot = r.totales.total, tol = 0.01;
    var cand = S.banco.filter(function (b) { return b.monto < 0 && f.banco_patrones.some(function (p) { return b.ref.toLowerCase().indexOf(p) >= 0; }); })
      .map(function (b) { return { id: b.id, fecha: b.fecha, ref: b.ref, monto: -b.monto }; });
    var comb = null, n = cand.length, i, j, k;
    for (i = 0; i < n && !comb; i++) if (Math.abs(cand[i].monto - tot) <= tol) comb = [cand[i]];
    for (i = 0; i < n && !comb; i++) for (j = i + 1; j < n && !comb; j++) if (Math.abs(cand[i].monto + cand[j].monto - tot) <= tol) comb = [cand[i], cand[j]];
    for (i = 0; i < n && !comb; i++) for (j = i + 1; j < n && !comb; j++) for (k = j + 1; k < n && !comb; k++) if (Math.abs(cand[i].monto + cand[j].monto + cand[k].monto - tot) <= tol) comb = [cand[i], cand[j], cand[k]];
    var s = sol(r.solicitud_id), dif = [];
    if (s) {
      var a = {}, b = {};
      s.lineas.forEach(function (l) { a[l.employee_id] = c2((a[l.employee_id] || 0) + Number(l.autorizado_monto || 0)); });
      r.filas.forEach(function (x) { if (x.employee_id) b[x.employee_id] = c2((b[x.employee_id] || 0) + x.neto); });
      Object.keys(Object.assign({}, a, b)).forEach(function (e) { if (Math.abs((b[e] || 0) - (a[e] || 0)) > tol) dif.push({ employee_id: Number(e), autorizado: a[e] || 0, auris: b[e] || 0, diferencia: c2((b[e] || 0) - (a[e] || 0)) }); });
    }
    return { ok: true, registro_id: r.id, semana: r.semana, fecha_pago: r.fecha_pago, practica: true, totales: r.totales, candidatos: cand, cuadra: !!comb,
      cargos: comb ? comb.map(function (x) { return x.id; }) : [], suma_banco: comb ? c2(comb.reduce(function (t, x) { return t + x.monto; }, 0)) : c2(cand.reduce(function (t, x) { return t + x.monto; }, 0)),
      diferencias_persona: dif,
      propuesta: [{ concepto: 'Neto pagado a empleados', cuenta: 'Nómina USA por pagar (puente)', debe: r.totales.neto },
        { concepto: 'Impuestos del empleado y del patrón', cuenta: 'Impuestos de nómina pagados', debe: c2(r.totales.imp_empleado + r.totales.imp_patron) },
        { concepto: 'Fee de Auris', cuenta: 'Gasto administrativo', debe: r.totales.fee }, { concepto: 'Cargo(s) del banco', cuenta: 'BUS COMPLETE CHK', haber: tot }],
      activa: S.config.conciliacion_activa };
  }
  function prorrateo(r) {
    var s = r && sol(r.solicitud_id), g = {}, imp = r ? c2(r.totales.imp_empleado + r.totales.imp_patron) : 0, tn = 0;
    if (s) s.lineas.forEach(function (l) { var an = l.tipo === 'so' ? ANALITICA_SO[l.so_id] : S.config.costo_odoo_mapa.analiticas[l.cuenta];
      g[l.cuenta] = g[l.cuenta] || { cuenta: l.cuenta, analytic_id: an || null, neto: 0 }; g[l.cuenta].neto = c2(g[l.cuenta].neto + Number(l.autorizado_monto || 0)); });
    var L = Object.keys(g).map(function (k) { return g[k]; }).filter(function (x) { return x.neto > 0; }).sort(function (a, b) { return b.neto - a.neto; });
    L.forEach(function (x) { tn += x.neto; });
    var asig = 0; L.forEach(function (x) { x.impuestos = tn ? c2(imp * x.neto / tn) : 0; asig += x.impuestos; });
    if (L.length) L[0].impuestos = c2(L[0].impuestos + imp - asig);
    return { ok: true, mes: r ? r.fecha_pago.slice(0, 7) : null, registros: r ? 1 : 0, impuestos: imp, neto_total: c2(tn), lineas: L };
  }
  D.reg('auris_importar', ['nomina_usa:archivo'], function (p, q) {
    if (!p.filas || !p.filas.length) return { ok: false, error: 'REGISTRO_VACIO' };
    if (p.filas.some(function (x) { return ['neto', 'imp_empleado', 'imp_patron', 'fee'].some(function (k) { return Number(x[k] || 0) < 0; }); })) return { ok: false, error: 'REGISTRO_INVALIDO' };
    var t = { neto: 0, imp_empleado: 0, imp_patron: 0, fee: 0 };
    p.filas.forEach(function (x) { Object.keys(t).forEach(function (k) { t[k] = c2(t[k] + Number(x[k] || 0)); }); });
    t.total = c2(t.neto + t.imp_empleado + t.imp_patron + t.fee); t.personas = p.filas.length;
    var s = S.solicitudes.filter(function (x) { return x.semana === p.semana && (x.estado === 'autorizada' || x.estado === 'subida'); }).pop();
    S.registros.forEach(function (r) { if (r.semana === p.semana) r.vigente = false; });
    var r = { id: S.registros.length + 1, solicitud_id: s ? s.id : null, semana: p.semana, fecha_pago: p.fecha_pago || '2026-11-06', filas: p.filas, totales: t, vigente: true };
    S.registros.push(r); D.log(q.actor, 'auris_importado', 'auris:' + r.id, null, t, 'práctica');
    var c = conciliar(r);
    if (!c.cuadra) avisar('concilia_no_cuadra:' + r.id, 'aviso', 'conciliacion_no_cuadra', ['gerardo'], 'Nómina USA: el banco no cuadra con el registro de Auris', 'Registro ' + usd(t.total) + ' contra banco ' + usd(c.suma_banco) + '.');
    return { ok: true, id: r.id, totales: t, revision: { cuadra: c.cuadra, cargos: c.cargos } };
  });
  D.reg('conciliacion_ver', ['nomina_usa:archivo', 'nomina_usa:autorizar'], function (p) {
    var r = S.registros.filter(function (x) { return x.semana === p.semana && x.vigente; }).pop();
    return { ok: true, formato: S.config.conciliacion_formato, activa: S.config.conciliacion_activa, conciliacion: r ? conciliar(r) : null, prorrateo: prorrateo(r) };
  });
  G.NusaDemoCiclo = { avisar: avisar, calcCosto: calcCosto, EJEMPLO: AU.EJEMPLO };
})(window);
