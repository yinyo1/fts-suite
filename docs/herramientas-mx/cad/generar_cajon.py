"""Genera el .scad y los STL de un cajon a partir del acomodo (diseno_carrito.json) · sesion nocturna 1 (#330).

Uso:
  python3 cad/generar_cajon.py BASE C6            # .scad del cajon + STL de losetas y fichas
  python3 cad/generar_cajon.py --bandeja-8420     # STL de los 4 cuadrantes y el poste de la bandeja de media altura
  python3 cad/generar_cajon.py --todos --solo-scad

Contorno de cada ficha:
  - Si existe cad/contornos/<ID>.json (salida de contorno_desde_escaneo.py), se usa ese poligono.
  - Si no, CONTORNO SIMPLIFICADO: rectangulo L x A con esquinas redondeadas, hecho con las medidas del catalogo
    (su nivel de validacion va en el nombre del STL: no validado = no imprimir produccion).
Losetas: el cajon se parte entre agujeros de la rejilla de 21 mm en tramos de 218 mm o menos (4 losetas en un cajon
de 414 x 318, 6 en el de la 8420); cada una cabe en una cama de 220 x 220.
"""
import json, math, os, subprocess, sys
AQUI = os.path.dirname(os.path.abspath(__file__)); BASE = os.path.join(AQUI, '..')
STL = os.path.join(BASE, 'stl'); os.makedirs(STL, exist_ok=True)
CORTE_X, CORTE_Y, JUEGO = 199.5, 157.5, 0.2     # entre agujeros: ORIGEN + PASO * 9 y * 7
PROF_MAX = 25; PROF_FRAC = 0.6                     # profundidad de cavidad (Fase 6): min(60 % del alto, 25 mm)

def contorno(pid, w, h, rot):
    f = os.path.join(AQUI, 'contornos', f'{pid}.json')
    if os.path.exists(f):
        c = json.load(open(f, encoding='utf-8'))
        pts = c['puntos']
        if rot: pts = [[y, c['L'] - x] for x, y in pts]
        return pts, 'escaneo'
    r = min(8, w / 2 - 0.5, h / 2 - 0.5)
    pts = []
    for cx, cy, a0 in ((w - r, r, -90), (w - r, h - r, 0), (r, h - r, 90), (r, r, 180)):
        for k in range(7):
            a = math.radians(a0 + k * 15)
            pts.append([round(cx + r * math.cos(a), 2), round(cy + r * math.sin(a), 2)])
    return pts, 'simplificado'

def buscar(modulo, cajon):
    d = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
    val = {v['id']: v for v in json.load(open(os.path.join(BASE, 'datos', 'validacion_documental.json'), encoding='utf-8'))['piezas']}
    for c in d['modulos'][modulo]['cajas']:
        for cj in c['cajones']:
            if f'C{cj["n"]}' == cajon: return c['modelo'], cj, val
    raise SystemExit(f'no existe {modulo} {cajon}')

