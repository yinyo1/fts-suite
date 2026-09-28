// ═══════════════════════════════════════════════════════════════════════════
// memoria-receptor · Captura de la Memoria de FTS (issue #328)
//
// Tonto a propósito: valida, calcula huella, sube binario, inserta y responde.
// Nada de IA, nada de Odoo, nada de n8n (D3). Sólo INSERT con el rol
// memoria_captura. Corre en Railway SIN dominio público (red privada).
//
// Rutas:
//   POST /v1/evento              evento normalizado, firmado HMAC (#123):
//                                 x-fts-ts (epoch ms) + x-fts-sig = hex(HMAC-SHA256(secreto, ts + "." + cuerpo))
//   POST /v1/evolution/:token    webhook de Evolution API. Evolution NO sabe firmar:
//                                 se autentica con un token derivado del secreto,
//                                 y sólo es alcanzable por red privada (N4 en DECISIONES-NOCHE.md).
//   GET  /salud                  estado sin secretos.
//
// Variables: PORT, PGHOST, PGPORT, PGDATABASE, MEMORIA_CAPTURA_PASSWORD,
//   MEMORIA_HMAC_SECRET, MEMORIA_PIMIENTA, S3_* (del bucket memoria-archivos),
//   AUTOPRUEBA=1 para correr la batería sintética al arrancar (F5).
//   ALMACEN=local sólo para pruebas en laptop (escribe a /tmp).
// ═══════════════════════════════════════════════════════════════════════════
import { SQL } from "bun";
import { createHmac, createHash, timingSafeEqual, randomUUID } from "node:crypto";

const env = Bun.env;
const VERSION = "receptor-2026.09.28-1";
const PORT = Number(env.PORT || 8080);
const SECRETO = env.MEMORIA_HMAC_SECRET || "";
const PIMIENTA = env.MEMORIA_PIMIENTA || "";
const VENTANA_MS = 5 * 60 * 1000;
const MAX_BYTES = 64 * 1024 * 1024;

function configOk(): string[] {
  const faltan: string[] = [];
  if (SECRETO.length < 32 || SECRETO.includes("${{")) faltan.push("MEMORIA_HMAC_SECRET");
  if (PIMIENTA.length < 32 || PIMIENTA.includes("${{")) faltan.push("MEMORIA_PIMIENTA");
  if (!env.MEMORIA_CAPTURA_PASSWORD || env.MEMORIA_CAPTURA_PASSWORD.includes("${{")) faltan.push("MEMORIA_CAPTURA_PASSWORD");
  if (env.ALMACEN !== "local" && !(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY && env.S3_ENDPOINT)) faltan.push("S3_*");
  return faltan;
}

// ── Base de datos ──────────────────────────────────────────────────────────
const sql = new SQL({
  hostname: env.PGHOST || "fts-suite-db.railway.internal",
  port: Number(env.PGPORT || 5432),
  database: env.PGDATABASE || "fts_suite",
  username: env.PGUSER || "memoria_captura",
  password: env.MEMORIA_CAPTURA_PASSWORD || "",
  max: 5,
  idleTimeout: 30,
});

// ── Almacén de binarios ────────────────────────────────────────────────────
const s3 = env.ALMACEN === "local" ? null : new Bun.S3Client({
  accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  bucket: env.S3_BUCKET, endpoint: env.S3_ENDPOINT, region: env.S3_REGION || "auto",
  virtualHostedStyle: env.S3_PATH_STYLE !== "1",
});
const CONTENEDOR = env.S3_BUCKET || "local";

async function subir(clave: string, bytes: Uint8Array, mime: string) {
  if (!s3) { await Bun.write(`/tmp/memoria-local/${clave}`, bytes); return; }
  await s3.write(clave, bytes, { type: mime });
}
async function leer(clave: string): Promise<Uint8Array> {
  if (!s3) return new Uint8Array(await Bun.file(`/tmp/memoria-local/${clave}`).arrayBuffer());
  return new Uint8Array(await s3.file(clave).arrayBuffer());
}

