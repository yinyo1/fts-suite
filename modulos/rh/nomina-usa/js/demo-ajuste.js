/* ═══ RH · Nómina USA · práctica del ajuste del viernes (#448, fase F) ═══
 * Envuelve las acciones de práctica de la solicitud: el contexto trae el ajuste de la semana
 * anterior (estimados de miércoles y jueves contra lo real) y el envío lo agrega UNA vez como
 * línea. Misma regla que nomina_usa_0006 y que NominaUSA.nomina.ajusteComercial. */
(function (G) {
  'use strict';
  var D = G.NusaDemo, S = D.estado, N = G.NominaUSA.nomina, A = G.NusaApi;
  S.ajustesAplicados = {};
  function calculo(sem) {
    var prev = N.semanaFTS(new Date(new Date(sem + 'T12:00:00Z').getTime() - 7 * 86400000).toISOString().slice(0, 10)).inicio;
    var s = S.solicitudes.find(function (x) { return x.semana === prev && (x.estado === 'autorizada' || x.estado === 'subida'); });
    if (!s) return [];
    var est = {}, real = {};
    (s.envio.comercial || []).forEach(function (c) { if (c.estimado) { est[c.fecha] = c.pct; var r = S.comercialReal.find(function (x) { return x.fecha === c.fecha; }); real[c.fecha] = r ? r.pct : 0; } });
    return N.ajusteComercial(est, real, S.config.tarifa_comercial_usd).dias.map(function (d) {
      return { id: s.id + ':' + d.fecha, tipo: 'comercial', employee_id: 98, alias: 'Ricardo', fecha: d.fecha, estimado: d.estimado, real: d.real, monto: d.monto, semana_origen: prev };
    }).filter(function (a) { return !S.ajustesAplicados[a.id]; });
  }
  D.ajusteCalculo = calculo;
  // Decorar sin perder los candados de scope de los handlers originales.
  var llamarDemo = A.llamar;
  A.llamar = async function (datos) {
    if (A.modo !== 'demo') return llamarDemo(datos);
    var r = await llamarDemo(datos);
    if (datos.accion === 'solicitud_contexto' && r && r.ok) r.ajustes = calculo(datos.semana);
    if (datos.accion === 'solicitud_enviar' && r && r.ok) {
      var s = S.solicitudes.find(function (x) { return x.id === r.id; });
      calculo(s.semana).forEach(function (a) {
        s.lineas.push({ id: s.id * 100 + 90 + s.lineas.length, tipo: 'ajuste', employee_id: a.employee_id, alias: a.alias, fecha: a.fecha, monto: a.monto, cuenta: 'COMERCIAL-USA',
                        detalle: { tipo: 'comercial', estimado: a.estimado, real: a.real, semana_origen: a.semana_origen } });
        S.ajustesAplicados[a.id] = s.id;
      });
    }
    return r;
  };
})(window);
