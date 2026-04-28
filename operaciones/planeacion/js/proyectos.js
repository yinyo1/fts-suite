// Build: 20260428-planeacion-f3-export-v3
// V1 confirmado: /webhook/kiosk/sos retorna {sos: [{id, name|nombre, cliente, num}]}
// (consumido por operaciones/kiosk/js/odoo.js getSOs() y kiosk.js searchSOs())
'use strict';

window.PLANEACION_PROYECTOS = {
  sos: [],
  cargado: false,

  N8N_BASE: 'https://primary-production-5c3c.up.railway.app',

  async cargar(){
    if (this.cargado) return true;
    const URL = this.N8N_BASE + '/webhook/kiosk/sos';
    try {
      const res = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: parseInt(localStorage.getItem('ops_kiosk_company_id') || '1', 10)
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data && data.sos) || [];

      // Normalizar shape (kiosk usa name|nombre + num + cliente)
      this.sos = arr.map(s => ({
        id:      s.id != null ? parseInt(s.id, 10) : null,
        nombre:  s.nombre || s.name || ('SO ' + (s.id || '?')),
        cliente: s.cliente || s.partner || '',
        num:     s.num || ''
      })).filter(s => s.id != null);

      this.cargado = true;
      console.log('[proyectos] SOs cargados:', this.sos.length);
      return true;
    } catch (e){
      console.error('[proyectos] error:', e);
      this.sos = [];
      this.cargado = false;
      return false;
    }
  },

  buscar(query){
    const q = String(query || '').toLowerCase().trim();
    if (!q) return this.sos.slice(0, 50);
    return this.sos.filter(s =>
      s.nombre.toLowerCase().includes(q) ||
      s.cliente.toLowerCase().includes(q) ||
      String(s.num).toLowerCase().includes(q)
    ).slice(0, 50);
  },

  getById(id){
    const idNum = parseInt(id, 10);
    return this.sos.find(s => s.id === idNum);
  }
};
