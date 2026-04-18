// ═══ Raw mode — procesamiento libre ═══

function startRaw(){if(!getKey()){alert('Configura tu API Key en ⚙️ Configuración');toggleConfig();return}showScreen('scr-raw');updateRawCounter()}

function updateRawCounter(){
  const t=document.getElementById('rawText').value;
  document.getElementById('rawCounter').textContent=t.length+' caracteres'+(rawUploadedFiles.length>0?' · '+rawUploadedFiles.length+' archivos':'');
}

function handleRawFiles(inp){
  [...inp.files].forEach(f=>{
    const reader=new FileReader();
    reader.onload=e=>{ rawUploadedFiles.push({name:f.name,size:f.size,type:f.type,data:e.target.result}); renderRawFiles(); updateRawCounter(); };
    reader.readAsDataURL(f);
  });
  inp.value='';
}

function removeRawFile(i){rawUploadedFiles.splice(i,1);renderRawFiles();updateRawCounter()}

function renderRawFiles(){
  const c=document.getElementById('rawFilesList');
  c.innerHTML=rawUploadedFiles.map((f,i)=>{
    const isImg=f.type.startsWith('image/');
    return`<div class="file-item">${isImg?`<img src="${f.data}">`:`<div class="fi-icon">📄</div>`}<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:#2c3e50;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</div><div style="font-size:11px;color:#7f8c8d">${(f.size/1024).toFixed(0)} KB</div></div><button onclick="removeRawFile(${i})" style="background:none;border:none;font-size:18px;cursor:pointer;color:#e74c3c">✕</button></div>`;
  }).join('');
}

