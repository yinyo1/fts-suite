// ═══ FTS Suite — Keepalive para n8n Railway ═══
// Hace ping cada 5 minutos para evitar que Railway
// duerma el servicio por inactividad.

(function(){
  'use strict';

  var N8N_URL = function(){
    return localStorage.getItem('ops_n8n_url') ||
      'https://primary-production-5c3c.up.railway.app';
  };

  function ping(){
    var url = N8N_URL();
    if(!url) return;
    try{
      var controller = new AbortController();
      var t = setTimeout(function(){ controller.abort(); }, 5000);
      fetch(url + '/webhook/kiosk/empleados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ping: true }),
        signal: controller.signal
      }).then(function(){ clearTimeout(t); }).catch(function(){ clearTimeout(t); });
    } catch(e){}
  }

  // Ping cada 5 minutos
  setInterval(ping, 5 * 60 * 1000);

  // Primer ping 3s después de cargar
  setTimeout(ping, 3000);
})();
