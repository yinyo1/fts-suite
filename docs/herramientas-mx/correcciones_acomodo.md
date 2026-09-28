# Correcciones al acomodo antes de los renders

Issue #343, bloque 1. Script: `scripts/correcciones_juegos_8420.py`. Datos: `datos/opciones_8420.json` y `datos/fuentes_piezas_individuales.json`. Hoja nueva `Huecos_individuales` en `diseno_carrito.xlsx`.

## 1. Juegos en huecos individuales

La revisión por foto tiene que ver cada pieza. Un estuche completo en un solo hueco esconde la pieza que falta.

| Juego | Cajón | Antes | Ahora | De dónde sale cada medida |
|---|---|---|---|---|
| Dados de la caja P | BASE C4 | estuche completo con la matraca | **dadera: 29 dados parados, uno por hueco**, 230.0 × 80.0 mm | Home Depot México, una ficha por medida (D1). El dado de 11 mm no tiene ficha: usa las del de 10 mm (supuesto) |
| Matraca 3/8 | BASE C4 | dentro del estuche | pieza aparte, 240 × 42 × 34 | Home Depot México sku 106478 (D1) |
| Desarmadores de precisión (6) | BASE C6 | estuche | 6 huecos de 190 × 12.5 | envolvente del estuche (F) entre 6. Ajustar con vernier |
| Brocas (15) | BASE C3 | estuche 150 × 80 | 15 huecos, cada uno del diámetro nominal (1/16 a 1/2) | **no cabían acostadas en los 80 mm**: los diámetros suman 107 mm, más 14 paredes de 3 mm = 149 mm. La ficha crece a 150 × 149 |
| 3 desarmadores juntos | BASE C5 y C6 | un hueco para los 3 | 3 huecos de 230 × 31.3 | envolvente de los 3 juntos (F) entre 3 |
| Adaptadores (3) | BASE C6 | 70 × 40 | 3 huecos de 70 × 19 | los 11 mm de repartir 40 entre 3 no alcanzaban para el cuadro de 1/2 (12.7). 19 mm es el grueso del empaque de Home Depot 106475 (D1): ningún adaptador es más grueso que su empaque |
| Extensiones 6 y 10 in y maneral | BASE C6 | 3 barras juntas | 3 huecos con su largo: 152, 254 y 230 | largo nominal del nombre; maneral Home Depot 106480 (D1). La ficha de Home Depot de la extensión de 6 in dice 21.5 cm: es el empaque y se descarta |

**Los pesos de Home Depot de los dados no son confiables** (hay dados de 0.5 a 1 kg). Se usaron tal cual para el chequeo de capacidad, que queda del lado seguro: C4 carga 10.8 de 11 kg. Con 60 g por dado serían unos 3.9 kg.

**Qué ya no cabía:** nada. Brocas y adaptadores crecieron y sus cajones se volvieron a acomodar (C3 y C6). C6 se queda con el acomodo que tenía y pasa. Los 27 cajones siguen en PASA JUSTO, ninguno falla ni excede su capacidad.

## 2. La 8420 casi vacía

Antes: C8 con solo la esmeriladora y C9 con solo el cargador, y es la única caja sin barra de candado.

