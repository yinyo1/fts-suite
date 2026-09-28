"""Sesion nocturna 1 (issue #330) · validacion documental de contenedores y de las 91 piezas del diseno.

Salida: datos/validacion_documental.json  (una entrada por pieza, con nivel POR MEDIDA)
        datos/piezas_carrito.json          (L, A, H, peso actualizados; fuente_dim y nivel por medida)
        datos/contenedores.json            (cotas oficiales de cajon; nivel por cota)

Niveles (del mas fuerte al mas debil):
  V  validado            = 2 documentales + medicion fisica (esta sesion no tiene ninguna fisica)
  D2 documental doble    = 2 fuentes documentales que coinciden +-5 mm. Si la segunda es un distribuidor que
                           copia la ficha del fabricante (cifras identicas al decimal) se marca 'sindicada':
                           cuenta como doble pero NO es independiente.
  D1 documental simple   = 1 fuente documental (ficha, pagina de tienda leida hoy, medida nominal del nombre
                           comercial, o fragmento de buscador de la sesion anterior)
  F  estimacion desde foto
  X  faltante

Fuentes leidas hoy 2026-09-28 (pagina completa, no fragmento):
  MLK  = milwaukeetool.com/products/<parte>  (ficha del fabricante)
  CAT  = PACKOUT-2023-Dimension-Catalog.pdf (fabricante, leido como imagen)
  HDUS = homedepot.com (EUA)
  HDMX = homedepot.com.mx (precio con IVA)
  PREV = fragmento de buscador de la sesion anterior (datos/dimensiones_herramientas.json)
  NOM  = medida nominal del nombre comercial (p. ej. "11 in" = 279 mm, solo el largo)
Regla de empaque: si la tienda publica medidas de caja de envio o de tarjeta blister, se registran con
tipo 'empaque' y NO se usan para acomodo (skill investigacion-dimensiones, regla 6).
Regla de discrepancia: si dos documentales difieren mas de 5 mm se usa la MAYOR (conservador) y el nivel
baja a D1.
"""
import json, os
BASE = os.path.join(os.path.dirname(__file__), '..'); D = os.path.join(BASE, 'datos')
IN = 25.4
F = '2026-09-28'
U = {
 'MLK': 'https://www.milwaukeetool.com/products/{}',
 'HDUS': 'https://www.homedepot.com{}',
 'HDMX': 'https://www.homedepot.com.mx/p/{}',
}
def mm(x): return round(x * IN)

# ---------------------------------------------------------------- piezas
# id: (L, A, H) cada una = (valor_mm, nivel, 'fuente: detalle'); peso = (kg, 'fuente'); notas
def M(v, n, s): return {'v': v, 'nivel': n, 'fuente': s}
P = {}
def pieza(i, L, A, H, peso=None, nota='', empaque=None):
    P[i] = {'L': M(*L), 'A': M(*A), 'H': M(*H), 'peso': peso, 'nota': nota, 'empaque_descartado': empaque}

# ----- Carrito base (40)
for i, pn, blade in (('WIHA-DS1', '32101', 80), ('WIHA-DS2', '32102', 100), ('WIHA-DS3', '32012', 100), ('WIHA-DS4', '32023', 100)):
    pieza(i, (None, 'F', f'hoja {blade} mm por nombre (NOM); largo total estimado de foto A 2025-05-30'),
          (None, 'F', 'estimado de foto'), (None, 'F', 'estimado de foto'),
          nota=f'Wiha {pn}: ninguna pagina abierta publica largo total. HDUS vende el juego 32985 sin medidas por pieza. Medir con vernier.')
pieza('WIHA-PP', (160, 'D1', 'NOM 160 mm (32926 "160"); PREV transcat 160 (misma cifra nominal)'), (None, 'F', 'foto'), (None, 'F', 'foto'),
      nota='HDUS 32926 publica "Product Height 1.5 in" sin eje claro: no se usa.')
pieza('WIHA-PC', (160, 'D1', 'NOM 160 mm (32933)'), (None, 'F', 'foto'), (None, 'F', 'foto'))
pieza('WIHA-PE', (203, 'D2', 'NOM 200 mm (32930) + HDUS "8 in" = 203 mm; se usa 203'), (None, 'F', 'foto'), (None, 'F', 'foto'))
pieza('PREC6', (None, 'F', 'estuche estimado de foto'), (None, 'F', 'foto'), (None, 'F', 'foto'),
      nota='MLK 11.5 x 6 x 1.5 in y HDMX 29.21 x 15.36 x 5.84 cm son la tarjeta de venta, no el estuche.',
      empaque={'MLK': [292, 152, 38], 'HDMX': [292, 154, 58]})
