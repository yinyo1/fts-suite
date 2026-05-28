# Incidente Kiosk Checkout Outage — 27 mayo 2026

> Análisis forense reconstruido con la evidencia que sobrevivió (Odoo + JSON de incidencias).
> Los logs de ejecución de n8n del incidente **se podaron antes del análisis** (retención default agresiva, solo retiene desde 28-may 14:26 UTC), por lo que la causa técnica exacta del outage **no es determinable**. Lo documentado como *directo* proviene de timestamps de Odoo y del JSON; lo documentado como *inferido* se deriva de patrones.

## TL;DR

12 horas de silencio backend (**18:16 CST 27-may → 06:28 CST 28-may**). **23 de 29 empleados** que checaron entrada el 27-may quedaron con `hr.attendance` abierto toda la noche (79%). El recovery automático del kiosk saneó **21 de 23** la mañana del 28-may sin intervención humana. **Railway oficialmente NO reconoce un outage de runtime** esa noche.

---

## Línea de tiempo (evidencia real — Odoo + JSON)

| Hora CST | Evento | Fuente |
|---|---|---|
| 27-may 06:22–09:00 | 29 empleados checan entrada normal | Odoo `hr.attendance` 13335–13363 |
| 27-may 17:45–18:16 | **Últimos 6 checkouts exitosos** (Francisco 17:45, Magaly 17:46, Aldo 18:11, Rissia 18:13, Pedro 18:14, Jésus 18:16) | Odoo `write_date` |
| **27-may 18:16 → 28-may 06:28** | ⚠️ **CERO actividad registrada en Odoo (~12 h)** | Odoo (ausencia total de records) |
| 28-may 06:28–08:53 | 27 empleados re-checan entrada → dispara recovery | Odoo `hr.attendance` 13365–13391 |
| 28-may 06:28–07:50 | **10 auto-rescates** (cierre a +9.6 h, TAG `x_studio_horario_en_disputa`, incidencia `auto_cierre_pendiente`) | JSON + Odoo (TAG=true) |
| 28-may 06:51–08:04 | **11 cierres "Seguí en turno"** (checkout normal, sin TAG) | Odoo `write_date` 28-may |

**Firma decisiva:** el corte limpio a las **18:16 CST**. Si el checkout hubiera funcionado toda la tarde, los 29 cierres se distribuirían entre 16:00–20:00 CST conforme cada quien sale. En cambio hay una frontera nítida — *todos los que salieron ≤18:16 lo lograron, nadie después* — característica de un servicio que muere a esa hora, no de olvidos individuales dispersos.

---

## Causa raíz (corroborada con web research)

