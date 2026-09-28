"""Sesion nocturna 2 (#338), Bloque 4 · plan maestro de Herramientas MX: plan_maestro.md, plan_maestro.xlsx y
plan_maestro_gantt.html, todo desde los mismos datos.

Costos: la funcion costo() de scripts/build_caso_negocio.py (precios vigentes de asignacion_y_compra.xlsx, PETG con el factor
medido del cajon C6 con losetas ligeras). Cada fase cuesta la diferencia de su configuracion ACUMULADA contra la de la fase
anterior: el inventario existente se consume primero, asi que la primera fase lo aprovecha y las siguientes compran mas.
Capacidad de impresion: plan_fabricacion.md (81.6 h efectivas por impresora por semana; la rapida hace el doble).
Personas solo por rol. Fechas tentativas.
"""
import json, os, runpy, html
from datetime import date, timedelta
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
BASE = os.path.join(os.path.dirname(__file__), '..')
ns = runpy.run_path(os.path.join(BASE, 'scripts', 'build_caso_negocio.py'), run_name='plan')
costo = ns['costo']
H_SEM = 81.6                      # horas efectivas por impresora por semana (plan_fabricacion.md)
RFID = 20076.1                    # tags + lector (asignacion_y_compra.xlsx, hoja RFID)

CONF = [  # fase, configuracion acumulada
    ('F1', {'BASE': 1, 'TUB': 1}),
    ('F2', {'BASE': 3, 'TUB': 1, 'ELE': 1}),
    ('F4', {'BASE': 5, 'ELE': 2, 'SOL': 2, 'TUB': 2, 'CIV': 1, 'MED': 2}),
]
acum, prev, prev_n = {}, None, None
for f, u in CONF:
    c, cn = costo(u), costo(u, existe=False)
    acum[f] = {'u': u, 'c': c, 'cn': cn,
               'inc': {k: round(c[k] - (prev[k] if prev else 0), 2) for k in ('herr', 'cont', 'ctrl', 'petg', 'total', 'kg', 'h_std')},
               'inc_n': round(cn['total'] - (prev_n['total'] if prev_n else 0), 2)}
    prev, prev_n = c, cn

