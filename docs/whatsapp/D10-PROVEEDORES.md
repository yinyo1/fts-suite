# D10 — Proveedor de transcripción y lectura de fotos para la memoria de WhatsApp

Investigación de escritorio, 28-sep-2026. **Nada se contrató ni se probó con archivos reales.**

**Qué tan verificado está cada precio.** Desde este contenedor sólo se pudieron abrir las páginas oficiales de **Anthropic** y de **Google Cloud**. OpenAI, AWS, Azure, Deepgram y AssemblyAI están **bloqueados por la política de red** (`EGRESS_BLOCKED` / `CONNECT 403`). Sus precios salen de resultados de búsqueda de terceros y van marcados **«no verificado»**: hay que confirmarlos en la página oficial antes de firmar.

---

## 1. Resumen y recomendación

**A estos volúmenes el costo no decide: todas las opciones serias quedan entre $3 y $30 USD al mes.** Lo que decide es qué tan bien cada proveedor capta **números de SO, montos y jerga** (THW calibre 12, charolas, termomagnéticos). Eso sólo se sabe con el A/B de la §6. Mientras tanto, esta es la propuesta para arrancar el piloto:

| Uso | Primario | Respaldo (va en el A/B) | Costo mensual estimado |
|---|---|---|---|
| Notas de voz | OpenAI **gpt-4o-transcribe** + `prompt` con glosario | **Gemini 2.5 Flash** (el audio entra con el glosario en el prompt) | $6.54 (primario) / ~$2.18 (respaldo) |
| Tickets (MX/USA) | **Claude Haiku 4.5**, salida JSON | **Gemini 2.5 Flash** | $2.86 / ~$1.05 |
| Descripción de fotos de obra | **Claude Haiku 4.5** | **Gemini 2.5 Flash** | $16.61 / ~$6.09 |
| **Total** (sin video) | | | **≈ $26 / mes** |

Carga histórica de un año, una sola vez: **≈ $195** usando la Batch API (§2). Un OCR especializado en recibos (Textract, Azure, Document AI) sólo conviene como respaldo de tickets. El Expense parser de Google cuesta $0.10 por documento: 35× más que Haiku para el mismo ticket.

---

## 2. Volúmenes (supuestos de ARQUITECTURA §10, no medidos)

| Concepto | Cálculo | Resultado |
|---|---|---|
| Mensajes/mes | 1,130/día × 24.2 días | 27,346 ≈ **27,000** |
| Fotos/mes | 1,130 × 25% = 282.5/día × 24.2 | 6,837 ≈ **6,800** |
| — tickets (15%) | 6,800 × 0.15 | **≈ 1,000** |
| — descripciones | 6,800 − 1,000 | **≈ 5,800** |
| Audios | 1,130 × 8% = 90.4 ≈ 90/día × 0.5 min | 45 min/día |
| Minutos de audio/mes | 45 × 24.2 | **≈ 1,090** |
| Videos | 1,130 × 3% ≈ 34/día × 24.2 | ≈ 823/mes; *supuesto propio:* 0.5 min cada uno → **≈ 410 min** |
| Histórico, 1 año | mensual × 12 | 13,080 min de audio · 81,600 fotos (12,000 tickets) · 4,920 min de video |

**Histórico con el primario:**
- Audio: 13,080 × $0.006 = **$78.48**
- Fotos con Haiku en Batch: 81,600 × $0.001432 = **$116.85**
- Total ≈ **$195**
- Transcribir el audio de los videos suma 4,920 × $0.006 = $29.52.

`archivo` se deduplica por `sha256`. Una foto reenviada a tres grupos se procesa una sola vez, así que los números de arriba son un techo.

---

## 3. Transcripción

