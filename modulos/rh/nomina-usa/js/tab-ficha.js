/* ═══ RH · Nómina USA · pestaña Ficha y banderas (#448, fase A) ═══
 * Ficha por persona (país de nómina, tipo de pago, SO al entrar, jefe, hora y zona de
 * referencia, fijo semanal, bandera del kiosko) y las banderas generales. Editar es
 * nomina_usa:admin; consultar, validar o autorizar.
 */
(function (G) {
  'use strict';
  var NU = G.NominaUSA;

  function opciones(dic, sel, vacio) {
    var o = vacio ? '<option value="">' + vacio + '</option>' : '';
    return o + Object.keys(dic).map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + dic[k] + '</option>'; }).join('');
  }
  function zonas(sel) {
    return '<option value="">(sin zona)</option>' + NU.ficha.ZONAS.map(function (z) { return '<option' + (z === sel ? ' selected' : '') + '>' + z + '</option>'; }).join('');
  }
  var PERFIL = { so_entrada: 'SO al entrar', plan_avance: 'Plan y avance (supervisor + comercial)', usa_simple: 'USA sin SO al entrar' };

  async function render(el, c) {
    var e = c.esc, admin = c.tiene('nomina_usa:admin');
    var rf = await c.llamar({ accion: 'ficha_listar' }), rc = await c.llamar({ accion: 'config_ver' });
    if (!rf || rf.ok === false) { el.innerHTML = '<div class="err">' + e(c.mensaje(rf)) + '</div>'; return; }
    var cfg = (rc && rc.config) || {};
    var kOn = cfg.kiosko_activo === true;
    // Dos banderas independientes (2-nov): «Pasar a real» de USA NO prende los correos de México.
    function bandAlertas(clave, titulo, quien) {
      var real = cfg[clave] === 'real';
      return '<div class="nu-band ' + (real ? 'on' : 'off') + '" data-band="' + clave + '"><b>' + titulo + '</b><span>' + (real ? 'REAL' : 'SOMBRA') + '</span>' +
        '<small>' + quien + ' ' + (real ? 'Se encolan correos.' : 'Se registran y NO sale ningún correo.') + '</small>' +
        (admin ? '<button class="btn" data-cfg="' + clave + '" data-val="' + (real ? 'sombra' : 'real') + '">' + (real ? 'Volver a sombra' : 'Pasar a real') + '</button>' : '') + '</div>';
    }
    var h = '<div class="nu-banderas">' +
      '<div class="nu-band ' + (kOn ? 'on' : 'off') + '"><b>Kiosko USA</b><span>' + (kOn ? 'ENCENDIDO' : 'APAGADO') + '</span>' +
        '<small>Interruptor general. Además cada persona necesita su bandera y checar desde USA.</small>' +
        (admin ? '<button class="btn" data-cfg="kiosko_activo" data-val="' + (!kOn) + '">' + (kOn ? 'Apagar' : 'Encender') + '</button>' : '') + '</div>' +
      bandAlertas('alertas_modo_usa', 'Alertas USA', 'Fichas USA, y las híbridas en día USA.') +
      bandAlertas('alertas_modo_mx', 'Alertas México', 'El resto del padrón de Retardos.') +
      '</div>';
    h += '<div class="cab"><h1>Fichas</h1></div><div class="nu-fichas">';
    rf.fichas.forEach(function (f) {
      var perfil = NU.ficha.perfilKiosko(Object.assign({}, f, { kiosko_usa: true }));
      h += '<form class="caja nu-ficha" data-emp="' + f.employee_id + '">' +
        '<div class="nu-ficha-cab"><b>' + e(f.alias) + '</b> <span class="muted">empleado ' + f.employee_id + '</span>' +
        '<span class="chip ' + (f.kiosko_usa ? 'e-real' : 'e-otro') + '">kiosko USA ' + (f.kiosko_usa ? 'ON' : 'OFF') + '</span></div>' +
        '<div class="nu-grid">' +
        '<label>País de nómina<select name="pais_nomina"' + (admin ? '' : ' disabled') + '>' + opciones(NU.ficha.PAISES, f.pais_nomina) + '</select></label>' +
        '<label>Tipo de pago USA<select name="tipo_pago_usa"' + (admin ? '' : ' disabled') + '>' + opciones(NU.ficha.TIPOS_PAGO, f.tipo_pago_usa, '(no cobra en USA)') + '</select></label>' +
        '<label>Jefe directo (empleado)<input name="jefe_employee_id" inputmode="numeric" value="' + e(f.jefe_employee_id) + '"' + (admin ? '' : ' disabled') + '></label>' +
        '<label>Hora de entrada (local)<input name="hora_entrada_ref" placeholder="HH:MM" value="' + e(f.hora_entrada_ref ? String(f.hora_entrada_ref).slice(0, 5) : '') + '"' + (admin ? '' : ' disabled') + '></label>' +
        '<label>Zona horaria<select name="zona_horaria"' + (admin ? '' : ' disabled') + '>' + zonas(f.zona_horaria) + '</select></label>' +
        '<label>Fijo semanal USD<input name="fijo_semanal_usd" inputmode="decimal" value="' + e(f.fijo_semanal_usd) + '"' + (admin ? '' : ' disabled') + '></label>' +
        '<label>Alertas van a (empleados, separados por coma)<input name="destinatarios_alerta" inputmode="numeric" placeholder="vacío = RH y jefe" value="' + e((f.destinatarios_alerta || []).join(', ')) + '"' + (admin ? '' : ' disabled') + '></label>' +
        '<label>Cuenta analítica del fijo<input name="cuenta_analitica" placeholder="vacío = COMERCIAL-USA" value="' + e(f.cuenta_analitica || '') + '"' + (admin ? '' : ' disabled') + '></label>' +
        '</div><div class="nu-checks">' +
        '<label><input type="checkbox" name="pide_so_entrada"' + (f.pide_so_entrada ? ' checked' : '') + (admin ? '' : ' disabled') + '> Pide SO al entrar</label>' +
        '<label><input type="checkbox" name="kiosko_usa"' + (f.kiosko_usa ? ' checked' : '') + (admin ? '' : ' disabled') + '> Bandera del kiosko USA</label>' +
        '</div>' +
        '<div class="muted nu-perfil">Flujo en USA: <b>' + e(PERFIL[perfil] || 'México') + '</b>' +
        (f.hora_entrada_ref ? ' · la entrada se evalúa en la zona de su última checada' : ' · <span class="warn">sin hora de referencia: no corre la alerta de entrada</span>') +
        ((f.destinatarios_alerta || []).length ? ' · alertas a ' + e(f.destinatarios_alerta.join(', ')) + ' (sin RH ni jefe)' : '') + '</div>' +
        (admin ? '<div class="nu-acc"><input name="motivo" placeholder="Motivo del cambio"><button class="btn pri" type="submit">Guardar</button></div>' : '') +
        '<div class="err hid"></div></form>';
    });
    h += '</div>';
    el.innerHTML = h;

    el.querySelectorAll('[data-cfg]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var clave = b.dataset.cfg, val = clave === 'kiosko_activo' ? b.dataset.val === 'true' : b.dataset.val;
        var motivo = G.prompt('Motivo para cambiar «' + clave + '» a ' + val + ':');
        if (!motivo) return;
        var r = await c.llamar({ accion: 'config_guardar', clave: clave, valor: val, motivo: motivo });
        c.toast(r && r.ok ? 'Guardado: ' + clave + ' = ' + val : c.mensaje(r)); c.recargar();
      });
    });
    el.querySelectorAll('form.nu-ficha').forEach(function (fm) {
      fm.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var d = new FormData(fm), f = { employee_id: Number(fm.dataset.emp) };
        var orig = rf.fichas.find(function (x) { return x.employee_id === f.employee_id; });
        f.alias = orig.alias;
        ['pais_nomina', 'tipo_pago_usa', 'jefe_employee_id', 'hora_entrada_ref', 'zona_horaria', 'fijo_semanal_usd'].forEach(function (k) { f[k] = d.get(k) || null; });
        if (f.pais_nomina === 'MX') f.tipo_pago_usa = null;
        if (f.jefe_employee_id) f.jefe_employee_id = Number(f.jefe_employee_id);
        f.pide_so_entrada = d.get('pide_so_entrada') === 'on'; f.kiosko_usa = d.get('kiosko_usa') === 'on';
        f.destinatarios_alerta = String(d.get('destinatarios_alerta') || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean).map(Number);
        f.cuenta_analitica = String(d.get('cuenta_analitica') || '').trim() || null;
        if (f.destinatarios_alerta.some(function (x) { return !(x > 0) || x !== Math.floor(x); })) { var b0 = fm.querySelector('.err'); b0.textContent = 'Destinatarios: números de empleado separados por coma.'; b0.classList.remove('hid'); return; }
        var err = NU.ficha.validarFicha(f), box = fm.querySelector('.err');
        if (err.length) { box.textContent = err.join(' '); box.classList.remove('hid'); return; }
        var r = await c.llamar({ accion: 'ficha_guardar', ficha: f, motivo: d.get('motivo') || null });
        if (!r || r.ok === false) { box.textContent = c.mensaje(r); box.classList.remove('hid'); return; }
        c.toast('Ficha guardada: ' + f.alias); c.recargar();
      });
    });
  }

  G.NusaApp.tab({ id: 'ficha', label: 'Ficha y banderas', scopes: ['nomina_usa:validar', 'nomina_usa:autorizar'], render: render });
})(window);
