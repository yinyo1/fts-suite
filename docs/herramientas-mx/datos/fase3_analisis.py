#!/usr/bin/env python3
"""Fase 3 - Frentes simultaneos, permanencia por planta y rotacion de cuadrilla.

Fuente: Odoo (MCP FTS_Odoo, solo lectura), consultas listadas en fase3_queries.md.

Dos etapas:
  (0) PREP  - solo si existe el directorio RAW (salidas crudas del MCP, formato tabla de ancho fijo):
              construye so_clasificadas.tsv, attendance_dia_empleado_so.tsv y attendance_dia_so.tsv.
  (1..4)    - analisis a partir de los TSV (reproducible sin acceso a Odoo).

Uso:  python3 fase3_analisis.py [RAW_DIR]
"""
import csv, json, os, re, sys, statistics, datetime as dt
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = sys.argv[1] if len(sys.argv) > 1 else None

# ----------------------------------------------------------------------------
# Catalogos (todos salen de consultas de esta fase; ver fase3_queries.md)
# ----------------------------------------------------------------------------
# project.project leidos por id (Q8). stage = stage_id; company = company_id.
PROYECTOS = {
    2302: dict(so='SO11547', nombre='Desinstalacion, Adecuacion e Integracion...', cliente='Nalco de Mexico', stage='In Progress', company='MX'),
    121:  dict(so='SO9428',  nombre='INSTALACION DE SUMINISTRO D... (upgrade Vertiv loop cerrado)', cliente='Nalco de Mexico', stage='In Progress', company='MX'),
    160:  dict(so='SO10300', nombre='Techo de Magnekon', cliente='MAGNEKON', stage='En plazo de credito', company='MX'),
    2349: dict(so='SO11762', nombre='Mejoras a sistema TOPOCHICO, MTY', cliente='Nalco de Mexico', stage='En plazo de credito', company='MX'),
    212:  dict(so='SO10337', nombre='Cortinas de seguridad 120s...', cliente='Bridgestone Mexico', stage='In Progress', company='MX'),
    2352: dict(so='SO11699', nombre='Instalacion mecanica y electrica de sensores', cliente='Bridgestone Mexico', stage='In Progress', company='MX'),
    241:  dict(so='SO11290', nombre='Test loop ingenieria mexicali', cliente='Nalco de Mexico', stage='En plazo de credito', company='MX'),
    155:  dict(so='SO10344', nombre='Budenheim Proyecto ergonomia', cliente='Budenheim Mexico', stage='Complete TOTAL (Gera)', company='MX'),
    2375: dict(so='SO11498', nombre='Ingenieria conceptual para el diseno', cliente='Bridgestone Mexico', stage='In Progress', company='MX'),
    2305: dict(so='SO11557', nombre='Proyecto de instalacion de en...', cliente='Mission Foods', stage='Complete TOTAL (Gera)', company='USA'),
    2327: dict(so='SO11511', nombre='Valvula para lavado de botellas', cliente='BEBIDAS PURIFICADAS', stage='En plazo de credito', company='MX'),
    515:  dict(so='SO11516', nombre='Servicio de cambio de bomba', cliente='Mission Foods', stage='Complete TOTAL (Gera)', company='USA'),
    506:  dict(so='SO11492', nombre='Instalacion de ductos de aire', cliente='Mission Foods', stage='In Progress', company='MX'),
    28:   dict(so='SO5995',  nombre='Vertiv- Instalacion y suministro', cliente='Nalco de Mexico', stage='Complete TOTAL (Gera)', company='MX'),
    2328: dict(so='SO11644', nombre='Supply of YAMATO EV211', cliente='CORPORATE USA', stage='Complete TOTAL (Gera)', company='USA'),
    2337: dict(so='SO11551', nombre='Suministro y Puesta en marcha chiller', cliente='QUIMITEC', stage='Complete TOTAL (Gera)', company='MX'),
    2356: dict(so='SO11773', nombre='ELECTRICAL DUMP STATION DALLAS', cliente='Mission Foods', stage='Done Operations', company='USA'),
    126:  dict(so='SO9667',  nombre='montaje de 2 lamparas', cliente='MONDELEZ MEXICO', stage='Canceled', company='MX'),
    101:  dict(so='SO7723',  nombre='integracion de sistema', cliente='MAGNEKON', stage='En plazo de credito', company='MX'),
    2297: dict(so='SO11526', nombre='Mezzanine Structural Field Assembly', cliente='Budenheim USA', stage='Complete TOTAL (Gera)', company='USA'),
}
# Planta inferida por proyecto (el partner_shipping_id de la SO es la direccion FISCAL del cliente,
# no la planta: Nalco = Santa Fe CDMX, Mondelez = Puebla, etc. -> Q3/Q4). Se infiere de la descripcion.
PLANTA = {
    2302: ('TOPO_CHICO', 'media: descripcion SO11547 no nombra la planta; CLAUDE.md la identifica como Topo Chico y SO11663/SO11855 son adicionales "Proyecto TCh"'),
    2349: ('TOPO_CHICO', 'alta: descripcion "Mejoras a sistema TOPOCHICO, MTY"'),
    121:  ('VERTIV', 'media: descripcion "upgrade de vertiv loop cerrado"; ubicacion no registrada en Odoo'),
    28:   ('VERTIV', 'media: "Vertiv- Instalacion y suministro"'),
    160:  ('MAGNEKON', 'baja-media: la usan tambien RH/Legal/Contabilidad (ver advertencias)'),
    101:  ('MAGNEKON', 'media'),
    212:  ('BRIDGESTONE', 'media'),
    2352: ('BRIDGESTONE', 'media'),
    2375: ('BRIDGESTONE_ING', 'ingenieria de escritorio (1 persona/dia, disenador industrial)'),
    155:  ('BUDENHEIM', 'media'),
    241:  ('NALCO_MEXICALI_ING', 'ingenieria conceptual (Diseno e ingenieria coneptual para tray...)'),
    2327: ('BEBIDAS_PURIFICADAS', 'media'),
    506:  ('MISSION_FOODS', 'baja: planta no registrada'),
    2337: ('QUIMITEC', 'media'),
    126:  ('MONDELEZ', 'baja'),
    2305: ('USA', 'proyecto de FTS USA'), 515: ('USA', 'proyecto de FTS USA'),
    2356: ('USA', 'proyecto de FTS USA'), 2328: ('USA', 'proyecto de FTS USA'), 2297: ('USA', 'proyecto de FTS USA'),
}
# Proyectos que NO son frente de campo: ingenieria de escritorio y proyectos de la empresa USA.
NO_FRENTE = {2375, 241, 2305, 515, 2356, 2328, 2297}

