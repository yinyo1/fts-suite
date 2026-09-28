"""Fase 5 · asignacion_y_compra.xlsx: cuantos carritos y modulos, a quien (por rol), lista de compra con precio y fuente,
reutilizacion del inventario actual y RFID.
Reglas de precio (en este orden): 1) lo que FTS YA PAGO (Odoo purchase.order.line o listado, SIN IVA) · 2) fragmento de
buscador con su confianza (datos/precios_mx_busqueda.json) · 3) null = COTIZAR. Nunca se inventa un precio.
Tipo de cambio: Odoo res.currency.rate USD company 1, 2026-09-27 = 17.64 MXN/USD.
"""
import json, os
from collections import defaultdict
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

BASE = os.path.join(os.path.dirname(__file__), '..'); D = os.path.join(BASE, 'datos')
TC = 17.64
UNIDADES = {'BASE': 5, 'ELE': 2, 'SOL': 2, 'TUB': 2, 'CIV': 1, 'MED': 2}
POR_QUE_UNIDADES = {
 'BASE': '4 plantas simultaneas (max y p90 sin oficina, Fase 3) + 1 de margen para transferencias/reposicion en taller',
 'ELE': '40% de las SOs son electricas; en la ventana medida hubo 1 frente electrico a la vez, se dejan 2 por los 19 meses sin dato de proyecto',
 'SOL': 'soldadura y tuberia estuvo en 2 plantas a la vez 92 de 121 dias (Topo Chico + Vertiv)',
 'TUB': 'mismo criterio que SOL: las dos plantas ancla son de tuberia de proceso',
 'CIV': 'obra civil 7% de las SOs y maximo 1 planta a la vez',
 'MED': 'laser e izaje se usan en mecanico (22%) y en montaje; hay 2 laser comprados',
}
# sku: (descripcion, modulo:qty por unidad, existencia en listado, compras Odoo posteriores al listado, precio, fuente precio, confianza)
S = {
 'wiha32985': ('Juego Wiha aislado 7 pz 32985', {'BASE': 1}, 1, 4, 1926.88, 'Odoo P05743 (2026-03-02, Amazon, sin IVA)', 'pagado'),
 '48-22-2606': ('Juego 6 desarmadores de precision Milwaukee', {'BASE': 1}, 1, 5, 563.70, 'Odoo P05881 (2026-03-24, sin IVA)', 'pagado'),
 '48-22-6105': ('Mini pinza de corte al ras Milwaukee', {'BASE': 1}, 1, 4, 255.61, 'Odoo P05881', 'pagado'),
 'husky109898': ('Juego desarmadores Husky 12/15 pz (base usa 6, electrico 6)', {'BASE': 1}, 1, 0, 825.00, 'buscador HD MX (snippet "$82,500" leido como $825.00)', 'baja'),
 '709195': ('Pinza de electricista 9 in Husky', {'BASE': 1}, 1, 2, 384.40, 'Odoo P01831 (sin IVA)', 'pagado'),
 '903465': ('Pinza diagonal 7 in Husky', {'BASE': 1}, 2, 2, 244.17, 'Odoo P01831', 'pagado'),
 '48-22-3531': ('Pinza de presion C 11 in Torque Lock', {'BASE': 1, 'SOL': 1}, 2, 10, 547.41, 'Odoo P05748 (2026-03-02)', 'pagado'),
 '709207': ('Pinza de presion 7 in recta Husky', {'BASE': 1, 'SOL': 1}, 1, 5, 308.36, 'Odoo P01855/P06371', 'pagado'),
 '48-22-3532': ('Pinza de presion C 6 in Torque Lock', {'BASE': 1, 'SOL': 1}, 2, 0, 405.00, 'listado (Home Depot, folio 223028)', 'pagado'),
 '709204': ('Pinza de presion curva Husky', {'BASE': 1, 'SOL': 1}, 2, 2, 316.81, 'Odoo P02044', 'pagado'),
 '17018': ('Llave ajustable 12 in Husky', {'BASE': 1}, 3, 1, 308.00, 'Odoo P01581 (Ferremayoreo)', 'pagado'),
 '17016': ('Llave ajustable 8 in Husky', {'BASE': 1}, 3, 0, None, 'COTIZAR (sin precio en listado, Odoo ni buscador)', None),
 '17301': ('Pinza de chofer 8 in Truper', {'BASE': 1}, 2, 0, 129.00, 'buscador (tienda no clara, sin IVA)', 'baja'),
 '30-615': ('Flexometro 5 m Stanley', {'BASE': 2}, 3, 3, 122.50, 'Odoo P01765', 'pagado'),
 'Hrrw7': ('Juego 7 llaves combinadas con matraca Husky', {'BASE': 1}, 1, 3, 1340.52, 'Odoo P05748 "JUEGO DE LLAVES CON MATRACA" (probable mismo articulo)', 'pagado'),
 'Hbcw10': ('Juego 10 llaves combinadas Husky BITE', {'SOL': 1}, 1, 0, None, 'COTIZAR', None),
 'dados38': ('Matraca 3/8 + juego de dados mm/in', {'BASE': 1}, 1, 0, None, 'COTIZAR (hoy son dados sueltos P7-P35)', None),
 'ext38': ('Extensiones 3/8 (6, 10 in, oscilantes) y palanca', {'BASE': 1}, 1, 0, None, 'COTIZAR', None),
 '106475': ('Juego 3 adaptadores 1/4-3/8-1/2 Husky', {'BASE': 1}, 2, 0, 333.71, 'listado (folio 223028)', 'pagado'),
 'torx': ('Juego llaves Torx/hex navaja Husky', {'SOL': 1}, 6, 0, None, 'COTIZAR', None),
 'MA-16F': ('Martillo una curva 16 oz Truper', {'BASE': 1, 'CIV': 1}, 2, 1, 142.74, 'Odoo P06664 (2026-07-03)', 'pagado'),
 'MH-16': ('Mazo de hule 16 oz Truper', {'CIV': 1}, 1, 0, None, 'COTIZAR', None),
 'cinceles': ('Par de cinceles 5/16x6 y 7/8x10 Truper', {'CIV': 1}, 1, 0, 178.64, 'listado 101.24 + 77.40 (folio 280051)', 'pagado'),
 'limas': ('3 limas 6 in Bellota', {'SOL': 1}, 1, 0, None, 'COTIZAR', None),
 '99735a': ('Navaja retractil Anvil', {'BASE': 1}, 1, 0, 63.70, 'listado (folio 280051)', 'pagado'),
 '129291': ('Tazon magnetico Husky', {'BASE': 1}, 1, 0, 367.50, 'Odoo P01829', 'pagado'),
 '10790': ('Nivel torpedo magnetico Husky', {'BASE': 1, 'MED': 1}, 2, 1, 285.00, 'buscador Home Depot MX', 'media'),
 '220IM': ('Escuadra combinada 12 in Empire', {'MED': 1}, 1, 0, 218.54, 'listado (folio 280051)', 'pagado'),
 'CALDI-6MP': ('Vernier digital 6 in Truper', {'BASE': 1}, 1, 0, 573.00, 'buscador El Ferretero', 'media'),
 '15-555': ('Arco con segueta 12 in Stanley', {'SOL': 1}, 1, 2, 151.22, 'Odoo P01765', 'pagado'),
 'brocasHSS': ('Juego 15 brocas HSS 1/16-1/2', {'BASE': 1}, 1, 3, 1390.40, 'Odoo P05669 (2026-02-23, Centenario)', 'pagado'),
 '101557': ('Juego 3 brocas escalonadas Truper', {'BASE': 1}, 1, 0, 642.24, 'Odoo P01887', 'pagado'),
 'comboM18': ('Combo M18: atornillador de impacto + rotomartillo 1/2 (sustituye 3650-20 y 3602-20 sueltos)', {'BASE': 1}, 1, 2, 6629.36, 'Odoo P01765 (2025-01-10) "MILWAUKEE COMBO DE HERRAMIENTAS M18"; P05567 (2026-02-04) $6,602.58. Verificar si incluye baterias y cargador', 'pagado'),
 '2854-20': ('Llave de impacto M18 FUEL 3/8 (solo herramienta)', {'BASE': 1}, 1, 0, 3241.14, 'listado (Amazon)', 'pagado'),
 '48-11-1820': ('Bateria M18 CP2.0', {'BASE': 2}, 2, 0, 2085.00, 'listado TPC5 (Home Depot)', 'pagado'),
 '48-59-1812': ('Cargador sencillo M18/M12', {'BASE': 1}, 0, 0, 1777.55, 'buscador OASA Norte', 'media'),
 '6130-33': ('Mini esmeriladora 4-1/2 Milwaukee', {'BASE': 1, 'SOL': 1}, 2, 4, 1585.34, 'Odoo P06371 (2026-05-19)', 'pagado'),
 '302+': ('Pinza amperimetrica Fluke 302+', {'ELE': 1}, 1, 0, 1724.14, 'Odoo P01859', 'pagado'),
 'MA440': ('Amperimetro Extech MA440', {'ELE': 1}, 0, 2, 1072.88, 'Odoo P05648', 'pagado'),
 'MT-8200': ('Probador MicroMapper Fluke', {'ELE': 1}, 1, 0, 204 * TC, 'Odoo P01841 USD 204 x 17.64', 'pagado'),
 'CE100821': ('Pelacables Commercial Electric', {'ELE': 1}, 1, 0, None, 'COTIZAR', None),
 '1445070000': ('Crimpadora Weidmuller', {'ELE': 1}, 1, 0, 4911.00, 'Odoo P01827', 'pagado'),
 'ponch': ('Pinza ponchadora RJ45', {'ELE': 1}, 0, 1, 495.69, 'Odoo P05150', 'pagado'),
 'detv': ('Detector de voltaje Milwaukee', {'ELE': 1}, 0, 1, 400.86, 'Odoo P06378', 'pagado'),
 'sacab': ('3 sacabocados Dogo 7/13/19 mm', {'ELE': 1}, 1, 0, 557.06, 'listado 315.15+165.90+76.01', 'pagado'),
 '2677-23': ('Kit knockout M18 Force Logic 6 t', {'ELE': 1}, 1, 0, 32190.00, 'Odoo P02408', 'pagado'),
 '15407': ('Escuadra magnetica 4 in Truper', {'SOL': 4}, 4, 0, 98.00, 'buscador El Ferretero', 'media'),
 'DWE4887': ('Rectificador DeWalt 1-1/2 in', {'SOL': 1}, 0, 1, 2038.58, 'Odoo P04897', 'pagado'),
 'mototool': ('Moto tool Truper', {'SOL': 1}, 0, 1, 679.44, 'Odoo P02049', 'pagado'),
 '11442': ('Juego 40 machuelos y tarrajas Truper', {'SOL': 1}, 1, 0, None, 'COTIZAR', None),
 'EXT-5': ('Juego 5 extractores de tornillos Truper', {'SOL': 1}, 1, 0, 85.34, 'Odoo P01887', 'pagado'),
 '4216': ('Extractor de quijadas 6 t Urrea', {'SOL': 1}, 1, 0, 4760.00, 'Odoo P01890', 'pagado'),
 'SF-5': ('Fresa de carburo', {'SOL': 1}, 1, 0, None, 'COTIZAR', None),
 '73126': ('Llave stillson 14 in Husky', {'TUB': 2}, 2, 0, 525.00, 'buscador Home Depot MX Pro', 'media'),
 '797UR': ('Llave de cadena caiman 6 in Urrea', {'TUB': 1}, 0, 1, 2351.20, 'Odoo P03718', 'pagado'),
 '48-22-5110': ('Nivel para tuberia 6.5 in Milwaukee', {'TUB': 2}, 2, 0, 832.02, 'listado (folio 223028)', 'pagado'),
 'cab34': ('Cabezal 12R 3/4 NPT Ridgid', {'TUB': 1}, 0, 2, 2256.92, 'Odoo P06460', 'pagado'),
 '36475': ('Juego tarraja Ridgid 12R 1/2-2 in', {'TUB': 1}, 1, 0, 15058.98, 'Odoo P01810', 'pagado'),
 '5485-21': ('Rotomartillo SDS-Plus Milwaukee', {'CIV': 1}, 1, 0, 3547.43, 'listado/Odoo P01829', 'pagado'),
 '5375-20': ('Taladro percutor alambrico 1/2 Milwaukee', {'CIV': 1}, 1, 0, 1984.50, 'Odoo P01829', 'pagado'),
 'mangos': ('Mango lateral', {'CIV': 2}, 2, 0, None, 'COTIZAR (numero 516940 B2 no identificado)', None),
 'DWA0870': ('Juego 15 brocas y cinceles SDS-Plus DeWalt', {'CIV': 1}, 1, 0, 847.70, 'listado (folio 365123)', 'pagado'),
 'JS481LG': ('Sierra caladora Ryobi', {'CIV': 1}, 1, 0, 730.78, 'Odoo P01829', 'pagado'),
 '2648-20': ('Lijadora orbital M18', {'CIV': 1}, 1, 0, 2335.95, 'Odoo P01831', 'pagado'),
 '6509-31': ('Sierra sable Milwaukee 12 A con estuche', {'CIV': 1}, 1, 0, 3749.00, 'listado TPC14', 'pagado'),
 'GLL12-22G': ('Nivel laser verde Bosch', {'MED': 1}, 1, 1, 1519.84, 'Odoo P02047', 'pagado'),
 'EC-12': ('Escuadra de carpintero 12 in Truper', {'MED': 1}, 1, 0, 109.18, 'listado (folio 280051)', 'pagado'),
 'Fh0829': ('Juego 4 amarres de matraca 3.6 m Husky', {'MED': 1}, 1, 1, 316.18, 'listado / Odoo P06316', 'pagado'),
 'grillete58': ('Grillete 5/8 Crosby (x3)', {'MED': 1}, 1, 0, None, 'COTIZAR (Grainger 29WP64)', None),
}
COMPARTIDO = {'2677-23': 'knockout: $32,190 y uso ocasional; 1 en taller, se pide con el proyecto electrico',
              '36475': 'tarraja 12R: $15,059, 15.8 kg; 1 en taller, se pide con el proyecto de tuberia roscada'}
