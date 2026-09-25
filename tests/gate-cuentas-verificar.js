// ═══ Gate · los veredictos del Nivel 2 (cada cuenta contra Odoo) ══════════
//
// Este gate existe porque el Nivel 2 es el unico control que protege contra el
// error que NO se corrige: dinero al destinatario equivocado. Vive en n8n, o sea
// fuera del alcance de cualquier prueba del repo — y un control que no se puede
// probar se degrada sin que nadie lo note.
//
// Corre EL MISMO TEXTO que ejecuta n8n (docs/n8n-workflows/...code.js), envuelto
// como n8n lo envuelve, contra un Odoo simulado con las formas reales que
// devuelve search_read. Cero red, cero secretos, cero cuentas reales: todos los
// numeros son inventados.
//
//   node tests/gate-cuentas-verificar.js

'use strict';
const fs = require('fs');
const path = require('path');
const ARCHIVO = path.join(__dirname, '..', 'docs', 'n8n-workflows', 'carga-mo-cuentas-verificar.code.js');
const MARCA = '// ════════════════ CUERPO DEL NODO · TODO LO DE ABAJO ES DE n8n ════════════════';
const partes = fs.readFileSync(ARCHIVO, 'utf8').split(MARCA);
if (partes.length !== 2) { console.log('El marcador del cuerpo no aparece exactamente una vez en ' + ARCHIVO); process.exit(1); }
const body = partes[1].replace(/^\n/, '');
// Envuelto igual que n8n: el cuerpo tiene await y return en el nivel superior.
const correr = new Function('$', '$helpers', 'return (async function(){' + body + '})()');

// ── Odoo de mentira, con la MISMA forma que devuelve search_read ──────────
const PADRON=[
  {id:25, name:'Héctor Cruz Hernández',        x_studio_codigo_contpaqi:'002', work_contact_id:[201,'HCH'], active:true},
  {id:63, name:'Magaly Estefanía Pérez García',x_studio_codigo_contpaqi:'012', work_contact_id:[202,'MPG'], active:true},
  {id:133,name:'Brandon Alexander Barrón',     x_studio_codigo_contpaqi:'072', work_contact_id:[203,'BAB'], active:false},
  {id:112,name:'Felipe Pérez Guzmán',          x_studio_codigo_contpaqi:false, work_contact_id:[204,'FPG'], active:true},
  {id:98, name:'Ricardo Alán Hernández',       x_studio_codigo_contpaqi:false, work_contact_id:false,      active:true},
  {id:55, name:'Juan Manuel Sánchez Lugo',     x_studio_codigo_contpaqi:'010', work_contact_id:[205,'JSL'], active:true},
  {id:59, name:'Gerardo Isai Lozano',          x_studio_codigo_contpaqi:'016', work_contact_id:[206,'GIL'], active:true},
  {id:79, name:'José Luis Romero',             x_studio_codigo_contpaqi:'029', work_contact_id:[207,'JLR'], active:true},
  {id:900,name:'Clon con codigo repetido A',   x_studio_codigo_contpaqi:'050', work_contact_id:[208,'CLN'], active:true},
  {id:901,name:'Clon con codigo repetido B',   x_studio_codigo_contpaqi:'050', work_contact_id:[209,'CL2'], active:true}
];
const BANCOS=[
  {id:1, partner_id:[201,'HCH'], acc_number:'1111111111', allow_out_payment:true },
  {id:2, partner_id:[202,'MPG'], acc_number:'2222222222', allow_out_payment:true },
  {id:3, partner_id:[203,'BAB'], acc_number:'3333333333', allow_out_payment:true },
  {id:4, partner_id:[204,'FPG'], acc_number:'4444 4444 44', allow_out_payment:true },  // con espacios a proposito
  {id:6, partner_id:[206,'GIL'], acc_number:'6666666666', allow_out_payment:false},    // no autorizada
  {id:7, partner_id:[207,'JLR'], acc_number:'7777777777', allow_out_payment:true },
  {id:8, partner_id:[207,'JLR'], acc_number:'7777000077', allow_out_payment:true }     // dos cuentas
  // 205 (Juan Manuel) a proposito SIN cuenta
];
function httpRequestFake(op){
  const p=op.body.params;
  if(p.service==='common') return {body:{result:2}};
  const [,,,model,metodo,args,kw]=p.args;
  if(model==='hr.employee') return {body:{result:PADRON}};
  if(model==='res.partner.bank'){
    const dom=args[0]; const pids=dom[0][2];
    return {body:{result:BANCOS.filter(b=>pids.indexOf(b.partner_id[0])>=0)}};
  }
  return {body:{result:[]}};
}
function ctx(cuerpo, llave){
  const nodos={'Set - secreto':{okey:llave===undefined?'llave-de-mentira-larga':llave,
                                ourl:'https://x',odb:'db',ouser:'u@x'},
               'Webhook cuentas':{body:cuerpo}};
  return (n)=>({ first:()=>({json:nodos[n]}) });
}
let ok=0,mal=0;
function check(d,c,extra){ if(c){ok++;console.log('  ✓ '+d);} else {mal++;console.log('  ✗ '+d+(extra?' → '+extra:''));} }
function ver(h,n){ const x=h.filter(y=>y.n===n)[0]; return x?x.veredicto:'(ninguno)'; }

