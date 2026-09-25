// ═══ Gate · el lector de los TXT de dispersión ═════════════════════════════
//
// Este gate existe porque el TXT es el último eslabón antes del dinero: el Excel
// puede estar perfecto y el archivo que se sube al banco pagarle a otro. Un falso
// verde aquí es el único error de toda la cadena que no se corrige.
//
// Los renglones de prueba NO se escriben a mano: se ARMAN con `reng()`, que aplica
// el mismo ancho fijo que el lector exige. Escribirlos a mano sería probar mi
// transcripción, no el formato — y un carácter de más se vería igual que un bug.
//
// Cero datos reales: cuentas y nombres inventados (el repo es público).
//
//   node tests/gate-txt-dispersion.js

'use strict';
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const Txt = require(path.join(RAIZ, 'operaciones', 'carga-mo', 'js', 'txt-dispersion.js'));

let ok = 0, fail = 0;
function check(nombre, cond, detalle) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { fail++; console.log('  ✗ ' + nombre + (detalle ? ' → ' + detalle : '')); }
}
function seccion(t) { console.log('\n── ' + t + ' ──'); }
function tiene(h, codigo) { return h.some(function (x) { return x.codigo === codigo; }); }
function soloCodigos(h) { return [].concat.apply([], h.map(function (x) { return x.codigo; })); }

/* ── El armador de renglones ──────────────────────────────────────────────
   n: consecutivo · cuenta: 10 dígitos · centavos: entero · nombre: hasta 40 */
function reng(n, cuenta, centavos, nombre) {
  return String(n).padStart(9, '0') +
         ' '.repeat(16) +
         '99' + String(cuenta).padStart(10, '0') +
         ' '.repeat(10) +
         String(centavos).padStart(15, '0') +
         String(nombre).toUpperCase().slice(0, 40).padEnd(40, ' ') +
         '001001';
}
function archivo(filas, terminador) {
  var t = terminador || '\r\n';
  return filas.join(t) + t;
}

/* ── Un Excel de mentira con la forma que devuelve el resolver ───────────── */
function excel(empleados, trio, totalNeto) {
  return {
    empleados: empleados.map(function (e, i) {
      return { cod: e.cod, nombre: e.nombre, neto: e.neto, fila: 10 + i };
    }),
    trio: (trio || []).map(function (t, i) {
      return { empleado_id: t.id, nombre: t.nombre, neto: t.neto, fila: 40 + i };
    }),
    total_gral: totalNeto === null ? null : { neto: totalNeto }
  };
}
// La tabla del trío tal como vive en el catálogo: alias con dos grafías, y el
// nombre de pila que usa el Excel junto al completo que usa el TXT.
const CAT = { trio: { personas: {
  76: { alias: ['CARLOS', 'MANZANAREZ', 'MANZANARES', 'CARLOS EDUARDO MANZANARES'] },
  98: { alias: ['RICARDO', 'HERNANDEZ GONZALEZ', 'RICARDO HERNANDEZ'] },
  112:{ alias: ['FELIPE', 'PEREZ GUZMAN', 'FELIPE PEREZ'] }
} } };

