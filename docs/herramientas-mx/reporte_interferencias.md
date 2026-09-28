# Reporte de interferencias 3D

Sesión nocturna 2 (#338). Script: `scripts/interferencias_3d.py`. Modelos: `cad/modelos_herramienta/modelos.py`. Datos: `datos/interferencias_3d.json`.

## Cómo se midió

Cada cajón con piezas se armó en 3D y se corrieron los chequeos con `trimesh` y `python-fcl` (detección de colisiones y distancia mínima entre mallas).

- **Cajón:** interior con las cotas del fabricante del Bloque 1 de #330. El alto es el alto útil: del piso del cajón a la parte baja del de arriba, o de la tapa.
- **Supuestos paramétricos, sin cota oficial:**
  - pared de 3.0 mm;
  - labio interior de 4.0 mm en los últimos 3.0 mm de la pared;
  - correderas por fuera de la pared.
  Se sustituyen con el vernier.
- **Loseta y ficha:** la loseta mide 2.4 mm y el piso de la ficha 1.2 mm, así que la herramienta queda a 3.6 mm del piso. La ficha es el contorno más 1 mm de holgura y 3 mm de pared; su alto es la cavidad, min(0.6 H, 25).
- **Herramienta:** un modelo paramétrico por familia dentro de la envolvente L × A × H del catálogo, cada medida con su nivel en `validacion_documental.json`. Las proporciones internas son supuesto de diseño tomado de la foto de producto.

| Chequeo | Qué revisa |
|---|---|
| a | Herramienta contra herramienta y contra fichas, la propia y las ajenas |
| b | Herramienta y ficha contra la pared, el labio y las correderas |
| c | Herramienta y ficha contra el techo: el volumen que barre el cajón de arriba al cerrar |
| d | Extracción: zona de dedos de 7.0 mm en los dos lados largos, desde 15.0 mm abajo del tope de la pieza hasta el borde, y columna vertical sobre la huella |

**Criterio:**
- **FALLA** si hay contacto.
- **PASA JUSTO** si la holgura mínima es menor a 3.0 mm. Para una ficha contra la pared el umbral es 1.0 mm, porque va fija e impresa.
- **PASA** en otro caso.

## Resultado

| Acomodo | Regla de extracción | Cajones que pasan | Pasan justo | Fallan | Piezas con rebaje de un solo lado |
|---|---|---|---|---|---|
| acomodo de la sesion 1 | dedos en los dos lados largos | 0 | 0 | 27 | - |
| acomodo de la sesion 1 | rebaje solo del lado libre si uno da a la pared | 0 | 27 | 0 | 43 |
| reacomodado (vigente) | dedos en los dos lados largos | 0 | 20 | 7 | - |
| reacomodado (vigente) | rebaje solo del lado libre si uno da a la pared | 0 | 27 | 0 | 10 |

Son los 27 cajones con piezas.

**El acomodo vigente es el reacomodado con la regla del rebaje de un lado:** 0 cajones fallan y solo 10 piezas necesitan rebaje de un lado.

**Qué fallaba antes de corregir**, en número de contactos por chequeo:

- d dedos lado 1: 37
- d dedos lado 2: 6

**Hallazgo:**
- **Ningún cajón choca con el cajón de arriba al cerrar (c).** Tampoco hay choques de herramienta contra herramienta ni contra el cajón (a, b).
- **Todas las fallas son de extracción (d):** la zona de dedos del lado largo pegado a la pared. El acomodo deja 6 mm contra la pared (Fase 4), y los dedos necesitan 7 mm más el labio de 4 mm.
- **La corrección reacomoda cada cajón que falla.** Todas las piezas quedan con el largo en la misma dirección, con 12 mm contra la pared en su lado largo y 6 mm en las puntas, igual que en la Fase 4. Usa el mismo empaque MaxRects del acomodo y prueba las dos direcciones y tres órdenes. Donde no cabe, mueve solo la pieza que falla.
- **En los 7 cajones más llenos no alcanza el espacio.** Ahí la ficha lleva el rebaje de dedo solo del lado libre: `cad/fts_rejilla.scad`, parámetro `lados`, que `cad/generar_cajon.py` toma de este reporte.
- **Error corregido de paso:** la ficha ponía el rebaje en los lados cortos de las piezas giradas. Ahora va siempre en los lados largos.
- **Muchos cajones quedan en PASA JUSTO:** entre dos piezas vecinas el agarre de la Fase 4 deja 1 mm de sobra cuando se mide la zona de dedos contra la ficha de al lado. **Es el diseño, no un choque.**

### Piezas movidas por la corrección (58, contra el commit a52a979)

| Módulo y cajón | Pieza | De (x, y, girada) | A (x, y, girada) |
|---|---|---|---|
| BASE C1 | IMP38 (FTS-BAS-01-C1-01) | 6, 6, sí | 11.5, 6, sí |
| BASE C1 | ROTO18 (FTS-BAS-01-C1-02) | 140, 6, no | 140, 11.5, no |
| BASE C3 | VERN (FTS-BAS-01-C3-01) | 6, 6, sí | 6, 12, no |
| BASE C3 | BROCAS (FTS-BAS-01-C3-02) | 98, 6, sí | 255.0, 12, no |
| BASE C3 | PDIAG (FTS-BAS-01-C3-03) | 190, 6, no | 223.0, 166.0, no |
| BASE C3 | AJ8 (FTS-BAS-01-C3-04) | 190, 76, no | 6, 166.0, no |
| BASE C3 | CHOF8 (FTS-BAS-01-C3-05) | 190, 144, no | 6, 234.0, no |
| BASE C3 | PELEC (FTS-BAS-01-C3-06) | 6, 255, no | 6, 104.0, no |
| BASE C5 | TAZON (FTS-BAS-01-C5-01) | 6, 6, no | 248.0, 12, no |
| BASE C5 | HDS-A (FTS-BAS-01-C5-02) | 168, 6, no | 6, 12, no |
| BASE C5 | WIHA-DS2 (FTS-BAS-01-C5-03) | 168, 118, no | 6, 124.0, no |
| BASE C5 | PRES6C (FTS-BAS-01-C5-04) | 250, 162, no | 168.0, 174.0, no |
| BASE C5 | FLEX1 (FTS-BAS-01-C5-05) | 6, 168, sí | 332.0, 174.0, no |
| BASE C5 | ESCAL (FTS-BAS-01-C5-06) | 88, 168, no | 6, 174.0, no |
| BASE C5 | FLEX2 (FTS-BAS-01-C5-07) | 6, 250, no | 332.0, 246.0, no |
| BASE C5 | WIHA-DS4 (FTS-BAS-01-C5-08) | 88, 270, no | 6, 276.0, no |
| BASE C8 | ESM45 (FTS-BAS-01-C8-01) | 6, 6, no | 6, 12, no |
| BASE C9 | CARG1 (FTS-BAS-01-C9-01) | 6, 6, sí | 6, 12, no |
| CIV C1 | TAL12 (FTS-CIV-01-C1-01) | 6, 6, no | 6, 12, no |
| CIV C2 | SDS (FTS-CIV-01-C2-01) | 6, 6, no | 6, 12, no |
| CIV C2 | MANGOS (FTS-CIV-01-C2-02) | 6, 213, no | 6, 219.0, no |
| CIV C3 | SDSBIT (FTS-CIV-01-C3-01) | 6, 6, no | 6, 12, no |
| CIV C4 | MART2 (FTS-CIV-01-C4-01) | 6, 6, no | 6, 12, no |
| CIV C4 | CINC (FTS-CIV-01-C4-02) | 6, 148, no | 6, 154.0, no |
| CIV C7 | LIJA (FTS-CIV-01-C7-01) | 6, 6, sí | 260.0, 6, sí |
| CIV C7 | CALAD (FTS-CIV-01-C7-02) | 164, 6, sí | 12, 6, sí |
| CIV C8 | MAZO (FTS-CIV-01-C8-01) | 6, 6, no | 6, 12, no |
| ELE C1 | SACAB (FTS-ELE-01-C1-06) | 6, 218, no | 6, 216.5, no |
| ELE C2 | CRIMP (FTS-ELE-01-C2-01) | 6, 6, sí | 6, 12, no |
| ELE C2 | PONCH (FTS-ELE-01-C2-02) | 108, 6, sí | 6, 114.0, no |
| ELE C2 | PELA (FTS-ELE-01-C2-03) | 143, 218, no | 218.0, 114.0, no |
| ELE C2 | MAPPER (FTS-ELE-01-C2-04) | 6, 248, no | 248.0, 12, no |
| MED C1 | LASER (FTS-MED-01-C1-01) | 6, 6, sí | 157.0, 198.0, sí |
| MED C1 | AMARRE (FTS-MED-01-C1-02) | 82, 6, sí | 157.0, 6, sí |
| MED C1 | ESCCOMB (FTS-MED-01-C1-03) | 224, 6, sí | 12, 6, sí |
| MED C1 | LASER2 (FTS-MED-01-C1-04) | 6, 118, sí | 233.0, 198.0, sí |
| MED C1 | GRILL (FTS-MED-01-C1-05) | 82, 198, no | 289.0, 6, sí |
| MED C2 | TORPEDO2 (FTS-MED-01-C2-01) | 6, 6, sí | 6, 190.0, no |
| MED C2 | ESCCAR (FTS-MED-01-C2-02) | 63, 6, sí | 6, 12, no |
| SOL C1 | EXTQ (FTS-SOL-01-C1-01) | 6, 6, sí | 12, 6, sí |
| SOL C1 | PRES10B (FTS-SOL-01-C1-02) | 178, 6, sí | 306.0, 6, sí |
| SOL C1 | PRES11B (FTS-SOL-01-C1-03) | 256, 6, sí | 184.0, 6, sí |
| SOL C1 | FRESA (FTS-SOL-01-C1-04) | 178, 297, no | 384.0, 6, sí |
| SOL C2 | MACH (FTS-SOL-01-C2-01) | 6, 6, no | 6, 11.5, no |
| SOL C3 | ESM45B (FTS-SOL-01-C3-01) | 6, 6, no | 6, 12, no |
| SOL C3 | ESCMAG (FTS-SOL-01-C3-02) | 6, 170, no | 6, 176.0, no |
| SOL C4 | COMB10 (FTS-SOL-01-C4-01) | 6, 6, sí | 6, 12, no |
| SOL C4 | PRES7B (FTS-SOL-01-C4-02) | 198, 6, no | 6, 204.0, no |
| SOL C4 | PRES6CB (FTS-SOL-01-C4-03) | 198, 80, no | 200.0, 204.0, no |
| SOL C5 | LIMAS (FTS-SOL-01-C5-01) | 6, 6, sí | 6, 12, no |
| SOL C6 | MOTO (FTS-SOL-01-C6-01) | 6, 6, sí | 6, 12, no |
| SOL C6 | RECT (FTS-SOL-01-C6-02) | 218, 6, sí | 6, 224.0, no |
| TUB C1 | CAB34 (FTS-TUB-01-C1-01) | 6, 6, no | 6, 199.0, no |
| TUB C1 | NIVTUB1 (FTS-TUB-01-C1-02) | 118, 6, no | 118.0, 199.0, no |
| TUB C1 | CAIMAN (FTS-TUB-01-C1-03) | 6, 118, no | 6, 12, no |
| TUB C1 | STILL1 (FTS-TUB-01-C1-04) | 6, 210, no | 6, 104.0, no |
| TUB C2 | STILL2 (FTS-TUB-01-C2-01) | 6, 6, no | 6, 12, no |
| TUB C2 | NIVTUB2 (FTS-TUB-01-C2-02) | 6, 101, sí | 6, 107.0, no |

Las posiciones nuevas quedaron en `diseno_carrito.json`. Si se vuelve a correr `acomodo.py`, hay que volver a correr `interferencias_3d.py --corregir` después.

## Por cajón (después de corregir)

| Cajón | Caja | Interior (mm) | Estado | Holgura mínima | Peso contra capacidad | Piezas que no pasan limpio |
|---|---|---|---|---|---|---|
| BASE C1 | 48-22-8443 | 414 x 318 x 76 | **PASA JUSTO** | IMP38 0.5 mm | 3.99 de 11 kg | IMP38 pasa justo (0.5 mm, d dedos lado 1, contra pared/labio); ROTO18 pasa justo (0.5 mm, d dedos lado 1, contra pared/labio); TORPEDO pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C1-02); BAT1 pasa justo (2.0 mm, b ficha vs cajon, contra pared/labio); MINIP pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C1-03) |
| BASE C2 | 48-22-8443 | 414 x 318 x 76 | **PASA JUSTO** | WIHA-PC 1.0 mm | 2.82 de 11 kg | IMP14 pasa justo (2.0 mm, b ficha vs cajon, contra pared/labio); WIHA-PC pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C2-01); AJ12 pasa justo (1.0 mm, d dedos lado 2, contra ficha FTS-BAS-01-C2-04); NAVAJA pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C2-03); WIHA-PE pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C2-01) |
| BASE C3 | 48-22-8443 | 414 x 318 x 76 | **PASA JUSTO** | VERN 1.0 mm | 2.56 de 11 kg | VERN pasa justo (1.0 mm, d dedos lado 2, contra ficha FTS-BAS-01-C3-06); BROCAS pasa justo (1.0 mm, d dedos lado 1, contra pared/labio); AJ8 pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C3-06); CHOF8 pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C3-04); PELEC pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C3-01) |
| BASE C4 | 48-22-8444 | 414 x 318 x 58 | **PASA JUSTO** | WIHA-DS1 1.0 mm | 3.43 de 11 kg | MATR pasa justo (2.0 mm, b ficha vs cajon, contra pared/labio); COMB7 pasa justo (2.0 mm, b ficha vs cajon, contra pared/labio); WIHA-DS1 pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C4-02) |
| BASE C5 | 48-22-8444 | 414 x 318 x 58 | **PASA JUSTO** | TAZON 1.0 mm | 2.76 de 11 kg | TAZON pasa justo (1.0 mm, d dedos lado 1, contra pared/labio); HDS-A pasa justo (1.0 mm, d dedos lado 2, contra ficha FTS-BAS-01-C5-03); WIHA-DS2 pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C5-02); PRES6C pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C5-01); FLEX1 pasa justo (1.4 mm, d dedos lado 1, contra ficha FTS-BAS-01-C5-01); ESCAL pasa justo (2.0 mm, b ficha vs cajon, contra pared/labio); FLEX2 pasa justo (1.0 mm, d dedos lado 2, contra pared/labio); WIHA-DS4 pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C5-06) |
| BASE C6 | 48-22-8444 | 414 x 318 x 58 | **PASA JUSTO** | PRES11 1.0 mm | 2.77 de 11 kg | HDS-B pasa justo (2.0 mm, b ficha vs cajon, contra pared/labio); PRES11 pasa justo (1.0 mm, d dedos lado 2, contra ficha FTS-BAS-01-C6-03); EXTS pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C6-02); PREC6 pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C6-03); ADAP pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C6-03) |
| BASE C7 | 48-22-8444 | 414 x 318 x 58 | **PASA JUSTO** | WIHA-DS3 1.0 mm | 2.58 de 11 kg | MART pasa justo (1.6 mm, d dedos lado 2, contra ficha FTS-BAS-01-C7-03); WIHA-DS3 pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C7-01); PRES7 pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C7-01); WIHA-PP pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-BAS-01-C7-05); PRES10 pasa justo (2.0 mm, b ficha vs cajon, contra pared/labio) |
| BASE C8 | 48-22-8420 | 432 x 330 x 190 | **PASA JUSTO** | ESM45 1.0 mm | 3.09 de 15 kg | ESM45 pasa justo (1.0 mm, d dedos lado 1, contra pared/labio) |
| BASE C9 | 48-22-8420 | 432 x 330 x 200 | **PASA JUSTO** | CARG1 1.0 mm | 1.44 de 25 kg | CARG1 pasa justo (1.0 mm, d dedos lado 1, contra pared/labio) |
| ELE C1 | 48-22-8444 | 414 x 318 x 58 | **PASA JUSTO** | SACAB 0.5 mm | 2.6 de 11 kg | EXTECH pasa justo (2.0 mm, b ficha vs cajon, contra pared/labio); DETV pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-ELE-01-C1-01); FLUKE pasa justo (1.0 mm, d dedos lado 2, contra ficha FTS-ELE-01-C1-04); HDS-C pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-ELE-01-C1-03); HDS-D pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-ELE-01-C1-04); SACAB pasa justo (0.5 mm, d dedos lado 2, contra pared/labio) |
| ELE C2 | 48-22-8444 | 414 x 318 x 58 | **PASA JUSTO** | CRIMP 1.0 mm | 1.82 de 11 kg | CRIMP pasa justo (1.0 mm, d dedos lado 2, contra ficha FTS-ELE-01-C2-02); PONCH pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-ELE-01-C2-01); MAPPER pasa justo (1.0 mm, d dedos lado 1, contra pared/labio) |
| SOL C1 | 48-22-8447 | 414 x 318 x 63 | **PASA JUSTO** | EXTQ 1.0 mm | 5.89 de 11 kg | EXTQ pasa justo (1.0 mm, d dedos lado 1, contra pared/labio); PRES10B pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-SOL-01-C1-03); PRES11B pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-SOL-01-C1-01); FRESA pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-SOL-01-C1-02) |
| SOL C2 | 48-22-8447 | 414 x 318 x 63 | **PASA JUSTO** | MACH 0.5 mm | 3.65 de 11 kg | MACH pasa justo (0.5 mm, d dedos lado 1, contra pared/labio); TORX pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-SOL-01-C2-01); EXTOR pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-SOL-01-C2-01) |
| SOL C3 | 48-22-8447 | 414 x 318 x 127 | **PASA JUSTO** | ESM45B 1.0 mm | 3.84 de 11 kg | ESM45B pasa justo (1.0 mm, d dedos lado 1, contra pared/labio); ESCMAG pasa justo (2.0 mm, b ficha vs cajon, contra pared/labio) |
| SOL C4 | 48-22-8447 | 414 x 318 x 63 | **PASA JUSTO** | COMB10 1.0 mm | 2.67 de 11 kg | COMB10 pasa justo (1.0 mm, d dedos lado 2, contra ficha FTS-SOL-01-C4-02); PRES7B pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-SOL-01-C4-01); PRES6CB pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-SOL-01-C4-01) |
| SOL C5 | 48-22-8447 | 414 x 318 x 63 | **PASA JUSTO** | LIMAS 1.0 mm | 0.73 de 11 kg | LIMAS pasa justo (1.0 mm, d dedos lado 1, contra pared/labio) |
| SOL C6 | 48-22-8447 | 414 x 318 x 127 | **PASA JUSTO** | MOTO 1.0 mm | 3.18 de 11 kg | MOTO pasa justo (1.0 mm, d dedos lado 1, contra pared/labio); RECT pasa justo (2.0 mm, b ficha vs cajon, contra pared/labio) |
| CIV C1 | 48-22-8442 | 414 x 318 x 127 | **PASA JUSTO** | TAL12 1.0 mm | 3.77 de 11.3 kg | TAL12 pasa justo (1.0 mm, d dedos lado 1, contra pared/labio) |
| CIV C2 | 48-22-8442 | 414 x 318 x 127 | **PASA JUSTO** | SDS 1.0 mm | 4.09 de 11.3 kg | SDS pasa justo (1.0 mm, d dedos lado 1, contra pared/labio); MANGOS pasa justo (2.0 mm, b ficha vs cajon, contra pared/labio) |
| CIV C3 | 48-22-8444 | 414 x 318 x 58 | **PASA JUSTO** | SDSBIT 1.0 mm | 2.87 de 11 kg | SDSBIT pasa justo (1.0 mm, d dedos lado 1, contra pared/labio) |
| CIV C4 | 48-22-8444 | 414 x 318 x 58 | **PASA JUSTO** | MART2 1.0 mm | 1.79 de 11 kg | MART2 pasa justo (1.0 mm, d dedos lado 2, contra ficha FTS-CIV-01-C4-02); CINC pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-CIV-01-C4-01) |
| CIV C7 | 48-22-8420 | 432 x 330 x 190 | **PASA JUSTO** | CALAD 1.0 mm | 4.89 de 15 kg | LIJA pasa justo (2.0 mm, b ficha vs cajon, contra pared/labio); CALAD pasa justo (1.0 mm, d dedos lado 1, contra pared/labio) |
| CIV C8 | 48-22-8420 | 432 x 330 x 200 | **PASA JUSTO** | MAZO 1.0 mm | 1.21 de 25 kg | MAZO pasa justo (1.0 mm, d dedos lado 1, contra pared/labio) |
| MED C1 | 48-22-8442 | 414 x 318 x 127 | **PASA JUSTO** | ESCCOMB 1.0 mm | 5.21 de 11.3 kg | AMARRE pasa justo (2.0 mm, b ficha vs cajon, contra pared/labio); ESCCOMB pasa justo (1.0 mm, d dedos lado 2, contra ficha FTS-MED-01-C1-02); GRILL pasa justo (2.0 mm, b ficha vs cajon, contra pared/labio) |
| MED C2 | 48-22-8442 | 414 x 318 x 127 | **PASA JUSTO** | TORPEDO2 1.0 mm | 0.9 de 11.3 kg | TORPEDO2 pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-MED-01-C2-02); ESCCAR pasa justo (1.0 mm, d dedos lado 2, contra ficha FTS-MED-01-C2-01) |
| TUB C1 | 48-22-8443 | 414 x 318 x 76 | **PASA JUSTO** | NIVTUB1 1.0 mm | 5.09 de 11 kg | CAB34 pasa justo (2.0 mm, b ficha vs cajon, contra pared/labio); NIVTUB1 pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-TUB-01-C1-04); CAIMAN pasa justo (1.0 mm, d dedos lado 1, contra pared/labio); STILL1 pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-TUB-01-C1-03) |
| TUB C2 | 48-22-8443 | 414 x 318 x 76 | **PASA JUSTO** | STILL2 1.0 mm | 2.19 de 11 kg | STILL2 pasa justo (1.0 mm, d dedos lado 1, contra pared/labio); NIVTUB2 pasa justo (1.0 mm, d dedos lado 1, contra ficha FTS-TUB-01-C2-01) |