async function processRaw(){
  const text=document.getElementById('rawText').value.trim();
  if(!text&&rawUploadedFiles.length===0){alert('Ingresa texto o archivos');return}
  const key=getKey();if(!key){alert('Configura tu API Key en ⚙️ Configuración');toggleConfig();return}
  const btn=document.getElementById('btnProcess');btn.disabled=true;btn.textContent='Procesando...';
  
  const prog=document.getElementById('rawProgress');prog.style.display='block';
  const logEl=document.getElementById('rawLog');
  const titleEl=document.getElementById('rawStatusTitle');
  const spinEl=document.getElementById('rawSpinner');
  const tokEl=document.getElementById('rawTokenInfo');
  const prevEl=document.getElementById('rawStreamPreview');
  const prevText=document.getElementById('rawStreamText');
  logEl.innerHTML='';prevText.textContent='';prevEl.style.display='none';
  
  function rlog(msg,color){
    const ts=new Date().toLocaleTimeString();
    logEl.innerHTML+=`<div style="color:${color||'rgba(255,255,255,.6)'}"><span style="color:rgba(255,255,255,.25)">[${ts}]</span> ${msg}</div>`;
    logEl.scrollTop=logEl.scrollHeight;
  }
  
  rlog('🚀 Iniciando procesamiento...','#1abc9c');
  titleEl.textContent='Preparando datos...';
  
  // Build content
  rlog(`📝 Texto: ${text.length} caracteres`);
  const content=[];
  if(rawUploadedFiles.length>0){
    rlog(`📎 Procesando ${rawUploadedFiles.length} archivo(s)...`);
    let totalSize=0;
    rawUploadedFiles.forEach((f,i)=>{
      const sizeKB=(f.data.length*0.75/1024).toFixed(0);
      totalSize+=parseInt(sizeKB);
      if(f.type.startsWith('image/')){
        content.push({type:'image',source:{type:'base64',media_type:f.type,data:f.data.split(',')[1]}});
        content.push({type:'text',text:'[Archivo: '+f.name+']'});
        rlog(`  ✓ ${f.name} <span style="color:#7f8c8d">(imagen, ${sizeKB} KB)</span>`,'#1abc9c');
      }else if(f.type==='application/pdf'){
        content.push({type:'document',source:{type:'base64',media_type:'application/pdf',data:f.data.split(',')[1]}});
        content.push({type:'text',text:'[PDF: '+f.name+']'});
        rlog(`  ✓ ${f.name} <span style="color:#7f8c8d">(PDF, ${sizeKB} KB)</span>`,'#1abc9c');
      }else if(f.type==='text/plain'||f.name.toLowerCase().endsWith('.txt')){
        const textContent=atob(f.data.split(',')[1].replace(/-/g,'+').replace(/_/g,'/'));
        content.push({type:'text',text:'=== ARCHIVO TXT: '+f.name+' ===\n'+textContent+'\n=== FIN '+f.name+' ==='});
        rlog(`  ✓ ${f.name} <span style="color:#7f8c8d">(TXT, ${sizeKB} KB)</span>`,'#1abc9c');
      }else{
        rlog(`  ⚠ ${f.name} <span style="color:#7f8c8d">(tipo no soportado: ${f.type}, omitido)</span>`,'#f39c12');
      }
    });
    rlog(`📊 Payload total archivos: ~${totalSize} KB`);
  }
  content.push({type:'text',text:'Extrae todos los datos estructurales:\n\n'+(text||'(Analiza solo los archivos)')});
  
  const model=getModel();
  const maxTok=getMaxTokens();
  rlog(`🤖 Modelo: ${model}`);
  rlog(`🔢 Max tokens: ${maxTok.toLocaleString()}`);
  
  const bodyStr=JSON.stringify({model,max_tokens:maxTok,system:RAW_EXTRACT_PROMPT,messages:[{role:'user',content}],stream:true});
  rlog(`📤 Request size: ${(bodyStr.length/1024).toFixed(0)} KB`);
  
  titleEl.textContent='Conectando con Claude API...';
  rlog('🌐 Enviando request a api.anthropic.com...','#2980b9');
  
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json','anthropic-dangerous-direct-browser-access':'true'},
      body:bodyStr
    });
    
    if(!r.ok){
      const errBody=await r.text();
      let errMsg=`HTTP ${r.status} ${r.statusText}`;
      try{const ej=JSON.parse(errBody);errMsg=ej.error?.message||errMsg;rlog(`📋 Response body: ${errBody.substring(0,500)}`,'#e74c3c')}catch(e){}
      rlog(`❌ ${errMsg}`,'#e74c3c');
      if(r.status===400)rlog('💡 Posible causa: payload demasiado grande (muchas imágenes de alta resolución). Intenta con menos archivos o imágenes más pequeñas.','#f39c12');
      if(r.status===401)rlog('💡 API Key inválida o expirada. Verifica en ⚙️ Configuración.','#f39c12');
      if(r.status===429)rlog('💡 Rate limit excedido. Espera un momento e intenta de nuevo.','#f39c12');
      if(r.status===529)rlog('💡 API sobrecargada. Intenta en unos minutos.','#f39c12');
      throw new Error(errMsg);
    }
    
    rlog('✅ Conexión establecida — recibiendo stream...','#27ae60');
    titleEl.textContent='Recibiendo respuesta de Claude...';
    prevEl.style.display='block';
    
    const reader=r.body.getReader();
    const decoder=new TextDecoder();
    let buffer='',fullText='',tokensOut=0,inputTok=0;
    
    while(true){
      const{done,value}=await reader.read();
      if(done)break;
      buffer+=decoder.decode(value,{stream:true});
      const lines=buffer.split('\n');
      buffer=lines.pop()||'';
      
      for(const line of lines){
        if(!line.startsWith('data: '))continue;
        const jsonStr=line.slice(6).trim();
        if(!jsonStr||jsonStr==='[DONE]')continue;
        try{
          const evt=JSON.parse(jsonStr);
          if(evt.type==='message_start'&&evt.message?.usage){
            inputTok=evt.message.usage.input_tokens||0;
            rlog(`📥 Input tokens: ${inputTok.toLocaleString()}`,'#2980b9');
            tokEl.textContent=`${inputTok.toLocaleString()} in`;
            titleEl.textContent=`Claude procesando (${inputTok.toLocaleString()} tokens entrada)...`;
          }
          if(evt.type==='content_block_delta'&&evt.delta?.text){
            fullText+=evt.delta.text;
            tokensOut++;
            prevText.textContent=fullText.substring(Math.max(0,fullText.length-500));
            prevEl.scrollTop=prevEl.scrollHeight;
            if(tokensOut%50===0){
              tokEl.textContent=`${inputTok.toLocaleString()} in / ~${tokensOut} out`;
              titleEl.textContent=`Generando JSON... (${tokensOut} tokens)`;
            }
          }
          if(evt.type==='message_delta'&&evt.usage){
            const outFinal=evt.usage.output_tokens||tokensOut;
            rlog(`📤 Output tokens: ${outFinal.toLocaleString()}`,'#1abc9c');
            tokEl.textContent=`${inputTok.toLocaleString()} in / ${outFinal.toLocaleString()} out`;
            updateTokenStats(inputTok,outFinal);
          }
          if(evt.type==='error'){
            rlog(`❌ Stream error: ${JSON.stringify(evt.error)}`,'#e74c3c');
          }
        }catch(pe){/* skip */}
      }
    }
    
    rlog('📦 Stream completo. Parseando JSON...','#1abc9c');
    titleEl.textContent='Parseando respuesta...';
    spinEl.style.display='none';
    
    let txt=fullText.replace(/```json|```/g,'').trim();
    let parsed;
    try{
      parsed=JSON.parse(txt);
      rlog(`✅ JSON parseado correctamente — ${Object.keys(parsed).length} campos`,'#27ae60');
    }catch(e1){
      rlog(`⚠️ JSON incompleto, intentando reparar... (${e1.message})`,'#f39c12');
      let fix=txt;
      const opens=(fix.match(/{/g)||[]).length;
      const closes=(fix.match(/}/g)||[]).length;
      if(fix.match(/:\s*"[^"]*$/))fix+='"';
      fix=fix.replace(/,\s*$/,'');
      for(let i=0;i<opens-closes;i++)fix+='}';
      try{
        parsed=JSON.parse(fix);
        rlog(`✅ JSON reparado — ${Object.keys(parsed).length} campos recuperados`,'#f39c12');
      }catch(e2){
        const pairs={};
        const rx=/"([^"]+)"\s*:\s*(?:"([^"]*)"|(true|false|[\d.]+))/g;
        let m;while(m=rx.exec(txt))pairs[m[1]]=m[3]==='true'?true:m[3]==='false'?false:(m[2]!==undefined?m[2]:m[3]);
        if(Object.keys(pairs).length>0){
          parsed=pairs;parsed._resumen='⚠️ JSON reparado parcialmente. Algunos campos pueden faltar.';
          rlog(`⚠️ Reparación parcial — ${Object.keys(pairs).length} campos extraídos con regex`,'#f39c12');
        }else{
          rlog(`❌ No se pudo parsear la respuesta`,'#e74c3c');
          rlog(`📋 Respuesta raw (primeros 300 chars): ${esc(txt.substring(0,300))}`,'#7f8c8d');
          throw new Error('No se pudo parsear el JSON de respuesta');
        }
      }
    }
    
    const sum=parsed._resumen||'Datos extraídos.';delete parsed._resumen;
    rlog(`🎉 Proceso completado — listo para revisión`,'#27ae60');
    titleEl.textContent='✅ Completado';
    titleEl.style.color='#27ae60';
    rawParsedData=parsed;
    
    setTimeout(()=>showResults(parsed,sum),800);
  }catch(err){
    spinEl.style.display='none';
    titleEl.textContent='❌ Error';
    titleEl.style.color='#e74c3c';
    rlog(`❌ FALLO: ${esc(err.message)}`,'#e74c3c');
    rlog('','');
    rlog('💡 Posibles soluciones:','#f39c12');
    rlog('  1. Verifica tu API Key en ⚙️ Configuración','#f39c12');
    rlog('  2. Reduce el número/tamaño de archivos','#f39c12');
    rlog('  3. Si usas imágenes grandes, redúcelas a <2MB cada una','#f39c12');
    rlog('  4. Verifica tu conexión a internet','#f39c12');
    rlog('  5. Si el error persiste, prueba con otro modelo','#f39c12');
    logError('processRaw: '+err.message);
  }
  btn.disabled=false;btn.textContent='🤖 Procesar con IA';
  titleEl.style.color='';
}

