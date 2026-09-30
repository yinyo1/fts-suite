"""Objetivo 2 del auditor (issue #365): cotejo banco vs Odoo, anomalías y clasificación básica.

Entrada: la foto del Objetivo 2 (bancos/auditor/n8n/lectura_obj2.sql con bancos_lector, lectura_obj2_previa.sql con
bancos_auditor, y las líneas de Odoo de SOLO LECTURA ya compactadas por n8n; ver obj2_cli.adaptar). El auditor NUNCA escribe en la base ni en Odoo.

Criterio rector (Esteban): anomalía = algo que CAMBIÓ, se SALIÓ DE RANGO o es ACCIONABLE HOY.
Una condición crónica (p. ej. meses viejos sin capturar en Odoo) va en AMARILLO y no manda correo.
"Nuevo" = no estaba marcado en la auditoría anterior del Objetivo 2; la primera corrida fija la línea base.

Patas del Objetivo 2 en bancos.auditorias_informe: 1 = cotejo con Odoo, 2 = anomalías, 3 = clasificación.
Cada cifra se verifica por dos caminos (ver `verificaciones` en el resultado).
Jeeves: en el diseño, APAGADO (config obj2.jeeves = false) hasta sus primeros archivos reales.
"""
from __future__ import annotations

import re
import statistics
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal

from . import VERSION

CENT = Decimal("0.01")
JOURNALS = (8, 96, 75)          # General, Nómina, USD (Jeeves = 61, apagado)
VENTANA_DIAS = 3


