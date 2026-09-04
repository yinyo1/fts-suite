/* ═══ Machote · pegado de tablas ═══
 *
 * Convierte un bloque de texto pegado —de Claude, de un correo, de Excel, de
 * una cotización de proveedor— en renglones de materiales.
 *
 * POR QUÉ EXISTE: hoy la lista de materiales se teclea renglón por renglón
 * aunque el proveedor ya la mandó escrita. Teclear otra vez lo que ya está
 * escrito no es sólo lento: es donde se cuelan los errores de dedo en el
 * precio, que es el dato que nadie vuelve a verificar.
 *
 * LO QUE **NO** HACE, y es deliberado: no aplica nada solo. Interpreta, enseña
 * lo que entendió renglón por renglón, y sólo escribe cuando alguien lo aprueba
 * mirándolo. Un parser que acierta el 90% y aplica solo mete un 10% de basura
 * que nadie ve — y aquí el 10% es un precio mal leído.
 */
(function (G) {
  'use strict';

  /* Separadores, en orden de confianza. El tabulador es el que produce Excel y
   * el que casi nunca aparece dentro de una descripción; el `|` es el de las
   * tablas de Markdown que escribe Claude; el `;` y la coma son los del CSV
   * europeo y el americano, y la coma es la más peligrosa porque también vive
   * dentro de los números ("1,250.00") y de las descripciones. */
  const SEPARADORES = ['\t', '|', ';', ','];

  /** Un número escrito por un humano o por una hoja de cálculo.
   *  Acepta `$1,250.50`, `1.250,50`, `1 250,50`, `(300)` como negativo, y
   *  devuelve `null` si no es un número. */
  function aNumero(txt) {
    if (txt === null || txt === undefined) return null;
    let t = String(txt).trim();
    if (!t) return null;
    const negParen = /^\(.*\)$/.test(t);
    t = t.replace(/^\(|\)$/g, '');
    // Fuera moneda, espacios finos y cualquier letra pegada ("12 pzas", "MXN").
    t = t.replace(/[$€£]|MXN|USD|mxn|usd/g, '').replace(/\s/g, '').trim();
    if (!t) return null;
    const tieneComa = t.indexOf(',') >= 0, tienePunto = t.indexOf('.') >= 0;
    if (tieneComa && tienePunto) {
      // El ÚLTIMO de los dos es el decimal: "1,250.50" y "1.250,50".
      t = (t.lastIndexOf(',') > t.lastIndexOf('.'))
        ? t.replace(/\./g, '').replace(',', '.')
        : t.replace(/,/g, '');
    } else if (tieneComa) {
      // Sola, la coma es decimal si deja 1-2 cifras ("12,5"); si deja tres es
      // separador de miles ("1,250"). Con más de una coma, siempre miles.
      const partes = t.split(',');
      t = (partes.length === 2 && partes[1].length <= 2)
        ? partes.join('.') : partes.join('');
    }
    if (!/^-?\d*\.?\d+$/.test(t)) return null;
    const n = parseFloat(t);
    if (!isFinite(n)) return null;
    return negParen ? -n : n;
  }

  const esNumero = (t) => aNumero(t) !== null;

  /** Parte el texto en renglones y columnas.
   *  El separador se elige por CONSISTENCIA, no por frecuencia: gana el que
   *  produce el mismo número de columnas en la mayoría de los renglones. Un
   *  separador que da 3 columnas en una fila y 7 en la siguiente no es el
   *  separador, es un carácter que salía en el texto. */
  function partir(texto) {
    const crudas = String(texto || '').split(/\r?\n/)
      .map(l => l.trim()).filter(l => l.length > 0);
    if (!crudas.length) return { sep: null, filas: [] };

    // Fuera los adornos de las tablas de Markdown: |---|---|
    const lineas = crudas.filter(l => !/^[\s|:+-]+$/.test(l));
    if (!lineas.length) return { sep: null, filas: [] };

    let mejor = null;
    SEPARADORES.forEach(sep => {
      const cols = lineas.map(l => trocear(l, sep).length);
      const max = Math.max.apply(null, cols);
      if (max < 2) return;
      // Cuántos renglones coinciden con el ancho más común.
      const conteo = {};
      cols.forEach(n => { conteo[n] = (conteo[n] || 0) + 1; });
      const ancho = Object.keys(conteo).map(Number)
        .filter(n => n >= 2)
        .sort((a, b) => (conteo[b] - conteo[a]) || (b - a))[0];
      if (!ancho) return;
      const puntaje = conteo[ancho] + ancho * 0.1;   // desempata a más columnas
      if (!mejor || puntaje > mejor.puntaje) mejor = { sep, ancho, puntaje };
    });

    // Sin separador claro: dos o más espacios, que es como queda una tabla
    // copiada de un PDF o de una terminal.
    if (!mejor) {
      const filas = lineas.map(l => l.split(/\s{2,}/).map(x => x.trim()));
      const anchos = filas.map(f => f.length);
      if (Math.max.apply(null, anchos) < 2) return { sep: null, filas: [] };
      return { sep: 'espacios', filas: filas };
    }
    return { sep: mejor.sep, filas: lineas.map(l => trocear(l, mejor.sep)) };
  }

  function trocear(linea, sep) {
    let l = linea;
    if (sep === '|') l = l.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
    return l.split(sep).map(x => x.trim());
  }

  /* Cómo se llama cada columna cuando la tabla trae encabezado. Se compara sin
   * acentos ni mayúsculas: el acervo escribe "DESCRIPCIÓN", "Descripcion" y
   * "descripción" en el mismo archivo. */
  const ALIAS = {
    qty:         ['qty', 'cant', 'cantidad', 'cants', 'pzas', 'piezas', 'q'],
    unidad:      ['unidad', 'um', 'u m', 'medida', 'unid'],
    tipo:        ['tipo', 'clase'],
    descripcion: ['descripcion', 'description', 'concepto', 'partida', 'articulo',
                  'producto', 'material', 'detalle', 'item'],
    modelo:      ['modelo', 'model', 'no parte', 'num parte', 'numero de parte', 'sku', 'codigo', 'clave'],
    marca:       ['marca', 'brand', 'fabricante'],
    pu:          ['precio unitario', 'p unitario', 'precio', 'unitario', 'costo unitario',
                  'costo', 'pu', 'importe unitario', 'unit price', 'price'],
    total:       ['precio total', 'importe', 'total', 'subtotal', 'monto', 'amount'],
    moneda:      ['moneda', 'divisa', 'currency'],
    link:        ['link', 'liga', 'url', 'enlace', 'fuente'],
    comentario:  ['comentario', 'nota', 'notas', 'observaciones', 'obs']
  };

  const norm = (t) => String(t || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  /** ¿La primera fila es un encabezado? Lo es si NINGUNA de sus celdas es un
   *  número y al menos una casa con un alias conocido. Una fila de puros textos
   *  que no casa con nada puede ser perfectamente el primer material. */
  function mapearEncabezado(fila) {
    if (!fila || fila.length < 2) return null;
    if (fila.some(esNumero)) return null;
    const mapa = {}; let casaron = 0;
    fila.forEach((celda, i) => {
      const n = norm(celda);
      if (!n) return;
      for (const campo in ALIAS) {
        if (ALIAS[campo].indexOf(n) >= 0 ||
            ALIAS[campo].some(a => n === a || n.indexOf(a) === 0)) {
          if (mapa[campo] === undefined) { mapa[campo] = i; casaron++; }
          return;
        }
      }
    });
    return casaron >= 2 ? mapa : null;
  }

  /** Sin encabezado, se adivina por la FORMA de los datos, no por su posición:
   *  la columna con más texto largo es la descripción; de las numéricas, la de
   *  valores más chicos y enteros es la cantidad y la de valores más grandes es
   *  el precio. Es una heurística y por eso el resultado se revisa antes de
   *  aplicarse. */
  function adivinar(filas) {
    const ncol = Math.max.apply(null, filas.map(f => f.length));
    const perfil = [];
    for (let i = 0; i < ncol; i++) {
      const vals = filas.map(f => f[i]).filter(x => x !== undefined && x !== '');
      if (!vals.length) { perfil.push(null); continue; }
      const nums = vals.map(aNumero).filter(x => x !== null);
      perfil.push({
        i: i,
        pctNum: nums.length / vals.length,
        largo: vals.reduce((a, v) => a + String(v).length, 0) / vals.length,
        media: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0,
        enteros: nums.length ? nums.every(n => n === Math.round(n)) : false
      });
    }
    const vivos = perfil.filter(Boolean);
    const mapa = {};

    const texto = vivos.filter(c => c.pctNum < 0.4).sort((a, b) => b.largo - a.largo);
    if (texto.length) mapa.descripcion = texto[0].i;
    if (texto.length > 1) {
      // La segunda columna de texto más larga suele ser marca o modelo. No se
      // adivina cuál: se deja fuera antes que ponerla mal.
    }

    const numericas = vivos.filter(c => c.pctNum >= 0.6).sort((a, b) => a.media - b.media);
    if (numericas.length === 1) {
      // Una sola columna de números: es el precio. Una lista con cantidades
      // pero sin precios no es lo que la gente pega.
      mapa.pu = numericas[0].i;
    } else if (numericas.length >= 2) {
      /* Primero por FORMA, no por magnitud: las cantidades se escriben enteras
       * y los precios con centavos. Ordenar por promedio falla en cuanto la
       * lista trae muchas piezas baratas — "250 cables a 18.50" pone la
       * cantidad del lado del precio. Cuando las dos columnas son enteras (o
       * las dos decimales) no discrimina, y ahí sí manda la magnitud. */
      const ent = numericas.filter(c => c.enteros), dec = numericas.filter(c => !c.enteros);
      if (ent.length && dec.length) {
        mapa.qty = ent.sort((a, b) => a.media - b.media)[0].i;
        mapa.pu  = dec.sort((a, b) => b.media - a.media)[0].i;
      } else {
        mapa.qty = numericas[0].i;                     // la de valores más chicos
        mapa.pu  = numericas[numericas.length - 1].i;  // la de valores más grandes
      }
      if (numericas.length >= 3) {
        // Con tres, la de en medio suele ser el precio unitario y la última el
        // total (total = qty × pu). Se comprueba en vez de suponerlo.
        const a = numericas[0], b = numericas[1], cc = numericas[2];
        const casa = filas.some(f => {
          const q = aNumero(f[a.i]), u = aNumero(f[b.i]), t = aNumero(f[cc.i]);
          return q !== null && u !== null && t !== null && q * u > 0 &&
                 Math.abs(q * u - t) / Math.max(Math.abs(t), 1) < 0.02;
        });
        if (casa) { mapa.qty = a.i; mapa.pu = b.i; mapa.total = cc.i; }
      }
    }
    return mapa;
  }

  /** Interpreta un bloque pegado. Devuelve SIEMPRE la explicación de cómo lo
   *  entendió, para que se pueda revisar antes de aplicar. */
  function interpretar(texto, opciones) {
    opciones = opciones || {};
    const { sep, filas } = partir(texto);
    if (!filas.length) {
      return { ok: false, motivo: 'No encontré renglones con columnas en lo que pegaste.',
               sep: null, encabezado: false, mapa: {}, renglones: [] };
    }
    let mapa = mapearEncabezado(filas[0]);
    const conEncabezado = !!mapa;
    const cuerpo = conEncabezado ? filas.slice(1) : filas;
    if (!cuerpo.length) {
      return { ok: false, motivo: 'Sólo encontré el encabezado; no venían renglones abajo.',
               sep, encabezado: true, mapa: mapa || {}, renglones: [] };
    }
    if (!mapa) mapa = adivinar(cuerpo);
    if (mapa.descripcion === undefined && mapa.pu === undefined) {
      return { ok: false, motivo: 'No pude distinguir cuál columna es la descripción ni cuál el precio.',
               sep, encabezado: conEncabezado, mapa: mapa, renglones: [] };
    }

    const dame = (f, k) => (mapa[k] === undefined ? '' : (f[mapa[k]] === undefined ? '' : f[mapa[k]]));
    const monedaDoc = opciones.moneda || 'MXN';

    const renglones = cuerpo.map(f => {
      const desc = String(dame(f, 'descripcion') || '').trim();
      let qty = aNumero(dame(f, 'qty'));
      let pu  = aNumero(dame(f, 'pu'));
      const total = aNumero(dame(f, 'total'));
      // Si vino el total y no el unitario, se deriva. Es el caso de las tablas
      // que sólo traen importe.
      if (pu === null && total !== null && qty) pu = total / qty;
      if (qty === null && pu !== null && total !== null && pu) qty = total / pu;

      const tipoCrudo = norm(dame(f, 'tipo'));
      const tipo = /servicio|mano de obra|mo|labor/.test(tipoCrudo) ? 'Servicios'
                 : /material|equipo|suministro|insumo/.test(tipoCrudo) ? 'Materiales'
                 : '';
      const monCruda = String(dame(f, 'moneda') || '').toUpperCase();
      const moneda = /USD|DLL|DOLAR/.test(monCruda) ? 'USD'
                   : /MXN|PESO/.test(monCruda) ? 'MXN'
                   : (/\$?\s*USD/.test(String(dame(f, 'pu'))) ? 'USD' : monedaDoc);

      const avisos = [];
      if (!desc) avisos.push('sin descripción');
      if (pu === null) avisos.push('sin precio');
      if (qty !== null && qty < 0) avisos.push('cantidad negativa');
      if (pu !== null && pu < 0) avisos.push('precio negativo');

      return {
        qty: qty === null ? '' : Math.abs(qty),
        unidad: String(dame(f, 'unidad') || '').trim(),
        tipo: tipo,
        descripcion: desc,
        modelo: String(dame(f, 'modelo') || '').trim(),
        marca: String(dame(f, 'marca') || '').trim(),
        pu: pu === null ? null : Math.abs(pu),
        moneda: moneda,
        margen: null,
        link: String(dame(f, 'link') || '').trim(),
        comentario: String(dame(f, 'comentario') || '').trim(),
        _avisos: avisos,
        _crudo: f
      };
    }).filter(r => r.descripcion || r.pu !== null || r.qty !== '');

    return {
      ok: renglones.length > 0,
      motivo: renglones.length ? '' : 'Los renglones venían vacíos.',
      sep: sep === '\t' ? 'tabulador' : sep === 'espacios' ? 'espacios' : sep,
      encabezado: conEncabezado,
      mapa: mapa,
      renglones: renglones
    };
  }

  G.MachotePegar = { interpretar, aNumero, partir, ALIAS };
})(window);
