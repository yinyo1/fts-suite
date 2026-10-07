import { workflow, node, trigger, ifElse } from '@n8n/workflow-sdk';
const PG = { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } };
const wh = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Webhook', parameters: { httpMethod: 'POST', path: 'retardos/panel', responseMode: 'responseNode', options: { allowedOrigins: 'https://yinyo1.github.io' } } } });
const sec = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Set - Secreto', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [ { id: 's1', name: 'secreto', value: '={{ $env.SUITE_JWT_SECRET }}', type: 'string' } ] }, options: {} } } });
const puerta = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: "Code - Puerta", parameters: { mode: 'runOnceForAllItems', jsCode: __PUERTA__ } } });
const si = ifElse({ version: 2.2, config: { name: 'IF - Autorizado', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [ { id: 'c1', leftValue: '={{ $json.ok }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' }, looseTypeValidation: true, options: {} } } });
const panel = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: "Postgres - Panel", credentials: PG, parameters: { operation: 'executeQuery', query: "SELECT retardos.panel_seguro($1::jsonb) AS r", options: { queryReplacement: "={{ JSON.stringify($json.payload) }}" } } } });
const okResp = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Responder', parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json.r) }}', options: {} } } });
const noResp = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Responder 401', parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: false, error: $json.error }) }}', options: { responseCode: 401 } } } });
export default workflow('retardos-panel', 'retardos/panel')
  .add(wh).to(sec).to(puerta).to(si.onTrue(panel.to(okResp)).onFalse(noResp));
