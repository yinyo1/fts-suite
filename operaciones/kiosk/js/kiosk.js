// ═══ FTS Kiosk — Lógica principal ═══
// Script clásico, estado global compartido

const K = {
  empleados: [],
  sos: [],
  seleccionado: null,
  soSeleccionada: null,
  tipo: null,
  pin: '',
  stream: null,
  config: {},
  returnTimer: null,
  faceReady: false,
  demoMode: false,
};

// ═══ Carga de configuración (nuevo schema) ═══
function loadKioskConfig(){
  return {
    n8nUrl:        localStorage.getItem('ops_n8n_url') || '',
    apiKey:        localStorage.getItem('ops_api_key') || '',
    demoMode:      localStorage.getItem('ops_demo_mode') !== '0',
    faceEnabled:   localStorage.getItem('ops_kiosk_face_enabled') !== '0',
    faceThreshold: parseFloat(localStorage.getItem('ops_kiosk_face_threshold') || '0.5'),
    geolocations:  JSON.parse(localStorage.getItem('ops_kiosk_geolocations') || '[]'),
    stages:        JSON.parse(localStorage.getItem('ops_kiosk_stages') || '["To Do","In Progress","Hold"]'),
    fields: {
      pin:             localStorage.getItem('ops_kiosk_field_pin')              || 'pin',
      photo:           localStorage.getItem('ops_kiosk_field_photo')            || 'image_128',
      manager:         localStorage.getItem('ops_kiosk_field_manager')          || 'parent_id',
      supervisorEmail: localStorage.getItem('ops_kiosk_field_supervisor_email') || 'work_email',
      supervisorWa:    localStorage.getItem('ops_kiosk_field_supervisor_wa')    || 'mobile_phone',
    }
  };
}

