import { workflow, node, trigger, ifElse } from '@n8n/workflow-sdk';
const PG = { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } };
const inicio = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Inicio (a mano)' } });
const cfg = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Set - Config', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
  { id: 'c0', name: 'repo', type: 'string', value: 'yinyo1/fts-suite' },
  { id: 'c1', name: 'sha', type: 'string', value: '__SHA__' },
  { id: 'c2', name: 'archivo', type: 'string', value: '__ARCHIVO__' },
  { id: 'c3', name: 'dry_run', type: 'boolean', value: false } ] }, options: {} } } });
const bajar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'HTTP - Bajar .sql del repo', credentials: { httpHeaderAuth: { id: 'i6g6Y7fNeZJW0GA3', name: 'GitHub FTS Suite' } }, parameters: {
  method: 'GET', url: "={{ 'https://api.github.com/repos/' + $json.repo + '/contents/db/migrations/' + $json.archivo + '?ref=' + $json.sha }}",
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true,
  headerParameters: { parameters: [ { name: 'Accept', value: 'application/vnd.github.raw' }, { name: 'X-GitHub-Api-Version', value: '2022-11-28' } ] },
  options: { response: { response: { responseFormat: 'text', outputPropertyName: 'data' } } } } } });
const hash = node({ type: 'n8n-nodes-base.crypto', version: 2, config: { name: 'Crypto - sha256', parameters: { action: 'hash', type: 'SHA256', value: '={{ $json.data }}', dataPropertyName: 'sha256', encoding: 'hex' } } });
const estado = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Estado bitacora', credentials: PG, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: { operation: 'executeQuery', query: "SELECT version, nombre, sha256 FROM public.schema_migrations WHERE version LIKE 'asistencia_%' ORDER BY version;", options: {} } } });
const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Decidir', executeOnce: true, parameters: { jsCode: __DECIDIR__ } } });
const aplicar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Aplicar migracion', credentials: PG, parameters: { operation: 'executeQuery', query: '={{ $json.sql }}', options: { queryBatching: 'transaction' } } } });
const bitacora = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - Bitacora', credentials: PG, executeOnce: true, parameters: { operation: 'executeQuery', query: 'INSERT INTO public.schema_migrations (version, nombre, sha256) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING;', options: { queryReplacement: "={{ $('Code - Decidir').item.json.version }},{{ $('Code - Decidir').item.json.archivo }},{{ $('Code - Decidir').item.json.sha256 }}" } } } });
const readback = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Postgres - READ-BACK', credentials: PG, executeOnce: true, parameters: { operation: 'executeQuery', query: "SELECT (SELECT string_agg(version||':'||left(sha256,12), ', ' ORDER BY version) FROM public.schema_migrations WHERE version LIKE 'asistencia%') AS migraciones, (SELECT string_agg(tablename, ', ' ORDER BY tablename) FROM pg_tables WHERE schemaname='asistencia') AS tablas, (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='asistencia') AS funciones, (SELECT rolname||' login='||rolcanlogin FROM pg_roles WHERE rolname='asistencia_app') AS rol, (SELECT count(*) FROM asistencia.evento) AS eventos", options: {} } } });
const reporte = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Reporte', parameters: { jsCode: "var d = $('Code - Decidir').item.json; var rb = $input.first().json || {};\nreturn [{ json: { ok: true, aplicada: d.version, archivo: d.archivo, sha256: d.sha256, verificado_en_la_base: rb, leido_at: new Date().toISOString() } }];" } } });
const noSeAplico = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - No se aplico', parameters: { jsCode: "var d = $input.first().json; return [{ json: { ok:false, aplicada:null, motivo: d.error || 'DRY_RUN', mensaje: d.mensaje, version: d.version || null, sha256: d.sha256 || null, ya_aplicadas: d.ya_aplicadas || null } }];" } } });
const siAplicar = ifElse({ version: 2.2, config: { name: 'IF - Aplicar?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [ { leftValue: '={{ $json.aplicar }}', operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' } } } });
export default workflow('asistencia-db-migrate', 'asistencia/db-migrate')
  .add(inicio).to(cfg).to(bajar).to(hash).to(estado).to(decidir)
  .to(siAplicar.onTrue(aplicar.to(bitacora.to(readback.to(reporte)))).onFalse(noSeAplico));