// ── Utilidades ─────────────────────────────────────────────────────────────
const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const hmac = (k: string, s: string) => createHmac("sha256", k).update(s).digest("hex");
export const tokenEvolution = () => hmac(SECRETO, "evolution-webhook").slice(0, 40);

function firmaValida(ts: string | null, sig: string | null, cuerpo: string): string | null {
  if (!ts || !sig) return "SIN_FIRMA";
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > VENTANA_MS) return "FUERA_DE_VENTANA";
  const esperado = Buffer.from(hmac(SECRETO, `${ts}.${cuerpo}`), "hex");
  const dado = Buffer.from(String(sig).toLowerCase(), "hex");
  if (dado.length !== esperado.length || !timingSafeEqual(dado, esperado)) return "FIRMA_INVALIDA";
  return null;
}

// Detección de tipo de canal por nombre (sugerencia; tipo_confirmado manda).
export function detectarTipo(nombre: string): { tipo: string; regla: string | null } {
  const n = (nombre || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/\bso\s?-?\d{4,5}\b/.test(n)) return { tipo: "proyecto", regla: "nombre:SO####" };
  if (/\b(levantamiento|lev|visita|oportunidad|cotizacion)\b/.test(n)) return { tipo: "levantamiento", regla: "nombre:levantamiento" };
  if (/\b(compras?|tickets?|gastos?|facturas?)\b/.test(n)) return { tipo: "compras", regla: "nombre:compras" };
  if (/\b(materiales?|requis?|requisiciones?|almacen)\b/.test(n)) return { tipo: "materiales", regla: "nombre:materiales" };
  return { tipo: "sin_asignar", regla: null };
}

const ACUSE = /^\s*(ok|oki|okey|okay|va|vale|sale|listo|gracias|grax|enterado|de acuerdo|si|sí|👍|👌|🙏|✅|👍🏻|👍🏼|👍🏽)[\s.!👍👌🙏✅]*$/i;

// ── Evento normalizado ─────────────────────────────────────────────────────
type Media = { base64: string; mime: string; nombre?: string | null; miniatura_base64?: string | null };
export type Normalizado = {
  fuente: string;
  canal: { id_externo: string; nombre?: string | null };
  id_origen: string;                 // id del mensaje en el origen
  tipo: string;                      // memoria.tipo_evento
  ocurrido_en: string;               // ISO
  autor: { id_externo: string; nombre?: string | null };
  texto?: string | null;
  media?: Media | null;
  ref_origen?: string | null;        // id_origen del mensaje al que se refiere (edición, borrado, reacción)
  metadatos?: Record<string, unknown>;
};

async function asegurarCanal(fuente: string, idExt: string, nombre: string | null) {
  const filas = await sql`SELECT id, estado_captura, nombre_actual, tipo_confirmado FROM memoria.canal
                          WHERE fuente = ${fuente} AND id_externo = ${idExt}`;
  if (filas.length) {
    const c = filas[0];
    if (nombre && nombre !== c.nombre_actual) {
      const d = detectarTipo(nombre);
      await sql`UPDATE memoria.canal SET nombre_actual = ${nombre},
                  tipo_detectado = ${d.tipo}, regla_deteccion = ${d.regla}
                WHERE id = ${c.id}`;
    }
    return c;
  }
  // Canales SINTÉTICOS: 'prueba-…' nacen capturando; 'pruebapend-…' nacen pendientes.
  // Un JID real de WhatsApp es numérico: nunca empieza así.
  const esPrueba = idExt.startsWith("prueba-") || idExt.startsWith("pruebapend-");
  const nom = nombre || idExt;
  const d = detectarTipo(nom);
  const ins = await sql`INSERT INTO memoria.canal (fuente, id_externo, nombre_actual, tipo_detectado, regla_deteccion, estado_captura, es_prueba)
     VALUES (${fuente}, ${idExt}, ${nom}, ${d.tipo}, ${d.regla}, ${idExt.startsWith("prueba-") ? "capturando" : "pendiente"}, ${esPrueba})
     ON CONFLICT (fuente, id_externo) DO NOTHING RETURNING id, estado_captura`;
  if (ins.length) return ins[0];
  return (await sql`SELECT id, estado_captura FROM memoria.canal WHERE fuente = ${fuente} AND id_externo = ${idExt}`)[0];
}