def scad_cajon(modulo, cajon):
    modelo, cj, val = buscar(modulo, cajon)
    W, Hh = cj['ancho'], cj['fondo']
    nombre = f'{modulo}-{cajon}'
    lin = [f'// {nombre} · {modelo} · cajon interior {W} x {Hh} x {cj["alto"]} mm · generado por cad/generar_cajon.py',
           'include <../fts_rejilla.scad>', f'PARTE = "todo";   // "todo", "loseta0".."loseta3", o el id de una ficha', '']
    def cortes(total):   # cortes entre agujeros (ORIGEN + PASO*k) para que cada tramo mida <= 218 mm
        out, ini = [], 1.0
        while total - 1 - ini > 218:
            k = int((ini + 218 - 10.5) // 21); c = 10.5 + 21 * k
            out.append(c); ini = c + JUEGO
        return out
    xs = [1.0] + cortes(W) + [W - 1.0]; ys = [1.0] + cortes(Hh) + [Hh - 1.0]
    tiles = []
    for j in range(len(ys) - 1):
        for i in range(len(xs) - 1):
            x0 = xs[i] + (JUEGO if i else 0); y0 = ys[j] + (JUEGO if j else 0)
            tiles.append((x0, y0, xs[i + 1] - x0 - (JUEGO if i + 1 < len(xs) - 1 else 0), ys[j + 1] - y0 - (JUEGO if j + 1 < len(ys) - 1 else 0)))
    for i, (x0, y0, w, h) in enumerate(tiles):
        assert w <= 220 and h <= 220, (w, h)
        lin.append(f'if (PARTE == "todo" || PARTE == "loseta{i}") color("#333") loseta({x0:.1f}, {y0:.1f}, {w:.1f}, {h:.1f}, {W}, {Hh});')
    fichas = []
    # lado del rebaje de dedo: el que da el chequeo de extraccion 3D (datos/interferencias_3d.json); sin dato, los dos
    lados_por = {}
    ri = os.path.join(BASE, 'datos', 'interferencias_3d.json')
    if os.path.exists(ri):
        for r in json.load(open(ri, encoding='utf-8'))['cajones']:
            if r['modulo'] == modulo and f"C{r['cajon']}" == cajon:
                for x in r['piezas']:
                    lados_por[x['activo']] = x.get('rebaje_lados') or [0, 1]
    for q in cj['piezas']:
        pts, tipo = contorno(q['id'], q['w'], q['h'], q['rot'])
        prof = round(min(PROF_MAX, PROF_FRAC * q['H']), 1)
        v = val.get(q['id'], {})
        nivel = ''.join(v.get(k, {}).get('nivel', '?') for k in ('L', 'A', 'H'))
        if not v and q.get('fuente_dim'): nivel = q['fuente_dim'] * 3   # piezas nuevas de #343 (dadera, matraca): nivel de su fuente
        lin.append(f'// {q["activo"]} · {q["id"]} · {q["corto"]} · contorno {tipo} · niveles L/A/H {nivel}')
        subs = []
        if q.get('subhuecos'):   # #343: un hueco por pieza del juego; profundidad propia (min(60 % de su alto, 25))
            sys.path.insert(0, os.path.join(BASE, 'scripts')); from vista_cajon import subs_en_cajon
            hs = {h['activo']: h for h in q['subhuecos']}
            for sb in subs_en_cajon(q):
                subs.append([sb['x'], sb['y'], sb['w'], sb['h'], 1 if sb['forma'] == 'circulo' else 0,
                             round(min(PROF_MAX, PROF_FRAC * hs[sb['activo']]['H'], prof), 1), sb['activo'][-2:]])
        lin.append(f'if (PARTE == "todo" || PARTE == "{q["id"]}") color("#f2b705") ficha({json.dumps(pts)}, {q["w"]}, {q["h"]}, {prof}, {q["x"]}, {q["y"]}, "{q["activo"]}", {json.dumps(lados_por.get(q["activo"], [0, 1]))}, {json.dumps(subs).replace(chr(39), chr(34))});')
        fichas.append({'id': q['id'], 'activo': q['activo'], 'tipo': tipo, 'nivel': nivel, 'prof': prof, 'rebaje_lados': lados_por.get(q['activo'], [0, 1])})
    p = os.path.join(AQUI, 'cajones', f'{nombre}.scad')
    open(p, 'w', encoding='utf-8').write('\n'.join(lin) + '\n')
    return p, fichas, len(tiles)

def openscad(scad, parte, out):
    r = subprocess.run(['openscad', '-o', out, '-D', f'PARTE="{parte}"', scad], capture_output=True, text=True)
    if r.returncode or not os.path.exists(out): raise SystemExit(f'openscad fallo en {parte}: {r.stderr[-800:]}')
    return out

def bandeja():
    s = os.path.join(AQUI, 'cajones', 'bandeja_8420.scad')
    open(s, 'w').write('include <../fts_rejilla.scad>\nPARTE = "c0";\n'
                       'for (i = [0:3]) if (PARTE == str("c", i)) bandeja_8420_cuadrante(i);\n'
                       'if (PARTE == "poste") poste_8420();\n'
                       'if (PARTE == "union") placa_union();\n'
                       'if (PARTE == "todo") { for (i = [0:3]) color("#f2b705") bandeja_8420_cuadrante(i); }\n')
    outs = [openscad(s, f'c{i}', os.path.join(STL, f'bandeja_8420_cuadrante_{i}.stl')) for i in range(4)]
    outs.append(openscad(s, 'poste', os.path.join(STL, 'bandeja_8420_poste_x4.stl')))
    outs.append(openscad(s, 'union', os.path.join(STL, 'bandeja_8420_placa_union_x4.stl')))
    return outs

if __name__ == '__main__':
    a = sys.argv[1:]
    if '--bandeja-8420' in a:
        for o in bandeja(): print(o)
        sys.exit(0)
    if '--todos' in a:
        d = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
        for m, v in d['modulos'].items():
            for c in v['cajas']:
                for cj in c['cajones']:
                    if cj['piezas']: print(scad_cajon(m, f'C{cj["n"]}')[0])
        sys.exit(0)
    modulo, cajon = a[0], a[1]
    scad, fichas, nt = scad_cajon(modulo, cajon)
    print(scad)
    if '--solo-scad' in a: sys.exit(0)
    pre = f'{modulo}-{cajon}'
    for i in range(nt): print(openscad(scad, f'loseta{i}', os.path.join(STL, f'{pre}_loseta{i}.stl')))
    for f in fichas:
        print(openscad(scad, f['id'], os.path.join(STL, f'{pre}_ficha_{f["activo"]}_{f["id"]}_{f["tipo"]}.stl')))
    json.dump(fichas, open(os.path.join(STL, f'{pre}_fichas.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