## Peso por cajón

Peso = herramienta (catálogo) + fichas PETG + loseta PETG. Las fichas salen del volumen de pared y piso, a 1.27 g/cm³. La loseta sale de los 378 g medidos en el STL de BASE C6 (0.287 g/cm²). En la bandeja de la 8420 se suman sus 902 g medidos.

Capacidad por cajón: 11 kg en 8443, 8444 y 8447, y 11.3 kg en 8442, según el fabricante. En la 8420 son 15 kg arriba y 25 kg abajo: es **supuesto**, porque el fabricante solo publica 113 kg del conjunto.

**Cajones que exceden la capacidad: 0.** Ninguno. El más cargado es SOL C1 con 54 % de su capacidad.

## Decisión: las M18 se guardan SIN batería

Van acostadas en los cajones de 76 mm de la 8443, con la base de silueta de 3.6 mm:

| Pieza | Sin batería: tope (mm) | Holgura contra el cajón de arriba | Con batería: tope (mm) | Resultado con batería |
|---|---|---|---|---|
| IMP38 | 68.6 | 7.4 mm | 82.6 | **FALLA**: rebasa 6.6 mm y choca con la pieza vecina |
| ROTO18 | 59.6 | 16.4 mm | 82.6 | **FALLA**: rebasa 6.6 mm y choca con la pieza vecina |
| IMP14 | 56.6 | 19.4 mm | 82.6 | **FALLA**: rebasa 6.6 mm y choca con la pieza vecina |

