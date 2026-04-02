/* ================================================================
   FTS VIDEO TRAINING MODULE — v3.1
   Insertar justo antes de </body> en index.html
   Archivos externos requeridos (raíz del repo):
     · videos.json       → catálogo de cursos y paquetes
     · asignaciones.json → asignaciones instructor → empleado
   ================================================================ */
(function () {
'use strict';

/* ── Config ──────────────────────────────────────────────────── */
const BASE     = 'https://raw.githubusercontent.com/yinyo1/fts-suite/main';
const VID_URL  = BASE + '/videos.json';
const ASIG_URL = BASE + '/asignaciones.json';
const MIN_PASS = 70;

/* ── Estado global ───────────────────────────────────────────── */
const S = {
  cursos:      [],   // del videos.json
  paquetes:    [],   // del videos.json
  asignaciones:[],   // del asignaciones.json  [{curp,nombre,cursos:[ids]}]
  seleccion:   [],   // checkboxes del empleado
  cola:        [],   // cursos en ejecución
  indice:      0,
  empleado:    null,
  resultados:  {},   // {id: {aprobado,score,foto,hash,ts}}
  camStream:   null,
};

/* ════════════════════════════════════════════════════════════
   1. CARGA DE DATOS
═══════════════════════════════════════════════════════════════*/
async function cargarTodo() {
  const [vRes, aRes] = await Promise.allSettled([
    fetch(VID_URL  + '?_=' + Date.now()),
    fetch(ASIG_URL + '?_=' + Date.now()),
  ]);

  if (vRes.status === 'fulfilled' && vRes.value.ok) {
    const d = await vRes.value.json();
    S.cursos   = (d.cursos   || []).filter(c => c.activo !== false);
    S.paquetes = d.paquetes  || [];
  }

  if (aRes.status === 'fulfilled' && aRes.value.ok) {
    const d = await aRes.value.json();
    S.asignaciones = d.asignaciones || [];
  }

  // Mezclar con sessionStorage (asignaciones hechas en esta sesión)
  try {
    const local = JSON.parse(sessionStorage.getItem('fts3_asig') || '[]');
    local.forEach(la => {
      const idx = S.asignaciones.findIndex(a =>
        (a.curp && a.curp === la.curp) || a.nombre === la.nombre);
      if (idx >= 0) S.asignaciones[idx] = { ...S.asignaciones[idx], ...la };
      else S.asignaciones.push(la);
    });
  } catch(e) {}

  console.log('[FTS3.1] cursos:', S.cursos.length,
    '| paquetes:', S.paquetes.length,
    '| asignaciones:', S.asignaciones.length);
}

/* Helper: buscar asignación de un empleado */
function _getAsig(emp) {
  if (!emp) return null;
  return S.asignaciones.find(a =>
    (emp.curp && a.curp && a.curp.trim().toUpperCase() === emp.curp.trim().toUpperCase()) ||
    (a.nombre && emp.nombre && a.nombre.trim().toUpperCase().includes(emp.nombre.trim().toUpperCase()))
  ) || null;
}

/* ════════════════════════════════════════════════════════════
   2. CSS
═══════════════════════════════════════════════════════════════*/
function inyectarCSS() {
  if (document.getElementById('fts3-css')) return;
  const s = document.createElement('style');
  s.id = 'fts3-css';
  s.textContent = `
  .fts3-ov{position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:9000;
    display:none;align-items:flex-start;justify-content:center;
    overflow-y:auto;padding:14px 10px 40px;box-sizing:border-box}
  .fts3-ov.on{display:flex}
  .fts3-box{background:#fff;border-radius:14px;width:100%;max-width:580px;
    padding:18px;position:relative;box-sizing:border-box}
  .fts3-close{position:absolute;top:10px;right:10px;background:#f0f0f0;
    border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:15px}
  .fc-card{background:#f5f5f5;border:1px solid #e0e0e0;border-radius:10px;
    padding:12px;margin-bottom:8px}
  .fc-title{font-weight:700;font-size:13px}
  .fc-url{font-size:10px;color:#0078D4;word-break:break-all;
    background:#f0f6ff;padding:2px 6px;border-radius:3px;margin:4px 0}
  .fc-meta{font-size:11px;color:#999;margin-top:2px}
  .fc-btns{display:flex;gap:5px;margin-top:7px;flex-wrap:wrap}
  .fb{font-size:11px;padding:4px 9px;border-radius:5px;border:none;
    cursor:pointer;font-family:Inter,sans-serif;font-weight:600}
  .fb-e{background:#e8e8e8;color:#333}
  .fb-d{background:#ffeaea;color:#c00}
  .fb-t{background:#e8f5e9;color:#107C10}
  .fts3-form label{font-size:11px;color:#666;display:block;margin-bottom:2px}
  .fts3-form input,.fts3-form textarea,.fts3-form select{
    width:100%;box-sizing:border-box;margin-bottom:8px;padding:9px 11px;
    border:1px solid #ccc;border-radius:7px;font-family:Inter,sans-serif;font-size:13px}
  .fts3-json{background:#111;color:#00ff88;font-family:monospace;font-size:10px;
    padding:10px;border-radius:8px;white-space:pre;max-height:220px;
    overflow-y:auto;overflow-x:auto;word-break:break-all}
  .fts3-q-item{background:#f9f9f9;border:1px solid #e0e0e0;border-radius:8px;
    padding:10px;margin-bottom:8px}
  /* Asignación en instructor */
  .fa-worker{display:flex;align-items:center;gap:8px;padding:9px 10px;
    background:#fff;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:6px;
    cursor:pointer;transition:border-color .15s}
  .fa-worker.sel{border-color:#D83B01;background:rgba(216,59,1,.04)}
  .fa-chk{width:20px;height:20px;border-radius:5px;border:2px solid #ccc;
    flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;transition:all .2s}
  .fa-worker.sel .fa-chk{background:#D83B01;border-color:#D83B01;color:#fff}
  /* Dashboard empleado */
  #fts3-dash{display:none}
  #fts3-dash.on{display:block}
  .fv-chk-card{background:#fff;border:1.5px solid #e0e0e0;border-radius:10px;
    padding:12px 13px;margin-bottom:8px;display:flex;align-items:center;gap:10px;
    cursor:pointer;transition:all .15s}
  .fv-chk-card.sel{border-color:#D83B01;background:rgba(216,59,1,.04)}
  .fv-chk-card.done{border-color:#107C10;background:rgba(16,124,16,.04);
    opacity:.75;cursor:default}
  .fv-cb{width:22px;height:22px;border-radius:6px;border:2px solid #ccc;flex-shrink:0;
    display:flex;align-items:center;justify-content:center;font-size:13px;transition:all .2s}
  .fv-chk-card.sel  .fv-cb{background:#D83B01;border-color:#D83B01;color:#fff}
  .fv-chk-card.done .fv-cb{background:#107C10;border-color:#107C10;color:#fff}
  .fv-info strong{font-size:13px;font-weight:600;display:block}
  .fv-info span{font-size:11px;color:#666}
  .fv-badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;
    margin-left:auto;flex-shrink:0}
  .fv-badge.pend{background:#f0f0f0;color:#999}
  .fv-badge.ok{background:rgba(16,124,16,.12);color:#107C10}
  /* Player y examen */
  #fts3-player{display:none;background:#fff;border:1px solid #e0e0e0;
    border-radius:14px;overflow:hidden;margin-bottom:12px}
  #fts3-player.on{display:block}
  #fts3-player iframe,#fts3-player video{width:100%;height:210px;border:none;display:block}
  .f3-prog{height:4px;background:#e0e0e0}
  .f3-prog-fill{height:100%;background:#D83B01;transition:width .4s;width:0}
  #fts3-exam{display:none;padding:14px}
  #fts3-exam.on{display:block}
  .fq-opt{background:#f5f5f5;border:1.5px solid #e0e0e0;border-radius:9px;
    padding:11px 13px;margin-bottom:7px;cursor:pointer;font-size:13px;
    display:flex;align-items:center;gap:8px;transition:all .15s}
  .fq-opt:active{transform:scale(.98)}
  .fq-opt.ok{border-color:#107C10;background:rgba(16,124,16,.08);color:#107C10}
  .fq-opt.err{border-color:#D13438;background:rgba(209,52,56,.08);color:#D13438}
  .fq-l{width:24px;height:24px;border-radius:50%;background:#e0e0e0;
    display:flex;align-items:center;justify-content:center;font-size:11px;
    font-weight:700;flex-shrink:0;transition:all .2s}
  .fq-opt.ok  .fq-l{background:#107C10;color:#fff}
  .fq-opt.err .fq-l{background:#D13438;color:#fff}
  /* Modal cámara */
  #fts3-cam{position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9100;
    display:none;align-items:center;justify-content:center}
  #fts3-cam.on{display:flex}
  .f3cam-box{background:#fff;border-radius:14px;padding:18px;
    max-width:330px;width:92%;text-align:center}
  #f3cam-vid{width:100%;border-radius:8px;transform:scaleX(-1)}
  #f3cam-cvs{display:none}
  #f3cam-prev{width:100%;border-radius:8px;display:none;margin-bottom:8px}
  .f3cam-btns{display:flex;gap:8px;margin-top:10px}
  .f3cam-btns button{flex:1;padding:10px;border-radius:8px;border:none;
    font-family:Inter,sans-serif;font-weight:700;font-size:13px;cursor:pointer}
  .f3cam-cap{background:#D83B01;color:#fff}
  .f3cam-ret{background:#f0f0f0;color:#333}
  .f3cam-ok{background:#107C10;color:#fff}
  .fts3-hash{background:#0a0a1a;color:#00ff88;font-family:monospace;font-size:9px;
    padding:6px 9px;border-radius:5px;word-break:break-all;margin:6px 0}
  `;
  document.head.appendChild(s);
}

/* ════════════════════════════════════════════════════════════
   3. MODAL CÁMARA
═══════════════════════════════════════════════════════════════*/
function inyectarCam() {
  if (document.getElementById('fts3-cam')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="fts3-cam">
      <div class="f3cam-box">
        <h3 style="margin:0 0 6px;font-size:16px">📸 Foto de verificación</h3>
        <p style="margin:0 0 12px;font-size:12px;color:#666">Mira a la cámara — evidencia de tu participación</p>
        <video id="f3cam-vid" autoplay playsinline></video>
        <canvas id="f3cam-cvs"></canvas>
        <img id="f3cam-prev" alt="">
        <div class="f3cam-btns" id="f3cam-btns-area">
          <button class="f3cam-cap" onclick="FTS3._tomarFoto()">📷 Tomar foto</button>
        </div>
        <button onclick="FTS3._saltarFoto()" style="margin-top:8px;width:100%;background:#f0f0f0;color:#666;border:none;border-radius:8px;padding:8px;font-size:12px;cursor:pointer;font-family:Inter,sans-serif">× Continuar sin foto</button>
      </div>
    </div>`);
}

/* ════════════════════════════════════════════════════════════
   4. PANEL FTSMASTER — CURSOS + EXÁMENES + PAQUETES
═══════════════════════════════════════════════════════════════*/
function inyectarBotonMaster() {
  const panel = document.getElementById('settings-panel');
  if (!panel || document.getElementById('fts3-btn-master')) return;
  panel.insertAdjacentHTML('beforeend', `
    <button id="fts3-btn-master" class="btn btn-s"
      style="padding:11px;margin-top:8px;border-color:#D83B01;color:#D83B01"
      onclick="FTS3.abrirAdmin()">
      🎬 Gestionar Cursos / Exámenes / Paquetes
    </button>`);
}

function abrirAdmin() {
  let ov = document.getElementById('fts3-admin-ov');
  if (!ov) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="fts3-admin-ov" class="fts3-ov">
        <div class="fts3-box">
          <button class="fts3-close"
            onclick="document.getElementById('fts3-admin-ov').classList.remove('on')">✕</button>
          <div id="fts3-admin-inner"></div>
        </div>
      </div>`);
    ov = document.getElementById('fts3-admin-ov');
  }
  ov.classList.add('on');
  renderAdmin('cursos');
}

function renderAdmin(tab) {
  const el = document.getElementById('fts3-admin-inner');
  if (!el) return;

  const tabBtn = (t, lbl) => `<button onclick="FTS3._adminTab('${t}')" style="flex:1;padding:9px;border:none;
    background:${tab===t?'#D83B01':'#f5f5f5'};color:${tab===t?'#fff':'#666'};
    cursor:pointer;font-family:Inter,sans-serif;font-weight:600;font-size:11px">${lbl}</button>`;

  let h = `<h3 style="margin:0 0 10px;font-size:16px">🎬 Configuración de Cursos</h3>
    <div style="display:flex;gap:0;border-bottom:2px solid #e0e0e0;margin-bottom:12px;border-radius:6px 6px 0 0;overflow:hidden">
      ${tabBtn('cursos','📚 Cursos')}
      ${tabBtn('paquetes','📦 Paquetes')}
      ${tabBtn('json','📋 Exportar JSON')}
    </div>`;

  /* ── TAB CURSOS ── */
  if (tab === 'cursos') {
    h += `<button onclick="FTS3._formCurso(null)" style="width:100%;background:#D83B01;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;margin-bottom:10px">➕ Agregar Curso</button>
      <div id="fts3-fc-form"></div>`;
    if (!S.cursos.length) {
      h += `<p style="color:#999;text-align:center;padding:16px">Sin cursos. Agrega el primero.</p>`;
    } else {
      S.cursos.forEach(c => {
        h += `<div class="fc-card">
          <div class="fc-title">${c.activo===false?'🔴':'🎬'} ${c.titulo}</div>
          <div class="fc-url">${c.url||'(sin URL)'}</div>
          <div class="fc-meta">⏱ ${c.duracion_min} min · ${c.examen?.length||0} preguntas · Orden ${c.orden_sugerido}</div>
          <div class="fc-btns">
            <button class="fb fb-e" onclick="FTS3._formCurso('${c.id}')">✏️ Editar</button>
            <button class="fb fb-t" onclick="FTS3._toggleCurso('${c.id}')">${c.activo===false?'▶️ Activar':'⏸ Pausar'}</button>
            <button class="fb fb-d" onclick="FTS3._delCurso('${c.id}')">🗑 Borrar</button>
          </div>
        </div>`;
      });
    }
  }

  /* ── TAB PAQUETES ── */
  if (tab === 'paquetes') {
    h += `<button onclick="FTS3._formPaquete(null)" style="width:100%;background:#D83B01;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;margin-bottom:10px">➕ Agregar Paquete</button>
      <div id="fts3-fp-form"></div>`;
    S.paquetes.forEach(p => {
      const nombres = (p.cursos||[]).map(id => S.cursos.find(c=>c.id===id)?.titulo||id).join(', ');
      h += `<div class="fc-card">
        <div class="fc-title">📦 ${p.nombre}</div>
        <div class="fc-meta">${p.descripcion||''}</div>
        <div class="fc-meta" style="margin-top:2px">Cursos: ${nombres||'ninguno'}</div>
        <div class="fc-btns">
          <button class="fb fb-e" onclick="FTS3._formPaquete('${p.id}')">✏️ Editar</button>
          <button class="fb fb-d" onclick="FTS3._delPaquete('${p.id}')">🗑 Borrar</button>
        </div>
      </div>`;
    });
  }

  /* ── TAB JSON ── */
  if (tab === 'json') {
    const exportVid = { cursos: S.cursos, paquetes: S.paquetes };
    const exportAsig = { asignaciones: S.asignaciones };
    h += `
      <div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:12px;margin-bottom:12px;font-size:12px">
        <strong>ℹ️ Cómo actualizar:</strong><br>
        1. Copia cada JSON<br>
        2. Abre el archivo en GitHub y pega<br>
        3. Guarda el commit — los cambios aplican inmediatamente
      </div>
      <h4 style="font-size:12px;margin:0 0 4px">📁 videos.json</h4>
      <div class="fts3-json">${JSON.stringify(exportVid,null,2)}</div>
      <button onclick="FTS3._copiar('videos')" style="margin:6px 0 14px;width:100%;background:#f0f0f0;border:none;border-radius:7px;padding:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">📋 Copiar videos.json</button>
      <h4 style="font-size:12px;margin:0 0 4px">📁 asignaciones.json</h4>
      <div class="fts3-json">${JSON.stringify(exportAsig,null,2)}</div>
      <button onclick="FTS3._copiar('asig')" style="margin-top:6px;width:100%;background:#f0f0f0;border:none;border-radius:7px;padding:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">📋 Copiar asignaciones.json</button>`;
  }

  el.innerHTML = h;
}

/* ── CRUD Cursos ── */
function _formCurso(id) {
  const c = id ? S.cursos.find(x=>x.id===id) : null;
  const wrap = document.getElementById('fts3-fc-form');
  if (!wrap) return;
  const pregs = (c?.examen||[]).map((q,qi)=>_htmlPregunta(q,qi)).join('');
  wrap.innerHTML = `<div class="fts3-form" style="background:#f8f8f8;border:2px dashed #D83B01;border-radius:10px;padding:14px;margin-bottom:12px">
    <h4 style="margin:0 0 10px;font-size:13px">${c?'✏️ Editar':'➕ Nuevo'} Curso</h4>
    <label>ID único</label>
    <input id="fc-id" value="${c?.id||'v'+String(S.cursos.length+1).padStart(3,'0')}" ${c?'readonly style="background:#f0f0f0"':''}>
    <label>Título</label><input id="fc-titulo" value="${c?.titulo||''}" placeholder="Seguridad en Alturas">
    <label>Descripción</label><input id="fc-desc" value="${c?.descripcion||''}" placeholder="NOM · Breve descripción">
    <label>URL del video (SharePoint embed o MP4)</label>
    <input id="fc-url" value="${c?.url||''}" placeholder="https://...sharepoint.com/...">
    <label>Duración (min)</label><input id="fc-dur" type="number" value="${c?.duracion_min||30}" min="1">
    <label>Orden sugerido</label><input id="fc-orden" type="number" value="${c?.orden_sugerido||S.cursos.length+1}" min="1">
    <label style="display:flex;align-items:center;gap:7px;cursor:pointer;margin-bottom:10px">
      <input type="checkbox" id="fc-oblig" ${c?.obligatorio!==false?'checked':''}> Obligatorio
    </label>
    <hr style="border-color:#e0e0e0;margin-bottom:10px">
    <h5 style="margin:0 0 8px;font-size:12px;color:#D83B01">📝 PREGUNTAS DEL EXAMEN (mín. 1)</h5>
    <div id="fc-pregs-wrap">${pregs}</div>
    <button onclick="FTS3._addPregunta()" style="width:100%;background:#f0f0f0;border:1px dashed #ccc;border-radius:7px;padding:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;margin-bottom:10px">+ Agregar pregunta</button>
    <div style="display:flex;gap:8px">
      <button onclick="FTS3._guardarCurso('${id||''}')" style="flex:1;background:#D83B01;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif">💾 Guardar</button>
      <button onclick="document.getElementById('fts3-fc-form').innerHTML=''" style="flex:1;background:#f0f0f0;color:#333;border:none;border-radius:8px;padding:10px;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">Cancelar</button>
    </div>
    <p style="font-size:10px;color:#aaa;margin-top:8px">💡 SharePoint: abre el video → Compartir → Insertar → copia el src del iframe</p>
  </div>`;
}

function _htmlPregunta(q, i) {
  const opts = (q.opciones||['','','','']).map((o,oi)=>`
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:5px">
      <input type="radio" name="fc-c-${i}" value="${oi}" ${q.correcta===oi?'checked':''}>
      <input type="text" placeholder="Opción ${String.fromCharCode(65+oi)}" value="${o||''}"
        style="flex:1;padding:6px 9px;border:1px solid #ccc;border-radius:5px;font-size:12px;font-family:Inter,sans-serif"
        data-preg="${i}" data-opt="${oi}">
    </div>`).join('');
  return `<div class="fts3-q-item" data-qi="${i}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <strong style="font-size:12px">Pregunta ${i+1}</strong>
      <button onclick="this.closest('.fts3-q-item').remove()" style="background:#ffeaea;border:none;border-radius:4px;padding:2px 7px;cursor:pointer;font-size:11px;color:#c00">✕</button>
    </div>
    <input type="text" placeholder="Texto de la pregunta" value="${q.pregunta||''}"
      style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #ccc;border-radius:5px;font-size:12px;font-family:Inter,sans-serif;margin-bottom:6px"
      data-preg="${i}" data-field="p">
    <p style="font-size:10px;color:#999;margin:0 0 5px">☑ Marca la respuesta correcta:</p>
    ${opts}
  </div>`;
}

function _addPregunta() {
  const wrap = document.getElementById('fc-pregs-wrap');
  if (!wrap) return;
  const n = wrap.querySelectorAll('.fts3-q-item').length;
  const tmp = document.createElement('div');
  tmp.innerHTML = _htmlPregunta({},n);
  wrap.appendChild(tmp.firstElementChild);
}

function _leerPreguntas() {
  return Array.from(document.querySelectorAll('#fc-pregs-wrap .fts3-q-item')).map((item,i) => {
    const pInput = item.querySelector(`[data-preg="${i}"][data-field="p"]`)
      || item.querySelector('input[type="text"]');
    const optInputs = item.querySelectorAll(`[data-opt]`);
    const correctaEl = item.querySelector(`input[type="radio"]:checked`);
    return {
      pregunta: pInput?.value?.trim()||'',
      opciones: Array.from(optInputs).map(o=>o.value?.trim()||''),
      correcta: correctaEl ? parseInt(correctaEl.value) : 0
    };
  }).filter(q=>q.pregunta);
}

function _guardarCurso(id) {
  const g = s => document.getElementById(s)?.value?.trim();
  const curso = {
    id: g('fc-id'), titulo: g('fc-titulo'), descripcion: g('fc-desc'),
    url: g('fc-url'), duracion_min: parseInt(g('fc-dur'))||30,
    obligatorio: document.getElementById('fc-oblig')?.checked,
    activo: true, orden_sugerido: parseInt(g('fc-orden'))||1,
    examen: _leerPreguntas()
  };
  if (!curso.id||!curso.titulo||!curso.url) { alert('Completa ID, Título y URL'); return; }
  if (id) {
    const i=S.cursos.findIndex(x=>x.id===id);
    if(i>=0) S.cursos[i]=curso; else S.cursos.push(curso);
  } else {
    if(S.cursos.find(x=>x.id===curso.id)){alert('ID ya existe');return;}
    S.cursos.push(curso);
  }
  S.cursos.sort((a,b)=>(a.orden_sugerido||99)-(b.orden_sugerido||99));
  renderAdmin('cursos');
}

function _toggleCurso(id){const c=S.cursos.find(x=>x.id===id);if(c){c.activo=!c.activo;renderAdmin('cursos');}}
function _delCurso(id){if(!confirm('¿Eliminar curso?'))return;S.cursos=S.cursos.filter(x=>x.id!==id);renderAdmin('cursos');}

/* ── CRUD Paquetes ── */
function _formPaquete(id) {
  const p = id ? S.paquetes.find(x=>x.id===id) : null;
  const wrap = document.getElementById('fts3-fp-form');
  if (!wrap) return;
  const checks = S.cursos.map(c=>`
    <label style="display:flex;align-items:center;gap:7px;margin-bottom:6px;cursor:pointer;font-size:12px">
      <input type="checkbox" name="fp-c" value="${c.id}" ${(p?.cursos||[]).includes(c.id)?'checked':''}> ${c.titulo}
    </label>`).join('');
  wrap.innerHTML = `<div class="fts3-form" style="background:#f8f8f8;border:2px dashed #D83B01;border-radius:10px;padding:14px;margin-bottom:12px">
    <h4 style="margin:0 0 10px;font-size:13px">${p?'✏️ Editar':'➕ Nuevo'} Paquete</h4>
    <label>ID único</label>
    <input id="fp-id" value="${p?.id||'pkg'+String(S.paquetes.length+1).padStart(2,'0')}" ${p?'readonly style="background:#f0f0f0"':''}>
    <label>Nombre del paquete</label><input id="fp-nombre" value="${p?.nombre||''}" placeholder="Onboarding General">
    <label>Descripción</label><input id="fp-desc" value="${p?.descripcion||''}" placeholder="Cursos para nuevos trabajadores">
    <label>Cursos incluidos:</label>
    <div style="background:#fff;border:1px solid #e0e0e0;border-radius:7px;padding:10px;margin-bottom:10px">${checks||'<p style="font-size:12px;color:#999">No hay cursos cargados.</p>'}</div>
    <div style="display:flex;gap:8px">
      <button onclick="FTS3._guardarPaquete('${id||''}')" style="flex:1;background:#D83B01;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif">💾 Guardar</button>
      <button onclick="document.getElementById('fts3-fp-form').innerHTML=''" style="flex:1;background:#f0f0f0;color:#333;border:none;border-radius:8px;padding:10px;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">Cancelar</button>
    </div>
  </div>`;
}

function _guardarPaquete(id) {
  const g = s=>document.getElementById(s)?.value?.trim();
  const cursosSel = Array.from(document.querySelectorAll('input[name="fp-c"]:checked')).map(e=>e.value);
  const p = {id:g('fp-id'),nombre:g('fp-nombre'),descripcion:g('fp-desc'),cursos:cursosSel};
  if(!p.id||!p.nombre){alert('Completa ID y Nombre');return;}
  if(id){const i=S.paquetes.findIndex(x=>x.id===id);if(i>=0)S.paquetes[i]=p;else S.paquetes.push(p);}
  else{if(S.paquetes.find(x=>x.id===p.id)){alert('ID ya existe');return;}S.paquetes.push(p);}
  renderAdmin('paquetes');
}

function _delPaquete(id){if(!confirm('¿Eliminar paquete?'))return;S.paquetes=S.paquetes.filter(x=>x.id!==id);renderAdmin('paquetes');}
function _adminTab(t){renderAdmin(t);}
function _copiar(tipo) {
  const txt = tipo==='asig'
    ? JSON.stringify({asignaciones:S.asignaciones},null,2)
    : JSON.stringify({cursos:S.cursos,paquetes:S.paquetes},null,2);
  const archivo = tipo==='asig' ? 'asignaciones.json' : 'videos.json';
  navigator.clipboard.writeText(txt)
    .then(()=>alert(`✅ Copiado. Pégalo en ${archivo} en GitHub.`))
    .catch(()=>alert('Selecciona el texto manualmente.'));
}

/* ════════════════════════════════════════════════════════════
   5. PANEL INSTRUCTOR — ASIGNAR CURSOS
═══════════════════════════════════════════════════════════════*/
function inyectarAsignacion() {
  const tpW = document.getElementById('tp-workers');
  if (!tpW || document.getElementById('fts3-asig-section')) return;

  tpW.insertAdjacentHTML('beforeend', `
    <div id="fts3-asig-section">
      <div style="height:1px;background:#e0e0e0;margin:12px 0"></div>
      <div style="font-size:12px;font-weight:700;color:#D83B01;margin-bottom:8px;letter-spacing:.3px">
        📚 ASIGNAR CURSOS A TRABAJADORES
      </div>

      <!-- Lista de trabajadores del panel original -->
      <p style="font-size:11px;color:#666;margin:0 0 6px">Selecciona trabajadores:</p>
      <div id="fts3-wk-list" style="margin-bottom:10px"></div>

      <!-- Paquete completo -->
      <label style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.5px">Asignar paquete completo</label>
      <select id="fts3-pkg-sel" style="width:100%;padding:9px 11px;border:1px solid #e0e0e0;border-radius:7px;font-family:Inter,sans-serif;font-size:13px;margin-bottom:8px;background:#fff;color:#1a1a1a;-webkit-appearance:none">
        <option value="">— Elegir paquete —</option>
      </select>

      <!-- Cursos individuales -->
      <label style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.5px">O cursos individuales</label>
      <div id="fts3-curso-chks" style="background:#fff;border:1px solid #e0e0e0;border-radius:7px;padding:10px;margin-bottom:10px"></div>

      <button onclick="FTS3.asignar()" style="width:100%;background:#D83B01;color:#fff;border:none;border-radius:8px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;margin-bottom:8px">✅ Asignar cursos</button>

      <!-- Exportar asignaciones.json -->
      <button onclick="FTS3.verAsignaciones()" style="width:100%;background:#f0f0f0;color:#333;border:1px solid #e0e0e0;border-radius:8px;padding:9px;font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">📋 Ver / Exportar asignaciones.json</button>

      <!-- Asignaciones actuales -->
      <div id="fts3-asig-actual" style="margin-top:10px"></div>
    </div>`);

  _refrescarAsigPanel();
}

function _refrescarAsigPanel() {
  // Trabajadores del panel original
  const wkList = document.getElementById('fts3-wk-list');
  const pkgSel = document.getElementById('fts3-pkg-sel');
  const cursoChks = document.getElementById('fts3-curso-chks');

  const workers = Array.from(document.querySelectorAll('#worker-list .worker-row'))
    .map(el => ({
      nombre: el.querySelector('.wr-info strong')?.textContent?.trim()||'',
      curp:   el.querySelector('.wr-info span')?.textContent?.trim()||''
    })).filter(w=>w.nombre);

  if (wkList) {
    wkList.innerHTML = workers.length
      ? workers.map(w=>`
          <div class="fa-worker" data-curp="${w.curp}" data-nombre="${w.nombre}"
            onclick="this.classList.toggle('sel');this.querySelector('.fa-chk').textContent=this.classList.contains('sel')?'✓':''">
            <div class="fa-chk"></div>
            <div>
              <strong style="font-size:13px;display:block">${w.nombre}</strong>
              <span style="font-size:11px;color:#666">${w.curp||'Sin CURP'}</span>
            </div>
          </div>`).join('')
      : `<p style="font-size:12px;color:#999;padding:6px 0">Agrega trabajadores arriba primero.</p>`;
  }

  if (pkgSel) {
    pkgSel.innerHTML = `<option value="">— Elegir paquete —</option>` +
      S.paquetes.map(p=>`<option value="${p.id}">${p.nombre} (${p.cursos?.length||0} cursos)</option>`).join('');
  }

  if (cursoChks) {
    cursoChks.innerHTML = S.cursos.map(c=>`
      <label style="display:flex;align-items:center;gap:7px;margin-bottom:6px;cursor:pointer;font-size:12px">
        <input type="checkbox" name="fts3-ind" value="${c.id}"> ${c.titulo}
      </label>`).join('') || '<p style="font-size:12px;color:#999">Sin cursos cargados.</p>';
  }
}

function asignar() {
  const sels = Array.from(document.querySelectorAll('.fa-worker.sel'));
  if (!sels.length) { alert('Selecciona al menos un trabajador'); return; }

  const pkgId = document.getElementById('fts3-pkg-sel')?.value;
  let ids = [];
  if (pkgId) {
    ids = S.paquetes.find(p=>p.id===pkgId)?.cursos || [];
  } else {
    ids = Array.from(document.querySelectorAll('input[name="fts3-ind"]:checked')).map(e=>e.value);
  }
  if (!ids.length) { alert('Elige un paquete o cursos individuales'); return; }

  sels.forEach(el => {
    const curp   = el.dataset.curp   || '';
    const nombre = el.dataset.nombre || '';
    const existIdx = S.asignaciones.findIndex(a =>
      (curp && a.curp === curp) || a.nombre === nombre);
    if (existIdx >= 0) {
      S.asignaciones[existIdx].cursos = ids;
    } else {
      S.asignaciones.push({ curp, nombre, cursos: ids });
    }
  });

  // Guardar en sessionStorage como respaldo
  sessionStorage.setItem('fts3_asig', JSON.stringify(S.asignaciones));

  alert(`✅ ${ids.length} curso(s) asignados a ${sels.length} trabajador(es).\n\nRecuerda exportar asignaciones.json y subirlo a GitHub para que persista entre dispositivos.`);

  // Limpiar selección
  sels.forEach(el=>{ el.classList.remove('sel'); const c=el.querySelector('.fa-chk');if(c)c.textContent=''; });
  _mostrarAsignActuales();
}

function verAsignaciones() {
  // Abre el panel admin en la pestaña de JSON (asig)
  abrirAdmin();
  setTimeout(()=>renderAdmin('json'), 50);
}

function _mostrarAsignActuales() {
  const el = document.getElementById('fts3-asig-actual');
  if (!el || !S.asignaciones.length) return;
  let h = `<p style="font-size:11px;font-weight:700;color:#666;margin:8px 0 4px">Asignaciones en esta sesión:</p>`;
  S.asignaciones.filter(a=>a.cursos?.length).forEach(a=>{
    const nombres = (a.cursos||[]).map(id=>S.cursos.find(c=>c.id===id)?.titulo||id).join(', ');
    h += `<div style="background:#f5f5f5;border-radius:6px;padding:7px 9px;margin-bottom:5px;font-size:11px">
      <strong>${a.nombre||a.curp}</strong><br><span style="color:#666">${nombres}</span>
    </div>`;
  });
  el.innerHTML = h;
}

/* ════════════════════════════════════════════════════════════
   6. DASHBOARD EMPLEADO — CHECKBOXES
═══════════════════════════════════════════════════════════════*/
function hookEdash() {
  const obs = new MutationObserver(() => {
    const edash = document.getElementById('s-edash');
    if (!edash?.classList.contains('on')) return;
    if (document.getElementById('fts3-dash')) return;

    const content = edash.querySelector('.content');
    if (!content) return;

    S.empleado = {
      nombre:   document.getElementById('emp-nom')?.value?.trim()  || '',
      apaterno: document.getElementById('emp-ap')?.value?.trim()   || '',
      amaterno: document.getElementById('emp-am')?.value?.trim()   || '',
      curp:     document.getElementById('emp-curp')?.value?.trim() || '',
    };

    // Buscar asignación del empleado
    const asig = _getAsig(S.empleado);
    const ids  = asig?.cursos || S.cursos.map(c=>c.id); // sin asignación → todos
    const cursos = ids.map(id=>S.cursos.find(c=>c.id===id)).filter(Boolean);

    if (!cursos.length) return;

    // Inyectar dashboard
    const dashDiv = document.createElement('div');
    dashDiv.id = 'fts3-dash';
    dashDiv.className = 'on';
    dashDiv.innerHTML = _renderDash(cursos);
    content.insertBefore(dashDiv, content.firstChild);

    // Inyectar player y examen (ocultos)
    ['fts3-player','fts3-exam'].forEach((id,i) => {
      const d = document.createElement('div');
      d.id = id;
      content.insertBefore(d, content.children[i+1]||null);
    });
  });
  obs.observe(document.body, { attributes:true, subtree:true, attributeFilter:['class'] });
}

function _renderDash(cursos) {
  let h = `<div style="background:#fff;border:1px solid #e0e0e0;border-radius:14px;padding:14px;margin-bottom:12px">
    <h4 style="margin:0 0 4px;font-size:14px;font-weight:700">📚 Tus cursos asignados</h4>
    <p style="font-size:12px;color:#666;margin-bottom:10px">Selecciona los que quieres realizar hoy</p>`;

  cursos.forEach(c => {
    const done = S.resultados[c.id]?.aprobado;
    h += `<div class="fv-chk-card ${done?'done':''}" id="fts3-cv-${c.id}" ${done?'':'onclick="FTS3._toggleCV(\''+c.id+'\')"'}>
      <div class="fv-cb">${done?'✓':''}</div>
      <div class="fv-info">
        <strong>${c.titulo}</strong>
        <span>⏱ ${c.duracion_min} min · ${c.examen?.length||0} preguntas</span>
      </div>
      <span class="fv-badge ${done?'ok':'pend'}">${done?'✅ Aprobado':'Pendiente'}</span>
    </div>`;
  });

  h += `<button onclick="FTS3.iniciarSel()" style="width:100%;background:#D83B01;color:#fff;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:800;cursor:pointer;font-family:Inter,sans-serif;margin-top:6px">🚀 Iniciar cursos seleccionados</button>
  </div>`;
  return h;
}

function _toggleCV(id) {
  const el = document.getElementById('fts3-cv-'+id);
  if (!el||el.classList.contains('done')) return;
  el.classList.toggle('sel');
  const cb=el.querySelector('.fv-cb');
  if(cb)cb.textContent=el.classList.contains('sel')?'✓':'';
}

function iniciarSel() {
  const sels = Array.from(document.querySelectorAll('.fv-chk-card.sel'))
    .map(el=>el.id.replace('fts3-cv-',''));
  if (!sels.length) { alert('Selecciona al menos un curso'); return; }
  S.cola=[...sels]; S.indice=0;
  _sigCurso();
}

/* ════════════════════════════════════════════════════════════
   7. FLUJO: VIDEO → EXAMEN → FOTO → HASH → PDF
═══════════════════════════════════════════════════════════════*/
function _sigCurso() {
  while(S.indice<S.cola.length && S.resultados[S.cola[S.indice]]?.aprobado) S.indice++;
  if(S.indice>=S.cola.length){_finTodo();return;}
  _mostrarVideo(S.cursos.find(c=>c.id===S.cola[S.indice]));
}

function _mostrarVideo(c) {
  _ocultar(['fts3-dash','fts3-exam']);
  const p=document.getElementById('fts3-player');if(!p)return;
  p.classList.add('on');
  const esIframe=c.url.includes('sharepoint')||c.tipo==='sharepoint';
  const media=esIframe
    ?`<iframe src="${c.url}" allowfullscreen allow="autoplay"></iframe>`
    :`<video id="fts3-vid-tag" controls controlslist="nodownload" preload="metadata"><source src="${c.url}"></video>`;
  p.innerHTML=`<div style="padding:14px">
    <p style="font-size:11px;color:#999;margin:0 0 2px">Curso ${S.indice+1} de ${S.cola.length}</p>
    <h3 style="margin:0 0 10px;font-size:15px">${c.titulo}</h3>
    ${media}
    <div class="f3-prog"><div class="f3-prog-fill" id="f3vfill"></div></div>
    <p style="font-size:12px;color:#666;margin:6px 0 4px">${c.descripcion||''}</p>
    <p style="font-size:11px;color:#999;margin-bottom:12px">⏱ ${c.duracion_min} min estimados</p>
    <button onclick="FTS3._iniciarExamen('${c.id}')" style="width:100%;background:#107C10;color:#fff;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:800;cursor:pointer;font-family:Inter,sans-serif">✅ Terminé el video — Presentar examen →</button>
  </div>`;
  const tag=document.getElementById('fts3-vid-tag');
  if(tag)tag.addEventListener('timeupdate',()=>{
    const pct=tag.duration?(tag.currentTime/tag.duration*100).toFixed(1):0;
    const f=document.getElementById('f3vfill');if(f)f.style.width=pct+'%';
  });
}

/* ── Examen ── */
let _EX={id:'',pregs:[],resp:[],idx:0};

function _iniciarExamen(id) {
  const c=S.cursos.find(x=>x.id===id);
  if(!c?.examen?.length){_pedirFoto(id,100);return;}
  _ocultar(['fts3-player']);
  const examDiv=document.getElementById('fts3-exam');if(!examDiv)return;
  examDiv.classList.add('on');
  const pregs=[...c.examen].sort(()=>Math.random()-.5).slice(0,Math.min(5,c.examen.length));
  _EX={id,pregs,resp:new Array(pregs.length).fill(-1),idx:0};
  _renderQ();
}

function _renderQ(){
  const {pregs,resp,idx}=_EX;
  const q=pregs[idx];
  const examDiv=document.getElementById('fts3-exam');if(!examDiv)return;
  examDiv.innerHTML=`<div style="padding:14px">
    <p style="font-size:11px;color:#999;margin:0 0 4px">Pregunta ${idx+1} de ${pregs.length}</p>
    <h4 style="font-size:14px;font-weight:700;line-height:1.4;margin-bottom:14px">${q.pregunta}</h4>
    <div id="f3opts">
      ${q.opciones.map((o,oi)=>`<div class="fq-opt" onclick="FTS3._selOpt(${oi})" id="f3o${oi}">
        <div class="fq-l">${String.fromCharCode(65+oi)}</div>${o}
      </div>`).join('')}
    </div>
    <div id="f3fb" style="display:none;margin-top:10px;padding:10px;border-radius:8px;font-size:13px;font-weight:500"></div>
    <button id="f3next" onclick="FTS3._sigQ()" style="display:none;width:100%;background:#D83B01;color:#fff;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:800;cursor:pointer;font-family:Inter,sans-serif;margin-top:10px">
      ${idx<pregs.length-1?'Siguiente →':'Ver resultado'}
    </button>
  </div>`;
}

function _selOpt(oi){
  const{pregs,resp,idx}=_EX;
  if(resp[idx]!==-1)return;
  resp[idx]=oi;
  const cor=pregs[idx].correcta;
  document.querySelectorAll('.fq-opt').forEach((el,i)=>{
    if(i===cor)el.classList.add('ok');
    else if(i===oi&&oi!==cor)el.classList.add('err');
  });
  const fb=document.getElementById('f3fb'),next=document.getElementById('f3next');
  if(fb){
    fb.style.display='block';
    if(oi===cor){fb.style.cssText='display:block;margin-top:10px;padding:10px;border-radius:8px;font-size:13px;font-weight:500;background:rgba(16,124,16,.08);border:1px solid rgba(16,124,16,.25);color:#107C10';fb.textContent='✅ ¡Correcto!';}
    else{fb.style.cssText='display:block;margin-top:10px;padding:10px;border-radius:8px;font-size:13px;font-weight:500;background:rgba(209,52,56,.08);border:1px solid rgba(209,52,56,.25);color:#D13438';fb.textContent=`❌ Incorrecto. Correcta: ${pregs[idx].opciones[cor]}`;}
  }
  if(next)next.style.display='block';
}

function _sigQ(){
  const{pregs,resp,idx,id}=_EX;
  if(idx<pregs.length-1){_EX.idx++;_renderQ();}
  else{
    const correctas=resp.filter((r,i)=>r===pregs[i].correcta).length;
    const score=Math.round(correctas/pregs.length*100);
    _resultadoExamen(id,score,correctas,pregs.length);
  }
}

function _resultadoExamen(id,score,correctas,total){
  const examDiv=document.getElementById('fts3-exam');if(!examDiv)return;
  const ok=score>=MIN_PASS;
  examDiv.innerHTML=`<div style="padding:16px;text-align:center">
    <div style="font-size:42px;margin-bottom:8px">${ok?'🎓':'📖'}</div>
    <h3 style="color:${ok?'#107C10':'#D13438'};margin:0 0 4px">${ok?'¡Aprobado!':'No aprobado'}</h3>
    <p style="font-size:28px;font-weight:800;margin:6px 0">${score}%</p>
    <p style="font-size:13px;color:#666">${correctas} de ${total} correctas · Mínimo ${MIN_PASS}%</p>
    ${ok
      ?`<button onclick="FTS3._pedirFoto('${id}',${score})" style="width:100%;background:#107C10;color:#fff;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:800;cursor:pointer;font-family:Inter,sans-serif;margin-top:14px">📷 Tomar foto y generar constancia →</button>`
      :`<button onclick="FTS3._iniciarExamen('${id}')" style="width:100%;background:#D83B01;color:#fff;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:800;cursor:pointer;font-family:Inter,sans-serif;margin-top:14px">🔄 Repetir examen</button>`
    }
  </div>`;
}

/* ── Foto ── */
function _pedirFoto(id,score){
  const m=document.getElementById('fts3-cam');
  if(!m){_completar(id,score,null);return;}
  m._id=id;m._score=score;
  m.classList.add('on');
  navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false})
    .then(st=>{S.camStream=st;const v=document.getElementById('f3cam-vid');if(v){v.srcObject=st;v.play();}})
    .catch(()=>{_cerrarCam();_completar(id,score,null);});
}
function _tomarFoto(){
  const vid=document.getElementById('f3cam-vid'),cvs=document.getElementById('f3cam-cvs'),prev=document.getElementById('f3cam-prev');
  if(!vid||!cvs)return;
  cvs.width=vid.videoWidth||320;cvs.height=vid.videoHeight||240;
  cvs.getContext('2d').drawImage(vid,0,0);
  const d=cvs.toDataURL('image/jpeg',.75);window._f3foto=d;
  if(prev){prev.src=d;prev.style.display='block';}vid.style.display='none';
  const b=document.getElementById('f3cam-btns-area');
  if(b)b.innerHTML=`<button class="f3cam-ret" onclick="FTS3._retakeFoto()">🔄 Repetir</button><button class="f3cam-ok" onclick="FTS3._confirmarFoto()">✅ Confirmar</button>`;
}
function _retakeFoto(){window._f3foto=null;const v=document.getElementById('f3cam-vid'),p=document.getElementById('f3cam-prev');if(v)v.style.display='block';if(p)p.style.display='none';const b=document.getElementById('f3cam-btns-area');if(b)b.innerHTML=`<button class="f3cam-cap" onclick="FTS3._tomarFoto()">📷 Tomar foto</button>`;}
function _confirmarFoto(){const m=document.getElementById('fts3-cam');_cerrarCam();_completar(m?._id||'',m?._score||0,window._f3foto||null);window._f3foto=null;}
function _saltarFoto(){const m=document.getElementById('fts3-cam');_cerrarCam();_completar(m?._id||'',m?._score||0,null);}
function _cerrarCam(){
  const m=document.getElementById('fts3-cam');if(m)m.classList.remove('on');
  if(S.camStream){S.camStream.getTracks().forEach(t=>t.stop());S.camStream=null;}
  const v=document.getElementById('f3cam-vid'),p=document.getElementById('f3cam-prev');
  if(v)v.style.display='block';if(p){p.style.display='none';p.src='';}
  const b=document.getElementById('f3cam-btns-area');
  if(b)b.innerHTML=`<button class="f3cam-cap" onclick="FTS3._tomarFoto()">📷 Tomar foto</button>`;
}

