"""Los papeles de la semana 1 del motor 3, para Pablo, Rissia y Esteban.

POR QUE EXISTE ESTE ARCHIVO. El motor 3 entra en uso con dos personas que NO van a
abrir la herramienta. Todo lo que ellos necesitan tiene que salir de aqui como un
archivo que se abre en un navegador o en Excel, y tiene que poder REGENERARSE: un
papel que se escribio a mano una vez queda viejo en silencio, y este mismo repo ya
pago ese error tres veces (el conteo del exportador, el numero de cuentas del doc de
linea base, las dos formas de M5).

Genera cuatro cosas:

  tarjeta          la tarjeta 1 del piloto, en una pagina, para que Esteban la
                   suba y Pablo la refine
  hoja_de_pablo    que tiene que verificar Pablo y como la devuelve
  encargos         las celdas cuenta x familia que la herramienta no cubre, con la
                   busqueda de Sales Navigator ya armada, para Rissia
  hoja_de_toques   el .xlsx que Rissia llena en dos minutos y que
                   `cargar_toques.py` lee

Sin nombres de personas en ninguno de los cuatro, con una excepcion declarada: los
nombres de PABLO, RISSIA y ESTEBAN si aparecen, porque son quienes trabajan aqui y
el papel va dirigido a ellos. La linea que no se cruza es la de los contactos de las
cuentas.
"""
from __future__ import annotations

import argparse
import hashlib
import html as _h
import os
import sys
from datetime import date

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, "herramientas"))

import tarjeta_hershey as th                                    # noqa: E402
from flujo.cadencia import actividad_de_refinar_ficha           # noqa: E402
from flujo.ficha import INTERLOCUTOR                            # noqa: E402
from flujo.sello import version                                 # noqa: E402

# ---------------------------------------------------------------------- estilo
# Uno solo, compartido, y deliberadamente CORTO. Estos papeles se imprimen y se
# leen en un telefono; no son la ficha de prospeccion, que tiene su propio diseno
# aprobado en #323.
CSS = """
:root{--paper:#f5f7f4;--ink:#1b2621;--muted:#66716c;--line:#dde3df;--card:#fff;
 --teal:#0f6b5c;--teal-soft:#e2efeb;--hot:#b3261e;--hot-bg:#fbe9e7;
 --warn:#b06a00;--warn-bg:#fbf3e3;--ok:#1f7a4d;--ok-bg:#e6f4ec}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
 --paper:#121815;--ink:#e8efeb;--muted:#9aa8a2;--line:#2a3831;--card:#18211d;
 --teal:#4db5a0;--teal-soft:#183029;--hot:#f2897f;--hot-bg:#2c1613;
 --warn:#e0a94a;--warn-bg:#2e2413;--ok:#5bc98a;--ok-bg:#122a1d}}
:root[data-theme="dark"]{--paper:#121815;--ink:#e8efeb;--muted:#9aa8a2;
 --line:#2a3831;--card:#18211d;--teal:#4db5a0;--teal-soft:#183029;
 --hot:#f2897f;--hot-bg:#2c1613;--warn:#e0a94a;--warn-bg:#2e2413;
 --ok:#5bc98a;--ok-bg:#122a1d}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-size:16px;
 line-height:1.55;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,
 sans-serif}
.wrap{max-width:820px;margin:0 auto;padding-block:26px 64px;
 padding-left:18px;padding-right:18px}
.kicker{font-size:12px;letter-spacing:.09em;text-transform:uppercase;
 color:var(--teal);font-weight:700}
h1{margin:6px 0 4px;font-size:28px;font-weight:800;letter-spacing:-.02em;
 line-height:1.15;text-wrap:balance}
.sub{color:var(--muted);font-size:15px;margin:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;
 padding:18px 20px;margin:16px 0}
.card h2{margin:0 0 10px;font-size:12.5px;letter-spacing:.08em;
 text-transform:uppercase;color:var(--teal);font-weight:700}
.plazo{background:var(--hot-bg);border:1px solid var(--hot);border-radius:12px;
 padding:14px 18px;margin:16px 0}
.plazo b{color:var(--hot)}
.ok{background:var(--ok-bg);border:1px solid var(--ok);border-radius:12px;
 padding:12px 16px;margin:14px 0}
.nota{background:var(--warn-bg);border:1px solid var(--warn);border-radius:10px;
 padding:11px 14px;margin:12px 0;font-size:15px}
table{width:100%;border-collapse:collapse;font-size:14.5px;background:var(--card)}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;
 color:var(--muted);padding:8px 9px;border-bottom:1px solid var(--line)}
td{padding:9px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:none}
.tabla-scroll{overflow-x:auto}
code,.mono{font-family:ui-monospace,Menlo,monospace;font-size:13px;
 word-break:break-word}
.filtro{display:block;background:var(--teal-soft);border-radius:8px;
 padding:8px 11px;margin:5px 0;font-family:ui-monospace,Menlo,monospace;
 font-size:13px;color:var(--ink)}
ul{margin:8px 0 0;padding-left:20px} li{margin:7px 0}
ol.pasos{margin:8px 0 0;padding-left:22px} ol.pasos li{margin:10px 0}
.chk{list-style:none;padding-left:0;margin:10px 0 0}
.chk li{display:grid;grid-template-columns:26px 1fr;gap:10px;margin:12px 0}
.chk .box{width:18px;height:18px;border:2px solid var(--teal);border-radius:4px;
 margin-top:3px}
.foot{color:var(--muted);font-size:12.5px;text-align:center;margin-top:24px;
 line-height:1.5}
@media (max-width:520px){h1{font-size:23px}}
@media print{body{background:#fff}.wrap{padding:0;max-width:none}
 .card,.plazo{page-break-inside:avoid}}
"""


