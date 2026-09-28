// BASE-C9 · 48-22-8420 · cajon interior 432 x 330 x 200 mm · generado por cad/generar_cajon.py
include <../fts_rejilla.scad>
PARTE = "todo";   // "todo", "loseta0".."loseta3", o el id de una ficha

if (PARTE == "todo" || PARTE == "loseta0") color("#333") loseta(1.0, 1.0, 198.3, 198.3, 432, 330);
if (PARTE == "todo" || PARTE == "loseta1") color("#333") loseta(199.7, 1.0, 209.6, 198.3, 432, 330);
if (PARTE == "todo" || PARTE == "loseta2") color("#333") loseta(409.7, 1.0, 21.3, 198.3, 432, 330);
if (PARTE == "todo" || PARTE == "loseta3") color("#333") loseta(1.0, 199.7, 198.3, 129.3, 432, 330);
if (PARTE == "todo" || PARTE == "loseta4") color("#333") loseta(199.7, 199.7, 209.6, 129.3, 432, 330);
if (PARTE == "todo" || PARTE == "loseta5") color("#333") loseta(409.7, 199.7, 21.3, 129.3, 432, 330);
// FTS-BAS-01-C9-01 · CARG1 · Cargador sencillo M18/M12 48-59-1812 (compra) · contorno simplificado · niveles L/A/H D2D2D2
if (PARTE == "todo" || PARTE == "CARG1") color("#f2b705") ficha([[147.0, 0.0], [149.07, 0.27], [151.0, 1.07], [152.66, 2.34], [153.93, 4.0], [154.73, 5.93], [155.0, 8.0], [155.0, 194.0], [154.73, 196.07], [153.93, 198.0], [152.66, 199.66], [151.0, 200.93], [149.07, 201.73], [147.0, 202.0], [8.0, 202.0], [5.93, 201.73], [4.0, 200.93], [2.34, 199.66], [1.07, 198.0], [0.27, 196.07], [0.0, 194.0], [0.0, 8.0], [0.27, 5.93], [1.07, 4.0], [2.34, 2.34], [4.0, 1.07], [5.93, 0.27], [8.0, 0.0]], 155, 202, 25, 6, 6, "FTS-BAS-01-C9-01");
