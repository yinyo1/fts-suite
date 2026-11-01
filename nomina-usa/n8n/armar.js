#!/usr/bin/env node
/* nomina-usa/n8n/armar.js · arma el SDK completo de un workflow de Nómina USA (#448).
 * Mismo mecanismo que retardos/n8n/armar.js: el .sdk.js lleva marcadores (__PUERTA__…) y
 * cada Code lleva marcadores de librería. La librería de sesión es la de Retardos: una
 * sola implementación de JWT+HMAC en la suite.
 * Uso: node nomina-usa/n8n/armar.js panel > /tmp/panel.full.sdk.js
 */
const fs = require('fs'), path = require('path');
const R = __dirname, RAIZ = path.join(R, '..', '..');
const PIEZAS = {
  panel: { __PUERTA__: 'panel-puerta.js' },
  kiosko: { __VALIDAR__: 'kiosko-validar.js' },
  alertas: { __LEER__: 'alertas-leer.js' }
};
const LIBS = { '/*__SESION__*/': 'retardos/lib/sesion.js', '/*__KIOSKO__*/': 'shared/nomina-usa/kiosko.js', '/*__ALERTAS__*/': 'shared/nomina-usa/alertas.js' };
function armar(wf) {
  if (!PIEZAS[wf]) throw new Error('uso: armar.js ' + Object.keys(PIEZAS).join('|'));
  let sdk = fs.readFileSync(path.join(R, wf + '.sdk.js'), 'utf8');
  for (const [mk, archivo] of Object.entries(PIEZAS[wf])) {
    let js = fs.readFileSync(path.join(R, 'code', archivo), 'utf8');
    for (const [lmk, lib] of Object.entries(LIBS)) if (js.includes(lmk)) js = js.split(lmk).join(fs.readFileSync(path.join(RAIZ, lib), 'utf8'));
    if (sdk.split(mk).length !== 2) throw new Error(mk + ' no aparece exactamente 1 vez en ' + wf);
    sdk = sdk.split(mk).join(JSON.stringify(js));
  }
  return sdk;
}
if (require.main === module) process.stdout.write(armar(process.argv[2]));
module.exports = { armar, PIEZAS };
