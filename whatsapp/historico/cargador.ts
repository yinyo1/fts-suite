// ═══════════════════════════════════════════════════════════════════════════
// Cargador del histórico de WhatsApp (R4 de #328).
//
// Toma el ZIP de "Exportar chat → Incluir archivos" (Android o iOS), lo parsea con
// parser.ts y manda cada mensaje al receptor como evento firmado (/v1/evento).
// Por omisión corre en SIMULADO: sólo reporta qué cargaría, sin red.
//
// Uso:  bun whatsapp/historico/cargador.ts --zip export.zip --canal-id <id_externo>
//         [--canal-nombre "…"] [--frontera 2026-09-29T14:00:00Z] [--tz -6]
//         [--enviar http://memoria-receptor.railway.internal:8080]   ← sin esto, SIMULADO
// El secreto de firma se lee de MEMORIA_HMAC_SECRET (entorno). Nunca por argumento.
// Detalle y orden de pasos: docs/whatsapp/CARGA-HISTORICO.md
// ═══════════════════════════════════════════════════════════════════════════
import { createHash, createHmac } from "node:crypto";
import { leerZip, type EntradaZip } from "./zip";
import { parsearExportacion, type EventoExport } from "./parser";

export const MAX_ADJUNTO = 64 * 1024 * 1024;          // mismo tope que el receptor

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  opus: "audio/ogg", ogg: "audio/ogg", m4a: "audio/mp4", mp3: "audio/mpeg",
  mp4: "video/mp4", "3gp": "video/3gpp", mov: "video/quicktime",
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  vcf: "text/vcard", txt: "text/plain", zip: "application/zip",
};
export const mimeDe = (n: string) => MIME[(n.split(".").pop() || "").toLowerCase()] || "application/octet-stream";

// El .txt del chat: iOS "_chat.txt"; Android "Chat de WhatsApp con X.txt" / "WhatsApp Chat with X.txt".
export function elegirChat(entradas: EntradaZip[]): EntradaZip {
  const txt = entradas.filter((e) => /\.txt$/i.test(e.nombre));
  const porNombre = txt.find((e) => /(^|\/)_chat\.txt$/i.test(e.nombre) || /whatsapp/i.test(e.nombre));
  const elegido = porNombre || txt.sort((a, b) => b.bytes - a.bytes)[0];
  if (!elegido) throw new Error("SIN_CHAT: el ZIP no trae ningún .txt");
  return elegido;
}

export type Normalizado = {
  fuente: string; canal: { id_externo: string; nombre?: string | null }; id_origen: string; tipo: string;
  ocurrido_en: string; autor: { id_externo: string; nombre?: string | null }; texto?: string | null;
  media?: { base64: string; mime: string; nombre?: string | null } | null; metadatos?: Record<string, unknown>;
};

export type Plan = {
  formato: string; chat: string; eventos: Normalizado[]; sistema: number; descartados_por_frontera: number;
  por_tipo: Record<string, number>; adjuntos: { encontrados: number; faltantes: string[]; demasiado_grandes: string[]; bytes: number };
  desde: string | null; hasta: string | null; meses: string[];
};

// Arma el plan de carga. No toca la red.
export function planear(zip: Uint8Array, op: { canal_id_externo: string; canal_nombre?: string; frontera?: string | null; tzOffsetHoras?: number }): Plan {
  const entradas = leerZip(zip);
  const chat = elegirChat(entradas);
  const txt = new TextDecoder("utf-8").decode(chat.leer());
  const r = parsearExportacion(txt, op);
  const porNombre = new Map(entradas.map((e) => [e.nombre.split("/").pop()!, e]));
  const adj = { encontrados: 0, faltantes: [] as string[], demasiado_grandes: [] as string[], bytes: 0 };
  const por_tipo: Record<string, number> = {};
  const eventos: Normalizado[] = r.eventos.map((e: EventoExport) => {
    por_tipo[e.tipo] = (por_tipo[e.tipo] || 0) + 1;
    const n: Normalizado = { fuente: e.fuente, canal: e.canal, id_origen: e.id_origen, tipo: e.tipo,
      ocurrido_en: e.ocurrido_en, autor: e.autor, texto: e.texto, metadatos: { ...e.metadatos, carga: "historico" } };
    if (e.adjunto) {
      const en = porNombre.get(e.adjunto);
      if (!en) { adj.faltantes.push(e.adjunto); n.metadatos!.adjunto_faltante = e.adjunto; }
      else if (en.bytes > MAX_ADJUNTO) { adj.demasiado_grandes.push(e.adjunto); n.metadatos!.adjunto_demasiado_grande = e.adjunto; }
      else {
        adj.encontrados++; adj.bytes += en.bytes;
        // Se lee al enviar (no se guarda todo el ZIP descomprimido en memoria).
        Object.defineProperty(n, "media", { enumerable: true, configurable: true,
          get: () => ({ base64: Buffer.from(en.leer()).toString("base64"), mime: mimeDe(e.adjunto!), nombre: e.adjunto }) });
      }
    }
    return n;
  });
  const fechas = eventos.map((e) => e.ocurrido_en).sort();
  const meses = [...new Set(fechas.map((f) => f.slice(0, 7)))];
  return { formato: r.formato, chat: chat.nombre, eventos, sistema: r.sistema.length,
    descartados_por_frontera: r.descartados_por_frontera, por_tipo, adjuntos: adj,
    desde: fechas[0] || null, hasta: fechas[fechas.length - 1] || null, meses };
}

