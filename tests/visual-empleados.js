// ═══ Revisión visual + de contrato — RH · Alta / Baja de empleados (A4, issue #259) ═══
//
// POR QUÉ ESTE GATE. A4 mete DOS campos nuevos (`employee_type` nativo de Odoo y
// `x_studio_codigo_contpaqi`) y una regla que los ata. Nada de eso se puede revisar
// leyendo el diff: la regla se ve o no se ve EN PANTALLA, y el dropdown puede quedar
// correcto en el HTML y vacío en el render (§20 #12 — «una pantalla se revisa
// mirándola, no leyendo su código»).
//
// LO QUE VIGILA, y por qué cada cosa:
//   1. El dropdown expone SOLO dos opciones. Odoo acepta más; exponerlas seria dejar
//      que RH ponga un valor que ningun otro pedazo del sistema entiende.
//   2. Un valor de Odoo FUERA de la lista blanca NO se pisa: aparece marcado y
//      seleccionado. Si el gate desaparece, el guardado siguiente lo convertiria en
//      'employee' sin que nadie lo viera (§20 #13).
//   3. La regla de dos estados pinta lo correcto en los CUATRO cruces, y se calla
//      fuera de las empresas de CONTPAQi (§9 — CAJERO 1 no es de FTS).
//   4. El codigo de CONTPAQi NO es obligatorio en el navegador: 101 de 132 empleados
//      del padron no lo tienen.
//
// CÓMO SE CORRE (el navegador YA está en el contenedor — NO correr `playwright install`):
//   node tests/visual-empleados.js
//   SHOTS_DIR=/ruta node tests/visual-empleados.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const CANDIDATOS = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium'
].filter(Boolean);
const EXE = CANDIDATOS.find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });

const OUT = process.env.SHOTS_DIR || require('os').tmpdir() + '/shots-empleados';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0; const fails = []; let vp = '';
function check(n, c, d) {
  if (c) { pass++; console.log('✓ [' + vp + '] ' + n); return true; }
  fails.push('[' + vp + '] ' + n + (d ? ' → ' + d : ''));
  console.log('✗ [' + vp + '] ' + n + (d ? ' → ' + d : ''));
  return false;
}

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

const esDelEntorno = t => /ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_BLOCKED|fonts\.googleapis|fonts\.gstatic|net::ERR/.test(t);

const VIEWPORTS = [
  ['desktop-1440', 1440, 900],
  ['laptop-1280', 1280, 800],
  ['movil-390', 390, 844]
];

// ── Catálogos y fichas simuladas. El servidor real está fuera del alcance de red del
//    contenedor, así que los webhooks se contestan aquí. Lo que se prueba es la
//    PANTALLA; el contrato del servidor se verificó aparte contra la ejecución real.
const LOOKUPS = {
  companies:  [{ id: 1, name: 'SERVICIOS FTS' }, { id: 6, name: 'FTS USA LLC' }, { id: 10, name: 'Taqueria los Jimenez' }],
  departments:[{ id: 3, name: 'Operaciones' }, { id: 17, name: 'Ingenieria' }],
  managers:   [{ id: 32, name: 'Esteban De La Cruz' }, { id: 112, name: 'Felipe Perez' }, { id: 127, name: 'Cesar Gomez' }],
  jobs:       [{ id: 31, name: 'Operations Manager' }, { id: 40, name: 'Soldador' }],
  calendars:  [{ id: 2, name: 'Campo', hours_per_week: 48 }, { id: 6, name: 'Oficina', hours_per_week: 48 }],
  reasons:    [{ id: 1, name: 'Fired' }, { id: 2, name: 'Resigned' }]
};
function ficha(over) {
  return Object.assign({
    id: 127, name: 'Cesar Gildardo Gomez Cano', work_email: 'x@fts.mx', private_email: '',
    mobile_phone: '', work_phone: '', department_id: 3, parent_id: 112, job_id: 40,
    resource_calendar_id: 2, company_id: 1, pin: '1234', x_studio_hora_entrada: 7,
    x_categoria_nomina: '', x_aplica_ppa: true,
    employee_type: 'employee', x_studio_codigo_contpaqi: '058', image_128: null
  }, over || {});
}
let FICHA_ACTUAL = ficha();

async function montar(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('fts_session', JSON.stringify({
        userId: 1, username: 'esteban.delacruz', nombre: 'Esteban', role: 'master',
        modulos: 'all', loginTime: Date.now(), lastActivity: Date.now()
      }));
    } catch (e) {}
  });
  const json = (r, obj) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj) });
  await ctx.route('**/webhook/rh/empleado/lookups',    r => json(r, LOOKUPS));
  await ctx.route('**/webhook/rh/empleados/archivados',r => json(r, { empleados: [] }));
  await ctx.route('**/webhook/rh/empleado/detalle',    r => json(r, { ok: true, empleado: FICHA_ACTUAL }));
  return ctx;
}

