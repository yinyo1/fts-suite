#!/usr/bin/env node
/* Exporta el LAYOUT de retardos/lib/pdf.js a retardos/hojas/fts_hojas/layout.json (#334).
 * El procesador ubica firmas, casilla y comentarios con estas coordenadas. Una sola fuente
 * de verdad: el generador. La prueba de contrato (tests/retardos) exige que coincidan. */
const fs = require('fs'), path = require('path');
const P = require(path.join(__dirname, '..', 'lib', 'pdf.js'));
const destino = path.join(__dirname, 'fts_hojas', 'layout.json');
fs.writeFileSync(destino, JSON.stringify(P.LAYOUT, null, 2) + '\n');
console.log('layout v' + P.LAYOUT.version + ' -> ' + destino);
