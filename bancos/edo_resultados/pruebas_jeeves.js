/* Pruebas SINTÉTICAS de Jeeves en el estado de resultados (#352). Sin datos reales. Uso: node bancos/edo_resultados/pruebas_jeeves.js [ruta del calcular.js del v1.2] */
const c = require('./calcular.js');
const ok = (n, cond, det) => { console.log((cond ? '✅' : '❌') + ' ' + n + (det ? ' · ' + det : '')); if (!cond) process.exitCode = 1; };
const reglas = [{ id: 11, prioridad: 11, destino: 'excluir_fondeo_jeeves', campo: 'descripcion', patron: 'JE+V+E+[SD]' },
  { id: 230, prioridad: 230, destino: 'jeeves_costo', campo: 'comercio_jeeves', patron: 'FERR', subcategoria: 'ferreteria_materiales' }];
const est = (alias, p) => ({ estado_id: alias + p, alias, numero_mask: '…0000', moneda: alias === 'USD' ? 'USD' : 'MXN', periodo: p, estado_validacion: 'validado', saldo_inicial: '0', saldo_final: '0' });
let id = 1;
const mov = (p, fecha, desc, cargo) => ({ movimiento_id: id++, alias: 'General', numero_mask: '…0000', moneda: 'MXN', periodo: p, renglon: id, fecha, codigo: '', descripcion: desc, referencia: '',
  cargo: String(cargo), abono: '0', categoria: '', subcategoria: '', es_traspaso_interno: false, archivo: 'x.pdf', pagina: 1, sha256: 's', hash: 'h' + id });
