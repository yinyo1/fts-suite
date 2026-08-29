#!/usr/bin/env node
// ═══ L6 · sale.order de FTS MX marcadas en USD → MXN (#131 dec.9) ═══
//
//   node lote-6-so-moneda.js --dry-run    (default)
//   node lote-6-so-moneda.js --write
//
// Universo (confirmado por Esteban): HISTÓRICO COMPLETO, las no canceladas.
// company_id=1 (FTS MX) con currency_id=2 (USD). Las canceladas se dejan como están.
//
// Corte obligatorio: solo se corrige lo que NO tenga factura POSTEADA. Cambiar la
// moneda de una SO ya facturada descuadra la contabilidad — esas van a una lista
// para Gerardo, no al script.
//
// ⚠ Este lote toca dinero. A diferencia de los de crm.lead, un error aquí sale
// en estados financieros. Por eso el read-back es por registro, no por lote.
//
// ⚠ La cabecera original decía aquí que "los montos ya están en pesos y solo la
// etiqueta está mal", apoyado en SO5989 ↔ INV1688. Eso resultó FALSO al verificar
// 4 casos más (ver el bloque LOTE DETENIDO abajo). Se deja anotado porque el
// error de razonamiento —generalizar de UNA observación— es la lección del lote.

'use strict';

const M = require('./lib/mapping');
const { conectar, parseArgs, log } = require('./lib/odoo-client');
const fs = require('fs');
const path = require('path');


// ═══════════════════════════════════════════════════════════════════════════
// 🔴 LOTE DETENIDO — 2026-08-29. NO EJECUTAR CON --write.
//
// La premisa de este lote ("company MX + moneda USD = error de captura, los
// montos ya están en pesos") se comprobó FALSA contra las facturas posteadas:
// 4 de los 5 casos del grupo B tienen su account.move posteado TAMBIEN en USD
// con el mismo monto → son ventas en dólares REALES, no etiquetas mal puestas.
// SO5989/INV1688 (la que originó la hipótesis) era la excepción, no la regla.
//
// Convertirlas habría registrado una venta de 5,015.84 USD como 5,015.84 MXN.
//
// Evidencia cruda: docs/comercial/L6-HALLAZGO-MONEDA-2026-08-29.md
// Decisión pendiente de Esteban en el issue #131.
// ═══════════════════════════════════════════════════════════════════════════
const LOTE_DETENIDO = true;

const COMPANY_MX = 1;
const CURRENCY_USD = 2;
const CURRENCY_MXN = 33;  // se resuelve en runtime; este es solo el fallback documentado

