// ═══ API — Claude streaming + config ═══

function getKey(){return document.getElementById('apiKey').value.trim()}

function checkApiKey(){
  const k=getKey();const dot=document.getElementById('apiDot');const st=document.getElementById('apiStatus');
  const dotM=document.getElementById('apiDotMain');const stM=document.getElementById('apiStatusMain');
  if(k.startsWith('sk-ant-')){
    if(dot){dot.style.background='#f39c12'}if(st){st.style.color='#f39c12';st.textContent='Ingresada (no verificada)'}
    if(dotM){dotM.style.background='#f39c12'}if(stM){stM.style.color='#f39c12';stM.textContent='Ingresada'}
  }else if(!k){
    if(dot){dot.style.background='#e74c3c'}if(st){st.style.color='#e74c3c';st.textContent='No configurada'}
    if(dotM){dotM.style.background='#e74c3c'}if(stM){stM.style.color='#e74c3c';stM.textContent='Sin API Key'}
  }
  localStorage.setItem('fts_api_key',k);
}

function toggleKeyVis(){const i=document.getElementById('apiKey');i.type=i.type==='password'?'text':'password'}

async function testApiKey(){
  const k=getKey();if(!k){alert('Ingresa tu API key');return}
  const dot=document.getElementById('apiDot');const st=document.getElementById('apiStatus');
  const dotM=document.getElementById('apiDotMain');const stM=document.getElementById('apiStatusMain');
  if(st){st.textContent='Probando...';st.style.color='#f39c12'}
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':k,'anthropic-version':'2023-06-01','content-type':'application/json','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:20,messages:[{role:'user',content:'ping'}]})});
    if(r.ok){
      if(dot){dot.style.background='#27ae60'}if(st){st.style.color='#27ae60';st.textContent='✓ Conectada'}
      if(dotM){dotM.style.background='#27ae60'}if(stM){stM.style.color='#27ae60';stM.textContent='✓ Conectada'}
    }else{
      const e=await r.json();const msg='Error: '+(e.error?.message||r.status);
      if(dot){dot.style.background='#e74c3c'}if(st){st.style.color='#e74c3c';st.textContent=msg}
      if(dotM){dotM.style.background='#e74c3c'}if(stM){stM.style.color='#e74c3c';stM.textContent='Error'}
      logError(msg);
    }
  }catch(e){
    if(dot){dot.style.background='#e74c3c'}if(st){st.style.color='#e74c3c';st.textContent='Error de red'}
    if(dotM){dotM.style.background='#e74c3c'}if(stM){stM.style.color='#e74c3c';stM.textContent='Error red'}
    logError('Test API: '+e.message);
  }
}

function getSystemPrompt(){return document.getElementById('cfgSystemPrompt')?.value||DEFAULT_SYSTEM}

function getModel(){return document.getElementById('cfgModel')?.value||'claude-sonnet-4-6'}

function getMaxTokens(){return parseInt(document.getElementById('cfgTokens')?.value)||16000}

function getTemp(){return (parseInt(document.getElementById('cfgTemp')?.value)||30)/100}

function resetSystemPrompt(){document.getElementById('cfgSystemPrompt').value=DEFAULT_SYSTEM;localStorage.removeItem('fts_system_prompt')}

function toggleConfig(){const p=document.getElementById('configOverlay');p.style.display=p.style.display==='none'?'flex':'none'}

function clearErrorLog(){document.getElementById('errorLog').innerHTML='<span style="color:rgba(255,255,255,.2)">Sin errores</span>'}

function logError(msg){
  const el=document.getElementById('errorLog');
  const ts=new Date().toLocaleTimeString();
  if(el.querySelector('span'))el.innerHTML='';
  el.innerHTML+=`<div style="margin-bottom:4px">[${ts}] ${esc(msg)}</div>`;
  el.scrollTop=el.scrollHeight;
}

