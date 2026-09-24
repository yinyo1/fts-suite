// ═══ FTS Kiosk — Conexión Odoo via n8n webhooks ═══
// Todas las llamadas pasan por n8n como proxy seguro.
// El token/credenciales de Odoo vive en el servidor n8n,
// nunca en el navegador.

// URL default — se usa si localStorage no tiene ops_n8n_url aún.
// public-config.json de GitHub sobreescribe esto en primer login.
const N8N_DEFAULT = 'https://primary-production-5c3c.up.railway.app';

const N8N_BASE = () => {
  const url = localStorage.getItem('ops_n8n_url') || N8N_DEFAULT;
  return url.replace(/\/$/, '');
};

// Error con clasificación, para que quien llama distinga la causa (B1 #269):
//   'timeout'   el kiosko abortó a los 10 s (en Railway se ve como 499)
//   'red'       el fetch no llegó (sin señal, DNS, CORS de un 502)
//   'http'      el servidor contestó con status >= 400
//   'respuesta' el servidor contestó 200 pero vacío o sin JSON (workflow que truena sin Respond)
function n8nError(tipo, mensaje, status){
  var e = new Error(mensaje);
  e.tipo = tipo;
  e.status = status || null;
  return e;
}

async function n8nFetch(endpoint, body, retries){
  if(body === undefined) body = {};
  if(retries === undefined) retries = 2;
  const base = N8N_BASE();
  if(!base) throw new Error('n8n no configurado');

  for(var i = 0; i <= retries; i++){
    var timer = null;
    try{
      var controller = new AbortController();
      timer = setTimeout(function(){ controller.abort(); }, 10000);
      var res;
      try{
        res = await fetch(base + endpoint, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
          signal:  controller.signal
        });
      } catch(fe){
        throw n8nError(fe && fe.name === 'AbortError' ? 'timeout' : 'red',
                       fe && fe.name === 'AbortError' ? 'El servidor no contestó en 10 s' : 'Sin conexión con el servidor');
      }
      if(!res.ok) throw n8nError('http', 'n8n ' + res.status, res.status);
      // El cuerpo se lee y se interpreta DENTRO del try (antes: return res.json() fuera
      // del alcance del catch, así que un 200 vacío escapaba sin reintento ni clasificación).
      var texto = await res.text();
      if(!texto || !texto.trim()) throw n8nError('respuesta', 'El servidor respondió vacío', res.status);
      try{
        return JSON.parse(texto);
      } catch(pe){
        throw n8nError('respuesta', 'El servidor respondió algo que no es JSON', res.status);
      }
    } catch(e){
      if(e && e.name === 'AbortError' && !e.tipo){ e = n8nError('timeout', 'El servidor no contestó en 10 s'); }
      if(i === retries) throw e;
      console.log('[n8n] Reintentando (' + (i+1) + '/' + retries + ')…', e && e.tipo);
      await new Promise(function(r){ setTimeout(r, 2000); });
    } finally {
      if(timer) clearTimeout(timer);
    }
  }
}

async function getEmpleados(){
  const companyId = parseInt(localStorage.getItem('ops_kiosk_company_id') || '1', 10);
  const data = await n8nFetch('/webhook/kiosk/empleados', { company_id: companyId });
  return (data && data.empleados) || [];
}

async function getSOs(){
  const companyId = parseInt(localStorage.getItem('ops_kiosk_company_id') || '1', 10);
  const data = await n8nFetch('/webhook/kiosk/sos', { company_id: companyId });
  return (data && data.sos) || [];
}

// B3: plan del día del empleado (pre-llenado de SO en salida)
async function getPlanDia(empleadoId){
  return n8nFetch('/webhook/planeacion/dia', { empleado_id: empleadoId });
}

// Los reintentos de n8nFetch reenvían el MISMO payload, o sea el mismo intento_id:
// el servidor los reconoce y no vuelve a escribir (idempotencia, B1 #269).
async function registrarCheckin(payload){
  return n8nFetch('/webhook/kiosk/checkin', payload);
}

// Reconciliación tras un timeout o una respuesta ilegible: pregunta si el servidor
// SÍ procesó ese intento_id. Solo lectura. Un reintento corto, no tres.
async function consultarIntento(intentoId, empleadoId){
  return n8nFetch('/webhook/kiosk/intento', { intento_id: intentoId, empleado_id: empleadoId }, 1);
}

async function getAsistenciaHoy(empleadoId){
  return n8nFetch('/webhook/kiosk/asistencia', { empleado_id: empleadoId });
}

async function getAsistenciaRango(empleadoId, desde, hasta){
  return n8nFetch('/webhook/kiosk/asistencia-rango', {
    empleado_id: empleadoId,
    fecha_desde: desde,
    fecha_hasta: hasta
  });
}

async function testConnection(){
  try{
    const res = await n8nFetch('/webhook/kiosk/ping', {});
    return { ok: true, data: res };
  } catch(e){
    return { ok: false, error: e.message };
  }
}

window.OdooKiosk = {
  getEmpleados,
  getSOs,
  getPlanDia,
  registrarCheckin,
  consultarIntento,
  getAsistenciaHoy,
  getAsistenciaRango,
  testConnection
};
