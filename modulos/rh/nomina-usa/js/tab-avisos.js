/* ═══ RH · Nómina USA · pestaña Avisos (#448, MVP) ═══
 * Banderas del ciclo nuevo (avisos entre pasos, vigilante, costo en Odoo, conciliación) y la
 * lista de avisos que generó el sistema. En SOMBRA un aviso se registra y NO sale ningún correo:
 * esta pestaña es la forma de ver qué habría salido. Mover una bandera es nomina_usa:admin
 * (Esteban), con motivo y bitácora; el servidor lo vuelve a revisar.
 */
(function (G) {
  'use strict';
  var ROL = { richard: 'Richard', magaly: 'Magaly', erick: 'Erick', gerardo: 'Gerardo', esteban: 'Esteban' };
  var BANDERAS = [
    { clave: 'avisos_modo', titulo: 'Avisos entre pasos', tipo: 'modo', quien: 'Richard → Magaly → Erick → Gerardo, devoluciones, recordatorio del miércoles y resumen del viernes.' },
    { clave: 'vigilante_modo', titulo: 'Vigilante', tipo: 'modo', quien: 'A Esteban y Erick: alertas caídas, solicitud tarde, ajuste sin correr, SO sin avance.' },
    { clave: 'costo_odoo_activo', titulo: 'Costo en Odoo', tipo: 'bool', quien: 'Apagado: el asiento por SO solo se arma y se ve en Revisión. Prendido: se crea en Odoo en BORRADOR, nunca publicado.' },
    { clave: 'conciliacion_activa', titulo: 'Conciliación Auris', tipo: 'bool', quien: 'Apagado: la conciliación contra el banco es vista previa. En esta versión nada escribe en Odoo.' }
  ];
  function fecha(t) { try { return new Date(t).toLocaleString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' CST'; } catch (e) { return t; } }

  async function render(el, c) {
    var e = c.esc, admin = c.tiene('nomina_usa:admin');
    var rc = await c.llamar({ accion: 'config_ver' }), ra = await c.llamar({ accion: 'avisos' });
    if (!ra || ra.ok === false) { el.innerHTML = '<div class="err">' + e(c.mensaje(ra)) + '</div>'; return; }
    var cfg = (rc && rc.config) || {};
    var h = '<div class="cab"><h1>Avisos y vigilante</h1></div><div class="nu-banderas">' + BANDERAS.map(function (b) {
      var on = b.tipo === 'modo' ? cfg[b.clave] === 'real' : cfg[b.clave] === true;
      var txt = b.tipo === 'modo' ? (on ? 'REAL' : 'SOMBRA') : (on ? 'PRENDIDO' : 'APAGADO');
      var sig = b.tipo === 'modo' ? (on ? 'sombra' : 'real') : String(!on);
      var bt = b.tipo === 'modo' ? (on ? 'Volver a sombra' : 'Pasar a real') : (on ? 'Apagar' : 'Prender');
      return '<div class="nu-band ' + (on ? 'on' : 'off') + '" data-band="' + b.clave + '"><b>' + e(b.titulo) + '</b><span>' + txt + '</span><small>' + e(b.quien) + '</small>' +
        (admin ? '<button class="btn" data-cfg="' + b.clave + '" data-tipo="' + b.tipo + '" data-val="' + sig + '">' + bt + '</button>' : '') + '</div>';
    }).join('') + '</div>';
    var lat = ra.latido_alertas ? Math.round((Date.now() - new Date(ra.latido_alertas).getTime()) / 60000) : null;
    h += '<div class="caja nu-latido ' + (lat == null || lat > 30 ? 'mal' : 'ok') + '">Alertas de checada: ' +
      (lat == null ? 'nunca han corrido' : 'última corrida hace ' + lat + ' min') + (lat != null && lat > 30 ? ' · el vigilante avisa a los 30 min' : '') + '</div>';
    h += '<div class="cab"><h2>Avisos registrados</h2><span class="sp"></span><span class="muted">' + ra.avisos.length + ' · los últimos 100</span></div>';
    if (!ra.avisos.length) h += '<div class="caja vacio">Todavía no hay avisos. Aparecen cuando la solicitud avanza de paso o cuando el vigilante ve algo.</div>';
    else h += '<div class="caja nu-scroll"><table class="nu-tabla nu-cards"><thead><tr><th>Aviso</th><th>Cuándo</th><th>Para</th><th>Estado</th></tr></thead><tbody>' +
      ra.avisos.map(function (a) {
        return '<tr><td><b>' + e(a.asunto) + '</b>' + (a.origen === 'vigilante' ? ' <span class="chip e-espera">vigilante</span>' : '') + '</td>' +
          '<td class="nu-fecha">' + e(fecha(a.creado_at)) + '</td>' +
          '<td>' + e((a.roles || []).map(function (r) { return ROL[r] || r; }).join(', ')) + '</td>' +
          '<td>' + (a.modo === 'real' ? (a.encolada ? '<span class="chip e-real">enviado a la bandeja</span>' : '<span class="chip e-otro">real, sin correo</span>') : '<span class="chip e-otro">sombra: no salió</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    h += '<div class="err hid" id="nu-av-err"></div>';
    el.innerHTML = h;
    el.querySelectorAll('[data-cfg]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var motivo = G.prompt('Motivo para cambiar «' + b.closest('.nu-band').querySelector('b').textContent + '»:'); if (!motivo) return;
        var val = b.dataset.tipo === 'bool' ? b.dataset.val === 'true' : b.dataset.val;
        var r = await c.llamar({ accion: 'config_guardar', clave: b.dataset.cfg, valor: val, motivo: motivo });
        if (!r || r.ok === false) { var x = el.querySelector('#nu-av-err'); x.textContent = c.mensaje(r); x.classList.remove('hid'); return; }
        c.toast('Listo'); c.recargar();
      });
    });
  }
  G.NusaApp.tab({ id: 'avisos', label: 'Avisos', scopes: ['nomina_usa:validar', 'nomina_usa:autorizar', 'nomina_usa:archivo', 'nomina_usa:kiosko'], render: render });
})(window);
