# Vincular mañana: checklist para Esteban

Todo lo que se pudo hacer sin ti ya está hecho. Esto es lo que falta. Son pasos cortos y
tienen que ir **en este orden**. Tiempo total: unos 30 minutos más lo que tardes en agregar el
número a los 3 grupos.

> Hazlo **fuera de 07:00–18:00 CST** o en un momento tranquilo. El paso 1 corre un respaldo
> de `fts-suite-db` (la base es de 0.2 GB, así que tarda segundos) y le pone contraseña a los
> roles `memoria_*`. **No toca** n8n ni el kiosko.

---

## Paso 0. Antes de empezar

- Ten el **teléfono dedicado** con el número nuevo de FTS (D2), con **WhatsApp Business**
  activo, conectado a Wi-Fi y cargando.
- Todavía **no** agregues el número a ningún grupo.

## Paso 1. Aplicar los cambios que quedaron preparados en Railway (1 clic)

Esta noche la capa de permisos no me dejó desplegar dos servicios ni ponerle contraseña a los
roles de la base (DECISIONES-NOCHE N5). Por eso quedaron **preparados, sin aplicar**:

1. Railway → proyecto **cheerful-comfort** → entorno **production**. Arriba aparece el aviso de
   cambios preparados (staged).
2. Revisa que sean **solo** estos dos servicios nuevos (58 cambios, ninguno destructivo):
   - `memoria-pasarela`: Evolution API `v2.3.7`, sin dominio público.
   - `memoria-mantenimiento`: `postgres:17-alpine`; corre el script del repo fijado por commit
     y lo verifica con sha256.
3. **Deploy**.

Al desplegar, `memoria-mantenimiento` corre **una vez** (restart policy NEVER) y hace esto:

1. Pone las contraseñas de los roles `memoria_captura`, `memoria_motor`, `memoria_admin` y
   `memoria_pasarela`. Las toma de variables de Railway; nadie las ve.
2. Asegura las particiones del mes.
3. Hace un `pg_dump` de toda `fts_suite` al bucket `memoria-respaldos`.
4. Hace la **prueba de restauración**: baja el dump del bucket, lo restaura en un Postgres
   efímero y compara los conteos.
5. Crea la instancia de WhatsApp `fts-memoria` en la pasarela, con su webhook hacia el
   receptor por red privada. **No la vincula.**

**Cómo verificar:** Railway → `memoria-mantenimiento` → Logs. Debes ver:

```
[mantenimiento] contraseñas aplicadas: 4
[mantenimiento] respaldo ok=true …
[mantenimiento] restauración: tablas=N distintas_o_faltantes=0 ok=true
[mantenimiento] pasarela: instancia creada http=201   (o 200)
[mantenimiento] fin: respaldo=true restauracion=true
```

> Evolution puede tardar 1–2 minutos en arrancar y el mantenimiento puede llegar antes. Si ves
> `pasarela: estado de conexión desconocido` o no aparece `instancia creada`, espera 2 minutos
> y dale **Redeploy** a `memoria-mantenimiento`. Todos sus pasos son idempotentes.

> Si `memoria-pasarela` reinicia en bucle con un error de Prisma sobre `CREATE` en la base,
> avísame en #328. Puede requerir `GRANT CREATE ON DATABASE fts_suite TO memoria_pasarela`
> (lo dejé fuera a propósito: da más permiso del necesario).

## Paso 2. Programar el respaldo nocturno

Railway → `memoria-mantenimiento` → Settings → **Cron Schedule** → `30 8 * * *`. Eso es
02:30 CST: Railway usa UTC y CST es UTC−6, sin horario de verano.

## Paso 3. Correr la autoprueba del receptor contra la base real (F5)

1. Railway → `memoria-receptor` → Variables → `AUTOPRUEBA` = `1` → se redespliega solo.
2. Logs del receptor. Debes ver `[autoprueba] corrida=… 13/13 OK` y los 13 casos:
   - 160 envíos de 8 tipos.
   - Idempotencia.
   - Una misma foto en dos grupos da 1 archivo.
   - Re-hash de 5 objetos del bucket.
   - `UPDATE` y `DELETE` con `memoria_captura` denegados.
   - Firma inválida o vieja da 401.
   - Token falso da 401.
   - Un chat 1:1 se ignora.
   - Un grupo pendiente no se captura.
3. Regresa `AUTOPRUEBA` a `0`.

Los datos de esta prueba quedan en canales `prueba-…` con `es_prueba = true`. **No se borran**
(así lo pediste). Las vistas del contrato permiten filtrarlos.

## Paso 4. Vincular el número por QR

La pasarela **no tiene dominio público**, y está bien así. Para escanear el QR le abres uno
**solo durante 5 minutos**:

