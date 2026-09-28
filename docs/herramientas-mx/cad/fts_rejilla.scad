// FTS Herramientas MX · sistema de siluetas para cajones PACKOUT (sesion nocturna 1, #330)
// Material: PETG. Unidades: mm. Todo es parametrico; los valores por defecto salen de la Fase 4 (#325).
//
// PIEZAS
//   loseta(x0, y0, w, h)   placa base con agujeros en una rejilla de 21 mm (la rejilla de 42 mm mas sus puntos medios).
//                          Un cajon se cubre con 4 losetas que caben en una cama de 220 mm.
//   ficha(pts, alto, x, y) charola independiente por herramienta: contorno libre, pernos que caen exactamente en los
//                          agujeros de la loseta (se calculan con la posicion absoluta de la ficha en el cajon).
//   bandeja_8420_cuadrante(i) / poste_8420()   bandeja removible de media altura para la 48-22-8420.
//
// HOLGURAS (Fase 4)
//   entre piezas 12 mm = 3 de pared + 6 de agarre + 3 de pared; contra la pared del cajon 6 mm;
//   alto 10 mm = 3 de base + 7 libres. Holgura herramienta-contorno: 1.0 mm por lado (PETG, boquilla 0.4).

PASO        = 21;     // rejilla de anclaje: 42 mm / 2
ORIGEN      = 10.5;   // primer agujero a medio paso del borde del cajon
D_AGUJERO   = 5.4;    // agujero en la loseta
D_PERNO     = 5.0;    // perno bajo la ficha (0.2 mm de juego por lado)
ALTO_PERNO  = 2.2;
ESP_LOSETA  = 2.4;
BASE_FICHA  = 1.2;    // piso de la ficha (loseta 2.4 + piso 1.2 = 3.6 ~ los 3 mm de base de la Fase 4)
PARED       = 3;      // pared de la silueta
HOLGURA     = 1.0;    // entre herramienta y contorno, por lado
DEDO        = 22;     // diametro del rebaje para meter los dedos
MARGEN_PERNO= 5;      // un perno se pone solo si queda a >= 5 mm del borde de la ficha
// Loseta aligerada (sesion nocturna 2, #338): una ventana circular en el centro de cada celda de la rejilla, entre 4
// agujeros. Con 16 mm de diametro quedan 5 mm de costilla entre ventanas y 6.9 mm de material entre ventana y agujero
// (anillo de 4.2 mm alrededor del agujero de 5.4, donde entra el perno). Se quita el 45.6 % del area de cada celda
// (pi x 8^2 / 21^2). LOSETA_LIGERA = false vuelve a la loseta solida de la sesion 1.
LOSETA_LIGERA = true;
D_VENTANA   = 16;
BORDE_LOSETA= 4;      // ninguna ventana a menos de 4 mm del borde de la loseta
$fn = 32;

// ------------------------------------------------------------------ loseta
module loseta(x0, y0, w, h, ancho_cajon, fondo_cajon) {
    difference() {
        translate([x0, y0, 0]) cube([w, h, ESP_LOSETA]);
        for (i = [0 : floor((ancho_cajon - ORIGEN) / PASO)], j = [0 : floor((fondo_cajon - ORIGEN) / PASO)]) {
            px = ORIGEN + i * PASO; py = ORIGEN + j * PASO;
            if (px > x0 + 3 && px < x0 + w - 3 && py > y0 + 3 && py < y0 + h - 3)
                translate([px, py, -1]) cylinder(d = D_AGUJERO, h = ESP_LOSETA + 2);
            // ventana al centro de la celda (entre este agujero y los de +x, +y)
            cx = px + PASO / 2; cy = py + PASO / 2;
            if (LOSETA_LIGERA && cx - D_VENTANA / 2 > x0 + BORDE_LOSETA && cx + D_VENTANA / 2 < x0 + w - BORDE_LOSETA
                && cy - D_VENTANA / 2 > y0 + BORDE_LOSETA && cy + D_VENTANA / 2 < y0 + h - BORDE_LOSETA)
                translate([cx, cy, -1]) cylinder(d = D_VENTANA, h = ESP_LOSETA + 2);
        }
        // rotulo en bajo relieve: cajon y posicion de la loseta
    }
}

