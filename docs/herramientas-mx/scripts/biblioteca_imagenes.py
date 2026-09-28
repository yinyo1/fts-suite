"""Biblioteca de imagenes de las piezas de BASE y TUB (#343, bloque 2).

Uso: python3 scripts/biblioteca_imagenes.py /ruta/fuera/del/repo

El repo es PUBLICO y las fotos de producto son de sus fabricantes y tiendas: las imagenes (descargadas, recortadas y
siluetas) se escriben SOLO en la carpeta que se pasa como argumento, que debe estar fuera del repo. En el repo quedan
este script, datos/fuentes_imagenes_seleccion.json (que imagen se eligio de cada pieza), datos/biblioteca_imagenes.json
(escala y resultado, sin imagenes) y FUENTES_IMAGENES.md.

Por pieza:
  1. Fuente en orden: milwaukeetool.com, homedepot.com.mx, homedepot.com. Home Depot EE. UU. no sirve desde este
     contenedor: images.thdstatic.com esta bloqueado por la red (2026-09-28).
  2. Se quita el fondo con rembg (u2netp), se gira para que el lado largo quede horizontal y se recorta al contorno.
  3. Escala: px/mm = lado largo en px / largo L del catalogo (con su nivel de validacion). En los juegos que salen de
     una sola foto (desarmadores de precision, adaptadores) la escala es de grupo: la pieza mas larga mide el L del juego.
  4. Sin foto usable: silueta vectorial = proyeccion superior del modelo parametrico (cad/modelos_herramienta), en el
     color de la marca y con la leyenda "sin foto". Los dados van parados: su vista de arriba es un circulo, y la foto de
     Home Depot es lateral, asi que se dibujan como circulo con el hexagono (tambien cuentan como silueta).
"""
import json, math, os, subprocess, sys, hashlib
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sys.path.insert(0, os.path.join(BASE, 'scripts')); sys.path.insert(0, os.path.join(BASE, 'cad', 'modelos_herramienta'))
SIL_PX_MM = 4.0
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36'

# pieza del diseno -> clave de fuente (datos/fuentes_imagenes_seleccion.json). None = silueta, con el motivo.
PIEZA_FUENTE = {
    'IMP38': 'IMP38', 'ROTO18': 'ROTO18', 'IMP14': 'IMP14', 'BAT1': 'BAT', 'BAT2': 'BAT', 'MINIP': 'MINIP', 'TORPEDO': 'TORPEDO',
    'AJ12': 'AJ12', 'NAVAJA': 'NAVAJA', 'VERN': 'VERN', 'PDIAG': 'PDIAG', 'AJ8': 'AJ8', 'CHOF8': 'CHOF8', 'PELEC': 'PELEC',
    'MATRACA': 'MATRACA', 'COMB7': 'COMB7', 'TAZON': 'TAZON', 'PRES6C': 'PRES6C', 'FLEX1': 'FLEX', 'FLEX2': 'FLEX', 'PRES11': 'PRES11',
    'MART': 'MART', 'PRES7': 'PRES7', 'PRES10': 'PRES10', 'ESM45': 'ESM45', 'CARG1': 'CARG1', 'NIVTUB1': 'NIVTUB', 'NIVTUB2': 'NIVTUB',
    'CAIMAN': 'CAIMAN',
    'WIHA-PC': (None, 'Wiha 32933 no esta en milwaukeetool.com ni en homedepot.com.mx; en homedepot.com la imagen no se puede bajar (red)'),
    'WIHA-PE': (None, 'Wiha 32930: solo en homedepot.com, imagen bloqueada por la red'),
    'WIHA-PP': (None, 'Wiha 32926: solo en homedepot.com, imagen bloqueada por la red'),
    'WIHA-DS1': (None, 'Wiha 32101 sin ficha en las tres tiendas'), 'WIHA-DS2': (None, 'Wiha 32102 sin ficha en las tres tiendas'),
    'WIHA-DS3': (None, 'Wiha 32012 sin ficha en las tres tiendas'), 'WIHA-DS4': (None, 'Wiha 32023 sin ficha en las tres tiendas'),
    'ESCAL': (None, 'juego Truper de 3 brocas escalonadas: truper.com bloqueado y sin ficha en Home Depot'),
    'CAB34': (None, 'cabezal Ridgid 12R 3/4 suelto: sin ficha en homedepot.com.mx; homedepot.com bloqueado'),
    'STILL1': (None, 'stillson Husky 14 in 73126: sin ficha en homedepot.com.mx; homedepot.com bloqueado'),
    'STILL2': (None, 'stillson Husky 14 in 73126: sin ficha en homedepot.com.mx; homedepot.com bloqueado'),
}
# huecos individuales de los juegos: clave de fuente y componente (orden de arriba abajo o de izquierda a derecha)
SUB_FUENTE = {
    'HDS-A-1': 'HDS-P1', 'HDS-A-2': 'HDS-P1', 'HDS-A-3': 'HDS-P2', 'HDS-B-1': 'HDS-P2', 'HDS-B-2': 'HDS-P2', 'HDS-B-3': 'HDS-P2',
    'EXTS-1': 'EXT6', 'EXTS-2': (None, 'extension de 10 in: sin ficha propia en homedepot.com.mx'), 'EXTS-3': 'PALANCA',
    **{f'PREC6-{i}': ('PREC6', i - 1, 'filas') for i in range(1, 7)},
    **{f'ADAP-{i}': ('ADAP', i - 1, 'columnas') for i in range(1, 4)},
}
AJUSTE_AL_HUECO = {'ADAP'}
MARCA = [('Milwaukee', '#c8102e'), ('M18', '#c8102e'), ('48-', '#c8102e'), ('Husky', '#e0602a'), ('Wiha', '#d9001b'), ('Truper', '#f39200'),
         ('Urrea', '#1d4f91'), ('Stanley', '#2b2b2b'), ('Ridgid', '#d52b1e'), ('Anvil', '#1b8a9a'), ('12R', '#d52b1e')]

