# Capacidad de n8n: plan para desplegar el Worker (F17, sólo documento)

> **Nada de esto se ejecutó.** No se cambió ninguna configuración de n8n, de `Primary`, del
> `Worker`, de `Redis` ni de la base de n8n. Es el plan para hacerlo **con Esteban presente**.
> Es lo que falta para que los motores `memoria/*` puedan activarse con horario (ajuste 3 de #328).

## 1. Lo que se midió hoy (28-sep-2026, 08:10 UTC, Railway MCP)

| pieza | medición |
|---|---|
| `Primary` (n8n) | memoria 7 días: **promedio 0.77 GB, máximo 1.21 GB**, límite 8 GB. CPU promedio 0.006 vCPU. Último deploy 2026-09-08 |
| `Worker` | `latestDeployment: null` (**nunca desplegado**). `startCommand: n8n worker`. Tiene `OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS`, `EXECUTIONS_MODE`, `QUEUE_BULL_REDIS_*`, `N8N_ENCRYPTION_KEY` |
| `Redis` | desplegado el 2026-04-03; el 18-sep (#250) sus métricas estaban en cero |
| Base de n8n (`Postgres`) | **3.61 GB de un volumen de 5 GB (72 %)**; creció de 3.49 a 3.64 GB en 7 días |

### 1.1 Hallazgo: al Worker le faltan variables que `Primary` sí tiene

Se comparó sólo la **lista de nombres** (no se leyó ningún valor).

**Tiene `Primary` y no tiene el `Worker`:**
`SUITE_JWT_SECRET`, `FINANZAS_JWT_SECRET`, `FINANZAS_USER_HASH`, `FINANZAS_USER_SALT`, `ODOO_API_KEY`,
`ODOO_PASSWORD`, `ODOO_RPC_KEY`, `ODOO_URL`, `ODOO_USER`, `JEEVES_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPO`,
`PMO_CHAT_HMAC_SECRET`, `N8N_BLOCK_ENV_ACCESS_IN_NODE`, `N8N_RUNNERS_DISABLED`, `EXECUTIONS_DATA_*`
(retención), `N8N_PROXY_HOPS`, `N8N_TRUST_PROXY`, `N8N_EDITOR_BASE_URL`, entre otras.

**Por qué importa:** en modo cola, **la ejecución corre en el Worker**. Todo workflow que lea
`$env.X` en un nodo Set tomaría `undefined` en el Worker. Eso incluye `auth/verificar-scope`,
`auth/finanzas-login`, `auth/suite-login` y la captura bancaria. Hay que resolverlo **antes** de
encender el modo cola, o los logins y el kiosko fallarían justo al activarlo. Algunos fallarían
cerrados y otros con error. Es el mismo modo de falla de §14 de CLAUDE.md: «un pendiente viejo
del backlog se lee como hecho».

Además, `N8N_RUNNERS_DISABLED` y `N8N_BLOCK_ENV_ACCESS_IN_NODE` cambian cómo corren los nodos
Code. Si el Worker no los trae iguales, un Code que hoy funciona podría comportarse distinto.

## 2. Qué resuelve el Worker y qué no

- **Sí resuelve:** el trabajo pesado (motores, cargas del histórico, ejecuciones manuales, que
  van al Worker por `OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS`) deja de competir por memoria con los
  webhooks del kiosko y de Confirmar Horas. El incidente del 18-sep (#250) habría quedado
  confinado al Worker.
- **No resuelve:** que la base de n8n se llene, ni que Odoo limite por IP (§20 #14). Tampoco
  cambia nada de la memoria: **la captura de WhatsApp no pasa por n8n** (D3), así que su volumen
  no depende del Worker.

## 3. Orden seguro (con Esteban presente, fuera de 07:00–18:00 CST)

| # | paso | reversible | riesgo para el kiosko |
|---|---|---|---|
| 0 | Respaldar la base de n8n: activar los **Backups de volumen** de `Postgres` en Railway y tomar uno manual | — | ninguno |
| 1 | Leer (tú, en el dashboard) el valor de `EXECUTIONS_MODE` en `Primary`. Si **no** es `queue`, hoy todo corre en `Primary` | — | ninguno |
| 2 | **Copiar al Worker** las variables de §1.1 como **referencias** (`${{Primary.SUITE_JWT_SECRET}}`, …), no como valores pegados, para que una rotación en `Primary` llegue sola al Worker | sí | ninguno (el Worker sigue sin desplegar) |
| 3 | Confirmar que `N8N_ENCRYPTION_KEY` del Worker es **referencia** a la de `Primary`. Si difiere, el Worker no puede descifrar credenciales | sí | ninguno |
| 4 | Verificar `Redis`: que esté arriba y que `Primary` y el Worker apunten al mismo host y contraseña (`QUEUE_BULL_REDIS_*`) | sí | ninguno |
| 5 | **Desplegar el Worker** con `EXECUTIONS_MODE=queue` en el Worker. `Primary` sigue en `regular` | sí (Remove deployment) | ninguno: `Primary` todavía no manda nada a la cola |
| 6 | Ver en los logs del Worker `Worker ready` y la conexión a Redis | — | ninguno |
| 7 | Cambiar `Primary` a `EXECUTIONS_MODE=queue` → **esto reinicia `Primary` (~1 min sin webhooks)** | sí (regresar a `regular`) | **~1 min de kiosko caído** |
| 8 | Prueba inmediata: un check-in real (Felipe), un login a la suite y una ejecución manual de `memoria/pruebas` (debe aparecer en el Worker) | — | — |
| 9 | Si algo falla: `Primary` → `EXECUTIONS_MODE=regular` y todo vuelve a como estaba | — | ~1 min |
| 10 | Una semana de observación antes de activar el primer motor `memoria/*` con horario | — | — |

## 4. La base de n8n al 72 %

- Crece unos **0.15 GB por semana** en la última semana medida. A ese ritmo, los 5 GB se llenan
  en **unas 9 semanas**. Es una extrapolación de 7 días: se re-mide antes de decidir.
- **Primero medir qué pesa**, antes de ampliar (§20 #14: «subir el límite antes de saber qué lo
  consume no quita el problema»). Normalmente es `execution_data`. La retención ya está en 14
  días (`EXECUTIONS_DATA_MAX_AGE=336`). Hay workflows que guardan ejecuciones exitosas muy
  seguido: `ops/eco-confirmacion (W6)` corre cada 5 min y `po/radar-detectar` cada 15. Poner
  `saveDataSuccessExecution: none` en esos dos baja el crecimiento sin perder los errores.
- **Ampliar el volumen** en Railway es posible, pero redespliega `Postgres` y con él n8n, así que
  hay unos minutos de kiosko caído. Va en la misma ventana que el paso 7, no aparte.
- El espacio que ocupan filas ya podadas no se libera sin `VACUUM FULL`, que bloquea tablas. Eso
  requiere ventana con n8n detenido. No es necesario mientras se controle el crecimiento.

## 5. Qué hace la memoria mientras tanto

- Los motores `memoria/*` están **construidos e inactivos**. Corren a mano (ejecución manual de
  n8n) y sólo proponen.
- Toda la lógica pesada vive en **funciones SQL** de `fts-suite-db` (decisión N13). El nodo de
  n8n sólo invoca una función, así que cada corrida usa muy poca memoria de n8n. Eso los hace
  razonables de encender, con horarios espaciados, incluso **antes** del Worker, si Esteban así
  lo decide. La recomendación sigue siendo esperar al paso 10.
