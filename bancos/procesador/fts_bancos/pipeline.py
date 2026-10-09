"""Pipeline: bytes de un archivo del buzón → base bancaria.

Cada archivo (y cada pieza de un ZIP) se procesa en su propia transacción.
El resultado es un MANIFIESTO que n8n ejecuta en OneDrive: qué copiar, con qué
nombre, a qué carpeta, qué mandar a Rechazados y con qué motivo.
"""
from __future__ import annotations

import io
import json
import os
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from . import PARSER_VERSION, bbva, entrada, jeeves, validar
from .clasificar import VERSION_CLASIFICADOR, Regla, clasificar, emparejar, reglas_base
from .cuentas import Catalogo, rfc_fts, Cuenta, cargar_de_entorno
from .util import (NOMBRE_MES, fmt, mascara, periodo_anterior, periodo_siguiente,
                   rango_periodos, sha256_bytes)

RAIZ_ORIGINALES = "01 Estados de cuenta originales - Servicios FTS SA de CV"
CARPETA_OTRAS = f"{RAIZ_ORIGINALES}/Otras cuentas por identificar"
CARPETA_JEEVES = f"{RAIZ_ORIGINALES}/Jeeves Tarjeta Credito"
CARPETA_PAYANA = f"{RAIZ_ORIGINALES}/Payana"
BUZON = "00 Buzon de carga - subir aqui"


def ahora() -> datetime:
    return datetime.now(timezone.utc)


def _j(x) -> str:
    return json.dumps(x, ensure_ascii=False, default=str)


def externas_financiamiento() -> list[str]:
    return [re.sub(r"\D", "", x) for x in os.environ.get("BANCOS_CUENTAS_FINANCIAMIENTO", "").split(",") if x.strip()]


# ── siembra ──
def sembrar(con, cuentas: list[Cuenta]) -> None:
    with con.cursor() as cur:
        for c in cuentas:
            cur.execute(
                """INSERT INTO bancos.cuentas (banco, alias, numero, clabe, moneda, journal_odoo, entidad, rfc, tipo, carpeta)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (numero) DO NOTHING""",
                (c.banco, c.alias, c.numero, c.clabe, c.moneda, c.journal_odoo, "Servicios FTS SA de CV", rfc_fts() or None, c.tipo, c.carpeta))
        for r in reglas_base():
            cur.execute(
                """INSERT INTO bancos.reglas (prioridad, nombre, codigo_banco, patron, sentido, categoria, subcategoria, contraparte, origen)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'base') ON CONFLICT (nombre) DO NOTHING""",
                (r.prioridad, r.nombre, r.codigo, r.patron, r.sentido, r.categoria, r.subcategoria, r.contraparte))


def catalogo_db(con) -> Catalogo:
    with con.cursor() as cur:
        cur.execute("SELECT * FROM bancos.cuentas WHERE activa ORDER BY id")
        filas = cur.fetchall()
    env = {c.numero: c for c in cargar_de_entorno()}
    cuentas = []
    for f in filas:
        e = env.get(f["numero"])
        cuentas.append(Cuenta(clave=e.clave if e else f"c{f['id']}", banco=f["banco"], alias=f["alias"], numero=f["numero"],
                              moneda=f["moneda"], clabe=f["clabe"], journal_odoo=f["journal_odoo"], carpeta=f["carpeta"],
                              tipo=f["tipo"], id=f["id"]))
    return Catalogo(cuentas, externas_financiamiento())


def reglas_db(con) -> list[Regla]:
    with con.cursor() as cur:
        cur.execute("SELECT * FROM bancos.reglas WHERE activa ORDER BY prioridad, id")
        return [Regla(r["prioridad"], r["nombre"], r["codigo_banco"], r["patron"], r["sentido"], r["categoria"],
                      r["subcategoria"], r["contraparte"], r["origen"]) for r in cur.fetchall()]


# ── corridas ──
def abrir_corrida(con, origen: str, disparada_por: str | None = None) -> int:
    with con.cursor() as cur:
        cur.execute("INSERT INTO bancos.corridas (origen, disparada_por, parser_version) VALUES (%s,%s,%s) RETURNING id",
                    (origen, disparada_por, PARSER_VERSION))
        return cur.fetchone()["id"]


def evento(con, corrida_id, nivel, codigo, mensaje, sha=None, datos=None):
    if not corrida_id:
        return
    with con.cursor() as cur:
        cur.execute("""INSERT INTO bancos.corrida_eventos (corrida_id, nivel, archivo_sha, codigo, mensaje, datos)
                       VALUES (%s,%s,%s,%s,%s,%s)""", (corrida_id, nivel, sha, codigo, mensaje, _j(datos or {})))


# ── manifiesto ──
@dataclass
class Item:
    sha256: str
    nombre_original: str
    ruta_en_zip: str | None
    tipo: str
    estado: str
    accion: str                      # copiar | rechazados | otras | ninguna | contenedor
    carpeta_destino: str | None = None
    nombre_destino: str | None = None
    cuenta: dict | None = None
    periodo: str | None = None
    motivo: str | None = None
    instruccion: str | None = None
    avisos: list[str] = field(default_factory=list)
    v1: bool | None = None
    v2: bool | None = None
    detalle: dict = field(default_factory=dict)
    archivo_id: int | None = None
    estado_id: int | None = None
    es_pieza_de_zip: bool = False

    def dict(self):
        return {k: v for k, v in self.__dict__.items()}


def _upsert_archivo(con, sha, contenido, nombre, meta, zip_origen_id=None, ruta_en_zip=None, corrida_id=None):
    """Devuelve (archivo_row, es_nuevo)."""
    with con.cursor() as cur:
        cur.execute("INSERT INTO bancos.blobs (sha256, bytes, contenido) VALUES (%s,%s,%s) ON CONFLICT (sha256) DO NOTHING",
                    (sha, len(contenido), contenido))
        cur.execute("SELECT * FROM bancos.archivos WHERE sha256=%s", (sha,))
        fila = cur.fetchone()
        if fila:
            cur.execute("""INSERT INTO bancos.avistamientos (archivo_id, nombre, origen, graph_drive_id, graph_item_id, ruta, corrida_id)
                           VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (archivo_id, graph_item_id) DO NOTHING""",
                        (fila["id"], nombre, meta.get("origen", "buzon"), meta.get("graph_drive_id"),
                         meta.get("graph_item_id") or f"{nombre}|{ruta_en_zip or ''}", meta.get("ruta"), corrida_id))
            return fila, False
        cur.execute("""INSERT INTO bancos.archivos (sha256, nombre_original, zip_origen_id, ruta_en_zip, origen, graph_drive_id,
                         graph_item_id, ruta_origen, subido_por, subido_at, corrida_id)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
                    (sha, nombre, zip_origen_id, ruta_en_zip, "zip" if zip_origen_id else meta.get("origen", "buzon"),
                     None if zip_origen_id else meta.get("graph_drive_id"), None if zip_origen_id else meta.get("graph_item_id"),
                     meta.get("ruta"), meta.get("subido_por"), meta.get("subido_at"), corrida_id))
        fila = cur.fetchone()
        cur.execute("""INSERT INTO bancos.avistamientos (archivo_id, nombre, origen, graph_drive_id, graph_item_id, ruta, corrida_id)
                       VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
                    (fila["id"], nombre, meta.get("origen", "buzon"), meta.get("graph_drive_id"),
                     meta.get("graph_item_id") or f"{nombre}|{ruta_en_zip or ''}", meta.get("ruta"), corrida_id))
        return fila, True


def _marcar(con, archivo_id, **campos):
    campos["actualizado_at"] = ahora()
    cols = ", ".join(f"{k}=%s" for k in campos)
    with con.cursor() as cur:
        cur.execute(f"UPDATE bancos.archivos SET {cols} WHERE id=%s", (*campos.values(), archivo_id))


def _aviso_nombre(nombre: str, periodo: str | None) -> list[str]:
    pista = entrada.periodo_en_nombre(nombre)
    if not (pista and periodo and pista != periodo):
        return []
    return [f"el archivo '{nombre}' es {NOMBRE_MES[int(periodo[5:7])]} {periodo[:4]}, no "
            f"{NOMBRE_MES[int(pista[5:7])]} {pista[:4]}: el periodo sale de la pág. 1 ('Periodo DEL … AL …'), no del nombre"]


