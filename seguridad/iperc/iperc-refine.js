function openRefineModal(){
  var acts = window._rawActividades;
  if(!acts||!acts.length){showToast('Genera el IPERC primero con IA.');return;}
  var code = window._ipercCode || generateIPERCCode('GEN','');
  window._ipercCode = code;
  // Inicializar revisión si es primera vez
  if (!window._ipercRevision) window._ipercRevision = 1;
  document.getElementById('rfn-code-display').textContent = code;
  // Añadir badge de revisión al header
  var revBadge = document.getElementById('rfn-rev-badge');
  if (!revBadge) {
    revBadge = document.createElement('span');
    revBadge.id = 'rfn-rev-badge';
    revBadge.className = 'rfn-revision-badge';
    var codeEl = document.getElementById('rfn-code-display');
    if (codeEl && codeEl.parentNode) codeEl.parentNode.insertBefore(revBadge, codeEl.nextSibling);
  }
  revBadge.textContent = 'Rev.' + window._ipercRevision;
  var proj = getProj();
  if(proj.elaboro) document.getElementById('rfn-supervisor').value = proj.elaboro;
  renderRefineBody(acts);
  document.getElementById('rfn-overlay').style.display='flex';
  document.body.style.overflow='hidden';
}
function closeRefineModal(){
  document.getElementById('rfn-overlay').style.display='none';
  document.body.style.overflow='';
}
function renderRefineBody(acts){
  var body = document.getElementById('rfn-body');
  var html = '';
  acts.forEach(function(a,i){
    var subs = Array.isArray(a.subpasos) ? a.subpasos : [];
    html += '<div class="rfn-act-card">';
    html += '<div class="rfn-act-hd" onclick="toggleRfnCard('+i+')">';
    html += '<span class="rfn-paso">'+(escHtml(a.paso||String(i+1)))+'</span>';
    html += '<span class="rfn-nombre">'+(escHtml(a.nombre||''))+'</span>';
    html += '<span style="font-size:11px;color:#6b7280">'+subs.length+' subpasos</span></div>';
    html += '<div class="rfn-act-body" id="rfn-card-'+i+'">';
    html += '<div class="rfn-label">Descripcion de la fase</div>';
    html += '<textarea class="rfn-textarea" data-idx="'+i+'" data-field="descripcion" onchange="updateRfnField(this)">'+escHtml(a.descripcion||'')+'</textarea>';
    html += '<div class="rfn-label">Consideraciones previas</div>';
    html += '<textarea class="rfn-textarea" data-idx="'+i+'" data-field="consideraciones" onchange="updateRfnField(this)">'+escHtml(a.consideraciones||'')+'</textarea>';
    html += '<div class="rfn-label">Subpasos</div>';
    subs.forEach(function(s,si){
      html += '<div class="rfn-sub-row">';
      html += '<span class="rfn-sub-paso">'+escHtml(s.paso||String(i+1)+'.'+String(si+1))+'</span>';
      html += '<input class="rfn-sub-input" type="text" data-idx="'+i+'" data-si="'+si+'" value="'+escHtml(s.descripcion||'')+'" onchange="updateRfnSubpaso(this)">';
      html += '</div>';
    });
    html += '<div class="rfn-label">Nota del supervisor (que corregiste o añadiste)</div>';
    html += '<textarea class="rfn-nota-field" data-idx="'+i+'" data-field="nota_supervisor" onchange="updateRfnField(this)" placeholder="Ej: Añadi verificacion de aislamiento como subpaso 3.4"></textarea>';
    // ── PANEL REFINAR CON IA ─────────────────────────────────
    html += '<div class="rfn-ai-panel">';
    html += '<div class="rfn-ai-title">🤖 Refinar esta fase con IA <span style="background:#e0e7ff;color:#3730a3;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:600;text-transform:none;letter-spacing:0">Gemini Flash</span></div>';
    html += '<textarea class="rfn-ai-instr" id="rfn-ai-instr-'+i+'" placeholder="Dile a la IA qué mejorar — ej: &quot;Añade subpasos específicos para LOTO en breaker 440V&quot; o &quot;Necesito más detalle del armado del andamio con puntos de anclaje&quot;"></textarea>';
    html += '<br><button class="rfn-ai-btn" id="rfn-ai-btn-'+i+'" onclick="refineActivityWithAI('+i+')">🤖 Refinar con IA</button>';
    html += '<div class="rfn-ai-log" id="rfn-ai-log-'+i+'"></div>';
    html += '</div>';
    html += '</div></div>';
  });
  // Fingerprint + revisión en el header del body
  var fpHtml = '<div class="rfn-fingerprint">';
  fpHtml += '<span style="font-size:16px">🔏</span>';
  fpHtml += '<span class="rfn-fp-code">' + (window._ipercCode||'—') + '</span>';
  var rev = (window._ipercRevision||1);
  fpHtml += '<span class="rfn-fp-rev">Rev. ' + rev + '</span>';
  fpHtml += '<span class="rfn-fp-ts">' + new Date().toLocaleString('es-MX') + '</span>';
  fpHtml += '</div>';
  body.innerHTML = fpHtml + html;
  window._rfnData = JSON.parse(JSON.stringify(acts));
}
function toggleRfnCard(i){
  var b = document.getElementById('rfn-card-'+i);
  if(b) b.style.display = b.style.display==='none' ? '' : 'none';
}

