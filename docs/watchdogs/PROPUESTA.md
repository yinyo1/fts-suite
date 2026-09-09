# Propuesta de rediseño de los watchdogs — septiembre 2026

Documento de propuesta. **Nada de lo de aquí está construido.** La evidencia que lo sostiene
está en [`AUDITORIA-2026-09.md`](AUDITORIA-2026-09.md); aquí solo se decide qué hacer con
ella.

---

## 0. La vara

> El objetivo de un watchdog es dar seguimiento a **anomalías**. Una anomalía es algo que
> cambió, que se salió de rango, o que alguien puede accionar hoy. Un estado que lleva 252
> días igual no es una anomalía, es una **condición**.

Traducida a una prueba que se puede aplicar renglón por renglón, en ese orden:

1. **¿Cambió algo desde el correo anterior?** Si el renglón es idéntico al de ayer, no es
   noticia.
2. **¿Se salió de un rango que alguien pactó?** No "lleva mucho tiempo", sino *pasó una fecha
   comprometida, un vencimiento de factura, un plazo acordado*. Sin fecha pactada no hay
   rango, y sin rango no hay "salirse".
3. **¿Alguien de la lista de destinatarios puede hacer algo hoy?** Si la acción es de un
   tercero, del calendario o de nadie, el renglón no va en ese correo.

Un renglón necesita **al menos una de las tres**. Hoy el semáforo no exige ninguna: le basta
que un contador cruce un umbral, y ese contador (por el error #1) mide la edad del proyecto.

**El número que resume el problema:** de los 1,231 renglones enviados en 12 semanas, **76 %
provienen de 28 proyectos vistos en 20 o más de las 58 corridas**. Tres proyectos aparecieron
en **58 de 58**. Eso no es vigilancia, es una suscripción.

---

## 1. Qué debe entrar al correo y qué no

### Entra

| # | Señal | Por qué pasa la vara | Dato que la calcula |
|---|---|---|---|
| E1 | **Factura vencida y no pagada** | Se salió de un rango pactado por el cliente | `account.move.invoice_date_due < hoy` **y** `amount_residual != 0` |
| E2 | **Factura que vence en ≤ 5 días hábiles** | Accionable hoy, y solo hoy sirve | `invoice_date_due` dentro de la ventana |
| E3 | **Fecha compromiso del proyecto vencida** | Se salió de un rango que pactó FTS | `project.date < hoy` |
| E4 | **Transición de stage ocurrida ayer** | Cambió | `mail.tracking.value` del día |
| E5 | **Proyecto que entró a un stage nuevo y no salió en su plazo** | Se salió de rango — *con la métrica arreglada* | fecha real de entrada al stage |
| E6 | **Fecha compromiso incoherente** (vencida hace >15 días hábiles, o de relleno a fin de año) | Cambió el mundo y el dato no | `project.date` vs hoy |
| E7 | **Espera de tercero que ya caducó** | Volvió a ser nuestro | `esperando_hasta < hoy` |
| E8 | **El watchdog no pudo medir** (search vacío, config no cargó, Odoo falló) | Es lo único que nadie más va a notar | guards explícitos |

### No entra

| Sale | Por qué |
|---|---|
| Proyectos con N días en un stage **sin fecha pactada** | No hay rango del cual salirse. Es una condición. |
| **Todo renglón idéntico al del correo anterior** | No cambió nada |
| **Ausencia de log note como falta en sí misma** | Ver §2.3: mide un ritual, no el proyecto |
| Facturas **no vencidas** | Erick ya lo dijo: *"no le vemos sentido a estar comente y comente sino hasta que se acerque el vencimiento"* |
| Proyectos con **AR = 0** (cobrados) | Terminados. Ver §5 |
| Bloqueos declarados de tercero, **dentro de su vigencia** | Ver §4 |
| Cambios de stage y de fecha hechos por **quien tiene el trabajo asignado** | Es el trabajo, no una manipulación |
| **Repetición diaria de un evento de hace 30 días** | Un evento se reporta el día que ocurre |
| `ap_sin_confirmacion` como está hoy | Dispara en 8 de 8: no discrimina. Ver §3.4 |
| **El correo entero, cuando no hay ninguna de E1–E8** | Ver §6.4 |

---

## 2. Cómo distinguir anomalía de condición

### 2.1 La regla de oro: reportar el **delta**, no el **estado**

El semáforo ya tiene la infraestructura y la usa **solo para los log notes** — en
`Code - buildLogNotes` hay una firma por proyecto (`color_a|color_b|banderas`) guardada en
`staticData.estadoPrev`, y la nota se escribe **solo si la firma cambió**. Ese mismo criterio,
aplicado al correo, es la mitad del rediseño.

Propuesta concreta:

```
firma(proyecto) = estado_cobranza | dias_de_atraso_por_tramo | banderas_activas | stage
```

`dias_de_atraso_por_tramo` en lugar de días exactos, para que un renglón no "cambie" cada 24
horas: tramos `0` / `1-5` / `6-15` / `16-30` / `>30`. Así SO10300 aparece el día que cruza a
"16-30 días de atraso" y **no** los quince días intermedios.

Cada renglón se clasifica y se pinta distinto:

- 🆕 **NUEVO** — no estaba ayer. Es la anomalía.
- 📈 **EMPEORÓ** — cambió de tramo hacia arriba, o le cambió el estado de cobranza.
- ✅ **SE RESOLVIÓ** — estaba y ya no. **Esto hoy no se reporta y debería**: es lo único que
  le dice al equipo que su trabajo tuvo efecto.
- ➖ **SIN CAMBIO** — **no se imprime**; se cuenta en una línea al pie.

### 2.2 La condición sigue existiendo, pero deja de mandar correo

Una condición no se ignora: se **acumula y se revisa en junta**. Dos salidas, ninguna diaria:

- **Un renglón al pie del correo:** *"32 proyectos en condición estable (sin cambio ≥ 5
  corridas) — ver el tablero"*.
