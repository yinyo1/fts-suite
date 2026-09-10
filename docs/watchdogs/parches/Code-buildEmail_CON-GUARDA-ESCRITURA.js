// -- Code - buildEmail - S1 (2026-09-09, issue #220) --------------------------
// S1 NO MUEVE NINGUN UMBRAL. Si un renglon desaparece es por (a) deduplicacion,
// (b) el semaforo B retirado del reporte, o (c) destinatarios. Nunca por un calculo.
//
// Lo que cambia respecto de la version previa:
//   1. SEMAFORO B RETIRADO DEL REPORTE. Llevaba 11 corridas en 0% verde contra una meta
//      impresa de >=90%, y su verde es inalcanzable por construccion: rojo_dias=2 =>
//      amarillo=1 => verde exige dias_sin_seguimiento=0, o sea una nota escrita hoy antes
//      de las 08:00, que es cuando sale el correo. Ademas media el dia de la semana: los
//      19 renglones de Operaciones del 8-sep traian "2d" identico. Se sigue CALCULANDO en
//      Code - MAIN (viaja en color_b) pero no se reporta.
//   2. SOLO EL DELTA. Firma por proyecto en staticData; un renglon sin cambio no se
//      imprime, se cuenta al pie. Aparece la seccion SE RESOLVIO, que antes no existia.
//   3. BANDERAS UNA VEZ POR EVENTO. La consulta de tracking mira 30 dias, asi que un
//      cambio de stage se reportaba ~21 veces (133 apariciones de "Stage regresado Hold ->
//      En proceso"; 18 de un solo cambio de fecha). Ahora cada evento se reporta el dia
//      que se ve y se recuerda en staticData.
//   4. GUARDA DE VACIO visible: si un search vino vacio, el correo lo dice.
//   5. Las banderas se reparten por NATURALEZA: autoria (fecha_fin / stage_atras) va a
//      CAMBIOS FUERA DE COMERCIAL -no "posible manipulacion", que acusa a quien hace el
//      trabajo-; calidad de dato (nota_vacia / hold_sin_fecha_vigente) va a DATOS QUE NO
//      CUADRAN, que es lo que realmente son.
//   6. DIGEST DE LUNES (adicion a S1). El delta esconde lo que esta mal y no cambia:
//      en la prueba quedaron 14 proyectos "sin cambio" contados solo al pie, y ahi iba
//      MAGNEKON con $1.28M vencidos, el renglon que motivo la auditoria. Los lunes sale
//      ademas el ESTADO COMPLETO de todos los vigilados. Mismo workflow, misma metrica,
//      mismos umbrales: solo cambia QUE se imprime segun el dia.
const _cf = $('HTTP - load config').first().json;
const cfg = (_cf && _cf.config) ? _cf : JSON.parse(_cf.data || _cf.body || (typeof _cf==='string'?_cf:JSON.stringify(_cf)));
const C = cfg.config;
// GUARDA DE FORMA (se conserva de la version previa). La config se lee EN VIVO del repo;
// si ese fetch trae algo a medio propagar, un 404 o rate-limit, C queda undefined. Antes
// eso reventaba mas abajo y el error viajaba como DATO hasta Graph, que devolvia 400 y
// tambien lo trataba como dato: la ejecucion salia VERDE sin enviar nada (lunes 17-ago).
const _falta = [];
if (!C || typeof C !== "object") _falta.push("config");
else {
  if (typeof C.modo_prueba === "undefined") _falta.push("config.modo_prueba");
  if (!C.alert_recipient_default) _falta.push("config.alert_recipient_default");
  if (!C.recipients_por_grupo || typeof C.recipients_por_grupo !== "object") _falta.push("config.recipients_por_grupo");
}
if (_falta.length) { throw new Error("Config del semaforo incompleta o no cargada - faltan: " + _falta.join(", ") + ". El correo NO se envio. Revisa HTTP - load config (lee sla_stages.json en vivo del repo)."); }