def color_marca(texto):
    for k, c in MARCA:
        if k.lower() in texto.lower(): return c
    return '#8a8f94'

def bajar(url, destino):
    if not os.path.exists(destino) or os.path.getsize(destino) == 0:
        subprocess.run(['curl', '-s', '-m', '60', '-L', '-A', UA, '-o', destino, url], check=False)
    return destino

_ses = None
BLANCO_ENCERRADO = {'PRES11', 'PRES6C', 'PRES7', 'PRES10'}   # pinzas con arco: el fondo blanco queda encerrado

def sin_fondo(ruta, quitar_blanco=False):
    global _ses
    from rembg import remove, new_session
    if _ses is None: _ses = new_session('u2netp')
    a = np.array(remove(Image.open(ruta).convert('RGB'), session=_ses))
    if not quitar_blanco: return a
    # fondo blanco encerrado (dentro del arco de una pinza C): rembg lo deja; se quita el blanco puro en zonas grandes
    blanco = (a[:, :, :3].min(axis=2) > 246).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(blanco, 8)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] > 0.002 * blanco.size: a[:, :, 3][lab == i] = 0
    return a

def componentes(rgba, n=None, orden='filas'):
    """Separa objetos de una foto con varias piezas. Devuelve [(mascara, bbox)] de las n mas grandes y alargadas."""
    m = (rgba[:, :, 3] > 128).astype(np.uint8)
    k, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    cs = [(st[i, cv2.CC_STAT_AREA], i) for i in range(1, k)]
    cs.sort(reverse=True)
    if n: cs = cs[:n]
    cs = [i for _, i in cs]
    cs.sort(key=lambda i: st[i, cv2.CC_STAT_TOP] if orden == 'filas' else st[i, cv2.CC_STAT_LEFT])
    return [(lab == i) for i in cs]

SOLO_CUERPO = {'CARG1', 'FLEX', 'ESM45'}   # fotos con cable o correa: se quitan las partes delgadas antes de escalar