CONT = {  # contenedores por unidad de modulo (de diseno_carrito.json)
 'BASE': {'48-22-8420': 1, '48-22-8444': 2}, 'ELE': {'48-22-8444': 1}, 'SOL': {'48-22-8442': 1, '48-22-8444': 1},
 'TUB': {'48-22-8443': 1}, 'CIV': {'48-22-8420': 1, '48-22-8442': 1, '48-22-8444': 1}, 'MED': {'48-22-8442': 1},
}
CONT_PRECIO = {'48-22-8444': (3614.00, 'Odoo P03220 (2025-04-28, "4 cajones", sin IVA)', 'pagado'),
               '48-22-8420': (5599.00, 'buscador HerramientaElectrica.mx', 'media'),
               '48-22-8442': (3952.00, 'buscador HerramientaElectrica.mx (agotado)', 'alta'),
               '48-22-8443': (3399.00, 'buscador Home Depot MX', 'media')}
CONT_EXISTE = {'48-22-8444': 1, '48-22-8447 (sustituye 1 x 8444)': 1}   # P03220 y P05566, SIN recepcion en Odoo: ubicarlas
# accesorios de control por unidad
CANDADO = (119.00, 'listado hoja Maleta Personal: Master 646DMX, Home Depot', 'pagado')
CABLE = (337.55, 'buscador Amazon MX: cable 1.8 m con combinacion reajustable', 'baja')
TAG = (4.90 * TC, 'buscador Atlas RFID: Confidex Ironside Classic 4.90 USD x 17.64', 'media')
LECTOR = (800 * TC, 'buscador: Chainway C72 ~800 USD x 17.64 (Zebra RFD40 lista 1,373.90 USD)', 'baja')

