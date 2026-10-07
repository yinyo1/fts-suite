# Retardos v2 · Textos de los correos y cómo reemplazarlos

Issue #334, reglas R3. Los textos viven en la tabla `retardos.plantilla` del Postgres de la suite,
no en n8n ni en el repositorio. El panel los muestra en **Configuración → Textos de los correos**
con su estado.

## 1. Estado de cada texto

Toda plantilla tiene `estado_texto`:

- `pendiente_validacion_rh`: texto base que escribió sistemas. **Así nacen todas**, incluidas las de
  jornada semanal y el aviso de retardo reescrito en R3.
- `validado_rh`: RH lo revisó y aprobó, con o sin cambios.

El estado no cambia nada del envío: en modo sombra todo va a Dirección y RH igual. Sirve para saber,
antes de pasar a real, qué textos ya aprobó RH.

## 2. Plantillas y sus variables

Una variable se escribe entre dobles corchetes, por ejemplo `[[nombre]]`. **No se pueden inventar
variables**: sólo existen las de esta tabla. Una variable que no existe sale vacía en el correo.

| Clave | Para qué | Variables |
|---|---|---|
| `notificacion_aviso` | Aviso de retardo a la persona (nivel 1) | `nombre`, `periodo`, `detalle`, `tolerancia_min`, `retardos_n`, `umbral_carta`, `ppa_minutos`, `folio` |
| `aviso_trabajador` | Copia a la persona de una carta o un acta | `nombre`, `periodo`, `retardos_n`, `tolerancia_min`, `detalle`, `nombre_nivel`, `ppa_minutos`, `folio` |
| `jornada_aviso` | Primer y segundo aviso de jornada | `nombre`, `folio`, `aviso_n`, `semana_desde`, `semana_hasta`, `detalle`, `horas_efectivas`, `umbral_horas`, `faltante_horas`, `plazo_correccion` |
| `jornada_aviso_3` | Tercer aviso de jornada a la persona | `nombre`, `folio`, `semana_desde`, `semana_hasta`, `detalle`, `horas_efectivas`, `umbral_horas`, `faltante_horas`, `plazo_correccion` |
| `jornada_rh_recolectar` | Tercer aviso a RH, con la hoja para recolectar | `folio`, `nombre`, `puesto`, `departamento`, `semana_desde`, `semana_hasta`, `detalle`, `horas_efectivas`, `umbral_horas`, `faltante_horas`, `vence_rh`, `correo_trabajador` |
| `jornada_sin_correo` | Aviso de jornada al jefe cuando la persona no tiene correo | `folio`, `nombre`, `aviso_n`, `semana_desde`, `semana_hasta`, `detalle`, `horas_efectivas`, `umbral_horas`, `faltante_horas`, `plazo_correccion` |
| `jornada_por_revisar` | A RH: semanas con datos incompletos | `n`, `semana_id`, `semana_desde`, `semana_hasta` |
| `comunicado_arranque` | Comunicado a la plantilla antes del arranque | `fecha_arranque`, `tolerancia_min`, `umbral_carta`, `umbral_horas` |

