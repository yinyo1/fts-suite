# Fase 3 — Frentes simultáneos, permanencia por planta y rotación de la cuadrilla

Fuente: Odoo (MCP `FTS_Odoo`, solo lectura), leído el 2026-09-28. Consultas en `fase3_queries.md`;
cálculo en `fase3_analisis.py` (reproducible desde los TSV); cifras completas en `fase3_resultados.json`.

---

## 0. Tres cosas que cambian la lectura de todo lo demás

**0.1 — El campo SO de asistencia (`x_studio_sales_order_2`) guarda el id del PROYECTO, no el de la SO.**
Cruce Q7e (`hr.attendance` agrupado por `x_studio_sales_order_2` × `x_studio_project_id`):

```
x_studio_sales_order_2   x_studio_project_id                      registros
SO2286 [id=2302]         SO11547 - Desinstalación, Adecuación e … 766
SO121  [id=121]          🛠️ SO9428 - INSTALACION DE SUMINISTRO D… 516
SO160  [id=160]          🛠️ SO10300 - Techo de Magnekon [id=160]  463
SO2330 [id=2349]         SO11762 - Mejoras a sistema TOPOCHICO, … 167
SO212  [id=212]          🛠️ SO10337 - Cortinas de seguridad 120s… 62
```

En los 20 pares con ambos campos llenos (salvo el registro de 2025 citado abajo) el id del campo SO es igual al id del proyecto (Q8b: `project.project` 2302 = "SO11547 - …",
121 = "SO9428 - …"), y esos mismos ids en `sale.order` son órdenes de 2019-2022 de otros clientes (Q8a:
`sale.order` 121 = SO121 Rittal 2019, 2302 = SO2286 Mondelez 2022). La única fila coherente es 1 registro de
2025-08-22 (SO9428 [id=9568]). **Por eso todo este análisis usa `x_studio_project_id`** y traduce proyecto → SO
por el nombre del proyecto. Es un hallazgo aparte (quien escribe `x_studio_sales_order_2` le pasa el id del
proyecto); no se persiguió.

**0.2 — El vínculo a proyecto solo existe desde el 2026-04-23.** De 11,562 asistencias desde 2024-09-28
(la primera es del 2024-11-11), 2,073 traen proyecto, y todas salvo 1 son del 2026-04-23 en adelante (Q7d).
Noviembre 2024 – marzo 2026 = 0 %. **Las métricas de frentes cubren 5 meses (2026-04-23 → 2026-09-25,
120 días con frente), no 24.** Cobertura dentro de esa ventana, empleado-día con proyecto / empleado-día con asistencia:

| mes | campo (sin oficina) | cuadrilla (14) | oficina |
|---|---|---|---|
| 2026-04 (desde 23) | 84.0 % (126/150) | 84.9 % | 93.5 % |
| 2026-05 | 84.1 % (369/439) | 82.5 % | 84.5 % |
| 2026-06 | 96.6 % (368/381) | 96.4 % | 86.3 % |
| 2026-07 | 86.7 % (332/383) | 88.3 % | 4.8 % |
| 2026-08 | 68.4 % (206/301) | 78.2 % | 0.0 % |
| 2026-09 | 71.6 % (207/289) | 79.3 % | 0.0 % |

Agosto-septiembre pierde ~30 % de los días de campo sin proyecto: los conteos de esos meses son un **piso**.

**0.3 — La dirección de entrega de la SO no es la planta.** `partner_shipping_id` apunta al domicilio fiscal del
cliente (Q4: Nalco = Av. Santa Fe 440, Cuajimalpa; Mondelez = Puebla; Mission Foods = Irving, Texas).
`x_studio_planta` está vacío en todas las SO con asistencia (Q8c). La planta se infirió a mano por la
descripción del proyecto (tabla §5), con su nivel de confianza.

Además: **SO10300 "Techo de Magnekon" fue el proyecto por defecto de la oficina en abril-junio**: 383 de sus
464 registros son de personal de RH, Legal, Contabilidad, Comercial y Finanzas (Q12, `magnekon_registros` en el JSON). En julio aparecen las
bolsas de centro de costo (`x_studio_many2one_field_GUbBF`, Q7c) y la oficina deja de marcar proyecto. Por eso
se reporta siempre la variante **"sin oficina"**.

---

## 1. Frentes y plantas simultáneas por día (2026-04-23 → 2026-09-25)

Cómo se calcula: por día, número de proyectos distintos (= frentes) y de plantas inferidas distintas con al
menos una asistencia. Se excluyen del conteo los proyectos que no son frente de campo: ingeniería de escritorio
(SO11498 Bridgestone ingeniería conceptual, SO11290 test loop Mexicali) y los 5 proyectos de FTS USA. Oficina =
empleados de Comercial, Admin y Finanzas, Legal, RH y Dirección (Q9), salvo emp-8 (8), que opera en sitio.

