/* ═══ Machote · revisador automático ═══
 *
 * Las reglas viven en un ARREGLO DE CONFIGURACIÓN, separadas del motor que
 * las corre. Para agregar, quitar o ajustar una regla se edita este archivo
 * y nada más.
 *
 * severidad:
 *   'dura'   → bloquea la confirmación de la orden
 *   'blanda' → advierte, no bloquea
 *   'info'   → observación
 *
 * ⚠ SUPUESTO: los umbrales de abajo están inventados. Son lo primero que
 * Esteban debería corregir con números reales de FTS.
 */
(function (G) {
  'use strict';

  const UMBRALES = {
    margen_minimo_duro:    0.08,  // por debajo de esto no se confirma
    margen_minimo_blando:  0.18,  // por debajo de esto se advierte
    comision_maxima:       0.10,  // 10% de comisión de broker
    horas_por_dia_persona: 10,    // tope razonable de jornada
    flete_minimo_material: 150000,// si el material pasa esto y no hay flete, algo falta
    viatico_dia_referencia: 450,
    hospedaje_noche_referencia: 900
  };

  const pct = (x) => (x * 100).toFixed(1).replace(/\.0$/, '') + '%';
  const mx  = (x) => '$' + Math.round(x).toLocaleString('es-MX');
  const lineasBom = (m) => (m.secciones || []).flatMap(s => (s.bom || []).map(l => ({ s, l })));
  const lineasMo  = (m) => (m.secciones || []).flatMap(s => (s.mo  || []).map(l => ({ s, l })));
  const hayUSD    = (m) => lineasBom(m).some(x => x.l.moneda === 'USD');
  const tipoDe    = (m) => (G.DEMO.TIPOS_PROYECTO.find(t => t.id === (m.diagnostico || {}).tipo) || null);

  const REGLAS = [
    // ── Moneda y tipo de cambio ────────────────────────────────────────────
    {
      id: 'moneda-sin-declarar', severidad: 'dura', area: 'Moneda',
      titulo: 'La moneda del machote no está declarada',
      evaluar: (m) => !m.moneda ? { detalle: 'Sin moneda, ningún total significa nada.' } : null
    },
    {
      id: 'tc-sin-declarar', severidad: 'dura', area: 'Moneda',
      titulo: 'Hay partidas en USD y no hay tipo de cambio',
      evaluar: (m) => (hayUSD(m) && !(m.tc > 0))
        ? { detalle: 'Las partidas en dólares se están valuando en cero.' } : null
    },
    {
      id: 'factor-proteccion-cero', severidad: 'blanda', area: 'Moneda',
      titulo: 'Compras en USD sin factor de protección',
      evaluar: (m) => (hayUSD(m) && m.tc > 0 && !(m.factor_proteccion > 0))
        ? { detalle: 'Si el peso se mueve entre la cotización y la compra, el margen se lo come la diferencia.' } : null
    },

    // ── Material ───────────────────────────────────────────────────────────
    {
      id: 'partida-sin-precio', severidad: 'dura', area: 'Material',
      titulo: 'Partidas sin precio',
      evaluar: (m) => {
        const f = lineasBom(m).filter(x => x.l.pu === null || x.l.pu === undefined);
        return f.length ? { detalle: 'Estas partidas suman cero al costo y no deberían.',
                            items: f.map(x => x.s.nombre + ' · ' + x.l.desc) } : null;
      }
    },
    {
      id: 'cantidad-cero', severidad: 'blanda', area: 'Material',
      titulo: 'Partidas con cantidad en cero',
      evaluar: (m) => {
        const f = lineasBom(m).filter(x => !(x.l.cant > 0));
        return f.length ? { detalle: '¿Sobran, o falta capturar la cantidad?',
                            items: f.map(x => x.s.nombre + ' · ' + x.l.desc) } : null;
      }
    },
    {
      id: 'precio-baja-confianza', severidad: 'blanda', area: 'Material',
      titulo: 'Partidas con precio estimado',
      evaluar: (m) => {
        const f = lineasBom(m).filter(x => x.l.origen === 'estimado');
        return f.length ? { detalle: 'Un estimado del analista no es una cotización. Confírmalos antes de comprometer precio.',
                            items: f.map(x => x.s.nombre + ' · ' + x.l.desc) } : null;
      }
    },
    {
      id: 'bom-sin-marca', severidad: 'blanda', area: 'Material',
      titulo: 'Partidas sin marca ni modelo',
      evaluar: (m) => {
        const f = lineasBom(m).filter(x => !x.l.marca && !x.l.modelo && x.l.unidad !== 'serv' && x.l.unidad !== 'lote');
        return f.length ? { detalle: 'Sin marca y modelo, compras no puede cotizar lo mismo que coticé yo.',
                            items: f.map(x => x.s.nombre + ' · ' + x.l.desc) } : null;
      }
    },

    // ── Mano de obra ───────────────────────────────────────────────────────
    {
      id: 'mo-sin-oficio', severidad: 'dura', area: 'Mano de obra',
      titulo: 'Mano de obra sin oficio',
      evaluar: (m) => {
        const f = lineasMo(m).filter(x => !x.l.oficio);
        return f.length ? { detalle: 'Sin oficio no se sabe a qué tarifa va ni quién la ejecuta.',
                            items: f.map(x => x.s.nombre + ' · ' + x.l.horas + ' h × ' + x.l.personas + ' persona(s)') } : null;
      }
    },
    {
      id: 'mo-sin-costo', severidad: 'dura', area: 'Mano de obra',
      titulo: 'Mano de obra sin costo por hora',
      evaluar: (m) => {
        const f = lineasMo(m).filter(x => x.l.costo_hora === null || x.l.costo_hora === undefined);
        return f.length ? { detalle: 'Esas horas están entrando gratis al costo.',
                            items: f.map(x => x.s.nombre + ' · ' + (x.l.oficio || 'sin oficio')) } : null;
      }
    },
    {
      id: 'mo-costo-fuera-rango', severidad: 'blanda', area: 'Mano de obra',
      titulo: 'Costo por hora fuera del rango del oficio',
      evaluar: (m) => {
        const f = [];
        lineasMo(m).forEach(x => {
          const of = G.DEMO.OFICIOS.find(o => o.id === x.l.oficio);
          if (of && x.l.costo_hora != null && (x.l.costo_hora < of.rango[0] || x.l.costo_hora > of.rango[1])) {
            f.push(of.nombre + ': ' + mx(x.l.costo_hora) + '/h (rango ' + mx(of.rango[0]) + '–' + mx(of.rango[1]) + ')');
          }
        });
        return f.length ? { detalle: 'Revisa si es un caso especial o un dedazo.', items: f } : null;
      }
    },
    {
      id: 'horas-no-caben', severidad: 'blanda', area: 'Mano de obra',
      titulo: 'Hay horas que no caben en los días de obra',
      evaluar: (m) => {
        const dias = (m.ubicacion || {}).dias_obra || 0;
        if (!dias) return null;
        const tope = dias * UMBRALES.horas_por_dia_persona;
        const f = lineasMo(m).filter(x => x.l.horas > tope);
        return f.length ? {
          detalle: 'Con ' + dias + ' días de obra, una persona no puede dar más de ' + tope + ' h. ' +
                   'O faltan días, o sobran horas, o hace falta más gente.',
          items: f.map(x => x.s.nombre + ' · ' + (x.l.oficio || 'sin oficio') + ': ' + x.l.horas + ' h por persona') } : null;
      }
    },
    {
      id: 'horas-dobles-sin-turno', severidad: 'info', area: 'Mano de obra',
      titulo: 'Horas dobles en turno normal',
      evaluar: (m) => {
        const f = lineasMo(m).filter(x => x.l.horas_dobles > 0 && x.l.turno === 'normal');
        return f.length ? { detalle: 'Se están pagando al 200% dentro de turno normal. Confirma que así es.',
                            items: f.map(x => x.s.nombre + ' · ' + (x.l.oficio || '?') + ': ' + x.l.horas_dobles + ' h dobles') } : null;
      }
    },

    // ── Obra foránea ───────────────────────────────────────────────────────
    {
      id: 'foraneo-sin-hospedaje', severidad: 'dura', area: 'Obra foránea',
      titulo: 'Obra foránea sin hospedaje',
      evaluar: (m, c) => {
        const u = m.ubicacion || {};
        if (!u.foraneo || c.generales.hospedaje > 0) return null;
        const est = Math.ceil((u.personas_cuadrilla || 0) / 2) * (u.dias_obra || 0) * UMBRALES.hospedaje_noche_referencia;
        return { detalle: u.personas_cuadrilla + ' personas × ' + u.dias_obra + ' días en ' + u.ciudad +
                          ' y el hospedaje está en cero. De referencia serían ~' + mx(est) + '.' };
      }
    },
    {
      id: 'foraneo-sin-viaticos', severidad: 'dura', area: 'Obra foránea',
      titulo: 'Obra foránea sin viáticos',
      evaluar: (m, c) => {
        const u = m.ubicacion || {};
        if (!u.foraneo || c.generales.viaticos > 0) return null;
        const est = (u.personas_cuadrilla || 0) * (u.dias_obra || 0) * UMBRALES.viatico_dia_referencia;
        return { detalle: 'De referencia serían ~' + mx(est) + ' (' + u.personas_cuadrilla + ' × ' +
                          u.dias_obra + ' × ' + mx(UMBRALES.viatico_dia_referencia) + ').' };
      }
    },

    // ── Generales ──────────────────────────────────────────────────────────
    {
      id: 'sin-flete-con-material', severidad: 'blanda', area: 'Generales',
      titulo: 'Material considerable sin flete',
      evaluar: (m, c) => (c.material >= UMBRALES.flete_minimo_material && c.generales.flete === 0)
        ? { detalle: mx(c.material) + ' de material y flete en cero. ¿Entrega en sitio del proveedor?' } : null
    },
    {
      id: 'importacion-cero-con-usd', severidad: 'blanda', area: 'Generales',
      titulo: 'Compras en USD sin renglón de importación',
      evaluar: (m, c) => (hayUSD(m) && c.generales.importacion === 0)
        ? { detalle: 'Si el equipo cruza aduana hay pedimento, agente y maniobras. Si ya viene nacionalizado, anótalo.' } : null
    },
    {
      id: 'comision-fuera-rango', severidad: 'blanda', area: 'Generales',
      titulo: 'Comisión de broker alta',
      evaluar: (m, c) => c.comisionPct > UMBRALES.comision_maxima
        ? { detalle: pct(c.comisionPct) + ' sobre la venta (' + mx(c.comisionMonto) + '). ' +
                     'Por arriba de ' + pct(UMBRALES.comision_maxima) + ' conviene que lo autorice dirección.' } : null
    },

    // ── Precio y margen ────────────────────────────────────────────────────
    {
      id: 'sin-precio-venta', severidad: 'dura', area: 'Precio',
      titulo: 'Sin precio de venta',
      evaluar: (m, c) => !(c.precio > 0) ? { detalle: 'No hay nada que confirmar sin precio.' } : null
    },
    {
      id: 'precio-bajo-costo', severidad: 'dura', area: 'Precio',
      titulo: 'El precio de venta está por debajo del costo',
      evaluar: (m, c) => (c.precio > 0 && c.precio < c.costoTotal)
        ? { detalle: 'Precio ' + mx(c.precio) + ' contra costo ' + mx(c.costoTotal) + '. Se vende perdiendo.' } : null
    },
    {
      id: 'margen-bajo', severidad: 'dura', area: 'Precio',
      titulo: 'Margen por debajo del mínimo',
      evaluar: (m, c) => (c.margen !== null && c.margen < UMBRALES.margen_minimo_duro && c.precio >= c.costoTotal)
        ? { detalle: 'Margen ' + pct(c.margen) + ', mínimo ' + pct(UMBRALES.margen_minimo_duro) + '.' } : null
    },
    {
      id: 'margen-flojo', severidad: 'blanda', area: 'Precio',
      titulo: 'Margen por debajo del objetivo',
      evaluar: (m, c) => (c.margen !== null && c.margen >= UMBRALES.margen_minimo_duro && c.margen < UMBRALES.margen_minimo_blando)
        ? { detalle: 'Margen ' + pct(c.margen) + ', objetivo ' + pct(UMBRALES.margen_minimo_blando) + '.' } : null
    },

    // ── Diagnóstico ────────────────────────────────────────────────────────
    {
      id: 'diagnostico-incompleto', severidad: 'dura', area: 'Diagnóstico',
      titulo: 'Preguntas críticas del diagnóstico sin responder',
      evaluar: (m) => {
        const t = tipoDe(m); if (!t) return { detalle: 'No se eligió tipo de proyecto.' };
        const r = (m.diagnostico || {}).respuestas || {};
        const f = t.preguntas.filter(p => p.critica && (r[p.id] === null || r[p.id] === undefined || r[p.id] === ''));
        return f.length ? { detalle: 'Son las que cambian el alcance. Sin ellas el costeo es una apuesta.',
                            items: f.map(p => p.texto) } : null;
      }
    },
    {
      id: 'diagnostico-implicacion', severidad: 'blanda', area: 'Diagnóstico',
      titulo: 'Respuestas del diagnóstico que piden algo en el costeo',
      evaluar: (m) => {
        const t = tipoDe(m); if (!t) return null;
        const r = (m.diagnostico || {}).respuestas || {};
        const f = t.preguntas.filter(p => p.implica && r[p.id] === true);
        return f.length ? { detalle: 'Contestaste que sí. Revisa que el costeo lo refleje.',
                            items: f.map(p => p.implica) } : null;
      }
    },
    {
      id: 'diagnostico-respuesta-riesgo', severidad: 'blanda', area: 'Diagnóstico',
      titulo: 'Respuestas del diagnóstico que meten riesgo al costeo',
      evaluar: (m) => {
        const t = tipoDe(m); if (!t) return null;
        const r = (m.diagnostico || {}).respuestas || {};
        // Contestar "no" NO es lo mismo que dejar en blanco: está respondida, y la
        // respuesta es justamente la que trae cola.
        const f = t.preguntas.filter(p => p.riesgo_si_no && r[p.id] === false);
        return f.length ? { detalle: 'Están contestadas, y la respuesta es la incómoda.',
                            items: f.map(p => p.riesgo_si_no) } : null;
      }
    },
    {
      id: 'altura-sin-segurista', severidad: 'blanda', area: 'Diagnóstico',
      titulo: 'Trabajo en altura sin segurista en la cuadrilla',
      evaluar: (m) => {
        const r = (m.diagnostico || {}).respuestas || {};
        const enAltura = r.altura === true || r.azotea === true;
        if (!enAltura) return null;
        const hay = lineasMo(m).some(x => x.l.oficio === 'segurista');
        return hay ? null : { detalle: 'Hay trabajo en altura y ninguna partida de segurista.' };
      }
    },
    {
      id: 'alcance-vacio', severidad: 'blanda', area: 'Diagnóstico',
      titulo: 'El alcance está vacío',
      evaluar: (m) => !((m.diagnostico || {}).alcance || '').trim()
        ? { detalle: 'El alcance es lo que se compara contra el reclamo cuando el cliente pide de más.' } : null
    },

    // ── Estructura ─────────────────────────────────────────────────────────
    {
      id: 'seccion-sin-mo', severidad: 'blanda', area: 'Estructura',
      titulo: 'Secciones con material y sin mano de obra',
      evaluar: (m) => {
        const f = (m.secciones || []).filter(s => (s.bom || []).length && !(s.mo || []).length);
        return f.length ? { detalle: '¿El material se instala solo?', items: f.map(s => s.nombre) } : null;
      }
    },
    {
      id: 'seccion-sin-material', severidad: 'info', area: 'Estructura',
      titulo: 'Secciones de pura mano de obra',
      evaluar: (m) => {
        const f = (m.secciones || []).filter(s => !(s.bom || []).length && (s.mo || []).length);
        return f.length ? { detalle: 'Puede ser correcto (servicio puro). Solo confirma que no falte consumible.',
                            items: f.map(s => s.nombre) } : null;
      }
    }
  ];

  /** Corre todas las reglas. Devuelve los hallazgos agrupados por severidad. */
  function revisar(m) {
    const c = G.CALC.calcular(m);
    const hallazgos = [];
    REGLAS.forEach(r => {
      let res = null;
      try { res = r.evaluar(m, c); }
      catch (e) { res = { detalle: 'La regla falló al evaluar: ' + e.message }; }
      if (res) hallazgos.push({ id: r.id, severidad: r.severidad, area: r.area, titulo: r.titulo,
                                detalle: res.detalle || '', items: res.items || [] });
    });
    const duras  = hallazgos.filter(h => h.severidad === 'dura');
    const blandas= hallazgos.filter(h => h.severidad === 'blanda');
    const infos  = hallazgos.filter(h => h.severidad === 'info');
    return { hallazgos, duras, blandas, infos, calc: c,
             puedeConfirmar: duras.length === 0, total: hallazgos.length };
  }

  G.REGLAS = { REGLAS, UMBRALES, revisar };
})(window);
