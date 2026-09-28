import { workflow, node, trigger } from '@n8n/workflow-sdk';
const PG = { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } };
const GRAPH = { oAuth2Api: { id: 'Mh5kBNduMzOl3nzT', name: 'Microsoft Graph - sales' } };
const manual = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Manual' } });
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: "Cron diario 09:05 L-V", parameters: { rule: { interval: [ { field: 'cronExpression', expression: "5 9 * * 1-5" } ] } } } });
const tabla = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Tabla - Nomina incidencias', alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'NxczD47tabiWV3ST' }, returnAll: true } } });
const mapear = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: "Code - Nomina a payload", parameters: { mode: 'runOnceForAllItems', jsCode: __NOMINA__ } } });
const verif = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: "Postgres - Verificar", credentials: PG, parameters: { operation: 'executeQuery', query: "SELECT retardos.verificar($1::jsonb) AS r", options: { queryReplacement: "={{ JSON.stringify({ nom: $json.nom }) }}" } } } });
export default workflow('retardos-verificar', 'retardos/verificar')
  .add(cron).to(tabla)
  .add(manual).to(tabla)
  .add(tabla).to(mapear).to(verif);
