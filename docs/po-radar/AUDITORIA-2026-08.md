# fts_po_radar — Auditoría de estado (sesión 0)

**Fecha:** 2026-08-31 · **Issue:** #142 · **Alcance:** auditoría y spec. No se construyó workflow, no se mergeó a main.
**Branch:** `claude/audit-fts-po-radar-9mop6w`

Todo lo que aquí se afirma como "verificado" se ejecutó y se observó en este turno. Donde no se pudo
ejecutar, se dice explícitamente. Los IDs de ejecución y los crudos van pegados (CLAUDE.md §8).

---

## 0. Veredicto en una línea

**fts_po_radar está BLOQUEADO en Azure.** El permiso `Mail.Read` sobre el buzón de Esteban no existe:
comprobado en vivo con un `403 ErrorAccessDenied`. Sin eso no hay etapa 0 —no hay de dónde leer— y las
etapas 1 a 4 no tienen entrada. Lo que **sí** se puede hacer sin desbloquear nada es todo el trabajo de
diseño, el corpus, los casos de prueba y las tablas de Postgres; eso es lo que entrega esta sesión.

Hay un segundo bloqueador, menor y de un clic: `FTS_CORREO_KEY` **no existe** en Railway.

---

## 1. Estado de n8n

Instancia: `https://primary-production-5c3c.up.railway.app` (Railway, proyecto `cheerful-comfort`,
servicio `Primary`). **65 workflows** en total. No se verificó el número de versión de n8n en este turno,
así que no lo afirmo.

### 1.1 Los workflows que tocan correo

Verificado por `list_credentials`: en toda la instancia existe **una sola credencial de Microsoft**,
`Microsoft Graph - sales` (`Mh5kBNduMzOl3nzT`, tipo `oAuth2Api`). Por lo tanto **todo el correo saliente y
entrante de n8n pasa por esa app de Azure**, y cualquier límite de la app es un límite de todo el sistema.

| Workflow | ID | Activo | Qué hace con correo | Relación con po_radar |
|---|---|---|---|---|
| `fts_correo_exportar` | `jHiDim2gmu7VMVaE` | sí | **Lee** buzón de Esteban (mensaje, `.eml`, adjuntos) y **envía** desde sales@ | Es el puente de binarios que po_radar necesitaría |
| `crear-proyecto-al-confirmar - BUDGET DEV` | `u7Ni2cRAxu3zfBid` | sí | **Envía** desde sales@ a `newordersnotification@fts.mx` el correo `[Nuevo Proyecto Confirmado]` con el PDF de la PO adjunto | **Genera el ruido que po_radar debe descartar** — ver §5.1 |
| `ops/watchdog-semaforo` | `29eaGe2wkS98lRMU` | sí | Envía 2 correos diarios 8am CST | Ruido propio en el buzón |
| `fin/detect-gasto-cierre` | `zLmmY0pqYC9kjLaw` | sí | Alerta por correo a estebandelacruz@ | Ruido propio |
| `project/archive-budget-cierre` | `RW7KnoeEzYLvavI0` | sí | Correo en la rama REOPEN | Ruido propio |
| `rh/watchdog/sin-checkin`, `ops/watchdog-mo`, `ops/eco-confirmacion` | varios | sí | Notificaciones | Ruido propio |

> No inspeccioné nodo por nodo los watchdogs de RH/ops en este turno; los marco como emisores por su
> función documentada en CLAUDE.md §18 y §17, no por lectura del JSON. Lo que **sí** está verificado es que
> no hay otra credencial de Microsoft por la que pudieran salir.

### 1.2 `fts_correo_exportar` (#122) — construido y correcto, bloqueado

- Existe, `active: true`, `availableInMCP: true`, versión activa `3892f2e7-792f-47c6-86b2-6b9aa1b2d929`.
- 21 nodos. Diseño ya rediseñado según la decisión de Esteban del 29-ago: `mailbox_lectura =
  estebandelacruz@fts.mx`, `mailbox_envio = sales@fts.mx`, almacenamiento en SharePoint
  `ftsmx0.sharepoint.com:/sites/ComercialFTS` (Sites.Selected, no OneDrive personal).