wb = Workbook()
def hoja(ws, headers, rows):
    ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='B71C1C'); c.alignment = Alignment(wrap_text=True)
    for r in rows: ws.append(r)
    ws.freeze_panes = 'A2'
    for i, h in enumerate(headers, 1): ws.column_dimensions[get_column_letter(i)].width = min(max(len(str(h)) + 2, 10), 55)

# --- Dimensionamiento ---
dim = [[m, UNIDADES[m], POR_QUE_UNIDADES[m], ' + '.join(f'{v} x {k}' for k, v in CONT[m].items())] for m in UNIDADES]
# --- Herramienta ---
filas, tot_mod = [], defaultdict(float); sin_precio = []
for sku, (desc, porm, ex, odoo_extra, precio, fuente, conf) in S.items():
    need = 1 if sku in COMPARTIDO else sum(q * UNIDADES[m] for m, q in porm.items())
    buy_cons = max(0, need - ex)
    buy_opt = max(0, need - ex - odoo_extra)
    sub = round(buy_cons * precio, 2) if precio is not None else None
    if precio is None and buy_cons: sin_precio.append(desc)
    for m, q in porm.items():
        share = q * UNIDADES[m] / need
        if sub: tot_mod[m] += sub * share
    filas.append([sku, desc + (' [COMPARTIDO: ' + COMPARTIDO[sku] + ']' if sku in COMPARTIDO else ''), ', '.join(f'{m}x{q}' for m, q in porm.items()), need, ex, odoo_extra, buy_cons, buy_opt,
                  precio, sub, fuente, conf or 'sin precio'])
