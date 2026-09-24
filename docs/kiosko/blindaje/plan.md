# Kiosko de asistencias · Plan de blindaje por bloques

Cada bloque tiene su prueba de aceptación en el simulador: `node tests/kiosko-blindaje/bloques.test.js --bloque=Bn` demuestra que el escenario falla sin el bloque y pasa con él. Al construir un bloque en producción, el mismo PR pone `construido: true` en `tests/kiosko-blindaje/bloques.json` y, si el comportamiento real difiere del modelado, actualiza `sistema.js`. Desde ese momento la prueba del bloque es obligatoria (una regresión sale con código 1).

Regla de despliegue que aplica a casi todos: el contrato entre kiosko y n8n cambia. Primero se publica la mitad **tolerante** (el servidor acepta el formato viejo y el nuevo), se verifica, y después la estricta (CLAUDE.md §8, regla anti-trabón). Nunca en horario hábil 07:00 a 18:00 CST (CLAUDE.md §20 #14).

## Orden recomendado

| Orden | Bloque | Por qué en ese lugar | Complejidad |
|---|---|---|---|
| 1 | **B1 Visibilidad** | Corta P3 del árbol y todos los M1-M3: sin esto, cualquier otra falla sigue siendo invisible. Crea la bitácora que B10 necesita | Media |
| 2 | **B3 Candado de traslape en resolver** | Corta P5. Chico, de un solo nodo, y es lo que convirtió un mal día en cuatro | Baja |
| 3 | **B2 Fail-closed** | Corta P2. Solo tiene sentido con B1 (si no, el error sigue sin verse) | Baja |
| 4 | **B9 Guarda AM/PM** | Victoria rápida, solo frontend | Baja |
| 5 | **B4 resolver aplica la hora de RH** | Arregla datos que se pierden cada semana (M4, M5) | Baja a media |
| 6 | **B6 Umbrales únicos y búsqueda sin ventana** | Cierra D2 y D4. Toca dos workflows y el frontend a la vez: requiere el despliegue tolerante | Media |
| 7 | **B5 Corregir mi hora de entrada** | Corta P4, el baile. Necesita B3 para ser seguro | Media |
| 8 | **B7 Salida de emergencia** | Garantiza I4 para el empleado | Media |
| 9 | **B10 Watchdog de bloqueados** | Requiere la bitácora de B1 | Baja a media |
| 10 | **B8 Reparar registro para RH** | El más grande (auth firmada, UI nueva). Mientras llega, el desbloqueo sigue siendo manual en Odoo, como con 124 | Alta |

Con B1, B3 y B2 construidos, el caso de Germán ya no se repite: se cortan P2, P3 y P5 (`arbol.test.js`).

## Bloques

### B1 · Visibilidad
- **Invariantes:** I2, I3.
- **Qué se construye:**
  - Kiosko: la confirmación se pinta solo después de `success === true` con `attendance_id`; en el catch y en respuestas sin JSON, pantalla de error con "Reintentar" y la hora del intento; mostrar `mensaje` del servidor.
  - `intento_id` por intento, igual en los reintentos. Tras timeout, `POST kiosk/intento` para reconciliar antes de decidir.
  - `kiosk/checkin`: salida de error en los 4 nodos Odoo de escritura hacia "Code - Respuesta Error" con `codigo_error: ODOO_RECHAZO` y el mensaje de Odoo traducido. Idempotencia por `intento_id` (data table).
  - Data table `kiosk_intentos` y alerta al supervisor (Graph, credencial `Mh5kBNduMzOl3nzT`) con límite de una por empleado por hora.
- **Riesgos:** más errores visibles al principio (lo que hoy se oculta). La cola offline (PR C del sprint de resiliencia) es el complemento para la red caída.
- **Qué toca en otros módulos:** ninguno lee lo que cambia. `nom/semana` se beneficia: menos días perdidos sin que nadie lo sepa.
- **Criterio de aceptación:** ninguna ejecución de `a7mEjjdwIzzvomXs` termina sin pasar por un nodo Respond; con la red cortada el kiosko dice "No se guardó"; el reintento de un intento procesado devuelve la respuesta original.
- **Prueba:** `bloques.test.js --bloque=B1` (red caída en la salida: I2 e I3); la aleatoria en diseño nuevo cubre idempotencia y reconciliación.

### B2 · Fail-closed en la lectura de pendientes
- **Invariante:** I5.
- **Qué se construye:** "Odoo - Buscar pendientes" con `retryOnFail` (2 reintentos, espera corta) y salida de error hacia "Respuesta Error" `ODOO_NO_RESPONDE`. Quitar `continueRegularOutput`.
- **Riesgos:** con Odoo caído nadie checa entrada. Es lo correcto (hoy tampoco quedan, pero nadie lo sabe); B1 y la cola offline hacen que se note y se recupere.
- **Otros módulos:** ninguno.
- **Criterio:** una lectura fallida nunca va seguida de un CREATE o UPDATE en la misma ejecución.
- **Prueba:** `--bloque=B2`.

### B3 · Candado de traslape en resolver (hacia atrás y hacia adelante)
- **Invariante:** I1.
- **Qué se construye:** en `Oc2ceMHX2O0L0y2X`, antes de "Odoo - UPDATE check_in" y "Odoo - UPDATE check_out", leer los registros del empleado alrededor del intervalo nuevo y bloquear si cruza a otro, con un mensaje que nombre el registro. Opción "absorber micro registros del mismo día" solo con confirmación explícita de RH. Salida de error en los UPDATE hacia la respuesta. La misma lógica, como subworkflow compartido, la usan B8 y los olvidos.
- **Riesgos:** RH verá rechazos que hoy "pasan". El mensaje tiene que decir qué hacer.
- **Otros módulos:** panel de incidencias y `nom-resolver.js` deben mostrar el rechazo (hoy lo harían como "El resolver rechazó la acción", L88-107).
- **Criterio:** ningún ajuste deja un registro traslapado; el panel dice "no aplicada: choca con el registro N".
- **Prueba:** `--bloque=B3` (el guion real hasta 104773).

### B4 · resolver aplica la hora de RH
- **Invariante:** I6.
- **Qué se construye:** `aplicaHora` también para `auto_cierre_pendiente` (escribe `check_out` sobre `attendance_id_cerrado`); "aprobar" en `olvido_entrada` aplica la hora declarada. La respuesta trae `odoo_aplicado` y el panel la muestra (hoy nadie la lee: 0 apariciones en el repo). Alternativa mínima: el panel deja de pedir hora en auto-cierre y lo dice.
- **Riesgos:** cambia horas que Confirmar Horas y Carga MO ya pudieron tomar. Solo hacia adelante; los históricos son una decisión aparte (sub-issue de decisión).
- **Otros módulos:** Carga MO (horas por SO/bolsa), Confirmar Horas (horas del día), horas extra.
- **Criterio:** después de "ajustar", el `check_out` en Odoo es la hora de RH, releída; o el panel dice "no aplicada".
- **Prueba:** `--bloque=B4`.

### B5 · Corregir mi hora de entrada sobre el registro abierto
- **Invariante:** I1 (elimina la doble sesión que alimenta el traslape).
- **Qué se construye:** en `activo`, botón "Corregir mi hora de entrada" que crea una incidencia `olvido_entrada` sobre el MISMO `attendance_id` abierto (sin crear registro nuevo). "Resolver ahora" pregunta "¿A qué hora llegaste?" y deja la incidencia sobre la entrada que crea el auto-rescate. `resolver` ya sabe mover `check_in` (con B3 revisando vecinos).
- **Riesgos:** abuso ("llegué antes"). Mitigación: aprobación del supervisor y RH como hoy, y tope de horas hacia atrás.
- **Otros módulos:** Confirmar Horas verá registros con TAG de disputa durante el día.
- **Criterio:** declarar la hora real nunca exige cerrar y reabrir; cero micro registros nuevos.
- **Prueba:** `--bloque=B5`.

### B6 · Umbrales únicos y búsqueda de abiertos sin ventana
- **Invariantes:** I7, I8.
- **Qué se construye:** un solo juego de umbrales (propuesto: activo < 14 h, zona gris 14 a 16 h, huérfano ≥ 16 h) en config compartida, leído por `U13fngg2dTKgDQ8Y` y `a7mEjjdwIzzvomXs`. Búsqueda por `check_out = False` sin fecha. Salida con 16 h o más: el servidor pide declarar la hora (no "Seguí en turno").
- **Riesgos:** el turno nocturno T2 (umbral de 16 h elegido para él, "Code - Analizar candados"). Contrato frontend y servidor: despliegue tolerante primero.
- **Otros módulos:** watchdogs que leen `hr.attendance`; `nom/semana` no.
- **Criterio:** un abierto de cualquier antigüedad se ve en el kiosko; nunca se ofrece un botón que el servidor rechace por umbral.
- **Prueba:** `--bloque=B6` (huérfano de 16 días y zona gris de 20 h).

### B7 · Salida de emergencia en error crítico
- **Invariante:** I4 (empleado).
- **Qué se construye:** en `error_critico`, "Declarar mi hora de salida" (el modal de olvidé salida, sin el límite de 12 h, con tope de 16 h de turno y guarda AM/PM) y "No puedo checar: avisar a RH y a mi supervisor", que persiste una incidencia `bloqueo` ANTES de cualquier escritura en Odoo y deja anotada la hora de llegada del día. El auto-rescate también persiste su incidencia antes de escribir.
- **Riesgos:** "registrar el día de hoy" no es posible en Odoo mientras haya un abierto (rama B); la hora se guarda en la incidencia y RH la aplica al destrabar.
- **Otros módulos:** panel de incidencias (tipo nuevo `bloqueo`), `nom/semana` (disputa visible).
- **Criterio:** desde cualquier estado el empleado puede, como mínimo, dejar constancia persistida y alertada en menos de un minuto.
- **Prueba:** `--bloque=B7` (estado trabado real).

### B8 · Reparar registro (RH)
- **Invariante:** I4 (RH), I1.
- **Qué se construye:** partir de `shared/admin/editor-asistencias.html`: vista por empleado con traslapes y micro registros marcados, acciones cerrar, mover y borrar con candado de traslape (el mismo subworkflow de B3), vista previa antes y después, doble confirmación y relectura de Odoo. Autenticación firmada del lado del servidor (JWT con scope, como `nom/semana`), no el token base64 sin firma de hoy (L778-791).
- **Riesgos:** herramienta poderosa: auditoría en chatter con `author_id` correcto, permisos por scope.
- **Otros módulos:** Carga MO y Confirmar Horas (horas cambian); se registra en el chatter para rastreo.
- **Criterio:** RH destraba un caso como el de 124 sin entrar a Odoo, y la herramienta impide crear un traslape.
- **Prueba:** `--bloque=B8`.

### B9 · Guarda AM/PM en olvidé salida
- **Invariante:** I8.
- **Qué se construye:** en `confirmarOlvideCheckout` (`kiosk.js:1962`), si el turno resultante pasa de 16 h y la hora menos 12 h cae después de la entrada, preguntar "¿Quisiste decir HH+12?". Mostrar siempre la duración calculada antes de enviar.
- **Riesgos:** mínimos.
- **Otros módulos:** ninguno.
- **Criterio:** "05:05" con entrada 06:57 del día anterior propone 17:05 y el turno queda en 10.1 h.
- **Prueba:** `--bloque=B9` (como 14966).

### B10 · Watchdog de bloqueados
- **Invariante:** I9. Requiere B1.
- **Qué se construye:** `sin-checkin` (`Q19zFeJQytSfBjdb`) lee `kiosk_intentos`: quien tiene intentos fallidos no sale como "ausente" sino como "bloqueado". Watchdog nuevo cada hora hábil: ≥ 2 fallas en 24 h, traslapes, micro registros y abiertos de 16 h o más, con correo a supervisor y RH.
- **Riesgos:** ruido; límite de frecuencia.
- **Otros módulos:** ninguno.
- **Criterio:** el caso 124 habría disparado alerta el vie 18 a las 17:09, no el vie 25.
- **Prueba:** `--bloque=B10`.

## Fuera de bloques (anotado, no perseguido)

- Cola offline con `ts_evento` (PR C del sprint de resiliencia, PR #49): complemento natural de B1 para la red caída del jueves 17.
- Cron de cierre nocturno (PR E): hoy el auto-rescate solo corre cuando el empleado vuelve.
- Confirmar Horas y `corregir-bolsa` no leen `check_out` del lado del servidor: pueden aprobar un abierto si alguien llama al webhook sin la UI (`7D3lgaYmH2DmqCWy`, "Odoo - READ att").