// ════════════════════════════════════════════════════════════
// REFINAR ACTIVIDAD CON IA — el corazón del sistema de huella
// ════════════════════════════════════════════════════════════
async function refineActivityWithAI(actIdx) {
  if (!GEMINI_KEY) { showToast('Necesitas API key de Gemini.'); return; }
  var act = window._rfnData && window._rfnData[actIdx];
  if (!act) { showToast('Actividad no encontrada.'); return; }

  var instrEl = document.getElementById('rfn-ai-instr-' + actIdx);
  var instr = instrEl ? instrEl.value.trim() : '';
  if (!instr) { showToast('Escribe qué quieres mejorar en esta fase.'); return; }

  var btn = document.getElementById('rfn-ai-btn-' + actIdx);
  var log = document.getElementById('rfn-ai-log-' + actIdx);
  btn.textContent = '⏳ Refinando...';
  btn.disabled = true;
  log.textContent = 'Enviando a Gemini...';

  var proj = getProj();
  var workCtx = (proj.trabajo||'') + ' ' + (act.nombre||'') + ' ' + (proj.area||'');
  var knowledgeCtx = buildKnowledgeContext(workCtx);

  var subpasosTxt = (act.subpasos||[]).map(function(s){
    return s.paso + '. ' + s.descripcion;
  }).join('\n');

  var prompt =
`Eres un Supervisor Senior de Instalaciones Industriales con 20 años de experiencia en plantas activas en México.

IPERC EN REFINAMIENTO: ${window._ipercCode||"—"} (Rev.${window._ipercRevision||1})
Cliente: ${proj.cliente||""}
Trabajo: ${proj.trabajo||""}
Área: ${proj.area||""}

FASE A MEJORAR:
Paso: ${act.paso||""}
Nombre: ${act.nombre||""}
Descripción actual:
${act.descripcion||""}

Consideraciones actuales:
${act.consideraciones||""}

Subpasos actuales:
${subpasosTxt}

INSTRUCCIÓN ESPECÍFICA DEL SUPERVISOR:
"${instr}"

${knowledgeCtx ? knowledgeCtx + "\n\n" : ""}REGLAS DE RESPUESTA:
1. Conserva los subpasos existentes que ya están bien descritos
2. Mejora, expande o añade subpasos según lo que pide el supervisor
3. Cada subpaso debe incluir: acción física + herramienta/equipo específico + condición del sitio + riesgo implícito
4. Mínimo 4 subpasos por fase
5. Usa MAYÚSCULAS para nombres de equipos y normas
6. Mantén numeración del paso base: ${act.paso||"X"}.1, ${act.paso||"X"}.2, etc.

Responde SOLO con JSON válido sin markdown:
{"descripcion":"...","consideraciones":"...","subpasos":[{"paso":"${act.paso||"X"}.1","descripcion":"..."}]}`;
  try {
    log.textContent = 'Gemini analizando...';
    // Groq para refinamiento individual — texto puro
    var result = GROQ_KEY
      ? await callGroq(prompt, 3000)
      : await callGemini([{text: prompt}], 3000);
    var clean = result.replace(/```json[\s\S]*?```|```[\s\S]*?```/g, function(m){
      return m.replace(/```json|```/g,'');
    }).trim();
    var parsed = JSON.parse(clean);

    // Actualizar _rfnData
    if (parsed.descripcion) window._rfnData[actIdx].descripcion = parsed.descripcion;
    if (parsed.consideraciones) window._rfnData[actIdx].consideraciones = parsed.consideraciones;
    if (Array.isArray(parsed.subpasos) && parsed.subpasos.length)
      window._rfnData[actIdx].subpasos = parsed.subpasos;

    // Bump revisión
    window._ipercRevision = (window._ipercRevision || 1) + 1;
    // Actualizar badge de revisión en fingerprint del modal Y del preview
    var fpRev = document.querySelector('.rfn-fp-rev');
    if (fpRev) fpRev.textContent = 'Rev. ' + window._ipercRevision;
    var previewRev = document.getElementById('preview-rev-badge');
    if (previewRev) previewRev.textContent = 'Rev.' + window._ipercRevision;

    // Actualizar DOM de la card sin re-render completo
    _updateRfnCardDOM(actIdx);
    if (instrEl) instrEl.value = '';
    log.textContent = '✅ Refinado — Rev.' + window._ipercRevision + ' guardada en memoria';
    showToast('✅ Fase ' + act.paso + ' refinada. Recuerda guardar el refinamiento.');
  } catch(e) {
    log.textContent = '❌ Error: ' + (e.message||String(e));
    showToast('Error al refinar: ' + (e.message||String(e)));
  } finally {
    btn.textContent = '🤖 Refinar con IA';
    btn.disabled = false;
  }
}

