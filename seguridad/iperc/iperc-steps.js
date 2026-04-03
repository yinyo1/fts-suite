// ════════════════════════════════════════════════════
// SAVE TO KNOWLEDGE
// ════════════════════════════════════════════════════
function saveKnowledge(){
  const rows=window._rows||[];if(!rows.length) return;
  let added=0;
  const clientId=_selectedClient?.id||'general';
  rows.forEach(r=>{
    const risk={activity:r.act,tipo:r.tipo,riesgo:r.riesgo,consec:r.consec,
      c:r.c,e:r.e,p:r.p,elim:r.elim||'N/A',sust:r.sust||'N/A',ingenieria:r.ingenieria||'',
      admin:r.admin,epp:r.epp,c2:r.c2||r.c,e2:r.e2||r.e,p2:r.p2||r.p,
      def:r.def,ejec:r.ejec,ef:r.ef,learned:true,source:'iperc_saved',
      cliente:clientId,savedAt:new Date().toISOString()};
    if(!learnedRisks.find(x=>x.activity===risk.activity&&x.riesgo===risk.riesgo)&&
       !githubRisks.find(x=>x.activity===risk.activity&&x.riesgo===risk.riesgo)){
      learnedRisks.push(risk);added++;
    }
  });
  localStorage.setItem('fts_iperc_learned',JSON.stringify(learnedRisks));
  updateLearnedStatus();updateKbStats();
  showToast(`✅ ${added} riesgo(s) guardados en base local${_currentUser?.esMaster?' · Genera JSON para sincronizar a GitHub':''}`);
}

// ════════════════════════════════════════════════════
// LEARN FROM UPLOADED FILES (Knowledge onboarding)
// ════════════════════════════════════════════════════
async function handleLearnFile(e){
  const files=Array.from(e.target.files||[]);if(!files.length) return;
  let added=0;
  for(const file of files){
    try{
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array'});
      for(const sn of wb.SheetNames){
        const ws=wb.Sheets[sn];
        const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
        if(!rows.length) continue;
        const keys=Object.keys(rows[0]).map(k=>k.toLowerCase().trim());
        const ci={act:-1,riesgo:-1,tipo:-1,consec:-1,c:-1,e:-1,p:-1,admin:-1,epp:-1};
        keys.forEach((k,i)=>{
          if(/actividad|tarea|trabajo/.test(k)) ci.act=i;
          else if(/riesgo|peligro|amenaza/.test(k)) ci.riesgo=i;
          else if(/tipo|categoria/.test(k)) ci.tipo=i;
          else if(/consecuencia|efecto/.test(k)) ci.consec=i;
          else if(/^c$|consec\s*c/.test(k)) ci.c=i;
          else if(/^e$|exposic/.test(k)) ci.e=i;
          else if(/^p$|probab/.test(k)) ci.p=i;
          else if(/control|admin|medida/.test(k)) ci.admin=i;
          else if(/epp|equipo\s*prot/.test(k)) ci.epp=i;
        });
        for(const row of rows){
          const vals=Object.values(row);
          const act=ci.act>=0?(vals[ci.act]||'').toString().trim():'Sin actividad';
          const riesgo=ci.riesgo>=0?(vals[ci.riesgo]||'').toString().trim():'';
          if(!riesgo) continue;
          const risk={activity:act,tipo:ci.tipo>=0?(vals[ci.tipo]||'Mecánico').toString().trim():'Mecánico',
            riesgo,consec:ci.consec>=0?(vals[ci.consec]||'').toString().trim():'',
            c:parseFloat(ci.c>=0?vals[ci.c]:25)||25,e:parseFloat(ci.e>=0?vals[ci.e]:6)||6,
            p:parseFloat(ci.p>=0?vals[ci.p]:3)||3,
            admin:ci.admin>=0?(vals[ci.admin]||'').toString().split('\n').map(s=>s.trim()).filter(Boolean):[],
            epp:ci.epp>=0?(vals[ci.epp]||'').toString().trim():'',
            c2:5,e2:3,p2:1,def:'ALTO',ejec:'ALTO',ef:'ALTO',
            learned:true,source:'uploaded_iperc',savedAt:new Date().toISOString(),file:file.name};
          if(!learnedRisks.find(r=>r.activity===risk.activity&&r.riesgo===risk.riesgo)&&
             !githubRisks.find(r=>r.activity===risk.activity&&r.riesgo===risk.riesgo)){
            learnedRisks.push(risk);added++;
          }
        }
      }
    }catch(err){console.error('Error leyendo',file.name,err);}
  }
  localStorage.setItem('fts_iperc_learned',JSON.stringify(learnedRisks));
  updateLearnedStatus();updateKbStats();
  if(added>0){
    const syncMsg=_currentUser?.esMaster?' Ahora genera el JSON en el Panel Master y pégalo en GitHub.':'';
    showToast(`✅ ${added} riesgo(s) aprendidos de ${files.length} archivo(s).${syncMsg}`,5000);
  } else {
    showToast('ℹ️ No se encontraron riesgos nuevos en los archivos.');
  }
  e.target.value='';
}

function setupDropZone(){
  const z=document.getElementById('learn-zone');if(!z) return;
  z.addEventListener('dragover',e=>{e.preventDefault();z.classList.add('drag');});
  z.addEventListener('dragleave',()=>z.classList.remove('drag'));
  z.addEventListener('drop',e=>{e.preventDefault();z.classList.remove('drag');
    if(e.dataTransfer.files.length){
      const fi=document.getElementById('learn-file');
      const dt=new DataTransfer();
      Array.from(e.dataTransfer.files).forEach(f=>dt.items.add(f));
      fi.files=dt.files;fi.dispatchEvent(new Event('change'));
    }
  });
}

function populateCatalogSelect(){
  const sel=document.getElementById('cat-select');
  Object.keys(KB).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=k;sel.appendChild(o);});
}

// ════════════════════════════════════════════════════
// EMPLOYEE SYSTEM
// ════════════════════════════════════════════════════
let _employees = []; // loaded from GitHub employees.json
let _selectedEmployees = []; // selected for this IPERC