pieza('MINIP', (127, 'D2', 'MLK 5 in = 127; HDMX 12.7 cm'), (60, 'D1', 'MLK 2 in = 51; HDMX 6 cm = 60: difieren 9 mm, se usa 60'),
      (13, 'D2', 'MLK 0.5 in = 13; HDMX 1.27 cm'), peso=(0.08, 'HDMX 0.080 kg (MLK 0.13 lb = 0.059)'))
for i in ('HDS-A', 'HDS-B', 'HDS-C', 'HDS-D'):
    pieza(i, (None, 'F', 'grupo de 3 desarmadores Husky, foto I 2025-07-03'), (None, 'F', 'foto'), (None, 'F', 'foto'),
          nota='El listado trae el mismo numero 246340150 para 12 desarmadores distintos: no es numero de parte util.')
pieza('PELEC', (250, 'D1', 'HDMX 709195: 25 cm; NOM 9 in = 229 (difieren 21 mm, se usa 250)'), (50, 'D1', 'HDMX 5 cm'), (15, 'D1', 'HDMX 1.5 cm'),
      peso=(0.515, 'HDMX'))
pieza('PDIAG', (178, 'D2', 'HDMX 903465: 17.8 cm; NOM 7 in = 178'), (58, 'D1', 'HDMX 5.8 cm'), (17, 'D1', 'HDMX 1.7 cm'), peso=(0.306, 'HDMX'))
pieza('PRES11', (279, 'D2', 'NOM 11 in = 279; PREV tenaquip 279'), (None, 'F', 'foto L 2025-07-03'), (None, 'F', 'foto'),
      nota='MLK 14.4 x 6.75 x 0.75 in y HDMX 37.6 x 17.3 x 2.5 cm son la tarjeta de venta.', empaque={'MLK': [366, 171, 19], 'HDMX': [376, 173, 25]})
pieza('PRES7', (182, 'D2', 'HDMX 709207: 18.2 cm; NOM 7 in = 178 (4 mm)'), (62, 'D1', 'HDMX 6.2 cm'), (23, 'D1', 'HDMX 2.3 cm'), peso=(0.364, 'HDMX'))
pieza('PRES6C', (152, 'D2', 'NOM 6 in = 152; PREV rshughes 152'), (None, 'F', 'foto'), (None, 'F', 'foto'),
      nota='MLK 12.9 x 4.3 x 0.6 in y HDMX 24.9 x 11 x 1.52 cm son tarjeta de venta.', empaque={'MLK': [328, 109, 15], 'HDMX': [249, 110, 15]})
pieza('PRES10', (254, 'D1', 'NOM 10 in = 254; HDMX 709204 publica 22.6 cm (28 mm menos), se usa 254'), (66, 'D1', 'HDMX 6.6 cm'), (26, 'D1', 'HDMX 2.6 cm'),
      peso=(0.569, 'HDMX'))
pieza('AJ12', (305, 'D2', 'NOM 12 in = 305; HDMX 17018: 30 cm'), (78, 'D1', 'HDMX 7.8 cm'), (20, 'D1', 'HDMX 2 cm'), peso=(0.777, 'HDMX'))
pieza('AJ8', (205, 'D2', 'HDMX 17016: 20.5 cm; NOM 8 in = 203'), (56, 'D1', 'HDMX 5.6 cm'), (15, 'D1', 'HDMX 1.5 cm'), peso=(0.302, 'HDMX'))
pieza('CHOF8', (203, 'D2', 'HDMX PCH-8: 20.3 cm; NOM 8 in'), (50, 'D1', 'HDMX 5 cm'), (15, 'D1', 'HDMX 1.5 cm'), peso=(0.292, 'HDMX'),
      nota='El listado dice Truper 17301; en HDMX el articulo equivalente es PCH-8 (sku 248697). Leer la pieza.')
