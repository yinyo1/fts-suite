# Memoria de FTS / WhatsApp — Plan de sesiones de construcción

> Cada sesión es **pequeña y verificable**: termina con algo corriendo o aplicado y con su
> read-back pegado en el issue (CLAUDE.md §8: "verificado = ejecutado y observado"). Nada
> avanza a la siguiente sin la validación de Esteban (§8: "confirmación entre etapas").
>
> Se apoya en [`AUDITORIA.md`](AUDITORIA.md) y [`ARQUITECTURA.md`](ARQUITECTURA.md). Las
> decisiones D1–D11 están en ARQUITECTURA §11.

---

## Antes de S1: lo que tiene que decidir o hacer Esteban

S1 crea servicios y credenciales en Railway, y esta sesión 0 tenía prohibido hacerlo. Para
arrancar S1 hace falta:

| # | qué | quién | bloquea |
|---|---|---|---|
| A | Elegir pasarela (**D1**), número (**D2**) y camino de captura (**D3**) | Esteban | S1 |
| B | Conseguir el **número dedicado** con teléfono físico de FTS y WhatsApp Business activo | Esteban | S1 |
| C | Elegir los **2–3 grupos piloto** (**D8**) y avisar a sus miembros | Esteban | S1 |
| D | Aviso de privacidad / política de grupos de trabajo (**D7**) | Esteban + Legal | S1 (recomendado) |
| E | Autorizar `db/migrations/memoria/` (**D9**) y asignar el número de migración libre | Esteban | S1 |
| F | Autorizar crear en Railway: bucket `memoria-archivos`, servicio de la pasarela, servicio receptor | Esteban | S1 |
| G | Suscripción de Azure y cuenta de almacenamiento (**D4/D5**) | Esteban | S3 (no S1) |

---

## S1 — Captura corriendo en 2–3 grupos piloto

**Objetivo:** que cada mensaje (texto y medios) de los grupos piloto quede en
`memoria.evento` con su binario en el bucket, sin pasar por n8n, sin escribir nunca en el grupo.

1. **Migración de fundación** (`memoria_fundacion`): esquema, roles, guarda de sólo-inserción,
   `fuente`, `tipo_evento`, `canal` + historial, `evento` particionado + `huella`,
   `asegurar_particiones`, `evento_default`, `archivo`, `archivo_ubicacion`, `identidad`,
   `ruido_*`. Aplicada con `comercial/db-migrate`, read-back de `schema_migrations` y de las
   particiones creadas.
2. **Bucket** `memoria-archivos` en Railway (privado).
3. **Pasarela** (Evolution API v2 si se confirma D1) como servicio de Railway **sin dominio
   público**, con almacenamiento de medios en el bucket y webhook hacia el receptor por red
   privada. Endpoints de envío deshabilitados.
4. **Receptor** (servicio pequeño en Railway): valida firma HMAC (§9 de ARQUITECTURA),
   calcula huella, inserta en una transacción, sube medio por *streaming*, marca ruido.
   Rol de base `memoria_captura` (sólo INSERT).
5. Vincular el número (QR) y agregarlo a los grupos piloto — **lo hace una persona de FTS**.
6. Registrar los canales piloto con `estado_captura='capturando'`; todo grupo nuevo entra
   `pendiente` a la bandeja y **no se captura** hasta aprobarlo.

**Verificación (se pega en el issue):**
- 20 mensajes de prueba de cada tipo (texto, foto, audio, video, documento, reacción,
  edición, borrado) → conteo en `memoria.evento` / `ruido_buffer` = 20 esperados por tipo.
- Mismo mensaje reenviado por la pasarela dos veces → **1** evento (huella).
- Foto reenviada a dos grupos → **1** renglón en `memoria.archivo`, 2 eventos.
- Re-hash de 5 objetos del bucket = sha256 registrado.
- `UPDATE`/`DELETE` sobre `memoria.evento` con el rol de captura → error.
- Con n8n apagado (o sin tocarlo), la captura sigue.
- Durante 24 h, **cero** mensajes enviados por el número (bitácora de la pasarela).

## S2 — Respaldo 3-2-1 y prueba de restauración

**Objetivo:** que la base completa (`memoria` + `comercial` + lo que haya) tenga copia fuera
de Railway **antes** de acumular semanas de WhatsApp. Cierra de paso el pendiente de
`ALMACEN.md` §Respaldo.

1. Confirmar/activar los **backups de volumen de Railway** de `fts-suite-db` (diario, 14 d).
2. Servicio cron `memoria-respaldo`: `pg_dump -Fc` nocturno → Azure Blob (`respaldos`), con
   manifiesto de conteos → `memoria.respaldo`.
3. Prueba de restauración (primero manual, después mensual automática) → `memoria.respaldo_prueba`.
4. Señales al watchdog: último respaldo > 36 h, prueba fallida, `evento_default` con renglones.

**Verificación:** restauración real del dump en Postgres efímero con conteos = manifiesto;
y un respaldo forzado a fallar (credencial inválida) que **sí** llegue como alerta.

> Si Azure (G) no está listo, S2 arranca con los backups de volumen y el `pg_dump` a un
> segundo bucket; la copia fuera de Railway se completa en cuanto exista la cuenta.

## S3 — Copia de archivos fuera de Railway y medición del piloto

1. Copia asíncrona bucket → Azure Blob (Cool) de cada archivo nuevo, con verificación por
   sha256 (`archivo_ubicacion` `alta` → `verificada`).