// Helper: fecha local en formato YYYY-MM-DD (NO usa UTC)
// Fix bug: new Date().toISOString().split('T')[0] retorna UTC,
// tras 18:00 CST queda 1 día adelantado
function fechaLocalISO(fecha){
  var d = fecha || new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// ═══ Geo: radio fallback + distancia + validación ═══
function getRadioPermitido(){
  return 100; // fallback — cada sitio define su propio radio en ops_kiosk_geolocations
}

function calcularDistancia(lat1, lng1, lat2, lng2){
  const R = 6371000;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLng = (lng2-lng1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) *
    Math.cos(lat2*Math.PI/180) *
    Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function validarGeolocacion(lat, lng){
  var geos = K.config.geolocations;
  if(!geos || !geos.length){
    return { autorizado: true, sitio: 'Sin restricción geo' };
  }
  if(lat == null || lng == null) return {
    autorizado: false,
    sitioMasCercano: (geos[0] && geos[0].nombre) || 'Desconocido',
    distancia: 0
  };
  let minDist = Infinity;
  let sitioMasCercano = geos[0];
  for(const sitio of geos){
    if(sitio.lat == null || sitio.lng == null) continue;
    const dist = calcularDistancia(
      lat, lng,
      parseFloat(sitio.lat), parseFloat(sitio.lng)
    );
    if(dist <= parseFloat(sitio.radio || getRadioPermitido())){
      return { autorizado: true, sitio: sitio.nombre, dist };
    }
    if(dist < minDist){ minDist = dist; sitioMasCercano = sitio; }
  }
  return {
    autorizado: false,
    sitioMasCercano: sitioMasCercano.nombre,
    distancia: Math.round(minDist)
  };
}

// ═══ Modal "fuera de zona" ═══
function mostrarModalGeo(geoResult){
  const modal = document.createElement('div');
  modal.id = 'geoModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;padding:24px;box-sizing:border-box';
  modal.innerHTML =
    '<div style="background:#1a1a1a;border:2px solid #D83B01;border-radius:16px;padding:24px;max-width:440px;width:100%;text-align:center">'+
      '<div style="font-size:48px;margin-bottom:12px">⚠️</div>'+
      '<h2 style="color:#D83B01;margin:0 0 8px">Fuera de zona autorizada</h2>'+
      '<p style="color:#999;font-size:14px;margin:0 0 16px">'+
        'Estás a '+geoResult.distancia+'m de "<strong>'+geoResult.sitioMasCercano+'</strong>".<br>'+
        'Tu check-in requerirá aprobación del supervisor.'+
      '</p>'+
      '<button onclick="reintentarGeo()" id="geoRetryBtn" style="width:100%;background:#0078D4;color:#fff;border:none;padding:12px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:12px">🔄 Reintentar ubicación</button>'+
      '<div id="geoRetryStatus" style="font-size:12px;color:#999;margin-bottom:12px;min-height:16px"></div>'+
      '<textarea id="geoMotivo" placeholder="Motivo del check-in fuera de zona (obligatorio)..." style="width:100%;height:80px;background:#0a0a0a;color:#fff;border:1px solid #555;border-radius:8px;padding:10px;font-size:14px;box-sizing:border-box;resize:none;margin-bottom:16px;font-family:inherit"></textarea>'+
      '<div style="display:flex;gap:12px">'+
        '<button onclick="cancelarGeo()" style="flex:1;background:#333;color:#fff;border:none;padding:14px;border-radius:8px;font-size:16px;cursor:pointer;font-family:inherit">✕ Cancelar</button>'+
        '<button onclick="confirmarGeo()" style="flex:1;background:#D83B01;color:#fff;border:none;padding:14px;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit">Enviar para aprobación</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);

  // Código de diagnóstico compartible
  try{
    var sitiosConfig = [];
    try{ sitiosConfig = JSON.parse(localStorage.getItem('ops_kiosk_geolocations') || '[]'); } catch(e){}
    var empNombre = (K.seleccionado && (K.seleccionado.name || K.seleccionado.nombre)) || (window._empleadoActual && (window._empleadoActual.name || window._empleadoActual.nombre)) || 'desconocido';
    var geoErrorCode = {
      ts:                new Date().toISOString(),
      device:            (navigator.userAgent || '').substring(0, 50),
      coords_empleado:   { lat: K.geo && K.geo.lat, lng: K.geo && K.geo.lng, accuracy: K.geo && K.geo.accuracy },
      sitio_mas_cercano: K.geoSitio || geoResult.sitioMasCercano,
      distancia_metros:  K.geoDistancia || geoResult.distancia,
      sitios_configurados: sitiosConfig.map(function(s){ return { nombre:s.nombre, lat:s.lat, lng:s.lng, radio:s.radio }; }),
      geo_sync_timestamp: localStorage.getItem('ops_geo_sync_timestamp') || 'nunca',
      empleado:          empNombre
    };
    var codigoB64 = btoa(unescape(encodeURIComponent(JSON.stringify(geoErrorCode))));
    var debugDiv = document.createElement('div');
    debugDiv.style.cssText = 'margin-top:16px;border-top:1px solid #444;padding-top:12px';
    debugDiv.innerHTML =
      '<p style="font-size:11px;color:#999;margin:0 0 6px;text-align:center">Código de diagnóstico para soporte:</p>'+
      '<div style="background:#111;border-radius:8px;padding:8px;font-size:10px;font-family:monospace;color:#666;word-break:break-all;max-height:60px;overflow:hidden;margin-bottom:8px">' + codigoB64.substring(0, 80) + '...</div>'+
      '<button id="btnCopiarGeoCode" style="width:100%;padding:8px;background:#333;border:1px solid #555;border-radius:8px;font-size:12px;cursor:pointer;color:#ccc;font-family:inherit">📋 Copiar código para soporte</button>';
    modal.querySelector('div').appendChild(debugDiv);
    document.getElementById('btnCopiarGeoCode').addEventListener('click', function(){
      var btn = this;
      navigator.clipboard.writeText(codigoB64).then(function(){
        btn.textContent = '✅ Copiado';
        setTimeout(function(){ btn.textContent = '📋 Copiar código para soporte'; }, 2000);
      }).catch(function(){
        var ta = document.createElement('textarea');
        ta.value = codigoB64;
        document.body.appendChild(ta);
        ta.select();
        try{ document.execCommand('copy'); btn.textContent = '✅ Copiado'; } catch(e){}
        document.body.removeChild(ta);
        setTimeout(function(){ btn.textContent = '📋 Copiar código para soporte'; }, 2000);
      });
    });
  } catch(e){}
}

async function reintentarGeo(){
  const btn = document.getElementById('geoRetryBtn');
  const status = document.getElementById('geoRetryStatus');
  if(btn){ btn.disabled = true; btn.textContent = '⏳ Obteniendo ubicación…'; }
  if(status){ status.textContent = 'Esperando GPS…'; status.style.color = '#0078D4'; }

  const geo = await window.getGeolocacion();
  K.geo = geo;

  const geoResult = validarGeolocacion(
    geo && geo.lat != null ? geo.lat : null,
    geo && geo.lng != null ? geo.lng : null
  );
  K.geoAutorizada = geoResult.autorizado;
  K.geoSitio      = geoResult.sitio || geoResult.sitioMasCercano;
  K.geoDistancia  = geoResult.distancia || 0;

  if(geoResult.autorizado){
    // Cerrar modal y continuar el flujo normalmente
    const m = document.getElementById('geoModal');
    if(m) m.remove();
    if(K.tipo === 'salida'){
      showScreen('ks-project');
    } else {
      K.soSeleccionada = null;
      registrarAsistencia();
    }
    return;
  }

  // Sigue fuera — actualizar el modal con la nueva distancia
  if(btn){ btn.disabled = false; btn.textContent = '🔄 Reintentar ubicación'; }
  if(status){
    status.textContent = '❌ Sigues a ' + geoResult.distancia + 'm de "' + geoResult.sitioMasCercano + '"';
    status.style.color = '#D83B01';
  }
}
window.reintentarGeo = reintentarGeo;

function cancelarGeo(){
  const m = document.getElementById('geoModal');
  if(m) m.remove();
  K.geoMotivo = null;
  goHome();
}

function confirmarGeo(){
  const ta = document.getElementById('geoMotivo');
  const motivo = ta ? ta.value.trim() : '';
  if(!motivo){
    if(ta) ta.style.borderColor = '#D83B01';
    return;
  }
  K.geoMotivo = motivo;
  K.geoAutorizada = false;
  const m = document.getElementById('geoModal');
  if(m) m.remove();
  if(K.tipo === 'salida'){
    showScreen('ks-project');
  } else {
    K.soSeleccionada = null;
    registrarAsistencia();
  }
}

// ═══ Reloj ═══
function tick(){
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  const ss = String(now.getSeconds()).padStart(2,'0');
  const clock = document.getElementById('ksClock');
  if(clock) clock.textContent = hh+':'+mm+':'+ss;
  const date = document.getElementById('ksDate');
  if(date){
    const opts = { weekday:'long', day:'numeric', month:'long', year:'numeric' };
    date.textContent = now.toLocaleDateString('es-MX', opts);
  }
}

// ═══ Navegación ═══
function showScreen(id){
  document.querySelectorAll('.kiosk-screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if(el) el.classList.add('active');
  // Cleanup al salir de verify
  if(id !== 'ks-verify') stopCamera();
  if(id === 'ks-search'){
    const input = document.getElementById('ksSearch');
    if(input){ input.value=''; input.focus(); }
    renderEmpleados(K.empleados);
  }
  if(id === 'ks-project'){
    const input = document.getElementById('ksSoSearch');
    if(input){ input.value=''; input.focus(); }
    renderSOs(K.sos);
  }
  if(id === 'ks-historial'){
    const input = document.getElementById('hist-search');
    if(input){ input.value=''; input.style.display=''; input.focus(); }
    const content = document.getElementById('hist-content');
    if(content) content.style.display = 'none';
    const list = document.getElementById('hist-empleados');
    if(list){ list.style.display=''; }
    searchHistorial('');
  }
}

function goHome(){
  K.seleccionado = null;
  K.soSeleccionada = null;
  K.tipo = null;
  K.pin = '';
  updatePinDots();
  if(K.returnTimer){ clearTimeout(K.returnTimer); K.returnTimer = null; }
  showScreen('ks-home');
}

// ═══ Carga de empleados/SOs ═══
const DEMO_EMPLEADOS = [
  { id:1, nombre:'Mateo Salazar',     puesto:'Ingeniero',  foto:'', pin:'1234' },
  { id:2, nombre:'Felipe Pérez',      puesto:'Supervisor', foto:'', pin:'5678' },
  { id:3, nombre:'Esteban De La Cruz',puesto:'Director',   foto:'', pin:'0000' },
  { id:4, nombre:'Ana Ramírez',       puesto:'Soldador',   foto:'', pin:'1111' },
  { id:5, nombre:'Carlos Hernández',  puesto:'Ayudante',   foto:'', pin:'2222' },
];
const DEMO_SOS = [
  { id:101, num:'SO-2026-001', nombre:'Topo Chico — Radium' },
  { id:102, num:'SO-2026-002', nombre:'Arca Continental — Mezzanine' },
  { id:103, num:'SO-2026-003', nombre:'Sigma — Polipasto 2T' },
  { id:104, num:'SO-2026-004', nombre:'HEB — Tanque 5000L' },
];

async function loadEmpleados(){
  if(K.config.demoMode || !K.config.n8nUrl){
    K.empleados = DEMO_EMPLEADOS.slice();
    return;
  }
  try{
    const data = await window.OdooKiosk.getEmpleados();
    K.empleados = Array.isArray(data) ? data : (data.empleados || []);
  } catch(e){
    console.warn('Odoo no disponible, usando demo:', e);
    K.empleados = DEMO_EMPLEADOS.slice();
    K.demoMode = true;
  }
}

async function loadSOs(){
  if(K.config.demoMode || !K.config.n8nUrl){
    K.sos = DEMO_SOS.slice();
    return;
  }
  try{
    const data = await window.OdooKiosk.getSOs();
    K.sos = Array.isArray(data) ? data : (data.sos || []);
  } catch(e){
    console.warn('Odoo no disponible, usando demo:', e);
    K.sos = DEMO_SOS.slice();
  }
}

// ═══ Búsqueda y render de empleados ═══
function normalize(s){ return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

function searchEmpleados(q){
  const nq = normalize(q);
  const filtered = !nq ? K.empleados : K.empleados.filter(function(e){
    return normalize(e.name || e.nombre || '').includes(nq);
  });
  renderEmpleados(filtered);
}

function renderEmpleados(list){
  const el = document.getElementById('ksEmpleadosList');
  if(!el) return;
  if(!list.length){
    el.innerHTML = '<div style="text-align:center;color:#666;padding:24px">Sin resultados</div>';
    return;
  }
  el.innerHTML = list.map(function(e){
    const nombre = e.name || e.nombre || '';
    const cargo  = e.cargo || e.job_title || e.puesto || 'Técnico';
    const foto = e.foto
      || (e.image_128
          ? (e.image_128.startsWith('data:') ? e.image_128 : 'data:image/png;base64,' + e.image_128)
          : '');
    const photoHtml = foto
      ? '<img src="' + foto + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
      : (nombre || '?').charAt(0);
    return '<div class="kiosk-employee-card" onclick="selectEmpleado('+e.id+')">'+
      '<div class="kiosk-employee-photo">' + photoHtml + '</div>'+
      '<div><div class="kiosk-employee-name">' + (nombre || '—') + '</div>'+
      '<div class="kiosk-employee-sub">' + cargo + '</div></div>'+
    '</div>';
  }).join('');
}

var _lastTap = 0;
function selectEmpleado(id){
  var now = Date.now();
  if(now - _lastTap < 300) return;
  _lastTap = now;
  const emp = K.empleados.find(e => e.id === id);
  if(!emp) return;
  K.seleccionado = emp;
  K.pin = '';
  updatePinDots();

  const displayName = emp.name || emp.nombre || '';
  const fotoSrc = emp.foto
    || (emp.image_128
        ? (emp.image_128.startsWith('data:') ? emp.image_128 : 'data:image/png;base64,' + emp.image_128)
        : '');

  // Preparar ks-verify (se usará después del selectTipo)
  const photoEl = document.getElementById('ksEmpPhoto');
  const nameEl  = document.getElementById('ksEmpName');
  if(photoEl) photoEl.src = fotoSrc || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220"><rect width="220" height="220" fill="%23f5f5f5"/><text x="50%" y="55%" text-anchor="middle" font-size="80" font-family="Inter,sans-serif" font-weight="700" fill="%23999">'+(displayName||'?').charAt(0)+'</text></svg>';
  if(nameEl) nameEl.textContent = displayName;

  // Nombre visible en pantalla PIN
  var pinNombreEl = document.getElementById('ksPinNombre');
  if(pinNombreEl) pinNombreEl.textContent = '👷 ' + displayName;

  // Llenar pantalla ks-tipo
  const tipoNombre = document.getElementById('ks-tipo-nombre');
  if(tipoNombre) tipoNombre.textContent = displayName;

  // Sugerencia de tipo según hora (prepara ks-tipo por si se usa después)
  const sug = document.getElementById('ks-tipo-sugerencia');
  if(sug) sug.textContent = getSugerenciaTipo();

  // Mostrar pantalla de estado del empleado (consulta n8n)
  mostrarEstadoEmpleado(emp);
}

function getSugerenciaTipo(){
  const h = new Date().getHours();
  if(h >= 6  && h < 11) return '💡 Sugerido: Entrada — Inicio del día';
  if(h >= 11 && h < 13) return '💡 Sugerido: Salida a comer';
  if(h >= 13 && h < 15) return '💡 Sugerido: Regreso de comida';
  if(h >= 15)           return '💡 Sugerido: Salida — Fin del día';
  return '';
}

function selectTipo(tipo){
  K.tipo = tipo;

  const labels = {
    entrada:         '🟢 Entrada',
    salida_comida:   '🍽️ Salida a comer',
    regreso_comida:  '🔄 Regreso de comida',
    salida:          '🔴 Salida'
  };

  const tipoLabel = document.getElementById('ks-verify-tipo');
  if(tipoLabel) tipoLabel.textContent = labels[tipo] || tipo;

  showScreen('ks-verify');
  startCamera();
}

// ═══ PIN pad ═══
function addPin(n){
  if(K.pin.length >= 4) return;
  K.pin += n;
  updatePinDots();
  updateOkButton();
}
function clearPin(){ K.pin = ''; updatePinDots(); updateOkButton(); }
function backPin(){ K.pin = K.pin.slice(0,-1); updatePinDots(); updateOkButton(); }

function updateOkButton(){
  const btn = document.getElementById('ksPinOkBtn');
  if(!btn) return;
  if(K.pin.length === 4){
    btn.classList.add('enabled');
    btn.disabled = false;
  } else {
    btn.classList.remove('enabled');
    btn.disabled = true;
  }
}

function updatePinDots(){
  const dots = document.querySelectorAll('#ksPinDots .kiosk-pin-dot');
  dots.forEach((d,i) => {
    if(i < K.pin.length) d.classList.add('filled');
    else d.classList.remove('filled');
  });
}

function verifyPin(){
  if(!K.seleccionado) return;
  const pinStatus = document.getElementById('pin-status');
  const expected = K.seleccionado.pin;

  console.log('[KIOSK PIN] Ingresado:', K.pin,
    'Esperado:', expected,
    'Empleado:', K.seleccionado.name || K.seleccionado.nombre,
    K.seleccionado);

  function failPin(msg){
    setFaceStatus('❌ ' + msg);
    if(pinStatus) pinStatus.textContent = msg;
    shakeVerify();
    flashPinDotsError();
    clearPin();
    setTimeout(() => {
      const ps = document.getElementById('pin-status');
      if(ps) ps.textContent = '';
    }, 2000);
  }

  if(!expected){
    failPin('Empleado sin PIN configurado');
    return;
  }
  if(K.pin !== expected){
    failPin('PIN incorrecto — intenta de nuevo');
    return;
  }
  // PIN correcto
  if(pinStatus) pinStatus.textContent = '';
  setFaceStatus('✅ PIN correcto — verificando rostro…');
  if(K.config.faceEnabled){
    doFaceVerify();
  } else {
    afterVerifyContinue();
  }
}

function flashPinDotsError(){
  const dots = document.querySelectorAll('#ksPinDots .kiosk-pin-dot');
  dots.forEach(d => d.classList.add('error'));
  setTimeout(() => {
    dots.forEach(d => d.classList.remove('error'));
  }, 1000);
}

function shakeVerify(){
  const el = document.getElementById('ks-verify');
  if(!el) return;
  el.classList.add('kiosk-shake');
  setTimeout(() => el.classList.remove('kiosk-shake'), 400);
}

function setFaceStatus(text, spinner){
  const el = document.getElementById('ksFaceStatus');
  if(!el) return;
  if(spinner){
    el.innerHTML = '<span class="mini-spinner"></span>' + text;
  } else {
    el.textContent = text;
  }
}

// ═══ Cámara ═══
async function startCamera(){
  try{
    if(K.stream) return;
    K.stream = await navigator.mediaDevices.getUserMedia({ video:{ width:320, height:320, facingMode:'user' }, audio:false });
    const video = document.getElementById('ksCamera');
    if(video) video.srcObject = K.stream;
  } catch(e){
    console.warn('Cámara no disponible:', e);
    setFaceStatus('⚠️ Cámara no disponible');
  }
}

function stopCamera(){
  if(K.stream){
    K.stream.getTracks().forEach(t => t.stop());
    K.stream = null;
  }
}

// ═══ Verificación facial ═══
async function doFaceVerify(){
  const video = document.getElementById('ksCamera');
  if(!video || !K.faceReady){
    setFaceStatus('⚠️ Verificación facial no lista — continuando');
    setTimeout(afterVerifyContinue, 800);
    return;
  }
  try{
    setFaceStatus('🔍 Analizando rostro…', true);
    const result = await window.FaceVerify.compareFaces(K.seleccionado.foto, video);
    if(result.match){
      setFaceStatus('✅ Rostro verificado ('+result.similarity+'%)');
      setTimeout(afterVerifyContinue, 600);
    } else {
      setFaceStatus('❌ Rostro no coincide ('+result.similarity+'%) — '+(result.reason||''));
      shakeVerify();
      clearPin();
    }
  } catch(e){
    console.warn('Face verify error:', e);
    setFaceStatus('⚠️ Error en verificación — continuando');
    setTimeout(afterVerifyContinue, 1000);
  }
}

// ═══ Continuación tras PIN+facial OK: captura geo y valida zona ═══
async function afterVerifyContinue(){
  // Bloquear keypad visual/funcionalmente durante la validación geo
  var verifyEl = document.getElementById('ks-verify');
  if(verifyEl) verifyEl.classList.add('ks-verify-busy');

  setFaceStatus('📍 Obteniendo ubicación…', true);
  K.geoMotivo = null;
  const geo = await window.getGeolocacion();
  K.geo = geo;
  const geoResult = validarGeolocacion(
    geo && geo.lat != null ? geo.lat : null,
    geo && geo.lng != null ? geo.lng : null
  );
  K.geoAutorizada = geoResult.autorizado;
  K.geoSitio = geoResult.sitio || geoResult.sitioMasCercano;
  K.geoDistancia = geoResult.distancia || 0;

  // Liberar bloqueo antes de avanzar a siguiente pantalla
  if(verifyEl) verifyEl.classList.remove('ks-verify-busy');

  if(!geoResult.autorizado){
    mostrarModalGeo(geoResult);
  } else if(K.tipo === 'salida'){
    // Solo en salida pedir proyecto
    showScreen('ks-project');
  } else {
    // Entrada, salida_comida, regreso_comida → registrar directo
    K.soSeleccionada = null;
    registrarAsistencia();
  }
}

// ═══ SOs ═══
function searchSOs(q){
  const nq = normalize(q);
  const filtered = !nq ? K.sos : K.sos.filter(s => normalize(s.nombre).includes(nq) || normalize(s.num).includes(nq));
  renderSOs(filtered);
}

function renderSOs(list){
  const el = document.getElementById('ksSOsList');
  if(!el) return;
  if(!list.length){
    el.innerHTML = '<div style="text-align:center;color:#666;padding:24px">Sin resultados</div>';
    return;
  }
  el.innerHTML = list.map(s =>
    '<div class="kiosk-so-card" onclick="selectSO('+s.id+')">'+
      '<div class="kiosk-so-num">'+(s.num||'')+'</div>'+
      '<div class="kiosk-so-name">'+(s.nombre||'—')+'</div>'+
    '</div>'
  ).join('');
}

function selectSO(id){
  var now = Date.now();
  if(now - _lastTap < 300) return;
  _lastTap = now;
  const so = K.sos.find(s => s.id === id);
  if(!so) return;
  K.soSeleccionada = so;
  registrarAsistencia();
}

// ═══ Captura de frame del webcam ═══
function captureFrame(videoEl){
  if(!videoEl || !videoEl.srcObject) return null;
  try{
    const canvas = document.createElement('canvas');
    canvas.width  = videoEl.videoWidth  || 320;
    canvas.height = videoEl.videoHeight || 240;
    canvas.getContext('2d').drawImage(videoEl, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
  } catch(e){
    console.warn('captureFrame error:', e);
    return null;
  }
}

// ═══ Registro de asistencia ═══
async function registrarAsistencia(){
  const videoEl = document.getElementById('ksCamera');
  const fotoB64 = captureFrame(videoEl);

  // Determinar tipo — viene de ks-tipo (K.tipo)
  const now = new Date();
  const tipo = K.tipo || 'entrada';

  // Construir payload completo
  const payload = {
    empleado_id:        (K.seleccionado && K.seleccionado.id) || null,
    empleado_nombre:    (K.seleccionado && (K.seleccionado.name || K.seleccionado.nombre)) || '',
    so_id:              (K.soSeleccionada && K.soSeleccionada.id) || null,
    so_nombre:          (K.soSeleccionada && (K.soSeleccionada.name || K.soSeleccionada.nombre)) || '',
    tipo:               tipo,
    timestamp:          now.toISOString(),
    foto_b64:           fotoB64,
    lat:                (K.geo && K.geo.lat != null) ? K.geo.lat : null,
    lng:                (K.geo && K.geo.lng != null) ? K.geo.lng : null,
    geo_autorizada:     K.geoAutorizada !== false,
    geo_sitio:          K.geoSitio || null,
    geo_distancia:      K.geoDistancia || 0,
    geo_motivo:         K.geoMotivo || null,
    geo_status:         K.geoAutorizada !== false ? 'autorizado' : 'pendiente_aprobacion',
    supervisor_id:      (K.seleccionado && K.seleccionado.manager_id)   || null,
    supervisor_nombre:  (K.seleccionado && K.seleccionado.manager_name) || null,
  };

  // Mostrar pantalla de confirmación inmediatamente
  showScreen('ks-confirm');

  const confirmTipo   = document.getElementById('confirm-tipo');
  const confirmNombre = document.getElementById('confirm-nombre');
  const confirmSO     = document.getElementById('confirm-so');
  const confirmHora   = document.getElementById('confirm-hora');
  const confirmGeo    = document.getElementById('confirm-geo');
  const confirmIcon   = document.getElementById('confirm-icon');

  if(confirmTipo){
    const confirmLabels = {
      entrada:        '🟢 ENTRADA',
      salida_comida:  '🍽️ SALIDA A COMER',
      regreso_comida: '🔄 REGRESO DE COMIDA',
      salida:         '🔴 SALIDA',
    };
    const entradaLike = (tipo === 'entrada' || tipo === 'regreso_comida');
    confirmTipo.textContent = confirmLabels[tipo] || tipo.toUpperCase();
    confirmTipo.className = 'kiosk-big-type ' + (entradaLike ? 'in' : 'out');
  }
  if(confirmNombre) confirmNombre.textContent = payload.empleado_nombre || '—';
  if(confirmSO)     confirmSO.textContent     = payload.so_nombre || '—';
  if(confirmHora)   confirmHora.textContent   = now.toLocaleTimeString('es-MX');
  if(confirmGeo){
    confirmGeo.innerHTML = payload.geo_autorizada
      ? '<span class="kiosk-geo-dot ok"></span>📍 ' + (payload.geo_sitio || 'Ubicación autorizada')
      : '<span class="kiosk-geo-dot warn"></span>⚠️ Pendiente aprobación supervisor';
  }
  if(confirmIcon){
    confirmIcon.textContent = payload.geo_autorizada ? '✓' : '⚠';
    confirmIcon.className   = payload.geo_autorizada ? 'kiosk-status-ok' : 'kiosk-status-err';
  }

  // Enviar a n8n (o solo log en demo)
  if(!K.config.demoMode && K.config.n8nUrl){
    try{
      var result = await window.OdooKiosk.registrarCheckin(payload);
      // Verificar candados del backend
      var r = Array.isArray(result) ? result[0] : result;
      if(r && r.accion_valida === false){
        var errMsg = r.error_msg || 'Error desconocido';
        mostrarErrorCandado(errMsg);
        return;
      }
    } catch(e){
      console.warn('Error enviando a n8n:', e);
    }
  } else {
    console.log('[DEMO] Payload kiosk:', payload);
  }

  // Reset estado y volver a home
  setTimeout(() => {
    K.seleccionado = null;
    K.soSeleccionada = null;
    K.tipo = null;
    K.geo = null;
    K.geoAutorizada = null;
    K.geoMotivo = null;
    K.geoSitio = null;
    K.geoDistancia = 0;
    K.pin = '';
    updatePinDots();
    if(K.stream){
      K.stream.getTracks().forEach(t => t.stop());
      K.stream = null;
    }
    showScreen('ks-home');
  }, 4000);
}

// ═══════ HISTORIAL ═══════
function searchHistorial(q){
  const lista = document.getElementById('hist-empleados');
  if(!lista) return;
  const nq = normalize(q||'');
  const filtrados = !nq ? K.empleados : K.empleados.filter(e => normalize(e.name||e.nombre||'').includes(nq));
  lista.innerHTML = filtrados.slice(0, 5).map(e => {
    const nombre = e.name || e.nombre || '';
    const cargo  = e.cargo || e.job_title || e.puesto || 'Técnico';
    const foto = e.foto || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="%23f5f5f5"/><text x="50%" y="58%" text-anchor="middle" font-size="28" font-family="Inter,sans-serif" font-weight="700" fill="%23999">'+(nombre||'?').charAt(0)+'</text></svg>';
    return '<div class="kiosk-employee-card" onclick="mostrarHistorial('+e.id+')">'+
      '<img class="kiosk-employee-photo" src="'+foto+'" alt="">'+
      '<div><div class="kiosk-employee-name">'+nombre+'</div>'+
      '<div class="kiosk-employee-sub">'+cargo+'</div></div>'+
    '</div>';
  }).join('');
}

function abrirHistorialDirecto(){
  var emp = window._empleadoActual;
  if(!emp || !emp.id){
    // Sin empleado activo → ir a historial normal
    showScreen('ks-historial');
    return;
  }
  // Ir a historial y cargar directamente el empleado activo
  showScreen('ks-historial');
  // Ocultar búsqueda, mostrar historial directo
  var searchEl = document.getElementById('hist-search');
  var listaEl  = document.getElementById('hist-empleados');
  if(searchEl) searchEl.style.display = 'none';
  if(listaEl)  listaEl.style.display  = 'none';
  mostrarHistorial(emp.id);
}
window.abrirHistorialDirecto = abrirHistorialDirecto;

async function mostrarHistorial(empId){
  const emp = K.empleados.find(e => e.id === empId);
  if(!emp) return;

  K.histEmpleadoId = empId;

  // Reset rango UI a "hoy"
  const rangoDiv = document.getElementById('hist-rango');
  if(rangoDiv) rangoDiv.style.display = 'none';
  const btnHoy = document.getElementById('btn-hoy');
  const btnCustom = document.getElementById('btn-custom');
  if(btnHoy){ btnHoy.style.background='#0078D4'; btnHoy.style.color='#fff'; btnHoy.style.borderColor='#0078D4'; }
  if(btnCustom){ btnCustom.style.background='#fff'; btnCustom.style.color='#666'; btnCustom.style.borderColor='#e0e0e0'; }

  document.getElementById('hist-empleados').style.display = 'none';
  document.getElementById('hist-search').style.display = 'none';
  document.getElementById('hist-content').style.display = 'block';
  document.getElementById('hist-foto').src = emp.foto || '';
  document.getElementById('hist-nombre').textContent = emp.name || emp.nombre || '';
  document.getElementById('hist-fecha').textContent = new Date().toLocaleDateString('es-MX', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });
  document.getElementById('hist-horas').textContent = 'Cargando…';
  document.getElementById('hist-eventos').innerHTML = '';

  let eventos = [];
  let esDemo = false;

  if(!K.config.demoMode && K.config.n8nUrl){
    try{
      const res = await window.OdooKiosk.getAsistenciaHoy(empId);
      eventos = (res && res.eventos) || [];
    } catch(e){
      console.warn('Odoo no disponible, usando demo:', e);
      esDemo = true;
      eventos = generarEventosDemo(new Date());
    }
  } else {
    esDemo = true;
    eventos = generarEventosDemo(new Date());
  }

  const avisoDemo = document.getElementById('hist-demo-aviso');
  if(avisoDemo) avisoDemo.style.display = esDemo ? 'block' : 'none';

  document.getElementById('hist-horas').innerHTML = calcularResumen(eventos, new Date());
  document.getElementById('hist-eventos').innerHTML = eventos.map(renderEventoHistorial).join('') ||
    '<div style="text-align:center;color:#999;font-size:13px;padding:12px">Sin registros hoy</div>';
}

function generarEventosDemo(ahora){
  const h = ahora.getHours();
  const eventos = [];
  if(h >= 7)  eventos.push({ tipo:'entrada',         hora:'07:05', geo:'FTS Monterrey', status:'ok' });
  if(h >= 12) eventos.push({ tipo:'salida_comida',   hora:'12:02', geo:'FTS Monterrey', status:'ok' });
  if(h >= 12) eventos.push({ tipo:'regreso_comida',  hora:'12:38', geo:'FTS Monterrey', status:'ok' });
  if(h >= 17) eventos.push({ tipo:'salida',          hora:'17:10', geo:'FTS Monterrey', proyecto:'SO-11547 Nalco', status:'ok' });
  return eventos;
}

function calcularResumen(eventos, ahora){
  const entrada   = eventos.find(e => e.tipo === 'entrada');
  const salComida = eventos.find(e => e.tipo === 'salida_comida');
  const regComida = eventos.find(e => e.tipo === 'regreso_comida');
  const salida    = eventos.find(e => e.tipo === 'salida');

  if(!entrada) return '⏳ Sin registros hoy';

  const toMin = h => {
    const parts = h.split(':').map(Number);
    return parts[0] * 60 + parts[1];
  };
  const fmt = min => {
    const h = Math.floor(Math.abs(min) / 60);
    const m = Math.abs(min) % 60;
    return h + 'h ' + m + 'min';
  };

  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
  const entMin = toMin(entrada.hora);
  const scMin  = salComida ? toMin(salComida.hora) : null;
  const rcMin  = regComida ? toMin(regComida.hora) : null;
  const saMin  = salida    ? toMin(salida.hora)    : ahoraMin;

  let efectivas = 0;
  if(scMin && rcMin){
    efectivas = (scMin - entMin) + (saMin - rcMin);
  } else if(scMin){
    efectivas = scMin - entMin;
  } else {
    efectivas = saMin - entMin;
  }

  const comida = (scMin && rcMin) ? (rcMin - scMin) : 0;
  const LIMITE = 576; // 9.6 hrs en minutos
  const extra = Math.max(0, efectivas - LIMITE);
  const faltan = Math.max(0, LIMITE - efectivas);

  return '⏱ <b>Efectivas:</b> ' + fmt(efectivas) + '<br>' +
    '🍽️ <b>Comida:</b> ' + fmt(comida) + '<br>' +
    '⚡ <b>Extra:</b> ' + (extra > 0
      ? '<span style="color:#107C10">' + fmt(extra) + '</span>'
      : '0h 0min <span style="color:#999;font-size:11px">(faltan ' + fmt(faltan) + ')</span>') +
    (!salida ? '<br>🔄 <span style="color:#0078D4">Turno en curso</span>' : '');
}

function renderEventoHistorial(ev){
  const colores = {
    entrada:        '#107C10',
    salida_comida:  '#f39c12',
    regreso_comida: '#0078D4',
    salida:         '#D83B01'
  };
  const labels = {
    entrada:        '🟢 Entrada',
    salida_comida:  '🍽️ Salida a comer',
    regreso_comida: '🔄 Regreso de comida',
    salida:         '🔴 Salida'
  };
  const color = colores[ev.tipo] || '#666';

  // Badge geo
  let geoBadge = '';
  if(ev.geo_autorizada === false){
    geoBadge = '<span style="background:#FFF2CC;color:#BF8F00;border-radius:4px;padding:2px 6px;font-size:11px">⚠️ Geo fuera de zona</span>';
  } else if(ev.geo_autorizada === true){
    geoBadge = '<span style="background:#E2EFDA;color:#107C10;border-radius:4px;padding:2px 6px;font-size:11px">✅ Geo OK</span>';
  }

  // Badge aprobación supervisor
  let aprobBadge = '';
  if(ev.requiere_aprobacion){
    if(ev.aprobado){
      aprobBadge = '<span style="background:#E2EFDA;color:#107C10;border-radius:4px;padding:2px 6px;font-size:11px">✅ Aprobado</span>';
    } else {
      aprobBadge = '<span style="background:#FFE8E8;color:#D83B01;border-radius:4px;padding:2px 6px;font-size:11px">⏳ Pendiente supervisor</span>';
    }
  }

  // Fecha si es rango (no solo hoy)
  const hoyStr = new Date().toLocaleDateString('es-MX');
  const fechaStr = (ev.fecha && ev.fecha !== hoyStr)
    ? '<span style="color:#999;font-size:11px;margin-right:6px">'+ev.fecha+'</span>'
    : '';

  const badgesRow = (geoBadge || aprobBadge)
    ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'+geoBadge+aprobBadge+'</div>'
    : '';

  return '<div style="background:#fff;border:1px solid #e0e0e0;border-left:4px solid '+color+';border-radius:10px;padding:12px 14px;margin-bottom:4px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
      '<span style="font-weight:600;font-size:14px">'+(labels[ev.tipo]||ev.tipo)+'</span>'+
      '<span style="font-weight:700;font-size:16px;color:'+color+'">'+fechaStr+(ev.hora||'--:--')+'</span>'+
    '</div>'+
    '<div style="font-size:12px;color:#666;line-height:1.8">'+
      '📍 '+(ev.geo||ev.sitio||'—')+
      (ev.proyecto ? '<br>📋 '+ev.proyecto : '')+
      (ev.motivo   ? '<br>📝 Motivo: '+ev.motivo : '')+
    '</div>'+
    badgesRow+
  '</div>';
}

// ═══ Rango de fechas en historial ═══
function setRangoHoy(){
  const rangoDiv = document.getElementById('hist-rango');
  if(rangoDiv) rangoDiv.style.display = 'none';
  const btnHoy = document.getElementById('btn-hoy');
  const btnCustom = document.getElementById('btn-custom');
  if(btnHoy){ btnHoy.style.background='#0078D4'; btnHoy.style.color='#fff'; btnHoy.style.borderColor='#0078D4'; }
  if(btnCustom){ btnCustom.style.background='#fff'; btnCustom.style.color='#666'; btnCustom.style.borderColor='#e0e0e0'; }
  if(K.histEmpleadoId){
    mostrarHistorial(K.histEmpleadoId);
  }
}

function setRangoCustom(){
  const rango = document.getElementById('hist-rango');
  rango.style.display = 'block';

  const hoy = new Date();
  const hace7 = new Date();
  hace7.setDate(hoy.getDate() - 7);

  document.getElementById('hist-hasta').value = hoy.toISOString().split('T')[0];
  document.getElementById('hist-desde').value = hace7.toISOString().split('T')[0];

  const btnCustom = document.getElementById('btn-custom');
  const btnHoy = document.getElementById('btn-hoy');
  if(btnCustom){ btnCustom.style.background='#0078D4'; btnCustom.style.color='#fff'; btnCustom.style.borderColor='#0078D4'; }
  if(btnHoy){ btnHoy.style.background='#fff'; btnHoy.style.color='#666'; btnHoy.style.borderColor='#e0e0e0'; }
}

async function buscarRango(){
  const desde = document.getElementById('hist-desde').value;
  const hasta = document.getElementById('hist-hasta').value;
  if(!desde || !hasta) return;

  document.getElementById('hist-horas').textContent = 'Cargando…';
  document.getElementById('hist-eventos').innerHTML = '';

  let eventos = [];
  let esDemo = false;

  if(!K.config.demoMode && K.config.n8nUrl){
    try{
      const res = await window.OdooKiosk.getAsistenciaRango(K.histEmpleadoId, desde, hasta);
      eventos = (res && res.eventos) || [];
    } catch(e){
      console.warn('Odoo no disponible (rango), usando demo:', e);
      esDemo = true;
      eventos = generarEventosDemoRango(desde, hasta);
    }
  } else {
    esDemo = true;
    eventos = generarEventosDemoRango(desde, hasta);
  }

  const avisoDemo = document.getElementById('hist-demo-aviso');
  if(avisoDemo) avisoDemo.style.display = esDemo ? 'block' : 'none';

  document.getElementById('hist-horas').innerHTML =
    '<b>'+eventos.length+'</b> registros del '+desde+' al '+hasta;

  document.getElementById('hist-eventos').innerHTML = eventos.length
    ? eventos.map(renderEventoHistorial).join('')
    : '<p style="color:#999;text-align:center;padding:12px">Sin registros en este período</p>';
}

function generarEventosDemoRango(desde, hasta){
  const eventos = [];
  const d = new Date(desde);
  const h = new Date(hasta);
  while(d <= h){
    const fecha = d.toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' });
    eventos.push(
      { tipo:'entrada',        hora:'07:05', fecha, geo:'FTS Monterrey', geo_autorizada:true },
      { tipo:'salida_comida',  hora:'12:00', fecha, geo:'FTS Monterrey', geo_autorizada:true },
      { tipo:'regreso_comida', hora:'12:32', fecha, geo:'FTS Monterrey', geo_autorizada:true },
      { tipo:'salida',         hora:'17:10', fecha, geo:'FTS Monterrey', geo_autorizada:true, proyecto:'SO-11547 Nalco' }
    );
    d.setDate(d.getDate() + 1);
  }
  return eventos;
}

function autoReturn(){
  let remaining = 4;
  const el = document.getElementById('ksReturnCounter');
  if(el) el.textContent = 'Regresando en '+remaining+'…';
  K.returnTimer = setInterval(() => {
    remaining--;
    if(el) el.textContent = 'Regresando en '+remaining+'…';
    if(remaining <= 0){
      clearInterval(K.returnTimer);
      K.returnTimer = null;
      goHome();
    }
  }, 1000);
}

// ═══ Heartbeat conexión ═══
function updateConnStatus(){
  const el = document.getElementById('ksConnStatus');
  if(!el) return;
  if(K.config.demoMode || !K.config.n8nUrl) el.textContent = 'MODO DEMO';
  else el.textContent = 'conectado';
}

// ═══ Init ═══
async function initKiosk(){
  // Cargar config pública (siempre — las geolocations pueden cambiar)
  try{
    var res = await fetch(
      'https://raw.githubusercontent.com/yinyo1/fts-suite/main/shared/public-config.json?t=' + Date.now(),
      { cache:'no-store' }
    );
    if(!res.ok) throw new Error('HTTP ' + res.status);
    var pub = await res.json();
    if(pub.n8n_url && !localStorage.getItem('ops_n8n_url'))
      localStorage.setItem('ops_n8n_url', pub.n8n_url);
    if(pub.odoo_url && !localStorage.getItem('ops_odoo_url'))
      localStorage.setItem('ops_odoo_url', pub.odoo_url);
    if(pub.demo_mode !== undefined && !localStorage.getItem('ops_demo_mode'))
      localStorage.setItem('ops_demo_mode', pub.demo_mode ? '1' : '0');
    if(pub.geolocations && pub.geolocations.length > 0){
      localStorage.setItem('ops_kiosk_geolocations', JSON.stringify(pub.geolocations));
      localStorage.setItem('ops_geo_sync_timestamp', new Date().toISOString());
      console.log('[GEO] Sincronizado:', pub.geolocations.length, 'sitios');
    }
  } catch(e){
    console.error('[GEO] Error sync:', e.message);
  }

  K.config = loadKioskConfig();
  tick(); setInterval(tick, 1000);
  updateConnStatus();

  await loadEmpleados();
  await loadSOs();

  // Cargar modelos de face-api en background
  if(K.config.faceEnabled && window.FaceVerify){
    try{
      await window.FaceVerify.loadFaceModels();
      K.faceReady = true;
      console.log('✅ Modelos faciales listos');
    } catch(e){
      console.warn('Error cargando modelos faciales:', e);
      K.faceReady = false;
    }
  }
}

// ═══════ ESTADO EMPLEADO ═══════
async function fetchEstadoEmpleado(empleadoId){
  var n8nUrl = localStorage.getItem('ops_n8n_url') || 'https://primary-production-5c3c.up.railway.app';
  try{
    var res = await n8nFetch('/webhook/kiosk/estado-empleado', { empleado_id: empleadoId });
    return res;
  } catch(e){
    console.warn('[Kiosk] fetchEstadoEmpleado falló:', e.message);
    return null;
  }
}

function horasADisplay(horas){
  if(horas == null || horas < 0) return '0:00';
  var h = Math.floor(horas);
  var m = Math.round((horas - h) * 60);
  return h + ':' + String(m).padStart(2, '0');
}

async function mostrarEstadoEmpleado(empleado){
  showScreen('ks-estado');

  // Mostrar spinner animado mientras se consulta estado
  var _spinEl  = document.getElementById('ksSpinner');
  var _emojiEl = document.getElementById('ksIconEmoji');
  if(_spinEl)  _spinEl.style.display  = 'block';
  if(_emojiEl) _emojiEl.style.display = 'none';

  // Limpiar botón de acción rápida (mitad derecha del card) durante spinner
  var _accionEl = document.getElementById('ksAccionRapida');
  if(_accionEl) _accionEl.innerHTML = '';

  var foto = empleado.foto
    || (empleado.image_128
        ? (empleado.image_128.startsWith('data:') ? empleado.image_128 : 'data:image/png;base64,' + empleado.image_128)
        : '');
  var nombre = empleado.name || empleado.nombre || '';

  document.getElementById('ksEstadoFoto').src = foto || '';
  document.getElementById('ksEstadoNombre').textContent = nombre;

  var ahora = new Date();
  document.getElementById('ksEstadoFecha').textContent = ahora.toLocaleDateString('es-MX', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });

  // Consultar estado en n8n
  var estado = await fetchEstadoEmpleado(empleado.id);

  // Ocultar spinner, volver al emoji
  if(_spinEl)  _spinEl.style.display  = 'none';
  if(_emojiEl) _emojiEl.style.display = 'inline';

  if(!estado){
    document.getElementById('ksEstadoCard').style.background = '#fff3cd';
    document.getElementById('ksIconEmoji').textContent = '⚠️';
    document.getElementById('ksEstadoTexto').textContent = 'Error al consultar estado. Intenta de nuevo.';
    document.getElementById('ksEstadoBotones').innerHTML =
      '<button onclick="showScreen(\'ks-search\')" style="background:#0078D4;color:#fff;border:none;padding:14px;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit">← Volver a buscar</button>';
    return;
  }

  window._estadoActual = estado;
  window._empleadoActual = empleado;

  // Horas
  var horasHoy = Math.max(0, estado.horas_hoy || 0);
  var horasRestantes = estado.horas_restantes != null ? Math.min(9.6, Math.max(0, estado.horas_restantes)) : 9.6;
  document.getElementById('ksHorasHoy').textContent = horasADisplay(horasHoy);
  document.getElementById('ksHorasRestantes').textContent = horasADisplay(horasRestantes);

  // Card de estado
  var card  = document.getElementById('ksEstadoCard');
  var icon  = document.getElementById('ksIconEmoji');
  var texto = document.getElementById('ksEstadoTexto');

  switch(estado.estado_actual){
    case 'sin_registro':
      card.style.background = '#f0f4ff';
      icon.textContent = '🔵';
      texto.textContent = 'Sin entrada registrada hoy';
      break;
    case 'activo':
      card.style.background = '#f0f9f0';
      icon.textContent = '🟢';
      texto.textContent = 'En jornada — llevas ' + horasADisplay(estado.horas_transcurridas) + ' hrs';
      break;
    case 'zona_gris':
      card.style.background = '#fff3cd';
      icon.textContent = '🟡';
      texto.textContent = 'Entrada sin salida registrada';
      break;
    case 'error_critico':
      card.style.background = '#ffe8e8';
      icon.textContent = '🔴';
      texto.textContent = 'Checkeo sin salida (+24 hrs)';
      break;
    default:
      card.style.background = '#f5f5f5';
      icon.textContent = '❓';
      texto.textContent = estado.estado_actual || 'Estado desconocido';
  }

  // Grid de horas solo visible durante jornada activa
  var horasGrid = document.getElementById('ksHorasGrid');
  if(horasGrid){
    horasGrid.style.display = (estado.estado_actual === 'activo') ? 'flex' : 'none';
  }

  // Aviso (subtexto pequeño debajo del card de estado — estilo sutil)
  var alertaDiv = document.getElementById('ksEstadoAlerta');
  if(estado.alerta_nivel === 'advertencia'){
    alertaDiv.style.display = 'block';
    alertaDiv.style.background = 'transparent';
    alertaDiv.style.border = 'none';
    alertaDiv.style.fontSize = '13px';
    alertaDiv.style.color = '#666';
    alertaDiv.style.padding = '4px 8px 8px';
    alertaDiv.innerHTML = '⚠️ Llevas ' + horasADisplay(estado.horas_transcurridas) + ' hrs desde tu última entrada. ¿Olvidaste checar salida?';
  } else if(estado.alerta_nivel === 'critico'){
    alertaDiv.style.display = 'block';
    alertaDiv.style.background = 'transparent';
    alertaDiv.style.border = 'none';
    alertaDiv.style.fontSize = '13px';
    alertaDiv.style.color = '#666';
    alertaDiv.style.padding = '4px 8px 8px';
    alertaDiv.innerHTML = '⛔ Debes resolver tu registro anterior antes de poder checar hoy.';
  } else {
    alertaDiv.style.display = 'none';
  }

  // Historial rápido (todos los registros con scroll)
  var histDiv = document.getElementById('ksHistorialRapido');
  if(estado.historial && estado.historial.length > 0){
    var html = '<p style="font-size:12px;color:#666;margin:0 0 8px">Últimas checadas:</p>';
    var useScroll = estado.historial.length > 0;
    html += '<div style="border:1px solid #e0e0e0;border-radius:8px;padding:4px;' +
      (useScroll ? 'max-height:220px;overflow-y:auto;-webkit-overflow-scrolling:touch;' : '') + '">';
    estado.historial.forEach(function(r){
      var ciStr = (r.check_in || '').replace(' ', 'T');
      if(ciStr && ciStr.indexOf('Z') === -1 && ciStr.indexOf('+') === -1) ciStr += 'Z';
      var ci = new Date(ciStr);
      var coStr = r.check_out ? (r.check_out.replace(' ', 'T')) : '';
      if(coStr && coStr.indexOf('Z') === -1 && coStr.indexOf('+') === -1) coStr += 'Z';
      var co = coStr ? new Date(coStr) : null;
      html += '<div style="display:grid;grid-template-columns:auto 1fr 1fr auto;gap:6px;padding:8px 10px;background:#f8f9fa;border-radius:8px;margin-bottom:4px;font-size:12px;align-items:center">' +
        '<span>' + (r.es_nocturno ? '🌙' : '☀️') + (r.es_sospechoso ? '⚠️' : '') + '</span>' +
        '<span style="color:#333">' + ci.toLocaleDateString('es-MX', { weekday:'short', day:'numeric', month:'short' }) + '</span>' +
        '<span style="color:#0078D4">' + ci.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' }) + ' → ' + (co ? co.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' }) : '⏳') + '</span>' +
        '<span style="color:#666;font-size:11px">' + (r.horas ? r.horas.toFixed(1) + 'h' : '—') + '</span>' +
      '</div>';
    });
    html += '</div>';
    histDiv.innerHTML = html;
  } else {
    histDiv.innerHTML = '';
  }

  // Botones dinámicos
  renderEstadoBotones(estado);
}

