"""Sesion nocturna 1 (#330), Bloque 7 · material para el equipo.

  material_operaciones.html   pagina autocontenida para operaciones: el problema en numeros, el carrito, el ciclo en planta,
                              que cambia para cada rol y que se mide. Solo roles, sin nombres.
  checklist_piloto.html       checklist imprimible (carta) del piloto para el encargado del frente: linea base, diaria x 20 dias
                              habiles, caseta y viernes. Se llena a mano; el papel lleno NO se sube al repo (va a SharePoint).
Numeros: datos/caso_negocio.json (bloque 6), diseno_carrito.json, verificaciones_suite.md (bloque 5).
"""
import json, os, html
from datetime import date, timedelta
BASE = os.path.join(os.path.dirname(__file__), '..')
cn = json.load(open(os.path.join(BASE, 'datos', 'caso_negocio.json'), encoding='utf-8'))
d = json.load(open(os.path.join(BASE, 'diseno_carrito.json'), encoding='utf-8'))
e = html.escape
def mx(v): return f'${v:,.0f}'

A = cn['anual']['A. Reposicion con detalle (base)']; B = cn['anual']['B. A + fondeo sin detalle + compras duplicadas']
fam = sorted(((k, v) for k, v in cn['familias'].items() if 'sin detalle' not in k and 'duplicada' not in k), key=lambda kv: -kv[1]['importe'])
huer = [h for h in cn['huerfanos'] if h['clas'].startswith('HUERFANO')]
pil = cn['piloto']; plan = cn['plan_actual']

def cajones(m):
    out = []
    for c in d['modulos'][m]['cajas']:
        for cj in c['cajones']:
            if cj['piezas']: out.append((c['modelo'], cj['n'], [(p['activo'], p['corto']) for p in cj['piezas']]))
    return out

CSS = """
:root{--bg:#f6f7f9;--card:#fff;--tx:#1b2430;--mut:#5b6674;--ac:#1f3a5f;--am:#f2b705;--ok:#1e7a46;--bd:#dde2e8;--warn:#b54708}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#11161d;--card:#19212b;--tx:#e8edf3;--mut:#9aa7b6;--ac:#8fb3e0;--bd:#2b3643;--ok:#5cc28a;--warn:#f0a35c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1080px;margin:0 auto;padding:16px}
h1{font-size:1.6rem;margin:.2em 0}h2{font-size:1.2rem;margin:1.6em 0 .6em;color:var(--ac)}
.sub{color:var(--mut)}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.card{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:14px}
.big{font-size:1.7rem;font-weight:700;line-height:1.1}.lab{color:var(--mut);font-size:.9rem}
table{width:100%;border-collapse:collapse;background:var(--card);font-size:.95rem}
th,td{border:1px solid var(--bd);padding:6px 8px;text-align:left;vertical-align:top}th{background:var(--ac);color:#fff}
.tw{overflow-x:auto}
ol.ciclo{list-style:none;padding:0;margin:0;display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
ol.ciclo li{background:var(--card);border:1px solid var(--bd);border-left:5px solid var(--am);border-radius:8px;padding:10px}
ol.ciclo b{display:block}
.nota{border-left:4px solid var(--warn);padding:8px 12px;background:var(--card);border-radius:6px}
.caja{display:flex;flex-wrap:wrap;gap:8px}.caja div{flex:1 1 200px;background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:10px}
footer{color:var(--mut);font-size:.85rem;margin:2em 0 1em}
"""

