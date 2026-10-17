#!/usr/bin/env node
/* Capturas del conceptualizador REAL (main con V1.42) contra el simulador LOCAL (sim-n8n.js, base cz).
 * Conversación demo con lo que el núcleo tiene que pintar igual: separador de día, texto, fotos (álbum),
 * PDF, nota de voz con transcripción, respuesta del motor con markdown, tarjeta con ✓ Va / ✎ Corregir,
 * mensaje de sistema y «escribiendo…». Nada de motor real ni llaves del entorno: czsim.env (llaves de prueba).
 *   . czsim.env && CZ_N8N_URL=http://127.0.0.1:5680 node cap-cz.js <salida>
 */
'use strict';
const CZ = '/home/user/fts-conceptualizador';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), crypto = require('crypto'), { execFileSync } = require('child_process');
if (!/127\.0\.0\.1/.test(process.env.CZ_N8N_URL || '')) { console.error('CZ_N8N_URL debe apuntar al simulador local'); process.exit(2); }
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { token, suite } = require(CZ + '/pruebas/util-suite');
const { llamar } = require(CZ + '/herramientas/motor/cliente');
const SUITE = process.env.FTS_SUITE_DIR || '/home/user/fts-suite';
const N8N = process.env.CZ_N8N_URL, WEB = Number(process.env.CZ_WEB_PUERTO || 8193);
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
process.env.CZ_MOTOR_HMAC_KEY = process.env.CONCEPTUALIZADOR_MOTOR_KEY;
const SQ = q => execFileSync('psql', ['-Atq', '-c', q], { encoding: 'utf8' }).trim();
const espera = ms => new Promise(r => setTimeout(r, ms));
const TIPOS = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, s) => {
  const f = path.join(SUITE, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(SUITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
}).listen(WEB);
const b64 = b => Buffer.from(b).toString('base64'), sha = b => crypto.createHash('sha256').update(b).digest('hex');
function wav(seg) {
  const sr = 8000, n = sr * seg, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(6000 * Math.sin(2 * Math.PI * 200 * i / sr) * Math.abs(Math.sin(i / sr * 3))), 44 + i * 2);
  return b;
}
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

