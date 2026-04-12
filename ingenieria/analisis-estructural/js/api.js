// ═══ API — Claude streaming ═══


export function getKey(){return document.getElementById('apiKey').value.trim()}

export function checkApiKey(){

export function toggleKeyVis(){const i=document.getElementById('apiKey');i.type=i.type==='password'?'text':'password'}

export async function testApiKey(){

export function getSystemPrompt(){return document.getElementById('cfgSystemPrompt')?.value||DEFAULT_SYSTEM}

export function getModel(){return document.getElementById('cfgModel')?.value||'claude-sonnet-4-6'}

export function getMaxTokens(){return parseInt(document.getElementById('cfgTokens')?.value)||16000}

export function getTemp(){return (parseInt(document.getElementById('cfgTemp')?.value)||30)/100}

export function resetSystemPrompt(){document.getElementById('cfgSystemPrompt').value=DEFAULT_SYSTEM;localStorage.removeItem('fts_system_prompt')}

export function toggleConfig(){const p=document.getElementById('configOverlay');p.style.display=p.style.display==='none'?'flex':'none'}

export function clearErrorLog(){document.getElementById('errorLog').innerHTML='<span style="color:rgba(255,255,255,.2)">Sin errores</span>'}

export function logError(msg){

export function statusLog(msg,color){

export function updateTokenStats(input,output){

export async function streamFromClaude(messages,onDelta,onDone,onError){
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
