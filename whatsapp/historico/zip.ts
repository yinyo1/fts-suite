// Lector mínimo de ZIP (sin dependencias): lo justo para una exportación de WhatsApp.
// Soporta "stored" (0) y "deflate" (8), que son los dos métodos que usan Android e iOS.
// No soporta ZIP cifrado ni ZIP64 (una exportación de >4 GB se parte en varias).
import { inflateRawSync } from "node:zlib";

export type EntradaZip = { nombre: string; bytes: number; leer: () => Uint8Array };

export function leerZip(buf: Uint8Array): EntradaZip[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Fin del directorio central: firma 0x06054b50, buscada desde el final (puede haber comentario).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIP_INVALIDO: no encontré el directorio central");
  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (p === 0xffffffff) throw new Error("ZIP64_NO_SOPORTADO");
  const td = new TextDecoder("utf-8");
  const out: EntradaZip[] = [];
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("ZIP_INVALIDO: directorio central corrupto");
    const flags = dv.getUint16(p + 8, true);
    const metodo = dv.getUint16(p + 10, true);
    const comprimido = dv.getUint32(p + 20, true);
    const tam = dv.getUint32(p + 24, true);
    const ln = dv.getUint16(p + 28, true), lx = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nombre = td.decode(buf.subarray(p + 46, p + 46 + ln));
    p += 46 + ln + lx + lc;
    if (flags & 1) throw new Error(`ZIP_CIFRADO_NO_SOPORTADO: ${nombre}`);
    if (nombre.endsWith("/")) continue;
    out.push({
      nombre, bytes: tam,
      leer: () => {
        if (dv.getUint32(local, true) !== 0x04034b50) throw new Error(`ZIP_INVALIDO: encabezado local de ${nombre}`);
        const ini = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
        const datos = buf.subarray(ini, ini + comprimido);
        if (metodo === 0) return datos;
        if (metodo === 8) return new Uint8Array(inflateRawSync(datos));
        throw new Error(`ZIP_METODO_NO_SOPORTADO: ${metodo} en ${nombre}`);
      },
    });
  }
  return out;
}

// Escritor mínimo (sólo para PRUEBAS: fabrica exportaciones sintéticas).
import { deflateRawSync, crc32 } from "node:zlib";
export function escribirZip(archivos: { nombre: string; datos: Uint8Array | string; comprimir?: boolean }[]): Uint8Array {
  const te = new TextEncoder();
  const partes: Uint8Array[] = []; const central: Uint8Array[] = [];
  let off = 0;
  for (const a of archivos) {
    const crudo = typeof a.datos === "string" ? te.encode(a.datos) : a.datos;
    const metodo = a.comprimir === false ? 0 : 8;
    const datos = metodo === 8 ? new Uint8Array(deflateRawSync(crudo)) : crudo;
    const nom = te.encode(a.nombre); const crc = crc32(crudo) >>> 0;
    const lh = new Uint8Array(30 + nom.length); const l = new DataView(lh.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true); l.setUint16(8, metodo, true);
    l.setUint32(14, crc, true); l.setUint32(18, datos.length, true); l.setUint32(22, crudo.length, true);
    l.setUint16(26, nom.length, true); lh.set(nom, 30);
    const ch = new Uint8Array(46 + nom.length); const c = new DataView(ch.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true);
    c.setUint16(10, metodo, true); c.setUint32(16, crc, true); c.setUint32(20, datos.length, true); c.setUint32(24, crudo.length, true);
    c.setUint16(28, nom.length, true); c.setUint32(42, off, true); ch.set(nom, 46);
    partes.push(lh, datos); central.push(ch); off += lh.length + datos.length;
  }
  const tamCentral = central.reduce((s, x) => s + x.length, 0);
  const fin = new Uint8Array(22); const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true); f.setUint16(8, archivos.length, true); f.setUint16(10, archivos.length, true);
  f.setUint32(12, tamCentral, true); f.setUint32(16, off, true);
  const todo = [...partes, ...central, fin]; const res = new Uint8Array(todo.reduce((s, x) => s + x.length, 0));
  let q = 0; for (const x of todo) { res.set(x, q); q += x.length; }
  return res;
}