/* ═══ 1 · EL FORMATO ══════════════════════════════════════════════════════ */
seccion('el formato del renglón');
{
  const uno = reng(1, '1234567890', 150075, 'PEREZ LOPEZ JUAN');
  check('el armador produce 108 caracteres', uno.length === 108, String(uno.length));

  const r = Txt.leer(archivo([uno]), 'x.txt');
  check('se lee sin fallas', r.fallas.length === 0, JSON.stringify(r.fallas));
  check('detecta CRLF', r.terminador === 'CRLF', r.terminador);
  check('saca el importe en centavos enteros', r.renglones[0].centavos === 150075);
  check('saca el nombre sin el relleno', r.renglones[0].nombre === 'PEREZ LOPEZ JUAN', r.renglones[0].nombre);
  check('saca los últimos 4 de la cuenta', r.renglones[0].cuenta_ult4 === '7890');
  check('y el total', r.total_centavos === 150075);
}
{
  // Un archivo con LF se lee igual de bien: el lector NO puede rechazar un
  // archivo bueno por el terminador (sería el peor modo de falla posible).
  const r = Txt.leer(archivo([reng(1, '1234567890', 100, 'A B')], '\n'), 'lf.txt');
  check('un archivo con LF se lee igual', r.fallas.length === 0 && r.renglones.length === 1, r.terminador);
  check('y se reporta como LF', r.terminador === 'LF', r.terminador);
}
{
  const mixto = reng(1, '1234567890', 100, 'A B') + '\r\n' + reng(2, '1234567891', 100, 'C D') + '\n';
  const r = Txt.leer(mixto, 'mix.txt');
  check('mezclar CRLF y LF se rechaza', tiene(r.fallas, 'TXT_TERMINADOR_MIXTO'), JSON.stringify(soloCodigos(r.fallas)));
}
{
  // El caso que motiva exigir el ancho: un substring sobre un renglón corto NO
  // truena, devuelve basura — y se compararía con confianza.
  const corto = reng(1, '1234567890', 100, 'A B').slice(0, 95);
  const r = Txt.leer(archivo([corto]), 'corto.txt');
  check('un renglón de otro largo se RECHAZA, no se lee a medias', tiene(r.fallas, 'TXT_ANCHO_INVALIDO'));
  check('y no devuelve ningún renglón', r.renglones.length === 0);
}
{
  const r = Txt.leer(archivo([reng(1, '1234567890', 100, 'A B'), reng(3, '1234567891', 100, 'C D')]), 'x.txt');
  check('un consecutivo que se salta un número se rechaza', tiene(r.fallas, 'TXT_CAMPO_INVALIDO'));
}
{
  const malo = reng(1, '1234567890', 100, 'A B').replace('001001', '001002');
  const r = Txt.leer(archivo([malo]), 'x.txt');
  check('una cola distinta de 001001 se rechaza', tiene(r.fallas, 'TXT_CAMPO_INVALIDO'));
}
{
  const malo = '000000001' + ' '.repeat(16) + '88' + '1234567890' + ' '.repeat(10) +
               String(100).padStart(15, '0') + 'A B'.padEnd(40, ' ') + '001001';
  const r = Txt.leer(archivo([malo]), 'x.txt');
  check('un prefijo distinto de 99 se rechaza', tiene(r.fallas, 'TXT_CAMPO_INVALIDO'));
}
{
  // El relleno es la prueba de que no hay campo escondido: si trae texto, el
  // archivo no tiene la forma que creemos y todas las posiciones son sospechosas.
  const malo = '000000001' + 'X'.padEnd(16, ' ') + '991234567890' + ' '.repeat(10) +
               String(100).padStart(15, '0') + 'A B'.padEnd(40, ' ') + '001001';
  const r = Txt.leer(archivo([malo]), 'x.txt');
  check('texto en el relleno se rechaza', tiene(r.fallas, 'TXT_CAMPO_INVALIDO'));
}
{
  const r = Txt.leer('', 'vacio.txt');
  check('un archivo vacío se dice, no truena', tiene(r.fallas, 'TXT_VACIO'));
  const r2 = Txt.leer(archivo([reng(1, '1234567890', 100, 'A B')]) + 'basura', 'x.txt');
  check('contenido pegado fuera de los renglones se rechaza',
        tiene(r2.fallas, 'TXT_ANCHO_INVALIDO') || tiene(r2.fallas, 'TXT_TAMANO_NO_CUADRA'),
        JSON.stringify(soloCodigos(r2.fallas)));
}

