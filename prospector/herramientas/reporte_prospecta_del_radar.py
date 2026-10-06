"""Las seis cuentas de puerta de usuario, con lo que la corrida les corrigio (#382 D4).

SE GENERA del archivo de la corrida, igual que los reportes del radar: el papel sale
del dato. Sin nombres de personas -- ninguna de las seis entrego un interlocutor de
valor confirmado, y el cero es el dato--.
"""
import hashlib
import html as H
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from flujo.sello import version                                    # noqa: E402

CORRIDA = os.path.join(RAIZ, "datos",
                       "prospecta-2026-10-06-seis-puertas-de-usuario.json")
SALIDA = os.environ.get("SALIDA_RADAR", "/tmp/")
C = json.load(open(CORRIDA, encoding="utf-8"))
L = C["la_lectura"]

COLOR = {"CONFIRMADO": "ok", "AFINADO": "warn", "CORREGIDO": "hot"}
CSS = """
:root{--paper:#f6f5f2;--ink:#1d2120;--muted:#6b7270;--line:#e0dfda;--card:#fff;
 --ink2:#8a5a2b;--soft:#f3ece2;--hot:#a8321f;--hot-bg:#fbeae6;
 --warn:#9a6a00;--warn-bg:#fbf4e4;--ok:#1d6b4a;--ok-bg:#e7f3ed}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
 --paper:#151714;--ink:#eceae4;--muted:#9a9f9c;--line:#2d3129;--card:#1c1f1b;
 --ink2:#d7a567;--soft:#2a241c;--hot:#f0907c;--hot-bg:#2d1512;
 --warn:#dba944;--warn-bg:#2b2412;--ok:#5cc694;--ok-bg:#11271d}}
:root[data-theme="dark"]{--paper:#151714;--ink:#eceae4;--muted:#9a9f9c;
 --line:#2d3129;--card:#1c1f1b;--ink2:#d7a567;--soft:#2a241c;--hot:#f0907c;
 --hot-bg:#2d1512;--warn:#dba944;--warn-bg:#2b2412;--ok:#5cc694;--ok-bg:#11271d}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-size:16px;
 line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:860px;margin:0 auto;padding-block:28px 64px;
 padding-left:18px;padding-right:18px}
.kicker{font-size:12px;letter-spacing:.1em;text-transform:uppercase;
 color:var(--ink2);font-weight:700}
h1{margin:6px 0 6px;font-size:30px;font-weight:800;letter-spacing:-.02em;
 line-height:1.15;text-wrap:balance}
h2{font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;
 color:var(--ink2);font-weight:700;margin:0 0 10px}
.sub{color:var(--muted);font-size:15px;margin:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;
 padding:18px 20px;margin:16px 0}
.nota{background:var(--warn-bg);border:1px solid var(--warn);border-radius:10px;
 padding:12px 14px;margin:12px 0;font-size:14.5px}
.ok{background:var(--ok-bg);border:1px solid var(--ok);border-radius:10px;
 padding:12px 14px;margin:12px 0;font-size:14.5px}
.pill{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.05em;
 text-transform:uppercase;padding:3px 9px;border-radius:999px}
.p-ok{background:var(--ok-bg);color:var(--ok);border:1px solid var(--ok)}
.p-warn{background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn)}
.p-hot{background:var(--hot-bg);color:var(--hot);border:1px solid var(--hot)}
.cuenta{border-left:4px solid var(--line);padding-left:16px;margin:26px 0}
.cuenta.hot{border-left-color:var(--hot)}
.cuenta.warn{border-left-color:var(--warn)}
.cuenta.ok{border-left-color:var(--ok)}
.cuenta h3{margin:0 0 2px;font-size:20px;font-weight:800}
.meta{color:var(--muted);font-size:13.5px;margin:0 0 10px;
 font-variant-numeric:tabular-nums}
.rotulo{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;
 color:var(--muted);font-weight:700;margin:12px 0 2px}
table{width:100%;border-collapse:collapse;font-size:14.5px}
td,th{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;
 vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.num{text-align:right;font-variant-numeric:tabular-nums}
code{font-family:ui-monospace,Menlo,monospace;font-size:13.5px;
 background:var(--soft);padding:1px 5px;border-radius:4px}
ul{margin:4px 0 0 18px;padding:0}
.foot{color:var(--muted);font-size:12.5px;text-align:center;margin-top:30px;
 line-height:1.6}
@media (max-width:520px){h1{font-size:24px}}
@media print{body{background:#fff}.wrap{padding:0;max-width:none}
 .card,.cuenta{page-break-inside:avoid}}
"""


def e(x):
    return H.escape(str(x if x is not None else ""))


