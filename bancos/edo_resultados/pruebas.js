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
// Vista D a–c (núcleo del escenario; d se prueba en el navegador)
{ const b={'2026-01':100000,acum:100000}, mv=[{id:'a',mes:'2026-01',bruto:11600},{id:'b',mes:'2026-01',bruto:23200},{id:'e',mes:'2026-01',bruto:34800}];
  let r=c.escenarioCore(b,mv,['a','b','e'],12); ok('Vista D a) 116+232+348 al 12 %', Math.round(r.acum.subtotal)===60000&&Math.round(r.acum.costo)===7200&&Math.round(r.acum.neto)===52800&&Math.round(r.acum.hipotetica)===152800);
  r=c.escenarioCore(b,mv,['a','b','e'],0); ok('Vista D b) al 0 % sube la suma de subtotales', Math.round(r.acum.hipotetica-r.acum.base)===60000);
  r=c.escenarioCore(b,mv,[],12); ok('Vista D c) sin selección = base', r.acum.hipotetica===r.acum.base); }
