/* ═══ Conceptualizador · Revisar la cotización por voz desde la vista ejecutiva (V1.63g, `voz_visor_v163g`) ═══
 *
 * Prototipo aprobado: comercial/prototipos/voz-visor/ (fts-conceptualizador#12, Esteban 25-oct 23:10 y 23:40 CST y 26-oct con
 * «🌐 General»). Aquí va con datos y envío REALES:
 *  · micrófono fijo en la vista ejecutiva, con los gestos de WhatsApp: mantener = grabar, deslizar ↑ = bloquear, ■ = terminar;
 *  · contador a la izquierda del micrófono con la lista de la ráfaga (duración, hora, secciones que veía; oír y borrar);
 *  · línea guía fija al 45 % del alto, tocar un renglón o sección lo fija como objetivo, «🌐 General» lo vuelve toda la
 *    cotización, y cada segundo queda en la línea de tiempo de la nota ({t, sec, ren, txt, fuente: guia|toque|general});
 *  · cada nota y sus pedazos se guardan en IndexedDB MIENTRAS se graba (cada segundo): una pestaña que se cierra no pierde nada;
 *  · «Enviar N notas» manda la ráfaga como UN mensaje con sus N audios por la cola de siempre (CzCola) y `datos.rafaga` con la
 *    línea de tiempo; la base (db/048) la guarda y encola UN trabajo;
 *  · la tarjeta «Esto entendí» (acción `voz_entendi` del motor) se pinta aquí y en el chat con `tarjeta()`: generales arriba con
 *    cuánto mueven el total, por renglón abajo, cómo se ligó cada cambio, lo dudoso NUNCA marcado (D138), aprobar todo o lo marcado.
 *
 * Apagado el interruptor, la vista no monta nada y la base ignora `datos.rafaga`.
 *
 * API:
 *   CzVozVista.montar({ el, caso, idioma, cola })   · el = contenedor con scroll de la vista (#cz-vista); idioma 'es'|'en'
 *   CzVozVista.desmontar()
 *   CzVozVista.hilo(H, { resolver })                · con cada hilo nuevo: la tarjeta vigente y si la ráfaga sigue esperando
 *   CzVozVista.tarjeta(accion, { resolver, puede, idioma }) → html  ·  CzVozVista.enlazar(nodo, { resolver })
 *   CzVozVista.ligar(ctx, dur) (pura) · el objetivo que manda en cada segundo, para las pruebas y para el motor
 */
