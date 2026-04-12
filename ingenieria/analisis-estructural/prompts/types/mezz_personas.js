// ═══ Prompt específico: Mezzanine — Personas ═══

TYPE_PROMPTS['mezz_personas'] = `TIPO DE ANÁLISIS: MEZZANINE / PLATAFORMA PARA PERSONAS

NORMAS APLICABLES:
AISC 360-10, ASCE 7-10 Tabla 4.3-1 (cargas vivas mínimas), NOM-001-STPS (escaleras y barandales), OSHA 1910.23/1910.25, IBC 2018, ACI 318-19 para anclajes.

ESTRUCTURA DEL ANÁLISIS:
1. INTRODUCCIÓN — Alcance: área de plataforma, altura entrenivel, uso previsto
2. CRITERIOS GENERALES — Normas, materiales (típico A36 o A572-50)
3. DESCRIPCIÓN DEL SISTEMA — Tabla: dimensiones planta, altura, número de niveles, uso
4. PROPIEDADES DE SECCIONES — Vigas de piso, vigas principales, columnas
5. CARGAS Y COMBINACIONES —
   - CM estructura: acero + piso (típico 30-50 kg/m²)
   - CM piso: rejilla Irving 19-W-4 (~35 kg/m²) o placa antiderrapante
   - CV personas: MÍNIMO 488 kg/m² (100 psf) para plataformas industriales (ASCE 7 Tabla 4.3-1)
     * Si es pasillo público: 488 kg/m²
     * Si es mantenimiento ocasional: 250 kg/m² (mínimo absoluto)
   - Combinaciones LRFD: 1.2D + 1.6L (AISC)
   - Combinaciones ASD: D + L (AISC)
6. DISEÑO VIGAS DE PISO (secundarias) —
   - Flexión: φMn ≥ Mu
   - Deflexión: δ ≤ L/360 (plataformas industriales)
   - Área tributaria = separación × longitud
7. DISEÑO VIGAS PRINCIPALES —
   - Cargas puntuales de vigas secundarias
   - Flexión + deflexión L/360
8. DISEÑO COLUMNAS —
   - Pandeo Euler: K=1.2 sin arriostres, K=0.65 arriostradas top+bottom
   - KL/r ≤ 200
   - Interacción AISC H1-1
9. DISEÑO ESCALERA (si tiene_escalera=true) —
   - Según NOM-001-STPS: ancho mínimo 560 mm (OSHA: 560 mm / 22")
   - Inclinación recomendada 30°–50° (escalera inclinada)
   - Huella mínima 240 mm, peralte máximo 200 mm
   - Carga viva escalera: 488 kg/m² + carga puntual 1.36 kN
   - Barandal: altura 1070 mm (NOM mínimo), resistencia 890 N lateral
   - Rodapiés: altura mínima 100 mm
   - Verificar descansos cada 3.7 m de altura vertical
10. DISEÑO PLACA BASE Y TAQUETES — igual a otros tipos
11. VALIDACIÓN FEA — si hay datos
12. CONCLUSIONES — tabla resumen

CÁLCULOS OBLIGATORIOS:
- Área tributaria por viga = separacion_marcos × longitud_tramo
- Mu viga piso: Mu = w × L² / 8 (carga distribuida)
- Deflexión: δ = 5wL⁴/(384EI) simplemente apoyada
- Límite deflexión plataformas: L/360
- Pandeo: K=1.2 (sin arriostres), K=0.65 (arriostres top+bottom)
- FS mínimos: Flexión ≥ 1.67, Pandeo ≥ 2.0, Escalera ≥ 2.0

DIAGRAMAS SVG ESPECÍFICOS DE MEZZANINE PERSONAS:

DIAGRAMA 1 — VISTA EN PLANTA CON GRID (después de sección 3):
SVG 700×450. Fondo #f8f9fa.
- Columnas: círculos #2E75B6 radio 12 en grid
- Vigas principales: líneas #1F4E79 stroke-width="5"
- Vigas secundarias (piso): líneas #2E75B6 stroke-width="3" perpendiculares
- Piso (rejilla/placa): área gris claro con patrón punteado
- Escalera: rectángulo #f39c12 con flecha hacia arriba si aplica
- Cotas principales en mm
- Leyenda: tipo de piso, carga viva usada

DIAGRAMA 2 — VIGA DE PISO CRÍTICA (después de sección 6):
SVG 700×500. 3 zonas.
Zona 1 — Esquema:
  - Viga horizontal #2E75B6
  - Carga distribuida (flechas #e74c3c hacia abajo): "w = X kN/m"
  - Apoyos en extremos
  - Cota del claro
Zona 2 — BMD:
  - Parábola #2E75B6 (carga distribuida)
  - "M_max = wL²/8 = X kN·m"
Zona 3 — Deflexión:
  - Línea curva de deflexión exagerada
  - Anotación "δ = X mm vs L/360 = Y mm"
  - Caja ok-box o warn-box según cumple

DIAGRAMA 3 — ALZADO CON ESCALERA (si tiene_escalera=true, después de sección 9):
SVG 700×500.
- Plataforma superior horizontal #2E75B6
- Columnas verticales #2E75B6 a los lados
- Escalera inclinada #f39c12 con peldaños marcados
- Barandal #e74c3c (líneas verticales + horizontales)
- Cotas: altura entrenivel, ancho escalera, altura barandal
- Etiquetas: "h=X mm", "ancho=Y mm", "barandal=1070 mm"
- Info box: "Inclinación = X°, Huella = Y mm, Peralte = Z mm"
`;
