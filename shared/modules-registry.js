// ═══ FTS Suite — Registry de módulos ═══
// OJO (corregido en #407): agregar un módulo aquí NO lo hace visible solo.
// Este arreglo solo ATENÚA las tarjetas del lanzador según modulos[id].acceso de
// FTSAuth. La tarjeta HTML se escribe aparte en index.html (id = cardId) y el árbol
// de permisos del panel admin es otra lista (USERS_MODULES_TREE en
// shared/admin/config-master.html). Un módulo con auth:'suite' lo decide SuiteAuth
// (scopes del JWT) en su propia pantalla y el lanzador no lo atenúa.

const MODULES_REGISTRY = [
  {
    id:         'seguridad',
    label:      '🛡️ Seguridad',
    path:       'seguridad/',
    cardId:     'card-seguridad',
    submodulos: [
      { id:'instructor', label:'Instructor DC-3' },
      { id:'empleado',   label:'Empleado DC-3'   },
      { id:'iperc',      label:'IPERC'           }
    ]
  },
  {
    id:         'operaciones',
    label:      '⚙️ Operaciones',
    path:       'operaciones/',
    cardId:     'card-operaciones',
    submodulos: [
      { id:'kiosk',       label:'Kiosk'            },
      { id:'dashboard',   label:'Dashboard'        },
      { id:'planeacion',  label:'Planeación', status:'active', version:'2.2.0', build:'20260428-planeacion-f3-export-v3' },
      { id:'incidencias', label:'Incidencias'      },
      { id:'supervisor',  label:'Panel Supervisor' }
    ]
  },
  {
    id:         'ingenieria',
    label:      '🏗️ Ingeniería',
    path:       'ingenieria/',
    cardId:     'card-ingenieria',
    submodulos: [
      { id:'analisis_estructural', label:'Análisis Estructural' }
    ]
  },
  {
    id:         'rh',
    label:      '👥 RH',
    path:       'rh/',
    cardId:     'card-rh',
    submodulos: []
  },
  {
    id:         'comercial',
    label:      '📋 Comercial',
    path:       'comercial/',
    cardId:     'card-comercial',
    submodulos: []
  },
  {
    id:         'marketing',
    label:      '🔎 Marketing',
    path:       'marketing/',
    cardId:     'card-marketing',   // v3 (#421): ya no hay tarjeta en el lanzador; se entra por Comercial → Marketing
    parent:     'comercial',
    auth:       'suite',   // marketing:usar · marketing:crm · marketing:bandeja · marketing:equipo
    status:     'active',
    version:    'M3.0.0',
    submodulos: [
      { id:'prospectador', label:'Prospectador' },
      { id:'lead',         label:'Nuevo lead' },
      { id:'tablero',      label:'Tablero del equipo (⋮, marketing:equipo)' }
    ]
  },
  {
    id:         'finanzas',
    label:      '💰 Finanzas',
    path:       'finanzas/',
    cardId:     'card-finanzas',
    status:     'active',
    version:    '0.3.0',
    build:      '20260609-paso3-facturas',
    // 23 submódulos en 5 bloques. Auth dedicada (no FTSAuth). Paso 3: facturas-odoo + bills-odoo conectados a Odoo.
    submodulos: [
      { id:'dashboard',             label:'Dashboard' },
      { id:'cash',                  label:'Saldos & Cash' },
      { id:'anomalias',             label:'Anomalías' },
      { id:'ar',                    label:'AR — por cobrar' },
      { id:'ap',                    label:'AP — por pagar' },
      { id:'bills-3way',            label:'Bills 3-way' },
      { id:'so-tracker',            label:'Tracker SO' },
      { id:'concil-sat',            label:'Conciliación SAT ↔ Odoo' },
      { id:'rent-emp',              label:'Rentabilidad empresa' },
      { id:'rent-proy',             label:'Rentabilidad proyectos' },
      { id:'det-fantasma',          label:'Detector fantasma' },
      { id:'det-mo',                label:'Detector MO' },
      { id:'pl',                    label:'P&L (Resultados)' },
      { id:'bg-fts',                label:'Balance FTS' },
      { id:'bg-personal',           label:'Patrimonio personal' },
      { id:'cashflow',              label:'Cash Flow' },
      { id:'facturas-odoo',         label:'Facturas Odoo' },
      { id:'bills-odoo',            label:'Bills Odoo' },
      { id:'facturas-sat-ingresos', label:'Facturas SAT Ingresos' },
      { id:'facturas-sat-egresos',  label:'Facturas SAT Egresos' },
      { id:'instrumentos-pago',     label:'Instrumentos de pago' },
      { id:'pagos-hub',             label:'Hub de Pagos' },
      { id:'sync-sat',              label:'Sync SAT' }
    ]
  },
  {
    id:         'odoo',
    label:      '⚙️ Odoo',
    path:       'odoo/',
    cardId:     'card-odoo',
    submodulos: []
  },
  {
    id:         'hatch',
    label:      '⚓ Hatch',
    path:       'hatch/',
    cardId:     'card-hatch',
    submodulos: []
  }
];

