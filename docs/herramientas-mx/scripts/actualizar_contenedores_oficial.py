"""Sesion nocturna 1 (#330) · lleva a datos/packout_research.json lo leido hoy en la fuente del fabricante.

Fuentes leidas el 2026-09-28 (pagina o PDF completo, no fragmento):
  CAT   PACKOUT-2023-Dimension-Catalog.pdf, milwaukeetool.com/-/media/PDFs/Sizing-Charts/ (59 pags.), leido como imagen
  MLK   milwaukeetool.com/products/<modelo>: bloque de especificaciones + imagen "Dimensions" del producto
  HDUS  homedepot.com (EUA): especificaciones de la pagina de producto y preguntas y respuestas de compradores
  HDMX  homedepot.com.mx: pagina de producto (precio con IVA incluido, como todo precio de mostrador en Mexico)
Niveles: D2 = dos documentales que coinciden; D1 = una. Ninguna cota tiene medicion fisica todavia.
"""
import json, os
BASE = os.path.join(os.path.dirname(__file__), '..'); D = os.path.join(BASE, 'datos')
F = '2026-09-28'
IN = 25.4
MLK = 'https://www.milwaukeetool.com/products/{}'
CAT = 'https://www.milwaukeetool.com/-/media/PDFs/Sizing-Charts/PACKOUT-2023-Dimension-Catalog.pdf'
HDUS = {
 '48-22-8420': 'https://www.homedepot.com/p/Milwaukee-PACKOUT-19-in-Rolling-Drawer-Tool-Box-48-22-8420/334615696',
 '48-22-8441': 'https://www.homedepot.com/p/Milwaukee-PACKOUT-Single-Drawer-Tool-Box-48-22-8441/342729532',
 '48-22-8444': 'https://www.homedepot.com/p/Milwaukee-PACKOUT-22-in-Modular-4-Drawer-Tool-Box-with-Metal-Reinforced-Corners-and-50-lbs-Capacity-48-22-8444/326480385',
 '48-22-8447': 'https://www.homedepot.com/p/Milwaukee-PACKOUT-22-in-Modular-3-Drawer-Multi-Drawer-Tool-Box-with-Metal-Reinforced-Corners-and-50-lbs-Capacity-48-22-8447/326479354',
 '48-22-8442': 'https://www.homedepot.com/p/Milwaukee-PACKOUT-22-in-2-Drawer-Tool-Box-with-Metal-Reinforced-Corners-48-22-8442/315059770',
 '48-22-8443': 'https://www.homedepot.com/p/Milwaukee-PACKOUT-22-in-Modular-3-Drawer-Tool-Box-with-Metal-Reinforced-Corners-48-22-8443/315059793',
}
HDMX = {
 '48-22-8443': ('https://www.homedepot.com.mx/p/milwaukee-caja-de-herramientas-packout-de-3-cajones-milwaukee-48-22-8443-165831', 3799.00),
 '48-22-8426': ('https://www.homedepot.com.mx/p/milwaukee-caja-de-herramienta-packout-con-llantas-67-x-49-x-4724-cm-milwaukee-48-22-8426-139086', 3799.00),
 '48-22-8450': ('https://www.homedepot.com.mx/p/milwaukee-caja-de-almacenamiento-packout-con-inserto-1501-x-38-x-529-cm-milwaukee-48-22-8450-139212', 2159.00),
}
USD = {'48-22-8420': 269, '48-22-8441': 164, '48-22-8444': 219, '48-22-8447': 199, '48-22-8442': 179, '48-22-8443': 199}

def c(ancho_in, fondo_in, alto_in, n, cap, fuente, nivel):
    return {'n': n, 'int_mm': {'ancho': round(ancho_in * IN), 'fondo': round(fondo_in * IN), 'alto': int(alto_in * IN)},
            'int_in': {'ancho': ancho_in, 'fondo': fondo_in, 'alto': alto_in}, 'capacidad_kg': cap, 'fuente': fuente,
            'nivel': nivel, 'fecha': F}

