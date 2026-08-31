# fts_po_radar — FASE B: corpus de correo, set etiquetado y medición

**Estado: ESPECIFICACIÓN. No ejecutada.** Bloqueada por #122 (Mail.Read + Application Access Policy).
Sesión 1 · issues #142 / #143 · complementa [`FASE-A-CALIBRACION.md`](FASE-A-CALIBRACION.md).

---

## 0. Por qué FASE B no es opcional

FASE A midió los documentos y contestó *"¿se puede leer una PO?"*. No puede contestar
*"¿se distingue una PO de lo que no lo es?"*, y esa es la pregunta que decide si el detector sirve.

**La razón es estructural: los negativos solo existen del lado del correo.** Odoo guarda POs que ya
se convirtieron en venta — es un corpus de **puros positivos**. La factura de Conmet, la cotización
de LEV, el DocuSign de Mondelez y el `[Nuevo Proyecto Confirmado]` que emite el propio sistema no
están en ninguna `sale.order`: viven solo en el buzón.

Consecuencia dura: **con FASE A sola se puede estimar recall, pero la precisión es inmedible.** Un
detector que marcara "PO" absolutamente todo saldría perfecto contra el corpus de Odoo.

---

## 1. Regla de oro: el corpus se exporta, no se consulta en vivo

**Nunca se lee el buzón con una herramienta viva de correo para etiquetar o medir.**

Motivos, en orden de importancia:

1. **Reproducibilidad.** Una métrica que se recalcula contra un buzón que cambia no es una métrica:
   los correos se archivan, se borran y se mueven. Un set congelado se vuelve a medir en seis meses
   y da lo mismo.
2. **Aislamiento del contenido.** Una vez exportado, el correo es un archivo que se procesa como
   **dato**. Una herramienta viva invita a "leer y decidir sobre la marcha", que es justo el modo en
   que el contenido de un tercero se cuela como instrucción.
3. **Superficie.** El etiquetado y la medición se hacen contra el almacén, sin credenciales de
   correo en el proceso.

Regla operativa: **una sola pasada de exportación, con un `snapshot_id`. Todo lo demás lee del
almacén.**

---

## 2. Pipeline de exportación

```
[1] Ventana         rango de fechas + carpetas (Inbox y Archive)
     |
[2] Graph list      GET /users/{lectura}/mailFolders/{f}/messages
     |              $select=id,internetMessageId,conversationId,subject,from,toRecipients,
     |                      receivedDateTime,hasAttachments,bodyPreview
     |              pagina de 50 en 50 hasta agotar la ventana
     |
[3] Filtro cero     descarta SOLO lo que no puede ser PO ni negativo util:
     |              boletines con List-Unsubscribe y sin adjunto. Nada mas.
     |              (NO se aplica aqui la etapa 1: sesgaria el set)
     |
[4] fts_correo_exportar   por cada messageId, con destinatarios:[] y guardarOneDrive:true
     |              -> .eml completo + adjuntos reales a SharePoint ComercialFTS
     |
[5] Manifiesto      una fila por correo en po_radar.corpus_correo (Postgres)
     |
[6] Congelar        snapshot_id = fecha de corte. El almacen pasa a READ-ONLY
```

**Ventana recomendada:** 12 meses. Cubre el ciclo completo de los clientes recurrentes y los cambios
de canal (la migración de Mondelez de septiembre 2026 queda dentro).

### 2.0 ⚠️ Corrección de la sesión 2: el pipeline de arriba NO es ejecutable tal cual

Este diseño se escribió sin dimensionar el buzón. Medido el 2026-08-31 vía Graph:

| | Medición |
|---|---|
| Items en Inbox | **95,129** |
| Correos recibidos en los últimos 12 meses | **~29,000** |
| Peso del `.eml` de un correo real con 2 adjuntos | **409 kB** |
| Peso estimado del snapshot de 12 meses | **~11.3 GB** |
| Llamadas a Graph que exigiría (3 por correo) | **~87,000** |

**Exportar la ventana completa es inviable** y además innecesario: el 98% de esos correos no aporta
nada al set etiquetado. El paso 4 se sustituye por el muestreo de §2.5.

Y una observación que cambia el peso por un factor de diez: **el `.eml` completo no se necesita para
etiquetar**. Sirve como evidencia de archivo, no para decidir si un correo trae una PO. Para el set
basta con metadatos + cuerpo en texto plano + los adjuntos. Quitar el `.eml` del muestreo baja el
peso de ~409 kB a ~30 kB por correo sin adjuntos y a ~300 kB con ellos.

### 2.5 Muestreo estratificado (sustituye a la exportación total)

