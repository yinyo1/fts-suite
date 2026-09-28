"""Sesion nocturna 1 (#330), Bloque 3.5 · etiquetas de numero de activo + QR para el grabador laser, en SVG.

Dos variantes (el grabador de FTS no esta confirmado, ver plan_fabricacion.md 6.1):
  fibra/     laser de fibra: marca acero y aluminio desnudos. QR de 12 mm (modulo ~0.5 mm), texto 2.2 mm.
  co2_diodo/ CO2 o diodo con spray de marcaje (tipo CerMark/LaserBond) sobre metal, o directo sobre placa anodizada.
             QR de 16 mm (modulo ~0.64 mm: el punto del diodo es mas grueso), texto 2.8 mm.
Contenido del QR: el numero de activo en texto plano (funciona sin red; la app lo resuelve). Nunca nombres.
Salida: una hoja SVG por carrito (piezas + contenedores + kit) y una etiqueta suelta por activo del cajon piloto.
Negro = area a marcar. Unidades del SVG = mm. Antes de grabar: convertir texto a curvas en el software del laser.
"""
import json, os, qrcode
from qrcode.util import QRData
BASE = os.path.join(os.path.dirname(__file__), '..'); OUT = os.path.join(BASE, 'etiquetas')
d = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
VAR = {'fibra': {'qr': 12.0, 'txt': 2.2, 'w': 38, 'h': 16, 'borde': 0.3},
       'co2_diodo': {'qr': 16.0, 'txt': 2.8, 'w': 50, 'h': 20, 'borde': 0.4}}

def qr_path(texto, lado, x0, y0):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0); q.add_data(texto); q.make(fit=True)
    m = q.get_matrix(); n = len(m); s = lado / n
    p = []
    for j, fila in enumerate(m):
        i = 0
        while i < n:   # corridas horizontales: menos trayectorias para el laser
            if fila[i]:
                k = i
                while k < n and fila[k]: k += 1
                p.append(f'M{x0 + i * s:.3f},{y0 + j * s:.3f}h{(k - i) * s:.3f}v{s:.3f}h{-(k - i) * s:.3f}z')
                i = k
            else: i += 1
    return ''.join(p), n, s

def etiqueta(activo, desc, v, x=0, y=0):
    c = VAR[v]; pad = 1.5
    path, n, s = qr_path(activo, c['qr'], x + pad, y + (c['h'] - c['qr']) / 2)
    tx = x + pad * 2 + c['qr']
    return (f'<g><rect x="{x}" y="{y}" width="{c["w"]}" height="{c["h"]}" rx="1.5" fill="none" stroke="#000" stroke-width="{c["borde"]}"/>'
            f'<path d="{path}" fill="#000"/>'
            f'<text x="{tx:.2f}" y="{y + c["h"] / 2 - 0.6:.2f}" font-family="DejaVu Sans Mono, monospace" font-weight="bold" font-size="{c["txt"]}">{activo}</text>'
            f'<text x="{tx:.2f}" y="{y + c["h"] / 2 + c["txt"] + 0.4:.2f}" font-family="DejaVu Sans, sans-serif" font-size="{c["txt"] * 0.72:.2f}">FTS · {desc[:18]}</text></g>'), n, s

def svg(contenido, w, h):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}mm" height="{h}mm" viewBox="0 0 {w} {h}">{contenido}</svg>'

activos = [('FTS-CAR-01', 'carrito base 01')]
cont_n = 0
for c in d['modulos']['BASE']['cajas']:
    cont_n += 1; activos.append((f'FTS-BAS-01-K{cont_n}', c['modelo']))
for c in d['modulos']['BASE']['cajas']:
    for cj in c['cajones']:
        for q in cj['piezas']: activos.append((q['activo'], q['corto']))
res = {}
for v, c in VAR.items():
    os.makedirs(os.path.join(OUT, v), exist_ok=True)
    cols = 5; gap = 3; filas = -(-len(activos) // cols)
    W = cols * c['w'] + (cols + 1) * gap; H = filas * c['h'] + (filas + 1) * gap
    partes = []; mod = []
    for k, (a, dsc) in enumerate(activos):
        e, n, s = etiqueta(a, dsc, v, gap + (k % cols) * (c['w'] + gap), gap + (k // cols) * (c['h'] + gap)); partes.append(e); mod.append(s)
    open(os.path.join(OUT, v, 'hoja_carrito_base_01.svg'), 'w').write(svg(''.join(partes), W, H))
    for a, dsc in activos:
        if '-C6-' in a or a == 'FTS-CAR-01':
            e, n, s = etiqueta(a, dsc, v); open(os.path.join(OUT, v, f'{a}.svg'), 'w').write(svg(e, c['w'], c['h']))
    res[v] = {'etiquetas': len(activos), 'hoja_mm': [round(W), round(H)], 'modulo_qr_mm': [round(min(mod), 3), round(max(mod), 3)]}
json.dump(res, open(os.path.join(OUT, 'resumen.json'), 'w'), indent=1)
print(res)