1. Railway → `memoria-pasarela` → Settings → Networking → **Generate Domain**.
2. Railway → `memoria-pasarela` → Variables → copia el valor de `AUTHENTICATION_API_KEY`. Lo
   ves tú en el dashboard; no pasa por ningún chat.
3. Abre `https://<dominio-generado>/manager` → pega la API key → entra a la instancia
   **`fts-memoria`** → **Get QR Code**.
4. En el teléfono dedicado: WhatsApp Business → ⋮ → **Dispositivos vinculados** → **Vincular
   un dispositivo** → escanea.
5. Cuando diga *Conectado* (open): Railway → `memoria-pasarela` → Settings → Networking →
   **borra el dominio**. Vuelve a quedar solo en la red privada.

⚠️ **Ese manager puede enviar mensajes.** No mandes nada desde ahí. Solo QR y cerrar
(DECISIONES N8: Evolution no tiene un interruptor que apague el envío).

## Paso 5. Registrar los 3 grupos piloto (D8)

1. Desde un teléfono de FTS, una persona **agrega el número dedicado** a los 3 grupos:
   - uno de **proyecto** (con `SO####` en el nombre),
   - el de **tickets de compras (USA)**,
   - el de **materiales**.
2. Cada grupo entra solo a la bandeja en estado **`pendiente`**: se registra, pero **no se
   captura ningún mensaje**.
3. n8n → workflow **`memoria/canales-manual`** → nodo *Set – EDITA AQUÍ*:
   - Ejecuta primero con `accion = listar`. Verás los 3 grupos con su `id` y el tipo que se
     detectó por el nombre.
   - Para cada grupo cambia a `accion = decidir`, pega el `canal_id`, pon `tipo` (`proyecto` |
     `compras` | `materiales`) y `estado = capturando`. Ejecuta.
   - En el de proyecto, la respuesta trae `vinculo_so`: ya quedó ligado a su SO, incluso lo
     que se dijo antes.
4. Cualquier otro grupo al que agreguen el número se queda `pendiente`. Si no lo quieres,
   ponle `estado = excluido`.

> Los nombres de los grupos **nunca** se escriben en el repo ni en #328. Viven solo en la base.

## Paso 6. Prueba de humo real

Manda un mensaje de texto y una foto en el grupo de proyecto. En n8n, corre **`memoria/pruebas`**:

- La batería de motores debe dar **19/19** (desde `memoria_0006` ya no la ensucian los datos reales ni los de la autoprueba).
- `eventos_total` debe subir.
- `senales` debe marcar `respaldo_ultimo: ok`.

## Paso 7. Lo que queda pendiente de ti (no urgente)

| # | qué |
|---|---|
| P5 | Railway → `fts-suite-db` → **Backups**: activar los backups de volumen (diario, 14 días). Son la copia 2 del 3-2-1 |
| D7 | Aviso de privacidad / política de grupos con Legal **antes** de pasar de 3 grupos a todos |
| N12 | Crear en n8n las credenciales Postgres por rol (`memoria_motor`, `memoria_admin`) con las contraseñas de `memoria-mantenimiento`, y cambiarlas en los workflows `memoria/*` |
| P6 | Registrar el módulo en la suite y dar los scopes `memoria:admin` y `memoria:aprobar` en `suite_usuarios` |
| D5 | Abrir Azure para la copia fuera de Railway y el frío. Hasta entonces el video original vive en `frio/` del mismo bucket |
| — | Motores: **siguen inactivos** hasta resolver la capacidad de n8n (`CAPACIDAD-N8N.md`) |

## ⚠️ Al mergear el PR #327

El receptor y el mantenimiento bajan su código **por SHA de commit** de la rama del PR:
`RECEPTOR_URL` en `memoria-receptor` y `MANT_SCRIPT_URL` en `memoria-mantenimiento`. Si el PR se
integra con **squash** y la rama se borra (`delete_branch_on_merge` está activo), esos commits
quedan sin rama y GitHub los puede recolectar. El siguiente reinicio fallaría con `HTTP 404`.

Después del merge, apunta las dos variables al **mismo archivo en el commit de `main`** y
actualiza sus `*_SHA256`. El contenido no cambia, así que el sha256 es el mismo. Mientras no se
mergee, no hay que hacer nada.

## Si algo sale mal

| síntoma | qué hacer |
|---|---|
| El receptor dice `base: error` en su log de salud | El paso 1 no corrió o falló en contraseñas: revisa el log de `memoria-mantenimiento` |
| Evolution no arranca | Logs de `memoria-pasarela`. Si es de base de datos, avísame en #328 |
| Quieres apagar todo | Railway → `memoria-pasarela` → **Remove deployment** (el número deja de leer). El receptor sin la pasarela no hace nada |
| Algo escribió de más | No puede. La bitácora es solo de inserción, con candado de permisos **y** de trigger. Lo peor que pasa es un evento de más, marcado con su huella |
