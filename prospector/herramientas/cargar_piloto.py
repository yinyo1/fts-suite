"""Semana 1 del piloto: cargar la base del motor 3 con lo que ya esta medido.

QUE CARGA, Y QUE NO. Carga cuentas, senales con su expediente completo y una
tarjeta abierta por cuenta. **No carga ni un contacto**, y no es una omision: la
semana 1 del piloto es levantar la base y validar sus reglas, y las reglas que hay
que validar -- una tarjeta abierta por cuenta, el CHECK del desmentido, la vista de
correos enviables-- no necesitan a nadie. Los contactos entran en la semana 2, con
la revision de Esteban, y los toques en la semana 3.

Y NO CARGA NINGUN CIERRE, tampoco por omision: no ha cerrado ninguna tarjeta. Por
eso las tres compuertas del aprendizaje van a decir `sin_datos` y no `prematuro`, y
la diferencia importa -- `prematuro` es "hay datos y no alcanzan", `sin_datos` es
"no hay ni uno"--. Que digan `sin_datos` en la semana 1 es el resultado correcto.

DE DONDE SALEN LOS DATOS. De `datos/senales-documentadas.json`, con la procedencia
de cada senal, y del evaluador -- que se corre aqui para que el puntaje que entra a
la base sea el que el codigo calcula, no un numero transcrito--.

LAS CUENTAS CON HUECO NO SE CARGAN. Una cuenta sin senal documentada no puede
tener una fila en `senal`, y meterla con fuente NULL romperia el NOT NULL de esa
columna -- que esta ahi justo para eso--. Se listan aparte, y quedan como el trabajo
de declararlas.
"""
from __future__ import annotations
import argparse
import json
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flujo import importacion_odoo as io
from flujo import radar
from flujo.base_motor3 import Base, SinPostgres, resumen_del_piloto

import linea_base_radar as lb

ESQUEMA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "datos", "esquema-motor3.sql")


def _llave_de_corrida(c: dict) -> str:
    return f"{c['empresa']}/{c.get('planta') or '?'}"


def _fecha_y_precision(declarada) -> tuple[str | None, str]:
    """La fecha como la base la puede guardar, y con que precision se supo.

    De las tres senales que se pudieron fechar en #340, una trae dia -- «anuncio
    17-jul-2025»-- y dos traen solo mes -- «anunciada nov-2023», «arranque de obra
    marzo-2025»--. Una columna `date` no acepta "2023-11", asi que el mes se
    normaliza al DIA 1 y la precision queda declarada al lado.

    AL DIA 1 Y NO AL 15: hace la senal hasta 30 dias mas VIEJA de lo que podria ser,
    nunca mas fresca. Para la curva de frescura ese es el lado conservador, y una
    fecha que solo se sabe al mes no deberia ganarle puntos a una que se sabe al dia.

    El evaluador NO usa esto: `radar.dias_de_antiguedad` lee la cadena original con
    su precision. Esta normalizacion es para la base, y por eso la declarada se
    guarda tal cual al lado.
    """
    s = (str(declarada).strip() if declarada else "")
    if not s:
        return (None, "dia")
    if len(s) == 4 and s.isdigit():
        return (f"{s}-01-01", "anio")
    if len(s) == 7:
        return (f"{s}-01", "mes")
    return (s, "dia")


