/* ── fts_bancos_solicitud_v2 · Code - Hilo ──
 * Encadena cada solicitud a la anterior para que el arranque, los recordatorios diarios y
 * los acuses queden en UN solo hilo: In-Reply-To/References = Message-ID de la última
 * solicitud (bancos.f_hilo), Thread-Index hijo del suyo (misma raíz de 22 bytes) y el
 * mismo Thread-Topic. Sin solicitud previa (el arranque), el correo sale tal cual, como raíz.
 * Corre después de "Code - Armar"; los items van en el mismo orden que "Postgres - f_solicitud".
 * Las funciones de Thread-Index son copia de correo.js (la prueba las compara contra él). */
const B64 = [[65, 26], [97, 26], [48, 10]].map(([a, n]) => Array.from({ length: n }, (_, i) => String.fromCharCode(a + i)).join('')).join('') + '+/';
function b64(bytes) {
  let o = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    o += B64[a >> 2] + B64[((a & 3) << 4) | ((b || 0) >> 4)] +
      (b === undefined ? '=' : B64[((b & 15) << 2) | ((c || 0) >> 6)]) + (c === undefined ? '=' : B64[c & 63]);
  }
  return o;
}
function unb64(s) {
  const out = [];
  let buf = 0, n = 0;
  for (const ch of String(s).replace(/=+$/, '')) {
    buf = (buf << 6) | B64.indexOf(ch); n += 6;
    if (n >= 8) { n -= 8; out.push((buf >> n) & 255); }
  }
  return out;
}
function utf8(s) { return new TextEncoder().encode(String(s)); }
function encabezado(s) { return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + b64(utf8(s)) + '?='; }
const EPOCA = (369n * 365n + 89n) * 86400n * 10000000n;
function filetime(ms) { return BigInt(Math.floor(ms)) * 10000n + EPOCA; }
function threadIndexHijo(padreB64, ms, rnd) {
  const p = unb64(padreB64);
  if (p.length < 22) return null;
  let t0 = 0n;
  for (let i = 0; i < 6; i++) t0 = (t0 << 8n) | BigInt(p[i]);
  t0 <<= 16n;
  let delta = filetime(ms) - t0;
  if (delta < 0n) delta = 0n;
  let bloque;
  if ((delta & 0x00FE000000000000n) === 0n) bloque = ((delta >> 18n) & 0x7FFFFFFFn);
  else bloque = (1n << 31n) | ((delta >> 23n) & 0x7FFFFFFFn);
  const v = (bloque << 8n) | BigInt(rnd() & 0xF0) | BigInt((p.length - 22) / 5 & 0x0F);
  const extra = [];
  for (let i = 4; i >= 0; i--) extra.push(Number((v >> BigInt(8 * i)) & 255n));
  return b64(p.concat(extra));
}

/* c = salida de armar('solicitud', …); hilo = {message_id, thread_index, asunto} de la solicitud anterior. */
function encadenar(c, hilo, ms, rnd) {
  rnd = rnd || (() => Math.floor(Math.random() * 256));
  ms = ms == null ? Date.now() : ms;
  if (!c || !c.mime || !hilo || !hilo.message_id || !hilo.thread_index || c.message_id === hilo.message_id) return c;
  const ti = threadIndexHijo(hilo.thread_index, ms, rnd);
  if (!ti) return c;
  const tema = String(hilo.asunto || c.asunto).replace(/^(RE|Re|re):\s*/, '');
  const i = c.mime.indexOf('\r\n\r\n');
  let cab = c.mime.slice(0, i).split('\r\n');
  const cuerpo = c.mime.slice(i);
  cab = cab.filter(l => !/^(In-Reply-To|References):/i.test(l)).map(l =>
    /^Thread-Index:/i.test(l) ? 'Thread-Index: ' + ti : (/^Thread-Topic:/i.test(l) ? 'Thread-Topic: ' + encabezado(tema) : l));
  const k = cab.findIndex(l => /^Message-ID:/i.test(l));
  cab.splice(k + 1, 0, 'In-Reply-To: ' + hilo.message_id, 'References: ' + hilo.message_id);
  const raw = cab.join('\r\n') + cuerpo;
  return { ...c, mime: raw, mime_b64: b64(utf8(raw)), in_reply_to: hilo.message_id, thread_index: ti };
}

if (typeof module !== 'undefined') {
  module.exports = { encadenar, threadIndexHijo };
} else {
  const fsol = $('Postgres - f_solicitud').all();
  return $input.all().map((it, i) => {
    const j = it.json;
    if (!(j.accion === 'enviar' || j.accion === 'registrar') || !j.mime) return { json: j };
    const d0 = fsol[i] && fsol[i].json.d;
    const d = typeof d0 === 'string' ? JSON.parse(d0) : d0;
    return { json: encadenar(j, d && d.hilo) };
  });
}