for i in ('FLEX1', 'FLEX2'):
    pieza(i, (70, 'D2', 'PREV claroshop + ferrepat (fragmentos): 70'), (60, 'D2', 'PREV: 60'), (40, 'D2', 'PREV: 40'),
          nota='Stanley 30-615: HDMX ya no lo lista (busqueda por sku 237599 sin resultado). Los dos documentales son fragmentos.')
pieza('COMB7', (245, 'D1', 'HDMX HRRW7PCSAEMX: 24.5 cm (con su riel)'), (175, 'D1', 'HDMX 17.5 cm'), (45, 'D1', 'HDMX 4.5 cm'), peso=(1.0, 'HDMX'))
pieza('MATR', (None, 'F', 'juego matraca + dados, foto P'), (None, 'F', 'foto'), (None, 'F', 'foto'),
      nota='HDMX matraca H38ROTORATMX sola: 24 x 4.2 x 3.4 cm. El juego completo no tiene ficha.')
pieza('EXTS', (None, 'F', 'foto P'), (None, 'F', 'foto'), (None, 'F', 'foto'))
pieza('ADAP', (None, 'F', 'foto'), (None, 'F', 'foto'), (None, 'F', 'foto'), nota='HDMX 106475 9.8 x 7.2 x 1.9 cm es la tarjeta.',
      empaque={'HDMX': [98, 72, 19]})
for i in ('MART', 'MART2'):
    pieza(i, (340, 'D1', 'PREV truper.com 340; HDMX MA-16F 33.5 cm (5 mm), se usa 340'), (130, 'D1', 'HDMX 13 cm'), (30, 'D1', 'HDMX 3 cm'),
          peso=(0.707, 'HDMX + PREV truper'))
pieza('NAVAJA', (224, 'D1', 'HDMX 99735A: 22.4 cm (el nombre del listado viene de la misma pagina)'), (88, 'D1', 'HDMX 8.8 cm'), (20, 'D1', 'HDMX 2 cm'),
      peso=(0.11, 'HDMX'))
pieza('TAZON', (150, 'D1', 'HDMX 129-291: 15 cm'), (150, 'D1', 'HDMX 15 cm'), (40, 'D1', 'HDMX 4 cm'), peso=(0.323, 'HDMX'))
for i in ('TORPEDO', 'TORPEDO2'):
    pieza(i, (230, 'D1', 'HDMX 10790: 23 cm (PREV es la misma pagina)'), (45, 'D1', 'HDMX 4.5 cm'), (16, 'D1', 'HDMX 1.6 cm'), peso=(0.138, 'HDMX'))
pieza('VERN', (237, 'D1', 'PREV truper.com CALDI-6MP 237'), (None, 'F', 'foto E'), (None, 'F', 'foto'))
pieza('BROCAS', (None, 'F', 'foto G'), (None, 'F', 'foto'), (None, 'F', 'foto'))
pieza('ESCAL', (None, 'F', 'foto G'), (None, 'F', 'foto'), (None, 'F', 'foto'))
pieza('IMP14', (196, 'D2', 'MLK 3650-20 Height 7.7 in; HDUS 7.7 in (sindicada)'), (112, 'D2', 'MLK Length 4.4 in; HDUS 4.4'),
      (53, 'D2', 'MLK Width 2.1 in; HDUS 2.1'), peso=(0.771, 'MLK 1.7 lb sin bateria'),
      nota='HDMX 24.1 x 13.69 x 9.91 cm es la caja.', empaque={'HDMX': [241, 137, 99]})
pieza('IMP38', (202, 'D2', 'MLK 2854-20 Height 7.95 in; HDUS 7.95 (sindicada)'), (122, 'D2', 'MLK Length 4.8 in; HDUS 4.8'),
      (65, 'D2', 'MLK Width 2.56 in; HDUS 2.56'), peso=(1.089, 'MLK 2.4 lb sin bateria'))
pieza('ROTO18', (202, 'D2', 'MLK 3602-20 Height 7.95 in; HDUS 7.95 (sindicada)'), (147, 'D2', 'MLK Length 5.8 in; HDUS 5.8'),
      (56, 'D2', 'MLK Width 2.2 in; HDUS 2.2'), peso=(1.043, 'MLK 2.3 lb sin bateria'),
      nota='Antes 202 x 170 x 75 (fragmento). La ficha da cabeza de 5.8 in; parece corta para un rotomartillo con broquero: medir.')
