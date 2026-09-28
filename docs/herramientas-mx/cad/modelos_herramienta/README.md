# Modelos 3D de herramienta

Sesión nocturna 2 (#338). Código: `modelos.py`, que tiene un generador por tipo. Lo usan `scripts/interferencias_3d.py` y `scripts/build_vista_3d.py`.

**Cómo leer esta tabla:**
- **La envolvente L × A × H es la del catálogo**, con el nivel de cada medida tomado de `datos/validacion_documental.json`: D2 documental doble, D1 documental simple, F estimación desde foto, M medida física.
- **La forma interna** (dónde va la empuñadura, qué tan ancha es la cabeza) es **supuesto de diseño** tomado de las fotos de producto del fabricante. No es medida.
- **Un modelo nunca rebasa su envolvente.** Por eso no puede crear una interferencia que la caja del catálogo no tenga.
- **Las únicas variantes que cambian la envolvente** son la M18 con batería puesta (batería CP2.0 de 118 × 79 × 55, nivel D1, con 10 mm de encaje, supuesto) y la esmeriladora con mango lateral (mango de 110 × 26 mm, supuesto).

| Pieza | Descripción | Tipo de modelo | L × A × H (mm) | Nivel L / A / H | Dónde va |
|---|---|---|---|---|---|
| ADAP | Juego 3 adaptadores 1/4-3/8-1/2 | estuche | 70 × 40 × 25 | F/F/F | BASE C6 |
| AJ12 | Llave ajustable 12 in Husky 17018 | llave | 305 × 78 × 20 | D2/D1/D1 | BASE C2 |
| AJ8 | Llave ajustable 8 in Husky 17016 | llave | 205 × 56 × 15 | D2/D1/D1 | BASE C3 |
| AMARRE | 4 amarres tipo matraca 3.6 m (enrollados) | estuche | 180 × 120 × 60 | F/F/F | MED C1 |
| BAT1 | Bateria M18 CP2.0 | estuche | 118 × 79 × 55 | D1/D1/D1 | BASE C1 |
| BAT2 | Bateria M18 CP2.0 | estuche | 118 × 79 × 55 | D1/D1/D1 | BASE C1 |
| BROCAS | Juego 15 brocas HSS 1/16-1/2 Truper (estuche) | estuche | 150 × 80 × 20 | F/F/F | BASE C3 |
| CAB34 | Cabezal 12R 3/4 NPT de repuesto | cilindro | 100 × 100 × 60 | F/F/F | TUB C1 |
| CAIMAN | Llave de cadena caiman 6 in Urrea 797UR | llave | 400 × 80 × 40 | F/F/F | TUB C1 |
| CALAD | Sierra caladora Ryobi JS481LG | estuche | 279 × 236 × 72 | D1/D1/D1 | CIV C7 |
| CARG1 | Cargador sencillo M18/M12 48-59-1812 (compra) | estuche | 202 × 155 × 87 | D2/D2/D2 | BASE C9 |
| CHOF8 | Pinza de chofer 8 in Truper 17301 | pinza | 203 × 50 × 15 | D2/D1/D1 | BASE C3 |
| CINC | 2 cinceles de corte frio 5/16x6 y 7/8x10 | estuche | 254 × 60 × 25 | F/F/F | CIV C4 |
| COMB10 | Juego 10 llaves combinadas Husky BITE | estuche | 300 × 180 × 25 | F/F/F | SOL C4 |
| COMB7 | Juego 7 llaves combinadas matraca Husky (en su riel) | estuche | 245 × 175 × 45 | D1/D1/D1 | BASE C4 |
| CRIMP | Pinza crimpadora Weidmuller 1445070000 | pinza | 230 × 90 × 30 | F/F/F | ELE C2 |
| DETV | Detector de voltaje Milwaukee | estuche | 155 × 25 × 25 | F/F/F | ELE C1 |
| ESCAL | Juego 3 brocas escalonadas Truper | estuche | 150 × 90 × 35 | F/F/F | BASE C5 |
| ESCCAR | Escuadra de carpintero 12 in Truper EC-12 | estuche | 304 × 166 × 14 | D1/D1/D1 | MED C2 |
| ESCCOMB | Escuadra combinada 12 in Empire 220IM | estuche | 304 × 133 × 30 | D1/D1/F | MED C1 |
| ESCMAG | 4 escuadras magneticas 4 in Truper (apiladas) | estuche | 150 × 110 × 60 | F/F/F | SOL C3 |
| ESM45 | Mini esmeriladora 4-1/2 alambrica 6130-33 + cable | esmeril | 357 × 152 × 90 | D2/D2/D2 | BASE C8 |
| ESM45B | Mini esmeriladora 4-1/2 6130-33 (2a) | esmeril | 357 × 152 × 90 | D2/D2/D2 | SOL C3 |
| EXTECH | Amperimetro Extech MA440 | estuche | 200 × 70 × 40 | F/F/F | ELE C1 |
| EXTOR | Juego 5 extractores de tornillos Truper EXT-5 | estuche | 130 × 60 × 20 | F/F/F | SOL C2 |
| EXTQ | Extractor de quijadas 6 t Urrea 4216 | estuche | 300 × 160 × 50 | F/F/F | SOL C1 |
| EXTS | Extensiones 3/8 (6 in, 10 in, oscilantes) y palanca | estuche | 260 × 80 × 25 | F/F/F | BASE C6 |
| FLEX1 | Flexometro 5 m Stanley 30-615 | cilindro | 70 × 60 × 40 | D2/D2/D2 | BASE C5 |
| FLEX2 | Flexometro 5 m Stanley 30-615 | cilindro | 70 × 60 × 40 | D2/D2/D2 | BASE C5 |
| FLUKE | Pinza amperimetrica Fluke 302+ | pinza | 207 × 75 × 34 | D2/D2/D2 | ELE C1 |
| FRESA | Fresa de carburo SF-5 | estuche | 70 × 15 × 15 | F/F/F | SOL C1 |
| GRILL | 3 grilletes 5/8 Crosby | cilindro | 130 × 90 × 45 | F/F/F | MED C1 |
| HDS-A | 3 desarmadores Husky (P1, P1, P2) | estuche | 230 × 100 × 32 | F/F/F | BASE C5 |
| HDS-B | 3 desarmadores Husky (P2 x3) | estuche | 230 × 100 × 32 | F/F/F | BASE C6 |
| HDS-C | 3 desarmadores Husky 1/4 | estuche | 250 × 100 × 32 | F/F/F | ELE C1 |
| HDS-D | 3 desarmadores Husky 1/4, 3/16 | estuche | 250 × 100 × 32 | F/F/F | ELE C1 |
| IMP14 | Atornillador de impacto M18 3650-20 (sin bateria) | pistola | 196 × 112 × 53 | D2/D2/D2 | BASE C2 |
| IMP38 | Llave de impacto M18 FUEL 3/8 2854-20 (sin bateria) | pistola | 202 × 122 × 65 | D2/D2/D2 | BASE C1 |
| LASER | Nivel laser verde Bosch GLL 12-22 G | estuche | 100 × 64 × 104 | D2/D2/D1 | MED C1 |
| LASER2 | Nivel laser verde Bosch (2o) | estuche | 100 × 64 × 104 | D2/D2/D1 | MED C1 |
| LIJA | Lijadora orbital M18 2648-20 | estuche | 267 × 146 × 125 | D2/D2/D2 | CIV C7 |
| LIMAS | 3 limas 6 in (redonda, media cana, triangular) | estuche | 250 × 60 × 15 | D1/F/F | SOL C5 |
| MACH | Juego 40 machuelos y tarrajas Truper 11442 (2 estuches) | estuche | 330 × 290 × 45 | F/F/F | SOL C2 |
| MANGOS | 2 mangos laterales | estuche | 200 × 60 × 50 | F/F/F | CIV C2 |
| MAPPER | Probador de cableado Fluke MicroMapper MT-8200-49A | estuche | 125 × 52 × 30 | D2/D2/D2 | ELE C2 |
| MART | Martillo una curva 16 oz Truper MA-16F | llave | 340 × 130 × 30 | D1/D1/D1 | BASE C7 |
| MART2 | Martillo una curva 16 oz (2o) | llave | 340 × 130 × 30 | D1/D1/D1 | CIV C4 |
| MATR | Matraca 3/8 + dados (juego Husky P, 3/8) | estuche | 280 × 200 × 45 | F/F/F | BASE C4 |
| MAZO | Mazo de hule 16 oz Truper MH-16 | llave | 357 × 104 × 51 | D1/D1/D1 | CIV C8 |
| MINIP | Mini pinza de corte al ras 48-22-6105 | pinza | 127 × 60 × 13 | D2/D1/D2 | BASE C1 |
| MOTO | Moto tool Truper (estuche) | estuche | 300 × 200 × 80 | F/F/F | SOL C6 |
| NAVAJA | Navaja retractil Anvil | estuche | 224 × 88 × 20 | D1/D1/D1 | BASE C2 |
| NIVTUB1 | Nivel para tuberia 6.5 in Milwaukee 48-22-5110 | estuche | 159 × 51 × 19 | D2/D1/D2 | TUB C1 |
| NIVTUB2 | Nivel para tuberia 6.5 in Milwaukee 48-22-5110 | estuche | 159 × 51 × 19 | D2/D1/D2 | TUB C2 |
| PDIAG | Pinza diagonal 7 in Husky 903465 | pinza | 178 × 58 × 17 | D2/D1/D1 | BASE C3 |
| PELA | Pelacables Commercial Electric CE100821 | pinza | 170 × 55 × 15 | F/F/F | ELE C2 |
| PELEC | Pinza de electricista 9 in Husky 709195 | pinza | 250 × 50 × 15 | D1/D1/D1 | BASE C3 |
| PONCH | Pinza ponchadora RJ45 | pinza | 200 × 70 × 25 | F/F/F | ELE C2 |
| PREC6 | Juego 6 desarmadores de precision 48-22-2606 (estuche) | estuche | 190 × 90 × 25 | F/F/F | BASE C6 |
| PRES10 | Pinza de presion 10 in mordaza curva Husky 709204 | pinza | 254 × 66 × 26 | D1/D1/D1 | BASE C7 |
| PRES10B | Pinza de presion 10 in curva (2a) | pinza | 254 × 66 × 26 | D1/D1/D1 | SOL C1 |
| PRES11 | Pinza de presion C 11 in Torque Lock 48-22-3531 | pinza | 279 × 110 × 25 | D2/F/F | BASE C6 |
| PRES11B | Pinza de presion C 11 in (2a) | pinza | 279 × 110 × 25 | D2/F/F | SOL C1 |
| PRES6C | Pinza de presion C 6 in Torque Lock 48-22-3532 | pinza | 152 × 70 × 22 | D2/F/F | BASE C5 |
| PRES6CB | Pinza de presion C 6 in (2a) | pinza | 152 × 70 × 22 | D2/F/F | SOL C4 |
| PRES7 | Pinza de presion 7 in mordaza recta Husky | pinza | 182 × 62 × 23 | D2/D1/D1 | BASE C7 |
| PRES7B | Pinza de presion 7 in (2a, hoy faltante) | pinza | 182 × 62 × 23 | D2/D1/D1 | SOL C4 |
| RECT | Rectificador DeWalt DWE4887 | estuche | 290 × 70 × 70 | F/F/F | SOL C6 |
| ROTO18 | Rotomartillo M18 1/2 3602-20 (sin bateria) | pistola | 202 × 147 × 56 | D2/D2/D2 | BASE C1 |
| SACAB | 3 sacabocados Dogo 7, 13 y 19 mm | estuche | 130 × 90 × 40 | F/F/F | ELE C1 |
| SDS | Rotomartillo SDS-Plus 5485-21 (sin estuche) | llave | 335 × 195 × 75 | D1/D1/D1 | CIV C2 |
| SDSBIT | Juego 15 brocas y cinceles SDS-Plus DeWalt DWA0870 | estuche | 400 × 250 × 45 | F/F/F | CIV C3 |
| STILL1 | Llave stillson 14 in Husky 73126 | llave | 356 × 83 × 32 | D1/D1/D1 | TUB C1 |
| STILL2 | Llave stillson 14 in Husky 73126 | llave | 356 × 83 × 32 | D1/D1/D1 | TUB C2 |
| TAL12 | Taladro percutor alambrico 1/2 5375-20 | estuche | 340 × 265 × 86 | D1/D1/D1 | CIV C1 |
| TAZON | Tazon magnetico Husky | cilindro | 150 × 150 × 40 | D1/D1/D1 | BASE C5 |
| TORPEDO | Nivel torpedo magnetico 9 in Husky | estuche | 230 × 45 × 16 | D1/D1/D1 | BASE C1 |
| TORPEDO2 | Nivel torpedo magnetico 9 in (2o) | estuche | 230 × 45 × 16 | D1/D1/D1 | MED C2 |
| TORX | Juego llaves Torx/hex tipo navaja Husky | estuche | 130 × 45 × 30 | F/F/F | SOL C2 |
| VERN | Vernier digital 6 in Truper CALDI-6MP | estuche | 237 × 80 × 20 | D1/F/F | BASE C3 |
| WIHA-DS1 | Desarmador aislado PH1 x 80 (32101) | desarmador | 190 × 30 × 30 | F/F/F | BASE C4 |
| WIHA-DS2 | Desarmador aislado PH2 x 100 (32102) | desarmador | 215 × 32 × 32 | F/F/F | BASE C5 |
| WIHA-DS3 | Desarmador aislado plano 3.0 x 100 (32012) | desarmador | 205 × 28 × 28 | F/F/F | BASE C7 |
| WIHA-DS4 | Desarmador aislado plano 4.5 x 100 (32023) | desarmador | 215 × 30 × 30 | F/F/F | BASE C5 |
| WIHA-PC | Pinza de corte diagonal aislada 160 (32933) | pinza | 160 × 55 × 20 | D1/F/F | BASE C2 |
| WIHA-PE | Pinza combinada aislada 200 (32930) | pinza | 203 × 60 × 22 | D2/F/F | BASE C2 |
| WIHA-PP | Pinza de punta aislada 160 (32926) | pinza | 160 × 55 × 20 | D1/F/F | BASE C7 |
