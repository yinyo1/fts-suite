// CIV-C3 · 48-22-8444 · cajon interior 414 x 318 x 58 mm · generado por cad/generar_cajon.py
include <../fts_rejilla.scad>
PARTE = "todo";   // "todo", "loseta0".."loseta3", o el id de una ficha

if (PARTE == "todo" || PARTE == "loseta0") color("#333") loseta(1.0, 1.0, 198.3, 198.3, 414, 318);
if (PARTE == "todo" || PARTE == "loseta1") color("#333") loseta(199.7, 1.0, 213.3, 198.3, 414, 318);
if (PARTE == "todo" || PARTE == "loseta2") color("#333") loseta(1.0, 199.7, 198.3, 117.3, 414, 318);
if (PARTE == "todo" || PARTE == "loseta3") color("#333") loseta(199.7, 199.7, 213.3, 117.3, 414, 318);
// FTS-CIV-01-C3-01 · SDSBIT · Juego 15 brocas y cinceles SDS-Plus DeWalt DWA0870 · contorno simplificado · niveles L/A/H FFF
if (PARTE == "todo" || PARTE == "SDSBIT") color("#f2b705") ficha([[392.0, 0.0], [394.07, 0.27], [396.0, 1.07], [397.66, 2.34], [398.93, 4.0], [399.73, 5.93], [400.0, 8.0], [400.0, 242.0], [399.73, 244.07], [398.93, 246.0], [397.66, 247.66], [396.0, 248.93], [394.07, 249.73], [392.0, 250.0], [8.0, 250.0], [5.93, 249.73], [4.0, 248.93], [2.34, 247.66], [1.07, 246.0], [0.27, 244.07], [0.0, 242.0], [0.0, 8.0], [0.27, 5.93], [1.07, 4.0], [2.34, 2.34], [4.0, 1.07], [5.93, 0.27], [8.0, 0.0]], 400.0, 250.0, 25, 6, 12, "FTS-CIV-01-C3-01", [0, 1], []);
