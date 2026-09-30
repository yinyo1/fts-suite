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

// ── registrar ──
const conSql = (f, sqlf) => leer(f).replace('__SQL__', J(leer(sqlf))).replace('__INFORME__', leer('code/informe.js'));
const registrar = `import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';
const entrada = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { name: 'Auditor (registrar)',
  parameters: { httpMethod: 'POST', path: 'fts-bancos-auditor-registrar-4b8e20', responseMode: 'onReceived', options: {} } } });
const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Validar',
  parameters: { jsCode: ${J(conSql('code/validar_registro.js', 'registrar.sql'))} } } });
const reg = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Registrar',
  parameters: { operation: 'executeQuery', query: expr('{{ $json.sql }}'), options: {} }, credentials: ${PG} } });
const subir = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'HTTP - Subir informe (OneDrive)', onError: 'continueRegularOutput',
  parameters: { method: 'PUT',
    url: expr("{{ '${U}' + '/root:/' + ['FTS Finanzas - Bancos', '02 Base maestra de transacciones', 'Auditorias', $('Code - Validar').first().json.nombre].map(encodeURIComponent).join('/') + ':/content' }}"),
    authentication: 'genericCredentialType', genericAuthType: 'oAuth2Api', sendBody: true, contentType: 'raw', rawContentType: 'text/html',
    body: expr("{{ $('Code - Validar').first().json.html }}"), options: { response: { response: { fullResponse: true, neverError: true } } } },
  credentials: ${GRAPH} } });
const correo = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Correo', parameters: { jsCode: ${J(leer('code/correo_rojo.js'))} } } });
const esRojo = node({ type: 'n8n-nodes-base.if', version: 2.2, config: { name: 'IF - ROJO?', parameters: {
  conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ leftValue: expr('{{ $json.enviar }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'si' }], combinator: 'and' }, options: {} } } });
const enviar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'HTTP - Correo ROJO a Esteban', onError: 'continueRegularOutput',
  parameters: { method: 'POST', url: 'https://graph.microsoft.com/v1.0/users/sales@fts.mx/sendMail', authentication: 'genericCredentialType',
    genericAuthType: 'oAuth2Api', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.mail) }}'),
    options: { response: { response: { fullResponse: true, neverError: true } } } },
  credentials: ${GRAPH} } });
const marcarC = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Marcar', executeOnce: true,
  parameters: { jsCode: ${J(conSql('code/marcar.js', 'marcar.sql'))} } } });
const marcar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Marcar',
  parameters: { operation: 'executeQuery', query: expr('{{ $json.sql }}'), options: {} }, credentials: ${PG} } });
export default workflow('fts-bancos-auditor-registrar', 'fts_bancos_auditor_registrar')
  .add(entrada).to(validar).to(reg).to(subir).to(correo)
  .to(esRojo.onTrue(enviar.to(marcarC)).onFalse(marcarC))
  .add(marcarC).to(marcar);
`;
fs.writeFileSync(path.join(salida, 'auditor_registrar.sdk.js'), registrar);
console.log('ok registrar', registrar.length);

