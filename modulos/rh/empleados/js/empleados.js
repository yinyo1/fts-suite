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
  archivados: N8N + '/webhook/rh/empleados/archivados'
};
// Defaults autoprogresivos: deptos de campo (Operaciones 3, Ingenieria 17) → calendar 2 / hora 7; oficina → 6 / 8.
var CAMPO_DEPTS = [3, 17];
var CATEGORIAS = [
  ['', '(auto por depto)'], ['ceo', 'CEO'], ['confianza', 'Confianza (no HE)'],
  ['hourly_doble', 'Hourly doble (HE 2x)'], ['hourly_sencilla', 'Hourly sencilla (HE 1x)'],
  ['no_he_comercial', 'Comercial (no HE)']
];
var REASON_ES = { 'Fired': 'Despido', 'Resigned': 'Renuncia', 'Retired': 'Fin de contrato' }; // cortesía hasta que se renombre en Odoo

var LK = null;        // lookups cacheados
var fotoB64 = null;   // foto comprimida (base64 sin prefijo)

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
  // motivos de baja (de Odoo, con traducción de cortesía)
  fillSelect(elName('departure_reason_id'), LK.reasons, 'id', function(r){ return REASON_ES[r.name] || r.name; }, '— elige —');
  // empleados activos para la baja
  fillSelect(elName('empleado_id'), LK.managers, 'id', function(m){ return m.name; }, '— elige —');
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

// ─── ALTA: submit ───
async function onAlta(e){
  e.preventDefault();
  var f = e.target, m = $('#altaMsg'), btn = $('#btnAlta');
  var hora = elName('x_studio_hora_entrada').value;
  if (hora !== '' && (parseFloat(hora) < 0 || parseFloat(hora) > 23.99)) return msg(m, 'Hora de entrada fuera de 0–23.99', 'err');
  var body = {
    name: f.name.value.trim(), company_id: f.company_id.value, work_email: f.work_email.value.trim(),
    private_email: f.private_email.value.trim(), mobile_phone: f.mobile_phone.value.trim(), work_phone: f.work_phone.value.trim(),
    department_id: f.department_id.value, parent_id: f.parent_id.value, job_id: f.job_id.value || null,
    resource_calendar_id: f.resource_calendar_id.value, pin: f.pin.value.trim(),
    x_studio_hora_entrada: hora, x_categoria_nomina: f.x_categoria_nomina.value || null,
    x_aplica_ppa: f.x_aplica_ppa.checked, image_1920: fotoB64 || null
  };
  btn.disabled = true; msg(m, 'Creando…');
  try {
    var r = await api(EP.crear, body);
    if (!r.ok) throw new Error(r.error || 'No se pudo crear');
    msg(m, '✅ Empleado creado (id ' + r.employee_id + ', PIN ' + r.pin + ').', 'ok');
    f.reset(); fotoB64 = null; $('#fotoPreview').removeAttribute('src'); $('#fotoInfo').textContent = '';
    if (elName('company_id').querySelector('option[value="1"]')) elName('company_id').value = '1';
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
  $('#fotoInput').addEventListener('change', onFoto);
  $('#formAlta').addEventListener('submit', onAlta);
  $('#formBaja').addEventListener('submit', onBaja);
  $('#btnReloadArch').addEventListener('click', cargarArchivados);
  $('#tablaArchivados').addEventListener('click', function(ev){
    var b = ev.target.closest('[data-react]'); if (b) onReactivar(b.dataset.react, b);
  });

  try { await cargarLookups(); }
  catch (err){ alert('No se pudieron cargar los catálogos (lookups). ¿Está publicado el workflow rh/empleado/lookups?\n\n' + err.message); }
  console.log('[rh-empleados] init OK build=' + window.BUILD_DATE);
});