- **Un digest semanal, los lunes**, con las condiciones ordenadas por dinero y antigüedad.
  Ahí sí caben SO7723 (401 días) y SO11037 (266 días en Hold): **una vez por semana, no 58
  veces**. Es exactamente el foro que Erick pidió por escrito.

Y el destino natural de ese digest es el frontend `operaciones/semaforo/` que sigue pendiente
(CLAUDE.md §18 #4 y #5). Hoy los 60 snapshots **no los lee nadie**: darles un lector convierte
el correo diario en "lo que cambió" y el tablero en "cómo estamos".

### 2.3 Y el semáforo B (falta de seguimiento) se retira como métrica

No es un ajuste de umbral, es un retiro, y lo sostienen tres medidas de la auditoría:

1. **Verde es inalcanzable.** `rojo_dias = 2` → amarillo = 1 → verde exige
   `dias_sin_seguimiento = 0`, o sea una nota escrita **hoy antes de las 08:00 CST**, que es
   cuando sale el correo. Los 15 verdes del 25-ago tienen **todos** el valor 0; no hay un solo
   verde con 1.
2. **Lleva 11 corridas seguidas en 0 % verde**, dos de ellas con el 100 % de la cartera en
   rojo (34/34 el 4-sep, 35/35 el 8-sep), contra una meta impresa de ≥ 90 %.
3. **Mide el día de la semana.** Los 19 renglones de Operaciones del 8-sep traen
   `nota = 2d` — **los 19, el mismo número** — porque el equipo escribe notas en tanda el
   viernes. El lunes 7-sep, 20 proyectos traían exactamente `1d`. La métrica no distingue
   proyectos.

Una métrica que nunca puede estar verde no mide desempeño: **entrena a ignorar el correo**. Y
el daño es mayor que el ruido, porque los renglones legítimos (E1–E8) llegan en el mismo
mensaje.

Lo que **sí** se conserva de esa idea, porque sí pasa la vara: **`SEGUIMIENTO SIN AVANCE`**
(racha de notas casi idénticas ≥ 2 sobre un proyecto que no avanza). Esa señal no cuenta días,
detecta un patrón — copy-paste sostenido — y su falso positivo es barato. Se queda tal cual.

---

## 3. Qué hacer con lo accionable por terceros

Hoy no hay dónde ponerlo, y el equipo lo dijo dos veces: *"nos responden cuando quieren"*
(Magnekon), *"no han ido para calar el sensor para que Juventino nos de el VoBo"* (SO7723),
más el rigging detenido en la aduana del cliente (SO11233). La única salida disponible es
mover a `Hold`, y Hold **castiga** (rojo a 30 días) y **además** levanta
`hold_sin_fecha_vigente` si no se captura una fecha que, cuando el bloqueo es una aduana, no
existe. El proyecto 2361 lo demuestra: hoy trae `hold_sin_fecha_vigente` **y** `nota_vacia`.

### 3.1 Un estado explícito de espera, con caducidad obligatoria

```
espera: {
  motivo: 'cliente' | 'aduana' | 'proveedor' | 'permiso' | 'clima',
  desde: 'AAAA-MM-DD',
  hasta: 'AAAA-MM-DD',        // OBLIGATORIO
  quien_declara: '<persona>',
  nota: '<una línea>'
}
```

Efectos:

- Mientras `hoy <= hasta`: el proyecto **sale de las secciones rojas** y aparece en un bloque
  **`⏳ EN ESPERA DE TERCEROS`**, sin color, informativo, con el motivo y la fecha.
- El día que `hasta` vence: **vuelve como 🆕 anomalía** con la etiqueta *"la espera venció —
  ¿se reactivó o se re-declara?"*. Esa es la señal E7, y es una anomalía de verdad: alguien
  pactó una fecha y llegó.
- **Sin `hasta` no hay espera.** Una espera sin caducidad es la forma más limpia de apagar el
  watchdog por la puerta de atrás, y hay que cerrarla de entrada.
- Tope: `hasta` no puede estar a más de **20 días hábiles**. Una espera más larga que eso se
  re-declara, que es un acto deliberado y deja rastro.

### 3.2 Dónde vive

Recomiendo **`shared/operaciones/esperas.json` en el repo**, no un campo de Studio, por tres
razones: se edita con un PR (queda quién y cuándo, gratis), el patrón de config viva ya está
probado en cinco workflows, y **no requiere que Esteban toque Odoo** — que hoy es un cuello de
botella porque el MCP de Odoo es read-only (CLAUDE.md §17). Si más adelante se quiere que
Felipe lo declare desde el kiosk o desde el panel, el archivo se sustituye por un campo sin
tocar la lógica.

### 3.3 Lo que la espera NO debe hacer

No debe **ocultar la cobranza**. Un proyecto puede estar esperando a la aduana y tener una
factura vencida al mismo tiempo; son dos relojes distintos con dos dueños distintos. La espera
silencia el reloj de **operación**, nunca el de **dinero**.

### 3.4 El caso `ap_sin_confirmacion`

509 apariciones, el tipo de bandera más frecuente de la historia, y ayer disparó en **8 de 8**
proyectos del stage 13. Un control que marca al 100 % de su población no está midiendo
cumplimiento: está midiendo que el proceso que pide (log note + pantallazo del portal de AP)
**nunca se adoptó**. Dos caminos honestos, y hay que elegir uno:

- **(a)** Es un requisito real → entonces es un tema de capacitación y de una fecha de
  arranque, y hasta esa fecha la bandera **no va en el correo**.
- **(b)** No se va a adoptar → **se apaga** (`ap_confirmacion.aplica_stages: []`).

Lo que no se puede seguir haciendo es mandarla todos los días a cinco personas durante tres
meses. **Recomiendo (b) por ahora**, y reconsiderar si con `invoice_date_due` (§7) todavía
hace falta: buena parte de lo que ese control quería aproximar —*"¿esta factura de verdad está
en el circuito de pago del cliente?"*— lo responde mejor el vencimiento real de la factura.

---

## 4. Qué estados deben ser terminales

Terminal = **el watchdog deja de mirarlo, para siempre o hasta que vuelva a moverse**.

### 4.1 Terminal por cobranza — el que falta y es el más importante

**Un proyecto cuyas facturas están todas en `amount_residual = 0` está terminado para el
watchdog**, sin importar en qué stage lo hayan dejado.

Evidencia de que esto sobra hoy: **SO11789** (proyecto 2357) sigue en "En plazo de credito" y
llevaba **14 corridas** en el correo; su factura **INV171 tiene `amount_residual = 0.00`,
`payment_state: in_payment`** — está cobrada. Y **SO11557** (proyecto 2305) acumuló **32
corridas rojas** con **INV172 en `residual 0.00`**.

Ese cálculo **ya existe y está en producción**: `project/archive-budget-cierre`
(`RW7KnoeEzYLvavI0`) computa AR y AP por analítica con `account.move.line` +
`analytic_distribution 'in' [cuenta]` + `parent_state = posted` + `amount_residual != 0`, y
usa `amount_residual` en vez de `payment_state` justamente para blindarse contra los 5,649
`in_payment` (CLAUDE.md §17 Frente B). **Es código que copiar, no que inventar.** Y de paso
cierra el hueco de que dos automatizaciones miren el mismo proyecto, una con noción de
cobranza y la otra sin ella.

### 4.2 Terminal por stage

Ya excluidos: 8 (Complete TOTAL), 4 (Canceled), 6 (Templates). Agregar **14 "Incobrables"**,
que `docs/operaciones/FASE15_CUENTAS_WATCHDOGS.md` §7.2 ya identificó como hueco: un
incobrable no se acciona persiguiéndolo en un correo diario.

### 4.3 Terminal por decisión declarada

El caso Luminarias (SO11037, 58 de 58 corridas, 266 días en Hold, *"no se puede cancelar por
estar ya facturado"*). Ningún estado de Odoo describe eso, así que hace falta declararlo:
**`cerrado_administrativamente`**, con motivo y quién lo declaró, en el mismo archivo de
config. El proyecto queda en su stage —porque contablemente tiene que quedarse— y el watchdog
lo saca. Reaparece **solo** si vuelve a cambiar de stage o si le nace una factura vencida.

### 4.4 Lo que NO debe ser terminal

- **"Lleva mucho tiempo así"**. Eso es condición → digest semanal (§2.2), no terminal.
- **"El equipo ya explicó por qué"**. Una explicación no cierra un pendiente. SO7723 tiene
  explicación desde el 19-ago y sigue con 269,708.12 sin cobrar.

---

## 5. Qué necesita ver cada destinatario, y qué le sobra

Destinatarios reales de hoy (leídos de `shared/operaciones/sla_stages.json`, §1.2 de la
auditoría). Regla del PASO 4: **si un renglón no es accionable por nadie de la lista, no va en
ese correo.**

### 5.1 Semáforo Operaciones → Felipe, Gibrán, Mateo, Esteban, info_comercialFTS

| Necesita | Le sobra |
|---|---|
| Fecha compromiso **vencida** en un proyecto suyo (E3) — **11 de los 19 renglones de ayer** | Los 19 renglones de `2d sin nota`. Es el día de la semana, no información |
| Fecha compromiso **incoherente** (E6): 4 proyectos con `31-dic` de relleno, y SO11860 **creado el 4-sep con fecha compromiso del 28-ago** | Renglones de crédito y cobranza: **ninguno de los cinco los acciona** |
| Cambios de stage de ayer en su cartera (E4) | La bandera "Stage regresado … por OPERACIONES FTS-YIN": **son ellos mismos**, 133 veces |
| `SEGUIMIENTO SIN AVANCE` (nota copy-paste) | Esperas de terceros vigentes |
| Proyectos que se resolvieron (✅) | Repetición de un evento de hace 30 días |

**Cambio de fondo:** el correo de Operaciones debe dejar de preguntar *"¿pusiste tu nota?"* y
empezar a preguntar *"¿esta fecha que prometiste sigue siendo verdad?"*. Es la misma cadencia
diaria, sobre un dato que sí es del equipo y que sí tiene consecuencia con el cliente.

⚠️ **`info_comercialFTS@fts.mx` está en los dos correos.** Es un buzón de grupo que recibe
~114 correos por trimestre de los cuales, con el rediseño, casi nada le corresponde accionar.
Recomiendo **sacarlo de los dos** y, si Comercial necesita visibilidad, darle el digest
semanal. Un buzón compartido en copia diaria es donde la alerta muere sin dueño.

### 5.2 Semáforo Admin → Erick, Gerardo, Carolina, Esteban, info_comercialFTS

| Necesita | Le sobra |
|---|---|
| **Facturas vencidas y no pagadas, con monto y días de atraso** (E1) — hoy: **$1,284,178 MXN de Magnekon vencidos hace 16 días hábiles**, enterrados entre renglones de 401 días | Los 9 renglones `Done Operations` de 7–16 días marcados CRITICO, 5 de ellos creados el mismo día en una carga de materiales |
| **Facturas por vencer en ≤ 5 días** (E2) — hoy: **INV1996, $123,424, vence el 10-sep** | Facturas que vencen en octubre, noviembre y diciembre |
| Proyectos con **AR = 0** que hay que **cerrar** (§4.1) | "N días en stage" como métrica: por el error #1 es la edad del proyecto |
| Clientes **sin plazo configurado**, como tarea de captura | `ap_sin_confirmacion` en 8 de 8 |
| Facturas emitidas ayer (E4 del lado de cobranza) | Renglones de fechas compromiso de operación |

**Erick ya escribió qué le sobra**, y es la lista de arriba casi textual. Su frase sobre
INV1996 —*"no le vemos sentido a estar comente y comente sino hasta que se acerque el
vencimiento"*— **es la regla E2**, propuesta por el destinatario.

### 5.3 `fin/watchdog-captura` → solo Esteban

Aquí el problema es el inverso: **un solo destinatario, hardcodeado en el Code node**, para
alertas cuya acción es de otro. `LINK_DESCONECTADO` pide *"Reconnect en Odoo"* —
Gerardo/Eduardo. `CHASE_DELTA_DERIVO` con el saldo inicial de la 122 pide *"que Gerardo
registre el asiento de apertura"*, y así lo dice el propio comentario del código.

Propuesta: mover los destinatarios a **`shared/finanzas/watchdog_captura.json`** (mismo patrón
que los otros cuatro) y **rutear por tipo de alerta**: enlace/sync/delta → Gerardo + Esteban;
faltantes/rechazos/matcher → Esteban; el latido del propio watchdog → Esteban. Un destinatario
único que no puede ejecutar la acción es una alerta que se lee y no se atiende.

Sobre el ruido de este watchdog: **17 de 17 correos dijeron ALERTA**, con `LINK_DESCONECTADO`
cuatro días seguidos, `CHASE_SYNC_RANCIO` otros cuatro, y `CHASE_DELTA_DERIVO` el 3-sep
(0.00 → −62.53) y otra vez el 4-sep (−62.53 → 0.00) por **el mismo hueco transitorio en las
dos direcciones**. La edición del **2026-09-09 04:49 UTC** ya atacó las dos últimas
(`delta_esperado` constante en vez de comparar contra ayer, gracia de captura por journal, y
frescura medida con `create_date` en vez de `last_sync`). **Lo que queda por aplicarle es
§2.1: reportar el delta.** Un `LINK_DESCONECTADO` es una anomalía **el día 1**; los días 2, 3
y 4 es una condición conocida, y con eso basta un recordatorio semanal hasta que se reconecte.

---

## 6. La estructura de correo propuesta

### 6.1 Asunto

Hoy: `[Semaforo Admin] 08/Sep/2026 - 🔴🔴 14 criticos · 🔵 0 estancados · 📝 2 sin nota`.
Tres números que llevan semanas casi iguales, así que el asunto no informa.

Propuesto: **lo que cambió, y el dinero.**

```
[Cobranza] 09/Sep — 2 nuevas vencidas ($1,288,647) · 1 vence en 2 días · 1 por cerrar
[Operacion] 09/Sep — 3 fechas vencidas nuevas · 4 sin fecha creible · 1 espera vencida
```

Si no hay nada nuevo: `[Cobranza] 09/Sep — sin cambios (4 en seguimiento)`. Y si no hay nada
en absoluto, **no hay correo** (§6.4).

### 6.2 Orden de las secciones

1. **🆕 NUEVO HOY** — lo que no estaba ayer. Si está vacía, se dice en una línea.
2. **📈 EMPEORÓ** — cambió de tramo.
3. **✅ SE RESOLVIÓ** — cerró desde el último correo. *(Sección nueva.)*
4. **⏰ POR VENCER (≤ 5 días hábiles)** — la única preventiva que sobrevive.
5. **⏳ EN ESPERA DE TERCEROS** — informativa, con motivo y caducidad.
6. **🔧 DATOS QUE NO CUADRAN** — fechas incoherentes, plazo asumido, search vacío. *(Antes
   "posible manipulación", sin la acusación.)*
7. **Al pie, en una línea:** `N en condición estable sin cambio · digest completo el lunes`.

Se van: `CRITICOS/SOLO ESTANCADOS/SOLO SIN NOTA/AMARILLOS` (las cuatro dependen del contador
roto o del semáforo B), y `EN OBSERVACION` (su fecha `hasta: 2026-08-24` **ya caducó**).

### 6.3 Cada renglón

```
🆕 SO10300 · Techo de Magnekon — MAGNEKON S.A. DE C.V.
   $1,284,178.00 MXN vencidos hace 16 días hábiles · INV2019 + INV2020, vencimiento 17-ago
   Plazo: Immediate Payment (de la factura) · [abrir proyecto] [abrir INV2019]
   ↳ Erick / Gerardo: cobrar o pactar fecha
```

Tres cosas que hoy no están: el **monto**, el **documento con su vencimiento real**, y un
**dueño nombrado**. El "↳" de hoy dice *"Avanza de stage o documenta por que sigue aqui"* —
que es lo que el watchdog quiere, no lo que el negocio necesita.

### 6.4 Cuándo NO mandar correo

**Si las secciones 1–5 están todas vacías, no se manda.** Cuatro de los cinco watchdogs ya se
callan cuando no tienen nada; **el semáforo es el único que manda siempre**, y esa asimetría
es por sí sola una de las causas de que se lea como ruido. Excepción: **los lunes siempre sale
el digest semanal**, para que el silencio nunca sea ambiguo.

Contra-medida obligatoria, porque el silencio se puede volver ceguera (Hallazgo #14):
**el latido**. Cada corrida deja su marcador —el semáforo ya escribe el snapshot diario, y
captura ya escribe su `CBWATCH`— y **si un watchdog deja de latir 2 días hábiles, eso sí
manda correo.** Es la señal E8, y es la única que nunca se debe silenciar.

---

## 7. La decisión pendiente de administración: la fuente de verdad para contar días

Cuatro candidatos: **emisión**, **envío**, **aceptación**, **fecha comercial**. La
recomendación no es ninguno de los cuatro tal cual.

### 7.1 Recomendación

> **La fuente de verdad es `account.move.invoice_date_due` de las facturas posted y no pagadas
> del proyecto** — el vencimiento que Odoo ya calcula con el término **de la factura** — y el
> reloj de Admin se cuenta **contra esa fecha**, no contra la antigüedad del proyecto.
>
> **La fecha comercial no se descarta: se usa para otra cosa.** No para el reloj de cobranza,
> sino como fecha de arranque del reloj de **operación** (E3/E5) en los clientes que la
> imponen, como Magnekon con el 19-ago.

### 7.2 Por qué, con los argumentos

**a) Ya existe, ya está poblada, y ya es correcta.** Crudo:

```
name    invoice_origin partner_id                    invoice_date invoice_date_due  term                   residual      state
INV1996 (vacío)        BEBIDAS PURIFICADAS           2026-05-13   2026-09-10        120 Days               123,424.00    not_paid
INV2006 SO11779        BEBIDAS PURIFICADAS           2026-07-20   2026-11-17        120 Days FTS 2024       14,469.84    not_paid
INV2013 SO11290        Nalco de Mexico               2026-08-05   2026-10-04        60 Days FTS 2024       184,126.80    not_paid
INV2022 SO11832        BEBIDAS PURIFICADAS           2026-08-18   2026-12-16        120 Days FTS 2024       86,452.48    not_paid
INV2019 SO10300        MAGNEKON S.A. DE C.V.         2026-08-17   2026-08-17        (immediate)            733,816.00    not_paid
INV2020 SO10300        MAGNEKON S.A. DE C.V.         2026-08-17   2026-08-17        (immediate)            550,362.00    not_paid
INV2021 SO10300        MAGNEKON S.A. DE C.V.         2026-08-24   2026-09-23        30 Days FTS 2024     1,834,540.00    not_paid
INV172  SO11557        GRUMA CORP DBA MISSION FOODS  2026-07-15   2026-07-15        30 days                      0.00    in_payment
INV171  SO11789        Corporate USA                 2026-07-10   2026-07-10        30 days                      0.00    in_payment
```

Los 120 días de INV1996 que Erick citó de memoria **están en el campo**. No hay que construir
nada, hay que leerlo.

**b) Resuelve tres de los cuatro errores de Admin de una sola vez.**
- #2 (no cuenta desde emisión ni envío): el vencimiento sale del término **de la factura**.
- #3 (clientes sin plazo): **desaparece**. 13 de 18 partners no tienen
  `property_payment_term_id`, pero **las facturas sí traen el suyo** — "120 Days",
  "60 Days FTS 2024", "30 days", "15 day". El fallback de 37 días se vuelve innecesario.
- #1 (días en stage): deja de ser el número que sostiene la decisión de cobranza. Sigue
  habiendo que arreglarlo para el reloj de operación, pero deja de ser crítico para Admin.

**c) Es la fecha que el cliente reconoce.** Emisión y envío son actos nuestros; la aceptación
en el portal de AP no está en ningún sistema que podamos leer (y el intento de aproximarla
—`ap_sin_confirmacion`— disparó en 8 de 8). El **vencimiento** es lo único que el cliente y
nosotros leemos igual, y es lo que se cita en una llamada de cobranza.

