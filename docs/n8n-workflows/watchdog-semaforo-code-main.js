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
// --- TZ ----------------------------------------------------------------------
// Toda la aritmetica de dias opera en hora de MONTERREY (UTC-6, sin DST desde 2022).
// El contenedor n8n corre en UTC (medido 2026-08-09: reconstruyendo el snapshot 2026-07-24,
// solo offset 0 lo reproduce 23/23; -4h/-5h/-6h dan 10/23). settings.timezone del workflow
// NO aplica a getHours()/setDate() de un Code node, por eso se normaliza a mano.
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
// Granularidad de DIA -> el resultado NO depende de la hora de captura.
// (business_day_start_hour / business_day_cutoff_hour quedan sin uso.)
function bizDays(ds){ const w=mtyWall(ds); if(!w) return null;
  let c=nextBizDay(w), n=0; while(c <= todayDay){ n++; c=nextBizDay(c); } return n; }
function lastBy(node, filt){ const m={}; for(const it of $(node).all()){ const r=it.json; if(filt && !filt(r)) continue;
  const rid=r.res_id; if(!m[rid] || new Date(r.date) > new Date(m[rid].date)) m[rid]=r; } return m; }
const lastStageMsg = lastBy('Odoo - getAll msg94');
// --- Notas: normalizacion, GUARD de vacias, y deteccion de repetidas --------
// Una nota cuyo body normalizado queda vacio NO es seguimiento valido: no entra al
// calculo del semaforo B ni a la comparacion de similitud. Levanta bandera nota_vacia.
function normNota(h){ return String(h==null?'':h)
  .replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/\s+/g,' ').trim(); }
function bigr(s){ const g=new Set(); for(let i=0;i<s.length-1;i++) g.add(s.slice(i,i+2)); return g; }
function simil(a,b){ if(a===b) return 1; if(!a.length||!b.length) return 0;
  const A=bigr(a), B=bigr(b); let x=0; for(const k of A) if(B.has(k)) x++;
  return (2*x)/(A.size+B.size); }
