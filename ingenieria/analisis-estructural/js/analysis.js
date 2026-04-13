// ═══ Analysis — generación y chat ═══

function goToAnalysis(){
  if(!getKey()){alert('Configura tu API Key en ⚙️ Configuración');toggleConfig();return}
  document.getElementById('analysisDocNum').textContent=D.num_documento||'Sin número';
  analysisData=getCleanData();
  localStorage.setItem('fts_system_prompt',getSystemPrompt());
  showScreen('scr-analysis');
}

async function generateAnalysis(){
  const key=getKey();
  if(!key){alert('Configura tu API Key en ⚙️ Configuración');toggleConfig();return}
  analysisData=getCleanData();

  // Clear status
  document.getElementById('statusLog').innerHTML='';
  statusLog('Preparando datos del proyecto...','#2980b9');

  // Ocultar #reportArea durante generación — chat visible con log
  const reportArea=document.getElementById('reportArea');
  reportArea.style.display='none';
  reportArea.innerHTML='<div class="report-container" id="reportContent" style="min-height:200px"></div>';
  const reportContent=document.getElementById('reportContent');

  // Mostrar chat con mensaje inicial de log
  const chatArea=document.getElementById('chatArea');
  chatArea.style.display='block';
  const msgsEl=document.getElementById('chatMsgs');
  msgsEl.innerHTML='<div class="chat-msg ai" id="genLogBubble"><div class="chat-avatar" style="background:var(--green)">🤖</div><div class="chat-bubble" id="genLogContent"><div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle"></div> <span>Generando análisis estructural...</span><div id="genLogLines" style="margin-top:8px;font-size:11px;color:#666;font-family:monospace"></div></div></div>';

  // Ocultar footer mientras genera
  document.getElementById('analysisFooter').style.display='none';

  let lastReportedTokens=0;

  // Construir content array con imágenes FEA + texto
  const content = [];
  // Filtrar imágenes relevantes (FEA, planos, renders 3D)
  const feaImgs = (typeof rawUploadedFiles !== 'undefined' && rawUploadedFiles) ? rawUploadedFiles.filter(function(f){
    if(!f || !f.name || !f.type || !f.type.startsWith('image/')) return false;
    const n = f.name.toLowerCase();
    return n.includes('fea') || n.includes('fusion') || n.includes('plano') ||
           n.includes('render') || n.includes('3d') || n.includes('von') ||
           n.includes('mises') || n.includes('stress') || n.includes('ansys');
  }) : [];
  // Máximo 4 imágenes para no exceder tokens
  feaImgs.slice(0,4).forEach(function(f){
    const mediaType = f.type || 'image/jpeg';
    const base64 = (f.data||'').split(',')[1] || f.data || '';
    if(base64){
      content.push({type:'image', source:{type:'base64', media_type:mediaType, data:base64}});
    }
  });
  if(feaImgs.length>0){
    statusLog('Incluyendo '+Math.min(feaImgs.length,4)+' imagen(es) FEA/planos en el análisis','#1abc9c');
  }
  // Texto al final con los datos del proyecto
  content.push({type:'text', text:'Genera el análisis estructural completo para el siguiente proyecto. Responde SOLO en HTML (sin markdown, sin backticks). Datos del proyecto:\n\n'+JSON.stringify(analysisData,null,2)});

  chatHistory=[{role:'user', content:content}];

  await streamFromClaude(chatHistory,
    // onDelta — renderizar en reportContent (invisible) + log al chat cada 500 tokens
    (delta,fullText)=>{
      let clean=fullText.replace(/```html|```/g,'').trim();
      reportContent.innerHTML=clean;
      const approxTok=Math.floor(fullText.length/4);
      if(approxTok-lastReportedTokens>=500){
        lastReportedTokens=approxTok;
        const lines=document.getElementById('genLogLines');
        if(lines) lines.innerHTML+='<div>• ~'+approxTok+' tokens generados</div>';
        const msgs=document.getElementById('chatMsgs');
        if(msgs) msgs.scrollTop=msgs.scrollHeight;
      }
    },
    // onDone
    (finalText)=>{
      let clean=finalText.replace(/```html|```/g,'').trim();
      analysisReport=clean;
      chatHistory.push({role:'assistant',content:clean});
      reportContent.innerHTML=clean;
      // Mostrar reporte
      reportArea.style.display='block';
      // Reemplazar burbuja de log por mensaje de éxito
      const bubble=document.getElementById('genLogContent');
      if(bubble) bubble.innerHTML='✅ <strong>Análisis completado</strong> — revisa el reporte arriba. Puedes pedir ajustes en el chat o descargar el PDF.';
      // Mostrar footer con botón PDF
      document.getElementById('analysisFooter').style.display='flex';
      // Scroll al reporte
      reportArea.scrollIntoView({behavior:'smooth',block:'start'});
    },
    // onError
    (err)=>{
      reportArea.style.display='block';
      reportArea.innerHTML=`<div style="max-width:740px;margin:0 auto"><div style="background:#fdedec;border-radius:12px;padding:20px;color:#c0392b;font-size:13px"><strong>Error:</strong> ${esc(err.message)}<br><br><strong>Posibles causas:</strong><ul style="margin:8px 0;padding-left:20px"><li>API Key inválida o expirada</li><li>Modelo no disponible en tu plan</li><li>Datos del proyecto demasiado grandes</li><li>Problema de red / CORS</li></ul></div><div style="text-align:center;margin-top:16px"><button class="btn btn-s" onclick="generateAnalysis()">🔄 Reintentar</button> <button class="btn btn-g" style="margin-left:8px" onclick="toggleConfig()">⚙️ Ver Config</button></div></div>`;
      const bubble=document.getElementById('genLogContent');
      if(bubble) bubble.innerHTML='❌ Error en la generación: '+esc(err.message);
    }
  );
}