function _updateRfnCardDOM(idx) {
  var act = window._rfnData[idx];
  if (!act) return;
  // Actualizar textareas de descripcion y consideraciones
  var descTA = document.querySelector('.rfn-textarea[data-idx="'+idx+'"][data-field="descripcion"]');
  var consTA = document.querySelector('.rfn-textarea[data-idx="'+idx+'"][data-field="consideraciones"]');
  if (descTA) descTA.value = act.descripcion || '';
  if (consTA) consTA.value = act.consideraciones || '';
  // Re-render los subpasos de esa card
  var subs = act.subpasos || [];
  var card = document.getElementById('rfn-card-' + idx);
  if (!card) return;
  // Encontrar el div de subpasos y reemplazarlo
  var subRows = card.querySelectorAll('.rfn-sub-row');
  subRows.forEach(function(r){ r.remove(); });
  var subLabel = card.querySelector('.rfn-label:nth-of-type(3)');
  var insertAfter = subLabel || card.firstChild;
  subs.forEach(function(s, si) {
    var row = document.createElement('div');
    row.className = 'rfn-sub-row';
    row.innerHTML =
      '<span class="rfn-sub-paso">'+escHtml(s.paso||idx+'.'+si)+'</span>' +
      '<input class="rfn-sub-input" type="text" data-idx="'+idx+'" data-si="'+si+'" ' +
        'value="'+escHtml(s.descripcion||'')+'" onchange="updateRfnSubpaso(this)">';
    if (subLabel && subLabel.nextSibling) {
      card.insertBefore(row, subLabel.nextSibling);
    } else {
      card.appendChild(row);
    }
  });
}
function updateRfnField(el){
  var idx = parseInt(el.dataset.idx);
  var field = el.dataset.field;
  if(!window._rfnData||!window._rfnData[idx]) return;
  window._rfnData[idx][field] = el.value;
}
function updateRfnSubpaso(el){
  var idx = parseInt(el.dataset.idx);
  var si = parseInt(el.dataset.si);
  if(!window._rfnData||!window._rfnData[idx]||!window._rfnData[idx].subpasos) return;
  window._rfnData[idx].subpasos[si].descripcion = el.value;
}
async function saveCurrentRefinement(){
  var status = document.getElementById('rfn-status');
  var supervisor = document.getElementById('rfn-supervisor').value.trim();
  if(!supervisor){showToast('Escribe el nombre del supervisor que refina.');return;}
  var code = window._ipercCode;
  var proj = getProj();
  var cid = (_selectedClient&&_selectedClient.id) ? _selectedClient.id : 'general';
  var payload = {
    code: code,
    cliente: cid,
    trabajo: proj.trabajo||'Sin descripcion',
    area: proj.area||'',
    fecha: new Date().toISOString().slice(0,10),
    supervisor: supervisor,
    refinado: true,
    revision: window._ipercRevision || 1,
    original: window._rawActividades || [],
    refined: window._rfnData || [],
    notas: (window._rfnData||[]).map(function(a){return {paso:a.paso,nota:a.nota_supervisor||''};}).filter(function(n){return n.nota;})
  };
  status.textContent = 'Guardando en GitHub...';
  var ok = await saveRefinement(payload);
  if(ok){
    status.textContent = 'Refinamiento guardado — codigo: ' + code;
    showToast('Refinamiento guardado. El proximo IPERC similar usara esto como referencia.');
  } else {
    status.textContent = 'Error al guardar. Verifica el token GitHub en configuracion.';
  }
}
function applyRefinementToIPERC(){
  if(!window._rfnData){showToast('Nada que aplicar.');return;}
  window._rawActividades = JSON.parse(JSON.stringify(window._rfnData));
  window._activityDescriptions = {};
  window._rawActividades.forEach(function(a){
    var tag = a.nombre||a.paso;
    var subDesc = Array.isArray(a.subpasos) ? a.subpasos.map(function(s){return s.paso+'. '+s.descripcion;}).join('\n') : '';
    window._activityDescriptions[tag] = (a.descripcion||'') + (subDesc ? '\n\n'+subDesc : '');
  });
  renderActPreview(window._rawActividades);
  closeRefineModal();
  showToast('Actividades refinadas aplicadas al IPERC.');
}


