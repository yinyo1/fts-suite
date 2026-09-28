# Diseno 3D parametrico y archivos de impresion

Sesion nocturna 1 (#330). Todo es **no validado** hasta medir con vernier: las fichas salen de medidas documentales o
estimadas y el contorno es simplificado (rectangulo con esquinas redondeadas) hasta que haya escaneo.

## Piezas del sistema (`fts_rejilla.scad`)
| Pieza | Que es | Por que asi |
|---|---|---|
| **Loseta** | Placa de 2.4 mm con agujeros de 5.4 mm en una rejilla de **21 mm** (la de 42 mm mas sus puntos medios). El cajon se corta entre agujeros en tramos de 218 mm o menos: 4 losetas en un cajon de 414 x 318 (corte en x = 199.5 y y = 199.5) y 6 en el de la 8420; cada loseta cabe en una cama de 220 x 220. | La rejilla de 42 mm con fichas de celdas enteras (tipo Gridfinity) **no alcanza**: redondear cada ficha a multiplos de 42 mm deja fuera 13 de 27 cajones del acomodo. Por eso la rejilla es de **anclaje**, no de tamano. |
| **Ficha** | Charola por herramienta: piso de 1.2 mm, pared de 3 mm, holgura de 1 mm por lado contra la herramienta, cavidad de min(60 % del alto, 25 mm), dos rebajes de dedo de 22 mm, numero de activo grabado en el piso. Pernos de 5.0 mm solo donde un agujero de la rejilla cae dentro de su huella con 5 mm de margen. | Reacomodar = reimprimir solo esa ficha. Los pernos se calculan con la posicion absoluta que da el acomodo, asi que la ficha entra en un solo lugar. |
| **Bandeja 8420** | 4 cuadrantes de 215 x 164 x 10 mm con costillas cada 42 mm, 4 placas de union (M4 x 16) y 4 postes de 30 mm x 196 mm. Cara superior a 200 mm del piso del cajon. | Divide el cajon de 406 mm en 190 arriba y 200 abajo (Fase 4). La carga de 15 kg por nivel es **supuesto**: Milwaukee solo publica 113 kg del conjunto. |

Holguras (Fase 4): entre piezas 12 mm = 3 pared + 6 agarre + 3 pared; contra la pared del cajon 6 mm; en alto, loseta 2.4 + piso 1.2 = 3.6 mm de base y el resto libre.

## Archivos
- `fts_rejilla.scad`: la libreria (parametros al inicio).
- `cajones/<MODULO>-<CAJON>.scad`: un archivo por cada uno de los 27 cajones del acomodo, generado por `generar_cajon.py`. Se abre en OpenSCAD y el parametro `PARTE` elige que exportar.
- `generar_cajon.py`: `.scad` y STL de un cajon (`python3 cad/generar_cajon.py BASE C6`), o de la bandeja (`--bandeja-8420`).
- `contorno_desde_escaneo.py`: **flujo para el escaneo 3D**. Entra STL u OBJ de la herramienta acostada; sale `cad/contornos/<ID>.json` (poligono de la silueta vista desde arriba, simplificado a 0.5 mm) y un SVG de revision. Si ese archivo existe, `generar_cajon.py` lo usa en lugar del rectangulo. Probado con una malla sintetica de desarmador (210 x 32 x 32 mm, sale exacto) y con la ficha resultante (estanca, un solo cuerpo).
- `estimar_stl.py`: gramos y horas por STL.

## Cajon piloto BASE C6 (48-22-8444, cajon de 58 mm)
Nota: la numeracion cambio en esta sesion. El BASE C6 de hoy lleva:

| Activo | Pieza | Contorno | Niveles L/A/H | Profundidad de cavidad mm |
|---|---|---|---|---|
| FTS-BAS-01-C6-01 | HDS-B | simplificado | FFF | 19.2 |
| FTS-BAS-01-C6-02 | PRES11 | simplificado | D2FF | 15.0 |
| FTS-BAS-01-C6-03 | EXTS | simplificado | FFF | 15.0 |
| FTS-BAS-01-C6-04 | PREC6 | simplificado | FFF | 15.0 |
| FTS-BAS-01-C6-05 | ADAP | simplificado | FFF | 15.0 |

Verificado sobre las STL: todas estancas y de un solo cuerpo; traslape entre fichas 0 mm3; las fichas ocupan x 2 a 401 mm (cajon 414) y y 2 a 314 mm (cajon 318).

## Instrucciones de impresion (ESTIMACION, se mide con el piloto)
PETG, boquilla 0.4, 3 perimetros, 4 capas arriba y abajo, cama a 80 C, boquilla 240 C, sin ventilador las primeras 3 capas.
Gramos y horas: cascara (area x 1.2 mm) + relleno x resto, 1.27 g/cm3, 15 cm3/h en impresora estandar y 30 en rapida, +10 % de viajes.

| STL | Cant. | Caja mm | Capa | Relleno | Soportes | Gramos | Horas estandar / rapida |
|---|---|---|---|---|---|---|---|
| `BASE-C6_ficha_FTS-BAS-01-C6-01_HDS-B_simplificado.stl` | 1 | 108 x 238 x 23 | 0.2 | 15 % giroide | no: el rebaje de dedo es un arco que se imprime sin soporte | 83 | 4.8 / 2.4 |
| `BASE-C6_ficha_FTS-BAS-01-C6-02_PRES11_simplificado.stl` | 1 | 287 x 118 x 18 | 0.2 | 15 % giroide | no: el rebaje de dedo es un arco que se imprime sin soporte | 93 | 5.4 / 2.7 |
| `BASE-C6_ficha_FTS-BAS-01-C6-03_EXTS_simplificado.stl` | 1 | 268 x 88 x 18 | 0.2 | 15 % giroide | no: el rebaje de dedo es un arco que se imprime sin soporte | 70 | 4.1 / 2.0 |
| `BASE-C6_ficha_FTS-BAS-01-C6-04_PREC6_simplificado.stl` | 1 | 198 x 98 x 18 | 0.2 | 15 % giroide | no: el rebaje de dedo es un arco que se imprime sin soporte | 57 | 3.3 / 1.6 |
| `BASE-C6_ficha_FTS-BAS-01-C6-05_ADAP_simplificado.stl` | 1 | 78 x 48 x 18 | 0.2 | 15 % giroide | no: el rebaje de dedo es un arco que se imprime sin soporte | 14 | 0.8 / 0.4 |
| `BASE-C6_loseta0.stl` | 1 | 198 x 156 x 2 | 0.2 | 100 % lineas (queda solida: 2.4 mm) | no | 90 | 5.2 / 2.6 |
| `BASE-C6_loseta1.stl` | 1 | 213 x 156 x 2 | 0.2 | 100 % lineas (queda solida: 2.4 mm) | no | 97 | 5.6 / 2.8 |
| `BASE-C6_loseta2.stl` | 1 | 198 x 159 x 2 | 0.2 | 100 % lineas (queda solida: 2.4 mm) | no | 92 | 5.3 / 2.7 |
| `BASE-C6_loseta3.stl` | 1 | 213 x 159 x 2 | 0.2 | 100 % lineas (queda solida: 2.4 mm) | no | 99 | 5.7 / 2.8 |
| `bandeja_8420_cuadrante_0.stl` | 1 | 215 x 164 x 10 | 0.2 | 30 % giroide | no (costillas hacia arriba) | 161 | 9.3 / 4.7 |
| `bandeja_8420_cuadrante_1.stl` | 1 | 215 x 164 x 10 | 0.2 | 30 % giroide | no (costillas hacia arriba) | 161 | 9.3 / 4.7 |
| `bandeja_8420_cuadrante_2.stl` | 1 | 215 x 164 x 10 | 0.2 | 30 % giroide | no (costillas hacia arriba) | 167 | 9.6 / 4.8 |
| `bandeja_8420_cuadrante_3.stl` | 1 | 215 x 164 x 10 | 0.2 | 30 % giroide | no (costillas hacia arriba) | 167 | 9.6 / 4.8 |
| `bandeja_8420_placa_union_x4.stl` | 4 | 60 x 24 x 4 | 0.2 | 100 % lineas | no | 29 | 1.7 / 0.8 |
| `bandeja_8420_poste_x4.stl` | 4 | 30 x 30 x 196 | 0.28 | 25 % giroide | no (parado) | 217 | 12.5 / 6.3 |

**Totales:** cajon piloto BASE C6 = **695 g, 40.2 h en impresora estandar o 20.0 h en rapida**. Bandeja 8420 completa = **902 g, 52.0 h o 26.1 h**.

⚠️ **Hallazgo:** la Fase 6 estimaba ~320 g por cajon; el piloto sale en ~695 g porque las 4 losetas solidas pesan 378 g. Si se confirma con la impresion, conviene aligerar la loseta (ventanas donde no hay ficha, o relleno al 30 %): el PETG del plan completo podria duplicarse.

## Orden de impresion recomendado para el piloto
1. `BASE-C6_loseta0.stl` sola: medir que entre al cajon y que los agujeros esten a 21 mm.
2. La ficha mas chica (`...C6-05_ADAP`): probar el perno en el agujero (debe entrar a mano, sin juego lateral).
3. Las otras 3 losetas y las 4 fichas.
4. Foto del cajon armado y peso real de cada pieza: esos datos reemplazan esta estimacion.

## Loseta ligera (sesión nocturna 2, #338)

`LOSETA_LIGERA = true` en `fts_rejilla.scad` corta una ventana circular de 16 mm al centro de cada celda de la rejilla. Quedan:
- 5 mm de costilla entre ventanas;
- 6.9 mm de material entre ventana y agujero;
- 4 mm de borde sin ventanas.

**Medido en las STL de BASE C6**, con `estimar_stl.py`:

| | Sólida (sesión 1) | Ligera | Diferencia |
|---|---|---|---|
| 4 losetas | 297.3 cm³, 378 g | 199.5 cm³, 253 g | −33 % |
| Cajón C6 completo | 704 g, 40.8 h | 579 g, 33.6 h | −18 % |

**Falta probar** con el cajón impreso que la loseta no se flexione al meter los pernos. Si se flexiona, sube `ESP_LOSETA` o baja `D_VENTANA`.

Con `false` se vuelve a la loseta sólida.

**Lado del rebaje de dedo:** la ficha acepta `lados` ([0, 1] por defecto). `generar_cajon.py` lo toma de `datos/interferencias_3d.json`: si un lado largo da a la pared, el rebaje va solo del otro lado.
