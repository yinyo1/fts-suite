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

window.MODULES_REGISTRY = MODULES_REGISTRY;