async function loadEmployees(){
  try{
    const bust='?t='+Date.now();
    const r=await fetch(EMPLOYEES_URL+bust,{cache:'no-store',headers:{Pragma:'no-cache'}});
    if(r.ok){
      const data=await r.json();
      _employees=Array.isArray(data)?data:[];
    }
  }catch(e){
    // Try localStorage fallback
    try{_employees=JSON.parse(localStorage.getItem('fts_employees')||'[]');}catch(e2){}
  }
  renderEmpSelector();
}

function renderEmpSelector(){
  const wrap=document.getElementById('emp-selector-wrap');
  const textInput=document.getElementById('p_personal');
  if(!wrap||!textInput) return;
  if(_employees.length>0){
    wrap.style.display='block';
    textInput.style.display='none';
  } else {
    wrap.style.display='none';
    textInput.style.display='block';
  }
  // Show manage button for master
  const btn=document.getElementById('btn-open-emp-modal');
  if(btn&&_currentUser?.esMaster) btn.style.display='inline';
  renderEmpDropdown();
}

function renderEmpDropdown(){
  const list=document.getElementById('emp-dropdown-list');
  if(!list) return;
  list.innerHTML=_employees.filter(e=>e.activo!==false).map((e,i)=>{
    const sel=_selectedEmployees.find(s=>s.id===e.id);
    return `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;transition:background .1s;font-size:12px" onmouseover="this.style.background='var(--d3)'" onmouseout="this.style.background=''">
      <input type="checkbox" ${sel?'checked':''} onchange="toggleEmpSelect('${e.id}')" style="cursor:pointer">
      <div><div style="font-weight:600;color:var(--text)">${e.nombre}</div><div style="font-size:10px;color:var(--muted)">${e.puesto||'—'}</div></div>
    </label>`;
  }).join('');
  if(!_employees.filter(e=>e.activo!==false).length){
    list.innerHTML='<div style="padding:12px;font-size:12px;color:var(--muted);text-align:center">Sin empleados. El master debe agregar la plantilla.</div>';
  }
  updateEmpChips();
}

function toggleEmpDropdown(){
  const list=document.getElementById('emp-dropdown-list');
  if(!list) return;
  list.style.display=list.style.display==='none'?'block':'none';
}

function toggleEmpSelect(id){
  const emp=_employees.find(e=>e.id===id);
  if(!emp) return;
  const idx=_selectedEmployees.findIndex(e=>e.id===id);
  if(idx>=0) _selectedEmployees.splice(idx,1);
  else _selectedEmployees.push({id:emp.id,nombre:emp.nombre,puesto:emp.puesto||''});
  updateEmpChips();
}

function updateEmpChips(){
  const chips=document.getElementById('emp-selected-chips');
  const label=document.getElementById('emp-selection-label');
  if(!chips) return;
  chips.innerHTML=_selectedEmployees.map(e=>`<span style="display:inline-flex;align-items:center;gap:4px;background:var(--d3);border:1px solid var(--border);border-radius:12px;padding:3px 8px;font-size:11px;font-weight:600">
    ${e.nombre}<span onclick="toggleEmpSelect('${e.id}')" style="cursor:pointer;color:var(--muted);font-size:10px;margin-left:2px">×</span>
  </span>`).join('');
  if(label) label.textContent=_selectedEmployees.length?_selectedEmployees.map(e=>e.nombre).join(', '):'Seleccionar personal del equipo...';
}

function getSelectedPersonal(){
  if(_selectedEmployees.length>0){
    return _selectedEmployees.map(e=>`${e.nombre} (${e.puesto||'—'})`).join(', ');
  }
  return document.getElementById('p_personal')?.value||'';
}

// ── Employee modal (ftsmaster only) ──────────────
function openEmpModal(){
  if(!_currentUser?.esMaster){showToast('⚠️ Solo ftsmaster puede gestionar empleados.');return;}
  document.getElementById('emp-modal').style.display='block';
  renderEmpModalList();
}

function closeEmpModal(){
  document.getElementById('emp-modal').style.display='none';
}

function renderEmpModalList(){
  const list=document.getElementById('emp-modal-list');
  if(!list) return;
  if(!_employees.length){
    list.innerHTML='<div style="padding:12px;font-size:12px;color:#888;text-align:center">Sin empleados registrados aún.</div>';
    return;
  }
  list.innerHTML=_employees.map((e,i)=>`
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #f0f0f0">
      <div style="width:32px;height:32px;border-radius:8px;background:#f0f4f8;display:flex;align-items:center;justify-content:center;font-size:14px">👷</div>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:600">${e.nombre}</div>
        <div style="font-size:10px;color:#888">${e.puesto||'Sin puesto'}</div>
      </div>
      <button onclick="toggleEmpActive(${i})" style="font-size:10px;padding:3px 8px;border-radius:6px;border:1px solid ${e.activo!==false?'#16a34a':'#dc2626'};background:${e.activo!==false?'rgba(22,163,74,.08)':'rgba(220,38,38,.08)'};color:${e.activo!==false?'#16a34a':'#dc2626'};cursor:pointer;font-family:Inter,sans-serif">${e.activo!==false?'Activo':'Inactivo'}</button>
      <button onclick="removeEmployee(${i})" style="font-size:11px;padding:3px 7px;border-radius:6px;border:1px solid #e0e0e0;background:#f8f9fa;color:#666;cursor:pointer;font-family:Inter,sans-serif">✕</button>
    </div>`).join('');
}

function addEmployee(){
  const nombre=document.getElementById('emp-new-nombre').value.trim();
  const puesto=document.getElementById('emp-new-puesto').value.trim();
  if(!nombre){showToast('⚠️ Ingresa el nombre del empleado.');return;}
  const id='emp_'+Date.now()+'_'+Math.random().toString(36).substr(2,5);
  _employees.push({id,nombre,puesto,activo:true});
  localStorage.setItem('fts_employees',JSON.stringify(_employees));
  document.getElementById('emp-new-nombre').value='';
  document.getElementById('emp-new-puesto').value='';
  renderEmpModalList();
  renderEmpSelector();
  showToast('✅ '+nombre+' agregado');
}

function removeEmployee(i){
  if(!confirm(`¿Eliminar a ${_employees[i].nombre}?`)) return;
  _employees.splice(i,1);
  localStorage.setItem('fts_employees',JSON.stringify(_employees));
  renderEmpModalList();
  renderEmpSelector();
}

function toggleEmpActive(i){
  _employees[i].activo=_employees[i].activo===false?true:false;
  localStorage.setItem('fts_employees',JSON.stringify(_employees));
  renderEmpModalList();
  renderEmpSelector();
}

