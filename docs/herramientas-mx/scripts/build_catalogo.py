"""Fase 1 · Construye catalogo_maestro.xlsx (Piezas, Fuentes, Discrepancias, Decisiones, Compras_Odoo).

Entradas (todas en docs/herramientas-mx/datos/):
  listado_principal_2025.tsv      hoja "Listado principal" de OneDrive (193 renglones reales)
  odoo_compras_herramienta.tsv    purchase.order.line company 1 desde 2024, clasificadas
  dimensiones_herramientas.json   medidas investigadas (skill investigacion-dimensiones), opcional
Correr:  python3 docs/herramientas-mx/scripts/build_catalogo.py
"""
import csv, json, os, re
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

BASE = os.path.join(os.path.dirname(__file__), '..')
D = os.path.join(BASE, 'datos')
FECHA = '2026-09-28'

def tsv(name):
    with open(os.path.join(D, name), encoding='utf-8') as f:
        return list(csv.DictReader(f, delimiter='\t', quoting=csv.QUOTE_NONE, restval=''))

listado = tsv('listado_principal_2025.tsv')
compras = tsv('odoo_compras_herramienta.tsv')
dims = {}
p = os.path.join(D, 'dimensiones_herramientas.json')
if os.path.exists(p):
    for r in json.load(open(p, encoding='utf-8')):
        for k in {r.get('numero_parte'), r.get('numero_parte_corregido')}:
            if k:
                dims[re.sub(r'[\s\-]', '', str(k)).upper()] = r

# --- Evidencia fotografica (SharePoint fts.mx/Proyecto Herramientas MX/01 Fotos Packout anteriores) ---
FOTOS = {
 'A': '2025-02-18 armado original; 2025-05-30; 2025-01-25 en planta Santa Catarina',
 'B': '2025-05-30 incompleta (sin B1, B4); 2025-07-03 completa',
 'C': '2025-07-03', 'E': '2025-03-28', 'F': '2025-07-03',
 'G': '2025-03-28 completa; 2025-08-05 suelta en caja de camioneta junto a arnes',
 'H': '2025-03-28', 'I': '2025-07-03 (falta I2); 2025-01-25 en planta',
 'J': '2025-07-03; 2025-01-25 en planta', 'K': '2025-07-03; 2025-01-25 en planta',
 'L': '2025-07-03 (falta L4); 2025-01-25 en planta',
 'O': '2025-07-03', 'P': '2025-03-28 incompleta; 2025-07-03 completa; 2025-01-25 en planta',
 'Q': '2025-07-03 (foto "Q o R")',
}
SIN_FOTO = {'D', 'M', 'N', 'S'}
# Faltantes vistos en la ultima foto de la caja
FALTA_EN_FOTO = {'I2': 'hueco vacio en foto 2025-07-03', 'L4': 'hueco vacio en foto 2025-07-03'}
# Piezas vistas en foto en OTRA caja
UBIC_OBS = {'R1': 'E (foto E 2025-03-28)', 'R2': 'Q (foto "Q o R" 2025-07-03, junto a Q3 y Q4)'}
# Piezas del listado con evidencia en foto fuera de caja
FOTO_SUELTA = {'TPC10': '2025-07-03; 2026-01-02', 'TPC8': '2025-07-03 en estuche original',
               'TPC1': '2025-07-03 (estuche 2874-22HD en vista general)',
               'TPC3': '2025-07-03 (vista general, arriba de la torre derecha)',
               'S0': '2025-07-03 (vista general, base de la torre derecha)'}

# --- Correcciones de numero de parte (fuente de cada una en hoja Decisiones) ---
PN_FIX = {
 '285420': ('2854-20', 'Foto B 2025-07-03 muestra llave de impacto M18 FUEL 3/8 (etiqueta B2). 285420 es el numero sin guion.'),
 '613033': ('6130-33', 'Odoo P01829 y P04279: "[6130-33] MINI ESMERIL"; es el mismo numero con guion.'),
 '48111820': ('48-11-1820', 'Numero Milwaukee con guiones.'),
 '48223531': ('48-22-3531', 'Numero Milwaukee con guiones; grabado "48-22-3531" visible en foto L.'),
 '48225110': ('48-22-5110', 'Numero Milwaukee con guiones.'),
 '2729-20': ('2929-22 (verificar)', 'Odoo P02408: "[292922] SIERRA DE BANDA DE CORTE PROFUNDO" $9,153. El listado dice 2729-20 (generacion anterior, solo herramienta).'),
 'BUSCAR EN FACTURA': (None, 'Sin numero en el listado; el SKU Home Depot existe. Pedir ticket o leer la etiqueta de la herramienta.'),
}
WIHA_PIEZA = {'A2': ('32101', 'PH1 x 80'), 'A3': ('32102', 'PH2 x 100'), 'A11': ('32012', 'plano 3.0 x 100 (la descripcion del listado trae medidas cruzadas con A12)'),
              'A12': ('32023', 'plano 4.5 x 100 (medidas cruzadas con A11)'), 'A10': ('32926', 'pinza de punta 160 = Z 05 0 09 160'),
              'A8': ('32933', 'pinza de corte diagonal 160 = Z 12 0 09 160'), 'A9': ('32930', 'pinza combinada 200 = Z 01 0 09 200')}
