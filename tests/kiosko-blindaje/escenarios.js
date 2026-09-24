// tests/kiosko-blindaje/escenarios.js
//
// Escenarios deterministas: el caso real de Germán (hr.employee 124, 17 al 23 de
// septiembre de 2026) y un escenario mínimo por bloque del plan de blindaje.
// Cada paso lleva la ejecución de n8n o el registro de Odoo que lo respalda.

'use strict';

const { cst } = require('./sistema');

const EMP = 124;

// ─── Caso Germán, tal como pasó con el diseño de HOY ───────────────────────
function germanHoy() {
  return [
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 17, 6, 58, 11), boton: 'entrada',
      desc: 'Jue 17 06:58 entrada (exec 102334, crea 15549)' },
    { tipo: 'falla', fallas: { redCaida: 3 }, desc: 'Jue 17 17:22 la red no entrega (sin ejecución de n8n; 24 salidas 103422..103751, ninguna del 124)' },
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 17, 17, 22, 37), boton: 'salida',
      desc: 'Jue 17 17:22 salida que nunca llega' },
    { tipo: 'falla', fallas: { lecturaOdoo: 1 }, desc: 'Vie 18 07:30 "Buscar pendientes" ECONNRESET a los 134,893 ms (exec 104284)' },
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 18, 7, 30, 5), boton: 'resolver',
      desc: 'Vie 18 07:30 "Resolver ahora" (exec 104284; Railway: 3 POST HTTP 499)' },
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 18, 10, 27, 49), boton: 'resolver',
      desc: 'Vie 18 10:27 "Resolver ahora": auto-rescate cierra 15549 a 9.6 h y crea 15588 (exec 104626)' },
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 18, 10, 28, 27), boton: 'salida', args: { so: 121 },
      desc: 'Vie 18 10:28 salida a los 38 s para poder declarar su hora real (exec 104629)' },
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 18, 10, 29, 21), boton: 'olvide_entrada', args: { hora: cst(2026, 9, 18, 7, 30) },
      desc: 'Vie 18 10:29 "Llegué pero olvidé checar entrada" 07:30: crea 15589 (exec 104631 y 104632)' },
    { tipo: 'rh', op: 'resolver', inc: '@auto_cierre', accion: 'ajustar', hhmm: '17:01', t: cst(2026, 9, 18, 10, 42, 2),
      desc: 'Vie 18 10:42 Magaly ajusta el auto-cierre a 17:01 (resolver 104680)' },
    { tipo: 'rh', op: 'resolver', inc: '@olvido_entrada', accion: 'ajustar', hhmm: '07:30', t: cst(2026, 9, 18, 11, 46, 1),
      desc: 'Vie 18 11:46 Ana ajusta la entrada a 07:30 (resolver 104773)' },
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 18, 17, 9, 14), boton: 'salida', args: { so: 121 },
      desc: 'Vie 18 17:09 salida (exec 105451; Railway: HTTP 200)' },
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 21, 6, 47, 40), boton: 'resolver',
      desc: 'Lun 21 06:47 "Resolver ahora" (exec 107543; Railway: HTTP 200)' },
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 21, 16, 37, 40), boton: 'resolver',
      desc: 'Lun 21 16:37 "Resolver ahora" (exec 108227)' },
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 22, 7, 15, 0), boton: 'resolver',
      desc: 'Mar 22 07:15 "Resolver ahora" (exec 108971; Railway: HTTP 200)' },
    { tipo: 'bloqueo?', emp: EMP, t: cst(2026, 9, 22, 10, 22), desc: 'Mar 22 10:22 ¿hay salida desde la suite?' },
    { tipo: 'watchdog', t: cst(2026, 9, 25, 8, 0), desc: 'Vie 25 08:00 rh/watchdog/sin-checkin' }
  ];
}

