"""La lista expandida con sus PUERTAS, para que Esteban la apruebe (#382).

SE GENERA del archivo de la corrida. Cada entrada trae su puntaje con desglose, su
fase de obra y las puertas que esa fase abre, con el interlocutor y el angulo de
cada una. Sin datos personales: empresas, plantas, senales, ligas y puntajes.
"""
import hashlib
import html as H
import json
import os
import sys
from datetime import date

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from flujo.sello import version                                   # noqa: E402
from flujo.radar import plano                                    # noqa: E402

CORRIDA = os.path.join(RAIZ, "datos", "radar-2026-10-07-puertas.json")
SALIDA = os.environ.get("SALIDA_RADAR", "/tmp/")
C = json.load(open(CORRIDA, encoding="utf-8"))
HOY = date.fromisoformat(C["hoy"])
R = C["resumen"]

FAMILIAS = {
 "ZC Rubber": "Termico · Electrico", "Grupo La Moderna": "Electrico · Termico · Manejo",
 "FINSA": "Electrico · Estructura", "Martinrea": "Automatizacion · Electrico",
 "NetShape Mexico": "Electrico · Automatizacion", "Dormakaba": "Electrico · Automatizacion",
 "GE Aerospace": "Electrico · Automatizacion", "Daikin": "Automatizacion · Electrico",
 "Doosan Bobcat": "Electrico · Automatizacion · Manejo",
 "NIFCO": "Electrico · Automatizacion · Termico", "QSMX": "Estructura · Electrico",
 "Ecocab MX": "Electrico · Estructura · Automatizacion",
 "Pegatron": "Electrico · Automatizacion", "Waelzholz": "Termico · Electrico",
 "Inventec": "Automatizacion · Electrico", "LEGO": "Electrico · Automatizacion · Manejo",
 "Yokohama Rubber": "Termico · Electrico", "DH Autoware": "Electrico · Automatizacion",
 "TDI Manufacturing": "Termico · Electrico", "CFE Nuevo Leon": "Electrico",
 "Hyundai WIA": "Electrico · Automatizacion", "Megasteel": "Estructura · Electrico",
}
NOMBRE_DE_PUERTA = {
 "epc": "Puerta A · el EPC / constructor", "usuario": "Puerta B · el usuario de la planta",
 "usuario_directo": "Puerta unica · el usuario, hoy",
 "expansion_lateral": "Expansion lateral · misma cuenta, otra division",
 "planta_ya_intervenida": "Planta ya intervenida · FTS entro por un canal",
}
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
.wrap{max-width:1180px;margin:0 auto;padding-block:26px 64px;
 padding-left:18px;padding-right:18px}
.kicker{font-size:12px;letter-spacing:.09em;text-transform:uppercase;
 color:var(--teal);font-weight:700}
h1{margin:6px 0 4px;font-size:28px;font-weight:800;letter-spacing:-.02em;
 line-height:1.15;text-wrap:balance}
.sub{color:var(--muted);font-size:15px;margin:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;
 padding:16px 18px;margin:14px 0}
.card h2{margin:0 0 8px;font-size:12.5px;letter-spacing:.08em;
 text-transform:uppercase;color:var(--teal);font-weight:700}
.nota{background:var(--warn-bg);border:1px solid var(--warn);border-radius:10px;
 padding:10px 13px;margin:10px 0;font-size:14.5px}
.ok{background:var(--ok-bg);border:1px solid var(--ok);border-radius:10px;
 padding:10px 13px;margin:10px 0;font-size:14.5px}
table{width:100%;border-collapse:collapse;font-size:14px;background:var(--card)}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;
 color:var(--muted);padding:7px 8px;border-bottom:1px solid var(--line)}
td{padding:8px;border-bottom:1px solid var(--line);vertical-align:top;font-size:13.5px}
table.lista{min-width:1050px}
.puerta{margin:4px 0;padding:5px 8px;font-size:12.5px}
tr:last-child td{border-bottom:none}
.tabla-scroll{overflow-x:auto}
.num{font-variant-numeric:tabular-nums;text-align:right}
.pill{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;
 text-transform:uppercase;padding:2px 8px;border-radius:999px}
.p-pasa{background:var(--ok-bg);color:var(--ok);border:1px solid var(--ok)}
.p-guarda{background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn)}
.p-archiva{background:var(--hot-bg);color:var(--hot);border:1px solid var(--hot)}
.puerta{border-left:3px solid var(--teal);background:var(--teal-soft);
 border-radius:0 8px 8px 0;padding:9px 12px;margin:8px 0}
