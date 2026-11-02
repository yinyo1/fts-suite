import { workflow, node, trigger } from '@n8n/workflow-sdk';
// nomina-usa/vigilante (#448, MVP pasos 1 y 2). Cada 15 min, solo Postgres (no lee Odoo ni
// secretos): avisos por reloj (miércoles 8:00 y 9:00 CST, resumen del viernes) y vigilante
// (alertas caídas, envío 9:30, autorización 11:00, subida 12:00, ajuste del viernes, SO sin
// avance). Cada aviso respeta su bandera (avisos_modo / vigilante_modo): en sombra se registra
// en nomina_usa.aviso y NO se encola. Las horas las calcula la base en America/Monterrey.
// Arma: node nomina-usa/n8n/armar.js vigilante
const PG = { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } };
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Cron cada 15 min', parameters: { rule: { interval: [ { field: 'cronExpression', expression: '*/15 * * * *' } ] } } } });
const pg = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Reloj y vigilante', credentials: PG, parameters: { operation: 'executeQuery',
  query: 'SELECT nomina_usa.avisos_reloj(now()) AS a, nomina_usa.vigilante(now()) AS v', options: {} } } });
export default workflow('nomina-usa-vigilante', 'nomina-usa/vigilante').add(cron).to(pg);
