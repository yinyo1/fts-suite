// ═══ Analysis — generación y chat ═══


export function goToAnalysis(){
  if(!getKey()){alert('Configura tu API Key en ⚙️ Configuración');toggleConfig();return}
  document.getElementById('analysisDocNum').textContent=D.num_documento||'Sin número';
  analysisData=getCleanData();
  localStorage.setItem('fts_system_prompt',getSystemPrompt());
  showScreen('scr-analysis');
}

export async function generateAnalysis(){
  const key=getKey();
  if(!key){alert('Configura tu API Key en ⚙️ Configuración');toggleConfig();return}
  analysisData=getCleanData();
  
  // Clear status
  document.getElementById('statusLog').innerHTML='';
  statusLog('Preparando datos del proyecto...','#2980b9');
  
  // Create report container for streaming
  const reportArea=document.getElementById('reportArea');
  reportArea.innerHTML='<div class="report-container" id="reportContent" style="min-height:200px"></div>';
  const reportContent=document.getElementById('reportContent');

  chatHistory=[{role:'user',content:'Genera el análisis estructural completo para el siguiente proyecto. Responde SOLO en HTML (sin markdown, sin backticks). Datos del proyecto:\n\n'+JSON.stringify(analysisData,null,2)}];

  await streamFromClaude(chatHistory,
    // onDelta — progressive render
    (delta,fullText)=>{
      let clean=fullText.replace(/```html|```/g,'').trim();
      reportContent.innerHTML=clean;
      // Auto-scroll to bottom of report
      reportArea.scrollIntoView({behavior:'smooth',block:'end'});
    },
    // onDone
    (finalText)=>{
      let clean=finalText.replace(/```html|```/g,'').trim();
      analysisReport=clean;
      chatHistory.push({role:'assistant',content:clean});
      reportContent.innerHTML=clean;
      document.getElementById('chatArea').style.display='block';
      document.getElementById('analysisFooter').style.display='flex';
    },
    // onError
    (err)=>{
      reportArea.innerHTML=`<div style="max-width:740px;margin:0 auto"><div style="background:#fdedec;border-radius:12px;padding:20px;color:#c0392b;font-size:13px"><strong>Error:</strong> ${esc(err.message)}<br><br><strong>Posibles causas:</strong><ul style="margin:8px 0;padding-left:20px"><li>API Key inválida o expirada</li><li>Modelo no disponible en tu plan</li><li>Datos del proyecto demasiado grandes</li><li>Problema de red / CORS</li></ul></div><div style="text-align:center;margin-top:16px"><button class="btn btn-s" onclick="generateAnalysis()">🔄 Reintentar</button> <button class="btn btn-g" style="margin-left:8px" onclick="toggleConfig()">⚙️ Ver Config</button></div></div>`;
    }
  );
}

export async function sendChat(){
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

export function regenerateAnalysis(){
  chatHistory=[];
  document.getElementById('chatMsgs').innerHTML='';
  document.getElementById('chatArea').style.display='none';
  document.getElementById('analysisFooter').style.display='none';
  generateAnalysis();
}
