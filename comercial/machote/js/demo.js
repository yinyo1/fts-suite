/* ═══ Machote · datos y catálogos demo ═══
 *
 * TODO lo de este archivo es DEMO. No hay red, no hay backend, no hay
 * localStorage: el estado vive en memoria y se reinicia al recargar.
 *
 * ⚠ SUPUESTO GRANDE: no tuve acceso a los machotes reales de SharePoint.
 * La estructura por secciones, los oficios, los rangos de costo-hora y los
 * renglones de generales están inventados a partir del encargo y del
 * vocabulario del negocio. Ver el reporte en el issue #148.
 */
(function (G) {
  'use strict';

  // ── Origen del precio, con nivel de confianza ─────────────────────────────
  // Regla dura del módulo: NUNCA se inventa un precio. Si no hay dato, el
  // precio es null y el origen es 'sin_dato'. Un cero silencioso es peor que
  // un hueco visible.
  const ORIGENES_PRECIO = {
    cotizacion: { etiqueta: 'Cotización de proveedor', confianza: 'alta',    dias_vigencia: 30 },
    lista:      { etiqueta: 'Lista de precios vigente', confianza: 'alta',   dias_vigencia: 90 },
    historico:  { etiqueta: 'Compra anterior',          confianza: 'media',  dias_vigencia: 180 },
    estimado:   { etiqueta: 'Estimado por el analista', confianza: 'baja',   dias_vigencia: 0 },
    sin_dato:   { etiqueta: 'SIN DATO',                 confianza: 'ninguna',dias_vigencia: 0 }
  };

  // ── Oficios (mano de obra) ────────────────────────────────────────────────
  // SUPUESTO: costos por hora inventados. Los rangos alimentan la regla que
  // marca un costo-hora fuera de mercado.
  const OFICIOS = [
    { id: 'supervisor', nombre: 'Supervisor de obra', costo_hora: 280, rango: [220, 380] },
    { id: 'soldador',   nombre: 'Soldador',           costo_hora: 210, rango: [160, 290] },
    { id: 'electrico',  nombre: 'Eléctrico',          costo_hora: 195, rango: [150, 270] },
    { id: 'mecanico',   nombre: 'Mecánico',           costo_hora: 185, rango: [140, 255] },
    { id: 'segurista',  nombre: 'Segurista',          costo_hora: 150, rango: [110, 210] },
    { id: 'ayudante',   nombre: 'Ayudante general',   costo_hora: 110, rango: [85, 155] }
  ];

  const UNIDADES = ['pza', 'm', 'm²', 'kg', 'lote', 'rollo', 'tramo', 'jgo', 'serv'];

  // ── Tipos de proyecto y sus preguntas de diagnóstico ──────────────────────
  // "Que no se olvide nada": las preguntas cambian según el tipo. Las
  // marcadas `critica` bloquean; las demás solo avisan.
  const TIPOS_PROYECTO = [
    {
      id: 'electrico',
      nombre: 'Instalación eléctrica / subestación',
      icono: '⚡',
      preguntas: [
        { id: 'unifilar',    texto: '¿Hay diagrama unifilar aprobado por el cliente?', tipo: 'bool', critica: true,
          riesgo_si_no: 'Sin unifilar aprobado, el alcance eléctrico se va a mover. Cotiza con reserva o pide el plano antes.' },
        { id: 'tension',     texto: 'Tensión de operación (V)',                        tipo: 'num',  critica: true },
        { id: 'libranza',    texto: '¿Se requiere libranza / paro de planta?',          tipo: 'bool', critica: false,
          implica: 'Si hay libranza, el trabajo suele caer en fin de semana o turno nocturno. Revisa turnos.' },
        { id: 'transformador', texto: '¿Quién suministra el transformador?', tipo: 'opcion', opciones: ['FTS', 'Cliente', 'No aplica'], critica: true },
        { id: 'cortocircuito', texto: '¿Hay estudio de cortocircuito / coordinación de protecciones?', tipo: 'bool', critica: false,
          riesgo_si_no: 'Sin estudio de cortocircuito, las protecciones se eligen a ojo y pueden quedar mal coordinadas.' },
        { id: 'altura',      texto: '¿Trabajo en altura mayor a 1.8 m?', tipo: 'bool', critica: false,
          implica: 'Trabajo en altura exige segurista en la cuadrilla.' },
        { id: 'clasificada', texto: '¿Área clasificada (Clase I Div. 2 o similar)?', tipo: 'bool', critica: true,
          implica: 'Área clasificada cambia todo el material a prueba de explosión. El costo se dispara.' },
        { id: 'perito',      texto: '¿Se requiere memoria de cálculo firmada por perito (DRO/UVIE)?', tipo: 'bool', critica: false }
      ]
    },
    {
      id: 'clima',
      nombre: 'Mantenimiento a equipos de clima',
      icono: '❄️',
      preguntas: [
        { id: 'equipos',     texto: '¿Cuántos equipos?',                      tipo: 'num',  critica: true },
        { id: 'tonelaje',    texto: 'Tonelaje por equipo (TR)',               tipo: 'num',  critica: false },
        { id: 'refrigerante',texto: '¿Requiere recuperación de refrigerante?',tipo: 'bool', critica: false,
          implica: 'La recuperación necesita equipo certificado y disposición. No se cobra como mano de obra normal.' },
        { id: 'acceso',      texto: '¿El acceso requiere grúa o montacargas?',tipo: 'bool', critica: false,
          implica: 'Maniobra de izaje: va como renglón aparte, no dentro de mano de obra.' },
        { id: 'azotea',      texto: '¿Trabajo en azotea?',                    tipo: 'bool', critica: false,
          implica: 'Azotea = trabajo en altura. Exige segurista.' }
      ]
    },
    {
      id: 'fabricacion',
      nombre: 'Fabricación e instalación estructural',
      icono: '🔩',
      preguntas: [
        { id: 'planos',      texto: '¿Hay planos de taller aprobados?',       tipo: 'bool', critica: true,
          riesgo_si_no: 'Fabricar sin planos aprobados es la receta del retrabajo. El costo de corregir no está en este machote.' },
        { id: 'grado',       texto: 'Grado de acero (ej. A36, A572)',         tipo: 'texto',critica: false },
        { id: 'peso',        texto: 'Peso total estimado (kg)',               tipo: 'num',  critica: true },
        { id: 'acabado',     texto: '¿Requiere galvanizado o pintura especial?', tipo: 'bool', critica: false,
          implica: 'El acabado suele ser servicio externo con tiempo de entrega propio.' },
        { id: 'izaje',       texto: '¿Se requiere maniobra con grúa?',        tipo: 'bool', critica: false }
      ]
    },
    {
      id: 'montaje',
      nombre: 'Montaje de equipo / prensa',
      icono: '🏭',
      preguntas: [
        { id: 'peso_eq',     texto: 'Peso del equipo (kg)',                   tipo: 'num',  critica: true },
        { id: 'cimentacion', texto: '¿Requiere cimentación nueva?',           tipo: 'bool', critica: true,
          implica: 'Cimentación nueva mete obra civil: es otra sección completa, con fraguado en la ruta crítica.' },
        { id: 'ruta',        texto: '¿Hay ruta de acceso confirmada en sitio?',tipo: 'bool',critica: true,
          riesgo_si_no: 'Si el equipo no entra, la maniobra cambia por completo: puede requerir desmontar estructura o grúa mayor.' },
        { id: 'nivelacion',  texto: '¿Nivelación con topografía?',            tipo: 'bool', critica: false }
      ]
    }
  ];

  const ESTADOS = {
    borrador:  { etiqueta: 'Borrador',           color: 'gris'  },
    revision:  { etiqueta: 'Listo para revisión', color: 'ambar' },
    aprobado:  { etiqueta: 'Aprobado',            color: 'verde' },
    confirmado:{ etiqueta: 'Confirmado',          color: 'azul'  },
    devuelto:  { etiqueta: 'Devuelto',            color: 'rojo'  }
  };

  // ── Helpers de construcción ───────────────────────────────────────────────
  let _n = 0;
  const uid = (p) => p + '-' + (++_n);
  const bom = (desc, marca, modelo, cant, unidad, pu, origen, moneda) => ({
    id: uid('b'), desc, marca: marca || '', modelo: modelo || '',
    cant, unidad, pu: (pu === null || pu === undefined) ? null : pu,
    origen: origen || 'sin_dato', moneda: moneda || 'MXN'
  });
  const mo = (oficio, horas, personas, costo_hora, turno, horas_dobles) => ({
    id: uid('m'), oficio: oficio || '', horas, personas,
    costo_hora: costo_hora === null ? null : costo_hora,
    turno: turno || 'normal', horas_dobles: horas_dobles || 0
  });
  const sec = (nombre, bomArr, moArr) => ({ id: uid('s'), nombre, bom: bomArr || [], mo: moArr || [] });

  // ═══ MACHOTES DEMO ════════════════════════════════════════════════════════
  const MACHOTES = [

    // ── 1 · Nalco · clima · CONFIRMADO (sano, sirve de referencia) ──────────
    {
      id: 'MCH-2026-041',
      nombre: 'Mantenimiento mayor a 6 equipos de clima',
      cliente: 'Nalco de México',
      planta: 'Topo Chico, Monterrey',
      estado: 'confirmado',
      analista: 'A. Ruiz',
      am: 'Montalvo',
      creado: '2026-08-04',
      moneda: 'MXN', tc: 18.90, factor_proteccion: 0.03,
      diagnostico: {
        tipo: 'clima',
        alcance: 'Mantenimiento mayor a 6 unidades paquete de 10 TR: limpieza de serpentines, ' +
                 'cambio de filtros, revisión de compresores, carga de refrigerante y pruebas de operación.',
        respuestas: { equipos: 6, tonelaje: 10, refrigerante: true, acceso: false, azotea: true }
      },
      ubicacion: { ciudad: 'Monterrey', foraneo: false, dias_obra: 6, personas_cuadrilla: 4 },
      secciones: [
        sec('Insumos y refacciones', [
          bom('Filtro plisado 20x25x2', 'Filtrex', 'FP-2025', 24, 'pza', 185, 'lista'),
          bom('Refrigerante R-410A', 'Chemours', 'Opteon', 60, 'kg', 640, 'cotizacion'),
          bom('Contactor 40 A 3P', 'Schneider', 'LC1D40', 6, 'pza', 1240, 'cotizacion'),
          bom('Químico limpiador de serpentín', 'Nu-Calgon', 'Evap-Foam', 12, 'pza', 420, 'historico')
        ], [
          mo('mecanico', 40, 2, 185, 'normal', 0),
          mo('electrico', 24, 1, 195, 'normal', 0),
          mo('segurista', 40, 1, 150, 'normal', 0),
          mo('supervisor', 20, 1, 280, 'normal', 0)
        ]),
        sec('Maniobra y seguridad en azotea', [
          bom('Renta de andamio certificado', 'Layher', '', 1, 'lote', 8600, 'cotizacion'),
          bom('Línea de vida temporal', 'MSA', 'Latchways', 1, 'lote', 5400, 'cotizacion')
        ], [
          mo('ayudante', 30, 2, 110, 'normal', 0)
        ])
      ],
      generales: {
        flete:       { monto: 4200,  nota: 'Traslado de herramienta y andamio' },
        importacion: { monto: 0,     nota: '' },
        viaticos:    { monto: 0,     nota: 'Local, no aplica' },
        hospedaje:   { monto: 0,     nota: 'Local, no aplica' },
        comision_broker: { pct: 0,   nota: 'Venta directa' }
      },
      venta: { precio: 147000 },
      widgets: [],
      firma: { por: 'Montalvo', cuando: '2026-08-12 11:20', margen: 0.2435, costo_estimado: 111200 }
    },

    // ── 2 · Mission Foods · mezanine · APROBADO ─────────────────────────────
    {
      id: 'MCH-2026-052',
      nombre: 'Fabricación e instalación de mezanine 12 × 8 m',
      cliente: 'Mission Foods',
      planta: 'Planta Escobedo',
      estado: 'aprobado',
      analista: 'A. Ruiz',
      am: 'Montalvo',
      creado: '2026-08-18',
      moneda: 'MXN', tc: 18.90, factor_proteccion: 0.05,
      diagnostico: {
        tipo: 'fabricacion',
        alcance: 'Fabricación en taller e instalación en sitio de mezanine estructural de 96 m² ' +
                 'con escalera de acceso, barandal y rejilla Irving. Capacidad 500 kg/m².',
        respuestas: { planos: true, grado: 'A36', peso: 9800, acabado: true, izaje: true }
      },
      ubicacion: { ciudad: 'Escobedo', foraneo: false, dias_obra: 25, personas_cuadrilla: 6 },
      secciones: [
        sec('Estructura principal', [
          bom('Viga IPR 12" × 40 lb/ft', 'Ternium', 'IPR-305', 96, 'm', 1180, 'cotizacion'),
          bom('Placa base 12mm A36', 'Ternium', '', 340, 'kg', 38, 'lista'),
          bom('Ángulo 3" × 1/4"', 'Ternium', '', 180, 'm', 210, 'lista'),
          bom('Anclas químicas M16', 'Hilti', 'HIT-RE 500', 64, 'pza', 340, 'cotizacion')
        ], [
          mo('soldador', 180, 3, 210, 'normal', 0),
          mo('ayudante', 180, 3, 110, 'normal', 0),
          mo('supervisor', 96, 1, 280, 'normal', 0)
        ]),
        sec('Piso, escalera y barandal', [
          bom('Rejilla Irving 1" × 3/16"', 'Irving', 'IS-38', 96, 'm²', 1420, 'cotizacion'),
          bom('Perfil escalera + peldaños antiderrapantes', '', '', 1, 'jgo', 24800, 'historico'),
          bom('Barandal tubular 2" con rodapié', '', '', 40, 'm', 890, 'historico')
        ], [
          mo('soldador', 96, 2, 210, 'normal', 8),
          mo('ayudante', 96, 2, 110, 'normal', 8)
        ]),
        sec('Acabado y montaje en sitio', [
          bom('Galvanizado por inmersión', 'Galvak', '', 9800, 'kg', 22, 'cotizacion'),
          bom('Renta de grúa 20 t (2 días)', '', '', 2, 'serv', 18500, 'cotizacion')
        ], [
          mo('mecanico', 72, 3, 185, 'normal', 0),
          mo('segurista', 72, 1, 150, 'normal', 0)
        ])
      ],
      generales: {
        flete:       { monto: 26000, nota: 'Taller → planta, 3 viajes con plataforma' },
        importacion: { monto: 0,     nota: '' },
        viaticos:    { monto: 0,     nota: 'Local' },
        hospedaje:   { monto: 0,     nota: 'Local' },
        comision_broker: { pct: 0,   nota: 'Venta directa' }
      },
      venta: { precio: 1260000 },
      widgets: [
        { id: 'w1', tipo: 'area_rejilla', etiqueta: 'Área de mezanine → rejilla',
          params: { largo: 12, ancho: 8, desperdicio: 0.05 }, resultado: 100.8, unidad: 'm²' }
      ],
      firma: null
    },

    // ── 3 · Clarios · prensa · LISTO PARA REVISIÓN (con problemas a propósito) ──
    {
      id: 'MCH-2026-058',
      nombre: 'Instalación de prensa hidráulica 400 t',
      cliente: 'Clarios',
      planta: 'Planta García',
      estado: 'revision',
      analista: 'A. Ruiz',
      am: 'Montalvo',
      creado: '2026-08-26',
      moneda: 'MXN', tc: 18.90, factor_proteccion: 0,   // ← factor 0 con partidas USD
      diagnostico: {
        tipo: 'montaje',
        alcance: 'Recepción, maniobra, nivelación y puesta en marcha de prensa hidráulica de 400 t.',
        respuestas: { peso_eq: 42000, cimentacion: true, ruta: true, nivelacion: true }
      },
      ubicacion: { ciudad: 'García', foraneo: false, dias_obra: 18, personas_cuadrilla: 8 },
      secciones: [
        sec('Obra civil de cimentación', [
          bom('Concreto f\'c 300 kg/cm² premezclado', 'Cemex', '', 68, 'm³', 3150, 'cotizacion'),
          bom('Acero de refuerzo #8', 'Deacero', '', 5400, 'kg', 26, 'lista'),
          bom('Anclas de sujeción 1-1/4" grado 8', '', '', 32, 'pza', null, 'sin_dato') // ← sin precio
        ], [
          mo('ayudante', 240, 4, 110, 'normal', 0),
          mo('', 120, 2, 185, 'normal', 0)   // ← mano de obra SIN OFICIO
        ]),
        sec('Maniobra e izaje', [
          bom('Grúa 120 t con operador (3 días)', '', '', 3, 'serv', 62000, 'cotizacion'),
          bom('Patines hidráulicos y rodillos', 'Hilman', '', 1, 'lote', 4200, 'estimado')
        ], [
          mo('mecanico', 144, 4, 185, 'nocturno', 24),
          mo('segurista', 144, 1, 150, 'nocturno', 24),
          mo('supervisor', 144, 1, 280, 'nocturno', 0)
        ]),
        sec('Conexión eléctrica e hidráulica', [
          bom('Cable THHN 4/0 AWG', 'Condumex', '', 320, 'm', 268, 'lista'),
          bom('Interruptor principal 400 A', 'Square D', 'PowerPact', 1, 'pza', 4850, 'cotizacion', 'USD'),
          bom('Manguera hidráulica alta presión', 'Parker', '', 60, 'm', 92, 'cotizacion', 'USD'),
          bom('Tubería conduit rígido 3"', '', '', 180, 'm', null, 'sin_dato')  // ← sin precio
        ], [
          mo('electrico', 160, 3, 195, 'normal', 16),
          mo('mecanico', 120, 2, 185, 'normal', 0)
        ])
      ],
      generales: {
        flete:       { monto: 38000, nota: 'Maniobra especial' },
        importacion: { monto: 0,     nota: '' },        // ← hay USD y no hay importación
        viaticos:    { monto: 0,     nota: '' },
        hospedaje:   { monto: 0,     nota: '' },
        comision_broker: { pct: 14,  nota: 'Broker de planta' }  // ← comisión alta
      },
      venta: { precio: 2380000 },
      widgets: [],
      firma: null
    },

    // ── 4 · Mondelez · subestación · BORRADOR (foráneo, muchos huecos) ──────
    {
      id: 'MCH-2026-063',
      nombre: 'Subestación 500 kVA y alimentadores',
      cliente: 'Mondelez',
      planta: 'Planta Salinas Victoria',
      estado: 'borrador',
      analista: 'A. Ruiz',
      am: 'Ricardo',
      creado: '2026-08-29',
      moneda: '', tc: 0, factor_proteccion: 0,   // ← moneda SIN DECLARAR
      diagnostico: {
        tipo: 'electrico',
        alcance: '',                              // ← alcance vacío
        respuestas: { unifilar: false, tension: 13800, libranza: true, transformador: 'FTS',
                      cortocircuito: false, altura: true, clasificada: false, perito: null }
      },
      // Foráneo, cuadrilla 6 personas, 15 días — y CERO hospedaje/viáticos
      ubicacion: { ciudad: 'Salinas Victoria', foraneo: true, dias_obra: 15, personas_cuadrilla: 6 },
      secciones: [
        sec('Subestación', [
          bom('Transformador 500 kVA 13.8kV-480V', 'Prolec', 'TP-500', 1, 'pza', 41500, 'cotizacion', 'USD'),
          bom('Celda de media tensión', 'Schneider', 'SM6', 1, 'pza', null, 'sin_dato'),
          bom('Apartarrayos 15 kV', '', '', 3, 'pza', null, 'sin_dato'),
          bom('Malla de tierra cobre desnudo 4/0', 'Condumex', '', 240, 'm', 315, 'estimado')
        ], [
          mo('electrico', 200, 3, 195, 'normal', 0),
          mo('ayudante', 200, 3, 110, 'normal', 0)
        ]),
        sec('Alimentadores y canalización', [
          bom('Cable XLP 15 kV 1/0', 'Condumex', '', 620, 'm', null, 'sin_dato'),
          bom('Charola portacables 24"', '', '', 180, 'm', 1450, 'estimado'),
          bom('Registro tipo pozo', '', '', 6, 'pza', 8900, 'historico')
        ], [])   // ← sección con material y CERO mano de obra
      ],
      generales: {
        flete:       { monto: 0, nota: '' },
        importacion: { monto: 0, nota: '' },
        viaticos:    { monto: 0, nota: '' },   // ← foráneo sin viáticos
        hospedaje:   { monto: 0, nota: '' },   // ← foráneo sin hospedaje
        comision_broker: { pct: 0, nota: '' }
      },
      venta: { precio: 0 },                     // ← sin precio de venta
      widgets: [
        { id: 'w2', tipo: 'perimetro_postes', etiqueta: 'Perímetro de malla → registros',
          params: { perimetro: 240, separacion: 40 }, resultado: 7, unidad: 'pza' }
      ],
      firma: null
    }
  ];

  // ── Órdenes demo (pantalla 3) ─────────────────────────────────────────────
  const ORDENES = [
    { id: 'SO12043', cliente: 'Clarios', machote: 'MCH-2026-058',
      lineas: [
        { desc: 'Instalación de prensa hidráulica 400 t — obra civil', cant: 1, pu: 980000 },
        { desc: 'Maniobra e izaje especializado', cant: 1, pu: 640000 },
        { desc: 'Conexión eléctrica e hidráulica', cant: 1, pu: 760000 }
      ], moneda: 'MXN', estado: 'borrador', fecha: '2026-09-01' },

    { id: 'SO12051', cliente: 'Mission Foods', machote: 'MCH-2026-052',
      lineas: [
        { desc: 'Fabricación de mezanine estructural 96 m²', cant: 1, pu: 820000 },
        { desc: 'Galvanizado por inmersión', cant: 1, pu: 215600 },
        { desc: 'Montaje en sitio con grúa', cant: 1, pu: 144400 }
      ], moneda: 'MXN', estado: 'borrador', fecha: '2026-09-02' },

    { id: 'SO12058', cliente: 'Mondelez', machote: 'MCH-2026-063',
      lineas: [
        { desc: 'Subestación 500 kVA llave en mano', cant: 1, pu: 1650000 },
        { desc: 'Alimentadores y canalización', cant: 1, pu: 480000 }
      ], moneda: 'MXN', estado: 'borrador', fecha: '2026-09-02' },

    { id: 'SO12060', cliente: 'Nalco de México', machote: null,   // ← sin machote: margen a mano
      lineas: [
        { desc: 'Servicio de mantenimiento correctivo — bomba centrífuga', cant: 1, pu: 96000 }
      ], moneda: 'MXN', estado: 'borrador', fecha: '2026-09-02' }
  ];

  G.DEMO = { ORIGENES_PRECIO, OFICIOS, UNIDADES, TIPOS_PROYECTO, ESTADOS, MACHOTES, ORDENES };
})(window);
