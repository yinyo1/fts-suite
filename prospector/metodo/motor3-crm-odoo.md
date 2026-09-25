# Motor 3 · Seguimiento en el CRM de Odoo — diseño

**Qué se construye ya:** nada de este documento, y es a propósito.
**Qué espera n8n:** la vía de escritura (§4e).
**Qué espera OK explícito de Esteban:** **todo lo que escriba en Odoo.** La regla
vigente es que la herramienta es **solo lectura** sobre Odoo, y crear un lead es
escritura. Este documento diseña la vía y **no la construye**.

Lo único ya construido del lado del motor 2 es **el paquete**
(`./prospector paquete`, `flujo/paquete.py`): el JSON que este motor consume.
Existe, tiene pruebas, y se puede leer hoy sin tocar Odoo.

---

> ## ETAPA 1 CONSTRUIDA sobre #305 (DECISIÓN 6)
>
> `./prospector importar` escribe un **CSV que la importación nativa de Odoo
> entiende** (`crm.lead`), fuera del repo, con **cero escrituras y sin
> credencial**. `flujo/importacion_odoo.py`. Las tres reglas duras son de código,
> no de prosa, y cada una tiene prueba: un correo `candidato` **no** va en
> `email_from` (va al lognote con su nivel, y la tarjeta encabeza con el contacto
> cuyo correo **sí** se puede usar); un contacto en revisión humana **no** se
> propone como partner; y **no existe columna de celular**.
>
> **La etapa 2 sigue esperando tu OK con alcance exacto, y no usa la credencial de
> Odoo que ya existe en la suite.**

# 4a · La tarjeta de prospecto

Un **`crm.lead` de tipo `lead`**, no `opportunity`. La distinción no es
cosmética en Odoo: un lead vive en la bandeja de marketing, no ensucia el
embudo de ventas, no entra en los pronósticos y no le cuenta a nadie como
oportunidad perdida cuando caduca. **Un prospecto que nunca contestó no es una
oportunidad perdida: nunca fue una oportunidad.** Meterlo como `opportunity`
desde el día uno envenena las métricas del equipo que sí vende.

| Campo de Odoo | De dónde sale | Nota |
|---|---|---|
| `name` | `empresa` + `planta` del paquete | «Coficab · Durango» |
| `type` | fijo: `lead` | evoluciona a `opportunity` solo en el destino 3 |
| `partner_name`, `street`, `city` | `empresa`, `planta` | sin crear `res.partner` de la empresa todavía |
| `source_id` (utm.source) | `origen` del paquete: `radar` o `manual` | es la pregunta que el aprendizaje contesta |
| `medium_id` | la fuente de la señal (`correo_propio`, `prensa_industrial`, …) | lo que el evaluador puntuó |
| `description` | `gancho` + `por_que_ahora` + `como_hablarles` | el criterio del operador, tal cual |
| `date_deadline` | **la fecha de caducidad** (§4b) | derivada del tipo de señal y del canal |
| `tag_ids` | `nivel` (planta/corporativo), proceso del catálogo, veredicto de Chao1 | para poder filtrar y medir después |
| **la ficha** | `mail.message` en el **lognote** | el `.html` completo, que es lo que Rissia lee |
| **los contactos** | `res.partner` ligados, uno por contacto de valor | §4a.2 |
| `campaign_id` | la señal con su fecha | «senal:2025-12-08» |

## 4a.1 · La ficha va en el lognote, y esto resuelve un problema real

