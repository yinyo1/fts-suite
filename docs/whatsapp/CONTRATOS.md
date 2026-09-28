# Contratos de la memoria con otros módulos (F15 y F16)

> Diseño y estructura. **Nada está conectado a Odoo** y no se tocó el esquema `comercial` ni
> `ops/alerta-errores`. Todo lo que aquí se nombra ya existe en la base (`memoria_0004` y `0005`),
> salvo lo marcado como **pendiente de otro frente**.

---

## 1. Cotizador (F15): del levantamiento al machote, sin tocar `comercial`

### 1.1 Lo que ya existe en `memoria`

| objeto | qué es | quién lo alimenta |
|---|---|---|
| `memoria.precio_observado` | lo que **de verdad** costó una partida: descripción (y su forma normalizada), marca, modelo, proveedor, cantidad, unidad, precio, moneda, fecha, empresa y SO. Sólo inserción | un motor de lectura de Odoo (pendiente): líneas de `purchase.order` y `account.move` **reales**, nunca la IA |
| `memoria.v_precio_vigente` | último precio por descripción, proveedor y moneda, con número de observaciones | vista |
| `memoria.so_resultado` | fotos (sólo inserción) de **cotizado contra real** por SO: horas de MO (kiosko), costo de MO (Carga MO), materiales (bills por analítica), `cobertura_real` y estado comercial (ganada, perdida o abierta) | un motor de cortes (pendiente) |
| `memoria.v_so_cotizado_vs_real` | último corte por SO con sus desvíos, y `lectura = NO_CONCLUYENTE` si la cobertura es < 0.8 | vista |
| `memoria.decision.diferencia` | qué corrigió la persona sobre lo que propuso la IA | trigger |

**Regla de #127 (11-ago) que el esquema respeta:** el precio de lista del fabricante es el
costo base, y los descuentos de compras son margen realizado. `precio_observado` guarda el
**precio pagado**. La comparación contra lista la hace el cotizador, no la tabla.

