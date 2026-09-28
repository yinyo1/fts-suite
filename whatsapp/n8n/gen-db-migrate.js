// Genera el código SDK del workflow memoria/db-migrate. El SHA-256 se incrusta
// desde sha256.js (probado), no se transcribe.
const fs = require('fs');
const sha = fs.readFileSync(__dirname + '/sha256.js', 'utf8').split('if (typeof module')[0];
const decidir = sha + `
/* memoria/db-migrate · decidir. Una migración por corrida; orden POR MÓDULO
 * (D9 de #328: memoria_0001, memoria_0002…). Se niega si falta la anterior o
 * si el archivo aplicado cambió. */
const ent = $('Code - Validar entrada').first().json;
const contenido = String($('HTTP - Bajar .sql del repo').first().json.data || '');
if (contenido.length < 20) return [{ json: { aplicar: false, error: 'ARCHIVO_VACIO', mensaje: 'El .sql llegó vacío. ¿SHA y ruta correctos?' } }];
const sha256 = sha256Hex(contenido);
if (ent.sha256_esperado && ent.sha256_esperado !== sha256) return [{ json: { aplicar: false, error: 'SHA256_NO_CUADRA', sha256, esperado: ent.sha256_esperado } }];
const filas = $('Postgres - Estado bitacora').all().map(i => i.json).filter(f => f && f.version);
const ya = filas.find(f => String(f.version) === ent.version);
if (ya) return [{ json: { aplicar: false, error: ya.sha256 === sha256 ? 'YA_APLICADA' : 'CHECKSUM_DISTINTO', version: ent.version, sha256, sha256_en_base: ya.sha256 } }];
const faltan = [];
for (let n = 1; n < ent.numero; n++) { const v = ent.modulo + '_' + String(n).padStart(4, '0'); if (!filas.find(f => f.version === v)) faltan.push(v); }
if (faltan.length) return [{ json: { aplicar: false, error: 'FUERA_DE_ORDEN', version: ent.version, faltan } }];
return [{ json: { aplicar: !ent.dry_run, dry_run: ent.dry_run, version: ent.version, archivo: ent.archivo, sha256, bytes: contenido.length, sql: contenido,
  mensaje: ent.dry_run ? 'ENSAYO: se aplicaría ' + ent.version + '. Nada se escribió.' : 'Aplicando ' + ent.version } }];`;

const validar = `
/* Entrada: { archivo: 'memoria/memoria_0001_fundacion.sql', sha: '<commit de 40 hex>',
 *            dry_run: true|false, sha256_esperado?: '<64 hex>' }
 * Sólo acepta archivos de db/migrations/memoria/ (este runner es del frente memoria). */
const b = $json.body || $json;
const archivo = String(b.archivo || '').trim();
const sha = String(b.sha || '').trim();
const m = archivo.match(/^memoria\\/(memoria)_(\\d{4})_[a-z0-9_]+\\.sql$/);
if (!m) throw new Error('ARCHIVO_INVALIDO: debe ser memoria/memoria_NNNN_nombre.sql');
if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('SHA_INVALIDO: commit completo de 40 hex');
return [{ json: { archivo, sha, modulo: m[1], numero: parseInt(m[2], 10), version: m[1] + '_' + m[2],
  dry_run: b.dry_run !== false && b.dry_run !== 'false', sha256_esperado: b.sha256_esperado || null } }];`;

const reporte = `
/* El reporte sale del READ-BACK contra la base, no del success de los nodos. */
const d = $('Code - Decidir').first().json;
const rb = $input.first().json || {};
return [{ json: { ok: true, aplicada: d.version, archivo: d.archivo, sha256: d.sha256, verificado_en_la_base: rb, leido_at: new Date().toISOString() } }];`;

const noSe = `const d = $input.first().json; return [{ json: { ok: false, aplicada: null, motivo: d.error || 'DRY_RUN', detalle: d } }];`;

