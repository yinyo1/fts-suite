"""Las tres patas del Objetivo 1 (base = PDFs) y la salud del sistema (sección E).

Entrada: una FOTO tomada por el auditor —
  base      lo que devuelve bancos/auditor/n8n/lectura.sql (rol bancos_auditor)
  onedrive  lista de archivos de '01 Estados de cuenta originales' y del primer nivel del buzón,
            cada uno con su sha256 calculado por el auditor sobre los bytes bajados de OneDrive
  pdfs      sha256 -> bytes (los PDFs a releer)
  n8n       banderas de salud que el auditor lee de n8n (workflows activos)
Salida: hallazgos por estado y pata, con evidencia PRIVADA, y conteos publicables.
El auditor NUNCA corrige la base: sólo reporta.
"""
from __future__ import annotations

import hashlib
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from . import VERSION
from .relectura import leer

RAIZ = "/FTS Finanzas - Bancos/"
CENT = Decimal("0.01")


def D(v) -> Decimal | None:
    return None if v is None else Decimal(str(v)).quantize(CENT)


def _mes_sig(p: str) -> str:
    y, m = int(p[:4]), int(p[5:7])
    return f"{y + (m == 12)}-{(m % 12) + 1:02d}"


class Auditoria:
    def __init__(self, base: dict, onedrive: dict, pdfs: dict[str, bytes], n8n: dict | None = None,
                 ahora: datetime | None = None, alcance_archivos: set[int] | None = None):
        self.b, self.od, self.pdfs, self.n8n = base, onedrive, pdfs, (n8n or {})
        self.ahora = ahora or datetime.now(timezone.utc)
        self.alcance = alcance_archivos
        self.hall: list[dict] = []
        self.arch = {a["id"]: a for a in (base.get("archivos") or [])}
        self.por_sha = {a["sha256"]: a for a in self.arch.values()}
        self.cuentas = {c["id"]: c for c in (base.get("cuentas") or [])}
        vig = set(base.get("vigentes") or [])
        self.est_todos = {e["id"]: e for e in (base.get("estados") or [])}
        self.vigentes = [e for e in self.est_todos.values() if e["id"] in vig]
        self.E = [e for e in self.vigentes if self.arch.get(e["archivo_id"], {}).get("estado") == "validado"]
        self.movs = defaultdict(list)
        for m in base.get("movimientos") or []:
            self.movs[m["estado_id"]].append(m)
        for v in self.movs.values():
            v.sort(key=lambda m: m["renglon"])
        self.lecturas: dict[int, object] = {}

    # ── registro ──
    def h(self, pata, resultado, codigo, _e=None, _a=None, **ev):
        self.hall.append({"pata": pata, "resultado": resultado, "codigo": codigo,
                          "estado_id": _e, "archivo_id": _a, "evidencia": ev})

    def en_alcance(self, archivo_id) -> bool:
        return self.alcance is None or archivo_id in self.alcance

    # ── pata 1 ──
    def pata1(self):
        archivos_od = self.od.get("archivos") or []
        for err in self.od.get("errores") or []:
            self.h(1, "ROJO", "P1_ONEDRIVE_NO_SE_PUDO_LEER", detalle=err)
        canonicos = {}
        for a in self.arch.values():
            if a.get("nombre_canonico"):
                canonicos.setdefault(a["nombre_canonico"], []).append(a)
        for f in archivos_od:
            sha = f.get("sha256")
            nombre = f.get("nombre") or ""
            if f.get("en_buzon"):
                creado = datetime.fromisoformat(str(f["creado"]).replace("Z", "+00:00"))
                if self.ahora - creado > timedelta(hours=1):
                    self.h(1, "ROJO", "P1_BUZON_SIN_PROCESAR", nombre=nombre, creado=f["creado"])
                continue
            if not nombre.lower().endswith(".pdf"):
                continue
            if not sha:
                self.h(1, "ROJO", "P1_ONEDRIVE_NO_SE_PUDO_BAJAR", nombre=nombre, ruta=f.get("ruta"))
                continue
            a = self.por_sha.get(sha)
            if not a:
                previos = canonicos.get(nombre) or []
                if previos:
                    self.h(1, "ROJO", "P1_REEMPLAZADO", _a=previos[0]["id"], nombre=nombre, ruta=f.get("ruta"),
                           sha_onedrive=sha, sha_base=previos[0]["sha256"])
                else:
                    self.h(1, "ROJO", "P1_PDF_SIN_REGISTRO", nombre=nombre, ruta=f.get("ruta"), sha_onedrive=sha)
                continue
            if not self.en_alcance(a["id"]):
                continue
            nv = [e for e in self.vigentes if e["archivo_id"] == a["id"]]
            if a["estado"] == "validado":
                if len(nv) != 1:
                    self.h(1, "ROJO", "P1_VALIDADO_SIN_UN_ESTADO", _a=a["id"], nombre=nombre, vigentes=len(nv))
            elif not a.get("motivo") and a["estado"] != "duplicado":
                self.h(1, "ROJO", "P1_SIN_ESTADO_NI_MOTIVO", _a=a["id"], nombre=nombre, estado_archivo=a["estado"])
        # sentido inverso: todo lo registrado con ruta canónica existe en OneDrive con el mismo sha256
        por_ruta = {}
        for f in archivos_od:
            por_ruta[(f.get("ruta") or "") + "/" + (f.get("nombre") or "")] = f
        for a in self.arch.values():
            if not a.get("ruta_canonica") or not self.en_alcance(a["id"]):
                continue
            f = por_ruta.get(RAIZ + a["ruta_canonica"])
            if not f:
                self.h(1, "ROJO", "P1_REGISTRO_SIN_PDF", _a=a["id"], ruta=a["ruta_canonica"])
            elif f.get("sha256") and f["sha256"] != a["sha256"]:
                self.h(1, "ROJO", "P1_REEMPLAZADO", _a=a["id"], ruta=a["ruta_canonica"],
                       sha_onedrive=f["sha256"], sha_base=a["sha256"])
        # dos estados vigentes para la misma cuenta y periodo
        c = Counter((e["cuenta_id"], e["periodo"]) for e in self.E)
        for (cta, per), n in c.items():
            if n > 1:
                for e in self.E:
                    if (e["cuenta_id"], e["periodo"]) == (cta, per):
                        self.h(1, "ROJO", "P1_DOS_VIGENTES", _e=e["id"], _a=e["archivo_id"], cuenta=cta, periodo=per, n=n)

    # ── pata 2 ──
    def pata2(self):
        for e in self.E:
            if not self.en_alcance(e["archivo_id"]):
                continue
            a = self.arch[e["archivo_id"]]
            datos = self.pdfs.get(a["sha256"])
            if datos is None:
                self.h(2, "ROJO", "P2_SIN_PDF_PARA_RELEER", _e=e["id"], _a=a["id"], nombre=a.get("nombre_canonico"))
                continue
            if hashlib.sha256(datos).hexdigest() != a["sha256"]:
                self.h(2, "ROJO", "P2_BYTES_NO_SON_LOS_REGISTRADOS", _e=e["id"], _a=a["id"])
                continue
            L = leer(datos)
            self.lecturas[e["id"]] = L
            ev = {"pdf": a.get("nombre_canonico") or a.get("nombre_original")}
            for p in L.problemas:
                self.h(2, "ROJO", "P2_" + p["codigo"], _e=e["id"], _a=a["id"], **ev, **{k: v for k, v in p.items() if k != "codigo"})
            cta = self.cuentas.get(e["cuenta_id"], {})
            if not L.cuenta or ("…" + L.cuenta[-4:]) != cta.get("numero_mask"):
                self.h(2, "ROJO", "P2_CUENTA_DISTINTA", _e=e["id"], _a=a["id"], **ev,
                       leida=("…" + L.cuenta[-4:]) if L.cuenta else None, base=cta.get("numero_mask"))
            if L.periodo != e["periodo"]:
                self.h(2, "ROJO", "P2_PERIODO_DISTINTO", _e=e["id"], _a=a["id"], **ev, leido=L.periodo, base=e["periodo"])
            db = self.movs.get(e["id"], [])
            pag_pdf = Counter(m.pagina for m in L.movimientos)
            pag_db = Counter(m["pagina"] for m in db)
            for pg in sorted(set(pag_pdf) | set(pag_db)):
                if pag_pdf[pg] != pag_db[pg]:
                    self.h(2, "ROJO", "P2_CONTEO_POR_PAGINA", _e=e["id"], _a=a["id"], **ev,
                           pagina=pg, en_pdf=pag_pdf[pg], en_base=pag_db[pg])
            for k in range(max(len(L.movimientos), len(db))):
                x = L.movimientos[k] if k < len(L.movimientos) else None
                y = db[k] if k < len(db) else None
                if x is None or y is None:
                    self.h(2, "ROJO", "P2_MOVIMIENTO_FALTANTE", _e=e["id"], _a=a["id"], **ev,
                           renglon=k + 1, falta_en=("pdf" if x is None else "base"),
                           pagina=(x.pagina if x else y["pagina"]))
                    continue
                dif = {}
                if str(x.fecha_operacion) != y["fecha_operacion"]:
                    dif["fecha"] = [str(x.fecha_operacion), y["fecha_operacion"]]
                if x.cargo != D(y["cargo"]):
                    dif["cargo"] = [str(x.cargo), str(D(y["cargo"]))]
                if x.abono != D(y["abono"]):
                    dif["abono"] = [str(x.abono), str(D(y["abono"]))]
                if x.saldo_operacion != D(y["saldo_operacion_impreso"]):
                    dif["saldo_impreso"] = [str(x.saldo_operacion), str(D(y["saldo_operacion_impreso"]))]
                if x.pagina != y["pagina"]:
                    dif["pagina"] = [x.pagina, y["pagina"]]
                if dif:
                    self.h(2, "ROJO", "P2_MOVIMIENTO_DISTINTO", _e=e["id"], _a=a["id"], **ev,
                           pagina=x.pagina, renglon=y["renglon"], pdf_vs_base=dif)
            # huella propia del auditor (fecha|cargo|abono|saldo impreso), PDF contra base
            hp = hashlib.sha256("\n".join(f"{m.fecha_operacion}|{m.cargo}|{m.abono}|{m.saldo_operacion}" for m in L.movimientos).encode()).hexdigest()
            hb = hashlib.sha256("\n".join(f"{m['fecha_operacion']}|{D(m['cargo'])}|{D(m['abono'])}|{D(m['saldo_operacion_impreso'])}" for m in db).encode()).hexdigest()
            if hp != hb:
                self.h(2, "ROJO", "P2_HUELLA_DISTINTA", _e=e["id"], _a=a["id"], **ev)
            # y la huella que guardó el servicio es la de sus propios movimientos (integridad de la base)
            hs = hashlib.sha256("\n".join(m["hash"] for m in db).encode()).hexdigest()
            if hs != e["huella"]:
                self.h(2, "ROJO", "P2_HUELLA_DEL_SERVICIO_NO_CORRESPONDE", _e=e["id"], _a=a["id"], **ev)

    # ── pata 3 ──
    def pata3(self):
        v3_serv = {}
        for x in sorted(self.b.get("v3") or [], key=lambda x: x["id"]):
            v3_serv[x["estado_id"]] = x["resultado"]
        huecos = {(h["cuenta_id"], h["periodo"]) for h in (self.b.get("huecos") or [])}
        por_cta = defaultdict(dict)
        for e in self.E:
            por_cta[e["cuenta_id"]][e["periodo"]] = e
        for e in self.E:
            if not self.en_alcance(e["archivo_id"]):
                continue
            a = self.arch[e["archivo_id"]]
            ev = {"pdf": a.get("nombre_canonico") or a.get("nombre_original")}
            db = self.movs.get(e["id"], [])
            cargos = [D(m["cargo"]) for m in db if D(m["cargo"]) > 0]
            abonos = [D(m["abono"]) for m in db if D(m["abono"]) > 0]
            si, sf = D(e["saldo_inicial"]), D(e["saldo_final"])
            # V1: base contra el resumen de la página 1 (leído por el auditor) y contra sí misma
            L = self.lecturas.get(e["id"])
            v1 = []
            if si + sum(abonos, Decimal(0)) - sum(cargos, Decimal(0)) != sf:
                v1.append({"regla": "saldo_inicial+abonos-cargos=saldo_final", "calc": str(si + sum(abonos, Decimal(0)) - sum(cargos, Decimal(0))), "base": str(sf)})
            if sum(cargos, Decimal(0)) != D(e["total_cargos"]) or len(cargos) != e["num_cargos"]:
                v1.append({"regla": "cargos base vs estado", "movs": [str(sum(cargos, Decimal(0))), len(cargos)], "estado": [str(D(e["total_cargos"])), e["num_cargos"]]})
            if sum(abonos, Decimal(0)) != D(e["total_abonos"]) or len(abonos) != e["num_abonos"]:
                v1.append({"regla": "abonos base vs estado", "movs": [str(sum(abonos, Decimal(0))), len(abonos)], "estado": [str(D(e["total_abonos"])), e["num_abonos"]]})
            if L is not None:
                for nombre, pdf_v, base_v in (("saldo_inicial", L.saldo_inicial, si), ("saldo_final", L.saldo_final, sf),
                                              ("cargos_total", L.cargos_total, sum(cargos, Decimal(0))), ("cargos_num", L.cargos_num, len(cargos)),
                                              ("abonos_total", L.abonos_total, sum(abonos, Decimal(0))), ("abonos_num", L.abonos_num, len(abonos))):
                    if pdf_v != base_v:
                        v1.append({"regla": f"pagina 1 {nombre}", "leido_pdf": str(pdf_v), "base": str(base_v)})
            mi_v1 = not v1          # lo que se compara con el servicio: sólo lo que el auditor sí pudo calcular
            if L is None:
                v1.append({"regla": "sin relectura de la pagina 1 (ver pata 2)"})
            for x in v1:
                self.h(3, "ROJO", "P3_V1", _e=e["id"], _a=a["id"], **ev, **x)
            # V2: saldo recalculado contra CADA saldo impreso
            s, malos = si, 0
            for m in db:
                s = s + D(m["abono"]) - D(m["cargo"])
                imp = D(m["saldo_operacion_impreso"])
                if imp is not None and imp != s:
                    malos += 1
                    self.h(3, "ROJO", "P3_V2", _e=e["id"], _a=a["id"], **ev, pagina=m["pagina"], renglon=m["renglon"],
                           calculado=str(s), impreso=str(imp))
            mi_v2 = malos == 0
            # V3: encadenamiento con el mes anterior
            per = e["periodo"]
            y, mm = int(per[:4]), int(per[5:7])
            ant = f"{y - (mm == 1)}-{(mm - 2) % 12 + 1:02d}"
            prev = por_cta[e["cuenta_id"]].get(ant)
            antes = [p for p in por_cta[e["cuenta_id"]] if p < per]
            if prev is not None:
                mi_v3 = "ok" if D(prev["saldo_final"]) == si else "descuadre"
                if mi_v3 == "descuadre":
                    self.h(3, "ROJO", "P3_V3_NO_ENCADENA", _e=e["id"], _a=a["id"], **ev, mes_anterior=ant,
                           final_anterior=str(D(prev["saldo_final"])), inicial=str(si))
            elif not antes:
                mi_v3 = "primero"
            elif (e["cuenta_id"], ant) in huecos:
                mi_v3 = "hueco"
            else:
                mi_v3 = "sin_hueco"
                self.h(3, "ROJO", "P3_V3_VECINO_FALTANTE_SIN_HUECO", _e=e["id"], _a=a["id"], **ev, mes_anterior=ant)
            # contra lo que guardó el servicio
            if bool(e["v1_ok"]) != mi_v1:
                self.h(3, "ROJO", "P3_DIFIERE_DEL_SERVICIO", _e=e["id"], _a=a["id"], **ev, prueba="V1", servicio=e["v1_ok"], auditor=mi_v1)
            if bool(e["v2_ok"]) != mi_v2:
                self.h(3, "ROJO", "P3_DIFIERE_DEL_SERVICIO", _e=e["id"], _a=a["id"], **ev, prueba="V2", servicio=e["v2_ok"], auditor=mi_v2)
            sv3 = v3_serv.get(e["id"])
            eq = {"ok": "ok", "descuadre": "descuadre", "hueco": "hueco", "sin_anterior": "hueco", "primero": "primero"}
            if sv3 is not None and not (eq.get(sv3) == mi_v3 or (mi_v3 == "primero" and sv3 in ("sin_anterior", "hueco"))):
                self.h(3, "ROJO", "P3_DIFIERE_DEL_SERVICIO", _e=e["id"], _a=a["id"], **ev, prueba="V3", servicio=sv3, auditor=mi_v3)

    # ── E. salud del sistema (siempre) ──
    def salud(self):
        b, ahora = self.b, self.ahora
        n = self.n8n
        if n:
            if n.get("solicitud_activos") != 1:
                self.h(5, "ROJO", "E_SOLICITUD_ACTIVOS", n=n.get("solicitud_activos"))
            if not n.get("acuse_activo"):
                self.h(5, "ROJO", "E_ACUSE_APAGADO")
        else:
            self.h(5, "AMARILLO", "E_N8N_NO_LEIDO")
        hace24 = ahora - timedelta(hours=24)
        for r in b.get("corridas") or []:
            ini = datetime.fromisoformat(r["iniciada_at"])
            if ini < hace24:
                continue
            if r.get("error"):
                self.h(5, "ROJO", "E_CORRIDA_FALLIDA", corrida=r["id"], origen=r["origen"])
            if r.get("graph_ok") is False:
                self.h(5, "ROJO", "E_BUZON_ERROR_GRAPH", corrida=r["id"])
            if r.get("terminada_at") is None and ahora - ini > timedelta(hours=3) and r["origen"] != "inventario":
                self.h(5, "AMARILLO", "E_CORRIDA_SIN_CERRAR", corrida=r["id"], origen=r["origen"])
        reales = [k for k in (b.get("correos") or []) if k["modo"] == "real"]
        sol = Counter(k["hoy"] for k in reales if k["tipo"] == "solicitud")
        for dia, c in sol.items():
            if c > 1:
                self.h(5, "ROJO", "E_SOLICITUD_DUPLICADA", dia=dia, n=c)
        for k in reales:
            if k.get("graph_status") not in (None, 202):
                self.h(5, "ROJO", "E_CORREO_RECHAZADO_POR_GRAPH", tipo=k["tipo"], dia=k["hoy"], status=k["graph_status"])
        # solicitud esperada: días hábiles desde solicitud_desde, pasada la hora de envío, con faltantes abiertos
        par = b.get("parametros") or {}
        desde = par.get("solicitud_desde")
        inh = set(b.get("dias_inhabiles") or [])
        abiertos = [h for h in (b.get("huecos") or []) if h.get("resuelto_en") is None]
        mty = ahora - timedelta(hours=6)
        if desde and abiertos:
            d = date.fromisoformat(desde)
            while d <= mty.date():
                habil = d.weekday() < 5 and d.isoformat() not in inh
                hora = 10 if d.isoformat() == "2026-09-28" else 9
                paso = d < mty.date() or mty.hour > hora or (mty.hour == hora and mty.minute >= 20)
                if habil and paso and sol.get(d.isoformat(), 0) == 0:
                    self.h(5, "ROJO", "E_SOLICITUD_NO_SALIO", dia=d.isoformat())
                d += timedelta(days=1)
        # acuses: corridas del buzón con archivos leídos y sin acuse después de 1 h
        acuse_desde = par.get("acuse_desde")
        con_acuse = {k["corrida_id"] for k in reales if k["tipo"] in ("acuse", "final")}
        for r in b.get("corridas") or []:
            if r["origen"] != "cron" or not r.get("terminada_at") or (r.get("leidos") or 0) == 0:
                continue
            fin = datetime.fromisoformat(r["terminada_at"])
            if acuse_desde and fin <= datetime.fromisoformat(acuse_desde.replace("Z", "+00:00")):
                continue
            if r["id"] not in con_acuse and ahora - fin > timedelta(hours=1):
                self.h(5, "ROJO", "E_ACUSE_NO_SALIO", corrida=r["id"])
        # faltantes con más de 5 días hábiles abiertos (se sabe, pero se recuerda)
        viejos = 0
        for h in abiertos:
            det = datetime.fromisoformat(h["detectado_en"]).date()
            habiles = sum(1 for i in range((mty.date() - det).days) if (det + timedelta(days=i + 1)).weekday() < 5)
            if habiles > 5:
                viejos += 1
        if viejos:
            self.h(5, "AMARILLO", "E_FALTANTES_MAS_DE_5_DIAS", n=viejos)
        # calendario inhábil cargado para los próximos 90 días
        fin90 = mty.date() + timedelta(days=90)
        anios = {mty.date().year, fin90.year}
        for y in anios:
            if not any(str(x).startswith(str(y)) for x in inh):
                self.h(5, "AMARILLO", "E_SIN_DIAS_INHABILES", anio=y)
        if not n.get("secreto_graph_vence"):
            self.h(5, "NO_APLICA", "E_VENCIMIENTO_SECRETO_GRAPH_NO_VISIBLE")

    # ── veredicto ──
    def correr(self, objetivo1: bool = True) -> dict:
        if objetivo1:
            self.pata1()
            self.pata2()
            self.pata3()
        self.salud()
        rojos = [x for x in self.hall if x["resultado"] == "ROJO"]
        amar = [x for x in self.hall if x["resultado"] == "AMARILLO"]
        por_estado = []
        for e in self.E:
            if not self.en_alcance(e["archivo_id"]):
                continue
            fila = {"estado_id": e["id"], "archivo_id": e["archivo_id"], "cuenta_id": e["cuenta_id"], "periodo": e["periodo"],
                    "movimientos": len(self.movs.get(e["id"], []))}
            for p in (1, 2, 3):
                r = any(x["resultado"] == "ROJO" and x["pata"] == p and (x["estado_id"] == e["id"] or x["archivo_id"] == e["archivo_id"]) for x in self.hall)
                fila[f"pata{p}"] = "ROJO" if r else "VERDE"
            por_estado.append(fila)
        globales_p1 = [x for x in rojos if x["pata"] == 1 and x["estado_id"] is None and x["archivo_id"] not in {e["archivo_id"] for e in self.E}]
        obj1 = "VERDE" if objetivo1 and all(f["pata1"] == f["pata2"] == f["pata3"] == "VERDE" for f in por_estado) and not globales_p1 else "ROJO"
        veredicto = "ROJO" if rojos else ("AMARILLO" if amar else "VERDE")
        cod = Counter(x["codigo"] for x in self.hall if x["resultado"] in ("ROJO", "AMARILLO"))
        conteos = {
            "objetivo1": obj1 if objetivo1 else "NO_CORRIO",
            "estados": len(por_estado),
            "movimientos": sum(f["movimientos"] for f in por_estado),
            "estados_tres_patas_verde": sum(1 for f in por_estado if f["pata1"] == f["pata2"] == f["pata3"] == "VERDE"),
            "rojo_por_pata": {str(p): sum(1 for f in por_estado if f[f"pata{p}"] == "ROJO") for p in (1, 2, 3)},
            "rojo_pata1_sin_estado": len(globales_p1),
            "hallazgos_por_codigo": dict(sorted(cod.items())),
        }
        return {"version": VERSION, "veredicto": veredicto, "conteos": conteos, "por_estado": por_estado, "hallazgos": self.hall,
                "leido_at": self.b.get("leido_at"), "auditado_at": self.ahora.isoformat()}
