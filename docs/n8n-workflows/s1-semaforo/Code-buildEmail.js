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

// --- MODO EFECTIVO (S3, 2026-09-10) ------------------------------------------
// La corrida MANUAL es PISO, no opcion. Se deriva de $execution.mode y va en OR con
// la config: modo_prueba:true sigue forzando prueba en el cron, y una corrida a mano
// NO puede mandarle a los dos grupos aunque la config sea la de produccion. Mandar a
// la lista completa exige venir del cron.
// Origen: el 9-sep se dispararon a mano dos correos reales a 7 personas, 15:49 CST.
// Con esto ya no hace falta repuntar HTTP - load config al archivo de prueba para
// probar -- que era la maniobra riesgosa, porque su paso de limpieza es silencioso.
// FALLA HACIA EL LADO SEGURO a proposito: si $execution.mode no existiera,
// (undefined !== 'production') da true -> modo prueba -> UN correo a Esteban, en vez
// de silencio o de un envio masivo. Y el pie del correo IMPRIME el modo, asi que un
// error se anuncia solo en la primera corrida en vez de esconderse.
// DOS senales independientes, y basta UNA para considerarlo corrida de cron:
//   (a) $execution.mode === 'production'
//   (b) el Schedule realmente se ejecuto en esta corrida
// Si (a) no existiera en el sandbox de Code, (b) sola sostiene el envio normal, y al
// reves. Cualquier throw cae al catch y deja ES_MANUAL=true, que es el lado seguro.
let ES_MANUAL = true;
try {
  let porCron = false;
  try { porCron = $('Schedule (Lun-Vie 8am CST)').isExecuted === true; } catch(e) {}
  const modo = ($execution && $execution.mode);
  ES_MANUAL = !(porCron || modo === 'production');
} catch(e) { ES_MANUAL = true; }
// SEPARADAS A PROPOSITO, porque son dos cosas distintas:
//   MODO_PRUEBA  (de la config) COLAPSA los dos correos en uno solo.
//   ES_MANUAL    (de la forma)  NO colapsa nada: FUERZA el destinatario.
// La primera version las fusionaba, y eso hacia imposible ver como queda cada
// correo de grupo sin mandarselo al grupo. Lo que hay que impedir no es que una
// corrida manual produzca dos correos, es que ALCANCE al equipo.
const MODO_PRUEBA = (C.modo_prueba === true);
const destinoDe = to => ES_MANUAL ? C.alert_recipient_default : to;

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
// ---- render (S3, rediseno del formato - issue #230) --------------------------
// UN SOLO EJE. El correo viejo seccionaba por TRES a la vez (severidad, novedad y
// tipo de hallazgo) y un proyecto tiene valor en los tres, asi que aparecia hasta 3
// veces: 21 menciones para 13 proyectos, medido sobre el correo del 9-sep. Aqui la
// unica pregunta que decide seccion es "?pide algo o no?"; la novedad y el tipo de
// bandera bajan a etiquetas del renglon, donde no multiplican menciones.
//
// UN SOLO SISTEMA DE COLOR. Con el semaforo B fuera del reporte, el color significa
// una sola cosa: que tan tarde va el proyecto EN SU ETAPA. Los titulos de seccion,
// las banderas y la novedad dejan de usar color y usan posicion, peso y etiqueta.
// Y el punto VERDE existe: el renglon viejo hacia `rojo ? rojo : amarillo`, asi que
// un proyecto en tiempo salia pintado de amarillo con el encabezado diciendo
// "amarillo: 0".
const ES_AUTORIA = t => t==='fecha_fin' || t==='stage_atras';
const PUNTO = { rojo:'&#128308;', amarillo:'&#128993;', verde:'&#128994;' };
const ACC = { rojo:'Avanza de stage o documenta por que sigue aqui (Log note)',
              amarillo:'Se acerca al limite: mueve el stage o documenta' };
