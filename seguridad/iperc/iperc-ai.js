// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// FTS-FILE-ID: iperc-ai-R6-20260313
// Verificar: window.FTS_AI_BUILD en consola del browser
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
window.FTS_AI_BUILD = 'iperc-ai-R6-20260313';

// ═══════════════════════════════════════════════════════
// REPARACIÓN DE JSON TRUNCADO (compartida: riesgos + actividades)
// ═══════════════════════════════════════════════════════
function repairJSON(str) {
  // 1. Parse directo
  try { return JSON.parse(str); } catch(e) {}

  // 2. Buscar estructura conocida truncada y cerrar brackets
  var arrayMatch = str.match(/\{[\s\S]*?\[\s*\{[\s\S]*/);
  if (arrayMatch) {
    var candidate = arrayMatch[0];
    // Eliminar último objeto incompleto
    candidate = candidate.replace(/,\s*\{[^}]*$/, '');
    // Cerrar arrays y objetos abiertos
    var openB = (candidate.match(/\[/g)||[]).length;
    var closeB = (candidate.match(/\]/g)||[]).length;
    for (var i = 0; i < openB - closeB; i++) candidate += ']';
    var openC = (candidate.match(/\{/g)||[]).length;
    var closeC = (candidate.match(/\}/g)||[]).length;
    for (var i = 0; i < openC - closeC; i++) candidate += '}';
    try {
      var parsed = JSON.parse(candidate);
      console.log('[IPERC-AI] JSON reparado — objetos truncados removidos');
      return parsed;
    } catch(e) {}
  }

  // 3. Extraer objetos individuales con campos conocidos
  var items = [];
  var regex = /\{[^{}]*"(?:riesgo|nombre)"[^{}]*\}/g;
  var m;
  while ((m = regex.exec(str)) !== null) {
    try { items.push(JSON.parse(m[0])); } catch(e) {}
  }
  if (items.length) {
    console.log('[IPERC-AI] JSON reconstruido — ' + items.length + ' objetos extraídos individualmente');
    // Detectar tipo por campos presentes
    if (items[0].riesgo) return { riesgos: items };
    if (items[0].nombre) return { actividades: items };
    return items;
  }

  throw new Error('JSON irreparable — respuesta de IA no es JSON válido');
}
let _chatDrawerOpen = false;
let _forcedMode = null; // null | 'mobile' | 'pc'

function toggleChatDrawer(){
  if(_chatDrawerOpen) closeChatDrawer();
  else openChatDrawer();
}
function openChatDrawer(){_fabClear();
  _chatDrawerOpen=true;
  document.querySelector('.chat-panel').classList.add('drawer-open');
  document.getElementById('chat-drawer-bg').classList.add('open');
  document.getElementById('chat-fab').style.transform='rotate(20deg) scale(.9)';
}
function closeChatDrawer(){
  _chatDrawerOpen=false;
  document.querySelector('.chat-panel').classList.remove('drawer-open');
  document.getElementById('chat-drawer-bg').classList.remove('open');
  document.getElementById('chat-fab').style.transform='';
}

// Signal new AI message via FAB badge
function _fabPing(){
  const b=document.getElementById('fab-badge');
  if(b&&!_chatDrawerOpen) b.classList.add('on');
}
function _fabClear(){
  const b=document.getElementById('fab-badge');
  if(b) b.classList.remove('on');
}

function toggleMode(){
  const btn=document.getElementById('mode-toggle');
  if(_forcedMode==='mobile'||(!_forcedMode&&window.innerWidth<=768)){
    // Force PC mode
    _forcedMode='pc';
    document.body.classList.remove('force-mobile');
    document.body.classList.add('force-pc');
    if(btn) btn.textContent='📱 Móvil';
  } else {
    // Force mobile mode
    _forcedMode='mobile';
    document.body.classList.remove('force-pc');
    document.body.classList.add('force-mobile');
    if(btn) btn.textContent='💻 PC';
    closeChatDrawer();
  }
}

// Apply force-mobile/force-pc CSS overrides
(function(){
  const s=document.createElement('style');
  s.textContent=`
    body.force-pc #chat-fab{display:none!important}
    body.force-pc #mode-toggle{display:inline-flex!important}
    body.force-pc .chat-panel{position:static!important;height:auto!important;transform:none!important;border-radius:0!important;border-top:1px solid var(--border)!important;border-left:1px solid var(--border)!important}
    body.force-pc #app-container.ready{grid-template-columns:1fr 360px!important;grid-template-rows:auto 1fr!important}
    body.force-mobile #chat-fab{display:flex!important}
    body.force-mobile #app-container.ready{grid-template-columns:1fr!important}
    body.force-mobile .chat-panel{position:fixed!important;bottom:0!important;left:0!important;right:0!important;height:75vh!important;transform:translateY(100%)!important;z-index:3200!important}
    body.force-mobile .chat-panel.drawer-open{transform:translateY(0)!important}
    body.force-mobile .tb-module{display:none!important}
    body.force-mobile .tb-badge{display:none!important}
    body.force-mobile .form-grid,.force-mobile .form-grid.three{grid-template-columns:1fr!important}
    body.force-mobile .risk-grid{grid-template-columns:1fr!important}
    body.force-mobile .stats-row{grid-template-columns:1fr 1fr!important}
    body.force-mobile .sig-row{grid-template-columns:1fr!important}
    body.force-mobile .nav-footer{flex-direction:column!important;gap:8px!important}
    body.force-mobile .nav-footer .btn{justify-content:center!important;width:100%!important}
  `;
  document.head.appendChild(s);
})();

function showToast(msg,dur=3000){
  const t=document.createElement('div');
  t.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-family:Inter,sans-serif;z-index:99999;white-space:nowrap;animation:su .2s ease';
  t.textContent=msg;
  if(!document.querySelector('style[data-toast]')){const s=document.createElement('style');s.dataset.toast='1';s.textContent='@keyframes su{from{transform:translateX(-50%) translateY(12px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}';document.head.appendChild(s);}
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),dur);
}

// ════════════════════════════════════════════════════
// GEMINI FLASH — IA Gratuita (1500 req/día sin costo)
// Obtén tu key GRATIS en: aistudio.google.com
// Modelo: gemini-1.5-flash (estable, gratis, sin restricciones de región)
// ════════════════════════════════════════════════════
// Modelos Gemini en orden de preferencia
const GEMINI_MODELS = [
  'gemini-2.0-flash',            // actual estable 2025-2026
  'gemini-2.0-flash-lite',       // ligero, más cuota
  'gemini-1.5-flash',            // fallback probado
  'gemini-1.5-flash-latest',     // alias estable
  'gemini-1.5-pro',              // último recurso
];
let GEMINI_MODEL = localStorage.getItem('fts_gemini_model') || GEMINI_MODELS[0];

// ── Cuenta regresiva — sin toasts, solo actualiza el label ──
function _showRateLimitCountdown(secsTotal, labelEl){
  return new Promise(resolve=>{
    let s=Math.ceil(secsTotal);
    const tick=()=>{
      if(window._geminiCancelled||window._stopCountdown){ window._stopCountdown=false; resolve(); return; }
      if(labelEl) labelEl.textContent=`⏳ Límite de API — reintentando en ${s}s… (pulsa ✕ para cancelar)`;
      if(s<=0){ resolve(); return; }
      s--; setTimeout(tick,1000);
    };
    tick();
  });
}

// ══════════════════════════════════════════════════════
// GROQ API — razonamiento de texto (sin archivos)
// Compatible con OpenAI, mucho más generoso en cuota
// ══════════════════════════════════════════════════════
async function callGroq(promptText, maxTokens=4000, _statusEl=null, _attempt=0, _maxRetries=1){
  if(!GROQ_KEY) throw new Error('GROQ_SIN_KEY: No hay API Key de Groq configurada.');
  if(window._geminiCancelled) throw new Error('CANCELADO: Operación cancelada.');
  if(_attempt===0) _setApiStatus('groq','busy','Pensando…','Llamada en curso a Groq LLaMA 70B.');

  const url='https://api.groq.com/openai/v1/chat/completions';
  const body={
    model: GROQ_MODEL,
    messages:[{role:'user', content: promptText}],
    max_tokens: maxTokens,
    temperature: 0.3,
    response_format: { type: 'json_object' }
  };
  const res=await fetch(url,{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+GROQ_KEY},
    body:JSON.stringify(body)
  });
  const d=await res.json();
  if(d.error){
    const errMsg=d.error.message||'';
    const errCode=d.error.code||d.error.type||'';
    // Rate limit por minuto → retry automático
    const hasRetry=/retry.after|rate.limit|rate_limit_exceeded/i.test(errMsg+errCode);
    const waitSecs=parseInt(res.headers?.get?.('retry-after')||'30');
    if(hasRetry && _attempt<_maxRetries && !window._geminiCancelled){
      _setApiStatus('groq','warn','Límite/min','Cuota por minuto alcanzada. Reintentando…');
      console.warn(`Groq rate limit — esperando ${waitSecs}s (intento ${_attempt+1}/${_maxRetries})`);
      const lbl=_statusEl||document.getElementById('refine-status-lbl')||document.getElementById('detect-spinner-txt');
      await _showRateLimitCountdown(waitSecs, lbl);
      if(window._geminiCancelled) throw new Error('CANCELADO: Operación cancelada.');
      return callGroq(promptText, maxTokens, _statusEl, _attempt+1, _maxRetries);
    }
    if(hasRetry){
      _setApiStatus('groq','warn','Límite/min','Cambiando a Gemini…');
      throw new Error('RATE_AGOTADO: Groq rate limit — cambiando a Gemini.');
    }
    if(/api.?key|invalid|unauthorized|401/i.test(errMsg+errCode)){
      _setApiStatus('groq','error','Key inválida','API key de Groq inválida o expirada. Obtén una nueva en console.groq.com/keys');
      throw new Error('GROQ_KEY_INVALIDA: '+errMsg);
    }
    // Modelo deprecado → intentar el siguiente de la lista automáticamente
    if(/decommissioned|deprecated|no longer supported|model.*not.*found|does not exist/i.test(errMsg)){
      const curIdx = GROQ_MODELS.indexOf(GROQ_MODEL);
      const nextModel = GROQ_MODELS[curIdx+1];
      if(nextModel){
        console.warn('Groq: modelo '+GROQ_MODEL+' deprecado → probando '+nextModel);
        GROQ_MODEL = nextModel;
        localStorage.setItem('fts_groq_model', nextModel);
        _setApiStatus('groq','warn','Cambiando…','Modelo '+GROQ_MODEL+' deprecado, probando '+nextModel+'…');
        return callGroq(promptText, maxTokens, _statusEl, _attempt, _maxRetries);
      }
      _setApiStatus('groq','error','Sin modelo','Todos los modelos de Groq están deprecados. Revisa console.groq.com/docs/deprecation');
      throw new Error('GROQ_SIN_MODELO: Todos los modelos están deprecados: '+errMsg);
    }
    _setApiStatus('groq','error','Error','Error inesperado Groq: '+errMsg.substring(0,80));
    throw new Error('Groq error: '+errMsg);
  }
  const text=d.choices?.[0]?.message?.content;
  if(!text) throw new Error('Groq sin respuesta: '+JSON.stringify(d).substring(0,200));
  _setApiStatus('groq','ok','Activa','Última respuesta exitosa.');
  return text;
}