async function sendChat(){
  const input=document.getElementById('chatInput');
  const msg=input.value.trim();
  if(!msg)return;
  input.value='';

  const msgsEl=document.getElementById('chatMsgs');
  msgsEl.innerHTML+=`<div class="chat-msg user"><div class="chat-avatar">👤</div><div class="chat-bubble">${esc(msg)}</div></div>`;

  // Add typing indicator
  const typingId='typing_'+Date.now();
  msgsEl.innerHTML+=`<div class="chat-msg ai" id="${typingId}"><div class="chat-avatar" style="background:linear-gradient(135deg,#1abc9c,#16a085)">🤖</div><div class="chat-bubble" id="${typingId}_bubble"><div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle"></div> <span style="color:#7f8c8d;font-size:12px">Pensando...</span></div></div>`;
  msgsEl.scrollTop=msgsEl.scrollHeight;

  chatHistory.push({role:'user',content:msg+'\n\nSi tu respuesta incluye un análisis actualizado, responde con el HTML completo del reporte. Si es solo conversacional, responde normalmente. Siempre usa HTML para tablas y cálculos (sin markdown).'});

  await streamFromClaude(chatHistory,
    // onDelta — stream into chat bubble
    (delta,fullText)=>{
      const bubble=document.getElementById(typingId+'_bubble');
      if(bubble){
        let clean=fullText.replace(/```html|```/g,'').trim();
        bubble.innerHTML=clean;
        msgsEl.scrollTop=msgsEl.scrollHeight;
      }
    },
    // onDone
    (finalText)=>{
      let clean=finalText.replace(/```html|```/g,'').trim();
      chatHistory.push({role:'assistant',content:clean});

      // Check if it's a full report update
      const isReport=(clean.match(/<h1>/g)||[]).length>=3;
      if(isReport){
        analysisReport=clean;
        document.getElementById('reportContent').innerHTML=clean;
        const bubble=document.getElementById(typingId+'_bubble');
        if(bubble)bubble.innerHTML='✅ <strong>Reporte actualizado.</strong> Revisa los cambios arriba. Puedes imprimir la nueva versión.';
      }
      msgsEl.scrollTop=msgsEl.scrollHeight;
    },
    // onError
    (err)=>{
      const bubble=document.getElementById(typingId+'_bubble');
      if(bubble)bubble.innerHTML=`<span style="color:#e74c3c">Error: ${esc(err.message)}</span>`;
      chatHistory.pop();
    }
  );
}

function regenerateAnalysis(){
  chatHistory=[];
  document.getElementById('chatMsgs').innerHTML='';
  document.getElementById('chatArea').style.display='none';
  document.getElementById('analysisFooter').style.display='none';
  generateAnalysis();
}

