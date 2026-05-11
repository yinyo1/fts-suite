# Sprint F1.5 — Diagnóstico bug bypass por frontend kiosk

**Fecha:** 2026-05-11 (mismo día deploy F1.5)
**Reportado por:** Esteban (caso Ricardo Hernández id 98 a las 15:24 CST)
**Estado:** causa raíz confirmada con evidencia de execution log. **No implementado todavía** — pendiente decisión.

---

## 1. Causa raíz confirmada — evidencia exacta

**Hipótesis del usuario CONFIRMADA al 100%.** El frontend kiosk bloquea ANTES de permitir que el workflow `kiosk/checkin v4.2` (donde vive el auto-rescate F1.5) corra.

### Cadena de bloqueo (3 puntos exactos)

**Punto 1 — Workflow backend `kiosk/estado-empleado v3` (`U13fngg2dTKgDQ8Y`) nodo `Code - Clasificar estado`:**

```js
// Constantes (líneas 6-9 del jsCode del nodo)
const UMBRAL_ZONA_GRIS = 14;      // horas: activo → zona_gris
const UMBRAL_ERROR_CRITICO = 24;  // horas: zona_gris → error_critico

// Lógica (líneas ~78-90)
if (abierta) {
  const horas = (ahoraUTC - abierta._checkIn) / (1000 * 60 * 60);
  if (horas < UMBRAL_ZONA_GRIS) {
    estado_actual = 'activo';
  } else if (horas < UMBRAL_ERROR_CRITICO) {
    estado_actual = 'zona_gris';
  } else {
    estado_actual = 'error_critico';  // ← Ricardo cae aquí (77.5h)
  }
}
```

**Evidencia execution 8755** (ejecutada 2026-05-11 15:24:12 CST = 21:24:12 UTC):
```json
{
  "estado_actual": "error_critico",
  "horas_transcurridas": 77.5,
  "alerta_nivel": "critico",
  "registro_abierto": { "id": 12948, "check_in": "2026-05-08 15:51:23" }
}
```

Este es exactamente el response que recibió el frontend de Ricardo hoy.

**Punto 2 — Frontend `kiosk.js:1417-1421` (render del card de estado):**

```js
case 'error_critico':
  card.style.background = '#ffe8e8';
  icon.textContent = '🔴';
  texto.textContent = 'Checkeo sin salida (+24 hrs)';
  break;
```

**Punto 3 — Frontend `kiosk.js:1507-1509` (render del botón principal):**

```js
case 'error_critico':
  accionDiv.innerHTML = '<button onclick="resolverErrorCritico()" ' +
    'style="background:#D83B01;color:#fff;border:none;padding:14px 10px;...">' +
    '🔴 Resolver<br>ahora</button>';
  break;
```

Y `kiosk.js:1539-1541` no agrega ningún botón secundario para `error_critico`:
```js
case 'error_critico':
  // Principal (Resolver) ya en #ksAccionRapida → no hay alternativo
  break;
```

**Punto 4 — Frontend `kiosk.js:1581-1586` (callback del botón):**

```js
function resolverErrorCritico(){
  var estado = window._estadoActual;
  var empleado = window._empleadoActual;
  // Error crítico: siempre va al flujo de "olvidé checar"
  mostrarModalOlvideCheckout(estado, empleado);
}
```

`mostrarModalOlvideCheckout` (línea 1589) es el modal F1.1 manual — el mismo que tiene el bloqueo ">12h contacta a tu supervisor" que Ricardo recibió.

**Punto 5 — Confirmación: NO hay ruta alternativa**

En `error_critico` el frontend renderiza **un solo botón** ("Resolver ahora"). No hay botón "Checar entrada" o "Iniciar jornada". Búsqueda exhaustiva en `kiosk.js`:
- `case 'error_critico':` aparece 3 veces: una para card visual, una para botón principal, una para botón secundario (vacío). Ninguna ofrece checkin entrada.

El usuario está **atrapado** en el flujo F1.1 manual — y ese flujo bloquea >12h, así que Ricardo no podía resolverlo desde el kiosk en ningún caso.

---

## 2. Flow diagram del comportamiento actual

