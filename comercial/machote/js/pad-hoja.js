/* ═══ Machote · LA HOJA DEL PAD DE TRABAJO ═══════════════════════════════════
 *
 * El evaluador de la hoja de cálculo que vive dentro de cada sección. Sin
 * dependencias y sin `eval`.
 *
 * ── POR QUÉ NO HAY `eval` NI `new Function`, y no es una preferencia ────────
 * Lo que se escribe en el pad lo teclea una persona, se guarda en el servidor
 * y lo abre OTRA —quien recibe un machote prestado o cedido—. Evaluar ese
 * texto es ejecutar código ajeno en una página que tiene la sesión abierta.
 * O sea que el atajo de dos líneas (`new Function('return '+formula)()`) no
 * es un atajo: es una puerta. Por eso hay un tokenizador y un parser de
 * verdad, que son ~150 líneas y no entienden nada que no sea aritmética.
 *
 * ── LO QUE ENTIENDE, Y NADA MÁS ────────────────────────────────────────────
 *   números          12, 1200.5, .5
 *   operadores       + - * / y paréntesis, con la precedencia de siempre
 *   referencias      A1, B3, C20  (columna A|B|C, fila 1..N)
 *   una función      SUMA(A1:A5) — también SUMA(A1, B2) y SUMA(A1:A5, C1)
 *
 * NO entiende: otras funciones, texto en las fórmulas, referencias a otra
 * sección o a otro machote, rangos de varias columnas mezclados con texto.
 * Cada cosa que entendiera de más es un caso que mantener y una expectativa
 * que cumplir después.
 *
 * ── LA COLUMNA DE RÓTULO NO SE REFERENCIA ──────────────────────────────────
 * La rejilla tiene cuatro columnas: la primera es el CONCEPTO —texto, lo que
 * explica la fila— y las tres siguientes son A, B y C. Sólo esas tres se
 * pueden citar en una fórmula. Referenciar un rótulo daría `null` y el error
 * se leería como un problema de la cuenta, no como lo que es.
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

  /* V1.42 · 10 × 10. Antes eran 3 columnas y 20 filas; Esteban lo movió a una
   * rejilla cuadrada, que es la forma en que la gente piensa una hoja. */
  var COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  var MAX_FILAS = 10;
  var ANCHO = COLS.length + 1;         // + la columna de rótulo

  /* ── La rejilla ──────────────────────────────────────────────────────── */

  /** Una fila en blanco: rótulo + tres celdas. */
  function filaVacia() { return ['', '', '', '']; }

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
    for (var i = 0; i < ANCHO; i++) if (String(f[i] || '').trim()) return false;
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
    var m = /^([A-Ja-j])([0-9]{1,2})$/.exec(String(ref || '').trim());
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
    return String(g[d.fila][d.col + 1] || '');   // +1: la 0 es el rótulo
  }

  /* ── El tokenizador ──────────────────────────────────────────────────── */

  function tokenizar(src) {
    var t = [], i = 0, s = String(src);
    while (i < s.length) {
      var c = s[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if ('+-*/(),:'.indexOf(c) >= 0) { t.push({ t: c }); i++; continue; }
      if (/[0-9.]/.test(c)) {
        var j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        var txt = s.slice(i, j);
        if ((txt.match(/\./g) || []).length > 1) throw err('SINTAXIS', txt);
        t.push({ t: 'num', v: parseFloat(txt) });
        i = j; continue;
      }
      /* ⚠️ Las vocales con acento y la Ñ son LETRAS aquí. Sin esto,
       * `MULTIPLICACIÓN` se parte en `MULTIPLICACI` + un carácter que el
       * tokenizador no reconoce, y la fórmula falla con un error de sintaxis
       * que no dice nada — que es justo lo que pasaba en la primera versión
       * de esta tanda: `nombreFuncion` quitaba el acento correctamente pero
       * nunca llegaba a verlo. Se descubrió probando las cuatro, no leyendo. */
      if (/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(c)) {
        var k = i;
        while (k < s.length && /[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]/.test(s[k])) k++;
        t.push({ t: 'id', v: s.slice(i, k) });
        i = k; continue;
      }
      throw err('SINTAXIS', c);
    }
    return t;
  }

  /** ── V1.42 · las cuatro aritméticas en PALABRA ────────────────────────
   *  `SUMA`, `RESTA`, `MULTIPLICACION`, `DIVISION`, con y sin acento y en
   *  cualquier caja. Los símbolos `+ − * /` siguen funcionando igual, así que
   *  `SUMA(A1:A4)` y `A1+A2+A3+A4` son dos formas de escribir lo mismo y las
   *  dos se pueden teclear — que es el punto: nadie debería tener que
   *  acordarse de cuál de las dos entiende la hoja.
   *
   *  Los acentos se quitan con `normalize('NFD')` y no con una lista de
   *  reemplazos: una lista se queda corta el día que alguien teclee la Ó de
   *  otro teclado. Devuelve el nombre canónico, o `null` si no es función. */
  var FUNCIONES = { SUMA: 1, RESTA: 1, MULTIPLICACION: 1, DIVISION: 1 };
  function nombreFuncion(txt) {
    var n = String(txt || '');
    try { n = n.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
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
   *   prim   := num | ref | SUMA '(' args ')' | '(' expr ')'
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
          /* Dividir entre cero no lanza: devuelve el error de la celda, como
           * cualquier hoja. Lanzar aquí tumbaría toda la evaluación por una
           * celda a medio escribir. */
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
             * lo único que el rango tiene y la expresión no. Aceptar sólo
             * rangos dejaba fuera `=SUMA(C1:C2, 500)`, que es lo primero que
             * alguien escribe viniendo de Excel. */
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
   *  Devuelve `{ valores, errores, crudo }` por dirección. `valores[x]` es un
   *  número o `null`; `errores[x]` es `'CICLO' | 'SINTAXIS' | 'REF' | 'DIV0'`.
   *
   *  No hay recálculo incremental a propósito: son 60 celdas como mucho, y un
   *  motor incremental sería más código del que evita.
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
       * que cuelga de un ciclo enseñaba `0` con toda confianza: `A1 = =B1`,
       * `B1 = =C1`, `C1 = =A1` marcaba el ciclo SÓLO en C1 y pintaba A1 y B1
       * en cero. Un cero que en realidad es «esto no se puede calcular» es
       * peor que un error visible — se suma, se pasa a un renglón, y nadie se
       * entera. Se descubrió ejercitando el evaluador, no leyéndolo.
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
          /* Un número escrito como número. Se aceptan comas de millares y el
           * signo de pesos porque la gente los teclea: `$1,200` es lo que
           * copia de una cotización, y rechazarlo sería pelear con el uso
           * real en vez de servirlo. */
          var limpio = crudo.replace(/[$\s,]/g, '');
          v = /^-?(\d+\.?\d*|\.\d+)$/.test(limpio) ? parseFloat(limpio) : null;
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
        if (estado[ref] !== 2) { try { valor(ref); } catch (e) { errores[ref] = e.clase || 'CICLO'; valores[ref] = null; estado[ref] = 2; } }
      }

    return { valores: valores, errores: errores, filas: g.length };
  }

  /* ── Migración del pad de texto ──────────────────────────────────────── */

  /** El pad viejo era un `textarea`. Su texto pasa a la columna de RÓTULO,
   *  una línea por fila: es lo único que no pierde nada, porque ahí cabe
   *  cualquier cosa que alguien hubiera escrito.
   *
   *  Hoy hay CERO pads escritos en las 45 secciones vivas (medido), así que
   *  esto no va a correr nunca en producción — pero tiene que existir igual,
   *  porque el día que alguien escriba uno antes de que esto se despliegue,
   *  ese texto es suyo y no se tira. */
  function desdeTexto(texto) {
    var lineas = String(texto || '').split('\n');
    var g = [];
    for (var i = 0; i < lineas.length && g.length < MAX_FILAS; i++) {
      var l = lineas[i];
      if (!l.trim() && !g.length) continue;
      g.push([l, '', '', '']);
    }
    return g.length ? g : [filaVacia()];
  }

  /** La hoja de una sección, migrando al vuelo si sólo trae el texto viejo. */
  function hojaDe(sec) {
    var p = (sec && sec.pad) || {};
    if (Array.isArray(p.hoja) && p.hoja.length) return normalizar(p.hoja);
    if (String(p.texto || '').trim()) return desdeTexto(p.texto);
    return [];
  }

  global.PadHoja = {
    COLS: COLS, MAX_FILAS: MAX_FILAS, ANCHO: ANCHO,
    filaVacia: filaVacia, normalizar: normalizar, paraPintar: paraPintar,
    filaEnBlanco: filaEnBlanco, tieneAlgo: tieneAlgo, filasConAlgo: filasConAlgo,
    dir: dir, nombreDir: nombreDir, crudoDe: crudoDe, nombreFuncion: nombreFuncion,
    evaluar: evaluar, desdeTexto: desdeTexto, hojaDe: hojaDe
  };
})(typeof window !== 'undefined' ? window : globalThis);
