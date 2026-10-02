"""Uso (dentro de la sesión de Claude Code del auditor):
  python -m fts_auditor <dir_foto> <tipo> [--alcance 12,13] [--p3-desde AAAA-MM]
El corte de alcance de la pata 3 se lee de bancos/auditor/config.json; --p3-desde lo sustituye en esa corrida
('--p3-desde ""' = sin corte).
<dir_foto> tiene base.json, onedrive.json (con sha256 por archivo), n8n.json y pdf/<sha256>.pdf.
Escribe resultado.json (con evidencia PRIVADA), informe.html (PRIVADO) y publico.md (para el issue)."""
import json
import sys
from pathlib import Path

from .informe import html_privado, publico
from .patas import Auditoria

CONFIG = Path(__file__).resolve().parents[1] / "config.json"


def config() -> dict:
    return json.loads(CONFIG.read_text()) if CONFIG.exists() else {}


def main(argv):
    d, tipo = Path(argv[0]), argv[1]
    alcance = None
    if "--alcance" in argv:
        alcance = {int(x) for x in argv[argv.index("--alcance") + 1].split(",") if x}
    base = json.loads((d / "base.json").read_text())
    od = json.loads((d / "onedrive.json").read_text())
    n8n = json.loads((d / "n8n.json").read_text()) if (d / "n8n.json").exists() else {}
    pdfs = {p.stem: p.read_bytes() for p in (d / "pdf").glob("*.pdf")}
    solo_salud = alcance is not None and not alcance
    cfg = config().get("pata3") or {}
    p3_desde = cfg.get("alcance_desde")
    if "--p3-desde" in argv:
        p3_desde = argv[argv.index("--p3-desde") + 1] or None
    r = Auditoria(base, od, pdfs, n8n=n8n, alcance_archivos=alcance, p3_desde=p3_desde,
                  p3_desde_por_cuenta=cfg.get("alcance_desde_por_cuenta")).correr(objetivo1=not solo_salud)
    decidir = json.loads((d / "para_decidir.json").read_text()) if (d / "para_decidir.json").exists() else []
    (d / "resultado.json").write_text(json.dumps(r, ensure_ascii=False, default=str, indent=1))
    (d / "informe.html").write_text(html_privado(r, tipo, decidir))
    (d / "publico.md").write_text(publico(r, tipo))
    print(json.dumps({"veredicto": r["veredicto"], "conteos": r["conteos"]}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1:])
