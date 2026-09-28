"""Informe PRIVADO (HTML) para Esteban, y el resumen PÚBLICO (sin datos bancarios) para el issue."""
from __future__ import annotations

import html
import json

COLOR = {"VERDE": "#1e7b34", "AMARILLO": "#9a6700", "ROJO": "#b42318", "NO_APLICA": "#6b7280"}


def publico(r: dict, tipo: str, execution_id: str | None = None) -> str:
    """Sólo fecha, veredicto, conteos y execution ID. Ningún monto, cuenta, contraparte ni nombre de archivo."""
    c = r["conteos"]
    cod = c["hallazgos_por_codigo"]
    lineas = [f"- **{r['auditado_at'][:16].replace('T', ' ')} UTC** · {tipo} · veredicto **{r['veredicto']}** · Objetivo 1 **{c['objetivo1']}**",
              f"  - estados verificados: {c['estados']} · movimientos: {c['movimientos']} · con las tres patas en VERDE: {c['estados_tres_patas_verde']}",
              f"  - estados en ROJO por pata: 1 → {c['rojo_por_pata']['1']}, 2 → {c['rojo_por_pata']['2']}, 3 → {c['rojo_por_pata']['3']}; hallazgos de pata 1 sin estado: {c['rojo_pata1_sin_estado']}"]
    if cod:
        lineas.append("  - hallazgos por tipo: " + ", ".join(f"`{k}` {v}" for k, v in cod.items()))
    if execution_id:
        lineas.append(f"  - registro: ejecución n8n `{execution_id}`")
    return "\n".join(lineas)


def html_privado(r: dict, tipo: str, para_decidir: list[str] | None = None) -> str:
    c = r["conteos"]
    e = html.escape
    filas = []
    for f in r["por_estado"]:
        celdas = "".join(f'<td style="color:{COLOR[f[k]]};font-weight:600">{f[k]}</td>' for k in ("pata1", "pata2", "pata3"))
        filas.append(f"<tr><td>{f['estado_id']}</td><td>{f['cuenta_id']}</td><td>{f['periodo']}</td><td>{f['movimientos']}</td>{celdas}</tr>")
    hall = []
    for h in r["hallazgos"]:
        if h["resultado"] in ("VERDE",):
            continue
        hall.append(f'<tr><td style="color:{COLOR.get(h["resultado"], "#000")};font-weight:600">{h["resultado"]}</td><td>{h["pata"]}</td>'
                    f'<td>{e(h["codigo"])}</td><td>{h["estado_id"] or ""}</td><td>{h["archivo_id"] or ""}</td>'
                    f'<td><code>{e(json.dumps(h["evidencia"], ensure_ascii=False, default=str))}</code></td></tr>')
    decidir = ""
    if para_decidir:
        decidir = "<h2>Para decidir</h2><ol>" + "".join(f"<li>{e(x)}</li>" for x in para_decidir) + "</ol><p>La sesión del auditor queda abierta para tu respuesta. Nada se ejecuta sin ella.</p>"
    return f"""<!doctype html><html lang="es"><meta charset="utf-8"><title>Auditoría fts-bancos {e(r['auditado_at'][:10])}</title>
<body style="font-family:system-ui,Segoe UI,Arial,sans-serif;margin:24px;color:#111">
<h1>Auditoría fts-bancos · {e(tipo)}</h1>
<p><b>Veredicto: <span style="color:{COLOR[r['veredicto']]}">{r['veredicto']}</span></b> · Objetivo 1 (base = PDFs): <b>{c['objetivo1']}</b><br>
{c['estados']} estados · {c['movimientos']} movimientos · {c['estados_tres_patas_verde']} con las tres patas en VERDE<br>
Base leída {e(str(r.get('leido_at')))} · auditada {e(r['auditado_at'])} · {e(r['version'])}</p>
<p style="color:#555">Privado: sólo para Esteban. Pata 1 = inventario OneDrive ↔ base · Pata 2 = relectura independiente del PDF (PDFium) · Pata 3 = V1/V2/V3 recalculadas y comparadas con el servicio.</p>
{decidir}
<h2>Por estado</h2>
<table border="1" cellpadding="4" style="border-collapse:collapse;font-size:13px">
<tr><th>estado</th><th>cuenta</th><th>periodo</th><th>movs</th><th>pata 1</th><th>pata 2</th><th>pata 3</th></tr>
{''.join(filas)}</table>
<h2>Hallazgos</h2>
<table border="1" cellpadding="4" style="border-collapse:collapse;font-size:12px">
<tr><th>resultado</th><th>pata</th><th>código</th><th>estado</th><th>archivo</th><th>evidencia</th></tr>
{''.join(hall) or '<tr><td colspan="6">Sin hallazgos.</td></tr>'}</table>
</body></html>"""