```
┌──────────────────────────────────┐
│  Empleado selecciona su nombre   │
│  en kiosk → showScreen(ks-estado)│
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│  fetchEstadoEmpleado(98)                          │
│  POST /webhook/kiosk/estado-empleado              │
│  → workflow U13fngg2dTKgDQ8Y                      │
│  → Odoo SEARCH hr.attendance últimos 15 días      │
│  → Code Clasificar estado                         │
│  → response: {estado_actual: "error_critico",     │
│              horas_transcurridas: 77.5,           │
│              registro_abierto: {id: 12948, ...}}  │
└────────────┬─────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│  mostrarEstadoEmpleado(empleado)                  │
│  → switch(estado_actual) === 'error_critico'      │
│  → card "Checkeo sin salida (+24 hrs)"            │
│  → renderEstadoBotones → 1 botón                  │
│     "🔴 Resolver ahora" → resolverErrorCritico()  │
└────────────┬─────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│  resolverErrorCritico()                          │
│  → mostrarModalOlvideCheckout(estado, empleado)  │
│  → Modal F1.1 olvido_checkout manual             │
│  → Validación: si check_in fue >12h ago →        │
│    "La salida fue hace más de 12 horas.          │
│     Contacta a tu supervisor."                   │
│  → ❌ DEAD-END                                    │
└──────────────────────────────────────────────────┘

NUNCA se llega a:

┌──────────────────────────────────────────────────┐
│  iniciarCheckin('entrada')                        │
│  → POST /webhook/kiosk/checkin                    │
│  → workflow a7mEjjdwIzzvomXs                      │
│  → Code Analizar candados → branch entrada >16h  │
│  → AUTO-RESCATE F1.5 ✅                            │
└──────────────────────────────────────────────────┘
```

---

## 3. Las 4 opciones de fix

### Opción A — Frontend: agregar segundo botón en `error_critico`

**Cambios:** `operaciones/kiosk/js/kiosk.js:1507-1509` + `kiosk.js:1539-1541`

Mantener "Resolver ahora" (flujo F1.1 manual) + agregar segundo botón "Checar entrada (auto-rescate)" que llama `iniciarCheckin('entrada')`.

```js
case 'error_critico':
  accionDiv.innerHTML =
    '<button onclick="iniciarCheckin(\'entrada\')" style="background:#107C10;...">' +
    '✅ Checar<br>entrada</button>';
  break;
// y en el switch de botones secundarios:
case 'error_critico':
  html = '<button onclick="resolverErrorCritico()" style="background:#f0f0f0;color:#333;...">' +
         '🔴 Resolver con incidencia manual</button>';
  break;
```

| Pro | Contra |
|---|---|
| Usuario elige (rescate automático vs flujo manual con supervisor) | 2 botones puede confundir a quien tenga huérfana muy grande |
| Cero riesgo al flujo manual existente | Auto-rescate inválido para <16h pero error_critico es >=24h, OK |

**Tiempo:** 15 min. **Cambio:** 1 archivo, ~10 líneas.

---

### Opción B — Frontend: redefinir comportamiento del botón único (RECOMENDADA)

**Cambios:** `operaciones/kiosk/js/kiosk.js:1581-1586` + opcionalmente line 1508 (label del botón)

Como `error_critico` ya implica `horas >= 24h` (por definición del backend), y nuestro umbral de auto-rescate F1.5 es `horas >= 16h`, **todos los casos de error_critico califican para auto-rescate**. Entonces redirigir el botón existente:

```js
function resolverErrorCritico(){
  var estado = window._estadoActual;
  var horas = (estado && estado.horas_transcurridas) || 0;
  // F1.5: si huérfana >= 16h, dispara auto-rescate vía checkin entrada normal.
  // El workflow a7mEjjdwIzzvomXs detectará la huérfana y la cerrará silenciosamente.
  if (horas >= 16) {
    iniciarCheckin('entrada');
  } else {
    // Fallback al modal F1.1 manual (caso degenerado, no debería ocurrir si error_critico=24h)
    mostrarModalOlvideCheckout(estado, window._empleadoActual);
  }
}
```

Opcionalmente cambiar el label del botón en kiosk.js:1508 de "🔴 Resolver ahora" a "✅ Checar entrada" para que el usuario sepa qué va a pasar.

| Pro | Contra |
|---|---|
| UX limpia, 1 solo botón | Si el umbral backend baja a <16h en futuro, fallback se activa |
| Cambio mínimo (~5 líneas, 1 archivo) | Texto "Resolver ahora" podría engañar si no se renombra |
| Reutiliza 100% la implementación F1.5 existente | — |
| Salvaguarda con `horas >= 16` por si algún día se relajan los umbrales backend | — |

**Tiempo:** 10 min. **Cambio:** 1 archivo, ~10 líneas.

---

### Opción C — Mover lógica al modal F1.1 manual

**Cambios:** `operaciones/kiosk/js/kiosk.js` (modal `mostrarModalOlvideCheckout`) + posible cambio en workflow `JLiuczUd61xVNp36` (incidencias/crear-olvido-checkout).

El modal F1.1 cuando detecte horas >16h, en vez del bloqueo "contacta supervisor", ofrezca:

```
"Auto-cerrar a 9.6h después del check_in (Vie 8 19:27)?
 La salida quedará pendiente de revisión por RH.
 [Confirmar auto-cierre]  [Cancelar]"
```

Confirmar → llamada al workflow F1.1 con flag `auto_cierre=true`, o llamada al workflow checkin con `tipo=entrada` para que F1.5 dispare.

| Pro | Contra |
|---|---|
| El flujo manual queda funcional para casos >16h | Duplica lógica de auto-rescate en 2 puntos (workflow checkin + modal) |
| Empleado tiene contexto de qué pasó | Requiere modificar modal HTML + lógica + posible workflow F1.1 |
| — | Sin un mensaje claro, parece "tomar atajo" |

