"""Skill acomodo-packout · Fase 4 · acomodo de herramientas en cajones Packout.
Uso:
  python3 acomodo.py               # corre ambas estrategias, elige la ganadora, escribe xlsx/json/svg
  python3 acomodo.py --verificar   # ademas recalcula cada cajon con un segundo metodo (rejilla)
Supuestos (todos 'no validado' hasta medir con vernier):
  G_PIEZAS = 12 mm entre piezas: 2 paredes de silueta impresa de 3 mm + 6 mm para meter dos dedos de lado (pulgar-indice ~18 mm
             de ancho se reparte entre las dos piezas vecinas, porque una silueta tiene rebaje de dedo propio).
  G_PARED  = 6 mm contra la pared del cajon (el cajon ya da el tope; solo la pared de la silueta y juego de impresion).
  H_LIBRE  = 10 mm: 3 mm de base de silueta + 7 mm para que nada roce el cajon de arriba al cerrar.
"""
import copy, json, os, sys, itertools
from collections import defaultdict

BASE = os.path.join(os.path.dirname(__file__), '..'); D = os.path.join(BASE, 'datos')
G_PIEZAS, G_PARED, H_LIBRE = 12, 6, 10
FREC_W = {'diario': 3, 'frecuente': 2, 'ocasional': 1}

# Contenedores de diseno (fuente: datos/packout_research.json, fragmentos de buscador, NO validado)
CAJAS = {
 '48-22-8444': {'alto': 363, 'cap': 22.7, 'cajones': [(416, 322, 61, 11)] * 4},
 '48-22-8447': {'alto': 363, 'cap': 22.7, 'cajones': [(416, 322, 61, 11), (416, 322, 61, 11), (416, 322, 130, 11)]},
 '48-22-8442': {'alto': 363, 'cap': 22.7, 'cajones': [(414, 318, 127, 11.3)] * 2},
 '48-22-8443': {'alto': 363, 'cap': 22.7, 'cajones': [(414, 318, 76, 11)] * 3},
}
# 48-22-8420: un cajon de 432 x 330 x 406. Se propone una BANDEJA REMOVIBLE impresa a media altura (apoyada en 4 postes
# impresos) para no desperdiciar 406 mm en un solo nivel: bandeja 190 mm arriba, fondo 200 mm abajo (406 - 16 de bandeja).
# Capacidad por nivel (15 y 25 kg) es SUPUESTO de diseno: Milwaukee no publica capacidad del cajon, solo 113 kg del conjunto.
BASE_RODANTE = {'modelo': '48-22-8420', 'alto': 502, 'cap': 113.4, 'cajones': [(432, 330, 190, 15), (432, 330, 200, 25)]}
MOD_CODE = {'BASE': 'BAS', 'ELE': 'ELE', 'SOL': 'SOL', 'TUB': 'TUB', 'CIV': 'CIV', 'MED': 'MED'}

class MaxRects:
    """Empaque 2D MaxRects (best short side fit) con rotacion de 90 grados."""
    def __init__(self, W, H):
        self.W, self.H = W, H; self.free = [(0, 0, W, H)]; self.used = []
    def _find(self, w, h):
        best = None
        for (fx, fy, fw, fh) in self.free:
            for rw, rh, rot in ((w, h, False), (h, w, True)):
                if rw <= fw and rh <= fh:
                    ss = min(fw - rw, fh - rh); ls = max(fw - rw, fh - rh)
                    if best is None or (ss, ls) < best[0]:
                        best = ((ss, ls), fx, fy, rw, rh, rot)
        return best
    def insert(self, w, h):
        b = self._find(w, h)
        if not b: return None
        _, x, y, rw, rh, rot = b
        self._split((x, y, rw, rh)); self.used.append((x, y, rw, rh))
        return x, y, rw, rh, rot
    def _split(self, r):
        x, y, w, h = r; nf = []
        for f in self.free:
            fx, fy, fw, fh = f
            if x >= fx + fw or x + w <= fx or y >= fy + fh or y + h <= fy:
                nf.append(f); continue
            if x > fx: nf.append((fx, fy, x - fx, fh))
            if x + w < fx + fw: nf.append((x + w, fy, fx + fw - x - w, fh))
            if y > fy: nf.append((fx, fy, fw, y - fy))
            if y + h < fy + fh: nf.append((fx, y + h, fw, fy + fh - y - h))
        self.free = [a for a in nf if not any(a != b and a[0] >= b[0] and a[1] >= b[1] and a[0]+a[2] <= b[0]+b[2] and a[1]+a[3] <= b[1]+b[3] for b in nf)]

