# Sprint Resiliencia — PR C: Queue offline del kiosk

> **Estado:** diseño detallado. NO implementado. Consume el contrato definido en `docs/SPRINT_RESILIENCIA_PR_D_DESIGN.md` §1.4.
> **Autor:** Claude Code · 28-may-2026 · grounded en `operaciones/kiosk/js/kiosk.js` + `odoo.js`.
> **Dependencia dura:** PR D debe mergear primero (entrega `client_tx_id`, `KioskError` tipado, `encolarTransaccionFallida` stub, render post-OK del confirm screen).

---

## Contexto

El forense del 27-may (`docs/INCIDENTES/2026-05-27-kiosk-checkout-outage-12h.md`) concluyó: **"Sistema sin queue offline = outage = pérdida de operación."** Durante las 12h de outage, 23 empleados no pudieron registrar checkout; 21 se sanearon al día siguiente vía recovery (10 auto-rescate limpios + 11 turnos fantasma de ~24h), 2 quedaron rotos.

PR D surfacea el fallo (el empleado ya no ve falso éxito) y enruta el recovery correcto. **Pero PR D no preserva el dato**: si la red cae, el registro se pierde y el empleado debe re-intentar (o el orphan se sanea con hora aproximada al día siguiente). **PR C cierra el ciclo: persiste la transacción fallida en el dispositivo y la reenvía sola cuando vuelve la conexión** — convirtiendo un outage de 12h en una demora de sincronización invisible, con la **hora real** del evento preservada.

### Qué entrega PR D vs PR C (división de responsabilidad)

| | PR D (hardening) | PR C (queue offline) |
|---|---|---|
| Clasificar error (NETWORK/TIMEOUT/5XX/…) | ✅ entrega | consume |
| Mostrar UX honesta por tipo | ✅ entrega | actualiza textos a "en cola" |
| `client_tx_id` en payload (idempotencia) | ✅ agrega al payload | usa para dedup en replay |
| `encolarTransaccionFallida()` | stub no-op | **implementa** vía `window.KioskQueue` |
| `window.KioskQueue` (persistencia + replay) | — | ✅ **entrega** |
| Badge "N pendientes" + replay automático | — | ✅ entrega |
| Dedup backend por `client_tx_id` | — | depende de backlog n8n (§6) |

---

## Parte 1 — Arquitectura del queue

### 1.1 Módulo nuevo: `operaciones/kiosk/js/queue.js`

Archivo nuevo (hermano de `odoo.js`/`geo.js`/`face.js`), cargado en el HTML del kiosk **antes** de `kiosk.js`. Expone `window.KioskQueue`. Sin dependencias externas; solo `localStorage` + `fetch` (reusa `n8nFetch` de odoo.js para el replay).

```js
// queue.js — contrato público
window.KioskQueue = {
  enqueue,        // (item) -> bool      | persiste una tx fallida
  replayAll,      // () -> Promise<{ok, fail}>  | reintenta todas, FIFO
  list,           // () -> item[]        | items pendientes (para el badge/UI)
  size,           // () -> number
  remove,         // (client_tx_id) -> void
  clear,          // () -> void          | solo para admin/debug
};
```

### 1.2 Esquema de un item en cola

```js
{
  client_tx_id: "k-<empleadoId>-<isoTs>-<rand4>",  // UUID-lite, generado en PR D
  tipoTx:       "checkin" | "olvido_entrada" | "olvido_checkout",
  endpoint:     "/webhook/kiosk/checkin",          // endpoint exacto a reenviar
  payload:      { ... },                            // payload ORIGINAL intacto
  ts_evento:    "2026-05-27T23:58:00.000Z",         // momento REAL del evento (crítico)
  ts_encolado:  "2026-05-27T23:58:02.140Z",
  intentos:     0,
  ultimo_error: null
}
```

> 🔑 **`ts_evento` es el corazón del fix de calidad de datos.** El payload encolado lleva la hora REAL en que el empleado checó (no la hora del replay). Sin esto, reenviar un checkout 12h después recrearía el turno fantasma de ~24h que PR D justamente elimina. El workflow `kiosk/checkin` debe usar `payload.timestamp`/`ts_evento` y NO `now()` (ver §6).

