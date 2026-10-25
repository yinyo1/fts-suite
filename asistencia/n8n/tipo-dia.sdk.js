import { workflow, node, trigger, ifElse } from '@n8n/workflow-sdk';
const PG = { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } };
const ODOO = { odooApi: { id: 'Wansi69xesEqEiY1', name: 'Odoo FTS' } };
const wh = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Webhook', parameters: { httpMethod: 'POST', path: 'asistencia/tipo-dia', responseMode: 'responseNode', options: { allowedOrigins: 'https://yinyo1.github.io' } } } });
const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Validar', parameters: { mode: 'runOnceForAllItems', jsCode: __VALIDAR__ } } });
const siOk = ifElse({ version: 2.2, config: { name: 'IF - Valido?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: '={{ !$json._error }}', operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' }, looseTypeValidation: true } } });
const leerAtt = node({ type: 'n8n-nodes-base.odoo', version: 1, config: { name: 'Odoo - READ asistencia', credentials: ODOO, alwaysOutputData: true, parameters: { resource: 'custom', customResource: 'hr.attendance', operation: 'getAll', limit: 1, options: { fieldsList: ['id', 'employee_id', 'check_in', 'check_out', 'x_studio_project_id', 'x_studio_many2one_field_GUbBF', 'x_studio_manager_approval'] }, filterRequest: { filter: [ { fieldName: 'id', operator: 'equal', value: '={{ $json.attendance_id }}' } ] } } } });
const ids = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Ids proyecto', executeOnce: true, parameters: { mode: 'runOnceForAllItems', jsCode: __PROYECTOS__ } } });
const proy = node({ type: 'n8n-nodes-base.odoo', version: 1, config: { name: 'Odoo - proyectos', credentials: ODOO, alwaysOutputData: true, parameters: { resource: 'custom', customResource: 'project.project', operation: 'getAll', returnAll: true, options: { fieldsList: ['id', 'company_id'] }, filterRequest: { filter: [ { fieldName: 'id', operator: 'in', value: '={{ $json.proj_ids }}' }, { fieldName: 'active', operator: 'in', value: '={{ [true, false] }}' } ] } } } });
const payload = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Payload', executeOnce: true, parameters: { mode: 'runOnceForAllItems', jsCode: __PAYLOAD__ } } });
const siPayload = ifElse({ version: 2.2, config: { name: 'IF - Asistencia existe?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: '={{ !$json._error }}', operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' }, looseTypeValidation: true } } });
const confirmar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Confirmar', credentials: PG, onError: 'continueRegularOutput', parameters: { operation: 'executeQuery', query: 'SELECT asistencia.confirmar_tipo($1::jsonb) AS r', options: { queryReplacement: '={{ JSON.stringify($json.payload) }}' } } } });
const siGuardo = ifElse({ version: 2.2, config: { name: 'IF - Guardado?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: '={{ $json.r && $json.r.ok === true }}', operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' }, looseTypeValidation: true } } });
const siCambio = ifElse({ version: 2.2, config: { name: 'IF - Cambio?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: '={{ $json.r.cambio === true }}', operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' }, looseTypeValidation: true } } });
const nota = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Nota chatter', parameters: { mode: 'runOnceForAllItems', jsCode: __NOTA__ } } });
const chatter = node({ type: 'n8n-nodes-base.odoo', version: 1, config: { name: 'Odoo - CREATE chatter', credentials: ODOO, onError: 'continueRegularOutput', parameters: { resource: 'custom', customResource: 'mail.message', fieldsToCreateOrUpdate: { fields: [
  { fieldName: 'model', fieldValue: 'hr.attendance' },
  { fieldName: 'res_id', fieldValue: '={{ $json.res_id }}' },
  { fieldName: 'body', fieldValue: '={{ $json.cuerpo }}' },
  { fieldName: 'message_type', fieldValue: 'comment' },
  { fieldName: 'subtype_id', fieldValue: '={{ 2 }}' },
  { fieldName: 'author_id', fieldValue: '={{ 3 }}' } ] } } } });
const resp = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Respuesta', parameters: { mode: 'runOnceForAllItems', jsCode: __RESPUESTA__ } } });
const rechazo = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Rechazo', parameters: { mode: 'runOnceForAllItems', jsCode: __RECHAZO__ } } });
const res = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Respond', parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} } } });
export default workflow('asistencia-tipo-dia', 'asistencia/tipo-dia')
  .add(wh).to(validar).to(siOk
    .onTrue(leerAtt.to(ids.to(proy.to(payload.to(siPayload
      .onTrue(confirmar.to(siGuardo
        .onTrue(siCambio.onTrue(nota.to(chatter.to(resp.to(res)))).onFalse(resp))
        .onFalse(rechazo)))
      .onFalse(rechazo))))))
    .onFalse(rechazo.to(res)));
