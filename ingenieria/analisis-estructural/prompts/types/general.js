// ═══ Prompt específico: Estructura General (fallback) ═══

TYPE_PROMPTS['general'] = `TIPO DE ANÁLISIS: ESTRUCTURA GENERAL

Adapta el análisis al tipo de estructura descrito en los datos del proyecto.
Identifica las verificaciones críticas y aplica las normas aplicables.

NORMAS APLICABLES (según el caso):
AISC 360-10, ACI 318-19, ASCE 7-10, NOM-STPS según aplique, IMCA.

ESTRUCTURA DEL ANÁLISIS (adapta las secciones según el tipo):
1. INTRODUCCIÓN — Alcance y descripción
2. CRITERIOS GENERALES — Normas aplicables, materiales
3. DESCRIPCIÓN DEL SISTEMA — Tabla de parámetros principales
4. PROPIEDADES DE SECCIONES — Perfiles usados
5. CARGAS Y COMBINACIONES —
   - Identifica las cargas aplicables: CM, CV, sismo, viento
   - Usa combinaciones LRFD (AISC) o ASD según preferencia del proyecto
6. DISEÑO DE ELEMENTOS CRÍTICOS —
   - Identifica los elementos más solicitados
   - Verifica flexión, cortante, axial según corresponda
   - Verifica deflexión con límite apropiado (L/240, L/360, L/480)
7. DISEÑO DE COLUMNAS (si aplica) —
   - Pandeo Euler con K apropiado
   - Interacción AISC H1-1 si hay momento
8. DISEÑO DE CONEXIONES Y ANCLAJES —
   - Placa base, taquetes o soldaduras
9. VALIDACIÓN FEA — si hay datos
10. CONCLUSIONES — tabla resumen con todos los FS

CÁLCULOS BÁSICOS OBLIGATORIOS:
- Pandeo: K=1.0 arriostrada, K=1.2 sin arriostres, K=2.0 cantiléver
- KL/r ≤ 200
- Interacción AISC H1-1: Pr/φPn + (8/9)(Mr/φMn) ≤ 1.0 si Pr/φPn ≥ 0.2
- Taquetes ACI 318: (T/φN)^(5/3) + (V/φV)^(5/3) ≤ 1.0
- FS mínimos: Flexión ≥ 1.67, Pandeo ≥ 2.0, Taquete ≥ 2.0

DIAGRAMAS SVG GENÉRICOS:
Genera al menos:
1. Una vista en planta o alzado de la estructura con cotas y etiquetas
2. Un diagrama de cargas del elemento más crítico con BMD/SFD
3. Un detalle de anclaje/placa base si hay taquetes

IMPORTANTE: Sé flexible — usa los datos disponibles en D para inferir
el tipo de análisis más apropiado. Si faltan datos críticos, menciónalo
en una caja warn-box pero genera el análisis con valores razonables
basados en la experiencia ingenieril.
`;
