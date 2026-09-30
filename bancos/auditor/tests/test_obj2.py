"""Objetivo 2 (issue #365) con datos SINTÉTICOS en memoria: cotejo con Odoo, anomalías y clasificación.
No necesita base: la foto del Objetivo 2 es un JSON y aquí se arma a mano."""
from datetime import datetime, timezone

from fts_auditor.obj2 import Obj2

AHORA = datetime(2026, 9, 30, 2, 0, tzinfo=timezone.utc)
CTAS = [{"id": 1, "alias": "General", "numero_mask": "…0011", "moneda": "MXN", "journal_odoo": 8, "activa": True},
        {"id": 2, "alias": "Nomina", "numero_mask": "…0022", "moneda": "MXN", "journal_odoo": 96, "activa": True},
        {"id": 3, "alias": "USD", "numero_mask": "…0033", "moneda": "USD", "journal_odoo": 75, "activa": True}]


def mov(i, est, cta, fecha, cargo=0, abono=0, desc="SPEI ENVIADO", ref=None, contraparte=None):
    return {"id": i, "estado_id": est, "cuenta_id": cta, "renglon": i, "fecha_operacion": fecha, "codigo": "T17",
            "descripcion": desc, "referencia": ref or f"REF{i}", "contraparte": contraparte, "cargo": cargo, "abono": abono,
            "creado_at": "2026-09-28T00:00:00Z"}


def escenario():
    movs = [mov(1, 10, 1, "2026-08-03", abono=1000, desc="SPEI RECIBIDO CLIENTE A"),
            mov(2, 10, 1, "2026-08-04", cargo=500, desc="PAGO PROVEEDOR B"),
            mov(3, 10, 1, "2026-08-10", cargo=200, desc="PAGO PROVEEDOR C")]      # no está en Odoo
    # contraparte con historial estable + un monto atípico
    for k in range(8):
        movs.append(mov(20 + k, 10, 1, f"2026-08-{11 + k:02d}", cargo=10000 + k, desc="PAGO RENTA OFICINA", contraparte="ARRENDADORA X"))
    movs.append(mov(40, 10, 1, "2026-08-20", cargo=900000, desc="PAGO RENTA OFICINA", contraparte="ARRENDADORA X"))
    # duplicado lógico (mismo día, monto y texto)
    movs += [mov(50, 10, 1, "2026-08-21", cargo=7000, desc="PAGO TALLER", ref="F-1"), mov(51, 10, 1, "2026-08-21", cargo=7000, desc="PAGO TALLER", ref="F-1")]
    # cargo alto en sábado
    movs.append(mov(60, 10, 1, "2026-08-22", cargo=80000, desc="SPEI ENVIADO PROVEEDOR D"))
    # traspaso interno sin pareja (la Nómina de agosto sí está en la base)
    movs.append(mov(70, 10, 1, "2026-08-25", cargo=30000, desc="TRASPASO NOMINA"))
    movs.append(mov(80, 11, 2, "2026-08-25", abono=5000, desc="DEPOSITO"))
    total = {}
    for m in movs:
        t = total.setdefault(m["estado_id"], [0, 0, 0, 0])
        if m["cargo"]:
            t[0] += m["cargo"]; t[1] += 1
        else:
            t[2] += m["abono"]; t[3] += 1
    estados = [{"id": 10, "archivo_id": 100, "cuenta_id": 1, "periodo": "2026-08", "total_cargos": total[10][0], "num_cargos": total[10][1],
                "total_abonos": total[10][2], "num_abonos": total[10][3]},
               {"id": 11, "archivo_id": 101, "cuenta_id": 2, "periodo": "2026-08", "total_cargos": 0, "num_cargos": 0,
                "total_abonos": 5000, "num_abonos": 1},
               {"id": 12, "archivo_id": 102, "cuenta_id": 3, "periodo": "2026-08", "total_cargos": 0, "num_cargos": 0,
                "total_abonos": 0, "num_abonos": 0}]
    clas = [{"movimiento_id": m["id"], "categoria": "traspaso" if m["id"] == 70 else "proveedor", "subcategoria": None,
             "contraparte": m["contraparte"], "es_traspaso_interno": m["id"] == 70, "par_traspaso_id": None, "regla": "x"} for m in movs]
    odoo = [{"j": 8, "id": 900, "move": 1, "pago": None, "f": "2026-08-05", "m": 1000},     # 2 días después: empareja
            {"j": 8, "id": 901, "move": 2, "pago": None, "f": "2026-08-04", "m": -500},
            {"j": 8, "id": 902, "move": 3, "pago": None, "f": "2026-08-15", "m": -12345},   # sobra en Odoo
            {"j": 96, "id": 903, "move": 4, "pago": None, "f": "2026-08-26", "m": 5000},
            {"j": 8, "id": 904, "move": 5, "pago": None, "f": "2026-06-01", "m": -1}]       # mes sin estado
    base = {"leido_at": "2026-09-30T02:00:00Z", "rol": "bancos_auditor", "cuentas": CTAS, "estados": estados, "movimientos": movs,
            "clasificacion": clas, "reglas_er": [{"id": 1, "prioridad": 20, "destino": "excluir_traspaso", "campo": "descripcion",
                                                  "patron": "TRASPASO", "subcategoria": None}],
            "cotejo_servicio": {"corrida_id": 5, "filas": [{"movimiento_id": 1, "journal_id": 8, "odoo_line_id": 900, "estado": "exacto"},
                                                          {"movimiento_id": 2, "journal_id": 8, "odoo_line_id": 901, "estado": "probable"},
                                                          {"movimiento_id": 80, "journal_id": 96, "odoo_line_id": 903, "estado": "exacto"}]},
            "dias_inhabiles": [], "ultima_obj2": None, "marcados_prev": []}
    return base, odoo


