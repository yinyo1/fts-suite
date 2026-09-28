# Retardos v2 · Propuesta

Issue rector: **#334**. Relacionados: #282 (blindaje del kiosko), #220 (watchdogs), #123 (HMAC).
Prototipo navegable (datos inventados): `docs/retardos/prototipo.html`, se arma con
`node docs/retardos/armar-prototipo.js` desde el módulo real para que no se desvíe.

Todo lo de este documento usa datos de ejemplo. Los datos reales viven en el Postgres de la
suite (esquema `retardos`) y en ningún otro lado.

## 1. Qué se reconstruyó y por qué se cae distinto esta vez

El sistema anterior era una acción automatizada de Odoo (224 líneas de Python, más cuatro
versiones previas) que mandaba un correo por cada retardo. Se borró el 22-abr-2026 junto con
el resto del código custom de Odoo y nadie lo notó, porque su silencio se veía igual que "nadie
llegó tarde". Aun cuando funcionaba, el ciclo nunca cerraba: el "acto administrativo" era un
correo sin folio, sin documento, sin estado y sin seguimiento. Una misma persona recibió 33.
El forense completo está en el primer comentario de #334.

Retardos v2 cambia las cuatro cosas que faltaban:

| Faltaba | Ahora |
|---|---|
| Documento | Cada caso genera una hoja PDF con folio `RET-AAAA-NNNN`, tabla de retardos, espacio para comentarios del trabajador y renglones de firma (con testigos donde aplica). |
| Estado | Una máquina de estados en Postgres. Un caso abierto no se vuelve a abrir: sube de nivel. |
| Cierre | La persona responde el correo con la hoja firmada. El folio del asunto une la respuesta a su caso; RH la valida en un panel. |
| Latido | Un monitor mide dos veces al día que la detección corrió, que leyó datos y que los correos salen. Si algo se calla, avisa. |

## 2. Arquitectura

```
Odoo (hr.attendance, hr.employee, resource.calendar)          sólo lectura, por RPC
   │
   ▼
n8n retardos/detectar  ── L-V 12:15 y 19:15 ──►  retardos.ingestar()     Postgres, esquema retardos
                                                   ├─ retardo (idempotente por empleado+día)
                                                   ├─ caso (folio, nivel, estado)
                                                   └─ envio (outbox con clave de dedupe)
n8n retardos/enviar    ── cada 20 min ──────────►  retardos.por_enviar()  ─► Graph sendMail desde sales@fts.mx
n8n retardos/lector    ── cada 15 min ──────────►  retardos.registrar_respuesta()   (apagado sin buzón)
n8n retardos/verificar ── L-V 09:05 ────────────►  retardos.verificar()   plazos, recordatorios, escalamiento
n8n retardos/resumen-semanal ── lunes 08:10 ───►  retardos.resumen_semanal()
n8n retardos/latido    ── 10:40 y 20:40 ────────►  retardos.salud()  ─► alerta directa por Graph
n8n retardos/error     ── cuando falla cualquiera de los anteriores ─► corrida con error + alerta
n8n retardos/panel     ── webhook POST ─────────►  retardos.panel_seguro()   ◄── panel RH (modulos/rh/retardos)
```

Reglas de la arquitectura:

- **n8n sólo mueve datos.** Toda decisión (qué cuenta, qué nivel toca, qué transición es válida,
  a quién se escribe) vive en funciones de Postgres probadas con el simulador. Si la hoja viene
  firmada o no lo decide RH mirándola en el panel.
- **Odoo es registro.** Cero código custom nuevo en Odoo. La nota en el chatter del empleado
  es un envío más del outbox (tipo `odoo_nota`) y en modo sombra no se escribe.
- **Un solo remitente:** `sales@fts.mx`. Si la configuración pidiera otro buzón de Dirección,
  el propio nodo lo regresa a `sales@`.
- **Todo correo pasa por el outbox.** Cada envío tiene una clave de dedupe: el mismo cron
  corrido dos veces no manda dos correos. Los destinatarios reales se resuelven al momento de
  enviar, no al encolar, así que el cambio de modo sombra a real aplica a lo pendiente.

## 3. Reglas de detección

| Regla | Valor propuesto | Origen |
|---|---|---|
| Hora esperada | `hr.employee.x_studio_hora_entrada` (configurable a calendario) | recuperado del sistema anterior |
| Tolerancia | 20 minutos, estricta (21 sí es retardo) | recuperado |
| Qué checada cuenta | La primera del día, en hora de Monterrey | recuperado |
| Días | Lunes a viernes, menos festivos registrados | recuperado + festivos nuevos |
| Periodo | Mes calendario | **propuesto** (antes: ventana móvil de 30 días) |
| Empresas | Sólo `company_id = 1` | por filtro de empresa |
| Contar desde | Configurable. Nada anterior abre casos. | nuevo |

No cuenta un retardo si ese día:

- la asistencia tiene el horario en disputa (TAG de incidencias);
- hay un olvido de entrada registrado (`incidencias-asistencia.json`, cualquier estado menos rechazado);
- hay una exclusión registrada por RH (permiso, trabajo en USA, trabajo en campo, festivo u otro);
- es anterior a `contar_desde`.

