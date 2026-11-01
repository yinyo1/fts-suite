/* ═══ RH · Nómina USA · práctica de bolsas y avance (#448, fase D) ═══
 * SO11842: bolsa del machote (supervisor 3,200 · técnicos 7,200 USD) con 2,240 y 5,040 ya
 * pagados antes del sistema y avance 100 %: el caso de aceptación del #448.
 * SO11791: SIN bolsa (en Odoo su MO viene en 0): hasta que Esteban capture la provisional
 * no se puede pedir pago. Los ids de práctica son el número de la SO. */
(function (G) {
  'use strict';
  var D = G.NusaDemo, S = D.estado;
  S.catalogoSO = [{ so_id: 11842, so_nombre: 'SO11842 - prensas materials', sale_order_id: 11842 }, { so_id: 11791, so_nombre: 'SO11791 - Power and control panels', sale_order_id: 11791 }];
  S.machotes = { 11842: { supervisor: 3200, tecnicos: 7200, moneda: 'USD' } };
  S.bolsas = [{ so_id: 11842, so_nombre: 'SO11842 - prensas materials', sale_order_id: 11842, origen: 'machote', supervisor: 3200, tecnicos: 7200, moneda: 'USD', folio: null,
                pagado_previo_supervisor: 2240, pagado_previo_tecnicos: 5040, vigente: true, capturada_por: 'sistema' }];
  S.avances = { 11842: [{ fecha: '2026-10-28', pct: 70 }, { fecha: '2026-10-29', pct: 90 }, { fecha: '2026-10-30', pct: 100 }], 11791: [{ fecha: '2026-10-26', pct: 40 }] };
  S.horas = [
    { employee_id: 98, alias: 'Ricardo', so_id: 11842, fecha: '2026-10-30', horas: 9.6 }, { employee_id: 75, alias: 'Mateo', so_id: 11842, fecha: '2026-10-30', horas: 10 },
    { employee_id: 79, alias: 'José Luis', so_id: 11842, fecha: '2026-10-30', horas: 10 }, { employee_id: 75, alias: 'Mateo', so_id: 11842, fecha: '2026-10-31', horas: 8 },
    { employee_id: 79, alias: 'José Luis', so_id: 11842, fecha: '2026-11-02', horas: 6 }, { employee_id: 75, alias: 'Mateo', so_id: 11791, fecha: '2026-11-02', horas: 9 },
    { employee_id: 79, alias: 'José Luis', so_id: 11791, fecha: '2026-11-03', horas: 9 }, { employee_id: 98, alias: 'Ricardo', so_id: 11791, fecha: '2026-11-03', horas: 5 }
  ];
  function vigente(so) { return S.bolsas.find(function (b) { return b.so_id === so && b.vigente; }) || null; }
  function avanceVigente(so) { return (S.avances[so] || []).reduce(function (m, a) { return Math.max(m, a.pct); }, 0); }
  D.bolsaVigente = vigente; D.avanceVigente = avanceVigente;
  D.reg('bolsas', ['nomina_usa:kiosko', 'nomina_usa:validar', 'nomina_usa:autorizar', 'nomina_usa:archivo'], function () {
    return { ok: true, catalogo: S.catalogoSO, bolsas: S.bolsas.filter(function (b) { return b.vigente; }).map(function (b) { return Object.assign({}, b, { avance: avanceVigente(b.so_id) }); }) };
  });
  D.reg('bolsa_machote', ['nomina_usa:admin'], function (p, q) {
    var m = S.machotes[p.sale_order_id];
    if (!m) return { ok: false, error: 'SIN_MO_EN_MACHOTE', mensaje: 'La SO no tiene machote ligado con mano de obra de campo. Captura una bolsa provisional con folio.' };
    var v = vigente(Number(p.so_id)); if (v) v.vigente = false;
    var b = { so_id: Number(p.so_id), so_nombre: p.so_nombre, sale_order_id: p.sale_order_id, origen: 'machote', supervisor: m.supervisor, tecnicos: m.tecnicos, moneda: 'USD',
              pagado_previo_supervisor: v ? v.pagado_previo_supervisor : 0, pagado_previo_tecnicos: v ? v.pagado_previo_tecnicos : 0, vigente: true, capturada_por: q.actor };
    S.bolsas.push(b); D.log(q.actor, 'bolsa_machote', 'so:' + b.so_id, v, b);
    return { ok: true, bolsa: b };
  });
  D.reg('bolsa_provisional', ['nomina_usa:admin'], function (p, q) {
    var v = vigente(Number(p.so_id));
    if (v && v.origen === 'machote') return { ok: false, error: 'YA_TIENE_BOLSA_DE_MACHOTE' };
    if (String(p.folio || '').trim().length < 3) return { ok: false, error: 'FOLIO_REQUERIDO' };
    var sup = Number(p.supervisor) || 0, tec = Number(p.tecnicos) || 0, ps = Number(p.pagado_previo_supervisor) || 0, pt = Number(p.pagado_previo_tecnicos) || 0;
    if (sup < 0 || tec < 0 || sup + tec <= 0) return { ok: false, error: 'MONTOS_INVALIDOS', mensaje: 'La bolsa necesita un monto mayor a cero.' };
    if (ps > sup || pt > tec || ps < 0 || pt < 0) return { ok: false, error: 'PAGADO_MAYOR_A_BOLSA', mensaje: 'Lo ya pagado no puede ser mayor a la bolsa.' };
    if (v) v.vigente = false;
    var b = { so_id: Number(p.so_id), so_nombre: p.so_nombre, sale_order_id: p.sale_order_id || null, origen: 'provisional', supervisor: sup, tecnicos: tec, moneda: 'USD', folio: p.folio.trim(),
              pagado_previo_supervisor: ps, pagado_previo_tecnicos: pt, vigente: true, capturada_por: q.actor, nota: p.nota || null };
    S.bolsas.push(b); D.log(q.actor, 'bolsa_provisional', 'so:' + b.so_id, v, b, p.folio);
    return { ok: true, bolsa: b };
  });
  D.reg('avance_diario', ['nomina_usa:kiosko', 'nomina_usa:validar', 'nomina_usa:autorizar'], function (p) {
    var dias = G.NominaUSA.alertas.dias(p.desde, p.hasta).map(function (f) {
      var hoy = (S.avances[p.so_id] || []).filter(function (a) { return a.fecha === f; });
      var al = (S.avances[p.so_id] || []).filter(function (a) { return a.fecha <= f; }).reduce(function (m, a) { return Math.max(m, a.pct); }, 0);
      return { fecha: f, avance: hoy.length ? hoy[0].pct : null, avance_al: al,
               horas: S.horas.filter(function (h) { return h.so_id === Number(p.so_id) && h.fecha === f; }).map(function (h) { return { employee_id: h.employee_id, alias: h.alias, horas: h.horas }; }) };
    });
    return { ok: true, so_id: Number(p.so_id), dias: dias };
  });
})(window);
