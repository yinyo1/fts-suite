include <../fts_rejilla.scad>
PARTE = "c0";
for (i = [0:3]) if (PARTE == str("c", i)) bandeja_8420_cuadrante(i);
if (PARTE == "poste") poste_8420();
if (PARTE == "union") placa_union();
if (PARTE == "todo") { for (i = [0:3]) color("#f2b705") bandeja_8420_cuadrante(i); }
