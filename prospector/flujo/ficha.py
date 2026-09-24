"""Genera la ficha en sus dos modos. No imprime lo que no debe.

Reglas que este modulo hace cumplir y que la plantilla sola no puede:
 - un contacto marcado `revision_humana` NO se imprime en el modo limpio;
 - un dato EN_CONFLICTO no muestra valor: muestra los dos que chocan;
 - el checklist de validaciones dice lo que NO se pudo hacer, en vez de callarlo.
"""
from __future__ import annotations
import html

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


def modo_limpio(c: Corrida) -> str:
    est = c.completitud()
    visibles = [x for x in c.contactos if not x.revision_humana]
    visibles.sort(key=lambda x: (x.cercania_decision, x.nombre or "zzz"))
    ocultos = len(c.contactos) - len(visibles)

    filas = []
    for x in visibles:
        # Si no hay correo de la persona, sirve el PATRON de la cuenta: para un
        # puesto sin persona es justo lo accionable. Va etiquetado como patron y
        # no como direccion, porque no lo es: es la forma, no el buzon.
        correo = x.datos.get("correo")
        es_patron = correo is None
        if es_patron:
            correo = x.datos.get("patron_correo")
        if correo is None:
            linea_correo = ""
        elif correo.nivel == EN_CONFLICTO:
            linea_correo = ('<div class="conf">EN CONFLICTO — '
                            f'{html.escape(correo.motivo_conflicto)}</div>')
        else:
            etiqueta = "patron · " if es_patron else ""
            linea_correo = (f'<div class="mail">{etiqueta}'
                            f'{html.escape(str(correo.valor or ""))} '
                            f'<i>{CHIP[correo.nivel]}</i></div>')
            # Mayoria clara con ancla: se reporta el valor Y la salvedad. Dar el
            # valor y callar la disidencia seria elegir en silencio con otro
            # nombre.
            if correo.disidencia:
                linea_correo += (f'<div class="dis">con salvedad — '
                                 f'{html.escape(correo.disidencia)}</div>')
        filas.append(
            f'<div class="p"><span class="lv">{NIVEL_FICHA.get(x.nivel_ficha,"N2")}</span>'
            f'<div><b>{html.escape(x.nombre or "(puesto sin persona)")}</b>'
            f'<span class="ro">{html.escape(x.puesto or "")}</span>{linea_correo}</div></div>')

    sen = "".join(f"<li>{html.escape(s)}</li>" for s in c.senal) or "<li>sin senal registrada</li>"

    # Los conflictos van ARRIBA y visibles. El modo limpio no puede afirmar
    # nada que el de procedencia marque contradicho -- y callarlo es afirmar.
    conflictos, salvedades = [], []
    for x in c.contactos:
        for campo, d in x.datos.items():
            if d.informa_pese_al_conflicto:
                salvedades.append(
                    f'<li><b>{html.escape(campo)}</b> de '
                    f'{html.escape(x.nombre or x.puesto or "?")}: '
                    f'<code>{html.escape(str(d.valor))}</code> — '
                    f'{html.escape(d.disidencia)}</li>')
                continue
            if d.nivel == EN_CONFLICTO:
                # El MOTIVO, no solo los valores: un conflicto por brecha de
                # certeza tiene UN solo valor, y sin el motivo la ficha lo
                # mostraba como si no hubiera nada raro.
                conflictos.append(
                    f'<li><b>{html.escape(campo)}</b> de '
                    f'{html.escape(x.nombre or x.puesto or "?")}: '
                    f'{html.escape(d.motivo_conflicto)}'
                    f' — <i>no se elige en silencio, va a revision humana</i></li>')
    bloque_conf = (f'<h2>En conflicto — {len(conflictos)}</h2><ul class="cf">'
                   f'{"".join(conflictos)}</ul>') if conflictos else ""
    # Los informados con salvedad NO van al mismo bloque: no son pendientes,
    # son datos usables que llevan una nota. Mezclarlos manda a revision humana
    # algo que ya se puede usar, y eso vuelve la ficha una lista de tareas.
    bloque_salv = (f'<h2>Con salvedad — {len(salvedades)}</h2><ul class="sv">'
                   f'{"".join(salvedades)}</ul>') if salvedades else ""
    val = "".join(
        f'<tr><td>{f["modulo"]}</td><td>{f["estado"]}</td>'
        f'<td>{html.escape(f["razon"])}</td></tr>' for f in checklist_validaciones(c))

    return f"""<title>{html.escape(c.empresa)}</title>
<style>
 body{{font:15px/1.5 -apple-system,system-ui,sans-serif;max-width:820px;margin:0 auto;padding:24px 16px;color:#25303a;background:#fff}}
 h1{{font-size:1.7rem;margin:0}} h2{{font-size:1.1rem;margin:28px 0 8px}}
 .meta{{color:#67717d;font-size:.86rem;margin-top:6px}}
 .p{{display:grid;grid-template-columns:44px 1fr;gap:10px;padding:9px 0;border-bottom:1px solid #e4e8ed}}
 .lv{{font:600 .7rem monospace;color:#1f4b6e;background:#eaf1f7;border-radius:3px;text-align:center;padding:2px 0;height:fit-content}}
 .ro{{display:block;color:#4a5560;font-size:.93rem}}
 .mail{{font:.82rem monospace;color:#1f4b6e;margin-top:3px}} .mail i{{color:#8b95a1;font-style:normal}}
 .conf{{font:.82rem monospace;color:#a4560a;margin-top:3px;font-weight:600}}
 .dis{{font:.76rem system-ui;color:#7a6320;margin-top:2px}}
 ul.sv{{font:.84rem system-ui;color:#5a4a12;background:#fdf8e6;border-left:3px solid #c9a227;padding:8px 8px 8px 24px;margin:6px 0}}
 ul.sv code{{font:.82rem monospace;color:#1f4b6e}}
 .cf{{background:#fbf3e8;border-left:3px solid #a4560a;padding:10px 12px 10px 30px;margin:0}}
 .cf li{{margin:4px 0;font-size:.9rem}}
 table{{width:100%;border-collapse:collapse;font-size:.85rem;margin-top:8px}}
 td,th{{text-align:left;padding:6px 8px;border-bottom:1px solid #e4e8ed}}
 .nota{{background:#f6f8fa;border-left:3px solid #1f4b6e;padding:10px 12px;margin-top:14px;font-size:.9rem}}
</style>
<h1>{html.escape(c.empresa)}</h1>
<div class="meta">{html.escape(c.ciudad)} · {html.escape(c.giro)} · corrida {c.creada[:10]}</div>

{bloque_conf}{bloque_salv}

<h2>Senal caliente</h2><ul>{sen}</ul>

<h2>A quien buscar — {len(visibles)} entradas</h2>
<div>{"".join(filas) or "<p>Sin contactos.</p>"}</div>

<h2>Que no se pudo hacer</h2>
<table><tr><th>Modulo</th><th>Estado</th><th>Razon</th></tr>{val}</table>

<div class="nota">
<b>Completitud estimada (Chao1):</b> {est.observados} observados ·
estimado {est.estimado:.0f} · cobertura {est.cobertura:.0%}.<br>{html.escape(est.nota)}
{f"<br><b>{ocultos} hallazgo(s) en revision humana</b>, no impresos aqui." if ocultos else ""}
</div>"""


def modo_procedencia(c: Corrida) -> dict:
    """Cada dato con su fuente, su n_fuentes, su nivel. Auditable."""
    return {
        "empresa": c.empresa, "ciudad": c.ciudad,
        "chao1": c.completitud().a_dict(),
        "cobertura": c.cobertura,
        "avisos": c.avisos,
        "contactos": [x.a_dict() for x in c.contactos],
    }
