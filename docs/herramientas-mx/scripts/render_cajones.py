"""Render de cada cajon de BASE y TUB en vista superior, como foto del cajon abierto (#343, bloque 3).

Uso:
  python3 scripts/render_cajones.py silueta SALIDA                 # siluetas dibujadas: se puede subir al repo
  python3 scripts/render_cajones.py foto SALIDA BIBLIOTECA          # fotos de producto: SOLO fuera del repo (es publico)

Que dibuja, por cajon:
  - el marco rojo PACKOUT a escala (paredes de 18 mm y frente de 40 mm: supuesto de dibujo, no cota);
  - hule gris oscuro con textura;
  - bajo cada herramienta su hueco con fondo amarillo que se ve 2.5 mm alrededor (silueta de dos colores), mas el
    rebaje de dedo donde el diseno lo pone (lado que da datos/interferencias_3d.json; canal cruzada en los juegos de
    barras; los dados no llevan);
  - la herramienta en la posicion y giro del acomodo, con sombra suave;
  - el numero de activo grabado junto a cada hueco;
  - pie: modulo, cajon, modelo de caja, ocupacion y "medidas no validadas".
Variantes "con faltante" (FALTANTES): la misma vista sin una herramienta, con su hueco amarillo a la vista.
Ademas escribe, por render, el recorte del interior a 1 px = 1 mm que usa la deteccion del prototipo v2.
"""
import json, math, os, sys
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFilter, ImageFont

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sys.path.insert(0, os.path.join(BASE, 'scripts'))
from vista_cajon import subs_en_cajon
import biblioteca_imagenes as BI

S = 3.0                      # px por mm del render
PARED, FRENTE, PIE = 18, 40, 30   # mm (supuestos de dibujo)
HOLGURA_VISTA = 3.0          # mm de fondo amarillo alrededor de la herramienta
DEDO = 22                    # diametro del rebaje (cad/fts_rejilla.scad)
AMARILLO = (242, 183, 5)
ROJO, ROJO_OSC = (200, 16, 46), (140, 10, 30)
SUFIJO = lambda a: a.replace('FTS-', '')
FALTANTES = {('BASE', 6): 'FTS-BAS-01-C6-04-03', ('BASE', 3): 'FTS-BAS-01-C3-03'}   # (modulo, cajon): activo que falta

def fuente(px, negrita=False):
    try: return ImageFont.truetype('DejaVuSans-Bold.ttf' if negrita else 'DejaVuSans.ttf', int(px))
    except Exception: return ImageFont.load_default()

def hule(w, h, semilla):
    rng = np.random.default_rng(semilla)
    base = np.full((h, w), 58.0)
    grano = rng.normal(0, 7, (h, w))
    manchas = cv2.GaussianBlur(rng.normal(0, 10, (h, w)), (0, 0), 9)
    g = np.clip(base + grano + manchas, 30, 90).astype(np.uint8)
    return np.dstack([g, g + 2, g + 5]).clip(0, 255).astype(np.uint8)

def colocar(im, rect, rot):
    """Escala ya hecha; gira si hace falta y devuelve (imagen, x, y) centrada en el rectangulo (px)."""
    if rot: im = im.rotate(90, expand=True)
    x, y, w, h = rect
    return im, int(round((x + w / 2) * S - im.width / 2)), int(round((y + h / 2) * S - im.height / 2))

def escalar(im, px_mm):
    f = S / px_mm
    return im.resize((max(1, int(round(im.width * f))), max(1, int(round(im.height * f)))), Image.LANCZOS)

def elementos(cj, modulo, lib, modo, rebajes):
    """Lista de (activo, rect mm, rot, imagen escalada, tipo de rebaje, lados)."""
    out = []
    for p in cj['piezas']:
        subs = subs_en_cajon(p)
        if subs:
            barras = subs[0]['forma'] != 'circulo'
            for sb, h in zip(subs, p['subhuecos']):
                im, pxmm = imagen(lib, modo, sb['activo'], p, h)
                rect = (p['x'] + sb['x'], p['y'] + sb['y'], sb['w'], sb['h'])
                out.append({'activo': sb['activo'], 'rect': rect, 'rot': p['rot'], 'img': escalar(im, pxmm), 'rebaje': None,
                            'etiqueta': sb['activo'][-2:], 'grupo': p['activo']})
            if barras:
                out.append({'activo': p['activo'], 'canal': True, 'rect': (p['x'], p['y'], p['w'], p['h']), 'rot': p['rot']})
            continue
        im, pxmm = imagen(lib, modo, p['activo'], p, None)
        out.append({'activo': p['activo'], 'rect': (p['x'], p['y'], p['w'], p['h']), 'rot': p['rot'], 'img': escalar(im, pxmm),
                    'rebaje': rebajes.get(p['activo'], [0, 1]), 'etiqueta': None, 'grupo': None})
    return out

