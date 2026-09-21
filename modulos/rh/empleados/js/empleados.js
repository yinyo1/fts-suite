// ═══════════════════════════════════════════════════════════════
// FTS RH — Alta / Baja de empleados (orquestación)
// Gate solo-RH (FTSAuth) + 5 webhooks n8n (rh/empleado/*).
// ═══════════════════════════════════════════════════════════════
'use strict';

// ─── Config ───
var N8N = 'https://primary-production-5c3c.up.railway.app';
var EP = {
  lookups:    N8N + '/webhook/rh/empleado/lookups',
  crear:      N8N + '/webhook/rh/empleado/crear',
  archivar:   N8N + '/webhook/rh/empleado/archivar',
  reactivar:  N8N + '/webhook/rh/empleado/reactivar',
  archivados: N8N + '/webhook/rh/empleados/archivados',
  detalle:    N8N + '/webhook/rh/empleado/detalle',
  editar:     N8N + '/webhook/rh/empleado/editar',
  // La cuenta NO viaja en el cuerpo de crear/editar: tiene su propio endpoint, que es
  // el UNICO escritor de res.partner.bank (§20 #4). Ahi el numero vive como variable
  // local de un Code y no es salida de ningun nodo, asi que no queda en los datos de
  // ninguna ejecucion. Mezclarlo con el alta lo habria vuelto salida de nodo.
  cuenta:     N8N + '/webhook/rh/empleado/cuenta'
};
// Defaults autoprogresivos: deptos de campo (Operaciones 3, Ingenieria 17) → calendar 2 / hora 7; oficina → 6 / 8.
var CAMPO_DEPTS = [3, 17];
var CATEGORIAS = [
  ['', '(auto por depto)'], ['ceo', 'CEO'], ['confianza', 'Confianza (no HE)'],
  ['hourly_doble', 'Hourly doble (HE 2x)'], ['hourly_sencilla', 'Hourly sencilla (HE 1x)'],
  ['no_he_comercial', 'Comercial (no HE)']
];
var REASON_ES = { 'Fired': 'Despido', 'Resigned': 'Renuncia', 'Retired': 'Fin de contrato' }; // cortesía hasta que se renombre en Odoo

// ─── Tipo de contrato (campo NATIVO de Odoo `employee_type`) ───
// Odoo acepta mas valores de los que aqui se ofrecen; la Suite expone SOLO estos dos
// a proposito, porque son los dos que cambian la nomina de FTS. El padron completo
// (132 registros, activos + archivados, medido 2026-09-20) no tiene ningun otro valor.
var TIPOS_CONTRATO = [
  ['employee',  'Empleado'],
  ['freelance', 'Externo / Honorarios']
];
function etiquetaTipo(v){
  for (var i = 0; i < TIPOS_CONTRATO.length; i++){ if (TIPOS_CONTRATO[i][0] === v) return TIPOS_CONTRATO[i][1]; }
  return null;   // null = NO es de la lista blanca
}

// Empresas cuya nomina se paga por CONTPAQi. Es una regla de NEGOCIO, no un dato
// derivable de Odoo: solo SERVICIOS FTS (1) corre la nomina mexicana. FTS USA (6)
// tiene la suya, y Taqueria los Jimenez (10) es otro negocio que ni siquiera es FTS
// (CLAUDE.md §9). Acotar por EMPRESA y no por id de empleado es lo que hace que el
// aviso no le grite a alguien que nunca debio llevar codigo.
var EMPRESAS_CONTPAQI = [1];

// Llena un <select> de tipo de contrato. Si el valor que trae Odoo NO esta en la
// lista blanca, lo agrega como opcion propia y marcada en vez de caer al primero:
// un guardado no debe pisar en silencio un valor que esta pantalla no entiende
// (§20 #13 — lo que el indice no cubre no es "no existe").
function llenarTipoContrato(sel, valorActual){
  sel.innerHTML = '';
  var ph = document.createElement('option'); ph.value = ''; ph.textContent = '— elige —';
  sel.appendChild(ph);
  TIPOS_CONTRATO.forEach(function(t){
    var o = document.createElement('option'); o.value = t[0]; o.textContent = t[1]; sel.appendChild(o);
  });
  if (valorActual && !etiquetaTipo(valorActual)){
    var raro = document.createElement('option');
    raro.value = valorActual; raro.textContent = '⚠️ ' + valorActual + ' (valor de Odoo que esta pantalla no maneja)';
    sel.appendChild(raro);
  }
  sel.value = valorActual || '';
}

