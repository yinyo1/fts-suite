/* ═══ Conceptualizador · «Revisa las condiciones de la cotización» (V1.54 E1, fts-conceptualizador#11 y #10) ═══
 *
 * Prototipo: fts-conceptualizador, prototipos/v154/pantalla.html (escenas condiciones · voz).
 * Detrás del interruptor `condiciones_caso` (apagado = no pinta nada). Los renglones los propone el motor
 * (herramientas/motor/condiciones.js → api_motor condiciones_proponer) y llegan en `hilo.condiciones` (db/018).
 *
 *  · Cada punto con su valor y su FUENTE; lo crítico necesita ✓ antes del borrador. ✎ corrige (Enter guarda), ✕ quita lo
 *    que no aplica, ↺ reabre. Lo que no tiene dato se pregunta (nunca se inventa): sale en «Falta el dato».
 *  · «Aprobar todo lo que tiene dato». Por voz o texto también («aprueba todo menos la garantía»): eso lo toma el motor.
 *  · Cada clic es un evento `condicion` firmado: se aplica AL MOMENTO en la base (sin motor y sin contar en el tope).
 *  · Mientras haya algo que aprobar sale ABIERTA (el botón «Aprobar todo» es de los que piden clic, colapsarCartas).
 *  · Abajo, el candado: el borrador en Odoo, el PDF y el envío esperan mientras falte un crítico o un dato.
 */
