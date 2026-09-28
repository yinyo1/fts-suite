"""Carrito base completo (#343, bloque 4).

Uso:
  python3 scripts/render_carrito.py silueta RENDERS            # alzado dibujado a escala: se puede subir al repo
  python3 scripts/render_carrito.py foto RENDERS BIBLIOTECA     # con las fotos oficiales de las cajas: SOLO fuera del repo

RENDERS es la carpeta de scripts/render_cajones.py del mismo modo. Escribe ahi:
  carrito_exterior.jpg   la pila 8410 + 8442 + 8444 + 8443 (y el TUB arriba en la version de la pila con modulo)
  carrito_C6_abierto.jpg el piloto BASE C6 abierto junto a su render
  hoja_contacto.jpg      todos los cajones de BASE y TUB
Alturas y anchos del fabricante (milwaukeetool.com). En la version foto, cada foto oficial es una vista 3/4: se escala
por el ANCHO de la caja y se apila por el alto de su frente; es una composicion aproximada, no un alzado.
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
K = 1.4   # px por mm del alzado
ROJO, NEGRO, GRIS = (200, 16, 46), (28, 28, 30), (120, 124, 128)
CAJA = {'48-22-8410': (620, 193), '48-22-8442': (564, 363), '48-22-8444': (564, 363), '48-22-8443': (564, 363)}

def fuente(px, b=False):
    try: return ImageFont.truetype('DejaVuSans-Bold.ttf' if b else 'DejaVuSans.ttf', int(px))
    except Exception: return ImageFont.load_default()

def pila(D, con_tub=False):
    b = D['modulos']['BASE']
    cajas = [(b['base_rodante']['modelo'], [])] + [(c['modelo'], c['cajones']) for c in reversed(b['cajas'])]
    if con_tub: cajas += [(c['modelo'], c['cajones'], 'TUB') for c in reversed(D['modulos']['TUB']['cajas'])]
    return [(x[0], x[1], x[2] if len(x) > 2 else 'BASE') for x in cajas]

def alzado(D, abierto=None, con_tub=False):
    """Frente a escala. abierto = (modulo, n): ese cajon se dibuja jalado hacia el frente (mas claro, con sombra)."""
    P = pila(D, con_tub)
    alto = sum(CAJA[m][1] for m, _, _ in P); ancho = 620
    W, H = int((ancho + 260) * K), int((alto + 140) * K)
    im = Image.new('RGB', (W, H), (246, 245, 241)); g = ImageDraw.Draw(im)
    x0 = int(60 * K); y = H - int(60 * K)
    g.line([(0, y), (W, y)], fill=(170, 170, 165), width=2)
    for m, cjs, mod in P:
        w, h = CAJA[m]; xl = x0 + int((ancho - w) / 2 * K); xr = xl + int(w * K); yt = y - int(h * K)
        if m == '48-22-8410':
            g.rectangle([xl, yt, xr, y - int(45 * K)], fill=NEGRO)
            for xx in (xl + int(60 * K), xr - int(60 * K)): g.ellipse([xx - int(30 * K), y - int(60 * K), xx + int(30 * K), y], fill=(50, 50, 52), outline=NEGRO, width=3)
            g.text((xr + int(12 * K), yt + int(60 * K)), '48-22-8410 base plana · 193 mm', font=fuente(11 * K / 1.4), fill=NEGRO)
        else:
            g.rounded_rectangle([xl, yt, xr, y], radius=int(8 * K), fill=ROJO, outline=(120, 8, 25), width=2)
            g.rectangle([xl, yt, xr, yt + int(38 * K)], fill=NEGRO)
            zz = yt + int(38 * K) + int(6 * K)
            libre = (y - int(10 * K)) - zz; tot = sum(cj['alto'] for cj in cjs)
            for cj in cjs:   # cajones de arriba hacia abajo, repartidos en el alto libre segun su alto interior
                y1 = zz + int(libre * cj['alto'] / tot)
                on = abierto == (mod, cj['n'])
                g.rectangle([xl + int(10 * K), zz, xr - int(10 * K), y1 - int(3 * K)], fill=(236, 90, 104) if on else (185, 14, 42), outline=(110, 6, 22))
                g.rectangle([xl + int(200 * K), zz + int(6 * K), xr - int(200 * K), zz + int(14 * K)], fill=NEGRO)
                g.text((xl + int(16 * K), zz + int(4 * K)), f"{mod} C{cj['n']}", font=fuente(9 * K / 1.4, True), fill='white')
                if on: g.text((xl + int(16 * K), zz + int(18 * K)), 'ABIERTO', font=fuente(9 * K / 1.4, True), fill=NEGRO)
                zz = y1
            g.rectangle([xr - int(26 * K), yt + int(50 * K), xr - int(18 * K), y - int(20 * K)], fill=(190, 192, 195))
            g.text((xr + int(12 * K), yt + int(40 * K)), f'{m} · {h} mm' + (f' · {mod}' if mod != 'BASE' else ''), font=fuente(11 * K / 1.4), fill=NEGRO)
        y = yt
    g.line([(x0 - int(30 * K), H - int(60 * K)), (x0 - int(30 * K), y)], fill=NEGRO, width=2)
    g.text((x0 - int(40 * K), y - int(24 * K)), f'{alto} mm', font=fuente(12 * K / 1.4, True), fill=NEGRO)
    return im

def exterior_foto(D, lib):
    """Composicion con las fotos oficiales: cada caja escalada por su ancho y apilada por el alto de su frente."""
    P = pila(D)
    fotos = {m: Image.open(os.path.join(lib, 'cajas', 'C' + m[-4:] + '.png')).convert('RGBA') for m, _, _ in P}
    Wref = 700
    alto_px = sum(int(CAJA[m][1] * Wref / CAJA[m][0]) for m, _, _ in P) + 700
    im = Image.new('RGBA', (Wref + 420, alto_px), (246, 245, 241, 255))
    y = alto_px - 40
    for m, _, _ in P:
        w, h = CAJA[m]; f = fotos[m]
        ww = int(Wref * w / 620); fh = int(f.height * ww / f.width)
        ft = f.resize((ww, fh), Image.LANCZOS)
        im.alpha_composite(ft, (int((Wref - ww) / 2) + 20, y - fh))
        # la foto 3/4 trae la tapa en perspectiva arriba: la siguiente caja se asienta sobre ella (fraccion medida a ojo)
        y -= int(fh * (0.42 if m == '48-22-8410' else 0.80))
    bb = im.convert('RGB').point(lambda v: 255 if v < 240 else 0).getbbox()
    if bb: im = im.crop((0, max(0, bb[1] - 60), im.width, im.height))
    g = ImageDraw.Draw(im)
    g.text((20, 20), 'Composicion con fotos oficiales (vistas 3/4), escala por ancho: aproximada', font=fuente(18), fill=NEGRO)
    return im.convert('RGB')

def pie(im, texto, rojo):
    g = ImageDraw.Draw(im); g.text((12, im.height - 34), texto, font=fuente(15, True), fill=NEGRO)
    g.text((12, im.height - 16), rojo, font=fuente(12), fill=(183, 28, 28))

def main(modo, renders, lib=None):
    D = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
    nota = 'medidas no validadas · ' + ('fotos de fabricante: uso interno de evaluacion' if modo == 'foto' else 'dibujo a escala, sin fotos de producto')
    ext = alzado(D)
    if modo == 'foto':
        f = exterior_foto(D, lib)
        h = max(ext.height, f.height); lz = Image.new('RGB', (ext.width + f.width, h + 40), (246, 245, 241))
        lz.paste(ext, (0, h - ext.height)); lz.paste(f, (ext.width, h - f.height)); ext = lz
    else:
        lz = Image.new('RGB', (ext.width, ext.height + 40), (246, 245, 241)); lz.paste(ext, (0, 0)); ext = lz
    pie(ext, 'Carrito base FTS-CAR: 48-22-8410 + 8442 + 8444 + 8443 · alto 1,282 mm', nota)
    ext.save(os.path.join(renders, 'carrito_exterior.jpg'), quality=88)
    # C6 abierto
    a = alzado(D, abierto=('BASE', 6))
    r = Image.open(os.path.join(renders, 'BASE-C6.jpg')); r.thumbnail((1100, 1100))
    lz = Image.new('RGB', (a.width + r.width + 40, max(a.height, r.height) + 60), (246, 245, 241))
    lz.paste(a, (0, lz.height - 60 - a.height)); lz.paste(r, (a.width + 20, 20))
    g = ImageDraw.Draw(lz)
    g.text((a.width + 20, 22 + r.height), 'El cajon BASE C6, marcado ABIERTO en el alzado, visto desde arriba', font=fuente(16, True), fill=(183, 28, 28))
    pie(lz, 'Piloto BASE C6 (48-22-8444) abierto', nota); lz.save(os.path.join(renders, 'carrito_C6_abierto.jpg'), quality=88)
    # hoja de contacto
    fs = json.load(open(os.path.join(renders, 'renders.json')))
    th = []
    for x in fs:
        im = Image.open(os.path.join(renders, x['archivo'])); im.thumbnail((440, 440)); th.append((x, im))
    cols = 4; tw, tht = 450, max(i.height for _, i in th) + 26
    rows = (len(th) + cols - 1) // cols
    hoja = Image.new('RGB', (cols * tw, rows * tht + 50), (246, 245, 241)); g = ImageDraw.Draw(hoja)
    for i, (x, im) in enumerate(th):
        cx, cy = (i % cols) * tw + 5, (i // cols) * tht + 5
        hoja.paste(im, (cx, cy)); g.text((cx, cy + im.height + 4), f"{x['modulo']} C{x['cajon']}" + (' · con faltante' if x['falta'] else ''), font=fuente(14, True), fill=NEGRO)
    pie(hoja, 'Hoja de contacto: cajones de BASE y TUB', nota)
    hoja.save(os.path.join(renders, 'hoja_contacto.jpg'), quality=85)
    print('ok', renders)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
