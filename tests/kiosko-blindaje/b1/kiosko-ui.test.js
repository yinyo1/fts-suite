// tests/kiosko-blindaje/b1/kiosko-ui.test.js
//
// B1 (#269): abre operaciones/kiosk/index.html real en Chromium, con el servidor
// n8n simulado (page.route), y comprueba qué pinta el kiosko en cada caso:
//   · nunca hay ✓ antes de la respuesta
//   · ✓ solo con success:true + attendance_id (o el placeholder de comida)
//   · 499/red, 200 vacío, ODOO_RECHAZO y success sin attendance_id → "No se guardó"
//   · reconciliación con kiosk/intento tras una falla
//   · "Reintentar" reenvía el MISMO intento_id
//   · el candado de negocio (ZONA_GRIS) conserva su modal
//   · el flujo olvido-entrada solo crea incidencia tras éxito real
//
// Run: node tests/kiosko-blindaje/b1/kiosko-ui.test.js
// Requiere Playwright (en este contenedor: /opt/node22/lib/node_modules/playwright).

'use strict';
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const PAGE = 'file://' + path.join(__dirname, '../../../operaciones/kiosk/index.html');
const N8N = 'https://n8n.test';

const ok = { success: true, accion_valida: true, tipo: 'entrada', attendance_id: 9001, mensaje: 'Check-in registrado exitosamente' };

// Cada escenario: respuestas en orden para /kiosk/checkin y /kiosk/intento.
// Una respuesta es {json}, {texto}, {status, texto}, {abort:true} o {delay, ...}.
const ESCENARIOS = [
  { id: 'ok', desc: 'Éxito: ✓ solo después de la respuesta, con el mensaje del servidor',
    checkin: [{ delay: 700, json: ok }], espera: 'ks-confirm', mensaje: 'Check-in registrado exitosamente', antes: 'ks-guardando' },
  { id: 'red-sin-reconciliar', desc: 'Red caída en los 3 intentos y kiosk/intento no lo conoce: "No se guardó"',
    checkin: [{ abort: true }, { abort: true }, { abort: true }], intento: [{ json: { procesado: false } }],
    espera: 'ks-nosave', motivo: 'No hubo conexión con el servidor.' },
  { id: 'red-reconciliado', desc: 'Red caída, pero kiosk/intento dice que SÍ se procesó: ✓ con la respuesta original',
    checkin: [{ abort: true }, { abort: true }, { abort: true }],
    intento: [{ json: { procesado: true, estado: 'ok', resultado: ok } }], espera: 'ks-confirm' },
  { id: 'vacio', desc: '200 vacío (workflow truena sin Respond): "No se guardó"',
    checkin: [{ texto: '' }, { texto: '' }, { texto: '' }], intento: [{ json: { procesado: false } }],
    espera: 'ks-nosave', motivo: 'El servidor no confirmó que se guardó.' },
  { id: 'odoo-rechazo', desc: 'ODOO_RECHAZO (accion_valida:false): "No se guardó" con el mensaje humano, no el modal de candado',
    checkin: [{ json: { success: false, accion_valida: false, codigo_error: 'ODOO_RECHAZO', mensaje: 'Odoo no aceptó tu checada: ya hay un registro posterior (10:27). Avisa a tu supervisor.', error_msg: 'x' } }],
    espera: 'ks-nosave', motivo: 'Odoo no aceptó tu checada: ya hay un registro posterior (10:27). Avisa a tu supervisor.' },
  { id: 'sin-attendance', desc: 'success:true pero sin attendance_id: "No se guardó"',
    checkin: [{ json: { success: true, accion_valida: true, tipo: 'entrada', attendance_id: null } }], espera: 'ks-nosave' },
  { id: 'comida', desc: 'Comida (placeholder, sin Odoo): ✓',
    tipo: 'salida_comida', checkin: [{ json: { success: true, accion_valida: true, tipo: 'salida_comida', attendance_id: null, placeholder: true, mensaje: 'Comida registrada' } }], espera: 'ks-confirm' },
  { id: 'candado', desc: 'Candado de negocio ZONA_GRIS: modal de siempre, sin "No se guardó"',
    checkin: [{ json: { success: false, accion_valida: false, codigo_error: 'ZONA_GRIS', error_msg: 'ZONA_GRIS:15.2', mensaje: 'Llevas 15.2 hrs' } }],
    espera: 'modal', modal: 'Llevas 15.2 hrs' },
  { id: 'reintentar', desc: '"Reintentar" reenvía el MISMO intento_id y, si el servidor contesta bien, pinta ✓',
    checkin: [{ abort: true }, { abort: true }, { abort: true }, { json: ok }], intento: [{ json: { procesado: false } }],
    espera: 'ks-nosave', reintentar: 'ks-confirm' },
  { id: 'en-proceso', desc: 'EN_PROCESO: el kiosko reconcilia y, cuando el servidor termina, pinta ✓',
    checkin: [{ json: { success: false, accion_valida: false, codigo_error: 'EN_PROCESO', mensaje: 'Tu checada anterior todavía se está guardando.' } }],
    intento: [{ json: { procesado: false, estado: 'en_proceso' } }, { json: { procesado: true, estado: 'ok', resultado: ok } }], espera: 'ks-confirm' },
  { id: 'tiempo-agotado', desc: 'TIEMPO_AGOTADO del servidor: "No se guardó" con su mensaje',
    checkin: [{ json: { success: false, accion_valida: false, codigo_error: 'TIEMPO_AGOTADO', mensaje: 'El servidor tardó demasiado y no guardó nada. Intenta de nuevo.' } }],
    espera: 'ks-nosave', motivo: 'El servidor tardó demasiado y no guardó nada. Intenta de nuevo.' },
  { id: 'olvido-ok', desc: 'Olvido de entrada + éxito: sí crea la incidencia',
    olvido: true, checkin: [{ json: ok }], incidencia: true, espera: 'modal-olvido' },
  { id: 'olvido-falla', desc: 'Olvido de entrada + falla: NO crea incidencia',
    olvido: true, checkin: [{ json: { success: false, accion_valida: false, codigo_error: 'ODOO_RECHAZO', mensaje: 'Odoo no aceptó' } }],
    incidencia: false, espera: 'ks-nosave' },
];