# Nombres truncados en la salida del MCP -> id (hr.employee, Q9)
TRUNC_EMP = {
    'Israel Enrique Rodríguez Hernández': 109, 'Jesus Esteban De La Cruz Calderon': 32,
    'Brandon Alexander Barrón Balderas': 133, 'Jonathan Missael Carrizales Hernández': 122,
    'Carlos Guadalupe Guerrero Medrano': 50,
}
# Cuadrilla de interes (ids de hr.employee, Q9)
CUADRILLA = {76: 'Carlos Manzanares', 75: 'Mateo Salazar', 124: 'Germán Merino', 121: 'Stephany Ventura',
             6: 'Leonel Cruz', 79: 'José Luis Romero', 127: 'César Gómez', 128: 'Enoc Maldonado',
             130: 'Rolando Vázquez', 131: 'Tomás Vázquez', 154: 'Ramiro Segovia', 112: 'Felipe Pérez',
             25: 'Héctor Cruz', 55: 'Juan Manuel Sánchez'}
# Personal de oficina (department_id Comercial/Admin y Finanzas/Legal/RH/Direccion, Q9), menos
# Francisco Montalvo (8), que figura en Comercial pero opera en sitio.
OFICINA = {32, 47, 48, 59, 60, 62, 63, 78, 84, 85, 97, 98, 101, 108, 143, 149, 150, 153, 155, 156}

