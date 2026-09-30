/* Genera el código SDK de los dos workflows de Data Bancos (issue #370) a partir de los archivos de
 * esta carpeta: el SQL y el jsCode NUNCA se transcriben a mano. Sin secretos: la credencial de Postgres
 * se cita por id y el secreto del JWT vive en la variable de entorno SUITE_JWT_SECRET de n8n.
 *   node docs/n8n-workflows/fin-bancos-data/construir.js <salida_dir>                       */
const fs = require('fs'), path = require('path');
const A = __dirname, leer = f => fs.readFileSync(path.join(A, f), 'utf8'), J = JSON.stringify;
const PG = "{ postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } }";
const salida = process.argv[2] || '/tmp';
function wf(alcance, ruta, sqlFin, armar, nombreId, nombre) {
  const verificar = leer('code/cripto_jwt.js') + leer('code/verificar.js').replace("const ALCANCE = '__ALCANCE__';", 'const ALCANCE = ' + J(alcance) + ';');
  if (verificar.indexOf('__ALCANCE__') >= 0) throw new Error('marcador sin sustituir');
  const sql = leer('base.sql') + '\n' + leer(sqlFin);
  return `import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const entrada = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Webhook',
  parameters: { httpMethod: 'POST', path: ${J(ruta)}, responseMode: 'responseNode', options: {} } } });
const secreto = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Set - secreto',
  parameters: { mode: 'manual', includeOtherFields: true, assignments: { assignments: [
    { id: 'a1', name: 'secret', value: expr('{{ $env.SUITE_JWT_SECRET }}'), type: 'string' }] }, options: {} } } });
const verificar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Verificar',
  parameters: { jsCode: ${J(verificar)} } } });
const valido = ifElse({ version: 2.2, config: { name: 'IF - Token valido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: expr('{{ $json.ok }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });
const pg = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Leer (bancos_lector)', onError: 'continueRegularOutput',
  parameters: { operation: 'executeQuery', query: ${J(sql)}, options: { queryReplacement: expr('{{ $json.filtro_b64 }}') } },
  credentials: ${PG} } });
const armar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Armar respuesta',
  parameters: { jsCode: ${J(leer(armar))} } } });
const responder = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Respond',
  parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json.cuerpo) }}'), options: { responseCode: expr('{{ $json.http }}') } } } });
export default workflow(${J(nombreId)}, ${J(nombre)})
  .add(entrada).to(secreto).to(verificar)
  .to(valido.onTrue(pg.to(armar.to(responder))).onFalse(responder));
`;
}
fs.writeFileSync(path.join(salida, 'fin_bancos_data.sdk.js'),
  wf('consulta', 'fin/bancos-data', 'consulta.sql', 'code/armar_consulta.js', 'fin-bancos-data', 'fin/bancos-data'));
fs.writeFileSync(path.join(salida, 'fin_bancos_data_exportar.sdk.js'),
  wf('exportar', 'fin/bancos-data-exportar', 'exportar.sql', 'code/armar_exportar.js', 'fin-bancos-data-exportar', 'fin/bancos-data-exportar'));
console.log('ok');