L0 = date(2026, 9, 29)
FASES = [
 {'id': 'F0', 'nombre': 'Levantamiento', 'ini': date(2026, 9, 29), 'fin': date(2026, 10, 2),
  'objetivo': 'Saber que herramienta hay de verdad y medir las 40 piezas que deciden el acomodo',
  'entregables': 'conteo_fisico.json y medicion_fisica.json ingestados; cajon C6 impreso y medido; costo del piloto con la existencia real',
  'criterio': 'Conteo cerrado (100 % de los renglones con estado); 40 piezas medidas; C6 impreso y probado en el cajon real',
  'decide': 'Direccion (aprueba la compra del piloto)', 'costo': 0.0, 'costo_nota': 'Sin compra. PETG del C6 ya se tiene',
  'kg': 0.67, 'h_std': 33.6},
 {'id': 'F1', 'nombre': 'Piloto en Topo Chico', 'ini': date(2026, 10, 5), 'fin': date(2026, 10, 30),
  'objetivo': 'Probar un carrito base con modulo TUB 4 semanas en la planta con mas gente',
  'entregables': 'Carrito FTS-CAR-01 operando; checklist diaria; 4 mediciones de viernes (M1 a M9); reporte en el issue',
  'criterio': 'M1 >= 90 %, M3 = 0, M4 <= 5 min, M6 >= 95 %, M7 = 0, el encargado del frente y el supervisor SR dicen que se queda; y decision de compra de 2 impresoras rapidas para F2',
  'decide': 'Manager de operaciones propone; direccion decide', 'costo': acum['F1']['inc']['total'], 'costo_nota': f"{acum['F1']['inc_n']:,.0f} si nada del listado aparece",
  'kg': acum['F1']['inc']['kg'], 'h_std': acum['F1']['inc']['h_std']},
 {'id': 'F2', 'nombre': 'Lote de 2 bases', 'ini': date(2026, 11, 2), 'fin': date(2026, 12, 11),
  'objetivo': 'Carrito para Bridgestone SO11699 (con modulo ELE) y uno de reserva en el taller; usar la app MVP',
  'entregables': 'FTS-CAR-02 y 03; modulo ELE; app MVP en uso; 8 semanas acumuladas de M3 y M5',
  'criterio': 'M3 y M5 de 8 semanas mejores que la linea base; costo real por carrito dentro de +-15 % del plan; app MVP sin perdidas de eventos',
  'decide': 'Direccion', 'costo': acum['F2']['inc']['total'], 'costo_nota': f"{acum['F2']['inc_n']:,.0f} si nada del listado aparece",
  'kg': acum['F2']['inc']['kg'], 'h_std': acum['F2']['inc']['h_std']},
 {'id': 'F3', 'nombre': 'App dentro de la suite', 'ini': date(2026, 10, 5), 'fin': date(2027, 2, 26),
  'objetivo': 'Pasar del prototipo a un modulo de la suite: MVP para el lote de 2 y completa antes de escalar',
  'entregables': 'Issues H1 a H13 (seccion Ruta de la app); webhooks /herramientas/*; esquema herramientas en fts-suite-db',
  'criterio': 'MVP (H1 a H7 y H9) en uso con el lote de 2 antes del 30-nov; completa (H8, H10 a H13) antes del 22-feb-2027',
  'decide': 'Direccion aprueba el esquema de datos; manager de operaciones acepta cada entrega', 'costo': 0.0, 'costo_nota': 'Horas internas: 81 h estimadas (tabla de issues)',
  'kg': 0, 'h_std': 0},
 {'id': 'F4', 'nombre': 'Escalamiento a 5 bases', 'ini': date(2027, 1, 11), 'fin': date(2027, 2, 26),
  'objetivo': 'Completar 5 carritos base y los modulos compartidos (ELE 2, SOL 2, TUB 2, CIV 1, MED 2)',
  'entregables': 'FTS-CAR-04 y 05; 9 modulos; RFID si se aprueba; capacitacion de todos los encargados',
  'criterio': 'Todos los carritos con revision diaria >= 90 % durante 4 semanas; alertas A1 a A7 activas; 0 kits huerfanos sin atender',
  'decide': 'Direccion', 'costo': acum['F4']['inc']['total'], 'costo_nota': f"{acum['F4']['inc_n']:,.0f} si nada del listado aparece; RFID aparte {RFID:,.0f}",
  'kg': acum['F4']['inc']['kg'], 'h_std': acum['F4']['inc']['h_std']},
 {'id': 'F5', 'nombre': 'Operacion estable', 'ini': date(2027, 3, 1), 'fin': date(2027, 5, 28),
  'objetivo': 'Que funcione sin el equipo del proyecto: revision semanal, bono ligado y reposicion con referencia',
  'entregables': 'Tablero mensual; bono del encargado ligado a M1 y M3; procedimiento de alta y baja de piezas',
  'criterio': '3 meses con reposicion por perdida < 25 % de la linea base y revision diaria >= 90 %',
  'decide': 'Direccion', 'costo': 0.0, 'costo_nota': 'Reposicion y reimpresion normales (se miden)', 'kg': 0, 'h_std': 0},
]
acumulado = 0.0
for f in FASES:
    acumulado += f['costo']; f['acum'] = round(acumulado, 2)
    f['sem_1std'] = round(f['h_std'] / H_SEM, 1) if f['h_std'] else 0
    f['sem_2rap'] = round(f['h_std'] / (2 * H_SEM * 2), 1) if f['h_std'] else 0
    f['sem_1std_2rap'] = round(f['h_std'] / (H_SEM + 2 * H_SEM * 2), 1) if f['h_std'] else 0