(async () => {
  SQ("insert into conceptualizador.config values ('ventana_acompanamiento_segundos','0') on conflict (clave) do update set valor = excluded.valor");
  SQ("insert into conceptualizador.config values ('tope_mensajes_dia:montalvo','5000'),('tope_sesiones_dia:montalvo','500') on conflict (clave) do update set valor = excluded.valor");
  const SC = ['conceptualizador:usar', 'comercial:machote'];
  const TM = token('montalvo', SC, process.env.SUITE_JWT_SECRET);
  const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  // fotos: dos PNG pintados por el navegador (paleta tipo planta)
  const pg0 = await nav.newPage({ viewport: { width: 400, height: 300 } });
  const foto = async (c1, c2) => { await pg0.setContent('<body style="margin:0;background:linear-gradient(135deg,' + c1 + ',' + c2 + ');width:400px;height:300px"></body>'); return pg0.screenshot(); };
  const F1 = await foto('#6d7b84', '#c9b48a'), F2 = await foto('#3d5a6b', '#9fb3bf'); await pg0.close();
  const caso = (await suite(N8N, TM, 'nueva', { titulo: 'Mezanín planta Apodaca', modo_sesion: 'acompanamiento', empresa: 'mx_mxn' })).caso_id;
  SQ("update conceptualizador.caso set proyecto_ciudad = 'Apodaca', proyecto_estado = 'N.L.', proyecto_pais = 'MX', proyecto_fuente = 'elegida', proyecto_confirmada_at = now() where id = '" + caso + "'");
  const sube = async (archivo, mime, clase, buf, extra) => (await suite(N8N, TM, 'subir', Object.assign({ caso_id: caso, archivo, mime, clase, sha256: sha(buf), escrito_at: String(Date.now()), b64: b64(buf) }, extra || {}))).adjunto_id;
  await suite(N8N, TM, 'enviar', { caso_id: caso, texto: 'Mezanín de 2 niveles en la nave 3, con su alimentación eléctrica. Te mando fotos y el plano.' });
  const a1 = await sube('nave3-norte.png', 'image/png', 'foto', F1), a2 = await sube('nave3-sur.png', 'image/png', 'foto', F2);
  await suite(N8N, TM, 'enviar', { caso_id: caso, texto: '', adjuntos: [a1, a2] });
  const ap = await sube('plano-mezanin-rev2.pdf', 'application/pdf', 'pdf', PDF);
  await suite(N8N, TM, 'enviar', { caso_id: caso, texto: '', adjuntos: [ap] });
  const W = wav(14), av = await sube('nota-de-voz.wav', 'audio/wav', 'audio', W, { duracion_s: 14 });
  SQ("update conceptualizador.adjunto set transcripcion = 'La carga es de 500 kilos por metro cuadrado y el cliente quiere que quede antes de diciembre.' where id = '" + av + "'");
  await suite(N8N, TM, 'enviar', { caso_id: caso, texto: '', adjuntos: [av] });
  // el motor simulado contesta una vez con texto con formato y dos conjeturas
  const resp = { texto: 'Anotado. Con lo que mandaste:\n- **Mezanín** de 2 niveles, 500 kg/m²\n- Entrega antes de diciembre\n\nConfirma o corrige lo que supongo.', conceptos: [], preguntas: [],
    acciones: [{ tipo: 'conjetura', titulo: '¿De dónde se alimenta?', datos: { pregunta: '¿De dónde se alimenta el mezanín?', conjetura: 'Del tablero C10, a 40 m.' } },
               { tipo: 'conjetura', titulo: '¿Altura?', datos: { pregunta: '¿Altura libre bajo viga?', conjetura: '3 m.' } }] };
  for (let i = 0; i < 8; i++) {
    const s = await llamar('siguiente', {}, { sesion: 'cap' }); if (!s.ok || !s.trabajo_id) break;
    await llamar('tomar', { trabajo_id: s.trabajo_id }, { sesion: 'cap' });
    await llamar('entregar', { trabajo_id: s.trabajo_id, respuesta: i === 0 ? resp : { texto: 'Anotado.', conceptos: [], preguntas: [] } }, { sesion: 'cap' });
  }
  await suite(N8N, TM, 'enviar', { caso_id: caso, texto: '¿Y si la escalera va del lado sur?' });   // queda «escribiendo…»
  const ctx = await nav.newContext({ viewport: { width: 380, height: 820 } });
  const ses = { token: TM, actor: 'montalvo', nombre: 'Francisco Montalvo', scopes: SC, exp: Math.floor(Date.now() / 1000) + 3600 };
  await ctx.addInitScript(([s, n8n]) => { localStorage.setItem('fts_suite_session', JSON.stringify(s)); localStorage.setItem('ops_n8n_url', n8n); }, [ses, N8N]);
  const p = await ctx.newPage(); const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  await p.goto('http://127.0.0.1:' + WEB + '/comercial/conceptualizador/index.html');
  await p.evaluate(x => sessionStorage.setItem('cz_sel', JSON.stringify({ id: x })), caso);
  await p.reload(); await p.waitForSelector('#msgs .b', { timeout: 20000 }); await p.waitForLoadState('networkidle'); await espera(1500);
  for (const w of [380, 900, 1280]) {
    await p.setViewportSize({ width: w, height: w < 900 ? 820 : 860 }); await espera(600);
    await p.evaluate(() => { const m = document.querySelector('#msgs'); m.scrollTop = 0; }); await espera(300);
    await p.screenshot({ path: path.join(OUT, 'cz-' + w + '-arriba.png') });
    await p.evaluate(() => { const m = document.querySelector('#msgs'); m.scrollTop = m.scrollHeight; }); await espera(300);
    await p.screenshot({ path: path.join(OUT, 'cz-' + w + '-abajo.png') });
  }
  await p.setViewportSize({ width: 380, height: 820 });
  await p.click('#bVuelve'); await espera(600); await p.screenshot({ path: path.join(OUT, 'cz-380-lista.png') });
  // medidas que el núcleo tiene que copiar (para la prueba de paridad)
  await p.evaluate(x => sessionStorage.setItem('cz_sel', JSON.stringify({ id: x })), caso); await p.reload(); await p.waitForSelector('#msgs .b'); await espera(800);
  const med = await p.evaluate(() => { const g = (s, k) => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e); const o = {}; k.forEach(x => o[x] = c[x]); o.h = e.getBoundingClientRect().height; return o; };
    return { cab: g('#ch', ['backgroundColor', 'borderBottomColor']), msgs: g('#msgs', ['backgroundColor', 'backgroundImage', 'backgroundSize']),
      yo: g('.b.yo', ['backgroundColor', 'borderRadius', 'boxShadow', 'fontSize', 'paddingTop', 'paddingLeft']), el: g('.b.el', ['backgroundColor', 'borderRadius']),
      caja: g('.caja', ['backgroundColor', 'borderRadius', 'boxShadow']), redondo: g('#bEnviar', ['backgroundColor', 'width']), body: g('body', ['fontFamily']) }; });
  fs.writeFileSync(path.join(OUT, 'cz-medidas.json'), JSON.stringify(med, null, 1));
  console.log('caso', caso, 'errores', errores);
  await nav.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
