// SOL-C5 · 48-22-8447 · cajon interior 414 x 318 x 63 mm · generado por cad/generar_cajon.py
include <../fts_rejilla.scad>
PARTE = "todo";   // "todo", "loseta0".."loseta3", o el id de una ficha

if (PARTE == "todo" || PARTE == "loseta0") color("#333") loseta(1.0, 1.0, 198.3, 198.3, 414, 318);
if (PARTE == "todo" || PARTE == "loseta1") color("#333") loseta(199.7, 1.0, 213.3, 198.3, 414, 318);
if (PARTE == "todo" || PARTE == "loseta2") color("#333") loseta(1.0, 199.7, 198.3, 117.3, 414, 318);
if (PARTE == "todo" || PARTE == "loseta3") color("#333") loseta(199.7, 199.7, 213.3, 117.3, 414, 318);
// FTS-SOL-01-C5-01 · LIMAS · 3 limas 6 in (redonda, media cana, triangular) · contorno simplificado · niveles L/A/H D1FF
if (PARTE == "todo" || PARTE == "LIMAS") color("#f2b705") ficha([[242.0, 0.0], [244.07, 0.27], [246.0, 1.07], [247.66, 2.34], [248.93, 4.0], [249.73, 5.93], [250.0, 8.0], [250.0, 52.0], [249.73, 54.07], [248.93, 56.0], [247.66, 57.66], [246.0, 58.93], [244.07, 59.73], [242.0, 60.0], [8.0, 60.0], [5.93, 59.73], [4.0, 58.93], [2.34, 57.66], [1.07, 56.0], [0.27, 54.07], [0.0, 52.0], [0.0, 8.0], [0.27, 5.93], [1.07, 4.0], [2.34, 2.34], [4.0, 1.07], [5.93, 0.27], [8.0, 0.0]], 250.0, 60.0, 9.0, 6, 12, "FTS-SOL-01-C5-01", [0, 1]);
