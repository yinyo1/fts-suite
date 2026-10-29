/* ═══ Conceptualizador · el rayito ya no causa ciclos (V1.63i.7, fts-conceptualizador#16 punto 3, Esteban 28-oct-2026 14:50 MT, D227) ═══
 *
 * Detrás del interruptor `rayito_v163i` (apagado: nadie llama a este módulo y el rayito es el de la V1.63i.5).
 * Richard veía el rayito con «3» y lo leía como pendientes que debía hacer; por eso picaba «Vuelve a armar» una y otra vez
 * (a3d9c8: 18:00 y 18:14 UTC; d9159b: 04:00, 14:15 y 18:01 UTC del 28-oct). El «3» era: el PDF de Odoo + la salida de la falla
 * («Volver a armar») + «Dame los generales»: nada de eso esperaba a Richard.
 *
 *  a) El número solo cuenta lo que de verdad ESPERA a la persona: una decisión que frena el envío (crear el machote o la orden,
 *     cotizar con referencias, aplicar lo que el agente propone) o una pregunta suya. Sin eso, sin número.
 *  b) Dos grupos: «Pendientes tuyos» (lo que cuenta el número) y «Cosas que puedes hacer» (opcionales, sin número).
 *  c) Lo que REHACE o sobreescribe (Volver a armar, Actualizar el machote, Actualizar SO… en Odoo) pide confirmación diciendo qué
 *     va a pasar; cancelar no hace nada.
 *  d) Si va a causar descontrol no se deja: sale en gris con la razón en una línea (el robot o el agente trabajando el caso; la misma
 *     acción ya se pidió hace menos de 30 min; un mensaje de la persona sin contestar; la orden ya coincide con el machote vigente).
 *  e) Cada clic se mide (evento `rayito`, db/060): acción, resultado (hecha · cancelada · bloqueada), razón y grupo.
 *
 * API (sin DOM; la pantalla le pasa lo que sabe):
 *   CzRayito.on() · clasificar(item) → { grupo:'pendiente'|'opcional', rehace:null|'rearmar'|'act_odoo'|'act_machote', accion }
 *   · razon(rehace, H, ctx) → null | { codigo, texto }     ctx = { ahora, agente:{quien,estado}|null, orden, desactualizada, local }
 *   · confirmacion(rehace, H, ctx) → { titulo, texto, si }  · agrupar(items) → items ordenados con `grupo` (etiqueta) y n
 *   · GRUPOS · VENTANA_MS (30 min) · SIN_CONTESTAR_MS (2 h)
 */
