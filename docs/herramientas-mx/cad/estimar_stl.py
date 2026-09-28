"""Gramos y horas de impresion por STL (ESTIMACION, se valida con el cajon piloto) · sesion nocturna 1 (#330).
Modelo: material = cascara (area x 1.2 mm: 3 perimetros de 0.4) + relleno x (volumen - cascara). PETG 1.27 g/cm3.
Flujo efectivo: 15 cm3/h impresora estandar, 30 cm3/h impresora rapida (mismo supuesto que scripts/estimar_impresion.py),
+10 % de viajes. Parametros por tipo de pieza en PARAM."""
import glob, json, os, trimesh
AQUI = os.path.dirname(os.path.abspath(__file__)); STL = os.path.join(AQUI, '..', 'stl')
RHO, CASCARA, STD, RAP = 1.27, 1.2, 15.0, 30.0
PARAM = {  # (capa mm, relleno, patron, soportes, cantidad por juego)
    'loseta': (0.2, 1.00, 'lineas (queda solida: 2.4 mm)', 'no', 1),
    'ficha': (0.2, 0.15, 'giroide', 'no: el rebaje de dedo es un arco que se imprime sin soporte', 1),
    'cuadrante': (0.2, 0.30, 'giroide', 'no (costillas hacia arriba)', 1),
    'poste': (0.28, 0.25, 'giroide', 'no (parado)', 4),
    'union': (0.2, 1.00, 'lineas', 'no', 4)}
def tipo(n):
    for k in PARAM:
        if k in n: return k
    return 'ficha'
filas = []
for f in sorted(glob.glob(os.path.join(STL, '*.stl'))):
    m = trimesh.load(f); n = os.path.basename(f); t = tipo(n); capa, rel, pat, sop, qty = PARAM[t]
    v = m.volume / 1000; sh = min(v, m.area * CASCARA / 1000)
    mat = sh + rel * (v - sh)
    filas.append({'stl': n, 'tipo': t, 'cantidad': qty, 'caja_mm': [round(x) for x in (m.bounds[1] - m.bounds[0])], 'volumen_cm3': round(v, 1),
                  'material_cm3': round(mat * qty, 1), 'gramos': round(mat * RHO * qty), 'h_estandar': round(mat * qty / STD * 1.1, 1),
                  'h_rapida': round(mat * qty / RAP * 1.1, 1), 'capa_mm': capa, 'relleno': f'{int(rel * 100)} %', 'patron': pat, 'soportes': sop})
json.dump(filas, open(os.path.join(STL, 'estimacion_stl.json'), 'w'), indent=1)
for r in filas: print(r['stl'][:58].ljust(58), r['cantidad'], r['gramos'], 'g', r['h_estandar'], 'h std', r['h_rapida'], 'h rap')
for grupo in ('BASE-C6', 'bandeja_8420'):
    g = [r for r in filas if r['stl'].startswith(grupo)]
    print(grupo, 'TOTAL', sum(r['gramos'] for r in g), 'g', round(sum(r['h_estandar'] for r in g), 1), 'h std', round(sum(r['h_rapida'] for r in g), 1), 'h rapida')