function showResults(parsed,summary){
  const fields=Object.entries(parsed).filter(([k])=>k in D);
  document.getElementById('resFieldCount').textContent=fields.length+' CAMPOS DETECTADOS';
  document.getElementById('resSummary').innerHTML='<div style="font-size:13px;font-weight:600;color:#1e8449;margin-bottom:4px">✅ '+esc(summary)+'</div><div style="font-size:12px;color:#27ae60">Copia el JSON directo o continúa al Wizard.</div>';
  document.getElementById('resFields').innerHTML=fields.map(([k,v])=>'<div class="sum-row"><span style="color:#7f8c8d;min-width:160px">'+k.replace(/_/g,' ')+'</span><span style="font-weight:600;color:#2c3e50;text-align:right;flex:1">'+(typeof v==='boolean'?(v?'Sí':'No'):esc(String(v)))+'</span></div>').join('');
  document.getElementById('resJsonArea').value=JSON.stringify(parsed,null,2);
  showScreen('scr-results');
}

function copyResJson(){
  const j=JSON.stringify(rawParsedData,null,2);
  navigator.clipboard.writeText(j).then(()=>{
    const b=event.target;b.textContent='✓ Copiado';b.classList.remove('btn-s');b.classList.add('btn-ok');
    setTimeout(()=>{b.textContent='📋 Copiar JSON';b.classList.remove('btn-ok');b.classList.add('btn-s')},2500);
  }).catch(()=>toggleResJson());
}

function downloadResJson(){
  const j=JSON.stringify(rawParsedData,null,2);
  const a=document.createElement('a');a.href='data:application/json;charset=utf-8,'+encodeURIComponent(j);a.download='FTS-raw-datos.json';a.click();
}

function toggleResJson(){const p=document.getElementById('resJsonPanel');p.style.display=p.style.display==='none'?'block':'none'}

function applyRawToWizard(){
  if(!rawParsedData)return;
  Object.entries(rawParsedData).forEach(([k,v])=>{if(k in D)D[k]=typeof v==='boolean'?v:String(v)});
  currentStep=0;showScreen('scr-wizard');render();
}

function applyRawAndAnalyze(){
  if(!rawParsedData)return;
  Object.entries(rawParsedData).forEach(([k,v])=>{if(k in D)D[k]=typeof v==='boolean'?v:String(v)});
  goToAnalysis();
}