(function (G) {
  'use strict';
  function on() { try { return typeof G.CzInterruptor === 'function' && G.CzInterruptor('rayito_v163i') === true; } catch (e) { return false; } }
  var VENTANA_MS = 30 * 60000, SIN_CONTESTAR_MS = 2 * 3600000;
  var GRUPOS = { pendiente: 'Pendientes tuyos', opcional: 'Cosas que puedes hacer' };
  // El mismo patrón que la base (db/058 conceptualizador.vuelve_a_armar): un «vuelve a armar» escrito a mano también cuenta.
  var REARMA_RX = /(vuelve|volver|vuelvo) a armar|\brearma|\barma(la|r)? (otra vez|de nuevo)|\brebuild|\bredo the quote/i;
  var MAQUINA_RX = /^(motor|robot|agente|avance|conceptualizador|sistema|alarma)/i;
  function t(x) { return Date.parse(x || '') || 0; }
  function hhmm(ms) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function dinero(n, mon) {
    if (!(Number(n) > 0)) return '';
    var x = Number(n);
    return '$' + x.toLocaleString('es-MX', { maximumFractionDigits: x % 1 ? 2 : 0, minimumFractionDigits: x % 1 ? 2 : 0 }) + (mon ? ' ' + mon : '');
  }

  /** a/b · a qué grupo va cada sugerencia del rayito y si rehace. `item.sug` = { acc, a?, txt, texto?, rehace? } (lo arma la pantalla). */
  function clasificar(item) {
    var s = (item && item.sug) || {}, acc = s.acc || '', txt = String(s.txt || ''), texto = String(s.texto || '');
    var manda = acc === 'mandar' || (acc === 'falla' && s.hacerAcc === 'mandar');   // la salida de una falla que se le pide al motor
    var rearma = manda && REARMA_RX.test(texto);
    var actOdoo = (manda && /^Actualiza\b/.test(texto)) || acc === 'pdf_odoo_act' || (acc === 'hacer' && /^Actualizar .* en Odoo/.test(txt));
    var rehace = s.rehace || (rearma ? 'rearmar' : actOdoo ? 'act_odoo' : acc === 'machote' && /^Actualizar/.test(txt) ? 'act_machote' : null);
    var pend;
    if (acc === 'falla') pend = !s.hacerAcc || s.hacerAcc === 'mandar' ? false : true;
    else if (acc === 'machote' || acc === 'refok' || acc === 'rubro' || acc === 'ciudad' || acc === 'confirma_ciudad' || acc === 'preguntas') pend = true;
    else if (acc === 'ir') pend = s.a === 'conjetura' || s.a === 'conceptos' || s.a === 'accion' || s.a === 'oferta';
    else if (acc === 'hacer') pend = !/^Ya la mandé/.test(txt);   // crear / actualizar la orden que PROPUSO el agente: frena el envío
    else pend = false;                                             // PDF, ver, generales, ya la mandé, volver a armar, «Haz la cotización»…
    var accion = rehace || ({ pdf_odoo: 'pdf_odoo', ver_cot: 'ver_cot', generales: 'generales', refok: 'refok', rubro: 'rubro', ciudad: 'ciudad',
      confirma_ciudad: 'ciudad', disparo: 'disparo', cotiza: 'cotiza', preguntas: 'preguntas', ir: 'ir', falla: 'falla' })[acc] ||
      (acc === 'machote' ? 'crear_machote' : acc === 'hacer' ? (/^Ya la mandé/.test(txt) ? 'ya_la_mande' : 'crear_odoo') : acc === 'mandar' ? 'mandar' : 'otra');
    return { grupo: pend ? 'pendiente' : 'opcional', rehace: rehace, accion: accion };
  }

  /** ¿El robot o el agente están trabajando el caso? (lo que ya llega a la pantalla: el estado decidido por el servidor y los trabajos del hilo). */
  function trabajando(H, ctx) {
    var ag = ctx && ctx.agente;
    if (ag && ag.quien === 'robot') return 'El robot está trabajando este caso; espera a que termine.';
    if (ag && ag.estado === 'cola') return 'El caso ya está en la fila del agente; espera a que lo conteste.';
    if (ag) return 'El agente está trabajando este caso; espera a que termine.';
    var tr = ((H && H.trabajos) || []).filter(function (x) { return x.estado === 'tomado' || x.estado === 'pendiente'; });
    if (!tr.length) return null;
    return tr.some(function (x) { return x.estado === 'tomado'; }) ? 'El agente está trabajando este caso; espera a que termine.' : 'El caso ya está en la fila del agente; espera a que lo conteste.';
  }
  /** ¿La misma acción ya se pidió en los últimos 30 min? (la base: hilo.rayito; esta pantalla: ctx.local; y el mensaje que la pidió). */
  function yaPedida(rehace, H, ctx) {
    var ahora = (ctx && ctx.ahora) || Date.now(), desde = ahora - VENTANA_MS, ult = 0;
    ((H && H.rayito) || []).forEach(function (r) { if (r.accion === rehace && r.resultado === 'hecha' && t(r.at) > desde && t(r.at) > ult) ult = t(r.at); });
    var lo = ctx && ctx.local && ctx.local[rehace]; if (lo && lo > desde && lo > ult) ult = lo;
    ((H && H.mensajes) || []).forEach(function (m) {
      if (m.rol !== 'usuario') return; var w = t(m.created_at); if (!(w > desde) || w <= ult) return;
      var x = String(m.texto || '');
      if ((rehace === 'rearmar' && REARMA_RX.test(x)) || (rehace === 'act_odoo' && /^Actualiza\b.*\ben Odoo\b/i.test(x))) ult = w;
    });
    return ult ? 'Ya lo pediste a las ' + hhmm(ult) + '; espera la respuesta antes de pedirlo otra vez.' : null;
  }
  /** ¿Hay un mensaje de la persona sin contestar? (el último de una persona sin una respuesta del motor después; menos de 2 h). */
  function sinContestar(H, ctx) {
    var ahora = (ctx && ctx.ahora) || Date.now(), M = ((H && H.mensajes) || []).slice().sort(function (a, b) { return t(a.created_at) - t(b.created_at) || Number(a.id) - Number(b.id); });
    var u = null;
    for (var i = M.length - 1; i >= 0; i--) {
      var m = M[i];
      if (m.rol === 'motor' && m.autor !== 'acuse') return null;
      if (m.rol === 'usuario' && !MAQUINA_RX.test(String(m.autor || ''))) { u = m; break; }
    }
    if (!u || ahora - t(u.created_at) > SIN_CONTESTAR_MS) return null;
    return 'Tienes un mensaje sin contestar (' + hhmm(t(u.created_at)) + '); el agente lo atiende primero.';
  }
  /** ¿La orden ya coincide con el machote vigente? Solo cuando se sabe: el total de Odoo y el del machote, y ninguna versión pendiente. */
  function coincide(rehace, H, ctx) {
    if (rehace !== 'rearmar' && rehace !== 'act_odoo') return null;
    var O = ctx && ctx.orden;
    if (!O || !(O.total > 0) || !(O.vigente > 0) || O.distinto || (ctx && ctx.desactualizada)) return null;
    return 'La orden ' + O.so + ' ya coincide con el machote vigente (' + dinero(O.total, O.moneda) + '): no hay nada que rehacer.';
  }
  /** d · la razón del gris, o null. Orden: lo que está pasando ahora primero. */
  function razon(rehace, H, ctx) {
    if (!rehace) return null;
    var x;
    if ((x = trabajando(H, ctx))) return { codigo: 'trabajando', texto: x };
    if ((x = yaPedida(rehace, H, ctx))) return { codigo: 'ya_pedida', texto: x };
    if ((x = sinContestar(H, ctx))) return { codigo: 'sin_contestar', texto: x };
    if ((x = coincide(rehace, H, ctx))) return { codigo: 'coincide', texto: x };
    return null;
  }
  /** c · lo que va a pasar, antes de rehacer. */
  function confirmacion(rehace, H, ctx) {
    var O = ctx && ctx.orden, c = (H && H.caso) || {}, so = (O && O.so) || c.orden_nombre || '';
    var tot = O ? dinero(O.total, O.moneda) : '', vig = O ? dinero(O.vigente && Math.ceil(O.vigente - 0.005), O.moneda) : '';
    if (rehace === 'rearmar') {
      var t1 = !so ? 'Esto rehace la cotización desde el machote vigente y te deja otra vez el botón para crearla en Odoo; el agente trabaja una vuelta completa.' :
        O && O.distinto && tot && vig ? 'Esto rehace la cotización desde el machote vigente (' + vig + '); la orden ' + so + ' ya existe con ' + tot + ' y se va a reemplazar con lo nuevo.' :
        'Esto rehace la cotización desde el machote; la orden ' + so + ' ya existe' + (tot ? ' (' + tot + ')' : '') + ' y se va a reemplazar.';
      return { titulo: '¿Volver a armar la cotización?', texto: t1 + ' ¿Seguro?', si: 'Sí, volver a armar' };
    }
    if (rehace === 'act_odoo') return { titulo: '¿Actualizar ' + (so || 'la orden') + ' en Odoo?',
      texto: 'Esto sobreescribe la orden ' + (so || 'del caso') + ' en Odoo' + (tot ? ' (hoy ' + tot + ')' : '') + ' con el machote vigente' + (vig ? ' (' + vig + ')' : '') + '. ¿Seguro?', si: 'Sí, actualizar' };
    var fol = (ctx && ctx.folio) || c.machote_folio || 'del caso';
    return { titulo: '¿Actualizar el machote?', texto: 'Esto sobreescribe el machote ' + fol + ' con lo que propone el agente; queda como la versión vigente. ¿Seguro?', si: 'Sí, actualizar' };
  }
  /** b · pendientes primero, luego opcionales (orden estable dentro de cada grupo); `grupo` es la etiqueta; n = pendientes que se pueden hacer. */
  function agrupar(L) {
    var P = [], O = [];
    (L || []).forEach(function (x) { (x._r && x._r.grupo === 'pendiente' ? P : O).push(x); });
    P.forEach(function (x) { x.grupo = GRUPOS.pendiente; }); O.forEach(function (x) { x.grupo = GRUPOS.opcional; });
    return { lista: P.concat(O), n: P.filter(function (x) { return !x.gris; }).length };
  }
  G.CzRayito = { on: on, clasificar: clasificar, razon: razon, confirmacion: confirmacion, agrupar: agrupar, trabajando: trabajando, yaPedida: yaPedida,
    sinContestar: sinContestar, coincide: coincide, GRUPOS: GRUPOS, VENTANA_MS: VENTANA_MS, SIN_CONTESTAR_MS: SIN_CONTESTAR_MS };
})(window);