**Tiempo:** 30-45 min. **Cambio:** kiosk.js modal + posiblemente workflow F1.1.

---

### Opción D — Backend: auto-resolución en `estado-empleado` antes del frontend

**Cambios:** workflow `U13fngg2dTKgDQ8Y` `Code - Clasificar estado` + nuevos nodos Odoo UPDATE + HTTP commit incidencia.

Cuando `Code - Clasificar estado` detecte abierta >16h:
1. Auto-cierra la attendance (UPDATE Odoo: check_out, x_studio_horario_en_disputa, x_studio_incidencia_pendiente_id)
2. Crea incidencia `auto_cierre_pendiente` en GitHub
3. Devuelve `estado_actual='sin_registro'` y `horas_hoy=0` (la huérfana ya está resuelta)

Empleado abre el kiosk y nunca ve la huérfana — solo el card normal "Sin entrada registrada hoy".

| Pro | Contra |
|---|---|
| Máxima limpieza UX, empleado nunca se entera | Anti-pattern: endpoint "lectura" tiene side effects de write |
| Cierra la huérfana incluso si empleado nunca abre kiosk (otros consumers pegan también al endpoint) | Cambia contrato del workflow, otros consumers (panel-incidencias? dashboard?) podrían no esperar el auto-write |
| Defensa profunda — no depende del frontend | Más complejo: 4-5 nodos nuevos (UPDATE Odoo + GET incidencias + Code Merge + PUT incidencias + Code Restore params para devolver respuesta limpia) |
| Lógica de auto-rescate queda en 2 puntos (workflow checkin Y workflow estado-empleado) | Drift risk: 2 lugares con la misma lógica → mantener sincronizado |

**Tiempo:** 1-1.5h. **Cambio:** workflow estado-empleado completo.

---

### Opción híbrida sugerida (B + D, futura)

**Inmediato:** Opción B (frontend redirige botón cuando >=16h).
**Próximo sprint:** Opción D como defensa profunda (backend cierra huérfana automáticamente). Si se hace en futuro, mantener B como UX-fast path; D solo se dispara cuando el empleado NO abre el kiosk pronto.

---

## 4. Recomendación

**Opción B.** Justificación:

1. **Costo/beneficio óptimo:** 10 min de cambio resuelve el caso real reportado hoy. La implementación F1.5 backend ya está desplegada — solo falta que el frontend la deje llegar.
2. **Reutiliza máximo lo que ya hicimos:** el auto-rescate en workflow checkin (3 nodos nuevos) ya quedó probado por `n8n_validate_workflow`. Solo falta dispararlo.
3. **UX limpia:** 1 botón con comportamiento correcto > 2 botones con elección que el empleado no entiende. Renombrar a "✅ Checar entrada" + tooltip opcional.
4. **Salvaguarda:** el `if (horas >= 16)` interno protege contra cambios futuros en el umbral backend (`UMBRAL_ERROR_CRITICO`).
5. **No bloquea backlog:** Opción D queda como defensa profunda para sprint futuro (no urgente — caso edge donde empleado nunca abre kiosk).

---

## 5. ¿Bloquea el merge del PR actual?

**No bloquea, pero recomiendo fix-up commit en la misma branch antes del merge.**

Razones:
- El PR actual de F1.5 ya merge-able técnicamente: backend funciona, validation OK, geocerca Issue 1 funciona perfectamente.
- **PERO** el auto-rescate Issue 2 efectivamente NO ESTÁ FUNCIONAL en producción porque el frontend lo bypassa. Mergear sin fix sería desplegar 50% del Issue 2.
- Caso real de hoy (Ricardo + Héctor pendientes desde Vie 8) seguiría sin resolverse hasta que se haga el fix.

**Plan sugerido:**

1. Mantener PR abierto en branch `feature/sprint-f1.5-topochico-y-checkout-bloqueado`.
2. Agregar fix-up commit con Opción B (10 min de implementación).
3. Mergear PR completo.
4. Tests E2E: Ricardo + Héctor abren kiosk → ven "Checkeo sin salida (+24 hrs)" + botón "✅ Checar entrada" → click → auto-rescate dispara → check-in nuevo creado + incidencia para Ana Laura.

**Si Esteban prefiere mergear ya el PR como está + fix-up PR separado**, también es válido pero deja 50% del Issue 2 en producción sin funcionar — durante esa ventana, casos como Ricardo siguen bloqueados.

---

## 6. Próximos pasos (sin implementar)

Aguardando decisión:

1. ¿Opción B? (recomendada, 10 min, ~10 líneas en kiosk.js)
2. ¿Otra opción?
3. ¿Cambiar también el label del botón principal de "🔴 Resolver ahora" a "✅ Checar entrada"?
4. ¿Mostrar un toast/notificación al empleado post-auto-rescate explicando que su salida del Vie 8 se cerró a 9.6h? O ¿silencioso 100%?
5. ¿Fix-up commit en branch actual, o PR separado?
