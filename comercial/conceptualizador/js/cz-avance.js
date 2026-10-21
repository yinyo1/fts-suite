/* ═══ Conceptualizador · dónde va la cotización (V1.37; rubros V1.40) ═══
 *
 * La franja de avance, el botón del siguiente paso y el «Retomamos» salen de AQUÍ, con lo que
 * ya está en el hilo que manda la base (Postgres): el caso, las acciones, los eventos, la última
 * respuesta y la hora del último mensaje. No hay trabajo del motor para pintarlo.
 * Es la función del prototipo aprobado (fts-conceptualizador, prototipos/avance-v136.html, #4).
 *
 *   Levantamiento → Cotiza → Preguntas → Conceptos → BOM y precios → Machote → Cotización Odoo
 *
 * «faltan 11 · 6 sin nada · 5 a medias» del levantamiento: `ultima.verifica.faltantes`, que
 * `procesa.js entregar` cuenta SIN modelo en «Lo que falta» de resumen.md (V1.37). Sin ese dato,
 * no se pinta un número (nunca se inventa).
 */
(function (G) {
  'use strict';
  var PASOS = ['Levantamiento', 'Cotiza', 'Preguntas', 'Conceptos', 'BOM y precios', 'Machote', 'Cotización Odoo'];
  var plural = function (n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); };
  var conPrecio = function (v) { return v !== null && v !== undefined && v !== ''; };

  /** Lo que falta del levantamiento: {abiertos, a_medias, total} o null si el motor no lo ha contado. */
  function faltantes(H) {
    var f = H && H.ultima && H.ultima.verifica && H.ultima.verifica.faltantes;
    if (!f || typeof f.abiertos !== 'number') return null;
    var a = f.abiertos || 0, m = f.a_medias || 0;
    return { abiertos: a, a_medias: m, total: a + m };
  }
  /** «faltan 11 · 6 sin nada · 5 a medias» (decisión de Esteban, #4). */
  function textoFaltantes(f) {
    if (!f || !f.total) return '';
    return 'faltan ' + f.total + (f.a_medias ? ' · ' + f.abiertos + ' sin nada · ' + f.a_medias + ' a medias' : '');
  }

  /** ¿El robot (modo avance) ya dejó BOM y machote al día? Lo dice su mensaje publicado («armé el BOM… machote…»). */
  function specDelRobot(H) {
    return ((H && H.mensajes) || []).some(function (m) { return m && m.autor === 'motor-avance' && /\bBOM\b/.test(m.texto || '') && /machote/i.test(m.texto || ''); });
  }
  /* V1.55 (`cierre_tarjetas`, fts-conceptualizador#12 D) · UN solo cálculo de «abiertas», el mismo que usa el motor
   * (herramientas/motor/cierres-tarjetas.js): conjeturas `propuesta` que NO están ya contestadas por una corrección de chat
   * (`verifica.reemplazos`) ni son una vista vieja de «Esto voy a poner en Odoo» (hay una más nueva). Lo usan la franja, el
   * rayito, el rubro y la tarjeta; la base cierra esas mismas en su siguiente entrega. Apagado: todas las `propuesta`, como antes. */
  function abiertas(H, rubro) {
    var A = (H && H.acciones) || [], conj = A.filter(function (a) { return a.tipo === 'conjetura'; });
    var ab = conj.filter(function (a) { return a.estado === 'propuesta'; });
    if (intOn('cierre_tarjetas')) {
      var R = {}; (((H && H.ultima && H.ultima.verifica && H.ultima.verifica.reemplazos) || [])).forEach(function (x) { if (x && x.objetivo) R[x.objetivo] = 1; });
      var vistas = conj.filter(esVista).map(function (a) { return Number(a.id) || 0; }), ult = vistas.length ? Math.max.apply(null, vistas) : 0;
      ab = ab.filter(function (a) { return !R['conjetura:' + a.id] && !(esVista(a) && Number(a.id) < ult); });
    }
    return rubro === undefined ? ab : ab.filter(function (a) { return a.datos && a.datos.rubro === rubro; });
  }
  function esVista(a) { return !!(a && a.tipo === 'conjetura' && a.datos && a.datos.campo === 'odoo.vista'); }
  /** ¿Esta conjetura ya no pide nada aunque la base todavía diga `propuesta`? (reemplazada o vista vieja) */
  function yaNoPide(H, a) { return !!(a && a.tipo === 'conjetura' && a.estado === 'propuesta' && intOn('cierre_tarjetas') && abiertas(H).indexOf(a) < 0); }
  /** caso + hilo → el estado de cada paso, el paso en que va, y el siguiente paso (UNO). */
  function avance(H) {
    var c = (H && H.caso) || {}, A = (H && H.acciones) || [];
    var P = (H && (H.propuesta || H.ultima)) || {};
    var conRes = [H && H.ultima, H && H.propuesta].filter(function (x) { return x && ((x.bom && Object.keys(x.bom).length) || x.machote); })[0] || {};
    var f = faltantes(H);
    var conj = A.filter(function (a) { return a.tipo === 'conjetura'; });
    var conjAb = abiertas(H).length;
    var cs = P.conceptos || [];
    var dec = {}; ((H && H.eventos) || []).forEach(function (e) { if (e.concepto && (e.tipo === 'aceptar' || e.tipo === 'rechazar')) dec[e.concepto] = 1; });
    var sinDec = cs.filter(function (k) { return !dec[k.id]; }).length;
    var mat = (conRes.bom && conRes.bom.materiales) || [];
    var pendBom = mat.filter(function (m) { return !conPrecio(m.pu) && /PENDIENTE/i.test(m.fuente || ''); }).length;
    var cmP = A.filter(function (a) { return a.tipo === 'crear_machote' && a.estado === 'propuesta'; }).pop();
    var cmH = A.filter(function (a) { return a.tipo === 'crear_machote' && a.estado === 'hecha'; }).pop();
    var pendCot = cmP ? Number((cmP.datos || {}).n_pendientes) || 0 : cmH ? Number((cmH.datos || {}).n_pendientes) || 0 : pendBom;
    // V1.39 (#4 punto 7): la oferta contestada con «Editar respuesta» puede arrancar sin el disparador en la base.
    var of = (H && H.ultima && H.ultima.verifica && H.ultima.verifica.oferta) || null;
    var ciudad = !!c.proyecto_confirmada_at, hayCiudad = !!c.proyecto_ciudad, disparo = !!c.disparado_at || !!(of && of.estado === 'arrancada');
    var e = [], det = [];
    e[0] = disparo ? 'hecho' : 'actual';
    det[0] = disparo ? 'Terminado.' : f ? (f.total ? textoFaltantes(f).replace(/^f/, 'F') + '.' : 'Ya no falta nada de la lista.') : 'En curso.';
    e[1] = disparo ? 'hecho' : 'futuro';
    det[1] = disparo ? 'Ya dijiste «cotiza».' : 'Cuando termines de levantar.';
    e[2] = !disparo ? 'futuro' : conjAb ? 'actual' : conj.length ? 'hecho' : 'actual';
    det[2] = conjAb ? plural(conjAb, 'abierta', 'abiertas') + ' de ' + conj.length + '.' : conj.length ? 'Contestaste las ' + conj.length + '.' : disparo ? 'Las estoy armando.' : 'Llegan después de «cotiza».';
    e[3] = !cs.length ? 'futuro' : sinDec ? 'actual' : 'hecho';
    det[3] = !cs.length ? 'Después de las preguntas.' : sinDec ? sinDec + ' sin palomear de ' + cs.length + '.' : plural(cs.length, 'palomeado', 'palomeados') + '.';
    e[4] = !mat.length ? 'futuro' : pendCot ? 'actual' : 'hecho';
    det[4] = !mat.length ? 'Después de palomear.' : pendCot ? plural(pendCot, 'pendiente', 'pendientes') + ' para cotizar.' : plural(mat.length, 'renglón con precio y fuente', 'renglones con precio y fuente') + '.';
    e[5] = cmH ? 'hecho' : cmP ? 'actual' : 'futuro';
    det[5] = cmH ? (((cmH.resultado || {}).folio || c.machote_folio || 'Creado') + (pendCot ? ' · con ' + plural(pendCot, 'pendiente', 'pendientes') : '') + '.') :
      cmP ? 'Listo para crear' + (pendCot ? ', con ' + plural(pendCot, 'pendiente', 'pendientes') : '') + '.' : 'Se crea aunque falten precios.';
    e[6] = c.orden_nombre ? 'hecho' : cmH && !pendCot ? 'actual' : 'futuro';
    det[6] = c.orden_nombre ? c.orden_nombre + '.' : cmH && pendCot ? 'Espera ' + plural(pendCot, 'pendiente', 'pendientes') + '. Nunca se estima un precio.' : 'Con el machote sin pendientes.';
    // V1.53b.2 (#12) · BOM y spec del robot sin machote: los pasos dicen lo mismo que el siguiente («Crear machote»).
    var robotSpec = disparo && !mat.length && !cmP && !cmH && specDelRobot(H);
    if (robotSpec) { if (!conjAb) { e[2] = 'hecho'; det[2] = conj.length ? det[2] : 'Sin preguntas abiertas.'; } e[3] = e[3] === 'futuro' ? 'hecho' : e[3]; e[4] = 'hecho'; det[4] = 'Lo armó el agente.'; e[5] = 'actual'; det[5] = 'Listo para crear.'; }
    if (!ciudad && !disparo) e[0] = 'falta';
    var actual = Math.max(e.lastIndexOf('actual'), e.lastIndexOf('falta'));
    if (actual < 0) actual = Math.max(0, e.lastIndexOf('hecho'));
    // El siguiente paso, UNO. Sin ciudad confirmada, primero la ciudad: sin ella no hay BOM (D89).
    var sig = null;
    // La ciudad va primero mientras no hay BOM: un caso de antes de V1.34 que ya llegó al machote no se atora aquí.
    var antesDelBom = !mat.length && !cmP && !cmH;
    if (!ciudad && antesDelBom) sig = hayCiudad ? { txt: '¿Es en ' + c.proyecto_ciudad + '? Confirmar', acc: 'confirma_ciudad' } : { txt: 'Elegir la ciudad del proyecto', acc: 'ciudad' };
    else if (!disparo && of && of.estado === 'ofrecida') sig = { txt: 'Contestar: ¿arranco con el machote?', acc: 'ir', a: 'oferta' };
    else if (!disparo && (c.modo === 'acompanamiento' || c.modo === 'levantamiento')) sig = { txt: c.modo === 'acompanamiento' ? 'Ya terminé, cotiza' : 'Ya es todo', acc: 'disparo' };
    else if (conjAb) sig = { txt: 'Contestar ' + plural(conjAb, 'pregunta', 'preguntas'), acc: 'ir', a: 'conjetura' };
    else if (cs.length && sinDec) sig = { txt: 'Palomear ' + plural(sinDec, 'concepto', 'conceptos'), acc: 'ir', a: 'conceptos' };
    // V1.53b.2 (#12, Xignux de9756) · el robot ya armó el BOM y la spec (su mensaje lo dice) pero no hay machote ni botón: no es
    // «Armando el BOM…» para siempre. Se pide el botón con el verbo del método («Arma el machote» lo contesta el motor sin modelo).
    else if (robotSpec) sig = { txt: 'Crear machote', acc: 'mandar', texto: 'Arma el machote' };
    else if (disparo && !mat.length && !cmP && !cmH) sig = { txt: 'Armando el BOM…', espera: true };
    else if (cmP) sig = { txt: ((cmP.datos || {}).actualiza ? 'Actualizar ' + ((cmP.datos.actualiza.folio) || 'machote') : 'Crear machote') + (pendCot ? ' · ' + plural(pendCot, 'pendiente', 'pendientes') : ''), acc: 'machote', id: cmP.id };
    else if (cmH && pendCot) sig = { txt: 'Ver los ' + pendCot + ' pendientes para cotizar', acc: 'ir', a: 'pendientes' };
    else if (cmH && !c.orden_nombre) sig = { txt: 'Haz la cotización', acc: 'cotiza' };
    // Llegó al BOM y el motor todavía no ofreció el machote (casos de antes de V1.36): se le pide con el verbo del método.
    else if (mat.length && !cmH) sig = { txt: 'Armar el machote', acc: 'mandar', texto: 'Arma el machote' };
    // V1.46 (#4) · con el motor trabajando en el caso (p. ej. el «revisa» que busca un aviso), no se ofrece «Haz la cotización»
    // con lo que hay en pantalla: puede llegar una versión nueva del machote que hay que guardar primero.
    if (sig && sig.acc === 'cotiza' && ((H && H.trabajos) || []).some(function (t) { return t.estado === 'pendiente' || t.estado === 'tomado'; }))
      sig = { txt: 'Revisando si hay cambios…', espera: true };
    // V1.53b (#5, 19:36) · con la orden ya en Odoo, el siguiente es el clic que falta: «Actualizar SO…» o «Ya la mandé al cliente».
    if (intOn('pantalla_v153') && c.orden_nombre && (!sig || sig.espera || sig.acc === 'cotiza')) {
      var pen = ((H && H.acciones) || []).filter(function (a) { return a.estado === 'propuesta' && (a.tipo === 'crear_borrador' || a.tipo === 'enviada'); }).pop();
      if (pen) sig = { txt: pen.tipo === 'enviada' ? 'Ya la mandé al cliente' : (pen.titulo || 'Actualizar ' + c.orden_nombre + ' en Odoo'), acc: 'ir', a: 'accion', id: pen.id };
    }
    // V1.47 (#4 Parte H) · al 100 % el siguiente paso es cerrar el análisis (solo el dueño, de forma explícita); cerrado, se dice.
    var AN = H && H.ultima && H.ultima.verifica && H.ultima.verifica.analisis;
    // V1.52.1 (#5) · con estados_reales: nunca con un trabajo en curso ni con un clic pendiente (cierrePosible). Apagado, lo de V1.51.
    if (AN && AN.estado === 'listo' && (!sig || sig.acc === 'cotiza') && (!intOn('estados_reales') || cierrePosible(H))) sig = { txt: 'Ya está todo ok, ya no muevas nada', acc: 'mandar', texto: 'Ya está todo ok, ya no muevas nada', cierre: true };
    else if (AN && AN.estado === 'cerrado' && sig && sig.espera) sig = { txt: 'Análisis cerrado', espera: true };
    return { oferta: of, e: e, det: det, actual: actual, sig: sig, ciudad: ciudad, faltan: f, pendCot: pendCot, conjAb: conjAb, sinDec: sinDec, machote: cmH || null };
  }

  /* V1.56 (fts-conceptualizador#12, punto I/5) · los CLICS que el flujo pide, en su orden, para el rayito: ninguno se esconde.
   *   Crear / Actualizar machote → Cotizar con referencias o Crear la cotización en Odoo (o Actualizar SO…) → Ver cotización →
   *   Ya la mandé. Cada uno trae lo que la pantalla necesita para hacer el MISMO clic que su tarjeta (acción y su id). Un
   *   borrador propuesto antes del machote que falta guardar no se ofrece (es de la versión anterior, como en la tarjeta);
   *   con preguntas abiertas, el machote y el borrador esperan (la tarjeta tampoco deja). */
  /* V1.57a (#12 acumulado 7, `recalculo_v157`) · ¿la orden en Odoo ya quedó atrás? Sí cuando, después del último borrador
   * hecho, se guardó un machote más nuevo o hay un borrador propuesto más nuevo. c663eb, 19-oct: el machote v3 quedó a las 14:24
   * y SO11927 siguió en $330,585 hasta las 14:36; «Ver cotización» abrió la versión vieja y Esteban creyó que ya había terminado.
   * → { orden, monto, moneda, propuesto } o null. */
  function odooDesactualizada(H, op) {
    var c = (H && H.caso) || {}, A = (H && H.acciones) || [];
    if (!c.orden_id) return null;
    var t = function (a) { return Date.parse(a.hecha_at || a.created_at || '') || 0; };
    var bh = A.filter(function (a) { return a.tipo === 'crear_borrador' && a.estado === 'hecha'; }).sort(function (x, y) { return t(x) - t(y); }).pop();
    if (!bh) return null;
    var soloHueco = !!(op && op.soloHueco);
    // V1.58 (#12 B, `actualizar_v158`) · la orden también quedó atrás si salió sin tabla de pagos o antes de la condición única.
    var hueco = intOn('actualizar_v158') ? huecoDeBorrador(bh) : null;
    var cm = soloHueco ? null : A.filter(function (a) { return a.tipo === 'crear_machote' && a.estado === 'hecha' && t(a) > t(bh); }).pop();
    var bp = A.filter(function (a) { return a.tipo === 'crear_borrador' && a.estado === 'propuesta' && Number(a.id) > Number(bh.id); }).pop();
    if (!cm && !(bp && !soloHueco) && !hueco) return null;
    var cot = (bh.datos && bh.datos.cotizacion) || {};
    var od = { orden: c.orden_nombre || (hueco && bh.resultado && bh.resultado.orden_nombre) || 'la cotización', monto: typeof cot.suma === 'number' ? cot.suma : null, moneda: cot.moneda || c.moneda || 'MXN', propuesto: bp ? bp.id : null };
    if (hueco) { od.hueco = true; od.razon = hueco; }
    return od;
  }
  /* V1.58 (#12 B) · ¿el borrador hecho salió con hueco? → la razón visible, o null.
   *   · sin `x_fts.x_fts_hitos` ni `regla15` (en datos o en resultado): se hizo antes de la V1.57b → «salió antes de la condición
   *     única de pago» (de9756 y f56c71 tienen x_fts, 21fec6 no);
   *   · con la marca de la V1.57b pero `x_fts_hitos` vacío → «salió sin tabla de pagos» (de9756 #284, f56c71 #303). */
  function huecoDeBorrador(bh) {
    var d = (bh && bh.datos) || {}, cot = d.cotizacion || {}, xf = cot.x_fts || {}, res = (bh && bh.resultado) || {};
    var tieneCampo = Object.prototype.hasOwnProperty.call(xf, 'x_fts_hitos'), h = xf.x_fts_hitos;
    var lleno = Array.isArray(h) ? h.length > 0 : !!String(h == null ? '' : h).trim();
    // Esteban 21-oct (decisión 5): solo las órdenes que salieron con la tabla de pagos VACÍA (SO11928, SO11930). Un borrador anterior
    // a la V1.57b, sin el campo, no se ofrece aquí: su orden en Odoo puede traer la tabla por otro camino (SO11926, 90/10).
    if (!tieneCampo) return null;
    if (!lleno) return 'salió sin tabla de pagos';
    return null;
  }
  function clics(H) {
    var c = (H && H.caso) || {}, A = (H && H.acciones) || [], L = [];
    var prop = function (t) { return A.filter(function (a) { return a.tipo === t && a.estado === 'propuesta'; }).pop(); };
    var cmP = prop('crear_machote'), brP = prop('crear_borrador'), env = prop('enviada');
    var espera = abiertas(H).length > 0;
    if (cmP && !espera) L.push({ txt: (cmP.datos || {}).actualiza ? 'Actualizar ' + ((cmP.datos.actualiza.folio) || 'el machote') : 'Crear machote', acc: 'machote', id: cmP.id });
    if (brP && !espera && !(cmP && cmP.id > brP.id)) {
      var refs = brP.datos && brP.datos.referencias && brP.datos.referencias.n;
      L.push(refs ? { txt: 'Cotizar con referencias', acc: 'refok', id: brP.id } :
        { txt: c.orden_nombre ? 'Actualizar ' + c.orden_nombre + ' en Odoo' : 'Crear la cotización en Odoo', acc: 'hacer', id: brP.id });
    }
    // V1.57a · con la orden atrás del machote y sin borrador propuesto, el clic fuerte es pedir la actualización (va al motor).
    var od = intOn('recalculo_v157') ? odooDesactualizada(H) : (intOn('actualizar_v158') ? odooDesactualizada(H, { soloHueco: true }) : null);
    // V1.58 (#12 B) · si la orden salió con hueco, el mismo clic pide rearmarla con la tabla de pagos; con un borrador ya
    // propuesto (de la versión que sea) no se pide otro: ese botón ya está arriba, como hoy.
    if (od && od.hueco && !od.propuesto && !brP && !espera)
      L.push({ txt: 'Actualizar ' + od.orden + ' en Odoo · ' + od.razon, acc: 'mandar', razon: od.razon,
        texto: 'Vuelve a armar la cotización de ' + od.orden + ' con la tabla de pagos y una sola condición de pago, y propón actualizarla en Odoo.' });
    else if (od && !od.hueco && !od.propuesto && !espera) L.push({ txt: 'Actualizar ' + od.orden + ' en Odoo', acc: 'mandar', texto: 'Actualiza ' + od.orden + ' en Odoo con el machote nuevo' });
    if (c.orden_id) L.push({ txt: 'Ver cotización' + (od ? (od.hueco ? ' (' + od.razon + ')' : ' (versión vieja en Odoo)') : ''), acc: 'ver_cot', ico: '📄' });
    if (env) L.push({ txt: 'Ya la mandé al cliente', acc: 'hacer', id: env.id });
    return L;
  }

  /* V1.52.1 (#5) · ¿se puede sugerir «Ya está todo ok, ya no muevas nada»? Cierra el caso: nunca con un trabajo pendiente o
   * tomado en la base, ni con un clic pendiente de la persona (una acción `propuesta`: «Va» de una conjetura, Guardar en el
   * machote, Cotizar con referencias / Actualizar SO, Ya la mandé). El proceso vivo del robot lo revisa la pantalla. */
  var CLIC_PENDIENTE = ['conjetura', 'crear_machote', 'crear_borrador', 'enviada'];
  function cierrePosible(H) {
    if (((H && H.trabajos) || []).some(function (t) { return t.estado === 'pendiente' || t.estado === 'tomado'; })) return false;
    return !((H && H.acciones) || []).some(function (a) { return a.estado === 'propuesta' && CLIC_PENDIENTE.indexOf(a.tipo) >= 0 && !yaNoPide(H, a); });
  }
  function intOn(n) { try { return !!(G.CzInterruptor && G.CzInterruptor(n)); } catch (e) { return false; } }

  /** La hora de la última actividad del caso: el último mensaje, de quien sea. */
  function ultimaActividad(H) {
    var t = 0; ((H && H.mensajes) || []).forEach(function (m) { var x = Date.parse(m.created_at || m.escrito_at || ''); if (x > t) t = x; });
    return t || null;
  }
  /** «Retomamos: vas en X, falta Y, siguiente: Z». Solo con 2 h o más sin actividad. Lo arma la pantalla.
   *  V1.38 (#4 punto 8): `op.version` = la versión nueva cuando la persona acaba de actualizar; entonces sale
   *  aunque no hayan pasado 2 h (la pantalla decide que sea UNA vez por caso y por versión). */
  function retomamos(H, ahora, op) {
    var t = ultimaActividad(H); if (!t) return null;
    var h = ((ahora || Date.now()) - t) / 3600000, porVersion = !!(op && op.version) && h < 2;
    if (h < 2 && !porVersion) return null;
    var c = (H && H.caso) || {}, av = avance(H), falta = [];
    if (!av.ciudad && !av.machote && !av.pendCot && av.actual < 4) falta.push('la ciudad del proyecto');
    if (!c.cliente && !c.cliente_odoo_id) falta.push('el cliente');
    if (av.faltan && av.faltan.total && !c.disparado_at) falta.push(plural(av.faltan.total, 'punto del levantamiento', 'puntos del levantamiento') + (av.faltan.a_medias ? ' (' + av.faltan.abiertos + ' sin nada · ' + av.faltan.a_medias + ' a medias)' : ''));
    if (av.conjAb) falta.push(plural(av.conjAb, 'pregunta', 'preguntas'));
    if (av.sinDec) falta.push(plural(av.sinDec, 'concepto por palomear', 'conceptos por palomear'));
    if (av.pendCot) falta.push(plural(av.pendCot, 'pendiente', 'pendientes') + ' para cotizar en Odoo');
    return { hace: h < 24 ? 'hace ' + Math.round(h) + ' h' : 'hace ' + Math.round(h / 24) + ' d', vas: PASOS[av.actual], falta: falta, sig: av.sig ? av.sig.txt : null,
             version: porVersion ? op.version : null };
  }

  /* ── V1.40 · los rubros con su % (#4 punto 10, prototipo aprobado V1.39 · 1) ──
   * El % lo calcula el MOTOR (fts-conceptualizador, herramientas/motor/oferta-rubros.js → resumenRubros().pantalla) y
   * llega en cada respuesta en `ultima.verifica.rubros`: {total_pct, con_bom, lista:[{id, nombre, estado, porque, pct,
   * preguntas, conceptos, renglones, sin_precio}]}. Aquí NO se recalcula ni se inventa un %: si no llegó, no se pinta.
   * Lo que sí se junta aquí es QUÉ pregunta, concepto y renglón es de cada rubro (cada uno trae su `rubro`). */
  var CORTO = { 'Instalación mecánica': 'Mecánica', 'Instalación eléctrica & control': 'Eléctrica', 'Fechas tentativas': 'Fechas' };
  function corto(n) { return CORTO[n] || n; }
  /** Los rubros que mandó el motor, o null (antes del disparo no hay). */
  function rubros(H) {
    var L = [H && H.ultima, H && H.propuesta];
    for (var i = 0; i < L.length; i++) {
      var r = L[i] && L[i].verifica && L[i].verifica.rubros;
      if (r && Array.isArray(r.lista) && r.lista.length) return intOn('cierre_tarjetas') ? conAbiertas(H, r) : r;
    }
    return null;
  }
  /* V1.55 (#12 D) · un rubro no sale «cerrado» si le quedan tarjetas abiertas: sale abierto y dice cuántas. Es la misma cuenta
   * de abiertas() (no la del motor de hace una respuesta), para que la franja, el rayito y el rubro digan lo mismo. */
  function conAbiertas(H, r) {
    return Object.assign({}, r, { lista: r.lista.map(function (x) {
      var n = abiertas(H, x.id).length, y = Object.assign({}, x, { abiertas: n });
      if (y.estado === 'cerrado' && n) { y.estado = 'abierto'; y.reabierto = true; }
      return y; }) });
  }
  /* V1.45 (#4 punto 13) · los precios del machote, APARTE del avance: {con_precio, total, pct, n3, n4, alertas, sensatez}.
   * Los manda el motor en `verifica.precios` (y dentro de `verifica.rubros.precios`) cuando ya hay machote. */
  function precios(H) {
    var L = [H && H.ultima, H && H.propuesta];
    for (var i = 0; i < L.length; i++) {
      var v = L[i] && L[i].verifica, p = v && (v.precios || (v.rubros && v.rubros.precios));
      if (p && p.total) return p;
    }
    return null;
  }
  /** «Precios 46/46 (62 % referencia, 19 alertas)»: corto, para que quepa a 380 px. */
  /* V1.52 · UN solo dato: alertas, % de referencia y avance salen de CzIndicadores (copia generada de
   * fts-conceptualizador/herramientas/motor/indicadores.js), la misma cuenta que usa el mensaje del agente. */
  /* V1.52 §15 · detrás del interruptor `un_solo_dato` (lo da el servidor; cz-app.js expone G.CzInterruptor). Apagado,
   * los textos salen como en V1.51. */
  function inds() { return G.CzIndicadores && typeof G.CzInterruptor === 'function' && G.CzInterruptor('un_solo_dato') ? G.CzIndicadores : null; }
  /** Los tres números de este hilo, de la respuesta más nueva que los trae. */
  function indicadores(H) {
    var IN = inds(); if (!IN) return null;
    var v = (H && H.ultima && H.ultima.verifica) || {};
    return IN.calcular({ precios: precios(H), rubros: rubros(H), analisis: v.analisis || null, referencias: v.referencias || null });
  }
  function textoPrecios(P) {
    if (!P || !P.total) return '';
    var IN = inds(); if (IN) return IN.textoPrecios(IN.calcular({ precios: P }));
    var d = [];
    if (P.pct) d.push(Math.round(P.pct) + ' % referencia');
    if (P.n3 || P.alertas) d.push(((P.n3 || 0) + (P.alertas || 0)) + ((P.n3 || 0) + (P.alertas || 0) === 1 ? ' alerta' : ' alertas'));
    return 'Precios ' + P.con_precio + '/' + P.total + (d.length ? ' (' + d.join(', ') + ')' : '');
  }
  /** La respuesta que trae el BOM (la más nueva con BOM o machote). */
  function conBom(H) { return [H && H.ultima, H && H.propuesta].filter(function (x) { return x && ((x.bom && Object.keys(x.bom).length) || x.machote); })[0] || {}; }
  /** Lo que la pantalla tiene de UN rubro: sus preguntas (conjeturas), sus conceptos con la decisión y sus renglones. */
  function delRubro(H, id) {
    var A = (H && H.acciones) || [], U = (H && (H.propuesta || H.ultima)) || {}, B = conBom(H).bom || {};
    var dec = {}; ((H && H.eventos) || []).forEach(function (e) { if (e.concepto && (e.tipo === 'aceptar' || e.tipo === 'rechazar')) dec[e.concepto] = e; });
    var Q = A.filter(function (a) { return a.tipo === 'conjetura' && a.datos && a.datos.rubro === id; });
    var K = (U.conceptos || []).filter(function (k) { return k.rubro === id; }).map(function (k) { return { k: k, d: dec[k.id] || null }; });
    var R = [].concat((B.materiales || []).map(function (m) { return { mo: false, r: m }; }), (B.mano_obra || []).map(function (m) { return { mo: true, r: m }; }))
      .filter(function (x) { return x.r && x.r.rubro === id; });
    var nAb = intOn('cierre_tarjetas') ? abiertas(H, id).length : Q.filter(function (a) { return a.estado === 'propuesta'; }).length, sinDec = K.filter(function (x) { return !x.d; }).length;
    var sinPrecio = R.filter(function (x) { return !conPrecio(x.r.importe) && !conPrecio(x.r.pu); }).length;
    var conocido = R.reduce(function (s, x) { var v = Number(x.r.importe); return s + (isFinite(v) && conPrecio(x.r.importe) ? v : 0); }, 0);
    return { Q: Q, K: K, R: R, abiertas: nAb, sinDec: sinDec, sinPrecio: sinPrecio, conocido: conocido };
  }
  /** La línea delgada de la franja colapsada: «44 % · Siguiente: Cerrar Mecánica». Sin rubros: el paso y el siguiente
   *  de avance() (sin %). `sig` es texto; `rojo` cuando el siguiente es la ciudad. */
  function linea(H) {
    var av = avance(H), R = rubros(H), sig = av.sig ? av.sig.txt : null, rojo = !!(av.sig && (av.sig.acc === 'ciudad' || av.sig.acc === 'confirma_ciudad'));
    // Cortos, como el prototipo: que la línea quepa a 380 px. El botón de abajo dice lo largo.
    if (av.sig && av.sig.a === 'oferta') sig = 'Contestar la oferta';
    else if (av.sig && av.sig.acc === 'ciudad') sig = 'Elegir la ciudad';
    else if (av.sig && av.sig.acc === 'confirma_ciudad') sig = 'Confirmar la ciudad';
    if (!R) return { pct: null, paso: PASOS[av.actual], sig: sig, rojo: rojo, av: av, R: null };
    var c = (H && H.caso) || {}, of = av.oferta;
    // La ciudad va primero; con BOM manda el machote (avance()); antes del BOM, la oferta o el primer rubro abierto.
    if (!rojo && !R.con_bom) {
      var ab = R.lista.filter(function (r) { return r.estado === 'abierto'; })[0];
      if (!c.disparado_at && of && of.estado === 'ofrecida') sig = 'Contestar la oferta';
      else if (ab) sig = 'Cerrar ' + corto(ab.nombre);
    }
    var P = precios(H), cerr = R.lista.filter(function (r) { return r.estado === 'cerrado'; }).length;
    var I = indicadores(H);
    return { pct: I ? I.avance_pct : (typeof R.total_pct === 'number' ? R.total_pct : null), paso: PASOS[av.actual], sig: sig, rojo: rojo, av: av, R: R, I: I,
             P: P, rubrosTxt: 'Rubros ' + cerr + '/' + R.lista.length, preciosTxt: textoPrecios(P) };
  }

  G.CzAvance = { PASOS: PASOS, avance: avance, clics: clics, odooDesactualizada: odooDesactualizada, huecoDeBorrador: huecoDeBorrador, abiertas: abiertas, yaNoPide: yaNoPide, cierrePosible: cierrePosible, retomamos: retomamos, faltantes: faltantes, textoFaltantes: textoFaltantes, ultimaActividad: ultimaActividad,
                 rubros: rubros, delRubro: delRubro, linea: linea, corto: corto, precios: precios, textoPrecios: textoPrecios, indicadores: indicadores };
})(window);
