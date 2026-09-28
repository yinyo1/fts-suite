// @bun
var __defProp = Object.defineProperty;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __require = import.meta.require;

// autoprueba.ts
var exports_autoprueba = {};
__export(exports_autoprueba, {
  autoprueba: () => autoprueba
});
import { createHmac, createHash, randomUUID } from "crypto";
function bytesSinteticos(semilla, n, cabecera = []) {
  let a = semilla >>> 0;
  const out = new Uint8Array(n);
  out.set(cabecera);
  for (let i = cabecera.length;i < n; i++) {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    out[i] = (t ^ t >>> 14) >>> 0 & 255;
  }
  return out;
}
function evo(canal, id, i, message, extra = {}) {
  return { event: "messages.upsert", instance: "prueba", data: {
    key: { remoteJid: canal.id, fromMe: false, id, participant: AUTOR(i) },
    pushName: `Persona Sint\xE9tica ${i % 4}`,
    message,
    messageTimestamp: BASE_TS + i * 60,
    ...extra
  } };
}
async function autoprueba(ctx) {
  const corrida = randomUUID();
  const url = (p) => `http://127.0.0.1:${ctx.puerto}${p}`;
  const resultados = [];
  const anota = (caso, esperado, obtenido) => {
    const e = String(esperado), o = String(obtenido);
    resultados.push({ caso, esperado: e, obtenido: o, ok: e === o });
  };
  const postEvo = async (body, token = ctx.tokenEvolution) => {
    const r = await fetch(url(`/v1/evolution/${token}`), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
  const postFirmado = async (obj, firmar = true, tsDesfase = 0) => {
    const cuerpo = JSON.stringify(obj);
    const ts = String(Date.now() + tsDesfase);
    const sig = firmar ? createHmac("sha256", ctx.secreto).update(`${ts}.${cuerpo}`).digest("hex") : "00".repeat(32);
    const r = await fetch(url("/v1/evento"), { method: "POST", headers: { "content-type": "application/json", "x-fts-ts": ts, "x-fts-sig": sig }, body: cuerpo });
    return r.status;
  };
  for (const c of [CANAL_A, CANAL_B, CANAL_C, CANAL_P])
    await postEvo({ event: "groups.upsert", instance: "prueba", data: [{ id: c.id, subject: c.nombre }] });
  const shas = [];
  let n200 = 0, nTot = 0;
  const cuenta = (r) => {
    nTot++;
    if (r.status === 200)
      n200++;
  };
  for (let i = 0;i < 20; i++) {
    cuenta(await postEvo(evo(CANAL_A, `PRB-TXT-${i}`, i, { conversation: `Mensaje sint\xE9tico ${i}: avance de prueba, sin datos reales.` })));
    const img = bytesSinteticos(1000 + i, 2048, JPG);
    const r1 = await postEvo(evo(CANAL_A, `PRB-IMG-${i}`, i, { imageMessage: { caption: `Foto sint\xE9tica ${i}`, mimetype: "image/jpeg" }, base64: b64(img) }));
    cuenta(r1);
    if (i < 3)
      shas.push({ clave: `caliente/${sha256(img).slice(0, 2)}/${sha256(img)}`, sha: sha256(img) });
    const aud = bytesSinteticos(2000 + i, 1500, OGG);
    const r2 = await postEvo(evo(CANAL_A, `PRB-AUD-${i}`, i, { audioMessage: { mimetype: "audio/ogg; codecs=opus", seconds: 7, ptt: true }, base64: b64(aud) }));
    cuenta(r2);
    if (i < 1)
      shas.push({ clave: `caliente/${sha256(aud).slice(0, 2)}/${sha256(aud)}`, sha: sha256(aud) });
    const vid = bytesSinteticos(3000 + i, 4096, MP4), thumb = bytesSinteticos(3500 + i, 300, JPG);
    const r3 = await postEvo(evo(CANAL_A, `PRB-VID-${i}`, i, { videoMessage: { caption: `Video sint\xE9tico ${i}`, mimetype: "video/mp4", seconds: 12, jpegThumbnail: b64(thumb) }, base64: b64(vid) }));
    cuenta(r3);
    if (i < 1)
      shas.push({ clave: `frio/${sha256(vid).slice(0, 2)}/${sha256(vid)}`, sha: sha256(vid) });
    cuenta(await postEvo(evo(CANAL_A, `PRB-DOC-${i}`, i, { documentMessage: { fileName: `documento-sintetico-${i}.pdf`, mimetype: "application/pdf" }, base64: b64(bytesSinteticos(4000 + i, 1024, PDF)) })));
    cuenta(await postEvo(evo(CANAL_A, `PRB-REA-${i}`, i, { reactionMessage: { text: "\uD83D\uDC4D", key: { id: `PRB-TXT-${i}` } } })));
    cuenta(await postEvo(evo(CANAL_A, `PRB-EDI-${i}`, i, { protocolMessage: { type: 14, key: { id: `PRB-TXT-${i}` }, editedMessage: { conversation: `Mensaje sint\xE9tico ${i} (editado)` } } })));
    cuenta(await postEvo(evo(CANAL_A, `PRB-BOR-${i}`, i, { protocolMessage: { type: 0, key: { id: `PRB-TXT-${i}` } } })));
  }
  anota("envios_aceptados", "160/160", `${n200}/${nTot}`);
  let dup = 0;
  for (let i = 0;i < 20; i++) {
    const r = await postEvo(evo(CANAL_A, `PRB-TXT-${i}`, i, { conversation: `Mensaje sint\xE9tico ${i}: avance de prueba, sin datos reales.` }));
    if (r.json?.resultados?.[0]?.duplicado === true)
      dup++;
  }
  anota("reenvio_20_textos_todos_duplicados", 20, dup);
  const img0 = bytesSinteticos(1000, 2048, JPG);
  const rB = await postEvo(evo(CANAL_B, "PRB-IMG-B-0", 0, { imageMessage: { caption: "Ticket sint\xE9tico (misma foto)", mimetype: "image/jpeg" }, base64: b64(img0) }));
  anota("misma_foto_en_B_mismo_sha", sha256(img0), rB.json?.resultados?.[0]?.archivo_sha256 ?? rB.json?.resultados?.[0]?.duplicado);
  const rP = await postEvo(evo(CANAL_P, "PRB-PEN-0", 0, { conversation: "Mensaje en grupo pendiente (sint\xE9tico)" }));
  anota("canal_pendiente_no_captura", "CANAL_PENDIENTE", rP.json?.resultados?.[0]?.motivo);
  let rehashOk = 0;
  for (const s of shas.slice(0, 5)) {
    try {
      if (sha256(await ctx.leer(s.clave)) === s.sha)
        rehashOk++;
    } catch {}
  }
  anota("rehash_5_objetos_bucket", 5, rehashOk);
  for (const [caso, q] of [
    ["update_con_captura_falla", "UPDATE memoria.evento SET texto = 'x' WHERE false"],
    ["delete_con_captura_falla", "DELETE FROM memoria.evento WHERE false"],
    ["update_huella_con_captura_falla", "UPDATE memoria.huella SET evento_id = evento_id WHERE false"]
  ]) {
    let obtenido = "SIN_ERROR";
    try {
      await ctx.sql.unsafe(q);
    } catch (e) {
      obtenido = /permission denied/i.test(String(e?.message)) ? "PERMISO_DENEGADO" : "OTRO_ERROR";
    }
    anota(caso, "PERMISO_DENEGADO", obtenido);
  }
  const canonico = {
    fuente: "prueba",
    canal: { id_externo: "prueba-canonico-d", nombre: "Canal can\xF3nico sint\xE9tico" },
    id_origen: "PRB-CAN-0",
    tipo: "mensaje",
    ocurrido_en: new Date(BASE_TS * 1000).toISOString(),
    autor: { id_externo: "prueba-autor-x" },
    texto: "Evento can\xF3nico firmado (sint\xE9tico)"
  };
  anota("firma_valida_200", 200, await postFirmado(canonico));
  anota("firma_invalida_401", 401, await postFirmado(canonico, false));
  anota("firma_vieja_401", 401, await postFirmado(canonico, true, -10 * 60 * 1000));
  anota("token_evolution_falso_401", 401, (await postEvo(evo(CANAL_A, "PRB-X", 0, { conversation: "x" }), "0".repeat(40))).status);
  const r1a1 = await postEvo({ event: "messages.upsert", instance: "prueba", data: { key: { remoteJid: "prueba-persona@s.whatsapp.net", id: "PRB-1A1" }, message: { conversation: "privado" }, messageTimestamp: BASE_TS } });
  anota("chat_1a1_ignorado", 0, (r1a1.json?.resultados || []).length);
  for (const r of resultados)
    await ctx.sql`INSERT INTO memoria.prueba_corrida (corrida, suite, caso, esperado, obtenido, ok) VALUES (${corrida}, 'captura', ${r.caso}, ${r.esperado}, ${r.obtenido}, ${r.ok})`;
  const okN = resultados.filter((r) => r.ok).length;
  console.log(`[autoprueba] corrida=${corrida} ${okN}/${resultados.length} OK`);
  for (const r of resultados)
    console.log(`[autoprueba] ${r.ok ? "OK " : "FALLA"} ${r.caso} esperado=${r.esperado} obtenido=${r.obtenido}`);
  return { corrida, ok: okN, total: resultados.length };
}
var sha256 = (b) => createHash("sha256").update(b).digest("hex"), JPG, OGG, MP4, PDF, b64 = (u) => Buffer.from(u).toString("base64"), BASE_TS, CANAL_A, CANAL_B, CANAL_C, CANAL_P, AUTOR = (i) => `prueba-autor-${i % 4}@s.whatsapp.net`;
var init_autoprueba = __esm(() => {
  JPG = [255, 216, 255, 224];
  OGG = [79, 103, 103, 83];
  MP4 = [0, 0, 0, 24, 102, 116, 121, 112];
  PDF = [37, 80, 68, 70];
  BASE_TS = Date.UTC(2026, 8, 27, 15, 0, 0) / 1000;
  CANAL_A = { id: "prueba-proyecto-a@g.us", nombre: "SO99001 Proyecto Sint\xE9tico A" };
  CANAL_B = { id: "prueba-compras-b@g.us", nombre: "Compras tickets USA (prueba)" };
  CANAL_C = { id: "prueba-materiales-c@g.us", nombre: "Materiales obra (prueba)" };
  CANAL_P = { id: "pruebapend-general-p@g.us", nombre: "Grupo general sint\xE9tico pendiente" };
});

// index.ts
var {SQL } = globalThis.Bun;
import { createHmac as createHmac2, createHash as createHash2, timingSafeEqual, randomUUID as randomUUID2 } from "crypto";
var env = Bun.env;
var VERSION = "receptor-2026.09.28-1";
var PORT = Number(env.PORT || 8080);
var SECRETO = env.MEMORIA_HMAC_SECRET || "";
var PIMIENTA = env.MEMORIA_PIMIENTA || "";
var VENTANA_MS = 5 * 60 * 1000;
var MAX_BYTES = 64 * 1024 * 1024;
function configOk() {
  const faltan = [];
  if (SECRETO.length < 32 || SECRETO.includes("${{"))
    faltan.push("MEMORIA_HMAC_SECRET");
  if (PIMIENTA.length < 32 || PIMIENTA.includes("${{"))
    faltan.push("MEMORIA_PIMIENTA");
  if (!env.MEMORIA_CAPTURA_PASSWORD || env.MEMORIA_CAPTURA_PASSWORD.includes("${{"))
    faltan.push("MEMORIA_CAPTURA_PASSWORD");
  if (env.ALMACEN !== "local" && !(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY && env.S3_ENDPOINT))
    faltan.push("S3_*");
  return faltan;
}
var sql = new SQL({
  hostname: env.PGHOST || "fts-suite-db.railway.internal",
  port: Number(env.PGPORT || 5432),
  database: env.PGDATABASE || "fts_suite",
  username: env.PGUSER || "memoria_captura",
  password: env.MEMORIA_CAPTURA_PASSWORD || "",
  max: 5,
  idleTimeout: 30
});
var s3 = env.ALMACEN === "local" ? null : new Bun.S3Client({
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  bucket: env.S3_BUCKET,
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION || "auto",
  virtualHostedStyle: env.S3_PATH_STYLE !== "1"
});
var CONTENEDOR = env.S3_BUCKET || "local";
async function subir(clave, bytes, mime) {
  if (!s3) {
    await Bun.write(`/tmp/memoria-local/${clave}`, bytes);
    return;
  }
  await s3.write(clave, bytes, { type: mime });
}
async function leer(clave) {
  if (!s3)
    return new Uint8Array(await Bun.file(`/tmp/memoria-local/${clave}`).arrayBuffer());
  return new Uint8Array(await s3.file(clave).arrayBuffer());
}
var sha2562 = (b) => createHash2("sha256").update(b).digest("hex");
var hmac = (k, s) => createHmac2("sha256", k).update(s).digest("hex");
var tokenEvolution = () => hmac(SECRETO, "evolution-webhook").slice(0, 40);
function firmaValida(ts, sig, cuerpo) {
  if (!ts || !sig)
    return "SIN_FIRMA";
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > VENTANA_MS)
    return "FUERA_DE_VENTANA";
  const esperado = Buffer.from(hmac(SECRETO, `${ts}.${cuerpo}`), "hex");
  const dado = Buffer.from(String(sig).toLowerCase(), "hex");
  if (dado.length !== esperado.length || !timingSafeEqual(dado, esperado))
    return "FIRMA_INVALIDA";
  return null;
}
function detectarTipo(nombre) {
  const n = (nombre || "").normalize("NFD").replace(/[\u0300-\u036F]/g, "").toLowerCase();
  if (/\bso\s?-?\d{4,5}\b/.test(n))
    return { tipo: "proyecto", regla: "nombre:SO####" };
  if (/\b(levantamiento|lev|visita|oportunidad|cotizacion)\b/.test(n))
    return { tipo: "levantamiento", regla: "nombre:levantamiento" };
  if (/\b(compras?|tickets?|gastos?|facturas?)\b/.test(n))
    return { tipo: "compras", regla: "nombre:compras" };
  if (/\b(materiales?|requis?|requisiciones?|almacen)\b/.test(n))
    return { tipo: "materiales", regla: "nombre:materiales" };
  return { tipo: "sin_asignar", regla: null };
}
var ACUSE = /^\s*(ok|oki|okey|okay|va|vale|sale|listo|gracias|grax|enterado|de acuerdo|si|s\u00ED|\uD83D\uDC4D|\uD83D\uDC4C|\uD83D\uDE4F|\u2705|\uD83D\uDC4D\uD83C\uDFFB|\uD83D\uDC4D\uD83C\uDFFC|\uD83D\uDC4D\uD83C\uDFFD)[\s.!\uD83D\uDC4D\uD83D\uDC4C\uD83D\uDE4F\u2705]*$/i;
async function asegurarCanal(fuente, idExt, nombre) {
  const filas = await sql`SELECT id, estado_captura, nombre_actual, tipo_confirmado FROM memoria.canal
                          WHERE fuente = ${fuente} AND id_externo = ${idExt}`;
  if (filas.length) {
    const c = filas[0];
    if (nombre && nombre !== c.nombre_actual) {
      const d2 = detectarTipo(nombre);
      await sql`UPDATE memoria.canal SET nombre_actual = ${nombre},
                  tipo_detectado = ${d2.tipo}, regla_deteccion = ${d2.regla}
                WHERE id = ${c.id}`;
    }
    return c;
  }
  const esPrueba = idExt.startsWith("prueba-") || idExt.startsWith("pruebapend-");
  const nom = nombre || idExt;
  const d = detectarTipo(nom);
  const ins = await sql`INSERT INTO memoria.canal (fuente, id_externo, nombre_actual, tipo_detectado, regla_deteccion, estado_captura, es_prueba)
     VALUES (${fuente}, ${idExt}, ${nom}, ${d.tipo}, ${d.regla}, ${idExt.startsWith("prueba-") ? "capturando" : "pendiente"}, ${esPrueba})
     ON CONFLICT (fuente, id_externo) DO NOTHING RETURNING id, estado_captura`;
  if (ins.length)
    return ins[0];
  return (await sql`SELECT id, estado_captura FROM memoria.canal WHERE fuente = ${fuente} AND id_externo = ${idExt}`)[0];
}
async function guardarArchivo(m, tipo) {
  const bytes = Uint8Array.from(Buffer.from(m.base64, "base64"));
  if (bytes.length === 0)
    throw new Error("MEDIA_VACIA");
  if (bytes.length > MAX_BYTES)
    throw new Error("MEDIA_DEMASIADO_GRANDE");
  const h = sha2562(bytes);
  const ya = await sql`SELECT sha256 FROM memoria.archivo WHERE sha256 = ${h}`;
  if (ya.length)
    return h;
  const clase = tipo === "audio" ? "audio" : tipo === "video" ? "video" : tipo === "documento" ? "documento" : "media_general";
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
  if (frio && m.miniatura_base64) {
    const mb = Uint8Array.from(Buffer.from(m.miniatura_base64, "base64"));
    if (mb.length) {
      const mh = sha2562(mb);
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
async function procesar(n) {
  if (!n?.canal?.id_externo || !n.id_origen || !n.tipo || !n.ocurrido_en || !n.autor?.id_externo)
    return { status: 400, cuerpo: { ok: false, error: "EVENTO_INCOMPLETO" } };
  const canal = await asegurarCanal(n.fuente, n.canal.id_externo, n.canal.nombre ?? null);
  if (canal.estado_captura !== "capturando") {
    await sql`UPDATE memoria.canal SET ultimo_evento = now() WHERE id = ${canal.id}`;
    return { status: 202, cuerpo: { ok: true, capturado: false, motivo: `CANAL_${String(canal.estado_captura).toUpperCase()}` } };
  }
  const huella = sha2562(`${n.fuente}|${n.canal.id_externo}|${n.tipo}|${n.id_origen}`);
  const autorRef = `${n.fuente}:${hmac(PIMIENTA, n.autor.id_externo).slice(0, 32)}`;
  await sql`INSERT INTO memoria.identidad (autor_ref, fuente, valor_externo, nombre_mostrado)
            VALUES (${autorRef}, ${n.fuente}, ${n.autor.id_externo}, ${n.autor.nombre ?? null})
            ON CONFLICT (autor_ref) DO NOTHING`;
  const esRuido = ["reaccion", "sticker"].includes(n.tipo) || n.tipo === "mensaje" && !!n.texto && ACUSE.test(n.texto);
  if (esRuido) {
    const r = await sql`INSERT INTO memoria.ruido_buffer (canal_id, tipo, autor_ref, ocurrido_en, huella, payload)
       VALUES (${canal.id}, ${n.tipo === "mensaje" ? "acuse" : n.tipo}, ${autorRef}, ${n.ocurrido_en}, ${huella},
               ${{ texto: n.texto ?? null, ref_origen: n.ref_origen ?? null }})
       ON CONFLICT (huella) DO NOTHING RETURNING huella`;
    await sql`UPDATE memoria.canal SET ultimo_evento = now() WHERE id = ${canal.id}`;
    return { status: 200, cuerpo: { ok: true, ruido: true, duplicado: r.length === 0 } };
  }
  const previo = await sql`SELECT evento_id FROM memoria.huella WHERE huella = ${huella}`;
  if (previo.length)
    return { status: 200, cuerpo: { ok: true, duplicado: true, evento_id: previo[0].evento_id } };
  let archivo = null;
  const meta = { ...n.metadatos || {}, id_origen: n.id_origen };
  if (n.media?.base64) {
    try {
      archivo = await guardarArchivo(n.media, n.tipo);
    } catch (e) {
      meta.media_pendiente = true;
      meta.media_error = String(e.message).slice(0, 200);
    }
  } else if (["imagen", "audio", "video", "documento"].includes(n.tipo)) {
    meta.media_pendiente = true;
  }
  let eventoRef = null;
  if (n.ref_origen) {
    for (const t of ["mensaje", "imagen", "audio", "video", "documento", "ubicacion", "contacto"]) {
      const f = await sql`SELECT evento_id FROM memoria.huella WHERE huella = ${sha2562(`${n.fuente}|${n.canal.id_externo}|${t}|${n.ref_origen}`)}`;
      if (f.length) {
        eventoRef = f[0].evento_id;
        break;
      }
    }
    if (!eventoRef)
      meta.ref_origen_no_encontrado = n.ref_origen;
  }
  const id = randomUUID2();
  let insertado = false;
  await sql.begin(async (tx) => {
    const h = await tx`INSERT INTO memoria.huella (huella, evento_id, ocurrido_en)
                       VALUES (${huella}, ${id}, ${n.ocurrido_en}) ON CONFLICT (huella) DO NOTHING RETURNING huella`;
    if (!h.length)
      return;
    await tx`INSERT INTO memoria.evento (id, ocurrido_en, fuente, tipo, canal_id, autor_ref, texto, archivo_sha256, evento_ref, metadatos, huella)
             VALUES (${id}, ${n.ocurrido_en}, ${n.fuente}, ${n.tipo}, ${canal.id}, ${autorRef}, ${n.texto ?? null},
                     ${archivo}, ${eventoRef}, ${meta}, ${huella})`;
    insertado = true;
  });
  await sql`UPDATE memoria.canal SET ultimo_evento = now() WHERE id = ${canal.id}`;
  return { status: 200, cuerpo: { ok: true, duplicado: !insertado, evento_id: insertado ? id : null, archivo_sha256: archivo } };
}
function unwrap(m) {
  if (!m)
    return m;
  return m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m.documentWithCaptionMessage?.message || m;
}
function desdeEvolution(body) {
  const ev = String(body?.event || "").toLowerCase().replace(/_/g, ".");
  if (ev === "groups.upsert" || ev === "groups.update" || ev === "group.update") {
    const arr = Array.isArray(body.data) ? body.data : [body.data];
    return { sistema: arr.filter((g) => g?.id && g?.subject).map((g) => ({ id_externo: g.id, nombre: g.subject })) };
  }
  if (ev !== "messages.upsert")
    return null;
  const d = body.data || {};
  const jid = d.key?.remoteJid || "";
  if (!jid.endsWith("@g.us"))
    return [];
  const m = unwrap(d.message) || {};
  const ts = Number(d.messageTimestamp || 0);
  const base = {
    fuente: "whatsapp",
    canal: { id_externo: jid, nombre: body?.groupSubject || null },
    id_origen: d.key?.id,
    ocurrido_en: new Date((ts > 1000000000000 ? ts : ts * 1000) || Date.now()).toISOString(),
    autor: { id_externo: d.key?.participant || d.participant || "desconocido", nombre: d.pushName || null },
    metadatos: { message_type: d.messageType || null, instancia: body.instance || null }
  };
  const b642 = m.base64 || d.base64 || body.base64 || null;
  const pm = m.protocolMessage;
  if (pm) {
    if (pm.type === 0 || pm.type === "REVOKE")
      return [{ ...base, tipo: "borrado_en_origen", ref_origen: pm.key?.id }];
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
  if (m.reactionMessage)
    return [{ ...base, tipo: "reaccion", texto: m.reactionMessage.text || null, ref_origen: m.reactionMessage.key?.id }];
  if (m.stickerMessage)
    return [{ ...base, tipo: "sticker" }];
  if (m.conversation || m.extendedTextMessage)
    return [{ ...base, tipo: "mensaje", texto: m.conversation || m.extendedTextMessage?.text || "" }];
  if (m.imageMessage)
    return [{ ...base, tipo: "imagen", texto: m.imageMessage.caption || null, media: b642 ? { base64: b642, mime: m.imageMessage.mimetype || "image/jpeg" } : null }];
  if (m.audioMessage)
    return [{
      ...base,
      tipo: "audio",
      media: b642 ? { base64: b642, mime: m.audioMessage.mimetype || "audio/ogg" } : null,
      metadatos: { ...base.metadatos, duracion_s: m.audioMessage.seconds || null, nota_de_voz: !!m.audioMessage.ptt }
    }];
  if (m.videoMessage)
    return [{
      ...base,
      tipo: "video",
      texto: m.videoMessage.caption || null,
      media: b642 ? { base64: b642, mime: m.videoMessage.mimetype || "video/mp4", miniatura_base64: m.videoMessage.jpegThumbnail || null } : null,
      metadatos: { ...base.metadatos, duracion_s: m.videoMessage.seconds || null }
    }];
  if (m.documentMessage)
    return [{
      ...base,
      tipo: "documento",
      texto: m.documentMessage.caption || null,
      media: b642 ? { base64: b642, mime: m.documentMessage.mimetype || "application/octet-stream", nombre: m.documentMessage.fileName || null } : null
    }];
  if (m.locationMessage)
    return [{ ...base, tipo: "ubicacion", metadatos: { ...base.metadatos, lat: m.locationMessage.degreesLatitude, lng: m.locationMessage.degreesLongitude } }];
  if (m.contactMessage)
    return [{ ...base, tipo: "contacto", texto: m.contactMessage.displayName || null }];
  return [];
}
var json = (status, cuerpo) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
var servidor = Bun.serve({
  port: PORT,
  hostname: env.HOST || "::",
  maxRequestBodySize: 100 * 1024 * 1024,
  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (req.method === "GET" && url.pathname === "/salud") {
        let base = "desconocida";
        try {
          await sql`SELECT 1`;
          base = "ok";
        } catch (e) {
          base = "error: " + String(e.message).slice(0, 80);
        }
        return json(200, { ok: true, version: VERSION, config_faltante: configOk(), base });
      }
      if (req.method !== "POST")
        return json(405, { ok: false });
      const cuerpo = await req.text();
      if (url.pathname === "/v1/evento") {
        const motivo = firmaValida(req.headers.get("x-fts-ts"), req.headers.get("x-fts-sig"), cuerpo);
        if (motivo) {
          console.warn(`[rechazo] ${motivo} ${url.pathname}`);
          return json(401, { ok: false });
        }
        const r = await procesar(JSON.parse(cuerpo));
        return json(r.status, r.cuerpo);
      }
      if (url.pathname.startsWith("/v1/evolution/")) {
        const dado = Buffer.from(url.pathname.slice("/v1/evolution/".length));
        const esp = Buffer.from(tokenEvolution());
        if (dado.length !== esp.length || !timingSafeEqual(dado, esp)) {
          console.warn("[rechazo] TOKEN_EVOLUTION");
          return json(401, { ok: false });
        }
        const body = JSON.parse(cuerpo);
        const t = desdeEvolution(body);
        if (!t)
          return json(200, { ok: true, ignorado: true });
        if (!Array.isArray(t)) {
          for (const g of t.sistema)
            await asegurarCanal("whatsapp", g.id_externo, g.nombre);
          return json(200, { ok: true, canales: t.sistema.length });
        }
        const res = [];
        for (const n of t)
          res.push((await procesar(n)).cuerpo);
        return json(200, { ok: true, resultados: res });
      }
      return json(404, { ok: false });
    } catch (e) {
      console.error(`[error] ${url.pathname.startsWith("/v1/evolution/") ? "/v1/evolution/\u2026" : url.pathname} ${String(e.message).slice(0, 200)}`);
      return json(500, { ok: false, error: "ERROR_INTERNO" });
    }
  }
});
var fp = (s) => sha2562(s).slice(0, 8);
console.log(`[arranque] ${VERSION} puerto=${PORT} config_faltante=${JSON.stringify(configOk())} token_evolution_len=${tokenEvolution().length} fp_hmac=${fp(SECRETO)} fp_pimienta=${fp(PIMIENTA)} fp_pw=${fp(env.MEMORIA_CAPTURA_PASSWORD || "")}`);
if (env.MOSTRAR_VERIFICADOR === "1" && env.MEMORIA_CAPTURA_PASSWORD) {
  const { pbkdf2Sync, randomBytes } = await import("crypto");
  const sal = randomBytes(16), it = 4096;
  const salted = pbkdf2Sync(env.MEMORIA_CAPTURA_PASSWORD.normalize("NFKC"), sal, it, 32, "sha256");
  const clientKey = createHmac2("sha256", salted).update("Client Key").digest();
  const storedKey = createHash2("sha256").update(clientKey).digest();
  const serverKey = createHmac2("sha256", salted).update("Server Key").digest();
  console.log(`[verificador] memoria_captura SCRAM-SHA-256$${it}:${sal.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`);
}
if (env.AUTOPRUEBA === "1") {
  const { autoprueba: autoprueba2 } = await Promise.resolve().then(() => (init_autoprueba(), exports_autoprueba));
  setTimeout(() => autoprueba2({ sql, leer, puerto: PORT, secreto: SECRETO, tokenEvolution: tokenEvolution() }).catch((e) => console.error("[autoprueba] fallo", String(e?.message || e))), 1500);
}
export {
  tokenEvolution,
  servidor,
  procesar,
  detectarTipo,
  desdeEvolution
};
