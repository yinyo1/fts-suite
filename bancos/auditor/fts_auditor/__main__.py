"""Uso (dentro de la sesión de Claude Code del auditor):
  python -m fts_auditor <dir_foto> <tipo> [--alcance 12,13]
<dir_foto> tiene base.json, onedrive.json (con sha256 por archivo), n8n.json y pdf/<sha256>.pdf.
Escribe resultado.json (con evidencia PRIVADA), informe.html (PRIVADO) y publico.md (para el issue)."""
import json
import sys
from pathlib import Path

from .informe import html_privado, publico
from .patas import Auditoria


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
    r = Auditoria(base, od, pdfs, n8n=n8n, alcance_archivos=alcance).correr(objetivo1=not solo_salud)
    decidir = json.loads((d / "para_decidir.json").read_text()) if (d / "para_decidir.json").exists() else []
    (d / "resultado.json").write_text(json.dumps(r, ensure_ascii=False, default=str, indent=1))
    (d / "informe.html").write_text(html_privado(r, tipo, decidir))
    (d / "publico.md").write_text(publico(r, tipo))
    print(json.dumps({"veredicto": r["veredicto"], "conteos": r["conteos"]}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1:])