const UUID = 'ABCDEF12-3456-7890-ABCD-EF1234567890';
function base(conJeeves) {
  const i = { reglas, estados: ['2026-01', '2026-02'].flatMap(p => ['General', 'Nomina', 'USD'].map(a => est(a, p))), faltantes: [], parametros: [], nomina_oficina: [], partidas: [], auditoria: [],
    banco: [mov('2026-01', '2026-01-31', 'SPEI JEEVES', 500), mov('2026-02', '2026-02-27', 'SPEI JEEVES', 2000)],
    odoo: { ventas: [{ id: 5, name: 'SO11547', partner_id: [70, 'CLIENTE REAL SA DE CV'], date_order: '2026-01-10 12:00:00', amount_untaxed: 100000, currency_id: [33, 'MXN'] }],
      tc: [], facturas_cliente: [], pagos: [], empleados: [], asistencias: [], carga_mo: [], payana: [],
      analiticas: [{ id: 100, name: 'SO11547 - Proyecto Uno', plan_id: [1, 'p'], root_plan_id: [1, 'p'], create_date: '2026-01-01', active: true },
        { id: 200, name: 'COMUN', plan_id: [2, 'c'], root_plan_id: [2, 'c'], create_date: '2025-01-01', active: true }],
      facturas: [{ id: 1, name: 'BILL1', partner_id: [9, 'FERRETERIA UNO'], invoice_date: '2026-02-03', date: '2026-02-03', amount_total: 116, amount_untaxed: 100, currency_id: [33, 'MXN'], move_type: 'in_invoice' },
        { id: 2, name: 'BILL2', partner_id: [10, 'SOFTWARE DOS'], invoice_date: '2026-02-05', date: '2026-02-05', amount_total: 232, amount_untaxed: 200, currency_id: [33, 'MXN'], move_type: 'in_invoice', l10n_mx_edi_cfdi_uuid: UUID }],
      lineas: [{ id: 1, move_id: [1, 'BILL1'], price_subtotal: 100, analytic_distribution: { '100': 100 } }, { id: 2, move_id: [2, 'BILL2'], price_subtotal: 200, analytic_distribution: { '200': 100 } }],
      // diario 61: un consumo de enero (se queda en enero), uno del 30 de enero aplicado en el ciclo de febrero, y los de febrero
      jeeves: [{ id: 1, date: '2026-01-15', payment_ref: '[Tarjeta ****4548] Tienda Enero', amount: -300, is_reconciled: false },
        { id: 2, date: '2026-01-30', payment_ref: '[Tarjeta ****4548] Ferreteria Corte', amount: -150, is_reconciled: false },
        { id: 3, date: '2026-02-03', payment_ref: '[Tarjeta ****4548] Ferreteria Uno', amount: -116, is_reconciled: true, reconciled_lines_name: 'BILL1' },
        { id: 4, date: '2026-02-05', payment_ref: '[Tarjeta ****6831] Software Dos', amount: -232, is_reconciled: false },
        { id: 5, date: '2026-02-10', payment_ref: '[Tarjeta ****4666] Restaurante', amount: -400, is_reconciled: false },
        { id: 6, date: '2026-02-12', payment_ref: '[Tarjeta ****4666] Tienda Personal', amount: -500, is_reconciled: false },
        { id: 7, date: '2026-02-26', payment_ref: '[Tarjeta ****4548] Tienda Marzo', amount: -90, is_reconciled: false },    // se aplica en marzo: no está en el PDF de febrero
        { id: 8, date: '2026-02-27', payment_ref: '[FONDEO] Credit Line', amount: 2000, is_reconciled: false }] } };
  if (!conJeeves) return i;
  // ciclo de febrero 2026: Previous 0 + Payments −2,000 + New Charges 2,098 = Amount Due 98 (con un renglón que no está en el feed: 700)
  i.jeeves = {
    ciclos: [{ ciclo: '2026-02', periodo_inicio: '2026-02-01', periodo_fin: '2026-02-28', v1_ok: true, previous_balance: '0.00', payments: '-2000.00', cashback: '0', new_charges: '2098.00', late_fee: '0', pay_fee: '0', adjustment: '0', amount_due: '98.00', archivo: 'Jeeves_Tarjeta-MXN_Servicios-FTS_2026-02.pdf', sha256: 'x' }],
    movimientos: [
      { movimiento_id: 11, ciclo: '2026-02', fecha: '2026-01-30', tarjeta: '4548', monto_mxn: '150.00', tipo: 'consumo', comercio: 'Ferreteria Corte', pagina: 2, renglon: 1 },
      { movimiento_id: 12, ciclo: '2026-02', fecha: '2026-02-03', tarjeta: '4548', monto_mxn: '116.00', tipo: 'consumo', comercio: 'Ferreteria Uno', pagina: 2, renglon: 2 },
      { movimiento_id: 13, ciclo: '2026-02', fecha: '2026-02-05', tarjeta: '6831', monto_mxn: '232.00', tipo: 'consumo', comercio: 'Software Dos', pagina: 2, renglon: 3 },
      { movimiento_id: 14, ciclo: '2026-02', fecha: '2026-02-10', tarjeta: '4666', monto_mxn: '400.00', tipo: 'consumo', comercio: 'Restaurante', pagina: 2, renglon: 4 },
      { movimiento_id: 15, ciclo: '2026-02', fecha: '2026-02-12', tarjeta: '4666', monto_mxn: '500.00', tipo: 'consumo', comercio: 'Tienda Personal', pagina: 2, renglon: 5 },
      { movimiento_id: 16, ciclo: '2026-02', fecha: '2026-02-20', tarjeta: '4548', monto_mxn: '700.00', tipo: 'consumo', comercio: 'Material Obra', pagina: 2, renglon: 6 },
      { movimiento_id: 17, ciclo: '2026-02', fecha: '2026-02-27', tarjeta: null, monto_mxn: '-2000.00', tipo: 'pago', comercio: 'Payment - 2,000.00 MXN Paid', pagina: 3, renglon: 7 }],
    transacciones: [
      { unique_id: 'T2', tipo: 'consumo', monto_firmado: '116.00', tarjeta: '4548', created_mty: '2026-02-03 10:00:00', posted_mty: '2026-02-04 10:00:00', memo: '', categoria: 'Hardware Stores' },
      { unique_id: 'T3', tipo: 'consumo', monto_firmado: '232.00', tarjeta: '6831', created_mty: '2026-02-05 10:00:00', posted_mty: '2026-02-06 10:00:00', memo: '', categoria: 'Computer Software Stores',
        sat_uuid: UUID, sat_uuid_valido: true, sat_subtotal: '200.00', sat_total: '232.00' },
      { unique_id: 'T4', tipo: 'consumo', monto_firmado: '400.00', tarjeta: '4666', created_mty: '2026-02-10 10:00:00', posted_mty: '2026-02-11 10:00:00', memo: 'comida obra SO11547', categoria: 'Eating Places, Restaurants' },
      { unique_id: 'T5', tipo: 'consumo', monto_firmado: '500.00', tarjeta: '4666', created_mty: '2026-02-12 10:00:00', posted_mty: '2026-02-13 10:00:00', memo: 'gasto Personal', categoria: 'Department Stores' },
      { unique_id: 'T6', tipo: 'consumo', monto_firmado: '700.00', tarjeta: '4548', created_mty: '2026-02-20 10:00:00', posted_mty: '2026-02-21 10:00:00', memo: '', categoria: 'Electrical Parts and Equipment' }],
    palabras: [{ patron: '\\bpersonal(es)?\\b', activa: true }],
    categorias: [{ id: 1, prioridad: 11, patron: 'electrical|electric\\s+parts', destino: 'costo', subcategoria: 'electrico_mecanico', activa: true },
      { id: 2, prioridad: 30, patron: 'software', destino: 'administrativo', subcategoria: 'software_suscripciones', activa: true },
      { id: 3, prioridad: 32, patron: 'restaurant|eating', destino: 'administrativo', subcategoria: 'restaurantes_mty', activa: true }] };
  return i;
}
const r = c.calcular(base(true), { sin_archivos: true }), m = r._interno.m;
const J = m.items.filter(x => x.cuenta.indexOf('Jeeves') === 0);
const de = mid => J.filter(x => x.mov === 'jp:' + mid);
// f) SAT Uuid → SAT Subtotal y «con CFDI»
{ const x = de(13)[0]; ok('f) transacción con SAT Uuid usa SAT Subtotal y queda con CFDI', x && x.neto === 20000 && x.cfdi && x.cfdi.via === 'sat_csv' && x.destino === 'admin_jeeves_analitica_comun' && x.paso === 2,
  x && (x.destino + ' · neto ' + x.neto / 100 + ' · ' + x.cfdi.via + ' · paso ' + x.paso)); }
