#!/usr/bin/env node
/* ═══ sellar.js · mete _comun.css DENTRO de cada prototipo ══════════════════
 *
 * POR QUÉ EXISTE, que es lo que no se debe perder:
 *
 * Los prototipos se declararon «autocontenidos» y no lo eran: los cuatro
 * enlazaban `_comun.css` con <link>. En el dominio se veían SIN FORMATO —letra
 * Times New Roman, sin tarjetas, sin colores y sin el propio aviso de que son
 * maquetas— porque GitHub Pages construye con Jekyll y **Jekyll no publica los
 * archivos cuyo nombre empieza con `_`**. El archivo estaba en el repo, igual
 * al nuestro, y aun así no llegaba: verificar que el HTML servido es idéntico
 * NO es lo mismo que verlo pintado.
 *
 * El arreglo de raíz es no depender de eso: el estilo viaja DENTRO del HTML.
 * Así el prototipo abre con doble clic, desde una rama, desde un ZIP o desde
 * Pages, y no hay una segunda petición que pueda faltar.
 *
 * `_comun.css` se queda como FUENTE ÚNICA. Si hubiera cuatro copias a mano,
 * en un mes dirían cosas distintas (CLAUDE.md §20 #4). Este guion las mantiene
 * iguales:
 *
 *     node comercial/prototipos/e3/sellar.js            → sella
 *     node comercial/prototipos/e3/sellar.js --revisar  → sólo avisa si difieren
 *
 * El `--revisar` devuelve 1 si algún archivo quedó desfasado, para poder
 * atarlo a una prueba.
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const FUENTE = path.join(DIR, '_comun.css');
const PAGS = ['ordenes', 'confirmacion', 'comision-selector', 'rentabilidad-4-numeros'];
const REVISAR = process.argv.includes('--revisar');

const ABRE = '<style id="comun">';
const CIERRA = '</style>';
const CABECERA = '\n/* ═══ GENERADO desde _comun.css por sellar.js — NO editar aquí ═══\n' +
                 ' * Va inline a propósito: Jekyll no publica archivos que empiezan con `_`,\n' +
                 ' * así que enlazarlo por fuera llega vacío al dominio.\n' +
                 ' * Para cambiarlo: edita _comun.css y corre `node sellar.js`. */\n';

const css = fs.readFileSync(FUENTE, 'utf8');
const bloque = ABRE + CABECERA + css + CIERRA;

let desfasados = 0;
for (const p of PAGS) {
  const f = path.join(DIR, p + '.html');
  const antes = fs.readFileSync(f, 'utf8');
  let despues;

  const i = antes.indexOf(ABRE);
  if (i !== -1) {                                   // ya está sellado: se refresca
    const j = antes.indexOf(CIERRA, i);
    if (j === -1) throw new Error(p + ': hay <style id="comun"> sin cerrar');
    despues = antes.slice(0, i) + bloque + antes.slice(j + CIERRA.length);
  } else {                                          // primera vez: sustituye el <link>
    const re = /<link[^>]+href=["']_comun\.css["'][^>]*>/;
    const m = antes.match(re);
    if (!m) throw new Error(p + ': ni <style id="comun"> ni <link href="_comun.css">');
    if (antes.match(new RegExp(re.source, 'g')).length !== 1)
      throw new Error(p + ': el <link> no aparece exactamente 1 vez');
    despues = antes.replace(re, bloque);
  }

  /* Red: después de sellar no puede quedar NINGUNA petición externa.
   * Se mira ANTES de escribir —un archivo que no pasa la red no se guarda— y
   * sobre el HTML con los cuerpos de <style>, <script> y comentarios fuera:
   * si no, el guion se denuncia a sí mismo por el `<link` que menciona su
   * propia cabecera. Un centinela que grita por su propio texto se acaba
   * apagando, que es peor que no tenerlo. */
  const soloMarcado = despues
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style></style>')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>')
    .replace(/<!--[\s\S]*?-->/g, '');
  const fuera = (soloMarcado.match(/<(?:link|script)[^>]+(?:href|src)=["'](?!#)[^"']+["']/g) || []);
  if (fuera.length) throw new Error(p + ': sigue pidiendo algo de fuera → ' + fuera.join(' '));

  const igual = despues === antes;
  if (!igual) desfasados++;
  if (!igual && !REVISAR) fs.writeFileSync(f, despues);

  console.log(
    p.padEnd(24) + (REVISAR ? (igual ? 'al día' : 'DESFASADO') : (igual ? 'sin cambio' : 'sellado'))
    + '  ·  ' + despues.length + ' bytes  ·  0 peticiones externas');
}

if (REVISAR && desfasados) {
  console.error('\n' + desfasados + ' prototipo(s) desfasados de _comun.css. Corre: node ' +
                path.relative(process.cwd(), __filename));
  process.exit(1);
}