class Cajon:
    def __init__(self, caja_id, idx, ancho, fondo, alto, cap):
        self.caja_id, self.idx, self.ancho, self.fondo, self.alto, self.cap = caja_id, idx, ancho, fondo, alto, cap
        self.alto_util = alto - H_LIBRE
        # se infla cada pieza G_PIEZAS y el cajon util gana G_PIEZAS: quedan G_PIEZAS entre piezas y G_PARED contra paredes
        self.mr = MaxRects(ancho - 2 * G_PARED + G_PIEZAS, fondo - 2 * G_PARED + G_PIEZAS)
        self.piezas, self.peso, self.familia = [], 0.0, None
    def cabe(self, p):
        if p['H'] > self.alto_util or self.peso + p['peso_kg'] > self.cap: return None
        trial = copy.deepcopy(self.mr)
        return trial.insert(p['L'] + G_PIEZAS, p['A'] + G_PIEZAS)
    def poner(self, p):
        r = self.mr.insert(p['L'] + G_PIEZAS, p['A'] + G_PIEZAS)
        x, y, w, h, rot = r
        self.piezas.append(dict(p, x=x + G_PARED, y=y + G_PARED, w=w - G_PIEZAS, h=h - G_PIEZAS, rot=rot))
        self.peso += p['peso_kg']
    def ocupacion(self):
        return sum(q['L'] * q['A'] for q in self.piezas) / (self.ancho * self.fondo)

class Pila:
    def __init__(self, modulo, con_base):
        self.modulo, self.cajas = modulo, []
        if con_base: self._abrir(BASE_RODANTE['modelo'], BASE_RODANTE)
    def _abrir(self, modelo, spec):
        cid = len(self.cajas)
        caj = [Cajon(cid, i, *c) for i, c in enumerate(spec['cajones'])]
        self.cajas.append({'modelo': modelo, 'alto': spec['alto'], 'cap': spec['cap'], 'cajones': caj})
        return caj
    def cajones(self):
        return [c for b in self.cajas for c in b['cajones']]
    def peso_caja(self, c): return sum(x.peso for x in self.cajas[c.caja_id]['cajones'])
    def abrir_para(self, p):
        """Caja nueva: la que tenga el cajon mas bajo que admita la pieza; empate -> mas cajones."""
        opts = []
        for m, s in CAJAS.items():
            hs = [c[2] - H_LIBRE for c in s['cajones'] if c[2] - H_LIBRE >= p['H']]
            if hs: opts.append((min(hs), -len(s['cajones']), m))
        if not opts:   # ninguna caja de cajones la admite: el modulo lleva su propia base rodante 8420
            return self._abrir(BASE_RODANTE['modelo'], BASE_RODANTE) if p['H'] <= max(c[2] for c in BASE_RODANTE['cajones']) - H_LIBRE else None
        _, _, m = min(opts)
        return self._abrir(m, CAJAS[m])

def colocar(pila, p, candidatos):
    best = None
    for c in candidatos:
        if pila.peso_caja(c) + p['peso_kg'] > pila.cajas[c.caja_id]['cap']: continue
        if c.cabe(p):
            key = (c.alto_util - p['H'], -c.ocupacion())
            if best is None or key < best[0]: best = (key, c)
    if best: best[1].poner(p); return best[1]
    return None

def estrategia_ffd(piezas, modulo, con_base):
    pila = Pila(modulo, con_base)
    for p in sorted(piezas, key=lambda q: (-q['H'], -q['L'] * q['A'])):
        if colocar(pila, p, pila.cajones()): continue
        nuevos = pila.abrir_para(p)
        if not nuevos or not colocar(pila, p, nuevos):
            raise RuntimeError(f'no cabe {p["id"]} {p["L"]}x{p["A"]}x{p["H"]}')
    return pila

