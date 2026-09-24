"""Genera la ficha en sus dos modos. No imprime lo que no debe.

Reglas que este modulo hace cumplir y que la plantilla sola no puede:
 - un contacto marcado `revision_humana` NO se imprime en el modo limpio;
 - un contacto que YA NO ESTA en la casa tampoco;
 - un dato EN_CONFLICTO no muestra valor: muestra los dos que chocan;
 - cada senal va con LA FECHA que su texto trae, o marcada sin fecha;
 - el checklist de validaciones dice lo que NO se pudo hacer, en vez de callarlo;
 - los tres textos de criterio -- gancho, por que ahora, como hablarles-- que el
   codigo no puede derivar salen como HUECO DECLARADO cuando faltan, no en
   blanco: una ficha que parece completa y no lo esta es peor que una con avisos.

Los dos modos escriben un documento .html AUTOCONTENIDO -- doctype, `<html>` y
`<meta charset>`--. Hasta la v0.9.0 devolvian un fragmento con extension .html y
los acentos se rompian en cuanto el archivo salia del navegador que lo genero.
Lo destapo la primera corrida real de un operador (Coficab, #268).
"""
from __future__ import annotations
import html
import re

from .confianza import CONFIRMADO, EN_CONFLICTO, SOLIDO, CANDIDATO, N1_CONFIRMADO, N2_PARCIAL, N3_PUESTO
from .estado import Corrida, RESPONDIO, PENDIENTE

CHIP = {CONFIRMADO: "CONF", SOLIDO: "SOL", CANDIDATO: "CAND", EN_CONFLICTO: "CONFLICTO"}
NIVEL_FICHA = {N1_CONFIRMADO: "N1", N2_PARCIAL: "N2", N3_PUESTO: "N3"}


def checklist_validaciones(c: Corrida) -> list[dict]:
    """Lo que NO se pudo hacer, declarado. Una corrida con limites de entorno
    entrega ficha con huecos marcados; no falla."""
    filas = []
    for clave, _t, modulos in __import__("flujo.estado", fromlist=["OLAS"]).OLAS:
        for m in modulos:
            cob = c.cobertura.get(m, {"estado": PENDIENTE, "razon": ""})
            filas.append({"modulo": m, "estado": cob["estado"], "razon": cob["razon"],
                          "agotado": c.mod(m).agotado})
    return filas


# ------------------------------------------------------------------ utilerias
# Fecha suelta dentro de un texto de senal, en las formas que la corrida escribe:
# "ene-2026", "9-oct-2025", "2026-09-24", "agosto de 2022", "mar-2025".
_MESES = ("ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic")
# Las formas van de la MAS precisa a la MENOS: el regex alterna, y si la parcial
# fuera primero se comeria el ano de una fecha completa.
#
# B3 de #300: `AAAA-MM` y `AAAA` solos no se reconocian, asi que la senal de
# oct-2024 de Silao y la de 2018 de Juarez salian "sin fecha en el registro"
# aunque la traen escrita. Esa marca existe para que una senal vieja NO se lea
# fresca; no reconocer la fecha parcial ESCONDE la antiguedad, que es lo
# contrario de su proposito. Se acepta y se imprime tal cual: '2024-10' dice
# menos que '2024-10-15' y dice muchisimo mas que nada.
_FECHA = re.compile(
    r"(\d{4}-\d{2}-\d{2}"
    r"|\d{1,2}[ -](?:%s)[a-z]*[ -]\d{4}"
    r"|(?:%s)[a-z]*[ -]\d{4}"
    r"|(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre"
    r"|noviembre|diciembre)\s+(?:de\s+)?\d{4}"
    r"|\d{4}-(?:0[1-9]|1[0-2])"
    r"|(?<![\d./-])(?:19|20)\d{2}(?![\d./-]))" % (_MESES, _MESES), re.I)