**d) Cambia la señal de forma medible.** Con el criterio de hoy, el correo de Admin de ayer
tuvo **16 renglones, 14 de ellos en rojo**. Con `invoice_date_due`, de esos 16:

| Proyecto | Hoy | Con `invoice_date_due` |
|---|---|---|
| SO10300 (160) | 1 renglón de "330 días en stage" | **$1,284,178 vencidos hace 16 días hábiles** ← lo más grave del correo |
| SO11748 (2360) | "29 días en stage" | **$4,469 vencidos hace 15 días hábiles** |
| SO11511 (2327) | rojo, 58 corridas seguidas, "100 días" | **vence el 10-sep — preventivo, hoy** |
| SO11290 (241) | rojo, "203 días" | vence 04-oct → **no entra** |
| SO11779 (2353) | rojo, "53 días" | vence 17-nov → **no entra** |
| SO11832 (2364) | rojo, "16 días" | vence 16-dic → **no entra** |
| SO11789 (2357) | rojo, 14 corridas | **residual 0 → cerrar el proyecto** |
| SO11737, SO11772, SO11718, SO11838, SO11846, SO11849, SO11850, SO11851 (8) | 8 CRITICOS de 7–16 días | sin factura vencida → **no entran** |

**De 16 renglones a 4**, y el de $1.28 M pasa de estar sepultado entre proyectos de 401 días a
ser el primero.