def pagina():
    roles = [
        ('Encargado del frente', 'Abre el carrito al llegar. Al cierre revisa cajón por cajón contra la silueta amarilla, toma la foto, anota lo que falta y lo cierra con candado. Si lo mandan a otra planta, entrega el carrito a alguien que se queda y cambia la combinación.', 'Hoy la herramienta está en cajas generales y nadie responde por pieza.'),
        ('Técnico del frente', 'Toma y regresa la herramienta al mismo hueco. Si algo se rompe o falta, lo avisa ese mismo día al encargado.', 'Ya no hay que buscar: cada cosa tiene su lugar.'),
        ('Supervisor SR', 'Una visita sin aviso por semana con la checklist. Aprueba las entregas entre técnicos. Llena la medición del viernes.', 'Pasa de preguntar dónde quedó algo a revisar una foto.'),
        ('Manager de operaciones', 'Cuando el plan mueve gente de planta, avisa qué pasa con el carrito. Decide al final del piloto si se escala.', 'El plan nocturno ya incluye el carrito.'),
        ('Taller', 'Arma el carrito, lo recibe al volver y repone lo que falte con su registro.', 'Recibe un carrito completo o con un faltante anotado, no una caja revuelta.'),
        ('Chofer', 'Lleva y recoge el carrito con la salida del taller y la entrada en caseta. Revisa los proyectos sin gente para recuperar herramienta.', 'El carrito viaja con su lista y su candado.'),
        ('Compras (supply chain)', 'Compra solo lo que la revisión marca como perdido o roto, con la referencia del cajón.', 'Cada reposición queda ligada a una pieza y a un cajón.'),
        ('Ingeniería', 'Imprime los cajones por prioridad, mide el peso y el tiempo reales y ajusta las fichas que no calcen.', 'Mide lo que antes se estimaba.'),
    ]
    med = [('M1', 'Días con revisión de cierre completa', '90 % o más'), ('M2', 'Faltantes detectados en la revisión', 'se cuentan'),
           ('M3', 'Piezas perdidas de verdad (más de 48 h)', '0'), ('M4', 'Minutos de la revisión de cierre', '5 o menos'),
           ('M5', 'Minutos por turno buscando herramienta', 'que baje contra la semana 0'), ('M6', 'Días con candado al cierre', '95 % o más'),
           ('M7', 'Rechazos en caseta', '0 en las semanas 3 y 4'), ('M8', 'Fichas reimpresas', '1 por cajón como máximo'),
           ('M9', 'Compras de reposición del frente', '0 por pérdida')]
    ciclo = [('1. Taller', 'Se arma y se revisa contra la lista. Candado y combinación nueva.'),
             ('2. Caseta de entrada', 'Salida del taller y entrada a la planta con su formato.'),
             ('3. Uso diario', 'Se abre al llegar. Cada herramienta vuelve a su hueco.'),
             ('4. Revisión de cierre', 'Foto cajón por cajón: se ve lo amarillo de lo que falta.'),
             ('5. Resguardo', 'Candado en el lugar asignado de la planta.'),
             ('6. Cambio de frente', 'Si el encargado se va, se entrega a otro técnico o regresa al taller.'),
             ('7. Retiro', 'Al terminar el proyecto, vuelve al taller con su revisión.')]
    fam_rows = ''.join(f'<tr><td>{e(k)}</td><td>{v["piezas"]:.0f}</td><td>{mx(v["importe"])}</td></tr>' for k, v in fam)
    caj = ''.join(f'<div><b>Cajón {n} · {e(mod)}</b><br>' + '<br>'.join(e(c) for _, c in ps) + '</div>' for mod, n, ps in cajones('BASE'))
    return f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Carrito de herramienta FTS</title><style>{CSS}</style></head><body><main>
<h1>Carrito de herramienta FTS</h1>
<p class="sub">Para el equipo de operaciones. Piloto en Topo Chico del 5 al 30 de octubre de 2026. Solo hay roles, sin nombres.</p>

<h2>El problema en números</h2>
<div class="grid">
<div class="card"><div class="big">{mx(A['ult_12m'])}</div><div class="lab">Herramienta repuesta en los últimos 12 meses, compras de Odoo sin IVA. Y es el mínimo: no cuenta caja chica ni tarjeta</div></div>
<div class="card"><div class="big">{mx(B['ult_12m'])}</div><div class="lab">Si se suman el fondeo sin detalle y dos compras duplicadas</div></div>
<div class="card"><div class="big">{len(huer)}</div><div class="lab">Proyectos en progreso sin nadie de FTS desde hace semanas (último día: {', '.join(h['ult'] for h in huer)}). Si quedó herramienta ahí, no tiene dueño</div></div>
<div class="card"><div class="big">96 %</div><div class="lab">Asistencias de campo con proyecto: sí sabemos dónde está la gente. Falta saber dónde está la herramienta</div></div>
</div>
<h3>Lo que más se repone</h3>
<div class="tw"><table><tr><th>Familia</th><th>Piezas</th><th>Importe</th></tr>{fam_rows}</table></div>

