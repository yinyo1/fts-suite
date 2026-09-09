// -- Code - MAIN - S1 (2026-09-09, issue #220) --------------------------------
// S1 NO CAMBIA NINGUN CALCULO. Lo que se agrega:
//   (1) GUARDA DE VACIO en todos los nodos Odoo. Causa raiz del bug de 12 semanas:
//       alwaysOutputData:true + onError:continueRegularOutput hacen que un search vacio
//       devuelva [{}] y sea indistinguible de un search exitoso. Ahora cada nodo declara
//       su llave esperada; si no llega ni una fila utilizable se levanta un diagnostico
//       que el correo IMPRIME. Un fallback silencioso deja de ser posible.
//   (2) `ev` (identidad de evento) en cada bandera, para que buildEmail pueda reportar
//       un evento UNA vez en lugar de todos los dias que dure en la ventana de 30.
//   (3) `tramo` del contador, para clasificar delta sin que el renglon "cambie" a diario.
// color_b / dias_sin_seguimiento SIGUEN calculandose y viajan en la fila: el semaforo B
// se retira del REPORTE, no del computo (S3 puede necesitarlo). Umbrales intactos.
let _r = $('HTTP - load config').first().json;
const cfg = (_r && _r.config) ? _r : JSON.parse(_r.data || _r.body || (typeof _r === 'string' ? _r : JSON.stringify(_r)));
const C = cfg.config, STG = cfg.stages, MAT = cfg.materiales_overrides || {}, EXCL = cfg.excluidos || [];
const SEQ = {1:0,2:1,5:2,3:3,7:4,13:8,8:9,4:10,6:11};
const COM = C.comercial_whitelist_partner_ids || [], WD = C.watchdog_author_partner_id;
const FF = cfg.integridad.fecha_fin_field_id, FS = cfg.integridad.stage_field_id;
const AP = C.ap_confirmacion || {};
const OBS = cfg.observacion || {};
const NR = cfg.nota_repetida || {};
const SIMIL = (NR.umbral_similitud != null) ? NR.umbral_similitud : 0.85;
const RACHA_MIN = (NR.racha_minima != null) ? NR.racha_minima : 2;
const SA = cfg.sin_avance || {};
const SA_DIAS = (SA.dias_en_stage_min != null) ? SA.dias_en_stage_min : 60;
const HOLD_ST = (cfg.banderas && cfg.banderas.hold_sin_fecha_stages) || [];
const hoyISO = String($('Set - hoy').first().json.hoy || '').slice(0,10);
// --- GUARDA DE VACIO (S1) ----------------------------------------------------
// `llave` es un campo que TODA fila legitima de ese nodo trae. Si ninguna fila la
// tiene, el search vino vacio (o el nodo fallo y onError lo dejo pasar como dato).
const _diag = [];
function rowsOf(nodo, llave, critico){
  let all = [];
  try { all = $(nodo).all(); } catch(e){
    _diag.push({nodo:nodo, problema:'no se pudo leer el nodo', detalle:String(e.message).slice(0,120), critico:!!critico});
    return [];
  }
  const out = [];
  for(const it of all){
    const j = it.json;
    if(j && typeof j === 'object' && j[llave] !== undefined) out.push(j);
  }
  if(!out.length){
    _diag.push({nodo:nodo, problema:'devolvio 0 filas utilizables (llave "'+llave+'" ausente)',
                items_crudos:all.length, critico:!!critico});
  }
  return out;
}
const R_PROJ  = rowsOf('Odoo - getAll projects','id',true);
const R_SO    = rowsOf('Odoo - getAll SO','id',false);
const R_PART  = rowsOf('Odoo - getAll partners','id',false);
const R_TERM  = rowsOf('Odoo - getAll termlines','payment_id',false);
const R_M94   = rowsOf('Odoo - getAll msg94','res_id',true);
const R_MCOM  = rowsOf('Odoo - getAll msgComment','res_id',false);
const R_TMSG  = rowsOf('Odoo - getAll trackedMsgs','res_id',false);
const R_TVAL  = rowsOf('Odoo - getAll trackingVals','field_id',false);
const R_ATT   = rowsOf('Odoo - getAll attachments','id',false);
// --- TZ ----------------------------------------------------------------------
// Toda la aritmetica de dias opera en hora de MONTERREY (UTC-6, sin DST desde 2022).
// El contenedor n8n corre en UTC; settings.timezone del workflow NO aplica a
// getHours()/setDate() de un Code node, por eso se normaliza a mano.
const TZO = (C.tz_offset_hours != null ? C.tz_offset_hours : -6);
function mtyWall(ds){ if(!ds) return null; const s=String(ds);
  const iso = s.replace(' ','T') + (/([Zz]|[+-]\d\d:?\d\d)$/.test(s) ? '' : 'Z');
  const t = Date.parse(iso); if(isNaN(t)) return null;
  return new Date(t + TZO*3600000); }