// ─── Caso Germán con el diseño nuevo: mismas intenciones, botones nuevos ───
function germanNuevo() {
  return [
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 17, 6, 58, 11), boton: 'entrada', desc: 'Jue 17 06:58 entrada' },
    { tipo: 'falla', fallas: { redCaida: 3 }, desc: 'Jue 17 17:22 la red no entrega' },
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 17, 17, 22, 37), boton: 'salida',
      desc: 'Jue 17 17:22 salida: ahora la pantalla dice que NO se guardó (B1)' },
    { tipo: 'falla', fallas: { lecturaOdoo: 3 }, desc: 'Vie 18 07:30 Odoo no responde a la lectura, tres veces' },
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 18, 7, 30, 5), boton: 'olvide_salida', args: { tecleada: '17:22' },
      desc: 'Vie 18 07:30 en huérfano (B6: 16 h o más) declara su salida real 17:22 (B7)' },
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 18, 7, 31, 0), boton: 'entrada',
      desc: 'Vie 18 07:31 entrada: Odoo no responde; no se asume nada y se dice (B2 + B1)' },
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 18, 10, 27, 49), boton: 'olvide_entrada', args: { hora: cst(2026, 9, 18, 7, 30) },
      desc: 'Vie 18 10:27 "Llegué pero olvidé checar entrada" 07:30, sin salida intermedia' },
    { tipo: 'rh', op: 'resolver', inc: '@olvido_checkout', accion: 'ajustar', hhmm: '17:22', t: cst(2026, 9, 18, 10, 42),
      desc: 'Vie 18 10:42 RH confirma la salida del jueves 17:22' },
    { tipo: 'rh', op: 'resolver', inc: '@olvido_entrada', accion: 'ajustar', hhmm: '07:30', t: cst(2026, 9, 18, 11, 46),
      desc: 'Vie 18 11:46 RH ajusta la entrada a 07:30: no hay nada en medio (B3 revisa)' },
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 18, 17, 9, 14), boton: 'salida', args: { so: 121 }, desc: 'Vie 18 17:09 salida' },
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 21, 6, 47, 40), boton: 'entrada', desc: 'Lun 21 06:47 entrada' },
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 21, 17, 7, 59), boton: 'salida', desc: 'Lun 21 17:07 salida' },
    { tipo: 'accion', emp: EMP, t: cst(2026, 9, 22, 7, 15, 0), boton: 'entrada', desc: 'Mar 22 07:15 entrada' },
    { tipo: 'bloqueo?', emp: EMP, t: cst(2026, 9, 22, 10, 22), desc: 'Mar 22 10:22 ¿hay salida desde la suite?' },
    { tipo: 'watchdog', t: cst(2026, 9, 25, 8, 0), desc: 'Vie 25 08:00 watchdog' }
  ];
}

// El estado real que dejó el caso (sirve para B7 y B8): 15589 abierto envolviendo a 15588.
function estadoTrabado() {
  return germanHoy().slice(0, 10);
}

// ─── Un escenario mínimo por bloque ────────────────────────────────────────
// `inv` es la invariante que el bloque debe hacer cumplir en ese escenario.
const D = (d, h, m) => cst(2026, 9, d, h, m || 0);

