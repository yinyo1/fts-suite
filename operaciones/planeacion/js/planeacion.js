// Build: 20260428-planeacion-f1-skeleton-v1
// Entry point del módulo planeación. F1 = solo auth gate + esqueleto.
'use strict';

(function(){

  function $(id){ return document.getElementById(id); }

  function denyAccess(reason){
    const gate = $('auth-gate');
    if (!gate) return;
    gate.style.display = 'block';
    gate.innerHTML =
      '<h2>🔒 Acceso restringido</h2>' +
      '<p>' + reason + '</p>' +
      '<a class="pl-gate-btn" href="../index.html">Volver a Operaciones</a>';
  }

  function redirectToLauncher(){
    window.location.href = '../../index.html';
  }

  document.addEventListener('DOMContentLoaded', function(){
    console.log('[planeacion] init build=' + window.BUILD_DATE);

    if (!window.FTSAuth || !FTSAuth.isLoggedIn()){
      redirectToLauncher();
      return;
    }

    const session = FTSAuth.getSession();
    if (!session){
      redirectToLauncher();
      return;
    }

    try { FTSAuth.initActivityTracking && FTSAuth.initActivityTracking(); } catch(e){}

    // Renderizar usuario en topbar
    const userEl = $('pl-user-nombre');
    if (userEl) userEl.textContent = '👤 ' + (session.nombre || session.username || '—');

    // Gate: ftsmaster (master/all) o felipe.perez
    const isMaster = session.role === 'master' || session.modulos === 'all';
    const isFelipe = session.username === 'felipe.perez';

    if (!isMaster && !isFelipe){
      denyAccess('Solo Felipe Pérez (Supervisor Operaciones) o ftsmaster pueden acceder a este módulo.');
      console.warn('[planeacion] acceso denegado a user=' + session.username + ' role=' + session.role);
      return;
    }

    // OK → mostrar main
    $('main-content').style.display = 'block';

    console.log('[planeacion] auth OK user=' + session.username +
                ' role=' + session.role +
                ' (esperando F2 para UI completa)');

    // TODO F2: inicializar empleados, jornadas, fechas, banners
  });

})();
