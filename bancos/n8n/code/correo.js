/* fts-bancos · correos de solicitud y acuse (issue #331).
 *
 * Fuente única del código que corre en los Code nodes de fts_bancos_solicitud_v2 y
 * fts_bancos_acuse: el workflow lleva este archivo tal cual más un adaptador de 3 líneas.
 * Funciones puras: reciben lo que devuelven bancos.f_solicitud() / bancos.f_acuse() y
 * regresan asunto, HTML y el MIME listo para Graph sendMail (sólo necesita Mail.Send).
 *
 * El hilo: cada solicitud lleva Message-ID y Thread-Index propios; el acuse responde con
 * In-Reply-To, References, el mismo Thread-Topic y un Thread-Index hijo, y el asunto "RE: ".
 *
 * Todo texto que viene de un archivo (nombre, motivo) es DATO: se escapa y nunca se interpreta.
 * Sin guiones largos: limpiar() los cambia por coma. Cuentas sólo enmascaradas (…NNNN).
 */
'use strict';

const MES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const REMITENTE = 'sales@fts.mx';

function limpiar(t) { return String(t == null ? '' : t).replace(/[—–]/g, ','); }
function esc(t) {
  return limpiar(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function mes(p) { return p ? MES[parseInt(String(p).slice(5, 7), 10)] + ' ' + String(p).slice(0, 4) : ''; }
function mesCorto(p) { return MES[parseInt(String(p).slice(5, 7), 10)]; }
function lista(s) { return String(s || '').split(',').map(x => x.trim()).filter(Boolean); }
function fecha(d) {
  const [a, m, dd] = String(d).slice(0, 10).split('-').map(Number);
  return dd + ' de ' + MES[m] + ' de ' + a;
}
function cuentaDe(f) { return (f.etiqueta || '') + (f.numero_mask ? ' ' + f.numero_mask : ''); }
function asuntoConteo(total, dias) {
  return 'Estados de cuenta FTS: faltan ' + total + ' (el más antiguo lleva ' + dias + ' ' + (dias === 1 ? 'día hábil' : 'días hábiles') + ')';
}
function fraseFinal(d) {
  return 'Estados de cuenta FTS al día hasta ' + mes(d.periodo_reciente) + '. Gracias, no hace falta nada más hasta el primer día hábil de ' +
    mes(String(d.siguiente_disponible).slice(0, 7)) + ' (' + fecha(d.siguiente_disponible) + ').';
}

/* Motivo en lenguaje simple y qué hacer, por código del procesador. El texto del procesador
 * se cita sólo como detalle, escapado. */
const MOTIVOS = {
  PDF_PROTEGIDO: ['el PDF tiene contraseña', 'Descárguenlo otra vez del portal del banco sin contraseña y súbanlo. Si el portal sólo lo entrega con contraseña, respondan este correo.'],
  PDF_SIN_TEXTO: ['es una imagen o un escaneo, no el PDF que genera el banco', 'Descarguen el estado de cuenta oficial desde el portal; una foto o un escaneo no se puede validar al centavo.'],
  PDF_DANADO: ['el PDF está dañado o no se puede abrir', 'Vuelvan a descargarlo del portal y súbanlo de nuevo.'],
  NO_ES_PDF: ['no es un PDF ni un ZIP', 'Suban el estado de cuenta en PDF (o un ZIP con los PDF). Si se subió por error, no hay que hacer nada.'],
  NO_ES_ESTADO: ['no es un estado de cuenta', 'Si se subió por error, no hay que hacer nada. Si era el estado, descarguen el PDF oficial del estado de cuenta.'],
  CUENTA_NO_RECONOCIDA: ['la cuenta no es de FTS (o no está dada de alta)', 'Revisen que sea de Servicios FTS SA de CV. Si no lo es, no hay que hacer nada; si sí, avisen a Esteban para darla de alta.'],
  NO_CUADRA: ['los movimientos no cuadran contra el resumen de la página 1', 'Vuelvan a descargar ese mes del portal y súbanlo. Si vuelve a fallar, avisen para revisarlo a mano.'],
  CONFLICTO_VERSION: ['ya teníamos ese mes de esa cuenta y este archivo trae otros movimientos (dos versiones distintas)', 'Confirmen con el banco cuál es la versión buena y avisen a Esteban. La que ya estaba no se reemplaza.'],
  SOSPECHOSO: ['el archivo trae texto que no corresponde a un estado de cuenta', 'Revisen de dónde salió. Si es un estado legítimo, descárguenlo otra vez del portal.'],
  FORMATO_NO_SOPORTADO: ['el sistema todavía no lee ese formato', 'No hay que hacer nada: quedó guardado y se valida cuando exista el lector de ese formato.'],
  OTRO_BANCO: ['es un estado de un banco que no es BBVA', 'Quedó guardado aparte. Si no es de FTS, no hay que hacer nada.'],
  ARCHIVO_DEMASIADO_GRANDE: ['el archivo es demasiado grande', 'Súbanlo partido en varios ZIP o como PDFs sueltos.'],
  ZIP: ['un archivo dentro del ZIP no se pudo abrir de forma segura', 'Extraigan ese archivo y súbanlo suelto; si no es un estado de cuenta, no hay que hacer nada.'],
  MARCADOR: ['no se pudo leer el estado (le falta una parte que el sistema busca)', 'Revisen que sea el PDF original del portal BBVA, no una impresión parcial. Si lo es, avisen a Esteban: el formato cambió.'],
};
function motivoSimple(r) {
  const c = String(r.codigo || '');
  let k = c;
  if (/^ZIP/.test(c)) k = 'ZIP';
  else if (!MOTIVOS[c] && r.estado === 'no_cuadra') k = 'NO_CUADRA';
  else if (c === 'DUPLICADO_LOGICO' || (!MOTIVOS[c] && /conflicto de versi|duplicado l/i.test(r.motivo || ''))) k = 'CONFLICTO_VERSION';
  else if (!MOTIVOS[c] && r.estado === 'sospechoso') k = 'SOSPECHOSO';
  else if (!MOTIVOS[c] && r.estado === 'formato_no_soportado') k = 'FORMATO_NO_SOPORTADO';
  else if (!MOTIVOS[c] && /RFC distinto|no está registrada/i.test(r.motivo || '')) k = 'CUENTA_NO_RECONOCIDA';
  else if (!MOTIVOS[c] && /no se pudo leer/i.test(r.motivo || '')) k = 'MARCADOR';
  // Código desconocido: se usa la instrucción que guardó el procesador, si la hay.
  const m = MOTIVOS[k] || ['no se pudo usar', r.instruccion || 'Vuelvan a descargarlo del portal y súbanlo de nuevo.'];
  return { que: m[0], hacer: m[1] };
}

function nombreArchivo(r) {
  return '<b>' + esc(r.archivo) + '</b>' + (r.zip ? ' (dentro de ' + esc(r.zip) + ')' : '');
}

/* ── secciones ── */
function seccionReciente(d) {
  const xs = d.faltantes.filter(f => f.es_mes_reciente);
  let h = '<h3 style="margin:16px 0 6px">Mes recién cerrado: ' + esc(mes(d.periodo_reciente)) + '</h3>';
  if (!xs.length) return h + '<p style="margin:0">Ya llegó todo lo de este mes y cuadra.</p>';
  h += '<ul style="margin:0">';
  for (const f of xs) {
    h += '<li><b>' + esc(cuentaDe(f)) + '</b>: ' + esc(f.detalle) + '. Lleva ' + f.dias_habiles + ' ' +
      (f.dias_habiles === 1 ? 'día hábil' : 'días hábiles') + ' abierto.</li>';
  }
  return h + '</ul>';
}

function seccionRezago(d) {
  const xs = d.faltantes.filter(f => !f.es_mes_reciente);
  let h = '<h3 style="margin:16px 0 6px">Rezago</h3>';
  if (!xs.length) {
    if (d.rezago_omitido > 0) {
      return h + '<p style="margin:0">Hay ' + d.rezago_omitido + ' ' + (d.rezago_omitido === 1 ? 'mes' : 'meses') +
        ' de rezago abiertos; se listan completos en la solicitud del primer día hábil de cada semana.</p>';
    }
    return h + '<p style="margin:0">No hay rezago abierto.</p>';
  }
  h += '<p style="margin:0 0 6px;color:#555">Entre paréntesis, los días hábiles que lleva abierto cada mes.</p>';
  const porFuente = new Map();
  for (const f of xs) {
    const k = cuentaDe(f);
    if (!porFuente.has(k)) porFuente.set(k, new Map());
    const anios = porFuente.get(k);
    const a = String(f.periodo).slice(0, 4);
    if (!anios.has(a)) anios.set(a, []);
    anios.get(a).push(f);
  }
  for (const [cta, anios] of porFuente) {
    h += '<p style="margin:8px 0 2px"><b>' + esc(cta) + '</b></p><ul style="margin:0">';
    for (const [a, fs] of anios) {
      const falt = fs.filter(f => f.motivo === 'faltante');
      const otros = fs.filter(f => f.motivo !== 'faltante');
      if (falt.length) {
        h += '<li>' + a + ((falt.length === 12) ? ', el año completo' : ', ' + falt.length + (falt.length === 1 ? ' mes' : ' meses')) + ': ' +
          falt.map(f => mesCorto(f.periodo) + ' (' + f.dias_habiles + ')').join(', ') + '.</li>';
      }
      for (const f of otros) {
        h += '<li>' + esc(mes(f.periodo)) + ': ' + esc(f.detalle) + ' (' + f.dias_habiles + ').</li>';
      }
    }
    h += '</ul>';
  }
  return h;
}

function seccionRechazos(rs, titulo) {
  if (!rs || !rs.length) return '';
  let h = '<h3 style="margin:16px 0 6px">' + titulo + '</h3><ul style="margin:0">';
  for (const r of rs) {
    const m = motivoSimple(r);
    h += '<li>' + nombreArchivo(r) + (r.periodo && r.numero_mask ? ', ' + esc(r.numero_mask) + ' ' + esc(mes(r.periodo)) : '') +
      '<br>Qué pasó: ' + esc(m.que) + '.<br>Qué hacer: ' + esc(m.hacer) + '</li>';
  }
  return h + '</ul>';
}

function liga(d, url) {
  const nombre = String(d.buzon || '').split('/').pop() || 'buzón';
  return '<p style="margin:14px 0 0">Buzón: ' + (url ? '<a href="' + esc(url) + '">' + esc(nombre) + '</a>' : esc(d.buzon)) +
    ' (carpeta FTS Finanzas - Bancos en el OneDrive de Esteban).</p>';
}

/* ── solicitud ── */
function renderSolicitud(d, url) {
  if (d.tipo === 'final') {
    const html = '<p>Hola Gerardo,</p><p><b>' + esc(fraseFinal(d)) + '</b></p>' + (d.pie || '');
    return { asunto: 'Estados de cuenta FTS al día hasta ' + mes(d.periodo_reciente), html: limpiar(html) };
  }
  let html = '<p>Hola Gerardo,</p><p>Para cerrar la base bancaria faltan <b>' + d.total + '</b> ' +
    (d.total === 1 ? 'estado de cuenta' : 'estados de cuenta') + '. El más antiguo lleva <b>' + d.mas_antiguo_dias +
    '</b> días hábiles abierto. Esta lista sale de la base, no se escribe a mano, y se cierra sola conforme llegan y cuadran.</p>';
  html += seccionReciente(d);
  html += seccionRezago(d);
  html += seccionRechazos(d.rechazos, 'Archivos recibidos que no se pudieron usar');
  html += d.instrucciones || '';
  html += liga(d, url);
  html += d.pie || '';
  return { asunto: asuntoConteo(d.total, d.mas_antiguo_dias), html: limpiar(html) };
}

/* ── acuse ── */
function renderAcuse(d) {
  const completo = d.total === 0;
  const recibido = d.validados.length + d.duplicados.length + d.rechazados.length;
  let html = '<p>Hola Gerardo,</p>';
  if (completo && d.validados.length) {
    html += '<p><b>' + esc(fraseFinal(d)) + '</b></p>';
  } else {
    html += '<p>Ya procesamos lo último que se subió al buzón. Esto fue lo que encontramos:</p>';
  }
  if (!recibido) {
    html += '<p>La subida no trajo ningún archivo reconocible, así que no se pudo usar nada.</p>';
  }
  if (d.validados.length) {
    html += '<h3 style="margin:16px 0 6px">Validados</h3><ul style="margin:0">';
    for (const v of d.validados) {
      html += '<li><b>' + esc(v.cuenta) + ', ' + esc(mes(v.periodo)) + '</b>: cuadra al centavo contra el resumen del banco.' +
        ' <span style="color:#555">(archivo ' + esc(v.archivo) + (v.zip ? ' dentro de ' + esc(v.zip) : '') + '; el mes sale de la página 1, no del nombre)</span>' +
        (v.aviso ? '<br>Aviso: ' + esc(v.aviso) + '.' : '') + '</li>';
    }
    html += '</ul>';
  }
  if (d.duplicados.length) {
    html += '<h3 style="margin:16px 0 6px">Duplicados (no requieren acción)</h3><ul style="margin:0">';
    for (const x of d.duplicados) {
      html += '<li>' + nombreArchivo(x) + ' es copia de ' + esc(x.copia_de || 'un archivo que ya estaba') + '.</li>';
    }
    html += '</ul>';
  }
  html += seccionRechazos(d.rechazados, 'Rechazados');
  if (!completo) {
    html += '<h3 style="margin:16px 0 6px">Cuánto falta</h3><p style="margin:0">Faltan <b>' + d.total + '</b> (el más antiguo lleva ' +
      d.mas_antiguo_dias + ' días hábiles). El detalle va en la solicitud de cada día hábil.</p>';
  } else if (!d.validados.length) {
    html += '<p><b>' + esc(fraseFinal(d)) + '</b></p>';
  }
  html += d.pie || '';
  // Sin solicitud previa no hay hilo que responder: el acuse abre el suyo, sin "RE:".
  const asunto = d.hilo && d.hilo.asunto ? 'RE: ' + d.hilo.asunto.replace(/^(RE|Re|re):\s*/, '')
    : (completo ? 'Estados de cuenta FTS al día hasta ' + mes(d.periodo_reciente) : asuntoConteo(d.total, d.mas_antiguo_dias));
  return { asunto, html: limpiar(html), completo };
}

/* ── MIME ── */
function utf8(s) { return new TextEncoder().encode(String(s)); }
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
function encabezado(s) { return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + b64(utf8(s)) + '?='; }
function envolver(s) { return s.replace(/.{1,76}/g, '$&\r\n'); }

/* Thread-Index (MS-OXOMSG 2.2.1.3): raíz = 6 bytes altos del FILETIME + GUID de 16 bytes;
 * cada respuesta agrega 5 bytes: 1 bit de escala, 31 bits de delta, 4 aleatorios, 4 de secuencia. */
const EPOCA = (369n * 365n + 89n) * 86400n * 10000000n;   // de 1601-01-01 a 1970-01-01 en unidades de 100 ns
function filetime(ms) { return BigInt(Math.floor(ms)) * 10000n + EPOCA; }
function threadIndexRaiz(ms, rnd) {
  const ft = filetime(ms);
  const bytes = [];
  for (let i = 7; i >= 2; i--) bytes.push(Number((ft >> BigInt(8 * i)) & 255n));
  for (let i = 0; i < 16; i++) bytes.push(rnd());
  return b64(bytes);
}
function threadIndexHijo(padreB64, ms, rnd) {
  const p = unb64(padreB64);
  if (p.length < 22) return threadIndexRaiz(ms, rnd);
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
function messageId(tipo, hoy, ms, rnd) {
  const r = Array.from({ length: 6 }, () => (rnd() & 255).toString(16).padStart(2, '0')).join('');
  return '<fts-bancos.' + tipo + '.' + String(hoy).replace(/-/g, '') + '.' + Math.floor(ms).toString(36) + '.' + r + '@fts.mx>';
}
function fechaRfc(ms) {
  const d = new Date(ms);
  const D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const p = n => String(n).padStart(2, '0');
  return D + ', ' + p(d.getUTCDate()) + ' ' + M + ' ' + d.getUTCFullYear() + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()) + ' +0000';
}
function mime(o) {
  const h = [
    'From: ' + REMITENTE,
    'To: ' + o.para.join(', '),
  ];
  if (o.cc && o.cc.length) h.push('Cc: ' + o.cc.join(', '));
  h.push('Subject: ' + encabezado(o.asunto), 'Date: ' + fechaRfc(o.ms), 'Message-ID: ' + o.messageId);
  if (o.inReplyTo) h.push('In-Reply-To: ' + o.inReplyTo, 'References: ' + o.inReplyTo);
  h.push('Thread-Topic: ' + encabezado(o.tema), 'Thread-Index: ' + o.threadIndex, 'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '',
    envolver(b64(utf8('<html><body style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#222">' + o.html + '</body></html>'))));
  return h.join('\r\n');
}

/* Arma el correo completo. d = salida de f_solicitud / f_acuse. hilo = {message_id, thread_index, asunto} para responder. */
function armar(tipoCorreo, d, url, ms, rnd) {
  rnd = rnd || (() => Math.floor(Math.random() * 256));
  ms = ms == null ? Date.now() : ms;
  const r = tipoCorreo === 'acuse' ? renderAcuse(d) : renderSolicitud(d, url);
  const tipo = tipoCorreo === 'acuse' ? (r.completo ? 'final' : 'acuse') : (d.tipo === 'final' ? 'final' : 'solicitud');
  const hilo = tipoCorreo === 'acuse' ? d.hilo : null;
  const para = lista(d.para), cc = lista(d.cc).filter(x => !para.includes(x));
  const mid = messageId(tipo, d.hoy, ms, rnd);
  const tema = (hilo && hilo.asunto ? hilo.asunto : r.asunto).replace(/^(RE|Re|re):\s*/, '');
  const ti = hilo && hilo.thread_index ? threadIndexHijo(hilo.thread_index, ms, rnd) : threadIndexRaiz(ms, rnd);
  const raw = mime({ para, cc, asunto: r.asunto, html: r.html, messageId: mid, inReplyTo: hilo && hilo.message_id,
    tema, threadIndex: ti, ms });
  return { tipo, asunto: r.asunto, html: r.html, para, cc, message_id: mid, in_reply_to: (hilo && hilo.message_id) || null,
    thread_index: ti, mime_b64: b64(utf8(raw)), mime: raw, total_abiertos: d.total };
}

if (typeof module !== 'undefined') {
  module.exports = { armar, renderSolicitud, renderAcuse, motivoSimple, threadIndexRaiz, threadIndexHijo, unb64, b64, utf8, mime, limpiar, mes };
}