def D(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(CENT)


def mes(f: str) -> str:
    return str(f)[:7]


def norm(t: str | None) -> str:
    t = unicodedata.normalize("NFKD", (t or "").upper())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", t)).strip()


def llave_contraparte(m: dict, k: dict | None) -> str:
    """Contraparte estable para comparar montos: la de la clasificación, la del movimiento o las
    primeras palabras de la descripción sin números (referencias, folios, fechas)."""
    c = (k or {}).get("contraparte") or m.get("contraparte")
    if c:
        return "C:" + norm(c)
    palabras = [w for w in norm(m.get("descripcion")).split() if not re.search(r"\d", w)]
    return "D:" + " ".join(palabras[:4])


class Obj2:
    def __init__(self, base: dict, odoo: list[dict], cfg: dict | None = None, ahora: datetime | None = None):
        self.b, self.cfg = base, (cfg or {})
        self.ahora = ahora or datetime.now(timezone.utc)
        self.desde = self.cfg.get("desde", "2024-01")
        self.umbral = {"MXN": D(self.cfg.get("umbral_mxn", 50000)), "USD": D(self.cfg.get("umbral_usd", 3000))}
        self.hall: list[dict] = []
        self.cuentas = {c["id"]: c for c in base.get("cuentas") or []}
        self.por_journal = {c["journal_odoo"]: c for c in self.cuentas.values() if c.get("journal_odoo") in JOURNALS}
        self.est = {e["id"]: e for e in base.get("estados") or []
                    if e["periodo"] >= self.desde and self.cuentas.get(e["cuenta_id"], {}).get("journal_odoo") in JOURNALS}
        self.movs = [m for m in base.get("movimientos") or [] if m["estado_id"] in self.est]
        self.k = {k["movimiento_id"]: k for k in base.get("clasificacion") or []}
        self.odoo = [l for l in odoo if l["j"] in JOURNALS]
        self.inhabiles = {str(x)[:10] for x in base.get("dias_inhabiles") or []}
        self.prev = base.get("ultima_obj2")
        self.marcados_prev: dict[str, set[int]] = defaultdict(set)
        for x in base.get("marcados_prev") or []:
            for i in (x.get("movimientos") if isinstance(x.get("movimientos"), list) else []):
                self.marcados_prev[x["codigo"]].add(int(i))
        self.verif: list[dict] = []

    def h(self, pata, resultado, codigo, _e=None, **ev):
        self.hall.append({"pata": pata, "resultado": resultado, "codigo": codigo, "estado_id": _e,
                          "archivo_id": self.est[_e]["archivo_id"] if _e in self.est else None, "evidencia": ev})

    def nuevo(self, codigo: str, ids: list[int]) -> bool:
        """ROJO sólo si hay auditoría anterior y alguno de estos movimientos no estaba marcado con este código."""
        return self.prev is not None and any(i not in self.marcados_prev.get(codigo, set()) for i in ids)

    def v(self, que: str, a, b, ok: bool | None = None):
        ok = (a == b) if ok is None else ok
        self.verif.append({"que": que, "camino_1": str(a), "camino_2": str(b), "ok": bool(ok)})
        if not ok:
            self.h(5, "ROJO", "O2_DOS_CAMINOS_NO_CUADRAN", que=que, camino_1=str(a), camino_2=str(b))

    # ── a) cotejo banco vs Odoo ──
    def cotejo(self):
        meses_con_estado = {(e["cuenta_id"], e["periodo"]) for e in self.est.values()}
        por_j: dict[int, list] = defaultdict(list)
        for l in self.odoo:
            por_j[l["j"]].append(dict(l, _f=date.fromisoformat(l["f"]), _m=D(l["m"]), _usada=False))
        for ls in por_j.values():
            ls.sort(key=lambda l: (l["_f"], l["id"]))
        self.emparejado: dict[int, int] = {}
        for m in sorted(self.movs, key=lambda m: (m["cuenta_id"], m["fecha_operacion"], m["id"])):
            j = self.cuentas[m["cuenta_id"]]["journal_odoo"]
            neto = D(m["abono"]) - D(m["cargo"])
            f = date.fromisoformat(str(m["fecha_operacion"])[:10])
            mejor = None
            for l in por_j.get(j, []):
                if l["_usada"] or l["_m"] != neto:
                    continue
                dd = abs((l["_f"] - f).days)
                if dd <= VENTANA_DIAS and (mejor is None or (dd, l["id"]) < mejor[0]):
                    mejor = ((dd, l["id"]), l)
            if mejor:
                mejor[1]["_usada"] = True
                self.emparejado[m["id"]] = mejor[1]["id"]
        # por cuenta y mes (mes del estado)
        filas = {}
        for e in self.est.values():
            filas[(e["cuenta_id"], e["periodo"])] = {k: 0 for k in ("banco_n", "emp_n", "faltan_n", "sobran_n")} | \
                {k: Decimal(0) for k in ("banco_monto", "emp_monto", "faltan_monto", "sobran_monto", "odoo_monto")} | {"odoo_n": 0}
        for m in self.movs:
            e = self.est[m["estado_id"]]
            r = filas[(e["cuenta_id"], e["periodo"])]
            monto = D(m["abono"]) + D(m["cargo"])
            r["banco_n"] += 1
            r["banco_monto"] += monto
            if m["id"] in self.emparejado:
                r["emp_n"] += 1
                r["emp_monto"] += monto
            else:
                r["faltan_n"] += 1
                r["faltan_monto"] += monto
        sin_estado_n, odoo_total_n = 0, 0
        for j, ls in por_j.items():
            cta = self.por_journal.get(j)
            for l in ls:
                if l["f"][:7] < self.desde:
                    continue
                odoo_total_n += 1
                clave = (cta["id"], l["f"][:7]) if cta else None
                if clave not in meses_con_estado:
                    sin_estado_n += 1
                    continue
                r = filas[clave]
                r["odoo_n"] += 1
                r["odoo_monto"] += abs(l["_m"])
                if not l["_usada"]:
                    r["sobran_n"] += 1
                    r["sobran_monto"] += abs(l["_m"])
        self.filas_cotejo = filas
        # dos caminos (internos): banco = emparejados + faltan; Odoo = emparejados + sobran (por cuenta y mes)
        tb = sum(r["banco_n"] for r in filas.values())
        self.v("cotejo · movimientos del banco = emparejados + faltan en Odoo", tb,
               sum(r["emp_n"] + r["faltan_n"] for r in filas.values()))
        self.v("cotejo · líneas de Odoo en meses con estado = emparejadas + sobran", sum(r["odoo_n"] for r in filas.values()),
               sum(r["emp_n"] + r["sobran_n"] for r in filas.values()))
        self.v("cotejo · líneas de Odoo leídas = en meses con estado + en meses sin estado", odoo_total_n,
               sum(r["odoo_n"] for r in filas.values()) + sin_estado_n)
        # camino 2: el cotejo del servicio (bancos.v_cotejo_odoo de su última corrida, por diario y mes; otra regla:
        # referencia primero). Se comparan por cuenta y mes los emparejados, los que faltan y los que sobran.
        cs = self.b.get("cotejo_servicio") or {}
        serv = {(int(x["journal_id"]), x["periodo"]): x for x in (cs.get("por_mes") or []) if int(x["journal_id"]) in JOURNALS}
        cmp_meses, cubiertos, sin_cubrir = [], 0, 0
        sa = ss = fa = fs = oa = os_ = 0
        for (cid, per), r in sorted(filas.items()):
            j = self.cuentas[cid]["journal_odoo"]
            x = serv.get((j, per))
            if x is None or not int(x["movimientos_banco"] or 0):
                sin_cubrir += r["banco_n"]
                continue
            cubiertos += r["banco_n"]
            se = int(x["exactos"] or 0) + int(x["probables"] or 0)
            sa += r["emp_n"]; ss += se; fa += r["faltan_n"]; fs += int(x["banco_sin_odoo"] or 0)
            oa += r["sobran_n"]; os_ += int(x["odoo_sin_banco"] or 0)
            cmp_meses.append({"journal": j, "periodo": per, "banco_auditor": r["banco_n"], "banco_servicio": int(x["movimientos_banco"]),
                              "emp_auditor": r["emp_n"], "emp_servicio": se, "faltan_auditor": r["faltan_n"], "faltan_servicio": int(x["banco_sin_odoo"] or 0),
                              "sobran_auditor": r["sobran_n"], "sobran_servicio": int(x["odoo_sin_banco"] or 0)})
        self.cmp_meses = cmp_meses
        self.comparacion = {"corrida_servicio": cs.get("corrida_id"), "movs_en_alcance": len(self.movs), "cubiertos_por_servicio": cubiertos,
                            "emparejados_auditor": sa, "emparejados_servicio": ss, "faltan_auditor": fa, "faltan_servicio": fs,
                            "sobran_auditor": oa, "sobran_servicio": os_}
        # el servicio y el auditor deben ver los mismos movimientos del banco en los meses que ambos cubren
        distintos = [m for m in cmp_meses if m["banco_auditor"] != m["banco_servicio"]]
        if distintos:
            self.h(1, "AMARILLO", "O2_COTEJO_SERVICIO_OTRA_BASE", meses=[f"{m['journal']}:{m['periodo']}" for m in distintos][:50],
                   nota="el último cotejo del servicio vio otros movimientos (corrió antes de una carga)")
        if sin_cubrir:
            self.h(1, "AMARILLO", "O2_COTEJO_SERVICIO_NO_CUBRE", n=sin_cubrir, corrida=cs.get("corrida_id"),
                   nota="movimientos en meses que el último cotejo del servicio (21:10) todavía no incluye")
        dif = abs(sa - ss)
        if dif > max(2, 0.02 * max(cubiertos, 1)):
            self.h(1, "AMARILLO", "O2_CAMINOS_DE_COTEJO_DIFIEREN", emparejados_auditor=sa, emparejados_servicio=ss,
                   meses=[m for m in cmp_meses if m["emp_auditor"] != m["emp_servicio"]][:60])
        # lo crónico: meses con faltantes / sobrantes (AMARILLO, sin correo)
        for (cid, per), r in sorted(filas.items()):
            eid = next(e["id"] for e in self.est.values() if (e["cuenta_id"], e["periodo"]) == (cid, per))
            if r["faltan_n"] or r["sobran_n"]:
                self.h(1, "AMARILLO", "O2_MES_NO_CUADRA_CON_ODOO", _e=eid, periodo=per, cuenta=self.cuentas[cid]["numero_mask"],
                       faltan_n=r["faltan_n"], faltan_monto=str(r["faltan_monto"]), sobran_n=r["sobran_n"], sobran_monto=str(r["sobran_monto"]))
        # lo que cambió: estaba en Odoo en la auditoría anterior y ya no
        antes = self.marcados_prev.get("O2_BASE_EMPAREJADOS", set())
        en_scope = {m["id"] for m in self.movs}
        perdidos = sorted(i for i in antes if i in en_scope and i not in self.emparejado)
        if perdidos and self.prev is not None:
            self.h(1, "ROJO", "O2_DEJO_DE_ESTAR_EN_ODOO", movimientos=perdidos[:200], n=len(perdidos))
        # registro de lo emparejado, para la siguiente corrida (no es hallazgo, no sale en el informe)
        self.h(1, "NO_APLICA", "O2_BASE_EMPAREJADOS", movimientos=sorted(self.emparejado))

    # ── b) anomalías ──
    def anomalias(self):
        mon = {m["id"]: self.cuentas[m["cuenta_id"]].get("moneda") or "MXN" for m in self.movs}
        # duplicados lógicos (mismo día, cuenta, monto y texto; se ignoran montos chicos y comisiones)
        g = defaultdict(list)
        for m in self.movs:
            monto = D(m["abono"]) + D(m["cargo"])
            if monto < D(1000) or (self.k.get(m["id"]) or {}).get("categoria") == "comision_bancaria":
                continue
            g[(m["cuenta_id"], str(m["fecha_operacion"])[:10], str(D(m["cargo"])), str(D(m["abono"])),
               norm((m.get("descripcion") or "") + " " + (m.get("referencia") or "")))].append(m)
        for (cid, f, c, a, _), ms in g.items():
            if len(ms) > 1:
                ids = [m["id"] for m in ms]
                self.h(2, "ROJO" if self.nuevo("O2_POSIBLE_DUPLICADO", ids) else "AMARILLO", "O2_POSIBLE_DUPLICADO",
                       _e=ms[0]["estado_id"], fecha=f, cargo=c, abono=a, movimientos=ids)
        # montos atípicos por contraparte y sentido (mediana + 8 MAD, al menos 3 veces la mediana y sobre el umbral)
        grupos = defaultdict(list)
        for m in self.movs:
            sentido = "cargo" if D(m["cargo"]) > 0 else "abono"
            grupos[(m["cuenta_id"], sentido, llave_contraparte(m, self.k.get(m["id"])))].append(m)
        for (cid, sentido, llave), ms in grupos.items():
            if len(ms) < 7:
                continue
            montos = [D(x[sentido]) for x in ms]
            for m in ms:
                otros = [float(x) for x, y in zip(montos, ms) if y["id"] != m["id"]]
                med = statistics.median(otros)
                mad = statistics.median([abs(x - med) for x in otros]) * 1.4826
                val = float(D(m[sentido]))
                if val >= float(self.umbral[mon[m["id"]]]) and val >= 3 * med and val > med + 8 * max(mad, 0.01):
                    self.h(2, "ROJO" if self.nuevo("O2_MONTO_ATIPICO", [m["id"]]) else "AMARILLO", "O2_MONTO_ATIPICO",
                           _e=m["estado_id"], fecha=str(m["fecha_operacion"])[:10], sentido=sentido, monto=str(D(m[sentido])),
                           mediana_contraparte=round(med, 2), historial=len(otros), movimientos=[m["id"]])
        # fin de semana o día inhábil, sobre el umbral (fuera de patrón para una cuenta de empresa)
        for m in self.movs:
            f = date.fromisoformat(str(m["fecha_operacion"])[:10])
            monto = D(m["abono"]) + D(m["cargo"])
            if (f.weekday() >= 5 or f.isoformat() in self.inhabiles) and D(m["cargo"]) >= self.umbral[mon[m["id"]]]:
                self.h(2, "ROJO" if self.nuevo("O2_CARGO_EN_DIA_INHABIL", [m["id"]]) else "AMARILLO", "O2_CARGO_EN_DIA_INHABIL",
                       _e=m["estado_id"], fecha=f.isoformat(), monto=str(monto), movimientos=[m["id"]])
        # traspasos internos sin pareja: sólo si el mes de las otras cuentas sí está en la base
        periodos_por_cta = defaultdict(set)
        for e in self.est.values():
            periodos_por_cta[e["cuenta_id"]].add(e["periodo"])
        for m in self.movs:
            k = self.k.get(m["id"]) or {}
            if not k.get("es_traspaso_interno") or k.get("par_traspaso_id"):
                continue
            per = self.est[m["estado_id"]]["periodo"]
            otras = [c for c in periodos_por_cta if c != m["cuenta_id"]]
            if all(per in periodos_por_cta[c] for c in otras):
                self.h(2, "ROJO" if self.nuevo("O2_TRASPASO_SIN_PAREJA", [m["id"]]) else "AMARILLO", "O2_TRASPASO_SIN_PAREJA",
                       _e=m["estado_id"], fecha=str(m["fecha_operacion"])[:10], monto=str(D(m["abono"]) + D(m["cargo"])), movimientos=[m["id"]])
            else:
                self.h(2, "NO_APLICA", "O2_TRASPASO_SIN_MES_PAR", _e=m["estado_id"], periodo=per, movimientos=[m["id"]])

    # ── c) clasificación básica ──
    def clasificacion(self):
        cat = Counter((self.k.get(m["id"]) or {}).get("categoria") or "(sin clasificación)" for m in self.movs)
        self.categorias = dict(sorted(cat.items(), key=lambda x: -x[1]))
        self.v("clasificación · suma por categoría = movimientos", sum(cat.values()), len(self.movs))
        reglas = [r for r in self.b.get("reglas_er") or [] if r["campo"] in ("descripcion", "categoria")]
        destino = Counter()
        for m in self.movs:
            k = self.k.get(m["id"]) or {}
            d = "(ninguna)"
            for r in reglas:
                texto = (m.get("descripcion") or "") + " " + (m.get("referencia") or "") if r["campo"] == "descripcion" else (k.get("categoria") or "")
                try:
                    if re.search(r["patron"], texto, re.I):
                        d = r["destino"]
                        break
                except re.error:
                    continue
            destino[d] += 1
        self.destinos_er = dict(sorted(destino.items(), key=lambda x: -x[1]))
        self.v("clasificación · suma por destino del estado de resultados = movimientos", sum(destino.values()), len(self.movs))
        sin = [m for m in self.movs if m["id"] not in self.k]
        if sin:
            self.h(3, "AMARILLO", "O2_MOVIMIENTOS_SIN_CLASIFICACION", n=len(sin), movimientos=[m["id"] for m in sin][:200])
        prev_pct = ((self.prev or {}).get("conteos") or {}).get("pct_sin_clasificar")
        pct = round(100 * cat.get("sin_clasificar", 0) / max(len(self.movs), 1), 2)
        self.pct_sin = pct
        if prev_pct is not None and pct - float(prev_pct) > 5:
            self.h(3, "AMARILLO", "O2_SUBIO_SIN_CLASIFICAR", antes=prev_pct, ahora=pct)

    # ── montos del banco por dos caminos ──
    def montos(self):
        por_e = defaultdict(lambda: [Decimal(0), 0, Decimal(0), 0])
        for m in self.movs:
            x = por_e[m["estado_id"]]
            if D(m["cargo"]) > 0:
                x[0] += D(m["cargo"]); x[1] += 1
            else:
                x[2] += D(m["abono"]); x[3] += 1
        malos = [e["id"] for e in self.est.values()
                 if (por_e[e["id"]][0], por_e[e["id"]][1], por_e[e["id"]][2], por_e[e["id"]][3]) !=
                 (D(e["total_cargos"]), e["num_cargos"], D(e["total_abonos"]), e["num_abonos"])]
        self.v("montos · movimientos sumados = totales impresos del estado (estados que cuadran)", len(self.est) - len(malos), len(self.est))

    def correr(self) -> dict:
        if not self.cfg.get("activo", True):
            return {"version": VERSION, "objetivo": 2, "veredicto": "VERDE", "conteos": {"objetivo2": "APAGADO"}, "hallazgos": [], "por_estado": []}
        self.montos()
        self.cotejo()
        self.anomalias()
        self.clasificacion()
        rojos = [x for x in self.hall if x["resultado"] == "ROJO"]
        amar = [x for x in self.hall if x["resultado"] == "AMARILLO"]
        veredicto = "ROJO" if rojos else ("AMARILLO" if amar else "VERDE")
        por_estado = []
        for e in sorted(self.est.values(), key=lambda e: (e["cuenta_id"], e["periodo"])):
            fila = {"estado_id": e["id"], "archivo_id": e["archivo_id"], "cuenta_id": e["cuenta_id"], "periodo": e["periodo"],
                    "movimientos": self.filas_cotejo[(e["cuenta_id"], e["periodo"])]["banco_n"]}
            for p in (1, 2, 3):
                rs = {x["resultado"] for x in self.hall if x["pata"] == p and x["estado_id"] == e["id"]}
                fila[f"pata{p}"] = "ROJO" if "ROJO" in rs else ("AMARILLO" if "AMARILLO" in rs else "VERDE")
            por_estado.append(fila)
        cod = Counter(x["codigo"] for x in self.hall if x["resultado"] in ("ROJO", "AMARILLO"))
        fc = self.filas_cotejo.values()
        tot = {k: sum(r[k] for r in fc) for k in ("banco_n", "emp_n", "faltan_n", "sobran_n", "odoo_n")}
        conteos = {
            "objetivo2": veredicto, "estados": len(por_estado), "movimientos": len(self.movs), "meses_cotejados": len(por_estado),
            "lineas_odoo": len(self.odoo), "cotejo": tot,
            "pct_emparejado": round(100 * tot["emp_n"] / max(tot["banco_n"], 1), 2),
            "comparacion_servicio": self.comparacion, "pct_sin_clasificar": self.pct_sin,
            "rojo_por_pata": {str(p): sum(1 for f in por_estado if f[f"pata{p}"] == "ROJO") for p in (1, 2, 3)},
            "hallazgos_por_codigo": dict(sorted(cod.items())), "verificaciones_ok": sum(1 for x in self.verif if x["ok"]),
            "verificaciones": len(self.verif), "linea_base": self.prev is None, "jeeves": "apagado",
        }
        meses = [{"cuenta": self.cuentas[c]["numero_mask"], "moneda": self.cuentas[c].get("moneda"), "periodo": p,
                  **{k: (str(v) if isinstance(v, Decimal) else v) for k, v in r.items()}}
                 for (c, p), r in sorted(self.filas_cotejo.items())]
        return {"version": VERSION, "objetivo": 2, "veredicto": veredicto, "conteos": conteos, "por_estado": por_estado,
                "hallazgos": self.hall, "verificaciones": self.verif, "cotejo_meses": meses, "categorias": self.categorias,
                "destinos_er": self.destinos_er, "comparacion_por_mes": self.cmp_meses, "leido_at": self.b.get("leido_at"), "auditado_at": self.ahora.isoformat()}
