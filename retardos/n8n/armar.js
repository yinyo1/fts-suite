#!/usr/bin/env node
/* retardos/n8n/armar.js · Reconstruye el SDK completo de un workflow de Retardos (#334)
 *
 * Los .sdk.js del repo llevan marcadores (__LEER__, __PREPARAR__, …) en lugar del código de
 * cada Code node, y el código de cada nodo lleva marcadores de librería (/*__PDF__*\/,
 * /*__SESION__*\/). Así una librería vive UNA vez (retardos/lib) y se prueba con
 * tests/retardos. Este script junta las piezas y escribe el SDK listo para
 * validate_workflow / create_workflow_from_code del MCP de n8n.
 *
 * Uso: node retardos/n8n/armar.js enviar > /tmp/enviar.full.sdk.js
 * Sin credenciales: los SDK sólo nombran credenciales por id; los secretos viven en n8n/Railway.
 */
const fs = require('fs'), path = require('path');
const R = __dirname, LIB = path.join(R, '..', 'lib');
const PIEZAS = {
  'db-migrate': { __DECIDIR__: 'db-migrate-decidir.js' },
  detectar: { __LEER__: 'detectar-leer.js' },
  enviar: { __PREPARAR__: 'enviar-preparar.js', __RESULTADO__: 'enviar-resultado.js' },
  verificar: { __NOMINA__: 'verificar-nomina.js' },
  'resumen-semanal': {},
  latido: { __ALERTA__: 'latido-alerta.js' },
  lector: { __DECIDIR__: 'lector-decidir.js', __MAPEAR__: 'lector-mapear.js' },
  panel: { __PUERTA__: 'panel-puerta.js' },
  error: { __ALERTA__: 'error-alerta.js' },
  hojas: { __ARCHIVOS__: 'hojas-archivos.js', __REGISTRAR__: 'hojas-registrar.js', __BINARIO__: 'hojas-binario.js', __RESULTADO__: 'hojas-resultado.js' }
};
const LIBS = { '/*__PDF__*/': 'pdf.js', '/*__SESION__*/': 'sesion.js', '/*__NORMALIZAR__*/': 'normalizar.js' };
const wf = process.argv[2];
if (!PIEZAS[wf]) { console.error('uso: armar.js ' + Object.keys(PIEZAS).join('|')); process.exit(1); }
let sdk = fs.readFileSync(path.join(R, wf + '.sdk.js'), 'utf8');
for (const [mk, archivo] of Object.entries(PIEZAS[wf])) {
  let js = fs.readFileSync(path.join(R, 'code', archivo), 'utf8');
  for (const [lmk, lib] of Object.entries(LIBS)) {
    if (js.includes(lmk)) js = js.split(lmk).join(fs.readFileSync(path.join(LIB, lib), 'utf8'));
  }
  if (sdk.split(mk).length !== 2) throw new Error(mk + ' no aparece exactamente 1 vez en ' + wf);
  sdk = sdk.split(mk).join(JSON.stringify(js));
}
process.stdout.write(sdk);
