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

  /* ── Los doce renglones fijos de mano de obra ──────────────────────────
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
   *  es la columna que decide el precio. Sin tipo no hay precio. */
  function costoPartida(linea, m) {
    const mg = margenes(m);
    const sinPrecio = vacio(linea.pu);
    const pu = sinPrecio ? 0 : num(linea.pu);
    const costo = aMonedaDoc(pu * num(linea.qty), linea.moneda, m);
    const sinTipo = TIPOS.indexOf(linea.tipo) === -1;
    const mult = sinTipo ? 0 : num(linea.tipo === 'Materiales' ? mg.materiales : mg.servicios);
    return { costo, mult, conUtilidad: costo * mult, sinPrecio, sinTipo, sinLink: !linea.link };
  }

  function totalSeccion(s, m) {
    let costoMoTot = 0, ventaMo = 0, horas = 0, moSinTarifa = 0;
    let costoMat = 0, ventaMat = 0, sinPrecio = 0, sinTipo = 0, sinLink = 0;
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
      const usada = num(l.qty) > 0 || !vacio(l.pu) || l.descripcion;
      if (!usada) return;
      if (c.sinPrecio) sinPrecio++;
      if (c.sinTipo) sinTipo++;
      if (c.sinLink && !vacio(l.pu)) sinLink++;
      if (l.moneda) monedas[l.moneda] = 1;
    });

    return {
      id: s.id, nombre: s.nombre,
      costoMo: costoMoTot, costoMat, costo: costoMoTot + costoMat,
      ventaMo, ventaMat, venta: ventaMo + ventaMat,
      horas, moSinTarifa, sinPrecio, sinTipo, sinLink,
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
      const peso = costo > 0 ? s.costo / costo : 0;
      const precioSec = elegido.precio === null ? null
        : (elegido.id === 'con_utilidad' ? s.venta + (comFtsCU + comCliCU) * (venta > 0 ? s.venta / venta : 0)
        : elegido.id === 'costo' ? s.costo
        : elegido.precio * peso);
      return Object.assign({}, s, {
        peso,
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
      sinPrecio, moSinTarifa, sinTipo, sinLink, mezclaMoneda,
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
    MARGENES_PLANTILLA, COMISION_FTS_PLANTILLA, MARGEN_DESEADO_PLANTILLA, REPARTO_PLANTILLA,
    tcEfectivo, margenes, costoMo, costoPartida, totalSeccion,
    calcular, precioParaMargen, repartir
  };
})(window);