**e) Es lo que ya hace la otra automatización de la casa.** `project/archive-budget-cierre`
decide archivar con AR/AP por `amount_residual`. Que el semáforo decida "en plazo de crédito"
sin mirar una factura, mientras su vecino calcula la cobranza bien, es la contradicción de
fondo del sistema hoy.

### 7.3 Lo que hay que resolver antes de construirlo — y no es menor

**El vínculo proyecto → factura no es confiable, y hay que probarlo antes de creerle.**
Medido:

- `invoice_origin` es texto libre y **falla en los dos casos más marcados**: INV1996 (la de
  SO11511) lo trae **vacío**, y para **SO7723** (proyecto 101, 401 días, 58/58 corridas) **no
  hay ninguna factura con ese origen**, aunque Erick afirme que está cobrado al 90 %.
- `sale.order.invoice_status` **tampoco sirve**: SO10917 dice `to invoice` teniendo INV1989 de
  $558,014.52 **`paid`**. SO11037 dice `to invoice` y es el caso Luminarias.
- Solo 6 de los 35 proyectos vigilados traen `sale_order_id` poblado (crudo de la ejecución
  90897: `soIds: [11231, 11488, 10459, 7822, 9568, 10496]`), así que **pasar por la SO deja
  fuera a 29**.

Esto **no invalida la recomendación**, pero define el primer paso: **medir la cobertura del
vínculo antes de construir sobre él**. Candidatos a probar, en orden: `sale.order.invoice_ids`
/ las líneas de venta; `account.move.line.analytic_distribution` contra la cuenta analítica
del proyecto (el patrón de Frente B, que ya está en producción); y partner + monto como
último recurso. Es una sesión de medición read-only, y va **antes** de cualquier código.

