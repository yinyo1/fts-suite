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
n8n retardos/jornada  ── viernes 08:00 ─────────►  retardos.jornada_corte()   semana FTS viernes a jueves (§11)
n8n retardos/resumen-semanal ── viernes 10:00 ─►  retardos.resumen_semanal()
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
| Tolerancia | 15 minutos al segundo: 15:00 no es retardo, 15:01 sí (§11) | regla de Esteban, 28-sep-2026 |
| Qué checada cuenta | La primera del día, en hora del centro (CST, UTC-6), convertida en un solo lugar | recuperado |
| Días | Lunes a viernes, menos feriados. Sábado y domingo nunca son retardo | recuperado + §11 |
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

> **Actualizado por el complemento de la sesión 2 (§10):** la firma la recolecta RH, no la persona, y el nivel 4 arranca como "nivel de suspensión alcanzado, no aplicado".

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

> **Reemplazado en parte por §10.3.** La tabla de abajo es el diseño de la sesión 1; los correos vigentes están en §10.3.

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
3. **Tolerancia:** 15 minutos al segundo (§11, `confirmado = false` hasta que RH lo confirme).
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

## 10. Complemento de la sesión 2: RH recolecta las firmas

Decisiones de Esteban del 28-sep-2026. Donde choquen con las secciones anteriores, manda ésta.

### 10.1 Quién hace qué

| Paso | Antes (sesión 1) | Ahora |
|---|---|---|
| Recibe la hoja | La persona, por correo, con PDF | **RH**, por correo, con PDF y copia al jefe |
| Se entera | La persona, con la hoja | La persona, con un **aviso informativo** y el PDF; no tiene que contestar |
| Recolecta la firma | La persona la devuelve firmada | **RH** cita a la persona y recolecta la firma, o la negativa con **dos testigos** |
| Sube la hoja | La persona, respondiendo el correo | **RH**, desde el panel, la carpeta o el correo |
| Lee la hoja | RH a ojo | El **lector** sugiere; **RH confirma** en "Hojas por confirmar" |
| Plazo | 3 días hábiles para la persona | `dias_recoleccion_rh` (3) días hábiles para RH |
| Recordatorio | A la persona, copia jefe y RH | A **RH**, con copia al jefe |
| Escalamiento | A RH y jefe, copia Dirección | A **Dirección** (`escalamiento_cc`), con copia a RH |

Si la persona contesta el correo con la hoja firmada, se acepta igual: el adjunto entra al
mismo lector y RH lo confirma.

### 10.2 La hoja

Hecha para que una máquina la lea (`retardos/lib/pdf.js`, geometría en
`retardos/hojas/fts_hojas/layout.json`):

- folio grande arriba y un código QR en cada página (`FTS|folio|nivel|página`);
- tres marcas de esquina para enderezar fotos de celular;
- recuadros delimitados de firma: trabajador, RH, jefe y dos testigos;
- casilla "Se negó a firmar" y recuadro de comentarios del trabajador (derecho a ser oído);
- en carta y acta, un párrafo de reincidencia **marcado como pendiente de validación de Legal**.

### 10.3 Correos vigentes

| Correo | A quién | Cuándo |
|---|---|---|
| Aviso (nivel 1) | La persona; sin correo, su jefe | Al abrir el caso |
| Hoja por recolectar | RH, copia al jefe, con PDF | Al abrir carta o acta |
| Aviso al trabajador | La persona, con el PDF, informativo | Al abrir carta o acta, si tiene correo |
| Recordatorio | RH, copia al jefe | Primer vencimiento |
| Escalamiento | Dirección, copia RH | Segundo vencimiento |
| Hoja por confirmar | RH | Cuando el lector termina de leer una hoja |
| Revisión | RH | Respuesta sin adjunto utilizable o sin folio |
| Alerta de modo | Esteban y RH | Se cumple un disparador de `MODO_SUSPENSION.md` §2 |
| Resumen semanal | RH y Dirección | Lunes; incluye acierto del lector y alertas abiertas |