def cod(r, c, res=None):
    return [h for h in r["hallazgos"] if h["codigo"] == c and (res is None or h["resultado"] == res)]


def test_cotejo_por_cuenta_y_mes_y_dos_caminos():
    base, odoo = escenario()
    r = Obj2(base, odoo, {"desde": "2024-01"}, AHORA).correr()
    gen = next(m for m in r["cotejo_meses"] if m["cuenta"] == "…0011")
    assert gen["emp_n"] == 2 and gen["sobran_n"] == 1 and gen["faltan_n"] == gen["banco_n"] - 2
    assert all(v["ok"] for v in r["verificaciones"]), r["verificaciones"]
    c = r["conteos"]["comparacion_servicio"]
    assert c["ambos"] == 3 and c["solo_auditor"] == 0 and c["solo_servicio"] == 0
    assert cod(r, "O2_MES_NO_CUADRA_CON_ODOO", "AMARILLO")        # crónico: AMARILLO, no ROJO
    assert cod(r, "O2_COTEJO_SERVICIO_NO_CUBRE", "AMARILLO")


def test_primera_corrida_es_linea_base_sin_rojo():
    base, odoo = escenario()
    r = Obj2(base, odoo, {"desde": "2024-01"}, AHORA).correr()
    assert r["veredicto"] == "AMARILLO" and r["conteos"]["linea_base"]
    for c in ("O2_MONTO_ATIPICO", "O2_POSIBLE_DUPLICADO", "O2_CARGO_EN_DIA_INHABIL", "O2_TRASPASO_SIN_PAREJA"):
        assert cod(r, c, "AMARILLO"), c
    assert cod(r, "O2_MONTO_ATIPICO")[0]["evidencia"]["movimientos"] == [40]
    assert not cod(r, "O2_MONTO_ATIPICO", "ROJO")


def test_lo_nuevo_es_rojo_y_lo_ya_visto_no():
    base, odoo = escenario()
    r1 = Obj2(base, odoo, {"desde": "2024-01"}, AHORA).correr()
    base["ultima_obj2"] = {"id": 1, "conteos": r1["conteos"]}
    base["marcados_prev"] = [{"codigo": h["codigo"], "movimientos": h["evidencia"]["movimientos"]}
                             for h in r1["hallazgos"] if "movimientos" in h["evidencia"]]
    r2 = Obj2(base, odoo, {"desde": "2024-01"}, AHORA).correr()
    assert r2["veredicto"] == "AMARILLO"                             # nada cambió: ningún ROJO
    # un duplicado nuevo y un movimiento que dejó de estar en Odoo → ROJO
    base["movimientos"] += [dict(base["movimientos"][2], id=99, renglon=99, cargo=4500, descripcion="PAGO X", referencia="R"),
                            dict(base["movimientos"][2], id=98, renglon=98, cargo=4500, descripcion="PAGO X", referencia="R")]
    e = next(x for x in base["estados"] if x["id"] == 10)
    e["total_cargos"] += 9000; e["num_cargos"] += 2
    odoo2 = [l for l in odoo if l["id"] != 901]
    r3 = Obj2(base, odoo2, {"desde": "2024-01"}, AHORA).correr()
    assert r3["veredicto"] == "ROJO"
    assert cod(r3, "O2_POSIBLE_DUPLICADO", "ROJO") and cod(r3, "O2_DEJO_DE_ESTAR_EN_ODOO", "ROJO")[0]["evidencia"]["movimientos"] == [2]


def test_clasificacion_y_destinos_suman_el_total():
    base, odoo = escenario()
    r = Obj2(base, odoo, {"desde": "2024-01"}, AHORA).correr()
    n = r["conteos"]["movimientos"]
    assert sum(r["categorias"].values()) == n and sum(r["destinos_er"].values()) == n
    assert r["destinos_er"]["excluir_traspaso"] == 1


def test_montos_que_no_cuadran_son_rojo():
    base, odoo = escenario()
    base["estados"][0]["total_cargos"] += 1
    r = Obj2(base, odoo, {"desde": "2024-01"}, AHORA).correr()
    assert r["veredicto"] == "ROJO" and cod(r, "O2_DOS_CAMINOS_NO_CUADRAN", "ROJO")


def test_apagado_no_corre():
    base, odoo = escenario()
    r = Obj2(base, odoo, {"activo": False}, AHORA).correr()
    assert r["conteos"]["objetivo2"] == "APAGADO" and not r["hallazgos"]