Y hay que declarar el modo de falla, aplicando la lección de la `ir.rule` 814 (CLAUDE.md §9:
*elegir el discriminador cuyo fallo es soportable*): **si un proyecto de stage 13 no logra
vincularse a ninguna factura, el renglón NO desaparece en silencio** — va a la sección
"🔧 DATOS QUE NO CUADRAN" como *"en plazo de crédito sin factura identificable"*. Ese es
exactamente el estado de SO7723 hoy, y es un hallazgo legítimo: si un proyecto lleva 401 días
en cobranza y nadie puede señalar la factura, **eso** es la anomalía.

### 7.4 Y la fecha comercial (caso Hernán)

Va en la config, no en Odoo, y **solo afecta el reloj de operación**:

```
fecha_comercial_override: {
  "895": { "regla": "arranque_pactado", "desde": "2026-08-19",
           "nota": "Magnekon: la fecha oficial la fija el cliente, no la firma ni el portal" }
}
```

Por cliente (`res.partner.id`), con fallback por `parent_id` — que además arregla de paso el
agravante del error #3, donde 6 de 18 partners son contactos hijos sin término heredado.
Ponerla en el repo evita depender de un campo Studio nuevo, que hoy es cuello de botella
porque el MCP de Odoo es read-only.

---

## 8. Ejemplo real: el correo de mañana con los datos de hoy

