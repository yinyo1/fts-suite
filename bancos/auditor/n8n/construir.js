/* Genera el código SDK de los workflows del auditor (issue #346) a partir de archivos del repo:
 * el SQL y el jsCode nunca se transcriben a mano. Uso: node bancos/auditor/n8n/construir.js <salida_dir>
 * Sin secretos: las credenciales se citan por id/nombre (viven en n8n). */
const fs = require('fs');
const path = require('path');
const A = __dirname;
const leer = f => fs.readFileSync(path.join(A, f), 'utf8');
const J = JSON.stringify;
const PG = "{ postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } }";
const GRAPH = "{ oAuth2Api: { id: 'Mh5kBNduMzOl3nzT', name: 'Microsoft Graph - sales' } }";
const U = 'https://graph.microsoft.com/v1.0/users/estebandelacruz@fts.mx/drive';
const filtro = (v, nombre, campo, valor) => `const ${v} = node({ type: 'n8n-nodes-base.filter', version: 2.2, config: { name: ${J(nombre)}, parameters: {
  conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ leftValue: expr('{{ $json.${campo} }}'), operator: { type: 'string', operation: 'equals' }, rightValue: ${J(valor)} }], combinator: 'and' },
  options: {} } } });`;
const listar = (v, nombre) => `const ${v} = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: ${J(nombre)}, onError: 'continueRegularOutput',
  parameters: { method: 'GET', url: expr('{{ $json.url }}'), authentication: 'genericCredentialType', genericAuthType: 'oAuth2Api',
    options: { timeout: 60000, pagination: { pagination: { paginationMode: 'responseContainsNextURL', nextURL: expr("{{ $response.body['@odata.nextLink'] }}"),
      paginationCompleteWhen: 'other', completeExpression: expr("{{ !$response.body['@odata.nextLink'] }}"), limitPagesFetched: true, maxRequests: 50 } } } },
  credentials: ${GRAPH} } });`;
const nivel = (v, nombre) => `const ${v} = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${J(nombre)},
  parameters: { jsCode: ${J(leer('code/nivel.js'))} } } });`;

// ── lectura ──
const lectura = `import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';
const entrada = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { name: 'Auditor (entrada)',
  parameters: { httpMethod: 'POST', path: 'fts-bancos-auditor-lectura-9f3c71', responseMode: 'onReceived', options: {} } } });
const probar = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Probar base (a mano)' } });
const pedido = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Pedido',
  parameters: { jsCode: ${J(leer('code/pedido.js'))} } } });
${filtro('fDb', 'Filtro - base', 'base', 'si')}
${filtro('fOd', 'Filtro - onedrive', 'onedrive', 'si')}
${filtro('fBa', 'Filtro - bajar', 'accion', 'bajar')}
const base = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Leer base (bancos_auditor)',
  parameters: { operation: 'executeQuery', query: ${J(leer('lectura.sql'))}, options: {} }, credentials: ${PG} } });
const raices = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Raices',
  parameters: { jsCode: ${J(leer('code/raices.js').replace('__U__', U))} } } });
${listar('l1', 'HTTP - Listar 1')}
${nivel('n1', 'Code - Nivel 1')}
${listar('l2', 'HTTP - Listar 2')}
${nivel('n2', 'Code - Nivel 2')}
${listar('l3', 'HTTP - Listar 3')}
${nivel('n3', 'Code - Nivel 3')}
${listar('l4', 'HTTP - Listar 4')}
const inventario = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Inventario OneDrive', executeOnce: true,
  parameters: { jsCode: ${J(leer('code/inventario.js'))} } } });
const items = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Items a bajar',
  parameters: { jsCode: ${J(leer('code/items.js'))} } } });
const bajar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'HTTP - Bajar de OneDrive', onError: 'continueRegularOutput',
  parameters: { method: 'GET', url: expr("{{ 'https://graph.microsoft.com/v1.0/drives/' + $json.drive_id + '/items/' + $json.item_id + '/content' }}"),
    authentication: 'genericCredentialType', genericAuthType: 'oAuth2Api',
    options: { timeout: 120000, response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } } },
  credentials: ${GRAPH} } });
const b64 = node({ type: 'n8n-nodes-base.extractFromFile', version: 1, config: { name: 'Extraer - base64', onError: 'continueRegularOutput',
  parameters: { operation: 'binaryToPropery', binaryPropertyName: 'data', destinationKey: 'b64', options: {} } } });
const empacar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Empacar',
  parameters: { jsCode: ${J(leer('code/empacar.js'))} } } });
export default workflow('fts-bancos-auditor-lectura', 'fts_bancos_auditor_lectura')
  .add(entrada).to(pedido)
  .add(probar).to(pedido)
  .add(pedido).to(fDb).to(base)
  .add(pedido).to(fOd).to(raices).to(l1).to(n1).to(l2).to(n2).to(l3).to(n3).to(l4).to(inventario)
  .add(pedido).to(fBa).to(items).to(bajar).to(b64).to(empacar);
`;

const salida = process.argv[2] || '.';
fs.writeFileSync(path.join(salida, 'auditor_lectura.sdk.js'), lectura);
console.log('ok', lectura.length);
