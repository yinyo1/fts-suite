# Solicitud de estados de cuenta, acuses y calendario (issue #331)

Dos workflows de n8n piden y acusan los estados de cuenta a Gerardo (CC Esteban y Erick), **siempre
desde `sales@fts.mx`**, con el texto generado desde la base. Nadie escribe estos correos a mano.

| workflow | id | qué hace | cuándo |
|---|---|---|---|
| `fts_bancos_solicitud_v2` | `Fs4FxIeK2La12DyS` | pide lo que falta | lunes a viernes 9:00 (America/Monterrey); la base decide si es hábil y si hay algo abierto |
| `fts_bancos_acuse` | `XxkcMTQLOfByfGEz` | responde **en el mismo hilo** de la última solicitud después de cada tanda subida al buzón | cada 30 min de 7 a 20 h (min 12 y 42), un acuse por corrida con archivos |
| `bancos/db-migrate_v2 (cron-solicitud)` | `leNhIRklDCy4V5Rh` | copia del runner de migraciones (el original lo usa la sesión de ingesta) | manual, `dry_run=true` |

`fts_bancos_solicitud_v2` **reemplaza** a `fts_bancos_solicitud` (`ktKYVvYiaoR2ii7C`, regla vieja "lunes y día 3").
Los dos nuevos nacen **desactivados**. Para encenderlos (en este orden, el mismo día):
1. Desactivar `fts_bancos_solicitud` (no se borra).
2. Publicar/activar `fts_bancos_solicitud_v2` y `fts_bancos_acuse`.
3. Leer de vuelta `active` y `versionId == activeVersionId` en los dos (CLAUDE.md §17 2b).
4. Opcional: apagar la rama de correo de problemas de `fts_bancos_procesa`; el acuse ya dice lo mismo, en el hilo.

Si los dos de solicitud quedan activos a la vez, Gerardo recibe dos correos el mismo día.

## La regla

1. **Disponibilidad.** El estado del mes M se considera disponible el **primer día hábil del mes M+1**.
   Antes de esa fecha, M no se pide ni cuenta como faltante (`bancos.periodo_exigible(hoy)`).
2. **Día hábil.** Lunes a viernes que no esté en `bancos.dias_inhabiles`.
3. **Envío.** El primer día hábil de cada mes a las 9:00 y después **cada día hábil a las 9:00 mientras
   quede cualquier faltante abierto**. Una vez al día como máximo.
4. **Cuándo se calla.** Sólo cuando no queda ningún mes abierto (ver motivos abajo). Si antes hubo
   solicitudes o acuses, sale **un** correo final: *"Estados de cuenta FTS al día hasta <mes>. Gracias,
   no hace falta nada más hasta el primer día hábil de <mes siguiente>."* y después silencio hasta ese día.
5. **Sin lectura del buzón no hay solicitud.** Si en las últimas 26 h no hubo una lectura completa del
   buzón (Graph caído o sin permiso), a Gerardo no le llega nada y a Esteban le llega una línea de aviso,
   una vez al día. Pedir "todo" porque el sistema no pudo mirar sería falso.
6. **Gate.** Nada sale antes del martes 29-sep-2026 (parámetro `solicitud_desde`).

Un mes está **abierto** si su motivo en `bancos.v_faltantes` es: `faltante` (no llegó), `no_cuadra`
(llegó y no cuadra contra la pág. 1), `conflicto_version` (llegó otra versión distinta de un mes ya
validado; la primera no se reemplaza), `continuidad` (V3: el saldo inicial no es el final del mes
anterior), `en_validacion` (falta calcular V3, se cierra sola) o `recibido_sin_lector` (Payana/Jeeves
llegaron pero todavía no hay lector que diga de qué mes son). Un archivo rechazado **no cierra** su mes.

## Contenido

**Asunto de la solicitud:** `Estados de cuenta FTS: faltan N (el más antiguo lleva X días hábiles)`.
N cuenta todo lo abierto (también en modo semanal). El acuse usa el mismo conteo.

**Solicitud:** (a) mes recién cerrado por cuenta, (b) rezago agrupado por cuenta y año, con los días
hábiles de cada mes, (c) archivos recibidos que no se pudieron usar, con qué pasó y qué hacer,
(d) días hábiles abiertos, (e) "Cómo descargarlos y subirlos", (f) liga al buzón.

