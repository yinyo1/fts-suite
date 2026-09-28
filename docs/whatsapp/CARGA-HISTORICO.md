# Carga del histórico de WhatsApp

Herramienta: `whatsapp/historico/cargador.ts` (Bun). Toma el ZIP de **Exportar chat → Incluir archivos**, de
Android o de iPhone. Usa el parser que ya existe (`parser.ts`) y manda cada mensaje al receptor como evento
firmado (`/v1/evento`), igual que cualquier otra fuente.

**Por omisión corre en SIMULADO**: lee el ZIP, reporta qué cargaría y no toca la red. Para enviar hay que pasar
`--enviar` a propósito.

> Los nombres de los grupos y el contenido de las exportaciones **nunca** entran al repo ni a un issue. Los ZIP
> viven en la laptop de quien carga y, después, en frío.

---

## Antes de empezar

1. **El canal tiene que existir y estar aprobado.** La exportación entra con `fuente = whatsapp_export` y crea su
   propio canal, separado del canal en vivo. El primer envío lo registra como `pendiente` y el cargador se
   detiene con `CANAL_NO_CAPTURANDO`. Luego:
   - n8n → `memoria/canales-manual` → `accion = listar`.
   - `accion = decidir` con ese `canal_id`, `tipo` y `estado = capturando`.
   - Vuelve a correr el cargador. Lo que ya se envió no se duplica.
2. **El receptor debe estar en `receptor-2026.09.28-3` o posterior.** Esa versión contesta 422
   `FUERA_DE_PARTICION` en lugar de un 500. La que está desplegada hoy es la `-2`; ver VINCULAR-MANANA.
3. **Particiones de los meses viejos.** El simulacro imprime la línea exacta. Se corre con el rol
   `memoria_admin`, desde n8n o psql:
   ```sql
   SELECT memoria.api_preparar_historico(date '2025-10-01');
   -- {"desde": "2025-10-01", "particiones_nuevas": 12, "default_vacia": true}
   ```
   Si no se corre, el receptor rechaza esos eventos con **422 `FUERA_DE_PARTICION`** y el cargador se detiene
   diciendo qué correr. Así nada cae en la partición `default`, que después bloquearía ese mes.
4. **La frontera.** Si el grupo ya se captura en vivo, pasa `--frontera` con la hora del primer evento en vivo de
   ese canal (`canal.primera_vez`, en UTC). Lo que la exportación traiga desde esa hora en adelante se descarta,
   porque ya llegó en vivo con su propia huella (ARQUITECTURA §3.4.1).

## Uso

```sh
# 1. Simulacro: sólo reporta, sin red
bun whatsapp/historico/cargador.ts --zip ~/Descargas/export.zip --canal-id historico-<algo> \
    --canal-nombre "<nombre del grupo>" --frontera 2026-09-29T14:00:00Z

# 2. Envío (desde un servicio de la red privada de Railway, donde se alcanza el receptor)
export MEMORIA_HMAC_SECRET=…     # del entorno; NUNCA como argumento
bun whatsapp/historico/cargador.ts --zip export.zip --canal-id historico-<algo> \
    --enviar http://memoria-receptor.railway.internal:8080
```

- `--canal-id` es el identificador con que el canal queda en la bandeja. Conviene usar el mismo en cada carga del
  mismo grupo: la idempotencia depende de él.
- `--tz` es el desfase de la hora de la exportación. Por omisión `-6` (Monterrey). La exportación usa la hora
  del teléfono que exporta.

## Qué reporta el simulacro

```json
{
  "sha256_zip": "…",
  "modo": "SIMULADO", "formato": "android", "chat": "Chat de WhatsApp con ….txt",
  "eventos": 1234, "por_tipo": { "mensaje": 900, "imagen": 250, "audio": 60, "…": 0 },
  "avisos_de_sistema_omitidos": 12, "descartados_por_frontera": 40,
  "adjuntos": { "encontrados": 300, "bytes": 123456789, "faltantes": 10, "demasiado_grandes": 0 },
  "desde": "2025-10-03T14:12:00.000Z", "hasta": "2026-09-29T13:58:00.000Z",
  "meses": ["2025-10", "…", "2026-09"],
  "antes_de_enviar": "SELECT memoria.api_preparar_historico(date '2025-10-03');  -- rol memoria_admin"
}
```

El resumen no incluye textos ni nombres, así que se puede pegar en un issue. El `sha256_zip` identifica la
exportación sin revelarla.

## Qué hace con cada cosa

| en la exportación | en la memoria |
|---|---|
| mensaje de texto | evento `mensaje`; los acuses (`ok`, `gracias`, 👍) van a ruido, igual que en vivo |
| foto, audio, video o documento con archivo en el ZIP | evento con su archivo, deduplicado por sha256. El video original va a `frio/` |
| adjunto que la exportación no incluyó | evento con `metadatos.adjunto_faltante`, sin archivo |
| adjunto de más de 64 MB | evento con `metadatos.adjunto_demasiado_grande`, sin archivo |
| «se eliminó este mensaje» | evento `borrado_en_origen` |
| mensaje editado | evento con `metadatos.editado_en_origen` y el texto final |
| aviso de sistema (cifrado, alguien entró o salió) | no se carga; sólo se cuenta |

**Idempotencia:** la huella de cada mensaje se calcula de canal, minuto, autor, texto y adjunto. Si el mismo
autor dice lo mismo en el mismo minuto, se numera. Cargar el mismo ZIP dos veces, o dos exportaciones que se
enciman, **no duplica**. Medido de extremo a extremo contra el receptor y PG17: primera corrida 8 nuevos + 2 de
ruido; segunda corrida 8 duplicados.

## Límites conocidos

- **Autores por nombre de contacto, no por número:** la exportación sólo trae cómo tiene guardado a cada quien el
  teléfono que exporta. La identidad se une a mano en la bandeja (`memoria.identidad`).
- **El ZIP original no se guarda solo.** Hoy hay que subirlo a mano a `frio/export/<sha256_zip>.zip` del bucket.
  El receptor no tiene ruta para archivos que no sean de un evento. Queda como pendiente, con Azure (D5).
- **ZIP cifrado o ZIP64 (de más de 4 GB) no se soportan.** El cargador lo dice y se detiene.
- **Un mensaje que cruza la frontera** puede quedar dos veces, una en vivo y otra de la exportación, con huellas
  distintas. El motor de dedupe lo marca `duplicado_de`, sin construir aún. La frontera lo reduce a los minutos de
  la orilla.

## Pruebas

`bun test whatsapp/historico/` corre 14 pruebas, todas con exportaciones sintéticas de `fixtures/`:

- 6 del parser.
- 8 del cargador:
  - ZIP stored y deflate.
  - Plan Android con adjuntos faltantes.
  - iOS con `_chat.txt`.
  - Frontera.
  - Huellas estables.
  - Firma HMAC y reintento en 503 contra un receptor falso.
  - Canal pendiente y firma rechazada.
  - Firma igual a la del receptor.

La CI las corre en cada PR (`.github/workflows/memoria.yml`).