SENS = [(s['bases'], s['modulos'], s['total'], s['kg'], s['h_std']) for s in json.load(open(os.path.join(BASE, 'datos', 'caso_negocio.json')))['sensibilidad']]

ISSUES = [
 ('H1', 'Esquema herramientas en fts-suite-db y su migracion (tablas de especificacion_app.md §6)', '-', 6, 'MVP'),
 ('H2', 'Scopes herramientas.* en auth-jwt y pantalla de login de la app', '-', 3, 'MVP'),
 ('H3', 'Catalogo de plantas, lugares de resguardo y geocercas; liga planta-proyecto de Odoo', 'H1', 5, 'MVP'),
 ('H4', 'Catalogo de kits, contenedores y activos cargado desde diseno_carrito.json; QR de las etiquetas', 'H1', 5, 'MVP'),
 ('H5', 'Maquina de estados del kit y webhook POST /herramientas/evento (JWT en el body, try/catch en el nodo del secreto)', 'H1, H2', 8, 'MVP'),
 ('H6', 'Cola sin senal: IndexedDB, uuid unico, ts_evento real; reenvio idempotente', 'H5', 8, 'MVP'),
 ('H7', 'Revision de cierre con foto (ir.attachment en el proyecto) y registro de faltantes', 'H5', 8, 'MVP'),
 ('H8', 'Cron n8n de alertas A1 a A7 (lee hr.attendance.x_studio_project_id y stage del proyecto; nunca el campo de SO, #326)', 'H3, H5', 10, 'completa'),
 ('H9', 'Formato de caseta configurable por planta (PDF con la lista exacta del kit)', 'H3, H4', 6, 'MVP'),
 ('H10', 'Integracion kiosko: tarea de reasignacion al checar en otra planta', 'H5, H8', 6, 'completa'),
 ('H11', 'Integracion plan nocturno (planeacion/guardar): tareas de reasignacion la noche anterior (requiere #337 punto 2)', 'H10', 5, 'completa'),
 ('H12', 'Vista de direccion: kits por planta, dias sin revision, alertas y valor en planta', 'H5, H8', 6, 'completa'),
 ('H13', 'Combinaciones cifradas, scope herramientas.combinaciones y alerta A5', 'H1, H2', 5, 'completa'),
]

RIESGOS = [
 ('R1', 'Las medidas reales no coinciden con las del catalogo (0 % validado)', 'Alta', 'Medio', 'Levantamiento F0 antes de imprimir; chequeo 3D automatico al ingestar', 'Ingenieria'),
 ('R2', 'La impresion 3D no da abasto (2,975 h para el plan completo)', 'Alta', 'Alto', 'Losetas ligeras (hecho, -18 %); 2 impresoras rapidas antes de F4; imprimir solo lo que el piloto confirma', 'Ingenieria'),
 ('R3', 'El encargado deja de hacer la revision diaria', 'Media', 'Alto', 'Revision de 5 min por foto; A3 escala al supervisor; bono ligado a M1 en F5', 'Supervisor SR'),
 ('R4', 'La planta no permite fotos o rechaza el formato de caseta', 'Media', 'Medio', 'Preguntar en F0; revision en el lugar de resguardo; formato configurable (H9)', 'Encargado del frente'),
 ('R5', 'Se sigue perdiendo herramienta por robo en planta, no por olvido', 'Media', 'Alto', 'Candado y cable en resguardo; combinacion cambia con cada rotacion (A5); registrar el tipo de perdida', 'Manager de operaciones'),
 ('R6', 'La reposicion registrada en Odoo no paga el plan (8.8 a 33 anios)', 'Alta', 'Alto', 'No escalar sin M3 y M5 medidos; caso v2 con Jeeves y horas perdidas; lote de 2 antes de 5', 'Direccion'),
 ('R7', 'Rotacion de gente entre plantas deja kits huerfanos', 'Alta', 'Medio', 'Tarea de reasignacion con el plan nocturno y el kiosko (H10, H11); A1', 'Supervisor SR'),
 ('R8', 'La app pierde eventos sin senal', 'Media', 'Alto', 'Cola con uuid y ts_evento real (H6); prueba de corte de red antes de F2', 'Desarrollo'),
 ('R9', 'Un dato personal termina en el repo publico', 'Baja', 'Alto', 'Grep antes de cada commit; datos crudos en SharePoint; issues por rol (CLAUDE.md §9)', 'Desarrollo'),
 ('R10', 'La pila se voltea en rampa con cajones abiertos', 'Baja', 'Alto', 'Un cajon abierto a la vez; nunca abrir en pendiente (estabilidad.md); regla en la checklist', 'Encargado del frente'),
 ('R11', 'Contenedor agotado (8442 figura agotado)', 'Media', 'Bajo', 'Comprar contenedores del lote siguiente con una fase de anticipacion', 'Compras'),
 ('R12', 'El proyecto depende de una sola persona y se cae cuando cambia de prioridad', 'Alta', 'Alto', 'Dueno de proyecto con horas asignadas; revision semanal fija; todo en el issue', 'Direccion'),
]