| Proveedor / modelo | Precio y unidad | Fuente + fecha | Costo/mes (1,090 min) | Vocabulario propio | Español MX | Retención / entrenamiento |
|---|---|---|---|---|---|---|
| OpenAI gpt-4o-transcribe | $0.006/min | openrouter.ai/openai/gpt-4o-transcribe y tokenmix.ai (búsqueda, 28-sep-2026). **No verificado** (openai.com bloqueado) | 1,090 × 0.006 = **$6.54** | Parámetro `prompt` con texto libre (glosario, formato «SO#####») | Bueno según la industria; hay que medirlo | API: no entrena por defecto; 30 días de monitoreo de abuso (no verificado) |
| OpenAI gpt-4o-mini-transcribe | $0.003/min | igual. **No verificado** | 1,090 × 0.003 = **$3.27** | `prompt` | Menor que el anterior | igual |
| OpenAI whisper-1 | $0.006/min | costgoat.com (búsqueda). **No verificado** | **$6.54** | `prompt` (sólo 224 tokens) | Aceptable | igual |
| Google STT V2 estándar (incluye Chirp) | $0.016/min (0–500k min) | https://cloud.google.com/speech-to-text/pricing, leído 28-sep-2026 ✅ | 1,090 × 0.016 = **$17.44** | *Speech adaptation* / phrase sets (el soporte en Chirp no se verificó) | es-MX existe como locale | La tabla V1 cobra **$0.016 «con data logging»** y **$0.024 «sin data logging»**. **No activar logging** |
| Google STT V2, lote dinámico | $0.003/min | misma, ✅ | 1,090 × 0.003 = **$3.27** | igual | igual | igual. Latencia de horas: sirve para el histórico |
| Gemini 2.5 Flash (Vertex), audio como entrada | $1.00/M tokens de audio, $2.50/M de salida; 25 tokens/s | https://cloud.google.com/vertex-ai/generative-ai/pricing, 28-sep-2026 ✅ (la tasa de 25 tok/s aparece en la sección Live) | (1,500 × $1 + 200 × $2.5)/M = $0.002/min × 1,090 = **≈ $2.18** | Prompt libre: glosario + instrucciones | Por medir | Vertex: sin entrenamiento con datos del cliente (no verificado hoy) |
| AWS Transcribe | $0.024/min (tier 1), por segundo, mínimo 15 s | wring.co y costgoat.com (búsqueda). **No verificado** | 1,090 × 0.024 = **$26.16** | Custom vocabulary / CLM | es-US y es-ES (el es-MX no se verificó) | ⚠️ AWS AI services puede usar contenido salvo *opt-out policy* de la organización (no verificado) |
| Azure AI Speech, batch | $0.18/h = $0.003/min (hay fuentes que dan $1/h estándar) | brasstranscripts.com y otras (búsqueda, cifras contradictorias). **No verificado** | $3.27 – $18.17 | Phrase list / Custom Speech | es-MX soportado | Sin entrenamiento (no verificado) |
| Deepgram Nova-3 multilingüe | $0.0052/min (monolingüe $0.0043) | cekura.ai, convertaudiototext.com (búsqueda). **No verificado** | 1,090 × 0.0052 = **$5.67** | **Keyterm prompting** (Nova-3) | Soporte de español en Nova-3 no verificado | Programa de mejora de modelo con opt-out (no verificado) |
| AssemblyAI Universal-2 | $0.15/h = $0.0025/min, keyterms incluidos | assemblyai.com/blog (búsqueda). **No verificado** | 1,090 × 0.0025 = **$2.73** | `keyterms_prompt` | Español soportado | No verificado |
| AssemblyAI Universal-3.5 Pro | $0.21/h + $0.05/h por keyterms = $0.0043/min | igual. **No verificado** | 1,090 × 0.00433 = **$4.72** | sí | sí | No verificado |
| Whisper large-v3-turbo propio | **estimación**: VPS de 8 vCPU a $40–80/mes, o GPU por hora | estimación propia, sin fuente | **$40–80 fijos** (≈ 18 h de audio al mes) | `initial_prompt` | Igual que Whisper | Los datos no salen |

**Notas**
- **La jerga es el criterio.** Todos los proveedores aceptan algún tipo de pista. El glosario se arma con los nombres de producto de Odoo, marcas y el patrón `SO\d{5}`. Además, la salida pasa por un **post-proceso con regex** que normaliza «ese o once mil…» a `SO11…`, sea cual sea el proveedor.
- **Formato.** WhatsApp manda `audio/ogg; codecs=opus`. Por documentación pública (no re-verificada hoy) OpenAI, Google (OGG_OPUS), AWS, Deepgram y AssemblyAI lo aceptan. **Aun así conviene convertir con `ffmpeg` a FLAC mono de 16 kHz**: cuesta cero y quita una variable del A/B.
- **Self-hosted no es el piso de costo a este volumen.** Sale más caro que cualquier API y agrega operación. Y **nunca debe correr en el `Primary` de n8n** (CLAUDE.md §20 #14).

---

## 4. Tickets y fotos

**Supuesto por imagen:** foto de WhatsApp de ~1600×1200, más un prompt de 300 tokens y una salida de 200 tokens.

**Cómo se calculan los tokens de la imagen**
- **Claude** (https://platform.claude.com/docs/en/build-with-claude/vision, 28-sep-2026 ✅): `⌈ancho/28⌉ × ⌈alto/28⌉`.
  - En los modelos de resolución estándar (Haiku 4.5, Sonnet 4.x) el lado largo se reduce a un máximo de 1568 px y la imagen queda en ≤ 1,568 tokens. 1600×1200 baja a ≈ 1269×952, o sea 46 × 34 = **1,564 tokens** (la tabla oficial da 1,564 para 2000×1500, que tiene la misma proporción).
  - En los modelos de alta resolución (4.7 en adelante, p. ej. Sonnet 5) la imagen no se reduce: 58 × 43 = **2,494 tokens**.
- **Gemini:** la página de Vertex dice «258 tokens por imagen». La documentación de Gemini (ai.google.dev, bloqueada) describe mosaicos de 768 px a 258 tokens cada uno, lo que da 6 × 258 = 1,548 tokens. Se usa el caso **alto (1,548)**; está **no verificado**.
- **OpenAI** (fórmulas de memoria, **no verificadas**):
  - gpt-4.1-mini: parches de 32 px con tope de 1,536 × 1.62 ≈ 2,488 tokens.
  - gpt-4o-mini con detail high: 2,833 + 5,667 × 4 mosaicos ≈ 25,501 tokens.

| Proveedor / modelo | Precio y unidad | Fuente + fecha | Costo por imagen (cálculo) | Mes: 1,000 tickets / 6,800 fotos | Notas |
|---|---|---|---|---|---|
| **Claude Haiku 4.5** | $1/M entrada, $5/M salida; Batch $0.50/$2.50 | platform.claude.com/docs/en/about-claude/pricing, 28-sep-2026 ✅ | (1,564 + 300) × $1/M + 200 × $5/M = **$0.002864** | **$2.86 / $19.48** | JSON estructurado. Inglés y español en el mismo modelo. API sin entrenamiento por defecto (no re-verificado hoy) |
| Claude Sonnet 5 (alta resolución) | $2/M, $10/M | misma ✅ | (2,494 + 300) × $2/M + 200 × $10/M = **$0.007588** | $7.59 / $51.60 | Sólo para reintentar tickets de baja confianza |
| Claude Sonnet 4.6 | $3/M, $15/M | misma ✅ | (1,864) × $3/M + 200 × $15/M = **$0.008592** | $8.59 / $58.43 | Sin ventaja sobre Sonnet 5 |
| **Gemini 2.5 Flash** (Vertex) | $0.30/M entrada, $2.50/M salida (el razonamiento se cobra como salida) | cloud.google.com/vertex-ai/generative-ai/pricing, 28-sep-2026 ✅ | (1,548 + 300) × 0.30/M + 200 × 2.50/M = **$0.00105** | $1.05 / $7.16 | Poner `thinking_budget=0` o el costo de salida se dispara |
| Gemini 2.5 Flash-Lite | $0.10/M, $0.40/M | misma ✅ | 1,848 × 0.10/M + 200 × 0.40/M = **$0.000265** | $0.27 / $1.80 | Piso de costo; hay que medir su calidad en tickets |
| Gemini 3.x Flash (precio introductorio hasta 31-dic-2026) | $0.75/M, $3.75/M | misma ✅ | 1,848 × 0.75/M + 200 × 3.75/M = **$0.002136** | $2.14 / $14.52 | Sube a $1.50/$7.50 el 1-ene-2027 |
| OpenAI gpt-4.1-mini | $0.40/M entrada (salida $1.60/M) | pricepertoken.com (búsqueda). **No verificado** | (2,488 + 300) × 0.40/M + 200 × 1.60/M = **$0.001435** | $1.44 / $9.76 | |
| OpenAI gpt-4o-mini | $0.15/M, $0.60/M | búsqueda. **No verificado** | 25,801 × 0.15/M + 200 × 0.60/M = **$0.00399** | $3.99 / $27.13 | Multiplicador de imagen alto: más caro que 4.1-mini |
| Google Document AI, Expense parser | $0.10 por documento (1–10 páginas) | cloud.google.com/document-ai/pricing, 28-sep-2026 ✅ | $0.10 | **$100** (sólo tickets) | Extrae campos, pero no describe fotos |
| Google Enterprise OCR / Vision Text Detection | $1.50 por 1,000 (las primeras 1,000 al mes gratis) | document-ai/pricing y cloud.google.com/vision/pricing ✅ | $0.0015 | ≈ $0–1.50 | Sólo texto crudo; después hace falta un LLM |
| AWS Textract AnalyzeExpense | $0.01/página | medium.com, lenscopy.com (búsqueda). **No verificado** | $0.01 | $10 | Opt-out de AWS AI services (ver §3) |
| Azure Document Intelligence, prebuilt receipt | $10 por 1,000 páginas (500 gratis al mes) | starnovai.com, docuocr.com (búsqueda). **No verificado** | $0.01 | $10 | Buen soporte de recibos de EE.UU. |

**Recomendación de flujo:** una sola llamada a Haiku por foto. Primero clasifica (ticket / avance / seguridad / otro) y luego, según el caso, extrae el JSON del ticket (`tienda, fecha, moneda, subtotal, impuesto, total, SO_detectado`) o escribe la descripción. Si la confianza sale baja, o el total no cuadra con subtotal + impuesto, se reintenta con Sonnet 5. **Cada intento queda como su propia fila en `archivo_derivado`**, así el costo del reintento se ve.

---

## 5. Riesgos y límites

- **Privacidad.** Los mensajes son de empleados: voz, caras, placas, tickets con tarjeta parcial. Hay que usar la API empresarial sin entrenamiento, **no activar el data logging de Google**, y aplicar el **opt-out de AWS AI services** si se usa AWS. Los derivados heredan la visibilidad `interno` (D11).
- **Residencia de datos.** Ninguno procesa en México por defecto. Claude cobra 1.1× por forzar EE.UU. (`inference_geo`). En Vertex las regiones no globales cuestan ≈ 10% más (verificado en su tabla).
- **Dependencia de un solo proveedor (lock-in).** Es baja: `archivo_derivado` guarda `proveedor` + `version`, y la llave única `(sha256, tipo, proveedor, version)` permite reprocesar con otro proveedor sin borrar nada. El glosario y los prompts se versionan en el repo, no en la consola del proveedor.
- **Los volúmenes son supuestos.** El 15% de tickets, los 0.5 min por nota de voz y la duración de los videos no se han medido. Por eso el piloto tiene que reemplazar estos números antes de extrapolar.
- **Siete de los doce precios no están verificados** (red bloqueada). Se confirman en la página oficial antes de firmar.

---

## 6. Cómo medir el costo real en el piloto

Reglas: `costo_usd` se calcula con el **uso que reporta el proveedor** (tokens o segundos de la respuesta), nunca con la tarifa supuesta. Una fila real (`es_simulado = false`) con `costo_usd` nulo cuenta como error.

```sql
-- 0. Red: filas reales sin costo (debe dar 0) y que SÍ haya filas reales (intentadas > 0)
SELECT count(*) FILTER (WHERE costo_usd IS NULL) AS sin_costo, count(*) AS reales
FROM memoria.archivo_derivado WHERE NOT es_simulado;

-- 1. Costo por día y proveedor (hora de Monterrey)
SELECT (creado_en AT TIME ZONE 'America/Monterrey')::date AS dia, proveedor, version, tipo,
       count(*) AS n, round(sum(costo_usd), 4) AS usd
FROM memoria.archivo_derivado
WHERE NOT es_simulado
GROUP BY 1,2,3,4 ORDER BY 1,2,4;

-- 2. Costo por minuto de audio (un archivo reenviado cuenta una sola vez)
WITH dur AS (
  SELECT archivo_sha256 AS sha, max((metadatos->>'duracion_s')::numeric) AS s
  FROM memoria.evento
  WHERE tipo = 'audio' AND archivo_sha256 IS NOT NULL
    AND metadatos->>'duracion_s' ~ '^[0-9]+(\.[0-9]+)?$'
  GROUP BY 1)
SELECT d.proveedor, d.version, count(*) AS audios,
       round(sum(dur.s)/60, 1) AS minutos, round(sum(d.costo_usd), 4) AS usd,
       round(sum(d.costo_usd) / nullif(sum(dur.s)/60, 0), 5) AS usd_por_min
FROM memoria.archivo_derivado d JOIN dur ON dur.sha = d.sha256
WHERE d.tipo = 'transcripcion' AND NOT d.es_simulado
GROUP BY 1,2;

-- 3. Costo por ticket (incluye reintentos: se suma por archivo)
SELECT d.proveedor, count(DISTINCT d.sha256) AS tickets,
       round(sum(d.costo_usd) / nullif(count(DISTINCT d.sha256), 0), 5) AS usd_por_ticket,
       round(avg(a.bytes)/1024) AS kb_prom
FROM memoria.archivo_derivado d JOIN memoria.archivo a ON a.sha256 = d.sha256
WHERE a.clase = 'ticket' AND d.tipo = 'ocr' AND NOT d.es_simulado
GROUP BY 1;

-- 4. Extrapolación a 40 grupos: costo promedio por grupo y por día con actividad, × 40 × 24.2
WITH primer AS (           -- el archivo se le cobra al primer grupo donde apareció
  SELECT DISTINCT ON (archivo_sha256) archivo_sha256 AS sha, canal_id,
         (ocurrido_en AT TIME ZONE 'America/Monterrey')::date AS dia
  FROM memoria.evento WHERE archivo_sha256 IS NOT NULL
  ORDER BY archivo_sha256, ocurrido_en),
por_grupo_dia AS (
  SELECT p.canal_id, p.dia, sum(d.costo_usd) AS usd
  FROM memoria.archivo_derivado d JOIN primer p ON p.sha = d.sha256
  WHERE NOT d.es_simulado
  GROUP BY 1,2)
SELECT count(DISTINCT canal_id) AS grupos_piloto,
       round(avg(usd), 4) AS usd_grupo_dia,
       round(avg(usd) * 40 * 24.2, 2) AS usd_mes_40_grupos
FROM por_grupo_dia;
```

*Nota sobre la consulta 4:* en el A/B cada archivo pasa por los dos proveedores. Hay que filtrar por `proveedor` para no sumar los dos costos.

**Protocolo A/B (2 semanas, los 3 grupos piloto)**
1. Cada audio y cada foto de clase `ticket` pasa por **los dos proveedores** (primario y respaldo). La llave única ya lo permite. Las descripciones de fotos van sólo por el primario.
2. Al final se eligen **al azar 50 transcripciones y 50 tickets**. Se le muestran a un revisor humano **a ciegas**: proveedor oculto y orden aleatorio.
3. **Rúbrica** (0/1 por campo):
   - *Audio:* número de SO exacto · cantidades y montos exactos · términos técnicos correctos (THW, calibre, charola, termomagnético, marca) · comprensible sin escuchar el audio.
   - *Ticket:* total exacto · tienda · fecha · moneda (MXN/USD) · SO capturado si aparece · subtotal + impuesto = total.
4. Ejemplo sintético de lo que se califica: audio «mándame cuatro rollos de THW calibre 12 para el tablero de la SO12345» → se espera `SO12345`, `4`, `THW`, `calibre 12`. Ticket «HOME DEPOT #0000 · 09/15/26 · TOTAL $184.37 USD».
5. **Regla de decisión:** gana el más barato de los que queden a ≤ 5 puntos porcentuales del mejor en **SO exacto** y **total exacto**. Si ninguno supera 90% en esos dos campos, se prueba el siguiente de la tabla antes de decidir.

---

## 7. Decisión que falta (Esteban)

- **Aprobar el par para el A/B:** voz gpt-4o-transcribe contra Gemini 2.5 Flash, y fotos Claude Haiku 4.5 contra Gemini 2.5 Flash. Implica abrir cuenta de pago en OpenAI y en Google Cloud/Vertex, y confirmar si FTS ya tiene cuenta de API de Anthropic (no se verificó).
- **Privacidad:** ¿basta con la API empresarial sin entrenamiento y procesamiento en EE.UU./global, o se exige residencia (US-only +10%) o que no salga nada (Whisper propio, ≈ $40–80 fijos)?
- **Presupuesto y alcance:** autorizar ≈ $30/mes en operación y ≈ $195 del histórico, y decidir si también se transcribe el audio de los videos (+ ≈ $2.50/mes, + $30 del histórico).
