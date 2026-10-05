"""La lista de la primera corrida de descubrimiento, para que Esteban se la pase a Rissia.

SE GENERA, no se escribe a mano: el puntaje, el veredicto y el desglose salen de
`evaluadas.json`, que salio del evaluador real. Un papel con numeros transcritos se
separa del codigo en la primera correccion.

SIN DATOS PERSONALES. Empresas, plantas, senales y ligas. Ni un nombre, ni un
correo, ni un telefono: esta lista viaja por OneDrive.
"""
import hashlib, html as H, json, sys
from datetime import date

import os
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORRIDA = os.path.join(RAIZ, "datos", "radar-2026-10-05-descubrimiento.json")
D = os.environ.get("SALIDA_RADAR", "/tmp/")
_c = json.load(open(CORRIDA, encoding="utf-8"))
HOY = date.fromisoformat(_c["hoy"])
ev = {(x["empresa"], x["planta"]): x for x in _c["evaluadas"]}

# Lo que el evaluador NO sabe y una persona si: que familia de FTS encaja y con que
# angulo se abre la conversacion. Va declarado como CRITERIO, no como medicion.
FICHAS = {
 ("NIFCO", "Chihuahua, Chih."): dict(
   familias="Eléctrico · Automatización · Térmico",
   por_que_encaja="La nota enumera «inyección de plástico, ensambles automatizados, manejo de material, almacenes, oficinas y <b>sistemas auxiliares de apoyo a la producción</b>». Esa última frase es el pliego: los sistemas auxiliares de una planta de inyección son agua de enfriamiento, aire comprimido y tablero — las tres cosas que FTS instala—.",
   angulo="Planta de inyección recién arrancada: el enfriamiento de molde y el aire comprimido son lo primero que se queda corto cuando la línea sube de ritmo."),
 ("QSMX", "Ramos Arizpe, Coah."): dict(
   familias="Estructura · Eléctrico",
   por_que_encaja="Fabrica componentes y <b>estructuras metálicas</b> y acaba de ampliar instalaciones. Es la misma industria de los 15 proyectos de metalmecánica del catálogo de FTS, que produjeron tablero, electroducto y transformador.",
   angulo="Instalaciones nuevas en Ramos Arizpe: la acometida y el tablero de una nave que crece casi nunca se dimensionan para la segunda etapa."),
 ("Ecocab MX", "Gomez Palacio, Dgo."): dict(
   familias="Eléctrico · Estructura · Automatización",
   por_que_encaja="Nave de 14,000 m² que <b>empezó a construirse el 23 de julio</b> y arranca operación en enero de 2027. Todo lo eléctrico de esa nave está por contratarse. Y su proceso es cable de cobre y arneses: el catálogo de FTS ya tiene 3 proyectos de ese proceso.",
   angulo="Obra en curso con fecha de arranque comprometida: enero de 2027 es mañana para una instalación eléctrica de nave completa."),
 ("NIFCO", "Apodaca, N.L."): dict(
   familias="Eléctrico · Automatización · Térmico",
   por_que_encaja="Segunda planta del mismo grupo, 85 MDD, en el Parque Mirador Industrial, con primera piedra ya colocada. La misma conversación técnica que la de Chihuahua, en Nuevo León.",
   angulo="Dos plantas del mismo grupo en obra al mismo tiempo, una aquí y una en Chihuahua: conviene entrar por la que esté más cerca y cruzar la referencia."),
 ("Pegatron", "Ciudad Juarez, Chih."): dict(
   familias="Eléctrico · Automatización",
   por_que_encaja="330 MDD en una nave nueva para componentes de electromovilidad y <b>tecnología para centros de datos</b>. Un centro de datos es carga eléctrica crítica: respaldo, subestación y distribución. Es el corazón de la familia más grande de FTS.",
   angulo="Carga crítica: una planta que fabrica para data centers entiende, mejor que nadie, por qué la continuidad eléctrica se diseña y no se improvisa."),
 ("Waelzholz", "Ramos Arizpe, Coah."): dict(
   familias="Térmico · Eléctrico",
   por_que_encaja="<b>Primera</b> planta en México, obra arrancada el 11 de agosto, 65 MDD. Acero laminado en frío lleva hornos de recocido y líneas de tratamiento térmico; la laminación lleva media tensión. Y 65 MDD es la banda que Esteban declaró como «exactamente lo que FTS sí toma».",
   angulo="Primera planta en el país: no hay proveedor local heredado para nada. Hay que llegar antes de que el contratista general cierre su lista."),
 ("Inventec", "Ciudad Juarez, Chih."): dict(
   familias="Automatización · Eléctrico",
   por_que_encaja="Primera piedra el 31 de julio: 43,000 m² nuevos y <b>45 líneas de producción</b> por instalar. Cuarenta y cinco líneas es trabajo de integración de control y de distribución eléctrica, repetido cuarenta y cinco veces.",
   angulo="45 líneas nuevas en un campus que ya opera: la obra tiene que convivir con producción, y eso es exactamente lo que un integrador con oficio cobra."),
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
.wrap{max-width:860px;margin:0 auto;padding-block:26px 64px;
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
.nota{background:var(--warn-bg);border:1px solid var(--warn);border-radius:10px;
 padding:11px 14px;margin:12px 0;font-size:15px}
.ok{background:var(--ok-bg);border:1px solid var(--ok);border-radius:12px;
 padding:12px 16px;margin:14px 0}
table{width:100%;border-collapse:collapse;font-size:14.5px;background:var(--card)}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;
 color:var(--muted);padding:8px 9px;border-bottom:1px solid var(--line)}
td{padding:9px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:none}
.tabla-scroll{overflow-x:auto}
.num{font-variant-numeric:tabular-nums;text-align:right}
code,.mono{font-family:ui-monospace,Menlo,monospace;font-size:13px;
 word-break:break-word}
.pill{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;
 text-transform:uppercase;padding:2px 8px;border-radius:999px}
.p-pasa{background:var(--ok-bg);color:var(--ok);border:1px solid var(--ok)}
.p-guarda{background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn)}
.p-archiva{background:var(--hot-bg);color:var(--hot);border:1px solid var(--hot)}
.rank{display:inline-block;width:26px;height:26px;line-height:26px;
 text-align:center;border-radius:999px;background:var(--teal);color:#fff;
 font-weight:800;font-size:14px;margin-right:8px}