// g) memo «personal» → renglón de gastos personales, no costo
{ const x = de(15)[0]; const L = r._interno.A.lineas.find(l => l.clave === 'jeeves_personales');
  ok('g) memo con «personal» va a gastos personales o ajenos, no a costo', x && x.destino === 'jeeves_personal' && L && L.vals['2026-02'] === 50000 && r.resumen.cuadra_al_centavo,
    x && (x.destino + ' · renglón ' + (L && L.vals['2026-02'] / 100) + ' · puente ' + r.resumen.cuadra_al_centavo)); }
// h) memo con folio SO existente → ese proyecto, costo
{ const x = de(14)[0]; ok('h) memo con folio SO existente queda en ese proyecto como costo', x && x.destino === 'costo_jeeves_proyecto' && x.paso === 3 && x.proyecto_memo === 'SO11547', x && (x.destino + ' · ' + x.regla)); }
// pasos 1, 5 y el corte de fechas
{ const a = de(12)[0], e = de(16)[0], k = de(11)[0];
  ok('paso 1: analítica de la factura conciliada', a && a.destino === 'costo_jeeves_proyecto' && a.paso === 1);
  ok('paso 5: categoría del comercio', e && e.destino === 'costo_jeeves_electrico_mecanico' && e.paso === 5);
  ok('corte: comprado el 30-ene y aplicado en febrero va a febrero, y enero no lo cuenta dos veces', k && k.periodo === '2026-02' && !J.some(x => x.id === 'account.bank.statement.line 2'));
  ok('enero sigue con el diario 61 (sin ciclo) y se marca', J.some(x => x.id === 'account.bank.statement.line 1' && x.jfuente === 'diario61') && m.cobertura['2026-01'].jeeves.indexOf('diario 61') === 0);
  ok('febrero no usa el diario 61', !J.some(x => x.periodo === '2026-02' && x.jfuente === 'diario61')); }
// R3 con saldos reales
{ const q = m.conciliacion.jeeves['2026-02']; ok('R3: acumulado = −Amount Due, fondeos − pagos = 0', q.acumulado === -9800 && q.pendiente_fondear === 9800 && q.dif_mes === 0 && q.saldo_final === 9800, JSON.stringify(q)); }
// cotejo contra Odoo: la diferencia queda explicada al centavo
{ const k = m.jeeves.cotejo['2026-02'];
  ok('cotejo contra Odoo explicado al centavo', k.no_explicado === 0 && k.faltan_en_odoo === 70000 && k.pdf_comprado_otro_mes === 15000 && k.sobran_en_odoo === 9000 && k.odoo_cuadra,
    'PDF ' + k.pdf_new_charges / 100 + ' · Odoo mes ' + k.odoo_consumos_mes / 100 + ' · otro mes ' + k.pdf_comprado_otro_mes / 100 + ' · faltan ' + k.faltan_en_odoo / 100 + ' · sobran ' + k.sobran_en_odoo / 100); }
// % por paso y sin clasificar
{ const jc = r.resumen.jeeves_clasificacion; ok('indicadores: % por paso y sin clasificar contra el v1.2', jc && jc.por_paso['1'] && jc.sin_clasificar_v12 && jc.meses_estado_de_cuenta.join() === '2026-02', JSON.stringify(jc.por_paso) + ' · sin clasificar ' + jc.sin_clasificar + ' (v1.2 ' + jc.sin_clasificar_v12 + ')'); }
// sin base de Jeeves: mismo resultado que el v1.2
{ const v12 = process.argv[2] ? require(process.argv[2]) : null;
  if (v12) { const a = c.calcular(base(false), { sin_archivos: true }), b = v12.calcular(base(false), { sin_archivos: true });
    ok('sin base de Jeeves la huella de resultados es idéntica a la del v1.2', a.huella === b.huella, a.huella.slice(0, 12) + ' vs ' + b.huella.slice(0, 12)); } }
// el HTML privado se arma
{ const h = c.calcular(base(true), { generado_at: '2026-09-29T12:00:00Z' }); const html = (h.archivos || []).map(a => a.contenido || '').join('') + JSON.stringify(Object.keys(h));
  ok('el informe privado se arma con la sección de Jeeves', /Jeeves: estado de cuenta, clasificación y cotejo contra Odoo/.test(JSON.stringify(h)), Object.keys(h).join(',')); }
