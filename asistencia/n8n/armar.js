#!/usr/bin/env node
/* asistencia/n8n/armar.js · Ensambla el SDK completo de un workflow de asistencia (#396 fase a).
 * Mismo patrón que retardos/n8n/armar.js: el .sdk.js lleva marcadores (__VALIDAR__…) en lugar del
 * código de cada Code node; el código vive en code/ y las librerías UNA vez:
 *   /*__DIAS__*\/ → asistencia/lib/dias-mx-usa.js (probada en tests/asistencia)
 *   /*__JWT__*\/  → docs/n8n-workflows/fase0/jwt-verify.js (verificador de la Suite)
 * Uso: node asistencia/n8n/armar.js eventos > /tmp/eventos.full.sdk.js
 *      node asistencia/n8n/armar.js kiosk     > JSON con el código de los 3 nodos nuevos de kiosk/checkin
 */
const fs = require('fs'), path = require('path');
const R = __dirname, RAIZ = path.join(R, '..', '..');
const PIEZAS = {
  'db-migrate': { __DECIDIR__: 'db-migrate-decidir.js' },
  eventos: { __VALIDAR__: 'eventos-validar.js', __PAYLOAD__: 'eventos-payload.js', __RESPUESTA__: 'eventos-respuesta.js' },
  'tipo-dia': { __VALIDAR__: 'tipo-dia-validar.js', __PROYECTOS__: 'tipo-dia-proyectos.js', __PAYLOAD__: 'tipo-dia-payload.js',
                __NOTA__: 'tipo-dia-nota.js', __RESPUESTA__: 'tipo-dia-respuesta.js', __RECHAZO__: 'tipo-dia-rechazo.js' },
  'dias-mx-usa': { __PUERTA__: 'reporte-puerta.js', __PROYECTOS__: 'reporte-proyectos.js', __PAYLOAD__: 'reporte-payload.js', __ARMAR__: 'reporte-armar.js' },
  vigia: { __VENTANA__: 'vigia-ventana.js', __PAYLOAD__: 'vigia-payload.js', __RESULTADO__: 'vigia-resultado.js' }
};
const LIBS = { '/*__DIAS__*/': 'asistencia/lib/dias-mx-usa.js', '/*__JWT__*/': 'docs/n8n-workflows/fase0/jwt-verify.js' };
function codigo(archivo) {
  let js = fs.readFileSync(path.join(R, 'code', archivo), 'utf8');
  for (const [mk, lib] of Object.entries(LIBS)) if (js.includes(mk)) js = js.split(mk).join(fs.readFileSync(path.join(RAIZ, lib), 'utf8'));
  return js;
}
const wf = process.argv[2];
if (wf === 'kiosk') {
  process.stdout.write(JSON.stringify({ entrada: codigo('kiosk-evento-entrada.js'), salida: codigo('kiosk-evento-salida.js'), falla: codigo('kiosk-falla-evento.js') }, null, 2));
  process.exit(0);
}
if (!PIEZAS[wf]) { console.error('uso: armar.js ' + Object.keys(PIEZAS).concat('kiosk').join('|')); process.exit(1); }
let sdk = fs.readFileSync(path.join(R, wf + '.sdk.js'), 'utf8');
for (const [mk, archivo] of Object.entries(PIEZAS[wf])) {
  if (sdk.split(mk).length !== 2) throw new Error(mk + ' no aparece exactamente 1 vez en ' + wf);
  sdk = sdk.split(mk).join(JSON.stringify(codigo(archivo)));
}
process.stdout.write(sdk);
