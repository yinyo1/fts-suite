// Build: 20260428-planeacion-f3-export-v3
'use strict';

window.PLANEACION_TURNOS = {
  // Agrupa asignaciones por (SO + sitio) → sub-turnos por (entrada+salida+origen).
  // Las asignaciones sin SO o sin entrada se omiten silenciosamente.
  agruparPorProyectoYTurno(asignaciones){
    const grupos = {};
    (asignaciones || []).forEach(a => {
      if (!a.so_nombre || !a.entrada) return;

      const proyectoKey = (a.so_nombre || '') + '|' + (a.sitio || '—');
      if (!grupos[proyectoKey]){
        grupos[proyectoKey] = {
          so_nombre: a.so_nombre,
          sitio: a.sitio || '',
          turnos: {}
        };
      }
      const turnoKey = a.entrada + '|' + a.salida + '|' + (a.origen || '');
      if (!grupos[proyectoKey].turnos[turnoKey]){
        grupos[proyectoKey].turnos[turnoKey] = {
          entrada: a.entrada,
          salida:  a.salida,
          origen:  a.origen || '',
          personas: []
        };
      }
      grupos[proyectoKey].turnos[turnoKey].personas.push(a);
    });

    return Object.keys(grupos).map(k => grupos[k]);
  },

  // Asignaciones SIN SO asignado — útil para advertir antes de exportar
  asignacionesSinSO(asignaciones){
    return (asignaciones || []).filter(a => !a.so_nombre || !a.entrada);
  }
};