function generateEmpJson(){
  const json=JSON.stringify(_employees,null,2);
  navigator.clipboard.writeText(json).then(()=>{
    showToast('✅ JSON copiado — pégalo en GitHub › employees.json',4000);
  }).catch(()=>{
    prompt('Copia este JSON y pégalo en GitHub › employees.json:',json);
  });
}

// ════════════════════════════════════════════════════
// KB MODAL POR CLIENTE (solo ftsmaster)
// ════════════════════════════════════════════════════
let _kbModalClientIdx=null;

function openKbModal(clientIdx){
  if(!_currentUser?.esMaster){showToast('⚠️ Solo ftsmaster puede gestionar el knowledge base.');return;}
  _kbModalClientIdx=clientIdx;
  const c=CLIENT_CONFIG[clientIdx];
  document.getElementById('kb-modal-icon').textContent=c.icon;
  document.getElementById('kb-modal-title').textContent='Knowledge Base · '+c.nombre;
  document.getElementById('kb-modal').style.display='block';
  renderKbModal(c);
}

function closeKbModal(){
  document.getElementById('kb-modal').style.display='none';
  _kbModalClientIdx=null;
}

function renderKbModal(c){
  const allKb=getAllKnowledge();
  const ghRisks=githubRisks.filter(r=>!r.cliente||r.cliente===c.id||r.cliente==='general');
  const localRisks=learnedRisks.filter(r=>!r.cliente||r.cliente===c.id||r.cliente==='general');
  const kbRisks=KB;// hardcoded

  // Stats
  const stats=document.getElementById('kb-modal-stats');
  const totalKb=Object.values(kbRisks).reduce((s,v)=>s+(v.risks?.length||0),0);
  stats.innerHTML=`
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:6px 12px;text-align:center">
      <div style="font-size:16px;font-weight:800;color:#0369a1">${totalKb}</div>
      <div style="font-size:10px;color:#0284c7">Base NOM/OSHA</div>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:6px 12px;text-align:center">
      <div style="font-size:16px;font-weight:800;color:#16a34a">${ghRisks.length}</div>
      <div style="font-size:10px;color:#22c55e">De GitHub</div>
    </div>
    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:6px 12px;text-align:center">
      <div style="font-size:16px;font-weight:800;color:#ca8a04">${localRisks.length}</div>
      <div style="font-size:10px;color:#d97706">Pendientes local</div>
    </div>`;

  // List from GitHub
  const list=document.getElementById('kb-modal-list');
  const allR=[...ghRisks,...localRisks];
  if(!allR.length){
    list.innerHTML='<div style="padding:12px;text-align:center;color:#888;font-size:11px">Sin riesgos aprendidos aún para este cliente. Completa análisis y usa "Guardar en base".</div>';
  } else {
    list.innerHTML=allR.map((r,i)=>`
      <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 10px;border-bottom:1px solid #f5f5f5">
        <div style="width:6px;height:6px;border-radius:50%;background:${r.source==='uploaded_iperc'||r.fromGh?'#22c55e':'#f59e0b'};margin-top:4px;flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-size:11px;font-weight:600">${r.riesgo}</div>
          <div style="font-size:10px;color:#888">${r.activity||'—'}</div>
        </div>
        <span style="font-size:9px;color:#aaa">${r.source==='uploaded_iperc'||r.fromGh?'📡 GitHub':'🧠 Local'}</span>
      </div>`).join('');
  }

  // Set activity field suggestion
  const actInput=document.getElementById('kb-new-act');
  if(actInput) actInput.placeholder='Ej. Armado de Andamio';
}

function addToKbModal(){
  const act=document.getElementById('kb-new-act').value.trim();
  const riesgo=document.getElementById('kb-new-riesgo').value.trim();
  const ctrl=document.getElementById('kb-new-ctrl').value.trim();
  const epp=document.getElementById('kb-new-epp').value.trim();
  if(!act||!riesgo){showToast('⚠️ Actividad y riesgo son requeridos.');return;}
  const c=CLIENT_CONFIG[_kbModalClientIdx];
  const risk={activity:act,tipo:'Mecánico',riesgo,consec:'',c:15,e:3,p:3,
    admin:ctrl?[ctrl]:[],epp,c2:5,e2:2,p2:1,
    learned:true,source:'kb_manual',cliente:c?.id||'general',
    savedAt:new Date().toISOString()};
  if(!learnedRisks.find(r=>r.activity===risk.activity&&r.riesgo===risk.riesgo)){
    learnedRisks.push(risk);
    localStorage.setItem('fts_iperc_learned',JSON.stringify(learnedRisks));
  }
  document.getElementById('kb-new-act').value='';
  document.getElementById('kb-new-riesgo').value='';
  document.getElementById('kb-new-ctrl').value='';
  document.getElementById('kb-new-epp').value='';
  renderKbModal(c);
  showToast('✅ Riesgo agregado al KB local');
}

function generateKbJson(){
  // Merge github + local into single array, deduplicated
  const all=[...githubRisks];
  learnedRisks.forEach(r=>{
    if(!all.find(x=>x.activity===r.activity&&x.riesgo===r.riesgo)) all.push(r);
  });
  const json=JSON.stringify({version:'2.0',updatedAt:new Date().toISOString().split('T')[0],total:all.length,risks:all},null,2);
  navigator.clipboard.writeText(json).then(()=>{
    showToast('✅ JSON completo copiado — pégalo en GitHub › knowledge.json',5000);
    closeKbModal();
  }).catch(()=>{
    prompt('Copia este JSON para GitHub › knowledge.json:',json);
  });
}

