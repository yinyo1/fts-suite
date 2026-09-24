/* ═══ Machote · LA HOJA DEL PAD DE TRABAJO ═══════════════════════════════════
 *
 * El modelo de la hoja de cálculo que vive dentro de cada sección: la rejilla,
 * el evaluador de fórmulas y el formato. Sin dependencias y sin `eval`.
 *
 * ── QUÉ ES, Y QUÉ NO ES (V1.43) ────────────────────────────────────────────
 * Es un BORRADOR Y UNA CALCULADORA, y nada más. **No alimenta nada.** No hay
 * «pasar a renglón», el motor no la lee para calcular, ninguna validación
 * depende de ella y su contenido no entra en ningún total.
 *
 * Lo que SÍ hace, y no está en discusión: **se guarda con el documento**. Es
 * la hoja de trabajo de la persona dentro de su cotización — viaja en cada
 * versión, y cuando alguien abre el machote otra vez ahí está lo que escribió,
 * con sus fórmulas y su formato.
 *
 * ── POR QUÉ NO HAY `eval` NI `new Function`, y no es una preferencia ────────
 * Lo que se escribe en el pad lo teclea una persona, se guarda en el servidor
 * y lo abre OTRA —quien recibe un machote prestado o cedido—. Evaluar ese
 * texto es ejecutar código ajeno en una página que tiene la sesión abierta.
 * O sea que el atajo de dos líneas (`new Function('return '+formula)()`) no
 * es un atajo: es una puerta. Por eso hay un tokenizador y un parser de
 * verdad, que no entienden nada que no sea aritmética.
 *
 * ── LO QUE ENTIENDE, Y NADA MÁS ────────────────────────────────────────────
 *   números          12, 1200.5, .5, $1,200
 *   operadores       + - * / y paréntesis, con la precedencia de siempre
 *   referencias      A1, B3, O30  (columnas A..O, filas 1..30)
 *   cuatro funciones SUMA, RESTA, MULTIPLICACION, DIVISION (con y sin acento)
 *
 * ── LO QUE SE GUARDA ES LO QUE SE ESCRIBIÓ ─────────────────────────────────
 * Las fórmulas viajan COMO TEXTO en el documento y los valores se recalculan
 * al abrir. Nunca se guarda lo calculado: un número almacenado se separa en
 * silencio de sus entradas el día que alguien cambia una celda por otro
 * camino, y después no hay forma de saber cuál de los dos miente. Es la misma
 * familia del `200` que no prueba la escritura (CLAUDE.md §8).
 */
