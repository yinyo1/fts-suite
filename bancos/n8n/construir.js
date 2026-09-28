/* Genera el código SDK de n8n de fts_bancos_solicitud_v2 y fts_bancos_acuse a partir de los
 * archivos de bancos/n8n/code/ (el jsCode de los Code nodes nunca se transcribe a mano).
 * Uso: node bancos/n8n/construir.js <salida_dir>   → solicitud_v2.sdk.js, acuse.sdk.js
 * Sin secretos: las credenciales se citan por id/nombre (viven en n8n). */
const fs = require('fs');
const path = require('path');
const C = path.join(__dirname, 'code');
const leer = f => fs.readFileSync(path.join(C, f), 'utf8');
const correo = leer('correo.js').replace(/\nif \(typeof module !== 'undefined'\) \{[\s\S]*?\n\}\n$/, '\n');
const J = JSON.stringify;
// el SDK no acepta funciones flecha: cada filtro se escribe completo
const filtro = (v, nombre, valor) => `const ${v} = node({ type: 'n8n-nodes-base.filter', version: 2.2, config: { name: ${J(nombre)}, parameters: {
  conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ leftValue: expr('{{ $json.accion }}'), operator: { type: 'string', operation: 'equals' }, rightValue: ${J(valor)} }], combinator: 'and' },
  options: {} } } });`;
const PG = "{ postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } }";
const GRAPH = "{ oAuth2Api: { id: 'Mh5kBNduMzOl3nzT', name: 'Microsoft Graph - sales' } }";
const B64 = `const A = [[65, 26], [97, 26], [48, 10]].map(([a, n]) => Array.from({ length: n }, (_, i) => String.fromCharCode(a + i)).join('')).join('') + '+/';
const b64 = s => { const bytes = new TextEncoder().encode(s); let o = ''; for (let i = 0; i < bytes.length; i += 3) { const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
  o += A[a >> 2] + A[((a & 3) << 4) | ((b || 0) >> 4)] + (b === undefined ? '=' : A[((b & 15) << 2) | ((c || 0) >> 6)]) + (c === undefined ? '=' : A[c & 63]); } return o; };`;

const comunes = `
const enviarMime = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'HTTP - Enviar MIME (sales@)',
  parameters: { method: 'POST', url: 'https://graph.microsoft.com/v1.0/users/sales@fts.mx/sendMail', authentication: 'genericCredentialType',
    genericAuthType: 'oAuth2Api', sendBody: true, contentType: 'raw', rawContentType: 'text/plain', body: expr('{{ $json.mime_b64 }}'),
    options: { response: { response: { fullResponse: true, neverError: true } } } },
  credentials: ${GRAPH} } });
const renglon = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Renglon',
  parameters: { mode: 'runOnceForEachItem', jsCode: ${J(leer('renglon.js'))} } } });
const registrar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Registrar correo',
  parameters: { operation: 'executeQuery', query: 'SELECT bancos.registrar_correo($1) AS id;', options: { queryReplacement: expr('{{ $json.registro_b64 }}') } },
  credentials: ${PG} } });
`;

