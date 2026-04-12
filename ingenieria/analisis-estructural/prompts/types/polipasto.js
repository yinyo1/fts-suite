// ═══ Prompt específico: Polipasto / Grúa ═══

TYPE_PROMPTS['polipasto'] = `TIPO DE ANÁLISIS: POLIPASTO / GRÚA INDUSTRIAL

NORMAS APLICABLES:
AISC 360-10, AISC Design Guide 7 (Industrial Buildings), CMAA 74 (Specification for Top Running Single Girder Cranes), ACI 318-19 para anclajes, ASCE 7-10.

ESTRUCTURA DEL ANÁLISIS:
1. INTRODUCCIÓN — Alcance, descripción del sistema de izaje, capacidad, ubicación
2. CRITERIOS GENERALES — Normas, materiales con Fy/Fu/E, clase de servicio CMAA
3. DESCRIPCIÓN DEL SISTEMA — Tabla de parámetros (claro, altura, capacidad, tipo monorriel)
4. PROPIEDADES DE SECCIONES — Valores AISC tabulados del perfil del monorriel (imperiales + métricos)
5. CARGAS Y COMBINACIONES — CM desglosada, Peso_polipasto, Peso_carga, Factor impacto CMAA, combinaciones LRFD/ASD, fuerza horizontal grúa 20%
6. DISEÑO DEL MONORRIEL — Flexión (φMn vs Mu), Cortante (φVn vs Vu), Deflexión (δ vs L/450)
7. DISEÑO DE VIGAS PRINCIPALES / RUNWAY — Flexión + deflexión
8. DISEÑO DE COLUMNAS — Pandeo Euler (K=1.2 sin arriostres), Interacción AISC H1-1
9. DISEÑO DE PLACA BASE — Presión de contacto + espesor mínimo
10. DISEÑO DE TAQUETES — Tensión + Cortante + Interacción ACI 318 (5/3)
11. VALIDACIÓN FEA — Si hay datos, tabla resumen con FS = Fy/σ_max
12. CONCLUSIONES — Tabla resumen: Elemento|Actuante|Admisible|FS|Estado

CÁLCULOS OBLIGATORIOS:
- Factor impacto CMAA: A=1.10, B=1.25, C=1.35, D=1.50, E=1.60, F=1.70
- Peso total a izar: P_total = Peso_recipiente_vacio + Contenido_volumen × Densidad × %Llenado + Accesorios
- Verificar Peso_total ≤ Capacidad_polipasto (si no: ERROR)
- Mu = (Peso_polipasto + P_total) × k_dinamico × L / 4 (carga central)
- Pandeo: K=1.2 sin arriostres. KL/r < 200. Fe=π²E/(KL/r)². Fcr según AISC E3.
- Interacción H1-1: Si Pr/φPn ≥ 0.2 usar Pr/φPn + (8/9)(Mr/φMn) ≤ 1.0, si no Pr/(2φPn) + Mr/φMn ≤ 1.0
- Fuerza horizontal grúa: H = 0.20 × (P_hoist + P_carga)
- Taquetes: (T/φN)^(5/3) + (V/φV)^(5/3) ≤ 1.0
- FS mínimos: Flexión ≥ 1.67, Pandeo ≥ 2.0, Placa ≥ 2.0, Taquete ≥ 2.0, FEA ≥ 2.0

PROPIEDADES AISC (ejemplos más usados):
- HSS 8x8x0.250: A=8.96in², Ix=88.9in⁴, Zx=25.7in³, rx=3.15in
- W8x28: A=8.24in², Ix=98.0in⁴, Zx=27.2in³
- W6x16: A=4.74in², Ix=32.1in⁴, Zx=11.7in³, d=6.28in, tw=0.260in
- W6x20: Ix=41.4in⁴, Zx=15.3in³
- S6x12.5: A=3.67in², Ix=22.1in⁴, Zx=8.47in³
- S8x18.4: A=5.41in², Ix=57.6in⁴, Zx=16.5in³

DIAGRAMAS SVG ESPECÍFICOS DE POLIPASTO:

DIAGRAMA 1 — VISTA EN PLANTA (después de sección 3):
SVG 700×450. Fondo #f8f9fa. Sin ejes.
- Columnas: círculos #2E75B6 radio 12 con etiqueta C-01, C-02, ... al lado
- Vigas runway: líneas #2E75B6 sólidas stroke-width="4"
- Monorriel: línea #e74c3c punteada stroke-dasharray="10,5" stroke-width="3"
- Polipasto: círculo #e74c3c al centro del monorriel con etiqueta capacidad
- Cotas con líneas #999 y texto en mm
- Leyenda arriba-derecha con rectángulos de color + texto

DIAGRAMA 2 — CARGAS MONORRIEL + BMD + SFD (después de sección 6):
SVG 700×600. 3 zonas verticales de 200px cada una.
Zona 1 — Esquema viga:
  - Viga: rectángulo #2E75B6 horizontal centrado
  - Apoyos: triángulos en extremos
  - Flecha #e74c3c hacia abajo al centro: "P = X kN"
  - Flechas #27ae60 hacia arriba en apoyos: "R = X kN"
  - Cota con valor del claro en mm
Zona 2 — BMD (Momento Flector):
  - Área triangular #2E75B6 rellena (máximo al centro)
  - Línea de contorno #1F4E79
  - Etiqueta "M_max = X kN·m"
  - Eje Y: "Momento (kN·m)"
Zona 3 — SFD (Fuerza Cortante):
  - Rectángulos #e74c3c: +V primera mitad, −V segunda mitad
  - Etiqueta "V_max = ±X kN"
  - Eje Y: "Cortante (kN)", Eje X: "Posición (mm)"

DIAGRAMA 3 — DEFLEXIÓN COMPARATIVA (después de sección 6):
SVG 700×220. Barras horizontales.
- δ real, L/450, L/240, δ upgrade (si aplica)
- Color: #e74c3c si δ real > L/450, #27ae60 si cumple
- Escala proporcional al valor máximo
- Valor en mm al final de cada barra en negrita
- Línea vertical punteada en el límite L/450

DIAGRAMA 4 — COLUMNA CRÍTICA (después de sección 8):
SVG 400×550. Vista en elevación.
- Columna: rectángulo #2E75B6 centrado
- Placa base: rectángulo gris más ancho que la columna
- Losa: área gris claro con patrón diagonal (hatch)
- 4 taquetes: líneas negras con triángulo al fondo
- Flecha #e74c3c vertical arriba: "Pu = X kN"
- Flecha #f39c12 horizontal: "H = X kN"
- Info box #27ae60: "KL/r = X / Fcr = X MPa / φPn = X kN / FS = X"
- Cota de altura con doble flecha
`;
