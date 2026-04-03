// ════════════════════════════════════════════════════
// RISK STEP
// ════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// AUTO-EVALUACIÓN JSA + NOM + OSHA CON GROQ
// ═══════════════════════════════════════════════════════
async function autoEvaluateRisks(forceReeval){
  const acts = (state.activities||[]).filter(a=>a.on);
  if(!acts.length){ showToast('⚠️ Primero genera las actividades en el Step 1'); return; }

  const spinner  = document.getElementById('eval-spinner');
  const spinTxt  = document.getElementById('eval-spinner-txt');
  const btnEval  = document.getElementById('btn-eval-risks');
  const hint     = document.getElementById('iperc-empty-hint');
  const wrap     = document.getElementById('iperc-preview-wrap');
  const btnPrint = document.getElementById('btn-to-print');

  window._geminiCancelled = false;
  if(spinner) spinner.style.display = 'flex';
  if(btnEval){ btnEval.disabled = true; btnEval.textContent = '⏳ Evaluando…'; }
  // Mostrar barra de status API
  const evalApiBar = document.getElementById('eval-api-bar');
  if(evalApiBar) evalApiBar.style.display = 'flex';
  function _setEvalPill(api, emoji, label, color){
    const el = document.getElementById('eval-pill-' + api);
    if(el){ el.textContent = emoji + ' ' + label; el.style.background = color + '22'; el.style.color = color; }
  }
  if(GROQ_KEY) _setEvalPill('groq','🔄','Pensando…','#f59e0b');
  else _setEvalPill('groq','⚫','Sin key','#6b7280');
  if(GEMINI_KEY) _setEvalPill('gemini','⚫','En espera','#6b7280');
  else _setEvalPill('gemini','⚫','Sin key','#6b7280');

  // Mensajes progresivos
  const msgs = [
    'Aplicando JSA por subpaso…','Evaluando riesgos eléctricos NOM-001/029…',
    'Verificando altura NOM-009/OSHA 1926.502…','Revisando LOTO NOM-004/OSHA 1910.147…',
    'Calculando valores FINE C×E×P…','Definiendo jerarquía de controles OSHA…',
    'Especificando EPP por norma…','Generando tabla IPERC…'
  ];
  let mi = 0;
  if(spinTxt) spinTxt.textContent = msgs[0];
  const msgTimer = setInterval(()=>{ mi=(mi+1)%msgs.length; if(spinTxt) spinTxt.textContent=msgs[mi]; }, 2200);

  // Construir contexto JSA sin template literals anidados
  const rawActs = window._rawActividades || acts.map(a=>({paso:'',nombre:a.name,descripcion:'',subpasos:[]}));
  const jsaLines = rawActs.map(function(a){
    const header = 'ACTIVIDAD ' + (a.paso||'') + ': ' + (a.nombre||a.name);
    const desc   = '  Desc: ' + (a.descripcion||'');
    const cons   = '  Consideraciones: ' + (a.consideraciones||'');
    const subs   = (a.subpasos||[]).map(function(s){ return '    ' + s.paso + (s.personal?' ['+s.personal+']':'')+'. '+s.descripcion; }).join('\n');
    return [header, desc, cons, subs ? '  Subpasos:\n' + subs : ''].filter(Boolean).join('\n');
  });
  const jsaContext = jsaLines.join('\n\n');

  const clienteNombre = (_selectedClient && _selectedClient.nombre) ? _selectedClient.nombre : 'Cliente industrial';
  const workDesc = (document.getElementById('scope-text') ? document.getElementById('scope-text').value : '') || '';

  const prompt = 'Eres experto certificado en seguridad industrial. Realizas JSA (Job Safety Analysis) e IPERC bajo normativa NOM-STPS y OSHA.\n\n'
    + 'NORMATIVA APLICABLE:\n'
    + 'NOM: 001(edificios), 004(LOTO), 005(quimicos), 006(andamios), 009(altura), 011(ruido), '
    + '017(EPP), 020(presion), 022(estatica), 026(senales), 027(soldadura), 029(electricidad-mant), '
    + '031(construccion), 033(espacios-confinados), 036(ergonomia)\n'
    + 'OSHA: 1910.132(EPP), 1910.147(LOTO), 1910.178(montacargas), 1910.269(alta-tension), '
    + '1910.332(seg-electrica), 1926.451(andamios), 1926.502(caidas), 1926.550(gruas)\n'
    + 'NFPA 70E: Arc Flash — categorias PPE 0-4, distancias seguridad\n\n'
    + 'METODO FINE: GR = C x E x P\n'
    + 'C: 100=catastrofe/muertes, 40=varias-muertes, 25=muerte, 15=lesion-grave, 5=lesion-leve, 1=daño-leve\n'
    + 'E: 10=continua, 6=frecuente/diaria, 3=ocasional/semanal, 2=irregular/mensual, 1=raramente, 0.5=excepcionalmente\n'
    + 'P: 10=muy-probable, 6=probable, 3=posible, 1=poco-probable, 0.5=concebible, 0.1=casi-imposible\n'
    + 'GR>400:INMINENTE | 200-400:ALTO | 70-200:NOTABLE | 20-70:MODERADO | <20:ACEPTABLE\n\n'
    + 'JERARQUIA CONTROLES OSHA (en orden):\n'
    + '1.Eliminacion 2.Sustitucion 3.Ingenieria 4.Administrativos 5.EPP\n\n'
    + 'PROYECTO:\nCliente: ' + clienteNombre + '\nTrabajo: ' + workDesc + '\n\n'
    + 'PLAN DE EJECUCION (JSA):\n' + jsaContext + '\n\n'
    + 'INSTRUCCIONES:\n'
    + '- Para cada actividad y subpaso, identifica los riesgos reales que un trabajador enfrentaria manana en campo\n'
    + '- Minimo 5 riesgos por actividad, maximo 8\n'
    + '- Para trabajo electrico: incluir SIEMPRE riesgo de Arco Electrico con NFPA 70E\n'
    + '- Para altura >1.8m: incluir SIEMPRE riesgo de caida con NOM-009 (C>=25)\n'
    + '- EPP: especificar clase/certificacion exacta\n'
    + '- Controles: referenciar NOM y OSHA aplicables\n'
    + '- GR residual (c2,e2,p2) debe reflejar efectividad real de controles\n\n'
    + 'RESPONDE SOLO JSON valido sin markdown:\n'
    + '{"riesgos":[{"activity":"nombre actividad","tipo":"Mecanico|Electrico|Locativo|Fisico|Quimico|Ergonomico|Biologico",'
    + '"riesgo":"descripcion especifica","consec":"consecuencia","nom":"NOM-XXX / OSHA XXXX",'
    + '"c":25,"e":6,"p":3,"admin":"controles administrativos","epp":"EPP con norma y clase",'
    + '"c2":5,"e2":3,"p2":1}]}';

  // Helper: actualizar indicador de IA activa
  function _showActiveAI(name, model, color){
    const el = document.getElementById('eval-active-ai');
    if(el){ el.textContent = '⚡ ' + name + (model ? ' · ' + model : ''); el.style.display='inline-block'; el.style.background=color+'22'; el.style.color=color; }
  }
  function _showFallbackNotice(msg){
    const el = document.getElementById('eval-fallback-notice');
    if(el){ el.textContent = msg; el.style.display='inline'; }
  }

  try{
    if(window._geminiCancelled) throw new Error('CANCELADO');
    let result;

    if(GROQ_KEY){
      // ── Intento 1: Groq ──
      _showActiveAI('Groq', GROQ_MODEL.replace('llama-','Llama-').replace('-versatile',''), '#8b5cf6');
      _setEvalPill('groq','🔄','Analizando…','#8b5cf6');
      if(GEMINI_KEY) _setEvalPill('gemini','⚫','En espera','#6b7280');
      try{
        result = await callGroq(prompt, 8000, spinTxt, 0, 0);
        _setEvalPill('groq','✅','OK','#16a34a');
      } catch(groqErr){
        const isRateErr = /RATE_AGOTADO|rate.limit|429|Límite/i.test(groqErr.message||String(groqErr));
        const isKeyErr  = /GROQ_KEY_INVALIDA|GROQ_SIN_KEY|401|invalid/i.test(groqErr.message||String(groqErr));
        if((isRateErr || isKeyErr) && GEMINI_KEY){
          // ── Fallback automático: Gemini ──
          const reason = isRateErr ? 'límite de requests' : 'key inválida';
          window._stopCountdown = true; // detener countdown inmediatamente
          _setEvalPill('groq','⏱️',isRateErr?'Límite':'Key err','#dc2626');
          _showFallbackNotice('Groq en ' + reason + ' — usando Gemini automáticamente');
          _showActiveAI('Gemini', GEMINI_MODEL.replace('gemini-',''), '#1d4ed8');
          _setEvalPill('gemini','🔄','Analizando…','#1d4ed8');
          if(spinTxt) spinTxt.textContent = '⚡ Gemini tomando el análisis…';
          result = await callGemini([{text:prompt}], 6000, spinTxt);
          _setEvalPill('gemini','✅','OK','#16a34a');
        } else {
          throw groqErr; // error no recuperable
        }
      }
    } else if(GEMINI_KEY){
      // ── Solo Gemini disponible ──
      _showActiveAI('Gemini', GEMINI_MODEL.replace('gemini-',''), '#1d4ed8');
      _setEvalPill('gemini','🔄','Analizando…','#1d4ed8');
      try{
        result = await callGemini([{text:prompt}], 6000, spinTxt);
        _setEvalPill('gemini','✅','OK','#16a34a');
      } catch(geminiErr){
        const isRateErr = /RATE_AGOTADO|429|Límite/i.test(geminiErr.message||String(geminiErr));
        _setEvalPill('gemini','❌',isRateErr?'Límite':'Error','#dc2626');
        throw geminiErr;
      }
    } else {
      throw new Error('Sin API keys configuradas. Abre ⚙️ Configuración y agrega Groq o Gemini.');
    }

    clearInterval(msgTimer);
    if(window._geminiCancelled) throw new Error('CANCELADO');

    // Parsear JSON — quitar bloques markdown si los hay
    const clean = result.replace(/```json|```/g,'').trim();
    const parsed = JSON.parse(clean);
    const risks = parsed.riesgos || parsed;
    if(!Array.isArray(risks) || !risks.length) throw new Error('Sin riesgos en respuesta');

    // Poblar state.selectedRisks
    if(forceReeval) state.selectedRisks = {};
    // Función de match flexible: encuentra la actividad más parecida
    function _matchAct(name){
      if(!name) return acts[0] ? acts[0].name : 'General';
      // 1. Match exacto
      const exact = acts.find(a => a.name === name);
      if(exact) return exact.name;
      // 2. Match parcial (la actividad del plan que contenga palabras clave del nombre)
      const words = name.toLowerCase().split(/\s+/).filter(w=>w.length>3);
      let best = null, bestScore = 0;
      acts.forEach(a => {
        const aLow = a.name.toLowerCase();
        const score = words.filter(w => aLow.includes(w)).length;
        if(score > bestScore){ bestScore = score; best = a.name; }
      });
      if(best && bestScore > 0) return best;
      // 3. Fallback: primera actividad
      return acts[0] ? acts[0].name : 'General';
    }

    risks.forEach(function(r, i){
      const act = _matchAct(r.activity);
      if(!state.selectedRisks[act]) state.selectedRisks[act] = [];
      state.selectedRisks[act].push({
        id: 'ai-' + i, on: true, source: 'ai_jsa',
        tipo: r.tipo||'Mecánico', riesgo: r.riesgo||'', consec: r.consec||'',
        nom: r.nom||'', c: r.c||15, e: r.e||3, p: r.p||1,
        admin: Array.isArray(r.admin) ? r.admin.join(' · ') : (r.admin||''),
        epp: r.epp||'',
        c2: r.c2||5, e2: r.e2||2, p2: r.p2||1,
        def: r.def||'', ejec: r.ejec||'', ef: r.ef||''
      });
    });

    _setEvalPill('groq','🟢','Completado','#16a34a');
    buildRiskStep();
    buildIPERC();
    if(hint) hint.style.display = 'none';
    if(wrap) wrap.style.display = 'block';
    if(btnPrint) btnPrint.style.display = '';

    // Abrir panel ajuste automáticamente
    const ajBody = document.getElementById('ajuste-body');
    const ajArrow = document.getElementById('ajuste-arrow');
    if(ajBody) ajBody.style.display = 'block';
    if(ajArrow) ajArrow.style.transform = 'rotate(180deg)';

    showToast('✅ ' + risks.length + ' riesgos evaluados — revisa y ajusta abajo', 4000);

  }catch(e){
    clearInterval(msgTimer);
    const msg = e.message || String(e);
    if(!/CANCELADO/i.test(msg)){
      showToast('⚠️ ' + msg.substring(0,120), 5000);
      if(GROQ_KEY) _setEvalPill('groq','🔴','Error','#dc2626');
    }
  }finally{
    if(spinner) spinner.style.display = 'none';
    if(evalApiBar) evalApiBar.style.display = 'none';
    if(btnEval){ btnEval.disabled = false; btnEval.textContent = '🤖 Evaluar Riesgos con IA'; }
  }
}

