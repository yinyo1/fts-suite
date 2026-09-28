"""Prueba de la deteccion de huecos del prototipo v2 sobre los renders (#343, bloque 5).

Uso: python3 scripts/probar_deteccion_renders.py CARPETA_DETECCION [CARPETA_DETECCION ...]
Cada carpeta es la salida deteccion/ de scripts/render_cajones.py (recorte del interior a 1 px = 1 mm).

Reglas que se comparan:
  v2        la del prototipo tal cual (prototipo_app_v2.html, detectar()): por FICHA, el 60 % central de su rectangulo;
            pixel amarillo si r>170, g>120, b<110 y r-b>90; hueco si mas de 45 % es amarillo.
  v2_umbral la misma regla con el umbral que separa mejor los casos (se busca en esta prueba).
  huecos    propuesta: la misma prueba por HUECO INDIVIDUAL (cada dado, cada desarmador del juego), con umbral propio.
  v3        propuesta final: por hueco individual y con amarillo por TONO (HSV): tono 42 a 52 grados, saturacion > 150,
            valor > 100. La regla v2 acepta el naranja Truper (tono 36) y rechaza el amarillo del hueco en sombra.
Escribe datos/prueba_deteccion_renders.json.
"""
import json, os, sys
import numpy as np
from PIL import Image
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sys.path.insert(0, os.path.join(BASE, 'scripts'))
from vista_cajon import subs_en_cajon

