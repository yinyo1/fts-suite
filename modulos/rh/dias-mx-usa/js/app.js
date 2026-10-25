/* ═══ RH · Días México / USA (#396 fase a) ═══
 *
 * Lee rh/dias-mx-usa: el servidor junta Odoo (asistencias aprobadas) con Postgres (tipo de
 * día que confirmó Felipe) y arma el reporte con asistencia/lib/dias-mx-usa.js. Esta página
 * sólo lo pinta; la MISMA librería arma el ejemplo y las hojas de Excel, así que lo que se
 * ve, lo que se baja y lo que calcula el servidor no pueden discrepar.
 *
 * Las respuestas se clasifican en UN solo lugar (CLAUDE.md §20 #12b):
 *   sesion   → la llave no vale: se borra la sesión y se pide entrar.
 *   red      → no hubo respuesta.
 *   servidor → contestó con un error suyo: se muestra tal cual.
 */
(function (G) {
  'use strict';
  var URL_REPORTE = 'https://primary-production-5c3c.up.railway.app/webhook/rh/dias-mx-usa';
  var SCOPE = 'rh:dias-mx-usa';
  var ERR_SESION = { TOKEN_AUSENTE: 1, TOKEN_MALFORMADO: 1, FIRMA_INVALIDA: 1, PAYLOAD_ILEGIBLE: 1, TOKEN_EXPIRADO: 1, SCOPE_INSUFICIENTE: 1 };
  var MSG = {
    TOKEN_EXPIRADO: 'Tu sesión venció. Vuelve a entrar.', FIRMA_INVALIDA: 'Tu sesión ya no es válida. Vuelve a entrar.',
    SCOPE_INSUFICIENTE: 'Tu usuario no tiene el permiso rh:dias-mx-usa. Pídelo a Dirección.',
    SIN_RED: 'No hubo respuesta del servidor. Revisa tu conexión y vuelve a intentar.',
    POSTGRES_NO_RESPONDE: 'No se pudo leer el tipo de día. El reporte no se arma a medias; intenta en unos minutos.',
    AUTOPRUEBA_LIB: 'El servidor no pasó su autoprueba. Avisa a Esteban.', AUTOPRUEBA_CRIPTO: 'El servidor no pasó su autoprueba. Avisa a Esteban.'
  };
  var D = G.DiasMxUsa;
  var st = { modo: 'real', rep: null, cuadre: null, gen: null, filtro: 'todos', pidiendo: 0 };
  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ─── semanas ───
  function hoyCst() { return new Date(Date.now() - 6 * 36e5).toISOString().slice(0, 10); }
  function menosDias(iso, n) { return new Date(Date.parse(iso + 'T12:00:00Z') - n * 864e5).toISOString().slice(0, 10); }
  function semanas() {
    var hoy = hoyCst(), actual = D.semanaDe(hoy), out = [{ s: actual, en_curso: true }];
    for (var i = 1; i <= 10; i++) out.push({ s: D.semanaDe(menosDias(actual.desde, 7 * i - 6)), en_curso: false });
    return out;
  }
  function pintarSemanas() {
    var L = semanas(), h = '';
    L.forEach(function (x, i) {
      h += '<option value="' + x.s.id + '"' + (i === 1 ? ' selected' : '') + '>' + x.s.id + ' · ' + x.s.desde.slice(5) + ' a ' + x.s.hasta.slice(5) + (x.en_curso ? ' (en curso)' : '') + '</option>';
    });
    $('#semana').innerHTML = h;
  }

  // ─── red ───
  async function pedirReal(semana) {
    var token = G.SuiteAuth && G.SuiteAuth.getToken ? G.SuiteAuth.getToken() : null;
    if (!token) return { ok: false, tipo: 'sesion', error: 'TOKEN_AUSENTE' };
    var res, j;
    try {
      res = await fetch(URL_REPORTE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token, semana: semana }) });
    } catch (e) { return { ok: false, tipo: 'red', error: 'SIN_RED' }; }
    try { j = await res.json(); } catch (e) { j = null; }
    if (!j) return { ok: false, tipo: 'servidor', error: 'HTTP_' + res.status };
    if (j.success !== true && ERR_SESION[j.error]) {
      if (j.error !== 'SCOPE_INSUFICIENTE' && G.SuiteAuth && G.SuiteAuth.logout) G.SuiteAuth.logout();
      return { ok: false, tipo: 'sesion', error: j.error };
    }
    if (j.success !== true) return { ok: false, tipo: 'servidor', error: j.codigo || j.error || 'ERROR', mensaje: j.mensaje };
    return { ok: true, reporte: j.reporte, cuadre: j.cuadre || {}, generado_at: j.generado_at };
  }

  // Ejemplo: personas inventadas que cubren los cuatro tipos, un recobro y los pendientes.
  function pedirDemo(semana) {
    var s = D.semanaPorId(semana), d = s.dias, n = 900000, A = [];
    function att(emp, nom, i, tipo, conf, so, cia, extra) {
      n++;
      A.push(Object.assign({ attendance_id: n, employee_id: emp, empleado_nombre: nom, check_in: d[i] + ' 13:00:00', check_out: d[i] + ' 23:06:00',
        worked_hours: 10.1, confirmado: conf !== false, so_id: so ? so[0] : null, so_nombre: so ? so[1] : null, so_company_id: so ? cia : null,
        cuenta_id: null, cuenta_nombre: null, evento: tipo ? { tipo_dia: tipo } : null }, extra || {}));
    }
    var MF = [7001, 'SO11842 Mission Foods - Dallas'], VT = [7002, 'SO9428 Vertiv 2da Fase'], TC = [7003, 'SO11547 Topo Chico'];
    [1, 2, 3, 4, 5].forEach(function (i) { att(501, 'Laura Demo', i, 'mexico', true, VT, 1); });
    att(502, 'Óscar Demo', 1, 'viaje_usa', true, MF, 6); att(502, 'Óscar Demo', 2, 'proyecto_usa', true, MF, 6);
    att(502, 'Óscar Demo', 3, 'proyecto_usa', true, MF, 6); att(502, 'Óscar Demo', 4, 'proyecto_usa', true, MF, 6);
    att(502, 'Óscar Demo', 5, 'viaje_mexico', true, null, null, { cuenta_id: 3096, cuenta_nombre: 'ADMIN DE OPERACIONES', evento: { tipo_dia: 'viaje_mexico', recobro_usa: true } });
    att(503, 'Tomás Demo', 1, 'mexico', true, TC, 1); att(503, 'Tomás Demo', 2, 'viaje_usa', true, MF, 6);
    att(503, 'Tomás Demo', 3, 'proyecto_usa', false, MF, 6); att(503, 'Tomás Demo', 4, null, true, MF, 6);
    att(504, 'Rebeca Demo', 1, 'mexico', true, TC, 1); att(504, 'Rebeca Demo', 2, 'mexico', true, TC, 1);
    att(504, 'Rebeca Demo', 3, 'viaje_usa', true, null, null); att(504, 'Rebeca Demo', 4, 'mexico', true, TC, 1);
    A.push(Object.assign({}, A[A.length - 1], { attendance_id: ++n, check_in: d[4] + ' 23:30:00', check_out: null, worked_hours: 0, evento: null }));
    var rep = D.armarReporte({ semana: semana, asistencias: A });
    return Promise.resolve({ ok: true, reporte: rep, generado_at: new Date().toISOString(),
      cuadre: { at: new Date(Date.now() - 3 * 36e5).toISOString(), ok: true, desde: d[0], hasta: d[6], n_sin_evento: 1, sin_evento: [900099], n_sin_odoo: 0, sin_odoo: [] } });
  }

  async function cargar() {
    var semana = $('#semana').value, yo = ++st.pidiendo;
    $('#lista').innerHTML = '<div class="vacio">Leyendo ' + esc(semana) + '…</div>';
    $('#resumen').innerHTML = ''; $('#cuadre').innerHTML = ''; $('#excel').disabled = true; $('#gen').textContent = '';
    var r = st.modo === 'demo' ? await pedirDemo(semana) : await pedirReal(semana);
    if (yo !== st.pidiendo) return; // llegó tarde: ya se pidió otra semana
    if (!r.ok) {
      if (r.tipo === 'sesion' && r.error !== 'SCOPE_INSUFICIENTE') return mostrarPuerta(MSG[r.error] || 'Vuelve a entrar.');
      st.rep = null;
      $('#lista').innerHTML = '<div class="aviso mal"><div><b>' + (r.tipo === 'red' ? 'Sin respuesta' : 'El servidor contestó con un error') + '</b>' +
        esc(MSG[r.error] || r.mensaje || r.error) + '</div></div>';
      return;
    }
    st.rep = r.reporte; st.cuadre = r.cuadre; st.gen = r.generado_at;
    pintar();
  }

  // ─── pintar ───
  function fechaHoraCst(iso) {
    if (!iso) return '';
    var t = new Date(Date.parse(iso) - 6 * 36e5).toISOString();
    return t.slice(8, 10) + '/' + t.slice(5, 7) + ' ' + t.slice(11, 16) + ' CST';
  }
  function pintarCuadre(c) {
    var h;
    if (!c || !c.at) {
      h = '<div class="aviso info"><div><b>El cuadre Odoo ↔ Postgres todavía no ha corrido</b>El vigía diario (7:20) compara las asistencias de Odoo con los eventos guardados. Mientras no corra, un día sin evento aparece como pendiente "sin tipo".</div></div>';
    } else if (c.ok === false) {
      h = '<div class="aviso mal"><div><b>El último cuadre falló</b>Corrió ' + esc(fechaHoraCst(c.at)) + '. ' + esc(c.codigo || '') + '</div></div>';
    } else if (c.n_sin_evento || c.n_sin_odoo) {
      var L = [];
      if (c.n_sin_evento) L.push('<li>' + c.n_sin_evento + ' asistencia(s) de Odoo sin evento en Postgres: ' + (c.sin_evento || []).slice(0, 12).map(function (x) { return 'att ' + esc(x.id || x) + (x.fecha ? ' (' + esc(x.fecha) + ')' : ''); }).join(', ') + '</li>');
      if (c.n_sin_odoo) L.push('<li>' + c.n_sin_odoo + ' evento(s) cuya asistencia ya no existe en Odoo: ' + (c.sin_odoo || []).slice(0, 12).map(function (x) { return 'att ' + esc(x.id || x); }).join(', ') + '</li>');
      h = '<div class="aviso mal"><div><b>Odoo y Postgres no cuadran</b>Cuadre del ' + esc(fechaHoraCst(c.at)) + ' (' + esc(c.desde || '') + ' a ' + esc(c.hasta || '') + '). Esos días salen pendientes hasta que Felipe les ponga tipo en Confirmar Horas.<ul>' + L.join('') + '</ul></div></div>';
    } else {
      h = '<div class="aviso bien"><div><b>Odoo y Postgres cuadran</b>Último cuadre ' + esc(fechaHoraCst(c.at)) + ' (' + esc(c.desde || '') + ' a ' + esc(c.hasta || '') + ').</div></div>';
    }
    $('#cuadre').innerHTML = h;
  }
  function cubeta(n, l, q, cls) { return '<div class="cubeta ' + (cls || '') + '"><span class="n">' + n + '</span><span class="l">' + esc(l) + '</span>' + (q ? '<span class="q">' + esc(q) + '</span>' : '') + '</div>'; }
  function etiquetaDia(d) {
    if (d.estado === 'sin_checadas') return '—';
    if (d.estado === 'pendiente') return 'Pendiente';
    return D.ETIQUETA[d.tipo] || d.tipo;
  }
  // En pantallas angostas la celda mide ~45 px: la etiqueta larga se partía a media palabra.
  var CORTA = { mexico: 'MX', viaje_mexico: 'V→MX', proyecto_usa: 'USA', viaje_usa: 'V→USA' };
  function corta(d) {
    if (d.estado === 'sin_checadas') return '—';
    if (d.estado === 'pendiente') return 'Pend.';
    return CORTA[d.tipo] || d.tipo;
  }
  function tarjeta(p) {
    var h = '<div class="per' + (p.pendientes ? ' con-pend' : '') + '" data-emp="' + p.employee_id + '">';
    h += '<div class="per-cab"><span class="nom">' + esc(p.nombre) + '</span><span class="sp"></span><span class="tot">' +
      '<span class="chip mx' + (p.paga_mx ? '' : ' cero') + '">México ' + p.paga_mx + '</span>' +
      '<span class="chip usa' + (p.paga_usa ? '' : ' cero') + '">FTS USA ' + p.paga_usa + '</span>' +
      (p.pendientes ? '<span class="chip pend">Pendientes ' + p.pendientes + '</span>' : '') + '</span></div>';
    h += '<div class="dias">';
    p.dias.forEach(function (d) {
      var tip = d.estado === 'pendiente' ? d.motivos.join('; ') : (d.cargos || []).map(function (c) { return c.nombre; }).join(' · ');
      h += '<div class="dia ' + d.estado + '" title="' + esc(tip) + '"><div class="d">' + esc(D.nombreDia(d.fecha)) + '</div>' +
        '<div class="t"><span class="l">' + esc(etiquetaDia(d)) + '</span><span class="c">' + esc(corta(d)) + '</span>' + (d.recobro_usa ? '*' : '') + '</div>' +
        (d.estado === 'sin_checadas' ? '' : '<div class="h">' + d.horas.toFixed(1) + ' h</div>') + '</div>';
    });
    h += '</div><div class="como"><div><span class="k">Cómo salió México:</span> ' + esc(p.como_salio.mx) + '</div>' +
      '<div><span class="k">Cómo salió FTS USA:</span> ' + esc(p.como_salio.usa) + '</div>' +
      (p.como_salio.pendiente ? '<div class="rojo"><span class="k">Pendiente:</span> ' + esc(p.como_salio.pendiente) + '</div>' : '') +
      (p.dias.some(function (d) { return d.recobro_usa; }) ? '<div>* Cargado a ADMIN DE OPERACIONES con recobro a FTS USA (D-7).</div>' : '') + '</div>';
    (p.propuesta_trabajo_usa || []).forEach(function (x) {
      h += '<div class="prop"><b>Propuesta para Nómina:</b> Trabajó en USA · ' + x.valores.dias + (x.valores.dias === 1 ? ' día' : ' días') + ' · ' + esc(x.valores.so) +
        '. Se acepta en Nómina · Incidencias, en el cajón de la persona.</div>';
    });
    return h + '</div>';
  }
  function pintar() {
    var r = st.rep;
    $('#rango').textContent = r.semana + ' · viernes ' + r.desde + ' a jueves ' + r.hasta;
    $('#gen').textContent = st.gen ? 'Leído ' + fechaHoraCst(st.gen) : '';
    $('#excel').disabled = !r.personas.length;
    pintarCuadre(st.cuadre);
    var t = r.totales;
    $('#resumen').innerHTML = cubeta(t.personas, 'Personas con checadas') + cubeta(t.paga_mx, 'Días que paga México') +
      cubeta(t.paga_usa, 'Días que paga FTS USA', t.con_usa + ' persona(s)', 'rh') + cubeta(t.pendientes, 'Días pendientes', 'no suman', t.pendientes ? 'urge' : '');
    var L = r.personas.filter(function (p) { return st.filtro === 'usa' ? p.paga_usa > 0 : st.filtro === 'pend' ? p.pendientes > 0 : true; });
    $('#lista').innerHTML = L.length ? L.map(tarjeta).join('') : '<div class="vacio">' + (r.personas.length ? 'Nadie cumple el filtro.' : 'No hay checadas en esta semana.') + '</div>';
    $('#pie').textContent = 'Fuente: asistencias de Odoo (empresa FTS MX) + tipo de día en Postgres. Viernes a jueves, hora del centro (CST).';
  }
  function descargarExcel() {
    if (!st.rep || !G.NomExcel) return;
    var bytes = G.NomExcel.libro(D.hojasExcel(st.rep));
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'dias-mx-usa-' + st.rep.semana.replace('/', '-') + (st.modo === 'demo' ? '-EJEMPLO' : '') + '.xlsx';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // ─── puerta ───
  function mostrarPuerta(msg) {
    $('#app').classList.add('hid'); $('#puerta').classList.remove('hid'); $('#salir').classList.add('hid'); $('#quien').textContent = '';
    var e = $('#login-err'); if (msg) { e.textContent = msg; e.classList.remove('hid'); } else e.classList.add('hid');
  }
  function entrarApp(nombre) {
    $('#puerta').classList.add('hid'); $('#app').classList.remove('hid'); $('#salir').classList.remove('hid');
    $('#quien').textContent = nombre || '';
    $('#modo').classList.toggle('hid', st.modo !== 'demo'); $('#aviso-demo').classList.toggle('hid', st.modo !== 'demo');
    pintarSemanas(); cargar();
  }
  async function entrar() {
    var u = $('#u').value.trim(), p = $('#p').value;
    if (!u || !p) return mostrarPuerta('Escribe usuario y contraseña.');
    $('#entrar').disabled = true;
    var r = await G.SuiteAuth.login(u, p);
    $('#entrar').disabled = false;
    if (!r.ok) return mostrarPuerta(r.mensaje || 'No se pudo entrar.');
    if (!G.SuiteAuth.tieneScope(SCOPE)) { G.SuiteAuth.logout(); return mostrarPuerta(MSG.SCOPE_INSUFICIENTE); }
    st.modo = 'real'; entrarApp(r.sesion.nombre);
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t.id === 'entrar') return entrar();
    if (t.id === 'demo') { st.modo = 'demo'; return entrarApp('rh.demo'); }
    if (t.id === 'salir') { if (st.modo !== 'demo') G.SuiteAuth.logout(); st.modo = 'real'; $('#modo').classList.add('hid'); return mostrarPuerta(); }
    if (t.id === 'excel') return descargarExcel();
  });
  document.addEventListener('change', function (ev) {
    if (ev.target.id === 'semana') return cargar();
    if (ev.target.id === 'filtro') { st.filtro = ev.target.value; if (st.rep) pintar(); }
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target.id === 'p') entrar(); });

  if (G.SuiteAuth && G.SuiteAuth.isValid() && G.SuiteAuth.tieneScope(SCOPE)) {
    var s = G.SuiteAuth.getSession(); entrarApp(s && s.nombre);
  } else mostrarPuerta();
  G.DiasApp = { st: st, pedirDemo: pedirDemo, semanas: semanas };
})(window);
