"""Renders con fotos reales (#343), Bloque 1 · correcciones al acomodo antes de dibujar.

1. Juegos en huecos individuales: la revision por foto tiene que ver CADA pieza.
   - Dados de la caja P y matraca (BASE C4): cada dado en su propio hueco, parado, con sus medidas de Home Depot Mexico
     (nivel D1). La matraca, pieza aparte (D1).
   - Juegos sin medida por pieza (desarmadores de precision, brocas, 3 desarmadores Husky, adaptadores): una ficha con un
     hueco POR PIEZA dentro de la envolvente medida del juego, separados por pared de 3 mm. No se inventan largos: el hueco
     usa el largo de la envolvente y se ajusta con vernier.
   - Extensiones y palanca: 3 huecos con su largo (nominal 6 in y 10 in del nombre, palanca D1 de Home Depot).
2. BASE: la 8420 (sin barra) se sustituye por la base plana 48-22-8410 + una 48-22-8442 (2 cajones de 127 mm con barra):
   esmeriladora en C8 y cargador en C9. Comparacion de opciones en datos/opciones_8420.json.
Escribe diseno_carrito.json (idempotente: si ya se aplico, no hace nada) y datos/fuentes_piezas_individuales.json.
Despues correr: interferencias_3d.py --corregir, estabilidad.py, build_vista_3d.py, reporte_3d.py.
"""
import json, os, sys, copy
BASE = os.path.join(os.path.dirname(__file__), '..'); D = os.path.join(BASE, 'datos')
sys.path.insert(0, os.path.join(BASE, 'scripts'))

# ---- fuentes (Home Depot Mexico, leidas 2026-09-28; medidas D1; ver datos/fuentes_piezas_individuales.json)
DADOS = [  # ref caja P, descripcion, sku HD, largo (alto parado), diametro exterior, peso HD kg (poco confiable)
 ('P7', 'Dado 19 mm 3/8', '129326', 22, 23, 0.062), ('P8', 'Dado 18 mm 3/8', '129325', 26, 24, 0.052), ('P9', 'Dado 18 mm 3/8', '129325', 26, 24, 0.052),
 ('P10', 'Dado 17 mm 3/8', '129323', 23, 21, 0.515), ('P11', 'Dado 16 mm 1/2 12 puntas', '106503', 35, 20, 0.705), ('P12', 'Dado 15 mm 3/8', '129322', 21, 18, 0.375),
 ('P13', 'Dado 15 mm 3/8', '129322', 21, 18, 0.375), ('P14', 'Dado 14 mm 3/8', '129321', 22, 17, 0.035), ('P15', 'Dado 13 mm 3/8', '129320', 21, 16, 0.034),
 ('P16', 'Dado 12 mm 3/8', '129319', 22, 14, 0.275), ('P17', 'Dado 11 mm 3/8 (SIN FICHA: se usa el del 10 mm)', None, 24, 19, 0.025),
 ('P18', 'Dado 10 mm 3/8', '129318', 24, 19, 0.025), ('P19', 'Dado 5/16 in', '106513', 22, 14, 0.25), ('P20', 'Dado 7/16 in 3/8', '106515', 24, 14, 0.28),
 ('P21', 'Dado 7/16 in 3/8', '106515', 24, 14, 0.28), ('P22', 'Dado 7/16 in 3/8', '106515', 24, 14, 0.28), ('P23', 'Dado 1/2 in 3/8', '106512', 21, 16, 0.345),
 ('P24', 'Dado 1/2 in 3/8', '106512', 21, 16, 0.345), ('P25', 'Dado 3/4 in 3/8', '106507', 23, 23, 0.6), ('P26', 'Dado 3/4 in 3/8', '106507', 23, 23, 0.6),
 ('P27', 'Dado 3/4 in 3/8', '106507', 23, 23, 0.6), ('P28', 'Dado 15/16 in 1/2 12 puntas', '106483', 36, 29, 0.124), ('P29', 'Dado 1 in 1/2 12 puntas', '106482', 41, 34, 0.142),
 ('P30', 'Dado 3/8 in 3/8', '106514', 22, 15, 0.265), ('P31', 'Dado 9/16 in 3/8', '106511', 22, 17, 0.36), ('P32', 'Dado 5/8 in 3/8', '106510', 22, 20, 0.465),
 ('P33', 'Dado 11/16 in 3/8', '106509', 26, 22, 0.049), ('P34', 'Dado 13/16 in 1/2 12 puntas', '106485', 35, 25, 0.975), ('P35', 'Dado 7/8 in 1/2 12 puntas', '106484', 35, 27, 0.109),
]
MATRACA = {'id': 'MATRACA', 'ref': 'dados38', 'corto': 'Matraca rotativa 3/8 Husky H38ROTORATMX', 'L': 240, 'A': 42, 'H': 34, 'peso_kg': 0.357,
           'fuente': 'Home Depot MX sku 106478 (Largo 24 cm, Ancho 4.2, Profundidad 3.4)', 'nivel': 'D1'}
