# memoria-derivados

Servicio aparte (N9 y R5 de #328) que produce la versión de consulta del video y los derivados de texto.
**No está desplegado.**

| qué | cómo |
|---|---|
| Video | **h264 ≤720p, crf 28, aac 64k, faststart** (`PERFIL = h264-720p-crf28-aac64k-v1`) + miniatura JPEG de 480 px en el segundo 1. Los dos van a `caliente/` con `rol = comprimido` / `miniatura` y `deriva_de = <sha del original>`. **El original no se toca**: sigue en `frio/` |
| Transcripción, descripción, OCR | Proveedor enchufable. Hoy **sólo `simulado`**: determinista, `es_simulado = true`, costo 0. El proveedor HTTP existe, pero se niega a correr sin `DERIVADOS_D10_DECIDIDA=1` (D10) |
| Integridad | Antes de procesar, recalcula el sha256 del original leído del bucket. Si no cuadra: `409 HUELLA_NO_CUADRA` y no hace nada |
| Idempotencia | Re-procesar no duplica comprimido, miniatura ni derivados. Usa la llave `(sha256, tipo, proveedor, version)` |

## API

- `POST /v1/procesar` con `{"sha256":"…"}`, firmado igual que el receptor (`x-fts-ts`, `x-fts-sig` = HMAC-SHA256 de
  `ts.cuerpo`). Respuestas:
  - `200` con lo producido.
  - `400 NO_ES_ORIGINAL` o `SHA_INVALIDO`.
  - `404 ARCHIVO_DESCONOCIDO`.
  - `409 SIN_UBICACION` o `HUELLA_NO_CUADRA`.
  - `503 CONFIG_INCOMPLETA`.
- `GET /salud`.

## Variables

| variable | de dónde |
|---|---|
| `MEMORIA_HMAC_SECRET` | referencia al del receptor |
| `MEMORIA_CAPTURA_PASSWORD`, `MEMORIA_MOTOR_PASSWORD` | las que pone `memoria-mantenimiento` (`PW_CAPTURA`, `PW_MOTOR`) |
| `PGHOST`, `PGPORT`, `PGDATABASE` | `fts-suite-db` por red privada |
| `S3_*` | referencias al bucket `memoria-archivos` |
| `DERIVADOS_PROVEEDOR` | `simulado` (por omisión) |

**Roles:** registra archivos con `memoria_captura`, lo mismo que ya hace el receptor, y escribe `archivo_derivado`
con `memoria_motor`. No hace falta un rol nuevo.

## Quién lo llama

Hoy nadie. Cuando se despliegue, el motor `derivados` (o un Schedule de n8n, **inactivo** hasta resolver la
capacidad) le manda los sha256 de los originales sin comprimido. Se deja así a propósito: el cómputo de ffmpeg
vive fuera de n8n y fuera del receptor (§20 #14 de CLAUDE.md).

## Costo al desplegar

Aproximado. Un contenedor de ~256 MB ocioso cuesta unos **$2.5/mes**. Comprimir ~34 videos al día de 8 MB con
`-preset veryfast` son unos pocos minutos de CPU al día. **A medir** en el piloto con `get-service-metrics`.

## Pruebas

```sh
FFMPEG=… FFPROBE=… bun test whatsapp/derivados/                       # sin base: 5 pruebas
MEMORIA_TEST_PG=1 PGHOST=… PGPORT=… PGDATABASE=… \
  MEMORIA_CAPTURA_PASSWORD=… MEMORIA_MOTOR_PASSWORD=… bun test whatsapp/derivados/   # + extremo a extremo
```

Resultado en local, con ffmpeg estático y Postgres 17.10: **6/6**.

- Video sintético de 1080p reducido a ≤720p, con la misma duración y una miniatura JPEG.
- Un archivo corrupto falla con un error propio.
- El proveedor simulado es determinista.
- El proveedor real se niega a correr mientras D10 siga abierta.
- De extremo a extremo:
  - comprimido, miniatura y transcripción simulada;
  - la segunda corrida no duplica nada;
  - un archivo alterado en el bucket da `HUELLA_NO_CUADRA`;
  - un derivado se rechaza con `NO_ES_ORIGINAL`.
