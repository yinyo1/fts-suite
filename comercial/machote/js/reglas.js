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
  // Definicion unica en el motor: estaba repetida aqui y dos veces en calc.js,
  // con matices distintos. Tres definiciones de lo mismo terminan divergiendo.
  const usada = (l) => C.usadaPartida(l);
  const vacioPU = (l) => l.pu === null || l.pu === undefined || l.pu === '';
  const tipoDe = (m) => (G.DEMO.TIPOS_PROYECTO.find(t => t.id === (m.diagnostico || {}).tipo) || null);

  /* El nombre del país para leerlo en un hallazgo: «Estados Unidos», no «US».
   * Sale del catálogo si ya cargó; si no, del código, que sigue siendo cierto. */
  function paisNombre(codigo) {
    const g = G.MachoteGeo;
    const p = g && g.pais ? g.pais(codigo) : null;
    return (p && p.nombre) || codigo || '';
  }

  /* La primera sección donde un multiplicador cumple `mal`. Sirve para que el
   * botón "Ir a arreglarlo" abra la hoja correcta: desde que los
   * multiplicadores son por sección, mandar al DESGLOSE es mandar a una
   * pantalla donde no está el campo que hay que tocar. */
  function seccionConMargen(m, mal) {
    const base = C.MARGENES_PLANTILLA;
    const s = (m.secciones || []).find(sec => {
      const mg = C.margenes(m, sec);
      return Object.keys(base).some(k => mal(Number(mg[k]), base[k]));
    });
    return { tab: 'secc', seccion: s ? s.id : null };
  }

  const REGLAS = [

    // ── Márgenes: la tabla que gobierna todo el precio ─────────────────────
    {
      // MACHOTE — programador 4,4 y mano de obra 2,5 no variaron en ninguno de
      // los 8 ejemplares leídos. Si alguien los mueve, es a propósito o es error.
      destino: (m) => seccionConMargen(m, (v, b) => Math.abs(v - b) > 0.001),
      id: 'margen-fuera-de-plantilla', severidad: 'blanda', area: 'Márgenes',
      titulo: 'Un multiplicador se movió de su valor de plantilla',
      // Los multiplicadores son POR SECCIÓN, así que se revisan sección por
      // sección y el hallazgo dice en cuál. Mirar sólo los del machote dejaba
      // de ver justo el caso que importa: una sección movida y las demás no.
      evaluar: (m) => {
        const base = C.MARGENES_PLANTILLA;
        const dif = [];
        (m.secciones || []).forEach((s, i) => {
          const mg = C.margenes(m, s);
          Object.keys(base).forEach(k => {
            if (Math.abs(Number(mg[k]) - base[k]) > 0.001) {
              dif.push((s.nombre || ('Sección ' + (i + 1))) + ' · ' +
                       k.replace('_', ' ') + ': ' + mg[k] + ' (plantilla ' + base[k] + ')');
            }
          });
        });
        if (!dif.length) return null;
        const duros = dif.filter(d => /programador|mano obra/.test(d));
        return { detalle: duros.length
            ? 'Programador y mano de obra son iguales en los 8 machotes revisados. Moverlos cambia el precio de toda la mano de obra.'
            : 'Materiales y servicios sí varían por cotización, pero deja dicho por qué.',
          items: dif };
      }
    },
    {
      destino: (m) => seccionConMargen(m, (v) => v < 1),
      id: 'margen-invertido', severidad: 'dura', area: 'Márgenes',
      titulo: 'Un multiplicador está por debajo de 1',
      evaluar: (m) => {
        const mal = [];
        (m.secciones || []).forEach((s, i) => {
          const mg = C.margenes(m, s);
          Object.keys(C.MARGENES_PLANTILLA).forEach(k => {
            if (Number(mg[k]) < 1) {
              mal.push((s.nombre || ('Sección ' + (i + 1))) + ' · ' +
                       k.replace('_', ' ') + ' = ' + mg[k]);
            }
          });
        });
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

    // ── Viaje y trabajo foráneo (V1.26) ────────────────────────────────────
    //
    // El origen: Ricardo ha cobrado el trabajo de proyectos en Estados Unidos
    // pero NUNCA los días de vuelo, y el presupuesto de Albuquerque salió sin
    // viáticos ni hotel. No fue un cálculo mal hecho — el concepto no existía.
    //
    // La pieza que lo cierra es de Esteban, y es la razón de que esto sea una
    // regla DURA y no un recordatorio: «si a alguien se le olvida el vuelo,
    // también se le va a olvidar marcar que es foráneo». Que lo detecte el
    // sistema, a partir de un dato que sí se captura siempre: dónde se ejecuta.
    {
      destino: () => ({ tab: 'desglose' }),
      id: 'sin-lugar-ejecucion', severidad: 'dura', area: 'Viaje',
      titulo: 'No se dijo dónde se ejecuta',
      evaluar: (m) => C.tieneLugar(m) ? null : {
        detalle: 'País y ciudad son obligatorios: de ahí sale si la cotización es ' +
                 'foránea, y con eso si hay que cobrar vuelos, hotel y días de viaje. ' +
                 'Monterrey viene preseleccionado en las cotizaciones nuevas; ésta es ' +
                 'anterior al campo, por eso está vacío.'
      }
    },
    {
      destino: () => ({ tab: 'secc' }),
      /* ── V1.27 · el candado cambió de forma, y es MÁS estricto ──────────
       *
       * Antes exigía «que exista algún renglón de viaje». Con los cinco
       * conceptos ya puestos en cero (V1.27) esa exigencia se cumple sola y no
       * protege de nada — pero es que tampoco protegía antes: se conformaba
       * con UNO. Un vuelo capturado la satisfacía y el hotel olvidado pasaba
       * igual, que es **literalmente** lo que ocurrió con Albuquerque.
       *
       * Ahora exige una DECISIÓN por cada concepto: un importe, o un «no se
       * ocupa» explícito. Lo que no se puede es dejarlo sin mirar. */
      id: 'viaje-sin-resolver', severidad: 'dura', area: 'Viaje',
      titulo: 'Hay conceptos de viaje sin decidir',
      evaluar: (m, c) => {
        if (!c.lugar.foraneo) return null;
        if (c.viaje.no_aplica) return null;            // alguien lo decidió a mano
        if (!c.viajePorResolver) return null;
        const donde = [m.ciudad, m.region, paisNombre(m.pais)].filter(Boolean).join(', ');
        // Se nombran LOS QUE FALTAN, no «faltan 3»: la lista es la acción.
        const faltan = [];
        (c.secciones || []).forEach(sec => {
          (sec.conceptosViaje || []).forEach(x => {
            if (!x.resuelto && faltan.indexOf(x.label) < 0) faltan.push(x.label);
          });
        });
        return {
          detalle: 'Se ejecuta fuera de Nuevo León, así que hay traslado que cobrar. ' +
                   'Cada concepto necesita una decisión: escríbele el importe, o márcalo ' +
                   'como que no se ocupa. Lo que no se vale es dejarlo sin mirar — el ' +
                   'presupuesto de Albuquerque salió con el trabajo cobrado y el hotel no.',
          items: ['Se ejecuta en: ' + (donde || '(sin decir)')]
            .concat(faltan.map(x => 'Sin decidir: ' + x))
        };
      }
    },
    {
      destino: () => ({ tab: 'secc' }),
      id: 'viaje-marcado-no-aplica', severidad: 'blanda', area: 'Viaje',
      titulo: 'Cotización foránea marcada como «sin conceptos de viaje»',
      evaluar: (m, c) => (c.lugar.foraneo && c.viaje.no_aplica && c.renglonesViaje === 0 && c.dias === 0)
        ? { detalle: 'Queda constancia de que alguien lo decidió, no de que se olvidó. ' +
                     'Confirma que el cliente pone el traslado o que la gente ya está en sitio.' }
        : null
    },
    {
      destino: () => ({ tab: 'secc' }),
      id: 'viaje-con-margen', severidad: 'blanda', area: 'Viaje',
      titulo: 'Se escribió un margen sobre un renglón de viaje',
      evaluar: (m, c) => c.viajeConMargen ? {
        detalle: 'El viaje se cobra a costo, multiplicador 1: es regla del negocio, no ' +
                 'una opción. El motor IGNORÓ el margen escrito —el precio no subió— pero ' +
                 'conviene borrarlo para que el renglón no diga una cosa y valga otra.',
        items: [c.viajeConMargen + ' renglón(es)']
      } : null
    },
    {
      destino: () => ({ tab: 'desglose' }),
      id: 'festivo-sin-confirmar', severidad: 'info', area: 'Viaje',
      titulo: 'El recargo de días festivos sigue sin confirmarse',
      evaluar: (m, c) => {
        if (!c.lugar.eua) return null;
        const usa = (m.secciones || []).some(s => (s.mo || [])
          .some(l => l.rol === 'hrs_festivo' && Number(l.qty) > 0));
        if (!usa || c.viaje.recargo_festivo !== null) return null;
        return { detalle: 'Hay horas capturadas en día festivo y el recargo está vacío, ' +
                          'así que se están cobrando a tarifa normal. Lo del 30% es de ' +
                          'fin de semana; lo de festivos NO se ha confirmado con nadie. ' +
                          'Escribe el que aplique o deja las horas donde corresponda.' };
      }
    },

    {
      destino: () => ({ tab: 'secc' }),
      id: 'precio-viaje-sin-fecha', severidad: 'blanda', area: 'Viaje',
      titulo: 'Precios de viaje sin decir de cuándo son',
      evaluar: (m) => {
        const f = partidas(m).filter(x => x.l.tipo === C.TIPO_VIAJE && usada(x.l) &&
                                          !vacioPU(x.l) && !x.l.consultado_at);
        return f.length ? {
          detalle: 'Una cotización se manda semanas antes de volar y el precio de hoy no ' +
                   'es el que se va a pagar. Sin la fecha de consulta, el número se lee ' +
                   'como si fuera firme. Está a un clic, al lado del precio.',
          items: f.map(x => x.l.descripcion || '(sin descripción)')
        } : null;
      }
    },
    {
      destino: () => ({ tab: 'secc' }),
      id: 'precio-viaje-viejo', severidad: 'blanda', area: 'Viaje',
      titulo: 'Precios de viaje consultados hace más de tres semanas',
      evaluar: (m) => {
        const hoy = Date.now();
        const f = partidas(m).filter(x => {
          if (x.l.tipo !== C.TIPO_VIAJE || !usada(x.l) || !x.l.consultado_at) return false;
          const t = Date.parse(x.l.consultado_at + 'T12:00:00');
          return isFinite(t) && (hoy - t) / 86400000 > 21;
        });
        return f.length ? {
          detalle: 'Los vuelos se mueven, y hacia arriba conforme se acerca la fecha. ' +
                   'Vuelve a consultar antes de mandar la cotización, o dile al cliente ' +
                   'hasta cuándo se sostiene el precio.',
          items: f.map(x => (x.l.descripcion || '(sin descripción)') + ' · consultado ' + x.l.consultado_at)
        } : null;
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