// Renderizar lista editable de riesgos en panel ajuste
function renderRiskEditList(){
  const container = document.getElementById('risk-edit-list');
  if(!container) return;
  const allRisks = [];
  Object.entries(state.selectedRisks||{}).forEach(function(entry){
    const act = entry[0]; const risks = entry[1];
    (risks||[]).forEach(function(r){ allRisks.push({act:act, r:r}); });
  });
  if(!allRisks.length){
    container.innerHTML = '<div style="font-size:11px;color:var(--muted2);padding:8px 0">Sin riesgos aún. Evalúa con IA o agrega manualmente.</div>';
    return;
  }
  container.innerHTML = allRisks.map(function(item, idx){
    const r = item.r; const gr = (r.c||0)*(r.e||0)*(r.p||0);
    const grClass = gr>=400?'#dc2626':gr>=200?'#ea580c':gr>=70?'#d97706':gr>=20?'#65a30d':'#16a34a';
    const checked = r.on !== false ? 'checked' : '';
    return '<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:var(--d2);border-radius:8px;border:1px solid var(--border)">'
      + '<input type="checkbox" ' + checked + ' onchange="toggleRiskItem(\'' + item.act + '\',' + idx + ',this.checked)" style="margin-top:2px;flex-shrink:0">'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:11px;font-weight:600;color:var(--text)">[' + (r.tipo||'') + '] ' + (r.riesgo||'').substring(0,70) + '</div>'
      + '<div style="font-size:10px;color:var(--muted2);margin-top:2px">' + item.act.substring(0,40) + ' · GR=<span style="color:' + grClass + ';font-weight:700">' + gr + '</span></div>'
      + '</div>'
      + '<button onclick="removeRiskItem(\'' + item.act + '\',' + idx + ')" title="Eliminar" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0 2px;flex-shrink:0">✕</button>'
      + '</div>';
  }).join('');
}