# --- Contenedores y control ---
cont_need = defaultdict(int)
for m, u in UNIDADES.items():
    for k, v in CONT[m].items(): cont_need[k] += v * u
n_cont_total = sum(cont_need.values())
cfilas = []
for k, n in cont_need.items():
    ex = 2 if k == '48-22-8444' else 0   # 1 de 4 cajones (P03220) + la 8447 (P05566) sustituye una 8444
    p, f, c = CONT_PRECIO[k]
    cfilas.append([k, n, ex, n - ex, p, round((n - ex) * p, 2), f, c])
n_kits = UNIDADES['BASE']
modulos_total = sum(v for k, v in UNIDADES.items() if k != 'BASE')
cfilas.append(['Candado de combinacion (1 por contenedor)', n_cont_total, 0, n_cont_total, CANDADO[0], round(n_cont_total * CANDADO[0], 2), CANDADO[1], CANDADO[2]])
cfilas.append(['Cable de acero con candado para resguardo (1 por kit + 1 por modulo con 8420)', n_kits + UNIDADES['CIV'], 0, n_kits + UNIDADES['CIV'], CABLE[0], round((n_kits + UNIDADES['CIV']) * CABLE[0], 2), CABLE[1], CABLE[2]])
# --- RFID ---
rf = []
ntag = 0
for sku, (desc, porm, ex, oe, precio, fuente, conf) in S.items():
    electrica = any(w in desc for w in ('M18', 'alambrico', 'esmeriladora', 'Rotomartillo', 'Fluke', 'Extech', 'laser', 'Rectificador', 'Moto tool', 'MicroMapper', 'caladora', 'Lijadora', 'Sierra sable', 'knockout', 'Taladro', 'Detector'))
    alto_valor = precio is not None and precio >= 1500 and sku != 'wiha32985'   # Wiha: juego de 7 piezas de ~$275 c/u
    if electrica or alto_valor:
        need = 1 if sku in COMPARTIDO else sum(q * UNIDADES[m] for m, q in porm.items())
        n = need * (2 if sku == 'comboM18' else 1)
        ntag += n
        rf.append([sku, desc, n, 'electrica' if electrica else 'valor >= $1,500', round(n * TAG[0], 2)])