OFICIAL = {
 '48-22-8442': {'cajones': [c(16.3, 12.5, 5.0, 2, 11.3, f'CAT pag. 10 (imagen): cajon 16.3 x 12.5 in, 5 in de alto; {MLK.format("48-22-8442")}', 'D1')],
                'ext': (16.3, 22.2, 14.3, 'CAT pag. 10 + MLK Length/Width/Height; HDUS 16.3 x 22.2 x 14.3 in', 'D2'), 'peso_lb': 20.05,
                'barra': (True, 'CAT pag. 10 "Locking security bar" + MLK features', 'D2')},
 '48-22-8443': {'cajones': [c(16.3, 12.5, 3.0, 3, 11, f'CAT pag. 11 (imagen): cajon 16.3 x 12.5 in, 3 in de alto', 'D1')],
                'ext': (16.3, 22.2, 14.3, 'CAT pag. 11 + MLK; HDUS 16.3 x 22.2 x 14.3; HDMX 40.89 x 36.2 cm (fondo x alto)', 'D2'), 'peso_lb': 22.45,
                'barra': (True, 'CAT pag. 11 + MLK features', 'D2'),
                'resuelve': 'Discrepancia 76 contra 86 mm: el fabricante da 3 in = 76 mm. Los 86 mm de la ficha de EUA no se sostienen.'},
 '48-22-8444': {'cajones': [c(16.3, 12.5, 2.3, 4, 11, f'MLK imagen "48-22-8444 Dimensions": cajon 16.3 x 12.5 in, 2.3 in (5.8 cm) de alto; respuesta de comprador en HDUS repite 2.3 x 16.3 x 12.5 in tomado de la misma imagen', 'D1')],
                'ext': (16.3, 22.2, 14.3, 'MLK Length 16.3 / Width 22.2 / Height 14.3 in; HDUS 16.10 x 22.2 x 14.3 in (5 mm menos de fondo)', 'D2'), 'peso_lb': 24,
                'barra': (True, 'MLK features "Locking Security Bar"; HDUS preguntas: la barra se guarda bajo la caja', 'D2'),
                'nota': 'El cajon es de 58 mm, NO de 61 mm (fragmento UK de la sesion anterior). La imagen oficial rotula 22.2 in como "54.4 cm": error de la imagen, 22.2 in = 56.4 cm.'},
 '48-22-8447': {'cajones': [c(16.3, 12.5, 2.5, 2, 11, 'MLK imagen "48-22-8447 Dimensions": 2 cajones de 2.5 in (6.35 cm)', 'D1'),
                            c(16.3, 12.5, 5.0, 1, 11, 'MLK imagen "48-22-8447 Dimensions": 1 cajon de 5 in (12.7 cm)', 'D1')],
                'ext': (16.3, 22.2, 14.3, 'MLK; HDUS 16.10 x 22.2 x 14.3 in', 'D2'), 'peso_lb': 23.5,
                'barra': (True, 'MLK features "Locking Security Bar"', 'D1'),
                'resuelve': 'Discrepancia 8442 contra 8447: la division 61 + 61 + 130 que la ficha UK atribuia al 8442 es la del 8447 (oficial: 63.5 + 63.5 + 127). El 8442 son 2 cajones de 127.'},
 '48-22-8441': {'cajones': [c(16.5, 13.0, 10.25, 1, 22.7, 'MLK imagen "48-22-8441 Dimensions 101": cajon 16.5 x 13 in (41.9 x 33 cm), 10.25 in (26 cm)', 'D1')],
                'ext': (16.3, 22.2, 14.0, 'MLK imagen: 22.2 x 16.3 x 14 in; MLK especificaciones Height 14.3; HDUS 22 x 22.5 x 14.5 in', 'D1'), 'peso_lb': 23.15,
                'barra': (True, 'MLK features "Locking Security Bar"', 'D1')},
 '48-22-8420': {'cajones': [{'n': 1, 'int_mm': {'ancho': 432, 'fondo': 330, 'alto': 406}, 'int_in': {'ancho': None, 'fondo': 13.0, 'alto': 16.0},
                             'capacidad_kg': 113.4, 'fuente': 'MLK imagen "48-22-8420 Dimensions 101": 13 in de ancho de cajon y 16 in de alto; el tercer lado (432 mm) sigue siendo fragmento de buscador',
                             'nivel': 'D1 (13 y 16 in) / D1 fragmento (432)', 'fecha': F}],
                'ext': (19.0, 24.0, 19.75, 'MLK imagen: 24 x 19 x 19.75 in; MLK especificaciones 24 x 19 x 20 in; HDUS 23.9 x 19.49 x 19.82 in', 'D2'), 'peso_lb': 29,
                'barra': (False, 'MLK no lista "Locking Security Bar" (si la lista en 8441/8442/8443/8444/8447). Comprador en HDUS: "hay que desapilar todo lo que va encima para poder ponerle candado".', 'D1'),
                'nota': 'Incluye 2 divisores grandes, 6 divisores y una bandeja interior (MLK "Includes"). Peso: MLK 29 lb, HDUS 36 lb.'},
}