**A qué correo.** Se lee de Odoo (`work_email`, `private_email`) y se resuelve en Postgres,
sin escribir en Odoo:

- empresa si hay, si no el personal (`correo_modo = preferente`), o los dos (`ambos`);
- se descartan direcciones inválidas y buzones compartidos o genéricos;
- cada envío guarda qué correo se usó y de qué campo salió.

### 10.4 El lector de hojas

Servicio `retardos-hojas` en Railway, en red privada:

- sin base de datos, sin credenciales y sin herramientas: recibe un archivo y devuelve JSON;
- lee el QR (o el folio por OCR), la tinta de cada recuadro, la casilla de negativa y los
  comentarios;
- texto que parezca instrucción se marca como posible inyección.

n8n (`retardos/hojas`, cada 5 minutos) le pasa las hojas pendientes y guarda la lectura.
Postgres calcula la sugerencia, una de:

- lista para validar;
- falta firma X;
- folio o nombre no coinciden;
- posible impugnación;
- ilegible;
- posible inyección.

**RH decide siempre.** Puede confirmar firmada, negativa o impugnación, corregir el folio,
pedir la hoja de nuevo o descartarla. Cada lectura y cada decisión van a la bitácora, y el
acierto del lector sale en el resumen semanal.

- Cada hoja se guarda con su sha256: subir dos veces la misma no la duplica.
- El latido alerta si hay hojas atoradas o el lector falla.

### 10.5 Sin suspensiones al arrancar

`modo_sanciones = sin_suspension`:

- aviso, carta y acta funcionan;
- el nivel 4 queda `RETENIDO` como "nivel de suspensión alcanzado, no aplicado" y cuenta
  como antecedente;
- la reincidencia acumulada se sigue por persona con semáforo;
- una alerta **recomienda** cambiar de modo, pero nunca lo cambia.

Cómo y cuándo cambiar: `MODO_SUSPENSION.md`.

## 11. Reglas definitivas (reglas R3, 28-sep-2026)

Decisiones de Esteban. Donde choquen con lo anterior, manda esta sección. Migraciones
`retardos_0007` y `retardos_0008`. Todos los valores nacen `confirmado = false`.

### 11.1 Retardo

- **Hora del centro (CST, UTC-6 todo el año).** Toda conversión vive en `retardos.a_local` y
  `retardos.seg_local`. Probado en los bordes del día: una checada de las 23:59:59 CST no se
  corre al día siguiente.
- **15 minutos al segundo.** Llegar 15:00 después de la hora de entrada no es retardo; 15:01 sí.
  La comparación es en segundos, no en minutos redondeados. Clave `tolerancia_min`.
- **Lunes a viernes.** Sábado y domingo nunca son retardo, aunque la clave `dias_habiles` diga
  otra cosa: el sistema intersecta con lunes a viernes. Sus horas sí cuentan para la jornada.
- **Feriados del artículo 74 de la LFT** de 2026 y 2027 sembrados (`creado_por =
  semilla_lft_art74`). Dirección agrega o quita los de la empresa en Configuración.

### 11.2 Jornada semanal FTS

- **Semana de viernes 00:00 a jueves 23:59:59 CST**, con la misma numeración que Nómina
  (jueves 23-jul-2026 = S30, sin reinicio en enero). Una asistencia que cruza el corte se
  parte en dos.
- **Horas efectivas** = horas registradas menos 30 minutos de comida por día trabajado, sin
  duplicar una comida que Odoo ya haya registrado (`jornada_comida_min`). En fin de semana la
  comida se descuenta sólo si trabajó al menos 6 horas (`jornada_comida_fin_de_semana =
  desde_horas`); ver la pregunta a Legal en `PARA_LEGAL.md`.
- **Umbral 48 horas.** Si el calendario de la persona en Odoo difiere en más de 0.5 horas
  efectivas, se usa el suyo y se marca en Calidad de datos. Hoy aplica a las 2 personas con el
  calendario de FTS USA (50.5 horas). Los calendarios de oficina y operaciones dan 10 horas de
  presencia por día, 9.5 efectivas: **47.5 a la semana, media hora abajo de 48** (ver §11.5).
