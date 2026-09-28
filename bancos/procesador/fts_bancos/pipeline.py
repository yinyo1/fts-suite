"""Pipeline: bytes de un archivo del buzón → base bancaria.

Cada archivo (y cada pieza de un ZIP) se procesa en su propia transacción.
El resultado es un MANIFIESTO que n8n ejecuta en OneDrive: qué copiar, con qué
nombre, a qué carpeta, qué mandar a Rechazados y con qué motivo.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal

from . import PARSER_VERSION, bbva, entrada, validar
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


def _item_desde_archivo_existente(con, fila, nombre, ruta_en_zip, catalogo: Catalogo) -> Item:
    """El mismo contenido ya se había recibido (duplicado exacto por sha256)."""
    cuenta = next((c for c in catalogo.cuentas if c.id == fila["cuenta_id"]), None)
    return Item(sha256=fila["sha256"], nombre_original=nombre, ruta_en_zip=ruta_en_zip, tipo=fila["tipo_detectado"] or "?",
                estado="duplicado", accion="ninguna", periodo=fila["periodo"],
                cuenta=_cuenta_dict(cuenta), archivo_id=fila["id"],
                motivo=f"duplicado exacto (mismo sha256) de '{fila['nombre_canonico'] or fila['nombre_original']}', recibido {fila['recibido_at']:%Y-%m-%d}",
                detalle={"estado_previo": fila["estado"]})


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
        t = "\n".join(bbva.texto_paginas(contenido, max_paginas=1))
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
    if not nuevo and fila["estado"] != "recibido":
        it = _item_desde_archivo_existente(con, fila, nombre, ruta_en_zip, catalogo)
        it.es_pieza_de_zip = zip_origen_id is not None
        items.append(it)
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
        for p in res.piezas:
            if entrada.es_zip(p.contenido):
                continue  # las piezas del ZIP interno ya vienen aplanadas en res.piezas
            _procesar(con, p.contenido, p.nombre, meta, corrida_id, catalogo, reglas, items, fila["id"], p.ruta)
        return
    item = _procesar_documento(con, fila, contenido, nombre, meta, corrida_id, catalogo, reglas)
    item.ruta_en_zip = ruta_en_zip
    item.es_pieza_de_zip = zip_origen_id is not None
    items.append(item)


def _rechazo(con, fila, nombre, tipo, estado, motivo, instruccion, corrida_id, codigo, accion="rechazados", **extra):
    _marcar(con, fila["id"], estado=estado, tipo_detectado=tipo, motivo=motivo)
    evento(con, corrida_id, "rechazo", codigo, motivo, fila["sha256"])
    return Item(fila["sha256"], nombre, None, tipo, estado, accion, motivo=motivo, instruccion=instruccion,
                archivo_id=fila["id"], **extra)


def _procesar_documento(con, fila, contenido, nombre, meta, corrida_id, catalogo: Catalogo, reglas) -> Item:
    ext = os.path.splitext(nombre.lower())[1]
    if not entrada.es_pdf(contenido):
        if entrada.es_xlsx(contenido) or ext in (".csv", ".xlsx", ".xls", ".txt"):
            destino = CARPETA_PAYANA if re.search(r"payana", nombre, re.I) else (CARPETA_JEEVES if re.search(r"jeeves", nombre, re.I) else None)
            tipo = "payana" if destino == CARPETA_PAYANA else ("jeeves" if destino == CARPETA_JEEVES else "tabla_desconocida")
            it = _rechazo(con, fila, nombre, tipo, "formato_no_soportado",
                          "formato no soportado todavía (exportación CSV/XLSX sin parser de muestra)",
                          "No hay que hacer nada: el archivo quedó guardado y se leerá cuando exista el parser de este formato.",
                          corrida_id, "FORMATO_NO_SOPORTADO", accion="copiar" if destino else "rechazados")
            if destino:
                it.carpeta_destino, it.nombre_destino = destino, nombre
            return it
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
    es_bbva = bool(re.search(r"BBVA", texto) and bbva.RE_PERIODO.search(texto))
    if not es_bbva:
        if re.search(r"JEEVES", texto, re.I) or re.search(r"PAYANA", texto, re.I):
            tipo = "jeeves" if re.search(r"JEEVES", texto, re.I) else "payana"
            it = _rechazo(con, fila, nombre, tipo, "formato_no_soportado", f"estado {tipo.title()} en PDF: formato todavía no soportado",
                          "No hay que hacer nada: quedó guardado en su carpeta.", corrida_id, "FORMATO_NO_SOPORTADO", accion="copiar")
            it.carpeta_destino, it.nombre_destino = (CARPETA_JEEVES if tipo == "jeeves" else CARPETA_PAYANA), nombre
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
    cuenta = catalogo.identificar(est.texto_encabezado)
    periodo = est.periodo
    pista = entrada.periodo_en_nombre(nombre)
    avisos = list(est.avisos)
    if pista and pista != periodo:
        pa, pm = int(pista[:4]), int(pista[5:7])
        avisos.append(f"el archivo '{nombre}' es {NOMBRE_MES[est.periodo_fin.month]} {est.periodo_fin.year}, no "
                      f"{NOMBRE_MES[pm]} {pa}: el periodo sale de la pág. 1 ('Periodo DEL … AL …'), no del nombre")
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
        motivo = (f"duplicado lógico: ya existe {cuenta.banco} {cuenta.alias} {cuenta.mask} {periodo} "
                  f"('{previo['nombre_canonico']}'), " + ("mismo contenido" if mismo else "CON CONTENIDO DISTINTO"))
        _marcar(con, fila["id"], estado="duplicado" if mismo else "sospechoso", tipo_detectado="bbva_estado",
                cuenta_id=cuenta.id, periodo=periodo, motivo=motivo)
        evento(con, corrida_id, "aviso" if mismo else "rechazo", "DUPLICADO_LOGICO", motivo, fila["sha256"])
        return Item(fila["sha256"], nombre, None, "bbva_estado", "duplicado" if mismo else "sospechoso",
                    "ninguna" if mismo else "rechazados", motivo=motivo,
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


# ── cierre de corrida: pares de traspasos, V3, huecos ──
def emparejar_db(con, corrida_id, catalogo: Catalogo) -> int:
    from types import SimpleNamespace
    with con.cursor() as cur:
        cur.execute("""SELECT m.*, c.categoria, c.subcategoria, c.contraparte, c.es_traspaso_interno, c.regla, c.origen_regla,
                              c.confianza, c.version, c.par_traspaso_id
                       FROM bancos.movimientos m JOIN bancos.clasificacion_vigente c ON c.movimiento_id=m.id
                       JOIN bancos.estados e ON e.id=m.estado_id JOIN bancos.archivos a ON a.id=e.archivo_id
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
    hoy = hoy or date.today()
    return periodo_anterior(f"{hoy.year:04d}-{hoy.month:02d}")


