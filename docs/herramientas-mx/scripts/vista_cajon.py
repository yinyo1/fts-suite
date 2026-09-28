"""Skill vista-cajon · SVG de vista superior de un cajon, 1 unidad = 1 mm, cotas en mm y numero de activo por pieza."""
import html, os

COLORES = {'electrico': '#FFE08A', 'mecanica_general': '#C9DDF2', 'soldadura_metalmecanica': '#F6C2A8',
           'perforacion_corte': '#D8C8F0', 'inalambricas_energia': '#F4A6A6', 'medicion_trazo': '#BFE6C8',
           'tuberia': '#B8E0E8', 'izaje_amarre': '#E6D3B3', 'limpieza': '#DDDDDD'}

def subs_en_cajon(p):
    """Huecos individuales de un juego (#343, bloque 1) en el marco del cajon, relativos a la esquina de la pieza.
    La pieza girada usa la misma rotacion que el contorno de cad/generar_cajon.py: (x, y) -> (y, L - x)."""
    out = []
    for s in p.get('subhuecos') or []:
        if p.get('rot'): x, y, w, h = s['y'], p['L'] - s['x'] - s['L'], s['A'], s['L']
        else: x, y, w, h = s['x'], s['y'], s['L'], s['A']
        out.append({'x': round(x, 1), 'y': round(y, 1), 'w': w, 'h': h, 'forma': s['forma'], 'activo': s['activo'], 'ref': s['ref'], 'desc': s['desc']})
    return out

def svg_cajon(caj, piezas, margen=6, titulo=''):
    W, D = caj['ancho'], caj['fondo']
    M = 46
    vw, vh = W + 2 * M, D + 2 * M + 70
    e = html.escape
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} {vh}" width="{vw * 1.6:.0f}" font-family="Arial, sans-serif">',
         f'<rect x="0" y="0" width="{vw}" height="{vh}" fill="#ffffff"/>',
         f'<text x="{M}" y="18" font-size="13" font-weight="bold">{e(titulo)}</text>',
         f'<rect x="{M}" y="{M}" width="{W}" height="{D}" fill="#2b2b2b" stroke="#000" stroke-width="3"/>',
         # cota ancho
         f'<line x1="{M}" y1="{M-14}" x2="{M+W}" y2="{M-14}" stroke="#333" stroke-width="1"/>',
         f'<line x1="{M}" y1="{M-20}" x2="{M}" y2="{M-8}" stroke="#333"/><line x1="{M+W}" y1="{M-20}" x2="{M+W}" y2="{M-8}" stroke="#333"/>',
         f'<text x="{M + W/2}" y="{M-18}" font-size="11" text-anchor="middle">{W} mm</text>',
         # cota fondo
         f'<line x1="{M-14}" y1="{M}" x2="{M-14}" y2="{M+D}" stroke="#333"/>',
         f'<line x1="{M-20}" y1="{M}" x2="{M-8}" y2="{M}" stroke="#333"/><line x1="{M-20}" y1="{M+D}" x2="{M-8}" y2="{M+D}" stroke="#333"/>',
         f'<text x="{M-18}" y="{M + D/2}" font-size="11" text-anchor="middle" transform="rotate(-90 {M-18} {M + D/2})">{D} mm</text>',
         f'<text x="{M + W/2}" y="{M + D + 14}" font-size="10" text-anchor="middle" fill="#555">FRENTE DEL CAJON</text>']
    for p in piezas:
        x, y, w, h = M + p['x'], M + p['y'], p['w'], p['h']
        col = COLORES.get(p['familia'], '#EEEEEE')
        o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{col}" stroke="#111" stroke-width="1.2"/>')
        subs = subs_en_cajon(p)
        for sb in subs:   # un hueco por pieza del juego, con su numero corto
            if sb['forma'] == 'circulo':
                o.append(f'<circle cx="{x + sb["x"] + sb["w"]/2}" cy="{y + sb["y"] + sb["h"]/2}" r="{sb["w"]/2}" fill="#fff8" stroke="#111" stroke-width="0.6"/>')
            else:
                o.append(f'<rect x="{x + sb["x"]}" y="{y + sb["y"]}" width="{sb["w"]}" height="{sb["h"]}" rx="1.5" fill="#fff8" stroke="#111" stroke-width="0.6"/>')
            o.append(f'<text x="{x + sb["x"] + sb["w"]/2}" y="{y + sb["y"] + sb["h"]/2 + 2}" font-size="{max(4, min(7, sb["w"]/3, sb["h"]/2.2)):.1f}" text-anchor="middle" fill="#333">{sb["activo"][-2:]}</text>')
        if subs:
            ty = y + h + 8 if p['y'] + h + 10 <= D else y - 2   # debajo de la ficha si cabe; si no, arriba
            o.append(f'<text x="{x + w/2}" y="{ty}" font-size="7" text-anchor="middle" font-weight="bold" fill="#fff">{e(p["activo"])} · {len(subs)} huecos</text>')
            continue
        fs = max(6, min(11, w / 14, h / 3.2))
        o.append(f'<text x="{x + w/2}" y="{y + h/2 - fs*0.2}" font-size="{fs:.1f}" text-anchor="middle" font-weight="bold">{e(p["activo"])}{" R" if p["rot"] else ""}</text>')
        o.append(f'<text x="{x + w/2}" y="{y + h/2 + fs}" font-size="{fs*0.85:.1f}" text-anchor="middle">{e(p["corto"][:max(8, int(w / (fs*0.5)))])}</text>')
        if h >= 40:
            o.append(f'<text x="{x + 2}" y="{y + h - 2}" font-size="{max(5, fs*0.7):.1f}" fill="#333">{p["L"]}x{p["A"]}x{p["H"]}</text>')
    y0 = M + D + 32
    pie = caj.get('pie', [])
    for i, t in enumerate(pie):
        o.append(f'<text x="{M}" y="{y0 + i*14}" font-size="11" fill="{"#B71C1C" if "no validado" in t else "#000"}">{e(t)}</text>')
    o.append('</svg>')
    return '\n'.join(o)
