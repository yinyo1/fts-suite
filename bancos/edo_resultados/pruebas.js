/* Pruebas con datos SINTÉTICOS del estado de resultados (#348). Sin datos reales. Uso: node bancos/edo_resultados/pruebas.js */
const c=require('./calcular.js');
const reglas=[{id:10,prioridad:10,destino:'excluir_fondeo_payana',campo:'descripcion',patron:'PAYAN'},{id:11,prioridad:11,destino:'excluir_fondeo_jeeves',campo:'descripcion',patron:'JE+V+E+[SD]'}];
const est=(alias,p,sal)=>({estado_id:alias+p,alias,numero_mask:'…0000',moneda:alias==='USD'?'USD':'MXN',periodo:p,estado_validacion:'validado',saldo_inicial:sal?sal[0]:'0',saldo_final:sal?sal[1]:'0'});
let id=1; const mov=(alias,p,fecha,desc,cargo,abono,extra)=>Object.assign({movimiento_id:id++,alias,numero_mask:'…0000',moneda:'MXN',periodo:p,renglon:id,fecha,codigo:'',descripcion:desc,referencia:'',cargo:String(cargo||0),abono:String(abono||0),categoria:'',subcategoria:'',es_traspaso_interno:false,archivo:'x.pdf',pagina:1,sha256:'s',hash:'h'+id},extra||{});
function base(){ return { reglas, estados:[est('General','2026-01'),est('Nomina','2026-01',['0','0']),est('USD','2026-01'),est('General','2026-02'),est('Nomina','2026-02',['0','0']),est('USD','2026-02')], faltantes:[], parametros:[], nomina_oficina:[], partidas:[], auditoria:[],
  banco:[ mov('General','2026-01','2026-01-15','PAGO CUENTA DE TERCERO NOMINA',1000,0,{es_traspaso_interno:true,subcategoria:'nomina'}), mov('Nomina','2026-01','2026-01-15','TRASPASO',0,1000,{es_traspaso_interno:true,subcategoria:'nomina'}), mov('Nomina','2026-01','2026-01-16','PAGO DE NOMINA',1000,0),
          mov('General','2026-01','2026-01-10','SPEI JEEVES',1000,0), mov('General','2026-01','2026-01-11','SPEI PAYANA',500,0),
          mov('General','2026-02','2026-02-15','PAGO CUENTA DE TERCERO NOMINA',2000,0,{es_traspaso_interno:true,subcategoria:'nomina'}), mov('Nomina','2026-02','2026-02-15','TRASPASO',0,2000,{es_traspaso_interno:true,subcategoria:'nomina'}), mov('Nomina','2026-02','2026-02-16','PAGO DE NOMINA',2000,0) ],
  odoo:{ ventas:[], tc:[], facturas_cliente:[], pagos:[],
    analiticas:[{id:100,name:'PROY',plan_id:[1,'p'],root_plan_id:[1,'p'],create_date:'2026-01-01'},{id:200,name:'COMUN',plan_id:[2,'c'],root_plan_id:[2,'c'],create_date:'2025-01-01'},{id:300,name:'RUBRO',plan_id:[20,'r'],root_plan_id:[20,'r']}],
    facturas:[{id:1,name:'BILL1',partner_id:[9,'PROV JEEVES'],invoice_date:'2026-01-05',date:'2026-01-05',amount_total:950,amount_untaxed:818.97,currency_id:[33,'MXN'],move_type:'in_invoice'},
              {id:2,name:'BILL2',partner_id:[8,'PROVEEDOR RARO'],invoice_date:'2026-01-06',date:'2026-01-06',amount_total:116,amount_untaxed:100,currency_id:[33,'MXN'],move_type:'in_invoice'}],
    lineas:[{id:1,move_id:[1,'BILL1'],price_subtotal:700,analytic_distribution:{'100,300':100}},{id:2,move_id:[1,'BILL1'],price_subtotal:300,analytic_distribution:{'200':100}},{id:3,move_id:[2,'BILL2'],price_subtotal:100,analytic_distribution:false}],
    jeeves:[{id:1,date:'2026-01-12',payment_ref:'[Tarjeta ****1] Ferreteria',amount:-950,is_reconciled:true,reconciled_lines_name:'BILL1'}],
    payana:[{id:1,date:'2026-01-12',ref:'BILL2',name:'BILL2',partner_id:[8,'PROVEEDOR RARO'],credit:500,debit:0,move_id:[50,'PAY']}],
    empleados:[{id:1,name:'PERSONA A',active:true,create_date:'2025-01-01'},{id:2,name:'PERSONA B',active:true,create_date:'2025-01-01'},{id:3,name:'PERSONA C',active:true,create_date:'2025-01-01'}],
    asistencias:[], carga_mo:[] } }; }