def estrategia_familia(piezas, modulo, con_base):
    pila = Pila(modulo, con_base)
    fam = defaultdict(list)
    for p in piezas: fam[p['familia']].append(p)
    for f, ps in sorted(fam.items(), key=lambda kv: -sum(q['L'] * q['A'] for q in kv[1])):
        for p in sorted(ps, key=lambda q: (-q['H'], -q['L'] * q['A'])):
            propios = [c for c in pila.cajones() if c.familia == f]
            if colocar(pila, p, propios): continue
            libres = [c for c in pila.cajones() if c.familia is None and not c.piezas]
            c = colocar(pila, p, libres)
            if c: c.familia = f; continue
            nuevos = pila.abrir_para(p)
            c = colocar(pila, p, nuevos) if nuevos else None
            if not c:   # ultimo recurso: cualquier cajon con espacio
                c = colocar(pila, p, pila.cajones())
                if not c: raise RuntimeError(f'no cabe {p["id"]}')
            else:
                c.familia = f
    return pila

def ordenar(pila):
    """Base rodante abajo; arriba las cajas con mas uso diario; a igualdad, la mas pesada abajo."""
    base = [b for b in pila.cajas if b['modelo'] == BASE_RODANTE['modelo']]
    otras = [b for b in pila.cajas if b['modelo'] != BASE_RODANTE['modelo'] and any(c.piezas for c in b['cajones'])]
    def score(b):
        ps = [q for c in b['cajones'] for q in c.piezas]
        return (sum(FREC_W[q['frec']] for q in ps) / max(1, len(ps)), -sum(c.peso for c in b['cajones']))
    otras.sort(key=score)          # de abajo hacia arriba: menor uso diario abajo
    return base + otras            # indice 0 = piso

def metricas(pila):
    cajas = ordenar(pila)
    alto = sum(b['alto'] for b in cajas)
    cajones = [c for b in cajas for c in b['cajones']]
    usados = [c for c in cajones if c.piezas]
    # altura del piso a cada cajon (centro) para momento y penalizacion
    z, zc = 0, {}
    for b in cajas:
        n = len(b['cajones'])
        for i, c in enumerate(b['cajones']):
            zc[id(c)] = z + b['alto'] * (n - i - 0.5) / n   # cajon 0 = arriba de la caja
        z += b['alto']
    peso = sum(c.peso for c in cajones)
    momento = sum(c.peso * zc[id(c)] for c in cajones) / max(peso, 1e-9)
    # penalizacion: uso diario lejos de la parte alta (mm debajo del tope) ponderado
    pen = sum(FREC_W[q['frec']] * (alto - zc[id(c)]) for c in cajones for q in c.piezas) / 1000
    return {'cajas': len([b for b in cajas if b['modelo'] != BASE_RODANTE['modelo']]), 'alto_mm': alto,
            'cajones_usados': len(usados), 'cajones_totales': len(cajones),
            'ocupacion_media': round(sum(c.ocupacion() for c in usados) / max(1, len(usados)) * 100, 1),
            'peso_kg': round(peso, 1), 'centro_gravedad_mm': round(momento), 'penalizacion': round(pen, 1),
            'modelos': [b['modelo'] for b in cajas]}