// ════════════════════════════════════════════════════
// API KEY SETUP
// ════════════════════════════════════════════════════
function openApiKeySetup(){
  // Build inline modal
  const existing=document.getElementById('apikey-modal');
  if(existing) existing.remove();
  const modal=document.createElement('div');
  modal.id='apikey-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML=`
    <div style="background:#fff;border-radius:16px;width:100%;max-width:480px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="background:#1e3a5f;padding:16px 20px;display:flex;align-items:center;gap:10px">
        <span style="font-size:20px">🔑</span>
        <div style="flex:1"><div style="font-size:14px;font-weight:700;color:#fff">Configuración de APIs</div><div style="font-size:11px;color:rgba(255,255,255,.6)">Gemini (archivos) + Groq (razonamiento IA) · Ambas gratis</div></div>
        <button onclick="document.getElementById('apikey-modal').remove()" style="background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:13px">✕</button>
      </div>
      <div style="padding:16px 18px;display:flex;flex-direction:column;gap:12px">
        <div style="border:1.5px solid #bfdbfe;border-radius:10px;overflow:hidden">
          <div style="background:#eff6ff;padding:8px 12px;border-bottom:1px solid #bfdbfe;display:flex;align-items:center;gap:8px">
            <span style="font-size:15px">🟦</span>
            <div style="flex:1"><strong style="font-size:12px">Gemini · Google AI</strong> <span style="font-size:10px;color:#666">Lee PDFs, imágenes y audio · 1,500 req/día</span></div>
            <span id="gemini-status-dot" style="font-size:10px;font-weight:700;color:${GEMINI_KEY?'#16a34a':'#dc2626'}">${GEMINI_KEY?'✅ Activa':'❌ Sin key'}</span>
          </div>
          <div style="padding:10px 12px">
            <div style="font-size:10px;color:#555;margin-bottom:5px">Obtén tu key gratis en <a href="https://aistudio.google.com/apikey" target="_blank" style="color:#1d4ed8">aistudio.google.com/apikey</a> · Empieza con <strong>AIza...</strong></div>
            <input id="apikey-input" type="text" value="${GEMINI_KEY||''}" placeholder="AIzaSy..." style="width:100%;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:12px;font-family:Inter,sans-serif;box-sizing:border-box;margin-bottom:6px">
            <div style="display:flex;gap:6px">
              <button onclick="testGeminiKey()" style="flex:1;background:#eff6ff;border:1.5px solid #3b82f6;color:#1d4ed8;border-radius:7px;padding:7px;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">⚡ Probar</button>
              <button onclick="saveGeminiKey(false)" style="flex:1;background:#1e40af;color:#fff;border:none;border-radius:7px;padding:7px;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">💾 Guardar</button>
            </div>
            <div id="apikey-test-result" style="font-size:11px;margin-top:6px;display:none;padding:6px 8px;border-radius:6px"></div>
          </div>
        </div>
        <div style="border:1.5px solid #fed7aa;border-radius:10px;overflow:hidden">
          <div style="background:#fff7ed;padding:8px 12px;border-bottom:1px solid #fed7aa;display:flex;align-items:center;gap:8px">
            <span style="font-size:15px">🟧</span>
            <div style="flex:1"><strong style="font-size:12px">Groq · LLaMA 70B</strong> <span style="font-size:10px;color:#666">Razonamiento IA · 14,400 req/día · Ultra rápido</span></div>
            <span id="groq-status-dot" style="font-size:10px;font-weight:700;color:${GROQ_KEY?'#16a34a':'#f59e0b'}">${GROQ_KEY?'✅ Activa':'⭐ Recomendada'}</span>
          </div>
          <div style="padding:10px 12px">
            <div style="font-size:10px;color:#555;margin-bottom:5px">Obtén tu key gratis en <a href="https://console.groq.com/keys" target="_blank" style="color:#1d4ed8">console.groq.com/keys</a> · Empieza con <strong>gsk_...</strong></div>
            <input id="groqkey-input" type="text" value="${GROQ_KEY||''}" placeholder="gsk_..." style="width:100%;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:12px;font-family:Inter,sans-serif;box-sizing:border-box;margin-bottom:6px">
            <div style="display:flex;gap:6px">
              <button onclick="testGroqKey()" style="flex:1;background:#fff7ed;border:1.5px solid #f97316;color:#c2410c;border-radius:7px;padding:7px;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">⚡ Probar</button>
              <button onclick="saveGroqKey(false)" style="flex:1;background:#9a3412;color:#fff;border:none;border-radius:7px;padding:7px;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">💾 Guardar</button>
            </div>
            <div id="groqkey-test-result" style="font-size:11px;margin-top:6px;display:none;padding:6px 8px;border-radius:6px"></div>
          </div>
        </div>
        <button onclick="saveAllKeys()" style="width:100%;background:#D83B01;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif">💾 Guardar todo y cerrar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(()=>document.getElementById('apikey-input')?.focus(),100);
}

async function testGeminiKey(){
  const key=(document.getElementById('apikey-input')?.value||'').trim();
  const result=document.getElementById('apikey-test-result');
  const styleOk ='display:block;background:#f0fdf4;border:1px solid #86efac;color:#16a34a;padding:8px 10px;border-radius:7px;font-weight:500';
  const styleErr='display:block;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;padding:8px 10px;border-radius:7px';
  const styleInf='display:block;background:#f8f9fa;border:1px solid #e0e0e0;color:#666;padding:8px 10px;border-radius:7px';
  if(!key){ result.style.cssText=styleErr; result.textContent='⚠️ Ingresa una key primero.'; return; }

  result.style.cssText=styleInf;
  result.textContent='⏳ Consultando modelos disponibles en tu cuenta…';

  try{
    // PASO 1: ListModels — obtener modelos reales de ESTA cuenta
    const listRes=await fetch('https://generativelanguage.googleapis.com/v1beta/models?key='+key);
    const listData=await listRes.json();
    if(listData.error){
      result.style.cssText=styleErr;
      result.textContent='❌ Key inválida o sin acceso: '+listData.error.message;
      return;
    }
    // Solo los que soportan generateContent
    const available=(listData.models||[])
      .filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent'))
      .map(m=>m.name.replace('models/',''));

    if(!available.length){
      result.style.cssText=styleErr;
      result.textContent='❌ Esta key no tiene modelos con generateContent disponibles.';
      return;
    }

    result.textContent=`⏳ ${available.length} modelos encontrados — probando el mejor…`;

    // PASO 2: Probar en orden de preferencia, luego lo que haya
    const preferred=['gemini-2.0-flash','gemini-2.0-flash-lite','gemini-1.5-flash','gemini-1.5-pro','gemini-pro'];
    const ordered=[
      ...preferred.filter(p=>available.find(a=>a===p||a.startsWith(p+'-'))),
      ...available.filter(a=>!preferred.find(p=>a===p||a.startsWith(p+'-')))
    ];

    for(const model of ordered){
      try{
        result.textContent=`⏳ Probando ${model}…`;
        const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const res=await fetch(url,{method:'POST',
          headers:{'Content-Type':'application/json','X-goog-api-key':key},
          body:JSON.stringify({contents:[{parts:[{text:'Di solo: OK'}]}],generationConfig:{maxOutputTokens:5}})});
        const d=await res.json();
        if(d.error) continue;
        const txt=d.candidates?.[0]?.content?.parts?.[0]?.text||'';
        // Guardar modelo que funcionó
        GEMINI_MODEL=model;
        localStorage.setItem('fts_gemini_model',model);
        window._geminiModelOverride=model;
        // Actualizar GEMINI_MODELS global con los disponibles reales
        window._geminiAvailableModels=available;
        result.style.cssText=styleOk;
        result.innerHTML=`✅ Conexión exitosa · <strong>${model}</strong><br>`+
          `<span style="font-size:10px;color:#059669">Respondió: "${txt.trim()}" · Modelo guardado</span><br>`+
          `<span style="font-size:10px;color:#6b7280">${available.length} modelos disponibles en tu cuenta</span>`;
        return;
      }catch(e){ continue; }
    }
    result.style.cssText=styleErr;
    result.textContent='❌ Modelos encontrados pero ninguno respondió. Modelos disponibles: '+ordered.slice(0,4).join(', ');
  }catch(e){
    result.style.cssText=styleErr;
    result.textContent='❌ Error de red: '+e.message;
  }
}

