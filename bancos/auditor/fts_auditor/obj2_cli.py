"""Objetivo 2 (issue #365), dentro de la sesión de Claude Code del auditor:

  python -m fts_auditor.obj2_cli foto <ejecucion.json> <dir>      base_obj2.json + odoo.json desde fts_bancos_auditor_obj2_lectura
  python -m fts_auditor.obj2_cli auditar <dir> <tipo>             resultado_obj2.json, informe_obj2.html (PRIVADO), publico_obj2.md
  python -m fts_auditor.obj2_cli registro <dir> <tipo> [--sesion ID]   registro_obj2.json para fts_bancos_auditor_registrar
"""
import html
import json
import sys
from pathlib import Path

from .__main__ import config
from .obj2 import Obj2


def _items(ruta, nodo):
    d = json.loads(Path(ruta).read_text())
    run = d["data"]["resultData"]["runData"][nodo]
    return [it["json"] for r in run for it in r["data"]["main"][0]]


def foto(ruta, d: Path):
    b = _items(ruta, "Postgres - Leer base Obj2 (bancos_auditor)")[0]["d"]
    if b.get("rol") != "bancos_auditor":
        raise SystemExit("la lectura no se hizo con el rol bancos_auditor")
    o = _items(ruta, "Code - Odoo compacto")[0]
    d.mkdir(parents=True, exist_ok=True)
    (d / "base_obj2.json").write_text(json.dumps(b, ensure_ascii=False))
    (d / "odoo.json").write_text(json.dumps(o, ensure_ascii=False))
    print("base", b["leido_at"], len(b.get("movimientos") or []), "movimientos ·", "odoo", o["n_odoo"], "líneas", o["leido_at"])


def publico(r: dict, tipo: str) -> str:
    c = r["conteos"]
    t = c["cotejo"]
    cmp = c["comparacion_servicio"]
    lineas = [f"- **{r['auditado_at'][:16].replace('T', ' ')} UTC** · Objetivo 2 · {tipo} · veredicto **{r['veredicto']}**"
              + (" · línea base (primera corrida)" if c["linea_base"] else ""),
              f"  - meses cotejados: {c['meses_cotejados']} · movimientos del banco: {c['movimientos']} · líneas de Odoo leídas: {c['lineas_odoo']}",
              f"  - cotejo (auditor): emparejados {t['emp_n']} ({c['pct_emparejado']} %) · faltan en Odoo {t['faltan_n']} · sobran en Odoo {t['sobran_n']}",
              f"  - segundo camino (cotejo del servicio, corrida {cmp['corrida_servicio']}): cubre {cmp['cubiertos_por_servicio']} de {cmp['movs_en_alcance']} · "
              f"emparejados en ambos {cmp['ambos']} · sólo auditor {cmp['solo_auditor']} · sólo servicio {cmp['solo_servicio']}",
              f"  - verificaciones por dos caminos: {c['verificaciones_ok']} de {c['verificaciones']} cuadran · sin clasificar {c['pct_sin_clasificar']} %"]
    if c["hallazgos_por_codigo"]:
        lineas.append("  - hallazgos por código: " + ", ".join(f"`{k}` {v}" for k, v in c["hallazgos_por_codigo"].items()))
    return "\n".join(lineas)