const readback = `SELECT
 (SELECT string_agg(version || '=' || left(sha256,12), ', ' ORDER BY version) FROM public.schema_migrations WHERE version LIKE 'memoria_%') AS migraciones_memoria,
 (SELECT string_agg(tablename, ', ' ORDER BY tablename) FROM pg_tables WHERE schemaname = 'memoria') AS tablas,
 (SELECT string_agg(c.relname, ', ' ORDER BY c.relname) FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid JOIN pg_class p ON p.oid = i.inhparent JOIN pg_namespace n ON n.oid = p.relnamespace WHERE n.nspname = 'memoria' AND p.relname = 'evento') AS particiones_evento,
 (SELECT string_agg(viewname, ', ' ORDER BY viewname) FROM pg_views WHERE schemaname = 'memoria') AS vistas,
 (SELECT string_agg(rolname, ', ' ORDER BY rolname) FROM pg_roles WHERE rolname LIKE 'memoria%') AS roles,
 (SELECT string_agg(nspname, ', ' ORDER BY nspname) FROM pg_namespace WHERE nspname LIKE 'memoria%') AS esquemas;`;

const q = s => JSON.stringify(s);
const code = `import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const entrada = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Entrada (solo manual)',
  parameters: { httpMethod: 'POST', path: 'memoria-db-migrate-manual', responseMode: 'lastNode', options: {} } } });

const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Validar entrada', parameters: { jsCode: ${q(validar)} } } });

const bajar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'HTTP - Bajar .sql del repo',
  parameters: { method: 'GET', url: expr("{{ 'https://api.github.com/repos/yinyo1/fts-suite/contents/db/migrations/' + $json.archivo + '?ref=' + $json.sha }}"),
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true,
    headerParameters: { parameters: [ { name: 'Accept', value: 'application/vnd.github.raw' }, { name: 'X-GitHub-Api-Version', value: '2022-11-28' } ] },
    options: { response: { response: { responseFormat: 'text', outputPropertyName: 'data' } } } },
  credentials: { httpHeaderAuth: { id: 'i6g6Y7fNeZJW0GA3', name: 'GitHub FTS Suite' } } } });

const estado = node({ type: 'n8n-nodes-base.postgres', version: 2.7, config: { name: 'Postgres - Estado bitacora', alwaysOutputData: true, executeOnce: true,
  parameters: { resource: 'database', operation: 'executeQuery', query: "SELECT version, sha256 FROM public.schema_migrations WHERE version LIKE 'memoria_%' ORDER BY version;", options: {} },
  credentials: { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Decidir', parameters: { jsCode: ${q(decidir)} } } });

const aplicar_q = ifElse({ version: 2.2, config: { name: 'IF - Aplicar?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [ { leftValue: expr('{{ $json.aplicar }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } } ], combinator: 'and' } } } });

const aplicar = node({ type: 'n8n-nodes-base.postgres', version: 2.7, config: { name: 'Postgres - Aplicar migracion',
  parameters: { resource: 'database', operation: 'executeQuery', query: expr('{{ $json.sql }}'), options: { queryBatching: 'transaction' } },
  credentials: { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } } } });

const bitacora = node({ type: 'n8n-nodes-base.postgres', version: 2.7, config: { name: 'Postgres - Bitacora', executeOnce: true,
  parameters: { resource: 'database', operation: 'executeQuery', query: 'INSERT INTO public.schema_migrations (version, nombre, sha256) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING;',
    options: { queryReplacement: expr("{{ $('Code - Decidir').first().json.version }},{{ $('Code - Decidir').first().json.archivo }},{{ $('Code - Decidir').first().json.sha256 }}") } },
  credentials: { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } } } });

const readback = node({ type: 'n8n-nodes-base.postgres', version: 2.7, config: { name: 'Postgres - READ-BACK', executeOnce: true,
  parameters: { resource: 'database', operation: 'executeQuery', query: ${q(readback)}, options: {} },
  credentials: { postgres: { id: 'Zu4Y9UuzGwCBN8lH', name: 'fts-suite-db · fts_admin' } } } });

const reporte = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - Reporte', parameters: { jsCode: ${q(reporte)} } } });
const noSe = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Code - No se aplico', parameters: { jsCode: ${q(noSe)} } } });

export default workflow('memoria-db-migrate', 'memoria/db-migrate')
  .add(entrada).to(validar).to(bajar).to(estado).to(decidir)
  .to(aplicar_q.onTrue(aplicar.to(bitacora).to(readback).to(reporte)).onFalse(noSe));
`;
fs.writeFileSync(__dirname + '/db-migrate.sdk.js', code);
console.log(code.length);