def _pagina(titulo: str, cuerpo: str) -> str:
    return (f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_h.escape(titulo)}</title>
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
{cuerpo}
<div class="foot">Generado por prospector {_h.escape(version())} ·
regenerable con <code>herramientas/paquete_semana1.py</code><br>
Sin nombres de contactos: la herramienta trabaja por puesto y cuenta.</div>
</div>
</body>
</html>
""")


def sha256_de(ruta: str) -> str:
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for trozo in iter(lambda: f.read(65536), b""):
            h.update(trozo)
    return h.hexdigest()


# ============================================================ 1 · LA TARJETA
#
# La fecha de refinado. Esteban la sube el 30-sep-2026, que es MIERCOLES, y pidio
# que Pablo la devuelva el 2-oct. Ese 2-oct es VIERNES y son DOS dias habiles, no
# tres -- tres caen en lunes 5-oct--. Se usa la fecha explicita porque es la que
# Pablo va a leer, y la cuenta queda escrita en el papel para que nadie la deduzca
# mal despues.
HABILES_DE_PABLO = 2


def tarjeta(sube_el: date, hoy: date) -> str:
    t = th.armar(sube_el=sube_el, hoy=hoy)
    t["actividad_que_abre"] = actividad_de_refinar_ficha(
        "Pablo", sube_el, habiles=HABILES_DE_PABLO)
    s, act, cad = t["senal"], t["actividad_que_abre"], t["cadencia"]

    filas_c = "".join(
        f'<tr><td><b>{_h.escape(c["puesto"])}</b></td>'
        f'<td>{_h.escape(c["canal_recomendado"].replace("_", " "))}</td>'
        f'<td>{_h.escape(c["nivel_confianza"])}</td>'
        f'<td class="mono">(vacio)</td>'
        f'<td>{_h.escape(c["por_que_ese_canal"])}</td></tr>'
        for c in t["contactos"])

    filas_t = []
    for p in cad["plan"]:
        fechas = " · ".join(f'#{x["n"]} {x["fecha"]}' for x in p["toques"])
        filas_t.append(
            f'<tr><td><b>{_h.escape(p["puesto"])}</b></td>'
            f'<td>{_h.escape(p["canal"].replace("_", " "))}</td>'
            f'<td>{p["espera_normal"]} dias habiles</td>'
            f'<td class="mono">{_h.escape(fechas)}</td></tr>')

    cuerpo = f"""
<div class="kicker">Motor 3 · tarjeta 1 del piloto</div>
<h1>{_h.escape(t["empresa"])}, planta {_h.escape(t["planta"])}</h1>
<p class="sub">{_h.escape(t["giro"])} · puntaje {s["puntaje"]} de 137 ·
<b>{_h.escape(s["veredicto"])}</b></p>