/* ── Completar y PDF ── */
async function _completar(id,score,foto){
  const ts=new Date().toISOString(),emp=S.empleado||{};
  const c=S.cursos.find(x=>x.id===id)||{titulo:id,duracion_min:0};
  const seed=[emp.curp||'SIN-CURP',id,ts,score,navigator.userAgent.slice(0,30),'3.1'].join('|');
  const hash=await _hash(seed);
  S.resultados[id]={videoId:id,titulo:c.titulo,aprobado:true,score,foto,hash,ts,empleado:emp};

  const card=document.getElementById('fts3-cv-'+id);
  if(card){card.classList.remove('sel');card.classList.add('done');const cb=card.querySelector('.fv-cb');if(cb)cb.textContent='✓';const b=card.querySelector('.fv-badge');if(b){b.textContent='✅ Aprobado';b.className='fv-badge ok';}}

  await _generarPDF(id);

  const examDiv=document.getElementById('fts3-exam');
  if(examDiv){examDiv.innerHTML=`<div style="padding:16px;text-align:center">
    <div style="font-size:36px;margin-bottom:6px">🎓</div>
    <h3 style="color:#107C10;margin:0 0 4px">¡Constancia descargada!</h3>
    <p style="font-size:13px;color:#333;margin:0 0 8px">${c.titulo}</p>
    ${foto?`<img src="${foto}" style="width:64px;height:64px;object-fit:cover;border-radius:50%;border:3px solid #107C10;display:block;margin:0 auto 8px">`:``}
    <p style="font-size:11px;color:#666;margin:0 0 4px">🔐 Sello SHA-256:</p>
    <div class="fts3-hash">${hash}</div>
    <button onclick="FTS3._avanzar()" style="width:100%;background:#D83B01;color:#fff;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:800;cursor:pointer;font-family:Inter,sans-serif;margin-top:10px">
      ${S.indice+1<S.cola.length?'▶️ Siguiente curso →':'🏠 Volver al inicio'}
    </button>
  </div>`;}
  S.indice++;
}

