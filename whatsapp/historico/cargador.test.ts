// Pruebas del cargador del histórico. Todo sintético: exportaciones de fixtures/ y
// binarios generados aquí. El envío se prueba contra un receptor falso local.
import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { escribirZip, leerZip } from "./zip";
import { planear, resumen, enviar, firmar, elegirChat } from "./cargador";
const fs = require("fs");
const A = fs.readFileSync(__dirname + "/fixtures/android-sintetico.txt", "utf8");
const I = fs.readFileSync(__dirname + "/fixtures/ios-sintetico.txt", "utf8");
const bytes = (n: number, s: number) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 31 + s) & 255; return b; };
const op = { canal_id_externo: "prueba-export@g.us", canal_nombre: "SO99001 Proyecto Sintético A" };

const zipAndroid = () => escribirZip([
  { nombre: "Chat de WhatsApp con SO99001 Proyecto Sintético A.txt", datos: A },
  { nombre: "IMG-20260927-WA0001.jpg", datos: bytes(5000, 1) },
  { nombre: "PTT-20260927-WA0002.opus", datos: bytes(3000, 2), comprimir: false },
  // el video NO viene: la exportación lo omitió
]);

test("zip: ida y vuelta, stored y deflate", () => {
  const z = leerZip(zipAndroid());
  expect(z.map((e) => e.nombre).length).toBe(3);
  expect(Buffer.from(z[1].leer()).equals(Buffer.from(bytes(5000, 1)))).toBe(true);
  expect(Buffer.from(z[2].leer()).equals(Buffer.from(bytes(3000, 2)))).toBe(true);
});

test("android: plan con adjuntos encontrados y faltantes", () => {
  const p = planear(zipAndroid(), op);
  const r = resumen(p);
  expect(r.modo).toBe("SIMULADO");
  expect(r.formato).toBe("android");
  expect(r.eventos).toBe(10);
  expect(r.adjuntos.encontrados).toBe(2);
  expect(r.adjuntos.faltantes).toBe(1);                     // el video
  expect(r.meses).toEqual(["2026-09"]);
  expect(r.antes_de_enviar).toContain("api_preparar_historico(date '2026-09-2");
  const img = p.eventos.find((e) => e.tipo === "imagen")!;
  expect(img.media!.mime).toBe("image/jpeg");
  expect(Buffer.from(img.media!.base64, "base64").equals(Buffer.from(bytes(5000, 1)))).toBe(true);
  const vid = p.eventos.find((e) => e.tipo === "video")!;
  expect(vid.media).toBeUndefined();
  expect(vid.metadatos!.adjunto_faltante).toBe("VID-20260928-WA0003.mp4");
  // El resumen no lleva textos ni nombres.
  expect(JSON.stringify(r)).not.toContain("sintético)");
});

test("ios: _chat.txt y adjunto pdf", () => {
  const z = escribirZip([{ nombre: "_chat.txt", datos: I }, { nombre: "00000013-Cotizacion-sintetica.pdf", datos: bytes(2000, 3) }]);
  expect(elegirChat(leerZip(z)).nombre).toBe("_chat.txt");
  const p = planear(z, op);
  expect(p.formato).toBe("ios");
  const pdf = p.eventos.find((e) => e.media?.nombre === "00000013-Cotizacion-sintetica.pdf")!;
  expect(pdf.media!.mime).toBe("application/pdf");
  expect(p.adjuntos.faltantes).toContain("00000012-PHOTO-2026-09-27-09-16-20.jpg");
});

test("frontera: lo que ya llegó en vivo no se vuelve a cargar", () => {
  const todo = planear(zipAndroid(), op);
  const corte = todo.eventos[5].ocurrido_en;
  const p = planear(zipAndroid(), { ...op, frontera: corte });
  expect(p.eventos.length).toBeLessThan(todo.eventos.length);
  expect(p.eventos.every((e) => e.ocurrido_en < corte)).toBe(true);
  expect(p.descartados_por_frontera).toBeGreaterThan(0);
});

test("mismo ZIP dos veces = mismas huellas (idempotente en el receptor)", () => {
  const a = planear(zipAndroid(), op).eventos.map((e) => e.id_origen);
  const b = planear(zipAndroid(), op).eventos.map((e) => e.id_origen);
  expect(a).toEqual(b);
  expect(new Set(a).size).toBe(a.length);
});

test("enviar: firma HMAC válida, reintenta 503 y cuenta", async () => {
  const secreto = "s".repeat(40);
  const vistos = new Set<string>(); let primera503 = true; let firmasMalas = 0;
  const srv = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(req) {
    const cuerpo = await req.text();
    const esp = createHmac("sha256", secreto).update(`${req.headers.get("x-fts-ts")}.${cuerpo}`).digest("hex");
    if (esp !== req.headers.get("x-fts-sig")) { firmasMalas++; return Response.json({ ok: false }, { status: 401 }); }
    const ev = JSON.parse(cuerpo);
    if (ev.tipo === "imagen" && primera503) { primera503 = false; return Response.json({ ok: false, error: "MEDIA_REINTENTAR" }, { status: 503 }); }
    const dup = vistos.has(ev.id_origen); vistos.add(ev.id_origen);
    return Response.json({ ok: true, duplicado: dup });
  } });
  try {
    const p = planear(zipAndroid(), op);
    const url = `http://127.0.0.1:${srv.port}`;
    const r1 = await enviar(p, url, secreto, { esperaMs: 1, log: () => {} });
    expect(firmasMalas).toBe(0);
    expect(r1).toMatchObject({ enviados: 10, nuevos: 10, duplicados: 0, fallidos: 0 });
    const r2 = await enviar(p, url, secreto, { esperaMs: 1, log: () => {} });
    expect(r2).toMatchObject({ nuevos: 0, duplicados: 10 });
  } finally { srv.stop(true); }
});

test("enviar: canal pendiente detiene la carga; firma rechazada también", async () => {
  const srv = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(req) {
    await req.text();
    if (req.headers.get("x-fts-sig")?.startsWith("0")) return Response.json({ ok: false }, { status: 401 });
    return Response.json({ ok: true, capturado: false, motivo: "CANAL_PENDIENTE" }, { status: 202 });
  } });
  try {
    const p = planear(zipAndroid(), op);
    await expect(enviar(p, `http://127.0.0.1:${srv.port}`, "k".repeat(40), { log: () => {} })).rejects.toThrow(/CANAL_NO_CAPTURANDO|FIRMA_RECHAZADA/);
    await expect(enviar(p, `http://127.0.0.1:${srv.port}`, "", { log: () => {} })).rejects.toThrow("SIN_SECRETO");
  } finally { srv.stop(true); }
});

test("firmar coincide con el esquema del receptor", () => {
  expect(firmar("abc", "1", "{}")).toBe(createHmac("sha256", "abc").update("1.{}").digest("hex"));
});