PARED_SUB = 3.0        # pared entre huecos de una misma ficha
LARGO_DADERA = 240     # la dadera se arma en filas del largo de la matraca

def dadera():
    """Acomoda los dados parados en filas de a lo mas LARGO_DADERA, del mas grande al mas chico."""
    ds = sorted(DADOS, key=lambda t: -t[4])
    filas, fila, ancho = [], [], 0.0
    for t in ds:
        w = t[4]
        if fila and ancho + PARED_SUB + w > LARGO_DADERA:
            filas.append(fila); fila, ancho = [], 0.0
        ancho += (PARED_SUB if fila else 0) + w; fila.append(t)
    if fila: filas.append(fila)
    subs, y = [], 0.0
    for f in filas:
        h = max(t[4] for t in f); x = 0.0
        for t in f:
            subs.append({'ref': t[0], 'desc': t[1], 'sku_hd': t[2], 'x': round(x, 1), 'y': round(y + (h - t[4]) / 2, 1), 'L': t[4], 'A': t[4], 'H': t[3],
                         'forma': 'circulo', 'nivel': 'D1' if t[2] else 'supuesto (sin ficha)', 'peso_kg': t[5]})
            x += t[4] + PARED_SUB
        y += h + PARED_SUB
    L = max(s['x'] + s['L'] for s in subs); A = y - PARED_SUB
    return subs, round(L, 1), round(A, 1), max(t[3] for t in DADOS), round(sum(t[5] for t in DADOS), 3)

def regleta(p, n, etiquetas, largos=None, fuente='', anchos=None):
    """n huecos lado a lado a lo largo de A (ancho del juego), cada uno del largo del juego (o su largo propio).
    anchos: ancho propio de cada hueco cuando hay una medida por pieza (nominal del nombre o cota del empaque); en ese
    caso el ancho del juego pasa a ser la suma y la pieza crece (se vuelve a acomodar el cajon)."""
    L, A = p['L'], p['A']
    an = anchos or [round((A - (n - 1) * PARED_SUB) / n, 1)] * n
    out, y = [], 0.0
    for i in range(n):
        out.append({'ref': f"{p['id']}-{i + 1}", 'desc': etiquetas[i], 'x': 0.0, 'y': round(y, 1),
                    'L': (largos[i] if largos else L), 'A': an[i], 'H': p['H'], 'forma': 'barra',
                    'nivel': 'ver fuente' if (largos or anchos) else 'F (envolvente del juego / n)', 'fuente': fuente})
        y += an[i] + PARED_SUB
    return out

