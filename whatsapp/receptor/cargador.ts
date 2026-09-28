// memoria-receptor · CARGADOR (esto es lo único que vive en la Railway Function).
// Baja el paquete del receptor del repo POR COMMIT, verifica su sha256 y lo ejecuta.
// Cambiar de versión = cambiar RECEPTOR_URL y RECEPTOR_SHA256 (variables), nada más.
import { createHash } from "node:crypto";
const url = Bun.env.RECEPTOR_URL || "", esperado = (Bun.env.RECEPTOR_SHA256 || "").toLowerCase();
if (!/^https:\/\/raw\.githubusercontent\.com\/yinyo1\/fts-suite\/[0-9a-f]{40}\//.test(url)) throw new Error("RECEPTOR_URL debe apuntar a un commit fijo de yinyo1/fts-suite");
const r = await fetch(url);
if (!r.ok) throw new Error(`no pude bajar el receptor: HTTP ${r.status}`);
const codigo = await r.text();
const real = createHash("sha256").update(codigo).digest("hex");
if (real !== esperado) throw new Error(`sha256 del receptor no cuadra: ${real.slice(0, 12)}… ≠ ${esperado.slice(0, 12)}…`);
await Bun.write("/tmp/receptor.js", codigo);
console.log(`[cargador] receptor ${real.slice(0, 12)}… verificado`);
await import("/tmp/receptor.js");
