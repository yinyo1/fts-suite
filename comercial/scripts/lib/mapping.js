// ═══ Limpieza comercial 2026-08 · tablas de decisión ═══
// Codifica las decisiones de Esteban del issue #131 (29-ago-2026) y el comentario
// de desbloqueo. NADA de esto se inventa aquí: cada constante cita su origen.
//
// Regla de oro del módulo: este archivo es la ÚNICA fuente de las tablas de
// decisión. Los 7 lotes las importan; si un lote necesita su propia copia,
// es que alguien se salió del carril.

'use strict';

// ── Etapas actuales en Odoo (leídas de crm.stage el 2026-08-29) ──
// id → {name, sequence, is_won, fold}. Congelado a propósito: si Odoo cambia,
// el script lo detecta al arrancar y aborta (ver verificarEtapas()).
const ETAPAS_ODOO = {
  20: { name: 'Adiccionales Topo (Monty)', sequence: 0,  is_won: false, fold: false },
  17: { name: 'Prospecto Lead',            sequence: 1,  is_won: false, fold: false },
  15: { name: 'Lead Calificado/Por cotizar', sequence: 2, is_won: false, fold: false },
  5:  { name: 'Cotizacion Enviada',        sequence: 3,  is_won: false, fold: false },
  21: { name: 'Qualified',                 sequence: 4,  is_won: false, fold: false },
  8:  { name: 'Proyecto Ganado',           sequence: 5,  is_won: true,  fold: false },
  9:  { name: 'CANCELADO',                 sequence: 6,  is_won: false, fold: false },
  4:  { name: 'Proyecto Ganado - Con PO',  sequence: 7,  is_won: false, fold: true  },
  14: { name: 'Pendiente Por Enviar',      sequence: 8,  is_won: false, fold: true  },
  18: { name: 'Revisar',                   sequence: 9,  is_won: false, fold: false },
  3:  { name: 'Cotizacion...',             sequence: 10, is_won: false, fold: false },
  12: { name: 'Cot Enviada Mdlz',          sequence: 11, is_won: false, fold: false },
};

// ── L2: consolidación 12 → 5 etapas + el mecanismo "lost" (#131 decisión 1) ──
// Ojo: "Perdido" NO es una etapa en Odoo. Es `active=false` + `lost_reason_id`
// (lo aplica L1). Por eso el destino son 5 filas de crm.stage, no 6.
const ETAPAS_DESTINO = {
  PROSPECTO:  { id: 17, name: 'Prospecto Lead',              sequence: 1, is_won: false },
  POR_COTIZAR:{ id: 15, name: 'Lead Calificado/Por cotizar', sequence: 2, is_won: false },
  ENVIADA:    { id: 5,  name: 'Cotizacion Enviada',          sequence: 3, is_won: false },
  REVISAR:    { id: 18, name: 'Revisar',                     sequence: 4, is_won: false },
  GANADO:     { id: 8,  name: 'Proyecto Ganado',             sequence: 5, is_won: true  },
};