// La regla de dos estados. Se pinta viva mientras RH escribe, y tambien decide si el
// submit puede salir (ver `bloqueoTipo`).
//   de planta + sin codigo  → LE FALTA, aviso fuerte
//   externo   + sin codigo  → correcto, aviso tranquilo
//   externo   + CON codigo  → contradiccion, aviso ambar (no bloquea: puede ser una baja en transito)
//   valor fuera de la lista → ambar, y no se toca nada
function avisoTipoCodigo(E, aviso){
  if (!aviso) return;
  var tipo   = (E['employee_type'] && E['employee_type'].value) || '';
  var codigo = String((E['x_studio_codigo_contpaqi'] && E['x_studio_codigo_contpaqi'].value) || '').trim();
  var empresa = parseInt((E['company_id'] && E['company_id'].value) || '0', 10);
  var enContpaqi = EMPRESAS_CONTPAQI.indexOf(empresa) > -1;

  function pinta(clase, html){ aviso.className = 'rh-aviso' + (clase ? ' ' + clase : ''); aviso.innerHTML = html; aviso.hidden = false; }

  if (!tipo){ aviso.hidden = true; aviso.innerHTML = ''; return; }
  if (!etiquetaTipo(tipo)){
    return pinta('rh-aviso-raro', '⚠️ El tipo de contrato <strong>' + esc(tipo) + '</strong> viene de Odoo y esta pantalla no lo maneja. No se toca: cámbialo sólo si sabes que debe cambiar.');
  }
  // Fuera de CONTPAQi el codigo no significa nada — y decirlo es mejor que callar,
  // porque un aviso ausente se confunde con "todo bien" (§20 #18).
  if (!enContpaqi){
    return pinta('', 'Esta empresa no va en la nómina de CONTPAQi, así que el <strong># CONTPAQi</strong> no aplica aquí.');
  }
  if (tipo === 'employee' && !codigo){
    return pinta('rh-aviso-falta', '🔴 <strong>LE FALTA EL # DE CONTPAQi.</strong> Es de planta: sin código no se puede cruzar con la raya y la nómina de la semana se frena.');
  }
  if (tipo === 'freelance' && !codigo){
    return pinta('rh-aviso-ok', '✔️ Externo por honorarios: no lleva # de CONTPAQi. Correcto.');
  }
  if (tipo === 'freelance' && codigo){
    return pinta('rh-aviso-raro', '⚠️ Dice <strong>Externo / Honorarios</strong> pero trae el código <strong>' + esc(codigo) + '</strong>. Uno de los dos está mal — revisa cuál antes de guardar.');
  }
  aviso.hidden = true; aviso.innerHTML = '';
}

// Lo unico que BLOQUEA es no haber elegido tipo. El codigo faltante avisa fuerte pero
// no frena: RH a veces da de alta antes de que contabilidad asigne el numero, y
// bloquear ahi solo empuja a inventarse un codigo.
function bloqueoTipo(E){
  var tipo = (E['employee_type'] && E['employee_type'].value) || '';
  if (!tipo) return 'Elige el tipo de contrato (Empleado o Externo / Honorarios).';
  return null;
}

// ═══ Cuenta bancaria · captura de un solo sentido, con doble captura ═══
// El numero NO se puede leer de vuelta: `rh/empleado/detalle` devuelve solo los
// ultimos 4. Por eso los campos nacen vacios y vacios significan "no toques nada":
// no se puede editar lo que no se ve, asi que corregir es teclear los 10 completos
// otra vez, dos veces.
var CUENTA_LARGO = 10;
// Lo que devuelve el detalle NO son los ultimos 4: es CUANTAS cuentas tiene el contacto.
// Los ultimos 4 solo se ven una vez, como acuse de la captura que se acaba de hacer, y
// salen del endpoint de escritura con lo que la propia persona tecleo. Asi el numero
// completo no tiene que salir de Odoo ni siquiera para recortarlo.
var cuentasRegistradas = { alta: 0, edit: 0 };
var cuentaAcuse = { alta: null, edit: null };   // ultimos 4 del ultimo guardado, efimero

