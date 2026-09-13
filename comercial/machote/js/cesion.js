/* ═══ Machote · ceder la propiedad (V1.29) ═══════════════════════════════
 *
 * CEDER NO ES PRESTAR, y por eso vive aparte del préstamo aunque se le
 * parezca. Un préstamo es un permiso de escritura CON VIGENCIA que su dueño
 * recoge cuando quiere; una cesión es instantánea y definitiva: quien recibe
 * pasa a ser dueño con todos los derechos, incluido archivar.
 *
 * Dos formas, y el historial tiene que distinguirlas:
 *
 *   VOLUNTARIA  · la ejecuta el dueño. El receptor NO acepta: el préstamo ya
 *                 funciona así, una aceptación pendiente dejaría el machote
 *                 en un limbo con dos dueños posibles, y el riesgo real de
 *                 este módulo no es recibir trabajo que no querías — es
 *                 perderlo. Ceder no destruye nada y se deshace cediendo de
 *                 vuelta.
 *
 *   FORZADA     · para cuando el dueño ya NO ESTÁ EN FTS y no hay quien firme.
 *                 Sólo dirección, con motivo obligatorio, y queda marcada
 *                 como forzada en el historial. No puede verse igual que una
 *                 voluntaria: una dice «te la paso», la otra dice «tomé una
 *                 decisión sobre trabajo de alguien que no está».
 *
 * Aquí NO SE DECIDE NINGÚN PERMISO. El servidor resuelve en SQL, con el actor
 * del token, quién puede ceder qué; `comercial:admin` se comprueba allá y el
 * motivo obligatorio es además un CHECK de la base. Esto sólo evita un viaje
 * que ya se sabe que falla, y pinta lo que el servidor contestó.
 */
(function (G) {
  'use strict';

  const A = G.MachoteAlmacen;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const soyDireccion = () => {
    try {
      const ses = G.SuiteAuth && G.SuiteAuth.getSession();
      return !!(ses && Array.isArray(ses.scopes) && ses.scopes.indexOf('comercial:admin') >= 0);
    } catch (e) { return false; }
  };

  function cerrar() { const d = $('#cesionCaja'); if (d) d.remove(); }

  /** Abre el diálogo para UN machote (cesión normal) o para VARIOS (la
   *  limpieza de la cartera de quien se fue).
   *
   *  `alTerminar` se llama sólo si el servidor confirmó algo. */
  function abrir(machotes, personas, alTerminar) {
    cerrar();
    const lista = Array.isArray(machotes) ? machotes : [machotes];
    if (!lista.length) return;
    const lote = lista.length > 1;
    const admin = soyDireccion();

    const caja = document.createElement('div');
    caja.id = 'cesionCaja';
    caja.className = 'modal';
    caja.setAttribute('role', 'dialog');
    caja.innerHTML =
      '<div class="caja cesion-caja" role="dialog" aria-modal="true">' +
        '<h3>' + (lote ? ('Ceder ' + lista.length + ' cotizaciones') : 'Ceder esta cotización') + '</h3>' +
        '<p class="tiny nota">Quien reciba pasa a ser <strong>dueño</strong>, con todos los derechos ' +
        '—incluido archivar—. No es un préstamo: no vence y no se recoge. Se deshace ' +
        'cediendo de vuelta.</p>' +
        (lote
          ? '<div class="tiny nota cesion-lote">' +
              lista.map(m => esc(m._folio_txt || m.folio_txt || m.nombre || m.id)).join(' · ') +
            '</div>'
          : '') +
        '<label class="cesion-l">A quién<br>' +
          '<select id="cesPara" class="cel">' +
            '<option value="">Elige a quién…</option>' +
            personas.map(pp => '<option value="' + esc(pp.actor) + '" data-nom="' + esc(pp.nombre) + '">' +
              esc(pp.nombre) + '</option>').join('') +
          '</select></label>' +
        (admin
          ? '<label class="cesion-l cesion-forz">' +
              '<input type="checkbox" id="cesForz"> ' +
              '<span>Su dueño ya no está en FTS <span class="tiny nota">(reasignar sin su firma. ' +
              'Queda marcada como forzada en el historial)</span></span>' +
            '</label>' +
            '<label class="cesion-l" id="cesMotivoL" hidden>Por qué<br>' +
              '<input id="cesMotivo" class="cel" placeholder="Ej.: salida de FTS el 12-sep">' +
              '<span class="tiny n-warn">Obligatorio: una reasignación sin motivo es la que ' +
              'nadie va a poder explicar después.</span></label>'
          : '<div class="tiny nota">Si su dueño ya no está en FTS, esto lo hace dirección.</div>') +
        '<div id="cesAviso" class="tiny n-bad" hidden></div>' +
        '<div class="acciones">' +
          '<button class="btn fantasma" id="cesCancel">Cancelar</button>' +
          '<button class="btn" id="cesOk">Ceder</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(caja);

    const forz = $('#cesForz'), motL = $('#cesMotivoL'), aviso = $('#cesAviso');
    if (forz) forz.onchange = () => { motL.hidden = !forz.checked; };
    $('#cesCancel').onclick = cerrar;
    caja.onclick = (e) => { if (e.target === caja) cerrar(); };

    $('#cesOk').onclick = async () => {
      const sel = $('#cesPara');
      const para = sel.value;
      const nom = (sel.selectedOptions[0] && sel.selectedOptions[0].dataset.nom) || para;
      const forzada = !!(forz && forz.checked);
      const motivo = (($('#cesMotivo') || {}).value || '').trim();

      const decir = (t) => { aviso.hidden = false; aviso.textContent = t; };
      if (!para) return decir('Falta decir a quién.');
      if (forzada && !motivo) return decir('Una reasignación forzada necesita motivo.');

      $('#cesOk').disabled = true;
      const r = await A.ceder(lista.map(m => m.id), para, nom, forzada, motivo);
      $('#cesOk').disabled = false;

      if (!r || !r.ok) { decir((r && r.mensaje) || 'No se pudo ceder.'); return; }
      cerrar();
      if (alTerminar) alTerminar(r);
    };
  }

  G.MachoteCesion = { abrir: abrir, cerrar: cerrar, soyDireccion: soyDireccion };
})(window);
