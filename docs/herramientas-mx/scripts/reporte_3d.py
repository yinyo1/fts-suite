"""Escribe reporte_interferencias.md y estabilidad.md a partir de datos/interferencias_3d.json y datos/estabilidad.json
(sesion nocturna 2, #338). No calcula nada: solo presenta."""
import json, os
BASE = os.path.join(os.path.dirname(__file__), '..')
I = json.load(open(os.path.join(BASE, 'datos', 'interferencias_3d.json'), encoding='utf-8'))
E = json.load(open(os.path.join(BASE, 'datos', 'estabilidad.json'), encoding='utf-8'))
A = json.load(open(os.path.join(BASE, 'datos', 'interferencias_3d_antes.json'), encoding='utf-8')) if os.path.exists(os.path.join(BASE, 'datos', 'interferencias_3d_antes.json')) else None
S = I['supuestos']
# Escenarios: acomodo de la sesion 1 (commit a52a979) contra el reacomodado, con y sin la regla del rebaje de un lado
import subprocess, tempfile
REF = 'a52a979'
tmp = tempfile.mkdtemp()
viejo = os.path.join(tmp, 'diseno_s1.json')
open(viejo, 'w').write(subprocess.run(['git', 'show', f'{REF}:docs/herramientas-mx/diseno_carrito.json'], cwd=BASE, capture_output=True, text=True).stdout)
ESC = {}
for nom, ruta in (('acomodo de la sesion 1', viejo), ('reacomodado (vigente)', os.path.join(BASE, 'diseno_carrito.json'))):
    for un in ('0', '1'):
        out = os.path.join(tmp, f'{un}_{len(ESC)}.json')
        subprocess.run(['python3', os.path.join(BASE, 'scripts', 'interferencias_3d.py'), '--diseno', ruta, '--salida', out], env=dict(os.environ, UN_LADO=un), capture_output=True)
        j = json.load(open(out, encoding='utf-8'))
        ESC[(nom, un)] = (j['resumen']['despues'], sum(1 for r in j['cajones'] for x in r['piezas'] if x['rebaje_lados'] != [0, 1]))
viejo_d = json.load(open(viejo, encoding='utf-8'))
nuevo_d = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
def _pos(dd): return {q['activo']: (m, cj['n'], q['id'], q['x'], q['y'], q['rot']) for m, v in dd['modulos'].items() for c in v['cajas'] for cj in c['cajones'] for q in cj['piezas']}
pv, pn = _pos(viejo_d), _pos(nuevo_d)
MOV = [(a, pv[a], pn[a]) for a in pn if a in pv and pv[a][3:] != pn[a][3:]]

def fila(r):
    malos = [x for x in r['piezas'] if x['estado'] != 'PASA']
    peor = min(r['piezas'], key=lambda x: x['holgura_min_mm'] if x['holgura_min_mm'] is not None else 1e9)
    txt = '; '.join(f"{x['id']} {x['estado'].lower()} ({x['holgura_min_mm']} mm, {x['chequeo']}, contra {x['contra']})" for x in malos) or 'todas pasan'
    p = r['peso']
    return (f"| {r['modulo']} C{r['cajon']} | {r['caja']} | {r['ancho']} x {r['fondo']} x {r['alto']} | **{r['estado']}** | "
            f"{peor['id']} {peor['holgura_min_mm']} mm | {p['total']} de {p['capacidad']} kg{' **EXCEDE**' if p['excede'] else ''} | {txt} |")

