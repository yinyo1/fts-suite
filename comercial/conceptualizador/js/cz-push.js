/* ═══ Conceptualizador · avisos push y permisos (V1.41, #4 punto 12) ═══
 *
 * Diseño aprobado: fts-conceptualizador motor/DISENO-V135.md §1 y §2, prototipo prototipos/avisos-v135.html.
 *
 *   · Pantalla de PERMISOS al abrir por primera vez (o si alguno sigue sin decidirse, a lo más una vez por semana):
 *     cuatro tarjetas —notificaciones, micrófono, cámara, ubicación— y cada «Activar» lo toca la persona. Nada se
 *     pide al cargar: iPhone ignora un permiso sin gesto y Chrome lo marca como molesto. En iPhone sin la app en
 *     inicio, primero los 3 pasos para agregarla (sin eso no hay avisos). ⋮ › Permisos abre la misma pantalla.
 *   · SUSCRIPCIÓN: con el permiso dado, registra sw-push.js con alcance SOLO de esta carpeta, se suscribe con la
 *     llave pública que da el servidor (push_estado) y la guarda (push_alta) con su plataforma y su zona horaria
 *     (las horas de silencio 21–7 son las de ESTE teléfono). Un servidor viejo (sin la migración 0010) contesta
 *     MODO_DESCONOCIDO: no se dice nada, se reintenta cada 30 min y al volver la red.
 *   · AL TOCAR un aviso, sw-push.js abre `?caso=<id>&ver=oferta|recordatorio[&accion=cotiza|recuerda]` o, si la
 *     app ya estaba abierta, le manda un mensaje. Aquí se abre el caso y: la oferta se resalta con sus tres botones
 *     (Adelante / Editar respuesta / Esperar más, de V1.39); el recordatorio abre la hoja «Cotiza ya / Recuérdame en…»
 *     (en iPhone el aviso no lleva botones: la hoja los pone). «Cotiza ya» muestra la confirmación de siempre;
 *     NUNCA dispara solo.
 *   · ⋮ › Recordatorios (apagarlos para sí), ⋮ › No molestar (la guía), y para admins ⋮ › Avisos del equipo.
 *
 * Este archivo se carga ANTES de cz-app.js: si la página abre con ?caso=, deja el caso elegido en sessionStorage
 * (cz_sel) para que cz-app lo abra solo.
 */
