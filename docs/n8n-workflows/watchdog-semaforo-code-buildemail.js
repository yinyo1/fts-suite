
const _cf = $('HTTP - load config').first().json;
const cfg = (_cf && _cf.config) ? _cf : JSON.parse(_cf.data || _cf.body || (typeof _cf==='string'?_cf:JSON.stringify(_cf)));
const C = cfg.config;
const OBSH = (cfg.observacion||{}).hasta;
const rows = $('Code - MAIN').all().map(i=>i.json);
const hoy = $('Set - hoy').first().json.hoy;
const today = new Date(hoy);
const fechaStr = hoy.slice(0,10);
const MES_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fb = fechaStr.slice(8,10)+'/'+MES_EN[parseInt(fechaStr.slice(5,7),10)-1]+'/'+fechaStr.slice(0,4);
// DOS semaforos independientes: A = estancamiento en stage (color_a), B = falta de seguimiento (color_b).
const cntBy = (a,key) => ({ total:a.length, V:a.filter(r=>r[key]==='verde').length, A:a.filter(r=>r[key]==='amarillo').length, R:a.filter(r=>r[key]==='rojo').length });
const aAll = cntBy(rows,'color_a'), bAll = cntBy(rows,'color_b');
const sd = $getWorkflowStaticData('global');
sd.history = (sd.history||[]).filter(h=>h.fecha!==fechaStr);
sd.history.push({ fecha:fechaStr, total:rows.length, aV:aAll.V,aA:aAll.A,aR:aAll.R, bV:bAll.V,bA:bAll.A,bR:bAll.R });
sd.history = sd.history.slice(-45);
const criticosG = rows.filter(r=>r.color_a==='rojo' && r.color_b==='rojo');
const critKey = criticosG.map(r=>r.id).sort((a,b)=>a-b).join(',');
const prevIds = new Set(sd.lastCritIds||[]);
const cambio = critKey !== (sd.lastCritKey||'');
sd.lastCritKey = critKey; sd.lastCritIds = criticosG.map(r=>r.id);
function mondayOf(d){ const x=new Date(d); const g=(x.getDay()+6)%7; x.setDate(x.getDate()-g); x.setHours(0,0,0,0); return x; }
const lunes = mondayOf(today);
const semana = sd.history.filter(h=> new Date(h.fecha) >= lunes);
function pctV(list,vKey){ if(!list.length) return 0; const s=list.reduce((a,h)=>a+(h.total?(h[vKey]/h.total):0),0); return Math.round(s/list.length*100); }
const aPctNow = rows.length?Math.round(aAll.V/rows.length*100):0;
const bPctNow = rows.length?Math.round(bAll.V/rows.length*100):0;
let kpiSem;
if (semana.length < 4) { kpiSem = { modo:'simple', aPct:aPctNow, bPct:bPctNow, dias:semana.length }; }
else { kpiSem = { modo:'promedio', aPct:pctV(semana,'aV'), bPct:pctV(semana,'bV'), dias:semana.length }; }
const kpiTxt = kpiSem.modo==='simple' ? ('arranque, dia '+kpiSem.dias) : ('promedio '+kpiSem.dias+' dias');
const mesD = sd.history.filter(h=>(h.fecha||'').slice(0,7)===fechaStr.slice(0,7));
const kpiMes = mesD.length ? { a:pctV(mesD,'aV'), b:pctV(mesD,'bV') } : { a:aPctNow, b:bPctNow };
const dow = today.getDay(); const dom = today.getDate();
const esLunes = dow===1; const esInicioMes = dom<=3 && dow>=1 && dow<=5;
const esc = v => Array.from(String(v==null?'':v)).map(function(ch){ var cp=ch.codePointAt(0); if(ch==='&')return '&amp;'; if(ch==='<')return '&lt;'; if(ch==='>')return '&gt;'; if(ch==='"')return '&quot;'; return cp>127?('&#'+cp+';'):ch; }).join('');
const escN = (v,n) => { const s=String(v==null?'':v); return esc(s.length>(n||60) ? s.slice(0,(n||60))+'...' : s); };
const lnk = r => '<a href="'+r.link_odoo+'">abrir</a>';
const dE = r => (r.dias_en_stage==null?'?':r.dias_en_stage);
const dS = r => (r.dias_sin_seguimiento==null?'?':r.dias_sin_seguimiento);
// Un proyecto que nunca tuvo nota valida NO se puede leer igual que uno que tuvo
// seguimiento y lo perdio: el delta viene de create_date, y hay que decirlo.
const txtNota = r => r.sin_nota_valida
  ? '&#9888; <b>sin ninguna nota valida desde creacion</b> ('+dS(r)+'d)'
  : 'sin nota <b>'+dS(r)+'d</b>';
