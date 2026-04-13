// ═══ Analysis — generación y chat ═══

// Checklist de secciones esperadas por tipo de estructura
const CHECKLIST = {
  polipasto: [
    'Introducción',
    'Criterios Generales',
    'Descripción del Sistema',
    'Propiedades de Secciones',
    'Cargas y Combinaciones',
    'Diseño del Monorriel',
    'Diseño de Vigas Principales',
    'Diseño de Columnas',
    'Diseño de Placa Base',
    'Diseño de Taquetes',
    'Validación FEA',
    'Conclusiones'
  ],
  tuberia: [
    'Introducción',
    'Criterios Generales',
    'Descripción del Sistema',
    'Propiedades de Secciones',
    'Cargas y Combinaciones',
    'Análisis de Golpe de Ariete',
    'Diseño de Soportes',
    'Diseño de Taquetes',
    'Conclusiones'
  ],
  mezz_personas: [
    'Introducción',
    'Criterios Generales',
    'Descripción del Sistema',
    'Cargas y Combinaciones',
    'Diseño de Vigas de Piso',
    'Diseño de Vigas Principales',
    'Diseño de Columnas',
    'Diseño de Taquetes',
    'Conclusiones'
  ],
  mezz_equipos: [
    'Introducción',
    'Criterios Generales',
    'Descripción del Sistema',
    'Cargas y Combinaciones',
    'Diseño de Vigas',
    'Diseño de Columnas',
    'Análisis de Vibración',
    'Diseño de Taquetes',
    'Conclusiones'
  ],
  tanque: [
    'Introducción',
    'Criterios Generales',
    'Descripción del Sistema',
    'Cargas y Combinaciones',
    'Análisis de Vuelco',
    'Diseño de Soportes',
    'Diseño de Taquetes',
    'Conclusiones'
  ],
  general: [
    'Introducción',
    'Criterios Generales',
    'Descripción del Sistema',
    'Cargas y Combinaciones',
    'Análisis Estructural',
    'Conclusiones'
  ]
};