// Lee el estado pintado del aviso de un panel.
const leerAviso = sel => ({ sel }) => {
  const a = document.querySelector(sel);
  if (!a) return { existe: false };
  const cs = getComputedStyle(a);
  return {
    existe: true, oculto: a.hidden, clase: a.className, texto: (a.textContent || '').trim(),
    alto: a.getBoundingClientRect().height, visible: cs.display !== 'none' && cs.visibility !== 'hidden'
  };
};

(async () => {
  if (!EXE) { console.error('No encuentro chromium en el contenedor. Probé:\n  ' + CANDIDATOS.join('\n  ')); process.exit(2); }
  const srv = await servir();
  const base = 'http://127.0.0.1:' + srv.address().port + '/modulos/rh/empleados/index.html';
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

  for (const [nombre, w, h] of VIEWPORTS) {
    vp = nombre;
    FICHA_ACTUAL = ficha();
    const ctx = await montar(browser, w, h);
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(String(e && e.message || e)));
    page.on('console', m => { if (m.type() === 'error' && !esDelEntorno(m.text())) errores.push('console: ' + m.text()); });

    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => {
      const s = document.querySelector('#formAlta [name="employee_type"]');
      return s && s.options.length > 1;
    }, { timeout: 8000 }).catch(() => {});

    // ── 1. El dropdown existe en los DOS forms y expone SOLO dos opciones ──
    for (const form of ['#formAlta', '#formEditar']) {
      const op = await page.evaluate(sel => {
        const s = document.querySelector(sel + ' [name="employee_type"]');
        if (!s) return null;
        return { req: s.required, opciones: Array.from(s.options).map(o => [o.value, o.textContent]), valor: s.value };
      }, form);
      if (!check('existe el dropdown de tipo en ' + form, !!op)) continue;
      check(form + ': exactamente 3 opciones (vacía + 2)', op.opciones.length === 3, JSON.stringify(op.opciones));
      check(form + ': primera opción vacía (sin preselección)', op.opciones[0][0] === '', op.opciones[0][0]);
      check(form + ': opción employee → Empleado',
        op.opciones[1][0] === 'employee' && /Empleado/.test(op.opciones[1][1]), JSON.stringify(op.opciones[1]));
      check(form + ': opción freelance → Externo / Honorarios',
        op.opciones[2][0] === 'freelance' && /Externo/.test(op.opciones[2][1]), JSON.stringify(op.opciones[2]));
      check(form + ': el dropdown es obligatorio', op.req === true, 'required=' + op.req);
    }
    check('alta: el tipo arranca SIN valor',
      (await page.$eval('#formAlta [name="employee_type"]', s => s.value)) === '');

    // ── 2. El # CONTPAQi existe y NO es obligatorio ──
    for (const form of ['#formAlta', '#formEditar']) {
      const c = await page.evaluate(sel => {
        const i = document.querySelector(sel + ' [name="x_studio_codigo_contpaqi"]');
        return i ? { req: i.required, tipo: i.type } : null;
      }, form);
      if (!check('existe el # CONTPAQi en ' + form, !!c)) continue;
      check(form + ': el # CONTPAQi NO es obligatorio', c.req === false, 'required=' + c.req);
    }

    // ── 3. La regla de dos estados, los cuatro cruces + fuera de CONTPAQi ──
    async function cruce(tipo, codigo, empresa) {
      await page.evaluate(([t, c, e]) => {
        const f = document.querySelector('#formAlta');
        f.elements['company_id'].value = e;
        f.elements['employee_type'].value = t;
        f.elements['x_studio_codigo_contpaqi'].value = c;
        f.elements['employee_type'].dispatchEvent(new Event('change', { bubbles: true }));
      }, [tipo, codigo, empresa]);
      return page.evaluate(leerAviso('#altaAviso'), { sel: '#altaAviso' });
    }

    let a = await cruce('employee', '', '1');
    check('de planta + SIN código → avisa FUERTE',
      !a.oculto && /rh-aviso-falta/.test(a.clase) && /CONTPAQi/.test(a.texto), a.clase + ' · ' + a.texto.slice(0, 70));
    check('de planta + SIN código → el aviso mide algo en pantalla', a.alto > 10 && a.visible, 'alto=' + a.alto);

    a = await cruce('freelance', '', '1');
    check('externo + SIN código → tranquilo, no alarma',
      !a.oculto && /rh-aviso-ok/.test(a.clase) && !/rh-aviso-falta/.test(a.clase), a.clase);

    a = await cruce('freelance', '058', '1');
    check('externo + CON código → contradicción en ámbar',
      !a.oculto && /rh-aviso-raro/.test(a.clase) && /058/.test(a.texto), a.clase + ' · ' + a.texto.slice(0, 70));

    a = await cruce('employee', '058', '1');
    check('de planta + CON código → sin aviso', a.oculto === true, a.clase + ' · ' + a.texto.slice(0, 70));

    a = await cruce('employee', '', '10');
    check('empresa fuera de CONTPAQi → lo DICE, no se calla',
      !a.oculto && !/rh-aviso-falta/.test(a.clase) && /CONTPAQi/.test(a.texto), a.clase + ' · ' + a.texto.slice(0, 70));

    // ── 4. El submit del alta se frena sin tipo, y el mensaje lo nombra ──
    await page.evaluate(() => {
      const f = document.querySelector('#formAlta');
      f.elements['employee_type'].value = '';
      f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    const m = await page.$eval('#altaMsg', e => e.textContent.trim());
    check('sin tipo de contrato el alta NO sale, y lo dice',
      /tipo de contrato/i.test(m), 'mensaje=' + JSON.stringify(m));

    // ── 5. Un valor de Odoo fuera de la lista blanca NO se pisa ──
    FICHA_ACTUAL = ficha({ employee_type: 'contractor', x_studio_codigo_contpaqi: '' });
    await page.evaluate(() => { document.querySelector('[data-tab="editar"]').click(); });
    await page.evaluate(() => {
      const s = document.getElementById('editEmpSel');
      s.value = '127'; s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const s = document.querySelector('#formEditar [name="employee_type"]');
      return s && s.value !== '';
    }, { timeout: 8000 }).catch(() => {});
    const raro = await page.$eval('#formEditar [name="employee_type"]', s => ({
      valor: s.value, n: s.options.length, ult: s.options[s.options.length - 1].textContent
    }));
    check('valor ajeno de Odoo: se conserva, NO se convierte a employee',
      raro.valor === 'contractor', 'valor=' + raro.valor);
    check('valor ajeno de Odoo: aparece como opción propia y marcada',
      raro.n === 4 && /contractor/.test(raro.ult) && /⚠️/.test(raro.ult), raro.n + ' · ' + raro.ult);
    const av = await page.evaluate(leerAviso('#editAviso'), { sel: '#editAviso' });
    check('valor ajeno de Odoo: el aviso lo señala en ámbar',
      !av.oculto && /rh-aviso-raro/.test(av.clase), av.clase);

    // ── 6. Una ficha normal se pinta completa en edición ──
    FICHA_ACTUAL = ficha({ employee_type: 'freelance', x_studio_codigo_contpaqi: '' });
    await page.evaluate(() => {
      const s = document.getElementById('editEmpSel');
      s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true }));
      s.value = '127'; s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const s = document.querySelector('#formEditar [name="employee_type"]');
      return s && s.value === 'freelance';
    }, { timeout: 8000 }).catch(() => {});
    const ed = await page.$eval('#formEditar', f => ({
      tipo: f.elements['employee_type'].value,
      cod:  f.elements['x_studio_codigo_contpaqi'].value
    }));
    check('edición: el tipo llega de la ficha', ed.tipo === 'freelance', ed.tipo);
    check('edición: el código llega de la ficha (vacío es un valor)', ed.cod === '', JSON.stringify(ed.cod));
    const av2 = await page.evaluate(leerAviso('#editAviso'), { sel: '#editAviso' });
    check('edición: externo sin código → aviso tranquilo', /rh-aviso-ok/.test(av2.clase), av2.clase);

    // ── 7. Render: sin desborde horizontal y con los campos a la vista ──
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('sin scroll horizontal de página', desborde <= 1, 'desborde=' + desborde + 'px');
    const caja = await page.$eval('#formEditar [name="employee_type"]', s => {
      const r = s.getBoundingClientRect(); return { w: r.width, h: r.height };
    });
    check('el dropdown mide algo (no está colapsado)', caja.w > 60 && caja.h > 14, JSON.stringify(caja));

    await page.evaluate(() => { document.querySelector('[data-tab="alta"]').click(); });
    await page.screenshot({ path: path.join(OUT, nombre + '-alta.png'), fullPage: true });
    await page.evaluate(() => { document.querySelector('[data-tab="editar"]').click(); });
    await page.screenshot({ path: path.join(OUT, nombre + '-editar.png'), fullPage: true });

    check('sin errores de página', errores.length === 0, errores.join(' | '));
    await ctx.close();
  }

  await browser.close();
  srv.close();

  console.log('\n─────────────────────────────────────');
  console.log('Capturas en ' + OUT);
  console.log(pass + ' revisiones OK, ' + fails.length + ' fallas');
  if (fails.length) { console.log('\nFALLAS:'); fails.forEach(f => console.log('  · ' + f)); process.exit(1); }
  console.log('TODO VERDE');
})().catch(e => { console.error(e); process.exit(2); });
