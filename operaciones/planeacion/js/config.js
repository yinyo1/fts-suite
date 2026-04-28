// Build: 20260428-planeacion-f3-export-v3
'use strict';

window.PLANEACION_CONFIG = {
  config: null,
  KEY_LOCAL: 'fts_planeacion_config_v1',

  async cargar(){
    // 1) localStorage primero (cambios sin guardar a GitHub)
    const local = localStorage.getItem(this.KEY_LOCAL);
    if (local){
      try {
        this.config = JSON.parse(local);
        console.log('[config] cargada desde localStorage');
        return true;
      } catch (e){
        localStorage.removeItem(this.KEY_LOCAL);
      }
    }
    // 2) GitHub fallback
    const URL = 'https://api.github.com/repos/yinyo1/fts-suite/contents/shared/planeacion-config.json?ref=main&t=' + Date.now();
    try {
      const res = await fetch(URL, {
        cache: 'no-store',
        headers: { 'Accept': 'application/vnd.github.v3.raw' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      this.config = await res.json();
      console.log('[config] cargada desde GitHub');
      return true;
    } catch (e){
      console.error('[config] error:', e);
      this.config = { version: 1, empleados: {} };
      return false;
    }
  },

  requiereCheck(empleadoId){
    const empleados = (this.config && this.config.empleados) || {};
    const entry = empleados[String(empleadoId)];
    if (!entry) return true; // default seguro
    return entry.requiere_check !== false;
  },

  setRequiereCheck(empleadoId, valor, nombre){
    if (!this.config) this.config = { version: 1, empleados: {} };
    if (!this.config.empleados) this.config.empleados = {};
    this.config.empleados[String(empleadoId)] = {
      requiere_check: !!valor,
      nombre: nombre || ('Empleado ' + empleadoId)
    };
    this.persistirLocal();
  },

  persistirLocal(){
    if (!this.config) return;
    this.config.actualizado = new Date().toISOString();
    localStorage.setItem(this.KEY_LOCAL, JSON.stringify(this.config));
  },

  hayCambiosSinGuardar(){
    return localStorage.getItem(this.KEY_LOCAL) !== null;
  },

  exportarComoArchivo(){
    if (!this.config) return;
    const blob = new Blob([JSON.stringify(this.config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'planeacion-config.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  // ─── UI: menú de configuración ───
  abrirMenuConfig(){
    const empleados = (window.PLANEACION_EMPLEADOS.todos || [])
      .filter(e => e.department_id && e.department_id[0] === 3);

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    const empleadosHtml = empleados.map(e => (
      '<label class="pl-config-emp-row">' +
        '<input type="checkbox" data-emp-id="' + e.id + '" data-emp-nombre="' + esc(e.name) + '" class="pl-config-check"' +
          (this.requiereCheck(e.id) ? ' checked' : '') + ' />' +
        '<div class="pl-config-emp-info">' +
          '<div class="pl-config-emp-nombre">' + esc(e.name) + '</div>' +
          '<div class="pl-config-emp-meta">' + esc(e.job_title || '—') + '</div>' +
        '</div>' +
      '</label>'
    )).join('');

    const perfiles = (window.PLANEACION_HORARIOS.perfiles || {});
    const horariosHtml = Object.keys(perfiles).map(key => {
      const p = perfiles[key];
      return (
        '<div class="pl-config-horario-row" data-perfil="' + esc(key) + '">' +
          '<div class="pl-config-horario-nombre">' + esc(p.descripcion || key) + '</div>' +
          '<div class="pl-config-horario-inputs">' +
            '<input type="time" class="pl-config-entrada" data-perfil="' + esc(key) + '" value="' + p.entrada + '">' +
            '<span>→</span>' +
            '<input type="time" class="pl-config-salida"  data-perfil="' + esc(key) + '" value="' + p.salida + '">' +
          '</div>' +
        '</div>'
      );
    }).join('');

    const statusTxt = this.hayCambiosSinGuardar()
      ? '⚠️ Cambios pendientes de guardar en GitHub'
      : 'Sin cambios pendientes';

    const html =
      '<div class="pl-modal-overlay" id="cfg-overlay">' +
        '<div class="pl-modal-content pl-modal-config">' +
          '<div class="pl-modal-header">' +
            '<div class="pl-modal-title">⚙️ Configuración</div>' +
            '<button class="pl-modal-close" id="cfg-close" aria-label="Cerrar">✕</button>' +
          '</div>' +
          '<div class="pl-modal-body">' +
            '<div class="pl-config-section">' +
              '<h3>Empleados — ¿quién requiere confirmación diaria?</h3>' +
              '<p class="pl-form-hint">Los marcados aparecen como "pendientes" cada día. Los desmarcados se auto-confirman con su horario base.</p>' +
              '<div class="pl-config-empleados">' + empleadosHtml + '</div>' +
            '</div>' +
            '<div class="pl-config-section">' +
              '<h3>Horarios base por perfil</h3>' +
              '<p class="pl-form-hint">Edita la entrada/salida sugerida por categoría. Felipe puede ajustar individualmente al editar cada empleado.</p>' +
              '<div class="pl-config-horarios">' + horariosHtml + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="pl-config-footer">' +
            '<div class="pl-config-status" id="cfg-status">' + statusTxt + '</div>' +
            '<div class="pl-config-buttons">' +
              '<button class="pl-btn-secondary" id="cfg-cancelar">Cerrar</button>' +
              '<button class="pl-btn-secondary" id="cfg-exportar">📥 Descargar JSON</button>' +
            '</div>' +
            '<p class="pl-form-hint" style="margin-top:8px">' +
              '<strong>Cómo guardar:</strong> Click "Descargar JSON" → Sube el archivo a ' +
              '<code>shared/planeacion-config.json</code> en GitHub. <em>(En F4 esto será automático)</em>' +
            '</p>' +
          '</div>' +
        '</div>' +
      '</div>';

    let cont = document.getElementById('modal-config');
    if (!cont){
      cont = document.createElement('div');
      cont.id = 'modal-config';
      cont.className = 'pl-modal';
      document.body.appendChild(cont);
    }
    cont.innerHTML = html;
    cont.style.display = 'block';

    const close = () => this.cerrarMenuConfig();
    document.getElementById('cfg-close').addEventListener('click', close);
    document.getElementById('cfg-cancelar').addEventListener('click', close);
    document.getElementById('cfg-exportar').addEventListener('click', () => this.exportarComoArchivo());
    document.getElementById('cfg-overlay').addEventListener('click', e => {
      if (e.target.id === 'cfg-overlay') close();
    });

    // Toggle requiere_check por empleado
    cont.querySelectorAll('.pl-config-check').forEach(cb => {
      cb.addEventListener('change', e => {
        const id = parseInt(e.target.dataset.empId, 10);
        const nombre = e.target.dataset.empNombre;
        this.setRequiereCheck(id, e.target.checked, nombre);
        const status = document.getElementById('cfg-status');
        if (status) status.textContent = '⚠️ Cambios pendientes de guardar en GitHub';
        if (window.PlaneacionApp){
          window.PlaneacionApp.cargarAsignacionesDelDia();
          window.PlaneacionApp.renderProgresoBanner();
          window.PlaneacionApp.renderJornadaBanner();
          window.PlaneacionApp.renderLista();
        }
      });
    });

    // Cambios horario base
    const onHorarioChange = (e) => {
      const perfil = e.target.dataset.perfil;
      const tipo = e.target.classList.contains('pl-config-entrada') ? 'entrada' : 'salida';
      if (window.PLANEACION_HORARIOS.perfiles[perfil]){
        window.PLANEACION_HORARIOS.perfiles[perfil][tipo] = e.target.value;
        window.PLANEACION_HORARIOS.persistirLocal();
      }
      const status = document.getElementById('cfg-status');
      if (status) status.textContent = '⚠️ Cambios pendientes de guardar en GitHub';
    };
    cont.querySelectorAll('.pl-config-entrada, .pl-config-salida').forEach(input => {
      input.addEventListener('change', onHorarioChange);
    });
  },

  cerrarMenuConfig(){
    const m = document.getElementById('modal-config');
    if (m) m.style.display = 'none';
  }
};
