// ═══ Carga MO · lector de los TXT de dispersión ════════════════════════════
//
// QUÉ PROBLEMA RESUELVE. El Excel de CONTPAQi ya se valida contra sí mismo y contra
// lo que pidió RH. Pero el dinero no sale del Excel: sale de un TXT que Ulises
// genera aparte y que Esteban sube al portal del banco. Entre el Excel validado y
// el archivo que mueve el dinero no había NADA — y ahí es donde un dedazo en una
// cuenta manda el pago de alguien a un tercero, que es el único error de toda esta
// cadena que no se corrige.
//
// Este archivo lee esos TXT y contesta dos preguntas:
//   · ¿la suma de lo que se va a dispersar es la que el Excel dice?   (Nivel 1)
//   · ¿cada persona recibe lo que su renglón del Excel dice?          (Nivel 1b)
// La tercera —¿cada cuenta es la de esa persona en Odoo?— vive en el servidor,
// porque los números de cuenta no deben volcarse a ningún lado (#311).
//
// ── EL NIVEL 1 NO ES UNA COMPARACIÓN, SON TRES QUE SE CIERRAN ENTRE SÍ ─────
// Medido sobre S38 (issue #313): el Excel trae DOS poblaciones — los 27 con código
// de CONTPAQi y los de honorarios que Ulises agrega a mano al final, sin código y
// sólo con el nombre de pila. Cada una tiene su propio TXT. Las tres sumas cierran:
//
//     TXT de CONTPAQi   == suma de las filas CON código
//     TXT de honorarios == suma de las filas SIN código
//     los dos TXT       == "Total Gral." del Excel
//
// Y eso da tres garantías de un golpe: que el lector entendió cada archivo, que
// **el archivo de honorarios es de esta semana** (no lo declara en ningún lado, ni
// siquiera su nombre — el de S38 se llama RICARDO_MANZANAREZ_FELIPE y paga a dos),
// y que no se perdió ni se coló un renglón. Si esto no cierra, el cruce de cuentas
// NO debe correr: estaría comparando cuentas sacadas de un archivo mal leído.
//
// ── LA LLAVE ES EL NOMBRE, Y AQUÍ SÍ ───────────────────────────────────────
// En `cruce-rh.js` la llave es el código porque ahí el cruce es contra ODOO, que
// escribe "Héctor Cruz Hernández" mientras CONTPAQi escribe "CRUZ HERNANDEZ HECTOR
// JAVIER". Aquí el cruce es contra el EXCEL, y el Excel y el TXT salen los dos de
// CONTPAQi: traen el nombre idéntico. Medido: 27 de 27 en S38, cero discrepancias.
//
// ⚠️ Y NO por importe: dos personas de la nómina tienen el mismo neto al centavo
// en S38 y en S37. Una biyección por importe habría sido ambigua en 2 de 27.
//
// Para el TXT de honorarios el nombre del Excel es de pila ("FELIPE") y el del TXT
// completo ("PEREZ GUZMAN FELIPE"): no aparean literal. Se resuelven por la tabla
// de alias del trío que YA existe en el catálogo, por SUBCONJUNTO de palabras —
// que además aguanta las dos grafías de MANZANARES/MANZANAREZ.
//
// ── TODO EN CENTAVOS ENTEROS ───────────────────────────────────────────────
// El propio "Total Gral." del Excel se lee 155147.16999999998. Comparar flotantes
// aquí es aceptar un falso hallazgo cada tantas semanas.
//
// PURO: sin DOM, sin red. Corre en el navegador y en node — por eso el doble export.

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CargaMOTxt = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var INTEGRIDAD = 'INTEGRIDAD';
  var REVISION   = 'REVISION';
  var AVISO      = 'AVISO';

  // El renglón del banco: 108 de contenido + CRLF. Los tres archivos medidos son
  // exactamente N × 110 bytes, sin renglón suelto al final.
  var ANCHO = 108;
  var BYTES_POR_RENGLON = 110;

  // Posiciones en base 0, [desde, hasta) — como las devuelve slice.
  var CAMPO = {
    consecutivo: [0, 9],
    relleno1:    [9, 25],
    prefijo:     [25, 27],
    cuenta:      [27, 37],
    relleno2:    [37, 47],
    monto:       [47, 62],
    nombre:      [62, 102],
    cola:        [102, 108]
  };
  var PREFIJO = '99';
  var COLA    = '001001';

  function norm(s) {
    return String(s == null ? '' : s)
      .toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // Bolsa de palabras ordenada: insensible al orden de apellidos y nombres.
  function bolsa(s) { return norm(s).split(' ').filter(Boolean).sort().join(' '); }
  function palabras(s) { return norm(s).split(' ').filter(Boolean); }
  function cent(x) { return Math.round(Number(x || 0) * 100); }
  function pesos(c) {
    var s = (Math.abs(c) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (c < 0 ? '-$' : '$') + s;
  }

  /* ═══ 1 · LEER UN ARCHIVO ════════════════════════════════════════════════
     Devuelve SIEMPRE un objeto; los problemas van en `fallas`, nunca por throw.
     `crudo` es el texto tal cual salió del archivo: sin normalizar saltos de línea
     y sin recortar. Normalizarlo antes de llegar aquí destruye la evidencia. */
  function leer(crudo, nombreArchivo) {
    var res = {
      nombre_archivo: nombreArchivo || '(sin nombre)',
      renglones: [], total_centavos: 0, fallas: [],
      caracteres: 0, terminador: null
    };
    function falla(codigo, que, dato, accion) {
      res.fallas.push({ nivel: INTEGRIDAD, codigo: codigo, que: que, dato: dato, accion: accion });
    }

    var texto = String(crudo == null ? '' : crudo);
    res.caracteres = texto.length;

    if (!texto.length) {
      falla('TXT_VACIO', 'El archivo no tiene contenido', '0 caracteres',
            'Verifica que soltaste el .txt correcto y que no está en blanco.');
      return res;
    }

    // ── El terminador, ANTES de partir ────────────────────────────────────
    // Un split('\n') sin quitar el \r deja renglones de 109 y la cola en
    // "001001\r": el control de ancho rechazaría un archivo BUENO, que es el peor
    // modo de falla posible (el mensaje alarmante lo produce lo inocente).
    var nCRLF = (texto.match(/\r\n/g) || []).length;
    var nLF   = (texto.match(/\n/g)   || []).length;
    res.terminador = nLF === 0 ? 'NINGUNO' : (nCRLF === nLF ? 'CRLF' : (nCRLF === 0 ? 'LF' : 'MIXTO'));
    if (res.terminador === 'MIXTO') {
      falla('TXT_TERMINADOR_MIXTO',
            'El archivo mezcla renglones terminados en CRLF y en LF',
            nCRLF + ' con CRLF de ' + nLF + ' renglones',
            'Vuelve a generarlo desde el sistema que lo produce. Un archivo editado a mano suele quedar así.');
      return res;
    }

    var partes = texto.split(res.terminador === 'LF' ? '\n' : '\r\n');
    if (partes.length && partes[partes.length - 1] === '') partes.pop();
    if (!partes.length) {
      falla('TXT_VACIO', 'El archivo no tiene renglones', res.caracteres + ' caracteres, ningún renglón',
            'Verifica que soltaste el .txt correcto.');
      return res;
    }

    // ── El ancho, renglón por renglón ─────────────────────────────────────
    // Un substring sobre un renglón de otro largo devuelve basura, NO truena: se
    // leería una cuenta corrida y se compararía con confianza. Por eso el ancho se
    // EXIGE y el archivo se rechaza, en vez de leer lo que salga.
    var malAncho = [];
    partes.forEach(function (l, i) { if (l.length !== ANCHO) malAncho.push({ n: i + 1, largo: l.length }); });
    if (malAncho.length) {
      falla('TXT_ANCHO_INVALIDO',
            'Hay renglones que no miden ' + ANCHO + ' caracteres',
            malAncho.length + ' de ' + partes.length + ' · el primero es el renglón ' +
              malAncho[0].n + ' con ' + malAncho[0].largo,
            'El formato del banco es de ancho fijo. Vuelve a generar el archivo; no lo edites a mano.');
      return res;
    }

    // Comprobación de una línea que atrapa de un golpe un renglón truncado, uno
    // pegado y un byte de más. Sólo vale con CRLF, que es lo que emite el sistema.
    if (res.terminador === 'CRLF') {
      var esperados = partes.length * BYTES_POR_RENGLON;
      if (res.caracteres !== esperados) {
        falla('TXT_TAMANO_NO_CUADRA',
              'El tamaño del archivo no corresponde a sus renglones',
              res.caracteres + ' caracteres · ' + partes.length + ' renglones × ' +
                BYTES_POR_RENGLON + ' = ' + esperados,
              'Sobra o falta contenido fuera de los renglones. Vuelve a generar el archivo.');
        return res;
      }
    }

    // ── Los campos ────────────────────────────────────────────────────────
    var malCampo = [];
    var filas = partes.map(function (l, i) {
      var g = function (k) { return l.slice(CAMPO[k][0], CAMPO[k][1]); };
      var f = {
        n: i + 1,
        consecutivo: g('consecutivo'), prefijo: g('prefijo'), cuenta: g('cuenta'),
        monto: g('monto'), nombre: g('nombre').trim(), cola: g('cola'),
        relleno1: g('relleno1'), relleno2: g('relleno2')
      };
      function mal(q, d) { malCampo.push({ n: f.n, que: q, dato: d }); }
      if (!/^\d{9}$/.test(f.consecutivo)) mal('el consecutivo no son 9 dígitos', JSON.stringify(f.consecutivo));
      else if (parseInt(f.consecutivo, 10) !== f.n) mal('el consecutivo no sigue la cuenta', 'dice ' + parseInt(f.consecutivo, 10) + ' y va en el renglón ' + f.n);
      if (/\S/.test(f.relleno1) || /\S/.test(f.relleno2)) mal('hay texto en el relleno', 'posiciones 10-25 o 38-47');
      if (f.prefijo !== PREFIJO) mal('el prefijo no es "' + PREFIJO + '"', JSON.stringify(f.prefijo));
      if (!/^\d{10}$/.test(f.cuenta)) mal('la cuenta no son 10 dígitos', '(no se muestra)');
      if (!/^\d{15}$/.test(f.monto)) mal('el importe no son 15 dígitos', JSON.stringify(f.monto));
      if (!f.nombre) mal('el nombre viene vacío', 'posiciones 63-102');
      if (f.cola !== COLA) mal('la cola no es "' + COLA + '"', JSON.stringify(f.cola));
      f.centavos = /^\d{15}$/.test(f.monto) ? parseInt(f.monto, 10) : 0;
      f.cuenta_ult4 = /^\d{10}$/.test(f.cuenta) ? f.cuenta.slice(-4) : '????';
      return f;
    });

    if (malCampo.length) {
      falla('TXT_CAMPO_INVALIDO',
            'Hay renglones cuyos campos no tienen la forma del formato',
            malCampo.length + ' problema(s) · el primero: renglón ' + malCampo[0].n +
              ', ' + malCampo[0].que + ' (' + malCampo[0].dato + ')',
            'Vuelve a generar el archivo desde el sistema que lo produce.');
      return res;
    }

    res.renglones = filas;
    res.total_centavos = filas.reduce(function (a, f) { return a + f.centavos; }, 0);
    return res;
  }

  /* ═══ 2 · LA TABLA DEL TRÍO ══════════════════════════════════════════════
     El catálogo ya trae los alias de quienes facturan por honorarios, con las dos
     grafías del apellido. Aquí se usa por SUBCONJUNTO de palabras porque el Excel
     los escribe de pila y el TXT completo: ningún alias aparea literal contra el
     TXT, pero todas sus palabras sí están contenidas en él. */
  function resolverTrio(nombre, catalogo) {
    var per = (catalogo && catalogo.trio && catalogo.trio.personas) || {};
    var pal = {}, i;
    palabras(nombre).forEach(function (w) { pal[w] = true; });
    var ids = {}, via = [];
    Object.keys(per).forEach(function (id) {
      (per[id].alias || []).forEach(function (a) {
        var ws = palabras(a);
        if (!ws.length) return;
        for (i = 0; i < ws.length; i++) if (!pal[ws[i]]) return;
        ids[id] = true; via.push(a);
      });
    });
    var lista = Object.keys(ids);
    return { ids: lista, unico: lista.length === 1 ? parseInt(lista[0], 10) : null, via: via };
  }

  /* ═══ 3 · CRUZAR ═════════════════════════════════════════════════════════
     `parsed`  — la salida de CargaMOResolver.resolver (empleados, trio, total_gral)
     `txts`    — { nomina: <salida de leer()>, honorarios: <salida de leer()|null> }
     `catalogo`— contpaqi_conceptos.json (para la tabla del trío)                  */
  function cruzar(parsed, txts, catalogo) {
    var H = [];
    function add(nivel, codigo, que, dato, accion) {
      H.push({ nivel: nivel, codigo: codigo, que: que, dato: dato, accion: accion });
    }

    var nom = txts && txts.nomina;
    var hon = txts && txts.honorarios;

    // ── "no lo subiste" y "no se pudo leer" son DOS cosas ──────────────────
    // Llevan a acciones distintas —subirlo contra volver a generarlo— y juntarlas
    // en un solo mensaje elige la equivocada por omisión (§20 #12b). Por eso el
    // archivo ilegible se reporta con SUS fallas de formato, no como ausente.
    // Y un archivo ilegible NO se cruza: los hallazgos serían inventados sobre
    // datos que no se entendieron (§20 #11).
    if (nom && nom.fallas.length) return { hallazgos: H.concat(nom.fallas), resumen: null };
    if (hon && hon.fallas.length) return { hallazgos: H.concat(hon.fallas), resumen: null };

    if (!nom || !nom.renglones.length) {
      add(INTEGRIDAD, 'TXT_NOMINA_AUSENTE',
          'No se cargó el archivo de dispersión de la nómina',
          nom ? (nom.nombre_archivo + ' se leyó bien pero no trae ningún renglón') : 'no se soltó ningún archivo',
          'Suelta el .txt que se va a subir al banco. Sin él no se puede validar a quién se le paga.');
      return { hallazgos: H, resumen: null };
    }

    var conCod = (parsed.empleados || []).map(function (e) {
      return { quien: e.cod + ' ' + e.nombre, nombre: e.nombre, c: cent(e.neto), fila: e.fila, cod: e.cod };
    });
    var sinCod = (parsed.trio || []).map(function (t) {
      return { quien: t.nombre, nombre: t.nombre, c: cent(t.neto), fila: t.fila, empleado_id: t.empleado_id };
    });

    var sConCod = conCod.reduce(function (a, x) { return a + x.c; }, 0);
    var sSinCod = sinCod.reduce(function (a, x) { return a + x.c; }, 0);
    var sNom = nom.total_centavos;
    var sHon = hon ? hon.total_centavos : 0;
    var totalGral = parsed.total_gral ? cent(parsed.total_gral.neto) : null;

    /* ── Nivel 1 · las tres identidades ─────────────────────────────────── */
    if (sNom !== sConCod) {
      add(INTEGRIDAD, 'TXT_TOTAL_NO_CUADRA',
          'La suma del archivo de dispersión no es la del Excel',
          'TXT ' + pesos(sNom) + ' (' + nom.renglones.length + ' renglones) · Excel ' +
            pesos(sConCod) + ' (' + conCod.length + ' con código) · diferencia ' + pesos(sNom - sConCod),
          'No mandes nada. Si la diferencia es el neto de una persona, sobra o falta su renglón; si no, hay un importe distinto.');
    }
    if (sinCod.length && !hon) {
      add(REVISION, 'TXT_HONORARIOS_AUSENTE',
          'El Excel trae renglones de honorarios y no se cargó su archivo de dispersión',
          sinCod.length + ' renglón(es) sin código por ' + pesos(sSinCod) + ' · ' +
            sinCod.map(function (x) { return x.nombre; }).join(', '),
          'Súbelo también: a esas personas se les paga con un .txt aparte y hoy nada comprueba su monto.');
    }
    if (hon && sHon !== sSinCod) {
      add(INTEGRIDAD, 'TXT_HONORARIOS_NO_CUADRA',
          'El archivo de honorarios no cuadra con los renglones sin código del Excel',
          'TXT ' + pesos(sHon) + ' (' + hon.renglones.length + ' renglones) · Excel ' +
            pesos(sSinCod) + ' (' + sinCod.length + ' sin código) · diferencia ' + pesos(sHon - sSinCod),
          'El archivo de honorarios no declara a qué semana pertenece — ni su nombre es de fiar. Si no cuadra, lo más probable es que sea de otra semana o que le falte alguien.');
    }
    if (totalGral !== null && (sNom + sHon) !== totalGral) {
      add(INTEGRIDAD, 'TXT_SUMA_NO_CUADRA_TOTAL',
          'Los dos archivos juntos no dan el "Total Gral." del Excel',
          'TXT ' + pesos(sNom + sHon) + ' · Total Gral. ' + pesos(totalGral) +
            ' · diferencia ' + pesos(sNom + sHon - totalGral),
          'Se perdió o se coló un renglón entre el Excel y los archivos del banco.');
    }

    /* ── Nivel 1b · persona por persona ─────────────────────────────────── */
    var r1 = aparearPorNombre(nom.renglones, conCod, add, 'la nómina');
    var r2 = hon ? aparearTrio(hon.renglones, sinCod, catalogo, add) : { apareados: 0 };

    return {
      hallazgos: H,
      resumen: {
        nomina:     { renglones: nom.renglones.length, personas_excel: conCod.length,
                      total_txt: sNom, total_excel: sConCod, cuadra: sNom === sConCod,
                      apareados: r1.apareados },
        honorarios: hon ? { renglones: hon.renglones.length, personas_excel: sinCod.length,
                      total_txt: sHon, total_excel: sSinCod, cuadra: sHon === sSinCod,
                      apareados: r2.apareados } : null,
        total_gral: totalGral,
        cuadra_todo: sNom === sConCod && sHon === sSinCod &&
                     (totalGral === null || (sNom + sHon) === totalGral)
      }
    };
  }

  // Apareo uno a uno. Cada persona del Excel se consume al aparear: si dos
  // renglones del TXT cayeran sobre la misma, el segundo queda huérfano y se
  // reporta, en vez de pasar desapercibido.
  function aparearPorNombre(renglones, personas, add, deQue) {
    var libres = personas.map(function (p) { return { p: p, k: bolsa(p.nombre), usada: false }; });
    var apareados = 0;

    renglones.forEach(function (f) {
      var k = bolsa(f.nombre);
      var cand = libres.filter(function (x) { return !x.usada && x.k === k; });
      if (cand.length > 1) {
        add(REVISION, 'TXT_NOMBRE_AMBIGUO',
            'Un renglón del archivo apareó con más de una persona del Excel',
            'renglón ' + f.n + ' "' + f.nombre + '" · ' + cand.length + ' coincidencias',
            'Dos personas con el mismo nombre en ' + deQue + '. Revísalo a mano antes de mandar.');
        return;
      }
      if (!cand.length) {
        add(INTEGRIDAD, 'TXT_RENGLON_HUERFANO',
            'Hay un renglón en el archivo del banco que no corresponde a nadie del Excel',
            'renglón ' + f.n + ' "' + f.nombre + '" por ' + pesos(f.centavos) + ' · cuenta …' + f.cuenta_ult4,
            'Se le va a pagar a alguien que no está en la nómina de esta semana. No mandes el archivo.');
        return;
      }
      cand[0].usada = true; apareados++;
      if (cand[0].p.c !== f.centavos) {
        add(INTEGRIDAD, 'TXT_IMPORTE_DISTINTO',
            'A alguien se le va a transferir un importe distinto al de su renglón del Excel',
            cand[0].p.quien + ' · TXT ' + pesos(f.centavos) + ' · Excel ' + pesos(cand[0].p.c) +
              ' (fila ' + cand[0].p.fila + ') · diferencia ' + pesos(f.centavos - cand[0].p.c),
            'No mandes el archivo. El Excel ya está validado: lo que hay que corregir es el .txt.');
      }
    });

    libres.filter(function (x) { return !x.usada; }).forEach(function (x) {
      /* ── Un neto de CERO no es un renglón que falta ──────────────────────
         Son dos cosas distintas y piden cosas distintas: «falta un renglón»
         manda a buscar un error, «su neto es cero» no pide nada. Pasa de
         verdad: a quien se le descuenta todo lo que gana —dos préstamos, por
         ejemplo— le queda cero, y entonces NO debe haber transferencia. El
         banco no mueve cero pesos.
         La suma no lo nota (un cero no cambia un total), así que si esto se
         reportara como falta sería un hallazgo de INTEGRIDAD que frena una
         semana correcta. Se dice como AVISO, que informa y no detiene. */
      if (x.p.c === 0) {
        add(AVISO, 'TXT_NETO_CERO',
            'A alguien le tocó cero esta semana, así que no lleva renglón en el banco',
            x.p.quien + ' · neto ' + pesos(0) + ' (fila ' + x.p.fila + ')',
            'No hay nada que hacer: es correcto que no aparezca. Ocurre cuando las deducciones se comen todo el neto.');
        return;
      }
      add(INTEGRIDAD, 'TXT_SIN_RENGLON',
          'Hay alguien en el Excel que no tiene renglón en el archivo del banco',
          x.p.quien + ' · ' + pesos(x.p.c) + ' (fila ' + x.p.fila + ')',
          'Esa persona no va a recibir su pago. Verifica con Ulises antes de mandar.');
    });

    return { apareados: apareados };
  }

  // El trío no se aparea por nombre literal —el Excel los pone de pila y el TXT
  // completos— sino por la tabla de alias del catálogo, por subconjunto de palabras.
  function aparearTrio(renglones, personas, catalogo, add) {
    var libres = personas.map(function (p) { return { p: p, usada: false }; });
    var apareados = 0;

    renglones.forEach(function (f) {
      var rt = resolverTrio(f.nombre, catalogo);
      if (rt.ids.length > 1) {
        add(REVISION, 'TXT_TRIO_AMBIGUO',
            'Un renglón de honorarios apareó con más de una persona del catálogo',
            'renglón ' + f.n + ' "' + f.nombre + '" · ids ' + rt.ids.join(', '),
            'Los alias del trío se traslapan. Corrige la tabla en shared/operaciones/contpaqi_conceptos.json.');
        return;
      }
      var cand = rt.unico === null ? []
        : libres.filter(function (x) { return !x.usada && x.p.empleado_id === rt.unico; });
      if (!cand.length) {
        add(INTEGRIDAD, 'TXT_HONORARIOS_HUERFANO',
            'Hay un renglón de honorarios que no corresponde a nadie de la cola del Excel',
            'renglón ' + f.n + ' "' + f.nombre + '" por ' + pesos(f.centavos) +
              (rt.unico === null ? ' · no coincide con ningún alias del trío' : ' · id ' + rt.unico + ' no está en el Excel'),
            rt.unico === null
              ? 'Si es alguien nuevo que factura, agrégalo al trío en el catálogo. Si no, el archivo es de otra semana.'
              : 'Esa persona no viene en el Excel de esta semana. Lo más probable es que el archivo sea de otra semana.');
        return;
      }
      cand[0].usada = true; apareados++;
      if (cand[0].p.c !== f.centavos) {
        add(INTEGRIDAD, 'TXT_IMPORTE_DISTINTO',
            'A alguien de honorarios se le va a transferir un importe distinto al del Excel',
            cand[0].p.quien + ' · TXT ' + pesos(f.centavos) + ' · Excel ' + pesos(cand[0].p.c) +
              ' (fila ' + cand[0].p.fila + ') · diferencia ' + pesos(f.centavos - cand[0].p.c),
            'No mandes el archivo. Corrige el .txt de honorarios.');
      }
    });

    libres.filter(function (x) { return !x.usada; }).forEach(function (x) {
      if (x.p.c === 0) {
        add(AVISO, 'TXT_NETO_CERO',
            'A alguien de honorarios le tocó cero esta semana, así que no lleva renglón',
            x.p.quien + ' · neto ' + pesos(0) + ' (fila ' + x.p.fila + ')',
            'No hay nada que hacer: es correcto que no aparezca.');
        return;
      }
      add(INTEGRIDAD, 'TXT_HONORARIOS_SIN_RENGLON',
          'Hay alguien de honorarios en el Excel sin renglón en su archivo del banco',
          x.p.quien + ' · ' + pesos(x.p.c) + ' (fila ' + x.p.fila + ')',
          'Esa persona no va a recibir su pago. Es el caso que el nombre del archivo no delata: puede llamarse como tres y pagarle a dos.');
    });

    return { apareados: apareados };
  }

  function contar(hallazgos, nivel) {
    var n = 0;
    for (var i = 0; i < hallazgos.length; i++) if (hallazgos[i].nivel === nivel) n++;
    return n;
  }

  return {
    leer: leer, cruzar: cruzar, contar: contar,
    resolverTrio: resolverTrio, norm: norm, bolsa: bolsa, pesos: pesos, cent: cent,
    ANCHO: ANCHO, BYTES_POR_RENGLON: BYTES_POR_RENGLON, CAMPO: CAMPO,
    NIVELES: { INTEGRIDAD: INTEGRIDAD, REVISION: REVISION, AVISO: AVISO }
  };
});