CAMBIO = [
 ('Nadie era dueno del kit: la herramienta era "de todos"', 'Kit con responsable por nombre en la app y firma diaria (F1)', 'Encargado del frente'),
 ('La caja generica no deja ver que falta', 'Silueta amarilla por pieza: el hueco se ve en la foto (F1)', 'Ingenieria'),
 ('Se revisaba solo cuando algo faltaba, ya tarde', 'Revision de cierre diaria de 5 min y medicion cada viernes (F1)', 'Supervisor SR'),
 ('Al cambiar de planta la herramienta se quedaba sin dueno', 'Tarea de reasignacion con el plan nocturno y el kiosko (F3: H10, H11)', 'Manager de operaciones'),
 ('Nadie media si funcionaba, y el esfuerzo se diluia', 'M1 a M9 cada viernes en el issue y compuertas con criterio (todas las fases)', 'Manager de operaciones'),
 ('No habia consecuencia ni reconocimiento', 'Bono del encargado ligado a M1 y M3 (F5); reposicion con referencia del cajon', 'Direccion'),
 ('El proyecto dependia de un impulso y se apagaba', 'Dueno dedicado con horas asignadas y revision semanal fija de 30 min', 'Direccion'),
 ('Las alertas llegaban por WhatsApp y se perdian', 'Alertas A1 a A7 con escalamiento automatico (F3: H8)', 'Desarrollo'),
]

# ---------------- xlsx
wb = Workbook(); wb.remove(wb.active)
HDR = PatternFill('solid', fgColor='1F3A5F'); B = Font(bold=True, color='FFFFFF')
def hoja(t, cab, filas, anchos=None):
    ws = wb.create_sheet(t); ws.append(cab)
    for c in ws[1]: c.fill = HDR; c.font = B; c.alignment = Alignment(wrap_text=True, vertical='top')
    for f in filas: ws.append(list(f))
    for i, _ in enumerate(cab, 1): ws.column_dimensions[get_column_letter(i)].width = (anchos or {}).get(i, 16)
    for row in ws.iter_rows(min_row=2):
        for c in row: c.alignment = Alignment(wrap_text=True, vertical='top')
    ws.freeze_panes = 'A2'
hoja('Fases', ['fase', 'nombre', 'inicio', 'fin', 'objetivo', 'entregables', 'criterio para pasar', 'quien decide (rol)', 'costo MXN', 'acumulado MXN', 'nota de costo'],
     [(f['id'], f['nombre'], f['ini'].isoformat(), f['fin'].isoformat(), f['objetivo'], f['entregables'], f['criterio'], f['decide'], f['costo'], f['acum'], f['costo_nota']) for f in FASES],
     {5: 40, 6: 45, 7: 45, 8: 28, 11: 34})
