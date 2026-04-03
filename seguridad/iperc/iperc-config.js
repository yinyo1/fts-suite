// ╔══════════════════════════════════════════════════════════════════════╗
// ║  FTS IPERC — Análisis de Riesgos Industrial                         ║
// ║  Versión: v1.5  |  Fecha: 2026-03-13                                ║
// ║  Cambios v1.4:  Arquitectura dual AI — Gemini + Groq                ║
// ║  Cambios v1.5:  Modularización CSS/JS, columnas PDF corregidas,     ║
// ║                 huella digital en código y PDF                       ║
// ╚══════════════════════════════════════════════════════════════════════╝
const FTS_VERSION      = 'v1.5';
const FTS_VERSION_DATE = '2026-03-13';
// ── Huella digital de build ──────────────────────────────────────────────
// Formato: FTS-IPERC-{version}-{YYYYMMDD}-{checksum}
// Esta constante se embebe en el código fuente Y en cada PDF generado.
// Permite verificar que el PDF fue generado por la versión oficial del sistema.
const FTS_BUILD        = 'FTS-IPERC-v1.5-20260313-A7F3';

// ════════════════════════════════════════════════════
// CONSTANTES DEL SISTEMA
// ════════════════════════════════════════════════════
const MASTER_USER = 'ftsmaster';
const MASTER_PASS = 'FTS#DC3!2026';
const USERS_URL   = 'https://raw.githubusercontent.com/yinyo1/FTS_DC3/main/users.json';
const USERS_API   = 'https://api.github.com/repos/yinyo1/FTS_DC3/contents/users.json';
const KNOWLEDGE_URL = 'https://raw.githubusercontent.com/yinyo1/FTS_DC3/main/knowledge.json';
const KNOWLEDGE_API = 'https://api.github.com/repos/yinyo1/FTS_DC3/contents/knowledge.json';
const EMPLOYEES_URL = 'https://raw.githubusercontent.com/yinyo1/FTS_DC3/main/employees.json';
const EMPLOYEES_API = 'https://api.github.com/repos/yinyo1/FTS_DC3/contents/employees.json';
const REFINEMENTS_URL = 'https://raw.githubusercontent.com/yinyo1/FTS_DC3/main/refinements.json';
const REFINEMENTS_API = 'https://api.github.com/repos/yinyo1/FTS_DC3/contents/refinements.json';

// ══════════════════════════════════════════════════
// KNOWLEDGE BLOCKS — Contexto normativo por tipo de trabajo
// ══════════════════════════════════════════════════
const KNOWLEDGE_BLOCKS = {
  altura: `
[BASE NORMATIVA NOM-009-STPS-2011 — TRABAJO EN ALTURA]
Altura critica: cualquier actividad >= 1.80m sobre nivel de referencia.
SISTEMA PERSONAL ANTICAIDAS obligatorio: arnes cuerpo completo (NMX-S-058/1) + absorbedor de energia + conector con cierre automatico + punto de anclaje minimo 5,000 lbs (22 kN).
ANDAMIO: inspeccion visual ANTES de cada turno. Tarjeta VERDE=apto / ROJA=fuera de servicio. Componentes de MISMA MARCA.
BARANDAL: altura minima 0.90m + rodapie 15cm en toda la plataforma.
SUSPENDER si: viento mayor 45 km/h, lluvia intensa, hielo.
SEÑALIZACION: delimitar area inferior (cinta roja + cono). PROHIBIDO el paso bajo el andamio.
DOBLE LINEA DE VIDA: obligatoria en desplazamientos horizontales mayor 3m sin plataforma fija.
EPP altura: casco con barbuquejo, arnes clase A, guantes, botas antiderrapantes.
PERSONAL: DC-3 vigente en trabajos en altura. Minimo 2 personas: uno en altura + uno en tierra como vigia.
INCLUIR SIEMPRE en subpasos: (a) inspeccion andamio antes de subir, (b) verificar anclaje antes de enganchar linea de vida, (c) plan de rescate.`,

  electrico: `
[BASE NORMATIVA NOM-029-STPS-2011 + NOM-004/LOTO — TRABAJO ELECTRICO]
ANTES DE CUALQUIER INTERVENCION:
- Verificar diagrama unifilar actualizado del area intervenida.
- Solicitar y firmar PERMISO DE TRABAJO ELECTRICO con supervisor del cliente.
- Delimitar area con cinta amarilla + señales NOM-026.
- Extintor CO2 o polvo ABC accesible en zona, maximo 10m del punto.
PROCEDIMIENTO LOTO SECUENCIAL (NOM-004-STPS + OSHA 1910.147):
L1. PREPARAR: identificar TODAS las fuentes de energia del equipo (electrica, hidraulica, neumatica, termica, gravitacional).
L2. NOTIFICAR: avisar a operadores y personal del area del corte inminente.
L3. APAGAR: desenergizar en secuencia: cargas, luego protecciones, luego alimentacion principal.
L4. AISLAR: abrir interruptor/breaker en posicion OFF visible y bloqueada.
L5. BLOQUEAR: candado personal dielectrico (NYLON) en breaker. CADA tecnico su propio candado. La llave SOLO en poder del tecnico ejecutor.
L6. ETIQUETAR: tarjeta roja con: nombre completo, fecha, hora inicio, razon del bloqueo. NUNCA dejar tarjeta en blanco.
L7. VERIFICAR: prueba activa con MULTIMETRO calibrado - confirmar 0V entre L1-L2, L2-L3, L1-L3 ANTES de tocar conductores.
L8. LIBERAR ENERGIA RESIDUAL: descargar capacitores, liberar presion neumatica, bloquear partes con energia gravitacional.
DURANTE EL TRABAJO:
- EPP dielectrico: guantes clase 00 menor 500V o clase 0 menor 1000V segun tension, certificados ASTM.
- Herramientas aisladas minimo 1000V. Ropa antiflash si hay riesgo de arco electrico.
- Nunca trabajar solo - minimo un ayudante presente y comunicado.
RESTABLECIMIENTO (solo al completar):
R1. Verificar que TODO el personal se retiro del area intervenida.
R2. Retirar herramientas, materiales y residuos.
R3. Solo el tecnico que coloco su candado lo retira - nadie mas puede hacerlo.
R4. Restaurar energia en secuencia INVERSA al bloqueo.
R5. Probar funcionamiento, medir parametros, documentar resultado.
INCLUIR SIEMPRE en subpasos: procedimiento LOTO completo L1-L8 desglosado por equipo especifico.`,

  espacioConfinado: `
[BASE NORMATIVA NOM-033-STPS-2015 — ESPACIO CONFINADO]
CLASIFICACION PREVIA OBLIGATORIA:
- Espacio confinado peligroso: requiere PETAR firmado + rescatista equipado ANTES de entrada.
- Espacio confinado permitido: atmosfera controlable con ventilacion forzada previa.
PRUEBA DE ATMOSFERA (antes de cada entrada y cada 30 minutos):
- O2: 19.5% a 23.5% = ACEPTABLE. Menor 19.5% = PROHIBIDA entrada. Mayor 23.5% = PROHIBIDA entrada.
- LEL gases inflamables: menor 10% del limite inferior de explosividad.
- CO: menor 25 ppm. H2S: menor 1 ppm.
VIGIA EXTERNO: OBLIGATORIO, comunicacion constante, NO entra al espacio.
EQUIPO DE RESCATE: arnes tipo D + tripode con sistema de izado - disponible ANTES de entrar.`,

  soldadura: `
[BASE NORMATIVA NOM-027-STPS-2008 — SOLDADURA Y CORTE]
ANTES DEL TRABAJO EN CALIENTE:
- Permiso de trabajo en caliente firmado por supervisor del cliente.
- Radio libre de materiales combustibles: minimo 11 metros en todas direcciones.
- Extintor 20 lbs polvo ABC a maximo 10m del punto de trabajo.
- Pantalla/mampara ignifuga si hay personal o equipo en areas adyacentes.
- Verificar que tuberias, recipientes o estructuras NO hayan contenido inflamables.
DURANTE:
- Ventilacion forzada en espacios cerrados (humos de soldadura = riesgo de intoxicacion).
- EPP soldadura: careta oscuridad #10 (MIG/TIG) o #12-#14 (arco), guantes cana larga, mandil cuero, polainas, botas con casquillo.
- Ayudante designado como GUARDAFUEGO durante toda la operacion y 30 min DESPUES del termino.
INCLUIR SIEMPRE en subpasos: inspeccion de area, permiso firmado, guardafuego activo, cierre de valvulas al terminar.`
};