function renderEstadoBotones(estado){
  var botonesDiv = document.getElementById('ksEstadoBotones');

  // Cleanup: remover botón legacy inyectado (ya no se usa — Resolver está en #ksAccionRapida)
  var oldResolverBtn = document.getElementById('ksResolverBtn');
  if(oldResolverBtn) oldResolverBtn.remove();

  // Botón de acción PRINCIPAL en la mitad derecha del card de estado
  var accionDiv = document.getElementById('ksAccionRapida');
  if(accionDiv){
    switch(estado.estado_actual){
      case 'sin_registro':
        accionDiv.innerHTML = '<button onclick="iniciarCheckin(\'entrada\')" style="background:#107C10;color:#fff;border:none;padding:14px 10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;width:100%">✅ Registrar<br>Entrada</button>';
        break;
      case 'activo':
        accionDiv.innerHTML = '<button onclick="iniciarCheckin(\'salida\')" style="background:#D83B01;color:#fff;border:none;padding:14px 10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;width:100%">🚪 Checar<br>Salida</button>';
        break;
      case 'zona_gris':
        accionDiv.innerHTML = '<button onclick="resolverZonaGris(\'turno\')" style="background:#0078D4;color:#fff;border:none;padding:14px 10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;width:100%">🌙 Seguí<br>en turno</button>';
        break;
      case 'error_critico':
        accionDiv.innerHTML = '<button onclick="resolverErrorCritico()" style="background:#D83B01;color:#fff;border:none;padding:14px 10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;width:100%">🔴 Resolver<br>ahora</button>';
        break;
      default:
        accionDiv.innerHTML = '';
    }
  }

  // Botones SECUNDARIOS (alternativos) en ksEstadoBotones — sin duplicar la acción principal
  var html = '';

  switch(estado.estado_actual){
    case 'sin_registro':
      // Principal (Registrar Entrada) ya en #ksAccionRapida → sólo el alternativo
      html = '<button onclick="olvideChecarEntrada()" style="background:#f0f4ff;color:#0078D4;border:1px solid #0078D4;padding:14px;border-radius:12px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit">⏰ Llegué pero olvidé checar entrada</button>';
      break;
    case 'activo':
      // Principal (Checar Salida) ya en #ksAccionRapida → sólo "Salida a Comer"
      html = '<button onclick="iniciarCheckin(\'salida_comida\')" style="background:#0078D4;color:#fff;border:none;padding:14px;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit">🍽️ Salida a Comer</button>';
      break;
    case 'zona_gris':
      // Principal (Seguí en turno) ya en #ksAccionRapida → sólo el alternativo
      html = '<button onclick="resolverZonaGris(\'olvide\')" style="background:#f0f0f0;color:#333;border:1px solid #ccc;padding:14px;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit">❌ Olvidé checar salida</button>';
      break;
    case 'error_critico':
      // Principal (Resolver) ya en #ksAccionRapida → no hay alternativo
      break;
  }

  // Siempre historial completo al final
  html += '<button onclick="abrirHistorialDirecto()" style="background:transparent;color:#0078D4;border:1px solid #0078D4;padding:12px;border-radius:12px;font-size:14px;cursor:pointer;margin-top:4px;font-family:inherit">📋 Ver historial completo</button>';

  botonesDiv.innerHTML = html;
}