PN_FIX['4212'] = ('4216 (verificar factura)', 'Urrea: 6 t, 20 piezas sin caja corresponde al 4216; el 4212SJB de Odoo P01890 trae 14-15 piezas (snippet de buscador). Leer factura.')
WIHA_SET = ('32985', 'Wiha 32985 es el numero del JUEGO de 7 piezas aisladas 1000 V (Odoo P05324 y P05743: "WIHA PINZAS AISLADAS JGO 7PZS 1000V 32985"). Las 7 filas A2,A3,A8-A12 son piezas del juego; no es un error de captura, falta el numero de cada pieza.')

def energia(desc, pn):
    d = desc.upper()
    if re.search(r'\bM18\b|INALAMBRIC|IMPACTO|BATERIA|PILA M18|2854|3650|3602|2648|0970|2874|2677|2729|2929|SPEAKER|CARGADOR', d + ' ' + pn):
        return 'inalambrica_M18' if 'SPEAKER' not in d else 'inalambrica_M12'
    if re.search(r'ALAMBRIC|ROTOMARTILLO|CALADORA|ESMERIL|SIERRA SABLE|800 WATTS|12 AMP|7 AMP', d):
        return 'electrica_alambrica'
    if re.search(r'LASER|MAPPER|FLUKE|VERNIER|CALIBRADOR|NIVEL|FLEXOMETRO|ESCUADRA DE ACERO', d):
        return 'medicion'
    if re.search(r'CAJA|PACKOUT|CRATE|PLACA DE MONTAJE', d):
        return 'contenedor'
    return 'mano'

def familia(desc):
    d = desc.upper()
    reglas = [
        ('contenedor', r'CAJA DE ALMACENAMIENTO|CAJA DE HERRAMIENTA|CAJA PACKOUT|PACKOUT 18.6|PLACA DE MONTAJE|BAUL|ESTANTER|ENCIMERA'),
        ('electrico', r'DETECTOR DE VOLTAJE|WIHA|PELACABLE|CLIMPADORA|AMPERIMETRO|MAPPER|DESTORNILLADORES DE PRECISI|MINI PINZAS|KNOCKOUT|DESARMADRO ESTRELLA DE 2'),
        ('tuberia', r'PRENSA DE TUBO|CABEZAL 12R|PVC|TARRAJA|LLAVE PARA TUBO|ROSCADORA|NIVELADOR FIJABLE PARA TUBER'),
        ('soldadura_metalmecanica', r'RECTIFICADOR|MOTO TOOL|PRESI[OÓ]N|ESCUADRA MAGN|LIMA|SIERRA DE BANDA|HOJAS DE SIERRA|MACHUELO|SACABOCADO|EXTRACTOR|FRESA'),
        ('perforacion_corte', r'CORTAPERNO|TALADRO|ROTOMARTILLO|BROCA|CINCEL|ESMERIL|CALADORA|SIERRA SABLE|SEGUETTA|LIJADORA|MANGO LATERAL'),
        ('inalambricas_energia', r'COMBO M18|IMPACTO|BATERIA|PILA|CARGADOR|DESTORNILLADOR DE IMPACTO|SPEAKER'),
        ('medicion_trazo', r'NIVEL|LASER|L[AÁ]SER|ESCUADRA|VERNIER|CALIBRADOR|FLEX[OÓ]METRO'),
        ('izaje_amarre', r'AMARRE|BANDA PARA MATRACA|GRILLETE'),
        ('mecanica_general', r'DADO|LLAVE|PINZA|DESARMADOR|MARTILLO|MAZO|ADAPTADOR|EXTENSI|PALANCA|NAVAJA|TAZON|ACEITERA'),
        ('limpieza', r'ASPIRADORA|VACUUM'),
    ]
    for fam, rx in reglas:
        if re.search(rx, d):
            return fam
    return 'otros'

def dimkey(pn):
    return re.sub(r'[\s\-]', '', str(pn or '')).upper()

