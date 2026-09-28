import { expect, test } from "bun:test";
import { parsearExportacion } from "./parser";
const fs = require("fs");
const A = fs.readFileSync(__dirname + "/fixtures/android-sintetico.txt", "utf8");
const I = fs.readFileSync(__dirname + "/fixtures/ios-sintetico.txt", "utf8");
const op = { canal_id_externo: "prueba-export@g.us", canal_nombre: "SO99001 Proyecto Sintético A" };

test("android: formato, tipos, continuación, sistema", () => {
  const r = parsearExportacion(A, op);
  expect(r.formato).toBe("android");
  expect(r.sistema.length).toBe(2);                                   // cifrado + creó el grupo
  expect(r.eventos.map((e) => e.tipo)).toEqual(["mensaje", "imagen", "audio", "mensaje", "documento", "borrado_en_origen", "mensaje", "mensaje", "mensaje", "video"]);
  expect(r.eventos[1].adjunto).toBe("IMG-20260927-WA0001.jpg");
  expect(r.eventos[1].texto).toBe("Foto del avance (sintético)");      // pie de foto
  expect(r.eventos[3].texto).toContain("cable calibre 12");           // línea de continuación
  expect(r.eventos[4].metadatos.media_omitida_en_exportacion).toBe(true);
  expect(r.eventos[6].metadatos.editado_en_origen).toBe(true);
  expect(r.eventos[6].texto).toBe("Queda listo el viernes");
});
test("android: hora local → UTC (Monterrey UTC-6) y 12 a. m.", () => {
  const r = parsearExportacion(A, op);
  expect(r.eventos[0].ocurrido_en).toBe("2026-09-27T15:15:00.000Z");  // 9:15 a. m. CST
  expect(r.eventos[3].ocurrido_en).toBe("2026-09-27T15:20:00.000Z");
  expect(r.eventos[9].ocurrido_en).toBe("2026-09-28T06:30:00.000Z");  // 12:30 a. m.
});
test("huella: dos 'ok' iguales en el mismo minuto son 2 eventos distintos; re-parsear da las mismas huellas", () => {
  const r1 = parsearExportacion(A, op), r2 = parsearExportacion(A, op);
  expect(r1.eventos[7].id_origen).not.toBe(r1.eventos[8].id_origen);
  expect(r1.eventos.map((e) => e.id_origen)).toEqual(r2.eventos.map((e) => e.id_origen));
  expect(new Set(r1.eventos.map((e) => e.id_origen)).size).toBe(r1.eventos.length);
});
test("frontera: nada igual o posterior a la primera captura en vivo", () => {
  const r = parsearExportacion(A, { ...op, frontera: "2026-09-27T19:00:00.000Z" });
  expect(r.eventos.length).toBe(4);
  expect(r.descartados_por_frontera).toBe(6);
});
test("ios: LRM, segundos, adjuntos, borrado, continuación", () => {
  const r = parsearExportacion(I, op);
  expect(r.formato).toBe("ios");
  expect(r.eventos.map((e) => e.tipo)).toEqual(["mensaje", "imagen", "mensaje", "borrado_en_origen", "documento"]);
  expect(r.sistema.length).toBe(1);
  expect(r.eventos[1].adjunto).toBe("00000012-PHOTO-2026-09-27-09-16-20.jpg");
  expect(r.eventos[4].adjunto).toBe("00000013-Cotizacion-sintetica.pdf");
  expect(r.eventos[2].texto).toContain("cable calibre 12");
  expect(r.eventos[0].ocurrido_en).toBe("2026-09-27T15:15:10.000Z");
});
test("autor sin teléfono: la exportación sólo trae el nombre de contacto", () => {
  const r = parsearExportacion(I, op);
  expect(r.eventos[0].autor.id_externo).toBe("export:Persona Sintética A");
});
