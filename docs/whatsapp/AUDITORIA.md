# Memoria de FTS / WhatsApp — Auditoría (Sesión 0)

> **Solo lectura.** No se creó ningún servicio ni credencial, no se ejecutó DDL, no se tocó
> Odoo y no se activó ningún workflow. Fecha de las mediciones: **2026-09-28**, entre las
> 06:20 y las 06:45 UTC (= 00:20–00:45 CST del lunes, fuera de horario laboral).
>
> Leyenda de evidencia: **[MEDIDO]** = leído en vivo en este turno (Railway MCP, Odoo MCP
> read-only o GitHub) · **[REPO]** = visto en código, SQL o JSON del repo · **[DOC]** = lo
> afirma un documento del repo y no se re-verificó en vivo.
>
> ⚠️ **Límite de la auditoría:** esta sesión **no tiene el MCP de n8n** conectado. Todo lo de
> n8n sale del repo y de los issues, no de la instancia. Las tres lagunas que eso deja están
> en §2.4.

---

## 1. Postgres en Railway

### 1.1 Servicios [MEDIDO — Railway `describe-environment`, proyecto `cheerful-comfort`, entorno `production`]

| servicio | id | imagen | volumen | uso de disco (7 d) | qué es |
|---|---|---|---|---|---|
| **`fts-suite-db`** | `26d65170-10f3-4d3e-9661-61ed6c89e3e0` | `postgres:17-alpine` | `fts-suite-db-data` 5,000 MB | **0.187 GB** (máx. 0.187) | El almacén de la suite. Aquí va `memoria` |
| `Postgres` | `9f5091f8-d2ff-47e9-bb61-7a99cb2ad312` | `postgres-ssl:16` | `postgres-volume` 5,000 MB | **3.61 GB** (máx. 3.64) | Base **de n8n**. No se toca |
| `Primary` | `b5168f3e-…` | `n8nio/n8n` | — | — | n8n (webhooks + MCP), último deploy 2026-09-08 |
| `Worker` | `ef4110d9-…` | `n8nio/n8n` | — | — | `latestDeployment: null` — **nunca desplegado** (igual que lo midió #250) |
| `Redis` | `b2be579f-…` | `railwayapp/redis` | 500 MB | — | Para modo cola, sin uso |

- **No hay buckets** en el entorno (`buckets: []`) [MEDIDO].
- `fts-suite-db` **no tiene dominio público ni proxy TCP** (`serviceDomains: []`,
  `tcpProxies: []`) [MEDIDO]: sólo se alcanza por red privada. Correcto.
- Variables de `fts-suite-db` (sólo nombres, no se leyeron valores a propósito): `PGDATA`,
  `POSTGRES_DB`, `POSTGRES_INITDB_ARGS`, `POSTGRES_PASSWORD`, `POSTGRES_USER` [MEDIDO].
- El otro proyecto con servicios de FTS, `content-determination`, sólo tiene `fts-mcp-odoo`
  y **ningún Postgres** [MEDIDO].
- 📌 Hallazgo al margen (se anota, no se persigue — CLAUDE.md §8): la base **de n8n** usa
  **3.6 de 5 GB (72 %)**. No bloquea esta sesión; va al backlog.

### 1.2 Esquemas, tablas y roles de `fts-suite-db` [REPO — `db/migrations/comercial/001…009`]

No se consultó la base en vivo (no hay credencial en esta sesión, y leer las variables de
Railway habría traído `POSTGRES_PASSWORD` en claro al transcript — CLAUDE.md §9).

| esquema | tablas | estado |
|---|---|---|
| `public` | `schema_migrations` (version, nombre, sha256, aplicada_at, aplicada_por) | aplicada |
| `comercial` | `evidencia`, `propuesta`, `expediente` (002) · `machote`, `machote_version` (003) · folio (004) · `machote_prestamo` (005) · `machote_cesion` (006) · `politica_aprobacion`, `compuerta_envio` (007) · `handoff`, `confirmacion` (008) · `documento_orden` (009) | **001–005 aplicadas** con read-back [DOC: `ALMACEN.md:207-217`, `:468-470`]; **006–009: ningún documento del repo dice si están aplicadas** |
| `po_radar` | 12 tablas (`grupos_cliente`, `corpus_correo`, `corpus_adjunto` con `sha256`, `bitacora`, …) | **No aplicado.** Su DDL sólo existe en `docs/po-radar/ESQUEMA.sql`, no en `db/migrations/` [REPO]; `docs/po-radar/README.md:21` lo marca "pendiente de carga" |
| `prospeccion` | (padrón DENUE) | Migraciones **010–014 escritas y ninguna aplicada**, fuera de `main` [DOC: `prospector/HISTORIAL.md:876`] → **choque de numeración** con cualquier migración nueva (ver ARQUITECTURA §3.0) |

**Roles:** `fts_admin` (dueño, DDL, sólo lo usa `comercial/db-migrate`) y `comercial_app`
(NOLOGIN al nacer; SELECT/INSERT/UPDATE, **sin DELETE ni CREATE**) [REPO: `001:35-49`,
`db/README.md`]. Un rol por aplicación, cada uno sólo sobre su esquema.

**Cómo se aplican:** workflow `comercial/db-migrate` (`4hyzXjkr31h8DPPS`), una migración por
corrida, por SHA fijo del repo, con verificación de sha256 y read-back; nace inactivo y se
dispara a mano [DOC: `db/README.md`]. Numeración **global** entre carpetas.

**Lo que ya existe y toca a este frente:** `comercial.evidencia` tiene
`fuente IN ('manual','correo','teams','plaud','whatsapp')`, `texto_literal`, `hash` sha256
único, `odoo_lead_id` nullable (huérfanas) [REPO: `002:11-43`]. **Nada escribe en ella hoy**:
el webhook `comercial/evidencia` y la bandeja son sólo diseño [REPO: grep sin llamadas;
DOC: `docs/comercial/PROPUESTA-1.0.md` §3.5]. Es un solapamiento directo con la bitácora de
este frente → decisión D6 en ARQUITECTURA §11.

### 1.3 Respaldos

- **Respaldo propio: no existe.** [DOC: `docs/comercial/ALMACEN.md:309-313`] — *"Pendiente:
  no hay respaldo programado propio todavía. Mientras el almacén esté vacío no urge; antes de
  que entre el primer dato real, sí."* **El almacén ya tiene datos reales** (machotes con
  folio `COT-…` desde el 10-sep) y el pendiente sigue abierto. Ningún otro archivo menciona
  `pg_dump` ni un respaldo programado [REPO: grep]. (Que ya hay datos reales es [DOC]:
  `ALMACEN.md` y `PERMISO_TEMPORAL.md` describen machotes guardados desde el 9–10-sep; no se
  contó en la base.)
