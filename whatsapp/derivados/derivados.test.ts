// Pruebas del servicio de derivados. Video SINTÉTICO generado con ffmpeg (lavfi), nunca real.
// Requiere ffmpeg/ffprobe (FFMPEG/FFPROBE) y, para la prueba de extremo a extremo, una base
// con las migraciones memoria_* (MEMORIA_TEST_PG=1 y PGHOST/PGPORT/PGDATABASE).
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { comprimirVideo, sondear, FFMPEG, PERFIL } from "./ffmpeg";
import { ProveedorSimulado, ProveedorHttp, derivadosPara } from "./proveedores";

const hayFfmpeg = Bun.spawnSync([FFMPEG, "-version"], { stdout: "ignore", stderr: "ignore" }).exitCode === 0;

function videoSintetico(seg = 3): Uint8Array {
  const d = mkdtempSync(join(tmpdir(), "vs-")), f = join(d, "v.mp4");
  const r = Bun.spawnSync([FFMPEG, "-hide_banner", "-nostdin", "-y", "-f", "lavfi", "-i", `testsrc=size=1920x1080:rate=30:duration=${seg}`,
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${seg}`, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "10",
    "-c:a", "aac", "-shortest", f], { stdout: "ignore", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(new TextDecoder().decode(r.stderr).slice(-300));
  return new Uint8Array(readFileSync(f));
}

test.skipIf(!hayFfmpeg)("video: comprime a ≤720p, conserva duración, miniatura JPEG", async () => {
  const orig = videoSintetico(3);
  const r = await comprimirVideo(orig);
  expect(r.perfil).toBe(PERFIL);
  expect(r.original.alto).toBe(1080);
  expect(r.salida.alto!).toBeLessThanOrEqual(720);
  expect(Math.abs((r.salida.duracion_s ?? 0) - 3)).toBeLessThan(0.3);
  expect(r.comprimido.length).toBeLessThan(orig.length);
  expect(r.miniatura[0]).toBe(0xff); expect(r.miniatura[1]).toBe(0xd8);        // JPEG
}, 60_000);

test.skipIf(!hayFfmpeg)("video corrupto: falla con FFMPEG_VIDEO, no con basura", async () => {
  await expect(comprimirVideo(new TextEncoder().encode("no soy un video"))).rejects.toThrow(/FFMPEG_/);
});

test("proveedor simulado: determinista, marcado, sin costo", async () => {
  const p = new ProveedorSimulado(), b = new Uint8Array([1, 2, 3]);
  const a = await p.derivar("transcripcion", b, "audio/ogg"), c = await p.derivar("transcripcion", b, "audio/ogg");
  expect(a).toEqual(c);
  expect(a.es_simulado).toBe(true);
  expect(a.costo_usd).toBe(0);
  expect(a.contenido.startsWith("[SIMULADO]")).toBe(true);
});

test("proveedor real: se niega mientras D10 esté abierta", async () => {
  delete Bun.env.DERIVADOS_D10_DECIDIDA;
  await expect(new ProveedorHttp("x", "v1", "http://127.0.0.1:9", "k").derivar("ocr", new Uint8Array(1), "image/jpeg")).rejects.toThrow("D10_ABIERTA");
});

test("qué derivados tocan a cada archivo", () => {
  expect(derivadosPara("audio/ogg", "audio")).toEqual(["transcripcion"]);
  expect(derivadosPara("image/jpeg", "ticket")).toEqual(["ocr", "descripcion_imagen"]);
  expect(derivadosPara("image/jpeg", "media_general")).toEqual(["descripcion_imagen"]);
  expect(derivadosPara("application/zip", "documento")).toEqual([]);
});

// Extremo a extremo contra Postgres: registra un video sintético como si lo hubiera
// guardado el receptor, lo procesa dos veces y revisa filas (idempotencia).
test.skipIf(!hayFfmpeg || Bun.env.MEMORIA_TEST_PG !== "1")("servicio: video → comprimido + miniatura + transcripción simulada, idempotente", async () => {
  Bun.env.ALMACEN = "local";
  const dir = mkdtempSync(join(tmpdir(), "alm-")); Bun.env.ALMACEN_DIR = dir;
  const { procesar, captura, motor } = await import("./servicio");
  const orig = videoSintetico(2);
  const h = createHash("sha256").update(orig).digest("hex"), clave = `frio/${h.slice(0, 2)}/${h}`;
  await Bun.write(`${dir}/${clave}`, orig);
  await captura`INSERT INTO memoria.archivo (sha256, bytes, mime, clase, nivel_objetivo) VALUES (${h}, ${orig.length}, 'video/mp4', 'video', 'frio') ON CONFLICT DO NOTHING`;
  await captura`INSERT INTO memoria.archivo_ubicacion (sha256, proveedor, contenedor, ruta, nivel, evento) VALUES (${h}, 'railway_bucket', 'local', ${clave}, 'frio', 'alta') ON CONFLICT DO NOTHING`;
  const r1: any = await procesar(h, new ProveedorSimulado());
  expect(r1.status).toBe(200);
  expect(r1.cuerpo.comprimido.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(r1.cuerpo.miniatura.sha256).toMatch(/^[0-9a-f]{64}$/);
  const r2: any = await procesar(h, new ProveedorSimulado());
  expect(r2.cuerpo.comprimido.ya_existia).toBe(true);
  expect(r2.cuerpo.derivados[0].ya_existia).toBe(true);
  const hijos = await motor`SELECT rol, count(*)::int AS n FROM memoria.archivo WHERE deriva_de = ${h} GROUP BY rol ORDER BY rol`;
  expect(hijos.map((x: any) => `${x.rol}:${x.n}`)).toEqual(["comprimido:1", "miniatura:1"]);
  const der = await motor`SELECT tipo, es_simulado FROM memoria.archivo_derivado WHERE sha256 = ${h}`;
  expect(der.length).toBe(1); expect(der[0].es_simulado).toBe(true);
  // Un archivo alterado en el bucket no se procesa.
  await Bun.write(`${dir}/${clave}`, new Uint8Array([1, 2, 3]));
  const r3: any = await procesar(h, new ProveedorSimulado());
  expect(r3.cuerpo.error).toBe("HUELLA_NO_CUADRA");
  // Sólo originales.
  const r4: any = await procesar(r1.cuerpo.comprimido.sha256, new ProveedorSimulado());
  expect(r4.cuerpo.error).toBe("NO_ES_ORIGINAL");
}, 90_000);