async function main() {
  const opts = parseArgs(process.argv);
  if (LOTE_DETENIDO && opts.write) {
    throw new Error(
      'L6 está DETENIDO: su premisa se comprobó falsa el 2026-08-29 (4 de 5 casos del grupo B\n' +
      'son ventas USD reales, con factura posteada en USD). Ver docs/comercial/L6-HALLAZGO-MONEDA-2026-08-29.md.\n' +
      'No se re-habilita sin una decisión escrita de Esteban en el issue #131.');
  }
  log('═══ L6 · Moneda de SO MX marcadas en USD ═══');
  if (LOTE_DETENIDO) log('⚠ LOTE DETENIDO — solo lectura. Ver L6-HALLAZGO-MONEDA-2026-08-29.md');
  log(`modo: ${opts.write ? 'ESCRITURA' : 'DRY-RUN (no escribe nada)'}`);

  const odoo = await conectar();

  // Resolver el id real de MXN en vez de confiar en la constante.
  const mxn = await odoo.searchRead('res.currency', [['name', '=', 'MXN']], ['id', 'name']);
  const mxnId = mxn.length ? mxn[0].id : CURRENCY_MXN;
  log(`moneda destino: MXN (id ${mxnId})${mxn.length ? '' : ' [FALLBACK: no se pudo resolver, revisar]'}`);

  const todas = await odoo.searchRead('sale.order',
    [['company_id', '=', COMPANY_MX], ['currency_id', '=', CURRENCY_USD]],
    ['id', 'name', 'state', 'partner_id', 'amount_total', 'invoice_status', 'invoice_ids', 'create_date']);

  const canceladas = todas.filter((s) => s.state === 'cancel');
  const universo = todas.filter((s) => s.state !== 'cancel');
  log(`\nTotal MX+USD: ${todas.length} · canceladas (se dejan): ${canceladas.length} · universo: ${universo.length}`);

  // ── Corte por factura posteada ──
  // Discriminador: los account.move ligados por `invoice_ids`, filtrando por
  // state='posted'. `invoice_status` NO sirve y falla en ambas direcciones
  // (verificado: 3 SO dicen "to invoice" con factura posteada por facturación
  // parcial, y 1 dice "invoiced" con la factura en borrador).
  const idsFactura = [...new Set(universo.flatMap((s) => s.invoice_ids || []))];
  const facturas = idsFactura.length
    ? await odoo.releer('account.move', idsFactura, ['id', 'name', 'state', 'move_type', 'amount_total', 'currency_id'])
    : [];
  const porId = new Map(facturas.map((f) => [f.id, f]));
  const esPosteada = (f) => f && f.state === 'posted' && ['out_invoice', 'out_refund'].includes(f.move_type);
  const esBorrador = (f) => f && f.state === 'draft' && ['out_invoice', 'out_refund'].includes(f.move_type);

  const clasificar = (so) => {
    const fs_ = (so.invoice_ids || []).map((id) => porId.get(id));
    if (fs_.some(esPosteada)) return 'B';       // factura posteada → no se toca
    if (fs_.some(esBorrador)) return 'C';       // factura en borrador → ambiguo
    if (fs_.length && fs_.every((f) => f && f.state === 'cancel')) return 'C'; // solo canceladas
    return 'A';                                  // sin factura viva → corregible
  };

  const grupoA = universo.filter((s) => clasificar(s) === 'A');  // corregibles
  const grupoB = universo.filter((s) => clasificar(s) === 'B');  // para Gera
  const grupoC = universo.filter((s) => clasificar(s) === 'C');  // ambiguos, decisión humana

  const porEstado = (arr) => arr.reduce((a, s) => { a[s.state] = (a[s.state] || 0) + 1; return a; }, {});
  log(`\nGrupo A · CORREGIBLES (sin factura posteada): ${grupoA.length}`);
  log(`  por estado: ${JSON.stringify(porEstado(grupoA))}`);
  log(`  cambio: currency_id → MXN (id ${mxnId}) + nota "${M.MARCA_CHATTER}"`);
  log('  muestra de 5:');
  grupoA.slice(0, 5).forEach((s) => log(
    `    ${s.name} · ${s.state} · ${s.partner_id ? s.partner_id[1] : '(sin cliente)'} · ${s.amount_total}`));

  log(`\nGrupo B · PARA GERA (con factura posteada, NO se tocan): ${grupoB.length}`);
  log(`  por estado: ${JSON.stringify(porEstado(grupoB))}`);
  grupoB.forEach((s) => log(
    `    ${s.name} · ${s.state} · ${s.partner_id ? s.partner_id[1] : '(sin cliente)'} · ${s.amount_total}`));

  log(`\nGrupo C · AMBIGUOS (factura en borrador o solo canceladas): ${grupoC.length}`);
  log('  NO se tocan sin decisión humana: una factura en borrador puede postearse');
  log('  mañana y entonces la moneda corregida ya habría viajado al asiento.');
  grupoC.forEach((s) => log(
    `    ${s.name} · ${s.state} · ${s.partner_id ? s.partner_id[1] : '(sin cliente)'} · ${s.amount_total}`));

  const salida = path.join(__dirname, '..', 'data', 'l6-plan.json');
  fs.writeFileSync(salida, JSON.stringify({
    _meta: { generado: new Date().toISOString(), modo: opts.write ? 'write' : 'dry-run',
      universo: universo.length, corregibles: grupoA.length, para_gera: grupoB.length,
      ambiguos: grupoC.length, canceladas_excluidas: canceladas.length, mxn_id: mxnId,
      nota: 'Solo se cambia currency_id. Los montos NO se convierten (ver cabecera del script).' },
    grupo_a_corregibles: grupoA, grupo_b_para_gera: grupoB, grupo_c_ambiguos: grupoC,
  }, null, 1));
  log(`\nplan escrito en ${path.relative(path.join(__dirname, '..'), salida)}`);

  if (!opts.write) { log('\nDRY-RUN: nada se escribió a Odoo.'); return; }

  // ── Escritura real: una por una, con read-back individual (esto toca dinero) ──
  let ok = 0; const fallos = [];
  for (const so of grupoA) {
    try {
      await odoo.write('sale.order', [so.id], { currency_id: mxnId });
      const [releido] = await odoo.releer('sale.order', [so.id], ['currency_id', 'amount_total']);
      const quedoId = Array.isArray(releido.currency_id) ? releido.currency_id[0] : releido.currency_id;
      if (quedoId !== mxnId) { fallos.push({ so: so.name, motivo: `quedó en ${quedoId}` }); continue; }
      await odoo.notaChatter('sale.order', so.id,
        `${M.MARCA_CHATTER} L6: moneda corregida USD → MXN. La empresa (FTS MX) es la ` +
        `autoridad de moneda; el marcado en USD era un error de captura. ` +
        `Total antes ${so.amount_total} / después ${releido.amount_total}. Sin facturas posteadas.`);
      ok += 1;
    } catch (e) { fallos.push({ so: so.name, motivo: e.message }); }
  }
  log(`\n✓ ${ok}/${grupoA.length} corregidas y releídas.`);
  if (fallos.length) { log(`⚠ ${fallos.length} fallaron:`); fallos.forEach((f) => log(`   ${f.so}: ${f.motivo}`)); }
}

main().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
