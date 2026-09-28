# Fuentes de imágenes

Issue #343. **Uso interno de evaluación.** Las fotos de producto son de sus fabricantes y tiendas.

## Dónde está cada cosa

Este repo es **público** (consultado con la API de GitHub el 2026-09-28: `"visibility": "public"`). Por eso aquí no hay ninguna foto de producto ni ningún render que la contenga.

| Qué | Dónde |
|---|---|
| Scripts | `scripts/biblioteca_imagenes.py`, `scripts/render_cajones.py`, `scripts/render_carrito.py`, `scripts/probar_deteccion_renders.py` |
| Imagen elegida de cada pieza (URL) | `datos/fuentes_imagenes_seleccion.json` y la tabla de abajo |
| Escala, px/mm y resultado por pieza, sin imágenes | `datos/biblioteca_imagenes.json` |
| Renders de respaldo con siluetas dibujadas | `renders/` |
| Biblioteca de fotos recortadas y renders con foto | **fuera del repo**: se entregaron por el chat de la sesión. Dirección decide su destino |

Para volver a generar la versión con fotos, en una carpeta fuera del repo:
```
python3 scripts/biblioteca_imagenes.py /ruta/fuera/biblioteca
python3 scripts/render_cajones.py foto /ruta/fuera/renders /ruta/fuera/biblioteca
python3 scripts/render_carrito.py foto /ruta/fuera/renders /ruta/fuera/biblioteca
```
Los scripts se niegan a escribir fotos dentro del repo.

## Resultado

- 102 imágenes para BASE y TUB, contando cada hueco de los juegos.
- **46 con foto real**: 36 del producto exacto y 10 representativas (mismo tipo y medida, otro modelo o marca).
- **56 con silueta** marcada "sin foto":
  - 29 dados, porque van parados: su vista de arriba es un círculo y la foto de la tienda es lateral;
  - 15 brocas sueltas;
  - 7 piezas Wiha;
  - el juego de brocas escalonadas, el cabezal 12R, las dos stillson y la extensión de 10 in.
- Home Depot EE. UU. contesta las páginas, pero su servidor de imágenes (images.thdstatic.com) está bloqueado por la red del contenedor. truper.com también está bloqueado.

**Escala:** px/mm = lado largo de la foto entre el largo L del catálogo, con el nivel de validación de ese largo.
- En los desarmadores de precisión la escala es de grupo: la pieza más larga de la foto mide el L del juego.
- En los adaptadores la foto se ajusta a su hueco, porque no hay medida por pieza.
- El cargador, el flexómetro y la esmeriladora traen cable o correa; se recortan al cuerpo antes de escalar.

## Imágenes usadas

