import { workflow, node, trigger, ifElse } from '@n8n/workflow-sdk';
const PG = { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } };
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Cron viernes 08:00', parameters: { rule: { interval: [ { field: 'cronExpression', expression: '0 8 * * 5' } ] } } } });
const manual = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Manual (semana que cerro)' } });
const config = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Config', credentials: PG, parameters: { operation: 'executeQuery', query: "SELECT retardos.cfg('empresa_ids') AS empresas, retardos.cfg_txt('modo') AS modo, retardos.semana_id(retardos.semana_cerrada()) AS semana", options: {} } } });
const ventana = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Set - Ventana', parameters: { mode: 'manual', includeOtherFields: true, assignments: { assignments: [
  { id: 'v1', name: 'dias', type: 'number', value: 10 },
  { id: 'v2', name: 'workflow', type: 'string', value: 'retardos/jornada-lectura' } ] }, options: {} } } });
const secreto = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Set - secreto', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
  { id: 'a1', name: 'okey', type: 'string', value: '={{ $env.ODOO_RPC_KEY }}' },
  { id: 'a2', name: 'ourl', type: 'string', value: 'https://serviciosfts.odoo.com' },
  { id: 'a3', name: 'odb', type: 'string', value: 'serviciosfts' },
  { id: 'a4', name: 'ouser', type: 'string', value: 'estebandelacruz@fts.mx' } ] }, options: {} } } });
const leer = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Leer Odoo', parameters: { mode: 'runOnceForAllItems', jsCode: __LEER__ } } });
const siOk = ifElse({ version: 2.2, config: { name: 'IF - Lectura OK?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: '={{ $json.ok }}', operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' } } } });
const ingestar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Ingestar', credentials: PG, parameters: { operation: 'executeQuery', query: 'SELECT retardos.ingestar($1::jsonb) AS r', options: { queryReplacement: '={{ JSON.stringify($json.payload) }}' } } } });
const tabla = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Tabla - Nomina por semana', alwaysOutputData: true, executeOnce: true, parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'f2zOS0IQx3BnVRfC' }, returnAll: true } } });
const mapear = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Nomina a payload', parameters: { mode: 'runOnceForAllItems', jsCode: __NOMINA__ } } });
const cortar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Corte semanal', credentials: PG, parameters: { operation: 'executeQuery', query: 'SELECT retardos.jornada_corte($1::jsonb) AS r', options: { queryReplacement: '={{ JSON.stringify($json.payload) }}' } } } });
const latidoMal = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Latido fallido', credentials: PG, parameters: { operation: 'executeQuery', query: 'SELECT retardos.latido($1::jsonb) AS corrida', options: { queryReplacement: "={{ JSON.stringify({ workflow: 'retardos/jornada', ok: false, leidos: 0, error: String($json.error || '') + ' ' + String($json.detalle || '') }) }}" } } } });
const truena = node({ type: 'n8n-nodes-base.stopAndError', version: 1, config: { name: 'Stop - Avisar error', parameters: { errorMessage: "={{ 'retardos/jornada no pudo leer Odoo: ' + $('Code - Leer Odoo').first().json.error }}" } } });
export default workflow('retardos-jornada', 'retardos/jornada')
  .add(cron).to(config)
  .add(manual).to(config)
  .add(config).to(ventana).to(secreto).to(leer).to(siOk.onTrue(ingestar.to(tabla.to(mapear.to(cortar)))).onFalse(latidoMal.to(truena)));