def fecha_de(texto: str) -> str:
    """La fecha que el texto de la senal trae escrita, si trae alguna.

    No se inventa ninguna. Una senal sin fecha se marca como tal: la leccion mas
    cara de la corrida de #295 fue un programa de inversion de 2022 que, sin la
    fecha al lado, se leia como noticia fresca.
    """
    m = _FECHA.search(texto or "")
    return m.group(1) if m else ""


def _correo_visible(x) -> tuple[str, str, str]:
    """(texto, etiqueta, chip) del correo de la persona, o de su patron.

    Devuelve el correo LITERAL si lo hay; si no, el patron de la cuenta, que para
    un puesto sin persona es justo lo accionable -- etiquetado como patron y no
    como direccion, porque no lo es: es la forma, no el buzon--.
    """
    d = x.datos.get("correo")
    etiqueta = ""
    if d is None:
        d = x.datos.get("patron_correo")
        etiqueta = "patron · "
    if d is None:
        return ("", "", "")
    if d.nivel == EN_CONFLICTO:
        return (f"EN CONFLICTO — {d.motivo_conflicto}", "", "CONFLICTO")
    return (f"{etiqueta}{d.valor or ''}", d.disidencia, CHIP.get(d.nivel, "?"))


def _planta_de(x) -> str:
    """En que planta esta. El operador trabaja por planta, no por empresa."""
    for campo in ("planta", "ciudad", "entidad"):
        d = x.datos.get(campo)
        if d is not None and d.nivel != EN_CONFLICTO and d.valor:
            return str(d.valor)
        if d is not None and d.nivel == EN_CONFLICTO:
            return "en conflicto"
    return ""


def busquedas_sales_navigator(c: Corrida) -> list[str]:
    """Las busquedas que el operador pega en Sales Navigator.

    Se DERIVAN de los puestos que la corrida encontro de valor y del vocabulario
    que recogio, no se piden: el operador ya hizo el trabajo de encontrarlos y
    volver a escribirlos a mano es donde se pierde media hora y se cuelan
    errores de dedo.
    """
    puestos = []
    for x in sorted(c.contactos, key=lambda y: y.cercania_decision):
        if not x.de_valor or not x.puesto:
            continue
        p = x.puesto.split(",")[0].split("(")[0].strip()
        if p and p not in puestos:
            puestos.append(p)
    salidas = []
    if puestos:
        titulos = " OR ".join(f'"{p}"' for p in puestos[:8])
        salidas.append(f'Empresa "{c.empresa}" · Cargo actual: {titulos}')
        if c.ciudad:
            salidas.append(f'Empresa "{c.empresa}" · Geografia "{c.ciudad}" · '
                           f'Cargo actual: {titulos}')
    # El vocabulario de la casa rinde donde el titulo genérico no: es lo que la
    # cuenta se llama a si misma.
    voc = [v for v in c.vocabulario if len(v) > 3][:6]
    if voc:
        salidas.append(f'Empresa "{c.empresa}" · Palabras clave: '
                       + " OR ".join(f'"{v}"' for v in voc))
    if not salidas:
        salidas.append("(sin puestos de valor ni vocabulario registrados: no hay "
                       "busqueda que derivar todavia)")
    return salidas


def _hueco(que: str, como: str) -> str:
    return (f'<p class="hueco"><b>Sin {html.escape(que)}.</b> '
            f'{html.escape(como)}</p>')


