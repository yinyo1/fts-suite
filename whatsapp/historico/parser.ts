// ═══════════════════════════════════════════════════════════════════════════
// Parser de exportaciones de chat de WhatsApp (F9, #328) — Android e iOS, español.
//
// Entrada: el .txt de "Exportar chat" (con o sin archivos). Salida: eventos
// normalizados con la misma forma que el receptor (fuente 'whatsapp_export'),
// listos para mandarse firmados a /v1/evento. NO hace la carga: sólo parsea.
//
// Formatos cubiertos (los dos que produce WhatsApp en español):
//   Android: "28/09/26, 9:15 a. m. - Nombre: texto"   ó  "28/09/2026 09:15 - Nombre: texto"
//   iOS:     "[28/09/26, 9:15:32 a.m.] Nombre: texto" (a veces con U+200E al inicio)
// Las líneas sin encabezado son continuación del mensaje anterior.
// La exportación NO trae el número de teléfono ni el id del mensaje: el autor es
// el nombre de contacto del teléfono que exportó y la huella se arma con
// canal|minuto|autor|texto|adjunto (ARQUITECTURA §3.4.1).
// ═══════════════════════════════════════════════════════════════════════════
import { createHash } from "node:crypto";

export type EventoExport = {
  fuente: "whatsapp_export";
  canal: { id_externo: string; nombre?: string | null };
  id_origen: string;          // la huella de exportación (no hay id real)
  tipo: string;
  ocurrido_en: string;        // ISO, en UTC, a partir de la hora local indicada
  autor: { id_externo: string; nombre: string | null };
  texto: string | null;
  adjunto: string | null;     // nombre del archivo dentro del ZIP
  metadatos: Record<string, unknown>;
};

const LRM = /[‎‏‪-‮]/g;
const AND = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?)?\s+-\s+(.*)$/i;
const IOS = /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?)?\]\s+(.*)$/i;

const ADJ_ANDROID = /^(.+?\.(?:jpe?g|png|webp|opus|ogg|m4a|mp3|mp4|3gp|mov|pdf|docx?|xlsx?|pptx?|vcf|txt|zip))\s+\((?:archivo adjunto|file attached)\)\s*$/i;
const ADJ_IOS = /^<(?:adjunto|attached):\s*(.+?)>\s*$/i;
const OMITIDO = /^<?(multimedia omitido|media omitted|imagen omitida|audio omitido|video omitido|sticker omitido|gif omitido|documento omitido)>?$/i;
const BORRADO = /^(se eliminó este mensaje|eliminaste este mensaje|this message was deleted|you deleted this message)\.?$/i;
const EDITADO = /\s*<se editó este mensaje\.?>\s*$/i;

function tipoPorArchivo(n: string): string {
  const x = n.toLowerCase();
  if (/\.(jpe?g|png|webp)$/.test(x)) return /sticker|\.webp$/.test(x) ? "sticker" : "imagen";
  if (/\.(opus|ogg|m4a|mp3)$/.test(x)) return "audio";
  if (/\.(mp4|3gp|mov)$/.test(x)) return "video";
  if (/\.vcf$/.test(x)) return "contacto";
  return "documento";
}

function aISO(d: number, m: number, y: number, hh: number, mm: number, ss: number, ampm: string | undefined, tzOffsetHoras: number): string {
  if (y < 100) y += 2000;
  if (ampm) {
    const pm = /^p/i.test(ampm);
    if (pm && hh < 12) hh += 12;
    if (!pm && hh === 12) hh = 0;
  }
  // hora local de la exportación (Monterrey, UTC-6 sin horario de verano desde 2022)
  return new Date(Date.UTC(y, m - 1, d, hh - tzOffsetHoras, mm, ss)).toISOString();
}

type Crudo = { iso: string; minuto: string; resto: string; formato: "android" | "ios" };

