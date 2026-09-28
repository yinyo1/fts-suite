"""Verifica una subida a OneDrive que NO salio de una corrida.

POR QUE HACIA FALTA. La comparacion que nacio de #306 -- la subida de Pesqueria
difirio en un byte y la entrega se dio por buena porque nadie comparo el
contenido-- vivia dentro de `Corrida.registrar_entrega`. Los dos entregables de
esta noche no los produce una corrida: el CSV de la etapa 1 lo arma
`exportar_etapa1.py` y la tarjeta del piloto la arma `tarjeta_hershey.py`. Al
intentar registrarlos, `prospector entregar` respondio:

    No hay corrida para 'Hershey' en 'Escobedo'. Corre primero: prospecta

Es decir: los archivos que SI se suben eran justo los que se subian sin pasar por
la unica comprobacion que el repo tiene para eso. La leccion de #306 no es de las
fichas, es de cualquier archivo que sale de aqui, y el veredicto ahora vive suelto
en `flujo.estado.comparar_subida` para que las dos vias lo usen.

QUE VERIFICA CADA COSA, de mas fuerte a mas debil:

  --sha256 del conector      el servicio hasheo los bytes que tiene guardados
  --sha256 --releido         se leyo de vuelta y se hasheo aqui (ida y vuelta)
  --base64-confirmado        el servidor confirmo la LONGITUD exacta al subir
  --bytes                    solo el tamano, y el tamano NO verifica contenido
  (nada)                     sin verificar, y se dice asi

El registro se escribe en `datos/entregas-fuera-de-corrida.json`, que vive en el
repo: es lo unico de esta subida que sobrevive al contenedor.
"""
from __future__ import annotations
import argparse
import json
import os
import sys
from datetime import datetime, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

from flujo.estado import Corrida, comparar_subida

REGISTRO = os.path.join(RAIZ, "datos", "entregas-fuera-de-corrida.json")

ROTULOS = {
    "identico": "✓ contenido VERIFICADO por sha256 del conector: identico al local",
    "identico_por_relectura":
        "✓ contenido VERIFICADO releyendo el archivo: identico al local byte por "
        "byte (el conector no da hash propio)",
    "DIFIERE": "⛔ contenido DISTINTO del local (sha256 no casa)",
    "longitud_confirmada_en_base64":
        "◐ LONGITUD confirmada por el servidor en la subida base64: el byte de mas "
        "de #306 no puede pasar por aqui, y el contenido no quedo comparado",
    "mismo_tamano_sin_hash":
        "⚠  solo se comparo el TAMANO, y coincide — el tamano no verifica contenido",
    "TAMANO_DISTINTO": "⛔ el TAMANO no coincide con el local",
    "sin_verificar": "⚠  SIN VERIFICAR: no se paso --sha256 ni --bytes",
}

# Un veredicto que no esta aqui NO se registra como entrega buena. La lista es
# explicita a proposito: si manana se agrega un veredicto nuevo y nadie decide de
# que lado cae, la herramienta se niega en vez de suponer que sirve.
ACEPTABLES = ("identico", "identico_por_relectura",
              "longitud_confirmada_en_base64")


def verificar(ruta: str, url: str, sha256_subido: str = "",
              bytes_subidos: int | None = None, releido: bool = False,
              base64_confirmado: bool = False, nota: str = "") -> dict:
    if not (url or "").strip():
        raise SystemExit(
            "Una entrega sin liga no se puede comprobar, y el punto de "
            "entregarla es que el operador la encuentre cuando esta sesion ya no "
            "exista. Falta --url.")
    local = Corrida.huella(ruta) if os.path.exists(ruta) else {}
    veredicto, avisos = comparar_subida(
        local, sha256_subido=sha256_subido, bytes_subidos=bytes_subidos,
        hash_de_relectura=releido,
        base64_con_longitud_confirmada=base64_confirmado)
    return {
        "archivo": os.path.basename(ruta), "ruta_local": ruta,
        "url": url.strip(), "ts": datetime.now(timezone.utc).isoformat(),
        "local": local, "sha256_subido": (sha256_subido or "").strip(),
        "bytes_subidos": bytes_subidos, "hash_de_relectura": bool(releido),
        "base64_con_longitud_confirmada": bool(base64_confirmado),
        "verificacion": veredicto, "avisos_de_verificacion": avisos,
        "verificacion_aceptable": veredicto in ACEPTABLES,
        "nota": nota.strip(),
    }


def registrar(entrada: dict, registro: str = REGISTRO) -> list:
    previas = []
    if os.path.exists(registro):
        with open(registro, encoding="utf-8") as f:
            previas = json.load(f).get("entregas", [])
    # Una subida nueva del MISMO archivo reemplaza a la anterior: el registro dice
    # donde esta la copia vigente, no cuantas veces se subio.
    previas = [e for e in previas if e["archivo"] != entrada["archivo"]]
    previas.append(entrada)
    with open(registro, "w", encoding="utf-8") as f:
        json.dump({
            "que_es": "Entregas a OneDrive de archivos que NO produce una "
                      "corrida: el CSV de la etapa 1 y las tarjetas del piloto. "
                      "`prospector entregar` no las puede registrar porque exige "
                      "una corrida, y sin esto se subian sin comparar nada.",
            "reglas_duras": [
                "Cero escrituras a Odoo: el CSV lo importa una PERSONA.",
                "Sin datos personales: ni nombres ni correos ni celulares.",
            ],
            "entregas": previas,
        }, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return previas


def imprimir(e: dict) -> None:
    print(f"\n  {'✓' if e['verificacion_aceptable'] else '⚠'} ENTREGA "
          f"{'REGISTRADA' if e['verificacion_aceptable'] else 'CON RESERVA'}: "
          f"{e['archivo']}")
    print(f"     liga:     {e['url']}")
    print(f"     verifica: {ROTULOS.get(e['verificacion'], e['verificacion'])}")
    if e["local"]:
        print(f"     local:    {e['local']['bytes']:,} bytes · sha256 "
              f"{e['local']['sha256'][:16]}…")
    else:
        print("     local:    (no se encontro el archivo en disco: nada que "
              "comparar)")
    for a in e["avisos_de_verificacion"]:
        print(f"       · {a}")
    print()


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--archivo", required=True, help="la ruta local que se subio")
    p.add_argument("--url", required=True, help="la liga del archivo ya subido")
    p.add_argument("--sha256", default="",
                   help="el hash que devolvio el conector de la copia subida")
    p.add_argument("--releido", action="store_true",
                   help="el sha256 NO lo dio el conector: se leyo de vuelta y se "
                        "hasheo aqui")
    p.add_argument("--base64-confirmado", dest="base64_confirmado",
                   action="store_true",
                   help="se subio como base64 declarando la longitud exacta y el "
                        "conector la confirmo")
    p.add_argument("--bytes", dest="bytes_", type=int, default=None)
    p.add_argument("--nota", default="")
    p.add_argument("--sin-registrar", action="store_true",
                   help="solo imprime el veredicto, no toca el registro")
    a = p.parse_args(argv)
    e = verificar(a.archivo, a.url, sha256_subido=a.sha256,
                  bytes_subidos=a.bytes_, releido=a.releido,
                  base64_confirmado=a.base64_confirmado, nota=a.nota)
    imprimir(e)
    if not a.sin_registrar:
        registrar(e)
        print(f"     registro: datos/entregas-fuera-de-corrida.json\n")
    return 0 if e["verificacion_aceptable"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
