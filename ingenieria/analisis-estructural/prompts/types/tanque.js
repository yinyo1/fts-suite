// ═══ Prompt específico: Soporte de Tanque ═══

TYPE_PROMPTS['tanque'] = `TIPO DE ANÁLISIS: SOPORTE DE TANQUE / RECIPIENTE

NORMAS APLICABLES:
AISC 360-10, API 650 (Welded Tanks), ASME Sección VIII para recipientes a presión, ASCE 7-10 Capítulo 15 (non-building structures), ACI 318-19 anclajes, AISC Design Guide 7.

ESTRUCTURA DEL ANÁLISIS:
1. INTRODUCCIÓN — Alcance: tipo de tanque, contenido, capacidad, ubicación
2. CRITERIOS GENERALES — Normas, materiales
3. DESCRIPCIÓN DEL SISTEMA — Tabla:
   - Dimensiones del tanque (diámetro, altura)
   - Peso vacío, volumen, densidad contenido, % llenado
   - Altura del CG del tanque lleno
   - Accesorios conectados (tuberías, válvulas)
4. PROPIEDADES DE SECCIONES — Perfiles del soporte (columnas, vigas de silleta)
5. CARGAS Y COMBINACIONES —
   - Peso tanque vacío: W_vacio
   - Peso contenido: W_cont = contenido_volumen × densidad × %llenado
   - Peso total operación: W_total = W_vacio + W_cont + W_accesorios
   - CM distribuida sobre el soporte
   - Fuerza sísmica: Fs = Cs × W_total (Cs según ASCE 7 zona)
   - Fuerza viento lateral: Fw = qz × Cf × Aproy (ASCE 7)
   - Combinaciones LRFD/ASD
6. ANÁLISIS DE VUELCO (OBLIGATORIO) —
   - Momento volcador: Mv = Fs × h_cg + Fw × (h_tanque/2)
   - Momento estabilizador: Me = W_total × (base/2)
   - FS_vuelco = Me / Mv ≥ 1.5
   - Si FS_vuelco < 1.5: diseñar anclajes a tensión
   - Verificar levantamiento (uplift) en taquetes a barlovento
7. DISEÑO DE COLUMNAS DEL SOPORTE —
   - Carga axial por columna: P = W_total / num_columnas + efectos sísmicos
   - Pandeo K=1.2 sin arriostres, K=0.65 arriostrado
   - Interacción AISC H1-1 (axial + flexión por sismo/viento)
8. DISEÑO DE VIGAS DE SILLETA —
   - Viga circular de apoyo para tanque cilíndrico
   - Flexión + cortante
9. DISEÑO PLACA BASE Y TAQUETES —
   - Tensión por uplift (crítico en tanques altos)
   - Cortante por sismo/viento
   - Interacción ACI 318 (5/3)
   - Verificar empotramiento mínimo en concreto
10. VALIDACIÓN FEA — si hay datos Von Mises del modelo
11. CONCLUSIONES — tabla con especial énfasis en FS_vuelco

CÁLCULOS OBLIGATORIOS:
- W_total = peso_recipiente_vacio + (contenido_volumen × densidad × %llenado/100) + accesorios
- Verificar W_total ≤ capacidad estructural del soporte
- Fuerza sísmica: Fs = Cs × W_total (Cs ≈ 0.15 zona B, 0.30 zona D)
- Momento volcador: Mv = Fs × h_cg_total
- Momento estabilizador: Me = W_total × b/2 (b = base)
- FS_vuelco = Me / Mv ≥ 1.5 (CRÍTICO)
- Uplift por taquete: T_max = (Mv − Me) / (num_taquetes × brazo)
- Compresión por taquete: C_max = W_total / num_taquetes + M/brazo
- FS mínimos: Flexión ≥ 1.67, Pandeo ≥ 2.0, Vuelco ≥ 1.5, Taquete tensión ≥ 2.5

DIAGRAMAS SVG ESPECÍFICOS DE TANQUE:

DIAGRAMA 1 — VISTA ALZADO DEL TANQUE (después de sección 3):
SVG 500×600. Centrado.
- Tanque: cilindro vertical gris claro (rectángulo con curvas arriba/abajo)
- Contenido: área #2E75B6 hasta %llenado
- Etiquetas: diámetro arriba, altura lateral izquierda
- CG marcado con cruz roja + etiqueta "CG a X mm"
- Soporte abajo: estructura con columnas y vigas
- Base y taquetes en el fondo
- Cotas principales

DIAGRAMA 2 — ANÁLISIS DE VUELCO (después de sección 6):
SVG 700×500.
- Tanque en posición con CG marcado
- Flecha #f39c12 horizontal: "Fs = X kN" (sísmica)
- Flecha #27ae60 vertical hacia abajo en base: "W = X kN"
- Momento volcador señalado con arco rojo alrededor del punto de vuelco
- Caja info:
  "Mv = Fs × h_cg = X kN·m"
  "Me = W × b/2 = Y kN·m"
  "FS = Me/Mv = Z"
- Caja ok-box o warn-box según FS ≥ 1.5

DIAGRAMA 3 — DETALLE DE ANCLAJE CON UPLIFT (después de sección 9):
SVG 600×450.
- Vista lateral de la placa base con taquetes
- Taquetes a barlovento con flecha #e74c3c hacia arriba: "T_max = X kN"
- Taquetes a sotavento con flecha #27ae60 hacia abajo: "C_max = Y kN"
- Concreto (losa/dado) con hatch
- Cota de empotramiento
- Info box con FS de taquetes

DIAGRAMA 4 — CARGAS DEL SOPORTE (después de sección 7):
SVG 700×400.
- Columnas verticales del soporte (2-4 según num_columnas)
- Reacciones verticales + cortantes en la base
- Momento flector por sismo horizontal
- Etiquetas de P y M máximos
`;
