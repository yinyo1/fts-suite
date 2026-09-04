// ═══ Capturas para el manual de Nómina · Incidencias ═══
//
// Corre el módulo en modo PRÁCTICA y fotografía las pantallas que el manual explica.
// PRÁCTICA a propósito: los datos de práctica están hechos para que se vean los casos
// incómodos —un bono sin proyecto, días que no cuadran, una deuda viva— que son
// justo los que hay que enseñar. Con datos reales de un martes cualquiera saldrían
// nueve capturas en verde que no enseñan nada.
//
//   node scripts/capturas-nomina.js [carpeta-destino]

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/tmp/manual-nomina');
const EXE = process.env.CHROMIUM_EXE || '/opt/pw-browsers/chromium';

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function servir() {
  return new Promise(res => {
    const s = http.createServer((req, rep) => {
      const p = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rep.writeHead(404); return rep.end('no'); }
      rep.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
      rep.end(fs.readFileSync(p));
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

const tomadas = [];
// JPEG y no PNG: el manual va incrustado en un solo archivo HTML para que Esteban
// lo mande por correo sin carpeta de imágenes al lado. En PNG a 2x pesaba 2.4 MB,
// que en base64 son 3.2 MB de archivo; en JPEG son ~350 KB y a la vista es lo mismo
// porque son capturas de pantalla, no fotos.
async function foto(target, nombre, nota) {
  const f = path.join(OUT, nombre + '.jpg');
  await target.screenshot({ path: f, type: 'jpeg', quality: 80 });
  const kb = Math.round(fs.statSync(f).size / 1024);
  tomadas.push({ nombre, nota, kb, archivo: nombre + '.jpg' });
  console.log('  📸 ' + nombre + '.jpg · ' + kb + ' KB · ' + nota);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await servir();
  const base = 'http://127.0.0.1:' + srv.address().port + '/modulos/rh/nomina-incidencias/index.html';
  const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });

  // ── 1. La puerta, SIN sesión ───────────────────────────────────────────
  const pg0 = await ctx.newPage();
  await pg0.goto(base, { waitUntil: 'networkidle' });
  await pg0.waitForTimeout(300);
  await foto(pg0, '01-entrar', 'La pantalla de entrada');
  await pg0.close();

  // ── El resto ya con sesión sembrada ────────────────────────────────────
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('fts_suite_session', JSON.stringify({
        token: 'x.y.z', expires_at: new Date(Date.now() + 36000e3).toISOString(),
        user: 'magaly.perez', nombre: 'Magaly Estefanía Pérez García', scopes: ['nomina:write']
      }));
      localStorage.setItem('fts_nomina_modo', 'demo');
    } catch (e) {}
  });

  const pg = await ctx.newPage();
  await pg.goto(base, { waitUntil: 'networkidle' });
  await pg.waitForSelector('#tb tr[data-id]');
  await pg.waitForTimeout(400);

  await foto(pg, '02-roster', 'La lista de la semana, recién abierta');
  await foto(pg.locator('.rh-topbar'), '03-barra', 'La barra de arriba, con la insignia de modo');
  await foto(pg.locator('#banner'), '04-banner', 'El aviso que dice por qué todavía no se puede enviar');
  await foto(pg.locator('#filtros'), '05-filtros', 'Los filtros');

  // Un renglón en rojo y uno en verde, lado a lado.
  await foto(pg.locator('#tb'), '06-tabla', 'Los renglones: en rojo los que algo les falta');

  // ── El cajón de captura ────────────────────────────────────────────────
  await pg.evaluate(() => window.NomApp.abrir(57));      // Samuel: bono sin proyecto
  await pg.waitForTimeout(350);
  await foto(pg, '07-cajon', 'El cajón de captura de una persona');
  await foto(pg.locator('.dbody .box').first(), '08-candado', 'El candado aritmético');

  // Agregar una declaración: el formulario abierto.
  await pg.click('#addDecl');
  await pg.waitForTimeout(300);
  await foto(pg.locator('#zonaDecl'), '09-nueva-declaracion', 'Al agregar una declaración: primero se elige el tipo');

  // Anticipo: el aviso de "es préstamo, no costo".
  const sel = pg.locator('#zonaDecl select').first();
  await sel.selectOption('anticipo_sueldo');
  await pg.waitForTimeout(300);
  await foto(pg.locator('#zonaDecl'), '10-anticipo', 'El anticipo avisa que es préstamo, no costo del proyecto');

  await pg.evaluate(() => { const s = document.querySelector('#zonaDecl select[id*="fuente"], #zonaDecl select'); });
  await pg.waitForTimeout(200);

  // Cerrar el formulario sin guardar y salir del cajón.
  await pg.evaluate(() => window.NomApp.cerrar());
  await pg.waitForTimeout(300);

  // Una persona con estado vivo: el inactivo con deuda.
  await pg.evaluate(() => window.NomApp.abrir(48));
  await pg.waitForTimeout(350);
  await foto(pg.locator('#drawer .dpanel'), '11-estado', 'Alguien dado de baja que todavía arrastra una deuda');
  await pg.evaluate(() => window.NomApp.cerrar());
  await pg.waitForTimeout(300);

  // ── El premio de puntualidad, y la ventana que pide la nota ────────────
  await pg.evaluate(() => window.NomApp.abrir(57));   // Samuel: llegó tarde un día
  await pg.waitForTimeout(350);
  await foto(pg.locator('.dbody .box').nth(1), '14-premio', 'El premio, con la evidencia día por día');
  await pg.evaluate(() => window.NomApp.cerrar());
  await pg.waitForTimeout(250);

  await pg.click('tr[data-id="57"] [data-ppa]');
  await pg.waitForTimeout(300);
  await pg.fill('#ppaNota', 'Felipe lo citó 08:00 el martes, no llegó tarde.');
  await foto(pg.locator('.mpanel'), '15-nota-premio', 'Cambiar el premio pide decir por qué');
  await pg.evaluate(() => { const m = document.querySelector('.modal'); if (m) m.remove(); });
  await pg.waitForTimeout(200);

  // ── Disputas ───────────────────────────────────────────────────────────
  await pg.evaluate(() => window.NomApp.irA(2));
  await pg.waitForTimeout(400);
  await foto(pg, '12-disputas', 'Las checadas en disputa');

  // La ventana del flujo de aprobación, con una acción ya elegida.
  await pg.click('#p2 [data-acc="resolver"]');
  await pg.waitForTimeout(400);
  await pg.click('[data-accion="ajustar"]');
  await pg.waitForTimeout(200);
  await pg.fill('#rhora', '23:05');
  await pg.fill('#rcom', 'Fue turno de noche; la salida real fue 23:05.');
  await foto(pg.locator('.mpanel'), '16-resolver', 'El flujo de aprobación, el mismo del panel de incidencias');
  await pg.evaluate(() => { const m = document.querySelector('.modal'); if (m) m.remove(); });
  await pg.waitForTimeout(200);

  // ── Cierre ─────────────────────────────────────────────────────────────
  await pg.evaluate(() => window.NomApp.irA(3));
  await pg.waitForTimeout(400);
  await foto(pg, '13-cierre', 'La pantalla de cierre, con los totales');

  await browser.close();
  srv.close();

  fs.writeFileSync(path.join(OUT, 'indice.json'), JSON.stringify(tomadas, null, 1));
  console.log('\n' + tomadas.length + ' capturas en ' + OUT);
})();
