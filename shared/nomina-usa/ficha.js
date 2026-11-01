/* ═══ Nómina USA · ficha del empleado (#448, fase A) ═══
 *
 * Reglas puras, sin red ni DOM. Las usan la pantalla (modulos/rh/nomina-usa), el
 * kiosko y las pruebas (tests/nomina-usa). Las mismas restricciones viven en SQL
 * (nomina_usa_0001, CHECKs de nomina_usa.ficha): esto es para avisar ANTES de
 * mandar, no la defensa.
 */
(function (root) {
  'use strict';
  var NU = root.NominaUSA = root.NominaUSA || {};

  var PAISES = { MX: 'México', USA: 'USA', HIBRIDO: 'Híbrido (México y USA)' };
  var TIPOS_PAGO = {
    bolsa_avance: 'Bolsa por avance',
    supervisor_comercial: 'Supervisor + comercial',
    fijo_asistencia: 'Fijo por asistencia'
  };
  var ZONAS = ['America/Los_Angeles', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/New_York', 'America/Monterrey'];

  /** Devuelve la lista de errores (vacía = ficha válida). */
  function validarFicha(f) {
    var e = [];
    f = f || {};
    if (!(parseInt(f.employee_id, 10) > 0)) e.push('Falta el número de empleado.');
    if (!PAISES[f.pais_nomina]) e.push('País de nómina inválido.');
    if (f.pais_nomina === 'MX' && f.tipo_pago_usa) e.push('Quien cobra solo en México no lleva tipo de pago USA.');
    if (f.pais_nomina && f.pais_nomina !== 'MX' && !TIPOS_PAGO[f.tipo_pago_usa]) e.push('Quien cobra en USA necesita tipo de pago.');
    if (f.pide_so_entrada && f.tipo_pago_usa !== 'bolsa_avance') e.push('«Pide SO al entrar» es solo para pago por bolsa.');
    if (f.hora_entrada_ref && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(f.hora_entrada_ref))) e.push('Hora de entrada con formato HH:MM.');
    if (f.zona_horaria && ZONAS.indexOf(f.zona_horaria) < 0) e.push('Zona horaria fuera de la lista.');
    if (f.fijo_semanal_usd != null && f.fijo_semanal_usd !== '' && !(Number(f.fijo_semanal_usd) >= 0)) e.push('El fijo semanal no puede ser negativo.');
    if (f.kiosko_usa && f.pais_nomina === 'MX') e.push('El kiosko USA no aplica a quien cobra solo en México.');
    return e;
  }

  /** Qué flujo de kiosko le toca a la persona, SOLO por su ficha. null = el de México. */
  function perfilKiosko(f) {
    if (!f || !f.kiosko_usa || f.activo === false || f.pais_nomina === 'MX') return null;
    if (f.tipo_pago_usa === 'supervisor_comercial') return 'plan_avance';
    if (f.tipo_pago_usa === 'bolsa_avance' && f.pide_so_entrada) return 'so_entrada';
    return 'usa_simple';
  }

  NU.ficha = { PAISES: PAISES, TIPOS_PAGO: TIPOS_PAGO, ZONAS: ZONAS, validarFicha: validarFicha, perfilKiosko: perfilKiosko };
  if (typeof module !== 'undefined' && module.exports) module.exports = NU.ficha;
})(typeof window !== 'undefined' ? window : globalThis);