def imagen(lib, modo, activo, p, sub):
    if modo == 'foto' and activo in lib:
        r = lib[activo]
        return Image.open(os.path.join(lib['_dir'], r['archivo'])).convert('RGBA'), r['px_mm']
    txt = p['corto'] + ' ' + p['id']
    if sub is not None:
        if p['id'] == 'DADOS': return BI.silueta(p, 'dado', L=sub['L'], circulo=True), BI.SIL_PX_MM
        return BI.silueta(p, txt, L=sub['L'], A=sub['A'], barra=True), BI.SIL_PX_MM
    return BI.silueta(p, txt), BI.SIL_PX_MM

def render(modulo, c, cj, lib, modo, falta=None, rebajes=None):
    W, D = cj['ancho'], cj['fondo']
    ox, oy = PARED * S, PARED * S
    CW, CH = int((W + 2 * PARED) * S), int((D + PARED + FRENTE) * S)
    lienzo = Image.new('RGB', (CW, int(CH + PIE * S)), (246, 245, 241))
    g = ImageDraw.Draw(lienzo)
    # marco rojo: paredes con bisel y frente con jaladera
    g.rounded_rectangle([0, 0, CW - 1, CH - 1], radius=int(6 * S), fill=ROJO)
    g.rounded_rectangle([int(4 * S), int(4 * S), CW - int(4 * S), CH - int(4 * S)], radius=int(5 * S), outline=ROJO_OSC, width=int(1.2 * S))
    g.rectangle([int(ox), int((PARED + D) * S) + int(8 * S), CW - int(ox), int((PARED + D) * S) + int(22 * S)], fill=(30, 30, 30))
    # interior: hule
    fondo = hule(int(W * S), int(D * S), semilla=cj['n'] * 7 + len(modulo))
    els = elementos(cj, modulo, lib, modo, rebajes or {})
    hueco = np.zeros(fondo.shape[:2], np.uint8)
    capa_h = np.zeros(fondo.shape[:2] + (4,), np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(2 * HOLGURA_VISTA * S) | 1,) * 2)
    for e in els:
        if e.get('canal'):   # canal de dedos que cruza las barras de un juego, a la mitad de su largo
            x, y, w, h = e['rect']
            if w >= h: cx0, cy0, cx1, cy1 = x + w / 2 - DEDO / 2, y, x + w / 2 + DEDO / 2, y + h
            else: cx0, cy0, cx1, cy1 = x, y + h / 2 - DEDO / 2, x + w, y + h / 2 + DEDO / 2
            cv2.rectangle(hueco, (int(cx0 * S), int(cy0 * S)), (int(cx1 * S), int(cy1 * S)), 255, -1)
            continue
        im, px, py = colocar(e['img'], e['rect'], e['rot'])
        e['pos'] = (px, py, im)
        a = np.array(im)[:, :, 3]
        m = np.zeros_like(hueco)
        x0, y0 = max(0, px), max(0, py); x1, y1 = min(m.shape[1], px + im.width), min(m.shape[0], py + im.height)
        if x1 > x0 and y1 > y0: m[y0:y1, x0:x1] = (a[y0 - py:y1 - py, x0 - px:x1 - px] > 64) * 255
        m = cv2.dilate(m, k)
        if e['rebaje']:   # rebaje de dedo al centro del lado largo del rectangulo de la ficha
            # anclado al contorno real de la herramienta (la foto puede ser mas angosta que el rectangulo de la ficha)
            ys_, xs_ = np.where(m > 0)
            x, y, w, h = xs_.min() / S, ys_.min() / S, (xs_.max() - xs_.min()) / S, (ys_.max() - ys_.min()) / S
            ln = min(max(w, h) * 0.5, 60)
            for s in e['rebaje']:   # media elipse de DEDO/2 hacia afuera del contorno, al centro del lado largo
                if w >= h:
                    col = int((x + w / 2) * S); fila = np.where(m[:, col] > 0)[0]
                    yb = (fila.min() if s == 0 else fila.max()) if len(fila) else int((y if s == 0 else y + h) * S)
                    cc = (col, int(yb)); ej = (int(ln / 2 * S), int(DEDO / 2 * S))
                else:
                    fil = int((y + h / 2) * S); cols = np.where(m[fil, :] > 0)[0]
                    xb = (cols.min() if s == 0 else cols.max()) if len(cols) else int((x if s == 0 else x + w) * S)
                    cc = (int(xb), fil); ej = (int(DEDO / 2 * S), int(ln / 2 * S))
                cv2.ellipse(m, cc, ej, 0, 0, 360, 255, -1)
        hueco = np.maximum(hueco, m)
    # fondo amarillo del hueco con sombra interior (el hule tiene espesor)
    yel = np.zeros_like(fondo); yel[:] = AMARILLO
    sombra = cv2.GaussianBlur(cv2.warpAffine(255 - hueco, np.float32([[1, 0, 1.2 * S], [0, 1, 1.6 * S]]), hueco.shape[::-1], borderValue=255), (0, 0), 1.0 * S) / 255.0
    yel = (yel * (1 - 0.35 * sombra[..., None])).astype(np.uint8)
    hm = (hueco > 127)[..., None]
    interior = np.where(hm, yel, fondo)
    borde = cv2.morphologyEx(hueco, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0
    interior[borde] = (28, 28, 30)
    img = Image.fromarray(interior).convert('RGBA')
    gi = ImageDraw.Draw(img)
    # numeros grabados junto a cada hueco
    f_n = fuente(3.2 * S, True); f_s = fuente(2.6 * S, True)
    for e in els:
        if e.get('canal') or 'pos' not in e: continue
        px, py, im = e['pos']
        t = e['etiqueta'] if e['grupo'] else e['activo'].replace('FTS-', '')
        f = f_s if e['grupo'] else f_n
        tx, ty = px + im.width + int(1.5 * S), py + im.height - int(1 * S)
        if tx + gi.textlength(t, font=f) > img.width - 2: tx, ty = px, py + im.height + int(4 * S)
        if ty > img.height - 4: ty = py - int(1 * S)
        gi.text((tx + 1, ty + 1), t, font=f, fill=(20, 20, 22, 255), anchor='ls')
        gi.text((tx, ty), t, font=f, fill=(150, 154, 160, 255), anchor='ls')
    # herramientas con sombra suave
    for e in els:
        if e.get('canal') or 'pos' not in e or e['activo'] == falta: continue
        px, py, im = e['pos']
        a = im.getchannel('A').filter(ImageFilter.GaussianBlur(2.2 * S))
        sh = Image.new('RGBA', im.size, (0, 0, 0, 0)); sh.putalpha(a.point(lambda v: int(v * 0.55)))
        img.alpha_composite(sh, (max(0, px + int(2 * S)), max(0, py + int(3 * S)))) if px >= 0 and py >= 0 else None
        img.alpha_composite(im, (px, py)) if px >= 0 and py >= 0 and px + im.width <= img.width and py + im.height <= img.height else pegar(img, im, px, py)
    lienzo.paste(img.convert('RGB'), (int(ox), int(oy)))
    # pie
    g = ImageDraw.Draw(lienzo)
    y = CH + int(4 * S)
    g.text((int(4 * S), y), f"Modulo {modulo} · Cajon C{cj['n']} · {c['modelo']} · ocupacion {cj['ocupacion']} %" + (f" · FALTA {falta}" if falta else ''),
           font=fuente(4.2 * S, True), fill=(20, 20, 20))
    g.text((int(4 * S), y + int(6.5 * S)), 'Medidas no validadas · render de evaluacion · ' +
           ('fotos de fabricante y tienda: uso interno de evaluacion' if modo == 'foto' else 'siluetas dibujadas, sin fotos de producto'),
           font=fuente(3.4 * S), fill=(183, 28, 28))
    recorte = img.convert('RGB').resize((W, D), Image.LANCZOS)   # 1 px = 1 mm, lo que espera la deteccion del prototipo
    return lienzo, recorte, els

def pegar(dst, im, px, py):
    x0, y0 = max(0, -px), max(0, -py)
    x1, y1 = min(im.width, dst.width - px), min(im.height, dst.height - py)
    if x1 > x0 and y1 > y0: dst.alpha_composite(im.crop((x0, y0, x1, y1)), (px + x0, py + y0))

def todos(modo, salida, biblioteca=None):
    salida = os.path.abspath(salida)
    if modo == 'foto' and salida.startswith(os.path.abspath(os.path.join(BASE, '..', '..'))):
        raise SystemExit('los renders con foto van FUERA del repo (es publico)')
    os.makedirs(os.path.join(salida, 'deteccion'), exist_ok=True)
    lib = {}
    if modo == 'foto':
        lib = {r['id']: r for r in json.load(open(os.path.join(biblioteca, 'biblioteca.json'), encoding='utf-8'))}
        lib['_dir'] = biblioteca
    D = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
    reb = {x['activo']: x.get('rebaje_lados') or [0, 1] for r in json.load(open(os.path.join(BASE, 'datos', 'interferencias_3d.json'), encoding='utf-8'))['cajones'] for x in r['piezas']}
    hechos = []
    for m in ('BASE', 'TUB'):
        for c in D['modulos'][m]['cajas']:
            for cj in c['cajones']:
                if not cj['piezas']: continue
                for falta in [None] + ([FALTANTES[(m, cj['n'])]] if (m, cj['n']) in FALTANTES else []):
                    lz, rc, els = render(m, c, cj, lib, modo, falta, reb)
                    nom = f"{m}-C{cj['n']}" + (f"_faltante_{SUFIJO(falta)}" if falta else '')
                    lz.save(os.path.join(salida, nom + '.jpg'), quality=88)   # la textura del hule hace pesado el PNG
                    rc.save(os.path.join(salida, 'deteccion', nom + '.png'))
                    hechos.append((m, cj['n'], falta, nom))
    json.dump([{'modulo': h[0], 'cajon': h[1], 'falta': h[2], 'archivo': h[3] + '.jpg'} for h in hechos],
              open(os.path.join(salida, 'renders.json'), 'w'), indent=1)
    print(len(hechos), 'renders en', salida)
    return hechos

if __name__ == '__main__':
    todos(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