for extra, n in (('Roscadora 2874-22HD', 1), ('Sierra de banda M18 FUEL', 1), ('Aspiradora 0970-20', 1)):
    ntag += n; rf.append(['suelto', extra, n, 'electrica', round(n * TAG[0], 2)])
rf.append(['lector', 'Lector UHF de mano Android (fase 2)', 1, 'hardware', round(LECTOR[0], 2)])
# --- Impresion y grabado ---
imp = json.load(open(os.path.join(D, 'estimacion_impresion.json')))
g_total = sum(imp[m]['g'] * UNIDADES[m] for m in UNIDADES)
petg_kg = round(g_total / 1000 * 1.15, 1)    # +15% de purga y fallas
PETG = (633.00, 'buscador Coppel: SUNLU PETG 1 kg', 'media')
fab = [['PETG 1 kg (incluye 15% de merma)', petg_kg, PETG[0], round(petg_kg * PETG[0], 2), PETG[1], PETG[2]],
       ['Impresora 3D rapida adicional', 1, None, None, 'COTIZAR (ver plan_fabricacion.md)', 'sin precio'],
       ['Placas QR de aluminio anodizado (contenedores)', n_cont_total, None, None, 'COTIZAR (solo por cotizacion: inventarios.com.mx y otros)', 'sin precio']]
