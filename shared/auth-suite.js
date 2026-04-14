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

  // ─── Cargar usuarios desde GitHub raw ───
  async function loadUsers(){
    try{
      const res = await fetch(AUTH_RAW + '?_=' + Date.now(), { cache:'no-store' });
      if(!res.ok) return getDefaultUsers();
      return await res.json();
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

  window.FTSAuth = {
    login, logout, setSession, getSession,
    canAccess, isMaster, isLoggedIn,
    hashPassword, loadUsers,
    initActivityTracking, updateActivity, resetInactivityTimer
  };
})();
