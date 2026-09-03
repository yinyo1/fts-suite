// ═══ Nómina · Incidencias — catálogo del dominio ═══
//
// Datos puros: qué se puede declarar, con qué campos, y qué se deriva de qué.
// SIN estado, SIN DOM, SIN red. Se carga igual en el navegador que en node (el gate
// lo requiere directo), por eso el doble export del final.
//
// POR QUÉ UN CATÁLOGO CERRADO. El origen del problema que este módulo resuelve es que
// las incidencias se mandaban por WhatsApp en texto libre: cada quien escribía el
// concepto como le salía y el despacho interpretaba. Un catálogo cerrado convierte
// "lo que quiso decir" en "lo que declaró", que es la mitad del valor del módulo.

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NomCatalogo = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // ─── Fuentes de pago ───
  // La EMPRESA y la MONEDA no se preguntan: se derivan del journal. Es la derivación
  // que más errores evita — un bono de Chase es forzosamente USD de FTS LLC, y dejar
  // que alguien lo teclee es dejar que lo teclee mal.
  var JOURNALS = {
    'J96':      { nombre: 'BBVA Nómina',           empresa: 'Servicios FTS', moneda: 'MXN' },
    'J8':       { nombre: 'BBVA General',          empresa: 'Servicios FTS', moneda: 'MXN' },
    'J75':      { nombre: 'BBVA USD',              empresa: 'Servicios FTS', moneda: 'USD' },
    'J74':      { nombre: 'Payana',                empresa: 'Servicios FTS', moneda: 'MXN' },
    'J111':     { nombre: 'Monex MXN',             empresa: 'Servicios FTS', moneda: 'MXN' },
    'J112':     { nombre: 'Monex USD',             empresa: 'Servicios FTS', moneda: 'USD' },
    'J61':      { nombre: 'Jeeves',                empresa: 'Servicios FTS', moneda: 'MXN' },
    'J122':     { nombre: 'Chase Checking',        empresa: 'FTS LLC',       moneda: 'USD' },
    'J123':     { nombre: 'Chase TDC',             empresa: 'FTS LLC',       moneda: 'USD' },
    'FACT':     { nombre: 'Factura del receptor',  empresa: '—',             moneda: 'según proyecto' },
    'SIN-PAGO': { nombre: 'Devengado sin pago',    empresa: '—',             moneda: 'no sale efectivo' }
  };

  // ─── Rubro del bono, derivado del puesto ───
  // Los dos puestos de mando cobran el bono contra 4.1; el resto de Operaciones contra 4.2.
  // Fuera de Operaciones no hay rubro de bono de obra, y eso NO es un hueco: es la regla.
  var PUESTOS_SUPERVISION = ['Operations Manager', 'Supervisor SR Operaciones'];

  function rubroBono(empleado) {
    if (!empleado || empleado.departamento !== 'Operaciones') return null;
    return PUESTOS_SUPERVISION.indexOf(empleado.puesto) >= 0
      ? '4.1 Bono Supervisores'
      : '4.2 Bono Técnicos';
  }

  // ─── Cómo cuenta cada tipo contra el candado aritmético ───
  //   'usa'   → días trabajados fuera de México
  //   'vac'   → vacaciones y festivos (día pagado, no trabajado)
  //   'falta' → faltas, permisos, incapacidad
  //   null    → no consume días de la semana (dinero, descuentos, descanso trabajado)
  var CATALOGO = {
    dias: {
      titulo: 'Días y ausencias',
      ayuda: 'Todo lo que consume días de la semana. La suma tiene que dar exacto.',
      items: {
        vacaciones:          { label: 'Vacaciones',           cuenta: 'vac',   campos: [['dias', 'Días', 'num']] },
        falta_injustificada: { label: 'Falta injustificada', cuenta: 'falta', campos: [['dias', 'Días', 'num']] },
        falta_justificada:   { label: 'Falta justificada',   cuenta: 'falta', campos: [['dias', 'Días', 'num'], ['motivo', 'Motivo', 'txt']] },
        incapacidad:         { label: 'Incapacidad',          cuenta: 'falta', campos: [['dias', 'Días', 'num'], ['folio', 'Folio IMSS', 'txt'], ['clase', 'Tipo', ['Enfermedad general', 'Riesgo de trabajo', 'Maternidad']]] },
        permiso_con_goce:    { label: 'Permiso con goce',    cuenta: 'falta', campos: [['dias', 'Días', 'num'], ['motivo', 'Motivo', 'txt']] },
        permiso_sin_goce:    { label: 'Permiso sin goce',    cuenta: 'falta', campos: [['dias', 'Días', 'num'], ['motivo', 'Motivo', 'txt']] },
        dia_cumpleanos:      { label: 'Día de cumpleaños',   cuenta: 'vac',   campos: [['dias', 'Días', 'num']] },
        trabajo_usa:         { label: 'Trabajó en USA',       cuenta: 'usa',   campos: [['dias', 'Días', 'num'], ['so', 'Proyecto', 'so']] },
        dia_festivo:         { label: 'Día festivo',          cuenta: 'vac',   campos: [['dias', 'Días', 'num']] },
        descanso_trabajado:  { label: 'Descanso trabajado',   cuenta: null,    campos: [['dias', 'Días', 'num'], ['prima', 'Prima dominical', 'bool']] }
      }
    },
    dinero: {
      titulo: 'Dinero adicional',
      ayuda: 'Percepciones que no son el sueldo de la semana. Todas piden fuente de pago.',
      items: {
        bono_proyecto:    { label: 'Bono de proyecto', multi: true, fuente: true, rubro: true, campos: [['monto', 'Monto', 'num'], ['so', 'Proyecto', 'so']] },
        bono_productividad: { label: 'Bono de productividad', fuente: true, campos: [['monto', 'Monto', 'num'], ['motivo', 'Motivo', 'txt']] },
        bono_condicionado:  { label: 'Bono condicionado',     fuente: true, campos: [['monto', 'Monto', 'num'], ['motivo', 'Condición', 'txt']] },
        prima_vacacional: { label: 'Prima vacacional', fuente: true, campos: [['monto', 'Monto', 'num']] },
        aguinaldo:        { label: 'Aguinaldo',        fuente: true, campos: [['monto', 'Monto', 'num']] },
        fondo_ahorro:     { label: 'Fondo de ahorro',  fuente: true, campos: [['monto', 'Monto', 'num']] },
        finiquito:        { label: 'Finiquito',        fuente: true, campos: [['monto', 'Monto', 'num'], ['fecha', 'Fecha de baja', 'date']] },
        tiempo_extra:     { label: 'Tiempo extra',     fuente: true, campos: [['horas', 'Horas', 'num'], ['monto', 'Monto', 'num']] },
        ajuste_sueldo:    { label: 'Ajuste de sueldo', fuente: true, campos: [['monto', 'Monto', 'num'], ['motivo', 'Motivo', ['Corrección de captura', 'Retroactivo', 'Cambio de tabulador']]] }
      }
    },
    desc: {
      titulo: 'Descuentos y compensaciones',
      ayuda: 'Dinero que se descuenta o que se entrega y luego se recupera.',
      items: {
        // NO_COSTO: es un préstamo, no costo laboral de la semana. Ver #134/#141:
        // mandarlo al puente de MO lo convertiría en gasto indirecto, que no es.
        anticipo_sueldo:     { label: 'Anticipo de sueldo',     fuente: true, no_costo: true, campos: [['monto', 'Monto', 'num'], ['plazo', 'Semanas para pagarlo', 'num']] },
        descuento_anticipo:  { label: 'Descuento de anticipo',  campos: [['monto', 'Monto', 'num']] },
        compensa_deuda:      { label: 'Compensa contra deuda',  campos: [['monto', 'Monto', 'num']] },
        descuento_prestamo:  { label: 'Descuento por préstamo', campos: [['monto', 'Monto', 'num'], ['pago', 'Número de pago', 'num']] },
        pagado_fts_usa:      { label: 'Pagado por FTS USA',     fuente: true, campos: [['monto', 'Monto', 'num']] }
      }
    },
    estado: {
      titulo: 'Estado de la persona',
      ayuda: 'Dura semanas y NO se vuelve a declarar cada viernes. Tiene vigencia.',
      es_estado: true,
      items: {
        alta:            { label: 'Alta',                campos: [['desde', 'Vigente desde', 'date'], ['puesto', 'Puesto', 'txt']] },
        baja:            { label: 'Baja',                campos: [['desde', 'Vigente desde', 'date'], ['motivo', 'Motivo', ['Renuncia', 'Despido', 'Fin de contrato']]] },
        asignacion_usa:  { label: 'Asignación a USA',    campos: [['desde', 'Desde', 'date'], ['hasta', 'Hasta', 'date']] },
        standby:         { label: 'Standby',             campos: [['desde', 'Desde', 'date'], ['hasta', 'Hasta', 'date']] },
        cambio_esquema:  { label: 'Cambio de esquema',   campos: [['desde', 'Desde', 'date'], ['esquema', 'Esquema', ['Nómina', 'Asimilados', 'Honorarios']]] },
        cambio_puesto:   { label: 'Cambio de puesto',    campos: [['desde', 'Desde', 'date'], ['puesto', 'Puesto nuevo', 'txt']] },
        deuda_fts:       { label: 'Deuda con FTS',       campos: [['desde', 'Desde', 'date'], ['total', 'Monto total', 'num'], ['saldo', 'Saldo', 'num']] }
      }
    }
  };

  // Busca un tipo en los 4 grupos. Devuelve {grupo, grupoDef, def} o null.
  function meta(tipo) {
    for (var g in CATALOGO) {
      if (Object.prototype.hasOwnProperty.call(CATALOGO[g].items, tipo)) {
        return { grupo: g, grupoDef: CATALOGO[g], def: CATALOGO[g].items[tipo] };
      }
    }
    return null;
  }

  function tiposDeclarables() {
    var out = [];
    for (var g in CATALOGO) { if (!CATALOGO[g].es_estado) { for (var t in CATALOGO[g].items) out.push(t); } }
    return out;
  }

  function tiposDeEstado() {
    var out = [];
    for (var t in CATALOGO.estado.items) out.push(t);
    return out;
  }

  return {
    JOURNALS: JOURNALS,
    PUESTOS_SUPERVISION: PUESTOS_SUPERVISION,
    CATALOGO: CATALOGO,
    meta: meta,
    rubroBono: rubroBono,
    tiposDeclarables: tiposDeclarables,
    tiposDeEstado: tiposDeEstado
  };
});
