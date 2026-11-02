#!/usr/bin/env node
/* Guías por rol de Nómina USA (#448, MVP paso 6). Fuente única: este archivo genera las
 * páginas HTML de esta carpeta con el estilo DENTRO de cada una (sin hojas aparte: CLAUDE.md
 * §20 #23, Pages no publica archivos que empiezan con «_» y una segunda petición puede faltar).
 *   node docs/nomina-usa/guias/armar.js            → escribe las páginas
 *   node docs/nomina-usa/guias/armar.js --revisar  → falla si las páginas no coinciden con esto
 */
'use strict';
const fs = require('fs'), path = require('path');
const PANTALLA = '../../../modulos/rh/nomina-usa/index.html';
const CSS = `:root{--bg:#f5f5f2;--card:#fff;--tx:#1d1d1b;--mu:#5d5d58;--bd:#e3e3dc;--ac:#157a1f;--acl:#e6f3e7;--am:#8a5a00;--aml:#fdf2dc}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#151614;--card:#1e201d;--tx:#ececE6;--mu:#a6a69d;--bd:#33352f;--ac:#6fcf78;--acl:#1f3321;--am:#f0c060;--aml:#3a2e14}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.w{max-width:760px;margin:0 auto;padding:16px}header{background:var(--ac);color:#fff;padding:14px 16px}header a{color:#fff}
h1{font-size:22px;margin:4px 0}h2{font-size:18px;margin:22px 0 8px}.sub{opacity:.9;font-size:14px}
.c{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:12px 14px;margin:10px 0}
ol,ul{padding-left:22px;margin:6px 0}li{margin:4px 0}.t{display:grid;grid-template-columns:auto 1fr;gap:4px 12px}
.t b{white-space:nowrap}.n{background:var(--aml);color:var(--am);border-radius:10px;padding:10px 12px;margin:10px 0;font-size:14px}
.roles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:10px}.roles a{display:block;background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:12px 14px;color:var(--tx);text-decoration:none}
.roles a b{display:block;color:var(--ac)}code{background:var(--acl);border-radius:5px;padding:0 4px;font-size:14px}a{color:var(--ac)}`;
const CAL = `<div class="c t"><b>Lunes a viernes</b><span>Checada en el kiosko (entrada y salida).</span>
<b>Miércoles 8:00</b><span>Recordatorio a Richard si no ha enviado.</span><b>Miércoles 9:00</b><span>Richard envía la solicitud. Si no llegó: aviso a Magaly y Erick.</span>
<b>Miércoles 11:00</b><span>Magaly validó y Erick autorizó.</span><b>Miércoles 12:00</b><span>Gerardo ya la subió a Auris.</span>
<b>Viernes</b><span>Auris deposita. 10:07 corre el ajuste; 11:00 resumen a Richard y Erick.</span></div>
<p class="sub" style="color:var(--mu)">Todas las horas son de Monterrey (CST). Mientras una bandera esté en <b>sombra</b>, los avisos se registran en la pestaña <b>Avisos</b> y no sale ningún correo.</p>`;
const GUIAS = {
  richard: { titulo: 'Richard · solicita la nómina', cuerpo: `
<h2>Qué haces</h2><div class="c"><ul><li>Checas en el kiosko como siempre. Desde EE. UU., al entrar dices tu plan del día y al salir el <b>avance</b> de la SO y qué parte del día fue <b>comercial</b>.</li>
<li>Cada <b>miércoles antes de las 9:00</b> envías la solicitud de la semana (viernes a jueves).</li><li>Si te devuelven la solicitud, la corriges y la vuelves a enviar.</li></ul></div>
<h2>El miércoles, paso a paso</h2><div class="c"><ol><li>Abre <a href="${PANTALLA}">Nómina USA</a> → pestaña <b>Solicitud del miércoles</b>.</li>
<li>En cada SO revisa el avance y quién trabajó. Escribe el avance <b>estimado</b> al miércoles y al jueves: el jueves no puede ser menor al miércoles.</li>
<li>Revisa el <b>reparto</b>: los técnicos salen en proporción a sus horas checadas. Puedes moverlo, pero nunca más que el <b>disponible</b> (bolsa × avance − lo ya pagado). Si te pasas, el botón se apaga y te dice cuánto queda.</li>
<li>Comercial: escribe el % del miércoles y jueves. Un día arriba del sugerido sale como <b>excepción</b> y lleva su explicación; Erick la decide.</li>
<li>El fijo de Rissia sale solo. Presiona <b>Enviar solicitud</b>.</li></ol></div>
<div class="n">Si ves «Hay una incidencia en disputa. Valídala con Magaly.», presiona <b>Pedir a Magaly que la revise</b>. Le llega un aviso y la solicitud se queda detenida hasta que ella la libere.</div>
<h2>Qué te llega</h2><div class="c"><ul><li>Miércoles 8:00: recordatorio si no has enviado.</li><li>Si Magaly o Erick te la devuelven: aviso con el motivo.</li><li>Cuando Gerardo la sube a Auris: confirmación.</li><li>Viernes: resumen del ajuste. Lo que estimaste y no fue se corrige solo en la siguiente solicitud.</li></ul></div>` },
  cuadrilla: { titulo: 'Mateo y José Luis · cuadrilla', cuerpo: `
<h2>Qué haces</h2><div class="c"><ul><li>Checa tu <b>entrada</b> y tu <b>salida</b> en el kiosko todos los días.</li><li>En EE. UU., al entrar eliges la <b>SO</b> en la que vas a trabajar.</li><li>Si se te olvida la salida, usa <b>Olvidé checar salida</b> en el kiosko.</li></ul></div>
<h2>Cómo se paga</h2><div class="c"><p>Tu pago sale de la <b>bolsa de mano de obra</b> de cada SO, conforme avanza el proyecto. Richard reparte entre la cuadrilla en proporción a las horas que checaste en esa SO. Por eso importa que la SO esté bien elegida.</p></div>
<h2>Avisos que te pueden llegar</h2><div class="c"><ul><li>Si a las 8:15 (hora local de donde checaste la última vez) no hay entrada: «No registramos tu entrada de hoy».</li><li>Si pasan 14 horas desde tu entrada sin salida: «Tienes una entrada sin salida».</li></ul></div>` },
  magaly: { titulo: 'Magaly · valida checadas e incidencias', cuerpo: `
<h2>Qué haces</h2><div class="c"><ul><li>Revisas las alertas de checada y las incidencias de la semana.</li><li>El miércoles <b>validas</b> la solicitud de Richard.</li><li>Liberas las incidencias en disputa cuando Richard te lo pide.</li></ul></div>
<h2>Paso a paso</h2><div class="c"><ol><li>Pestaña <b>Alertas e incidencias</b>: marca cada una como falta justificada, falta injustificada, error de checada corregido o en disputa. La justificada y la disputa piden motivo.</li>
<li>Valida los <b>días sin ubicación</b> (USA o México). Mientras haya uno pendiente, la solicitud no avanza.</li>
<li>Cuando te llegue «Richard envió la solicitud», abre <b>Revisión</b> y presiona <b>Validar checadas e incidencias</b>, o <b>Devolver a Richard</b> con el motivo.</li></ol></div>
<div class="n">Una falta <b>injustificada</b> de Rissia en la semana deja su fijo en 0. La justificada no descuenta.</div>
<h2>Qué te llega</h2><div class="c"><ul><li>«Richard envió la solicitud».</li><li>«Revisa una incidencia en disputa».</li><li>Miércoles 9:00 si Richard no ha enviado.</li></ul></div>` },
  erick: { titulo: 'Erick · autoriza', cuerpo: `
<h2>Qué haces</h2><div class="c"><ul><li>Autorizas la solicitud ya validada, línea por línea.</li><li>Decides cada comercial con <b>excepción</b>: aprobar o bajar al sugerido.</li><li>Recibes los avisos del <b>vigilante</b> junto con Esteban.</li></ul></div>
<h2>Paso a paso</h2><div class="c"><ol><li>Cuando te llegue «Magaly validó», abre <a href="${PANTALLA}">Nómina USA</a> → <b>Revisión</b>.</li>
<li>En cada excepción elige <b>Aprobar</b> o <b>Bajar al sugerido</b>. Sin decidir no deja autorizar.</li><li>Presiona <b>Autorizar</b>. La base vuelve a revisar que ninguna SO pase de su disponible.</li></ol></div>
<div class="n">Autorizar más de lo pedido solo con folio de Esteban.</div>
<h2>El vigilante te avisa si</h2><div class="c"><ul><li>Las alertas de checada no corren en 30 minutos.</li><li>9:30 sin solicitud · 11:00 sin autorizar · 12:00 sin subir a Auris.</li><li>El ajuste del viernes no corrió.</li><li>Una SO con bolsa tiene checadas de la cuadrilla y más de 2 días sin avance.</li></ul></div>` },
  gerardo: { titulo: 'Gerardo · Auris, costo y conciliación', cuerpo: `
<h2>Qué haces</h2><div class="c"><ul><li>El miércoles descargas el archivo para Auris, lo subes antes de las 12:00 y marcas <b>subido</b>.</li><li>Revisas el <b>asiento de costo</b> por SO que arma el sistema.</li><li>Cuando Auris cobra, importas su <b>registro de nómina</b> para conciliar contra el banco.</li></ul></div>
<h2>Paso a paso</h2><div class="c"><ol><li>Te llega «autorizada la semana…, súbela a Auris». Abre <a href="${PANTALLA}">Nómina USA</a> → <b>Revisión</b>.</li>
<li><b>Descargar archivo para Auris (.csv)</b>: una fila por persona y cuenta (la SO, COMERCIAL-USA o Sales FTS USA). Súbelo a Auris.</li>
<li><b>Marcar subido a Auris</b>. Se avisa a Richard, Magaly y Erick, y abajo aparece el asiento de costo.</li>
<li><b>Costo en Odoo por SO</b>: una línea por persona y cuenta analítica contra «Nómina USA por pagar». Mientras la bandera esté apagada, solo se ve aquí. Si dice «Falta para crearlo en Odoo», es lo que hay que dar de alta antes de prenderla.</li>
<li><b>Conciliación de Auris</b>: sube el registro (.csv) o pégalo. El sistema busca 1, 2 o 3 cargos del banco BUS COMPLETE CHK que sumen el total, propone el asiento (neto, impuestos y fee) y reparte los impuestos del mes a las SO. Si no cuadra, te llega un aviso.</li></ol></div>
<div class="n">El formato del registro de Auris todavía no se conoce: las columnas se configuran sin tocar código. Si al importar dice «No encontré la columna…», pásale el archivo a Esteban.</div>` },
  esteban: { titulo: 'Esteban · banderas, bolsas y vigilante', cuerpo: `
<h2>Qué haces</h2><div class="c"><ul><li>Prendes y apagas cada pieza (todo nace apagado o en sombra).</li><li>Capturas las bolsas provisionales con folio.</li><li>Recibes los avisos del vigilante.</li></ul></div>
<h2>Dónde está cada bandera</h2><div class="c t"><b>Ficha y banderas</b><span>Kiosko USA · Alertas USA · Alertas México · bandera del kiosko por persona.</span>
<b>Avisos</b><span>Avisos entre pasos · Vigilante · Costo en Odoo · Conciliación Auris.</span></div>
<p>Cada cambio pide motivo y queda en la bitácora. Para regresar, el mismo botón: «Volver a sombra» o «Apagar».</p>
<h2>Bolsas</h2><div class="c"><p>Pestaña <b>Bolsas por SO</b>: «Traer del machote» con la orden de venta, o provisional con folio. Sin bolsa no se puede pedir pago de esa SO.</p></div>
<div class="n">La lista de clics en orden, con su reversa, está en el issue #448.</div>` }
};
const NOMBRES = { richard: 'Richard', cuadrilla: 'Mateo y José Luis', magaly: 'Magaly', erick: 'Erick', gerardo: 'Gerardo', esteban: 'Esteban' };
function pagina(titulo, cuerpo, atras) {
  return `<!doctype html>\n<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${titulo.split(' · ')[0]} · Guía Nómina USA</title>\n<style>${CSS}</style></head>\n<body><header><div class="w" style="padding:0">${atras ? '<a href="index.html">← Todas las guías</a>' : '<a href="' + PANTALLA + '">← Nómina USA</a>'}<h1>${titulo}</h1><div class="sub">Nómina USA · FTS Full Technology Systems LLC</div></div></header>\n<main class="w">${cuerpo}\n<h2>El calendario de la semana</h2>${CAL}\n</main></body></html>\n`;
}
const salida = {};
salida['index.html'] = pagina('Guía por rol', '<p>Qué hace cada quien, cuándo y qué ve en la pantalla.</p><div class="roles">' +
  Object.keys(GUIAS).map(k => `<a href="${k}.html"><b>${NOMBRES[k]}</b>${GUIAS[k].titulo.split(' · ')[1]}</a>`).join('') + '</div>', false);
for (const k of Object.keys(GUIAS)) salida[k + '.html'] = pagina(GUIAS[k].titulo, GUIAS[k].cuerpo, true);
const dir = __dirname, revisar = process.argv.includes('--revisar');
let malas = 0;
for (const [f, html] of Object.entries(salida)) {
  const p = path.join(dir, f);
  if (revisar) { if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== html) { console.log('DISTINTA ' + f); malas++; } }
  else fs.writeFileSync(p, html);
}
if (revisar) { console.log(malas ? malas + ' guía(s) desactualizadas' : 'guías al día'); process.exit(malas ? 1 : 0); }
console.log('escritas: ' + Object.keys(salida).join(', '));