.puerta.cerrada{border-left-color:var(--muted);background:transparent;opacity:.7}
.puerta.futura{border-left-color:var(--warn);background:var(--warn-bg)}
.puerta.desconocida{border-left-color:var(--hot);background:var(--hot-bg)}
.puerta b{font-size:13.5px}
.quien{font-family:ui-monospace,Menlo,monospace;font-size:13px}
.rank{display:inline-block;min-width:26px;height:26px;line-height:26px;
 text-align:center;border-radius:999px;background:var(--teal);color:#fff;
 font-weight:800;font-size:13px;margin-right:8px;padding:0 6px}
a{color:var(--teal)} code{font-family:ui-monospace,Menlo,monospace;font-size:13px}
.foot{color:var(--muted);font-size:12.5px;text-align:center;margin-top:24px;
 line-height:1.5}
@media (max-width:520px){h1{font-size:23px}}
@media print{body{background:#fff}.wrap{padding:0;max-width:none}
 .card{page-break-inside:avoid}}
"""


def e(x):
    return H.escape(str(x), quote=True)


ESTADO_CORTO = {"abierta": "ABIERTA", "cerrada": "cerrada",
                "futura": "futura", "desconocida": "POR AVERIGUAR"}
LETRA = {"epc": "A·EPC", "usuario": "B·usuario",
         "usuario_directo": "única·usuario", "expansion_lateral": "lateral",
         "planta_ya_intervenida": "ya intervenida"}


def _celda_de_puertas(p):
    """Las puertas de una entrada, compactas. Es la columna que importa."""
    if not p["puertas"]:
        return '<span class="sub">ninguna: no es obra nueva ni nombra equipo</span>'
    out = []
    for q in p["puertas"]:
        cls = q["estado"]
        quien = q.get("interlocutor") or "—"
        if q["puerta"] == "epc" and quien == "POR IDENTIFICAR":
            quien = '<b style="color:var(--hot)">por identificar</b>'
        else:
            quien = e(quien)
        cola = ""
        if q.get("meses_desde_la_inauguracion") is not None:
            cola = f' · {q["meses_desde_la_inauguracion"]:g} m de inaugurada'
        # Una puerta DESCONOCIDA sin su razon es inservible: lo que vale de ella
        # es justamente el trabajo que falta. Doosan Bobcat salia «A·EPC ¿? · 0»
        # a secas, y asi no se puede decidir nada.
        porque = ""
        if q["estado"] == "desconocida":
            # completo y sin cortar: a 190 caracteres quedaba «Averiguar si y»
            porque = f'<br><span class="sub">{e(q["por_que"])}</span>'
        sigue = ""
        if q["puerta"] in ("usuario", "usuario_directo") and "sigue: " in q["angulo"]:
            sigue = ('<br><span class="sub">sigue: '
                     + e(q["angulo"].split("sigue: ")[1]) + "</span>")
        out.append(f'<div class="puerta {cls}"><b>{e(LETRA[q["puerta"]])}</b> '
                   f'{e(ESTADO_CORTO[q["estado"]])} · {q["puntos_de_oportunidad"]:g}'
                   f'{cola}<br>{quien}{porque}{sigue}</div>')
    return "".join(out)


def _historia(x):
    for q in x["puertas"]["puertas"]:
        if q["puerta"] in ("expansion_lateral", "planta_ya_intervenida"):
            return (f'<b>sí</b> — vía {e(q.get("la_relacion_existente_es_con"))}'
                    f'<br><span class="sub">{e(q.get("tipo_de_relacion"))}</span>')
    if x["empresa"] == "LEGO":
        return ('<b>sí</b> — cuenta del piloto del motor 3'
                '<br><span class="sub">partner en Odoo (duplicado 2384/2385)</span>')
    return '<span class="sub">no: ni partner, ni lead, ni hilo en el buzón</span>'


def fila(x, i):
    d = x["eval"]["desglose"]
    v = x["eval"]["veredicto"]
    p = x["puertas"]
    dias = x["dias"]
    fecha = (f'{x["fecha"]}<br><span class="sub">hace {dias} d</span>'
             if x.get("fecha") else '<span class="sub">sin fecha</span>')
    if dias is not None and dias > C["ventanas"]["descubrimiento_dias"]:
        fecha += '<br><span class="pill p-guarda">fuera de ventana</span>'
    avisos = "".join(f'<div class="nota">{e(a[:200])}</div>' for a in p["avisos"]
                     if "no sabemos quien es" not in a)
    return f"""<tr>
<td class="num">{i}</td>
<td><b>{e(x['empresa'])}</b><br><span class="sub">{e(x['planta'])}</span>
<br><span class="sub">{e(x['estado'])}{'' if x['de_la_corrida']==C['hoy'] else ' · heredada'}</span></td>
<td>{e(x['texto'][:190])}<br><a href="{e(x['liga'])}">{e(x['liga'].split('/')[2])} — abrir</a>
<br><span class="sub">{e(x['procedencia_fecha'][:95])}</span>{avisos}</td>
<td>{fecha}</td>
<td class="num"><b>{x['eval']['puntaje']}</b><br><span class="pill p-{v}">{e(v)}</span>
<br><span class="sub">{d['proceso']:g}·{d['tipo_de_obra']:g}·{d['capacidad']:g}·{d['frescura']:g}·{d['fuerza_de_fuente']:g}·{d['padron']:g}</span></td>
<td>{e(FAMILIAS.get(x['empresa'], '—'))}<br><span class="sub">fase: {e(p['fase'] or 'no la dice')}</span></td>
<td>{_celda_de_puertas(p)}</td>
<td>{_historia(x)}</td>
</tr>"""


# El ejemplo de «una nota vieja puede valer mas que una fresca» sale de la corrida,
# no de la memoria: la mas vieja CON LA PUERTA DEL USUARIO ABIERTA contra la mas
# fresca de todas. Escrito a mano decia «362 dias contra 10», y el 10 no existia
# -- la mas fresca era de 7--.
def _con_usuario_abierto(x):
    return any(q["puerta"] == "usuario" and q["estado"] == "abierta"
               for q in x["puertas"]["puertas"])


_CON_DIAS = [x for x in C["evaluadas"] if x["dias"] is not None]
_EJEMPLO_VIEJA = max(((x["empresa"], x["dias"]) for x in _CON_DIAS
                      if _con_usuario_abierto(x)), key=lambda t: t[1])
_EJEMPLO_FRESCA = min(((x["empresa"], x["dias"]) for x in _CON_DIAS),
                      key=lambda t: t[1])

# QUIENES son los EPC ya identificados, leido de las puertas. Antes esta frase
# decia «Once puertas y un solo EPC identificado... ese uno es FINSA» a mano, y al
# recalcular la corrida quedo en doce: un numero escrito en prosa que dejo de
# empatar con la tabla de arriba suya.
_IDENT = [q["interlocutor"] for x in C["evaluadas"] for q in x["puertas"]["puertas"]
          if q["puerta"] == "epc" and q["estado"] == "abierta"
          and q.get("interlocutor") and "POR IDENTIFICAR" not in q["interlocutor"]]
_LOS_IDENTIFICADOS = (
    f"Y ese que si: {e(', '.join(_IDENT))} -- y solo porque es quien publica la "
    "nota, no porque la nota diga quien construye para alguien mas."
    if _IDENT else "Ninguna nota de esta corrida nombra al constructor.")

# LO QUE EL RADAR NO DECIDE SOLO. Hay entradas que describen obra -- subestaciones
# nuevas, una ampliacion de 31,350 m2-- y que el radar trata como equipo dentro de
# una planta que ya opera, con una sola puerta. No es un error del emparejado como
# Megasteel: es que quien construye una ampliacion o una subestacion no siempre es
# un EPC llave en mano, y a veces lo contrata el usuario mismo o sale a licitacion.
# Eso lo decide Esteban, no el radar, y por eso se nombran en vez de resolverse.
_OBRA_EN_EL_TEXTO = ("subestacion", "subestaciones", "ampliacion de",
                     "metros cuadrados de nuevo espacio", "construir cuatro")
_SIN_PUERTA_DE_EPC = [
    x for x in C["evaluadas"]
    if not any(q["puerta"] == "epc" for q in x["puertas"]["puertas"])
    and any(t in plano(x["texto"]) for t in _OBRA_EN_EL_TEXTO)]
_CARTA_DE_DUDAS = "".join(
    f'<li><b>{e(x["empresa"])}</b> ({e(x["planta"])}): {e(x["texto"][:150])}…'
    f' <span class="sub">hoy sale con una sola puerta, la del usuario.</span></li>'
    for x in _SIN_PUERTA_DE_EPC)

cuerpo = ('<div class="tabla-scroll"><table class="lista">'
          '<tr><th>#</th><th>Cuenta</th><th>La senal y su fuente</th><th>Fecha</th>'
          '<th>Puntaje</th><th>Familia / fase</th><th>Puertas</th>'
          '<th>Historia con FTS</th></tr>'
          # Esteban pidio la lista ORDENADA POR PUNTAJE. Se ordena aqui y no se
          # confia en el orden del archivo: un sellado o una entrada nueva lo
          # romperia sin que nadie lo note.
          + "".join(fila(x, i) for i, x in enumerate(
              sorted(C["evaluadas"], key=lambda y: -y["eval"]["puntaje"]), start=1))
          + "</table></div>")
doc = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cuentas del noreste y Bajio con sus puertas — {HOY.isoformat()}</title>
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
<div class="kicker">Motor 1 · radar con dos puertas por planta nueva</div>
<h1>{R['senales']} cuentas, y quien compra en cada una</h1>
<p class="sub">Corrida del {HOY.isoformat()}. {R['nuevas_de_esta_corrida']} nuevas y
{R['heredadas_del_5_oct']} heredadas del 5-oct, todas vueltas a puntuar con el
criterio de hoy. Ordenadas por puntaje.</p>

<div class="ok"><b>Lo que cambio, y es lo que hay que leer antes de la lista.</b>
Una planta nueva no es una senal: son <b>dos</b>, con dos compradores distintos.
Durante la obra compra el <b>EPC</b> que trae la planta llave en mano -- FTS no
compite con el, le vende especialidad--. Despues de la inauguracion, de 12 a 18
meses, compra el <b>usuario</b>: lo que el EPC no alcanzo, la segunda linea, la
ampliacion de carga. Cada entrada de abajo dice <b>cual de las dos esta abierta
hoy</b>, y por eso una nota de hace {_EJEMPLO_VIEJA[1]} dias ({e(_EJEMPLO_VIEJA[0])},
con la puerta del usuario abierta) puede valer mas que una de hace
{_EJEMPLO_FRESCA[1]} ({e(_EJEMPLO_FRESCA[0])}).</div>

<div class="nota"><b>Las puertas y lo que significan.</b>
<b>abierta</b>: hay con quien hablar hoy. <b>cerrada</b>: ese comprador ya paso --
entrar ahi es llegar tarde--. <b>futura</b>: se abre en la inauguracion.
<b>desconocida</b>: la nota no dice en que momento esta la obra, y averiguarlo es el
primer trabajo. Los puntos de cada puerta son de OPORTUNIDAD y no se suman al
puntaje de la senal: dicen que tan abierta esta.</div>

<div class="card">
<h2>Los tres angulos, una vez</h2>
<p style="margin:0 0 8px"><b>Puerta A · el EPC.</b> Subcontratista de especialidad:
electrico, tuberia y automatizacion. FTS no compite con el EPC, le entrega la
especialidad que el EPC subcontrata. Y un EPC que ya tiene a FTS en su lista la
vuelve a usar en la siguiente obra de la region.</p>
<p style="margin:0 0 8px"><b>Puerta B · el usuario.</b> Lo que el EPC no alcanzo:
segunda linea, ampliacion de carga, mejoras, y lo que quedo en la lista de
pendientes al arrancar. En las entradas donde el catalogo de FTS tiene con que, la
puerta dice ademas que tipo de proyecto sigue, medido por co-ocurrencia.</p>
<p style="margin:0 0 8px"><b>Puerta unica · el usuario, hoy.</b> Cuando la senal no
es obra nueva sino equipo o linea dentro de una planta que ya opera: no hay EPC de
por medio y decide la planta. El angulo es lo que el equipo nuevo arrastra --
acometida, tablero, integracion de control, enfriamiento--.</p>
<p style="margin:0"><b>Como se identifica un EPC que no esta en la nota.</b> La nota,
el permiso de construccion del municipio o el boletin del parque industrial suelen
nombrar al constructor. Busquedas: «constructora "&lt;empresa&gt;" planta
&lt;municipio&gt;», «quien construye la planta de &lt;empresa&gt;», y el boletin del
parque donde se instala.</p>
</div>

<div class="card">
<h2>La lectura de la corrida</h2>
<div class="tabla-scroll"><table>
<tr><th>Que</th><th class="num">Cuantas</th></tr>
<tr><td>Senales evaluadas</td><td class="num">{R['senales']}</td></tr>
<tr><td>Pasan / guardan / archivan</td><td class="num">{R['pasan']} / {R['guardan']} / {R['archivan']}</td></tr>
<tr><td>Dentro de la ventana de 180 dias</td><td class="num">{R['en_ventana_de_180_dias']}</td></tr>
<tr><td>Son obra nueva (emiten dos puertas)</td><td class="num">{R['obra_nueva']}</td></tr>
<tr><td><b>Con la puerta del EPC abierta hoy</b></td><td class="num"><b>{R['puerta_epc_abierta']}</b></td></tr>
<tr><td>…y de esas, con el EPC <b>ya identificado</b></td><td class="num">{R['puerta_epc_con_interlocutor_identificado']}</td></tr>
<tr><td>Con la puerta del EPC <b>por averiguar</b> (la nota no alcanza)</td><td class="num">{R['puerta_epc_por_averiguar']}</td></tr>
<tr><td><b>Con la puerta del usuario abierta hoy</b></td><td class="num"><b>{R['puerta_usuario_abierta']}</b></td></tr>
<tr><td>Equipo dentro de planta que ya opera (una sola puerta)</td><td class="num">{R['puerta_usuario_directo']}</td></tr>
<tr><td>Consultas gastadas</td><td class="num">{C['consultas_gastadas']} de {C['presupuesto_de_consultas']}</td></tr>
</table></div>
<p style="margin:10px 0 0"><b>{R['puerta_epc_abierta']} puertas de EPC abiertas y
{R['puerta_epc_con_interlocutor_identificado']} con el constructor ya identificado.</b>
{_LOS_IDENTIFICADOS} La pregunta «quien construye la planta de X» no se publica en
ninguna parte: se pregunta en el municipio, en el parque o en la obra. Es el trabajo
que esta lista deja servido y no resuelto.</p>
</div>

{cuerpo}

<div class="nota">
<b>Lo que falta que decidas, y el radar no decide solo.</b>
{_CARTA_DE_DUDAS and '<ul style="margin:8px 0 8px 18px;padding:0">' + _CARTA_DE_DUDAS + '</ul>' or ''}
Son obra: se construye algo. Pero quien construye una ampliacion o una subestacion
no siempre es un EPC llave en mano -- a veces lo contrata el usuario mismo, y en el
caso de CFE sale a licitacion publica, que es otra puerta con otras reglas--. Si
dices que si, el radar les abre su puerta A y la busqueda del constructor entra; si
dices que no, se quedan como estan. No se resolvio solo porque equivocarse aqui es
mandar a alguien a buscar a un interlocutor que no existe.</div>

<div class="card">
<h2>Como se lee el puntaje de la senal</h2>
<p style="margin:0 0 8px">Seis casillas y un total. <b>Pasa</b> en 60,
<b>guarda</b> en 40. Topes: proceso 25, tipo de obra 15 -- una obra nueva completa
puede pasarse porque compra una de cada cosa--, tamano 10, frescura 25, fuerza de la
fuente 25, padron 8.</p>
<p style="margin:0"><b>El tamano castiga por arriba.</b> Una obra de mas de 500
millones de dolares es un programa corporativo que se reparte en anios y en varias
plantas, con contratistas de otro tamano. Por eso ZC Rubber -- 590 MDD-- puntua
menos que Waelzholz -- 65 MDD--: no es que sea peor, es que no es del tamano que FTS
toma completo.</p>
</div>

<div class="foot">Generado por prospector {version()} desde la corrida del
{HOY.isoformat()} · {C['consultas_gastadas']} consultas · {R['senales']} senales ·
{R['pasan']} pasan<br>
Sin datos personales: empresas, plantas, senales, ligas y puntajes.</div>
</div>
</body>
</html>
"""
ruta = os.path.join(SALIDA, "cuentas-con-puertas.html")
with open(ruta, "w", encoding="utf-8") as f:
    f.write(doc)
print(ruta)
print(len(doc.encode()), "bytes")
print("sha256", hashlib.sha256(doc.encode()).hexdigest())