SUBS = {
 'PREC6': (6, ['Desarmador de precision %d de 6' % (i + 1) for i in range(6)], None, 'envolvente del estuche 190 x 90 (F, sesion 1): 6 huecos de 190 x 12.5'),
 'BROCAS': (15, ['Broca HSS %s in' % s for s in ('1/16', '3/32', '1/8', '5/32', '3/16', '7/32', '1/4', '9/32', '5/16', '11/32', '3/8', '13/32', '7/16', '15/32', '1/2')], None,
            'largo: el del estuche, 150 (F); ancho de cada hueco: el diametro NOMINAL del nombre (1/16 a 1/2 por 1/32). En los 80 mm del estuche no caben acostadas: los 15 diametros suman 107 mm, mas 14 paredes de 3 mm = 149 mm. Largo por broca SIN fuente (truper.com bloqueado por la red)',
            [round(k / 32 * 25.4, 1) for k in range(2, 17)]),
 'HDS-A': (3, ['Desarmador Husky P1', 'Desarmador Husky P1', 'Desarmador Husky P2'], None, 'envolvente de los 3 juntos 230 x 100 (F)'),
 'HDS-B': (3, ['Desarmador Husky P2', 'Desarmador Husky P2', 'Desarmador Husky P2'], None, 'envolvente de los 3 juntos 230 x 100 (F)'),
 'ADAP': (3, ['Adaptador 1/4 a 3/8', 'Adaptador 3/8 a 1/2', 'Adaptador 1/2 a 3/8'], None, 'largo: envolvente del juego, 70 (F). Ancho: 19 mm por hueco, que es el grueso del empaque de Home Depot 106475 (98 x 72 x 19, D1): ningun adaptador puede ser mas grueso que su empaque. Los 11 mm de repartir 40 entre 3 no alcanzaban para el cuadro hembra de 1/2 (12.7 nominal)',
          [19.0, 19.0, 19.0]),
 'EXTS': (3, ['Extension 3/8 de 6 in', 'Extension 3/8 de 10 in', 'Maneral de fuerza 3/8'], [152.4, 254.0, 230.0],
          'extensiones: largo nominal del nombre (6 y 10 in); Home Depot 129311 dice 21.5 cm, que no cuadra con 6 in (empaque, se descarta); maneral H38BB10MX: Largo 23 cm, Home Depot sku 106480 (D1)'),
}

OPCIONES = {
 'fuentes': {'48-22-8420': 'milwaukeetool.com: 24 x 19 x 20 in, 29 lb; sin barra de candado (sesion 1). Precio 5,599 (buscador HerramientaElectrica.mx, media)',
             '48-22-8410': 'milwaukeetool.com/products/48-22-8410 leida 2026-09-28: PACKOUT Dolly 24.4 x 18.9 x 7.6 in (620 x 480 x 193 mm), 11 lb (5.0 kg), 250 lb de capacidad. Precio 2,345 con IVA (Ferreterias Calzada, datos/precios_mx_busqueda.json, confianza media)',
             '48-22-8442': 'catalogo PACKOUT 2023: 2 cajones de 127 mm (414 x 318), barra de candado. Precio 3,952 (buscador, agotado)',
             '48-22-8441': 'milwaukeetool.com: 1 cajon 419 x 330 x 260, barra; 23.15 lb'},
 'opciones': [
  {'id': 'a', 'que': '8420 como cajon de consumibles sin candado (discos, cinta, cinchos, brocas de reposicion) con minimos y maximos; esmeril y cargador se quedan en la 8420',
   'costo_por_base': 0, 'alto_pila_mm': 502 + 2 * 363, 'bajo_llave': 'todo menos esmeriladora, cargador y consumibles', 'impresion': 'bandeja 8420: 902 g, 52 h',
   'estabilidad': 'la de #338 (vuelco a 15.5 grados con un cajon abierto)', 'contras': 'la herramienta electrica mas cara de la base sigue sin llave; la esmeriladora no cabe en ningun cajon de 76 o 58 mm (90 mm de alto)'},
  {'id': 'b', 'que': 'base plana con ruedas 48-22-8410 + 48-22-8442: esmeril en un cajon de 127 y cargador en el otro, los dos con barra',
   'costo_por_base': round(2345 + 3952 - 5599, 2), 'alto_pila_mm': 193 + 3 * 363, 'bajo_llave': 'todo', 'impresion': 'sin bandeja: ahorra 902 g y 52 h por base; suma 2 losetas de 8442',
   'estabilidad': 'recalculada (scripts/estabilidad.py, base sola, orientacion A): peor cajon abierto BASE C4 vuelca a 10.7 grados (antes 15.5 con C1); todos los de arriba abiertos a 5.7 (antes 9.8); cerrada a 15.0 (antes 17.8). Con los dados a 60 g cada uno, en vez del peso de Home Depot, sube a 13.3 y 7.7. Pierde margen porque la 8410 pesa 5 kg contra 13.2 y su apoyo es mas angosto (supuesto). Con 5 grados sigue en pie en todos los casos', 'contras': '+54 mm de alto; la 8410 no trae asa telescopica: el carrito se empuja; hay que confirmar si las rodajas traen freno'},
  {'id': 'c', 'que': 'base plana 8410 + 48-22-8441 (un cajon de 260 mm con barra): esmeril y cargador juntos',
   'costo_por_base': None, 'alto_pila_mm': 193 + 3 * 363, 'bajo_llave': 'todo', 'impresion': '1 cajon grande',
   'estabilidad': 'como b', 'contras': 'NO caben juntos: 6 + 152 + 12 + 155 + 6 = 331 mm contra 330 de fondo; sin precio de la 8441 en el repo'},
 ],
 'recomendada': 'b',
 'por_que': 'Es la unica que deja TODO bajo llave con cajas que ya estan en el diseno; cuesta 698 pesos mas por base y ahorra la bandeja impresa. Lo que cuesta en estabilidad no cambia las reglas de uso: un cajon a la vez y nunca en rampa. La a deja sin llave justo la esmeriladora, que es la pieza que mas se ha repuesto (4 veces, caso de negocio). La c no cabe por 1 mm.',
}