const notasProj = {}, vaciasProj = {};
for(const it of $('Odoo - getAll msgComment').all()){ const m=it.json;
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
const matSO = {}; for(const it of $('Odoo - getAll SO').all()){ matSO[it.json.id] = (C.materiales_values||[]).includes(it.json.x_studio_product_type); }
const termDays = {}; for(const it of $('Odoo - getAll termlines').all()){ const t=m2o(it.json.payment_id); termDays[t]=Math.max(termDays[t]||0, Number(it.json.nb_days)||0); }
const partnerTerm = {}; for(const it of $('Odoo - getAll partners').all()){ partnerTerm[it.json.id] = it.json.property_payment_term_id ? m2o(it.json.property_payment_term_id) : null; }
const trkByMsg = {}; for(const it of $('Odoo - getAll trackingVals').all()){ trkByMsg[m2o(it.json.mail_message_id)] = it.json; }
const flagsByProj = {}; function addFlag(rid,f){ (flagsByProj[rid]=flagsByProj[rid]||[]).push(f); }
for(const it of $('Odoo - getAll trackedMsgs').all()){ const m=it.json; const t=trkByMsg[m.id]; if(!t) continue; const au=m2o(m.author_id); const aun=Array.isArray(m.author_id)?m.author_id[1]:''; const fid=m2o(t.field_id);
  if(fid===FF && t.old_value_datetime && !COM.includes(au)) addFlag(m.res_id,{tipo:'fecha_fin', detalle:'Fecha fin movida por '+aun+' (no Comercial)', fecha:m.date});
  if(fid===FS && SEQ[t.new_value_integer]!=null && SEQ[t.old_value_integer]!=null && SEQ[t.new_value_integer] < SEQ[t.old_value_integer]) addFlag(m.res_id,{tipo:'stage_atras', detalle:'Stage regresado '+t.old_value_char+' -> '+t.new_value_char+' por '+aun, fecha:m.date}); }
const attMime = {}; for(const it of $('Odoo - getAll attachments').all()){ attMime[it.json.id]= it.json.mimetype||''; }
function norm(s){ return String(s||'').replace(/<[^>]*>/g,' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
const apTpl = norm(AP.template);
const apOk = {};
for(const it of $('Odoo - getAll msgComment').all()){ const m=it.json; if(apTpl && norm(m.body).includes(apTpl)){ const hasImg=(m.attachment_ids||[]).some(a=>(attMime[a]||'').startsWith('image/')); if(!AP.requiere_imagen || hasImg) apOk[m.res_id]=true; } }
function colorOf(d,r){ if(d==null||r==null) return 'verde'; if(d>=r) return 'rojo'; if(d>=Math.max(r-1,1)) return 'amarillo'; return 'verde'; }
function rojoCredito(p){ const t=partnerTerm[m2o(p.partner_id)]; const d=(t&&termDays[t]!=null)?termDays[t]:C.credit_fallback_days; return d + C.credit_extra_days; }
const ORD={verde:0,amarillo:1,rojo:2}; const out=[];
for(const it of $('Odoo - getAll projects').all()){ const p=it.json; const sid=m2o(p.stage_id); if(sid==null||EXCL.includes(sid)) continue; const sc=STG[String(sid)]; if(!sc) continue;
  const esMat = p.sale_order_id ? !!matSO[m2o(p.sale_order_id)] : false;
  const ls=lastStageMsg[p.id]; const diasEnStage = ls?bizDays(ls.date):(p.create_date?bizDays(p.create_date):null);
  const lc=lastComment[p.id];
  const sinNotaValida = !lc;   // ninguna nota con contenido -> el delta viene de create_date
  const diasSinSeg = lc?bizDays(lc.date):(p.create_date?bizDays(p.create_date):null);
  const oEn = (esMat && MAT[sid] && MAT[sid].en_stage) ? MAT[sid].en_stage : sc.en_stage;
  const oSeg = (esMat && MAT[sid] && MAT[sid].sin_seguimiento) ? MAT[sid].sin_seguimiento : sc.sin_seguimiento;
  let colA;
  if(oEn.modo==='due_date'){ if(!p.date){ colA=colorOf(diasEnStage, C.in_progress_fallback_dias); } else { const due=new Date(p.date); const ama=new Date(due.getTime()-(C.in_progress_amarillo_dias_habiles||3)*86400000); colA = today>=due?'rojo':(today>=ama?'amarillo':'verde'); } }
  else if(oEn.modo==='credito'){ colA=colorOf(diasEnStage, rojoCredito(p)); }
  else { colA=colorOf(diasEnStage, oEn.rojo_dias); }
  // colB con el criterio VIGENTE del stage (ya uniformado a la regla diaria)
  const evalSeg = o => (o.modo==='credito') ? colorOf(diasSinSeg, rojoCredito(p)) : colorOf(diasSinSeg, o.rojo_dias);
  const colBNuevo = evalSeg(oSeg);
  // OBSERVACION: mientras dure, el stage sigue puntuando con su criterio PREVIO en
  // bloques/contadores/KPI; el veredicto nuevo viaja aparte para la seccion dedicada.
  const enObs = (OBS.stages||[]).includes(sid) && (!OBS.hasta || hoyISO <= OBS.hasta);
  const oPrev = enObs ? ((OBS.sin_seguimiento_previo||{})[String(sid)] || oSeg) : oSeg;
  let colB = enObs ? evalSeg(oPrev) : colBNuevo;
  let col = ORD[colA]>=ORD[colB]?colA:colB;
  if(p.last_update_status==='off_track') col='rojo'; else if(p.last_update_status==='at_risk' && col==='verde') col='amarillo';
  if((AP.aplica_stages||[]).includes(sid) && !apOk[p.id]) addFlag(p.id,{tipo:'ap_sin_confirmacion', detalle:'En plazo de credito SIN confirmacion AP documentada (falta log note + pantallazo)'});
  if(vaciasProj[p.id]) addFlag(p.id,{tipo:'nota_vacia', detalle:vaciasProj[p.id]+' log note(s) sin contenido en el chatter - no cuentan como seguimiento'});
  if(HOLD_ST.includes(sid)){ const fr=p.date;
    if(!fr) addFlag(p.id,{tipo:'hold_sin_fecha_vigente', detalle:'En Hold SIN fecha de reactivacion capturada'});
    else if(String(fr) < hoyISO) addFlag(p.id,{tipo:'hold_sin_fecha_vigente', detalle:'En Hold con fecha de reactivacion VENCIDA ('+fr+')'}); }
  // SEGUIMIENTO SIN AVANCE: nota repetida sostenida sobre un proyecto que no avanza.
  // Las notas vacias ya fueron descartadas arriba, asi que no pueden disparar esto.
  const racha = rachaProj[p.id] || 0;
  const sinAvance = (racha >= RACHA_MIN) && ((diasEnStage != null && diasEnStage > SA_DIAS) || colA !== 'verde');
  out.push({ json:{ id:p.id, name:p.name, stage_id:sid, stage:sc.label, grupo:sc.grupo, cliente: p.partner_id?p.partner_id[1]:'', es_materiales:esMat, dias_en_stage:diasEnStage, dias_sin_seguimiento:diasSinSeg, color_a:colA, color_b:colB, color:col, banderas: flagsByProj[p.id]||[], sin_nota_valida:sinNotaValida, racha_nota:(rachaProj[p.id]||0), sin_avance:sinAvance, en_observacion:enObs, color_b_nuevo:colBNuevo, link_odoo:'https://serviciosfts.odoo.com/web#id='+p.id+'&model=project.project&view_type=form' } }); }
return out;