def verificar_cajon(c):
    """Segundo metodo, independiente del MaxRects: (1) geometria directa de lo colocado; (2) re-empaque por
    rejilla de 5 mm bottom-left de las mismas piezas en el mismo cajon. Devuelve dict con diferencias."""
    err = []
    for q in c.piezas:
        if q['x'] < G_PARED - 0.01 or q['y'] < G_PARED - 0.01 or q['x'] + q['w'] > c.ancho - G_PARED + 0.01 or q['y'] + q['h'] > c.fondo - G_PARED + 0.01:
            err.append(f'{q["id"]} fuera del cajon')
        if q['H'] > c.alto_util: err.append(f'{q["id"]} alto {q["H"]} > {c.alto_util}')
    for a, b in itertools.combinations(c.piezas, 2):
        sep_x = max(b['x'] - (a['x'] + a['w']), a['x'] - (b['x'] + b['w']))
        sep_y = max(b['y'] - (a['y'] + a['h']), a['y'] - (b['y'] + b['h']))
        if max(sep_x, sep_y) < G_PIEZAS - 0.01: err.append(f'{a["id"]}~{b["id"]} holgura {max(sep_x, sep_y):.0f} mm')
    if c.peso > c.cap + 1e-9: err.append(f'peso {c.peso:.2f} > {c.cap}')
    # re-empaque por rejilla
    step = 5; W, H = c.ancho - 2 * G_PARED + G_PIEZAS, c.fondo - 2 * G_PARED + G_PIEZAS
    ok = False; orden_ok = None
    for nombre, clave in (('area', lambda q: -(q['L'] * q['A'])), ('largo', lambda q: -max(q['L'], q['A'])),
                          ('ancho', lambda q: -min(q['L'], q['A'])), ('perimetro', lambda q: -(q['L'] + q['A']))):
        if _rejilla(c, sorted(c.piezas, key=clave), W, H, step):
            ok = True; orden_ok = nombre; break
    area = sum(q['L'] * q['A'] for q in c.piezas)
    area_infl = sum((q['L'] + G_PIEZAS) * (q['A'] + G_PIEZAS) for q in c.piezas)
    return {'errores_geometria': err, 'rejilla_cabe': ok, 'orden_rejilla': orden_ok,
            'cota_area_%': round(area_infl / (W * H) * 100, 1),
            'ocupacion_maxrects_%': round(c.ocupacion() * 100, 1),
            'ocupacion_recalculada_%': round(area / (c.ancho * c.fondo) * 100, 1),
            'area_piezas_mm2': area, 'peso_kg': round(c.peso, 2)}

