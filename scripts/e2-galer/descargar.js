#!/usr/bin/env node
/* Expediente E-2 (fts-suite#440) · baja los PDF ORIGINALES de las facturas de
 * FTS USA desde Odoo y los deja en tmp/e2-galer/inbox/ con el nombre estándar.
 *
 * El MCP de Odoo tiene ir.attachment en denylist, y el portal de la factura
 * (/my/invoices/<id>?report_type=pdf) NO sirve: genera en el momento un PDF que
 * dice «Proforma Invoice» y trae el estado de pago de hoy. Lo que sirve es el
 * adjunto original, por /web/content/<attachment_id>?access_token=<token del adjunto>.
 *
 * Los tokens los produce el runner TMP de n8n (runner-tokens.js, la misma carpeta).
 * Se pegan en tmp/e2-galer/tokens.json, que es gitignored y NUNCA se commitea:
 *   [{ "folio":"INV-2026-0171", "cliente":"Corporate USA", "monto":7198.75,
 *      "attachment_id":104121, "access_token":"…", "checksum":"<sha1 de Odoo>",
 *      "buscar":["Corporate","7,198.75"] }, …]
 *
 * Por cada factura: descarga, exige http 200 + %PDF- + más de 20 KB + sha1 ==
 * checksum de Odoo, y revisa con pdftotext que traiga las palabras de `buscar`.
 * Si algo no cuadra, borra el archivo y lo reporta: nunca deja un PDF dudoso
 * con el nombre final.
 *
 * Uso:  node scripts/e2-galer/descargar.js [tmp/e2-galer/tokens.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const BASE = 'https://serviciosfts.odoo.com';
const RAIZ = path.resolve(__dirname, '..', '..');
const INBOX = path.join(RAIZ, 'tmp', 'e2-galer', 'inbox');

/* INV-2026-0169 · Budenheim USA · 8958.5 → INV-2026-0169_Budenheim-USA_8958-50.pdf */
function nombreArchivo(folio, cliente, monto) {
  const c = String(cliente).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const m = Number(monto).toFixed(2).replace('.', '-');
  return `${folio}_${c}_${m}.pdf`;
}

function main() {
  const archivoTokens = process.argv[2] || path.join(RAIZ, 'tmp', 'e2-galer', 'tokens.json');
  const lista = JSON.parse(fs.readFileSync(archivoTokens, 'utf8'));
  fs.mkdirSync(INBOX, { recursive: true });
  const tabla = [];
  for (const f of lista) {
    const nombre = nombreArchivo(f.folio, f.cliente, f.monto);
    const destino = path.join(INBOX, nombre);
    const url = `${BASE}/web/content/${f.attachment_id}?access_token=${f.access_token}&download=true`;
    let http = '';
    try {
      http = execFileSync('curl', ['-sS', '--max-time', '90', '-o', destino, '-w', '%{http_code}', url],
        { encoding: 'utf8' }).trim();
    } catch (e) { http = 'curl-error'; }
    const fallos = [];
    let bytes = 0, sha1 = '';
    if (http !== '200') fallos.push('http ' + http);
    if (fs.existsSync(destino)) {
      const buf = fs.readFileSync(destino);
      bytes = buf.length;
      sha1 = crypto.createHash('sha1').update(buf).digest('hex');
      if (buf.slice(0, 5).toString('latin1') !== '%PDF-') fallos.push('no empieza con %PDF-');
      if (bytes <= 20 * 1024) fallos.push('pesa ' + bytes + ' bytes');
      if (f.checksum && sha1 !== f.checksum) fallos.push('sha1 distinto al checksum de Odoo');
      if (!fallos.length) {
        const txt = execFileSync('pdftotext', ['-layout', destino, '-'], { encoding: 'utf8' });
        if (/Proforma/i.test(txt)) fallos.push('dice Proforma');
        for (const w of (f.buscar || [])) if (txt.indexOf(w) < 0) fallos.push('no trae «' + w + '»');
      }
    } else fallos.push('no se escribió el archivo');
    if (fallos.length && fs.existsSync(destino)) fs.unlinkSync(destino);
    tabla.push({ archivo: nombre, bytes, sha1_ok: !!f.checksum && sha1 === f.checksum, estado: fallos.length ? 'FALLO: ' + fallos.join('; ') : 'OK' });
  }
  console.table(tabla);
  process.exitCode = tabla.every(t => t.estado === 'OK') ? 0 : 1;
}

if (require.main === module) main();
module.exports = { nombreArchivo };
