/* ═══ Machote · lo que la CONFIRMACIÓN necesita, como campos ══════════════════
 *
 * Los candados 5, 7, 10, 11, 12 y 13 de la especificación
 * (`docs/trazabilidad/ESPECIFICACION-CONFIRMACION.md` §3). Los otros ya viven
 * en su sitio: el cliente en `app.js`, el viaje en la V1.26, la oportunidad en
 * `oportunidades.js`, el beneficiario en `beneficiarios.js`, y los cinco
 * compromisos —entre ellos los días de pago— en `compromisos.js`.
 *
 * ── POR QUÉ UN ARCHIVO Y NO CINCO REGLAS SUELTAS ────────────────────────────
 * Porque las seis preguntas comparten una respuesta: **qué le falta a esta
 * cotización para poder volverse una orden**. Si cada regla la contesta por su
 * cuenta, mañana hay seis definiciones de «está completa» y la pantalla, el
 * revisador y el payload dicen cosas distintas. Aquí se contesta una vez.
 *
 * ── LO QUE NO ESTÁ CONSTRUIDO, Y SE DICE ────────────────────────────────────
 * La MEMORIA POR CLIENTE de la convención de IVA (§3 de `IVA-EN-LA-PO.md`)
 * necesita una tabla y un endpoint que no existen todavía. `cuadrePO` la recibe
 * como ARGUMENTO, con la forma ya fijada, y funciona igual sin ella —sólo
 * pierde el copiloto—. Se hizo así a propósito: el día que exista, se enchufa
 * sin tocar la heurística.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (G) {
  'use strict';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  /* ⚠️ `Number(null)` es **0**, y `Number('')` también. Así que un
   * `return isFinite(Number(x)) ? Number(x) : null` convierte un campo VACÍO en
   * un cero — y entonces «el cliente no escribió el total de su PO» se vuelve
   * «su PO dice cero pesos», que es una afirmación, no una ausencia.
   *
   * Lo cazó una prueba de la V1.45: `SIN_IMPORTE` devolvía `NO_CUADRA_NINGUNO`,
   * porque el importe vacío llegaba como 0 y 0 no cuadra con 100,000. El daño
   * no era ese mensaje: era que en una cotización de cero, un campo en blanco
   * habría CUADRADO. Es la misma familia de §20 #11 y #18 — un vacío leído como
   * una respuesta— en la superficie más pequeña posible, una conversión. */
  function num(x) {
    if (x === null || x === undefined || x === '') return null;
    if (typeof x === 'string' && !x.trim()) return null;
    var n = Number(x);
    return isFinite(n) ? n : null;
  }
  function dinero(x, moneda) {
    var n = Number(x) || 0;
    return (moneda === 'USD' ? 'USD ' : '$') +
      n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ── EL UMBRAL DEL ANTICIPO ────────────────────────────────────────────────
   * Pesos: **200,000**, que es lo que Esteban fijó.
   *
   * Dólares: **10,000**, y es DECISIÓN PROPIA de la sesión del 27/28-sep-2026.
   * El razonamiento importa más que el número, así que va escrito:
   *
   * 1. **Un umbral es una política, no una conversión.** Si fuera
   *    `200,000 / tipo_de_cambio`, la MISMA orden estaría arriba del umbral un
   *    día y abajo el siguiente, sin que nadie cambiara nada. Es la peor
   *    propiedad posible en una regla que la gente tiene que poder anticipar.
   * 2. **Por eso es un número redondo y fijo.** Se recuerda, se dice en voz
   *    alta, y no se recalcula.
   * 3. **Y se eligió del lado ESTRICTO.** A ~17.35 MXN/USD —el tipo que usa el
   *    módulo de Finanzas—, 10,000 USD son ~173,500 MXN: un poco más exigente
   *    que el umbral en pesos. Es a propósito, por el modo de falla: un umbral
   *    demasiado bajo produce «pedimos anticipo cuando no hacía falta», que es
   *    una conversación; uno demasiado alto produce «arrancamos una obra grande
   *    sin un peso adelantado», que es una pérdida. Se elige el discriminador
   *    cuyo fallo es soportable, no el más exacto (CLAUDE.md §9).
   *
   * Si Esteban quiere otro número, se cambia aquí y en ningún otro lado. */
  var UMBRAL = { MXN: 200000, USD: 10000 };

  function umbralDe(moneda) {
    return UMBRAL[moneda] !== undefined ? UMBRAL[moneda] : UMBRAL.MXN;
  }

  /* ── LAS LEYENDAS DE «NO LLEVA IVA» ────────────────────────────────────────
   * ⚠️ El texto exacto de una leyenda fiscal NO lo decide este archivo: lo
   * decide Contabilidad. Lo que hace la lista es evitar que cada quien la
   * escriba distinta —que es cómo una misma operación acaba con tres redacciones
   * y ninguna revisada—. Se puede escribir una a mano, y entonces queda marcada
   * como propia para que alguien la mire.
   *
   * La cita legal va entre paréntesis y **se confirma con Gerardo antes de usar
   * estas leyendas con un cliente**. Está apuntado en la entrega. */
  var LEYENDAS = [
    { id: 'exportacion', t: 'Operación de exportación — tasa 0%' },
    { id: 'tasa_cero',   t: 'Tasa 0%' },
    { id: 'exento',      t: 'Operación exenta de IVA' },
    { id: 'extranjero',  t: 'Cliente en el extranjero — fuera del objeto del IVA mexicano' },
    { id: 'otra',        t: 'Otra (la escribo yo)' }
  ];

  var TASA_IVA = 0.16;

  /* ── La forma, siempre completa ────────────────────────────────────────────
   * Un machote guardado antes de la V1.45 no la trae: sale el vacío, no
   * `undefined`. Es la misma disciplina de `compromisos.de`, y por la misma
   * razón: la pantalla no tiene que saber de qué versión viene el documento. */
  function vacio() {
    return {
      contacto: { partner_id: null, nombre: '', tel: '', correo: '' },
      iva: { decision: null, leyenda_id: null, leyenda_texto: '' },
      po: {
        numero: '', importe: null,
        archivo: null,   /* { nombre, tipo, bytes, paginas, con_texto, subido_at } */
        veredicto: null, /* SIN_IVA · CON_IVA · NO_APLICA · NO_DETERMINADO */
        varias: null     /* { motivo, at, por } — la salida del candado 12 */
      },
      anticipo: { aplica: null, pct: null },
      at: null, por: null
    };
  }

  function de(m) {
    var c = (m && m.confirmacion) || null;
    var v = vacio();
    if (!c) return v;
    if (c.contacto) {
      v.contacto.partner_id = num(c.contacto.partner_id);
      v.contacto.nombre = c.contacto.nombre || '';
      v.contacto.tel = c.contacto.tel || '';
      v.contacto.correo = c.contacto.correo || '';
    }
    if (c.iva) {
      v.iva.decision = c.iva.decision || null;
      v.iva.leyenda_id = c.iva.leyenda_id || null;
      v.iva.leyenda_texto = c.iva.leyenda_texto || '';
    }
    if (c.po) {
      v.po.numero = c.po.numero || '';
      v.po.importe = num(c.po.importe);
      v.po.archivo = c.po.archivo || null;
      v.po.veredicto = c.po.veredicto || null;
      v.po.varias = c.po.varias || null;
    }
    if (c.anticipo) {
      v.anticipo.aplica = c.anticipo.aplica === true ? true
                        : c.anticipo.aplica === false ? false : null;
      v.anticipo.pct = num(c.anticipo.pct);
    }
    v.at = c.at || null; v.por = c.por || null;
    return v;
  }

  /* ── El subtotal, de UNA sola fuente ──────────────────────────────────────
   * Del motor (`Calc`), nunca recalculado aquí. Dos sumas del mismo número es
   * una carrera silenciosa, y la que pierde no deja rastro (§20 #4). Si el
   * motor no está cargado, devuelve null y todo lo que dependa del subtotal se
   * abstiene en vez de adivinar.
   *
   * El campo es **`precio`**, y eso se LEYÓ del motor, no se supuso: `calc.js`
   * devuelve `precio: elegido.precio`, el precio del escenario elegido. No
   * existe ningún `precioFinal` ni `total` — un fallback a esos nombres habría
   * sido código muerto insinuando campos que no hay.
   *
   * Y es el SUBTOTAL, no el total: el motor del machote no suma impuesto en
   * ningún lado (medido: cero cálculos de IVA en `calc.js`). El IVA aparece por
   * primera vez aquí, en la decisión de esta pantalla. */
  function subtotalDe(m, calc) {
    var c = calc || (G.Calc && G.Calc.calcular ? G.Calc.calcular(m) : null);
    if (!c) return null;
    return num(c.precio);
  }

  /* ── ¿Esta orden lleva impuesto? ───────────────────────────────────────────
   * Tres respuestas y no dos, porque «todavía no se decidió» NO es «no lleva».
   * Juntarlas haría que una cotización sin decidir se comportara como una
   * exportación, que es el peor valor por omisión que se puede elegir. */
  function llevaIva(m) {
    var c = de(m);
    if (c.iva.decision === 'lleva') return true;
    if (c.iva.decision === 'no_lleva') return false;
    return null;
  }

  function tasaDe(m) {
    var l = llevaIva(m);
    return l === true ? TASA_IVA : l === false ? 0 : null;
  }

  /* ══ EL CUADRE DE LA PO ════════════════════════════════════════════════════
   *
   * La heurística de `docs/trazabilidad/IVA-EN-LA-PO.md` §2, tal cual:
   *
   *     |capturado − subtotal| ≤ tol  →  SIN_IVA
   *     |capturado − total|    ≤ tol  →  CON_IVA
   *     subtotal == total             →  NO_APLICA
   *     ninguna                       →  NO_DETERMINADO
   *
   * 📌 **Esto sí es «el código lo detecta, no lo pregunta».** No se le pregunta
   * a la persona si su PO trae IVA: se le pide UN número —el total que dice la
   * PO, que está leyendo de todos modos— y el código DEDUCE la convención. La
   * diferencia importa: una pregunta de sí/no se contesta en automático y mal;
   * un número se copia.
   *
   * ⚠️ **El orden de las dos primeras comparaciones importa cuando la tasa es
   * cero**, y ahí es donde `NO_APLICA` gana: con `subtotal == total` las dos
   * darían el mismo veredicto, y reportar `CON_IVA` de una orden sin impuesto
   * sería una afirmación falsa sobre el cliente que además ensuciaría su
   * memoria. `NO_APLICA` se comprueba ANTES.
   *
   * `memoria` es opcional y es un COPILOTO, nunca una fuente: el veredicto sale
   * siempre de la comparación de ESTA orden (§3.2). Forma esperada:
   *   { convencion: 'CON_IVA'|'SIN_IVA'|'AMBAS', veces_con: n, veces_sin: n }
   */
  function cuadrePO(m, calc, memoria) {
    var c = de(m);
    var sub = subtotalDe(m, calc);
    var tasa = tasaDe(m);
    var cap = c.po.importe;
    var moneda = (m && m.moneda) || 'MXN';
    var tol = 0.01;

    if (sub === null) {
      return { veredicto: null, porque: 'SIN_SUBTOTAL',
               mensaje: 'Todavía no hay un precio calculado con el que comparar.' };
    }
    if (tasa === null) {
      return { veredicto: null, porque: 'SIN_DECISION_IVA',
               mensaje: 'Antes de comparar hay que decir si esta orden lleva IVA: sin eso ' +
                        'no se sabe contra qué número comparar.' };
    }
    var total = sub * (1 + tasa);
    var base = { subtotal: sub, total: total, tasa: tasa, capturado: cap, moneda: moneda };

    if (cap === null) {
      return Object.assign(base, { veredicto: null, porque: 'SIN_IMPORTE',
        mensaje: 'Escribe el total que dice la orden de compra del cliente. Con ese número el ' +
                 'sistema deduce solo si su PO viene con IVA o sin IVA.' });
    }
    /* NO_APLICA primero: ver el aviso de arriba. */
    if (Math.abs(total - sub) <= tol) {
      return Object.assign(base, {
        veredicto: Math.abs(cap - sub) <= tol ? 'NO_APLICA' : 'NO_DETERMINADO',
        porque: 'SIN_IMPUESTO',
        mensaje: Math.abs(cap - sub) <= tol
          ? 'Cuadra. Esta orden no lleva impuesto, así que no hay convención de IVA que deducir.'
          : 'Esta orden no lleva impuesto, así que su PO debería decir lo mismo que la cotización, y no.'
      });
    }
    if (Math.abs(cap - sub) <= tol) {
      return Object.assign(base, { veredicto: 'SIN_IVA', porque: 'CUADRA_SUBTOTAL',
        mensaje: 'Cuadra contra el subtotal: este cliente emite su PO sin el IVA dentro.',
        aviso: avisoMemoria(memoria, 'SIN_IVA') });
    }
    if (Math.abs(cap - total) <= tol) {
      return Object.assign(base, { veredicto: 'CON_IVA', porque: 'CUADRA_TOTAL',
        mensaje: 'Cuadra contra el total: este cliente emite su PO con el IVA dentro.',
        aviso: avisoMemoria(memoria, 'CON_IVA') });
    }
    /* NO_DETERMINADO, y casi nunca es un problema de IVA: es que la PO y la
     * cotización no dicen lo mismo, que es justo lo que el candado atrapa. Se
     * devuelven los TRES números y la diferencia contra el más cercano, porque
     * es lo único que permite decidir. */
    var dSub = Math.abs(cap - sub), dTot = Math.abs(cap - total);
    return Object.assign(base, {
      veredicto: 'NO_DETERMINADO', porque: 'NO_CUADRA_NINGUNO',
      diferencia: Math.min(dSub, dTot),
      contra: dSub <= dTot ? 'subtotal' : 'total',
      mensaje: 'La orden de compra no cuadra con la cotización. No coincide ni con el ' +
               'subtotal ni con el total, así que no es una cuestión de IVA: los dos ' +
               'documentos dicen cosas distintas. Puede ser que el cliente haya puesto otro ' +
               'monto, que la cotización cambiara después de mandarla, o que la PO cubra más ' +
               'de una cotización — y para eso hay salida, anotándolo.'
    });
  }

  /* El copiloto. Habla sólo cuando tiene algo que decir, y NUNCA decide.
   * `AMBAS` existe porque un cliente con 12 «con IVA» y 7 «sin IVA» no tiene
   * convención: tiene dos áreas que emiten distinto. Sostener la mayoría sería
   * un promedio sobre un comportamiento bimodal, o sea un número que miente con
   * confianza (§3.2). */
  function avisoMemoria(memoria, veredicto) {
    if (!memoria || !memoria.convencion) return null;
    if (memoria.convencion === 'AMBAS') {
      return 'Este cliente manda su PO de las dos formas (' + (memoria.veces_con || 0) +
             ' con IVA y ' + (memoria.veces_sin || 0) + ' sin IVA), así que no hay nada que ' +
             'contradecir: el veredicto de esta orden es el que vale.';
    }
    if (memoria.convencion === veredicto) return null;
    return 'Ojo: este cliente siempre había mandado su PO ' +
           (memoria.convencion === 'CON_IVA' ? 'CON IVA' : 'SIN IVA') +
           ' (' + ((memoria.convencion === 'CON_IVA' ? memoria.veces_con : memoria.veces_sin) || 0) +
           ' veces), y ésta cuadra al revés. ¿Cambió su forma, o hay un error? Si está bien, sigue.';
  }

  /* ══ EL ARCHIVO DE LA PO ═══════════════════════════════════════════════════
   *
   * ⚠️ `ir.attachment` está BLOQUEADO para el MCP, y el `binary` de Odoo no se
   * puede inspeccionar después. O sea que **el archivo se valida al SUBIRLO o no
   * se valida nunca**. Por eso esto vive en el navegador y no en el servidor.
   *
   * ⚠️ Y es un OLFATEO, no un intérprete de PDF. Se dice claro para que nadie
   * construya encima creyendo que lo es: cuenta `/Type /Page` y busca `/Font`
   * sobre los bytes crudos. Un PDF con los objetos comprimidos puede esconder
   * las dos cosas, así que el resultado es una PISTA. Por eso lo que decide del
   * archivo vacío es DURO y lo del escaneado es BLANDO — ver `faltantes`. */
  function inspeccionar(nombre, tipo, buf) {
    var bytes = buf ? (buf.byteLength || buf.length || 0) : 0;
    var r = { nombre: nombre || '', tipo: tipo || '', bytes: bytes,
              paginas: null, con_texto: null, subido_at: new Date().toISOString() };
    if (!bytes) return r;
    var u8 = (buf instanceof Uint8Array) ? buf : new Uint8Array(buf);
    /* Se leen como latin1 para poder buscar marcas ASCII sin romper los bytes
     * binarios: `TextDecoder('utf-8')` los sustituiría por el carácter de
     * reemplazo y las marcas se perderían justo en los archivos raros. */
    var s = '';
    for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    if (s.slice(0, 5) === '%PDF-') {
      var pg = s.match(/\/Type\s*\/Page[^s]/g);
      r.paginas = pg ? pg.length : null;
      if (r.paginas === null) {
        var cnt = s.match(/\/Count\s+(\d+)/);
        if (cnt) r.paginas = Number(cnt[1]);
      }
      r.con_texto = /\/Font/.test(s);
      return r;
    }
    /* Una foto o un escaneo en imagen: no hay texto y es normal que no lo haya.
     * Se marca `con_texto:false` sin dramatismo; el que decide qué hacer con
     * eso es `faltantes`. */
    if (/^image\//.test(r.tipo) || /\.(jpe?g|png|tiff?|heic|webp)$/i.test(r.nombre)) {
      r.paginas = 1; r.con_texto = false; return r;
    }
    return r;
  }

  /* ══ QUÉ FALTA ═════════════════════════════════════════════════════════════
   * Una lista, no un booleano — por lo mismo que en `compromisos`: lo que la
   * persona necesita saber es CUÁL falta.
   *
   * Cada renglón trae `dureza`, y la diferencia no es cosmética:
   *   · `dura`  → no se confirma. Falta un dato sin el que la orden nace mal.
   *   · `blanda`→ se confirma, pero alguien tiene que mirarlo.
   *
   * Y ninguno dice «error»: dicen QUÉ falta, POR QUÉ importa y DÓNDE se
   * arregla. Un candado que sólo dice «SIN_CONTACTO» es un candado que la gente
   * aprende a rodear (§3.1 de la especificación). */
  function faltantes(m, calc, memoria) {
    var c = de(m), f = [];
    var moneda = (m && m.moneda) || 'MXN';

    /* ── 5 · el contacto ───────────────────────────────────────────────────
     * Los dos datos, no uno: el correo es a donde va la factura y el teléfono
     * es por donde se cobra cuando el correo no contesta. Pedir sólo uno deja
     * la cobranza a medias, que es el estado en que nadie se hace cargo. */
    if (!String(c.contacto.nombre || '').trim()) {
      f.push({ id: 'contacto-nombre', dureza: 'dura', codigo: 'SIN_CONTACTO',
        que: 'Contacto del cliente',
        porque: 'Es la persona a quien se le manda la factura. Sin nombre, la factura sale a ' +
                'nombre de la empresa y se queda sin dueño del lado del cliente.',
        donde: 'Arriba, en DATOS.' });
    }
    if (!correoValido(c.contacto.correo)) {
      f.push({ id: 'contacto-correo', dureza: 'dura', codigo: 'SIN_CONTACTO',
        que: 'Correo del contacto',
        porque: 'Es a donde llega la factura. Un correo mal escrito no rebota a nadie: la ' +
                'factura simplemente no llega y se descubre cobrando.',
        donde: 'Arriba, en DATOS.' });
    }
    if (!telValido(c.contacto.tel)) {
      f.push({ id: 'contacto-tel', dureza: 'dura', codigo: 'SIN_CONTACTO',
        que: 'Teléfono del contacto',
        porque: 'Es por donde se cobra cuando el correo no contesta. Diez dígitos mínimo.',
        donde: 'Arriba, en DATOS.' });
    }

    /* ── 7 · la decisión de IVA ────────────────────────────────────────────
     * Explícita o leyenda, nunca en blanco. Una orden que sale sin decidirlo
     * hereda lo que Odoo traiga por omisión, y eso se descubre en la factura. */
    if (c.iva.decision === null) {
      f.push({ id: 'iva', dureza: 'dura', codigo: 'SIN_DECISION_IVA',
        que: 'Si esta orden lleva IVA',
        /* El texto NO usa la palabra «error»: lo que falta es un pendiente, no una
         * falla de quien captura, y así lo exige §3.1 de la especificación. Una
         * prueba de la V1.45 lo vigila sobre TODOS los renglones, y cazó justo
         * esta línea. */
        porque: 'Si no se dice, la orden hereda lo que Odoo traiga por omisión, y la ' +
                'equivocación se descubre en la factura, ya emitida.',
        donde: 'En DATOS, junto al cliente.' });
    } else if (c.iva.decision === 'no_lleva') {
      var tieneLeyenda = c.iva.leyenda_id &&
        (c.iva.leyenda_id !== 'otra' || String(c.iva.leyenda_texto || '').trim().length > 3);
      if (!tieneLeyenda) {
        f.push({ id: 'iva-leyenda', dureza: 'dura', codigo: 'SIN_DECISION_IVA',
          que: 'La leyenda de por qué no lleva IVA',
          porque: 'Una factura sin IVA y sin leyenda es una factura que el cliente rechaza, ' +
                  'o peor, que acepta y luego le observan.',
          donde: 'En DATOS, debajo de la decisión de IVA.' });
      }
    }

    /* ── 10 y 11 · la PO ───────────────────────────────────────────────────
     * El número y el archivo son dos candados y no uno: el número es la
     * referencia con la que el cliente va a pagar, y el archivo es la prueba.
     * Puede llegar el número por correo antes del PDF. */
    if (!String(c.po.numero || '').trim()) {
      f.push({ id: 'po-numero', dureza: 'dura', codigo: 'SIN_NUMERO_PO',
        que: 'El número de la orden de compra del cliente',
        porque: 'Es la referencia con la que el cliente va a pagar. Sin ella, su cuentas por ' +
                'pagar no encuentra nuestra factura.',
        donde: 'En DATOS, en el bloque de la orden de compra.' });
    }
    if (!c.po.archivo || !c.po.archivo.bytes) {
      f.push({ id: 'po-archivo', dureza: 'dura', codigo: 'SIN_ARCHIVO_PO',
        que: 'El archivo de la orden de compra',
        porque: 'Es la prueba de que el cliente pidió esto y a este precio. Se valida al ' +
                'subirlo, porque una vez dentro de Odoo ya no se puede revisar.',
        donde: 'En DATOS, en el bloque de la orden de compra.' });
    } else if (c.po.archivo.con_texto === false) {
      /* ── DECISIÓN PROPIA (27/28-sep-2026): esto es BLANDO, no duro ───────
       * La especificación lo puso en la tabla de los que rechazan, pero su
       * propio mensaje es una PREGUNTA («¿es el correcto?»), y un escaneo es un
       * caso legítimo y frecuente: muchos clientes mandan la PO fotografiada o
       * escaneada sin capa de texto.
       *
       * Si esto bloqueara, la salida obvia sería subir OTRO archivo cualquiera
       * que sí traiga texto para poder confirmar — y el candado habría producido
       * exactamente el dato falso que venía a impedir. Es la lección del tercer
       * botón de `IVA-EN-LA-PO.md` §4.1: un candado sin salida no produce
       * cumplimiento, produce elusión invisible.
       *
       * Así que avisa y deja pasar. Y el olfateo no es un intérprete de PDF
       * (ver `inspeccionar`), así que bloquear con una PISTA sería peor todavía. */
      f.push({ id: 'po-escaneada', dureza: 'blanda', codigo: 'PO_EN_BLANCO',
        que: 'La orden de compra parece un escaneo sin texto' +
             (c.po.archivo.paginas ? ' (' + c.po.archivo.paginas + ' página(s))' : ''),
        porque: 'No se le pudo leer texto, así que nadie va a poder buscar dentro. Es normal ' +
                'si el cliente la manda escaneada; sólo comprueba que sea la correcta y no ' +
                'una hoja en blanco.',
        donde: 'En DATOS, en el bloque de la orden de compra.' });
    }

    /* ── 12 · el cuadre ────────────────────────────────────────────────────
     * Con su salida: si la PO cubre varias cotizaciones y se anotó el motivo,
     * deja de bloquear y queda el rastro. */
    var q = cuadrePO(m, calc, memoria);
    if (q.porque === 'SIN_IMPORTE') {
      f.push({ id: 'po-importe', dureza: 'dura', codigo: 'SIN_IMPORTE_PO',
        que: 'El total que dice la orden de compra',
        porque: 'Con ese número el sistema deduce solo si la PO del cliente viene con IVA o ' +
                'sin IVA, y de paso comprueba que los dos documentos digan lo mismo.',
        donde: 'En DATOS, en el bloque de la orden de compra.' });
    } else if (q.veredicto === 'NO_DETERMINADO') {
      if (c.po.varias && String(c.po.varias.motivo || '').trim()) {
        f.push({ id: 'po-varias', dureza: 'blanda', codigo: 'PO_VARIAS',
          que: 'La PO no cuadra, y se anotó por qué',
          porque: 'Quedó anotado que esta orden de compra cubre más de una cotización: «' +
                  c.po.varias.motivo + '». Se puede confirmar, y sale en el vigilante para ' +
                  'que alguien lo mire con calma.',
          donde: 'En DATOS, en el bloque de la orden de compra.' });
      } else {
        f.push({ id: 'po-cuadre', dureza: 'dura', codigo: 'PO_NO_CUADRA',
          que: 'La orden de compra no cuadra con la cotización',
          porque: 'Tu PO dice ' + dinero(q.capturado, moneda) + ', la cotización sin IVA dice ' +
                  dinero(q.subtotal, moneda) + ' y con IVA ' + dinero(q.total, moneda) + '. ' +
                  'Diferencia contra el más cercano: ' + dinero(q.diferencia, moneda) + '. ' +
                  'Si la PO cubre varias cotizaciones, anótalo y se puede seguir.',
          donde: 'En DATOS, en el bloque de la orden de compra.' });
      }
    }

    /* ── 13 · el anticipo ──────────────────────────────────────────────────
     * Sobre el SUBTOTAL, que es lo que Esteban dijo: «anticipo todo sobre
     * subtotal». Cobrar un porcentaje sobre el total sería cobrar anticipo
     * sobre el IVA, que no es nuestro. */
    var sub = subtotalDe(m, calc);
    var umb = umbralDe(moneda);
    if (sub !== null && sub >= umb) {
      if (c.anticipo.aplica !== true) {
        f.push({ id: 'anticipo', dureza: 'dura', codigo: 'SIN_ANTICIPO',
          que: 'Anticipo',
          porque: 'Esta orden es de ' + dinero(sub, moneda) + ', arriba del umbral de ' +
                  dinero(umb, moneda) + ', así que lleva anticipo. Se calcula sobre el ' +
                  'subtotal: el IVA no es nuestro y no se anticipa.',
          donde: 'En DATOS, en el bloque del anticipo.' });
      } else if (!(c.anticipo.pct > 0 && c.anticipo.pct <= 100)) {
        f.push({ id: 'anticipo-pct', dureza: 'dura', codigo: 'SIN_ANTICIPO',
          que: 'El porcentaje del anticipo',
          porque: 'Se dijo que lleva anticipo pero no cuánto. Entre 1 y 100.',
          donde: 'En DATOS, en el bloque del anticipo.' });
      }
    }

    /* ── 7 · EL ADICIONAL NO SE LE CUELGA A LA ORDEN DEL PADRE (#387 D) ──
     * La regla, de Esteban: un adicional es trabajo extra sobre una orden YA
     * CONFIRMADA, y nace como orden NUEVA ligada a ella. Lo que este candado
     * impide es lo contrario: que alguien declare la copia adicional de
     * SO-X y después la emita sobre la MISMA SO-X, que es como se le acaban
     * agregando renglones a una orden que el cliente ya autorizó por otro
     * importe.
     *
     * Se mira la liga REAL del servidor, no el campo `so` que alguien
     * teclea: ese es texto y no prueba nada. Si la orden propia todavía no
     * existe, no hay nada que comparar y el candado calla — todavía no hay
     * manera de equivocarse.
     *
     * Lo que este candado NO hace es exigir que el padre siga confirmado:
     * eso se vuelve a mirar en el servidor al escribir la liga, que es donde
     * el dato es de verdad. Preguntarlo aquí sería una copia del estado de
     * Odoo en el navegador, o sea un segundo escritor de la misma verdad
     * (§20 #4). */
    var ad = m && m.adicional_de;
    if (ad && Number(ad.odoo_so_id)) {
      var mia = null;
      try {
        mia = (window.MachoteAlmacen && window.MachoteAlmacen.ordenDe)
          ? window.MachoteAlmacen.ordenDe(m.id) : null;
      } catch (e) { mia = null; }
      if (mia && Number(mia.id) === Number(ad.odoo_so_id)) {
        f.push({ id: 'adicional-misma-orden', dureza: 'dura', codigo: 'ADICIONAL_MISMA_ORDEN',
          que: 'Este adicional está ligado a la MISMA orden de la que es adicional',
          porque: 'Un adicional es trabajo extra sobre ' +
                  (ad.odoo_so_name || ('la orden ' + ad.odoo_so_id)) +
                  ', así que tiene que ser una orden NUEVA. Confirmarlo sobre la misma ' +
                  'le cambiaría el importe a una orden que el cliente ya autorizó con su ' +
                  'orden de compra, y eso no se vería como un error: se vería como un dato.',
          donde: 'Desliga la orden en el paso 1 de «Confirmar orden» y emite una nueva.' });
      }
    }

    return f;
  }

  /* Los dos validadores, a propósito flojos y explicados.
   * Un correo se valida con «tiene arroba, algo antes, algo después y un punto
   * después»: cualquier regla más estricta rechaza direcciones válidas y la
   * persona acaba escribiendo una falsa para pasar el candado. */
  function correoValido(x) {
    var s = String(x || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
  }
  /* Y un teléfono, contando DÍGITOS y no formas: los diez de México caben con
   * o sin lada entre paréntesis, con guiones o pegados, y con +52 delante. */
  function telValido(x) {
    return String(x || '').replace(/\D/g, '').length >= 10;
  }

  function duras(m, calc, memoria) {
    return faltantes(m, calc, memoria).filter(function (x) { return x.dureza === 'dura'; });
  }
  function puedeConfirmar(m, calc, memoria) { return duras(m, calc, memoria).length === 0; }

  /* ── Lo que viaja al servidor ──────────────────────────────────────────────
   * Plano y explícito: quien lea el payload en un log tiene que entenderlo sin
   * abrir este archivo. Y el ARCHIVO no va aquí: viaja aparte, porque un base64
   * de dos megas dentro del payload de la orden convierte cada reintento en dos
   * megas más. */
  function paraOrden(m, calc, memoria) {
    var c = de(m), q = cuadrePO(m, calc, memoria);
    var ley = LEYENDAS.filter(function (l) { return l.id === c.iva.leyenda_id; })[0];
    var sub = subtotalDe(m, calc);
    return {
      contacto_partner_id: c.contacto.partner_id,
      contacto_nombre: c.contacto.nombre || null,
      contacto_tel: c.contacto.tel || null,
      contacto_correo: c.contacto.correo || null,
      lleva_iva: llevaIva(m),
      tasa_iva: tasaDe(m),
      iva_leyenda_id: c.iva.leyenda_id,
      iva_leyenda_texto: c.iva.leyenda_id === 'otra'
        ? (String(c.iva.leyenda_texto || '').trim() || null)
        : (ley ? ley.t : null),
      po_numero: String(c.po.numero || '').trim() || null,
      po_importe: c.po.importe,
      po_veredicto: q.veredicto,
      po_archivo_nombre: c.po.archivo ? c.po.archivo.nombre : null,
      po_archivo_bytes: c.po.archivo ? c.po.archivo.bytes : null,
      po_archivo_paginas: c.po.archivo ? c.po.archivo.paginas : null,
      po_archivo_con_texto: c.po.archivo ? c.po.archivo.con_texto : null,
      po_varias_motivo: c.po.varias ? (c.po.varias.motivo || null) : null,
      anticipo_aplica: c.anticipo.aplica,
      anticipo_pct: c.anticipo.pct,
      /* El monto se calcula aquí y viaja calculado, para que el servidor no
       * tenga que volver a decidir sobre qué base se cobra. Es la respuesta a
       * «anticipo todo sobre subtotal» en un solo sitio. */
      anticipo_base: sub,
      anticipo_monto: (c.anticipo.aplica === true && c.anticipo.pct > 0 && sub !== null)
        ? Math.round(sub * c.anticipo.pct) / 100 : null,
      umbral_anticipo: umbralDe((m && m.moneda) || 'MXN')
    };
  }

  /* ══ LA PANTALLA ═══════════════════════════════════════════════════════════
   *
   * Vive dentro del modal de «Pasar a orden de venta» (`orden.js`), al lado de
   * los cinco compromisos, porque es la misma conversación: qué le falta a esta
   * cotización para volverse una orden.
   *
   * ── Ancho (§20 #20: 380 · 760 · 900 · 1280) ─────────────────────────────
   * Todo en `flex-wrap` con `flex: 1 1 <mínimo>`, cero columnas fijas y cero
   * tablas. A 380 cada campo ocupa su renglón; a 1280 se acomodan de dos o tres
   * en fondo. La franja mala de este módulo ha sido dos veces la de 721-980 px,
   * y siempre por una rejilla con medidas escritas a mano.
   *
   * ── Nombres de clase ────────────────────────────────────────────────────
   * Todos con prefijo **`cfx-`**, y el porqué de la x es una lección cara: el
   * prefijo `cf-` YA ERA de `confirmar.js` —once clases, entre ellas un `.cf-h`
   * con otro tamaño y otro margen—. La primera versión de este archivo lo reusó
   * y habría cambiado el aspecto de ESA pantalla sin tocar una línea de su
   * código. Es el segundo bug de §20 #12 repitiéndose; esta vez no lo cazó una
   * captura sino un `git show HEAD:` del CSS antes de commitear.
   *
   * Y los atributos van igual (`data-cfx`), no por elegancia: el rename a medias
   * —clases renombradas, selector no— deja la pantalla pintada y MUERTA. No
   * truena, no avisa: simplemente no pasa nada al teclear. Pasó, y lo cazó una
   * guarda que contaba cuántos campos pinta el HTML contra cuántos calza el
   * selector.
   *
   * Reusar un nombre que ya existe en el módulo es
   * cómo la V1.42 acabó con tres cajas donde iba una: el CSS nuevo era
   * correcto y el choque estaba en otra parte del mismo archivo. */
  function campo(etiqueta, dentro, minimo, ayuda) {
    return '<label class="cfx-c" style="flex:1 1 ' + (minimo || 200) + 'px">' +
      '<span class="cfx-et">' + esc(etiqueta) + '</span>' + dentro +
      (ayuda ? '<span class="cfx-ay">' + esc(ayuda) + '</span>' : '') + '</label>';
  }

  function montoTexto(pct, sub, moneda) {
    if (!(pct > 0)) return 'Escribe el porcentaje y aquí aparece el monto.';
    return 'Anticipo: ' + '<strong>' + dinero(Math.round(sub * pct) / 100, moneda) + '</strong>' +
           ' · ' + esc(pct) + '% de ' + dinero(sub, moneda) + ' (subtotal)';
  }

  function html(m, calc, memoria) {
    var c = de(m);
    var moneda = (m && m.moneda) || 'MXN';
    var sub = subtotalDe(m, calc);
    var q = cuadrePO(m, calc, memoria);
    var umb = umbralDe(moneda);
    var pideAnticipo = sub !== null && sub >= umb;
    var f = faltantes(m, calc, memoria);
    var porId = {}; f.forEach(function (x) { porId[x.id] = x; });
    var mal = function (id) { return porId[id] ? ' cfx-mal' : ''; };

    /* ── El contacto ──────────────────────────────────────────────────────── */
    var h = '<div class="cfx-bloque"><h4 class="cfx-h">A quién se le factura</h4>' +
      '<div class="cfx-fila">' +
      campo('Nombre del contacto',
        '<input class="cel cfx-in' + mal('contacto-nombre') + '" data-cfx="contacto.nombre" ' +
        'maxlength="120" value="' + esc(c.contacto.nombre) + '" ' +
        'placeholder="Quién recibe la factura">', 220) +
      campo('Correo',
        '<input class="cel cfx-in' + mal('contacto-correo') + '" data-cfx="contacto.correo" ' +
        'type="email" maxlength="120" value="' + esc(c.contacto.correo) + '" ' +
        'placeholder="nombre@empresa.com">', 220,
        'A donde llega la factura.') +
      campo('Teléfono',
        '<input class="cel cfx-in' + mal('contacto-tel') + '" data-cfx="contacto.tel" ' +
        'maxlength="40" value="' + esc(c.contacto.tel) + '" placeholder="81 1234 5678">', 170,
        'Por donde se cobra cuando el correo no contesta.') +
      '</div></div>';

    /* ── El IVA ───────────────────────────────────────────────────────────── */
    var leyendas = LEYENDAS.map(function (l) {
      return '<option value="' + l.id + '"' + (c.iva.leyenda_id === l.id ? ' selected' : '') +
        '>' + esc(l.t) + '</option>';
    }).join('');
    h += '<div class="cfx-bloque"><h4 class="cfx-h">Impuesto</h4>' +
      '<div class="cfx-fila">' +
      campo('¿Lleva IVA?',
        '<select class="cel cfx-in' + mal('iva') + '" data-cfx="iva.decision">' +
        '<option value=""' + (c.iva.decision === null ? ' selected' : '') + '>— hay que decirlo —</option>' +
        '<option value="lleva"' + (c.iva.decision === 'lleva' ? ' selected' : '') + '>Sí, 16%</option>' +
        '<option value="no_lleva"' + (c.iva.decision === 'no_lleva' ? ' selected' : '') + '>No lleva</option>' +
        '</select>', 200) +
      (c.iva.decision === 'no_lleva'
        ? campo('Leyenda',
            '<select class="cel cfx-in' + mal('iva-leyenda') + '" data-cfx="iva.leyenda_id">' +
            '<option value="">— elige una —</option>' + leyendas + '</select>', 260,
            'El texto exacto lo confirma Contabilidad.')
        : '') +
      (c.iva.decision === 'no_lleva' && c.iva.leyenda_id === 'otra'
        ? campo('La leyenda, escrita',
            '<input class="cel cfx-in' + mal('iva-leyenda') + '" data-cfx="iva.leyenda_texto" ' +
            'maxlength="200" value="' + esc(c.iva.leyenda_texto) + '">', 300)
        : '') +
      '</div></div>';

    /* ── La PO ────────────────────────────────────────────────────────────── */
    var a = c.po.archivo;
    h += '<div class="cfx-bloque"><h4 class="cfx-h">La orden de compra del cliente</h4>' +
      '<div class="cfx-fila">' +
      campo('Número',
        '<input class="cel cfx-in' + mal('po-numero') + '" data-cfx="po.numero" maxlength="60" ' +
        'value="' + esc(c.po.numero) + '" placeholder="El que trae su PO">', 200) +
      campo('Total que dice la PO',
        '<input class="cel cfx-in' + mal('po-importe') + mal('po-cuadre') + '" data-cfx="po.importe" ' +
        'type="number" step="0.01" min="0" value="' + (c.po.importe === null ? '' : esc(c.po.importe)) + '" ' +
        'placeholder="Cópialo tal cual">', 200,
        'Con este número el sistema deduce solo si su PO trae IVA.') +
      campo('Archivo',
        '<input class="cfx-file' + mal('po-archivo') + '" type="file" data-cfx-file="1" ' +
        'accept=".pdf,image/*">', 240,
        'Se revisa al subirlo: después ya no se puede.') +
      '</div>' +
      (a ? '<p class="cfx-arch">' + esc(a.nombre) + ' · ' +
            Math.round((a.bytes || 0) / 1024) + ' KB' +
            (a.paginas ? ' · ' + a.paginas + ' página(s)' : '') +
            (a.con_texto === false ? ' · <strong>parece un escaneo sin texto</strong>'
             : a.con_texto === true ? ' · con texto' : '') + '</p>' : '');

    /* El cuadre, con sus tres números lado a lado. Se pinta SIEMPRE que haya
     * veredicto, no sólo cuando falla: que cuadre también es información, y
     * verla es lo que hace que la persona confíe en el candado. */
    if (q.veredicto) {
      var clase = q.veredicto === 'NO_DETERMINADO' ? 'cfx-no' : 'cfx-si';
      h += '<div class="cfx-cuadre ' + clase + '">' +
        /* Cuando la orden NO lleva impuesto, «Sin IVA» y «Con IVA» son EL MISMO
         * número, y pintarlo dos veces con dos etiquetas distintas se lee como
         * una pantalla rota: quien la mira se pone a buscar la diferencia que no
         * existe. Se vio en la captura de 900 px del estado del anticipo,
         * $850,000.00 repetido. En ese caso va UN solo número y la etiqueta dice
         * qué es. El código no lo delataba —las tres líneas son correctas por
         * separado— y por eso las pantallas se revisan MIRÁNDOLAS (§20 #12). */
        '<div class="cfx-tres">' +
        '<span><b>Tu PO</b> ' + dinero(q.capturado, moneda) + '</span>' +
        (q.tasa === 0
          ? '<span><b>La cotización</b> ' + dinero(q.subtotal, moneda) + '</span>' +
            '<span class="cfx-ay">sin impuesto</span>'
          : '<span><b>Sin IVA</b> ' + dinero(q.subtotal, moneda) + '</span>' +
            '<span><b>Con IVA</b> ' + dinero(q.total, moneda) + '</span>') +
        '</div><p>' + esc(q.mensaje) +
        (q.diferencia !== undefined
          ? ' Diferencia contra el ' + esc(q.contra) + ': <strong>' +
            dinero(q.diferencia, moneda) + '</strong>.' : '') + '</p>' +
        (q.aviso ? '<p class="cfx-aviso">' + esc(q.aviso) + '</p>' : '') +
        /* ── LA SALIDA, y existe a propósito ─────────────────────────────
         * Una PO que cubre varias cotizaciones es un caso real. Sin salida, la
         * persona acabaría tecleando el número que hace cuadrar para poder
         * confirmar, y el candado habría producido exactamente el dato falso
         * que venía a impedir. Con salida, queda el motivo con autor y fecha. */
        (q.veredicto === 'NO_DETERMINADO'
          ? (c.po.varias && c.po.varias.motivo
              ? '<p class="cfx-varias-ok">Anotado: ' + esc(c.po.varias.motivo) + '</p>'
              : '<div class="cfx-salida">' +
                '<input class="cel cfx-in" data-cfx-varias="1" maxlength="200" ' +
                'placeholder="Si la PO cubre varias cotizaciones, escribe cuáles">' +
                '<button class="btn fantasma" data-cfx-varias-ok="1">Anotar y seguir</button>' +
                '</div>')
          : '') +
        '</div>';
    }
    h += '</div>';

    /* ── El anticipo ──────────────────────────────────────────────────────── */
    h += '<div class="cfx-bloque"><h4 class="cfx-h">Anticipo</h4>';
    if (!pideAnticipo) {
      h += '<p class="cfx-ay">Esta orden es de ' + (sub === null ? '—' : dinero(sub, moneda)) +
        ', abajo del umbral de ' + dinero(umb, moneda) + ', así que el anticipo es opcional.</p>';
    }
    h += '<div class="cfx-fila">' +
      campo('¿Lleva anticipo?',
        '<select class="cel cfx-in' + mal('anticipo') + '" data-cfx="anticipo.aplica">' +
        '<option value=""' + (c.anticipo.aplica === null ? ' selected' : '') + '>—</option>' +
        '<option value="si"' + (c.anticipo.aplica === true ? ' selected' : '') + '>Sí</option>' +
        '<option value="no"' + (c.anticipo.aplica === false ? ' selected' : '') + '>No</option>' +
        '</select>', 180,
        pideAnticipo ? 'Arriba de ' + dinero(umb, moneda) + ' es obligatorio.' : '') +
      (c.anticipo.aplica === true
        ? campo('Porcentaje',
            '<input class="cel cfx-in' + mal('anticipo-pct') + '" data-cfx="anticipo.pct" ' +
            'type="number" min="1" max="100" step="0.5" ' +
            'value="' + (c.anticipo.pct === null ? '' : esc(c.anticipo.pct)) + '">', 150,
            'Sobre el subtotal: el IVA no es nuestro y no se anticipa.')
        : '') +
      '</div>';
    /* El monto SIEMPRE se pinta cuando hay anticipo, aunque todavía no haya
     * porcentaje: así existe el nodo que el cableado actualiza al teclear. La
     * primera versión lo pintaba sólo con `pct > 0`, y entonces al escribir el
     * porcentaje no aparecía nada — porque `pct` no repinta (repintar tras cada
     * tecla le quita el foco a quien escribe «30» después del «3»). El nodo
     * vacío es lo que permite tener las dos cosas: el número en vivo y el foco
     * quieto. Lo cazó la prueba de navegador del umbral, no la lectura. */
    if (c.anticipo.aplica === true && sub !== null) {
      h += '<p class="cfx-monto" id="cfxMonto">' + montoTexto(c.anticipo.pct, sub, moneda) + '</p>';
    }
    h += '</div>';

    /* ── Lo que falta, junto y al final ───────────────────────────────────── */
    if (f.length) {
      h += '<div class="cfx-faltan">' +
        f.map(function (x) {
          return '<div class="cfx-falta ' + (x.dureza === 'dura' ? 'cfx-dura' : 'cfx-blanda') + '">' +
            '<b>' + esc(x.que) + '</b> ' + esc(x.porque) +
            ' <span class="cfx-donde">' + esc(x.donde) + '</span></div>';
        }).join('') + '</div>';
    }
    return h;
  }

  /* ── El cableado ──────────────────────────────────────────────────────────
   * `onCambio(repintar)` — `repintar` en true cuando el cambio altera la FORMA
   * de la pantalla (aparece la leyenda, aparece el porcentaje, aparece el
   * cuadre). En false, sólo se refresca el botón. Repintar entero tras cada
   * tecla le quita el foco a quien está escribiendo a media palabra; es la
   * misma disciplina que `compromisos.cablear`. */
  function cablear(raiz, m, onCambio) {
    if (!raiz) return;
    var pon = function (ruta, valor) {
      if (!m.confirmacion) m.confirmacion = vacio();
      var p = ruta.split('.'), o = m.confirmacion;
      for (var i = 0; i < p.length - 1; i++) { if (!o[p[i]]) o[p[i]] = {}; o = o[p[i]]; }
      o[p[p.length - 1]] = valor;
      m.confirmacion.at = new Date().toISOString();
    };
    /* Qué rutas cambian la FORMA. Escritas una vez, aquí, en vez de repetir el
     * criterio en cada manejador. */
    var FORMA = { 'iva.decision': 1, 'iva.leyenda_id': 1, 'anticipo.aplica': 1, 'po.importe': 1 };

    Array.prototype.forEach.call(raiz.querySelectorAll('[data-cfx]'), function (el) {
      var ruta = el.getAttribute('data-cfx');
      var evento = (el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(evento, function () {
        var v = el.value;
        if (ruta === 'anticipo.aplica') v = v === 'si' ? true : v === 'no' ? false : null;
        else if (ruta === 'iva.decision') v = v || null;
        else if (ruta === 'po.importe' || ruta === 'anticipo.pct') v = num(v);
        pon(ruta, v);
        /* El porcentaje del anticipo NO repinta —repintar tras cada tecla quita el
         * foco a media palabra— pero su monto SÍ tiene que moverse. Se actualiza
         * el nodo en su sitio. Si el nodo no existe todavía, se repinta: es el
         * caso de la primera vez, cuando el bloque aún no lo traía. */
        if (ruta === 'anticipo.pct') {
          var nodo = raiz.querySelector('#cfxMonto');
          var sub2 = subtotalDe(m);
          if (nodo && sub2 !== null) {
            nodo.innerHTML = montoTexto(num(v), sub2, (m && m.moneda) || 'MXN');
          } else if (onCambio) { onCambio(true); return; }
        }
        if (onCambio) onCambio(!!FORMA[ruta]);
      });
    });

    /* El archivo se inspecciona AQUÍ, al subirlo. `ir.attachment` está
     * bloqueado para el MCP y el binary de Odoo no se puede mirar después: o se
     * revisa ahora o no se revisa nunca. */
    var file = raiz.querySelector('[data-cfx-file]');
    if (file) {
      file.addEventListener('change', function () {
        var f0 = file.files && file.files[0];
        if (!f0) return;
        var fr = new FileReader();
        fr.onload = function () {
          try {
            pon('po.archivo', inspeccionar(f0.name, f0.type, new Uint8Array(fr.result)));
          } catch (e) {
            /* Si el olfateo truena, el archivo SÍ se registra: lo que se pierde
             * son las pistas, no el hecho de que hay archivo. Tratar un fallo
             * del olfateo como «no hay archivo» sería bloquear por no poder
             * medir, que es lo contrario de lo que el candado quiere. */
            pon('po.archivo', { nombre: f0.name, tipo: f0.type, bytes: f0.size,
                                paginas: null, con_texto: null,
                                subido_at: new Date().toISOString() });
          }
          if (onCambio) onCambio(true);
        };
        fr.onerror = function () { if (onCambio) onCambio(false); };
        fr.readAsArrayBuffer(f0);
      });
    }

    var ok = raiz.querySelector('[data-cfx-varias-ok]');
    if (ok) {
      ok.addEventListener('click', function () {
        var inp = raiz.querySelector('[data-cfx-varias]');
        var motivo = inp ? String(inp.value || '').trim() : '';
        if (motivo.length < 5) {
          if (inp) { inp.classList.add('cfx-mal'); inp.focus(); }
          return;
        }
        var actor = null;
        try {
          var s = JSON.parse(localStorage.getItem('fts_suite_session') || '{}');
          actor = s.actor || null;
        } catch (e) {}
        pon('po.varias', { motivo: motivo, at: new Date().toISOString(), por: actor });
        if (onCambio) onCambio(true);
      });
    }
  }

  G.Confirmacion = {
    UMBRAL: UMBRAL, LEYENDAS: LEYENDAS, TASA_IVA: TASA_IVA,
    html: html, cablear: cablear,
    vacio: vacio, de: de, umbralDe: umbralDe,
    subtotalDe: subtotalDe, llevaIva: llevaIva, tasaDe: tasaDe,
    cuadrePO: cuadrePO, inspeccionar: inspeccionar,
    faltantes: faltantes, duras: duras, puedeConfirmar: puedeConfirmar,
    correoValido: correoValido, telValido: telValido,
    paraOrden: paraOrden, dinero: dinero, esc: esc
  };
})(typeof window !== 'undefined' ? window : globalThis);