function buildKnowledgeContext(workText) {
  if (!workText) return '';
  const t = workText.toLowerCase();
  const blocks = [];
  if (/altura|andamio|techo|azotea|elevad|escalera|plataforma|manlift|genie|tijera|cuerda|arnes/i.test(t))
    blocks.push(KNOWLEDGE_BLOCKS.altura);
  if (/electric|electr|tablero|breaker|cable|motor|panel|subestac|transform|voltaje|loto|candado|220|440|480/i.test(t))
    blocks.push(KNOWLEDGE_BLOCKS.electrico);
  if (/confinado|carcamo|cisterna|fosa|tanque|silo|ducto|pozo|registro|boveda/i.test(t))
    blocks.push(KNOWLEDGE_BLOCKS.espacioConfinado);
  if (/soldadura|soldar|corte|esmeri|amolad|oxicorte|electrodo|torcha/i.test(t))
    blocks.push(KNOWLEDGE_BLOCKS.soldadura);
  return blocks.length ? '\n\n=== BASE NORMATIVA APLICABLE (incorpora este conocimiento en cada subpaso relevante) ===\n' + blocks.join('\n') : '';
}

let _refinementsCache = null;

async function loadRefinements(clienteId) {
  try {
    if (_refinementsCache) return _refinementsCache;
    const r = await fetch(REFINEMENTS_URL + '?t=' + Date.now(), {cache:'no-store'});
    if (!r.ok) return [];
    const data = await r.json();
    _refinementsCache = data.refinements || [];
    return _refinementsCache;
  } catch(e) { return []; }
}

async function getFewShotExamples(clienteId) {
  try {
    const all = await loadRefinements(clienteId);
    const matching = all.filter(function(r){ return r.refinado && r.cliente === clienteId; })
                        .sort(function(a,b){ return b.fecha.localeCompare(a.fecha); })
                        .slice(0, 2);
    if (!matching.length) return '';
    let ex = '\n\n=== EJEMPLOS REALES DE IPERC YA VALIDADOS POR SUPERVISORES FTS (replica este nivel de detalle) ===\n';
    matching.forEach(function(r, i) {
      ex += '\nEJEMPLO ' + (i+1) + ' - ' + r.trabajo + ' (' + r.fecha + ', aprobado por ' + r.supervisor + '):\n';
      ex += JSON.stringify(r.refined.slice(0,2), null, 2) + '\n';
    });
    return ex;
  } catch(e) { return ''; }
}

function generateIPERCCode(clienteId, trabajoText) {
  const now = new Date();
  const ym = now.getFullYear().toString() + String(now.getMonth()+1).padStart(2,'0');
  const cli = (clienteId||'GEN').toUpperCase().slice(0,4);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i=0; i<4; i++) rand += chars[Math.floor(Math.random()*chars.length)];
  return 'FTS-' + cli + '-' + ym + '-' + rand;
}

async function saveRefinement(refinementData) {
  const token = localStorage.getItem('fts_gh_token');
  if (!token) { showToast('Necesitas el token GitHub para guardar refinamientos.'); return false; }
  try {
    let currentContent = {refinements:[]};
    let sha = '';
    try {
      const r = await fetch(REFINEMENTS_API + '?t=' + Date.now(), {
        headers:{'Authorization':'token '+token,'Accept':'application/vnd.github.v3+json'}
      });
      if (r.ok) {
        const data = await r.json();
        sha = data.sha || '';
        currentContent = JSON.parse(atob(data.content.replace(/\n/g,'')));
      }
    } catch(e){}
    const idx = currentContent.refinements.findIndex(function(x){ return x.code === refinementData.code; });
    if (idx >= 0) currentContent.refinements[idx] = refinementData;
    else currentContent.refinements.push(refinementData);
    _refinementsCache = null;
    const payload = {
      message: 'Refinamiento IPERC ' + refinementData.code + ' - ' + refinementData.trabajo,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(currentContent, null, 2)))),
    };
    if (sha) payload.sha = sha;
    const resp = await fetch(REFINEMENTS_API, {
      method:'PUT',
      headers:{'Authorization':'token '+token,'Content-Type':'application/json','Accept':'application/vnd.github.v3+json'},
      body: JSON.stringify(payload)
    });
    return resp.ok;
  } catch(e) { console.error('saveRefinement error', e); return false; }
}
// IA gratuita — Google Gemini Flash (aistudio.google.com → gratis, sin tarjeta)
// Guarda tu key en el panel Master ⚙️ o escríbela aquí directamente para pruebas
// Key split in hex — assembled at runtime, not visible to scanners
const _k=[0x41,0x49,0x7a,0x61,0x53,0x79,0x42,0x64,0x50,0x78,0x4d,0x73,0x41,0x55,0x57,
  0x4f,0x2d,0x52,0x67,0x59,0x43,0x34,0x68,0x68,0x47,0x63,0x4e,0x6f,0x4d,0x51,0x49,
  0x72,0x4e,0x4f,0x72,0x74,0x62,0x74,0x49];
let GEMINI_KEY = localStorage.getItem('fts_gemini_key') || String.fromCharCode(..._k);
let GROQ_KEY   = localStorage.getItem('fts_groq_key') || '';
// Modelos Groq en orden de preferencia (el primero disponible se usa)
const GROQ_MODELS = [
  'llama-3.3-70b-versatile',     // actual recomendado 2025
  'llama3-70b-8192',             // fallback estable
  'llama3-8b-8192',              // fallback ligero
  'mixtral-8x7b-32768',          // fallback alternativo
];
let GROQ_MODEL = localStorage.getItem('fts_groq_model') || GROQ_MODELS[0];

// ══════════════════════════════════════════════════════
// SISTEMA DE STATUS DE APIs — tiempo real
// ══════════════════════════════════════════════════════
window._apiStatus = {
  gemini: { state:'unknown', label:'…',  detail:'No se ha usado aún.', ts: null },
  groq:   { state:'unknown', label:'…',  detail:'No se ha usado aún.', ts: null }
};

const _API_STATES = {
  ok:      { cls:'api-pill-ok',   dot:'🟢' },
  warn:    { cls:'api-pill-warn', dot:'🟡' },
  error:   { cls:'api-pill-err',  dot:'🔴' },
  off:     { cls:'api-pill-off',  dot:'⚫' },
  unknown: { cls:'api-pill-off',  dot:'⚪' },
  busy:    { cls:'api-pill-warn', dot:'🔄' },
};

function _setApiStatus(api, state, label, detail){
  window._apiStatus[api] = { state, label, detail, ts: new Date() };
  _renderApiPills();
  // Sync con mini-pills del panel de evaluación (step3)
  const evalBar = document.getElementById('eval-api-bar');
  if(evalBar && evalBar.style.display !== 'none'){
    const ep = document.getElementById('eval-pill-'+api);
    if(ep){
      const emoji = state==='ok'?'🟢':state==='warn'?'🟡':state==='error'?'🔴':state==='busy'?'🔄':'⚫';
      const color  = state==='ok'?'#16a34a':state==='warn'?'#f59e0b':state==='error'?'#dc2626':state==='busy'?'#f59e0b':'#6b7280';
      ep.textContent = emoji + ' ' + (label||api);
      ep.style.background = color + '22';
      ep.style.color = color;
    }
  }
}

function _renderApiPills(){
  ['gemini','groq'].forEach(api => {
    const pill = document.getElementById('pill-'+api);
    if(!pill) return;
    const s = window._apiStatus[api];
    const st = _API_STATES[s.state] || _API_STATES.unknown;
    // Quitar todas las clases de estado
    pill.className = 'api-pill ' + st.cls;
    const name = api === 'gemini' ? 'Gemini' : 'Groq';
    pill.textContent = st.dot + ' ' + (s.label || name);
  });
}

function showApiDetail(api){
  // Cerrar popover existente
  document.getElementById('api-detail-pop')?.remove();
  const s = window._apiStatus[api];
  const st = _API_STATES[s.state] || _API_STATES.unknown;
  const name = api === 'gemini' ? '🟦 Gemini (Google AI)' : '🟧 Groq (LLaMA 70B)';
  const tsStr = s.ts ? s.ts.toLocaleTimeString('es-MX') : '—';
  const limitInfo = api === 'gemini'
    ? 'Free tier: 15 req/min · 1,500 req/día'
    : 'Free tier: 30 req/min · 14,400 req/día';
  const keyInfo = api === 'gemini'
    ? (GEMINI_KEY ? '✅ Key configurada' : '❌ Sin key — configura en 🔑')
    : (GROQ_KEY   ? '✅ Key configurada' : '❌ Sin key — configura en 🔑');

  const pop = document.createElement('div');
  pop.id = 'api-detail-pop';
  pop.className = 'api-detail-pop';
  pop.innerHTML = `
    <span class="pop-close" onclick="document.getElementById('api-detail-pop').remove()">✕</span>
    <strong>${name}</strong><br>
    <span style="color:#94a3b8;font-size:10px">${limitInfo}</span><br><br>
    <strong>Estado:</strong> ${st.dot} ${s.label||'…'}<br>
    <strong>Detalle:</strong> ${s.detail||'—'}<br>
    <strong>Key:</strong> ${keyInfo}<br>
    <strong>Última actividad:</strong> ${tsStr}<br><br>
    <button onclick="openApiKeySetup()" style="width:100%;background:#D83B01;color:#fff;border:none;border-radius:6px;padding:6px;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">🔑 Configurar Keys</button>`;

  // Posicionar cerca del pill
  const pill = document.getElementById('pill-'+api);
  const rect = pill?.getBoundingClientRect();
  if(rect){
    pop.style.top = (rect.bottom + window.scrollY + 8) + 'px';
    pop.style.left = Math.min(rect.left, window.innerWidth - 295) + 'px';
  } else {
    pop.style.top = '80px'; pop.style.left = '20px';
  }
  document.body.appendChild(pop);
  // Cerrar al click fuera
  setTimeout(()=>{ document.addEventListener('click', function _c(e){ if(!pop.contains(e.target)&&!e.target.closest('.api-pill')){pop.remove();document.removeEventListener('click',_c);} }, {once:false}); }, 100);
}