/* ═══ 2 · LA SEMANA BUENA ═════════════════════════════════════════════════ */
seccion('la semana que cuadra no produce ni un hallazgo');
const EMP = [
  { cod: '002', nombre: 'PEREZ LOPEZ JUAN',      neto: 1500.75 },
  { cod: '005', nombre: 'GOMEZ RUIZ ANA MARIA',  neto: 2000.00 },
  { cod: '009', nombre: 'SOTO DIAZ LUIS ALBERTO',neto: 2000.00 }   // mismo neto que la anterior
];
const TRIO = [{ id: 112, nombre: 'FELIPE', neto: 500.50 }];
const TXT_OK = archivo([
  reng(1, '1000000001', 150075, 'PEREZ LOPEZ JUAN'),
  reng(2, '1000000002', 200000, 'GOMEZ RUIZ ANA MARIA'),
  reng(3, '1000000003', 200000, 'SOTO DIAZ LUIS ALBERTO')
]);
const HON_OK = archivo([reng(1, '1000000009', 50050, 'PEREZ GUZMAN FELIPE')]);
{
  const P = excel(EMP, TRIO, 6001.25);
  const c = Txt.cruzar(P, { nomina: Txt.leer(TXT_OK, 'n.txt'), honorarios: Txt.leer(HON_OK, 'h.txt') }, CAT);
  check('cero hallazgos', c.hallazgos.length === 0, JSON.stringify(c.hallazgos.map(h => h.codigo + ': ' + h.dato)));
  check('cuadra_todo', c.resumen.cuadra_todo === true);
  check('aparea los 3 de nómina', c.resumen.nomina.apareados === 3);
  check('aparea al de honorarios por alias', c.resumen.honorarios.apareados === 1);
}
{
  // 🔴 La razón por la que la llave NO es el importe: dos personas con el mismo
  // neto al centavo existen de verdad (medido en S37 y S38). Con importe como
  // llave, estas dos serían ambiguas; con nombre, no.
  const P = excel(EMP, TRIO, 6001.25);
  const c = Txt.cruzar(P, { nomina: Txt.leer(TXT_OK, 'n.txt'), honorarios: Txt.leer(HON_OK, 'h.txt') }, CAT);
  const dosIguales = EMP.filter(e => e.neto === 2000).length === 2;
  check('dos personas con el mismo neto NO confunden al apareo', dosIguales && c.hallazgos.length === 0);
}

/* ═══ 3 · LAS TRES IDENTIDADES ════════════════════════════════════════════ */
seccion('nivel 1 · las tres sumas');
{
  const P = excel(EMP, TRIO, 6001.25);
  const menos = archivo([reng(1, '1000000001', 150075, 'PEREZ LOPEZ JUAN'),
                         reng(2, '1000000002', 200000, 'GOMEZ RUIZ ANA MARIA')]);
  const c = Txt.cruzar(P, { nomina: Txt.leer(menos, 'n.txt'), honorarios: Txt.leer(HON_OK, 'h.txt') }, CAT);
  check('falta un renglón → la suma no cuadra', tiene(c.hallazgos, 'TXT_TOTAL_NO_CUADRA'));
  check('y se dice QUIÉN se quedaría sin pago', tiene(c.hallazgos, 'TXT_SIN_RENGLON'));
  check('y el Total Gral. tampoco cuadra', tiene(c.hallazgos, 'TXT_SUMA_NO_CUADRA_TOTAL'));
  check('todo eso es INTEGRIDAD: no se manda', Txt.contar(c.hallazgos, 'INTEGRIDAD') >= 3);
}
{
  // El archivo de honorarios NO declara su semana — ni su nombre es de fiar.
  // La aritmética es lo único que lo ata a esta nómina.
  const P = excel(EMP, TRIO, 6001.25);
  const otroHon = archivo([reng(1, '1000000009', 99999, 'PEREZ GUZMAN FELIPE')]);
  const c = Txt.cruzar(P, { nomina: Txt.leer(TXT_OK, 'n.txt'), honorarios: Txt.leer(otroHon, 'h.txt') }, CAT);
  check('un honorarios de otra semana se detecta por la suma', tiene(c.hallazgos, 'TXT_HONORARIOS_NO_CUADRA'));
  check('y además por el importe de la persona', tiene(c.hallazgos, 'TXT_IMPORTE_DISTINTO'));
}
{
  const P = excel(EMP, TRIO, 6001.25);
  const c = Txt.cruzar(P, { nomina: Txt.leer(TXT_OK, 'n.txt'), honorarios: null }, CAT);
  check('si el Excel trae honorarios y no se sube su archivo, se dice',
        tiene(c.hallazgos, 'TXT_HONORARIOS_AUSENTE'));
  check('pero como REVISION, no como INTEGRIDAD',
        c.hallazgos.filter(h => h.codigo === 'TXT_HONORARIOS_AUSENTE')[0].nivel === 'REVISION');
}
{
  const P = excel(EMP, TRIO, 6001.25);
  const c = Txt.cruzar(P, { nomina: null, honorarios: null }, CAT);
  check('sin archivo de nómina se dice y no se cruza nada', tiene(c.hallazgos, 'TXT_NOMINA_AUSENTE'));
  check('y no se inventa resumen', c.resumen === null);
}
{
  // Un archivo ilegible NO debe producir hallazgos de cruce: serían inventados
  // sobre datos que no se entendieron (§20 #11).
  const P = excel(EMP, TRIO, 6001.25);
  const roto = Txt.leer(archivo([reng(1, '1000000001', 100, 'A B').slice(0, 90)]), 'r.txt');
  const c = Txt.cruzar(P, { nomina: roto, honorarios: null }, CAT);
  check('un archivo ilegible reporta su formato y NO cruza',
        tiene(c.hallazgos, 'TXT_ANCHO_INVALIDO') && !tiene(c.hallazgos, 'TXT_TOTAL_NO_CUADRA'),
        JSON.stringify(soloCodigos(c.hallazgos)));
}

