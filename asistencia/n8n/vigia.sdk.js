import { workflow, node, trigger } from '@n8n/workflow-sdk';
const PG = { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } };
const ODOO = { odooApi: { id: 'Wansi69xesEqEiY1', name: 'Odoo FTS' } };
const manual = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Manual' } });
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Cron 07:20 diario', parameters: { rule: { interval: [ { field: 'cronExpression', expression: '20 7 * * *' } ] } } } });
const ventana = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Ventana', parameters: { mode: 'runOnceForAllItems', jsCode: __VENTANA__ } } });
const atts = node({ type: 'n8n-nodes-base.odoo', version: 1, config: { name: 'Odoo - asistencias', credentials: ODOO, alwaysOutputData: true, parameters: { resource: 'custom', customResource: 'hr.attendance', operation: 'getAll', returnAll: true, options: { fieldsList: ['id', 'check_in'] }, filterRequest: { filter: [ { fieldName: 'check_in', operator: 'greaterOrEqual', value: '={{ $json.desde_utc }}' }, { fieldName: 'check_in', operator: 'lesserOrEqual', value: '={{ $json.hasta_utc }}' } ] } } } });
const payload = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Payload', executeOnce: true, parameters: { mode: 'runOnceForAllItems', jsCode: __PAYLOAD__ } } });
const cuadre = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Cuadre', credentials: PG, parameters: { operation: 'executeQuery', query: 'SELECT asistencia.cuadre($1::jsonb) AS r', options: { queryReplacement: '={{ JSON.stringify($json.payload) }}' } } } });
const resultado = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Resultado', parameters: { mode: 'runOnceForAllItems', jsCode: __RESULTADO__ } } });
export default workflow('asistencia-vigia-cuadre', 'asistencia/vigia-cuadre')
  .add(cron).to(ventana)
  .add(manual).to(ventana)
  .add(ventana).to(atts).to(payload).to(cuadre).to(resultado);