- La credencial Graph **sí está asignada** a los nodos HTTP (visible en el crudo de la ejecución de abajo:
  `"credentials":{"oAuth2Api":{"id":"Mh5kBNduMzOl3nzT","name":"Microsoft Graph - sales"}}`).
  Esto corrige la duda que quedó abierta en el comentario del 29-ago de #122.

### 1.3 `fts_archivos` (#125) — **no existe**

Barrido de los 65 workflows: no hay ninguno llamado `fts_archivos` ni equivalente. El puente generalizado
de binarios está en papel, no en n8n. Consecuencia para la decisión de arquitectura: ver §6.

---

## 2. Bloqueador Azure — confirmado en vivo

### 2.1 La prueba

Ejecución **manual**, de solo lectura (`destinatarios: []`, `guardarOneDrive: false`), sobre
`jHiDim2gmu7VMVaE`, con el `messageId` de prueba de #122 (correo "Fw: Materials Calbee - FTS").

**Ejecución `81384` · 2026-08-31T04:00:09Z UTC (= 22:00 CST del 30-ago) · status `error`.**

Crudo del nodo `HTTP - GET mensaje`:

```
"uri": "https://graph.microsoft.com/v1.0/users/estebandelacruz@fts.mx/messages/AAMkADRjMTRkYTA1...AAA="
"credentials": {"oAuth2Api": {"id": "Mh5kBNduMzOl3nzT", "name": "Microsoft Graph - sales"}}
"httpCode": "403"
"messages": ["403 - \"{\\\"error\\\":{\\\"code\\\":\\\"ErrorAccessDenied\\\",\\\"message\\\":\\\"Access is denied. Check credentials and try again.\\\"}}\""]
```

El token se emitió bien (no hay error de OAuth); el 403 lo devuelve Graph. Eso descarta problema de
credencial y deja una sola causa: **la app no tiene permiso sobre ese buzón**.

No es un evento aislado: las ejecuciones `81032` (30-ago 16:10 UTC) y `81165` (30-ago 20:13 UTC) también
terminaron en `error`. El bloqueo lleva al menos dos días reintentándose.

### 2.2 Estado real de la app "Microsoft Graph - sales"

App de Azure `n8n-mail-sender`, AppId `45131668-92ec-4819-b2d6-826773abb852`.

| Permiso Graph | Tipo | Estado real | Evidencia |
|---|---|---|---|
| `Mail.Send` | Application | **otorgado** | El correo `[Nuevo Proyecto Confirmado]` sigue saliendo desde sales@ (visto en el buzón, 2026-08-17, SO11832) |
| `Mail.Read` | Application | **NO otorgado** | 403 de la ejecución 81384 |
| `Sites.Selected` | Application | **no verificable en este turno** | La rama de SharePoint no llegó a correr (se cae antes, en el paso 1) |

**Application Access Policy:** sigue acotada a `sales@fts.mx`. El 403 sobre el buzón de Esteban lo
demuestra: con la policy ampliada y `Mail.Read` otorgado, la respuesta habría sido 200 o 404, nunca
`ErrorAccessDenied`.

> Matiz importante: un 403 no distingue "falta el permiso" de "falta la policy". Podrían faltar los dos.
> Por eso el desbloqueo de §7 pide ambas cosas y una verificación con `Test-ApplicationAccessPolicy`.

### 2.3 Veredicto

**Este flujo queda bloqueado hasta resolver exactamente lo pendiente de #122.** No hay rodeo dentro de
n8n: no existe una segunda credencial de Microsoft, y la única que hay no alcanza el buzón de Esteban.

Existe una lectura delegada que **sí** funciona hoy —el conector Microsoft 365 de claude.ai, con el que se
levantaron los casos de prueba de §5— pero es una sesión interactiva de Esteban, no un servicio: no puede
correr en un cron de n8n ni sostener un detector 24/7. **Sirve para calibrar, no para producir.**

### 2.4 Segundo bloqueador: `FTS_CORREO_KEY`

Listado de variables del servicio `Primary` (Railway, proyecto `cheerful-comfort`,
servicio `b5168f3e-d25d-46d1-a327-e44b66ee14d4`): **`FTS_CORREO_KEY` no aparece.** El webhook público de
`fts_correo_exportar` es fail-closed, así que hoy rechaza todo con
`{"ok":false,"http":500,"error":"FTS_CORREO_KEY no esta configurada en n8n"}`.

