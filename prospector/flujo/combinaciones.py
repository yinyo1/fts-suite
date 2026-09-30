"""M4 · el motor de combinaciones. Genera las consultas de M5. NO TOCA RED.

Hasta la 0.16.0 este motor **no existia como codigo**. El metodo describia el
producto -- titulos x formas x dominios-- y el agente escribia las consultas a
mano siguiendo el documento. Eso funciona hasta que una regla es sutil, y la
medicion de #353 encontro cuatro que lo son: un puesto de cuatro palabras se
disuelve si no va entre comillas, un puesto global se esconde si se le pone la
planta, una sigla de la casa no se indexa como palabra, y una empresa con dos
nombres se pierde con uno.

Las cuatro se aprobaron en #355 como R1 a R4 y aqui se aplican. La razon de que
vivan en codigo y no en prosa es la misma que la del resto de la herramienta:
una regla que depende de que alguien se acuerde no es una regla.

QUE NO HACE. No corre nada, no cuenta gasto y no decide el orden del plan: eso
es de `compuertas.py` y de `arranque.py`. Devuelve la LISTA de consultas, en
orden de rendimiento esperado, para que quien corra M5 las gaste de arriba hacia
abajo y pare cuando la compuerta se lo diga.
"""
from __future__ import annotations

import re
import unicodedata

from flujo.catalogo import FORMAS_M5, formas_de_m5

# --------------------------------------------------------------------------- R1
# El puesto entre comillas cuando tiene TRES palabras o mas.
#
# Medido en #353: `Global Purchasing Performance Manager` de una cuenta
# automotriz da CERO con las palabras sueltas -- el buscador las trata como
# cuatro terminos independientes y devuelve cualquier cosa que tenga tres-- y
# SALE con la frase entre comillas, con ciudad y todo.
#
# Tres es el corte, no dos: con dos palabras la frase exacta es demasiado
# estrecha y pierde las variantes de orden ("gerente mantenimiento" contra
# "mantenimiento gerente"), que en espaniol son comunes.
PALABRAS_PARA_ENTRECOMILLAR = 3

# --------------------------------------------------------------------------- R2
# El nivel corporativo se busca SIN ancla de planta.
#
# Un puesto que empieza con una de estas palabras NO vive en una planta, y
# anclarlo a una lo esconde. De los 32 contactos que la herramienta no traia en
# #353, SIETE eran de este nivel.
#
# Las palabras van sin acento porque se comparan contra el texto normalizado.
PALABRAS_DE_NIVEL_CORPORATIVO = (
    "global", "corporate", "corporativo", "corporativa",
    "regional", "nacional", "national", "worldwide", "americas",
)

# --------------------------------------------------------------------------- R3
# Las siglas de la casa se EXPANDEN antes de consultar.
#
# La capa de vacantes (M2) ya cosecha las siglas internas -- en #353 trajo
# GWP = Global Workplace Projects, LOM = LEGO Operaciones de Mexico, IntlRME de
# Amazon-- pero se quedaban en el vocabulario y no entraban a las consultas. Un
# puesto que se llama `Head of GWP Projects LOM` se buscaba por sus siglas, que
# el indice no indexa como palabras.
#
# Medido: cero con la sigla, y con la sigla expandida aparece el rol.
LARGO_MINIMO_DE_SIGLA = 2
# Ocho, no cinco. `IntlRME` -- la forma en que Amazon escribe la suya-- son siete
# caracteres, y un tope de cinco la dejaba fuera. Pasarse de largo es barato: una
# palabra que se cace por error y que M2 no haya expandido NO se toca, asi que el
# falso candidato no produce ni una consulta.
LARGO_MAXIMO_DE_SIGLA = 8
_SIGLA = re.compile(r"\b([A-Z][A-Za-z]*[A-Z][A-Za-z]*)\b")