function chip(txt, tono){
  const c = tono==='fuerte' ? '#444' : '#777';
  return '<span style="font-size:11px;color:'+c+';border:1px solid #ccc;border-radius:3px;padding:0 4px;margin-left:4px">'+esc(txt)+'</span>';
}
// UN renglon, UNA vez, con todo lo suyo encima: color, dias, novedad y banderas.
// Las banderas se imprimian dos veces (en linea y otra vez en su seccion): aqui no.
function fila(r, etiqueta, compacto){
  const col = r.color_a_rep;
  let h='<li style="margin-bottom:'+(compacto?'3px':'7px')+'">';
  h+= PUNTO[col] + ' <b>'+escN(r.name,45)+'</b> ('+escN(r.cliente,32)+') &middot; '+esc(r.stage);
  h+= ' &middot; <b>'+dE(r)+(dE(r)===1?' dia':' dias')+'</b> en la etapa';
  if(r.project_date) h+=' &middot; compromiso '+esc(String(r.project_date).slice(0,10));
  if(etiqueta) h+= chip(etiqueta,'fuerte');
  h+=' &middot; '+lnk(r);
  if(compacto){
    // En compacto NO se imprime el detalle, pero SI el motivo: un renglon verde en
    // "siguen pendientes" sin pista de por que esta ahi se lee como un error de
    // clasificacion. El color dice el retraso; esto dice que es lo que pide.
    const motivos=[];
    if(r.sin_avance) motivos.push("nota repetida");
    if((r.banderas||[]).length) motivos.push(r.banderas.length+" bandera"+(r.banderas.length>1?"s":""));
    if(motivos.length) h+= chip(motivos.join(" + "));
  }
  if(!compacto){
    for(const f of (r._flagsNuevas||[])){
      h+='<br><span style="color:#555">&#128681; '+esc(f.detalle)+chip(ES_AUTORIA(f.tipo)?'cambio fuera de Comercial':'dato por revisar')+'</span>';
    }
    if(r.sin_avance) h+='<br><span style="color:#555">&#128260; '+(r.racha_nota||0)+' notas seguidas practicamente iguales: documenta que CAMBIO o mueve el stage</span>';
    if(col!=='verde') h+='<br><span style="color:#666">&#8627; '+ACC[col]+'</span>';
  }
  return h+'</li>';
}
function bloque(titulo, criterio, arr, etiquetaDe, compacto){
  let h='<h3 style="margin:16px 0 2px;font-size:15px">'+titulo+' ['+arr.length+']</h3>';
  h+='<p style="margin:0 0 6px;font-size:12px;color:#777">'+criterio+'</p>';
  if(!arr.length) return h+'<p style="color:#888;margin:2px 0;font-size:13px">- ninguno -</p>';
  const ord = arr.slice().sort((x,y)=>(y.dias_en_stage||0)-(x.dias_en_stage||0));
  h+='<ul style="font-size:13px;margin:4px 0;padding-left:18px">';
  for(const r of ord) h+=fila(r, etiquetaDe?etiquetaDe(r):'', compacto);
  return h+'</ul>';
}
// Problemas DEL REPORTE, no de los proyectos: lecturas vacias, ESCRITURAS FALLIDAS,
// banderas de calidad de dato y la advertencia de que el contador mide otra cosa.
function secReporte(subset, resueltos){
  const items=[];
  for(const d of wdiag) items.push('<b>ESCRITURA FALLIDA &mdash; '+esc(d.nodo)+'</b>: '+esc(d.problema)+(d.casos&&d.casos.length?(' &mdash; '+esc(d.casos.map(x=>x.motivo).join(' | '))):''));
  for(const d of diag) items.push('<b>'+esc(d.nodo)+'</b>: '+esc(d.problema)+(d.critico?' <b>(CRITICO)</b>':''));
  const nCd = subset.filter(r=>r.fuente_a==='create_date').length;
  if(nCd) items.push('<b>'+nCd+' de '+subset.length+' proyectos</b> miden los dias desde <code>create_date</code>, no desde la entrada a la etapa: no hay ningun <code>mail.message</code> con <code>subtype_id=94</code>. <b>Ese numero es la EDAD del proyecto.</b> Causa raiz en el issue #229.');
  let h='<h3 style="margin:16px 0 2px;font-size:15px">&#128295; Problemas del propio reporte ['+items.length+']</h3>';
  h+='<p style="margin:0 0 6px;font-size:12px;color:#777">Fallas de medicion o de escritura del watchdog. No son proyectos atrasados: son cosas que este correo no pudo hacer o no pudo medir.</p>';
  if(!items.length) return h+'<p style="color:#888;margin:2px 0;font-size:13px">- nada -</p>';
  h+='<ul style="font-size:13px;margin:4px 0;padding-left:18px">';
  for(const t of items) h+='<li style="margin-bottom:4px">'+t+'</li>';
  return h+'</ul>';
}
function buildMsg(subset, grupoLabel, to, esGlobal){
  const pide = subset.filter(enLista);
  const noPide = subset.filter(r=>!enLista(r));
  // Se filtra por PERTENENCIA al subset, no por igualdad de grupo. En modo prueba el
  // label es "Operaciones + Admin", que ningun proyecto tiene, asi que comparar por
  // grupo dejaba nu/em/me SIEMPRE vacios: el delta estaba muerto en toda corrida de
  // prueba y el correo decia "sin cambios" aunque hubiera movimiento. Con el gate de
  // modo (toda corrida manual es prueba) eso habria roto cualquier verificacion.
  const idsSub = new Set(subset.map(r=>r.id));
  const enSub = r => idsSub.has(r.id);
  const nu=NUEVO.filter(enSub), em=EMPEORO.filter(enSub), me=MEJORO.filter(enSub);
  const res=RESUELTOS.filter(x=>esGlobal || x.grupo===grupoLabel || x.grupo===null);
  // Una bandera nueva ES un cambio: el proyecto entra a "lo que cambio" aunque su
  // color no se haya movido. Asi la bandera vive en el renglon y no necesita seccion
  // propia -- que era la fuente de la doble impresion.
  const idsCambio = new Set(nu.concat(em).concat(me).map(r=>r.id));
  const porBandera = pide.filter(r=>!idsCambio.has(r.id) && (r._flagsNuevas||[]).length);
  const cambiaron = nu.concat(em).concat(me).concat(porBandera);
  const idsImpresos = new Set(cambiaron.map(r=>r.id));
  const siguen = pide.filter(r=>!idsImpresos.has(r.id));
  const etiquetaDe = r => idsCambio.has(r.id)
      ? (nu.includes(r)?'nuevo':(em.includes(r)?'empeoro':'mejoro'))
      : 'bandera nueva';
  const hay = cambiaron.length||res.length||wdiag.length||diagNuevo;
  // wdiag entra en `hay` a proposito: si una ESCRITURA fallo, el correo sale aunque no
  // haya ningun cambio en los proyectos. Sin esto, un dia quieto se traga el fallo.
  if(!hay && !esLunes) return null;
  const aC=cntA(subset);

  let html='<meta charset="utf-8"><div style="font-family:Arial,sans-serif;color:#222;font-size:14px">';
  html+='<h2 style="margin:0;font-size:19px">Semaforo '+esc(grupoLabel)+' &middot; '+fb+'</h2>';
  html+='<div style="background:#f4f6f8;border-radius:8px;padding:10px 12px;margin:10px 0">';
  html+='<p style="margin:0 0 4px"><b>'+subset.length+' proyectos vigilados</b> &middot; retraso en la etapa: '+
        PUNTO.verde+' '+aC.V+' &middot; '+PUNTO.amarillo+' '+aC.A+' &middot; '+PUNTO.rojo+' '+aC.R+'</p>';
  html+='<p style="margin:0;font-size:12px;color:#666">El color dice UNA sola cosa: que tan tarde va el proyecto en su etapa. '+
        (esLunes ? 'Hoy el correo trae el <b>estado completo</b>.' : 'Hoy el correo trae <b>lo que cambio</b>; abajo se dice cuantos no cambiaron.')+'</p></div>';

  if(!cambiaron.length && !res.length){
    html+='<h3 style="margin:16px 0 2px;font-size:15px">Lo que cambio desde el correo anterior [0]</h3>';
    html+='<p style="margin:0 0 6px;font-size:12px;color:#777">Proyectos que entraron, empeoraron, mejoraron o estrenaron bandera desde el correo anterior.</p>';
    html+='<p style="color:#888;margin:2px 0;font-size:13px">- ningun cambio -</p>';
  } else {
    html+=bloque('Lo que cambio desde el correo anterior',
      'Proyectos que entraron, empeoraron, mejoraron o estrenaron bandera desde el correo anterior.',
      cambiaron, etiquetaDe, false);
    if(res.length){
      html+='<p style="margin:8px 0 2px;font-size:13px"><b>Salieron de la lista ['+res.length+']</b>: ';
      html+=res.map(x=>esc(x.name)).join(' &middot; ')+'</p>';
    }
  }

  // Seccion 2: lo que pide algo y ya lo pedia. El lunes se despliega; el resto de la
  // semana va contada. Esto es lo que S1 dejaba solo en el pie -- y ahi se escondio
  // MAGNEKON con $1.28M vencidos, el renglon que motivo la auditoria #220.
  if(esLunes){
    html+=bloque('Siguen pendientes, sin cambio',
      'Piden algo y ya lo pedian en el correo anterior. Se despliegan hoy porque es el dia del estado completo.',
      siguen, ()=>'', true);
  } else {
    html+='<h3 style="margin:16px 0 2px;font-size:15px">Siguen pendientes, sin cambio ['+siguen.length+']</h3>';
    html+='<p style="margin:0 0 6px;font-size:12px;color:#777">Piden algo y ya lo pedian en el correo anterior. No se despliegan hoy para que se vea lo que cambio; el lunes salen completos.</p>';
  }

  html+='<h3 style="margin:16px 0 2px;font-size:15px">Ya no piden nada ['+noPide.length+']</h3>';
  html+='<p style="margin:0 0 6px;font-size:12px;color:#777">En tiempo en su etapa, sin banderas y con seguimiento al dia. No requieren accion.</p>';

  html+=secReporte(subset, res);

  // PIE QUE RECONCILIA. El pie viejo decia "0 proyectos en condicion estable" teniendo
  // 9 verdes, porque contaba otra cosa con un nombre que sonaba igual. Este pie cierra
  // la cuenta contra el encabezado, y si algun dia no cierra se VE.
  const suma = cambiaron.length + siguen.length + noPide.length;
  html+='<hr style="margin:18px 0 8px"><p style="font-size:12px;color:#666">';
  html+='<b>La cuenta:</b> '+subset.length+' vigilados = '+cambiaron.length+' con cambio + '+siguen.length+
        ' pendientes sin cambio + '+noPide.length+' que no piden nada'+
        (suma===subset.length?'. Cuadra.':' = '+suma+'. <b>NO CUADRA</b> - avisar.')+'<br>';
  if(esLunes) html+='&#128202; <b>KPI semanal</b> ('+(kpiSem.modo==='simple'?('arranque, dia '+kpiSem.dias):('promedio '+kpiSem.dias+' dias'))+'): <b>'+kpiSem.aPct+'%</b> en tiempo (meta &ge;90%)<br>';
  html+='El semaforo de <b>falta de seguimiento</b> se retiro del reporte en S1 (#220): llevaba 11 corridas en 0% verde y su verde era inalcanzable por construccion. Se sigue calculando.<br>';
  html+='Corrida '+esc(fechaStr)+' 08:00 CST &middot; modo <b>'+(MODO_PRUEBA?'PRUEBA':'produccion')+'</b>'+(ES_MANUAL?(' &middot; <b>disparo MANUAL: destinatarios forzados a '+esc(C.alert_recipient_default)+'</b>'):'')+'.</p></div>';

  const partes=[];
  if(nu.length) partes.push(nu.length+' nuevo'+(nu.length>1?'s':''));
  if(em.length) partes.push(em.length+' empeoro');
  if(me.length) partes.push(me.length+' mejoro');
  if(porBandera.length) partes.push(porBandera.length+' bandera'+(porBandera.length>1?'s':''));
  if(res.length) partes.push(res.length+(res.length>1?' salieron':' salio'));
  if(esLunes) partes.push('estado completo');
  if(diag.length) partes.push('REVISAR MEDICION');
  if(wdiag.length) partes.push('ESCRITURA FALLIDA');
  const subj='[Semaforo '+grupoLabel+'] '+fb+' - '+(partes.length?partes.join(' · '):'sin cambios');
  const toList = Array.isArray(to) ? to : String(to).split(',').map(s=>s.trim()).filter(Boolean);
  return { message:{ subject:subj, body:{ contentType:'HTML', content:html }, toRecipients: toList.map(a=>({ emailAddress:{ address:a } })) }, saveToSentItems:true };
}
// persistir estado DESPUES de construir (si truena arriba, no se pierde la linea base)
sd.s1_prevA = nextA; sd.s1_prevEv = nextEv; sd.s1_nombres = nextNombres; sd.s1_grupos = nextGrupos;
sd.s1_diagFirma = diagFirma;
const out=[];
if (MODO_PRUEBA) { const m=buildMsg(rows, "Operaciones + Admin", destinoDe(C.alert_recipient_default), true); if(m) out.push({json:m}); }
else { for (const g of ["Operaciones","Admin"]) { const sub = rows.filter(r => r.grupo === g);
  const to = destinoDe((C.recipients_por_grupo || {})[g] || C.alert_recipient_default);
  const m = buildMsg(sub, g, to); if(m) out.push({json:m}); } }
return out;
