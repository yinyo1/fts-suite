/* ═══ cz-regla15-ui · la regla 15 en la tarjeta «Crear borrador» (V1.57b, fts-conceptualizador#12 punto 15) ═══
 *
 * Lo que ve el cliente no lleva cálculos. Decisión 4 de Esteban: bloquea desde el día 1, marca la frase, propone el texto
 * limpio y deja liberarla con un clic, con su razón y quién lo hizo. Esta pantalla:
 *   · lista cada hallazgo (dónde, la frase marcada y el texto limpio propuesto);
 *   · «Usar el texto limpio» o «Liberar…» (pide la razón, 3+ letras), uno por uno, o «Usar todos los textos limpios»;
 *   · el botón de crear o actualizar el borrador se queda apagado hasta que cada hallazgo tenga su decisión;
 *   · crearBorrador (cz-acciones.js) aplica los limpios con CzRegla15.aplicar (el MISMO código que el motor y el servidor) y
 *     manda las liberadas; el servidor (Code - Decidir) vuelve a revisar y no escribe si queda una sin decidir.
 * Detrás del interruptor `regla15_v157`. Apagado: nada.
 */
(function (G) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var D = {};   // decisiones por acción: D[accionId][hallazgoId] = {uso:'limpio'|'liberada', razon}
  function on() { return typeof G.CzInterruptor === 'function' && G.CzInterruptor('regla15_v157') === true && !!G.CzRegla15; }
  /** Los hallazgos de la cotización de la acción: los del motor si los trae; si no, los calcula aquí con el mismo código. */
  function hallazgos(a) {
    var c = ((a && a.datos) || {}).cotizacion; if (!c || !on()) return [];
    var L = c.regla15 && Array.isArray(c.regla15.hallazgos) ? c.regla15.hallazgos : G.CzRegla15.revisarCotizacion(c, []).hallazgos;
    L = L.filter(function (h) { return h && h.id; });
    // V1.63i D (`ruido_chat_v163i`, D219) · la nota fija de FTS USA es del decreto de Esteban: viaja liberada (el servidor viejo la pide;
    // el nuevo ni la revisa) pero no se marca ni se enseña.
    if (ruido()) L = L.map(function (h) { return soloNotaFija(h) && !h.liberada ? Object.assign({}, h, { liberada: true, decreto: true, razon: RAZON_NF }) : h; });
    return L;
  }
  /* ═══ V1.63i D (fts-conceptualizador#16 punto D, pedido de Richard, D219) · `ruido_chat_v163i` ═══
   * En la tarjeta no van las advertencias de la regla 15: lo liberado (por decreto o por la persona) no se enseña, lo que el agente
   * reescribió solo ya viene limpio, y lo que no pudo reescribir queda en «⚠ Avisos» de la vista ejecutiva. Aquí solo va UNA línea
   * cuando eso frena el borrador. Nunca el texto original y el corregido juntos. Apagado: como antes. */
  var NF = 'Additional hours on weekends or holidays, if requested by the client, are billed at 50% above the regular hourly rate.';
  var RAZON_NF = 'nota fija de FTS USA, decreto de Esteban (#12 6400134382)';
  function ruido() { return typeof G.CzInterruptor === 'function' && G.CzInterruptor('ruido_chat_v163i') === true; }
  function soloNotaFija(h) { var t = String((h && h.original) || ''); return t.indexOf(NF) >= 0 && !G.CzRegla15.revisar(t.split(NF).join(' ')).length; }
  function lineaRuido(a, n) {
    return '<div class="r15 r15-freno" data-r15="' + a.id + '"><p class="nota"><b>⛔ Falta reescribir ' + n + (n === 1 ? ' frase que vería el cliente' : ' frases que vería el cliente') +
      ' con cálculos internos para mandarla: toca «⚠ Avisos» en la vista ejecutiva.</b></p></div>';
  }
  // V1.62a (`ruido_v162`) · lo que el autor pidió tal cual llega liberado con su razón («lo pidió Esteban (msg 1018)»).
  function decision(a, h) { if (h.liberada) return { uso: 'liberada', razon: h.razon || 'liberada antes', antes: true }; return (D[a.id] || {})[h.id] || null; }
  function faltan(a) { return hallazgos(a).filter(function (h) { return !decision(a, h); }).length; }
  function listo(a) { return !on() || faltan(a) === 0; }
  var DONDE = function (d) { return String(d || '').replace(/^bloques?/, 'partida').replace(/^nota_orden/, 'nota de la orden').replace(/^x_fts/, 'PDF').replace(/_/g, ' '); };
  /** El bloque de la tarjeta. */
  function html(a) {
    if (!on() || !a || a.tipo !== 'crear_borrador' || a.estado !== 'propuesta') return '';
    var L = hallazgos(a); if (!L.length) return '';
    var n = faltan(a);
    if (ruido()) return n ? lineaRuido(a, n) : '';
    // V1.62a (`ruido_v162`) · si todo lo que marcó la regla lo pidió el autor tal cual, no es una alarma: una línea que dice que va
    // como lo pidió y quién (sin el recuadro rojo ni «Liberar…»).
    if (!n && typeof G.CzInterruptor === 'function' && G.CzInterruptor('ruido_v162') === true && L.every(function (h) { return h.liberada && /^lo pidió /.test(h.razon || ''); }))
      return '<div class="r15 r15-autor" data-r15="' + a.id + '" style="background:#e7f6ec;border-color:#b7e0c3"><p class="nota" style="color:#14532d">✓ Va tal cual lo que pediste: ' + L.map(function (h) { return '«' + esc(String(h.original).slice(0, 90)) + '» (' + esc(h.razon) + ')'; }).join('; ') + '.</p></div>';
    return '<div class="r15" data-r15="' + a.id + '"><b>🟥 El cliente vería cálculos internos (' + L.length + ')</b>' +
      '<p class="nota">Regla 15: en lo que ve el cliente no van horas × días, tarifas, «al costo», márgenes ni niveles de precio. Elige el texto limpio o libéralo con su razón.</p>' +
      L.map(function (h) {
        var d = decision(a, h);
        return '<div class="r15-h' + (d ? ' r15-ok' : '') + '"><span class="r15-donde">' + esc(DONDE(h.donde)) + '</span>' +
          '<div class="r15-orig">' + esc(h.original).replace(new RegExp('(' + (h.frases || []).map(function (f) { return esc(f).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'g'), '<mark>$1</mark>') + '</div>' +
          '<div class="r15-limpio">→ ' + (h.limpio ? esc(h.limpio) : '<i>(se quita)</i>') + '</div>' +
          (d ? '<span class="hecho' + (d.uso === 'liberada' ? ' gris' : '') + '">' + (d.uso === 'limpio' ? '✓ Va el texto limpio' : '✓ Liberada: ' + esc(d.razon)) + '</span>' +
               (d.antes ? '' : ' <button class="r15-cambia" data-r15x="' + a.id + '|' + esc(h.id) + '">↺ Cambiar</button>')
             : '<div class="acc"><button class="si" data-r15l="' + a.id + '|' + esc(h.id) + '">Usar el texto limpio</button><button data-r15b="' + a.id + '|' + esc(h.id) + '">Liberar…</button></div>') +
          '</div>';
      }).join('') +
      (n > 1 ? '<div class="acc"><button data-r15t="' + a.id + '">Usar todos los textos limpios (' + n + ')</button></div>' : '') +
      (n ? '<p class="nota">🔒 El borrador espera a que decidas ' + (n === 1 ? 'la frase que falta' : 'las ' + n + ' frases que faltan') + '.</p>' : '') + '</div>';
  }
  /** Lo que crearBorrador manda: la cotización con los limpios aplicados, las liberadas y el registro para la acción. */
  function paraEnviar(a) {
    var c = ((a && a.datos) || {}).cotizacion; if (!on() || !c) return null;
    var S = (G.SuiteAuth && G.SuiteAuth.getSession && G.SuiteAuth.getSession()) || {}, ahora = new Date().toISOString();
    var L = hallazgos(a), dec = L.map(function (h) { var d = decision(a, h) || {}; return { id: h.id, original: h.original, donde: h.donde, uso: d.uso || null, razon: d.razon || null, por: S.actor || null, at: ahora, antes: !!d.antes }; });
    var limpios = dec.filter(function (d) { return d.uso === 'limpio'; });
    return { cotizacion: limpios.length ? G.CzRegla15.aplicar(c, limpios) : c,
      liberadas: dec.filter(function (d) { return d.uso === 'liberada'; }).map(function (d) { return { id: d.id, original: d.original, razon: d.razon }; }),
      registro: { version: 1, hallazgos: L.length, limpios: limpios.length, liberadas: dec.filter(function (d) { return d.uso === 'liberada'; }).length, decisiones: dec.filter(function (d) { return !d.antes; }) },
      faltan: faltan(a) };
  }
  function enlazar(M, ctx) {
    var $$ = function (s) { return Array.prototype.slice.call(M.querySelectorAll(s)); };
    var parte = function (v) { var i = String(v).indexOf('|'); return [String(v).slice(0, i), String(v).slice(i + 1)]; };
    var pon = function (aid, hid, d) { (D[aid] = D[aid] || {})[hid] = d; ctx.repinta(); };
    $$('[data-r15l]').forEach(function (b) { b.onclick = function () { var p = parte(b.dataset.r15l); pon(p[0], p[1], { uso: 'limpio' }); }; });
    $$('[data-r15x]').forEach(function (b) { b.onclick = function () { var p = parte(b.dataset.r15x); if (D[p[0]]) delete D[p[0]][p[1]]; ctx.repinta(); }; });
    $$('[data-r15b]').forEach(function (b) { b.onclick = function () {
      var p = parte(b.dataset.r15b);
      ctx.modal('<h3>Liberar la frase</h3><p class="sub">Va a llegar al cliente tal cual. Queda registrado quién la liberó y por qué (en la nota interna de la orden).</p>' +
        '<label class="lb">¿Por qué la necesita ver el cliente?<textarea id="r15Raz" rows="3" maxlength="300"></textarea></label>' +
        '<div class="acc"><button class="si" id="r15Ok">Liberar</button><button id="r15No">Cancelar</button></div><p class="err-bt" id="r15Err"></p>');
      var t = document.getElementById('r15Raz'); if (t) t.focus();
      document.getElementById('r15No').onclick = ctx.cerrarModal;
      document.getElementById('r15Ok').onclick = function () {
        var r = String((t && t.value) || '').trim();
        if (r.length < 3) { document.getElementById('r15Err').textContent = 'Escribe la razón (3 letras o más).'; return; }
        ctx.cerrarModal(); pon(p[0], p[1], { uso: 'liberada', razon: r });
      };
    }; });
    $$('[data-r15t]').forEach(function (b) { b.onclick = function () {
      var aid = b.dataset.r15t, a = ctx.accion(aid); if (!a) return;
      hallazgos(a).forEach(function (h) { if (!decision(a, h)) (D[aid] = D[aid] || {})[h.id] = { uso: 'limpio' }; }); ctx.repinta(); }; });
    // El botón de crear o actualizar se queda apagado mientras falte una decisión.
    $$('[data-r15]').forEach(function (box) {
      var a = ctx.accion(box.dataset.r15); if (!a || listo(a)) return;
      $$('[data-hacer="' + a.id + '"],[data-refok="' + a.id + '"]').forEach(function (bt) { bt.disabled = true; bt.title = 'Primero decide las frases de la regla 15'; });
    });
  }
  G.CzR15 = { on: on, html: html, listo: listo, faltan: faltan, paraEnviar: paraEnviar, enlazar: enlazar, _D: D };
})(window);
