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
    { id: 'he_diseno',       grupo: 'extras', label: 'Horas extras diseño',       pu: 140, mult: 'extra' }
  ];
  const ROL = {};
  ROLES.forEach(r => { ROL[r.id] = r; });

  const GRUPOS = [
    { id: 'diseno', label: 'Diseño y Programación' },
    { id: 'planta', label: 'En Planta' },
    { id: 'extras', label: 'Extras' }
  ];

  /* Valores de la plantilla original (Machote general MXN - SO.xlsx).
   * Programador y mano de obra no variaron en ninguno de los 8 ejemplares
   * leídos; materiales y servicios sí, por eso son campos y no constantes. */
  const MARGENES_PLANTILLA = { programador: 4.4, mano_obra: 2.5, materiales: 1.8, servicios: 1.7 };
  const COMISION_FTS_PLANTILLA = 0.055;
  const MARGEN_DESEADO_PLANTILLA = 0.40;
  const REPARTO_PLANTILLA = { venta: 0.73, operaciones: 0.27 };
  const MAX_SECCIONES = 10;

  const TIPOS = ['Materiales', 'Servicios'];

  /** ¿Alguien escribió algo en este renglón de materiales?
   *  Definición ÚNICA: la usan el motor, las reglas y la pantalla. Estaba
   *  escrita tres veces —dos aquí y una en `reglas.js`— y con matices distintos;
   *  tres definiciones de lo mismo terminan divergiendo. */
  const usadaPartida = (l) => !!l && (num(l.qty) > 0 || !vacio(l.pu) || !!l.descripcion);

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
  function seccionNueva(nombre, moneda) {
    moneda = moneda || 'MXN';
    const mo = ROLES.map(r => ({
      rol: r.id,
      qty: '',          // horas: en cero, es lo que se captura
      personas: 1,
      pu: r.pu,         // la tarifa de plantilla, que el capturista puede pisar
      moneda: moneda
    }));
    const partidas = [];
    for (let i = 0; i < PARTIDAS_EN_BLANCO; i++) {
      partidas.push({
        qty: '', unidad: '', tipo: '',   // el Tipo lo elige el capturista: es
        descripcion: '', modelo: '', marca: '',   // la columna que decide el
        pu: null, moneda: moneda,                 // multiplicador
        margen: null, link: '', comentario: ''
      });
    }
    return { id: 's-' + Date.now() + '-' + Math.round(Math.random() * 1e6),
             nombre: nombre || 'SECCIÓN 1', mo: mo, partidas: partidas };
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
      cliente: d.cliente || '',
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
      secciones: [seccionNueva('SECCIÓN 1', empresa.moneda)]
    };
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

  /** Los cuatro multiplicadores vigentes del machote, ya resueltos. */
  function margenes(m) {
    const mg = Object.assign({}, MARGENES_PLANTILLA, m.margenes || {});
    // El multiplicador de horas extras no se captura: es el de mano de obra
    // por dos. En el Excel es literalmente =$F$3*2.
    mg.extra = num(mg.mano_obra) * 2;
    return mg;
  }

  /** Una línea de mano de obra: tarifa × personas × horas.
   *  El costo es tridimensional. Tarifa × horas se queda corto. */
  function costoMo(linea, m) {
    const r = ROL[linea.rol];
    const mg = margenes(m);
    const sinTarifa = vacio(linea.pu);
    const pu = sinTarifa ? 0 : num(linea.pu);
    const costo = aMonedaDoc(pu * num(linea.personas) * num(linea.qty), linea.moneda, m);
    const mult = r ? num(mg[r.mult]) : 0;
    return {
      costo,
      mult,
      conUtilidad: costo * mult,
      horas: num(linea.qty) * num(linea.personas),
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
  function costoPartida(linea, m) {
    const mg = margenes(m);
    const sinPrecio = vacio(linea.pu);
    const pu = sinPrecio ? 0 : num(linea.pu);
    const costo = aMonedaDoc(pu * num(linea.qty), linea.moneda, m);
    const sinTipo = TIPOS.indexOf(linea.tipo) === -1;
    const porTipo = sinTipo ? 0 : num(linea.tipo === 'Materiales' ? mg.materiales : mg.servicios);
    const pisado = !vacio(linea.margen) && Math.abs(num(linea.margen) - porTipo) > 0.0001;
    const mult = pisado ? num(linea.margen) : porTipo;
    return { costo, mult, porTipo, pisado,
             conUtilidad: costo * mult, sinPrecio, sinTipo, sinLink: !linea.link,
             // Un renglon del bloque en el que nadie ha escrito nada NO es un
             // hueco: es un renglon sin usar, como los del Excel. La diferencia
             // importa porque una seccion nueva trae 30 en blanco, y marcarlos
             // como defecto convierte la alerta en ruido.
             usada: usadaPartida(linea) };
  }

  function totalSeccion(s, m) {
    let costoMoTot = 0, ventaMo = 0, horas = 0, moSinTarifa = 0;
    let costoMat = 0, ventaMat = 0, sinPrecio = 0, sinTipo = 0, sinLink = 0, pisados = 0;
    const monedas = {};

    (s.mo || []).forEach(l => {
      const c = costoMo(l, m);
      costoMoTot += c.costo; ventaMo += c.conUtilidad; horas += c.horas;
      if (c.sinTarifa && (num(l.qty) > 0 || num(l.personas) > 0)) moSinTarifa++;
      if (l.moneda) monedas[l.moneda] = 1;
    });
    (s.partidas || []).forEach(l => {
      const c = costoPartida(l, m);
      costoMat += c.costo; ventaMat += c.conUtilidad;
      if (!c.usada) return;
      if (c.sinPrecio) sinPrecio++;
      if (c.sinTipo) sinTipo++;
      if (c.pisado) pisados++;
      if (c.sinLink && !vacio(l.pu)) sinLink++;
      if (l.moneda) monedas[l.moneda] = 1;
    });

    return {
      id: s.id, nombre: s.nombre,
      costoMo: costoMoTot, costoMat, costo: costoMoTot + costoMat,
      ventaMo, ventaMat, venta: ventaMo + ventaMat,
      horas, moSinTarifa, sinPrecio, sinTipo, sinLink, pisados,
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
    const mg = margenes(m);
    const secciones = (m.secciones || []).map(s => totalSeccion(s, m));

    const costoMoTot = secciones.reduce((a, s) => a + s.costoMo, 0);
    const costoMat   = secciones.reduce((a, s) => a + s.costoMat, 0);
    const costo      = costoMoTot + costoMat;
    const ventaMo    = secciones.reduce((a, s) => a + s.ventaMo, 0);
    const ventaMat   = secciones.reduce((a, s) => a + s.ventaMat, 0);
    const venta      = ventaMo + ventaMat;              // precio antes de comisiones
    const horas      = secciones.reduce((a, s) => a + s.horas, 0);

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
      const esc = {
        costo: { mo: s.costoMo, mat: s.costoMat, precio: s.costo },
        con_utilidad: {
          mo: s.ventaMo, mat: s.ventaMat,
          precio: s.venta + (comFtsCU + comCliCU) * pesoV
        },
        margen_deseado: precioMD === null
          ? { mo: null, mat: null, precio: null }
          : { mo: precioMD * pMo, mat: precioMD * pMat, precio: precioMD * peso }
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
      comisiones: comisiones.map(l => ({ nombre: l.nombre, monto: -l.monto })),
      total: (elegido.precio || 0) - costoMoTot - costoMat - sumaCom
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
      costoMo: costoMoTot, costoMat, costo,
      ventaMo, ventaMat, venta,
      horas,
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
    ROLES, ROL, GRUPOS, TIPOS, ESCENARIOS, MAX_SECCIONES,
    EMPRESAS, empresaDe, monedaPorDefecto,
    MARGENES_PLANTILLA, COMISION_FTS_PLANTILLA, MARGEN_DESEADO_PLANTILLA, REPARTO_PLANTILLA,
    PARTIDAS_EN_BLANCO, EQUIPO_VENTA_PLANTILLA, EQUIPO_OPS_PLANTILLA, usadaPartida,
    seccionNueva, machoteNuevo,
    tcEfectivo, margenes, costoMo, costoPartida, totalSeccion,
    calcular, precioParaMargen, repartir
  };
})(window);