### 1.3 Persistencia

- Clave `localStorage`: `ops_kiosk_queue_v1` → array JSON de items.
- Límite: **50 items** (FIFO; si se excede, descarta el más viejo y `log()` lo descartado — nunca truncar en silencio, regla del forense).
- Tamaño esperado: un item de checkin con `foto_base64` puede pesar ~30-60 KB. 50 items ≈ 2-3 MB. `localStorage` da ~5-10 MB. **Mitigación:** para items en cola, NO persistir `foto_base64` (la selfie es validación del momento; en replay diferido pierde sentido y revienta el storage). Documentar que las tx encoladas van sin foto (se marca `foto_diferida:true` para que RH lo sepa).

---

## Parte 2 — Flujo de encolado (replay del contrato PR D)

`encolarTransaccionFallida` (stub en PR D) se vuelve real:

```js
// kiosk.js (PR D dejó el stub; PR C lo respalda con KioskQueue real)
function encolarTransaccionFallida(tipoTx, endpoint, payload, tipoError){
  if(!K.config.offlineQueueEnabled) return false;
  if(['NETWORK','TIMEOUT','HTTP_5XX'].indexOf(tipoError) === -1) return false;  // solo reintentables
  return window.KioskQueue.enqueue({
    client_tx_id: payload.client_tx_id,            // ya viene de PR D
    tipoTx, endpoint,
    payload: stripFoto(payload),                   // sin foto_base64 (§1.3)
    ts_evento: payload.timestamp || new Date().toISOString(),
    ts_encolado: new Date().toISOString(),
    intentos: 0, ultimo_error: null
  });
}
```

Puntos de enganche (los 3 flujos transaccionales, ya identificados en PR D):
- `registrarAsistencia` (kiosk.js:~990) — entrada/salida/comida + olvido_entrada.
- `confirmarOlvideCheckout` (kiosk.js:~1903).

Cuando PR D detecta error reintentable → llama `encolarTransaccionFallida` → muestra UX "tu registro quedó en cola".

---

## Parte 3 — Replay (reenvío automático)

### 3.1 Disparadores del replay

1. **Evento `online`** del navegador: `window.addEventListener('online', KioskQueue.replayAll)`.
2. **Al cargar el kiosk** (`initKiosk`): si `size() > 0`, replay tras cargar config.
3. **Periódico:** cada 60s mientras `size() > 0` (`setInterval`), por si el evento `online` no dispara (caso WiFi flaky que no baja del todo).
4. **Manual:** botón "Reintentar ahora" en el badge (§4).

### 3.2 Algoritmo de replay (FIFO, secuencial, idempotente)

```js
async function replayAll(){
  if(_replaying) return;            // lock anti-reentrada
  _replaying = true;
  var items = list(); var ok = 0, fail = 0;
  for(var it of items){             // FIFO estricto (orden de eventos)
    try{
      it.intentos++;
      var res = await n8nFetch(it.endpoint, it.payload, 1);   // 1 retry interno
      var r = Array.isArray(res) ? res[0] : res;
      // Éxito o duplicado-ya-procesado → quitar de la cola
      if((r && (r.accion_valida === true || r.success === true)) ||
         (r && r.duplicate_ignored === true)){                // dedup backend (§6)
        remove(it.client_tx_id); ok++;
      } else if(r && r.accion_valida === false){
        // Validación de negocio falló (ej. orphan ya cerrado por auto-rescate).
        // NO reintentar infinitamente: marcar y sacar a "revisión RH".
        moverARevision(it, r.error_msg); remove(it.client_tx_id); fail++;
      } else { it.ultimo_error = 'respuesta_inesperada'; fail++; }
    }catch(e){ it.ultimo_error = clasificarErrorN8n(e).tipo; fail++; break; }  // sigue offline → cortar
    persist(items);
  }
  _replaying = false;
  actualizarBadge();
  return { ok, fail };
}
```

### 3.3 Reconciliación con auto-rescate (caso borde crítico)

