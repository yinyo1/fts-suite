// Test de la logica de Code - MAIN contra data REAL de Odoo (sale.order state=sent)
// + casos sinteticos para los caminos que la realidad no ejerce hoy (amarillo/verde/ruido).
const NOW_ISO = "2026-07-16T22:20:00.000Z";
const F = { hoy_ymd: "2026-07-16", ventana: 365, now_iso: NOW_ISO };

// --- data REAL (muestra de las 122; incluye SO11258 SIN OWNER y company 6) ---
const REAL = [
  { id:11333, name:"SO11135", amount_total:22683898.6, company_id:[1,"SERVICIOS FTS"], create_date:"2025-09-11T22:10:46+00:00", write_date:"2026-05-27T17:56:35+00:00", partner_id:[94,"Nalco de Mexico SA. de .CV"], user_id:[12,"Sales FTS"] },
  { id:11550, name:"SO11352", amount_total:8021681.88, company_id:[1,"SERVICIOS FTS"], create_date:"2025-11-27T15:56:43+00:00", write_date:"2026-05-27T17:56:35+00:00", partner_id:[94,"Nalco de Mexico SA. de .CV"], user_id:[12,"Sales FTS"] },
  { id:11240, name:"SO11046", amount_total:3286686, company_id:[1,"SERVICIOS FTS"], create_date:"2025-08-21T23:34:13+00:00", write_date:"2025-11-28T03:13:06+00:00", partner_id:[66,"CBRE GCS, S. de R.L. de C.V."], user_id:[12,"Sales FTS"] },
  { id:11456, name:"SO11258", amount_total:2314200, company_id:[1,"SERVICIOS FTS"], create_date:"2025-10-29T20:42:44+00:00", write_date:"2025-11-28T03:13:06+00:00", partner_id:[2003,"Terra Energy"], user_id:false },
  { id:11886, name:"SO11687", amount_total:1352665, company_id:[6,"FTS FULL TECHNOLOGY SYSTEMS LLC"], create_date:"2026-04-24T21:33:04+00:00", write_date:"2026-04-29T21:01:42+00:00", partner_id:[1630,"Mission Foods"], user_id:[12,"Sales FTS"] },
  { id:11250, name:"SO11055", amount_total:234, company_id:[6,"FTS FULL TECHNOLOGY SYSTEMS LLC"], create_date:"2025-08-25T23:18:08+00:00", write_date:"2025-11-28T03:13:06+00:00", partner_id:[1878,"WMC"], user_id:[12,"Sales FTS"] },
  { id:11678, name:"SO11480", amount_total:0, company_id:[1,"SERVICIOS FTS"], create_date:"2025-12-17T00:14:33+00:00", write_date:"2025-12-17T03:49:28+00:00", partner_id:[815,"Budenheim Mexico"], user_id:[12,"Sales FTS"] },
  { id:11415, name:"SO11217", amount_total:657.61, company_id:[1,"SERVICIOS FTS"], create_date:"2025-10-06T20:06:05+00:00", write_date:"2025-11-28T03:13:06+00:00", partner_id:[1949,"PRODELCOM"], user_id:[12,"Sales FTS"] }
];
// --- sinteticos: caminos que la data real NO ejerce hoy (todo esta rojo) ---
const SYN = [
  { id:99001, name:"SYN-AMARILLO", amount_total:500000, company_id:[1,"x"], create_date:"2026-07-01T10:00:00+00:00", write_date:"2026-07-12T10:00:00+00:00", partner_id:[1,"Cliente Amarillo"], user_id:[2,"Jesus Esteban De La Cruz"] },
  { id:99002, name:"SYN-VERDE", amount_total:800000, company_id:[1,"x"], create_date:"2026-07-10T10:00:00+00:00", write_date:"2026-07-15T10:00:00+00:00", partner_id:[1,"Cliente Verde"], user_id:[2,"Jesus Esteban De La Cruz"] },
  { id:99003, name:"SYN-SINFECHA", amount_total:900000, company_id:[1,"x"], create_date:"2026-07-10T10:00:00+00:00", write_date:false, partner_id:[1,"Cliente Sin Fecha"], user_id:false },
  { id:99004, name:"SYN-OTRACOMPANY", amount_total:900000, company_id:[3,"FTS BRASIL"], create_date:"2026-07-10T10:00:00+00:00", write_date:"2025-01-01T10:00:00+00:00", partner_id:[1,"Fuera de scope"], user_id:[12,"Sales FTS"] }
];
const RAW = REAL.concat(SYN);