if (typeof window !== 'undefined') window.MODULES_REGISTRY = MODULES_REGISTRY;

// ═══ Tarjetas con la CUENTA PERSONAL (SuiteAuth) · fts-suite#501 ═══
// Solo la usa la rama de cuenta personal del lanzador (login_dual_v1). La entrada
// anterior (FTSAuth) sigue decidiendo con MODULES_REGISTRY de arriba, sin cambios.
//   tipo 'suite' → la pantalla del módulo entiende la cuenta personal: se abre con
//                  cualquiera de `scopes` (prefijo si termina en ':').
//   tipo 'c4'    → la pantalla todavía solo entiende la entrada anterior (plan C4 de
//                  #501). La tarjeta se muestra a quien trae `suite:direccion`, con el
//                  sello «entrada anterior», y el módulo pide su login como siempre.
// `suite:direccion` es un scope del perfil Dirección (chats_0014): ningún id ni
// nombre fijo aquí; quién lo tiene lo decide la base.
const SUITE_TARJETAS = [
  { cardId: 'card-comercial',     tipo: 'suite', scopes: ['comercial:read', 'conceptualizador:usar', 'marketing:usar'] },
  { cardId: 'card-rh',            tipo: 'suite', scopes: ['nomina:write', 'retardos:read', 'rh:read', 'usuarios:alta_codigo', 'nomina_usa:'], rh: true },
  { cardId: 'card-finanzas',      tipo: 'c4' },
  { cardId: 'card-operaciones',   tipo: 'c4' },
  { cardId: 'card-pmo',           tipo: 'c4' },
  { cardId: 'card-seguridad',     tipo: 'c4' },
  { cardId: 'card-ingenieria',    tipo: 'c4' },
  { cardId: 'card-config-master', tipo: 'c4', oculta: true },
  { cardId: 'card-hatch',         tipo: 'c4', oculta: true }
];
const SCOPE_DIRECCION = 'suite:direccion';

/** ¿La cuenta personal abre esta tarjeta? Devuelve 'suite' | 'c4' | null. */
function suiteTarjeta(def, scopes) {
  scopes = Array.isArray(scopes) ? scopes : [];
  const dir = scopes.indexOf(SCOPE_DIRECCION) >= 0;
  if (def.tipo === 'c4') return dir ? 'c4' : null;
  if (dir) return 'suite';
  const ok = (def.scopes || []).some(function (p) {
    return p.slice(-1) === ':' ? scopes.some(function (s) { return s.indexOf(p) === 0; }) : scopes.indexOf(p) >= 0;
  });
  return ok ? 'suite' : null;
}

if (typeof window !== 'undefined') {
  window.SUITE_TARJETAS = SUITE_TARJETAS;
  window.SCOPE_DIRECCION = SCOPE_DIRECCION;
  window.suiteTarjeta = suiteTarjeta;
}
if (typeof module !== 'undefined') module.exports = { SUITE_TARJETAS: SUITE_TARJETAS, SCOPE_DIRECCION: SCOPE_DIRECCION, suiteTarjeta: suiteTarjeta };