// ── solicitud v2 ──
const paramSol = `/* Parámetros de la corrida. Real: hoy de Monterrey, modo real, frecuencia de bancos.parametros.
 * Ensayos (a mano): fechas fijas, modo prueba (no se envía nada; se registra en bancos.correos con modo=prueba). */
${B64}
const ens = n => { try { return $(n).isExecuted; } catch (e) { return false; } };
let ps = [{ modo: 'real' }];
if (ens('Ensayo 1 · primer dia habil (1-oct)')) ps = [{ escenario: 1, hoy: '2026-10-01', modo: 'prueba' }];
if (ens('Ensayo 2 · dia intermedio (2-oct)')) ps = [{ escenario: 2, hoy: '2026-10-02', modo: 'prueba' }];
if (ens('Ensayo 3 · rezago semanal (mar 6 y lun 5-oct)')) ps = [
  { escenario: '3-martes', hoy: '2026-10-06', modo: 'prueba', frecuencia: 'semanal' },
  { escenario: '3-lunes', hoy: '2026-10-05', modo: 'prueba', frecuencia: 'semanal' }];
return ps.map(p => ({ json: { ...p, p_b64: b64(JSON.stringify(p)) } }));
`;
const sol = `import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';
${comunes}
const diario = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Dias habiles 9:00',
  parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 9 * * 1-5' }] } } } });
const e1 = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Ensayo 1 · primer dia habil (1-oct)' } });
const e2 = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Ensayo 2 · dia intermedio (2-oct)' } });
const e3 = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Ensayo 3 · rezago semanal (mar 6 y lun 5-oct)' } });
const params = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Parametros', executeOnce: true,
  parameters: { jsCode: ${J(paramSol)} } } });
const fsol = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - f_solicitud',
  parameters: { operation: 'executeQuery',
    query: "SELECT bancos.f_solicitud(coalesce((j->>'hoy')::date, bancos.hoy_mty()), coalesce(j->>'modo', 'real'), j->>'frecuencia') AS d FROM (SELECT convert_from(decode($1, 'base64'), 'UTF8')::jsonb AS j) p;",
    options: { queryReplacement: expr('{{ $json.p_b64 }}') } },
  credentials: ${PG} } });
const liga = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'HTTP - Buzon (liga)', executeOnce: true, alwaysOutputData: true,
  onError: 'continueRegularOutput',
  parameters: { method: 'GET', url: 'https://graph.microsoft.com/v1.0/users/estebandelacruz@fts.mx/drive/root:/FTS%20Finanzas%20-%20Bancos/00%20Buzon%20de%20carga%20-%20subir%20aqui?$select=webUrl',
    authentication: 'genericCredentialType', genericAuthType: 'oAuth2Api', options: { response: { response: { fullResponse: true, neverError: true } } } },
  credentials: ${GRAPH} } });
const armar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Armar',
  parameters: { jsCode: ${J(correo + '\n' + leer('adaptador_solicitud.js'))} } } });
${filtro('fEnviar', 'Filtro - enviar', 'enviar')}
${filtro('fRegistrar', 'Filtro - ensayo (registrar sin enviar)', 'registrar')}
${filtro('fAviso', 'Filtro - aviso a Esteban', 'aviso')}
const aviso = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'HTTP - Aviso a Esteban (sales@)', onError: 'continueRegularOutput',
  parameters: { method: 'POST', url: 'https://graph.microsoft.com/v1.0/users/sales@fts.mx/sendMail', authentication: 'genericCredentialType',
    genericAuthType: 'oAuth2Api', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.mail) }}'), options: {} },
  credentials: ${GRAPH} } });
export default workflow('fts-bancos-solicitud-v2', 'fts_bancos_solicitud_v2')
  .add(diario).to(params)
  .add(e1).to(params)
  .add(e2).to(params)
  .add(e3).to(params)
  .add(params).to(fsol).to(liga).to(armar)
  .add(armar).to(fEnviar).to(enviarMime).to(renglon).to(registrar)
  .add(armar).to(fRegistrar).to(renglon)
  .add(armar).to(fAviso).to(aviso);
`;

// ── acuse ──
const paramAcu = `/* Una corrida del buzón = una tanda = un acuse. En ensayo (a mano) nada se envía. */
${B64}
let modo = 'real';
try { if ($('Ensayo (a mano)').isExecuted) modo = 'prueba'; } catch (e) {}
return $input.all().map(it => { const p = { corrida_id: it.json.corrida_id, hoy: it.json.hoy || null, modo };
  return { json: { ...p, p_b64: b64(JSON.stringify(p)) } }; });
`;
const acu = `import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';
${comunes}
const cada30 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Cada 30 min 7-20 h (min 12 y 42)',
  parameters: { rule: { interval: [{ field: 'cronExpression', expression: '12,42 7-20 * * *' }] } } } });
const ensayo = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Ensayo (a mano)' } });
const pend = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Corridas sin acuse',
  parameters: { operation: 'executeQuery', query: 'SELECT corrida_id, terminada_at FROM bancos.f_corridas_sin_acuse();', options: {} },
  credentials: ${PG} } });
const params = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Parametros', parameters: { jsCode: ${J(paramAcu)} } } });
const facu = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - f_acuse',
  parameters: { operation: 'executeQuery',
    query: "SELECT bancos.f_acuse((j->>'corrida_id')::bigint, coalesce((j->>'hoy')::date, bancos.hoy_mty()), coalesce(j->>'modo', 'real')) AS d FROM (SELECT convert_from(decode($1, 'base64'), 'UTF8')::jsonb AS j) p;",
    options: { queryReplacement: expr('{{ $json.p_b64 }}') } },
  credentials: ${PG} } });
const armar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Armar',
  parameters: { jsCode: ${J(correo + '\n' + leer('adaptador_acuse.js'))} } } });
${filtro('fEnviar', 'Filtro - enviar', 'enviar')}
${filtro('fRegistrar', 'Filtro - ensayo (registrar sin enviar)', 'registrar')}
export default workflow('fts-bancos-acuse', 'fts_bancos_acuse')
  .add(cada30).to(pend)
  .add(ensayo).to(pend)
  .add(pend).to(params).to(facu).to(armar)
  .add(armar).to(fEnviar).to(enviarMime).to(renglon).to(registrar)
  .add(armar).to(fRegistrar).to(renglon);
`;
const out = process.argv[2] || '.';
fs.writeFileSync(path.join(out, 'solicitud_v2.sdk.js'), sol);
fs.writeFileSync(path.join(out, 'acuse.sdk.js'), acu);
console.log('ok', sol.length, acu.length);
