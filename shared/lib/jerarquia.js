// ═══ Jerarquía de incidencias (fts-suite#501 Fase 2) ═══
// Quién autoriza una incidencia, calculado EN VIVO desde el organigrama de Odoo
// (`parent_id`, que trae shared/config/empleados-master.json, sincronizado al cambiar) y
// desde quién tiene cuenta personal activa. Nada escrito a mano: ni ids, ni nombres, ni
// departamentos.
//
// Regla (decidida en #501):
//   1. Se sube por la cadena de jefes desde la persona de la incidencia.
//   2. El primer jefe CON cuenta personal activa es quien autoriza.
//   3. Si hay que saltarse a alguien porque no tiene cuenta activa, la incidencia va
//      «escalada» y se avisa a RH (no se atora).
//   4. El jefe de arriba de todo (quien es su propio jefe) no autoriza como supervisor:
//      de él la incidencia pasa a RH, igual que la tabla F2.1 (directo_ceo → pendiente_rh).
//   5. Sin jefe, jefe fuera del padrón o un ciclo → RH, con su motivo.
//
// Función pura: no toca la red ni el DOM. La usa el panel de incidencias y la prueba
// tests/seguridad/jerarquia.js.
(function (G) {
  'use strict';

  function idDe(v) {
    if (v == null || v === false) return null;
    if (Array.isArray(v)) return Number(v[0]) || null;
    if (typeof v === 'object') return Number(v.id) || null;
    return Number(v) || null;
  }

  /** Índice id → {id, parent_id, name} desde empleados-master.json ({empleados:[...]}) o un arreglo. */
  function indice(master) {
    const lista = Array.isArray(master) ? master : ((master && master.empleados) || []);
    const ix = {};
    lista.forEach(function (e) { const id = idDe(e && e.id); if (id) ix[id] = { id: id, parent_id: idDe(e.parent_id), name: e.name || null }; });
    return ix;
  }

  /** Cadena de jefes de una persona (sin incluirla): [jefe, jefe del jefe, …]. Se corta en ciclo o en la cima. */
  function cadena(empleadoId, ix) {
    const out = [], vistos = {};
    let actual = ix[idDe(empleadoId)];
    vistos[idDe(empleadoId)] = true;
    while (actual && actual.parent_id && actual.parent_id !== actual.id) {
      if (vistos[actual.parent_id]) { out.push({ id: actual.parent_id, ciclo: true }); break; }
      vistos[actual.parent_id] = true;
      const jefe = ix[actual.parent_id];
      out.push({ id: actual.parent_id, fuera: !jefe, cima: !!(jefe && (!jefe.parent_id || jefe.parent_id === jefe.id)) });
      if (!jefe) break;
      actual = jefe;
    }
    return out;
  }

  /**
   * ¿Quién autoriza a esta persona como supervisor?
   * @param empleadoId  persona de la incidencia
   * @param ix          indice(master)
   * @param conCuenta   función (empleado_id) → true si tiene cuenta personal ACTIVA
   * @returns { destino: 'supervisor'|'rh', aprobador_id, escalada, saltados:[ids], motivo }
   */
  function aprobador(empleadoId, ix, conCuenta) {
    const yo = ix[idDe(empleadoId)];
    if (!yo) return { destino: 'rh', aprobador_id: null, escalada: true, saltados: [], motivo: 'fuera_del_padron' };
    if (!yo.parent_id) return { destino: 'rh', aprobador_id: null, escalada: true, saltados: [], motivo: 'sin_jefe' };
    if (yo.parent_id === yo.id) return { destino: 'rh', aprobador_id: null, escalada: false, saltados: [], motivo: 'es_la_cima' };
    const saltados = [];
    const c = cadena(yo.id, ix);
    for (let i = 0; i < c.length; i++) {
      const j = c[i];
      if (j.ciclo) return { destino: 'rh', aprobador_id: null, escalada: true, saltados: saltados, motivo: 'ciclo' };
      if (j.fuera) return { destino: 'rh', aprobador_id: null, escalada: true, saltados: saltados.concat([j.id]), motivo: 'jefe_fuera_del_padron' };
      if (j.cima) return { destino: 'rh', aprobador_id: null, escalada: saltados.length > 0, saltados: saltados, motivo: saltados.length ? 'escalada_hasta_la_cima' : 'directo_a_la_cima' };
      if (conCuenta(j.id)) return { destino: 'supervisor', aprobador_id: j.id, escalada: saltados.length > 0, saltados: saltados, motivo: saltados.length ? 'jefe_sin_cuenta' : 'normal' };
      saltados.push(j.id);
    }
    return { destino: 'rh', aprobador_id: null, escalada: true, saltados: saltados, motivo: 'cadena_sin_cuenta' };
  }

  /** Huecos del organigrama para el reporte: sin jefe, jefe fuera del padrón, ciclos, jefes sin cuenta. */
  function huecos(ix, conCuenta) {
    const out = { sin_jefe: [], jefe_fuera: [], ciclos: [], jefes_sin_cuenta: [] };
    const jefes = {};
    Object.keys(ix).forEach(function (k) {
      const e = ix[k];
      if (!e.parent_id) { out.sin_jefe.push(e.id); return; }
      if (e.parent_id !== e.id) jefes[e.parent_id] = true;
      const c = cadena(e.id, ix);
      if (c.some(function (x) { return x.ciclo; })) out.ciclos.push(e.id);
      if (c.some(function (x) { return x.fuera; })) out.jefe_fuera.push(e.id);
    });
    Object.keys(jefes).forEach(function (k) { const id = Number(k); if (ix[id] && !conCuenta(id)) out.jefes_sin_cuenta.push(id); });
    return out;
  }

  const api = { indice: indice, cadena: cadena, aprobador: aprobador, huecos: huecos };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (G) G.FTSJerarquia = api;
})(typeof window !== 'undefined' ? window : null);
