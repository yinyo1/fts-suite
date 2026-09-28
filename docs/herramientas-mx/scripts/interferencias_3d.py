"""Deteccion de interferencias 3D del acomodo vigente (sesion nocturna 2, #338).

Uso:
  python3 scripts/interferencias_3d.py                 # corre y escribe reporte_interferencias.md + datos/interferencias_3d.json
  python3 scripts/interferencias_3d.py --corregir      # si hay fallas, mueve las piezas que fallan y reescribe diseno_carrito.json
  python3 scripts/interferencias_3d.py --variante-m18  # corre ademas las M18 con bateria puesta y la esmeriladora con mango

Modelo por cajon (coordenadas del cajon: x a lo ancho, y al fondo, z hacia arriba, piso interior en z = 0):
  - cajon: interior ancho x fondo x alto con las cotas del fabricante (Bloque 1 de #330). El "alto" es el alto util que
    usa el acomodo: del piso del cajon a la parte baja del de arriba (o de la tapa). Paredes de 3 mm, labio interior de
    4 mm en los ultimos 3 mm de pared y correderas por fuera de la pared: SUPUESTOS parametricos, sin cota oficial.
  - techo: una losa sobre el alto util. Representa lo que barre el cajon de arriba (o la tapa) al cerrar.
  - loseta de 2.4 mm y ficha con piso de 1.2 mm (fts_rejilla.scad): la herramienta queda a 3.6 mm del piso.
  - ficha: contorno de la herramienta + holgura 1 + pared 3, alta hasta la profundidad de cavidad min(0.6 H, 25).
  - herramienta: modelo parametrico de cad/modelos_herramienta/modelos.py, dentro de la envolvente del catalogo.
Chequeos:
  a) herramienta contra herramienta y contra fichas (la propia y las ajenas)
  b) herramienta y ficha contra paredes, labio y correderas
  c) herramienta y ficha contra el techo (volumen del cajon de arriba al cerrar)
  d) extraccion: en los dos lados largos, zona de dedos de 7 mm (holgura 1 + pared recortada por el rebaje 3 + mitad del
     agarre de 6 mm de la Fase 4) desde 15 mm abajo del tope de la pieza hasta el borde del cajon; y la columna vertical
     sobre la huella hasta el borde. Deben estar libres de otras piezas, otras fichas, paredes y labio.
Resultado: FALLA si hay contacto; PASA JUSTO si la holgura minima es menor a 3 mm (1 mm para ficha contra pared, que es
fija e impresa); PASA en otro caso.
"""
import json, math, os, sys, copy
import numpy as np
import trimesh
from trimesh.collision import CollisionManager
BASE = os.path.join(os.path.dirname(__file__), '..')
sys.path.insert(0, os.path.join(BASE, 'cad', 'modelos_herramienta'))
import modelos

# supuestos parametricos (sustituir con vernier)
PARED, LABIO, LABIO_H = 3.0, 4.0, 3.0
ESP_LOSETA, BASE_FICHA, HOLG, PARED_F = 2.4, 1.2, 1.0, 3.0
PROF_MAX, PROF_FRAC = 25.0, 0.6
DEDO, YEMA = 7.0, 15.0
JUSTO, JUSTO_FICHA = 3.0, 1.0
PETG = 1.27e-3                    # g por mm3
G_LOSETA_CM2 = 378 / (414 * 318 / 100)    # loseta solida medida en el STL de BASE C6 (bloque 3 de #330)
BANDEJA_G = 902                   # bandeja 8420 medida en STL (bloque 3)

_CACHE = {}
def modelo_cache(p, variante=None):
    k = (p['id'], variante)
    if k not in _CACHE: _CACHE[k] = modelos.modelo(p, variante)
    return _CACHE[k]

def box(x0, y0, z0, x1, y1, z1):
    m = trimesh.creation.box(extents=(x1 - x0, y1 - y0, z1 - z0)); m.apply_translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)); return m

def cajon_mallas(W, D, alto):
    walls = [box(-PARED, -PARED, 0, 0, D + PARED, alto), box(W, -PARED, 0, W + PARED, D + PARED, alto),
             box(0, -PARED, 0, W, 0, alto), box(0, D, 0, W, D + PARED, alto)]
    lab = [box(0, 0, alto - LABIO_H, LABIO, D, alto), box(W - LABIO, 0, alto - LABIO_H, W, D, alto),
           box(0, 0, alto - LABIO_H, W, LABIO, alto), box(0, D - LABIO, alto - LABIO_H, W, D, alto)]
    rieles = [box(-PARED - 13, 0, alto * 0.3, -PARED, D, alto * 0.3 + 20), box(W + PARED, 0, alto * 0.3, W + PARED + 13, D, alto * 0.3 + 20)]
    techo = box(-PARED, -PARED, alto, W + PARED, D + PARED, alto + 10)
    return trimesh.util.concatenate(walls + lab), trimesh.util.concatenate(rieles), techo

