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
    occ = set(); ok = True
    for q in sorted(c.piezas, key=lambda q: -(q['L'] * q['A'])):
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
        if not placed: ok = False
    area = sum(q['L'] * q['A'] for q in c.piezas)
    return {'errores_geometria': err, 'rejilla_cabe': ok,
            'ocupacion_maxrects_%': round(c.ocupacion() * 100, 1),
            'ocupacion_recalculada_%': round(area / (c.ancho * c.fondo) * 100, 1),
            'area_piezas_mm2': area, 'peso_kg': round(c.peso, 2)}

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