const todo = $('Code - MAIN').all().map(i=>i.json);
const soloDiag = todo.length===1 && todo[0]._solo_diag;
const rows = soloDiag ? [] : todo;
const diag = (todo[0] && todo[0]._diag) ? todo[0]._diag : [];
// --- GUARDA DE ESCRITURA (S2, 2026-09-10) -----------------------------------
// La guarda de vacio de S1 cubre los nodos de LECTURA. Estos son los de
// ESCRITURA, y traen el MISMO onError:continueRegularOutput: un fallo viaja
// como DATO y el nodo reporta success. Medido: 'Odoo - CREATE log note'
// llevaba desde el go-live del 19-jun devolviendo MissingError en verde
// (author_id iba como string "3"), y el correo nunca lo dijo. Este bloque
// existe para que una escritura fallida SALGA en el correo, y para que
// obligue a mandarlo incluso en un dia sin cambios: una escritura muerta en
// un dia silencioso es justo donde el fallo se queda a vivir.
// Se apoya en un hecho MEDIDO (ejecucion 93268): las tres ramas que salen de
// 'Code - col-main' corren en SERIE -- buildLogNotes, CREATE log note,
// buildSnapshot, PUT snapshot y al final buildEmail. Por eso aqui ya se puede
// leer el resultado de las escrituras sin re-cablear nada.
const wdiag = [];
function _items(nodo){ try { return { ok:true, all:$(nodo).all() }; } catch(e){ return { ok:false, err:String(e.message).slice(0,120) }; } }
(function guardaLogNote(){
  const NODO='Odoo - CREATE log note';
  const prev=_items('Code - buildLogNotes');
  const esperadas = prev.ok ? prev.all.filter(i=>i.json && !i.json._vacio).length : null;
  const r=_items(NODO);
  if(!r.ok){
    // si no habia nada que escribir, que el nodo no corra es lo correcto, no un fallo
    if(esperadas===0) return;
    wdiag.push({nodo:NODO, problema:'no corrio o no se pudo leer su salida', detalle:r.err, critico:true});
    return;
  }
  const malas=[];
  r.all.forEach(function(it,i){
    const j=(it&&it.json)||{};
    if(j.error) malas.push({i:i, motivo:String(j.error).slice(0,160)});
    else if(j.id===undefined || j.id===null || j.id===false) malas.push({i:i, motivo:'Odoo no devolvio id'});
  });
  if(malas.length) wdiag.push({nodo:NODO, problema:malas.length+' de '+r.all.length+' notas al chatter NO se escribieron', casos:malas.slice(0,5), critico:true});
})();
(function guardaSnapshot(){
  const NODO='HTTP - PUT snapshot (GitHub)';
  const r=_items(NODO);
  if(!r.ok) return;   // rama opcional: si no corrio, no se inventa un fallo
  const malas=[];
  r.all.forEach(function(it,i){
    const j=(it&&it.json)||{};
    if(j.content && j.content.sha) return;                       // creado
    const m=String(j.message||'');
    // 422 "already exists": es el caso NORMAL al re-correr el mismo dia (el PUT
    // sin sha solo puede CREAR). No es un fallo y no debe gritar.
    if(/already exists|sha/i.test(m)) return;
    malas.push({i:i, motivo:m?m.slice(0,160):'sin commit de vuelta'});
  });
  if(malas.length) wdiag.push({nodo:NODO, problema:'el snapshot del dia NO se guardo', casos:malas.slice(0,3), critico:false});
})();
const hoy = $('Set - hoy').first().json.hoy;
const today = new Date(hoy);
const fechaStr = hoy.slice(0,10);
const MES_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fb = fechaStr.slice(8,10)+'/'+MES_EN[parseInt(fechaStr.slice(5,7),10)-1]+'/'+fechaStr.slice(0,4);

const esc = v => Array.from(String(v==null?'':v)).map(function(ch){ var cp=ch.codePointAt(0); if(ch==='&')return '&amp;'; if(ch==='<')return '&lt;'; if(ch==='>')return '&gt;'; if(ch==='"')return '&quot;'; return cp>127?('&#'+cp+';'):ch; }).join('');
const escN = (v,n) => { const s=String(v==null?'':v); return esc(s.length>(n||60) ? s.slice(0,(n||60))+'...' : s); };
const lnk = r => '<a href="'+r.link_odoo+'">abrir</a>';
const dE = r => (r.dias_en_stage==null?'?':r.dias_en_stage);

// ---- estado previo (staticData) ---------------------------------------------
// CAVEAT heredado: staticData solo PERSISTE en runs de produccion (Schedule activo), no en
// Manual Trigger. En una corrida manual se LEE el estado de la ultima corrida de produccion
// y no se escribe, asi que probar no contamina la linea base.
const sd = $getWorkflowStaticData('global');
const prevA  = sd.s1_prevA  || {};   // { id: firma }
const prevEv = sd.s1_prevEv || {};   // { evKey: 'YYYY-MM-DD' }
const nextA  = {};
const nextEv = {};