const ACC_DOBLE = '&#8627; Avanza de stage <b>Y</b> pon una Log note';
const ACC_ESTANC = '&#8627; Avanza de stage o documenta por que sigue aqui (Log note)';
const ACC_NOTA = '&#8627; Pon una Log note en el chatter del proyecto';
const ACC_SINAV = '&#8627; La nota se esta repitiendo: documenta que CAMBIO o mueve el stage';
function secSinAvance(arr){ if(!arr.length) return '<p style="color:#888">- ninguno -</p>';
  arr=arr.slice().sort((x,y)=>(y.racha_nota||0)-(x.racha_nota||0));
  let h='<ul style="font-size:13px;margin:4px 0;padding-left:18px">';
  for(const r of arr){ h+='<li style="margin-bottom:7px"><b>'+escN(r.name)+'</b> ('+escN(r.cliente,40)+') &middot; '+esc(r.stage)+
    '<br>&#128260; <b>'+(r.racha_nota||0)+' notas seguidas practicamente iguales</b> &middot; en stage <b>'+dE(r)+'d</b> &middot; '+lnk(r)+
    '<br><span style="color:#8e24aa">'+ACC_SINAV+'</span></li>'; } return h+'</ul>'; }
function secObserv(arr){ if(!arr.length) return '<p style="color:#888">- ninguno -</p>';
  arr=arr.slice().sort((x,y)=>(y.dias_sin_seguimiento||0)-(x.dias_sin_seguimiento||0));
  let h='<ul style="font-size:13px;margin:4px 0;padding-left:18px">';
  for(const r of arr){ const cn=r.color_b_nuevo; const ic = cn==='rojo'?'&#128308;':(cn==='amarillo'?'&#128993;':'&#128994;');
    h+='<li style="margin-bottom:5px">'+ic+' <b>'+escN(r.name)+'</b> ('+escN(r.cliente,40)+') &middot; '+txtNota(r)+' &middot; '+lnk(r)+'</li>'; }
  return h+'</ul>'; }