def _item_desde_archivo_existente(con, fila, nombre, ruta_en_zip, catalogo: Catalogo) -> Item:
    """El mismo contenido ya se había recibido (duplicado exacto por sha256)."""
    cuenta = next((c for c in catalogo.cuentas if c.id == fila["cuenta_id"]), None)
    de = fila["nombre_canonico"] or fila["nombre_original"]
    return Item(sha256=fila["sha256"], nombre_original=nombre, ruta_en_zip=ruta_en_zip, tipo=fila["tipo_detectado"] or "?",
                estado="duplicado", accion="duplicado", periodo=fila["periodo"],
                carpeta_destino=f"{BUZON}/Duplicados", nombre_destino=nombre,
                cuenta=_cuenta_dict(cuenta), archivo_id=fila["id"], avisos=_aviso_nombre(nombre, fila["periodo"]),
                motivo=f"copia exacta (mismo sha256) de '{de}', recibido {fila['recibido_at']:%Y-%m-%d}",
                detalle={"estado_previo": fila["estado"], "copia_de": de})


def _cuenta_dict(c: Cuenta | None):
    if not c:
        return None
    return {"clave": c.clave, "banco": c.banco, "alias": c.alias, "mask": c.mask, "moneda": c.moneda,
            "journal_odoo": c.journal_odoo}


def es_candidato(contenido: bytes, catalogo: Catalogo) -> bool:
    """¿Vale la pena guardar este archivo? Para el inventario de carpetas revueltas
    (facturas, CEPs, SIPARE…): sólo PDFs con pinta de estado de cuenta, o ZIPs que los traigan.
    No escribe nada."""
    if entrada.es_zip(contenido):
        res = entrada.expandir_zip(contenido, "inventario.zip")
        return any(es_candidato(p.contenido, catalogo) for p in res.piezas if not entrada.es_zip(p.contenido))
    if not entrada.es_pdf(contenido):
        return False
    try:
        t = "\n".join(bbva.texto_paginas(contenido, max_paginas=2))   # hay PDF con una hoja-imagen antes
    except Exception:
        return b"/Encrypt" in contenido   # protegido: se guarda para avisar
    if not t.strip():
        return False
    if re.search(r"ESTADO\s+DE\s+CUENTA", t, re.I) and ((rfc_fts() and rfc_fts() in t.replace(" ", "")) or catalogo.identificar(t)):
        return True
    return bool(bbva.RE_PERIODO.search(t) and catalogo.identificar(t))


def procesar_archivo(con, contenido: bytes, nombre: str, meta: dict, corrida_id: int | None,
                     catalogo: Catalogo, reglas: list[Regla]) -> list[Item]:
    """Procesa un archivo (o ZIP) y devuelve los items del manifiesto."""
    if len(contenido) > entrada.MAX_BYTES_ARCHIVO * (8 if entrada.es_zip(contenido) else 1):
        sha = sha256_bytes(contenido[:1024 * 1024])
        return [Item(sha, nombre, None, "desconocido", "rechazado", "rechazados",
                     motivo=f"archivo demasiado grande ({len(contenido)} bytes)",
                     instruccion="Súbanlo partido en varios ZIP o como PDFs sueltos.")]
    items: list[Item] = []
    _procesar(con, contenido, nombre, meta, corrida_id, catalogo, reglas, items, None, None)
    return items


def _procesar(con, contenido, nombre, meta, corrida_id, catalogo, reglas, items, zip_origen_id, ruta_en_zip):
    sha = sha256_bytes(contenido)
    fila, nuevo = _upsert_archivo(con, sha, contenido, nombre, meta, zip_origen_id, ruta_en_zip, corrida_id)
    if not nuevo and fila["estado"] != "recibido" and not _toca_reprocesar(con, fila, meta):
        it = _item_desde_archivo_existente(con, fila, nombre, ruta_en_zip, catalogo)
        it.es_pieza_de_zip = zip_origen_id is not None
        items.append(it)
        _guardar_avisos(con, corrida_id, it)
        if fila["tipo_detectado"] == "zip":
            # el ZIP ya se abrió antes: sus piezas también son duplicados, no se re-procesan
            pass
        return
    sospecha = entrada.texto_sospechoso(nombre)
    if sospecha:
        _marcar(con, fila["id"], estado="sospechoso", tipo_detectado="desconocido",
                motivo="nombre de archivo con texto que parece una instrucción")
        evento(con, corrida_id, "rechazo", "SOSPECHOSO", "nombre con texto tipo instrucción", sha, {"fragmento": sospecha})
        items.append(Item(sha, nombre, ruta_en_zip, "desconocido", "sospechoso", "rechazados", archivo_id=fila["id"],
                          motivo="el nombre del archivo contiene texto que parece una instrucción; se apartó sin abrirlo",
                          instruccion="Revisen de dónde salió este archivo. Si es un estado de cuenta legítimo, súbanlo con otro nombre.",
                          es_pieza_de_zip=zip_origen_id is not None))
        return
    if entrada.es_zip(contenido):
        _marcar(con, fila["id"], estado="contenedor", tipo_detectado="zip")
        items.append(Item(sha, nombre, ruta_en_zip, "zip", "contenedor", "contenedor", archivo_id=fila["id"],
                          es_pieza_de_zip=zip_origen_id is not None))
        res = entrada.expandir_zip(contenido, nombre)
        for r in res.rechazos:
            evento(con, corrida_id, "rechazo", r["codigo"], r["motivo"], sha, {"pieza": r["nombre"]})
            items.append(Item(sha, r["nombre"], r["nombre"], "desconocido", "rechazado", "ninguna", archivo_id=fila["id"],
                              motivo=f"pieza del ZIP '{nombre}' apartada: {r['motivo']}", es_pieza_de_zip=True,
                              instruccion="Extraigan ese archivo y súbanlo suelto; si no es un estado de cuenta, ignórenlo."))
        piezas = [p for p in res.piezas if not entrada.es_zip(p.contenido)]  # las de ZIPs internos ya vienen aplanadas
        piezas.sort(key=lambda p: (_orden_pieza(p), p.ruta))
        for p in piezas:
            _procesar(con, p.contenido, p.nombre, meta, corrida_id, catalogo, reglas, items, fila["id"], p.ruta)
        return
    item = _procesar_documento(con, fila, contenido, nombre, meta, corrida_id, catalogo, reglas)
    item.ruta_en_zip = ruta_en_zip
    item.es_pieza_de_zip = zip_origen_id is not None
    items.append(item)
    _guardar_avisos(con, corrida_id, item)


def _guardar_avisos(con, corrida_id, item: Item) -> None:
    """Lo que sólo vivía en el manifiesto (avisos y la instrucción de un rechazo) queda también
    en corrida_eventos, para que el acuse y los reportes lo citen textual."""
    base = {"nombre": item.nombre_original, "periodo": item.periodo, "estado": item.estado,
            "cuenta": (item.cuenta or {}).get("mask")}
    for a in item.avisos or []:
        codigo = "NOMBRE_OTRO_PERIODO" if "el periodo sale de la pág. 1" in a else "AVISO"
        evento(con, corrida_id, "aviso", codigo, a, item.sha256, base)
    if item.instruccion:
        evento(con, corrida_id, "info", "INSTRUCCION", item.instruccion, item.sha256, {**base, "motivo": item.motivo})


def _toca_reprocesar(con, fila, meta) -> bool:
    """Reproceso explícito (inventario de originales): un archivo ya visto se vuelve a leer
    sólo si no tiene estado con el parser actual. El estado anterior se queda (regla 2);
    un duplicado subido al buzón nunca entra aquí porque el buzón no pide reproceso."""
    if not meta.get("reprocesar") or fila["estado"] == "sospechoso":
        return False
    if fila["tipo_detectado"] == "zip":
        return True   # se vuelve a abrir; cada pieza decide por su cuenta
    with con.cursor() as cur:
        cur.execute("SELECT 1 FROM bancos.estados WHERE archivo_id=%s AND parser_version=%s", (fila["id"], bbva.PARSER_VERSION))
        return cur.fetchone() is None


def identificar_cuenta(est, catalogo: Catalogo):
    """La cuenta sale del ENCABEZADO: primero el 'No. de Cuenta' / CLABE que leyó el parser,
    después el texto de la pág. 1 ANTES del detalle de movimientos. Nunca del detalle: ahí
    aparecen cuentas propias en los traspasos (un estado de Nómina menciona la General)."""
    num = re.sub(r"\D", "", est.numero_cuenta or "")
    if num:
        for c in catalogo.cuentas:
            if num == c.numero or num.lstrip("0") == c.numero.lstrip("0"):
                return c
    if est.clabe:
        for c in catalogo.cuentas:
            if c.clabe and c.clabe == est.clabe:
                return c
    t = est.texto_encabezado
    corte = re.search(r"Detalle\s+de\s+Movimientos", t, re.I)
    return catalogo.identificar(t[:corte.start()] if corte else t[:1500])