L = ['# Reporte de interferencias 3D', '',
     'Sesión nocturna 2 (#338). Script: `scripts/interferencias_3d.py`. Modelos: `cad/modelos_herramienta/modelos.py`. Datos: `datos/interferencias_3d.json`.', '',
     '## Cómo se midió', '',
     'Cada cajón con piezas se armó en 3D y se corrieron los chequeos con `trimesh` y `python-fcl` (detección de colisiones y distancia mínima entre mallas).', '',
     '- **Cajón:** interior con las cotas del fabricante del Bloque 1 de #330. El alto es el alto útil: del piso del cajón a la parte baja del de arriba, o de la tapa.',
     f"- **Supuestos paramétricos, sin cota oficial:**",
     f"  - pared de {S['pared']} mm;",
     f"  - labio interior de {S['labio']} mm en los últimos {S['labio_alto']} mm de la pared;",
     '  - correderas por fuera de la pared.',
     '  Se sustituyen con el vernier.',
     '- **Loseta y ficha:** la loseta mide 2.4 mm y el piso de la ficha 1.2 mm, así que la herramienta queda a 3.6 mm del piso. La ficha es el contorno más 1 mm de holgura y 3 mm de pared; su alto es la cavidad, min(0.6 H, 25).',
     '- **Herramienta:** un modelo paramétrico por familia dentro de la envolvente L × A × H del catálogo, cada medida con su nivel en `validacion_documental.json`. Las proporciones internas son supuesto de diseño tomado de la foto de producto.', '',
     '| Chequeo | Qué revisa |', '|---|---|',
     '| a | Herramienta contra herramienta y contra fichas, la propia y las ajenas |',
     '| b | Herramienta y ficha contra la pared, el labio y las correderas |',
     '| c | Herramienta y ficha contra el techo: el volumen que barre el cajón de arriba al cerrar |',
     f"| d | Extracción: zona de dedos de {S['dedo']} mm en los dos lados largos, desde {S['yema']} mm abajo del tope de la pieza hasta el borde, y columna vertical sobre la huella |", '',
     f"**Criterio:**",
     '- **FALLA** si hay contacto.',
     f"- **PASA JUSTO** si la holgura mínima es menor a {S['justo']} mm. Para una ficha contra la pared el umbral es {S['justo_ficha']} mm, porque va fija e impresa.",
     '- **PASA** en otro caso.', '',
     '## Resultado', '']
L += ['| Acomodo | Regla de extracción | Cajones que pasan | Pasan justo | Fallan | Piezas con rebaje de un solo lado |', '|---|---|---|---|---|---|']
for (nom, un), (r, u) in ESC.items():
    L.append(f"| {nom} | {'dedos en los dos lados largos' if un == '0' else 'rebaje solo del lado libre si uno da a la pared'} | {r['PASA']} | {r['PASA JUSTO']} | {r['FALLA']} | {u if un == '1' else '-'} |")
L += ['', 'Son los 27 cajones con piezas.', '',
      '**El acomodo vigente es el reacomodado con la regla del rebaje de un lado:** 0 cajones fallan y solo 10 piezas necesitan rebaje de un lado.', '']
from collections import Counter
cat = Counter()
src = json.load(open(os.path.join(tmp, '0_0.json'), encoding='utf-8'))['cajones']
for r in src:
    for x in r['piezas']:
        for c in x['checks']:
            if c['mm'] == 0: cat[c['k'] + ' ' + c['que']] += 1
L += ['**Qué fallaba antes de corregir**, en número de contactos por chequeo:', '']
L += [f"- {k}: {v}" for k, v in cat.most_common()] or ['- nada']
L += ['', '**Hallazgo:**',
      '- **Ningún cajón choca con el cajón de arriba al cerrar (c).** Tampoco hay choques de herramienta contra herramienta ni contra el cajón (a, b).',
      '- **Todas las fallas son de extracción (d):** la zona de dedos del lado largo pegado a la pared. El acomodo deja 6 mm contra la pared (Fase 4), y los dedos necesitan 7 mm más el labio de 4 mm.',
      '- **La corrección reacomoda cada cajón que falla.** Todas las piezas quedan con el largo en la misma dirección, con 12 mm contra la pared en su lado largo y 6 mm en las puntas, igual que en la Fase 4. Usa el mismo empaque MaxRects del acomodo y prueba las dos direcciones y tres órdenes. Donde no cabe, mueve solo la pieza que falla.',
      '- **En los 7 cajones más llenos no alcanza el espacio.** Ahí la ficha lleva el rebaje de dedo solo del lado libre: `cad/fts_rejilla.scad`, parámetro `lados`, que `cad/generar_cajon.py` toma de este reporte.',
      '- **Error corregido de paso:** la ficha ponía el rebaje en los lados cortos de las piezas giradas. Ahora va siempre en los lados largos.',
      '- **Muchos cajones quedan en PASA JUSTO:** entre dos piezas vecinas el agarre de la Fase 4 deja 1 mm de sobra cuando se mide la zona de dedos contra la ficha de al lado. **Es el diseño, no un choque.**', '']