function semLine(icon,label,c){ return '<p style="margin:3px 0">'+icon+' <b>'+label+':</b> &#128994; '+c.V+' verde &middot; &#128993; '+c.A+' amarillo &middot; &#128308; '+c.R+' rojo</p>'; }
function secCrit(arr){ if(!arr.length) return '<p style="color:#888">- ninguno -</p>'; arr=arr.slice().sort((x,y)=>((y.dias_en_stage||0)+(y.dias_sin_seguimiento||0))-((x.dias_en_stage||0)+(x.dias_sin_seguimiento||0))); let h='<ul style="font-size:13px;margin:4px 0;padding-left:18px">'; for(const r of arr){ const nv=prevIds.has(r.id)?'':' &#128640;'; h+='<li style="margin-bottom:7px"><b>'+escN(r.name)+'</b>'+nv+' ('+escN(r.cliente,40)+') &middot; '+esc(r.stage)+'<br>&#128308; en stage <b>'+dE(r)+'d</b> &middot; &#128308; '+txtNota(r)+' &middot; '+lnk(r)+'<br><span style="color:#c62828">'+ACC_DOBLE+'</span></li>'; } return h+'</ul>'; }
function secEstanc(arr){ if(!arr.length) return '<p style="color:#888">- ninguno -</p>'; arr=arr.slice().sort((x,y)=>(y.dias_en_stage||0)-(x.dias_en_stage||0)); let h='<ul style="font-size:13px;margin:4px 0;padding-left:18px">'; for(const r of arr){ h+='<li style="margin-bottom:5px"><b>'+escN(r.name)+'</b> ('+escN(r.cliente,40)+') &middot; '+esc(r.stage)+' &middot; &#128308; en stage <b>'+dE(r)+'d</b> &middot; '+lnk(r)+'<br><span style="color:#1565c0">'+ACC_ESTANC+'</span></li>'; } return h+'</ul>'; }
function secNota(arr){ if(!arr.length) return '<p style="color:#888">- ninguno -</p>'; arr=arr.slice().sort((x,y)=>(y.dias_sin_seguimiento||0)-(x.dias_sin_seguimiento||0)); let h='<ul style="font-size:13px;margin:4px 0;padding-left:18px">'; for(const r of arr){ h+='<li style="margin-bottom:5px"><b>'+escN(r.name)+'</b> ('+escN(r.cliente,40)+') &middot; '+esc(r.stage)+' &middot; &#128308; '+txtNota(r)+' &middot; '+lnk(r)+'<br><span style="color:#b35900">'+ACC_NOTA+'</span></li>'; } return h+'</ul>'; }
function secAmar(arr){ if(!arr.length) return '<p style="color:#888">- ninguno -</p>'; let h='<ul style="font-size:13px;margin:4px 0;padding-left:18px">'; for(const r of arr){ const p=[]; if(r.color_a==='amarillo') p.push('estancamiento '+dE(r)+'d'); if(r.color_b==='amarillo') p.push('seguimiento '+dS(r)+'d'); h+='<li>&#128993; '+escN(r.name)+' ('+escN(r.cliente,40)+') &middot; acercandose: '+p.join(' + ')+' &middot; '+lnk(r)+'</li>'; } return h+'</ul>'; }
function listaFlags(arr){ if(!arr.length) return '<p style="color:#888">- sin banderas -</p>'; let h='<ul style="font-size:13px;margin:4px 0;padding-left:18px">'; for(const r of arr){ for(const f of (r.banderas||[])){ h+='<li>&#128681; '+escN(r.name)+': '+esc(f.detalle)+'</li>'; } } return h+'</ul>'; }
function buildMsg(subset, grupoLabel, to){
  const aC=cntBy(subset,'color_a'), bC=cntBy(subset,'color_b');
  const crit=subset.filter(r=>r.color_a==='rojo'&&r.color_b==='rojo');
  const soloEst=subset.filter(r=>r.color_a==='rojo'&&r.color_b!=='rojo');
  const soloNota=subset.filter(r=>r.color_b==='rojo'&&r.color_a!=='rojo');
  const amar=subset.filter(r=>(r.color_a==='amarillo'||r.color_b==='amarillo')&&r.color_a!=='rojo'&&r.color_b!=='rojo');
  const flg=subset.filter(r=>(r.banderas||[]).length>0);
  const sinAv=subset.filter(r=>r.sin_avance);
  const obs=subset.filter(r=>r.en_observacion);
  let html='<meta charset="utf-8"><div style="font-family:Arial,sans-serif;color:#222;font-size:14px">';
  html+='<h2 style="color:#0078D4;margin:0">Semaforo '+esc(grupoLabel)+' - '+fb+'</h2>';
  html+='<div style="background:#f4f6f8;border-radius:8px;padding:8px 12px;margin:8px 0">';
  html+='<p style="margin:0 0 4px"><b>'+subset.length+' proyectos totales</b> '+(cambio?'':'<span style="color:#888">(sin cambios en criticos desde ayer)</span>')+'</p>';
  html+=semLine('&#128309;','ESTANCAMIENTO EN STAGE',aC);
  html+=semLine('&#128221;','FALTA DE SEGUIMIENTO',bC);
  html+='</div>';
  html+='<h3 style="color:#c62828;margin:14px 0 4px">&#128308;&#128308; CRITICOS - doble rojo (atorado Y sin seguimiento) ['+crit.length+']</h3>'+secCrit(crit);
  html+='<h3 style="color:#8e24aa;margin:14px 0 4px">&#128260; SEGUIMIENTO SIN AVANCE (la nota se repite) ['+sinAv.length+']</h3>'+secSinAvance(sinAv);
  html+='<h3 style="color:#1565c0;margin:14px 0 4px">&#128309; SOLO ESTANCADOS (mucho tiempo en stage) ['+soloEst.length+']</h3>'+secEstanc(soloEst);
  html+='<h3 style="color:#b35900;margin:14px 0 4px">&#128221; SOLO SIN SEGUIMIENTO (falta Log note) ['+soloNota.length+']</h3>'+secNota(soloNota);
  html+='<h3 style="margin:14px 0 4px">&#128993; AMARILLOS - preventivo ['+amar.length+']</h3>'+secAmar(amar);
  if(obs.length){ html+='<div style="border:1px dashed #b35900;border-radius:8px;padding:8px 12px;margin:14px 0;background:#fff8f0">';
    html+='<h3 style="color:#b35900;margin:0 0 4px">&#128300; NUEVO CRITERIO - EN OBSERVACION ['+obs.length+']</h3>';
    html+='<p style="margin:0 0 6px;font-size:12px;color:#666">Estos proyectos se evaluarian asi con la regla de nota diaria. '+
      'Hoy <b>no</b> cuentan para el KPI ni para los contadores de arriba; siguen puntuando con su criterio anterior'+
      (OBSH?(' hasta el '+esc(OBSH)):'')+'.</p>';
    html+=secObserv(obs)+'</div>'; }
  html+='<h3 style="margin:14px 0 4px">&#128681; INTEGRIDAD / posible manipulacion</h3>'+listaFlags(flg);
  if(esLunes){ html+='<hr><p>&#128202; <b>KPI semanal</b> ('+kpiTxt+'): estancamiento <b>'+kpiSem.aPct+'%</b> verde &middot; seguimiento <b>'+kpiSem.bPct+'%</b> verde (meta &ge;90%)</p>'; }
  if(esInicioMes){ html+='<p>&#128197; <b>Cierre mensual</b> (mes en curso): estancamiento <b>'+kpiMes.a+'%</b> &middot; seguimiento <b>'+kpiMes.b+'%</b> verde</p>'; }
  html+='</div>';
  const E=String.fromCodePoint;
  const subj='[Semaforo '+grupoLabel+'] '+fb+' - '+E(128308)+E(128308)+' '+crit.length+' criticos '+E(183)+' '+E(128309)+' '+soloEst.length+' estancados '+E(183)+' '+E(128221)+' '+soloNota.length+' sin nota';
  const toList = Array.isArray(to) ? to : String(to).split(',').map(s=>s.trim()).filter(Boolean);
  return { message:{ subject:subj, body:{ contentType:'HTML', content:html }, toRecipients: toList.map(a=>({ emailAddress:{ address:a } })) }, saveToSentItems:true };
}
const out=[];
const redir = C.redirect_todo_a;
if (redir) {
  // PRUEBA DE VESTIDO: 2 correos por grupo (contenido separado, como produccion) pero destinatario
  // FORZADO a redir. Esta rama NUNCA lee recipients_por_grupo -> imposible que llegue a las listas reales.
  // BORRAR redirect_todo_a del config para el go-live.
  for(const g of ['Operaciones','Admin']){ const sub=rows.filter(r=>r.grupo===g); out.push({ json: buildMsg(sub, g, redir) }); }
} else if (C.modo_prueba){ out.push({ json: buildMsg(rows, 'Operaciones + Admin', C.alert_recipient_default) }); }
else { for(const g of ['Operaciones','Admin']){ const sub=rows.filter(r=>r.grupo===g); const to=(C.recipients_por_grupo||{})[g]||C.alert_recipient_default; out.push({ json: buildMsg(sub, g, to) }); } }
return out;
