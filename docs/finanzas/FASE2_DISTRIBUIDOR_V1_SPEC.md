# FASE 2 — Spec del Distribuidor V1 de Carga MO (horas → pesos)

> ## 🟢 GO-LIVE OCURRIÓ — SEM 28 EN PRODUCCIÓN (RE-ESCRITA DEFINITIVA 2026-07-17)
> **La primera corrida real ya pasó.** SEM 29 (abajo) fue la **2ª corrida**.
>
> ## 🟢 SEM 29 EN PRODUCCIÓN — 2ª corrida (2026-07-18), ESCRITA
> - **46 líneas** `account.analytic.line`, IDs **60147-60192**, fecha **2026-07-16**, suma **−206,781.61** (Δ 0.00), llave `MO S29/2026 ·`. Validado línea-por-línea por MCP: 0 llaves duplicadas; `account_id` en proyectos / `x_plan2_id` en bolsas; rubro **1177** en las 46.
> - **Correcciones del día verificadas en las líneas escritas:** Ricardo (98) → 1 línea **B608 −7,633.33**, **cero a 3096** (Felipe lo había movido VENTAS→ADMIN el 14-jul; revertido por Dirección, att 14298). Mateo (75) → **P2349 −7,968.21 + P2302 −1,975.34** (intactas). Juan Manuel (55) → **P241/SO11290 −2,750 + B3096 −1,375**.
> - **Achieved post-write (crudo):** Vertiv **576** achieved −602,597.74 vs budget −591,800 → **CRUZÓ 100% (101.82%, sobrecosto −10,797.74)**; SO11290 (854/línea 1125) achieved **−6,343.33** vs −21,000 (30.2%); SO11547 (3034/2300) −74,917.12 vs −555,800; **SO11762 (3083/2522) achieved −60,408.35 vs budget −1 placeholder** → escribe sin medición (pendiente poblar). Bolsas 608/3096 sin budget (esperado): SEM 29 landed 608 −47,474.46 · 3096 −24,380.96.
> - **Override stage-13: NO consumido** — ningún destino de SEM 29 está en stage-13 (241/SO11290 en "In Progress"; Topo/Vertiv/Mexicali activos). Verificado por MCP.
> - **Incidente forense de la semana** (deploy trabado frontend↔server + falsa alarma "pérdida de confirmaciones" + cruce de IDs 14372/14377 vs 14298): documentado en `CLAUDE.md §8` (reglas anti-fantasma: timestamps UTC+CST, "verificado"=ejecutado, todo ID con su read crudo pegado).
> - **Estado DEFINITIVO: 36 líneas** `account.analytic.line`, IDs **60057-60092**, fecha 09-jul, suma **−196,230.81** (Δ 0.00), llave `MO S28/2026 ·`. Validado línea-por-línea por MCP (0 duplicados, 0 sobrevivientes de la corrida vieja). ⚠️ **Los IDs 60013-60056 (1ª corrida, 44 líneas, regla 3-solo) YA NO EXISTEN** — se hizo rollback por prefijo y re-write con: **solo_bolsa=10** + `trio_solo_bolsa` (Felipe) + **att 14183 corregido** (Luis Ángel nunca trabajó en Magnekon — checkout mal seleccionado; **primer caso real que justifica el candado UI #2**).
> - Efecto del re-write: **Magnekon (668) y Chiller (3071) desaparecieron** del por_destino (Gerardo/Gibrán se fueron por solo_bolsa; Felipe→3096; el día de Magnekon de Luis Ángel se corrigió a 608). Por destino: Topo −62,899.66 · Vertiv −38,127.80 · 608 −37,998.07 · 513 −22,742.77 · 3096 −22,066.70 · 768 −6,562.50 · 478 −5,833.31. Felipe emp112·B3096 −11,136 (`trio_solo_bolsa`); Luis Ángel emp48·B608 −6,797.66 (vac+horas fusionadas en 1 línea). Nombres de bolsa vivos (CENTRO DE COSTOS ADMINISTRACION/LEGAL/etc.).
> - Compuesto correcto: proyecto→`account_id` (P2302→3034, P121→576), bolsa→`x_plan2_id`, rubro 1177.
> - **Cutover ejecutado:** `unlink [47,48,9]` hecho. Verificado: 49 distribution models vivos, **NINGUNO inyecta 1177**.
> - **Deltas SEM 28 por proyecto (exactos):** Topo −68,324.60 · Vertiv −40,367.60 · Magnekon −3,510.88 · Chiller −2,235.46 · 1130 sin cambio (Rissia→608 por solo_bolsa).
> - **Correo:** bug cosmético corregido (el MOTOR dry-run había perdido `total_nomina`/`total_distribuido` del top-level → "$0.00"; re-añadidos. El write nunca tuvo el bug).
>
> ### 📌 POLÍTICA DEL HISTÓRICO 1177 (legitimidad y frontera, NO exclusión)
> El 1177 manual **pre-distribuidor es LEGÍTIMO, se queda, suma al acumulado** (es el costo verdadero — en 2024/2025 se cargaban horas manual; Vertiv lleva 2+ años abierto). El prefijo **`MO S`** identifica la era del distribuidor. El `achieved` acumulado DEBE incluir el histórico. Inventario 1177 no-MO: **274 líneas**, 2023 (−1.31M, 68) · 2024 (+4.11M, 2) · 2025 (−2.81M, 204) · 2026 no-MO = 0.
> - **Frontera:** última carga manual = **2025-12-26** ("Open balance … nomina"). **Hueco ene-jun 2026 (SEM 1-27) sin NINGÚN MO** → ése es el alcance del Backfill 2026.
> - **Contaminación #47 (auto-inyectado GL 102.01.00008) = 0 líneas.** Los 7 huérfanos sin eje (sin proyecto ni bolsa) son del #48/#9 (GL 2023.34/101000): 5 nóminas/transferencias manuales reales (neto −326,251.60) + **2 "AJUSTE-HISTORICO-FINAL" (+4,105,043.26, 31-dic-2024) = artefacto de conciliación** (no costo real; sin eje → no toca budgets de proyecto/bolsa). Revisar con Gera si se reclasifica/limpia el ajuste.
>
> ### ⚠️ HALLAZGOS en budgets (estructura, no del write)
> - **Magnekon (668):** su `budget.line` 1177 cierra **2025-12-31** → el `achieved` (−47,341.77) NO capta el SEM 28 (−3,510.88, fechado 2026-07-09). **Extender `date_to` del budget** para que capture 2026.
> - **Chiller (3071):** **no existe** `budget.line` con rubro 1177 → el SEM 28 (−2,235.46) no acumula en ningún budget. Crear la línea 1177.
> - (Ambos son gaps de la estructura de budgets legada, no del distribuidor. Las `analytic.line` sí quedaron bien; es el budget el que no las capta.)


> ## ⚠️ Correcciones 2026-07-16 (post browser-test de Esteban) — LEER PRIMERO
> Aplicadas a la página `operaciones/carga-mo/index.html` (build `20260716-cmo-jwt-v2`) + workflows `HV1UE5JxN5fKdC2Y` (dry-run) y `j0V9wfpuPTLFO9DZ` (write, sigue INACTIVO):
> 1. **Código 080 = Arturo Hernández (emp 143)**, ya existente (nombre completo "Pedro Arturo Hernández Ramírez"). **NO se crea empleado.** Mapa 080→143 en página + ambos workflows; F12 B.2 ahora incluye `143:'080'` (**27 códigos**); Pedro eliminado de B.3.
> 2. **solo_bolsa = sólo 3** (Rissia 97, Pablo 108, Arturo 143 → **608**). Todos los demás **híbridos** (respetan checkout). Los 3 sí checan kiosko; el flag sólo afecta el dinero. Workflows leerán `x_studio_solo_bolsa` de Odoo cuando exista (fallback al mapa, hook marcado en el MOTOR).
> 3. **Parser ignora fila fantasma** (código "00"/vacío **y** sin bruto = basura de Excel). Validación dura se mantiene para códigos reales sin cruce.
> 4. **Semana = Periodo CONTPAQi de la fila 4** (`Periodo N ... del DD/MM al DD/MM`), NO semana ISO. La página valida que la fecha de inicio del periodo == viernes elegido (si no, error "archivo equivocado"). Llave idempotencia `MO S<periodo>/<año>`.
> 5. **Vacación parcial:** cols 9+10 (Vacaciones + Prima) → **513**; el RESTO del bruto se reparte por horas confirmadas. Sólo si NO hay horas en toda la ventana → 100% a 513. Caso real Luis Ángel.
> 6. **Umbral trío `<2h`** confirmadas en la semana → su monto va a excepción. (Ricardo 98 en SEM 28: 0.01h → excepción; de hecho no aparece en el Excel SEM 28.)
> 7. **SEGURIDAD (JWT):** página detrás del auth de Finanzas (`FinAuth`, sin login no se ve nada — muestra brutos confidenciales). Ambos webhooks **validan el token por request** (mismo HMAC-SHA256 JS puro de `auth/finanzas-login`, token en el body). WRITE conserva su gate `confirm_write` como 2ª capa. Verificado en vivo: sin token/token basura/JWT con secreto falso → **401**.
>
> **Fix de precisión (descubierto en la re-corrida):** el reparto usaba `tot=Math.round(sum*100)/100` (redondear horas antes de dividir) → drift de **$1.80** en SEM 28. Corregido a **tot precisión completa + residuo-a-última-línea** → cada empleado suma EXACTO a su bruto → total cuadra Δ 0.00. Aplicado en ambos MOTOR + la simulación.
>
> **Dry-run SEM 28 con reglas nuevas (Δ control 0.00):**
> Topo Chico 68,756.78 · Vertiv 41,295.20 · 608 VENTAS 35,486.37 · 513 ADMIN 27,089.74 · 768 LEGAL 6,562.50 · 478 RH 5,833.31 · 3096 ADMIN OPS 4,364.44 · Magnekon 4,019.10 · Chiller 2,823.37 · **Total 196,230.81** (= bruto 177,778.56 + trío 18,452.25). 0 excepciones. Reglas especiales: Juan Manuel vacación_total→513; Luis Ángel vacación_parcial (2,173.75→513 + resto por horas Magnekon/608); Juan/Juana asimilado→513; Rissia/Pablo/Arturo solo_bolsa→608; Carlos/Felipe trío por horas.
> _(Nota: los totales por destino pueden variar ±centavos en el live según el orden de iteración de las asistencias — el total siempre cuadra exacto.)_

> ## ⚠️ 4ª pasada 2026-07-16 (correo de auditoría + proyecto→cuenta analítica)
> **1. Correo de auditoría post-run (Microsoft Graph).** Ambos workflows mandan un correo a **estebandelacruz@fts.mx** (from `sales@fts.mx`, credencial `Microsoft Graph - sales` `Mh5kBNduMzOl3nzT`) al terminar. Dispara **también el dry-run** (no solo el write). Asunto: `[Carga MO] Periodo <N> - DRY-RUN|REAL - Total $X`. Contenido: (a) tabla resumen por destino (cuenta/proyecto → monto), (b) tabla detalle por empleado (bruto → cada destino con monto), (c) excepciones + bloqueos (días sin confirmar, códigos raros, proyecto sin cuenta), (d) sumas de control (Σ=bruto+trío, Δ, OK/DESCUADRE). Nodos `Code - Build correo` + `HTTP - Enviar correo (Graph)`, rama **best-effort** (`onError:continueRegularOutput`) colgando del MOTOR (dry) / del report+NO_ESCRIBE (write) — si el correo falla, la respuesta/escritura no se afecta. Es la herramienta de auditoría semanal de Esteban. _(El validator marca el fan-out MOTOR→[Respond,correo] como "error" — es **falso positivo**: multi-output válido; la respuesta sale inmediata y el correo va async.)_
>
> **2. Proyecto → cuenta analítica (bug corregido).** `hr.attendance.x_studio_project_id` es el **`project.project` id** (ej. 2302 Topo, 121 Vertiv), pero `account.analytic.line.account_id` necesita la **cuenta analítica** (`project.account_id`), que es **DISTINTA** (2302→3034, 121→576, 160→668, 506→1130, 2337→3071). El write ANTES metía el project_id como account_id (**incorrecto**). Nuevo nodo `Odoo - proyectos` (lee `project.project` [id, account_id]) → el MOTOR resuelve `P<projId>` a su cuenta analítica en la línea. **Validación (Esteban #2):** si un proyecto tiene `account_id` false/inexistente → ese monto va a **cola de excepción `proyecto sin cuenta analítica`** (con su monto), nunca se pierde ni truena el run. En SEM 28/29 los 5 proyectos SÍ tienen cuenta → 0 excepciones, distribución idéntica.
>
> ### 📋 BACKLOG (registrado, NO construir aún)
> - **Mini-sprint "Backfill 2026":** cargar el costo MO de todo el año. Insumos: attendances históricos + Excel CONTPAQi de cada semana (Ulises) + **parseo del historial WhatsApp** del grupo (planes de Felipe en texto, validando fecha de envío vs fecha del plan) para prellenar/sugerir proyecto y que Felipe confirme en tandas. **Planes en imagen = manuales.** Ejecutar **SIEMPRE post-cutover** (para que los distribution models desactivados no doble-inyecten 1177). Llave `MO S<periodo>` distinta por semana ⇒ idempotencia limpia.
> - **Candado triple V1.1:** marcar cada `hr.attendance` como "costeada" con el ID de su `analytic.line` (evita re-costear un attendance si se re-corre una semana; complementa la idempotencia por llave de semana).
>
> ## ⚠️ 3ª pasada 2026-07-16 (vacaciones → bolsa MADRE del depto)
> Cambio de regla (Esteban): **el dinero de vacaciones (cols 9+10) va a la bolsa madre del DEPARTAMENTO del empleado, NO a 513 fijo.** Razón: el costo de vacaciones es del depto que las otorga; 513 fijo inflaría Administración con vacaciones ajenas. Mapa depto→bolsa: **Comercial→608, Operaciones→3096, RH→478, Legal→768, Admin y Finanzas→513, Dirección→3095** (por nombre de `department_id`, normalizado sin acentos; fallback 513 si el depto no mapea). Precisión: cols 9+10 = SOLO el dinero de los días de vacaciones → bolsa depto; el **resto** del bruto se reparte por horas confirmadas normal (proyecto si trabajó, bolsa si no). Aplica a parcial y total. **Los ASIMILADOS NO cambian** (513 por su `cuenta_indirecta_default` vía regla `asim`). Se agregó `department_id` al nodo `Odoo - empleados` (build página `20260716-cmo-vacdepto-v4`).
>
> **Dry-run SEM 28 con la regla nueva (Δ 0.00):** Topo 68,756.78 · Vertiv 41,295.20 · **608 VENTAS 37,660.12** · **513 ADMIN 20,515.99** · **3096 ADMIN OPS 8,764.44** · 768 LEGAL 6,562.50 · 478 RH 5,833.31 · Magnekon 4,019.10 · Chiller 2,823.37 · **Total 196,230.81**. Casos: Luis Ángel vac $2,173.75 → 608 (Comercial, antes 513); Juan Manuel $4,400 → 3096 (Operaciones, antes 513); asimilados Juan/Juana → 513 (sin cambio).

> ## ⚠️ 2ª pasada 2026-07-16 (prereqs de Esteban listos → el mapa en memoria MURIÓ)
> Esteban completó los prereqs en Odoo ANTES de esta pasada: campo `x_studio_codigo_contpaqi` + 27 códigos poblados; **Juan = emp 155 (017)** y **Juana = emp 156 (018)** (default 513); Miriam 148 archivada; campo `x_studio_solo_bolsa` creado. Por lo tanto:
> 1. **El mapa en memoria murió.** Ambos workflows (`HV1UE5JxN5fKdC2Y` dry-run, `j0V9wfpuPTLFO9DZ` write) ahora tienen un nodo **`Odoo - empleados`** que lee `x_studio_codigo_contpaqi` + `x_studio_solo_bolsa` + `x_studio_cuenta_indirecta_default` en CADA corrida. `código → employee_id`, `solo_bolsa` y la bolsa destino salen de Odoo, no de un dict. Autoprogresivo: un empleado nuevo con código entra solo. El `CODE_MAP` de la página queda **sólo para el preview** (build `20260716-cmo-odoo-v3`).
> 2. Página + workflows: **017→155, 018→156** (ya no "crear").
> 3. **Reglas de destino ahora por Odoo:** asimilado → su `cuenta_indirecta_default` (513 para Juan/Juana); solo_bolsa → su `cuenta_indirecta_default` (608 para los 3); vacación → 513 fijo; sin horas/sin vac → excepción (la cascada a `cuenta_indirecta_default` §d.2 queda como opt-in de 1 línea si Esteban la aprueba tras ver el ensayo).
> 4. **Regla de timing (día sin confirmar = bloqueo):** el dry-run reporta `confirmacion:{todo_confirmado, dias_sin_confirmar, pendientes[]}` — lista cada attendance del roster (incluye trío Felipe/Carlos/Ricardo) en la ventana **sin** `manager_approval`, en disputa, o sin check_out. El **WRITE se BLOQUEA** si `todo_confirmado===false` (además del gate `confirm_write` + idempotencia).
>
> ### 🚨 Pendiente de Esteban ANTES del ensayo: `x_studio_solo_bolsa` está en FALSE
> El read-back (abajo) mostró `x_studio_solo_bolsa = false` en **los 29**, incluidos 97/108/143 — el `true` que marcaste en Studio **no persistió**. El campo existe (no da error). El código honra lo que diga Odoo → **si corres el ensayo con el flag en false, Rissia/Pablo/Arturo se reparten por horas (híbrido), NO 100% a 608.** Fix (F12, el MCP es read-only):
> ```js
> for(const emp of [97,108,143]){ await rpc('hr.employee','write',[[emp],{x_studio_solo_bolsa:true}]); }
> ```
> (o re-marcar en Studio y **guardar el registro**). Verifícalo con un read antes del ensayo.
>
> ### Read-back del mapeo final (29 códigos, Odoo 2026-07-16)
> | Cód | emp | Nombre | solo_bolsa | cuenta_indirecta_default | Depto |
> |---|---|---|---|---|---|
> | 002 | 25 | Héctor Cruz | false | — | Operaciones |
> | 003 | 68 | Jésus Montalvo | false | 3096 ADMIN OPS | Operaciones |
> | 005 | 6 | Leonel Cruz | false | — | Operaciones |
> | 006 | 8 | Francisco Montalvo | false | 608 VENTAS | Comercial |
> | 010 | 55 | Juan Manuel Sánchez | false | — | Operaciones |
> | 011 | 48 | Luis Ángel García | false | 608 VENTAS | Comercial |
> | 012 | 63 | Magaly Pérez | false | 768 LEGAL | Legal |
> | 013 | 62 | Gibrán Solís | false | 3096 ADMIN OPS | Operaciones |
> | 014 | 57 | Samuel Alcántara | false | — | Operaciones |
> | 016 | 59 | Gerardo Lozano | false | 513 ADMIN | Admin y Finanzas |
> | 017 | 155 | Juan De La Cruz (asimilado) | false | 513 ADMIN | RH |
> | 018 | 156 | Juana Camarillo (asimilado) | false | 513 ADMIN | RH |
> | 027 | 75 | Mateo Salazar | false | 3096 ADMIN OPS | Operaciones |
> | 028 | 78 | Aldo Méndez | false | 608 VENTAS | Comercial |
> | 029 | 79 | José Luis Romero | false | — | Operaciones |
> | 036 | 97 | Rissia Araujo | **false ⚠️** | 608 VENTAS | Comercial |
> | 038 | 101 | Ana Laura Acevedo | false | 478 RH | RH |
> | 044 | 108 | Pablo Bayly | **false ⚠️** | 608 VENTAS | Comercial |
> | 052 | 121 | Stephany Ventura | false | — | Operaciones |
> | 056 | 124 | Germán Merino | false | — | Operaciones |
> | 058 | 127 | Cesar Gómez | false | — | Operaciones |
> | 059 | 128 | Enoc Maldonado | false | — | Operaciones |
> | 061 | 131 | Tomas Vázquez | false | — | Operaciones |
> | 062 | 130 | Rolando Vázquez | false | — | Operaciones |
> | 074 | 138 | Tomas Loredo | false | — | Operaciones |
> | 080 | 143 | Arturo Hernández | **false ⚠️** | 608 VENTAS | Comercial |
> | 081 | 149 | Erick Belmont | false | 513 ADMIN | Admin y Finanzas |
> | 084 | 153 | Eduardo Garza | false | 513 ADMIN | Admin y Finanzas |
> | 085 | 154 | Ramiro Segovia | false | 3096 ADMIN OPS | Operaciones |
>
> ⚠️ = debería ser `true`. Los 15 "Operaciones" con default `—` está OK: son de campo (respetan checkout, casi nunca caen al fallback).
>
> ### 📅 Calendario real (corregido)
> - **HOY = jueves 16-jul.** La SEM 29 (ventana vie 10 → jue 16, cierra hoy) la manda Ulises **mañana vie 17**.
> - **Mañana vie 17 = ENSAYO REAL con SEM 29** (dry-run completo). Requiere que Felipe tenga confirmada la semana hasta hoy jue 16; el dry-run reporta como bloqueo cualquier día sin confirmar.
> - **Go-live (write + cutover `unlink [47,48,9]`):** Esteban decide mañana con el dry-run enfrente — si sale impecable, puede ser mañana mismo (SEM 29); si no, **vie 24 con SEM 30**.
> - **Backfill (viable ✅):** las semanas no escritas en vivo (28, y 29 si se espera) se pueden escribir retroactivamente con su propia llave `MO S<periodo>/<año>` — llaves distintas por periodo ⇒ sin colisión con la idempotencia. **Recomendación:** hacer el backfill **DESPUÉS del cutover** (`unlink [47,48,9]`) para que los distribution models ya desactivados no inyecten un 2º rubro 1177 sobre las líneas backfilleadas. Las líneas de MO que escribe el distribuidor son nuevas (no existían antes) → el backfill en sí no duplica.

> **Estado:** DISEÑO (cero escrituras). Diseñado 2026-07-13 contra Odoo `serviciosfts.odoo.com` (MCP UID 2 read-only) + decisiones cerradas de Esteban.
> **Alcance V1 (MVP):** distribuir SOLO el **bruto CONTPAQi** (percepciones totales por empleado) + montos del trío facturante (Carlos/Felipe/Ricardo), ponderado por **horas confirmadas** de la ventana de nómina **VIE→JUE**, escribiendo **`account.analytic.line` compuesta (proyecto|bolsa × rubro 1177 MO)**. La línea nace etiquetada por rubro desde V1.
> **Fuera de V1 (backlog, no diseñar):** carga patronal por factor (SUA), ISN, fondo de ahorro (columna Z del Excel), true-ups, geocercas dinámicas.
> **Prerequisitos post-incidente 13-jul:** ver [`docs/INCIDENTES/2026-07-13_odoo_distribution_model_crash.md`](../INCIDENTES/2026-07-13_odoo_distribution_model_crash.md) §9 — la neutralización del double-count es **UNLINK, nunca vaciar** un distribution model.

---

## 0. Decisiones incorporadas (cerradas por Esteban)
- **Asimilados Juan De La Cruz Maldonado + Juana Camarillo:** se CREARÁN como `hr.employee` (no existen hoy; ⚠️ **Juan colisiona en nombre con la company_id 2 "JUAN DE LA CRUZ MALDONADO"** — la creación debe distinguirlos). Sin kiosk. Mientras estén en nómina de Ulises → bruto **100% fijo a bolsa 513** (misma que Gerardo).
- **Empleado 148 "Administracion FTS-YIN":** **NO se hace unlink** — está vinculado al **user 25 (Miriam, `miriam@fts.mx`) activo con writes** (rompería el user + auditoría). 0 attendances. → **Se EXCLUYE del roster de nómina** (no tendrá `x_studio_codigo_contpaqi` → el distribuidor lo salta solo, cero write). Opcional cosmético: renombrar a "Miriam · Administración FTS-YIN". Si Esteban lo quiere fuera de listas → **archivar (active=False), NO unlink**.
- **Umbral watchdog variación nómina:** **10%**.
- **Renombres bolsas 768/513:** los hace Esteban en UI (sin acción del distribuidor).
- **Regla stage 13 (En plazo de crédito):** DURA — MO hacia proyecto en cobranza → **cola de excepción**, no escritura silenciosa.

---

## 1. Arquitectura — flujo de nodos n8n (propuesto)
```
[Webhook: subida Excel validada]
   → Code: Parse Excel (headers fila 8, 36 cols, filas manuales, Total Gral)
   → Code: Validaciones duras (código cruza / suma control / semana no procesada)
        └─ IF falla → Respond ERROR + reporte, ABORTA (no escribe)
   → HTTP GET empleados-master + Odoo READ (ficha código↔empleado, cuenta_indirecta_default)
   → Odoo SEARCH hr.attendance ventana VIE→JUE (horas confirmadas por empleado×destino)
   → Odoo SEARCH asignación manual de la semana (para cascada dinero-sin-horas)
   → Code: MOTOR de distribución (pesos por horas, cascadas, excepciones)
   → Code: Split → [líneas a escribir]  +  [cola de excepciones]
   → Odoo: pre-check idempotencia (search analytic.line por llave semana+empleado)
   → Odoo CREATE account.analytic.line (compuesta proyecto|bolsa × 1177)   ← ÚNICO write
   → Odoo READ-BACK: suma de control escrita vs Excel
   → HTTP Graph: reporte post-run a Esteban (distribución + excepciones + sumas)
```
**Patrón §Odoo:** todo write vive en el workflow n8n (nunca en Odoo server-action). Nodo Odoo CREATE con `customResource`, "Always Output Data" ON.

---

## a. TRIGGER — 3 opciones evaluadas → **subida manual del Excel (V1)**
| Opción | Veredicto |
|---|---|
| Webhook desde sistema externo | ❌ no hay sistema que dispare; CONTPAQi es local de Ulises |
| Poll del journal BBVA Nómina (GL 102.01.00008) | ❌ **descartado — verificado: 0 movimientos en el ERP en 2026** (`account.move.line [account_id=359, date≥2026-01-01]` = 0). La dispersión NO pasa por Odoo. |
| **Subida manual del Excel validada** | ✅ **V1** — Ulises sube el Excel CONTPAQi de la semana; el upload valida y dispara |

**Nodo:** Webhook POST `planeacion/carga-mo` (multipart o base64 del xlsx). Gate: auth Felipe/master (heredado). **Decisión abierta:** ¿UI de subida en `operaciones/` o subida directa por Ulises? (proponer UI mínima con preview de validaciones antes de confirmar).

---

## b. INGESTA del Excel CONTPAQi (layout SEM 28)
- **Estructura:** headers en **fila 8**, **36 columnas**, filas de empleado, luego **filas manuales al final** (CARLOS/FELIPE solo-neto; Ricardo cuando aparezca), fila **Total Gral**.
- **Parse:** Code node (SheetJS/xlsx no está en sandbox n8n → parsear en el frontend antes de subir, o usar un Code con parser JS puro de CSV export del xlsx). **Decisión abierta:** parsear en cliente (subir JSON normalizado) vs parsear en n8n. Recomiendo **cliente parsea → sube JSON** (evita dependencia xlsx en sandbox).
- **Validaciones DURAS (cualquier fallo aborta, cero escritura):**
  1. **Cruce de código:** todo `codigo_contpaqi` del Excel debe existir en `hr.employee.x_studio_codigo_contpaqi`. **Rechazo total si falta uno** (reporta lista de códigos sin empleado + empleados sin código).
  2. **Suma de control:** `Σ distribuido == Σ percepciones(Excel) + Σ trío(neto)` con **tolerancia de centavos** (±$0.05 × n_empleados). Si no cuadra → aborta.
  3. **Idempotencia de semana:** la semana (VIE→JUE, id derivado) no fue procesada antes — search de `analytic.line` con la llave de semana (ver §e). Si existe → aborta con "semana ya procesada".

---

## c. MOTOR de distribución
**Modelos Odoo (read):** `hr.attendance` (horas confirmadas), `hr.employee` (código, cuenta_indirecta_default, categoría), asignación manual de la semana (fuente TBD — ¿tabla propia o campo?).

- **Ventana:** **VIE 00:00 → JUE 23:59 CST** de la semana de nómina (misma convención UTC−6 del watchdog; `desde = viernes 06:00 UTC`, `hasta = jueves+1 05:59:59 UTC`).
- **Pesos:** por empleado, `horas_confirmadas_por_destino / horas_totales_confirmadas` → fracción del bruto a cada destino (proyecto|bolsa). Destino sale del checkout: `x_studio_project_id` (proyecto, plan 1) **o** `x_studio_many2one_field_GUbBF` (bolsa, plan 2). Solo attendances `manager_approval=true` y `horario_en_disputa!=true`.
- **HE (horas extra):** ponderadas a **factor real** (ej. 2x/3x LFT). Fórmula lista aunque **V1 tenga HE=0**: `peso_hora = horas_normales + Σ(he_i × factor_i)`. En V1 `factor=1` para todas hasta que exista la fuente de HE.
- **Percepciones SIN horas** (vacaciones, prima, permisos CON goce) → **bolsa del depto** del empleado (`cuenta_indirecta_default`). Sin goce → no hay percepción (no entra).
- **Asimilados (Juan/Juana):** 100% → **bolsa 513**, sin mirar horas (no checan).
- **Trío facturante (Felipe 870 / Ricardo 2007 / Carlos 2082):** su costo = **subtotal sin IVA de su factura** (no horas×estimado), **repartido por sus horas de kiosk** entre destinos. Carlos (=emp 76) SÍ checa → sus horas ponderan; Felipe/Ricardo si no checan → 100% a su bolsa default o a la asignación manual.

**Punto de decisión:** origen de la "asignación manual de la semana" (§d.1) — proponer modelo/campo (ej. una tabla `x_asignacion_semanal` o un JSON en repo por semana).

---

## d. CASCADA dinero-sin-horas + reglas de excepción
Empleado con nómina pero **0 horas confirmadas** en la ventana (viaje sin geocerca, incapacidad, vacaciones):
1. **Asignación manual de la semana** si existe → proyecto indicado.
2. Si no → **`x_studio_cuenta_indirecta_default`** (bolsa del depto).
3. Sin default → **cola de excepciones, NO se procesa** hasta decisión humana.
→ **Siempre reportado** en el post-run (§f).

**Reglas de excepción adicionales:**
- **Stage 13 (En plazo de crédito):** MO que caería en un proyecto en stage 13 → **cola de excepción**, no escritura. (9 proyectos hoy en stage 13, ver Audit D.)
- **Candado trío:** si una **factura de proveedor** del trío (870/2007/2082) trae rubro **1177** en su `analytic_distribution` → **fuga de doble conteo, alerta inmediata** (hoy limpio: sus bills usan 1176 gasolina, ver Audit C / Design 3).

---

## e. ESCRITURA — `analytic.line` compuesta + idempotencia
**Único write del workflow.** Por cada (empleado × destino × semana):
- Crear **`account.analytic.line`**:
  - destino **proyecto** (plan 1) → `{ account_id: <proj_account>, x_plan20_id: 1177, amount: -<monto>, date: <jueves de la semana>, name: <LLAVE>, general_account_id: <GL MO a definir> }`
  - destino **bolsa** (plan 2) → `{ x_plan2_id: <bolsa_account>, x_plan20_id: 1177, amount: -<monto>, ... }` (`account_id` vacío).
  - ✅ **VALIDADO (canary 2026-07-16):** el budget "achieved" lee la línea por `x_plan2_id` (bolsa) — `achieved -500` con `budget -1000`, signo negativo correcto. IDs `{bid:405, bl:2521, al:59925}`.
- **Llave de idempotencia (formato propuesto):**
  `name = "MO S<WW>/<YYYY> · emp<empId> · <destino_code>"`
  ej. `"MO S28/2026 · emp112 · 3096"` (bolsa ADMIN OPS) o `"MO S28/2026 · emp75 · SO11547"` (proyecto).
  Pre-write: `search account.analytic.line [name =like 'MO S28/2026 · emp112 ·']` → si existe, **no re-escribe** (idempotencia por semana+empleado).
- **Read-back post-escritura:** `Σ amount escrito por semana` vs `Σ Excel` (control), reportado.

**Decisión abierta:** `general_account_id` (GL contra el que cuelga la analytic.line de MO). Opciones: una cuenta de gasto "Sueldos aplicados a proyecto" o dejar la analytic.line standalone sin move (permitido, pero validar que el budget la cuente). Recomiendo **standalone analytic.line** (sin move) para no tocar el GL/contabilidad en V1 — el objetivo es SOLO el budget/rentabilidad analítica.

---

## f. REPORTE post-run a Esteban (patrón Graph del watchdog)
Correo HTML (Microsoft Graph, cred `Mh5kBNduMzOl3nzT`, `sales@fts.mx`) tras cada corrida:
- **Distribución por proyecto/bolsa** (monto MO 1177 escrito por destino).
- **Cola de excepciones** (empleados sin horas sin default, stage-13, código sin cruce).
- **Validación de sumas** (Σ escrito vs Σ Excel, ✓/✗).
- Destinatarios: Esteban + (opcional) Ulises. Reusa guards de vacío + TZ=UTC.

---

## g. CUTOVER — se ejecuta el viernes del primer run real (documentado, no ahora)
**UNLINK** (nunca vaciar — invariante post-P1 13-jul) de los **3 distribution models que inyectan rubro 1177**:
- **#47** `102.01.00008` (BBVA Nomina) → 1177
- **#48** `2023.34` → 1177
- **#9** `101000` → 1177

Deja al distribuidor V1 como **única fuente de 1177**. ⚠️ **Verificar ese día cuál está realmente vivo** (discrepancia `DIAGNOSTICO_CARGA_MO.md §4` [#48/2023.34] vs Audit C [#48 dormido, #47 activo]) — unlink de los 3 lo resuelve igual. **Antes de unlinkear, confirmar que ninguno queda vacío en su lugar** (borrar el registro entero, no el JSON).

**JSON-RPC (consola F12, se corre el día del cutover):**
```js
await rpc('account.analytic.distribution.model','unlink',[[47, 48, 9]]);
```

---

## h. PREREQUISITOS DE ESCRITURA (con dueño)
| # | Prerequisito | Dueño | Estado |
|--:|---|---|---|
| 1 | Campo `x_studio_codigo_contpaqi` en `hr.employee` (crear + `required`) | Esteban (Studio) | ❌ no existe |
| 2 | Poblar código CONTPAQi de los ~29 de SEM 28 + trío | RH/Ulises (Excel cruce) | pendiente |
| 3 | Ficha de costo: `x_studio_costo_bruto_semanal_est` por empleado | Esteban/Ulises | pendiente |
| 4 | Crear `hr.employee` Juan De La Cruz + Juana Camarillo (default 513) | Esteban (o pasada de writes) | pendiente |
| 5 | Excluir emp 148 del roster (sin código; NO unlink) | — (automático) | ✅ resuelto por diseño |
| 6 | Budgets de las 6 bolsas (608/3095/3096/513/768/478) + línea 1177 | Esteban (montos cotización) | ❌ faltan |
| 7 | Líneas 1177 faltantes: 3071 (sin budget), 3083/3087 (sin 1177), 3038/3091/3094 (placeholder −1) | Esteban (montos) | ❌ 6 proyectos |
| 8 | Renombres bolsas 768/513 (quitar prefijo SO) | Esteban (UI) | en curso |
| 9 | Cutover: unlink #47/#48/#9 | distribuidor (día 1) / F12 | documentado |
| 10 | Fuente de "asignación manual de la semana" (modelo/campo) | por definir | ❌ decisión abierta |
| 11 | `general_account_id` de la analytic.line MO (o standalone) | por definir | ❌ decisión abierta |

---

## Layout Excel SEM 28 (verificado) + reglas refinadas
**Archivo:** `SEM 28 NOMINAS DE FTS 2026.xlsx` (44 filas, 36 cols). Headers **fila 8**. Datos **filas 9-37** (29 empleados). Filas manuales **38 (CARLOS) + 39 (FELIPE)** = trío, valor en col 36 (NETO). Separador fila 40. **Total Gral fila 41.**
**Columnas clave:** 1 `Código` · 2 `Empleado` (APELLIDO APELLIDO NOMBRE) · 9 `Vacaciones a tiempo` · 10 `Prima de vacaciones` · 12 `SUELDO ASIMILADO` · **14 `*TOTAL* *PERCEPCIONES*` = el BRUTO a distribuir** · 26 `Fondo de ahorro` (columna Z, capa futura) · 36 `*NETO*`.

**Reglas refinadas (cruce Excel↔Odoo + decisiones Esteban 2026-07-16):**
- **BRUTO, no neto:** se distribuye **col 14 `TOTAL PERCEPCIONES`** (bruto). El neto tiene rebajes (infonavit, préstamos) que reducirían falsamente el costo del proyecto; el bruto es el costo real de MO. *(Carga patronal del empleador = capa futura, ENCIMA del bruto.)*
- **Asimilado = col 12 > 0** → 100% bolsa **513**, sin horas ni empleado (tag col-12). Juan De La Cruz `017` + Juana Camarillo `018`. Se crean como `hr.employee` igual (decisión), pero el tag los rutea aunque no chequen.
- **Vacaciones = cols 9/10 > 0** → **bolsa de vacaciones = Administración 513** (NO proyecto: el gasto es administrativo, pagamos los días pero no cargan a obra). Sin horas + vacaciones → 100% a 513. *(Futuro: bolsa dedicada de vacaciones + split de vacación parcial como Luis Ángel.)*
- **Flag por-empleado `solo_bolsa` (NO override por depto):** puro escritorio/ventas (**Rissia, Pablo**, Aldo, Arturo, Ana Laura, Magaly, Gerardo, Erick, Eduardo, y supervisores que no checan como **Pedro `080`**) → 100% a su bolsa, ignoran checkout. **Roles de campo** (Ops técnicos, **Felipe**, aux de compras, choferes, y comercial-de-campo como **Francisco Montalvo** — sí apoyó Topo Chico) → distribuyen por horas de checkout. Default = respeta checkout; el flag fuerza bolsa. Esteban fija el flag por empleado.
- **Sin checar + sin vacaciones + no asimilado + no solo_bolsa → COLA DE EXCEPCIÓN** (ausencia real = "se rebaja"; o asignación manual si es **USA/Brasil sin checador** — ej. Ricardo esa semana en USA, Marcus en Brasil). Nunca se distribuye a ciegas.
- **Trío:** monto = col 36 (NETO) de su fila manual (para vendors = su costo bruto, sin rebajes de nómina), repartido por sus horas de kiosk. **Pendiente: umbral mínimo de horas** (<2h → a default/excepción, no anclar 100% por un checkout trivial).
- **Miriam (emp 148):** **archivar `hr.employee` (active=False)**, el user 25 (`miriam@fts.mx`) queda.
- **Código sin empleado** → **validación dura #1 ABORTA** el run. `080` resuelto = **Pedro Arturo Hernández (supervisor comercial)**, mapear/crear + `solo_bolsa`→608.

## Dry-run SEM 28 — VALIDADO FINAL (bruto real × peso real, 2026-07-16)
Ventana VIE 03→JUE 09-jul (⚠️ VIE 03 sin confirmar → excluido; regla de timing). **Sum-control: total distribuido $196,230.82 = percepciones $177,778.56 + trío $18,452.25 → diferencia $0.01 (redondeo). ✅ CERO excepciones.**
| Destino | Monto MO |
|---|--:|
| SO11547 Topo Chico | 69,015.81 |
| SO9428 Vertiv 2da | 41,098.11 |
| bolsa 608 VENTAS | 35,732.18 |
| bolsa 513 ADMIN (incl. asimilados + vacaciones) | 27,142.77 |
| bolsa 768 LEGAL | 6,562.50 |
| bolsa 478 RH | 5,833.31 |
| bolsa 3096 ADMIN-OPS | 4,413.75 |
| SO10300 Magnekon | 3,648.39 |
| SO11551 Chiller | 2,784.00 |
**Casos:** Ops multi-destino (Gibrán 25/25/50, Jésus M 75/25, Tomas V 75/25, Ramiro 75/25) · Francisco→Topo (campo) · Rissia/Pablo→608 (solo_bolsa) · asimilados+Juan Manuel(vac)→513 · trío Carlos→Vertiv, Felipe→25/50/25. **Pendiente confirmar:** Luis Ángel (comercial con 1 día Magnekon + vacación parcial — hoy respeta checkout).

## Apéndice — Detalle Budenheim/HMI (las 11 líneas post-cierre de Audit D)
Para el veredicto de Felipe (garantía vs mala atribución). **Conclusión: NINGUNA es mano de obra** — son facturación (ingreso) + un bill de material + una entrada de flujo. El distribuidor no las toca.

**Cuenta 1089 (SO11471 Budenheim, stage 13) — 9 líneas:**
| Línea | Fecha | Monto | Concepto | Origen | move |
|--:|---|--:|---|---|---|
| 56377 | 2026-06-11 | +42,335.70 | Ampliacion mezanine | **invoice** (ingreso) | INV1999 |
| 56379 | 2026-06-11 | +13,355.40 | Instalación escalones | invoice | INV1999 |
| 56381 | 2026-06-11 | +7,500.00 | Calculo estructural | invoice | INV1999 |
| 56383 | 2026-06-11 | +22,888.80 | Fabricación conveyor rodillos L4 | invoice | INV1999 |
| 56385 | 2026-06-11 | +125,943.00 | Conveyor curvo motorizado L4 | invoice | INV1999 |
| 56387 | 2026-06-11 | +40,630.20 | Instalación eléctrica conveyor | invoice | INV1999 |
| 56389 | 2026-06-11 | +26,555.10 | Modificación profundidad fosa L4 | invoice | INV1999 |
| 58600 | 2026-07-01 | −8,652.00 | LONA ANTICHISPA 3X3 MTS | **vendor_bill** (material) | BILL2956 |
| 58602 | 2026-07-01 | −1,384.32 | IVA(16%) COMPRAS | vendor_bill | BILL2956 |

→ 7 líneas = la **factura de venta** de SO11471 (ingreso, GL 401.01.01) + 2 = **bill de material** (lona + IVA, GL 601.84.01/119.01.01). **Cero labor.** Rubro 1177 = ninguno. El único punto para Felipe: ¿el bill de lona del 1-jul (material tardío) debe seguir cargando a un proyecto en cobranza? (menor).

**Cuenta 555 (SO7723 HMI Magnekon, stage 13) — 2 líneas:**
| Línea | Fecha | Monto | Concepto | Origen | move |
|--:|---|--:|---|---|---|
| 56392 | 2026-06-11 | +209,256.30 | INV1982 - BNK1/2026/0062 | **other** (flujo) | CBMX/2026/0636 |
| 56391 | 2026-06-11 | −209,256.30 | INV1982 - BNK1/2026/0062 | other (flujo) | CBMX/2026/0636 |

→ Par que **se cancela (neto $0)** = asiento de base imponible IVA-flujo por la **cobranza** de INV1982 (GL 899.01.99), rubro 1171 Ingreso. **Cero labor, impacto neto cero.**

**Veredicto para el spec:** la regla DURA (stage 13 → cola de excepción) se mantiene como **guarda hacia adelante** para MO futura; estas 11 líneas existentes NO son labor mal atribuida, así que **no hay nada que corregir retroactivamente** — Felipe solo confirma el bill de lona (BILL2956).

---

## Puntos de decisión — CERRADOS (Esteban, 2026-07-16)
1. **Subida:** página simple en FTS Suite (patrón kiosk); **V1 la usa solo Esteban**, Ulises en V1.1.
2. **Parseo:** en cliente con **SheetJS** (ya vive en el IPERC) → JSON al webhook. n8n NO toca binarios.
3. **Asignación manual de la semana:** **DIFERIDA a V1.1.** Cascada V1 = solo `default → cola de excepción` (sin el paso 1 manual). El paso manual queda documentado como futuro.
4. **Escritura:** `analytic.line` **standalone** (sin asiento). La contabilidad fiscal vive en CONTPAQi; Odoo analítico = gestión.
5. **Columna budget plan 2:** ✅ **VALIDADO (canary 2026-07-16):** `budget.line` con `x_plan2_id`=bolsa **sí** lee la `analytic.line` — `achieved_amount = -500` con `budget_amount = -1000`, signo correcto. IDs de prueba `{bid:405, bl:2521, al:59925}`, limpieza `0,0`. El nodo `Odoo - CREATE` del workflow `j0V9wfpuPTLFO9DZ` (que usa `x_plan2_id` para bolsas / `account_id` para proyectos) queda **DEFINITIVO**.

## 🎯 Go-live V1 — target viernes 24-jul (SEM 29)
- **Prerequisitos de Esteban (ver `FASE2_SCRIPTS_F12.md`):** campo `x_studio_codigo_contpaqi` + poblado, campo `x_studio_solo_bolsa`, crear Pedro/Juan/Juana, archivar Miriam 148, montos reales de los 6 budgets de bolsa + 6 líneas 1177 de proyecto.
- **Día del run (vie 24-jul):** (1) confirmar SEM 29 completa; (2) subir Excel por la página → DRY-RUN → validar sumas; (3) **cutover `unlink [47,48,9]`** previa verificación de cuál está vivo; (4) activar `j0V9wfpuPTLFO9DZ` + POST `confirm_write:true` → read-back; (5) desactivar.
- **Sin incógnitas técnicas abiertas:** motor validado SEM 28 ($0.01, 0 excepciones) + canary budget plan-2 PASADO.

## Visión de conciliación (V1.1+, backlog — NO V1)
Flujo bancario real (contexto Esteban): **BBVA México (principal) → fondea → BBVA Nómina → dispersa** a empleados los viernes. La cuenta BBVA Nómina se mantiene en ceros salvo el monto de la semana (control anti-mal-manejo).
- **Meta futura:** Excel → asignar gasto MO a cada bolsa/proyecto → **conciliar la salida BBVA México→Nómina→dispersión contra esos gastos asignados**.
- ⚠️ **Dependencia:** para conciliar, esos movimientos bancarios **deben existir en Odoo primero** — hoy NO están (`account.move.line [GL 102.01.00008]` = 0 en 2026; la dispersión vive solo en el banco). La conciliación V1.1 requerirá **importar el movimiento bancario a Odoo** (o conciliar fuera). Fuera de alcance V1.

## ⚠️ Regla de timing crítica (hallazgo del dry-run SEM 28)
El motor SOLO cuenta horas con `manager_approval=true`. En SEM 28, **el VIERNES 03-jul (26 attendances) estaba SIN confirmar** → habría quedado EXCLUIDO. **Invariante:** el distribuidor NO debe correr hasta que Felipe confirme la semana completa VIE→JUE. El run del viernes debe **gatear sobre "semana 100% confirmada"** (o reportar las jornadas sin confirmar como bloqueo, no distribuirlas). Ver dry-run.
