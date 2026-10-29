#!/usr/bin/env python3
"""Descarga los adjuntos (ir.attachment) del chatter de purchase.order de Odoo.

Uso pensado para el expediente E-2 (Galer), reutilizable para cualquier bloque:

    export ODOO_URL=https://serviciosfts.odoo.com
    export ODOO_DB=serviciosfts
    export ODOO_USER=<login>
    export ODOO_API_KEY=<api key>        # o ODOO_PASSWORD
    python3 scripts/odoo_download_po_attachments.py \
        --po-ids 7083,7188,7178,7061,7060 \
        --slug 7083=HomeDepot --slug 7188=ElliottElectric ... \
        --out tmp/e2-galer/inbox-po-attachments

    --dry-run   lista lo que hay sin bajar el contenido (no pide "datas").

La credencial NUNCA se escribe en el repo ni se imprime: se lee del entorno.
El MCP de Odoo no sirve aqui porque ir.attachment esta en su denylist dura.

Nombre de salida:
    PO-{po_name}_{vendor-slug}_{idx:02d}_{nombre-original-slug}.{ext}
idx = orden por create_date ascendente (desempate por id) dentro del PO.

Al final escribe index.csv con:
    po_name, vendor, bill_name, attachment_id, filename_final, mimetype,
    size_bytes, first_text_line_or_dimensions, odoo_create_date
y sale con codigo 1 si algun PO no cuadra (esperado vs bajado) o algun
tamano en disco no coincide con file_size de Odoo.
"""
import argparse
import base64
import csv
import os
import re
import shutil
import subprocess
import sys
import unicodedata
import xmlrpc.client

EXT_POR_MIME = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
}

# Slugs conocidos de proveedores FTS USA. Se pueden sobreescribir con --slug.
SLUG_POR_PROVEEDOR = {
    "home depot": "HomeDepot",
    "elliott electric": "ElliottElectric",
    "american ace": "AmericanAce",
}


def slug(texto):
    t = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t.strip().lower()).strip("-")
    return t or "sin-nombre"


def separar_ext(nombre):
    base, ext = os.path.splitext(nombre or "")
    return base, ext.lstrip(".").lower()


def extension(mimetype, nombre):
    if mimetype in EXT_POR_MIME:
        return EXT_POR_MIME[mimetype]
    _, ext = separar_ext(nombre)
    return ext or "bin"


def slug_proveedor(nombre):
    n = (nombre or "").lower()
    for clave, s in SLUG_POR_PROVEEDOR.items():
        if clave in n:
            return s
    return "".join(p.capitalize() for p in slug(nombre).split("-")[:3]) or "Proveedor"


def m2o_nombre(v):
    if isinstance(v, (list, tuple)) and len(v) > 1:
        return v[1]
    return "" if v in (False, None) else str(v)


def primera_linea_pdf(ruta):
    if shutil.which("pdftotext"):
        try:
            out = subprocess.run(["pdftotext", "-l", "1", ruta, "-"], capture_output=True,
                                 text=True, timeout=60).stdout
            for linea in out.splitlines():
                if linea.strip():
                    return linea.strip()[:200]
            return "(PDF sin texto extraible, posible escaneo)"
        except Exception as e:  # noqa: BLE001
            return f"(pdftotext fallo: {e})"
    try:
        from pypdf import PdfReader
        texto = PdfReader(ruta).pages[0].extract_text() or ""
        for linea in texto.splitlines():
            if linea.strip():
                return linea.strip()[:200]
        return "(PDF sin texto extraible, posible escaneo)"
    except Exception as e:  # noqa: BLE001
        return f"(no se pudo leer el PDF: {e})"


def dimensiones(ruta, ext):
    try:
        if ext == "heic":
            try:
                import pillow_heif  # type: ignore
                pillow_heif.register_heif_opener()
            except ImportError:
                return "(HEIC: falta pillow-heif para leer dimensiones)"
        from PIL import Image
        with Image.open(ruta) as im:
            return f"{im.width}x{im.height} px"
    except Exception as e:  # noqa: BLE001
        return f"(no se pudo abrir la imagen: {e})"


def describir(ruta, ext, mimetype):
    if ext == "pdf" or mimetype == "application/pdf":
        return primera_linea_pdf(ruta)
    if (mimetype or "").startswith("image/") or ext in ("jpg", "jpeg", "png", "heic"):
        return dimensiones(ruta, ext)
    return "(tipo no inspeccionado)"