- **Prorrateo: 9.6 horas menos por día hábil cubierto** (feriado, permiso, incapacidad,
  vacaciones, día que no cuenta, disputa, o lo que Nómina · Incidencias declare para esa
  semana). Máximo 5 días. Si un día se cuenta dos veces, el umbral baja de más: es el error
  tolerable, nunca el de exigir horas de un día de vacaciones.
- **Datos incompletos van a "Jornada por revisar", no a aviso:** entrada sin salida, salida sin
  leer, asistencia de más de 16 horas, incidencia abierta en Odoo, o semana sin ninguna
  asistencia. RH confirma, corrige o marca que no aplica; eso queda en la bitácora.
- **Corte el viernes 08:00** (`retardos/jornada`), idempotente: correrlo dos veces no duplica
  nada, y una semana que RH ya revisó o que ya abrió aviso no se recalcula.
- **Avisos**, folio `JOR-AAAA-NNNN`, dentro de una ventana de 90 días:
  1. primer aviso por correo a la persona, con copia a RH y al jefe;
  2. segundo aviso igual;
  3. tercer aviso con hoja con QR que RH imprime y recolecta, y una **propuesta de medida**
     (descuento de tiempo no laborado) que queda **retenida** (`modo_medidas_jornada`).
  Cada aviso da `jornada_plazo_correccion_dias` (3) para corregir un olvido de checada.
- **Arranque:** `jornada_desde = 2026-10-02`. Las semanas anteriores se calculan y no abren
  avisos. `jornada_envio = inmediato` manda el aviso el viernes del corte; `lunes` espera al
  lunes, por si Nómina todavía captura.
- **Verificación con Nómina:** cuando `modo_medidas_jornada = habilitadas`, `retardos/verificar`
  busca el descuento en `nom_semana_persona` (tipo `jornada_tipo_nomina_descuento`) y alerta a
  RH si no está.

### 11.3 Textos

Todas las plantillas nuevas y la del aviso de retardo llevan `estado_texto =
pendiente_validacion_rh`. Cómo reemplazarlas: `PLANTILLAS.md`.

### 11.4 Simulación con datos reales (28-sep-2026, sólo lectura, consola TMP)

**Retardos** (escalera 1/3/5/7, 29 activos):

| Mes | Hora | Retardos | Personas | Correos a personas, escenario F | Retenidos en F |
|---|---|---|---|---|---|
| ago | ficha | 138 (antes 115 con 20 min) | 19 | 31 | 19 |
| sep | ficha | 141 (antes 124) | 21 | 35 | 21 |
| ago | sugerida | 40 (antes 29) | 15 | 18 | 2 |
| sep | sugerida | 53 (antes 52) | 18 | 28 | 4 |

**Jornada**, últimas 8 semanas FTS (S32 a S39/2026), con las declaraciones de Nómina:

- 232 semanas-persona: **117 abajo de 48** (50%), 85 cumplen, 30 a revisión.
- 27 de 29 personas quedan abajo al menos una semana; 15 en 4 o más; 3 en las 8.
- Horas efectivas promedio por día trabajado: 9.0 a 9.4 (hacen falta 9.6).
- En un día completo la presencia promedio es 9.98 horas; 401 de 880 días completos quedan
  abajo de las 10.1 que pide la regla.
- Con escalera de 90 días saldrían **66 terceros avisos a 20 personas** en 8 semanas.

### 11.5 Lectura

- **El faltante casi no es la media hora del calendario:** con umbral de 47.5 sólo 7 de 117
  semanas pasarían a cumplir.
- **Es sobre todo días sin checada:** 89% de las horas faltantes (987 de 1,107.5) están en
  semanas con un día hábil sin ninguna asistencia o con un día de menos de 6 horas. Eso es olvido
  de checar o ausencia sin registrar, no jornada corta.
- **48 no es realista hoy como se mide.** Antes de mandar avisos a personas, RH tiene que
  limpiar olvidos y ausencias, y decidir si el calendario de Odoo se ajusta a 10.1 horas.

