// BASE-C8 · 48-22-8442 · cajon interior 414 x 318 x 127 mm · generado por cad/generar_cajon.py
include <../fts_rejilla.scad>
PARTE = "todo";   // "todo", "loseta0".."loseta3", o el id de una ficha

if (PARTE == "todo" || PARTE == "loseta0") color("#333") loseta(1.0, 1.0, 198.3, 198.3, 414, 318);
if (PARTE == "todo" || PARTE == "loseta1") color("#333") loseta(199.7, 1.0, 213.3, 198.3, 414, 318);
if (PARTE == "todo" || PARTE == "loseta2") color("#333") loseta(1.0, 199.7, 198.3, 117.3, 414, 318);
if (PARTE == "todo" || PARTE == "loseta3") color("#333") loseta(199.7, 199.7, 213.3, 117.3, 414, 318);
// FTS-BAS-01-C8-01 · ESM45 · Mini esmeriladora 4-1/2 alambrica 6130-33 + cable · contorno simplificado · niveles L/A/H D2D2D2
if (PARTE == "todo" || PARTE == "ESM45") color("#f2b705") ficha([[349.0, 0.0], [351.07, 0.27], [353.0, 1.07], [354.66, 2.34], [355.93, 4.0], [356.73, 5.93], [357.0, 8.0], [357.0, 144.0], [356.73, 146.07], [355.93, 148.0], [354.66, 149.66], [353.0, 150.93], [351.07, 151.73], [349.0, 152.0], [8.0, 152.0], [5.93, 151.73], [4.0, 150.93], [2.34, 149.66], [1.07, 148.0], [0.27, 146.07], [0.0, 144.0], [0.0, 8.0], [0.27, 5.93], [1.07, 4.0], [2.34, 2.34], [4.0, 1.07], [5.93, 0.27], [8.0, 0.0]], 357.0, 152.0, 25, 6, 12, "FTS-BAS-01-C8-01", [0, 1], []);
