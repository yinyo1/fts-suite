// Build: 20260511-planeacion-fase3-categoria-autoprogresiva
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

  // Mapeo dept_id → perfil_key. Operaciones distingue campo vs oficina via
  // x_categoria_nomina del empleado (autoprogresivo) con fallback temporal a
  // oficinaIds hardcoded mientras se valida que todos los hourly_sencilla
  // tengan categoría explícita en Odoo.
  //
  // Historia:
  // - F1 Sprint 1 Fase 0 (2026-05-11): bug fix dept_id mapping (8→16, 12→17).
  // - F1 Sprint 1 Fase 3 (2026-05-11): refactor autoprogresivo — empleado nuevo
  //   con x_categoria_nomina='hourly_sencilla' (set en Odoo) → perfil oficina
  //   automático sin tocar este código.
  perfilParaDepto(deptId, empleado){
    if (deptId === 3){
      // Regla autoprogresiva: x_categoria_nomina='hourly_sencilla' = oficina.
      // Gerardo (59), Teresa (60), Gibrán (62), Jésus M (68), Abraham (135)
      // ya tienen este override post-Sprint-1-Fase-1.
      if (empleado && empleado.x_categoria_nomina === 'hourly_sencilla'){
        return 'operaciones_oficina';
      }
      // Regla autoprogresiva: x_categoria_nomina='confianza' (Felipe, Mateo)
      // — tratamos como oficina hasta que existan perfiles dedicados (Sprint 2).
      if (empleado && empleado.x_categoria_nomina === 'confianza'){
        return 'operaciones_oficina';
      }
      // TEMP fallback: lista hardcoded para empleados sin categoría poblada todavía.
      // Eliminar cuando 100% de operaciones_oficina tengan x_categoria_nomina='hourly_sencilla'
      // (validar via empleados-master.json _meta.total_con_categoria_default).
      const oficinaIdsLegacy = [89, 91, 113];
      if (empleado && oficinaIdsLegacy.indexOf(empleado.id) !== -1) return 'operaciones_oficina';
      // PLANEACION_CONFIG fallback (deuda relacionada — shared/planeacion-config.json).
      if (empleado && window.PLANEACION_CONFIG &&
          !window.PLANEACION_CONFIG.requiereCheck(empleado.id)){
        return 'operaciones_oficina';
      }
      // Default por depto: Operaciones = campo (x_categoria_nomina='hourly_doble' default).
      return 'operaciones_campo';
    }
    const map = {
      5: 'direccion',
      6: 'comercial',
      9: 'legal',
      16: 'rh',
      17: 'ingenieria'
    };
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