**Por qué no caben:** con la batería CP2.0 puesta, el grosor de la herramienta acostada pasa al ancho de la batería, 79 mm (catálogo, nivel D1). 3.6 + 79 = 82.6 mm, contra un cajón de 76 mm.

**Dónde irían con batería:**
- en un cajón de 127 mm (8442 u 8447 C3), o
- paradas sobre la batería en la 8420.
En la base eso obliga a cambiar una caja. En la C9 de la 8420 (432 × 330) no caben las tres con el cargador: faltan 8 mm de ancho con las holguras de la Fase 4 (3 × 79 + 2 × 12 + 12 + 155 + 2 × 6 = 440 mm contra 432).

**Recomendación:** sin batería. Las dos baterías van en sus fichas del mismo cajón C1, así se revisan en la foto de cierre y no se descargan puestas.

## Variantes

### M18 con bateria puesta

| Cajón | Alto | Pieza | Estado | Holgura mínima | Chequeo | Tope de la pieza (mm) | Envolvente L × A × H |
|---|---|---|---|---|---|---|---|
| BASE C1 | 76 | IMP38 | **FALLA** | 0.0 mm | a herramienta vs herramienta | 82.6 | 202.0 x 167.0 x 79 |
| BASE C1 | 76 | ROTO18 | **FALLA** | 0.0 mm | a herramienta vs herramienta | 82.6 | 202.0 x 192.0 x 79 |
| BASE C2 | 76 | IMP14 | **FALLA** | 0.0 mm | a herramienta vs herramienta | 82.6 | 196.0 x 157.0 x 79 |

### esmeriladora con mango lateral

| Cajón | Alto | Pieza | Estado | Holgura mínima | Chequeo | Tope de la pieza (mm) | Envolvente L × A × H |
|---|---|---|---|---|---|---|---|
| BASE C8 | 190 | ESM45 | **PASA JUSTO** | 1.0 mm | d dedos lado 1 | 93.6 | 357.0 x 222.0 x 90.0 |
| SOL C3 | 127 | ESM45B | **FALLA** | 0.0 mm | a herramienta vs herramienta | 93.6 | 357.0 x 222.0 x 90.0 |

