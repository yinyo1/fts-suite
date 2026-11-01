/* ═══ RH · Nómina USA · armazón de la pantalla (#448) ═══
 * Puerta con SuiteAuth (scopes nomina_usa:*), pestañas por scope y modo práctica.
 * Cada pestaña se registra con NusaApp.tab({ id, label, scopes, render(el) }) desde su
 * propio archivo (tab-*.js); este archivo no sabe de reglas de negocio.
 * Esconder una pestaña no autoriza nada: el servidor revisa el scope en cada acción.
 */
(function (G) {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var TABS = [];
  var st = { scopes: [], vista: null, actor: null };

  var COMO = {
    esteban: { actor: 'esteban (práctica)', scopes: ['nomina_usa:admin'] },
    richard: { actor: 'ricardo (práctica)', scopes: ['nomina_usa:kiosko'] },
    magaly:  { actor: 'magaly (práctica)', scopes: ['nomina_usa:validar'] },
    erick:   { actor: 'erick (práctica)', scopes: ['nomina_usa:autorizar'] },
    gerardo: { actor: 'gerardo (práctica)', scopes: ['nomina_usa:archivo'] }
  };
  var SCOPES = ['nomina_usa:kiosko', 'nomina_usa:validar', 'nomina_usa:autorizar', 'nomina_usa:archivo', 'nomina_usa:admin'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tiene(sc) { return st.scopes.indexOf('nomina_usa:admin') >= 0 || st.scopes.indexOf(sc) >= 0; }
  function tieneAlguno(lista) { return lista.some(tiene); }
  function toast(t) {
    var v = document.querySelector('.toast'); if (v) v.remove();
    var el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t;
    document.body.appendChild(el); setTimeout(function () { el.remove(); }, 3500);
  }
  var MENSAJES = {
    SIN_RED: 'No hubo respuesta del servidor. Revisa tu conexión y vuelve a intentar.',
    TOKEN_EXPIRADO: 'Tu sesión venció. Vuelve a entrar.', SCOPE_INSUFICIENTE: 'Tu usuario no tiene permiso para esto.',
    REPLAY: 'Esa petición ya se había recibido. Recarga la pantalla.', MOTIVO_REQUERIDO: 'Escribe el motivo.',
    HTTP_404: 'El servidor de Nómina USA todavía no está publicado. Usa «Practicar» mientras tanto.'
  };
  function mensaje(r) { return (r && (MENSAJES[r.error] || r.mensaje || r.detalle || r.error)) || 'Error desconocido.'; }
  async function llamar(datos) {
    var r = await G.NusaApi.llamar(datos);
    if (r && r.tipo === 'sesion') { mostrarPuerta(mensaje(r)); }
    return r;
  }

  function mostrarPuerta(msg) {
    $('#app').classList.add('hid'); $('#puerta').classList.remove('hid');
    var e = $('#login-err'); if (msg) { e.textContent = msg; e.classList.remove('hid'); } else e.classList.add('hid');
  }
  function entrarApp() {
    $('#puerta').classList.add('hid'); $('#app').classList.remove('hid');
    $('#quien').textContent = st.actor || ''; $('#salir').classList.remove('hid');
    var demo = G.NusaApi.modo === 'demo';
    $('#modo').classList.toggle('hid', !demo); $('#aviso-demo').classList.toggle('hid', !demo); $('#como-wrap').classList.toggle('hid', !demo);
    pintarTabs();
  }
  function pintarTabs() {
    var vis = TABS.filter(function (t) { return tieneAlguno(t.scopes); });
    if (!vis.length) { $('#tabs').innerHTML = ''; $('#vista').innerHTML = '<div class="vacio">Tu usuario no tiene ningún permiso de Nómina USA. Pídelo a Esteban.</div>'; return; }
    if (!vis.some(function (t) { return t.id === st.vista; })) st.vista = vis[0].id;
    $('#tabs').innerHTML = vis.map(function (t) {
      return '<button class="tab" role="tab" data-vista="' + t.id + '" aria-selected="' + (t.id === st.vista) + '">' + esc(t.label) + '</button>';
    }).join('');
    abrir(st.vista);
  }
  async function abrir(id) {
    st.vista = id;
    document.querySelectorAll('#tabs .tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.vista === id)); });
    var t = TABS.find(function (x) { return x.id === id; }), el = $('#vista');
    el.innerHTML = '<div class="vacio">Cargando…</div>';
    try { await t.render(el, ctx); } catch (e) { el.innerHTML = '<div class="err">No se pudo pintar: ' + esc(e.message) + '</div>'; }
  }

  async function entrar() {
    var u = $('#u').value.trim(), p = $('#p').value;
    if (!u || !p) return mostrarPuerta('Escribe usuario y contraseña.');
    $('#entrar').disabled = true;
    var r = await G.SuiteAuth.login(u, p);
    $('#entrar').disabled = false;
    if (!r.ok) return mostrarPuerta(r.mensaje || 'No se pudo entrar.');
    desdeSesion();
  }
  function desdeSesion() {
    var s = G.SuiteAuth.getSession();
    st.scopes = (s && s.scopes || []).filter(function (x) { return SCOPES.indexOf(x) >= 0; });
    if (!st.scopes.length) { return mostrarPuerta('Tu usuario no tiene permisos de Nómina USA (nomina_usa:*). Pídelos a Esteban.'); }
    st.actor = s.nombre || s.actor; G.NusaApi.modo = 'real'; entrarApp();
  }
  function practicar(como) {
    G.NusaApi.modo = 'demo';
    var c = COMO[como] || COMO.esteban;
    G.NusaApi.demoActor = c; st.scopes = c.scopes.slice(); st.actor = c.actor;
    $('#como').value = como; entrarApp();
  }

  var ctx = { esc: esc, tiene: tiene, toast: toast, mensaje: mensaje, llamar: llamar, recargar: function () { abrir(st.vista); } };
  G.NusaApp = {
    tab: function (t) { TABS.push(t); },
    ctx: ctx, practicar: practicar, abrir: abrir, _st: st
  };

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button'); if (!t) return;
    if (t.id === 'entrar') return entrar();
    if (t.id === 'demo') return practicar('esteban');
    if (t.id === 'salir') { if (G.NusaApi.modo !== 'demo' && G.SuiteAuth) G.SuiteAuth.logout(); G.NusaApi.modo = 'real'; $('#modo').classList.add('hid'); return mostrarPuerta(); }
    if (t.classList.contains('tab')) return abrir(t.dataset.vista);
  });
  document.addEventListener('change', function (ev) { if (ev.target.id === 'como') practicar(ev.target.value); });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target.id === 'p') entrar(); });
  document.addEventListener('DOMContentLoaded', function () {
    var q = new URLSearchParams(location.search);
    if (q.get('practica')) return practicar(q.get('practica'));
    if (G.SuiteAuth && G.SuiteAuth.isValid()) return desdeSesion();
    mostrarPuerta();
  });
})(window);