async function correr(browser, esc) {
  const page = await browser.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  const cuerpos = { checkin: [], intento: [], olvido: [] };
  const colas = { checkin: (esc.checkin || []).slice(), intento: (esc.intento || []).slice() };

  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith('file://')) return route.continue();
    if (!url.startsWith(N8N)) return route.abort();
    const body = (() => { try { return JSON.parse(route.request().postData() || '{}'); } catch (e) { return {}; } })();
    let cola = null, clave = null;
    if (url.endsWith('/webhook/kiosk/checkin')) { cola = colas.checkin; clave = 'checkin'; }
    else if (url.endsWith('/webhook/kiosk/intento')) { cola = colas.intento; clave = 'intento'; }
    else if (url.endsWith('/webhook/incidencias/crear-olvido-entrada')) {
      cuerpos.olvido.push(body);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, id_interno: 'INC-X', status: 'pendiente_supervisor' }) });
    } else {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    cuerpos[clave].push(body);
    const r = cola.shift() || { abort: true };
    if (r.delay) await new Promise(res => setTimeout(res, r.delay));
    if (r.abort) return route.abort('failed');
    if (r.json !== undefined) return route.fulfill({ status: r.status || 200, contentType: 'application/json', body: JSON.stringify(r.json) });
    return route.fulfill({ status: r.status || 200, contentType: 'application/json', body: r.texto || '' });
  });

  await page.addInitScript(({ n8n }) => {
    localStorage.setItem('ops_n8n_url', n8n);
    localStorage.setItem('ops_demo_mode', '0');
  }, { n8n: N8N });
  await page.goto(PAGE);
  await page.waitForTimeout(300);

  const inicio = Date.now();
  await page.evaluate(({ esc, n8n }) => {
    K.config.demoMode = false; K.config.n8nUrl = n8n;
    K.seleccionado = { id: 124, name: 'Empleado Demo', manager_id: 112 };
    K.tipo = esc.tipo || 'entrada';
    K.soSeleccionada = null; K.bolsaSeleccionada = null;
    K.geo = { lat: 1, lng: 1 }; K.geoAutorizada = true; K.geoSitio = 'FTS Monterrey';
    if (esc.olvido) K.olvidoEntradaData = { hora_declarada_cst: '07:00', motivo: 'Celular sin batería hoy', fecha: '2026-09-24' };
    window.__pantallas = [];
    const obs = new MutationObserver(() => {
      const a = document.querySelector('.kiosk-screen.active');
      const id = a && a.id;
      if (id && window.__pantallas[window.__pantallas.length - 1] !== id) window.__pantallas.push(id);
    });
    document.querySelectorAll('.kiosk-screen').forEach(s => obs.observe(s, { attributes: true, attributeFilter: ['class'] }));
    registrarAsistencia();
  }, { esc, n8n: N8N });

  const fallas = [];
  const esperaPantalla = async (id, ms) => {
    try { await page.waitForSelector('#' + id + '.active', { timeout: ms }); return true; } catch (e) { return false; }
  };

  if (esc.antes) {
    await page.waitForTimeout(250);
    const activa = await page.evaluate(() => (document.querySelector('.kiosk-screen.active') || {}).id);
    if (activa !== esc.antes) fallas.push('antes de la respuesta la pantalla era ' + activa + ', no ' + esc.antes);
  }

  if (esc.espera === 'modal') {
    try { await page.waitForFunction(t => document.body.innerText.includes(t), esc.modal, { timeout: 20000 }); }
    catch (e) { fallas.push('no apareció el modal de candado'); }
  } else if (esc.espera === 'modal-olvido') {
    try { await page.waitForSelector('#modalConfirmOlvEnt', { timeout: 20000 }); }
    catch (e) { fallas.push('no apareció el modal de olvido'); }
  } else if (!(await esperaPantalla(esc.espera, 25000))) {
    fallas.push('no llegó a ' + esc.espera + ' (activa: ' + await page.evaluate(() => (document.querySelector('.kiosk-screen.active') || {}).id) + ')');
  }

  const pantallas = await page.evaluate(() => window.__pantallas);
  const idxConfirm = pantallas.indexOf('ks-confirm');
  if (idxConfirm >= 0 && pantallas.indexOf('ks-guardando') > idxConfirm) fallas.push('ks-confirm antes de ks-guardando: ' + pantallas.join(' > '));
  if (!['ks-confirm', 'modal-olvido'].includes(esc.espera) && !esc.reintentar && pantallas.includes('ks-confirm')) fallas.push('se pintó ks-confirm en un caso de falla: ' + pantallas.join(' > '));

  if (esc.mensaje) {
    const m = await page.textContent('#confirm-mensaje');
    if (m !== esc.mensaje) fallas.push('mensaje del servidor: "' + m + '"');
  }
  if (esc.motivo) {
    const m = await page.textContent('#nosave-motivo');
    if (m !== esc.motivo) fallas.push('motivo: "' + m + '"');
  }
  if (esc.espera === 'ks-nosave') {
    const h = await page.textContent('#nosave-hora');
    if (!h || h === '—') fallas.push('sin hora del intento');
    const instr = await page.textContent('.kiosk-nosave-instr');
    if (!/avisa a tu supervisor/.test(instr)) fallas.push('sin instrucción de avisar al supervisor');
    await page.waitForTimeout(5000);   // no regresa sola (el autoReturn normal es de 4 s)
    const sigue = await page.evaluate(() => (document.querySelector('.kiosk-screen.active') || {}).id);
    if (sigue !== 'ks-nosave' && !esc.reintentar) fallas.push('la pantalla de error se fue sola a ' + sigue);
  }
  if (esc.reintentar) {
    await page.click('#btnReintentar');
    if (!(await esperaPantalla(esc.reintentar, 20000))) fallas.push('tras Reintentar no llegó a ' + esc.reintentar);
  }

  const ids = new Set(cuerpos.checkin.map(b => b.intento_id));
  if (cuerpos.checkin.length && (ids.size !== 1 || !/^[0-9a-f-]{36}$/.test([...ids][0]))) fallas.push('intento_id no único o mal formado: ' + [...ids].join(','));
  if (cuerpos.intento.length && cuerpos.intento[0].intento_id !== [...ids][0]) fallas.push('kiosk/intento consultó otro intento_id');
  if (esc.incidencia === true && cuerpos.olvido.length !== 1) fallas.push('esperaba 1 incidencia, hubo ' + cuerpos.olvido.length);
  if (esc.incidencia === false && cuerpos.olvido.length !== 0) fallas.push('se creó incidencia tras una falla');
  if (errores.length) fallas.push('pageerror: ' + errores.join(' | '));

  await page.close();
  return { fallas, ms: Date.now() - inicio, pantallas, llamadas: cuerpos.checkin.length };
}

(async () => {
  const browser = await chromium.launch();
  let bien = 0, malos = 0;
  console.log('\n=== Kiosko B1 en navegador (servidor simulado) ===');
  const solo = (process.argv.find(a => a.startsWith('--solo=')) || '').split('=')[1];
  for (const esc of ESCENARIOS) {
    if (solo && esc.id !== solo) continue;
    const r = await correr(browser, esc);
    if (r.fallas.length) { malos++; console.log('  ✗ ' + esc.desc + '\n      ' + r.fallas.join('\n      ')); }
    else { bien++; console.log('  ✓ ' + esc.desc + '  [' + r.pantallas.join(' > ') + ', ' + r.llamadas + ' POST]'); }
  }
  await browser.close();
  console.log('\n' + bien + ' ✓   ' + malos + ' ✗');
  process.exit(malos ? 1 : 0);
})();
