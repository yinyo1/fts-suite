// -- Code - ESCRITOR del bloque marcado (contrato SEM v1, issue #240 / #229) ---
// ESTE NODO NO ESCRIBE A ODOO. Produce el CUERPO del log note que el watchdog
// escribiria, con el bloque marcado dentro. La mitad que escribe de verdad es
// `Odoo - CREATE log note` de `ops/watchdog-semaforo`, y este cuerpo es el que
// tendria que recibir en `body`.
//
// POR QUE EL BLOQUE. El delta del correo -«nuevo», «empeoro», «mejoro»- se
// calcula hoy contra `staticData` (`s1_prevA`), y `staticData` SOLO persiste en
// corridas de produccion: una corrida manual no lo ve, y si el workflow se
// reimporta se pierde. El chatter de Odoo es durable, esta por proyecto, y ya lo
// escribe el propio watchdog. Hoy esa nota es PROSA, y reconstruir el estado
// parseando «ESTANCAMIENTO VERDE (7d en stage)» con una expresion regular es la
// fragilidad de siempre: alguien mejora la redaccion y el delta se rompe en
// silencio. El bloque separa las dos lecturas: la persona lee la prosa, la
// maquina lee el bloque.
//
// EL FORMATO ES EL DE LA CASA, NO UNO NUEVO. `fin/watchdog-captura` lleva desde
// agosto escribiendo `[[CBWATCH]]{json}[[/CBWATCH]]` en `mail.message` con este
// mismo `author_id 3` y `subtype_id 2`, y leyendolo de vuelta. Eso ya prueba que
// un JSON entre marcas SOBREVIVE al saneador de HTML de Odoo, que era la unica
// duda real del formato. Se copia el patron y se copia tambien su leccion: alli
// el lector corta con `s.slice(a+11, b)`, con el 11 escrito a mano, y ese numero
// es la longitud de la marca; aqui se usa `ABRE.length`.
//
// LA MARCA ES FIJA Y LA VERSION VA DENTRO. `[[SEM]]` no cambia nunca -asi una
// consulta `body like %[[SEM]]%` sigue sirviendo cuando el contenido evolucione-
// y la version viaja en `v`. Es la leccion del CBWATCH que cambio de forma
// (`chase:{}` -> `cuentas_online:[]`): el lector tiene que poder reconocer el
// bloque ANTES de entender su contenido, para leer las dos formas en la
// transicion en vez de perder la referencia.
//
// QUE LLEVA, Y POR QUE ESTOS CAMPOS. La firma que el correo compara hoy es
// `color_a_rep | tramo_a | sin_avance` (`firmaDe` de `Code - buildEmail`). Un
// bloque que no traiga ESOS TRES no puede sustituir a `staticData`: reconstruiria
// un delta distinto del que el correo viene dando. Por eso van `ar` y `sa`
// ademas de los obvios -la medicion de #226 los marco como los dos que faltaban-.
// `ar` (color_a_rep) hoy coincide con `a` (color_a) porque `observacion.stages`
// esta vacio: es una coincidencia de configuracion, no una garantia, y guardar
// solo uno seria confiar en ella.
//
// ESTADO COMPLETO, NO DELTA, por modo de falla: si se guardara solo el delta
// habria que sumar la cadena, y una nota perdida correria todo lo posterior para
// siempre. Con estado completo una nota perdida afecta UN dia y el siguiente se
// recupera solo.
//
// NO CAMBIA NINGUN UMBRAL NI NINGUN COLOR: solo agrega un parrafo al cuerpo.

const ABRE = '[[SEM]]';
const CIERRA = '[[/SEM]]';

function esc(s){ return String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function bloque(p, fecha){
  const estado = {
    v: 1,
    f: fecha,
    a:  p.color_a || null,
    ar: p.color_a_rep || p.color_a || null,   // el que compara el correo
    b:  p.color_b || null,
    da: (p.dias_en_stage == null ? null : Number(p.dias_en_stage)),
    db: (p.dias_sin_seguimiento == null ? null : Number(p.dias_sin_seguimiento)),
    ta: p.tramo_a || null,
    sa: !!p.sin_avance,
    rn: Number(p.racha_nota || 0),
    g:  (p.banderas || []).map(function(f){ return f.tipo; })
  };
  return ABRE + JSON.stringify(estado) + CIERRA;
}

const hoy = String($('Set - hoy').first().json.hoy || '').slice(0, 10);

const out = [];
for (const it of $input.all()) {
  const p = it.json;
  // la fila de _solo_diag no trae id: pasa igual, sin cuerpo
  if (!p || p.id === undefined) { out.push({ json: p }); continue; }

  const aTxt = String(p.color_a || '').toUpperCase() + ' (' +
               (p.dias_en_stage == null ? '?' : p.dias_en_stage) + 'd en stage)';
  const bTxt = String(p.color_b || '').toUpperCase() + ' (' +
               (p.dias_sin_seguimiento == null ? '?' : p.dias_sin_seguimiento) + 'd sin nota)';

  // 1. la parte para PERSONAS, palabra por palabra la de hoy
  let html = '<p><b>Watchdog</b> (' + esc(p.stage) + '): ESTANCAMIENTO ' + esc(aTxt) +
             ' &middot; SEGUIMIENTO ' + esc(bTxt) + '.</p>';
  if ((p.banderas || []).length) {
    html += '<p>Integridad:</p><ul>';
    for (const f of p.banderas) html += '<li>' + esc(f.detalle) + '</li>';
    html += '</ul>';
  }
  // 2. la parte para MAQUINAS, en gris chico. No se esconde: quien abra el
  //    chatter ve exactamente lo que quedo registrado.
  html += '<p style="font-size:11px;color:#888">' + esc(bloque(p, hoy)) + '</p>';

  out.push({ json: Object.assign({}, p, { _body: html, _bloque: bloque(p, hoy) }) });
}
return out;
