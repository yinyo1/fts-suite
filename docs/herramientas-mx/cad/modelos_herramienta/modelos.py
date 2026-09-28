"""Modelos 3D parametricos de herramienta por familia (sesion nocturna 2, #338).

Cada modelo se construye DENTRO del rectangulo envolvente del catalogo (L x A x H, con su nivel en
datos/validacion_documental.json), en coordenadas locales: x a lo largo de L, y a lo largo de A, z hacia arriba (H), con
la herramienta acostada tal como la pone el acomodo. Las PROPORCIONES internas (donde va la empunadura, que tan ancha es
la cabeza) son supuesto de diseno tomado de las fotos de producto del fabricante: no son medidas. Lo unico medido o
documentado es la envolvente. Por eso un modelo nunca puede crear una interferencia que la caja envolvente no tenga;
lo que si agregan son las VARIANTES que cambian la envolvente (M18 con bateria puesta, esmeriladora con mango lateral).

Tipos:
  pistola      M18 tipo pistola (impacto, atornillador, rotomartillo): cuerpo, empunadura, pie de bateria, yunque o
               broquero; variante con bateria CP2.0 puesta (dimensiones de la bateria del catalogo, nivel D1).
  esmeril      esmeriladora angular: cabeza con guarda, caja de engranes, cuerpo; variante con mango lateral.
  pinza        perfil extruido: mordazas + dos brazos que abren hacia el mango.
  llave        perfil extruido: cabeza del ancho total + mango angosto (ajustable, stillson, caiman, martillo, mazo).
  desarmador   mango cilindrico + vastago.
  cilindro     tazon, cabezal de tarraja, flexometro: cilindro o caja redondeada.
  estuche      juego en estuche, cargador, bateria suelta, medidor: caja con esquinas redondeadas.
"""
import math
import numpy as np
import trimesh
from shapely.geometry import Polygon, box as sbox
from shapely.ops import unary_union

# Supuestos de diseno (parametricos; sustituir con vernier)
BAT_ENCAJE = 10.0     # mm que la bateria entra en el pie de la herramienta al montarse
SEG = 24              # segmentos de los cilindros

def _box(x0, y0, z0, x1, y1, z1):
    m = trimesh.creation.box(extents=(x1 - x0, y1 - y0, z1 - z0))
    m.apply_translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    return m

def _cyl(r, h, axis, center):
    m = trimesh.creation.cylinder(radius=r, height=h, sections=SEG)
    if axis == 'x': m.apply_transform(trimesh.transformations.rotation_matrix(math.pi / 2, (0, 1, 0)))
    if axis == 'y': m.apply_transform(trimesh.transformations.rotation_matrix(math.pi / 2, (1, 0, 0)))
    m.apply_translation(center)
    return m

def _extr(poly, z0, h):
    poly = poly.buffer(0)
    if poly.geom_type == 'MultiPolygon': poly = max(poly.geoms, key=lambda g: g.area)
    m = trimesh.creation.extrude_polygon(poly, h)
    m.apply_translation((0, 0, z0))
    return m

def _union(parts):
    parts = [p for p in parts if p is not None]
    try:
        u = trimesh.boolean.union(parts, engine='manifold')
        if u.is_volume: return u
    except Exception:
        pass
    return trimesh.util.concatenate(parts)

def tipo_de(p):
    t = (p.get('corto') or p.get('desc') or '').lower(); i = p['id']
    if i in ('IMP38', 'IMP14', 'ROTO18'): return 'pistola'
    if i.startswith('ESM'): return 'esmeril'
    if i.startswith('BAT') or i.startswith('CARG'): return 'estuche'
    if 'pinza' in t or i in ('PDIAG', 'CHOF8', 'PELEC', 'CRIMP', 'PONCH', 'PELA', 'MINIP'): return 'pinza'
    if any(k in t for k in ('llave ajustable', 'stillson', 'caiman', 'martillo', 'mazo')): return 'llave'
    if 'desarmador aislado' in t or i.startswith('WIHA-DS'): return 'desarmador'
    if i in ('TAZON', 'CAB34', 'FLEX1', 'FLEX2', 'GRILL'): return 'cilindro'
    return 'estuche'