def _orden_pieza(p) -> int:
    """0 si el nombre del archivo coincide con el periodo impreso, 1 si no o no se sabe.
    Así, cuando un mismo mes viene dos veces en un ZIP, el que se queda como original es
    el que está bien nombrado y la copia mal nombrada queda como duplicado."""
    if not entrada.es_pdf(p.contenido):
        return 1
    pista = entrada.periodo_en_nombre(p.nombre)
    if not pista:
        return 1
    try:
        m = bbva.RE_PERIODO.search("\n".join(bbva.texto_paginas(p.contenido, max_paginas=2)))
    except Exception:
        return 1
    return 0 if m and f"{int(m.group(6)):04d}-{int(m.group(5)):02d}" == pista else 1


def _rechazo(con, fila, nombre, tipo, estado, motivo, instruccion, corrida_id, codigo, accion="rechazados", **extra):
    _marcar(con, fila["id"], estado=estado, tipo_detectado=tipo, motivo=motivo)
    evento(con, corrida_id, "rechazo", codigo, motivo, fila["sha256"])
    return Item(fila["sha256"], nombre, None, tipo, estado, accion, motivo=motivo, instruccion=instruccion,
                archivo_id=fila["id"], **extra)


def _procesar_documento(con, fila, contenido, nombre, meta, corrida_id, catalogo: Catalogo, reglas) -> Item:
    ext = os.path.splitext(nombre.lower())[1]
    if not entrada.es_pdf(contenido):
        # Jeeves y Payana se reconocen por CONTENIDO (encabezado del CSV, texto de la hoja), nunca por el nombre.
        if jeeves.es_csv_jeeves(contenido):
            return _procesar_csv_jeeves(con, fila, contenido, nombre, meta, corrida_id)
        if entrada.es_xlsx(contenido) or ext in (".csv", ".xlsx", ".xls", ".txt"):
            if _tabla_es_payana(contenido):
                return _payana_sin_parser(con, fila, nombre, corrida_id, "tabla")
            return _rechazo(con, fila, nombre, "tabla_desconocida", "formato_no_soportado",
                            "formato no soportado todavía (exportación CSV/XLSX sin parser de muestra)",
                            "No hay que hacer nada: el archivo quedó guardado y se leerá cuando exista el parser de este formato.",
                            corrida_id, "FORMATO_NO_SOPORTADO")
        return _rechazo(con, fila, nombre, "desconocido", "rechazado", "no es un PDF ni un ZIP",
                        "Suban el estado de cuenta en PDF (o un ZIP con los PDF).", corrida_id, "NO_ES_PDF")
    try:
        textos = bbva.texto_paginas(contenido, max_paginas=3)
    except Exception as e:  # pdfminer lanza distintas clases según el cifrado
        n = type(e).__name__
        causa = f"{n} {e!r} {e.__cause__!r} {e.__context__!r}".lower()
        if "password" in causa or "encrypt" in causa or b"/Encrypt" in contenido:
            return _rechazo(con, fila, nombre, "pdf", "rechazado", "PDF protegido con contraseña",
                            "Descarguen el estado sin contraseña desde el portal (o ábranlo e imprímanlo a PDF) y vuelvan a subirlo.",
                            corrida_id, "PDF_PROTEGIDO")
        return _rechazo(con, fila, nombre, "pdf", "rechazado", f"PDF dañado o ilegible ({n})",
                        "Vuelvan a descargar el PDF del portal del banco y súbanlo de nuevo.", corrida_id, "PDF_DANADO")
    texto = "\n".join(textos)
    if not texto.strip():
        return _rechazo(con, fila, nombre, "pdf", "rechazado", "PDF escaneado sin texto (imagen)",
                        "Descarguen el estado original del portal del banco; una foto o un escaneo no se puede validar al centavo.",
                        corrida_id, "PDF_SIN_TEXTO")
    sosp = entrada.texto_sospechoso(texto)
    if sosp:
        return _rechazo(con, fila, nombre, "pdf", "sospechoso", "el PDF contiene texto que parece una instrucción dirigida a un sistema",
                        "Revisen el origen del archivo; no se procesó.", corrida_id, "SOSPECHOSO", detalle={"fragmento": sosp})
    if jeeves.es_pdf_jeeves(texto):
        return _procesar_pdf_jeeves(con, fila, contenido, nombre, corrida_id)
    es_bbva = bool(re.search(r"BBVA", texto) and bbva.RE_PERIODO.search(texto))
    if not es_bbva:
        if jeeves.texto_payana(texto):
            return _payana_sin_parser(con, fila, nombre, corrida_id, "pdf")
        if re.search(r"JEEVES", texto, re.I):
            it = _rechazo(con, fila, nombre, "jeeves", "formato_no_soportado",
                          "PDF de Jeeves que no es el estado de cuenta mensual (no trae 'Statement Period' y 'Balance Detail')",
                          "Si es el estado de cuenta del ciclo, descárguenlo completo del portal de Jeeves y súbanlo de nuevo.",
                          corrida_id, "JEEVES_NO_ES_ESTADO", accion="copiar")
            it.carpeta_destino, it.nombre_destino = CARPETA_JEEVES, nombre
            return it
        if re.search(r"ESTADO\s+DE\s+CUENTA", texto, re.I):
            it = _rechazo(con, fila, nombre, "pdf_otro_banco", "formato_no_soportado",
                          "estado de cuenta de un banco sin parser (no es BBVA)", "Quedó en 'Otras cuentas por identificar'.",
                          corrida_id, "OTRO_BANCO", accion="otras")
            it.carpeta_destino, it.nombre_destino = CARPETA_OTRAS, nombre
            return it
        return _rechazo(con, fila, nombre, "pdf", "rechazado", "el PDF no es un estado de cuenta",
                        "Si lo subieron por error no hay que hacer nada; si es un estado de cuenta, descárguenlo del portal del banco.",
                        corrida_id, "NO_ES_ESTADO")
    # ── BBVA ──
    try:
        est = bbva.parsear(contenido)
    except bbva.ErrorParser as e:
        return _rechazo(con, fila, nombre, "bbva_estado", "rechazado", f"no se pudo leer el estado: {e.mensaje}",
                        "Revisen que sea el PDF original del portal BBVA (no una impresión parcial). Si lo es, avisen a Esteban: el formato cambió.",
                        corrida_id, e.codigo)
    cuenta = identificar_cuenta(est, catalogo)
    periodo = est.periodo
    avisos = list(est.avisos) + _aviso_nombre(nombre, periodo)
    if cuenta is None:
        rfc_ok = bool(rfc_fts()) and (est.rfc or "").upper() == rfc_fts()
        motivo = ("estado de una cuenta de FTS que no está registrada" if rfc_ok
                  else "el estado no es de una cuenta de Servicios FTS (RFC distinto)")
        mask = mascara(est.numero_cuenta or est.clabe)
        _marcar(con, fila["id"], estado="rechazado", tipo_detectado="bbva_estado", periodo=periodo, motivo=motivo,
                nombre_canonico=f"BBVA_Desconocida_{mask.strip('…')}_{periodo}.pdf")
        evento(con, corrida_id, "aviso", "CUENTA_NO_RECONOCIDA", motivo, fila["sha256"], {"cuenta": mask, "rfc_fts": rfc_ok})
        return Item(fila["sha256"], nombre, None, "bbva_estado", "rechazado", "otras", archivo_id=fila["id"],
                    carpeta_destino=CARPETA_OTRAS, nombre_destino=f"BBVA_{'FTS' if rfc_ok else 'Ajena'}_{mask.strip('…')}_{periodo}.pdf",
                    periodo=periodo, motivo=motivo, avisos=avisos,
                    instruccion="Se guardó en 'Otras cuentas por identificar'. Si es una cuenta de FTS, avisen a Esteban para darla de alta.")
    if est.moneda != cuenta.moneda:
        avisos.append(f"la moneda leída ({est.moneda}) no coincide con la de la cuenta ({cuenta.moneda}); manda la cuenta")
    huella = bbva.calcular_hashes(est, cuenta.numero)
    ok1, d1 = validar.v1(est)
    ok2, d2 = validar.v2(est)
    canonico = cuenta.nombre_canonico(periodo)
    with con.cursor() as cur:
        cur.execute("SELECT e.id, e.huella, e.archivo_id, a.nombre_canonico FROM bancos.estados e JOIN bancos.archivos a ON a.id=e.archivo_id "
                    "WHERE e.cuenta_id=%s AND e.periodo=%s AND e.parser_version=%s AND e.archivo_id<>%s ORDER BY e.id LIMIT 1",
                    (cuenta.id, periodo, bbva.PARSER_VERSION, fila["id"]))
        previo = cur.fetchone()
        cur.execute("""INSERT INTO bancos.estados (archivo_id, cuenta_id, periodo, periodo_inicio, periodo_fin, parser, parser_version,
                         moneda, saldo_inicial, saldo_final, total_cargos, num_cargos, total_abonos, num_abonos, comisiones, paginas,
                         num_movimientos, num_saldos_impresos, v1_ok, v1_detalle, v2_ok, v2_detalle, huella, corrida_id)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (archivo_id, parser_version) DO NOTHING RETURNING id""",
                    (fila["id"], cuenta.id, periodo, est.periodo_inicio, est.periodo_fin, est.parser, est.parser_version,
                     cuenta.moneda, est.saldo_inicial, est.saldo_final, est.resumen_total_cargos, est.resumen_num_cargos,
                     est.resumen_total_abonos, est.resumen_num_abonos, est.comisiones, _j(est.paginas), len(est.movimientos),
                     d2["saldos_impresos"], ok1, _j(d1), ok2, _j(d2), huella, corrida_id))
        r = cur.fetchone()
        if r is None:
            cur.execute("SELECT id FROM bancos.estados WHERE archivo_id=%s AND parser_version=%s", (fila["id"], bbva.PARSER_VERSION))
            r = cur.fetchone()
        estado_id = r["id"]
        for mv in est.movimientos:
            cur.execute("""INSERT INTO bancos.movimientos (estado_id, cuenta_id, renglon, pagina, fecha_operacion, fecha_liquidacion,
                             codigo, descripcion, referencia, contraparte, cargo, abono, saldo_operacion_impreso,
                             saldo_liquidacion_impreso, saldo_calculado, hash)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (estado_id, renglon) DO NOTHING RETURNING id""",
                        (estado_id, cuenta.id, mv.renglon, mv.pagina, mv.fecha_operacion, mv.fecha_liquidacion, mv.codigo,
                         mv.descripcion, mv.referencia, mv.contraparte, mv.cargo, mv.abono, mv.saldo_operacion_impreso,
                         mv.saldo_liquidacion_impreso, mv.saldo_calculado, mv.hash))
            rr = cur.fetchone()
            if rr:
                k = clasificar(mv, cuenta, catalogo, reglas, catalogo.externas_financiamiento)
                cur.execute("""INSERT INTO bancos.clasificacion (movimiento_id, version, categoria, subcategoria, contraparte,
                                 es_traspaso_interno, regla, origen_regla, confianza, corrida_id)
                               VALUES (%s,1,%s,%s,%s,%s,%s,%s,%s,%s)""",
                            (rr["id"], k.categoria, k.subcategoria, k.contraparte, k.es_traspaso_interno, k.regla,
                             k.origen_regla, k.confianza, corrida_id))
        if previo:
            mismo = previo["huella"] == huella
            cur.execute("""INSERT INTO bancos.duplicados_logicos (estado_id, duplicado_de, mismo_contenido, detalle)
                           VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
                        (estado_id, previo["id"], mismo, _j({"nombre": nombre})))
    base = {"cuenta": _cuenta_dict(cuenta), "periodo": periodo, "v1": ok1, "v2": ok2, "avisos": avisos,
            "archivo_id": fila["id"], "estado_id": estado_id,
            "detalle": {"saldo_inicial": str(est.saldo_inicial), "saldo_final": str(est.saldo_final),
                        "movimientos": len(est.movimientos), "saldos_impresos": d2["saldos_impresos"],
                        "cargos": [est.resumen_num_cargos, str(est.resumen_total_cargos)],
                        "abonos": [est.resumen_num_abonos, str(est.resumen_total_abonos)],
                        "paginas": est.num_paginas, "huella": huella}}
    if previo:
        mismo = previo["huella"] == huella
        if mismo:
            motivo = f"copia del mismo estado que '{previo['nombre_canonico']}' (mismos movimientos, otro archivo)"
        else:
            motivo = (f"conflicto de versión: ya existe {cuenta.banco} {cuenta.alias} {cuenta.mask} {periodo} "
                      f"('{previo['nombre_canonico']}') con movimientos distintos; no se sobrescribió")
        _marcar(con, fila["id"], estado="duplicado" if mismo else "rechazado", tipo_detectado="bbva_estado",
                cuenta_id=cuenta.id, periodo=periodo, motivo=motivo)
        evento(con, corrida_id, "aviso" if mismo else "rechazo", "DUPLICADO_LOGICO" if mismo else "CONFLICTO_VERSION", motivo, fila["sha256"])
        return Item(fila["sha256"], nombre, None, "bbva_estado", "duplicado" if mismo else "rechazado",
                    "duplicado" if mismo else "rechazados", motivo=motivo,
                    carpeta_destino=f"{BUZON}/Duplicados" if mismo else None, nombre_destino=nombre if mismo else None,
                    instruccion=None if mismo else "Hay dos estados distintos para el mismo mes y cuenta. Confirmen con el banco cuál es el bueno.",
                    **base)
    if not (ok1 and ok2):
        motivo = (d1.get("texto") if not ok1 else d2.get("texto")) or "no cuadra"
        _marcar(con, fila["id"], estado="no_cuadra", tipo_detectado="bbva_estado", cuenta_id=cuenta.id, periodo=periodo,
                motivo=motivo, nombre_canonico=canonico)
        evento(con, corrida_id, "rechazo", "NO_CUADRA", motivo, fila["sha256"])
        return Item(fila["sha256"], nombre, None, "bbva_estado", "no_cuadra", "rechazados", motivo=motivo,
                    nombre_destino=canonico,
                    instruccion="Vuelvan a descargar ese mes del portal BBVA (PDF original completo, todas las páginas) y súbanlo.",
                    **base)
    _marcar(con, fila["id"], estado="validado", tipo_detectado="bbva_estado", cuenta_id=cuenta.id, periodo=periodo,
            nombre_canonico=canonico, ruta_canonica=f"{cuenta.carpeta_anio(periodo)}/{canonico}", motivo=None)
    evento(con, corrida_id, "info", "VALIDADO", f"{cuenta.alias} {cuenta.mask} {periodo} V1/V2 ok", fila["sha256"])
    return Item(fila["sha256"], nombre, None, "bbva_estado", "validado", "copiar",
                carpeta_destino=cuenta.carpeta_anio(periodo), nombre_destino=canonico, **base)


# ── Jeeves (tarjeta de crédito) y Payana ──
def _tabla_es_payana(contenido: bytes) -> bool:
    """Payana en CSV/XLSX: por el texto de la hoja, nunca por el nombre."""
    if entrada.es_xlsx(contenido):
        import zipfile
        try:
            with zipfile.ZipFile(io.BytesIO(contenido)) as z:
                t = " ".join(z.read(n).decode("utf-8", "ignore") for n in z.namelist()
                             if n.startswith("xl/sharedStrings") or n.startswith("xl/worksheets/sheet1"))
        except Exception:
            return False
        return jeeves.texto_payana(t)
    return jeeves.texto_payana(contenido[:200000].decode("utf-8", "ignore"))


def _payana_sin_parser(con, fila, nombre, corrida_id, forma) -> Item:
    """Payana: se reconoce y se acomoda en su carpeta; el parser se construye cuando llegue un ejemplo real."""
    it = _rechazo(con, fila, nombre, "payana", "formato_no_soportado", "recibido, sin parser (Payana)",
                  "No hay que hacer nada: quedó guardado en la carpeta de Payana y se leerá cuando exista el lector de este formato.",
                  corrida_id, "PAYANA_SIN_PARSER", accion="copiar")
    it.carpeta_destino, it.nombre_destino = CARPETA_PAYANA, nombre
    it.detalle = {"forma": forma}
    return it


def _nombre_libre(con, nombre: str) -> str:
    """Si ya hay un archivo con ese nombre canónico (dos descargas del mismo día con contenido distinto), agrega _2, _3…"""
    base, ext = os.path.splitext(nombre)
    cand, n = nombre, 1
    with con.cursor() as cur:
        while True:
            cur.execute("SELECT 1 FROM bancos.archivos WHERE nombre_canonico=%s", (cand,))
            if not cur.fetchone():
                return cand
            n += 1
            cand = f"{base}_{n}{ext}"


def _procesar_pdf_jeeves(con, fila, contenido, nombre, corrida_id) -> Item:
    try:
        est = jeeves.parsear(contenido)
    except jeeves.ErrorJeeves as e:
        return _rechazo(con, fila, nombre, "jeeves", "rechazado", f"no se pudo leer el estado de Jeeves: {e.mensaje}",
                        "Descarguen de nuevo el estado del ciclo desde el portal de Jeeves (PDF completo) y súbanlo.",
                        corrida_id, e.codigo)
    ciclo = est.ciclo
    avisos = list(est.avisos)
    if not est.razon_social_fts:
        motivo = "estado de Jeeves de otra razón social (no dice Servicios FTS)"
        _marcar(con, fila["id"], estado="rechazado", tipo_detectado="jeeves", periodo=ciclo, motivo=motivo)
        evento(con, corrida_id, "aviso", "JEEVES_OTRA_RAZON_SOCIAL", motivo, fila["sha256"])
        return Item(fila["sha256"], nombre, None, "jeeves", "rechazado", "otras", archivo_id=fila["id"],
                    carpeta_destino=CARPETA_OTRAS, nombre_destino=f"Jeeves_Ajena_{ciclo}.pdf", periodo=ciclo, motivo=motivo,
                    instruccion="Se guardó en 'Otras cuentas por identificar'. Si sí es de FTS, avisen a Esteban.")
    ok1, d1 = jeeves.v1(est)
    h = jeeves.huella(est)
    canonico = jeeves.nombre_pdf(est)
    carpeta = f"{CARPETA_JEEVES}/{ciclo[:4]}"
    r = est.resumen
    with con.cursor() as cur:
        cur.execute("""SELECT c.id, c.huella, a.nombre_canonico FROM bancos.jeeves_ciclos_vigentes c
                       JOIN bancos.archivos a ON a.id=c.archivo_id
                       WHERE c.ciclo=%s AND c.archivo_id<>%s AND a.estado='validado' ORDER BY c.id LIMIT 1""", (ciclo, fila["id"]))
        previo = cur.fetchone()
        cur.execute("""INSERT INTO bancos.jeeves_ciclos (archivo_id, parser_version, ciclo, statement_date, periodo_inicio, periodo_fin,
                         billing_method, razon_social_fts, previous_balance, payments, cashback, new_charges, late_fee, pay_fee,
                         adjustment, amount_due, paginas, num_renglones, v1_ok, v1_detalle, huella, corrida_id)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (archivo_id, parser_version) DO NOTHING RETURNING id""",
                    (fila["id"], est.parser_version, ciclo, est.statement_date, est.periodo_inicio, est.periodo_fin, est.billing_method,
                     est.razon_social_fts, r["previous_balance"], r["payments"], r["cashback"], r["new_charges"], r["late_fee"],
                     r["pay_fee"], r["adjustment"], r["amount_due"], est.paginas, len(est.renglones), ok1, _j(d1), h, corrida_id))
        nuevo = cur.fetchone()
        if nuevo:
            for x in est.renglones:
                hx = sha256_bytes(f"{ciclo}|{x.pagina}|{x.renglon}|{x.fecha}|{x.tarjeta}|{x.monto_mxn}|{x.tipo}".encode())
                cur.execute("""INSERT INTO bancos.jeeves_movimientos_pdf (ciclo_id, pagina, renglon, fecha, fecha_hora, usuario, comercio,
                                 tarjeta, monto_mxn, monto_usd, tipo, hash) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                            (nuevo["id"], x.pagina, x.renglon, x.fecha, x.fecha_hora, x.usuario[:200] or None, x.comercio[:300] or None,
                             x.tarjeta, x.monto_mxn, x.monto_usd, x.tipo, hx))
    base = {"periodo": ciclo, "v1": ok1, "avisos": avisos, "archivo_id": fila["id"],
            "detalle": {"renglones": len(est.renglones), "paginas": est.paginas, "huella": h, "v1": d1.get("texto")}}
    if previo:
        mismo = previo["huella"] == h
        motivo = (f"copia del mismo estado que '{previo['nombre_canonico']}' (mismos renglones, otro archivo)" if mismo else
                  f"conflicto de versión: ya existe el estado de Jeeves {ciclo} ('{previo['nombre_canonico']}') con renglones distintos; no se sobrescribió")
        _marcar(con, fila["id"], estado="duplicado" if mismo else "rechazado", tipo_detectado="jeeves", periodo=ciclo, motivo=motivo)
        evento(con, corrida_id, "aviso" if mismo else "rechazo", "DUPLICADO_LOGICO" if mismo else "CONFLICTO_VERSION", motivo, fila["sha256"])
        return Item(fila["sha256"], nombre, None, "jeeves", "duplicado" if mismo else "rechazado", "duplicado" if mismo else "rechazados",
                    motivo=motivo, carpeta_destino=f"{BUZON}/Duplicados" if mismo else None, nombre_destino=nombre if mismo else None,
                    instruccion=None if mismo else "Hay dos estados distintos de Jeeves para el mismo ciclo. Confirmen en el portal cuál es el bueno.",
                    **base)
    if not ok1:
        motivo = d1.get("texto") or "no cuadra"
        _marcar(con, fila["id"], estado="no_cuadra", tipo_detectado="jeeves", periodo=ciclo, motivo=motivo, nombre_canonico=canonico)
        evento(con, corrida_id, "rechazo", "NO_CUADRA", motivo, fila["sha256"])
        return Item(fila["sha256"], nombre, None, "jeeves", "no_cuadra", "rechazados", motivo=motivo, nombre_destino=canonico,
                    instruccion="Vuelvan a descargar el estado de ese ciclo del portal de Jeeves (PDF completo, todas las páginas) y súbanlo.",
                    **base)
    _marcar(con, fila["id"], estado="validado", tipo_detectado="jeeves", periodo=ciclo, nombre_canonico=canonico,
            ruta_canonica=f"{carpeta}/{canonico}", motivo=None)
    evento(con, corrida_id, "info", "VALIDADO", f"Jeeves {ciclo} V1 ok", fila["sha256"])
    return Item(fila["sha256"], nombre, None, "jeeves", "validado", "copiar", carpeta_destino=carpeta, nombre_destino=canonico, **base)