Construido con lecturas reales del 2026-09-08/09. **No se envió nada**; es una maqueta.

### 8.1 `[Cobranza]` → Erick, Gerardo, Carolina, Esteban

```
Asunto: [Cobranza] 09/Sep — 2 vencidas ($1,288,647) · 1 vence en 1 día · 1 por cerrar · 1 sin factura

🆕 NUEVO HOY (1)
  SO11511 · Valvula para lavado de botellas — BEBIDAS PURIFICADAS
    $123,424.00 MXN · INV1996 VENCE MAÑANA (10-sep) · término 120 Days, emitida 13-may
    ↳ Erick: es el día de llamar. Lleva 120 días de plazo y se acaba mañana.

⏰ VENCIDAS (2 · $1,288,647.00)
  SO10300 · Techo de Magnekon — MAGNEKON S.A. DE C.V.
    $1,284,178.00 MXN vencidos hace 16 días hábiles
    INV2019 $733,816.00 + INV2020 $550,362.00 · vencimiento 17-ago (pago inmediato)
    (además INV2021 $1,834,540.00 vence el 23-sep — 10 días hábiles)
    ↳ Erick / Gerardo. Nota del 19-ago: "así es el juego con Magnekon" → si la vía normal
      no funciona, esto ya es escalamiento, no seguimiento.
  SO11748 · Chiller instalation — Calbee America
    $4,469.00 MXN vencidos hace 15 días hábiles · INV176, vencimiento 18-ago
    ↳ Carolina: monto chico, un correo lo cierra.

✅ POR CERRAR — cobradas, siguen abiertas en Odoo (1)
  SO11789 · Suministro de Panelview HMI — Corporate USA
    INV171 residual $0.00 (in_payment) · el proyecto sigue en "En plazo de credito"
    ↳ Gerardo: mover a Complete TOTAL. El watchdog lo lleva marcando 14 corridas.

🔧 DATOS QUE NO CUADRAN (2)
  SO7723 · Integración con sensor de nivel — MAGNEKON (Juventino Hernández)
    En "En plazo de credito" desde antes de que existiera el watchdog, SIN factura
    identificable en Odoo. La SO vale $269,708.12 y el equipo reporta 90 % cobrado.
    ↳ Gerardo: ¿dónde está la factura? Si está cobrada, cerrar el proyecto.
  13 de 18 clientes vigilados sin plazo de crédito configurado en Odoo
    BEBIDAS PURIFICADAS, Mission Foods, MAGNEKON, Bridgestone, Calbee, GRUMA, CONMET…
    ↳ No bloquea (el plazo se lee de la factura), pero cualquier reporte que use el
      default del cliente está usando 30 días inventados.

— 3 facturas en seguimiento sin cambio (vencen 04-oct, 17-nov, 16-dic) · digest el lunes
— Latido: watchdog corrió 09-sep 08:00 CST ✓
```

**4 renglones accionables** contra los 16 de ayer, y el de $1.28 M de primero.

### 8.2 `[Operacion]` → Felipe, Gibrán, Mateo, Esteban

