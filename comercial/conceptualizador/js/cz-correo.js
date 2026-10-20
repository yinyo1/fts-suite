/* ═══ Conceptualizador · «✉ Correo para envío» (V1.57b, fts-conceptualizador#12 puntos 11, 12 y 12b) ═══
 *
 * Prototipo aprobado: fts-conceptualizador, prototipos/v157/tarjeta-correo.html (escenas 2 a 5). Decisiones de Esteban
 * (comentario 6273937527): Para y CC aceptan cualquier correo; si no es contacto del cliente en Odoo se avisa y se ofrece el
 * alta, que aprueba Esteban; la firma de cada ingeniero es una imagen que sube desde «Mi firma del correo».
 *
 *  1. «✉ Correo para envío» pide la vista previa (cotizacion-cliente · preparar) con el correo que redactó el agente
 *     (`datos.correo` de la tarjeta del borrador, con el folio puesto) y su tono.
 *  2. Vista previa 1, EDITABLE: Para y CC como chips (agregar y quitar), asunto y cuerpo. «Guardar» aparece al cambiar algo
 *     y guarda en la base (modo guardar) lo que el agente aprende después (lo propuesto contra lo enviado).
 *  3. Vista previa 2, DEFINITIVA, en un modal: exactamente lo que va a salir, con «Confirmar envío». Solo ese clic envía.
 *  4. Debajo de los botones, una línea por envío: quién, cuándo, a quién y el folio.
 * Sale de sales@ con «Responder a» sales@; Para = el contacto del cliente, CC = quien cotiza. El workflow sigue en MODO_PRUEBA
 * (sale solo a sales@) hasta que Esteban diga. Detrás de `correo_v157` (y de `enviar_cliente`). Apagado: cz-enviar.js de V1.56.
 */
