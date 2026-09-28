// ═══════════════════════════════════════════════════════════════════════════
// Autoprueba del receptor (F5). SÓLO datos sintéticos, en canales marcados
// es_prueba (id 'prueba-…' / 'pruebapend-…'). Deterministas: correrla dos
// veces NO duplica nada (la huella lo impide), así que no hace falta borrar.
//
// Lo que se mide aquí es lo que el receptor RESPONDE y lo que queda en el
// bucket. Los CONTEOS en la base se verifican aparte, con otro rol (lectura
// independiente vía memoria/consulta en n8n).
// ═══════════════════════════════════════════════════════════════════════════
import { createHmac, createHash, randomUUID } from "node:crypto";

type Ctx = { sql: any; leer: (k: string) => Promise<Uint8Array>; puerto: number; secreto: string; tokenEvolution: string };

const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

// PRNG determinista (mulberry32): mismos bytes en cada corrida.
function bytesSinteticos(semilla: number, n: number, cabecera: number[] = []): Uint8Array {
  let a = semilla >>> 0;
  const out = new Uint8Array(n);
  out.set(cabecera);
  for (let i = cabecera.length; i < n; i++) {
    a = (a + 0x6d2b79f5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out[i] = ((t ^ (t >>> 14)) >>> 0) & 255;
  }
  return out;
}
const JPG = [0xff, 0xd8, 0xff, 0xe0], OGG = [0x4f, 0x67, 0x67, 0x53], MP4 = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70], PDF = [0x25, 0x50, 0x44, 0x46];
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

const BASE_TS = Date.UTC(2026, 8, 27, 15, 0, 0) / 1000; // 27-sep-2026 15:00 UTC, sintético
const CANAL_A = { id: "prueba-proyecto-a@g.us", nombre: "SO99001 Proyecto Sintético A" };
const CANAL_B = { id: "prueba-compras-b@g.us", nombre: "Compras tickets USA (prueba)" };
const CANAL_C = { id: "prueba-materiales-c@g.us", nombre: "Materiales obra (prueba)" };
const CANAL_P = { id: "pruebapend-general-p@g.us", nombre: "Grupo general sintético pendiente" };
const AUTOR = (i: number) => `prueba-autor-${i % 4}@s.whatsapp.net`;

function evo(canal: { id: string }, id: string, i: number, message: any, extra: any = {}) {
  return { event: "messages.upsert", instance: "prueba", data: { key: { remoteJid: canal.id, fromMe: false, id, participant: AUTOR(i) },
    pushName: `Persona Sintética ${i % 4}`, message, messageTimestamp: BASE_TS + i * 60, ...extra } };
}

