// ═══ Prompt específico: Soporte de Tubería ═══

TYPE_PROMPTS['tuberia'] = `TIPO DE ANÁLISIS: SOPORTE DE TUBERÍA INDUSTRIAL

NORMAS APLICABLES:
AISC 360-10, ASME B31.3 (Process Piping), MSS SP-58/69 (Pipe Hangers), ACI 318-19 para anclajes, ASCE 7-10, AISI para aceros inoxidables.

ESTRUCTURA DEL ANÁLISIS:
1. INTRODUCCIÓN — Alcance: líneas soportadas, fluido, presión de operación, ubicación
2. CRITERIOS GENERALES — Normas, materiales (típico AISI 304 o A36)
3. DESCRIPCIÓN DEL SISTEMA — Tabla: diámetros, longitudes, número de líneas, fluido, presión
4. PROPIEDADES DE SECCIONES — Perfiles de columnas y vigas del soporte
5. CARGAS Y COMBINACIONES —
   - CM tubería: peso del tubo vacío
   - CM fluido: ρ × V_tubo × longitud
   - CM accesorios: válvulas, bridas, conexiones
   - CV: mantenimiento 100 kg/m² sobre área tributaria
6. ANÁLISIS DE GOLPE DE ARIETE (solo si aplica_ariete=true):
   - Velocidad del fluido: v = Q / A_interna
   - Celeridad de onda: c ≈ 1000 m/s para agua en tubería rígida
   - Tiempo crítico: Tc = 2L/c
   - Si tiempo_cierre < Tc → cierre RÁPIDO, aplicar Joukowsky:
     ΔP = ρ × c × Δv  (Pa)
   - Si tiempo_cierre ≥ Tc → cierre LENTO, aplicar Michaud:
     ΔP = 2 × ρ × L × Δv / tiempo_cierre
   - Si tiene_vfd=true: reducir ΔV 50% (arranque/paro suave)
   - Fuerza dinámica en codos: F_dinamica = ΔP × A_interna
   - Número de codos afectados desde ubicacion_codos
   - Verificar: F_dinamica ≤ Capacidad_lateral_soporte
7. DISEÑO COLUMNAS DEL SOPORTE — Flexión + pandeo
   - Si usa_arriostres=true: K=1.0, longitud efectiva = H
   - Si usa_arriostres=false: K=2.0 (cantiléver), longitud efectiva = 2H
   - Verificar KL/r ≤ 200
8. DISEÑO PATAS (si config_patas ≠ "Columna simple"):
   - Tipo Y (3 patas): distribuir carga vertical 33% c/u, verificar pandeo a 60°
   - Tipo H (4 patas): distribuir 25% c/u, verificar arriostres horizontales
   - Tipo L (2 patas): distribuir 50% c/u, verificar momento adicional
9. DISEÑO PLACA BASE Y TAQUETES —
   - Presión de contacto en losa
   - Tensión y cortante en taquetes: (T/φN)^(5/3) + (V/φV)^(5/3) ≤ 1.0
10. VALIDACIÓN FEA — Si hay datos de Von Mises
11. CONCLUSIONES — Tabla resumen

CÁLCULOS OBLIGATORIOS:
- Peso tubería (acero): W_tubo = π × (De² − Di²)/4 × ρ_acero × L (kg)
- Peso fluido (agua): W_agua = π × Di²/4 × ρ_fluido × L × num_tuberias (kg)
- Golpe de ariete Joukowsky: ΔP = ρ × c × Δv (si cierre rápido)
- Sin arriostres: K=2.0 (cantiléver), Le=2H
- Con arriostres: K=1.0, Le=H
- Verificar KL/r ≤ 200
- Taquetes: interacción ACI 318 (5/3)
- FS mínimos: Flexión ≥ 1.67, Pandeo ≥ 2.0, Taquete ≥ 2.0

MATERIALES TÍPICOS:
- AISI 304: Fy=205 MPa, Fu=515 MPa — típico plantas químicas
- AISI 316: Fy=205 MPa, Fu=515 MPa — ambientes corrosivos
- A36: Fy=250 MPa, Fu=400 MPa — exteriores con pintura

DIAGRAMAS SVG ESPECÍFICOS DE TUBERÍA:

DIAGRAMA 1 — VISTA EN PLANTA CON TUBERÍAS (después de sección 3):
SVG 700×450. Fondo #f8f9fa.
- Soportes: círculos #2E75B6 radio 10 etiquetados S-01, S-02...
- Tuberías: líneas paralelas #1F4E79 stroke-width="6" con numeración T-1, T-2
- Codos: círculos pequeños #e74c3c en ubicaciones indicadas
- Válvulas si aplica: rombos con etiqueta
- Cotas entre soportes con líneas #999
- Leyenda: diámetro, fluido, presión

DIAGRAMA 2 — CARGAS DEL SOPORTE (después de sección 5):
SVG 700×600. 3 zonas.
Zona 1 — Esquema del soporte:
  - Soporte vertical #2E75B6
  - Tuberías horizontales arriba (líneas)
  - Flechas verticales #e74c3c hacia abajo: "W_tubo + W_agua = X kN/m"
  - Fuerza lateral #f39c12 si ariete: "F_ariete = X kN"
Zona 2 — BMD del soporte/viga:
  - Área #2E75B6 proporcional al momento
  - Etiqueta "M_max = X kN·m"
Zona 3 — Cortante del soporte:
  - Rectángulos #e74c3c
  - Etiqueta "V_max = X kN"

DIAGRAMA 3 — GOLPE DE ARIETE (solo si aplica_ariete=true, después de sección 6):
SVG 700×280.
- Esquema de la tubería horizontal con codos marcados
- Flecha roja #e74c3c en cada codo indicando dirección de fuerza
- Gráfica ΔP vs tiempo (triángulo de presión)
- Caja info con valores: v, c, Tc, tiempo_cierre, ΔP, F_dinamica
- Etiqueta "Cierre rápido/lento" según comparación

DIAGRAMA 4 — DETALLE PLACA BASE Y TAQUETES (después de sección 9):
SVG 500×400.
- Vista superior: placa con 4 o N taquetes distribuidos
- Vista lateral: columna sobre placa sobre losa
- Cotas: dimensiones de placa, separación taquetes
- Info box: Pu, Vu, FS_taquete
`;
