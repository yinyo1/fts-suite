/* ═══════════════════════════════════════════════════════════
   FTS Suite — Auth Module
   Extraído de FTS_DC3/index.html (producción)
   Expone: window.FTSAuth = { login, logout, session, role }
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const MASTER_USER = 'ftsmaster';
  const MASTER_PASS = 'FTS#DC3!2026';

  const BASE_RAW = 'https://raw.githubusercontent.com/yinyo1/fts-suite/main/';
  const USERS_URL = BASE_RAW + 'seguridad/data/users.json';
  const USERS_API = 'https://api.github.com/repos/yinyo1/fts-suite/contents/seguridad/data/users.json';

  let authCache = null;
  let _loggedUser = null;
  let isMasterSession = false;

  /* ── Fetch users ── */
  async function fetchAuthUsers() {
    if (authCache) return authCache;
    let arr = null;

    try {
      const bust = Date.now() + '_' + Math.random().toString(36).slice(2);
      const res = await fetch(USERS_URL + '?t=' + bust, {
        cache: 'no-store',
        headers: { 'Pragma': 'no-cache' }
      });
      if (res.ok) {
        const parsed = await res.json();
        arr = parsed.users || parsed;
      }
    } catch (e) {
      console.warn('users raw falló, intentando API:', e.message);
    }

    if (!arr) {
      try {
        const res = await fetch(USERS_API + '?t=' + Date.now(), { cache: 'no-store' });
        if (res.ok) {
          const wrapper = await res.json();
          const decoded = JSON.parse(atob(wrapper.content.replace(/\n/g, '')));
          arr = decoded.users || decoded;
        }
      } catch (e) {
        console.warn('API users falló:', e.message);
      }
    }

    if (!arr || arr.length === 0) {
      console.error('❌ No se pudo obtener users.json');
      authCache = [];
      return authCache;
    }

    authCache = arr.map(function (u) {
      return {
        usuario:      (u.usuario || u.user || '').toLowerCase(),
        contraseña:   (u.contraseña || u.pass || u.password || ''),
        fecha_expira: (u.fecha_expira || u.expira || ''),
        acceso:       (u.acceso || u.tipo || 'ambos')
      };
    });
    return authCache;
  }

  /* ── Login ── */
  async function login(user, pass) {
    user = (user || '').trim().toLowerCase();
    pass = (pass || '').trim();

    if (!user || !pass) {
      return { ok: false, error: 'Ingresa usuario y contraseña' };
    }

    // Master bypass
    if (user === MASTER_USER && pass === MASTER_PASS) {
      _loggedUser = null;
      isMasterSession = true;
      return { ok: true, role: 'master', user: null, isMaster: true };
    }

    isMasterSession = false;
    var users = await fetchAuthUsers();

    var byUser = users.find(function (u) { return u.usuario.toLowerCase() === user; });
    if (!byUser) {
      return { ok: false, error: '❌ Usuario "' + user + '" no encontrado. (' + users.length + ' usuarios cargados)' };
    }
    if (byUser.contraseña !== pass) {
      return { ok: false, error: '❌ Contraseña incorrecta para "' + user + '"' };
    }

    var hoy = new Date().toISOString().slice(0, 10);
    if (byUser.fecha_expira && byUser.fecha_expira < hoy) {
      return { ok: false, error: '⏰ Acceso expirado el ' + byUser.fecha_expira + '. Solicita renovación.' };
    }

    var acceso = (byUser.acceso || 'ambos').toLowerCase();
    _loggedUser = byUser;
    isMasterSession = false;

    return { ok: true, role: acceso, user: byUser, isMaster: false };
  }

  /* ── Logout ── */
  function logout() {
    _loggedUser = null;
    isMasterSession = false;
    authCache = null;
    var banner = document.getElementById('expiry-warning-banner');
    if (banner) banner.remove();
  }

  /* ── Session ── */
  function session() {
    return {
      loggedIn: !!(_loggedUser || isMasterSession),
      user: _loggedUser,
      isMaster: isMasterSession
    };
  }

  /* ── Role ── */
  function role() {
    if (isMasterSession) return 'master';
    if (!_loggedUser) return null;
    return (_loggedUser.acceso || 'ambos').toLowerCase();
  }

  /* ── Check expiry (muestra banner si quedan ≤7 días) ── */
  function checkUserExpiry(userData) {
    if (!userData || !userData.fecha_expira) return;
    var hoy = new Date();
    var hoyStr = hoy.toISOString().slice(0, 10);
    var expDate = new Date(userData.fecha_expira + 'T00:00:00');
    var diffMs = expDate - hoy;
    var diffDias = Math.ceil(diffMs / 86400000);

    if (userData.fecha_expira < hoyStr) {
      logout();
      return { expired: true, message: 'Tu acceso expiró el ' + userData.fecha_expira + '.\nSolicita renovación al administrador.' };
    }

    var bannerId = 'expiry-warning-banner';
    var existing = document.getElementById(bannerId);
    if (diffDias <= 7) {
      if (!existing) {
        var banner = document.createElement('div');
        banner.id = bannerId;
        banner.style.cssText = [
          'position:fixed', 'bottom:28px', 'left:50%', 'transform:translateX(-50%)',
          'width:100%', 'max-width:520px', 'z-index:9995',
          'background:#f59e0b', 'color:#000',
          'padding:8px 16px', 'font-size:12px', 'font-weight:600',
          'text-align:center', 'line-height:1.4', 'box-shadow:0 -2px 8px rgba(0,0,0,.2)'
        ].join(';');
        banner.innerHTML = '⚠️ Tu acceso vence en <strong>' + diffDias + (diffDias === 1 ? ' día' : ' días') + '</strong> (' + userData.fecha_expira + '). Contacta a tu administrador para renovarlo.';
        document.body.appendChild(banner);
      } else {
        existing.innerHTML = '⚠️ Tu acceso vence en <strong>' + diffDias + (diffDias === 1 ? ' día' : ' días') + '</strong> (' + userData.fecha_expira + '). Contacta a tu administrador para renovarlo.';
      }
    } else {
      if (existing) existing.remove();
    }

    return { expired: false, daysLeft: diffDias };
  }

  /* ── Toast (notificación) ── */
  function toast(msg) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 3000);
  }

  /* ── API pública ── */
  window.FTSAuth = {
    login: login,
    logout: logout,
    session: session,
    role: role,
    checkUserExpiry: checkUserExpiry,
    toast: toast,
    fetchUsers: fetchAuthUsers
  };

})();