piezas, disc, dec = [], [], []
def D_(tipo, ref, detalle, fuente, accion, dueno):
    disc.append([len(disc) + 1, tipo, ref, detalle, fuente, accion, dueno])

vistos_num = {}
for r in listado:
    caja, num, desc = r['caja'].strip(), r['numero_interno'].strip(), ' '.join(r['descripcion'].split())
    pn = r['numero_parte'].strip()
    num_norm = num.replace(',', '.').replace(' ', '')
    clas, nota = [], []
    # numeros internos
    if not num:
        num_norm = f'{caja}-SN{r["fila"]}'
        clas.append('duplicada')
        nota.append('sin numero interno; cincel igual a H9/H10 (foto H 2025-03-28 muestra los cinceles en H, foto E no muestra cinceles)')
    if caja == 'E' and num == '2':
        num_norm = 'E4'
        nota.append('numero "2" corregido a E4: la secuencia de E salta de E3 a E5')
    if num_norm == 'Q2':
        clas.append('duplicada'); nota.append('mismo Micro Mapper que E8: Odoo registra 1 sola compra (P01841)')
    if num_norm in vistos_num:
        clas.append('duplicada'); nota.append(f'numero repetido con fila {vistos_num[num_norm]}')
    vistos_num[num_norm] = r['fila']
    # numero de parte
    pn_corr, pn_nota = pn, ''
    if pn == '32985':
        wp = WIHA_PIEZA.get(num_norm)
        pn_corr = wp[0] if wp else '32985 (juego)'
        pn_nota = ('pieza del juego Wiha 32985: ' + wp[1] + ' (numero de pieza por snippet de buscador, no validado)') if wp else 'pieza del juego Wiha 32985'
    elif pn in PN_FIX:
        pn_corr = PN_FIX[pn][0]; pn_nota = PN_FIX[pn][1]
    elif pn.replace(' ', '') in PN_FIX:
        pn_corr = PN_FIX[pn.replace(' ', '')][0]; pn_nota = PN_FIX[pn.replace(' ', '')][1]
    if not pn:
        pn_nota = 'sin numero de parte en el listado'
    # clasificacion por evidencia
    es_caja = pn == '48-22-8450' or pn == '48-22-8426'
    if 'duplicada' not in clas:
        if num_norm in FALTA_EN_FOTO:
            clas.append('en_listado_sin_evidencia'); nota.append(FALTA_EN_FOTO[num_norm])
        elif num_norm in FOTO_SUELTA:
            clas.append('en_listado_y_existe')
        elif caja in FOTOS or num_norm in UBIC_OBS:
            clas.append('en_listado_y_existe')
        elif caja in SIN_FOTO:
            clas.append('en_listado_sin_evidencia'); nota.append(f'no hay foto de la caja {caja}')
        else:
            clas.append('en_listado_sin_evidencia'); nota.append('sin foto')
    if caja == 'COMPRAR':
        nota.append('marcado COMPRAR en el listado pero Odoo P02408 (2025-03-04) lo muestra comprado y recibido')
    precio = r['precio_mxn'].strip()
    precio_v = None if precio in ('', '-') else float(precio)
    dm = dims.get(dimkey(pn_corr.split(' ')[0] if pn_corr else '')) or dims.get(dimkey(pn))
    piezas.append({
        'numero_interno': num_norm, 'numero_interno_listado': num, 'fila_listado': int(r['fila']),
        'caja_listado': caja, 'ubicacion_observada': UBIC_OBS.get(num_norm, caja if caja in FOTOS else ''),
        'descripcion': desc, 'marca': r['marca'].strip(), 'numero_parte_listado': pn,
        'numero_parte_corregido': pn_corr, 'nota_numero_parte': pn_nota, 'sku_tienda': r['sku'].strip(),
        'tipo_energia': energia(desc, pn), 'familia': familia(desc),
        'precio_listado_mxn': precio_v, 'proveedor': r['proveedor'].strip(), 'folio': r['folio'].strip(),
        'link_referencia': r['link'].strip(), 'evidencia_foto': FOTO_SUELTA.get(num_norm) or FOTOS.get(caja, ''),
        'clasificacion': clas[0], 'notas': '; '.join(nota),
        'L_mm': dm.get('L_mm') if dm else None, 'A_mm': dm.get('A_mm') if dm else None,
        'H_mm': dm.get('H_mm') if dm else None, 'peso_kg': dm.get('peso_kg') if dm else None,
        'dim_tipo': dm.get('dim_tipo') if dm else None,
        'validacion_dim': (dm.get('validacion') if dm else 'no encontrado') + ' · sin medicion fisica',
        'foto_ref_url': dm.get('foto_url') if dm else None,
    })