function dayStart(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
const today = mtyWall($('Set - hoy').first().json.hoy);
const todayDay = dayStart(today);
const m2o = v => Array.isArray(v)?v[0]:v;
const isWE = x => x.getDay()===6 || x.getDay()===0;
function nextBizDay(d){ const x=dayStart(d); do { x.setDate(x.getDate()+1); } while(C.excluir_findes && isWE(x)); return x; }
// Dias habiles TRANSCURRIDOS desde el dia de la nota: hoy=0, ayer habil=1, viernes->lunes=1.
function bizDays(ds){ const w=mtyWall(ds); if(!w) return null;
  let c=nextBizDay(w), n=0; while(c <= todayDay){ n++; c=nextBizDay(c); } return n; }
function lastBy(rows, filt){ const m={}; for(const r of rows){ if(filt && !filt(r)) continue;
  const rid=r.res_id; if(!m[rid] || new Date(r.date) > new Date(m[rid].date)) m[rid]=r; } return m; }
const lastStageMsg = lastBy(R_M94);
// --- Notas: normalizacion, GUARD de vacias, y deteccion de repetidas --------
function normNota(h){ return String(h==null?'':h)
  .replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/\s+/g,' ').trim(); }
function bigr(s){ const g=new Set(); for(let i=0;i<s.length-1;i++) g.add(s.slice(i,i+2)); return g; }
function simil(a,b){ if(a===b) return 1; if(!a.length||!b.length) return 0;
  const A=bigr(a), B=bigr(b); let x=0; for(const k of A) if(B.has(k)) x++;
  return (2*x)/(A.size+B.size); }
const notasProj = {}, vaciasProj = {};
for(const m of R_MCOM){
  if(m==null || m.res_id==null) continue;
  if(m2o(m.author_id) === WD) continue;
  const t = normNota(m.body);
  if(!t){ vaciasProj[m.res_id] = (vaciasProj[m.res_id]||0)+1; continue; }
  (notasProj[m.res_id] = notasProj[m.res_id]||[]).push({ date:m.date, t }); }
const lastComment = {}, rachaProj = {};
for(const k of Object.keys(notasProj)){
  const arr = notasProj[k].sort((a,b)=> new Date(a.date) - new Date(b.date));
  lastComment[k] = arr[arr.length-1];
  let r=1; for(let i=arr.length-1; i>0; i--){ if(simil(arr[i].t, arr[i-1].t) >= SIMIL) r++; else break; }
  rachaProj[k] = r; }
