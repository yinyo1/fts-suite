// ═══ FTS Kiosk — flujo USA de nómina por persona (#448, fase B) ═══
//
// QUÉ HACE: para las personas marcadas en shared/nomina-usa/kiosko.json, y SOLO si la
// checada viene de Estados Unidos, agrega una pantalla antes de la checada normal:
//   · SO al entrar (perfil so_entrada: Mateo, José Luis).
//   · Plan del día al entrar y, al salir, avance de los proyectos + «tu día» (perfil
//     plan_avance: Ricardo).
//   · Sin ubicación: pregunta «¿Hoy trabajas en USA o en México?» y marca el día para RH.
//
// QUÉ NO HACE: no toca la checada de nadie más ni el payload de /kiosk/checkin. Lo nuevo
// viaja aparte a /webhook/nomina-usa/kiosko; si ese webhook falla, el evento se guarda en
// el dispositivo y se reintenta, y la checada sigue (blindaje #282 I4: nunca se deja a
// nadie sin checar). Con el interruptor apagado, o la persona sin bandera, o checando
// desde México, este archivo devuelve 'sigue' y el kiosko hace exactamente lo de hoy.
(function(){
  'use strict';
  var R = window.NominaUSA && window.NominaUSA.kiosko;
  var URL_CFG = '../../shared/nomina-usa/kiosko.json';
  var COLA = 'nusa_kiosko_pendientes';
  var st = { cfg: null };

  function cargarConfig(){
    return fetch(URL_CFG + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function(r){ if(!r.ok) throw new Error('HTTP_' + r.status); return r.json(); })
      .then(function(j){ st.cfg = j; return j; })
      .catch(function(e){ st.cfg = { activo: false, _error: e.message }; return st.cfg; });
  }
  function persona(empId){
    var c = st.cfg; if(!c || !c.personas) return null;
    return c.personas[String(empId)] || null;
  }
  // Puerta barata: sin interruptor o sin bandera, ni red ni pantalla.
  function aplica(emp){
    var p = emp && persona(emp.id);
    return !!(R && st.cfg && st.cfg.activo === true && p && p.activo === true);
  }

  // ── cola local de eventos ──
  function leerCola(){ try{ return JSON.parse(localStorage.getItem(COLA) || '[]'); } catch(e){ return []; } }
  function guardarCola(a){ try{ localStorage.setItem(COLA, JSON.stringify(a.slice(-50))); } catch(e){} }
  async function enviar(ev){
    try{
      var r = await n8nFetch('/webhook/nomina-usa/kiosko', ev, 0);
      if(r && r.ok === false && r.error !== 'DUPLICADO') throw new Error(r.error || 'RECHAZADO');
      return r || { ok: true };
    } catch(e){
      var c = leerCola(); if(!c.some(function(x){ return x.ev_id === ev.ev_id; })){ c.push(ev); guardarCola(c); }
      return { ok: false, encolado: true, error: e.message };
    }
  }
  async function vaciarCola(){
    var c = leerCola(); if(!c.length) return;
    var quedan = [];
    for(var i = 0; i < c.length; i++){
      try{ var r = await n8nFetch('/webhook/nomina-usa/kiosko', c[i], 0); if(r && r.ok === false && r.error !== 'DUPLICADO') quedan.push(c[i]); }
      catch(e){ quedan.push(c[i]); }
    }
    guardarCola(quedan);
  }

  function base(tipo, pais, origen){
    var now = new Date(), emp = K.seleccionado || {};
    var tz = window.ZonaUSA ? window.ZonaUSA.zonaHorariaLocal(now) : { tz: null, utc_offset_min: -now.getTimezoneOffset() };
    return { accion: 'evento', ev_id: 'ev_' + emp.id + '_' + now.getTime() + '_' + tipo, tipo: tipo, employee_id: emp.id || null,
      ts_evento: now.toISOString(), checada: K.tipo, pais: pais, pais_origen: origen, pendiente_rh: origen === 'declarado',
      tz_evento: tz.tz, utc_offset_min: tz.utc_offset_min,
      lat: (K.geo && K.geo.lat != null) ? K.geo.lat : null, lng: (K.geo && K.geo.lng != null) ? K.geo.lng : null,
      geo_zona: K.geoZona || null, kiosk_build: window.KIOSK_BUILD || null };
  }

  async function contexto(empId){
    try{
      return await Promise.race([
        n8nFetch('/webhook/nomina-usa/kiosko', { accion: 'contexto', employee_id: empId, checada: K.tipo, tz_evento: (window.ZonaUSA ? window.ZonaUSA.zonaHorariaLocal(new Date()).tz : null) }, 0),
        new Promise(function(_, rej){ setTimeout(function(){ rej(new Error('TIMEOUT_6S')); }, 6000); })
      ]);
    } catch(e){ return { ok: false, error: e.message }; }
  }

  // ── UI ──
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }

  var CSS = '.nusa-ov{position:fixed;inset:0;background:rgba(0,0,0,.88);display:flex;align-items:flex-start;justify-content:center;z-index:9998;padding:16px;box-sizing:border-box;overflow-y:auto}' +
    '.nusa-box{background:#1a1a1a;color:#eee;border:2px solid #0078D4;border-radius:16px;padding:20px;max-width:560px;width:100%;box-sizing:border-box;margin:auto 0;font-family:inherit}' +
    '.nusa-box h2{margin:4px 0 6px;font-size:20px;text-align:center}.nusa-box h3{margin:0 0 4px;font-size:15px}.nusa-box p{color:#aaa;font-size:14px;margin:0 0 10px}' +
    '.nusa-ico{font-size:40px;text-align:center}.nusa-sec{border:1px solid #333;border-radius:12px;padding:12px;margin:10px 0}' +
    '.nusa-a{border-color:#0078D4}.nusa-b{border-color:#107C10}' +
    '.nusa-fila{display:flex;gap:8px;align-items:center;margin:6px 0}.nusa-fila.mal .nusa-pct{border-color:#D83B01}' +
    '.nusa-in{background:#0a0a0a;color:#fff;border:1px solid #555;border-radius:8px;padding:10px;font-size:15px;box-sizing:border-box;min-width:0;font-family:inherit}' +
    'select.nusa-in,#nusaBuscar,#nusaExplica{flex:1;width:100%}.nusa-pct{width:72px;text-align:right;flex:none}' +
    '.nusa-com,.nusa-sonom{flex:1;font-weight:600;min-width:0}.nusa-sonom small{display:block;color:#888;font-weight:400}' +
    '.nusa-x{background:none;border:none;color:#888;font-size:18px;cursor:pointer}' +
    '.nusa-pie{display:flex;justify-content:space-between;align-items:center;margin-top:6px}.nusa-suma.ok{color:#4caf50}.nusa-suma.mal{color:#f1707a}' +
    '.nusa-dos{display:flex;gap:10px;margin-top:12px}.nusa-btn{flex:1;background:#333;color:#fff;border:none;padding:14px;border-radius:8px;font-size:16px;cursor:pointer;font-family:inherit}' +
    '.nusa-btn.pri{background:#0078D4;font-weight:700}.nusa-link{background:none;border:none;color:#6cb0f0;cursor:pointer;font-size:14px;padding:8px;display:block;margin:6px auto 0;font-family:inherit}' +
    '.nusa-lista{max-height:46vh;overflow-y:auto;margin:8px 0}.nusa-so{display:block;width:100%;text-align:left;background:#222;color:#fff;border:1px solid #333;border-radius:8px;padding:12px;margin:6px 0;font-size:15px;cursor:pointer;font-family:inherit}' +
    '.nusa-so small{display:block;color:#888}.nusa-warn{color:#e3b341!important}.nusa-err{background:#3a1d1f;color:#f1707a;border-radius:8px;padding:10px;margin-top:10px;font-size:14px}';
  function ponerCss(){ if(document.getElementById('nusaCss')) return; var s = document.createElement('style'); s.id = 'nusaCss'; s.textContent = CSS; document.head.appendChild(s); }
  function overlay(html){
    ponerCss(); cerrar();
    var m = document.createElement('div');
    m.id = 'nusaOverlay'; m.className = 'nusa-ov';
    m.innerHTML = '<div class="nusa-box">' + html + '</div>';
    document.body.appendChild(m);
    // Un error viejo no se queda pintado cuando la persona ya lo corrigió.
    m.addEventListener('input', function(){ errorEn(m, ''); });
    m.addEventListener('change', function(){ errorEn(m, ''); });
    return m;
  }
  function cerrar(){ var m = document.getElementById('nusaOverlay'); if(m) m.remove(); }
  function errorEn(m, t){ var e = m.querySelector('.nusa-err'); if(e){ e.textContent = t || ''; e.style.display = t ? '' : 'none'; } }
  function soNombre(s){ return (s && (s.name || s.nombre)) || ('SO ' + (s && s.id)); }
  function catalogo(){ return (Array.isArray(K.sosUsa) && K.sosUsa.length) ? K.sosUsa : (K.sos || []); }
  function opcionesSO(sel){
    return '<option value="">Elige la SO…</option>' + catalogo().map(function(s){
      return '<option value="' + s.id + '"' + (String(s.id) === String(sel) ? ' selected' : '') + '>' + esc((s._empresa ? s._empresa + ' · ' : '') + soNombre(s)) + '</option>';
    }).join('');
  }
  function buscarSO(id){ return catalogo().find(function(s){ return String(s.id) === String(id); }) || null; }
  function soDeObj(s){ return s ? { id: s.id, nombre: soNombre(s), company_id: s._company_id || null } : null; }

  // ── Pregunta de país (sin ubicación) ──
  function preguntarPais(){
    return new Promise(function(res){
      var m = overlay('<div class="nusa-ico">📍</div><h2>No pudimos leer tu ubicación</h2>' +
        '<p>¿Hoy trabajas en USA o en México? Tu día quedará marcado para que RH lo valide.</p>' +
        '<div class="nusa-dos"><button class="nusa-btn" data-pais="MX">🇲🇽 México</button><button class="nusa-btn pri" data-pais="USA">🇺🇸 USA</button></div>' +
        '<button class="nusa-link" data-pais="">Cancelar</button>');
      m.addEventListener('click', function(ev){ var b = ev.target.closest('[data-pais]'); if(!b) return; cerrar(); res(b.dataset.pais || null); });
    });
  }

  // ── SO al entrar (Mateo, José Luis) ──
  async function soEntrada(pais, origen){
    if(typeof cargarCatalogoUsa === 'function'){ try{ await cargarCatalogoUsa(); } catch(e){} }
    var lista = catalogo();
    var m = overlay('<div class="nusa-ico">🏗️</div><h2>¿En qué SO trabajas hoy?</h2>' +
      '<p>Estás en USA: elige la SO para poder checar tu entrada.</p>' +
      '<input class="nusa-in" id="nusaBuscar" placeholder="Buscar SO o cliente" autocomplete="off">' +
      '<div class="nusa-lista" id="nusaLista"></div>' +
      (lista.length ? '' : '<p class="nusa-warn">No cargó el catálogo de SO. Puedes entrar y RH completará la SO.</p><button class="nusa-btn" id="nusaSinCat">Entrar sin catálogo</button>') +
      '<div class="nusa-err" style="display:none"></div><button class="nusa-link" id="nusaCancel">Cancelar</button>');
    function pintar(q){
      var n = (q || '').toLowerCase();
      document.getElementById('nusaLista').innerHTML = lista.filter(function(s){ return !n || (soNombre(s) + ' ' + (s.cliente || '') + ' ' + (s._empresa || '')).toLowerCase().indexOf(n) >= 0; })
        .slice(0, 60).map(function(s){ return '<button class="nusa-so" data-so="' + s.id + '">' + (s._empresa ? '<b>' + esc(s._empresa) + '</b> ' : '') + esc(soNombre(s)) + (s.cliente ? '<small>' + esc(s.cliente) + '</small>' : '') + '</button>'; }).join('') || '<p class="nusa-warn">Sin resultados</p>';
    }
    pintar('');
    return new Promise(function(res){
      m.querySelector('#nusaBuscar').addEventListener('input', function(e){ pintar(e.target.value); });
      m.addEventListener('click', async function(ev){
        if(ev.target.id === 'nusaCancel'){ cerrar(); return res('cancelado'); }
        var b = ev.target.closest('[data-so]'), sinCat = ev.target.id === 'nusaSinCat';
        if(!b && !sinCat) return;
        var so = b ? soDeObj(buscarSO(b.dataset.so)) : null;
        var e = Object.assign(base('entrada_so', pais, origen), { so: so, so_pendiente: !so, motivo: so ? null : 'CATALOGO_NO_DISPONIBLE' });
        cerrar(); await enviar(e); res('ok');
      });
    });
  }

  // ── Renglones de reparto (plan y «tu día») ──
  function filaReparto(clave, pct){
    var com = clave === 'COMERCIAL';
    return '<div class="nusa-fila" data-fila>' +
      (com ? '<span class="nusa-com">Comercial</span><input type="hidden" data-clave value="COMERCIAL">'
           : '<select class="nusa-in" data-clave>' + opcionesSO(clave) + '</select>') +
      '<input class="nusa-in nusa-pct" data-pct inputmode="numeric" value="' + (pct == null ? '' : pct) + '"><span>%</span>' +
      (com ? '' : '<button class="nusa-x" data-quitar title="Quitar">✕</button>') + '</div>';
  }
  function leerReparto(cont){
    return Array.prototype.map.call(cont.querySelectorAll('[data-fila]'), function(f){
      var c = f.querySelector('[data-clave]').value, p = f.querySelector('[data-pct]').value;
      return { clave: c || '', pct: p === '' ? null : Number(p) };
    });
  }
  function aRenglones(lineas){
    return lineas.filter(function(l){ return l.pct > 0; }).map(function(l){
      if(l.clave === 'COMERCIAL') return { clave: 'COMERCIAL', pct: l.pct };
      var s = buscarSO(l.clave); return { clave: String(l.clave), so_id: Number(l.clave), so_nombre: soNombre(s), company_id: s && s._company_id || null, pct: l.pct };
    });
  }
  function sumaTxt(cont){ var s = leerReparto(cont).reduce(function(a, l){ return a + (Number(l.pct) || 0); }, 0); return s; }
  function cablearReparto(m, cont){
    function act(){ var s = sumaTxt(cont), el = m.querySelector('[data-suma="' + cont.id + '"]'); if(el){ el.textContent = 'Suma: ' + s + '%'; el.className = 'nusa-suma ' + (s === 100 ? 'ok' : 'mal'); } }
    cont.addEventListener('input', act); cont.addEventListener('change', act);
    cont.addEventListener('click', function(ev){ if(ev.target.matches('[data-quitar]')){ ev.target.closest('[data-fila]').remove(); act(); } });
    var add = m.querySelector('[data-agregar="' + cont.id + '"]');
    if(add) add.addEventListener('click', function(){
      var com = cont.querySelector('.nusa-com');
      if(com) com.parentNode.insertAdjacentHTML('beforebegin', filaReparto('', '')); else cont.insertAdjacentHTML('beforeend', filaReparto('', ''));
      act();
    });
    act();
  }

  // ── Avances (pendientes de la entrada o de la salida) ──
  function filasAvance(items){
    return items.map(function(a){
      return '<div class="nusa-fila" data-av="' + a.so_id + '" data-ultimo="' + (a.ultimo || 0) + '" data-nombre="' + esc(a.so_nombre) + '">' +
        '<span class="nusa-sonom">' + esc(a.so_nombre || ('SO ' + a.so_id)) + '<small>último: ' + (a.ultimo || 0) + '%</small></span>' +
        '<input class="nusa-in nusa-pct" data-pct inputmode="numeric" value="' + (a.ultimo || 0) + '"><span>%</span></div>';
    }).join('');
  }
  function leerAvances(m, sel){
    var out = [], err = null;
    m.querySelectorAll(sel + ' [data-av]').forEach(function(f){
      var v = f.querySelector('[data-pct]').value, u = Number(f.dataset.ultimo) || 0, e = R.validarAvance(v, u);
      f.classList.toggle('mal', !!e); if(e && !err) err = f.dataset.nombre + ': ' + e;
      out.push({ so_id: Number(f.dataset.av), so_nombre: f.dataset.nombre, pct: Number(v), ultimo: u });
    });
    return { avances: out, error: err };
  }

  // ── Plan de la mañana (Ricardo) ──
  async function planEntrada(pais, origen, ctx){
    if(typeof cargarCatalogoUsa === 'function'){ try{ await cargarCatalogoUsa(); } catch(e){} }
    var pend = (ctx && ctx.pendientes_avance) || [];
    var m = overlay('<div class="nusa-ico">📋</div><h2>Tu plan de hoy</h2>' +
      (pend.length ? '<div class="nusa-sec"><h3>Avance pendiente de tu cuadrilla</h3><p>Estas SO tuvieron entrada después de tu salida. Reporta su avance.</p><div id="nusaPend">' + filasAvance(pend) + '</div></div>' : '') +
      '<div class="nusa-sec"><h3>¿En qué vas a trabajar?</h3><p>Una o varias SO y comercial. Tiene que sumar 100%.</p>' +
      '<div id="nusaPlan">' + filaReparto('', '') + filaReparto('COMERCIAL', 0) + '</div>' +
      '<div class="nusa-pie"><button class="nusa-link" data-agregar="nusaPlan">+ Agregar SO</button><span data-suma="nusaPlan"></span></div></div>' +
      '<div class="nusa-err" style="display:none"></div>' +
      '<div class="nusa-dos"><button class="nusa-btn" id="nusaCancel">Cancelar</button><button class="nusa-btn pri" id="nusaOk">Checar entrada</button></div>');
    cablearReparto(m, m.querySelector('#nusaPlan'));
    return new Promise(function(res){
      m.addEventListener('click', async function(ev){
        if(ev.target.id === 'nusaCancel'){ cerrar(); return res('cancelado'); }
        if(ev.target.id !== 'nusaOk') return;
        var av = leerAvances(m, '#nusaPend'); if(av.error) return errorEn(m, av.error);
        var lineas = leerReparto(m.querySelector('#nusaPlan')).filter(function(l){ return l.clave; });
        var e = R.validarReparto(lineas); if(e) return errorEn(m, e);
        var ev2 = Object.assign(base('plan', pais, origen), { plan: aRenglones(lineas), avances: av.avances });
        cerrar(); await enviar(ev2); res('ok');
      });
    });
  }

  // ── Salida de Ricardo: avance de proyectos + tu día ──
  async function avanceSalida(pais, origen, ctx){
    if(typeof cargarCatalogoUsa === 'function'){ try{ await cargarCatalogoUsa(); } catch(e){} }
    ctx = ctx || {};
    var cfgTope = (ctx.config && ctx.config.tope_excepcion_puntos) || 10, cfgPlan = (ctx.config && ctx.config.tope_contra_plan_puntos) || 20;
    var sosAv = ctx.sos_avance_hoy || [];   // de las ENTRADAS de la cuadrilla y suyas
    var plan = ctx.plan_hoy || [];
    var planCom = plan.length ? R.pctComercial(plan) : null;
    var sug = typeof ctx.sugerido_comercial === 'number' ? ctx.sugerido_comercial : 0;
    var filasDia = plan.length ? plan.map(function(l){ return filaReparto(l.clave === 'COMERCIAL' ? 'COMERCIAL' : String(l.so_id), l.pct); }).join('') : filaReparto('', '');
    if(!plan.some(function(l){ return l.clave === 'COMERCIAL'; })) filasDia += filaReparto('COMERCIAL', 0);
    var m = overlay('<div class="nusa-ico">🏁</div><h2>Antes de salir</h2>' +
      '<div class="nusa-sec nusa-a"><h3>A · Avance de los proyectos</h3><p>SO donde entró tu cuadrilla o tú hoy. El avance nunca baja.</p>' +
        (sosAv.length ? '<div id="nusaAv">' + filasAvance(sosAv) + '</div>' : '<p class="nusa-warn">Hoy no hubo entradas con SO de tu cuadrilla.</p>') + '</div>' +
      '<div class="nusa-sec nusa-b"><h3>B · Tu día</h3><p>Lo que realmente hiciste. Sugerido comercial: <b id="nusaSug">' + sug + '%</b>' +
        (planCom != null ? ' · en tu plan: ' + planCom + '%' : '') + '</p>' +
        '<div id="nusaDia">' + filasDia + '</div>' +
        '<div class="nusa-pie"><button class="nusa-link" data-agregar="nusaDia">+ Agregar SO</button><span data-suma="nusaDia"></span></div>' +
        '<div id="nusaExc" style="display:none"><p class="nusa-warn" id="nusaExcTxt"></p><input class="nusa-in" id="nusaExplica" placeholder="Explica en una línea"></div></div>' +
      '<div class="nusa-err" style="display:none"></div>' +
      '<div class="nusa-dos"><button class="nusa-btn" id="nusaCancel">Cancelar</button><button class="nusa-btn pri" id="nusaOk">Checar salida</button></div>');
    var dia = m.querySelector('#nusaDia');
    cablearReparto(m, dia);
    function evaluar(){
      var com = R.pctComercial(leerReparto(dia)), r = R.evaluarComercial(com, sug, planCom, cfgTope, cfgPlan);
      var box = m.querySelector('#nusaExc');
      box.style.display = r.exige_explicacion ? '' : 'none';
      m.querySelector('#nusaExcTxt').textContent = r.exige_explicacion
        ? 'Tu comercial (' + r.declarado + '%) pasa por ' + r.exceso + ' puntos al sugerido. Procede, pero se envía CON EXCEPCIÓN para que Erick lo revise.' + (r.contra_plan ? ' También subió más de ' + cfgPlan + ' puntos contra tu plan.' : '') : '';
      return r;
    }
    dia.addEventListener('input', evaluar); dia.addEventListener('change', evaluar); evaluar();
    return new Promise(function(res){
      m.addEventListener('click', async function(ev){
        if(ev.target.id === 'nusaCancel'){ cerrar(); return res({ estado: 'cancelado' }); }
        if(ev.target.id !== 'nusaOk') return;
        var av = leerAvances(m, '#nusaAv'); if(av.error) return errorEn(m, av.error);
        var lineas = leerReparto(dia).filter(function(l){ return l.clave; });
        var e = R.validarReparto(lineas); if(e) return errorEn(m, e);
        var c = evaluar(), expl = null;
        if(c.exige_explicacion){ expl = m.querySelector('#nusaExplica').value; var ee = R.validarExplicacion(expl); if(ee) return errorEn(m, ee); expl = expl.trim(); }
        var rengl = aRenglones(lineas);
        var ev2 = Object.assign(base('salida', pais, origen), { avances: av.avances, dia: rengl,
          comercial: { declarado: c.declarado, sugerido: c.sugerido, plan: planCom, estado: c.estado, contra_plan: c.contra_plan, explicacion: expl } });
        cerrar(); await enviar(ev2);
        var sos = rengl.filter(function(l){ return l.so_id; }).sort(function(a, b){ return b.pct - a.pct; });
        res({ estado: 'ok', soPrincipal: sos[0] || null });
      });
    });
  }

  // ── Punto de entrada desde afterVerifyContinue ──
  // Devuelve 'sigue' (el kiosko hace lo de hoy) o 'tomado' (este módulo continúa la checada).
  async function decidir(geoResult){
    if(!aplica(K.seleccionado)) return 'sigue';
    vaciarCola();
    var emp = K.seleccionado, p = persona(emp.id), cfg = st.cfg;
    var pais = R.clasificarPais(geoResult), origen = 'geo';
    var ctx = await contexto(emp.id);
    // Segunda llave: la ficha y el interruptor en la base. Si el servidor contesta que no, México.
    if(ctx && ctx.ok === true && (ctx.activo === false)) return 'sigue';
    if(ctx && ctx.ok === true && ctx.perfil) p = Object.assign({}, p, { perfil: ctx.perfil });
    var f = R.flujo(cfg, p, K.tipo, pais);
    if(f === 'mx'){ if(pais === 'MX') enviar(base('dia', 'MX', 'geo')); return 'sigue'; }
    if(f === 'pregunta_pais'){
      var elegido = await preguntarPais();
      if(!elegido){ goHome(); return 'tomado'; }
      origen = 'declarado'; pais = elegido;
      if(pais === 'MX'){ enviar(base('dia', 'MX', origen)); return 'sigue'; }
      K.geoAutorizada = false; K.geoMotivo = 'Sin ubicación: declaró que trabaja en USA (validación de RH)';
      f = R.flujo(cfg, p, K.tipo, pais);
    }
    var r;
    if(f === 'so_entrada'){ r = await soEntrada(pais, origen); if(r === 'cancelado'){ goHome(); return 'tomado'; } rutearPostGeo(); return 'tomado'; }
    if(f === 'plan_entrada'){ r = await planEntrada(pais, origen, ctx && ctx.ok ? ctx : null); if(r === 'cancelado'){ goHome(); return 'tomado'; } rutearPostGeo(); return 'tomado'; }
    if(f === 'avance_salida'){
      r = await avanceSalida(pais, origen, ctx && ctx.ok ? ctx : null);
      if(r.estado === 'cancelado'){ goHome(); return 'tomado'; }
      if(r.soPrincipal){
        var so = buscarSO(r.soPrincipal.so_id) || { id: r.soPrincipal.so_id, name: r.soPrincipal.so_nombre, _company_id: r.soPrincipal.company_id };
        K.soSeleccionada = so; K.bolsaSeleccionada = null; registrarAsistencia(); return 'tomado';
      }
      rutearPostGeo(); return 'tomado';
    }
    // usa_normal
    enviar(base('dia', 'USA', origen));
    if(origen === 'declarado'){ rutearPostGeo(); return 'tomado'; }
    return 'sigue';
  }

  window.KioskoUSA = { cargarConfig: cargarConfig, aplica: aplica, decidir: decidir, _st: st, _cola: leerCola };
  cargarConfig();
})();