El problema real: **las POs son menos del 2% del buzón**. Un muestreo aleatorio de 400 correos daría
unas 6 POs — inútil para medir recall. Y sobre-muestrear positivos sin corregir después inflaría la
precisión. La salida es estratificar con un criterio **independiente del detector** y ponderar al medir.

| Estrato | Criterio de pertenencia (NO usa la etapa 1) | Qué se toma |
|---|---|---|
| **P — remitente candidato** | Dominio ∈ los ~20 dominios de cliente conocidos (de `po_radar.grupos_cliente`) **o** buzón de rol (`noreply`, `no_responder`, `applmgr`, `ordersender`, `extranet`, `compras`, `purchasing`…) | **Censo** de los 12 meses, o muestra grande si excede 400 |
| **A — con adjunto, remitente externo** | Fuera de P, `hasAttachments = true`, dominio ≠ `fts.mx` | Muestra aleatoria de 150 |
| **I — interno** | Dominio = `fts.mx` | Muestra aleatoria de 80 |
| **R — resto** | Todo lo demás | Muestra aleatoria de 120 |

**El criterio de estrato es el remitente y la existencia de adjunto: dos hechos del sobre, no del
contenido.** El detector no participa en la selección, así que el set no queda sesgado a su favor.

**Ponderación obligatoria al medir.** Cada estrato se muestrea con una fracción distinta, así que
un conteo crudo de VP/FP no representa al buzón. Cada correo entra con peso
`w = N_estrato / n_muestreado_estrato`, y precisión y recall se calculan con esos pesos:

```
precision = Σ w·VP / (Σ w·VP + Σ w·FP)
recall    = Σ w·VP / (Σ w·VP + Σ w·FN)
```

Sin la ponderación, sobre-muestrear el estrato P daría una precisión optimista que no se reproduce
en producción. **Hay que guardar `estrato`, `N_estrato` y `n_muestreado` en `corpus_correo`**, o la
medición no se puede reconstruir después.

**Volumen resultante:** ~750 correos, ~200 MB, ~2,250 llamadas a Graph. Eso sí cabe en una sesión.

### 2.1 Qué aporta `fts_correo_exportar` y qué no

Lo aporta: es el único componente que trae **adjuntos reales** y el `.eml` completo, y ya está
construido y publicado (`jHiDim2gmu7VMVaE`).

Lo que **hay que añadirle** para FASE B, y no tiene hoy:

| Falta | Por qué |
|---|---|
| Modo `solo_exportar` | Hoy siempre intenta `sendMail` si hay destinatarios. Para el corpus no se envía nada |
| `snapshot_id` + `estrato` en la ruta y en la respuesta | `Corpus/{snapshot_id}/{messageId}/`, y el estrato hay que persistirlo para poder ponderar (§2.5) |
| Devolver `sha256` por adjunto | Es la llave 2 de deduplicación y hoy no se calcula |
| Devolver el cuerpo en texto plano | Hoy solo pasa el `.eml`; el etiquetado necesita el texto |
| Poder **omitir el `.eml`** | Es el 90% del peso y no se usa para etiquetar (§2.0) |

Son 5 cambios acotados sobre un workflow que ya funciona.

**Estado 2026-08-31:** `Mail.Read` **ya funciona** — los 3 pasos de lectura devuelven 200 sobre el
buzón de Esteban. Lo que ahora bloquea es el **destino**: `Sites.Selected` sobre `ComercialFTS`
responde `403 accessDenied`, así que el paso 4 no tiene dónde escribir. Sin almacén no hay snapshot.

### 2.2 Lo que este pipeline NO debe hacer

- **No aplica la etapa 1 al exportar.** Si el filtro determinista decide qué entra al corpus, el set
  queda sesgado a favor del filtro y el recall medido es ficción. El corpus entra crudo.
- **No manda un solo correo.** `destinatarios: []` sin excepción.
- **No escribe en Odoo.**

---

## 3. Esquema del set etiquetado

Vive en el esquema `po_radar` del Postgres de la auditoría (§7.1 de `AUDITORIA-2026-08.md`).

