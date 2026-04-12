// ═══ API — Claude streaming + config ═══

const DEFAULT_SYSTEM=`Eres un ingeniero estructural senior especializado en sistemas de izaje industrial, soportes de tubería, mezzanines y estructuras de acero. Tu tarea es generar un ANÁLISIS ESTRUCTURAL COMPLETO en formato HTML.

NORMAS: AISC 360-10, AISC Design Guide 7, CMAA 74, ACI 318-19, ASCE 7-10, IMCA.

FORMATO DE RESPUESTA: HTML puro (sin markdown, sin backticks). Usa estas clases CSS disponibles:
- <div class="ok-box">CUMPLE — texto</div> para verificaciones que pasan
- <div class="warn-box">OBSERVACIÓN — texto</div> para advertencias
- <table> con <th> y <td> para tablas de cálculo
- <h1> para secciones principales, <h2> para subsecciones

ESTRUCTURA DEL ANÁLISIS:
1. INTRODUCCIÓN — Alcance y descripción del sistema
2. CRITERIOS GENERALES — Normas, materiales con Fy/Fu/E
3. DESCRIPCIÓN DEL SISTEMA — Tabla de parámetros
4. PROPIEDADES DE SECCIONES — Valores AISC tabulados (imperiales + métricos)
5. CARGAS Y COMBINACIONES — CM desglosada, CV con factor impacto CMAA, combinaciones LRFD/ASD, fuerza horizontal grúa 20%
6. DISEÑO DEL MONORRIEL — Flexión (φMn vs Mu), Cortante (φVn vs Vu), Deflexión (δ vs L/450). Tabla: Variable|Fórmula|Resultado|Unidad
7. DISEÑO DE VIGAS PRINCIPALES — Flexión + deflexión
8. DISEÑO DE COLUMNAS — Pandeo Euler (K=1.2 sin arriostres), Interacción AISC H1-1
9. DISEÑO DE PLACA BASE — Presión de contacto + espesor mínimo
10. DISEÑO DE TAQUETES — Tensión + Cortante + Interacción ACI 318 (5/3)
11. VALIDACIÓN FEA — Si hay datos, tabla resumen con FS = Fy/σ_max
12. CONCLUSIONES — Tabla resumen: Elemento|Actuante|Admisible|FS|Estado

CÁLCULOS OBLIGATORIOS:
- Factor impacto CMAA: A=1.10, B=1.25, C=1.35, D=1.50
- Pandeo: K=1.2 sin arriostres. KL/r < 200. Fe=π²E/(KL/r)². Fcr según AISC E3.
- Interacción H1-1: Si Pr/φPn ≥ 0.2 usar ec.(a), si no ec.(b)
- Fuerza horizontal grúa: H = 20% × (P_hoist + P_carga) × g
- Taquetes: (T/φN)^(5/3) + (V/φV)^(5/3) ≤ 1.0
- FS mínimos: Flexión≥1.67, Pandeo≥2.0, Placa≥2.0, Taquete≥2.0, FEA≥2.0

PROPIEDADES AISC: HSS 8x8x0.250(A=8.96in²,Ix=88.9in⁴,Zx=25.7in³,rx=3.15in), W8x28(A=8.24in²,Ix=98.0in⁴,Zx=27.2in³), W6x16(A=4.74in²,Ix=32.1in⁴,Zx=11.7in³,d=6.28in,tw=0.260in), W6x20(Ix=41.4in⁴,Zx=15.3in³)
MATERIALES: A36(Fy=250,Fu=400), A500_B(Fy=317,Fu=400), A572_50(Fy=345). E=200,000 MPa.
Conversión: 1in²=6.452cm², 1in⁴=41.623cm⁴, 1in³=16.387cm³

REGLAS:
- Cada verificación: tabla Variable|Fórmula|Resultado|Unidad + caja ok-box o warn-box
- Valores numéricos REALES resueltos (no dejar fórmulas sin calcular)
- Unidades duales: métrico + imperial
- Tabla final de conclusiones con TODAS las verificaciones
- NO uses markdown — SOLO HTML`;

export function getKey(){return document.getElementById('apiKey').value.trim()}

export function checkApiKey(){
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

export function toggleKeyVis(){const i=document.getElementById('apiKey');i.type=i.type==='password'?'text':'password'}

export async function testApiKey(){
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

export function getSystemPrompt(){return document.getElementById('cfgSystemPrompt')?.value||DEFAULT_SYSTEM}

export function getModel(){return document.getElementById('cfgModel')?.value||'claude-sonnet-4-6'}

export function getMaxTokens(){return parseInt(document.getElementById('cfgTokens')?.value)||16000}

export function getTemp(){return (parseInt(document.getElementById('cfgTemp')?.value)||30)/100}

export function resetSystemPrompt(){document.getElementById('cfgSystemPrompt').value=DEFAULT_SYSTEM;localStorage.removeItem('fts_system_prompt')}

export function toggleConfig(){const p=document.getElementById('configOverlay');p.style.display=p.style.display==='none'?'flex':'none'}

export function clearErrorLog(){document.getElementById('errorLog').innerHTML='<span style="color:rgba(255,255,255,.2)">Sin errores</span>'}

export function logError(msg){
  const el=document.getElementById('errorLog');
  const ts=new Date().toLocaleTimeString();
  if(el.querySelector('span'))el.innerHTML='';
  el.innerHTML+=`<div style="margin-bottom:4px">[${ts}] ${esc(msg)}</div>`;
  el.scrollTop=el.scrollHeight;
}

export function statusLog(msg,color){
  const bar=document.getElementById('statusBar');
  const log=document.getElementById('statusLog');
  bar.style.display='block';
  const ts=new Date().toLocaleTimeString();
  log.innerHTML+=`<div style="color:${color||'rgba(255,255,255,.5)'}">[${ts}] ${msg}</div>`;
  log.scrollTop=log.scrollHeight;
}

export function updateTokenStats(input,output){
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