// ── Edición inline en tabla IPERC ──
function updateRiskCell(input){
  const rowIdx = parseInt(input.dataset.row);
  const field   = input.dataset.field;
  const val     = parseFloat(input.value) || 0;
  const row     = (window._rows||[])[rowIdx];
  if(!row) return;
  row[field] = val;
  // Actualizar en state.selectedRisks
  const actRisks = state.selectedRisks[row.act]||[];
  const riskObj  = actRisks.find(function(r){ return r.id===row.id; });
  if(riskObj) riskObj[field] = val;
  // Recalcular GR residual y mostrar
  const grF = (row.c2||0)*(row.e2||0)*(row.p2||0);
  const grResEl = document.getElementById('gr-res-'+rowIdx);
  if(grResEl){
    const lvF = grLevel(grF);
    const bg  = lvF.cls==='gr-inim'?'#991b1b':lvF.cls==='gr-alto'?'#c2410c':lvF.cls==='gr-not'?'#fef3c7':lvF.cls==='gr-mod'?'#dcfce7':'#f5f5f5';
    const fg  = ['gr-inim','gr-alto'].includes(lvF.cls)?'#fff':(grF>20?'#333':'#666');
    grResEl.textContent = grF;
    grResEl.style.background = bg;
    grResEl.style.color = fg;
    grResEl.className = 'gr-cell ' + lvF.cls;
  }
}
function updateRiskCellText(el){
  const rowIdx = parseInt(el.dataset.row);
  const field   = el.dataset.field;
  const val     = el.textContent.trim();
  const row     = (window._rows||[])[rowIdx];
  if(!row) return;
  row[field] = val;
  const actRisks = state.selectedRisks[row.act]||[];
  const riskObj  = actRisks.find(function(r){ return r.id===row.id; });
  if(riskObj) riskObj[field] = val;
}