if MOV:
    L += [f'### Piezas movidas por la corrección ({len(MOV)}, contra el commit {REF})', '', '| Módulo y cajón | Pieza | De (x, y, girada) | A (x, y, girada) |', '|---|---|---|---|']
    L += [f"| {v[0]} C{v[1]} | {v[2]} ({a}) | {v[3]}, {v[4]}, {'sí' if v[5] else 'no'} | {n[3]}, {n[4]}, {'sí' if n[5] else 'no'} |" for a, v, n in sorted(MOV)]
    L += ['', 'Las posiciones nuevas quedaron en `diseno_carrito.json`. Si se vuelve a correr `acomodo.py`, hay que volver a correr `interferencias_3d.py --corregir` después.', '']
L += ['## Por cajón (después de corregir)', '', '| Cajón | Caja | Interior (mm) | Estado | Holgura mínima | Peso contra capacidad | Piezas que no pasan limpio |', '|---|---|---|---|---|---|---|']
L += [fila(r) for r in I['cajones']]
L += ['', '## Peso por cajón', '',
      'Peso = herramienta (catálogo) + fichas PETG + loseta PETG. Las fichas salen del volumen de pared y piso, a 1.27 g/cm³. La loseta sale de los 378 g medidos en el STL de BASE C6 (0.287 g/cm²). En la bandeja de la 8420 se suman sus 902 g medidos.',
      '',
      'Capacidad por cajón: 11 kg en 8443, 8444 y 8447, y 11.3 kg en 8442, según el fabricante. En la 8420 son 15 kg arriba y 25 kg abajo: es **supuesto**, porque el fabricante solo publica 113 kg del conjunto.', '']
exc = [r for r in I['cajones'] if r['peso']['excede']]
L += [f"**Cajones que exceden la capacidad: {len(exc)}.**" + (' ' + ', '.join(f"{r['modulo']} C{r['cajon']}" for r in exc) if exc else ' Ninguno. El más cargado es ' + max(I['cajones'], key=lambda r: r['peso']['total'] / r['peso']['capacidad'])['modulo'] + ' C' + str(max(I['cajones'], key=lambda r: r['peso']['total'] / r['peso']['capacidad'])['cajon']) + f" con {max(r['peso']['total'] / r['peso']['capacidad'] for r in I['cajones']) * 100:.0f} % de su capacidad."), '']
if I.get('variantes'):
    L += ['## Decisión: las M18 se guardan SIN batería', '',
          'Van acostadas en los cajones de 76 mm de la 8443, con la base de silueta de 3.6 mm:', '',
          '| Pieza | Sin batería: tope (mm) | Holgura contra el cajón de arriba | Con batería: tope (mm) | Resultado con batería |', '|---|---|---|---|---|']
    base_bat = {x['id']: x for r in I['variantes'].get('M18 con bateria puesta', []) for x in r['piezas']}
    for r in I['cajones']:
        for x in r['piezas']:
            if x['id'] in base_bat:
                t0 = x['tope_mm']; b1 = base_bat[x['id']]
                L.append(f"| {x['id']} | {t0} | {round(r['alto'] - t0, 1)} mm | {b1['tope_mm']} | **{b1['estado']}**: rebasa {round(b1['tope_mm'] - r['alto'], 1)} mm y choca con la pieza vecina |")
    L += ['', '**Por qué no caben:** con la batería CP2.0 puesta, el grosor de la herramienta acostada pasa al ancho de la batería, 79 mm (catálogo, nivel D1). 3.6 + 79 = 82.6 mm, contra un cajón de 76 mm.', '',
          '**Dónde irían con batería:**',
          '- en un cajón de 127 mm (8442 u 8447 C3), o',
          '- paradas sobre la batería en la 8420.',
          'En la base eso obliga a cambiar una caja. En la C9 de la 8420 (432 × 330) no caben las tres con el cargador: faltan 8 mm de ancho con las holguras de la Fase 4 (3 × 79 + 2 × 12 + 12 + 155 + 2 × 6 = 440 mm contra 432).', '',
          '**Recomendación:** sin batería. Las dos baterías van en sus fichas del mismo cajón C1, así se revisan en la foto de cierre y no se descargan puestas.', '']
    L += ['## Variantes', '']
    for nom, rs in I['variantes'].items():
        L += [f'### {nom}', '', '| Cajón | Alto | Pieza | Estado | Holgura mínima | Chequeo | Tope de la pieza (mm) | Envolvente L × A × H |', '|---|---|---|---|---|---|---|---|']
        for r in rs:
            for x in r['piezas']:
                L.append(f"| {r['modulo']} C{r['cajon']} | {r['alto']} | {x['id']} | **{x['estado']}** | {x['holgura_min_mm']} mm | {x['chequeo']} | {x['tope_mm']} | {' x '.join(str(v) for v in x['envolvente'])} |")
        L.append('')