// Stubs — implementar lógica completa después
function iniciarCheckin(tipo){
  K.tipo = tipo;
  var labels = { entrada:'🟢 Entrada', salida_comida:'🍽️ Salida a comer', regreso_comida:'🔄 Regreso de comida', salida:'🔴 Salida' };
  var tipoLabel = document.getElementById('ks-verify-tipo');
  if(tipoLabel) tipoLabel.textContent = labels[tipo] || tipo;
  // Poblar nombre en PIN screen
  var emp = window._empleadoActual || K.seleccionado;
  if(emp){
    var pinNombreEl = document.getElementById('ksPinNombre');
    if(pinNombreEl) pinNombreEl.textContent = '👷 ' + (emp.name || emp.nombre || '');
  }
  showScreen('ks-verify');
  startCamera();
}

function resolverZonaGris(opcion){
  var estado = window._estadoActual;
  var empleado = window._empleadoActual;

  if(opcion === 'turno'){
    // Seguí en turno → checar salida ahora (checkout normal)
    iniciarCheckin('salida');
  } else if(opcion === 'olvide'){
    // Olvidé checar salida → modal para declarar hora estimada
    mostrarModalOlvideCheckout(estado, empleado);
  }
}

function resolverErrorCritico(){
  var estado = window._estadoActual;
  var empleado = window._empleadoActual;
  // Error crítico: siempre va al flujo de "olvidé checar"
  mostrarModalOlvideCheckout(estado, empleado);
}