// ── AI refine por fila ──
function _showRowRefinePrompt(riesgoName){
  return new Promise(function(resolve){
    const modal = document.createElement('div');
    modal.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);padding:20px';
    modal.innerHTML='<div style="background:var(--d2);border:1px solid var(--border);border-radius:14px;padding:20px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,.4)">'
      +'<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px">✏️ Ajuste de Supervisor con IA</div>'
      +'<div style="font-size:11px;color:var(--muted2);margin-bottom:10px">Riesgo: <em>'+escHtml(riesgoName.substring(0,60))+'</em></div>'
      +'<textarea id="_row-refine-ta" rows="3" placeholder="Ej: Sube el GR a Inminente · Agrega control de ingeniería · Cambia el EPP a Clase E"'
      +' style="width:100%;box-sizing:border-box;background:var(--d3);border:1px solid var(--border);color:var(--text);padding:10px 12px;border-radius:8px;font-family:Inter,sans-serif;font-size:12px;resize:none"></textarea>'
      +'<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">'
      +'<button id="_rr-cancel" style="padding:6px 16px;background:var(--d3);border:1px solid var(--border);color:var(--muted2);border-radius:8px;cursor:pointer;font-family:Inter,sans-serif;font-size:12px">Cancelar</button>'
      +'<button id="_rr-ok" style="padding:6px 16px;background:var(--o);border:none;color:#fff;border-radius:8px;cursor:pointer;font-family:Inter,sans-serif;font-size:12px;font-weight:600">🤖 Aplicar con IA</button>'
      +'</div></div>';
    window._rowRefineResolve = resolve;
    document.body.appendChild(modal);
    document.getElementById('_rr-cancel').onclick = function(){ modal.remove(); resolve(null); };
    document.getElementById('_rr-ok').onclick = function(){
      const v = (document.getElementById('_row-refine-ta')||{}).value||'';
      modal.remove(); resolve(v.trim()||null);
    };
    setTimeout(function(){ const ta=document.getElementById('_row-refine-ta'); if(ta) ta.focus(); }, 50);
  });
}
async function openRowAiRefine(rowIdx){
  const row = (window._rows||[])[rowIdx];
  if(!row){ showToast('Error: fila no encontrada'); return; }
  const instruccion = await _showRowRefinePrompt(row.riesgo||'');
  if(!instruccion) return;
  const btn = document.querySelector('[data-row-idx="'+rowIdx+'"] button');
  if(btn){ btn.textContent='⏳'; btn.disabled=true; }
  const prompt_txt = 'Eres experto en seguridad industrial. Tienes este riesgo IPERC: '
    + 'Actividad: '+row.act+' | Tipo: '+row.tipo+' | Riesgo: '+row.riesgo+' | Consec: '+row.consec+' | '
    + 'C='+row.c+' E='+row.e+' P='+row.p+' GR='+(row.c*row.e*row.p)+' | '
    + 'Controles: '+row.admin+' | EPP: '+row.epp+' | '
    + 'C2='+row.c2+' E2='+row.e2+' P2='+row.p2+' GRres='+(row.c2*row.e2*row.p2)+'. '
    + 'El supervisor indica: "'+instruccion+'". '
    + 'Aplica el ajuste y responde SOLO JSON sin markdown: '
    + '{"riesgo":"...","consec":"...","c":0,"e":0,"p":0,"admin":"...","epp":"...","c2":0,"e2":0,"p2":0,'
    + '"def":"ALTO","ejec":"ALTO","ef":"ALTO"}';
  try{
    const result = GROQ_KEY ? await callGroq(prompt_txt, 1000) : await callGemini([{text:prompt_txt}], 1000);
    const clean = result.replace(/```json|```/g,'').trim();
    const updated = JSON.parse(clean);
    // Actualizar row y riskObj
    const actRisks = state.selectedRisks[row.act]||[];
    const riskObj  = actRisks.find(function(r){ return r.id===row.id; });
    Object.assign(row, updated);
    if(riskObj) Object.assign(riskObj, updated);
    buildIPERC(); // re-renderizar tabla
    showToast('✅ Riesgo actualizado por IA');
  }catch(e){
    showToast('⚠️ '+e.message.substring(0,80));
  }finally{
    if(btn){ btn.textContent='🤖'; btn.disabled=false; }
  }
}

function toggleRiskItem(act, idx, on){
  const actRisks = state.selectedRisks[act];
  // idx es índice global — recalcular índice dentro del act
  let g = 0;
  Object.entries(state.selectedRisks||{}).forEach(function(entry){
    if(entry[0]===act) return;
    g += (entry[1]||[]).length;
  });
  const localIdx = idx - g;
  if(actRisks && actRisks[localIdx]) actRisks[localIdx].on = on;
  buildIPERC();
}

function removeRiskItem(act, globalIdx){
  let g = 0;
  Object.entries(state.selectedRisks||{}).some(function(entry){
    if(entry[0]===act){ return true; }
    g += (entry[1]||[]).length;
    return false;
  });
  const localIdx = globalIdx - g;
  if(state.selectedRisks[act]){ state.selectedRisks[act].splice(localIdx,1); }
  renderRiskEditList();
  buildIPERC();
}