def conectar():
    url = os.environ.get("ODOO_URL", "").rstrip("/")
    db = os.environ.get("ODOO_DB", "")
    user = os.environ.get("ODOO_USER", "")
    secreto = os.environ.get("ODOO_API_KEY") or os.environ.get("ODOO_PASSWORD") or ""
    faltan = [n for n, v in (("ODOO_URL", url), ("ODOO_DB", db), ("ODOO_USER", user),
                             ("ODOO_API_KEY|ODOO_PASSWORD", secreto)) if not v]
    if faltan:
        sys.exit(f"FALTAN_CREDENCIALES: {', '.join(faltan)}")
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common", allow_none=True)
    uid = common.authenticate(db, user, secreto, {})
    if not uid:
        sys.exit("AUTENTICACION_FALLIDA: Odoo devolvio uid vacio (login o key invalida)")
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", allow_none=True)

    def call(model, method, args, kw=None):
        return models.execute_kw(db, uid, secreto, model, method, args, kw or {})

    return uid, call


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--po-ids", help="ids de purchase.order separados por coma")
    ap.add_argument("--po-names", help="nombres de PO (P07047,...) separados por coma")
    ap.add_argument("--slug", action="append", default=[], help="po_id=Slug, fija el slug del proveedor")
    ap.add_argument("--out", required=True, help="carpeta destino")
    ap.add_argument("--dry-run", action="store_true", help="solo lista, no baja contenido")
    a = ap.parse_args()
    if not a.po_ids and not a.po_names:
        ap.error("hace falta --po-ids o --po-names")

    uid, call = conectar()
    print(f"autenticado uid={uid}")

    campos_po = ["id", "name", "partner_id", "invoice_ids", "message_attachment_count"]
    if a.po_ids:
        ids = [int(x) for x in a.po_ids.split(",") if x.strip()]
        pos = call("purchase.order", "read", [ids], {"fields": campos_po})
    else:
        nombres = [x.strip() for x in a.po_names.split(",") if x.strip()]
        pos = call("purchase.order", "search_read", [[["name", "in", nombres]]], {"fields": campos_po})
    if not pos:
        sys.exit("SIN_POS: no se encontro ninguna purchase.order")
    pos.sort(key=lambda p: p["id"])

    slugs = {}
    for s in a.slug:
        k, _, v = s.partition("=")
        slugs[int(k)] = v.strip()

    bill_ids = sorted({b for p in pos for b in (p.get("invoice_ids") or [])})
    bills = {b["id"]: b["name"] for b in call("account.move", "read", [bill_ids], {"fields": ["name"]})} if bill_ids else {}

    campos_att = ["id", "name", "res_id", "mimetype", "file_size", "create_date"]
    if not a.dry_run:
        campos_att.append("datas")

    os.makedirs(a.out, exist_ok=True)
    filas, problemas = [], []
    for po in pos:
        pid, pname = po["id"], po["name"]
        vendor = m2o_nombre(po["partner_id"])
        vslug = slugs.get(pid) or slug_proveedor(vendor)
        bill = ", ".join(bills.get(b, str(b)) for b in (po.get("invoice_ids") or [])) or "(sin bill)"
        esperado = po.get("message_attachment_count") or 0
        atts = call("ir.attachment", "search_read",
                    [[["res_model", "=", "purchase.order"], ["res_id", "=", pid]]],
                    {"fields": campos_att, "order": "create_date asc, id asc"})
        atts.sort(key=lambda x: (x.get("create_date") or "", x["id"]))
        if len(atts) != esperado:
            problemas.append(f"{pname}: message_attachment_count={esperado} pero search_read devolvio {len(atts)}")
        bajados = 0
        for idx, att in enumerate(atts, 1):
            base, _ = separar_ext(att.get("name"))
            ext = extension(att.get("mimetype"), att.get("name"))
            final = f"PO-{pname}_{vslug}_{idx:02d}_{slug(base)}.{ext}"
            ruta = os.path.join(a.out, final)
            size_odoo = att.get("file_size") or 0
            desc = "(dry-run)"
            if not a.dry_run:
                datas = att.get("datas")
                if not datas:
                    problemas.append(f"{pname} att {att['id']}: datas vacio (adjunto tipo url o sin contenido)")
                    continue
                with open(ruta, "wb") as f:
                    f.write(base64.b64decode(datas))
                size_disco = os.path.getsize(ruta)
                if size_disco != size_odoo:
                    problemas.append(f"{final}: tamano en disco {size_disco} != file_size Odoo {size_odoo}")
                desc = describir(ruta, ext, att.get("mimetype"))
                bajados += 1
            filas.append({
                "po_name": pname, "vendor": vendor, "bill_name": bill,
                "attachment_id": att["id"], "filename_final": final,
                "mimetype": att.get("mimetype") or "", "size_bytes": size_odoo,
                "first_text_line_or_dimensions": desc,
                "odoo_create_date": att.get("create_date") or "",
            })
        print(f"{pname} {vendor}: esperados {esperado}, encontrados {len(atts)}, bajados {bajados}")

    columnas = ["po_name", "vendor", "bill_name", "attachment_id", "filename_final", "mimetype",
                "size_bytes", "first_text_line_or_dimensions", "odoo_create_date"]
    with open(os.path.join(a.out, "index.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=columnas)
        w.writeheader()
        w.writerows(filas)
    print(f"index.csv: {len(filas)} filas en {a.out}")
    for p in problemas:
        print("PROBLEMA:", p)
    sys.exit(1 if problemas else 0)


if __name__ == "__main__":
    main()