def colocar(m, p, z0, env):
    m = m.copy()
    if p['rot']:   # L pasa al fondo (y): (x, y) -> (A - y, x), la envolvente queda en [0, A] x [0, L]
        m.apply_transform(trimesh.transformations.rotation_matrix(math.pi / 2, (0, 0, 1)))
        m.apply_translation((env[1], 0, 0))
    m.apply_translation((p['x'], p['y'], z0))
    return m

def huella(p, env):
    L, A = env[0], env[1]
    return (L, A) if not p['rot'] else (A, L)

def prof_de(H): return round(min(PROF_MAX, PROF_FRAC * H), 1)

def ficha_malla(p, w, h, H):
    prof = prof_de(H); ext = HOLG + PARED_F; z0 = ESP_LOSETA
    outer = box(p['x'] - ext, p['y'] - ext, z0, p['x'] + w + ext, p['y'] + h + ext, z0 + BASE_FICHA + prof)
    cav = box(p['x'] - HOLG, p['y'] - HOLG, z0 + BASE_FICHA, p['x'] + w + HOLG, p['y'] + h + HOLG, z0 + BASE_FICHA + prof + 1)
    try: return trimesh.boolean.difference([outer, cav], engine='manifold')
    except Exception: return outer

def ficha_gramos(w, h, H):
    prof = prof_de(H); ext = HOLG + PARED_F
    v = (w + 2 * ext) * (h + 2 * ext) * (BASE_FICHA + prof) - (w + 2 * HOLG) * (h + 2 * HOLG) * prof
    return v * PETG

def zonas_dedo(p, w, h, top, alto):
    z0 = max(ESP_LOSETA + BASE_FICHA, top - YEMA)
    if z0 >= alto: z0 = alto - 1
    if w >= h:   # lados largos paralelos a x: dedos en y-
        l = min(0.5 * w, 60); cx = p['x'] + w / 2
        return [box(cx - l / 2, p['y'] - DEDO, z0, cx + l / 2, p['y'] - 0.01, alto), box(cx - l / 2, p['y'] + h + 0.01, z0, cx + l / 2, p['y'] + h + DEDO, alto)]
    l = min(0.5 * h, 60); cy = p['y'] + h / 2
    return [box(p['x'] - DEDO, cy - l / 2, z0, p['x'] - 0.01, cy + l / 2, alto), box(p['x'] + w + 0.01, cy - l / 2, z0, p['x'] + w + DEDO, cy + l / 2, alto)]

def distancia(mgr, m):
    if mgr is None or not len(mgr._objs): return math.inf, None
    hit, names = mgr.in_collision_single(m, return_names=True)
    if hit: return 0.0, sorted(names)[0]
    d, n = mgr.min_distance_single(m, return_name=True)
    return d, n