hoja('Presupuesto', ['fase', 'configuracion acumulada', 'herramienta', 'contenedores', 'candados y cables', 'PETG', 'total de la fase', 'total si nada del listado aparece', 'acumulado'],
     [(f, ', '.join(f'{k}{v}' for k, v in acum[f]['u'].items()), acum[f]['inc']['herr'], acum[f]['inc']['cont'], acum[f]['inc']['ctrl'], acum[f]['inc']['petg'], acum[f]['inc']['total'], acum[f]['inc_n'],
       [x['acum'] for x in FASES if x['id'] == f][0]) for f in acum] + [('RFID (opcional, F4)', 'tags + lector', None, None, None, None, RFID, RFID, None)], {2: 34})
hoja('Sensibilidad', ['carritos base', 'modulos', 'total MXN', 'kg PETG', 'horas de impresion estandar'], SENS)
hoja('Impresion', ['fase', 'kg PETG (con 15 % merma)', 'horas estandar', 'semanas con 1 estandar', 'semanas con 2 rapidas', 'semanas con 1 estandar + 2 rapidas'],
     [(f['id'], f['kg'], f['h_std'], f['sem_1std'], f['sem_2rap'], f['sem_1std_2rap']) for f in FASES if f['h_std']])
hoja('Ruta_app', ['issue', 'que', 'depende de', 'horas estimadas', 'entrega'], ISSUES, {2: 70})
hoja('Riesgos', ['id', 'riesgo', 'probabilidad', 'impacto', 'mitigacion', 'dueno (rol)'], RIESGOS, {2: 50, 5: 60, 6: 22})
hoja('Gestion_cambio', ['causa probable de los intentos anteriores (hipotesis)', 'como lo evita este plan', 'dueno (rol)'], CAMBIO, {1: 50, 2: 60, 3: 24})
hoja('Supuestos', ['supuesto', 'fuente o por que'], [
    ('Cada fase cuesta la diferencia de su configuracion acumulada contra la anterior', 'El inventario existente se consume primero'),
    ('Precios vigentes de asignacion_y_compra.xlsx: compra de Odoo sin IVA y tienda con IVA', 'Mismo criterio que el caso de negocio'),
    ('PETG con el factor medido del cajon C6 con losetas ligeras (1.90 en gramos, 2.10 en horas)', 'stl/estimacion_stl.json'),
    ('81.6 h efectivas por impresora por semana; la rapida imprime al doble', 'plan_fabricacion.md'),
    ('Fechas tentativas; semana del 21-dic al 8-ene sin actividad', 'Periodo vacacional'),
    ('Horas de desarrollo de la app estimadas por issue', 'Comparables con los modulos de la suite ya hechos'),
    ('Los 7 u 8 intentos anteriores no estan documentados en el repo; sus causas son hipotesis a validar con operaciones', 'Dato de direccion en la instruccion de la sesion 2'),
], {1: 70, 2: 50})
wb.save(os.path.join(BASE, 'plan_maestro.xlsx'))

# ---------------- md
def mx(v): return f'${v:,.0f}'
M = ['# Plan maestro de Herramientas MX', '',
     'Sesión nocturna 2 (#338). Sale de `scripts/build_plan_maestro.py`, igual que `plan_maestro.xlsx` y `plan_maestro_gantt.html`. Las personas van solo por rol y las fechas son tentativas.', '',
     '## Fases y compuertas', '',
     '| Fase | Fechas | Objetivo | Entregables | Criterio para pasar | Quién decide | Costo de la fase | Acumulado |', '|---|---|---|---|---|---|---|---|']
for f in FASES:
    M.append(f"| {f['id']} {f['nombre']} | {f['ini']:%d-%b-%Y} a {f['fin']:%d-%b-%Y} | {f['objetivo']} | {f['entregables']} | {f['criterio']} | {f['decide']} | {mx(f['costo'])} ({f['costo_nota']}) | {mx(f['acum'])} |")