<div class="plazo">
<b>Pablo revisa esta tarjeta y la devuelve el {act["vence"]}.</b>
Son {act["habiles"]} dias habiles contados desde que se sube
({act["arranca"]}, miercoles). <b>El 2-oct es viernes.</b> Si el plazo fueran tres
dias habiles la fecha seria el lunes 5-oct: se uso el 2-oct porque es la fecha que
Esteban pidio.
<p style="margin:8px 0 0">Mientras Pablo no la devuelva, <b>el primer toque no
sale</b>. La cadencia de abajo arranca el mismo dia que se sube porque el primer
contacto tiene historia en el buzon, pero si la revision atrasa, las fechas se
corren con ella.</p>
</div>

<div class="card">
<h2>Por que esta cuenta y por que ahora</h2>
<p style="margin:0 0 10px">{_h.escape(s["texto"])}</p>
<div class="tabla-scroll"><table>
<tr><th>Que</th><th>Valor</th></tr>
<tr><td>Fecha de la senal</td><td>{s["fecha_senal"]}</td></tr>
<tr><td>De donde salio</td><td>el buzon de FTS — el cliente lo dijo por escrito,
 que es la fuente mas fuerte que hay</td></tr>
<tr><td>Que tipo de necesidad</td><td>necesidad declarada</td></tr>
<tr><td><b>Caduca el</b></td><td><b>{t["caduca_el"]}</b> —
 {_h.escape(t["caduca_por_que"])}</td></tr>
</table></div>
</div>

<div class="card">
<h2>A quien se le habla, en que orden y por que canal</h2>
<div class="tabla-scroll"><table>
<tr><th>Puesto</th><th>Canal</th><th>Que tan seguro</th><th>Correo</th>
<th>Por que ese canal</th></tr>
{"".join(filas_c)}
</table></div>
<div class="nota"><b>La columna de correo va vacia a proposito.</b> El patron de
la cuenta se midio con cuatro fuentes y tres coincidieron contra una, asi que se
sabe <b>con salvedad</b> — es un patron probable, no un correo visto—. Un correo
deducido de un patron, puesto en el campo de envio de Odoo, es un rebote con el
dominio de FTS o un correo a la persona equivocada. <b>Se llena cuando alguien vea
uno de verdad</b>, y esa es una de las cosas que Pablo puede cerrar hoy.</div>
</div>

<div class="card">
<h2>Cuando sale cada toque</h2>
<p class="sub" style="margin:0 0 10px">{cad["toques_totales"]} toques en total.
<b>Un solo primer contacto por dia</b>, con {cad["separacion_entre_primeros"]} dias
de separacion: cuatro correos de la misma empresa el mismo dia no se ven como
seguimiento, se ven como enjambre.</p>
<div class="tabla-scroll"><table>
<tr><th>Puesto</th><th>Canal</th><th>Espera entre toques</th><th>Fechas</th></tr>
{"".join(filas_t)}
</table></div>
</div>

<div class="card">
<h2>Tres cosas que no se hacen en esta tarjeta</h2>
<ul>
<li>No se escribe un correo deducido en el campo de envio de Odoo. Va en la nota,
 con su nivel escrito.</li>
<li>No se manda mas de un primer contacto por dia a la misma cuenta.</li>
<li><b>No hay celular personal, y no va a haber.</b> Que alguien lo haya subido a
 un CV no lo vuelve material de contacto.</li>
</ul>
</div>
"""
    return _pagina(f'{t["empresa"]} {t["planta"]} — tarjeta 1 del piloto', cuerpo)


# ======================================================== 2 · HOJA DE PABLO
def hoja_de_pablo(sube_el: date, hoy: date) -> str:
    t = th.armar(sube_el=sube_el, hoy=hoy)
    act = actividad_de_refinar_ficha("Pablo", sube_el, habiles=HABILES_DE_PABLO)
    puestos = "".join(
        f'<li><span class="box"></span><div><b>{_h.escape(c["puesto"])}</b><br>'
        f'<span class="sub">¿Existe ese puesto en Escobedo? ¿Se llama asi ahi, o '
        f'le dicen de otra forma?</span></div></li>'
        for c in t["contactos"])
    cuerpo = f"""