/* ═══ 4 · PERSONA POR PERSONA ═════════════════════════════════════════════ */
seccion('nivel 1b · persona por persona');
{
  // El caso que de verdad importa: el total cuadra y aun así dos personas cobran
  // lo que no es. Sólo el cruce por persona lo ve.
  const P = excel(EMP, TRIO, 6001.25);
  const cruzado = archivo([
    reng(1, '1000000001', 200000, 'PEREZ LOPEZ JUAN'),
    reng(2, '1000000002', 150075, 'GOMEZ RUIZ ANA MARIA'),
    reng(3, '1000000003', 200000, 'SOTO DIAZ LUIS ALBERTO')
  ]);
  const c = Txt.cruzar(P, { nomina: Txt.leer(cruzado, 'n.txt'), honorarios: Txt.leer(HON_OK, 'h.txt') }, CAT);
  check('dos importes intercambiados: la SUMA cuadra', !tiene(c.hallazgos, 'TXT_TOTAL_NO_CUADRA'));
  check('y aun así se detectan los dos', c.hallazgos.filter(h => h.codigo === 'TXT_IMPORTE_DISTINTO').length === 2);
}
{
  const P = excel(EMP, TRIO, 6001.25);
  const conExtra = archivo([
    reng(1, '1000000001', 150075, 'PEREZ LOPEZ JUAN'),
    reng(2, '1000000002', 200000, 'GOMEZ RUIZ ANA MARIA'),
    reng(3, '1000000003', 200000, 'SOTO DIAZ LUIS ALBERTO'),
    reng(4, '1000000004', 100000, 'AJENO PERSONA QUE NO VA')
  ]);
  const c = Txt.cruzar(P, { nomina: Txt.leer(conExtra, 'n.txt'), honorarios: Txt.leer(HON_OK, 'h.txt') }, CAT);
  const hu = c.hallazgos.filter(h => h.codigo === 'TXT_RENGLON_HUERFANO');
  check('a un desconocido en el archivo se le llama huérfano', hu.length === 1);
  check('y se muestra su NOMBRE para saber de quién se habla',
        /AJENO PERSONA QUE NO VA/.test(hu[0] ? hu[0].dato : ''), hu[0] && hu[0].dato);
  check('con los últimos 4 y nunca la cuenta completa',
        /…\d{4}/.test(hu[0] ? hu[0].dato : '') && !/1000000004/.test(hu[0] ? hu[0].dato : ''), hu[0] && hu[0].dato);
}
{
  // Biyección: dos renglones sobre la misma persona. El segundo NO puede pasar
  // desapercibido sólo porque el nombre aparea.
  const P = excel([EMP[0]], [], 3001.50);
  const doble = archivo([reng(1, '1000000001', 150075, 'PEREZ LOPEZ JUAN'),
                         reng(2, '1000000005', 150075, 'PEREZ LOPEZ JUAN')]);
  const c = Txt.cruzar(P, { nomina: Txt.leer(doble, 'n.txt'), honorarios: null }, CAT);
  check('un pago duplicado a la misma persona se detecta', tiene(c.hallazgos, 'TXT_RENGLON_HUERFANO'));
}
{
  // El nombre en distinto orden es la misma persona: el Excel y el TXT salen los
  // dos de CONTPAQi, pero no se apuesta a que el orden nunca cambie.
  const P = excel([{ cod: '002', nombre: 'PEREZ LOPEZ JUAN', neto: 1500.75 }], [], 1500.75);
  const otroOrden = archivo([reng(1, '1000000001', 150075, 'JUAN PEREZ LOPEZ')]);
  const c = Txt.cruzar(P, { nomina: Txt.leer(otroOrden, 'n.txt'), honorarios: null }, CAT);
  check('el mismo nombre en otro orden aparea igual', c.hallazgos.length === 0, JSON.stringify(soloCodigos(c.hallazgos)));
}
{
  const P = excel([{ cod: '002', nombre: 'PÉREZ LÓPEZ JUÁN', neto: 1500.75 }], [], 1500.75);
  const c = Txt.cruzar(P, { nomina: Txt.leer(archivo([reng(1, '1000000001', 150075, 'PEREZ LOPEZ JUAN')]), 'n.txt'),
                            honorarios: null }, CAT);
  check('los acentos no rompen el apareo', c.hallazgos.length === 0, JSON.stringify(soloCodigos(c.hallazgos)));
}

