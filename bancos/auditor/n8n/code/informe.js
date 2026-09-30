// Informe PRIVADO (HTML) y correo ROJO, armados aquí a partir de `datos` (issue #346).
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COL = { VERDE: '#1e7b34', AMARILLO: '#9a6700', ROJO: '#b42318', NO_APLICA: '#6b7280' };
const cc = J.conteos || {};
const filasE = (J.por_estado || []).map(f => '<tr><td>' + f.estado_id + '</td><td>' + f.cuenta_id + '</td><td>' + esc(f.periodo) + '</td><td>' + f.movimientos + '</td>' +
  ['pata1', 'pata2', 'pata3'].map(k => '<td style="color:' + COL[f[k]] + ';font-weight:600">' + f[k] + '</td>').join('') + '</tr>').join('');
const O2 = J.objetivo === 2;   // Objetivo 2 (issue #365): cotejo con Odoo, anomalías, clasificación
const malos = (J.hallazgos || []).filter(h => h.resultado !== 'VERDE' && !/^O2_BASE_/.test(h.codigo));
const filasH = malos.map(h => '<tr><td style="color:' + (COL[h.resultado] || '#000') + ';font-weight:600">' + h.resultado + '</td><td>' + h.pata + '</td><td>' + esc(h.codigo) +
  '</td><td>' + (h.estado_id || '') + '</td><td>' + (h.archivo_id || '') + '</td><td><code>' + esc(JSON.stringify(h.evidencia || {})) + '</code></td></tr>').join('');
const decidir = (J.para_decidir || []).length ? '<h2>Para decidir</h2><ol>' + J.para_decidir.map(x => '<li>' + esc(x) + '</li>').join('') +
  '</ol><p>La sesión del auditor queda abierta para tu respuesta. Nada se ejecuta sin ella.</p>' : '';
const cab = O2
  ? ' · Objetivo 2 (cotejo Odoo y anomalías): <b>' + esc(cc.objetivo2) + '</b><br>' + cc.meses_cotejados + ' meses · ' + cc.movimientos + ' movimientos · ' +
    cc.pct_emparejado + ' % del banco en Odoo · verificaciones ' + cc.verificaciones_ok + '/' + cc.verificaciones
  : ' · Objetivo 1 (base = PDFs): <b>' + esc(cc.objetivo1) + '</b><br>' + cc.estados + ' estados · ' + cc.movimientos + ' movimientos · ' + cc.estados_tres_patas_verde + ' con las tres patas en VERDE';
const leyenda = O2 ? 'Pata 1 = cotejo banco vs Odoo (sólo lectura) · Pata 2 = anomalías (sólo lo nuevo es ROJO) · Pata 3 = clasificación.'
  : 'Pata 1 = inventario OneDrive ↔ base · Pata 2 = relectura independiente del PDF (PDFium) · Pata 3 = V1/V2/V3 recalculadas y comparadas con el servicio.';
const cotejoT = O2 && (J.cotejo_meses || []).length ? '<h2>Cotejo banco vs Odoo por cuenta y mes</h2><table border="1" cellpadding="4" style="border-collapse:collapse;font-size:12px">' +
  '<tr><th>cuenta</th><th>mes</th><th>banco</th><th>monto</th><th>en Odoo</th><th>monto</th><th>faltan</th><th>monto</th><th>sobran en Odoo</th><th>monto</th></tr>' +
  J.cotejo_meses.map(m => '<tr><td>' + esc(m.cuenta) + '</td><td>' + esc(m.periodo) + '</td>' + ['banco_n', 'banco_monto', 'emp_n', 'emp_monto', 'faltan_n', 'faltan_monto', 'sobran_n', 'sobran_monto']
    .map(k => '<td style="text-align:right">' + esc(m[k]) + '</td>').join('') + '</tr>').join('') + '</table>' +
  '<h2>Verificaciones por dos caminos</h2><ul>' + (J.verificaciones || []).map(v => '<li>' + (v.ok ? '✓' : '✗') + ' ' + esc(v.que) + ': ' + esc(v.camino_1) + ' / ' + esc(v.camino_2) + '</li>').join('') + '</ul>' : '';
const informeHtml = '<!doctype html><html lang="es"><meta charset="utf-8"><title>Auditoría fts-bancos</title><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;margin:24px;color:#111">' +
  '<h1>Auditoría fts-bancos · ' + esc(J.tipo) + '</h1><p><b>Veredicto: <span style="color:' + COL[J.veredicto] + '">' + J.veredicto + '</span></b>' + cab + '<br>Auditada ' + esc(J.iniciada_en) + ' · ' + esc(J.auditor_version) + '</p>' +
  '<p style="color:#555">Privado: sólo para Esteban. ' + leyenda + '</p>' +
  decidir + cotejoT + '<h2>Por estado</h2><table border="1" cellpadding="4" style="border-collapse:collapse;font-size:13px"><tr><th>estado</th><th>cuenta</th><th>periodo</th><th>movs</th><th>pata 1</th><th>pata 2</th><th>pata 3</th></tr>' +
  filasE + '</table><h2>Hallazgos</h2><table border="1" cellpadding="4" style="border-collapse:collapse;font-size:12px"><tr><th>resultado</th><th>pata</th><th>código</th><th>estado</th><th>archivo</th><th>evidencia</th></tr>' +
  (filasH || '<tr><td colspan="6">Sin hallazgos.</td></tr>') + '</table></body></html>';
const rojos = malos.filter(h => h.resultado === 'ROJO');
const correoHtml = J.veredicto !== 'ROJO' ? '' : '<p>Auditoría fts-bancos (' + esc(J.tipo) + '): <b>ROJO</b>' + cab + '.</p><p>Qué no cuadra y dónde:</p><ul>' +
  rojos.slice(0, 40).map(h => '<li><b>' + esc(h.codigo) + '</b> · pata ' + h.pata + ' · estado ' + (h.estado_id || '-') + ' · <code>' + esc(JSON.stringify(h.evidencia || {})).slice(0, 600) + '</code></li>').join('') + '</ul>' +
  (rojos.length > 40 ? '<p>… y ' + (rojos.length - 40) + ' más en el informe.</p>' : '') + decidir;
