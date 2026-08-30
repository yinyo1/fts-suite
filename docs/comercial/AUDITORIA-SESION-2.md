# Auditoría sesión 2 — identidad y almacén

Estado real verificado el 2026-08-30, antes de escribir código (issue #140).

**Base viva confirmada en Odoo**, idéntica a la que declara el issue:

```
crm.lead activos, agrupado por stage_id
Prospecto Lead [17]               22
Lead Calificado/Por cotizar [15]  39
Cotizacion Enviada [5]            49
Revisar [18]                      44
                                 ───
                                 154
```

---

## 1. Criptostack de Finanzas

### Lo que se puede leer y lo que no

🔴 **`auth/finanzas-login` (`ykNzGCvdjzjdXYhc`) NO es legible desde aquí.** El MCP responde
*"Workflow is not available in MCP"*. Es la misma bandera `availableInMCP` de la que se
habló en la sesión 1 — aquí bloquea justo lo que el issue pide reutilizar.

**Consecuencia honesta:** no puedo *copiar* el criptostack de Finanzas. Puedo
reconstruirlo, que es exactamente lo que el issue dice no hacer ("no inventar esquema
nuevo"). Reconstruir a ojo un emisor de JWT es la clase de cosa que falla en silencio y
solo se nota cuando alguien no puede entrar.

**Lo que necesito de Esteban:** marcar *Available in MCP* en `ykNzGCvdjzjdXYhc`. Es un
clic y desbloquea el punto A completo.

### Lo que sí está disponible en el repo

`docs/n8n-workflows/pmo-chat-apply-code-code-validar-auth.js` (170 líneas) trae, en JS
puro apto para el sandbox de n8n:

- SHA-256 FIPS 180-4 con auto-test contra vector RFC al arrancar
- HMAC-SHA256
- comparación en tiempo constante (`_ctEqualBytes`)
- anti-replay por ventana de timestamp

**Lo que NO trae:** PBKDF2 (verificación de password) ni el ensamblado/firma del JWT.
Eso vive solo en `auth/finanzas-login`. Es decir: el repo cubre la mitad de validación,
no la mitad de emisión.

✅ **Deuda saldada, corregir CLAUDE.md §15 #3.** Esa nota dice que el archivo tiene un
secreto HMAC filtrado pendiente de rotar. **Ya no.** La línea 4 dice
`const SECRET = '<SECRETO_HMAC_VIVE_EN_N8N_NO_COMMITEAR>'; // rotado 2026-07-17`. El
secreto fue redactado y rotado hace mes y medio; la regla quedó stale.

### Contrato del cliente (`finanzas/js/auth-fin.js`, 98 líneas)

- POST a `/webhook/auth/finanzas-login` con `{user, password}`, token en el **body** de
  la respuesta, sesión en `localStorage['fts_fin_session']`, vida 8 h.
- Decodifica el payload del JWT **sin verificar firma** (a propósito: la firma la valida
  el server) y lee **`claims.app` y `claims.role`**.

⚠️ **El token de hoy NO tiene la forma que fija el ROADMAP §5.2.** Hoy: `app` + `role`.
La forma final: `sub` + `roles[]` + `dndole`. El cliente de comercial tiene que leer la
forma nueva; copiar `auth-fin.js` tal cual traería los campos viejos.

⚠️ **`fts_fin_session` está compartida.** Hoy `comercial/index.html` se autentica con el
login de Finanzas y comparte esa llave de localStorage. Un login propio de comercial debe
estrenar su propia llave, o cerrar sesión en Finanzas tumbaría comercial y viceversa.

---

## 2. Los tres workflows de julio contra el estado post-limpieza

🔴 **Los tres también tienen `availableInMCP:false`** → mismo bloqueo. Lo verificado en
vivo hoy es solo la metadata de `search_workflows`; **el detalle de nodos de la tabla de
abajo viene de la documentación del repo, no de un read-back.** Marcado `[REPO]` donde
aplica, igual que hizo la auditoría de la sesión 0.

| Workflow | ID | `active` | `triggerCount` | `updatedAt` |
|---|---|---|---|---|
| `comercial/watchdog-enviadas (T2 canary)` | `hJNTUd8E57W4rfjU` | ❌ false | 0 | 2026-07-16 |
| `comercial/captura (T3)` | `tEra7MVCvnWjAqjR` | ❌ false | 0 | 2026-07-16 |
| `comercial/pipeline (T3)` | `60ZLskz1xJ7nU5kt` | ❌ false | 0 | 2026-07-16 |

Seis semanas sin una sola edición ni ejecución. Confirmado en vivo.

### ¿Siguen siendo válidos con 4 etapas en vez de 12?

- **`captura`** — sí, y por una razón incómoda: `[REPO]` no manda `stage_id` en absoluto.
  Crea el lead con campos nativos (`name`, `partner_name`, `expected_revenue`, `user_id`,
  `description`) y deja que Odoo aplique la etapa por defecto. La consolidación de etapas
  no lo rompe. **Pero eso mismo es el defecto**: un lead capturado entra donde Odoo
  quiera, no en Prospecto.
- **`pipeline`** — lee `crm.lead` de 180 días. Tras la limpieza, 1,705 de esos leads están
  archivados. Si su dominio no filtra `active`, Odoo ya los excluye por `active_test`
  implícito, así que devolvería 154 en vez de 1,859: **más correcto que antes, por
  accidente**. Lo que sí queda obsoleto es cualquier agrupación por las 8 etapas que ya no
  existen. **No verificable sin leer los nodos.**
- **`watchdog-enviadas`** — no toca etapas; opera sobre `sale.order` en estado `sent`.
  La limpieza no lo afecta. Sus dos problemas conocidos siguen: el TZ (necesita
  `Settings → Timezone = UTC` a mano o corre 06:45 CST) y que su señal `write_date` tiene
  caducidad silenciosa — 60 de 122 enviadas comparten `write_date` exacto por escrituras
  masivas. Por eso el ROADMAP §3 ya diseñó el v2 con `mail.message`.

### ¿La captura escribe el `dndole` correcto ahora que hay identidad?

**No, y no puede todavía.** `[REPO]` la captura escribe **cero campos `x_studio_*`** —
`x_studio_dndole` incluido. Atribuye por `user_id` con fallback a Esteban, y como el JWT
trae `sub:'finanzas'` fijo, **el 100% de los leads cae al fallback**. Ese es justo el
agujero que el punto A viene a tapar. Cerrar el ciclo pide dos cambios en `captura`:
leer `dndole` del token nuevo y escribirlo al campo. Ninguno se puede hacer sin leer sus
nodos.

---

## 3. Almacenes que ya existen

### 3.1 Postgres — existe la pieza, no existe el plan

Railway, proyecto **`cheerful-comfort`** (`4f4b4d53…`), entorno `production`:

| Servicio | Qué es |
|---|---|
| `Primary` | n8n |
| `Worker` | el crashed loop legacy del modo queue (CLAUDE.md §14) |
| **`Postgres`** | **la base operativa de n8n** |
| `Redis` | legacy del mismo modo queue |

🔴 **n8n NO tiene credencial de Postgres.** Las 6 credenciales que existen son: `Odoo FTS`,
`Odoo API Bearer`, `Odoo Login`, `GitHub FTS Suite`, `Anthropic Claude FTS`,
`Microsoft Graph - sales`. **Ninguna `postgres`.**

Traducción: el "Postgres propio en Railway (esquema `comercial`)" que el ROADMAP §2 da
por decidido **nunca se empezó**. No hay esquema, ni rol, ni credencial. El servicio que
existe es el de n8n, que es una cosa distinta.

✅ El nodo **Postgres v2.6** sí está en la instancia, con `executeQuery` parametrizado
(`$1,$2` vía `queryReplacement`) y **`queryBatching: 'transaction'`**.

### 3.2 n8n Data Tables — la premisa del encargo está equivocada

Existen **exactamente dos**, y **las dos se crearon hoy**:

| Tabla | id | Creada | Columnas |
|---|---|---|---|
| `incidencias_media` | `TbE4AcWBEVWg0icD` | **2026-08-30 16:58** | 17 (`foto_base64`, `foto_bytes`, `foto_sha256`, `geo_*`, `empleado_*`) |
| `canary_largo_string` | `uvPvvuMHWRS4ha72` | **2026-08-30 17:18** | 4 (`caso`, `largo_esperado`, `valor`, `hash_esperado`) |

🔴 **Ninguna es de mano de obra.** El encargo dice "las n8n Data Tables que usa el
proyecto de mano de obra"; **Carga MO no usa Data Tables**. Según CLAUDE.md §19 y el
repo, usa `shared/operaciones/contpaqi_conceptos.json` + dos workflows que escriben
`account.analytic.line` en Odoo. En `shared/operaciones/` solo hay
`contpaqi_conceptos.json`, `sla_stages.json`, `watchdogs_mo.json` y `semaforo_snapshots/`.

Lo que sí pasa es otra cosa, y es más informativa: **hoy mismo alguien está migrando las
fotos de incidencias a una Data Table, y montó un canary para probar strings largos.**
Eso dice que el límite de tamaño de un campo string es una pregunta abierta en esta
instancia, no un tema resuelto.

**Superficie real del nodo `n8n-nodes-base.dataTable` v1.1** (verificada, no supuesta):

- `row`: `get` (con `returnAll`), `insert`, `update`, `upsert`, `deleteRows`,
  `rowExists`, `rowNotExists`
- `table`: `create`, `delete`, `clear`, `list`, `update` (renombrar)
- Tipos de columna: **`string`, `number`, `boolean`, `date`** — y nada más
- **No hay join. No hay agregación. No hay SQL. No hay transacción. No hay llave foránea.**
- El propio hint del nodo avisa: *"There is no `getAll` operation. To fetch many rows, use
  `operation: 'get'` with `returnAll: true`"* — traer muchos renglones significa jalarlos
  todos al workflow.

### 3.3 JSON en el repo haciendo de base de datos — el patrón dominante

| Archivo | Tamaño | Qué es |
|---|---:|---|
| `shared/incidencias-asistencia.json` | **604 KB** | el almacén real de incidencias |
| `shared/audit-log.json` | 27 KB | bitácora |
| `shared/operaciones/semaforo_snapshots/*.json` | ~20 KB × ~40 | un archivo por día |

El de incidencias es el dato que más pesa en esta decisión: **129 registros en 604 KB**,
o sea **~4.7 KB por registro**, porque las fotos van en base64 dentro del JSON. 18 commits
lo tocan desde junio. Cada escritura es un GET del archivo completo + PUT por la API de
GitHub: **read-modify-write sin candado**. Dos escrituras concurrentes y una pisa a la
otra sin ruido.

No es teoría — es la razón por la que hoy están migrando esas fotos fuera del JSON.
