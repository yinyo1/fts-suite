// Build: 20260428-planeacion-f3-export-v3
'use strict';

window.PLANEACION_HORARIOS = {
  perfiles: null,
  KEY_LOCAL: 'fts_planeacion_horarios_v1',

  async cargar(){
    // 1) localStorage primero
    const local = localStorage.getItem(this.KEY_LOCAL);
    if (local){
      try {
        const data = JSON.parse(local);
        if (data && data.perfiles){
          this.perfiles = data.perfiles;
          console.log('[horarios-base] cargado desde localStorage');
          return true;
        }
      } catch (e){
        localStorage.removeItem(this.KEY_LOCAL);
      }
    }
    // 2) GitHub fallback
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

  // Mapeo dept_id → perfil_key. Operaciones distingue campo vs oficina
  // según si el empleado está en la lista de oficina (Gibrán/Gerardo/Tere).
  // Si hay PLANEACION_CONFIG.config con requiere_check explícito, también
  // considera que requiere_check=false → perfil oficina.
  perfilParaDepto(deptId, empleado){
    if (deptId === 3){
      const oficinaIds = [89, 91, 113];
      if (empleado && oficinaIds.indexOf(empleado.id) !== -1) return 'operaciones_oficina';
      // Si la config dice que NO requiere check → tratar como oficina
      if (empleado && window.PLANEACION_CONFIG &&
          !window.PLANEACION_CONFIG.requiereCheck(empleado.id)){
        return 'operaciones_oficina';
      }
      return 'operaciones_campo';
    }
    const map = { 6: 'comercial', 8: 'rh', 9: 'legal', 12: 'ingenieria' };
    return map[deptId] || 'operaciones_campo';
  },

  getHorarioBase(empleado){
    const dept = this._extraerDeptoId(empleado);
    const perfilKey = this.perfilParaDepto(dept, empleado);
    return (this.perfiles && this.perfiles[perfilKey]) ||
           (this.perfiles && this.perfiles.operaciones_campo) ||
           { entrada: '07:00', salida: '17:06', comida_minutos: 30, horas_netas: 9.6 };
  },

  _extraerDeptoId(emp){
    if (!emp) return 0;
    const d = emp.department_id;
    if (Array.isArray(d) && d.length >= 1) return parseInt(d[0], 10) || 0;
    if (d && typeof d === 'object' && d.id != null) return parseInt(d.id, 10) || 0;
    if (typeof d === 'number' || typeof d === 'string') return parseInt(d, 10) || 0;
    return 0;
  },

  persistirLocal(){
    if (!this.perfiles) return;
    const data = {
      version: 2,
      actualizado: new Date().toISOString(),
      perfiles: this.perfiles
    };
    localStorage.setItem(this.KEY_LOCAL, JSON.stringify(data));
  }
};