```
Asunto: [Operacion] 09/Sep — 11 fechas compromiso vencidas · 4 sin fecha creíble · 0 cambios

📈 FECHAS COMPROMISO VENCIDAS (11) — ordenadas por atraso
   28d  SO11037 · Distribución eléctrica luminarias — JOHNSON CONTROLS   (Hold, venció 30-jul)
   27d  SO11773 · ELECTRICAL DUMP STATION DALLAS 2 — Mission Foods       (venció 31-jul)
   27d  SO11673 · Póliza de matto Compresor Houston — Mission Foods      (venció 31-jul)
   17d  SO11833 · Cooling system Quality offices — Mission Foods         (venció 15-ago)
   17d  SO11842 · prensas materials — Mission Foods                      (venció 14-ago)
   12d  SO11791 · Power and control panels — Calbee                      (Hold, venció 21-ago)
    7d  SO11860 · VIP Service Mission HQ — Mission Foods                 (venció 28-ago)
    6d  SO11762 · Mejoras sistema TOPOCHICO — Nalco                      (venció 31-ago)
    6d  SO11547 · Desinstalación e integración — Nalco                   (venció 31-ago)
    6d  SO10337 · Cortinas de seguridad 120s — Bridgestone               (venció 31-ago)
    6d  SO9428  · Instalación de suministro — Nalco                      (venció 31-ago)
   ↳ Felipe: mover la fecha con la nueva o mover el proyecto. Una fecha vencida que nadie
     toca deja de ser un compromiso.

🔧 FECHAS SIN CREDIBILIDAD (4) — 31-dic de relleno
   SO11699 · Sensores en ductos — Bridgestone        date = 31-dic-2026
   SO11771 · Subestación PI Aurora — CONMET          date = 31-dic-2026
   SO11861 · Cubierta acero inoxidable — MAGNEKON    date = 31-dic-2026
   SO11862 · Cubierta acero inoxidable — MAGNEKON    date = 31-dic-2026
   ↳ Con 31-dic el semáforo los da por sanos (SO11699 sale VERDE con 53 días en stage).
     Su propia nota dice "se reanudan en diciembre 2026" — si es cierto, va en ESPERA
     con motivo y caducidad, no con una fecha de relleno.

⚠️ SO11860 se creó el 4-sep con fecha compromiso del 28-ago — nació vencido.

— 4 proyectos con fecha vigente y creíble (SO11261, SO11492, SO11233, SO11498)
— 0 cambios de stage ayer · 0 esperas vencidas
— Latido: watchdog corrió 09-sep 08:00 CST ✓
```

**Los 19 renglones de `2d sin nota` desaparecen** y en su lugar quedan 15 renglones sobre
fechas que el equipo prometió — más un dato que nadie había visto: **un proyecto creado con la
fecha ya vencida**.

Nota honesta sobre esta maqueta: los 11 atrasos se calcularon con `project.date` leído de Odoo
hoy y días hábiles calculados aparte; **el día que esto se construya hay que recalcularlos en
el workflow**, no copiarlos de aquí.

---

## 9. Los tres watchdogs huérfanos: arreglar o apagar

| Workflow | Recomendación | Por qué |
|---|---|---|
| **`ops/watchdog-mo`** (`RBxoREDTfehELmyr`, activo) | **ARREGLAR** — pero primero **abrirlo** | Vigila dinero de nómina (distribución de MO, §19), que es escritura real a producción, y sus 5 señales son de las que sí pasan la vara (un checkout sin cuenta ni proyecto es un hueco de atribución, no una condición). **Pero está ciego a la auditoría** (`availableInMCP: false`) y tiene un acoplamiento frágil documentado: si alguien cambia dos textos literales en `corregir-bolsa`, W3/W4 se van a 0 **sin lanzar error**. Paso 1: prender MCP access. Paso 2: convertir ese acoplamiento en una prueba (si W3+W4 = 0 varios días seguidos, avisar). |
| **`rh/watchdog/sin-checkin`** (`Q19zFeJQytSfBjdb`, activo) | **ARREGLAR, chico** | Lleva **2 meses y medio corriendo sin que nadie lo toque**, y su doc lo cree apagado. Su señal es buena (empleado activo sin checar ≥ 5 días hábiles = o es baja no formalizada o es un hueco de nómina) y tiene guarda de vacío, así que **no genera ruido cuando no hay nada**. Pendientes: (a) corregir el doc, (b) cerrar `VALIDAR_VACACIONES = false` cuando exista `hr.leave` — hoy alerta sin filtrar vacaciones, y eso sí produce falsos positivos, (c) sacar los destinatarios del Code a un JSON. |
| **`comercial/watchdog-enviadas`** (`hJNTUd8E57W4rfjU`, **inactivo**) | **NO PRENDER como está.** Rehacer sobre chatter, o cerrarlo formalmente | Mide desde **`write_date`**, y su propio código dice que **60 órdenes comparten el mismo `write_date`** de una escritura masiva: cualquier script que toque `sale.order` en masa **resetea todos los semáforos a verde** sin que nadie haya llamado a un cliente. Prenderlo así reproduce en Comercial el error #1 (medir una cosa creyendo medir otra), y con 122 órdenes rojas el día 1. `comercial/ROADMAP.md` ya define el v2 sobre `mail.message`. **Mientras tanto: poner `activo: false` en su config**, para que deje de contradecir a la realidad. |

---

## 10. Plan de sesiones, por impacto contra esfuerzo

Todo lo de abajo es propuesta. La regla de la casa (§8: *un hallazgo se anota, no se
persigue*) aplica: cada sesión cierra su alcance y lo demás va al backlog.

### Antes de todo: dos cosas de 15 minutos que no son sesiones

- **Prender MCP access** en `ops/watchdog-mo` y `rh/watchdog/sin-checkin`. Sin eso, dos
  watchdogs activos siguen fuera de cualquier auditoría.
- **`shared/comercial/watchdog_enviadas.json` → `"activo": false`**, para que la config deje
  de decir que un workflow apagado está encendido.

### S1 · Bajar el ruido sin cambiar ninguna métrica — 2–3 h · impacto ALTÍSIMO

La sesión de mejor relación de todas: no toca la lógica de medición, solo deja de repetir.

1. **Retirar el semáforo B** de los contadores y de las secciones (§2.3). Es lo que produce
   los 19 renglones idénticos de Operaciones y el 0 % verde.
2. **Reportar solo el delta** (§2.1): reusar la firma de `staticData` que ya existe en
   `Code - buildLogNotes`, y agregar la sección ✅ SE RESOLVIÓ.