const matSO = {}; for(const s of R_SO){ matSO[s.id] = (C.materiales_values||[]).includes(s.x_studio_product_type); }
const termDays = {}; for(const t of R_TERM){ const k=m2o(t.payment_id); termDays[k]=Math.max(termDays[k]||0, Number(t.nb_days)||0); }
const partnerTerm = {}; for(const p of R_PART){ partnerTerm[p.id] = p.property_payment_term_id ? m2o(p.property_payment_term_id) : null; }
const trkByMsg = {}; for(const t of R_TVAL){ trkByMsg[m2o(t.mail_message_id)] = t; }
const flagsByProj = {}; function addFlag(rid,f){ (flagsByProj[rid]=flagsByProj[rid]||[]).push(f); }
// `ev`: identidad del EVENTO. Para banderas de evento (cambio de fecha / de stage) es el
// id del mail.message, que es unico e inmutable -> el correo lo reporta UNA vez, no los
// ~21 dias que el evento vive en la ventana de 30. Para banderas de ESTADO el ev describe
// el estado, y se deduplica por firma (si el estado sigue igual, no se repite).
for(const m of R_TMSG){ const t=trkByMsg[m.id]; if(!t) continue; const au=m2o(m.author_id); const aun=Array.isArray(m.author_id)?m.author_id[1]:''; const fid=m2o(t.field_id);
  if(fid===FF && t.old_value_datetime && !COM.includes(au)) addFlag(m.res_id,{tipo:'fecha_fin', ev:'fecha_fin|'+m.id, detalle:'Fecha fin movida por '+aun+' (fuera de Comercial): '+String(t.old_value_datetime).slice(0,10)+' -> '+String(t.new_value_datetime).slice(0,10), fecha:m.date});
  if(fid===FS && SEQ[t.new_value_integer]!=null && SEQ[t.old_value_integer]!=null && SEQ[t.new_value_integer] < SEQ[t.old_value_integer]) addFlag(m.res_id,{tipo:'stage_atras', ev:'stage_atras|'+m.id, detalle:'Stage regresado '+t.old_value_char+' -> '+t.new_value_char+' por '+aun, fecha:m.date}); }
