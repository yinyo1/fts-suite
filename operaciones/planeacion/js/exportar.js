// Build: 20260428-planeacion-f3-export-v3
'use strict';

(function(){
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  window.PLANEACION_EXPORTAR = {

    // ─── Texto WhatsApp con separadores y AM/PM ───
    generarTextoWA(asignaciones, fechaStr){
      const J = window.PLANEACION_JORNADA;
      const grupos = window.PLANEACION_TURNOS.agruparPorProyectoYTurno(asignaciones);
      const sinSO = window.PLANEACION_TURNOS.asignacionesSinSO(asignaciones);
      const SEP = '━━━━━━━━━━━━━━━━━';

      let texto = '📋 *PLAN OPS — ' + fechaStr + '*\n\n';

      grupos.forEach((g, idx) => {
        const turnos = Object.keys(g.turnos).map(k => g.turnos[k]);
        const totalPers = turnos.reduce((s, t) => s + t.personas.length, 0);
        texto += '🛠️ *' + g.so_nombre + '*' + (g.sitio ? ' — ' + g.sitio : '') +
                 ' (' + totalPers + ' pers)\n';

        const multi = turnos.length > 1;
        turnos.forEach(t => {
          if (multi){
            texto += '\n  ⏰ Entrada ' + J.fmtAMPM(t.entrada) +
                     ' · Salida ' + J.fmtAMPM(t.salida) +
                     ' (' + t.personas.length + ' pers)\n';
            texto += '  📍 Origen: ' + t.origen + '\n';
          } else {
            texto += '📍 Origen: ' + t.origen + '\n';
            texto += 'Entrada ' + J.fmtAMPM(t.entrada) + ' · Salida ' + J.fmtAMPM(t.salida) + '\n';
          }
          t.personas.forEach(p => {
            const heT  = (p.he > 0)   ? ' +' + p.he + 'h Horas extras' : '';
            const extT = p.externo    ? ' 🔄' + p.empleado_dept       : '';
            texto += '  • ' + p.empleado_nombre + heT + extT + ' — ' +
                     (p.actividad || 'sin actividad') + '\n';
          });
        });

        if (idx < grupos.length - 1) texto += '\n' + SEP + '\n\n';
      });

      if (sinSO.length > 0){
        texto += '\n' + SEP + '\n\n';
        texto += '⚠️ *Sin SO asignado* (' + sinSO.length + ' pers):\n';
        sinSO.forEach(p => {
          texto += '  • ' + p.empleado_nombre + ' — ' + (p.actividad || 'pendiente') + '\n';
        });
      }

      const totalH  = (asignaciones || []).reduce((s, a) =>
        s + J.calcularNeta(a.entrada, a.salida), 0);
      const totalHE = (asignaciones || []).reduce((s, a) =>
        s + (parseFloat(a.he) || 0), 0);

      texto += '\n' + SEP + '\n';
      texto += '\n_Total: ' + totalH.toFixed(1) + 'h plan · ' + totalHE + 'h Horas extras_\n';
      texto += '_Ajustes avisar antes 6:00 AM_';

      return texto;
    },

    // ─── HTML tabular tipo Excel ───
    generarHTMLExcel(asignaciones, fechaStr, supervisor){
      const J = window.PLANEACION_JORNADA;
      const grupos = window.PLANEACION_TURNOS.agruparPorProyectoYTurno(asignaciones);
      const ahora = new Date().toLocaleTimeString('es-MX', {
        hour: '2-digit', minute: '2-digit', hour12: false
      });

      let html =
        '<div id="excel-export" style="background:white;padding:20px;font-family:\'Segoe UI\',Arial,sans-serif;width:800px;box-sizing:border-box;">' +
          '<div style="display:flex;justify-content:space-between;padding-bottom:10px;border-bottom:2px solid #1a4480;margin-bottom:12px;">' +
            '<div>' +
              '<div style="font-size:18px;font-weight:500;color:#1a4480;">SERVICIOS FTS — PLAN OPERATIVO</div>' +
              '<div style="font-size:12px;color:#555;margin-top:3px;">' + esc(fechaStr) + ' · Supervisor: ' + esc(supervisor) + '</div>' +
            '</div>' +
            '<div style="text-align:right;font-size:11px;color:#777;">' +
              '<div>Generado ' + esc(ahora) + '</div>' +
            '</div>' +
          '</div>' +
          '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
            '<thead>' +
              '<tr style="background:#1a4480;color:white;">' +
                '<th style="padding:7px;text-align:left;border:1px solid #1a4480;width:18%;">Empleado</th>' +
                '<th style="padding:7px;text-align:left;border:1px solid #1a4480;width:14%;">Origen</th>' +
                '<th style="padding:7px;text-align:center;border:1px solid #1a4480;width:9%;">Entrada</th>' +
                '<th style="padding:7px;text-align:center;border:1px solid #1a4480;width:9%;">Salida</th>' +
                '<th style="padding:7px;text-align:center;border:1px solid #1a4480;width:7%;">H. extras</th>' +
                '<th style="padding:7px;text-align:left;border:1px solid #1a4480;width:13%;">Sitio</th>' +
                '<th style="padding:7px;text-align:left;border:1px solid #1a4480;width:30%;">Actividad</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>';

      grupos.forEach(g => {
        const turnos = Object.keys(g.turnos).map(k => g.turnos[k]);
        const totalPers = turnos.reduce((s, t) => s + t.personas.length, 0);

        html +=
          '<tr style="background:#f0f4f9;">' +
            '<td colspan="7" style="padding:5px;border:1px solid #c0c0c0;font-weight:500;color:#1a4480;">' +
              '🛠️ ' + esc(g.so_nombre) + (g.sitio ? ' — ' + esc(g.sitio) : '') +
              ' · ' + totalPers + ' ' + (totalPers === 1 ? 'persona' : 'personas') +
            '</td>' +
          '</tr>';

        let i = 0;
        turnos.forEach(t => {
          t.personas.forEach(p => {
            const bg = i % 2 === 0 ? 'white' : '#fafafa';
            const heCell = (p.he > 0)
              ? '<td style="padding:6px;border:1px solid #c0c0c0;text-align:center;background:#fff7e6;color:#BA7517;font-weight:500;">+' + p.he + 'h</td>'
              : '<td style="padding:6px;border:1px solid #c0c0c0;text-align:center;color:#888;">—</td>';
            const extLabel = p.externo
              ? ' <span style="background:#E6F1FB;color:#0C447C;font-size:10px;padding:1px 6px;border-radius:8px;">🔄 ' + esc(p.empleado_dept) + '</span>'
              : '';
            html +=
              '<tr style="background:' + bg + ';">' +
                '<td style="padding:6px;border:1px solid #c0c0c0;">' + esc(p.empleado_nombre) + extLabel + '</td>' +
                '<td style="padding:6px;border:1px solid #c0c0c0;">' + esc(p.origen) + '</td>' +
                '<td style="padding:6px;border:1px solid #c0c0c0;text-align:center;">' + esc(J.fmtAMPM(t.entrada)) + '</td>' +
                '<td style="padding:6px;border:1px solid #c0c0c0;text-align:center;">' + esc(J.fmtAMPM(t.salida)) + '</td>' +
                heCell +
                '<td style="padding:6px;border:1px solid #c0c0c0;color:#1a4480;font-weight:500;">' + esc(p.sitio || '—') + '</td>' +
                '<td style="padding:6px;border:1px solid #c0c0c0;">' + (p.actividad ? esc(p.actividad) : '<em>sin actividad</em>') + '</td>' +
              '</tr>';
            i++;
          });
        });
      });

      const totalH  = (asignaciones || []).reduce((s, a) => s + J.calcularNeta(a.entrada, a.salida), 0);
      const totalHE = (asignaciones || []).reduce((s, a) => s + (parseFloat(a.he) || 0), 0);

      html +=
              '<tr style="background:#1a4480;color:white;">' +
                '<td colspan="3" style="padding:8px;border:1px solid #1a4480;font-weight:500;">RESUMEN</td>' +
                '<td colspan="2" style="padding:8px;border:1px solid #1a4480;text-align:center;">' +
                  (asignaciones || []).length + ' personas · ' + totalH.toFixed(1) + 'h plan' +
                '</td>' +
                '<td colspan="2" style="padding:8px;border:1px solid #1a4480;">' +
                  totalHE + 'h Horas extras · ' + grupos.length + ' proyectos' +
                '</td>' +
              '</tr>' +
            '</tbody>' +
          '</table>' +
          '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #d0d0d0;font-size:10px;color:#777;display:flex;justify-content:space-between;">' +
            '<span>Cualquier ajuste reportar antes de las 6:00 AM al supervisor</span>' +
            '<span>SERVICIOS FTS · serviciosfts.odoo.com</span>' +
          '</div>' +
        '</div>';

      return html;
    },

    async generarPNG(asignaciones, fechaStr, supervisor){
      if (typeof window.html2canvas === 'undefined'){
        throw new Error('html2canvas no cargado');
      }
      const html = this.generarHTMLExcel(asignaciones, fechaStr, supervisor);
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;';
      wrapper.innerHTML = html;
      document.body.appendChild(wrapper);
      try {
        const canvas = await window.html2canvas(wrapper.querySelector('#excel-export'), {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
          logging: false
        });
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        const safeFecha = String(fechaStr).replace(/\s+/g, '-').toLowerCase();
        link.download = 'plan-ops-' + safeFecha + '.png';
        link.href = dataUrl;
        link.click();
        return dataUrl;
      } finally {
        document.body.removeChild(wrapper);
      }
    },

    compartirWA(texto){
      const url = 'https://wa.me/?text=' + encodeURIComponent(texto);
      window.open(url, '_blank');
    },

    async copiarTexto(texto){
      if (navigator.clipboard && window.isSecureContext){
        return navigator.clipboard.writeText(texto);
      }
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.cssText = 'position:absolute;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
    }
  };
})();
