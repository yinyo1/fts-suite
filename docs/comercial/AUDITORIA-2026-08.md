# Módulo Comercial — Auditoría del estado actual (Sesión 0)

**Fecha:** 2026-08-29 · **Rama:** `claude/comercial-sesion-0-nudc9g` · **Alcance:** solo lectura fuera del repo (MCP n8n, MCP Odoo, Railway, GitHub API).
**Documento rector:** [`ROADMAP.md`](ROADMAP.md) (issue #127). **Propuesta derivada:** [`PROPUESTA-1.0.md`](PROPUESTA-1.0.md).

Convención: lo que no se pudo verificar contra el artefacto real está marcado **SUPUESTO**. Timestamps en UTC con CST (UTC−6) al lado donde aplica.

---

## Resumen ejecutivo (5 hallazgos que cambian el plan)

1. 🔴 **El MVP del PR #89 nunca entró a producción.** Los 3 workflows n8n (`comercial/watchdog-enviadas`, `comercial/captura`, `comercial/pipeline`) siguen `active:false`, `triggerCount:0`, sin una sola edición desde su creación (2026-07-16, ~6 semanas). El checklist manual (`comercial/CHECKLIST-MANUAL.md`) está pendiente COMPLETO. El frontend en Pages apunta a webhooks muertos.
2. 🔴 **La card del launcher está bloqueada para todos los usuarios no-master** — contradice SUPUESTOS.md §LAUNCHER. `shared/modules-registry.js` ya tenía la entrada `comercial` (placeholder pre-MVP) y los 5 usuarios de `users-suite.json` tienen `comercial.acceso:false` → solo `ftsmaster` ve la card activa.
3. 🔴 **La data de Odoo está más sucia de lo que asumía el plan:** 1,173 de 1,859 leads activos (63%) viven en la etapa "CANCELADO" sin archivar; 331 leads con `x_studio_dndole` de ex-FTS (Angel 164, Yusti 98, Diego 61, Bethania 8); 62% de leads en el usuario genérico `Sales FTS`; 12 etapas con 4 variantes de "cotización" y 2 de "ganado" (una sin `is_won`). El "paso cero de limpieza" del ROADMAP es más grande que una tarde.
4. 🟢 **Sí existe Postgres en Railway** (proyecto de n8n `cheerful-comfort`, servicio `Postgres`, 2.06 GB disco, CPU idle). El esquema `comercial` puede nacer ahí con costo marginal ~$0.
5. 🟡 **Dos limitaciones de auditoría a resolver:** los workflows n8n tienen `availableInMCP:false` (el MCP solo da metadata de listado, no nodos ni ejecuciones) y `base.automation`/`ir.cron` están fuera de la allowlist del MCP de Odoo → el detalle nodo-por-nodo y el inventario de automatizaciones Odoo quedan como SUPUESTO/no-verificable hasta habilitar acceso o revisar en UI.

---

## a) Código en el repo

### a.1 Inventario

```
comercial/
├── index.html             SPA mobile-first (login + tab Captura + tab Mi Pipeline)
├── js/comercial-client.js cliente de webhooks /comercial/* (JWT body + HMAC dispositivo)
├── SUPUESTOS.md           14 supuestos del MVP (decisiones autónomas documentadas)
├── CHECKLIST-MANUAL.md    8 pasos manuales de Esteban para el go-live (~15 min) — NO ejecutado
├── ROADMAP.md             deuda del MVP (9 items) + diseño watchdog v2 — pre-#127, subordinado al rector
├── baseline.md / .json    análisis 12m de sale.order (snapshot 2026-07-16)
└── tests/
    ├── hmac-interop.test.js       12/12 (JS puro n8n vs node:crypto)
    └── watchdog-enviadas.test.js  15/15 (lógica Code-MAIN vs data real)
shared/comercial/watchdog_enviadas.json   config viva del watchdog (canary:true, umbrales 4/6, fx 17.35)
```

- **`comercial.html` en la raíz NO existe** — el módulo vive en `comercial/index.html`, como el resto del Suite.
- **PR #89: MERGEADO** el 2026-07-16 23:22 UTC (squash `7840226`, 11 archivos, +1470/−3, rama `feat/comercial-mvp` borrada). Entró TODO lo listado arriba + los 3 workflows n8n creados INACTIVOS. Lo que NO entró (quedó como deuda documentada en `comercial/ROADMAP.md`): identidad por persona, campos FTS-4 en Studio, watchdog v2, dashboard con roles, puerta marketing, rate limiting.
- **Cero commits sobre `comercial/` después del #89** (verificado vía GitHub API; el clone local es shallow). La config sigue `canary:true` / `recipients.equipo:[]` y no hay evidencia en el repo de que los pasos 1–6 del checklist se hayan ejecutado.

### a.2 Reutilización vs duplicación (comparativa con Finanzas y RH)

`comercial/index.html` carga exactamente 3 recursos: `../shared/fts-styles.css`, `../finanzas/js/auth-fin.js`, `js/comercial-client.js`.

| Módulo | Auth | Cliente | Sesión |
|---|---|---|---|
| Finanzas | `FinAuth` server-side (JWT n8n, PBKDF2) | `fin-client.js` (token en body) | `localStorage['fts_fin_session']` |
| RH (`modulos/rh/`) | `FTSAuth` client-side (`shared/auth-suite.js` + `users-suite.json`, hashes sin salt) | fetch directo | sesión FTSAuth propia |
| **Comercial** | **Reusa `FinAuth` por referencia** + HMAC de dispositivo propio | `comercial-client.js` (clon estructural de `fin-client.js`) | **la MISMA `fts_fin_session` de Finanzas** |

Comercial sigue el patrón Finanzas (el correcto según el ROADMAP), con dos costos: **entrar a Comercial = quedar logueado en Finanzas** (misma sesión y password → dar acceso a Comercial es dar Facturas/Bills) y lockout compartido.

**Duplicaciones detectadas:**
1. Umbrales de semáforo **4/6 en 3 lugares**: `shared/comercial/watchdog_enviadas.json` (config viva), el workflow `comercial/pipeline` (manda `semaforo` calculado) y `comercial/index.html` L228 (fallback hardcodeado que NO lee el config). Consciente y comentado, pero se desincroniza en silencio si cambian los umbrales del JSON.
2. `n8nBase()` copiada de `auth-fin.js` (patrón repetido en todo el Suite, cosmético).
3. La lógica del watchdog replicada en el test **sin gate anti-divergencia** (si alguien edita el nodo n8n, el test no lo ve — mismo riesgo que resolvió `motor-v2.js` en Carga MO §19, aquí sin plantilla única).
4. FX 17.35 en config + pipeline + test.

### a.3 Launcher y acceso

- Card: `index.html` raíz L134-138 — `<a id="card-comercial" href="comercial/index.html" class="mod-card active">`, badge "MVP".
- Gating: `index.html` L366-380 itera `MODULES_REGISTRY` y bloquea (opacity .4 + `pointerEvents:none` + 🔒) toda card sin `modulos[mod.id].acceso === true`; `shared/modules-registry.js:47-53` contiene `{ id:'comercial', cardId:'card-comercial', ... }` **desde antes del MVP** (2026-04-14; PR #89 no tocó el registry).
- `shared/users-suite.json`: los 5 usuarios no-master (felipe.perez, ana.acevedo, monty, Tere Ramos, caro.lugo) traen `"comercial": {"acceso": false}` → **solo `ftsmaster` ve la card activa**. SUPUESTOS.md §LAUNCHER ("la card queda visible; el acceso lo controla el password") es falso para todo el equipo.
- La URL directa `…/comercial/` NO pasa por FTSAuth: el único gate real ahí es el login de Finanzas. Es decir, hoy hay un doble gate accidental para el equipo (FTSAuth para la card + password Finanzas para entrar) que nadie decidió.

### a.4 Deuda

- **Higiene buena:** cero secretos, cero TODO/FIXME, cero IDs numéricos literales en el repo. Única URL hardcodeada: `N8N_DEFAULT` (patrón estándar del Suite, con override por localStorage).
- **Hardcodes conscientes (viven en n8n, no en el repo, documentados en SUPUESTOS.md):** `sub:'finanzas'` del JWT (→ 100% de leads al fallback Esteban), `DIRECCION_USER_IDS=[2]` en pipeline (→ devuelve todo sin filtrar, siempre). Son el anti-patrón §13 de CLAUDE.md, asumidos como v1.
- **Webhooks:** `/comercial/captura` = JWT + HMAC + anti-replay ±10 min (el mejor protegido del Suite). **`/comercial/pipeline` = solo JWT, sin HMAC** (lectura; un token filtrado da el pipeline completo). Sin rate limiting en captura. El watchdog no expone webhook.
- **Código muerto:** ninguno dentro de `comercial/` (todo lo commiteado es coherente con el MVP); lo "muerto" es el conjunto entero por no estar activado. No se borra nada en esta sesión (regla de la sesión 0).
- **localStorage keys:** `fts_comercial_hmac` (secreto de dispositivo), `ops_n8n_url`/`n8n_url`, y vía auth-fin `fts_fin_session` compartida.

---

## b) Workflows n8n (solo lectura)

> ⚠️ **Limitación dura:** todos los workflows tienen `availableInMCP:false` → el MCP rechaza `get_workflow_details`/historial/ejecuciones por-workflow, y este contenedor no tiene la API key del API público. Lo verificado EN VIVO es la metadata de `search_workflows`; el detalle de nodos viene de la documentación del repo ([REPO] = spec/snapshot, no read-back). Para auditar nodos de verdad: habilitar "Available in MCP" por workflow en la UI.

### b.1 Tabla de estado (en vivo, 2026-08-29)

| Workflow | ID | `active` | Trigger | Odoo LEE | Odoo ESCRIBE | HMAC/JWT | customResource | Última ejecución |
|---|---|---|---|---|---|---|---|---|
| `comercial/watchdog-enviadas (T2 canary)` | `hJNTUd8E57W4rfjU` | ❌ false | Schedule `45 14 * * 1-5` UTC (=08:45 CST) + Manual [REPO] | `sale.order` (sent, 365d, co {1,6}) | nada (correo Graph a Esteban) | N/A (sin webhook) | **SUPUESTO: en blanco** (checklist paso 2 nunca corrido; `updatedAt` congelado) | ninguna (nunca activo; historial no consultable) |
| `comercial/captura (T3)` | `tEra7MVCvnWjAqjR` | ❌ false | Webhook POST `/comercial/captura` [REPO] | `res.users` (lookup sub) | **`crm.lead` CREATE** — solo campos nativos (name, partner_name, expected_revenue, user_id fallback Esteban, description); cero `x_studio_*`; sin `stage_id` | **JWT (body) + HMAC dispositivo** `x-fts-signature`, cadena `v1\|…\|ts`, anti-replay ±10 min | SUPUESTO: en blanco (2 nodos) | ninguna; no existen leads `[TEST-CC]` — e2e jamás probado |
| `comercial/pipeline (T3)` | `60ZLskz1xJ7nU5kt` | ❌ false | Webhook POST `/comercial/pipeline` [REPO] | `res.users`, `crm.lead` (180d), `sale.order` (sent) | nada | **solo JWT** (sin HMAC); gate dirección hardcode `[2]` | SUPUESTO: en blanco (3 nodos) | ninguna |
| `crear-proyecto-al-confirmar - BUDGET DEV` | `u7Ni2cRAxu3zfBid` | ✅ **true** | Schedule cada 5 min | `sale.order` (state=sale, sin proyecto, co {1,6}, ≥2026-05-01), `project.project` | `sale.order` (`x_studio_project_created`, `project_id`, `x_studio_project_id_created_1`, `x_studio_intentos_proyecto/_error`), `account.analytic.account` CREATE, `project.project` CREATE, `budget.analytic`+`budget.line` CREATE | N/A | llenos de facto (validado e2e 2026-06-17) | no consultable por MCP; evidencia de vida = proyectos/AAs recientes en Odoo |
| `sale/crear-proyecto-al-confirmar` (legacy) | `XhuTlvPKDBjkDeso` | ❌ false | — | — | — | — | — | candidato a borrar (§17 CLAUDE.md), sigue sin borrarse |

- Búsqueda exhaustiva (`comercial`, `crm`, `lead`, `pipeline`, `venta`, `cotiza`, `sale`, `confirmar`, `watchdog`): **no hay más workflows comerciales**.
- Hallazgo colateral fuera de alcance: `fin/watchdog-captura` se llama "(INACTIVO — pendiente publicar Esteban)" pero su flag es `active:true` — contradicción nombre↔estado a revisar en otra sesión.
- El watchdog al activarse requiere `Settings → Timezone = UTC` a mano (si no, el default de la instancia America/New_York lo corre 06:45 CST) y su señal `write_date` tiene caducidad silenciosa (60/122 enviadas comparten `write_date` exacto por escrituras masivas) — watchdog v2 con `mail.message` ya está diseñado en `comercial/ROADMAP.md` §3.

### b.2 Diagrama (frontend ↔ n8n ↔ Odoo)

```
        GitHub Pages: comercial/index.html
        (FinAuth JWT 8h · fts_fin_session COMPARTIDA con Finanzas)
        └ comercial-client.js
            │
            ├ POST /webhook/comercial/captura   {payload, token} + x-fts-signature(HMAC ±10min)
            │      └▶ comercial/captura ❌ INACTIVO
            │           Validar JWT+HMAC → READ res.users → CREATE crm.lead (fallback Esteban)
            │
            └ POST /webhook/comercial/pipeline  {token}  [solo JWT]
                   └▶ comercial/pipeline ❌ INACTIVO
                        READ res.users + crm.lead(180d) + sale.order(sent) → cards con semáforo

        Cron 08:45 CST L-V ▶ comercial/watchdog-enviadas ❌ INACTIVO
            config: shared/comercial/watchdog_enviadas.json (raw main, en vivo)
            READ sale.order(sent) → semáforo 4/6d por write_date → Graph mail a Esteban (canary)

        Cron cada 5 min ▶ crear-proyecto-al-confirmar ✅ ACTIVO  (u7Ni2cRAxu3zfBid)
            SO confirmada → AA(plan 1/18) + proyecto + budget(plan 20) + link SO
            + correo handoff a newordersnotification@fts.mx
            [legacy XhuTlvPKDBjkDeso inactivo, pendiente borrar]
```

Encaje: **captura** siembra `crm.lead` (arriba del funnel) → **pipeline** lee lead+SO enviadas (medio) → **watchdog** vigila enviadas estancadas (correo) → **crear-proyecto** toma el relevo al confirmar la SO (state=sale) y dispara proyecto+analítica+budget+handoff. Los 3 primeros están construidos pero apagados; solo el último opera.

---

## c) Odoo (solo lectura, MCP FTS_Odoo, 2026-08-29T14:59 UTC = 08:59 CST)

Universo: **1,859 leads activos** · 10,464 sale.orders totales. JSON crudos completos en el reporte del pase (query por query); aquí lo esencial.

### c.1 Campos `x_studio_*` que usa/usaría comercial

**En `crm.lead` (18 campos x_studio):**

| Campo | Tipo | Llenado en activos (base 1,859) |
|---|---|---:|
| `x_studio_fuente_del_lead` | selection | 1,115 (60.0%) |
| `x_studio_tipo_de_cliente_prospecto` | selection | 925 (49.8%) |
| `x_studio_tipo_de_proyecto` | selection | 780 (42.0%) |
| `x_studio_dndole` | selection | 714 (**38.4%**) |
| `x_studio_prioridad_condicion` | selection | 645 (34.7%) |
| `x_studio_probabilidad_fts` | integer | 549 ≠0 (**29.5%**) |
| `x_studio_deadline_de_envio` | date | 547 (**29.4%**) |
| `x_studio_excel_sharepoint_` | text | 234 (12.6%) |
| `x_studio_estatus_de_operaciones_1` | selection | 14 (0.8%) — **muerto** |
| `x_studio_notas_cortas` | char | 1 (0.05%) — **muerto** |
| `probability` (nativa, referencia) | float | 1,850 ≠0 (99.5% — auto-computada; convive con la manual FTS al 29.5%) |

- ⚠️ **`x_studio_cotizador` y `x_studio_nombre_archivo_xlsx` NO existen en `crm.lead`** — viven en `sale.order`.
- ⚠️ Par duplicado en lead: `x_studio_purchase_order` ("Purchase Order:") vs `x_studio_purchase_order_` ("Purchase Order :").

**En `sale.order` (116 campos x_studio — modelo muy cargado de Studio: bloques de comisiones por persona, ~30 `seccion_N_qty_*`, fletes, y los de la automatización §17):**

| Campo | Existe | Llenado (base 10,464) |
|---|---|---:|
| `x_studio_cotizador` (selection) | ✅ | 545 (5.2%) — valores: Angel **234** (ex-FTS), Aldo 229, Monty 70, Ricardo 11, Marcus 1 |
| `x_studio_nombre_archivo_xlsx` (char) | ✅ | 709 (6.8%) |
| deadline (`x_studio_deadline_*`) | ❌ no existe en SO | — |
| probabilidad | ❌ no existe en SO | — |

### c.2 Etapas de `crm.lead` (12) con conteo de activos

| id | Etapa | seq | is_won | Leads activos | Diagnóstico |
|---:|---|---:|---|---:|---|
| 20 | Adiccionales Topo (Monty) | 0 | | 4 | caso especial de UN cliente, pintada PRIMERA en kanban |
| 17 | Prospecto Lead | 1 | | 27 | |
| 15 | Lead Calificado/Por cotizar | 2 | | 26 | |
| 5 | Cotizacion Enviada | 3 | | 32 | |
| 21 | Qualified | 4 | | 9 | **duplica** "Lead Calificado" (default Odoo en inglés) |
| 8 | Proyecto Ganado | 5 | ✅ | 530 | |
| 9 | **CANCELADO** | 6 | | **1,173 (63%)** | anti-patrón: cancelados como etapa, sin lost/archivar — contaminación #1 |
| 4 | Proyecto Ganado - Con PO | 7 | ❌ | 2 | redundante con id 8 y **sin `is_won`** → no cuenta como ganado en reportes |
| 14 | Pendiente Por Enviar | 8 | | 2 | redundante (cotización) |
| 18 | Revisar | 9 | | 34 | |
| 3 | Cotizacion... | 10 | | 4 | nombre basura, redundante |
| 12 | Cot Enviada Mdlz | 11 | | 16 | fork por cliente (Mondelez), redundante |

4 variantes de "cotización" + 2 de "ganado" + Qualified vs Lead Calificado; el orden de `sequence` está roto (etapas vivas después de CANCELADO).

### c.3 `x_studio_dndole` en leads activos

```
Aldo Mendez 239 · Angel 164 · Yusti 98 · Montalvo 91 · Diego 61 · Esteban 51 · Bethania 8 · Oscar 1 · Ricardo 1 · (sin valor) 1,145
```

**331 de 714 poblados (46.4%) apuntan a ex-FTS**: Angel 164, Yusti 98, Diego 61, Bethania 8. El selection sigue ofreciendo a gente que ya no está (también en `x_studio_cotizador` de SO: Angel #1 con 234).

### c.4 Atribución por `user_id` (activos)

```
Sales FTS [12] 1,155 (62%) · Raymundo Morales [11] 384 · Usuario Taqueria JMZ [16] 81 (⚠ anomalía)
· OPERACIONES FTS-YIN [6] 73 · Esteban [2] 67 · Eduardo Lopez [15] 50 · (sin valor) 47 · Bethania [19] 1 · Tech Support [7] 1
```

Confirma el RIESGO-3 del baseline: la atribución real vive (a medias) en `x_studio_dndole`, no en `user_id`.

### c.5 Automatizaciones sobre crm.lead / sale.order

**NO VERIFICABLE por MCP**: `base.automation` está fuera de la allowlist y `ir.cron` en denylist dura. Errores crudos en el reporte del pase. Lo conocido por documentación (CLAUDE.md §17, NO re-verificado hoy): Automation Rules 56 (`account.move`) y 57 (`purchase.order`) — ninguna sobre crm/sale; del lado n8n, `u7Ni2cRAxu3zfBid` lee/escribe `sale.order` cada 5 min. **SUPUESTO:** no hay `base.automation` sobre `crm.lead`; pendiente confirmar en la UI de Odoo (Esteban) o ampliar la allowlist del MCP.

---

## d) Infra

### d.1 Postgres en Railway — SÍ existe

Verificado en vivo (MCP Railway):

- Proyecto **`cheerful-comfort`** (el de n8n): servicios `Primary` (n8n), `Worker`, `Redis`, **`Postgres`** (service id `9f5091f8-d2ff-47e9-bb61-7a99cb2ad312`, environment production).
- Métricas 24h del Postgres: disco **2.06 GB**, RAM ~0.35 GB (pico 1.23), CPU ~0.2% — sobrado de capacidad.
- **SUPUESTO:** ese Postgres es la base de datos de n8n (es el único en el proyecto de n8n; no se abrió conexión SQL desde esta sesión para confirmarlo — la sesión es read-only de infra).
- Proyecto aparte `content-determination` con el servicio `fts-mcp-odoo` (sin base de datos).
- Nota heredada (§14 CLAUDE.md): Worker + Redis son legacy del modo queue anterior, candidatos a apagar — siguen vivos.

**Recomendación (decisión de PROPUESTA-1.0 §2):** crear el esquema `comercial` (o mejor, una **database separada `comercial` con rol propio**) dentro del MISMO servicio Postgres. Costo marginal ≈ **$0** (Railway cobra por uso; el servicio ya corre y va sobrado). Un servicio Postgres aparte costaría ~**$5–10 USD/mes** (RAM+disco mínimos) y solo aporta aislamiento de blast-radius vs la DB de n8n; para 1.0 no lo justifica. Riesgo aceptado y mitigable: misma instancia que n8n → un incidente de la DB tumba ambos; mitigación = database+rol separados, backups propios (pg_dump programado desde n8n), y migrar a servicio dedicado si el volumen crece.

### d.2 Issues #122–#125 — estado y si bloquean

| Issue | Título | Estado | ¿Bloquea comercial 1.0? |
|---|---|---|---|
| #122 | `fts_correo_exportar` (correo con adjuntos vía Graph) | ABIERTO — workflow construido, rediseñado (envío desde sales@, SharePoint ComercialFTS con Sites.Selected); **bloqueado en Azure** (faltan `Mail.Read` + `Sites.Selected` + Access Policy) y falta `FTS_CORREO_KEY` en Railway | No para 1.0 (captura manual). SÍ para la **fuente correo** de la ingesta (1.x): sin Graph leyendo el buzón no hay evidencia por correo. Bonus: ya dejó apuntado el sitio SharePoint ComercialFTS (donde viven los ~347 machotes de 4.x). |
| #123 | HMAC + anti-replay en TODOS los webhooks n8n | ABIERTO, sin arrancar | No bloquea (comercial ya trae su propio HMAC de dispositivo en captura, el mejor del Suite), pero el ROADMAP §2 exige "toda escritura a Odoo por n8n con HMAC" → los workflows nuevos de 1.0 deben nacer con el patrón; cuando exista el sub-workflow `fts_auth_hmac` de #123, comercial migra a él para no divergir. |
| #124 | GitHub Action @claude + main protegida | ABIERTO, sin arrancar | No bloquea. Afecta el protocolo de trabajo (issues→PR), no el módulo. Ojo: main protegida cambiará el flujo de merge de los PRs de comercial. |
| #125 | `fts_archivos` (puente de binarios) | ABIERTO, depende de #122 y #123 | No para 1.0. SÍ habilita en 1.x/2.x: archivos de evidencia hacia SharePoint/Odoo y el PDF de propuesta. |

### d.3 Estado de los pasos manuales del checklist del MVP

| Paso | Estado | Evidencia |
|---|---|---|
| 1. Env `FTS_COMERCIAL_HMAC` en Railway | **SUPUESTO: no existe** | no verificable sin listar variables (evitado a propósito — regla de secretos); consistente con checklist nunca corrido |
| 2. Rellenar 6 `customResource` | **SUPUESTO: pendiente** | `updatedAt` de los 3 workflows congelado en el día de creación |
| 3. Activar 3 workflows + Timezone UTC | **Pendiente — VERIFICADO** | `active:false`, `triggerCount:0` en vivo |
| 4–6. Watchdog manual, aprovisionar dispositivo, e2e | **Pendiente** | sin leads `[TEST-CC]` en Odoo; sin commits de rollout |
| 7. Card launcher activa para el equipo | **Falso hoy** | `users-suite.json` con `acceso:false` ×5 (§a.3) |

---

## e) Cruces con otros módulos

| Sistema | Dependencia / impacto | Detalle |
|---|---|---|
| **Finanzas (JWT)** | 🔴 Dependencia dura | Comercial usa `auth/finanzas-login` (`ykNzGCvdjzjdXYhc`) y `auth-fin.js` tal cual: mismo password, misma sesión (`fts_fin_session`), mismo lockout. `sub:'finanzas'` fijo → sin identidad por persona no hay atribución (bloqueante #1 del ROADMAP). Cualquier cambio al contrato del JWT de Finanzas rompe Comercial (y viceversa: abrir usuarios comerciales en ese issuer toca el login de Finanzas). |
| **Finanzas (cobranza)** | Informativa (futuro) | El ciclo post-venta (facturas/cobranza de las SOs ganadas) vive en `fin/facturas-odoo` + `fts_cobranza`. Comercial 1.0 no lo toca; 4.x podría cruzar win-rate vs cobrado. Cero acoplamiento de código hoy. |
| **RH (rol por parent_id)** | Ninguna hoy; opción futura | `panel/derivar-roles` (`f59LMsbjPmO8pzWu`) deriva roles por jerarquía Odoo. Comercial NO lo usa (su "rol dirección" es el hardcode `[2]` del pipeline). Cuando haya identidad por persona, derivar "dirección/vendedor" vía ese patrón en lugar de listas blancas es el camino ya validado por el Suite. |
| **Kiosk (SO en checkout)** | Cero acoplamiento de código; dependencia de DATOS | El kiosk escribe `hr.attendance.x_studio_sales_order_2` (SO del turno) — consume las SO que comercial confirma, vía Odoo. Ninguna referencia cruzada a los webhooks `/comercial/*`. Todo el "comercial" que aparece en kiosk/nómina/horarios es el *departamento* Comercial (dept 6), falso amigo. |
| **Workflow confirmación SO** | 🔴 Frontera crítica del módulo | `u7Ni2cRAxu3zfBid` (ACTIVO, cada 5 min) es hoy el "handoff 3.x de facto": SO confirmada → AA + proyecto + budget + correo. El ROADMAP 3.x lo REEMPLAZA por un disparo síncrono desde la suite que consuma el machote congelado. Regla de transición: mientras 3.x no exista, **nada de 1.x/2.x debe romper sus precondiciones** (domain: `state='sale'`, `x_studio_project_created=False`, co {1,6}, `date_order>=2026-05-01`, monto ≥ $0.01; campos handoff `x_studio_fecha_inicio/fin_deseada`, `x_studio_purchase_order_*`, `x_studio_proyect_description`). La salida a SO del machote (2.x) DEBE poblar esos campos o el handoff sale cojo. |
| **Semáforo operativo (§18)** | Solo nombre compartido | `sla_stages.json` trae `comercial_whitelist_partner_ids:[306]` — es del watchdog de proyectos, no de este módulo. (Colateral detectado: sus snapshots registran un error `Cannot read properties of undefined (reading 'comercial_whitelist_partner_ids')` — bug del semáforo, reportar aparte.) |

---

## Anexos

- Reportes crudos del pase (n8n / Odoo / repo) generados en la sesión 0; los JSON crudos de Odoo (describe, agrupados, conteos) están citados en §c.
- `comercial/baseline.md` (2026-07-16) sigue siendo la referencia cuantitativa del funnel: 42.6 cotizaciones/mes, win rate 30.1%, ciclo mediana 11.5d, y los riesgos RIESGO-1 (moneda), RIESGO-2 (write_date), RIESGO-3 (atribución) — los tres re-confirmados por esta auditoría con data fresca.
