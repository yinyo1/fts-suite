// Informe PRIVADO (HTML) y correo ROJO, armados aquí a partir de `datos` (issue #346).
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COL = { VERDE: '#1e7b34', AMARILLO: '#9a6700', ROJO: '#b42318', NO_APLICA: '#6b7280' };
const cc = J.conteos || {};
const filasE = (J.por_estado || []).map(f => '<tr><td>' + f.estado_id + '</td><td>' + f.cuenta_id + '</td><td>' + esc(f.periodo) + '</td><td>' + f.movimientos + '</td>' +
  ['pata1', 'pata2', 'pata3'].map(k => '<td style="color:' + COL[f[k]] + ';font-weight:600">' + f[k] + '</td>').join('') + '</tr>').join('');
const malos = (J.hallazgos || []).filter(h => h.resultado !== 'VERDE');
const filasH = malos.map(h => '<tr><td style="color:' + (COL[h.resultado] || '#000') + ';font-weight:600">' + h.resultado + '</td><td>' + h.pata + '</td><td>' + esc(h.codigo) +
  '</td><td>' + (h.estado_id || '') + '</td><td>' + (h.archivo_id || '') + '</td><td><code>' + esc(JSON.stringify(h.evidencia || {})) + '</code></td></tr>').join('');
const decidir = (J.para_decidir || []).length ? '<h2>Para decidir</h2><ol>' + J.para_decidir.map(x => '<li>' + esc(x) + '</li>').join('') +
  '</ol><p>La sesión del auditor queda abierta para tu respuesta. Nada se ejecuta sin ella.</p>' : '';
const informeHtml = '<!doctype html><html lang="es"><meta charset="utf-8"><title>Auditoría fts-bancos</title><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;margin:24px;color:#111">' +
  '<h1>Auditoría fts-bancos · ' + esc(J.tipo) + '</h1><p><b>Veredicto: <span style="color:' + COL[J.veredicto] + '">' + J.veredicto + '</span></b> · Objetivo 1 (base = PDFs): <b>' + esc(cc.objetivo1) +
  '</b><br>' + cc.estados + ' estados · ' + cc.movimientos + ' movimientos · ' + cc.estados_tres_patas_verde + ' con las tres patas en VERDE<br>Auditada ' + esc(J.iniciada_en) + ' · ' + esc(J.auditor_version) + '</p>' +
  '<p style="color:#555">Privado: sólo para Esteban. Pata 1 = inventario OneDrive ↔ base · Pata 2 = relectura independiente del PDF (PDFium) · Pata 3 = V1/V2/V3 recalculadas y comparadas con el servicio.</p>' +
  decidir + '<h2>Por estado</h2><table border="1" cellpadding="4" style="border-collapse:collapse;font-size:13px"><tr><th>estado</th><th>cuenta</th><th>periodo</th><th>movs</th><th>pata 1</th><th>pata 2</th><th>pata 3</th></tr>' +
  filasE + '</table><h2>Hallazgos</h2><table border="1" cellpadding="4" style="border-collapse:collapse;font-size:12px"><tr><th>resultado</th><th>pata</th><th>código</th><th>estado</th><th>archivo</th><th>evidencia</th></tr>' +
  (filasH || '<tr><td colspan="6">Sin hallazgos.</td></tr>') + '</table></body></html>';
const rojos = malos.filter(h => h.resultado === 'ROJO');
const correoHtml = J.veredicto !== 'ROJO' ? '' : '<p>Auditoría fts-bancos (' + esc(J.tipo) + '): <b>ROJO</b>. Objetivo 1 (base = PDFs): <b>' + esc(cc.objetivo1) + '</b>. ' +
  cc.estados_tres_patas_verde + ' de ' + cc.estados + ' estados con las tres patas en VERDE.</p><p>Qué no cuadra y dónde:</p><ul>' +
  rojos.slice(0, 40).map(h => '<li><b>' + esc(h.codigo) + '</b> · pata ' + h.pata + ' · estado ' + (h.estado_id || '-') + ' · <code>' + esc(JSON.stringify(h.evidencia || {})).slice(0, 600) + '</code></li>').join('') + '</ul>' +
  (rojos.length > 40 ? '<p>… y ' + (rojos.length - 40) + ' más en el informe.</p>' : '') + decidir;
