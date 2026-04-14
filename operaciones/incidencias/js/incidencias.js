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

// ─── GitHub sync ───

const INC_GITHUB_FILE = 'shared/incidencias.json';
const INC_GITHUB_REPO = 'yinyo1/fts-suite';

async function githubPull(){
  try{
    const token = localStorage.getItem('ops_github_token');
    let data;
    if(token){
      const res = await fetch(
        'https://api.github.com/repos/' + INC_GITHUB_REPO + '/contents/' + INC_GITHUB_FILE + '?ref=main&t=' + Date.now(),
        { headers: {
            'Authorization': 'token ' + token,
            'Accept':        'application/vnd.github.v3+json'
        }}
      );
      if(res.status === 404) return [];
      if(!res.ok) throw new Error('GitHub ' + res.status);
      const file = await res.json();
      const cleanB64 = (file.content || '').replace(/\n/g, '');
      data = JSON.parse(decodeURIComponent(escape(atob(cleanB64))));
    } else {
      const res = await fetch(
        'https://raw.githubusercontent.com/' + INC_GITHUB_REPO + '/main/' + INC_GITHUB_FILE + '?nocache=' + Math.random() + '&t=' + Date.now(),
        { cache:'no-store' }
      );
      if(!res.ok) return [];
      data = await res.json();
    }
    const incs = (data && data.incidencias) || [];
    incs.forEach(function(inc){
      localStorage.setItem(incKey(inc.id), JSON.stringify(inc));
    });
    localStorage.setItem('inc_index', JSON.stringify(incs.map(function(i){ return i.id; })));
    return incs;
  } catch(e){
    console.warn('[IncDB] Pull falló:', e.message);
    return [];
  }
}

async function githubPush(incidencia){
  const token  = localStorage.getItem('ops_github_token');
  const n8nUrl = localStorage.getItem('ops_n8n_url');

  // ── Opción A: GitHub API directo (master/supervisor con token) ──
  if(token){
    try{
      const shaRes = await fetch(
        'https://api.github.com/repos/' + INC_GITHUB_REPO + '/contents/' + INC_GITHUB_FILE + '?ref=main&t=' + Date.now(),
        { headers: {
            'Authorization': 'token ' + token,
            'Accept':        'application/vnd.github.v3+json'
        }}
      );
      let existingIncs = [];
      let sha = null;
      if(shaRes.ok){
        const file = await shaRes.json();
        sha = file.sha;
        const cleanB64 = (file.content || '').replace(/\n/g, '');
        const parsed = JSON.parse(decodeURIComponent(escape(atob(cleanB64))));
        existingIncs = (parsed && parsed.incidencias) || [];
      }
      const idx = existingIncs.findIndex(function(i){ return i.id === incidencia.id; });
      if(idx >= 0) existingIncs[idx] = incidencia;
      else existingIncs.unshift(incidencia);

      const content = JSON.stringify({ incidencias: existingIncs }, null, 2);
      const body = {
        message: 'Incidencia ' + incidencia.tipo + ' de ' + incidencia.username,
        content: btoa(unescape(encodeURIComponent(content))),
        branch:  'main'
      };
      if(sha) body.sha = sha;

      const putRes = await fetch(
        'https://api.github.com/repos/' + INC_GITHUB_REPO + '/contents/' + INC_GITHUB_FILE,
        { method:'PUT',
          headers:{
            'Authorization':'token ' + token,
            'Accept':       'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        }
      );
      if(putRes.ok) return true;
    } catch(e){
      console.warn('[IncDB] Push directo falló:', e.message);
    }
  }

  // ── Opción B: via n8n proxy (empleados sin token) ──
  if(n8nUrl){
    try{
      const res = await fetch(
        n8nUrl.replace(/\/$/, '') + '/webhook/incidencias/push',
        { method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ incidencia: incidencia })
        }
      );
      if(res.ok){
        console.log('[IncDB] Synced via n8n:', incidencia.id);
        return true;
      }
    } catch(e){
      console.warn('[IncDB] Push n8n falló:', e.message);
    }
  }

  console.warn('[IncDB] Sin token ni n8n — solo local:', incidencia.id);
  return false;
}

// Wrappers con sync automático
function saveIncidenciaSync(data){
  const inc = saveIncidencia(data);
  githubPush(inc).then(function(ok){
    if(ok) console.log('[IncDB] Synced:', inc.id);
  });
  return inc;
}

function updateIncidenciaSync(id, changes){
  const updated = updateIncidencia(id, changes);
  if(updated){
    githubPush(updated).then(function(ok){
      if(ok) console.log('[IncDB] Updated:', id);
    });
  }
  return updated;
}

window.IncDB = {
  save:                     saveIncidenciaSync,
  get:                      getIncidencias,
  update:                   updateIncidenciaSync,
  pull:                     githubPull,
  push:                     githubPush,
  getDiaContabilizado:      getDiaContabilizado,
  saveDiaContabilizado:     saveDiaContabilizado,
  getHorasExtraDisponibles: getHorasExtraDisponibles
};