3. **Banderas de integridad: una vez por evento**, no 21 veces. Y meter a la whitelist a
   Operaciones, Administración y el CEO (error #5).
4. **Apagar `ap_confirmacion`** (`aplica_stages: []`) hasta que se decida (a) o (b) del §3.4.
5. **Quitar el bloque EN OBSERVACION**, que caducó el 24-ago.
6. **Guarda de vacío**: si no hay nada en las secciones 1–5, no mandar (§6.4).
7. **Sacar `info_comercialFTS@fts.mx`** de los dos correos.

Efecto estimado con los datos de ayer: de 35 renglones diarios a **entre 0 y 8**, sin haber
arreglado todavía ni un solo cálculo.
**Riesgo:** bajo, todo es config + un Code node. **Requiere:** read-back del flag `active`
tras el edit (CLAUDE.md §3, regla dura).

### S2 · Medir el vínculo proyecto → factura — 2 h · read-only · **bloquea S3**

Sin código. Medir la cobertura de los cuatro candidatos del §7.3 (`invoice_ids`, líneas,
`analytic_distribution`, partner+monto) sobre los ~13 proyectos de Admin, y **decir con
números** cuál cubre cuántos. Entregable: una tabla y una decisión. Si ninguno cubre bien,
eso también es el resultado, y S3 se rediseña en vez de construirse a ciegas.

### S3 · El reloj de Admin sobre `invoice_date_due` — 4–5 h · impacto ALTO

Depende de S2. Reescribir el modo `credito`: leer `account.move` (posted, `out_invoice` +
`out_refund`, `amount_residual != 0`), contar contra `invoice_date_due`, terminal por AR = 0
(§4.1, copiando el patrón de `RW7KnoeEzYLvavI0`), y los que no logren vincularse **al bloque
de datos que no cuadran, nunca en silencio** (§7.3). Cierra los errores **#2 y #3**, y hace a
**#1** no crítico para Admin.
**Riesgo:** medio — es la primera vez que el semáforo lee contabilidad. Se prueba en
`modo_prueba: true` (que ya existe y manda todo solo a Esteban) al menos dos días antes de
soltarlo al equipo.

### S4 · Coherencia de fechas compromiso — 2–3 h · impacto ALTO para Operaciones

No requiere ninguna consulta nueva: `project.date` ya viene en el nodo 1. Dos banderas
—vencida sin actualizar, y de relleno— más el caso "creado con fecha ya vencida" (SO11860).
Cierra el error **#8** y le da a Operaciones un correo sobre algo que sí es suyo. Con los
datos de ayer produce los 11 + 4 renglones de la maqueta §8.2.

### S5 · Estado de espera y cierre administrativo — 3–4 h · impacto MEDIO-ALTO

`shared/operaciones/esperas.json` con caducidad obligatoria (§3) +
`cerrado_administrativamente` (§4.3) + terminal por stage 14 Incobrables (§4.2). Cierra los
errores **#6 y #7**. Va después de S1 porque sin la regla del delta, una espera mal declarada
se vuelve un renglón permanente más.

### S6 · Arreglar de verdad `dias_en_stage` — 3–4 h · impacto MEDIO · **el más incierto**

Cierra el error **#1** para el reloj de operación. Empieza por la pregunta que quedó abierta:
**¿qué es hoy el subtype 94 y por qué no hay ninguno?** (no la pude contestar: `mail.message`
está en denylist del MCP de Odoo). Alternativa que no depende de esa respuesta:
`mail.tracking.value` del campo **24714**, que el workflow **ya consulta** para
`stage_atras` — el dato está en la mano, solo hay que usarlo también para la fecha de entrada.
Y **recalibrar los umbrales**, que llevan 12 semanas calibrados contra la edad del proyecto.
Va al final a propósito: es el bug más grave y el arreglo más incierto, y S1+S3+S4 entregan la
mayor parte del valor sin él.

### S7 · Higiene de la familia de watchdogs — 2–3 h · impacto MEDIO, se paga solo

Unificar las convenciones que hoy están mezcladas (§1.7 de la auditoría): un solo criterio de
cron (UTC + `timezone: UTC`, que es el que sobrevive al bug de importación de §18), un solo
nombre para el modo prueba, destinatarios **siempre** en JSON —incluidos los de
`fin/watchdog-captura`, hoy hardcodeados— y `retryOnFail` en todos los nodos de Graph (solo
captura lo tiene). Más el ruteo por tipo de alerta de §5.3 y la regla del delta aplicada a
captura.

### Fuera de alcance, anotado

- **Frontend `operaciones/semaforo/` + endpoint `ops/semaforo`** (CLAUDE.md §18 #4 y #5): es
  el destino natural del digest semanal y de los 60 snapshots que hoy no lee nadie. Sesión
  aparte, y no bloquea nada de lo de arriba.
- **Auditar el TZ de todos los Schedule de la instancia**, que sigue pendiente desde §18 y ya
  está marcado como PRIORIDAD ahí.
- **Los snapshots con nombres de contactos de clientes en un repo público** (anexo #4 de la
  auditoría).
- **El salto de 147 → 165 días del proyecto 343** el 22-jul (anexo #3).

### Orden recomendado

```
[15 min] MCP access + comercial activo:false
   ↓
  S1 (ruido)  ──────────────► el equipo deja de ignorar el correo
   ↓
  S2 (medir) ──► S3 (invoice_date_due) ──► cierra #2, #3
   ↓                    ↓
  S4 (fechas) ──────────┴──► cierra #8
   ↓
  S5 (esperas) ─────────────► cierra #6, #7
   ↓
  S6 (dias_en_stage) ───────► cierra #1
   ↓
  S7 (higiene)
```

**S1 primero, sin discusión.** Mientras el correo traiga 35 renglones de los cuales 19 son el
día de la semana, cualquier señal nueva que se agregue llega a un buzón donde ya nadie mira.
