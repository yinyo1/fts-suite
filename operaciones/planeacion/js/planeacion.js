// Build: 20260428-planeacion-f2-empleados-v2
'use strict';
window.BUILD_DATE = '20260428-planeacion-f2-empleados-v2';

(function(){

  function $(id){ return document.getElementById(id); }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  // ═══════════════════════════════════════════════
  // PlaneacionApp — UI principal
  // ═══════════════════════════════════════════════
  const PlaneacionApp = {
    fechaActual: new Date().toISOString().split('T')[0],
    asignaciones: [],
    empleadoEditando: null,

    async init(){
      const ok = await Promise.all([
        window.PLANEACION_HORARIOS.cargar(),
        window.PLANEACION_EMPLEADOS.cargar()
      ]);
      console.log('[planeacion] deps cargadas', { horarios: ok[0], empleados: ok[1] });

      this.cargarAsignacionesDelDia();
      this.renderHeader();
      this.renderProgresoBanner();
      this.renderJornadaBanner();
      this.renderLista();
      this.bindEventosGlobales();
    },

    cargarAsignacionesDelDia(){
      const ops = window.PLANEACION_EMPLEADOS.getOperaciones();
      this.asignaciones = ops.map(emp => {
        const base = window.PLANEACION_HORARIOS.getHorarioBase(emp);
        const requiereCheck = window.PLANEACION_EMPLEADOS.requiereCheck(emp.id);
        const deptArr = emp.department_id || [3, 'Operaciones'];
        return {
          empleado_id:      emp.id,
          empleado_nombre:  emp.name,
          empleado_dept:    deptArr[1] || 'Operaciones',
          empleado_dept_id: deptArr[0] || 3,
          empleado_job:     emp.job_title || '',
          externo:          false,
          requiere_check:   requiereCheck,
          confirmado:       !requiereCheck,
          origen:           'FTS Monterrey',
          entrada:          base.entrada,
          salida:           base.salida,
          so_id:            null,
          so_nombre:        '',
          sitio:            '',
          actividad:        '',
          he:               0,
          horario_base:     { entrada: base.entrada, salida: base.salida }
        };
      });
    },

    fechaFormateadaLarga(){
      const d = new Date(this.fechaActual + 'T12:00:00');
      const dias  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
      const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
      return dias[d.getDay()] + ' ' + d.getDate() + ' ' + meses[d.getMonth()] + ' ' + d.getFullYear();
    },

    renderHeader(){
      const zone = $('header-zone');
      zone.innerHTML =
        '<div class="pl-header">' +
          '<div class="pl-fecha-nav">' +
            '<button class="pl-btn-nav" id="prev-day" aria-label="Día anterior">‹</button>' +
            '<div class="pl-fecha-actual">' +
              '<div class="pl-fecha-titulo">' + esc(this.fechaFormateadaLarga()) + '</div>' +
              '<div class="pl-fecha-subtitulo">Plan Operativo Diario</div>' +
            '</div>' +
            '<button class="pl-btn-nav" id="next-day" aria-label="Día siguiente">›</button>' +
          '</div>' +
          '<div class="pl-acciones-header">' +
            '<button class="pl-btn-secondary" id="btn-jalar">+ Jalar externo</button>' +
          '</div>' +
        '</div>';

      $('prev-day').addEventListener('click', () => this.cambiarDia(-1));
      $('next-day').addEventListener('click', () => this.cambiarDia(1));
      $('btn-jalar').addEventListener('click', () => this.abrirModalJalar());
    },

    cambiarDia(delta){
      const d = new Date(this.fechaActual + 'T12:00:00');
      d.setDate(d.getDate() + delta);
      this.fechaActual = d.toISOString().split('T')[0];
      this.cargarAsignacionesDelDia();
      this.renderHeader();
      this.renderProgresoBanner();
      this.renderJornadaBanner();
      this.renderLista();
    },

    renderProgresoBanner(){
      const zone = $('progreso-banner');
      const requiereConf = this.asignaciones.filter(a => a.requiere_check);
      const conf  = requiereConf.filter(a => a.confirmado).length;
      const total = requiereConf.length;

      if (total > 0 && conf === total){
        zone.className = 'pl-banner pl-banner-success';
        zone.innerHTML =
          '<span><strong>✓ Todos confirmados</strong> (' + total + '/' + total + ')</span>' +
          '<span class="pl-banner-meta">Listo para publicar</span>';
      } else {
        zone.className = 'pl-banner pl-banner-warning';
        zone.innerHTML =
          '<span><strong>' + conf + '</strong> de <strong>' + total + '</strong> confirmados — falta <strong>' + (total - conf) + '</strong></span>' +
          '<span class="pl-banner-meta">No publicable aún</span>';
      }
    },

    renderJornadaBanner(){
      const zone = $('jornada-banner');
      const J = window.PLANEACION_JORNADA;
      const totalH  = this.asignaciones.reduce((s, a) => s + J.calcularNeta(a.entrada, a.salida), 0);
      const totalHE = this.asignaciones.reduce((s, a) => s + (parseFloat(a.he) || 0), 0);
      const personas = this.asignaciones.length;
      zone.className = 'pl-banner pl-banner-info';
      zone.innerHTML =
        '<span>📊 Total horas plan: <strong>' + totalH.toFixed(1) + 'h</strong>' +
        ' · HE planeadas: <strong>' + totalHE + 'h</strong>' +
        ' · Personas: <strong>' + personas + '</strong></span>';
    },

    renderLista(){
      const zone = $('empleados-zone');
      const campo   = this.asignaciones.filter(a => a.requiere_check);
      const oficina = this.asignaciones.filter(a => !a.requiere_check);

      let html = '';
      if (campo.length > 0){
        html += '<div class="pl-seccion-header">Campo · requieren confirmación (' + campo.length + ')</div>';
        html += campo.map(a => this.renderCard(a)).join('');
      }
      if (oficina.length > 0){
        html += '<div class="pl-seccion-header pl-seccion-oficina">Oficina · auto-confirmados (' + oficina.length + ')</div>';
        html += oficina.map(a => this.renderCard(a)).join('');
      }
      if (!campo.length && !oficina.length){
        html = '<div class="pl-placeholder">No hay empleados de Operaciones cargados.</div>';
      }
      zone.innerHTML = html;

      zone.querySelectorAll('.pl-card-empleado').forEach(card => {
        card.addEventListener('click', e => {
          if (e.target.classList.contains('pl-emp-check')) return;
          const id = parseInt(card.dataset.empId, 10);
          this.abrirModalEditar(id);
        });
      });
      zone.querySelectorAll('.pl-emp-check').forEach(cb => {
        cb.addEventListener('change', e => {
          const id = parseInt(e.target.dataset.empId, 10);
          this.toggleConfirmacion(id, e.target.checked);
        });
        cb.addEventListener('click', e => e.stopPropagation());
      });
    },

    renderCard(a){
      const J = window.PLANEACION_JORNADA;
      const horasJornada = J.calcularNeta(a.entrada, a.salida);
      const jornadaCorta = horasJornada < J.HORAS_NETAS_OBJETIVO - 0.05;
      const cardClass = a.requiere_check
        ? (a.confirmado ? 'pl-card-confirmado' : 'pl-card-pendiente')
        : 'pl-card-auto';

      const heLabel       = a.he > 0     ? '<span class="pl-badge pl-badge-he">+' + a.he + 'h HE</span>' : '';
      const externoLabel  = a.externo    ? '<span class="pl-badge pl-badge-externo">🔄 ' + esc(a.empleado_dept) + '</span>' : '';
      const jornadaLabel  = (jornadaCorta && a.requiere_check)
        ? '<span class="pl-badge pl-badge-warn">⚠️ ' + horasJornada.toFixed(1) + 'h</span>' : '';

      const checkOrAuto = a.requiere_check
        ? '<input type="checkbox" class="pl-emp-check" data-emp-id="' + a.empleado_id + '"' + (a.confirmado ? ' checked' : '') + ' />'
        : '<span class="pl-auto-label">✓ auto</span>';

      const sitio    = a.sitio    ? esc(a.sitio)    : '—';
      const so       = a.so_nombre? esc(a.so_nombre): '—';
      const actividad = a.actividad ? esc(a.actividad) : '<em>sin actividad asignada</em>';

      return (
        '<div class="pl-card-empleado ' + cardClass + '" data-emp-id="' + a.empleado_id + '">' +
          '<div class="pl-card-content">' +
            '<div class="pl-card-info">' +
              '<div class="pl-card-nombre">' + esc(a.empleado_nombre) + heLabel + externoLabel + jornadaLabel + '</div>' +
              '<div class="pl-card-detalles">🕐 ' + J.fmtAMPM(a.entrada) + ' → ' + J.fmtAMPM(a.salida) + ' · 📍 ' + sitio + ' · ' + so + '</div>' +
              '<div class="pl-card-actividad">' + actividad + '</div>' +
            '</div>' +
            '<div class="pl-card-check">' + checkOrAuto + '</div>' +
          '</div>' +
        '</div>'
      );
    },

    toggleConfirmacion(empleadoId, confirmado){
      const a = this.asignaciones.find(x => x.empleado_id === empleadoId);
      if (!a) return;
      a.confirmado = confirmado;
      this.renderProgresoBanner();
      this.renderLista();
    },

    // ─── Modal: editar individual ───
    abrirModalEditar(empleadoId){
      const a = this.asignaciones.find(x => x.empleado_id === empleadoId);
      if (!a) return;
      this.empleadoEditando = empleadoId;
      const J = window.PLANEACION_JORNADA;

      const empInfo = a.externo
        ? 'Externo de ' + esc(a.empleado_dept) + ' · Asignación puntual'
        : esc(a.empleado_job) + ' · Horario base: ' + J.fmtAMPM(a.horario_base.entrada) + ' – ' + J.fmtAMPM(a.horario_base.salida);

      const origenes = ['FTS Monterrey','Topo Chico planta','Vertiv Apodaca','Mission Houston','Directo a sitio'];
      const origenOpts = origenes.map(o =>
        '<option' + (a.origen === o ? ' selected' : '') + '>' + esc(o) + '</option>'
      ).join('');

      $('modal-editar').innerHTML =
        '<div class="pl-modal-overlay" id="m-overlay">' +
          '<div class="pl-modal-content">' +
            '<div class="pl-modal-header">' +
              '<div class="pl-modal-title">Editar — ' + esc(a.empleado_nombre) + '</div>' +
              '<button class="pl-modal-close" id="m-close" aria-label="Cerrar">✕</button>' +
            '</div>' +
            '<div class="pl-modal-body">' +
              '<div class="pl-modal-emp-info">' + empInfo + '</div>' +
              '<div class="pl-form-row"><label>Origen</label><select id="m-origen">' + origenOpts + '</select></div>' +
              '<div class="pl-form-row pl-form-row-double">' +
                '<div><label>Entrada</label><input type="time" id="m-entrada" value="' + a.entrada + '"></div>' +
                '<div><label>Salida</label><input type="time" id="m-salida" value="' + a.salida + '"></div>' +
              '</div>' +
              '<div id="m-jornada-feedback" class="pl-jornada-feedback"></div>' +
              '<div class="pl-form-row">' +
                '<label>Proyecto / SO</label>' +
                '<input type="text" id="m-so" value="' + esc(a.so_nombre) + '" placeholder="Ej: SO11547 - Topo Chico">' +
                '<small class="pl-form-hint">F4 conectará dropdown con SOs de Odoo</small>' +
              '</div>' +
              '<div class="pl-form-row"><label>Sitio</label><input type="text" id="m-sitio" value="' + esc(a.sitio) + '" placeholder="Ej: Topo Chico planta"></div>' +
              '<div class="pl-form-row"><label>HE planeadas (h)</label><input type="number" id="m-he" value="' + a.he + '" min="0" max="6" step="0.5"></div>' +
              '<div class="pl-form-row"><label>Actividades</label><textarea id="m-actividades" placeholder="Ej: Soldar manifold, prueba presión...">' + esc(a.actividad) + '</textarea></div>' +
            '</div>' +
            '<div class="pl-modal-footer">' +
              '<button class="pl-btn-secondary" id="m-cancelar">Cancelar</button>' +
              '<button class="pl-btn-primary" id="m-guardar">Confirmar día ✓</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      $('modal-editar').style.display = 'block';
      this.actualizarFeedbackJornada('m-entrada', 'm-salida', 'm-jornada-feedback');

      $('m-close').addEventListener('click',    () => this.cerrarModalEditar());
      $('m-cancelar').addEventListener('click', () => this.cerrarModalEditar());
      $('m-guardar').addEventListener('click',  () => this.guardarEdicion());
      $('m-overlay').addEventListener('click', e => { if (e.target.id === 'm-overlay') this.cerrarModalEditar(); });

      const upd = () => this.actualizarFeedbackJornada('m-entrada', 'm-salida', 'm-jornada-feedback');
      $('m-entrada').addEventListener('change', upd);
      $('m-salida').addEventListener('change',  upd);
    },

    cerrarModalEditar(){
      $('modal-editar').style.display = 'none';
      $('modal-editar').innerHTML = '';
      this.empleadoEditando = null;
    },

    actualizarFeedbackJornada(entradaId, salidaId, feedbackId){
      const entrada = $(entradaId).value;
      const salida  = $(salidaId).value;
      const feedback = $(feedbackId);
      if (!feedback) return;
      const r = window.PLANEACION_JORNADA.validar(entrada, salida);
      feedback.className = 'pl-jornada-feedback pl-jornada-' + r.tipo;
      feedback.innerHTML = r.mensaje;
    },

    guardarEdicion(){
      const a = this.asignaciones.find(x => x.empleado_id === this.empleadoEditando);
      if (!a) return;
      const J = window.PLANEACION_JORNADA;

      const entrada = $('m-entrada').value;
      const salida  = $('m-salida').value;
      const horas   = J.calcularNeta(entrada, salida);

      if (horas < J.HORAS_NETAS_OBJETIVO - 0.05){
        const sug = J.sugerirSalida(entrada);
        const msg = 'La jornada dura solo ' + horas.toFixed(1) + 'h netas. Salida sugerida: ' + J.fmtAMPM(sug) + '. ¿Guardar de todas formas?';
        if (!confirm(msg)) return;
      }

      a.origen     = $('m-origen').value;
      a.entrada    = entrada;
      a.salida     = salida;
      a.so_nombre  = $('m-so').value;
      a.sitio      = $('m-sitio').value;
      a.he         = parseFloat($('m-he').value) || 0;
      a.actividad  = $('m-actividades').value;
      a.confirmado = true;

      this.cerrarModalEditar();
      this.renderProgresoBanner();
      this.renderJornadaBanner();
      this.renderLista();
    },

    // ─── Modal: jalar externo ───
    abrirModalJalar(){
      const deptos = window.PLANEACION_EMPLEADOS.getDepartamentos();

      $('modal-jalar').innerHTML =
        '<div class="pl-modal-overlay" id="j-overlay">' +
          '<div class="pl-modal-content">' +
            '<div class="pl-modal-header">' +
              '<div class="pl-modal-title">Jalar empleado externo</div>' +
              '<button class="pl-modal-close" id="j-close" aria-label="Cerrar">✕</button>' +
            '</div>' +
            '<div class="pl-modal-body">' +
              '<div class="pl-modal-info">Asignación puntual al proyecto. Sus horas se cargarán al SO. Su horario base no se modifica.</div>' +
              '<div class="pl-form-row"><label>Departamento</label>' +
                '<select id="j-depto">' +
                  deptos.map(d => '<option value="' + d.id + '">' + esc(d.nombre) + ' (' + d.count + ')</option>').join('') +
                '</select>' +
              '</div>' +
              '<div class="pl-form-row"><label>Empleado</label><select id="j-empleado"></select></div>' +
              '<div class="pl-form-row pl-form-row-double">' +
                '<div><label>Entrada</label><input type="time" id="j-entrada" value="09:00"></div>' +
                '<div><label>Salida</label><input type="time" id="j-salida" value="14:00"></div>' +
              '</div>' +
              '<div id="j-jornada-feedback" class="pl-jornada-feedback"></div>' +
              '<div class="pl-form-row"><label>Proyecto / SO</label><input type="text" id="j-so" placeholder="Ej: SO11547 - Topo Chico"></div>' +
              '<div class="pl-form-row"><label>Sitio</label><input type="text" id="j-sitio" placeholder="Ej: Topo Chico planta"></div>' +
              '<div class="pl-form-row"><label>Actividad</label><textarea id="j-actividad" placeholder="Ej: Programación PLC + capacitación"></textarea></div>' +
            '</div>' +
            '<div class="pl-modal-footer">' +
              '<button class="pl-btn-secondary" id="j-cancelar">Cancelar</button>' +
              '<button class="pl-btn-primary" id="j-guardar">Agregar al plan</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      $('modal-jalar').style.display = 'block';
      if (deptos.length > 0) this.actualizarEmpleadosExternos();
      this.actualizarFeedbackJornada('j-entrada', 'j-salida', 'j-jornada-feedback');

      $('j-close').addEventListener('click',    () => this.cerrarModalJalar());
      $('j-cancelar').addEventListener('click', () => this.cerrarModalJalar());
      $('j-guardar').addEventListener('click',  () => this.agregarExterno());
      $('j-depto').addEventListener('change',   () => this.actualizarEmpleadosExternos());
      $('j-overlay').addEventListener('click',  e => { if (e.target.id === 'j-overlay') this.cerrarModalJalar(); });

      const upd = () => this.actualizarFeedbackJornada('j-entrada', 'j-salida', 'j-jornada-feedback');
      $('j-entrada').addEventListener('change', upd);
      $('j-salida').addEventListener('change',  upd);
    },

    cerrarModalJalar(){
      $('modal-jalar').style.display = 'none';
      $('modal-jalar').innerHTML = '';
    },

    actualizarEmpleadosExternos(){
      const deptId = parseInt($('j-depto').value, 10);
      const empleados = window.PLANEACION_EMPLEADOS.getByDeptId(deptId);
      const yaJalados = new Set(
        this.asignaciones.filter(a => a.externo).map(a => a.empleado_id)
      );
      const sel = $('j-empleado');
      sel.innerHTML = empleados
        .filter(e => !yaJalados.has(e.id))
        .map(e => '<option value="' + e.id + '">' + esc(e.name) + (e.job_title ? ' (' + esc(e.job_title) + ')' : '') + '</option>')
        .join('');
    },

    agregarExterno(){
      const empId = parseInt($('j-empleado').value, 10);
      if (!empId) { alert('Selecciona un empleado.'); return; }
      const emp = window.PLANEACION_EMPLEADOS.byId(empId);
      if (!emp) return;

      const entrada = $('j-entrada').value;
      const salida  = $('j-salida').value;
      const horas   = window.PLANEACION_JORNADA.calcularNeta(entrada, salida);
      if (horas <= 0) { alert('La jornada no es válida. Revisa entrada/salida.'); return; }

      const deptArr = emp.department_id || [0, 'Externo'];
      this.asignaciones.push({
        empleado_id:      emp.id,
        empleado_nombre:  emp.name,
        empleado_dept:    deptArr[1] || 'Externo',
        empleado_dept_id: deptArr[0] || 0,
        empleado_job:     emp.job_title || '',
        externo:          true,
        requiere_check:   true,
        confirmado:       false,
        origen:           'FTS Monterrey',
        entrada:          entrada,
        salida:           salida,
        so_id:            null,
        so_nombre:        $('j-so').value,
        sitio:            $('j-sitio').value,
        actividad:        $('j-actividad').value || 'Apoyo técnico puntual',
        he:               0,
        horario_base:     { entrada: entrada, salida: salida }
      });

      this.cerrarModalJalar();
      this.renderProgresoBanner();
      this.renderJornadaBanner();
      this.renderLista();
    },

    bindEventosGlobales(){
      document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if ($('modal-editar').style.display === 'block') this.cerrarModalEditar();
        if ($('modal-jalar').style.display === 'block')  this.cerrarModalJalar();
      });
    }
  };

  window.PlaneacionApp = PlaneacionApp;

  // ═══════════════════════════════════════════════
  // Auth gate (de F1) + bootstrap PlaneacionApp
  // ═══════════════════════════════════════════════
  function denyAccess(reason){
    const gate = $('auth-gate');
    if (!gate) return;
    gate.style.display = 'block';
    gate.innerHTML =
      '<h2>🔒 Acceso restringido</h2>' +
      '<p>' + reason + '</p>' +
      '<a class="pl-gate-btn" href="../index.html">Volver a Operaciones</a>';
  }

  function redirectToLauncher(){
    window.location.href = '../../index.html';
  }

  document.addEventListener('DOMContentLoaded', async function(){
    console.log('[planeacion] init build=' + window.BUILD_DATE);

    if (!window.FTSAuth || !window.FTSAuth.isLoggedIn()){
      redirectToLauncher();
      return;
    }
    const session = window.FTSAuth.getSession();
    if (!session){ redirectToLauncher(); return; }

    try { window.FTSAuth.initActivityTracking && window.FTSAuth.initActivityTracking(); } catch(e){}

    const userEl = $('pl-user-nombre');
    if (userEl) userEl.textContent = '👤 ' + (session.nombre || session.username || '—');

    const isMaster = session.role === 'master' || session.modulos === 'all';
    const isFelipe = session.username === 'felipe.perez';

    if (!isMaster && !isFelipe){
      denyAccess('Solo Felipe Pérez (Supervisor Operaciones) o ftsmaster pueden acceder a este módulo.');
      console.warn('[planeacion] acceso denegado a user=' + session.username + ' role=' + session.role);
      return;
    }

    $('main-content').style.display = 'block';
    console.log('[planeacion] auth OK user=' + session.username + ' role=' + session.role);

    try {
      await PlaneacionApp.init();
      console.log('[planeacion] PlaneacionApp inicializado');
    } catch (e){
      console.error('[planeacion] init falló:', e);
    }
  });

})();
