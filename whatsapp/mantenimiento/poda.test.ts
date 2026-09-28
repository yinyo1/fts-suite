// Pruebas de la poda SIMULADA. Claves sintéticas; nada de red.
import { expect, test } from "bun:test";
import { planear, interpretar } from "./poda";

const clave = (d: Date) => {
  const iso = d.toISOString();                       // 2026-09-28T08:30:00.000Z
  const [f, h] = [iso.slice(0, 10).replace(/-/g, ""), iso.slice(11, 19).replace(/:/g, "")];
  return `pg_dump/${iso.slice(0, 4)}/${iso.slice(5, 7)}/${iso.slice(8, 10)}/fts_suite_${f}T${h}Z.dump`;
};
const ahora = new Date("2026-09-28T09:00:00Z");
// 420 días de respaldos a las 08:30 UTC, y un segundo respaldo manual algunos días.
const claves: string[] = [];
for (let i = 0; i < 420; i++) {
  const d = new Date(ahora.getTime() - i * 86400000); d.setUTCHours(8, 30, 0, 0);
  if (d > ahora) continue;
  claves.push(clave(d));
  if (i % 10 === 3) { const e = new Date(d); e.setUTCHours(15, 0, 0, 0); if (e < ahora) claves.push(clave(e)); }
}
const raras = ["pg_dump/2026/09/28/manual.dump", "otra-cosa/x.dump", "pg_dump/2026/09/28/fts_suite_20260930T000000Z.dump"];

test("interpreta sólo el formato de mantenimiento.sh", () => {
  const r = interpretar([...claves, ...raras]);
  expect(r.respaldos.length).toBe(claves.length + 1);          // la del futuro sí tiene formato válido
  expect(r.ignoradas).toEqual(["pg_dump/2026/09/28/manual.dump", "otra-cosa/x.dump"]);
});

test("14 diarios + 8 semanales + 12 mensuales, el más reciente de cada periodo", () => {
  const p = planear([...claves, ...raras], ahora);
  const conservadas = new Set(p.conservar.map((c) => c.clave));
  const motivos = p.conservar.flatMap((c) => c.motivos);
  expect(motivos.filter((m) => m.startsWith("diario")).length).toBe(14);
  expect(motivos.filter((m) => m.startsWith("semanal")).length).toBe(8);
  expect(motivos.filter((m) => m.startsWith("mensual")).length).toBe(12);
  expect(p.conservar.length).toBeLessThanOrEqual(14 + 8 + 12 + 2);
  // Nada de los últimos 14 días que sea el más reciente de su día se borra.
  for (let i = 0; i < 14; i++) {
    const d = new Date(ahora.getTime() - i * 86400000); d.setUTCHours(8, 30, 0, 0);
    const delDia = [...claves].filter((c) => c.includes(`/${d.toISOString().slice(0, 10).replace(/-/g, "/")}/`)).sort().pop()!;
    expect(conservadas.has(delDia)).toBe(true);
  }
  // Lo que se borra y lo que se conserva no se enciman, y juntos son todos los reconocidos.
  expect(p.borraria.some((c) => conservadas.has(c))).toBe(false);
  expect(p.borraria.length + p.conservar.length).toBe(claves.length + 1);
  // Lo que no reconoce nunca aparece para borrar; lo del futuro se conserva.
  for (const r of raras) expect(p.borraria).not.toContain(r);
  expect(p.conservar.find((c) => c.clave.includes("20260930"))!.motivos).toContain("fecha en el futuro: no se toca");
  // El más viejo (≈14 meses) sí se borraría.
  expect(p.borraria).toContain(claves[claves.length - 1]);
});

test("con pocos respaldos sólo sobra la copia vieja del mismo día", () => {
  const p = planear(claves.slice(0, 5), ahora);      // 4 días; el día 25 tiene dos respaldos
  expect(p.borraria).toEqual(["pg_dump/2026/09/25/fts_suite_20260925T083000Z.dump"]);
  expect(planear(claves.slice(0, 4), ahora).borraria).toEqual([]);
});

test("el código de poda no puede borrar", async () => {
  const fuente = await Bun.file(import.meta.dir + "/poda.ts").text();
  expect(/\.(delete|unlink)\(|DeleteObject/.test(fuente)).toBe(false);
});