function saveGeminiKey(closeModal=true){
  const key=(document.getElementById('apikey-input')?.value||'').trim();
  GEMINI_KEY=key;
  localStorage.setItem('fts_gemini_key',key);
  if(closeModal) document.getElementById('apikey-modal')?.remove();
  showToast(key?'✅ Gemini Key guardada':'⚠️ Gemini Key eliminada',2500);
  renderClientCards();
}

async function testGroqKey(){
  const key=(document.getElementById('groqkey-input')?.value||'').trim();
  const result=document.getElementById('groqkey-test-result');
  if(!key){
    result.style.cssText='display:block;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;padding:6px 8px;border-radius:6px';
    result.textContent='⚠️ Ingresa una key primero.'; return;
  }
  result.style.cssText='display:block;background:#f8f9fa;border:1px solid #e0e0e0;color:#666;padding:6px 8px;border-radius:6px';
  result.textContent='⏳ Detectando modelo disponible…';
  let lastErr='';
  for(const model of GROQ_MODELS){
    try{
      result.textContent='⏳ Probando '+model+'…';
      const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
        body:JSON.stringify({model,messages:[{role:'user',content:'Di solo: OK'}],max_tokens:5})
      });
      const d=await res.json();
      if(d.error){ lastErr=d.error.message; continue; }
      const txt=d.choices?.[0]?.message?.content||'';
      // Guardar el modelo que funcionó
      GROQ_MODEL=model;
      localStorage.setItem('fts_groq_model',model);
      result.style.cssText='display:block;background:#f0fdf4;border:1px solid #86efac;color:#16a34a;padding:6px 8px;border-radius:6px;font-weight:500';
      result.innerHTML='✅ Groq OK · <strong>'+model+'</strong> activo<br><span style="font-size:10px;color:#059669">Respondió: "'+txt.trim()+'" — modelo guardado</span>';
      return;
    }catch(e){ lastErr=e.message; }
  }
  result.style.cssText='display:block;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;padding:6px 8px;border-radius:6px';
  result.textContent='❌ Ningún modelo respondió. Verifica la key. Último error: '+lastErr;
}

function saveGroqKey(closeModal=true){
  const key=(document.getElementById('groqkey-input')?.value||'').trim();
  GROQ_KEY=key;
  localStorage.setItem('fts_groq_key',key);
  if(closeModal) document.getElementById('apikey-modal')?.remove();
  showToast(key?'✅ Groq Key guardada':'⚠️ Groq Key eliminada',2500);
}

function saveAllKeys(){
  const gKey=(document.getElementById('apikey-input')?.value||'').trim();
  const grKey=(document.getElementById('groqkey-input')?.value||'').trim();
  if(gKey){ GEMINI_KEY=gKey; localStorage.setItem('fts_gemini_key',gKey); }
  if(grKey){ GROQ_KEY=grKey; localStorage.setItem('fts_groq_key',grKey); }
  document.getElementById('apikey-modal')?.remove();
  showToast('✅ Keys guardadas — '+( gKey?'Gemini ✓ ':'')+( grKey?'Groq ✓':''),3000);
  renderClientCards();
}

function newAnalysis(){
  if(confirm('¿Iniciar nuevo análisis? Se perderán los datos actuales.')){
    state={step:1,activities:[],selectedRisks:{},proj:{}};
    document.querySelectorAll('#step1 input, #step1 textarea').forEach(el=>el.type!=='file'&&(el.value=''));
    document.getElementById('p_fecha').value=new Date().toISOString().split('T')[0];
    document.getElementById('scope-text').value='';
    document.getElementById('detect-result').style.display='none';
    goStep(2);
  }
}

// ════════════════════════════════════════════════════
// VOICE RECOGNITION
// ════════════════════════════════════════════════════
const SpeechRec=window.SpeechRecognition||window.webkitSpeechRecognition;
let recognition=null;
let isRecording=false;

function initVoice(){
  const btn=document.getElementById('voice-btn');
  if(!SpeechRec){
    if(btn) btn.title='Reconocimiento de voz no disponible en este navegador (usa Chrome)';
    return;
  }
}

function toggleVoice(){
  if(!SpeechRec){
    showToast('⚠️ Usa Chrome para reconocimiento de voz');return;
  }
  if(isRecording){
    stopVoice();return;
  }
  startVoice();
}