const TR = {'0':0,'1-5':1,'6-15':2,'16-30':3,'>30':4,'?':0};
const ORD = {verde:0, amarillo:1, rojo:2};
const firmaDe = r => r.color_a_rep+'|'+r.tramo_a+'|'+(r.sin_avance?'sa':'-');
const rankDe  = r => ORD[r.color_a_rep]*10 + (TR[r.tramo_a]||0);
const rankFirma = f => { const p=String(f).split('|'); return (ORD[p[0]]||0)*10 + (TR[p[1]]||0); };

// banderas: separa EVENTOS nuevos de los ya reportados
for(const r of rows){
  r._flagsNuevas = [];
  for(const f of (r.banderas||[])){
    const k = r.id+'|'+(f.ev||f.tipo);
    nextEv[k] = fechaStr;
    if(prevEv[k] === undefined) r._flagsNuevas.push(f);
  }
}
// poda: no dejar crecer staticData sin limite (los eventos viven 30 dias en la consulta)
const corteEv = new Date(today.getTime() - 60*86400000).toISOString().slice(0,10);
for(const k of Object.keys(prevEv)){ if(prevEv[k] >= corteEv && nextEv[k]===undefined) nextEv[k]=prevEv[k]; }

const enLista = r => r.color_a_rep!=='verde' || r.sin_avance || (r.banderas||[]).length>0;
for(const r of rows){ if(enLista(r)) nextA[r.id] = firmaDe(r); }

const diagFirma = diag.map(d=>d.nodo).sort().join(',');
const diagNuevo = diagFirma !== (sd.s1_diagFirma || '');
// clasificacion
const NUEVO=[], EMPEORO=[], IGUAL=[], MEJORO=[];
for(const r of rows){
  if(!enLista(r)) continue;
  const f = firmaDe(r), p = prevA[r.id];
  if(p===undefined) NUEVO.push(r);
  else if(rankDe(r) > rankFirma(p)) EMPEORO.push(r);
  else if(rankDe(r) < rankFirma(p)) MEJORO.push(r);
  else IGUAL.push(r);
}
const vivos = new Set(rows.filter(enLista).map(r=>String(r.id)));
const nombrePrev = sd.s1_nombres || {}, grupoPrev = sd.s1_grupos || {};
const RESUELTOS = Object.keys(prevA).filter(id=>!vivos.has(String(id)))
  .map(id=>({ id:Number(id), name:nombrePrev[id] || ('proyecto '+id), grupo:grupoPrev[id] || null }));
const nextNombres = {}, nextGrupos = {};
for(const r of rows){ if(enLista(r)){ nextNombres[r.id]=r.name; nextGrupos[r.id]=r.grupo; } }

// ---- KPI: SOLO semaforo A. B se retira del reporte --------------------------
const cntA = a => ({ total:a.length, V:a.filter(r=>r.color_a_rep==='verde').length, A:a.filter(r=>r.color_a_rep==='amarillo').length, R:a.filter(r=>r.color_a_rep==='rojo').length });
const aAll = cntA(rows);
const bAll = { V:rows.filter(r=>r.color_b==='verde').length, A:rows.filter(r=>r.color_b==='amarillo').length, R:rows.filter(r=>r.color_b==='rojo').length };
sd.history = (sd.history||[]).filter(h=>h.fecha!==fechaStr);
sd.history.push({ fecha:fechaStr, total:rows.length, aV:aAll.V,aA:aAll.A,aR:aAll.R, bV:bAll.V,bA:bAll.A,bR:bAll.R });
sd.history = sd.history.slice(-45);
function mondayOf(d){ const x=new Date(d); const g=(x.getDay()+6)%7; x.setDate(x.getDate()-g); x.setHours(0,0,0,0); return x; }
const semana = sd.history.filter(h=> new Date(h.fecha) >= mondayOf(today));
const aPctNow = rows.length?Math.round(aAll.V/rows.length*100):0;
function pctV(list,k){ if(!list.length) return 0; return Math.round(list.reduce((a,h)=>a+(h.total?(h[k]/h.total):0),0)/list.length*100); }
const kpiSem = (semana.length<4) ? {modo:'simple', aPct:aPctNow, dias:semana.length} : {modo:'prom', aPct:pctV(semana,'aV'), dias:semana.length};
// Dia(s) en que sale el digest de estado completo. Sale de la config VIVA para poder
// ejercitarlo un dia cualquiera sin tocar codigo (asi se probo antes de publicar), y
// para que Esteban pueda pedirlo otro dia editando el JSON. Si la config no trae la
// llave -que es el caso de main hoy- el default es LUNES: el lado tolerante primero
// (regla anti-trabon), la config vieja sigue funcionando sin cambios.
// getDay(): 0=domingo, 1=lunes ... 6=sabado.
const DIGEST_DIAS = Array.isArray(C.digest_dias) ? C.digest_dias : [1];
const esLunes = DIGEST_DIAS.includes(today.getDay());