a{color:var(--teal)}
ul{margin:8px 0 0;padding-left:20px} li{margin:7px 0}
.foot{color:var(--muted);font-size:12.5px;text-align:center;margin-top:24px;
 line-height:1.5}
@media (max-width:520px){h1{font-size:23px}}
@media print{body{background:#fff}.wrap{padding:0;max-width:none}
 .card{page-break-inside:avoid}}
"""

def e(s): return H.escape(str(s), quote=True)

def bloque(llave, i=None, titulo_extra=""):
    x = ev[llave]; f = FICHAS[llave]; d = x["eval"]["desglose"]
    v = x["eval"]["veredicto"]
    cab = (f'<span class="rank">{i}</span>' if i else "")
    dias = x["dias"]
    fecha_txt = (f'{x["fecha"]} · hace {dias} días' if x.get("fecha")
                 else "sin fecha documentada")
    aviso = ""
    if dias is not None and dias > 90:
        aviso = (f'<div class="nota"><b>Fuera de la ventana de 90 días '
                 f'({dias} días).</b> Se incluye marcada porque la señal es '
                 f'fuerte, no porque sea fresca.</div>')
    return f"""
<div class="card">
<h2>{e(titulo_extra) if titulo_extra else 'Cuenta ' + str(i)}</h2>
<h1 style="font-size:23px;margin:0 0 2px">{cab}{e(x['empresa'])}</h1>
<p class="sub" style="margin:0 0 10px">{e(x['planta'])} ·
<span class="pill p-{v}">{e(v)} {x['eval']['puntaje']}</span> ·
{e(fecha_txt)}</p>
<p style="margin:10px 0 4px"><b>Qué dice la señal.</b> {e(x['texto'][:400])}</p>
<p style="margin:6px 0"><b>Fuente.</b> <a href="{e(x['liga'])}">{e(x['liga'].split('/')[2])} — abrir la nota</a><br>
<span class="sub">Fecha, de dónde sale: {e(x['procedencia_fecha'])}</span></p>
{aviso}
<p style="margin:10px 0 4px"><b>Qué familia de FTS encaja:</b> {f['familias']}</p>
<p style="margin:4px 0">{f['por_que_encaja']}</p>
<div class="ok"><b>Ángulo para el primer contacto.</b> {e(f['angulo'])}</div>
<div class="tabla-scroll"><table>
<tr><th>Proceso</th><th>Tipo de obra</th><th>Tamaño</th><th>Frescura</th>
<th>Fuente</th><th>Padrón</th><th>Total</th></tr>
<tr><td class="num">{d['proceso']}</td><td class="num">{d['tipo_de_obra']}</td>
<td class="num">{d['capacidad']}</td><td class="num">{d['frescura']}</td>
<td class="num">{d['fuerza_de_fuente']}</td><td class="num">{d['padron']}</td>
<td class="num"><b>{x['eval']['puntaje']}</b></td></tr>
</table></div>
</div>"""

CINCO = [("NIFCO","Chihuahua, Chih."), ("QSMX","Ramos Arizpe, Coah."),
         ("Ecocab MX","Gomez Palacio, Dgo."), ("NIFCO","Apodaca, N.L."),
         ("Pegatron","Ciudad Juarez, Chih.")]
DOS = [("Waelzholz","Ramos Arizpe, Coah."), ("Inventec","Ciudad Juarez, Chih.")]

cuerpo = "".join(bloque(k, i) for i, k in enumerate(CINCO, start=1))
cuerpo += ('<h1 style="font-size:22px;margin:30px 0 4px">Y dos que el evaluador '
           'dejó fuera</h1>\n<p class="sub" style="margin:0 0 6px">No las puso '
           'abajo por el negocio: las puso abajo por una palabra que le falta al '
           'vocabulario. Las dos dicen «arranca la construcción» y «primera '
           'piedra», y el radar no conoce esas frases en castellano — sí conoce '
           '«groundbreaking» en inglés—. Las dos tienen el tamaño de obra correcto '
           '(10 de 10 en esa casilla). Esteban decide si entran.</p>\n')
cuerpo += "".join(bloque(k, None, "Rescatada a mano") for k in DOS)

doc = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cinco cuentas nuevas del noreste — radar, {HOY.isoformat()}</title>
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
<div class="kicker">Motor 1 · radar en modo descubrimiento</div>
<h1>Cinco cuentas nuevas del noreste</h1>
<p class="sub">Primera corrida del radar buscando en vez de puntuar lo que se le
da. {HOY.isoformat()}. Son cuentas con las que <b>FTS no tiene nada hoy</b>: ni
cliente, ni oportunidad en el CRM, ni un hilo en el correo.</p>

<div class="ok"><b>Qué es esta lista y qué no es.</b> Son empresas con obra o
inversión anunciada en los últimos 90 días, puntuadas por la herramienta. <b>No
hay nombres de personas aquí</b> — eso es el paso siguiente, y lo hace la
herramienta de prospección cuando Esteban apruebe la lista—. Lo que sí hay es la
señal, su fecha con procedencia, su liga, y por qué cada una encaja con lo que
vende FTS.</p></div>

<div class="nota"><b>Antes de buscar a nadie: la geografía.</b> De las cinco, sólo
una está en Nuevo León y una en Coahuila; tres son del segundo anillo (Chihuahua y
Durango). <b>Tamaulipas salió vacío</b> en 38 consultas. Eso no significa que no
haya nada ahí: significa que la prensa que el radar alcanza no lo publica.</div>

{cuerpo}

<div class="card">
<h2>Cómo se lee el puntaje</h2>
<p style="margin:0 0 8px">Seis casillas y un total. <b>Pasa</b> en 60,
<b>guarda</b> en 40. El tope de cada casilla: proceso 25, tipo de obra 15 — una
obra nueva completa puede pasarse del tope porque compra una de cada cosa—, tamaño
10, frescura 25, fuerza de la fuente 25, padrón 8.</p>
<p style="margin:0"><b>Que ninguna empate el padrón no las castiga.</b> El padrón
es una foto de mayo y una planta que se está construyendo no existe ahí todavía.
Suma cuando empata y no resta cuando no.</p>
</div>

<div class="foot">Generado por prospector 0.19.0 desde la corrida del
{HOY.isoformat()} · 38 consultas · 14 señales · 9 pasan<br>
Sin datos personales: empresas, plantas, señales y ligas.</div>
</div>
</body>
</html>
"""
ruta = D + "cinco-cuentas-nuevas-noreste.html"
open(ruta, "w", encoding="utf-8").write(doc)
print(ruta)
print(len(doc.encode()), "bytes")
print("sha256", hashlib.sha256(doc.encode()).hexdigest())
