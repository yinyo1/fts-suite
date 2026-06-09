// ═══ FTS Suite — Registry de módulos ═══
// Agregar un módulo nuevo aquí lo hace visible automáticamente
// en el panel admin y en el launcher raíz. No hay que tocar
// nada más cuando se agregan submódulos.

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
    id:         'finanzas',
    label:      '💰 Finanzas',
    path:       'finanzas/',
    cardId:     'card-finanzas',
    status:     'active',
    version:    '0.1.0',
    build:      '20260529-paso1-auth',
    // 13+ submódulos en 5 bloques. Auth dedicada (no FTSAuth). Paso 1 = auth server-side.
    submodulos: [
      { id:'dashboard',     label:'Dashboard' },
      { id:'cash',          label:'Saldos & Cash' },
      { id:'anomalias',     label:'Anomalías' },
      { id:'ar',            label:'AR — por cobrar' },
      { id:'ap',            label:'AP — por pagar' },
      { id:'bills',         label:'Bills 3-way' },
      { id:'rent-emp',      label:'Rentabilidad empresa' },
      { id:'rent-proy',     label:'Rentabilidad proyectos' },
      { id:'det-fantasma',  label:'Detector fantasma' },
      { id:'det-mo',        label:'Detector MO' },
      { id:'pl',            label:'P&L (Resultados)' },
      { id:'bg-fts',        label:'Balance FTS' },
      { id:'bg-personal',   label:'Patrimonio personal' },
      { id:'cashflow',      label:'Cash Flow' },
      { id:'transacciones', label:'Transacciones (Facturas)' },
      { id:'pagos-hub',     label:'Hub de Pagos' },
      { id:'sync-sat',      label:'Sync SAT' }
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