# --- Piezas que existen (foto u Odoo) y NO estan en el listado ---
EXTRA = [
 ('X-Q3b', 'Q', 'ESCUADRA MAGNETICA PARA SOLDAR (adicional)', 'TRUPER', '15407', 'foto "Q o R" 2025-07-03 muestra 4 escuadras; el listado tiene 1 (Q3)', 'comprada_no_listada'),
 ('X-Q3c', 'Q', 'ESCUADRA MAGNETICA PARA SOLDAR (adicional)', 'TRUPER', '15407', 'idem', 'comprada_no_listada'),
 ('X-Q3d', 'Q', 'ESCUADRA MAGNETICA PARA SOLDAR (adicional)', 'TRUPER', '15407', 'idem', 'comprada_no_listada'),
 ('X-G5', 'G', 'PIEZA CON ETIQUETA G5 (no identificada)', '', '', 'foto G 2025-08-05 muestra etiquetas hasta G7; el listado llega a G4', 'comprada_no_listada'),
 ('X-G6', 'G', 'PORTABROCAS CON ETIQUETA G6 (juego de brocas)', '', '', 'foto G 2025-08-05', 'comprada_no_listada'),
 ('X-G7', 'G', 'PORTABROCAS CON ETIQUETA G7 (juego de brocas)', '', '', 'foto G 2025-08-05 (dos portabrocas con G7)', 'comprada_no_listada'),
 ('X-C3b', 'C', 'MANGO LATERAL (segundo)', 'MILWAUKEE', '', 'foto C 2025-07-03: dos mangos con etiqueta C3', 'comprada_no_listada'),
 ('X-8424a', 'S/N', 'CAJA DE HERRAMIENTAS PACKOUT 22 in', 'MILWAUKEE', '48-22-8424', 'Odoo P01829 (2025-01-17, recibida)', 'comprada_no_listada'),
 ('X-8424b', 'S/N', 'CAJA DE HERRAMIENTAS PACKOUT 22 in', 'MILWAUKEE', '48-22-8424', 'Odoo P02098 (2025-02-06, qty_recibida 0)', 'comprada_no_listada'),
 ('X-8427', 'S/N', 'CAJA DE HERRAMIENTA RODANTE PACKOUT', 'MILWAUKEE', '48-22-8427', 'Odoo P05566 (2026-02-04, qty_recibida 0)', 'comprada_no_listada'),
 ('X-8447', 'S/N', 'CAJA PACKOUT 3 CAJONES PROFUNDIDAD MULTIPLE', 'MILWAUKEE', '48-22-8447', 'Odoo P05566 (2026-02-04, qty_recibida 0) · ya es un modulo de cajones', 'comprada_no_listada'),
 ('X-4CAJ', 'S/N', 'CAJA PACKOUT 4 CAJONES', 'MILWAUKEE', '48-22-8444 (probable)', 'Odoo P03220 (2025-04-28, $3,614, qty_recibida 0) · ya es un modulo de cajones', 'comprada_no_listada'),
 ('X-8480', 'S/N', 'KIT DE ESTANTERIA PACKOUT', 'MILWAUKEE', '48-22-8480', 'Odoo P03220 (2025-04-28)', 'comprada_no_listada'),
 ('X-ENC', 'S/N', 'ENCIMERA PERSONALIZABLE PACKOUT (2)', 'MILWAUKEE', '', 'Odoo P02736 (2025-03-19, qty_recibida 0)', 'comprada_no_listada'),
 ('X-GRN1', 'S/N', 'BAUL GREENLEE 2142', 'GREENLEE', '2142', 'Odoo P01530 (2024-12-27)', 'comprada_no_listada'),
 ('X-GRN2', 'S/N', 'BAUL GREENLEE 2142', 'GREENLEE', '2142', 'Odoo P01820 (2025-01-16)', 'comprada_no_listada'),
 ('X-JSB1', 'S/N', 'BAUL DE OBRA 48 in JSB48', '', 'JSB48', 'Odoo P01575 (2025-01-03, recibido)', 'comprada_no_listada'),
 ('X-JSB2', 'S/N', 'BAUL DE OBRA 48 in JSB48', '', 'JSB48', 'Odoo P01820 (2025-01-16, recibido)', 'comprada_no_listada'),
 ('X-RID460', 'S/N', 'PRENSA DE TUBO RIDGID 460-6 CON TRIPIE', 'RIDGID', '36273', 'Odoo P01810 (2025-01-14, recibida)', 'comprada_no_listada'),
 ('X-12R34', 'O', 'CABEZAL 12R 3/4 NPT (repuesto)', 'RIDGID', '37395', 'Odoo P01871 (2025-01-23) y P06460 (2026-06-09)', 'comprada_no_listada'),
 ('X-LASER2', 'S/N', 'NIVEL LASER BOSCH LINEAS VERDES (segundo)', 'BOSCH', '', 'Odoo P03974 (2025-06-25, recibido)', 'comprada_no_listada'),
 ('X-CAIMAN', 'S/N', 'LLAVE DE CADENA TIPO CAIMAN 6 in 797UR', 'URREA', '797UR', 'Odoo P03718 (2025-06-05, recibida)', 'comprada_no_listada'),
 ('X-EXT7T', 'S/N', 'EXTRACTOR REVERSIBLE 2 O 3 QUIJADAS 7 TON', '', '', 'Odoo P00324 (2024-10-23, recibido)', 'comprada_no_listada'),
 ('X-PVC', 'S/N', 'KIT DE CORTADOR PARA PVC INALAMBRICO', '', '', 'Odoo P00247 (2024-10-17, qty_recibida 0)', 'comprada_no_listada'),
 ('X-COMBO1', 'S/N', 'COMBO M18 (herramientas)', 'MILWAUKEE', '', 'Odoo P01765 (2025-01-10) · puede ser B1+B3', 'comprada_no_listada'),
 ('X-COMBO2', 'S/N', 'COMBO M18 ROTOMARTILLO 1/2 + ...', 'MILWAUKEE', '', 'Odoo P05567 (2026-02-04, recibido)', 'comprada_no_listada'),
 ('X-ROTO8A', 'S/N', 'ROTOMARTILLO 1/2 8.0 A', '', '', 'Odoo P07267 (2026-09-24, recibido)', 'comprada_no_listada'),
 ('X-DW7', 'S/N', 'ESMERILADORA 7 in 2400 W', 'DEWALT', 'DWE4557-B3', 'Odoo P06982 (2026-08-17, recibida)', 'comprada_no_listada'),
 ('X-DWRECT', 'S/N', 'RECTIFICADOR 1-1/2 in 450 W', 'DEWALT', 'DWE4887-B3', 'Odoo P04897 (2025-10-13, recibido)', 'comprada_no_listada'),
 ('X-MOTO', 'S/N', 'MOTO TOOL PROFESIONAL', 'TRUPER', '', 'Odoo P02049 (2025-02-04)', 'comprada_no_listada'),
 ('X-EXTECH', 'S/N', 'AMPERIMETRO MA440 (2)', 'EXTECH', 'MA440', 'Odoo P05648 (2026-02-18)', 'comprada_no_listada'),
 ('X-PONCH', 'S/N', 'PINZA PONCHADORA', '', '', 'Odoo P05150 (2025-11-12)', 'comprada_no_listada'),
 ('X-DETV', 'S/N', 'DETECTOR DE VOLTAJE DUAL', 'MILWAUKEE', '', 'Odoo P06378 (2026-05-21)', 'comprada_no_listada'),
 ('X-MATR', 'S/N', 'JUEGO DE LLAVES CON MATRACA (3)', 'HUSKY', '', 'Odoo P05748 (2026-03-02)', 'comprada_no_listada'),
 ('X-CORTAP', 'S/N', 'CORTAPERNO 30 in 1/2', 'TRUPER', '', 'Odoo P06461 (2026-06-09) · 762 mm nominal: no cabe en cajon', 'comprada_no_listada'),
 ('X-WIHA3', 'S/N', 'JUEGO WIHA 32985 AISLADO 7 PZ (3 juegos)', 'WIHA', '32985', 'Odoo P05743 (2026-03-02, qty_recibida 0)', 'comprada_no_listada'),
 ('X-MILLER', 'S/N', 'SOLDADORA MILLERMATIC 252', 'MILLER', '', 'Odoo P04666 (2025-09-17) · equipo mayor, fuera del carrito', 'comprada_no_listada'),
]
for num, caja, desc, marca, pn, fuente, clas in EXTRA:
    dm = dims.get(dimkey(pn))
    piezas.append({'numero_interno': num, 'numero_interno_listado': '', 'fila_listado': None, 'caja_listado': caja,
        'ubicacion_observada': caja if caja != 'S/N' else 'desconocida', 'descripcion': desc, 'marca': marca,
        'numero_parte_listado': '', 'numero_parte_corregido': pn, 'nota_numero_parte': '', 'sku_tienda': '',
        'tipo_energia': energia(desc, pn), 'familia': familia(desc), 'precio_listado_mxn': None, 'proveedor': '',
        'folio': '', 'link_referencia': '', 'evidencia_foto': fuente if 'foto' in fuente else '',
        'clasificacion': clas, 'notas': fuente,
        'L_mm': dm.get('L_mm') if dm else None, 'A_mm': dm.get('A_mm') if dm else None,
        'H_mm': dm.get('H_mm') if dm else None, 'peso_kg': dm.get('peso_kg') if dm else None,
        'dim_tipo': dm.get('dim_tipo') if dm else None,
        'validacion_dim': (dm.get('validacion') if dm else 'no encontrado') + ' · sin medicion fisica',
        'foto_ref_url': dm.get('foto_url') if dm else None})