def v3_y_huecos(con, corrida_id, catalogo: Catalogo, hoy: date | None = None) -> dict:
    """V3 (continuidad) para cada estado validado y huecos por cuenta.
    Un hueco es un mes faltante entre el primero esperado y el último mes cerrado."""
    inicio = os.environ.get("BANCOS_PERIODO_INICIO", "2024-01")
    limite = periodo_limite(hoy)
    resumen = {"cuentas": {}, "huecos_abiertos": 0, "v3_ok": 0, "v3_fallas": 0}
    with con.cursor() as cur:
        for c in catalogo.cuentas:
            if c.tipo != "cuenta":
                continue
            cur.execute("""SELECT DISTINCT ON (e.periodo) e.id, e.periodo, e.saldo_inicial, e.saldo_final, a.nombre_canonico
                           FROM bancos.estados e JOIN bancos.archivos a ON a.id=e.archivo_id
                           WHERE e.cuenta_id=%s AND a.estado='validado' ORDER BY e.periodo, e.id""", (c.id,))
            ests = {r["periodo"]: r for r in cur.fetchall()}
            esperados = rango_periodos(inicio, limite)
            faltan = [p for p in esperados if p not in ests]
            # V3 por estado
            for p, e in sorted(ests.items()):
                ant = ests.get(periodo_anterior(p))
                if ant is None:
                    res = "primero" if p <= inicio else "sin_anterior"
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
                else:
                    resumen["v3_fallas"] += 1
                if res == "descuadre":
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
                if h["motivo"] == "faltante" and h["periodo"] in ests:
                    cur.execute("UPDATE bancos.huecos SET resuelto_en=now(), resuelto_por_estado_id=%s WHERE id=%s",
                                (ests[h["periodo"]]["id"], h["id"]))
            cur.execute("SELECT count(*) AS n FROM bancos.huecos WHERE cuenta_id=%s AND resuelto_en IS NULL", (c.id,))
            n = cur.fetchone()["n"]
            resumen["cuentas"][c.clave] = {"alias": c.alias, "mask": c.mask, "estados": len(ests), "faltantes": faltan, "huecos_abiertos": n}
            resumen["huecos_abiertos"] += n
    return resumen


def _hueco(cur, cuenta_id, periodo, motivo, dif, detalle):
    cur.execute("""INSERT INTO bancos.huecos (cuenta_id, periodo, motivo, monto_diferencia, detalle)
                   VALUES (%s,%s,%s,%s,%s)
                   ON CONFLICT (cuenta_id, periodo, motivo) DO UPDATE
                   SET monto_diferencia=EXCLUDED.monto_diferencia, detalle=EXCLUDED.detalle
                   WHERE bancos.huecos.monto_diferencia IS DISTINCT FROM EXCLUDED.monto_diferencia
                      OR bancos.huecos.detalle IS DISTINCT FROM EXCLUDED.detalle""",
                (cuenta_id, periodo, motivo, dif, _j(detalle)))


def cerrar_corrida(con, corrida_id: int, catalogo: Catalogo, graph_ok: bool | None = None, extra: dict | None = None,
                   hoy: date | None = None) -> dict:
    if graph_ok is False:
        # Sin lectura del buzón no se sabe qué falta: no se tocan pares, V3 ni huecos.
        pares, v3 = 0, {"omitido": "graph_no_disponible"}
    else:
        pares = emparejar_db(con, corrida_id, catalogo)
        v3 = v3_y_huecos(con, corrida_id, catalogo, hoy)
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