def cuenta(c, i):
    cls = COLOR[c["el_angulo_del_radar"]]
    partes = [
        f'<div class="cuenta {cls}">',
        f'<h3>{i}. {e(c["empresa"])}</h3>',
        f'<p class="meta">{e(c["planta"])} · puntaje {c["puntaje"]} · '
        f'{c["meses_desde_la_inauguracion"]} meses de inaugurada · '
        f'{c["consultas_gastadas"]} consulta(s) · giro: {e(c["giro"])}</p>',
        f'<span class="pill p-{cls}">el angulo: {e(c["el_angulo_del_radar"])}</span>',
    ]
    if c["familia_que_choca"]:
        partes.append(
            f'<div class="nota"><b>Choque de familia:</b> '
            f'<code>{e(c["familia_que_choca"])}</code> no es venta aqui. '
            f'Es lo que esta casa fabrica o vende.</div>')
    partes.append(f'<div class="rotulo">lo que la corrida encontro</div>'
                  f'<p style="margin:0">{e(c["lo_que_la_corrida_encontro"])}</p>')
    if c["vocabulario_de_la_casa"]:
        partes.append('<div class="rotulo">como le llaman ahi al puesto que compra</div>'
                      '<ul>' + "".join(f'<li><code>{e(v)}</code></li>'
                                       for v in c["vocabulario_de_la_casa"]) + '</ul>')
    if c["patron_de_correo"]:
        partes.append(f'<div class="rotulo">patron de correo</div>'
                      f'<p style="margin:0"><code>{e(c["patron_de_correo"])}</code> — '
                      f'{e(c["patron_de_correo_nota"])}</p>')
    elif c["patron_de_correo_nota"]:
        partes.append(f'<div class="rotulo">patron de correo</div>'
                      f'<p style="margin:0">{e(c["patron_de_correo_nota"])}</p>')
    if c["anclas"]:
        partes.append(f'<div class="rotulo">anclas</div>'
                      f'<p style="margin:0">{e(c["anclas"])}</p>')
    partes.append(
        f'<div class="rotulo">interlocutores de valor con nombre y correo</div>'
        f'<p style="margin:0"><b>{c["interlocutores_de_valor_con_nombre_y_correo"]}</b>'
        f' — y el por que esta en la lectura, al final.</p>')
    partes.append('</div>')
    return "".join(partes)


doc = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Las seis de puerta de usuario — {C['hoy']}</title>
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
<div class="kicker">Motor 2 · prospecta con angulo del radar</div>
<h1>Las seis de puerta de usuario, y lo que la corrida le corrigio al radar</h1>
<p class="sub">Corrida del {C['hoy']}, en orden de madurez de la puerta.
{L['consultas_gastadas']} consultas. El angulo sembrado fue el mismo para las seis:
«lo que falta despues del arranque: segunda linea, ampliacion de carga,
automatizacion de lo que el EPC dejo manual».</p>

<div class="nota"><b>Lo primero, porque cambia a quien se le llama.</b>
De las seis, el angulo se <b>confirmo en {L['el_angulo_sembrado_se_confirmo_en']}</b>,
se afino en {L['el_angulo_sembrado_se_afino_en']} y se
<b>corrigio en {L['el_angulo_sembrado_se_corrigio_en']}</b>. Las tres correcciones son
el mismo defecto: <b>la familia que el radar propone es el producto de la casa</b>.
Daikin fabrica chillers, TDI fabrica enfriadores y radiadores, y QSMX vende estructura
y servicio de planta — lo mismo que FTS. El radar las puntuo alto por el empate de
giro, y ese mismo empate es el que las descalifica en esa familia.</div>

<div class="card">
<h2>La vuelta interna, antes de gastar una consulta</h2>
<table>
<tr><th>Fuente</th><th>Que dijo</th></tr>
<tr><td>Odoo</td><td>{e(C['lo_que_la_vuelta_interna_dijo_de_las_seis']['odoo'])}</td></tr>
<tr><td>Buzon</td><td>{e(C['lo_que_la_vuelta_interna_dijo_de_las_seis']['buzon'])}</td></tr>
</table>
<p style="margin:12px 0 0">{e(C['lo_que_la_vuelta_interna_dijo_de_las_seis']['lo_que_eso_significa'])}</p>
</div>

{"".join(cuenta(c, i) for i, c in enumerate(C['cuentas'], start=1))}

<div class="card">
<h2>La lectura</h2>
<table>
<tr><td>Consultas gastadas</td><td class="num">{L['consultas_gastadas']}</td></tr>
<tr><td><b>Interlocutores de valor con nombre y correo</b></td><td class="num"><b>{L['interlocutores_de_valor_con_nombre_y_correo']}</b></td></tr>
<tr><td>Angulo confirmado / afinado / corregido</td><td class="num">{L['el_angulo_sembrado_se_confirmo_en']} / {L['el_angulo_sembrado_se_afino_en']} / {L['el_angulo_sembrado_se_corrigio_en']}</td></tr>
</table>
<div class="rotulo">por que cero</div>
<p style="margin:0">{e(L['por_que_cero'])}</p>
<div class="rotulo">lo que si entrego</div>
<p style="margin:0">{e(L['lo_que_si_entrego'])}</p>
<div class="nota"><b>El defecto que destapo.</b> {e(L['el_defecto_que_destapo'])}</div>
<div class="rotulo">lo que no se termino, dicho tal cual</div>
<p style="margin:0">{e(L['lo_que_NO_se_termino'])}</p>
</div>

<div class="foot">Generado por prospector {version()} desde
{os.path.basename(CORRIDA)} · {len(C['cuentas'])} cuentas ·
{L['consultas_gastadas']} consultas<br>
{e(C['sin_datos_personales'])}</div>
</div>
</body>
</html>
"""

if __name__ == "__main__":
    os.makedirs(SALIDA, exist_ok=True)
    ruta = os.path.join(SALIDA, "seis-puertas-de-usuario.html")
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(doc)
    b = doc.encode("utf-8")
    print(ruta)
    print(f"{len(b)} bytes")
    print("sha256", hashlib.sha256(b).hexdigest())