function addCustomRisk(){
  const act   = (document.getElementById('cr-act') ? document.getElementById('cr-act').value : '') || 'General';
  const tipo  = (document.getElementById('cr-tipo') ? document.getElementById('cr-tipo').value : '') || 'Mecánico';
  const riesgo= (document.getElementById('cr-riesgo') ? document.getElementById('cr-riesgo').value : '').trim();
  const consec= (document.getElementById('cr-consec') ? document.getElementById('cr-consec').value : '').trim();
  const c     = parseFloat(document.getElementById('cr-c') ? document.getElementById('cr-c').value : 15)||15;
  const e     = parseFloat(document.getElementById('cr-e') ? document.getElementById('cr-e').value : 3)||3;
  const p     = parseFloat(document.getElementById('cr-p') ? document.getElementById('cr-p').value : 1)||1;
  const admin = (document.getElementById('cr-ctrl-adm') ? document.getElementById('cr-ctrl-adm').value : '').trim();
  const epp   = (document.getElementById('cr-epp') ? document.getElementById('cr-epp').value : '').trim();
  if(!riesgo){ showToast('⚠️ Describe el riesgo'); return; }
  if(!state.selectedRisks[act]) state.selectedRisks[act] = [];
  state.selectedRisks[act].push({
    id:'custom-'+Date.now(), on:true, source:'manual',
    tipo:tipo, riesgo:riesgo, consec:consec, c:c, e:e, p:p,
    admin:admin, epp:epp, c2:Math.max(1,c-10), e2:Math.max(0.5,e-1), p2:Math.max(0.1,p-1)
  });
  // Limpiar campos
  ['cr-riesgo','cr-consec','cr-ctrl-adm','cr-epp'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  renderRiskEditList(); buildIPERC();
  const hint=document.getElementById('iperc-empty-hint');
  const wrap=document.getElementById('iperc-preview-wrap');
  const btnP=document.getElementById('btn-to-print');
  if(hint) hint.style.display='none';
  if(wrap) wrap.style.display='block';
  if(btnP) btnP.style.display='';
  showToast('✅ Riesgo agregado: ' + riesgo.substring(0,40));
}

function buildRiskStep(){
  const c=document.getElementById('risk-sections');
  if(c) c.innerHTML='';
  const acts=state.activities.filter(a=>a.on);
  if(!acts.length){ renderRiskEditList(); return; }
  const allKb=getAllKnowledge();
  acts.forEach((act,ai)=>{
    const kb=KB[act.name]||{noms:[],risks:[]};
    if(!state.selectedRisks[act.name]){
      const allR=[...kb.risks.map(r=>({...r}))];
      allKb.filter(r=>r.activity===act.name).forEach(r=>{
        if(!allR.find(x=>x.riesgo===r.riesgo)) allR.push({...r,learned:true,fromGh:!r._pending});
      });
      state.selectedRisks[act.name]=allR.map((r,ri)=>({...r,id:`${ai}-${ri}`,on:true}));
    }
    const sel=state.selectedRisks[act.name];
    const selCount=sel.filter(r=>r.on).length;
    const sec=document.createElement('div');sec.className='risk-group';sec.id=`rg-${ai}`;
    sec.innerHTML=`
      <div class="rg-header open" onclick="toggleRG(${ai})">
        <span style="font-size:16px">⚡</span>
        <span class="rg-name">${act.name}</span>
        ${kb.noms.map(n=>`<span class="rg-nom">${n}</span>`).join('')}
        <span class="rg-count" id="rgc-${ai}">${selCount} riesgos</span>
        <span class="rg-arrow">▼</span>
      </div>
      <div class="rg-body open" id="rgb-${ai}">
        <div class="risk-grid" id="rgrid-${ai}"></div>
        <button class="btn btn-s btn-sm" style="margin-top:8px;font-size:11px" onclick="scrollToCustom()">+ Riesgo propio para esta actividad</button>
      </div>`;
    // Render cards solo si el contenedor risk-sections existe (compatibilidad)
    if(c) c.appendChild(sec);
    renderRiskCards(act.name,ai);
  });

  renderRiskEditList();
}

function toggleRG(ai){
  const h=document.querySelector(`#rg-${ai} .rg-header`);
  const b=document.getElementById(`rgb-${ai}`);
  h.classList.toggle('open');b.classList.toggle('open');
}

function renderRiskCards(actName,ai){
  const grid=document.getElementById(`rgrid-${ai}`);if(!grid) return;
  grid.innerHTML='';
  const risks=state.selectedRisks[actName]||[];
  if(!risks.length){grid.innerHTML='<div style="color:var(--muted2);font-size:12px;padding:6px">Sin riesgos en base. Agrega abajo.</div>';return;}
  risks.forEach((r,ri)=>{
    const grI=r.c*r.e*r.p;const lvI=grLevel(grI);
    const pCls='pb-'+r.tipo?.substring(0,3).toLowerCase().replace(/é/,'e');
    const card=document.createElement('div');
    card.className='rcard'+(r.on?' on':'');card.id=`rc-${ai}-${ri}`;
    const srcBadge=r.fromGh?`<span class="github-badge">📡 GitHub</span>`:r.learned?`<span class="learned-badge">🧠 aprendido</span>`:'';
    const ctrl=Array.isArray(r.admin)?r.admin.join(' · '):(r.admin||'—');
    card.innerHTML=`
      <div class="rcard-top" onclick="toggleR('${actName}',${ri},${ai})">
        <div class="rcard-chk">${r.on?'✓':''}</div>
        <div style="flex:1">
          <div class="rcard-name">${r.riesgo}${srcBadge}</div>
          <div style="margin-top:4px"><span class="pbadge ${pCls}">${r.tipo}</span></div>
        </div>
      </div>
      <div class="rcard-body" onclick="toggleR('${actName}',${ri},${ai})">
        <div class="rcard-consec">⚠ ${r.consec||'—'}</div>
        <div class="rcard-matrix">
          <span class="mc">C:${r.c}</span><span style="font-size:10px;color:var(--muted)">×</span>
          <span class="mc">E:${r.e}</span><span style="font-size:10px;color:var(--muted)">×</span>
          <span class="mc">P:${r.p}</span><span style="font-size:10px;color:var(--muted)">=</span>
          <span class="gr-badge ${lvI.cls}">GR ${grI} · ${lvI.label}</span>
        </div>
        <div class="rcard-ctrl"><strong>Controles:</strong> ${ctrl}</div>
        <div class="rcard-epp"><strong>EPP:</strong> ${r.epp||'—'}</div>
      </div>`;
    grid.appendChild(card);
  });
}

function toggleR(actName,ri,ai){
  state.selectedRisks[actName][ri].on=!state.selectedRisks[actName][ri].on;
  const r=state.selectedRisks[actName][ri];
  const card=document.getElementById(`rc-${ai}-${ri}`);
  card.classList.toggle('on',r.on);
  card.querySelector('.rcard-chk').textContent=r.on?'✓':'';
  const cnt=document.getElementById(`rgc-${ai}`);
  if(cnt) cnt.textContent=state.selectedRisks[actName].filter(x=>x.on).length+' riesgos';
}

function scrollToCustom(){document.querySelector('.card-icon.y')?.closest('.card')?.scrollIntoView({behavior:'smooth'});}



// ════════════════════════════════════════════════════
// FINE HELPERS
// ════════════════════════════════════════════════════
function grLevel(gr){
  if(gr>400) return {label:"RIESGO INMINENTE",cls:"gr-inim"};
  if(gr>200) return {label:"RIESGO ALTO",cls:"gr-alto"};
  if(gr>70)  return {label:"RIESGO NOTABLE",cls:"gr-not"};
  if(gr>20)  return {label:"RIESGO MODERADO",cls:"gr-mod"};
  return {label:"RIESGO ACEPTABLE",cls:"gr-acep"};
}

// ════════════════════════════════════════════════════
// BUILD IPERC TABLE
// ════════════════════════════════════════════════════
// Limpia referencias a normas NOM/OSHA/NFPA del texto de subpasos
function _cleanNomRefs(txt){
  if(!txt) return txt;
  return txt
    .replace(/\bsegún\s+NOM[\w\-\.]+/gi, '')
    .replace(/\baplicar\s+NOM[\w\-\.]+/gi, '')
    .replace(/\by\s+normativa\s+NOM[\w\-\.]+(?:[,\s]+NOM[\w\-\.]+)*/gi, '')
    .replace(/\bNOM[\-\d]+(?:[\-A-Z]+)?(?:[\-\d]+)?/g, '')
    .replace(/\bOSHA\s+\d{4}\.\d+/g, '')
    .replace(/\bNFPA\s+\d+[A-Z]?/g, '')
    .replace(/\s{2,}/g, ' ').trim();
}

function buildIPERC(){
  const rows=[];
  state.activities.filter(a=>a.on).forEach(act=>{
    (state.selectedRisks[act.name]||[]).filter(r=>r.on).forEach(r=>rows.push({...r,act:act.name}));
  });
  window._rows=rows;
  const stats=document.getElementById('summary-stats');
  const counts={inim:0,alto:0,not:0,mod:0};
  rows.forEach(r=>{const g=r.c*r.e*r.p;if(g>400) counts.inim++;else if(g>200) counts.alto++;else if(g>70) counts.not++;else counts.mod++;});
  stats.innerHTML=`
    <div class="stat r"><strong>${rows.length}</strong><span>Total</span></div>
    <div class="stat r"><strong>${counts.inim+counts.alto}</strong><span>Alto/Inm.</span></div>
    <div class="stat y"><strong>${counts.not}</strong><span>Notable</span></div>
    <div class="stat"><strong>${counts.mod}</strong><span>Moderado</span></div>`;
  const proj=getProj();
  const prev=document.getElementById('iperc-preview');
  const projHtml=`
    <table class="proj-table" style="margin-bottom:14px">
      <tr><td class="lbl">Cliente</td><td>${proj.cliente}</td><td class="lbl">Trabajo</td><td>${proj.trabajo}</td></tr>
      <tr><td class="lbl">Área</td><td>${proj.area}</td><td class="lbl">Lugar</td><td>${proj.lugar}</td></tr>
      <tr><td class="lbl">Personal</td><td colspan="3">${proj.personal}</td></tr>
      <tr><td class="lbl">Código IPERC</td><td>${proj.codigo}</td><td class="lbl">Período</td><td>${proj.fecha} AL ${proj.vigencia}</td></tr>
    </table>`;
  if(!rows.length){prev.innerHTML=projHtml+'<div class="alert alert-warn"><span>⚠️</span><div>Sin riesgos seleccionados.</div></div>';return;}
  // Helper: color de celda GR
  function _grStyle(gr, cls){
    const bg = cls==='gr-inim'?'#991b1b':cls==='gr-alto'?'#c2410c':cls==='gr-not'?'#fef3c7':cls==='gr-mod'?'#dcfce7':'#f5f5f5';
    const fg = ['gr-inim','gr-alto'].includes(cls)?'#fff':(gr>20?'#333':'#666');
    return 'background:'+bg+';color:'+fg;
  }
  function _tipoClass(t){ return 'pb-'+(t||'mec').substring(0,3).toLowerCase().replace('é','e').replace('í','i').replace('ú','u'); }
  function _numCell(rowIdx, field, val, w){
    return '<td class="td-num-val" style="padding:2px;text-align:center">'
      +'<input type="number" data-row="'+rowIdx+'" data-field="'+field+'" value="'+val+'" min="0.1" step="0.1"'
      +' style="width:'+(w||28)+'px;text-align:center;border:none;background:transparent;color:inherit;font-size:11px;font-family:monospace;font-weight:700;-moz-appearance:textfield;appearance:textfield"'
      +' onchange="updateRiskCell(this)" onclick="this.select()">'
      +'<span class="print-val" style="display:none;font-size:7.5px;font-weight:700;font-family:monospace">'+val+'</span>'
      +'</td>';
  }
  function _txtCell(rowIdx, field, val, style){
    return '<td contenteditable="true" data-row="'+rowIdx+'" data-field="'+field+'"'
      +' style="'+(style||'font-size:10px')+'"'
      +' onblur="updateRiskCellText(this)"'
      +' onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();this.blur()}">'
      +escHtml(val||'')+'</td>';
  }

  // ── Agrupar rows por actividad (mantener orden de state.activities) ──
  const rawActs = window._rawActividades || [];
  // Match robusto — disponible en toda buildIPERC
  function _strip(s){ return (s||'').replace(/^\d+[.\-]\s*/,'').trim().toLowerCase(); }
  function _getFullDesc(actName){
    // Match robusto: el actName puede ser "1. NOMBRE" o solo "NOMBRE"
    function _strip(s){ return (s||'').replace(/^\d+[\.-]\s*/,'').trim().toLowerCase(); }
    const aStrip = _strip(actName);
    const ra = rawActs.find(function(a){
      return a.nombre===actName || a.name===actName
        || _strip(a.nombre)===aStrip
        || _strip(a.name||'')===aStrip
        || aStrip.includes(_strip(a.nombre||'').substring(0,20))
        || _strip(a.nombre||'').includes(aStrip.substring(0,20));
    });
    if(!ra) return actName;
    const parts = [];
    // Descripción ejecutiva de la fase
    if(ra.descripcion) parts.push(ra.descripcion);
    // Consideraciones previas
    if(ra.consideraciones) parts.push('⚠️ Antes de iniciar: '+ra.consideraciones);
    if(ra.nota) parts.push('⛔ NOTA: '+ra.nota);
    // Todos los subpasos numerados — esta es la esencia del JSA
    if(Array.isArray(ra.subpasos) && ra.subpasos.length){
      ra.subpasos.forEach(function(s){
        const quien = s.personal ? ' ['+s.personal+']' : '';
        parts.push(s.paso+quien+' '+s.descripcion);
      });
    }
    return parts.length ? parts.join('\n') : actName;
  }

  // Agrupar rows por nombre de actividad en orden
  const actGroups = [];
  const actSeen = {};
  rows.forEach(function(r){
    if(!actSeen[r.act]){
      actSeen[r.act] = true;
      actGroups.push({ act: r.act, risks: [] });
    }
    actGroups[actGroups.length-1].risks.push(r);
  });
  // Reconstruir rows ordenados (por grupo)
  const orderedRows = [];
  actGroups.forEach(function(g){ g.risks.forEach(function(r){ orderedRows.push(r); }); });
  window._rows = orderedRows; // actualizar referencia global

  // Generar HTML de filas con rowspan en columna descripción
  let globalIdx = 0;
  const tableRows = actGroups.map(function(group, gi){
    const actName = group.act;
    const risks   = group.risks;
    const span    = risks.length;
    const fullDesc = _getFullDesc(actName);
    const paso    = gi + 1;

    return risks.map(function(r, ri){
      const i   = globalIdx++;
      const grI = r.c*r.e*r.p; const grF = r.c2*r.e2*r.p2;
      const lvI = grLevel(grI); const lvF = grLevel(grF);
      const admin = Array.isArray(r.admin)?r.admin.join(' · '):(r.admin||'');
      const defV  = (r.def||'ALTO').toLowerCase();
      const ejecV = (r.ejec||'ALTO').toLowerCase();
      const efV   = (r.ef||'ALTO').toLowerCase();

      let actCell = '';
      if(ri === 0){
        // Primera fila del grupo: celda con rowspan y descripción completa
        // Construir HTML de descripción: título en bold + subpasos en normal
        var descHtml = (function(){
          // Usar _strip del scope de buildIPERC — match idéntico al del PDF
          var aS2 = _strip(actName);
          var ra2 = rawActs.find(function(a){
            return a.nombre===actName || a.name===actName
              || _strip(a.nombre)===aS2
              || _strip(a.name||'')===aS2
              || (aS2.length>5 && aS2.includes(_strip(a.nombre||'').substring(0,20)))
              || (aS2.length>5 && _strip(a.nombre||'').includes(aS2.substring(0,20)));
          });
          if(!ra2) return '<strong>'+escHtml(actName)+'</strong>';
          var html = '';
          // Nombre en negritas
          html += '<strong style="font-size:10px;display:block;margin-bottom:4px;color:var(--text)">'+escHtml(ra2.nombre||actName)+'</strong>';
          // Descripción ejecutiva
          if(ra2.descripcion) html += '<span style="display:block;margin-bottom:5px;color:var(--muted2);font-style:italic">'+escHtml(_cleanNomRefs(ra2.descripcion))+'</span>';
          // Consideraciones
          if(ra2.consideraciones) html += '<span style="display:block;margin-bottom:5px;background:rgba(234,179,8,.08);padding:3px 5px;border-radius:3px;color:#b45309"><b>✔ VERIF:</b> '+escHtml(_cleanNomRefs(ra2.consideraciones))+'</span>';
          if(ra2.nota) html += '<span style="display:block;margin-bottom:5px;background:rgba(220,38,38,.06);padding:3px 5px;border-radius:3px;color:#dc2626;font-weight:600">⚑ NOTA: '+escHtml(ra2.nota)+'</span>';
          // Subpasos numerados
          if(Array.isArray(ra2.subpasos) && ra2.subpasos.length){
            html += '<div style="margin-top:4px">';
            ra2.subpasos.forEach(function(s){
              var quien = s.personal ? ' <em style="color:#6366f1">['+ escHtml(s.personal) +']</em>' : '';
              html += '<div style="margin-bottom:3px"><strong style="color:var(--o);min-width:28px;display:inline-block">'+escHtml(s.paso||'')+ '</strong>'+quien+' '+escHtml(_cleanNomRefs(s.descripcion||''))+'</div>';
            });
            html += '</div>';
          }
          return html;
        })();
        actCell = '<td rowspan="'+span+'" class="td-act-desc" style="vertical-align:top;font-size:9.5px;max-width:240px;min-width:190px;padding:6px 8px;line-height:1.5;border-right:2px solid var(--o)">'
          + descHtml
          + '</td>';
        // Número de paso
        actCell = '<td rowspan="'+span+'" class="td-num" style="vertical-align:middle;font-weight:700;font-size:12px;color:var(--o)">'+paso+'</td>' + actCell;
      }

      return '<tr data-row-idx="'+i+'" data-act-group="'+gi+'">'
        + actCell
        + '<td class="td-num" style="color:var(--muted2)">'+(ri+1)+'</td>'
        + '<td><span class="pbadge '+_tipoClass(r.tipo)+'">'+escHtml(r.tipo||'—')+'</span></td>'
        + _txtCell(i,'riesgo',r.riesgo,'font-size:10px;min-width:110px')
        + _txtCell(i,'consec',r.consec,'font-size:10px')
        + _numCell(i,'c',r.c,28)+_numCell(i,'e',r.e,24)+_numCell(i,'p',r.p,24)
        + '<td><div class="gr-cell '+lvI.cls+'" style="'+_grStyle(grI,lvI.cls)+'">'+grI+'</div></td>'
        + _txtCell(i,'elim',r.elim,'font-size:9.5px')
        + _txtCell(i,'sust',r.sust,'font-size:9.5px')
        + _txtCell(i,'ingenieria',r.ingenieria,'font-size:9.5px')
        + _txtCell(i,'admin',admin,'font-size:9.5px')
        + _txtCell(i,'epp',r.epp,'font-size:9.5px;color:#3b82f6')
        + _numCell(i,'c2',r.c2||1,28)+_numCell(i,'e2',r.e2||1,24)+_numCell(i,'p2',r.p2||1,24)
        + '<td><div class="gr-cell '+lvF.cls+'" id="gr-res-'+i+'" style="'+_grStyle(grF,lvF.cls)+'">'+grF+'</div></td>'
        + '<td class="ef-cell ef-'+defV+'">'+escHtml(r.def||'ALTO')+'</td>'
        + '<td class="ef-cell ef-'+ejecV+'">'+escHtml(r.ejec||'ALTO')+'</td>'
        + '<td class="ef-cell ef-'+efV+'">'+escHtml(r.ef||'ALTO')+'</td>'
        + '<td style="text-align:center;padding:2px"><button title="Ajustar con IA" onclick="openRowAiRefine('+i+')"'
        + ' style="width:22px;height:22px;border-radius:50%;border:1px solid var(--border);background:var(--d3);cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center">🤖</button></td>'
        + '</tr>';
    }).join('');
  }).join('');

  prev.innerHTML=projHtml+`<div class="iperc-wrap">
    <table class="iperc-table">
      <thead>
        <tr>
          <th rowspan="2" style="min-width:30px">Paso</th>
          <th rowspan="2" style="min-width:180px;max-width:220px">Actividades del trabajo paso a paso</th>
          <th rowspan="2" style="min-width:20px">#</th>
          <th rowspan="2">Tipo Peligro</th>
          <th rowspan="2">Descripción del Riesgo</th>
          <th rowspan="2">Consecuencia</th>
          <th colspan="4" class="group">Riesgo Inherente (FINE)</th>
          <th colspan="5" class="group">Jerarquía de Controles (OSHA)</th>
          <th colspan="4" class="group">Riesgo Residual (FINE)</th>
          <th colspan="3" class="group">Efectividad Controles</th>
          <th rowspan="2" style="min-width:28px">✏️</th>
        </tr>
        <tr>
          <th>C</th><th>E</th><th>P</th><th>GR</th>
          <th>Eliminación</th><th>Sustitución</th><th>C. Ingeniería</th><th>C. Administrativo</th><th>EPP</th>
          <th>C</th><th>E</th><th>P</th><th>GR</th>
          <th>Def.</th><th>Ejec.</th><th>Efect.</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>`;
  const sigEl=document.getElementById('sig-block');
  const p=getProj();
  sigEl.innerHTML=`
    <div class="sig-block"><div class="sig-line"><div class="sig-name">${p.elaboro||'_______________'}</div><div class="sig-role">Elaboró · Segurista</div></div></div>
    <div class="sig-block"><div class="sig-line"><div class="sig-name">${p.reviso||'_______________'}</div><div class="sig-role">Revisó · Supervisor FTS</div></div></div>
    <div class="sig-block"><div class="sig-line"><div class="sig-name">${p.aprobo||'_______________'}</div><div class="sig-role">Aprobó · EHS Cliente</div></div></div>`;
}

function getProj(){
  return {
    cliente:document.getElementById('p_cliente')?.value||'—',
    trabajo:document.getElementById('p_trabajo')?.value||'—',
    area:document.getElementById('p_area')?.value||'—',
    lugar:document.getElementById('p_lugar')?.value||'—',
    elaboro:document.getElementById('p_elaboro')?.value||'',
    reviso:document.getElementById('p_reviso')?.value||'',
    aprobo:document.getElementById('p_aprobo')?.value||'',
    fecha:document.getElementById('p_fecha')?.value||'',
    vigencia:document.getElementById('p_vigencia')?.value||'',
    codigo:document.getElementById('p_codigo')?.value||'',
    personal:getSelectedPersonal(),
    puesto:document.getElementById('p_puesto')?.value||''
  };
}

