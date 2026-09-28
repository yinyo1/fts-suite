// SOL-C5 · 48-22-8447 · cajon interior 414 x 318 x 63 mm · generado por cad/generar_cajon.py
include <../fts_rejilla.scad>
PARTE = "todo";   // "todo", "loseta0".."loseta3", o el id de una ficha

if (PARTE == "todo" || PARTE == "loseta0") color("#333") loseta(1.0, 1.0, 198.3, 198.3, 414, 318);
if (PARTE == "todo" || PARTE == "loseta1") color("#333") loseta(199.7, 1.0, 213.3, 198.3, 414, 318);
if (PARTE == "todo" || PARTE == "loseta2") color("#333") loseta(1.0, 199.7, 198.3, 117.3, 414, 318);
if (PARTE == "todo" || PARTE == "loseta3") color("#333") loseta(199.7, 199.7, 213.3, 117.3, 414, 318);
// FTS-SOL-01-C5-01 · LIMAS · 3 limas 6 in (redonda, media cana, triangular) · contorno simplificado · niveles L/A/H D1FF
if (PARTE == "todo" || PARTE == "LIMAS") color("#f2b705") ficha([[52.0, 0.0], [54.07, 0.27], [56.0, 1.07], [57.66, 2.34], [58.93, 4.0], [59.73, 5.93], [60.0, 8.0], [60.0, 242.0], [59.73, 244.07], [58.93, 246.0], [57.66, 247.66], [56.0, 248.93], [54.07, 249.73], [52.0, 250.0], [8.0, 250.0], [5.93, 249.73], [4.0, 248.93], [2.34, 247.66], [1.07, 246.0], [0.27, 244.07], [0.0, 242.0], [0.0, 8.0], [0.27, 5.93], [1.07, 4.0], [2.34, 2.34], [4.0, 1.07], [5.93, 0.27], [8.0, 0.0]], 60, 250, 9.0, 6, 6, "FTS-SOL-01-C5-01");
