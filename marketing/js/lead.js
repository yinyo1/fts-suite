/* ═══ Marketing · Lead rápido (#407 §5) ═══
 *
 * En planta o en un evento: foto de gafete o tarjeta, nota de voz o texto pegado (LinkedIn,
 * WhatsApp). Todo entra primero a la cola del teléfono (IndexedDB, compartida con el
 * Prospectador) con su hora real; al volver la red se crea una sesión del Prospectador de tipo
 * «lead» y el motor arma la ficha corta. A Odoo solo llega por «Enviar a CRM».
 *
 * Fotos de gafete = datos personales: retención 12 meses (marketing.config, se cambia sin
 * tocar la pantalla) y aviso de privacidad. El texto del aviso es PENDIENTE DE LEGAL.
 */
(function (G) {
  'use strict';
  var M = G.Mkt, U = G.ChatUI, esc = U.esc, C = M.cliente, Q = M.cola(), $ = function (s) { return document.querySelector(s); };
  var V = $('#vista'), arch = [], escrito = null, rec = null, reloj = null;

  function pintar() {
    M.cab('Nuevo lead', navigator.onLine ? 'En línea' : 'Sin señal: se guarda en el teléfono', '../index.html');
    V.innerHTML = '<div class="ch-wrap">' +
      '<div class="ch-fila"><button class="ch-btn ch-btn-p" id="cam">📷 Foto de gafete o tarjeta</button><button class="ch-btn ch-btn-s" id="gal">🖼️ De la galería</button></div>' +
      '<input type="file" id="fcam" class="ch-oculto" accept="image/*" capture="environment"><input type="file" id="fgal" class="ch-oculto" accept="image/*,application/pdf" multiple>' +
      '<div class="ch-fila"><button class="ch-btn ch-btn-s" id="aud">🎙️ Grabar audio</button></div>' +
      '<div id="adjs"></div>' +
      '<label class="ch-campo">O pega el texto (WhatsApp, LinkedIn, una nota)<textarea id="txt" rows="4" placeholder="Ej. Conocí a la jefa de mantenimiento de una planta en la expo; quieren cotizar una subestación."></textarea></label>' +
      '<label class="ch-campo">Empresa (si la sabes)<input id="emp" autocomplete="off"></label>' +
      '<label class="ch-campo">Ciudad de la planta (si la sabes)<input id="ciu" autocomplete="off" placeholder="Ej. Apodaca, NL"></label>' +
      '<p class="ch-nota">Con la empresa, el lead se agrega a su conversación del Prospectador (o la abre si no existe). Sin empresa, el motor la deduce de la foto o el audio.</p>' +
      '<label class="ch-campo">Dónde fue<select id="don"><option value="visita">Visita a planta</option><option value="evento">Evento o expo</option><option value="referencia">Referencia</option><option value="otro">Otro</option></select></label>' +
      '<button class="ch-btn ch-btn-p full" id="guardar">Guardar lead</button>' +
      '<div class="ch-nota">🔒 <b>Aviso de privacidad — texto pendiente de Legal.</b> Las fotos de gafetes y tarjetas son datos personales: se usan solo para dar seguimiento comercial, se guardan 12 meses y después se borran. Si la persona pide que no se guarde, no la captures.</div>' +
      '<div id="tel"></div><div id="srv"></div>' +
      '<div class="ch-nota">Sin señal se guarda en el teléfono con su hora real y se sube solo al volver la red. El motor lee la foto o el audio, arma la ficha corta y la deja como sesión del Prospectador.</div></div>';
    $('#cam').onclick = function () { $('#fcam').click(); }; $('#gal').onclick = function () { $('#fgal').click(); };
    $('#fcam').onchange = function () { agregar(this); }; $('#fgal').onchange = function () { agregar(this); };
    $('#aud').onclick = grabar; $('#guardar').onclick = guardar;
    $('#txt').oninput = function () { if (!escrito) escrito = Date.now(); };
    adjs(); listas();
  }
  async function agregar(inp) {
    for (var i = 0; i < inp.files.length; i++) { var p = await G.ChatMedios.preparar(inp.files[i]); if (p.error) U.toast(p.error); else arch.push(p); }
    if (!escrito) escrito = Date.now(); inp.value = ''; adjs();
  }
  function adjs() {
    $('#adjs').innerHTML = arch.length ? '<div class="ch-card"><h3>Para este lead</h3>' + arch.map(function (a, i) {
      return '<div class="ch-fila" style="align-items:center;font-size:13px;padding:4px 0"><span style="flex:1">' + (a.clase === 'foto' ? '📷 ' : a.clase === 'audio' ? '🎙️ ' : '📎 ') +
        esc(a.clase === 'audio' ? 'Audio ' + U.dur(a.duracion_s) : a.nombre) + ' · ' + Math.round(a.bytes / 1024) + ' KB</span><button class="ch-btn ch-btn-s" style="flex:0;min-width:0" data-q="' + i + '">Quitar</button></div>';
    }).join('') + '</div>' : '';
    $('#adjs').querySelectorAll('[data-q]').forEach(function (b) { b.onclick = function () { arch.splice(+b.getAttribute('data-q'), 1); adjs(); }; });
  }
  async function grabar() {
    var b = $('#aud');
    if (rec) { clearInterval(reloj); var n = await rec.detener(); rec = null; b.textContent = '🎙️ Grabar audio'; b.classList.remove('ch-btn-r'); if (n && n.bytes) { arch.push(n); if (!escrito) escrito = n.inicio || Date.now(); adjs(); } return; }
    if (!G.ChatMedios.puedeGrabar()) { U.toast('Este navegador no puede grabar audio.'); return; }
    try { rec = await G.ChatMedios.grabar(); } catch (e) { U.toast('No se pudo usar el micrófono: ' + e.message); return; }
    var ini = rec.inicio; if (!escrito) escrito = ini; b.classList.add('ch-btn-r');
    reloj = setInterval(function () { b.textContent = '■ Detener · ' + U.dur((Date.now() - ini) / 1000); }, 500);
  }
  async function guardar() {
    var t = $('#txt').value.trim(), emp = $('#emp').value.trim(), ciu = ($('#ciu') ? $('#ciu').value.trim() : ''), don = $('#don').value;
    if (!arch.length && !t) { U.toast('Pon al menos una foto, un audio o un texto.'); return; }
    if (rec) { U.toast('Detén la grabación primero.'); return; }
    var hoy = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
    var s = await Q.nuevaSesion({ tipo: 'lead', titulo: ('Lead · ' + (emp || 'sin empresa') + ' · ' + hoy).slice(0, 120), datos: { donde: don, empresa: emp || null, ciudad: ciu || null, resumen: t.slice(0, 200) || null } });
    await Q.encolar({ local_id: s.local_id }, 'lead rápido (' + don + ')' + (emp ? ' · ' + emp : '') + (t ? '\n\n' + t : ''), arch, escrito || Date.now());
    arch = []; escrito = null;
    U.toast(navigator.onLine ? 'Guardado. Se sube y el motor arma la ficha corta.' : 'Guardado en el teléfono: pendiente de enviar.');
    pintar();
  }
  async function listas() {
    var ses = (await Q.sesionesLocales()).filter(function (s) { return s.tipo === 'lead'; });
    var sal = await Q.salida();
    var tel = ses.filter(function (s) { return !s.sesion_id || sal.some(function (x) { return x.sesion_local === s.local_id; }); });
    $('#tel').innerHTML = tel.length ? '<div class="ch-card"><h3>En este teléfono (' + tel.length + ')</h3>' + tel.map(function (s) {
      var it = sal.filter(function (x) { return x.sesion_local === s.local_id; })[0];
      var e = s.error ? '<span class="ch-pill r">' + esc(s.error) + '</span>' : it && it.estado === 'error' ? '<span class="ch-pill r">no se mandó</span>' : '<span class="ch-pill a">pendiente de enviar</span>';
      return '<div class="ch-fila" style="align-items:center;font-size:13px;padding:6px 0;border-top:1px solid var(--border)"><span style="flex:1;min-width:0;overflow-wrap:anywhere">' + esc(s.titulo) + '</span>' + e + '</div>';
    }).join('') + '</div>' : '';
    if (!navigator.onLine) { $('#srv').innerHTML = ''; return; }
    var r = await C.pedir('sesiones', { tipo: 'lead' });
    $('#srv').innerHTML = r.ok && r.sesiones.length ? '<div class="ch-card"><h3>Leads recientes</h3><div class="ch-lista">' + r.sesiones.slice(0, 15).map(function (s) {
      return '<a class="ch-ses" href="../prospectador/index.html#/s/' + esc(s.id) + '"><div class="av">📇</div><div class="t"><b>' + esc(s.titulo) + '</b><span>' + esc(s.ultimo ? s.ultimo.texto : '') + '</span></div><div class="m">' + U.fecha(s.updated_at) +
        (s.trabajo ? '<span class="ch-pill b">' + (s.trabajo.estado === 'tomado' ? 'trabajando' : 'en cola') + '</span>' : '') + '</div></a>'; }).join('') + '</div></div>' : '';
  }
  Q.oir(function (x) {
    // v3 (#421): en cuanto la captura sube, se liga a la conversación de su empresa (o la abre). Si esta pantalla ya no
    // está abierta cuando suba, el motor la liga al procesarla (marketing/PROCESAR.md, conv_ligar).
    if (x && x.sesion && x.sesion.tipo === 'lead' && x.sesion.sesion_id && x.sesion.datos && x.sesion.datos.empresa) {
      C.pedir('conv_ligar', { sesion_id: x.sesion.sesion_id, datos: { empresa: x.sesion.datos.empresa, ciudad: x.sesion.datos.ciudad || '', resumen: x.sesion.datos.resumen || '' } }).then(function (r) {
        if (r.ok) U.toast('Agregado a la conversación de ' + r.conversacion.empresa + '.', 4000);
      });
    }
    if ($('#tel')) listas();
  });
  G.addEventListener('online', pintar); G.addEventListener('offline', function () { M.cab('Lead rápido', 'Sin señal: se guarda en el teléfono', '../index.html'); });
  G.MktLead = { arrancar: async function () { U.red(document.getElementById('red')); var ok = await Q.iniciar(); if (!ok) U.toast('Este navegador no guarda la cola: no cierres la pestaña sin señal.', 5000); pintar(); } };
})(window);
