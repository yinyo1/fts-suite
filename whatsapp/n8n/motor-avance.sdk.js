import { workflow, node, trigger } from '@n8n/workflow-sdk';

// memoria/motor-avance · INACTIVO. Reporte de avance y acta de entrega (simulado, R3 de #328).
// Sólo llama memoria.correr_motor('avance'), cuyo dueño es memoria_motor (memoria_0007).
const aMano = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Inicio (a mano)', parameters: {} } });
const horario = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: {
  name: 'Horario (NO activar hasta resolver capacidad n8n)',
  parameters: { rule: { interval: [{ field: 'cronExpression', expression: '45 13 * * 1' }] } } } });
const correr = node({ type: 'n8n-nodes-base.postgres', version: 2.7, config: {
  name: 'Postgres - correr_motor avance (semana a ayer, dueño memoria_motor)',
  parameters: { resource: 'database', operation: 'executeQuery',
    query: "SELECT memoria.correr_motor('avance') AS resultado;", options: {} },
  executeOnce: true,
  credentials: { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } } } });

export default workflow('memoria-motor-avance', 'memoria/motor-avance')
  .add(aMano).to(correr)
  .add(horario).to(correr);