def cargar(b: Base, hoy: date | None = None, aplicar_esquema: bool = True) -> dict:
    hoy = hoy or date.today()
    with open(lb.RUTA, encoding="utf-8") as f:
        d = json.load(f)

    if aplicar_esquema:
        # Desde cero: la semana 1 valida el esquema, y validarlo encima de una
        # base sucia no valida nada. `CREATE TYPE` falla si el tipo existe, asi
        # que reaplicar sin borrar no alcanza.
        b.correr("DROP SCHEMA IF EXISTS motor3 CASCADE;")
        b.archivo(ESQUEMA)

    con_senal = [c for c in d["cuentas"] if c.get("fuente")]
    huecos = [c for c in d["cuentas"] if not c.get("fuente")]

    cuentas, senales, tarjetas = [], [], []
    for i, c in enumerate(con_senal, 1):
        cuentas.append({
            "id": i,
            # LA LLAVE DE RECICLAJE VA EN NULL, y es lo correcto: sale de un
            # correo ANCLA observado, y aqui no hay contactos cargados. Inventarla
            # del nombre del dominio de la empresa seria la llave por nombre con
            # un disfraz, que es lo que el diseno rechazo.
            "llave_de_reciclaje": None,
            "llave_de_corrida": _llave_de_corrida(c),
            "empresa": c["empresa"], "planta": c.get("planta"),
            "giro": c.get("giro"),
            "en_padron_denue": c.get("en_padron_denue"),
            "usuario_odoo_id": None,
            # `creada` NO va: tiene DEFAULT now() y mandarla como NULL explicito
            # lo pisa. Lo mismo con `declarada`, `abierta` y `agregada`.
        })
        # El puntaje se CALCULA aqui, no se transcribe.
        ev = radar.evaluar({"texto": c["texto"], "fuente": c["fuente"],
                            "fecha": c.get("fecha_senal"),
                            "giro": c.get("giro") or "",
                            "empata_padron": bool(c.get("en_padron_denue"))},
                           hoy=hoy)
        tipo, _ = radar.tipo_de_senal_de(c["fuente"], c.get("tipo") or "")
        fecha, precision = _fecha_y_precision(c.get("fecha_senal"))
        senales.append({
            "id": i, "cuenta_id": i,
            "fuente": c["fuente"], "tipo": tipo,
            "texto": c["texto"],
            "fecha_senal": fecha,
            "fecha_senal_precision": precision,
            "fecha_senal_declarada": c.get("fecha_senal"),
            "fecha_de_cierre": None, "fecha_del_evento": None,
            "puntaje": ev["puntaje"], "veredicto": ev["veredicto"],
            "familia": ev["familia"],
            "empata_padron": bool(c.get("en_padron_denue")),
            "desglose": ev["desglose"],
            "evaluada": True,
        })
        paquete = {"senal_origen": {"fuente": c["fuente"], "tipo": tipo,
                                    "fecha_senal": c.get("fecha_senal")}}
        caduca, por_que = io.razon_de_caducidad(paquete, hoy)
        # OPCION C, aprobada en #340. Una tarjeta cuya senal ya caduco antes de
        # cargarla NO nace abierta: nace en `vencida_sin_trabajar`, que es un
        # estado propio y no un cierre.
        #
        # Las dos cosas que eso compra, y las dos importan:
        #
        #  1. NO ENTRA A LOS LAZOS. No hay `cierre`, y las tres vistas del
        #     aprendizaje (`conversion_por_fuente`, `conversion_por_padron`,
        #     `dias_hasta_respuesta_por_tipo`) leen de `cierre`. Un cierre
        #     fabricado le diria al lazo 1 que esa fuente NO CONVIRTIO, cuando la
        #     verdad es que nunca se intento.
        #  2. NO BLOQUEA EL RECICLAJE. El indice unico es PARCIAL sobre
        #     `estado = 'abierta'`, asi que el lugar de la cuenta queda libre y el
        #     destino 2 puede abrir una tarjeta nueva el dia que llegue senal
        #     fresca -- con el historial de esta, que es justo lo que necesita--.
        #
        # `caducidad_original` guarda la fecha que ya se paso. El CHECK del esquema
        # la exige: sin ella nadie podria decir de cuando era la senal que la mato.
        nace_vencida = str(caduca) < hoy.isoformat()
        tarjetas.append({
            "id": i, "cuenta_id": i, "senal_id": i,
            "estado": "vencida_sin_trabajar" if nace_vencida else "abierta",
            "caduca_el": caduca, "caduca_por_que": por_que,
            "caducidad_original": caduca if nace_vencida else None,
            "reabierta_vencida": False,
            "reaperturas": 0, "odoo_lead_id": None,
            # `cerrada` tampoco: el CHECK exige que sea NULL mientras no este
            # cerrada, y el DEFAULT ya la deja asi. `vencida_sin_trabajar` NO es
            # `cerrada`: nunca se trabajo, y esa distincion es el punto entero.
        })

    b.cargar_json("motor3.cuenta", cuentas)
    b.cargar_json("motor3.senal", senales)
    b.cargar_json("motor3.tarjeta", tarjetas)
    b.cargar_json("motor3.tarjeta_senal",
                  [{"tarjeta_id": t["id"], "senal_id": t["senal_id"],
                    "reabrio": False} for t in tarjetas])
    # Las secuencias quedan detras porque los ids se pusieron a mano. Sin esto, el
    # primer INSERT sin id de la semana 2 choca con la llave primaria.
    for tabla in ("cuenta", "senal", "tarjeta"):
        b.correr(f"SELECT setval(pg_get_serial_sequence('motor3.{tabla}','id'), "
                 f"coalesce((SELECT max(id) FROM motor3.{tabla}), 1));")
    # LAS TARJETAS QUE NACEN VENCIDAS, con el estado que #340 aprobo. Salio
    # cargando de verdad: Coficab/Durango tiene senal del 8-dic-2025 y tipo
    # `obra_nueva`, asi que su ventana de 120 dias cerro en abril de 2026.
    #
    # Antes se cargaban ABIERTAS y solo se reportaban, y eso dejaba dos cosas
    # rotas: el tablero las mostraba como trabajo vivo, y una tarjeta muerta
    # ocupando el unico lugar `abierta` de la cuenta BLOQUEABA el reciclaje. Con
    # `vencida_sin_trabajar` las dos se arreglan sin fabricar un cierre.
    #
    # Se siguen reportando, porque el numero es una metrica DEL PROCESO y no del
    # radar: mide cuanto tarda el equipo en trabajar lo que el radar detona.
    vencidas = [{"llave": _llave_de_corrida(c),
                 "caduca": tj["caduca_el"], "por_que": tj["caduca_por_que"],
                 "estado": tj["estado"],
                 "dias_vencida": (hoy - date.fromisoformat(str(tj["caduca_el"]))).days}
                for c, tj in zip(con_senal, tarjetas)
                if tj["estado"] == "vencida_sin_trabajar"]
    return {
        "cuentas_cargadas": len(cuentas),
        "tarjetas_vencidas_al_cargar": vencidas,
        "huecos_no_cargados": [_llave_de_corrida(c) for c in huecos],
        "resumen": resumen_del_piloto(b),
        "tarjetas": [{"llave": _llave_de_corrida(c),
                      "puntaje": s["puntaje"], "veredicto": s["veredicto"],
                      "caduca": t["caduca_el"], "por_que": t["caduca_por_que"]}
                     for c, s, t in zip(con_senal, senales, tarjetas)],
    }