M += ['', '**Cómo sale el costo de cada fase:**',
      '- Es la diferencia del costo de su configuración acumulada contra la de la fase anterior. El inventario que ya existe se consume primero.',
      '- **Por eso el piloto sale barato y las fases siguientes compran más:** herramienta nueva, contenedores, candados y PETG.',
      '- Las fechas de F3 corren en paralelo a F1 y F2.',
      '- No hay actividad del 21 de diciembre al 8 de enero.', '',
      '## Presupuesto por fase', '', '| Fase | Configuración acumulada | Herramienta | Contenedores | Candados y cables | PETG | Total de la fase | Si nada del listado aparece |', '|---|---|---|---|---|---|---|---|']
for f in acum:
    a = acum[f]
    M.append(f"| {f} | {', '.join(f'{k} {v}' for k, v in a['u'].items())} | {mx(a['inc']['herr'])} | {mx(a['inc']['cont'])} | {mx(a['inc']['ctrl'])} | {mx(a['inc']['petg'])} | **{mx(a['inc']['total'])}** | {mx(a['inc_n'])} |")
M += [f"| RFID (opcional, F4) | tags + lector | | | | | {mx(RFID)} | |", '',
      f"**Total del plan sin RFID: {mx(acum['F4']['c']['total'])}.** Con RFID son {mx(acum['F4']['c']['total'] + RFID)}.", '',
      'Hay renglones sin precio que se cotizan aparte: dados 3/8, Torx, limas, grilletes y mangos. Los detalla `asignacion_y_compra.xlsx`.', '',
      '**Sensibilidad** (mismos precios):', '', '| Bases | Módulos | Total | kg PETG | Horas de impresión |', '|---|---|---|---|---|']
M += [f"| {b} | {m} | {mx(t)} | {kg} | {h} |" for b, m, t, kg, h in SENS]
M += ['', '## Capacidad de impresión 3D', '',
      '**Cómo se calculó:**',
      '- 81.6 h efectivas por impresora a la semana (`plan_fabricacion.md`); la rápida imprime al doble.',
      '- Gramos y horas con el factor medido del cajón C6 con losetas ligeras: 1.90 y 2.10. Con la loseta sólida eran 2.28 y 2.51.', '',
      '| Fase | kg PETG | Horas estándar | Semanas con 1 estándar | Con 2 rápidas | Con 1 estándar + 2 rápidas |', '|---|---|---|---|---|---|']
M += [f"| {f['id']} | {f['kg']} | {f['h_std']} | {f['sem_1std']} | {f['sem_2rap']} | {f['sem_1std_2rap']} |" for f in FASES if f['h_std']]
M += ['', '**Lectura:**',
      f"- **F1:** con la impresora estándar son {FASES[1]['sem_1std']} semanas contra 4 del piloto. Por eso el piloto imprime por prioridad y usa cartulina en el resto.",
      f"- **F2:** con una estándar son {FASES[2]['sem_1std']} semanas contra 6 de la fase. **No cabe sin impresoras rápidas.**",
      f"- **F4:** son {FASES[4]['sem_1std']} semanas con una estándar, contra {FASES[4]['sem_1std_2rap']} con una estándar más 2 rápidas.",
      '- **La compra de 2 impresoras rápidas se decide en la compuerta G1 (30 de octubre), no después.** Ya no es F4 lo que las necesita: es el lote de 2.', '',
      '## Ruta de la app (issues por crear, redactados aquí)', '', '| Issue | Qué | Depende de | Horas | Entrega |', '|---|---|---|---|---|']
M += [f"| {i} | {q} | {d} | {h} | {e} |" for i, q, d, h, e in ISSUES]
M += ['', f"**Total: {sum(i[3] for i in ISSUES)} h.**",
      '- **MVP (H1 a H7 y H9):** para el lote de 2.',
      '- **Completa:** antes de escalar a 5.', '',
      'La especificación de cada pantalla, flujo y webhook está en `especificacion_app.md`; el prototipo, en `prototipo_app_v2.html`.', '',
      '## Registro de riesgos', '', '| Id | Riesgo | Probabilidad | Impacto | Mitigación | Dueño |', '|---|---|---|---|---|---|']
