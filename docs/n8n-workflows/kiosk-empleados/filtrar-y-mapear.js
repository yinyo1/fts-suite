// Trae todos los empleados de Odoo y filtra en JS
const todos = $input.all().map(item => item.json);
// Filtrar solo activos de la compañía 1 (FTS MX)
const activos = todos.filter(emp => {
  // active viene como true/false
  if (emp.active !== true) return false;
  
  // company_id viene como [id, nombre] o false
  const companyId = Array.isArray(emp.company_id) ? emp.company_id[0] : emp.company_id;
  if (companyId !== 1) return false;
  
  return true;
});
// Mapear al formato esperado por el kiosko
const mapped = activos.map(emp => ({
  id: emp.id,
  name: emp.name,
  foto: emp.image_128 ? ('data:image/png;base64,' + emp.image_128) : null,
  cargo: emp.job_title || 'Técnico',
  manager_id: (Array.isArray(emp.parent_id) && emp.parent_id[0]) || null,
  manager_name: (Array.isArray(emp.parent_id) && emp.parent_id[1]) || null,
  // fts-suite#486 (11-nov-2026): sin celular ni correo (nadie los leía) y sin '0000' por
  // omisión (quien no tiene PIN en Odoo entraba con 0000). El PIN sigue aquí SOLO porque
  // Mi Perfil todavía compara en el navegador; sale cuando Mi Perfil verifique en el servidor.
  pin: emp.pin || null,
  department_id: (Array.isArray(emp.department_id) && emp.department_id[0]) || null,
  department_name: (Array.isArray(emp.department_id) && emp.department_id[1]) || null,
  // F1 Sprint 1 Fase 3 (2026-05-11): expose campos custom para refactor autoprogresivo
  // de horarios-base.js y planeacion/empleados.js _normalizar. Ver PLAN_NOMINA §0.5.
  x_studio_hora_entrada: emp.x_studio_hora_entrada || 0,
  x_categoria_nomina: emp.x_categoria_nomina || null,
  x_aplica_ppa: emp.x_aplica_ppa === true,
  // PR-2 Fase 1.5 (2026-07-09): bolsa default del empleado (m2o account.analytic.account)
  x_studio_cuenta_indirecta_default: emp.x_studio_cuenta_indirecta_default || null
}));
return [{ json: { empleados: mapped, total: mapped.length } }];