def verificar_reglas(b: Base) -> list[dict]:
    """Las tres reglas del esquema, contra los datos que se acaban de cargar.

    No se prueban con filas de juguete: se prueban contra las cuentas reales del
    piloto. Un CHECK que funciona con un caso inventado y no con el dato real no
    sirve de nada.
    """
    fuera = []

    def probar(nombre, sql, espera_error: str):
        try:
            b.correr(sql)
            fuera.append({"regla": nombre, "resultado": "LA BASE LO ACEPTO",
                          "ok": False})
        except SinPostgres as e:
            fuera.append({"regla": nombre, "ok": espera_error in str(e),
                          "resultado": ("rechazado por " + espera_error
                                        if espera_error in str(e)
                                        else str(e)[:160])})

    # 1. una sola tarjeta abierta por cuenta
    probar("una tarjeta abierta por cuenta",
           "INSERT INTO motor3.tarjeta (cuenta_id, senal_id) VALUES (1, 1);",
           "tarjeta_una_abierta_por_cuenta")

    # 2. el CHECK del desmentido. Hace falta un contacto, y se crea con un
    #    marcador -- no una persona-- porque lo que se prueba es la REGLA.
    b.correr("INSERT INTO motor3.contacto (cuenta_id, nombre, puesto, correo, "
             "nivel_correo) VALUES (1, '[marcador de prueba]', "
             "'[puesto de prueba]', 'test@ejemplo.mx', 'confirmado') "
             "ON CONFLICT DO NOTHING;")
    cid = b.correr("SELECT id FROM motor3.contacto ORDER BY id LIMIT 1;").strip()
    probar("el silencio no desmiente",
           f"INSERT INTO motor3.desmentido (contacto_id, campo, que_paso) "
           f"VALUES ({cid}, 'correo', 'sin_respuesta');",
           "solo_los_que_de_verdad_desmienten")
    probar("una respuesta negativa no desmiente",
           f"INSERT INTO motor3.desmentido (contacto_id, campo, que_paso) "
           f"VALUES ({cid}, 'correo', 'respuesta_negativa');",
           "solo_los_que_de_verdad_desmienten")

    # 3. la vista de correos enviables, con el desmentido de por medio
    antes = b.correr("SELECT count(*) FROM motor3.correo_que_si_se_puede_enviar;"
                     ).strip()
    b.correr(f"INSERT INTO motor3.desmentido (contacto_id, campo, que_paso, fecha) "
             f"VALUES ({cid}, 'correo', 'rebote', current_date);")
    nivel = b.correr(f"SELECT nivel_correo FROM motor3.contacto WHERE id={cid};"
                     ).strip()
    despues = b.correr("SELECT count(*) FROM motor3.correo_que_si_se_puede_enviar;"
                       ).strip()
    fuera.append({
        "regla": "un correo desmentido sale de los enviables",
        "ok": antes == "1" and despues == "0" and nivel == "confirmado",
        "resultado": (f"enviables antes {antes}, despues {despues}; y la fila "
                      f"SIGUE diciendo nivel '{nivel}' -- no se edita, y el "
                      f"desmentido le gana igual"),
    })
    # Se limpia lo que la verificacion metio: la base del piloto no se queda con
    # un contacto de prueba adentro.
    b.correr(f"DELETE FROM motor3.desmentido WHERE contacto_id={cid};")
    b.correr(f"DELETE FROM motor3.contacto WHERE id={cid};")
    return fuera


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--socket", default="")
    ap.add_argument("--puerto", default="5440")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    b = Base(socket=a.socket, puerto=a.puerto)
    r = cargar(b)
    r["reglas"] = verificar_reglas(b)
    if a.json:
        print(json.dumps(r, ensure_ascii=False, indent=2, default=str))
    else:
        print(f"\n  PILOTO · SEMANA 1 — base cargada")
        print(f"  {r['cuentas_cargadas']} cuentas con senal documentada")
        print(f"  huecos NO cargados ({len(r['huecos_no_cargados'])}): "
              f"{', '.join(r['huecos_no_cargados'])}\n")
        print(f"  {'tarjeta':26} {'puntaje':>8} {'veredicto':>9}  caduca")
        print("  " + "-" * 68)
        for t in r["tarjetas"]:
            print(f"  {t['llave']:26} {t['puntaje']:>8} {t['veredicto']:>9}  "
                  f"{t['caduca']}")
        if r["tarjetas_vencidas_al_cargar"]:
            n = len(r["tarjetas_vencidas_al_cargar"])
            print(f"\n  ◐  {n} TARJETA(S) NACEN VENCIDAS — cargadas como "
                  "'vencida_sin_trabajar' (opcion C de #340)")
            for v in r["tarjetas_vencidas_al_cargar"]:
                print(f"     · {v['llave']} caduco {v['caduca']} "
                      f"({v['dias_vencida']} dias) — {v['por_que']}")
            print("     NO entran a los tres lazos -- no hay cierre-- y NO ocupan "
                  "el lugar `abierta` de la cuenta:")
            print("     si llega senal fresca, el destino 2 reabre CON el "
                  "historial de esta. Las lista `vencidas_sin_trabajar`.")
            print("     Ese numero mide AL EQUIPO, no al radar: es cuanto tarda "
                  "en trabajarse lo que el radar detona.")
            print("     No se cierran solas: un cierre sin un solo toque seria un "
                  "expediente inventado")
            print("     y entraria a los tres lazos como un desenlace real. Lo "
                  "decide una persona.")
        print("\n  RESUMEN DE LA BASE")
        for k, v in r["resumen"].items():
            print(f"     {k:24} {v}")
        print("\n  LAS TRES REGLAS, contra los datos reales del piloto")
        for x in r["reglas"]:
            print(f"     [{'OK ' if x['ok'] else 'FALLA'}] {x['regla']}")
            print(f"            {x['resultado']}")
        print()
