"""Fase 6 · prototipo_app.html autocontenido con datos de EJEMPLO (no reales) de los flujos de la app."""
import json, os
BASE = os.path.join(os.path.dirname(__file__), '..')
d = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
svgs = {f[:-4]: open(os.path.join(BASE, 'svg', f), encoding='utf-8').read() for f in os.listdir(os.path.join(BASE, 'svg'))}
cajones_base = []
for caja in d['modulos']['BASE']['cajas']:
    for c in caja['cajones']:
        if c['piezas']:
            cajones_base.append({'n': c['n'], 'svg': 'BAS-C%d' % c['n'], 'piezas': [{'activo': p['activo'], 'desc': p['corto']} for p in c['piezas']]})
cajones_ele = []
for caja in d['modulos']['ELE']['cajas']:
    for c in caja['cajones']:
        if c['piezas']:
            cajones_ele.append({'n': c['n'], 'svg': 'ELE-C%d' % c['n'], 'piezas': [{'activo': p['activo'], 'desc': p['corto']} for p in c['piezas']]})
DEMO = {
 'hoy': '2026-09-28',
 'plantas': {
   'TCH': {'nombre': 'Topo Chico (cliente ejemplo)', 'lugares': ['Cuarto electrico 2, gabinete FTS', 'Jaula de contratistas'], 'ultima_asistencia': '2026-09-25', 'stage': 'En progreso'},
   'VTV': {'nombre': 'Vertiv (cliente ejemplo)', 'lugares': ['Bodega de mantenimiento, jaula 3'], 'ultima_asistencia': '2026-09-25', 'stage': 'En progreso'},
   'BRG': {'nombre': 'Bridgestone (cliente ejemplo)', 'lugares': ['Almacen de refacciones, rack B'], 'ultima_asistencia': '2026-08-07', 'stage': 'In Progress'},
   'TALLER': {'nombre': 'Taller FTS', 'lugares': ['Taller'], 'ultima_asistencia': '2026-09-26', 'stage': '-'},
 },
 'personas': {'e79': 'Tecnico A (emp-79, encargado de frente)', 'e124': 'Segurista A (emp-124)', 'e75': 'Supervisor SR A (emp-75)',
              'e6': 'Tecnico B (emp-6)', 'e154': 'Chofer (emp-154)', 'e0': 'Taller FTS'},
 'kits': [
   {'id': 'FTS-CAR-01', 'estado': 'EN_USO', 'planta': 'TCH', 'lugar': None, 'resp': 'e79', 'modulos': ['BAS-01', 'ELE-01'], 'ult_revision': '2026-09-26'},
   {'id': 'FTS-CAR-02', 'estado': 'RESGUARDADO', 'planta': 'VTV', 'lugar': 'Bodega de mantenimiento, jaula 3', 'resp': 'e6', 'modulos': ['BAS-02', 'SOL-01'], 'ult_revision': '2026-09-25'},
   {'id': 'FTS-CAR-03', 'estado': 'RESGUARDADO', 'planta': 'BRG', 'lugar': 'Almacen de refacciones, rack B', 'resp': 'e79', 'modulos': ['BAS-03'], 'ult_revision': '2026-08-07'},
   {'id': 'FTS-CAR-04', 'estado': 'EN_TALLER', 'planta': 'TALLER', 'lugar': 'Taller', 'resp': 'e0', 'modulos': ['BAS-04'], 'ult_revision': '2026-09-20'},
 ],
 'cajones_base': cajones_base, 'cajones_ele': cajones_ele, 'svgs': svgs,
}
html = open(os.path.join(os.path.dirname(__file__), 'prototipo_app.template.html'), encoding='utf-8').read()
html = html.replace('__DEMO__', json.dumps(DEMO, ensure_ascii=False))
open(os.path.join(BASE, 'prototipo_app.html'), 'w', encoding='utf-8').write(html)
print(len(html))