// ── Cancelación manual de operación Gemini en curso ──
window._geminiCancelled = false;
function cancelGemini(){
  window._geminiCancelled = true;
  // Restaurar UI de detect
  const btn=document.getElementById('detect-btn');
  const spin=document.getElementById('detect-spinner');
  if(btn){ btn.style.display=''; btn.disabled=false; }
  if(spin) spin.style.display='none';
  // Restaurar UI de refine
  const rbtn=document.getElementById('btn-do-refine');
  const rspin=document.getElementById('refine-plan-spinner');
  const lbl=document.getElementById('refine-status-lbl');
  if(rbtn){ rbtn.disabled=false; rbtn.textContent='🔄 Aplicar refinamiento'; }
  if(rspin) rspin.style.display='none';
  if(lbl) lbl.textContent='⚠️ Operación cancelada';
  showToast('⚠️ Operación cancelada', 3000);
}

async function callGemini(parts, maxTokens=1000, _statusEl=null, _attempt=0){
  window._geminiCancelled = false; // reset al iniciar
  if(_attempt===0) _setApiStatus('gemini','busy','Pensando…','Llamada en curso a Gemini Flash.');
  if(!GEMINI_KEY){
    throw new Error('Sin API key. Configura tu key de Gemini en el panel ⚙️ del Master.');
  }
  const model=window._geminiModelOverride||localStorage.getItem('fts_gemini_model')||GEMINI_MODEL;
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body={
    contents:[{parts}],
    generationConfig:{maxOutputTokens:maxTokens,temperature:0.3}
  };
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-goog-api-key':GEMINI_KEY},body:JSON.stringify(body)});
  const d=await res.json();
  if(d.error){
    const errMsg=d.error.message||'';
    const errCode=d.error.code||0;
    // ── Detectar tipo de límite ──
    const is429 = errCode===429||/RESOURCE_EXHAUSTED/i.test(errMsg);
    if(is429){
      // Cuota DIARIA: mensaje tipo "exceeded your current quota" o "billing" → NO tiene "retry in Xs"
      const hasRetryTime = /retry in [0-9.]+s/i.test(errMsg);
      if(!hasRetryTime){
        // Sin tiempo de retry = cuota diaria o de plan — no hay espera que ayude hoy
        _setApiStatus('gemini','error','Cuota diaria','Cuota diaria agotada (1,500 req/día). Resetea 2am MX. Causa probable: uso intensivo o GitHub baneó la key.');
        throw new Error('CUOTA_DIARIA: '+errMsg);
      }
      // Cuota POR MINUTO: tiene "retry in Xs" → reintentar (max 3)
      if(!window._geminiCancelled && _attempt<1){
        _setApiStatus('gemini','warn','Límite/min','Cuota por minuto alcanzada. Reintentando 1 vez…');
        const m=errMsg.match(/retry in ([0-9.]+)s/i);
        const waitSecs=m ? parseFloat(m[1]) : (20+_attempt*10);
        console.warn(`Rate limit — esperando ${waitSecs}s (intento ${_attempt+1}/3)`);
        const lbl=_statusEl||document.getElementById('refine-status-lbl')||document.getElementById('detect-spinner-txt');
        await _showRateLimitCountdown(waitSecs, lbl);
        if(window._geminiCancelled) throw new Error('CANCELADO: Operación cancelada por el usuario.');
        return callGemini(parts, maxTokens, _statusEl, _attempt+1);
      }
      if(window._geminiCancelled) throw new Error('CANCELADO: Operación cancelada por el usuario.');
      throw new Error('RATE_AGOTADO: Error de IA. Intenta de nuevo o reduce el número de actividades.');
    }
    // Key revocada o inválida
    // Modelo deprecado o no encontrado → probar el siguiente
    if(/not found|not supported|deprecated|decommissioned/i.test(errMsg)){
      const curIdx=GEMINI_MODELS.indexOf(GEMINI_MODEL);
      const nextModel=GEMINI_MODELS[curIdx+1];
      if(nextModel){
        console.warn('Gemini: modelo '+GEMINI_MODEL+' no disponible → probando '+nextModel);
        GEMINI_MODEL=nextModel;
        localStorage.setItem('fts_gemini_model',nextModel);
        window._geminiModelOverride=nextModel;
        _setApiStatus('gemini','warn','Cambiando…','Modelo anterior no disponible, probando '+nextModel+'…');
        return callGemini(parts, maxTokens, _statusEl, _attempt);
      }
      _setApiStatus('gemini','error','Sin modelo','Todos los modelos Gemini fallaron. Verifica tu key en aistudio.google.com/apikey');
      throw new Error('KEY_REVOCADA: Sin modelos disponibles — '+errMsg);
    }
    if(errCode===400||errCode===401||errCode===403||/api.?key|invalid|revoked|disabled/i.test(errMsg)){
      _setApiStatus('gemini','error','Key inválida','API key revocada, expirada o inválida. Posible causa: GitHub secret scanning detectó la key en el repositorio público y Google la revocó automáticamente. Obtén una key nueva en aistudio.google.com/apikey');
      throw new Error('KEY_REVOCADA: '+errMsg);
    }
    _setApiStatus('gemini','error','Error','Error inesperado: '+errMsg.substring(0,80));
    console.error('Gemini API error:',d.error);
    throw new Error(errMsg||'Gemini error '+errCode);
  }
  const text=d.candidates?.[0]?.content?.parts?.[0]?.text;
  if(!text){
    const detail=JSON.stringify(d).substring(0,400);
    console.error('Gemini sin texto:', detail);
    throw new Error('Gemini sin respuesta: '+detail);
  }
  _setApiStatus('gemini','ok','Activa','Última respuesta exitosa.');
  return text;
}