def analizar(cj, W, D, alto, variantes=None):
    variantes = variantes or {}
    paredes, rieles, techo = cajon_mallas(W, D, alto)
    z0 = ESP_LOSETA + BASE_FICHA
    tools, fichas, info = {}, {}, {}
    for p in cj['piezas']:
        t, m, env = modelo_cache(p, variantes.get(p['id']))
        w, h = huella(p, env)
        tm = colocar(m, p, z0, env)
        tools[p['activo']] = tm
        fichas[p['activo']] = ficha_malla(p, w, h, env[2])
        info[p['activo']] = {'p': p, 'tipo': t, 'w': w, 'h': h, 'H': env[2], 'top': z0 + env[2], 'env': env}
    res = []
    for a, tm in tools.items():
        I = info[a]; p = I['p']; checks = []
        otros_t = CollisionManager(); otros_f = CollisionManager()
        for b in tools:
            if b != a: otros_t.add_object('herr ' + b, tools[b]); otros_f.add_object('ficha ' + b, fichas[b])
        cont = CollisionManager(); cont.add_object('pared/labio', paredes); cont.add_object('corredera', rieles)
        tec = CollisionManager(); tec.add_object('techo (cajon de arriba)', techo)
        own = CollisionManager(); own.add_object('ficha propia', fichas[a])
        checks.append(('a', 'herramienta vs herramienta', *distancia(otros_t, tm), JUSTO))
        checks.append(('a', 'herramienta vs fichas ajenas', *distancia(otros_f, tm), JUSTO))
        d_own, n_own = distancia(own, tm)
        checks.append(('a', 'herramienta vs ficha propia', d_own if d_own == 0 else math.inf, n_own, JUSTO))
        checks.append(('b', 'herramienta vs cajon', *distancia(cont, tm), JUSTO))
        checks.append(('b', 'ficha vs cajon', *distancia(cont, fichas[a]), JUSTO_FICHA))
        checks.append(('c', 'herramienta vs cajon de arriba', *distancia(tec, tm), JUSTO))
        checks.append(('c', 'ficha vs cajon de arriba', *distancia(tec, fichas[a]), JUSTO))
        for k, zona in enumerate(zonas_dedo(p, I['w'], I['h'], I['top'], alto)):
            dd = min(distancia(otros_t, zona), distancia(otros_f, zona), distancia(cont, zona), key=lambda r: r[0])
            checks.append(('d', f'dedos lado {k + 1}', *dd, JUSTO))
        col = box(p['x'], p['y'], I['top'], p['x'] + I['w'], p['y'] + I['h'], alto + 0.01) if I['top'] < alto else None
        if col is not None:
            dd = min(distancia(otros_t, col), distancia(cont, col), key=lambda r: r[0])
            checks.append(('d', 'columna de salida', *dd, JUSTO))
        # regla de diseno (sesion 2): si UN lado largo queda contra pared o labio y el otro esta libre, la ficha lleva el
        # rebaje de dedo solo del lado libre (cad/fts_rejilla.scad, parametro lados) y el lado bloqueado no se exige
        dd = [i for i, c in enumerate(checks) if c[1].startswith('dedos')]
        rebaje = [0, 1]
        if len(dd) == 2 and os.environ.get('UN_LADO', '1') == '1':
            z = [checks[i][2] == 0 for i in dd]
            if z[0] != z[1]:
                i_bloq = dd[0] if z[0] else dd[1]
                rebaje = [1] if z[0] else [0]
                c = checks[i_bloq]; checks[i_bloq] = (c[0], c[1] + ' (no aplica: rebaje solo del otro lado)', math.inf, c[3], c[4])
        peor = 'PASA'
        for c in checks:
            if c[2] == 0: peor = 'FALLA'; break
            if c[2] < c[4] and peor == 'PASA': peor = 'PASA JUSTO'
        dmin = min((c for c in checks), key=lambda c: c[2])
        res.append({'activo': a, 'id': p['id'], 'desc': p['corto'], 'tipo': I['tipo'], 'estado': peor, 'rebaje_lados': rebaje,
                    'holgura_min_mm': None if math.isinf(dmin[2]) else round(dmin[2], 1), 'contra': dmin[3], 'chequeo': dmin[0] + ' ' + dmin[1],
                    'tope_mm': round(I['top'], 1), 'envolvente': [round(v, 1) for v in I['env']],
                    'checks': [{'k': c[0], 'que': c[1], 'mm': None if math.isinf(c[2]) else round(c[2], 1), 'contra': c[3]} for c in checks]})
    return res, tools, fichas

def peso_cajon(cj, W, D, modelo_caja):
    herr = sum(p['peso_kg'] for p in cj['piezas'])
    f = 0.0
    for p in cj['piezas']:
        _, _, env = modelo_cache(p)
        w, h = (env[0], env[1]) if not p['rot'] else (env[1], env[0])
        f += ficha_gramos(w, h, env[2])
    los = W * D / 100 * G_LOSETA_CM2
    return round(herr, 2), round(f / 1000, 2), round(los / 1000, 2)

ESTADO_ORDEN = {'PASA': 0, 'PASA JUSTO': 1, 'FALLA': 2}