// ═══════ MODAL OLVIDÉ CHECKOUT ═══════
function mostrarModalOlvideCheckout(estado, empleado){
  var regAbierto = estado && estado.registro_abierto;
  var checkInStr = (regAbierto && regAbierto.check_in) || '';
  var checkInHora  = checkInStr.substring(11, 16) || '??:??';
  var checkInFecha = checkInStr.substring(0, 10) || '??';

  var modal = document.createElement('div');
  modal.id = 'modalOlvideCheckout';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:24px';

  modal.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:24px;max-width:340px;width:100%">'+
      '<h3 style="margin:0 0 8px;font-size:18px">❌ Olvidé checar salida</h3>'+
      '<p style="font-size:13px;color:#666;margin:0 0 16px;line-height:1.5">'+
        'Tu entrada registrada fue el <strong>' + checkInFecha + '</strong> a las <strong>' + checkInHora + '</strong>.<br>¿A qué hora fue tu salida real?'+
      '</p>'+
      '<div style="margin-bottom:16px">'+
        '<label style="font-size:13px;color:#333;font-weight:600;display:block;margin-bottom:6px">Hora estimada de salida:</label>'+
        '<input type="time" id="horaEstimadaSalida" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:16px;box-sizing:border-box;font-family:inherit">'+
      '</div>'+
      '<div style="margin-bottom:20px">'+
        '<label style="font-size:13px;color:#333;font-weight:600;display:block;margin-bottom:6px">Motivo (obligatorio):</label>'+
        '<textarea id="motivoOlvideCheckout" placeholder="Ej: Se me olvidó checar al salir..." style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;height:80px;resize:none;font-family:inherit"></textarea>'+
      '</div>'+
      '<div style="display:flex;gap:10px">'+
        '<button onclick="document.getElementById(\'modalOlvideCheckout\').remove();if(window._empleadoActual)mostrarEstadoEmpleado(window._empleadoActual)" style="flex:1;padding:12px;background:#f0f0f0;color:#333;border:1px solid #ccc;border-radius:10px;font-size:14px;cursor:pointer;font-family:inherit">Cancelar</button>'+
        '<button onclick="confirmarOlvideCheckout()" style="flex:2;padding:12px;background:#D83B01;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">💾 Guardar y resolver</button>'+
      '</div>'+
    '</div>';

  document.body.appendChild(modal);
}
window.mostrarModalOlvideCheckout = mostrarModalOlvideCheckout;

