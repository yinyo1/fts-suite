// CIV-C1 · 48-22-8442 · cajon interior 414 x 318 x 127 mm · generado por cad/generar_cajon.py
include <../fts_rejilla.scad>
PARTE = "todo";   // "todo", "loseta0".."loseta3", o el id de una ficha

if (PARTE == "todo" || PARTE == "loseta0") color("#333") loseta(1.0, 1.0, 198.3, 198.3, 414, 318);
if (PARTE == "todo" || PARTE == "loseta1") color("#333") loseta(199.7, 1.0, 213.3, 198.3, 414, 318);
if (PARTE == "todo" || PARTE == "loseta2") color("#333") loseta(1.0, 199.7, 198.3, 117.3, 414, 318);
if (PARTE == "todo" || PARTE == "loseta3") color("#333") loseta(199.7, 199.7, 213.3, 117.3, 414, 318);
// FTS-CIV-01-C1-01 · TAL12 · Taladro percutor alambrico 1/2 5375-20 · contorno simplificado · niveles L/A/H D1D1D1
if (PARTE == "todo" || PARTE == "TAL12") color("#f2b705") ficha([[332.0, 0.0], [334.07, 0.27], [336.0, 1.07], [337.66, 2.34], [338.93, 4.0], [339.73, 5.93], [340.0, 8.0], [340.0, 257.0], [339.73, 259.07], [338.93, 261.0], [337.66, 262.66], [336.0, 263.93], [334.07, 264.73], [332.0, 265.0], [8.0, 265.0], [5.93, 264.73], [4.0, 263.93], [2.34, 262.66], [1.07, 261.0], [0.27, 259.07], [0.0, 257.0], [0.0, 8.0], [0.27, 5.93], [1.07, 4.0], [2.34, 2.34], [4.0, 1.07], [5.93, 0.27], [8.0, 0.0]], 340, 265, 25, 6, 6, "FTS-CIV-01-C1-01");
