import { workflow, node, trigger } from '@n8n/workflow-sdk';
// nomina-usa/ajuste-viernes (#448, fase F). NO creado ni publicado. Viernes 10:07 CST (16:07 UTC):
// compara los estimados de miércoles y jueves de la semana que cerró contra lo real y deja el
// ajuste precargado para la solicitud siguiente. Idempotente: si no corre, el envío lo hace.
const PG = { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } };
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Cron viernes 16:07 UTC', parameters: { rule: { interval: [ { field: 'cronExpression', expression: '7 16 * * 5' } ] } } } });
const pg = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Ajuste', credentials: PG, parameters: { operation: 'executeQuery',
  query: "SELECT nomina_usa.ajuste_viernes(((now() AT TIME ZONE 'America/Monterrey')::date - 7)) AS r", options: {} } } });
export default workflow('nomina-usa-ajuste-viernes', 'nomina-usa/ajuste-viernes').add(cron).to(pg);