async function confirmarOlvideCheckout(){
  var horaInput = document.getElementById('horaEstimadaSalida');
  var motivoInput = document.getElementById('motivoOlvideCheckout');

  if(!horaInput || !horaInput.value){
    alert('Por favor ingresa la hora estimada');
    return;
  }
  if(!motivoInput || !motivoInput.value.trim()){
    alert('El motivo es obligatorio');
    return;
  }

  var estado = window._estadoActual;
  var empleado = window._empleadoActual;

  // Fecha del check_in original para construir el checkout estimado
  var regAbierto = estado && estado.registro_abierto;
  var fechaCheckIn = (regAbierto && regAbierto.check_in) ? regAbierto.check_in.substring(0, 10) : fechaLocalISO();
  var checkoutEstimado = fechaCheckIn + 'T' + horaInput.value + ':00';

  // Cerrar modal
  var m = document.getElementById('modalOlvideCheckout');
  if(m) m.remove();

  // Mostrar spinner en el card de estado + limpiar botones
  showScreen('ks-estado');
  document.getElementById('ksEstadoBotones').innerHTML = '';
  var spinEl  = document.getElementById('ksSpinner');
  var emojiEl = document.getElementById('ksIconEmoji');
  if(spinEl)  spinEl.style.display  = 'block';
  if(emojiEl) emojiEl.style.display = 'none';
  var textoEl = document.getElementById('ksEstadoTexto');
  if(textoEl) textoEl.textContent = 'Actualizando…';

  try{
    // Cerrar registro viejo con endpoint especial (bypassa candados)
    // No se crea nueva entrada — el usuario puede usar el botón normal
    // "Registrar Entrada" después de que el estado se refresque.
    var attendanceId = (regAbierto && regAbierto.id) || null;
    var resCheckout = await n8nFetch('/webhook/kiosk/cerrar-registro', {
      empleado_id:        empleado.id,
      attendance_id:      attendanceId,
      checkout_estimado:  checkoutEstimado,
      motivo:             motivoInput.value.trim(),
      es_estimado:        true
    });
    var r = Array.isArray(resCheckout) ? resCheckout[0] : resCheckout;
    // cerrar-registro devuelve respuesta GitHub (content + commit) si OK,
    // o un objeto con error / accion_valida:false si falla.
    var exitoso = (r && r.commit) || (r && r.content) || (r && r.ok === true);
    var fallo   = (r && r.accion_valida === false) || (r && r.error) || (r && r.status === 'error');

    if(fallo && !exitoso){
      mostrarErrorCandado(r.error_msg || r.error || 'Error al cerrar registro');
      return;
    }
    if(!r && !resCheckout){
      mostrarErrorCandado('Sin respuesta del servidor');
      return;
    }

    // Refrescar pantalla de estado — ahora verá botón "Registrar Entrada"
    mostrarEstadoEmpleado(empleado);

  } catch(e){
    console.error('ERROR confirmarOlvideCheckout:', e);
    alert('Error al procesar: ' + e.message);
    mostrarEstadoEmpleado(empleado);
  }
}
window.confirmarOlvideCheckout = confirmarOlvideCheckout;