async function guardarArchivo(m: Media, tipo: string): Promise<string> {
  const bytes = Uint8Array.from(Buffer.from(m.base64, "base64"));
  if (bytes.length === 0) throw new Error("MEDIA_VACIA");
  if (bytes.length > MAX_BYTES) throw new Error("MEDIA_DEMASIADO_GRANDE");
  const h = sha256(bytes);
  const ya = await sql`SELECT sha256 FROM memoria.archivo WHERE sha256 = ${h}`;
  if (ya.length) return h;                              // dedupe por contenido
  const clase = tipo === "audio" ? "audio" : tipo === "video" ? "video" : tipo === "documento" ? "documento" : "media_general";
  // Ajuste 2 de #328: el video ORIGINAL va a frío desde el día uno.
  const frio = tipo === "video";
  const clave = `${frio ? "frio" : "caliente"}/${h.slice(0, 2)}/${h}`;
  await subir(clave, bytes, m.mime || "application/octet-stream");
  await sql.begin(async (tx) => {
    await tx`INSERT INTO memoria.archivo (sha256, bytes, mime, nombre_original, clase, nivel_objetivo)
             VALUES (${h}, ${bytes.length}, ${m.mime || "application/octet-stream"}, ${m.nombre || null}, ${clase}, ${frio ? "frio" : "caliente"})
             ON CONFLICT (sha256) DO NOTHING`;
    await tx`INSERT INTO memoria.archivo_ubicacion (sha256, proveedor, contenedor, ruta, nivel, evento)
             VALUES (${h}, 'railway_bucket', ${CONTENEDOR}, ${clave}, 'caliente', 'alta')`;
  });
  // Miniatura del video (la trae WhatsApp en el mensaje): ésa sí vive en caliente.
  if (frio && m.miniatura_base64) {
    const mb = Uint8Array.from(Buffer.from(m.miniatura_base64, "base64"));
    if (mb.length) {
      const mh = sha256(mb);
      const mk = `caliente/${mh.slice(0, 2)}/${mh}`;
      const e = await sql`SELECT 1 FROM memoria.archivo WHERE sha256 = ${mh}`;
      if (!e.length) {
        await subir(mk, mb, "image/jpeg");
        await sql.begin(async (tx) => {
          await tx`INSERT INTO memoria.archivo (sha256, bytes, mime, clase, rol, deriva_de, nivel_objetivo)
                   VALUES (${mh}, ${mb.length}, 'image/jpeg', 'video', 'miniatura', ${h}, 'caliente') ON CONFLICT DO NOTHING`;
          await tx`INSERT INTO memoria.archivo_ubicacion (sha256, proveedor, contenedor, ruta, nivel, evento)
                   VALUES (${mh}, 'railway_bucket', ${CONTENEDOR}, ${mk}, 'caliente', 'alta')`;
        });
      }
    }
  }
  return h;
}