const at=(e,fecha,h,so,bolsa)=>({employee_id:[e,'x'],check_in:fecha+' 14:00:00',worked_hours:h,x_studio_sales_order_2:so?[1,'SO']:false,x_studio_many2one_field_GUbBF:bolsa?[200,'B']:false});
const ok=(n,cond,det)=>console.log((cond?'✅':'❌')+' '+n+(det?' · '+det:''));
// a) 30h proyecto + 10h común, nómina 1000 → 750/250 (enero sólo con A)
{ const i=base(); i.odoo.empleados=i.odoo.empleados.slice(0,1); i.odoo.asistencias=[at(1,'2026-01-05',30,true),at(1,'2026-01-06',10,false,true),at(1,'2026-02-05',10,true)];
  const m=c.calcular(i,{sin_archivos:true})._interno.m.repartoNomina['2026-01']; ok('a) 30 h proyecto / 10 h común sobre 1,000.00', m.costo===75000&&m.comun===25000, (m.costo/100)+' / '+(m.comun/100)); }
// b) B sin horas en febrero con historial 60 % (enero medido 60/40); A presente en febrero 100 % proyecto
{ const i=base(); i.odoo.empleados=i.odoo.empleados.slice(0,2); i.odoo.asistencias=[at(2,'2026-01-05',60,true),at(2,'2026-01-06',40,false,true),at(1,'2026-01-07',100,true),at(1,'2026-02-05',100,true)];
  const r=c.calcular(i,{sin_archivos:true})._interno.m.repartoNomina['2026-02']; const b=r.personas.find(x=>x.id===2);
  ok('b) sin horas en el mes con historial 60 %', b && Math.abs(b.pct-0.6)<1e-9 && b.tipo==='historial', b && (b.pct*100).toFixed(0)+'% · '+b.fuente+' · reparto feb '+(r.costo/100)+'/'+(r.comun/100)); }
// c) C nunca cargó horas → nómina sin horas
{ const i=base(); i.odoo.asistencias=[at(1,'2026-01-05',40,true),at(2,'2026-01-05',40,false,true)];
  const r=c.calcular(i,{sin_archivos:true})._interno.m.repartoNomina['2026-01']; ok('c) nunca cargó horas → «Nómina sin horas cargadas»', r.sin>0 && r.cuenta.sin_horas===1, 'sin horas '+(r.sin/100)+' de '+(r.N/100)); }
// d) Jeeves conciliado a factura 70 % proyecto / 30 % común (plan 20 ignorado)
{ const i=base(); const it=c.calcular(i,{sin_archivos:true})._interno.m.items.filter(x=>x.cuenta.indexOf('Jeeves')===0);
  const p=it.find(x=>x.destino==='costo_jeeves_proyecto'), q=it.find(x=>x.destino==='admin_jeeves_analitica_comun'); ok('d) Jeeves 70 % proyecto / 30 % común', p&&q&&p.bruto===66500&&q.bruto===28500, p&&(p.bruto/100)+' / '+(q.bruto/100)); }
