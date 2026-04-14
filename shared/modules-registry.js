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
      { id:'kiosk',       label:'Kiosk'       },
      { id:'dashboard',   label:'Dashboard'   },
      { id:'planeacion',  label:'Planeación'  },
      { id:'incidencias', label:'Incidencias' }
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
  }
];

window.MODULES_REGISTRY = MODULES_REGISTRY;