M += [f"| {a} | {b} | {c} | {d} | {e} | {f} |" for a, b, c, d, e, f in RIESGOS]
M += ['', '## Gestión del cambio', '',
      'Los 7 u 8 intentos anteriores **no están documentados en el repo**. Las causas de esta tabla son **hipótesis** a validar con operaciones en la semana 0: una plática de 20 minutos con el supervisor SR y un encargado. Cada una tiene su control en una fase concreta.', '',
      '| Causa probable (hipótesis) | Cómo lo evita este plan | Dueño |', '|---|---|---|']
M += [f"| {a} | {b} | {c} |" for a, b, c in CAMBIO]
M += ['', '**Cuatro reglas que no se negocian:**',
      '1. **Un dueño del proyecto con horas asignadas.** Sin eso no arranca la F1.',
      '2. **Revisión semanal de 30 minutos** con las métricas del viernes, en el issue.',
      '3. **Ninguna fase arranca sin pasar la compuerta anterior.**',
      '4. **El bono del encargado se liga a M1 y M3 desde la F5.** Si se decide antes, mejor.', '',
      '## Próxima decisión de dirección', '',
      f"- **Compuerta F0, viernes 2 de octubre:** aprobar la compra del piloto, entre {mx(acum['F1']['inc']['total'])} y {mx(acum['F1']['inc_n'])} según el conteo.",
      '- **Nombrar al dueño del proyecto.**',
      '- **Decidir en G1** la compra de las 2 impresoras rápidas que el lote de 2 ya necesita. Hay que cotizarlas: no tienen precio en el repo.']
open(os.path.join(BASE, 'plan_maestro.md'), 'w', encoding='utf-8').write('\n'.join(M) + '\n')

# ---------------- gantt html
ini, fin = date(2026, 9, 28), date(2027, 5, 31)
semanas = []
d = ini
while d <= fin: semanas.append(d); d += timedelta(days=7)
filas = [(f['id'] + ' ' + f['nombre'], f['ini'], f['fin'], 'fase', f['criterio']) for f in FASES]
app_fechas = {'MVP': (date(2026, 10, 5), date(2026, 11, 27)), 'completa': (date(2026, 12, 1), date(2027, 2, 19))}
filas += [(f'{i} {q[:48]}', *app_fechas[e], 'app' if e == 'MVP' else 'app2', f'Depende de {dep}; {h} h') for i, q, dep, h, e in ISSUES]
comp = [('G0', date(2026, 10, 2)), ('G1', date(2026, 10, 30)), ('G2', date(2026, 12, 11)), ('G4', date(2027, 2, 26)), ('G5', date(2027, 5, 28))]
def col(dd): return (dd - ini).days / 7
W = len(semanas)
barras = []
for nom, a, b, tipo, tip in filas:
    x0 = col(a); x1 = col(b + timedelta(days=1))
    barras.append(f'<div class="r"><div class="n" title="{html.escape(tip)}">{html.escape(nom)}</div><div class="t"><span class="b {tipo}" style="left:{x0 / W * 100:.2f}%;width:{max(0.6, (x1 - x0) / W * 100):.2f}%" title="{a:%d-%b} a {b:%d-%b}: {html.escape(tip)}"></span></div></div>')
marcas = ''.join(f'<span class="g" style="left:{col(dd) / W * 100:.2f}%" title="Compuerta {g} {dd:%d-%b-%Y}">{g}</span>' for g, dd in comp)
meses, prevm = [], None
for i, s in enumerate(semanas):
    if s.month != prevm and (s + timedelta(days=6)).month == s.month: meses.append(f'<span class="mes" style="left:{i / W * 100:.2f}%">{["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"][s.month - 1]} {str(s.year)[2:]}</span>'); prevm = s.month