// Mapping etapa_actual → etapa_destino. Las que se conservan se mapean a sí mismas
// (explícito > implícito: así el reporte muestra las 12 y no hay etapa sin decisión).
const MAPPING_ETAPAS = {
  20: { destino: ETAPAS_DESTINO.POR_COTIZAR, tag: 'Topo Chico',
        razon: 'Variante por cliente: se absorbe con tag, no etapa (#131 dec.1)' },
  17: { destino: ETAPAS_DESTINO.PROSPECTO,   tag: null, razon: 'Se conserva' },
  15: { destino: ETAPAS_DESTINO.POR_COTIZAR, tag: null, razon: 'Se conserva' },
  5:  { destino: ETAPAS_DESTINO.ENVIADA,     tag: null, razon: 'Se conserva' },
  21: { destino: ETAPAS_DESTINO.POR_COTIZAR, tag: null,
        razon: '"Qualified" (default de Odoo en inglés) duplica "Lead Calificado"' },
  8:  { destino: ETAPAS_DESTINO.GANADO,      tag: null, razon: 'Se conserva (única con is_won)' },
  9:  { destino: null,                        tag: null,
        razon: 'CANCELADO lo consume L1 (set_lost + archivar). No se remapea.' },
  4:  { destino: ETAPAS_DESTINO.GANADO,      tag: null,
        razon: 'Se fusiona a Ganado (#131 dec.1). Hoy NO tiene is_won → no contaba como ganado.' },
  14: { destino: ETAPAS_DESTINO.POR_COTIZAR, tag: null,
        razon: 'Redundante con "Por cotizar": es una cotización aún no enviada' },
  18: { destino: ETAPAS_DESTINO.REVISAR,     tag: null, razon: 'Se conserva' },
  3:  { destino: ETAPAS_DESTINO.ENVIADA,     tag: null,
        razon: '"Cotizacion..." es nombre basura de la misma etapa que "Cotizacion Enviada"' },
  12: { destino: ETAPAS_DESTINO.ENVIADA,     tag: 'Mondelez',
        razon: 'Fork por cliente: se absorbe con tag (#131 dec.1)' },
};

// Etapas que quedan VACÍAS tras el remapeo y deben archivarse (active=false),
// nunca borrarse (regla de la sesión: archivar, nunca unlink).
const ETAPAS_A_ARCHIVAR = [20, 21, 4, 14, 3, 12, 9];

// ── L4: dueños (#131 dec.2 + comentario de desbloqueo) ──
const DUENOS_VIGENTES   = ['Aldo', 'Montalvo', 'Esteban'];       // en la hoja 06_Clientes-Usuarios
const DUENOS_NO_VIGENTES = ['Diego', 'Luis', 'Rissia'];          // en la hoja, ya no están
const EXFTS_DNDOLE      = ['Angel', 'Yusti', 'Diego', 'Bethania']; // valores del selection a vaciar

// Valor exacto del selection x_studio_dndole en Odoo por dueño.
// OJO: Aldo aparece como 'Aldo Mendez' en Odoo pero como 'Aldo' en el CSV.
const DNDOLE_ODOO = {
  Aldo:     'Aldo Mendez',
  Montalvo: 'Montalvo',
  Esteban:  'Esteban',
  Ricardo:  'Ricardo',
};

// Reparto por cartera vigente (decisión 26-ago-2026, citada en el desbloqueo de #131).
// Se aplica SOLO cuando la cuenta no tiene un dueño vigente en la hoja.
// Cada entrada: patrones que deben aparecer en el nombre normalizado de la cuenta.
const CARTERA = [
  { dueno: 'Aldo',     patrones: ['magnekon', 'gruma', 'mission food', 'mision food', 'corporate usa',
                                  'bridgestone', 'abb', 'gepp', 'budenheim'] },
  { dueno: 'Montalvo', patrones: ['nalco', 'vertiv', 'topo chico', 'topochico', 'johnson controls',
                                  'clarios', 'optima', 'recicladora', 'chemtreat', 'quimitec',
                                  'mondelez', 'mdlz', 'forza'] },
  { dueno: 'Ricardo',  patrones: ['hayward', 'calbee'] },
  { dueno: 'Esteban',  patrones: ['robert barrera'] },
];

// Excepciones explícitas de cartera (el patrón simple daría un falso positivo).
const CARTERA_EXCEPCIONES = [
  // "GRUMA/Mission Foods (fuera de Hayward)" → Hayward manda sobre Mission/GRUMA.
  { si_contiene: 'hayward', dueno: 'Ricardo',
    nota: 'Hayward gana sobre GRUMA/Mission: la cartera dice "fuera de Hayward"' },
  // Nalco Brasil no es la cuenta Nalco MX de Montalvo (la hoja la tenía en Rissia).
  { si_contiene: 'nalco brasil', dueno: null,
    nota: 'Nalco Brasil ≠ Nalco MX; sin dueño vigente definido → Revisar' },
];