**Escenario:** empleado checa salida 27-may 18:00 (cae en cola por outage). No vuelve hasta 28-may 07:00. A las 06:30 el cron/auto-rescate ya cerró su orphan. Cuando el kiosk replaya el checkout encolado, el attendance ya está cerrado → el workflow responde `accion_valida:false` ("ya cerrado").

**Resolución:** el replay NO debe forzar; al recibir `accion_valida:false`, mueve el item a `ops_kiosk_queue_revision` con el motivo y crea (vía endpoint existente) una nota para RH: *"checkout offline 18:00 vs auto-cierre 06:30 — validar hora real"*. Así el dato real (18:00) NO se pierde aunque no se aplique automáticamente — RH decide. Esto es estrictamente mejor que el estado actual (donde el 18:00 se perdía del todo).

> Prioridad de verdad: **el checkout offline con `ts_evento` real (18:00) es más confiable que el auto-rescate (+9.6h estimado)**. En el backlog n8n, considerar que un replay con `ts_evento` < hora de auto-cierre *corrija* el auto-cierre en vez de rechazarlo. Por ahora (MVP) va a revisión RH.

---

## Parte 4 — UX

### 4.1 Badge de pendientes

Indicador persistente en la pantalla principal del kiosk (junto al status de conexión, `updateConnStatus` kiosk.js:~1360):

```
┌────────────────────────────┐
│ 🟢 conectado   📤 2 pend.  │   ← tap abre detalle
└────────────────────────────┘
```

- `0 pendientes` → no se muestra.
- `≥1` → "📤 N pendientes" en ámbar. Tap → lista (tipo, empleado, hora del evento, intentos) + botón "Reintentar ahora".
- Durante replay → "📤 enviando… (k/N)".
- Tras replay exitoso → toast "✅ N registros sincronizados".

### 4.2 Mensajes (actualiza los de PR D §1.3)

Con PR C activo (`offlineQueueEnabled=true`), los textos de NETWORK/TIMEOUT/5XX ya prometen la cola (PR D los dejó condicionados a este flag). PR C solo flippea el flag y añade el badge.

---

## Parte 5 — Tests E2E

| # | Escenario | Pasos | Esperado |
|---|---|---|---|
| 1 | Checkout offline → recupera | Offline en DevTools → checar salida → volver Online | Modal "en cola"; badge "1 pend."; al volver online replay automático; badge→0; toast "✅ 1 sincronizado"; Odoo tiene el checkout con **hora del evento** (no del replay) |
| 2 | `ts_evento` preservado | Checar offline 18:00, replay a las +30 min | Odoo `check_out` = 18:00 (no 18:30) |
| 3 | FIFO multi-item | 3 tx offline (entrada A, salida A, entrada B) → online | Se reenvían en orden; 3 attendances correctos |
| 4 | Reconciliación auto-rescate | Checkout en cola + orphan ya auto-cerrado al replay | Item → revisión RH con nota; NO duplica; NO crashea |
| 5 | Idempotencia | Forzar replay 2× del mismo item (mock `duplicate_ignored:true`) | Solo 1 attendance; item removido sin error |
| 6 | Límite 50 | Encolar 51 | El más viejo se descarta con `log()` visible; badge "50 pend." |
| 7 | Persistencia reload | Encolar → recargar página → reabrir kiosk | Items sobreviven (localStorage); replay corre en `initKiosk` |
| 8 | Foto diferida | Checkin offline | Item sin `foto_base64`; al aplicar, incidencia/attendance marca `foto_diferida:true` |
| 9 | Regresión online | Todo normal con red | Sin cola, comportamiento idéntico (cola solo actúa en fallo) |

---

## Parte 6 — Dependencia backend (workflow n8n)

PR C es **mayormente frontend**, pero la idempotencia segura requiere un cambio en `kiosk/checkin` (`a7mEjjdwIzzvomXs`) — **backlog, no bloquea el MVP de PR C**:

