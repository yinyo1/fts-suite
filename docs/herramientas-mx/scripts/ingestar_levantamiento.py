"""Sesion nocturna 1 (#330), Bloque 2 · ingesta del levantamiento fisico.

Uso:
  python3 scripts/ingestar_levantamiento.py --conteo conteo_2026-09-29.csv --medicion medicion_2026-09-29.csv
  python3 scripts/ingestar_levantamiento.py ... --sin-recalculo     # solo escribe los json, no re-corre el acomodo

Que hace:
  1. Conteo (CSV de levantamiento_conteo.html) -> datos/conteo_fisico.json
       - estado por pieza (existe / no_existe / danada / sin_revisar) y numero de parte leido en placa
       - discrepancias: numero leido distinto del catalogo
       - existencia por renglon de compra -> la usa build_compra.py en lugar del listado 2025
  2. Medicion (CSV de levantamiento_medicion.html) -> datos/medicion_fisica.json
       - cajones por modelo (se usa la MENOR medida de las unidades medidas: conservador)
       - piezas del carrito base: largo, ancho, alto acostada, alto parada, peso
  3. Re-corre: validar_documental -> acomodo -> estimar_impresion -> build_compra -> prototipo -> hojas xlsx
     y reporta que cambio (cajas, alto de pila, costo).

Niveles tras la medicion (se aplican en validar_documental.py):
  V  validado = la medida fisica coincide +-3 mm con una documental DOBLE (D2)
  M  medida fisica = se midio, pero no hay doble documental o difiere mas de 3 mm. Se usa el valor fisico.
     (Nivel agregado en esta sesion: no esta en la escala del encargo; se documenta como supuesto.)
Nada de este script escribe en Odoo ni en n8n.
"""
import argparse, csv, io, json, os, re, subprocess, sys
BASE = os.path.join(os.path.dirname(__file__), '..'); D = os.path.join(BASE, 'datos'); S = os.path.dirname(__file__)

# Renglon de compra (build_compra.py) -> grupos de numero_interno del catalogo. Cada grupo es UNA unidad: la unidad
# existe si al menos la mitad de sus piezas se marco 'existe' (un juego al que le falta una pieza sigue contando).
MAPA = {
 'wiha32985': [['A2', 'A3', 'A8', 'A9', 'A10', 'A11', 'A12']], '48-22-2606': [['A1']], '48-22-6105': [['A5']],
 'husky109898': [['I5.1', 'I5.2', 'I5.3', 'I5.4', 'I5.5', 'I5.6', 'I5.7', 'I5.8', 'I5.9', 'I5.10', 'I5.11', 'I5.12']],
 '709195': [['I1'], ['I2']], '903465': [['I3'], ['I4']], '48-22-3531': [['L1'], ['L2']], '709207': [['L3'], ['L4']],
 '48-22-3532': [['L5'], ['L6']], '709204': [['L7'], ['L8']], '17018': [['J1'], ['J2'], ['J3']], '17016': [['J4'], ['J5'], ['J6']],
 '17301': [['J7'], ['J8']], '30-615': [['J11'], ['J12'], ['J13']], 'Hrrw7': [['K1']], 'Hbcw10': [['K2']],
 'dados38': [['P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P18', 'P19', 'P20', 'P23', 'P25', 'P28', 'P29', 'P30', 'P31', 'P32', 'P33', 'P34', 'P35']],
 'ext38': [['P36', 'P37', 'P38', 'N1']], '106475': [['N2'], ['P39', 'P40', 'P41']], 'torx': [['P1'], ['P2'], ['P3'], ['P4'], ['P5'], ['P6']],
 'MA-16F': [['H5'], ['H6']], 'MH-16': [['H4']], 'cinceles': [['H9', 'H10']], 'limas': [['H1', 'H2', 'H3']], '99735a': [['Q1']],
 '129291': [['TPC13']], '10790': [['E5'], ['E6']], '220IM': [['E1']], 'CALDI-6MP': [['E3']], '15-555': [['TPC12']],
 'brocasHSS': [['G2']], '101557': [['G3']], '2854-20': [['B2']], '48-11-1820': [['B4'], ['B5'], ['TPC5']],
 '6130-33': [['M1'], ['M2']], '302+': [['A4']], 'MA440': [['X-EXTECH']], 'MT-8200': [['E8']], 'CE100821': [['A6']],
 '1445070000': [['A7']], 'ponch': [['X-PONCH']], 'detv': [['X-DETV']], 'sacab': [['F2', 'F4', 'F5']], '2677-23': [['TPC10']],
 '15407': [['Q3'], ['X-Q3b'], ['X-Q3c'], ['X-Q3d']], 'DWE4887': [['X-DWRECT']], 'mototool': [['X-MOTO']], '11442': [['F1']],
 'EXT-5': [['F6']], '4216': [['Q4']], 'SF-5': [['G4']], '73126': [['H7'], ['H8']], '797UR': [['X-CAIMAN']],
 '48-22-5110': [['E4'], ['E7']], '36475': [['O1', 'O2', 'O3', 'O4', 'O5', 'O6']], '5485-21': [['C2']], '5375-20': [['C1']],
 'mangos': [['C3']], 'DWA0870': [['G1']], 'JS481LG': [['R2']], '2648-20': [['R3']], '6509-31': [['TPC14']], 'GLL12-22G': [['R1'], ['X-LASER2']],
 'EC-12': [['E2']], 'Fh0829': [['D1', 'D2', 'D3', 'D4']], 'grillete58': [['D9'], ['D10'], ['D11']],
 'comboM18': [['B1', 'B3']],
}