// ------------------------------------------------------------------ ficha
// pts: contorno de la HERRAMIENTA en coordenadas locales (0,0 = esquina de su rectangulo envolvente), sin holgura.
// L, A: rectangulo envolvente de la herramienta. prof: profundidad de la cavidad. (x, y): esquina de la herramienta
// dentro del cajon, tal como la da el acomodo. etiqueta: numero de activo grabado en el piso de la ficha.
// lados: rebajes de dedo que se cortan, en los dos lados LARGOS de la ficha. 0 = lado de coordenada menor, 1 = mayor.
// Sesion nocturna 2 (#338): antes el rebaje iba siempre en los lados paralelos a L, o sea en los CORTOS cuando la pieza
// va girada (L < A en el marco del cajon); ahora va en los largos, y solo del lado donde caben los dedos
// (scripts/interferencias_3d.py decide cual, contra la pared y el labio).
module ficha(pts, L, A, prof, x, y, etiqueta = "", lados = [0, 1]) {
    ext = PARED + HOLGURA;
    alto = BASE_FICHA + prof;
    translate([x, y, ESP_LOSETA]) difference() {
        union() {
            // cuerpo: contorno + holgura + pared, con esquinas redondeadas
            linear_extrude(alto) offset(r = ext) polygon(pts);
            // pernos: en cada punto de la rejilla que cae dentro de la HUELLA REAL de la ficha, a >= MARGEN_PERNO del borde
            intersection() {
                translate([0, 0, -ALTO_PERNO]) linear_extrude(ALTO_PERNO + 0.01) offset(r = ext - MARGEN_PERNO) polygon(pts);
                for (i = [0 : 40], j = [0 : 30]) {
                    gx = ORIGEN + i * PASO - x; gy = ORIGEN + j * PASO - y;
                    if (gx > -ext && gx < L + ext && gy > -ext && gy < A + ext)
                        translate([gx, gy, -ALTO_PERNO]) cylinder(d = D_PERNO, h = ALTO_PERNO + 0.01);
                }
            }
        }
        // cavidad de la herramienta
        translate([0, 0, BASE_FICHA]) linear_extrude(prof + 1) offset(delta = HOLGURA) polygon(pts);
        // rebajes para dedos, al centro de los dos lados largos
        for (s = lados) {
            if (L >= A) translate([L / 2, s == 0 ? -ext : A + ext, BASE_FICHA + DEDO / 2]) rotate([0, 90, 0]) cylinder(d = DEDO, h = min(L * 0.5, 60), center = true);
            else        translate([s == 0 ? -ext : L + ext, A / 2, BASE_FICHA + DEDO / 2]) rotate([90, 0, 0]) cylinder(d = DEDO, h = min(A * 0.5, 60), center = true);
        }
        // numero de activo grabado en el piso (0.6 mm)
        if (etiqueta != "") translate([L / 2, A / 2, BASE_FICHA - 0.6]) linear_extrude(1) text(etiqueta, size = min(5, A / 4), halign = "center", valign = "center");
    }
}

// ------------------------------------------------------------------ bandeja 8420
// Cajon de la 8420: 432 x 330 (el 432 es fragmento de buscador; medir) x 406 de alto (fabricante).
// Bandeja a media altura: cara superior a 200 mm del piso; deja 190 arriba y 200 abajo (Fase 4).
// Se imprime en 4 cuadrantes de 215 x 164 (caben en 220) que se unen con 6 tornillos M4 y descansa en 4 postes.
B_ANCHO = 430; B_FONDO = 328; B_ESP = 4; B_COSTILLA = 10; B_ALTURA = 200; D_POSTE = 30;
module bandeja_8420_cuadrante(i) {   // i = 0..3; cada uno mide 215 x 164, cabe en la cama de 220
    w = B_ANCHO / 2; h = B_FONDO / 2; ox = (i % 2) * w; oy = floor(i / 2) * h;
    translate([ox, oy, 0]) difference() {
        union() {
            cube([w, h, B_ESP]);
            // costillas cada 42 mm en las dos direcciones (rigidez para 15 kg, supuesto de diseno)
            for (k = [0 : 42 : w - 2]) translate([k, 0, 0]) cube([2, h, B_COSTILLA]);
            for (k = [0 : 42 : h - 2]) translate([0, k, 0]) cube([w, 2, B_COSTILLA]);
            translate([w - 2, 0, 0]) cube([2, h, B_COSTILLA]); translate([0, h - 2, 0]) cube([w, 2, B_COSTILLA]);
        }
        // agujeros M4 a 12 mm de las costuras, para las placas de union (2 por costura y lado)
        sx = (i % 2 == 0) ? w - 12 : 12; sy = (floor(i / 2) == 0) ? h - 12 : 12;
        for (t = [40, h - 40]) translate([sx, t, -1]) cylinder(d = 4.4, h = 20);
        for (t = [40, w - 40]) translate([t, sy, -1]) cylinder(d = 4.4, h = 20);
        // asiento del poste en la esquina exterior
        cx = (i % 2 == 0) ? 25 : w - 25; cy = (floor(i / 2) == 0) ? 25 : h - 25;
        translate([cx, cy, -1]) cylinder(d = D_POSTE + 0.6, h = B_COSTILLA - 3);
        // agarradera: ranura de 45 x 25 en el borde frontal de los dos cuadrantes de enfrente
        if (floor(i / 2) == 0) translate([(i % 2 == 0) ? w - 45 : 0, -1, -1]) cube([45, 26, 30]);
    }
}
module placa_union() {   // 4 piezas por bandeja; se atornillan por debajo cruzando la costura (M4 x 16)
    difference() { cube([60, 24, 4]); for (x = [6, 30]) translate([x, 12, -1]) cylinder(d = 4.4, h = 6); }
}
module poste_8420() {   // 4 piezas; cada una se imprime parada
    difference() { cylinder(d = D_POSTE, h = B_ALTURA - B_ESP); translate([0, 0, -1]) cylinder(d = D_POSTE - 6, h = B_ALTURA); }
}
