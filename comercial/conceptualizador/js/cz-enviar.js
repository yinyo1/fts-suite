/* ═══ Conceptualizador · ver, descargar y ENVIAR la cotización de Odoo al cliente (V1.54 E3, fts-conceptualizador#11) ═══
 *
 * Prototipo: fts-conceptualizador, prototipos/v154/pantalla.html (escenas odoo · enviar · vista-previa · enviado).
 * Detrás del interruptor `enviar_cliente` (apagado = esta pantalla no pinta nada). Webhook conceptualizador/cotizacion-cliente
 * (db/019 decide todo: quién, la orden del caso, condiciones listas, firma, destinatarios de Odoo, tope).
 *
 *  · «📄 PDF de Odoo»: el PDF OFICIAL que bajó del portal de Odoo, en el popup del núcleo.
 *  · «⬇ Descargar PDF»: el mismo PDF, como archivo.
 *  · «✉ Enviar al cliente»: el mensaje sugerido en una caja editable → «Enviar…» abre la vista previa del correo completo
 *    (De sales@, Para entre los contactos del cliente en Odoo, CC quien cotiza + ingeniero comercial, Responder a sales@,
 *    asunto, cuerpo, firma de quien cotiza y el PDF) → SOLO con «Enviar» sale. El agente nunca envía: no hay otro camino.
 *  · Debajo, una línea por envío: quién, cuándo, a quién y el folio (de `hilo.envios_cliente`).
 * V1.56 (fts-conceptualizador#12, punto 4) · «Ver cotización» y «Descargar PDF» ya NO dependen de `enviar_cliente`: salen en
 * todos los chats en cuanto el caso tiene orden en Odoo, para el dueño y para Esteban (la base lo decide, db/022). Solo
 * «Enviar al cliente» sigue detrás del interruptor (y de MODO_PRUEBA en el workflow).
 */
