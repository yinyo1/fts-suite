/* ═══ RH · Nómina USA · pestaña Alertas e incidencias (#448, fase C) ═══
 * Bandeja de Magaly y Ana: entradas y salidas faltantes (en sombra: registradas, sin correo),
 * incidencias del periodo (sin checada, sin cerrar, sin SO) y días sin ubicación por validar.
 * RH marca: falta justificada / falta injustificada / error de checada corregido / en disputa.
 * «En disputa» BLOQUEA la solicitud de nómina de esa persona hasta que RH la libere.
 */
(function (G) {
  'use strict';
  var TIPO = { entrada_faltante: 'Entrada faltante', salida_faltante: 'Salida faltante (aviso a la persona)', salida_faltante_rh: 'Salida faltante desde ayer', incidencia_periodo: 'Incidencia del periodo' };
  var INC = { sin_checada: 'Día sin checada', sin_cerrar: 'Salida sin cerrar', sin_so: 'Sin SO' };
  var ESTADO = { abierta: 'Abierta', falta_justificada: 'Falta justificada', falta_injustificada: 'Falta injustificada', error_corregido: 'Error de checada corregido', en_disputa: 'En disputa' };
  var CLASE = { abierta: 'e-espera', en_disputa: 'e-vencido', falta_justificada: 'e-validado', error_corregido: 'e-validado', falta_injustificada: 'e-otro' };

  async function render(el, c) {
    var e = c.esc, puede = c.tiene('nomina_usa:validar');
    var ra = await c.llamar({ accion: 'alertas', solo_abiertas: !G.NusaApp._st.todasAlertas }), rd = await c.llamar({ accion: 'dias', solo_pendientes: true });
    if (!ra || ra.ok === false) { el.innerHTML = '<div class="err">' + e(c.mensaje(ra)) + '</div>'; return; }
    var modo = ra.modo === 'real' ? 'REAL: las alertas nuevas mandan correo.' : 'SOMBRA: se registran y no sale ningún correo.';
    var abiertas = ra.alertas.filter(function (a) { return a.estado === 'abierta'; }).length, disp = ra.alertas.filter(function (a) { return a.estado === 'en_disputa'; }).length;
    var h = '<div class="aviso ' + (ra.modo === 'real' ? '' : 'demo') + '"><div><b>Alertas en ' + (ra.modo === 'real' ? 'modo real' : 'modo sombra') + '</b>' + modo + '</div></div>' +
      '<div class="nu-kpis"><div class="nu-kpi"><b>' + abiertas + '</b><small>abiertas</small></div><div class="nu-kpi"><b>' + disp + '</b><small>en disputa (bloquean nómina)</small></div>' +
      '<div class="nu-kpi"><b>' + ((rd && rd.dias) || []).length + '</b><small>días sin ubicación por validar</small></div></div>';
    if (rd && rd.dias && rd.dias.length) {
      h += '<div class="cab"><h1>Días sin ubicación</h1></div><div class="caja nu-scroll"><table class="nu-tabla"><thead><tr><th>Persona</th><th>Fecha</th><th>Declaró</th><th></th></tr></thead><tbody>' +
        rd.dias.map(function (d) {
          return '<tr><td>' + e(d.alias) + '</td><td>' + e(d.fecha) + '</td><td>' + e(d.pais) + '</td><td>' +
            (puede ? '<button class="btn" data-dia="' + d.employee_id + '|' + d.fecha + '|USA">Fue USA</button> <button class="btn" data-dia="' + d.employee_id + '|' + d.fecha + '|MX">Fue México</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    h += '<div class="cab"><h1>Alertas e incidencias</h1><span class="sp"></span><button class="btn" id="nu-todas">' + (G.NusaApp._st.todasAlertas ? 'Solo abiertas' : 'Ver todas') + '</button></div>';
    if (!ra.alertas.length) h += '<div class="caja vacio">Sin alertas.</div>';
    else h += '<div class="caja nu-scroll"><table class="nu-tabla nu-cards"><thead><tr><th>Persona</th><th>Fecha</th><th>Qué</th><th>Estado</th></tr></thead><tbody>' +
      ra.alertas.map(function (a) {
        var que = TIPO[a.tipo] + (a.tipo === 'incidencia_periodo' ? ': <b>' + e(INC[a.detalle.tipo] || a.detalle.tipo) + '</b>' : '') +
          (a.attendance_id ? ' <span class="muted">· asistencia ' + a.attendance_id + '</span>' : '') +
          (a.detalle && a.detalle.horas ? ' <span class="muted">· ' + a.detalle.horas + ' h</span>' : '') +
          (a.detalle && a.detalle.hora_ref ? ' <span class="muted">· referencia ' + e(a.detalle.hora_ref) + ' ' + e(a.detalle.zona) + '</span>' : '') +
          (a.modo_al_crear === 'sombra' && a.tipo !== 'incidencia_periodo' ? ' <span class="chip e-otro">sombra</span>' : '');
        var acc = puede ? ['falta_justificada', 'falta_injustificada', 'error_corregido', 'en_disputa'].filter(function (x) { return x !== a.estado; })
          .map(function (x) { return '<button class="btn" data-marca="' + a.id + '|' + x + '">' + ESTADO[x] + '</button>'; }).join(' ') : '';
        return '<tr><td>' + e(a.alias) + '</td><td class="nu-fecha">' + e(a.fecha) + '</td><td>' + que + (a.nota ? '<div class="muted">Nota: ' + e(a.nota) + '</div>' : '') +
          (acc ? '<div class="nu-acc-fila">' + acc + '</div>' : '') + '</td>' +
          '<td><span class="chip ' + (CLASE[a.estado] || '') + '">' + ESTADO[a.estado] + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';
    el.innerHTML = h;

    var t = el.querySelector('#nu-todas'); if (t) t.addEventListener('click', function () { G.NusaApp._st.todasAlertas = !G.NusaApp._st.todasAlertas; c.recargar(); });
    el.querySelectorAll('[data-marca]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var x = b.dataset.marca.split('|'), nota = null;
        if (x[1] === 'falta_justificada' || x[1] === 'en_disputa') { nota = G.prompt('Motivo (' + ESTADO[x[1]] + '):'); if (!nota) return; }
        else nota = G.prompt('Nota (opcional):') || null;
        var r = await c.llamar({ accion: 'alerta_marcar', id: Number(x[0]), estado: x[1], nota: nota });
        c.toast(r && r.ok ? 'Marcada: ' + ESTADO[x[1]] : c.mensaje(r)); c.recargar();
      });
    });
    el.querySelectorAll('[data-dia]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var x = b.dataset.dia.split('|');
        var r = await c.llamar({ accion: 'dia_validar', employee_id: Number(x[0]), fecha: x[1], pais: x[2], nota: 'Validado por RH' });
        c.toast(r && r.ok ? 'Día validado como ' + x[2] : c.mensaje(r)); c.recargar();
      });
    });
  }
  G.NusaApp.tab({ id: 'alertas', label: 'Alertas e incidencias', scopes: ['nomina_usa:validar', 'nomina_usa:autorizar'], render: render });
})(window);
