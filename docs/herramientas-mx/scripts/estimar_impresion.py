"""Fase 6 · Estimacion de impresion de siluetas por cajon (ESTIMACION, validar con impresion de prueba).
Modelo: placa base de 1.6 mm sobre el area util del cajon + cerco por pieza (2 perimetros = 0.9 mm de pared)
de alto = min(60% del alto de la pieza, 25 mm), minimo 8 mm, siguiendo el contorno (rectangulo envolvente + 6 mm).
Material PETG (1.27 g/cm3). Velocidad de extrusion efectiva: 15 cm3/h (impresora estandar) y 30 cm3/h (impresora rapida).
"""
import json, os
BASE = os.path.join(os.path.dirname(__file__), '..')
d = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
RHO, BASEPLATE, WALL = 1.27, 1.6, 0.9
V_STD, V_FAST = 15.0, 30.0
res = {}
for m, M in d['modulos'].items():
    filas = []
    for caja in M['cajas']:
        for c in caja['cajones']:
            if not c['piezas']: continue
            area = (c['ancho'] - 12) * (c['fondo'] - 12)
            v = area * BASEPLATE
            for p in c['piezas']:
                h = max(8, min(25, 0.6 * p['H']))
                per = 2 * (p['w'] + p['h'] + 12)
                v += per * h * WALL
            cm3 = v / 1000
            filas.append({'cajon': c['n'], 'cm3': round(cm3), 'g': round(cm3 * RHO), 'h_std': round(cm3 / V_STD, 1), 'h_fast': round(cm3 / V_FAST, 1)})
    res[m] = {'cajones': filas, 'g': sum(f['g'] for f in filas), 'h_std': round(sum(f['h_std'] for f in filas), 1), 'h_fast': round(sum(f['h_fast'] for f in filas), 1)}
json.dump(res, open(os.path.join(BASE, 'datos', 'estimacion_impresion.json'), 'w'), indent=1)
for m, r in res.items():
    print(m, len(r['cajones']), 'cajones', r['g'], 'g', r['h_std'], 'h std', r['h_fast'], 'h rapida')
mods = [k for k in res if k != 'BASE']
prom = sum(res[k]['h_std'] for k in mods) / len(mods); promf = sum(res[k]['h_fast'] for k in mods) / len(mods)
print('carrito base + 1 modulo promedio: std', round(res['BASE']['h_std'] + prom, 1), 'fast', round(res['BASE']['h_fast'] + promf, 1))