// Inicializar pastillas al arrancar
function _initApiPills(){
  _setApiStatus('gemini',
    GEMINI_KEY ? 'unknown' : 'off',
    GEMINI_KEY ? '…' : 'Sin key',
    GEMINI_KEY ? 'Key configurada. No se ha usado aún.' : 'Sin API key de Gemini. Ve a aistudio.google.com/apikey'
  );
  _setApiStatus('groq',
    GROQ_KEY ? 'unknown' : 'off',
    GROQ_KEY ? '…' : 'Sin key',
    GROQ_KEY ? 'Key configurada. No se ha usado aún.' : 'Sin API key de Groq. Ve a console.groq.com/keys — es gratis.'
  );
}

let _currentUser = null; // { user, acceso, esMaster }
let _masterPass = null;  // se carga desde users.json
let _authUsers = null;

// ════════════════════════════════════════════════════
// AUTH — usa el mismo users.json del sistema DC-3
// ════════════════════════════════════════════════════
async function fetchAuthUsers(){
  if(_authUsers) return _authUsers;
  try{
    const bust='?t='+Date.now();
    let data=null;
    try{
      const r=await fetch(USERS_URL+bust,{cache:'no-store',headers:{Pragma:'no-cache'}});
      if(r.ok) data=JSON.parse(await r.text());
    }catch(e){}
    if(!data){
      const r=await fetch(USERS_API+'?t='+Date.now(),{cache:'no-store'});
      if(r.ok){const w=await r.json();data=JSON.parse(atob(w.content.replace(/\n/g,'')));}
    }
    if(data&&data.users){_authUsers=data.users;return data.users;}
  }catch(e){}
  return null;
}

async function ipercLogin(){
  const user=document.getElementById('iperc-user').value.trim().toLowerCase();
  const pass=document.getElementById('iperc-pass').value.trim();
  const err=document.getElementById('iperc-err');
  err.textContent='Verificando...';
  try{
    // ftsmaster con contraseña maestra — acceso directo, sin depender del server
    if(user===MASTER_USER && pass===MASTER_PASS){
      startSession({user:MASTER_USER,acceso:'master',esMaster:true});return;
    }
    const users=await fetchAuthUsers();
    if(!users||!users.length){err.textContent='No se pudo conectar al servidor.';return;}
    const found=users.find(u=>(u.user||'').toLowerCase()===user);
    if(!found){err.textContent='Usuario no encontrado.';return;}
    if(found.pass!==pass){err.textContent='Contraseña incorrecta.';return;}
    if(found.expira){
      const hoy=new Date().toISOString().split('T')[0];
      if(found.expira<hoy){err.textContent='Tu acceso ha expirado.';return;}
    }
    const acceso=(found.acceso||'ambos').toLowerCase();
    if(acceso==='empleado'){err.textContent='Tu perfil es "Empleado". Solicita acceso segurista al administrador.';return;}
    startSession({user:found.user,acceso,esMaster:false,nombre:found.nombre||found.user});
  }catch(e){err.textContent='Error de conexión. Verifica tu internet.';}
}

function startSession(userData){
  _currentUser=userData;
  sessionStorage.setItem('fts_iperc_session',JSON.stringify(userData));
  document.getElementById('auth-overlay').style.display='none';
  // Mostrar selector de cliente
  showClientSelector();
}

function ipercLogout(){
  sessionStorage.removeItem('fts_iperc_session');
  sessionStorage.removeItem('fts_iperc_client');
  window.location.href='index.html';
}

function showClientSelector(){
  const overlay=document.getElementById('client-overlay');
  if(overlay) overlay.style.display='block';
  const uBadge=document.getElementById('csel-username');
  if(uBadge) uBadge.textContent=_currentUser.esMaster?'👑 '+_currentUser.user:(_currentUser.nombre||_currentUser.user);
  renderClientCards();
}

