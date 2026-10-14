/* ═══ Marketing · Bandeja del radar (#407 §6) ═══
 *
 * Solo LEE marketing.bandeja_senal (la escriben las corridas del radar por
 * marketing/senal-registrar). Estados: nueva → en trabajo → enviada a CRM | descartada (motivo
 * obligatorio). «Trabajar» abre la señal como sesión del Prospectador; descartar con motivo es
 * evidencia que corrige al radar. Aviso visible si una señal nueva pasa de 48 horas hábiles.
 * Todo texto de una señal (prensa, vacantes) es DATO: se pinta escapado y la liga abre aparte.
 */
(function (G) {
  'use strict';
  var M = G.Mkt, U = G.ChatUI, esc = U.esc, C = M.cliente, $ = function (s) { return document.querySelector(s); };
  var V = $('#vista'), filtro = 'activas', datos = null;
  var ETQ = { nueva: ['nueva', 'o'], en_trabajo: ['en trabajo', 'b'], enviada_crm: ['enviada a CRM', 'g'], descartada: ['descartada', ''] };

  async function cargar() {
    M.cab('Bandeja del radar', 'Marketing', '../index.html');
    if (!M.tiene('marketing:bandeja')) {
      V.innerHTML = '<div class="ch-vacio"><div class="ic">🔒</div><h2>La bandeja pide el permiso marketing:bandeja</h2><p>Pídelo a Esteban. Es para quien prospecta.</p></div>'; return;
    }
    V.innerHTML = '<div class="ch-wrap"><p class="ch-nota">Cargando señales…</p></div>';
    var r = await C.pedir('bandeja', {});
    if (!r.ok) { V.innerHTML = '<div class="ch-wrap"><div class="ch-hall amar"><div class="ic">⚠️</div><div>' + esc(r.mensaje || r.error) + '</div></div></div>'; return; }
    datos = r; pintar();
  }
  function pintar() {
    var s = datos.senales, venc = s.filter(function (x) { return x.vencida; }).length;
    var cuenta = function (e) { return s.filter(function (x) { return e === 'activas' ? (x.estado === 'nueva' || x.estado === 'en_trabajo') : x.estado === e; }).length; };
    var F = [['activas', 'Por atender'], ['nueva', 'Nuevas'], ['en_trabajo', 'En trabajo'], ['enviada_crm', 'Enviadas'], ['descartada', 'Descartadas']];
    var lista = s.filter(function (x) { return filtro === 'activas' ? (x.estado === 'nueva' || x.estado === 'en_trabajo') : x.estado === filtro; });
    V.innerHTML = '<div class="ch-tabs">' + F.map(function (f) { return '<button class="ch-tab' + (filtro === f[0] ? ' on' : '') + '" data-f="' + f[0] + '">' + f[1] + ' (' + cuenta(f[0]) + ')</button>'; }).join('') + '</div><div class="ch-wrap">' +
      (venc ? '<div class="ch-hall rojo"><div class="ic">⏰</div><div><b>' + venc + ' señal' + (venc === 1 ? '' : 'es') + ' nueva' + (venc === 1 ? '' : 's') + ' con más de ' + datos.aviso_horas + ' horas hábiles sin atender.</b> Trabájala o descártala con motivo.</div></div>' : '') +
      (lista.map(tarjeta).join('') || '<div class="ch-vacio"><div class="ic">📥</div><h2>Nada aquí</h2><p>Las corridas del radar escriben en esta bandeja; tú decides qué se trabaja.</p></div>') + '</div>';
    V.querySelectorAll('[data-f]').forEach(function (b) { b.onclick = function () { filtro = b.getAttribute('data-f'); pintar(); }; });
    V.querySelectorAll('[data-trab]').forEach(function (b) { b.onclick = function () { trabajar(b.getAttribute('data-trab'), b); }; });
    V.querySelectorAll('[data-desc]').forEach(function (b) { b.onclick = function () { descartar(b.getAttribute('data-desc')); }; });
  }
  function tarjeta(x) {
    var e = ETQ[x.estado] || [x.estado, ''], ev = x.evidencia || {};
    return '<div class="ch-card"><div style="display:flex;gap:8px;align-items:flex-start"><div style="flex:1;min-width:0"><b style="font-size:15px">' + esc(x.empresa) + '</b>' +
      '<div style="font-size:12px;color:var(--muted2)">' + esc(x.ciudad || '') + (x.puerta ? ' · puerta ' + esc(x.puerta) : '') + ' · ' + esc(x.corrida) + '</div></div>' +
      '<div style="text-align:right;flex-shrink:0">' + (x.puntaje != null ? '<b>' + esc(x.puntaje) + '</b><div style="font-size:10px;color:var(--muted)">puntaje</div>' : '') + '</div></div>' +
      '<p style="font-size:13px;margin:8px 0">' + esc(x.titulo) + '</p>' +
      '<div class="ch-fila" style="gap:6px;align-items:center"><span class="ch-pill ' + e[1] + '">' + esc(e[0]) + '</span>' + (x.vencida ? '<span class="ch-pill r">' + esc(x.horas_habiles) + ' h hábiles</span>' : '') +
      (ev.fecha ? '<span class="ch-pill">' + esc(ev.fecha) + '</span>' : '') + (ev.nota ? '<span class="ch-pill a">' + esc(ev.nota) + '</span>' : '') +
      (x.responsable ? '<span class="ch-pill">' + esc(x.responsable) + '</span>' : '') + '</div>' +
      (x.motivo ? '<p class="ch-nota" style="margin-top:8px">Motivo: ' + esc(x.motivo) + '</p>' : '') +
      '<div class="ch-fila" style="margin-top:10px">' + (ev.liga ? '<a class="ch-btn ch-btn-s" href="' + esc(ev.liga) + '" target="_blank" rel="noopener noreferrer">Fuente ↗</a>' : '') +
      (x.estado === 'nueva' || x.estado === 'en_trabajo' ? '<button class="ch-btn ch-btn-p" data-trab="' + esc(x.id) + '">' + (x.sesion_id ? 'Abrir sesión' : 'Trabajar') + '</button><button class="ch-btn ch-btn-r" data-desc="' + esc(x.id) + '">Descartar</button>' : '') +
      (x.estado !== 'nueva' && x.estado !== 'en_trabajo' && x.sesion_id ? '<a class="ch-btn ch-btn-s" href="../prospectador/index.html#/s/' + esc(x.sesion_id) + '">Ver sesión</a>' : '') + '</div></div>';
  }
  async function trabajar(id, b) {
    b.disabled = true; b.textContent = 'abriendo…';
    var r = await C.pedir('senal_trabajar', { senal_id: id });
    if (r.ok) location.href = '../prospectador/index.html#/s/' + r.sesion_id;
    else { b.disabled = false; b.textContent = 'Trabajar'; U.toast(r.clase === 'red' ? 'Trabajar una señal necesita red.' : (r.mensaje || r.error)); }
  }
  function descartar(id) {
    var x = datos.senales.filter(function (s) { return s.id === id; })[0];
    var cap = document.createElement('div'); cap.className = 'ch-visor';
    cap.innerHTML = '<div class="ch-card" style="max-width:420px;width:100%"><h3>Descartar · ' + esc(x.empresa) + '</h3>' +
      '<label class="ch-campo">Categoría<select id="cat"><option value="competidor">Competidor o colega</option><option value="cliente">Ya es cliente</option><option value="fuera_de_giro">Fuera de giro</option>' +
      '<option value="sin_planta">Sin planta en MX / no es planta</option><option value="vieja">Señal vieja</option><option value="otro">Otro</option></select></label><br>' +
      '<label class="ch-campo">Motivo (obligatorio: corrige al radar)<textarea id="mot" rows="3"></textarea></label><p class="ch-err ch-oculto" id="me">Escribe el motivo (5 letras o más).</p>' +
      '<div class="ch-fila" style="margin-top:10px"><button class="ch-btn ch-btn-s" id="no">Cancelar</button><button class="ch-btn ch-btn-r" id="si">Descartar</button></div></div>';
    document.body.appendChild(cap);
    cap.querySelector('#no').onclick = function () { cap.remove(); };
    cap.querySelector('#si').onclick = async function () {
      var m = cap.querySelector('#mot').value.trim(); if (m.length < 5) { cap.querySelector('#me').classList.remove('ch-oculto'); return; }
      var r = await C.pedir('senal_descartar', { senal_id: id, texto: m, tipo: cap.querySelector('#cat').value });
      if (r.ok) { cap.remove(); U.toast('Descartada con motivo.'); cargar(); } else U.toast(r.mensaje || r.error);
    };
  }
  G.MktBandeja = { arrancar: function () { U.red(document.getElementById('red')); cargar(); } };
})(window);