def _tarjetas_conocidas(con) -> set[str]:
    """Tarjetas (últimos 4) de estados de Jeeves validados de Servicios FTS."""
    with con.cursor() as cur:
        cur.execute("""SELECT DISTINCT m.tarjeta FROM bancos.jeeves_movimientos_pdf m
                       JOIN bancos.jeeves_ciclos c ON c.id=m.ciclo_id JOIN bancos.archivos a ON a.id=c.archivo_id
                       WHERE a.estado IN ('validado','duplicado') AND c.razon_social_fts AND m.tarjeta IS NOT NULL""")
        return {r["tarjeta"] for r in cur.fetchall()}


def _procesar_csv_jeeves(con, fila, contenido, nombre, meta, corrida_id) -> Item:
    try:
        x = jeeves.parsear_csv(contenido)
    except jeeves.ErrorJeeves as e:
        return _rechazo(con, fila, nombre, "jeeves_csv", "rechazado", f"no se pudo leer el CSV de Jeeves: {e.mensaje}",
                        "Descarguen de nuevo el CSV del año desde el portal de Jeeves y súbanlo sin abrirlo ni editarlo.", corrida_id, e.codigo)
    if not x.filas or not x.anio:
        return _rechazo(con, fila, nombre, "jeeves_csv", "rechazado", "el CSV de Jeeves no trae transacciones",
                        "Revisen el filtro de fechas en el portal (un año completo) y descárguenlo de nuevo.", corrida_id, "CSV_VACIO")
    avisos = list(x.avisos)
    tarjetas = {t["tarjeta"] for t in x.filas if t.get("tarjeta")}
    if x.empresa:
        es_fts, forma = jeeves.razon_social_fts(x.empresa), "columna"
    else:
        conocidas = _tarjetas_conocidas(con)
        if conocidas:
            es_fts, forma = bool(tarjetas & conocidas), "tarjetas"
        else:
            es_fts, forma = True, "sin_verificar"
            avisos.append("el CSV no trae la razón social y todavía no hay un estado de Jeeves validado con qué comparar las tarjetas: "
                          "se toma como de Servicios FTS y V2 lo confirma contra el PDF del ciclo")
    if not es_fts:
        motivo = "CSV de Jeeves de otra razón social (ninguna tarjeta coincide con las de Servicios FTS)"
        _marcar(con, fila["id"], estado="rechazado", tipo_detectado="jeeves_csv", motivo=motivo)
        evento(con, corrida_id, "aviso", "JEEVES_OTRA_RAZON_SOCIAL", motivo, fila["sha256"])
        return Item(fila["sha256"], nombre, None, "jeeves_csv", "rechazado", "otras", archivo_id=fila["id"],
                    carpeta_destino=CARPETA_OTRAS, nombre_destino=f"Jeeves_Transacciones_Ajena_{x.anio}.csv", motivo=motivo,
                    instruccion="Se guardó en 'Otras cuentas por identificar'. Si sí es de FTS, avisen a Esteban.")
    descarga, fuente_fecha = jeeves.fecha_descarga(nombre, meta.get("subido_at"))
    canonico = _nombre_libre(con, jeeves.nombre_csv(x.anio, descarga))
    carpeta = f"{CARPETA_JEEVES}/{x.anio}"
    uids = [t["unique_id"] for t in x.filas]
    with con.cursor() as cur:
        cur.execute("SELECT unique_id, version_hash FROM bancos.jeeves_transacciones WHERE unique_id = ANY(%s)", (uids,))
        existentes: dict[str, set] = {}
        for r in cur.fetchall():
            existentes.setdefault(r["unique_id"], set()).add(r["version_hash"])
        nuevas = versiones = repetidas = 0
        a_insertar, vistos = [], set()
        for t in x.filas:
            clave = (t["unique_id"], t["version_hash"])
            if clave in vistos:
                continue
            vistos.add(clave)
            if t["unique_id"] not in existentes:
                nuevas += 1
                a_insertar.append(t)
            elif t["version_hash"] not in existentes[t["unique_id"]]:
                versiones += 1
                a_insertar.append(t)
            else:
                repetidas += 1
        cur.execute("""INSERT INTO bancos.jeeves_csv_cargas (archivo_id, parser_version, anio, fecha_descarga, fecha_de, columnas, filas,
                         nuevas, versiones_nuevas, repetidas, razon_social, avisos, corrida_id)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (archivo_id) DO NOTHING RETURNING id""",
                    (fila["id"], jeeves.CSV_VERSION, x.anio, descarga, fuente_fecha, x.columnas, len(x.filas), nuevas, versiones,
                     repetidas, forma, _j(avisos), corrida_id))
        carga = cur.fetchone()
        if carga:
            for t in a_insertar:
                cur.execute("""INSERT INTO bancos.jeeves_transacciones (unique_id, version_hash, carga_id, fecha_descarga, renglon_csv, tipo,
                                 credit_debit, transaction_type, sub_transaction_type, created_at_utc, posted_at_utc, usuario, usuario_email,
                                 status, monto_origen, moneda_origen, monto_mxn, monto_firmado, tipo_cambio, fx_fees, payment_description,
                                 memo, payee, categoria, tiene_comprobante, comprobantes, tarjeta_nombre, tarjeta, tarjeta_tipo, sat_uuid,
                                 sat_uuid_valido, sat_subtotal, sat_tax, sat_total, sat_emisor_rfc, sat_emisor_nombre, sat_status, extra)
                               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                               ON CONFLICT (unique_id, version_hash) DO NOTHING""",
                            (t["unique_id"], t["version_hash"], carga["id"], descarga, t["renglon_csv"], t["tipo"], t["credit_debit"],
                             t["transaction_type"], t["sub_transaction_type"], t["created_at"], t["posted_at"], t["usuario"],
                             t["usuario_email"], t["status"], t["monto_origen"], t["moneda_origen"], t["monto_mxn"], t["monto_firmado"],
                             t["tipo_cambio"], t["fx_fees"], t["payment_description"], t["memo"], t["payee"], t["categoria"],
                             t["tiene_comprobante"], t["comprobantes"], t["tarjeta_nombre"], t["tarjeta"], t["tarjeta_tipo"], t["sat_uuid"],
                             t["sat_uuid_valido"], t["sat_subtotal"], t["sat_tax"], t["sat_total"], t["sat_emisor_rfc"],
                             t["sat_emisor_nombre"], t["sat_status"], _j(t["extra"])))
    _marcar(con, fila["id"], estado="validado", tipo_detectado="jeeves_csv", nombre_canonico=canonico,
            ruta_canonica=f"{carpeta}/{canonico}", motivo=None)
    evento(con, corrida_id, "info", "VALIDADO", f"Jeeves CSV {x.anio}: {nuevas} nuevas, {versiones} con cambios, {repetidas} repetidas",
           fila["sha256"], {"anio": x.anio, "descarga": str(descarga)})
    for a in avisos:
        evento(con, corrida_id, "aviso", "AVISO", a, fila["sha256"])
    return Item(fila["sha256"], nombre, None, "jeeves_csv", "validado", "copiar", carpeta_destino=carpeta, nombre_destino=canonico,
                archivo_id=fila["id"], periodo=f"{x.anio}-12", avisos=avisos,
                detalle={"anio": x.anio, "descarga": str(descarga), "fecha_de": fuente_fecha, "filas": len(x.filas), "nuevas": nuevas,
                         "versiones_nuevas": versiones, "repetidas": repetidas, "columnas": x.columnas, "razon_social": forma})