def correr(d, variantes=None):
    out = []
    for m, v in d['modulos'].items():
        for c in v['cajas']:
            for cj in c['cajones']:
                if not cj['piezas']: continue
                res, _, _ = analizar(cj, cj['ancho'], cj['fondo'], cj['alto'], variantes)
                est = max((r['estado'] for r in res), key=lambda e: ESTADO_ORDEN[e])
                herr, fich, los = peso_cajon(cj, cj['ancho'], cj['fondo'], c['modelo'])
                extra = BANDEJA_G / 1000 if (c['modelo'] == '48-22-8420' and cj['alto'] == 190) else 0
                total = round(herr + fich + los + extra, 2)
                out.append({'modulo': m, 'caja': c['modelo'], 'cajon': cj['n'], 'ancho': cj['ancho'], 'fondo': cj['fondo'], 'alto': cj['alto'],
                            'estado': est, 'piezas': res, 'peso': {'herramienta': herr, 'fichas_petg': fich, 'loseta_petg': los, 'bandeja': extra,
                            'total': total, 'capacidad': cj['cap_kg'], 'excede': total > cj['cap_kg']}})
    return out

def reacomodar(cj):
    """Reacomoda un cajon que falla dejando 12 mm contra la pared SOLO del lado largo de cada pieza (6 en las puntas, como
    la Fase 4): todas las piezas con su largo en la misma direccion, empaque MaxRects del acomodo. Prueba las dos
    direcciones y tres ordenes; acepta el primero sin FALLA en 3D. Devuelve True si cambio el cajon."""
    sys.path.insert(0, os.path.join(BASE, 'scripts'))
    from acomodo import MaxRects, G_PIEZAS
    W, D = cj['ancho'], cj['fondo']
    orig = copy.deepcopy(cj['piezas'])
    GL, GC = 12, 6     # contra pared: lado largo, punta
    ordenes = [lambda q: -q['L'] * q['A'], lambda q: -q['L'], lambda q: -max(q['L'], q['A']) * 1000 - q['H']]
    for largo_en_x in (True, False):
        gx, gy = (GC, GL) if largo_en_x else (GL, GC)
        for orden in ordenes:
            mr = MaxRects(W - 2 * gx + G_PIEZAS, D - 2 * gy + G_PIEZAS); nuevas = []
            for q in sorted(orig, key=orden):
                _, _, env = modelo_cache(q)
                L, A = env[0], env[1]
                w, h = (L, A) if largo_en_x else (A, L)
                best = None
                for (fx, fy, fw, fh) in mr.free:
                    if w + G_PIEZAS <= fw and h + G_PIEZAS <= fh:
                        k = (min(fw - w, fh - h), fy, fx)
                        if best is None or k < best[0]: best = (k, fx, fy)
                if not best: nuevas = None; break
                _, fx, fy = best
                mr._split((fx, fy, w + G_PIEZAS, h + G_PIEZAS)); mr.used.append((fx, fy, w + G_PIEZAS, h + G_PIEZAS))
                nuevas.append(dict(q, x=fx + gx, y=fy + gy, w=w, h=h, rot=(not largo_en_x)))
            if not nuevas: continue
            cj['piezas'] = sorted(nuevas, key=lambda q: q['activo'])
            res = analizar(cj, W, D, cj['alto'])[0]
            if not any(r['estado'] == 'FALLA' for r in res): return True
    cj['piezas'] = orig
    return False

G_MIN = DEDO + LABIO + 0.5    # hueco minimo entre el lado largo de la pieza y la pared para que entren los dedos

def corregir(d, out):
    """Mueve cada pieza con FALLA de extraccion lejos de la pared de su lado largo lo que le falte para G_MIN, y prueba
    ajustes a lo largo del lado (hasta 24 mm) y separaciones extra (hasta 10 mm). Acepta el primer movimiento con el que
    la pieza deja de fallar sin que ninguna otra pieza del cajon empeore de estado."""
    cambios = []
    for r in out:
        if r['estado'] != 'FALLA': continue
        cj = [cj for c in d['modulos'][r['modulo']]['cajas'] for cj in c['cajones'] if cj['n'] == r['cajon']][0]
        for pr in [x for x in r['piezas'] if x['estado'] == 'FALLA']:
            base = {x['activo']: ESTADO_ORDEN[x['estado']] for x in analizar(cj, cj['ancho'], cj['fondo'], cj['alto'])[0]}
            if base[pr['activo']] < 2: continue
            p = [q for q in cj['piezas'] if q['activo'] == pr['activo']][0]
            _, _, env = modelo_cache(p); w, h = huella(p, env)
            x0, y0 = p['x'], p['y']
            if w >= h: lado, a0, lim_n, n0 = 'y', y0, cj['fondo'], h
            else: lado, a0, lim_n, n0 = 'x', x0, cj['ancho'], w
            falta_ini = max(0.0, G_MIN - a0); falta_fin = max(0.0, G_MIN - (lim_n - a0 - n0))
            perp = []
            for extra in range(0, 12, 2):
                if falta_ini: perp.append(falta_ini + extra)
                if falta_fin: perp.append(-(falta_fin + extra))
            if not perp: perp = [0]
            ok = None
            for dn in perp:
                for dt in (0, 4, -4, 8, -8, 12, -12, 16, -16, 20, -20, 24, -24):
                    if lado == 'y': p['x'], p['y'] = x0 + dt, y0 + dn
                    else: p['x'], p['y'] = x0 + dn, y0 + dt
                    if p['x'] < 0 or p['y'] < 0: continue
                    res = {x['activo']: ESTADO_ORDEN[x['estado']] for x in analizar(cj, cj['ancho'], cj['fondo'], cj['alto'])[0]}
                    if res[p['activo']] < 2 and all(res[k] <= base[k] for k in res if k != p['activo']): ok = True; break
                if ok: break
            if ok: cambios.append({'modulo': r['modulo'], 'cajon': r['cajon'], 'activo': p['activo'], 'id': p['id'], 'de': [x0, y0], 'a': [round(p['x'], 1), round(p['y'], 1)]})
            else: p['x'], p['y'] = x0, y0
    return cambios