export async function procesar(n: Normalizado) {
  if (!n?.canal?.id_externo || !n.id_origen || !n.tipo || !n.ocurrido_en || !n.autor?.id_externo)
    return { status: 400, cuerpo: { ok: false, error: "EVENTO_INCOMPLETO" } };
  const canal = await asegurarCanal(n.fuente, n.canal.id_externo, n.canal.nombre ?? null);
  if (canal.estado_captura !== "capturando") {
    await sql`UPDATE memoria.canal SET ultimo_evento = now() WHERE id = ${canal.id}`;
    return { status: 202, cuerpo: { ok: true, capturado: false, motivo: `CANAL_${String(canal.estado_captura).toUpperCase()}` } };
  }
  const huella = sha256(`${n.fuente}|${n.canal.id_externo}|${n.tipo}|${n.id_origen}`);
  const autorRef = `${n.fuente}:${hmac(PIMIENTA, n.autor.id_externo).slice(0, 32)}`;
  await sql`INSERT INTO memoria.identidad (autor_ref, fuente, valor_externo, nombre_mostrado)
            VALUES (${autorRef}, ${n.fuente}, ${n.autor.id_externo}, ${n.autor.nombre ?? null})
            ON CONFLICT (autor_ref) DO NOTHING`;

  const esRuido = ["reaccion", "sticker"].includes(n.tipo) || (n.tipo === "mensaje" && !!n.texto && ACUSE.test(n.texto));
  if (esRuido) {
    const r = await sql`INSERT INTO memoria.ruido_buffer (canal_id, tipo, autor_ref, ocurrido_en, huella, payload)
       VALUES (${canal.id}, ${n.tipo === "mensaje" ? "acuse" : n.tipo}, ${autorRef}, ${n.ocurrido_en}, ${huella},
               ${{ texto: n.texto ?? null, ref_origen: n.ref_origen ?? null }})
       ON CONFLICT (huella) DO NOTHING RETURNING huella`;
    await sql`UPDATE memoria.canal SET ultimo_evento = now() WHERE id = ${canal.id}`;
    return { status: 200, cuerpo: { ok: true, ruido: true, duplicado: r.length === 0 } };
  }

  // ¿Ya estaba? (antes de subir el binario, para no re-subir en reintentos)
  const previo = await sql`SELECT evento_id FROM memoria.huella WHERE huella = ${huella}`;
  if (previo.length) return { status: 200, cuerpo: { ok: true, duplicado: true, evento_id: previo[0].evento_id } };

  let archivo: string | null = null;
  const meta: Record<string, unknown> = { ...(n.metadatos || {}), id_origen: n.id_origen };
  if (n.media?.base64) {
    try { archivo = await guardarArchivo(n.media, n.tipo); }
    catch (e) { meta.media_pendiente = true; meta.media_error = String((e as Error).message).slice(0, 200); }
  } else if (["imagen", "audio", "video", "documento"].includes(n.tipo)) {
    meta.media_pendiente = true;
  }
  let eventoRef: string | null = null;
  if (n.ref_origen) {
    for (const t of ["mensaje", "imagen", "audio", "video", "documento", "ubicacion", "contacto"]) {
      const f = await sql`SELECT evento_id FROM memoria.huella WHERE huella = ${sha256(`${n.fuente}|${n.canal.id_externo}|${t}|${n.ref_origen}`)}`;
      if (f.length) { eventoRef = f[0].evento_id; break; }
    }
    if (!eventoRef) meta.ref_origen_no_encontrado = n.ref_origen;
  }
  const id = randomUUID();
  let insertado = false;
  await sql.begin(async (tx) => {
    const h = await tx`INSERT INTO memoria.huella (huella, evento_id, ocurrido_en)
                       VALUES (${huella}, ${id}, ${n.ocurrido_en}) ON CONFLICT (huella) DO NOTHING RETURNING huella`;
    if (!h.length) return;
    await tx`INSERT INTO memoria.evento (id, ocurrido_en, fuente, tipo, canal_id, autor_ref, texto, archivo_sha256, evento_ref, metadatos, huella)
             VALUES (${id}, ${n.ocurrido_en}, ${n.fuente}, ${n.tipo}, ${canal.id}, ${autorRef}, ${n.texto ?? null},
                     ${archivo}, ${eventoRef}, ${meta}, ${huella})`;
    insertado = true;
  });
  await sql`UPDATE memoria.canal SET ultimo_evento = now() WHERE id = ${canal.id}`;
  return { status: 200, cuerpo: { ok: true, duplicado: !insertado, evento_id: insertado ? id : null, archivo_sha256: archivo } };
}