- **Backups de volumen de Railway:** Railway los ofrece (incrementales, pestaña *Backups* del
  servicio), pero **el MCP de Railway no expone si hay una programación configurada**, así
  que **no se pudo confirmar** que `fts-suite-db-data` tenga backups activos. Verificación
  manual para Esteban: servicio `fts-suite-db` → *Backups* (P5 del issue).
- **Copia fuera de Railway: ninguna.** Todo (base de n8n, almacén, volúmenes) vive en un solo
  proveedor y una sola región (`europe-west4`).

---

## 2. Workflows de n8n relacionados con ingesta, archivos y correo

### 2.1 Inventario [DOC/REPO — sin MCP de n8n en esta sesión]

| workflow | id | captura | dónde lo guarda | estado |
|---|---|---|---|---|
| `fts_correo_exportar` (#122) | `jHiDim2gmu7VMVaE` | Un mensaje de Outlook, su `.eml` y adjuntos vía Graph | SharePoint `ComercialFTS/…/Correos/{cliente}/` (planeado); reenvío desde el buzón de envío corporativo | Activo y *Available in MCP*, **bloqueado**: 403 en Graph y falta la variable `FTS_CORREO_KEY` (comentarios del 29-ago en #122). `docs/po-radar/README.md:44` dice que `Mail.Read` ya funciona desde el 31-ago; SharePoint seguía en 403 al 6-sep (`comercial/machote/js/respaldo.js:12`) |
| `fts_archivos` (#125) | — | — | — | **No existe.** Sólo el contrato en el issue |
| `po/radar-detectar (MVP)` | `sQ5GYhQTq1UHDt6Y` | Detecta órdenes de compra en el buzón cada 15 min | Dedupe en `$getWorkflowStaticData`; 2 Data Tables reservadas sin uso; **no usa Postgres** | Activo [DOC: `docs/po-radar/MVP-WORKFLOW.md:313-316`] |
| `captura-jeeves` | `PWEiA37CLfP6lMgg` | Movimientos bancarios (journal 61) | Odoo `account.bank.statement.line`; bitácora = mensaje `CBRUN` en el chatter | Activo |
| `pmo/chat-apply` | `G9mo4xkJKpbPDaT4` | Lenguaje natural → Claude → cambio al cronograma | **PUT a GitHub** de `pmo/index.html` | Activo (en el export) |
| incidencias `crear-olvido-*`, `resolver`, `kiosk/checkin` (auto-rescate) | `JLiuczUd61xVNp36`, `IRtG38Aknb5SW15h`, `Oc2ceMHX2O0L0y2X`, `a7mEjjdwIzzvomXs` | Incidencias de asistencia **con selfie** | **PUT a GitHub** de `shared/incidencias-asistencia.json` + TAG en Odoo | Activos |
| `rh/empleados-master/sync` | `5nzVRsCMlCZlq5s4` | Padrón `hr.employee` | **PUT a GitHub** de `shared/config/empleados-master.json` | Activo |
| `crear-proyecto-al-confirmar` | `u7Ni2cRAxu3zfBid` | Correo de handoff con PDF de la PO (≤3 MB) | Sólo correo; el PDF sale de `sale.order.x_studio_purchase_order_file` | Activo |
| `comercial/machote-guardar`, `machotes-leer`, `machotes-control`, `cotizacion`, `orden-crear` | `18FIeK835R6h96K3`, `Lze4jmkW9pg7Tvad`, `PLAw9IYGgMh0PRPL`, `dahVXA1NyF1AXfc4`, `0jun4SLxAPTtIkHf` | Machote, versiones, cotización | Postgres `comercial.*` (credencial `comercial_app`); el archivo de la PO a `ir.attachment` | Mixto; ver `ALMACEN.md` |
| `comercial/captura (T3)` | `tEra7MVCvnWjAqjR` | Lead rápido | Odoo `crm.lead` | Inactivo |
| DENUE padrón / vigilante (prospector) | `z7hMVcLRg9CHsuDX` / `Zjg3NhllpAU7peS7` | Padrón INEGI | Esquema `prospeccion` (no aplicado) | Vigilante inactivo |

**Data Tables de n8n en uso:** `suite_usuarios` (auth), `incidencias_media`
(`TbE4AcWBEVWg0icD`, destino actual de las selfies nuevas), `canary_largo_string`, y 2 de
po_radar sin uso [DOC].

**Credencial Microsoft:** una sola, `Microsoft Graph - sales` (`Mh5kBNduMzOl3nzT`), app-only.
Todo el correo pasa por ella [DOC: #122].

### 2.2 Patrón de persistencia que hay hoy (y por qué no sirve para la memoria)

Hoy hay **cinco lugares distintos** donde la suite guarda lo que captura:

1. **JSON en el repo público vía `PUT` a GitHub** — incidencias (con selfies), padrón de
   empleados, cronograma PMO, snapshots del semáforo.
2. **`staticData` de n8n** — dedupe de po_radar, lockout de login.
3. **Data Tables de n8n** — usuarios, media de incidencias.
4. **Odoo** (chatter, `ir.attachment`, campos binarios) — bancos, POs, handoff.
5. **Postgres `comercial`** — machotes.

Para la memoria sólo sirve el 5: los tres primeros no tienen joins ni transacciones ni
permisos por rol, y el 1 **publica** lo que guarda. Odoo no está hecho para una bitácora de
cientos de miles de mensajes.

### 2.3 Riesgo operativo que condiciona el diseño [DOC: CLAUDE.md §14, §20 #14]

- n8n es **un solo proceso de 8 GB** compartido por kiosko, Confirmar Horas, Finanzas,
  paneles y el MCP. El 18-sep llegó a **7.99 GB**, reinició, y el kiosko y Confirmar Horas
  quedaron inservibles media mañana.
- El `Worker` (modo cola) **nunca se ha desplegado** [MEDIDO: `latestDeployment: null`], así
  que no hay aislamiento del trabajo pesado.
- **Consecuencia para este frente:** la captura de WhatsApp (fotos, audios, videos de decenas
  de grupos) **no debe pasar por n8n**. Ver ARQUITECTURA §2.1.

### 2.4 Lagunas (necesitan n8n o la base en vivo)

1. Si las migraciones `comercial` 006–009 están aplicadas.
2. Estado `active` actual (y `versionId` vs `activeVersionId`, CLAUDE.md §17 2b) de los
   workflows de machote y cotización.
3. Dónde termina la selfie del check-in **normal** en `kiosk/checkin` (la de incidencias ya
   se migró a `incidencias_media`).

Ninguna bloquea esta propuesta; se cierran en la sesión S1 del plan con el read-back de la base.

---

## 3. Estado de #123, #125 y #127, y qué se reutiliza

| issue | estado [MEDIDO en GitHub hoy] | qué se reutiliza aquí |
|---|---|---|
| **#123** HMAC + anti-replay en webhooks | **Abierto, sin comentarios, sin implementar** (creado 29-ago). Diseño: HMAC-SHA256 sobre `ts.body`, headers `x-fts-ts`/`x-fts-sig`, ventana 5 min, sub-workflow `fts_auth_hmac` | **El esquema de firma tal cual** para el receptor de captura, con secreto propio `MEMORIA_HMAC_SECRET`. Este frente puede ser el **primer consumidor real** del patrón |
| **#125** `fts_archivos` | **Abierto, no construido.** Depende de #122 y #123 | Pasa a este frente. Se integra como **brazo de publicación** de la memoria y la memoria reemplaza su log de 90 días (ARQUITECTURA §7.1). **Su destino `whatsapp` se elimina**: la captura nunca escribe en grupos |
| **#122** `fts_correo_exportar` | **Abierto, bloqueado** desde el 29-ago: falta `Mail.Read` + `Sites.Selected` en Azure y la variable `FTS_CORREO_KEY` en Railway (hay avance parcial reportado en `docs/po-radar/README.md:44`) | Será la **fuente "correo"** de la memoria (fase 2). La decisión "se envía siempre desde el buzón de ventas, el de Esteban sólo se lee" aplica igual aquí |
| **#127** ROADMAP comercial | **Abierto** (documento rector del frente comercial) | Su **§3 "capa de ingesta"** (fuente → evidencia → amarre → interpretación → propuesta → bandeja → acción) es la misma tubería que aquí se generaliza. Reglas que se adoptan: *sin cita literal no hay propuesta*, las huérfanas son bandeja, la IA sólo propone, cuentas VIP nunca se auto-aplican. **Su orden de fuentes ponía "grupos de WhatsApp (puente no oficial, decisión de riesgo aparte)" al final**: este frente es esa decisión de riesgo, ahora adelantada |

**Auth reutilizable:** SuiteAuth (`shared/auth-jwt.js` en el navegador,
`docs/n8n-workflows/fase0/jwt-verify.js` → `verifyJWT(token, secret, scope)` en el servidor,
usuarios y `scopes` en la Data Table `suite_usuarios`, token en el cuerpo) [REPO]. La memoria
usará scopes propios `memoria:read`, `memoria:aprobar`, `memoria:admin`.

---

## 4. Trazabilidad en Odoo: cómo se ligan lead, SO, analítica, PO, bills y facturas

Mediciones [MEDIDO] con el MCP de Odoo en solo lectura, 15 consultas, 2026-09-28 06:25–06:30
UTC, universo `company_id in [1,6]`, desde `2026-01-01`; SO/PO confirmadas, moves `posted`.

### 4.1 La cadena de ligas

| salto | campo | tipo |
|---|---|---|
| lead → SO | `sale.order.opportunity_id` | nativo |
| lead ↔ machote | `comercial.machote.odoo_lead_id` (Postgres); en Odoo, `crm.lead.x_studio_machote_folio` **propuesto, no existe** | propio |
| SO → proyecto | `sale.order.project_id` + custom `RjLNg` / `x_studio_project_id_created_1` y bandera `x_studio_project_created` (workflow `u7Ni2cRAxu3zfBid`) | nativo + Studio |
| proyecto → analítica | `project.project.account_id` (plan 1 MX / 18 USA) | nativo |
| SO → budget | `budget.analytic` / `budget.line` por rubro plan 20 (rama A1, sólo SO nuevas) | nativo, creado por n8n |
| PO → SO / proyecto / analítica | cabecera: `x_studio_many2one_field_LFiHc` (→SO), `…_SNpub` (→proyecto), `…_NSJNv` (→analítica); líneas: `analytic_distribution` | **casi todo Studio** |
| PO → bill | `account.move.line.purchase_line_id` | nativo |
| bill → analítica | `analytic_distribution` por línea (+ `distribution.model` #46 que inyecta el rubro) | nativo |
| SO → factura | `account.move.line.sale_line_ids` | nativo |
| candado al postear | Automation Rules 56 (bill) y 57 (PO): exigen plan de costo; **sólo company 1** | base.automation |

### 4.2 Números

| medida | resultado |
|---|---|
| SO confirmadas 2026 | 58 (28 MX, 30 USA) |
| …con `opportunity_id` (lead) | **13 (todas MX) → 78 % sin lead; USA 0 de 30** |
| …con `project_id` | 40 de 58 → **18 sin proyecto** (resta, no releída una por una: pueden ser de $0 o anteriores al filtro de fecha del workflow) |
| …con `project_id` pero `x_studio_project_created` vacío | 6 (misma inconsistencia de las "121 SOs" de CLAUDE.md §17) |
| PO confirmadas 2026 | 1,623 (1,510 MX, 113 USA) |
| …con SO en cabecera | **82 → 5 %** (todas MX) |
| …con proyecto o analítica en cabecera | MX 848 (56 %) · **USA 18 de 113 (16 %)** |
| líneas de PO con alguna analítica | MX 86 % · USA 91 % (no distingue proyecto de rubro solo) |
| bills `in_invoice` 2026 | 1,447; con alguna línea ligada a PO: 1,440 → **7 sin PO** (filtro one2many "alguna línea", no contrastado con muestra) |
| facturas `out_invoice` 2026 | 65; ligadas a SO: 52 → **13 sin SO** |

### 4.3 Huecos de trazabilidad (los que la memoria puede ayudar a cerrar)

1. **SO sin lead: 78 %** (USA 100 %). La conversación que originó la venta no está en ningún
   lado — justo lo que traen los grupos de levantamiento.
2. **PO sin SO: 95 %**, y en USA **84 % sin proyecto ni analítica**. El vínculo gasto→obra
   vive en la cabeza de quien compra y en el grupo de WhatsApp donde se pidió.
3. **Gasto sin proyecto: 59 %** del gasto de proveedor MX de 12 meses ($24M de $40.86M) es
   rubro sin proyecto [DOC: CLAUDE.md §17 A0, antes del candado A3].
4. **El candado A3 sólo cubre MX**: bills y PO de USA se postean sin plan de costo [DOC].
5. **Tickets de USA sin bill:** **no medido** — no hay dónde medirlo hoy, porque el ticket sólo
   existe como foto en un grupo. Es el caso de uso del motor de tickets.
6. SO sin proyecto (18), inconsistencia de bandera (6), facturas sin SO (13), budgets
   esqueleto `−1` sin backfill.

**Implicación para el diseño:** la memoria no debe asumir que Odoo trae la liga; tiene que
poder ligar **por evidencia** (el grupo SO11771 habló de esa compra) y **proponer** la liga
que falta en Odoo, para que una persona la apruebe. Por eso existen `memoria.vinculo` con
`confianza` + `metodo` y la propuesta de tipo `vinculo`.

---

## 5. Datos personales y sensibles en el repo público (sólo inventario)

**No se arregló nada en esta sesión**, a propósito. Se listan rutas, conteos y tipo; **ningún
valor**. Verificado en el working tree de `main` al 2026-09-28 (grep, sin historial de git).

| severidad | archivo(s) | qué hay | cantidad |
|---|---|---|---|
| 🔴 ALTA | `seguridad/data/users.json` | usuarios con campo `pass` **en claro** (no hash) | 7 campos `pass` [MEDIDO: grep] |
| 🔴 ALTA | `shared/users-suite.json` | `password_hash` SHA-256 **sin sal** (ya conocido, CLAUDE.md §15) | ~6 hashes |
| 🔴 ALTA | `pmo/index.html` | constante de secreto HMAC en la página publicada (`HARDCODED_SECRET` / `SECRET`) — el `.js` de `docs/` sí está redactado; **falta confirmar contra n8n si es el valor rotado o el viejo** | 5 apariciones [MEDIDO: grep] |
| 🔴 ALTA | `shared/incidencias-asistencia.json` (774 KB) | **selfies JPEG en base64** + geolocalización, ligadas a nombre, id, supervisor, correo y teléfono | **35 fotos** [MEDIDO: grep `/9j`], 154 incidencias |
| 🔴 ALTA | `shared/config/empleados-master.json` | padrón: nombre, id Odoo, correo, teléfonos, jefe, depto, categoría de nómina | ~44 empleados |
| 🟠 MEDIA-ALTA | `docs/finanzas/historico/gubbf_ago2025-ene2026.csv` | asistencias nominativas con horas y proyecto | ~2,381 filas |
| 🟠 MEDIA-ALTA | `prospector/tests/test_caso_*`, `prospector/metodo/fixtures/*`, `docs/po-radar/SPEC-1.0.md`, `comercial/SUPUESTOS.md`, `docs/comercial/ORDEN-CONTRATO.md`, `comercial/machote/js/orden.js` | correos con forma `nombre.apellido@` en dominios reales de clientes (algunos son marcadores; varios parecen reales) | ~47 distintos |
| 🟡 MEDIA | `docs/po-radar/*` | RFC de personas físicas y morales | ~3 físicas + ~10 morales |
| 🟡 MEDIA | CLAUDE.md, `docs/**`, `shared/operaciones/sla_stages*.json`, `watchdogs_mo.json` | correos nominales `@fts.mx` | ~24 distintos |
| 🟡 MEDIA | `comercial/data/clientes-usuarios.csv` | empresa + nombre de contacto | ~89 filas |
| 🟡 MEDIA | ~30 `.js`/`.html` | ~51 rutas `webhook/...` invocables **sin HMAC** (incluye `planeacion/confirmar-horas`, que escribe a producción) | ~51 |
| 🟡 MEDIA | `shared/incidencias.json` | incidencias legacy con nombres (archivo huérfano) | ~17 |
| 🟢 BAJA | `docs/n8n-workflows/*.json` | ids de credenciales y webhooks (sin secretos literales) | 20 archivos |
| 🟢 BAJA | `docs/rh/manual-nomina-incidencias.html`, `seguridad/index.html` | capturas en base64: **mirarlas** (pueden traer nombres u horas) | ~20 |

**No se encontró:** CLABE real, CURP, NSS, llaves con forma de proveedor (`sk-`, `ghp_`,
`AKIA`, JWT `eyJ`), ni `.env` commiteados.

**Purga de historial:** planeada, **no ejecutada** (`prospector/PURGA-DEL-HISTORIAL.md`,
24-sep, ampliada el 27-sep en #324). Borrar del working tree no borra del historial
(CLAUDE.md §20 #7): lo de 🔴 se trata como filtración y se rota lo que aplique.

**Lección que este frente adopta desde el día 1:** en la memoria **nada** de lo capturado toca
el repo. Los ejemplos, pruebas y reglas de detección se escriben con datos sintéticos, y el
receptor no tiene ningún camino de escritura a GitHub.

---

## 6. Cómo interactúa esto con el resto de la suite

| módulo | qué produce / consume hoy | dónde persiste | auth | enganche con la memoria |
|---|---|---|---|---|
| **Kiosko** (`operaciones/kiosk/`) | check-in/out, SOS, olvidos, estado | Odoo `hr.attendance` (+ JSON de incidencias) | `ops_api_key` en localStorage, sin JWT | **Fuente** (fase 3): eventos `asistencia.*`, `sos`. Y **dato de verdad** para `so_resultado.real_mo_horas` vía `x_studio_sales_order_2` |
| **RH** (`modulos/rh/`) | altas/bajas, incidencias de nómina | Odoo + `empleados-master.json` | FTSAuth / NomAuth | `memoria.identidad` se liga a `hr.employee`; bajas → pausar identidad |
| **Bancos / Finanzas** (`finanzas/`, `captura-jeeves`) | movimientos, preconciliación | Odoo, chatter `CBRUN` | FinAuth / SuiteAuth | **Fuente** (fase 3): `banco.movimiento`. Cruce con tickets de WhatsApp para el motor tickets→bills |
| **Watchdog / semáforo** | seguimiento de proyectos por chatter | snapshots JSON en el repo | — (correo) | **Consumidor natural**: "¿qué pasó desde el último correo?" sale de `v_evento_so`. Y **vigilante** de la memoria (corridas, respaldos, partición default) |
| **Comercial** (`comercial/`) | leads, machote, cotización, orden | Odoo + `comercial.*` | SuiteAuth `comercial:*` | Levantamientos → evidencia del lead; el **cotizador** consume `precio_observado` y `so_resultado`. Riesgo de doble captura (D6) |
| **Prospector** (`prospector/`) | fichas de contacto | Postgres `prospeccion` (no aplicado) | — | Consumidor de eventos de correo; nada de WhatsApp |
| **PMO** (`pmo/`) | chat → cambios al cronograma | PUT a GitHub | FTSAuth | Patrón a copiar para interpretar; consumidor de avances por SO |
| **Carga MO** | nómina vs planeación | Odoo analítica | FinAuth | Consumidor indirecto (horas reales por SO) |

**Plataforma:** `docs/arquitectura/PLATAFORMA_PANELES.md` fija un sobre común de respuesta y
"un permiso por panel, verificado en el endpoint"; `shared/panel/panel-shell.js` existe. La
bandeja de la memoria se construye sobre eso con SuiteAuth. **Registro de módulo nuevo:**
entrada en `shared/modules-registry.js` + tarjeta en `index.html` + scope en `suite_usuarios`
— todo **fuera** de `whatsapp/` y `docs/whatsapp/`, así que queda como pendiente P6.

---

## 7. Resumen de hallazgos que condicionan la arquitectura

1. **El Postgres correcto ya existe** (`fts-suite-db`, PG 17, red privada, 0.19 de 5 GB) y tiene
   disciplina de migraciones. La memoria entra como esquema hermano; no hace falta servicio nuevo de base.
2. **No hay respaldo propio ni copia fuera de Railway**, y el almacén ya tiene datos reales.
   El respaldo 3-2-1 se vuelve prerrequisito, y cubre de paso a `comercial`.
3. **n8n no aguanta ser la tubería de binarios** (8 GB compartidos, Worker nunca desplegado).
   La captura va por un receptor propio.
4. **`comercial.evidencia` ya es una bitácora de ingesta vacía** que admite `whatsapp`: hay que
   decidir una sola captura (D6).
5. **HMAC (#123) no existe todavía**: el receptor lo implementa desde el día 1 y puede servir de
   referencia para el resto.
6. **`fts_archivos` (#125) no existe**: se diseña como brazo de publicación sobre el registro de
   archivos de la memoria, sin destino WhatsApp.
7. **Los huecos de Odoo son de liga, no de datos**: 78 % de SO sin lead, 95 % de PO sin SO. La
   memoria liga por evidencia y **propone** la liga que falta.
8. **El repo público ya filtró datos personales** (selfies, padrón, contraseñas en claro). Nada
   capturado por este frente toca el repo.
9. **Numeración de migraciones en disputa** (prospector 010–014 fuera de `main`): el número se
   asigna al aplicar.