Cada exclusión queda en la tabla `retardo` con su motivo: se puede auditar por qué algo no contó.

## 4. Escalera

| Nivel | Medida | Se abre con | Plazo de firma | Testigos | Origen |
|---|---|---|---|---|---|
| 1 | Aviso (informativo) | 1 retardo en el periodo | no se firma | no | recuperado |
| 2 | Carta compromiso | 3 | 3 días hábiles | no | propuesto |
| 3 | Acta administrativa | 5 | 3 días hábiles | dos | recuperado (el "acto") |
| 4 | Citatorio y propuesta de suspensión | 7 | 3 días hábiles | dos | propuesto |

- Se abre sólo el nivel más alto alcanzado. Un caso por persona, periodo y nivel.
- **Reincidencia:** si una persona tuvo un documento firmado y validado en los últimos 30 días,
  el siguiente retardo abre directo el nivel siguiente.
- **La suspensión la decide RH, no el sistema.** El sistema cita, RH escucha, y si procede la
  programa en el panel: de 1 a 8 días hábiles (artículo 423 fracción X de la LFT). El panel
  rechaza 0 o 9.
- Todo documento incluye un espacio de comentarios del trabajador (derecho a ser oído) y el
  panel permite registrar una impugnación con la versión de la persona.

**Todos los valores de esta sección nacen `confirmado = false`.** Ver §8.

## 5. Estados de un caso

```
DETECTADO → NOTIFICADO → ESPERANDO_FIRMA → FIRMA_RECIBIDA → VALIDADO_RH → CERRADO
                │               │  │  │          │               │
                │               │  │  │          └→ (pide otra vez) ESPERANDO_FIRMA
                └→ CERRADO      │  │  └→ IMPUGNADO → VALIDADO_RH / ESPERANDO_FIRMA
               (aviso)          │  └→ SE_NEGO_A_FIRMAR (dos testigos) → VALIDADO_RH
                                └→ VENCIDO → ESCALADO (copia a Dirección)
VALIDADO_RH → ACCION_PROGRAMADA → ACCION_VERIFICADA → CERRADO      (sólo suspensión)
cualquier estado abierto → CANCELADO_POR_RH  (motivo obligatorio)
```

La tabla `transicion_valida` es la única fuente: una transición que no está ahí truena. La
bitácora registra cada paso y no se puede editar ni borrar (trigger).

## 6. Correos

| Correo | A quién | Cuándo |
|---|---|---|
| Notificación con PDF | La persona. Sin correo válido: su supervisor, para entregarla en papel. | Al abrir el caso |
| Falta la hoja | Quien respondió | Respuesta sin adjunto o con adjunto ilegible |
| Recordatorio | La persona, con copia a supervisor y RH | Primer vencimiento |
| Escalamiento | RH y supervisor, con copia a Dirección | Segundo vencimiento |
| Hoja recibida | RH | Al llegar una hoja válida |
| Pendiente de validar | RH | Si RH no valida en 2 días hábiles |
| Alerta de acción | RH y alertas | Suspensión no cargada en Nómina, o con checadas en los días suspendidos |
| Revisión | RH | Respuesta sin folio, con folio inexistente, de otro remitente, o a un caso cerrado |
| Resumen semanal | RH y Dirección | Lunes |

Asuntos con el folio entre corchetes (`[RET-2026-0041]`). Ningún texto usa guiones largos.
En modo sombra todo va a Dirección y RH con `[SOMBRA]` en el asunto y el destinatario real
en una franja al inicio del cuerpo.

## 7. Modo sombra y paso a real

Un solo valor, `retardos.config.modo`, decide. En `sombra` ningún correo llega a un empleado,
las notas de Odoo no se escriben, y cada caso guarda con qué modo se abrió. Pasar a `real`
es un `UPDATE` de una fila; volver es el mismo `UPDATE` al revés. La lista de pasos está en
el comentario de cierre de #334.

## 8. Valores que deben confirmar Dirección, RH y Legal

1. **Escalera:** umbrales 1/3/5/7 y qué documento corresponde a cada nivel.
2. **Periodo:** mes calendario contra ventana móvil de 30 días.
3. **Tolerancia:** 20 minutos.
4. **Hora de entrada:** la ficha (`x_studio_hora_entrada`) contra el calendario. Hoy 6 de 11
   personas de oficina tienen las dos distintas: hay que corregir una u otra en Odoo antes de
   pasar a real.
5. **Legal:** textos de carta compromiso, acta y citatorio, y que el Reglamento Interior de
   Trabajo prevea la suspensión por retardos.
6. **Plazos:** 3 días hábiles para firmar, 2 para que RH valide.
7. **Buzón receptor** de las respuestas.

## 9. Panel de RH

`modulos/rh/retardos/`. Entra con el usuario del Suite. Hace falta el permiso `retardos:read`
para consultar y `retardos:write` para registrar. Muestra:

- lo que espera a RH;
- lo que está vencido;
- las suspensiones por aplicar;
- el detalle de cada caso con la hoja, la bitácora y los correos;
- las reglas vigentes;
- los días que no cuentan.

Tiene un modo de práctica con datos inventados.