// ═══════ MODAL ERROR CANDADO ═══════
function mostrarErrorCandado(errorMsg){
  var icono = '⚠️';
  var mensaje = errorMsg;

  if(errorMsg.indexOf('ZONA_GRIS:') === 0){
    icono = '🟡';
    var hrsZG = errorMsg.split(':')[1] || '';
    mensaje = 'Llevas ' + hrsZG.trim() + ' hrs desde tu última entrada.\n¿Olvidaste checar salida?';
  } else if(errorMsg.indexOf('ERROR_CRITICO:') === 0){
    icono = '🔴';
    var hrsEC = errorMsg.split(':')[1] || '';
    mensaje = 'Tienes una entrada sin salida de hace ' + hrsEC.trim() + ' horas.\nDebes resolver esto primero.';
  } else if(errorMsg.indexOf('zona autorizada') !== -1 || errorMsg.indexOf('zona') !== -1 && errorMsg.indexOf('fuera') !== -1){
    icono = '📍';
  } else if(errorMsg.indexOf('Ya tienes') !== -1){
    icono = 'ℹ️';
  }

  var modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:24px';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:24px;max-width:320px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.2)">' +
      '<div style="font-size:48px;margin-bottom:12px">' + icono + '</div>' +
      '<p style="font-size:15px;color:#333;line-height:1.5;margin:0 0 20px;white-space:pre-line">' + mensaje + '</p>' +
      '<button onclick="this.closest(\'[style*=fixed]\').remove();if(window._empleadoActual)mostrarEstadoEmpleado(window._empleadoActual);else showScreen(\'ks-search\')" style="background:#0078D4;color:#fff;border:none;padding:12px 32px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;width:100%;font-family:inherit">Entendido</button>' +
    '</div>';
  document.body.appendChild(modal);
}
window.mostrarErrorCandado = mostrarErrorCandado;

