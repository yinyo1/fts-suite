import { workflow, node, trigger } from '@n8n/workflow-sdk';
const PG = { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } };
const manual = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Manual' } });
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: "Cron viernes 10:00", parameters: { rule: { interval: [ { field: 'cronExpression', expression: "0 10 * * 5" } ] } } } });
const res = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: "Postgres - Resumen semanal", credentials: PG, parameters: { operation: 'executeQuery', query: "SELECT retardos.resumen_semanal() AS r", options: {  } } } });
const lat = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: "Postgres - Latido", credentials: PG, parameters: { operation: 'executeQuery', query: "SELECT retardos.latido($1::jsonb) AS corrida", options: { queryReplacement: "={{ JSON.stringify({ workflow: 'retardos/resumen-semanal', ok: true, leidos: 1, resumen: { semana: $json.r.semana } }) }}" } } } });
export default workflow('retardos-resumen', 'retardos/resumen-semanal')
  .add(cron).to(res)
  .add(manual).to(res)
  .add(res).to(lat);