for i in ('BAT1', 'BAT2'):
    pieza(i, (118, 'D1', 'MLK 48-11-1820 Length 4.66 in'), (79, 'D1', 'MLK Width 3.12 in'), (55, 'D1', 'MLK Height 2.15 in'),
          peso=(0.431, 'MLK 0.95 lb'), nota='HDUS 6.77 x 3.4 x 2.75 in y HDMX 10.2 x 8.4 x 8.4 cm son empaque.',
          empaque={'HDUS': [172, 86, 70], 'HDMX': [102, 84, 84]})
pieza('CARG1', (202, 'D2', 'MLK 48-59-1812 Height 7.95 in; HDUS 7.95 (sindicada)'), (155, 'D2', 'MLK Length 6.1 in; HDUS 6.1'),
      (87, 'D2', 'MLK Width 3.42 in; HDUS 3.42'), peso=(0.912, 'MLK 2.01 lb'),
      nota='Antes 150 x 100 x 70 y 0.4 kg (estimacion): el cargador es mas grande. HDMX 30 x 22 x 11.5 cm es la caja.',
      empaque={'HDMX': [300, 220, 115]})
for i in ('ESM45', 'ESM45B'):
    pieza(i, (357, 'D2', 'MLK 6130-33 Width 14.05 in; HDMX 35.69 cm (sindicada)'), (152, 'D2', 'MLK Height 6 in; HDMX 15.24 cm'),
          (90, 'D2', 'MLK Length 3.55 in; HDMX 9.02 cm'), peso=(1.588, 'MLK 3.5 lb'),
          nota='HDUS publica 10.5 x 3.2 x 3.2 in (cuerpo sin mango lateral). Se usa la medida CON mango lateral puesto (conservador). '
               'Si se decide guardarla sin mango, el largo baja a 267 mm y el mango va aparte.')

# ----- Electrico
pieza('FLUKE', (207, 'D2', 'PREV itm.com PDF + manualslib (manual Fluke 302+)'), (75, 'D2', 'PREV'), (34, 'D2', 'PREV'), peso=(0.265, 'PREV manual'))
pieza('MAPPER', (125, 'D2', 'PREV farnell + tequipment'), (52, 'D2', 'PREV'), (30, 'D2', 'PREV'), peso=(0.13, 'PREV'))
pieza('PELA', (None, 'F', 'foto A; NOM 6 in = 152 solo de la parte metalica'), (None, 'F', 'foto'), (None, 'F', 'foto'),
      nota='HDMX CE100821 publica ancho 10.5 y fondo 2.5 cm, sin largo: incompleto.')
for i in ('CRIMP', 'EXTECH', 'PONCH', 'DETV', 'SACAB'):
    pieza(i, (None, 'F', 'foto o estimacion'), (None, 'F', ''), (None, 'F', ''))
pieza('KO', (582, 'D1', 'MLK 2677-23 kit (estuche) Length 22.9 in'), (284, 'D1', 'MLK Width 11.2 in'), (429, 'D1', 'MLK Height 16.9 in'),
      nota='Es el estuche del kit, va suelto. Peso del kit en MLK 50.6 lb parece error de captura (herramienta 4.3 lb).')
# ----- Soldadura
pieza('ESCMAG', (None, 'F', 'foto Q o R'), (None, 'F', ''), (None, 'F', ''))
pieza('PRES11B', P['PRES11']['L'].values(), P['PRES11']['A'].values(), P['PRES11']['H'].values())
pieza('PRES6CB', P['PRES6C']['L'].values(), P['PRES6C']['A'].values(), P['PRES6C']['H'].values())
pieza('PRES10B', P['PRES10']['L'].values(), P['PRES10']['A'].values(), P['PRES10']['H'].values(), peso=(0.569, 'HDMX'))
pieza('PRES7B', P['PRES7']['L'].values(), P['PRES7']['A'].values(), P['PRES7']['H'].values(), peso=(0.364, 'HDMX'))
for i in ('RECT', 'MOTO', 'MACH', 'EXTOR', 'EXTQ', 'FRESA', 'COMB10', 'TORX', 'CINC', 'MANGOS', 'CAB34', 'CAIMAN', 'AMARRE', 'GRILL'):
    pieza(i, (None, 'F', 'foto o estimacion'), (None, 'F', ''), (None, 'F', ''))