// ── OpenRouter — tercer fallback con modelo gratuito ──
let OPENROUTER_KEY = localStorage.getItem('fts_openrouter_key') || '';
let _orModel = null;

async function getOpenRouterFreeModel(key) {
  if (_orModel) return _orModel;
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    const data = await response.json();
    const freeModels = (data.data||[])
      .filter(m => m.id.endsWith(':free') && m.context_length >= 8000)
      .sort((a,b) => b.context_length - a.context_length);
    if (!freeModels.length) throw new Error('Sin modelos gratuitos');
    _orModel = freeModels[0].id;
    console.log('[OpenRouter] Modelo seleccionado:', _orModel, '(ctx:', freeModels[0].context_length + ')');
    return _orModel;
  } catch(e) {
    _orModel = 'mistralai/mistral-small-3.1-24b-instruct:free';
    console.warn('[OpenRouter] Fallback modelo:', _orModel, e.message);
    return _orModel;
  }
}

async function callOpenRouter(promptText, maxTokens=4500, _statusEl=null){
  if(!OPENROUTER_KEY) throw new Error('Sin OpenRouter key');
  if(window._geminiCancelled) throw new Error('CANCELADO');
  _setApiStatus('gemini','warn','Fallback…','Usando OpenRouter como respaldo.');

  const model = await getOpenRouterFreeModel(OPENROUTER_KEY);
  if(_statusEl && _statusEl.textContent) _statusEl.textContent = '⚡ OpenRouter · ' + model.split('/').pop().replace(':free','');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + OPENROUTER_KEY,
      'HTTP-Referer': 'https://yinyo1.github.io/fts-suite/',
      'X-Title': 'FTS Suite IPERC'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: maxTokens,
      messages: [
        { role: 'user', content: promptText }
      ]
    })
  });

  if(!res.ok){
    const err = await res.json().catch(()=>({}));
    throw new Error('OpenRouter error: ' + (err.error?.message || res.status));
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if(!text) throw new Error('OpenRouter sin respuesta');
  return text;
}

// ════════════════════════════════════════════════════
// WIZARD
// ════════════════════════════════════════════════════
function goStep(n){
  // n: 2 (Simulación), 3 (Análisis IPERC), 4 (Imprimir)
  state.step=n;
  document.querySelectorAll('.step-panel').forEach(p=>p.classList.remove('on'));
  const stepEl=document.getElementById('step'+n);
  if(stepEl) stepEl.classList.add('on');

  // Step 3: evaluación de riesgos
  if(n===3){
    _populateCrActSelect(); // llenar select de actividades en agregar manual
    buildRiskStep();        // poblar risk-edit-list
    // Si ya hay riesgos evaluados, mostrar preview
    const rows = window._rows || [];
    if(rows.length){
      document.getElementById('iperc-empty-hint').style.display = 'none';
      const wrap = document.getElementById('iperc-preview-wrap');
      if(wrap) wrap.style.display = 'block';
      buildIPERC();
      const btnP = document.getElementById('btn-to-print');
      if(btnP) btnP.style.display = '';
    }
  }
  // Step 4: imprimir — buildIPERC para que buildIPERC use datos del proyecto actualizados
  if(n===4){ buildIPERC(); }

  // Botón "Analizar Riesgos →" — visible cuando hay actividades
  const btnR = document.getElementById('btn-to-refine');
  if(btnR) btnR.style.display = (state.activities.some(a=>a.on)) ? 'block' : 'none';

  // Wizard visual: ws2=idx0, ws3=idx1, ws4=idx2
  const worder=['ws2','ws3','ws4'];
  const wcur = n===2?'ws2':n===3?'ws3':'ws4';
  const wIdx = worder.indexOf(wcur);
  worder.forEach((wid,i)=>{
    const el=document.getElementById(wid);
    if(!el) return;
    el.classList.remove('active','done');
    if(i<wIdx) el.classList.add('done');
    else if(i===wIdx) el.classList.add('active');
  });

  if(n===3) updateKbStats?.();
  document.getElementById('main-area').scrollTo(0,0);
}

function toggleDiffCard(){
  const body=document.getElementById('diff-card-body');
  const arrow=document.getElementById('diff-arrow');
  const open=body.style.display==='block';
  body.style.display=open?'none':'block';
  if(arrow) arrow.style.transform=open?'':'rotate(180deg)';
}

