"""Estabilidad de la pila del carrito (sesion nocturna 2, #338). Estatica, sin inercia.

Pila del carrito base, de abajo hacia arriba: 48-22-8420 (base rodante) + 48-22-8444 + 48-22-8443 (acomodo vigente), y
la misma pila con cada modulo de especialidad montado arriba. Caso critico: un cajon totalmente abierto y cargado, en
piso plano y con 5 grados de inclinacion hacia el lado que abre (rampa de planta).

Datos del fabricante (paginas de milwaukeetool.com leidas en la sesion nocturna 1):
  8420: 24 x 19 x 19.75 in (610 x 482 x 502 mm), 29 lb (13.2 kg). El cajon grande abre hacia el frente (lado sin ruedas).
  8443: 22.2 x 16.3 x 14.3 in (564 x 414 x 363 mm), 22.45 lb (10.2 kg). 8444: mismas medidas, 24 lb (10.9 kg).
  8447 y 8442: mismas medidas exteriores (catalogo de dimensiones PACKOUT 2023); peso: SUPUESTO igual al 8444.
SUPUESTOS (parametricos, sin cota oficial): apoyos, alturas internas, masa del cajon vacio, carrera de las correderas y
orientacion de las cajas sobre la 8420. Se corren las DOS orientaciones posibles del acople.
Cargas por cajon: datos/interferencias_3d.json (herramienta del catalogo + fichas y loseta PETG).
"""
import json, math, os
BASE = os.path.join(os.path.dirname(__file__), '..')
G = 9.81

# --- supuestos
APOYO_LAT = 482 / 2 - 15          # borde lateral de apoyo (ruedas y patas 15 mm adentro del ancho de 482)
APOYO_FRENTE = 610 / 2 - 25       # patas delanteras de la 8420, 25 mm adentro del frente
CG_8420 = (0.0, -40.0, 220.0)     # vacia: ruedas y eje atras y abajo
Z_PISO_8420 = 60                  # piso interior del cajon grande de la 8420
CARRERA = 318                     # correderas de extension total: el cajon sale su fondo completo
CAJON_VACIO_KG = {'48-22-8443': 1.4, '48-22-8444': 1.3, '48-22-8447': 1.4, '48-22-8442': 1.6}
PESO_CAJA = {'48-22-8443': 10.2, '48-22-8444': 10.9, '48-22-8447': 10.9, '48-22-8442': 10.9}
ALTO_CAJA, FONDO_CAJA, FRENTE_PARED, BASE_CAJA = 363, 414, 15, 30
INCL = 5.0

def cajones_caja(modelo, cajones):
    """Posicion vertical del piso de cada cajon dentro de la caja (el primero de la lista es el de arriba)."""
    n = len(cajones); z = BASE_CAJA; out = []
    for cj in reversed(cajones):   # de abajo hacia arriba
        out.append((cj, z)); z += cj['alto'] + 12
    return list(reversed(out))

def pila(d, modulo_arriba=None):
    """Lista de masas puntuales [(kg, x, y, z, etiqueta, cajon_ref)] con las cajas cerradas. x = lateral, y = frente."""
    inter = {(r['modulo'], r['cajon']): r['peso']['total'] for r in json.load(open(os.path.join(BASE, 'datos', 'interferencias_3d.json')))['cajones']}
    masas = [(13.2, *CG_8420, '8420 vacia', None)]
    base = d['modulos']['BASE']['cajas']
    c8420 = [c for c in base if c['modelo'] == '48-22-8420'][0]
    for cj in c8420['cajones']:
        zc = Z_PISO_8420 + (0 if cj['alto'] == 200 else 206) + cj['alto'] / 3
        masas.append((inter.get(('BASE', cj['n']), 0), 0, 60, zc, f"BASE C{cj['n']} (8420)", None))
    cajas = [('BASE', c) for c in sorted([c for c in base if c['modelo'] != '48-22-8420'], key=lambda c: 0 if c['modelo'] == '48-22-8444' else 1)]
    if modulo_arriba: cajas += [(modulo_arriba, c) for c in d['modulos'][modulo_arriba]['cajas'] if c['modelo'] != '48-22-8420']
    z0 = 502
    for mod, c in cajas:
        m = c['modelo']; ncaj = len(c['cajones'])
        masas.append((PESO_CAJA[m] - CAJON_VACIO_KG[m] * ncaj, 0, 0, z0 + ALTO_CAJA * 0.45, f'{mod} {m} casco', None))
        for cj, zp in cajones_caja(m, c['cajones']):
            zc = z0 + zp + cj['alto'] / 3
            xc = FONDO_CAJA / 2 - FRENTE_PARED - cj['fondo'] / 2      # centro del cajon cerrado respecto al centro de la caja
            masas.append((CAJON_VACIO_KG[m], 0, xc, z0 + zp + 10, f'{mod} C{cj["n"]} cajon', (mod, cj['n'])))
            masas.append((inter.get((mod, cj['n']), 0), 0, xc, zc, f'{mod} C{cj["n"]} carga', (mod, cj['n'])))
        z0 += ALTO_CAJA
    return masas, z0

