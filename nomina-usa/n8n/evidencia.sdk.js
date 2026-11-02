import { workflow, node, trigger, ifElse } from '@n8n/workflow-sdk';
// nomina-usa/evidencia (#448, paso 6). NO creado ni publicado. Cada 15 min: si
// nomina_usa.config evidencia_activa = true, lee de Odoo (solo lectura) las checadas con
// ubicación y las compras con tarjeta, y deja las horas comerciales del día en
// nomina_usa.evidencia_comercial. Con la bandera apagada no lee Odoo ni escribe nada.
// Arma: node nomina-usa/n8n/armar.js evidencia
const PG = { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } };
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Cron cada 15 min', parameters: { rule: { interval: [ { field: 'cronExpression', expression: '*/15 * * * *' } ] } } } });
const params = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Parametros', credentials: PG, parameters: { operation: 'executeQuery', query: 'SELECT nomina_usa.evidencia_parametros() AS p', options: {} } } });
const siActiva = ifElse({ version: 2.2, config: { name: 'IF - Activa?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: '={{ $json.p.activa }}', operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' } } } });
const secreto = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Set - secreto', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
  { id: 'a1', name: 'okey', type: 'string', value: '={{ $env.ODOO_RPC_KEY }}' },
  { id: 'a2', name: 'ourl', type: 'string', value: 'https://serviciosfts.odoo.com' },
  { id: 'a3', name: 'odb', type: 'string', value: 'serviciosfts' },
  { id: 'a4', name: 'ouser', type: 'string', value: 'estebandelacruz@fts.mx' } ] }, options: {} } } });
const leer = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Leer y calcular', parameters: { mode: 'runOnceForAllItems', jsCode: __LEER__ } } });
const siOk = ifElse({ version: 2.2, config: { name: 'IF - Lectura OK?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: '={{ $json.ok }}', operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' } } } });
const registrar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Registrar', credentials: PG, parameters: { operation: 'executeQuery', query: 'SELECT nomina_usa.evidencia_registrar($1::jsonb) AS r', options: { queryReplacement: '={{ JSON.stringify($json.payload) }}' } } } });
const truena = node({ type: 'n8n-nodes-base.stopAndError', version: 1, config: { name: 'Stop - Avisar error', parameters: { errorMessage: "={{ 'nomina-usa/evidencia no pudo leer Odoo: ' + $json.error }}" } } });
const apagado = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Apagado (no hace nada)' } });
export default workflow('nomina-usa-evidencia', 'nomina-usa/evidencia')
  .add(cron).to(params).to(siActiva.onTrue(secreto.to(leer.to(siOk.onTrue(registrar).onFalse(truena)))).onFalse(apagado));