// ════════════════════════════════════════════════════
// ACTIVITY DETECTION
// ════════════════════════════════════════════════════
async function detectActivities(manual=false){
  const text = document.getElementById('scope-text').value.trim();
  const hasFile = _scopeFileData!==null||_scopeFiles.length>0;
  if(!text && !hasFile){showToast('⚠️ Describe el trabajo o sube archivos primero.');return;}
  const found = [];
  if(text){
    // Keywords de alta especificidad: basta 1 sola para activar la actividad
    const HIGH_SPECIFICITY = /^(andamio|loto|bloqueo eléctrico|arco eléctrico|oxicorte|plc|scada|hmi|variador|soldadura|soldador|soldar|argón|arco tig|mig|subestacion|manlift|genie|jlg|espacio confinado|trabajo en caliente|altura|rotomartillo|desbaste|esmerilado|cizalla|puente grúa|montacargas|obra civil|demolición|cimbrado|colado|chiller|manejadora|refrigeración|instrumentación|transmisor|compresor)$/i;
    const tLow = text.toLowerCase();
    Object.entries(KB).forEach(([name,data])=>{
      const hits = (data.keywords||[]).filter(kw=>tLow.includes(kw.toLowerCase()));
      // Si algún keyword es de alta especificidad, basta 1 hit
      const hasHighSpec = hits.some(kw=>HIGH_SPECIFICITY.test(kw));
      if(hasHighSpec || hits.length >= 2) found.push(name);
    });
    // Trabajo en Planta solo si hay 2+ señales de planta activa
    const plantaHits = (text.match(/\b(planta|producción|área de producción|planta activa|en operación|área restringida)/gi)||[]).length;
    if(!found.includes("Trabajo en Planta en Operación") && plantaHits >= 2)
      found.push("Trabajo en Planta en Operación");
  }
  if(!manual){
    const btn=document.getElementById('detect-btn');
    const spinnerDiv=document.getElementById('detect-spinner');
    const spinnerTxt=document.getElementById('detect-spinner-txt');
    window._geminiCancelled = false;
    btn.style.display='none';
    if(spinnerDiv) spinnerDiv.style.display='flex';
    // Mensajes progresivos para que el usuario sepa que está trabajando
    const _hasFilesNow = _scopeFiles.length > 0;
    const msgs= _hasFilesNow
      ? ['Leyendo documentos adjuntos…','Extrayendo información técnica…','Simulando plan de ejecución…','Generando subpasos detallados…','Finalizando análisis…']
      : ['Analizando descripción del trabajo…','Identificando disciplinas y riesgos…','Simulando plan de ejecución…','Generando subpasos detallados…','Finalizando análisis…'];
    let msgIdx=0;
    if(spinnerTxt) spinnerTxt.textContent=msgs[0];
    const msgTimer=setInterval(()=>{ msgIdx=(msgIdx+1)%msgs.length; if(spinnerTxt) spinnerTxt.textContent=msgs[msgIdx]; },3000);
    btn.disabled=true;
    try{
      // ── Build Gemini parts: imágenes + PDFs nativos + audio + texto ──
      const parts=[];

      // Imágenes: inline_data visual
      _scopeFiles.filter(function(f){return f.isImage;}).forEach(function(f){
        parts.push({inline_data:{mime_type:f.mediaType,data:f.base64}});
      });

      // PDFs: Gemini los lee nativamente como inline_data (NO solo nombre)
      _scopeFiles.filter(function(f){return f.isPDF;}).forEach(function(f){
        parts.push({inline_data:{mime_type:'application/pdf',data:f.base64}});
      });

      // Texto libre del campo + audios referenciados
      let ctx='';
      if(text) ctx+='DESCRIPCIÓN DEL TRABAJO (voz/texto del supervisor):\n'+text+'\n\n';
      _scopeFiles.filter(function(f){return f.isAudio;}).forEach(function(f){
        ctx+='[NOTA DE CAMPO en audio: '+f.name+' — interpreta como instrucción verbal del supervisor de campo]\n\n';
      });

      // ── PROMPT: Supervisor senior 20+ años + Knowledge Blocks + Few-Shot ──
      const proj=getProj();
      const clienteCtx=proj.cliente?'Cliente: '+proj.cliente+'\n':'';
      const areaCtx=proj.area?'Área de trabajo: '+proj.area+'\n':'';
      const trabajoCtx=proj.trabajo?'Trabajo específico: '+proj.trabajo+'\n':'';
      const workFullText = (text||'') + ' ' + (proj.trabajo||'') + ' ' + (proj.area||'');
      const knowledgeCtx = buildKnowledgeContext(workFullText);
      const clienteId = _selectedClient&&_selectedClient.id ? _selectedClient.id : 'general';
      let fewShotCtx = '';
      try { fewShotCtx = await getFewShotExamples(clienteId); } catch(e){}

      const clienteReglasCtx = (_selectedClient?.reglasEspecificas||[]).length
        ? 'REGLAS ESPECIALES DEL CLIENTE:\n' + _selectedClient.reglasEspecificas.map(r=>'- '+r).join('\n') + '\n\n'
        : '';

      // Actividades KB detectadas por keywords — la IA DEBE incluirlas en el plan, en orden lógico
      const kbActNames = found.filter(function(f){ return KB[f]; });
      const kbDetectedCtx = kbActNames.length > 0
        ? 'ACTIVIDADES TÉCNICAS DETECTADAS (pre-clasificadas por keywords del texto — EVALÚA si realmente aplican al trabajo descrito e inclúyelas SOLO si corresponden al scope real. Si el trabajo es de tubería mecánica, NO incluyas cableado eléctrico. Si no hay PLC, NO incluyas automatización):\n'
          + kbActNames.map(function(f){ return '  - ' + f; }).join('\n') + '\n'
          + 'Si una actividad detectada NO aplica al trabajo real, ignórala completamente.\n\n'
        : '';

      const prompt=
'Eres supervisor senior de instalaciones industriales en México con 25 años de experiencia en eléctrico, mecánico, HVAC, automatización, altura, espacios confinados, soldadura y LOTO. Generas planes JSA detallados y realistas.\n\n'+
'CONTEXTO DEL PROYECTO:\n'+
clienteCtx+areaCtx+trabajoCtx+
(ctx||'')+
'\nAnaliza todo documento, plano o imagen adjunta.\n\n'+
clienteReglasCtx+
kbDetectedCtx+
'REGLAS OBLIGATORIAS:\n'+
'1. Genera EXACTAMENTE entre 4 y 6 actividades principales. No menos de 4.\n'+
'2. Cada actividad debe tener entre 7 y 9 subpasos detallados.\n'+
'3. Secuencia lógica obligatoria:\n'+
'   - Actividad 1: Preparación, permisos y verificación de equipo\n'+
'   - Actividad 2: Montaje/instalación de equipo de protección (andamio/plataforma/LOTO)\n'+
'   - Actividades 3-4: Trabajo específico de la disciplina\n'+
'   - Actividad final: Pruebas, limpieza y cierre\n'+
'4. Cada subpaso inicia con enlace narrativo: "Primeramente", "Posterior a eso", "Luego", "A continuación", "Finalmente".\n'+
'5. Cada subpaso incluye: quién (rol específico), con qué herramienta, medida de seguridad.\n'+
'6. Consideraciones inician con: "Vamos a verificar..."\n'+
'7. Si hay trabajo eléctrico: incluir LOTO completo (L1-L8) como actividad separada.\n'+
'8. Si hay altura >1.8m: incluir inspección de plataforma/andamio como actividad separada.\n'+
'9. NO inventes disciplinas que no se mencionaron en la descripción del trabajo.\n'+
'10. Habla en primera persona plural como supervisor de campo explicando al EHS del cliente.\n'+
'11. NO escribas normas NOM/OSHA literalmente en el texto — aplica el conocimiento sin citarlas.\n'+
'12. NO incluyas puntuaciones FINE en este paso.\n\n'+
(knowledgeCtx ? knowledgeCtx + '\n\n' : '')+(fewShotCtx ? fewShotCtx + '\n\n' : '')+
'RESPONDE SOLO con JSON válido (sin markdown, sin texto extra). Genera las 4-6 actividades completas sin abreviar:\n'+
'{"actividades":[{"paso":"1","nombre":"NOMBRE FASE EN MAYÚSCULAS","descripcion":"Descripción ejecutiva de la fase","consideraciones":"Vamos a verificar [checklist ANTES de iniciar]","nota":"CONDICIÓN CRÍTICA EN MAYÚSCULAS si aplica","subpasos":[{"paso":"1.1","descripcion":"[Primeramente/Posterior a eso/Luego/A continuación/Finalmente] vamos a [acción] usando [herramienta/equipo]. [Quién] va a [qué hace exactamente].","personal":"Rol específico (ej: Técnico electromecánico FTS, Supervisor de campo, Armador de andamio)"}]}]}';

      // ══════════════════════════════════════════════
      // ARQUITECTURA DUAL: Gemini (OCR) → Groq (plan)
      // ══════════════════════════════════════════════
      let result;
      const hasFiles = _scopeFiles.length > 0;
      const hasGroq  = !!GROQ_KEY;

      if(hasFiles && hasGroq){
        // PASO 1: Gemini extrae texto de los archivos (1 sola request)
        if(spinnerTxt) spinnerTxt.textContent = '📄 Gemini leyendo archivos adjuntos…';
        const extractParts = [...parts.filter(p=>p.inline_data)]; // solo archivos
        extractParts.push({text:
          'Eres un asistente de documentos técnicos industriales.\n'+
          'TAREA: Extrae y resume en texto plano todo el contenido relevante de estos archivos.\n'+
          'Incluye: descripción del trabajo, equipos mencionados, áreas, voltajes, dimensiones, materiales, fechas, condiciones especiales.\n'+
          'Sé exhaustivo pero conciso. Solo texto plano, sin formato markdown.'
        });
        const docText = await callGemini(extractParts, 1500, spinnerTxt); // solo OCR
        if(spinnerTxt) spinnerTxt.textContent = '🧠 Groq generando plan de ejecución…';
        // PASO 2: Groq genera el plan completo con ese texto
        const groqPrompt = prompt.replace(
          'RESPONDE SOLO con JSON válido',
          '\nCONTENIDO EXTRAÍDO DE ARCHIVOS ADJUNTOS:\n'+docText+'\n\nRESPONDE SOLO con JSON válido'
        );
        try{
          result = await callGroq(groqPrompt, 8000, spinnerTxt, 0, 0);
        } catch(groqFilesErr){
          const isRateErr = /RATE_AGOTADO|rate.limit|429|Límite/i.test(groqFilesErr.message||String(groqFilesErr));
          const isKeyErr  = /GROQ_KEY_INVALIDA|GROQ_SIN_KEY|401|invalid/i.test(groqFilesErr.message||String(groqFilesErr));
          if(isRateErr || isKeyErr){
            const reason = isRateErr ? 'límite alcanzado' : 'key inválida';
            window._stopCountdown = true;
            if(spinnerTxt) spinnerTxt.textContent = '⚡ Gemini generando el plan completo…';
            showToast('⚡ Groq en ' + reason + ', usando Gemini para el plan', 3000);
            parts.push({text:prompt});
            try{
              result = await callGemini(parts, 8000, spinnerTxt);
            } catch(gemFallErr){
              if(OPENROUTER_KEY){
                if(spinnerTxt) spinnerTxt.textContent = '⚡ OpenRouter como respaldo…';
                result = await callOpenRouter(prompt, 6000, spinnerTxt);
              } else { throw gemFallErr; }
            }
          } else {
            throw groqFilesErr;
          }
        }

      } else if(hasGroq){
        // Sin archivos: Groq directo — con fallback a Gemini si hay rate limit
        if(spinnerTxt) spinnerTxt.textContent = '🧠 Groq generando plan de ejecución…';
        parts.push({text:prompt});
        try{
          result = await callGroq(prompt, 8000, spinnerTxt, 0, 0);
        } catch(groqSimErr){
          const isRateErr = /RATE_AGOTADO|rate.limit|429|Límite/i.test(groqSimErr.message||String(groqSimErr));
          const isKeyErr  = /GROQ_KEY_INVALIDA|GROQ_SIN_KEY|401|invalid/i.test(groqSimErr.message||String(groqSimErr));
          if((isRateErr || isKeyErr) && GEMINI_KEY){
            const reason = isRateErr ? 'límite alcanzado' : 'key inválida';
            window._stopCountdown = true;
            if(spinnerTxt) spinnerTxt.textContent = '⚡ Gemini generando el plan…';
            showToast('⚡ Groq en ' + reason + ', usando Gemini', 3000);
            try{
              result = await callGemini(parts, 8000, spinnerTxt);
            } catch(gemFallErr2){
              if(OPENROUTER_KEY){
                if(spinnerTxt) spinnerTxt.textContent = '⚡ OpenRouter como respaldo…';
                result = await callOpenRouter(prompt, 6000, spinnerTxt);
              } else { throw gemFallErr2; }
            }
          } else if((isRateErr || isKeyErr) && OPENROUTER_KEY){
            window._stopCountdown = true;
            if(spinnerTxt) spinnerTxt.textContent = '⚡ OpenRouter como respaldo…';
            result = await callOpenRouter(prompt, 6000, spinnerTxt);
          } else {
            throw groqSimErr;
          }
        }

      } else if(GEMINI_KEY){
        // Sin Groq key: Gemini (con fallback OpenRouter)
        parts.push({text:prompt});
        try{
          result = await callGemini(parts, 8000, spinnerTxt);
        } catch(gemOnlyErr){
          if(OPENROUTER_KEY){
            if(spinnerTxt) spinnerTxt.textContent = '⚡ OpenRouter como respaldo…';
            result = await callOpenRouter(prompt, 6000, spinnerTxt);
          } else { throw gemOnlyErr; }
        }
      } else if(OPENROUTER_KEY){
        // Solo OpenRouter disponible
        parts.push({text:prompt});
        if(spinnerTxt) spinnerTxt.textContent = '⚡ OpenRouter generando plan…';
        result = await callOpenRouter(prompt, 6000, spinnerTxt);
      } else {
        throw new Error('Sin API keys. Configura Groq, Gemini u OpenRouter en ⚙️');
      }
      try{
        console.log('[IPERC-AI] Plan raw length:', result.length);
        console.log('[IPERC-AI] Plan raw preview:', result.substring(0,500));
        const raw=result.replace(/```json[\s\S]*?```|```[\s\S]*?```/g,function(m){
          return m.replace(/```json|```/g,'');
        }).trim();
        const parsed=repairJSON(raw);
        const acts=parsed.actividades||parsed;
        console.log('[IPERC-AI] Actividades detectadas:', Array.isArray(acts) ? acts.length : 0);
        console.log('[IPERC-AI] Plan completo:', JSON.stringify(acts).substring(0, 2000));
        if(Array.isArray(acts)){
          window._ipercCode = window._ipercCode || generateIPERCCode(clienteId, workFullText);
          window._rawActividades=acts;
          // Completar _rawActividades con KB activities que la IA no nombró igual
          kbActNames.forEach(function(kbName){
            function _stripSimple(s){ return (s||'').replace(/^\d+[.\-]\s*/,'').trim().toLowerCase(); }
            const kbS = _stripSimple(kbName);
            const already = acts.find(function(a){
              var aN=_stripSimple(a.nombre||'');
              // palabra-a-palabra: si las 2 primeras palabras clave coinciden, es el mismo
              var kbWords=kbS.split(/\s+/).filter(function(w){return w.length>3;});
              var aNWords=aN.split(/\s+/).filter(function(w){return w.length>3;});
              var wordMatch=kbWords.length>0&&kbWords.filter(function(w){return aN.includes(w);}).length>=Math.min(2,kbWords.length);
              return a.nombre===kbName||aN===kbS
                ||(kbS.length>5&&aN.includes(kbS.substring(0,12)))
                ||(kbS.length>5&&kbS.includes(aN.substring(0,12)))
                ||wordMatch;
            });
            if(!already){
              // KB activity no está en el plan de la IA — crear entrada con subpasos del template KB
              var kbData = KB[kbName]||{};
              var kbDesc = 'Actividad técnica detectada: '+kbName+'. Ejecutar según procedimientos del contratista y normativa '+(kbData.noms||[]).join(', ')+'.';
              // Subpasos template por actividad conocida
              var kbSubs = [];
              if(/andamio/i.test(kbName)){
                kbSubs=[
                  {paso:'1',descripcion:'El armador va a inspeccionar las base-placas y estabilizadores antes de posicionar el andamio.',personal:'Armador certificado NOM-009'},
                  {paso:'2',descripcion:'Vamos a posicionar los estándares verticales y nivelar con cuñas. El andamio multidireccional se monta de abajo hacia arriba.',personal:'Armador certificado NOM-009'},
                  {paso:'3',descripcion:'Se instalan los ledgers horizontales y las crucetas diagonales en cada nivel para rigidizar la estructura.',personal:'Armador certificado NOM-009'},
                  {paso:'4',descripcion:'Vamos a colocar las plataformas metálicas aseguradas con pins y los rodapiés perimetrales en todas las plataformas de trabajo.',personal:'Armador certificado NOM-009'},
                  {paso:'5',descripcion:'Se instalan los barandales superiores e intermedios a 90cm y 45cm. Sin barandales completos no autorizo subir a nadie.',personal:'Supervisor FTS'},
                  {paso:'6',descripcion:'Inspección final con check list NOM-009: niveles, anclajes, carga máxima señalizada. Se coloca tarjeta de habilitación verde.',personal:'Supervisor FTS'},
                  {paso:'7',descripcion:'Antes de subir el primer trabajador, el supervisor verifica que la línea de vida esté enganchada y el arnés clase A esté correctamente puesto.',personal:'Supervisor FTS'},
                  {paso:'8',descripcion:'Durante el trabajo, el andamio no se mueve ni se modifica con personal encima. Al terminar la jornada se coloca tarjeta roja.',personal:'Supervisor FTS'},
                ];
              } else if(/LOTO|loto|eléctric/i.test(kbName)){
                kbSubs=[
                  {paso:'1',descripcion:'L1 — Identificamos TODAS las fuentes de energía del sistema: alimentadores, circuitos derivados, capacitores y energías residuales.',personal:'Electricista certificado NOM-029'},
                  {paso:'2',descripcion:'L2 — Notificamos al operador de producción y al supervisor del cliente que vamos a bloquear el equipo. Registramos en bitácora.',personal:'Supervisor FTS'},
                  {paso:'3',descripcion:'L3 — El electricista apaga el equipo desde el panel de control siguiendo el procedimiento normal de paro.',personal:'Electricista certificado NOM-029'},
                  {paso:'4',descripcion:'L4 — Operamos el dispositivo de aislamiento (interruptor, válvula, desconectador) hasta posición OFF/cerrado.',personal:'Electricista certificado NOM-029'},
                  {paso:'5',descripcion:'L5 — Aplicamos candado personal y tarjeta LOTO con nombre, fecha y teléfono de cada trabajador que intervendrá. UN candado por persona.',personal:'Cada trabajador que interviene'},
                  {paso:'6',descripcion:'L6 — Liberamos energía residual: descargamos capacitores, sangramos presión neumática/hidráulica, bloqueamos partes con gravedad.',personal:'Electricista certificado NOM-029'},
                  {paso:'7',descripcion:'L7 — Verificamos ausencia de voltaje con multímetro Fluke CAT III en TODOS los terminales del equipo antes de tocarlo. Cero voltios confirmado.',personal:'Electricista certificado NOM-029'},
                  {paso:'8',descripcion:'L8 — El supervisor EHS del cliente firma el permiso de trabajo de energías peligrosas. Sin esta firma no iniciamos.',personal:'Supervisor EHS cliente + Supervisor FTS'},
                ];
              } else if(/cableado|conduit|tendido/i.test(kbName)){
                kbSubs=[
                  {paso:'1',descripcion:'Con el LOTO activo y verificado, vamos a revisar visualmente el recorrido completo del conduit antes de iniciar el tendido.',personal:'Electricista certificado NOM-029'},
                  {paso:'2',descripcion:'El ayudante va a marcar con plumón el recorrido sobre la soportería y verificar que las silletas estén al mismo plano.',personal:'Ayudante general'},
                  {paso:'3',descripcion:'Instalamos las abrazaderas o silletas en la soportería cada 1.5m. El técnico taladra con rotomartillo y ancla con tornillo expansivo.',personal:'Técnico electromecánico'},
                  {paso:'4',descripcion:'Cortamos los tramos de conduit a medida con segueta. Los extremos se limpian de rebabas con escariador antes de unir.',personal:'Técnico electromecánico'},
                  {paso:'5',descripcion:'Instalamos la tubería conduit tramo por tramo, verificando continuidad mecánica y que los conectores queden apretados.',personal:'Técnico electromecánico'},
                  {paso:'6',descripcion:'Colocamos tapones en las bocas mientras se tiende para no introducir basura. El electricista jalará el cable con cinta pasa-cable y grasa dieléctrica.',personal:'Electricista certificado NOM-029'},
                  {paso:'7',descripcion:'Una vez jalado el cable, identificamos y marcamos cada conductor con cinta de colores en ambos extremos antes de conectar.',personal:'Electricista certificado NOM-029'},
                  {paso:'8',descripcion:'Verificamos continuidad de cada conductor con multímetro y medimos resistencia de aislamiento con megger antes de energizar.',personal:'Electricista certificado NOM-029'},
                ];
              } else if(/soldadura|soldar|tig|mig|corte.*metál|metalúrg|argón|inox|sanitario/i.test(kbName)){
                kbSubs=[
                  {paso:'1',descripcion:'Vamos a marcar y cortar la tubería con sierra cinta o cortadora de disco. Rectificamos cada corte con block scala — ningún corte queda con rebaba antes de continuar.',personal:'Soldador TIG certificado'},
                  {paso:'2',descripcion:'Preparamos el bisel o chaflán alrededor de la tubería para garantizar penetración completa del aporte. El ángulo depende del espesor de pared.',personal:'Soldador TIG certificado'},
                  {paso:'3',descripcion:'Punteamos la tubería con proceso TIG en al menos 4 puntos equidistantes, verificando alineación y perpendicularidad con block scala. Sin punteo correcto no avanzamos.',personal:'Soldador TIG certificado'},
                  {paso:'4',descripcion:'Iniciamos el proceso TIG con camareado — preparación de la penetración de raíz previa a la soldadura de relleno. Se usa argón como gas de respaldo para evitar oxidación interior.',personal:'Soldador TIG certificado'},
                  {paso:'5',descripcion:'Aplicamos el acordonamiento TIG completo. El soldador revisa visualmente cada pasada que no haya porosidad, falta de fusión ni socavado. Si hay defecto, se esmerila y reprocesa.',personal:'Soldador TIG certificado'},
                  {paso:'6',descripcion:'Aplicamos decapante TIG sobre el cordón terminado. El supervisor verifica que no existan porosidades, grietas ni mala aplicación. El decapante debe ser el aprobado por el cliente.',personal:'Soldador TIG + supervisor'},
                  {paso:'7',descripcion:'Realizamos prueba de hermeticidad con aire a presión o agua según especificación del cliente. Sin prueba aprobada, la sección no se instala.',personal:'Soldador TIG + supervisor'},
                  {paso:'8',descripcion:'Si la hermeticidad y el acabado sanitario son aprobados, procedemos a la instalación en soportes. Marcamos la sección con fecha e identificador del soldador.',personal:'Soldador TIG + supervisor EHS'},
                ];
              } else {
                kbSubs=(kbData.noms||[]).length
                  ? [{paso:'1',descripcion:'Vamos a verificar permisos vigentes y EPP completo antes de iniciar. El supervisor convoca charla de seguridad con todo el equipo.',personal:'Supervisor del contratista'}]
                  : [{paso:'1',descripcion:'Vamos a ejecutar según procedimientos del contratista. El supervisor verifica EPP completo antes de iniciar.',personal:'Supervisor del contratista'}];
              }
              var kbNota = /andamio/i.test(kbName) ? 'TRABAJO EN ALTURA — TARJETA VERDE OBLIGATORIA ANTES DE SUBIR'
                         : /LOTO|loto|eléctric/i.test(kbName) ? 'LOTO OBLIGATORIO — CERO VOLTIOS VERIFICADO ANTES DE INTERVENIR'
                         : /cableado|conduit/i.test(kbName) ? 'LOTO ACTIVO DURANTE TODO EL TENDIDO' : '';
              window._rawActividades.push({nombre:kbName,name:kbName,paso:'',descripcion:kbDesc,
                consideraciones:'Vamos a verificar permisos vigentes y EPP completo antes de iniciar. Realizamos charla de seguridad con todo el equipo.',
                nota:kbNota, subpasos:kbSubs});
            }
          });
          acts.forEach(function(a){
            // Tag principal = la FASE (usamos solo el nombre corto como chip)
            const tag=(a.paso?a.paso+'. ':'')+(a.nombre||String(a));
            const fullDesc=[
              a.descripcion||'',
              a.consideraciones?'⚠️ Consideraciones previas: '+a.consideraciones:'',
              a.nota?'⛔ NOTA CRÍTICA: '+a.nota:'',
              Array.isArray(a.subpasos)?a.subpasos.map(function(s){return s.paso+'. '+s.descripcion;}).join('\n'):'',
            ].filter(Boolean).join('\n\n');
            if(!found.includes(tag)){found.push(tag);window._activityDescriptions[tag]=fullDesc||tag;}
          });
          // Render preview detallado
          renderActPreview(acts);
        }else if(Array.isArray(parsed)){
          parsed.forEach(function(a){const s=typeof a==='string'?a:(a.nombre||'');if(s&&!found.includes(s))found.push(s);});
        }
      }catch(e){
        console.warn('[IPERC-AI] Plan JSON parse failed:', e.message);
        // repairJSON ya se intentó arriba — este catch es por si repairJSON lanzó error
        // Intentar extracción de emergencia directa del raw
        var recovered = [];
        try{
          var repaired = repairJSON(result.replace(/```json|```/g,'').trim());
          recovered = repaired.actividades || repaired;
          if(!Array.isArray(recovered)) recovered = [];
        }catch(e2){ recovered = []; }

        if(recovered.length >= 1){
          console.warn('[IPERC-AI] Plan recuperado — '+recovered.length+' actividades de respuesta truncada');
          showToast('⚠️ Respuesta truncada — recuperadas '+recovered.length+' actividades. Puedes re-simular para el plan completo.', 6000);
          window._ipercCode = window._ipercCode || generateIPERCCode(clienteId, workFullText);
          window._rawActividades = recovered;
          var recoveredActs = recovered.map(function(a){ return {name:a.nombre||a.name,on:true,src:'ai'}; });
          state.activities = recoveredActs;
          renderActivityCards();
          goToStep(3);
        } else {
          console.error('[IPERC-AI] Plan irrecuperable. Raw:', result);
          showToast('⚠️ IA devolvió: ' + (result||'').substring(0,200), 10000);
        }
      }
    }catch(e){
      console.error('detectActivities error:',e);
      const msg=e.message||String(e);
      const isCancelled= /CANCELADO/i.test(msg);
      const isKeyErr   = /KEY_REVOCADA|GROQ_KEY_INVALIDA|GROQ_SIN_KEY/i.test(msg);
      const isRateErr  = /RATE_AGOTADO/i.test(msg);
      const isDailyErr = /CUOTA_DIARIA/i.test(msg);
      if(isCancelled){ // no mostrar banner de error, ya se restauró la UI en cancelGemini()
        clearInterval(msgTimer); btn.style.display=''; btn.disabled=false;
        if(spinnerDiv) spinnerDiv.style.display='none';
        return;
      }
      const bannerMsg = isKeyErr
        ? '🔑 <strong>API Key de Gemini inválida o revocada.</strong> Obtén una nueva en <a href="https://aistudio.google.com/apikey" target="_blank" style="color:#1d4ed8">aistudio.google.com/apikey</a> y actualízala: <button onclick="openApiKeySetup()" style="margin-left:6px;background:#dc2626;color:#fff;border:none;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;font-family:Inter,sans-serif;font-weight:600">🔑 Actualizar Key</button>'
        : isDailyErr
          ? '📵 <strong>Cuota diaria de Gemini agotada</strong> (1,500 req/día del plan gratuito). Se resetea a las 2am hora MX. <a href="https://aistudio.google.com/apikey" target="_blank" style="color:#1d4ed8">Ver planes de pago</a>'
          : isRateErr
            ? '⏱️ <strong>Límite por minuto agotado tras 3 reintentos.</strong> Espera 1–2 min. <button onclick="detectActivities()" style="margin-left:6px;background:#d97706;color:#fff;border:none;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;font-family:Inter,sans-serif;font-weight:600">🔄 Reintentar</button>'
            : '❌ <strong>Error Gemini:</strong> '+msg.substring(0,200);
      document.getElementById('detect-banner').innerHTML='<span style="color:#dc2626">'+bannerMsg+'</span>';
      document.getElementById('detect-result').style.display='block';
      showToast(isKeyErr ? '🔑 API Key inválida' : isDailyErr ? '📵 Cuota diaria agotada — resetea 2am MX' : isRateErr ? '⏱️ Límite agotado — espera 1–2 min' : '❌ '+msg.substring(0,80), 8000);
      clearInterval(msgTimer);
      btn.style.display='';
      btn.disabled=false;
      if(spinnerDiv) spinnerDiv.style.display='none';
      return; // ← CRÍTICO: detiene ejecución para no sobreescribir el banner de error
    }
    clearInterval(msgTimer);
    btn.style.display='';
    btn.disabled=false;
    if(spinnerDiv) spinnerDiv.style.display='none';
  }
  const existing=state.activities.map(a=>a.name);
  found.forEach(name=>{if(!existing.includes(name)) state.activities.push({name,on:true,source:'detected'});});
  renderActivityTags();
  document.getElementById('detect-banner').innerHTML=`✅ Se identificaron <strong>${found.length}</strong> tipo(s) de actividad. Revisa las fases generadas abajo y continúa a Refinar.`;
  document.getElementById('detect-result').style.display='block';
  const dbtn=document.getElementById('detect-btn'); if(dbtn) dbtn.textContent='🔄 Re-detectar';
  // Mostrar botón continuar
  const btnR = document.getElementById('btn-to-refine');
  if(btnR && found.length>0) btnR.style.display='block';
}

