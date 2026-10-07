import { workflow, node, trigger } from '@n8n/workflow-sdk';
const PG = { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } };
const GRAPH = { oAuth2Api: { id: 'Mh5kBNduMzOl3nzT', name: 'Microsoft Graph - sales' } };
const manual = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Manual' } });
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: "Cron 10:40 y 20:40 todos los dias", parameters: { rule: { interval: [ { field: 'cronExpression', expression: "40 10,20 * * *" } ] } } } });
const salud = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: "Postgres - Salud", credentials: PG, parameters: { operation: 'executeQuery', query: "SELECT retardos.salud() AS s, retardos.cfg('alertas_destinatarios') AS alertas, retardos.cfg_txt('remitente') AS remitente", options: {  } } } });
const lat = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: "Postgres - Latido", credentials: PG, parameters: { operation: 'executeQuery', query: "SELECT retardos.latido($1::jsonb) AS corrida", options: { queryReplacement: "={{ JSON.stringify({ workflow: 'retardos/latido', ok: true, leidos: ($json.s.problemas || []).length, resumen: { salud_ok: $json.s.ok, codigos: ($json.s.problemas || []).map(p => p.codigo) } }) }}" } } } });
const armar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: "Code - Armar alerta", parameters: { mode: 'runOnceForAllItems', jsCode: __ALERTA__ } } });
const enviar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: "HTTP - Graph alerta", credentials: GRAPH, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, parameters: { method: 'POST', url: "={{ 'https://graph.microsoft.com/v1.0/users/' + $json.remitente + '/sendMail' }}", authentication: 'genericCredentialType', genericAuthType: 'oAuth2Api', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.graph) }}', options: {} } } });
export default workflow('retardos-latido', 'retardos/latido')
  .add(cron).to(salud)
  .add(manual).to(salud)
  .add(salud).to(lat).to(armar).to(enviar);