def amarillo(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    return (r > 170) & (g > 120) & (b < 110) & (r - b > 90)

def amarillo_v3(a):
    import cv2
    h, s_, v = cv2.split(cv2.cvtColor(a[..., :3].astype(np.uint8), cv2.COLOR_RGB2HSV))
    return (h >= 21) & (h <= 26) & (s_ > 150) & (v > 100)   # OpenCV guarda el tono a la mitad: 21-26 = 42-52 grados

def frac_centro(am, x, y, w, h, c=0.6):
    x0, y0 = round(x + w * (1 - c) / 2), round(y + h * (1 - c) / 2)
    ww, hh = max(1, round(w * c)), max(1, round(h * c))
    z = am[y0:y0 + hh, x0:x0 + ww]
    return float(z.mean()) if z.size else 0.0

def main(carpetas):
    D = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
    caj = {(m, cj['n']): cj for m in ('BASE', 'TUB') for c in D['modulos'][m]['cajas'] for cj in c['cajones']}
    casos = []
    for carp in carpetas:
        modo = 'foto' if 'foto' in carp else 'silueta'
        for f in sorted(os.listdir(carp)):
            nom = f[:-4]; mod, resto = nom.split('-C', 1); n = int(resto.split('_')[0])
            falta = ('FTS-' + resto.split('_faltante_')[1]) if '_faltante_' in resto else None
            rgb = np.array(Image.open(os.path.join(carp, f)).convert('RGB'))
            am, am3 = amarillo(rgb), amarillo_v3(rgb)
            cj = caj[(mod, n)]
            for p in cj['piezas']:
                fr = frac_centro(am, p['x'], p['y'], p['w'], p['h'])
                verdad = falta is not None and (falta == p['activo'] or falta.startswith(p['activo'] + '-'))
                casos.append({'modo': modo, 'render': nom, 'nivel': 'ficha', 'activo': p['activo'], 'frac': round(fr, 3), 'frac3': round(frac_centro(am3, p['x'], p['y'], p['w'], p['h']), 3), 'falta': verdad})
                for sb in subs_en_cajon(p):
                    fr = frac_centro(am, p['x'] + sb['x'], p['y'] + sb['y'], sb['w'], sb['h'])
                    fr3 = frac_centro(am3, p['x'] + sb['x'], p['y'] + sb['y'], sb['w'], sb['h'])
                    casos.append({'modo': modo, 'render': nom, 'nivel': 'hueco', 'activo': sb['activo'], 'frac': round(fr, 3), 'frac3': round(fr3, 3), 'falta': falta == sb['activo']})
    def evalua(cs, u, k='frac'):
        cs = [dict(c, frac=c[k]) for c in cs]
        tp = sum(1 for c in cs if c['falta'] and c['frac'] > u); fn = sum(1 for c in cs if c['falta'] and c['frac'] <= u)
        fp = [c for c in cs if not c['falta'] and c['frac'] > u]
        return {'umbral': u, 'detectados': tp, 'no_detectados': fn, 'falsos_huecos': len(fp), 'falsos': [(c['modo'], c['render'], c['activo'], c['frac']) for c in fp][:12]}
    res = {}
    for modo in ('foto', 'silueta'):
        cs = [c for c in casos if c['modo'] == modo]
        if not cs: continue
        fichas = [c for c in cs if c['nivel'] == 'ficha']
        # propuesta: juegos por hueco individual, piezas sueltas por ficha
        con_subs = {c['activo'] for c in cs if c['nivel'] == 'hueco'}
        mixto = [c for c in cs if c['nivel'] == 'hueco' or (c['nivel'] == 'ficha' and not any(s.startswith(c['activo'] + '-') for s in con_subs))]
        mejor = lambda conj: min((evalua(conj, u / 100) for u in range(5, 95)), key=lambda r: (r['no_detectados'] + r['falsos_huecos'], -r['umbral']))
        v3 = [dict(c) for c in mixto]
        res_v3 = min((evalua(v3, u / 100, 'frac3') for u in range(5, 95)), key=lambda r: (r['no_detectados'] + r['falsos_huecos'], abs(r['umbral'] - 0.45)))
        margen = (min(c['frac3'] for c in v3 if c['falta']), max(c['frac3'] for c in v3 if not c['falta']))
        res[modo] = {'v3': res_v3, 'v3_045': evalua(v3, 0.45, 'frac3'), 'v3_margen_faltante_min_vs_presente_max': margen,'v2': evalua(fichas, 0.45), 'v2_umbral': mejor(fichas), 'huecos_045': evalua(mixto, 0.45), 'huecos_umbral': mejor(mixto),
                     'faltantes': [(c['render'], c['nivel'], c['activo'], c['frac']) for c in cs if c['falta']],
                     'max_no_faltante_ficha': max((c['frac'], c['render'], c['activo']) for c in fichas if not c['falta']),
                     'max_no_faltante_mixto': max((c['frac'], c['render'], c['activo']) for c in mixto if not c['falta'])}
    json.dump({'fecha': '2026-09-28', 'resultado': res, 'casos': casos}, open(os.path.join(BASE, 'datos', 'prueba_deteccion_renders.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(res, ensure_ascii=False, indent=1))

if __name__ == '__main__' and not os.environ.get('BARRIDO'):
    main(sys.argv[1:])

def barrido(modo, biblioteca=None):
    """Prueba fuerte: un render por cada pieza y cada hueco individual quitado, uno a la vez (renders en memoria)."""
    import render_cajones as RC
    D = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
    reb = {x['activo']: x.get('rebaje_lados') or [0, 1] for r in json.load(open(os.path.join(BASE, 'datos', 'interferencias_3d.json'), encoding='utf-8'))['cajones'] for x in r['piezas']}
    lib = {}
    if modo == 'foto':
        lib = {r['id']: r for r in json.load(open(os.path.join(biblioteca, 'biblioteca.json'), encoding='utf-8'))}; lib['_dir'] = biblioteca
    filas = []
    for m in ('BASE', 'TUB'):
        for c in D['modulos'][m]['cajas']:
            for cj in c['cajones']:
                if not cj['piezas']: continue
                objetivos = [None]
                for p in cj['piezas']:
                    objetivos += [s['activo'] for s in p['subhuecos']] if p.get('subhuecos') else [p['activo']]
                for falta in objetivos:
                    _, rc, _ = RC.render(m, c, cj, lib, modo, falta, reb)
                    rgb = np.array(rc); am3 = amarillo_v3(rgb); am2 = amarillo(rgb)
                    for p in cj['piezas']:
                        zonas = [(sb['activo'], p['x'] + sb['x'], p['y'] + sb['y'], sb['w'], sb['h']) for sb in subs_en_cajon(p)] or [(p['activo'], p['x'], p['y'], p['w'], p['h'])]
                        for a, x, y, w, h in zonas:
                            filas.append({'cajon': f'{m} C{cj["n"]}', 'falta': falta, 'activo': a, 'es_faltante': a == falta,
                                          'v3': round(frac_centro(am3, x, y, w, h), 3), 'v2_ficha': round(frac_centro(am2, p['x'], p['y'], p['w'], p['h']), 3),
                                          'ficha': p['activo']})
    return filas

def resumen_barrido(filas, umbral):
    f = [x for x in filas if x['es_faltante']]; pr = [x for x in filas if not x['es_faltante']]
    det = [x for x in f if x['v3'] > umbral]; fal = [x for x in pr if x['v3'] > umbral]
    # v2 tal cual: la ficha que contiene al faltante supera 0.45 en su rectangulo
    det2 = [x for x in f if x['v2_ficha'] > 0.45]
    fal2 = {(x['cajon'], x['falta'], x['ficha']) for x in pr if x['v2_ficha'] > 0.45 and not (x['falta'] or '').startswith(x['ficha'])}
    return {'faltantes_probados': len(f), 'v3_detectados': len(det), 'v3_no_detectados': [(x['cajon'], x['activo'], x['v3']) for x in f if x['v3'] <= umbral],
            'v3_falsos_huecos': len(fal), 'v3_falsos': [(x['cajon'], x['falta'], x['activo'], x['v3']) for x in fal][:15],
            'v3_min_faltante': min(x['v3'] for x in f), 'v3_max_presente': max((x['v3'], x['cajon'], x['activo']) for x in pr),
            'v2_detectados': len(det2), 'v2_no_detectados': [(x['cajon'], x['activo'], x['v2_ficha']) for x in f if x['v2_ficha'] <= 0.45],
            'v2_fichas_falsas': len(fal2)}

if __name__ == '__main__' and os.environ.get('BARRIDO'):
    out = {}
    for modo, bib in (('silueta', None), ('foto', os.environ.get('BIBLIOTECA'))):
        if modo == 'foto' and not bib: continue
        fl = barrido(modo, bib)
        out[modo] = {u: resumen_barrido(fl, u) for u in (0.45, 0.55)}
        print(modo, json.dumps(out[modo], ensure_ascii=False)[:3000])
    json.dump({'fecha': '2026-09-28', 'regla_v3': 'tono 42-52, saturacion > 150, valor > 100, por hueco individual', 'barrido': out},
              open(os.path.join(BASE, 'datos', 'prueba_deteccion_barrido.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