// Verifica completitud del HTML generado por Claude
// Reemplaza marcadores <img data-fea-idx="N"> por las imágenes reales en base64
function replaceFEAMarkers(html){
  if(!window._feaImages || !window._feaImages.length) return html;
  return html.replace(
    /<img[^>]*data-fea-idx=["'](\d+)["'][^>]*>/g,
    function(match, idxStr){
      const idx = parseInt(idxStr);
      const img = window._feaImages[idx];
      if(!img || !img.data) return match;
      // Extraer alt si existe
      const altMatch = match.match(/alt=["']([^"']*)["']/);
      const alt = altMatch ? altMatch[1] : ('Imagen FEA '+(idx+1));
      return '<img src="'+img.data+'" alt="'+alt+'" style="max-width:100%;border-radius:8px;border:1px solid #e0e0e0;margin:8px 0">';
    }
  );
}

function checkCompletitud(html, tipo){
  const div = document.createElement('div');
  div.innerHTML = html;

  // Verificar firma de cierre
  const completo = div.querySelector('#reporte-completo');
  const incompleto = div.querySelector('#reporte-incompleto');

  // Detectar secciones presentes por h1/h2
  const headings = Array.from(div.querySelectorAll('h1, h2'))
    .map(function(h){ return h.textContent.trim(); });

  const checklist = CHECKLIST[tipo] || CHECKLIST['general'];
  const resultados = checklist.map(function(seccion){
    const key = seccion.toLowerCase().substring(0,8);
    const encontrado = headings.some(function(h){
      return h.toLowerCase().includes(key);
    });
    return { seccion: seccion, encontrado: encontrado };
  });

  const completadas = resultados.filter(function(r){ return r.encontrado; }).length;
  const total = resultados.length;
  const porcentaje = Math.round(completadas / total * 100);

  return {
    firmado: !!completo,
    truncado: !!incompleto,
    ultimaSeccion: (incompleto && incompleto.dataset && incompleto.dataset.ultimaSeccion) || null,
    completadas: completadas,
    total: total,
    porcentaje: porcentaje,
    resultados: resultados
  };
}

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

  // Construir content array con imágenes + texto
  const content = [];
  // Tomar TODAS las imágenes subidas (máximo 6 para no exceder tokens)
  const allImgs = (typeof rawUploadedFiles !== 'undefined' && rawUploadedFiles)
    ? rawUploadedFiles.filter(function(f){ return f && f.type && f.type.startsWith('image/'); })
    : [];
  const feaImgs = allImgs.slice(0, 6);

  // Mapa global de imágenes para reemplazo de marcadores en post-proceso
  window._feaImages = feaImgs.map(function(f, i){
    return { idx: i, data: f.data, type: f.type || 'image/jpeg', name: f.name || '' };
  });

  feaImgs.forEach(function(f){
    const mediaType = f.type || 'image/jpeg';
    const base64 = (f.data||'').split(',')[1] || f.data || '';
    if(base64){
      content.push({type:'image', source:{type:'base64', media_type:mediaType, data:base64}});
    }
  });
  if(feaImgs.length>0){
    statusLog('Incluyendo '+feaImgs.length+' imagen(es) en el análisis (marcadores data-fea-idx 0-'+(feaImgs.length-1)+')','#1abc9c');
  }
  // Texto al final con los datos del proyecto
  const imgHint = feaImgs.length>0
    ? '\n\nIMÁGENES DISPONIBLES: Recibes '+feaImgs.length+' imagen(es) numeradas desde idx=0 hasta idx='+(feaImgs.length-1)+'. Úsalas con <img data-fea-idx="N" alt="..."> en la sección 11 VALIDACIÓN FEA. El sistema reemplazará los marcadores con las imágenes reales automáticamente.'
    : '';
  content.push({type:'text', text:'Genera el análisis estructural completo para el siguiente proyecto. Responde SOLO en HTML (sin markdown, sin backticks). Datos del proyecto:\n\n'+JSON.stringify(analysisData,null,2)+imgHint});

  chatHistory=[{role:'user', content:content}];

  await streamFromClaude(chatHistory,
    // onDelta — renderizar en reportContent (invisible) + log al chat cada 500 tokens
    (delta,fullText)=>{
      let clean=fullText.replace(/```html|```/g,'').trim();
      clean=replaceFEAMarkers(clean);
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
      // Reemplazar marcadores <img data-fea-idx="N"> por imágenes reales
      clean = replaceFEAMarkers(clean);
      analysisReport=clean;
      chatHistory.push({role:'assistant',content:clean});
      reportContent.innerHTML=clean;
      // Mostrar reporte
      reportArea.style.display='block';

      // ═══ Verificar completitud del análisis ═══
      const tipo = (analysisData && analysisData.tipo_estructura) || 'general';
      const status = checkCompletitud(clean, tipo);

      // Badge de status en el chat
      let statusHTML = '';
      if (status.firmado){
        statusHTML =
          '<div style="background:#E2EFDA;border:1px solid #107C10;border-radius:8px;padding:12px;margin:8px 0;">'+
          '<strong style="color:#107C10">✅ Análisis completo</strong>'+
          '<span style="color:#555;font-size:13px;margin-left:8px;">'+
          status.completadas+'/'+status.total+' secciones ('+status.porcentaje+'%)</span>'+
          '</div>';
      } else if (status.truncado){
        statusHTML =
          '<div style="background:#FFF2CC;border:1px solid #BF8F00;border-radius:8px;padding:12px;margin:8px 0;">'+
          '<strong style="color:#BF8F00">⚠️ Análisis incompleto</strong>'+
          '<span style="color:#555;font-size:13px;margin-left:8px;">Última sección: '+(status.ultimaSeccion||'desconocida')+'</span>'+
          '<div style="margin-top:8px;font-size:12px;color:#666;">'+
          status.resultados.map(function(r){ return (r.encontrado?'✓':'✗')+' '+r.seccion; }).join(' &nbsp;|&nbsp; ')+
          '</div>'+
          '<div style="margin-top:8px;font-size:12px;color:#BF8F00;">💡 Aumenta max_tokens en Configuración IA o simplifica los datos de entrada.</div>'+
          '</div>';
      } else {
        statusHTML =
          '<div style="background:#FFF2CC;border:1px solid #BF8F00;border-radius:8px;padding:12px;margin:8px 0;">'+
          '<strong style="color:#BF8F00">⚠️ Posiblemente incompleto</strong>'+
          '<span style="color:#555;font-size:13px;margin-left:8px;">El análisis no tiene firma de cierre — puede haberse cortado por límite de tokens.</span>'+
          '<div style="margin-top:8px;font-size:12px;color:#666;">Secciones detectadas: '+status.completadas+'/'+status.total+' ('+status.porcentaje+'%)<br>'+
          status.resultados.map(function(r){ return (r.encontrado?'✓':'✗')+' '+r.seccion; }).join(' | ')+
          '</div></div>';
      }

      // Reemplazar burbuja de log por mensaje de éxito
      const bubble=document.getElementById('genLogContent');
      if(bubble){
        if(status.firmado){
          bubble.innerHTML='✅ <strong>Análisis completado</strong> — revisa el reporte arriba. Puedes pedir ajustes en el chat o descargar el PDF.';
        } else {
          bubble.innerHTML='⚠️ <strong>Análisis generado con advertencias</strong> — revisa el status abajo.';
        }
      }

      // Insertar status badge en el chat
      const chatMsgs = document.getElementById('chatMsgs');
      if (chatMsgs) {
        chatMsgs.insertAdjacentHTML('beforeend', statusHTML);
        chatMsgs.scrollTop = chatMsgs.scrollHeight;
      }

      // Mostrar footer con botón PDF + ajustar según completitud
      document.getElementById('analysisFooter').style.display='flex';
      const btnPDF = document.getElementById('btnPDF');
      if (btnPDF){
        if (status.firmado){
          btnPDF.style.background = '#0078D4';
          btnPDF.textContent = '📄 Descargar PDF';
        } else if (status.truncado){
          btnPDF.style.background = '#BF8F00';
          btnPDF.textContent = '⚠️ Descargar PDF (incompleto)';
        } else {
          btnPDF.style.background = '#BF8F00';
          btnPDF.textContent = '⚠️ Descargar PDF (posiblemente incompleto)';
        }
      }

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