`ficha --modo limpio` emite un `.html` autocontenido, y hoy sobrevive a la sesión
sólo porque alguien lo sube a OneDrive a mano (#301). **El lognote del lead es un
mejor destino que OneDrive**, por tres razones:

1. vive **junto a la cuenta**, no en una carpeta que hay que recordar;
2. la ve **quien trabaja la cuenta**, sin que nadie se la mande;
3. queda en el **mismo inquilino y el mismo control de datos** que ya tiene Odoo.

No sustituye a OneDrive: la ficha es un archivo que Rissia también manda por
fuera. **Las dos cosas, y la entrega a Odoo cuenta como entrega** para el código
4 de `ficha` — un destino más en `Corrida.DESTINOS`.

## 4a.2 · Los contactos, y la línea que no se cruza

Un `res.partner` por contacto de valor, `parent_id` a la empresa, con:

* `function` = puesto · `email` = correo, **sólo si el nivel lo permite**;
* una **etiqueta con el nivel de confianza** (`confirmado` / `solido` /
  `candidato`), visible en la tarjeta.

**Y tres reglas duras:**

> **Un correo `candidato` NO se escribe en el campo `email`.** Va en el lognote,
> con su nivel. El campo `email` de Odoo es de donde salen los envíos: un correo
> derivado de un patrón puesto ahí es un rebote automático con el dominio de FTS,
> o peor, un correo a la persona equivocada. Es la diferencia entre «existe una
> dirección así» y «ésta es su dirección», que el método ya distingue (#24).
>
> **Un contacto con `revision_humana: true` no se crea como `res.partner`.** Va
> al lognote como pendiente. El paquete ya lo marca; crear el partner lo
> blanquea, porque en Odoo un partner con nombre y puesto se ve idéntico venga de
> donde venga.
>
> **`celular_personal` no existe como campo poblado.** Nunca, por ninguna vía.
> El catálogo ya rechaza la fuente que lo recolecta (`cv_celular_masivo`) y el
> paquete lo declara en `canales_que_no_emite` para que este motor no lo invente.

---

# 4b · El ciclo de vida: tres destinos

```
                    ┌──────────────────────────────┐
   paquete ───────> │  TARJETA (crm.lead, lead)    │
   del motor 2      │  con FECHA DE CADUCIDAD      │
                    └───────┬──────────┬───────────┘
                            │          │
         cadencia completa  │          │  hay respuesta
         sin respuesta      │          │
                            v          v
                    ┌───────────────┐  ┌──────────────────────┐
                    │  CADUCA       │  │  EVOLUCIONA          │
                    │  archivada    │  │  -> opportunity       │
                    │  con motivo   │  │  flujo nativo de Odoo │
                    └───────┬───────┘  └──────────────────────┘
                            │
      el radar detecta      │
      señal NUEVA           v
                    ┌──────────────────────────────┐
                    │  SE RECICLA                  │
                    │  reabre CON HISTORIAL,       │
                    │  no desde cero               │
                    └──────────────────────────────┘
```

## Destino 1 · CADUCA

Cadencia completa sin respuesta → `active = False` con `lost_reason_id` y una
razón escrita. **Archivada, no borrada:** el historial es lo que hace posible el
reciclaje, y borrarlo convierte el segundo intento en un primer intento.

La razón se escribe con lo que de verdad pasó: cuántos toques, por qué canales,
qué señal la originó. Una tarjeta archivada sin eso no le enseña nada al radar.

## Destino 2 · SE RECICLA — y es el que justifica todo lo demás

El radar detecta señal nueva de la misma empresa → la tarjeta archivada
**reabre**, con el historial acumulado.

**No se crea una tarjeta nueva**, y ésta es la decisión de diseño más importante
del motor 3: si cada señal crea una tarjeta, al año hay seis tarjetas de la misma
cuenta, nadie sabe cuál es la vigente, y **el equipo vuelve a presentarse como si
no se conocieran**. Reabrir significa que el segundo toque empieza con «el año
pasado platicamos de X, veo que ahora Y» — que es el único mensaje frío que
funciona.

La reapertura suma, no reemplaza:

* la señal nueva **se agrega** a la lista, con su fecha; la vieja se queda;
* el contador de intentos **no se reinicia** — a la tercera reapertura sin
  respuesta la cuenta dice algo, y lo que dice es *el canal está mal, no el
  momento*;
* la fecha de caducidad se recalcula con la señal **nueva**;
* se registra **qué señal reabrió**, que es dato para el evaluador.

**Cómo se reconoce «la misma empresa»:** por la llave que el método ya fijó y no
por nombre — `dominio_correo + ciudad`. El DUNS está descartado (apunta a una
oficina en vez de la planta) y la razón social casi nunca es la marca (`HERSMEX`
por Hershey).

## Destino 3 · EVOLUCIONA

Hay respuesta → `convert_opportunity` nativo de Odoo, y **de ahí es ventas
normal**: etapas, pronóstico, cotización. El motor 3 **suelta** la tarjeta aquí.
No hay una segunda herramienta que administre oportunidades: Odoo ya lo hace, y
duplicarlo sería construir un CRM dentro del CRM.

Lo único que el motor 3 conserva es **la línea de origen**: qué señal, qué canal,
cuántos toques. Es lo que el aprendizaje necesita cuando la oportunidad se gane o
se pierda, seis meses después.

## Los plazos de caducidad

Dos ejes, porque una señal fresca de obra nueva no caduca igual que una nota de
hace un año, y un correo directo no espera lo mismo que un InMail.

**Por tipo de señal** — el reloj lo pone el evento, no el CRM:

| Tipo de señal | Plazo | Por qué ése |
|---|---|---|
| Convocatoria de proveedores / licitación | **su propia fecha de cierre** | El plazo no lo decide FTS. Si la convocatoria cierra el 30, la tarjeta caduca el 30 |
| Frase de necesidad futura en el buzón | **90 días**, o la fecha que el correo diga | Si el cliente dijo «el próximo año», el reloj arranca ahí. Lo dice el correo |
| Obra nueva / ampliación anunciada | **120 días** | La ventana de especificación de una obra industrial. Después ya hay proveedor |
| Vacante técnica activa | **45 días** | Una vacante se cierra rápido; pasado eso ya no prueba nada |
| Alta en cámara / evento | **hasta el evento + 15 días** | El evento es el canal |
| Nota de prensa corporativa | **60 días** | La más débil de la tabla, y la que más rápido deja de ser noticia |
| Visita desde IP corporativa | **21 días** | La intención de navegación se enfría en semanas |

**Por canal** — cuántos días esperar **cada toque** antes del siguiente:

| Canal | Espera entre toques | Toques antes de caducar |
|---|---|---|
| `correo_directo` con historia | 5 días | 3 |
| `correo_directo` frío (correo confirmado, sin relación) | 7 días | 3 |
| `linkedin` | 10 días | 2 |
| `conmutador` | 7 días | 2 |
| `evento` | — | 1, y la fecha la pone el evento |

La caducidad efectiva es **el menor** de los dos relojes: si la señal caduca en
45 días y la cadencia necesita 3 × 7 = 21, cabe; si la señal es una convocatoria
que cierra en 10 días, la cadencia se comprime o se salta a `correo_directo`.

> **Lo que estos números NO son:** medidos. Son plazos razonados desde el ciclo
> de una obra industrial y desde cómo responde una planta, y están escritos
> **para poder corregirlos con datos** — que es justo lo que §4d produce. El
> primero que se va a mover es el de la nota de prensa, porque es el que peor
> pega según lo que ya se midió en `fuentes-de-senal.md`.

---

# 4c · La cadencia multicanal

Cada toque es una **`mail.activity`** programada en el lead. Odoo ya sabe
recordarle a alguien qué toca hoy — es su bandeja de actividades— así que no hay
que construir un recordatorio: hay que **crear las actividades bien**.

## Cómo se elige el canal: por el TIPO DE CONTACTO, no por preferencia

Y esto **ya está implementado en el motor 2**: `flujo/paquete.py` deriva el canal
de la evidencia y lo manda con su razón. El motor 3 **obedece el paquete**, no
vuelve a decidir:

| Situación del contacto | Canal del primer toque | Ya derivado por |
|---|---|---|
| Relación existente — su correo salió del buzón o de Odoo de FTS | **`correo_directo`** | raíz `fts_interno` en el campo `correo` |
| Correo **literal observado**, sin relación previa | `correo_directo` | `es_ancla` en el correo |
| Nombre y puesto, correo sólo derivado del patrón | `linkedin` **como refuerzo** | no hay ancla |
| Puesto sin persona | **`conmutador`**, pidiendo al puesto por su título | no hay nombre |
| La empresa estará en un evento | `evento` | **lo pone el motor 3**: el motor 2 no tiene esa señal |

**Prohibido, y no es una omisión:** **celular personal**. En ningún toque, por
ningún canal, en ninguna etapa.

## A quién le recuerda Odoo

`user_id` del lead = quien trabaja la cuenta. El reparto por cartera **ya existe
y no hay que inventarlo**: está en la hoja de clientes-usuarios del tracker de
SharePoint, con dueño vigente por cuenta. Una cuenta nueva sin dueño va a
**Revisar**, no a un dueño elegido en silencio.

## Cada toque se registra, y el registro es el dato

Al cerrar cada actividad: canal, fecha, **qué pasó** (`sin_respuesta` ·
`respuesta_negativa` · `respuesta_positiva` · `rebote` · `persona_equivocada` ·
`ya_no_trabaja_aqui`). Los dos últimos no son fracasos del toque: son **datos que
corrigen la ficha**, y valen tanto como una respuesta positiva.

> `rebote` sobre un correo `candidato` es la medición directa de que el patrón
> está mal, y tiene que volver al motor 2 — es exactamente la evidencia que
> `Dato.nivel` necesita para bajar ese patrón de `candidato` a descartado. Hoy el
> motor 2 nunca se entera de si sus correos llegaron.

---

# 4d · El aprendizaje: qué le devuelve al radar

Al cerrar cada tarjeta **por cualquiera de los tres destinos**, un registro al
motor 1. El formato:

```json
{
  "version": 1,
  "emitido": "2026-09-24T23:00:00Z",
  "de": "motor3_crm_odoo",
  "para": "motor1_radar",

  "cuenta": {"empresa": "Coficab", "planta": "Durango",
             "llave": "coficab.com|durango",
             "en_padron_denue": false},

  "senal_que_la_origino": {
    "fuente": "prensa_industrial",
    "tipo": "obra_nueva",
    "fecha_senal": "2025-12-08",
    "puntaje_del_evaluador": 80,
    "desglose": {"match_catalogo": 43, "frescura": 25, "fuerza_de_fuente": 12},
    "origen": "radar"
  },

  "lo_que_se_hizo": {
    "toques": [
      {"n": 1, "canal": "correo_directo", "fecha": "2026-01-12",
       "nivel_confianza_del_correo": "solido", "resultado": "sin_respuesta"},
      {"n": 2, "canal": "linkedin", "fecha": "2026-01-22",
       "resultado": "respuesta_positiva"}
    ],
    "dias_hasta_la_primera_respuesta": 10,
    "canal_que_funciono": "linkedin"
  },

  "desenlace": {
    "destino": "evoluciona",
    "motivo": "",
    "reaperturas_previas": 0,
    "convirtio": true,
    "monto_si_hubo": null,
    "proceso_del_cliente": "fundicion de cobre",
    "tipo_de_proyecto_cotizado": "agua helada para proceso"
  },

  "correcciones_para_el_motor_2": [
    {"que": "correo", "contacto": "[puesto]", "nivel_declarado": "candidato",
     "lo_que_paso": "rebote", "leccion": "el patron nombre.apellido no aplica a esta planta"}
  ]
}
```

## Qué ajusta cada campo, concretamente

| Campo del registro | Qué mueve en el evaluador |
|---|---|
| `senal.fuente` + `desenlace.convirtio` | El peso de **fuerza de fuente**. Si la prensa industrial convierte 1 de 20 y el correo propio 1 de 3, los 8 y 25 puntos dejan de ser una hipótesis |
| `senal.fecha_senal` → `toques[0].fecha` | La curva de **frescura**. Si las que convierten se tocaron a los 200 días, la tabla está mal |
| `desenlace.proceso_del_cliente` + `tipo_de_proyecto_cotizado` | El **catálogo de §3a**: qué proceso produce qué proyecto de verdad. El catálogo deja de ser histórico y se vuelve predictivo |
| `canal_que_funciono` vs el canal recomendado | Las reglas de canal de `paquete.py`. Es el único lugar donde se puede medir si «LinkedIn como refuerzo» es correcto |
| `reaperturas_previas` + `destino` | Si el reciclaje sirve. Tres reapertura sin respuesta dicen *el canal está mal, no el momento* |
| `cuenta.en_padron_denue` | **El hueco del §3d.** Si las que convierten no están en el padrón, el padrón como requisito está sesgando contra la obra nueva, y hay número para probarlo |
| `correcciones_para_el_motor_2` | Baja niveles de confianza y corrige patrones. Es el único camino de vuelta que el motor 2 no tiene hoy |

## Y una regla sobre los pesos

> **Los pesos no se mueven con menos de 20 tarjetas cerradas.** Con cinco
> resultados, ajustar un peso es ruido con cara de aprendizaje — el mismo error
> que Chao1 comete cuando f2 = 1 y que el veredicto `prematuro` existe para
> evitar. El registro se acumula desde el primer día; el ajuste espera.

---

# 4e · La vía de escritura a Odoo — **NO SE CONSTRUYE SIN OK DE ESTEBAN**

La regla vigente: **la herramienta lee Odoo, nunca escribe.** Crear un
`crm.lead`, un `res.partner` o una `mail.activity` es escritura. Aquí están las
dos vías, con lo que cada una cuesta.

## Vía A · n8n con credencial acotada a los modelos del CRM — **recomendada**

| | |
|---|---|
| **Cómo** | Un usuario de Odoo propio (`bot-prospector`) con permiso de **escritura sólo** en `crm.lead`, `crm.lead.tag`, `mail.activity`, `mail.message` y `res.partner`; **lectura** donde ya la hay; y **nada** en `sale.order`, `account.move`, `hr.*` ni `stock.*` |
| **A favor** | El permiso es **verificable**: se puede auditar en Odoo quién escribió qué. Corre sin la sesión abierta, que es requisito de una cadencia. Y el blast radius está acotado por construcción, no por buena intención |
| **En contra** | Toca la suite de n8n, que **es frágil y no se toca**: Redis muerto, Worker nunca desplegado, todo en un proceso de 8 GB en `Primary`. Un flujo nuevo ahí no es gratis |

**Y por eso la recomendación viene con una condición:** el flujo del motor 3
**no entra al n8n actual**. Entra cuando el Worker esté desplegado y Redis vivo,
o en un proceso aparte. Meter un flujo con cron en un proceso de 8 GB que ya está
al límite es el tipo de decisión que se paga un martes a las 3 de la tarde.

## Vía B · El conector de Odoo cuando tenga escritura

| | |
|---|---|
| **Cómo** | Las herramientas `mcp__FTS_Odoo__*` que hoy leen (`odoo_query`, `odoo_describe`, `fts_*`) más una de escritura |
| **A favor** | Cero infraestructura nueva. El permiso lo gobierna el conector |
| **En contra** | **No existe hoy**: las herramientas conectadas son de lectura, medido. Y una escritura por MCP ocurre **dentro de una sesión de Claude**, así que no puede sostener una cadencia que corre de lunes a viernes sin nadie mirando |

## La recomendación, en una línea

**Vía A, con el flujo fuera del n8n actual, y en dos etapas:**

1. **Etapa 1 — sólo lectura, cero riesgo.** El motor 3 se construye leyendo: el
   paquete ya existe, y el motor 3 puede **generar el lead como un JSON o un CSV
   de importación** que Esteban revisa y sube él. Así se valida la forma de la
   tarjeta, los plazos y la cadencia **sin una sola escritura**. Esto se puede
   hacer hoy y no necesita OK.
2. **Etapa 2 — escritura acotada.** Con la forma ya validada y 20 tarjetas de
   ejemplo revisadas, se pide el OK con el alcance exacto: qué modelos, qué
   usuario, qué se audita.

**Lo que NO recomiendo, y lo digo porque es la salida fácil:** usar la credencial
de Odoo que ya existe en la suite. Funcionaría hoy y es exactamente el atajo que
convierte «la herramienta lee Odoo» en «la herramienta escribe donde quiera»,
sin que nadie lo haya decidido.

---

## Resumen de qué espera qué

| Pieza | Estado |
|---|---|
| El **paquete** del motor 2 (`./prospector paquete`) | **construido**, con pruebas |
| §4a forma de la tarjeta · §4b plazos · §4c cadencia · §4d formato | **diseñados aquí**, sin construir |
| Etapa 1: el lead como JSON/CSV para que Esteban lo suba | **se puede construir ya**, cero escritura |
| Etapa 2: escritura acotada a `crm.lead` y compañía | **espera OK explícito de Esteban** |
| El cron de la cadencia | **espera n8n** — y espera que el Worker esté desplegado |