const C = { activo:true, canary:true, recipients:{ esteban:"estebandelacruz@fts.mx", equipo:[] }, companies:[1,6],
            umbral_amarillo_dias:4, umbral_rojo_dias:6, ventana_dias:365, top_n_por_vendedor:15, monto_minimo:1000, fx_usd_mxn:17.35 };

// ===== logica identica a Code - MAIN =====
const R = C.recipients, AM = C.umbral_amarillo_dias, RO = C.umbral_rojo_dias, TOP = C.top_n_por_vendedor,
      FX = C.fx_usd_mxn, MIN = C.monto_minimo, COMPANIES = C.companies;
const aId = v => Array.isArray(v) ? v[0] : (v || null);
const aName = v => Array.isArray(v) ? (v[1] || '') : '';
function parseOdooUtc(s){ if(!s) return null; return new Date(String(s).replace(' ','T').replace(/\+00:00$/,'') + 'Z'); }
const now = new Date(F.now_iso);
function diasDesde(dt){ const d = parseOdooUtc(dt); if(!d || isNaN(d)) return null; return (now - d) / 86400000; }
function montoMxn(o){ return aId(o.company_id) === 6 ? (o.amount_total||0) * FX : (o.amount_total||0); }
function monedaLabel(o){ return aId(o.company_id) === 6 ? 'USD' : 'MXN'; }

const enScope = RAW.filter(o => COMPANIES.indexOf(aId(o.company_id)) !== -1);
const ordenes = enScope.filter(o => montoMxn(o) >= MIN);
const filtradas = enScope.length - ordenes.length;
const rojas = [], amarillas = [], al_dia = [];
for (const o of ordenes) {
  const d = diasDesde(o.write_date);
  const row = { name:o.name, cliente:aName(o.partner_id), monto:o.amount_total, monto_mxn:montoMxn(o), moneda:monedaLabel(o), dias:d, user_id:aId(o.user_id), vendedor:aName(o.user_id) };
  if (d === null) rojas.push(row); else if (d >= RO) rojas.push(row); else if (d >= AM) amarillas.push(row); else al_dia.push(row);
}
const SIN_OWNER = '__sin_owner__', buckets = {};
for (const r of rojas.concat(amarillas)) {
  const k = r.user_id ? String(r.user_id) : SIN_OWNER;
  if (!buckets[k]) buckets[k] = { vendedor: r.user_id ? (r.vendedor || ('user ' + r.user_id)) : 'SIN OWNER', rojas: [], amarillas: [] };
  (r.dias === null || r.dias >= RO ? buckets[k].rojas : buckets[k].amarillas).push(r);
}
const orden = Object.keys(buckets).sort((a, b) => {
  if (a === SIN_OWNER) return -1;
  if (b === SIN_OWNER) return 1;
  const sa = buckets[a].rojas.length, sb = buckets[b].rojas.length;
  if (sb !== sa) return sb - sa;
  return buckets[a].vendedor.localeCompare(buckets[b].vendedor);
});