# --- Discrepancias ---
D_('numero_parte', 'A2,A3,A8-A12 (Wiha)', 'Las 7 piezas comparten 32985', 'Odoo P05324/P05743: 32985 = juego de 7 piezas', 'Registrar el juego como 1 activo con 7 piezas; pedir el numero individual de cada pieza en la caja del juego', 'rol-taller')
D_('numero_parte', 'L3, L4, P17, P37', '"BUSCAR EN FACTURA"', 'listado', 'L3/L4: SKU HD 709207 existe; P17 y P37 sin SKU. Leer etiqueta de la pieza o ticket', 'rol-taller')
D_('numero_parte', 'TPC8', 'Listado 2729-20 vs Odoo [292922] (2929-22)', 'Odoo P02408', 'Leer la placa de la sierra', 'emp-112-manager_ops')
D_('numero_parte', 'B2', '285420 sin guion; es 2854-20 (M18 FUEL 3/8 impact wrench)', 'foto B 2025-07-03', 'Corregido en catalogo', 'CC (hecho)')
D_('numero_parte', 'I5', 'Descripcion "12 piezas" vs link "15 piezas"', 'listado', 'Contar piezas del juego: la foto I muestra 12 desarmadores', 'rol-taller')
D_('numero_parte', 'P21, P22', 'Descripcion 7/16 pero el link apunta a dado 5/16 (106513-106514)', 'listado', 'Revisar grabado del dado', 'rol-taller')
D_('numero_parte', 'O3', '"TARRAJA 1\\"-2\\"" ambiguo; el juego 12R trae 1/2, 3/4, 1, 1-1/4, 1-1/2 y 2', 'listado + Odoo P01810', 'O3 = cabezal de 1 in', 'emp-112-manager_ops')
D_('numero_interno', 'E "2"', 'Numero interno "2" en E, falta E4 en la secuencia', 'listado', 'Renombrado E4', 'CC (hecho)')
D_('numero_interno', 'E filas 40 y 41', 'Dos cinceles sin numero en E; H9/H10 son los mismos cinceles', 'foto H 2025-03-28 (cinceles en H) y foto E 2025-03-28 (sin cinceles)', 'Tratar como duplicado; no crear activo', 'CC (hecho)')
D_('numero_interno', 'F', 'Falta F3 en la secuencia', 'listado', 'Revisar si F3 existio', 'rol-taller')
D_('duplicado', 'E8 y Q2 (Micro Mapper)', 'Dos renglones, Odoo muestra 1 compra (P01841)', 'Odoo', 'Mantener 1; confirmar fisicamente si hay 2', 'rol-taller')
D_('duplicado', 'N2 y P39-P41', 'Mismo juego de adaptadores 106475 con precio 333.71 repetido 4 veces', 'listado', 'Precio es del juego de 3; N2 = el juego, P39-P41 = sus piezas o un segundo juego', 'rol-taller')
D_('precio', 'R3', 'Listado $3,547.43 (es el precio del 5485-21) vs Odoo $2,335.95', 'Odoo P01831', 'Usar Odoo', 'CC (hecho)')
D_('precio', 'O1-O6', 'Precio del juego 12R ($17,314.40 = 15,056 x 1.15) cargado solo en O1', 'Odoo P01810 $15,058.98', 'El juego es 1 activo; O2-O6 son piezas del juego', 'CC (hecho)')
D_('precio', 'A4, A7, G3, F6', 'Precio faltante', 'Odoo: A4 $1,724.14 (P01859), A7 $4,911.00 (P01827), G3 $642.24 y F6 $85.34 (P01887)', 'Completado desde Odoo (sin IVA)', 'CC (hecho)')
D_('cantidad', 'A0-R0 (48-22-8450)', 'Listado 18 cajas; Odoo 11 (P01829 x4, P02096 x3, P02097 x3, P02102 x1)', 'Odoo', '7 cajas sin orden de compra: pedir ticket o CFDI de Home Depot folio 285435', 'emp-59-contabilidad')
D_('cantidad', 'TPC9', 'Listado 16 placas de montaje; Odoo 18', 'Odoo P02408', 'Contar fisicamente', 'rol-taller')
D_('cantidad', 'Q3', 'Listado 1 escuadra magnetica; foto muestra 4', 'foto "Q o R" 2025-07-03', 'Agregadas X-Q3b..d', 'CC (hecho)')
D_('cantidad', 'L1-L2 y L3-L4', 'Odoo compro 4 + 4 el mismo dia (P01855 y P01856, dos ordenes iguales) y despues 6 mas (P05748) y 1 mas (P06371)', 'Odoo', 'Hay mas pinzas de presion compradas que listadas; ubicar o darlas por perdidas', 'emp-112-manager_ops')
D_('ubicacion', 'R1 laser verde', 'Listado dice R, foto E 2025-03-28 lo muestra en E', 'foto E', 'Ubicacion observada = E', 'CC (hecho)')
D_('ubicacion', 'R2 caladora Ryobi', 'Aparece en la misma caja que Q3 y Q4', 'foto "Q o R" 2025-07-03', 'Una caja mezcla caladora, escuadras y extractor (organizacion por tipo ya rota)', 'CC (hecho)')
D_('estado', 'TPC1, TPC3, TPC8, TPC10', 'Marcados COMPRAR pero comprados 2025-03-04 y fotografiados 2025-07-03', 'Odoo P02408 + fotos', 'Cambiar a existente', 'CC (hecho)')
D_('faltante', 'I2, L4', 'Hueco vacio en la ultima foto', 'fotos 2025-07-03', 'Confirmar en conteo fisico', 'rol-taller')
D_('faltante', 'B1, B4', 'Faltaban en mayo 2025, completos en julio', 'fotos B', 'Evidencia de que las piezas salen sin registro y regresan', 'informativo')
D_('perdida', 'A1, A5, 709195, flexometros', 'Compras repetidas del mismo articulo: A1 x5 (P01765, P05324, P05881 x3, P06223), A5 x5, flexometro 8 m 12+ veces, esmeril 6130-33 x4', 'Odoo', 'Senal de perdida no reportada; cuantificada en Fase 5', 'informativo')
D_('evidencia', 'D, M, N, S (interior), Q/R otra mitad, maleta personal', 'Sin foto', 'SharePoint', 'Tomar foto de cada una', 'rol-taller')
D_('antiguedad', 'todas', 'La foto mas reciente de las cajas es de 2025-08-05 (G) y 2026-01-02 (knockout). "Existe" significa "existia en 2025"', 'fotos', 'Conteo fisico completo antes de comprar', 'emp-112-manager_ops + rol-taller')

