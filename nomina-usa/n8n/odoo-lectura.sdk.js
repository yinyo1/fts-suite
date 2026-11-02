import { workflow, node, trigger, ifElse } from '@n8n/workflow-sdk';
// nomina-usa/odoo-lectura (#448, MVP pasos 3 y 4). Cada hora (min 23). SOLO LECTURA de Odoo:
// cargos del banco BUS COMPLETE CHK (diario 122) para conciliar el registro de Auris, y la
// analítica de cada SO (project.project.account_id) para el asiento de costo. Escribe solo en
// nomina_usa (banco_cargo, analitica_so) y revisa las conciliaciones abiertas.
// Arma: node nomina-usa/n8n/armar.js odoo-lectura
const PG = { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } };
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Cron cada hora', parameters: { rule: { interval: [ { field: 'cronExpression', expression: '23 * * * *' } ] } } } });
const params = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Parametros', credentials: PG, parameters: { operation: 'executeQuery', query: 'SELECT nomina_usa.banco_parametros() AS p', options: {} } } });
const secreto = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Set - secreto', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
  { id: 'a1', name: 'okey', type: 'string', value: '={{ $env.ODOO_RPC_KEY }}' },
  { id: 'a2', name: 'ourl', type: 'string', value: 'https://serviciosfts.odoo.com' },
  { id: 'a3', name: 'odb', type: 'string', value: 'serviciosfts' },
  { id: 'a4', name: 'ouser', type: 'string', value: 'estebandelacruz@fts.mx' } ] }, options: {} } } });
const leer = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Leer Odoo', parameters: { mode: 'runOnceForAllItems', jsCode: __LEER__ } } });
const siOk = ifElse({ version: 2.2, config: { name: 'IF - Lectura OK?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: '={{ $json.ok }}', operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' } } } });
const registrar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Registrar', credentials: PG, parameters: { operation: 'executeQuery',
  query: 'SELECT nomina_usa.banco_registrar($1::jsonb) AS b, nomina_usa.analitica_registrar($1::jsonb) AS a, nomina_usa.conciliacion_revisar_todo(now()) AS c', options: { queryReplacement: '={{ JSON.stringify($json.payload) }}' } } } });
const truena = node({ type: 'n8n-nodes-base.stopAndError', version: 1, config: { name: 'Stop - Avisar error', parameters: { errorMessage: "={{ 'nomina-usa/odoo-lectura no pudo leer Odoo: ' + $json.error }}" } } });
export default workflow('nomina-usa-odoo-lectura', 'nomina-usa/odoo-lectura')
  .add(cron).to(params).to(secreto).to(leer).to(siOk.onTrue(registrar).onFalse(truena));
