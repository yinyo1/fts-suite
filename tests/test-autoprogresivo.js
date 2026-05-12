// tests/test-autoprogresivo.js
//
// Test suite para el principio rector autoprogresivo (PLAN_NOMINA §0.5).
// Valida que get_categoria.js maneja correctamente empleados nuevos sin
// requerir edición de código.
//
// Run: node tests/test-autoprogresivo.js
//
// Sin framework (zero deps). Output simple: green ✓ / red ✗ por caso.

'use strict';

const { getCategoria, getHeTipo, requiereCategorizacionExplicita, DEPTOS_DEFAULT } = require('../shared/lib/get-categoria.js');

let pasados = 0;
let fallidos = 0;
const fallos = [];

function assertEq(actual, expected, descripcion) {
  if (actual === expected) {
    console.log(`  ✓ ${descripcion}`);
    pasados++;
  } else {
    console.log(`  ✗ ${descripcion}`);
    console.log(`      expected: ${JSON.stringify(expected)}`);
    console.log(`      actual:   ${JSON.stringify(actual)}`);
    fallidos++;
    fallos.push(descripcion);
  }
}

function suite(nombre, fn) {
  console.log(`\n=== ${nombre} ===`);
  fn();
}

// ═══════════════════════════════════════════════════════════════
// SUITE 1: 5 casos de empleado fantasma (sin tocar Odoo)
// ═══════════════════════════════════════════════════════════════

suite('Empleado fantasma (autoprogresivo)', () => {
  // Caso a: Operaciones sin override → hourly_doble default
  const empOpsNuevo = {
    id: 999,
    name: 'Juan Pérez Nuevo',
    department_id: [3, 'Operaciones'],
    x_categoria_nomina: null
  };
  assertEq(getCategoria(empOpsNuevo), 'hourly_doble',
    'a. Empleado nuevo dept 3 (Operaciones) sin override → "hourly_doble"');

  // Caso b: Comercial sin override → no_he_comercial default
  const empCom = {
    id: 998,
    name: 'María García Nuevo',
    department_id: [6, 'Comercial'],
    x_categoria_nomina: null
  };
  assertEq(getCategoria(empCom), 'no_he_comercial',
    'b. Empleado nuevo dept 6 (Comercial) sin override → "no_he_comercial"');

  // Caso c: Ingeniería sin override → confianza default
  const empIng = {
    id: 997,
    name: 'Carlos López Nuevo',
    department_id: [17, 'Ingenieria'],
    x_categoria_nomina: null
  };
  assertEq(getCategoria(empIng), 'confianza',
    'c. Empleado nuevo dept 17 (Ingeniería) sin override → "confianza"');

  // Caso d: Sin depto → null + warning flag
  const empSinDepto = {
    id: 996,
    name: 'Empleado Fantasma',
    department_id: null,
    x_categoria_nomina: null
  };
  assertEq(getCategoria(empSinDepto), null,
    'd. Empleado nuevo sin depto → null (flag rojo en panel admin)');
  assertEq(requiereCategorizacionExplicita(empSinDepto), true,
    'd.1 requiereCategorizacionExplicita devuelve true');

  // Caso e: Override 'ceo' siempre gana sobre default por depto
  const empCeoEnOperaciones = {
    id: 995,
    name: 'CEO fantasma en Operaciones',
    department_id: [3, 'Operaciones'],  // dept 3 = hourly_doble default
    x_categoria_nomina: 'ceo'           // override
  };
  assertEq(getCategoria(empCeoEnOperaciones), 'ceo',
    'e. Override "ceo" gana sobre default "hourly_doble" del depto 3');
});

// ═══════════════════════════════════════════════════════════════
// SUITE 2: Casos reales de empleados-master.json
// ═══════════════════════════════════════════════════════════════