```sql
-- Manifiesto de exportación: una fila por correo del snapshot.
CREATE TABLE po_radar.corpus_correo (
  id                  bigserial PRIMARY KEY,
  snapshot_id         text        NOT NULL,
  internet_message_id text        NOT NULL,
  graph_message_id    text        NOT NULL,
  conversation_id     text,
  recibido_en         timestamptz NOT NULL,
  remitente           text        NOT NULL,
  remitente_dominio   text        NOT NULL,
  remitente_interno   boolean     NOT NULL,
  asunto              text,
  cuerpo_texto        text,
  n_adjuntos          int         NOT NULL DEFAULT 0,
  sp_path             text        NOT NULL,          -- Corpus/{snapshot}/{messageId}/
  UNIQUE (snapshot_id, internet_message_id)
);

CREATE TABLE po_radar.corpus_adjunto (
  id            bigserial PRIMARY KEY,
  correo_id     bigint  NOT NULL REFERENCES po_radar.corpus_correo(id) ON DELETE CASCADE,
  nombre        text    NOT NULL,
  extension     text,
  content_type  text,
  bytes         int,
  sha256        char(64) NOT NULL,
  -- se llenan al procesar, con las mismas medidas de FASE A
  texto_chars   int,
  paginas       int,
  es_imagen_sin_texto boolean
);

-- LA VERDAD. Una fila por correo. La pone un humano, no el sistema.
CREATE TABLE po_radar.etiqueta (
  correo_id     bigint  PRIMARY KEY REFERENCES po_radar.corpus_correo(id) ON DELETE CASCADE,
  es_po         boolean NOT NULL,
  clase         text    NOT NULL,
  es_revision   boolean NOT NULL DEFAULT false,
  grupo_cliente text,
  folio         text,
  etiquetado_por text   NOT NULL,
  etiquetado_en timestamptz NOT NULL DEFAULT now(),
  nota          text,
  CONSTRAINT clase_valida CHECK (clase IN (
    'po_nueva','po_revision','po_duplicada','po_sin_adjunto',
    'no_cotizacion','no_factura','no_contrato','no_rfq','no_aviso_plataforma',
    'no_notificacion_propia','no_compra_fts','no_operativo','no_publicidad','no_otro'
  ))
);

-- Resultado de una corrida del detector sobre el snapshot. Insert-only.
CREATE TABLE po_radar.corrida (
  id            bigserial PRIMARY KEY,
  snapshot_id   text NOT NULL,
  corrida_en    timestamptz NOT NULL DEFAULT now(),
  version       text NOT NULL,      -- 'spec-1.1', 'umbral-45', 'sin-clasificador'...
  notas         text
);

CREATE TABLE po_radar.prediccion (
  corrida_id    bigint NOT NULL REFERENCES po_radar.corrida(id) ON DELETE CASCADE,
  correo_id     bigint NOT NULL REFERENCES po_radar.corpus_correo(id) ON DELETE CASCADE,
  score_etapa1  int,
  confianza_llm numeric(4,3),
  precision_pub int,
  decision      text NOT NULL,      -- 'reenvia' | 'reenvia_probable' | 'ignora' | 'descartado_etapa1'
  grupo_pred    text,
  folio_pred    text,
  PRIMARY KEY (corrida_id, correo_id)
);
```

### 3.1 Cómo se etiqueta

- **Etiqueta un humano**, correo por correo, sin ver la predicción del sistema. Si el etiquetador ve
  el score primero, lo ancla y el set deja de ser verdad independiente.
- **La clase importa tanto como el booleano.** Saber que se falló en 12 facturas es accionable;
  saber que se falló en 12 correos, no.
- **La regla de desempate es la del negocio, no la del documento:** si el correo entrega la evidencia
  de una orden de un cliente hacia FTS, es PO. Una PO que FTS emite a un proveedor es
  `no_compra_fts` — el caso N12 del set de casos (ver [`README.md`](README.md)) demuestra que la etapa 1 sola no puede
  distinguirlo.
- **Las 20 filas de `casos-prueba.csv` (sesión 0) son la semilla** y su etiqueta ya está puesta.

### 3.2 Tamaño y composición mínimos

| Estrato | Mínimo | Por qué |
|---|---|---|
| POs reales | 120 | Cubre los ~15 clientes recurrentes con varios ejemplos cada uno |
| POs duplicadas / revisiones | 25 | La dedupe es la mitad del diseño (§5 del SPEC) y hoy no tiene un solo caso medido |
| POs sin adjunto (portal) | 10 | Viakable, Ariba `ordersender`, la foto de Calbee |
| Facturas y pagos | 60 | El negativo más peligroso: trae folio, PDF y cliente real |
| Cotizaciones y RFQ | 60 | Incluye las invitaciones a evento de Ariba |
| Contratos / DocuSign | 20 | |
| Notificaciones propias | 30 | El caso del bucle; deben ser 100% descartadas |
| Avisos de plataforma | 20 | El `SUPPLIER_CENTRAL@MDLZ.COM` |
| Operativo y publicidad | 60 | El ruido de fondo real del buzón |
| **Total** | **~405** | |

**Los negativos tienen que ser mayoría (≈62%)**, porque en el buzón real lo son con creces. Un set
balanceado 50/50 daría una precisión optimista que no se reproduce en producción.

---

## 4. Cómo se miden precisión y recall

Sobre el snapshot congelado, con la etiqueta humana como verdad.

### 4.1 Las definiciones, sin ambigüedad