def modo_limpio(c: Corrida) -> str:
    """La ficha que el operador manda. Documento .html AUTOCONTENIDO.

    Hasta la v0.9.0 esto devolvia un FRAGMENTO -- sin doctype, sin `<html>` y sin
    `<meta charset>`-- que se escribia con extension .html. La primera corrida
    real de un operador (Coficab, #268) lo destapo: el archivo existe, pero sin
    charset declarado los acentos se rompen en cuanto sale del navegador que lo
    genero -- adjunto de correo, lognote de Odoo, vista previa--. Y le faltaban
    la mitad de las secciones que el operador necesita para mandarla.
    """
    est = c.completitud()
    visibles = [x for x in c.contactos if not x.revision_humana and x.sigue_en_la_casa]
    visibles.sort(key=lambda x: (x.cercania_decision, x.nombre or "zzz"))
    ocultos = len(c.contactos) - len(visibles)

    # --- a quien buscar
    filas = []
    for x in visibles:
        correo, salvedad, chip = _correo_visible(x)
        linea_correo = (f'<div class="mail">{html.escape(correo)} '
                        f'<i>{chip}</i></div>' if correo else
                        '<div class="mail vacio">sin correo ni patron</div>')
        if salvedad:
            linea_correo += (f'<div class="dis">con salvedad — '
                             f'{html.escape(salvedad)}</div>')
        planta = _planta_de(x)
        filas.append(
            f'<tr><td class="lv">{NIVEL_FICHA.get(x.nivel_ficha,"N2")}</td>'
            f'<td><b>{html.escape(x.nombre or "(puesto sin persona)")}</b></td>'
            f'<td>{html.escape(x.puesto or "")}</td>'
            f'<td>{html.escape(planta) or "<i>n/d</i>"}</td>'
            f'<td>{linea_correo}</td>'
            f'<td class="c">{"si" if x.de_valor else "no"}</td></tr>')

    # --- senal, con su fecha al lado
    sen = []
    for t in c.senal:
        f = fecha_de(t)
        marca = (f'<span class="fecha">{html.escape(f)}</span>' if f
                 else '<span class="sinfecha">sin fecha en el registro</span>')
        sen.append(f"<li>{marca} {html.escape(t)}</li>")
    bloque_senal = ("".join(sen) if sen else
                    "<li>sin senal registrada</li>")

    # --- conflictos y salvedades, arriba y visibles
    conflictos, salvedades = [], []
    for x in c.contactos:
        quien = html.escape(x.nombre or x.puesto or "?")
        for campo, d in x.datos.items():
            if d.informa_pese_al_conflicto:
                salvedades.append(
                    f'<li><b>{html.escape(campo)}</b> de {quien}: '
                    f'<code>{html.escape(str(d.valor))}</code> — '
                    f'{html.escape(d.disidencia)}</li>')
            elif d.nivel == EN_CONFLICTO:
                conflictos.append(
                    f'<li><b>{html.escape(campo)}</b> de {quien}: '
                    f'{html.escape(d.motivo_conflicto)}'
                    f' — <i>no se elige en silencio, va a revision humana</i></li>')
    bloque_conf = (f'<h2>En conflicto — {len(conflictos)}</h2>'
                   f'<ul class="cf">{"".join(conflictos)}</ul>') if conflictos else ""
    bloque_salv = (f'<h2>Con salvedad — {len(salvedades)}</h2>'
                   f'<ul class="sv">{"".join(salvedades)}</ul>') if salvedades else ""

    # --- fuentes: via, consulta, fecha y liga
    fuentes = []
    for b in c.busquedas():
        # La liga se imprime MARCADA COMO NO COMPROBADA. Se verifico su FORMA al
        # registrarla -- una URL absoluta, sin espacios ni colas pegadas-- pero
        # NADIE la abrio: WebFetch esta bloqueado por egress en este entorno.
        #
        # Esteban reporto una liga rota en la ficha de Durango. El arreglo no es
        # prometer que abre -- no se puede desde aqui-- sino dejar de imprimirla
        # como si estuviera comprobada. Quien reciba la ficha ve el dominio y
        # sabe que la forma se reviso y el contenido no.
        if b.liga:
            dominio = b.liga.split("//", 1)[-1].split("/", 1)[0][:38]
            liga = (f'<a href="{html.escape(b.liga, quote=True)}" '
                    f'title="forma verificada, contenido NO comprobado: '
                    f'WebFetch bloqueado por egress">'
                    f'{html.escape(dominio)}</a>'
                    f'<span class="nc" title="no comprobada">?</span>')
        else:
            liga = '<i>sin liga</i>'
        fuentes.append(
            f'<tr><td>{html.escape(b.modulo)}</td>'
            f'<td>{html.escape(b.etiqueta or b.fuente)}</td>'
            f'<td class="q">{html.escape(b.consulta)}</td>'
            f'<td class="c">{b.resultados}</td>'
            f'<td class="c">{html.escape(b.ts[:10])}</td>'
            f'<td class="c">{liga}</td></tr>')

    # --- checklist de validaciones
    val = "".join(
        f'<tr><td>{f["modulo"]}</td><td class="e-{f["estado"]}">{f["estado"]}</td>'
        f'<td>{html.escape(f["razon"]) or "—"}</td>'
        f'<td class="c">{"si" if f["agotado"] else "no"}</td></tr>'
        for f in checklist_validaciones(c))

    nav = "".join(f"<li><code>{html.escape(q)}</code></li>"
                  for q in busquedas_sales_navigator(c))
    hablar = ("".join(f"<li>{html.escape(t)}</li>" for t in c.como_hablarles)
              if c.como_hablarles else "")
    avisos = ("".join(f"<li>{html.escape(a)}</li>" for a in c.avisos
                      if not a.startswith("[challenge]")))

    # El estado editado a mano se DECLARA arriba, antes del gancho. No bloquea la
    # ficha -- dentro hay trabajo real y negarse a emitirla lo perderia-- pero no
    # puede salir sin decirlo: quien la reciba tiene derecho a saber que una
    # parte del estado no la escribio la herramienta.
    aviso_edicion = ('<div class="editada"><b>ESTADO EDITADO A MANO.</b> La firma '
                     'del archivo de esta corrida no coincide con su contenido: '
                     'alguien escribio el JSON por fuera de la herramienta. Los '
                     'datos de abajo pueden no venir de una busqueda registrada. '
                     'Vale la pena revisar contra las fuentes antes de mandarla.'
                     '</div>') if c.editada_a_mano else ""

    # Los tres bloques de criterio, ya resueltos: o el texto del operador, o el
    # hueco declarado con el comando exacto que lo llena.
    CARGA = "registrar --datos '{\"%s\": %s}'"
    bl_gancho = (f'<div class="gancho">{html.escape(c.gancho)}</div>'
                 if c.gancho else _hueco(
                     "gancho escrito",
                     "Lo escribe el operador: es criterio, no dato. Se carga con "
                     + CARGA % ("gancho", '"..."')))
    bl_porque = (f'<div class="gancho">{html.escape(c.por_que_ahora)}</div>'
                 if c.por_que_ahora else _hueco(
                     "razon de oportunidad escrita",
                     "La senal de arriba es la materia prima; esto es la lectura. "
                     "Se carga con " + CARGA % ("por_que_ahora", '"..."')))
    bl_hablar = (f"<ul>{hablar}</ul>" if hablar else _hueco(
        "guion escrito",
        "El vocabulario y los indicadores que la corrida recogio son la materia "
        "prima. Se carga con " + CARGA % ("como_hablarles", '["...", "..."]')))

    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(c.empresa)} — ficha de contactos</title>