function _avanzar(){
  _ocultar(['fts3-player','fts3-exam']);
  if(S.indice<S.cola.length){_sigCurso();}
  else{
    const dash=document.getElementById('fts3-dash');
    if(dash){
      const asig=_getAsig(S.empleado);
      const ids=asig?.cursos||S.cursos.map(c=>c.id);
      const cursos=ids.map(id=>S.cursos.find(c=>c.id===id)).filter(Boolean);
      dash.innerHTML=_renderDash(cursos);dash.classList.add('on');
    }
  }
}

function _finTodo(){
  const examDiv=document.getElementById('fts3-exam');
  if(examDiv){examDiv.classList.add('on');examDiv.innerHTML=`<div style="padding:16px;text-align:center">
    <div style="font-size:40px;margin-bottom:8px">🏆</div>
    <h2 style="color:#107C10;margin:0 0 4px">¡Todos los cursos completados!</h2>
    <p style="font-size:13px;color:#666">Tus constancias fueron generadas y descargadas</p>
  </div>`;}
}

/* ════════════════════════════════════════════════════════════
   8. PDF: DC-3 (hoja 1) + CERTIFICADO (hoja 2)
═══════════════════════════════════════════════════════════════*/
async function _generarPDF(id) {
  const r=S.resultados[id];if(!r)return;
  const c=S.cursos.find(x=>x.id===id)||{titulo:id,duracion_min:0};
  const emp=r.empleado||{};
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'mm',format:'letter',orientation:'portrait'});
  const W=215.9,H=279.4;
  const az=[0,71,171],ro=[216,59,1],ve=[16,124,16],ne=[10,10,10],gr=[100,100,100];
  const fechaStr=new Date(r.ts).toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});

  /* HOJA 1 — DC-3 */
  doc.setFillColor(...az);doc.rect(0,0,W,22,'F');
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(11);
  doc.text('CONSTANCIA DE HABILIDADES LABORALES — DC-3',W/2,8,{align:'center'});
  doc.setFontSize(8);doc.setFont('helvetica','normal');
  doc.text('NOM-STPS · SERVICIOS FTS SA DE CV · Monterrey, NL',W/2,15,{align:'center'});
  doc.text('RFC: FTS000000XXX',W/2,20,{align:'center'});

  doc.setFillColor(248,248,248);doc.rect(0,22,W,H-38,'F');
  doc.setFillColor(255,255,255);doc.roundedRect(8,26,W-16,14,2,2,'F');
  doc.setTextColor(...ro);doc.setFont('helvetica','bold');doc.setFontSize(13);
  doc.text('CONSTANCIA DE COMPETENCIAS O HABILIDADES LABORALES',W/2,35,{align:'center'});

  const caja=(lbl,val,xL,xV,yy)=>{
    doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(...gr);doc.text(lbl,xL,yy);
    doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(...ne);doc.text(val||'—',xV,yy);
  };

  let y=46;
  doc.setFillColor(255,255,255);doc.roundedRect(8,y,W-16,38,2,2,'F');
  doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...ro);doc.text('I. DATOS DEL TRABAJADOR',12,y+7);
  caja('Nombre:',`${emp.apaterno||''} ${emp.amaterno||''} ${emp.nombre||''}`.trim(),12,42,y+15);
  caja('CURP:',emp.curp||'',12,42,y+23);
  caja('Empresa:','SERVICIOS FTS SA DE CV',12,42,y+31);
  y+=44;

  doc.setFillColor(255,255,255);doc.roundedRect(8,y,W-16,40,2,2,'F');
  doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...ro);doc.text('II. DATOS DEL CURSO',12,y+7);
  caja('Curso:',c.titulo,12,42,y+15);
  caja('Duración:',`${c.duracion_min} horas`,12,42,y+23);
  caja('Fecha:',fechaStr,12,42,y+31);
  caja('Modalidad:','Video en línea',115,150,y+23);
  caja('Calificación:',`${r.score}%`,115,150,y+31);
  y+=46;

  doc.setFillColor(255,255,255);doc.roundedRect(8,y,W-16,20,2,2,'F');
  doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...ro);doc.text('III. OBJETIVO',12,y+7);
  doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(...ne);
  doc.text(c.descripcion||'Capacitación en seguridad industrial.',14,y+14,{maxWidth:W-24});
  y+=26;

  doc.setFillColor(...ve);doc.roundedRect(8,y,W-16,16,2,2,'F');
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(11);
  doc.text(`✅ APROBADO — Calificación: ${r.score}%`,W/2,y+11,{align:'center'});
  y+=22;

  doc.setFillColor(255,255,255);doc.roundedRect(8,y,W-16,34,2,2,'F');
  doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...ro);doc.text('IV. FIRMAS',12,y+7);
  doc.setDrawColor(180,180,180);doc.setLineWidth(.3);
  doc.line(20,y+26,90,y+26);doc.line(120,y+26,190,y+26);
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...gr);
  doc.text('Firma del Trabajador',55,y+31,{align:'center'});
  doc.text('Instructor / Supervisor',155,y+31,{align:'center'});
  y+=40;

  doc.setFillColor(10,10,26);doc.roundedRect(8,y,W-16,22,2,2,'F');
  doc.setTextColor(0,255,136);doc.setFont('courier','bold');doc.setFontSize(7);
  doc.text('🔐 VERIFICACIÓN DIGITAL SHA-256',12,y+7);
  doc.setFont('courier','normal');doc.setFontSize(6);
  doc.text(r.hash.slice(0,42),12,y+13);doc.text(r.hash.slice(42),12,y+19);
  try{const q=await _qr(r.hash.slice(0,32));if(q)doc.addImage(q,'PNG',W-28,y+2,18,18);}catch(e){}

  doc.setFillColor(...az);doc.rect(0,H-14,W,14,'F');
  doc.setTextColor(255,255,255);doc.setFontSize(8);doc.setFont('helvetica','normal');
  doc.text('SERVICIOS FTS SA DE CV · Sistema de Capacitación Digital · STPS',W/2,H-6,{align:'center'});

  /* HOJA 2 — CERTIFICADO */
  doc.addPage();
  doc.setFillColor(...az);doc.rect(0,0,W,16,'F');
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(12);
  doc.text('CERTIFICADO INDIVIDUAL DE CAPACITACIÓN',W/2,10,{align:'center'});
  doc.setFillColor(245,245,245);doc.rect(0,16,W,H-32,'F');

  if(r.foto){try{doc.addImage(r.foto,'JPEG',12,24,36,36);}catch(e){}}
  doc.setDrawColor(...ve);doc.setLineWidth(.8);doc.roundedRect(12,24,36,36,3,3,'S');

  const nomCompleto=[emp.nombre,emp.apaterno,emp.amaterno].filter(Boolean).join(' ');
  doc.setFont('helvetica','bold');doc.setFontSize(14);doc.setTextColor(...ne);
  doc.text(nomCompleto||'Trabajador',54,34);
  doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(...gr);
  if(emp.curp)doc.text('CURP: '+emp.curp,54,41);
  doc.text('SERVICIOS FTS SA DE CV',54,48);

  doc.setFillColor(...ve);doc.roundedRect(8,68,W-16,38,3,3,'F');
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(12);
  doc.text(c.titulo,W/2,80,{align:'center'});
  doc.setFont('helvetica','normal');doc.setFontSize(9);
  doc.text(`Duración: ${c.duracion_min} min · Calificación: ${r.score}%`,W/2,89,{align:'center'});
  const tsStr=new Date(r.ts).toLocaleString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'});
  doc.setFontSize(8);doc.text(tsStr,W/2,97,{align:'center'});

  doc.setFillColor(10,10,26);doc.roundedRect(8,114,W-16,26,3,3,'F');
  doc.setTextColor(0,255,136);doc.setFont('courier','bold');doc.setFontSize(7);
  doc.text('🔐 SELLO DE VERIFICACIÓN SHA-256',12,121);
  doc.setFont('courier','normal');doc.setFontSize(6.5);
  doc.text(r.hash.slice(0,32),12,127);doc.text(r.hash.slice(32),12,133);
  doc.setTextColor(120,120,120);doc.setFontSize(5.5);
  doc.text('Algoritmo: SHA-256 · FTS Training v3.1 · Hash único e irrepetible',12,138);
  try{const q=await _qr(r.hash.slice(0,32));if(q)doc.addImage(q,'PNG',W-28,116,18,18);}catch(e){}

  doc.setFillColor(255,250,240);doc.roundedRect(8,148,W-16,16,2,2,'F');
  doc.setDrawColor(...ro);doc.setLineWidth(.4);doc.roundedRect(8,148,W-16,16,2,2,'S');
  doc.setFont('helvetica','italic');doc.setFontSize(7);doc.setTextColor(...ro);
  doc.text('Este certificado fue generado digitalmente. La foto y el sello SHA-256 son evidencia de participación y aprobación del trabajador.',W/2,155,{align:'center',maxWidth:W-20});
  doc.text('Válido junto con el DC-3 correspondiente emitido en la hoja anterior.',W/2,161,{align:'center'});

  doc.setDrawColor(200,200,200);doc.setLineWidth(.3);
  doc.line(20,195,90,195);doc.line(125,195,190,195);
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...gr);
  doc.text('Trabajador',55,200,{align:'center'});doc.text('Instructor / Supervisor',157,200,{align:'center'});

  doc.setFillColor(...az);doc.rect(0,H-14,W,14,'F');
  doc.setTextColor(255,255,255);doc.setFontSize(8);
  doc.text('SERVICIOS FTS SA DE CV · Sistema de Capacitación Digital · STPS',W/2,H-6,{align:'center'});

  const ap=(emp.apaterno||'trabajador').replace(/\s/g,'_');
  doc.save(`FTS_DC3_${ap}_${c.id}_${Date.now()}.pdf`);
}