function startVoice(){
  recognition=new SpeechRec();
  recognition.lang='es-MX';
  recognition.continuous=false;
  recognition.interimResults=true;
  recognition.maxAlternatives=1;

  const btn=document.getElementById('voice-btn');
  const lbl=document.getElementById('voice-btn-lbl');
  const status=document.getElementById('chat-status');

  recognition.onstart=()=>{
    isRecording=true;
    btn.classList.add('recording');
    if(lbl) lbl.innerHTML='<span class="mic-dot">●</span> Escuchando...';
    if(status) status.textContent='🎤 Habla ahora — soporta ruido industrial (español)';
  };

  recognition.onresult=(e)=>{
    const transcript=Array.from(e.results).map(r=>r[0].transcript).join('');
    document.getElementById('chat-input').value=transcript;
    if(status) status.textContent='📝 '+transcript;
  };

  recognition.onspeechend=()=>{
    if(recognition) recognition.stop();
  };

  recognition.onend=()=>{
    isRecording=false;
    if(btn) btn.classList.remove('recording');
    if(lbl) lbl.textContent='Nota de voz';
    if(status) status.textContent='';
    const txt=document.getElementById('chat-input').value.trim();
    if(txt) sendChat();
  };

  recognition.onerror=(e)=>{
    isRecording=false;
    if(btn) btn.classList.remove('recording');
    if(lbl) lbl.textContent='Nota de voz';
    if(status) status.textContent='';
    if(e.error!=='no-speech'&&e.error!=='aborted') showToast('⚠️ Error de micrófono: '+e.error);
  };

  try{ recognition.start(); }catch(e){ showToast('⚠️ No se pudo iniciar el micrófono'); }
}

function stopVoice(){
  if(recognition) try{recognition.stop();}catch(e){}
  isRecording=false;
  const btn=document.getElementById('voice-btn');
  const lbl=document.getElementById('voice-btn-lbl');
  if(btn) btn.classList.remove('recording');
  if(lbl) lbl.textContent='Nota de voz';
}

// ── Scope voice (Step 2) ──────────────────────────
let scopeRecognition=null;
let isScopeRecording=false;

let _scopeRecorder=null, _scopeChunks=[], _scopeRecording=false;
async function toggleScopeVoice(){
  const btn=document.getElementById('voice-scope-btn');
  const status=document.getElementById('scope-voice-status');
  // Si ya graba, detener
  if(_scopeRecording && _scopeRecorder && _scopeRecorder.state==='recording'){
    _scopeRecorder.stop();
    return;
  }
  // Pedir permiso micrófono
  let stream;
  try{ stream=await navigator.mediaDevices.getUserMedia({audio:true}); }
  catch(e){ showToast('⚠️ Sin acceso al micrófono. Verifica permisos.',4000); return; }
  _scopeChunks=[];
  _scopeRecorder=new MediaRecorder(stream,{mimeType:MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':'audio/mp4'});
  _scopeRecorder.ondataavailable=e=>{ if(e.data.size>0) _scopeChunks.push(e.data); };
  _scopeRecorder.onstop=async()=>{
    _scopeRecording=false;
    stream.getTracks().forEach(t=>t.stop());
    if(btn){ btn.textContent='🎤'; btn.style.background=''; btn.style.borderColor=''; }
    if(status) status.style.display='none';
    if(!_scopeChunks.length){ showToast('⚠️ No se grabó audio'); return; }
    const mimeUsed=_scopeRecorder.mimeType||'audio/webm';
    const blob=new Blob(_scopeChunks,{type:mimeUsed});
    showToast('⏳ Transcribiendo voz…',2000);
    try{
      const b64=await new Promise((res,rej)=>{
        const r=new FileReader();
        r.onload=()=>res(r.result.split(',')[1]);
        r.onerror=rej;
        r.readAsDataURL(blob);
      });
      const resp=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key='+GEMINI_KEY,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({contents:[{parts:[
          {text:'Transcribe este audio exactamente tal como se dijo. Solo devuelve el texto transcrito, sin explicaciones ni comentarios adicionales.'},
          {inlineData:{mimeType:mimeUsed,data:b64}}
        ]}]})
      });
      const d=await resp.json();
      const txt=(d.candidates?.[0]?.content?.parts?.[0]?.text||'').trim();
      if(txt){
        const ta=document.getElementById('scope-text');
        if(ta){ ta.value=(ta.value?ta.value+'\n':'')+txt; }
        showToast('✅ Voz capturada — presiona Simular Plan con IA',2500);
      } else {
        showToast('⚠️ No se pudo transcribir el audio',3000);
      }
    }catch(err){
      console.error('Scope voice transcribe error:',err);
      showToast('⚠️ Error al transcribir: '+err.message,4000);
    }
  };
  _scopeRecorder.start(500); // timeslice 500ms para datos continuos
  _scopeRecording=true;
  if(btn){ btn.textContent='⏹'; btn.style.background='rgba(220,38,38,.12)'; btn.style.borderColor='#dc2626'; }
  if(status) status.style.display='flex';
}


// ── Scope file (cotización PDF/imagen) ───────────
let _scopeFileData=null;

function _renderChips(){
  const c=document.getElementById('scope-files-chips');
  if(!c) return;
  c.innerHTML='';
  _scopeFiles.forEach(function(f,i){
    const icon=f.isAudio?'🎵':f.isPDF?'📄':f.isImage?'🖼':'📎';
    const d=document.createElement('div');
    d.style.cssText='display:inline-flex;align-items:center;gap:5px;background:rgba(16,124,16,.08);border:1px solid rgba(16,124,16,.25);border-radius:6px;padding:3px 8px;font-size:11px;color:var(--green)';
    d.innerHTML=icon+' <span style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+f.name+'</span> <button data-idx="'+i+'" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:11px;padding:0 0 0 3px;line-height:1">✕</button>';
    d.querySelector('button').onclick=function(){_scopeFiles.splice(parseInt(this.dataset.idx),1);_renderChips();};
    c.appendChild(d);
  });
}

async function handleScopeFiles(event){
  const files=Array.from(event.target.files);
  if(!files.length) return;
  for(let fi=0;fi<files.length;fi++){
    const file=files[fi];
    const isImage=file.type.startsWith('image/');
    const isPDF=file.type==='application/pdf';
    const isAudio=file.type.startsWith('audio/')||/\.(mp3|m4a|wav|ogg|webm)$/i.test(file.name);
    const b64=await new Promise(function(res){
      const r=new FileReader();
      r.onload=function(ev){res(ev.target.result.split(',')[1]);};
      r.readAsDataURL(file);
    });
    _scopeFiles.push({base64:b64,mediaType:file.type,name:file.name,isImage:isImage,isPDF:isPDF,isAudio:isAudio});
    if(!isAudio) _scopeFileData={base64:b64,mediaType:file.type,isImage:isImage,isPDF:isPDF,name:file.name};
  }
  _renderChips();
  showToast(files.length+' archivo(s) listos para análisis');
  event.target.value='';
}