# --- Decisiones sobre lo comprado sin equivalencia en el listado ---
DEC = [
 ('X-4CAJ, X-8447', 'Entra al catalogo como CONTENEDOR y se reutiliza como modulo del carrito', 'Son exactamente el producto objetivo (cajas de cajones). Hay que ubicarlas: Odoo no registra recepcion.'),
 ('X-8424a/b, X-8427', 'Entra al catalogo como contenedor; queda fuera del carrito', 'Son cajas de tapa: el diseño las descarta. Pueden servir en taller.'),
 ('X-GRN1/2, X-JSB1/2', 'Entra al catalogo como resguardo fijo en planta', 'Un baul de obra con candado es justo la "jaula" de resguardo cuando el cliente no asigna cuarto.'),
 ('X-RID460, X-12R34, X-CAIMAN', 'Entra al modulo de tuberia', 'Herramienta de tuberia de proceso comprada y recibida; el cabezal 3/4 extra es repuesto del juego O.'),
 ('X-LASER2', 'Entra; segundo laser para el modulo de medicion', 'Con 3 frentes simultaneos un solo laser no alcanza.'),
 ('X-COMBO1, X-COMBO2, X-ROTO8A', 'Entra pendiente de identificar', 'Combos M18 sin detalle en Odoo: leer placa y asignar numero de activo.'),
 ('X-DW7, X-DWRECT, X-MOTO', 'Entra al modulo soldadura/metalmecanica', 'Esmeriladora 7 in y rectificador son de uso en soldadura; la 7 in no cabe en cajon de 61 mm.'),
 ('X-EXTECH, X-PONCH, X-DETV', 'Entra al modulo electrico', 'Instrumentos y pinza electrica.'),
 ('X-MATR', 'Entra a la base', 'Juego de llaves con matraca de uso diario.'),
 ('X-WIHA3', 'Entra a la base (uno por carrito)', 'Tres juegos Wiha aislados comprados en marzo 2026: uno por carrito es exactamente lo que el diseño pide.'),
 ('X-CORTAP', 'Entra como herramienta suelta', '762 mm nominal: no cabe en ningun cajon; va en el soporte lateral.'),
 ('X-PVC, X-EXT7T', 'Entra pendiente de ubicar', 'Compradas, sin evidencia de ubicacion.'),
 ('X-MILLER', 'NO entra al carrito', 'Soldadora: equipo mayor con su propio carro.'),
 ('X-8480, X-ENC', 'NO entra al carrito', 'Accesorios de racking/encimera Packout; sin funcion en cajones.'),
 ('Consumibles (brocas, discos, lijas, cintas, seguetas)', 'NO entra al catalogo de activos', 'Consumibles: se controlan por reposicion, no por numero de activo.'),
 ('Rentas de rotomartillo/rompedor', 'NO entra', 'No son activos de FTS.'),
 ('P07048 electroducto USD 676,140', 'NO entra', 'Equipo de proyecto, no herramienta.'),
 ('Maleta Personal (84 renglones)', 'Fuera del carrito, catalogo aparte', 'Es EPP individual por persona ($10,161.14 por kit); se asigna a la persona, no al kit de frente.'),
]
for ref, decision, porque in DEC:
    dec.append([ref, decision, porque])