/* ════════════════════════════════════════════════════════════
   9. HELPERS
═══════════════════════════════════════════════════════════════*/
async function _hash(t){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function _qr(data){
  return new Promise(res=>{
    const img=new Image();img.crossOrigin='anonymous';
    img.onload=()=>{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);res(c.toDataURL('image/png'));};
    img.onerror=()=>res(null);
    img.src=`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(data)}`;
  });
}
function _ocultar(ids){ids.forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('on');});}

/* ════════════════════════════════════════════════════════════
   10. INIT
═══════════════════════════════════════════════════════════════*/
async function init() {
  inyectarCSS();
  inyectarCam();
  await cargarTodo();

  // Botón master
  const tM=setInterval(()=>{if(document.getElementById('settings-panel')){inyectarBotonMaster();clearInterval(tM);}},400);
  // Panel asignación instructor
  const tI=setInterval(()=>{if(document.getElementById('tp-workers')&&S.cursos.length){inyectarAsignacion();clearInterval(tI);}},600);

  hookEdash();
}

/* ── API pública ── */
window.FTS3 = {
  abrirAdmin, _adminTab: renderAdmin,
  _formCurso, _guardarCurso, _toggleCurso, _delCurso, _addPregunta,
  _formPaquete, _guardarPaquete, _delPaquete,
  _copiar,
  asignar, verAsignaciones,
  _toggleCV, iniciarSel,
  _iniciarExamen, _selOpt, _sigQ,
  _pedirFoto, _tomarFoto, _retakeFoto, _confirmarFoto, _saltarFoto,
  _avanzar,
  estado: ()=>S,
};

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
})();