/* ═══ 5 · EL TRÍO ═════════════════════════════════════════════════════════ */
seccion('el trío · alias por subconjunto de palabras');
{
  check('el nombre de pila del Excel resuelve', Txt.resolverTrio('FELIPE', CAT).unico === 112);
  check('el nombre completo del TXT resuelve al mismo',
        Txt.resolverTrio('PEREZ GUZMAN FELIPE', CAT).unico === 112);
  // Las dos grafías del apellido son la misma persona. Un apareo literal las
  // trataría como dos, y una de las dos se quedaría sin pago sin que nadie lo vea.
  check('MANZANARES resuelve', Txt.resolverTrio('MANZANARES GALLEGOS CARLOS EDUARDO', CAT).unico === 76);
  check('MANZANAREZ (con z) resuelve al mismo', Txt.resolverTrio('MANZANAREZ GALLEGOS CARLOS', CAT).unico === 76);
  check('un desconocido no resuelve', Txt.resolverTrio('AJENO PERSONA QUE NO VA', CAT).unico === null);
}
{
  const P = excel(EMP, [{ id: 98, nombre: 'RICARDO', neto: 500.50 }], 6001.25);
  const c = Txt.cruzar(P, { nomina: Txt.leer(TXT_OK, 'n.txt'), honorarios: Txt.leer(HON_OK, 'h.txt') }, CAT);
  check('el Excel pide a uno y el archivo paga a otro: los dos se dicen',
        tiene(c.hallazgos, 'TXT_HONORARIOS_HUERFANO') && tiene(c.hallazgos, 'TXT_HONORARIOS_SIN_RENGLON'),
        JSON.stringify(soloCodigos(c.hallazgos)));
}

/* ═══ 6 · NINGÚN HALLAZGO EXPONE UNA CUENTA ═══════════════════════════════ */
seccion('el repo es público y la pantalla también se lee');
{
  const P = excel(EMP, TRIO, 6001.25);
  const conExtra = archivo([reng(1, '9876543210', 150075, 'AJENO PERSONA')]);
  const c = Txt.cruzar(P, { nomina: Txt.leer(conExtra, 'n.txt'), honorarios: Txt.leer(HON_OK, 'h.txt') }, CAT);
  const todo = JSON.stringify(c.hallazgos);
  check('ningún hallazgo trae una cuenta de 10 dígitos', !/\d{10}/.test(todo), todo.slice(0, 200));
}

console.log('\n' + '═'.repeat(64));
if (fail) { console.log('FALLARON ' + fail + ' de ' + (ok + fail)); process.exit(1); }
console.log('GATE VERDE — ' + ok + '/' + ok + ' asserts');
