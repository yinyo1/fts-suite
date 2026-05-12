// shared/lib/get-categoria.js
// Lógica autoprogresiva de categoría nómina para FTS Suite.
// Implementa el principio rector de docs/PLAN_NOMINA_FTS_SUITE.md §0.5.
//
// Uso:
//   const { getCategoria, getHeTipo, DEPTOS_DEFAULT } = window.FTSCategoria;
//   const cat = getCategoria(empleado);  // 'hourly_doble' | 'confianza' | etc | null
//
// Empleado nuevo en Odoo sin tocar este código → recibe categoría correcta vía
// default por department_id. Override explícito (x_categoria_nomina) gana.
//
// Build: 20260511-fase-2-v1

'use strict';

/**
 * Default por departamento. dept_id en Odoo → categoría nómina.
 *
 * Tabla derivada del Master Plan Nómina §0.5. Si un depto nuevo se crea en Odoo
 * y NO está aquí, get_categoria devuelve null (flag rojo en panel admin RH).
 *
 * NO incluir employee_ids específicos aquí. Si una excepción individual aplica,
 * se setea en x_categoria_nomina del empleado (override explícito).
 */
const DEPTOS_DEFAULT = Object.freeze({
  3:  'hourly_doble',     // Operaciones — técnicos campo mayoría
  5:  'confianza',        // Dirección (con override 'ceo' explícito para Esteban)
  6:  'no_he_comercial',  // Comercial — variables compensan HE
  9:  'confianza',        // Legal — mando medio
  16: 'confianza',        // Recursos Humanos — mando medio
  17: 'confianza'         // Ingeniería — ingenieros senior
});

/**
 * Mapping categoría → HE tipo. Derivable para evitar campo redundante x_he_tipo
 * (decisión audit Sprint 1 Fase 1: eliminar campo, derivar inline).
 */
const HE_TIPO_POR_CATEGORIA = Object.freeze({
  'ceo':              'no_aplica',
  'confianza':        'no_aplica',
  'hourly_doble':     'dobles',
  'hourly_sencilla':  'sencillas',
  'no_he_comercial':  'no_aplica'
});

/**
 * Calcula la categoría nómina efectiva de un empleado.
 *
 * @param {Object} empleado — record de hr.employee con al menos:
 *   - department_id: number | null
 *   - x_categoria_nomina: string | null
 *
 * @returns {string | null} 'ceo' | 'confianza' | 'hourly_doble' | 'hourly_sencilla' | 'no_he_comercial' | null
 *
 * Reglas (en orden):
 * 1. Si x_categoria_nomina tiene valor explícito → ese gana (override).
 * 2. Si tiene department_id mapeado en DEPTOS_DEFAULT → default por depto.
 * 3. Si tiene department_id NO mapeado (depto nuevo) → null + warning.
 * 4. Si no tiene department_id → null + warning.
 *
 * Null NO bloquea kiosk/checkin (fail-open). Panel admin RH muestra flag rojo.
 */
function getCategoria(empleado) {
  if (!empleado) return null;

  // Regla 1: override explícito gana
  if (empleado.x_categoria_nomina) {
    return empleado.x_categoria_nomina;
  }

  // Regla 2: default por department_id
  const deptId = _normalizarDeptoId(empleado.department_id);
  if (deptId && Object.prototype.hasOwnProperty.call(DEPTOS_DEFAULT, deptId)) {
    return DEPTOS_DEFAULT[deptId];
  }

  // Regla 3/4: depto no mapeado o sin depto
  return null;
}

/**
 * Calcula el tipo de HE efectivo. Deriva de categoría.
 *
 * @param {Object} empleado
 * @returns {string} 'dobles' | 'sencillas' | 'no_aplica' | 'sin_categoria'
 */
function getHeTipo(empleado) {
  const cat = getCategoria(empleado);
  if (!cat) return 'sin_categoria';
  return HE_TIPO_POR_CATEGORIA[cat] || 'no_aplica';
}

/**
 * Indica si el empleado requiere categorización explícita en panel admin.
 * Útil para flag rojo "REQUIERE CATEGORIZACIÓN" en visor RH.
 *
 * @param {Object} empleado
 * @returns {boolean}
 */
function requiereCategorizacionExplicita(empleado) {
  return getCategoria(empleado) === null;
}

/**
 * Normaliza el campo department_id que Odoo puede devolver en 3 formas:
 *   - many2one tuple: [id, name]
 *   - object: {id, name}
 *   - plain id: number
 *   - null/false/undefined
 *
 * @private
 */
function _normalizarDeptoId(field) {
  if (field == null || field === false) return null;
  if (Array.isArray(field)) return field[0] || null;
  if (typeof field === 'object' && field.id != null) return field.id;
  if (typeof field === 'number') return field;
  if (typeof field === 'string') {
    const n = parseInt(field, 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

// ───── Export para 3 entornos: browser global, CommonJS (Node), ESM ─────

const FTSCategoria = {
  getCategoria,
  getHeTipo,
  requiereCategorizacionExplicita,
  DEPTOS_DEFAULT,
  HE_TIPO_POR_CATEGORIA,
  _normalizarDeptoId  // exportado solo para tests
};

if (typeof window !== 'undefined') {
  window.FTSCategoria = FTSCategoria;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FTSCategoria;
}