// ════════════════════════════════════════════════════
// STEP 2B — REFINAMIENTO DEL PLAN
// ════════════════════════════════════════════════════

// Alias de compatibilidad → usa renderActPreview
function renderRefinePlanCards(){
  renderActPreview(window._rawActividades || []);
  const apDiv=document.getElementById('activities-preview');
  if(apDiv) apDiv.style.display='block';
  return; // el resto ya no aplica
  const container = document.getElementById('refine-act-list'); // dead code, kept for safety
  if(!container) return;
  if(!acts.length){
    container.innerHTML='<div class="alert alert-warn"><span>⚠️</span><div>Regresa al paso anterior y detecta actividades primero.</div></div>';
    return;
  }
  container.innerHTML = acts.map((a,i)=>{
    const subs = Array.isArray(a.subpasos)?a.subpasos:[];
    const subsHTML = subs.map(s=>
      `<div style="display:flex;gap:6px;margin-bottom:4px">
        <span style="font-size:10px;font-weight:700;color:var(--o);min-width:28px">${s.paso}</span>
        <span style="font-size:11px;color:var(--muted2);line-height:1.5">${escHtml(s.descripcion||'')}</span>
      </div>`
    ).join('');
    return `<div class="act-prev-card" id="rfc-${i}">
      <div class="act-prev-hd" onclick="this.nextElementSibling.classList.toggle('open')">
        <div class="act-prev-num">${escHtml(a.paso||String(i+1))}</div>
        <div class="act-prev-title">${escHtml(a.nombre||'Actividad '+(i+1))}</div>
        <span style="color:var(--muted);font-size:12px">▾</span>
      </div>
      <div class="act-prev-body open">
        ${a.consideraciones?`<div style="background:rgba(234,179,8,.08);border:1px solid rgba(234,179,8,.3);border-radius:6px;padding:6px 9px;margin-bottom:6px;font-size:11px;color:var(--yellow)">⚠️ <strong>Antes de iniciar:</strong> ${escHtml(a.consideraciones)}</div>`:''}
        <div style="font-size:11px;color:var(--text);line-height:1.6;margin-bottom:8px">${escHtml(a.descripcion||'')}</div>
        ${subs.length?`<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin:4px 0"># Subpasos</div>${subsHTML}`:''}
      </div>
    </div>`;
  }).join('');
}

// Prompt #2: Refinar el plan con instrucciones del supervisor
async function doRefinePlan(){
  const instruccion = (document.getElementById('refine-plan-text')?.value||'').trim();
  if(!instruccion){ showToast('⚠️ Escribe o dicta qué quieres ajustar en el plan'); return; }
  if(!window._rawActividades?.length){ showToast('⚠️ Genera el plan primero con "Simular Plan con IA"'); return; }

  const btn=document.getElementById('btn-do-refine');
  const spinner=document.getElementById('refine-plan-spinner');
  const statusLbl=document.getElementById('refine-status-lbl');

  // UI loading
  window._geminiCancelled = false;
  if(btn){ btn.disabled=true; btn.textContent='⏳ Procesando…'; }
  if(spinner) spinner.style.display='flex';
  if(statusLbl) statusLbl.textContent='⏳ Refinando plan con IA…';

  try{
    const planActual=JSON.stringify({actividades:window._rawActividades}); // compacto — menos tokens
    const knowledgeCtxRefine=buildKnowledgeContext(instruccion); // KB solo de instrucción
    const proj=getProj();

    const prompt=
`Eres un Supervisor Senior de Instalaciones Industriales con 25 años de experiencia en México.
Recibes INSTRUCCIONES del supervisor de campo — pueden estar en lenguaje informal o incompleto.
Tu trabajo: interpretar la instrucción y aplicar los cambios al plan de ejecución.

CONTEXTO DEL PROYECTO:
Cliente: ${proj.cliente||'—'} | Area: ${proj.area||'—'} | Trabajo: ${proj.trabajo||'—'}

PLAN ACTUAL (JSON):
${planActual}

INSTRUCCION DEL SUPERVISOR:
"${instruccion}"

REGLAS:
1. Aplica EXACTAMENTE lo que pide — si dice "andamio de 6m" usa ese termino en los subpasos
2. Si menciona equipos, marcas, voltajes, diametros → incorpora esos datos donde corresponda
3. Si pide agregar un paso → crealo en la fase correcta
4. Si pide reordenar → reordena manteniendo logica de ejecucion
5. No elimines fases a menos que se pida explicitamente
6. Enriquece CONSIDERACIONES con NOMs y EPP especificos
7. Cada subpaso: accion + herramienta + quien + condicion del sitio
8. Minimo 4 subpasos por fase
9. NO incluyas valores FINE (C, E, P)

${knowledgeCtxRefine ? knowledgeCtxRefine + '\n\n' : ''}RESPONDE SOLO con JSON valido (sin markdown, sin texto extra):
{"actividades":[{"paso":"1","nombre":"NOMBRE","descripcion":"...","consideraciones":"...","subpasos":[{"paso":"1.1","descripcion":"..."}]}]}`;

    // Groq para refinamiento — puro texto, sin archivos
    const result = GROQ_KEY
      ? await callGroq(prompt, 5000, statusLbl)
      : await callGemini([{text:prompt}], 4000, statusLbl);
    const raw=result.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim();
    const parsed=JSON.parse(raw);
    const acts=parsed.actividades||parsed;

    if(Array.isArray(acts)&&acts.length){
      window._rawActividades=acts;
      // Actualizar descriptions
      acts.forEach(a=>{
        const tag=(a.paso?a.paso+'. ':'')+(a.nombre||'');
        const fullDesc=[
          a.descripcion||'',
          a.consideraciones?'Consideraciones: '+a.consideraciones:'',
          Array.isArray(a.subpasos)?a.subpasos.map(s=>s.paso+'. '+s.descripcion).join('\n'):''
        ].filter(Boolean).join('\n\n');
        window._activityDescriptions[tag]=fullDesc;
      });
      // Re-render preview
      renderActPreview(acts);
      const apDiv=document.getElementById('activities-preview');
      if(apDiv) apDiv.style.display='block';
      // Historial
      const hist=document.getElementById('refine-history');
      if(hist){
        const entry=document.createElement('div');
        entry.style.cssText='border-top:1px solid var(--border);padding:3px 0;margin-top:3px;font-size:11px;color:var(--muted2)';
        entry.textContent='✅ '+new Date().toLocaleTimeString()+' — '+instruccion.substring(0,60)+(instruccion.length>60?'…':'');
        hist.insertBefore(entry,hist.firstChild);
      }
      const ta=document.getElementById('refine-plan-text');
      if(ta) ta.value='';
      if(statusLbl) statusLbl.textContent='✅ Plan actualizado — puedes seguir ajustando o continuar';
      showToast('✅ Plan refinado con '+acts.length+' fases',2500);
    } else {
      showToast('⚠️ La IA no devolvio actividades válidas',4000);
      if(statusLbl) statusLbl.textContent='⚠️ Sin cambios — intenta de nuevo';
    }
  }catch(err){
    console.error('doRefinePlan error:',err);
    const emsg=err.message||String(err);
    if(/CANCELADO/i.test(emsg)) return; // UI ya restaurada por cancelGemini()
    const isRateErr  =/RATE_AGOTADO/i.test(emsg);
    const isDailyErr =/CUOTA_DIARIA/i.test(emsg);
    const isKeyErr   =/KEY_REVOCADA/i.test(emsg);
    const toast = isDailyErr ? '📵 Cuota diaria agotada — resetea 2am hora MX'
                : isRateErr  ? '⏱️ Límite por minuto agotado — espera 1–2 min'
                : isKeyErr   ? '🔑 API Key inválida — actualiza tu key'
                : '⚠️ '+emsg.substring(0,100);
    showToast(toast, 8000);
    if(statusLbl) statusLbl.textContent = isDailyErr
      ? '📵 Cuota diaria de Gemini agotada (1,500 req/día). Resetea a las 2am hora MX. Para uso intensivo considera el plan de pago.'
      : isRateErr ? '⏱️ Límite por minuto agotado tras 3 reintentos — espera 1–2 min y vuelve a intentar'
      : isKeyErr  ? '🔑 API Key inválida — abre ⚙️ Configuración'
      : '⚠️ Error: '+emsg.substring(0,120);
  }finally{
    if(btn){ btn.disabled=false; btn.textContent='🔄 Aplicar refinamiento'; }
    if(spinner) spinner.style.display='none';
  }
}


// Voz para refinamiento del plan
let _refinePlanRecorder=null, _refinePlanChunks=[];
async function toggleRefinePlanVoice(){
  const btn=document.getElementById('refine-voice-plan-btn');
  const status=document.getElementById('refine-voice-plan-status');
  if(_refinePlanRecorder&&_refinePlanRecorder.state==='recording'){
    _refinePlanRecorder.stop(); return;
  }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    _refinePlanChunks=[];
    _refinePlanRecorder=new MediaRecorder(stream);
    _refinePlanRecorder.ondataavailable=e=>_refinePlanChunks.push(e.data);
    _refinePlanRecorder.onstop=async()=>{
      stream.getTracks().forEach(t=>t.stop());
      if(btn) btn.textContent='🎤';
      if(status) status.style.display='none';
      const blob=new Blob(_refinePlanChunks,{type:'audio/webm'});
      showToast('🎤 Transcribiendo…',1500);
      try{
        const b64=await new Promise(res=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.readAsDataURL(blob);});
        const resp=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key='+GEMINI_KEY,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({contents:[{parts:[
            {text:'Transcribe este audio exactamente. Solo devuelve el texto, sin explicaciones.'},
            {inlineData:{mimeType:'audio/webm',data:b64}}
          ]}]})
        });
        const d=await resp.json();
        const txt=d.candidates?.[0]?.content?.parts?.[0]?.text||'';
        if(txt){
          const ta=document.getElementById('refine-plan-text');
          if(ta) ta.value=txt; // sobreescribe (no acumula) para que el próximo refinamiento sea limpio
          showToast('🎤 Instrucción capturada — aplicando refinamiento…',1500);
          // Auto-disparar refinamiento si ya hay un plan generado
          if(window._rawActividades?.length){
            setTimeout(()=>doRefinePlan(), 400);
          }
        }
      }catch(e){showToast('⚠️ Error al transcribir',3000);}
    };
    _refinePlanRecorder.start();
    if(btn) btn.textContent='⏹';
    if(status) status.style.display='flex';
  }catch(e){showToast('⚠️ Sin acceso al micrófono',3000);}
}

// ════════════════════════════════════════════════════
// STEP 3 — RISK ADVISOR (IA revisa el análisis)
// ════════════════════════════════════════════════════
function toggleRiskAdvisor(){
  const body=document.getElementById('risk-advisor-body');
  const arrow=document.getElementById('risk-advisor-arrow');
  if(!body) return;
  const open=body.style.display!=='none';
  body.style.display=open?'none':'block';
  if(arrow) arrow.style.transform=open?'':'rotate(180deg)';
}

let _riskAdvisorRecorder=null, _riskAdvisorChunks=[];
async function toggleRiskAdvisorVoice(){
  const btn=document.getElementById('risk-advisor-voice');
  const status=document.getElementById('risk-advisor-voice-status');
  if(_riskAdvisorRecorder&&_riskAdvisorRecorder.state==='recording'){
    _riskAdvisorRecorder.stop(); return;
  }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    _riskAdvisorChunks=[];
    _riskAdvisorRecorder=new MediaRecorder(stream);
    _riskAdvisorRecorder.ondataavailable=e=>_riskAdvisorChunks.push(e.data);
    _riskAdvisorRecorder.onstop=async()=>{
      stream.getTracks().forEach(t=>t.stop());
      if(btn) btn.textContent='🎤';
      if(status) status.style.display='none';
      const blob=new Blob(_riskAdvisorChunks,{type:'audio/webm'});
      showToast('🎤 Transcribiendo…',1500);
      try{
        const b64=await new Promise(res=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.readAsDataURL(blob);});
        const resp=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key='+GEMINI_KEY,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({contents:[{parts:[
            {text:'Transcribe este audio exactamente. Solo devuelve el texto.'},
            {inlineData:{mimeType:'audio/webm',data:b64}}
          ]}]})
        });
        const d=await resp.json();
        const txt=d.candidates?.[0]?.content?.parts?.[0]?.text||'';
        if(txt){
          const ta=document.getElementById('risk-advisor-text');
          if(ta) ta.value=txt;
          showToast('🎤 Consultando al advisor…',1500);
          setTimeout(()=>askRiskAdvisor(), 400);
        }
      }catch(e){showToast('⚠️ Error al transcribir',3000);}
    };
    _riskAdvisorRecorder.start();
    if(btn) btn.textContent='⏹';
    if(status) status.style.display='flex';
  }catch(e){showToast('⚠️ Sin acceso al micrófono',3000);}
}

async function askRiskAdvisor(){
  const pregunta=(document.getElementById('risk-advisor-text')?.value||'').trim();
  if(!pregunta){showToast('⚠️ Escribe tu pregunta o usa el micrófono');return;}
  const btn=document.getElementById('btn-risk-advisor');
  const resp=document.getElementById('risk-advisor-response');
  btn.textContent='⏳ Consultando…'; btn.disabled=true;
  resp.style.display='none';

  // Construir resumen del IPERC actual
  const rows=window._rows||[];
  const resumenRiesgos=rows.map((r,i)=>
    `${i+1}. [${r.tipo}] ${r.riesgo} | Consec: ${r.consec||'—'} | C=${r.c} E=${r.e} P=${r.p} GR=${r.c*r.e*r.p} | Controles: ${r.admin||'—'} | EPP: ${r.epp||'—'} | GR residual=${r.c2*r.e2*r.p2}`
  ).join('\n');
  const acts=(window._rawActividades||[]).map(a=>`${a.paso}. ${a.nombre}`).join(', ');
  const proj=getProj();

  // Construir resumen de la KB activa (NOMs y categorías)
  const kbResumen = Object.entries(KB).map(([nombre,data])=>
    `• ${nombre} [${(data.noms||[]).join(', ')}]: ${(data.risks||[]).length} riesgos base`
  ).join('\n');

  // Knowledge blocks normativos aplicables al trabajo
  const workText = (document.getElementById('scope-text')?.value||'') + ' ' + acts;
  const knowledgeCtxAdvisor = buildKnowledgeContext(workText);

  const prompt=
`Eres un experto en seguridad industrial con dominio avanzado en:
- NOM-STPS: 001 (edificios), 004 (LOTO), 006 (andamios), 009 (alturas), 011 (ruido), 017 (EPP), 022 (electricidad), 026 (colores), 027 (soldadura), 029 (electricidad mantenimiento), 031 (construcción), 033 (espacios confinados)
- OSHA 1910 (industria general) y OSHA 1926 (construcción): 1910.147 (LOTO), 1910.269 (alta tensión), 1910.332 (seguridad eléctrica), 1926.502 (protección caídas), 1926.417 (LOTO construcción)
- NFPA 70E: Arc Flash, categorías PPE, análisis de energía incidente
- Método FINE: C×E×P, niveles de riesgo (>400 Inminente, 200-400 Alto, 70-200 Notable, 20-70 Moderado, <20 Aceptable)
- Jerarquía de controles OSHA: Eliminación → Sustitución → Controles de ingeniería → Controles administrativos → EPP

PROYECTO:
Cliente: ${proj.cliente||'—'} | Área: ${proj.area||'—'} | Trabajo: ${proj.trabajo||'—'}

ACTIVIDADES DEL PLAN:
${acts}

ANÁLISIS DE RIESGOS ACTUAL (${rows.length} riesgos):
${resumenRiesgos||'Sin riesgos generados todavía'}

BASE DE CONOCIMIENTO ACTIVA (NOMs por categoría):
${kbResumen}

${knowledgeCtxAdvisor ? knowledgeCtxAdvisor + '\n\n' : ''}PREGUNTA / INSTRUCCIÓN DEL SUPERVISOR:
"${pregunta}"

INSTRUCCIONES DE RESPUESTA:
- Sé directo y práctico — el supervisor está en campo
- Si detectas riesgos FALTANTES: menciónalos con su NOM/OSHA y sugiere valores FINE iniciales recomendados (C, E, P)
- Si hay valores FINE INCORRECTOS: explica por qué y sugiere el valor correcto con justificación
- Si los CONTROLES son insuficientes: sugiere controles adicionales jerarquizados (ingeniería > admin > EPP)
- Si hay EPP incompleto: especifica exactamente qué falta (norma, clase, certificación)
- Máximo 250 palabras. Usa viñetas para listar hallazgos.`;

  try{
    // Groq para análisis NOM/OSHA — texto puro, ideal para Groq
    const result = GROQ_KEY
      ? await callGroq(prompt, 3000)
      : await callGemini([{text:prompt}], 3000);
    resp.textContent=result;
    resp.style.display='block';
  }catch(e){
    resp.textContent='⚠️ Error al consultar la IA: '+e.message;
    resp.style.display='block';
  }finally{
    btn.textContent='💡 Pedir sugerencia a la IA';
    btn.disabled=false;
  }
}

// ── Toggle card Datos del Proyecto ──
function toggleProyectoCard(){
  const body = document.getElementById('proyecto-card-body');
  const arrow = document.getElementById('proyecto-arrow');
  if(!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if(arrow) arrow.style.transform = isOpen ? 'rotate(-90deg)' : '';
}
function toggleAjustePanel(){
  const body  = document.getElementById('ajuste-body');
  const arrow = document.getElementById('ajuste-arrow');
  if(!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if(arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
}
function _populateCrActSelect(){
  const sel = document.getElementById('cr-act');
  if(!sel) return;
  sel.innerHTML = '';
  const acts = (state.activities||[]).filter(a=>a.on);
  if(acts.length){
    acts.forEach(a => {
      const o = document.createElement('option');
      o.value = a.name; o.textContent = a.name.substring(0,60);
      sel.appendChild(o);
    });
  } else {
    const o = document.createElement('option'); o.value='General'; o.textContent='General';
    sel.appendChild(o);
  }
}
// ── Toggle panel Knowledge Base (engrane) ──
function toggleKbPanel(){
  const panel = document.getElementById('kb-panel');
  if(!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}


// ── Voz para refinamiento ──
let _refineMediaRecorder = null;
let _refineAudioChunks = [];
async function toggleRefineVoice(){
  const btn = document.getElementById('refine-voice-btn');
  const status = document.getElementById('refine-voice-status');
  if(_refineMediaRecorder && _refineMediaRecorder.state === 'recording'){
    _refineMediaRecorder.stop();
    return;
  }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    _refineAudioChunks = [];
    _refineMediaRecorder = new MediaRecorder(stream);
    _refineMediaRecorder.ondataavailable = e => _refineAudioChunks.push(e.data);
    _refineMediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t=>t.stop());
      if(btn) btn.textContent='🎤';
      if(status) status.style.display='none';
      const blob = new Blob(_refineAudioChunks, {type:'audio/webm'});
      showToast('🎤 Transcribiendo nota de voz…',2000);
      try{
        const base64 = await new Promise(res=>{
          const r = new FileReader();
          r.onload = ()=>res(r.result.split(',')[1]);
          r.readAsDataURL(blob);
        });
        const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key='+GEMINI_KEY,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({contents:[{parts:[
            {text:'Transcribe exactamente este audio. Solo devuelve el texto transcrito, sin explicaciones.'},
            {inlineData:{mimeType:'audio/webm',data:base64}}
          ]}]})
        });
        const d = await resp.json();
        const transcript = d.candidates?.[0]?.content?.parts?.[0]?.text||'';
        if(transcript){
          // Pre-llenar el modal de refinamiento con la nota de voz
          openRefineModal();
          setTimeout(()=>{
            const notaEl = document.getElementById('rfn-nota-global');
            if(notaEl){notaEl.value = transcript; notaEl.dispatchEvent(new Event('input'));}
            else{
              // Llenar el primer campo de nota disponible
              document.querySelectorAll('.rfn-nota-field').forEach((el,i)=>{if(i===0) el.value=transcript;});
            }
            showToast('✅ Nota de voz lista en el modal',2000);
          },400);
        }
      }catch(e){showToast('⚠️ Error transcribiendo audio',3000);}
    };
    _refineMediaRecorder.start();
    if(btn) btn.textContent='⏹';
    if(status) status.style.display='flex';
  }catch(e){showToast('⚠️ No se pudo acceder al micrófono',3000);}
}

