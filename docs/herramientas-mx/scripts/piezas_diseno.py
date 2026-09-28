"""Fase 4 · Lista de piezas que van al carrito, con medidas de DISENO en posicion de guardado (acostada).
planta = largo x ancho visto desde arriba; alto = espesor acostada.
fuente_dim:
  'buscador'   -> fragmento de buscador (dimensiones_herramientas.json), convertido a posicion acostada. NO validado.
  'nominal'    -> el largo sale del nombre comercial (ej. 12 in = 305 mm); ancho y alto estimados. NO validado.
  'estimacion' -> estimacion de diseno desde foto contra el interior del 48-22-8450 (480 x 320 mm). NO validado.
Ninguna pieza tiene medicion fisica: todas quedan 'no validado' hasta el vernier (Fase 7).
modulo: BASE (va en todo carrito) · ELE electrico · SOL soldadura/metalmecanica · TUB tuberia · CIV obra civil/perforacion · MED medicion/trazo
frec: diario / frecuente / ocasional (uso esperado cuando el carrito esta en un proyecto de su tipo)
"""
import json, os
D = os.path.join(os.path.dirname(__file__), '..', 'datos')

# id, ref_catalogo, descripcion, familia, modulo, L, A, H, peso_kg, fuente_dim, frec, nota
T = [
 # ---------------- BASE: mano de uso diario ----------------
 ('WIHA-SET', 'A2,A3,A8-A12', 'Juego Wiha aislado 1000V 32985 (4 desarmadores + 3 pinzas)', 'electrico', 'BASE', 0,0,0, 1.134, 'buscador', 'diario', 'se desglosa abajo; peso del juego (buscador)'),
 ('WIHA-DS1', 'A2', 'Desarmador aislado PH1 x 80 (32101)', 'electrico', 'BASE', 190, 30, 30, 0.07, 'estimacion', 'diario', 'largo = 80 hoja + ~110 mango'),
 ('WIHA-DS2', 'A3', 'Desarmador aislado PH2 x 100 (32102)', 'electrico', 'BASE', 215, 32, 32, 0.08, 'estimacion', 'diario', ''),
 ('WIHA-DS3', 'A11', 'Desarmador aislado plano 3.0 x 100 (32012)', 'electrico', 'BASE', 205, 28, 28, 0.06, 'estimacion', 'diario', ''),
 ('WIHA-DS4', 'A12', 'Desarmador aislado plano 4.5 x 100 (32023)', 'electrico', 'BASE', 215, 30, 30, 0.07, 'estimacion', 'diario', ''),
 ('WIHA-PP', 'A10', 'Pinza de punta aislada 160 (32926)', 'electrico', 'BASE', 160, 55, 20, 0.17, 'nominal', 'diario', 'largo 160 = nombre'),
 ('WIHA-PC', 'A8', 'Pinza de corte diagonal aislada 160 (32933)', 'electrico', 'BASE', 160, 55, 20, 0.18, 'nominal', 'diario', ''),
 ('WIHA-PE', 'A9', 'Pinza combinada aislada 200 (32930)', 'electrico', 'BASE', 200, 60, 22, 0.28, 'nominal', 'diario', ''),
 ('PREC6', 'A1', 'Juego 6 desarmadores de precision 48-22-2606 (estuche)', 'electrico', 'BASE', 190, 90, 25, 0.2, 'estimacion', 'frecuente', 'buscador da 279x152x51 de empaque: descartado'),
 ('MINIP', 'A5', 'Mini pinza de corte al ras 48-22-6105', 'electrico', 'BASE', 127, 51, 13, 0.059, 'buscador', 'frecuente', ''),
 ('HUSKY-DS', 'I5', 'Juego 12 desarmadores Husky (se acomodan sueltos)', 'mecanica_general', 'BASE', 0,0,0, 0, 'estimacion', 'diario', 'se desglosa en 4 grupos de 3'),
 ('HDS-A', 'I5.1-I5.3', '3 desarmadores Husky (P1, P1, P2)', 'mecanica_general', 'BASE', 230, 100, 32, 0.3, 'estimacion', 'diario', 'grupo de 3 lado a lado'),
 ('HDS-B', 'I5.4-I5.6', '3 desarmadores Husky (P2 x3)', 'mecanica_general', 'BASE', 230, 100, 32, 0.3, 'estimacion', 'diario', ''),
 ('HDS-C', 'I5.7-I5.9', '3 desarmadores Husky 1/4', 'mecanica_general', 'ELE', 250, 100, 32, 0.33, 'estimacion', 'diario', ''),
 ('HDS-D', 'I5.10-I5.12', '3 desarmadores Husky 1/4, 3/16', 'mecanica_general', 'ELE', 250, 100, 32, 0.33, 'estimacion', 'diario', ''),
 ('PELEC', 'I1', 'Pinza de electricista 9 in Husky 709195', 'mecanica_general', 'BASE', 250, 50, 15, 0.515, 'buscador', 'diario', 'buscador: 250x50x15 (15 mm de espesor parece bajo)'),
 ('PDIAG', 'I3', 'Pinza diagonal 7 in Husky 903465', 'mecanica_general', 'BASE', 178, 55, 20, 0.3, 'nominal', 'diario', ''),
 ('PRES11', 'L1', 'Pinza de presion C 11 in Torque Lock 48-22-3531', 'soldadura_metalmecanica', 'BASE', 279, 110, 25, 0.85, 'buscador', 'frecuente', 'ancho de la C estimado'),
 ('PRES7', 'L3', 'Pinza de presion 7 in mordaza recta Husky', 'soldadura_metalmecanica', 'BASE', 178, 60, 25, 0.35, 'nominal', 'frecuente', ''),
 ('PRES6C', 'L5', 'Pinza de presion C 6 in Torque Lock 48-22-3532', 'soldadura_metalmecanica', 'BASE', 152, 70, 22, 0.3, 'buscador', 'frecuente', ''),
 ('PRES10', 'L7', 'Pinza de presion 10 in mordaza curva Husky 709204', 'soldadura_metalmecanica', 'BASE', 254, 70, 25, 0.5, 'buscador', 'frecuente', ''),
 ('AJ12', 'J1', 'Llave ajustable 12 in Husky 17018', 'mecanica_general', 'BASE', 300, 78, 20, 0.6, 'buscador', 'diario', ''),
 ('AJ8', 'J4', 'Llave ajustable 8 in Husky 17016', 'mecanica_general', 'BASE', 203, 60, 15, 0.3, 'nominal', 'diario', ''),
 ('CHOF8', 'J7', 'Pinza de chofer 8 in Truper 17301', 'mecanica_general', 'BASE', 203, 55, 15, 0.25, 'nominal', 'frecuente', ''),
 ('FLEX1', 'J11', 'Flexometro 5 m Stanley 30-615', 'medicion_trazo', 'BASE', 70, 60, 40, 0.25, 'buscador', 'diario', 'planta 70x60, espesor 40'),
 ('FLEX2', 'J12', 'Flexometro 5 m Stanley 30-615', 'medicion_trazo', 'BASE', 70, 60, 40, 0.25, 'buscador', 'diario', ''),
 ('COMB7', 'K1', 'Juego 7 llaves combinadas matraca Husky (en su riel)', 'mecanica_general', 'BASE', 245, 175, 45, 0.9, 'buscador', 'frecuente', 'medida de estuche'),
 ('COMB10', 'K2', 'Juego 10 llaves combinadas Husky BITE', 'mecanica_general', 'SOL', 300, 180, 25, 1.4, 'estimacion', 'frecuente', 'foto K: dos filas de llaves'),
 ('MATR', 'X-MATR', 'Matraca 3/8 + dados (juego Husky P, 3/8)', 'mecanica_general', 'BASE', 280, 200, 45, 1.6, 'estimacion', 'frecuente', 'dados P7-P35 en riel + matraca; foto P'),
 ('EXTS', 'P36,P38,N1', 'Extensiones 3/8 (6 in, 10 in, oscilantes) y palanca', 'mecanica_general', 'BASE', 260, 80, 25, 0.6, 'estimacion', 'frecuente', ''),
 ('ADAP', 'N2', 'Juego 3 adaptadores 1/4-3/8-1/2', 'mecanica_general', 'BASE', 70, 40, 25, 0.1, 'estimacion', 'frecuente', ''),
 ('TORX', 'P1', 'Juego llaves Torx/hex tipo navaja Husky', 'mecanica_general', 'SOL', 130, 45, 30, 0.3, 'estimacion', 'ocasional', ''),
 ('MART', 'H5', 'Martillo una curva 16 oz Truper MA-16F', 'mecanica_general', 'BASE', 340, 125, 35, 0.707, 'buscador', 'frecuente', 'alto de cabeza 125 estimado'),
 ('MAZO', 'H4', 'Mazo de hule 16 oz Truper MH-16', 'mecanica_general', 'CIV', 340, 110, 60, 0.7, 'buscador', 'ocasional', ''),
 ('CINC', 'H9,H10', '2 cinceles de corte frio 5/16x6 y 7/8x10', 'mecanica_general', 'CIV', 254, 60, 25, 0.5, 'nominal', 'ocasional', '10 in = 254'),
 ('LIMAS', 'H1-H3', '3 limas 6 in (redonda, media cana, triangular)', 'soldadura_metalmecanica', 'SOL', 250, 60, 15, 0.3, 'nominal', 'ocasional', 'H3 trae 24.4 cm en el nombre'),
 ('NAVAJA', 'Q1', 'Navaja retractil Anvil', 'mecanica_general', 'BASE', 224, 88, 20, 0.2, 'nominal', 'diario', '22.4 x 8.8 x 2 cm = nombre'),
 ('TAZON', 'TPC13', 'Tazon magnetico Husky', 'mecanica_general', 'BASE', 150, 150, 40, 0.32, 'nominal', 'frecuente', 'nombre: 323 g; diametro estimado'),
 ('TORPEDO', 'E5', 'Nivel torpedo magnetico 9 in Husky', 'medicion_trazo', 'BASE', 230, 45, 30, 0.2, 'buscador', 'diario', 'buscador 230x45x16; 30 con vial'),
 ('ESCCOMB', 'E1', 'Escuadra combinada 12 in Empire 220IM', 'medicion_trazo', 'MED', 305, 100, 30, 0.4, 'nominal', 'frecuente', ''),
 ('VERN', 'E3', 'Vernier digital 6 in Truper CALDI-6MP', 'medicion_trazo', 'BASE', 237, 80, 20, 0.205, 'buscador', 'frecuente', 'ancho de las puntas estimado'),
 ('SEGUETA', 'TPC12', 'Arco con segueta 12 in Stanley 15-555', 'perforacion_corte', 'SOL', 400, 110, 25, 0.5, 'estimacion', 'frecuente', 'cabe a lo ancho del cajon (416)'),
 ('BROCAS', 'G2', 'Juego 15 brocas HSS 1/16-1/2 Truper (estuche)', 'perforacion_corte', 'BASE', 150, 80, 20, 0.3, 'estimacion', 'frecuente', ''),
 ('ESCAL', 'G3', 'Juego 3 brocas escalonadas Truper', 'perforacion_corte', 'BASE', 150, 90, 35, 0.35, 'estimacion', 'frecuente', ''),
 # ---------------- BASE: inalambricas ----------------
 ('IMP14', 'B1', 'Atornillador de impacto M18 3650-20 (sin bateria)', 'inalambricas_energia', 'BASE', 196, 112, 60, 0.771, 'buscador', 'diario', 'acostado: planta alto x largo; espesor 60 estimado (buscador da 53)'),
 ('IMP38', 'B2', 'Llave de impacto M18 FUEL 3/8 2854-20 (sin bateria)', 'inalambricas_energia', 'BASE', 202, 122, 70, 1.089, 'buscador', 'frecuente', 'espesor 70 (buscador 65)'),
 ('ROTO18', 'B3', 'Rotomartillo M18 1/2 3602-20 (sin bateria)', 'inalambricas_energia', 'BASE', 202, 170, 75, 1.043, 'buscador', 'diario', 'largo 170 estimado (buscador 147 sin portabrocas)'),
 ('BAT1', 'B4', 'Bateria M18 CP2.0', 'inalambricas_energia', 'BASE', 115, 80, 60, 0.43, 'estimacion', 'diario', 'buscador solo da empaque'),
 ('BAT2', 'B5', 'Bateria M18 CP2.0', 'inalambricas_energia', 'BASE', 115, 80, 60, 0.43, 'estimacion', 'diario', ''),
 ('CARG1', 'nuevo', 'Cargador sencillo M18/M12 48-59-1812 (compra)', 'inalambricas_energia', 'BASE', 150, 100, 70, 0.4, 'estimacion', 'diario', 'el de 6 bahias no cabe en cajon: se queda en taller'),
 ('ESM45', 'M1', 'Mini esmeriladora 4-1/2 alambrica 6130-33 + cable', 'perforacion_corte', 'BASE', 300, 130, 105, 1.9, 'buscador', 'diario', 'largo 259 (buscador) + guarda; cable enrollado junto'),
 # ---------------- ELE ----------------
 ('FLUKE', 'A4', 'Pinza amperimetrica Fluke 302+', 'electrico', 'ELE', 207, 75, 34, 0.265, 'buscador', 'frecuente', '2 fuentes'),
 ('MAPPER', 'E8', 'Probador de cableado Fluke MicroMapper MT-8200-49A', 'electrico', 'ELE', 125, 52, 30, 0.13, 'buscador', 'ocasional', '2 fuentes'),
 ('PELA', 'A6', 'Pelacables Commercial Electric CE100821', 'electrico', 'ELE', 170, 55, 15, 0.2, 'estimacion', 'frecuente', ''),
 ('CRIMP', 'A7', 'Pinza crimpadora Weidmuller 1445070000', 'electrico', 'ELE', 230, 90, 30, 0.6, 'estimacion', 'frecuente', ''),
 ('KO', 'TPC10', 'Kit knockout M18 Force Logic 2677-23 (estuche)', 'electrico', 'ELE', 480, 330, 120, 7.5, 'estimacion', 'ocasional', 'la herramienta es 297x59x114 (2 fuentes); el estuche no tiene medida: queda en su estuche'),
 ('EXTECH', 'X-EXTECH', 'Amperimetro Extech MA440', 'electrico', 'ELE', 200, 70, 40, 0.3, 'estimacion', 'frecuente', ''),
 ('PONCH', 'X-PONCH', 'Pinza ponchadora RJ45', 'electrico', 'ELE', 200, 70, 25, 0.3, 'estimacion', 'ocasional', ''),
 ('DETV', 'X-DETV', 'Detector de voltaje Milwaukee', 'electrico', 'ELE', 155, 25, 25, 0.06, 'estimacion', 'frecuente', ''),
 ('SACAB', 'F2,F4,F5', '3 sacabocados Dogo 7, 13 y 19 mm', 'electrico', 'ELE', 130, 90, 40, 0.5, 'estimacion', 'ocasional', 'foto F'),
 # ---------------- SOL ----------------
 ('ESCMAG', 'Q3 + X-Q3b..d', '4 escuadras magneticas 4 in Truper (apiladas)', 'soldadura_metalmecanica', 'SOL', 150, 110, 60, 1.6, 'estimacion', 'diario', 'foto Q: 4 apiladas, 15 mm cada una'),
 ('PRES11B', 'L2', 'Pinza de presion C 11 in (2a)', 'soldadura_metalmecanica', 'SOL', 279, 110, 25, 0.85, 'buscador', 'frecuente', ''),
 ('PRES6CB', 'L6', 'Pinza de presion C 6 in (2a)', 'soldadura_metalmecanica', 'SOL', 152, 70, 22, 0.3, 'buscador', 'frecuente', ''),
 ('PRES10B', 'L8', 'Pinza de presion 10 in curva (2a)', 'soldadura_metalmecanica', 'SOL', 254, 70, 25, 0.5, 'buscador', 'frecuente', ''),
 ('PRES7B', 'L4', 'Pinza de presion 7 in (2a, hoy faltante)', 'soldadura_metalmecanica', 'SOL', 178, 60, 25, 0.35, 'nominal', 'frecuente', 'hueco en foto: comprar'),
 ('ESM45B', 'M2', 'Mini esmeriladora 4-1/2 6130-33 (2a)', 'perforacion_corte', 'SOL', 300, 130, 105, 1.9, 'buscador', 'diario', ''),
 ('RECT', 'X-DWRECT', 'Rectificador DeWalt DWE4887', 'soldadura_metalmecanica', 'SOL', 290, 70, 70, 1.3, 'estimacion', 'ocasional', ''),
 ('MOTO', 'X-MOTO', 'Moto tool Truper (estuche)', 'soldadura_metalmecanica', 'SOL', 300, 200, 80, 1.2, 'estimacion', 'ocasional', ''),
 ('MACH', 'F1', 'Juego 40 machuelos y tarrajas Truper 11442 (2 estuches)', 'soldadura_metalmecanica', 'SOL', 330, 290, 45, 2.5, 'estimacion', 'ocasional', 'foto F: estuche negro + naranja'),
 ('EXTOR', 'F6', 'Juego 5 extractores de tornillos Truper EXT-5', 'soldadura_metalmecanica', 'SOL', 130, 60, 20, 0.13, 'estimacion', 'ocasional', 'buscador da empaque 180x130x20'),
 ('EXTQ', 'Q4', 'Extractor de quijadas 6 t Urrea 4216', 'soldadura_metalmecanica', 'SOL', 300, 160, 50, 3.7, 'buscador', 'ocasional', 'buscador: 300x160x50, 3.7 kg (empaque)'),
 ('FRESA', 'G4', 'Fresa de carburo SF-5', 'soldadura_metalmecanica', 'SOL', 70, 15, 15, 0.05, 'estimacion', 'ocasional', ''),
 # ---------------- TUB ----------------
 ('STILL1', 'H7', 'Llave stillson 14 in Husky 73126', 'tuberia', 'TUB', 355, 90, 35, 1.3, 'nominal', 'diario', 'buscador 325x83x32; 14 in = 356'),
 ('STILL2', 'H8', 'Llave stillson 14 in Husky 73126', 'tuberia', 'TUB', 355, 90, 35, 1.3, 'nominal', 'diario', ''),
 ('CAIMAN', 'X-CAIMAN', 'Llave de cadena caiman 6 in Urrea 797UR', 'tuberia', 'TUB', 400, 80, 40, 1.5, 'estimacion', 'ocasional', ''),
 ('NIVTUB1', 'E4', 'Nivel para tuberia 6.5 in Milwaukee 48-22-5110', 'tuberia', 'TUB', 165, 45, 40, 0.3, 'buscador', 'frecuente', ''),
 ('NIVTUB2', 'E7', 'Nivel para tuberia 6.5 in Milwaukee 48-22-5110', 'tuberia', 'TUB', 165, 45, 40, 0.3, 'buscador', 'frecuente', ''),
 ('12R', 'O1-O6', 'Juego tarraja Ridgid 12R 36475 (matraca + 6 cabezales)', 'tuberia', 'TUB', 420, 320, 120, 15.8, 'estimacion', 'frecuente', 'peso 15.76 kg (buscador) > 11 kg por cajon: solo en la base 8420'),
 ('CAB34', 'X-12R34', 'Cabezal 12R 3/4 NPT de repuesto', 'tuberia', 'TUB', 100, 100, 60, 1.2, 'estimacion', 'ocasional', ''),
 # ---------------- CIV ----------------
 ('SDS', 'C2', 'Rotomartillo SDS-Plus 5485-21 (sin estuche)', 'perforacion_corte', 'CIV', 335, 195, 90, 3.0, 'buscador', 'diario', 'espesor 90 estimado (buscador 75)'),
 ('TAL12', 'C1', 'Taladro percutor alambrico 1/2 5375-20', 'perforacion_corte', 'CIV', 292, 200, 80, 2.73, 'buscador', 'frecuente', 'alto 200 estimado'),
 ('MANGOS', 'C3 + X-C3b', '2 mangos laterales', 'perforacion_corte', 'CIV', 200, 60, 50, 0.4, 'estimacion', 'frecuente', ''),
 ('SDSBIT', 'G1', 'Juego 15 brocas y cinceles SDS-Plus DeWalt DWA0870', 'perforacion_corte', 'CIV', 400, 250, 45, 2.2, 'estimacion', 'frecuente', 'foto G: charola metalica que ocupa casi todo el 8450'),
 ('MART2', 'H6', 'Martillo una curva 16 oz (2o)', 'mecanica_general', 'CIV', 340, 125, 35, 0.707, 'buscador', 'frecuente', ''),
 ('CALAD', 'R2', 'Sierra caladora Ryobi JS481LG', 'perforacion_corte', 'CIV', 236, 200, 79, 2.2, 'estimacion', 'ocasional', 'buscador da empaque'),
 ('LIJA', 'R3', 'Lijadora orbital M18 2648-20', 'perforacion_corte', 'CIV', 267, 146, 125, 0.907, 'buscador', 'ocasional', 'espesor 125: solo cabe en cajon de 130 o base'),
 ('SABLE', 'TPC14', 'Sierra sable 6509-31 (estuche original)', 'perforacion_corte', 'CIV', 520, 250, 120, 4.5, 'estimacion', 'ocasional', 'largo herramienta 483 (buscador); queda en su estuche'),
 # ---------------- MED ----------------
 ('LASER', 'R1', 'Nivel laser verde Bosch GLL 12-22 G', 'medicion_trazo', 'MED', 100, 64, 100, 0.35, 'buscador', 'frecuente', 'va parado: 100 de alto'),
 ('LASER2', 'X-LASER2', 'Nivel laser verde Bosch (2o)', 'medicion_trazo', 'MED', 100, 64, 100, 0.35, 'estimacion', 'frecuente', ''),
 ('ESCCAR', 'E2', 'Escuadra de carpintero 12 in Truper EC-12', 'medicion_trazo', 'MED', 305, 200, 15, 0.3, 'nominal', 'ocasional', ''),
 ('TORPEDO2', 'E6', 'Nivel torpedo magnetico 9 in (2o)', 'medicion_trazo', 'MED', 230, 45, 30, 0.2, 'buscador', 'frecuente', ''),
 ('AMARRE', 'D1-D4', '4 amarres tipo matraca 3.6 m (enrollados)', 'izaje_amarre', 'MED', 180, 120, 60, 1.6, 'estimacion', 'frecuente', 'en cajon de 61 no cabe: va al de 127/130'),
 ('GRILL', 'D9-D11', '3 grilletes 5/8 Crosby', 'izaje_amarre', 'MED', 130, 90, 45, 1.8, 'estimacion', 'ocasional', ''),
]
SUELTO = {'KO': 'estuche original del kit', 'SABLE': 'estuche original', '12R': 'estuche original Ridgid (15.8 kg > 11 kg por cajon)'}
out = []
for r in T:
    i, ref, desc, fam, mod, L, A, H, kg, f, fr, nota = r
    if L == 0:   # renglon de encabezado de juego: no se acomoda
        continue
    out.append({'id': i, 'ref': ref, 'desc': desc, 'familia': fam, 'modulo': mod, 'L': L, 'A': A, 'H': H,
                'peso_kg': kg, 'fuente_dim': f, 'frec': fr, 'nota': nota, 'validado': False, 'suelto': SUELTO.get(i)})
json.dump(out, open(os.path.join(D, 'piezas_carrito.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
from collections import Counter
print(len(out), Counter(p['modulo'] for p in out), Counter(p['fuente_dim'] for p in out))
for m in 'BASE ELE SOL TUB CIV MED'.split():
    ps = [p for p in out if p['modulo'] == m and not p['suelto']]
    print(m, 'area m2', round(sum(p['L']*p['A'] for p in ps)/1e6, 3), 'kg', round(sum(p['peso_kg'] for p in ps), 1))
