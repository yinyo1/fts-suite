/* ═══ RH · Nómina USA · pestaña Solicitud del miércoles (#448, fase E) ═══
 * Richard envía antes de las 9:00 del miércoles. Por SO: avance por día con quién trabajó y
 * horas, estimado de miércoles y jueves (no menor al día anterior), bolsa por rol, disponible
 * = bolsa × avance estimado al jueves − pagado, y reparto sugerido (técnicos por horas;
 * supervisor su parte) editable sin pasar el disponible. Más su comercial día por día y los
 * fijos. Una incidencia en disputa BLOQUEA el envío. La base revisa todo otra vez. */
(function (G) {
  'use strict';
  var N = G.NominaUSA.nomina;
  var DIAS = ['vie', 'sáb', 'dom', 'lun', 'mar', 'mié', 'jue'];
  function $$(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function hoyISO() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  var st = { semana: null };

  async function render(el, c) {
    var e = c.esc, puede = c.tiene('nomina_usa:kiosko');
    // En práctica, la semana de los datos de ejemplo (la primera que paga Auris).
    st.semana = st.semana || (G.NusaApi.modo === 'demo' ? '2026-10-30' : N.semanaFTS(hoyISO()).inicio);
    var x = await c.llamar({ accion: 'solicitud_contexto', semana: st.semana });
    if (!x || x.ok === false) { el.innerHTML = '<div class="err">' + e(c.mensaje(x)) + '</div>'; return; }
    var sem = N.semanaFTS(x.semana), alias = {}, rolDe = {};
    (x.personas || []).forEach(function (p) { alias[p.employee_id] = p.alias; rolDe[p.employee_id] = p.rol; });
    var nom = function (id) { return alias[id] || ('empleado ' + id); };
    var h = '<div class="cab"><h1>Solicitud de la semana</h1><span class="sp"></span>' +
      '<button class="btn" data-sem="-7">← Anterior</button> <button class="btn" data-sem="7">Siguiente →</button></div>' +
      '<p class="muted">Semana FTS del <b>' + sem.inicio + '</b> (viernes) al <b>' + sem.fin + '</b> (jueves). Miércoles ' + sem.miercoles + ' y jueves ' + sem.jueves + ' van estimados. Montos netos en USD (Auris agrega impuestos).</p>';

    if (x.solicitud) {
      h += '<div class="aviso"><div><b>Ya enviada: ' + e(x.solicitud.estado) + '</b>Esta semana ya tiene solicitud. Su revisión está en la pestaña «Revisión».</div></div>';
      el.innerHTML = h; cablearSemana(el, c); return;
    }
    var disp = (x.bloqueos && x.bloqueos.disputas) || [];
    if (disp.length) {
      h += '<div class="nu-bloq"><b>Hay una incidencia en disputa. Valídala con Magaly.</b> No se puede enviar hasta que ella la libere.<ul>' +
        disp.map(function (d) { return '<li>' + e(nom(d.employee_id)) + ' · ' + e(d.fecha) + ' ' + (d.revision_pedida ? '<span class="chip e-espera">revisión pedida</span>' : (puede ? '<button class="btn" data-revision="' + d.id + '">Pedir a Magaly que la revise</button>' : '')) + '</li>'; }).join('') + '</ul></div>';
    }
    var pend = (x.bloqueos && x.bloqueos.dias_pendientes) || [];
    if (pend.length) h += '<div class="aviso demo"><div><b>Días sin ubicación por validar</b>' + pend.map(function (d) { return e(nom(d.employee_id)) + ' ' + e(d.fecha); }).join(', ') + '. Puedes enviar, pero Erick no podrá autorizar a esas personas hasta que Magaly los valide.</div></div>';

    (x.sos || []).forEach(function (so, i) {
      var tec = {}, sup = {};
      Object.keys(so.horas || {}).forEach(function (k) { if (rolDe[k] === 'supervisor') sup[k] = so.horas[k]; else tec[k] = so.horas[k]; });
      h += '<div class="caja nu-so" data-so="' + i + '"><h3>' + e(so.so_nombre) + (so.bolsa ? ' <span class="chip ' + (so.bolsa.origen === 'machote' ? 'e-validado' : 'e-espera') + '">' + (so.bolsa.origen === 'machote' ? 'bolsa de machote' : 'provisional · ' + e(so.bolsa.folio)) + '</span>' : ' <span class="chip e-vencido">sin bolsa</span>') + '</h3>' +
        '<div class="nu-scroll"><table class="nu-tabla"><thead><tr><th></th>' + sem.dias.map(function (f, j) { return '<th class="n">' + DIAS[j] + ' ' + f.slice(8) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        '<tr><td>Avance</td>' + so.dias.map(function (d, j) {
          if (j >= 5) return '<td class="n"><span class="chip e-espera">estimado</span></td>';
          return '<td class="n">' + (d.avance == null ? '<span class="muted">—</span>' : d.avance + '%') + '</td>'; }).join('') + '</tr>' +
        '<tr><td>Quién · horas</td>' + so.dias.map(function (d) { return '<td class="n">' + (d.horas.length ? d.horas.map(function (q) { return e(nom(q.employee_id)) + ' ' + q.horas; }).join('<br>') : '<span class="muted">—</span>') + '</td>'; }).join('') + '</tr>' +
        '</tbody></table></div><div class="muted">Último avance reportado: <b>' + so.avance_ultimo + '%</b>. Estimados: el jueves no puede ser menor al miércoles.</div>' +
        '<div class="nu-f nu-est"><label>Avance estimado al miércoles ' + sem.miercoles.slice(5) + ' (%)<input data-est="mie" inputmode="numeric" value="' + Math.max(so.avance_ultimo, 0) + '"></label>' +
        '<label>Avance estimado al jueves ' + sem.jueves.slice(5) + ' (%)<input data-est="jue" inputmode="numeric" value="' + Math.max(so.avance_ultimo, 0) + '"></label></div>';
      if (!so.bolsa) {
        h = h.slice(0, h.lastIndexOf('<div class="nu-f nu-est">'));
        h += '<div class="nu-bloq">Sin bolsa: no se puede pedir pago de esta SO hasta que Esteban capture la provisional con folio.</div></div>';
        return;
      }
      ['supervisor', 'tecnicos'].forEach(function (r) {
        var gente = r === 'supervisor' ? sup : tec;
        h += '<div class="nu-rol" data-rol="' + r + '"><b>' + (r === 'supervisor' ? 'Supervisor' : 'Técnicos') + '</b> · bolsa ' + $$(so.bolsa[r]) + ' · pagado ' + $$(so.pagado[r]) +
          ' · disponible <b data-disp>—</b><div class="nu-reparto">' +
          (Object.keys(gente).length ? Object.keys(gente).map(function (k) { return '<label>' + e(nom(k)) + ' <small class="muted">' + gente[k] + ' h</small><input class="nu-in" data-emp="' + k + '" inputmode="decimal"></label>'; }).join('') : '<span class="muted">Nadie con horas checadas en este rol.</span>') +
          '</div><div class="err hid" data-err></div></div>';
      });
      h += '</div>';
    });
    if (!(x.sos || []).length) h += '<div class="caja vacio">Sin SO con avance u horas esta semana.</div>';

    // Comercial
    var tar = Number(x.tarifa_comercial_usd) || 140, porFecha = {};
    (x.comercial || []).forEach(function (cc) { porFecha[cc.fecha] = cc; });
    var richard = (x.personas || []).find(function (p) { return p.tipo_pago_usa === 'supervisor_comercial'; });
    if (richard) {
      h += '<div class="caja nu-so" id="nu-com"><h3>Comercial de ' + e(richard.alias) + ' <small class="muted">($' + tar + ' netos × % comercial del día)</small></h3><div class="nu-scroll"><table class="nu-tabla"><thead><tr><th>Día</th><th class="n">% comercial</th><th class="n">Sugerido</th><th class="n">Monto</th></tr></thead><tbody>' +
        sem.dias.map(function (f, j) {
          var cc = porFecha[f], est = j >= 5;
          return '<tr data-fecha="' + f + '" data-est="' + est + '"><td>' + DIAS[j] + ' ' + f.slice(5) + (est ? ' <span class="chip e-espera">estimado</span>' : '') +
            (cc && cc.excepcion ? '<div><span class="nu-exc">CON EXCEPCIÓN</span> <span class="muted">' + e(cc.explicacion || '') + '</span></div>' : '') + '</td>' +
            '<td class="n">' + (est ? '<input class="nu-in" data-pct inputmode="numeric" value="0">%' : '<span data-pct-fijo="' + (cc ? cc.pct : 0) + '">' + (cc ? cc.pct : 0) + '%</span>') + '</td>' +
            '<td class="n">' + (cc && cc.sugerido != null ? cc.sugerido + '%' : '—') + '</td><td class="n" data-monto></td></tr>';
        }).join('') + '</tbody></table></div><div class="muted">Comercial de la semana: <b id="nu-com-total"></b></div></div>';
    }
    // Fijos
    var fijos = (x.personas || []).filter(function (p) { return p.tipo_pago_usa === 'fijo_asistencia'; });
    fijos.forEach(function (p) {
      var monto = N.fijoAsistencia(p.fijo_semanal_usd || 0, p.faltas_injustificadas || 0);
      h += '<div class="caja nu-so nu-fijo" data-fijo="' + p.employee_id + '"><h3>Fijo de ' + e(p.alias) + '</h3>' +
        (p.fijo_semanal_usd > 0 ? '<div>Fijo semanal ' + $$(p.fijo_semanal_usd) + ' · faltas injustificadas confirmadas por RH: ' + (p.faltas_injustificadas || 0) + ' → <b>' + $$(monto) + '</b>' + (p.faltas_injustificadas > 0 ? ' <span class="nu-bloq">Todo o nada: con una falta injustificada el fijo de la semana no se paga.</span>' : '') + '</div>'
                                : '<div class="nu-bloq">Falta capturar su fijo semanal en la ficha. No se incluye.</div>') + '</div>';
    });
    // Ajuste del viernes: lo que se estimó el miércoles contra lo real. Precargado, no se edita.
    var ajustes = (x.ajustes || []).concat(x.ajustes_previos || []).filter(function (a) { return !a.informativo; });
    var totAj = ajustes.reduce(function (a, j) { return a + Number(j.monto || 0); }, 0);
    if (ajustes.length) h += '<div class="caja nu-so" id="nu-ajuste"><h3>Ajuste de la semana anterior</h3><p class="muted">Se compara lo estimado el miércoles contra lo real. Va precargado y no se edita.</p><div class="nu-scroll"><table class="nu-tabla"><thead><tr><th>Persona</th><th>Día</th><th class="n">Estimado</th><th class="n">Real</th><th class="n">Ajuste</th></tr></thead><tbody>' +
      ajustes.map(function (a) { return '<tr><td>' + e(a.alias || nom(a.employee_id)) + '</td><td>' + e(a.fecha || '') + '</td><td class="n">' + a.estimado + '%</td><td class="n">' + a.real + '%</td><td class="n"><b>' + $$(a.monto) + '</b></td></tr>'; }).join('') +
      '</tbody></table></div></div>';
    h += '<div class="nu-kpis"><div class="nu-kpi"><b id="nu-total">—</b><small>total de la solicitud</small></div></div>' +
      '<div class="err hid" id="nu-envio-err"></div>' +
      (puede ? '<div class="nu-acc"><button class="btn pri" id="nu-enviar"' + (disp.length ? ' disabled title="Hay una incidencia en disputa"' : '') + '>Enviar solicitud</button></div>' : '');
    // Los eventos se cuelgan de una raíz NUEVA en cada pintado: colgarlos de #vista (que se
    // reusa entre pestañas) acumulaba recalculadores viejos apuntando a nodos que ya no existen.
    el.innerHTML = '<div class="nu-raiz">' + h + '</div>';
    var raiz = el.firstElementChild;
    cablearSemana(el, c);

    function recalcular() {
      var total = 0, errores = 0;
      el.querySelectorAll('.nu-so[data-so]').forEach(function (card) {
        var so = x.sos[Number(card.dataset.so)]; if (!so.bolsa) return;
        var mie = card.querySelector('[data-est=mie]'), jue = card.querySelector('[data-est=jue]');
        var eEst = N.validarEstimados(so.avance_ultimo, mie.value, jue.value);
        mie.classList.toggle('malo', !!eEst && Number(mie.value) < so.avance_ultimo); jue.classList.toggle('malo', !!eEst);
        card.querySelectorAll('.nu-rol').forEach(function (rb) {
          var r = rb.dataset.rol, d = N.disponible(so.bolsa[r], eEst ? so.avance_ultimo : Number(jue.value), so.pagado[r]);
          rb.querySelector('[data-disp]').textContent = $$(d);
          var montos = {}; rb.querySelectorAll('[data-emp]').forEach(function (i) { montos[i.dataset.emp] = Number(i.value) || 0; });
          var v = N.validarReparto(montos, d), box = rb.querySelector('[data-err]');
          var msg = eEst || (v.ok ? '' : v.mensaje);
          box.textContent = msg; box.classList.toggle('hid', !msg); if (msg) errores++;
          rb.querySelectorAll('[data-emp]').forEach(function (i) { i.classList.toggle('malo', !v.ok); });
          if (v.ok) total += v.total;
        });
      });
      var com = el.querySelector('#nu-com');
      if (com) {
        var dias = [];
        com.querySelectorAll('tr[data-fecha]').forEach(function (tr) {
          var inp = tr.querySelector('[data-pct]'), pct = inp ? Number(inp.value) || 0 : Number(tr.querySelector('[data-pct-fijo]').dataset.pctFijo) || 0;
          var m = N.pagoComercial([{ fecha: tr.dataset.fecha, pct: pct }], tar).total;
          tr.querySelector('[data-monto]').textContent = $$(m); dias.push({ fecha: tr.dataset.fecha, pct: pct });
        });
        var tc = N.pagoComercial(dias, tar).total; el.querySelector('#nu-com-total').textContent = $$(tc); total += tc;
      }
      fijos.forEach(function (p) { if (p.fijo_semanal_usd > 0) total += N.fijoAsistencia(p.fijo_semanal_usd, p.faltas_injustificadas || 0); });
      total += totAj;
      el.querySelector('#nu-total').textContent = $$(total);
      var b = el.querySelector('#nu-enviar'); if (b && !disp.length) b.disabled = errores > 0;
    }
    function sugerir(card) {
      var so = x.sos[Number(card.dataset.so)]; if (!so.bolsa) return;
      var jue = Number(card.querySelector('[data-est=jue]').value) || so.avance_ultimo;
      card.querySelectorAll('.nu-rol').forEach(function (rb) {
        var r = rb.dataset.rol, horas = {};
        rb.querySelectorAll('[data-emp]').forEach(function (i) { horas[i.dataset.emp] = (so.horas || {})[i.dataset.emp] || 0; });
        var sug = N.repartoSugerido(N.disponible(so.bolsa[r], jue, so.pagado[r]), horas);
        rb.querySelectorAll('[data-emp]').forEach(function (i) { i.value = (sug[i.dataset.emp] || 0).toFixed(2); i.dataset.sugerido = i.value; });
      });
    }
    el.querySelectorAll('.nu-so[data-so]').forEach(function (card) {
      sugerir(card);
      card.querySelectorAll('[data-est]').forEach(function (i) { i.addEventListener('change', function () { sugerir(card); recalcular(); }); });
    });
    raiz.addEventListener('input', recalcular);
    recalcular();

    el.querySelectorAll('[data-revision]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var r = await c.llamar({ accion: 'pedir_revision', id: Number(b.dataset.revision) });
        c.toast(r && r.ok ? (r.notificada ? 'Se le avisó a Magaly.' : 'Quedó marcada para Magaly (alertas en sombra: sin correo).') : c.mensaje(r)); c.recargar();
      });
    });
    var bEnv = el.querySelector('#nu-enviar');
    if (bEnv) bEnv.addEventListener('click', async function () {
      var envio = { semana: sem.inicio, sos: [], comercial: [], fijos: [] };
      el.querySelectorAll('.nu-so[data-so]').forEach(function (card) {
        var so = x.sos[Number(card.dataset.so)]; if (!so.bolsa) return;
        var o = { so_id: so.so_id, so_nombre: so.so_nombre, est_mie: Number(card.querySelector('[data-est=mie]').value), est_jue: Number(card.querySelector('[data-est=jue]').value), reparto: {}, sugerido: {} };
        card.querySelectorAll('.nu-rol').forEach(function (rb) { var r = rb.dataset.rol; o.reparto[r] = {}; o.sugerido[r] = {};
          rb.querySelectorAll('[data-emp]').forEach(function (i) { o.reparto[r][i.dataset.emp] = Number(i.value) || 0; o.sugerido[r][i.dataset.emp] = Number(i.dataset.sugerido) || 0; }); });
        envio.sos.push(o);
      });
      var com = el.querySelector('#nu-com');
      if (com && richard) com.querySelectorAll('tr[data-fecha]').forEach(function (tr) {
        var inp = tr.querySelector('[data-pct]'), cc = porFecha[tr.dataset.fecha] || {};
        var pct = inp ? Number(inp.value) || 0 : (cc.pct || 0);
        envio.comercial.push({ employee_id: richard.employee_id, fecha: tr.dataset.fecha, pct: pct, estimado: !!inp, sugerido: inp ? pct : (cc.sugerido || 0), excepcion: !inp && !!cc.excepcion, explicacion: cc.explicacion || null });
      });
      fijos.forEach(function (p) { if (p.fijo_semanal_usd > 0) envio.fijos.push({ employee_id: p.employee_id }); });
      var r = await c.llamar({ accion: 'solicitud_enviar', envio: envio }), box = el.querySelector('#nu-envio-err');
      if (!r || r.ok === false) { box.innerHTML = e(r && r.mensaje || c.mensaje(r)) + (r && r.errores ? '<ul>' + r.errores.map(function (z) { return '<li>' + e(z.mensaje || z.codigo) + '</li>'; }).join('') + '</ul>' : ''); box.classList.remove('hid'); return; }
      c.toast('Solicitud enviada. Sigue Magaly.'); c.recargar();
    });
  }
  function cablearSemana(el, c) {
    el.querySelectorAll('[data-sem]').forEach(function (b) {
      b.addEventListener('click', function () { var d = new Date(st.semana + 'T12:00:00Z'); st.semana = new Date(d.getTime() + Number(b.dataset.sem) * 86400000).toISOString().slice(0, 10); c.recargar(); });
    });
  }
  G.NusaApp.tab({ id: 'solicitud', label: 'Solicitud del miércoles', scopes: ['nomina_usa:kiosko'], render: render, _st: st });
})(window);