function renderActPreview(acts){
  const code = window._ipercCode = window._ipercCode || generateIPERCCode('GEN','');
  const fpBar = document.getElementById('iperc-fingerprint-bar');
  if(fpBar){
    fpBar.style.display='';
    fpBar.innerHTML='<div class="iperc-fingerprint"><span class="fp-label">\u{1F510} Huella IPERC</span><span class="fp-code">'+escHtml(code)+'</span><span class="rfn-fp-rev" id="preview-rev-badge">Rev.'+(window._ipercRevision||1)+'</span></div>';
  }
  const preview=document.getElementById('activities-preview');
  const list=document.getElementById('act-preview-list');
  if(!preview||!list||!acts||!acts.length) return;
  list.innerHTML='';
  acts.forEach(function(a,i){
    const tag=(a.paso?a.paso+'. ':'')+(a.nombre||'Actividad '+(i+1));
    const subs=Array.isArray(a.subpasos)?a.subpasos:[];
    const subsHTML=subs.map(function(s){
      return '<div class="act-prev-sub"><strong>'+escHtml(s.paso||'')+'&nbsp;</strong>'+escHtml(s.descripcion||'')+'</div>';
    }).join('');
    const considHTML=a.consideraciones?
      '<div style="background:rgba(234,179,8,.08);border:1px solid rgba(234,179,8,.3);border-radius:6px;padding:7px 10px;margin-bottom:8px;font-size:11px;color:var(--yellow);word-break:break-word">&#9888;&#65039; <strong>Antes de iniciar:</strong> '+escHtml(a.consideraciones)+'</div>':
      '';
    const card=document.createElement('div');
    card.className='act-prev-card';
    card.dataset.idx=String(i);
    card.innerHTML=
      '<div class="act-prev-hd" onclick="toggleActCard('+i+')" style="-webkit-tap-highlight-color:transparent">'+
        '<div class="act-prev-num">'+escHtml(a.paso||String(i+1))+'</div>'+
        '<div class="act-prev-title">'+escHtml(a.nombre||tag)+'</div>'+
        '<span class="act-prev-arrow" id="apar-'+i+'">&#9658;</span>'+
      '</div>'+
      '<div class="act-prev-body" id="apb-'+i+'">'+
        '<div class="act-prev-desc">'+escHtml(a.descripcion||'')+'</div>'+
        considHTML+
        (subs.length?
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin:8px 0 6px">Subpasos detallados</div>'+
          '<div style="display:flex;flex-direction:column;gap:3px">'+subsHTML+'</div>'
          :'')+
        '<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">'+
          '<div style="font-size:10px;color:var(--muted);margin-bottom:4px">&#9999;&#65039; Editar descripcion (va al IPERC)</div>'+
          '<textarea class="act-prev-edit" data-tag="'+escHtml(tag)+'" onchange="updateActDesc(this)">'+escHtml(window._activityDescriptions[tag]||a.descripcion||'')+'</textarea>'+
        '</div>'+
      '</div>';
    list.appendChild(card);
  });
  preview.style.display='block';
}