# --- Totales ---
t_herr = sum(f[9] for f in filas if f[9])
t_herr_opt = sum(f[7] * f[8] for f in filas if f[8] is not None)
t_cont = sum(c[5] for c in cfilas)
t_rfid = sum(r[4] for r in rf)
t_fab = sum(f[3] for f in fab if f[3])
total = t_herr + t_cont + t_rfid + t_fab
# por carrito base y por modulo (herramienta + contenedores + candados)
def cont_cost(m):
    s = 0
    for k, v in CONT[m].items(): s += v * CONT_PRECIO[k][0] + v * CANDADO[0]
    return s
por_unidad = []
for m in UNIDADES:
    herr_u = tot_mod[m] / UNIDADES[m]
    por_unidad.append([m, UNIDADES[m], round(herr_u, 2), round(cont_cost(m), 2), round(herr_u + cont_cost(m), 2),
                       'herramienta a comprar (conservador) prorrateada por unidad + contenedores nuevos + candados; sin RFID ni impresion'])
resumen = [['Herramienta a comprar (conservador, solo renglones con precio)', round(t_herr, 2)],
           ['Herramienta a comprar si aparecen las compras de Odoo posteriores al listado', round(t_herr_opt, 2)],
           ['Contenedores, candados y cables', round(t_cont, 2)],
           ['RFID (tags + lector)', round(t_rfid, 2)],
           ['Filamento PETG', round(t_fab, 2)],
           ['TOTAL con precio conocido (MXN, mezcla de precios sin IVA pagados y precios de tienda)', round(total, 2)],
           ['TOTAL si aparecen las compras de Odoo', round(total - t_herr + t_herr_opt, 2)],
           ['Renglones de herramienta SIN precio (cotizar)', len(sin_precio)],
           ['Tipo de cambio usado', f'{TC} MXN/USD (Odoo, 2026-09-27)']]
hoja(wb.active, ['concepto', 'MXN'], resumen); wb.active.title = 'Resumen'
hoja(wb.create_sheet('Dimensionamiento'), ['modulo', 'unidades', 'por que', 'contenedores por unidad'], dim)
hoja(wb.create_sheet('Por_unidad'), ['modulo', 'unidades', 'herramienta por unidad', 'contenedores+candados por unidad', 'total por unidad', 'nota'], por_unidad)
hoja(wb.create_sheet('Herramienta'), ['sku', 'descripcion', 'modulo x qty', 'necesidad total', 'existe (listado)', 'compras Odoo posteriores al listado',
     'a comprar (conservador)', 'a comprar (si aparecen las compras Odoo)', 'precio unit MXN', 'subtotal conservador', 'fuente precio', 'confianza'], filas)
