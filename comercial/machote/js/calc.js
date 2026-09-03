/* ═══ Machote · motor de cálculo ═══
 *
 * Todo número que se ve en pantalla sale de aquí. Ninguna vista calcula por
 * su cuenta: si el margen aparece en dos lugares, sale de la misma función.
 */
(function (G) {
  'use strict';

  // SUPUESTO: sobrecosto por turno. Inventado.
  const FACTOR_TURNO = { normal: 1, nocturno: 1.15, fin_semana: 1.25 };
  const ETIQUETA_TURNO = { normal: 'Normal', nocturno: 'Nocturno (+15%)', fin_semana: 'Fin de semana (+25%)' };

  const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;

  /** Tipo de cambio con el factor de protección aplicado. */
  function tcEfectivo(m) {
    return num(m.tc) * (1 + num(m.factor_proteccion));
  }

  /** Costo de una línea de material, ya convertido a la moneda del machote.
   *  Un precio null NO se trata como cero silencioso: devuelve sin_precio. */
  function costoBom(linea, m) {
    const sinPrecio = (linea.pu === null || linea.pu === undefined);
    const pu = sinPrecio ? 0 : num(linea.pu);
    const factor = (linea.moneda === 'USD') ? tcEfectivo(m) : 1;
    return { total: num(linea.cant) * pu * factor, sinPrecio, factor };
  }

  /** Costo de una línea de mano de obra. Las horas dobles se pagan al 200%. */
  function costoMo(linea) {
    const ch = num(linea.costo_hora);
    const ft = FACTOR_TURNO[linea.turno] || 1;
    const normales = num(linea.horas) * num(linea.personas) * ch * ft;
    const dobles = num(linea.horas_dobles) * num(linea.personas) * ch * 2;
    return {
      total: normales + dobles,
      horas_hombre: (num(linea.horas) + num(linea.horas_dobles)) * num(linea.personas),
      sinOficio: !linea.oficio,
      sinCosto: linea.costo_hora === null || linea.costo_hora === undefined
    };
  }

  function totalSeccion(s, m) {
    let material = 0, manoObra = 0, sinPrecio = 0, horasHombre = 0;
    (s.bom || []).forEach(l => { const c = costoBom(l, m); material += c.total; if (c.sinPrecio) sinPrecio++; });
    (s.mo || []).forEach(l => { const c = costoMo(l); manoObra += c.total; horasHombre += c.horas_hombre; });
    return { material, manoObra, total: material + manoObra, sinPrecio, horasHombre };
  }

  /** El cálculo completo del machote. Única fuente de verdad. */
  function calcular(m) {
    const secciones = (m.secciones || []).map(s => Object.assign({ id: s.id, nombre: s.nombre }, totalSeccion(s, m)));

    const material = secciones.reduce((a, s) => a + s.material, 0);
    const manoObra = secciones.reduce((a, s) => a + s.manoObra, 0);
    const horasHombre = secciones.reduce((a, s) => a + s.horasHombre, 0);
    const partidasSinPrecio = secciones.reduce((a, s) => a + s.sinPrecio, 0);
    const costoDirecto = material + manoObra;

    const g = m.generales || {};
    const generales = {
      flete:       num(g.flete && g.flete.monto),
      importacion: num(g.importacion && g.importacion.monto),
      viaticos:    num(g.viaticos && g.viaticos.monto),
      hospedaje:   num(g.hospedaje && g.hospedaje.monto)
    };
    const totalGenerales = generales.flete + generales.importacion + generales.viaticos + generales.hospedaje;

    // Costo antes de comisión. La comisión es % del PRECIO DE VENTA, no del costo:
    // por eso se calcula después y se muestra como renglón propio en pesos.
    const costoTotal = costoDirecto + totalGenerales;

    const precio = num(m.venta && m.venta.precio);
    const comisionPct = num(g.comision_broker && g.comision_broker.pct) / 100;
    const comisionMonto = precio * comisionPct;

    const utilidad = precio - costoTotal - comisionMonto;
    const margen = precio > 0 ? utilidad / precio : null;
    const markup = costoTotal > 0 ? (precio - costoTotal) / costoTotal : null;

    return {
      secciones, material, manoObra, horasHombre, partidasSinPrecio,
      costoDirecto, generales, totalGenerales, costoTotal,
      precio, comisionPct, comisionMonto, utilidad, margen, markup,
      tcEfectivo: tcEfectivo(m)
    };
  }

  /** Inverso del simulador: qué precio da el margen que quiero.
   *  margen = 1 − comisión% − costo/P   ⇒   P = costo / (1 − comisión% − margen) */
  function precioParaMargen(costoTotal, comisionPct, margenObjetivo) {
    const den = 1 - comisionPct - margenObjetivo;
    if (den <= 0.0001) return null;   // margen inalcanzable con esa comisión
    return costoTotal / den;
  }

  // ═══ Widgets de cálculo ═══════════════════════════════════════════════════
  // El resultado se captura como DATO en el machote. No es una hoja libre:
  // cada widget tiene nombre, entradas nombradas y una fórmula visible.
  const WIDGETS = {
    perimetro_postes: {
      nombre: 'Perímetro → postes / registros',
      ayuda: 'Tramo abierto: se agrega un elemento al final.',
      unidad: 'pza',
      campos: [
        { id: 'perimetro',  etiqueta: 'Perímetro o longitud', unidad: 'm' },
        { id: 'separacion', etiqueta: 'Separación entre elementos', unidad: 'm' }
      ],
      formula: 'techo(longitud ÷ separación) + 1',
      calcular: (p) => p.separacion > 0 ? Math.ceil(num(p.perimetro) / num(p.separacion)) + 1 : null
    },
    metros_cable: {
      nombre: 'Metros → cable',
      ayuda: 'Multiplica por número de hilos y agrega desperdicio.',
      unidad: 'm',
      campos: [
        { id: 'metros',      etiqueta: 'Longitud de ruta', unidad: 'm' },
        { id: 'hilos',       etiqueta: 'Hilos por ruta',   unidad: '' },
        { id: 'desperdicio', etiqueta: 'Desperdicio',      unidad: '%', pct: true }
      ],
      formula: 'longitud × hilos × (1 + desperdicio)',
      calcular: (p) => Math.ceil(num(p.metros) * num(p.hilos) * (1 + num(p.desperdicio)))
    },
    conduit_tramos: {
      nombre: 'Metros → tramos de conduit',
      ayuda: 'Redondea hacia arriba: no se compran medios tramos.',
      unidad: 'tramo',
      campos: [
        { id: 'metros',       etiqueta: 'Longitud a canalizar', unidad: 'm' },
        { id: 'largo_tramo',  etiqueta: 'Largo del tramo',      unidad: 'm' }
      ],
      formula: 'techo(longitud ÷ largo del tramo)',
      calcular: (p) => p.largo_tramo > 0 ? Math.ceil(num(p.metros) / num(p.largo_tramo)) : null
    },
    area_rejilla: {
      nombre: 'Área → rejilla / lámina',
      ayuda: 'Superficie más desperdicio de corte.',
      unidad: 'm²',
      campos: [
        { id: 'largo',       etiqueta: 'Largo',       unidad: 'm' },
        { id: 'ancho',       etiqueta: 'Ancho',       unidad: 'm' },
        { id: 'desperdicio', etiqueta: 'Desperdicio', unidad: '%', pct: true }
      ],
      formula: 'largo × ancho × (1 + desperdicio)',
      calcular: (p) => +(num(p.largo) * num(p.ancho) * (1 + num(p.desperdicio))).toFixed(2)
    },
    viaticos_cuadrilla: {
      nombre: 'Cuadrilla → viáticos',
      ayuda: 'Alimentación y gastos por persona y día en obra foránea.',
      unidad: 'MXN',
      campos: [
        { id: 'personas',   etiqueta: 'Personas',        unidad: '' },
        { id: 'dias',       etiqueta: 'Días en obra',    unidad: 'd' },
        { id: 'tarifa_dia', etiqueta: 'Viático por día', unidad: '$' }
      ],
      formula: 'personas × días × viático diario',
      calcular: (p) => num(p.personas) * num(p.dias) * num(p.tarifa_dia)
    },
    hospedaje_cuadrilla: {
      nombre: 'Cuadrilla → hospedaje',
      ayuda: 'Cuartos redondeados hacia arriba por ocupación.',
      unidad: 'MXN',
      campos: [
        { id: 'personas',     etiqueta: 'Personas',            unidad: '' },
        { id: 'noches',       etiqueta: 'Noches',              unidad: 'n' },
        { id: 'ocupacion',    etiqueta: 'Personas por cuarto', unidad: '' },
        { id: 'tarifa_noche', etiqueta: 'Tarifa por cuarto',   unidad: '$' }
      ],
      formula: 'techo(personas ÷ ocupación) × noches × tarifa',
      calcular: (p) => p.ocupacion > 0
        ? Math.ceil(num(p.personas) / num(p.ocupacion)) * num(p.noches) * num(p.tarifa_noche) : null
    }
  };

  G.CALC = { calcular, calcularSeccion: totalSeccion, costoBom, costoMo, tcEfectivo,
             precioParaMargen, WIDGETS, FACTOR_TURNO, ETIQUETA_TURNO };
})(window);