(function (G) {
  'use strict';
  var S = { b: null, ed: null, orig: null, caso: null, guardando: false, msg: null };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var prendido = function (n) { try { return !!(G.CzInterruptor && G.CzInterruptor(n)); } catch (e) { return false; } };
  var on = function () { return prendido('correo_v157') && prendido('enviar_cliente'); };
  var GIRO = '<span class="giro" aria-hidden="true"></span>';
  var CORREO = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+[.][A-Za-z]{2,}$/;
  var MAX_PARA = 5, MAX_CC = 8;
  function aviso(t) { if (G.CzApp && G.CzApp.toast) G.CzApp.toast(t); }
  function modal(op) { var m = G.ChatNucleo && G.ChatNucleo.modal; return m ? m(op) : null; }
  var CSS = '.cc-vp{margin-top:8px;border-top:1px solid var(--linea,#e9edef);padding-top:8px;display:flex;flex-direction:column;gap:8px;font-size:14px}' +
    '.cc-campo{display:grid;grid-template-columns:84px minmax(0,1fr);gap:8px;align-items:start}.cc-campo>span{color:#667781;font-size:13px;padding-top:6px}.cc-campo>div{min-width:0}' +
    '.cc-chips{display:flex;flex-wrap:wrap;gap:4px;align-items:center;border:1px solid #e9edef;border-radius:8px;padding:4px;background:#fff;min-width:0}' +
    '.cc-chip{display:inline-flex;gap:4px;align-items:center;background:#f0f2f5;border-radius:12px;padding:2px 4px 2px 9px;font-size:13px;max-width:100%;min-width:0}' +
    '.cc-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.cc-chip.cc-no{background:#fff4e0;border:1px solid #f3cf8e}' +
    '.cc-chip button{border:0;background:none;font-size:15px;line-height:1;cursor:pointer;color:#667781;padding:0 4px}' +
    '.cc-chips input{flex:1 1 140px;min-width:0;border:0;outline:0;font:inherit;font-size:14px;padding:4px}' +
    '.cc-vp input.cc-as,.cc-vp textarea{width:100%;box-sizing:border-box;font:inherit;font-size:14px;padding:7px 9px;border:1px solid #e9edef;border-radius:8px;background:#fff}' +
    '.cc-vp textarea{min-height:150px;resize:vertical}.cc-nota{font-size:12px;color:#667781}.cc-mal{color:var(--rojo,#c0392b)}' +
    '.cc-alerta{font-size:12.5px;background:#fff8ea;border:1px solid #f3dca8;border-radius:8px;padding:6px 8px}.cc-alerta button{margin:4px 6px 0 0}' +
    '.cc-tono{font-size:12.5px;color:#3b4a54;background:#f0f6ff;border-radius:8px;padding:6px 8px}' +
    '.cc-firma{border-top:1px dashed #e9edef;padding-top:6px;color:#667781;font-size:13px}.cc-firma img{max-width:min(320px,100%);height:auto;display:block}' +
    '.cc-bts{display:flex;flex-wrap:wrap;gap:8px}' +
    '.cc-prueba{background:#fdecea;color:#a32020;border:1px solid #f1b8b8;border-radius:8px;padding:8px 10px;font-weight:700;font-size:13.5px}' +
    '.cc-def{padding:12px 16px;display:flex;flex-direction:column;gap:8px;font-size:14px}' +
    '.cc-def .cc-fila{display:grid;grid-template-columns:96px minmax(0,1fr);gap:8px;border-bottom:1px solid #e9edef;padding-bottom:6px}.cc-def .cc-fila>span{color:#667781;font-size:13px}.cc-def .cc-fila>div{min-width:0;overflow-wrap:anywhere}' +
    '.cc-cuerpo{white-space:pre-wrap;border:1px solid #e9edef;border-radius:8px;padding:10px;background:#fff;overflow-wrap:anywhere}' +
    '.cc-pie{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;padding:10px 0 4px;position:sticky;bottom:0;background:#fff}' +
    '.cc-altas{margin-top:8px;font-size:13px}.cc-altas>div{border:1px solid #e9edef;border-radius:8px;padding:6px 8px;margin-top:6px}' +
    '@media (max-width:520px){.cc-campo,.cc-def .cc-fila{grid-template-columns:minmax(0,1fr)}.cc-campo>span{padding-top:0}}';
  function css() { if (document.getElementById('cc-css')) return; var s = document.createElement('style'); s.id = 'cc-css'; s.textContent = CSS; document.head.appendChild(s); }

  /** El correo que redactó el agente: el de la tarjeta del borrador más nueva (datos.correo), con el folio de la orden. */
  function delAgente(H) {
    var a = ((H && H.acciones) || []).filter(function (x) { return x.tipo === 'crear_borrador' && x.estado !== 'descartada' && x.datos && x.datos.correo; }).pop();
    var k = a && a.datos.correo; if (!k || !k.cuerpo) return null;
    var so = (H.caso && (H.caso.orden_nombre || H.caso.orden_id)) || '';
    var pon = function (t) { return String(t || '').split('{orden}').join(String(so)); };
    return { asunto: pon(k.asunto), cuerpo: pon(k.cuerpo), tono: k.tono && typeof k.tono === 'object' ? { tipo: k.tono.tipo, porque: k.tono.porque } : undefined };
  }
  var mismas = function (x, y) { return JSON.stringify(x) === JSON.stringify(y); };
  function cambiado() { return S.ed && S.orig && !mismas(S.ed, S.orig); }
  /** Los correos que no son contacto del cliente en Odoo (ni de FTS): llevan aviso y la opción de proponer el alta. */
  function noContactos() {
    if (!S.b || !S.ed) return [];
    var opc = (S.b.para_opciones || []).map(function (o) { return String(o.correo || '').toLowerCase(); });
    return S.ed.para.concat(S.ed.cc).filter(function (x) { x = x.toLowerCase(); return opc.indexOf(x) < 0 && !/@fts[.]mx$/.test(x); });
  }

  async function preparar(c, H, repinta, b) {
    css();
    var A = delAgente(H);
    var r = await G.CzCliente.cotizacion('preparar', { caso_id: c.id, datos: A ? { asunto_agente: A.asunto, cuerpo_agente: A.cuerpo, tono: A.tono } : null });
    if (!r.ok || !r.borrador) return aviso(r.mensaje || 'No se puede armar el correo todavía (' + (r.error || 'sin respuesta') + ').');
    S.b = r.borrador; S.caso = c.id; S.msg = null;
    var para = (S.b.para_lista && S.b.para_lista.length ? S.b.para_lista : S.b.para ? [S.b.para] : []).slice(0, MAX_PARA);
    S.ed = { para: para, cc: (S.b.cc || []).slice(0, MAX_CC), asunto: S.b.asunto || '', cuerpo: S.b.cuerpo || '' };
    S.orig = JSON.parse(JSON.stringify(S.ed));
    void b; repinta();
  }

  function chips(lista, k) {
    var no = noContactos().map(function (x) { return x.toLowerCase(); });
    return '<div class="cc-chips" data-cc-chips="' + k + '">' + lista.map(function (x, i) {
      var esNo = no.indexOf(x.toLowerCase()) >= 0;
      return '<span class="cc-chip' + (esNo ? ' cc-no' : '') + '" title="' + esc(x) + (esNo ? ' · no es contacto del cliente en Odoo' : '') + '"><span>' + (esNo ? '⚠ ' : '') + esc(x) + '</span>' +
        '<button type="button" aria-label="Quitar ' + esc(x) + '" data-cc-quita="' + k + '|' + i + '">×</button></span>';
    }).join('') + '<input type="email" inputmode="email" autocomplete="off" placeholder="' + (k === 'para' ? 'agregar correo…' : 'agregar en copia…') + '" data-cc-nuevo="' + k + '"></div>';
  }
  function firmaHtml(f) {
    f = f || {};
    if (f.imagen_b64) return '<div class="cc-firma"><img alt="' + esc([f.nombre, f.puesto, 'FTS', f.correo].filter(Boolean).join(' · ')) + '" src="data:' + esc(f.imagen_mime || 'image/png') + ';base64,' + f.imagen_b64 + '"></div>';
    return '<div class="cc-firma">' + esc([f.nombre, f.puesto, 'FTS', f.correo].filter(Boolean).join(' · ')) + '<div class="cc-nota">Sin firma en imagen: sale en texto. Súbela desde ⋮ → «Mi firma del correo».</div></div>';
  }
  /** «Tono: cliente nuevo (alta en Odoo el …), sin órdenes ganadas · contratista: … · urgente: …» sin repetir la etiqueta. */
  function tonoHtml(t) {
    var et = { nuevo: 'cliente nuevo', recurrente: 'cliente recurrente', grande: 'prospecto grande', urgente: 'urgente', usa: 'FTS USA', contratista: 'contratista' }[t.tipo] || t.tipo;
    var seg = String(t.porque || '').split(' · ').filter(Boolean);
    if (seg.length && seg[0].indexOf(et) === 0) seg[0] = seg[0].slice(et.length).trim();
    var resto = seg.filter(Boolean).join(' · ');
    return 'Tono: <b>' + esc(et) + '</b>' + (resto ? (/^[(,]/.test(resto) ? ' ' : ' · ') + esc(resto) : '');
  }
  /** La vista previa 1 (editable) dentro de la tarjeta, y las altas pendientes para Esteban. */
  function html(H, admin) {
    if (!on()) return '';
    css();
    var c = (H && H.caso) || {}, h = '';
    if (S.b && S.caso === c.id) {
      var no = noContactos(), t = S.ed.tono || S.b.tono;
      h += '<div class="cc-vp" data-cc="1">' +
        '<div class="cc-campo"><span>Para</span><div>' + chips(S.ed.para, 'para') + '</div></div>' +
        '<div class="cc-campo"><span>CC</span><div>' + chips(S.ed.cc, 'cc') + '<div class="cc-nota">Sale de sales@fts.mx; las respuestas llegan a sales@.</div></div></div>' +
        (no.length ? '<div class="cc-alerta">⚠ ' + (no.length === 1 ? 'Este correo no es' : 'Estos correos no son') + ' contacto del cliente en Odoo: ' + no.map(esc).join(', ') + '. El correo puede salir igual; si es alguien del cliente, propón darlo de alta (lo aprueba Esteban).' +
          '<div>' + no.map(function (x) { return '<button type="button" class="ce-bt" data-cc-alta="' + esc(x) + '">Proponer alta de ' + esc(x.split('@')[0]) + '</button>'; }).join('') + '</div></div>' : '') +
        '<div class="cc-campo"><span>Asunto</span><div><input class="cc-as" id="ccAsunto" maxlength="200" value="' + esc(S.ed.asunto) + '"></div></div>' +
        '<label class="cc-nota" for="ccCuerpo">Mensaje (lo puedes cambiar; lo que cambies, el agente lo aprende para el siguiente)</label><textarea id="ccCuerpo" maxlength="6000">' + esc(S.ed.cuerpo) + '</textarea>' +
        (t && t.tipo ? '<div class="cc-tono">' + tonoHtml(t) + '. Si no es así, cambia el texto: el agente lo aprende.</div>' : '') +
        firmaHtml(S.b.firma) +
        '<div class="cc-nota">📄 Adjunto: ' + esc(S.b.adjunto || 'el PDF de la cotización') + '</div>' +
        (S.msg ? '<div class="cc-nota' + (S.msg.mal ? ' cc-mal' : '') + '">' + esc(S.msg.t) + '</div>' : '') +
        '<div class="cc-bts">' + (cambiado() ? '<button type="button" class="ce-bt si" data-cc-a="guardar">' + (S.guardando ? GIRO + ' Guardando…' : 'Guardar') + '</button><button type="button" class="ce-bt" data-cc-a="deshacer">Deshacer cambios</button>' : '') +
        '<button type="button" class="ce-bt' + (cambiado() ? '' : ' si') + '" data-cc-a="enviar"' + (S.ed.para.length ? '' : ' disabled') + '>Enviar…</button><button type="button" class="ce-bt" data-cc-a="cerrar">Cerrar</button></div>' +
        '<div class="cc-nota">«Enviar…» te enseña el correo final; solo sale con «Confirmar envío».</div></div>';
    }
    var P = ((H && H.altas_contacto) || []).filter(function (x) { return x.estado === 'pendiente'; });
    if (P.length) h += '<div class="cc-altas"><b>Altas de contacto propuestas</b>' + P.map(function (x) {
      return '<div>' + esc(x.correo) + (x.nombre ? ' · ' + esc(x.nombre) : '') + (x.puesto ? ' · ' + esc(x.puesto) : '') + ' <span class="cc-nota">propuso ' + esc(x.propuesto_por || '') + '</span>' +
        (admin ? '<div class="cc-bts" style="margin-top:4px"><button type="button" class="ce-bt si" data-cc-altaok="' + x.id + '">Dar de alta en Odoo</button><button type="button" class="ce-bt" data-cc-altano="' + x.id + '">No</button></div>' : '<div class="cc-nota">Espera la aprobación de Esteban.</div>') + '</div>';
    }).join('') + '</div>';
    return h;
  }
  /** Una línea por envío (para_lista si la trae). */
  function lineas(H) {
    return ((H && H.envios_cliente) || []).map(function (x) {
      var est = { enviado: '✉ Enviada', prueba: '🧪 En prueba (solo a sales@)', error: '⚠ No salió', enviando: '… Enviando' }[x.estado];
      if (!est) return '';
      var a = x.para_lista && x.para_lista.length ? x.para_lista.join(', ') : x.para;
      var hora = ''; try { hora = new Date(x.enviado_at).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) {}
      return '<div class="ce-env' + (x.estado === 'error' ? ' ce-mal' : '') + '">' + est + (x.enviado_por ? ' por <b>' + esc(x.enviado_por) + '</b>' : '') + (x.enviado_at ? ' · ' + esc(hora) : '') +
        (a ? ' · a ' + esc(a) : '') + (x.cc && x.cc.length ? ' · CC ' + esc(x.cc.join(', ')) : '') + ' · ' + esc(x.orden || '') + ' · folio ' + esc(x.folio) + '</div>';
    }).join('');
  }

  function leer(raiz) {
    var a = raiz.querySelector('#ccAsunto'), t = raiz.querySelector('#ccCuerpo');
    if (S.ed) { if (a) S.ed.asunto = a.value; if (t) S.ed.cuerpo = t.value; }
  }
  function agrega(k, v, repinta) {
    v = String(v || '').trim().replace(/[,;]+$/, ''); if (!v) return;
    if (!CORREO.test(v)) { S.msg = { t: '«' + v + '» no parece un correo.', mal: true }; return repinta(); }
    var L = S.ed[k]; if (L.some(function (x) { return x.toLowerCase() === v.toLowerCase(); })) return;
    if (L.length >= (k === 'para' ? MAX_PARA : MAX_CC)) { S.msg = { t: (k === 'para' ? 'Para' : 'CC') + ' lleva hasta ' + (k === 'para' ? MAX_PARA : MAX_CC) + ' correos.', mal: true }; return repinta(); }
    L.push(v); S.msg = null; repinta();
  }
  async function guardar(c, repinta) {
    if (S.guardando) return; S.guardando = true; repinta();
    var r = await G.CzCliente.cotizacion('guardar', { caso_id: c.id, accion_id: S.b.envio_id, datos: { para_lista: S.ed.para, cc: S.ed.cc, asunto: S.ed.asunto, cuerpo: S.ed.cuerpo } });
    S.guardando = false;
    if (!r.ok) { S.msg = { t: r.mensaje || 'No se guardó (' + (r.error || 'sin respuesta') + ').', mal: true }; return repinta(); }
    var g = r.guardado || {};
    S.ed = { para: g.para_lista || S.ed.para, cc: g.cc || S.ed.cc, asunto: g.asunto || S.ed.asunto, cuerpo: g.cuerpo || S.ed.cuerpo };
    S.orig = JSON.parse(JSON.stringify(S.ed)); S.msg = { t: 'Guardado.' }; repinta();
  }
  /** La vista previa 2: exactamente lo que sale, con «Confirmar envío». */
  function definitiva(c, repinta) {
    var b = S.b, E = S.ed, no = noContactos();
    var m = modal({ titulo: 'El correo que va a salir', marca: 'ce-modal-vp', html: '<div class="cc-def">' +
      '<div class="cc-prueba">🧪 MODO PRUEBA: mientras Esteban no lo cambie, este correo sale SOLO a sales@fts.mx, no al cliente.</div>' +
      '<div class="cc-fila"><span>De</span><div>FTS Ventas &lt;' + esc(b.de || 'sales@fts.mx') + '&gt;</div></div>' +
      '<div class="cc-fila"><span>Para</span><div>' + E.para.map(esc).join(', ') + '</div></div>' +
      '<div class="cc-fila"><span>CC</span><div>' + (E.cc.length ? E.cc.map(esc).join(', ') : '—') + '</div></div>' +
      '<div class="cc-fila"><span>Responder a</span><div>' + esc(b.responder_a || 'sales@fts.mx') + '</div></div>' +
      '<div class="cc-fila"><span>Asunto</span><div>' + esc(E.asunto) + ' · Ref. ' + esc(b.folio) + '</div></div>' +
      (no.length ? '<div class="cc-alerta">⚠ No son contacto del cliente en Odoo: ' + no.map(esc).join(', ') + '.</div>' : '') +
      '<div class="cc-cuerpo">' + esc(E.cuerpo) + '</div>' + firmaHtml(b.firma) +
      '<div class="cc-fila"><span>Adjunto</span><div>📄 ' + esc(b.adjunto || '') + '</div></div>' +
      (cambiado() ? '<div class="cc-nota">Tienes cambios sin guardar: salen así como los ves.</div>' : '') +
      '<div class="cc-pie"><button type="button" class="ce-bt" data-cc-def="volver">← Volver a editar</button><button type="button" class="ce-bt si" data-cc-def="confirmar">Confirmar envío</button></div></div>' });
    if (!m) return;
    m.el.querySelector('[data-cc-def="volver"]').onclick = function () { m.cerrar(); };
    var be = m.el.querySelector('[data-cc-def="confirmar"]');
    be.onclick = async function () {
      if (be.disabled) return; be.disabled = true; be.innerHTML = GIRO + ' Enviando…';
      var r = await G.CzCliente.cotizacion('enviar', { caso_id: c.id, accion_id: b.envio_id,
        datos: { confirmado: true, para: E.para[0], para_lista: E.para, cc: E.cc, asunto: E.asunto, cuerpo: E.cuerpo } });
      if (!r.ok) { be.disabled = false; be.textContent = 'Confirmar envío'; return aviso(r.mensaje || 'No salió (' + (r.error || 'sin respuesta') + ').'); }
      S.b = null; S.ed = null; S.orig = null; m.cerrar(); aviso(r.mensaje || 'Enviada.'); repinta(true);
    };
  }
  async function proponerAlta(c, correo, repinta) {
    var r = await G.CzCliente.cotizacion('alta', { caso_id: c.id, datos: { correo: correo } });
    S.msg = r.ok ? { t: 'Propuesta de alta de ' + correo + ' enviada a Esteban.' } : { t: r.mensaje || 'No se propuso el alta (' + (r.error || 'sin respuesta') + ').', mal: true };
    repinta(r.ok);
  }
  /** Esteban aprueba: primero el alta real en Odoo (odoo-alta, con su firma), luego se marca la propuesta con el id que devolvió. */
  async function aprobarAlta(c, H, id, si, repinta) {
    var x = ((H && H.altas_contacto) || []).filter(function (y) { return String(y.id) === String(id); })[0]; if (!x) return;
    if (!si) { var n = await G.CzCliente.cotizacion('alta_ok', { caso_id: c.id, datos: { propuesta_id: Number(id), aprobar: false } }); if (!n.ok) aviso(n.mensaje || 'No se pudo.'); return repinta(true); }
    var a = await G.CzCliente.alta({ tipo: 'contacto', empresa_id: String(c.cliente_odoo_id || ''), nombre: x.nombre || x.correo.split('@')[0], puesto: x.puesto || '', email: x.correo, telefono: '' });
    if (!a || !a.ok || !a.contacto_id) return aviso((a && a.mensaje) || 'Odoo no dio de alta el contacto.');
    var r = await G.CzCliente.cotizacion('alta_ok', { caso_id: c.id, datos: { propuesta_id: Number(id), aprobar: true, partner_id: Number(a.contacto_id) } });
    aviso(r.ok ? 'Contacto dado de alta en Odoo.' : (r.mensaje || 'Se dio de alta en Odoo pero no se marcó la propuesta.')); repinta(true);
  }
  /** Enlaza dentro de `raiz`. ctx: { caso(), hilo(), repinta(recargar) }. */
  function enlazar(raiz, ctx) {
    if (!raiz || !on()) return;
    var $$ = function (s) { return Array.prototype.slice.call(raiz.querySelectorAll(s)); };
    var rp = function (recargar) { var a = raiz.querySelector('#ccAsunto'); if (a) leer(raiz); ctx.repinta(recargar); };
    $$('[data-cc-quita]').forEach(function (b) { b.onclick = function () { leer(raiz); var p = b.dataset.ccQuita.split('|'); S.ed[p[0]].splice(Number(p[1]), 1); ctx.repinta(); }; });
    $$('[data-cc-nuevo]').forEach(function (i) {
      i.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === 'Tab' && i.value) { e.preventDefault(); leer(raiz); agrega(i.dataset.ccNuevo, i.value, ctx.repinta); } };
      i.onblur = function () { if (i.value.trim()) { leer(raiz); agrega(i.dataset.ccNuevo, i.value, ctx.repinta); } };
    });
    var a = raiz.querySelector('#ccAsunto'), t = raiz.querySelector('#ccCuerpo');
    var bt = function () { var g = raiz.querySelector('[data-cc-a="guardar"]'); if (!!g !== !!cambiado()) rp(); };
    if (a) a.oninput = function () { S.ed.asunto = a.value; bt(); };
    if (t) t.oninput = function () { S.ed.cuerpo = t.value; bt(); };
    $$('[data-cc-a]').forEach(function (b) { b.onclick = function () {
      var c = ctx.caso(); if (!c) return; leer(raiz);
      var k = b.dataset.ccA;
      if (k === 'guardar') return guardar(c, ctx.repinta);
      if (k === 'deshacer') { S.ed = JSON.parse(JSON.stringify(S.orig)); S.msg = null; return ctx.repinta(); }
      if (k === 'cerrar') { S.b = null; S.ed = null; S.orig = null; return ctx.repinta(); }
      if (k === 'enviar') return definitiva(c, ctx.repinta);
    }; });
    $$('[data-cc-alta]').forEach(function (b) { b.onclick = function () { var c = ctx.caso(); if (c) { leer(raiz); proponerAlta(c, b.dataset.ccAlta, ctx.repinta); } }; });
    $$('[data-cc-altaok]').forEach(function (b) { b.onclick = function () { var c = ctx.caso(); if (c) { b.disabled = true; b.innerHTML = GIRO + ' Dando de alta…'; aprobarAlta(c, ctx.hilo(), b.dataset.ccAltaok, true, ctx.repinta); } }; });
    $$('[data-cc-altano]').forEach(function (b) { b.onclick = function () { var c = ctx.caso(); if (c) aprobarAlta(c, ctx.hilo(), b.dataset.ccAltano, false, ctx.repinta); }; });
  }

  /* ── «Mi firma del correo» (⋮): la imagen se comprime en el teléfono a ≤ 80 KB (PNG o JPG) y se guarda en la base. ── */
  function comprimir(file) {
    return new Promise(function (listo, falla) {
      var fr = new FileReader();
      fr.onerror = function () { falla(new Error('No pude leer la imagen.')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { falla(new Error('Ese archivo no es una imagen.')); };
        img.onload = function () {
          var intento = function (ancho, tipo, q) {
            var k = Math.min(1, ancho / img.width), cv = document.createElement('canvas');
            cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
            var x = cv.getContext('2d'); if (tipo === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); }
            x.drawImage(img, 0, 0, cv.width, cv.height);
            return cv.toDataURL(tipo, q);
          };
          var pruebas = [[600, 'image/png'], [480, 'image/png'], [600, 'image/jpeg', 0.85], [480, 'image/jpeg', 0.75], [360, 'image/jpeg', 0.7]];
          for (var i = 0; i < pruebas.length; i++) {
            var u = intento(pruebas[i][0], pruebas[i][1], pruebas[i][2]), b64 = u.split(',')[1] || '';
            if (b64.length * 0.75 <= 80 * 1024) return listo({ mime: pruebas[i][1], b64: b64, kb: Math.round(b64.length * 0.75 / 1024) });
          }
          falla(new Error('La firma es muy grande aun reducida: recórtala y vuelve a intentar.'));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function dlgFirma(ctx) {
    css();
    var m = modal({ titulo: 'Mi firma del correo', marca: 'ce-modal-vp', html: '<div class="cc-def">' +
      '<p class="cc-nota">La imagen va al final de cada correo de cotización que mandes (en HTML; quien no ve imágenes lee tu nombre, puesto y correo). Se reduce aquí mismo a 80 KB o menos. No la guardes con datos personales que no quieras mandar.</p>' +
      '<input type="file" accept="image/png,image/jpeg" id="ccFirmaArch">' +
      '<div id="ccFirmaVer" class="cc-firma"></div><div id="ccFirmaMsg" class="cc-nota"></div>' +
      '<div class="cc-pie"><button type="button" class="ce-bt" data-f="quitar">Quitar la imagen</button><button type="button" class="ce-bt" data-f="cerrar">Cerrar</button><button type="button" class="ce-bt si" data-f="guardar" disabled>Guardar</button></div></div>' });
    if (!m) return;
    var lista = null, msg = m.el.querySelector('#ccFirmaMsg'), bg = m.el.querySelector('[data-f="guardar"]');
    m.el.querySelector('#ccFirmaArch').onchange = async function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      msg.textContent = 'Reduciendo…'; bg.disabled = true;
      try { lista = await comprimir(f); m.el.querySelector('#ccFirmaVer').innerHTML = '<img alt="Vista previa de la firma" src="data:' + lista.mime + ';base64,' + lista.b64 + '">'; msg.textContent = 'Lista: ' + lista.kb + ' KB.'; bg.disabled = false; }
      catch (x) { lista = null; msg.textContent = x.message; }
    };
    m.el.querySelector('[data-f="cerrar"]').onclick = function () { m.cerrar(); };
    bg.onclick = async function () {
      if (!lista) return; bg.disabled = true; bg.innerHTML = GIRO + ' Guardando…';
      var r = await G.CzCliente.cotizacion('firma', { caso_id: (ctx && ctx.caso_id) || '', datos: { mime: lista.mime, imagen_b64: lista.b64 } });
      if (!r.ok) { bg.disabled = false; bg.textContent = 'Guardar'; msg.textContent = r.mensaje || ('No se guardó (' + (r.error || 'sin respuesta') + ').'); return; }
      m.cerrar(); aviso('Tu firma quedó guardada. Sale en el siguiente correo.');
    };
    m.el.querySelector('[data-f="quitar"]').onclick = async function () {
      var r = await G.CzCliente.cotizacion('firma_quitar', { caso_id: (ctx && ctx.caso_id) || '' });
      msg.textContent = r.ok ? 'Imagen quitada: la firma sale en texto.' : (r.mensaje || 'No se pudo quitar.');
    };
  }

  G.CzCorreo = { on: on, preparar: preparar, html: html, lineas: lineas, enlazar: enlazar, dlgFirma: dlgFirma, delAgente: delAgente, _estado: S };
})(window);