// ---- render -----------------------------------------------------------------
const ACC = { rojo:'&#8627; Avanza de stage o documenta por que sigue aqui (Log note)',
              amarillo:'&#8627; Se acerca al limite: mueve el stage o documenta' };
function fila(r, prefijo){
  let h='<li style="margin-bottom:7px">'+prefijo+' <b>'+escN(r.name)+'</b> ('+escN(r.cliente,40)+') &middot; '+esc(r.stage);
  h+='<br>'+(r.color_a_rep==='rojo'?'&#128308;':'&#128993;')+' en stage <b>'+dE(r)+'d</b> (tramo '+esc(r.tramo_a)+')';
  if(r.project_date) h+=' &middot; fecha compromiso '+esc(String(r.project_date).slice(0,10));
  h+=' &middot; '+lnk(r);
  if((r._flagsNuevas||[]).length){ h+='<br>'; for(const f of r._flagsNuevas) h+='<span style="color:#8e24aa">&#128681; '+esc(f.detalle)+'</span><br>'; }
  else h+='<br>';
  h+='<span style="color:'+(r.color_a_rep==='rojo'?'#c62828':'#b35900')+'">'+ACC[r.color_a_rep==='rojo'?'rojo':'amarillo']+'</span></li>';
  return h;
}
function sec(titulo, color, arr, prefijo){
  let h='<h3 style="color:'+color+';margin:14px 0 4px">'+titulo+' ['+arr.length+']</h3>';
  if(!arr.length) return h+'<p style="color:#888;margin:2px 0">- ninguno -</p>';
  arr=arr.slice().sort((x,y)=>(y.dias_en_stage||0)-(x.dias_en_stage||0));
  h+='<ul style="font-size:13px;margin:4px 0;padding-left:18px">';
  for(const r of arr) h+=fila(r,prefijo);
  return h+'</ul>';
}
function secSinAvance(arr){
  let h='<h3 style="color:#8e24aa;margin:14px 0 4px">&#128260; SEGUIMIENTO SIN AVANCE (la nota se repite) ['+arr.length+']</h3>';
  if(!arr.length) return h+'<p style="color:#888;margin:2px 0">- ninguno -</p>';
  h+='<ul style="font-size:13px;margin:4px 0;padding-left:18px">';
  for(const r of arr.slice().sort((x,y)=>(y.racha_nota||0)-(x.racha_nota||0)))
    h+='<li style="margin-bottom:6px"><b>'+escN(r.name)+'</b> ('+escN(r.cliente,40)+') &middot; '+esc(r.stage)+
       '<br>&#128260; <b>'+(r.racha_nota||0)+' notas seguidas practicamente iguales</b> &middot; en stage <b>'+dE(r)+'d</b> &middot; '+lnk(r)+
       '<br><span style="color:#8e24aa">&#8627; La nota se esta repitiendo: documenta que CAMBIO o mueve el stage</span></li>';
  return h+'</ul>';
}
const ES_AUTORIA = t => t==='fecha_fin' || t==='stage_atras';
function secDatos(subset, flagsDato){
  const items=[];
  for(const x of (flagsDato||[])) items.push('<b>'+escN(x.r.name,50)+'</b>: '+esc(x.f.detalle));
  for(const d of diag) items.push('<b>'+esc(d.nodo)+'</b>: '+esc(d.problema)+(d.critico?' <b style="color:#c62828">(CRITICO)</b>':''));
  // escrituras fallidas: mismo concepto (problemas del reporte, no de los proyectos)
  for(const d of wdiag) items.push('<b>ESCRITURA FALLIDA - '+esc(d.nodo)+'</b>: '+esc(d.problema)+(d.casos&&d.casos.length?(' &mdash; '+esc(d.casos.map(x=>x.motivo).join(' | '))):'')+(d.critico?' <b style="color:#c62828">(CRITICO)</b>':''));
  const nCd = subset.filter(r=>r.fuente_a==='create_date').length;
  if(nCd) items.push('<b>'+nCd+' de '+subset.length+' proyectos</b> miden "dias en stage" desde <code>create_date</code>, no desde la entrada al stage: no hay ningun <code>mail.message</code> con <code>subtype_id=94</code>. <b>El numero de arriba es la EDAD del proyecto.</b> Ver issue #220 error #1 - se corrige en S6.');
  let h='<h3 style="color:#00695c;margin:14px 0 4px">&#128295; DATOS QUE NO CUADRAN / NO SE PUDO MEDIR ['+items.length+']</h3>';
  if(!items.length) return h+'<p style="color:#888;margin:2px 0">- nada -</p>';
  h+='<ul style="font-size:13px;margin:4px 0;padding-left:18px">';
  for(const t of items) h+='<li style="margin-bottom:4px">'+t+'</li>';
  return h+'</ul>';
}
function secResueltos(arr){
  let h='<h3 style="color:#2e7d32;margin:14px 0 4px">&#9989; SE RESOLVIO desde el correo anterior ['+arr.length+']</h3>';
  if(!arr.length) return h+'<p style="color:#888;margin:2px 0">- ninguno -</p>';
  h+='<ul style="font-size:13px;margin:4px 0;padding-left:18px">';
  for(const r of arr) h+='<li>&#9989; '+escN(r.name)+' &middot; salio de la lista</li>';
  return h+'</ul>';
}
// ---- DIGEST DE LUNES --------------------------------------------------------
// Reportar solo el delta tiene un costo: lo que esta mal pero NO cambia desaparece del
// correo. En la corrida de prueba quedaron 14 proyectos "sin cambio" contados solo al
// pie, y ahi iba MAGNEKON con $1.28M vencidos - el renglon que motivo la auditoria #220.
// Con delta puro se vuelve a sepultar, ahora por silencio en vez de por ruido. Por eso
// los LUNES sale ademas el estado COMPLETO de todos los proyectos vigilados. No cambia
// ningun calculo ni ningun umbral: es la misma metrica, solo cambia QUE se imprime segun
// el dia de la semana.
function secDigest(subset){
  let h='<h3 style="color:#0078D4;margin:18px 0 4px">&#128203; ESTADO COMPLETO DE LA SEMANA ['+subset.length+']</h3>';
  h+='<p style="margin:2px 0;font-size:12px;color:#666">Todos los proyectos vigilados, hayan cambiado o no. De martes a viernes el correo trae solo lo que cambio.</p>';
  if(!subset.length) return h+'<p style="color:#888;margin:2px 0">- ninguno -</p>';
  const GR=[['rojo','&#128308;','#c62828','Rojo'],['amarillo','&#128993;','#b35900','Amarillo'],['verde','&#128994;','#2e7d32','Verde']];
  for(const g of GR){
    const arr=subset.filter(r=>r.color_a_rep===g[0]).slice().sort((x,y)=>(y.dias_en_stage||0)-(x.dias_en_stage||0));
    h+='<p style="margin:10px 0 2px;color:'+g[2]+'"><b>'+g[1]+' '+g[3]+' ['+arr.length+']</b></p>';
    if(!arr.length){ h+='<p style="color:#888;margin:2px 0;font-size:13px">- ninguno -</p>'; continue; }
    h+='<ul style="font-size:13px;margin:2px 0;padding-left:18px">';
    for(const r of arr){
      h+='<li style="margin-bottom:3px"><b>'+escN(r.name,45)+'</b> ('+escN(r.cliente,28)+') &middot; '+esc(r.stage)+
         ' &middot; <b>'+dE(r)+'d</b>'+
         (r.project_date?(' &middot; compromiso '+esc(String(r.project_date).slice(0,10))):'')+
         (r.sin_avance?' &middot; <span style="color:#8e24aa">&#128260; nota repetida</span>':'')+
         ((r.banderas||[]).length?(' &middot; <span style="color:#8e24aa">&#128681;'+r.banderas.length+'</span>'):'')+
         ' &middot; '+lnk(r)+'</li>';
    }
    h+='</ul>';
  }
  return h;
}
function buildMsg(subset, grupoLabel, to){
  const nu=NUEVO.filter(r=>r.grupo===grupoLabel), em=EMPEORO.filter(r=>r.grupo===grupoLabel);
  const me=MEJORO.filter(r=>r.grupo===grupoLabel), ig=IGUAL.filter(r=>r.grupo===grupoLabel);
  const sa=nu.concat(em).filter(r=>r.sin_avance);
  // separa por NATURALEZA de la bandera, no por novedad:
  //   autoria (fecha_fin / stage_atras) -> CAMBIOS FUERA DE COMERCIAL
  //   calidad de dato (nota_vacia / hold_sin_fecha_vigente) -> DATOS QUE NO CUADRAN
  const flg=[], flgDato=[];
  for(const r of subset) for(const f of (r._flagsNuevas||[])){
    if(ES_AUTORIA(f.tipo)) flg.push({r:r,f:f}); else flgDato.push({r:r,f:f});
  }
  const res=RESUELTOS.filter(x=>x.grupo===grupoLabel || x.grupo===null);
  const aC=cntA(subset);
  // wdiag entra en `hay` a proposito: si una ESCRITURA fallo, el correo sale aunque
  // no haya ningun cambio en los proyectos. Sin esto, un dia quieto se traga el fallo.
  const hay = nu.length||em.length||me.length||sa.length||flg.length||flgDato.length||res.length||diagNuevo||wdiag.length;
  // GUARDA DE VACIO. Sin nada que decir no se manda correo... salvo el dia del DIGEST,
  // que SIEMPRE sale con el estado completo. Asi el silencio nunca es ambiguo (un
  // watchdog que muere en silencio es el Hallazgo #14) sin volver al correo diario que
  // nadie lee. La alerta de latido perdido propiamente dicha es S7.
  if(!hay && !esLunes) return null;
  const soloLatido = !hay;
  let html='<meta charset="utf-8"><div style="font-family:Arial,sans-serif;color:#222;font-size:14px">';
  html+='<h2 style="color:#0078D4;margin:0">Semaforo '+esc(grupoLabel)+' - '+fb+'</h2>';
  html+='<div style="background:#f4f6f8;border-radius:8px;padding:8px 12px;margin:8px 0">';
  html+='<p style="margin:0 0 4px"><b>'+subset.length+' proyectos vigilados</b> &middot; '+
        '&#128309; ESTANCAMIENTO EN STAGE: &#128994; '+aC.V+' verde &middot; &#128993; '+aC.A+' amarillo &middot; &#128308; '+aC.R+' rojo</p>';
  html+= esLunes
    ? '<p style="margin:0;font-size:12px;color:#666"><b>Estado semanal:</b> ademas del delta va el <b>estado completo</b> de los '+subset.length+' proyectos vigilados, mas abajo.</p></div>'
    : '<p style="margin:0;font-size:12px;color:#666">Este correo reporta <b>lo que cambio</b> desde el correo anterior. Los '+ig.length+' renglones sin cambio no se imprimen: se cuentan al pie. El <b>lunes</b> sale el estado completo.</p></div>';
  if(soloLatido){
    html+='<p style="margin:10px 0"><b>Sin cambios</b> desde el correo anterior: ningun proyecto entro, empeoro ni se resolvio, y no hay banderas nuevas.</p>';
    html+=secDigest(subset);
    html+=secDatos(subset, []);
    html+='<hr style="margin:16px 0 8px"><p style="font-size:12px;color:#666"><b>'+ig.length+' proyectos en condicion estable.</b><br>';
    html+='&#128202; <b>KPI semanal</b> ('+(kpiSem.modo==='simple'?('arranque, dia '+kpiSem.dias):('promedio '+kpiSem.dias+' dias'))+'): estancamiento <b>'+kpiSem.aPct+'%</b> verde (meta &ge;90%)<br>';
    html+='Latido: corrida '+esc(fechaStr)+' 08:00 CST.</p></div>';
    const toL = Array.isArray(to) ? to : String(to).split(',').map(x=>x.trim()).filter(Boolean);
    return { message:{ subject:'[Semaforo '+grupoLabel+'] '+fb+' - estado semanal (sin cambios)', body:{contentType:'HTML',content:html}, toRecipients: toL.map(a=>({emailAddress:{address:a}})) }, saveToSentItems:true };
  }
  html+=sec('&#127381; NUEVO HOY','#c62828',nu,'&#127381;');
  html+=sec('&#128200; EMPEORO (cruzo de tramo)','#e65100',em,'&#128200;');
  html+=secResueltos(res);
  if(me.length) html+=sec('&#128201; MEJORO (sigue en la lista)','#2e7d32',me,'&#128201;');
  html+=secSinAvance(sa);
  html+='<h3 style="margin:14px 0 4px">&#128681; CAMBIOS FUERA DE COMERCIAL ['+flg.length+']</h3>';
  if(!flg.length) html+='<p style="color:#888;margin:2px 0">- ninguno nuevo -</p>';
  else { html+='<p style="margin:2px 0;font-size:12px;color:#666">Cada evento se reporta <b>una sola vez</b>, el dia que se detecta. No es una acusacion de manipulacion: es un cambio de fecha o de stage hecho por alguien fuera de Comercial.</p><ul style="font-size:13px;margin:4px 0;padding-left:18px">';
    for(const x of flg) html+='<li>&#128681; <b>'+escN(x.r.name,50)+'</b>: '+esc(x.f.detalle)+'</li>';
    html+='</ul>'; }
  html+=secDatos(subset, flgDato);
  if(esLunes) html+=secDigest(subset);
  html+='<hr style="margin:16px 0 8px"><p style="font-size:12px;color:#666">';
  html+='<b>'+ig.length+' proyectos en condicion estable</b> (sin cambio de tramo ni banderas nuevas) - no se imprimen para que lo que cambio se vea.<br>';
  if(esLunes) html+='&#128202; <b>KPI semanal</b> ('+(kpiSem.modo==='simple'?('arranque, dia '+kpiSem.dias):('promedio '+kpiSem.dias+' dias'))+'): estancamiento <b>'+kpiSem.aPct+'%</b> verde (meta &ge;90%)<br>';
  html+='El semaforo de <b>falta de seguimiento</b> se retiro del reporte en S1 (issue #220): llevaba 11 corridas en 0% verde y su verde era inalcanzable por construccion. Se sigue calculando.<br>';
  html+='Latido: corrida '+esc(fechaStr)+' 08:00 CST.</p></div>';
  const E=String.fromCodePoint;
  const partes=[];
  if(nu.length) partes.push(nu.length+' nuevo'+(nu.length>1?'s':''));
  if(em.length) partes.push(em.length+' empeoro');
  if(res.length) partes.push(res.length+' resuelto'+(res.length>1?'s':''));
  if(flg.length) partes.push(flg.length+' cambio'+(flg.length>1?'s':'')+' fuera de Comercial');
  if(flgDato.length) partes.push(flgDato.length+' dato'+(flgDato.length>1?'s':'')+' por revisar');
  if(esLunes) partes.push('estado semanal');
  if(diag.length) partes.push('REVISAR MEDICION');
  if(wdiag.length) partes.push('ESCRITURA FALLIDA');
  const subj='[Semaforo '+grupoLabel+'] '+fb+' - '+(partes.length?partes.join(' '+E(183)+' '):'sin cambios');
  const toList = Array.isArray(to) ? to : String(to).split(',').map(s=>s.trim()).filter(Boolean);
  return { message:{ subject:subj, body:{ contentType:'HTML', content:html }, toRecipients: toList.map(a=>({ emailAddress:{ address:a } })) }, saveToSentItems:true };
}
// persistir estado DESPUES de construir (si truena arriba, no se pierde la linea base)
sd.s1_prevA = nextA; sd.s1_prevEv = nextEv; sd.s1_nombres = nextNombres; sd.s1_grupos = nextGrupos;
sd.s1_diagFirma = diagFirma;
const out=[];
if (C.modo_prueba) { const m=buildMsg(rows, "Operaciones + Admin", C.alert_recipient_default); if(m) out.push({json:m}); }
else { for (const g of ["Operaciones","Admin"]) { const sub = rows.filter(r => r.grupo === g);
  const to = (C.recipients_por_grupo || {})[g] || C.alert_recipient_default;
  const m = buildMsg(sub, g, to); if(m) out.push({json:m}); } }
return out;

