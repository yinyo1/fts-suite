// ═══ Puente al resolver de incidencias ═══
//
// Este archivo NO inventa un camino de escritura: usa el MISMO que el panel de
// Mi Perfil, `incidencias/resolver` (Oc2ceMHX2O0L0y2X), con el mismo payload y las
// mismas reglas. Dos caminos para escribir el mismo dato es una carrera silenciosa
// en la que el que pierde no deja rastro (CLAUDE.md §20.4).
//
// Las reglas de abajo están copiadas del panel a propósito, no reinterpretadas:
//   · el comentario va con mínimo 10 caracteres
//   · `ajustar` SIEMPRE pide hora final; `aprobar` la pide salvo para supervisor
//   · la hora viaja como HH:MM (el resolver rechaza un datetime completo, §11 #4)
//
// El almacén se lee por la API de GitHub, no por el CDN raw: el raw cachea ~5 min
// y aquí se está decidiendo sobre datos que acaban de cambiar (CLAUDE.md §3).

(function () {
  'use strict';

  var RESOLVER_URL   = 'https://primary-production-5c3c.up.railway.app/webhook/incidencias/resolver';
  var INCIDENCIAS_URL = 'https://api.github.com/repos/yinyo1/fts-suite/contents/shared/incidencias-asistencia.json?ref=main';
  var MIN_COMENTARIO = 10;

  var _cache = null;   // el almacén, cargado una vez por visita a la pantalla

  async function cargarIncidencias(forzar) {
    if (_cache && !forzar) return _cache;
    var res = await fetch(INCIDENCIAS_URL + '&t=' + Date.now(), {
      cache: 'no-store',
      headers: { 'Accept': 'application/vnd.github.v3.raw' }
    });
    if (!res.ok) throw { code: 'ALMACEN_' + res.status, msg: 'No se pudo leer el almacén de incidencias.' };
    var data = await res.json();
    _cache = Array.isArray(data && data.incidencias) ? data.incidencias : [];
    return _cache;
  }

  // La disputa que ve este módulo viene del TAG de Odoo, que guarda el folio en
  // `x_studio_incidencia_pendiente_id`. Ese folio es el `id_interno` del almacén.
  function porFolio(folio) {
    if (!_cache || !folio) return null;
    for (var i = 0; i < _cache.length; i++) if (_cache[i].id_interno === folio) return _cache[i];
    return null;
  }

  // Copiado del panel, sin reinterpretar: supervisor aprobando solo pasa a RH y no
  // fija hora; RH y Dirección sí la fijan porque su aprobación es la que se aplica
  // en Odoo. Ajustar siempre la pide, porque ajustar ES cambiar la hora.
  function requiereHora(accion, rol) {
    if (accion === 'ajustar') return true;
    if (accion === 'aprobar' && rol !== 'supervisor') return true;
    return false;
  }

  var ACCIONES = {
    aprobar:  { label: '✓ Aprobar',  clase: 'ok'  },
    ajustar:  { label: '✎ Ajustar',  clase: 'warn' },
    rechazar: { label: '✕ Rechazar', clase: 'bad' },
    escalar:  { label: '⬆ Escalar a Dirección', clase: 'esc' }
  };

  // Valida ANTES de mandar, con los mismos mínimos que el server. No es para
  // ahorrarle trabajo al server: es para que el error se lea junto al campo que
  // lo causó y no como un rechazo genérico después de esperar.
  function validar(accion, rol, comentario, horaCst) {
    var c = ('' + (comentario || '')).trim();
    if (c.length < MIN_COMENTARIO) {
      return 'El comentario debe tener al menos ' + MIN_COMENTARIO + ' caracteres. ' +
             'Es lo que va a leer quien revise esto después.';
    }
    if (requiereHora(accion, rol)) {
      if (!horaCst) return 'Esta acción fija la hora que se aplica en Odoo. Escríbela.';
      if (!/^[0-9]{2}:[0-9]{2}$/.test(horaCst)) return 'La hora debe ir como HH:MM.';
    }
    return null;
  }

  async function resolver(opts) {
    var payload = {
      id_interno:               opts.id_interno,
      accion:                   opts.accion,
      rol_ejecutor:             opts.rol,
      empleado_ejecutor_id:     opts.actor_id,
      empleado_ejecutor_nombre: opts.actor_nombre,
      comentario:               ('' + opts.comentario).trim()
    };
    if (requiereHora(opts.accion, opts.rol) && opts.hora_cst) payload.hora_final_cst = opts.hora_cst;

    var res, data;
    try {
      res = await fetch(RESOLVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      throw { code: 'NETWORK', msg: 'No se pudo conectar con el resolver.' };
    }
    try { data = await res.json(); } catch (e) { data = null; }

    // El resolver contesta {success:true|false, mensaje}. Un 200 con success:false
    // es un rechazo, no un exito — y tratarlo como exito seria pintar un cambio
    // que no ocurrio (CLAUDE.md §20.5).
    if (!data || data.success !== true) {
      throw { code: (data && data.error) || 'RECHAZADO',
              msg: (data && data.mensaje) || 'El resolver rechazó la acción.' };
    }
    return data;
  }

  window.NomResolver = {
    cargarIncidencias: cargarIncidencias,
    porFolio: porFolio,
    requiereHora: requiereHora,
    validar: validar,
    resolver: resolver,
    ACCIONES: ACCIONES,
    MIN_COMENTARIO: MIN_COMENTARIO,
    RESOLVER_URL: RESOLVER_URL
  };
})();
