/* ═══ Machote · motor de cálculo ═══
 *
 * Reconstruido el 2026-09-03 sobre la estructura REAL del machote de FTS,
 * leída de SharePoint. Ver docs/comercial/MACHOTE-ESTRUCTURA-REAL.md.
 *
 * La diferencia de fondo con la versión anterior: el margen NO es un
 * porcentaje global sobre el total, es un MULTIPLICADOR por concepto que se
 * aplica renglón por renglón. El precio se construye desde abajo.
 *
 * Todo número que se ve en pantalla sale de aquí.
 */
(function (G) {
  'use strict';

  /* El motor DECLARA su versión, y no por documentación: es lo que permite
   * detectar que la pantalla está corriendo media versión. `app.js` la compara
   * con la suya y, si no coinciden, lo dice en vez de calcular con un motor
   * que no es el que espera. Se bumpea junto con `const VERSION_ARCHIVO` de
   * `app.js`, el `?v=` de `index.html` y `version.json` — hay una prueba que
   * falla si los cuatro se separan. */
  const VERSION = 'V1.28';

  const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;
  const vacio = (v) => v === null || v === undefined || v === '';

  /* ── Los diez renglones fijos de mano de obra ──────────────────────────
   * Son los del machote, con sus tarifas de plantilla. El capturista pisa la
   * tarifa; los renglones no se agregan ni se quitan.
   * `mult` dice de qué celda de la tabla de márgenes sale el multiplicador. */
  const ROLES = [
    { id: 'diseno',          grupo: 'diseno', label: 'Diseño',                    pu: 200, mult: 'mano_obra' },
    { id: 'programador',     grupo: 'diseno', label: 'Programador',               pu: 300, mult: 'programador' },
    { id: 'supervisor_sr',   grupo: 'planta', label: 'Supervisor Sr',             pu: 200, mult: 'mano_obra' },
    { id: 'supervisor_jr',   grupo: 'planta', label: 'Supervisor Jr · seguridad', pu: 140, mult: 'mano_obra' },
    { id: 'tecnicos',        grupo: 'planta', label: 'Técnicos',                  pu: 140, mult: 'mano_obra' },
    { id: 'he_supervisor',   grupo: 'extras', label: 'Horas extras supervisor',   pu: 200, mult: 'extra' },
    { id: 'he_jr',           grupo: 'extras', label: 'Horas extras Jr · seguridad', pu: 140, mult: 'extra' },
    { id: 'he_tecnicos',     grupo: 'extras', label: 'Horas extras técnicos',     pu: 140, mult: 'extra' },
    { id: 'he_programador',  grupo: 'extras', label: 'Horas extras programador',  pu: 300, mult: 'extra' },
    { id: 'he_diseno',       grupo: 'extras', label: 'Horas extras diseño',       pu: 140, mult: 'extra' },

    /* ── V1.26 · viaje y trabajo foráneo (petición de Ricardo) ────────────
     * Ricardo ha cobrado el trabajo de proyectos en Estados Unidos pero NUNCA
     * los días de vuelo, porque no existía dónde ponerlos. No era un cálculo
     * mal hecho: era un concepto que el machote no tenía.
     *
     * Los tres van en mano de obra y con el multiplicador de mano de obra
     * —«salen de la misma cuenta», dijo Ricardo— y lo que cambia es la TARIFA,
     * que se captura renglón por renglón como cualquier otra.
     *
     * `pu: null` a propósito en los tres: **no se inventa una tarifa**. Un día
     * de viaje no vale 140 ni 200; lo decide quien cotiza, y mientras no lo
     * escriba la regla `mo-sin-tarifa` lo reclama, que es justo lo que debe
     * pasar. Poner un número de relleno sería peor que no tener el renglón. */
    { id: 'dias_viaje',   grupo: 'viaje', label: 'Días de viaje',           pu: null, mult: 'mano_obra',
      unidad: 'Días', dias: true,
      ayuda: 'El día de vuelo o traslado. Se paga distinto del día trabajado; la tarifa y la moneda se capturan aquí.' },
    { id: 'hrs_finde',    grupo: 'viaje', label: 'Horas en fin de semana',  pu: null, mult: 'mano_obra',
      recargo: 'fin_semana',
      ayuda: 'Sábado y domingo. El recargo SOLO se aplica cuando se ejecuta en Estados Unidos.' },
    { id: 'hrs_festivo',  grupo: 'viaje', label: 'Horas en día festivo',    pu: null, mult: 'mano_obra',
      recargo: 'festivo',
      ayuda: 'El recargo de días festivos NO está confirmado: nace en cero y quien cotiza lo escribe.' }
  ];
  const ROL = {};
  ROLES.forEach(r => { ROL[r.id] = r; });

  const GRUPOS = [
    { id: 'diseno', label: 'Diseño y Programación' },
    { id: 'planta', label: 'En Planta' },
    { id: 'extras', label: 'Extras' },
    { id: 'viaje',  label: 'Viaje y trabajo foráneo' }
  ];

  /* Valores de la plantilla original (Machote general MXN - SO.xlsx).
   * Programador y mano de obra no variaron en ninguno de los 8 ejemplares
   * leídos; materiales y servicios sí, por eso son campos y no constantes. */
  const MARGENES_PLANTILLA = { programador: 4.4, mano_obra: 2.5, materiales: 1.8, servicios: 1.7 };

  /* ── V1.28 · LOS RECARGOS DE ARRANQUE ─────────────────────────────────────
   *
   * El 30% vivía incrustado DOS veces en el código (en `machoteNuevo` y en el
   * respaldo de `viajeDe`). Sale aquí por lo mismo que los multiplicadores:
   * un valor de arranque que alguien va a querer mover con el tiempo tiene
   * que estar en un solo lugar y a la vista, no repartido entre funciones.
   *
   * `fin_semana: 0.30` — «alrededor de 30% más la hora», dicho por Ricardo.
   * `festivo: null`    — SIN CONFIRMAR, a propósito. Nace vacío y quien cotiza
   *                      lo escribe; inventarle un número sería cobrarle al
   *                      cliente una regla que nadie acordó.
   *
   * Los dos SÓLO aplican cuando el trabajo se ejecuta en Estados Unidos: es
   * una regla laboral de allá, no una consecuencia de viajar (ver `recargoDe`).
   * El alcance de lo que se captura encima es LA SECCIÓN, no el machote. */
  const RECARGOS_PLANTILLA = { fin_semana: 0.30, festivo: null };
  const COMISION_FTS_PLANTILLA = 0.055;
  const MARGEN_DESEADO_PLANTILLA = 0.40;
  const REPARTO_PLANTILLA = { venta: 0.73, operaciones: 0.27 };
  const MAX_SECCIONES = 10;

  /* `Viaje` entra en V1.26 como TERCER tipo, no como un bloque aparte: reusa
   * la misma retícula de captura (descripción, unidad, moneda, fuente) que
   * los otros dos, y así no hay una segunda forma de capturar un gasto.
   *
   * Lo que lo distingue es el multiplicador: **siempre 1**. Hotel, gasolina,
   * taxis y vuelos se cobran a costo. Es regla del negocio, no una opción, y
   * por eso vive en el motor y no en un campo que alguien pueda mover. */
  const TIPOS = ['Materiales', 'Servicios', 'Viaje'];
  const TIPO_VIAJE = 'Viaje';

  /** Los conceptos de viaje que se ofrecen al elegir. Se ELIGEN: no aparecen
   *  todos siempre, porque una cotización local no tiene por qué cargar cinco
   *  renglones vacíos de vuelos y hotel. */
  const CONCEPTOS_VIAJE = [
    { id: 'vuelos',   label: 'Vuelos',            unidad: 'Vuelo' },
    { id: 'hotel',    label: 'Hotel',             unidad: 'Noche' },
    { id: 'viaticos', label: 'Viáticos',          unidad: 'Día' },
    { id: 'taxis',    label: 'Taxis y traslados', unidad: 'Servicio' },
    { id: 'gasolina', label: 'Gasolina',          unidad: 'Servicio' }
  ];

  /* ── V1.27 · los cinco conceptos de viaje, SIEMPRE a la vista ─────────
   *
   * Antes había que AGREGARLOS con un botón, y lo que hay que agregar es
   * exactamente lo que se olvida: en Albuquerque se cobró el trabajo y no el
   * hotel ni los viáticos. Un renglón en cero que se ve es un recordatorio;
   * uno que hay que agregar es una omisión esperando.
   *
   * El cambio obliga a mover el candado, y es la parte importante: con los
   * cinco puestos, el revisador ya NO puede exigir «que existan» —existen
   * siempre—. Lo que exige ahora es que cada uno esté RESUELTO: con importe, o
   * marcado explícitamente como que no se ocupa.
   *
   * Es más estricto que antes, no menos. La regla vieja se conformaba con UN
   * renglón de viaje: un vuelo capturado la satisfacía y el hotel olvidado
   * pasaba igual — que es literalmente lo que ocurrió en Albuquerque.
   *
   * ⚠️ Esta función NO muta el documento: el motor no escribe. Un concepto que
   * todavía no existe como renglón cuenta como NO resuelto, así que la regla
   * es correcta desde antes de que la pantalla siembre los renglones. */
  function conceptosViaje(m, s) {
    const porId = {};
    (s && s.partidas || []).forEach((l, i) => {
      if (!l || l.tipo !== TIPO_VIAJE) return;
      // `concepto` es de V1.27. Los renglones que V1.26 creó con el botón sólo
      // traen la etiqueta, así que se reconocen por ella.
      const id = l.concepto || null;
      const porTexto = CONCEPTOS_VIAJE.filter(c => llano(c.label) === llano(l.descripcion))[0];
      const k = id || (porTexto && porTexto.id);
      if (k && porId[k] === undefined) porId[k] = i;
    });

    return CONCEPTOS_VIAJE.map(cpt => {
      const idx = porId[cpt.id];
      const l = (idx === undefined) ? null : s.partidas[idx];
      const tieneValor = !!(l && num(l.qty) > 0 && !vacio(l.pu) && num(l.pu) !== 0);
      const confirmado = !!(l && l.no_aplica === true);
      return {
        id: cpt.id, label: cpt.label, unidad: cpt.unidad,
        idx: (idx === undefined) ? -1 : idx,
        existe: !!l, tieneValor, confirmado,
        // Resuelto = alguien decidió. Con importe o con un «no se ocupa».
        resuelto: tieneValor || confirmado
      };
    });
  }

  /** ¿Alguien escribió algo en este renglón de materiales?
   *  Definición ÚNICA: la usan el motor, las reglas y la pantalla. Estaba
   *  escrita tres veces —dos aquí y una en `reglas.js`— y con matices distintos;
   *  tres definiciones de lo mismo terminan divergiendo. */
  /* ⚠️ V1.27 · un renglón marcado «no se ocupa» NO está capturado a medias:
   * está DECIDIDO. Sin esta salvedad, marcar los conceptos de viaje en cero
   * cambiaba un bloqueo por otro —`partida-sin-precio` y `partida-sin-tipo`
   * se disparaban sobre el renglón que acababa de resolverse—, y un candado
   * que sólo se puede satisfacer inventando un importe enseña a inventar
   * importes. */
  const usadaPartida = (l) => !!l && l.no_aplica !== true &&
    (num(l.qty) > 0 || !vacio(l.pu) || !!l.descripcion);

  /** ¿Este renglón está CAPTURADO? Es lo que lo pinta de verde.
   *  Cantidad **y** precio: con sólo la cantidad, el renglón está a medias y
   *  no aporta un peso al total. Pintarlo verde diría "listo" de algo que
   *  todavía no suma. Vale igual para mano de obra (horas × tarifa). */
  const capturada = (l) => !!l && num(l.qty) > 0 && num(l.pu) > 0;

  /* Cuántos renglones de materiales trae una sección recién creada.
   *
   * El machote real trae **~180 en blanco** por sección (§2.4 del levantamiento):
   * el capturista llena hacia abajo y el resto queda vacío. Ciento ochenta
   * renglones vacíos en una pantalla no son fidelidad, son un muro — y en
   * teléfono, donde cada renglón es una tarjeta, son ciento ochenta tarjetas.
   * Treinta cubren de sobra lo que se ve en el acervo, y «+ partida» agrega
   * más sin límite. */
  const PARTIDAS_EN_BLANCO = 30;

  /* Los equipos de la plantilla, a 0,25 cada uno = 100%. Un machote nuevo nace
   * CUADRADO a propósito: si naciera con el reparto vacío, la regla dura de
   * "las comisiones no suman 100%" saltaría desde el primer segundo, y una
   * alerta que sale siempre deja de leerse. */
  const EQUIPO_VENTA_PLANTILLA = () => ([
    { nombre: 'ALDO',  pct: 0.25 }, { nombre: 'ANGEL', pct: 0.25 },
    { nombre: 'DIEGO', pct: 0.25 }, { nombre: 'MONTY', pct: 0.25 }
  ]);
  const EQUIPO_OPS_PLANTILLA = () => ([
    { nombre: 'SUPERVISOR FTS', pct: 0.25 }, { nombre: 'SEGURIDAD', pct: 0.25 },
    { nombre: 'TECNICO 1', pct: 0.25 }, { nombre: 'TECNICO 2', pct: 0.25 }
  ]);

  /* Las dos empresas y su moneda. Verificado contra Odoo: de las 711 órdenes
   * con machote, 594 son de SERVICIOS FTS (company 1, MXN) y 117 de FTS FULL
   * TECHNOLOGY SYSTEMS LLC (company 6, USD). La moneda del documento nace de
   * la empresa; el capturista la puede cambiar, y cada renglón la suya. */
  const EMPRESAS = [
    { id: 1, nombre: 'Servicios FTS', corto: 'FTS México', moneda: 'MXN' },
    { id: 6, nombre: 'FTS Full Technology Systems LLC', corto: 'FTS USA', moneda: 'USD' }
  ];
  /* ── Fábrica de machotes y secciones en blanco ─────────────────────────
   *
   * Vive en el MOTOR y no en los datos de ejemplo: un machote nuevo tiene que
   * nacer con exactamente la misma forma que los que ya existen, y esa forma
   * la define quien la consume. Si la fábrica viviera en `demo.js`, crear uno
   * de verdad dependería del archivo de datos falsos.
   */

  /** Una sección en blanco: los diez renglones de mano de obra con su tarifa
   *  de plantilla y las horas en cero, y `PARTIDAS_EN_BLANCO` renglones de
   *  materiales vacíos, listos para llenar hacia abajo como en el Excel. */
  function seccionNueva(nombre, moneda, base) {
    moneda = moneda || 'MXN';
    const mo = ROLES.map(r => ({
      rol: r.id,
      qty: '',          // horas: en cero, es lo que se captura
      personas: 1,
      pu: r.pu,         // la tarifa de plantilla, que el capturista puede pisar
      moneda: moneda
    }));
    /* Los diez primeros vienen preparados: cinco Materiales y cinco Servicios,
     * en Pieza y con cantidad 0. No es un dato, es un ANDAMIO — arranca la
     * captura sin obligar a elegir Tipo y Unidad diez veces antes de escribir
     * la primera descripción. Con cantidad 0 no cuentan como usados, así que
     * no disparan hallazgos ni se pintan de verde. Del once al treinta van
     * completamente en blanco, como en el Excel. */
    const partidas = [];
    for (let i = 0; i < PARTIDAS_EN_BLANCO; i++) {
      const preparada = i < 10;
      partidas.push({
        qty: preparada ? 0 : '',
        unidad: preparada ? 'Pieza' : '',
        tipo: preparada ? (i < 5 ? 'Materiales' : 'Servicios') : '',
        descripcion: '', modelo: '', marca: '',
        pu: null, moneda: moneda,
        margen: null, link: '', comentario: ''
      });
    }
    return { id: 's-' + Date.now() + '-' + Math.round(Math.random() * 1e6),
             nombre: nombre || 'SECCIÓN 1',
             // COPIA, no referencia: dos secciones que compartieran el mismo
             // objeto volverían al bug que este cambio arregla, y en silencio.
             margenes: Object.assign({}, MARGENES_PLANTILLA, base || {}),
             mo: mo, partidas: partidas };
  }

  /** Un machote en blanco, con su hoja DESGLOSE (que siempre existe, no es una
   *  sección) y UNA sección lista para capturar. */
  function machoteNuevo(d) {
    d = d || {};
    const empresa = EMPRESAS.find(e => e.id === Number(d.empresa_id)) || EMPRESAS[0];
    const hoy = new Date();
    const iso = hoy.getFullYear() + '-' +
                String(hoy.getMonth() + 1).padStart(2, '0') + '-' +
                String(hoy.getDate()).padStart(2, '0');
    return {
      id: d.id || ('M-' + Date.now()),
      nombre: d.nombre || 'Cotización sin nombre',
      // `cliente_id` es LO QUE MANDA: el nombre se lee de Odoo al pintar.
      // `cliente` queda como respaldo para cuando Odoo no conteste, y como
      // el único dato de los machotes que nacieron antes del catálogo.
      cliente: d.cliente || '',
      /* QUIÉN lo capturó, del token de la sesión. Hasta V1.16 esto quedaba
       * vacío en TODO machote real —`vNuevo()` no lo pasaba— y por eso lo
       * capturado hoy no dice de quién es. Es requisito del almacén
       * compartido: sin autor, Postgres no sabe de quién es cada machote.
       *
       * A los que ya nacieron sin él NO se les inventa uno: quedan vacíos y
       * se resuelven al importar, donde sí se sabe quién mandó el archivo. */
      creado_por: d.creado_por || '',
      creado_por_nombre: d.creado_por_nombre || '',
      creado_at: d.creado_at || new Date().toISOString(),
      cliente_id: (typeof d.cliente_id === 'number') ? d.cliente_id : null,
      so: d.so || null,
      estado: 'borrador',
      analista: d.analista || '',
      fecha: iso,
      empresa_id: empresa.id,
      moneda: empresa.moneda,
      tc: 0, factor_proteccion: 0, tc_fuente: '',
      margenes: Object.assign({}, MARGENES_PLANTILLA),
      comision_fts: COMISION_FTS_PLANTILLA,
      comision_cliente: 0,
      margen_deseado: MARGEN_DESEADO_PLANTILLA,
      escenario: 'margen_deseado',
      reparto: Object.assign({}, REPARTO_PLANTILLA),
      equipo_venta: EQUIPO_VENTA_PLANTILLA(),
      equipo_operaciones: EQUIPO_OPS_PLANTILLA(),
      equipo_cliente: [{ nombre: 'Contacto cliente 1', pct: 1 }],
      diagnostico: { tipo: '', respuestas: {} },
      /* ── Dónde se ejecuta (V1.26) ────────────────────────────────────────
       * Monterrey PRESELECCIONADO, que es la decisión de Esteban: es la sede y
       * es el caso de la enorme mayoría. Lo que NO se hace es preseleccionarlo
       * en la pantalla dejando el dato vacío por dentro — eso sería enseñar
       * «Monterrey» y guardar nada. Nace escrito, y quien cotice en otro lado
       * lo cambia.
       *
       * A los machotes que nacieron ANTES de este campo no se les rellena:
       * llegan sin `pais` y la regla dura los manda a escribirlo. */
      pais: d.pais || SEDE.pais,
      region: d.region || SEDE.region,
      ciudad: d.ciudad || SEDE.ciudad,
      viaje: {
        // «No se ocupan conceptos de viaje», la salida explícita del bloqueo.
        no_aplica: false,
        /* ⚠️ V1.28 · los recargos YA NO se escriben aquí. Vivían en este objeto
         * como 0.30 y null, y eso los ataba al machote entero. Ahora el valor
         * de arranque está en `RECARGOS_PLANTILLA` y lo que se captura encima
         * es de LA SECCIÓN (ver `recargosDe`). Un machote nuevo no trae número
         * propio: lee el de plantilla, igual en todas sus secciones.
         *
         * Esta capa se sigue LEYENDO —los machotes capturados antes de V1.28
         * sí traen su `recargo_fin_semana` aquí y tienen que seguir valiendo—
         * pero ya nadie la escribe. */
        paga_dias: 'mx'             // hoy; la decisión está abierta
      },
      secciones: [seccionNueva('SECCIÓN 1', empresa.moneda, MARGENES_PLANTILLA)]
    };
  }

  /* ── DÓNDE SE EJECUTA (V1.26) ───────────────────────────────────────────
   *
   * La pieza que amarra todo lo de viaje, propuesta por Esteban: el machote
   * OBLIGA a decir país y ciudad, y de ahí sale solo si la cotización es
   * foránea. La razón, textual: «si a alguien se le olvida el vuelo, también
   * se le va a olvidar marcar que es foráneo». Que lo detecte el sistema.
   *
   * ⚠️ V1.27 · LA SEDE ES NUEVO LEÓN, NO MONTERREY. Corrección de Montalvo
   * sobre el uso real: lo local es el ESTADO. Santa Catarina, García y Apodaca
   * son locales aunque no sean Monterrey; Saltillo es foráneo aunque quede más
   * cerca que varios municipios del área metropolitana. Cualquier otro estado
   * de México —y cualquier otro país— lleva viáticos.
   *
   * La ciudad se sigue capturando y se sigue usando (nombra el lugar en los
   * avisos y arma la búsqueda de vuelos), pero **no decide**.
   *
   * ⚠️ Un machote SIN lugar no es foráneo ni local: es un machote al que le
   * falta el dato, y así lo trata todo lo de abajo. Los 8 que ya existen
   * nacieron antes de este campo y **no se les inventa un valor**; la regla
   * dura `sin-lugar-ejecucion` los manda a escribirlo, que es un clic. */
  /* ⚠️ La subdivisión se llama `region`, NO `estado`. `m.estado` ya existe en
   * el machote desde V1.07 y significa OTRA COSA: borrador / en revisión /
   * enviado a Odoo. La primera versión de esto usó `estado` y en la captura se
   * vio el campo diciendo «borrador» — y peor, elegir «Texas» habría puesto el
   * machote en estado «Texas» y roto el flujo entero, en silencio.
   *
   * Es el mismo choque que el de `.kpi` en V1.22 (CLAUDE.md §20 #12), pero en
   * un campo de DATOS en vez de una clase de CSS. La etiqueta en pantalla sigue
   * diciendo «Estado», que es como se le llama; el campo se llama distinto. */
  const SEDE = { pais: 'MX', region: 'Nuevo León', ciudad: 'Monterrey' };

  /** Sin acentos, sin mayúsculas y sin espacios de sobra. «MONTERREY  » y
   *  «Montérrey» son la misma ciudad, y quien captura no tiene por qué saber
   *  cuál de las dos escribió. */
  function llano(x) {
    return String(x === null || x === undefined ? '' : x)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim().toLowerCase();
  }

  /* ⚠️ V1.27 · para decidir si es foránea hace falta el ESTADO, no la ciudad.
   * Corrección de Montalvo: lo local es Nuevo León entero, no Monterrey. Sin
   * estado no se puede juzgar, así que el estado entra en `tieneLugar` — si
   * no, un machote con «México / (vacío) / Saltillo» se leería como local. */
  const tieneLugar = (m) => !!(m && llano(m.pais) && llano(m.region) && llano(m.ciudad));

  /** ¿Se ejecuta fuera de la sede? La sede es **el estado de Nuevo León**, no
   *  la ciudad de Monterrey (corrección de Montalvo, 11-sep): un trabajo en
   *  Santa Catarina o en García no lleva viáticos, y uno en Saltillo sí,
   *  aunque esté más cerca que algunos municipios del área metropolitana.
   *
   *  `false` cuando falta el dato — la falta la reclama su propia regla, y
   *  suponer «foránea» por un campo vacío bloquearía a los machotes viejos por
   *  algo que nadie escribió. */
  function esForaneo(m) {
    if (!tieneLugar(m)) return false;
    return llano(m.pais) !== llano(SEDE.pais) || llano(m.region) !== llano(SEDE.region);
  }

  const esEUA = (m) => llano(m && m.pais) === 'us';

  /** El bloque de viaje del machote, con sus valores por omisión. */
  function viajeDe(m) {
    const v = (m && m.viaje) || {};
    return {
      no_aplica: v.no_aplica === true,
      /* ⚠️ V1.28 · estos dos ya NO son la respuesta: son la CAPA DEL MACHOTE.
       * Lo que vale es lo que devuelve `recargosDe(m, s)`, que los resuelve
       * contra la sección. Se dejan aquí, crudos y sin valor de relleno, para
       * que esa función los lea — y `undefined` significa «este machote no
       * trae número propio», que es distinto de «trae cero». */
      recargo_fin_semana: (v.recargo_fin_semana === undefined || v.recargo_fin_semana === null)
        ? undefined : num(v.recargo_fin_semana),
      recargo_festivo: (v.recargo_festivo === undefined || v.recargo_festivo === null)
        ? undefined : num(v.recargo_festivo),
      // Quién paga los días de viaje. DECISIÓN DE NEGOCIO ABIERTA (ver
      // docs/comercial/VIAJE.md): hoy es pago mexicano; Esteban planteó que
      // debería pagarlos la LLC, con tarifa más básica pero en dólares. El
      // machote NO decide eso: lo REGISTRA, para que se sepa cuál se usó.
      paga_dias: v.paga_dias || 'mx'
    };
  }

  const PAGA_DIAS = [
    { id: 'mx',  label: 'Servicios FTS (México)', nota: 'Como se ha pagado hasta hoy.' },
    { id: 'llc', label: 'FTS USA (LLC)',          nota: 'Propuesta de Esteban: es quien mueve a la gente.' }
  ];

  /** ── V1.28 · LOS RECARGOS DE UNA SECCIÓN, YA RESUELTOS ──────────────────
   *
   *  Tres capas, **las mismas que los multiplicadores**: plantilla ← machote
   *  ← sección. No es una simetría decorativa; es lo que hace que este cambio
   *  no rompa nada. Un machote capturado antes de V1.28 trae su número en
   *  `m.viaje.recargo_fin_semana` y lo sigue leyendo en todas sus secciones,
   *  exactamente igual que antes. Nada que migrar, y ningún valor inventado
   *  cayendo encima de lo que alguien ya decidió.
   *
   *  **La sección manda y NO se propaga.** Mover el recargo en una sección no
   *  toca a las demás, ni al machote, ni al valor de arranque: es del tramo de
   *  trabajo, no del proyecto. Un mismo proyecto puede tener una sección que
   *  se trabaja en fin de semana y otra que no.
   *
   *  `apartado` dice si el número vigente se separó del de plantilla. Como el
   *  recargo mueve el margen, esa separación tiene que VERSE —igual que un
   *  margen escrito a mano encima de la fórmula—, y no basta con guardarla.
   *  Se compara el VALOR contra la plantilla y no la mera presencia del campo:
   *  un machote de V1.27 trae 0.30 escrito, y eso no es haberse apartado de
   *  nada. */
  function recargosDe(m, s) {
    const v = viajeDe(m);
    const sec = (s && s.recargos) || {};
    function capa(clave, delMachote) {
      const deSeccion = sec[clave];
      let pct, origen;
      if (deSeccion !== undefined && deSeccion !== null) { pct = num(deSeccion); origen = 'seccion'; }
      else if (delMachote !== undefined && delMachote !== null) { pct = num(delMachote); origen = 'machote'; }
      else { pct = RECARGOS_PLANTILLA[clave]; origen = 'plantilla'; }
      const base = RECARGOS_PLANTILLA[clave];
      return {
        pct: pct,
        origen: origen,
        porDefecto: base,
        // `null` (festivo sin confirmar) contra un número SÍ es apartarse.
        apartado: (pct === null || base === null) ? (pct !== base) : (num(pct) !== num(base))
      };
    }
    return { fin_semana: capa('fin_semana', v.recargo_fin_semana),
             festivo:    capa('festivo',    v.recargo_festivo) };
  }

  /** El recargo que le toca a un renglón, y por qué. Devuelve el porqué junto
   *  con el número para que la pantalla pueda decir «no aplica: es regla de
   *  Estados Unidos» en vez de enseñar un cero sin explicación.
   *
   *  V1.28 recibe la SECCIÓN. Sin ella resuelve con machote+plantilla, que es
   *  lo que hacía antes: los llamadores viejos siguen dando el mismo número. */
  function recargoDe(rol, m, s) {
    if (!rol || !rol.recargo) return { pct: 0, aplica: false, motivo: null, apartado: false };
    if (!esEUA(m)) {
      return { pct: 0, aplica: false, apartado: false,
        motivo: 'Sólo aplica cuando se ejecuta en Estados Unidos.' };
    }
    const r = recargosDe(m, s)[rol.recargo === 'festivo' ? 'festivo' : 'fin_semana'];
    if (r.pct === null) {
      return { pct: 0, aplica: false, apartado: false,
        motivo: 'Sin confirmar: escribe el recargo de días festivos.' };
    }
    return { pct: r.pct, aplica: num(r.pct) > 0, motivo: null,
             origen: r.origen, apartado: r.apartado, porDefecto: r.porDefecto };
  }

  const empresaDe = (m) => EMPRESAS.find(e => e.id === Number(m && m.empresa_id)) || EMPRESAS[0];
  const monedaPorDefecto = (m) => empresaDe(m).moneda;
  const ESCENARIOS = [
    { id: 'costo',          label: 'Costo' },
    { id: 'con_utilidad',   label: 'Con utilidad' },
    { id: 'margen_deseado', label: 'Margen deseado' }
  ];

  /** Tipo de cambio con el factor de protección aplicado.
   *  Nota: el machote de Excel NO convierte — suma renglones MXN y USD como si
   *  fueran la misma moneda. Aquí sí se convierte, y `mezclaMoneda` avisa. */
  function tcEfectivo(m) {
    return num(m.tc) * (1 + num(m.factor_proteccion));
  }

  function aMonedaDoc(monto, monedaLinea, m) {
    const doc = m.moneda || 'MXN';
    if (!monedaLinea || monedaLinea === doc) return monto;
    if (monedaLinea === 'USD' && doc === 'MXN') return monto * tcEfectivo(m);
    if (monedaLinea === 'MXN' && doc === 'USD') { const t = tcEfectivo(m); return t ? monto / t : 0; }
    return monto;
  }

  /** Los cuatro multiplicadores vigentes de UNA SECCIÓN, ya resueltos.
   *
   *  Se resuelven en tres capas: plantilla ← machote ← sección. Cada sección
   *  manda sobre las de arriba, así que **mover un multiplicador en una
   *  sección NO toca a las demás**: es una decisión de esa parte de la obra
   *  —el suministro no se vende con el mismo multiplicador que la instalación—
   *  y compartirlos hacía que corregir una sección moviera el precio de todas
   *  sin que nadie lo viera.
   *
   *  Lo que sí es del machote entero son las dos COMISIONES (FTS y cliente):
   *  esas se pactan una vez para la cotización, no por sección.
   *
   *  La capa del machote se queda como el valor de arranque, y es lo que
   *  mantiene en pie a los machotes capturados ANTES de este cambio: una
   *  sección sin `margenes` propios sigue leyendo los del machote y muestra
   *  exactamente los mismos números que mostraba. Nada que migrar. */
  function margenes(m, s) {
    const mg = Object.assign({}, MARGENES_PLANTILLA,
                             (m && m.margenes) || {}, (s && s.margenes) || {});
    // El multiplicador de horas extras no se captura: es el de mano de obra
    // por dos. En el Excel es literalmente =$F$3*2.
    mg.extra = num(mg.mano_obra) * 2;
    return mg;
  }

  /** Una línea de mano de obra: tarifa × personas × cantidad.
   *  El costo es tridimensional. Tarifa × horas se queda corto.
   *
   *  V1.26 agrega dos cosas, y las dos mueven dinero:
   *
   *  1. **El recargo** de fin de semana o día festivo, que sube la TARIFA
   *     efectiva. Sólo aplica en Estados Unidos (ver `recargoDe`).
   *  2. **Días que no son horas.** El renglón de días de viaje se captura en
   *     días, así que su cantidad NO puede sumarse a «HORAS PROYECTO»: cinco
   *     días de vuelo entrarían como cinco horas de trabajo y el número de
   *     arriba mentiría en silencio. Se cuentan aparte. */
  function costoMo(linea, m, s) {
    const r = ROL[linea.rol];
    const mg = margenes(m, s);
    const sinTarifa = vacio(linea.pu);
    const puBase = sinTarifa ? 0 : num(linea.pu);
    const rec = recargoDe(r, m, s);
    const pu = puBase * (1 + num(rec.pct));
    const costo = aMonedaDoc(pu * num(linea.personas) * num(linea.qty), linea.moneda, m);
    const mult = r ? num(mg[r.mult]) : 0;
    const cantidad = num(linea.qty) * num(linea.personas);
    const enDias = !!(r && r.dias);
    return {
      costo,
      mult,
      conUtilidad: costo * mult,
      // `horas` deja fuera lo que se captura en días. `cantidad` es lo crudo.
      horas: enDias ? 0 : cantidad,
      dias: enDias ? cantidad : 0,
      cantidad,
      enDias,
      unidad: (r && r.unidad) || 'Horas',
      puBase, puEfectivo: pu, recargo: rec,
      sinTarifa,
      sinRol: !r
    };
  }

  /** Una línea de materiales o servicios. El `tipo` elige el multiplicador:
   *  es la columna que decide el precio. Sin tipo no hay precio.
   *
   *  El machote real permite PISAR ese multiplicador renglón por renglón: en
   *  `SO11737` hay una partida "riel" de $200 marcada como Materiales con
   *  margen 1,5 escrito encima de la fórmula, que es de donde salían $20 de
   *  diferencia contra el archivo. Se respeta el valor pisado y se marca. */
  function costoPartida(linea, m, s) {
    const mg = margenes(m, s);
    const sinPrecio = vacio(linea.pu);
    const pu = sinPrecio ? 0 : num(linea.pu);
    /* V1.27 · «no se ocupa» cuesta CERO, aunque el renglón traiga un importe
     * capturado antes. El importe se conserva en el documento a propósito —
     * quitar la marca lo devuelve, y borrarlo al marcar sería tirar trabajo
     * por un clic— pero no suma mientras la marca esté puesta. */
    const noAplica = linea.no_aplica === true;
    const costo = noAplica ? 0 : aMonedaDoc(pu * num(linea.qty), linea.moneda, m);
    const sinTipo = TIPOS.indexOf(linea.tipo) === -1;
    const esViaje = linea.tipo === TIPO_VIAJE;
    /* VIAJE = multiplicador 1, SIEMPRE. Hotel, gasolina, taxis y vuelos se
     * cobran a costo: es regla del negocio, no una opción, así que ni sale de
     * la tabla de multiplicadores ni se deja pisar renglón por renglón. Si
     * alguien escribió un margen encima, el motor lo IGNORA y lo marca
     * (`viajeConMargen`) para que la regla lo diga en voz alta — anularlo en
     * silencio sería el mismo fallo que perseguimos en todo lo demás. */
    const porTipo = esViaje ? 1
      : (sinTipo ? 0 : num(linea.tipo === 'Materiales' ? mg.materiales : mg.servicios));
    const intentoPisar = !vacio(linea.margen) && Math.abs(num(linea.margen) - porTipo) > 0.0001;
    const pisado = intentoPisar && !esViaje;
    const mult = pisado ? num(linea.margen) : porTipo;
    return { costo, mult, porTipo, pisado, esViaje,
             viajeConMargen: esViaje && intentoPisar,
             conUtilidad: costo * mult, sinPrecio, sinTipo, sinLink: !linea.link,
             // Un renglon del bloque en el que nadie ha escrito nada NO es un
             // hueco: es un renglon sin usar, como los del Excel. La diferencia
             // importa porque una seccion nueva trae 30 en blanco, y marcarlos
             // como defecto convierte la alerta en ruido.
             usada: usadaPartida(linea) };
  }

  function totalSeccion(s, m) {
    const mgSec = margenes(m, s);
    let costoMoTot = 0, ventaMo = 0, horas = 0, dias = 0, moSinTarifa = 0;
    let costoMat = 0, ventaMat = 0, sinPrecio = 0, sinTipo = 0, sinLink = 0, pisados = 0;
    /* V1.26 · el viaje se cuenta APARTE de materiales. Si se sumara ahí, la
     * línea «Materiales» del BUDGET ODOO diría que se compraron materiales por
     * el valor de los vuelos, y el peso de cada bloque en el costo saldría
     * torcido. Son gastos de otra naturaleza y se ven como tales. */
    let costoViaje = 0, viajeConMargen = 0, renglonesViaje = 0;
    // V1.27 · el estado de los cinco conceptos de viaje de ESTA sección.
    const cptsViaje = conceptosViaje(m, s);
    // V1.28 · los recargos vigentes de ESTA sección, con su procedencia.
    const recSec = recargosDe(m, s);
    const monedas = {};

    (s.mo || []).forEach(l => {
      const c = costoMo(l, m, s);
      costoMoTot += c.costo; ventaMo += c.conUtilidad; horas += c.horas; dias += c.dias;
      if (c.sinTarifa && (num(l.qty) > 0 || num(l.personas) > 0)) moSinTarifa++;
      if (l.moneda) monedas[l.moneda] = 1;
    });
    (s.partidas || []).forEach(l => {
      const c = costoPartida(l, m, s);
      if (c.esViaje) {
        costoViaje += c.costo;
        if (c.usada) { renglonesViaje++; if (c.viajeConMargen) viajeConMargen++; }
      } else {
        costoMat += c.costo; ventaMat += c.conUtilidad;
      }
      if (!c.usada) return;
      if (c.sinPrecio) sinPrecio++;
      if (c.sinTipo) sinTipo++;
      if (c.pisado) pisados++;
      if (c.sinLink && !vacio(l.pu)) sinLink++;
      if (l.moneda) monedas[l.moneda] = 1;
    });

    /* Cuántos conceptos de viaje siguen sin decisión.
     *
     * Sólo cuenta en una sección que TENGA ALGO. Una sección en blanco no
     * aporta nada a la cotización, y exigirle que decida sus cinco conceptos
     * convertiría el candado en ruido — y un candado que es ruido se aprende a
     * saltar. Con trabajo capturado, la exigencia es real: ahí es donde se va
     * la gente, y donde se olvida el hotel. */
    const seccionConAlgo = costoMoTot > 0 || costoMat > 0 || costoViaje > 0;
    const viajePorResolver = (esForaneo(m) && !viajeDe(m).no_aplica && seccionConAlgo)
      ? cptsViaje.filter(x => !x.resuelto).length : 0;

    return {
      id: s.id, nombre: s.nombre,
      // Los multiplicadores de ESTA sección. La pantalla los pinta de aquí, no
      // de los del machote: si los resolviera por su cuenta habría dos lugares
      // decidiendo el mismo número (§20 regla 4, un solo escritor).
      margenes: mgSec,
      costoMo: costoMoTot, costoMat, costoViaje,
      costo: costoMoTot + costoMat + costoViaje,
      ventaMo, ventaMat,
      // El viaje se vende a lo que cuesta: multiplicador 1, cero utilidad.
      ventaViaje: costoViaje,
      venta: ventaMo + ventaMat + costoViaje,
      horas, dias, moSinTarifa, sinPrecio, sinTipo, sinLink, pisados,
      viajeConMargen, renglonesViaje,
      conceptosViaje: cptsViaje, viajePorResolver,
      /* V1.28 · el recargo vigente AQUÍ y si se apartó del de plantilla. La
       * pantalla lo pinta de esto y no lo resuelve por su cuenta: dos lugares
       * decidiendo el mismo número es cómo empezó el bug de los márgenes
       * compartidos (§20 regla 4, un solo escritor). Sólo cuenta como apartado
       * donde el recargo APLICA —fuera de Estados Unidos el número no mueve un
       * peso, y marcarlo ahí sería una alarma sobre algo que no pasa. */
      recargos: recSec,
      recargosApartados: esEUA(m)
        ? ['fin_semana', 'festivo'].filter(k => recSec[k].apartado).length : 0,
      monedas: Object.keys(monedas)
    };
  }

  /** Reparte una comisión entre las personas nombradas.
   *  Devuelve además si los porcentajes cuadran: el machote real deja pasar
   *  repartos que suman 1,25 y solo lo marca como FALSO en una celda. */
  function repartir(monto, integrantes) {
    const lista = (integrantes || []).filter(p => p && p.nombre);
    const suma = lista.reduce((a, p) => a + num(p.pct), 0);
    return {
      lineas: lista.map(p => ({ nombre: p.nombre, pct: num(p.pct), monto: monto * num(p.pct) })),
      suma,
      cuadra: lista.length === 0 || Math.abs(suma - 1) < 0.0001
    };
  }

  /** El cálculo completo. Única fuente de verdad. */
  function calcular(m) {
    // Los del MACHOTE, que es la capa de arranque. Los que gobiernan el precio
    // son los de cada sección, y viajan dentro de `secciones[i].margenes`.
    const mg = margenes(m);
    const secciones = (m.secciones || []).map(s => totalSeccion(s, m));

    const costoMoTot = secciones.reduce((a, s) => a + s.costoMo, 0);
    const costoMat   = secciones.reduce((a, s) => a + s.costoMat, 0);
    const costoViaje = secciones.reduce((a, s) => a + s.costoViaje, 0);
    const costo      = costoMoTot + costoMat + costoViaje;
    const ventaMo    = secciones.reduce((a, s) => a + s.ventaMo, 0);
    const ventaMat   = secciones.reduce((a, s) => a + s.ventaMat, 0);
    const ventaViaje = costoViaje;                      // a costo, por regla
    const venta      = ventaMo + ventaMat + ventaViaje; // precio antes de comisiones
    const horas      = secciones.reduce((a, s) => a + s.horas, 0);
    // Días de viaje: se cuentan aparte de las horas a propósito (ver costoMo).
    const dias       = secciones.reduce((a, s) => a + s.dias, 0);

    const pctFts = num(m.comision_fts);
    const pctCli = num(m.comision_cliente);

    // Las comisiones van en cascada, en este orden: la del cliente se calcula
    // sobre el precio que ya incluye la de FTS. (DESGLOSE COTIZACION D7/D8.)
    const comFtsCU = venta * pctFts;
    const comCliCU = (venta + comFtsCU) * pctCli;
    const precioCU = venta + comFtsCU + comCliCU;       // escenario CON UTILIDAD

    // Las comisiones como fracción del precio: es lo que el escenario de
    // margen deseado tiene que descontar antes de repartir la utilidad.
    const kFts = precioCU > 0 ? comFtsCU / precioCU : 0;
    const kCli = precioCU > 0 ? comCliCU / precioCU : 0;

    const margenDeseado = num(m.margen_deseado);
    const denom = 1 - margenDeseado - kFts - kCli;
    const precioMD = denom > 0 ? costo / denom : null;
    const comFtsMD = precioMD === null ? 0 : precioMD * kFts;
    const comCliMD = precioMD === null ? 0 : precioMD * kCli;

    // Factor_req: cuántas veces el costo hay que cobrar para llegar al margen.
    const dfact = 1 - margenDeseado * (1 + pctFts) * (1 + pctCli);
    const factorReq = dfact > 0 ? 1 / dfact : null;

    const esc = {
      costo: {
        id: 'costo', precio: costo, comisionFts: 0, comisionCliente: 0,
        utilidad: 0, margen: 0
      },
      con_utilidad: {
        id: 'con_utilidad', precio: precioCU, comisionFts: comFtsCU, comisionCliente: comCliCU,
        utilidad: precioCU - comFtsCU - comCliCU - costo,
        margen: precioCU > 0 ? (precioCU - comFtsCU - comCliCU - costo) / precioCU : null
      },
      margen_deseado: {
        id: 'margen_deseado', precio: precioMD, comisionFts: comFtsMD, comisionCliente: comCliMD,
        utilidad: precioMD === null ? null : precioMD - comFtsMD - comCliMD - costo,
        margen: precioMD === null ? null : margenDeseado
      }
    };

    const elegido = esc[m.escenario] || esc.margen_deseado;

    // Bajo margen deseado el precio se reparte a prorrata del COSTO de cada
    // sección, no por margen propio de sección. El margen es una restricción
    // global. (DESGLOSE COTIZACION I18/J18.)
    const detalle = secciones.map(s => {
      const peso = costo > 0 ? s.costo / costo : 0;              // peso por COSTO
      const pesoV = venta > 0 ? s.venta / venta : 0;             // peso por VENTA

      // Los tres escenarios por sección: es la tabla RESUMEN del machote.
      // Bajo margen deseado el precio se reparte a prorrata del COSTO, y el
      // reparto entre mano de obra y materiales usa el costo de cada bloque.
      const pMo  = costo > 0 ? s.costoMo / costo : 0;
      const pMat = costo > 0 ? s.costoMat / costo : 0;
      const pVia = costo > 0 ? s.costoViaje / costo : 0;
      const esc = {
        costo: { mo: s.costoMo, mat: s.costoMat, viaje: s.costoViaje, precio: s.costo },
        con_utilidad: {
          mo: s.ventaMo, mat: s.ventaMat, viaje: s.ventaViaje,
          precio: s.venta + (comFtsCU + comCliCU) * pesoV
        },
        margen_deseado: precioMD === null
          ? { mo: null, mat: null, viaje: null, precio: null }
          : { mo: precioMD * pMo, mat: precioMD * pMat, viaje: precioMD * pVia,
              precio: precioMD * peso }
      };

      const precioSec = esc[elegido.id] ? esc[elegido.id].precio : null;
      return Object.assign({}, s, {
        peso, pesoV, esc,
        precio: precioSec,
        utilidad: precioSec === null ? null : precioSec - s.costo - (elegido.precio > 0 ? (elegido.comisionFts + elegido.comisionCliente) * peso : 0),
        margenObtenido: s.venta > 0 ? (s.venta - s.costo) / s.venta : null
      });
    });

    // Reparto de la comisión de FTS entre venta y operaciones, y de la del
    // cliente entre sus contactos.
    const rep = Object.assign({}, REPARTO_PLANTILLA, m.reparto || {});
    const bolsaVenta = elegido.comisionFts * num(rep.venta);
    const bolsaOps   = elegido.comisionFts * num(rep.operaciones);
    const venta_   = repartir(bolsaVenta, m.equipo_venta);
    const ops_     = repartir(bolsaOps, m.equipo_operaciones);
    const cliente_ = repartir(elegido.comisionCliente, m.equipo_cliente);

    // Bloque BUDGET ODOO: lo que se captura como presupuesto del proyecto.
    // El cuadre de abajo es el `COINCIDE CON LA TABLA?` del machote: da
    // VERDADERO sólo si los tres repartos suman 1. Es la única defensa que
    // tiene hoy la cotización contra un reparto mal escrito, y no bloquea.
    const comisiones = venta_.lineas.concat(ops_.lineas, cliente_.lineas);
    const sumaCom = comisiones.reduce((a, l) => a + l.monto, 0);
    const budget = {
      ingreso: elegido.precio,
      manoObra: -costoMoTot,
      materiales: -costoMat,
      viaje: -costoViaje,
      comisiones: comisiones.map(l => ({ nombre: l.nombre, monto: -l.monto })),
      total: (elegido.precio || 0) - costoMoTot - costoMat - costoViaje - sumaCom
    };
    budget.cuadra = elegido.utilidad !== null && Math.abs(budget.total - elegido.utilidad) < 1;

    // Huecos: todo lo que hace que el número de arriba no sea de fiar.
    const sinPrecio   = secciones.reduce((a, s) => a + s.sinPrecio, 0);
    const moSinTarifa = secciones.reduce((a, s) => a + s.moSinTarifa, 0);
    const sinTipo     = secciones.reduce((a, s) => a + s.sinTipo, 0);
    const sinLink     = secciones.reduce((a, s) => a + s.sinLink, 0);
    const pisados     = secciones.reduce((a, s) => a + s.pisados, 0);
    const monedas = {};
    secciones.forEach(s => s.monedas.forEach(x => { monedas[x] = 1; }));
    const mezclaMoneda = Object.keys(monedas).length > 1;

    const huecos = sinPrecio + moSinTarifa + sinTipo;

    return {
      margenes: mg,
      secciones: detalle,
      costoMo: costoMoTot, costoMat, costoViaje, costo,
      ventaMo, ventaMat, ventaViaje, venta,
      horas, dias,
      // El lugar de ejecución, resuelto una vez para que la pantalla y las
      // reglas no lo deduzcan cada quien por su lado (§20 regla 4).
      lugar: { pais: (m && m.pais) || '', region: (m && m.region) || '', ciudad: (m && m.ciudad) || '',
               tiene: tieneLugar(m), foraneo: esForaneo(m), eua: esEUA(m) },
      viaje: viajeDe(m),
      renglonesViaje: secciones.reduce((a, s) => a + s.renglonesViaje, 0),
      viajeConMargen: secciones.reduce((a, s) => a + s.viajeConMargen, 0),
      // V1.27 · cuántos conceptos de viaje siguen sin decisión, en todo el
      // machote. Es lo que bloquea ahora, en lugar de «que exista alguno».
      viajePorResolver: secciones.reduce((a, s) => a + s.viajePorResolver, 0),
      pctFts, pctCli,
      escenarios: esc,
      escenario: elegido,
      precio: elegido.precio,
      utilidad: elegido.utilidad,
      margen: elegido.margen,
      factorReq,
      // Peso de cada bloque en el costo: es el RESUMEN BUDGET del machote.
      pesoMo:  costo > 0 ? costoMoTot / costo : null,
      pesoMat: costo > 0 ? costoMat / costo : null,
      pesoViaje: costo > 0 ? costoViaje / costo : null,
      reparto: { venta: venta_, operaciones: ops_, cliente: cliente_, bolsaVenta, bolsaOps },
      budget,
      sinPrecio, moSinTarifa, sinTipo, sinLink, pisados, mezclaMoneda,
      huecos, costoIncompleto: huecos > 0
    };
  }

  /** Inverso: qué precio hace falta para un margen dado, con las comisiones
   *  de este machote. Es el Factor_req aplicado. */
  function precioParaMargen(costo, pctFts, pctCli, margenObjetivo) {
    const kIter = (p) => {
      const cf = p * pctFts, cc = (p + cf) * pctCli;
      return { cf, cc };
    };
    // Punto fijo: dos iteraciones bastan, las comisiones son pequeñas.
    let p = costo / Math.max(1 - margenObjetivo - pctFts - pctCli, 0.01);
    for (let i = 0; i < 12; i++) {
      const k = kIter(p);
      const np = (costo + k.cf + k.cc) / (1 - margenObjetivo);
      if (Math.abs(np - p) < 0.01) { p = np; break; }
      p = np;
    }
    return p;
  }

  G.MachoteCalc = {
    VERSION,
    ROLES, ROL, GRUPOS, TIPOS, TIPO_VIAJE, CONCEPTOS_VIAJE, ESCENARIOS, MAX_SECCIONES,
    SEDE, PAGA_DIAS,
    llano, tieneLugar, esForaneo, esEUA, viajeDe, recargoDe, recargosDe, conceptosViaje,
    EMPRESAS, empresaDe, monedaPorDefecto,
    MARGENES_PLANTILLA, RECARGOS_PLANTILLA, COMISION_FTS_PLANTILLA, MARGEN_DESEADO_PLANTILLA, REPARTO_PLANTILLA,
    PARTIDAS_EN_BLANCO, EQUIPO_VENTA_PLANTILLA, EQUIPO_OPS_PLANTILLA,
    usadaPartida, capturada,
    seccionNueva, machoteNuevo,
    tcEfectivo, margenes, costoMo, costoPartida, totalSeccion,
    calcular, precioParaMargen, repartir
  };
})(window);
