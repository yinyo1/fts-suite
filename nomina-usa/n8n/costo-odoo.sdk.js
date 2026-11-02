import { workflow, node, trigger, ifElse } from '@n8n/workflow-sdk';
// nomina-usa/costo-odoo (#448, MVP paso 3). Cada 15 min. Con costo_odoo_activo=false (nace así)
// nomina_usa.costo_pendientes() devuelve activo:false y el workflow se va por «Apagado» ANTES de
// tocar el secreto. Con la bandera prendida (clic de Esteban) crea en Odoo, en BORRADOR y nunca
// publicado, el asiento de costo de cada solicitud subida que no tenga faltantes.
// Arma: node nomina-usa/n8n/armar.js costo-odoo
const PG = { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } };
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Cron cada 15 min', parameters: { rule: { interval: [ { field: 'cronExpression', expression: '*/15 * * * *' } ] } } } });
const pend = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Pendientes', credentials: PG, parameters: { operation: 'executeQuery', query: 'SELECT nomina_usa.costo_pendientes() AS p', options: {} } } });
const hay = ifElse({ version: 2.2, config: { name: 'IF - Activo y con asientos?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: '={{ $json.p.activo === true && ($json.p.asientos || []).length > 0 }}', operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' } } } });
const secreto = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Set - secreto', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
  { id: 'a1', name: 'okey', type: 'string', value: '={{ $env.ODOO_RPC_KEY }}' },
  { id: 'a2', name: 'ourl', type: 'string', value: 'https://serviciosfts.odoo.com' },
  { id: 'a3', name: 'odb', type: 'string', value: 'serviciosfts' },
  { id: 'a4', name: 'ouser', type: 'string', value: 'estebandelacruz@fts.mx' } ] }, options: {} } } });
const crear = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Crear borrador', parameters: { mode: 'runOnceForAllItems', jsCode: __CREAR__ } } });
const resultado = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Resultado', credentials: PG, parameters: { operation: 'executeQuery',
  query: 'SELECT nomina_usa.costo_resultado($1::jsonb) AS r', options: { queryReplacement: '={{ JSON.stringify({ resultados: $json.resultados || [] }) }}' } } } });
const apagado = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Apagado o sin asientos (no hace nada)' } });
export default workflow('nomina-usa-costo-odoo', 'nomina-usa/costo-odoo')
  .add(cron).to(pend).to(hay.onTrue(secreto.to(crear.to(resultado))).onFalse(apagado));