const POR_BLOQUE = {
  B1: { inv: ['I2', 'I3'], titulo: 'Visibilidad: la red cae en la salida',
    pasos: () => [
      { tipo: 'accion', emp: 1, t: D(14, 7), boton: 'entrada' },
      { tipo: 'falla', fallas: { redCaida: 3 } },
      { tipo: 'accion', emp: 1, t: D(14, 17), boton: 'salida' }
    ] },
  B2: { inv: ['I5'], titulo: 'Fail-closed: Odoo no responde a la lectura con un abierto de ayer',
    pasos: () => [
      { tipo: 'accion', emp: 1, t: D(14, 7), boton: 'entrada' },
      { tipo: 'falla', fallas: { lecturaOdoo: 1 } },
      { tipo: 'accion', emp: 1, t: D(15, 7, 5), boton: 'resolver' }
    ] },
  B3: { inv: ['I1'], titulo: 'Candado de traslape: RH mueve una entrada por encima de otro registro',
    pasos: () => estadoTrabado() },
  B4: { inv: ['I6'], titulo: 'resolver aplica la hora de RH en auto_cierre y en "aprobar tal cual"',
    pasos: () => [
      { tipo: 'accion', emp: 1, t: D(14, 7), boton: 'entrada' },
      { tipo: 'accion', emp: 1, t: D(15, 7, 5), boton: 'resolver' },
      { tipo: 'rh', op: 'resolver', inc: '@auto_cierre', accion: 'ajustar', hhmm: '17:01', t: D(15, 10) },
      { tipo: 'accion', emp: 1, t: D(15, 17), boton: 'salida' },
      { tipo: 'accion', emp: 1, t: D(16, 9), boton: 'olvide_entrada', args: { hora: D(16, 7) } },
      { tipo: 'rh', op: 'resolver', inc: '@olvido_entrada', accion: 'aprobar', hhmm: '07:00', t: D(16, 11) }
    ] },
  B5: { inv: ['I1'], titulo: 'Corregir hora de entrada sin doble sesión: auto-rescate tardío y ajuste de RH',
    pasos: (d) => [
      { tipo: 'accion', emp: 1, t: D(14, 7), boton: 'entrada' },
      d.B5
        ? { tipo: 'accion', emp: 1, t: D(15, 10, 27), boton: 'resolver', args: { hora_real: D(15, 7, 30) } }
        : { tipo: 'accion', emp: 1, t: D(15, 10, 27), boton: 'resolver' },
      ...(d.B5 ? [] : [
        { tipo: 'accion', emp: 1, t: D(15, 10, 28), boton: 'salida' },
        { tipo: 'accion', emp: 1, t: D(15, 10, 29), boton: 'olvide_entrada', args: { hora: D(15, 7, 30) } }
      ]),
      { tipo: 'rh', op: 'resolver', inc: '@olvido_entrada', accion: 'ajustar', hhmm: '07:30', t: D(15, 11, 46) }
    ] },
  B6: { inv: ['I7', 'I8'], titulo: 'Umbrales únicos y búsqueda sin ventana: huérfano de 16 días y zona gris de 20 h',
    pasos: () => [
      { tipo: 'accion', emp: 1, t: D(1, 7), boton: 'entrada' },
      { tipo: 'accion', emp: 1, t: D(17, 7), boton: 'entrada', alt: 'resolver' },
      { tipo: 'accion', emp: 2, t: D(14, 11), boton: 'entrada' },
      { tipo: 'accion', emp: 2, t: D(15, 7), boton: 'segui_en_turno', alt: 'resolver' }
    ] },
  B7: { inv: ['I4:empleado'], titulo: 'Salida de emergencia en error_critico cuando el auto-rescate no puede cerrar',
    pasos: () => estadoTrabado().concat([{ tipo: 'bloqueo?', emp: EMP, t: D(21, 7) }]) },
  B8: { inv: ['I4:rh'], titulo: 'Reparar registro: RH destraba sin entrar al backend',
    pasos: () => estadoTrabado().concat([{ tipo: 'bloqueo?', emp: EMP, t: D(21, 7) }]) },
  B9: { inv: ['I8'], titulo: 'Guarda AM/PM: "05:05" cuando quiso decir 17:05',
    pasos: () => [
      { tipo: 'accion', emp: 1, t: D(17, 6, 57) , boton: 'entrada' },
      // Como 14966: la entrada del 17-ago a las 06:57 y el olvido declarado a la mañana siguiente.
      { tipo: 'accion', emp: 1, t: D(18, 6, 48), boton: 'olvide_salida', args: { tecleada: '05:05' } },
      { tipo: 'rh', op: 'resolver', inc: '@olvido_checkout', accion: 'aprobar', hhmm: null, t: D(18, 9) }
    ] },
  B10: { inv: ['I9'], titulo: 'Watchdog: el que intentó y falló no es un ausente',
    pasos: () => estadoTrabado().concat([
      { tipo: 'accion', emp: EMP, t: D(21, 6, 47), boton: 'resolver' },
      { tipo: 'accion', emp: EMP, t: D(21, 7, 14), boton: 'resolver' },
      { tipo: 'watchdog', t: D(21, 16) },
      { tipo: 'watchdog', t: D(25, 8) }
    ]) }
};

module.exports = { germanHoy, germanNuevo, estadoTrabado, POR_BLOQUE, EMP };
