# Prueba de la ingesta con datos de EJEMPLO (28-sep-2026)

Los dos CSV de esta carpeta son **de ejemplo**: no son conteo ni medicion reales (la columna `nota` dice EJEMPLO).
La prueba se corrio sobre una copia; el repo quedo en su estado real despues de la prueba.

```
$ python3 scripts/ingestar_levantamiento.py --conteo levantamiento_ejemplo/ejemplo_conteo.csv --medicion levantamiento_ejemplo/ejemplo_medicion.csv
conteo: {'existe': 198, 'no_existe': 9, 'danada': 2, 'sin_revisar': 0} | discrepancias de numero de parte: 1 | renglones de compra con existencia fisica: 67
medicion: 2 modelos de cajon, 3 piezas
ANTES   cajas 11 (con las 8420) · alto 4271 mm · total sin IVA 300,352.37 · conservador 316,214.80 · BASE 8443 + 8444 + 8420
DESPUES cajas 11 (con las 8420) · alto 4271 mm · total sin IVA 298,039.01 · conservador 313,770.47 · BASE 8447 + 8443 + 8420
niveles por medida: F 130, D1 87, D2 47, V 4, M 5
AJ12   [(306, V), (79, M), (21, M)]      largo coincide +-3 mm con documental doble -> V; ancho y alto solo tenian D1 -> M
IMP14  [(197, V), (113, V), (54, V)]     las tres coinciden con la ficha doble -> validado
ROTO18 [(221, M), (168, M), (62, M)]     difiere mas de 3 mm de la ficha -> M, se usa el valor fisico
discrepancia: TPC8 catalogo 2929-22 (verificar) contra placa 2929-20
existencia: 6130-33 = 0 (M1 y M2 marcadas no existe) -> la compra sube 2 esmeriles
```

Lo que demuestra:
1. El conteo cambia la existencia de cada renglon de compra y el costo se recalcula solo.
2. Una medida fisica que coincide con dos documentales queda **validada**; si no, queda **M** y se usa el valor medido.
3. Un alto util de cajon menor al del fabricante (55 contra 58 mm en el ejemplo) cambia la mezcla de cajas del carrito base.
4. El numero leido en la placa que no coincide con el catalogo aparece como discrepancia.
