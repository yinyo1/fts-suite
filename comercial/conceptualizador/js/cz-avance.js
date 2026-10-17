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

  /** caso + hilo → el estado de cada paso, el paso en que va, y el siguiente paso (UNO). */
  function avance(H) {
    var c = (H && H.caso) || {}, A = (H && H.acciones) || [];
    var P = (H && (H.propuesta || H.ultima)) || {};
    var conRes = [H && H.ultima, H && H.propuesta].filter(function (x) { return x && ((x.bom && Object.keys(x.bom).length) || x.machote); })[0] || {};
    var f = faltantes(H);
    var conj = A.filter(function (a) { return a.tipo === 'conjetura'; });
    var conjAb = conj.filter(function (a) { return a.estado === 'propuesta'; }).length;
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
    // V1.47 (#4 Parte H) · al 100 % el siguiente paso es cerrar el análisis (solo el dueño, de forma explícita); cerrado, se dice.
    var AN = H && H.ultima && H.ultima.verifica && H.ultima.verifica.analisis;
    if (AN && AN.estado === 'listo' && (!sig || sig.acc === 'cotiza')) sig = { txt: 'Ya está todo ok, ya no muevas nada', acc: 'mandar', texto: 'Ya está todo ok, ya no muevas nada' };
    else if (AN && AN.estado === 'cerrado' && sig && sig.espera) sig = { txt: 'Análisis cerrado', espera: true };
    return { oferta: of, e: e, det: det, actual: actual, sig: sig, ciudad: ciudad, faltan: f, pendCot: pendCot, conjAb: conjAb, sinDec: sinDec, machote: cmH || null };
  }

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
      if (r && Array.isArray(r.lista) && r.lista.length) return r;
    }
    return null;
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
  var IN = G.CzIndicadores || null;
  /** Los tres números de este hilo, de la respuesta más nueva que los trae. */
  function indicadores(H) {
    if (!IN) return null;
    var v = (H && H.ultima && H.ultima.verifica) || {};
    return IN.calcular({ precios: precios(H), rubros: rubros(H), analisis: v.analisis || null, referencias: v.referencias || null });
  }
  function textoPrecios(P) {
    if (!P || !P.total) return '';
    if (IN) return IN.textoPrecios(IN.calcular({ precios: P }));
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
    var abiertas = Q.filter(function (a) { return a.estado === 'propuesta'; }).length, sinDec = K.filter(function (x) { return !x.d; }).length;
    var sinPrecio = R.filter(function (x) { return !conPrecio(x.r.importe) && !conPrecio(x.r.pu); }).length;
    var conocido = R.reduce(function (s, x) { var v = Number(x.r.importe); return s + (isFinite(v) && conPrecio(x.r.importe) ? v : 0); }, 0);
    return { Q: Q, K: K, R: R, abiertas: abiertas, sinDec: sinDec, sinPrecio: sinPrecio, conocido: conocido };
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

  G.CzAvance = { PASOS: PASOS, avance: avance, retomamos: retomamos, faltantes: faltantes, textoFaltantes: textoFaltantes, ultimaActividad: ultimaActividad,
                 rubros: rubros, delRubro: delRubro, linea: linea, corto: corto, precios: precios, textoPrecios: textoPrecios, indicadores: indicadores };
})(window);
