// ═══════════════════════════════════════════════════════════════════════════
// Poda de respaldos · SÓLO SIMULADO (R7 de #328). No borra nada: no existe una
// ruta de código que llame a delete. Reporta qué borraría con la retención
// 14 diarios + 8 semanales + 12 mensuales (abuelo-padre-hijo).
//
// Uso:  bun whatsapp/mantenimiento/poda.ts            (lista el bucket memoria-respaldos con S3_*)
//       bun whatsapp/mantenimiento/poda.ts --lista claves.txt   (una clave por línea, sin red)
// ═══════════════════════════════════════════════════════════════════════════

export type Politica = { diarios: number; semanales: number; mensuales: number };
export const POLITICA: Politica = { diarios: 14, semanales: 8, mensuales: 12 };

// Formato que escribe mantenimiento.sh: pg_dump/AAAA/MM/DD/fts_suite_AAAAMMDDTHHMMSSZ.dump
const CLAVE = /^pg_dump\/\d{4}\/\d{2}\/\d{2}\/fts_suite_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.dump$/;

export type Respaldo = { clave: string; fecha: Date };
export type Plan = {
  politica: Politica; ahora: string; total: number;
  conservar: { clave: string; motivos: string[] }[];
  borraria: string[];
  ignoradas: string[];            // claves que no reconoce: NUNCA se tocan
  bytes_liberados?: number;
};

export function interpretar(claves: string[]): { respaldos: Respaldo[]; ignoradas: string[] } {
  const respaldos: Respaldo[] = [], ignoradas: string[] = [];
  for (const c of claves) {
    const m = c.match(CLAVE);
    if (!m) { ignoradas.push(c); continue; }
    const f = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    if (isNaN(f.getTime())) { ignoradas.push(c); continue; }
    respaldos.push({ clave: c, fecha: f });
  }
  return { respaldos, ignoradas };
}

const dia = (d: Date) => d.toISOString().slice(0, 10);
const mes = (d: Date) => d.toISOString().slice(0, 7);
function semanaISO(d: Date): string {             // AAAA-Www (ISO 8601, lunes)
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const wd = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - wd);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7)).padStart(2, "0")}`;
}

// Por cada periodo se conserva el respaldo MÁS RECIENTE. Los N periodos más recientes que
// tengan respaldo cuentan (un día sin respaldo no "gasta" uno de los 14).
export function planear(claves: string[], ahora = new Date(), p: Politica = POLITICA): Plan {
  const { respaldos, ignoradas } = interpretar(claves);
  const futuros = respaldos.filter((r) => r.fecha.getTime() > ahora.getTime() + 60_000);
  const validos = respaldos.filter((r) => !futuros.includes(r)).sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  const motivos = new Map<string, string[]>();
  const marca = (c: string, m: string) => motivos.set(c, [...(motivos.get(c) || []), m]);
  for (const [nombre, llave, n] of [["diario", dia, p.diarios], ["semanal", semanaISO, p.semanales], ["mensual", mes, p.mensuales]] as const) {
    const vistos = new Set<string>();
    for (const r of validos) {
      const k = (llave as (d: Date) => string)(r.fecha);
      if (vistos.has(k)) continue;
      if (vistos.size >= n) break;
      vistos.add(k); marca(r.clave, `${nombre} ${k}`);
    }
  }
  if (validos[0]) marca(validos[0].clave, "el más reciente");
  for (const r of futuros) marca(r.clave, "fecha en el futuro: no se toca");   // reloj raro = revisar a mano
  const conservar = [...motivos.entries()].map(([clave, m]) => ({ clave, motivos: m })).sort((a, b) => a.clave.localeCompare(b.clave));
  const borraria = validos.filter((r) => !motivos.has(r.clave)).map((r) => r.clave).sort();
  return { politica: p, ahora: ahora.toISOString(), total: claves.length, conservar, borraria, ignoradas };
}

async function listarBucket(): Promise<{ claves: string[]; bytes: Map<string, number> }> {
  const env = Bun.env;
  if (!(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY && env.S3_ENDPOINT)) throw new Error("FALTAN S3_*");
  const s3 = new Bun.S3Client({ accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    bucket: env.S3_BUCKET, endpoint: env.S3_ENDPOINT, region: env.S3_REGION || "auto" });
  const claves: string[] = [], bytes = new Map<string, number>();
  let token: string | undefined;
  do {
    const r: any = await s3.list({ prefix: "pg_dump/", maxKeys: 1000, continuationToken: token });
    for (const o of r.contents || []) { claves.push(o.key); bytes.set(o.key, o.size || 0); }
    token = r.isTruncated ? r.nextContinuationToken : undefined;
  } while (token);
  return { claves, bytes };
}

if (import.meta.main) {
  const i = process.argv.indexOf("--lista");
  let claves: string[], bytes = new Map<string, number>();
  if (i > 0) claves = (await Bun.file(process.argv[i + 1]).text()).split("\n").map((s) => s.trim()).filter(Boolean);
  else ({ claves, bytes } = await listarBucket());
  const plan = planear(claves);
  plan.bytes_liberados = plan.borraria.reduce((s, c) => s + (bytes.get(c) || 0), 0);
  console.log(JSON.stringify({ modo: "SIMULADO · no se borró nada", ...plan,
    resumen: { conservar: plan.conservar.length, borraria: plan.borraria.length, ignoradas: plan.ignoradas.length } }, null, 2));
}
