import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

// kiosk/intento · B1 (#269) · 2.3 Reconciliación de un intento de checada
// SOLO LECTURA. El kiosko lo llama cuando kiosk/checkin no contestó a tiempo, para saber si la
// checada se guardó. Devuelve { procesado, estado, resultado } sin nombre del empleado.
// Protección mínima mientras #123 no exista (propuesta en #269, requiere el "va" para publicar):
//  1. El intento_id es un UUID v4 aleatorio (122 bits) que solo conoce el dispositivo que lo generó:
//     funciona como capacidad. Sin él no hay nada que leer.
//  2. Además debe coincidir el empleado_id guardado en la fila.
//  3. Solo filas de las últimas 24 h.
//  4. Tope global de 120 consultas por minuto (staticData); arriba de eso responde LIMITE.
//  5. La respuesta nunca trae nombre, GPS ni datos de otra persona.

const KIOSK_INTENTOS = { __rl: true, mode: 'id', value: 'oftRi4tGtdGfgcvX', cachedResultName: 'kiosk_intentos' };

const webhook = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'Webhook', position: [0, 0], parameters: { httpMethod: 'POST', path: 'kiosk/intento', responseMode: 'responseNode', options: {} } }
});

const validar = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Code - Validar', position: [220, 0], parameters: { jsCode:
`const body = $input.first().json.body || {};
const intento_id = String(body.intento_id || '').trim().toLowerCase();
const empleado_id = parseInt(body.empleado_id) || 0;
const OK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(intento_id) || /^k-[a-z0-9]{6,12}-[a-z0-9]{6,12}$/.test(intento_id);
const st = $getWorkflowStaticData('global');
const minuto = Math.floor(Date.now() / 60000);
if (st.minuto !== minuto) { st.minuto = minuto; st.cuenta = 0; }
st.cuenta = (st.cuenta || 0) + 1;
if (st.cuenta > 120) return [{ json: { _valido: false, respuesta: { procesado: false, estado: 'desconocido', codigo: 'LIMITE', mensaje: 'Demasiadas consultas, intenta en un minuto.' } } }];
if (!OK_ID || !empleado_id) return [{ json: { _valido: false, respuesta: { procesado: false, estado: 'desconocido', codigo: 'DATOS_INVALIDOS', mensaje: 'Consulta inválida.' } } }];
return [{ json: { _valido: true, intento_id, empleado_id } }];` } }
});

const siValido = ifElse({ version: 2.2, config: { name: 'IF - Válido?', position: [440, 0], parameters: {
  conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ leftValue: expr('{{ String($json._valido) }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'true' }],
    combinator: 'and' } } } });

const buscar = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'DT - Buscar intento', position: [660, -100], alwaysOutputData: true, onError: 'continueRegularOutput', parameters: {
    resource: 'row', operation: 'get', dataTableId: KIOSK_INTENTOS, limit: 1,
    filters: { conditions: [ { keyName: 'intento_id', condition: 'eq', keyValue: expr('{{ $json.intento_id }}') } ] }
  } }
});

const responder = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Code - Armar respuesta', position: [880, -100], parameters: { jsCode:
`const q = $('Code - Validar').first().json;
const f = ($input.first() && $input.first().json) || {};
const NO = { procesado: false, estado: 'desconocido', codigo: 'NO_ENCONTRADO', mensaje: 'No hay registro de ese intento.' };
if (!f.intento_id || String(f.intento_id) !== q.intento_id || parseInt(f.empleado_id) !== q.empleado_id) return [{ json: NO }];
const inicio = f.inicio_utc ? new Date(f.inicio_utc).getTime() : 0;
if (!inicio || Date.now() - inicio > 24 * 3600e3) return [{ json: NO }];
const estado = String(f.estado || 'desconocido');
if (estado === 'en_proceso') return [{ json: { procesado: false, estado } }];
let resultado = null;
try { resultado = typeof f.respuesta === 'string' ? JSON.parse(f.respuesta) : (f.respuesta || null); } catch (e) { resultado = null; }
if (resultado && typeof resultado === 'object') {
  for (const k of Object.keys(resultado)) { if (/nombre|name|lat|lng|latitude|longitude/i.test(k)) delete resultado[k]; }
}
return [{ json: { procesado: estado === 'ok', estado, codigo: String(f.codigo || ''), attendance_id: f.attendance_id || null, resultado: estado === 'ok' ? resultado : null } }];` } }
});

const respOk = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond', position: [1100, -100], parameters: { options: {} } }
});

const armarInvalido = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Code - Respuesta inválida', position: [660, 100], parameters: { jsCode:
`return [{ json: $input.first().json.respuesta }];` } }
});

const respInvalido = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond Inválido', position: [880, 100], parameters: { options: { responseCode: 400 } } }
});

export default workflow('kiosk-intento', 'kiosk/intento (B1 #269)')
  .add(webhook)
  .to(validar)
  .to(siValido
    .onTrue(buscar.to(responder.to(respOk)))
    .onFalse(armarInvalido.to(respInvalido)));