def aplicar(d):
    b = d['modulos']['BASE']
    if b.get('base_rodante', {}).get('modelo') == '48-22-8410':
        print('ya aplicado'); return False
    idx = {cj['n']: (c, cj) for c in b['cajas'] for cj in c['cajones']}
    # 1) subhuecos en los juegos
    for m in ('BASE', 'TUB'):
        for c in d['modulos'][m]['cajas']:
            for cj in c['cajones']:
                for p in cj['piezas']:
                    if p['id'] in SUBS:
                        n, et, lg, fu = SUBS[p['id']][:4]
                        an = SUBS[p['id']][4] if len(SUBS[p['id']]) > 4 else None
                        p['subhuecos'] = regleta(p, n, et, lg, fu, an)
                        if an:   # el juego crece al ancho de sus huecos
                            nuevo = round(sum(an) + (n - 1) * PARED_SUB, 1)
                            p['A_envolvente_original'] = p['A']; p['A'] = nuevo
                            if p['rot']: p['w'] = nuevo
                            else: p['h'] = nuevo
                        for k, s in enumerate(p['subhuecos'], 1): s['activo'] = f"{p['activo']}-{k:02d}"
    # 2) matraca y dadera en lugar del estuche MATR
    c4, cj4 = idx[4]
    matr = [p for p in cj4['piezas'] if p['id'] == 'MATR'][0]
    cj4['piezas'] = [p for p in cj4['piezas'] if p['id'] != 'MATR']
    subs, L, A, H, peso = dadera()
    cj4['piezas'].append(dict(matr, activo='FTS-BAS-01-C4-01', id='MATRACA', ref=MATRACA['ref'], corto=MATRACA['corto'], L=MATRACA['L'], A=MATRACA['A'],
                              H=MATRACA['H'], peso_kg=MATRACA['peso_kg'], fuente_dim='D1', w=MATRACA['L'], h=MATRACA['A'], rot=False))
    dad = dict(matr, activo='FTS-BAS-01-C4-04', id='DADOS', ref='P7-P35', corto=f'Dadera: {len(subs)} dados de la caja P, cada uno en su hueco',
               L=L, A=A, H=H, peso_kg=peso, fuente_dim='D1', w=L, h=A, rot=False, subhuecos=subs)
    for k, s in enumerate(subs, 1): s['activo'] = f"FTS-BAS-01-C4-04-{k:02d}"
    cj4['piezas'].append(dad)
    # 3) 8420 -> 8410 + 8442
    c8420 = [c for c in b['cajas'] if c['modelo'] == '48-22-8420'][0]
    c8420['modelo'] = '48-22-8442'
    for cj in c8420['cajones']:
        cj.update({'alto': 127, 'alto_util': 117, 'ancho': 414, 'fondo': 318, 'cap_kg': 11.3})
        for p in cj['piezas']: p['x'], p['y'] = 6, 6
    b['base_rodante'] = {'modelo': '48-22-8410', 'ext_mm': [620, 480, 193], 'peso_kg': 5.0, 'fuente': OPCIONES['fuentes']['48-22-8410']}
    b['metricas']['alto_mm'] = 193 + 3 * 363
    b['metricas']['modelos'] = ['48-22-8410 (base plana)', '48-22-8442', '48-22-8444', '48-22-8443']
    b['metricas']['nota_8420'] = 'Bloque 1 de #343: 8420 sustituida por 8410 + 8442 (opcion b de datos/opciones_8420.json)'
    return True