// ── Traducción de Evolution API v2 a evento normalizado ────────────────────
function unwrap(m: any): any {
  if (!m) return m;
  return m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message
    || m.documentWithCaptionMessage?.message || m;
}
export function desdeEvolution(body: any): Normalizado[] | { sistema: { id_externo: string; nombre: string }[] } | null {
  const ev = String(body?.event || "").toLowerCase().replace(/_/g, ".");
  if (ev === "groups.upsert" || ev === "groups.update" || ev === "group.update") {
    const arr = Array.isArray(body.data) ? body.data : [body.data];
    return { sistema: arr.filter((g: any) => g?.id && g?.subject).map((g: any) => ({ id_externo: g.id, nombre: g.subject })) };
  }
  if (ev !== "messages.upsert") return null;
  const d = body.data || {};
  const jid: string = d.key?.remoteJid || "";
  if (!jid.endsWith("@g.us")) return [];            // sólo grupos; nunca chats 1:1
  const m = unwrap(d.message) || {};
  const ts = Number(d.messageTimestamp || 0);
  const base: Omit<Normalizado, "tipo"> = {
    fuente: "whatsapp",
    canal: { id_externo: jid, nombre: body?.groupSubject || null },
    id_origen: d.key?.id,
    ocurrido_en: new Date((ts > 1e12 ? ts : ts * 1000) || Date.now()).toISOString(),
    autor: { id_externo: d.key?.participant || d.participant || "desconocido", nombre: d.pushName || null },
    metadatos: { message_type: d.messageType || null, instancia: body.instance || null },
  };
  const b64 = m.base64 || d.base64 || body.base64 || null;
  const pm = m.protocolMessage;
  if (pm) {
    if (pm.type === 0 || pm.type === "REVOKE") return [{ ...base, tipo: "borrado_en_origen", ref_origen: pm.key?.id }];
    if (pm.type === 14 || pm.type === "MESSAGE_EDIT") {
      const em = unwrap(pm.editedMessage) || {};
      return [{ ...base, tipo: "edicion", ref_origen: pm.key?.id, texto: em.conversation || em.extendedTextMessage?.text || null }];
    }
    return [];
  }
  if (m.editedMessage) {
    const em = unwrap(m.editedMessage.message?.protocolMessage?.editedMessage) || {};
    return [{ ...base, tipo: "edicion", ref_origen: m.editedMessage.message?.protocolMessage?.key?.id, texto: em.conversation || em.extendedTextMessage?.text || null }];
  }
  if (m.reactionMessage) return [{ ...base, tipo: "reaccion", texto: m.reactionMessage.text || null, ref_origen: m.reactionMessage.key?.id }];
  if (m.stickerMessage) return [{ ...base, tipo: "sticker" }];
  if (m.conversation || m.extendedTextMessage) return [{ ...base, tipo: "mensaje", texto: m.conversation || m.extendedTextMessage?.text || "" }];
  if (m.imageMessage) return [{ ...base, tipo: "imagen", texto: m.imageMessage.caption || null, media: b64 ? { base64: b64, mime: m.imageMessage.mimetype || "image/jpeg" } : null }];
  if (m.audioMessage) return [{ ...base, tipo: "audio", media: b64 ? { base64: b64, mime: m.audioMessage.mimetype || "audio/ogg" } : null,
    metadatos: { ...base.metadatos, duracion_s: m.audioMessage.seconds || null, nota_de_voz: !!m.audioMessage.ptt } }];
  if (m.videoMessage) return [{ ...base, tipo: "video", texto: m.videoMessage.caption || null,
    media: b64 ? { base64: b64, mime: m.videoMessage.mimetype || "video/mp4", miniatura_base64: m.videoMessage.jpegThumbnail || null } : null,
    metadatos: { ...base.metadatos, duracion_s: m.videoMessage.seconds || null } }];
  if (m.documentMessage) return [{ ...base, tipo: "documento", texto: m.documentMessage.caption || null,
    media: b64 ? { base64: b64, mime: m.documentMessage.mimetype || "application/octet-stream", nombre: m.documentMessage.fileName || null } : null }];
  if (m.locationMessage) return [{ ...base, tipo: "ubicacion", metadatos: { ...base.metadatos, lat: m.locationMessage.degreesLatitude, lng: m.locationMessage.degreesLongitude } }];
  if (m.contactMessage) return [{ ...base, tipo: "contacto", texto: m.contactMessage.displayName || null }];
  return [];
}

// ── Servidor ───────────────────────────────────────────────────────────────
const json = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