# ── Jeeves: V2 (CSV contra PDF), V3 (continuidad) y V4 (pagos contra BBVA), al cerrar la corrida ──
PATRON_FONDEO_JEEVES = r"JE+V+E+[SD]"      # el mismo de bancos.reglas_edo_resultados (excluir_fondeo_jeeves)
TIPOS_V2 = ("consumo", "devolucion", "pago", "cargo_jeeves", "ajuste")
VENTANA_V4_DIAS = 3


def _ultima_validacion(cur, ciclo, prueba):
    cur.execute("SELECT resultado, diferencia, detalle FROM bancos.jeeves_validaciones WHERE ciclo=%s AND prueba=%s ORDER BY id DESC LIMIT 1",
                (ciclo, prueba))
    return cur.fetchone()


def _registrar_validacion(cur, ciclo, prueba, resultado, ciclo_id, diferencia, detalle, corrida_id) -> bool:
    prev = _ultima_validacion(cur, ciclo, prueba)
    det = json.loads(_j(detalle))
    if prev and prev["resultado"] == resultado and prev["diferencia"] == diferencia and prev["detalle"] == det:
        return False
    cur.execute("""INSERT INTO bancos.jeeves_validaciones (ciclo, prueba, resultado, ciclo_id, diferencia, detalle, corrida_id)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""", (ciclo, prueba, resultado, ciclo_id, diferencia, _j(detalle), corrida_id))
    return True