<div class="kicker">Motor 3 · para Pablo</div>
<h1>Revisar la tarjeta de Hershey Escobedo</h1>
<p class="sub">Una pagina. Son tres preguntas y tarda menos de lo que parece.</p>

<div class="plazo"><b>Para el {act["vence"]} (viernes).</b> Mientras no la
devuelvas, <b>no sale ningun correo</b>: la tarjeta espera.</div>

<div class="card">
<h2>1 · ¿Estos cuatro puestos existen en Escobedo?</h2>
<p class="sub" style="margin:0">Marca el que si existe. Si le dicen de otra forma,
escribe como le dicen — eso vale mas que el titulo generico.</p>
<ul class="chk">{puestos}</ul>
</div>

<div class="card">
<h2>2 · El correo de la casa, ¿es nombre-y-apellido pegados?</h2>
<p style="margin:0 0 8px">Lo que la herramienta midio es que el formato
<b>probablemente</b> sea la inicial del nombre mas el apellido, todo junto, arroba
el dominio de la empresa. Tres fuentes dijeron eso y una dijo otra cosa.</p>
<ul>
<li>¿Lo confirmas, o en Escobedo usan otro formato?</li>
<li>Si usan otro, escribe un ejemplo con un correo <b>que hayas visto</b>.</li>
</ul>
</div>

<div class="card">
<h2>3 · ¿Te acuerdas de un correo real de alguno de los cuatro?</h2>
<p style="margin:0 0 8px"><b>Esta es la pregunta que mas vale de las tres.</b> Un
correo que alguien vio de verdad -- en un hilo, en una firma, en una orden-- cambia
el primer toque de «probablemente le llegue» a «le llega». No hace falta que te
acuerdes de todo: con uno solo, la tarjeta cambia.</p>
<div class="nota">Si no te acuerdas de ninguno, <b>dilo</b>. «No me acuerdo» es una
respuesta util y no atrasa nada: la tarjeta sale con el patron y su salvedad
escrita, que es lo que ya tiene.</div>
</div>

<div class="ok">
<b>Como la devuelves.</b> En el mismo lead de Odoo, en la actividad
<i>«Refinar ficha»</i> que ya te llego: escribe las respuestas en el comentario y
marca la actividad como hecha. Si prefieres, contestale a Esteban por correo con
las tres respuestas — lo que no queremos es que quede en una llamada y se pierda.
</div>

<div class="card">
<h2>Lo que NO te estamos pidiendo</h2>
<ul>
<li>No busques los nombres de las personas. Eso lo hace Rissia con su herramienta.</li>
<li>No hables con nadie de la planta todavia. El primer toque sale despues de que
 devuelvas esto.</li>
<li>No busques celulares. No van en ninguna parte de esto.</li>
</ul>
</div>
"""
    return _pagina("Revisar la tarjeta de Hershey Escobedo — para Pablo", cuerpo)


# ==================================================== 3 · ENCARGOS DE RISSIA
#
# Las celdas cuenta x familia que la herramienta NO cubre, medidas en #363. Cada
# una es un encargo: la cuenta, la familia que falta, y la busqueda de Sales
# Navigator ya armada. La familia se nombra con el titulo de INTERLOCUTOR y el
# vocabulario sale de la misma tabla, asi que si manana se le agrega una palabra
# -- como paso con `supervisor` en #363-- el papel se mueve con ella.
CELDAS_VACIAS = (
    # (cuenta, ciudad de la planta, clave de familia, por que esa cuenta importa)
    ("Nemak", "Garcia", "direccion",
     "Hay proyecto GANADO con esta cuenta y una cotizacion pendiente, las dos a "
     "traves de un proveedor. Falta el de arriba de la planta."),
    ("Cuprum", "Monterrey", "direccion",
     "El buscador publico no tiene a esta empresa: es la unica de las diez donde "
     "CERO consultas devolvieron un perfil. Todo lo de esta cuenta sale por aqui."),
    ("Amazon", "Monterrey", "mantenimiento",
     "Su organizacion de mantenimiento se llama RME y publica vacantes del puesto, "
     "asi que el puesto existe; lo que el buscador no da es a la persona."),
    ("Navistar / International Motors", "Escobedo", "mantenimiento",
     "120 MDD a tres anios en el area de pintura, con meta declarada de bajar 10% "
     "el uso de energia, agua y gas. OJO: la cuenta tiene DOS nombres."),
    ("Ragasa / Nutrioli", "Monterrey", "compras",
     "Cotizacion ENVIADA con fecha limite en mayo, a traves de un proveedor. Hay "
     "con quien hablar de proyectos y NO hay con quien hablar de la orden."),
    ("Ragasa / Nutrioli", "Monterrey", "direccion",
     "La misma cuenta: falta el de arriba de la planta."),
)


def _familia(clave: str) -> tuple[str, tuple[str, ...]]:
    for c, titulo, palabras in INTERLOCUTOR:
        if c == clave:
            return titulo, palabras
    raise KeyError(clave)


def encargos() -> str:
    tarjetas = []
    for i, (cuenta, ciudad, clave, por_que) in enumerate(CELDAS_VACIAS, start=1):
        titulo, palabras = _familia(clave)
        cargos = " OR ".join(f'"{p}"' for p in palabras[:8])
        tarjetas.append(f"""
