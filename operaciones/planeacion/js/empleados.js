// Build: 20260428-planeacion-f2-empleados-v2
// V1 confirmado caso A: /webhook/kiosk/empleados retorna empleados activos
// de todos los deptos (consumido también por kiosk, mi-perfil, config-master).
'use strict';

window.PLANEACION_EMPLEADOS = {
  todos: [],
  byDept: {},

  // IDs Odoo de empleados de Operaciones que NO requieren confirmación
  // diaria (oficina con horario fijo). TODO F4: cargar desde
  // shared/planeacion-config.json. Por ahora hardcoded basado en mockup v3.
  SIN_CHECK_DIARIO: [89, 91, 113],

  N8N_BASE: 'https://primary-production-5c3c.up.railway.app',

  async cargar(){
    const URL = this.N8N_BASE + '/webhook/kiosk/empleados';
    try {
      const res = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data && data.empleados) || [];

      this.todos = arr
        .map(this._normalizar)
        .filter(e => e.id != null && e.active !== false);

      this._reindexar();

      console.log('[empleados] total:', this.todos.length);
      console.log('[empleados] por depto:', Object.fromEntries(
        Object.entries(this.byDept).map(function(kv){ return [kv[0], kv[1].length]; })
      ));
      return true;
    } catch (e){
      console.error('[empleados] error cargando desde Odoo:', e);
      console.warn('[empleados] usando MOCK temporal — verificar conectividad a n8n');
      this._cargarMock();
      return false;
    }
  },

  // Normaliza shape variable del webhook a uno consistente.
  _normalizar(e){
    let deptId = 0, deptName = '';
    const d = e.department_id;
    if (Array.isArray(d) && d.length >= 1){
      deptId = parseInt(d[0], 10) || 0;
      deptName = d[1] || e.department_name || ('Depto ' + deptId);
    } else if (d && typeof d === 'object' && d.id != null){
      deptId = parseInt(d.id, 10) || 0;
      deptName = d.name || d.nombre || e.department_name || ('Depto ' + deptId);
    } else if (typeof d === 'number' || typeof d === 'string'){
      deptId = parseInt(d, 10) || 0;
      deptName = e.department_name || ('Depto ' + deptId);
    }

    return {
      id:             parseInt(e.id, 10),
      name:           e.name || e.nombre || ('Empleado ' + e.id),
      job_title:      e.job_title || e.cargo || e.puesto || '',
      department_id:  [deptId, deptName],   // formato Odoo many2one canónico
      active:         e.active !== false
    };
  },

  _reindexar(){
    this.byDept = {};
    this.todos.forEach(e => {
      const id = (e.department_id && e.department_id[0]) || 0;
      if (!this.byDept[id]) this.byDept[id] = [];
      this.byDept[id].push(e);
    });
  },

  // Mock alineado con audit Odoo v3 (28-abr-2026).
  // Nota: Felipe = empleado_id 112 según accesos-panel-incidencias.json.
  _cargarMock(){
    this.todos = [
      // Operaciones (depto 3) campo
      { id: 112, name: 'Felipe Pérez',                department_id: [3, 'Operaciones'], job_title: 'Supervisor', active: true },
      { id: 167, name: 'Mateo Salazar',               department_id: [3, 'Operaciones'], job_title: 'Sr. Supervisor', active: true },
      { id: 76,  name: 'Carlos Manzanares',           department_id: [3, 'Operaciones'], job_title: 'Técnico', active: true },
      { id: 156, name: 'Samuel Ulises Alcántara',     department_id: [3, 'Operaciones'], job_title: 'Técnico', active: true },
      { id: 158, name: 'Leonel Cruz Cristobal',       department_id: [3, 'Operaciones'], job_title: 'Técnico', active: true },
      { id: 159, name: 'Carlos Alberto Marín Vega',   department_id: [3, 'Operaciones'], job_title: 'Técnico', active: true },
      { id: 160, name: 'Juan Pablo Lucas Ramos',      department_id: [3, 'Operaciones'], job_title: 'Técnico', active: true },
      { id: 178, name: 'Erick Santiago Antonio',      department_id: [3, 'Operaciones'], job_title: 'Técnico', active: true },
      // Operaciones oficina (sin check diario)
      { id: 89,  name: 'Gibrán Solís',                department_id: [3, 'Operaciones'], job_title: 'Supply Chain Jr', active: true },
      { id: 91,  name: 'Gerardo Hernández',           department_id: [3, 'Operaciones'], job_title: 'Contabilidad', active: true },
      { id: 113, name: 'Teresa Ramos',                department_id: [3, 'Operaciones'], job_title: 'Admin', active: true },
      // Comercial (depto 6)
      { id: 201, name: 'Francisco Montalvo',          department_id: [6, 'Comercial'], job_title: 'Ing. Comercial', active: true },
      { id: 202, name: 'Luis Ángel Vargas',           department_id: [6, 'Comercial'], job_title: 'Comercial', active: true },
      // Ingeniería (depto 12)
      { id: 121, name: 'Vicente Ramírez',             department_id: [12, 'Ingeniería'], job_title: 'Ingeniero', active: true },
      { id: 122, name: 'Juan Manuel Cano',            department_id: [12, 'Ingeniería'], job_title: 'Ingeniero', active: true },
      { id: 123, name: 'Héctor Cruz Hernández',       department_id: [12, 'Ingeniería'], job_title: 'Ingeniero', active: true },
      // Admin (depto 8)
      { id: 211, name: 'Ana Acevedo',                 department_id: [8, 'Administración y Finanzas'], job_title: 'RH', active: true },
      // Legal (depto 9)
      { id: 212, name: 'Magaly Treviño',              department_id: [9, 'Legal'], job_title: 'Legal', active: true }
    ];
    this._reindexar();
  },

  getOperaciones(){
    return (this.byDept[3] || []).slice();
  },

  getByDeptId(id){
    return (this.byDept[id] || []).slice();
  },

  // Departamentos para selector de "jalar externo" (excluye Operaciones)
  getDepartamentos(){
    const ids = Object.keys(this.byDept).map(function(k){ return parseInt(k, 10); });
    return ids
      .filter(function(id){ return id !== 3 && id !== 0; })
      .map(id => {
        const arr = this.byDept[id];
        const nombre = (arr[0] && arr[0].department_id && arr[0].department_id[1]) || ('Depto ' + id);
        return { id: id, nombre: nombre, count: arr.length };
      }, this)
      .filter(function(d){ return d.count > 0; })
      .sort(function(a, b){ return a.nombre.localeCompare(b.nombre); });
  },

  // ID de Odoo (hr.employee.id). Usa config persistente si está disponible;
  // sino cae al hardcoded SIN_CHECK_DIARIO.
  requiereCheck(empleadoId){
    if (window.PLANEACION_CONFIG && window.PLANEACION_CONFIG.config){
      return window.PLANEACION_CONFIG.requiereCheck(empleadoId);
    }
    return this.SIN_CHECK_DIARIO.indexOf(empleadoId) === -1;
  },

  byId(id){
    return this.todos.find(function(e){ return e.id === id; });
  }
};