(async()=>{
const filas=[
  {n:1,  cuenta:'1111111111', cod:'002'},                 // coincide
  {n:2,  cuenta:'2222222299', cod:'012'},                 // NO coincide
  {n:3,  cuenta:'3333333333', cod:'072'},                 // coincide, dado de baja
  {n:4,  cuenta:'4444444444', empleado_id:112},           // coincide pese a los espacios en Odoo
  {n:5,  cuenta:'9999999999', empleado_id:98},            // sin contacto
  {n:6,  cuenta:'5555555555', cod:'010'},                 // sin cuenta en Odoo
  {n:7,  cuenta:'6666666666', cod:'016'},                 // coincide pero no autorizada
  {n:8,  cuenta:'7777000077', cod:'029'},                 // DOS cuentas, apareo con la segunda
  {n:9,  cuenta:'8888888888', cod:'999', nombre:'AJENO'}, // persona no encontrada
  {n:10, cuenta:'1111111111', cod:'2'}                    // el codigo sin ceros aparea igual
];
const r=(await correr(ctx({semana:'S38/2026',filas}), {httpRequest:httpRequestFake}))[0].json;
console.log('\n── respuesta completa');
console.log(JSON.stringify(r,null,1));
console.log('\n── veredictos');
check('la cuenta buena COINCIDE (no genera hallazgo)', ver(r.hallazgos,1)==='(ninguno)', ver(r.hallazgos,1));
check('una cuenta distinta sale NO_COINCIDE',          ver(r.hallazgos,2)==='NO_COINCIDE', ver(r.hallazgos,2));
check('un dado de baja SI se puede pagar (no estorba)',ver(r.hallazgos,3)==='(ninguno)', ver(r.hallazgos,3));
check('los espacios en el numero de Odoo no importan', ver(r.hallazgos,4)==='(ninguno)', ver(r.hallazgos,4));
check('sin contacto se dice',                          ver(r.hallazgos,5)==='SIN_CONTACTO', ver(r.hallazgos,5));
check('sin cuenta en Odoo se dice',                    ver(r.hallazgos,6)==='SIN_CUENTA_EN_ODOO', ver(r.hallazgos,6));
check('coincide pero no autorizada a recibir',         ver(r.hallazgos,7)==='COINCIDE_PERO_NO_AUTORIZADA', ver(r.hallazgos,7));
check('con dos cuentas, aparea con la que si es',      ver(r.hallazgos,8)==='(ninguno)', ver(r.hallazgos,8));
check('persona no encontrada se dice',                 ver(r.hallazgos,9)==='PERSONA_NO_ENCONTRADA', ver(r.hallazgos,9));
check('el codigo sin ceros aparea igual',              ver(r.hallazgos,10)==='(ninguno)', ver(r.hallazgos,10));
check('cuenta los que coinciden', r.coinciden===6, 'coinciden='+r.coinciden);
console.log('\n── lo que NO puede salir de aqui');
const txt=JSON.stringify(r);
check('ningun numero de cuenta completo en la respuesta', !/\d{10}/.test(txt), (txt.match(/\d{10}/)||[])[0]);
check('ninguna llave, ni la de mentira',                 txt.indexOf('llave')<0);
check('un codigo repetido en Odoo se marca, no se adivina',
      (await correr(ctx({filas:[{n:1,cuenta:'7777777777',cod:'050'}]}),{httpRequest:httpRequestFake}))[0].json.hallazgos[0].veredicto==='CODIGO_DUPLICADO');
console.log('\n── los caminos de falla');
const sinLlave=(await correr(ctx({filas},''),{httpRequest:httpRequestFake}))[0].json;
check('sin llave no intenta nada', sinLlave.error==='SIN_LLAVE_ODOO', JSON.stringify(sinLlave));
const vacio=(await correr(ctx({filas:[]}),{httpRequest:httpRequestFake}))[0].json;
check('sin filas lo dice', vacio.error==='SIN_FILAS');
const muchas=(await correr(ctx({filas:new Array(301).fill({n:1,cuenta:'1',cod:'002'})}),{httpRequest:httpRequestFake}))[0].json;
check('un cuerpo desmedido se corta', muchas.error==='DEMASIADAS_FILAS');
const rpcMal=(await correr(ctx({filas}),{httpRequest:()=>({body:{error:{message:'boom 12345'}}})}))[0].json;
check('si Odoo falla, lo dice y no inventa', rpcMal.error==='LOGIN_FALLO', JSON.stringify(rpcMal));
const revienta=(await correr(ctx({filas}),{httpRequest:()=>{throw new Error('cuenta 1234567890 expuesta');}}))[0].json;
check('si el nodo revienta, el try/catch lo atrapa', revienta.error==='FALLO_VERIFICAR', JSON.stringify(revienta));
check('y el detalle sale con los digitos tapados', /#{10}/.test(revienta.detalle||''), revienta.detalle);
console.log('\n'+(mal?'FALLARON '+mal:'TODO OK')+' — '+ok+' ok · '+mal+' mal');
process.exit(mal?1:0);
})();