def pistola(L, A, H, bat=None):
    """bat: None (sin bateria) o (Lb, Ab, Hb) de la bateria CP2.0. Devuelve (malla, envolvente L, A, H)."""
    hb = 0.42 * A                                  # alto del cuerpo (cabeza + motor), supuesto de foto
    cuerpo = _cyl(min(hb, H) / 2, 0.82 * L, 'x', (0.18 * L + 0.41 * L, A - hb / 2, H / 2))
    carcasa = _box(0.30 * L, A - hb, 0.1 * H, L, A, 0.9 * H)
    yunque = _cyl(0.22 * hb, 0.18 * L, 'x', (0.09 * L, A - hb / 2, H / 2))
    grip = _box(0.50 * L, 0.18 * A, 0.2 * H, 0.78 * L, A - hb + 1, 0.8 * H)
    pie = _box(0.30 * L, 0, 0, 0.98 * L, 0.18 * A, H)
    partes = [cuerpo, carcasa, yunque, grip, pie]
    Lt, At, Ht = L, A, H
    if bat:
        Lb, Ab, Hb = bat                           # catalogo: 118 x 79 x 55 (largo, ancho, alto)
        caida = Hb - BAT_ENCAJE
        for q in partes: q.apply_translation((0, caida, 0))
        Ht = max(H, Ab)
        dz = (Ht - H) / 2
        for q in partes: q.apply_translation((0, 0, dz))
        x0 = max(0.0, 0.98 * L - Lb)
        partes.append(_box(x0, 0, 0, x0 + Lb, caida + 1, Ab))   # bateria de canto, ancho Ab hacia arriba
        At = A + caida
    return _union(partes), (Lt, At, Ht)

def esmeril(L, A, H, mango=False, mango_largo=110.0, mango_d=26.0):
    """Esmeriladora 4-1/2 acostada: guarda y cabeza al frente (x=0), cuerpo hacia atras."""
    yc = A / 2
    guarda = _cyl(min(A, 130) / 2, 0.55 * H, 'z', (min(A, 130) / 2, yc, 0.55 * H / 2))
    engranes = _box(0.14 * L, yc - 36, 0, 0.40 * L, yc + 36, H)
    cuerpo = _cyl(0.40 * H, 0.60 * L, 'x', (0.40 * L + 0.30 * L, yc, 0.45 * H))
    partes = [guarda, engranes, cuerpo]
    At = A
    if mango:   # mango lateral atornillado en la caja de engranes, hacia +y (supuesto: 110 x 26 mm)
        partes.append(_cyl(mango_d / 2, mango_largo, 'y', (0.27 * L, yc + 36 + mango_largo / 2, H / 2)))
        At = max(A, yc + 36 + mango_largo)
    return _union(partes), (L, At, H)

def pinza(L, A, H):
    mord = Polygon([(0, 0.30 * A), (0.30 * L, 0.18 * A), (0.30 * L, 0.82 * A), (0, 0.70 * A)])
    b1 = Polygon([(0.28 * L, 0.20 * A), (L, 0), (L, 0.36 * A), (0.30 * L, 0.48 * A)])
    b2 = Polygon([(0.28 * L, 0.80 * A), (L, A), (L, 0.64 * A), (0.30 * L, 0.52 * A)])
    return _extr(unary_union([mord, b1, b2]), 0, H), (L, A, H)

def llave(L, A, H):
    cab = sbox(0, 0, 0.22 * L, A)
    mango = sbox(0.18 * L, 0.32 * A, L, 0.68 * A)
    return _extr(unary_union([cab, mango]), 0, H), (L, A, H)

def desarmador(L, A, H):
    d = min(A, H)
    mango = _cyl(d / 2, 0.45 * L, 'x', (L - 0.225 * L, A / 2, d / 2))
    vast = _cyl(max(2.5, 0.22 * d), 0.56 * L, 'x', (0.28 * L, A / 2, d / 2))
    return _union([mango, vast]), (L, A, H)

def cilindro(L, A, H):
    if abs(L - A) < 0.1 * max(L, A):
        return _cyl(min(L, A) / 2, H, 'z', (L / 2, A / 2, H / 2)), (L, A, H)
    return estuche(L, A, H)

def estuche(L, A, H):
    r = min(6.0, L / 4, A / 4)
    return _extr(sbox(0, 0, L, A).buffer(-r).buffer(r), 0, H), (L, A, H)

def modelo(p, variante=None, bat=(118, 79, 55)):
    """p: pieza del acomodo (id, corto, L, A, H). variante: 'con_bateria' o 'con_mango'. Coordenadas locales."""
    t = tipo_de(p); L, A, H = float(p['L']), float(p['A']), float(p['H'])
    if t == 'pistola': m, env = pistola(L, A, H, bat if variante == 'con_bateria' else None)
    elif t == 'esmeril': m, env = esmeril(L, A, H, mango=(variante == 'con_mango'))
    else: m, env = {'pinza': pinza, 'llave': llave, 'desarmador': desarmador, 'cilindro': cilindro, 'estuche': estuche}[t](L, A, H)
    return t, m, env

if __name__ == '__main__':
    for nom, (m, env) in {'pistola': pistola(202, 122, 65), 'pistola_bat': pistola(202, 122, 65, (118, 79, 55)),
                          'esmeril': esmeril(357, 152, 90), 'esmeril_mango': esmeril(357, 152, 90, True),
                          'pinza': pinza(250, 50, 15), 'llave': llave(305, 78, 20), 'desarmador': desarmador(215, 32, 32)}.items():
        print(nom, 'volumen', m.is_volume, 'bounds', np.round(m.bounds, 1).tolist(), 'envolvente', env)
