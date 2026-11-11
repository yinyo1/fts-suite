// ====================================================
// VALIDAR EMPLEADO (sin PIN — frontend ya validó)
// ====================================================
const params = $('Code - Preparar parámetros').item.json;
const empleados = $input.all().map(item => item.json);

if (empleados.length === 0 || !empleados[0].id) {
  return [{
    json: {
      ...params,
      _error: true,
      codigo_error: 'EMPLEADO_NO_EXISTE',
      mensaje: 'Empleado no encontrado en el sistema (id: ' + params.empleado_id + ')'
    }
  }];
}

const empleado = empleados[0];

if (empleado.active !== true) {
  return [{
    json: {
      ...params,
      _error: true,
      codigo_error: 'EMPLEADO_INACTIVO',
      mensaje: 'Empleado no activo'
    }
  }];
}

// Reusar nombre del frontend si no viene del Odoo
const empleado_nombre_final = params.empleado_nombre || empleado.name;

return [{
  json: {
    ...params,
    empleado_nombre: empleado_nombre_final,
    odoo_employee_data: empleado,
    _valido: true
  }
}];