| Opción | Qué es | Costo por base | Alto de la pila | Bajo llave | Estabilidad | Contras |
|---|---|---|---|---|---|---|
| a | 8420 como cajon de consumibles sin candado (discos, cinta, cinchos, brocas de reposicion) con minimos y maximos; esmeril y cargador se quedan en la 8420 | $0 | 1228 mm | todo menos esmeriladora, cargador y consumibles | la de #338 (vuelco a 15.5 grados con un cajon abierto) | la herramienta electrica mas cara de la base sigue sin llave; la esmeriladora no cabe en ningun cajon de 76 o 58 mm (90 mm de alto) |
| b | base plana con ruedas 48-22-8410 + 48-22-8442: esmeril en un cajon de 127 y cargador en el otro, los dos con barra | $698 | 1282 mm | todo | recalculada (scripts/estabilidad.py, base sola, orientacion A): peor cajon abierto BASE C4 vuelca a 10.7 grados (antes 15.5 con C1); todos los de arriba abiertos a 5.7 (antes 9.8); cerrada a 15.0 (antes 17.8). Con los dados a 60 g cada uno, en vez del peso de Home Depot, sube a 13.3 y 7.7. Pierde margen porque la 8410 pesa 5 kg contra 13.2 y su apoyo es mas angosto (supuesto). Con 5 grados sigue en pie en todos los casos | +54 mm de alto; la 8410 no trae asa telescopica: el carrito se empuja; hay que confirmar si las rodajas traen freno |
| c | base plana 8410 + 48-22-8441 (un cajon de 260 mm con barra): esmeril y cargador juntos |  | 1282 mm | todo | como b | NO caben juntos: 6 + 152 + 12 + 155 + 6 = 331 mm contra 330 de fondo; sin precio de la 8441 en el repo |

**Recomendada y aplicada: b.** Es la unica que deja TODO bajo llave con cajas que ya estan en el diseno; cuesta 698 pesos mas por base y ahorra la bandeja impresa. Lo que cuesta en estabilidad no cambia las reglas de uso: un cajon a la vez y nunca en rampa. La a deja sin llave justo la esmeriladora, que es la pieza que mas se ha repuesto (4 veces, caso de negocio). La c no cabe por 1 mm.

Cómo quedó la base: 8410 + 8442 + 8444 + 8443. Esmeriladora en C8 (8442, cajón de 127 mm, 41.2 % ocupado) y cargador en C9 (23.8 %). No caben juntos en un cajón de 127: 6 + 152 + 12 + 155 + 6 = 331 mm contra 318 de fondo.

Lo que sobra en C8 y C9 puede tomar la idea de la opción a: consumibles con mínimos y máximos, ahora bajo llave. No se asignó nada porque no hay lista de consumibles con medidas.

## 3. Costo

| Concepto | Antes (#338) | Ahora |
|---|---|---|
| Piloto (1 base + TUB) | $26,254.73 | **$26,544.79** |
| Plan completo | $316,929.73 | **$319,755.59** |
| Contenedores del piloto | $13,197.00 | $13,895.00 |
| PETG del piloto | $5,837.06 | $5,429.12 (8.58 kg, 431.3 h) |

Qué movió los números:
- La base 8410 + 8442 cuesta $698 más por base que la 8420.
- Ya no hay bandeja impresa en la base: ahorra 902 g y 52 h por base.
- Los huecos individuales llevan pared entre pieza y pieza. Las fichas del cajón piloto C6 pasan de 326 a 424 g, y el C6 completo de 579 a 677 g (33.6 a 39.1 h). Ese cajón es el que da el factor de PETG de todo el plan (de 1.90 a 2.22), así que el plan sube aunque la mayoría de los cajones no tenga juegos. Es conservador.
- Los STL del C6 en `stl/` ya son los nuevos: son los que se imprimen el martes.

## 4. Interferencias y estabilidad

- Interferencias 3D: 27 cajones PASA JUSTO, 0 FALLA. Ver `reporte_interferencias.md`.
- Estabilidad: ver `estabilidad.md`. La base con la 8410 pierde margen: con todos los cajones de arriba abiertos vuelca a 5.7° (antes 9.8°), y con un solo cajón abierto a 10.7° (antes 15.5°). Con 5° sigue en pie en todos los casos. Las reglas de la checklist no cambian: un cajón a la vez y nunca en rampa.

## 5. Fichas de impresión

La ficha de un juego ahora tiene un hueco por pieza (`cad/fts_rejilla.scad`, parámetro `subs`). Cada hueco lleva su profundidad (60 % del alto de la pieza, hasta 25 mm) y su número grabado en el piso si mide 8 mm o más. Las barras llevan una canal de dedos que las cruza por la mitad; los dados no, se toman de arriba.

