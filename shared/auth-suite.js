// ═══ FTS Suite — Sistema de autenticación central ═══
// Uso: window.FTSAuth.login(user, pass), .getSession(), .canAccess(mod, submod)

(function(){
  'use strict';

  const AUTH_FILE  = 'shared/users-suite.json';
  const AUTH_RAW   = 'https://raw.githubusercontent.com/yinyo1/fts-suite/main/' + AUTH_FILE;
  const SESSION_KEY = 'fts_session';
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 min

  // ─── Hash SHA-256 con Web Crypto ───
  async function hashPassword(password){
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(password));
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2,'0'))
      .join('');
  }

  // ─── Cargar usuarios desde GitHub ───
  // Prefiere GitHub API autenticada (sin cache de Fastly) cuando hay token.
  // Cae a raw.githubusercontent.com con cache bust agresivo si no.
  async function loadUsers(){
    const token = localStorage.getItem('ops_github_token');
    try{
      // Intento 1: GitHub API autenticada — bypassa el CDN de Fastly
      if(token){
        const apiRes = await fetch(
          'https://api.github.com/repos/yinyo1/fts-suite/contents/' + AUTH_FILE + '?ref=main&t=' + Date.now(),
          { headers: {
              'Authorization': 'token ' + token,
              'Accept':        'application/vnd.github.v3+json'
          }}
        );
        if(apiRes.ok){
          const file = await apiRes.json();
          const cleanB64 = (file.content || '').replace(/\n/g, '');
          // decodeURIComponent(escape(...)) maneja UTF-8 desde base64
          const decoded = decodeURIComponent(escape(atob(cleanB64)));
          return JSON.parse(decoded);
        }
      }
      // Intento 2: raw.githubusercontent.com con cache bust por query string
      const raw = await fetch(
        AUTH_RAW + '?nocache=' + Math.random() + '&t=' + Date.now(),
        { cache: 'no-store' }
      );
      if(!raw.ok) return getDefaultUsers();
      return await raw.json();
    } catch(e){
      return getDefaultUsers();
    }
  }

  function getDefaultUsers(){
    return {
      users: [{
        id:            1,
        username:      'ftsmaster',
        password_hash: null,
        nombre:        'FTS Master',
        activo:        true,
        vigencia:      null,
        role:          'master',
        modulos:       'all'
      }]
    };
  }

  // ─── Login ───
  async function login(username, password){
    const data = await loadUsers();
    const user = (data.users || []).find(u => u.username === username);

    if(!user || !user.activo) return null;

    // Verificar vigencia
    if(user.vigencia){
      const hoy = new Date().toISOString().split('T')[0];
      if(hoy > user.vigencia) return null;
    }

    const hash = await hashPassword(password);

    // ftsmaster sin password_hash todavía: primer login
    if(user.role === 'master' && !user.password_hash){
      // Permitir que use un hash local si ya se configuró una vez
      const localHash = localStorage.getItem('fts_master_hash');
      if(localHash){
        if(hash === localHash){
          user.password_hash = localHash;
          return { user, firstLogin: false };
        }
        return null;
      }
      return { user, firstLogin: true, tempHash: hash };
    }

    if(hash !== user.password_hash) return null;
    return { user, firstLogin: false };
  }

  // ─── Sesión ───
  function setSession(user){
    const session = {
      userId:       user.id,
      username:     user.username,
      nombre:       user.nombre,
      role:         user.role,
      modulos:      user.modulos,
      loginTime:    Date.now(),
      lastActivity: Date.now()
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    resetInactivityTimer();
  }

  function getSession(){
    const raw = sessionStorage.getItem(SESSION_KEY);
    if(!raw) return null;
    let session;
    try{ session = JSON.parse(raw); } catch(e){ return null; }
    if(Date.now() - session.lastActivity > INACTIVITY_TIMEOUT){
      logout();
      return null;
    }
    return session;
  }

  function updateActivity(){
    const raw = sessionStorage.getItem(SESSION_KEY);
    if(!raw) return;
    let session;
    try{ session = JSON.parse(raw); } catch(e){ return; }
    session.lastActivity = Date.now();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function logout(){
    sessionStorage.removeItem(SESSION_KEY);
    if(window._inactivityTimer){
      clearTimeout(window._inactivityTimer);
      window._inactivityTimer = null;
    }
  }

  function resetInactivityTimer(){
    if(window._inactivityTimer) clearTimeout(window._inactivityTimer);
    window._inactivityTimer = setTimeout(function(){
      logout();
      // Redirigir al launcher raíz de la suite
      const path = window.location.pathname;
      const root = path.includes('/fts-suite/')
        ? path.substring(0, path.indexOf('/fts-suite/') + '/fts-suite/'.length)
        : '/';
      window.location.href = root + 'index.html';
    }, INACTIVITY_TIMEOUT);
  }

  function initActivityTracking(){
    ['click','keydown','touchstart','scroll'].forEach(function(ev){
      document.addEventListener(ev, function(){
        updateActivity();
        resetInactivityTimer();
      }, { passive:true });
    });
  }

  // ─── Control de acceso ───
  function canAccess(modulo, submodulo){
    const session = getSession();
    if(!session) return false;
    if(session.role === 'master') return true;
    if(session.modulos === 'all') return true;

    const mod = session.modulos && session.modulos[modulo];
    if(!mod || !mod.acceso) return false;
    if(!submodulo) return true;
    return mod.submodulos && mod.submodulos[submodulo] !== false;
  }

  function isMaster(){
    const session = getSession();
    return !!(session && session.role === 'master');
  }

  function isLoggedIn(){
    return !!getSession();
  }

  // ─── Auto-cargar config cifrada de GitHub ───
  // Si hay password maestra guardada, descifra ops-config.json
  // y aplica todas las keys ops_* al localStorage. No bloquea
  // el flujo de login si falla.
  async function autoLoadConfig(){
    try{
      const CONFIG_RAW = 'https://raw.githubusercontent.com/yinyo1/fts-suite/main/shared/ops-config.json?nocache=' + Math.random() + '&t=' + Date.now();

      const res = await fetch(CONFIG_RAW, { cache:'no-store' });
      if(!res.ok) return false;

      const fileData = await res.json();
      if(!fileData || !fileData.data) return false;

      // Necesitamos la contraseña maestra para descifrar.
      // Solo se aplica si el usuario ya la guardó previamente
      // (típicamente tras un sync exitoso anterior).
      const password = localStorage.getItem('ops_sync_password');
      if(!password) return false;

      if(typeof ConfigSync === 'undefined') return false;
      await ConfigSync.load(password);

      console.log('[FTSAuth] Config auto-cargada desde GitHub');
      return true;
    } catch(e){
      // Silencioso — no interrumpir el login
      console.warn('[FTSAuth] Auto-load config:', e.message);
      return false;
    }
  }

  window.FTSAuth = {
    login, logout, setSession, getSession,
    canAccess, isMaster, isLoggedIn,
    hashPassword, loadUsers, autoLoadConfig,
    initActivityTracking, updateActivity, resetInactivityTimer
  };
})();
