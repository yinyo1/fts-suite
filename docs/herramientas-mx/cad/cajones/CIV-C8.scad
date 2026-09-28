// CIV-C8 · 48-22-8420 · cajon interior 432 x 330 x 200 mm · generado por cad/generar_cajon.py
include <../fts_rejilla.scad>
PARTE = "todo";   // "todo", "loseta0".."loseta3", o el id de una ficha

if (PARTE == "todo" || PARTE == "loseta0") color("#333") loseta(1.0, 1.0, 198.3, 198.3, 432, 330);
if (PARTE == "todo" || PARTE == "loseta1") color("#333") loseta(199.7, 1.0, 209.6, 198.3, 432, 330);
if (PARTE == "todo" || PARTE == "loseta2") color("#333") loseta(409.7, 1.0, 21.3, 198.3, 432, 330);
if (PARTE == "todo" || PARTE == "loseta3") color("#333") loseta(1.0, 199.7, 198.3, 129.3, 432, 330);
if (PARTE == "todo" || PARTE == "loseta4") color("#333") loseta(199.7, 199.7, 209.6, 129.3, 432, 330);
if (PARTE == "todo" || PARTE == "loseta5") color("#333") loseta(409.7, 199.7, 21.3, 129.3, 432, 330);
// FTS-CIV-01-C8-01 · MAZO · Mazo de hule 16 oz Truper MH-16 · contorno simplificado · niveles L/A/H D1D1D1
if (PARTE == "todo" || PARTE == "MAZO") color("#f2b705") ficha([[349.0, 0.0], [351.07, 0.27], [353.0, 1.07], [354.66, 2.34], [355.93, 4.0], [356.73, 5.93], [357.0, 8.0], [357.0, 96.0], [356.73, 98.07], [355.93, 100.0], [354.66, 101.66], [353.0, 102.93], [351.07, 103.73], [349.0, 104.0], [8.0, 104.0], [5.93, 103.73], [4.0, 102.93], [2.34, 101.66], [1.07, 100.0], [0.27, 98.07], [0.0, 96.0], [0.0, 8.0], [0.27, 5.93], [1.07, 4.0], [2.34, 2.34], [4.0, 1.07], [5.93, 0.27], [8.0, 0.0]], 357, 104, 25, 6, 6, "FTS-CIV-01-C8-01");
