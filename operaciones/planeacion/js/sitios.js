// Build: 20260428-planeacion-f3-export-v3
'use strict';

window.PLANEACION_SITIOS = {
  sitios: [],

  async cargar(){
    const URL = 'https://api.github.com/repos/yinyo1/fts-suite/contents/shared/sitios-autorizados.json?ref=main&t=' + Date.now();
    try {
      const res = await fetch(URL, {
        cache: 'no-store',
        headers: { 'Accept': 'application/vnd.github.v3.raw' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      this.sitios = (data.sitios || []).filter(s => s.activo !== false);
      console.log('[sitios] cargados:', this.sitios.length);
      return true;
    } catch (e){
      console.error('[sitios] error:', e);
      // Fallback mínimo
      this.sitios = [
        { id: 'fts_mty',       nombre: 'FTS Monterrey',                 activo: true },
        { id: 'directo_sitio', nombre: 'Directo a sitio (sin oficina)', activo: true }
      ];
      return false;
    }
  },

  getOpcionesDropdown(){
    return this.sitios.map(s => ({ value: s.nombre, label: s.nombre }));
  }
};
