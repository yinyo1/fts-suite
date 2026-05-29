# Sprint Resiliencia — PR D: Hardening errores + Fix "Seguí en turno"

> **Estado:** diseño detallado. NO implementado. Este doc precede a `feature/pr-d-hardening-errores`.
> **Autor:** Claude Code · 28-may-2026 · grounded en lectura real de `operaciones/kiosk/js/kiosk.js` + `odoo.js`.

---

## Contexto

El **27-may-2026** un outage de backend (~18:16 CST → 06:28 CST) dejó **23 de 29 empleados** con `hr.attendance` abierto toda la noche. El detalle forense está en `docs/INCIDENTES/2026-05-27-kiosk-checkout-outage-12h.md` (ya en `main`, PR #47).

Dos causas raíz de **producto** (no de infraestructura) lo hicieron invisible y costoso:

1. **Fallo silencioso del checkout.** En el flujo principal (`registrarAsistencia`), la pantalla de confirmación ("✓ SALIDA") se renderiza **antes** del POST a n8n, y el `catch` del POST solo hace `console.warn`. El empleado ve éxito aunque nada llegó a Odoo. Durante el outage, los empleados que intentaron checar salida vieron confirmación y se fueron a casa; el registro nunca existió.

2. **Recovery que ensucia datos.** Al día siguiente, 11 empleados usaron el botón "Seguí en turno" (`zona_gris`), que cierra el turno viejo **a la hora actual** → registró **turnos fantasma de ~24h** sin TAG ni incidencia. Datos de nómina silenciosamente incorrectos para 11 personas (validado en análisis `out_mode`: `kiosk`, TAG=false, sin incidencia).

**PR D ataca ambos.** Es la pieza de menor esfuerzo y mayor impacto del sprint de resiliencia. Establece además los *hooks* que **PR C (queue offline)** consumirá.

### Hallazgo de arquitectura relevante (no anticipado en el forense)

`n8nFetch` (`odoo.js:15-40`) **ya implementa AbortController + timeout 10s + 2 reintentos con backoff 2s**. Es decir: durante el outage el kiosk **sí reintentaba** (~24s, 3 intentos) antes de rendirse. **El problema no es falta de retry — es que el fallo final se traga.** Esto cambia el enfoque de PR D: no añadimos resiliencia de red (existe), **surfaceamos el fallo terminal y lo encolamos**.

---

## Parte 1 — Hardening de errores kiosk

### 1.1 Audit de catch en `kiosk.js` + `odoo.js`

`grep -n "catch" operaciones/kiosk/js/*.js` → 21 bloques. Clasificación por relevancia transaccional:

| Archivo | Línea | Código actual | Severidad | Fix propuesto |
|---|---|---|---|---|
| **kiosk.js** | **990-994** | `catch(e){ console.warn('Error enviando a n8n:', e); checkinOk=false; habilitarBotonTerminado(); }` | 🔴 **CRÍTICA** (causó invisibilidad 27-may) | Mover render de confirm screen a DESPUÉS del POST OK; en catch → `mostrarErrorTransaccion(clasificar(e))` + hook encolar. NUNCA mostrar "✓" sin confirmación backend. |
| kiosk.js | 1903-1907 | `catch(e){ console.error(...); alert('Error al procesar: '+e.message); ... }` | 🟡 MEDIA (visible pero UX cruda e inconsistente) | Reemplazar `alert()` por `mostrarErrorTransaccion(clasificar(e))`. Unificar con el resto. |
| kiosk.js | 503-505 | `catch(e){ console.warn('Odoo no disponible...', e); }` (loadEmpleados) | 🟡 MEDIA (lista vacía silenciosa) | Badge de conexión + banner "No se pudo cargar la lista. Reintentar". Read-only, no encolar. |
| kiosk.js | 524-526 | `catch(e){ console.warn('SOs no disponibles...', e); }` (loadSOs) | 🟢 BAJA | Degradación aceptable (SO opcional). Solo log estructurado. |
| odoo.js | 34-38 | `catch(e){ if(i===retries) throw e; ...retry... }` | ✅ OK (re-lanza tras retries) | NO es silencioso — propaga. Mejora: **clasificar y tipar el error** antes de re-lanzar (ver §1.2). |
| kiosk.js | 1398-1400 | `catch(e){ console.error('[GEO] Error sync', ...) }` (config sync) | 🟢 BAJA | Read-only con defaults. OK. |
| kiosk.js | 1854-1859 | `catch(geoErr){ geoData={error...} }` | ✅ OK | El error se adjunta al payload. Correcto. |
| kiosk.js | 739/771/868/1420/1436 | cámara / face-api / captureFrame | 🟢 BAJA | Feature opt-in (face). Documentado en `FEATURE_FLAGS.md`. No tocar. |
| kiosk.js | 1130/1306 | fallback demo historial | 🟢 BAJA | Read-only. OK. |
| kiosk.js | 192/217/222/227/2056/2091 | localStorage / clipboard | 🟢 BENIGNO | No tocar. |

**Resumen audit:** **1 catch CRÍTICO** en la ruta transaccional principal (990 — cubre entrada/salida/comida **y** `olvido_entrada`, que fluye por el mismo `registrarAsistencia` vía `K.olvidoEntradaData`), **1 inconsistente** (1903 `alert`), **2 read-path silenciosos** medios (503/524). El resto es benigno o ya correcto.

> ⚠️ El catch 990 es el de mayor impacto porque `registrarAsistencia` es **el flujo que usa el 95% de los checadas** (entrada normal + salida normal + comida + olvido_entrada). Es la ruta menos protegida y la más usada — exactamente lo que falló el 27-may.

### 1.2 Tipos de error a distinguir

El handler centralizado vive en `odoo.js` (donde ya está `n8nFetch`). Se introduce una función `clasificarErrorN8n(e, res)` que devuelve un objeto tipado. `n8nFetch` lanza `KioskError` tipado en vez de `Error` genérico.

| Tipo | Detección | Reintentable | Encolar (PR C) |
|---|---|---|---|
| `NETWORK` | `e.name === 'TypeError'` + mensaje `Failed to fetch` / `e.message` ECONNREFUSED | Sí (ya lo hace n8nFetch) | **Sí** |
| `TIMEOUT` | `e.name === 'AbortError'` (el AbortController de odoo.js:24) | Sí | **Sí** |
| `HTTP_5XX` | `res.status >= 500` | Sí | **Sí** |
| `HTTP_4XX` | `400 <= res.status < 500` | **No** (request mal formado) | No |
| `PARSE` | `res.json()` lanza | No | No (respuesta corrupta, intervención) |
| `BACKEND_CANDADO` | `res.ok` pero `accion_valida===false` | No | No (es validación de negocio, ya manejado por `mostrarErrorCandado`) |

Telemetría: contador en `localStorage` por tipo, para un futuro panel de salud.

```js
// odoo.js — telemetría ligera
function bumpErrTelemetry(tipo){
  try{
    var k = 'ops_kiosk_err_counts';
    var c = JSON.parse(localStorage.getItem(k) || '{}');
    c[tipo] = (c[tipo] || 0) + 1;
    c['_last_' + tipo] = new Date().toISOString();
    localStorage.setItem(k, JSON.stringify(c));
  }catch(_){}
}
```

### 1.3 Mensaje UX por tipo de error (texto exacto)

Reutiliza el modal existente `mostrarErrorCandado` (kiosk.js:1912), extendido a `mostrarErrorTransaccion(tipoError)` con icono + texto + acción:

| Tipo | Icono | Texto exacto | Botón(es) |
|---|---|---|---|
| `NETWORK` | 📡 | "Sin conexión. Tu registro se guardó en este dispositivo y se enviará solo cuando vuelva el internet." | "Entendido" |
| `TIMEOUT` | ⏳ | "El servidor tardó en responder. Tu registro quedó en cola y se reintentará automáticamente." | "Entendido" |
| `HTTP_5XX` | 🔧 | "Servidor temporalmente fuera de servicio. Tu registro quedó en cola y se reintentará solo." | "Entendido" |
| `HTTP_4XX` | ⚠️ | "Tu solicitud tiene un problema y NO se registró. Avisa a tu supervisor." | "Entendido" |
| `PARSE` | ❗ | "Respuesta inválida del servidor. Tu registro NO se confirmó — repórtalo a Esteban." | "Entendido" |

> **Distinción clave de UX:** los tipos encolables (NETWORK/TIMEOUT/5XX) dicen *"se guardó / quedó en cola"* (tranquiliza, el dato no se pierde). Los NO encolables (4XX/PARSE) dicen *"NO se registró"* (acción humana requerida). Esto invierte el patrón del 27-may: del "falso éxito" al "honestidad sobre el estado real".

Si PR C (queue offline) aún no está desplegado, el texto de los encolables cae a la variante sin promesa de cola: *"No se pudo registrar. Intenta de nuevo en un momento."* (flag `K.config.offlineQueueEnabled`).

### 1.4 Integración con queue offline (hook para PR C)

PR D **no implementa** el queue; define el contrato que PR C llenará:

```js
// kiosk.js — hook, no-op si PR C no está
function encolarTransaccionFallida(tipoTx, payload, tipoError){
  if(!K.config.offlineQueueEnabled) return false;        // PR C lo activa
  if(['NETWORK','TIMEOUT','HTTP_5XX'].indexOf(tipoError) === -1) return false;
  return window.KioskQueue && window.KioskQueue.enqueue
    ? window.KioskQueue.enqueue({ tipoTx, payload, ts: new Date().toISOString() })
    : false;
}
```

- **PR D** entrega: `clasificarErrorN8n`, `KioskError` tipado, `mostrarErrorTransaccion`, `encolarTransaccionFallida` (stub), y el cableado en `registrarAsistencia`/`confirmarOlvideCheckout`.
- **PR C** entrega: `window.KioskQueue` (persistencia `localStorage` + replay al recuperar `online`), respetando el contrato `{tipoTx, payload, ts}`.
- Contrato de idempotencia: el payload encolado debe incluir un `client_tx_id` (UUID generado en cliente) para que el replay no duplique attendances si el original sí llegó pero la respuesta se perdió. **PR D agrega `client_tx_id` al payload; PR C lo usa para dedup; el workflow n8n lo honra (backlog n8n).**

---

## Parte 2 — Fix botón "Seguí en turno"

### 2.1 Estado actual (código exacto)

`renderEstadoBotones` (kiosk.js:1602-1647) — botón principal por estado:

```js
case 'zona_gris':   // 14-24h abierto
  accionDiv.innerHTML = '<button onclick="resolverZonaGris(\'turno\')" ...>🌙 Seguí<br>en turno</button>';
  break;
case 'error_critico':  // >24h abierto
  accionDiv.innerHTML = '<button onclick="resolverErrorCritico()" ...>🔴 Resolver<br>ahora</button>';
  break;
```

`resolverZonaGris` (kiosk.js:1673-1684):

```js
function resolverZonaGris(opcion){
  var estado = window._estadoActual;
  var empleado = window._empleadoActual;
  if(opcion === 'turno'){
    // Seguí en turno → checar salida ahora (checkout normal)
    iniciarCheckin('salida');          // ← estampa check_out = AHORA
  } else if(opcion === 'olvide'){
    mostrarModalOlvideCheckout(estado, empleado);   // ← pregunta hora real + crea incidencia + TAG
  }
}
```

### 2.2 Problema identificado

`iniciarCheckin('salida')` estampa `check_out = ahora`. Para un orphan en `zona_gris` (14-24h) esto produce un turno cuya duración ≈ tiempo desde el check-in viejo.

**Ejemplo real 27-may (att 13347, Felipe Pérez):**
- check_in: 27-may 13:06:09 UTC (07:06 CST)
- "Seguí en turno" clickeado: 28-may 13:00:24 UTC (07:00 CST)
- check_out estampado: 28-may 13:00:24 → **turno registrado = 23h 54m**
- `out_mode=kiosk`, `x_studio_horario_en_disputa=false`, **sin incidencia** → nadie en RH lo revisa.

11 empleados quedaron así el 28-may (23h39m–23h57m). La validación `≤24h` (kiosk.js:1833) es lo único que evita >24h. Para nómina son turnos físicamente imposibles que nadie va a corregir.

**Raíz semántica:** "Seguí en turno" asume que el empleado *sigue físicamente en turno y está saliendo ahora*. Es válido para un turno largo legítimo (ej. 15h continuas). Es **falso** cuando el empleado se fue a casa y volvió al día siguiente (caso outage). El kiosk no puede leer la intención → no debe asumir "ahora".

### 2.3 Fix propuesto (código exacto)

**Estrategia:** discriminar por si el check-in es del **mismo día** (turno largo legítimo en curso → permitir "ahora") o de un **día anterior** (volvió → preguntar hora real, igual que `olvido_checkout`).

```js
function resolverZonaGris(opcion){
  var estado   = window._estadoActual;
  var empleado = window._empleadoActual;

  if(opcion === 'turno'){
    // FIX PR D: distinguir turno-largo-en-curso vs volvió-al-día-siguiente.
    var ciStr = estado && estado.registro_abierto && estado.registro_abierto.check_in;
    var checkInDate = ciStr ? new Date(ciStr.replace(' ','T') + 'Z') : null;
    var ahora = new Date();

    // ¿El check-in es de un día calendario CST anterior?
    var cruzaDia = checkInDate && (cstDateStr(checkInDate) !== cstDateStr(ahora));

    if(cruzaDia){
      // Volvió al día siguiente → NO estampar "ahora" (evita turno fantasma).
      // Mismo flujo que "olvidé checar salida": pide hora real + crea incidencia + TAG.
      mostrarModalOlvideCheckout(estado, empleado);
    } else {
      // Turno largo legítimo del MISMO día CST → checkout normal a la hora actual.
      iniciarCheckin('salida');
    }
  } else if(opcion === 'olvide'){
    mostrarModalOlvideCheckout(estado, empleado);
  }
}

// Helper: fecha calendario en CST (UTC-6) como YYYY-MM-DD
function cstDateStr(d){
  var cst = new Date(d.getTime() - 6*3600*1000);
  return cst.getUTCFullYear() + '-' +
         String(cst.getUTCMonth()+1).padStart(2,'0') + '-' +
         String(cst.getUTCDate()).padStart(2,'0');
}
```

**Efecto:** un orphan de día anterior (caso 27-may) ya NO genera turno fantasma; entra al flujo `olvido_checkout` que pregunta "¿A qué hora saliste realmente?", escribe el TAG de disputa y crea la incidencia `olvido_checkout` para revisión de RH — datos correctos + auditables. Un turno legítimo del mismo día sigue cerrándose normal a la hora actual.

**Cambio UX del botón (kiosk.js:1610):** cuando `cruzaDia`, el label debería decir la verdad. Opción de diseño (decisión Esteban): renombrar a "🌙 Resolver turno anterior" cuando el check-in es de ayer, o mantener "Seguí en turno" y dejar que el modal explique. Recomendación: **detectar `cruzaDia` en `renderEstadoBotones` y cambiar el label** para no inducir el clic erróneo.

### 2.4 Workflow n8n — ¿cambios?

**Ninguno obligatorio.** El fix reusa el endpoint existente `/webhook/incidencias/crear-olvido-checkout` (`IRtG38Aknb5SW15h`), que ya:
- pide `hora_propuesta_cst` (HH:MM),
- escribe `x_studio_horario_en_disputa=true` + `x_studio_incidencia_pendiente_id`,
- crea incidencia `olvido_checkout` `pendiente_*` para RH.

El `mostrarModalOlvideCheckout` (kiosk.js:1753+) ya invoca ese endpoint con manejo de error visible (kiosk.js:1893-1899). **Cero cambios de backend** — solo se enruta más tráfico al flujo correcto que ya existe.

> Nota: esto convierte parte del volumen "zona_gris→checkout" en incidencias `olvido_checkout`. RH verá más incidencias de ese tipo tras un outage (esperado y correcto: son cierres que merecen revisión, no datos fantasma silenciosos).

---

## Tests E2E (validación pre-merge)

### Test 1 — Network down durante checkout (el bug 27-may)
1. Empleado activo (`activo`) en kiosk. DevTools → Network → **Offline**.
2. Click "🚪 Checar Salida" → completar flujo.
3. **Esperado:** NO aparece pantalla "✓ SALIDA". Aparece modal 📡 "Sin conexión. Tu registro se guardó… se enviará solo cuando vuelva el internet."
4. Verificar `localStorage.ops_kiosk_err_counts.NETWORK` incrementó.
5. (Con PR C) verificar item en `KioskQueue`.

### Test 2 — Servidor 5xx durante checkout
1. DevTools → override de respuesta del endpoint `/webhook/kiosk/checkin` a **500** (Network conditions / request blocking, o mock SW).
2. Click checar salida.
3. **Esperado:** modal 🔧 "Servidor temporalmente fuera de servicio…". NO pantalla de éxito. Telemetría `HTTP_5XX`++.

### Test 3 — Orphan de día anterior con "Seguí en turno" (fix 2.3)
1. Sembrar attendance abierta con check_in de **ayer** (zona_gris 14-24h). 
2. Identificarse → estado `zona_gris` → click "Seguí en turno".
3. **Esperado:** se abre el modal "¿A qué hora saliste realmente?" (NO estampa ahora). Ingresar hora real.
4. Verificar en Odoo: `check_out` = hora declarada (NO ~24h), `x_studio_horario_en_disputa=true`, incidencia `olvido_checkout` creada.

### Test 4 — Turno largo legítimo del mismo día con "Seguí en turno"
1. Sembrar attendance abierta con check_in de **HOY** hace ~15h (zona_gris, mismo día CST).
2. Click "Seguí en turno".
3. **Esperado:** checkout normal a la hora actual (`iniciarCheckin('salida')`), SIN incidencia, SIN modal de hora. Comportamiento legítimo preservado.

### Test 5 — Mensaje UX por cada tipo de error
1. Forzar cada tipo (offline=NETWORK, throttle extremo=TIMEOUT, mock 500=5XX, mock 400=4XX, mock body no-JSON=PARSE).
2. **Esperado:** el icono + texto exactos de §1.3 por cada tipo; los encolables prometen cola, los no-encolables dicen "NO se registró".

### Test 6 — Regresión flujo normal (no romper lo que funciona)
1. Online normal: checar entrada y salida.
2. **Esperado:** pantalla "✓" aparece **solo tras** confirmación backend; comportamiento idéntico al actual para el caso feliz.

---

## Métricas de éxito post-PR D

| Métrica | Antes (27-may) | Después (target) |
|---|---|---|
| Catch silenciosos en ruta transaccional (`registrarAsistencia`) | 1 (kiosk.js:990) | **0** |
| Confirmación "✓" mostrada sin éxito backend | Sí (siempre, pre-fetch) | **0** (render post-OK) |
| Turnos fantasma ~24h por recovery zona_gris | 11 (caso 27-may) | **0** |
| Empleados con UX clara durante outage | 0% | **100%** |
| Tipos de error distinguidos | 1 (genérico) | 5 (NETWORK/TIMEOUT/5XX/4XX/PARSE) |
| Telemetría de errores | 0 | counters `localStorage` por tipo |

---

## Estimación de esfuerzo

| Tarea | Tiempo CC |
|---|---|
| Hardening errores (clasificador + tipado en odoo.js + cableado en kiosk.js + modal extendido) | 1.5–2 h |
| Fix botón "Seguí en turno" (`resolverZonaGris` + `cstDateStr` + label condicional) | 1 h |
| Tests E2E (guion + ejecución browser) | 30 min |
| **Total** | **3–3.5 h** |

---

## Plan de rollout

1. Branch: `feature/pr-d-hardening-errores`
2. Commit 1: `feat(kiosk): clasificador de errores n8n + tipos (odoo.js)`
3. Commit 2: `feat(kiosk): UX visible por tipo de error + hook encolar (kiosk.js)`
4. Commit 3: `fix(kiosk): "Seguí en turno" no genera turno fantasma para orphan de día anterior`
5. Bump `KIOSK_BUILD` (convención del repo).
6. Tests manuales E2E (Esteban valida en browser).
7. PR + merge tras visto bueno.

## Plan de rollback (<1 min)

`git revert <commit>` (o "Revert" en GitHub) + push → GitHub Pages redespliega ~90s + bump `KIOSK_BUILD`. El kiosk vuelve al comportamiento previo. Workflows n8n NO se tocan → sin riesgo backend.

## Dependencias

- **DESPUÉS de PR A** (variables Railway de retención de logs — en proceso por Esteban). No bloquea el código, pero PR A da observabilidad para validar PR D en producción.
- **ANTES de PR C** (queue offline): PR D establece el contrato `encolarTransaccionFallida` + `client_tx_id`. PR C implementa `window.KioskQueue` consumiéndolo.
- Sin dependencia de PR #40 (modal Nueva Incidencia) — son áreas distintas.

---

## Hallazgos inesperados durante el diseño

1. **El retry ya existe.** `n8nFetch` (odoo.js:15-40) ya hace 3 intentos con timeout 10s + backoff 2s. El 27-may el kiosk reintentó ~24s por empleado antes de tragarse el error en kiosk.js:990. El problema nunca fue resiliencia de red — fue **surfacing**. Reorienta PR D: no añadir retries, surfacing + encolar.
2. **El confirm screen se pinta ANTES del POST** (kiosk.js:943-965 vs fetch en 972). Es el corazón del falso-éxito: aunque arregláramos el catch, si el "✓" ya está en pantalla el empleado lo vio. El fix DEBE mover el render del confirm a después del OK del backend, no solo cambiar el catch. (PR #3 original NO contemplaba esto — su diff solo tocaba el brancheo de respuesta, no el orden de render. PR D es más completo.)
3. **`confirmarOlvideCheckout` ya está bien protegido** (mostrarErrorCandado + checks de `r.success`), pero usa `alert()` en su catch (1905) — inconsistente con el resto del UI. Se unifica.
4. **El flujo `olvido_entrada` comparte el catch 990** (vía `registrarAsistencia` + `K.olvidoEntradaData`), así que un solo fix cubre entrada normal + salida + comida + olvido_entrada. Buen ROI.