// e) Payana sin analítica ni regla → costo sin clasificar
{ const i=base(); const it=c.calcular(i,{sin_archivos:true})._interno.m.items.filter(x=>x.cuenta.indexOf('Payana')===0); ok('e) Payana sin analítica ni regla → costo sin clasificar', it.length===1&&it[0].destino==='costo_payana_sin_clasificar', it[0]&&it[0].destino); }
// f) fondeo Jeeves 1,000 vs consumos 950 → diferencia acumulada 50
{ const i=base(); const q=c.calcular(i,{sin_archivos:true})._interno.m.conciliacion.jeeves['2026-01']; ok('f) fondeo Jeeves 1,000.00 vs consumos 950.00 → diferencia 50.00 visible', q.diferencia===5000&&q.acumulado===5000, 'acumulado '+(q.acumulado/100)); }
// g) puente ampliado cuadra al centavo; h) nómina repartida = nómina del banco
{ const i=base(); i.odoo.asistencias=[at(1,'2026-01-05',33.3,true),at(2,'2026-01-05',21.7,false,true),at(1,'2026-02-05',7,true),at(2,'2026-02-05',13,false,true)]; const r=c.calcular(i,{sin_archivos:true});
  ok('g) puente ampliado cuadra al centavo', r.resumen.cuadra_al_centavo===true, 'diferencias '+JSON.stringify(r._interno.pz.cuadre));
  const RN=r._interno.m.repartoNomina; ok('h) nómina repartida = nómina total del banco', ['2026-01','2026-02'].every(p=>RN[p].costo+RN[p].comun+RN[p].sin===RN[p].N), ['2026-01','2026-02'].map(p=>(RN[p].costo/100)+'+'+(RN[p].comun/100)+'+'+(RN[p].sin/100)+'='+(RN[p].N/100)).join(' · ')); }
// B11 (#356, motor v1.3.1): las horas a proyecto se leen de x_studio_project_id; el campo de SO queda sólo como respaldo de lo viejo
{ const atp=(e,fecha,h,proy,so,bolsa)=>({employee_id:[e,'x'],check_in:fecha+' 14:00:00',worked_hours:h,x_studio_project_id:proy?[2382,'PROY']:false,x_studio_sales_order_2:so?[1,'SO']:false,x_studio_many2one_field_GUbBF:bolsa?[200,'B']:false});
  const i=base(); i.odoo.empleados=i.odoo.empleados.slice(0,1);
  i.odoo.asistencias=[atp(1,'2026-01-05',30,true,false,false),atp(1,'2026-01-06',10,false,false,true),atp(1,'2026-02-05',10,true,false,false)];
  const m=c.calcular(i,{sin_archivos:true})._interno.m.repartoNomina['2026-01'];
  ok('B11 a) SO vacío y proyecto lleno → la hora cuenta a proyecto; ambos vacíos y bolsa llena → común', m.costo===75000&&m.comun===25000, (m.costo/100)+' / '+(m.comun/100));
  const j=base(); j.odoo.empleados=j.odoo.empleados.slice(0,1);
  j.odoo.asistencias=[atp(1,'2026-01-05',30,false,true,false),atp(1,'2026-01-06',10,false,false,true),atp(1,'2026-02-05',10,false,true,false)];
  const n=c.calcular(j,{sin_archivos:true})._interno.m.repartoNomina['2026-01'];
  ok('B11 b) registros viejos con sólo el campo de SO siguen contando a proyecto (tolerante)', n.costo===75000&&n.comun===25000, (n.costo/100)+' / '+(n.comun/100));
  const k=base(); k.odoo.empleados=k.odoo.empleados.slice(0,1);
  k.odoo.asistencias=[atp(1,'2026-01-05',30,false,false,false),atp(1,'2026-01-06',10,false,false,true),atp(1,'2026-02-05',10,false,false,true)];
  const q=c.calcular(k,{sin_archivos:true})._interno.m.repartoNomina['2026-01'];
  // enero: 30 h sin proyecto, sin SO y sin bolsa + 10 h de bolsa → las 30 h no cuentan a proyecto ni a común; enero queda bajo el umbral de horas medidas
  // y se estima con el historial de la persona (febrero, 100 % común). Nómina de enero 1,000.00 → costo 0.00 y común 1,000.00 exactos.
  ok('B11 c) sin proyecto, sin SO y sin bolsa la hora no se clasifica (no se inventa proyecto)', q.costo===0&&q.comun===100000&&q.sin===0&&q.cuenta.medido===0&&q.cuenta.historial===1, (q.costo/100)+' / '+(q.comun/100)+' · '+q.cuenta.medido+' medidos · '+q.cuenta.historial+' por historial'); }