// Devuelve { modo:'no_tocar' } | { error, msg } | { valor }
// El orden de las comprobaciones importa: primero que sean digitos, y solo despues
// el largo, para que un CLABE se diagnostique como CLABE y no como "largo raro".
function validarCuenta(a, b){
  a = String(a == null ? '' : a).trim();
  b = String(b == null ? '' : b).trim();
  if (!a && !b) return { modo: 'no_tocar' };
  if (!a || !b) return { error: 'CUENTA_CAPTURA_INCOMPLETA',
    msg: 'Escribe la cuenta en los dos campos: uno quedó vacío.' };
  if (a !== b) return { error: 'CUENTA_NO_COINCIDE',
    msg: 'Las dos capturas no coinciden. Bórralas y escribe los ' + CUENTA_LARGO + ' dígitos completos otra vez.' };
  if (!/^[0-9]+$/.test(a)) return { error: 'CUENTA_FORMATO',
    msg: 'La cuenta trae algo que no es un dígito (un espacio, un guión). Son ' + CUENTA_LARGO + ' dígitos pelones.' };
  if (a.length === 18) return { error: 'ES_CLABE_NO_CUENTA',
    msg: 'Son 18 dígitos: eso es una CLABE. Aquí va el número de cuenta BBVA de ' + CUENTA_LARGO + ' dígitos.' };
  if (a.length !== CUENTA_LARGO) return { error: 'CUENTA_FORMATO',
    msg: 'La cuenta debe tener ' + CUENTA_LARGO + ' dígitos y llegaron ' + a.length + '.' };
  return { valor: a };
}

// Pinta la caja de estado. Se llama viva mientras se teclea, no solo al guardar:
// una pantalla se revisa mirandola (§20 #12), y un error de captura que solo
// aparece al enviar obliga a teclear las dos otra vez por nada.
function pintarCuenta(E, caja, cual){
  if (!caja) return;
  var v = validarCuenta(E['cuenta'] && E['cuenta'].value, E['cuenta_confirma'] && E['cuenta_confirma'].value);
  var n = cuentasRegistradas[cual] || 0;
  var acuse = cuentaAcuse[cual];
  function pinta(clase, html){ caja.className = 'rh-cuenta' + (clase ? ' ' + clase : ''); caja.innerHTML = html; }

  if (v.modo === 'no_tocar'){
    if (acuse) return pinta('rh-cuenta-ok', '✔️ Cuenta guardada · termina en <strong>' + esc(acuse) + '</strong>. ' +
      'Queda <strong>CAPTURADA</strong>, no verificada: eso lo dirá el banco cuando le deposite.');
    if (n > 1) return pinta('rh-cuenta-mal', '⚠️ Este contacto tiene <strong>' + n + '</strong> cuentas registradas en Odoo. ' +
      'La dispersión no sabe cuál usar — hay que dejar una sola antes de que cobre por transferencia.');
    if (n === 1) return pinta('', 'Cuenta registrada. Déjala en paz dejando los dos campos vacíos. ' +
      'Para corregirla hay que escribir los ' + CUENTA_LARGO + ' dígitos completos, dos veces — esta pantalla no puede leer el número de vuelta.');
    return pinta('', 'Sin cuenta registrada. Mientras no la tenga, esta persona no puede cobrar por transferencia.');
  }
  if (v.error === 'CUENTA_CAPTURA_INCOMPLETA') return pinta('', v.msg);
  if (v.error) return pinta('rh-cuenta-mal', '🔴 ' + esc(v.msg));
  return pinta('rh-cuenta-ok', '✔️ Las dos capturas coinciden · ' + CUENTA_LARGO + ' dígitos. ' +
    'Al guardar queda <strong>CAPTURADA</strong>, no verificada: la doble captura atrapa el error de <em>tecleo</em>, ' +
    'no el de <em>origen</em>. Si el número que te dieron ya venía mal, esto no lo ve — eso solo lo atrapa el banco.');
}

var LK = null;        // lookups cacheados
var fotoB64 = null;   // foto comprimida (base64 sin prefijo) — alta
var editFotoB64 = null; // foto nueva en edición (null = no cambiar la existente)

// hora float 24h <-> "HH:MM" (7.5 = 07:30)
function pad2(n){ return (n < 10 ? '0' : '') + n; }
function floatToHHMM(f){ f = parseFloat(f) || 0; var h = Math.floor(f); var mn = Math.round((f - h) * 60); if (mn === 60){ h++; mn = 0; } return pad2(h) + ':' + pad2(mn); }
function hhmmToFloat(s){ if (!s) return 0; var p = String(s).split(':'); return (parseInt(p[0], 10) || 0) + (parseInt(p[1], 10) || 0) / 60; }