(function (global) {
  'use strict';

  /* ── V1.43 · 30 filas hasta la O, y SIN columna de rótulo ───────────────
   * Antes había una columna de «Concepto» a la izquierda que NO se podía
   * referenciar, porque el pad tenía salida hacia un renglón y ese rótulo era
   * su descripción. Sin salida, la columna deja de tener razón de ser: un
   * rótulo es texto, y el texto cabe en cualquier celda. Así que la primera
   * columna pasa a ser **A**, referenciable como todas. */
  var COLS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O'];
  var MAX_FILAS = 30;
  var ANCHO = COLS.length;
  var FORMA = 2;                       // marca de forma del pad guardado

  /* La forma 1 —la de V1.41 y V1.42— tenía el rótulo en el índice 0 y diez
   * columnas A..J en los índices 1..10. Se conserva para poder migrar. */
  var COLS_V1 = ['A','B','C','D','E','F','G','H','I','J'];

  /* ── El formato: hasta dónde llega, y por qué así ───────────────────────
   * Sólo lo de la pestaña Inicio de Excel que Esteban usa. Cada clave es UNA
   * letra porque esto se guarda en cada versión de un documento append-only:
   * `{"b":1}` son nueve bytes y `{"negrita":true}` son diecinueve.
   *
   *   f  tipo de letra (índice en FUENTES)     b  negrita        i  cursiva
   *   z  tamaño en puntos                      u  subrayado
   *   c  color de letra (hex sin #)            g  color de relleno (hex sin #)
   *   a  alineación 'l' | 'c' | 'r'            w  ajustar texto
   *   n  formato de número 'g' | 'm' | 'p' | 's'
   *   d  decimales 0..6
   */
  var FUENTES = ['Aptos Narrow', 'Aptos', 'Calibri', 'Arial', 'Times New Roman', 'Consolas'];
  var TAMANOS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24];
  var FUENTE_BASE = 0;                 // Aptos Narrow
  var TAMANO_BASE = 11;
  var CLAVES_ESTILO = ['f','z','b','i','u','c','g','a','w','n','d'];

  /* ⚠️ EL TOPE, y es lo que impide que el formato infle el documento.
   * Cada guardado congela el pad entero, así que un formato que crece sin
   * límite crece en TODAS las versiones, para siempre. 120 rangos son ~2.9 KB
   * en el peor caso, contra los 11,274 bytes que mide un documento promedio
   * (medido en las 521 versiones vivas). Al llegar al tope la pantalla lo
   * DICE en vez de callarse: un formato que deja de aplicarse en silencio es
   * peor que uno que avisa. */
  var CAP_RANGOS = 120;

  /* ── La rejilla ──────────────────────────────────────────────────────── */

  /** Una fila en blanco, del ancho de verdad.
   *  (En V1.42 esto devolvía cuatro celdas cuando el ancho ya era once: el
   *  relleno de `normalizar` lo tapaba. Se arregla aquí para que no dependa
   *  de que alguien más lo remiende.) */
  function filaVacia() {
    var f = [];
    for (var i = 0; i < ANCHO; i++) f.push('');
    return f;
  }

  /** Normaliza lo que venga del documento a una rejilla sana.
   *
   *  Defensivo a propósito: esto lee un documento que pudo guardarse con otra
   *  versión, o a mano, o venir a medias de un rescate. Una hoja mal formada
   *  no puede tirar la sección. */
  function normalizar(hoja) {
    var out = [];
    if (Array.isArray(hoja)) {
      for (var i = 0; i < hoja.length && i < MAX_FILAS; i++) {
        var f = Array.isArray(hoja[i]) ? hoja[i] : [];
        var fila = [];
        for (var j = 0; j < ANCHO; j++) {
          var v = f[j];
          fila.push(v === null || v === undefined ? '' : String(v));
        }
        out.push(fila);
      }
    }
    return out;
  }

  /** La hoja que se PINTA: lo normalizado más las filas en blanco del final.
   *
   *  Siempre hay al menos una fila vacía abajo, que es como se agrega una:
   *  escribiendo en ella. Sin eso haría falta un botón «+ fila», y un botón
   *  para algo que puede pasar solo es un botón de más. */
  function paraPintar(hoja) {
    var g = normalizar(hoja);
    while (g.length && filaEnBlanco(g[g.length - 1]) &&
           g.length > 1 && filaEnBlanco(g[g.length - 2])) g.pop();
    if (!g.length || !filaEnBlanco(g[g.length - 1])) {
      if (g.length < MAX_FILAS) g.push(filaVacia());
    }
    while (g.length < 3) g.push(filaVacia());
    return g;
  }

  function filaEnBlanco(f) {
    for (var i = 0; i < ANCHO; i++) if (String((f || [])[i] || '').trim()) return false;
    return true;
  }

  /** ¿Hay algo escrito en la hoja? Lo usa el punto del botón. */
  function tieneAlgo(hoja) {
    var g = normalizar(hoja);
    for (var i = 0; i < g.length; i++) if (!filaEnBlanco(g[i])) return true;
    return false;
  }

  /** Cuántas filas con algo. El botón dice el número, no sólo que hay algo:
   *  un punto dice que existe, un número dice cuánto, y es la diferencia
   *  entre abrirlo y no. */
  function filasConAlgo(hoja) {
    var g = normalizar(hoja), n = 0;
    for (var i = 0; i < g.length; i++) if (!filaEnBlanco(g[i])) n++;
    return n;
  }

  /** `A1` → {col:0, fila:0}, o null si no es una dirección. */
  function dir(ref) {
    var m = /^([A-Oa-o])([0-9]{1,2})$/.exec(String(ref || '').trim());
    if (!m) return null;
    var col = COLS.indexOf(m[1].toUpperCase());
    var fila = parseInt(m[2], 10) - 1;
    if (col < 0 || fila < 0 || fila >= MAX_FILAS) return null;
    return { col: col, fila: fila };
  }

  function nombreDir(col, fila) { return COLS[col] + (fila + 1); }

  /** El texto crudo de una celda por su dirección. */
  function crudoDe(g, ref) {
    var d = dir(ref);
    if (!d || !g[d.fila]) return '';
    return String(g[d.fila][d.col] || '');
  }

  /* ── El tokenizador ──────────────────────────────────────────────────── */

  function tokenizar(src) {
    var t = [], i = 0, s = String(src);
    while (i < s.length) {
      var c = s[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if ('+-*/(),:'.indexOf(c) >= 0) { t.push({ t: c, i: i }); i++; continue; }
      if (/[0-9.]/.test(c)) {
        var j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        var txt = s.slice(i, j);
        if ((txt.match(/\./g) || []).length > 1) throw err('SINTAXIS', txt);
        t.push({ t: 'num', v: parseFloat(txt), i: i, fin: j });
        i = j; continue;
      }
      /* ⚠️ Las vocales con acento y la Ñ son LETRAS aquí. Sin esto,
       * `MULTIPLICACIÓN` se parte en `MULTIPLICACI` + un carácter que el
       * tokenizador no reconoce, y la fórmula falla con un error de sintaxis
       * que no dice nada. Se descubrió probando las cuatro, no leyendo. */
      if (/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(c)) {
        var k = i;
        while (k < s.length && /[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]/.test(s[k])) k++;
        t.push({ t: 'id', v: s.slice(i, k), i: i, fin: k });
        i = k; continue;
      }
      throw err('SINTAXIS', c);
    }
    return t;
  }

  /** ── Las cuatro aritméticas en PALABRA ────────────────────────────────
   *  `SUMA`, `RESTA`, `MULTIPLICACION`, `DIVISION`, con y sin acento y en
   *  cualquier caja. Los símbolos `+ − * /` siguen funcionando igual, así que
   *  `SUMA(A1:A4)` y `A1+A2+A3+A4` son dos formas de escribir lo mismo.
   *
   *  Los acentos se quitan con `normalize('NFD')` y no con una lista de
   *  reemplazos: una lista se queda corta el día que alguien teclee la Ó de
   *  otro teclado. Devuelve el nombre canónico, o `null` si no es función. */
  var FUNCIONES = { SUMA: 1, RESTA: 1, MULTIPLICACION: 1, DIVISION: 1 };
  function nombreFuncion(txt) {
    var n = String(txt || '');
    try { n = n.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
    n = n.toUpperCase();
    return FUNCIONES[n] ? n : null;
  }

  function err(clase, detalle) {
    var e = new Error(clase + (detalle ? ' ' + detalle : ''));
    e.clase = clase; e.detalle = detalle || '';
    return e;
  }

  /* ── El parser (descenso recursivo) ──────────────────────────────────────
   *
   *   expr   := term (('+' | '-') term)*
   *   term   := factor (('*' | '/') factor)*
   *   factor := '-' factor | primary
   *   prim   := num | ref | FUNC '(' args ')' | '(' expr ')'
   *
   * `leer(ref)` la inyecta quien evalúa, y es lo que permite que el parser no
   * sepa nada de la rejilla: le pide un número a una dirección y ya. */
  function analizar(tokens, leer) {
    var p = 0;
    function mira() { return tokens[p]; }
    function come(t) {
      var x = tokens[p];
      if (!x || (t && x.t !== t)) throw err('SINTAXIS', t || 'fin');
      p++; return x;
    }
    function expr() {
      var v = term();
      while (mira() && (mira().t === '+' || mira().t === '-')) {
        var op = come().t, d = term();
        v = op === '+' ? v + d : v - d;
      }
      return v;
    }
    function term() {
      var v = factor();
      while (mira() && (mira().t === '*' || mira().t === '/')) {
        var op = come().t, d = factor();
        if (op === '/') {
          /* Dividir entre cero no lanza al vacío: devuelve el error de la
           * celda, como cualquier hoja. */
          if (d === 0) throw err('DIV0', '');
          v = v / d;
        } else v = v * d;
      }
      return v;
    }
    function factor() {
      if (mira() && mira().t === '-') { come(); return -factor(); }
      if (mira() && mira().t === '+') { come(); return factor(); }
      return prim();
    }
    function rango() {
      // A1:C5 → lista de direcciones; A1 suelto → una sola.
      var a = come('id').v;
      if (!dir(a)) throw err('REF', a);
      if (mira() && mira().t === ':') {
        come(':');
        var b = come('id').v;
        if (!dir(b)) throw err('REF', b);
        var da = dir(a), db = dir(b), lista = [];
        var c0 = Math.min(da.col, db.col), c1 = Math.max(da.col, db.col);
        var f0 = Math.min(da.fila, db.fila), f1 = Math.max(da.fila, db.fila);
        for (var f = f0; f <= f1; f++)
          for (var c = c0; c <= c1; c++) lista.push(nombreDir(c, f));
        return lista;
      }
      return [a];
    }
    function prim() {
      var x = mira();
      if (!x) throw err('SINTAXIS', 'fin');
      if (x.t === 'num') { come(); return x.v; }
      if (x.t === '(') { come('('); var v = expr(); come(')'); return v; }
      if (x.t === 'id') {
        var fn = nombreFuncion(x.v);
        if (fn) {
          come('id'); come('(');
          /* Se juntan TODOS los valores en orden y después se pliegan con el
           * operador. Escrito así, las cuatro funciones son la misma función
           * con un operador distinto, y agregar una quinta no toca el parser. */
          var vals = [];
          for (;;) {
            /* Un argumento es UN RANGO (`A1:C3`) o CUALQUIER EXPRESIÓN
             * (`A1`, `450`, `A1*2`). Se distingue por los dos puntos, que es
             * lo único que el rango tiene y la expresión no. */
            var t0 = mira(), t1 = tokens[p + 1];
            if (t0 && t0.t === 'id' && dir(t0.v) && t1 && t1.t === ':') {
              var refs = rango();
              for (var i = 0; i < refs.length; i++) vals.push(leer(refs[i]));
            } else {
              vals.push(expr());
            }
            if (mira() && mira().t === ',') { come(','); continue; }
            break;
          }
          come(')');
          if (!vals.length) return 0;
          if (fn === 'SUMA') {
            var t = 0; for (var a = 0; a < vals.length; a++) t += vals[a];
            return t;
          }
          if (fn === 'MULTIPLICACION') {
            var p2 = 1; for (var b = 0; b < vals.length; b++) p2 *= vals[b];
            return p2;
          }
          /* RESTA y DIVISION se pliegan desde el PRIMER valor, que es lo que
           * significan cuando alguien las escribe: `RESTA(A1:A3)` es
           * `A1 − A2 − A3`, no la suma con signo. */
          var acc = vals[0];
          for (var c2 = 1; c2 < vals.length; c2++) {
            if (fn === 'RESTA') acc -= vals[c2];
            else {
              if (vals[c2] === 0) throw err('DIV0', '');
              acc /= vals[c2];
            }
          }
          return acc;
        }
        if (!dir(x.v)) throw err('REF', x.v);
        come('id');
        return leer(x.v);
      }
      throw err('SINTAXIS', x.t);
    }
    var r = expr();
    if (p !== tokens.length) throw err('SINTAXIS', 'sobra');
    return r;
  }

  /* ── La evaluación completa, con ciclos ──────────────────────────────── */

  /** Evalúa la hoja entera.
   *
   *  Devuelve `{ valores, errores, filas }` por dirección. `valores[x]` es un
   *  número o `null`; `errores[x]` es `'CICLO' | 'SINTAXIS' | 'REF' | 'DIV0'`.
   *
   *  No hay recálculo incremental a propósito: son 450 celdas como mucho y el
   *  recorrido es lineal; un motor incremental sería más código del que evita.
   *
   *  Los ciclos se detectan con el marcado de tres colores del recorrido en
   *  profundidad (sin visitar / en la pila / listo). Una celda que se cita a
   *  sí misma a través de otras no cuelga el navegador: se marca y sigue. */
  function evaluar(hoja) {
    var g = normalizar(hoja);
    var valores = {}, errores = {}, estado = {};   // estado: 1 en pila, 2 listo

    function leer(ref) {
      var v = valor(ref);
      /* ⚠️ EL ERROR SE PROPAGA, y esto no es cosmético. Sin ello, una celda
       * que cuelga de un ciclo enseñaba `0` con toda confianza. Un cero que
       * en realidad es «esto no se puede calcular» es peor que un error
       * visible: se suma y nadie se entera.
       *
       * Texto y vacío SÍ siguen valiendo cero: una celda en blanco dentro de
       * un SUMA no es un error, es una celda en blanco. */
      if (errores[ref]) throw err(errores[ref] === 'CICLO' ? 'CICLO' : 'REF', ref);
      return typeof v === 'number' ? v : 0;
    }

    function valor(ref) {
      if (estado[ref] === 2) return valores[ref];
      if (estado[ref] === 1) throw err('CICLO', ref);
      estado[ref] = 1;
      var crudo = crudoDe(g, ref).trim();
      var v = null;
      try {
        if (!crudo) v = null;
        else if (crudo.charAt(0) === '=') {
          v = analizar(tokenizar(crudo.slice(1)), leer);
          if (!isFinite(v)) { errores[ref] = 'NUM'; v = null; }
        } else {
          /* Un número escrito como número. Se aceptan comas de millares, el
           * signo de pesos y el de porcentaje porque la gente los teclea:
           * `$1,200` es lo que copia de una cotización. */
          var pct = /%\s*$/.test(crudo);
          var limpio = crudo.replace(/[$\s,%]/g, '');
          if (/^-?(\d+\.?\d*|\.\d+)$/.test(limpio)) {
            v = parseFloat(limpio);
            if (pct) v = v / 100;
          } else v = null;
        }
      } catch (e) {
        errores[ref] = e.clase || 'SINTAXIS';
        v = null;
      }
      estado[ref] = 2; valores[ref] = v;
      return v;
    }

    for (var f = 0; f < g.length; f++)
      for (var c = 0; c < COLS.length; c++) {
        var ref = nombreDir(c, f);
        if (estado[ref] !== 2) {
          try { valor(ref); }
          catch (e) { errores[ref] = e.clase || 'CICLO'; valores[ref] = null; estado[ref] = 2; }
        }
      }

    return { valores: valores, errores: errores, filas: g.length };
  }

  /* ══ LA MIGRACIÓN DE FORMA ════════════════════════════════════════════════
   *
   * La forma 1 (V1.41–V1.42) tenía una columna de rótulo NO referenciable en
   * el índice 0, y A..J en los índices 1..10. La forma 2 no la tiene: el
   * índice 0 es A.
   *
   * ⚠️ Reinterpretar el arreglo sin más CAMBIARÍA EL RESULTADO DE LAS
   * FÓRMULAS EN SILENCIO, que es el peor defecto posible. Medido en la base:
   * hay UNA fórmula guardada en todo el sistema, `=A1+B1`, y bajo la forma 2
   * apuntaría una columna a la izquierda y devolvería 1 donde decía 2.
   *
   * Así que la migración hace DOS cosas y las dos importan:
   *   1. el rótulo se queda donde está —pasa a ser la columna A, que es la
   *      misma posición en pantalla— y por fin se puede referenciar;
   *   2. **cada referencia de cada fórmula corre una letra a la derecha**
   *      (A→B … J→K), para que siga señalando la misma celda.
   *
   * Se hace con el TOKENIZADOR y no con una expresión regular sobre el texto:
   * un `replace` de `A` por `B` también tocaría la `A` de `SUMA`. */

  /** Corre las referencias de UNA fórmula `delta` columnas a la derecha.
   *  Devuelve el texto nuevo; si no se puede tokenizar, devuelve el original
   *  tal cual (una fórmula a medio escribir no se toca). */
  function correrRefs(texto, delta, colsOrigen) {
    var s = String(texto || '');
    if (s.charAt(0) !== '=') return s;
    var cuerpo = s.slice(1), toks;
    try { toks = tokenizar(cuerpo); } catch (e) { return s; }
    var piezas = [], ult = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.t !== 'id') continue;
      if (nombreFuncion(t.v)) continue;              // SUMA y compañía, intactas
      var m = /^([A-Za-z])([0-9]{1,2})$/.exec(t.v);
      if (!m) continue;
      var ci = colsOrigen.indexOf(m[1].toUpperCase());
      if (ci < 0) continue;
      var nuevo = ci + delta;
      if (nuevo < 0 || nuevo >= COLS.length) continue;   // no cabe: se deja igual
      piezas.push(cuerpo.slice(ult, t.i));
      piezas.push(COLS[nuevo] + m[2]);
      ult = t.fin;
    }
    if (!piezas.length) return s;
    piezas.push(cuerpo.slice(ult));
    return '=' + piezas.join('');
  }

  /** Migra una hoja de la forma 1 a la forma 2. Devuelve
   *  `{ hoja, formulas }` — `formulas` es cuántas se corrieron, para que la
   *  prueba pueda exigir el número en vez de creerle. */
  function migrarForma1(hoja) {
    var out = [], corridas = 0;
    var filas = Array.isArray(hoja) ? hoja : [];
    for (var i = 0; i < filas.length && i < MAX_FILAS; i++) {
      var f = Array.isArray(filas[i]) ? filas[i] : [];
      var fila = [];
      for (var j = 0; j < ANCHO; j++) {
        var v = f[j];
        v = (v === null || v === undefined) ? '' : String(v);
        if (v.charAt(0) === '=') {
          var nv = correrRefs(v, 1, COLS_V1);
          if (nv !== v) corridas++;
          v = nv;
        }
        fila.push(v);
      }
      out.push(fila);
    }
    return { hoja: out, formulas: corridas };
  }

  /** ¿El pad guardado viene en la forma vieja?
   *  Sin marca `v` y con una `hoja` = forma 1. Un pad nuevo siempre la trae. */
  function esFormaVieja(pad) {
    var p = pad || {};
    if (Number(p.v) >= 2) return false;
    return Array.isArray(p.hoja) && p.hoja.length > 0;
  }

  /* ══ EL FORMATO ═══════════════════════════════════════════════════════════
   *
   * Se guarda APARTE de `hoja` y en RANGOS, no por celda. Las dos decisiones
   * tienen la misma razón: el pad se congela en cada versión de un documento
   * append-only, así que lo que infle el formato infla todas las versiones.
   *
   *   fmt: { e: [ {…}, {…} ],                    ← diccionario de estilos
   *          r: [ ["A1:O1", 0], ["C2:C30", 1] ] }  ← rangos, EN ORDEN
   *
   * ── POR QUÉ RANGOS Y NO CELDAS ─────────────────────────────────────────
   * «Negrita a toda la hoja» son 450 celdas. Por celda cuesta ~4 KB, que es
   * el 36 % de un documento promedio, en cada versión, para siempre. Como
   * rango cuesta **18 bytes**. Y el caso normal —encabezado en negrita,
   * columna en moneda, dos totales de color— son cuatro entradas.
   *
   * ── POR QUÉ «EL ÚLTIMO GANA» ───────────────────────────────────────────
   * El estilo de una celda es la MEZCLA de todos los rangos que la contienen,
   * en orden. Es la cascada de CSS, son doce líneas, y hace que aplicar un
   * formato sea siempre UNA entrada nueva y nunca reescribir las que había.
   * Partir rangos para que no se solapen sería el triple de código y la mitad
   * de robusto.
   *
   * ── POR QUÉ UN DICCIONARIO ─────────────────────────────────────────────
   * Negrita aplicada en seis sitios son seis entradas de rango apuntando al
   * MISMO estilo. El objeto se escribe una vez.
   */

  /** Lee y sanea el `fmt` de un pad. Nunca lanza: un formato mal formado se
   *  ignora, porque un formato roto no puede impedir abrir la cotización. */
  function fmtLeer(pad) {
    var p = (pad || {}).fmt || {};
    var e = [], r = [];
    if (Array.isArray(p.e)) {
      for (var i = 0; i < p.e.length; i++) {
        var s = saneaEstilo(p.e[i]);
        e.push(s);
      }
    }
    if (Array.isArray(p.r)) {
      for (var j = 0; j < p.r.length && r.length < CAP_RANGOS; j++) {
        var par = p.r[j];
        if (!Array.isArray(par) || par.length < 2) continue;
        var rg = normalizaRango(par[0]);
        var ix = Number(par[1]);
        if (!rg || !(ix >= 0) || ix >= e.length) continue;
        r.push([rg, ix]);
      }
    }
    return { e: e, r: r };
  }

  /** Deja sólo las claves conocidas y con valores del tipo correcto. Lo que
   *  no reconoce se tira: el formato lo escribe la pantalla, y una clave que
   *  no existe aquí es o basura o una versión futura. */
  function saneaEstilo(s) {
    var o = {}, x = s || {};
    if (typeof x !== 'object') return o;
    if (x.f !== undefined && FUENTES[Number(x.f)]) o.f = Number(x.f);
    if (x.z !== undefined && TAMANOS.indexOf(Number(x.z)) >= 0) o.z = Number(x.z);
    if (x.b) o.b = 1;
    if (x.i) o.i = 1;
    if (x.u) o.u = 1;
    if (typeof x.c === 'string' && /^[0-9A-Fa-f]{6}$/.test(x.c)) o.c = x.c.toUpperCase();
    if (typeof x.g === 'string' && /^[0-9A-Fa-f]{6}$/.test(x.g)) o.g = x.g.toUpperCase();
    if (x.a === 'l' || x.a === 'c' || x.a === 'r') o.a = x.a;
    if (x.w) o.w = 1;
    if (x.n === 'g' || x.n === 'm' || x.n === 'p' || x.n === 's') o.n = x.n;
    if (x.d !== undefined && Number(x.d) >= 0 && Number(x.d) <= 6) o.d = Number(x.d) | 0;
    return o;
  }

  /** `a1:c3` → `A1:C3` normalizado y ordenado; `a1` → `A1:A1`. */
  function normalizaRango(txt) {
    var s = String(txt || '').trim().toUpperCase();
    var p = s.split(':');
    var a = dir(p[0]), b = dir(p.length > 1 ? p[1] : p[0]);
    if (!a || !b) return null;
    return nombreDir(Math.min(a.col, b.col), Math.min(a.fila, b.fila)) + ':' +
           nombreDir(Math.max(a.col, b.col), Math.max(a.fila, b.fila));
  }

  /** ¿La celda `ref` cae dentro del rango `rg`? */
  function enRango(rg, ref) {
    var p = String(rg).split(':');
    var a = dir(p[0]), b = dir(p[1] || p[0]), d = dir(ref);
    if (!a || !b || !d) return false;
    return d.col >= Math.min(a.col, b.col) && d.col <= Math.max(a.col, b.col) &&
           d.fila >= Math.min(a.fila, b.fila) && d.fila <= Math.max(a.fila, b.fila);
  }

  /** ¿El rango `grande` contiene por completo a `chico`? Se usa para no
   *  acumular: aplicar negrita a la misma columna cinco veces deja UNA
   *  entrada, no cinco. */
  function contiene(grande, chico) {
    var g = String(grande).split(':'), c = String(chico).split(':');
    var ga = dir(g[0]), gb = dir(g[1] || g[0]), ca = dir(c[0]), cb = dir(c[1] || c[0]);
    if (!ga || !gb || !ca || !cb) return false;
    return Math.min(ga.col, gb.col) <= Math.min(ca.col, cb.col) &&
           Math.max(ga.col, gb.col) >= Math.max(ca.col, cb.col) &&
           Math.min(ga.fila, gb.fila) <= Math.min(ca.fila, cb.fila) &&
           Math.max(ga.fila, gb.fila) >= Math.max(ca.fila, cb.fila);
  }

  /** El estilo efectivo de una celda: la mezcla de todos los rangos que la
   *  contienen, en orden. El último gana, clave por clave. */
  function estiloDe(fmt, ref) {
    var out = {};
    if (!fmt || !fmt.r) return out;
    for (var i = 0; i < fmt.r.length; i++) {
      if (!enRango(fmt.r[i][0], ref)) continue;
      var s = fmt.e[fmt.r[i][1]] || {};
      for (var k = 0; k < CLAVES_ESTILO.length; k++) {
        var cl = CLAVES_ESTILO[k];
        if (s[cl] !== undefined) out[cl] = s[cl];
      }
    }
    return out;
  }

  function mismoEstilo(a, b) {
    for (var k = 0; k < CLAVES_ESTILO.length; k++) {
      var cl = CLAVES_ESTILO[k];
      if ((a || {})[cl] !== (b || {})[cl]) return false;
    }
    return true;
  }

  /** Aplica un CAMBIO de estilo a un RANGO. Devuelve
   *  `{ fmt, tope }` — `tope` es `true` cuando ya no cupo, y entonces la
   *  pantalla lo dice en vez de callarse.
   *
   *  `cambio` es un objeto de claves de estilo; un valor `null` BORRA esa
   *  clave (así funcionan «sin relleno» y «quitar negrita»). */
  function fmtAplicar(fmt, rango, cambio) {
    var f = { e: (fmt && fmt.e ? fmt.e.slice() : []), r: (fmt && fmt.r ? fmt.r.slice() : []) };
    var rg = normalizaRango(rango);
    if (!rg) return { fmt: f, tope: false };

    /* El estilo nuevo se calcula sobre la PRIMERA celda del rango: aplicar
     * «negrita» a una selección con estilos distintos la uniforma, que es lo
     * que hace Excel y lo que espera quien la usa. */
    var p = rg.split(':');
    var base = estiloDe(f, p[0]);
    var nuevo = {};
    for (var k = 0; k < CLAVES_ESTILO.length; k++) {
      var cl = CLAVES_ESTILO[k];
      if (cambio && Object.prototype.hasOwnProperty.call(cambio, cl)) {
        if (cambio[cl] !== null && cambio[cl] !== undefined) nuevo[cl] = cambio[cl];
      } else if (base[cl] !== undefined) nuevo[cl] = base[cl];
    }
    nuevo = saneaEstilo(nuevo);

    /* ⚠️ Se tiran TODAS las entradas anteriores que este rango cubre por
     * completo, sin mirar su estilo. Y es correcto, no un atajo: `nuevo` se
     * calculó sobre el estilo EFECTIVO de la primera celda, así que trae
     * todas las claves que estaban vigentes; y una entrada contenida por
     * completo no tiene ni una celda fuera del rango nuevo. O sea que ya no
     * puede aportar nada a nadie.
     *
     * Esto es lo que hace que DOS cosas funcionen a la vez:
     *   · repetir la misma acción cinco veces deja UNA entrada, no cinco;
     *   · **quitar** un formato deja CERO, en vez de dejar la entrada vieja
     *     ganando por debajo. Con la condición de «mismo estilo» que había
     *     antes, poner y quitar negrita dejaba la negrita puesta — lo cazó la
     *     prueba del modelo, no la lectura. */
    var r2 = [];
    for (var i = 0; i < f.r.length; i++) {
      if (contiene(rg, f.r[i][0])) continue;
      r2.push(f.r[i]);
    }
    f.r = r2;

    /* Un estilo vacío no se guarda: «quitar todo el formato» debe DEJAR de
     * ocupar espacio, no ocupar una entrada más. */
    var vacio = true;
    for (var k2 = 0; k2 < CLAVES_ESTILO.length; k2++)
      if (nuevo[CLAVES_ESTILO[k2]] !== undefined) { vacio = false; break; }
    if (vacio) return { fmt: compactar(f), tope: false };

    var ix = -1;
    for (var j = 0; j < f.e.length; j++) if (mismoEstilo(f.e[j], nuevo)) { ix = j; break; }
    if (ix < 0) { f.e.push(nuevo); ix = f.e.length - 1; }

    if (f.r.length >= CAP_RANGOS) return { fmt: compactar(f), tope: true };
    f.r.push([rg, ix]);
    return { fmt: compactar(f), tope: false };
  }

  /** Tira del diccionario los estilos que ya no cita ningún rango, y
   *  renumera. Sin esto, «negrita y luego sin negrita» dejaría el objeto
   *  huérfano en el documento para siempre. */
  function compactar(fmt) {
    var e = [], r = [], mapa = {};
    for (var i = 0; i < fmt.r.length; i++) {
      var vi = fmt.r[i][1];
      if (mapa[vi] === undefined) { mapa[vi] = e.length; e.push(fmt.e[vi] || {}); }
      r.push([fmt.r[i][0], mapa[vi]]);
    }
    return { e: e, r: r };
  }

  /** ¿Vale la pena guardar este `fmt`? Un formato vacío NO se escribe en el
   *  documento: así, una cotización sin formato pesa exactamente lo que
   *  pesaba antes de esta versión. */
  function fmtVacio(fmt) {
    return !fmt || !fmt.r || !fmt.r.length;
  }

  /* ── El número, como lo pinta Excel ──────────────────────────────────── */

  function separaMiles(s) {
    var p = String(s).split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return p.join('.');
  }

  /** Cómo se VE un número con un estilo dado. Sin estilo, «general»: el
   *  número tal cual, con hasta dos decimales y sin ceros de relleno — que es
   *  lo que hace Excel con el formato General. */
  function formatoNumero(v, est) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    var e = est || {};
    var n = e.n || 'g';
    var d = e.d;
    if (n === 'g') {
      var r = Math.round(v * 1e10) / 1e10;
      if (d !== undefined) return separaMilesSi(false, r.toFixed(d));
      return String(r);
    }
    if (n === 'p') {
      var dp = d === undefined ? 2 : d;
      return separaMiles((v * 100).toFixed(dp)) + '%';
    }
    var dd = d === undefined ? 2 : d;
    var txt = separaMiles(Math.abs(v).toFixed(dd));
    var signo = v < 0 ? '-' : '';
    if (n === 'm') return signo + '$' + txt;
    return signo + txt;                       // 's' = separador de miles
  }
  function separaMilesSi(si, s) { return si ? separaMiles(s) : s; }

  /** El estilo como CSS en línea, para pintar la celda. Sólo propiedades de
   *  texto y color: nada que pueda mover la rejilla de sitio. */
  function cssDe(est) {
    var e = est || {}, o = [];
    if (e.f !== undefined && FUENTES[e.f]) o.push('font-family:' + FUENTES[e.f] + ',sans-serif');
    /* ⚠️ PUNTOS, no pixeles: el menú de la cinta dice «11» y en Excel ese 11
     * son puntos. Con `px` la hoja se vería notablemente más chica aquí que
     * en el archivo del que se copió, y el número del menú mentiría. */
    if (e.z !== undefined) o.push('font-size:' + e.z + 'pt');
    if (e.b) o.push('font-weight:700');
    if (e.i) o.push('font-style:italic');
    if (e.u) o.push('text-decoration:underline');
    if (e.c) o.push('color:#' + e.c);
    if (e.g) o.push('background:#' + e.g);
    if (e.a) o.push('text-align:' + (e.a === 'l' ? 'left' : e.a === 'c' ? 'center' : 'right'));
    return o.join(';');
  }

  /* ── Migración del pad de texto (el `textarea` de antes de V1.41) ─────── */

  /** El pad viejo era un `textarea`. Su texto pasa a la columna A, una línea
   *  por fila: es lo único que no pierde nada.
   *
   *  Medido: CERO versiones con `pad.texto` en las 521 vivas, así que esto no
   *  ha corrido nunca — pero tiene que existir igual, porque el día que
   *  alguien tenga uno, ese texto es suyo y no se tira.
   *
   *  ⚠️ Una línea que empiece con `=` pasa a ser una fórmula, porque la
   *  columna A ahora SÍ se evalúa. Antes caía en la columna de rótulo, que no
   *  se evaluaba. Con cero casos en la base es una nota, no un riesgo. */
  function desdeTexto(texto) {
    var lineas = String(texto || '').split('\n');
    var g = [];
    for (var i = 0; i < lineas.length && g.length < MAX_FILAS; i++) {
      var l = lineas[i];
      if (!l.trim() && !g.length) continue;
      var fila = filaVacia();
      fila[0] = l;
      g.push(fila);
    }
    return g.length ? g : [filaVacia()];
  }

  /** La hoja de una sección, ya en la forma 2, migrando al vuelo lo que haga
   *  falta. **No escribe nada**: la migración se persiste sola la próxima vez
   *  que alguien teclee, así que abrir un machote en lectura no lo reescribe. */
  function hojaDe(sec) {
    var p = (sec && sec.pad) || {};
    if (Array.isArray(p.hoja) && p.hoja.length) {
      if (esFormaVieja(p)) return migrarForma1(p.hoja).hoja;
      return normalizar(p.hoja);
    }
    if (String(p.texto || '').trim()) return desdeTexto(p.texto);
    return [];
  }

  global.PadHoja = {
    COLS: COLS, MAX_FILAS: MAX_FILAS, ANCHO: ANCHO, FORMA: FORMA,
    COLS_V1: COLS_V1, CAP_RANGOS: CAP_RANGOS,
    FUENTES: FUENTES, TAMANOS: TAMANOS, FUENTE_BASE: FUENTE_BASE, TAMANO_BASE: TAMANO_BASE,
    CLAVES_ESTILO: CLAVES_ESTILO,
    filaVacia: filaVacia, normalizar: normalizar, paraPintar: paraPintar,
    filaEnBlanco: filaEnBlanco, tieneAlgo: tieneAlgo, filasConAlgo: filasConAlgo,
    dir: dir, nombreDir: nombreDir, crudoDe: crudoDe, nombreFuncion: nombreFuncion,
    evaluar: evaluar, desdeTexto: desdeTexto, hojaDe: hojaDe,
    esFormaVieja: esFormaVieja, migrarForma1: migrarForma1, correrRefs: correrRefs,
    fmtLeer: fmtLeer, fmtAplicar: fmtAplicar, fmtVacio: fmtVacio,
    estiloDe: estiloDe, saneaEstilo: saneaEstilo, normalizaRango: normalizaRango,
    enRango: enRango, contiene: contiene, compactar: compactar, mismoEstilo: mismoEstilo,
    formatoNumero: formatoNumero, cssDe: cssDe
  };
})(typeof window !== 'undefined' ? window : globalThis);
