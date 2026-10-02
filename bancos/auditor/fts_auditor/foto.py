"""Arma la FOTO del auditor a partir de las ejecuciones de fts_bancos_auditor_lectura que la sesión
guardó en disco (get_workflow_execution con includeData). Nada de esto se publica.

  python -m fts_auditor.foto base      <ejecucion.json> <dir_foto>
  python -m fts_auditor.foto onedrive  <ejecucion.json> <dir_foto>
  python -m fts_auditor.foto pdfs      <ejecucion.json> <dir_foto>   (una o varias veces, lotes de 25)
  python -m fts_auditor.foto pendientes <dir_foto>                   (imprime los items a bajar, en lotes de 25)
"""
import base64
import hashlib
import json
import sys
from pathlib import Path


def _items(ruta: str, nodo: str) -> list[dict]:
    d = json.loads(Path(ruta).read_text())
    run = d["data"]["resultData"]["runData"][nodo]
    return [it["json"] for r in run for it in r["data"]["main"][0]]


def base(ruta, dirf: Path):
    j = _items(ruta, "Postgres - Leer base (bancos_auditor)")[0]["d"]
    if j.get("rol") != "bancos_auditor":
        raise SystemExit("la lectura no se hizo con el rol bancos_auditor")
    (dirf / "base.json").write_text(json.dumps(j, ensure_ascii=False))
    print("base", j["leido_at"], len(j.get("estados") or []), "estados")


def onedrive(ruta, dirf: Path):
    j = _items(ruta, "Code - Inventario OneDrive")[0]
    (dirf / "onedrive.json").write_text(json.dumps(j, ensure_ascii=False))
    print("onedrive", j["n_archivos"], "archivos", len(j["errores"]), "errores")


def pdfs(ruta, dirf: Path):
    (dirf / "pdf").mkdir(exist_ok=True)
    od = json.loads((dirf / "onedrive.json").read_text()) if (dirf / "onedrive.json").exists() else {"archivos": []}
    extra = json.loads((dirf / "originales.json").read_text()) if (dirf / "originales.json").exists() else {}
    por_item = {f["item_id"]: f for f in od["archivos"]}
    ok = mal = 0
    for it in _items(ruta, "Code - Empacar"):
        if not it.get("ok"):
            mal += 1
            continue
        b = base64.b64decode(it["b64"])
        sha = hashlib.sha256(b).hexdigest()
        (dirf / "pdf" / f"{sha}.pdf").write_bytes(b)
        if it["item_id"] in por_item:
            por_item[it["item_id"]]["sha256"] = sha
        else:
            extra[it["item_id"]] = sha
        ok += 1
    (dirf / "onedrive.json").write_text(json.dumps(od, ensure_ascii=False))
    (dirf / "originales.json").write_text(json.dumps(extra))
    print("pdfs", ok, "bajados", mal, "fallidos")


def pendientes(dirf: Path):
    """Lo que falta bajar: todo PDF de OneDrive sin sha256, y el original de cada estado vigente validado
    cuyo sha256 no esté ya bajado (p. ej. un viejo cuya copia canónica aún no existe)."""
    od = json.loads((dirf / "onedrive.json").read_text())
    b = json.loads((dirf / "base.json").read_text())
    tengo = {p.stem for p in (dirf / "pdf").glob("*.pdf")} if (dirf / "pdf").exists() else set()
    lista = [{"drive_id": f["drive_id"], "item_id": f["item_id"]} for f in od["archivos"]
             if not f.get("en_buzon") and f["nombre"].lower().endswith(".pdf") and not f.get("sha256")]
    en_od = {f.get("sha256") for f in od["archivos"]}
    vig = set(b.get("vigentes") or [])
    arch = {a["id"]: a for a in b["archivos"]}
    for e in b["estados"]:
        a = arch.get(e["archivo_id"])
        if e["id"] in vig and a and a["estado"] == "validado" and a["sha256"] not in tengo | en_od and a.get("graph_item_id") and a.get("graph_drive_id"):
            lista.append({"drive_id": a["graph_drive_id"], "item_id": a["graph_item_id"]})
    for k in range(0, len(lista), 25):
        print(json.dumps(lista[k:k + 25]))


def heredar(prev: Path, dirf: Path):
    """Reusa los PDFs de una foto anterior: mismo item_id y misma huella quickXor = mismo contenido.
    Copia el sha256 al onedrive.json nuevo y el PDF a pdf/, para no volver a bajarlo."""
    import shutil
    (dirf / "pdf").mkdir(exist_ok=True)
    viejo = {f["item_id"]: f for f in json.loads((prev / "onedrive.json").read_text())["archivos"] if f.get("sha256")}
    od = json.loads((dirf / "onedrive.json").read_text())
    n = 0
    for f in od["archivos"]:
        v = viejo.get(f["item_id"])
        if v and v.get("quickxor") and v.get("quickxor") == f.get("quickxor") and (prev / "pdf" / f"{v['sha256']}.pdf").exists():
            f["sha256"] = v["sha256"]
            shutil.copyfile(prev / "pdf" / f"{v['sha256']}.pdf", dirf / "pdf" / f"{v['sha256']}.pdf")
            n += 1
    (dirf / "onedrive.json").write_text(json.dumps(od, ensure_ascii=False))
    if (prev / "originales.json").exists() and not (dirf / "originales.json").exists():
        shutil.copyfile(prev / "originales.json", dirf / "originales.json")
    print("heredados", n)


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[0] == "pendientes":
        pendientes(Path(a[1]))
    elif a[0] == "heredar":
        heredar(Path(a[1]), Path(a[2]))
    else:
        dirf = Path(a[2]); dirf.mkdir(parents=True, exist_ok=True)
        {"base": base, "onedrive": onedrive, "pdfs": pdfs}[a[0]](a[1], dirf)