<style>
 :root{{--tinta:#25303a;--suave:#67717d;--azul:#1f4b6e;--linea:#e4e8ed;
        --ambar:#a4560a;--oro:#c9a227;--fondo:#fff}}
 *{{box-sizing:border-box}}
 body{{font:15px/1.55 -apple-system,system-ui,"Segoe UI",sans-serif;
       max-width:900px;margin:0 auto;padding:28px 16px;
       color:var(--tinta);background:var(--fondo)}}
 h1{{font-size:1.75rem;margin:0}}
 h2{{font-size:1.05rem;margin:30px 0 8px;padding-bottom:4px;
     border-bottom:2px solid var(--linea);text-transform:uppercase;
     letter-spacing:.04em;color:var(--azul)}}
 .meta{{color:var(--suave);font-size:.86rem;margin-top:6px}}
 .gancho{{font-size:1.06rem;background:#f6f8fa;border-left:3px solid var(--azul);
          padding:12px 14px;margin:18px 0}}
 table{{width:100%;border-collapse:collapse;font-size:.88rem;margin-top:6px}}
 th{{text-align:left;font-size:.74rem;text-transform:uppercase;
     letter-spacing:.04em;color:var(--suave);border-bottom:1px solid var(--linea);
     padding:6px 8px}}
 td{{padding:7px 8px;border-bottom:1px solid var(--linea);vertical-align:top}}
 td.c{{text-align:center;white-space:nowrap}}
 td.q{{font:.8rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;
       word-break:break-word}}
 td.lv{{font:600 .7rem ui-monospace,monospace;color:var(--azul);
        background:#eaf1f7;text-align:center;white-space:nowrap}}
 .mail{{font:.82rem ui-monospace,monospace;color:var(--azul)}}
 .mail i{{color:#8b95a1;font-style:normal}}
 .mail.vacio{{color:#9aa4ae;font-style:italic}}
 .dis{{font:.76rem system-ui;color:#7a6320;margin-top:2px}}
 .fecha{{display:inline-block;font:600 .74rem ui-monospace,monospace;
         background:#eaf1f7;color:var(--azul);padding:1px 6px;border-radius:3px;
         margin-right:6px}}
 .nc{{display:inline-block;font:700 .66rem ui-monospace,monospace;color:#a4560a;
      background:#fbf3e8;border-radius:50%;width:13px;height:13px;
      text-align:center;line-height:13px;margin-left:4px;vertical-align:super}}
 .sinfecha{{display:inline-block;font:600 .74rem ui-monospace,monospace;
            background:#fbf3e8;color:var(--ambar);padding:1px 6px;
            border-radius:3px;margin-right:6px}}
 ul.cf{{background:#fbf3e8;border-left:3px solid var(--ambar);
        padding:10px 12px 10px 30px;margin:0}}
 ul.sv{{background:#fdf8e6;border-left:3px solid var(--oro);
        padding:10px 12px 10px 30px;margin:0;font-size:.9rem}}
 ul.sv code{{font:.82rem ui-monospace,monospace;color:var(--azul)}}
 .editada{{background:#fdecea;border:2px solid #a4340a;color:#7a2708;
           padding:12px 14px;margin-bottom:18px;font-size:.92rem;
           border-radius:3px}}
 .hueco{{background:#fbf3e8;border-left:3px solid var(--ambar);
         padding:10px 12px;font-size:.9rem;margin:6px 0}}
 .e-sin_acceso,.e-fallo{{color:var(--ambar);font-weight:600}}
 .e-omitida_por_costo,.e-pendiente{{color:var(--suave)}}
 .nota{{background:#f6f8fa;border-left:3px solid var(--azul);padding:11px 13px;
        margin-top:14px;font-size:.88rem}}
 code{{font:.82rem ui-monospace,monospace}}
 ol,ul{{padding-left:22px}}
 li{{margin:4px 0}}
 @media print{{body{{padding:0}} h2{{page-break-after:avoid}}
               tr{{page-break-inside:avoid}}}}
</style>
</head>
<body>
{aviso_edicion}
<h1>{html.escape(c.empresa)}</h1>
<div class="meta">{html.escape(c.ciudad)} · {html.escape(c.giro)} ·
 corrida {c.creada[:10]} · {len(c.busquedas())} busquedas registradas</div>

<h2>Gancho</h2>
{bl_gancho}

<h2>Senal caliente</h2>
<ul>{bloque_senal}</ul>

<h2>Por que ahora</h2>
{bl_porque}

{bloque_conf}{bloque_salv}

<h2>A quien buscar — {len(visibles)} entradas</h2>
<table>
<tr><th>Nivel</th><th>Nombre</th><th>Puesto</th><th>Planta</th>
    <th>Correo · confianza</th><th>De valor</th></tr>
{"".join(filas) or '<tr><td colspan="6"><i>Sin contactos imprimibles.</i></td></tr>'}
</table>

<h2>Como hablarles</h2>
{bl_hablar}

<h2>Busquedas para Sales Navigator</h2>
<ul>{nav}</ul>

<h2>Fuentes — {len(c.busquedas())} busquedas, con fecha</h2>
<table>
<tr><th>Mod</th><th>Via</th><th>Consulta</th><th>Res</th><th>Fecha</th>
    <th>Liga</th></tr>
{fuentes and "".join(fuentes) or '<tr><td colspan="6"><i>Sin busquedas.</i></td></tr>'}
</table>
<p class="meta">Las ligas llevan <span class="nc">?</span> porque su FORMA se
verifico al registrarlas y su CONTENIDO no: abrirlas exige WebFetch, que esta
bloqueado por egress en este entorno. Si una no abre, el hallazgo sigue siendo
valido -- la consulta y la fecha estan-- pero la fuente hay que volver a
localizarla.</p>

<h2>Checklist de validaciones</h2>
<table>
<tr><th>Modulo</th><th>Estado</th><th>Razon</th><th>Agotado</th></tr>{val}
</table>

{f'<h2>Avisos de la corrida</h2><ul>{avisos}</ul>' if avisos else ""}

<div class="nota">
<b>Completitud estimada (Chao1):</b> {est.observados} observados ·
estimado {est.estimado:.0f} · cobertura {est.cobertura:.0%} ·
veredicto <b>{est.veredicto.upper()}</b>.<br>{html.escape(est.por_que)}
{f"<br><b>{ocultos} hallazgo(s) fuera de esta ficha</b>: en revision humana o ya no estan en la casa." if ocultos else ""}
</div>
</body>
</html>"""


def modo_procedencia(c: Corrida) -> dict:
    """Cada dato con su fuente, su n_fuentes, su nivel. Auditable.

    Y la TABLA DE RENDIMIENTO de esta corrida, calculada sola. Hasta la v0.7.1 esa
    tabla la armaba yo a mano y hacia atras, con mi juicio sobre que contacto era
    de valor -lo dije en #292-. Eso es exactamente lo que la herramienta existe
    para no tener que hacer: un numero que alguien afirma contra uno que el codigo
    deriva.
    """
    return {
        "empresa": c.empresa, "ciudad": c.ciudad,
        "chao1": c.completitud().a_dict(),
        "cobertura": c.cobertura,
        "avisos": c.avisos,
        "rendimiento_por_modulo": c.rendimiento(),
        "rendimiento_por_origen": c.rendimiento_por_origen(),
        "contactos": [x.a_dict() for x in c.contactos],
    }


def modo_procedencia_html(c: Corrida) -> str:
    """El modo procedencia, legible. Documento .html autocontenido.

    El JSON sigue existiendo y es el artefacto auditable -- una maquina lo lee
    sin ambiguedad--. Pero el operador tiene que poder ABRIRLO para revisar de
    donde salio cada dato, y un JSON de doscientas lineas no se revisa: se
    hojea. Los dos se escriben, y los dos se imprimen con su ruta.
    """
    d = modo_procedencia(c)
    est = d["chao1"]

    filas = []
    for x in sorted(c.contactos, key=lambda y: y.cercania_decision):
        marcas = []
        if x.revision_humana:
            marcas.append("REVISION")
        if not x.sigue_en_la_casa:
            marcas.append("YA NO ESTA")
        cab = (f'<tr class="cab"><td rowspan="{max(1, len(x.datos))}">'
               f'<b>{html.escape(x.nombre or x.puesto or "?")}</b>'
               f'<div class="sub">{html.escape(x.puesto or "")}</div>'
               f'<div class="sub">cercania {x.cercania_decision} · '
               f'hits {x.hits} · origen {html.escape(x.modulo_origen or "-")} · '
               f'{"DE VALOR" if x.de_valor else "contexto"}'
               + (f' · <b>{" / ".join(marcas)}</b>' if marcas else "")
               + f'</div><div class="sub por">{html.escape(x.por_que_de_valor)}'
               f'</div></td>')
        if not x.datos:
            filas.append(cab + '<td colspan="4"><i>sin campos observados</i></td></tr>')
            continue
        primero = True
        for campo, dato in x.datos.items():
            obs = "<br>".join(
                f'<span class="f">{html.escape(o.fuente)}</span> '
                f'<span class="r">({html.escape(o.raiz)})</span> '
                f'{html.escape(str(o.valor))}'
                + (f' <span class="m">{o.magnitud:.4g}%</span>'
                   if o.magnitud is not None else "")
                + (f'<div class="nt">{html.escape(o.nota)}</div>' if o.nota else "")
                for o in dato.observaciones)
            celdas = (f'<td>{html.escape(campo)}</td>'
                      f'<td class="c n-{dato.nivel}">{dato.nivel.upper()}</td>'
                      f'<td class="c">{dato.n_fuentes} f · {dato.n_raices} r</td>'
                      f'<td>{obs}</td></tr>')
            filas.append((cab if primero else '<tr>') + celdas)
            primero = False

    rend = "".join(
        f'<tr><td>{f["modulo"]}</td><td class="c">{f["consultas"]}</td>'
        f'<td class="c">{f["entradas"]}</td><td class="c">{f["de_valor"]}</td>'
        f'<td class="c">{f["con_ancla"]}</td>'
        f'<td class="c">{"-" if f["valor_por_consulta"] is None else f["valor_por_consulta"]}</td>'
        f'<td>{f["cobertura"]}</td></tr>'
        for f in d["rendimiento_por_modulo"]
        if f["consultas"] or f["entradas"])
    origen = "".join(
        f'<tr><td>{html.escape(k)}</td><td class="c">{a["consultas"]}</td>'
        f'<td class="c">{a["entradas"]}</td><td class="c">{a["de_valor"]}</td>'
        f'<td class="c">{"-" if a["pct_del_valor"] is None else str(a["pct_del_valor"]) + "%"}</td></tr>'
        for k, a in sorted(d["rendimiento_por_origen"].items(),
                           key=lambda kv: -kv[1]["de_valor"]))
    avisos = "".join(f"<li>{html.escape(a)}</li>" for a in d["avisos"])

    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(c.empresa)} — procedencia</title>
<style>
 body{{font:14px/1.5 -apple-system,system-ui,sans-serif;max-width:1100px;
       margin:0 auto;padding:26px 16px;color:#25303a;background:#fff}}
 h1{{font-size:1.5rem;margin:0}} h2{{font-size:1rem;margin:28px 0 8px;
      border-bottom:2px solid #e4e8ed;padding-bottom:4px;color:#1f4b6e;
      text-transform:uppercase;letter-spacing:.04em}}
 .meta{{color:#67717d;font-size:.85rem;margin-top:6px}}
 table{{width:100%;border-collapse:collapse;font-size:.83rem;margin-top:6px}}
 th{{text-align:left;font-size:.72rem;text-transform:uppercase;color:#67717d;
     border-bottom:1px solid #e4e8ed;padding:5px 7px}}
 td{{padding:6px 7px;border-bottom:1px solid #eef1f4;vertical-align:top}}
 td.c{{text-align:center;white-space:nowrap}}
 tr.cab td{{border-top:2px solid #d6dce2}}
 .sub{{color:#67717d;font-size:.78rem}} .sub.por{{color:#7a6320;font-style:italic}}
 .f{{font:600 .78rem ui-monospace,monospace;color:#1f4b6e}}
 .r{{color:#8b95a1;font-size:.74rem}}
 .m{{color:#a4560a;font-size:.74rem;font-weight:600}}
 .nt{{color:#5a6570;font-size:.76rem;margin:2px 0 4px}}
 .n-confirmado{{color:#1d6b3f;font-weight:700}}
 .n-solido{{color:#1f4b6e;font-weight:600}}
 .n-candidato{{color:#7a6320}}
 .n-en_conflicto{{color:#a4560a;font-weight:700}}
 .nota{{background:#f6f8fa;border-left:3px solid #1f4b6e;padding:10px 12px;
        margin-top:14px;font-size:.87rem}}
 ul{{padding-left:20px}} li{{margin:3px 0}}
</style>
</head>
<body>
<h1>{html.escape(c.empresa)} — procedencia</h1>
<div class="meta">{html.escape(c.ciudad)} · corrida {c.creada[:10]} ·
 cada dato con su fuente, su raiz y su nivel</div>

<h2>Rendimiento por modulo</h2>
<table><tr><th>Mod</th><th>Cons</th><th>Entr</th><th>Valor</th><th>Ancla</th>
<th>Val/c</th><th>Cobertura</th></tr>{rend}</table>

<h2>Rendimiento por origen</h2>
<table><tr><th>Origen</th><th>Cons</th><th>Entr</th><th>Valor</th>
<th>% del valor</th></tr>{origen}</table>

<h2>Cada dato, con su procedencia</h2>
<table><tr><th>Contacto</th><th>Campo</th><th>Nivel</th><th>Fuentes</th>
<th>Observaciones</th></tr>{"".join(filas)}</table>

{f'<h2>Avisos</h2><ul>{avisos}</ul>' if avisos else ""}

<div class="nota"><b>Chao1:</b> {est["observados"]} observados · f1 {est["f1"]} ·
 f2 {est["f2"]} · estimado {est["estimado"]:.1f} · no vistos
 {est["no_vistos"]:.1f} · cobertura {est["cobertura_pct"]}% ·
 veredicto <b>{est["veredicto"].upper()}</b>.</div>
</body>
</html>"""


def tabla_de_rendimiento(c: Corrida) -> str:
    """La misma tabla, legible, para imprimir al cerrar la corrida."""
    L = [f"RENDIMIENTO · {c.empresa}", "",
         f"{'mod':5s} {'cons':>5} {'entr':>5} {'valor':>6} {'ancla':>6} "
         f"{'ent/c':>6} {'val/c':>6}  cobertura"]
    for f in c.rendimiento():
        if not f["consultas"] and not f["entradas"]:
            continue
        ec = "  -  " if f["ent_por_consulta"] is None else f"{f['ent_por_consulta']:>5.2f}"
        vc = "  -  " if f["valor_por_consulta"] is None else f"{f['valor_por_consulta']:>5.2f}"
        L.append(f"{f['modulo']:5s} {f['consultas']:>5} {f['entradas']:>5} "
                 f"{f['de_valor']:>6} {f['con_ancla']:>6} {ec:>6} {vc:>6}  {f['cobertura']}")
    L += ["", f"{'origen':10s} {'cons':>5} {'entr':>5} {'valor':>6} "
              f"{'% valor':>8} {'val/c':>6}"]
    for origen, a in sorted(c.rendimiento_por_origen().items(),
                            key=lambda kv: -(kv[1]["de_valor"])):
        pct = "   -  " if a["pct_del_valor"] is None else f"{a['pct_del_valor']:>6}%"
        vc = "  -  " if a["valor_por_consulta"] is None else f"{a['valor_por_consulta']:>5.2f}"
        L.append(f"{origen:10s} {a['consultas']:>5} {a['entradas']:>5} "
                 f"{a['de_valor']:>6} {pct:>8} {vc:>6}")
    return "\n".join(L)