// ── eventos (cada 15 min) y resumen (17:30 hábil) ──
const eventos = `import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';
const cada15 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Cada 15 min 7-21 h',
  parameters: { rule: { interval: [{ field: 'cronExpression', expression: '7,22,37,52 7-21 * * *' }] } } } });
const probar = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Probar (a mano)' } });
const enc = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Encolar eventos (bancos_app)',
  parameters: { operation: 'executeQuery', query: ${J(leer('eventos.sql'))}, options: {} }, credentials: ${PG} } });
export default workflow('fts-bancos-auditor-eventos', 'fts_bancos_auditor_eventos')
  .add(cada15).to(enc)
  .add(probar).to(enc);
`;
const resumen = `import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';
const diario = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Dias habiles 17:30',
  parameters: { rule: { interval: [{ field: 'cronExpression', expression: '30 17 * * 1-5' }] } } } });
const probar = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Probar (a mano, sin enviar)' } });
const leerR = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Auditorias de hoy',
  parameters: { operation: 'executeQuery', query: ${J(leer('resumen.sql'))}, options: {} }, credentials: ${PG} } });
const armar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Armar resumen', parameters: { jsCode: ${J(leer('code/resumen.js'))} } } });
const soloReal = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Solo si es el horario', parameters: { jsCode:
  "/* A mano no se envía nada: sólo el disparador de las 17:30 manda el correo. */\\nlet real = false;\\ntry { real = $('Dias habiles 17:30').isExecuted; } catch (e) { real = false; }\\nreturn real ? $input.all() : [];\\n" } } });
const enviar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'HTTP - Resumen a Esteban', onError: 'continueRegularOutput',
  parameters: { method: 'POST', url: 'https://graph.microsoft.com/v1.0/users/sales@fts.mx/sendMail', authentication: 'genericCredentialType',
    genericAuthType: 'oAuth2Api', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.mail) }}'),
    options: { response: { response: { fullResponse: true, neverError: true } } } },
  credentials: ${GRAPH} } });
export default workflow('fts-bancos-auditor-resumen', 'fts_bancos_auditor_resumen')
  .add(diario).to(leerR)
  .add(probar).to(leerR)
  .add(leerR).to(armar).to(soloReal).to(enviar);
`;
fs.writeFileSync(path.join(salida, 'auditor_eventos.sdk.js'), eventos);
fs.writeFileSync(path.join(salida, 'auditor_resumen.sdk.js'), resumen);
console.log('ok eventos/resumen', eventos.length, resumen.length);

// ── Objetivo 2 (issue #365): lectura de la base (rol bancos_auditor) + Odoo SOLO LECTURA ──
const ODOO = "{ odooApi: { id: 'Wansi69xesEqEiY1', name: 'Odoo FTS' } }";
const obj2 = `import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';
const entrada = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { name: 'Auditor O2 (entrada)',
  parameters: { httpMethod: 'POST', path: 'fts-bancos-auditor-obj2-lectura-6d21a4', responseMode: 'onReceived', options: {} } } });
const probar = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Probar (a mano)' } });
const base = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Leer datos Obj2 (bancos_lector)', executeOnce: true,
  parameters: { operation: 'executeQuery', query: ${J(leer('lectura_obj2.sql'))}, options: {} }, credentials: ${PG} } });
const previa = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Auditoria previa (bancos_auditor)', executeOnce: true,
  parameters: { operation: 'executeQuery', query: ${J(leer('lectura_obj2_previa.sql'))}, options: {} }, credentials: ${PG} } });
const odoo = node({ type: 'n8n-nodes-base.odoo', version: 2, config: { name: 'Odoo - Lineas de banco (solo lectura)', executeOnce: true, alwaysOutputData: true,
  parameters: { resource: 'custom', operation: 'getAll', authentication: 'odooApi',
    customResource: { __rl: true, mode: 'id', value: 'account.move.line' }, returnAll: true,
    options: { fieldsList: 'id,date,balance,amount_currency,move_id,payment_id,journal_id' },
    filters: { filter: [
      { fieldName: 'journal_id', operator: 'in', value: expr('{{ [8, 96, 75] }}') },
      { fieldName: 'parent_state', operator: 'equal', value: 'posted' },
      { fieldName: 'date', operator: 'greaterOrEqual', value: '2024-01-01' },
      { fieldName: 'account_id.account_type', operator: 'equal', value: 'asset_cash' },
      { fieldName: 'company_id', operator: 'equal', value: expr('{{ 1 }}') }] } },
  credentials: ${ODOO} } });
const compacto = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Odoo compacto', executeOnce: true,
  parameters: { jsCode: ${J(leer('code/obj2_odoo.js'))} } } });
export default workflow('fts-bancos-auditor-obj2-lectura', 'fts_bancos_auditor_obj2_lectura')
  .add(entrada).to(base).to(previa).to(odoo).to(compacto)
  .add(probar).to(base);
`;
fs.writeFileSync(path.join(salida, 'auditor_obj2_lectura.sdk.js'), obj2);
console.log('ok obj2', obj2.length);