(function (G) {
  'use strict';
  var S = { caja: null, borrador: null, ocupado: false };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var on = function () { try { return !!(G.CzInterruptor && G.CzInterruptor('enviar_cliente')); } catch (e) { return false; } };
  var CSS = '.ce-bts{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}' +
    '.ce-bt{border-radius:18px;padding:7px 14px;font-weight:600;font-size:14px;border:1px solid var(--acento-osc,#008069);color:var(--acento-osc,#008069);background:#fff;display:inline-flex;gap:6px;align-items:center;min-height:36px}' +
    '.ce-bt.si{background:var(--acento-osc,#008069);color:#fff}.ce-bt[disabled]{opacity:.45;cursor:not-allowed}' +
    '.ce-caja{margin-top:8px;border-top:1px solid var(--linea,#e9edef);padding-top:8px}' +
    '.ce-caja label{display:block;font-size:12.5px;color:var(--sec,#667781);margin-bottom:4px}' +
    '.ce-caja textarea{width:100%;box-sizing:border-box;min-height:120px;border:1px solid var(--linea,#e9edef);border-radius:8px;padding:8px;font:inherit;font-size:14px;resize:vertical}' +
    '.ce-nota{font-size:12px;color:var(--sec,#667781);margin-top:6px}.ce-mal{color:var(--rojo,#c0392b)}' +
    '.ce-env{font-size:12.5px;color:var(--sec,#667781);margin-top:6px}.ce-env b{color:#3b4a54}' +
    '.ce-vp{padding:12px 16px;display:flex;flex-direction:column;gap:8px;font-size:14px}' +
    '.ce-campo{display:grid;grid-template-columns:96px minmax(0,1fr);gap:8px;align-items:start;border-bottom:1px solid #e9edef;padding-bottom:6px}' +
    '.ce-campo>span{color:#667781;font-size:13px;padding-top:2px}.ce-campo>div{min-width:0;overflow-wrap:anywhere}' +
    '.ce-campo select,.ce-campo input{width:100%;box-sizing:border-box;font:inherit;font-size:14px;padding:6px 8px;border:1px solid #e9edef;border-radius:8px;background:#fff}' +
    '.ce-chip{display:inline-flex;gap:4px;align-items:center;background:#f0f2f5;border-radius:12px;padding:2px 8px;font-size:13px;margin:0 4px 4px 0}.ce-chip small{color:#667781}' +
    '.ce-cuerpo{white-space:pre-wrap;border:1px solid #e9edef;border-radius:8px;padding:10px;background:#fff;overflow-wrap:anywhere}' +
    '.ce-firma{border-top:1px solid #e9edef;margin-top:8px;padding-top:6px;color:#667781;font-size:13px;white-space:pre-line}' +
    '.ce-adj{border:1px solid #e9edef;border-radius:8px;padding:6px 9px;font-size:13px;display:inline-block}' +
    '.ce-oculto{font-size:11.5px;color:#8696a0}' +
    '.ce-pie{display:flex;justify-content:flex-end;gap:8px;padding:10px 0 4px;position:sticky;bottom:0;background:#fff}' +
    '.ce-pdf{display:block;width:100%;height:100%;border:0}';
  function css() { if (document.getElementById('ce-css')) return; var s = document.createElement('style'); s.id = 'ce-css'; s.textContent = CSS; document.head.appendChild(s); }
  function modal(op) { var m = G.ChatNucleo && G.ChatNucleo.modal; return m ? m(op) : null; }
  function aviso(t) { if (G.CzApp && G.CzApp.toast) G.CzApp.toast(t); }

  function hora(iso) { try { return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  /** Los botones bajo el último borrador hecho, y la línea de cada envío. Vacío con el interruptor apagado. */
  function botones(H, puede) {
    var c = (H && H.caso) || {};
    if (!c.orden_id || puede === false) return '';
    css();
    var L = (H && H.envios_cliente) || [], enviada = L.some(function (x) { return x.estado === 'enviado'; });
    // V1.57a (#12 acumulado 7, `recalculo_v157`) · si la orden en Odoo quedó atrás del machote, se dice ANTES de abrirla.
    var od = G.CzInterruptor && G.CzInterruptor('recalculo_v157') && G.CzAvance && G.CzAvance.odooDesactualizada ? G.CzAvance.odooDesactualizada(H) : null;
    var din = function (n, m) { return n == null ? '' : '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + (m && m !== 'MXN' ? ' ' + m : ''); };
    var hOd = od ? '<div class="ce-env ce-mal" data-ce-viejo="1">⚠ Versión en Odoo: ' + esc(din(od.monto, od.moneda) || od.orden) + ' · desactualizada, falta Actualizar' + (od.propuesto ? ' (toca «Actualizar ' + esc(od.orden) + ' en Odoo» arriba)' : '') + '</div>' : '';
    var h = hOd + '<div class="ce-bts"><button type="button" class="ce-bt' + (on() ? '' : ' si') + '" data-ce="ver">📄 Ver cotización</button><button type="button" class="ce-bt" data-ce="bajar">⬇ Descargar PDF</button>' +
      (on() ? '<button type="button" class="ce-bt' + (enviada ? '' : ' si') + '" data-ce="enviar">✉ ' + (enviada ? 'Enviar otra vez' : 'Enviar al cliente') + '</button>' : '') + '</div>';
    if (!on()) return h + '<div class="ce-nota">El PDF es el de Odoo: se abre aquí mismo y se cierra con ✕.</div>';
    if (S.caja) h += '<div class="ce-caja"><label for="ceTx">Mensaje para el cliente (lo puedes cambiar)</label><textarea id="ceTx">' + esc(S.caja.cuerpo) + '</textarea>' +
      '<div class="ce-bts"><button type="button" class="ce-bt si" data-ce="previa">Enviar…</button><button type="button" class="ce-bt" data-ce="cancelar">Cancelar</button></div>' +
      '<div class="ce-nota">Antes de que salga ves el correo completo. Solo sale con tu clic.</div></div>';
    L.forEach(function (x) {
      var est = { enviado: '✉ Enviada', prueba: '🧪 En prueba (solo a sales@)', error: '⚠ No salió', enviando: '… Enviando', propuesto: null }[x.estado];
      if (est) h += '<div class="ce-env' + (x.estado === 'error' ? ' ce-mal' : '') + '">' + est + (x.enviado_por ? ' por <b>' + esc(x.enviado_por) + '</b>' : '') + (x.enviado_at ? ' · ' + esc(hora(x.enviado_at)) : '') +
        (x.para ? ' · a ' + esc(x.para) : '') + ' · ' + esc(x.orden || '') + ' · folio ' + esc(x.folio) + '</div>';
    });
    return h;
  }

  async function pdf(c, bajar) {
    if (S.ocupado) return; S.ocupado = true;
    var r = await G.CzCliente.cotizacion('ver', { caso_id: c.id }); S.ocupado = false;
    if (!r.ok || !r.pdf) return aviso(r.mensaje || 'No pude traer el PDF de Odoo (' + (r.error || 'sin respuesta') + ').');
    var bin = atob(r.pdf.b64), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' }));
    if (bajar) { var a = document.createElement('a'); a.href = url; a.download = r.pdf.nombre || 'cotizacion.pdf'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000); return; }
    var m = modal({ titulo: (r.pdf.nombre || 'Cotización') + ' · cotización de Odoo', marca: 'ce-modal-pdf',
      cabecera: '<a class="ce-bt" style="min-height:32px;padding:4px 12px" href="' + url + '" download="' + esc(r.pdf.nombre || 'cotizacion.pdf') + '">⬇</a>',
      html: '<iframe class="ce-pdf" title="PDF de la cotización" src="' + url + '"></iframe>', alCerrar: function () { URL.revokeObjectURL(url); } });
    if (!m) G.open(url, '_blank');
  }

  async function preparar(c, repinta) {
    if (S.ocupado) return; S.ocupado = true;
    var r = await G.CzCliente.cotizacion('preparar', { caso_id: c.id }); S.ocupado = false;
    if (!r.ok || !r.borrador) return aviso(r.mensaje || 'No se puede enviar todavía (' + (r.error || 'sin respuesta') + ').');
    S.borrador = r.borrador; S.caja = { cuerpo: r.borrador.cuerpo }; repinta();
  }

  function vistaPrevia(c, repinta) {
    var b = S.borrador; if (!b) return;
    var tx = document.getElementById('ceTx'); if (tx) S.caja.cuerpo = tx.value;
    var f = b.firma || {};
    var m = modal({ titulo: 'Vista previa del correo', marca: 'ce-modal-vp', html: '<div class="ce-vp">' +
      '<div class="ce-campo"><span>De</span><div>FTS Ventas &lt;' + esc(b.de) + '&gt;</div></div>' +
      '<div class="ce-campo"><span>Para</span><div><select id="cePara">' + (b.para_opciones || []).map(function (o) { return '<option value="' + esc(o.correo) + '"' + (o.correo === b.para ? ' selected' : '') + '>' + esc((o.nombre ? o.nombre + ' · ' : '') + o.correo) + '</option>'; }).join('') + '</select>' +
        '<div class="ce-oculto">Solo contactos del cliente registrados en Odoo.</div></div></div>' +
      '<div class="ce-campo"><span>CC</span><div>' + (b.cc || []).map(function (x, i) { return '<span class="ce-chip">' + esc(x) + ' <small>' + (i === 0 ? 'cotiza' : 'ingeniero comercial') + '</small></span>'; }).join('') + '</div></div>' +
      '<div class="ce-campo"><span>Responder a</span><div>' + esc(b.responder_a) + '</div></div>' +
      '<div class="ce-campo"><span>Asunto</span><div><input id="ceAsunto" value="' + esc(b.asunto) + '" maxlength="200"><div class="ce-oculto">Al final se agrega «· Ref. ' + esc(b.folio) + '» para ligar la respuesta del cliente al caso.</div></div></div>' +
      '<div class="ce-cuerpo">' + esc(S.caja.cuerpo) + '<div class="ce-firma">' + esc([b.idioma === 'en' ? 'Best regards,' : 'Saludos,', f.nombre, f.puesto, 'FTS', f.correo].filter(Boolean).join('\n')) + '</div></div>' +
      '<div class="ce-campo"><span>Adjunto</span><div><span class="ce-adj">📄 ' + esc(b.adjunto) + '</span> <button type="button" class="ce-bt" data-ce-vp="ver" style="min-height:30px;padding:3px 10px">Ver</button></div></div>' +
      '<div class="ce-pie"><button type="button" class="ce-bt" data-ce-vp="regresar">Regresar</button><button type="button" class="ce-bt si" data-ce-vp="enviar">Enviar</button></div></div>' });
    if (!m) return;
    m.el.querySelector('[data-ce-vp="regresar"]').onclick = function () { m.cerrar(); };
    m.el.querySelector('[data-ce-vp="ver"]').onclick = function () { pdf(c, false); };
    var be = m.el.querySelector('[data-ce-vp="enviar"]');
    be.onclick = async function () {
      if (be.disabled) return; be.disabled = true; be.textContent = 'Enviando…';
      var r = await G.CzCliente.cotizacion('enviar', { caso_id: c.id, accion_id: b.envio_id,
        datos: { confirmado: true, para: m.el.querySelector('#cePara').value, asunto: m.el.querySelector('#ceAsunto').value, cuerpo: S.caja.cuerpo } });
      if (!r.ok) { be.disabled = false; be.textContent = 'Enviar'; return aviso(r.mensaje || 'No salió (' + (r.error || 'sin respuesta') + ').'); }
      S.caja = null; S.borrador = null; m.cerrar(); aviso(r.mensaje || 'Enviada.'); repinta(true);
    };
  }

  /** Enlaza los botones dentro de `raiz`. `ctx`: { caso, repinta(recargar) }. */
  function enlazar(raiz, ctx) {
    if (!raiz) return;
    Array.prototype.forEach.call(raiz.querySelectorAll('[data-ce]'), function (b) {
      b.onclick = function () {
        var c = ctx.caso(); if (!c) return;
        var k = b.dataset.ce;
        if (k === 'ver') return pdf(c, false);
        if (k === 'bajar') return pdf(c, true);
        if (!on()) return;   // enviar, cancelar y la vista previa siguen detrás de enviar_cliente
        if (k === 'enviar') return preparar(c, ctx.repinta);
        if (k === 'cancelar') { S.caja = null; S.borrador = null; return ctx.repinta(); }
        if (k === 'previa') return vistaPrevia(c, ctx.repinta);
      };
    });
    var tx = raiz.querySelector('#ceTx'); if (tx) tx.oninput = function () { if (S.caja) S.caja.cuerpo = tx.value; };
  }

  /* V1.56 · el rayito («Ver cotización») abre el mismo PDF; `bajar` lo descarga. */
  function ver(c, bajar) { return c ? pdf(c, !!bajar) : null; }
  G.CzEnviar = { botones: botones, enlazar: enlazar, ver: ver, _estado: S };
})(window);