2. Reconciliación semanal: inventario del bucket vs `archivo_ubicacion`.
3. Vista `memoria.v_metricas_piloto` (ARQUITECTURA §10.3) y **reporte de las 2 semanas** en el
   issue: mensajes/día por tipo, bytes, % ruido, minutos de audio, latencia, grupos totales
   del número → recalcular el volumen de §10.2.

## S4 — Bandeja de grupos y vínculos a SO

1. Reglas de detección por nombre calibradas con los nombres reales (sin escribirlos en el repo).
2. Tabla `vinculo` + vistas `vinculo_vigente`, `v_evento_so`.
3. Workflows `memoria/canales` (listar bandeja, confirmar tipo, ligar a SO/lead, pausar) con
   SuiteAuth `memoria:admin`.
4. Pantalla mínima en `whatsapp/` (bandeja de grupos). Registro del módulo en la suite → **P6**
   (fuera de este frente).

**Verificación:** un grupo que cambia de nombre a `SO####` genera la propuesta de vínculo;
al aprobarla, `v_evento_so` devuelve también los mensajes de **antes** del cambio.

## S5 — Motor `derivados` (transcripción y descripción)

1. `motor`, `motor_cursor`, `motor_corrida` + ventana de estabilidad del cursor (§3.8).
2. Workflow n8n `memoria/motor-derivados`: lotes chicos (≤20 medios), fuera de 07:00–18:00 CST
   si el volumen lo pide (CLAUDE.md §20 #14), escribe `archivo_derivado` con `costo_usd`.
3. Elegir proveedor de transcripción y modelo de visión con el costo medido (**D10**).

**Verificación:** regresar el cursor 50 eventos y re-procesar → mismo número de derivados, sin
duplicados (`derivado_uq`).

## S6 — Carga del histórico por exportación

1. Parser de exportaciones (Android e iOS, español) con pruebas **sobre exportaciones
   sintéticas** (nada real en el repo).
2. Carga de los grupos piloto hasta la frontera `canal.primera_vez`; particiones de meses viejos.

**Verificación:** conteo de mensajes del `.txt` = eventos insertados + ruido; cero eventos
después de la frontera.

## S7 — Propuestas, decisiones y el primer motor de negocio: resumen diario por SO

1. `propuesta`, `decision`, `ejecucion`, `v_bandeja`.
2. Motor `resumen_so`: un resumen por SO por día con citas obligatorias.
3. Bandeja de aprobación en `whatsapp/` con SuiteAuth `memoria:aprobar`; la decisión guarda el
   diff propuesto vs aprobado.

**Verificación:** una propuesta sin citas es rechazada por la base; una corregida guarda
`diferencia` no vacía.

## S8 — Retención y ciclo de vida

Job de retención con verificación por huella (ARQUITECTURA §5), ciclo de vida de Azure
(Cool→Cold/Archive a 12 meses), inmutabilidad de tickets, purga del `ruido_buffer` a 30 días,
muestra mensual de re-hash en frío.

**Verificación:** simular un archivo de 13 meses: se retira del caliente **sólo** después de la
verificación en frío; una evidencia de acta con la misma antigüedad **no** se mueve.

## S9 — `fts_archivos` (#125) integrado

Construir `fts_archivos` con la fuente nueva `memoria` (llave sha256), destinos SharePoint /
Odoo / correo, y registro en `archivo_ubicacion`. Sin destino WhatsApp. Depende de que #122
tenga sus permisos de Azure y de #123 (o del HMAC del receptor como referencia).

## S10 en adelante — motores de negocio, uno por sesión

En el orden que Esteban priorice; cada uno es un renglón en `memoria.motor` + un workflow, sin
tocar la captura:

- **tickets → PO/bill propuestos** (grupo de compras, prioridad FTS USA: hoy 84 % de sus PO sin
  proyecto, AUDITORIA §4).
- **requis → requisición** (grupo de materiales).
- **alertas** (faltantes, adicionales no cotizados, compromisos de fecha, seguridad).
- **reportes de avance y actas de entrega** (con `v_evento_publicable`: nada sale sin aprobación).
- **fuentes nuevas**: correo (#122), juntas (Plaud/Teams), kiosko, bancos — cada una se da de
  alta en `memoria.fuente` y envía por el receptor.
- **cotizador**: `precio_observado` desde POs/bills reales, `so_resultado` cotizado vs real,
  levantamiento → lead → machote → BOM → cotización → SO en borrador (coordinado con el frente
  comercial, #127).

---

## Pendientes que caen fuera de `whatsapp/` y `docs/whatsapp/`

No se tocaron; se listan para que el dueño de cada uno decida.

| # | qué | dueño |
|---|---|---|
| P1 | Crear `db/migrations/memoria/` y asignar número global (choque con prospector 010–014) | Esteban / suite |
| P2 | Comercial: leer la memoria en vez de capturar WhatsApp aparte; columna o convención para citar `memoria` desde `comercial.evidencia` (D6) | frente comercial |
| P3 | po_radar: compartir la llave sha256 de adjuntos con `memoria.archivo` | po_radar |
| P4 | Watchdog: consumir `motor_corrida`, `respaldo_prueba`, `evento_default` | watchdogs |
| P5 | Verificar en la UI de Railway si `fts-suite-db` tiene backups de volumen programados | Esteban |
| P6 | Registrar el módulo en `shared/modules-registry.js` + tarjeta en `index.html` + scopes `memoria:*` en `suite_usuarios` | suite |
| P7 | Editar el contrato de #125: quitar destino `whatsapp`, agregar fuente `memoria` | Esteban (#125) |
