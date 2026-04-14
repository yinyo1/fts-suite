// ═══ FTS Operaciones — Módulo Incidencias ═══
// Storage local + tipos de incidencia + helpers de contabilización

const INC_TYPES = {
  vacaciones: {
    label:  '📅 Vacaciones',
    color:  '#0078D4',
    campos: ['fecha_inicio','fecha_fin','comentarios']
  },
  permiso_goce: {
    label:  '🏥 Permiso con goce',
    color:  '#107C10',
    campos: ['fecha','motivo','medio_dia']
  },
  permiso_sin_goce: {
    label:  '🚫 Permiso sin goce',
    color:  '#BF8F00',
    campos: ['fecha','motivo','medio_dia']
  },
  tiempo_extra: {
    label:  '⏰ Tiempo extra',
    color:  '#D83B01',
    campos: ['fecha','horas_extra','so_proyecto'],
    nota:   'Solo disponible si el día ya fue contabilizado'
  },
  olvide_checar: {
    label:  '📍 Olvidé checar',
    color:  '#555',
    campos: ['fecha','tipo_checada','hora_aproximada','motivo']
  },
  incapacidad: {
    label:  '🤒 Incapacidad',
    color:  '#7c3aed',
    campos: ['fecha_inicio','fecha_fin','descripcion']
  }
};

// ─── Storage de incidencias ───

function incKey(id){ return 'inc_' + id; }

function saveIncidencia(data){
  const id = Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  const inc = Object.assign({}, data, {
    id:                  id,
    timestamp:           new Date().toISOString(),
    status:              'pendiente',
    aprobado_por:        null,
    aprobado_timestamp:  null,
    foto_aprobacion:     null
  });
  localStorage.setItem(incKey(id), JSON.stringify(inc));

  // Index global ordenado (más reciente primero)
  let idx;
  try { idx = JSON.parse(localStorage.getItem('inc_index') || '[]'); }
  catch(e){ idx = []; }
  idx.unshift(id);
  localStorage.setItem('inc_index', JSON.stringify(idx));

  return inc;
}

function getIncidencias(filtro){
  let idx;
  try { idx = JSON.parse(localStorage.getItem('inc_index') || '[]'); }
  catch(e){ idx = []; }

  return idx
    .map(function(id){
      try { return JSON.parse(localStorage.getItem(incKey(id))); }
      catch(e){ return null; }
    })
    .filter(function(i){
      if(!i) return false;
      if(!filtro) return true;
      return Object.keys(filtro).every(function(k){
        return i[k] === filtro[k];
      });
    })
    .sort(function(a, b){
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
}

function updateIncidencia(id, changes){
  const raw = localStorage.getItem(incKey(id));
  if(!raw) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch(e){ return null; }
  const updated = Object.assign({}, parsed, changes);
  localStorage.setItem(incKey(id), JSON.stringify(updated));
  return updated;
}

// ─── Contabilización del día ───

function getDiaContabilizado(username, fecha){
  const key = 'cont_' + username + '_' + fecha;
  const raw = localStorage.getItem(key);
  if(!raw) return null;
  try { return JSON.parse(raw); } catch(e){ return null; }
}

function saveDiaContabilizado(data){
  // data: { username, fecha, horas_efectivas_min, horas_extra_min?, supervisor }
  const key = 'cont_' + data.username + '_' + data.fecha;
  const payload = Object.assign({}, data, {
    contabilizado: true,
    timestamp:     new Date().toISOString()
  });
  localStorage.setItem(key, JSON.stringify(payload));
  return payload;
}

function getHorasExtraDisponibles(username, fecha){
  const dia = getDiaContabilizado(username, fecha);
  if(!dia) return null; // No contabilizado todavía → no se pueden pedir horas extra

  const LIMITE = 9.6 * 60; // 576 minutos
  const extra = Math.max(0, (dia.horas_efectivas_min || 0) - LIMITE);

  // Restar horas extra ya aprobadas ese mismo día
  const yaUsadas = getIncidencias({
    username: username,
    tipo:     'tiempo_extra',
    fecha:    fecha,
    status:   'aprobada'
  }).reduce(function(sum, i){
    return sum + (i.horas_min || 0);
  }, 0);

  return Math.max(0, extra - yaUsadas);
}

window.INC_TYPES = INC_TYPES;
window.IncDB = {
  save:                    saveIncidencia,
  get:                     getIncidencias,
  update:                  updateIncidencia,
  getDiaContabilizado:     getDiaContabilizado,
  saveDiaContabilizado:    saveDiaContabilizado,
  getHorasExtraDisponibles: getHorasExtraDisponibles
};