# res.partner de envio (Q4): id, ciudad, estado. Es la direccion FISCAL/HQ del cliente, NO la planta.
SHIP = {
    'BEBIDAS PURIFICADAS': (897, 'Ciudad de Mexico', 'Estado de Mexico'), 'Bridgestone México': (880, 'Ciudad de México', 'CDMX'),
    'Budenheim Mexico': (815, 'Santa Catarina', 'Nuevo León'), 'CBRE GCS, S. de R.L. de C.V.': (66, 'Miguel Hidalgo', 'CDMX'),
    'CHEMTREAT MEXICO': (1945, 'Ciudad de Mexico', ''), 'CONMET DE MEXICO': (2269, 'Ciénega de Flores', ''),
    'CORPORATE USA': (943, 'Irving', 'Texas'), 'Heritage Interactive': (453, '', ''), 'IG ANUNCIOS': (2022, '', 'Nuevo León'),
    'Industrial de Cuautitlan': (670, 'Ramos Arizpe', 'Coahuila'), 'Ivan Alaniss budenheim': (516, '', ''),
    'MAGNEKON S.A. DE C.V.': (895, 'San Nicolas de los Garza', 'Nuevo León'), 'MONDELEZ MEXICO': (7, 'Puebla', 'Puebla'),
    'Mission Foods': (1630, 'Irving', 'Texas'), 'Nalco de Mexico': (94, 'Cuajimalpa de Morelos', 'CDMX'),
    'Perama Logistics SA de CV': (948, 'Monterrey', 'Nuevo León'), 'QUIMITEC TRATAMIENTO DE AGUAS': (1502, 'Monterrey', 'Nuevo León'),
    'Quikrete Las Vegas': (1927, 'North Las Vegas', 'Nevada'), 'Racing Cargo Mexico': (722, 'San Pedro Garza Garcia', 'Nuevo León'),
    'Regal Rexnord': (596, '', ''), 'TOMOGAI SA DE CV': (2021, 'Monterrey', 'Nuevo León'), 'Visionary': (1745, 'Rochester', 'Michigan'),
    'ZZ-PRUEBA A3': (2260, '', ''),
    # Q4b
    'JOHNSON CONTROLS ENTERPRISES MEXICO': (900, 'San Pedro Garza García', 'Nuevo León'),
    'British American Tobacco Mexico S.A. de…': (400, 'Monterrey', 'Nuevo León'),
    'HISENSE MONTERREY HOME APPLIANCE MANUFA…': ('1410/1421', 'Salinas Victoria', 'Nuevo León'),
    'TRANSPELSA TRANSPORTE & LOGISTICA': (1490, 'Apodaca', 'Nuevo León'),
    'Nalco de Mexico, Misael Constantino': (289, 'Cuajimalpa de Morelos (contacto de Nalco)', 'CDMX'),
    'Nalco de Mexico, Tito Everardo Ordaz': (2237, 'Cuajimalpa de Morelos (contacto de Nalco)', 'CDMX'), 'departamento B6': (872, '', ''), 'TECNOLOGIAS Y PRODUCTOS YIN SA DE CV': ('', '', ''),
}

GAP_MAX = 4  # dias naturales: cubre fin de semana (vie->lun = 3) + 1 dia sin registro

# ----------------------------------------------------------------------------
# (0) PREP desde salidas crudas
# ----------------------------------------------------------------------------
def parse_fw(path):
    L = open(path, encoding='utf-8').read().splitlines()
    for i, l in enumerate(L):
        if l.startswith('---') and i > 0:
            hdr, start = L[i - 1], i + 1
            break
    names = hdr.split(); pos = []; p = 0
    for n in names:
        j = hdr.index(n, p); pos.append(j); p = j + len(n)
    rows = []
    for l in L[start:]:
        if not l.strip():
            break
        rows.append({n: (l[pos[k]:pos[k + 1]] if k + 1 < len(names) else l[pos[k]:]).strip()
                     for k, n in enumerate(names)})
    return rows

def emp_id(s):
    m = re.search(r'\[id=(\d+)\]$', s)
    if m:
        return int(m.group(1)), s[:m.start()].strip()
    for k, v in TRUNC_EMP.items():
        if s.startswith(k):
            return v, k
    raise ValueError(s)

def proj_id(s):
    if s == '(sin valor)':
        return None
    m = re.search(r'SO\d+', s)
    so = m.group(0)
    for pid, d in PROYECTOS.items():
        if d['so'] == so:
            return pid
    raise ValueError(s)

