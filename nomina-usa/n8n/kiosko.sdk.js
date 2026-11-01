import { workflow, node, trigger, ifElse } from '@n8n/workflow-sdk';
// nomina-usa/kiosko (#448). NO creado ni publicado: crearlo es clic de Esteban (ver issue).
// Arma: node nomina-usa/n8n/armar.js kiosko > /tmp/kiosko.full.sdk.js
const PG = { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } };
const wh = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Webhook', parameters: { httpMethod: 'POST', path: 'nomina-usa/kiosko', responseMode: 'responseNode', options: { allowedOrigins: 'https://yinyo1.github.io' } } } });
const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Validar', parameters: { mode: 'runOnceForAllItems', jsCode: __VALIDAR__ } } });
const si = ifElse({ version: 2.2, config: { name: 'IF - Valido', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [ { id: 'c1', leftValue: '={{ $json.ok }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' }, looseTypeValidation: true, options: {} } } });
const pg = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Kiosko', credentials: PG, parameters: { operation: 'executeQuery', query: 'SELECT nomina_usa.kiosko($1::jsonb) AS r', options: { queryReplacement: '={{ JSON.stringify($json.payload) }}' } } } });
const okResp = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Responder', parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json.r) }}', options: {} } } });
const noResp = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Responder 400', parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: false, error: $json.error }) }}', options: { responseCode: 400 } } } });
export default workflow('nomina-usa-kiosko', 'nomina-usa/kiosko')
  .add(wh).to(validar).to(si.onTrue(pg.to(okResp)).onFalse(noResp));