if __name__ == '__main__':
    arg = lambda k, dflt: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else dflt
    ruta = arg('--diseno', os.path.join(BASE, 'diseno_carrito.json'))
    salida = arg('--salida', os.path.join(BASE, 'datos', 'interferencias_3d.json'))
    d = json.load(open(ruta, encoding='utf-8'))
    out = correr(d)
    resumen = {'antes': {e: sum(1 for r in out if r['estado'] == e) for e in ESTADO_ORDEN}}
    cambios = []
    if '--corregir' in sys.argv and resumen['antes']['FALLA']:
        # 1) reacomodo del cajon con 12 mm del lado largo contra la pared; 2) si no se puede, mover la pieza que falla
        for r in [r for r in out if r['estado'] == 'FALLA']:
            cj = [cj for c in d['modulos'][r['modulo']]['cajas'] for cj in c['cajones'] if cj['n'] == r['cajon']][0]
            antes = {q['activo']: (q['x'], q['y'], q['rot']) for q in cj['piezas']}
            if reacomodar(cj):
                for q in cj['piezas']:
                    cambios.append({'modulo': r['modulo'], 'cajon': r['cajon'], 'activo': q['activo'], 'id': q['id'], 'metodo': 'reacomodo del cajon',
                                    'de': list(antes[q['activo']][:2]), 'a': [q['x'], q['y']], 'rot': [antes[q['activo']][2], q['rot']]})
        out = correr(d)
        for _ in range(2):
            cc = corregir(d, out)
            if not cc: break
            for c in cc: c['metodo'] = 'mover pieza'
            cambios += cc; out = correr(d)
            if not any(r['estado'] == 'FALLA' for r in out): break
        json.dump(d, open(ruta, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    resumen['despues'] = {e: sum(1 for r in out if r['estado'] == e) for e in ESTADO_ORDEN}
    var = None
    if '--variante-m18' in sys.argv:
        var = {}
        for nom, vv in (('M18 con bateria puesta', {k: 'con_bateria' for k in ('IMP38', 'IMP14', 'ROTO18')}),
                        ('esmeriladora con mango lateral', {k: 'con_mango' for k in ('ESM45', 'ESM45B')})):
            o2 = correr(d, vv)
            var[nom] = [{'modulo': r['modulo'], 'cajon': r['cajon'], 'alto': r['alto'], 'estado': r['estado'],
                         'piezas': [x for x in r['piezas'] if x['id'] in vv]} for r in o2 if any(x['id'] in vv for x in r['piezas'])]
    json.dump({'fecha': '2026-09-28', 'supuestos': {'pared': PARED, 'labio': LABIO, 'labio_alto': LABIO_H, 'dedo': DEDO, 'yema': YEMA, 'justo': JUSTO, 'justo_ficha': JUSTO_FICHA},
               'resumen': resumen, 'cambios': cambios, 'cajones': out, 'variantes': var},
              open(salida, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
    print(json.dumps(resumen), len(cambios), 'cambios')
    for r in out:
        print(r['modulo'], 'C%s' % r['cajon'], r['estado'], r['peso']['total'], '/', r['peso']['capacidad'],
              [(x['id'], x['estado'], x['holgura_min_mm'], x['chequeo'], x['contra']) for x in r['piezas'] if x['estado'] != 'PASA'])