export async function autoprueba(ctx: Ctx) {
  const corrida = randomUUID();
  const url = (p: string) => `http://127.0.0.1:${ctx.puerto}${p}`;
  const resultados: { caso: string; esperado: string; obtenido: string; ok: boolean }[] = [];
  const anota = (caso: string, esperado: unknown, obtenido: unknown) => {
    const e = String(esperado), o = String(obtenido);
    resultados.push({ caso, esperado: e, obtenido: o, ok: e === o });
  };
  const postEvo = async (body: any, token = ctx.tokenEvolution) => {
    const r = await fetch(url(`/v1/evolution/${token}`), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => ({})) as any };
  };
  const postFirmado = async (obj: any, firmar = true, tsDesfase = 0) => {
    const cuerpo = JSON.stringify(obj);
    const ts = String(Date.now() + tsDesfase);
    const sig = firmar ? createHmac("sha256", ctx.secreto).update(`${ts}.${cuerpo}`).digest("hex") : "00".repeat(32);
    const r = await fetch(url("/v1/evento"), { method: "POST", headers: { "content-type": "application/json", "x-fts-ts": ts, "x-fts-sig": sig }, body: cuerpo });
    return r.status;
  };

  // 0. Alta de canales por evento de grupo (detección de tipo por nombre).
  for (const c of [CANAL_A, CANAL_B, CANAL_C, CANAL_P])
    await postEvo({ event: "groups.upsert", instance: "prueba", data: [{ id: c.id, subject: c.nombre }] });

  // 1. 20 de cada tipo en el canal A.
  const shas: { clave: string; sha: string }[] = [];
  let n200 = 0, nTot = 0;
  const cuenta = (r: { status: number }) => { nTot++; if (r.status === 200) n200++; };
  for (let i = 0; i < 20; i++) {
    cuenta(await postEvo(evo(CANAL_A, `PRB-TXT-${i}`, i, { conversation: `Mensaje sintético ${i}: avance de prueba, sin datos reales.` })));
    const img = bytesSinteticos(1000 + i, 2048, JPG);
    const r1 = await postEvo(evo(CANAL_A, `PRB-IMG-${i}`, i, { imageMessage: { caption: `Foto sintética ${i}`, mimetype: "image/jpeg" }, base64: b64(img) }));
    cuenta(r1); if (i < 3) shas.push({ clave: `caliente/${sha256(img).slice(0, 2)}/${sha256(img)}`, sha: sha256(img) });
    const aud = bytesSinteticos(2000 + i, 1500, OGG);
    const r2 = await postEvo(evo(CANAL_A, `PRB-AUD-${i}`, i, { audioMessage: { mimetype: "audio/ogg; codecs=opus", seconds: 7, ptt: true }, base64: b64(aud) }));
    cuenta(r2); if (i < 1) shas.push({ clave: `caliente/${sha256(aud).slice(0, 2)}/${sha256(aud)}`, sha: sha256(aud) });
    const vid = bytesSinteticos(3000 + i, 4096, MP4), thumb = bytesSinteticos(3500 + i, 300, JPG);
    const r3 = await postEvo(evo(CANAL_A, `PRB-VID-${i}`, i, { videoMessage: { caption: `Video sintético ${i}`, mimetype: "video/mp4", seconds: 12, jpegThumbnail: b64(thumb) }, base64: b64(vid) }));
    cuenta(r3); if (i < 1) shas.push({ clave: `frio/${sha256(vid).slice(0, 2)}/${sha256(vid)}`, sha: sha256(vid) });
    cuenta(await postEvo(evo(CANAL_A, `PRB-DOC-${i}`, i, { documentMessage: { fileName: `documento-sintetico-${i}.pdf`, mimetype: "application/pdf" }, base64: b64(bytesSinteticos(4000 + i, 1024, PDF)) })));
    cuenta(await postEvo(evo(CANAL_A, `PRB-REA-${i}`, i, { reactionMessage: { text: "👍", key: { id: `PRB-TXT-${i}` } } })));
    cuenta(await postEvo(evo(CANAL_A, `PRB-EDI-${i}`, i, { protocolMessage: { type: 14, key: { id: `PRB-TXT-${i}` }, editedMessage: { conversation: `Mensaje sintético ${i} (editado)` } } })));
    cuenta(await postEvo(evo(CANAL_A, `PRB-BOR-${i}`, i, { protocolMessage: { type: 0, key: { id: `PRB-TXT-${i}` } } })));
  }
  anota("envios_aceptados", "160/160", `${n200}/${nTot}`);

  // 2. Idempotencia: los 20 textos otra vez → todos duplicados.
  let dup = 0;
  for (let i = 0; i < 20; i++) {
    const r = await postEvo(evo(CANAL_A, `PRB-TXT-${i}`, i, { conversation: `Mensaje sintético ${i}: avance de prueba, sin datos reales.` }));
    if (r.json?.resultados?.[0]?.duplicado === true) dup++;
  }
  anota("reenvio_20_textos_todos_duplicados", 20, dup);

  // 3. Dedupe de archivo: la foto 0 del canal A, reenviada al canal B.
  const img0 = bytesSinteticos(1000, 2048, JPG);
  const rB = await postEvo(evo(CANAL_B, "PRB-IMG-B-0", 0, { imageMessage: { caption: "Ticket sintético (misma foto)", mimetype: "image/jpeg" }, base64: b64(img0) }));
  anota("misma_foto_en_B_mismo_sha", sha256(img0), rB.json?.resultados?.[0]?.archivo_sha256 ?? rB.json?.resultados?.[0]?.duplicado);

  // 4. Canal pendiente: se registra pero no se captura.
  const rP = await postEvo(evo(CANAL_P, "PRB-PEN-0", 0, { conversation: "Mensaje en grupo pendiente (sintético)" }));
  anota("canal_pendiente_no_captura", "CANAL_PENDIENTE", rP.json?.resultados?.[0]?.motivo);

  // 5. Re-hash de 5 objetos leídos del bucket.
  let rehashOk = 0;
  for (const s of shas.slice(0, 5)) { try { if (sha256(await ctx.leer(s.clave)) === s.sha) rehashOk++; } catch { /* cuenta como fallo */ } }
  anota("rehash_5_objetos_bucket", 5, rehashOk);

  // 6. UPDATE / DELETE con memoria_captura → error.
  for (const [caso, q] of [["update_con_captura_falla", "UPDATE memoria.evento SET texto = 'x' WHERE false"],
                           ["delete_con_captura_falla", "DELETE FROM memoria.evento WHERE false"],
                           ["update_huella_con_captura_falla", "UPDATE memoria.huella SET evento_id = evento_id WHERE false"]] as const) {
    let obtenido = "SIN_ERROR";
    try { await ctx.sql.unsafe(q); } catch (e: any) { obtenido = /permission denied/i.test(String(e?.message)) ? "PERMISO_DENEGADO" : "OTRO_ERROR"; }
    anota(caso, "PERMISO_DENEGADO", obtenido);
  }

  // 7. Firma: válida 200, inválida 401, vieja 401, token de Evolution falso 401.
  const canonico = { fuente: "prueba", canal: { id_externo: "prueba-canonico-d", nombre: "Canal canónico sintético" }, id_origen: "PRB-CAN-0",
    tipo: "mensaje", ocurrido_en: new Date(BASE_TS * 1000).toISOString(), autor: { id_externo: "prueba-autor-x" }, texto: "Evento canónico firmado (sintético)" };
  anota("firma_valida_200", 200, await postFirmado(canonico));
  anota("firma_invalida_401", 401, await postFirmado(canonico, false));
  anota("firma_vieja_401", 401, await postFirmado(canonico, true, -10 * 60 * 1000));
  anota("token_evolution_falso_401", 401, (await postEvo(evo(CANAL_A, "PRB-X", 0, { conversation: "x" }), "0".repeat(40))).status);

  // 8. Chat 1:1 (no grupo) → ignorado.
  const r1a1 = await postEvo({ event: "messages.upsert", instance: "prueba", data: { key: { remoteJid: "prueba-persona@s.whatsapp.net", id: "PRB-1A1" }, message: { conversation: "privado" }, messageTimestamp: BASE_TS } });
  anota("chat_1a1_ignorado", 0, (r1a1.json?.resultados || []).length);

  for (const r of resultados)
    await ctx.sql`INSERT INTO memoria.prueba_corrida (corrida, suite, caso, esperado, obtenido, ok) VALUES (${corrida}, 'captura', ${r.caso}, ${r.esperado}, ${r.obtenido}, ${r.ok})`;
  const okN = resultados.filter((r) => r.ok).length;
  console.log(`[autoprueba] corrida=${corrida} ${okN}/${resultados.length} OK`);
  for (const r of resultados) console.log(`[autoprueba] ${r.ok ? "OK " : "FALLA"} ${r.caso} esperado=${r.esperado} obtenido=${r.obtenido}`);
  return { corrida, ok: okN, total: resultados.length };
}