hoja(wb.create_sheet('Contenedores_y_control'), ['articulo', 'necesidad', 'existe', 'a comprar', 'precio unit', 'subtotal', 'fuente', 'confianza'], cfilas)
hoja(wb.create_sheet('RFID'), ['sku', 'pieza', 'tags', 'criterio', 'costo MXN'], rf)
hoja(wb.create_sheet('Fabricacion'), ['articulo', 'cantidad', 'precio unit', 'subtotal', 'fuente', 'confianza'], fab)
asign = [
 ['Carrito base', 'Encargado del frente (tecnico o soldador lider asignado en el plan nocturno)', 'Responsable del kit en la app: revision diaria, resguardo, candados de la base',
  'Supervisor SR aprueba transferencias y ve combinaciones'],
 ['Modulo de especialidad', 'Encargado del frente que lo monta', 'Se registra montado en su kit; responde igual que por la base', 'Taller lo prepara y lo recibe'],
 ['Revision de seguridad', 'Segurista del frente', 'Segunda firma de la revision; EPP y candados LOTO van en la maleta personal, no en el carrito', ''],
 ['Supervisor SR', 'Carlos Manzanares / Mateo Salazar (por frente)', 'Resuelve alertas A1-A7, aprueba reasignaciones, custodia combinaciones', 'Escala a Felipe'],
 ['Taller FTS', 'Eduardo (propuesto)', 'Kits EN_TALLER, reposicion, preparacion de modulos, conteo de retorno', 'Unico que da de baja una pieza'],
 ['Manager de operaciones', 'Felipe Perez', 'Asigna kits a frentes al publicar el plan; recibe escalaciones', ''],
 ['Chofer', 'Ramiro Segovia', 'Responsable en EN_TRANSITO', ''],
]
hoja(wb.create_sheet('Asignacion_por_rol'), ['que', 'a quien (rol)', 'responsabilidad', 'nota'], asign)
reuso = [
 ['18 cajas 48-22-8450 (A-R)', 'SOBRAN del carrito', 'Almacen de taller para reposicion y consumibles; o venta', 'libera ~18 x $1,854 = $33,379 (precio pagado)'],
 ['48-22-8426 (S) caja rodante de tapa', 'SOBRA', 'Base de un kit de taller o de un modulo en planta ancla', ''],
 ['48-22-8424 x2, 48-22-8427, 48-22-8440, placas 48-22-8485', 'SOBRAN', 'Taller / camioneta', ''],
 ['Caja 4 cajones (P03220) y 48-22-8447 (P05566)', 'SE REUTILIZAN', 'Van al carrito base 01 (piloto)', 'Ubicarlas: Odoo no registra recepcion'],
 ['Baules Greenlee 2142 x2 y JSB48 x2', 'SE REUTILIZAN', 'Resguardo fijo en planta ancla cuando el cliente no da cuarto', ''],
 ['Herramienta del listado', 'SE REUTILIZA', 'Llena el carrito base 01 y los modulos 01; ver columna "existe"', 'Tras conteo fisico'],
 ['Roscadora, sierra de banda, aspiradora, knockout, 12R', 'SE REUTILIZAN', 'Van en su estuche con el modulo correspondiente', ''],
 ['Soldadora Millermatic 252, prensa Ridgid 460', 'FUERA DEL CARRITO', 'Equipo mayor con su propio control', ''],
 ['Dados sueltos P7-P35, Torx P1-P6 (6 juegos)', 'SE REUTILIZAN PARCIAL', 'Un juego por carrito; sobran 5 juegos Torx', ''],
]
hoja(wb.create_sheet('Reuso_inventario'), ['que', 'decision', 'destino', 'nota'], reuso)
wb.save(os.path.join(BASE, 'asignacion_y_compra.xlsx'))
print('\n'.join(f'{a}: {b}' for a, b in resumen))
print('por unidad:', [(p[0], p[4]) for p in por_unidad])
print('tags', ntag, 'petg kg', petg_kg, 'contenedores', dict(cont_need))
print('sin precio:', sin_precio)