// ─── Auth gate (mismo patrón que el hub RH) ───
function rh_check_auth(){
  var s = (window.FTSAuth && FTSAuth.getSession && FTSAuth.getSession()) || null;
  if (!s){ alert('Sesión no válida.'); location.href = '../../../index.html'; return null; }
  var tieneRH = s.role === 'master' || s.modulos === 'all' || (s.modulos && s.modulos.rh && s.modulos.rh.acceso === true);
  if (!tieneRH){ alert('No tienes acceso al módulo RH.'); location.href = '../../../index.html'; return null; }
  return s;
}
function rh_logout(){ try { FTSAuth.logout(); } catch(e){} location.href = '../../../index.html'; }
window.rh_logout = rh_logout;

// ─── Helpers ───
function $(s, r){ return (r || document).querySelector(s); }
function elName(n){ return document.querySelector('[name="' + n + '"]'); }
async function api(url, body){
  var opt = { method: body ? 'POST' : 'GET', cache: 'no-store' };
  if (body){ opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
  var res = await fetch(url, opt);
  var data = null; try { data = await res.json(); } catch(e){}
  if (!res.ok) throw new Error((data && (data.error || data.message)) || ('HTTP ' + res.status + ' — ¿workflow publicado?'));
  return data || {};
}
function fillSelect(sel, items, valKey, labelFn, placeholder){
  sel.innerHTML = '';
  if (placeholder != null){ var o = document.createElement('option'); o.value = ''; o.textContent = placeholder; sel.appendChild(o); }
  (items || []).forEach(function(it){
    var o = document.createElement('option');
    o.value = it[valKey]; o.textContent = labelFn(it); sel.appendChild(o);
  });
}
function msg(el, text, kind){ el.textContent = text || ''; el.className = 'rh-msg' + (kind ? ' rh-msg-' + kind : ''); }

// ─── Lookups → poblar selects ───
async function cargarLookups(){
  LK = await api(EP.lookups);
  fillSelect(elName('company_id'), LK.companies, 'id', function(c){ return c.name; });
  if (elName('company_id').querySelector('option[value="1"]')) elName('company_id').value = '1';
  fillSelect(elName('department_id'), LK.departments, 'id', function(d){ return d.name; }, '— elige —');
  fillSelect(elName('parent_id'), LK.managers, 'id', function(m){ return m.name; }, '— elige —');
  fillSelect(elName('job_id'), LK.jobs, 'id', function(j){ return j.name; }, '— ninguno —');
  fillSelect(elName('resource_calendar_id'), LK.calendars, 'id', function(c){ return c.name + ' (' + (c.hours_per_week || '?') + 'h)'; }, '— elige —');
  // categorías nómina (fijas)
  var catSel = elName('x_categoria_nomina'); catSel.innerHTML = '';
  CATEGORIAS.forEach(function(c){ var o = document.createElement('option'); o.value = c[0]; o.textContent = c[1]; catSel.appendChild(o); });
  // tipo de contrato del ALTA: sin preseleccion a proposito — que nadie herede un
  // default que no decidio (CLAUDE.md §9, el caso CAJERO 1).
  llenarTipoContrato(elName('employee_type'), '');
  // motivos de baja (de Odoo, con traducción de cortesía)
  fillSelect(elName('departure_reason_id'), LK.reasons, 'id', function(r){ return REASON_ES[r.name] || r.name; }, '— elige —');
  // empleados activos para la baja
  fillSelect(elName('empleado_id'), LK.managers, 'id', function(m){ return m.name; }, '— elige —');
  // ─── form de EDICIÓN: selects scoped al form + selector de empleado ───
  var fe = document.getElementById('formEditar');
  fillSelect(fe.elements['company_id'], LK.companies, 'id', function(c){ return c.name; });
  fillSelect(fe.elements['department_id'], LK.departments, 'id', function(d){ return d.name; }, '— elige —');
  fillSelect(fe.elements['parent_id'], LK.managers, 'id', function(m){ return m.name; }, '— elige —');
  fillSelect(fe.elements['job_id'], LK.jobs, 'id', function(j){ return j.name; }, '— ninguno —');
  fillSelect(fe.elements['resource_calendar_id'], LK.calendars, 'id', function(c){ return c.name + ' (' + (c.hours_per_week || '?') + 'h)'; }, '— elige —');
  var ecat = fe.elements['x_categoria_nomina']; ecat.innerHTML = '';
  CATEGORIAS.forEach(function(c){ var o = document.createElement('option'); o.value = c[0]; o.textContent = c[1]; ecat.appendChild(o); });
  llenarTipoContrato(fe.elements['employee_type'], '');
  fillSelect(document.getElementById('editEmpSel'), LK.managers, 'id', function(m){ return m.name; }, '— elige empleado —');
}

// ─── ALTA: defaults autoprogresivos por depto ───
function aplicarDefaultsDepto(){
  var dep = parseInt(elName('department_id').value, 10);
  if (!dep) return;
  var esCampo = CAMPO_DEPTS.indexOf(dep) > -1;
  elName('resource_calendar_id').value = esCampo ? '2' : '6';
  if (!elName('x_studio_hora_entrada').value) elName('x_studio_hora_entrada').value = esCampo ? '7' : '8';
}

// ─── ALTA: foto ───
async function onFoto(e){
  var f = e.target.files && e.target.files[0];
  var info = $('#fotoInfo'), prev = $('#fotoPreview');
  fotoB64 = null; prev.removeAttribute('src'); info.textContent = '';
  if (!f) return;
  try {
    var r = await FTSFoto.comprimirFoto(f);
    fotoB64 = r.base64; prev.src = r.dataUrl;
    info.textContent = r.w + '×' + r.h + ' · ' + (r.bytes / 1024).toFixed(0) + ' KB';
  } catch (err){ info.textContent = '⚠️ ' + err.message; }
}

// ─── Guardar la cuenta (endpoint aparte) ───
// Se llama DESPUES de que el empleado quedo guardado, porque necesita su id. Devuelve
// un texto para pegarle al mensaje: el guardado del empleado y el de la cuenta pueden
// salir distinto, y callarse la mitad que fallo seria mentir por omision.
async function guardarCuenta(empleadoId, valor, cual){
  if (!valor) return { hubo:false, texto:'' };
  var quien = '';
  try { var s = FTSAuth.getSession(); quien = (s && (s.nombre || s.username)) || ''; } catch(e){ quien = ''; }
  try {
    var r = await api(EP.cuenta, { empleado_id: empleadoId, cuenta: valor, cuenta_confirma: valor, capturado_por: quien || 'RH' });
    if (r && r.ok && r.ultimos4){
      cuentaAcuse[cual] = r.ultimos4;
      cuentasRegistradas[cual] = 1;
      return { hubo:true, texto:' Cuenta ' + (r.accion || 'guardada') + ' · termina en ' + r.ultimos4 + '.' };
    }
    return { hubo:true, fallo:true, texto:' ⚠️ La CUENTA no se guardó (' + ((r && r.error) || 'sin respuesta') + '). El resto sí.' };
  } catch (err){
    return { hubo:true, fallo:true, texto:' ⚠️ La CUENTA no se guardó (' + err.message + '). El resto sí.' };
  }
}

// ─── ALTA: submit ───
async function onAlta(e){
  e.preventDefault();
  var f = e.target, m = $('#altaMsg'), btn = $('#btnAlta');
  var hora = elName('x_studio_hora_entrada').value;
  if (hora !== '' && (parseFloat(hora) < 0 || parseFloat(hora) > 23.99)) return msg(m, 'Hora de entrada fuera de 0–23.99', 'err');
  var falta = bloqueoTipo(f.elements); if (falta) return msg(m, falta, 'err');
  var vc = validarCuenta(f.elements['cuenta'].value, f.elements['cuenta_confirma'].value);
  if (vc.error) return msg(m, vc.msg, 'err');
  var body = {
    name: f.elements['name'].value.trim(), company_id: f.company_id.value, work_email: f.work_email.value.trim(),
    private_email: f.private_email.value.trim(), mobile_phone: f.mobile_phone.value.trim(), work_phone: f.work_phone.value.trim(),
    department_id: f.department_id.value, parent_id: f.parent_id.value, job_id: f.job_id.value || null,
    resource_calendar_id: f.resource_calendar_id.value, pin: f.pin.value.trim(),
    x_studio_hora_entrada: hora, x_categoria_nomina: f.x_categoria_nomina.value || null,
    x_aplica_ppa: f.x_aplica_ppa.checked, image_1920: fotoB64 || null,
    employee_type: f.employee_type.value,
    x_studio_codigo_contpaqi: f.x_studio_codigo_contpaqi.value.trim()
  };
  btn.disabled = true; msg(m, 'Creando…');
  try {
    var r = await api(EP.crear, body);
    if (!r.ok) throw new Error(r.error || 'No se pudo crear');
    // La cuenta va en su propio viaje, DESPUES de que existe el empleado (necesita su id).
    var rc = await guardarCuenta(r.employee_id, vc.valor, 'alta');
    msg(m, (rc.fallo ? '⚠️' : '✅') + ' Empleado creado (id ' + r.employee_id + ', PIN ' + r.pin + ').' + rc.texto,
        rc.fallo ? 'err' : 'ok');
    f.reset(); fotoB64 = null; $('#fotoPreview').removeAttribute('src'); $('#fotoInfo').textContent = '';
    if (elName('company_id').querySelector('option[value="1"]')) elName('company_id').value = '1';
    avisoTipoCodigo(f.elements, $('#altaAviso'));   // el reset vacia el select: el aviso viejo mentiria
    cuentasRegistradas.alta = 0; cuentaAcuse.alta = null;
    pintarCuenta(f.elements, $('#altaCuentaEstado'), 'alta');
  } catch (err){ msg(m, '❌ ' + err.message, 'err'); }
  finally { btn.disabled = false; }
}

// ─── BAJA: submit (maneja el bloqueo por attendance abierta) ───
async function onBaja(e){
  e.preventDefault();
  var f = e.target, m = $('#bajaMsg'), btn = $('#btnBaja');
  var body = {
    empleado_id: f.empleado_id.value, departure_date: f.departure_date.value,
    departure_reason_id: f.departure_reason_id.value, departure_description: f.departure_description.value.trim()
  };
  btn.disabled = true; msg(m, 'Archivando…');
  try {
    var r = await api(EP.archivar, body);
    if (r.blocked){ msg(m, '🚫 ' + r.error, 'err'); return; }            // NO cerrar el form
    if (!r.ok) throw new Error(r.error || 'No se pudo archivar');
    var warn = (r.warnings && r.warnings.length) ? ' ⚠️ ' + r.warnings.map(function(w){ return w.detalle; }).join(' ') : '';
    msg(m, '✅ Empleado archivado.' + warn, 'ok');
    f.reset();
    elName('departure_date').value = new Date().toISOString().slice(0, 10);  // restaurar default
    await cargarLookups();   // el empleado archivado sale de los selectores activos sin recargar la página
  } catch (err){ msg(m, '❌ ' + err.message, 'err'); }
  finally { btn.disabled = false; }
}

// ─── ARCHIVADOS: render + reactivar ───
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
async function cargarArchivados(){
  var tb = $('#tablaArchivados tbody');
  tb.innerHTML = '<tr><td colspan="9" class="rh-empty">Cargando…</td></tr>';
  try {
    var r = await api(EP.archivados);
    var rows = r.empleados || [];
    if (!rows.length){ tb.innerHTML = '<tr><td colspan="9" class="rh-empty">Sin empleados archivados.</td></tr>'; return; }
    tb.innerHTML = rows.map(function(e){
      var nota = String(e.departure_description || '').replace(/<[^>]*>/g, ' ').trim();
      return '<tr>' +
        '<td>' + esc(e.name) + '</td>' +
        '<td>' + esc(e.department) + '</td>' +
        '<td>' + esc(e.job) + '</td>' +
        '<td>' + esc(e.departure_date || '—') + '</td>' +
        '<td>' + esc(REASON_ES[e.departure_reason] || e.departure_reason || '—') + '</td>' +
        '<td class="rh-nota">' + esc(nota) + '</td>' +
        '<td>' + esc((e.last_check_out || '').slice(0, 10) || '—') + '</td>' +
        '<td>' + esc((e.create_date || '').slice(0, 10) || '—') + '</td>' +
        '<td><button class="rh-btn rh-btn-mini" data-react="' + e.id + '">Reactivar</button></td>' +
      '</tr>';
    }).join('');
  } catch (err){ tb.innerHTML = '<tr><td colspan="9" class="rh-empty">❌ ' + esc(err.message) + '</td></tr>'; }
}
async function onReactivar(id, btn){
  if (!confirm('¿Reactivar este empleado? Se limpiará la fecha y motivo de baja.')) return;
  btn.disabled = true; btn.textContent = '…';
  try {
    var r = await api(EP.reactivar, { empleado_id: id });
    if (!r.ok) throw new Error(r.error || 'No se pudo reactivar');
    await cargarLookups();   // vuelve a estar activo → refrescar selects
    await cargarArchivados();
  } catch (err){ alert('❌ ' + err.message); btn.disabled = false; btn.textContent = 'Reactivar'; }
}

// ─── EDITAR: cargar detalle + pre-llenar el form ───
async function onEditSelect(){
  var id = $('#editEmpSel').value, fe = $('#formEditar'), m = $('#editMsg');
  if (!id){ fe.style.display = 'none'; return; }
  msg(m, 'Cargando…');
  try {
    var r = await api(EP.detalle, { empleado_id: id });
    if (!r.ok || !r.empleado) throw new Error(r.error || 'No se encontró el empleado');
    var e = r.empleado, E = fe.elements;
    E['empleado_id'].value = e.id;
    E['name'].value = e.name || '';
    E['work_email'].value = e.work_email || '';
    E['private_email'].value = e.private_email || '';
    E['mobile_phone'].value = e.mobile_phone || '';
    E['work_phone'].value = e.work_phone || '';
    E['department_id'].value = e.department_id || '';
    E['parent_id'].value = e.parent_id || '';
    E['job_id'].value = e.job_id || '';
    E['resource_calendar_id'].value = e.resource_calendar_id || '';
    E['company_id'].value = e.company_id || '';
    E['pin'].value = e.pin || '';
    E['x_categoria_nomina'].value = e.x_categoria_nomina || '';
    E['x_aplica_ppa'].checked = !!e.x_aplica_ppa;
    E['hora_hhmm'].value = floatToHHMM(e.x_studio_hora_entrada);
    llenarTipoContrato(E['employee_type'], e.employee_type || '');
    E['x_studio_codigo_contpaqi'].value = e.x_studio_codigo_contpaqi || '';
    avisoTipoCodigo(E, $('#editAviso'));
    // El detalle NO devuelve el numero, solo los ultimos 4. Los campos nacen vacios
    // en cada carga: vacio significa "no toques la cuenta".
    cuentasRegistradas.edit = Number(e.cuentas_registradas) || 0;
    cuentaAcuse.edit = null;
    E['cuenta'].value = ''; E['cuenta_confirma'].value = '';
    pintarCuenta(E, $('#editCuentaEstado'), 'edit');
    editFotoB64 = null; $('#editFotoInput').value = ''; $('#editFotoInfo').textContent = '';
    var prev = $('#editFotoPreview');
    if (e.image_128) prev.src = 'data:image/png;base64,' + e.image_128; else prev.removeAttribute('src');
    fe.style.display = ''; msg(m, '');
  } catch (err){ msg(m, '❌ ' + err.message, 'err'); fe.style.display = 'none'; }
}
async function onEditFoto(e){
  var f = e.target.files && e.target.files[0], info = $('#editFotoInfo'), prev = $('#editFotoPreview');
  editFotoB64 = null;
  if (!f){ info.textContent = ''; return; }
  try { var r = await FTSFoto.comprimirFoto(f); editFotoB64 = r.base64; prev.src = r.dataUrl; info.textContent = r.w + '×' + r.h + ' · ' + (r.bytes / 1024).toFixed(0) + ' KB'; }
  catch (err){ info.textContent = '⚠️ ' + err.message; }
}
async function onEditar(e){
  e.preventDefault();
  var f = e.target, E = f.elements, m = $('#editMsg'), btn = $('#btnEditar');
  if (!E['empleado_id'].value) return msg(m, 'Elige un empleado primero', 'err');
  var horaF = hhmmToFloat(E['hora_hhmm'].value);
  if (horaF < 0 || horaF > 23.99) return msg(m, 'Hora de entrada fuera de 0–23.99', 'err');
  var faltaE = bloqueoTipo(E); if (faltaE) return msg(m, faltaE, 'err');
  var vcE = validarCuenta(E['cuenta'].value, E['cuenta_confirma'].value);
  if (vcE.error) return msg(m, vcE.msg, 'err');
  var body = {
    empleado_id: E['empleado_id'].value, name: E['name'].value.trim(), company_id: E['company_id'].value, work_email: E['work_email'].value.trim(),
    private_email: E['private_email'].value.trim(), mobile_phone: E['mobile_phone'].value.trim(), work_phone: E['work_phone'].value.trim(),
    department_id: E['department_id'].value, parent_id: E['parent_id'].value, job_id: E['job_id'].value || null,
    resource_calendar_id: E['resource_calendar_id'].value, pin: E['pin'].value.trim(),
    x_studio_hora_entrada: horaF, x_categoria_nomina: E['x_categoria_nomina'].value || null, x_aplica_ppa: E['x_aplica_ppa'].checked,
    employee_type: E['employee_type'].value,
    x_studio_codigo_contpaqi: E['x_studio_codigo_contpaqi'].value.trim()
  };
  if (editFotoB64) body.image_1920 = editFotoB64;   // SOLO si subió foto nueva (si no, el workflow no toca la existente)
  btn.disabled = true; msg(m, 'Guardando…');
  try {
    var r = await api(EP.editar, body);
    if (!r.ok) throw new Error(r.error || 'No se pudo guardar');
    var savedId = String(body.empleado_id);
    // Mismo criterio que la foto: si no se capturo nada, la cuenta NO se toca.
    var rcE = await guardarCuenta(savedId, vcE.valor, 'edit');
    var acuseE = cuentaAcuse.edit;                          // onEditSelect lo limpia; se guarda antes
    await cargarLookups();                                  // refresca nombres en selectores (jefe directo, baja, editar)
    document.getElementById('editEmpSel').value = savedId;  // mantener al empleado editado seleccionado
    await onEditSelect();                                    // re-llena el form desde Odoo (deja el mensaje vacío)
    cuentaAcuse.edit = acuseE;                               // el acuse es de ESTE guardado, no del detalle
    pintarCuenta(E, $('#editCuentaEstado'), 'edit');
    msg(m, (rcE.fallo ? '⚠️' : '✅') + ' Cambios guardados (' + esc(body.name) + ').' + rcE.texto,
        rcE.fallo ? 'err' : 'ok');  // mensaje al final para que no lo pise onEditSelect
  } catch (err){ msg(m, '❌ ' + err.message, 'err'); }
  finally { btn.disabled = false; }
}

// ─── Tabs ───
function setTab(name){
  document.querySelectorAll('.rh-tab').forEach(function(t){ t.classList.toggle('active', t.dataset.tab === name); });
  document.querySelectorAll('.rh-panel').forEach(function(p){ p.classList.toggle('active', p.id === 'panel-' + name); });
  if (name === 'archivados') cargarArchivados();
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', async function(){
  var s = rh_check_auth(); if (!s) return;
  $('#rh-user-name').textContent = '👤 ' + (s.nombre || s.username || '—');
  try { FTSAuth.initActivityTracking && FTSAuth.initActivityTracking(); } catch(e){}

  // default fecha baja = hoy
  elName('departure_date').value = new Date().toISOString().slice(0, 10);

  // eventos
  document.querySelectorAll('.rh-tab').forEach(function(t){ t.addEventListener('click', function(){ setTab(t.dataset.tab); }); });
  elName('department_id').addEventListener('change', aplicarDefaultsDepto);
  // El aviso depende de TRES campos (tipo, codigo, empresa) en CADA form. Se engancha
  // por form y no por id global porque los dos forms repiten los mismos `name`.
  [['#formAlta', '#altaAviso', 'alta'], ['#formEditar', '#editAviso', 'edit']].forEach(function(par){
    var form = $(par[0]), aviso = $(par[1]), cual = par[2];
    ['employee_type', 'x_studio_codigo_contpaqi', 'company_id'].forEach(function(campo){
      var el = form.elements[campo];
      if (!el) return;
      el.addEventListener('change', function(){ avisoTipoCodigo(form.elements, aviso); });
      el.addEventListener('input',  function(){ avisoTipoCodigo(form.elements, aviso); });
    });
    // El cableado va POR FORMULARIO, no por id global: los dos formularios repiten
    // los mismos `name`, asi que un querySelector suelto engancharia siempre el de alta.
    var caja = $('#' + cual + 'CuentaEstado');
    ['cuenta', 'cuenta_confirma'].forEach(function(campo){
      var el = form.elements[campo];
      if (!el) return;
      el.addEventListener('input', function(){ pintarCuenta(form.elements, caja, cual); });
      el.addEventListener('change', function(){ pintarCuenta(form.elements, caja, cual); });
    });
    pintarCuenta(form.elements, caja, cual);   // estado inicial: "sin cuenta registrada"
  });
  $('#fotoInput').addEventListener('change', onFoto);
  $('#formAlta').addEventListener('submit', onAlta);
  $('#formBaja').addEventListener('submit', onBaja);
  $('#editEmpSel').addEventListener('change', onEditSelect);
  $('#editFotoInput').addEventListener('change', onEditFoto);
  $('#formEditar').addEventListener('submit', onEditar);
  $('#btnReloadArch').addEventListener('click', cargarArchivados);
  $('#tablaArchivados').addEventListener('click', function(ev){
    var b = ev.target.closest('[data-react]'); if (b) onReactivar(b.dataset.react, b);
  });

  try { await cargarLookups(); }
  catch (err){ alert('No se pudieron cargar los catálogos (lookups). ¿Está publicado el workflow rh/empleado/lookups?\n\n' + err.message); }
  console.log('[rh-empleados] init OK build=' + window.BUILD_DATE);
});