<h2>El carrito</h2>
<p>Son 3 cajas PACKOUT apiladas:</p>
<ul>
<li>la 8420 abajo, con la esmeriladora y el cargador;</li>
<li>encima, la 8443, con las M18 y las pinzas; esta sí cierra con barra y candado;</li>
<li>y la 8444, con llaves, desarmadores y pinzas de presión.</li>
</ul>
<p>Cada cajón tiene fichas impresas con la silueta de cada pieza. Si una pieza falta, se ve el hueco amarillo. Los módulos (tubería, eléctrico, soldadura, civil y medición) se montan encima según el trabajo.</p>
<div class="caja">{caj}</div>
<p class="sub">Vista en 3D: <code>vista_3d_carrito.html</code>. Etiquetas QR: <code>etiquetas/</code>.</p>

<h2>El ciclo en planta</h2>
<ol class="ciclo">{''.join(f'<li><b>{e(a)}</b>{e(b)}</li>' for a, b in ciclo)}</ol>

<h2>Qué cambia para cada rol</h2>
<div class="tw"><table><tr><th>Rol</th><th>Qué hace</th><th>Qué cambia</th></tr>
{''.join(f'<tr><td><b>{e(a)}</b></td><td>{e(b)}</td><td>{e(c)}</td></tr>' for a, b, c in roles)}</table></div>

