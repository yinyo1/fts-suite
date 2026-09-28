// ═══════════════════════════════════════════════════════════════════════════
// memoria-derivados · servicio aparte con ffmpeg (N9 y R5 de #328). SIN DESPLEGAR.
//
// POST /v1/procesar  {"sha256":"…"}   firmado igual que el receptor (x-fts-ts / x-fts-sig)
//   1. Lee el ORIGINAL del bucket y comprueba su sha256 (si no cuadra, no hace nada).
//   2. Video: versión comprimida (h264 720p) + miniatura → caliente/, ligadas con deriva_de.
//      El original sigue en frio/ intacto.
//   3. Derivados (transcripción, descripción, OCR) con el proveedor enchufable. Hoy: SIMULADO.
// GET /salud
//
// Roles: lee y registra archivos con memoria_captura (lo mismo que ya hace el receptor);
// escribe archivo_derivado con memoria_motor. Idempotente: re-procesar no duplica.
// ═══════════════════════════════════════════════════════════════════════════
import { SQL } from "bun";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { comprimirVideo } from "./ffmpeg";
import { proveedorDesdeEntorno, derivadosPara, type Proveedor } from "./proveedores";

const env = Bun.env;
export const VERSION = "derivados-2026.09.28-1";
const SECRETO = env.MEMORIA_HMAC_SECRET || "";
const VENTANA_MS = 5 * 60 * 1000;

export function configFaltante(): string[] {
  const f: string[] = [];
  if (SECRETO.length < 32 || SECRETO.includes("${{")) f.push("MEMORIA_HMAC_SECRET");
  for (const v of ["MEMORIA_CAPTURA_PASSWORD", "MEMORIA_MOTOR_PASSWORD"]) if (!env[v] || env[v]!.includes("${{")) f.push(v);
  if (env.ALMACEN !== "local" && !(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY && env.S3_ENDPOINT)) f.push("S3_*");
  return f;
}

const conn = (usuario: string, pw: string | undefined) => new SQL({ hostname: env.PGHOST || "fts-suite-db.railway.internal",
  port: Number(env.PGPORT || 5432), database: env.PGDATABASE || "fts_suite", username: usuario, password: pw || "", max: 2, idleTimeout: 30 });
export const captura = conn("memoria_captura", env.MEMORIA_CAPTURA_PASSWORD);
export const motor = conn("memoria_motor", env.MEMORIA_MOTOR_PASSWORD);

const s3 = env.ALMACEN === "local" ? null : new Bun.S3Client({ accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  bucket: env.S3_BUCKET, endpoint: env.S3_ENDPOINT, region: env.S3_REGION || "auto", virtualHostedStyle: env.S3_PATH_STYLE !== "1" });
const CONTENEDOR = env.S3_BUCKET || "local";
const LOCAL = env.ALMACEN_DIR || "/tmp/memoria-local";
async function leer(clave: string) { return s3 ? new Uint8Array(await s3.file(clave).arrayBuffer()) : new Uint8Array(await Bun.file(`${LOCAL}/${clave}`).arrayBuffer()); }
async function subir(clave: string, b: Uint8Array, mime: string) { if (s3) await s3.write(clave, b, { type: mime }); else await Bun.write(`${LOCAL}/${clave}`, b); }

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

async function registrar(bytes: Uint8Array, mime: string, rol: "comprimido" | "miniatura", derivaDe: string): Promise<string> {
  const h = sha256(bytes), clave = `caliente/${h.slice(0, 2)}/${h}`;
  const ya = await captura`SELECT 1 FROM memoria.archivo WHERE sha256 = ${h}`;
  if (!ya.length) await subir(clave, bytes, mime);
  await captura.begin(async (tx) => {
    await tx`INSERT INTO memoria.archivo (sha256, bytes, mime, clase, rol, deriva_de, nivel_objetivo)
             VALUES (${h}, ${bytes.length}, ${mime}, 'video', ${rol}, ${derivaDe}, 'caliente') ON CONFLICT (sha256) DO NOTHING`;
    await tx`INSERT INTO memoria.archivo_ubicacion (sha256, proveedor, contenedor, ruta, nivel, evento)
             VALUES (${h}, 'railway_bucket', ${CONTENEDOR}, ${clave}, 'caliente', 'alta') ON CONFLICT DO NOTHING`;
  });
  return h;
}

