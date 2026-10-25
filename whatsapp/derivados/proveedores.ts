// Proveedores de transcripción y visión, enchufables (D10 sigue abierta).
// Hoy sólo existe el SIMULADO. El proveedor HTTP está escrito para que enchufar uno
// real sea configuración, pero se NIEGA a correr mientras D10 no esté decidida.
import { createHash } from "node:crypto";

export type TipoDerivado = "transcripcion" | "descripcion_imagen" | "ocr";
export type Derivado = { tipo: TipoDerivado; proveedor: string; version: string; idioma: string | null;
  contenido: string; confianza: number | null; costo_usd: number | null; es_simulado: boolean };

export interface Proveedor {
  clave: string; version: string; es_simulado: boolean;
  derivar(tipo: TipoDerivado, bytes: Uint8Array, mime: string): Promise<Derivado>;
}

// Determinista: mismo archivo → mismo texto. Deja claro que es simulado.
export class ProveedorSimulado implements Proveedor {
  clave = "simulado"; version = "v0"; es_simulado = true;
  async derivar(tipo: TipoDerivado, bytes: Uint8Array, mime: string): Promise<Derivado> {
    const h = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    const texto = tipo === "transcripcion" ? `[SIMULADO] transcripción de ${mime} (${bytes.length} bytes, ${h})`
      : tipo === "ocr" ? `[SIMULADO] texto leído de ${mime} (${h})`
      : `[SIMULADO] descripción de ${mime} (${h})`;
    return { tipo, proveedor: this.clave, version: this.version, idioma: "es", contenido: texto,
      confianza: null, costo_usd: 0, es_simulado: true };
  }
}

// Esqueleto de proveedor real por HTTP. No se usa hasta decidir D10:
// exige DERIVADOS_D10_DECIDIDA=1 además del endpoint y la llave.
export class ProveedorHttp implements Proveedor {
  es_simulado = false;
  constructor(public clave: string, public version: string, private endpoint: string, private llave: string) {}
  async derivar(tipo: TipoDerivado, bytes: Uint8Array, mime: string): Promise<Derivado> {
    if (Bun.env.DERIVADOS_D10_DECIDIDA !== "1") throw new Error("D10_ABIERTA: proveedor real deshabilitado");
    const r = await fetch(this.endpoint, { method: "POST", headers: { authorization: `Bearer ${this.llave}`, "content-type": mime,
      "x-tipo": tipo }, body: bytes });
    if (!r.ok) throw new Error(`PROVEEDOR_HTTP_${r.status}`);
    const j: any = await r.json();
    return { tipo, proveedor: this.clave, version: this.version, idioma: j.idioma ?? null, contenido: String(j.texto ?? ""),
      confianza: j.confianza ?? null, costo_usd: j.costo_usd ?? null, es_simulado: false };
  }
}

export function proveedorDesdeEntorno(): Proveedor {
  const modo = Bun.env.DERIVADOS_PROVEEDOR || "simulado";
  if (modo === "simulado") return new ProveedorSimulado();
  return new ProveedorHttp(modo, Bun.env.DERIVADOS_VERSION || "v1", Bun.env.DERIVADOS_ENDPOINT || "", Bun.env.DERIVADOS_LLAVE || "");
}

// Qué derivados le tocan a cada archivo (el video se transcribe del audio de su versión comprimida).
export function derivadosPara(mime: string, clase: string): TipoDerivado[] {
  if (mime.startsWith("audio/")) return ["transcripcion"];
  if (mime.startsWith("video/")) return ["transcripcion"];
  if (mime.startsWith("image/")) return clase === "ticket" ? ["ocr", "descripcion_imagen"] : ["descripcion_imagen"];
  if (mime === "application/pdf") return ["ocr"];
  return [];
}
