// Build: 20260428-planeacion-f2-empleados-v2
'use strict';

window.PLANEACION_HORARIOS = {
  perfiles: null,

  async cargar(){
    const URL = 'https://api.github.com/repos/yinyo1/fts-suite/contents/shared/horarios-base.json?ref=main&t=' + Date.now();
    try {
      const res = await fetch(URL, {
        cache: 'no-store',
        headers: { 'Accept': 'application/vnd.github.v3.raw' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      this.perfiles = data.perfiles || {};
      console.log('[horarios-base] cargados:', Object.keys(this.perfiles));
      return true;
    } catch (e){
      console.error('[horarios-base] error:', e);
      this.perfiles = {};
      return false;
    }
  },

  // Mapeo dept_id → perfil_key (alineado con shared/horarios-base.json)
  perfilParaDepto(deptId){
    const map = {
      3:  'operaciones_campo',
      6:  'comercial',
      8:  'rh',
      9:  'legal',
      12: 'ingenieria'
    };
    return map[deptId] || 'operaciones_campo';
  },

  getHorarioBase(empleado){
    const dept = this._extraerDeptoId(empleado);
    const perfilKey = this.perfilParaDepto(dept);
    return (this.perfiles && this.perfiles[perfilKey]) ||
           (this.perfiles && this.perfiles.operaciones_campo) ||
           { entrada: '07:30', salida: '17:36', comida_minutos: 30, horas_netas: 9.6 };
  },

  // Soporta Odoo many2one, objeto, o int
  _extraerDeptoId(emp){
    if (!emp) return 0;
    const d = emp.department_id;
    if (Array.isArray(d) && d.length >= 1) return parseInt(d[0], 10) || 0;
    if (d && typeof d === 'object' && d.id != null) return parseInt(d.id, 10) || 0;
    if (typeof d === 'number' || typeof d === 'string') return parseInt(d, 10) || 0;
    return 0;
  }
};
