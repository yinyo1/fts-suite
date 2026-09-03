/* ═══ Machote · datos demo ═══
 *
 * Reconstruidos sobre la estructura REAL (docs/comercial/MACHOTE-ESTRUCTURA-REAL.md).
 * Los machotes de abajo copian la forma y los órdenes de magnitud de archivos
 * reales de SharePoint, con los números redondeados. No son datos de producción.
 *
 * Lo que viene del machote real va marcado REAL.
 * Lo que sigue siendo invención mía va marcado SUPUESTO.
 */
(function (G) {
  'use strict';

  const C = G.MachoteCalc;

  // REAL — unidades vistas en la columna UNIDAD del machote.
  const UNIDADES = ['Pieza', 'Horas', 'Servicio', 'Lote', 'm', 'm²', 'kg', 'Rollo', 'Tramo', 'Jgo'];

  // REAL — los cinco roles y sus tarifas de plantilla viven en calc.js (ROLES).
  // REAL — Tipo ∈ {Materiales, Servicios} vive en calc.js (TIPOS).

  // SUPUESTO — el cuestionario de diagnóstico es invención mía. El machote no
  // tiene nada equivalente: el analista decide de cabeza qué preguntar. Se deja
  // porque es lo que convierte al machote en una estación de trabajo, pero las
  // preguntas las tiene que revisar Esteban.
  const TIPOS_PROYECTO = [
    { id: 'suministro', label: 'Suministro', icono: '📦', preguntas: [
      { id: 'entrega', critica: true,  texto: '¿Dónde se entrega y quién descarga?', implica: 'Flete y maniobra', riesgo_si_no: 'El flete se descubre en obra' },
      { id: 'importado', critica: true, texto: '¿Algún componente es de importación?', implica: 'Arancel, tiempo y tipo de cambio', riesgo_si_no: 'Margen comido por el tipo de cambio' },
      { id: 'garantia', critica: false, texto: '¿Qué garantía pide el cliente?', implica: 'Reserva', riesgo_si_no: 'Reclamo sin reserva' },
      { id: 'vigencia', critica: true,  texto: '¿Cuánto tiempo se sostiene el precio?', implica: 'Vigencia de la cotización', riesgo_si_no: 'Se compra a precio nuevo y se vende al viejo' }
    ]},
    { id: 'instalacion', label: 'Instalación', icono: '🔧', preguntas: [
      { id: 'ventana', critica: true,  texto: '¿Hay ventana de paro de planta?', implica: 'Horas extras y turno', riesgo_si_no: 'Se trabaja de noche sin cobrarlo' },
      { id: 'altura', critica: true,   texto: '¿Se trabaja en altura o espacio confinado?', implica: 'Seguridad y andamio', riesgo_si_no: 'Se para la obra por seguridad' },
      { id: 'accesos', critica: false, texto: '¿Cómo se accede al punto de trabajo?', implica: 'Maniobra', riesgo_si_no: 'Grúa no considerada' },
      { id: 'induccion', critica: false, texto: '¿El cliente pide inducción o certificaciones?', implica: 'Horas no productivas', riesgo_si_no: 'Se pierde el primer día' },
      { id: 'obra_civil', critica: true, texto: '¿Hay obra civil de por medio?', implica: 'Subcontrato', riesgo_si_no: 'Alcance ajeno dentro del precio' }
    ]},
    { id: 'servicio', label: 'Servicio', icono: '🛠️', preguntas: [
      { id: 'alcance_horas', critica: true, texto: '¿El servicio se cobra por horas o por entregable?', implica: 'Estructura del precio', riesgo_si_no: 'Servicio sin fin' },
      { id: 'sitio', critica: true,  texto: '¿Es en sitio del cliente o remoto?', implica: 'Viáticos', riesgo_si_no: 'Viáticos no cobrados' },
      { id: 'repeticion', critica: false, texto: '¿Es único o recurrente?', implica: 'Póliza', riesgo_si_no: 'Se regala la recurrencia' }
    ]},
    { id: 'ingenieria', label: 'Ingeniería', icono: '📐', preguntas: [
      { id: 'entregable', critica: true, texto: '¿Cuál es el entregable exacto?', implica: 'Horas de diseño y dibujo', riesgo_si_no: 'Revisiones infinitas' },
      { id: 'revisiones', critica: true, texto: '¿Cuántas rondas de revisión incluye?', implica: 'Tope de horas', riesgo_si_no: 'Horas sin tope' },
      { id: 'firma', critica: false, texto: '¿Requiere firma de perito o memoria de cálculo?', implica: 'Costo externo', riesgo_si_no: 'Perito no presupuestado' },
      { id: 'as_built', critica: false, texto: '¿Se entregan planos As-Built?', implica: 'Horas de cierre', riesgo_si_no: 'Cierre documental regalado' }
    ]}
  ];

  /* El flujo del machote, en orden. `congelado` es la propiedad que manda:
   * un machote enviado a Odoo ya no se toca — es el documento con el que se
   * vendio, y editarlo despues seria reescribir la historia.
   *
   * `exige_so`: no se puede enviar a Odoo sin orden. El machote SI puede nacer
   * sin ella (casi siempre nace antes que la orden), pero al enviar ya no. */
  const ESTADOS = {
    borrador:   { label: 'En creación', color: '#8b8b8b', congelado: false, orden: 1 },
    revision:   { label: 'En revisión', color: '#c07a00', congelado: false, orden: 2 },
    enviado:    { label: 'Enviado a Odoo', color: '#1a7f37', congelado: true,
                  exige_so: true, orden: 3 }
  };
  const FLUJO = ['borrador', 'revision', 'enviado'];

  let _n = 0;
  const uid = (p) => p + '-' + (++_n);

  /** Una partida de materiales o servicios. REAL: el orden de los argumentos
   *  sigue el de las columnas del machote. */
  const p = (qty, unidad, tipo, descripcion, modelo, marca, pu, moneda, link, comentario) =>
    ({ qty, unidad, tipo, descripcion, modelo: modelo || '', marca: marca || '',
       pu, moneda: moneda || 'MXN', link: link || '', comentario: comentario || '' });

  /** Un renglón de mano de obra. REAL: qty son horas, personas es gente. */
  const mo = (rol, qty, personas, pu, moneda) =>
    ({ rol, qty, personas, pu: (pu === undefined ? C.ROL[rol].pu : pu), moneda: moneda || 'MXN' });

  const sec = (nombre, partidas, moArr) =>
    ({ id: uid('s'), nombre, partidas: partidas || [], mo: moArr || [] });

  // REAL — el equipo de venta de la plantilla, a 0,25 cada uno.
  const EQUIPO_PLANTILLA = () => ([
    { nombre: 'ALDO',  pct: 0.25 }, { nombre: 'ANGEL', pct: 0.25 },
    { nombre: 'DIEGO', pct: 0.25 }, { nombre: 'MONTY', pct: 0.25 }
  ]);
  const OPS_PLANTILLA = () => ([
    { nombre: 'SUPERVISOR FTS', pct: 0.25 }, { nombre: 'SEGURIDAD', pct: 0.25 },
    { nombre: 'TECNICO 1', pct: 0.25 }, { nombre: 'TECNICO 2', pct: 0.25 }
  ]);

  const base = (extra) => Object.assign({
    empresa_id: 1,                      // Servicios FTS · MXN
    moneda: 'MXN', tc: 18.40, factor_proteccion: 0.03, tc_fuente: 'DOF del día',
    margenes: Object.assign({}, C.MARGENES_PLANTILLA),
    comision_fts: C.COMISION_FTS_PLANTILLA,
    comision_cliente: 0,
    margen_deseado: C.MARGEN_DESEADO_PLANTILLA,
    escenario: 'margen_deseado',
    reparto: Object.assign({}, C.REPARTO_PLANTILLA),
    equipo_venta: EQUIPO_PLANTILLA(),
    equipo_operaciones: OPS_PLANTILLA(),
    // REAL — el machote tiene dos renglones nominales del lado cliente
    // ("NOMBRE USUARIO 1/2"). Por omisión el primero se lleva todo.
    equipo_cliente: [{ nombre: 'Contacto cliente 1', pct: 1 }]
  }, extra);

  const MACHOTES = [

    // ── 1. Sano, con hueco de precio. Forma tomada de "Paso de Gato SO11782".
    base({
      id: 'M-1041', nombre: 'Paso de gato antiderrapante en acero galvanizado',
      cliente: 'Johnson Controls Enterprises', so: null, estado: 'borrador',
      analista: 'Analista de propuestas', fecha: '2026-08-28',
      margenes: { programador: 4.4, mano_obra: 2.5, materiales: 2.5, servicios: 1.8 },
      diagnostico: { tipo: 'instalacion', respuestas: { ventana: 'Sí, fin de semana', altura: 'Sí, plataforma a 4 m', obra_civil: 'No' } },
      secciones: [
        sec('Suministro y fabricación', [
          p(1, 'Pieza', 'Servicios', 'Suministro de sistema de paso de gato antiderrapante', 'Subcontratado', '', 800000, 'MXN', 'https://proveedor.example/cotiza-4417'),
          p(40, 'Horas', 'Materiales', 'Ingeniería de detalle (recorrido, adaptaciones, interfaz con escalera)', 'Ingeniero Senior', '', 200, 'MXN', ''),
          p(20, 'Horas', 'Materiales', 'Elaboración y adecuación de planos de instalación', 'Ingeniero de Diseño', '', 200, 'MXN', ''),
          p(20, 'Horas', 'Materiales', 'Memoria de cálculo', 'Ingeniero Senior', '', 200, 'MXN', ''),
          // Hueco a propósito: partida sin precio.
          p(8, 'Pieza', 'Materiales', 'Anclaje químico para fijación en losa', 'HIT-RE 500', 'Hilti', null, 'MXN', '')
        ], [
          mo('supervisor_sr', 60, 1),
          mo('tecnicos', 60, 3),
          mo('he_tecnicos', 12, 3)
        ]),
        sec('Instalación en sitio', [
          p(1, 'Servicio', 'Servicios', 'Maniobra con grúa de 20 t', '', 'Subcontratado', 28000, 'MXN', 'https://proveedor.example/gruas'),
          // REAL — el machote deja pisar el margen renglón por renglón, encima
          // de la fórmula que lo deriva del Tipo. En SO11737 hay una partida
          // "riel" de $200 marcada como Materiales con margen 1,5 escrito a
          // mano: de ahí salían $20 de diferencia contra el archivo.
          Object.assign(p(4, 'Pieza', 'Materiales', 'Riel de soporte galvanizado', '', 'Unistrut', 200, 'MXN', 'https://proveedor.example/riel'), { margen: 1.5 }),
          p(200, 'Horas', 'Materiales', 'Seguimiento durante instalación', 'Project Manager', '', 200, 'MXN', '')
        ], [
          mo('supervisor_jr', 80, 1),
          mo('tecnicos', 80, 4)
        ])
      ]
    }),

    // ── 2. Margen por debajo del piso. Forma de "Adecuaciones toma sanitaria SO11772".
    base({
      id: 'M-1042', nombre: 'Adecuaciones de toma sanitaria en codo',
      cliente: 'Nalco de México · Topo Chico', so: 'SO11772', estado: 'revision',
      analista: 'Analista de propuestas', fecha: '2026-08-19',
      comision_fts: 0.055, comision_cliente: 0.05,
      margen_deseado: 0.12,
      diagnostico: { tipo: 'instalacion', respuestas: { ventana: 'No definida', altura: 'No', obra_civil: 'No' } },
      secciones: [
        sec('Adecuación', [
          p(2, 'Pieza', 'Materiales', 'Codo sanitario 2" acero inoxidable 316L', 'ISO 1127', 'Sanitec', 1850, 'MXN', 'https://proveedor.example/codo-316l'),
          p(4, 'Pieza', 'Materiales', 'Abrazadera sanitaria clamp 2"', '', 'Sanitec', 320, 'MXN', 'https://proveedor.example/clamp'),
          p(1, 'Servicio', 'Servicios', 'Pulido sanitario y pasivado', '', 'Subcontratado', 2400, 'MXN', '')
        ], [
          mo('supervisor_sr', 4, 1),
          mo('tecnicos', 8, 2)
        ])
      ]
    }),

    // ── 3. Mezcla de monedas sin declarar tipo de cambio. Forma de un machote USD.
    base({
      id: 'M-1043', nombre: 'Cooling system for maintenance offices',
      cliente: 'Calbee America Incorporated', so: null, estado: 'borrador',
      analista: 'Analista de propuestas', fecha: '2026-08-30',
      empresa_id: 6,                    // FTS USA · USD
      moneda: 'USD', tc: 0, factor_proteccion: 0, tc_fuente: '',
      comision_fts: 0.06, comision_cliente: 0.05,
      diagnostico: { tipo: 'suministro', respuestas: { entrega: 'Planta Fayetteville', importado: 'Sí, equipo de EUA' } },
      secciones: [
        sec('Equipo', [
          p(2, 'Pieza', 'Materiales', 'Mini split 2 ton inverter', 'MSZ-GL24NA', 'Mitsubishi', 1180, 'USD', 'https://www.homedepot.com/p/example'),
          // Renglón en otra moneda: el machote real los sumaría sin convertir.
          p(1, 'Lote', 'Materiales', 'Tubería de cobre, aislante y soportería', '', '', 24500, 'MXN', ''),
          p(1, 'Servicio', 'Servicios', 'Carga de refrigerante y arranque', '', '', 640, 'USD', '')
        ], [
          mo('supervisor_sr', 16, 1, 200, 'USD'),
          mo('tecnicos', 32, 2, 140, 'USD')
        ])
      ]
    }),

    // ── 4. Reparto de comisiones descuadrado: el defecto real de SO11782.
    base({
      id: 'M-1044', nombre: 'Modificaciones en pulidores',
      cliente: 'Nalco de México · Topo Chico', so: 'SO11738', estado: 'revision',
      analista: 'Analista de propuestas', fecha: '2026-08-22',
      comision_fts: 0.06, comision_cliente: 0.05,
      equipo_venta: [
        { nombre: 'ALDO',  pct: 0.20 }, { nombre: 'ANGEL', pct: 0.15 },
        { nombre: 'DIEGO', pct: 0.05 }, { nombre: 'MONTY', pct: 0.70 },
        { nombre: 'Rissia', pct: 0.15 }
      ],
      diagnostico: { tipo: 'servicio', respuestas: { alcance_horas: 'Por entregable', sitio: 'En sitio' } },
      secciones: [
        sec('Modificación mecánica', [
          p(3, 'Pieza', 'Materiales', 'Rodamiento lineal reforzado', 'LM25UU', 'THK', 4200, 'MXN', 'https://proveedor.example/lm25uu'),
          p(1, 'Lote', 'Materiales', 'Placa de acero A36 y consumibles de soldadura', '', '', 38000, 'MXN', ''),
          p(1, 'Servicio', 'Servicios', 'Maquinado externo de bujes', '', 'Taller externo', 16500, 'MXN', '')
        ], [
          mo('programador', 24, 1),
          mo('supervisor_sr', 40, 1),
          mo('tecnicos', 120, 3),
          mo('he_supervisor', 16, 1)
        ]),
        sec('Puesta en marcha', [
          p(1, 'Servicio', 'Servicios', 'Pruebas con producto y ajuste fino', '', '', 9800, 'MXN', '')
        ], [
          mo('supervisor_sr', 16, 1),
          mo('tecnicos', 16, 2)
        ])
      ]
    })
  ];

  // Órdenes ya confirmadas: lo que la estación 3.0 tiene que cerrar.
  const ORDENES = [
    {
      id: 'O-9001', machote: 'M-1042', so: 'SO11772',
      cliente: 'Nalco de México · Topo Chico',
      nombre: 'Adecuaciones de toma sanitaria en codo',
      fecha_confirmacion: '2026-08-19', monto: 13362, moneda: 'MXN',
      entregables: null, handoff: null
    },
    {
      id: 'O-9002', machote: null, so: 'SO11737',
      cliente: 'Nalco de México · Topo Chico',
      nombre: 'Adecuaciones eléctricas y de control para diferencial de presión',
      fecha_confirmacion: '2026-08-17', monto: 305840, moneda: 'MXN',
      entregables: null, handoff: null
    }
  ];

  G.DEMO = {
    UNIDADES, TIPOS_PROYECTO, ESTADOS, FLUJO, MACHOTES, ORDENES,
    ROLES: C.ROLES, GRUPOS: C.GRUPOS, TIPOS: C.TIPOS, ESCENARIOS: C.ESCENARIOS
  };
})(window);