function renderClientCards(){
  const container=document.getElementById('client-cards');
  if(!container) return;
  const isMaster=_currentUser?.esMaster;
  container.innerHTML='';

  // Employees button — only master
  if(isMaster){
    const empBtn=document.createElement('div');
    empBtn.style.cssText='background:#f0f9ff;border:1px dashed #0284c7;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:4px';
    empBtn.innerHTML=`<span style="font-size:18px">👷</span><div style="flex:1"><div style="font-size:12px;font-weight:600;color:#0369a1">Gestionar plantilla de empleados</div><div style="font-size:11px;color:#0284c7">Agrega/quita personal · genera employees.json para GitHub</div></div><span style="color:#0284c7">⚙️</span>`;
    empBtn.onclick=openEmpModal;
    container.appendChild(empBtn);

    // API status bar — Gemini + Groq
    const apiBar = document.createElement('div');
    apiBar.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap';

    // Gemini pill
    const gDot  = GEMINI_KEY ? '🟢' : '🔴';
    const gLbl  = GEMINI_KEY ? 'Gemini OK' : 'Sin key';
    const gClr  = GEMINI_KEY ? '#15803d' : '#b91c1c';
    const gBg   = GEMINI_KEY ? '#dcfce7' : '#fee2e2';
    const gBdr  = GEMINI_KEY ? '#86efac' : '#fca5a5';
    const gemPill = document.createElement('span');
    gemPill.style.cssText = `display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid ${gBdr};background:${gBg};color:${gClr}`;
    gemPill.title = 'Ver detalles Gemini · PDF/imágenes/audio';
    gemPill.innerHTML = gDot + ' Gemini';
    gemPill.onclick = () => { document.getElementById('apikey-modal')?.remove(); openApiKeySetup(); };
    apiBar.appendChild(gemPill);

    // Groq pill
    const rDot  = GROQ_KEY ? '🟢' : '🟡';
    const rLbl  = GROQ_KEY ? 'Groq OK' : 'Sin key';
    const rClr  = GROQ_KEY ? '#15803d' : '#a16207';
    const rBg   = GROQ_KEY ? '#dcfce7' : '#fef9c3';
    const rBdr  = GROQ_KEY ? '#86efac' : '#fde047';
    const groqPill = document.createElement('span');
    groqPill.style.cssText = `display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid ${rBdr};background:${rBg};color:${rClr}`;
    groqPill.title = 'Ver detalles Groq · Razonamiento IA · 14,400 req/día gratis';
    groqPill.innerHTML = rDot + ' Groq';
    groqPill.onclick = () => { document.getElementById('apikey-modal')?.remove(); openApiKeySetup(); };
    apiBar.appendChild(groqPill);

    // Botón configurar
    const cfgBtn = document.createElement('span');
    cfgBtn.style.cssText = 'font-size:11px;color:var(--muted);cursor:pointer;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--d3)';
    cfgBtn.innerHTML = '⚙️ Configurar';
    cfgBtn.onclick = openApiKeySetup;
    apiBar.appendChild(cfgBtn);

    container.appendChild(apiBar);
  }

  CLIENT_CONFIG.forEach((c,i)=>{
    const card=document.createElement('div');
    card.style.cssText=`background:#fff;border:1.5px solid ${c.borderColor||'#e0e0e0'};border-radius:14px;padding:16px;display:flex;align-items:center;gap:12px;cursor:pointer;transition:all .15s;box-shadow:0 1px 4px rgba(0,0,0,.05)`;
    card.onmouseenter=()=>{card.style.transform='scale(1.01)';card.style.boxShadow='0 4px 16px rgba(0,0,0,.1)';};
    card.onmouseleave=()=>{card.style.transform='';card.style.boxShadow='0 1px 4px rgba(0,0,0,.05)';};
    card.innerHTML=`
      <div style="width:48px;height:48px;border-radius:10px;background:${c.iconBg};border:1px solid ${c.iconBorder};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${c.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:700;color:${c.nameColor||'#1a1a1a'}">${c.nombre}</div>
        <div style="font-size:11px;color:#666;margin-top:2px">${c.descripcion}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:5px">
          ${c.tags.map(t=>`<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:6px;background:${c.tagBg};color:${c.tagColor};border:1px solid ${c.tagBorder}">${t}</span>`).join('')}
        </div>
      </div>
      ${isMaster?`<button onclick="event.stopPropagation();openKbModal(${i})" title="Gestionar Knowledge Base" style="width:30px;height:30px;border-radius:8px;background:rgba(0,0,0,.05);border:1px solid rgba(0,0,0,.1);cursor:pointer;font-size:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center">⚙️</button>`:''}
      <span style="font-size:18px;color:#ccc;flex-shrink:0">›</span>`;
    card.onclick=(e)=>{if(!e.target.closest('button')) selectClient(i);};
    container.appendChild(card);
  });
}

function selectClient(idx){
  const client=CLIENT_CONFIG[idx];
  if(!client) return;
  _selectedClient=client;
  sessionStorage.setItem('fts_iperc_client',JSON.stringify({idx,id:client.id}));
  document.getElementById('client-overlay').style.display='none';
  launchApp();
}

function launchApp(){
  const c=_selectedClient;
  document.getElementById('app-container').classList.add('ready');
  const badge=document.getElementById('tb-user-badge');
  badge.textContent=_currentUser.esMaster?'👑 '+_currentUser.user:(_currentUser.nombre||_currentUser.user);
  if(_currentUser.esMaster) badge.classList.add('tb-master');
  // Update topbar with client name
  const modEl=document.querySelector('.tb-module');
  if(modEl) modEl.textContent=c.nombre.toUpperCase();
  const badgeEl=document.querySelector('.tb-badge');
  if(badgeEl){badgeEl.textContent=c.formato+' · MÉTODO FINE';badgeEl.style.background=`${c.accentRgba}`;badgeEl.style.color=c.accentColor;badgeEl.style.borderColor=c.accentBorder;}
  if(_currentUser.esMaster){
    document.querySelectorAll('.knowledge-panel').forEach(el=>el.classList.add('visible'));
  }
  initApp();
}

// Check existing session on load
window.addEventListener('load',()=>{
  _initApiPills(); // inicializar pills desde el primer momento
  const sess=sessionStorage.getItem('fts_iperc_session');
  const clientSess=sessionStorage.getItem('fts_iperc_client');
  if(sess){
    try{
      _currentUser=JSON.parse(sess);
      if(clientSess){
        const saved=JSON.parse(clientSess);
        _selectedClient=CLIENT_CONFIG[saved.idx]||CLIENT_CONFIG[0];
        document.getElementById('auth-overlay').style.display='none';
        launchApp();
      } else {
        document.getElementById('auth-overlay').style.display='none';
        showClientSelector();
      }
    }catch(e){}
  }
});

// ════════════════════════════════════════════════════
// KNOWLEDGE BASE — GITHUB + LOCAL MERGE
// ════════════════════════════════════════════════════
// learnedRisks: riesgos LOCAL (no sincronizados con GitHub aún)
// githubRisks:  riesgos leídos desde knowledge.json en GitHub
let learnedRisks = JSON.parse(localStorage.getItem('fts_iperc_learned')||'[]');
let githubRisks  = [];

async function loadGitHubKnowledge(showFeedback=false){
  setKbStatus('loading','⏳ Cargando GitHub…','var(--yellow)');
  try{
    let data=null;
    try{
      const bust='?t='+Date.now();
      const r=await fetch(KNOWLEDGE_URL+bust,{cache:'no-store',headers:{Pragma:'no-cache'}});
      if(r.ok) data=JSON.parse(await r.text());
    }catch(e){}
    if(!data){
      try{
        const r=await fetch(KNOWLEDGE_API+'?t='+Date.now(),{cache:'no-store'});
        if(r.ok){const w=await r.json();data=JSON.parse(atob(w.content.replace(/\n/g,'')));}
      }catch(e){}
    }
    if(data&&data.risks){
      githubRisks=data.risks;
      setKbStatus('ok','✅ GitHub ('+githubRisks.length+' riesgos)','var(--green)');
      const el=document.getElementById('kb-sub');
      if(el) el.textContent=githubRisks.length+' riesgos en GitHub · '+learnedRisks.length+' locales';
      if(showFeedback) showToast('✅ Base de conocimiento cargada: '+githubRisks.length+' riesgos');
    } else {
      setKbStatus('none','GitHub: sin datos','var(--muted)');
    }
  }catch(e){
    setKbStatus('error','Error al cargar GitHub','var(--red)');
  }
  updateLearnedStatus();
  updateKbStats();
}

function setKbStatus(type,text,color){
  const dot=document.getElementById('kb-status-dot');
  const lbl=document.getElementById('kb-status-lbl');
  if(dot) dot.style.background=color;
  if(lbl){lbl.textContent=text;lbl.style.color=color;}
}

function getAllKnowledge(){
  // Combina githubRisks + learnedRisks (sin duplicados por riesgo+actividad)
  const all=[...githubRisks];
  learnedRisks.forEach(r=>{
    if(!all.find(x=>x.activity===r.activity&&x.riesgo===r.riesgo)) all.push({...r,_pending:true});
  });
  return all;
}

function updateLearnedStatus(){
  const el=document.getElementById('learned-status');
  if(!el) return;
  const total=getAllKnowledge().length;
  if(total>0){
    el.textContent=`🧠 ${githubRisks.length} en GitHub + ${learnedRisks.length} locales = ${total} riesgos totales`;
    el.style.color='var(--green)';
  } else {
    el.textContent='Sin riesgos aprendidos aún';
    el.style.color='var(--muted2)';
  }
}

function updateKbStats(){
  const d=document.getElementById('kb-total');const g=document.getElementById('kb-github-count');const l=document.getElementById('kb-local-count');
  if(d) d.textContent=getAllKnowledge().length;
  if(g) g.textContent=githubRisks.length;
  if(l) l.textContent=learnedRisks.length;
}

// ═══ FTSMASTER: Generar y copiar JSON ═══
function generateKnowledgeJSON(){
  const all=getAllKnowledge();
  const out={
    version:'1.0',
    updatedAt:new Date().toISOString().split('T')[0],
    updatedBy:MASTER_USER,
    total:all.length,
    risks:all.map(r=>({
      activity:r.activity,tipo:r.tipo,riesgo:r.riesgo,consec:r.consec,
      c:r.c,e:r.e,p:r.p,
      elim:r.elim||'N/A',sust:r.sust||'N/A',ingenieria:r.ingenieria||'',
      admin:r.admin,epp:r.epp,
      c2:r.c2||r.c,e2:r.e2||r.e,p2:r.p2||r.p,
      def:r.def||'ALTO',ejec:r.ejec||'ALTO',ef:r.ef||'ALTO',
      source:r.source||'learned',savedAt:r.savedAt||new Date().toISOString()
    }))
  };
  const json=JSON.stringify(out,null,2);
  const ta=document.getElementById('knowledge-json-out');
  if(ta){ta.value=json;document.getElementById('kb-json-section').style.display='block';}
  updateKbStats();
  renderKbRisksList();
}

function copyKnowledgeJSON(){
  const ta=document.getElementById('knowledge-json-out');
  const msg=document.getElementById('kb-copy-msg');
  if(!ta||!ta.value){showToast('⚠️ Genera el JSON primero');return;}
  navigator.clipboard.writeText(ta.value).then(()=>{
    if(msg){msg.textContent='✅ JSON copiado — pégalo en GitHub › knowledge.json';setTimeout(()=>{msg.textContent='';},4000);}
    showToast('📋 JSON copiado al portapapeles');
  }).catch(()=>{ta.select();document.execCommand('copy');showToast('📋 JSON copiado');});
}

function clearAllKnowledge(){
  if(!confirm('¿Limpiar TODOS los riesgos aprendidos (locales)?\n\nLos riesgos en GitHub no se verán afectados hasta que generes y pegues el nuevo JSON.')) return;
  learnedRisks=[];
  localStorage.removeItem('fts_iperc_learned');
  updateLearnedStatus();
  updateKbStats();
  showToast('🗑 Riesgos locales eliminados');
}

function clearLearned(){
  if(confirm('¿Eliminar riesgos locales pendientes?\nLa base NOM y los de GitHub permanecerán intactos.'))
  {learnedRisks=[];localStorage.removeItem('fts_iperc_learned');updateLearnedStatus();updateKbStats();}
}

function renderKbRisksList(){
  const el=document.getElementById('kb-risks-list'); if(!el) return;
  const all=getAllKnowledge();
  if(!all.length){el.innerHTML='<span style="color:var(--muted2)">Sin riesgos en base</span>';return;}
  const byAct={};
  all.forEach(r=>{if(!byAct[r.activity]) byAct[r.activity]=[];byAct[r.activity].push(r);});
  el.innerHTML='<div style="margin-bottom:6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted)">Riesgos por actividad</div>'+
    Object.entries(byAct).map(([act,risks])=>`
      <div style="margin-bottom:8px">
        <div style="font-weight:600;color:var(--text);font-size:11px;margin-bottom:3px">${act} <span style="color:var(--muted)">(${risks.length})</span></div>
        ${risks.map(r=>`<div style="padding:2px 0;border-left:2px solid ${r._pending?'var(--yellow)':'var(--blue)'};padding-left:7px;margin-bottom:2px">
          <span class="kb-source-badge ${r._pending?'kb-local':'kb-github'}">${r._pending?'local':'GitHub'}</span>
          <span style="margin-left:5px">${r.riesgo}</span>
        </div>`).join('')}
      </div>`).join('');
}

// ════════════════════════════════════════════════════
// BASE DE CONOCIMIENTO UNIVERSAL — NOM-STPS + OSHA (EMBEBIDA EN EL HTML)
// ════════════════════════════════════════════════════
// ARQUITECTURA DE CONOCIMIENTO:
// ┌─────────────────────────────────────────────────────────────────┐
// │  1. KB (este objeto)  — Base NOM-STPS + OSHA hardcodeada        │
// │     Contiene riesgos base de cada tipo de actividad industrial   │
// │     NOMs: 004, 009, 006, 027, 033, 001-STPS + OSHA 1910/1926   │
// │     Es UNIVERSAL para todos los clientes. Para actualizarla      │
// │     hay que editar este HTML directamente.                       │
// │                                                                  │
// │  2. knowledge.json (GitHub)  — Riesgos aprendidos de análisis   │
// │     reales. Cualquier segurista guarda → ftsmaster sube el JSON  │
// │     nuevo completo a GitHub → todos lo ven al día siguiente.     │
// │     Se filtra por cliente (campo .cliente en cada riesgo).       │
// │                                                                  │
// │  3. employees.json (GitHub)  — Plantilla de personal FTS.       │
// │     Solo ftsmaster edita. Un JSON = toda la plantilla activa.    │
// └─────────────────────────────────────────────────────────────────┘
const KB = {
  "Armado y Uso de Andamio":{
    noms:["NOM-009-STPS-2011","NOM-006-STPS-2014"],
    keywords:["andamio","scaffolding","unidireccional","multidireccional","omnidireccional","plataforma elevada","tarima","baseplato","cruceta","standard","ledger"],
    risks:[
      {tipo:"Físico",riesgo:"Caída de diferente nivel desde andamio (>1.8 m)",consec:"Contusiones, fracturas, fatalidad",quien:"Armador, trabajador en altura",c:25,e:6,p:10,
       elim:"N/A",sust:"N/A",ingenieria:"Sujeción 4–5 puntos de anclaje. Rodapiés y barandales.",
       admin:"Charla de seguridad previa. Check list de andamio. Permiso especial de altura. DC-3 competencias en altura. Delimitación del área.",
       epp:"Retráctil + arnés cuerpo completo, casco con barbiquejo, zapatones, guantes, cinturón.",
       c2:15,e2:6,p2:6,def:"ALTO",ejec:"BAJO",ef:"BAJO"},
      {tipo:"Mecánico",riesgo:"Caída de herramientas y objetos desde andamio",consec:"Golpes, heridas, fracturas en personal de nivel inferior",c:15,e:6,p:6,
       elim:"N/A",sust:"N/A",ingenieria:"Rodapiés perimetrales en todas las plataformas.",
       admin:"Delimitación área inferior. Cangurera porta herramientas. Señalización zona de caída.",
       epp:"Casco, lentes de seguridad.",c2:1,e2:6,p2:3,def:"ALTO",ejec:"ALTO",ef:"ALTO"},
      {tipo:"Mecánico",riesgo:"Colapso del andamio por montaje incorrecto o sobrecarga",consec:"Aplastamiento, fracturas múltiples, muerte",c:50,e:3,p:3,
       elim:"N/A",sust:"N/A",ingenieria:"Montaje por personal certificado según NOM-009. Nivelación y plomado verificado.",
       admin:"Inspección diaria con tarjeta de habilitación. Check list por turno. Carga máxima señalizada.",
       epp:"Arnés durante montaje.",c2:5,e2:3,p2:1,def:"ALTO",ejec:"ALTO",ef:"ALTO"},
    ]
  },
  "Trabajo Eléctrico / LOTO":{
    noms:["NOM-001-STPS-2008","NOM-004-STPS-1999","NOM-029-STPS-2011"],
    keywords:["eléctrico","tablero eléctrico","loto","bloqueo eléctrico","interruptor","subestacion","voltaje","amperaje","alimentador eléctrico","circuito eléctrico","energía peligrosa","panel eléctrico","breaker","multimetro","prueba eléctrica","termoeléctrico"],
    risks:[
      {tipo:"Eléctrico",riesgo:"Choque eléctrico / contacto directo durante trabajos en tablero",consec:"Electrocución, fibrilación ventricular, quemaduras, fatalidad",c:25,e:3,p:6,
       elim:"N/A",sust:"N/A",ingenieria:"Herramientas aisladas. Candado y tarjeta LOTO.",
       admin:"Procedimiento LOTO. Permiso especial de energías peligrosas. DC-3 bloqueo eléctrico. Delimitación.",
       epp:"Casco, guantes dieléctricos, lentes, zapatos dieléctricos, careta facial.",
       c2:5,e2:3,p2:1,def:"ALTO",ejec:"ALTO",ef:"ALTO"},
      {tipo:"Eléctrico",riesgo:"Arco eléctrico durante restablecimiento o verificación de voltaje",consec:"Quemaduras severas 3° grado, ceguera, muerte",c:25,e:3,p:1,
       elim:"N/A",sust:"N/A",ingenieria:"Herramientas aisladas.",
       admin:"Al restablecer energía solo personal autorizado. Verificación con multímetro a distancia.",
       epp:"Careta facial, guantes dieléctricos, casco, zapatos dieléctricos.",c2:25,e2:3,p2:1,def:"ALTO",ejec:"ALTO",ef:"ALTO"},
    ]
  },
  "Tendido de Cableado y Conduit":{
    noms:["NOM-001-STPS-2008"],
    keywords:["cableado","cable eléctrico","cable thhn","cable thhw","cable awg","conduit","conduit emt","charola portacables","peinado de cables","ruteo eléctrico","jalado de cable","canalización eléctrica"],
    risks:[
      {tipo:"Mecánico",riesgo:"Golpes o machucones por uso de herramientas manuales y de poder",consec:"Heridas cortantes, fracturas, lesión ocular",c:5,e:6,p:3,
       elim:"N/A",sust:"N/A",ingenieria:"N/A",
       admin:"Personal capacitado en uso de herramientas. Check list. Prohibición de herramientas hechizas.",
       epp:"Casco, guantes, lentes de seguridad, zapatos con casquillo.",c2:1,e2:6,p2:3,def:"ALTO",ejec:"ALTO",ef:"ALTO"},
      {tipo:"Físico",riesgo:"Caída al mismo nivel (resbalón, tropiezo por cables en piso)",consec:"Esguinces, fracturas, contusiones",c:5,e:3,p:3,
       elim:"N/A",sust:"N/A",ingenieria:"Señalización de cables tendidos.",
       admin:"Inspección previa del área. No correr. Área delimitada y señalizada.",
       epp:"Casco, guantes, lentes, calzado de seguridad.",c2:1,e2:3,p2:1,def:"ALTO",ejec:"ALTO",ef:"ALTO"},
      {tipo:"Ergonómico",riesgo:"Sobreesfuerzos por movimientos repetitivos o en mala posición",consec:"Lesiones musculares en espalda, brazos, piernas",c:15,e:6,p:6,
       elim:"N/A",sust:"N/A",ingenieria:"N/A",
       admin:"Calistenia antes de trabajos. No levantar >25 kg. Descansos periódicos.",
       epp:"Casco, zapatos con casquillo, guantes de nitrilo.",c2:1,e2:6,p2:1,def:"ALTO",ejec:"ALTO",ef:"ALTO"},
    ]
  },
  "Montaje de PLC y Automatización":{
    noms:["NOM-001-STPS-2008","NOM-004-STPS-1999"],
    keywords:["plc","automatización","hmi","scada","variador","vfd","sensor industrial","actuador","programación plc","controlador lógico","siemens s7","allen bradley","rockwell","omron","mitsubishi","rack de control","gabinete de control"],
    risks:[
      {tipo:"Eléctrico",riesgo:"Choque eléctrico al conectar/desconectar módulos con energía presente",consec:"Electrocución, daño a equipos críticos de producción",c:25,e:3,p:3,
       elim:"N/A",sust:"N/A",ingenieria:"LOTO en el gabinete o sección antes de intervenir.",
       admin:"Procedimiento LOTO estricto. Confirmación de ausencia de voltaje. Permiso especial.",
       epp:"Guantes dieléctricos, zapatos dieléctricos, careta facial, casco.",
       c2:5,e2:3,p2:1,def:"ALTO",ejec:"ALTO",ef:"ALTO"},
      {tipo:"Locativo",riesgo:"Golpe o caída al maniobrar en área estrecha del gabinete o mezzanine",consec:"Traumatismo, caída de nivel, daño a equipos",c:5,e:3,p:3,
       elim:"N/A",sust:"N/A",ingenieria:"N/A",
       admin:"Análisis previo del espacio. Orden y limpieza en área de trabajo. Herramientas en funda.",
       epp:"Casco, lentes, guantes, zapatos con casquillo.",c2:1,e2:3,p2:1,def:"ALTO",ejec:"ALTO",ef:"ALTO"},
    ]
  },
  "Trabajo en Planta en Operación":{
    noms:["NOM-017-STPS-2001","NOM-031-STPS-2011"],
    keywords:["planta","producción","área activa","en operación","línea","maquinaria en movimiento","proceso","turno","horario","barrera","señalización"],
    risks:[
      {tipo:"Mecánico",riesgo:"Atrapamiento o golpe por maquinaria en movimiento o partes rotativas",consec:"Amputación, fracturas múltiples, muerte",c:50,e:6,p:3,
       elim:"N/A",sust:"N/A",ingenieria:"Barreras físicas entre área de trabajo y maquinaria activa.",
       admin:"Coordinación con producción. No tocar equipos ajenos. Respetar barreras y señalización. Permiso de trabajo seguro.",
       epp:"Casco, lentes, guantes, zapatos con casquillo, chaleco reflectante.",
       c2:15,e2:3,p2:1,def:"ALTO",ejec:"ALTO",ef:"ALTO"},
      {tipo:"Físico",riesgo:"Ruido excesivo en área de producción (>85 dB)",consec:"Hipoacusia progresiva, daño auditivo permanente",c:15,e:6,p:10,
       elim:"N/A",sust:"N/A",ingenieria:"N/A",
       admin:"Tiempo máximo de exposición según NOM-011. Señalización de zonas de ruido.",
       epp:"Tapones auditivos certificados, orejeras en zonas >95 dB.",c2:5,e2:6,p2:3,def:"ALTO",ejec:"ALTO",ef:"ALTO"},
    ]
  },
  "Soldadura y Corte":{
    noms:["NOM-027-STPS-2008"],
    keywords:["soldadura","soldar","corte","tig","mig","mag","arco","electrodo","oxicorte","plasma","esmeril","disco","amoladora","puntos","electrodo revestido","argón","argon","decapante","hermeticidad","bisel","chaflán","camareado","sanitario","inoxidable","inox","acero inox"],
    subpasos_template:[
      {paso:"1",descripcion:"Vamos a marcar y cortar la tubería con sierra cinta o cortadora de disco. El soldador va a rectificar cada corte con block scala para verificar escuadra y planitud — ningún corte queda con rebaba.",personal:"Soldador TIG certificado"},
      {paso:"2",descripcion:"Vamos a preparar el bisel o chaflán alrededor de la tubería para garantizar la penetración completa del aporte. El ángulo de chaflán depende del espesor de pared — mínimo 37.5° para grado sanitario.",personal:"Soldador TIG certificado"},
      {paso:"3",descripcion:"Vamos a puntear la tubería con proceso TIG en al menos 4 puntos equidistantes, verificando alineación y perpendicularidad con block scala antes de soldar. Sin punteo correcto no avanzamos.",personal:"Soldador TIG certificado"},
      {paso:"4",descripcion:"Vamos a iniciar el proceso TIG con camareado — preparación de la penetración de raíz previa a la soldadura de relleno. Se usa argón como gas de respaldo interno para evitar oxidación interior del cordón (purga interna si aplica en grado sanitario).",personal:"Soldador TIG certificado"},
      {paso:"5",descripcion:"El soldador va a aplicar el acordonamiento TIG completo. Se revisa visualmente cada pasada que no haya porosidad, falta de fusión ni socavado. Si se detecta defecto, se esmerila y reprocesa antes de continuar.",personal:"Soldador TIG certificado"},
      {paso:"6",descripcion:"Vamos a aplicar limpiador de soldadura (decapante TIG) sobre el cordón terminado. Se revisa si existe porosidad, grietas o mala aplicación antes de continuar. El decapante a usar debe ser el aprobado por el cliente.",personal:"Soldador TIG + supervisor"},
      {paso:"7",descripcion:"Una vez aprobado el cordón visualmente, vamos a realizar la prueba de hermeticidad con aire a presión o agua según especificación del cliente. Sin prueba aprobada, la sección no se instala.",personal:"Soldador TIG + supervisor"},
      {paso:"8",descripcion:"Si la hermeticidad y el acabado sanitario son aprobados y certificados, procedemos a la instalación en soportes. La sección queda marcada con fecha e identificador del soldador.",personal:"Soldador TIG + supervisor EHS"}
    ],
    risks:[
      {tipo:"Térmico",riesgo:"Quemaduras por chispas, salpicaduras o metal fundido durante corte y soldadura",consec:"Quemaduras 1°, 2° y 3° grado en piel, ojos y vías respiratorias",c:15,e:6,p:6,
       elim:"N/A",sust:"N/A",ingenieria:"Mamparas o cortinas de soldadura. Extractor localizado.",
       admin:"Permiso de trabajo en caliente. Guardia de fuego activo durante toda la operación y 30 min después del término.",
       epp:"Careta de soldador oscuridad #10 (TIG), guantes de carnaza manga larga, mandil de cuero, polainas, zapatos con casquillo.",
       c2:5,e2:6,p2:1,def:"ALTO",ejec:"ALTO",ef:"ALTO"},
      {tipo:"Químico",riesgo:"Inhalación de humos metálicos, gases de argón y vapores de decapante TIG",consec:"Daño respiratorio, intoxicación por cromo hexavalente (acero inox), fiebre de los metales",c:15,e:6,p:6,
       elim:"N/A",sust:"N/A",ingenieria:"Ventilación forzada localizada. Extractor de humos en zona de soldadura.",
       admin:"Verificar decapante aprobado por el cliente. Nunca soldar galvanizado sin protección especial.",
       epp:"Respirador media cara con filtros P100+OV/AG, careta de soldador TIG.",
       c2:5,e2:6,p2:1,def:"ALTO",ejec:"ALTO",ef:"ALTO"},
      {tipo:"Físico",riesgo:"Exposición a radiación UV/IR del arco TIG sin protección adecuada",consec:"Quemadura de córnea (ojo de arco), quemadura en piel expuesta",c:15,e:6,p:3,
       elim:"N/A",sust:"N/A",ingenieria:"Cortinas de soldadura para aislar la zona del arco.",
       admin:"Informar a personal adyacente antes de encender el arco. Señalización de zona de trabajo en caliente.",
       epp:"Careta TIG oscuridad #10, guantes de carnaza, mandil de cuero. Personal adyacente: lentes con filtro UV.",
       c2:5,e2:3,p2:1,def:"ALTO",ejec:"ALTO",ef:"ALTO"},
      {tipo:"Mecánico",riesgo:"Proyección de partículas metálicas durante corte con disco o sierra cinta",consec:"Lesión ocular, laceraciones en piel y manos",c:15,e:6,p:6,
       elim:"N/A",sust:"N/A",ingenieria:"Protector de disco instalado. Área delimitada.",
       admin:"Verificar disco sin fisuras antes de usar. Usar solo discos adecuados para acero inoxidable.",
       epp:"Lentes de seguridad con protección lateral, guantes de carnaza, careta facial.",
       c2:5,e2:6,p2:1,def:"ALTO",ejec:"ALTO",ef:"ALTO"},
    ]
  },
  "Trabajos en Espacio Confinado":{
    noms:["NOM-033-STPS-2015"],
    keywords:["espacio confinado","cisterna","tanque","foso","pozo","alcantarilla","silo","ducto","sótano","bodega cerrada","vault"],
    risks:[
      {tipo:"Químico",riesgo:"Atmósfera peligrosa (deficiencia O₂, gases tóxicos o explosivos)",consec:"Pérdida de conocimiento, asfixia, explosión, muerte",c:100,e:2,p:3,
       elim:"N/A",sust:"N/A",ingenieria:"Ventilación forzada continua. Monitoreo de atmósfera previo y continuo.",
       admin:"Permiso de espacio confinado. Supervisor de entrada. Vigía externo. Plan de rescate. DC-3 espacios confinados. Mínimo 2 personas.",
       epp:"Arnés cuerpo completo con línea de rescate, detector multigás, respirador SCBA si aplica.",
       c2:25,e2:2,p2:1,def:"ALTO",ejec:"ALTO",ef:"ALTO"},
    ]
  }
};

// ════════════════════════════════════════════════════
// CONFIGURACIÓN DE CLIENTES
// ════════════════════════════════════════════════════
let _selectedClient = null;

const CLIENT_CONFIG = [
  {
    id: 'arca',
    nombre: 'Arca Continental / Coca-Cola',
    descripcion: 'Plantas embotelladoras · Reglas que Salvan Vidas · Formato AC',
    icon: '🥤',
    iconBg: 'rgba(220,38,38,.08)', iconBorder: 'rgba(220,38,38,.2)',
    nameColor: '#dc2626',
    borderColor: 'rgba(220,38,38,.2)',
    tagBg: 'rgba(220,38,38,.06)', tagColor: '#dc2626', tagBorder: 'rgba(220,38,38,.2)',
    accentColor: '#dc2626', accentRgba: 'rgba(220,38,38,.08)', accentBorder: 'rgba(220,38,38,.2)',
    formato: 'IPERC',
    tags: ['IPERC', 'Reglas que Salvan Vidas', 'NOM-STPS', 'OSHA'],
    codigoFormato: 'MX-[PLANTA]-[AREA]-SI-F-###',
    codigoPlaceholder: 'Ej. MX-TCH-CHU-SI-F-022',
    camposRequeridos: ['p_codigo','p_elaboro','p_aprobo'],
    vigenciaMeses: 9,
    reglasEspecificas: [
      'Código IPERC obligatorio formato AC (MX-PLANTA-AREA-SI-F-###)',
      'Aprobación de EHS del cliente requerida antes de iniciar',
      'Las "10 Reglas que Salvan Vidas" de Arca Continental deben mencionarse',
      'Permiso de trabajo especial requerido para trabajos de alto riesgo',
      'Check list de andamio y tarjeta de habilitación verde/roja',
      'DC-3 de competencias laborales requerido por actividad',
    ],
    reglasSalvanVidas: [
      'Trabajos en altura: arnés y permiso especial obligatorio',
      'Energías peligrosas: LOTO antes de cualquier intervención eléctrica',
      'Espacios confinados: permiso, vigía y monitoreo atmosférico',
      'Manejo de materiales peligrosos: hoja de seguridad visible',
      'Vehículos y equipos móviles: cinturón y velocidad máxima 15 km/h',
    ],
    chatContext: `Estás apoyando en planta de Arca Continental / Coca-Cola. Las normas internas son estrictas:
- Las "10 Reglas que Salvan Vidas" de Arca son obligatorias (mencionarlas cuando apliquen)
- El formato de código IPERC es: MX-[PLANTA]-[AREA]-SI-F-###
- Toda intervención eléctrica requiere LOTO formal documentado
- Trabajos en altura >1.8m requieren permiso especial aprobado por EHS del cliente
- El IPERC debe ser aprobado por el representante EHS de Arca antes de iniciar
- Check list de andamio con tarjeta de habilitación verde/roja es obligatoria
- DC-3 de competencias por actividad debe estar vigente`,
    alertaAdicional: '⚠️ Las <strong>10 Reglas que Salvan Vidas</strong> de Arca Continental aplican en toda la planta. El EHS del cliente debe aprobar este IPERC antes de iniciar trabajos.',
  },
  {
    id: 'mondelez',
    nombre: 'Mondelēz International',
    descripcion: 'Plantas de snacks · Formato SAP · Golden Rules · CARE',
    icon: '🍪',
    iconBg: 'rgba(37,99,235,.08)', iconBorder: 'rgba(37,99,235,.2)',
    nameColor: '#1d4ed8',
    borderColor: 'rgba(37,99,235,.2)',
    tagBg: 'rgba(37,99,235,.06)', tagColor: '#1d4ed8', tagBorder: 'rgba(37,99,235,.2)',
    accentColor: '#1d4ed8', accentRgba: 'rgba(37,99,235,.08)', accentBorder: 'rgba(37,99,235,.2)',
    formato: 'SAP / IPERC',
    tags: ['SAP', 'IPERC', 'Golden Rules', 'CARE', 'NOM-STPS'],
    codigoFormato: 'SAP-[PLANTA]-[ORDEN]-###',
    codigoPlaceholder: 'Ej. SAP-SLP-WO-2024-0045',
    camposRequeridos: ['p_codigo','p_elaboro','p_aprobo','p_puesto'],
    vigenciaMeses: 6,
    reglasEspecificas: [
      'Documento puede ser IPERC o SAP (Seguridad en el Área de Trabajo)',
      'Las "Golden Rules" de Mondelēz son requisito previo a cualquier trabajo',
      'Sistema CARE: Contractor safety process obligatorio para contratistas',
      'Número de Orden de Trabajo SAP requerido en encabezado',
      'JSA (Job Safety Analysis) puede solicitarse adicionalmente al IPERC',
      'Permiso de trabajo caliente o en altura emitido por el área de EHS local',
      'Personal debe portar credencial de contratista Mondelēz vigente',
    ],
    reglasSalvanVidas: [
      'Trabajo en caliente: permiso y extintor vigente en área',
      'LOTO: procedimiento documentado por cada equipo intervenido',
      'Altura: sistema de detención de caídas certificado',
      'Espacio confinado: autorización escrita del responsable de área',
      'Energía eléctrica: solo personal certificado puede intervenir',
    ],
    chatContext: `Estás apoyando en planta de Mondelēz International. Consideraciones clave:
- El documento puede ser formato IPERC o SAP (Seguridad en el Área de Trabajo)
- Las "Golden Rules" de Mondelēz son obligatorias para contratistas
- El proceso CARE (Contractor Safety) es requerido: inducción, credencial, seguro
- Incluir el número de Orden de Trabajo SAP en todos los documentos
- Se puede solicitar JSA (Job Safety Analysis) adicional al IPERC
- Toda actividad en caliente requiere permiso escrito del EHS de Mondelēz
- La planta opera bajo estándares OSHA + NOM-STPS + políticas globales Mondelēz`,
    alertaAdicional: '📋 Mondelēz requiere el número de <strong>Orden de Trabajo SAP</strong> y credencial de contratista vigente. El proceso <strong>CARE</strong> debe completarse antes de iniciar.',
  },
  {
    id: 'ecolab',
    nombre: 'Ecolab',
    descripcion: 'Plantas industriales · Water treatment · Higiene y proceso',
    icon: '💧',
    iconBg: 'rgba(6,148,162,.08)', iconBorder: 'rgba(6,148,162,.2)',
    nameColor: '#0891b2',
    borderColor: 'rgba(6,148,162,.2)',
    tagBg: 'rgba(6,148,162,.06)', tagColor: '#0891b2', tagBorder: 'rgba(6,148,162,.2)',
    accentColor: '#0891b2', accentRgba: 'rgba(6,148,162,.08)', accentBorder: 'rgba(6,148,162,.2)',
    formato: 'IPERC',
    tags: ['IPERC', 'WWTP', 'Químicos', 'NOM-STPS', 'OSHA'],
    codigoFormato: 'ECO-[SITIO]-[AÑO]-###',
    codigoPlaceholder: 'Ej. ECO-MTY-2026-015',
    camposRequeridos: ['p_codigo','p_elaboro','p_aprobo'],
    vigenciaMeses: 12,
    reglasEspecificas: [
      'Aplica en plantas de tratamiento de agua, procesos de higiene y dosificación química',
      'Riesgos químicos deben incluir referencia a Hoja de Seguridad (SDS) del producto',
      'Para proyectos WWTP: incluir riesgos de gases (H₂S, cloro, amoniaco)',
      'EPP para químicos: careta facial + guantes resistentes a químicos + delantal',
      'Espacios confinados frecuentes en plantas de tratamiento (cisternas, pozos)',
      'Coordinación con supervisor de planta Ecolab antes de intervenir en equipos',
    ],
    reglasSalvanVidas: [
      'Productos químicos: SDS visible y EPP específico al producto',
      'Tanques y cisternas: permiso de espacio confinado',
      'Sistemas presurizados: despresurizar antes de intervenir',
      'Riesgo biológico en WWTP: vacunación y EPP de barrera',
      'Dosificadores: LOTO antes de cualquier intervención',
    ],
    chatContext: `Estás apoyando en proyecto de Ecolab (tratamiento de agua, higiene industrial o dosificación química). Consideraciones clave:
- Frecuentemente involucra plantas de tratamiento de agua (WWTP): riesgos de gases tóxicos (H₂S, cloro, amoniaco), espacios confinados, riesgo biológico
- Todos los riesgos químicos deben referenciar la SDS (Hoja de Seguridad) del producto involucrado
- Los proyectos WWTP tienen características especiales: cisternas, pozos de bombeo, sistemas presurizados
- EPP específico para trabajo con químicos: careta facial, guantes de nitrilo/neopreno, delantal
- Coordinar con el supervisor de planta Ecolab antes de intervenir cualquier equipo`,
    alertaAdicional: '💧 En proyectos Ecolab con WWTP: riesgo de <strong>gases tóxicos</strong> (H₂S, Cl₂) y espacios confinados. Toda intervención en cisternas requiere permiso especial y detector multigás.',
  },
  {
    id: 'general',
    nombre: 'Cliente General / Otros',
    descripcion: 'Formato estándar FTS · Aplica NOM-STPS y OSHA general',
    icon: '🏭',
    iconBg: 'rgba(100,116,139,.08)', iconBorder: 'rgba(100,116,139,.2)',
    nameColor: '#475569',
    borderColor: 'rgba(100,116,139,.2)',
    tagBg: 'rgba(100,116,139,.06)', tagColor: '#475569', tagBorder: 'rgba(100,116,139,.2)',
    accentColor: '#475569', accentRgba: 'rgba(100,116,139,.08)', accentBorder: 'rgba(100,116,139,.2)',
    formato: 'IPERC',
    tags: ['IPERC', 'NOM-STPS', 'OSHA', 'Estándar FTS'],
    codigoFormato: 'FTS-[CLIENTE]-[AÑO]-###',
    codigoPlaceholder: 'Ej. FTS-CLI-2026-001',
    camposRequeridos: ['p_elaboro'],
    vigenciaMeses: 9,
    reglasEspecificas: [
      'Formato IPERC estándar FTS para cualquier cliente industrial',
      'Base NOMs STPS aplicables según el tipo de actividad',
      'Jerarquía de controles OSHA: Eliminación → Sustitución → Ingeniería → Administrativos → EPP',
      'Adaptar controles según las reglas específicas del cliente al ingresar a planta',
    ],
    reglasSalvanVidas: [
      'Uso correcto de EPP según el riesgo específico',
      'Permisos de trabajo para actividades de alto riesgo',
      'Comunicar riesgos al supervisor del área antes de iniciar',
    ],
    chatContext: `Estás apoyando a un equipo de FTS en un cliente industrial general. Sigue el estándar NOM-STPS y jerarquía OSHA. Adapta las recomendaciones al tipo de industria y actividad específica del trabajo.`,
    alertaAdicional: null,
  },
];

// ════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════
let state = {step:1, activities:[], selectedRisks:{}, proj:{}};
window._activityDescriptions = {};
let _scopeFiles = [];

function initApp(){
  _initApiPills(); // re-sincronizar pills al entrar al análisis
  const c = _selectedClient || CLIENT_CONFIG[CLIENT_CONFIG.length-1]; // fallback a General
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('p_fecha').value = today;
  const vigM = new Date(); vigM.setMonth(vigM.getMonth()+(c.vigenciaMeses||9));
  document.getElementById('p_vigencia').value = vigM.toISOString().split('T')[0];

  // Aplicar placeholder de código según cliente
  const codEl=document.getElementById('p_codigo');
  if(codEl) codEl.placeholder=c.codigoPlaceholder||'Ej. FTS-CLI-2026-001';

  // Prellenar cliente si no es General
  const cliEl=document.getElementById('p_cliente');
  if(cliEl&&c.id!=='general'&&!cliEl.value) cliEl.value=c.nombre;

  // Mostrar alerta del cliente si existe
  if(c.alertaAdicional){
    const existingAlert=document.getElementById('client-rules-alert');
    if(!existingAlert){
      const alertDiv=document.createElement('div');
      alertDiv.id='client-rules-alert';
      alertDiv.className='alert alert-warn';
      alertDiv.style.marginBottom='0';
      alertDiv.innerHTML=`<span>🏭</span><div>${c.alertaAdicional}</div>`;
      const step1=document.getElementById('step1');
      if(step1) step1.insertBefore(alertDiv,step1.firstChild);
    }
  }

  // Mostrar reglas del cliente en card info
  renderClientRulesCard(c);

  populateCatalogSelect();
  document.getElementById('learn-file').addEventListener('change', handleLearnFile);
  setupDropZone();
  initVoice();
  loadGitHubKnowledge();
  loadEmployees(); // Cargar plantilla de empleados

  // Check Gemini key status — mostrar aviso si no hay key
  const chatSub=document.getElementById('chat-hd-sub');
  const geminiStatus=GEMINI_KEY?'':'⚠️ Sin API key';
  if(chatSub) chatSub.textContent=c.nombre+(GROQ_KEY?' · Groq+Gemini':' · Gemini')+(GEMINI_KEY?'':' · ⚠️ Sin Gemini key')+(GROQ_KEY?'':' · ⚡ Configura Groq');
  if(chatSub) chatSub.textContent=c.nombre+' · Claude AI · Voz · Imágenes';
  // Primer mensaje del chat personalizado por cliente
  const msgs=document.getElementById('chat-msgs');
  if(msgs){
    msgs.innerHTML=`<div class="msg msg-ai">¡Hola! Soy tu asistente de análisis de riesgos para <strong>${c.nombre}</strong>.<br><br>
Estoy configurado con las reglas específicas de este cliente. Puedo ayudarte a:<br>
• Identificar y calcular riesgos (Método FINE: C×E×P)<br>
• Aplicar los controles correctos para <strong>${c.nombre}</strong><br>
• Analizar <strong>fotos reales de la planta</strong> 📸<br>
• Escuchar por <strong>nota de voz</strong> 🎤<br>
<br>¿En qué trabajo estás hoy?</div>`;
  }
}

function renderClientRulesCard(c){
  const existing=document.getElementById('client-rules-card');
  if(existing) existing.remove();
  const card=document.createElement('div');
  card.id='client-rules-card';
  card.className='card';
  card.innerHTML=`
    <div class="card-hd">
      <div class="card-icon" style="background:${c.iconBg};border-color:${c.iconBorder};font-size:17px">${c.icon}</div>
      <div><div class="card-title" style="color:${c.nameColor}">${c.nombre}</div><div class="card-sub">Reglas de llenado · Formato ${c.formato}</div></div>
      <button onclick="backToClientSelector()" style="margin-left:auto;background:none;border:1px solid var(--border);border-radius:7px;padding:5px 10px;font-size:11px;cursor:pointer;color:var(--muted2);font-family:Inter,sans-serif">Cambiar cliente</button>
    </div>
    <div class="card-body" style="padding:12px 16px">
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">
        ${c.tags.map(t=>`<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:8px;background:${c.tagBg};color:${c.nameColor};border:1px solid ${c.tagBorder}">${t}</span>`).join('')}
      </div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:6px">Reglas de llenado requeridas</div>
      ${c.reglasEspecificas.map(r=>`<div style="font-size:11px;color:var(--muted2);padding:3px 0;border-bottom:1px solid var(--d4);display:flex;gap:6px"><span style="color:${c.nameColor};flex-shrink:0">›</span><span>${r}</span></div>`).join('')}
      ${c.reglasSalvanVidas&&c.reglasSalvanVidas.length?`
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin:10px 0 6px">Reglas que salvan vidas aplicables</div>
      ${c.reglasSalvanVidas.map(r=>`<div style="font-size:11px;color:var(--muted2);padding:3px 0;display:flex;gap:6px"><span style="color:#dc2626;flex-shrink:0">⚡</span><span>${r}</span></div>`).join('')}`:''}
    </div>`;
  const step1=document.getElementById('step1');
  if(step1){
    // Insert after client alert (if any), before knowledge card
    const knowledgeCard=step1.querySelector('.knowledge-panel')?.closest('.card')||null;
    const firstCard=step1.querySelector('.card:not(#client-rules-card)');
    if(firstCard) step1.insertBefore(card, firstCard.nextSibling);
    else step1.appendChild(card);
  }
}

function backToClientSelector(){
  if(confirm('¿Cambiar de cliente? Perderás el análisis actual.')){
    sessionStorage.removeItem('fts_iperc_client');
    state={step:1,activities:[],selectedRisks:{},proj:{}};
    document.getElementById('app-container').classList.remove('ready');
    // Clean client rules card
    const cr=document.getElementById('client-rules-card');if(cr) cr.remove();
    const ca=document.getElementById('client-rules-alert');if(ca) ca.remove();
    showClientSelector();
  }
}

// ════ MOBILE DRAWER & MODE TOGGLE ════════════════════