def _emparejar(a: list[dict], b: list[dict], dias: int) -> tuple[list, list, list]:
    """Empareja por tipo, monto exacto y tarjeta (si ambas la traen), con la fecha más cercana dentro de ±dias."""
    libres = list(b)
    pares, solo_a = [], []
    for x in sorted(a, key=lambda r: (str(r.get("fecha")), str(r.get("monto")))):
        cands = [y for y in libres if y["tipo"] == x["tipo"] and y["monto"] == x["monto"]
                 and (not x.get("tarjeta") or not y.get("tarjeta") or x["tarjeta"] == y["tarjeta"])
                 and (x.get("fecha") is None or y.get("fecha") is None or abs((x["fecha"] - y["fecha"]).days) <= dias)]
        if cands:
            y = min(cands, key=lambda y: abs((x["fecha"] - y["fecha"]).days) if x.get("fecha") and y.get("fecha") else 0)
            libres.remove(y)
            pares.append((x, y))
        else:
            solo_a.append(x)
    return pares, solo_a, libres


def jeeves_validar(con, corrida_id) -> dict:
    res = {"ciclos": 0, "v2": {}, "v3": {}, "v4": {}}
    with con.cursor() as cur:
        cur.execute("SELECT * FROM bancos.v_jeeves_ciclos ORDER BY ciclo")
        ciclos = cur.fetchall()
        if not ciclos:
            return res
        res["ciclos"] = len(ciclos)
        try:
            cur.execute("SAVEPOINT patron")
            cur.execute("SELECT patron FROM bancos.reglas_edo_resultados WHERE destino='excluir_fondeo_jeeves' AND activa ORDER BY prioridad LIMIT 1")
            r = cur.fetchone()
            patron = r["patron"] if r else PATRON_FONDEO_JEEVES
            cur.execute("RELEASE SAVEPOINT patron")
        except Exception:
            cur.execute("ROLLBACK TO SAVEPOINT patron")
            patron = PATRON_FONDEO_JEEVES
        # BBVA: cargos a Jeeves en estados validados, y los días que la base cubre
        cur.execute("""SELECT m.id, m.fecha_operacion AS fecha, m.cargo AS monto, e.periodo_inicio, e.periodo_fin
                       FROM bancos.movimientos m JOIN bancos.estados_vigentes e ON e.id=m.estado_id
                       JOIN bancos.archivos a ON a.id=e.archivo_id
                       WHERE a.estado='validado' AND m.cargo > 0 AND m.descripcion ~* %s""", (patron,))
        fondeos = [{"id": r["id"], "fecha": r["fecha"], "monto": r["monto"], "tipo": "pago", "tarjeta": None} for r in cur.fetchall()]
        cur.execute("""SELECT DISTINCT e.periodo_inicio, e.periodo_fin FROM bancos.estados_vigentes e JOIN bancos.archivos a ON a.id=e.archivo_id
                       JOIN bancos.cuentas c ON c.id=e.cuenta_id WHERE a.estado='validado' AND c.moneda='MXN'""")
        cubiertos = [(r["periodo_inicio"], r["periodo_fin"]) for r in cur.fetchall()]
        cur.execute("SELECT * FROM bancos.v_jeeves_transacciones WHERE posted_at_utc IS NOT NULL")
        trans = cur.fetchall()
        anios_csv = {t["anio"] for t in trans}
        por_ciclo = {c["ciclo"]: c for c in ciclos}
        for c in ciclos:
            ciclo, ini, fin = c["ciclo"], c["periodo_inicio"], c["periodo_fin"]
            cur.execute("SELECT * FROM bancos.v_jeeves_movimientos_pdf WHERE ciclo=%s ORDER BY pagina, renglon", (ciclo,))
            pdf = [{"id": m["movimiento_id"], "fecha": m["fecha"], "monto": m["monto_mxn"], "tipo": m["tipo"], "tarjeta": m["tarjeta"],
                    "pagina": m["pagina"], "renglon": m["renglon"]} for m in cur.fetchall()]
            # ── V2 ──
            del_ciclo = [t for t in trans if ini <= t["posted_mty"].date() <= fin]
            if not del_ciclo and not (ini.year in anios_csv or fin.year in anios_csv):
                cambio = _registrar_validacion(cur, ciclo, "V2", "pendiente", c["ciclo_id"], None,
                                               {"texto": f"falta el CSV de {fin.year}"}, corrida_id)
                res["v2"][ciclo] = "pendiente"
            else:
                csvs = [{"id": t["unique_id"], "fecha": t["posted_mty"].date(), "monto": t["monto_firmado"], "tipo": t["tipo"],
                         "tarjeta": t["tarjeta"]} for t in del_ciclo if t["monto_firmado"] is not None]
                tipos_csv = {x["tipo"] for x in csvs}
                comparables = [t for t in TIPOS_V2 if t in ("consumo", "devolucion", "pago") or t in tipos_csv]
                por_tipo, dif_total = {}, Decimal("0")
                for tp in comparables:
                    sp = sum((x["monto"] for x in pdf if x["tipo"] == tp), Decimal("0"))
                    sc = sum((x["monto"] for x in csvs if x["tipo"] == tp), Decimal("0"))
                    por_tipo[tp] = {"pdf": str(sp), "csv": str(sc), "diferencia": str(sc - sp)}
                    dif_total += abs(sc - sp)
                ok = dif_total == 0
                det = {"por_tipo": por_tipo, "csv_transacciones": len(csvs)}
                if not ok:
                    pares, solo_pdf, solo_csv = _emparejar([x for x in pdf if x["tipo"] in comparables],
                                                           [x for x in csvs if x["tipo"] in comparables], 5)
                    det["solo_en_pdf"] = [{k: str(v) for k, v in x.items()} for x in solo_pdf][:200]
                    det["solo_en_csv"] = [{k: str(v) for k, v in x.items()} for x in solo_csv][:200]
                _registrar_validacion(cur, ciclo, "V2", "ok" if ok else "falla", c["ciclo_id"], dif_total, det, corrida_id)
                res["v2"][ciclo] = "ok" if ok else "falla"
            # ── V3: el Amount Due del ciclo anterior es el Previous Balance de éste ──
            ant = por_ciclo.get(periodo_anterior(ciclo))
            if ant is None:
                primero = ciclo == min(por_ciclo)
                _registrar_validacion(cur, ciclo, "V3", "no_aplica", c["ciclo_id"], None,
                                      {"texto": "primer ciclo en la base" if primero else f"falta el ciclo {periodo_anterior(ciclo)}"}, corrida_id)
                res["v3"][ciclo] = "no_aplica"
            else:
                dif = c["previous_balance"] - ant["amount_due"]
                _registrar_validacion(cur, ciclo, "V3", "ok" if dif == 0 else "falla", c["ciclo_id"], dif,
                                      {"anterior": ant["ciclo"]}, corrida_id)
                res["v3"][ciclo] = "ok" if dif == 0 else "falla"
            # ── V4: cada pago a Jeeves tiene su cargo en BBVA (mismo monto, ±3 días) y viceversa ──
            pagos = [dict(x, monto=-x["monto"], origen="pdf") for x in pdf if x["tipo"] == "pago"]
            csv_pagos = [{"id": t["unique_id"], "fecha": t["posted_mty"].date(), "monto": -t["monto_firmado"], "tipo": "pago",
                          "tarjeta": None, "origen": "csv"} for t in del_ciclo if t["tipo"] == "pago" and t["monto_firmado"] is not None]
            _, csv_extra, _ = _emparejar(csv_pagos, [dict(p) for p in pagos], VENTANA_V4_DIAS)   # los del CSV que no están en el PDF
            pagos_todos = pagos + csv_extra
            ventana_ini, ventana_fin = ini - timedelta(days=VENTANA_V4_DIAS), fin + timedelta(days=VENTANA_V4_DIAS)
            cubierto = any(a <= ini and b >= fin for a, b in cubiertos) or \
                all(any(a <= d <= b for a, b in cubiertos) for d in [p["fecha"] for p in pagos_todos if p.get("fecha")])
            fond = [dict(f) for f in fondeos if ini <= f["fecha"] <= fin or
                    any(abs((f["fecha"] - p["fecha"]).days) <= VENTANA_V4_DIAS for p in pagos_todos if p.get("fecha"))]
            pares, sin_bbva, bbva_sin = _emparejar([dict(p, tarjeta=None) for p in pagos_todos], fond, VENTANA_V4_DIAS)
            bbva_sin = [f for f in bbva_sin if ini <= f["fecha"] <= fin]
            if not cubierto and sin_bbva:
                resultado = "pendiente"
            else:
                resultado = "ok" if not sin_bbva and not bbva_sin else "falla"
            det = {"pagos": len(pagos_todos), "emparejados": len(pares),
                   "pago_sin_cargo_en_bbva": [{k: str(v) for k, v in x.items()} for x in sin_bbva],
                   "cargo_bbva_sin_pago_en_jeeves": [{k: str(v) for k, v in x.items()} for x in bbva_sin],
                   "bbva_cubre_el_ciclo": cubierto}
            dif = sum((x["monto"] for x in sin_bbva), Decimal("0")) - sum((x["monto"] for x in bbva_sin), Decimal("0"))
            _registrar_validacion(cur, ciclo, "V4", resultado, c["ciclo_id"], dif, det, corrida_id)
            res["v4"][ciclo] = resultado
    return res