1. **Aceptar y honrar `client_tx_id`:** antes de `Odoo - CREATE Entrada`/`UPDATE Salida`, buscar si ya existe un attendance/incidencia con ese `client_tx_id` (guardarlo en un custom field, ej. `x_studio_client_tx_id`). Si existe → responder `{duplicate_ignored:true}` sin recrear. Evita duplicados cuando el original SÍ llegó pero la respuesta se perdió (causa típica de timeouts).
2. **Honrar `ts_evento`/`timestamp` del payload** para el check_in/check_out en vez de `now()` (probablemente ya lo hace — verificar en `Code - Preparar parámetros`).
3. Sin (1), el MVP de PR C funciona pero hay riesgo bajo de duplicado en el caso "request llegó, respuesta se perdió, replay reenvía". Mitigación interina: el replay solo dispara tras error de red real (no tras timeout con posible llegada) — configurable.

**Campo custom nuevo (backlog):** `x_studio_client_tx_id` (char) en `hr.attendance`. Crear vía `ir.model.fields.create` (patrón documentado, NO Studio) cuando se priorice la dedup dura.

---

## Métricas de éxito post-PR C

| Métrica | Antes (27-may) | Después (target) |
|---|---|---|
| Registros perdidos por outage | 23 (todos los del outage) | **0** (encolados + replay) |
| Hora real de salida preservada | 0% (se perdía) | **100%** (`ts_evento`) |
| Turnos fantasma ~24h | 11 | **0** (combinado con PR D) |
| Intervención manual RH post-outage | 21 incidencias + 2 orphans | solo casos de reconciliación genuina |
| Visibilidad de pendientes para el empleado | ninguna | badge en tiempo real |

---

## Estimación de esfuerzo

| Tarea | Tiempo CC |
|---|---|
| `queue.js` (enqueue/replay/persist/list + lock) | 2 h |
| Cableado `encolarTransaccionFallida` real + `stripFoto` | 30 min |
| Badge UX + disparadores (online/init/interval/manual) | 1.5 h |
| Reconciliación auto-rescate (revisión RH) | 1 h |
| Tests E2E (9 escenarios) | 1 h |
| **Total frontend (MVP)** | **~6 h** |
| Backlog backend (dedup `client_tx_id`) | +1.5 h n8n (separado) |

---

## Plan de rollout

1. Branch: `feature/pr-c-queue-offline` (tras mergear PR D).
2. Commit 1: `feat(kiosk): módulo queue.js (persistencia + replay FIFO)`.
3. Commit 2: `feat(kiosk): cablear encolado real + stripFoto`.
4. Commit 3: `feat(kiosk): badge pendientes + disparadores de replay`.
5. Commit 4: `feat(kiosk): reconciliación con auto-rescate → revisión RH`.
6. **Flag gradual:** `offlineQueueEnabled` arranca por-dispositivo (opt-in, convención `=== '1'` de `FEATURE_FLAGS.md`) → probar en 1 kiosk → activar default cuando esté validado. Evita repetir el patrón "feature nueva como cobaya de producción" (hallazgo #14).
7. Bump `KIOSK_BUILD`.
8. Tests E2E (Esteban valida en browser, incl. modo avión real en tablet).

## Plan de rollback

`offlineQueueEnabled=0` (kill-switch instantáneo, sin redeploy) → el kiosk vuelve a comportamiento PR D (error visible, sin cola). O `git revert` del módulo. Los items ya encolados se pueden drenar manualmente con `KioskQueue.replayAll()` desde consola antes de desactivar.

## Dependencias

- **DESPUÉS de PR D** (contrato + render post-OK + `client_tx_id`). Dura.
- **DESPUÉS de PR A** (retención logs Railway) — para observar replays en producción.
- Backend dedup (`x_studio_client_tx_id`) — backlog, no bloquea MVP.

---

## Decisiones abiertas para Esteban

1. **Foto en cola:** confirmar que está OK encolar sin `foto_base64` (recomendado por storage). Alternativa: persistir foto comprimida a `image_128` — pero pesa y la selfie diferida pierde valor de verificación.
2. **Reconciliación:** ¿el replay con `ts_evento` real debe *corregir* un auto-cierre previo, o solo ir a revisión RH? MVP propone revisión RH (conservador). La corrección automática es más potente pero requiere lógica de "qué fuente gana" en el workflow.
3. **Activación:** ¿opt-in por dispositivo primero (recomendado, seguro) o default-on directo? Recomiendo opt-in dado el hallazgo #14.