def evaluar(masas, abierto, orient, extra_kg=0.0):
    """orient 'A': cajas con su frente de 564 a lo largo de la 8420, los cajones abren de LADO (borde de apoyo lateral).
       orient 'B': cajas giradas, los cajones abren al FRENTE de la 8420 (borde de apoyo delantero).
       abierto: (modulo, n) del cajon abierto por completo. extra_kg: carga agregada a ese cajon (hasta su capacidad)."""
    borde = APOYO_LAT if orient == 'A' else APOYO_FRENTE
    M = mx = mz = 0.0
    for kg, x, y, z, et, ref in masas:
        s = y if ref is not None else (x if orient == 'A' else y)   # coordenada en la direccion de apertura
        if ref is not None and (ref == abierto or (isinstance(abierto, set) and ref in abierto)): s += CARRERA
        k = kg + (extra_kg if (ref == abierto and 'carga' in et) else 0)
        M += k; mx += k * s; mz += k * z
    xg, zg = mx / M, mz / M
    margen_plano = borde - xg
    margen_incl = borde - (xg + zg * math.tan(math.radians(INCL)))
    return {'masa_kg': round(M, 1), 'cg_mm': round(xg, 1), 'cg_alto_mm': round(zg), 'borde_mm': borde,
            'angulo_vuelco_grados': round(math.degrees(math.atan2(borde - xg, zg)), 1), 'margen_plano_mm': round(margen_plano, 1), 'margen_5grados_mm': round(margen_incl, 1),
            'se_voltea_plano': margen_plano < 0, 'se_voltea_5grados': margen_incl < 0}

def carga_limite(masas, abierto, orient):
    """kg que se pueden agregar al cajon abierto antes de que la pila se voltee con 5 grados."""
    lo, hi = 0.0, 200.0
    if evaluar(masas, abierto, orient, 0)['se_voltea_5grados']: return 0.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if evaluar(masas, abierto, orient, mid)['se_voltea_5grados']: hi = mid
        else: lo = mid
    return round(lo, 1)

if __name__ == '__main__':
    d = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
    inter = json.load(open(os.path.join(BASE, 'datos', 'interferencias_3d.json')))['cajones']
    cap = {(r['modulo'], r['cajon']): (r['peso']['capacidad'], r['peso']['total']) for r in inter}
    casos = []
    for mod_arriba in (None, 'ELE', 'SOL', 'TUB', 'MED'):
        masas, alto = pila(d, mod_arriba)
        refs = [m[5] for m in masas if m[5] and 'carga' in m[4]]
        for orient in ('A', 'B'):
            cerrado = evaluar(masas, None, orient)
            peor = None
            for ref in refs:
                r = evaluar(masas, ref, orient)
                c_kg, t_kg = cap.get(ref, (11, 0))
                rl = evaluar(masas, ref, orient, max(0, c_kg - t_kg))
                lim = carga_limite(masas, ref, orient)
                fila = {'pila': 'BASE' + (' + ' + mod_arriba if mod_arriba else ''), 'alto_mm': alto, 'orientacion': orient,
                        'cajon_abierto': f'{ref[0]} C{ref[1]}', 'carga_real': r, 'cargado_a_capacidad': rl, 'kg_extra_antes_de_voltear_5grados': lim,
                        'cerrado': cerrado}
                casos.append(fila)
                if peor is None or r['margen_5grados_mm'] < peor['carga_real']['margen_5grados_mm']: peor = fila
            top = {m[5] for m in masas if m[5] and m[5][0] == (mod_arriba or 'BASE')}
            ult = max(top, key=lambda r: [mm[3] for mm in masas if mm[5] == r][0]) if top else None
            caja_top = {r for r in top if abs([mm[3] for mm in masas if mm[5] == r][0] - [mm[3] for mm in masas if mm[5] == ult][0]) < ALTO_CAJA}
            todos = evaluar(masas, caja_top, orient)
            casos.append({'pila': 'BASE' + (' + ' + mod_arriba if mod_arriba else ''), 'alto_mm': alto, 'orientacion': orient,
                          'cajon_abierto': 'TODOS los de la caja de arriba', 'carga_real': todos, 'cargado_a_capacidad': None,
                          'kg_extra_antes_de_voltear_5grados': None, 'cerrado': cerrado})
            print('   todos abiertos 5g', todos['margen_5grados_mm'], 'angulo', todos['angulo_vuelco_grados'])
            print(peor['pila'], orient, 'alto', alto, 'peor cajon', peor['cajon_abierto'], 'real 5g', peor['carga_real']['margen_5grados_mm'],
                  'a capacidad 5g', peor['cargado_a_capacidad']['margen_5grados_mm'], 'extra', peor['kg_extra_antes_de_voltear_5grados'],
                  'cerrado 5g', cerrado['margen_5grados_mm'], 'angulo', peor['carga_real']['angulo_vuelco_grados'], 'masa', peor['carga_real']['masa_kg'], 'cg z', peor['carga_real']['cg_alto_mm'])
    json.dump({'fecha': '2026-09-28', 'supuestos': {'apoyo_lateral_mm': APOYO_LAT, 'apoyo_frente_mm': APOYO_FRENTE, 'cg_8420_vacia': CG_8420,
               'carrera_mm': CARRERA, 'cajon_vacio_kg': CAJON_VACIO_KG, 'peso_caja_kg': PESO_CAJA, 'inclinacion_grados': INCL},
               'casos': casos}, open(os.path.join(BASE, 'datos', 'estabilidad.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
