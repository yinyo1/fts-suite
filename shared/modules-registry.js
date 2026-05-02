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