# --- Fuentes ---
fuentes = [
 ['listado', 'OneDrive emp-32-direccion · Documents/Listado final Herramientas 2025.xlsx · hoja Listado principal', 'leido 2026-09-28 via Microsoft 365', '193 renglones reales + 2 vacios + fila "cotizados"'],
 ['listado', 'idem · hoja Maleta Personal', 'leido 2026-09-28', 'kit individual $10,161.14'],
 ['fotos', 'SharePoint fts.mx · Documentos compartidos/Proyecto Herramientas MX/01 Fotos Packout anteriores', 'listado 2026-09-28 (26 archivos); vistas 12 fotos', ''],
 ['odoo', 'purchase.order.line company 1, date_order >= 2024-01-01, name ilike 23 marcas/palabras', '189 lineas', 'MCP FTS Odoo solo lectura'],
 ['odoo', 'purchase.order.line, 17 palabras de tipo de herramienta sin marca', '72 lineas', ''],
]
for k, v in dims.items():
    for f in (v.get('fuentes') or []):
        fuentes.append(['dimension', f"{v.get('numero_parte')} · {f.get('campo')} = {f.get('valor_original')}", f.get('url'), f.get('tipo_fuente')])

# --- Excel ---
wb = Workbook()
def hoja(ws, headers, rows, widths=None):
    ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='B71C1C')
        c.alignment = Alignment(wrap_text=True, vertical='top')
    for r in rows: ws.append(r)
    ws.freeze_panes = 'A2'
    for i, h in enumerate(headers, 1):
        ws.column_dimensions[get_column_letter(i)].width = (widths or {}).get(h, min(max(len(h) + 2, 12), 45))
    ws.auto_filter.ref = ws.dimensions

