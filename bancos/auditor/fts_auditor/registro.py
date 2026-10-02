"""Arma el cuerpo para fts_bancos_auditor_registrar a partir de resultado.json: {veredicto, tipo, asunto, datos}.
n8n codifica `datos` a base64 para el SQL (nada del contenido llega crudo a una consulta).

  python -m fts_auditor.registro <dir_foto> <tipo> [--sesion ID] [--pendientes 1,2]  -> <dir_foto>/registro.json
"""
import base64
import html
import json
import sys
from pathlib import Path

from .informe import html_privado


def correo(r: dict, tipo: str) -> str:
    rojos = [h for h in r["hallazgos"] if h["resultado"] == "ROJO"]
    filas = "".join(
        f"<li><b>{html.escape(h['codigo'])}</b> · pata {h['pata']} · estado {h['estado_id'] or '-'} · "
        f"<code>{html.escape(json.dumps(h['evidencia'], ensure_ascii=False, default=str))[:600]}</code></li>" for h in rojos[:40])
    c = r["conteos"]
    return (f"<p>Auditoría fts-bancos ({html.escape(tipo)}): <b>ROJO</b>. Objetivo 1 (base = PDFs): <b>{c['objetivo1']}</b>. "
            f"{c['estados_tres_patas_verde']} de {c['estados']} estados con las tres patas en VERDE.</p>"
            f"<p>Qué no cuadra y dónde:</p><ul>{filas}</ul>"
            + (f"<p>… y {len(rojos) - 40} más en el informe.</p>" if len(rojos) > 40 else ""))


def main(argv):
    d, tipo = Path(argv[0]), argv[1]
    sesion = argv[argv.index("--sesion") + 1] if "--sesion" in argv else None
    pend = [int(x) for x in argv[argv.index("--pendientes") + 1].split(",") if x] if "--pendientes" in argv else []
    r = json.loads((d / "resultado.json").read_text())
    decidir = json.loads((d / "para_decidir.json").read_text()) if (d / "para_decidir.json").exists() else []
    # las filas por estado y pata las arma el SQL desde por_estado; aquí sólo van los hallazgos no VERDE
    filas = [h for h in r["hallazgos"] if h["resultado"] != "VERDE"]
    j = {"tipo": tipo, "objetivo": 1, "veredicto": r["veredicto"], "iniciada_en": r["auditado_at"], "n_estados": r["conteos"]["estados"],
         "n_movimientos": r["conteos"]["movimientos"], "conteos": r["conteos"],
         "salud": {h["codigo"]: h["resultado"] for h in r["hallazgos"] if h["pata"] == 5},
         "auditor_version": r["version"], "sesion": sesion, "hallazgos": filas, "pendientes": pend,
         "por_estado": r["por_estado"], "para_decidir": decidir}
    cuerpo = {"veredicto": r["veredicto"], "tipo": tipo,
              "asunto": f"fts-bancos: auditoría {r['veredicto']} · Objetivo 1 {r['conteos']['objetivo1']} · {r['conteos']['estados_tres_patas_verde']}/{r['conteos']['estados']} estados",
              "datos": j}
    (d / "registro.json").write_text(json.dumps(cuerpo))
    print(len(json.dumps(cuerpo)), "caracteres")


if __name__ == "__main__":
    main(sys.argv[1:])