G = f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plan maestro Herramientas MX</title>
<style>:root{{--bg:#f6f5f1;--ink:#1d1d1b;--mut:#5f5e57;--line:#d9d6cc;--card:#fff;--f:#1f3a5f;--a:#f2b705;--a2:#c98b00;--g:#c62828}}
@media (prefers-color-scheme:dark){{:root:not([data-theme=light]){{--bg:#171714;--ink:#f1efe8;--mut:#b3b0a6;--line:#3a3933;--card:#22221e;--f:#8fb3e0}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif}}main{{max-width:1200px;margin:0 auto;padding:16px}}
h1{{font-size:20px;margin:0 0 4px}}.m{{color:var(--mut);font-size:13px}}
.gw{{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px;margin-top:12px}}
.gi{{min-width:900px}}.r{{display:grid;grid-template-columns:260px 1fr;align-items:center;min-height:26px;border-bottom:1px solid var(--line)}}
.n{{font-size:12px;padding-right:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}.t{{position:relative;height:18px}}
.b{{position:absolute;top:2px;height:14px;border-radius:4px}}.b.fase{{background:var(--f)}}.b.app{{background:var(--a)}}.b.app2{{background:var(--a2)}}
.hd{{display:grid;grid-template-columns:260px 1fr}}.ms{{position:relative;height:40px}}.ms span.mes{{position:absolute;top:0;font-size:11px;color:var(--mut);border-left:1px solid var(--line);padding-left:3px;height:40px}}
.g{{position:absolute;top:21px;transform:translateX(-50%);background:var(--g);color:#fff;font-size:10px;font-weight:700;padding:1px 4px;border-radius:3px}}
.ley span{{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:middle;margin:0 4px 0 12px}}
table{{border-collapse:collapse;width:100%;min-width:760px;margin-top:14px;font-size:13px;background:var(--card)}}th,td{{border:1px solid var(--line);padding:6px;text-align:left;vertical-align:top}}th{{background:var(--f);color:#fff}}
.tw{{overflow-x:auto}}@media (max-width:700px){{.r,.hd{{grid-template-columns:150px 1fr}}}}</style></head><body><main>
<h1>Plan maestro Herramientas MX</h1><p class="m">De septiembre de 2026 a mayo de 2027 · fechas tentativas · personas solo por rol · #338</p>
<p class="ley m"><span style="background:var(--f)"></span>Fase<span style="background:var(--a)"></span>App MVP<span style="background:var(--a2)"></span>App completa<span style="background:var(--g)"></span>Compuerta</p>
<div class="gw"><div class="gi"><div class="hd"><div></div><div class="ms">{''.join(meses)}{marcas}</div></div>{''.join(barras)}</div></div>
<div class="tw"><table><tr><th>Fase</th><th>Fechas</th><th>Criterio para pasar</th><th>Decide</th><th>Costo</th><th>Acumulado</th></tr>
{''.join(f"<tr><td><b>{f['id']}</b> {html.escape(f['nombre'])}</td><td>{f['ini']:%d-%b} a {f['fin']:%d-%b-%y}</td><td>{html.escape(f['criterio'])}</td><td>{html.escape(f['decide'])}</td><td>{mx(f['costo'])}</td><td>{mx(f['acum'])}</td></tr>" for f in FASES)}
</table></div><p class="m">Detalle, presupuesto, capacidad de impresion, riesgos y gestion del cambio: plan_maestro.md y plan_maestro.xlsx.</p></main></body></html>"""
open(os.path.join(BASE, 'plan_maestro_gantt.html'), 'w', encoding='utf-8').write(G)
print(json.dumps({f['id']: (f['costo'], f['acum'], f['kg'], f['h_std'], f['sem_1std'], f['sem_1std_2rap']) for f in FASES}, indent=0))