<div class="card">
<h2>Encargo {i} de {len(CELDAS_VACIAS)}</h2>
<h1 style="font-size:22px;margin:0 0 2px">{_h.escape(cuenta)}</h1>
<p class="sub" style="margin:0 0 10px">Planta de {_h.escape(ciudad)} ·
falta: <b>{_h.escape(titulo)}</b></p>
<p style="margin:0 0 10px">{_h.escape(por_que)}</p>
<p style="margin:12px 0 4px"><b>La busqueda, para pegar en Sales Navigator:</b></p>
<span class="filtro">Current company &nbsp;→&nbsp; {_h.escape(cuenta)}</span>
<span class="filtro">Geography &nbsp;→&nbsp; {_h.escape(ciudad)}, Nuevo Leon</span>
<span class="filtro">Title &nbsp;→&nbsp; {_h.escape(cargos)}</span>
<div class="nota"><b>La empresa y el lugar van en el FILTRO, no escritos en el
cuadro de busqueda.</b> Escribir la ciudad en el texto no filtra: lo probamos y una
busqueda con «Monterrey» escrito devolvio a alguien con ese mismo puesto en
Sidney.</div>
<p style="margin:10px 0 0"><b>Que haces con lo que encuentres:</b> lo anotas en la
<b>hoja de toques</b> cuando le escribas — una linea por persona que contactes, con
la cuenta, la planta, el puesto y como te fue. No hace falta que lo pases a ningun
otro lado.</p>
</div>""")

    cuerpo = f"""
<div class="kicker">Motor 3 · trabajo de la semana</div>
<h1>Seis huecos, seis busquedas</h1>
<p class="sub">Son los lugares donde la herramienta <b>ya busco y no encontro</b>.
No es que estas cuentas no tengan a esa gente: es que sus perfiles no estan donde
la herramienta puede ver. Sales Navigator si los ve.</p>

<div class="ok"><b>Lo que ya esta hecho y no hay que repetir.</b> En las cuentas de
abajo la herramienta si encontro gente de <b>otras</b> familias — por ejemplo en
Ragasa hay con quien hablar de proyectos—. Cada encargo dice <b>una sola</b>
familia: es la que falta. Buscar las otras es repetir trabajo.</div>

{"".join(tarjetas)}