| Clave | Producto | Fuente | Precisión | Página | Imagen |
|---|---|---|---|---|---|
| IMP38 | 2854-20 | milwaukeetool.com | exacta | https://www.milwaukeetool.com/products/2854-20 | https://www.milwaukeetool.com/--/web-images/sc/79a3a92ff1f44f4d8ba785ed755fd749?hash=c2543ea65a349a567ce40edec3d91419 |
| ROTO18 | 3602-20 | milwaukeetool.com | exacta | https://www.milwaukeetool.com/products/3602-20 | https://www.milwaukeetool.com/--/web-images/sc/ad3b932a671d4a3084d22b91881cf4f9?hash=b96f9ab19319f65ced5c6baaa52c9e0f |
| IMP14 | 3650-20 | milwaukeetool.com | exacta | https://www.milwaukeetool.com/products/3650-20 | https://www.milwaukeetool.com/--/web-images/sc/49d28cd2f5be48caa13d2952784b245a?hash=80423b66b32825990bb4529a1446f338 |
| BAT | 48-11-1820 | milwaukeetool.com | exacta | https://www.milwaukeetool.com/products/48-11-1820 | https://www.milwaukeetool.com/--/web-images/sc/7021127ec5294cc4b2c304370f1db6f7?hash=11c9bd794d1466db0f04cdcd356eef0b |
| MINIP | 48-22-6105 | milwaukeetool.com | exacta | https://www.milwaukeetool.com/products/48-22-6105 | https://www.milwaukeetool.com/--/web-images/sc/5a25f8d9ae6d47ee975114efd43e0353?hash=b176e28306745950a26e50d92cda2059 |
| PRES6C | 48-22-3532 | milwaukeetool.com | exacta | https://www.milwaukeetool.com/products/48-22-3532 | https://www.milwaukeetool.com/--/web-images/sc/410c4de2b5944588b1c6571be79fe836?hash=022ee7f380c8604d67b201cca67e4c9e |
| PRES11 | 48-22-3531 | milwaukeetool.com | exacta | https://www.milwaukeetool.com/products/48-22-3531 | https://www.milwaukeetool.com/--/web-images/sc/ed629818c7244040b7829d918faea48a?hash=33aa4ba064a6df6171b7c78a5f5457ef |
| PREC6 | 48-22-2606 | milwaukeetool.com | exacta | https://www.milwaukeetool.com/products/48-22-2606 | https://www.milwaukeetool.com/--/web-images/sc/54d34d6aacc047fdb466f0b48929b685?hash=9265a8b4e5d57b93ee59442117db2683 |
| NIVTUB | 48-22-5110 | milwaukeetool.com | exacta | https://www.milwaukeetool.com/products/48-22-5110 | https://www.milwaukeetool.com/--/web-images/sc/4009dce6d4b64b17b6999168e66fb99c?hash=c2ecf8b69ee545190e7e938418221e0a |
| ESM45 | 6130-33 | milwaukeetool.com | exacta | https://www.milwaukeetool.com/products/6130-33 | https://www.milwaukeetool.com/--/web-images/sc/d726f5ccb3674ca98c1a592f2637c82e?hash=b94df87d5c26f565a940dbbb748e495e |
| CARG1 | 48-59-1812 | milwaukeetool.com | exacta | https://www.milwaukeetool.com/products/48-59-1812 | https://www.milwaukeetool.com/--/web-images/sc/1e0693ddc84641b0935228bb56efdecf?hash=596a6c8ba514a03139b3c5da79d36565 |
| C8410 | 48-22-8410 | milwaukeetool.com | exacta | https://www.milwaukeetool.com/products/48-22-8410 | https://www.milwaukeetool.com/--/web-images/sc/7f9c95558d4946388ed2c6ae49f643f9?hash=c1de50f1728cd18209e9325e9384f5f8 |
| C8442 | 48-22-8442 | milwaukeetool.com | exacta | https://www.milwaukeetool.com/products/48-22-8442 | https://www.milwaukeetool.com/--/web-images/sc/064a4f4d9e57466094943b8c55ffbfec?hash=ed70049521d08c6694f03da877be3636 |
| C8443 | 48-22-8443 | milwaukeetool.com | exacta | https://www.milwaukeetool.com/products/48-22-8443 | https://www.milwaukeetool.com/--/web-images/sc/707e31ab5dbe43b6a7cf0eb08c85789f?hash=08f2967eb2f80e8e7eee17283ba7f975 |
| C8444 | 48-22-8444 | milwaukeetool.com | exacta | https://www.milwaukeetool.com/products/48-22-8444 | https://www.milwaukeetool.com/--/web-images/sc/b23e718efef14453836b994c4f525841?hash=2fe9b2b7a9281a9c137e483639991b41 |
| TORPEDO | NIVEL TORPEDO 9\" CON MAGNETO PLASTICO ROJO | homedepot.com.mx | exacta | https://www.homedepot.com.mx/p/husky-nivel-torpedo-9-con-magneto-plastico-rojo-10790-840933 | https://cdn.homedepot.com.mx/productos/840933/840933-d.jpg |
| PDIAG | PINZA EN DIAGONAL ACERO 7\" GRAN APALANCAMIENTOepot Méxic | homedepot.com.mx | exacta | https://www.homedepot.com.mx/p/husky-pinza-en-diagonal-acero-7-gran-apalancamiento-903465-903465 | https://cdn.homedepot.com.mx/productos/903465/903465-d.jpg |
| PELEC | PINZAS DE ELECTRICISTA DE 22.9 CM EN ACERO HUSKYepot Méxi | homedepot.com.mx | exacta | https://www.homedepot.com.mx/p/husky-pinzas-de-electricista-de-229-cm-en-acero-husky-709195-709195 | https://cdn.homedepot.com.mx/productos/709195/709195-d.jpg |
| MATRACA | MATRACA ROTATIVA 3/8\" ACERO HUSKY | homedepot.com.mx | exacta | https://www.homedepot.com.mx/p/husky-matraca-rotativa-3-8-acero-husky-h38rotoratmx-106478 | https://cdn.homedepot.com.mx/productos/106478/106478-d.jpg |
| TAZON | TAZON MAGNETICO 1 PIEZA ACERO CROMADO | homedepot.com.mx | exacta | https://www.homedepot.com.mx/p/husky-tazon-magnetico-1-pieza-acero-cromado-129-291-129291 | https://cdn.homedepot.com.mx/productos/129291/129291-d.jpg |
| PRES7 | PINZA DE PRESION METAL DE MORDAZA RECTA 7\" | homedepot.com.mx | exacta | https://www.homedepot.com.mx/p/pinza-de-presion-metal-de-mordaza-recta-7-de-mordaza-recta-709207 | https://cdn.homedepot.com.mx/productos/709207/709207-d.jpg |
| PRES10 | CURVED JAW LOCKING PLIERS CHROME VANADIUM STEEL 10 INepot | homedepot.com.mx | exacta | https://www.homedepot.com.mx/p/husky-curved-jaw-locking-pliers-chrome-vanadium-steel-10-in-709204-709204 | https://cdn.homedepot.com.mx/productos/709204/709204-d.jpg |
| EXT6 | BARRA DE EXTENSION 6\" CUADRO 3/8\" METAL HUSKYepot Méxic | homedepot.com.mx | exacta | https://www.homedepot.com.mx/p/husky-barra-de-extension-6-cuadro-3-8-metal-husky-h3dext6mx-129311 | https://cdn.homedepot.com.mx/productos/129311/129311-d.jpg |
| PALANCA | MANERAL DE FUERZA CUADRO 3/8\" ACERO | homedepot.com.mx | exacta | https://www.homedepot.com.mx/p/husky-maneral-de-fuerza-cuadro-3-8-acero-h38bb10mx-106480 | https://cdn.homedepot.com.mx/productos/106480/106480-d.jpg |
| ADAP | JUEGO DE ADAPTADORES 3 PIEZAS 1/4\", 3/8\" Y 1/2\" ACERO CROMO / The H | homedepot.com.mx | exacta | https://www.homedepot.com.mx/p/husky-juego-de-adaptadores-3-piezas-1-4-3-8-y-1-2-acero-cromo-106475-106475 | https://cdn.homedepot.com.mx/productos/106475/106475-d.jpg |
| NAVAJA | NAVAJA RETRÁCTIL ACERO 22.4 CM USO DOMÉSTICO Y TALLERepot | homedepot.com.mx | exacta | https://www.homedepot.com.mx/p/anvil-navaja-retractil-acero-224-cm-uso-domestico-y-taller-99735a-137360 | https://cdn.homedepot.com.mx/productos/137360/137360-d.jpg |
| CHOF8 | PINZAS DE CHOFER 8\" DE ACERO | homedepot.com.mx | exacta | https://www.homedepot.com.mx/p/truper-pinzas-de-chofer-8-de-acero-pch-8-248697 | https://cdn.homedepot.com.mx/productos/248697/248697-d.jpg |
| MART | MARTILLO DE UÑA CURVA 16 OZ MANGO FIBRA DE VIDRIOepot Méx | homedepot.com.mx | exacta | https://www.homedepot.com.mx/p/truper-martillo-de-una-curva-16-oz-mango-fibra-de-vidrio-ma-16f-449645 | https://cdn.homedepot.com.mx/productos/449645/449645-d.jpg |
| CAIMAN | LLAVE DE CADENA TIPO CAIMÁN PARA TUBOS DE 6 PULGADASepot  | homedepot.com.mx | exacta | https://www.homedepot.com.mx/p/urrea-llave-de-cadena-tipo-caiman-para-tubos-de-6-pulgadas-797ur-197978 | https://cdn.homedepot.com.mx/productos/197978/197978-d.jpg |
| COMB7 | JUEGO DE LLAVES COMBINADAS CON MATRACA 7 PIEZAS METRICAS ACERO / The H | homedepot.com.mx | exacta | https://www.homedepot.com.mx/p/husky-juego-de-llaves-combinadas-con-matraca-7-piezas-metricas-acero-165761-165761 | https://cdn.homedepot.com.mx/productos/165761/165761-d.jpg |
| HDS-P2 | DESARMADOR PHILLIPS #2 X 4\" MANGO ERGONOMICO | homedepot.com.mx | representativa | https://www.homedepot.com.mx/p/husky-desarmador-phillips-2-x-4-mango-ergonomico-110504440-112359 | https://cdn.homedepot.com.mx/productos/112359/112359-d.jpg |
| HDS-P1 | DESARMADOR DE CRUZ PHILLIPS NO.1 X 3\" MANGO ERGONOMICO PENTAGONAL / T | homedepot.com.mx | representativa | https://www.homedepot.com.mx/p/husky-desarmador-de-cruz-phillips-no1-x-3-mango-ergonomico-pentagonal-109913-109913 | https://cdn.homedepot.com.mx/productos/109913/109913-d.jpg |
| AJ12 | LLAVE AJUSTABLE DE DOBLE VELOCIDAD 12\" ACERO NEGROepot M | homedepot.com.mx | exacta | https://www.homedepot.com.mx/p/husky-llave-ajustable-de-doble-velocidad-12-acero-negro-17018-128380 | https://cdn.homedepot.com.mx/productos/128380/128380-d.jpg |
| AJ8 | LLAVE AJUSTABLE 8\" CROMADA | homedepot.com.mx | representativa | https://www.homedepot.com.mx/p/husky-llave-ajustable-8-cromada-96596-128371 | https://cdn.homedepot.com.mx/productos/128371/128371-d.jpg |
| FLEX | FLEXÓMETRO 5 METROS CINTA MÉTRICA PRO | homedepot.com.mx | representativa | https://www.homedepot.com.mx/p/anvil-flexometro-5-metros-cinta-metrica-pro-96409-305862 | https://cdn.homedepot.com.mx/productos/305862/305862-d.jpg |
| VERN | CALIBRADOR DIGITAL 15 CM NEGRO STEREN | homedepot.com.mx | representativa | https://www.homedepot.com.mx/p/steren-calibrador-digital-15-cm-negro-steren-her-411-139485 | https://cdn.homedepot.com.mx/productos/139485/139485-d.jpg |

Todas: uso interno de evaluación.

