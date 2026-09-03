/* ═══ Machote · revisador automático ═══
 *
 * Reescrito el 2026-09-03 sobre la estructura REAL del machote.
 * Ver docs/comercial/MACHOTE-ESTRUCTURA-REAL.md.
 *
 * Las reglas viven en un ARREGLO DE CONFIGURACIÓN, separadas del motor que las
 * corre. Para agregar, quitar o ajustar una regla se edita este archivo y nada más.
 *
 * severidad:
 *   'dura'   → bloquea la confirmación
 *   'blanda' → advierte, no bloquea
 *   'info'   → observación
 *
 * Las reglas marcadas MACHOTE salen de un defecto observado en archivos reales.
 * Las marcadas SUPUESTO tienen umbral inventado: son lo primero que Esteban debe
 * corregir con números de FTS.
 */
(function (G) {
  'use strict';

  const C = G.MachoteCalc;

  const UMBRALES = {
    margen_minimo_duro:   0.08,  // SUPUESTO
    margen_minimo_blando: 0.25,  // SUPUESTO — el machote deja 40% de plantilla
    comision_total_maxima: 0.15, // SUPUESTO — FTS + cliente juntas
    horas_por_dia_persona: 10,   // SUPUESTO
    partidas_sin_link_max: 0.30  // SUPUESTO — % de partidas con precio y sin fuente
  };

  const pct = (x) => (x * 100).toFixed(1).replace(/\.0$/, '') + '%';
  const mx  = (x) => '$' + Math.round(x).toLocaleString('es-MX');
  const secs = (m) => (m.secciones || []);
  const partidas = (m) => secs(m).flatMap(s => (s.partidas || []).map(l => ({ s, l })));
  const renglonesMo = (m) => secs(m).flatMap(s => (s.mo || []).map(l => ({ s, l })));
  const usada = (l) => (Number(l.qty) > 0) || (l.pu !== null && l.pu !== undefined && l.pu !== '') || !!l.descripcion;
  const tipoDe = (m) => (G.DEMO.TIPOS_PROYECTO.find(t => t.id === (m.diagnostico || {}).tipo) || null);

  const REGLAS = [

    // ── Márgenes: la tabla que gobierna todo el precio ─────────────────────
    {
      // MACHOTE — programador 4,4 y mano de obra 2,5 no variaron en ninguno de
      // los 8 ejemplares leídos. Si alguien los mueve, es a propósito o es error.
      destino: () => ({ tab: 'gen' }),
      id: 'margen-fuera-de-plantilla', severidad: 'blanda', area: 'Márgenes',
      titulo: 'Un multiplicador se movió de su valor de plantilla',
      evaluar: (m) => {
        const mg = C.margenes(m), base = C.MARGENES_PLANTILLA;
        const dif = Object.keys(base).filter(k => Math.abs(Number(mg[k]) - base[k]) > 0.001)
          .map(k => k.replace('_', ' ') + ': ' + mg[k] + ' (plantilla ' + base[k] + ')');
        if (!dif.length) return null;
        const duros = dif.filter(d => /programador|mano obra/.test(d));
        return { detalle: duros.length
            ? 'Programador y mano de obra son iguales en los 8 machotes revisados. Moverlos cambia el precio de toda la mano de obra.'
            : 'Materiales y servicios sí varían por cotización, pero deja dicho por qué.',
          items: dif };
      }
    },
    {
      destino: () => ({ tab: 'gen' }),
      id: 'margen-invertido', severidad: 'dura', area: 'Márgenes',
      titulo: 'Un multiplicador está por debajo de 1',
      evaluar: (m) => {
        const mg = C.margenes(m);
        const mal = Object.keys(C.MARGENES_PLANTILLA).filter(k => Number(mg[k]) < 1)
          .map(k => k.replace('_', ' ') + ' = ' + mg[k]);
        return mal.length ? { detalle: 'Un multiplicador menor a 1 vende por debajo del costo.', items: mal } : null;
      }
    },

    // ── Precio y margen ────────────────────────────────────────────────────
    {
      destino: () => ({ tab: 'gen' }),
      id: 'margen-imposible', severidad: 'dura', area: 'Precio',
      titulo: 'El margen deseado no se puede alcanzar',
      evaluar: (m, c) => c.escenario.id === 'margen_deseado' && c.precio === null
        ? { detalle: 'Margen deseado ' + pct(Number(m.margen_deseado)) + ' más comisiones de ' +
                     pct(c.pctFts + c.pctCli) + ' pasan del 100% del precio. No hay precio que lo cumpla.' }
        : null
    },
    {
      destino: () => ({ tab: 'gen' }),
      id: 'margen-bajo-duro', severidad: 'dura', area: 'Precio',
      titulo: 'Margen por debajo del piso',
      evaluar: (m, c) => (c.margen !== null && c.margen < UMBRALES.margen_minimo_duro)
        ? { detalle: 'Margen ' + pct(c.margen) + ', piso ' + pct(UMBRALES.margen_minimo_duro) + '. SUPUESTO: el piso está inventado.' }
        : null
    },
    {
      destino: () => ({ tab: 'gen' }),
      id: 'margen-bajo-blando', severidad: 'blanda', area: 'Precio',
      titulo: 'Margen por debajo de lo habitual',
      evaluar: (m, c) => (c.margen !== null && c.margen >= UMBRALES.margen_minimo_duro
                          && c.margen < UMBRALES.margen_minimo_blando)
        ? { detalle: 'Margen ' + pct(c.margen) + '. La plantilla del machote trae 40% como referencia.' }
        : null
    },
    {
      destino: () => ({ tab: 'gen' }),
      id: 'escenario-costo', severidad: 'dura', area: 'Precio',
      titulo: 'La cotización está en escenario COSTO',
      evaluar: (m, c) => c.escenario.id === 'costo'
        ? { detalle: 'En COSTO el precio es el costo: se cotizaría con utilidad cero. Cambia a CON UTILIDAD o MARGEN DESEADO antes de mandarla.' }
        : null
    },
    {
      destino: () => ({ tab: 'gen' }),
      id: 'con-utilidad-bajo-deseado', severidad: 'info', area: 'Precio',
      titulo: 'El escenario elegido rinde menos que el margen deseado',
      evaluar: (m, c) => {
        const cu = c.escenarios.con_utilidad, md = c.escenarios.margen_deseado;
        if (c.escenario.id !== 'con_utilidad' || cu.margen === null || md.precio === null) return null;
        if (cu.margen >= Number(m.margen_deseado) - 0.001) return null;
        return { detalle: 'Con los multiplicadores actuales el margen sale ' + pct(cu.margen) +
                          '; para llegar a ' + pct(Number(m.margen_deseado)) + ' el precio tendría que ser ' +
                          mx(md.precio) + ' (Factor_req ' + (c.factorReq ? c.factorReq.toFixed(3) : '—') + ').' };
      }
    },

    // ── Comisiones ─────────────────────────────────────────────────────────
    {
      // MACHOTE — defecto real de "Paso de Gato MXN - SO11782": el reparto del
      // equipo de venta suma 1,25. El Excel lo marca FALSO y deja pasar.
      destino: () => ({ tab: 'com' }),
      id: 'reparto-descuadrado', severidad: 'dura', area: 'Comisiones',
      titulo: 'El reparto de comisiones no suma 100%',
      evaluar: (m, c) => {
        const mal = [];
        if (!c.reparto.venta.cuadra)       mal.push('Equipo de venta: ' + pct(c.reparto.venta.suma));
        if (!c.reparto.operaciones.cuadra) mal.push('Equipo de operaciones: ' + pct(c.reparto.operaciones.suma));
        if (!c.reparto.cliente.cuadra)     mal.push('Lado cliente: ' + pct(c.reparto.cliente.suma));
        return mal.length ? { detalle: 'Se paga de más o de menos. Es el defecto que el machote marca como COINCIDE CON LA TABLA? = FALSO y aun así deja mandar.', items: mal } : null;
      }
    },
    {
      destino: () => ({ tab: 'com' }),
      id: 'budget-no-cuadra', severidad: 'dura', area: 'Comisiones',
      titulo: 'El BUDGET ODOO no cuadra con la utilidad',
      evaluar: (m, c) => c.budget.cuadra ? null
        : { detalle: 'El presupuesto que se capturaría en Odoo da ' + mx(c.budget.total) +
                     ' y la utilidad calculada es ' + (c.utilidad === null ? '—' : mx(c.utilidad)) +
                     '. Si se captura así, el proyecto nace descuadrado.' }
    },
    {
      destino: () => ({ tab: 'gen' }),
      id: 'comision-alta', severidad: 'blanda', area: 'Comisiones',
      titulo: 'Comisiones altas contra el precio',
      evaluar: (m, c) => (c.pctFts + c.pctCli) > UMBRALES.comision_total_maxima
        ? { detalle: 'FTS ' + pct(c.pctFts) + ' + cliente ' + pct(c.pctCli) + ' = ' + pct(c.pctFts + c.pctCli) +
                     '. SUPUESTO: el tope está inventado.' }
        : null
    },
    {
      destino: () => ({ tab: 'com' }),
      id: 'comision-sin-nombre', severidad: 'blanda', area: 'Comisiones',
      titulo: 'Hay comisión de cliente sin nadie a quién pagarle',
      evaluar: (m, c) => (c.pctCli > 0 && !(m.equipo_cliente || []).filter(x => x && x.nombre).length)
        ? { detalle: 'Se está cobrando ' + pct(c.pctCli) + ' de comisión de cliente y no hay contacto nombrado que la reciba.' }
        : null
    },

    // ── Huecos de captura ──────────────────────────────────────────────────
    {
      destino: (m, c) => {
        const s = c.secciones.find(x => x.sinPrecio > 0);
        return { tab: 'secc', seccion: s ? s.id : null };
      },
      id: 'partida-sin-precio', severidad: 'dura', area: 'Captura',
      titulo: 'Partidas sin precio',
      evaluar: (m, c) => c.sinPrecio ? {
        detalle: c.sinPrecio + ' partida(s) capturada(s) sin precio unitario. El total de arriba está incompleto: no es un cero, es un hueco.',
        items: partidas(m).filter(x => usada(x.l) && (x.l.pu === null || x.l.pu === undefined || x.l.pu === ''))
                          .map(x => x.s.nombre + ' · ' + (x.l.descripcion || '(sin descripción)'))
      } : null
    },
    {
      destino: () => ({ tab: 'secc' }),
      id: 'partida-sin-tipo', severidad: 'dura', area: 'Captura',
      titulo: 'Partidas sin Tipo',
      evaluar: (m, c) => c.sinTipo ? {
        detalle: 'El Tipo (Materiales o Servicios) es lo que elige el multiplicador. Sin él la partida se vende a costo.',
        items: partidas(m).filter(x => usada(x.l) && C.TIPOS.indexOf(x.l.tipo) === -1)
                          .map(x => x.s.nombre + ' · ' + (x.l.descripcion || '(sin descripción)'))
      } : null
    },
    {
      destino: () => ({ tab: 'secc' }),
      id: 'mo-sin-tarifa', severidad: 'dura', area: 'Captura',
      titulo: 'Mano de obra con horas y sin tarifa',
      evaluar: (m, c) => c.moSinTarifa ? {
        detalle: 'Hay renglones con horas o personas capturadas y la tarifa vacía.',
        items: renglonesMo(m).filter(x => (Number(x.l.qty) > 0 || Number(x.l.personas) > 0) &&
                                          (x.l.pu === null || x.l.pu === undefined || x.l.pu === ''))
                             .map(x => x.s.nombre + ' · ' + (C.ROL[x.l.rol] ? C.ROL[x.l.rol].label : x.l.rol))
      } : null
    },
    {
      // MACHOTE — la columna Link es en la práctica el origen del precio.
      destino: () => ({ tab: 'secc' }),
      id: 'precio-sin-fuente', severidad: 'blanda', area: 'Captura',
      titulo: 'Precios sin liga al proveedor',
      evaluar: (m, c) => {
        const conPrecio = partidas(m).filter(x => usada(x.l) && x.l.pu !== null && x.l.pu !== undefined && x.l.pu !== '');
        if (!conPrecio.length) return null;
        const sin = conPrecio.filter(x => !x.l.link);
        const r = sin.length / conPrecio.length;
        if (r <= UMBRALES.partidas_sin_link_max) return null;
        return { detalle: sin.length + ' de ' + conPrecio.length + ' partidas con precio no traen liga. ' +
                          'En el machote la columna Link es el respaldo del precio: sin ella nadie puede reverificarlo en tres meses.',
                 items: sin.slice(0, 8).map(x => x.s.nombre + ' · ' + (x.l.descripcion || '(sin descripción)')) };
      }
    },

    // ── Moneda ─────────────────────────────────────────────────────────────
    {
      // MACHOTE — el Excel suma renglones MXN y USD sin convertir.
      destino: () => ({ tab: 'gen' }),
      id: 'mezcla-moneda', severidad: 'blanda', area: 'Moneda',
      titulo: 'El machote mezcla monedas',
      evaluar: (m, c) => c.mezclaMoneda
        ? { detalle: 'Hay renglones en más de una moneda. El machote de Excel los sumaría sin convertir; aquí sí se convierten al tipo de cambio de abajo. Confirma que el tipo de cambio es el que quieres sostener.' }
        : null
    },
    {
      destino: () => ({ tab: 'gen' }),
      id: 'tc-sin-declarar', severidad: 'dura', area: 'Moneda',
      titulo: 'Hay renglones en otra moneda y no hay tipo de cambio',
      evaluar: (m, c) => (c.mezclaMoneda && !(Number(m.tc) > 0))
        ? { detalle: 'Sin tipo de cambio, los renglones de la otra moneda entran al total como si fueran de la moneda del documento.' }
        : null
    },
    {
      destino: () => ({ tab: 'gen' }),
      id: 'sin-proteccion-tc', severidad: 'info', area: 'Moneda',
      titulo: 'Tipo de cambio sin factor de protección',
      evaluar: (m, c) => (c.mezclaMoneda && Number(m.tc) > 0 && !(Number(m.factor_proteccion) > 0))
        ? { detalle: 'El precio queda expuesto a que el peso se mueva entre la cotización y la compra.' }
        : null
    },

    // ── Mano de obra ───────────────────────────────────────────────────────
    {
      destino: () => ({ tab: 'secc' }),
      id: 'extras-sin-normales', severidad: 'blanda', area: 'Mano de obra',
      titulo: 'Horas extras sin horas normales del mismo rol',
      evaluar: (m) => {
        const par = { he_supervisor: 'supervisor_sr', he_jr: 'supervisor_jr',
                      he_tecnicos: 'tecnicos', he_programador: 'programador', he_diseno: 'diseno' };
        const mal = [];
        secs(m).forEach(s => {
          const h = {};
          (s.mo || []).forEach(l => { h[l.rol] = (h[l.rol] || 0) + Number(l.qty || 0); });
          Object.keys(par).forEach(k => {
            if ((h[k] || 0) > 0 && !(h[par[k]] > 0)) mal.push(s.nombre + ' · ' + C.ROL[k].label);
          });
        });
        return mal.length ? { detalle: 'Las horas extras se cobran al doble del multiplicador. Que existan sin horas normales del mismo rol suele ser un renglón mal escogido.', items: mal } : null;
      }
    },
    {
      destino: () => ({ tab: 'secc' }),
      id: 'sin-supervision', severidad: 'blanda', area: 'Mano de obra',
      titulo: 'Hay técnicos en sitio y nadie los supervisa',
      evaluar: (m) => {
        const mal = secs(m).filter(s => {
          const h = {}; (s.mo || []).forEach(l => { h[l.rol] = (h[l.rol] || 0) + Number(l.qty || 0); });
          return (h.tecnicos > 0) && !(h.supervisor_sr > 0) && !(h.supervisor_jr > 0);
        });
        return mal.length ? { detalle: 'El machote separa supervisor Sr y Jr-seguridad justo porque la cuadrilla no va sola.', items: mal.map(s => s.nombre) } : null;
      }
    },
    {
      destino: () => ({ tab: 'secc' }),
      id: 'jornada-larga', severidad: 'blanda', area: 'Mano de obra',
      titulo: 'Jornadas por arriba de lo razonable',
      evaluar: (m, c) => {
        const mal = c.secciones.filter(s => {
          const personas = Math.max.apply(null, [1].concat((m.secciones.find(x => x.id === s.id) || {}).mo
            ? (m.secciones.find(x => x.id === s.id).mo || []).map(l => Number(l.personas) || 0) : [0]));
          return personas > 0 && (s.horas / personas) > UMBRALES.horas_por_dia_persona * 30;
        });
        return mal.length ? { detalle: 'SUPUESTO: el tope de ' + UMBRALES.horas_por_dia_persona +
                              ' h/día por persona es inventado. Revisa si el plazo alcanza.',
                              items: mal.map(s => s.nombre + ' · ' + Math.round(s.horas) + ' h-hombre') } : null;
      }
    },

    // ── Estructura ─────────────────────────────────────────────────────────
    {
      destino: () => ({ tab: 'secc' }),
      id: 'sin-secciones', severidad: 'dura', area: 'Estructura',
      titulo: 'El machote no tiene ninguna sección con contenido',
      evaluar: (m, c) => c.secciones.filter(s => s.costo > 0).length ? null
        : { detalle: 'No hay ni una partida ni un renglón de mano de obra con importe.' }
    },
    {
      // MACHOTE — la tabla RESUMEN del Excel tiene diez filas de sección y de
      // ahí sale el precio. El USD de calbee 2026 tiene ONCE hojas de sección:
      // la once no llega al precio y el Excel no avisa. La herramienta SÍ deja
      // pasar de diez -para no impedir lo que el negocio ya hace- pero lo
      // marca como hallazgo duro, porque es dinero que se pierde en silencio.
      destino: () => ({ tab: 'secc' }),
      id: 'exceso-secciones', severidad: 'dura', area: 'Estructura',
      titulo: 'Más secciones de las que caben en el machote',
      evaluar: (m) => secs(m).length > C.MAX_SECCIONES
        ? { detalle: 'Hay ' + secs(m).length + ' secciones y el machote tiene ' + C.MAX_SECCIONES +
                     ' ranuras. Las ranuras se llenan por POSICIÓN, así que a partir de la ' +
                     (C.MAX_SECCIONES + 1) + ' el importe no llega al precio. Reordena o consolida.',
            items: secs(m).slice(C.MAX_SECCIONES).map((x, i) =>
              'Ranura ' + (C.MAX_SECCIONES + i + 1) + ': ' + (x.nombre || '(sin nombre)')) }
        : null
    },
    {
      // Si se convierte de moneda, hay que poder auditar de dónde salió el
      // tipo de cambio tres meses después.
      destino: () => ({ tab: 'gen' }),
      id: 'tc-sin-origen', severidad: 'blanda', area: 'Moneda',
      titulo: 'Tipo de cambio sin decir de dónde salió',
      evaluar: (m, c) => (c.mezclaMoneda && Number(m.tc) > 0 && !m.tc_fuente)
        ? { detalle: 'Se está convirtiendo a ' + Number(m.tc).toFixed(2) +
                     ' y no dice si es el DOF, el FIX, el del banco o uno acordado. ' +
                     'En tres meses nadie va a poder reconstruir el precio.' }
        : null
    },
    {
      destino: () => ({ tab: 'gen' }),
      id: 'moneda-contra-empresa', severidad: 'info', area: 'Moneda',
      titulo: 'La moneda no es la de la empresa',
      evaluar: (m) => (m.moneda && m.moneda !== C.monedaPorDefecto(m))
        ? { detalle: C.empresaDe(m).corto + ' factura en ' + C.monedaPorDefecto(m) +
                     ' y esta cotización va en ' + m.moneda + '. Puede ser correcto; confírmalo.' }
        : null
    },
    {
      destino: () => ({ tab: 'secc' }),
      id: 'seccion-sin-mo', severidad: 'blanda', area: 'Estructura',
      titulo: 'Secciones con material y sin mano de obra',
      evaluar: (m) => {
        const f = secs(m).filter(s => (s.partidas || []).some(usada) && !(s.mo || []).some(l => Number(l.qty) > 0));
        return f.length ? { detalle: '¿El material se instala solo?', items: f.map(s => s.nombre) } : null;
      }
    },
    {
      destino: () => ({ tab: 'secc' }),
      id: 'seccion-sin-material', severidad: 'info', area: 'Estructura',
      titulo: 'Secciones de pura mano de obra',
      evaluar: (m) => {
        const f = secs(m).filter(s => !(s.partidas || []).some(usada) && (s.mo || []).some(l => Number(l.qty) > 0));
        return f.length ? { detalle: 'Puede ser correcto (servicio puro). Solo confirma que no falte consumible.', items: f.map(s => s.nombre) } : null;
      }
    },
    {
      destino: () => ({ tab: 'secc' }),
      id: 'seccion-sin-nombre', severidad: 'blanda', area: 'Estructura',
      titulo: 'Secciones sin nombre propio',
      evaluar: (m) => {
        const f = secs(m).filter(s => !s.nombre || /^SECCION\s*\d+$/i.test(s.nombre.trim()));
        return f.length ? { detalle: 'En las cotizaciones grandes las secciones se renombran al alcance real. "SECCION 3" no le dice nada a quien la ejecute.',
                            items: f.map(s => s.nombre || '(vacía)') } : null;
      }
    },

    // ── Diagnóstico ────────────────────────────────────────────────────────
    {
      destino: () => ({ tab: 'diag' }),
      id: 'sin-tipo-proyecto', severidad: 'dura', area: 'Diagnóstico',
      titulo: 'No se declaró el tipo de proyecto',
      evaluar: (m) => tipoDe(m) ? null
        : { detalle: 'Sin tipo no se sabe qué preguntas críticas faltan por responder.' }
    },
    {
      destino: () => ({ tab: 'diag' }),
      id: 'criticas-sin-responder', severidad: 'dura', area: 'Diagnóstico',
      titulo: 'Preguntas críticas sin responder',
      evaluar: (m) => {
        const t = tipoDe(m); if (!t) return null;
        const r = (m.diagnostico || {}).respuestas || {};
        const f = t.preguntas.filter(q => q.critica && !r[q.id]);
        return f.length ? { detalle: 'SUPUESTO: el cuestionario es invención mía, no sale del machote. Pero cada pregunta apunta a un costo que se descubre tarde.',
                            items: f.map(q => q.texto + ' → ' + q.riesgo_si_no) } : null;
      }
    }
  ];

  /** Corre todas las reglas. Devuelve los hallazgos agrupados por severidad. */
  function revisar(m) {
    const c = C.calcular(m);
    const hallazgos = [];
    REGLAS.forEach(r => {
      let res = null;
      try { res = r.evaluar(m, c); }
      catch (e) { res = { detalle: 'La regla falló al evaluar: ' + e.message }; }
      if (res) {
        let dest = null;
        try { dest = r.destino ? r.destino(m, c) : null; } catch (e) { dest = null; }
        hallazgos.push({ id: r.id, severidad: r.severidad, area: r.area, titulo: r.titulo,
                         detalle: res.detalle || '', items: res.items || [], destino: dest });
      }
    });
    const duras   = hallazgos.filter(h => h.severidad === 'dura');
    const blandas = hallazgos.filter(h => h.severidad === 'blanda');
    const infos   = hallazgos.filter(h => h.severidad === 'info');
    return { hallazgos, duras, blandas, infos, calc: c,
             puedeConfirmar: duras.length === 0, total: hallazgos.length };
  }

  G.REGLAS = { REGLAS, UMBRALES, revisar };
  G.MachoteReglas = G.REGLAS;
})(window);
