/* ═══ RH · Nómina USA · pestaña Revisión (#448, fase E) ═══
 * Magaly valida checadas e incidencias → Erick autoriza (solo lo reportado y validado,
 * analítica por línea; aprueba o baja al sugerido cada comercial con excepción) →
 * Gerardo descarga el archivo de netos para Auris (CSV) y marca «subido». */
(function (G) {
  'use strict';
  var N = G.NominaUSA.nomina;
  var PASOS = [['enviada', 'Enviada por Richard'], ['validada', 'Validada por Magaly'], ['autorizada', 'Autorizada por Erick'], ['subida', 'Subida a Auris']];
  function $$(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  var st = { id: null };

  async function render(el, c) {
    var e = c.esc;
    var ls = await c.llamar({ accion: 'solicitudes' });
    if (!ls || ls.ok === false) { el.innerHTML = '<div class="err">' + e(c.mensaje(ls)) + '</div>'; return; }
    if (!ls.solicitudes.length) { el.innerHTML = '<div class="caja vacio">Todavía no hay solicitudes enviadas.</div>'; return; }
    var vivas = ls.solicitudes.filter(function (s) { return s.estado !== 'devuelta'; });
    st.id = st.id || (vivas[0] || ls.solicitudes[0]).id;
    var r = await c.llamar({ accion: 'solicitud_ver', id: st.id });
    if (!r || r.ok === false) { el.innerHTML = '<div class="err">' + e(c.mensaje(r)) + '</div>'; return; }
    var s = r.solicitud, idx = PASOS.findIndex(function (p) { return p[0] === s.estado; });
    var h = '<div class="cab"><h1>Revisión · semana ' + e(s.semana) + '</h1><span class="sp"></span><select id="nu-sol">' +
      ls.solicitudes.map(function (x) { return '<option value="' + x.id + '"' + (x.id === s.id ? ' selected' : '') + '>Semana ' + x.semana + ' · ' + x.estado + '</option>'; }).join('') + '</select></div>' +
      '<div class="nu-pasos">' + PASOS.map(function (p, i) { return '<span class="nu-paso ' + (i <= idx ? 'hecho' : (i === idx + 1 ? 'actual' : '')) + '">' + (i + 1) + '. ' + p[1] + '</span>'; }).join('') + '</div>';
    if (s.estado === 'devuelta') h += '<div class="nu-bloq">Devuelta: ' + e(s.devuelta_motivo) + '. Richard la corrige y la vuelve a enviar.</div>';
    var b = r.bloqueos || {};
    if ((b.disputas || []).length) h += '<div class="nu-bloq">Incidencia en disputa: ' + b.disputas.map(function (d) { return 'empleado ' + d.employee_id + ' · ' + d.fecha; }).join(', ') + '. Se libera en «Alertas e incidencias».</div>';
    if ((b.dias_pendientes || []).length) h += '<div class="nu-bloq">Días sin validar: ' + b.dias_pendientes.map(function (d) { return 'empleado ' + d.employee_id + ' · ' + d.fecha; }).join(', ') + '. No se puede autorizar a esas personas.</div>';
    var total = 0, totAut = 0, esErick = c.tiene('nomina_usa:autorizar') && s.estado === 'validada';
    h += '<div class="caja nu-scroll"><table class="nu-tabla nu-cards"><thead><tr><th>Persona</th><th>Concepto</th><th class="n">Pedido</th><th class="n">Autorizado</th></tr></thead><tbody>' +
      r.lineas.map(function (l) {
        total += Number(l.monto); totAut += Number(l.autorizado_monto != null ? l.autorizado_monto : 0);
        var conc = l.tipo === 'so' ? e(l.cuenta) + ' · ' + (l.rol === 'supervisor' ? 'supervisor' : 'técnico') + (l.sugerido != null && Number(l.sugerido) !== Number(l.monto) ? ' <span class="muted">(sugerido ' + $$(l.sugerido) + ')</span>' : '')
          : l.tipo === 'comercial' ? 'Comercial ' + e(l.fecha) + ' · ' + (l.detalle && l.detalle.pct) + '%' + (l.detalle && l.detalle.estimado ? ' <span class="chip e-espera">estimado</span>' : '') +
              (l.excepcion ? ' <span class="nu-exc">EXCEPCIÓN</span> <span class="muted">sugerido ' + $$(l.sugerido) + ' · «' + e(l.explicacion) + '»</span>' : '')
          : l.tipo === 'fijo' ? 'Fijo semanal' + (l.detalle && l.detalle.faltas ? ' · ' + l.detalle.faltas + ' falta(s)' : '') : 'Ajuste';
        var dec = esErick && l.excepcion ? '<div class="nu-acc-fila"><label><input type="radio" name="d' + l.id + '" value="aprobar" data-linea="' + l.id + '"> Aprobar ' + $$(l.monto) + '</label> <label><input type="radio" name="d' + l.id + '" value="bajar_sugerido" data-linea="' + l.id + '"> Bajar al sugerido ' + $$(l.sugerido) + '</label></div>' : '';
        return '<tr><td>' + e(l.alias) + '</td><td>' + conc + ' <span class="muted">· cuenta ' + e(l.cuenta) + '</span>' + dec + '</td><td class="n">' + $$(l.monto) + '</td><td class="n">' + (l.autorizado_monto != null ? $$(l.autorizado_monto) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="nu-kpis"><div class="nu-kpi"><b>' + $$(total) + '</b><small>pedido</small></div><div class="nu-kpi"><b>' + (s.estado === 'autorizada' || s.estado === 'subida' ? $$(totAut) : '—') + '</b><small>autorizado</small></div></div>' +
      '<div class="err hid" id="nu-rev-err"></div><div class="nu-acc">';
    if (c.tiene('nomina_usa:validar') && s.estado === 'enviada') h += '<button class="btn pri" data-acc="solicitud_validar">Validar checadas e incidencias</button> <button class="btn" data-acc="solicitud_devolver">Devolver a Richard</button>';
    if (esErick) h += '<button class="btn pri" data-acc="solicitud_autorizar">Autorizar</button> <button class="btn" data-acc="solicitud_devolver">Devolver a Richard</button>';
    if (c.tiene('nomina_usa:archivo') && (s.estado === 'autorizada' || s.estado === 'subida')) h += '<button class="btn pri" data-acc="solicitud_archivo">Descargar archivo para Auris (.csv)</button>' + (s.estado === 'autorizada' ? ' <button class="btn" data-acc="solicitud_subida">Marcar subido a Auris</button>' : ' <span class="chip e-validado">subido</span>');
    h += '</div>';
    el.innerHTML = h;
    el.querySelector('#nu-sol').addEventListener('change', function (ev) { st.id = Number(ev.target.value); c.recargar(); });
    el.querySelectorAll('[data-acc]').forEach(function (bt) {
      bt.addEventListener('click', async function () {
        var acc = bt.dataset.acc, datos = { accion: acc, id: s.id }, box = el.querySelector('#nu-rev-err');
        if (acc === 'solicitud_devolver') { datos.motivo = G.prompt('Motivo para devolver:'); if (!datos.motivo) return; }
        if (acc === 'solicitud_autorizar') { datos.decisiones = Array.prototype.map.call(el.querySelectorAll('input[type=radio]:checked'), function (i) { return { linea_id: Number(i.dataset.linea), decision: i.value }; }); }
        var x = await c.llamar(datos);
        if (!x || x.ok === false) { box.textContent = (x && x.mensaje) || c.mensaje(x); box.classList.remove('hid'); return; }
        if (acc === 'solicitud_archivo') {
          var csv = N.csvAuris(x.lineas);
          try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'auris-netos-' + x.semana + '.csv'; document.body.appendChild(a); a.click(); a.remove(); } catch (er) {}
          G.NusaApp._st.ultimoCsv = csv;
        }
        c.toast('Listo: ' + bt.textContent); c.recargar();
      });
    });
  }
  G.NusaApp.tab({ id: 'revision', label: 'Revisión', scopes: ['nomina_usa:kiosko', 'nomina_usa:validar', 'nomina_usa:autorizar', 'nomina_usa:archivo'], render: render, _st: st });
})(window);