<h2>Qué se mide cada viernes</h2>
<div class="tw"><table><tr><th>Clave</th><th>Indicador</th><th>Meta al cierre</th></tr>
{''.join(f'<tr><td>{a}</td><td>{e(b)}</td><td>{e(c)}</td></tr>' for a, b, c in med)}</table></div>
<p class="nota">El piloto cuesta <b>{mx(pil['total'])}</b> usando la herramienta que ya tenemos. El plan completo de 5 carritos cuesta <b>{mx(plan['total'])}</b>, y con lo que hoy registra Odoo no se paga solo. Por eso primero se mide: cuánto se pierde de verdad y cuánto tiempo se va en buscar. Con eso se decide si se escala.</p>
<footer>Fuentes: caso_negocio.xlsx, plan_piloto.md, verificaciones_suite.md y diseno_carrito.json, en docs/herramientas-mx. Issue #330.</footer>
</main></body></html>"""

PCSS = """
*{box-sizing:border-box}body{margin:0;background:#fff;color:#000;font:12px/1.35 Arial,Helvetica,sans-serif}
main{max-width:1000px;margin:0 auto;padding:16px}
h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:14px 0 6px;border-bottom:2px solid #000}
.pag{page-break-after:always;margin-bottom:24px}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:4px 5px;text-align:left;vertical-align:top}
th{background:#eee}.ln{display:inline-block;min-width:140px;border-bottom:1px solid #000;margin-right:12px}
.box{display:inline-block;width:14px;height:14px;border:1px solid #000;vertical-align:middle;margin-right:4px}
.tw{overflow-x:auto}.chica{font-size:11px;color:#333}
@page{size:letter;margin:12mm}
@media screen and (max-width:700px){table{display:block;overflow-x:auto}}
@media print{main{padding:0}.noimp{display:none}}
"""

def checklist():
    ini = date(2026, 10, 5); dias = []
    d0 = ini
    while len(dias) < 20:
        if d0.weekday() < 5: dias.append(d0)
        d0 += timedelta(days=1)
    DS = ['lun', 'mar', 'mié', 'jue', 'vie']
    cj = cajones('BASE') + [(m, f'TUB {n}', ps) for m, n, ps in cajones('TUB')]
    fila_caj = ''.join(f'<tr><td>{e(str(n))}</td><td>{e(mod)}</td><td class="chica">{"<br>".join(e(a[-8:]) + " " + e(c) for a, c in ps)}</td><td></td><td></td></tr>' for mod, n, ps in cj)
    diaria = ''.join(f'<tr><td>{DS[x.weekday()]} {x.day}/{x.month}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>' for x in dias)
    viernes = ''.join(f'<tr><td>vie {x.day}/{x.month}</td>' + '<td></td>' * 9 + '</tr>' for x in dias if x.weekday() == 4)
    return f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Checklist del piloto</title><style>{PCSS}</style></head><body><main>
<p class="noimp chica">Se imprime en carta. El papel lleno NO se sube al repo: se escanea a la carpeta del proyecto en SharePoint. Personas: el rol, y la firma o las iniciales solo en papel.</p>

<div class="pag">
<h1>Checklist del piloto · Carrito FTS-CAR-01 · Topo Chico</h1>
<p>Planta: <span class="ln"></span> Lugar de resguardo: <span class="ln"></span> Módulo montado: <span class="ln">TUB</span></p>
<h2>Semana 0 · línea base (viernes 2 de octubre)</h2>
<table><tr><th>Pregunta</th><th>Respuesta</th></tr>
<tr><td>¿Cuántas piezas faltan hoy en los packouts actuales del frente contra su lista?</td><td></td></tr>
<tr><td>¿Cuántos minutos por turno se van en buscar herramienta? Contesta el encargado del frente</td><td></td></tr>
<tr><td>¿Dónde se guarda hoy la herramienta al cierre? ¿Con candado?</td><td></td></tr>
<tr><td>Formato de caseta de la planta: ¿qué columnas pide? ¿Deja tomar fotos?</td><td></td></tr>
<tr><td>Combinación cambiada al recibir el carrito <span class="box"></span> Quién la conoce (rol)</td><td></td></tr></table>
<h2>Revisión de cierre · qué va en cada cajón</h2>
<p class="chica">Se abre cajón por cajón. Donde se ve amarillo, falta la pieza. Anota el número de la ficha y qué pasó.</p>
<div class="tw"><table><tr><th>Cajón</th><th>Caja</th><th>Piezas (final del activo y descripción)</th><th>Falta hoy</th><th>Qué pasó</th></tr>{fila_caj}</table></div>
</div>

<div class="pag">
<h2>Registro diario (encargado del frente)</h2>
<p class="chica">Una línea por día. Faltantes: número de fichas en amarillo. Perdida: una pieza que sigue sin aparecer 48 horas después.</p>
<div class="tw"><table><tr><th>Día</th><th>Hora de apertura</th><th>Revisión de cierre: inicio y fin</th><th>Faltantes (fichas)</th><th>¿Aparecieron? (sí/no)</th><th>Foto en SharePoint <span class="box"></span></th><th>Candado <span class="box"></span></th><th>Caseta (entrada o salida, rechazo)</th><th>Iniciales</th></tr>{diaria}</table></div>
</div>

<div class="pag">
<h2>Entrega a otro técnico o a otro frente</h2>
<table><tr><th>Fecha</th><th>Entrega (rol)</th><th>Recibe (rol)</th><th>¿Tiene asistencia hoy en la planta?</th><th>Revisión completa <span class="box"></span></th><th>Combinación cambiada <span class="box"></span></th><th>Destino (planta o taller)</th></tr>
<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table>
<h2>Visita sin aviso del supervisor SR (una por semana)</h2>
<table><tr><th>Fecha</th><th>Faltantes encontrados</th><th>¿Coinciden con el registro diario?</th><th>Candado puesto</th><th>Notas</th></tr>
<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr></table>
<h2>Medición del viernes (supervisor SR)</h2>
<div class="tw"><table><tr><th>Viernes</th><th>M1 revisión completa (días/días)</th><th>M2 faltantes</th><th>M3 perdidas</th><th>M4 minutos promedio</th><th>M5 minutos buscando</th><th>M6 candado (días/días)</th><th>M7 rechazos en caseta</th><th>M8 reimpresiones</th><th>M9 compras</th></tr>{viernes}</table></div>
<p class="chica">Metas al 30 de octubre: M1 90 % o más · M3 en 0 · M4 5 minutos o menos · M6 95 % o más · M7 en 0 en las semanas 3 y 4 · M8 1 por cajón como máximo · M9 en 0 por pérdida. Detalle en plan_piloto.md.</p>
</div>
</main></body></html>"""

open(os.path.join(BASE, 'material_operaciones.html'), 'w', encoding='utf-8').write(pagina())
open(os.path.join(BASE, 'checklist_piloto.html'), 'w', encoding='utf-8').write(checklist())
print('ok')