| variante | días | plantas: máx | p95 | p90 | mediana | media | días ≥2 | días ≥3 | días ≥4 |
|---|---|---|---|---|---|---|---|---|---|
| **sin oficina (recomendada)** | 120 | **4** | 4 | 4 | **2** | 2.38 | 106 | 46 | 13 |
| todos los empleados | 120 | 5 | 4 | 4 | 2 | 2.63 | 106 | 59 | 28 |
| solo cuadrilla (14) | 120 | 4 | 3 | 3 | 2 | 2.15 | 106 | 30 | 2 |

Frentes (proyectos) sin oficina: máx 5, p90 4, mediana 2, media 2.52. Solo lunes a viernes (111 días), sin
oficina: mediana 2, p90 4, máx 4.

Histograma de plantas/día, sin oficina: 1 planta 14 días · 2 plantas 60 · 3 plantas 33 · 4 plantas 13.

Combinaciones más frecuentes (todos los empleados): Topo Chico + Vertiv 35 días · Magnekon + Topo Chico + Vertiv 21 ·
Bridgestone + Magnekon + Topo Chico + Vertiv 16 · solo Topo Chico 13.

**Por mes, sin oficina:**

| mes | días | máx plantas | mediana | media | días ≥2 | ≥3 | ≥4 |
|---|---|---|---|---|---|---|---|
| 2026-04 | 8 | 4 | 3 | 2.75 | 6 | 6 | 2 |
| 2026-05 | 26 | 4 | 2.5 | 2.50 | 21 | 13 | 5 |
| 2026-06 | 23 | 4 | 3 | 2.87 | 22 | 16 | 5 |
| 2026-07 | 23 | 4 | 2 | 2.26 | 23 | 5 | 1 |
| 2026-08 | 22 | 2 | 2 | 1.73 | 16 | 0 | 0 |
| 2026-09 | 18 | 3 | 2 | 2.33 | 18 | 6 | 0 |

Lectura: **2 plantas activas es lo normal; 3 pasa ~4 de cada 10 días; 4 es el pico (13 días de 120)**. Nunca se
vio a la cuadrilla nombrada en más de 4 plantas el mismo día.

---

## 2. Permanencia: cuánto tiempo se queda un kit en una planta

### 2a. Corridas empleado-planta
Definición: días consecutivos en que un empleado registra la misma planta. La corrida sigue si el siguiente día
registrado es la misma planta y el hueco es ≤ 4 días naturales (cubre el fin de semana vie→lun = 3 días, más un
día sin registro). Se corta si el siguiente día con proyecto es otra planta o si el hueco es > 4. Los días de
asistencia sin proyecto no cortan ni cuentan.

| planta | corridas (cuadrilla) | días registrados: mediana | p75 | p90 | máx | días naturales: mediana | p75 | p90 | máx |
|---|---|---|---|---|---|---|---|---|---|
| TOPO_CHICO | 98 | 4 | 9.75 | 16 | 46 | 5 | 12 | 23 | 64 |
| VERTIV | 74 | 3 | 7 | 9 | 36 | 4 | 10 | 12.7 | 53 |
| BRIDGESTONE | 33 | 1 | 2 | 3.8 | 6 | 1 | 2 | 6.6 | 8 |
| MAGNEKON | 8 | 7.5 | 10 | 10 | 10 | 9.5 | 12 | 12 | 12 |
| BUDENHEIM | 3 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| **todas (cuadrilla)** | 219 | 3 | 7 | 13 | 46 | 4 | 9.5 | 17 | 64 |
| todas (todos los empleados) | 405 | 2 | 6 | 11 | 46 | 3 | 9 | 17 | 65 |

### 2b. Presencia de FTS por planta (cualquier empleado, sin USA ni ingeniería)
Tramo continuo = días con asistencia en la planta separados por huecos ≤ 4 días naturales.

| planta | primer día | último día | días con asistencia | tramos | tramo más largo | empleados distintos |
|---|---|---|---|---|---|---|
| TOPO_CHICO | 2026-04-23 | 2026-09-25 | 119 | **1** | 2026-04-23 → 2026-09-25 (156 días naturales) | 32 |
| VERTIV | 2026-04-23 | 2026-09-25 | 93 | 4 | 2026-04-23 → 2026-07-17 (86 días naturales, 60 registrados) | 24 |
| MAGNEKON* | 2026-04-23 | 2026-08-03 | 59 | 4 | 2026-04-23 → 2026-06-26 (65 días naturales) | 25 |
| BRIDGESTONE | 2026-04-23 | 2026-09-24 | 32 | 11 | 2026-06-11 → 2026-06-30 (20 días naturales) | 19 |
| BUDENHEIM | 2026-04-23 | 2026-06-08 | 8 | 5 | 2 días | 9 |
| MISSION_FOODS | 2026-05-11 | 2026-07-07 | 2 | 2 | 1 día | 2 |
| BEBIDAS_PURIFICADAS | 2026-05-01 | 2026-05-01 | 1 | 1 | 1 día | 2 |
| MONDELEZ | 2026-06-04 | 2026-06-04 | 1 | 1 | 1 día | 1 |
| QUIMITEC | 2026-07-08 | 2026-07-08 | 1 | 1 | 1 día | 1 |