<div class="card">
<h2>Si una cuenta no da nada</h2>
<p style="margin:0">Anotalo igual en la hoja de toques, con resultado
<b>sin respuesta</b> y una nota corta de que probaste. Que una busqueda no de nada
<b>tambien es informacion</b>: es lo que nos dice si el problema es la cuenta o la
forma de buscar, y sin ese renglon no hay forma de saberlo.</p>
</div>
"""
    return _pagina("Seis huecos, seis busquedas — trabajo de la semana", cuerpo)


# =================================================== 4 · LA HOJA DE TOQUES
#
# Lo mas simple que funciona. Rissia y Pablo NO van a abrir la herramienta, asi que
# el registro tiene que ser un archivo que ya saben usar. Siete columnas, dos de
# ellas con lista desplegable para que no haya forma de escribir un canal que la
# base no acepta.
#
# SIN NOMBRES, y no es pudor: es que el lazo no los necesita. Lo que los tres lazos
# miden es (cuenta, planta, puesto, canal, resultado, fecha). Un nombre en una hoja
# de Excel en OneDrive es un dato personal viajando por un canal que nadie audita, y
# la base del piloto ya esta disenada para guardar personas en dos tablas y solo dos.
COLUMNAS_DE_LA_HOJA = (
    ("fecha", "cuando lo hiciste — 2026-10-02"),
    ("cuenta", "la empresa, como viene en el encargo"),
    ("planta", "la ciudad de la planta"),
    ("puesto", "el puesto de la persona, NO su nombre"),
    ("canal", "por donde le escribiste"),
    ("resultado", "como te fue"),
    ("nota", "una linea, opcional"),
)

# Lo que la vendedora escoge en la hoja -> lo que la base guarda. La hoja habla
# como habla una persona y la base habla como habla la base; la traduccion vive
# aqui, en un solo lugar, y `cargar_toques.py` la importa de aqui.
CANALES_DE_LA_HOJA = {
    "correo": "correo_directo",
    "LinkedIn": "linkedin",
    "telefono a la planta": "conmutador",
    "evento": "evento",
}
RESULTADOS_DE_LA_HOJA = {
    "sin respuesta": "sin_respuesta",
    "respondio": "respuesta_positiva",
    "reunion": "reunion_agendada",
    "rechazo": "respuesta_negativa",
    "ya no esta": "ya_no_trabaja_aqui",
    # Los dos que la hoja NO ofrece pero la base si tiene, por si alguien los
    # escribe a mano: un rebote y una persona equivocada los detecta quien manda
    # el correo, no quien llena la hoja despues.
    "reboto": "rebote",
    "persona equivocada": "persona_equivocada",
}


def hoja_de_toques(ruta: str, ejemplos: bool = True) -> str:
    """Escribe el .xlsx con sus listas desplegables. Devuelve la ruta."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.worksheet.datavalidation import DataValidation

    wb = Workbook()
    ws = wb.active
    ws.title = "toques"

    ws["A1"] = "REGISTRO DE TOQUES — motor 3"
    ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = ("Una linea por cada vez que le escribes o le llamas a alguien. "
                "NO escribas nombres de personas: el puesto y la cuenta bastan.")
    ws["A2"].font = Font(italic=True, size=10)
    for fila in (1, 2):
        ws.merge_cells(start_row=fila, start_column=1, end_row=fila, end_column=7)

    encabezado = PatternFill("solid", fgColor="0F6B5C")
    for i, (col, ayuda) in enumerate(COLUMNAS_DE_LA_HOJA, start=1):
        c = ws.cell(row=4, column=i, value=col)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = encabezado
        a = ws.cell(row=5, column=i, value=ayuda)
        a.font = Font(italic=True, size=9, color="66716C")
        a.alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = "A6"
    for col, ancho in zip("ABCDEFG", (12, 22, 16, 30, 20, 16, 44)):
        ws.column_dimensions[col].width = ancho

    def _lista(opciones, col, titulo, mensaje):
        dv = DataValidation(type="list",
                            formula1='"' + ",".join(opciones) + '"',
                            allow_blank=True, showDropDown=False)
        dv.error = mensaje
        dv.errorTitle = titulo
        dv.showErrorMessage = True
        ws.add_data_validation(dv)
        dv.add(f"{col}6:{col}500")

    _lista(list(CANALES_DE_LA_HOJA), "E", "Canal no valido",
           "Escoge uno de la lista. No hay columna de celular y no va a haber.")
    _lista(["sin respuesta", "respondio", "reunion", "rechazo", "ya no esta"],
           "F", "Resultado no valido", "Escoge uno de la lista.")

    if ejemplos:
        for i, fila in enumerate((
            ("2026-10-02", "Hershey", "Escobedo", "Gerente de Mantenimiento",
             "correo", "respondio", "pidio la ficha tecnica del sistema"),
            ("2026-10-02", "Nemak", "Garcia", "Gerente de Planta",
             "LinkedIn", "sin respuesta", ""),
            ("2026-10-05", "Ragasa", "Monterrey", "Comprador de proyecto",
             "telefono a la planta", "reunion", "jueves 8 a las 10, en planta"),
        ), start=6):
            for j, v in enumerate(fila, start=1):
                ws.cell(row=i, column=j, value=v)

    ayuda = wb.create_sheet("como se llena")
    for i, linea in enumerate((
        ("Como se llena", ""),
        ("", ""),
        ("Una linea por toque", "Si le escribiste tres veces al mismo puesto, "
                               "son tres lineas."),
        ("La fecha", "El dia que lo hiciste. Si se te paso, pon el dia real, no "
                     "el de hoy: las fechas son lo que mide cuanto tarda la "
                     "gente en contestar."),
        ("El puesto, no el nombre", "«Gerente de Mantenimiento», no el nombre de "
                                    "la persona. Si no sabes el puesto exacto, "
                                    "pon el que mas se parezca."),
        ("Cuenta y planta", "Como vienen en el encargo. Si es una cuenta con dos "
                            "nombres, usa el primero."),
        ("Canal y resultado", "Se escogen de la lista. Si escribes otra cosa, "
                              "Excel te avisa y la herramienta la rechaza."),
        ("«sin respuesta» tambien se anota", "Que alguien no conteste ES "
                                             "informacion: es lo que dice si el "
                                             "canal sirve. Una hoja con solo los "
                                             "exitos no mide nada."),
        ("«reunion» es lo mejor que hay", "Si se agendo reunion, pon «reunion» y "
                                          "no «respondio»: son cosas distintas y "
                                          "la diferencia se mide."),
        ("La nota", "Una linea, opcional. Sirve para acordarte, no para el "
                    "reporte."),
        ("", ""),
        ("Nunca", "Nombres de personas, correos, telefonos. Nada de eso va en "
                  "esta hoja."),
    ), start=1):
        ayuda.cell(row=i, column=1, value=linea[0]).font = Font(bold=True)
        c = ayuda.cell(row=i, column=2, value=linea[1])
        c.alignment = Alignment(wrap_text=True, vertical="top")
    ayuda.column_dimensions["A"].width = 30
    ayuda.column_dimensions["B"].width = 78

    wb.save(ruta)
    return ruta