def main():
    R = json.load(open(os.path.join(D, 'packout_research.json'), encoding='utf-8'))
    cambios = []
    for m in R:
        o = OFICIAL.get(m['modelo'])
        if not o: continue
        antes = [(x.get('n'), (x.get('int_mm') or {}).get('ancho'), (x.get('int_mm') or {}).get('fondo'), (x.get('int_mm') or {}).get('alto')) for x in (m.get('cajones') or [])]
        m['cajones'] = o['cajones']
        L, W, H, src, niv = o['ext']
        m['ext_mm'] = {'L': round(L * IN), 'W': round(W * IN), 'H': round(H * IN)}
        m['ext_in'] = {'L': L, 'W': W, 'H': H, 'nota': 'L (fondo) x W (frente) x H'}
        m['ext_fuente'] = {'fuente': src, 'nivel': niv, 'fecha': F}
        m['peso_vacio_kg'] = round(o['peso_lb'] * 0.4536, 2)
        v, fsrc, fn = o['barra']
        m['barra_seguridad'] = {'valor': v, 'fuente': fsrc, 'nivel': fn}
        if o.get('nota'): m['notas'] = (o['nota'] + ' ' + (m.get('notas') or '')).strip()
        if o.get('resuelve'): m['resuelve'] = o['resuelve']
        m['fuentes'] = [{'campo': 'cajones', 'valor': '; '.join(x['fuente'] for x in o['cajones']), 'url': MLK.format(m['modelo']) if m['modelo'] not in ('48-22-8442', '48-22-8443') else CAT,
                         'tipo_fuente': 'fabricante (leido hoy, pagina completa)', 'pagina': None},
                        {'campo': 'ext', 'valor': src, 'url': HDUS.get(m['modelo']), 'tipo_fuente': 'fabricante + distribuidor EUA', 'pagina': None}] + [
                        dict(f, tipo_fuente='(sesion anterior) ' + (f.get('tipo_fuente') or '')) for f in (m.get('fuentes') or [])]
        pr = [p for p in (m.get('precios_mx') or [])]
        if m['modelo'] in HDMX:
            u, p = HDMX[m['modelo']]
            pr.insert(0, {'tienda': 'The Home Depot Mexico (pagina leida)', 'precio_mxn': p, 'fecha': F, 'url': u, 'confianza': 'alta: pagina abierta', 'iva': 'incluido'})
        if m['modelo'] in USD:
            pr.append({'tienda': 'The Home Depot EUA (referencia, USD)', 'precio_mxn': None, 'precio_usd': USD[m['modelo']], 'fecha': F,
                       'url': HDUS[m['modelo']], 'confianza': 'referencia de precio de lista EUA, sin impuestos', 'iva': 'no aplica'})
        for p in pr: p.setdefault('iva', 'incluido (precio de tienda MX)' if p.get('precio_mxn') else 'sin dato')
        m['precios_mx'] = pr
        despues = [(x['n'], x['int_mm']['ancho'], x['int_mm']['fondo'], x['int_mm']['alto']) for x in o['cajones']]
        cambios.append({'modelo': m['modelo'], 'cajones_antes': antes, 'cajones_despues': despues, 'barra': v, 'nota': o.get('resuelve') or o.get('nota') or ''})
    # precios HD MX de modelos sin cajones
    for m in R:
        if m['modelo'] in HDMX and m['modelo'] not in OFICIAL:
            u, p = HDMX[m['modelo']]
            m.setdefault('precios_mx', []).insert(0, {'tienda': 'The Home Depot Mexico (pagina leida)', 'precio_mxn': p, 'fecha': F, 'url': u,
                                                      'confianza': 'alta: pagina abierta', 'iva': 'incluido'})
    json.dump(R, open(os.path.join(D, 'packout_research.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(cambios, open(os.path.join(D, 'cambios_contenedores_nocturna.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for x in cambios: print(x)

if __name__ == '__main__':
    main()