def _plano(s: str) -> str:
    """Minusculas sin acentos. Para comparar, nunca para emitir."""
    t = unicodedata.normalize("NFD", str(s or "").lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def es_nivel_corporativo(puesto: str) -> str:
    """La palabra de nivel corporativo que el puesto trae, o cadena vacia."""
    p = f" {' '.join(_plano(puesto).split())} "
    for w in PALABRAS_DE_NIVEL_CORPORATIVO:
        if f" {w} " in p:
            return w
    return ""


def siglas_del_puesto(puesto: str) -> list[str]:
    """Las siglas candidatas del puesto, tal cual vienen escritas.

    Una sigla es una palabra de 2 a 5 letras con DOS mayusculas o mas. Eso caza
    `GWP`, `LOM`, `NPI`, `RME`, `EHS` y tambien `IntlRME`, que es la forma en que
    Amazon escribe la suya -- y que un filtro de "todo mayusculas" dejaria
    pasar--.
    """
    fuera = []
    for m in _SIGLA.finditer(str(puesto or "")):
        s = m.group(1)
        if LARGO_MINIMO_DE_SIGLA <= len(s) <= LARGO_MAXIMO_DE_SIGLA:
            fuera.append(s)
    return fuera


def expandir_siglas(puesto: str, siglas: dict[str, str] | None = None) -> str:
    """El puesto con sus siglas cambiadas por lo que M2 cosecho, o el mismo.

    `siglas` es el vocabulario de la casa: {'GWP': 'Global Workplace Projects'}.
    Una sigla que M2 no expandio NO se toca: inventarle una expansion seria
    inventar vocabulario, y el motor no hace eso.
    """
    tabla = {k.upper(): v for k, v in (siglas or {}).items() if v}
    if not tabla:
        return str(puesto or "")
    fuera = str(puesto or "")
    for s in siglas_del_puesto(fuera):
        exp = tabla.get(s.upper())
        if exp:
            fuera = re.sub(r"\b" + re.escape(s) + r"\b", exp, fuera)
    return fuera


def _texto_del_puesto(puesto: str) -> tuple[str, bool]:
    """El puesto como va en la consulta, y si se entrecomillo (R1)."""
    p = " ".join(str(puesto or "").split())
    if len(p.split()) >= PALABRAS_PARA_ENTRECOMILLAR:
        return (f'"{p}"', True)
    return (p, False)


def consultas_de_m5(empresa: str,
                    puestos,
                    ciudad: str | None = None,
                    pais: str | None = None,
                    alias_de_empresa=(),
                    siglas_de_la_casa: dict[str, str] | None = None) -> list[dict]:
    """La lista de consultas de M5, en orden de rendimiento esperado.

    Cada consulta es un dict con:
      texto   -- la consulta, lista para pegar en el buscador
      forma   -- la clave de `catalogo.FORMAS_M5` que la produjo
      puesto  -- el puesto original, para poder contar cobertura por puesto
      nombre  -- con que nombre de la empresa se pregunto (R4)
      reglas  -- las reglas de #355 que la tocaron
      por_que -- una linea que explica que agrega esta consulta y no otra

    El ORDEN es: primero, por puesto, la forma canonica; despues las variantes
    que las reglas agregan. Asi, si la compuerta corta a la mitad, lo que se
    gasto son las consultas que mas rinden y no las variantes de una sola.
    """
    formas = formas_de_m5(pais)
    plantillas = {f[0]: f[1] for f in FORMAS_M5}
    nombres = [empresa] + [a for a in alias_de_empresa
                           if _plano(a) != _plano(empresa)]
    fuera, vistas = [], set()

    def agrega(texto, forma, puesto, nombre, reglas, por_que):
        clave = " ".join(texto.lower().split())
        if clave in vistas:
            return
        vistas.add(clave)
        fuera.append({"texto": texto, "forma": forma, "puesto": puesto,
                      "nombre": nombre, "reglas": tuple(reglas),
                      "por_que": por_que})

    for puesto in puestos:
        corporativo = es_nivel_corporativo(puesto)
        expandido = expandir_siglas(puesto, siglas_de_la_casa)
        # Las variantes del PUESTO: la literal, y la expandida si R3 la cambio.
        variantes = [(puesto, ())]
        if _plano(expandido) != _plano(puesto):
            variantes.append((expandido, ("R3",)))

        for texto_puesto, reglas_puesto in variantes:
            cuerpo, entrecomillado = _texto_del_puesto(texto_puesto)
            reglas = list(reglas_puesto) + (["R1"] if entrecomillado else [])
            for nombre in nombres:
                reglas_nombre = reglas + (["R4"] if nombre != empresa else [])
                for clave in formas:
                    base = plantillas[clave].format(puesto=cuerpo,
                                                    empresa=nombre)
                    # R2 -- el nivel corporativo va SIN la ciudad. Y cuando el
                    # puesto NO es corporativo, la ciudad se agrega: es el
                    # comportamiento de siempre.
                    if corporativo:
                        agrega(base, clave, puesto, nombre,
                               reglas_nombre + ["R2"],
                               f"nivel corporativo por «{corporativo}»: sin "
                               f"ancla de planta, porque ese puesto no vive en "
                               f"una")
                    elif ciudad:
                        agrega(f"{base} {ciudad}", clave, puesto, nombre,
                               reglas_nombre,
                               "puesto de planta: con ancla de ciudad en el "
                               "texto, que SUGIERE y no filtra")
                        agrega(base, clave, puesto, nombre, reglas_nombre,
                               "la misma, sin ciudad: el ancla en el texto "
                               "tambien puede esconder a quien no la escribio "
                               "en su perfil")
                    else:
                        agrega(base, clave, puesto, nombre, reglas_nombre,
                               "sin ciudad declarada")
    return fuera


def cuantas_agrega_cada_regla(consultas) -> dict[str, int]:
    """Cuantas consultas puso cada regla. Para poder decir lo que cuestan."""
    cuenta = {"R1": 0, "R2": 0, "R3": 0, "R4": 0, "sin_regla": 0}
    for c in consultas:
        if not c["reglas"]:
            cuenta["sin_regla"] += 1
        for r in c["reglas"]:
            cuenta[r] = cuenta.get(r, 0) + 1
    return cuenta
