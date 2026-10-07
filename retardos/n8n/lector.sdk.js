import { workflow, node, trigger } from '@n8n/workflow-sdk';
const PG = { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } };
const GRAPH = { oAuth2Api: { id: 'Mh5kBNduMzOl3nzT', name: 'Microsoft Graph - sales' } };
const manual = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Manual' } });
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: "Cron cada 15 min L-V 7 a 21", parameters: { rule: { interval: [ { field: 'cronExpression', expression: "*/15 7-21 * * 1-5" } ] } } } });
const cfg = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: "Postgres - Config buzon", credentials: PG, parameters: { operation: 'executeQuery', query: "SELECT retardos.cfg_txt('buzon_receptor') AS buzon", options: {  } } } });
const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: "Code - Decidir", parameters: { mode: 'runOnceForAllItems', jsCode: __DECIDIR__ } } });
const listar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'HTTP - Graph mensajes', credentials: GRAPH, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, parameters: { method: 'GET', url: "={{ 'https://graph.microsoft.com/v1.0/users/' + $json.buzon + '/mailFolders/inbox/messages' }}", authentication: 'genericCredentialType', genericAuthType: 'oAuth2Api', sendQuery: true, queryParameters: { parameters: [ { name: '$filter', value: "={{ 'receivedDateTime ge ' + $json.desde }}" }, { name: '$top', value: '50' }, { name: '$select', value: 'id,internetMessageId,subject,from,receivedDateTime,hasAttachments' }, { name: '$expand', value: 'attachments' } ] }, options: {} } } });
const mapear = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: "Code - Mapear", parameters: { mode: 'runOnceForAllItems', jsCode: __MAPEAR__ } } });
const reg = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: "Postgres - Registrar respuesta", credentials: PG, parameters: { operation: 'executeQuery', query: "SELECT retardos.registrar_respuesta($1::jsonb) AS r", options: { queryReplacement: "={{ JSON.stringify($json.payload) }}" } } } });
const lat = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: "Postgres - Latido", credentials: PG, executeOnce: true, parameters: { operation: 'executeQuery', query: "SELECT retardos.latido($1::jsonb) AS corrida", options: { queryReplacement: "={{ JSON.stringify({ workflow: 'retardos/lector', ok: true, leidos: $input.all().length }) }}" } } } });
export default workflow('retardos-lector', 'retardos/lector')
  .add(cron).to(cfg)
  .add(manual).to(cfg)
  .add(cfg).to(decidir).to(listar).to(mapear).to(reg).to(lat);