**Retardo y PPA van en párrafos separados** (`retardos_0009`, #386). El retardo usa `tolerancia_min` (15) y el premio de puntualidad usa `ppa_minutos` (5). Retardos no calcula el PPA: lo calcula Nómina · Incidencias, y el texto sólo explica que es otra regla. Al reemplazar un texto, conservar los dos párrafos.

**Leyenda de jefe faltante:** no es una variable. Cuando la persona no tiene jefe directo en Odoo, el sistema pone la leyenda de `leyenda_sin_jefe` arriba del cuerpo, sea cual sea el texto.

`[[detalle]]` es la tabla que arma el sistema (retardos con hora al segundo, o el día a día de la
semana). Se puede mover de lugar, no se puede quitar.

El texto de la **hoja PDF** del tercer aviso (`aviso_jornada_3`) no vive en esta tabla: vive en
`retardos/lib/pdf.js` (`CUERPO.aviso_jornada_3`) y se cambia con un PR; `PDF.PENDIENTE_RH` lo marca
como pendiente hasta que RH lo valide.

## 3. Reglas de redacción

1. **Sin guiones largos.** Ni en el asunto ni en el cuerpo.
2. Conservar el folio entre corchetes al inicio del asunto (`[[[folio]]]`): el lector de respuestas
   une la respuesta a su caso por ese folio.
3. HTML simple: `<p>`, `<b>`, `<br>`, `<ol>`, `<li>`. Sin estilos ni imágenes.
4. No prometer lo que el sistema no hace: ninguna medida se aplica sola.

## 4. Procedimiento para reemplazar un texto

Lo corre quien tenga acceso a la consola de Postgres de Railway o a `psql`. **No** por el nodo Postgres
de n8n (`BLINDAJE.md` §6). El texto va entre etiquetas de dólar **con nombre** (`$txt$`), para que un
`$` o un apóstrofo del texto llegue intacto (CLAUDE.md §20 #10).

1. RH entrega el texto aprobado (asunto y cuerpo) y quién lo aprobó.
2. Guardar primero el texto actual, por si hay que regresar:

   ```sql
   SELECT clave, asunto, cuerpo_html, estado_texto, actualizado_por, actualizado_at
     FROM retardos.plantilla WHERE clave = 'jornada_aviso';
   ```

3. Reemplazar, en una transacción, cambiando la clave, el texto y quién aprueba:

   ```sql
   BEGIN;
   UPDATE retardos.plantilla
      SET asunto       = $txt$[[[folio]]] Aviso [[aviso_n]] de jornada semanal: semana del [[semana_desde]] al [[semana_hasta]]$txt$,
          cuerpo_html  = $txt$<p>Hola [[nombre]]:</p><p>TEXTO APROBADO POR RH</p>[[detalle]]<p>Recursos Humanos<br>SERVICIOS FTS SA DE CV</p>$txt$,
          estado_texto = 'validado_rh',
          actualizado_por = 'nombre.de.rh', actualizado_at = now()
    WHERE clave = 'jornada_aviso';
   SELECT retardos.log(NULL, 'plantilla_validada', 'nombre.de.rh', 'Texto de jornada_aviso validado por RH (PLANTILLAS.md)',
                       jsonb_build_object('clave', 'jornada_aviso'));
   COMMIT;
   ```

4. **Read-back** (tiene que salir `validado_rh`, sin guiones largos y sin variables inventadas):

   ```sql
   SELECT clave, estado_texto, actualizado_por,
          position(chr(8212) IN asunto || cuerpo_html) = 0 AS sin_guion_largo,
          (SELECT array_agg(DISTINCT m[1]) FROM regexp_matches(asunto || cuerpo_html, '\[\[([a-z_]+)\]\]', 'g') AS m) AS variables_usadas,
          variables AS variables_permitidas
     FROM retardos.plantilla WHERE clave = 'jornada_aviso';
   ```

   Comparar `variables_usadas` contra `variables_permitidas` a ojo. Si falta `folio` o `detalle`, o
   aparece una que no existe, regresar al texto guardado en el paso 2.

5. Ver cómo queda sin mandar nada: el panel, en Configuración, muestra el estado; para el cuerpo
   completo con datos, abrir en el panel un caso de ejemplo de ese tipo en modo sombra y ver el correo
   que llegó a Dirección y RH con `[SOMBRA]`.

**Reversa:** el mismo `UPDATE` con el texto guardado en el paso 2 y `estado_texto =
'pendiente_validacion_rh'`.

## 5. El comunicado de arranque

`retardos.comunicado_arranque()` **sólo prepara** el comunicado: devuelve asunto y cuerpo con los
valores vigentes, y no manda nada. Se encola únicamente si se llama con `encolar: true` **y** la
clave `comunicado_destinatarios` tiene una lista (hoy vacía). Lo ideal es que RH lo mande desde su
propio buzón o lo lea en persona, con acuse.

```sql
SELECT retardos.comunicado_arranque('{"fecha_arranque": "1 de octubre de 2026"}'::jsonb);
```