ws = wb.active; ws.title = 'Piezas'
cols = list(piezas[0].keys())
hoja(ws, cols, [[p[c] for c in cols] for p in piezas], {'descripcion': 55, 'notas': 60, 'nota_numero_parte': 50, 'link_referencia': 40})
hoja(wb.create_sheet('Fuentes'), ['tipo', 'fuente', 'url_o_fecha', 'nota'], fuentes)
hoja(wb.create_sheet('Discrepancias'), ['#', 'tipo', 'referencia', 'detalle', 'fuente', 'accion', 'dueno'], disc, {'detalle': 60, 'accion': 55, 'fuente': 40})
hoja(wb.create_sheet('Decisiones'), ['referencia', 'decision', 'justificacion'], dec, {'decision': 50, 'justificacion': 70})
hoja(wb.create_sheet('Compras_Odoo'), list(compras[0].keys()), [list(c.values()) for c in compras], {'descripcion_odoo': 55, 'nota': 55})
out = os.path.join(BASE, 'catalogo_maestro.xlsx')
wb.save(out)
json.dump(piezas, open(os.path.join(D, 'piezas_catalogo.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

from collections import Counter
print('piezas', len(piezas), Counter(p['clasificacion'] for p in piezas))
print('familias', Counter(p['familia'] for p in piezas))
print('con dimension', sum(1 for p in piezas if p['L_mm']))
print('discrepancias', len(disc), 'decisiones', len(dec))
