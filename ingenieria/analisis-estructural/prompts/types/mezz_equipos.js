// ═══ Prompt específico: Mezzanine — Equipos ═══

TYPE_PROMPTS['mezz_equipos'] = `TIPO DE ANÁLISIS: MEZZANINE / PLATAFORMA PARA EQUIPOS

NORMAS APLICABLES:
AISC 360-10, ASCE 7-10, ACI 318-19 para anclajes, AISC Design Guide 11 (Floor Vibrations Due to Human Activity) o análisis dinámico equivalente para equipos vibratorios.

ESTRUCTURA DEL ANÁLISIS:
1. INTRODUCCIÓN — Alcance: área, equipo que soporta, peso, características dinámicas
2. CRITERIOS GENERALES — Normas, materiales
3. DESCRIPCIÓN DEL SISTEMA — Tabla parámetros + datos del equipo
4. PROPIEDADES DE SECCIONES — Vigas y columnas
5. CARGAS Y COMBINACIONES —
   - CM estructura: 30-50 kg/m²
   - CM piso
   - Carga del equipo: Peso_operacion_kg dividido entre área tributaria
   - Factor de impacto (del dato factor_impacto): 1.0 estático, 1.25-1.5 rotativo
   - Si equipo_es_vibratorio=true: incluir fuerza dinámica
   - CV mantenimiento: 250 kg/m² en áreas sin equipo
   - Combinaciones LRFD/ASD
6. DISEÑO VIGAS DE PISO —
   - Verificar flexión con carga del equipo × factor_impacto
   - Considerar posición del CG del equipo vs centro del claro
   - Si CG descentrado: calcular momento adicional
   - Deflexión: δ ≤ L/480 para equipos precisos, L/360 general
7. DISEÑO VIGAS PRINCIPALES — flexión + deflexión
8. DISEÑO COLUMNAS — pandeo + interacción AISC H1-1
9. ANÁLISIS DE VIBRACIÓN (solo si equipo_es_vibratorio=true) —
   - Frecuencia natural de la viga crítica:
     fn = (π/2) × √(g·δ_est) / (2π)  [Hz, simplificado]
     o bien: fn = (k/2π) × √(EI / m·L³) donde k=9.87 para viga simple
   - Frecuencia de operación del equipo (RPM/60 = Hz)
   - Regla: fn ≥ 1.2 × f_equipo (evitar resonancia)
   - Si fn < 1.2 × f_equipo → ADVERTENCIA RESONANCIA
   - Amplitud dinámica: A = F_din / (k × √((1−r²)² + (2ζr)²))
     donde r = f_equipo/fn, ζ=0.03 (damping típico acero)
10. DISEÑO PLACA BASE Y TAQUETES —
    - Verificar taquetes con carga estática + componente dinámica
    - Si vibratorio: usar taquete con arandela anti-vibración
11. VALIDACIÓN FEA — si hay datos
12. CONCLUSIONES — tabla + advertencia de vibración si aplica

CÁLCULOS OBLIGATORIOS:
- Carga del equipo sobre viga: Pu_equipo = Peso_operacion × g × factor_impacto
- CG descentrado: M_adicional = Pu × e (excentricidad)
- Deflexión límite: L/480 equipos precisos, L/360 general
- Frecuencia natural viga: fn = (1/2π) × √(k/m) o aproximación con δ_est
  fn ≈ 18/√δ_est_mm [Hz] (regla rápida AISC)
- Criterio resonancia: fn ≥ 1.2 × f_equipo
- FS mínimos: Flexión ≥ 1.67, Pandeo ≥ 2.0, Taquete ≥ 2.5 (mayor por dinámico)

DIAGRAMAS SVG ESPECÍFICOS DE MEZZANINE EQUIPOS:

DIAGRAMA 1 — VISTA EN PLANTA CON EQUIPO (después de sección 3):
SVG 700×450. Fondo #f8f9fa.
- Columnas: círculos #2E75B6 en grid
- Vigas principales + secundarias
- Equipo: rectángulo #f39c12 con etiqueta "Equipo X kg"
- CG del equipo: cruz roja
- Flechas indicando dirección de carga desde equipo a vigas
- Cotas y leyenda

DIAGRAMA 2 — VIGA CRÍTICA CON CARGA DEL EQUIPO (después de sección 6):
SVG 700×500. 3 zonas.
Zona 1 — Esquema:
  - Viga #2E75B6 horizontal
  - Carga puntual #e74c3c en la posición del CG
  - Si CG descentrado: etiquetar "e = X mm"
  - Reacciones verdes en apoyos asimétricas si aplica
Zona 2 — BMD con carga puntual desplazada:
  - Triángulo/trapecio #2E75B6
  - "M_max = X kN·m en posición Y mm"
Zona 3 — Deflexión:
  - Curva + valor vs L/480 o L/360

DIAGRAMA 3 — ANÁLISIS DE VIBRACIÓN (solo si equipo_es_vibratorio, después de sección 9):
SVG 700×320.
- Eje X: frecuencia (Hz) 0 a 30
- Barra vertical #e74c3c en f_equipo con etiqueta
- Barra vertical #27ae60 en fn (natural) con etiqueta
- Zona amarilla #f39c12 entre 0.83×fn y 1.17×fn (zona de resonancia)
- Si f_equipo cae en zona amarilla: warn-box grande
- Info box: "fn=X Hz, f_eq=Y Hz, ratio=Z, amplitud=A mm"
`;
