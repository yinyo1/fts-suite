import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

// kiosk/alerta-fallas · B1 (#269) · 2.5 Alerta al supervisor
// Sub-workflow que llama kiosk/checkin (sin esperar) cuando registra una falla del sistema.
// Si el empleado acumula 2 o más fallas en el día (fecha CST) y no hubo alerta para él en la
// última hora, manda un correo desde sales@fts.mx a Esteban y al supervisor (parent_id en Odoo).

const KIOSK_INTENTOS = { __rl: true, mode: 'id', value: 'oftRi4tGtdGfgcvX', cachedResultName: 'kiosk_intentos' };
const OPS_ALERTAS = { __rl: true, mode: 'id', value: 'ZT1IDsbWXl9Hd8cQ', cachedResultName: 'ops_alertas' };

const entrada = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger', version: 1.2,
  config: { name: 'Llamado por kiosk/checkin', parameters: { inputSource: 'passthrough' }, position: [0, 0] }
});

const normalizar = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Code - Normalizar', position: [220, 0], parameters: { jsCode:
`const x = $input.first().json || {};
const empleado_id = parseInt(x.empleado_id) || null;
const fecha_cst = x.fecha_cst || new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
return [{ json: {
  empleado_id, fecha_cst,
  tipo: String(x.tipo || ''), codigo: String(x.codigo || ''), mensaje: String(x.mensaje || ''),
  intento_id: String(x.intento_id || ''), ejecucion: String(x.ejecucion || ''), workflow: String(x.workflow || 'kiosk/checkin'),
  clave: 'kiosk-fallas:' + empleado_id
} }];` } }
});

const fallasHoy = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'DT - Fallas de hoy', position: [440, 0], alwaysOutputData: true, onError: 'continueRegularOutput', parameters: {
    resource: 'row', operation: 'get', dataTableId: KIOSK_INTENTOS, matchType: 'allConditions', returnAll: true,
    filters: { conditions: [
      { keyName: 'empleado_id', condition: 'eq', keyValue: expr('{{ $json.empleado_id }}') },
      { keyName: 'fecha_cst', condition: 'eq', keyValue: expr('{{ $json.fecha_cst }}') },
      { keyName: 'estado', condition: 'eq', keyValue: 'error' }
    ] }
  } }
});

const ultimaAlerta = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'DT - Última alerta', position: [660, 0], alwaysOutputData: true, onError: 'continueRegularOutput', executeOnce: true, parameters: {
    resource: 'row', operation: 'get', dataTableId: OPS_ALERTAS, limit: 1,
    orderBy: true, orderByColumn: 'enviado_utc', orderByDirection: 'DESC',
    filters: { conditions: [ { keyName: 'clave', condition: 'eq', keyValue: expr("{{ $('Code - Normalizar').first().json.clave }}") } ] }
  } }
});

const decidir = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Code - Decidir', position: [880, 0], parameters: { jsCode:
`const n = $('Code - Normalizar').first().json;
const fallas = $('DT - Fallas de hoy').all().map(i => i.json).filter(r => r && r.intento_id);
const ult = ($input.first() && $input.first().json) || {};
const haceMs = ult.enviado_utc ? Date.now() - new Date(ult.enviado_utc).getTime() : Infinity;
const enviar = fallas.length >= 2 && haceMs >= 3600e3;
return [{ json: { ...n, fallas_hoy: fallas.length, enviar,
  motivo: enviar ? 'enviar' : (fallas.length < 2 ? 'menos de 2 fallas hoy' : 'ya hubo alerta en la última hora'),
  detalle_fallas: fallas.slice(-10).map(r => ({ hora_utc: r.inicio_utc, tipo: r.tipo, codigo: r.codigo, mensaje: r.mensaje, ejecucion: r.ejecucion })) } }];` } }
});

const siEnviar = ifElse({ version: 2.2, config: { name: 'IF - Enviar?', position: [1100, 0], parameters: {
  conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ leftValue: expr('{{ String($json.enviar) }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'true' }],
    combinator: 'and' } } } });

const leerEmpleado = node({
  type: 'n8n-nodes-base.odoo', version: 1,
  config: { name: 'Odoo - Empleado (parent_id)', position: [1320, -100], alwaysOutputData: true, onError: 'continueRegularOutput',
    credentials: { odooApi: { id: 'Wansi69xesEqEiY1', name: 'Odoo FTS' } },
    parameters: { resource: 'custom', customResource: 'hr.employee', operation: 'getAll', limit: 1,
      options: { fieldsList: ['id', 'name', 'parent_id'] },
      filterRequest: { filter: [{ fieldName: 'id', value: expr('{{ $json.empleado_id }}') }] } } }
});