El detector tiene tres salidas (`reenvia`, `reenvia_probable`, `ignora`), pero la medición es
binaria: **reenviado = `reenvia` OR `reenvia_probable`**. Para el negocio, un correo marcado como
probable igual llegó a `newordersnotification@`.

|  | Etiqueta = PO | Etiqueta = no PO |
|---|---|---|
| **Reenviado** | VP | FP |
| **No reenviado** | **FN** | VN |

```
precision = VP / (VP + FP)      cuánto de lo que mandé era de verdad una PO
recall    = VP / (VP + FN)      cuántas de las POs reales alcancé a mandar
```

### 4.2 La métrica que manda

**El objetivo primario es el recall, no el F1.** El principio rector del issue lo dice: un falso
positivo cuesta un correo de más; un falso negativo cuesta una PO perdida. Un F1 trata los dos
errores como iguales y **no son iguales**.

| Métrica | Meta v1 | Comentario |
|---|---|---|
| **Recall** | **≥ 0.97** | Menos de 3 POs perdidas de cada 100. Es la métrica de aceptación |
| **Recall sobre POs con adjunto** | **1.00** | El caso fácil no se falla |
| Precisión | ≥ 0.70 | 3 de cada 10 reenvíos de más es tolerable si el recall se sostiene |
| Descarte del bucle | **1.00** | Cero notificaciones propias reenviadas. Es un fallo que se realimenta |
| Precisión de identidad | reportada | Sobre las POs bien detectadas, % con grupo cliente correcto |

**El umbral 45 del SPEC no está calibrado: se elige aquí.** Se barre de 20 a 80 sobre el set, se
grafica recall contra precisión, y se toma **el umbral más alto que aún da recall ≥ 0.97**. Ese
número sale de datos, no de la intuición del diseño.

### 4.3 Tres mediciones separadas, no una

Medir el sistema completo de una vez esconde dónde falla:

1. **Solo etapa 1** (`version: 'sin-clasificador'`): score determinista contra el umbral. Da el piso
   y dice si el clasificador vale lo que cuesta.
2. **Etapa 1 + clasificador**: el sistema completo. Es la métrica de aceptación.
3. **Solo identidad**, sobre las POs correctamente detectadas: qué % resuelve la escalera y **por
   cuál paso**. FASE A ya predice que el paso 1 (RFC) resolverá cerca del 38%.

### 4.4 Lo que hay que reportar además de los números

- **Los FN uno por uno.** Con recall ≥0.97 sobre ~155 POs, son 4 o 5 casos. Cada uno se lee y se
  explica. Un FN sin explicación es un agujero de diseño que se va a repetir.
- **Los FP por clase.** No es lo mismo colarse con 20 facturas que con 20 cotizaciones: dicen qué
  negativo hay que reforzar.
- **La matriz por cliente.** El recall promedio puede esconder que un cliente entero se está
  perdiendo — exactamente como en FASE A el promedio de RFC (38%) escondía que Nalco es 0 de 84.

### 4.5 Anti-trampas

- **La medición corre sobre el snapshot congelado, nunca contra el buzón vivo.**
- **`intentadas > 0`.** Una corrida sobre un set vacío se ve idéntica a una perfecta (CLAUDE.md §9).
  Ningún resultado cuenta sin el contador de evaluados.
- **Nada de ajustar el prompt contra el set completo y luego reportar sobre el mismo set.** Se parte
  60/40: se calibra sobre el 60% y se reporta sobre el 40% que no se tocó.
- **El etiquetador no ve la predicción** (§3.1).

---

## 5. Orden de ejecución cuando Azure destrabe

1. Los 4 cambios a `fts_correo_exportar` (§2.1) y la prueba de que el paso 1 devuelve **200 con un
   asunto real** — no un `ok:true` que solo signifique que no reventó.
2. Provisionar el Postgres y crear el esquema (§3).
3. Exportar la ventana de 12 meses. Congelar `snapshot_id`.
4. Etiquetar hasta llenar los mínimos de §3.2, empezando por los 20 casos ya etiquetados.
5. Medición 1 (solo etapa 1) y barrido de umbral.
6. Medición 2 (sistema completo) sobre el 40% reservado.
7. Solo entonces, decidir si el detector se construye como está o el diseño necesita otra vuelta.

**Estado real al 2026-08-31.** El paso 1 ya no bloquea: `Mail.Read` funciona. Quedan dos bloqueos,
los dos de infraestructura y ninguno de diseño:

1. **`Sites.Selected` sobre `ComercialFTS` da `403 accessDenied`** — no hay dónde dejar el snapshot.
2. **No hay credencial Postgres en n8n** para `fts-suite-db` — no hay dónde dejar el manifiesto ni
   las etiquetas.

Resueltos esos dos, el orden de arriba se ejecuta con el muestreo de §2.5, no con la exportación
total del §2.