# --- clasificacion Parte A ---
OTROS = [
    (r'flete|freight|inland|env[ií]o de empaque|origen: bsh|servicio de transporte', 'flete'),
    (r'renta de (primera |segunda )?pipa|renta de pipa|rompedoras|renta de personal|\bgenie\b|centro de costos', 'renta'),
    (r'licencia|factory talk', 'licencia/software'),
    (r'an[aá]lisis ac|analisis de ho|servicio d ?e ?tercero|curso', 'servicio de tercero/analisis'),
    (r'orden de prueba|zz prueba', 'prueba'),
]
SUMINISTRO = r'^(suministro|sumnistro|suminsitro)( de)? (materiales|material|mro|refacciones|equipo|pintura|lamparas|l[aá]mparas|piezas|rejilla|termostato|accesorios|insumos|clima|chiller)|^suministros de|template suministro|listado de material'
INGENIERIA = r'ingenier[ií]a conceptual|dise[ñn]o e ingenier|ingenier[ií]a dise|ingenier[ií]a caterpillar|test loop ingenier'
INSTALA = r'instala|montaje|mano de obra|fabricaci|colocaci|ejecuci[oó]n de t|reparaci'
TIPOS = {
    'hvac': r'hvac|aire acondicionado|\bclimas?\b|chiller|extractor|ductos?\b|ductwork|ducter[ií]a|agua helada|sistema de aire|minisplit|intercambiador|secci[oó]n de d',
    'soldadura_tuberia_proceso': r'tuber[ií]a|soldad|acero inox|inoxidable|\binox\b|sanitari|\bskid|cpvc|\bpvc|\bptr\b|estructura met[aá]lica|mezz?anine|brida|placas de acero|\brack\b|cubierta de acero|injerto|toma para|tanque|loop|fabricaci[oó]n|drain',
    'electrico_control': r'tablero|cablead|\bplc\b|automatiz|el[eé]ctric|charola|canaleta|conduit|luminari|l[aá]mpara|alumbrado|acometida|subestaci|rayos x|sensor|detector de metales|programaci|interruptor|bajadas|variador|puesta a tierra|\bmotor|relay|reley|[aá]nodo|cobot|dosificador|se[ñn]ales|integraci[oó]n de sistema|110|calibraci|puesta en marcha',
    'mecanico_instalacion': r'montaje|instalaci[oó]n de equipo|maquinaria|\bbandas?\b|conveyor|transportador|rigging|maniobra|prensa|compresor|pluma|polipasto|cortina|elevador|apilador|falda|bomba|v[aá]lvula|filtro|paso de gato|\bmesa\b|m[aá]quina|mantenimiento a motor|ergonom|velocidad|embo|fugas|limpieza a tanque|rampa|mec[aá]nic|booster|soporte de cable|mantenimiento preventivo|water supp',
    'obra_civil_ligera': r'concreto|\bpiso|\bmuro|obra civil|alba[ñn]il|encofrado|tapiz|pintura|resanar|techo|impermeab|pared|escalones|fosa',
}

def clasifica(desc, lineas, proyecto):
    t_desc = (desc + ' ' + proyecto).lower()
    t_all = (t_desc + ' ' + lineas).lower()
    for rx, et in OTROS:
        m = re.search(rx, t_all)
        if m:
            return 'otros', f"{et}: '{m.group(0)}'", 'alta'
    head = t_desc.strip()
    if re.search(SUMINISTRO, head) and not re.search(INSTALA, t_desc):
        m = re.search(SUMINISTRO, head)
        return 'otros', f"suministro solamente: '{m.group(0)}'", 'alta'
    if re.search(INGENIERIA, t_all) and not re.search(r'instala|fabricaci', t_all):
        return 'otros', f"ingenieria/diseno: '{re.search(INGENIERIA, t_all).group(0)}'", 'media'
    score = {}; hit = {}
    for tipo, rx in TIPOS.items():
        d = set(m.group(0) for m in re.finditer(rx, t_desc))
        l = set(m.group(0) for m in re.finditer(rx, lineas.lower())) - d
        s = 2 * len(d) + len(l)
        if s:
            score[tipo] = s; hit[tipo] = sorted(d) + sorted(l)
    if not score:
        if re.search(r'suministro', t_all) and not re.search(INSTALA, t_all):
            return 'otros', 'suministro sin instalacion', 'media'
        return 'otros', 'sin palabra clave (texto truncado o vacio)', 'baja'
    ranked = sorted(score.items(), key=lambda x: -x[1])
    tipo, s1 = ranked[0]
    s2 = ranked[1][1] if len(ranked) > 1 else 0
    conf = 'alta' if (s1 >= 2 and s1 >= 2 * s2) else ('media' if s1 > s2 else 'baja')
    return tipo, ', '.join("'%s'" % h for h in hit[tipo][:4]), conf