P['EXTOR']['nota'] = 'PREV truper.com 180 x 130 x 20 es blister (empaque).'
P['EXTQ']['nota'] = 'PREV urrea.com 300 x 160 x 50 es empaque; ademas el modelo 4212 contra 4216 sigue abierto (factura).'
P['COMB10']['nota'] = 'HDMX HBCW10XLS no publica medidas.'
P['TORX']['nota'] = 'HDMX HFHK3PCSETMX publica 6.7 x 5.11 x 1.5 cm: incoherente para 3 llaves tipo navaja. No se usa.'
pieza('LIMAS', (250, 'D1', 'HDMX lima triangular 64091081BL 24.4 cm; redonda 6400406F1BL 19.5 cm (grupo de 3, se usa 250)'),
      (None, 'F', 'grupo'), (None, 'F', 'grupo'))
pieza('SEGUETA', (475, 'D1', 'HDMX 15-555: 47.5 cm (puede ser empaque; arco ajustable 8-10-12 in)'), (134, 'D1', 'HDMX 13.4 cm'), (24, 'D1', 'HDMX 2.4 cm'),
      peso=(0.688, 'HDMX'), nota='Si 475 mm es real no cabe en ningun cajon (414 mm): el acomodo la manda a soporte lateral. Medir con el arco en 10 in.')
# ----- Tuberia
for i in ('STILL1', 'STILL2'):
    pieza(i, (356, 'D1', 'NOM 14 in = 356; HDMX 73126 publica 32.5 cm (31 mm menos), se usa 356'), (83, 'D1', 'HDMX 8.3 cm'), (32, 'D1', 'HDMX 3.2 cm'),
          peso=(1.52, 'HDMX'))
for i in ('NIVTUB1', 'NIVTUB2'):
    pieza(i, (159, 'D2', 'MLK 48-22-5110 Length 6.25 in; HDUS 6.25 (sindicada)'), (51, 'D1', 'MLK Height 2 in'), (19, 'D2', 'MLK Width 0.75 in; HDUS 0.75'),
          peso=(0.141, 'MLK 0.311 lb'), nota='HDMX 26.7 x 8.26 x 2.74 cm es la tarjeta.', empaque={'HDMX': [267, 83, 27]})
pieza('12R', (None, 'F', 'estuche Ridgid en foto O'), (None, 'F', ''), (None, 'F', ''), peso=(15.762, 'PREV cf-t.com'))
# ----- Obra civil
pieza('SDS', (335, 'D1', 'HDMX 5485-21: 33.5 cm'), (195, 'D1', 'HDMX 19.5 cm'), (75, 'D1', 'HDMX 7.5 cm'), peso=(3.034, 'HDMX'),
      nota='MLK no abre la ficha 5485-21 (pagina sin especificaciones).')
pieza('TAL12', (340, 'D1', 'HDMX 5375-20: 34.01 cm (con mango lateral)'), (265, 'D1', 'HDMX 26.49 cm'), (86, 'D1', 'HDMX 8.61 cm'), peso=(3.13, 'HDMX'),
      nota='Antes 292 (PREV). Se usa la de HDMX por ser mayor.')
pieza('SDSBIT', (None, 'F', 'estuche en foto G'), (None, 'F', ''), (None, 'F', ''), nota='HDMX DWA0870 publica 103.2 x 24.2 x 65.3 cm: error de captura.')
pieza('CALAD', (279, 'D1', 'HDMX JS481LG: 27.94 cm (posible empaque)'), (236, 'D1', 'HDMX 23.62 cm'), (72, 'D1', 'HDMX 7.2 cm'), peso=(2.0, 'HDMX'))
pieza('LIJA', (267, 'D2', 'MLK 2648-20 Length 10.5 in; HDUS 10.50 (sindicada)'), (146, 'D2', 'MLK Height 5.74 in; HDUS 5.74'),
      (125, 'D2', 'MLK Width 4.92 in; HDUS 4.92'), peso=(1.225, 'MLK 2.7 lb'))
pieza('SABLE', (483, 'D1', 'MLK 6509-31 Length 19 in (herramienta; va en estuche)'), (133, 'D1', 'MLK Height 5.25 in'), (114, 'D1', 'MLK Width 4.5 in'),
      peso=(3.221, 'MLK 7.1 lb'), nota='El sku HDMX 474409 del listado hoy corresponde a la 6519-31. Leer la placa.')