// Vista D a–c (núcleo del escenario; d se prueba en el navegador)
{ const b={'2026-01':100000,acum:100000}, mv=[{id:'a',mes:'2026-01',bruto:11600},{id:'b',mes:'2026-01',bruto:23200},{id:'e',mes:'2026-01',bruto:34800}];
  let r=c.escenarioCore(b,mv,['a','b','e'],12); ok('Vista D a) 116+232+348 al 12 %', Math.round(r.acum.subtotal)===60000&&Math.round(r.acum.costo)===7200&&Math.round(r.acum.neto)===52800&&Math.round(r.acum.hipotetica)===152800);
  r=c.escenarioCore(b,mv,['a','b','e'],0); ok('Vista D b) al 0 % sube la suma de subtotales', Math.round(r.acum.hipotetica-r.acum.base)===60000);
  r=c.escenarioCore(b,mv,[],12); ok('Vista D c) sin selección = base', r.acum.hipotetica===r.acum.base); }

// ═══ Vista E (datos sintéticos, centavos) ═══
{
  const CAT = Object.values(c.leerCatalogo([])).map(x => ({ clave: x.clave, tipo: x.tipo, seccion: x.seccion, etiqueta: x.etiqueta, renglon: x.renglon, entra: x.entra }));
  const v = n => ({ '2026-01': n, acum: n });
  const lin = [{ c: 'costo_prov_sin', e: 'Proveedores sin CFDI', s: 'costo', v: v(100000) }, { c: 'costo_nomina', e: 'Nómina de proyectos', s: 'costo', v: v(70000) },
    { c: 'ga_nomina_oficina', e: 'Nómina común', s: 'ga', v: v(30000) }, { c: 'ga_nomina_sin_horas', e: 'Sin horas', s: 'ga', v: v(0) }, { c: 'partidas', e: 'Partidas', s: 'pi', v: v(10000) }];
  const mv = (k, t, b, n, pz, extra) => Object.assign({ k, f: 'banco', fe: '2026-01-10', m: '2026-01', cu: 'General', co: 'MOV ' + k, cp: '', t, b, n, cf: false, cx: false, ca: '', cat: '', rg: '', o: '', pz, ex: pz.every(x => !x[0]), pi: false }, extra || {});
  const D = { meses: ['2026-01'], cat: CAT, lineas: { A: lin, B: lin, C: lin }, ventas: { A: v(500000), B: v(500000), C: v(500000) }, nom: { '2026-01': { p: 0.7, c: 0.3, s: 0 } }, proyectos: [],
    movs: [mv('m1', 'cargo', 11600, 10000, [['costo_prov_sin', 10000]]), mv('mT', 'cargo', 50000, 50000, [[null, 50000]]), mv('mP', 'cargo', 10000, 10000, [['partidas', 10000]]),
      mv('mN', 'cargo', 100000, 100000, [['__nomina', 100000]]), mv('mR', 'cargo', 116000, 100000, [['costo_prov_sin', 100000]]),
      mv('x1', 'cargo', 2000, 2000, [['costo_prov_sin', 2000]], { cp: 'PROVEEDOR X' }), mv('x2', 'cargo', 3000, 3000, [['costo_prov_sin', 3000]], { cp: 'PROVEEDOR X' })] };
  const val = (r, c) => { const l = r.lineas.find(x => x.c === c); return l ? l.v.acum : 0; };
  const P = c.personalizadoCore;
  let r = P(D, { modo: 'reclasificacion', base: 'C', cambios: { m1: { partes: [{ dest: 'costo_proveedores', pct: 60 }, { dest: 'admin_otros', pct: 40 }] } } });
  ok('E a) partir 116.00 bruto (100.00 subtotal) en 60 % costo / 40 % administrativo', val(r, 'costo_prov_sin') === 100000 - 10000 + 6000 && val(r, 'ga_admin_otros') === 4000 && r.puente.cuadra, '60.00 / 40.00 · puente ' + (r.puente.cuadra ? 'verde' : 'rojo'));
  r = P(D, { modo: 'reclasificacion', base: 'C', cambios: { m1: { partes: [{ dest: 'costo_proveedores', pct: 50 }, { dest: 'admin_otros', pct: 40 }] } } });
  ok('E b) partición que suma 90 % → rojo, no se aplica ni se exporta', !r.puente.cuadra && r.errores.length === 1 && val(r, 'costo_prov_sin') === 100000 && !r.aplicados.length, r.errores[0] && r.errores[0].motivo);
  r = P(D, { modo: 'escenario', base: 'C', ajMov: { m1: -25 } });
  ok('E c) ajuste −25 % a un subtotal de 100.00 → 75.00; difiere del banco en 25.00 con desglose', val(r, 'costo_prov_sin') === 100000 - 2500 && Math.round(r.difBanco) === -2500 && r.ajustes.length === 1, 'diferencia ' + (r.difBanco / 100).toFixed(2));
  r = P(D, { modo: 'escenario', base: 'C', ajMov: { mN: 10 }, ajRen: { costo_nomina: { pct: -10, meses: [] } } });
  const esperado = (70000 + 100000 * 0.7 * 0.10) * 0.9;
  ok('E d) −10 % al renglón nómina de campo después de un ajuste por movimiento', Math.abs(val(r, 'costo_nomina') - esperado) < 1e-6, (val(r, 'costo_nomina') / 100).toFixed(2) + ' = (700.00 + 70.00) × 0.9');
  { const q = c.escenarioCore({ '2026-01': 0, acum: 0 }, [{ id: 'mR', mes: '2026-01', bruto: 116000 }], ['mR'], 12).acum; const r2 = P(D, { modo: 'escenario', base: 'C' });
    ok('E e) retener 1,160.00 bruto al 12 %: 1,000.00 · 120.00 · 880.00, sin descontarlo arriba', Math.round(q.subtotal) === 100000 && Math.round(q.costo) === 12000 && Math.round(q.neto) === 88000 && val(r2, 'costo_prov_sin') === 100000); }
  { const S1 = { modo: 'escenario', base: 'C', cambios: { mT: { partes: [{ dest: 'costo_proveedores', pct: 100 }] } }, ajMov: { m1: -25 } }, S2 = { modo: 'reclasificacion', base: 'A', cambios: { mP: { partes: [{ dest: 'fuera_prestamo', pct: 100 }] } } },
      S3 = { modo: 'escenario', base: 'B', ajRen: { partidas: { pct: -50, meses: ['2026-01'] } } };
    const antes = [S1, S2, S3].map(s => P(D, s).tot.UOP.acum), guardados = JSON.parse(JSON.stringify([S1, S2, S3])), despues = guardados.map(s => P(D, s).tot.UOP.acum);
    ok('E h) guardar, cargar y comparar tres escenarios da los mismos números', antes.every((x, i) => x === despues[i]), antes.map(x => (x / 100).toFixed(2)).join(' · ')); }
  r = P(D, { modo: 'reclasificacion', base: 'C', cambios: { mT: { partes: [{ dest: 'costo_proveedores', pct: 100 }] } } });
  ok('E orig a) traspaso excluido → «Costo · proveedores»: la utilidad baja ese subtotal y el puente cuadra', r.tot0.UO.acum - r.tot.UO.acum === 50000 && r.puente.cuadra, 'baja ' + ((r.tot0.UO.acum - r.tot.UO.acum) / 100).toFixed(2));
  r = P(D, { modo: 'reclasificacion', base: 'C', cambios: { mP: { partes: [{ dest: 'fuera_prestamo', pct: 100 }] } } });
  ok('E orig b) partida por identificar → pago de préstamo: sale del resultado y la utilidad después de partidas sube', r.tot.UOP.acum - r.tot0.UOP.acum === 10000 && r.tot.UO.acum === r.tot0.UO.acum && r.puente.cuadra, 'sube ' + ((r.tot.UOP.acum - r.tot0.UOP.acum) / 100).toFixed(2));
  r = P(D, { modo: 'reclasificacion', base: 'C', reglas: [{ campo: 'contraparte', texto: 'PROVEEDOR X', dest: 'admin_otros' }] });
  ok('E orig c) regla por contraparte reclasifica todos sus movimientos (vista)', val(r, 'ga_admin_otros') === 5000 && r.aplicados.length === 2);
  // motor: la regla de Esteban también toma un movimiento nuevo que entra después
  { const i = base(); i.reglas = reglas.concat([{ id: 900, prioridad: 5, destino: 'reclasificacion', campo: 'descripcion', patron: 'PROVEEDOR X', subcategoria: 'fuera_traspaso', origen: 'reclasificación de Esteban' }]);
    i.banco.push(mov('General', '2026-02', '2026-02-20', 'SPEI PROVEEDOR X NUEVO', 777, 0));
    const it = c.calcular(i, { sin_archivos: true })._interno.m.items.find(x => /PROVEEDOR X/.test(x.concepto));
    ok('E orig c) … y un movimiento nuevo que entra después (motor)', it && it.destino === 'excl_traspaso' && it.reclas && it.reclas.fuente === 'regla', it && it.destino); }
  // validación del archivo (servidor)
  const I0 = base(), cp0 = () => JSON.parse(JSON.stringify(I0));
  const mm = c.calcular(cp0(), { sin_archivos: true })._interno.m, CATm = c.leerCatalogo([]);
  const idReal = mm.items.find(x => x.fuente === 'banco' && x.tipo_mov === 'cargo').mov;
  const armar = filas => { const cab = c.CSV_RECLAS_COLUMNAS.slice(0, -1); const h = c.huellaReclas([cab].concat(filas)); return [c.CSV_RECLAS_COLUMNAS].concat(filas.map(f => f.concat([h]))).map(f => f.map(x => /[",\n;]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x).join(',')).join('\n'); };
  let vv = c.validarReclasificaciones(armar([['b:no-existe', '1', '1', '100', '', 'costo_otros', '', '', 'movimiento', '', '', 'h']]), 'reclasificaciones_20260928_1000.csv', mm, CATm);
  ok('E orig d) CSV con un id inexistente → se rechaza completo', !vv.ok && /no existe/.test(vv.motivo) && vv.filas.length === 0, vv.motivo);
  vv = c.validarReclasificaciones('tipo,id_movimiento,destino,porcentaje_parte,ajuste_pct\najuste_movimiento,b:x,,,-25\n', 'escenario_20260928_1000.csv', mm, CATm);
  ok('E f) un escenario_*.csv se rechaza completo con su motivo', !vv.ok && vv.motivo === 'contiene ajustes de % de escenario; solo se aplican reclasificaciones', vv.motivo);
  const csvOk = armar([[idReal, '1', '2', '60', 'x', 'costo_otros', '', 'prueba', 'movimiento', '', '', 'h'], [idReal, '2', '2', '40', 'x', 'admin_otros', '', 'prueba', 'movimiento', '', '', 'h']]);
  let adulterado = csvOk.replace(',60,', ',61,');
  vv = c.validarReclasificaciones(adulterado, 'reclasificaciones_x.csv', mm, CATm);
  ok('E validación: un archivo modificado después de exportarlo se rechaza por huella', !vv.ok && /huella/.test(vv.motivo), vv.motivo);
  { const res = c.calcular(cp0(), { sin_archivos: true, reclas_csv: { nombre: 'reclasificaciones_20260928_1000.csv', contenido: csvOk }, generado_at: '2026-09-28T10:00:00Z' });
    const ps = res._interno.m.items.filter(x => x.mov === idReal);
    ok('E g) un reclasificaciones_*.csv con partición se aplica y el estado oficial lo refleja', res.reclas.ok && ps.length === 2 && ps[0].destino === 'costo_otros' && ps[1].destino === 'admin_otros' && ps[0].bruto + ps[1].bruto === 100000 && res.resumen.cuadra_al_centavo,
      'partes ' + ps.map(x => x.destino + ' ' + (x.bruto / 100).toFixed(2)).join(' + ')); }
  // e) dos reclasificaciones del mismo movimiento: vigente la última (la vista v_reclasificaciones marca la anterior como no vigente)
  { const i = cp0(); i.reclasificaciones = [{ tipo: 'movimiento', movimiento_id: idReal, parte: 1, porcentaje: 100, destino: 'costo_otros', vigente: false, archivo_origen: 'r1.csv' }, { tipo: 'movimiento', movimiento_id: idReal, parte: 1, porcentaje: 100, destino: 'fuera_traspaso', vigente: true, archivo_origen: 'r2.csv' }];
    const it = c.calcular(i, { sin_archivos: true })._interno.m.items.filter(x => x.mov === idReal);
    ok('E orig e) reclasificar dos veces: queda vigente la última', it.length === 1 && it[0].destino === 'excl_traspaso' && it[0].reclas.archivo === 'r2.csv', it[0] && it[0].destino); }
}