export async function procesar(sha: string, prov: Proveedor = proveedorDesdeEntorno()) {
  if (!/^[0-9a-f]{64}$/.test(sha)) return { status: 400, cuerpo: { ok: false, error: "SHA_INVALIDO" } };
  const a = (await motor`SELECT a.sha256, a.mime, a.rol, a.clase,
      (SELECT c.clase FROM memoria.archivo_clase c WHERE c.sha256 = a.sha256 ORDER BY c.en DESC LIMIT 1) AS clase_vigente,
      (SELECT u.ruta FROM memoria.archivo_ubicacion u WHERE u.sha256 = a.sha256 AND u.evento = 'alta' ORDER BY u.registrado_en DESC LIMIT 1) AS ruta
    FROM memoria.archivo a WHERE a.sha256 = ${sha}`)[0];
  if (!a) return { status: 404, cuerpo: { ok: false, error: "ARCHIVO_DESCONOCIDO" } };
  if (a.rol !== "original") return { status: 400, cuerpo: { ok: false, error: "NO_ES_ORIGINAL" } };
  if (!a.ruta) return { status: 409, cuerpo: { ok: false, error: "SIN_UBICACION" } };
  const bytes = await leer(a.ruta);
  if (sha256(bytes) !== sha) return { status: 409, cuerpo: { ok: false, error: "HUELLA_NO_CUADRA" } };   // nunca se procesa algo alterado

  const hechos: Record<string, unknown> = {};
  let paraDerivar = bytes;
  if (String(a.mime).startsWith("video/")) {
    const previos = await motor`SELECT sha256, rol FROM memoria.archivo WHERE deriva_de = ${sha}`;
    const comp = previos.find((p: any) => p.rol === "comprimido");
    if (comp) { hechos.comprimido = { sha256: comp.sha256, ya_existia: true }; paraDerivar = await leer(`caliente/${comp.sha256.slice(0, 2)}/${comp.sha256}`); }
    else {
      const r = await comprimirVideo(bytes);
      hechos.comprimido = { sha256: await registrar(r.comprimido, "video/mp4", "comprimido", sha), bytes: r.comprimido.length,
        perfil: r.perfil, original: r.original, salida: r.salida };
      // La miniatura del mensaje de WhatsApp manda; la nuestra sólo si no hay ninguna.
      if (!previos.some((p: any) => p.rol === "miniatura"))
        hechos.miniatura = { sha256: await registrar(r.miniatura, "image/jpeg", "miniatura", sha), bytes: r.miniatura.length };
      paraDerivar = r.comprimido;
    }
  }
  const derivados: unknown[] = [];
  for (const tipo of derivadosPara(String(a.mime), String(a.clase_vigente || a.clase))) {
    const ya = await motor`SELECT 1 FROM memoria.archivo_derivado WHERE sha256 = ${sha} AND tipo = ${tipo}
                            AND proveedor = ${prov.clave} AND version = ${prov.version}`;
    if (ya.length) { derivados.push({ tipo, ya_existia: true }); continue; }
    const d = await prov.derivar(tipo, paraDerivar, String(a.mime));
    await motor`INSERT INTO memoria.archivo_derivado (sha256, tipo, proveedor, version, idioma, contenido, confianza, costo_usd, es_simulado)
                VALUES (${sha}, ${d.tipo}, ${d.proveedor}, ${d.version}, ${d.idioma}, ${d.contenido}, ${d.confianza}, ${d.costo_usd}, ${d.es_simulado})
                ON CONFLICT (sha256, tipo, proveedor, version) DO NOTHING`;
    derivados.push({ tipo, proveedor: d.proveedor, es_simulado: d.es_simulado });
  }
  return { status: 200, cuerpo: { ok: true, sha256: sha, ...hechos, derivados } };
}

function firmaValida(ts: string | null, sig: string | null, cuerpo: string): boolean {
  if (!ts || !sig) return false;
  const t = Number(ts); if (!Number.isFinite(t) || Math.abs(Date.now() - t) > VENTANA_MS) return false;
  const e = Buffer.from(createHmac("sha256", SECRETO).update(`${ts}.${cuerpo}`).digest("hex"), "hex");
  const d = Buffer.from(String(sig).toLowerCase(), "hex");
  return d.length === e.length && timingSafeEqual(d, e);
}

export function iniciar(puerto = Number(env.PORT || 8080)) {
  return Bun.serve({ port: puerto, hostname: env.HOST || "::", maxRequestBodySize: 64 * 1024, async fetch(req) {
    const url = new URL(req.url);
    const json = (s: number, c: unknown) => Response.json(c, { status: s });
    try {
      if (req.method === "GET" && url.pathname === "/salud") return json(200, { ok: true, version: VERSION, config_faltante: configFaltante() });
      if (req.method !== "POST" || url.pathname !== "/v1/procesar") return json(404, { ok: false });
      if (configFaltante().length) return json(503, { ok: false, error: "CONFIG_INCOMPLETA" });
      const cuerpo = await req.text();
      if (!firmaValida(req.headers.get("x-fts-ts"), req.headers.get("x-fts-sig"), cuerpo)) return json(401, { ok: false });
      const r = await procesar(String(JSON.parse(cuerpo).sha256 || ""));
      return json(r.status, r.cuerpo);
    } catch (e) {
      console.error(`[error] ${url.pathname} ${String((e as Error).message).slice(0, 200)}`);
      return json(500, { ok: false, error: "ERROR_INTERNO" });
    }
  } });
}

if (import.meta.main) {
  iniciar();
  console.log(`[arranque] ${VERSION} config_faltante=${JSON.stringify(configFaltante())} proveedor=${env.DERIVADOS_PROVEEDOR || "simulado"}`);
}