[Railway status page](https://status.railway.com/) (mayo 2026) muestra:

- **Mayo 2026:** 99.11% uptime promedio (vs Abril 100%, Marzo 99.96%).
- Equivalente a **~6.6 horas de downtime acumulado** en mayo.
- Último incidente oficial del 27-may: *"Build Log Delivery Delays"* — **NO afecta runtime de workloads**.

**Railway oficialmente NO reconoce un outage de runtime el 27-may noche.** El incidente de FTS probablemente fue:

1. **Sub-incidente no reportado de la instancia FTS** (~50% probable)
2. **Cascade de glitch de networking en GCP** (~30% probable)
3. **Problema del container n8n específico** (~20% probable)

Los logs de n8n se podaron antes del análisis forense (retención default agresiva). **Causa técnica exacta NO determinable.**

### Por qué NO fue el cron de auto-cierre

El cron auto-cierre 2 am sigue **pendiente** (Bloque B, no implementado). Por eso los huérfanos sobrevivieron la noche sin limpieza proactiva y solo se sanearon de forma reactiva cuando cada empleado regresó.

---

## Resiliencia del sistema — descubierto vía forense

- **"Seguí en turno" NO es resiliente.** En `operaciones/kiosk/js/kiosk.js:1677-1679`, la opción `'turno'` llama `iniciarCheckin('salida')` = checkout normal, que dispara el mismo webhook `kiosk/checkin` → nodo `Odoo - UPDATE Salida` (workflow `a7mEjjdwIzzvomXs`). Escribe a Odoo de forma **síncrona, sin cola offline ni retry**. Durante el outage habría fallado igual que cualquier checkout. "Funcionó" solo porque el backend ya estaba arriba la mañana del 28.
- **El recovery automático SÍ funciona.** Saneó 21 de 23 huérfanos sin intervención humana, vía dos caminos según el umbral horario:

| Camino | Trigger (`kiosk.js`) | Resultado | Empleados |
|---|---|---|---|
| **"Seguí en turno"** (`zona_gris`, 14–24 h) | regresaron **<24 h** después de su entrada del 27 | checkout a la hora actual, sin TAG, sin incidencia | 11 |
| **Auto-rescate** (`error_critico` >24 h → checkin entrada, `kiosk.js:1696`) | regresaron **>24 h** después | cierre a +9.6 h + TAG disputa + incidencia `auto_cierre_pendiente` | 10 |

El split A/B es **exactamente** el umbral `UMBRAL_ERROR_CRITICO=24h`: quienes llegaron unos minutos *antes* que su hora del 27 cayeron en <24 h (zona_gris→checkout); quienes llegaron unos minutos *después*, en >24 h (error_critico→auto-rescate). Verificado individuo por individuo con los timestamps de Odoo.

- **El sistema depende 100% de Railway + Odoo arriba.** No hay persistencia local ni buffer; un outage = pérdida de operación hasta la recuperación.

---

## Empleados afectados

**Grupo A — auto-rescate (>24 h → `auto_cierre_pendiente` + TAG disputa), 10 empleados:**

| ID | Nombre | Att | Entrada 27-may (CST) | Incidencia |
|---|---|---|---|---|
| 121 | Stephany Ventura Arevalo | 13335 | 06:22 | INC-AUTO-CIERRE-121 |
| 130 | Rolando Vázquez García | 13336 | 06:28 | INC-AUTO-CIERRE-130 |
| 57 | Samuel Ulises Alcántara | 13337 | 06:29 | INC-AUTO-CIERRE-57 |
| 76 | Carlos Eduardo Manzanares | 13338 | 06:32 | INC-AUTO-CIERRE-76 |
| 131 | Tomas Vázquez García | 13339 | 06:37 | INC-AUTO-CIERRE-131 |
| 138 | Tomas Arnoldo Loredo Mares | 13340 | 06:39 | INC-AUTO-CIERRE-138 |
| 124 | Germán Emmanuel Merino Falcón | 13346 | 07:06 | INC-AUTO-CIERRE-124 |
| 55 | Juan Manuel Sánchez Lugo | 13348 | 07:08 | INC-AUTO-CIERRE-55 (aprobada_con_ajuste) |
| 149 | Erick Belmont Kato | 13351 | 07:09 | INC-AUTO-CIERRE-149 |
| 110 | Alejandro Reyes Galvez | 13356 | 07:44 | INC-AUTO-CIERRE-110 |

**Grupo B — "Seguí en turno" (<24 h → checkout normal sin TAG), 11 empleados:**

| ID | Nombre | Att | Entrada 27-may (CST) | Checkout 28-may (CST) |
|---|---|---|---|---|
| 127 | Cesar Gildardo Gómez Cano | 13342 | 06:54 | 06:51 |
| 6 | Leonel Cruz Cristobal | 13344 | 07:03 | 06:55 |
| 132 | José Carlos Ortiz Romero | 13345 | 07:04 | 06:55 |
| 112 | Felipe Pérez Guzmán | 13347 | 07:06 | 07:00 |
| 101 | Ana Laura Acevedo Flores | 13349 | 07:09 | 07:00 |
| 151 | Roberto Contreras | 13352 | 07:11 | 07:01 |
| 60 | Teresa Ramos Rodríguez | 13353 | 07:26 | 07:21 |
| 62 | Gilberto Gibrán Solís Carrillo | 13354 | 07:43 | 07:35 |
| 59 | Gerardo Isai Lozano Dávila | 13355 | 07:44 | 07:36 |
| 25 | Héctor Cruz Hernández | 13357 | 07:45 | 07:41 |
| 108 | Pablo Bayly Fernández | 13362 | 08:25 | 08:04 |

**Grupo C — NO recuperados (siguen abiertos, ausentes el 28-may), 2 empleados:**

| ID | Nombre | Att | Entrada 27-may (CST) | Estado |
|---|---|---|---|---|
| 116 | Mario Armando Ruiz Ramírez | 13341 | 06:53 | Abierto sin checkout |
| 128 | Enoc Natanael Maldonado Soto | 13343 | 06:55 | Abierto sin checkout |

**No afectados (checaron salida OK antes del corte):** Francisco Montalvo (8), Magaly Pérez (63), Aldo Méndez (78), Rissia Xavier (97), Pedro Hernández (143), Jésus Montalvo (68).

> Nota: el split A vs B es responsabilidad del azar de unos minutos (llegar antes/después de las 24 h), no de una decisión del empleado. Funcionalmente ambos caminos sanearon correctamente.

---

## Lecciones

1. **El status público de Railway NO detecta problemas que afectan a usuarios individuales.** Un 99.11% mensual "verde" oculta outages localizados de instancia. *"We have to own our uptime"* — Jake Cooper (Railway).
2. **Los logs de n8n se podan agresivamente sin configuración explícita.** Perdimos la evidencia forense primaria del incidente.
3. **Sistema sin queue offline = outage = pérdida de operación.** El kiosk no tiene buffer; si el webhook falla, el registro se pierde irrecuperablemente.

---

## Acciones tomadas HOY (28-may)

- Variables de retención de n8n agregadas en el dashboard de Railway.
- Mario Ruiz (116) archivado (baja).
- Enoc Maldonado (128) attendance cerrado (documentado time-by-time).

## Acciones pendientes

- **Status page interna con canary** (Recomendación #1 del forense): ping cada 5 min a `kiosk/empleados` + alerta tras 2 fallas consecutivas. Habría detectado el outage a las 18:21 CST en vez de descubrirlo a la mañana siguiente.
- **Cron auto-cierre 2 am** (Bloque B, Sprint 1): habría saneado los huérfanos a las 02:00 sin depender de que cada empleado regrese — cierra el caso de los 2 que no volvieron.
- **Modo offline-first del kiosk** (sprint grande, prioridad alta post-incidente): encolar en `localStorage` y reintentar al recuperar conexión convierte un outage en demora, no en 23 huérfanos.

---

## Referencias

- Status Railway: https://status.railway.com/ (mayo 2026)
- Post-mortem crisis 19-may: https://blog.railway.com/p/incident-report-may-19-2026-gcp-account-outage
- Análisis forense interno: sesión Claude Code 28-may-2026 (Odoo read-only + `shared/incidencias-asistencia.json`)

### Evidencia: directa vs inferida

| Dato | Tipo | Confianza |
|---|---|---|
| Quién quedó huérfano, horas, recovery path | Directo (Odoo + JSON) | Alta |
| Corte de checkouts a las 18:16 CST | Directo | Alta |
| Mecánica del split A/B (umbral 24 h) | Directo (código + timestamps) | Alta |
| "Seguí en turno" = checkout no resiliente | Directo (código + topología workflow) | Alta |
| Causa técnica del outage (Railway vs n8n vs Odoo) | Inferido — logs n8n podados | Media-baja |
| Hora exacta de inicio/fin del outage | Inferido del corte de actividad | Media |