\* Magnekon inflado por la oficina (§0).

Lectura: hay **dos plantas "ancla"** (Topo Chico sin interrupción los 5 meses; Vertiv con 4 tramos, el mayor de 86
días) donde un kit se queda meses, y **plantas de visita** (Bridgestone, Budenheim, Mission, Quimitec) donde la
estancia típica es 1-2 días y el máximo continuo fue 20 días naturales.

---

## 3. Rotación de personas entre plantas

Definición: transición = par de días consecutivos con planta del mismo empleado, con hueco ≤ 4 días; cambio =
la planta es distinta. Cambios/semana = cambios ÷ (días naturales entre su primer y último día con planta ÷ 7).

| grupo | empleados | transiciones | cambios | % de transiciones que son cambio | cambios/semana (mediana, emp. con ≥10 días) | p90 |
|---|---|---|---|---|---|---|
| todos | 44 | 1,910 | 298 | 15.6 % | 0.59 | 1.26 |
| cuadrilla | 14 | 1,117 | 177 | 15.8 % | 0.59 | 1.09 |

**Misma persona en 2+ plantas el mismo día: 0** empleado-días de 2,017 (ni siquiera 2 proyectos el mismo día:
0 de 2,063). El kiosko registra un proyecto por jornada, así que esto puede ser límite de la captura y no de la
operación.

Por persona (cuadrilla):

| empleado [id] | días con planta | cambios | % cambio | cambios/semana | plantas |
|---|---|---|---|---|---|
| emp-112-manager_ops [112] | 42 | 16 | 41.0 % | 1.44 | Bridgestone, Mission, Quimitec, Topo Chico, Vertiv |
| emp-79-tecnico_em [79] | 71 | 24 | 37.5 % | 1.11 | Bebidas Purificadas, Bridgestone, Budenheim, Topo Chico, Vertiv |
| emp-75-supervisor_sr [75] | 52 | 12 | 26.1 % | 0.54 | Bridgestone, Topo Chico, Vertiv |
| emp-124-segurista [124] | 101 | 23 | 23.5 % | 1.03 | Bridgestone, Magnekon, Topo Chico, Vertiv |
| emp-121-segurista [121] | 104 | 18 | 17.5 % | 0.83 | Bridgestone, Topo Chico |
| emp-130-soldador [130] | 104 | 15 | 14.9 % | 0.67 | Magnekon, Topo Chico, Vertiv |
| emp-128-soldador [128] | 109 | 15 | 14.0 % | 0.67 | Magnekon, Topo Chico, Vertiv |
| emp-131-soldador [131] | 102 | 13 | 13.0 % | 0.59 | Magnekon, Topo Chico, Vertiv |
| emp-154-chofer [154] | 10 | 1 | 12.5 % | 0.30 | Magnekon, Topo Chico |
| emp-55-ingenieria [55] | 62 | 7 | 12.3 % | 0.37 | Topo Chico, Vertiv |
| emp-127-soldador [127] | 109 | 13 | 12.0 % | 0.59 | Bridgestone, Topo Chico, Vertiv |
| emp-6-tecnico_em [6] | 93 | 10 | 11.1 % | 0.45 | Bridgestone, Topo Chico, Vertiv |
| emp-76-supervisor_sr [76] | 100 | 7 | 7.1 % | 0.32 | Magnekon, Topo Chico, Vertiv |
| emp-25-ingenieria [25] | 100 | 3 | 3.1 % | 0.14 | Topo Chico, Vertiv |

Lectura: el técnico típico cambia de planta **~1 vez cada 2 semanas**; los que más se mueven son los de
supervisión/visitas (emp-112-manager_ops, emp-79-tecnico_em, emp-124-segurista: ~1-1.4 cambios/semana). emp-55-ingenieria además tiene 33 registros
en proyectos de ingeniería (SO11498, SO11290) que aquí no cuentan.

---

## 4. Dónde paró la asistencia (último día con asistencia al 2026-09-28)