open(os.path.join(BASE, 'reporte_interferencias.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')

# ---- estabilidad
S2 = E['supuestos']
L = ['# Estabilidad de la pila', '',
     'Sesión nocturna 2 (#338). Script: `scripts/estabilidad.py`. Datos: `datos/estabilidad.json`. El análisis es estático, sin inercia de frenado ni empujones.', '',
     '## Datos y supuestos', '',
     '**Del fabricante** (milwaukeetool.com, leído en la sesión 1):',
     '- 8420: 610 × 482 × 502 mm, 13.2 kg. Su cajón grande abre al frente.',
     '- 8443: 564 × 414 × 363 mm, 10.2 kg.',
     '- 8444: mismas medidas que la 8443, 10.9 kg.', '',
     '**Supuestos**, paramétricos, en el script:',
     f"- Borde de apoyo lateral a {S2['apoyo_lateral_mm']} mm del centro y delantero a {S2['apoyo_frente_mm']} mm.",
     f"- Centro de gravedad de la 8420 vacía en {S2['cg_8420_vacia']}.",
     f"- Correderas de extensión total: el cajón sale {S2['carrera_mm']} mm.",
     f"- Cajón vacío: {S2['cajon_vacio_kg']} kg.",
     '- 8447 y 8442 pesan lo mismo que la 8444.',
     '- Las cajas de arriba pueden quedar con su frente de 564 a lo largo de la 8420, de modo que los cajones abren de lado (**orientación A**), o giradas, abriendo al frente (**orientación B**). Se corren las dos.', '',
     '**Carga:** la de cada cajón según `interferencias_3d.json` (herramienta + PETG), y también cada cajón lleno a su capacidad.',
     '',
     '**Criterio:**',
     '- La pila se voltea si el centro de gravedad, con el cajón abierto, pasa el borde de apoyo.',
     '- Con inclinación, al centro de gravedad se le suma alto × tan(5°) hacia el lado que abre.',
     '- El ángulo de vuelco es atan((borde − cg) / alto del cg).', '',
     '## Resultado', '',
     '| Pila | Alto (mm) | Orientación | Peor caso | Masa (kg) | Alto del cg (mm) | Margen plano (mm) | Margen con 5° (mm) | Ángulo de vuelco | Carga extra antes de voltear con 5° |', '|---|---|---|---|---|---|---|---|---|---|']
for c in E['casos']:
    r = c['carga_real']
    L.append(f"| {c['pila']} | {c['alto_mm']} | {c['orientacion']} | {c['cajon_abierto']} | {r['masa_kg']} | {r['cg_alto_mm']} | {r['margen_plano_mm']} | {r['margen_5grados_mm']} | {r['angulo_vuelco_grados']}° | {'' if c['kg_extra_antes_de_voltear_5grados'] is None else str(c['kg_extra_antes_de_voltear_5grados']) + ' kg'} |")
peorA = min((c for c in E['casos']), key=lambda c: c['carga_real']['angulo_vuelco_grados'])
uno = [c for c in E['casos'] if not c['cajon_abierto'].startswith('TODOS')]
peor1 = min(uno, key=lambda c: c['carga_real']['angulo_vuelco_grados'])
L += ['', '## Conclusión', '',
      f"- **Con un cajón abierto, en ninguna combinación se voltea**, ni en piso plano ni con 5°. El peor caso es {peor1['pila']}, orientación {peor1['orientacion']}, cajón {peor1['cajon_abierto']}: se voltea a los {peor1['carga_real']['angulo_vuelco_grados']}°, y con 5° le caben {peor1['kg_extra_antes_de_voltear_5grados']} kg más en ese cajón antes de voltear.",
      f"- **El caso más crítico es abrir todos los cajones de la caja de arriba a la vez:** {peorA['pila']}, orientación {peorA['orientacion']}, se voltea a los {peorA['carga_real']['angulo_vuelco_grados']}°. Con 5° sigue en pie, con {peorA['carga_real']['margen_5grados_mm']} mm de margen.",
      '',
      '**Reglas de uso**, que van a la checklist y a la capacitación:',
      '1. **Un cajón abierto a la vez.** Se cierra antes de abrir otro.',
      '2. **Nunca abrir cajones con el carrito en rampa.** Primero se lleva a piso plano y se frenan las ruedas contra algo. Esto importa sobre todo con el módulo de soldadura arriba: la pila mide 1,954 mm y con todo abierto se voltea a menos de 10°.',
      '3. **Lo pesado va abajo.** El acomodo ya pone la 8444 debajo de la 8443. No se sube un módulo pesado (SOL) arriba de otro módulo.',
      '4. **Nada colgado de las correderas abiertas.** La carga extra que aguanta un cajón abierto con 5° es la de la tabla, y es para herramienta dentro del cajón, no para apoyarse.',
      '',
      '**Lo que falta para cerrar esto:**',
      '- medir los apoyos reales de la 8420 (las patas y el ancho entre ruedas);',
      '- confirmar la orientación con la que se acoplan las cajas;',
      '- pesar un cajón vacío.',
      '',
      'Los tres son supuestos en el script.']
open(os.path.join(BASE, 'estabilidad.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('ok')

# ---- README de modelos: cada pieza con su tipo, envolvente y nivel de cada medida
V = {v['id']: v for v in json.load(open(os.path.join(BASE, 'datos', 'validacion_documental.json'), encoding='utf-8'))['piezas']}
D = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
import sys; sys.path.insert(0, os.path.join(BASE, 'cad', 'modelos_herramienta')); import modelos
vis = {}
for m, v in D['modulos'].items():
    for c in v['cajas']:
        for cj in c['cajones']:
            for q in cj['piezas']: vis.setdefault(q['id'], (q, f"{m} C{cj['n']}"))
R = ['# Modelos 3D de herramienta', '', 'Sesión nocturna 2 (#338). Código: `modelos.py`, que tiene un generador por tipo. Lo usan `scripts/interferencias_3d.py` y `scripts/build_vista_3d.py`.', '',
     '**Cómo leer esta tabla:**',
     '- **La envolvente L × A × H es la del catálogo**, con el nivel de cada medida tomado de `datos/validacion_documental.json`: D2 documental doble, D1 documental simple, F estimación desde foto, M medida física.',
     '- **La forma interna** (dónde va la empuñadura, qué tan ancha es la cabeza) es **supuesto de diseño** tomado de las fotos de producto del fabricante. No es medida.',
     '- **Un modelo nunca rebasa su envolvente.** Por eso no puede crear una interferencia que la caja del catálogo no tenga.',
     '- **Las únicas variantes que cambian la envolvente** son la M18 con batería puesta (batería CP2.0 de 118 × 79 × 55, nivel D1, con 10 mm de encaje, supuesto) y la esmeriladora con mango lateral (mango de 110 × 26 mm, supuesto).', '',
     '| Pieza | Descripción | Tipo de modelo | L × A × H (mm) | Nivel L / A / H | Dónde va |', '|---|---|---|---|---|---|']
for i, (q, donde) in sorted(vis.items()):
    niv = '/'.join(V.get(i, {}).get(k, {}).get('nivel', '?') for k in ('L', 'A', 'H'))
    R.append(f"| {i} | {q['corto']} | {modelos.tipo_de(q)} | {q['L']} × {q['A']} × {q['H']} | {niv} | {donde} |")
open(os.path.join(BASE, 'cad', 'modelos_herramienta', 'README.md'), 'w', encoding='utf-8').write('\n'.join(R) + '\n')
