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
    var verCosto = (c.tiene('nomina_usa:archivo') || c.tiene('nomina_usa:autorizar') || c.tiene('nomina_usa:validar')) && (s.estado === 'autorizada' || s.estado === 'subida');
    var verConc = (c.tiene('nomina_usa:archivo') || c.tiene('nomina_usa:autorizar')) && (s.estado === 'autorizada' || s.estado === 'subida');
    if (verCosto) h += '<div id="nu-costo" class="nu-sec"><div class="vacio">Cargando el asiento de costo…</div></div>';
    if (verConc) h += '<div id="nu-concilia" class="nu-sec"><div class="vacio">Cargando la conciliación…</div></div>';
    el.innerHTML = h;
    if (verCosto) pintarCosto(el.querySelector('#nu-costo'), c, s);
    if (verConc) pintarConciliacion(el.querySelector('#nu-concilia'), c, s);
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
  // ── Costo por SO para Odoo (MVP paso 3): vista previa del asiento; con la bandera prendida, borrador en Odoo.
  var ESTADO_COSTO = { sin_guardar: 'vista previa · se guarda al marcar «subido»', vista_previa: 'vista previa guardada', borrador_creado: 'borrador creado en Odoo', error: 'error al crear en Odoo' };
  async function pintarCosto(box, c, s) {
    var e = c.esc, r = await c.llamar({ accion: 'costo_ver', id: s.id });
    if (!r || r.ok === false) { box.innerHTML = '<div class="err">' + e(c.mensaje(r)) + '</div>'; return; }
    var a = r.asiento, L = (a.payload && a.payload.lineas) || [], deb = 0, cre = 0;
    var h = '<div class="cab"><h2>Costo en Odoo por SO</h2><span class="sp"></span><span class="chip ' + (a.estado === 'borrador_creado' ? 'e-validado' : a.estado === 'error' ? 'e-real' : 'e-otro') + '">' + e(ESTADO_COSTO[a.estado] || a.estado) + '</span></div>' +
      '<div class="muted nu-nota">Bandera «Costo en Odoo»: <b>' + (r.activo === true ? 'PRENDIDA' : 'APAGADA') + '</b>. ' + (r.activo === true ? 'El asiento se crea en Odoo en borrador, nunca publicado.' : 'Solo se arma y se ve aquí: nada llega a Odoo.') +
      (a.odoo_move_id ? ' Movimiento de Odoo: ' + e(a.odoo_move_id) + '.' : '') + (a.error ? ' Error: ' + e(a.error) : '') + '</div>';
    (a.faltantes || []).forEach(function (f) { h += '<div class="nu-bloq">Falta para crearlo en Odoo: ' + e(f) + '</div>'; });
    h += '<div class="caja nu-scroll"><table class="nu-tabla nu-cards"><thead><tr><th>Persona</th><th>Analítica</th><th class="n">Debe</th><th class="n">Haber</th></tr></thead><tbody>' +
      L.map(function (l) {
        deb += Number(l.debit || 0); cre += Number(l.credit || 0);
        var an = l.analytic_distribution ? Object.keys(l.analytic_distribution).join(', ') : '';
        return '<tr><td>' + e(l.cuenta === 'PUENTE' ? 'Nómina USA por pagar' : l.persona) + '</td><td>' + e(l.cuenta === 'PUENTE' ? 'cuenta puente' : l.cuenta) + (an ? ' <span class="muted">· analítica ' + e(an) + '</span>' : (l.cuenta === 'PUENTE' ? '' : ' <span class="mal">· sin analítica</span>')) + '</td>' +
          '<td class="n">' + (l.debit ? $$(l.debit) : '') + '</td><td class="n">' + (l.credit ? $$(l.credit) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="nu-kpis"><div class="nu-kpi"><b>' + $$(deb) + '</b><small>debe (gasto de nómina)</small></div><div class="nu-kpi"><b>' + $$(cre) + '</b><small>haber (puente)</small></div></div>';
    if (c.tiene('nomina_usa:archivo') && s.estado === 'subida' && a.estado !== 'borrador_creado') h += '<div class="nu-acc"><button class="btn" id="nu-costo-prep">Volver a armar el asiento</button></div>';
    box.innerHTML = h;
    var bp = box.querySelector('#nu-costo-prep');
    if (bp) bp.addEventListener('click', async function () { var x = await c.llamar({ accion: 'costo_preparar', id: s.id }); c.toast(x && x.ok ? 'Asiento armado' : c.mensaje(x)); pintarCosto(box, c, s); });
  }

  // ── Conciliación del registro de Auris contra el banco (MVP paso 4): vista previa.
  async function pintarConciliacion(box, c, s) {
    var e = c.esc, r = await c.llamar({ accion: 'conciliacion_ver', semana: s.semana });
    if (!r || r.ok === false) { box.innerHTML = '<div class="err">' + e(c.mensaje(r)) + '</div>'; return; }
    var k = r.conciliacion, p = r.prorrateo || {}, demo = G.NusaApi.modo === 'demo';
    var h = '<div class="cab"><h2>Conciliación de Auris</h2><span class="sp"></span><span class="chip e-otro">' + (r.activa === true ? 'activa' : 'vista previa') + '</span></div>' +
      '<div class="muted nu-nota">Se compara el registro de nómina de Auris (neto, impuestos y fee) contra los cargos del banco BUS COMPLETE CHK. Nada se escribe en Odoo.</div>';
    if (c.tiene('nomina_usa:archivo')) {
      h += '<div class="caja nu-f"><label>Registro de Auris (.csv)<input type="file" id="nu-au-file" accept=".csv,text/csv"></label>' +
        '<label>Fecha de pago<input type="date" id="nu-au-pago" value="' + e(addDias(s.semana, 7)) + '"></label>' +
        '<label style="grid-column:1/-1">o pégalo aquí<textarea id="nu-au-txt" rows="3" placeholder="Employee,Employee ID,Net Pay,Employee Taxes,Employer Taxes,Fee"></textarea></label></div>' +
        '<div class="nu-acc"><button class="btn pri" id="nu-au-imp">Importar registro de Auris</button>' + (demo ? ' <button class="btn" id="nu-au-ej">Usar registro de ejemplo</button>' : '') + '</div><div class="err hid" id="nu-au-err"></div>';
    }
    if (!k) h += '<div class="caja vacio">Todavía no hay registro de Auris de esta semana.</div>';
    else {
      var t = k.totales || {};
      h += '<div class="nu-kpis"><div class="nu-kpi"><b>' + $$(t.neto) + '</b><small>neto</small></div><div class="nu-kpi"><b>' + $$(Number(t.imp_empleado || 0) + Number(t.imp_patron || 0)) + '</b><small>impuestos (empleado + patrón)</small></div>' +
        '<div class="nu-kpi"><b>' + $$(t.fee) + '</b><small>fee</small></div><div class="nu-kpi"><b>' + $$(t.total) + '</b><small>total del registro</small></div></div>' +
        (k.cuadra ? '<div class="nu-ok">Cuadra con ' + k.cargos.length + ' cargo(s) del banco por ' + $$(k.suma_banco) + '.</div>'
                  : '<div class="nu-bloq">No cuadra: el registro suma ' + $$(t.total) + ' y los cargos del banco que encontré suman ' + $$(k.suma_banco || 0) + '. Se avisó a Gerardo.</div>');
      if ((k.candidatos || []).length) h += '<div class="caja nu-scroll"><table class="nu-tabla"><thead><tr><th>Cargo del banco</th><th class="nu-oc">Fecha</th><th class="n">Monto</th></tr></thead><tbody>' +
        k.candidatos.map(function (x) { var usado = (k.cargos || []).indexOf(x.id) >= 0; return '<tr><td>' + e(x.ref) + (usado ? ' <span class="chip e-validado">usado</span>' : '') + '</td><td class="nu-oc nu-fecha">' + e(x.fecha) + '</td><td class="n">' + $$(x.monto) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      h += '<h3>Propuesta de asiento</h3><div class="caja nu-scroll"><table class="nu-tabla nu-cards"><thead><tr><th>Concepto</th><th>Cuenta</th><th class="n">Debe</th><th class="n">Haber</th></tr></thead><tbody>' +
        k.propuesta.map(function (x) { return '<tr><td>' + e(x.concepto) + '</td><td>' + e(x.cuenta) + (x.cuenta_id == null && x.haber == null ? ' <span class="muted">· falta en Odoo</span>' : '') + '</td><td class="n">' + (x.debe != null ? $$(x.debe) : '') + '</td><td class="n">' + (x.haber != null ? $$(x.haber) : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
      if ((k.diferencias_persona || []).length) h += '<div class="nu-bloq">Neto distinto a lo autorizado: ' + k.diferencias_persona.map(function (d) { return 'empleado ' + d.employee_id + ' Auris ' + $$(d.auris) + ' contra ' + $$(d.autorizado); }).join(' · ') + '</div>';
    }
    if ((p.lineas || []).length) h += '<h3>Prorrateo de impuestos de ' + e(p.mes) + ' a las SO (vista previa)</h3><div class="caja nu-scroll"><table class="nu-tabla"><thead><tr><th>Cuenta</th><th class="n">Neto pagado</th><th class="n">Impuestos</th></tr></thead><tbody>' +
      p.lineas.map(function (x) { return '<tr><td>' + e(x.cuenta) + (x.analytic_id ? ' <span class="muted">· ' + e(x.analytic_id) + '</span>' : '') + '</td><td class="n">' + $$(x.neto) + '</td><td class="n">' + $$(x.impuestos) + '</td></tr>'; }).join('') +
      '</tbody></table></div><div class="muted nu-nota">Los impuestos del mes (' + $$(p.impuestos) + ') se reparten en proporción al neto pagado a cada cuenta. No se escribe en Odoo.</div>';
    box.innerHTML = h;
    var err = function (m) { var x = box.querySelector('#nu-au-err'); x.textContent = m; x.classList.remove('hid'); };
    async function importar(texto) {
      var lec = G.NominaUSA.auris.leer(texto, r.formato || {});
      if (!lec.ok) return err(lec.mensaje || lec.error);
      var x = await c.llamar({ accion: 'auris_importar', semana: s.semana, fecha_pago: box.querySelector('#nu-au-pago').value || null, filas: lec.filas });
      if (!x || x.ok === false) return err(c.mensaje(x) + (x && x.errores ? ' ' + JSON.stringify(x.errores) : ''));
      c.toast(x.revision && x.revision.cuadra ? 'Registro importado: cuadra con el banco' : 'Registro importado: NO cuadra con el banco'); pintarConciliacion(box, c, s);
    }
    var bi = box.querySelector('#nu-au-imp');
    if (bi) bi.addEventListener('click', function () {
      var f = box.querySelector('#nu-au-file').files[0], t = box.querySelector('#nu-au-txt').value;
      if (f) { var rd = new FileReader(); rd.onload = function () { importar(String(rd.result || '')); }; rd.readAsText(f); }
      else if (t.trim()) importar(t); else err('Elige el archivo de Auris o pégalo.');
    });
    var be = box.querySelector('#nu-au-ej');
    if (be) be.addEventListener('click', function () { importar(G.NominaUSA.auris.EJEMPLO); });
  }
  function addDias(f, n) { var d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

  G.NusaApp.tab({ id: 'revision', label: 'Revisión', scopes: ['nomina_usa:kiosko', 'nomina_usa:validar', 'nomina_usa:autorizar', 'nomina_usa:archivo'], render: render, _st: st });
})(window);
