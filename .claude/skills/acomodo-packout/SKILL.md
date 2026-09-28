---
name: acomodo-packout
description: Acomoda herramientas en los cajones de un carrito Packout (base con ruedas + modulos de cajones) respetando altura util, peso por cajon, uso diario arriba y pesado abajo, holgura para silueta y dedos, y minimizando modulos y altura de la pila. Usar cuando se pida acomodar un carrito, recalcular un acomodo, probar otra estrategia, o cambiar una herramienta de un cajon.
---

# acomodo-packout

Proyecto Herramientas MX (issue #325). Codigo: `docs/herramientas-mx/scripts/acomodo.py`.
Entradas: `datos/piezas_carrito.json` (piezas con L,A,H,peso,frecuencia) y `datos/contenedores.json` (cajones con interior util).
Salida: `diseno_carrito.xlsx` + `svg/*.svg` (via skill `vista-cajon`).

## Modelo
- **Pieza**: rectangulo L x A (vista superior) con altura H y peso. Rotacion de 90 grados permitida en planta;
  no se acuesta ni se para una pieza (la orientacion "acostada" ya viene en L,A,H).
- **Cajon**: rectangulo util `ancho_util x fondo_util` con `alto_util` y `capacidad_kg`.
  Util = interior medido - labio del cajon - espesor de la base de la silueta - holgura de dedos arriba.
- **Holgura entre piezas** `g = 12 mm` por defecto (6 mm de pared de silueta impresa por lado + margen de agarre).
  Holgura de altura `h = 10 mm` (base de silueta 3 mm + 7 mm para que nada roce al cerrar).
  Ver justificacion en el issue (Fase 4) antes de cambiar estos valores.

## Restricciones duras
1. `H_pieza + h <= alto_util_cajon`.
2. `sum(peso) <= capacidad_kg_cajon` y `sum(peso cajones) <= capacidad_modulo`.
3. Sin traslape en planta, con holgura `g` entre piezas y contra las paredes.
4. Pieza no validada (medida `no validado`) se acomoda pero el cajon queda marcado `no validado`.

## Restricciones blandas (penalizacion)
- Frecuencia `siempre`/`diario` en cajones superiores, `rara` abajo.
- Lo pesado abajo: momento = sum(peso x altura del cajon) minimo.
- Agrupar por familia (un cajon = una familia de herramienta) para que la revision por foto sea obvia.

## Objetivo
Minimizar (1) numero de modulos, (2) altura total de la pila, (3) penalizaciones blandas.

## Cotas de cajon (fabricante, leidas 2026-09-28, #330)
- 8444: 4 cajones de 414 x 318 x **58** mm (2.3 in). 8447: 63 + 63 + 127. 8442: 127 + 127. 8443: 76 x 3. 8441: 1 de 419 x 330 x 260.
- 8420: cajon de 330 de ancho y 406 de alto (fabricante); el fondo de 432 es fragmento. **Sin barra para candado.**

## Regla de candado
Las piezas en `REQUIERE_CANDADO` (M18 y sus baterias) solo van en cajones con barra (`con_barra`), o sea nunca en la 8420.

## Estrategias implementadas
- `fijo` (gana desde #330): prueba todos los juegos de 1 a 3 cajas por modulo, empaca FFD dentro del juego fijo y elige
  el que mete todo con menos cajas, menos alto, al menos un cajon libre de reserva si se puede, y menos penalizacion.
  Las piezas que no caben en ningun cajon se apartan antes (van a Sueltos) para no tumbar la busqueda.
- `ffd`: First-Fit Decreasing por area, cajones ordenados por altura, guillotina con skyline 2D.
- `familia`: primero agrupa por familia y asigna cada familia al cajon mas bajo donde cabe; luego empaca con skyline.
Correr ambas y comparar con `python3 acomodo.py --comparar`.

## Verificacion
`python3 acomodo.py --verificar` recalcula cada cajon con un segundo metodo (area y altura por fuerza bruta de
ubicaciones en rejilla de 5 mm) y reporta diferencias. Fase 7 exige al menos 10 cajones recalculados.