def prep(raw):
    so = parse_fw(os.path.join(raw, 'raw_so.txt'))
    lines = parse_fw(os.path.join(raw, 'raw_sol1.txt')) + parse_fw(os.path.join(raw, 'raw_sol2.txt'))
    first = defaultdict(list)
    for r in lines:
        n = r['name']
        if n.startswith('Mandar ') or n.startswith('Down payment'):
            continue
        if len(first[r['order_id']]) < 3:
            first[r['order_id']].append(n)
    for l in open(os.path.join(raw, 'lines_p3.tsv'), encoding='utf-8'):
        k, v = l.rstrip('\n').split('\t')
        first.setdefault(k, []).extend([x.strip() for x in v.split(' | ')][:3])
    with open(os.path.join(HERE, 'so_clasificadas.tsv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f, delimiter='\t')
        w.writerow(['so_id', 'so', 'fecha', 'cliente', 'partner_shipping', 'shipping_id', 'shipping_ciudad', 'monto_sin_iva', 'moneda',
                    'proyecto_odoo', 'descripcion_trunc40', 'primeras_lineas_trunc40', 'tipo', 'palabra_clave', 'confianza'])
        for r in so:
            desc = ' '.join(x for x in [r['x_studio_proyect_description'], r['x_studio_alcance_del_proyecto_descripcio']] if x)
            ln = ' | '.join(first.get(r['name'], []))
            tipo, kw, conf = clasifica(desc, ln, r['project_id'])
            if r['partner_id'].startswith('ZZ-PRUEBA') or 'ORDEN DE PRUEBA' in desc.upper():
                tipo, kw, conf = 'otros', 'SO de prueba (ZZ-PRUEBA / ORDEN DE PRUEBA)', 'alta'
            sh = SHIP.get(r['partner_shipping_id'])
            sh_id, sh_city = (sh[0], ', '.join(x for x in sh[1:] if x)) if sh else ('', '(contacto del cliente; no consultado)')
            w.writerow([r['id'], r['name'], r['date_order'][:10], r['partner_id'], r['partner_shipping_id'], sh_id, sh_city,
                        r['amount_untaxed'].replace(',', ''), r['currency_id'], r['project_id'], desc, ln, tipo, kw, conf])
    # asistencias
    recs = []
    for i in range(1, 8):
        for r in parse_fw(os.path.join(raw, f'raw_w{i}.txt')):
            eid, en = emp_id(r['employee_id'])
            recs.append((r['check_in:day'], eid, en, proj_id(r['x_studio_project_id']), int(r['registros'])))
    recs.sort()
    with open(os.path.join(HERE, 'attendance_dia_empleado_so.tsv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f, delimiter='\t')
        w.writerow(['dia', 'employee_id', 'empleado', 'project_id', 'so', 'planta_inferida', 'n_registros'])
        for d, eid, en, pid, n in recs:
            w.writerow([d, eid, en, pid or '', PROYECTOS[pid]['so'] if pid else '', PLANTA[pid][0] if pid else '', n])
    agg = defaultdict(lambda: [0, set()])
    for d, eid, en, pid, n in recs:
        if pid:
            agg[(d, pid)][0] += n; agg[(d, pid)][1].add(eid)
    with open(os.path.join(HERE, 'attendance_dia_so.tsv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f, delimiter='\t')
        w.writerow(['dia', 'so', 'project_id', 'planta_inferida', 'n_registros', 'n_empleados', 'es_frente_campo'])
        for (d, pid), (n, es) in sorted(agg.items()):
            w.writerow([d, PROYECTOS[pid]['so'], pid, PLANTA[pid][0], n, len(es), 'no' if pid in NO_FRENTE else 'si'])

# ----------------------------------------------------------------------------
# (1..4) ANALISIS
# ----------------------------------------------------------------------------
def D(s): return dt.date.fromisoformat(s)

def pct(vals, q):
    v = sorted(vals)
    if not v: return None
    k = (len(v) - 1) * q; f = int(k); c = min(f + 1, len(v) - 1)
    return round(v[f] + (v[c] - v[f]) * (k - f), 2)

def dist(vals):
    return dict(n=len(vals), max=max(vals) if vals else None, p95=pct(vals, .95), p90=pct(vals, .90),
                p75=pct(vals, .75), mediana=pct(vals, .5), media=round(statistics.mean(vals), 2) if vals else None)

def analiza():
    rows = list(csv.DictReader(open(os.path.join(HERE, 'attendance_dia_empleado_so.tsv'), encoding='utf-8'), delimiter='\t'))
    R = {}
    tot = sum(int(r['n_registros']) for r in rows)
    con = [r for r in rows if r['project_id']]
    R['cobertura'] = dict(
        registros_total=tot, registros_con_proyecto=sum(int(r['n_registros']) for r in con),
        primer_dia=min(r['dia'] for r in rows), ultimo_dia=max(r['dia'] for r in rows),
        primer_dia_con_proyecto_sostenido=min(r['dia'] for r in con if r['dia'] >= '2026-01-01'),
        dias_con_proyecto_antes_2026_04=sorted({r['dia'] for r in con if r['dia'] < '2026-04-01'}))
    # cobertura mensual
    mes = defaultdict(lambda: [0, 0])
    for r in rows:
        m = r['dia'][:7]; n = int(r['n_registros'])
        mes[m][0] += n
        if r['project_id']: mes[m][1] += n
    R['cobertura_mensual'] = {m: dict(registros=a, con_proyecto=b, pct=round(100 * b / a, 1)) for m, (a, b) in sorted(mes.items())}
    # cobertura por dia en la ventana con captura (>= 2026-04-23), solo campo (no oficina)
    VENT = '2026-04-23'
    cov = defaultdict(lambda: [0, 0])
    for r in rows:
        if r['dia'] < VENT or int(r['employee_id']) in OFICINA: continue
        cov[r['dia']][0] += 1
        if r['project_id']: cov[r['dia']][1] += 1
    R['ventana'] = dict(desde=VENT, hasta=max(r['dia'] for r in rows),
                        empleado_dia_campo=sum(a for a, b in cov.values()),
                        empleado_dia_campo_con_proyecto=sum(b for a, b in cov.values()))
    R['ventana']['pct'] = round(100 * R['ventana']['empleado_dia_campo_con_proyecto'] / R['ventana']['empleado_dia_campo'], 1)

    grp = {'campo': lambda e: e not in OFICINA, 'cuadrilla': lambda e: e in CUADRILLA, 'oficina': lambda e: e in OFICINA}
    R['cobertura_ventana_por_grupo_mes'] = {}
    for g, f in grp.items():
        m = defaultdict(lambda: [0, 0])
        for r in rows:
            if r['dia'] < VENT or not f(int(r['employee_id'])): continue
            m[r['dia'][:7]][0] += 1; m[r['dia'][:7]][1] += bool(r['project_id'])
        R['cobertura_ventana_por_grupo_mes'][g] = {k: dict(empleado_dia=a, con_proyecto=b, pct=round(100 * b / a, 1)) for k, (a, b) in sorted(m.items())}
    mg = [r for r in rows if r['project_id'] == '160']
    R['magnekon_registros'] = dict(total=sum(int(r['n_registros']) for r in mg),
                                   oficina=sum(int(r['n_registros']) for r in mg if int(r['employee_id']) in OFICINA))

    def frentes(sub, excluir_magnekon_oficina=False):
        porDia = defaultdict(lambda: (set(), set()))
        for r in sub:
            if not r['project_id'] or r['dia'] < VENT: continue
            pid = int(r['project_id'])
            if pid in NO_FRENTE: continue
            if excluir_magnekon_oficina and PLANTA[pid][0] == 'MAGNEKON' and int(r['employee_id']) in OFICINA: continue
            porDia[r['dia']][0].add(pid); porDia[r['dia']][1].add(PLANTA[pid][0])
        dias = sorted(porDia)
        so_n = [len(porDia[d][0]) for d in dias]; pl_n = [len(porDia[d][1]) for d in dias]
        out = dict(dias_con_frente=len(dias), frentes_SO=dist(so_n), plantas=dist(pl_n),
                   dias_plantas_ge2=sum(x >= 2 for x in pl_n), dias_plantas_ge3=sum(x >= 3 for x in pl_n),
                   dias_plantas_ge4=sum(x >= 4 for x in pl_n),
                   dias_habiles=dict(n=sum(D(d).weekday() < 5 for d in dias)))
        wk = [len(porDia[d][1]) for d in dias if D(d).weekday() < 5]
        out['plantas_solo_lun_vie'] = dist(wk)
        out['hist_plantas'] = dict(sorted(Counter(pl_n).items()))
        bym = defaultdict(list)
        for d, x in zip(dias, pl_n): bym[d[:7]].append(x)
        out['por_mes'] = {m: dict(dias=len(v), max=max(v), mediana=pct(v, .5), media=round(statistics.mean(v), 2),
                                  dias_ge2=sum(x >= 2 for x in v), dias_ge3=sum(x >= 3 for x in v), dias_ge4=sum(x >= 4 for x in v))
                          for m, v in sorted(bym.items())}
        out['_porDia'] = {d: sorted(porDia[d][1]) for d in dias}
        return out
    R['frentes_todos'] = frentes(rows)
    R['frentes_sin_oficina_en_magnekon'] = frentes(rows, True)
    R['frentes_solo_cuadrilla'] = frentes([r for r in rows if int(r['employee_id']) in CUADRILLA])
    R['frentes_sin_oficina'] = frentes([r for r in rows if int(r['employee_id']) not in OFICINA])
    R['frentes_sin_oficina'].pop('_porDia')
    pd_ = R['frentes_todos'].pop('_porDia'); R['frentes_sin_oficina_en_magnekon'].pop('_porDia'); R['frentes_solo_cuadrilla'].pop('_porDia')

    # --- (2) corridas empleado-planta ---
    def empdias(sub):
        E = defaultdict(lambda: defaultdict(set))
        for r in sub:
            if not r['project_id'] or r['dia'] < VENT: continue
            pid = int(r['project_id'])
            if pid in NO_FRENTE: continue
            E[int(r['employee_id'])][r['dia']].add(PLANTA[pid][0])
        return E
    def corridas(E):
        runs = []  # (emp, planta, inicio, fin, dias_registrados)
        for e, dd in E.items():
            cur = {}
            for d in sorted(dd):
                for pl in list(cur):
                    # cierra la corrida si ese dia (con planta registrada) es otra planta, o si el hueco es largo
                    if pl not in dd[d] or (D(d) - D(cur[pl][1])).days > GAP_MAX:
                        s, f, n = cur.pop(pl); runs.append((e, pl, s, f, n))
                for pl in dd[d]:
                    if pl in cur: cur[pl] = (cur[pl][0], d, cur[pl][2] + 1)
                    else: cur[pl] = (d, d, 1)
            for pl, (s, f, n) in cur.items(): runs.append((e, pl, s, f, n))
        return runs
    def resume_runs(runs):
        out = {}
        dias_reg = [r[4] for r in runs]; span = [(D(r[3]) - D(r[2])).days + 1 for r in runs]
        out['global'] = dict(corridas=len(runs), dias_registrados=dist(dias_reg), dias_naturales=dist(span))
        byp = defaultdict(list)
        for r in runs: byp[r[1]].append(r)
        out['por_planta'] = {pl: dict(corridas=len(v), dias_registrados=dist([x[4] for x in v]),
                                      dias_naturales=dist([(D(x[3]) - D(x[2])).days + 1 for x in v]))
                             for pl, v in sorted(byp.items(), key=lambda x: -len(x[1]))}
        return out
    Eall = empdias(rows); Ecua = empdias([r for r in rows if int(r['employee_id']) in CUADRILLA])
    R['corridas_todos'] = resume_runs(corridas(Eall))
    R['corridas_cuadrilla'] = resume_runs(corridas(Ecua))

    # presencia por planta (cualquier empleado FTS)
    P = defaultdict(set); Pemp = defaultdict(set)
    for r in rows:
        if r['project_id'] and r['dia'] >= VENT and int(r['project_id']) not in NO_FRENTE:
            pl = PLANTA[int(r['project_id'])][0]; P[pl].add(r['dia']); Pemp[pl].add(int(r['employee_id']))
    pres = {}
    for pl, ds in P.items():
        ds = sorted(ds); best = cur = 1; bs = cs = ds[0]; be = ds[0]; tramos = 1
        for a, b in zip(ds, ds[1:]):
            if (D(b) - D(a)).days <= GAP_MAX: cur += 1
            else:
                tramos += 1; cur = 1; cs = b
            if cur > best: best, bs, be = cur, cs, b
        pres[pl] = dict(primer_dia=ds[0], ultimo_dia=ds[-1], span_naturales=(D(ds[-1]) - D(ds[0])).days + 1,
                        dias_con_asistencia=len(ds), tramos_continuos=tramos,
                        tramo_mas_largo_dias_registrados=best, tramo_mas_largo=f'{bs}..{be}',
                        tramo_mas_largo_naturales=(D(be) - D(bs)).days + 1, empleados_distintos=len(Pemp[pl]))
    R['presencia_planta'] = dict(sorted(pres.items(), key=lambda x: -x[1]['dias_con_asistencia']))

    # --- (3) rotacion ---
    def rotacion(E, ids=None):
        res = {}; tot_tr = tot_ch = 0; multi = 0; empdias_n = 0
        for e, dd in E.items():
            if ids and e not in ids: continue
            ds = sorted(dd); empdias_n += len(ds)
            multi_e = sum(len(dd[d]) >= 2 for d in ds); multi += multi_e
            tr = ch = 0
            for a, b in zip(ds, ds[1:]):
                if (D(b) - D(a)).days > GAP_MAX: continue
                tr += 1
                if dd[a] != dd[b]: ch += 1
            semanas = max(1, ((D(ds[-1]) - D(ds[0])).days + 1) / 7)
            res[e] = dict(dias_con_planta=len(ds), transiciones=tr, cambios=ch,
                          pct_cambio=round(100 * ch / tr, 1) if tr else None,
                          cambios_por_semana=round(ch / semanas, 2), dias_multiplanta=multi_e,
                          plantas=sorted(set().union(*dd.values())))
            tot_tr += tr; tot_ch += ch
        cps = [v['cambios_por_semana'] for v in res.values() if v['dias_con_planta'] >= 10]
        return dict(empleados=len(res), transiciones=tot_tr, cambios=tot_ch,
                    pct_cambio=round(100 * tot_ch / tot_tr, 1) if tot_tr else None,
                    empleado_dias=empdias_n, empleado_dias_multiplanta=multi,
                    pct_multiplanta=round(100 * multi / empdias_n, 1) if empdias_n else None,
                    cambios_por_semana_empleados_10d=dist(cps) if cps else None, detalle=res)
    R['rotacion_todos'] = rotacion(Eall)
    R['rotacion_cuadrilla'] = rotacion(Eall, set(CUADRILLA))
    for k in ('rotacion_todos',):
        R[k].pop('detalle')
    R['rotacion_cuadrilla']['detalle'] = {f'{CUADRILLA[e]} [{e}]': v for e, v in R['rotacion_cuadrilla']['detalle'].items()}

    # --- (4) plantas donde paro la asistencia ---
    hoy = D('2026-09-28')
    ult = {}
    for pid, d in PROYECTOS.items():
        ds = [r['dia'] for r in rows if r['project_id'] == str(pid)]
        if ds:
            ult[d['so']] = dict(project_id=pid, planta=PLANTA[pid][0], ultimo_dia=max(ds),
                                dias_sin_asistencia_al_2026_09_28=(hoy - D(max(ds))).days,
                                stage_proyecto=d['stage'], empresa=d['company'])
    R['ultima_asistencia_por_so'] = dict(sorted(ult.items(), key=lambda x: x[1]['ultimo_dia']))
    R['_parametros'] = dict(GAP_MAX_dias=GAP_MAX, NO_FRENTE=sorted(NO_FRENTE), OFICINA=sorted(OFICINA),
                            CUADRILLA={str(k): v for k, v in CUADRILLA.items()})
    # tipos Parte A
    so = list(csv.DictReader(open(os.path.join(HERE, 'so_clasificadas.tsv'), encoding='utf-8'), delimiter='\t'))
    R['parteA'] = dict(total=len(so), por_tipo=dict(Counter(r['tipo'] for r in so).most_common()),
                       por_confianza=dict(Counter(r['confianza'] for r in so)),
                       monto_mxn_por_tipo={t: round(sum(float(r['monto_sin_iva']) for r in so if r['tipo'] == t and r['moneda'] == 'MXN'))
                                           for t in sorted({r['tipo'] for r in so})},
                       monto_usd_por_tipo={t: round(sum(float(r['monto_sin_iva']) for r in so if r['tipo'] == t and r['moneda'] == 'USD'))
                                           for t in sorted({r['tipo'] for r in so})})
    json.dump(R, open(os.path.join(HERE, 'fase3_resultados.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return R, pd_

if __name__ == '__main__':
    if RAW and os.path.isdir(RAW):
        prep(RAW)
    R, pd_ = analiza()
    print(json.dumps({k: v for k, v in R.items() if k not in ('rotacion_cuadrilla',)}, ensure_ascii=False, indent=1)[:6000])