pieza('MAZO', (357, 'D1', 'HDMX MH-16: 35.7 cm; PREV truper 340 (17 mm), se usa 357'), (104, 'D1', 'HDMX 10.4 cm'), (51, 'D1', 'HDMX 5.1 cm'), peso=(0.649, 'HDMX'))
# ----- Medicion
for i in ('LASER', 'LASER2'):
    pieza(i, (100, 'D2', 'HDMX GLL 12-22 G 10 cm; PREV bosch-professional 100'), (64, 'D2', 'HDMX 6.4; PREV 64'), (104, 'D1', 'HDMX 10.4 cm (PREV 100), se usa 104'),
          peso=(0.35, 'HDMX'), nota='LASER2 supone el mismo modelo: confirmar.' if i == 'LASER2' else '')
pieza('ESCCOMB', (304, 'D1', 'HDMX 220IM: 30.4 cm'), (133, 'D1', 'HDMX 13.3 cm'), (None, 'F', 'HDMX dice 1.9 cm; la cabeza mide mas, se estima'), peso=(0.35, 'HDMX'))
pieza('ESCCAR', (304, 'D1', 'HDMX EC-12: 30.4 cm'), (166, 'D1', 'HDMX 16.6 cm'), (14, 'D1', 'HDMX 1.4 cm'), peso=(0.228, 'HDMX'))

# ---------------------------------------------------------------- aplicar
def aplicar():
    piezas = json.load(open(os.path.join(D, 'piezas_carrito.json'), encoding='utf-8'))
    cambios, val = [], []
    for p in piezas:
        e = P.get(p['id'])
        if not e:
            raise SystemExit(f'sin entrada de validacion: {p["id"]}')
        antes = (p['L'], p['A'], p['H'], p['peso_kg'])
        niveles = {}
        for k in ('L', 'A', 'H'):
            m = e[k]
            if m['v'] is not None:
                p[k] = m['v']
            niveles[k] = m['nivel']
        if e['peso']:
            p['peso_kg'] = e['peso'][0]
        p['nivel_dim'] = niveles
        p['fuente_dim'] = max(niveles.values(), key=['V', 'D2', 'D1', 'F', 'X'].index)  # el nivel mas debil de sus 3 medidas
        p['validado'] = all(n == 'V' for n in niveles.values())
        despues = (p['L'], p['A'], p['H'], p['peso_kg'])
        if antes != despues:
            cambios.append({'id': p['id'], 'ref': p['ref'], 'desc': p['desc'], 'modulo': p['modulo'], 'antes': antes, 'despues': despues,
                            'motivo': '; '.join(f'{k}: {e[k]["fuente"]}' for k in ('L', 'A', 'H') if e[k]['v'] is not None and e[k]['v'] != antes['LAH'.index(k)])
                                      + (f'; peso: {e["peso"][1]}' if e['peso'] and e['peso'][0] != antes[3] else '')})
        val.append({'id': p['id'], 'ref': p['ref'], 'desc': p['desc'], 'modulo': p['modulo'], 'L': e['L'], 'A': e['A'], 'H': e['H'],
                    'peso': e['peso'], 'nota': e['nota'], 'empaque_descartado': e['empaque_descartado'], 'fecha': F})
    json.dump(piezas, open(os.path.join(D, 'piezas_carrito.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump({'fecha': F, 'niveles': {'V': 'validado', 'D2': 'documental doble', 'D1': 'documental simple', 'F': 'estimacion desde foto', 'X': 'faltante'},
               'piezas': val, 'cambios': cambios}, open(os.path.join(D, 'validacion_documental.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return piezas, val, cambios

def resumen(val, modulo=None):
    from collections import Counter
    c = Counter()
    for v in val:
        if modulo and v['modulo'] != modulo: continue
        for k in ('L', 'A', 'H'): c[v[k]['nivel']] += 1
    tot = sum(c.values())
    return {n: (c[n], round(100 * c[n] / tot, 1)) for n in ('V', 'D2', 'D1', 'F', 'X')}, tot

if __name__ == '__main__':
    piezas, val, cambios = aplicar()
    print('piezas', len(val), 'cambios', len(cambios))
    print('todas', resumen(val)); print('BASE', resumen(val, 'BASE'))
    for c in cambios: print(c['id'], c['antes'], '->', c['despues'])
