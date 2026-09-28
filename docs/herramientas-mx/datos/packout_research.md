# PACKOUT: cajones y bases rodantes (investigación 2026-09-28)

Datos completos, con la fuente de cada número, en `packout_research.json`.

## ⚠️ Qué tan confiable es esto
**Ninguna página se abrió directamente.** El proxy del contenedor bloquea con 403 los sitios de Milwaukee (milwaukeetool.com, que incluye el PDF *PACKOUT-2023-Dimension-Catalog*; milwaukeetool.com.mx; milwaukeetool.mx), el catálogo de milwaukeetool.eu, las tiendas de México (homedepot.com.mx, Amazon MX, Grainger MX, Risoul, Centro de Herramientas) y las de EE. UU. (Acme, Home Depot US, MaxTool, Red Tool Store), además de ToolGuyd, Scribd, archive.org y el PDF de RS. Tampoco pasa WebFetch.
Todos los números salen de **fragmentos de resultados de WebSearch**, y el resumidor del buscador a veces no dice de qué sitio sacó cada dato. **El catálogo oficial de dimensiones NO se leyó.** Por eso no hay capturas en `scratchpad/packout/`. Las medidas críticas se verifican con el PDF antes de cortar o comprar.

## Comparativo

| Modelo | Qué es | Exterior mm (L×A×H) | Cajones: alto útil × ancho × fondo mm | Cap. total | Cap./cajón | Barra con candado | Precio MX (snippet) |
|---|---|---|---|---|---|---|---|
| 48-22-8441 | 1 cajón, sin ruedas | 414×564×363 | ? | 50 lb (22.7 kg) | ? | Sí | – |
| 48-22-8442 | 2 cajones iguales | 414×564×363 | 2 × 127 (5") × 414 × 318 (Zoro, pulgadas) | 50 lb | 25 lb / 11 kg | Sí | $3,952 / $4,199 (sin tienda atribuible) |
| 48-22-8443 | 3 cajones iguales | 414×564×363 | 3 × 76 × 414 × 318 (UK) | 50 lb / 22 kg | 11 kg | Sí | HD MX $3,399 · milwaukeestore.com.mx $4,889 |
| 48-22-8447 | 3 cajones de fondo distinto (2 bajos + 1 profundo) | 414×564×363 | 2 × 61 + 1 × 130, cada uno × 416 × 322 (UK "2+1") | 50 lb | 11 kg | Sí | $4,787 (probablemente Mercado Libre) |
| 48-22-8444 | 4 cajones (existe) | 414×564×363 | 4 × 61 × 416 × 322 (UK) | 50 lb | 11 kg | Sí | Mercado Libre $4,799 |
| 48-22-8420 | **Caja rodante de 1 cajón frontal profundo** (ruedas de 9", manija) | 610×483×502 | 1 × 406 × 432 × 330 (ToolGuyd) | 250 lb (113 kg) | – | ? | $5,599–$6,799 (sin tienda atribuible) |
| 48-22-8426 | Caja rodante con tapa (sin cajones) | 561×472×650 | interior 485×371×353 | 250 lb | – | 2 broches y orificio para candado | HD MX Pro $3,815 (antes $4,239) |
| 48-22-8410 | Dolly: plataforma de 4 rodajas | 620×480×193 | – | 250 lb | – | – | Ferreterías Calzada $2,345 |
| 48-22-8415 | Diablito de 2 ruedas | 537×305×1219 | – | 400 lb | – | – | – |
| 48-22-8445 | Gabinete con puerta (sin cajones) | 495×368×373 | – | ? | – | ? | – |
| 48-22-8440 | Huacal (crate) | 472×391×251 | interior 406×330×229 | 50 lb | – | – | – |
| 48-22-8450 (referencia) | Maleta de tapa con espuma | 529×380×150 (HD MX) | interior ≈480×320×114 (snippet sin fuente clara) | 75 lb (34 kg) | – | No | HD MX: tiene ficha, el precio no aparece |

Las cinco cajas de cajones comparten la carcasa de 22.2 × 16.3 × 14.3 in: el modelo solo cambia cuántos cajones hay y de qué alto. **La capacidad es de 50 lb por caja, no por cajón.**
Los números 48-22-8448 y 48-22-8449 no aparecen en ningún resultado. Tampoco apareció un "PACKOUT rolling cabinet" con cajones. Los 48-22-8435/8436 son organizadores compactos, no cajones.

## Discrepancias
1. **Peso vacío del 8443:** 25.8 lb (11.7 kg) según un snippet de EE. UU.; 10.04 kg en HD MX; 10 kg en la ficha UK. En el JSON queda `null`.
2. **Alto interior del 8443:** 3.4" (86 mm) en EE. UU. contra 76 mm en UK. Otra fuente UK da 127 mm, que en realidad es el alto del 2-cajones.
3. **Interior del 8442 en UK:** 61/130 mm. Es idéntico al del 2+1 (8447), así que el buscador probablemente mezcló modelos. El dato de EE. UU. dice 5" (127 mm) por cajón.
4. **Medidas del 8443 en HD MX:** 36.2 × 40.89 × 40.89 cm. Repite el 40.89, parece error de captura. Lo coherente es 363 × 564 × 414 mm.
5. **8426:** HD MX dice 67 × 49 × 47.24 cm; en EE. UU. 25.6 × 22.1 × 18.6 in (650 × 561 × 472 mm). El ancho es 18.6 o 18.9 según la tienda.
6. **8450:** 523 × 377 × 150 (Amazon US), 529 × 380 × 150 (HD MX) y 526 × 386 × 157 (Tool Nut). Difieren 9 mm como máximo.
7. **Equivalencia 8447 = UK 4932493190 ("2+1"):** es una inferencia por descripción, no está confirmada.

## Pendiente (null en el JSON)
- Leer el catálogo oficial de dimensiones: hace falta que alguien lo baje fuera del contenedor.
- Alto interior del 8441. Peso vacío de 8441, 8443, 8444, 8447, 8426, 8410 y 8415.
- Alto del frente de cada cajón (no se publica en ninguna fuente encontrada).
- Si el 8420 trae barra con candado. Orden vertical de los cajones del 8447.
- Precios MX verificados en página. Todos son snippets y varios no se pueden atribuir a una tienda. No hay datos de Grainger MX, Risoul ni Centro de Herramientas: sus sitios están bloqueados y no salieron en los resultados.
- Interior del 8450, con fuente atribuible.