export function parsearExportacion(txt: string, opciones: { canal_id_externo: string; canal_nombre?: string; tzOffsetHoras?: number; frontera?: string | null }): { eventos: EventoExport[]; sistema: string[]; formato: string; descartados_por_frontera: number } {
  const tz = opciones.tzOffsetHoras ?? -6;
  const lineas = txt.replace(/\r\n?/g, "\n").split("\n");
  const crudos: Crudo[] = [];
  let formato = "desconocido";
  for (const bruta of lineas) {
    // Se quitan las marcas de dirección SÓLO al inicio de la línea; dentro del cuerpo
    // se conservan un momento porque en iOS delatan los avisos de sistema.
    const l = bruta.replace(/^[\u200e\u200f\u202a-\u202e]+/, "");
    let m = l.match(IOS), f: "ios" | "android" | null = m ? "ios" : null;
    if (!m) { m = l.match(AND); if (m) f = "android"; }
    if (m && f) {
      formato = f;
      const [, d, mo, y, hh, mi, ss, ap, resto] = m;
      const iso = aISO(+d, +mo, +y, +hh, +mi, +(ss || 0), ap, tz);
      crudos.push({ iso, minuto: iso.slice(0, 16), resto, formato: f });
    } else if (crudos.length) {
      crudos[crudos.length - 1].resto += "\n" + l;           // continuación
    }
  }

  const eventos: EventoExport[] = [];
  const sistema: string[] = [];
  let fuera = 0;
  const vistos = new Map<string, number>();
  for (const c of crudos) {
    if (opciones.frontera && c.iso >= opciones.frontera) { fuera++; continue; }
    const i = c.resto.indexOf(": ");
    if (i < 0) { sistema.push(c.resto); continue; }         // "X creó el grupo", "X añadió a Y", cifrado…
    const autor = c.resto.slice(0, i).replace(LRM, "").trim();
    const cuerpoCrudo = c.resto.slice(i + 2);
    let cuerpo = cuerpoCrudo.replace(LRM, "");
    let tipo = "mensaje", adjunto: string | null = null, texto: string | null = cuerpo;
    const meta: Record<string, unknown> = { formato: c.formato };
    if (EDITADO.test(cuerpo)) { cuerpo = cuerpo.replace(EDITADO, ""); texto = cuerpo; meta.editado_en_origen = true; }
    const primera = cuerpo.split("\n")[0].trim();
    const aA = primera.match(ADJ_ANDROID), aI = primera.match(ADJ_IOS);
    if (aA || aI) {
      adjunto = (aA || aI)![1].trim();
      tipo = tipoPorArchivo(adjunto);
      texto = cuerpo.split("\n").slice(1).join("\n").trim() || null;   // pie de foto en líneas siguientes
    } else if (OMITIDO.test(primera)) {
      tipo = "documento"; texto = null; meta.media_omitida_en_exportacion = true;
    } else if (BORRADO.test(primera)) {
      tipo = "borrado_en_origen"; texto = null;
    } else if (c.formato === "ios" && /^[\u200e\u200f]/.test(cuerpoCrudo)) {
      sistema.push(cuerpo); continue;                          // iOS: "Grupo: ‎X creó este grupo"
    }
    // Huella de exportación; si el mismo autor dice lo mismo en el mismo minuto, se numera.
    const base = `whatsapp_export|${opciones.canal_id_externo}|${c.minuto}|${autor}|${texto ?? ""}|${adjunto ?? ""}`;
    const n = (vistos.get(base) || 0) + 1; vistos.set(base, n);
    const id = createHash("sha256").update(base + (n > 1 ? `|#${n}` : "")).digest("hex");
    eventos.push({ fuente: "whatsapp_export", canal: { id_externo: opciones.canal_id_externo, nombre: opciones.canal_nombre ?? null },
      id_origen: id, tipo, ocurrido_en: c.iso, autor: { id_externo: `export:${autor}`, nombre: autor },
      texto, adjunto, metadatos: meta });
  }
  return { eventos, sistema, formato, descartados_por_frontera: fuera };
}
