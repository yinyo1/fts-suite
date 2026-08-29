# Módulo Comercial — Propuesta de alcance 1.0

**Fecha:** 2026-08-29 (sesión 0) · Base: [`ROADMAP.md`](ROADMAP.md) (issue #127) + [`AUDITORIA-2026-08.md`](AUDITORIA-2026-08.md).
Criterio de salida de 1.0 (rector §4): **el equipo comercial usa la hoja CRM en lugar del tracker SharePoint** — cambio de hábito comprobado, no código terminado.

---

## 1. Qué se rescata, qué se reescribe, qué se borra

### Se rescata (funciona o es la base correcta)

| Pieza | Justificación |
|---|---|
| `comercial/js/comercial-client.js` (patrón completo) | El mejor cliente del Suite: JWT en body + HMAC de dispositivo + cadena canónica versionada + anti-replay ±10 min + manejo fino de 401. Interop probada 12/12. Se extiende (más endpoints), no se reescribe. |
| Workflow `comercial/captura` (`tEra7MVCvnWjAqjR`) | Diseño de auth correcto; solo necesita: identidad real en vez de `sub:'finanzas'`, escribir `x_studio_dndole`, e insertar el expediente en Postgres. Se modifica, no se rehace. |
| Workflow `comercial/watchdog-enviadas` (`hJNTUd8E57W4rfjU`) | La lógica de buckets/normalización MXN/config-en-vivo está probada 15/15. Se modifica la SEÑAL (`write_date` → `mail.message`, su propia deuda documentada) y se activa. |
| Tests (`hmac-interop`, `watchdog-enviadas`) | Se conservan y se les agrega el gate anti-divergencia (plantilla única estilo `motor-v2.js` §19). |
| `shared/comercial/watchdog_enviadas.json` | Patrón config-en-vivo anti-Hallazgo#14 correcto. Se le agregan los umbrales de temperatura para que el front deje de hardcodear 4/6. |
| `comercial/baseline.md/.json` | Referencia cuantitativa histórica; se archiva como está (fue snapshot, no sistema). |
| Reuso de `auth-fin.js` por referencia | El patrón JWT server-side es el correcto (rector §2); lo que cambia es el ISSUER (identidad por persona), no el cliente. |

### Se reescribe

| Pieza | Por qué | En qué se convierte |
|---|---|---|
| `comercial/index.html` (tab "Mi Pipeline" de cards) | El rector 1.x pide **hoja densa tipo Excel** con escritura, no cards de lectura. La captura sobrevive como sección. | `comercial/` reestructurado: `core/` (auth, cliente API, modelo de expediente, tabla densa reutilizable) + `crm/` (hoja + bandeja) + la captura dentro de `crm/`. |
| Workflow `comercial/pipeline` (`60ZLskz1xJ7nU5kt`) | Su contrato (cards + semáforo 4/6) no alcanza para la hoja (columnas, último toque por chatter, temperatura, escritura). | `comercial/crm-hoja` (lectura) + `comercial/crm-editar` (escritura con HMAC). El de pipeline se archiva cuando la hoja lo sustituya — **no se borra en sesión 0**. |
| Gate "dirección" hardcode `[2]` | Anti-patrón §13; con identidad por persona el rol sale del JWT (y a futuro de `derivar-roles`). | Claim `role`/`vendedor` real en el JWT nuevo. |

### Se borra (NADA en sesión 0; propuesta para cuando Esteban apruebe)

| Pieza | Cuándo |
|---|---|
| Workflow legacy n8n `sale/crear-proyecto-al-confirmar` (`XhuTlvPKDBjkDeso`, inactivo) | Ya era pendiente §17 CLAUDE.md; ajeno al módulo pero aparece en su frontera. |
| Workflow `comercial/pipeline` | Al liberar la hoja (archivar, no delete, regla §7). |
| Campos Studio muertos: `x_studio_notas_cortas` (1 registro), `x_studio_estatus_de_operaciones_1` (14), duplicado `x_studio_purchase_order_` | En la limpieza de datos (sesión 1), con confirmación de Esteban campo por campo. |
| Etapas redundantes de `crm.lead` (consolidación 12 → ~7) | Sesión 1, con mapping aprobado por Esteban (ver §6 preguntas). |

---

## 2. Postgres 1.0 — esquema mínimo

**Dónde:** el servicio `Postgres` existente del proyecto Railway de n8n (verificado en la auditoría §d.1; costo marginal ≈ $0). **Database separada `comercial` + rol `comercial_app`** con permisos solo sobre ella (aislamiento lógico de la DB de n8n sin pagar servicio nuevo). n8n accede con una credencial Postgres nueva dedicada (la crea Esteban en la UI de n8n; el rol no puede tocar la DB de n8n). Backup: pg_dump diario vía workflow n8n a SharePoint/Storage (definir en sesión 2).

**DDL (1.0 = expediente + evidencia + propuesta):**

```sql
-- database: comercial (owner comercial_app)
CREATE SCHEMA IF NOT EXISTS comercial;

-- El expediente es el hilo conductor (rector §1). En 1.0 nace en la captura y
-- se liga a Odoo por lead_id/so_id; NUNCA duplica lo que Odoo modela.
CREATE TABLE comercial.expediente (
  id            BIGSERIAL PRIMARY KEY,
  lead_id       INTEGER UNIQUE,            -- crm.lead (NULL solo mientras el amarre está pendiente)
  so_id         INTEGER,                   -- sale.order cuando exista
  cliente       TEXT NOT NULL,             -- snapshot de captura; la verdad viva es partner en Odoo
  tipo_proyecto TEXT,
  rango         TEXT CHECK (rango IN ('<200K','200K-1M','1M-3M','3M-5M','>5M')),
  carril        TEXT CHECK (carril IN ('expres','normal')),
  origen        TEXT NOT NULL,             -- referido|cliente_existente|marketing|portal|otro
  score_marketing NUMERIC,                 -- puerta marketing (rector 1.x): NULL si no aplica
  estado        TEXT NOT NULL DEFAULT 'abierto',   -- abierto|ganado|perdido|cancelado
  creado_por    TEXT NOT NULL,             -- sub del JWT (identidad por persona)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Capa de ingesta (rector §3, paso 1). Insert-only; texto LITERAL siempre.
CREATE TABLE comercial.evidencia (
  id            BIGSERIAL PRIMARY KEY,
  expediente_id BIGINT REFERENCES comercial.expediente(id),
  lead_id       INTEGER,                   -- NULL = huérfana (ahí nacen los leads nuevos)
  fuente        TEXT NOT NULL,             -- manual|correo|teams|plaud|whatsapp
  fecha_evento  TIMESTAMPTZ NOT NULL,      -- cuándo ocurrió (no cuándo se capturó)
  autor         TEXT,
  texto         TEXT NOT NULL,             -- literal, sin resumir
  archivo_ref   TEXT,                      -- URL SharePoint / ir.attachment id (vía #125 cuando exista)
  hash          CHAR(64) NOT NULL UNIQUE,  -- sha256(fuente|fecha|texto) → dedupe e idempotencia
  amarre        TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente|amarrada|huerfana
  amarre_motivo TEXT,                      -- SO mencionada / cliente / contacto / hilo
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Motor de propuestas (rector §3, pasos 3-5). En 1.0 la bandeja existe aunque esté vacía.
CREATE TABLE comercial.propuesta (
  id            BIGSERIAL PRIMARY KEY,
  lead_id       INTEGER,
  evidencia_id  BIGINT NOT NULL REFERENCES comercial.evidencia(id),
  accion        TEXT NOT NULL CHECK (accion IN
                  ('nuevo_lead','follow_up','cotizacion_enviada','cambio_fecha_cierre',
                   'visita','compromiso','cliente_en_revision','perdida')),
  valor_nuevo   JSONB NOT NULL,            -- payload tipado por accion
  cita_literal  TEXT NOT NULL,             -- regla: sin cita literal no hay propuesta
  confianza     NUMERIC(3,2) NOT NULL CHECK (confianza BETWEEN 0 AND 1),
  vip           BOOLEAN NOT NULL DEFAULT false,   -- VIP nunca se auto-aplica
  estado        TEXT NOT NULL DEFAULT 'pendiente', -- pendiente|aprobada|corregida|rechazada|aplicada
  resuelto_por  TEXT,
  resuelto_at   TIMESTAMPTZ,
  aplicada_ref  TEXT,                      -- id de nota chatter / actividad creada en Odoo
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON comercial.evidencia (lead_id);
CREATE INDEX ON comercial.evidencia (amarre) WHERE amarre <> 'amarrada';
CREATE INDEX ON comercial.propuesta (estado) WHERE estado = 'pendiente';
CREATE INDEX ON comercial.propuesta (lead_id);
```

Fuera de 1.0 a propósito (nacen con 2.x): machote, BOM, precios versionados, simulaciones, versiones congeladas.

---

## 3. Workflows n8n 1.0 (contratos)

Reglas de casa aplicables a todos: nacen INACTIVOS · customResource verificado con read-back · "Always Output Data" ON en nodos Odoo · secretos vía `$env` en nodo Set · escrituras con HMAC + anti-replay (patrón de captura; migrar al sub-workflow de #123 cuando exista) · Timezone UTC explícito en schedules.

### 3.1 `auth/comercial-login` (NUEVO) — o extensión multi-usuario de `auth/finanzas-login`
- **Entrada:** `POST /comercial/login` `{usuario, password}`.
- **Salida:** `{token}` JWT 8h con `sub:'<usuario>'`, `role:'vendedor'|'direccion'`, `dndole:'<valor selection>'`.
- Mismo criptostack (PBKDF2 100k + HMAC JWT, JS puro), usuarios en env vars (uno por persona del equipo comercial). **Resuelve el bloqueante #1** (atribución) y separa la sesión de Finanzas (localStorage key propia `fts_com_session`).

### 3.2 `comercial/captura` (MODIFICAR `tEra7MVCvnWjAqjR`)
- **Entrada (sin cambio de shape):** `{cliente, descripcion, rango, origen, ts, token}` + header `x-fts-signature`.
- **Cambios:** `capturado_por` sale del `sub` real → escribe `x_studio_dndole` + deja de caer en el fallback Esteban; INSERT paralelo a `comercial.expediente` (best-effort, `onError:continue` — Odoo es la verdad del lead); respuesta agrega `expediente_id`.
- **Salida:** `{lead_id, expediente_id, owner, fallback_owner}`.

### 3.3 `comercial/crm-hoja` (NUEVO — sustituye a `pipeline`)
- **Entrada:** `POST /comercial/crm-hoja` `{token, filtros?:{etapa, dndole, temperatura}, cursor?}`.
- **Lee:** `crm.lead` abiertos (post-limpieza: `stage_id` no en {ganado, cancelado}) + `mail.message` (último toque real) + `ir.activity`/`activity_ids` (próximo paso) + `comercial.propuesta` (conteo pendientes por lead).
- **Salida:** `{rows:[{lead_id, columnas de §4}], resumen:{por_temperatura, total}, pagination}`. Rol `direccion` ve todo; `vendedor` filtra por su `dndole`.

### 3.4 `comercial/crm-editar` (NUEVO — la escritura de la hoja)
- **Entrada:** `POST /comercial/crm-editar` `{token, ts, lead_id, cambios:{campo:valor}, comentario?}` + `x-fts-signature` (cadena canónica `v2|lead_id|json(cambios)|ts`).
- **Escribe en Odoo:** campos permitidos por lista blanca (`stage_id`, `expected_revenue`, `date_deadline`, `x_studio_dndole`, `x_studio_probabilidad_fts`, `x_studio_deadline_de_envio`) + `comentario` como nota fechada en chatter (`mail.message`, patrón author_id §18). Todo cambio deja traza en chatter.
- **Salida:** `{ok, lead_id, aplicado:{...}}` + el front RELEE la fila (regla: la UI no es fuente de verdad §8).

### 3.5 `comercial/evidencia` (NUEVO — fuente manual de la ingesta)
- **Entrada:** `POST /comercial/evidencia` `{token, ts, lead_id?, fecha_evento, texto, autor?}` + HMAC.
- **Hace:** hash sha256 → INSERT `comercial.evidencia` (dedupe por hash); si trae `lead_id`, nota en chatter del lead. Sin lead → huérfana visible en la bandeja.
- **Salida:** `{evidencia_id, amarre}`.

### 3.6 `comercial/propuestas` (NUEVO — bandeja, vacía en 1.0)
- **Entrada:** `POST /comercial/propuestas` `{token, accion:'listar'|'resolver', propuesta_id?, resolucion?:'aprobar'|'corregir'|'rechazar', valor_corregido?}` (resolver = HMAC).
- **Hace:** listar pendientes + huérfanas; al aprobar → aplica a Odoo (nota fechada, actividad, campos del lead) y marca `aplicada` con `aplicada_ref`. En 1.0 el motor de interpretación aún no puebla la tabla — la bandeja existe para que el hábito y el contrato queden listos.

### 3.7 `comercial/watchdog-enviadas` (MODIFICAR `hJNTUd8E57W4rfjU` + activar)
- Señal v2: días sin toque = hoy − max(`mail.message.date` del lead/SO), no `write_date` (mata el RIESGO-2). Resto igual (config en vivo, canary → equipo cuando la config diga).

**Diagrama objetivo 1.0:**

```
login → auth/comercial-login (JWT persona) ──────────────┐
captura → comercial/captura ──▶ crm.lead + expediente PG │
hoja    → comercial/crm-hoja ─▶ READ lead+chatter+PG ────┤ Odoo = resultado
editar  → comercial/crm-editar ▶ WRITE lead + chatter    │ PG  = taller
evidencia → comercial/evidencia ▶ PG (+chatter si amarra)│
bandeja → comercial/propuestas ▶ PG → (aprobado) → Odoo  │
cron    → comercial/watchdog-enviadas v2 ▶ correo        │
cron 5min → crear-proyecto-al-confirmar (SIN CAMBIOS en 1.0; lo sustituye 3.x)
```

---

## 4. Hoja CRM 1.0 — columnas exactas y origen

| # | Columna | Origen | Nota |
|---|---|---|---|
| 1 | Cliente | Odoo `crm.lead.partner_id` (fallback `partner_name`) | |
| 2 | Oportunidad | Odoo `crm.lead.name` | |
| 3 | Cotizador ("Dándole") | Odoo `crm.lead.x_studio_dndole` | post-limpieza del selection (fuera ex-FTS) |
| 4 | Responsable | Odoo `crm.lead.user_id` | hoy 62% `Sales FTS`; con un solo usuario Odoo por diseño, el responsable REAL es Dándole — columna se mantiene para detectar drift |
| 5 | Etapa | Odoo `crm.lead.stage_id` | post-consolidación (12 → ~7) |
| 6 | Monto | Odoo `crm.lead.expected_revenue` | |
| 7 | Moneda | Odoo `crm.lead.x_studio_currency`; fallback company del partner | regla T1: la empresa manda; RIESGO-1 sigue vivo en SO |
| 8 | Fecha esperada de cierre | Odoo `crm.lead.date_deadline` (nativo) | insumo de temperatura; hoy casi no se llena → hábito nuevo |
| 9 | Temperatura | **Calculada** en `crm-hoja` desde `date_deadline` | Caliente 0-30 verde · Tibio 31-90 naranja · Frío 91-180 azul · Purgatorio 180+ morado · Muerta rojo (rector 1.x); umbrales en `shared/comercial/` config, NO hardcodeados en el front |
| 10 | Último toque | **Calculada**: max(`mail.message.date`) del lead | la señal correcta (no `write_date`) |
| 11 | Próximo paso | Odoo actividad abierta más próxima (`activity_date_deadline` + summary) | crear actividad = escribir desde la hoja |
| 12 | Comentarios fechados | Odoo chatter (`mail.message` notas, últimas N) | escribir vía `crm-editar.comentario` |
| 13 | Propuestas pendientes | **Postgres** `comercial.propuesta` (count estado=pendiente por lead) | badge → abre bandeja |
| 14 | Deadline de envío | Odoo `crm.lead.x_studio_deadline_de_envio` | compuerta del paso 4-5 del proceso |
| 15 | Probabilidad FTS | Odoo `crm.lead.x_studio_probabilidad_fts` | la manual FTS, no la `probability` nativa |

Columnas 1–12 y 14–15 = Odoo (fuente de verdad); 9–10 calculadas por el workflow desde Odoo; 13 = Postgres. La hoja NUNCA pinta estado desde localStorage (regla §8 CLAUDE.md).

---

## 5. Orden de construcción (sesiones de CC) y estimación

> Estimaciones ya recalibradas a velocidad real de CC (regla rector §5: lo del chat corre 3-4x inflado). 1 sesión ≈ un bloque enfocado con verificación incluida.

| Sesión | Contenido | Est. | Gate de salida |
|---|---|---|---|
| **1. Limpieza de datos + decisiones** | Script one-shot n8n (dry-run primero, dump completo antes de escribir): 1,173 CANCELADO → lost+archivado; consolidación de etapas según mapping que apruebe Esteban; reasignación de los 331 leads ex-FTS; depurar selections `dndole`/`cotizador`; revisar `Usuario Taqueria JMZ` (81) y los 47 sin user_id. | 1 sesión + decisiones de Esteban (§6) | conteos post-limpieza verificados por query; pipeline activo < ~450 leads reales |
| **2. Identidad + infra** | `auth/comercial-login` (JWT por persona), sesión separada de Finanzas; database `comercial` + DDL §2 + credencial n8n + backup; activar los 2 workflows del MVP ya corregidos (captura con identidad+PG, watchdog v2) — incluye el checklist manual pendiente (env HMAC, customResource, timezone). | 1 sesión + ~20 min Esteban (Railway/n8n UI) | login por persona probado; lead de prueba `[TEST-CC]` creado y borrado; watchdog manual corrido con `intentadas>0` |
| **3. Hoja CRM (lectura)** | `core/` + tabla densa + `comercial/crm-hoja` (temperatura, último toque, próximo paso); bandeja visible vacía. | 1 sesión | hoja carga <3s con data real; números cuadran vs query directa |
| **4. Hoja CRM (escritura) + ingesta manual** | `comercial/crm-editar` (lista blanca + chatter + relectura), `comercial/evidencia`, `comercial/propuestas` (contrato completo, motor apagado). | 1 sesión | edición e2e verificada releyendo Odoo; evidencia dedupe por hash probado |
| **5. Rollout 1.0** | `users-suite.json` acceso al equipo, aprovisionamiento HMAC por dispositivo, watchdog a `equipo`, capacitación 1 página, bump build. | 0.5 sesión + adopción | criterio del rector: el equipo captura y da seguimiento en la hoja; SharePoint tracker sin usar 2 semanas |

Total: **~4.5 sesiones de CC** + decisiones/clics de Esteban. La puerta de marketing (POST con score de Pablo) y la fuente correo de la ingesta quedan como 1.x tras el corte (la segunda depende de #122/Azure).

---

## 6. Riesgos y preguntas abiertas para Esteban

### Riesgos

1. **Limpieza sobre 1,173+ leads es una escritura masiva a producción.** Mitigación: dry-run con dump completo previo (JSON en SharePoint/repo privado), lote reversible, y ventana acordada. Además una escritura masiva cambiará `write_date` de todo → razón extra para que el watchdog v2 (mail.message) entre ANTES de activar alertas al equipo.
2. **Identidad nueva toca el issuer de Finanzas** (si se extiende `auth/finanzas-login`) o duplica criptostack (si se crea `auth/comercial-login`). Propongo issuer NUEVO reutilizando el código probado — cero riesgo para el login de Finanzas en producción; costo: 2 workflows de auth que mantener.
3. **Postgres compartido con n8n**: un incidente de esa DB tumba ambos. Aceptado en 1.0 por costo $0; salida limpia a servicio dedicado si crece.
4. **RIESGO-1 (moneda) sigue vivo**: 127 órdenes MX marcadas USD. La hoja hereda el problema en el monto del lead; ningún total consolidado de la hoja es defendible hasta la corrección de datos en SO (¿va en la limpieza de sesión 1 o es tarea de Gera?).
5. **`availableInMCP:false` en todos los workflows** limita cada auditoría/edición futura de CC (solo metadata). Decidir política: habilitar por workflow al construirlo, o aceptar el PUT directo con API key como único camino.
6. **base.automation no auditable por MCP**: queda un punto ciego sobre crm/sale (SUPUESTO: no hay reglas ahí). Un vistazo de 2 min en la UI lo cierra.

### Preguntas (decisiones que solo tú puedes tomar)

1. **Mapping de etapas** — propuesta a validar: Prospecto → Calificado/Por cotizar → Cotización Enviada → Revisar → Ganado (`is_won`) → Perdido(lost). ¿"Adiccionales Topo (Monty)" y "Cot Enviada Mdlz" se absorben con un campo/tag por cliente? ¿Los 2 leads de "Proyecto Ganado - Con PO" se fusionan a Ganado?
2. **Los 331 leads de ex-FTS**: ¿reasignar a Aldo/Montalvo/Esteban por cartera, o mandarlos a revisión (etapa Revisar) y que el equipo los reclame?
3. **Los 530 "Proyecto Ganado" activos**: ¿se archivan (won cerrado) o el equipo los quiere ver en la hoja?
4. **Sesión separada de Finanzas** (login propio comercial): asumo que SÍ (rompe el "dar Comercial = dar Finanzas"). ¿Confirmas? ¿Quiénes son los usuarios iniciales (Aldo, Montalvo, tú, ¿Oscar/Ricardo?)?
5. **Estructura de carpetas**: el rector dice `app/comercial/`; el módulo vive en `comercial/` (URL ya publicada). Propongo quedarnos en `comercial/` con subcarpetas `core/`/`crm/` y reservar `app/` para cuando haya una migración general del Suite. ¿Ok?
6. **`x_studio_dndole` como selection** obliga a tocar Studio por cada alta/baja de persona. ¿Lo dejamos así en 1.0 (bajo churn) o lo migramos a char/many2one en la limpieza?
7. **Card del launcher**: ¿abrimos `comercial.acceso:true` a los 5 usuarios en el rollout, o el doble gate (FTSAuth + login comercial) es deseado?
8. **Watchdog al equipo**: ¿desde sesión 2 (canary→equipo) o hasta el rollout completo (sesión 5)?

### SUPUESTOS acumulados de la sesión 0

- `FTS_COMERCIAL_HMAC` no existe en Railway (no se listaron variables a propósito — regla de secretos).
- Los 6 `customResource` de los 3 workflows del MVP están en blanco (inferido de `updatedAt` congelado).
- El Postgres de Railway es la DB de n8n (único en el proyecto; sin conexión SQL en esta sesión).
- No hay `base.automation` sobre `crm.lead` (no verificable por MCP).
- "Nunca ejecutado" de los 3 workflows se infiere de `active:false` + `triggerCount:0` + sin ediciones (el historial de ejecuciones no es consultable por MCP).