async function handleScopeFile(event){
  return handleScopeFiles(event);
}

function removeScopeFile(idx){
  if(idx===undefined){_scopeFiles=[];_scopeFileData=null;}
  else _scopeFiles.splice(idx,1);
  _renderChips();
}

// ════════════════════════════════════════════════════
// IMAGE ANALYSIS
// ════════════════════════════════════════════════════
let _attachedImage=null; // {base64, mediaType, dataUrl}

function handleImageAttach(input){
  const file=input.files[0];if(!file) return;
  const reader=new FileReader();
  reader.onload=(ev)=>{
    const dataUrl=ev.target.result;
    const base64=dataUrl.split(',')[1];
    const mediaType=file.type||'image/jpeg';
    _attachedImage={base64,mediaType,dataUrl};
    // Show preview
    const row=document.getElementById('img-preview-row');
    const thumb=document.getElementById('img-preview-thumb');
    if(row&&thumb){
      thumb.src=dataUrl;
      row.style.display='block';
    }
    document.getElementById('chat-status').textContent='📸 Imagen lista — envía un mensaje o presiona ➤ para analizar';
    // Auto-send with default analysis prompt
    document.getElementById('chat-input').value='Analiza esta imagen de la situación en planta y sugiere riesgos para el IPERC';
  };
  reader.readAsDataURL(file);
  input.value='';
}

function clearImageAttach(){
  _attachedImage=null;
  document.getElementById('img-preview-row').style.display='none';
  document.getElementById('img-preview-thumb').src='';
  document.getElementById('chat-status').textContent='';
}

// ════════════════════════════════════════════════════
// AI CHAT
// ════════════════════════════════════════════════════
function getChatSystem(){
  const c=_selectedClient||CLIENT_CONFIG[CLIENT_CONFIG.length-1];
  return `Eres un experto en seguridad industrial con certificación en NOM-004-STPS (Método FINE), NOM-009-STPS (alturas), NOM-027-STPS (soldadura), NOM-033-STPS (espacios confinados), NOM-001-STPS (instalaciones eléctricas), y estándares OSHA 1910/1926.

Ayudas a seguristas de FTS (empresa de ejecución industrial en plantas activas en México) a:
- Identificar riesgos por tipo de trabajo
- Aplicar el Método FINE: GR = Consecuencia × Exposición × Probabilidad
- Definir controles según jerarquía OSHA (Eliminación→Sustitución→Ingeniería→Administrativos→EPP)
- Proponer EPP específico y normativa aplicable (NOMs mexicanas)
- Analizar imágenes reales de plantas industriales para identificar riesgos visibles

CONTEXTO DEL CLIENTE ACTIVO: ${c.nombre}
${c.chatContext}

Cuando analices una imagen:
1. Describe brevemente lo que observas (ambiente, actividad, condiciones)
2. Lista los riesgos en formato estructurado: **Riesgo** | Tipo | C:## E:## P:## | GR=resultado | Controles clave
3. Indica el nivel FINE para cada uno (Inminente/Alto/Notable/Moderado)
4. Finaliza con: "¿Deseas agregar estos riesgos al IPERC?"

Responde siempre en español. Sé conciso y práctico. Usa listas y negritas para claridad.`;
}

let chatHistory=[];
let chatBusy=false;

function chatKeydown(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();}}
function quickChat(msg){document.getElementById('chat-input').value=msg;sendChat();}

async function sendChat(){
  if(chatBusy) return;
  const input=document.getElementById('chat-input');
  const msg=input.value.trim();if(!msg&&!_attachedImage) return;
  input.value='';chatBusy=true;
  document.getElementById('chat-send').disabled=true;
  const status=document.getElementById('chat-status');

  // Build message content
  let userContent;
  if(_attachedImage){
    // Show image in chat
    addImageMsg(_attachedImage.dataUrl);
    userContent=[
      {type:'image',source:{type:'base64',media_type:_attachedImage.mediaType,data:_attachedImage.base64}},
      {type:'text',text:msg||'Analiza esta imagen de la situación en planta e identifica riesgos para el IPERC con el Método FINE'}
    ];
    chatHistory.push({role:'user',content:userContent});
    clearImageAttach();
  } else {
    addMsg(msg,'user');
    userContent=msg;
    chatHistory.push({role:'user',content:msg});
  }

  if(status) status.textContent='⏳ Analizando...';
  const typing=addTyping();

  try{
    // Build Gemini parts including image if attached
    const parts=[];
    if(_attachedImage){
      parts.push({inline_data:{mime_type:_attachedImage.mediaType,data:_attachedImage.base64}});
    }
    // Convert chat history to single prompt for Gemini (stateless per request)
    const systemPrompt=getChatSystem();
    const historyText=chatHistory.slice(-10).map(m=>`${m.role==='user'?'Usuario':'Asistente'}: ${typeof m.content==='string'?m.content:(m.content?.find?.(c=>c.type==='text')?.text||'')}`).join('\n');
    parts.push({text:`${systemPrompt}\n\n${historyText?'Conversación previa:\n'+historyText+'\n\n':''}Usuario: ${msg||'(imagen adjunta)'}\n\nAsistente:`});
    // Chat: Groq si no hay imagen adjunta, Gemini si hay imagen (multimodal)
    const reply = (GROQ_KEY && !_attachedImage)
      ? await callGroq(parts.find(p=>p.text)?.text||msg, 1500)
      : await callGemini(parts, 1200);
    typing.remove();
    const finalReply=reply||'Error al conectar.';
    const msgEl=addMsg(finalReply,'ai');
    chatHistory.push({role:'assistant',content:finalReply});

    if(finalReply.toLowerCase().includes('riesgo')&&(finalReply.includes('GR')|| finalReply.includes('C:')|| finalReply.includes('|')||/\d+\s*×\s*\d+/.test(finalReply))){
      const addBtn=document.createElement('div');
      addBtn.className='msg-add-btn';
      addBtn.innerHTML='🛡️ Revisar y agregar al IPERC';
      addBtn.onclick=()=>openSuggestFromAI(finalReply);
      msgEl.appendChild(addBtn);
    }
  }catch(e){
    typing.remove();
    addMsg('⚠️ Error de conexión. Verifica que tu API key de Gemini esté configurada en el panel ⚙️','ai');
  }
  _attachedImage=null;
  const preview=document.getElementById('img-preview-wrap');
  if(preview) preview.remove();
  chatBusy=false;
  if(status) status.textContent='';
  document.getElementById('chat-send').disabled=false;
}