| SO | planta | último día | días sin asistencia | etapa del proyecto (Q8b) |
|---|---|---|---|---|
| SO9428 | VERTIV | 2026-09-25 | 3 | In Progress |
| SO11547 | TOPO_CHICO | 2026-09-25 | 3 | In Progress |
| SO11498 | BRIDGESTONE_ING | 2026-09-25 | 3 | In Progress |
| SO11699 | BRIDGESTONE | 2026-09-24 | 4 | In Progress |
| SO11762 | TOPO_CHICO | 2026-09-14 | 14 | En plazo de crédito |
| SO11773 | USA | 2026-09-02 | 26 | Done Operations |
| SO10337 | BRIDGESTONE | 2026-08-07 | 52 | **In Progress** |
| SO10300 | MAGNEKON | 2026-08-03 | 56 | En plazo de crédito |
| SO11290 | NALCO_MEXICALI_ING | 2026-07-29 | 61 | En plazo de crédito |
| SO11551 | QUIMITEC | 2026-07-08 | 82 | Complete TOTAL |
| SO11492 | MISSION_FOODS | 2026-07-07 | 83 | **In Progress** |
| SO10344 | BUDENHEIM | 2026-06-08 | 112 | Complete TOTAL |
| SO9667 | MONDELEZ | 2026-06-04 | 116 | Canceled |
| SO5995 | VERTIV | 2026-05-12 | 139 | Complete TOTAL |
| SO7723 | MAGNEKON | 2026-05-05 | 146 | En plazo de crédito |
| SO11511 | BEBIDAS_PURIFICADAS | 2026-05-01 | 150 | En plazo de crédito |

Dos proyectos siguen "In Progress" sin asistencia hace ≥ 50 días (SO10337 Bridgestone cortinas, SO11492 Mission
ductos): candidatos a kit olvidado en sitio o a proyecto que ya debió cambiar de etapa.

---

## 5. Mapa proyecto → planta (inferido; ver `PLANTA` en el script)

| project_id | SO | planta | confianza y fuente |
|---|---|---|---|
| 2302 | SO11547 | TOPO_CHICO | media: la descripción no nombra la planta; CLAUDE.md la identifica como Topo Chico y SO11663/SO11855 son adicionales "Proyecto TCh" |
| 2349 | SO11762 | TOPO_CHICO | alta: "Mejoras a sistema TOPOCHICO, MTY" |
| 121, 28 | SO9428, SO5995 | VERTIV | media: "upgrade de vertiv loop cerrado", "Vertiv- Instalación"; ubicación no registrada en Odoo |
| 160, 101 | SO10300, SO7723 | MAGNEKON | baja-media (SO10300 usado por la oficina) |
| 212, 2352 | SO10337, SO11699 | BRIDGESTONE | media |
| 155 | SO10344 | BUDENHEIM | media |
| 2327 / 2337 / 126 / 506 | SO11511 / SO11551 / SO9667 / SO11492 | Bebidas Purificadas / Quimitec / Mondelez / Mission Foods | media-baja |
| 2375, 241 | SO11498, SO11290 | ingeniería (no frente) | diseño/ingeniería conceptual |
| 2305, 515, 2356, 2328, 2297 | SO11557, SO11516, SO11773, SO11644, SO11526 | USA (no frente) | proyectos de FTS FULL TECHNOLOGY SYSTEMS LLC |

---

## 6. Parte A — SO confirmadas de los últimos 24 meses (`so_clasificadas.tsv`)

185 SO (`state = sale`, `company_id = 1`, `date_order >= 2024-09-28`). Clasificación por palabras clave sobre
descripción + alcance + nombre del proyecto (peso 2) y primeras 3 líneas (peso 1); primero se filtran los
"otros" (flete, renta, licencia, análisis de laboratorio, suministro sin instalación, ingeniería, prueba).
Confianza: alta si el tipo ganador duplica al segundo; media si gana sin duplicar; baja si empata o solo hubo
una coincidencia débil. **El texto viene truncado a 40 caracteres por el MCP**, así que la confianza real es menor
que la de un texto completo.

| tipo | SO | monto MXN sin IVA | monto USD sin IVA |
|---|---|---|---|
| otros (sin herramienta) | 62 | 2,978,988 | 2,685 |
| electrico_control | 49 | 56,626,301 | 17,288 |
| soldadura_tuberia_proceso | 27 | 37,802,861 | 9,300 |
| mecanico_instalacion | 27 | 2,563,689 | 423,480 |
| hvac | 12 | 4,190,536 | 185,200 |
| obra_civil_ligera | 8 | 1,996,083 | 0 |

Confianza: alta 154 · media 13 · baja 18. Ojo con el peso: SO11771 (Subestación PI Aurora, CONMET,
$45,854,039 MXN) es el 81 % del monto eléctrico, y SO9428 (Vertiv, $15,986,928) + SO11547 (Topo Chico,
$8,153,300) dominan soldadura/tubería. Por número de trabajos, eléctrico/control (49) supera a soldadura (27).