# ============================================================ EL COMANDO
#
# Los cuatro papeles salen de UNA corrida, y el comando imprime el sha256 de cada
# uno. El hash no es adorno: la subida a OneDrive se verifica por contenido -- en
# #33x una subida quedo truncada y el tamanio coincidia--, y el hash es lo que se
# pega en el issue para que dentro de un mes se sepa cual version leyo Pablo.
def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--salida", required=True, help="carpeta donde escribir")
    ap.add_argument("--sube-el", default="",
                    help="la fecha en que Esteban sube la tarjeta (2026-09-30)")
    ap.add_argument("--hoy", default="")
    ap.add_argument("--sin-ejemplos", action="store_true",
                    help="la hoja de toques sale vacia, sin las tres filas de "
                         "muestra")
    a = ap.parse_args(argv)

    hoy = date.fromisoformat(a.hoy) if a.hoy else date.today()
    sube = date.fromisoformat(a.sube_el) if a.sube_el else hoy
    os.makedirs(a.salida, exist_ok=True)

    papeles = [
        ("tarjeta-1-hershey-escobedo.html", tarjeta(sube_el=sube, hoy=hoy)),
        ("hoja-para-pablo.html", hoja_de_pablo(sube_el=sube, hoy=hoy)),
        ("encargos-de-la-semana.html", encargos()),
    ]
    hechos = []
    for nombre, cuerpo in papeles:
        ruta = os.path.join(a.salida, nombre)
        # Con salto de linea final: sin el, la verificacion por bytes de OneDrive
        # discrepa en uno y la subida se rechaza. Paso en #353.
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(cuerpo if cuerpo.endswith("\n") else cuerpo + "\n")
        hechos.append(ruta)
    hechos.append(hoja_de_toques(os.path.join(a.salida, "registro-de-toques.xlsx"),
                                 ejemplos=not a.sin_ejemplos))

    print(f"\n  PAQUETE DE LA SEMANA 1 — sube el {sube.isoformat()}, "
          f"generado el {hoy.isoformat()}")
    for ruta in hechos:
        print(f"\n  {os.path.basename(ruta)}")
        print(f"      {os.path.getsize(ruta)} bytes")
        print(f"      sha256 {sha256_de(ruta)}")
    print("\n  Escrituras a Odoo: 0. Estos papeles no tocan Odoo ni Lusha.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