export const servidor = Bun.serve({
  port: PORT,
  hostname: env.HOST || "::",   // Railway: la red privada es IPv6
  maxRequestBodySize: 100 * 1024 * 1024,
  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (req.method === "GET" && url.pathname === "/salud") {
        let base = "desconocida";
        try { await sql`SELECT 1`; base = "ok"; } catch (e) { base = "error: " + String((e as Error).message).slice(0, 80); }
        return json(200, { ok: true, version: VERSION, config_faltante: configOk(), base });
      }
      if (req.method !== "POST") return json(405, { ok: false });
      const cuerpo = await req.text();
      if (url.pathname === "/v1/evento") {
        const motivo = firmaValida(req.headers.get("x-fts-ts"), req.headers.get("x-fts-sig"), cuerpo);
        if (motivo) { console.warn(`[rechazo] ${motivo} ${url.pathname}`); return json(401, { ok: false }); }
        const r = await procesar(JSON.parse(cuerpo));
        return json(r.status, r.cuerpo);
      }
      if (url.pathname.startsWith("/v1/evolution/")) {
        const dado = Buffer.from(url.pathname.slice("/v1/evolution/".length));
        const esp = Buffer.from(tokenEvolution());
        if (dado.length !== esp.length || !timingSafeEqual(dado, esp)) { console.warn("[rechazo] TOKEN_EVOLUTION"); return json(401, { ok: false }); }
        const body = JSON.parse(cuerpo);
        const t = desdeEvolution(body);
        if (!t) return json(200, { ok: true, ignorado: true });
        if (!Array.isArray(t)) {
          for (const g of t.sistema) await asegurarCanal("whatsapp", g.id_externo, g.nombre);
          return json(200, { ok: true, canales: t.sistema.length });
        }
        const res = [];
        for (const n of t) res.push((await procesar(n)).cuerpo);
        return json(200, { ok: true, resultados: res });
      }
      return json(404, { ok: false });
    } catch (e) {
      // Nunca se devuelve el cuerpo ni las variables en un error.
      console.error(`[error] ${url.pathname.startsWith("/v1/evolution/") ? "/v1/evolution/…" : url.pathname} ${String((e as Error).message).slice(0, 200)}`);
      return json(500, { ok: false, error: "ERROR_INTERNO" });
    }
  },
});

// Huellas cortas de los secretos (sha256, 8 hex): sirven para comprobar que un
// secreto NO cambió entre despliegues sin revelar nada de él.
const fp = (s: string) => sha256(s).slice(0, 8);
console.log(`[arranque] ${VERSION} puerto=${PORT} config_faltante=${JSON.stringify(configOk())} token_evolution_len=${tokenEvolution().length} fp_hmac=${fp(SECRETO)} fp_pimienta=${fp(PIMIENTA)} fp_pw=${fp(env.MEMORIA_CAPTURA_PASSWORD || "")}`);

// Verificador SCRAM-SHA-256 de la contraseña de memoria_captura (N5 en DECISIONES-NOCHE.md).
// Es lo que Postgres guarda en pg_authid: un hash salado e iterado. Con él se
// puede ejecutar ALTER ROLE … PASSWORD '<verificador>' sin que la contraseña
// salga jamás de las variables de Railway. Sólo se imprime si se pide.
if (env.MOSTRAR_VERIFICADOR === "1" && env.MEMORIA_CAPTURA_PASSWORD) {
  const { pbkdf2Sync, randomBytes } = await import("node:crypto");
  const sal = randomBytes(16), it = 4096;
  const salted = pbkdf2Sync(env.MEMORIA_CAPTURA_PASSWORD.normalize("NFKC"), sal, it, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  console.log(`[verificador] memoria_captura SCRAM-SHA-256$${it}:${sal.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`);
}

if (env.AUTOPRUEBA === "1") {
  const { autoprueba } = await import("./autoprueba.ts");
  setTimeout(() => autoprueba({ sql, leer, puerto: PORT, secreto: SECRETO, tokenEvolution: tokenEvolution() })
    .catch((e) => console.error("[autoprueba] fallo", String(e?.message || e))), 1500);
}