# ── cierre de corrida: pares de traspasos, V3, huecos ──
def emparejar_db(con, corrida_id, catalogo: Catalogo) -> int:
    from types import SimpleNamespace
    with con.cursor() as cur:
        cur.execute("""SELECT m.*, c.categoria, c.subcategoria, c.contraparte, c.es_traspaso_interno, c.regla, c.origen_regla,
                              c.confianza, c.version, c.par_traspaso_id
                       FROM bancos.movimientos m JOIN bancos.clasificacion_vigente c ON c.movimiento_id=m.id
                       JOIN bancos.estados_vigentes e ON e.id=m.estado_id JOIN bancos.archivos a ON a.id=e.archivo_id
                       WHERE c.es_traspaso_interno AND c.par_traspaso_id IS NULL AND a.estado='validado'
                       ORDER BY m.fecha_operacion, m.cuenta_id, m.renglon, m.id""")
        filas = cur.fetchall()
        cur.execute("""SELECT m.id FROM bancos.movimientos m JOIN bancos.clasificacion_vigente c ON c.movimiento_id=m.id
                       WHERE c.par_traspaso_id IS NOT NULL""")
    por_id = {c.id: c for c in catalogo.cuentas}
    items = []
    from .clasificar import Clasif
    for f in filas:
        cta = por_id.get(f["cuenta_id"])
        if not cta:
            continue
        mv = SimpleNamespace(id=f["id"], fecha_operacion=f["fecha_operacion"], cargo=f["cargo"], abono=f["abono"],
                             renglon=f["id"], referencia=f["referencia"], descripcion=f["descripcion"])
        otras = [c for c in catalogo.propias_en_texto(f"{f['descripcion']} {f['referencia'] or ''}") if c.numero != cta.numero]
        k = Clasif(f["categoria"], f["subcategoria"], f["contraparte"], True, f["regla"], f["origen_regla"], f["confianza"],
                   destino_propio=otras[0].clave if otras else None)
        k.version = f["version"]
        items.append((mv, cta, k))
    n = emparejar(items)
    with con.cursor() as cur:
        for mv, cta, k in items:
            if k.par is not None:
                cur.execute("""INSERT INTO bancos.clasificacion (movimiento_id, version, categoria, subcategoria, contraparte,
                                 es_traspaso_interno, par_traspaso_id, regla, origen_regla, confianza, corrida_id)
                               VALUES (%s,%s,%s,%s,%s,true,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
                            (mv.id, k.version + 1, k.categoria, k.subcategoria, k.contraparte, k.par.id,
                             (k.regla or "") + "+par", k.origen_regla, Decimal("1.000"), corrida_id))
    return n


def periodo_limite(hoy: date | None = None) -> str:
    """Último mes que ya se puede exigir: el mes que cerró, pero sólo a partir del día 3
    (antes del 3 el banco puede no haber emitido el estado)."""
    hoy = hoy or date.today()
    ultimo = periodo_anterior(f"{hoy.year:04d}-{hoy.month:02d}")
    return ultimo if hoy.day >= 3 else periodo_anterior(ultimo)


def v3_y_huecos(con, corrida_id, catalogo: Catalogo, hoy: date | None = None) -> dict:
    """V3 (continuidad) para cada estado validado y huecos por cuenta.
    Un hueco es un mes faltante entre el primero esperado y el último mes cerrado.
    El primero esperado es el mayor entre BANCOS_PERIODO_INICIO y el mes de apertura de la
    cuenta (bancos.cuentas.apertura, un dato con su evidencia): una cuenta no debe meses de
    antes de existir."""
    inicio = os.environ.get("BANCOS_PERIODO_INICIO", "2024-01")
    limite = periodo_limite(hoy)
    resumen = {"cuentas": {}, "huecos_abiertos": 0, "v3_ok": 0, "v3_fallas": 0, "v3_no_aplica": 0}
    with con.cursor() as cur:
        for c in catalogo.cuentas:
            if c.tipo != "cuenta":
                continue
            cur.execute("""SELECT DISTINCT ON (e.periodo) e.id, e.periodo, e.saldo_inicial, e.saldo_final, a.nombre_canonico
                           FROM bancos.estados_vigentes e JOIN bancos.archivos a ON a.id=e.archivo_id
                           WHERE e.cuenta_id=%s AND a.estado='validado' ORDER BY e.periodo, e.id""", (c.id,))
            ests = {r["periodo"]: r for r in cur.fetchall()}
            # to_jsonb: tolera una base sin la columna (migración bancos_0013 aún no aplicada)
            cur.execute("SELECT to_jsonb(c)->>'apertura' AS apertura FROM bancos.cuentas c WHERE c.id=%s", (c.id,))
            r_ap = cur.fetchone()
            apertura = (r_ap or {}).get("apertura")
            inicio_c = max(inicio, apertura[:7]) if apertura else inicio
            esperados = rango_periodos(inicio_c, limite)
            faltan = [p for p in esperados if p not in ests]
            # V3 por estado
            descuadres = set()
            for p, e in sorted(ests.items()):
                ant = ests.get(periodo_anterior(p))
                if ant is None:
                    res = "primero" if p <= inicio_c else "sin_anterior"
                    dif = None
                    # busca el último estado anterior para medir el hueco
                    previos = [q for q in ests if q < p]
                    if previos and res == "sin_anterior":
                        q = max(previos)
                        dif = e["saldo_inicial"] - ests[q]["saldo_final"]
                        res = "hueco"
                else:
                    dif = e["saldo_inicial"] - ant["saldo_final"]
                    res = "ok" if dif == 0 else "descuadre"
                cur.execute("""SELECT resultado, diferencia FROM bancos.validaciones_v3 WHERE estado_id=%s ORDER BY id DESC LIMIT 1""",
                            (e["id"],))
                prev = cur.fetchone()
                if not prev or prev["resultado"] != res or prev["diferencia"] != dif:
                    cur.execute("""INSERT INTO bancos.validaciones_v3 (estado_id, resultado, estado_anterior_id, diferencia, detalle, corrida_id)
                                   VALUES (%s,%s,%s,%s,%s,%s)""",
                                (e["id"], res, ant["id"] if ant else None, dif,
                                 _j({"periodo": p, "anterior": periodo_anterior(p)}), corrida_id))
                if res in ("ok", "primero"):
                    resumen["v3_ok"] += 1
                elif res == "descuadre":   # la única falla real: los dos meses existen y no encadenan
                    resumen["v3_fallas"] += 1
                else:                      # hueco / sin_anterior: no aplica, el hueco queda registrado
                    resumen["v3_no_aplica"] += 1
                if res == "descuadre":
                    descuadres.add(p)
                    _hueco(cur, c.id, p, "continuidad", dif, {"texto": f"el saldo inicial de {p} no es el final de {periodo_anterior(p)}"})
            # huecos por mes faltante, con el monto que falta explicar
            for p in faltan:
                previos = [q for q in ests if q < p]
                siguientes = [q for q in ests if q > p]
                dif = None
                if previos and siguientes:
                    dif = ests[min(siguientes)]["saldo_inicial"] - ests[max(previos)]["saldo_final"]
                _hueco(cur, c.id, p, "faltante", dif,
                       {"entre": [max(previos) if previos else None, min(siguientes) if siguientes else None]})
            # resolver huecos cubiertos
            cur.execute("""SELECT id, periodo, motivo FROM bancos.huecos WHERE cuenta_id=%s AND resuelto_en IS NULL""", (c.id,))
            for h in cur.fetchall():
                cubierto = h["motivo"] == "faltante" and h["periodo"] in ests
                # un mes de antes de la apertura nunca se debió: se cierra con la nota, no se borra
                if h["motivo"] == "faltante" and h["periodo"] < inicio_c and h["periodo"] not in ests:
                    cur.execute("""UPDATE bancos.huecos SET resuelto_en=now(),
                                   detalle = coalesce(detalle, '{}'::jsonb) || %s::jsonb WHERE id=%s""",
                                (_j({"resuelto": f"antes de la apertura de la cuenta ({apertura})"}), h["id"]))
                    continue
                # un descuadre que ya no existe (p. ej. el mes anterior era de otra cuenta y se reidentificó)
                ya_cuadra = h["motivo"] == "continuidad" and h["periodo"] not in descuadres
                if cubierto or ya_cuadra:
                    cur.execute("UPDATE bancos.huecos SET resuelto_en=now(), resuelto_por_estado_id=%s WHERE id=%s",
                                (ests[h["periodo"]]["id"] if h["periodo"] in ests else None, h["id"]))
            cur.execute("SELECT count(*) AS n FROM bancos.huecos WHERE cuenta_id=%s AND resuelto_en IS NULL", (c.id,))
            n = cur.fetchone()["n"]
            resumen["cuentas"][c.clave] = {"alias": c.alias, "mask": c.mask, "estados": len(ests), "faltantes": faltan, "huecos_abiertos": n}
            resumen["huecos_abiertos"] += n
    return resumen


def _hueco(cur, cuenta_id, periodo, motivo, dif, detalle):
    cur.execute("""INSERT INTO bancos.huecos (cuenta_id, periodo, motivo, monto_diferencia, detalle)
                   VALUES (%s,%s,%s,%s,%s)
                   ON CONFLICT (cuenta_id, periodo, motivo) DO UPDATE
                   SET monto_diferencia=EXCLUDED.monto_diferencia, detalle=EXCLUDED.detalle,
                       resuelto_en=NULL, resuelto_por_estado_id=NULL
                   WHERE bancos.huecos.monto_diferencia IS DISTINCT FROM EXCLUDED.monto_diferencia
                      OR bancos.huecos.detalle IS DISTINCT FROM EXCLUDED.detalle
                      -- un hueco que se dio por resuelto y el mes vuelve a faltar (p. ej. el estado que
                      -- lo cubría era de otra cuenta y se reidentificó) se REABRE
                      OR bancos.huecos.resuelto_en IS NOT NULL""",
                (cuenta_id, periodo, motivo, dif, _j(detalle)))


def cerrar_corrida(con, corrida_id: int, catalogo: Catalogo, graph_ok: bool | None = None, extra: dict | None = None,
                   hoy: date | None = None) -> dict:
    if graph_ok is False:
        # Sin lectura del buzón no se sabe qué falta: no se tocan pares, V3 ni huecos.
        pares, v3 = 0, {"omitido": "graph_no_disponible"}
    else:
        pares = emparejar_db(con, corrida_id, catalogo)
        v3 = v3_y_huecos(con, corrida_id, catalogo, hoy)
        extra = {**(extra or {}), "jeeves": jeeves_validar(con, corrida_id)}
    with con.cursor() as cur:
        cur.execute("""SELECT
              count(*) FILTER (WHERE a.corrida_id=%(c)s) AS leidos,
              count(*) FILTER (WHERE a.corrida_id=%(c)s AND a.estado='validado') AS validados,
              count(*) FILTER (WHERE a.corrida_id=%(c)s AND a.estado IN ('rechazado','no_cuadra','sospechoso','formato_no_soportado')) AS rechazados,
              count(*) FILTER (WHERE a.corrida_id=%(c)s AND a.estado='duplicado') AS duplicados
            FROM bancos.archivos a""", {"c": corrida_id})
        n = cur.fetchone()
        resumen = {"pares_traspaso_nuevos": pares, "v3": v3, **(extra or {})}
        cur.execute("""UPDATE bancos.corridas SET terminada_at=now(), leidos=%s, validados=%s, rechazados=%s, duplicados=%s,
                         graph_ok=%s, resumen=%s WHERE id=%s""",
                    (n["leidos"], n["validados"], n["rechazados"], n["duplicados"], graph_ok, _j(resumen), corrida_id))
    return {"corrida_id": corrida_id, **n, **resumen}