(function (G) {
  'use strict';
  var T = {
    es: { listo: 'Mantén para grabar · desliza ↑ para bloquear', suelta: 'Suelta para guardar · ↑ bloquear', bloq: 'Bloqueado · haz scroll y habla · toca ■ para terminar',
      tocaHint: 'Toca un renglón para fijarlo', corta: 'Muy corta: mantén el micrófono mientras hablas', guardada: function (d) { return 'Nota guardada (' + d + ')'; },
      cortada: function (d) { return 'El navegador cortó una grabación: guardé lo que había (' + d + ')'; },
      sinMic: 'No pude abrir el micrófono. Permítelo en la configuración del navegador.', lista: 'Notas de esta ráfaga', vacia: 'Todavía no hay notas.',
      oir: 'Oír', borrar: 'Borrar', borrarQ: '¿Borrar esta nota?', cerrar: 'Cerrar', viendo: 'Viendo', cortadaTag: 'la cortó el navegador · se guardó', notas: 'Notas',
      enviar: function (n) { return n ? 'Enviar ' + n + (n === 1 ? ' nota' : ' notas') : 'Enviar notas'; },
      confirmar: function (n) { return '¿Enviar ' + (n === 1 ? 'la nota' : 'las ' + n + ' notas juntas') + ' en un solo trabajo?'; },
      enCola: function (n) { return 'Enviada' + (n === 1 ? ' 1 nota' : 's ' + n + ' notas') + ' · esperando «Esto entendí»'; },
      noEnvio: 'No se pudo poner en la cola: tus notas siguen aquí.', guia: 'guía', general: '🌐 General', generalLbl: 'General · toda la cotización',
      entendi: 'Esto entendí', entendiSub: function (n, m) { return 'De ' + n + (n === 1 ? ' nota' : ' notas') + ', ' + m + (m === 1 ? ' cambio' : ' cambios') + '. Nada se aplica hasta que lo apruebes.'; },
      bloqGen: 'Cambios generales', bloqRen: 'Cambios por renglón', mueveTotal: function (m) { return 'mueve el total ' + m; },
      ligaToque: '👆 Ligado: lo tocaste', ligaNombre: '🗣 Ligado: lo nombraste en el audio', ligaNombreGen: '🗣 Ligado: lo nombraste en el audio (estabas en General)',
      ligaGeneral: '🌐 Ligado: General (aplica a toda la cotización)', ligaGuia: '📍 Ligado: estaba en la línea guía',
      dudosa: 'Dudoso — no se aplica', dudosaP: 'Oí: ', dudosaQ: '¿Qué quisiste decir?', oirOrigen: function (k, s) { return '▶ Nota ' + k + ' en ' + s; },
      aprobarTodo: 'Aprobar todo', aplicarSel: 'Aplicar lo marcado', rechazar: 'Rechazar todo', nada: 'No marcaste nada.',
      hecha: function (a, m) { return '✓ Aprobaste ' + a + ' de ' + m + '. El agente los aplica en UNA versión nueva del machote y la orden en borrador, como tu decisión 🔒.'; },
      rechazada: 'Rechazado: no cambió nada.', verTarjeta: function (m) { return '📝 Esto entendí · ' + m + (m === 1 ? ' cambio' : ' cambios'); },
      general1: 'General' },
    en: { listo: 'Hold to record · slide ↑ to lock', suelta: 'Release to save · ↑ lock', bloq: 'Locked · scroll and talk · tap ■ to finish',
      tocaHint: 'Tap a line to target it', corta: 'Too short: hold the mic while you talk', guardada: function (d) { return 'Note saved (' + d + ')'; },
      cortada: function (d) { return 'The browser cut a recording: I kept what it had (' + d + ')'; },
      sinMic: 'I could not open the microphone. Allow it in the browser settings.', lista: 'Notes in this burst', vacia: 'No notes yet.',
      oir: 'Play', borrar: 'Delete', borrarQ: 'Delete this note?', cerrar: 'Close', viendo: 'Viewing', cortadaTag: 'cut by the browser · kept', notas: 'Notes',
      enviar: function (n) { return n ? 'Send ' + n + (n === 1 ? ' note' : ' notes') : 'Send notes'; },
      confirmar: function (n) { return 'Send ' + (n === 1 ? 'the note' : 'the ' + n + ' notes together') + ' in one job?'; },
      enCola: function (n) { return 'Sent ' + n + (n === 1 ? ' note' : ' notes') + ' · waiting for «What I understood»'; },
      noEnvio: 'Could not queue it: your notes are still here.', guia: 'guide', general: '🌐 General', generalLbl: 'General · the whole quote',
      entendi: 'What I understood', entendiSub: function (n, m) { return 'From ' + n + (n === 1 ? ' note' : ' notes') + ', ' + m + (m === 1 ? ' change' : ' changes') + '. Nothing is applied until you approve.'; },
      bloqGen: 'General changes', bloqRen: 'Line changes', mueveTotal: function (m) { return 'moves the total ' + m; },
      ligaToque: '👆 Linked: you tapped it', ligaNombre: '🗣 Linked: you named it in the audio', ligaNombreGen: '🗣 Linked: you named it in the audio (you were in General)',
      ligaGeneral: '🌐 Linked: General (applies to the whole quote)', ligaGuia: '📍 Linked: it was on the guide line',
      dudosa: 'Unclear — not applied', dudosaP: 'I heard: ', dudosaQ: 'What did you mean?', oirOrigen: function (k, s) { return '▶ Note ' + k + ' at ' + s; },
      aprobarTodo: 'Approve all', aplicarSel: 'Apply selected', rechazar: 'Reject all', nada: 'Nothing selected.',
      hecha: function (a, m) { return '✓ You approved ' + a + ' of ' + m + '. The agent applies them in ONE new version of the machote and the draft order, as your decision 🔒.'; },
      rechazada: 'Rejected: nothing changed.', verTarjeta: function (m) { return '📝 What I understood · ' + m + (m === 1 ? ' change' : ' changes'); },
      general1: 'General' }
  };
  var L = 'es', t = function (k) { return (T[L] || T.es)[k]; }, tl = function (lang, k) { return (T[lang] || T.es)[k]; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var dur = function (s) { s = Math.max(0, Math.round(Number(s) || 0)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); };
  var hora = function (ms) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };
  var dinero = function (n, mon) { var v = Math.abs(Number(n) || 0); return (Number(n) < 0 ? '−' : Number(n) > 0 ? '+' : '') + '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 }) + (mon ? ' ' + mon : ''); };

  /* ═══ Pura: qué objetivo manda en el segundo s de una nota. Prioridad de la línea de tiempo: la última marca (toque o General)
   *     manda hasta la siguiente; sin marca, la línea guía. La ligadura con lo NOMBRADO en el audio la hace el motor. ═══ */
  function ligar(ctx, s) {
    var u = null; (ctx || []).forEach(function (c) { if (Number(c.t) <= s) u = c; });   // cada cambio de objetivo o de fuente es un renglón
    if (!u) return null;
    return u.fuente === 'general' ? { general: true, fuente: 'general', t: u.t } : { sec: u.sec, ren: u.ren, txt: u.txt, fuente: u.fuente, t: u.t };
  }

  /* ═══ IndexedDB propio: notas (con su línea de tiempo) y sus pedazos de audio ═══ */
  var DB = null;
  function abrirDB() {
    return new Promise(function (ok) {
      if (DB) return ok(DB);
      try {
        var r = indexedDB.open('cz-vozvista', 1);
        r.onupgradeneeded = function () { var d = r.result; if (!d.objectStoreNames.contains('notas')) d.createObjectStore('notas', { keyPath: 'id' }); if (!d.objectStoreNames.contains('partes')) d.createObjectStore('partes', { autoIncrement: true }).createIndex('nota', 'nota'); };
        r.onsuccess = function () { DB = r.result; ok(DB); }; r.onerror = function () { ok(null); };
      } catch (e) { ok(null); }
    });
  }
  function tx(st, modo) { return DB.transaction(st, modo || 'readonly'); }
  function poner(st, v) { return new Promise(function (ok) { if (!DB) return ok(); try { var q = tx(st, 'readwrite').objectStore(st).put(v); q.onsuccess = q.onerror = function () { ok(); }; } catch (e) { ok(); } }); }
  function todas() { return new Promise(function (ok) { if (!DB) return ok([]); var q = tx('notas').objectStore('notas').getAll(); q.onsuccess = function () { ok(q.result || []); }; q.onerror = function () { ok([]); }; }); }
  function partesDe(id) { return new Promise(function (ok) { if (!DB) return ok([]); var q = tx('partes').objectStore('partes').index('nota').getAll(id); q.onsuccess = function () { ok((q.result || []).map(function (p) { return p.blob; })); }; q.onerror = function () { ok([]); }; }); }
  function borrarNota(id) {
    return new Promise(function (ok) { if (!DB) return ok(); var x = tx(['notas', 'partes'], 'readwrite'); x.objectStore('notas').delete(id);
      var ix = x.objectStore('partes').index('nota').openCursor(IDBKeyRange.only(id)); ix.onsuccess = function () { var c = ix.result; if (c) { c.delete(); c.continue(); } };
      x.oncomplete = x.onerror = function () { ok(); }; });
  }

  /* ═══ Estado ═══ */
  var S = { el: null, caso: null, cola: null, notas: [], enviadas: [], espera: null, accion: null, resolver: null, montado: false };
  var R = null, apretado = false, guiaAct = null, objAct = null, sonando = null;
  var $ = function (id) { return document.getElementById(id); };
  var deCaso = function (n) { return S.caso && n.caso_id === S.caso.id; };

  function css() {
    if ($('czvv-css')) return;
    var s = document.createElement('style'); s.id = 'czvv-css';
    s.textContent = [
      '.czvv-barra{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));pointer-events:none;background:linear-gradient(to top,rgba(240,242,245,.97) 70%,rgba(240,242,245,0))}',
      '.czvv-in{max-width:880px;margin:0 auto;display:flex;align-items:center;gap:10px;pointer-events:auto}',
      '.czvv-estado{flex:1;min-width:0;font-size:13.5px;color:#54656f;line-height:1.25;max-height:2.6em;overflow:hidden}.czvv-estado.rec{color:#e53935;font-weight:600}',
      '.czvv-enviar{height:44px;border-radius:22px;background:#00a884;color:#fff;font-weight:600;padding:0 16px;white-space:nowrap;border:0;box-shadow:0 1px 3px rgba(11,20,26,.2)}.czvv-enviar:disabled{background:#b9c4c9}',
      '.czvv-cuenta{min-width:64px;height:44px;border-radius:22px;background:#fff;border:0;box-shadow:0 1px 3px rgba(11,20,26,.2);font-weight:600;font-size:16px;padding:0 12px}.czvv-cuenta:disabled{opacity:.45}',
      '.czvv-mic{width:60px;height:60px;border-radius:50%;background:#00a884;color:#fff;display:grid;place-items:center;flex-shrink:0;border:0;box-shadow:0 2px 6px rgba(11,20,26,.3);touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;position:relative}',
      '.czvv-mic svg{width:28px;height:28px;stroke:#fff;fill:none;stroke-width:2}.czvv-mic.rec{background:#e53935;transform:scale(1.12)}.czvv-mic.bloq{background:#e53935}',
      '.czvv-mic.bloq .ic-mic{display:none}.czvv-mic:not(.bloq) .ic-stop{display:none}',
      '.czvv-candado{position:absolute;bottom:72px;left:50%;transform:translateX(-50%);width:40px;height:84px;border-radius:20px;background:#fff;box-shadow:0 1px 4px rgba(11,20,26,.25);display:none;flex-direction:column;align-items:center;justify-content:space-between;padding:8px 0;color:#54656f;font-size:18px}',
      '.czvv-mic.rec .czvv-candado{display:flex}.czvv-mic.bloq .czvv-candado{display:none}',
      'html.czvv-grabando .czvv-enviar{display:none}',
      '.czvv-punto{display:inline-block;width:9px;height:9px;border-radius:50%;background:#e53935;margin-right:6px;animation:czvvl 1s infinite}@keyframes czvvl{50%{opacity:.25}}',
      '.czvv-guia{outline:2px dashed #e0a100!important;outline-offset:-2px;background:#fffbea!important}',
      '.czvv-obj{outline:3px solid #00a884!important;outline-offset:-3px;background:#e7f6ee!important}',
      '.czvv-linea{position:fixed;left:0;right:0;top:45vh;height:0;border-top:2px dashed rgba(224,161,0,.55);z-index:2147482990;pointer-events:none;opacity:.45}',
      'html.czvv-grabando .czvv-linea{opacity:1;border-top-color:#e0a100}',
      '.czvv-linea span{position:absolute;right:8px;top:-11px;background:#e0a100;color:#fff;font-size:11px;font-weight:600;padding:1px 7px;border-radius:9px}',
      '.czvv-tag{position:fixed;right:16px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:2147483001;max-width:min(78vw,520px);background:#111b21;color:#fff;font-size:13.5px;border-radius:16px;box-shadow:0 2px 6px rgba(11,20,26,.3);display:none;align-items:center;gap:8px;padding:4px 4px 4px 12px}',
      'html.czvv-grabando .czvv-tag{display:flex}.czvv-tag.toque{background:#008069}.czvv-tag.general{background:#4527a0}',
      '.czvv-tag .ot{flex:1;min-width:0;line-height:1.3;max-height:2.7em;overflow:hidden}',
      '.czvv-tag button{flex-shrink:0;height:32px;padding:0 10px;border-radius:16px;border:0;background:rgba(255,255,255,.18);color:#fff;font-size:13px;font-weight:600;white-space:nowrap}.czvv-tag button[aria-pressed="true"]{background:#fff;color:#4527a0}',
      '@media(min-width:900px){.czvv-tag{right:calc(50% - 440px + 16px)}}',
      '.czvv-velo{position:fixed;inset:0;background:rgba(11,20,26,.45);z-index:2147483002;display:none}.czvv-velo.on{display:block}',
      '.czvv-hoja{position:fixed;left:0;right:0;bottom:0;z-index:2147483003;background:#fff;border-radius:16px 16px 0 0;max-height:82vh;overflow:auto;padding:14px 16px calc(16px + env(safe-area-inset-bottom,0px));transform:translateY(105%);transition:transform .2s;max-width:880px;margin:0 auto;color:#111b21}',
      '.czvv-hoja.on{transform:none}.czvv-hoja h3{margin:4px 0 10px;font-size:17px;display:flex;justify-content:space-between;align-items:center}',
      '.czvv-nota{border:1px solid #e3e6e8;border-radius:12px;padding:10px 12px;margin-bottom:8px;display:flex;gap:10px;align-items:center}.czvv-nota .d{flex:1;min-width:0}.czvv-nota small{display:block;color:#54656f;font-size:12.5px}.czvv-nota em{font-style:normal;color:#b26a00;font-size:12.5px}',
      '.czvv-ico{width:40px;height:40px;border-radius:50%;background:#f0f2f5;border:0;display:grid;place-items:center;flex-shrink:0;font-size:16px}',
      '.czvv-toast{position:fixed;left:50%;bottom:calc(92px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:#323739;color:#fff;font-size:14px;padding:10px 16px;border-radius:10px;z-index:2147483004;opacity:0;transition:opacity .2s;pointer-events:none;max-width:calc(100vw - 32px);text-align:center}.czvv-toast.on{opacity:1}',
      '.czvv-ver{height:44px;border-radius:22px;border:2px solid #00a884;background:#fff;color:#008069;font-weight:600;padding:0 14px;white-space:nowrap}',
      /* la tarjeta (vista y chat) */
      '.czvv-ent{background:#fff;border:2px solid #00a884;border-radius:14px;padding:14px 16px;color:#111b21}.czvv-ent h4{margin:0 0 4px;font-size:16px}.czvv-ent>p{margin:0 0 8px;color:#54656f;font-size:13.5px}',
      '.czvv-bloque{margin:12px 0 4px;font-size:13px;font-weight:700;color:#54656f;text-transform:uppercase;letter-spacing:.03em;display:flex;justify-content:space-between;gap:8px}.czvv-bloque{flex-wrap:wrap}.czvv-bloque span{text-transform:none;letter-spacing:0;font-weight:600;color:#111b21;white-space:nowrap}',
      '.czvv-cam{border-top:1px solid #e3e6e8;padding:10px 0;display:flex;gap:10px;align-items:flex-start}.czvv-cam input{width:20px;height:20px;margin-top:2px;accent-color:#00a884;flex-shrink:0}',
      '.czvv-cam .d{flex:1;min-width:0}.czvv-cam .d small{display:block}.czvv-cam .mov{white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:600}',
      '.czvv-liga{display:inline-block;margin-top:3px;font-size:12.5px;color:#54656f}.czvv-cam.conf .czvv-liga{color:#b26a00;font-weight:600}',
      '.czvv-dud{background:#fff4e0;border-radius:10px;padding:10px;margin:6px 0}.czvv-dud b{color:#b26a00}',
      '.czvv-oir{color:#1b6fd8;font-size:13px;margin-top:4px;background:none;border:0;padding:0}',
      '.czvv-acc{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.czvv-acc button{height:42px;border-radius:21px;padding:0 16px;font-weight:600;border:1px solid #00a884;color:#008069;background:#fff}.czvv-acc button.fuerte{background:#00a884;color:#fff}',
      '.czvv-hecho{margin-top:10px;padding:10px 12px;border-radius:10px;background:#e7f6ee;font-size:14px}',
      '#cz-vista.czvv-con{padding-bottom:120px}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ═══ Lo que hay en pantalla: los renglones y secciones de la vista ejecutiva (cz-vista.js, data-nivel + data-k) ═══ */
  function infoDe(x) {
    var n = x && x.closest ? x.closest('[data-nivel]') : null; if (!n) return null;
    var sec = n.getAttribute('data-nivel') === 'seccion' ? n : n.closest('[data-nivel="seccion"]');
    var txtSec = sec ? (sec.querySelector(':scope>.vz-fila .vz-nom b') || {}).textContent : '';
    if (n.getAttribute('data-nivel') === 'renglon') {
      var d = n.querySelector(':scope>.vz-fila .vz-nom .d'), dt = '';
      if (d) { var c = d.cloneNode(true); [].slice.call(c.querySelectorAll('.vz-badge,[class*="niv"],[class*="chip"]')).forEach(function (x) { x.remove(); }); dt = c.textContent; }
      return { sec: sec ? sec.getAttribute('data-k') : null, ren: n.getAttribute('data-k'), txt: String(dt || '').replace(/^\s*N[0-5]\s*/, '').trim().slice(0, 160), stxt: String(txtSec || '').replace(/\s*✓\s*$/, '').trim() };
    }
    return { sec: sec ? sec.getAttribute('data-k') : null, ren: null, txt: String(txtSec || '').replace(/\s*✓\s*$/, '').trim().slice(0, 160), stxt: String(txtSec || '').trim() };
  }
  function centro() {
    var y = Math.round(innerHeight * 0.45), e = document.elementFromPoint(Math.round(innerWidth / 2), y);
    if (!e || !S.el || !S.el.contains(e)) return { sec: null, ren: null, txt: '' };
    return infoDe(e) || { sec: null, ren: null, txt: '' };
  }
  function filaDe(o) {
    if (!S.el || !o || o.general) return null;
    var k = o.ren || o.sec; if (!k) return null;
    var n = S.el.querySelector('[data-nivel][data-k="' + (G.CSS && CSS.escape ? CSS.escape(k) : k) + '"]');
    return n ? n.querySelector(':scope>.vz-fila') : null;
  }
  function marcarGuia() {
    var c = centro(), el = R && R.toque ? null : filaDe(c);
    if (guiaAct !== el) { if (guiaAct) guiaAct.classList.remove('czvv-guia'); if (el) el.classList.add('czvv-guia'); guiaAct = el; }
    if (guiaAct && !guiaAct.isConnected) guiaAct = null;
    var ob = R && R.toque && !R.toque.general ? filaDe(R.toque) : null;   // la vista se repinta: el objetivo se vuelve a marcar
    if (objAct !== ob) { if (objAct) objAct.classList.remove('czvv-obj'); if (ob) ob.classList.add('czvv-obj'); objAct = ob; }
    pintarObjetivo(); return c;
  }
  function objetivo() { return R && R.toque ? R.toque : centro(); }
  function objetivoTxt(o) { return o ? (o.general ? t('generalLbl') : o.txt || o.stxt || '—') : '—'; }
  function pintarObjetivo() {
    var e = $('czvvTag'); if (!e) return; var b = $('czvvGen'); b.textContent = t('general');
    if (!R) { $('czvvObj').textContent = ''; return; }
    var o = objetivo(), gen = !!(R.toque && R.toque.general); e.className = 'czvv-tag' + (gen ? ' general' : R.toque ? ' toque' : '');
    b.setAttribute('aria-pressed', gen ? 'true' : 'false');
    var s = objetivoTxt(o); if (s.length > 60) s = s.slice(0, 59) + '…';
    $('czvvObj').textContent = (gen ? '' : '🎯 ') + s + (R.toque ? '' : ' · ' + t('guia'));
  }
  function registrar(fuente) {
    if (!R) return; var o = objetivo(), s = Math.round((performance.now() - R.t0) / 1000), u = R.nota.ctx[R.nota.ctx.length - 1];
    var sec = o.general ? null : o.sec || null, ren = o.general ? null : o.ren || null;
    if (!u || u.sec !== sec || u.ren !== ren || u.fuente !== fuente) R.nota.ctx.push({ t: s, sec: sec, ren: ren, txt: o.general ? null : (o.txt || null), fuente: fuente });
  }
  function toast(m) { var e = $('czvvToast'); if (!e) return; e.textContent = m; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { e.classList.remove('on'); }, 3200); }

  /* ═══ Grabación ═══ */
  async function empezar(y0) {
    if (R) return;
    var stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { toast(t('sinMic')); return; }
    var tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].filter(function (m) { return G.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m); })[0] || '';
    var rec; try { rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : {}); } catch (e) { stream.getTracks().forEach(function (x) { x.stop(); }); toast(t('sinMic')); return; }
    var nota = { id: 'n-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), caso_id: S.caso.id, inicio: Date.now(), dur: 0, mime: rec.mimeType || tipo || 'audio/webm', ctx: [], estado: 'grabando' };
    R = { rec: rec, stream: stream, nota: nota, t0: performance.now(), bloq: false, y0: y0 };
    rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) poner('partes', { nota: nota.id, blob: ev.data }); };
    rec.onerror = function () { terminar('cortada'); };
    stream.getAudioTracks().forEach(function (tr) { tr.onended = function () { if (R) terminar('cortada'); }; });
    rec.start(1000);
    await poner('notas', nota);
    try { if (navigator.wakeLock) R.wake = await navigator.wakeLock.request('screen'); } catch (e) { /* sin wake lock se graba igual */ }
    var c0 = centro(); nota.ctx.push({ t: 0, sec: c0.sec, ren: c0.ren, txt: c0.txt || null, fuente: 'guia' });   // cada grabación empieza en la línea guía
    R.tick = setInterval(function () {
      if (!R) return; marcarGuia(); registrar(R.toque ? (R.toque.general ? 'general' : 'toque') : 'guia');
      nota.dur = (performance.now() - R.t0) / 1000; poner('notas', nota); pintarEstado();
    }, 1000);
    $('czvvMic').classList.add('rec'); document.documentElement.classList.add('czvv-grabando'); pintarObjetivo(); pintarEstado();
    if (!apretado && !R.bloq) terminar('lista');
  }
  function terminar(como) {
    if (!R) return; var r = R; R = null; clearInterval(r.tick);
    r.nota.dur = (performance.now() - r.t0) / 1000;
    var mic = $('czvvMic'); if (mic) mic.classList.remove('rec', 'bloq');
    document.documentElement.classList.remove('czvv-grabando');
    if (objAct) { objAct.classList.remove('czvv-obj'); objAct = null; }
    setTimeout(marcarGuia, 0);
    try { if (r.wake) r.wake.release(); } catch (e) { /* nada */ }
    var cerrar = function () {
      r.stream.getTracks().forEach(function (x) { x.stop(); });
      if (como !== 'cortada' && r.nota.dur < 0.8) { borrarNota(r.nota.id).then(recargar); toast(t('corta')); return; }
      r.nota.estado = como === 'cortada' ? 'cortada' : 'lista';
      poner('notas', r.nota).then(recargar);
      toast(como === 'cortada' ? t('cortada')(dur(r.nota.dur)) : t('guardada')(dur(r.nota.dur)));
    };
    if (r.rec.state !== 'inactive') { r.rec.onstop = function () { setTimeout(cerrar, 50); }; try { r.rec.stop(); } catch (e) { cerrar(); } } else cerrar();
    pintarBarra();
  }
  async function recargar() {
    var ns = await todas();
    S.notas = ns.filter(function (n) { return deCaso(n) && !n.enviada; }).sort(function (a, b) { return a.inicio - b.inicio; });
    S.enviadas = ns.filter(function (n) { return deCaso(n) && n.enviada; });
    // Lo enviado hace más de 2 días se limpia (la cola y la base ya tienen el audio).
    ns.filter(function (n) { return n.enviada && Date.now() - n.enviada > 2 * 864e5; }).forEach(function (n) { borrarNota(n.id); });
    pintarBarra();
  }
  function pintarEstado() {
    var e = $('czvvEstado'); if (!e) return;
    if (!R) { e.className = 'czvv-estado'; e.textContent = S.espera ? t('enCola')(S.espera.n) : S.notas.length ? '' : t('listo'); return; }
    e.className = 'czvv-estado rec';
    e.innerHTML = '<span class="czvv-punto"></span>' + dur((performance.now() - R.t0) / 1000) + ' · ' + esc(R.bloq ? t('bloq') + ' · ' + t('tocaHint') : t('suelta'));
  }
  function pintarBarra() {
    var n = S.notas.length, b = $('czvvCuenta'); if (!b) return;
    b.textContent = '🎤 ' + n; b.disabled = !n; b.setAttribute('aria-label', t('notas') + ': ' + n);
    var e = $('czvvEnviar'); e.textContent = t('enviar')(n); e.disabled = !n || !!R;
    var v = $('czvvVer'), a = S.accion;
    v.hidden = !(a && a.estado === 'propuesta'); if (a) v.textContent = t('verTarjeta')(((a.datos || {}).cambios || []).length);
    $('czvvMic').setAttribute('aria-label', L === 'en' ? 'Hold to record' : 'Mantén para grabar');
    pintarEstado();
  }

  /* ═══ Lista de la ráfaga ═══ */
  function secsDe(n) { var v = []; (n.ctx || []).forEach(function (c) { var x = c.fuente === 'general' ? t('general') : c.txt ? (c.fuente === 'toque' ? '🎯 ' : '') + (c.txt.length > 48 ? c.txt.slice(0, 47) + '…' : c.txt) : null; if (x && v.indexOf(x) < 0) v.push(x); }); return v; }
  function abrirHoja(html) { var h = $('czvvHoja'); h.innerHTML = html; $('czvvVelo').classList.add('on'); h.classList.add('on'); var c = $('czvvCerrarH'); if (c) c.onclick = cerrarHoja; return h; }
  function cerrarHoja() { $('czvvVelo').classList.remove('on'); $('czvvHoja').classList.remove('on'); if (sonando) { sonando.pause(); sonando = null; } }
  function abrirLista() {
    var h = abrirHoja('<h3>' + esc(t('lista')) + ' <button type="button" id="czvvCerrarH" class="czvv-ico" aria-label="' + esc(t('cerrar')) + '">✕</button></h3>' +
      (S.notas.length ? S.notas.map(function (n, i) {
        return '<div class="czvv-nota" data-id="' + esc(n.id) + '"><button type="button" class="czvv-ico oirN" aria-label="' + esc(t('oir')) + '">▶</button><div class="d"><b>' + (i + 1) + ' · ' + dur(n.dur) + '</b> · ' + hora(n.inicio) +
          (n.estado === 'cortada' ? ' <em>· ' + esc(t('cortadaTag')) + '</em>' : '') + '<small>' + esc(t('viendo')) + ': ' + esc(secsDe(n).join(' → ') || '—') + '</small></div>' +
          '<button type="button" class="czvv-ico borrN" aria-label="' + esc(t('borrar')) + '">🗑</button></div>';
      }).join('') : '<p>' + esc(t('vacia')) + '</p>'));
    h.querySelectorAll('.oirN').forEach(function (b) { b.onclick = function () { oir(b.closest('.czvv-nota').getAttribute('data-id'), 0, b); }; });
    h.querySelectorAll('.borrN').forEach(function (b) { b.onclick = async function () { if (!confirm(t('borrarQ'))) return; await borrarNota(b.closest('.czvv-nota').getAttribute('data-id')); await recargar(); abrirLista(); }; });
  }
  async function oir(id, desde, boton) {
    if (sonando) { var era = sonando._id; sonando.pause(); sonando = null; if (boton) boton.textContent = '▶'; if (era === id && !desde) return; }
    var n = S.notas.concat(S.enviadas).filter(function (x) { return x.id === id; })[0]; if (!n) return;
    var a = new Audio(URL.createObjectURL(new Blob(await partesDe(id), { type: n.mime })));
    a._id = id; sonando = a; try { a.currentTime = desde || 0; } catch (e) { /* algunos webm no dejan saltar antes de cargar */ }
    a.play().catch(function () {});
    if (boton) { boton.textContent = '■'; a.onended = function () { boton.textContent = '▶'; sonando = null; }; }
  }

  /* ═══ Enviar la ráfaga: UN mensaje con sus N audios por la cola de siempre + datos.rafaga ═══ */
  async function enviar() {
    var lote = S.notas.slice(); if (!lote.length || R || !S.cola) return;
    if (!confirm(t('confirmar')(lote.length))) return;
    $('czvvEnviar').disabled = true;
    try {
      var archivos = [], notas = [];
      for (var i = 0; i < lote.length; i++) {
        var n = lote[i], blob = new Blob(await partesDe(n.id), { type: n.mime }), ext = /mp4/.test(n.mime) ? 'm4a' : /ogg/.test(n.mime) ? 'ogg' : 'webm';
        archivos.push({ nombre: 'nota-' + (i + 1) + '-' + new Date(n.inicio).toISOString().slice(0, 19).replace(/[:T]/g, '') + '.' + ext, mime: n.mime.split(';')[0], clase: 'audio', bytes: blob.size, duracion_s: Math.round(n.dur * 10) / 10, blob: blob });
        notas.push({ dur: Math.round(n.dur * 10) / 10, inicio: n.inicio, cortada: n.estado === 'cortada', ctx: n.ctx.slice(0, 1200) });
      }
      var it = await S.cola.encolar({ caso_id: S.caso.id }, '', archivos, lote[0].inicio, { rafaga: { v: 1, origen: 'vista', idioma: L, notas: notas } });
      for (var j = 0; j < lote.length; j++) { lote[j].enviada = Date.now(); lote[j].cliente_id = it && it.cliente_id; await poner('notas', lote[j]); }
      S.espera = { n: lote.length, at: Date.now(), cliente_id: it && it.cliente_id };
      await recargar();
    } catch (e) { toast(t('noEnvio')); pintarBarra(); }
  }

  /* ═══ La tarjeta «Esto entendí» (vista y chat) ═══ */
  function liga(c, lang) {
    return c.confirmar ? '⚠ ' + String(c.confirmar).replace(/^⚠\s*/, '') : tl(lang, { toque: 'ligaToque', nombre: 'ligaNombre', nombreGen: 'ligaNombreGen', general: 'ligaGeneral', guia: 'ligaGuia' }[c.liga] || 'ligaGuia');
  }
  function tarjeta(a, o) {
    o = o || {}; var lang = o.idioma === 'en' ? 'en' : (o.idioma || L) === 'en' ? 'en' : 'es';
    var d = a.datos || {}, cam = Array.isArray(d.cambios) ? d.cambios : [], dud = Array.isArray(d.dudosas) ? d.dudosas : [], r = a.resultado || {}, mon = d.moneda || '';
    var gen = cam.filter(function (c) { return c.general; }), ren = cam.filter(function (c) { return !c.general; });
    var suma = function (L2) { return L2.reduce(function (s, c) { return s + (Number(c.mueve) || 0); }, 0); };
    var abierta = a.estado === 'propuesta' && o.puede !== false;
    var fila = function (c) {
      var chk = abierta ? '<input type="checkbox" data-czvv-c="' + esc(c.id) + '"' + (c.confirmar ? '' : ' checked') + '>' : '';
      return '<label class="czvv-cam' + (c.confirmar ? ' conf' : '') + '">' + chk + '<div class="d"><b>' + esc(c.general ? tl(lang, 'general1') : (c.seccion || '')) + '</b>' +
        (c.renglon ? ' · ' + esc(c.renglon) : '') + ' · ' + esc(c.que || '') + '<small class="czvv-liga">' + esc(liga(c, lang)) + '</small>' +
        (c.nota ? '<small><button type="button" class="czvv-oir" data-czvv-oir="' + esc(c.nota) + ':' + (Number(c.t) || 0) + '">' + esc(tl(lang, 'oirOrigen')(c.nota, dur(c.t))) + '</button></small>' : '') + '</div>' +
        '<div class="mov">' + (Number(c.mueve) ? esc(dinero(c.mueve, '')) : '—') + '</div></label>';
    };
    var h = '<div class="czvv-ent" data-czvv-a="' + esc(a.id) + '"><h4>📝 ' + esc(tl(lang, 'entendi')) + '</h4><p>' + esc(tl(lang, 'entendiSub')(Number(d.notas) || 1, cam.length)) + '</p>';
    if (gen.length) h += '<div class="czvv-bloque">' + esc(tl(lang, 'bloqGen')) + ' <span>' + esc(tl(lang, 'mueveTotal')(dinero(suma(gen), mon))) + '</span></div>' + gen.map(fila).join('');
    if (ren.length) h += '<div class="czvv-bloque">' + esc(tl(lang, 'bloqRen')) + ' <span>' + esc(tl(lang, 'mueveTotal')(dinero(suma(ren), mon))) + '</span></div>' + ren.map(fila).join('');
    h += dud.map(function (x) {   // D138: lo dudoso se pregunta con la frase literal y NUNCA se aplica
      return '<div class="czvv-dud"><b>' + esc(tl(lang, 'dudosa')) + '</b><br>' + esc(tl(lang, 'dudosaP')) + '«' + esc(x.frase || '') + '»<br>' + esc(tl(lang, 'dudosaQ')) +
        (x.nota ? '<br><button type="button" class="czvv-oir" data-czvv-oir="' + esc(x.nota) + ':' + (Number(x.t) || 0) + '">' + esc(tl(lang, 'oirOrigen')(x.nota, dur(x.t))) + '</button>' : '') + '</div>';
    }).join('');
    if (abierta && cam.length) h += '<div class="czvv-acc"><button type="button" class="fuerte" data-czvv-hacer="todo">' + esc(tl(lang, 'aprobarTodo')) + '</button><button type="button" data-czvv-hacer="sel">' + esc(tl(lang, 'aplicarSel')) +
      '</button><button type="button" data-czvv-hacer="no">' + esc(tl(lang, 'rechazar')) + '</button></div>';
    else if (a.estado === 'hecha') h += '<div class="czvv-hecho">' + esc(tl(lang, 'hecha')((r.aprobados || []).length, cam.length)) + '</div>';
    else if (a.estado === 'descartada') h += '<div class="czvv-hecho">' + esc(tl(lang, 'rechazada')) + '</div>';
    return h + '</div>';
  }
  /** Los botones de la tarjeta, donde esté pintada. resolver(id, decision, resultado, boton) es el de cz-app (C.accion). */
  function enlazar(nodo, o) {
    if (!nodo || nodo._czvv) return; nodo._czvv = true;
    nodo.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-czvv-hacer],[data-czvv-oir]') : null; if (!b) return;
      var card = b.closest('[data-czvv-a]'); if (!card) return;
      e.preventDefault();
      if (b.hasAttribute('data-czvv-oir')) { var p = b.getAttribute('data-czvv-oir').split(':'); oirOrigen(card.getAttribute('data-czvv-a'), Number(p[0]), Number(p[1])); return; }
      var todos = [].slice.call(card.querySelectorAll('[data-czvv-c]')).map(function (i) { return i.getAttribute('data-czvv-c'); });
      var que = b.getAttribute('data-czvv-hacer'), ap = que === 'todo' ? todos : que === 'sel' ? [].slice.call(card.querySelectorAll('[data-czvv-c]:checked')).map(function (i) { return i.getAttribute('data-czvv-c'); }) : [];
      if (que === 'sel' && !ap.length) { toast(t('nada')); return; }
      var res = { aprobados: ap, rechazados: todos.filter(function (x) { return ap.indexOf(x) < 0; }), via: 'vista_voz' };
      res.texto = que === 'no' ? 'Rechazó todo lo que entendió el agente' : 'Aprobó ' + ap.length + ' de ' + todos.length;
      var fn = (o && o.resolver) || S.resolver; if (typeof fn !== 'function') return;
      card.querySelectorAll('button,input').forEach(function (x) { x.disabled = true; });
      Promise.resolve(fn(card.getAttribute('data-czvv-a'), que === 'no' ? 'descartada' : 'hecha', res, b)).then(function (ok) {
        if (ok === false) card.querySelectorAll('button,input').forEach(function (x) { x.disabled = false; }); else if ($('czvvHoja') && $('czvvHoja').contains(card)) cerrarHoja();
      });
    });
  }
  // «▶ Nota k en m:ss»: el audio local de esa nota (la ráfaga se guarda 2 días en el teléfono que la grabó).
  function oirOrigen(accionId, k, s) {
    var a = S.accion && String(S.accion.id) === String(accionId) ? S.accion : null, ini = a && a.datos && a.datos.notas_inicio ? a.datos.notas_inicio[k - 1] : null;
    var n = ini ? S.enviadas.filter(function (x) { return x.inicio === ini; })[0] : null;
    if (n) oir(n.id, s); else toast(L === 'en' ? 'That note is only on the phone that recorded it.' : 'Esa nota solo está en el teléfono que la grabó.');
  }
  function verTarjeta() {
    if (!S.accion) return;
    var h = abrirHoja('<h3>&nbsp;<button type="button" id="czvvCerrarH" class="czvv-ico" aria-label="' + esc(t('cerrar')) + '">✕</button></h3>' + tarjeta(S.accion, { idioma: L }));
    enlazar(h, { resolver: S.resolver });
  }

  /* ═══ Montar en la vista ejecutiva ═══ */
  function onScroll() { if (onScroll.p) return; onScroll.p = true; requestAnimationFrame(function () { onScroll.p = false; marcarGuia(); }); }
  function onToque(e) {
    if (!R || !S.el || !S.el.contains(e.target)) return;
    var b = e.target.closest ? e.target.closest('.vz-fila') : null; if (!b) return;
    var n = b.closest('[data-nivel]'); if (!n) return;
    e.preventDefault(); e.stopPropagation();   // tocar no abre ni cierra nada mientras graba
    var o = infoDe(b); if (!o) return;
    if (n.getAttribute('data-nivel') === 'grupo') o = { sec: o.sec, ren: null, txt: o.stxt };
    if (R.toque && !R.toque.general && R.toque.sec === o.sec && R.toque.ren === o.ren) { R.toque = null; registrar('guia'); }
    else { R.toque = o; registrar('toque'); if (navigator.vibrate) navigator.vibrate(15); }
    marcarGuia(); poner('notas', R.nota);
  }
  function montar(o) {
    if (!o || !o.el || !o.caso || !o.caso.id) return;
    if (S.montado) desmontar();
    css(); L = o.idioma === 'en' ? 'en' : 'es';
    S.el = o.el; S.caso = o.caso; S.cola = o.cola || G.CzCola || null; S.resolver = o.resolver || S.resolver; S.montado = true;
    S.el.classList.add('czvv-con');
    var w = document.createElement('div'); w.id = 'czvv';
    w.innerHTML = '<div class="czvv-barra"><div class="czvv-in"><div class="czvv-estado" id="czvvEstado"></div>' +
      '<button type="button" class="czvv-ver" id="czvvVer" hidden></button>' +
      '<button type="button" class="czvv-enviar" id="czvvEnviar" disabled></button>' +
      '<button type="button" class="czvv-cuenta" id="czvvCuenta" disabled>🎤 0</button>' +
      '<button type="button" class="czvv-mic" id="czvvMic"><span class="czvv-candado" aria-hidden="true"><span>🔒</span><span>⌃</span></span>' +
      '<svg class="ic-mic" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/></svg>' +
      '<svg class="ic-stop" viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="#fff"/></svg></button></div></div>' +
      '<div class="czvv-linea" aria-hidden="true"><span>' + esc(t('guia')) + '</span></div>' +
      '<div class="czvv-tag" id="czvvTag"><span class="ot" id="czvvObj" aria-live="polite"></span><button type="button" id="czvvGen" aria-pressed="false"></button></div>' +
      '<div class="czvv-velo" id="czvvVelo"></div><div class="czvv-hoja" id="czvvHoja" role="dialog" aria-modal="true"></div><div class="czvv-toast" id="czvvToast"></div>';
    document.body.appendChild(w);
    var mic = $('czvvMic');
    mic.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    mic.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (R && R.bloq) { terminar('lista'); return; }
      try { mic.setPointerCapture(e.pointerId); } catch (er) { /* nada */ }
      apretado = true; empezar(e.clientY);
    });
    mic.addEventListener('pointermove', function (e) { if (!R || R.bloq) return; if (R.y0 - e.clientY > 70) { R.bloq = true; mic.classList.add('bloq'); pintarEstado(); if (navigator.vibrate) navigator.vibrate(20); } });
    mic.addEventListener('pointerup', function () { apretado = false; if (!R || R.bloq) return; terminar('lista'); });
    mic.addEventListener('pointercancel', function () { apretado = false; if (R && !R.bloq) terminar('lista'); });
    $('czvvGen').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation(); if (!R) return;
      if (R.toque && R.toque.general) { R.toque = null; registrar('guia'); } else { R.toque = { general: true }; registrar('general'); if (navigator.vibrate) navigator.vibrate(15); }
      marcarGuia(); poner('notas', R.nota);
    });
    $('czvvCuenta').onclick = abrirLista; $('czvvVelo').onclick = cerrarHoja; $('czvvEnviar').onclick = enviar; $('czvvVer').onclick = verTarjeta;
    S.el.addEventListener('scroll', onScroll, { passive: true }); G.addEventListener('resize', onScroll);
    document.addEventListener('click', onToque, true);
    G.addEventListener('pagehide', pagehide);
    abrirDB().then(async function () {
      // Lo que quedó grabándose cuando se cerró la pestaña se recupera como «cortada».
      var ns = await todas();
      for (var i = 0; i < ns.length; i++) if (ns[i].estado === 'grabando' && !ns[i].enviada) { ns[i].estado = 'cortada'; await poner('notas', ns[i]); }
      await recargar(); marcarGuia();
    });
    pintarBarra();
  }
  function pagehide() { if (R) { R.nota.estado = 'cortada'; R.nota.dur = (performance.now() - R.t0) / 1000; poner('notas', R.nota); } }
  function desmontar() {
    if (R) terminar('lista');
    if (S.el) { S.el.removeEventListener('scroll', onScroll); S.el.classList.remove('czvv-con'); }
    G.removeEventListener('resize', onScroll); document.removeEventListener('click', onToque, true); G.removeEventListener('pagehide', pagehide);
    var w = $('czvv'); if (w) w.remove();
    if (guiaAct) guiaAct.classList.remove('czvv-guia'); guiaAct = null; objAct = null;
    S.el = null; S.montado = false;
  }
  /** Con cada hilo nuevo: la tarjeta vigente de la ráfaga y si sigue esperando. */
  function hilo(H, o) {
    if (o && o.resolver) S.resolver = o.resolver;
    var A = ((H && H.acciones) || []).filter(function (a) { return a.tipo === 'voz_entendi'; });
    var ult = A.length ? A[A.length - 1] : null;
    if (ult && S.espera && new Date(ult.created_at || ult.at || 0).getTime() >= S.espera.at - 60000) S.espera = null;
    S.accion = ult; if (S.montado) pintarBarra();
  }

  G.CzVozVista = { montar: montar, desmontar: desmontar, hilo: hilo, tarjeta: tarjeta, enlazar: enlazar, ligar: ligar, montado: function () { return S.montado; } };
})(window);