function statusLog(msg,color){
  const bar=document.getElementById('statusBar');
  const log=document.getElementById('statusLog');
  bar.style.display='block';
  const ts=new Date().toLocaleTimeString();
  log.innerHTML+=`<div style="color:${color||'rgba(255,255,255,.5)'}">[${ts}] ${msg}</div>`;
  log.scrollTop=log.scrollHeight;
}

function updateTokenStats(input,output){
  totalInputTokens+=input||0;
  totalOutputTokens+=output||0;
  totalCalls++;
  document.getElementById('statInput').textContent=totalInputTokens.toLocaleString();
  document.getElementById('statOutput').textContent=totalOutputTokens.toLocaleString();
  document.getElementById('statCalls').textContent=totalCalls;
  const badge=document.getElementById('tokenBadge');
  badge.style.display='inline';
  badge.textContent=`${(totalInputTokens+totalOutputTokens).toLocaleString()} tok`;
  // Status bar
  const stTok=document.getElementById('statusTokens');
  stTok.textContent=`Sesión: ${totalInputTokens.toLocaleString()} in + ${totalOutputTokens.toLocaleString()} out = ${(totalInputTokens+totalOutputTokens).toLocaleString()} total (${totalCalls} calls)`;
  statusLog(`Tokens: +${(input||0).toLocaleString()} in, +${(output||0).toLocaleString()} out`,'#1abc9c');
}

async function streamFromClaude(messages,onDelta,onDone,onError){
  const key=getKey();
  const model=getModel();
  const maxTok=getMaxTokens();
  const body={model,max_tokens:maxTok,system:getSystemPrompt(),messages,stream:true};
  const temp=getTemp();
  if(temp>0)body.temperature=temp;

  let inputTok=0,outputTok=0;
  const progress=document.getElementById('streamProgress');
  const statusEl=document.getElementById('streamStatus');
  const tokenCountEl=document.getElementById('streamTokenCount');
  const barEl=document.getElementById('streamBar');
  progress.style.display='block';
  statusEl.textContent='Conectando con Claude...';
  barEl.style.width='2%';
  statusLog(`Iniciando request → ${model} (max ${maxTok.toLocaleString()} tokens)`,'#2980b9');

  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify(body)
    });
    if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error?.message||`HTTP ${r.status}: ${r.statusText}`)}
    
    statusEl.textContent='Recibiendo stream...';
    statusLog('Conexión establecida, recibiendo stream...','#1abc9c');
    barEl.style.width='10%';
    const reader=r.body.getReader();
    const decoder=new TextDecoder();
    let buffer='';
    let tokensOut=0;
    let fullText='';

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
            statusEl.textContent=`Procesando (${inputTok.toLocaleString()} tokens entrada)...`;
            barEl.style.width='15%';
          }
          if(evt.type==='content_block_delta'&&evt.delta?.text){
            fullText+=evt.delta.text;
            tokensOut+=evt.delta.text.split(/\s+/).length; // approx
            onDelta(evt.delta.text,fullText);
            const pct=Math.min(15+tokensOut/50,95);
            barEl.style.width=pct+'%';
            tokenCountEl.textContent=`~${tokensOut} tokens`;
            statusEl.textContent=`Generando análisis... (${tokensOut} tokens)`;
          }
          if(evt.type==='message_delta'&&evt.usage){
            outputTok=evt.usage.output_tokens||tokensOut;
          }
        }catch(pe){/* skip malformed events */}
      }
    }
    barEl.style.width='100%';
    statusEl.textContent='✅ Completado';
    statusLog(`✅ Completado — ${(outputTok||tokensOut).toLocaleString()} tokens generados`,'#27ae60');
    updateTokenStats(inputTok,outputTok||tokensOut);
    setTimeout(()=>{progress.style.display='none'},2000);
    onDone(fullText);
  }catch(err){
    progress.style.display='none';
    logError(err.message);
    statusLog(`❌ Error: ${err.message}`,'#e74c3c');
    if(inputTok>0)updateTokenStats(inputTok,outputTok);
    onError(err);
  }
}

