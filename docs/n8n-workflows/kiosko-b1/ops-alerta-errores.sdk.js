import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

// ops/alerta-errores · B1 (#269) · 2.4 Workflow global de errores
// Se asigna como errorWorkflow (settings) a: kiosk/checkin, incidencias/resolver,
// crear-olvido-entrada, crear-olvido-checkout, confirmar-horas y corregir-bolsa.
// Correo desde sales@fts.mx a Esteban con workflow, nodo, ejecución, empleado (si se puede) y mensaje.
// Máximo 1 correo por workflow y empleado por hora (tabla ops_alertas).
// Límite conocido: el Error Trigger NO trae el payload de la ejecución que falló, y no hay credencial
// de la API de n8n para leerlo; el empleado solo aparece si el mensaje de error lo menciona.

const OPS_ALERTAS = { __rl: true, mode: 'id', value: 'ZT1IDsbWXl9Hd8cQ', cachedResultName: 'ops_alertas' };

const entrada = trigger({
  type: 'n8n-nodes-base.errorTrigger', version: 1,
  config: { name: 'Error Trigger', parameters: {}, position: [0, 0] }
});

const armar = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Code - Armar datos', position: [220, 0], parameters: { jsCode:
`const x = $input.first().json || {};
const ex = x.execution || {};
const wf = x.workflow || {};
const err = ex.error || (x.trigger && x.trigger.error) || {};
const mensaje = String(err.message || err.description || 'sin mensaje').slice(0, 800);
const nodo = String((err.node && err.node.name) || ex.lastNodeExecuted || '');
const m = /empleado[_ ]?(?:id)?[^0-9]{0,4}([0-9]+)/i.exec(mensaje);
const empleado_id = m && m[1].length <= 6 ? m[1] : '';
return [{ json: {
  workflow_id: String(wf.id || ''), workflow_nombre: String(wf.name || ''),
  ejecucion: String(ex.id || ''), url: String(ex.url || ''), modo: String(ex.mode || ''),
  nodo, mensaje, empleado_id,
  clave: 'errwf:' + String(wf.id || '') + ':' + (empleado_id || '-')
} }];` } }
});

const ultima = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'DT - Última alerta', position: [440, 0], alwaysOutputData: true, onError: 'continueRegularOutput', parameters: {
    resource: 'row', operation: 'get', dataTableId: OPS_ALERTAS, limit: 1,
    orderBy: true, orderByColumn: 'enviado_utc', orderByDirection: 'DESC',
    filters: { conditions: [ { keyName: 'clave', condition: 'eq', keyValue: expr('{{ $json.clave }}') } ] }
  } }
});

const decidir = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Code - Decidir', position: [660, 0], parameters: { jsCode:
`const d = $('Code - Armar datos').first().json;
const ult = ($input.first() && $input.first().json) || {};
const haceMs = ult.enviado_utc ? Date.now() - new Date(ult.enviado_utc).getTime() : Infinity;
return [{ json: { ...d, enviar: haceMs >= 3600e3 } }];` } }
});

const siEnviar = ifElse({ version: 2.2, config: { name: 'IF - Enviar?', position: [880, 0], parameters: {
  conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ leftValue: expr('{{ String($json.enviar) }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'true' }],
    combinator: 'and' } } } });

const correo = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Code - Armar correo', position: [1100, -100], parameters: { jsCode:
`const d = $input.first().json;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fila = (k, v) => '<tr><th align="left">' + k + '</th><td>' + v + '</td></tr>';
const html = '<p>Un workflow de producción falló sin responder.</p><table border="1" cellpadding="4" cellspacing="0">'
  + fila('Workflow', esc(d.workflow_nombre) + ' (' + esc(d.workflow_id) + ')')
  + fila('Nodo', esc(d.nodo))
  + fila('Ejecución', d.url ? '<a href="' + esc(d.url) + '">' + esc(d.ejecucion) + '</a>' : esc(d.ejecucion))
  + fila('Empleado', d.empleado_id ? 'empleado ' + esc(d.empleado_id) : 'no disponible en el error')
  + fila('Mensaje', esc(d.mensaje))
  + '</table><p style="color:#888">ops/alerta-errores · B1 (#269). Máximo un correo por workflow y empleado por hora.</p>';
return [{ json: { clave: d.clave,
  graph: { message: { subject: '[n8n] Falló ' + d.workflow_nombre + ' en ' + (d.nodo || 'nodo desconocido'),
    body: { contentType: 'HTML', content: html }, toRecipients: [{ emailAddress: { address: 'estebandelacruz@fts.mx' } }] }, saveToSentItems: true } } }];` } }
});

const registrar = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'DT - Registrar alerta', position: [1320, -100], onError: 'continueRegularOutput', parameters: {
    resource: 'row', operation: 'insert', dataTableId: OPS_ALERTAS,
    columns: { mappingMode: 'defineBelow', matchingColumns: [],
      value: { clave: expr('{{ $json.clave }}'), origen: 'ops/alerta-errores', enviado_utc: expr('{{ $now.toISO() }}'), detalle: expr('{{ $json.graph.message.subject }}') },
      schema: [{ id: 'clave', displayName: 'clave', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'origen', displayName: 'origen', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'enviado_utc', displayName: 'enviado_utc', required: false, defaultMatch: false, display: true, type: 'dateTime', canBeUsedToMatch: true }, { id: 'detalle', displayName: 'detalle', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }] } } }
});

const enviar = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: { name: 'HTTP - Enviar correo (Graph)', position: [1540, -100], onError: 'continueRegularOutput',
    credentials: { oAuth2Api: { id: 'Mh5kBNduMzOl3nzT', name: 'Microsoft Graph - sales' } },
    parameters: { method: 'POST', url: 'https://graph.microsoft.com/v1.0/users/sales@fts.mx/sendMail',
      authentication: 'genericCredentialType', genericAuthType: 'oAuth2Api',
      sendBody: true, specifyBody: 'json', jsonBody: expr("{{ JSON.stringify($('Code - Armar correo').first().json.graph) }}"), options: {} } }
});

export default workflow('ops-alerta-errores', 'ops/alerta-errores (B1 #269)')
  .add(entrada)
  .to(armar)
  .to(ultima)
  .to(decidir)
  .to(siEnviar.onTrue(correo.to(registrar.to(enviar))));