def informe(r: dict, tipo: str) -> str:
    e = html.escape
    filas = "".join(f"<tr><td>{e(m['cuenta'])}</td><td>{m['periodo']}</td><td>{m['banco_n']}</td><td>{m['banco_monto']}</td><td>{m['emp_n']}</td>"
                    f"<td>{m['emp_monto']}</td><td>{m['faltan_n']}</td><td>{m['faltan_monto']}</td><td>{m['sobran_n']}</td><td>{m['sobran_monto']}</td></tr>"
                    for m in r["cotejo_meses"])
    hall = "".join(f"<tr><td>{h['resultado']}</td><td>{h['pata']}</td><td>{e(h['codigo'])}</td><td>{h['estado_id'] or ''}</td>"
                   f"<td><code>{e(json.dumps(h['evidencia'], ensure_ascii=False))[:800]}</code></td></tr>"
                   for h in r["hallazgos"] if h["resultado"] in ("ROJO", "AMARILLO"))
    ver = "".join(f"<li>{'✓' if v['ok'] else '✗'} {e(v['que'])}: {e(v['camino_1'])} / {e(v['camino_2'])}</li>" for v in r["verificaciones"])
    return (f"<!doctype html><meta charset='utf-8'><title>Auditoría Objetivo 2</title><body style='font-family:system-ui;margin:24px'>"
            f"<h1>Auditoría fts-bancos · Objetivo 2 · {e(tipo)}</h1><p><b>{r['veredicto']}</b> · {e(r['auditado_at'])} · {e(r['version'])}</p>"
            f"<h2>Cotejo banco vs Odoo por cuenta y mes</h2><table border=1 cellpadding=4 style='border-collapse:collapse;font-size:12px'>"
            f"<tr><th>cuenta</th><th>mes</th><th>banco</th><th>monto</th><th>en Odoo</th><th>monto</th><th>faltan</th><th>monto</th><th>sobran en Odoo</th><th>monto</th></tr>{filas}</table>"
            f"<h2>Verificaciones por dos caminos</h2><ul>{ver}</ul><h2>Hallazgos</h2><table border=1 cellpadding=4 style='border-collapse:collapse;font-size:12px'>{hall}</table>"
            f"<h2>Clasificación</h2><p>{e(json.dumps(r['categorias'], ensure_ascii=False))}</p><p>{e(json.dumps(r['destinos_er'], ensure_ascii=False))}</p></body>")


def auditar(d: Path, tipo: str):
    b = json.loads((d / "base_obj2.json").read_text())
    o = json.loads((d / "odoo.json").read_text())["odoo"]
    r = Obj2(b, o, config().get("obj2") or {}).correr()
    (d / "resultado_obj2.json").write_text(json.dumps(r, ensure_ascii=False, default=str, indent=1))
    (d / "informe_obj2.html").write_text(informe(r, tipo))
    (d / "publico_obj2.md").write_text(publico(r, tipo))
    print(json.dumps({"veredicto": r["veredicto"], "conteos": {k: v for k, v in r["conteos"].items() if k != "comparacion_servicio"},
                      "comparacion": r["conteos"]["comparacion_servicio"]}, ensure_ascii=False))


def registro(d: Path, tipo: str, sesion: str | None):
    r = json.loads((d / "resultado_obj2.json").read_text())
    filas = [h for h in r["hallazgos"] if h["resultado"] != "VERDE"]
    j = {"tipo": tipo, "objetivo": 2, "veredicto": r["veredicto"], "iniciada_en": r["auditado_at"], "n_estados": r["conteos"]["estados"],
         "n_movimientos": r["conteos"]["movimientos"], "conteos": r["conteos"], "salud": {}, "auditor_version": r["version"], "sesion": sesion,
         "hallazgos": filas, "pendientes": [], "por_estado": r["por_estado"], "para_decidir": [],
         "cotejo_meses": r["cotejo_meses"], "verificaciones": r["verificaciones"]}
    c = r["conteos"]
    cuerpo = {"veredicto": r["veredicto"], "tipo": tipo,
              "asunto": f"fts-bancos: auditoría {r['veredicto']} · Objetivo 2 · {c['pct_emparejado']} % del banco en Odoo · {c['meses_cotejados']} meses",
              "datos": j}
    (d / "registro_obj2.json").write_text(json.dumps(cuerpo, ensure_ascii=False, default=str))
    print(len(json.dumps(cuerpo)), "caracteres")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[0] == "foto":
        foto(a[1], Path(a[2]))
    elif a[0] == "auditar":
        auditar(Path(a[1]), a[2])
    elif a[0] == "registro":
        registro(Path(a[1]), a[2], a[a.index("--sesion") + 1] if "--sesion" in a else None)