(function (G) {
  'use strict';
  var S = { editando: null, texto: '', ocupado: false };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var on = function () { try { return !!(G.CzInterruptor && G.CzInterruptor('condiciones_caso')); } catch (e) { return false; } };
  var CSS = '.cd-carta .cd-falta{font-size:11.5px;font-weight:700;border-radius:8px;padding:1px 7px;background:#fff3d6;color:#8a5a00;margin-left:6px;vertical-align:1px}' +
    '.cd-carta .cd-falta.ok{background:#e3f6ea;color:#0b6b45}' +
    '.cd-res{font-size:12.5px;color:var(--sec,#667781);margin:0 0 6px}' +
    '.cd-legal{font-size:12px;color:#8a5a00;background:#fff3d6;border-radius:6px;padding:4px 8px;margin:0 0 6px}' +
    '.cd-rc{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:start;padding:8px 0;border-top:1px dashed var(--linea,#e9edef)}' +
    '.cd-rt{min-width:0;overflow-wrap:anywhere}.cd-rt b{display:block;font-size:13px}.cd-rt>span{display:block;font-size:13.5px;margin-top:1px}' +
    '.cd-rt small{display:block;font-size:11.5px;color:var(--sec,#667781);margin-top:2px}' +
    '.cd-rt input{width:100%;box-sizing:border-box;margin-top:4px;font:inherit;font-size:14px;padding:6px 8px;border:1px solid var(--linea,#e9edef);border-radius:8px}' +
    '.cd-rb{display:flex;gap:4px}.cd-rb button{width:34px;height:34px;border-radius:50%;border:1px solid var(--linea,#e9edef);background:#fff;font-size:15px;line-height:1;color:#3b4a54}' +
    '.cd-rb button.ok{color:#0b6b45;border-color:#bfe5cd}.cd-rb button[disabled]{opacity:.35}' +
    '.cd-rc.aprob .cd-rt>span::before{content:"✓ ";color:#0b6b45;font-weight:700}.cd-rc.corr .cd-rt>span::before{content:"✎ ";color:#2f6fb3}' +
    '.cd-rc.quit .cd-rt b,.cd-rc.quit .cd-rt>span{text-decoration:line-through;color:var(--ter,#8696a0)}' +
    '.cd-rc.sindato .cd-rt>span{color:var(--rojo,#c0392b);font-weight:600}.cd-crit{color:var(--rojo,#c0392b);font-weight:700}' +
    '.cd-hitos{font-size:12.5px;margin:8px 0 0;padding:6px 8px;background:var(--sup2,#f0f2f5);border-radius:6px}' +
    '.cd-bts{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}' +
    '.cd-bt{border-radius:18px;padding:7px 14px;font-weight:600;font-size:14px;border:1px solid var(--acento-osc,#008069);color:#fff;background:var(--acento-osc,#008069);min-height:36px}' +
    '.cd-candado{margin-top:8px;font-size:12.5px;font-weight:600;color:#8a5a00}.cd-candado.ok{color:#0b6b45}';
  function css() { if (document.getElementById('cd-css')) return; var s = document.createElement('style'); s.id = 'cd-css'; s.textContent = CSS; document.head.appendChild(s); }

  function hayTarjeta(H) { return on() && !!(H && H.condiciones && (H.condiciones.renglones || []).length); }
  /** true si el candado de condiciones está cerrado (hay propuesta y no está lista). Apagado o sin propuesta: false. */
  function cerrado(H) { return hayTarjeta(H) && H.condiciones_listas !== true; }

  // «—» es una lista vacía (sin exclusiones, sin supuestos): no es un dato que se apruebe con ✓; se escribe o se quita.
  var conDato = function (r) { return !!(r.valor && String(r.valor).trim() !== '—'); };
  function tarjeta(H, puede) {
    if (!hayTarjeta(H)) return '';
    css();
    var K = H.condiciones, R = K.renglones || [], F = K.faltan || [];
    var pend = Number(K.faltan_check) || 0, sin = Number(K.sin_dato) || F.length, listas = H.condiciones_listas === true;
    var h = '<div class="carta cd-carta"><h4>✅ Revisa las condiciones de la cotización <span class="cd-falta' + (listas ? ' ok' : '') + '">' + (listas ? 'listas' : 'faltan ' + (pend + sin)) + '</span></h4>' +
      '<p class="cd-res">Lo crítico (<span class="cd-crit">●</span>) necesita tu ✓ antes del borrador. ✎ corrige, ✕ quita lo que no aplica. También por voz: «aprueba todo menos la garantía».</p>' +
      (K.borrador_legal ? '<p class="cd-legal">Las condiciones legales generales son un BORRADOR pendiente de revisión de Legal.</p>' : '');
    R.forEach(function (r) {
      var cls = { aprobado: 'aprob', corregido: 'corr', quitado: 'quit' }[r.estado] || (!conDato(r) ? 'sindato' : '');
      var ed = S.editando === r.clave;
      h += '<div class="cd-rc ' + cls + '" data-cd-k="' + esc(r.clave) + '"><div class="cd-rt"><b>' + (r.critico ? '<span class="cd-crit" title="Crítico">●</span> ' : '') + esc(r.titulo) + '</b>' +
        '<span>' + esc(conDato(r) ? r.valor : 'Falta el dato') + '</span><small>' + esc(r.estado === 'propuesto' ? 'fuente: ' + (r.fuente || '—') : (r.estado === 'quitado' ? 'quitado' : r.estado) + (r.por ? ' por ' + r.por : '') + (r.camino && r.camino !== 'boton' ? ' (' + r.camino + ')' : '')) + '</small>' +
        (ed ? '<input data-cd-ed="' + esc(r.clave) + '" value="' + esc(S.texto) + '" placeholder="Escribe el valor y Enter" maxlength="500">' : '') + '</div>' +
        (puede ? '<div class="cd-rb">' + (r.estado === 'propuesto'
          ? '<button type="button" class="ok" data-cd="aprobar" aria-label="Aprobar"' + (conDato(r) ? '' : ' disabled') + '>✓</button><button type="button" data-cd="editar" aria-label="Corregir">✎</button><button type="button" data-cd="quitar" aria-label="No aplica">✕</button>'
          : '<button type="button" data-cd="reabrir" aria-label="Reabrir">↺</button>') + '</div>' : '') + '</div>';
    });
    F.forEach(function (f) {
      h += '<div class="cd-rc sindato"><div class="cd-rt"><b><span class="cd-crit">●</span> ' + esc(f.titulo || f.clave || 'Dato') + '</b><span>Falta el dato</span><small>' +
        esc(f.pregunta || (f.tipo === 'pendiente_proveedor' ? 'se le pide al proveedor' : 'contéstalo en el chat')) + '</small></div></div>';
    });
    if ((K.hitos || []).length) h += '<div class="cd-hitos"><b>Hitos de pago:</b> ' + K.hitos.map(function (x) { return esc(x.hito || x.texto || ''); }).join(' · ') + '</div>';
    if (puede && R.some(function (r) { return r.estado === 'propuesto' && conDato(r); })) h += '<div class="cd-bts"><button type="button" class="cd-bt si" data-cd-todo="1">Aprobar todo lo que tiene dato</button></div>';
    h += '<div class="cd-candado' + (listas ? ' ok' : '') + '">' + (listas ? '🔓 Listo: ya puedes crear el borrador en Odoo.' :
      '🔒 El borrador, el PDF y el envío esperan: ' + pend + ' crítico' + (pend === 1 ? '' : 's') + ' sin check' + (sin ? ' y ' + sin + ' sin dato (pregunta o pendiente del proveedor)' : '') + '.') + '</div></div>';
    return h;
  }

  async function aplicar(c, datos, repinta) {
    if (S.ocupado) return; S.ocupado = true;
    var r = await G.CzCliente.evento({ caso_id: c.id, tipo: 'condicion', datos: datos }); S.ocupado = false;
    if (!r.ok) { if (G.CzApp && G.CzApp.toast) G.CzApp.toast(r.mensaje || 'No se guardó (' + (r.error || 'sin respuesta') + ').'); return; }
    S.editando = null;
    if (G.CzApp && G.CzApp.toast && (r.lineas || []).length) G.CzApp.toast('Tomé: ' + r.lineas.slice(0, 3).join(' · ') + (r.lineas.length > 3 ? ' (+' + (r.lineas.length - 3) + ')' : ''));
    repinta(true);
  }

  /** `ctx`: { caso(), hilo(), repinta(recargar) }. El texto que se está corrigiendo vive aquí: sobrevive al repintado del sondeo. */
  function enlazar(raiz, ctx) {
    if (!on() || !raiz) return;
    Array.prototype.forEach.call(raiz.querySelectorAll('.cd-carta [data-cd]'), function (b) {
      b.onclick = function () {
        var c = ctx.caso(), k = b.closest('[data-cd-k]').getAttribute('data-cd-k'), a = b.dataset.cd;
        if (!c) return;
        if (a === 'editar') { var rr = ((ctx.hilo() || {}).condiciones || {}).renglones || []; S.texto = ((rr.filter(function (x) { return x.clave === k; })[0]) || {}).valor || ''; S.editando = S.editando === k ? null : k; ctx.repinta(); setTimeout(function () { var i = document.querySelector('[data-cd-ed="' + k + '"]'); if (i) i.focus(); }, 30); return; }
        aplicar(c, { clave: k, accion: a }, ctx.repinta);
      };
    });
    Array.prototype.forEach.call(raiz.querySelectorAll('[data-cd-ed]'), function (i) {
      i.oninput = function () { S.texto = i.value; };
      i.onkeydown = function (e) {
        if (e.key === 'Escape') { S.editando = null; ctx.repinta(); }
        if (e.key === 'Enter' && i.value.trim()) aplicar(ctx.caso(), { clave: i.getAttribute('data-cd-ed'), accion: 'corregir', valor: i.value.trim() }, ctx.repinta);
      };
    });
    var t = raiz.querySelector('[data-cd-todo]'); if (t) t.onclick = function () {
      var sin = (((ctx.hilo() || {}).condiciones || {}).renglones || []).filter(function (r) { return !conDato(r); }).map(function (r) { return r.clave; });
      aplicar(ctx.caso(), { accion: 'aprobar_todo', excepto: sin }, ctx.repinta); };
  }

  G.CzCondiciones = { tarjeta: tarjeta, enlazar: enlazar, cerrado: cerrado, _estado: S };
})(window);