(function (G) {
  'use strict';
  var D = document, N = G.navigator || {};
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var K = { visto: 'cz_permisos_visto', sus: 'cz_push_sus', mem: 'cz_permisos_mem', env: 'cz_permisos_env', nm: 'cz_no_molestar', probar: 'cz_permisos_probar' };
  var SEMANA = 7 * 24 * 3600 * 1000, REINTENTO_MS = 30 * 60 * 1000;
  var ST = { estado: 'desconocido', est: null, admin: false, perm: null, pend: null, abierta: false, reintento: null };
  function get(k) { try { return JSON.parse(G.localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function set(k, v) { try { G.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function app() { return G.CzApp || {}; }
  function C() { return G.CzCliente; }
  function toast(t) { var e = D.getElementById('toast'); if (!e) return; e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { e.classList.remove('on'); }, 3400); }

  // ── 1. ¿La página abrió desde un aviso? (antes de que cz-app lea cz_sel) ──
  try {
    var q0 = new URLSearchParams(G.location.search), c0 = q0.get('caso');
    if (c0 && UUID.test(c0)) {
      ST.pend = { caso: c0, ver: q0.get('ver') === 'recordatorio' ? 'recordatorio' : q0.get('ver') === 'oferta' ? 'oferta' : '',
                  accion: q0.get('accion') === 'cotiza' || q0.get('accion') === 'recuerda' ? q0.get('accion') : '' };
      G.sessionStorage.setItem('cz_sel', JSON.stringify({ id: c0 }));
    }
  } catch (e) {}

  // ── el teléfono ──
  function plataforma() {
    var u = N.userAgent || '';
    if (/iPhone|iPad|iPod/.test(u) || (/Macintosh/.test(u) && N.maxTouchPoints > 1)) return 'ios';
    return /Android/.test(u) ? 'android' : 'escritorio';
  }
  function enInicio() { try { return N.standalone === true || !!(G.matchMedia && G.matchMedia('(display-mode: standalone)').matches); } catch (e) { return false; } }
  function zona() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { return null; } }
  function soporta() { return 'serviceWorker' in N && 'PushManager' in G && 'Notification' in G; }
  function iphoneSinInicio() { return plataforma() === 'ios' && !enInicio(); }

  /** activo | negado | pendiente por permiso. Lo que Safari no deja consultar sale de lo que la persona activó aquí. */
  async function estados() {
    var r = { notif: 'pendiente', mic: 'pendiente', cam: 'pendiente', ubi: 'pendiente' }, mem = get(K.mem) || {};
    if ('Notification' in G) r.notif = Notification.permission === 'granted' ? 'activo' : Notification.permission === 'denied' ? 'negado' : 'pendiente';
    var P = N.permissions, L = [['mic', 'microphone'], ['cam', 'camera'], ['ubi', 'geolocation']];
    for (var i = 0; i < L.length; i++) {
      try { var s = await P.query({ name: L[i][1] }); r[L[i][0]] = s.state === 'granted' ? 'activo' : s.state === 'denied' ? 'negado' : 'pendiente'; }
      catch (e) { if (mem[L[i][0]]) r[L[i][0]] = mem[L[i][0]]; }
    }
    ST.perm = r; return r;
  }
  function recordar(k, v) { var m = get(K.mem) || {}; m[k] = v; set(K.mem, m); }

  // ── 2. la suscripción ──
  function b64aBytes(s) {
    var b = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '=';
    var x = atob(b), o = new Uint8Array(x.length); for (var i = 0; i < x.length; i++) o[i] = x.charCodeAt(i); return o;
  }
  function igual(a, b) { if (!a || !b) return false; a = new Uint8Array(a); if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
  function viejo(r) { return r && (r.error === 'MODO_DESCONOCIDO' || r.error === 'NO_PUBLICADO'); }
  function esperarActivo(reg) {
    return new Promise(function (listo) {
      if (reg.active) return listo(reg);
      var w = reg.installing || reg.waiting, fin = setTimeout(function () { listo(reg); }, 8000);
      if (!w) return listo(reg);
      w.addEventListener('statechange', function () { if (w.state === 'activated') { clearTimeout(fin); listo(reg); } });
    });
  }
  async function pedirEstado() {
    var r = await C().push('push_estado', {});
    if (r && r.ok) { ST.est = r; ST.admin = !!r.admin; }
    return r;
  }
  /** Deja este navegador suscrito y el servidor enterado. Devuelve el estado (y lo guarda en ST.estado). */
  async function asegurar() {
    var fin = function (e, extra) { ST.estado = e; ST.detalle = extra || null; programar(); return e; };
    if (!soporta()) return fin('no_soportado');
    if (iphoneSinInicio()) return fin('iphone_sin_inicio');
    if (Notification.permission !== 'granted') return fin(Notification.permission === 'denied' ? 'negado' : 'sin_permiso');
    var reg;
    try { reg = await esperarActivo(await N.serviceWorker.register('sw-push.js', { scope: './' })); }
    catch (e) { return fin('sw_fallo'); }
    var est = await pedirEstado();
    if (!est || !est.ok) return fin(viejo(est) ? 'servidor_viejo' : est && est.clase === 'red' ? 'sin_red' : 'servidor', est && est.error);
    if (!est.vapid_publica) return fin('sin_llave');
    var llave = b64aBytes(est.vapid_publica), sub = null, anterior = null;
    try {
      sub = await reg.pushManager.getSubscription();
      if (sub && !igual(sub.options && sub.options.applicationServerKey, llave)) { anterior = sub.endpoint; try { await sub.unsubscribe(); } catch (e) {} sub = null; }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llave });
    } catch (e) { return fin('sin_suscripcion', String(e && e.message || e).slice(0, 120)); }
    var j = sub.toJSON ? sub.toJSON() : sub, mem = get(K.sus) || {};
    var yaEsta = mem.endpoint === j.endpoint && mem.ok && (est.suscripciones || []).some(function (s) { return String(j.endpoint).slice(-12) === s.fin; });
    if (!yaEsta) {
      var r = await C().push('push_alta', { datos: { endpoint: j.endpoint, p256dh: j.keys && j.keys.p256dh, auth: j.keys && j.keys.auth,
        plataforma: plataforma(), en_inicio: enInicio(), zona: zona(), anterior: anterior || (mem.endpoint && mem.endpoint !== j.endpoint ? mem.endpoint : null) } });
      set(K.sus, { endpoint: j.endpoint, ok: !!(r && r.ok), at: Date.now(), error: r && !r.ok ? r.error : null });
      if (!r || !r.ok) return fin(viejo(r) ? 'servidor_viejo' : r && r.clase === 'red' ? 'sin_red' : 'servidor', r && r.error);
    }
    return fin('activo');
  }
  /** Lo que no quedó (servidor viejo, sin red, sin llave) se reintenta solo, sin avisos raros. */
  function programar() {
    clearTimeout(ST.reintento);
    if (['servidor_viejo', 'sin_red', 'servidor', 'sin_llave', 'sw_fallo', 'sin_suscripcion'].indexOf(ST.estado) >= 0)
      ST.reintento = setTimeout(function () { asegurar().catch(function () {}); }, REINTENTO_MS);
  }
  /** Al servidor van solo activo/negado/pendiente por permiso, la plataforma y si está en inicio. Una vez al día o si cambia. */
  async function mandarPermisos(extra) {
    var e = await estados(), datos = Object.assign({ plataforma: plataforma(), en_inicio: enInicio() }, e, extra || {});
    var huella = JSON.stringify(datos), prev = get(K.env) || {};
    if (!extra && prev.h === huella && Date.now() - (prev.at || 0) < 24 * 3600 * 1000) return;
    var r = await C().push('permisos', { datos: datos });
    if (r && r.ok) set(K.env, { h: huella, at: Date.now() });
  }

  // ── 3. al tocar un aviso ──
  function esperar(fn, ms) {
    return new Promise(function (listo) {
      var t0 = Date.now();
      (function vuelta() { var x = null; try { x = fn(); } catch (e) {} if (x) return listo(x); if (Date.now() - t0 > (ms || 15000)) return listo(null); setTimeout(vuelta, 150); })();
    });
  }
  async function ir(p) {
    if (!p || !p.caso || !UUID.test(p.caso)) return;
    var A = app();
    var st = A._st || {};
    if (!(st.sel && st.sel.id === p.caso) && A.abrirCaso) A.abrirCaso(p.caso);
    var h = await esperar(function () { var s = app()._st || {}; return s.hilo && s.hilo.caso && s.hilo.caso.id === p.caso ? s.hilo : null; });
    if (!h) return;
    if (p.ver === 'oferta') {
      var c = await esperar(function () { return D.querySelector('.of-carta'); }, 6000);
      if (c) { c.scrollIntoView({ block: 'center' }); c.classList.add('resalta'); setTimeout(function () { c.classList.remove('resalta'); }, 2400); }
      else toast('Esa pregunta ya se contestó.');
    } else if (p.ver === 'recordatorio') {
      if (p.accion === 'cotiza') return cotizaYa();
      if (p.accion === 'recuerda') return hojaRecuerdame(h.caso);
      hojaRecordatorio(h);
    }
  }
  function limpiarUrl() {
    try {
      var u = new URL(G.location.href); ['caso', 'ver', 'accion'].forEach(function (k) { u.searchParams.delete(k); });
      G.history.replaceState(G.history.state, '', u.pathname + (u.search || '') + u.hash);
    } catch (e) {}
  }
  function cotizaYa() { if (app().disparo) app().disparo(); }

  // ── 4. pantallas (mismo look que el prototipo aprobado) ──
  var P = {
    atras: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    campana: '<path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    camara: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    pin: '<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
    luna: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>', ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    escudo: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>', compartir: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v8h14v-8"/>',
    mas: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>', reloj: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    gente: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="10" r="2.5"/><path d="M15 15.5a4.5 4.5 0 0 1 6 3.5"/>'
  };
  function ico(n, c) { return '<svg class="ico ' + (c || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + P[n] + '</svg>'; }
  var CSS = '' +
    '.czp{position:fixed;inset:0;z-index:260;background:var(--sup,#fff);overflow-y:auto;-webkit-overflow-scrolling:touch}' +
    '.czp .czp-cab{height:var(--cab,52px);display:flex;align-items:center;gap:4px;padding:0 4px 0 6px;border-bottom:1px solid var(--linea);background:var(--sup);position:sticky;top:0;z-index:2}' +
    '.czp .czp-cab b{flex:1;min-width:0;font-size:18px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:6px}' +
    '.czp .czp-ver{font-size:10.5px;font-weight:600;color:var(--sec);border:1px solid var(--linea);border-radius:8px;padding:0 6px;line-height:16px;margin-right:8px}' +
    '.czp .czp-x{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#3b4a54;flex-shrink:0}' +
    '.czp .czp-cuerpo{width:100%;max-width:560px;margin:0 auto;padding:20px 16px calc(28px + var(--pie,0px))}' +
    '.czp h1{font-size:22px;font-weight:600;line-height:1.25;margin-bottom:6px}.czp h2{font-size:16px;font-weight:600;margin:18px 0 8px}' +
    '.czp .czp-sub{color:var(--sec);font-size:14.5px;margin-bottom:16px}.czp .czp-nota{font-size:13px;color:var(--sec);margin-top:10px}' +
    '.czp .czp-lista{display:flex;flex-direction:column;gap:10px}' +
    '.czp .czp-perm{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--linea);border-radius:14px;background:var(--sup)}' +
    '.czp .czp-perm .czp-ic{width:40px;height:40px;border-radius:50%;background:var(--sup2);display:flex;align-items:center;justify-content:center;color:var(--acento-osc);flex-shrink:0}' +
    '.czp .czp-perm .czp-tx{flex:1;min-width:0}.czp .czp-perm .czp-tx b{display:block;font-size:15px;font-weight:600}.czp .czp-perm .czp-tx span{display:block;font-size:13px;color:var(--sec)}' +
    '.czp .czp-est{font-size:13px;font-weight:600;display:flex;align-items:center;gap:4px;white-space:nowrap}.czp .czp-est.ok{color:var(--acento-osc)}.czp .czp-est.no{color:var(--rojo)}' +
    '.czp .czp-est .ico{width:18px;height:18px}.czp .czp-perm.bloq{background:var(--sup2)}.czp .czp-perm.bloq .czp-tx b{color:var(--sec)}' +
    '.czp .czp-btn{min-height:44px;padding:0 16px;border-radius:22px;font-weight:600;font-size:15px;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}' +
    '.czp .czp-btn.prim{background:var(--acento);color:#fff}.czp .czp-btn.sec{background:var(--sup2);color:var(--acento-osc)}.czp .czp-btn.lin{border:1px solid var(--linea)}' +
    '.czp .czp-btn.anch{width:100%}.czp .czp-btn:disabled{opacity:.45;cursor:default}' +
    '.czp .czp-acc{display:flex;flex-direction:column;gap:10px;margin-top:20px}' +
    '.czp .czp-link{color:var(--acento-osc);font-weight:600;min-height:44px;display:inline-flex;align-items:center}' +
    '.czp .czp-ayuda{margin-top:8px;padding:10px 12px;border-radius:10px;background:var(--aviso);font-size:13.5px}' +
    '.czp .czp-pasos{counter-reset:p;display:flex;flex-direction:column;gap:12px;margin-top:4px}' +
    '.czp .czp-paso{display:flex;gap:12px;align-items:flex-start}' +
    '.czp .czp-paso::before{counter-increment:p;content:counter(p);width:28px;height:28px;border-radius:50%;background:var(--acento);color:#fff;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}' +
    '.czp .czp-tecla{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--linea);border-radius:6px;padding:0 6px;font-size:13px;background:var(--sup2);vertical-align:middle}' +
    '.czp .czp-tecla .ico{width:16px;height:16px}' +
    '.czp .czp-pest{display:flex;gap:6px;margin-bottom:14px}.czp .czp-pest button{flex:1;min-height:44px;border-radius:22px;background:var(--sup2);font-weight:600;color:#3b4a54}' +
    '.czp .czp-pest button.on{background:var(--sale);color:#0a5c3c}' +
    '.czp .czp-limite{margin-top:14px;padding:12px;border-radius:12px;border:1px dashed var(--ter);font-size:13.5px;color:#3b4a54}' +
    '.czp .czp-aviso{margin:4px 0 14px;padding:10px 12px;border-radius:10px;background:var(--sup2);font-size:13.5px;color:#3b4a54}' +
    '.czp .czp-aj{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--linea)}' +
    '.czp .czp-aj .czp-tx{flex:1;min-width:0}.czp .czp-aj .czp-tx span{display:block;font-size:13px;color:var(--sec)}' +
    '.czp .czp-sw{width:56px;height:44px;position:relative;flex-shrink:0}' +
    '.czp .czp-sw::before{content:"";position:absolute;left:2px;right:2px;top:6px;height:32px;border-radius:16px;background:var(--acento)}' +
    '.czp .czp-sw::after{content:"";position:absolute;top:9px;left:27px;width:26px;height:26px;border-radius:50%;background:#fff;transition:left .15s}' +
    '.czp .czp-sw.off::before{background:#c8ccce}.czp .czp-sw.off::after{left:5px}' +
    '.czp .czp-eq{display:flex;flex-direction:column;gap:8px}' +
    '.czp .czp-pers{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid var(--linea);border-radius:12px}' +
    '.czp .czp-av{width:40px;height:40px;border-radius:50%;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:14px;background:var(--acento-osc)}' +
    '.czp .czp-pers .czp-tx{min-width:0}.czp .czp-pers .czp-tx b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.czp .czp-pers .czp-tx span{display:block;font-size:13px;color:var(--sec)}' +
    '.czp .czp-chip{font-size:12.5px;font-weight:600;border-radius:12px;padding:3px 10px;white-space:nowrap}' +
    '.czp .czp-chip.ok{background:var(--sale);color:#0a5c3c}.czp .czp-chip.no{background:#fde7e8;color:#a1262a}.czp .czp-chip.med{background:var(--aviso);color:#7a5a00}' +
    '.czp .czp-pers .czp-det{grid-column:2 / 4;font-size:13px;color:#3b4a54}' +
    '@media(min-width:760px){.czp .czp-pers{grid-template-columns:40px minmax(0,1fr) auto minmax(0,1.3fr)}.czp .czp-pers .czp-det{grid-column:auto}}' +
    '.czp-velo{position:fixed;inset:0;z-index:270;background:rgba(11,20,26,.45);display:flex;align-items:flex-end;justify-content:center}' +
    '.czp-hoja{width:100%;max-width:520px;background:var(--sup);border-radius:18px 18px 0 0;padding:18px 16px calc(20px + var(--pie,0px))}' +
    '@media(min-width:760px){.czp-velo{align-items:center}.czp-hoja{border-radius:18px}}' +
    '.czp-hoja h3{font-size:18px;font-weight:600;margin-bottom:4px}.czp-hoja .czp-sub{color:var(--sec);font-size:14.5px;margin-bottom:12px}' +
    '.czp-hoja .czp-nota{font-size:13px;color:var(--sec);margin-top:10px}' +
    '.czp-hoja .czp-opc{display:flex;flex-direction:column;gap:8px}' +
    '.czp-hoja .czp-opc button{min-height:48px;border-radius:12px;border:1px solid var(--linea);text-align:left;padding:0 14px;font-size:15.5px;display:flex;align-items:center;justify-content:space-between;gap:10px}' +
    '.czp-hoja .czp-opc button small{color:var(--sec);font-size:13px}' +
    '.czp-hoja .czp-fila{display:flex;gap:10px;margin-top:14px}.czp-hoja .czp-fila .czp-btn{flex:1}' +
    '.czp-hoja .czp-btn{min-height:44px;padding:0 16px;border-radius:22px;font-weight:600;font-size:15px;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap}' +
    '.czp-hoja .czp-btn.prim{background:var(--acento);color:#fff}.czp-hoja .czp-btn.lin{border:1px solid var(--linea)}' +
    '.menu .czp-estado{padding:8px 18px 4px;font-size:12.5px;color:var(--sec);line-height:1.45;max-width:300px}.menu .czp-estado b{color:var(--rojo);font-weight:600}' +
    // Con lo de V1.41 el ⋮ del chat ya no cabe en un teléfono chico: que se desplace en vez de salirse de la pantalla.
    '.menu{max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px);overflow-y:auto;overscroll-behavior:contain}';
  function estilo() { if (D.getElementById('czpCss')) return; var s = D.createElement('style'); s.id = 'czpCss'; s.textContent = CSS; D.head.appendChild(s); }
  function capa(html, titulo) {
    estilo(); cerrar();
    var v = D.createElement('div'); v.className = 'czp'; v.id = 'czPerm'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', titulo);
    v.innerHTML = '<header class="czp-cab"><button class="czp-x" type="button" data-czp="cerrar" aria-label="Volver">' + ico('atras') + '</button><b>' + esc(titulo) + '</b>' +
      '<span class="czp-ver">' + esc(app().VERSION || '') + '</span></header><main class="czp-cuerpo">' + html + '</main>';
    D.body.appendChild(v); ST.abierta = true;
    v.querySelector('[data-czp="cerrar"]').onclick = cerrar;
    return v;
  }
  function cerrar() { var v = D.getElementById('czPerm'); if (v) v.remove(); ST.abierta = false; }
  function hoja(html, aria) {
    estilo(); cerrarHoja();
    var v = D.createElement('div'); v.className = 'czp-velo'; v.id = 'czpHoja';
    v.innerHTML = '<div class="czp-hoja" role="dialog" aria-label="' + esc(aria) + '">' + html + '</div>';
    v.onclick = function (e) { if (e.target === v) cerrarHoja(); };
    D.body.appendChild(v); return v;
  }
  function cerrarHoja() { var v = D.getElementById('czpHoja'); if (v) v.remove(); }

  var PERM = [
    { k: 'notif', ic: 'campana', t: 'Notificaciones', d: 'Para avisarte cuando tenga lista una pregunta para ti y recordarte los levantamientos sin cotizar.' },
    { k: 'mic', ic: 'mic', t: 'Micrófono', d: 'Para las notas de voz.' },
    { k: 'cam', ic: 'camara', t: 'Cámara y fotos', d: 'Para las fotos del levantamiento.' },
    { k: 'ubi', ic: 'pin', t: 'Ubicación', d: 'Solo para proponer la ciudad del proyecto. No guarda tus coordenadas.' }
  ];
  function lineaAvisos() {
    var e = ST.estado;
    return e === 'activo' ? 'Avisos: activos en este teléfono.' :
      e === 'servidor_viejo' ? 'Avisos: se encienden cuando se actualice el servidor. No tienes que hacer nada.' :
      e === 'sin_llave' ? 'Avisos: se encienden cuando el servidor tenga su llave. No tienes que hacer nada.' :
      e === 'sin_red' ? 'Avisos: sin conexión; lo intento solo al volver la red.' :
      e === 'no_soportado' ? 'Este navegador no recibe avisos. En el teléfono, usa Chrome (Android) o la app en inicio (iPhone).' :
      e === 'servidor' || e === 'sw_fallo' || e === 'sin_suscripcion' ? 'Avisos: no se pudieron dejar listos; lo intento solo más tarde.' : '';
  }
  function filaPermiso(p, e) {
    var bloq = p.k === 'notif' && (iphoneSinInicio() || !('Notification' in G));
    var der = e === 'activo' ? '<span class="czp-est ok">' + ico('ok') + 'Activo</span>'
      : e === 'negado' ? '<span class="czp-est no">Bloqueado</span>'
      : '<button class="czp-btn sec" type="button" data-activar="' + p.k + '"' + (bloq ? ' disabled' : '') + '>Activar</button>';
    var ios = plataforma() === 'ios';
    var extra = e === 'negado' ? '<div class="czp-ayuda">' + (ios
        ? 'Lo bloqueaste. Para volver a pedirlo: Ajustes › Safari › ' + (p.k === 'mic' ? 'Micrófono' : p.k === 'cam' ? 'Cámara' : p.k === 'ubi' ? 'Ubicación' : 'Notificaciones') + ' › Preguntar.'
        : 'Lo bloqueaste. Para volver a pedirlo: toca el candado junto a la dirección › Permisos › ' + esc(p.t) + ' › Permitir.') + '</div>'
      : bloq && iphoneSinInicio() ? '<div class="czp-ayuda">En iPhone, las notificaciones solo funcionan con la app en la pantalla de inicio. Agrégala primero (arriba).</div>'
      : bloq ? '<div class="czp-ayuda">Este navegador no tiene notificaciones.</div>' : '';
    return '<div><div class="czp-perm' + (bloq ? ' bloq' : '') + '" data-perm="' + p.k + '"><span class="czp-ic">' + ico(p.ic) + '</span><span class="czp-tx"><b>' + esc(p.t) + '</b><span>' + esc(p.d) + '</span></span>' + der + '</div>' + extra + '</div>';
  }
  /** La pantalla de permisos. `auto` = la abrió la app al arrancar (no la persona desde ⋮). */
  async function abrirPermisos(auto) {
    var e = await estados(), n = 0; for (var k in e) if (e[k] === 'activo') n++;
    var ios = iphoneSinInicio(), la = lineaAvisos();
    var html = (ios ? '<h1>Primero, ponla en tu pantalla de inicio</h1><p class="czp-sub">En iPhone los avisos solo llegan si la app está en la pantalla de inicio (iOS 16.4 o más nuevo). Toma 20 segundos:</p>' +
        '<div class="czp-pasos"><div class="czp-paso"><span>Toca <span class="czp-tecla">' + ico('compartir') + 'Compartir</span> abajo en Safari.</span></div>' +
        '<div class="czp-paso"><span>Baja y toca <b>Agregar a inicio</b> <span class="czp-tecla">' + ico('mas') + '</span>.</span></div>' +
        '<div class="czp-paso"><span>Toca <b>Agregar</b> y abre el Conceptualizador <b>desde el ícono nuevo</b>, no desde Safari (ahí vuelves a entrar con tu usuario).</span></div></div>' +
        '<div class="czp-acc"><button class="czp-btn prim anch" type="button" data-czp="ya-inicio">Ya la agregué</button><button class="czp-link" type="button" data-czp="seguir">Seguir sin avisos por ahora</button></div>' +
        '<h2>Los demás permisos</h2>'
      : '<h1>' + (auto ? 'Antes de empezar' : 'Permisos') + '</h1><p class="czp-sub">Para trabajar desde el teléfono necesito cuatro permisos. Cada uno se activa cuando tú lo tocas. Si alguno no lo das, la app sigue funcionando sin esa parte.</p>') +
      (la && e.notif === 'activo' ? '<p class="czp-aviso" data-czp-estado>' + esc(la) + '</p>' : '') +
      '<div class="czp-lista">' + PERM.map(function (p) { return filaPermiso(p, e[p.k]); }).join('') + '</div>' +
      (ios ? '' : '<div class="czp-acc"><button class="czp-btn prim anch" type="button" data-czp="seguir">' + (n === 4 ? 'Listo, empezar' : 'Seguir (' + n + ' de 4 activos)') + '</button>' +
        '<button class="czp-link" type="button" data-czp="no-molestar">Que los avisos pasen el «No molestar»</button></div>') +
      '<p class="czp-nota">Puedes revisarlos cuando quieras en ⋮ › Permisos.</p>';
    var v = capa(html, auto ? 'Conceptualizador' : 'Permisos');
    Array.prototype.forEach.call(v.querySelectorAll('[data-activar]'), function (b) { b.onclick = function () { activar(b.dataset.activar, b, auto); }; });
    var on = function (s, fn) { var x = v.querySelector('[data-czp="' + s + '"]'); if (x) x.onclick = fn; };
    on('seguir', function () { set(K.visto, { at: Date.now() }); cerrar(); if (n < 4) toast('Puedes activarlos después en ⋮ › Permisos.'); mandarPermisos().catch(function () {}); });
    on('ya-inicio', function () { set(K.visto, { at: Date.now() }); toast('Ahora ábrela desde el ícono nuevo.'); });
    on('no-molestar', function () { abrirNoMolestar(); });
  }
  /** Cada «Activar» es un gesto de la persona: es el ÚNICO lugar donde se pide un permiso. */
  async function activar(k, b, auto) {
    if (b) { b.disabled = true; b.textContent = 'Pidiendo…'; }
    try {
      if (k === 'notif') {
        var r = await Notification.requestPermission();
        if (r === 'granted') { await asegurar(); }
      } else if (k === 'mic' || k === 'cam') {
        try { var s = await N.mediaDevices.getUserMedia(k === 'mic' ? { audio: true } : { video: true }); s.getTracks().forEach(function (t) { t.stop(); }); recordar(k, 'activo'); }
        catch (e) { recordar(k, e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'negado' : 'pendiente'); }
      } else if (k === 'ubi') {
        // Solo se pide el permiso: las coordenadas no se leen ni salen del teléfono (V1.34).
        await new Promise(function (listo) {
          if (!N.geolocation) return listo();
          N.geolocation.getCurrentPosition(function () { recordar('ubi', 'activo'); listo(); },
            function (e) { recordar('ubi', e && e.code === 1 ? 'negado' : 'pendiente'); listo(); }, { timeout: 15000, maximumAge: 600000 });
        });
      }
    } catch (e) {}
    mandarPermisos({}).catch(function () {});
    if (ST.abierta) abrirPermisos(auto);
  }
  function abrirNoMolestar(tel) {
    var a = (tel || (plataforma() === 'ios' ? 'iphone' : 'android')) !== 'iphone';
    var v = capa('<h1>Que los avisos pasen el «No molestar»</h1><p class="czp-sub">Esto lo cambia el teléfono, no la app. Es una vez.</p>' +
      '<div class="czp-pest" role="tablist"><button type="button" data-tel="android" class="' + (a ? 'on' : '') + '">Android</button><button type="button" data-tel="iphone" class="' + (a ? '' : 'on') + '">iPhone</button></div>' +
      (a ? '<div class="czp-pasos"><div class="czp-paso"><span>Abre <b>Ajustes › Notificaciones › No molestar</b>.</span></div>' +
             '<div class="czp-paso"><span>Toca <b>Apps</b> (o «Excepciones») › <b>Agregar apps</b>.</span></div>' +
             '<div class="czp-paso"><span>Elige <b>Conceptualizador</b> si aparece como app; si no, <b>Chrome</b>.</span></div></div>'
         : '<div class="czp-pasos"><div class="czp-paso"><span>Abre <b>Ajustes › Concentración › No molestar</b> (y lo mismo en «Trabajo» si lo usas).</span></div>' +
             '<div class="czp-paso"><span>En <b>Apps permitidas</b>, toca <b>Agregar</b>.</span></div>' +
             '<div class="czp-paso"><span>Elige <b>Conceptualizador</b> (aparece si la agregaste a inicio).</span></div></div>') +
      '<div class="czp-acc"><button class="czp-btn prim anch" type="button" data-czp="hecho">Listo, ya lo hice</button><button class="czp-link" type="button" data-czp="luego">Ahora no</button></div>' +
      '<div class="czp-limite"><b>Lo que la app no puede hacer:</b> saltarse el «No molestar» por su cuenta, como una alarma. Eso solo lo hacen las apps nativas con un permiso especial. Si no agregas la excepción, el aviso llega en silencio y lo ves al desbloquear.' +
      (a ? '' : ' Que el modo Concentración deje pasar una app web agregada a inicio está pendiente de probar en un iPhone real.') + '</div>', 'No molestar');
    Array.prototype.forEach.call(v.querySelectorAll('[data-tel]'), function (b) { b.onclick = function () { abrirNoMolestar(b.dataset.tel); }; });
    v.querySelector('[data-czp="hecho"]').onclick = function () { set(K.nm, { at: Date.now() }); mandarPermisos({ no_molestar: true }).catch(function () {}); toast('Gracias. Queda anotado.'); cerrar(); };
    v.querySelector('[data-czp="luego"]').onclick = cerrar;
  }
  async function abrirRecordatorios() {
    var est = ST.est && ST.est.ajustes ? ST.est : null;
    if (!est) { var r = await pedirEstado(); if (!r || !r.ok) { toast(viejo(r) ? 'Esto se activa cuando se actualice el servidor.' : 'Sin conexión. Se reintenta solo.'); return; } est = r; }
    var a = est.ajustes || { recordatorios: true, avisos: true }, tope = est.recordar_tope || 3, s = est.silencio || { desde: 21, hasta: 7 };
    var sw = function (k, on, et) { return '<button type="button" class="czp-sw' + (on ? '' : ' off') + '" data-sw="' + k + '" role="switch" aria-checked="' + !!on + '" aria-label="' + esc(et) + '"></button>'; };
    var v = capa('<h1>Recordatorios y avisos</h1>' +
      '<div class="czp-aj"><span class="czp-tx"><b>Recordarme levantamientos sin cotizar</b><span>Si una sesión tiene fotos, audios o PDFs, no dijiste «Cotiza» y lleva 30 min sin mensajes.</span></span>' + sw('recordatorios', a.recordatorios, 'Recordatorios') + '</div>' +
      '<div class="czp-aj"><span class="czp-tx"><b>Avisarme cuando te pregunte algo</b><span>Por ejemplo, «¿puedo ir buscando precios…?» cuando no estás en la app.</span></span>' + sw('avisos', a.avisos, 'Avisos') + '</div>' +
      '<div class="czp-aj"><span class="czp-tx"><b>Máximo ' + esc(tope) + ' por sesión</b><span>Después del tercer aviso ya no insisto en esa sesión.</span></span></div>' +
      '<div class="czp-aj"><span class="czp-tx"><b>Nunca entre las ' + esc(s.desde) + ':00 y las ' + esc(s.hasta) + ':00</b><span>En la hora de este teléfono. Lo que llegue de noche sale a las ' + esc(s.hasta) + ':00.</span></span></div>' +
      '<div class="czp-aj"><span class="czp-tx"><b>Nunca en</b><span>sesiones archivadas, cerradas o marcadas como prueba.</span></span></div>' +
      '<p class="czp-nota">Cada quien lo apaga para sí; no cambia nada para los demás.</p>', 'Recordatorios');
    Array.prototype.forEach.call(v.querySelectorAll('[data-sw]'), function (b) {
      b.onclick = async function () {
        var k = b.dataset.sw, nuevo = b.classList.contains('off'), datos = {}; datos[k] = nuevo; b.disabled = true;
        var r = await C().push('push_ajustes', { datos: datos }); b.disabled = false;
        if (r && r.ok) { b.classList.toggle('off', !nuevo); b.setAttribute('aria-checked', String(nuevo)); if (ST.est) ST.est.ajustes = r.ajustes; }
        else toast(viejo(r) ? 'Esto se activa cuando se actualice el servidor.' : 'No se guardó. Intenta de nuevo.');
      };
    });
  }
  function iniciales(a) { var p = String(a || '').split(/[.\s_-]+/).filter(Boolean); return ((p[0] || '?')[0] + ((p[1] || '')[0] || '')).toUpperCase(); }
  function nombre(a) { return String(a || '').split('.').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); }
  function fecha(t) { if (!t) return ''; var d = new Date(t); return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }); }
  async function abrirEquipo() {
    var r = await C().push('equipo_avisos', {});
    if (!r || !r.ok) return toast(viejo(r) ? 'Esto se activa cuando se actualice el servidor.' : r && r.error === 'SOLO_ADMIN' ? 'Solo Esteban ve los avisos del equipo.' : 'Sin conexión. Se reintenta solo.');
    var PL = { android: 'Android', ios: 'iPhone', escritorio: 'Computadora' };
    var filas = (r.equipo || []).map(function (p) {
      var s = (p.suscripciones || [])[0], pe = p.permisos || {}, ch, det;
      if (!s || pe.notif === 'negado') { ch = ['no', 'No le llegan']; det = pe.notif === 'negado' ? 'Bloqueó las notificaciones en su teléfono' : pe.plataforma === 'ios' && pe.en_inicio === false ? 'iPhone · NO la agregó a inicio: Safari no deja mandarle avisos' : 'No ha activado los avisos'; }
      else if (s.ultimo_error && !s.ultima_ok_at) { ch = ['no', 'No le llegan']; det = (PL[s.plataforma] || s.plataforma) + ' · último intento falló'; }
      else if (!pe.no_molestar_at) { ch = ['med', 'Avisos: en silencio']; det = (PL[s.plataforma] || s.plataforma) + (s.en_inicio ? ' · en inicio' : '') + ' · sin excepción de «No molestar»'; }
      else { ch = ['ok', 'Avisos: sí']; det = (PL[s.plataforma] || s.plataforma) + (p.ultimo_aviso_at ? ' · último aviso entregado ' + fecha(p.ultimo_aviso_at) : ''); }
      if (p.ultimo_fallo && ch[0] !== 'no') det += ' · ' + p.ultimo_fallo;
      return '<div class="czp-pers"><span class="czp-av">' + esc(iniciales(p.actor)) + '</span><span class="czp-tx"><b>' + esc(nombre(p.actor)) + '</b><span>' + esc(s && s.zona || '') + '</span></span>' +
        '<span class="czp-chip ' + ch[0] + '">' + esc(ch[1]) + '</span><span class="czp-det">' + esc(det) + '</span></div>';
    }).join('');
    capa('<h1>¿A quién le llegan los avisos?</h1><p class="czp-sub">Lo dice cada teléfono al abrir la app. Solo se guarda «activo o no» y el tipo de teléfono; nada más del aparato.</p>' +
      '<div class="czp-eq">' + (filas || '<p class="czp-nota">Nadie ha abierto la versión con avisos todavía.</p>') + '</div>' +
      '<p class="czp-nota">«En silencio» = tiene avisos pero no dijo «Listo, ya lo hice» en la guía de No molestar. Respaldo por WhatsApp: diseño en fts-suite#328, no construido.</p>', 'Avisos del equipo');
  }
  /** iPhone (sin botones en el aviso) o tocar el aviso de recordatorio: la hoja con los dos botones. */
  function hojaRecordatorio(h) {
    var c = h.caso || {}, adj = Array.isArray(h.adjuntos) ? h.adjuntos : [], cuenta = function (cl) { return adj.filter(function (a) { return a && a.clase === cl; }).length; };
    var partes = [], f = cuenta('foto'), au = cuenta('audio'), pd = cuenta('pdf');
    if (f) partes.push(f + (f === 1 ? ' foto' : ' fotos')); if (au) partes.push(au + (au === 1 ? ' nota de voz' : ' notas de voz')); if (pd) partes.push(pd + ' PDF');
    var v = hoja('<h3>' + esc(c.titulo || 'Levantamiento') + '</h3><p class="czp-sub">' + (partes.length ? 'Tiene ' + esc(partes.join(', ')) + ' y no' : 'No') + ' has dicho «Cotiza».</p>' +
      '<div class="czp-fila"><button class="czp-btn prim" type="button" data-czp="cotiza">Cotiza ya</button><button class="czp-btn lin" type="button" data-czp="recuerda">Recuérdame en…</button></div>' +
      '<p class="czp-nota">«Cotiza ya» te pide confirmar; nunca arranca solo.</p>', 'Levantamiento sin cotizar');
    v.querySelector('[data-czp="cotiza"]').onclick = function () { cerrarHoja(); cotizaYa(); };
    v.querySelector('[data-czp="recuerda"]').onclick = function () { hojaRecuerdame(c); };
  }
  function hojaRecuerdame(c) {
    var ahora = new Date(), hh = function (m) { var d = new Date(ahora.getTime() + m * 60000); return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }); };
    var v = hoja('<h3>Recuérdame en…</h3><p class="czp-sub">' + esc(c.titulo || '') + '</p><div class="czp-opc">' +
      '<button type="button" data-en="30">30 minutos <small>' + hh(30) + '</small></button><button type="button" data-en="60">1 hora <small>' + hh(60) + '</small></button>' +
      '<button type="button" data-en="120">2 horas <small>' + hh(120) + '</small></button><button type="button" data-en="manana">Mañana a las 9:00</button></div>' +
      '<div class="czp-fila"><button class="czp-btn lin" type="button" data-en="nunca">No me recuerdes esta sesión</button></div>', 'Recuérdame en');
    Array.prototype.forEach.call(v.querySelectorAll('[data-en]'), function (b) {
      b.onclick = async function () {
        var en = b.dataset.en; b.disabled = true;
        var r = await C().push('recordar', { caso_id: c.id, datos: { en: en } });
        cerrarHoja();
        if (!r || !r.ok) return toast(viejo(r) ? 'Esto se activa cuando se actualice el servidor.' : r && r.mensaje ? r.mensaje : 'No se guardó. Intenta de nuevo.');
        toast(en === 'nunca' ? 'No te recuerdo más esta sesión.' : en === 'manana' ? 'Te lo recuerdo mañana a las 9:00.' : 'Te lo recuerdo en ' + (en === '30' ? '30 minutos' : en === '60' ? '1 hora' : '2 horas') + '.');
      };
    });
  }

  // ── 5. ⋮ ──
  var NOM = { notif: 'Notificaciones', mic: 'Micrófono', cam: 'Cámara', ubi: 'Ubicación' };
  function lineaEstado() {
    var e = ST.perm; if (!e) return '';
    return '<div class="czp-estado">' + Object.keys(NOM).map(function (k) {
      // Notificaciones (plural), Cámara y Ubicación (femenino), Micrófono (masculino).
      var fin = k === 'notif' ? 'as' : k === 'mic' ? 'o' : 'a';
      var t = NOM[k] + ': ' + (e[k] === 'activo' ? 'activ' + fin : e[k] === 'negado' ? 'bloquead' + fin : 'sin decidir');
      return e[k] === 'negado' ? '<b>' + esc(t) + '</b>' : esc(t);
    }).join(' · ') + '</div>';
  }
  /** Lo que cz-app pone en sus menús ⋮ (lista y chat). Los data-a llevan el prefijo push: y regresan a accion(). */
  function menuHtml(donde) {
    estilo();
    var b = function (a, ic, t, sub) { return '<button data-a="push:' + a + '">' + ico(ic, 's') + '<span>' + esc(t) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></button>'; };
    if (donde === 'chat') return b('permisos', 'escudo', 'Permisos y avisos', 'Notificaciones, micrófono, cámara, ubicación');
    return b('permisos', 'escudo', 'Permisos') + b('recordatorios', 'reloj', 'Recordatorios') + b('no-molestar', 'luna', 'No molestar') +
      (ST.admin ? b('equipo', 'gente', 'Avisos del equipo') : '') + lineaEstado();
  }
  function accion(a) {
    if (a === 'permisos') return abrirPermisos(false);
    if (a === 'recordatorios') return abrirRecordatorios();
    if (a === 'no-molestar') return abrirNoMolestar();
    if (a === 'equipo') return abrirEquipo();
  }

  /** Después de CzApp.arrancar: lo del aviso que abrió la página, la pantalla de permisos si toca, y la suscripción. */
  async function iniciar() {
    var p = ST.pend; ST.pend = null;
    if ('serviceWorker' in N) N.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.tipo === 'cz-abrir') ir(e.data); });
    G.addEventListener('online', function () { if (ST.estado !== 'activo') asegurar().catch(function () {}); });
    var e = await estados();
    if (p) { limpiarUrl(); ir(p); }
    else {
      // Los navegadores de prueba (webdriver) no la ven al arrancar, salvo que la prueba lo pida: no dan permisos.
      var robot = N.webdriver === true && G.localStorage.getItem(K.probar) !== '1';
      var visto = get(K.visto), algoPend = Object.keys(e).some(function (k) { return e[k] === 'pendiente'; });
      if (!robot && (!visto || (algoPend && Date.now() - (visto.at || 0) > SEMANA))) abrirPermisos(true);
    }
    if (e.notif === 'activo') await asegurar().catch(function () {});
    else if (soporta() || 'Notification' in G) await pedirEstado().catch(function () {});
    mandarPermisos().catch(function () {});
  }

  G.CzPush = { iniciar: iniciar, abrirPermisos: abrirPermisos, asegurar: asegurar, estados: estados, ir: ir, menuHtml: menuHtml, accion: accion,
               hojaRecordatorio: hojaRecordatorio, _st: ST, _plataforma: plataforma };
})(window);