**Prerrequisito (ajuste 4 de #328):** hoy el **95 % de las PO no traen SO en la cabecera**
(AUDITORIA §4). Mientras eso no mejore, `so_resultado.cobertura_real` saldrá baja y la vista
dirá `NO_CONCLUYENTE`, que es justo lo que debe decir. Un costo de 0 no es un margen alto.

### 1.2 Cómo el levantamiento llega al machote (contrato con #127)

```
grupo de levantamiento (WhatsApp)
  └─ memoria.evento (fotos, audios, textos)              ← memoria es dueña
       └─ motor "levantamiento" (pendiente)               ← memoria
            └─ memoria.propuesta tipo 'lead' | 'machote'  ← memoria, con citas
                 └─ decisión humana en la bandeja
                      └─ comercial lee la decisión aprobada y escribe en SU esquema:
                         comercial.evidencia (cita el evento) y el machote
                                                          ← comercial es dueño
```

- **La memoria nunca escribe en `comercial.*`.** Propone, con citas y en su propio esquema.
- **Comercial lee por contrato:** `memoria.v_evento` (sin teléfonos), `memoria.v_evento_so`,
  `memoria.v_bandeja` y `memoria.propuesta` con su `memoria.decision`, y copia a
  `comercial.evidencia` sólo la cita que necesita (D6: una sola captura, comercial cita).
- **Propuesta `machote` (forma, versión 0):**
  ```json
  { "odoo_lead": null, "odoo_so": "SO####|null", "tipo_proyecto": "…",
    "partidas": [ { "descripcion": "…", "cantidad": 0, "unidad": "…",
                    "precio_sugerido": null, "precio_fuente": "precio_observado:<id>|sin_dato" } ],
    "preguntas_abiertas": ["…"], "evidencia": ["evento_seq…"] }
  ```
  `precio_sugerido` es `null` con `precio_fuente = "sin_dato"` cuando no hay observación: nunca se
  inventa un precio (#127, machote 2.x).
- **El aprendizaje** sale de tres cosas: `decision.diferencia` (qué corrigió el ingeniero),
  `precio_observado` (qué costó de verdad) y `so_resultado` (si se ganó y si se ganó dinero).
- **Pendiente del frente comercial (P2):** que `comercial.evidencia` guarde el
  `memoria.evento.id` de origen. Puede ir en su columna `archivo_url` con el formato
  `memoria:evento:<uuid>` mientras deciden si agregar una columna. **No se tocó.**

---

## 2. Señales al watchdog (F16)

### 2.1 Lo que ya existe

`memoria.v_senales_watchdog` (y `memoria.api_senales()`, que devuelve `{alertas, senales[]}`):

| señal | alerta cuando |
|---|---|
| `respaldo_ultimo` | nunca ha corrido, el último falló o tiene más de 36 h |
| `restauracion_ultima` | nunca ha corrido, falló o tiene más de 35 días |
| `evento_default_vacia` | la partición de respaldo tiene renglones (faltó una partición) |
| `particion_mes_siguiente` | no existe la partición del mes que viene |
| `motor_corridas_fallidas_24h` | alguna corrida de motor con `errores > 0` en 24 h |
| `captura_silencio_<canal>` | un canal real `capturando` sin eventos en 48 h |

Leída en vivo esta noche (ejecución n8n `116359`): `respaldo_ultimo: alerta (nunca ha corrido)`
y `restauracion_ultima: alerta`, las dos correctas porque el respaldo espera el clic de Esteban.
Las demás salen `ok`.

### 2.2 Cómo se conecta a `ops/alerta-errores` (B1 #269) **sin modificarlo**

`ops/alerta-errores` (`Ogo64mR0v8CP1JnM`) es un **workflow de errores**: lo dispara n8n cuando
**otro** workflow falla y manda correo, con tope de 1 por workflow y hora. No hace falta tocarlo.
El puente es un workflow nuevo:

```
memoria/senales (NUEVO, inactivo; Schedule cada hora cuando se active)
  1. Postgres: SELECT memoria.api_senales()
  2. IF alertas > 0 → nodo "Stop and Error" con el texto de las señales en alerta
  3. settings.errorWorkflow = Ogo64mR0v8CP1JnM
```

Cuando hay alertas, `memoria/senales` **falla a propósito** y n8n llama a `ops/alerta-errores`
con el mensaje. El correo, el tope por hora y los destinatarios se quedan en B1.
**Requisito:** que B1 esté publicado, que hoy no lo está. Por eso `memoria/senales` no se creó
esta noche: activarlo sin B1 publicado no avisaría a nadie. Queda listo el SQL (`api_senales`)
y este diseño.

Alternativa sin n8n: el semáforo (`ops/watchdog-semaforo`) puede sumar
`SELECT * FROM memoria.v_senales_watchdog WHERE estado = 'alerta'` a su correo diario. Eso
requiere editar ese workflow, así que es decisión de Esteban.

---

## 3. Evidencia para comercial (D6): `memoria.api_evidencia_so` y `api_evidencia_lead`

Una sola captura, en la memoria. Comercial **cita**; no copia ni lee la bitácora.
Ninguna de estas funciones toca el esquema `comercial`.

### 3.1 Llamada

```sql
-- Rol: memoria_lector (o memoria_admin). Sólo lectura (STABLE, SECURITY DEFINER, dueño memoria_admin).
SELECT memoria.api_evidencia_so('SO11771');                 -- evidencia de una SO
SELECT memoria.api_evidencia_lead('<id del crm.lead>');       -- evidencia de un lead
SELECT memoria.api_evidencia_so('SO11771', false, 200);       -- (incluir_prueba, límite ≤ 1000)
```

La SO sale del vínculo **canal → SO** (grupo de proyecto) o **evento → SO** (vínculo directo). El lead sale del
vínculo `canal|evento → odoo:crm.lead`, que se da de alta desde la bandeja o por un motor. `memoria.v_evento_destino`
tiene los dos.

### 3.2 Respuesta (contrato `memoria.evidencia v1`)

```json
{
  "contrato": "memoria.evidencia v1",
  "destino": { "tipo": "odoo:sale.order", "id": "SO11771" },
  "incluye_prueba": false,
  "eventos": [
    { "evento_seq": 123, "evento_id": "…", "ocurrido_en": "…", "tipo": "imagen",
      "texto": "…", "archivo_sha256": "…", "autor_employee_id": 112, "via": "canal",
      "cita": { "evento_seq": 123, "ocurrido_en": "…", "tipo": "imagen", "fragmento": "…" } }
  ],
  "archivos": [
    { "sha256": "…", "mime": "image/jpeg", "bytes": 123456, "rol": "original", "deriva_de": null,
      "clase": "evidencia_acta", "evidencia_acta": true,
      "ubicacion": { "proveedor": "railway_bucket", "contenedor": "…", "ruta": "caliente/ab/…", "nivel": "caliente" } }
  ],
  "derivados": [
    { "sha256": "…", "tipo": "descripcion_imagen", "proveedor": "simulado", "version": "v0",
      "contenido": "…", "confianza": null, "es_simulado": true }
  ],
  "nota": "Sólo eventos aprobados para publicar (D11). Citar siempre por evento_seq."
}
```

### 3.3 Garantías (cada una es un caso de `prueba_motores()`)

| garantía | caso |
|---|---|
| Sólo eventos con una propuesta `publicar` aprobada o corregida (D11). Lo interno no sale | `R2_evidencia_so_solo_publicable`, `R2_evidencia_nada_interno` |
| Nunca sale el teléfono ni el nombre de WhatsApp. Sólo `autor_employee_id` cuando la identidad está ligada | `R2_evidencia_sin_telefono_ni_nombre` |
| Los datos de prueba no salen salvo que se pidan | `R2_evidencia_excluye_prueba_por_omision` |
| Archivos: el original citado y sus versiones de consulta, con la marca de evidencia de acta | `R2_evidencia_archivos_derivados_acta` |
| Leads igual que SO | `R2_evidencia_lead` |
| Cualquier otro destino se rechaza | `R2_destino_invalido` |

### 3.4 Qué hace comercial con esto

- **Cotizador (#127):** guarda en su renglón **sólo** `evento_seq` y `archivo_sha256`, nunca el texto copiado. Cuando
  necesita mostrarlo, lo vuelve a pedir.
- **Descargar un archivo:** el bucket es privado. La descarga pasa por un endpoint de la memoria que firma una URL
  temporal. Se construye cuando comercial lo pida; no es parte de v1.
- **Si falta evidencia:** la respuesta `eventos: []` significa *«no hay nada aprobado para publicar»*, **no** *«no
  pasó nada»* (§20 #11 de CLAUDE.md). Para saber si hay material pendiente de aprobar, la bandeja lo muestra.

---

## 4. Reporte de avance y acta de entrega (R3): motor `avance`

- `memoria.correr_motor('avance')` (dueño `memoria_motor`) → `motor_avance_simulado(ayer, 7 días)`.
  Workflow `memoria/motor-avance` (`w3enXBwj8fUL7FtP`), **inactivo**.
- **Entrada: sólo `v_evento_publicable`.** Lo que no se aprobó para publicar no puede aparecer, ni en el texto ni en
  las citas (`R3_reporte_sin_interno`).
- **Propuesta `reporte_avance`** por SO y semana. Destino `cliente`, citas obligatorias. La clave incluye el último
  `seq`: si se aprueban más eventos, sale un reporte nuevo; si no, re-correr no duplica (`R3_avance_rerun_sin_duplicar`).
- **Propuesta `acta`** sólo si hay fotos aprobadas **y** marcadas `evidencia_acta` (`R3_acta_solo_evidencia_marcada`).
  Cada foto queda ligada al acta (`vinculo archivo → memoria:acta`), y la retención la marca `NO_MOVER`
  (`R3_foto_acta_nunca_se_mueve`).
- Nada se envía. Las dos propuestas esperan decisión humana (D11); el envío al cliente es otro paso, sin construir.