function toggleActCard(idx){
  const bd=document.getElementById('apb-'+idx);
  const ar=document.getElementById('apar-'+idx);
  const card=document.querySelector('[data-idx="'+idx+'"].act-prev-card');
  if(!bd) return;
  const isOpen=bd.classList.contains('open');
  bd.classList.toggle('open',!isOpen);
  if(card) card.classList.toggle('expanded',!isOpen);
  if(ar) ar.innerHTML=isOpen?'&#9658;':'&#9660;';
}


function escHtml(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function updateActDesc(el){
  const tag=el.dataset.tag;
  if(tag) window._activityDescriptions[tag]=el.value;
}

function renderActivityTags(){
  const c=document.getElementById('activity-tags');c.innerHTML='';
  state.activities.forEach((a,i)=>{
    const t=document.createElement('div');t.className='atag'+(a.on?' on':'');
    t.innerHTML=`<span>${a.name}</span><span class="x" onclick="removeAct(${i})">×</span>`;
    t.onclick=e=>{if(!e.target.classList.contains('x')) toggleAct(i);};
    c.appendChild(t);
  });
}
function toggleAct(i){state.activities[i].on=!state.activities[i].on;renderActivityTags();}
function removeAct(i){state.activities.splice(i,1);renderActivityTags();}
function addFromCatalog(){
  const v=document.getElementById('cat-select').value;if(!v) return;
  if(!state.activities.find(a=>a.name===v)){state.activities.push({name:v,on:true,source:'manual'});renderActivityTags();document.getElementById('detect-result').style.display='block';}
  document.getElementById('cat-select').value='';
}
function addCustomAct(){
  const v=document.getElementById('custom-act').value.trim();if(!v) return;
  if(!state.activities.find(a=>a.name===v)){
    state.activities.push({name:v,on:true,source:'custom'});
    if(!KB[v]) KB[v]={noms:['Personalizado'],keywords:[],risks:[]};
    renderActivityTags();document.getElementById('detect-result').style.display='block';
  }
  document.getElementById('custom-act').value='';
}

