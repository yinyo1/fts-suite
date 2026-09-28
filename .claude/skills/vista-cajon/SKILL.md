---
name: vista-cajon
description: Genera la vista superior de un cajon en SVG, a escala en milimetros, con cotas del cajon, rectangulo de cada pieza con su numero de activo, holguras y porcentaje de ocupacion. Usar cuando se pida dibujar un cajon, la silueta de un cajon, la vista del carrito, o regenerar los SVG despues de un acomodo.
---

# vista-cajon

Proyecto Herramientas MX (issue #325). Codigo: `docs/herramientas-mx/scripts/vista_cajon.py`
(se llama tambien desde `acomodo.py`). Salida: `docs/herramientas-mx/svg/<modulo>-<cajon>.svg`.

## Convenciones del dibujo
- 1 unidad SVG = 1 mm. `viewBox` = cajon + 40 mm de margen para cotas.
- Contorno del cajon util en trazo grueso; cota horizontal (ancho) arriba y vertical (fondo) a la izquierda, en mm.
- Cada pieza: rectangulo con esquinas redondeadas 4 mm (asi se imprime la silueta), relleno por familia,
  texto con **numero de activo** (ej. `FTS-SOL-01-C3-07`) y descripcion corta; si esta rotada, marca `R`.
- Pie: modulo, cajon, alto util, ocupacion en planta (%), peso (kg), y la leyenda `no validado` si alguna medida lo es.
- Frente del cajon abajo (el lado que ve la persona al abrir).
- Nunca el nombre de una persona en el dibujo: solo el activo.

## Uso
```bash
python3 docs/herramientas-mx/scripts/vista_cajon.py --entrada docs/herramientas-mx/diseno_carrito.json --salida docs/herramientas-mx/svg/
```
