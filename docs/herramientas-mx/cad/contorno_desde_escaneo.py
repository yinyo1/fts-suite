"""Escaneo 3D -> contorno 2D de la ficha · sesion nocturna 1 (#330).

Uso:
  python3 cad/contorno_desde_escaneo.py <ID_PIEZA> escaneo.stl        (o .obj)
  python3 cad/contorno_desde_escaneo.py --prueba                       (malla sintetica, no toca cad/contornos)

Supuesto del escaneo: la herramienta se escanea ACOSTADA como va en el cajon (Z hacia arriba), en milimetros.
Si el escaner exporta en metros o pulgadas, usar --escala 1000 o --escala 25.4.

Salida: cad/contornos/<ID>.json con {L, A, H, puntos} y un SVG de revision al lado. generar_cajon.py usa ese poligono
en lugar del rectangulo simplificado. La silueta es la PROYECCION vertical (lo que ocupa vista desde arriba),
simplificada a 0.5 mm; la holgura de 1 mm y la pared de 3 mm las agrega el .scad, no este script.
"""
import json, os, sys
import numpy as np, trimesh
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
AQUI = os.path.dirname(os.path.abspath(__file__))

def silueta(mesh, tol=0.5):
    # proyeccion: union de los triangulos proyectados al plano XY (robusto aun con mallas de escaneo no estancas)
    tri = mesh.vertices[mesh.faces][:, :, :2]
    polys = [Polygon(t) for t in tri if Polygon(t).area > 1e-6]
    u = unary_union(polys).buffer(0.2).buffer(-0.2)
    if isinstance(u, MultiPolygon): u = max(u.geoms, key=lambda g: g.area)
    return Polygon(u.exterior).simplify(tol, preserve_topology=True)

def procesar(pid, path, escala=1.0, salida=None):
    m = trimesh.load(path, force='mesh')
    m.apply_scale(escala)
    m.apply_translation(-m.bounds[0])
    p = silueta(m)
    minx, miny, maxx, maxy = p.bounds
    pts = [[round(x - minx, 2), round(y - miny, 2)] for x, y in list(p.exterior.coords)[:-1]]
    L, A, H = round(maxx - minx, 1), round(maxy - miny, 1), round(float(m.bounds[1][2]), 1)
    out = {'id': pid, 'fuente': os.path.basename(path), 'L': L, 'A': A, 'H': H, 'puntos': pts, 'vertices': len(pts),
           'area_mm2': round(p.area, 1), 'nota': 'contorno de escaneo; holgura y pared las agrega fts_rejilla.scad'}
    d = salida or os.path.join(AQUI, 'contornos'); os.makedirs(d, exist_ok=True)
    json.dump(out, open(os.path.join(d, f'{pid}.json'), 'w'), indent=1)
    path_d = 'M ' + ' L '.join(f'{x},{A - y}' for x, y in pts) + ' Z'
    open(os.path.join(d, f'{pid}.svg'), 'w').write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 {L + 10} {A + 10}"><path d="{path_d}" fill="#f2b705" stroke="#1d1d1b" stroke-width="0.6"/>'
        f'<text x="0" y="{A + 4}" font-size="4">{pid} {L} x {A} x {H} mm</text></svg>')
    return out

def malla_prueba():
    # desarmador: mango cilindrico 110 x 32 + vastago 100 x 6, acostado sobre X
    mango = trimesh.creation.cylinder(radius=16, height=110, sections=48); mango.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    mango.apply_translation([55, 0, 16])
    vast = trimesh.creation.cylinder(radius=3, height=100, sections=24); vast.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    vast.apply_translation([160, 0, 16])
    return trimesh.util.concatenate([mango, vast])

if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--prueba':
        import tempfile
        t = tempfile.mkdtemp(); f = os.path.join(t, 'prueba.stl'); malla_prueba().export(f)
        r = procesar('PRUEBA', f, salida=t)
        print('prueba: L %s A %s H %s, %d vertices, area %s mm2 (esperado ~210 x 32 x 32)' % (r['L'], r['A'], r['H'], r['vertices'], r['area_mm2']))
        print('archivos en', t)
        sys.exit(0 if abs(r['L'] - 210) < 2 and abs(r['A'] - 32) < 1 and abs(r['H'] - 32) < 1 else 1)
    esc = 1.0
    if '--escala' in a: i = a.index('--escala'); esc = float(a[i + 1]); del a[i:i + 2]
    r = procesar(a[0], a[1], esc)
    print(json.dumps({k: r[k] for k in ('id', 'L', 'A', 'H', 'vertices', 'area_mm2')}))