if __name__ == '__main__':
    ruta = os.path.join(BASE, 'diseno_carrito.json')
    d = json.load(open(ruta, encoding='utf-8'))
    if aplicar(d):
        import interferencias_3d as I3
        b = d['modulos']['BASE']
        for c in b['cajas']:
            for cj in c['cajones']:
                if cj['n'] in (3, 4, 6, 8, 9):
                    ok = I3.reacomodar(cj)
                    if not ok:   # reacomodar deja el acomodo original si no encontro otro; ver si el original ya pasa
                        ok = not any(r['estado'] == 'FALLA' for r in I3.analizar(cj, cj['ancho'], cj['fondo'], cj['alto'])[0])
                        print('C%d: se queda el acomodo de antes,' % cj['n'], 'pasa sin fallas' if ok else 'CON FALLA: hay que mover una pieza')
                    else: print('reacomodo C%d sin fallas' % cj['n'])
                    cj['peso_kg'] = round(sum(p['peso_kg'] for p in cj['piezas']), 2)
                    cj['ocupacion'] = round(100 * sum(p['L'] * p['A'] for p in cj['piezas']) / (cj['ancho'] * cj['fondo']), 1)
                    cj['pie'] = [f"Modulo BASE · caja {c['modelo']} · cajon C{cj['n']} · alto interior {cj['alto']} mm, util {cj['alto_util']} mm",
                                 f"Ocupacion en planta {cj['ocupacion']} % · peso {cj['peso_kg']} kg de {cj['cap_kg']} kg",
                                 'Medidas no validadas: confirmar con vernier antes de imprimir']
        cjs = [cj for c in b['cajas'] for cj in c['cajones']]
        b['metricas'].update({'cajas': 3, 'peso_kg': round(sum(cj['peso_kg'] for cj in cjs), 1),
                              'ocupacion_media': round(sum(cj['ocupacion'] for cj in cjs) / len(cjs), 1),
                              'centro_gravedad_mm': None, 'nota_cg': 'ver datos/estabilidad.json (la pila cambio de base)'})
        json.dump(d, open(ruta, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(OPCIONES, open(os.path.join(D, 'opciones_8420.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    subs, L, A, H, peso = dadera()
    json.dump({'fecha': '2026-09-28', 'dados': [dict(zip(('ref', 'desc', 'sku_hd', 'largo_mm', 'diametro_mm', 'peso_hd_kg'), t)) for t in DADOS],
               'dadera': {'L': L, 'A': A, 'H': H, 'peso_kg': peso, 'huecos': len(subs)}, 'matraca': MATRACA,
               'juegos_en_regleta': {k: {'huecos': v[0], 'fuente': v[3], 'anchos_mm': v[4] if len(v) > 4 else None} for k, v in SUBS.items()},
               'nota_pesos': 'Los pesos de Home Depot son poco confiables (hay dados de 0.5 a 1 kg, que parecen pesos de empaque). Se usan tal cual para el chequeo de capacidad del cajon: queda del lado conservador.'},
              open(os.path.join(D, 'fuentes_piezas_individuales.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('dadera', L, 'x', A, 'x', H, 'mm,', len(subs), 'huecos,', peso, 'kg (HD)')