// ── L1: motivo de pérdida ──
// crm.lost.reason tiene 16 motivos (leídos 2026-08-29) y NINGUNO es "cancelada".
// L1 debe CREARLO (único create de la limpieza) o Esteban elige uno existente.
const LOST_REASON_NOMBRE = 'Cancelada (limpieza 2026-08)';

// ── Trazabilidad (#131 regla) ──
const MARCA_CHATTER = '[limpieza-2026-08]';

// ═══ Helpers ═══

/** Normaliza un nombre de cuenta para comparar: sin acentos, sin puntuación, minúsculas. */
function normalizar(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // quita acentos
    .toLowerCase()
    .replace(/\b(s\.?a\.?\s*de\s*c\.?v\.?|s\.?\s*de\s*r\.?l\.?|llc|inc|corp|ltd|sapi|cv)\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resuelve el dueño de una cuenta según #131 dec.2.
 * Prioridad: (1) dueño vigente en la hoja → tal cual · (2) cartera · (3) sin dueño.
 * @param {string} nombreCuenta  partner_id o partner_name del lead
 * @param {Map<string,object>} hoja  cuentas del CSV agregadas por empresa normalizada
 * @returns {{dueno:string|null, via:string, detalle:string, conflicto:string|null}}
 */
function resolverDueno(nombreCuenta, hoja) {
  const norm = normalizar(nombreCuenta);

  // Excepciones primero: ganan sobre todo lo demás.
  for (const ex of CARTERA_EXCEPCIONES) {
    if (norm.includes(normalizar(ex.si_contiene))) {
      return ex.dueno
        ? { dueno: ex.dueno, via: 'excepcion', detalle: ex.nota, conflicto: null }
        : { dueno: null, via: 'excepcion', detalle: ex.nota, conflicto: null };
    }
  }

  // (1) La cuenta está en la hoja con un dueño vigente.
  const entrada = buscarEnHoja(norm, hoja);
  if (entrada) {
    const vigentes = entrada.duenos.filter((d) => DUENOS_VIGENTES.includes(d.nombre));
    if (vigentes.length) {
      // Si hay varios vigentes, gana el de más contactos; empate → se marca ambiguo.
      vigentes.sort((a, b) => b.n - a.n);
      const empate = vigentes.length > 1 && vigentes[0].n === vigentes[1].n;
      const porCartera = buscarCartera(norm);
      const conflicto = porCartera && porCartera !== vigentes[0].nombre
        ? `hoja dice ${vigentes[0].nombre}, cartera dice ${porCartera}`
        : null;
      return {
        dueno: vigentes[0].nombre,
        via: empate ? 'hoja_empate' : 'hoja_vigente',
        detalle: `cuenta "${entrada.empresa}" · ${entrada.duenos.map((d) => `${d.nombre}x${d.n}`).join(', ')}`,
        conflicto: empate ? `empate entre vigentes: ${vigentes.map((v) => v.nombre).join(' / ')}` : conflicto,
      };
    }
    // (2) Solo dueños no vigentes en la hoja → cartera.
    const porCartera = buscarCartera(norm);
    if (porCartera) {
      return { dueno: porCartera, via: 'cartera',
        detalle: `cuenta "${entrada.empresa}" solo con no-vigentes (${entrada.duenos.map((d) => d.nombre).join('/')}) → cartera`,
        conflicto: null };
    }
    return { dueno: null, via: 'sin_dueno',
      detalle: `cuenta "${entrada.empresa}" solo con no-vigentes y sin cartera`, conflicto: null };
  }

  // (3) La cuenta NO está en la hoja → cartera por nombre.
  const porCartera = buscarCartera(norm);
  if (porCartera) {
    return { dueno: porCartera, via: 'cartera_sin_hoja',
      detalle: 'cuenta fuera de la hoja, resuelta por patrón de cartera', conflicto: null };
  }
  return { dueno: null, via: 'sin_dueno', detalle: 'cuenta fuera de la hoja y sin cartera', conflicto: null };
}

/** Busca la cuenta en la hoja: exacto primero, luego por inclusión de tokens. */
function buscarEnHoja(norm, hoja) {
  if (hoja.has(norm)) return hoja.get(norm);
  for (const [clave, entrada] of hoja) {
    if (!clave) continue;
    if (norm.includes(clave) || clave.includes(norm)) return entrada;
  }
  return null;
}

/** Devuelve el dueño de cartera para un nombre normalizado, o null. */
function buscarCartera(norm) {
  for (const linea of CARTERA) {
    for (const p of linea.patrones) {
      if (norm.includes(normalizar(p))) return linea.dueno;
    }
  }
  return null;
}

/** Carga el CSV de clientes-usuarios y lo agrega por empresa. */
function cargarHoja(csvTexto) {
  const lineas = csvTexto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const cabecera = lineas.shift().split(',').map((c) => c.trim());
  const iEmpresa = cabecera.indexOf('empresa');
  const iDueno = cabecera.indexOf('dueno_machote');
  if (iEmpresa < 0 || iDueno < 0) {
    throw new Error(`CSV sin columnas esperadas. Cabecera: ${cabecera.join(',')}`);
  }
  const hoja = new Map();
  for (const linea of lineas) {
    const celdas = partirCsv(linea);
    const empresa = (celdas[iEmpresa] || '').trim();
    const dueno = (celdas[iDueno] || '').trim();
    if (!empresa) continue;
    const clave = normalizar(empresa);
    if (!hoja.has(clave)) hoja.set(clave, { empresa, duenos: [] });
    const entrada = hoja.get(clave);
    const existente = entrada.duenos.find((d) => d.nombre === dueno);
    if (existente) existente.n += 1;
    else entrada.duenos.push({ nombre: dueno, n: 1 });
  }
  return hoja;
}

/** Split de CSV que respeta comillas dobles. */
function partirCsv(linea) {
  const out = [];
  let actual = '';
  let enComillas = false;
  for (let i = 0; i < linea.length; i += 1) {
    const c = linea[i];
    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') { actual += '"'; i += 1; }
      else enComillas = !enComillas;
    } else if (c === ',' && !enComillas) { out.push(actual); actual = ''; }
    else actual += c;
  }
  out.push(actual);
  return out;
}

/**
 * Verifica que las etapas en Odoo sigan siendo las que este archivo asume.
 * Si Odoo cambió, abortar: un mapping ciego sobre etapas movidas corrompe datos.
 */
function verificarEtapas(etapasVivas) {
  const problemas = [];
  for (const [id, esperada] of Object.entries(ETAPAS_ODOO)) {
    const viva = etapasVivas.find((e) => String(e.id) === String(id));
    if (!viva) { problemas.push(`etapa ${id} "${esperada.name}" ya no existe en Odoo`); continue; }
    if (viva.name !== esperada.name) {
      problemas.push(`etapa ${id}: Odoo dice "${viva.name}", el mapping asume "${esperada.name}"`);
    }
  }
  for (const viva of etapasVivas) {
    if (!ETAPAS_ODOO[viva.id]) problemas.push(`etapa ${viva.id} "${viva.name}" es NUEVA y no tiene decisión`);
  }
  return problemas;
}

module.exports = {
  ETAPAS_ODOO, ETAPAS_DESTINO, MAPPING_ETAPAS, ETAPAS_A_ARCHIVAR,
  DUENOS_VIGENTES, DUENOS_NO_VIGENTES, EXFTS_DNDOLE, DNDOLE_ODOO, CARTERA, CARTERA_EXCEPCIONES,
  LOST_REASON_NOMBRE, MARCA_CHATTER,
  normalizar, resolverDueno, cargarHoja, verificarEtapas,
};