const attMime = {}; for(const a of R_ATT){ attMime[a.id]= a.mimetype||''; }
function norm(s){ return String(s||'').replace(/<[^>]*>/g,' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
const apTpl = norm(AP.template);
const apOk = {};
for(const m of R_MCOM){ if(apTpl && norm(m.body).includes(apTpl)){ const hasImg=(m.attachment_ids||[]).some(a=>(attMime[a]||'').startsWith('image/')); if(!AP.requiere_imagen || hasImg) apOk[m.res_id]=true; } }
function colorOf(d,r){ if(d==null||r==null) return 'verde'; if(d>=r) return 'rojo'; if(d>=Math.max(r-1,1)) return 'amarillo'; return 'verde'; }
function rojoCredito(p){ const t=partnerTerm[m2o(p.partner_id)]; const d=(t&&termDays[t]!=null)?termDays[t]:C.credit_fallback_days; return d + C.credit_extra_days; }
// tramo del contador: el renglon solo "cambia" al cruzar de tramo, no cada 24 h.
function tramo(d){ if(d==null) return '?'; if(d===0) return '0'; if(d<=5) return '1-5'; if(d<=15) return '6-15'; if(d<=30) return '16-30'; return '>30'; }
const ORD={verde:0,amarillo:1,rojo:2}; const out=[];
for(const p of R_PROJ){ const sid=m2o(p.stage_id); if(sid==null||EXCL.includes(sid)) continue; const sc=STG[String(sid)]; if(!sc) continue;
  const esMat = p.sale_order_id ? !!matSO[m2o(p.sale_order_id)] : false;
  const ls=lastStageMsg[p.id];
  // FUENTE del contador A, explicita en la fila. Con msg94 vacio esto dice 'create_date'
  // en el 100% de los casos, y el correo lo IMPRIME (issue #220 error #1).
  const fuenteA = ls ? 'stage_msg' : (p.create_date ? 'create_date' : 'ninguna');
  const diasEnStage = ls?bizDays(ls.date):(p.create_date?bizDays(p.create_date):null);
  const lc=lastComment[p.id];
  const sinNotaValida = !lc;
  const diasSinSeg = lc?bizDays(lc.date):(p.create_date?bizDays(p.create_date):null);
  const oEn = (esMat && MAT[sid] && MAT[sid].en_stage) ? MAT[sid].en_stage : sc.en_stage;
  const oSeg = (esMat && MAT[sid] && MAT[sid].sin_seguimiento) ? MAT[sid].sin_seguimiento : sc.sin_seguimiento;
  let colA;
  if(oEn.modo==='due_date'){ if(!p.date){ colA=colorOf(diasEnStage, C.in_progress_fallback_dias); } else { const due=new Date(p.date); const ama=new Date(due.getTime()-(C.in_progress_amarillo_dias_habiles||3)*86400000); colA = today>=due?'rojo':(today>=ama?'amarillo':'verde'); } }
  else if(oEn.modo==='credito'){ colA=colorOf(diasEnStage, rojoCredito(p)); }
  else { colA=colorOf(diasEnStage, oEn.rojo_dias); }
  const evalSeg = o => (o.modo==='credito') ? colorOf(diasSinSeg, rojoCredito(p)) : colorOf(diasSinSeg, o.rojo_dias);
  const colBNuevo = evalSeg(oSeg);
  const enObs = (OBS.stages||[]).includes(sid) && (!OBS.hasta || hoyISO <= OBS.hasta);
  const oPrev = enObs ? ((OBS.sin_seguimiento_previo||{})[String(sid)] || oSeg) : oSeg;
  let colB = enObs ? evalSeg(oPrev) : colBNuevo;
  // El color combinado se sigue calculando (no cambia ningun umbral) pero el REPORTE
  // de S1 usa color_a. Ver issue #220 S2.3: el semaforo B lleva 11 corridas en 0% verde
  // y su verde es inalcanzable por construccion (exige nota de hoy antes de las 08:00).
  let col = ORD[colA]>=ORD[colB]?colA:colB;
  if(p.last_update_status==='off_track') col='rojo'; else if(p.last_update_status==='at_risk' && col==='verde') col='amarillo';
  // colorA con el override de last_update_status, que es el que S1 reporta
  let colAr = colA;
  if(p.last_update_status==='off_track') colAr='rojo'; else if(p.last_update_status==='at_risk' && colAr==='verde') colAr='amarillo';
  if((AP.aplica_stages||[]).includes(sid) && !apOk[p.id]) addFlag(p.id,{tipo:'ap_sin_confirmacion', ev:'ap_sin_confirmacion|estado', detalle:'En plazo de credito SIN confirmacion AP documentada (falta log note + pantallazo)'});
  if(vaciasProj[p.id]) addFlag(p.id,{tipo:'nota_vacia', ev:'nota_vacia|'+vaciasProj[p.id], detalle:vaciasProj[p.id]+' log note(s) sin contenido en el chatter - no cuentan como seguimiento'});
  if(HOLD_ST.includes(sid)){ const fr=p.date;
    if(!fr) addFlag(p.id,{tipo:'hold_sin_fecha_vigente', ev:'hold_sin_fecha|vacia', detalle:'En Hold SIN fecha de reactivacion capturada'});
    else if(String(fr) < hoyISO) addFlag(p.id,{tipo:'hold_sin_fecha_vigente', ev:'hold_sin_fecha|'+fr, detalle:'En Hold con fecha de reactivacion VENCIDA ('+fr+')'}); }
  const racha = rachaProj[p.id] || 0;
  const sinAvance = (racha >= RACHA_MIN) && ((diasEnStage != null && diasEnStage > SA_DIAS) || colA !== 'verde');
  out.push({ json:{ id:p.id, name:p.name, stage_id:sid, stage:sc.label, grupo:sc.grupo, cliente: p.partner_id?p.partner_id[1]:'', es_materiales:esMat, dias_en_stage:diasEnStage, dias_sin_seguimiento:diasSinSeg, color_a:colA, color_a_rep:colAr, color_b:colB, color:col, banderas: flagsByProj[p.id]||[], sin_nota_valida:sinNotaValida, racha_nota:(rachaProj[p.id]||0), sin_avance:sinAvance, en_observacion:enObs, color_b_nuevo:colBNuevo, fuente_a:fuenteA, tramo_a:tramo(diasEnStage), project_date:(p.date||null), _diag:_diag, link_odoo:'https://serviciosfts.odoo.com/web#id='+p.id+'&model=project.project&view_type=form' } }); }
// Si NO hay proyectos, el diagnostico tiene que sobrevivir: sin esto un fallo del nodo 1
// devolveria [] y el correo saldria vacio y "correcto", que es el modo de falla que S1 mata.
if(!out.length) return [{ json:{ _solo_diag:true, _diag:_diag } }];
return out;