def cuerpo(a):
    """Deja solo el cuerpo: una apertura morfologica borra cables y correas (delgados) y se queda el objeto mas grande."""
    m = (a[:, :, 3] > 128).astype(np.uint8)
    k = max(5, int(min(m.shape) * 0.06)) | 1
    ab = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(ab, 8)
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    zona = cv2.dilate((lab == i).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    return zona > 0

def enderezar(rgba, mascara=None, solo_cuerpo=False):
    """Gira para que el lado largo del contorno quede horizontal y recorta. Devuelve la imagen RGBA recortada."""
    a = rgba.copy()
    if solo_cuerpo: mascara = cuerpo(a) if mascara is None else (mascara & cuerpo(a))
    if mascara is not None: a[:, :, 3] = np.where(mascara, a[:, :, 3], 0)
    m = (a[:, :, 3] > 128).astype(np.uint8)
    pts = cv2.findNonZero(m)
    (cx, cy), (w, h), ang = cv2.minAreaRect(pts)
    if w < h: ang += 90
    H, W = m.shape
    M = cv2.getRotationMatrix2D((cx, cy), ang, 1.0)
    c, s = abs(M[0, 0]), abs(M[0, 1]); nW, nH = int(H * s + W * c), int(H * c + W * s)
    M[0, 2] += nW / 2 - cx; M[1, 2] += nH / 2 - cy
    r = cv2.warpAffine(a, M, (nW, nH), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
    ys, xs = np.where(r[:, :, 3] > 128)
    return r[ys.min():ys.max() + 1, xs.min():xs.max() + 1]

def silueta(p, texto_marca, L=None, A=None, circulo=False, barra=False):
    """Proyeccion superior del modelo parametrico (o circulo para un dado parado) en el color de la marca."""
    col = color_marca(texto_marca)
    if circulo:
        d = L; n = int(round(d * SIL_PX_MM)) + 2
        im = Image.new('RGBA', (n, n), (0, 0, 0, 0)); g = ImageDraw.Draw(im)
        g.ellipse([1, 1, n - 2, n - 2], fill='#b9c0c5', outline='#5d666c', width=2)
        r = n * 0.26
        g.polygon([(n / 2 + r * math.cos(math.radians(60 * k)), n / 2 + r * math.sin(math.radians(60 * k))) for k in range(6)], fill='#3c4247')
        return im
    if barra:   # pieza suelta de un juego (broca, extension): barra del largo y ancho de su hueco
        W, H = int(math.ceil(L * SIL_PX_MM)) + 4, max(6, int(math.ceil(A * SIL_PX_MM)) + 4)
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); g = ImageDraw.Draw(im)
        g.rounded_rectangle([2, 2, W - 3, H - 3], radius=min(H, W) // 3, fill=col)
    else:
        import modelos
        q = dict(p); q['L'], q['A'] = L or p['L'], A or p['A']
        _, mesh, env = modelos.modelo(q)
        v = mesh.vertices[:, :2]; mn = v.min(axis=0)
        W, H = int(math.ceil(env[0] * SIL_PX_MM)) + 4, int(math.ceil(env[1] * SIL_PX_MM)) + 4
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); g = ImageDraw.Draw(im)
        for f in mesh.faces:
            tri = [((v[i][0] - mn[0]) * SIL_PX_MM + 2, H - ((v[i][1] - mn[1]) * SIL_PX_MM + 2)) for i in f]
            g.polygon(tri, fill=col)
    a = np.array(im); m = (a[:, :, 3] > 0).astype(np.uint8)
    borde = cv2.morphologyEx(m, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0
    a[borde] = (40, 40, 40, 255)
    im = Image.fromarray(a); g = ImageDraw.Draw(im)
    fs = max(7, min(22, int(H * 0.35), int(W / 7)))
    try: fn = ImageFont.truetype('DejaVuSans-Bold.ttf', fs)
    except Exception: fn = ImageFont.load_default()
    g.text((W / 2, H / 2), 'sin foto', fill='white', anchor='mm', font=fn, stroke_width=2, stroke_fill='#333333')
    return im

def main(out):
    out = os.path.abspath(out)
    if out.startswith(os.path.abspath(os.path.join(BASE, '..', '..'))):
        raise SystemExit('la carpeta de salida debe quedar FUERA del repo (es publico)')
    for d in ('fuente', 'piezas', 'cajas'): os.makedirs(os.path.join(out, d), exist_ok=True)
    F = json.load(open(os.path.join(BASE, 'datos', 'fuentes_imagenes_seleccion.json'), encoding='utf-8'))
    D = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
    cache = {}
    def foto(clave):
        if clave not in cache:
            f = F[clave]; ext = '.img'
            r = bajar(f['imagen'], os.path.join(out, 'fuente', clave + ext))
            cache[clave] = sin_fondo(r, clave in BLANCO_ENCERRADO)
        return cache[clave]
    res = []
    def guardar(ident, im, reg):
        p = os.path.join(out, 'piezas', ident + '.png'); im.save(p)
        reg.update({'id': ident, 'archivo': os.path.relpath(p, out), 'px': list(im.size)}); res.append(reg)
    grupos = {}
    for m in ('BASE', 'TUB'):
        for c in D['modulos'][m]['cajas']:
            for cj in c['cajones']:
                for p in cj['piezas']:
                    ubic = f"{m} C{cj['n']}"
                    if p.get('subhuecos'):
                        for s in p['subhuecos']:
                            sf = SUB_FUENTE.get(s['ref'])
                            if p['id'] == 'DADOS':
                                im = silueta(p, 'dado', L=s['L'], circulo=True)
                                guardar(s['activo'], im, {'modulo': m, 'cajon': cj['n'], 'pieza': s['desc'], 'tipo': 'silueta', 'px_mm': SIL_PX_MM,
                                        'L_mm': s['L'], 'nivel': s['nivel'], 'motivo': 'dado parado: la vista de arriba es un circulo; la foto de Home Depot es lateral'})
                            elif sf is None or isinstance(sf, tuple) and sf[0] is None:
                                mot = sf[1] if isinstance(sf, tuple) else 'broca suelta: truper.com bloqueado y sin ficha por broca en Home Depot'
                                im = silueta(p, p['corto'] + ' ' + p['id'], L=s['L'], A=s['A'], barra=True)
                                guardar(s['activo'], im, {'modulo': m, 'cajon': cj['n'], 'pieza': s['desc'], 'tipo': 'silueta', 'px_mm': SIL_PX_MM,
                                        'L_mm': s['L'], 'nivel': s['nivel'], 'motivo': mot})
                            elif isinstance(sf, tuple):   # componente de una foto de grupo
                                clave, idx, orden = sf
                                g = grupos.setdefault(clave, [])
                                g.append((s, idx, orden, m, cj['n'], p))
                            else:
                                im = enderezar(foto(sf)); pxmm = im.shape[1] / s['L']
                                guardar(s['activo'], Image.fromarray(im), {'modulo': m, 'cajon': cj['n'], 'pieza': s['desc'], 'tipo': 'foto', 'fuente': sf,
                                        'precision': F[sf]['precision'], 'px_mm': round(pxmm, 3), 'L_mm': s['L'], 'nivel': s['nivel'],
                                        'A_foto_mm': round(im.shape[0] / pxmm, 1), 'A_catalogo_mm': s['A']})
                        continue
                    pf = PIEZA_FUENTE.get(p['id'])
                    if pf is None or isinstance(pf, tuple):
                        mot = pf[1] if isinstance(pf, tuple) else 'sin fuente asignada'
                        im = silueta(p, p['corto'] + ' ' + p['id'])
                        guardar(p['activo'], im, {'modulo': m, 'cajon': cj['n'], 'pieza': p['corto'], 'tipo': 'silueta', 'px_mm': SIL_PX_MM,
                                'L_mm': p['L'], 'A_catalogo_mm': p['A'], 'nivel': p.get('fuente_dim', ''), 'motivo': mot})
                        continue
                    im = enderezar(foto(pf), solo_cuerpo=pf in SOLO_CUERPO or p['id'] in SOLO_CUERPO); pxmm = im.shape[1] / p['L']
                    guardar(p['activo'], Image.fromarray(im), {'modulo': m, 'cajon': cj['n'], 'pieza': p['corto'], 'tipo': 'foto', 'fuente': pf,
                            'precision': F[pf]['precision'], 'px_mm': round(pxmm, 3), 'L_mm': p['L'], 'nivel': p.get('fuente_dim', ''),
                            'A_foto_mm': round(im.shape[0] / pxmm, 1), 'A_catalogo_mm': p['A']})
    for clave, items in grupos.items():   # juegos de una sola foto: escala de grupo (la mas larga = L del juego)
        n = max(i[1] for i in items) + 1
        rgba = foto(clave); comps = componentes(rgba, n, items[0][2])
        ims = [enderezar(rgba, cm) for cm in comps]
        L = max(i[0]['L'] for i in items); pxmm_g = max(im.shape[1] for im in ims) / L
        for s, idx, _, m, ncj, p in items:
            im = ims[idx]
            # adaptadores: no hay largo por pieza ni una pieza que mida el largo del juego; cada foto se ajusta a su hueco
            pxmm = max(im.shape[1] / s['L'], im.shape[0] / s['A']) if clave in AJUSTE_AL_HUECO else pxmm_g
            guardar(s['activo'], Image.fromarray(im), {'modulo': m, 'cajon': ncj, 'pieza': s['desc'], 'tipo': 'foto', 'fuente': clave,
                    'precision': F[clave]['precision'] + ' (componente %d de la foto del juego)' % (idx + 1), 'px_mm': round(pxmm, 3),
                    'L_mm': round(im.shape[1] / pxmm, 1), 'nivel': ('escala ajustada al hueco %s x %s (sin medida por pieza)' % (s['L'], s['A'])) if clave in AJUSTE_AL_HUECO else 'escala de grupo: la pieza mas larga = %s mm (%s)' % (L, s['nivel']),
                    'A_foto_mm': round(im.shape[0] / pxmm, 1), 'A_catalogo_mm': s['A']})
    for clave in ('C8410', 'C8442', 'C8443', 'C8444'):   # cajas para la vista exterior
        r = bajar(F[clave]['imagen'], os.path.join(out, 'fuente', clave + '.img'))
        a = sin_fondo(r); ys, xs = np.where(a[:, :, 3] > 128)
        Image.fromarray(a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]).save(os.path.join(out, 'cajas', clave + '.png'))
    json.dump(res, open(os.path.join(out, 'biblioteca.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    # al repo: solo metadatos
    meta = [{k: v for k, v in r.items() if k not in ('archivo',)} for r in res]
    json.dump({'fecha': '2026-09-28', 'nota': 'uso interno de evaluacion; las imagenes NO estan en el repo (es publico)', 'piezas': meta},
              open(os.path.join(BASE, 'datos', 'biblioteca_imagenes.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    nf = sum(1 for r in res if r['tipo'] == 'foto'); ns = len(res) - nf
    print(f'{len(res)} imagenes: {nf} con foto real, {ns} con silueta')
    return res

if __name__ == '__main__':
    main(sys.argv[1])
