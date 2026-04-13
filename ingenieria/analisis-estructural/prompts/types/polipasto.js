// ═══ Prompt específico: Polipasto / Grúa ═══

TYPE_PROMPTS['polipasto'] = `TIPO DE ANÁLISIS: POLIPASTO / GRÚA INDUSTRIAL

ESTRUCTURA OBLIGATORIA DEL DOCUMENTO:

PÁGINA 1 — PORTADA (antes de cualquier sección, obligatoria, estilo MC-HOI-001-2026):
<div class="portada" style="page-break-after:always;padding:20px">
  <h1 style="text-align:center;font-size:22px;margin:40px 0 8px;color:#1F4E79">MEMORIA DE CÁLCULO</h1>
  <p style="text-align:center;font-size:13px;color:#555;margin-bottom:40px">Análisis Estructural · Polipasto / Grúa Industrial</p>

  <!-- Tabla de datos del proyecto (labels fondo azul oscuro) -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:30px">
    <tr>
      <td style="background:#1F4E79;color:#fff;padding:6px 10px;width:35%;border:1px solid #1F4E79;font-weight:bold">CLIENTE</td>
      <td style="padding:6px 10px;border:1px solid #ccc">[cliente] / [ubicacion_planta]</td>
    </tr>
    <tr>
      <td style="background:#1F4E79;color:#fff;padding:6px 10px;border:1px solid #1F4E79;font-weight:bold">UBICACIÓN</td>
      <td style="padding:6px 10px;border:1px solid #ccc">[ubicacion_municipio], [ubicacion_estado]</td>
    </tr>
    <tr>
      <td style="background:#1F4E79;color:#fff;padding:6px 10px;border:1px solid #1F4E79;font-weight:bold">PROYECTO</td>
      <td style="padding:6px 10px;border:1px solid #ccc">[proyecto]</td>
    </tr>
    <tr>
      <td style="background:#1F4E79;color:#fff;padding:6px 10px;border:1px solid #1F4E79;font-weight:bold">No. DOC.</td>
      <td style="padding:6px 10px;border:1px solid #ccc">[num_documento]</td>
    </tr>
    <tr>
      <td style="background:#1F4E79;color:#fff;padding:6px 10px;border:1px solid #1F4E79;font-weight:bold">DOCUMENTO</td>
      <td style="padding:6px 10px;border:1px solid #ccc">[nombre_documento]</td>
    </tr>
    <tr>
      <td style="background:#1F4E79;color:#fff;padding:6px 10px;border:1px solid #1F4E79;font-weight:bold">REF.</td>
      <td style="padding:6px 10px;border:1px solid #ccc">[referencia o número de plano si existe, si no: —]</td>
    </tr>
  </table>

  <!-- Tabla de revisiones -->
  <h2 style="font-size:12px;margin:20px 0 8px;color:#1F4E79">TABLA DE REVISIONES</h2>
  <table style="width:100%;border-collapse:collapse;font-size:11px">
    <tr style="background:#1F4E79;color:#fff">
      <th style="padding:6px;border:1px solid #1F4E79;text-align:center;width:8%">Rev.</th>
      <th style="padding:6px;border:1px solid #1F4E79;width:15%">Fecha</th>
      <th style="padding:6px;border:1px solid #1F4E79">Descripción</th>
      <th style="padding:6px;border:1px solid #1F4E79;width:15%">Elaboró</th>
      <th style="padding:6px;border:1px solid #1F4E79;width:15%">Revisó</th>
      <th style="padding:6px;border:1px solid #1F4E79;width:15%">Aprobó</th>
    </tr>
    <tr>
      <td style="padding:6px;border:1px solid #ccc;text-align:center">[rev_numero]</td>
      <td style="padding:6px;border:1px solid #ccc">[rev_fecha]</td>
      <td style="padding:6px;border:1px solid #ccc">[rev_descripcion]</td>
      <td style="padding:6px;border:1px solid #ccc">[elaboro]</td>
      <td style="padding:6px;border:1px solid #ccc">[reviso]</td>
      <td style="padding:6px;border:1px solid #ccc">[aprobo]</td>
    </tr>
  </table>
</div>

PÁGINA 2 — ÍNDICE (antes de sección 1, obligatoria):
<div class="indice" style="page-break-after:always;padding:20px">
  <h1>ÍNDICE</h1>
  <ol style="font-size:13px;line-height:2">
    <li>Introducción</li>
    <li>Criterios Generales</li>
    <li>Descripción del Sistema</li>
    <li>Propiedades de Secciones</li>
    <li>Cargas y Combinaciones</li>
    <li>Diseño del Monorriel</li>
    <li>Diseño de Vigas Principales</li>
    <li>Diseño de Columnas</li>
    <li>Diseño de Placa Base</li>
    <li>Diseño de Taquetes</li>
    <li>Validación FEA</li>
    <li>Conclusiones</li>
  </ol>
</div>

PAGE-HEADER EN CADA <h1> (excepto portada e índice):
Antes de CADA <h1> de sección numerada, insertar este header con la estructura del PDF de referencia MC-HOI-001-2026:

<div class="page-header">
<table style="width:100%;border-collapse:collapse;border:1px solid #1F4E79;font-size:9px">
  <tr>
    <td rowspan="2" style="width:28%;border:1px solid #1F4E79;padding:4px;font-weight:bold;vertical-align:middle;text-align:center">
      MEMORIA DE CÁLCULO
    </td>
    <td style="border:1px solid #1F4E79;padding:4px">No.: [num_documento]</td>
    <td style="border:1px solid #1F4E79;padding:4px">Fecha: [rev_fecha]</td>
    <td style="border:1px solid #1F4E79;padding:4px;color:#1F4E79;font-weight:bold">Rev.: [rev_numero]</td>
  </tr>
  <tr>
    <td colspan="2" style="border:1px solid #1F4E79;padding:4px">[nombre_documento]</td>
    <td style="border:1px solid #1F4E79;padding:4px;color:#1F4E79;font-weight:bold;text-align:center">NALCO Water<br>An Ecolab Company</td>
  </tr>
</table>
</div>

IMPORTANTE — EVITAR REDUNDANCIA:
- En la sección 1 INTRODUCCIÓN: NO repitas cliente, proyecto ni ubicación como lista o párrafo.
  Solo escribe el ALCANCE TÉCNICO: qué se calcula, qué normas aplican, qué elementos se verifican.
  Máximo 2 párrafos cortos.
- En la sección 3 DESCRIPCIÓN DEL SISTEMA: La tabla de parámetros es SOLO datos técnicos
  (capacidad, claro, altura, perfiles, clase CMAA, dimensiones). NO incluir cliente ni proyecto en esta tabla.

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

IMÁGENES FEA — INSTRUCCIÓN CRÍTICA (sistema de marcadores):
Las imágenes FEA/planos se reciben numeradas desde idx=0.
Para incluirlas en el reporte usar EXACTAMENTE este formato de marcador:
<img data-fea-idx="0" alt="FEA Vista frontal">
<img data-fea-idx="1" alt="FEA Vista lateral">
<img data-fea-idx="2" alt="FEA Vista isométrica">

❌ NO intentes reproducir el base64 en el src. NO uses src="data:image/...".
✅ Solo usa el marcador data-fea-idx="N". El sistema reemplazará automáticamente
los marcadores con las imágenes reales después del stream.

En sección 11 VALIDACIÓN FEA:
- Si hay 1 imagen: figura centrada con caption descriptivo
- Si hay 2+ imágenes: figuras en pares lado a lado con grid:
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
  <div class="figura">
    <img data-fea-idx="0" alt="FEA Vista 1">
    <p class="caption">Figura N — Von Mises vista frontal</p>
  </div>
  <div class="figura">
    <img data-fea-idx="1" alt="FEA Vista 2">
    <p class="caption">Figura N+1 — Von Mises vista lateral</p>
  </div>
</div>

Usa todos los idx disponibles (0, 1, 2, ... hasta el máximo que recibiste en el hint del usuario).

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
Genera este SVG adaptando los valores calculados. Sustituye [P_din], [Pu], [R], [L_mm], [L_HALF], [M_max], [V_max] con los valores reales. Las coordenadas numéricas del BMD/SFD se calculan proporcionalmente: BMD_TOP = 380 - (M_max/M_ref)*160, SFD_TOP = 490 - (V_max/V_ref)*80. Devuelve SVG literal, NO descripción en texto.

<div class="figura">
<svg viewBox="0 0 700 600" width="100%">
  <defs>
    <marker id="arr" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#e74c3c"/>
    </marker>
    <marker id="arrG" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#27ae60"/>
    </marker>
  </defs>
  <!-- ZONA 1: Esquema viga -->
  <text x="350" y="25" text-anchor="middle" font-size="13" font-weight="bold" fill="#1F4E79">DIAGRAMA DE CARGAS — MONORRIEL</text>
  <rect x="80" y="80" width="540" height="18" fill="#2E75B6" rx="2"/>
  <polygon points="80,98 60,130 100,130" fill="#333"/>
  <polygon points="620,98 600,130 640,130" fill="#333"/>
  <line x1="350" y1="20" x2="350" y2="79" stroke="#e74c3c" stroke-width="3" marker-end="url(#arr)"/>
  <text x="350" y="15" text-anchor="middle" font-size="11" font-weight="bold" fill="#e74c3c">P = [P_din] kN (Pu=[Pu] kN)</text>
  <line x1="80" y1="160" x2="80" y2="100" stroke="#27ae60" stroke-width="2.5" marker-end="url(#arrG)"/>
  <text x="80" y="175" text-anchor="middle" font-size="10" fill="#27ae60" font-weight="bold">R=[R] kN</text>
  <line x1="620" y1="160" x2="620" y2="100" stroke="#27ae60" stroke-width="2.5" marker-end="url(#arrG)"/>
  <text x="620" y="175" text-anchor="middle" font-size="10" fill="#27ae60" font-weight="bold">R=[R] kN</text>
  <line x1="80" y1="145" x2="620" y2="145" stroke="#999" stroke-width="1"/>
  <text x="350" y="160" text-anchor="middle" font-size="10" fill="#555">L = [L_mm] mm</text>
  <!-- ZONA 2: BMD -->
  <text x="350" y="210" text-anchor="middle" font-size="12" font-weight="bold" fill="#1F4E79">Diagrama de Momento Flector (BMD)</text>
  <line x1="80" y1="380" x2="620" y2="380" stroke="#333" stroke-width="1"/>
  <polygon points="80,380 350,[BMD_TOP] 620,380" fill="#2E75B6" fill-opacity="0.25" stroke="#2E75B6" stroke-width="2"/>
  <text x="360" y="[BMD_LABEL_Y]" font-size="11" font-weight="bold" fill="#1F4E79">M_max = [M_max] kN·m</text>
  <text x="20" y="295" font-size="10" fill="#555" transform="rotate(-90,20,295)">Momento (kN·m)</text>
  <!-- ZONA 3: SFD -->
  <text x="350" y="415" text-anchor="middle" font-size="12" font-weight="bold" fill="#1F4E79">Diagrama de Fuerza Cortante (SFD)</text>
  <line x1="80" y1="490" x2="620" y2="490" stroke="#333" stroke-width="1"/>
  <rect x="80" y="[SFD_TOP]" width="270" height="[SFD_H]" fill="#e74c3c" fill-opacity="0.25" stroke="#e74c3c" stroke-width="1.5"/>
  <rect x="350" y="490" width="270" height="[SFD_H]" fill="#e74c3c" fill-opacity="0.25" stroke="#e74c3c" stroke-width="1.5"/>
  <text x="200" y="[SFD_POS_LABEL]" text-anchor="middle" font-size="10" font-weight="bold" fill="#c0392b">+[V_max] kN</text>
  <text x="490" y="[SFD_NEG_LABEL]" text-anchor="middle" font-size="10" font-weight="bold" fill="#c0392b">-[V_max] kN</text>
  <text x="80" y="570" font-size="9" fill="#555">0 mm</text>
  <text x="330" y="570" font-size="9" fill="#555">[L_HALF] mm</text>
  <text x="590" y="570" font-size="9" fill="#555">[L_mm] mm</text>
  <text x="350" y="585" text-anchor="middle" font-size="10" fill="#555">Posición (mm)</text>
</svg>
<p class="caption">Figura 2 — Diagrama de cargas, momento flector (BMD) y fuerza cortante (SFD) del monorriel. P_din = [P_din] kN, M_max = [M_max] kN·m, V_max = ±[V_max] kN.</p>
</div>

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