// ===== asserts =====
let ok = 0, fail = 0;
const t = (n, cond, det) => { if (cond) { ok++; console.log("  PASS  " + n); } else { fail++; console.log("  FAIL  " + n + (det ? "  -> " + det : "")); } };
console.log("\n=== TEST comercial/watchdog-enviadas . Code - MAIN ===");
console.log("in: " + RAW.length + " | en scope: " + enScope.length + " | tras monto_minimo: " + ordenes.length + " | filtradas: " + filtradas + "\n");
t("Excluye companies fuera de [1,6] (SYN-OTRACOMPANY)", !enScope.some(o => o.name === "SYN-OTRACOMPANY"));
t("Filtra ruido de portal por monto_minimo ($0 y $657)", filtradas === 2, "filtradas=" + filtradas);
t("NO filtra 234 USD (=4060 MXN, sobre el minimo)", ordenes.some(o => o.name === "SO11055"));
t("Clasifica ROJO >=6d", rojas.some(r => r.name === "SO11135"));
t("Clasifica AMARILLO 4-5d", amarillas.length === 1 && amarillas[0].name === "SYN-AMARILLO", "amarillas=" + amarillas.map(a => a.name));
t("Clasifica AL DIA <4d", al_dia.length === 1 && al_dia[0].name === "SYN-VERDE", "al_dia=" + al_dia.map(a => a.name));
t("write_date nulo => ROJO (fail-closed, no se cuela)", rojas.some(r => r.name === "SYN-SINFECHA"));
t("SIN OWNER va PRIMERO en el orden", orden[0] === SIN_OWNER, "orden=" + orden);
t("SIN OWNER agrupa SO11258 + SYN-SINFECHA", buckets[SIN_OWNER].rojas.length === 2);
t("Normaliza company 6 a MXN (1,352,665 USD -> 23.46M)", Math.round(rojas.find(r => r.name === "SO11687").monto_mxn) === 23468738, "got=" + Math.round(rojas.find(r => r.name === "SO11687").monto_mxn));
t("Conserva monto nominal + etiqueta de moneda", rojas.find(r => r.name === "SO11687").moneda === "USD" && rojas.find(r => r.name === "SO11687").monto === 1352665);
t("company 1 NO se multiplica por FX", rojas.find(r => r.name === "SO11135").monto_mxn === 22683898.6);
const sorted = [...buckets["12"].rojas].sort((x, y) => y.monto_mxn - x.monto_mxn);
// El tope es SO11687, NO SO11135: 1,352,665 USD x 17.35 = $23.4M MXN supera los $22.6M MXN
// de SO11135. Es la normalizacion haciendo su trabajo: ordena por valor real comparable,
// no por el numero nominal. (Si esa orden resulta ser MXN mal etiquetada -- ambiguedad
// residual de RIESGO-1 -- deja de ser la mayor. Por eso el correo muestra ambos.)
t("Ordena por monto MXN normalizado desc (si top_n corta, corta lo chico)",
  sorted[0].name === "SO11687" && sorted[sorted.length - 1].name === "SO11055",
  "top=" + sorted[0].name + " last=" + sorted[sorted.length - 1].name);
t("Normalizar cambia el ranking vs monto nominal (RIESGO-1 importa)",
  sorted[0].name !== [...buckets["12"].rojas].sort((x, y) => y.monto - x.monto)[0].name);
t("Bucket Sales FTS existe y es el generico (RIESGO-3)", buckets["12"].vendedor === "Sales FTS");
console.log("\n--- Resumen del digest que se enviaria ---");
console.log("rojas: " + rojas.length + " | amarillas: " + amarillas.length + " | al dia: " + al_dia.length);
console.log("valor en riesgo MXN: $" + Math.round(rojas.concat(amarillas).reduce((a, r) => a + r.monto_mxn, 0)).toLocaleString('en-US'));
for (const k of orden) console.log("  bucket[" + buckets[k].vendedor + "]  rojas=" + buckets[k].rojas.length + " amarillas=" + buckets[k].amarillas.length);
console.log("\n" + ok + " pass / " + fail + " fail");
process.exit(fail ? 1 : 0);