Tampoco existen `FTS_ARCHIVOS_KEY` ni `KIOSK_HMAC_SECRET` (ver §4).

---

## 3. Regla de correo vigente — confirmada y ya implementada

**n8n envía SIEMPRE desde `sales@fts.mx`. `estebandelacruz@fts.mx` solo se lee, nunca es remitente.**

Está codificada, no solo acordada: en `Set - config` de `jHiDim2gmu7VMVaE` el buzón de envío es un literal
del workflow (`mailbox_envio = sales@fts.mx`), **no viene del payload**, así que quien llame al webhook no
puede cambiarlo. Verificado en el crudo de la ejecución 81384:

```
"mailbox_lectura": "estebandelacruz@fts.mx", "mailbox_envio": "sales@fts.mx"
```

Límite honesto que hay que conocer (ya levantado en #122 y sigue vigente): la Application Access Policy
acota **qué buzones** alcanza la app, no **qué puede hacer en cada uno**. Con `Mail.Read` + `Mail.Send`
consentidos y la policy ampliada al grupo, la app *técnicamente* podría enviar como estebandelacruz@. La
garantía es a nivel de workflow, no de plataforma. Si algún día se quiere garantía dura por buzón, el
mecanismo es RBAC for Applications de Exchange; no lo requiere po_radar.

**po_radar hereda la regla sin excepción:** el reenvío a `newordersnotification@fts.mx` sale de sales@.

---

## 4. HMAC (#123) — no implementado

| Secreto esperado | ¿Existe en Railway Primary? |
|---|---|
| `KIOSK_HMAC_SECRET` | **no** |
| `FTS_CORREO_KEY` | **no** |
| `FTS_ARCHIVOS_KEY` | **no** |
| `PMO_CHAT_HMAC_SECRET` | sí |

No existe el sub-workflow `fts_auth_hmac`. El único webhook con firma real hoy es el de `pmo/chat-apply`.
Los webhooks de kiosko, asistencia e incidencias siguen invocables con solo conocer la URL.

**Qué significa para po_radar:** el detector es un **Schedule trigger**, no un webhook público — no expone
superficie nueva. Su única superficie sería el endpoint de reproceso manual y el de feedback ("esto no era
PO"), y esos nacen con `x-fts-key` como todos los recientes, y migran a HMAC cuando #123 exista. **po_radar
no depende de #123 y no debe esperarlo.**

---

## 5. El corpus real — el hallazgo que cambia la spec

El issue asume que las **2,260 SO confirmadas con folio** son el corpus de calibración. Lo son, pero no
como se esperaba. Verificado con `odoo_agrupar` sobre `sale.order` con
`state = 'sale' AND x_studio_purchase_order_number != false`:

**Por compañía (2,260 total):**

| Compañía | Registros |
|---|---|
| SERVICIOS FTS (id 1) | 1,252 |
| TECNOLOGIAS Y PRODUCTOS YIN (id 4) | 915 |
| FTS FULL TECHNOLOGY SYSTEMS LLC (id 6) | 47 |
| JUAN DE LA CRUZ MALDONADO (id 2) | 46 |

**Por cliente — los cinco primeros son el 79% del corpus:**

| Cliente | Registros | ¿Es una PO de cliente industrial? |
|---|---|---|
| MONDELEZ MEXICO (id 7) | 819 | Sí, pero canal en migración (ver 5.2) |
| Galvaprime (id 520) | 724 | **NO — el campo trae notas de sustitución de factura** |
| Racing Cargo Mexico (id 722) | 130 | NO — referencias de flete |
| SERVICIOS ESPECIALIZADOS DE AUTOTRANSPORTE | 58 | NO — referencias de embarque |
| OXXO SA de CV (id 22) | 54 | mixto |

### 5.1 Contaminación del campo `x_studio_purchase_order_number`

Crudo de Odoo (partner Galvaprime), sin editar:

```
SUSTITUYE INV1793              Galvaprime
Esta factura sustituye INV1517 Galvaprime
Esta factura sustituye INV1516 Galvaprime
SUSTITUYE INV1400              Galvaprime
5700813982                     Galvaprime      <-- folio de British American Tobacco
37426                          Galvaprime
```

Tres cosas de golpe:
1. **724 registros (32% del corpus) no son POs**: el campo se usó como nota de sustitución de factura.
2. **Racing Cargo (130) y SERV. ESP. AUTOTRANSPORTE (58) tampoco**: `CMR SHPMX-ID29048`,
   `EMBARQUE M30536`, y erratas de captura reales como `EMBARFQUE M29484` y `EMBARQUE29011`.
3. **Hay contaminación cruzada**: el folio `5700813982` aparece con Galvaprime *y* con British American
   Tobacco (SO8421). Un mismo folio con dos clientes distintos — exactamente el caso que la llave de
   deduplicación "folio + grupo cliente" tiene que sobrevivir.

**Corpus limpio real: ~560 registros** (excluyendo Galvaprime, Racing Cargo y las dos entidades Mondelez
padre), y de esos ~490 quitando también OXXO y Empacadora San Marcos. Es la décima parte de lo que sugiere
"2,260", y es suficiente: los formatos de folio son muy regulares por cliente (ver
la tabla `po_radar.formato_folio`, ver [`README.md`](README.md)).

### 5.2 Mondelez está migrando de sistema

Correo real en el buzón, `SUPPLIER_CENTRAL@MDLZ.COM`, 2026-08-18: *"Target 8 September — Open Purchase
Orders carry over ... No action is required on your part to revalidate or renumber POs."* Los formatos
`7332xxxxxxx` y `4501xxxxxxx` del histórico pueden cambiar en septiembre. **El detector no debe depender de
formatos de folio como requisito** — solo como bono, tal como ya dice el principio rector del issue.

### 5.3 Identidad de cliente: cuatro minas verificadas en Odoo

Crudo de `res.partner` (`name, vat, email`):

```
BEBIDAS PURIFICADAS           BPU7901018D4    [contacto]@gepp.com
Nalco de Mexico               NME900531HM0    [contacto]@ecolab.com
MONDELEZ MEXICO               KFM920615PS8    rubisel
CBRE GCS, S. de R.L. de C.V.  TME001214SP6    estebandelacruz@fts.mx
GRUMA CORP DBA MISSION FOODS  XEXX010101000
Visionary                     XEXX010101000
Lau Industries de Mexico      RME040213EC5    [contacto]@laufan.com
```

1. **Lo bueno:** el vínculo GEPP↔Bebidas Purificadas y Ecolab↔Nalco **ya está en Odoo**, en el `email` del
   partner. La escalera de identidad no parte de cero.
2. **`XEXX010101000` es el RFC genérico de extranjero** y lo comparten GRUMA/Mission y Visionary. Si el
   paso 1 de la escalera (RFC del PDF) no lo pone en lista negra, **colapsa todos los clientes extranjeros
   en un solo grupo**. Mismo trato para `XAXX010101000`.
3. **CBRE tiene como email `estebandelacruz@fts.mx`.** Si el paso 2 (dominio visto en contactos) no excluye
   `fts.mx`, **cualquier correo interno de FTS se identifica como CBRE**. Excluir el dominio propio no es
   opcional.
4. **`MONDELEZ MEXICO` tiene `email = "rubisel"`** — sin `@`. Todo consumidor del campo debe tolerar
   correos malformados sin reventar.

Además: Odoo guarda contactos-hijo como partners (`MONDELEZ MEXICO, Mateo Salazar`,
`Nalco de Mexico, Ivan Santana Barraza`). **"Grupo cliente" tiene que ser el rollup por `parent_id`**, no
el partner de la SO. De los 124 partners con folio, la mayoría son hijos del mismo puñado de empresas.

Esto **no bloquea** po_radar —el principio rector dice que detectar y identificar son independientes— pero
sí define las guardas de la escalera de identidad. La limpieza de fondo es la sesión 1 de #131.

---

## 6. Detector propio vs. apoyarse en `fts_archivos`

**Recomendación: workflow propio (`po/radar-detectar`), que llama a `fts_correo_exportar` para el reenvío.**

Razones, en orden:

1. **`fts_archivos` no existe.** Hacer a po_radar dependiente de #125 le añade un bloqueador que hoy no
   tiene. `fts_correo_exportar` sí existe, está publicado y su contrato ya cubre lo que po_radar necesita
   del reenvío: adjuntos reales por `contentBytes`, `.eml`, y envío desde sales@.
2. **El detector no mueve binarios, los inspecciona.** Necesita `$value`/`attachments` para sacar la
   primera página del PDF y el sha256 — no para copiarlos a ningún lado. Es un consumidor de Graph, no un
   caso de "puente de binarios".
3. **Modo de falla.** Si el detector vive dentro del puente genérico, un cambio en el puente puede apagar
   la detección en silencio, y un falso negativo cuesta una PO perdida. Separarlos hace que el peor caso
   del detector sea "no reenvió" (visible en su bitácora) y no "el puente cambió de contrato".
4. Cuando `fts_archivos` exista, `po/radar-detectar` se le cuelga cambiando **un** nodo de reenvío. No se
   pierde trabajo.

---

## 7. Postgres del módulo comercial (#127)

**Existe un Postgres en Railway, pero NO es el del módulo comercial.**

Proyecto `cheerful-comfort` (`4f4b4d53-3d88-4204-9d8e-b5a4fd8db846`), servicios:
`Primary`, `Worker`, `Postgres` (`9f5091f8-d2ff-47e9-bb61-7a99cb2ad312`), `Redis`.

El servicio `Postgres` es **la base de datos de la propia n8n**: el servicio `Primary` lo consume vía
`DB_TYPE` + `DB_POSTGRESDB_HOST/DATABASE/USER/PASSWORD/PORT`. El otro proyecto de Railway,
`content-determination`, tiene un único servicio (`fts-mcp-odoo`) y ningún Postgres.

**Conclusión: el esquema `comercial` de #127 no está provisionado.** Nadie lo ha creado.

### 7.1 Dónde deben vivir las tablas de po_radar — recomendación

**Un esquema `po_radar` propio dentro de una base de datos nueva, NO dentro de la base de n8n.**

Meter tablas de negocio en el Postgres que respalda a n8n las expone a la poda de ejecuciones, a las
migraciones de versión de n8n y a un restore de la instancia. La bitácora de po_radar es **permanente y sin
caducidad** por diseño del issue; ese requisito y esa base no se llevan.

Dos caminos, y recomiendo el primero:

- **(a) Servicio Postgres nuevo en el proyecto `cheerful-comfort`** — un `add service → Postgres`. Ahí
  nacen `comercial` (para #127) y `po_radar` como **esquemas hermanos de la misma base**. Comparten
  backup, se ven entre sí con `JOIN` cuando el CRM quiera cruzar POs con leads, y n8n los alcanza por red
  privada. Costo marginal, un servicio más.
- **(b) Data Tables de n8n** — ya se usan en el sistema (`incidencias_media`, `canary_largo_string`).
  Sirven para un contador o un candado de idempotencia, no para una bitácora permanente con índices y
  consultas por folio, hash y fecha. **Descartada como almacén principal**; útil solo como candado
  anti-doble-ejecución del cron.

La tabla de **grupos cliente** (el aprendizaje dominio ↔ RFC ↔ formato de folio ↔ grupo) va en
`po_radar` pero está pensada para que `comercial` la lea: es la misma noción de identidad de cliente que
#131 va a limpiar. Cuando #127 arranque, se mueve a `comercial` con un `ALTER SCHEMA`, sin migrar datos.

Esquema completo en `SPEC-1.0.md` §6.

---

## 8. Cómo interactúa con el resto de la suite

| Pieza | Interacción | Riesgo / nota |
|---|---|---|
| `crear-proyecto-al-confirmar` (`u7Ni2cRAxu3zfBid`) | Manda `[Nuevo Proyecto Confirmado]` a `newordersnotification@fts.mx` **con el PDF de la PO adjunto**, y ese correo llega al buzón de Esteban | **Bucle de realimentación.** Un correo con PDF, nombre de cliente y folio, que parece PO y no lo es. El candado anti-bucle de la etapa 1 no es un detalle: es lo que impide que po_radar se dispare contra su propia salida |
| Odoo `sale.order` | Fuente del corpus y del cruce "¿ya está registrada?" (llave 5 de dedupe) | El MCP de Odoo es **read-only (uid 2)**. po_radar v1 no escribe en Odoo, así que no hay conflicto. Cuando escriba, va por n8n con la credencial `Odoo FTS` |
| `auth/finanzas-login` | Patrón JWT reutilizable si po_radar llega a tener panel | No hoy: v1 no tiene frontend |
| Módulo comercial (#127) | La tabla de grupos cliente de po_radar es el mismo concepto de identidad que #131 va a limpiar | Coordinar para no crear dos diccionarios de cliente que diverjan |
| `Anthropic Claude FTS` (`g62rXWwetGFyRKt7`) | Credencial de LLM ya existente en n8n | **Es el camino para el clasificador de la etapa 2.** No hay que crear credencial nueva |
| Regla de correo (§3) | po_radar reenvía desde sales@ | Sin excepción |

---

## 9. Lo que hay que destrabar, en orden

Nada de esto lo puede hacer Claude Code: son cambios en Azure, Exchange y Railway.

1. **Azure — App registrations → `n8n-mail-sender`** (AppId `45131668-92ec-4819-b2d6-826773abb852`):
   agregar el permiso de **aplicación** `Mail.Read` (`Mail.ReadBasic` NO alcanza: no da body, MIME ni
   adjuntos) y `Sites.Selected`. Luego **Grant admin consent**.
   **No agregar** `Files.ReadWrite.All` ni `Mail.ReadWrite`.
2. **Exchange — Application Access Policy**: crear el grupo `grp-n8n-graph-mail@fts.mx` con sales@ y
   estebandelacruz@, **retirar la policy vieja** (la que hoy acota solo a sales@ — si se queda, Esteban
   sigue bloqueado) y crear la nueva con `RestrictAccess`. Los bloques de PowerShell exactos ya están en
   el comentario del 29-ago de #122 y siguen siendo válidos. Propagación típica 30–60 min.
   **Verificación obligatoria antes de declarar destrabado:**
   `Test-ApplicationAccessPolicy -Identity estebandelacruz@fts.mx -AppId 45131668-...` debe decir
   `Granted`, y `rich@fts.mx` debe decir `Denied`.
3. **Railway `Primary`** — crear `FTS_CORREO_KEY` (32+ caracteres aleatorios). Ojo: aplicarla redeploya n8n
   (~1 min de webhooks caídos); hacerlo en ventana tranquila.
4. **Prueba de destrabe** (Claude Code, cuando 1–3 estén): re-correr `jHiDim2gmu7VMVaE` con el messageId de
   Calbee y `destinatarios: ["estebandelacruz@fts.mx"]`. Criterio: **200 en el paso 1** y el PDF llegando
   como adjunto real. Un `403` que desaparece es la única prueba de que la policy propagó.

**Regla de no-regresión, por la lección de la `ir.rule` 814 (CLAUDE.md §9):** una prueba de que algo no se
rompió solo vale si el caso ocurrió. Al re-probar, exigir que el paso 1 devuelva **200 con un asunto real**,
no un `ok:true` que solo signifique que no reventó.

---

## 10. Lo que esta sesión NO verificó

Se dice para que nadie construya encima de un supuesto:

- **`Sites.Selected` y la escritura a SharePoint**: la ejecución muere en el paso 1, nunca llegó a la rama
  de almacenamiento. No sé si el grant de sitio existe.
- **La versión de n8n** (el issue dice 2.30.8): no la leí.
- **El contenido de los PDF de PO**: no se abrió ningún adjunto. Los campos que la etapa 2 promete extraer
  del PDF (RFC, moneda, monto) están **diseñados, no validados contra un PDF real**. Es el primer trabajo
  de la sesión 1, y puede cambiar el prompt del clasificador.
- **Los watchdogs de RH/ops** como emisores de correo: inferido de la documentación, no del JSON.
- **El corpus completo de 2,260 filas**: se extrajeron ~490 filas del subconjunto limpio y se
  caracterizaron por patrón los ~1,770 formulaicos.

> **Nota de la sesión 2:** los CSV que este documento citaba (`corpus-po-folios`, `formatos-folio`,
> `casos-prueba`) **ya no viven en el repo**: el repo es público y el corpus salió de aquí. Su destino
> y cómo se regeneran están en [`README.md`](README.md).