**Acuse** (uno por tanda): validados (cuenta enmascarada, mes, "cuadra al centavo contra el resumen del
banco"), duplicados (de qué eran copia, sin acción), rechazados (motivo simple y qué hacer) y cuánto
falta. Si la tanda deja todo completo, el acuse **es** el correo final. Si la subida no trajo nada
reconocible, igual se acusa diciendo qué llegó y por qué no sirvió.

## El hilo

Los dos workflows mandan el correo como **MIME** por `sendMail` (basta `Mail.Send`, que la app ya tiene).
Cada solicitud lleva `Message-ID` y `Thread-Index` propios, guardados en `bancos.correos`. El acuse
responde a la **última solicitud real**: `In-Reply-To` y `References` = su `Message-ID`, `Thread-Topic`
igual, `Thread-Index` hijo (MS-OXOMSG) y asunto `RE: …`. Es lo que Outlook usa para agruparlos en la
misma conversación. Si todavía no hubo ninguna solicitud, el acuse abre su propio hilo.

## Qué se edita y dónde (sin tocar código)

Todo vive en tablas del esquema `bancos`. La aplicación **no** puede editarlas (sólo leer): el cambio va
como una migración `db/migrations/bancos/bancos_NNNN_*.sql` aplicada con el runner `bancos/db-migrate`
(queda con sha256 y bitácora).

| qué | dónde | ejemplo |
|---|---|---|
| rezago diario o semanal | `bancos.parametros` clave `rezago_frecuencia` (`diario` por omisión) | `UPDATE bancos.parametros SET valor='semanal', actualizado_at=now() WHERE clave='rezago_frecuencia';` |
| texto de "Cómo descargarlos y subirlos" | `bancos.plantillas_correo` clave `instrucciones` (HTML) | `UPDATE bancos.plantillas_correo SET cuerpo_html=$tpl$…$tpl$, version=version+1, actualizado_at=now() WHERE clave='instrucciones';` |
| pie de los correos | `bancos.plantillas_correo` clave `pie` | igual |
| días inhábiles | `bancos.dias_inhabiles` | `INSERT INTO bancos.dias_inhabiles VALUES ('2027-05-05','…','CNBV, DOF …',true);` · `UPDATE … SET confirmado=true, fuente='CNBV, DOF …' WHERE fecha BETWEEN '2027-01-01' AND '2027-12-31';` |
| destinatarios | `bancos.parametros` claves `correo_para`, `correo_cc` | separados por coma |
| desde qué mes se pide cada fuente, o apagar una | `bancos.fuentes_solicitud` (`periodo_inicio`, `activa`) | Payana y Jeeves se piden desde 2026-08 |
| cerrar a mano un conflicto de versión ya revisado | `bancos.revisiones_manuales` | `INSERT … (fuente, periodo, motivo, nota, revisado_por) VALUES ('usd','2026-08','conflicto_version','se confirmó con el banco la versión X','Esteban');` |

En modo **semanal**, el rezago (todo lo anterior al mes recién cerrado) sólo aparece en la solicitud del
primer día hábil de la semana (lunes, o el martes si el lunes es inhábil); el mes recién cerrado sigue
diario. Si en un día no-lunes sólo queda rezago, ese día no sale correo.

### La plantilla de instrucciones

Los menús exactos de BBVA Net Cash, Payana y Jeeves **no están verificados**: los pasos son genéricos a
propósito. El correo termina con *"Si algún paso no coincide con lo que ves en el portal, responde este
correo con cómo se hace y lo actualizamos"*. **Esas respuestas no se procesan automáticamente** (el
sistema sólo mira el buzón de OneDrive, nunca el correo): las lee Esteban y actualiza la plantilla con
una migración.

## Calendario

`bancos.dias_inhabiles` trae 2026 y 2027.
- **2026:** días publicados por la CNBV en el DOF del 10-dic-2025 (1-ene, 2-feb, 16-mar, 2 y 3-abr,
  1 y 5-may, 16-sep, 2 y 16-nov). 12-dic cae en sábado. 25-dic se cargó por LFT y patrón CNBV con
  `confirmado=false`: la lectura directa del DOF no fue posible desde el contenedor.
- **2027:** proyección (LFT art. 74 + patrón CNBV), `confirmado=false`. **Reemplazar cuando la CNBV
  publique el DOF de 2027** (suele salir en diciembre).

## Ensayos

Cada workflow tiene disparadores manuales de ensayo: calculan con fechas fijas, **no envían nada** y
registran el correo en `bancos.correos` con `modo='prueba'`. Los envíos reales quedan con `modo='real'`.

## Funciones SQL

| función | para qué |
|---|---|
| `bancos.es_dia_habil(fecha)` · `primer_dia_habil('AAAA-MM')` · `disponible_desde('AAAA-MM')` · `periodo_exigible(fecha)` · `dias_habiles(desde, hasta)` · `primer_habil_semana(fecha)` | calendario |
| `bancos.f_faltantes(fecha)` | lo abierto a esa fecha (alimenta `v_faltantes`) |
| `bancos.f_rechazos(fecha)` | archivos rechazados vigentes |
| `bancos.f_solicitud(fecha, modo, frecuencia)` | si toca correo hoy y con qué contenido |
| `bancos.f_acuse(corrida, fecha, modo)` | contenido del acuse de una tanda |
| `bancos.f_corridas_sin_acuse()` | corridas del buzón que no tienen acuse |
| `bancos.registrar_correo(b64)` | bitácora de envíos |

Código de los correos: `bancos/n8n/code/correo.js` (fuente única; `bancos/n8n/construir.js` arma los
Code nodes desde ahí). Pruebas: `bancos/solicitud/tests/` sobre Postgres real con los fixtures sintéticos.