def _rejilla(c, orden, W, H, step):
    occ = set()
    for q in orden:
        placed = False
        for rw, rh in ((q['L'] + G_PIEZAS, q['A'] + G_PIEZAS), (q['A'] + G_PIEZAS, q['L'] + G_PIEZAS)):
            cw, ch = -(-rw // step), -(-rh // step)
            for gy in range(0, int(H // step) - ch + 1):
                for gx in range(0, int(W // step) - cw + 1):
                    cells = {(gx + i, gy + j) for i in range(cw) for j in range(ch)}
                    if not (cells & occ):
                        occ |= cells; placed = True; break
                if placed: break
            if placed: break
        if not placed: return False
    return True

def correr():
    piezas = [p for p in json.load(open(os.path.join(D, 'piezas_carrito.json'), encoding='utf-8')) if not p.get('suelto')]
    sueltos = [p for p in json.load(open(os.path.join(D, 'piezas_carrito.json'), encoding='utf-8')) if p.get('suelto')]
    por_mod = defaultdict(list)
    for p in piezas: por_mod[p['modulo']].append(p)
    resultados = {}
    for est, fn in (('ffd', estrategia_ffd), ('familia', estrategia_familia)):
        resultados[est] = {}
        for m, ps in por_mod.items():
            pila = fn(ps, m, con_base=(m == 'BASE'))
            resultados[est][m] = (pila, metricas(pila))
    return resultados, sueltos

def ganadora(res):
    tot = {}
    for est, mods in res.items():
        tot[est] = (sum(v[1]['cajas'] for v in mods.values()), sum(v[1]['alto_mm'] for v in mods.values()),
                    sum(v[1]['penalizacion'] for v in mods.values()))
    return min(tot, key=lambda e: tot[e]), tot

if __name__ == '__main__':
    res, sueltos = correr()
    g, tot = ganadora(res)
    for est in res:
        print(est, 'cajas, alto total, penalizacion =', tot[est])
        for m, (pila, mt) in res[est].items():
            print('  ', m, mt)
    print('GANA', g)
    for m, (pila, mt) in res[g].items():
        for bi, b in enumerate(reversed(ordenar(pila))):
            for c in b['cajones']:
                print(f'   {m} caja{bi} {b["modelo"]} cajon{c.idx} alto{c.alto} occ{c.ocupacion()*100:.0f}% {c.peso:.1f}kg', [q['id'] for q in c.piezas])
    json.dump({'ganadora': g, 'totales': tot}, open(os.path.join(D, 'acomodo_resumen.json'), 'w'), indent=1)

# ------------------------------------------------------------------ salidas
def exportar(res, g, sueltos, verificar=True):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter
    sys.path.insert(0, os.path.dirname(__file__))
    from vista_cajon import svg_cajon
    svgdir = os.path.join(BASE, 'svg'); os.makedirs(svgdir, exist_ok=True)
    for f in os.listdir(svgdir):
        if f.endswith('.svg'): os.remove(os.path.join(svgdir, f))
    filas, diseno, verif = [], {'ganadora': g, 'parametros': {'G_PIEZAS': G_PIEZAS, 'G_PARED': G_PARED, 'H_LIBRE': H_LIBRE},
                                'modulos': {}, 'sueltos': sueltos}, []
    for m, (pila, mt) in res[g].items():
        code = MOD_CODE[m]; mod = {'metricas': mt, 'cajas': []}
        n = 0
        for b in reversed(ordenar(pila)):            # de arriba hacia abajo
            caja = {'modelo': b['modelo'], 'cajones': []}
            for c in b['cajones']:
                n += 1
                qs = sorted(c.piezas, key=lambda q: (q['y'], q['x']))
                piezas = []
                for k, q in enumerate(qs, 1):
                    activo = f'FTS-{code}-01-C{n}-{k:02d}'
                    piezas.append({'activo': activo, 'id': q['id'], 'ref': q['ref'], 'corto': q['desc'], 'familia': q['familia'],
                                   'x': q['x'], 'y': q['y'], 'w': q['w'], 'h': q['h'], 'rot': q['rot'],
                                   'L': q['L'], 'A': q['A'], 'H': q['H'], 'peso_kg': q['peso_kg'], 'frec': q['frec'], 'fuente_dim': q['fuente_dim']})
                    filas.append([m, b['modelo'], f'C{n}', c.alto, c.alto_util, activo, q['id'], q['ref'], q['desc'], q['x'], q['y'],
                                  'si' if q['rot'] else 'no', q['w'], q['h'], q['H'], q['peso_kg'], q['frec'], q['fuente_dim'],
                                  round(c.ocupacion() * 100, 1), round(c.peso, 2), 'no validado'])
                cj = {'n': n, 'alto': c.alto, 'alto_util': c.alto_util, 'ancho': c.ancho, 'fondo': c.fondo,
                      'ocupacion': round(c.ocupacion() * 100, 1), 'peso_kg': round(c.peso, 2), 'cap_kg': c.cap, 'piezas': piezas}
                cj['pie'] = [f'Modulo {m} · caja {b["modelo"]} · cajon C{n} · alto interior {c.alto} mm, util {c.alto_util} mm',
                             f'Ocupacion en planta {cj["ocupacion"]} % · peso {cj["peso_kg"]} kg de {c.cap} kg',
                             'Medidas no validadas: confirmar con vernier antes de imprimir']
                if piezas:
                    open(os.path.join(svgdir, f'{code}-C{n}.svg'), 'w', encoding='utf-8').write(
                        svg_cajon(cj, piezas, titulo=f'FTS · Modulo {code} · Cajon C{n} · {b["modelo"]} · vista superior (mm)'))
                if verificar and c.piezas:
                    v = verificar_cajon(c)
                    verif.append([m, f'C{n}', b['modelo'], len(c.piezas), v['ocupacion_maxrects_%'], v['ocupacion_recalculada_%'],
                                  'si (' + v['orden_rejilla'] + ')' if v['rejilla_cabe'] else 'NO', v['cota_area_%'],
                                  '; '.join(v['errores_geometria']) or 'sin errores', v['peso_kg'], c.cap])
                caja['cajones'].append(cj)
            mod['cajas'].append(caja)
        diseno['modulos'][m] = mod
    # comparacion de estrategias
    comp = []
    for est, mods in res.items():
        for m, (pila, mt) in mods.items():
            comp.append([est, m, mt['cajas'], mt['alto_mm'], mt['cajones_usados'], mt['cajones_totales'], mt['ocupacion_media'],
                         mt['peso_kg'], mt['centro_gravedad_mm'], mt['penalizacion'], ' + '.join(mt['modelos'])])
    wb = Workbook()
    def hoja(ws, headers, rows):
        ws.append(headers)
        for c in ws[1]:
            c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='B71C1C'); c.alignment = Alignment(wrap_text=True)
        for r in rows: ws.append(r)
        ws.freeze_panes = 'A2'
        for i, h in enumerate(headers, 1): ws.column_dimensions[get_column_letter(i)].width = min(max(len(str(h)) + 2, 10), 50)
    ws = wb.active; ws.title = 'Acomodo'
    hoja(ws, ['modulo', 'caja', 'cajon', 'alto_int_mm', 'alto_util_mm', 'numero_activo', 'id', 'ref_catalogo', 'pieza', 'x_mm', 'y_mm',
              'rotada', 'ancho_planta_mm', 'fondo_planta_mm', 'alto_mm', 'peso_kg', 'frecuencia', 'fuente_dim', 'ocupacion_cajon_%',
              'peso_cajon_kg', 'validacion'], filas)
    hoja(wb.create_sheet('Estrategias'), ['estrategia', 'modulo', 'cajas_de_cajones', 'alto_pila_mm', 'cajones_usados', 'cajones_totales',
         'ocupacion_media_%', 'peso_kg', 'centro_gravedad_mm', 'penalizacion_uso', 'pila (abajo -> arriba)'], comp)
    hoja(wb.create_sheet('Verificacion'), ['modulo', 'cajon', 'caja', 'piezas', 'ocup_maxrects_%', 'ocup_recalculada_%',
         'rejilla_5mm_cabe (orden)', 'cota_area_inflada_%', 'errores_geometria', 'peso_kg', 'cap_kg'], verif)
    hoja(wb.create_sheet('Sueltos'), ['id', 'ref', 'pieza', 'modulo', 'donde'], [[s['id'], s['ref'], s['desc'], s['modulo'], s['suelto']] for s in sueltos] +
         [['ROSCA', 'TPC1', 'Roscadora M18 FUEL 2874-22HD', 'TUB', 'estuche original (668 mm de largo)'],
          ['BANDA', 'TPC8', 'Sierra de banda M18 FUEL', 'SOL', 'estuche original (533 mm)'],
          ['ASP', 'TPC3', 'Aspiradora M18 FUEL PACKOUT 0970-20', 'BASE', 'es modulo Packout: se engancha arriba de la pila'],
          ['NIV24', 'TPC2', 'Nivel de 24 in Truper 17036', 'MED', 'soporte lateral (630 mm)'],
          ['CORTAP', 'X-CORTAP', 'Cortaperno 30 in', 'CIV', 'soporte lateral (762 mm)'],
          ['CARG6', 'TPC4', 'Cargador de 6 bahias 48-59-1806', 'taller', 'se queda en taller FTS']])
    hoja(wb.create_sheet('Parametros'), ['parametro', 'valor', 'justificacion'], [
         ['G_PIEZAS', G_PIEZAS, '2 paredes de silueta de 3 mm + 6 mm de agarre: la silueta lleva su propio rebaje de dedo, asi que entre piezas basta 12 mm'],
         ['G_PARED', G_PARED, 'la pared del cajon ya es tope; 3 mm de pared de silueta + 3 mm de juego de impresion'],
         ['H_LIBRE', H_LIBRE, '3 mm de base de silueta + 7 mm para que nada roce el cajon de arriba'],
         ['cap cajon 8420', '15 kg bandeja / 25 kg fondo', 'SUPUESTO: Milwaukee solo publica 113 kg del conjunto'],
         ['medidas de cajon', '416 x 322 (61/130), 414 x 318 (127/76)', 'fragmento de buscador; se usa la menor reportada (conservador)']])
    wb.save(os.path.join(BASE, 'diseno_carrito.xlsx'))
    json.dump(diseno, open(os.path.join(BASE, 'diseno_carrito.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return diseno, verif

if __name__ == '__main__' and True:
    diseno, verif = exportar(res, g, sueltos, verificar=True)
    print('cajones verificados', len(verif), 'geometria con error', sum(1 for v in verif if v[8] != 'sin errores'), 'rejilla no reproduce', sum(1 for v in verif if v[6] == 'NO'))
    for v in verif: print(v)
