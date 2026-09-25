# fts_radar_ex_empleados · auditoría y diseño (sesión 0)

Radar que lee los correos **nuevos** que llegan a buzones de personas que ya no trabajan en FTS
(hoy Aldo y Luis Ángel; la lista es configurable), detecta lo que importa al negocio y se lo manda
a Esteban y a Montalvo con la razón y el siguiente paso.

**Esta sesión no construyó nada.** Cero workflows creados o editados, cero cambios en Azure/Exchange,
Railway, Postgres u Odoo, cero correos enviados. Lo único nuevo es este documento y el prototipo
`prototipo.html` (datos demo, empresas y personas ficticias).

> Los correos de personas van como `<correo-…>` en todo el documento: el repo es público (CLAUDE.md §20 #7).

---

## Paso 1 · Auditoría

### 1.1 Estado real de `fts_po_radar` (#142 → #143, #145, #146, #173)

Leído en vivo el 2026-09-25 con el MCP `n8n_FTS` (`get_workflow_details`, `get_workflow_version`,
`search_workflow_executions`, `search_data_tables`, `get_data_table_rows`).

**Workflow `po/radar-detectar (MVP)`, id `sQ5GYhQTq1UHDt6Y`, 24 nodos, cada 15 min.**

```
active: true · triggerCount: 1
versionId:       d0f2965a-1861-4d35-a18a-4a29bb88ed74   ← borrador (ver hallazgo H2)
activeVersionId: 68d6fa08-cc51-4da7-9093-e22a4eb91dd0   ← lo que corre (v3, publicado 2026-09-25 21:09 UTC)
últimas corridas trigger: 114409 · 114427 · 114437 · 114498 (22:30 → 23:15 UTC), todas success, 3–10 s
```

Cadena (versión publicada):

```
Schedule 15min → Set - config → Code - Ventana → HTTP - Graph list → Code - Etapa 1
 → Odoo - clientes → Odoo - cotizaciones → Code - Dominios cliente → IF - hay candidatos?
 → HTTP - Graph adjuntos → Code - Prep binario → Extract PDF → Code - Armar prompt
 → HTTP - Clasificador (api.anthropic.com, credencial "Anthropic Claude FTS", model 'claude-opus-5')
 → Code - Decidir → IF - reenviar? → Code - Build sendMail → IF - enviar de verdad? → HTTP - sendMail
 → Code - Resumen → Code - Latido → IF - toca latido? → HTTP - sendMail latido
```

**Cómo lee el buzón.** `GET /users/{mailbox_lectura}/mailFolders/Inbox/messages` con
`$filter=receivedDateTime ge {desde}`, `$top=100`, `$orderby=receivedDateTime asc`, y
`$select=id,internetMessageId,conversationId,subject,from,toRecipients,receivedDateTime,hasAttachments,bodyPreview,body`.
La ventana la calcula `Code - Ventana`: último corte guardado en `staticData` menos 30 min de solape
(la primera vez, 90 min). Credencial `Microsoft Graph - sales` (`Mh5kBNduMzOl3nzT`, client credentials).

Config publicada (`Set - config`, versión `68d6fa08`):

```
mailbox_lectura = <correo-esteban>     mailbox_envio = sales@fts.mx
destino         = <correo-esteban>     destino_grupo = <grupo new orders>
umbral_grupo = 90 · modo_envio = real · ventana_min = 90 · umbral_reenvio = 45
forzar_desde = (vacío) · reset_estado = false · hora_latido = 18
```

**Cómo detecta POs.**
1. *Etapa 1, determinista (regex):* anti-bucle (remitentes `sales@`/`ventas@`, hilos propios),
   buzones de rol, dominios de plataforma (Ariba, Coupa, Concur…), frases de entrega de OC, folio con
   contexto, adjunto, negativos (cotización, factura, DocuSign, OTP). Desde v3 es solo portero.
2. *Contexto de Odoo:* dominios de `res.partner` con `customer_rank > 0` (limpiados: sin `fts.mx`,
   gratuitos ni basura) + índice `SO##### → {cliente, monto, moneda, estado}` de 180 días.
3. *Clasificador:* **llamada HTTP a la API de Anthropic desde n8n** con el cuerpo y el texto del PDF.
   Pregunta «¿este correo autoriza trabajo, y de quién?». Devuelve JSON con `es_po`,
   `autoriza_trabajo`, `identidad_cliente`, `documento_po`, `cliente_probable`, `po_number`, `monto`,
   `confianza`, `razones`…
4. *Decidir:* precisión `0.65·confianza + 0.20·estructura + 0.15·identidad`. Al grupo solo con
   identidad dura sacada de Odoo (no de lo que diga el modelo) y confianza ≥ 0.85.
5. *Dedupe:* `internetMessageId`, `folio|dominio del remitente` (desenvolviendo reenvíos internos) y
   `conversationId`. **Vive en `$getWorkflowStaticData`**, no en Postgres.
6. *Latido:* corte diario a las 18:00 CST aunque no haya nada; su ausencia es la alarma.

**Bitácora persistente: no existe.** Las data tables reservadas existen pero están vacías:

```
po_radar_bitacora (U90obrC1LWxbEhXR)  → get_data_table_rows: {"rows":[],"count":0}
po_radar_hilos_propios (k8Z8D1bcd2Z6nyBi)  → reservada, sin uso en el código
```

**`fts_correo_exportar` (`jHiDim2gmu7VMVaE`, #122):** activo, webhook, lee un `messageId` y lo reenvía
desde `sales@`. Su buzón de lectura está fijo a Esteban en su `Set - config`, así que no sirve tal
cual para otros buzones.

### 1.2 Azure: app `n8n-mail-sender` y el management scope «FTS PO Radar»

Lo que consta en los issues (no lo pude leer de Exchange; esta sesión no tiene PowerShell ni acceso
de administración, y no lo intenté):

| Pieza | Estado documentado | Fuente |
|---|---|---|
| App `n8n-mail-sender`, AppId `45131668-92ec-4819-b2d6-826773abb852` | client credentials en n8n (`Mh5kBNduMzOl3nzT`) | CLAUDE.md §17, #122 |
| `Mail.Send` (Application) | concedido; envía desde `sales@` | §17 |
| Lectura de buzones | **RBAC for Applications**: rol `Application Mail.Read` con management scope «FTS PO Radar» que solo incluye a Esteban | #146 §1 |
| Prueba de que el scope limita | sonda `81512`: leer a Esteban 200, leer `sales@` **403** con el mismo token | #146 §1 |
| `Sites.Selected` sobre ComercialFTS | **403** al 31-ago (no re-medido hoy) | #146 §3.2 |

**Qué habría que cambiar para incluir a Aldo y a Luis Ángel (NO lo cambié):** una segunda
asignación del rol `Application Mail.Read` al mismo service principal, con un scope **nuevo** que
filtre por un atributo del buzón, sin tocar «FTS PO Radar». Comandos exactos en la sección 3.2.

Por qué un scope aparte y no ampliar el filtro del existente:
- Editar el filtro de «FTS PO Radar» pone en riesgo el radar de POs, que está en producción: un
  error de sintaxis en el OPATH lo deja ciego.
- Con un atributo (`CustomAttribute10 = radar-ex-empleado`), agregar o quitar un buzón es un
  `Set-Mailbox`, sin volver a tocar el scope.
- Apagar este radar es borrar una asignación, sin afectar al otro.

Dos cosas que hay que revisar antes (también en 3.2):
1. **¿Los buzones siguen vivos?** Si a Aldo o a Luis Ángel se les quitó la licencia, Exchange borra el
   buzón a los 30 días. Para conservarlo sin licencia se convierte en buzón compartido.
2. **`Mail.Read` NO debe estar concedido como permiso de aplicación en Entra.** Si lo está, vale para
   todo el tenant y el scope deja de limitar. El 403 sobre `sales@` de #146 indica que hoy no lo está.
   Hay que mantenerlo así.

### 1.3 Cómo se conecta con el resto de la suite

| Pieza | Estado medido hoy | Qué significa para este radar |
|---|---|---|
| n8n en Railway (Primary) | un solo proceso de 8 GB compartido con kiosco, Confirmar Horas, Finanzas (CLAUDE.md §20 #14) | n8n solo mueve datos. El razonamiento corre en un servicio aparte, que no consume memoria de n8n |
| Postgres `fts-suite-db` | existe. Credenciales en n8n: `fts-suite-db · fts_admin` (`Zu4Y9UuzGwCBN8lH`) y `fts-suite-db · comercial_app` (`1bfO8GLZoWdMHIf5`). Migraciones `db/migrations/comercial/001…009` | Esquema nuevo `radar_ex` con rol propio `radar_app`, migración `010`. `comercial_app` no toca `radar_ex` |
| Esquema `po_radar` | `docs/po-radar/ESQUEMA.sql` existe; **no está en `db/migrations/`** y no pude comprobar si se aplicó (el MCP de n8n no ejecuta SQL suelto y no corrí ningún workflow) | No dependo de él. El cruce con el radar de POs se hace por Graph (1.4) |
| Odoo | nodo Odoo v2 con credencial `Odoo FTS`; el MCP de Odoo es de solo lectura | Lista blanca de dominios: `res.partner` con `customer_rank > 0` **o** `supplier_rank > 0` |
| Regla de envío | todo correo automático sale de `sales@fts.mx` | Igual aquí. Destinatarios fijos en el `Set - config` |
| Credencial Anthropic en n8n | `Anthropic Claude FTS` (`g62rXWwetGFyRKt7`), la usa el radar de POs | **No se usa en este radar** (regla: razonamiento fuera de n8n) |

### 1.4 Qué se reutiliza y qué choca

**Se reutiliza:**
- La credencial Graph `Mh5kBNduMzOl3nzT` para leer (con el scope nuevo) y para enviar desde `sales@`.
- Patrones del radar de POs, copiados a nodos propios: ventana con solape, anti-bucle, limpieza de
  dominios de Odoo, lotes de 5 contra el 429 de Graph sin `neverError`, latido diario.
- `fts-suite-db` y el patrón de migraciones con rol por aplicación.
- La regla de adjuntos de CLAUDE.md §17: tope de ~3 MB en `sendMail` simple.

**Choca:**
1. **La regla nueva contradice al radar de POs.** Ese radar razona con una llamada a la API de
   Anthropic dentro de n8n (`HTTP - Clasificador`). Este radar no lo hará. No propongo tocar el de POs
   en esta sesión, pero hay que decidir si la regla también le aplica (decisión D3).
2. **Reportar dos veces la misma PO.** El dedupe del radar de POs vive en su `staticData`, que ningún
   otro workflow puede leer. Solución sin acoplarlos: el `internetMessageId` es el mismo en todas las
   copias de un correo, así que antes de juzgar se busca ese id en el buzón de Esteban, que la misma
   credencial ya puede leer:
   `GET /users/<correo-esteban>/messages?$filter=internetMessageId eq '<id>'&$select=id`.
   Si está ahí, el radar de POs ya lo vio: se registra como `cubierto_po_radar` y no se reporta. Si
   solo llegó al ex-empleado y Claude lo clasifica como orden de compra, se reporta aquí con la etiqueta
   «Posible PO: no pasó por el radar de POs» (decisión D4).
3. **`fts_correo_exportar` no sirve tal cual:** su buzón de lectura está fijo en su config.
4. **Adjuntar el `.eml` completo** choca con el tope de `sendMail` simple (~3–4 MB con base64). Por
   encima de eso Graph pide una sesión de carga sobre un borrador, y eso exige `Mail.ReadWrite` sobre
   `sales@`, que hoy no existe (decisión D5).
5. **Almacén de archivos:** `Sites.Selected` seguía en 403 al 31-ago, así que no hay dónde dejar un
   `.eml` grande para mandar la liga.

### 1.5 Anotado de paso (no se persiguió, §8)

- **H1.** `HTTP - Graph list` del radar de POs pide `$top=100` y no sigue `@odata.nextLink`. Si una
  ventana trae más de 100 correos, el resto se pierde sin error. Con 15 min de ventana es improbable,
  pero un backlog (n8n caído una tarde) lo provoca. Este radar sí paginará.
- **H2.** El radar de POs tiene un **borrador sin publicar** (`d0f2965a…`, 23:15 UTC de hoy) con
  `modo_envio = dry`, `reset_estado = true` y `forzar_desde = 2026-09-24T23:00:00Z`. Parece de una
  sesión de pruebas (corrida manual `114500` a las 23:15 UTC). Producción sigue en `68d6fa08` con la
  config buena. **Si alguien publica ese borrador sin revertir la config, el radar pasa a seco y borra
  su memoria de dedupe.**
- **H3.** La bitácora del radar de POs no persiste (data tables vacías, dedupe en `staticData`).
  Ya estaba anotado en #173 §5.3.

---

## Paso 2 · Diseño

### 2.1 Reparto de responsabilidades

```
            n8n (mueve datos)                        Claude Code (razona)         n8n (mueve datos)
┌──────────────────────────────────────┐        ┌────────────────────────┐   ┌──────────────────────────┐
│ W1 radar-ex/leer    cada 15 min      │        │ radar-clasificador     │   │ W3 radar-ex/enviar       │
│  · Graph list por buzón (paginado)   │        │ servicio cron Railway  │   │  · valida otra vez       │
│  · filtro de sobre (sin leer cuerpo) │ ─────▶ │ claude -p SIN tools    │ ─▶│  · arma correo + .eml    │
│  · ¿ya lo vio el radar de POs?       │  W2    │ entrada: 1 correo      │W2 │  · envía desde sales@    │
│  · contexto Odoo                     │ pend.  │ salida: JSON cerrado   │ver│  · latido 18:00          │
│  · cola en Postgres radar_ex         │        └────────────────────────┘   └──────────────────────────┘
└──────────────────────────────────────┘
```

- **W1 `radar-ex/leer`** (Schedule 15 min): por cada buzón activo de `radar_ex.buzon` lee lo nuevo,
  aplica el filtro de sobre, busca duplicados contra el buzón de Esteban, arma el contexto de Odoo y
  deja en cola solo lo que necesita juicio.
- **W2 `radar-ex/pendientes` y `radar-ex/veredicto`** (webhooks con `x-fts-key`): el servicio pide
  hasta N pendientes y devuelve un veredicto por correo. n8n valida el JSON contra el esquema **otra
  vez**: no confía en el servicio.
- **W3 `radar-ex/enviar`** (Schedule 15 min, desfasado): arma y manda los reportes, y a las 18:00 el
  corte diario.
- **Servicio `radar-clasificador`** (Railway, cron): un script de ~150 líneas que pide pendientes,
  llama a `claude -p` una vez por correo y devuelve el veredicto. El script solo mueve datos; el juicio
  lo hace Claude Code.

### 2.2 Cómo se dispara Claude Code sin supervisión

| Opción | A favor | En contra |
|---|---|---|
| **A. Servicio cron en Railway con `claude -p` sin herramientas** ← **recomendada** | Aislamiento real: `--tools ""` + `--strict-mcp-config` sin MCP + `--safe-mode` (verificados en `claude --help` 2.1.283) dejan al modelo sin ninguna capacidad; una inyección solo puede cambiar el JSON. Corre en la red privada de Railway: el cuerpo del correo va de n8n al servicio sin salir a internet, y solo sale hacia Anthropic. No consume memoria del proceso de n8n (§20 #14). Cron preciso, sin tope de frecuencia. Logs privados | Un servicio nuevo que mantener (imagen con Node + Claude Code con versión fija). Necesita una llave de Anthropic dedicada. Si el servicio muere, el latido lo delata (cuenta pendientes sin veredicto) |
| B. GitHub Action (#124) con cron | Sin servicio nuevo, secretos de GitHub, `claude-code-action` oficial | **`yinyo1/fts-suite` es público: los logs de las Actions también lo son.** Un `console.log` o un error con el cuerpo de un correo lo publica. El cron de GitHub se retrasa 10–60 min en horas pico. #124 no está construido (no existe `.github/`). Solo viable en un repo privado aparte |
| C. Routine de Claude Code (sesión programada en claude.ai) | Cero infraestructura, sin llave aparte | La sesión trae **todas** las herramientas y los conectores de la cuenta, incluido Microsoft 365, que puede enviar correo. Un correo con instrucciones escondidas estaría dentro de una sesión capaz de actuar. Frecuencia mínima de 1 hora. Transcripts con contenido de correo en la cuenta |
| D. Comando dentro de n8n (`Execute Command`) | Todo en un lugar | Corre dentro del proceso compartido de n8n, que es justo lo que §20 #14 prohíbe cargar. En n8n 2.x ese nodo viene apagado |

**Recomiendo A.** Es la única de las cuatro donde el modelo que lee el correo no puede hacer nada más
que contestar un JSON. Invocación por correo:

```bash
claude -p --tools "" --strict-mcp-config --safe-mode --no-session-persistence \
  --model sonnet --max-budget-usd 0.25 \
  --output-format json --json-schema "$(cat veredicto.schema.json)" \
  --append-system-prompt "$(cat prompt-sistema.md)" < correo.txt
```

Llave: **`ANTHROPIC_API_KEY` dedicada** («fts-radar-ex», separada de la de n8n) antes que un token de
la suscripción. Así el costo se ve aparte y se puede rotar sin tocar nada más (decisión D2).

### 2.3 Seguridad: el correo es entrada no confiable

1. **El modelo no tiene herramientas.** Sin Bash, sin red, sin MCP, sin archivos. Aunque lo engañen,
   no tiene con qué actuar.
2. **Delimitado con marca aleatoria.** El correo va entre `<<CORREO-{nonce}>>…<</CORREO-{nonce}>>`
   con un nonce distinto por corrida, y el prompt dice que todo lo que está adentro es dato.
3. **Salida cerrada.** `--json-schema` en el servicio y validación otra vez en n8n (W2). Si no pasa:
   un reintento, después `error_juicio`, y aparece en el corte diario. Nunca se descarta en silencio.
4. **Destinatarios fijos en n8n** (`Set - config`). Ningún campo del veredicto llega a `toRecipients`.
5. **Textos saneados.** `razon` y `siguiente_paso` con largo máximo, sin URLs (n8n las quita) y con
   HTML escapado al pintar.
6. **`partner_id` solo de la lista que n8n le pasó.** Si propone otro, n8n lo pone en `null`.
7. **Red contra un «no importa» inducido.** Si Claude descarta un correo de un dominio que Odoo tiene
   como cliente o proveedor, el corte diario lo lista con su asunto. Una inyección que diga «marca esto
   como no importante» queda a la vista al día siguiente.
8. **Señales de riesgo como dato.** El esquema trae `senales_riesgo` (cambio de cuenta bancaria,
   dominio parecido, instrucciones al sistema, pide credenciales). Un buzón huérfano es blanco
   clásico de fraude de proveedor; esos correos se reportan con alerta, nunca se descartan.
9. **Nada se abre ni se sigue.** Ni ligas ni adjuntos ejecutables. En v1 el modelo ve solo nombres,
   tipos y tamaños de adjuntos; el texto de PDF entra en v2 solo para dominios de negocio.

Esquema del veredicto:

```json
{
  "type": "object", "additionalProperties": false,
  "required": ["ref","importa","categoria","contraparte","razon","siguiente_paso","urgencia","confianza","senales_riesgo"],
  "properties": {
    "ref":            {"type": "string", "maxLength": 64},
    "importa":        {"type": "boolean"},
    "categoria":      {"enum": ["cliente_orden_compra","cliente_seguimiento","cliente_cotizacion_rfq","cliente_cobranza",
                                "proveedor_pago_entrega","proveedor_cotizacion","legal_contrato","riesgo_fraude",
                                "interno_fts","personal","masivo_promocion","notificacion_sistema","otro"]},
    "contraparte": {"type": "object", "additionalProperties": false, "required": ["tipo","nombre","partner_id"],
      "properties": {
        "tipo":       {"enum": ["cliente","proveedor","prospecto","interno","desconocido","ninguno"]},
        "nombre":     {"type": "string", "maxLength": 120},
        "partner_id": {"type": ["integer","null"]}}},
    "razon":          {"type": "string", "maxLength": 400},
    "siguiente_paso": {"type": "string", "maxLength": 300},
    "urgencia":       {"enum": ["alta","media","baja"]},
    "confianza":      {"type": "number", "minimum": 0, "maximum": 1},
    "senales_riesgo": {"type": "array", "maxItems": 5,
      "items": {"enum": ["pide_cambio_cuenta_bancaria","dominio_parecido","instrucciones_al_sistema","pide_credenciales","adjunto_sospechoso"]}}
  }
}
```

### 2.4 Privacidad: lo personal no se lee ni se reenvía

El filtro de sobre (W1) decide con **remitente, asunto y encabezados**, sin descargar cuerpo ni
adjuntos. Orden de reglas, la primera que aplica gana:

1. **Lista personal → descartar sin leer.** Remitentes de banca y alertas (`alertas@`,
   `notificaciones.*`, dominios de bancos), nómina e IMSS/SAT dirigidos a la persona, empleo
   (LinkedIn, OCC, Indeed, Computrabajo), redes, tiendas y promociones, más cualquier correo con
   `List-Unsubscribe` o `Precedence: bulk` **que no sea de un dominio de negocio**. Esta lista gana
   sobre la blanca: el banco de FTS es proveedor en Odoo, pero su estado de cuenta a nombre de Aldo es
   personal.
2. **«No importa» de Montalvo** (remitente o dominio) → descartar sin leer.
3. **Lista blanca de Odoo** (`res.partner` con `customer_rank > 0` o `supplier_rank > 0`, limpiada
   igual que el radar de POs) → a juicio, marcado como dominio de negocio.
4. **`fts.mx`** (compañeros que no saben que la persona se fue) → a juicio.
5. **Desconocido** → a juicio. Aquí es donde aparecen clientes nuevos, y el modelo decide.

**Qué se guarda de un descarte personal:** buzón, fecha, tipo de regla e `internetMessageId`
(para no volver a evaluarlo). **No** se guardan remitente ni asunto. El corte diario solo muestra
conteos por tipo.

**Retención de lo que sí se lee:** el texto del cuerpo vive en Postgres solo mientras está pendiente
de juicio y se borra al recibir el veredicto (queda su sha256). El `.eml` no se guarda: W3 lo baja de
Graph al momento de enviar.

**Antes de encender:** confirmar con Legal que leer los buzones corporativos de ex-empleados está
cubierto por la política interna y el aviso de privacidad. El diseño minimiza lo que se lee, pero no
sustituye esa confirmación.

### 2.5 El correo que llega

- **De:** `sales@fts.mx` · **Para:** Esteban y Montalvo (fijos en config).
- **Asunto:** `[Radar ex-empleado] <cliente o proveedor> - <asunto original>` (sin contraparte:
  `Remitente por identificar`; con señales de riesgo: `ALERTA posible fraude`).
- **Arriba:** por qué hay que darle seguimiento, siguiente paso y urgencia. Debajo: contraparte,
  buzón de origen, remitente y fecha. Con señales de riesgo, un recuadro rojo antes que todo.
- **Adjunto:** `original.eml` (`GET /users/{buzón}/messages/{id}/$value`), con el hilo completo y sus
  archivos. Outlook lo abre y se puede contestar desde ahí.
- **Botón «Marcar no importa»** → página en Pages (2.7).
- `.eml` de más de ~3 MB: v1 manda el reporte sin adjunto y dice «el original pesa X MB, ábrelo en el
  buzón de …» (decisión D5).

### 2.6 Idempotencia y bitácora (Postgres, esquema `radar_ex`)

Migración `db/migrations/radar/010_radar_ex_empleados.sql` (numeración global, rol `radar_app`
`NOLOGIN` sin contraseña en el repo):

| Tabla | Para qué | Llave |
|---|---|---|
| `buzon` | la lista configurable: correo, activo, fecha de alta, desde cuándo leer, nota | `correo` |
| `cursor` | último corte leído por buzón (en vez de `staticData`, que se pierde al reimportar y en pruebas) | `buzon` |
| `mensaje` | un renglón por correo visto: buzón, `internet_message_id`, `graph_id`, recibido, dominio, regla de sobre, estado | `(buzon, internet_message_id)` único |
| `pendiente` | cuerpo en texto + contexto mientras espera juicio; se borra al juzgar | `mensaje_id` |
| `veredicto` | el JSON validado, modelo, versión del prompt, duración, costo | `mensaje_id` |
| `envio` | a quién, cuándo, respuesta de Graph | `mensaje_id` único |
| `regla` | listas: personal, «no importa», con origen (semilla, Montalvo) y quién/cuándo | `(tipo, valor)` |
| `feedback` | cada clic de Montalvo, con el mensaje de origen | `id` |

Estados de `mensaje`: `nuevo → descartado_sobre | cubierto_po_radar | pendiente_juicio → juzgado →
reportado | descartado_juicio`, más `error_juicio` (2 reintentos) y `error_envio`. `envio` es único por
mensaje y se escribe **antes** de llamar a Graph con estado `enviando`: un reintento de W3 nunca manda
dos veces. Anti-bucle: se ignoran correos de `sales@fts.mx` y asuntos que empiezan con
`[Radar ex-empleado]`.

### 2.7 «No importa» de Montalvo

El botón del correo abre una **página en Pages** con cuatro opciones (este correo / este remitente /
este dominio / sí importa pero la razón estaba mal), y es la página la que manda un POST firmado a n8n.
**No puede ser un enlace que guarde al abrirse:** Outlook y los antivirus abren los enlaces de los
correos para revisarlos, y marcarían «no importa» solos. Firma HMAC por mensaje con vencimiento de
14 días (`FTS_RADAR_KEY`). Remitente y dominio se aplican en el filtro de sobre, sin llegar a Claude.
«La razón estaba mal» se guarda como ejemplo corregido para el prompt. Cada lunes llega un resumen de
lo marcado, para que una regla mal puesta no quede escondida.

### 2.8 Latido

Corte diario a las 18:00 CST, aunque no haya nada: corridas, nuevos, reportados, descartados por regla
(solo conteos para lo personal), cubiertos por el radar de POs, errores y **pendientes sin veredicto
de más de 1 hora** (así se ve si el servicio de Claude Code se cayó). Si el correo no llega, el radar
está caído.

---

## Paso 3 · Prototipo

`docs/radar-ex-empleados/prototipo.html`: seis correos demo (cliente, proveedor, estado de cuenta,
alerta de LinkedIn, intento de fraude con instrucciones escondidas y una PO que ya vio el radar de
POs), cada etapa, el JSON del veredicto, el correo que llega, el corte diario y la página de
«no importa». Empresas, personas y montos son ficticios.

---

## Pasos que te tocan a ti

### 3.1 Decisiones (antes de construir)

| # | Decisión | Recomendación |
|---|---|---|
| D1 | Cómo se dispara Claude Code | A: servicio cron en Railway con `claude -p` sin herramientas |
| D2 | Llave para `claude -p` | `ANTHROPIC_API_KEY` dedicada «fts-radar-ex», con tope de gasto en la consola |
| D3 | ¿La regla «razonamiento fuera de n8n» aplica también al radar de POs? | Sí, pero en su propio issue, cuando este servicio esté probado; aquí no se toca |
| D4 | PO que llega solo al buzón de un ex-empleado | Reportarla aquí con etiqueta «Posible PO: no pasó por el radar de POs», a ustedes dos, no al grupo |
| D5 | `.eml` de más de ~3 MB | v1 sin adjunto y con aviso. Si pasa seguido, v2 con `Mail.ReadWrite` acotado a `sales@` para sesiones de carga |
| D6 | Desde cuándo leer | Solo correos nuevos desde que se encienda. Opcional: un barrido único de 30 días que llegue como un solo resumen |
| D7 | Modelo | `sonnet`, con `--max-budget-usd` por correo; subir a `opus` si la calidad lo pide |

### 3.2 Exchange Online (PowerShell)

```powershell
Connect-ExchangeOnline

# --- 0. Solo lectura: ver lo que existe hoy (no cambia nada) ---
Get-ManagementScope "FTS PO Radar" | Format-List Name,RecipientRestrictionFilter
$sp = Get-ServicePrincipal | Where-Object AppId -eq '45131668-92ec-4819-b2d6-826773abb852'
$sp | Format-List DisplayName,AppId,ObjectId,Identity
Get-ManagementRoleAssignment -RoleAssignee $sp.Identity | Format-Table Name,Role,CustomResourceScope
Get-ApplicationAccessPolicy | Format-List Identity,AppId,ScopeIdentity,AccessRight

# --- 1. ¿Los buzones siguen vivos? ---
Get-Mailbox <correo-aldo>      | Format-List RecipientTypeDetails,ForwardingSmtpAddress,ForwardingAddress,CustomAttribute10
Get-Mailbox <correo-luisangel> | Format-List RecipientTypeDetails,ForwardingSmtpAddress,ForwardingAddress,CustomAttribute10
# Si alguno es UserMailbox y se le va a quitar (o ya se le quitó) la licencia, convertirlo ANTES:
#   Set-Mailbox <correo> -Type Shared
# Si ya tienen reenvío (ForwardingSmtpAddress), avísame: cambia el diseño.

# --- 2. El atributo que marca "este buzón entra al radar" ---
# Confirmar que nadie usa CustomAttribute10 (debe salir vacío):
Get-Mailbox -ResultSize Unlimited | Where-Object CustomAttribute10 | Format-Table Name,CustomAttribute10
Set-Mailbox <correo-aldo>      -CustomAttribute10 "radar-ex-empleado"
Set-Mailbox <correo-luisangel> -CustomAttribute10 "radar-ex-empleado"

# --- 3. Scope nuevo, separado de "FTS PO Radar" ---
New-ManagementScope -Name "FTS Radar Ex-empleados" `
  -RecipientRestrictionFilter "CustomAttribute10 -eq 'radar-ex-empleado'"

# --- 4. Segunda asignación del mismo rol al mismo service principal ---
New-ManagementRoleAssignment -Name "n8n-mail-sender - Mail.Read - Radar ex-empleados" `
  -Role "Application Mail.Read" -App $sp.Identity -CustomResourceScope "FTS Radar Ex-empleados"

# --- 5. Verificación (tarda de 30 min a 2 h en propagar) ---
Test-ServicePrincipalAuthorization -Identity $sp.Identity -Resource <correo-aldo>       # Mail.Read: InScope True
Test-ServicePrincipalAuthorization -Identity $sp.Identity -Resource <correo-luisangel>  # Mail.Read: InScope True
Test-ServicePrincipalAuthorization -Identity $sp.Identity -Resource sales@fts.mx        # Mail.Read: InScope False
Test-ServicePrincipalAuthorization -Identity $sp.Identity -Resource <correo-esteban>    # sigue True (FTS PO Radar)
```

- **Para agregar un buzón en el futuro:** `Set-Mailbox <correo> -CustomAttribute10 "radar-ex-empleado"`
  y darlo de alta en `radar_ex.buzon`. Para quitarlo: vaciar el atributo y marcarlo inactivo.
- **Para apagar todo el radar:** `Remove-ManagementRoleAssignment "n8n-mail-sender - Mail.Read - Radar ex-empleados"`.
- **No hagas** ninguna edición a «FTS PO Radar».

### 3.3 Entra ID

Nada que agregar. Solo verificar en *App registrations → n8n-mail-sender → API permissions* que
`Mail.Read` **no** aparece como permiso de aplicación concedido. Si aparece, el scope no limita nada.

### 3.4 Railway (cuando apruebes el diseño, antes de que construya)

1. En `Primary`: variable `FTS_RADAR_KEY` = `${{secret(48)}}` (así el valor no pasa por nadie). En
   `Worker`: `FTS_RADAR_KEY` = `${{Primary.FTS_RADAR_KEY}}`. Redespliega n8n ~1 min: hazlo en horario
   tranquilo (fuera de 07:00–18:00 CST, §20 #14).
2. En la consola de Anthropic: llave nueva «fts-radar-ex» con tope mensual. La pones tú como variable
   del servicio `radar-clasificador` cuando lo cree (yo creo el servicio sin la llave).

### 3.5 Postgres (después de que aplique la migración `010`)

```
psql -U fts_admin -d fts_suite
\password radar_app
ALTER ROLE radar_app WITH LOGIN;
```
Y en n8n → Credentials → New → Postgres: «fts-suite-db · radar_app», mismo host privado que
`comercial_app`.

---

## Lo que haré yo cuando apruebes (en orden, cada paso con read-back)

1. Con el scope ya propagado: medir en seco el volumen de los dos buzones (30 días, solo sobre:
   remitente y asunto contados por regla, sin leer cuerpos). Si es mucho mayor de lo esperado, paro y
   reporto.
2. Migración `010` + aplicarla con `comercial/db-migrate` (verificar primero que lee otras carpetas
   además de `comercial/`).
3. W1, W2 y W3 en modo `dry` (no envía; escribe el correo que habría mandado en la bitácora).
4. Servicio `radar-clasificador` con Claude Code en versión fija y el prompt versionado en el repo.
5. Una semana en `dry` con el latido a Esteban; revisar juntos qué habría llegado; después a `real`.