suite('Validación contra empleados reales de empleados-master.json', () => {
  // Esteban (CEO override)
  assertEq(getCategoria({
    id: 32,
    department_id: [5, 'Dirección'],
    x_categoria_nomina: 'ceo'
  }), 'ceo', 'Esteban (id 32) → ceo (override)');

  // Felipe (confianza override sobre Operaciones)
  assertEq(getCategoria({
    id: 112,
    department_id: [3, 'Operaciones'],
    x_categoria_nomina: 'confianza'
  }), 'confianza', 'Felipe (id 112) → confianza (override Operaciones)');

  // Mateo (mismo override)
  assertEq(getCategoria({
    id: 75,
    department_id: [3, 'Operaciones'],
    x_categoria_nomina: 'confianza'
  }), 'confianza', 'Mateo (id 75) → confianza (override Operaciones)');

  // Gerardo (hourly_sencilla override)
  assertEq(getCategoria({
    id: 59,
    department_id: [3, 'Operaciones'],
    x_categoria_nomina: 'hourly_sencilla'
  }), 'hourly_sencilla', 'Gerardo (id 59) → hourly_sencilla (override)');

  // Ricardo Ingeniería sin override → confianza default
  assertEq(getCategoria({
    id: 98,
    department_id: [17, 'Ingenieria'],
    x_categoria_nomina: null
  }), 'confianza', 'Ricardo PMO (id 98) → confianza (default dept 17)');

  // Stephany Operaciones sin override → hourly_doble default
  assertEq(getCategoria({
    id: 121,
    department_id: [3, 'Operaciones'],
    x_categoria_nomina: null
  }), 'hourly_doble', 'Stephany (id 121) → hourly_doble (default dept 3)');

  // Magaly Legal sin override → confianza default
  assertEq(getCategoria({
    id: 63,
    department_id: [9, 'Legal'],
    x_categoria_nomina: null
  }), 'confianza', 'Magaly (id 63) → confianza (default dept 9)');

  // Ana RH sin override → confianza default
  assertEq(getCategoria({
    id: 101,
    department_id: [16, 'Recursos Humanos'],
    x_categoria_nomina: null
  }), 'confianza', 'Ana Laura (id 101) → confianza (default dept 16)');

  // Pedro Comercial sin override → no_he_comercial default
  assertEq(getCategoria({
    id: 143,
    department_id: [6, 'Comercial'],
    x_categoria_nomina: null
  }), 'no_he_comercial', 'Pedro (id 143) → no_he_comercial (default dept 6)');

  // CAJERO 1 sin depto → null
  assertEq(getCategoria({
    id: 81,
    department_id: false,
    x_categoria_nomina: null
  }), null, 'CAJERO 1 (id 81) sin depto → null (flag rojo)');
});

// ═══════════════════════════════════════════════════════════════
// SUITE 3: HE tipo derivación
// ═══════════════════════════════════════════════════════════════

suite('HE tipo derivación', () => {
  assertEq(getHeTipo({department_id: [3, 'Operaciones'], x_categoria_nomina: null}),
    'dobles', 'Operaciones default → HE dobles');
  assertEq(getHeTipo({department_id: [6, 'Comercial'], x_categoria_nomina: null}),
    'no_aplica', 'Comercial default → HE no_aplica');
  assertEq(getHeTipo({department_id: [17, 'Ingenieria'], x_categoria_nomina: null}),
    'no_aplica', 'Ingeniería (confianza) → HE no_aplica');
  assertEq(getHeTipo({department_id: [3, 'Operaciones'], x_categoria_nomina: 'hourly_sencilla'}),
    'sencillas', 'Override hourly_sencilla → HE sencillas');
  assertEq(getHeTipo({department_id: [5, 'Dirección'], x_categoria_nomina: 'ceo'}),
    'no_aplica', 'CEO override → HE no_aplica');
  assertEq(getHeTipo({department_id: false, x_categoria_nomina: null}),
    'sin_categoria', 'Sin depto + sin override → HE sin_categoria');
});

// ═══════════════════════════════════════════════════════════════
// SUITE 4: Normalización de department_id (3 formas Odoo)
// ═══════════════════════════════════════════════════════════════

suite('Normalización department_id', () => {
  const { _normalizarDeptoId } = require('../shared/lib/get-categoria.js');

  assertEq(_normalizarDeptoId([3, 'Operaciones']), 3,
    'many2one tuple [id, name] → id');
  assertEq(_normalizarDeptoId({id: 3, name: 'Operaciones'}), 3,
    'object {id, name} → id');
  assertEq(_normalizarDeptoId(3), 3,
    'plain number → number');
  assertEq(_normalizarDeptoId("17"), 17,
    'string numeric → parsed int');
  assertEq(_normalizarDeptoId(null), null, 'null → null');
  assertEq(_normalizarDeptoId(false), null, 'false (Odoo empty m2o) → null');
  assertEq(_normalizarDeptoId(undefined), null, 'undefined → null');
});

// ═══════════════════════════════════════════════════════════════
// SUITE 5: Edge cases (defensive coding)
// ═══════════════════════════════════════════════════════════════

suite('Edge cases', () => {
  assertEq(getCategoria(null), null, 'empleado null → null');
  assertEq(getCategoria(undefined), null, 'empleado undefined → null');
  assertEq(getCategoria({}), null, 'empleado {} vacío → null');
  assertEq(getCategoria({department_id: [999, 'Depto nuevo no mapeado']}), null,
    'depto nuevo (id 999) no mapeado → null (flag panel admin)');
  assertEq(getCategoria({department_id: [3, 'Operaciones'], x_categoria_nomina: ''}),
    'hourly_doble', 'override "" string vacío se trata como null → default');
});

// ═══════════════════════════════════════════════════════════════
// REPORTE FINAL
// ═══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log(`Resultado: ${pasados} pasados / ${fallidos} fallidos`);
console.log('═'.repeat(60));

if (fallidos > 0) {
  console.log('\nFallos:');
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('\n✅ Todos los tests autoprogresivos pasaron.');
console.log('El sistema es resiliente a empleados nuevos en Odoo sin tocar código.');
process.exit(0);