window.fetchEstadoEmpleado   = fetchEstadoEmpleado;
window.mostrarEstadoEmpleado = mostrarEstadoEmpleado;
window.iniciarCheckin        = iniciarCheckin;
window.resolverZonaGris      = resolverZonaGris;
window.resolverErrorCritico  = resolverErrorCritico;

// ═══════ OLVIDÉ CHECAR ENTRADA ═══════
function olvideChecarEntrada(){
  var empleado = window._empleadoActual;
  if(!empleado) return;

  var hoy = new Date().toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });

  var modal = document.createElement('div');
  modal.id = 'modalOlvideEntrada';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:24px';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:24px;max-width:340px;width:100%">'+
      '<h3 style="margin:0 0 8px;font-size:18px">⏰ Olvidé checar entrada</h3>'+
      '<p style="font-size:13px;color:#666;margin:0 0 16px;line-height:1.5">'+
        '<strong>' + hoy + '</strong><br>'+
        'Ingresa la hora aproximada a la que llegaste. Tu supervisor deberá validar este registro.'+
      '</p>'+
      '<div style="margin-bottom:16px">'+
        '<label style="font-size:13px;color:#333;font-weight:600;display:block;margin-bottom:6px">Hora estimada de llegada:</label>'+
        '<input type="time" id="horaEstimadaEntrada" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:16px;box-sizing:border-box;font-family:inherit">'+
      '</div>'+
      '<div style="margin-bottom:20px">'+
        '<label style="font-size:13px;color:#333;font-weight:600;display:block;margin-bottom:6px">Motivo (obligatorio):</label>'+
        '<textarea id="motivoOlvideEntrada" placeholder="Ej: Se me olvidó checar al llegar, estuve en junta..." style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;height:80px;resize:none;font-family:inherit"></textarea>'+
      '</div>'+
      '<div style="display:flex;gap:10px">'+
        '<button onclick="document.getElementById(\'modalOlvideEntrada\').remove();if(window._empleadoActual)mostrarEstadoEmpleado(window._empleadoActual)" style="flex:1;padding:12px;background:#f0f0f0;color:#333;border:1px solid #ccc;border-radius:10px;font-size:14px;cursor:pointer;font-family:inherit">Cancelar</button>'+
        '<button onclick="confirmarOlvideEntrada()" style="flex:2;padding:12px;background:#107C10;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Confirmar entrada estimada</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
}
window.olvideChecarEntrada = olvideChecarEntrada;

async function confirmarOlvideEntrada(){
  var horaInput  = document.getElementById('horaEstimadaEntrada');
  var motivoInput = document.getElementById('motivoOlvideEntrada');

  if(!horaInput || !horaInput.value){
    alert('Por favor ingresa la hora estimada de llegada');
    return;
  }
  if(!motivoInput || !motivoInput.value.trim()){
    alert('El motivo es obligatorio');
    return;
  }

  var empleado = window._empleadoActual;
  if(!empleado) return;

  var hoyISO = fechaLocalISO();
  var checkinEstimado = hoyISO + 'T' + horaInput.value + ':00';
  var motivo = motivoInput.value.trim();

  // Cerrar modal
  var m = document.getElementById('modalOlvideEntrada');
  if(m) m.remove();

  // Loading
  showScreen('ks-estado');
  document.getElementById('ksEstadoBotones').innerHTML =
    '<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:rgba(255,255,255,0.95);padding:24px 32px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.15);text-align:center;font-size:16px;color:#333;font-weight:500">⏳ Registrando entrada estimada…</div>';

  try{
    // Obtener geo actual
    var geo = await window.getGeolocacion();

    // Enviar check-in con hora estimada
    var res = await n8nFetch('/webhook/kiosk/checkin', {
      empleado_id:    empleado.id,
      tipo:           'entrada',
      timestamp:      checkinEstimado,
      lat:            (geo && geo.lat != null) ? geo.lat : null,
      lng:            (geo && geo.lng != null) ? geo.lng : null,
      geo_autorizada: true,
      es_estimado:    true,
      motivo_estimado: motivo
    });

    var r = Array.isArray(res) ? res[0] : res;
    if(r && r.accion_valida === false){
      mostrarErrorCandado(r.error_msg || 'Error al registrar entrada');
      return;
    }

    // Refrescar estado
    mostrarEstadoEmpleado(empleado);

  } catch(e){
    alert('Error al procesar: ' + e.message);
    mostrarEstadoEmpleado(empleado);
  }
}
window.confirmarOlvideEntrada = confirmarOlvideEntrada;

// Expose
window.showScreen = showScreen;
window.goHome = goHome;
window.searchEmpleados = searchEmpleados;
window.selectEmpleado = selectEmpleado;
window.addPin = addPin;
window.clearPin = clearPin;
window.backPin = backPin;
window.searchSOs = searchSOs;
window.selectSO = selectSO;
window.selectTipo = selectTipo;
window.cancelarGeo = cancelarGeo;
window.confirmarGeo = confirmarGeo;
window.searchHistorial = searchHistorial;
window.mostrarHistorial = mostrarHistorial;
window.setRangoHoy = setRangoHoy;
window.setRangoCustom = setRangoCustom;
window.buscarRango = buscarRango;

document.addEventListener('DOMContentLoaded', initKiosk);