def leer_csv(path):
    txt = open(path, encoding='utf-8-sig').read()
    return list(csv.DictReader(io.StringIO(txt)))

def n(x): return re.sub(r'[^0-9a-z]', '', (x or '').lower())

def ingerir_conteo(path):
    R = leer_csv(path)
    cat = {c['numero_interno']: c for c in json.load(open(os.path.join(D, 'piezas_catalogo.json'), encoding='utf-8'))}
    por, disc, buscar, maletas = {}, [], {}, {}
    for r in R:
        sec, iid, est = r.get('seccion'), r.get('numero_interno'), (r.get('estado') or 'sin_revisar')
        if sec == 'buscar':
            buscar[iid] = {'estado': est, 'valor': r.get('parte_leida', ''), 'nota': r.get('nota', '')}; continue
        if sec == 'maleta':
            m = maletas.setdefault(r.get('caja'), {'existe': 0, 'no_existe': 0, 'danada': 0, 'sin_revisar': 0})
            m[est] = m.get(est, 0) + 1; continue
        por[iid] = {'estado': est, 'parte_leida': r.get('parte_leida', ''), 'nota': r.get('nota', ''), 'foto_caja': r.get('foto_caja', '')}
        c = cat.get(iid)
        if c and r.get('parte_leida') and n(r['parte_leida']) not in (n(c['numero_parte_corregido']), n(c.get('sku_tienda'))):
            disc.append({'numero_interno': iid, 'catalogo': c['numero_parte_corregido'], 'placa': r['parte_leida']})
    existencia = {}
    for sku, grupos in MAPA.items():
        k = 0
        for g in grupos:
            est = [por.get(i, {}).get('estado') for i in g]
            revisados = [e for e in est if e and e != 'sin_revisar']
            if not revisados: k = None; break           # grupo sin revisar: no se puede afirmar nada
            if sum(e in ('existe', 'danada') for e in est) >= len(g) / 2: k += 1
        if k is not None: existencia[sku] = k
    resumen = {e: sum(1 for v in por.values() if v['estado'] == e) for e in ('existe', 'no_existe', 'danada', 'sin_revisar')}
    out = {'fuente': os.path.basename(path), 'fecha': (R[0].get('fecha') if R else ''), 'rol': (R[0].get('rol') if R else ''),
           'resumen': resumen, 'piezas': por, 'discrepancias_numero_parte': disc, 'buscar_tambien': buscar, 'maletas': maletas,
           'existencia_por_renglon_compra': existencia}
    json.dump(out, open(os.path.join(D, 'conteo_fisico.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return out

def num(v):
    try: return float(v) if v not in (None, '') else None
    except ValueError: return None

def ingerir_medicion(path):
    R = leer_csv(path)
    caj, pz = {}, {}
    for r in R:
        if r.get('tipo') == 'cajon':
            caj.setdefault(r['modelo'], []).append({'unidad': int(r['unidad'] or 1), 'cajon': int(r['cajon'] or 1),
                'ancho': num(r['largo_o_ancho_mm']), 'fondo': num(r['ancho_o_fondo_mm']), 'alto': num(r['alto_mm']),
                'labio': num(r['labio_mm']), 'util': num(r['alto_util_mm']), 'nota': r.get('nota', '')})
        elif r.get('tipo') == 'pieza':
            pz[r['id']] = {'L': num(r['largo_o_ancho_mm']), 'A': num(r['ancho_o_fondo_mm']), 'H': num(r['alto_mm']),
                           'H_parada': num(r['alto_parado_mm']), 'peso_kg': (num(r['peso_g']) / 1000 if num(r['peso_g']) else None),
                           'parte_leida': r.get('parte_leida', ''), 'nota': r.get('nota', ''), 'instrumento': r.get('instrumento', ''), 'fecha': r.get('fecha', '')}
    # por modelo y numero de cajon: la menor medida entre unidades (conservador)
    cajones = {}
    for m, filas in caj.items():
        por = {}
        for f in filas: por.setdefault(f['cajon'], []).append(f)
        cajones[m] = {str(j): {k: (min(x[k] for x in fs if x[k]) if any(x[k] for x in fs) else None) for k in ('ancho', 'fondo', 'alto', 'labio', 'util')}
                      | {'unidades_medidas': len(fs)} for j, fs in sorted(por.items())}
    out = {'fuente': os.path.basename(path), 'cajones': cajones, 'piezas': pz}
    json.dump(out, open(os.path.join(D, 'medicion_fisica.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return out

def correr(script):
    r = subprocess.run([sys.executable, os.path.join(S, script)], capture_output=True, text=True, cwd=S)
    if r.returncode: raise SystemExit(f'{script} fallo:\n{r.stderr[-2000:]}')
    return r.stdout

def estado_actual():
    dz = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
    mods = {m: ' + '.join(c['modelo'] for c in v['cajas']) for m, v in dz['modulos'].items()}
    from openpyxl import load_workbook
    ws = load_workbook(os.path.join(BASE, 'asignacion_y_compra.xlsx'), read_only=True)['Resumen']
    res = {r[0]: r[1] for r in ws.iter_rows(min_row=2, values_only=True) if r and r[0]}
    return {'modulos': mods, 'cajas': sum(len(v['cajas']) for v in dz['modulos'].values()),
            'alto_total': sum(v['metricas']['alto_mm'] for v in dz['modulos'].values()),
            'total_sin_iva': res.get('TOTAL con precio conocido, normalizado SIN IVA (tienda / 1.16)'),
            'total_conservador': res.get('TOTAL con precio conocido (MXN, mezcla de precios sin IVA pagados y precios de tienda)')}

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--conteo'); ap.add_argument('--medicion'); ap.add_argument('--sin-recalculo', action='store_true')
    a = ap.parse_args()
    if not (a.conteo or a.medicion): ap.error('pasa --conteo y/o --medicion')
    antes = estado_actual()
    if a.conteo:
        c = ingerir_conteo(a.conteo)
        print('conteo:', c['resumen'], '| discrepancias de numero de parte:', len(c['discrepancias_numero_parte']),
              '| renglones de compra con existencia fisica:', len(c['existencia_por_renglon_compra']))
    if a.medicion:
        m = ingerir_medicion(a.medicion)
        print('medicion:', len(m['cajones']), 'modelos de cajon,', len(m['piezas']), 'piezas')
    if a.sin_recalculo: sys.exit(0)
    for s in ('validar_documental.py', 'acomodo.py', 'estimar_impresion.py', 'build_compra.py', 'build_prototipo_carrito.py', 'hojas_sesion_nocturna.py'):
        correr(s)
    despues = estado_actual()
    print('\nANTES  ', json.dumps(antes, ensure_ascii=False)); print('DESPUES', json.dumps(despues, ensure_ascii=False))
    val = json.load(open(os.path.join(D, 'validacion_documental.json'), encoding='utf-8'))
    from collections import Counter
    c = Counter(p[k]['nivel'] for p in val['piezas'] for k in ('L', 'A', 'H'))
    print('niveles por medida:', dict(c))
