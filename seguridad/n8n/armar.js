#!/usr/bin/env node
/* seguridad/n8n/armar.js · Arma el SDK de seguridad/dc3-empleados (#507), igual que retardos/n8n/armar.js:
 * el código de cada Code node vive en seguridad/n8n/code y la librería de firma UNA vez en
 * retardos/lib/sesion.js (la misma que firma en el navegador).
 * Uso: node seguridad/n8n/armar.js > /tmp/dc3-empleados.full.sdk.js
 */
const fs = require('fs'), path = require('path');
const R = __dirname, LIB = path.join(R, '..', '..', 'retardos', 'lib');
let sdk = fs.readFileSync(path.join(R, 'dc3-empleados.sdk.js'), 'utf8');
for (const [mk, archivo] of Object.entries({ __PUERTA__: 'dc3-puerta.js', __RESPONDER__: 'dc3-responder.js' })) {
  let js = fs.readFileSync(path.join(R, 'code', archivo), 'utf8');
  if (js.includes('/*__SESION__*/')) js = js.split('/*__SESION__*/').join(fs.readFileSync(path.join(LIB, 'sesion.js'), 'utf8'));
  if (js.indexOf(String.fromCharCode(92)) >= 0) throw new Error(archivo + ' lleva diagonal invertida (el MCP la colapsa, CLAUDE.md §17 2c)');
  if (sdk.split(mk).length !== 2) throw new Error(mk + ' no aparece exactamente 1 vez');
  sdk = sdk.split(mk).join(JSON.stringify(js));
}
process.stdout.write(sdk);
