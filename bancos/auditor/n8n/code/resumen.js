/* Resumen diario 17:30 SÓLO a Esteban (issue #346). VERDE = una línea; AMARILLO/ROJO = la lista del día.
 * Si hoy no hubo auditoría, lo dice: el silencio no es señal de que todo esté bien. */
const r = $input.first().json;
if (!r.habil) return [];
const a = (r.auditorias || []);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let asunto, html;
if (!a.length) {
  asunto = 'fts-bancos auditor: hoy no hubo auditoría';
  html = '<p>Hoy (' + esc(r.hoy) + ') no quedó registrada ninguna auditoría. Revisa que las revisiones programadas de Claude Code sigan corriendo.</p>';
} else {
  const malas = a.filter(x => x.veredicto !== 'VERDE');
  const ult = a.filter(x => (x.objetivo || 1) === 1 && (x.tipo === 'barrido_diario' || x.tipo === 'barrido_mensual')).pop() || a[a.length - 1];
  if (!malas.length) {
    asunto = 'fts-bancos auditor: VERDE';
    html = '<p>Base = PDFs: ' + esc(ult.n_estados) + ' estados, ' + esc(ult.n_movimientos) + ' movimientos, triple verificado.</p>';
  } else {
    const peor = malas.some(x => x.veredicto === 'ROJO') ? 'ROJO' : 'AMARILLO';
    asunto = 'fts-bancos auditor: ' + peor + ' hoy (' + malas.length + ' de ' + a.length + ')';
    html = '<p>Auditorías de hoy:</p><ul>' + a.map(x => '<li>' + esc(x.hora) + ' · ' + esc(x.tipo) + ' · <b>' + esc(x.veredicto) + '</b> · Objetivo ' + esc(x.objetivo || 1) + ' ' + esc(x.objetivo1) +
      ' · ' + esc(x.n_estados) + ' estados, ' + esc(x.n_movimientos) + ' movimientos' + (x.codigos ? ' · ' + esc(Object.entries(x.codigos).map(([k, v]) => k + ' ' + v).join(', ')) : '') +
      (x.onedrive_ruta ? ' · <a href="' + esc(x.onedrive_ruta) + '">informe</a>' : '') + '</li>').join('') + '</ul>';
  }
}
html += '<p style="color:#666">Auditorías por evento pendientes: ' + esc(r.pendientes_abiertas) + '.</p>';
return [{ json: { mail: { message: { subject: asunto, body: { contentType: 'HTML', content: html },
  toRecipients: [{ emailAddress: { address: 'estebandelacruz@fts.mx' } }] }, saveToSentItems: true } } }];