const leerSupervisor = node({
  type: 'n8n-nodes-base.odoo', version: 1,
  config: { name: 'Odoo - Supervisor (correo)', position: [1540, -100], alwaysOutputData: true, onError: 'continueRegularOutput',
    credentials: { odooApi: { id: 'Wansi69xesEqEiY1', name: 'Odoo FTS' } },
    parameters: { resource: 'custom', customResource: 'hr.employee', operation: 'getAll', limit: 1,
      options: { fieldsList: ['id', 'name', 'work_email'] },
      filterRequest: { filter: [{ fieldName: 'id', value: expr('{{ (Array.isArray($json.parent_id) ? $json.parent_id[0] : ($json.parent_id && $json.parent_id.id) || $json.parent_id) || 0 }}') }] } } }
});

const armarCorreo = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Code - Armar correo', position: [1760, -100], parameters: { jsCode:
`const d = $('Code - Decidir').first().json;
const emp = $('Odoo - Empleado (parent_id)').first().json || {};
const sup = $input.first().json || {};
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cst = iso => { try { return new Date(new Date(iso).getTime() - 6 * 3600e3).toISOString().slice(11, 16) + ' CST'; } catch (e) { return ''; } };
const para = [{ emailAddress: { address: 'estebandelacruz@fts.mx' } }];
const supCorreo = sup && sup.work_email && /@/.test(sup.work_email) ? String(sup.work_email).trim() : null;
if (supCorreo && supCorreo.toLowerCase() !== 'estebandelacruz@fts.mx') para.push({ emailAddress: { address: supCorreo } });
const filas = d.detalle_fallas.map(f => '<tr><td>' + esc(cst(f.hora_utc)) + '</td><td>' + esc(f.tipo) + '</td><td>' + esc(f.codigo) + '</td><td>' + esc(f.mensaje) + '</td><td>' + esc(f.ejecucion) + '</td></tr>').join('');
const nombre = emp && emp.name ? esc(emp.name) + ' (empleado ' + d.empleado_id + ')' : 'empleado ' + d.empleado_id;
const html = '<p>El kiosko no pudo guardar ' + d.fallas_hoy + ' checadas de ' + nombre + ' hoy (' + esc(d.fecha_cst) + ').</p>'
  + '<p>A la persona se le mostró "No se guardó tu checada". Revisa con ella si pudo registrar y, si no, captura su hora.</p>'
  + '<table border="1" cellpadding="4" cellspacing="0"><tr><th>Hora</th><th>Tipo</th><th>Código</th><th>Mensaje</th><th>Ejecución n8n</th></tr>' + filas + '</table>'
  + (supCorreo ? '' : '<p><b>Sin correo de supervisor en Odoo</b>: esta alerta solo le llegó a Esteban.</p>')
  + '<p style="color:#888">kiosk/alerta-fallas · B1 (#269). Máximo un correo por empleado por hora.</p>';
return [{ json: {
  clave: d.clave,
  graph: { message: { subject: '[Kiosko] ' + d.fallas_hoy + ' checadas sin guardar hoy: empleado ' + d.empleado_id,
    body: { contentType: 'HTML', content: html }, toRecipients: para }, saveToSentItems: true }
} }];` } }
});

const registrarAlerta = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'DT - Registrar alerta', position: [1980, -100], onError: 'continueRegularOutput', parameters: {
    resource: 'row', operation: 'insert', dataTableId: OPS_ALERTAS,
    columns: { mappingMode: 'defineBelow', matchingColumns: [],
      value: { clave: expr('{{ $json.clave }}'), origen: 'kiosk/alerta-fallas', enviado_utc: expr('{{ $now.toISO() }}'), detalle: expr("{{ $json.graph.message.subject }}") },
      schema: [{ id: 'clave', displayName: 'clave', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'origen', displayName: 'origen', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'enviado_utc', displayName: 'enviado_utc', required: false, defaultMatch: false, display: true, type: 'dateTime', canBeUsedToMatch: true }, { id: 'detalle', displayName: 'detalle', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }] } } }
});

const enviarCorreo = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: { name: 'HTTP - Enviar correo (Graph)', position: [2200, -100], onError: 'continueRegularOutput',
    credentials: { oAuth2Api: { id: 'Mh5kBNduMzOl3nzT', name: 'Microsoft Graph - sales' } },
    parameters: { method: 'POST', url: 'https://graph.microsoft.com/v1.0/users/sales@fts.mx/sendMail',
      authentication: 'genericCredentialType', genericAuthType: 'oAuth2Api',
      sendBody: true, specifyBody: 'json', jsonBody: expr("{{ JSON.stringify($('Code - Armar correo').first().json.graph) }}"), options: {} } }
});

export default workflow('kiosk-alerta-fallas', 'kiosk/alerta-fallas (B1 #269)')
  .add(entrada)
  .to(normalizar)
  .to(fallasHoy)
  .to(ultimaAlerta)
  .to(decidir)
  .to(siEnviar.onTrue(leerEmpleado.to(leerSupervisor.to(armarCorreo.to(registrarAlerta.to(enviarCorreo))))));
