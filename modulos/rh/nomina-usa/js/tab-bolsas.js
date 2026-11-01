/* ═══ RH · Nómina USA · pestaña Bolsas por SO (#448, fase D) ═══
 * Bolsa por rol (supervisor / técnicos) de cada SO: del machote digital o provisional con folio.
 * Disponible al avance vigente. Sin bolsa no se puede pedir pago de esa SO.
 * Capturar provisional o refrescar del machote: solo nomina_usa:admin (Esteban). */
(function (G) {
  'use strict';
  var N = G.NominaUSA.nomina;
  function $$(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  async function render(el, c) {
    var e = c.esc, admin = c.tiene('nomina_usa:admin');
    var r = await c.llamar({ accion: 'bolsas' });
    if (!r || r.ok === false) { el.innerHTML = '<div class="err">' + e(c.mensaje(r)) + '</div>'; return; }
    var conBolsa = {}; r.bolsas.forEach(function (b) { conBolsa[b.so_id] = b; });
    var sin = (r.catalogo || []).filter(function (s) { return !conBolsa[s.so_id]; });
    var h = '<div class="cab"><h1>Bolsas de mano de obra por SO</h1></div>' +
      '<p class="muted">Bolsa del machote digital (líneas de supervisor y técnicos). Si la SO no tiene machote con mano de obra, Esteban captura una provisional con folio. Disponible = bolsa × avance − pagado.</p>';
    if (sin.length) h += '<div class="nu-bloq">Sin bolsa: ' + sin.map(function (s) { return '<b>' + e(s.so_nombre) + '</b>'; }).join(', ') + '. No se puede pedir pago de estas SO hasta capturar su bolsa.</div>';
    r.bolsas.forEach(function (b) {
      h += '<div class="caja nu-so"><h3>' + e(b.so_nombre) + ' <span class="chip ' + (b.origen === 'machote' ? 'e-validado' : 'e-espera') + '">' + (b.origen === 'machote' ? 'machote' : 'provisional · folio ' + e(b.folio)) + '</span></h3>' +
        '<div class="muted">Avance vigente: <b>' + b.avance + '%</b></div><div class="nu-scroll"><table class="nu-tabla"><thead><tr><th>Rol</th><th class="n">Bolsa</th><th class="n">Pagado</th><th class="n nu-oc">Bolsa × avance</th><th class="n">Disponible</th></tr></thead><tbody>' +
        ['supervisor', 'tecnicos'].map(function (rol) {
          var pag = b['pagado_previo_' + rol] + (b['pagado_' + rol] || 0);
          return '<tr><td>' + (rol === 'supervisor' ? 'Supervisor' : 'Técnicos') + '</td><td class="n">' + $$(b[rol]) + '</td><td class="n">' + $$(pag) + '</td><td class="n nu-oc">' + $$(b[rol] * b.avance / 100) + '</td><td class="n"><b>' + $$(N.disponible(b[rol], b.avance, pag)) + '</b></td></tr>';
        }).join('') + '</tbody></table></div></div>';
    });
    if (admin) {
      var opts = (r.catalogo || []).map(function (s) { return '<option value="' + s.so_id + '" data-nombre="' + e(s.so_nombre) + '" data-so="' + (s.sale_order_id || '') + '">' + e(s.so_nombre) + (conBolsa[s.so_id] ? ' (ya tiene)' : '') + '</option>'; });
      // Primero las que NO tienen bolsa: es a lo que se viene a esta forma.
      opts = (r.catalogo || []).map(function (s, i) { return { o: opts[i], tiene: !!conBolsa[s.so_id] }; }).sort(function (a, b) { return a.tiene - b.tiene; }).map(function (x) { return x.o; }).join('');
      h += '<div class="cab"><h1>Capturar bolsa provisional</h1></div><form class="caja nu-ficha" id="nu-prov"><div class="nu-f">' +
        '<label>SO<select name="so">' + opts + '</select></label><label>Folio de Esteban<input name="folio" placeholder="EDC-2026-11-01"></label>' +
        '<label>Bolsa supervisor USD<input name="supervisor" inputmode="decimal"></label><label>Bolsa técnicos USD<input name="tecnicos" inputmode="decimal"></label>' +
        '<label>Ya pagado supervisor<input name="ps" inputmode="decimal" value="0"></label><label>Ya pagado técnicos<input name="pt" inputmode="decimal" value="0"></label></div>' +
        '<div class="nu-acc"><button class="btn" type="button" id="nu-machote">Traer del machote</button><button class="btn pri" type="submit">Guardar provisional</button></div><div class="err hid"></div></form>';
    }
    el.innerHTML = h;
    var f = el.querySelector('#nu-prov'); if (!f) return;
    function so() { var o = f.so.selectedOptions[0]; return { so_id: Number(o.value), so_nombre: o.dataset.nombre, sale_order_id: Number(o.dataset.so) || null }; }
    function err(t) { var b = f.querySelector('.err'); b.textContent = t; b.classList.remove('hid'); }
    f.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var r2 = await c.llamar(Object.assign({ accion: 'bolsa_provisional', folio: f.folio.value, supervisor: Number(f.supervisor.value) || 0, tecnicos: Number(f.tecnicos.value) || 0,
        pagado_previo_supervisor: Number(f.ps.value) || 0, pagado_previo_tecnicos: Number(f.pt.value) || 0 }, so()));
      if (!r2 || r2.ok === false) return err(c.mensaje(r2) === 'FOLIO_REQUERIDO' ? 'Escribe el folio.' : c.mensaje(r2));
      c.toast('Bolsa provisional guardada'); c.recargar();
    });
    el.querySelector('#nu-machote').addEventListener('click', async function () {
      var r2 = await c.llamar(Object.assign({ accion: 'bolsa_machote' }, so()));
      if (!r2 || r2.ok === false) return err(c.mensaje(r2));
      c.toast('Bolsa traída del machote'); c.recargar();
    });
  }
  G.NusaApp.tab({ id: 'bolsas', label: 'Bolsas por SO', scopes: ['nomina_usa:kiosko', 'nomina_usa:validar', 'nomina_usa:autorizar', 'nomina_usa:archivo'], render: render });
})(window);