function addMsg(text,type){
  const msgs=document.getElementById('chat-msgs');
  const d=document.createElement('div');
  d.className=`msg msg-${type}`;
  d.innerHTML=text.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
  msgs.appendChild(d);
  msgs.scrollTop=msgs.scrollHeight;
  return d;
}

function addImageMsg(dataUrl){
  const msgs=document.getElementById('chat-msgs');
  const d=document.createElement('div');
  d.className='msg-image-wrap';
  d.innerHTML=`<img src="${dataUrl}" alt="Imagen de planta">`;
  msgs.appendChild(d);
  msgs.scrollTop=msgs.scrollHeight;
}

function addTyping(){
  const msgs=document.getElementById('chat-msgs');
  const d=document.createElement('div');
  d.className='msg msg-typing';
  d.innerHTML='<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
  msgs.appendChild(d);
  msgs.scrollTop=msgs.scrollHeight;
  return d;
}

// ════════════════════════════════════════════════════
// SUGGEST TO IPERC (from AI response)
// ════════════════════════════════════════════════════
let _pendingSuggestions=[];

function openSuggestFromAI(responseText){
  // Parse AI response to extract risks
  const suggestions=parseRisksFromAIResponse(responseText);
  if(!suggestions.length){
    showToast('ℹ️ No se detectaron riesgos estructurados. Agrégalos manualmente en el Paso 3.');return;
  }
  _pendingSuggestions=suggestions;
  const list=document.getElementById('suggest-list');
  list.innerHTML=suggestions.map((r,i)=>`
    <div class="suggest-risk-item sel" id="sug-item-${i}" onclick="toggleSugItem(${i})">
      <div class="sug-chk" id="sug-chk-${i}">✓</div>
      <div class="sug-info">
        <div class="sug-name">${r.riesgo}</div>
        <div class="sug-detail">${r.tipo} · ${r.consec||'—'} · GR ${r.c*r.e*r.p} (C:${r.c}×E:${r.e}×P:${r.p})</div>
        <div class="sug-detail" style="color:var(--blue)">Controles: ${Array.isArray(r.admin)?r.admin.join(', '):(r.admin||'—')}</div>
      </div>
    </div>`).join('');
  document.getElementById('suggest-modal').classList.add('open');
}

function toggleSugItem(i){
  const item=document.getElementById(`sug-item-${i}`);
  const chk=document.getElementById(`sug-chk-${i}`);
  item.classList.toggle('sel');
  chk.textContent=item.classList.contains('sel')?'✓':'';
}

function closeSuggestModal(){
  document.getElementById('suggest-modal').classList.remove('open');
  _pendingSuggestions=[];
}

function confirmAddSuggestions(){
  const selected=_pendingSuggestions.filter((_,i)=>document.getElementById(`sug-item-${i}`)?.classList.contains('sel'));
  if(!selected.length){showToast('Selecciona al menos un riesgo');return;}
  const acts=state.activities.filter(a=>a.on).map(a=>a.name);
  const targetAct=acts.length?acts[0]:'Riesgos de IA';
  if(!state.selectedRisks[targetAct]) state.selectedRisks[targetAct]=[];
  if(!state.activities.find(a=>a.name===targetAct)&&targetAct==='Riesgos de IA')
    state.activities.push({name:targetAct,on:true,source:'ai'});
  let added=0;
  selected.forEach(r=>{
    if(!state.selectedRisks[targetAct].find(x=>x.riesgo===r.riesgo)){
      state.selectedRisks[targetAct].push({...r,on:true,source:'ai_suggested'});added++;
    }
  });
  closeSuggestModal();
  showToast(`✅ ${added} riesgo(s) agregados a "${targetAct}". Ve al Paso 3 para revisarlos.`);
}

function parseRisksFromAIResponse(text){
  const risks=[];
  // Pattern: line with riesgo and numbers that look like C, E, P values
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
  lines.forEach(line=>{
    // Look for patterns like "Riesgo | Tipo | C:25 | E:6 | P:10" or "- **Riesgo**: ..."
    const grMatch=line.match(/GR[:\s=]+(\d+)/i);
    if(grMatch||/\bc:\d+\b.*\be:\d+\b/i.test(line)){
      const cMatch=line.match(/\bc[:\s]+(\d+(?:\.\d+)?)/i);
      const eMatch=line.match(/\be[:\s]+(\d+(?:\.\d+)?)/i);
      const pMatch=line.match(/\bp[:\s]+(\d+(?:\.\d+)?)/i);
      const c=parseFloat(cMatch?.[1])||25;const e=parseFloat(eMatch?.[1])||6;const p=parseFloat(pMatch?.[1])||3;
      // Extract riesgo name (before the first | or : or numbers)
      const riesgoRaw=line.replace(/\*\*/g,'').replace(/\|.*/,'').replace(/[:\-•·]/g,'').replace(/\d.*$/,'').trim();
      if(riesgoRaw.length>5){
        risks.push({tipo:'Mecánico',riesgo:riesgoRaw.substring(0,80),consec:'',c,e,p,
          admin:['Controles según análisis IA'],epp:'Según evaluación',c2:Math.max(1,Math.round(c/3)),e2:e,p2:1,
          def:'ALTO',ejec:'MEDIO',ef:'MEDIO',learned:true,source:'ai_vision'});
      }
    }
  });
  // Fallback: if no structured risks found, create general ones from bold items
  if(!risks.length){
    const boldMatches=[...text.matchAll(/\*\*([^*]{5,60})\*\*/g)];
    boldMatches.slice(0,5).forEach(m=>{
      const t=m[1].trim();
      if(t.length>8&&!/nota|recuerda|importante|consejo|siguiente|paso/i.test(t)){
        risks.push({tipo:'Mecánico',riesgo:t.substring(0,80),consec:'Ver análisis de IA',c:15,e:3,p:3,
          admin:['Revisar con segurista'],epp:'Según evaluación',c2:5,e2:3,p2:1,
          def:'ALTO',ejec:'MEDIO',ef:'MEDIO',source:'ai_suggested'});
      }
    });
  }
  return risks;
}