// Resumen del simulacro: lo que se cargaría. Sin textos ni nombres (van a un log).
export function resumen(p: Plan) {
  return { modo: "SIMULADO", formato: p.formato, chat: p.chat, eventos: p.eventos.length, por_tipo: p.por_tipo,
    avisos_de_sistema_omitidos: p.sistema, descartados_por_frontera: p.descartados_por_frontera,
    adjuntos: { encontrados: p.adjuntos.encontrados, bytes: p.adjuntos.bytes,
                faltantes: p.adjuntos.faltantes.length, demasiado_grandes: p.adjuntos.demasiado_grandes.length },
    desde: p.desde, hasta: p.hasta, meses: p.meses,
    antes_de_enviar: p.desde ? `SELECT memoria.api_preparar_historico(date '${p.desde.slice(0, 10)}');  -- rol memoria_admin` : null };
}

export const firmar = (secreto: string, ts: string, cuerpo: string) => createHmac("sha256", secreto).update(`${ts}.${cuerpo}`).digest("hex");

// Envío real: uno por uno, en orden. 503 = reintentar (el receptor no tomó la huella).
export async function enviar(p: Plan, url: string, secreto: string, opts: { reintentos?: number; esperaMs?: number; log?: (s: string) => void } = {}) {
  if (!secreto || secreto.length < 32) throw new Error("SIN_SECRETO: exporta MEMORIA_HMAC_SECRET en el entorno");
  const log = opts.log || ((s: string) => console.log(s));
  const reintentos = opts.reintentos ?? 5, espera = opts.esperaMs ?? 2000;
  const cuenta = { enviados: 0, nuevos: 0, duplicados: 0, ruido: 0, fallidos: 0 };
  for (let i = 0; i < p.eventos.length; i++) {
    const cuerpo = JSON.stringify(p.eventos[i]);
    let intento = 0;
    for (;;) {
      const ts = String(Date.now());
      const r = await fetch(`${url.replace(/\/$/, "")}/v1/evento`, { method: "POST",
        headers: { "content-type": "application/json", "x-fts-ts": ts, "x-fts-sig": firmar(secreto, ts, cuerpo) }, body: cuerpo });
      const j: any = await r.json().catch(() => ({}));
      if (r.status === 503 && intento < reintentos) { intento++; await Bun.sleep(espera * intento); continue; }
      if (r.status === 401) throw new Error("FIRMA_RECHAZADA: el secreto no coincide con el del receptor");
      if (r.status === 422 && j.error === "FUERA_DE_PARTICION")
        throw new Error(`FUERA_DE_PARTICION (${j.mes}): corre antes SELECT memoria.api_preparar_historico(date '${p.desde?.slice(0, 10)}'); lo ya enviado no se duplica`);
      if (r.status === 202 && j.capturado === false)
        throw new Error(`CANAL_NO_CAPTURANDO (${j.motivo}): aprueba el canal en la bandeja (memoria/canales-manual) y vuelve a correr; lo ya enviado no se duplica`);
      cuenta.enviados++;
      if (r.status !== 200) { cuenta.fallidos++; log(`[cargador] evento ${i + 1}: http ${r.status} ${j.error || ""}`); }
      else if (j.ruido) cuenta.ruido++;
      else if (j.duplicado) cuenta.duplicados++;
      else cuenta.nuevos++;
      break;
    }
    if ((i + 1) % 200 === 0) log(`[cargador] ${i + 1}/${p.eventos.length}`);
  }
  return { modo: "ENVIO", ...cuenta, total: p.eventos.length };
}

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

if (import.meta.main) {
  const zipRuta = arg("zip"), canal = arg("canal-id");
  if (!zipRuta || !canal) { console.error("uso: bun cargador.ts --zip export.zip --canal-id <id_externo> [--enviar URL]"); process.exit(2); }
  const zip = new Uint8Array(await Bun.file(zipRuta).arrayBuffer());
  const plan = planear(zip, { canal_id_externo: canal, canal_nombre: arg("canal-nombre"),
    frontera: arg("frontera") || null, tzOffsetHoras: arg("tz") ? Number(arg("tz")) : -6 });
  console.log(JSON.stringify({ sha256_zip: createHash("sha256").update(zip).digest("hex"), ...resumen(plan) }, null, 2));
  const url = arg("enviar");
  if (url) console.log(JSON.stringify(await enviar(plan, url, Bun.env.MEMORIA_HMAC_SECRET || ""), null, 2));
}
