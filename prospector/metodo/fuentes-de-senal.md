# Fuentes de evento para el modo señal — qué alcanza cada lado

Medido el 2026-09-18. Ninguna de estas cifras es estimada.

## El reparto, en una línea

**Claude Code descubre. n8n recorre y lee.** No es una preferencia de diseño:
es lo único que permite la política de egress.

## Lo que alcanza la sesión de Claude Code

| Herramienta | Resultado |
|---|---|
| `WebSearch` | **Funciona** |
| `WebFetch` a cualquiera de las fuentes | **Bloqueado**, sin excepción |

`WebFetch` se probó contra `nl.gob.mx`, `solili.mx`, `vanguardia-industrial.net`,
`thelogisticsworld.com`, `somosindustria.com` y `neonoticias.mx`. Las seis
devolvieron `EGRESS_BLOCKED`. **Desde aquí no se puede leer un artículo.**

Lo que sí se puede es **buscar**. Una sola consulta dirigida
(`nueva planta alimentos Nuevo León inversión ampliación 2026`) devolvió, entre
otras, una nota del 3-sep-2026 sobre una **planta procesadora de carne en
Escobedo con 500 mdp de inversión** — exactamente la clase de evento que el modo
señal existe para atrapar, y en la geografía del padrón.

## Lo que alcanza n8n desde Railway

Probado con `GET` y User-Agent propio:

| Fuente | HTTP | Feed RSS |
|---|---|---|
| Vanguardia Industrial | **200** (368 KB) | **sí** · `vanguardia-industrial.net/feed/` |
| Cluster Industrial | **200** (511 KB) | **sí** · `clusterindustrial.com.mx/latest/rss/` |
| Somos Industria | **200** (202 KB) | no |
| Solili | **200** (69 KB) | no |
| México Industry | **200** (160 KB) | no |
| Computrabajo | **200** (124 KB) | no |
| Gobierno de Nuevo León · boletines | **403** | — |
| Gobierno de Nuevo León · inversiones | `socket hang up` | — |
| The Logistics World | **403** | — |
| OCC | **403** | — |
| Plastics Technology México | **405** | — |

Cinco de las once responden con contenido útil. **Las cuatro que fallan no son
un problema de configuración: bloquean al cliente.** Para ésas el camino es la
búsqueda, no el raspado.

## El hallazgo que cambia la prioridad

Los dos feeds RSS están **vivos y frescos** — la nota más reciente de cada uno
era del mismo día de la medición. Pero de las **22 notas** que traían entre los
dos:

- **cero** eran de Nuevo León o Coahuila;
- **cero** eran de alimentos o bebidas;
- las que sí pegaban con palabras de disparo eran de Aguascalientes, San Luis
  Potosí, Volvo, BYD y automotriz.

**Un feed genérico de industria tiene una relación señal-ruido pésima para este
padrón.** Suscribirse a los dos RSS y esperar es el mismo error que esperar las
alertas de vacantes de LinkedIn, que dieron 6 en dos años y solo una del padrón.

Por eso el orden correcto es el inverso al intuitivo:

1. **Consulta dirigida** por nombre de empresa del padrón y por término de
   evento. Es lo que encontró la planta de Escobedo en un solo intento.
2. **Feed** solo como red de arrastre secundaria, filtrando por municipio y por
   las 116 razones sociales del padrón antes de mirar nada.

## Cómo se detecta un evento y cómo se empata

### Qué cuenta como señal

Términos de disparo, en orden de valor para FTS:

| Nivel | Término | Por qué importa |
|---|---|---|
| Alto | PTAR, tratamiento de agua, caldera, vapor, torre de enfriamiento | Es lo que vende FTS, dicho con sus palabras |
| Alto | nueva planta, ampliación, expansión, inauguración | Obra nueva = presupuesto abierto |
| Medio | certificación, ISO, inversión, nearshoring | Indica movimiento, no compra |
| Bajo | vacante, contratación | Solo útil si el puesto manda sobre fluidos |

### El empate contra el padrón, en tres pasos

El empate **no** se hace por razón social, por la misma razón que invalidó el
cruce anterior contra Odoo: *la razón social del DENUE casi nunca es la marca*.

1. **Por dominio.** Si la nota enlaza al sitio de la empresa, el dominio es la
   llave más limpia: 112 de las 143 plantas traen dominio en el padrón.
2. **Por marca contra razón social**, con el diccionario que ya salió del
   padrón (`grupolala.com` → `COMERCIALIZADORA DE LACTEOS Y DERIVADOS`,
   `hersheys.com` → `HERSMEX`, y así). Ese diccionario es un activo, no un
   apaño.
3. **Por municipio.** Si la nota dice "Escobedo" y la empresa tiene una sola
   planta en Escobedo, el empate es único. Si tiene varias, **es ambiguo y se
   marca ambiguo**, no se elige.

Una nota que no empata con ninguna de las 143 plantas **no se descarta**: se
guarda como candidata a entrar al padrón en el siguiente corte del DENUE. La
planta de Escobedo es justo ese caso — si es nueva, el DENUE de mayo no la tiene.

### Dónde vive cada pieza

| Pieza | Dónde | Por qué |
|---|---|---|
| Consulta dirigida por empresa y término | Claude Code (`WebSearch`) | Es lo único que pasa el proxy |
| Lectura del artículo completo | n8n | `WebFetch` está bloqueado aquí |
| Recorrido programado de los dos RSS | n8n | Necesita correr sin la sesión abierta |
| Empate contra el padrón y la bandera de ambigüedad | Claude Code | Es criterio, no transporte |
| `corrida.modo = 'senal'` y `senal_disparo` | Postgres | Ya existe en la 010 |

---

# El conjunto de consultas dirigidas

Decidido por Esteban el 2026-09-18: **el modo señal arranca por consulta
dirigida, no por suscripción a feeds.** El conjunto vive en
`db/datos/consultas_senal.json` para que se pueda versionar y auditar.

Son **4 familias y 11 plantillas**. Cada una tiene un trabajo distinto, y cada
una tiene escrito el riesgo que se le midió.

| Familia | Cada | Para qué | Riesgo medido |
|---|---|---|---|
| **F1 · geografía + sector** | semanal | Descubrir plantas que el padrón **no tiene todavía** | Sin la palabra del sector devuelve puro automotriz |
| **F2 · empresa + evento** | mensual, por lotes | Vigilar las plantas que **ya están** en el padrón | Devuelve eventos corporativos de **otras** plantas |
| **F3 · agua y energía** | mensual | Pegar directo en lo que vende FTS | Devuelve **proveedores**, no prospectos |
| **F4 · obra nueva** | mensual | La señal más temprana: antes de que la planta exista | — |

## Los tres riesgos, con la evidencia que los sostiene

Cada uno salió de correr la consulta, no de imaginarla.

**F1 sin sector devuelve automotriz.** Una consulta con geografía y términos de
evento pero sin la palabra del sector trajo GEMMSA (estructuras metálicas),
Sigrama (ingeniería), Infinitum Electric y Adient. **Cero de alimentos.**

**F2 devuelve eventos corporativos de otras plantas.** El capex 2026 de Sigma es
España y Estados Unidos. La inversión grande de Heineken es una cervecería en
**Yucatán**, no Monterrey. Que la empresa tenga planta aquí **no** significa que
la nota hable de esa planta.

**F3 genérica devuelve competencia.** La consulta de `planta de tratamiento` +
`cogeneración` trajo AQUA Systems, Carbotecnia, Grupo Rivend e iAgua. Son
proveedores de tratamiento de agua: competencia o contraparte de FTS, nunca
prospecto. Por eso el JSON trae una lista de `dominios_proveedor` que se
descartan antes de mirar nada.

## La regla que no se puede saltar

> **Un evento solo cuenta si el artículo nombra un municipio de Nuevo León o
> Coahuila.**

Esto va en la **extracción**, no en la consulta, porque la consulta no lo puede
garantizar. Es la diferencia entre "Lala invierte" —que es ruido— y "Lala
estrena línea en el Complejo Industrial Laguna" —que sí pega con las 4 plantas
de Lala en Coahuila.

## Lo que se hace con una nota que no empata

**No se descarta.** Se guarda como candidata a entrar al padrón en el siguiente
corte del DENUE. El corte es de **mayo**: una planta inaugurada en junio no
existe ahí. La procesadora de carne de 500 mdp en Escobedo, del 3 de septiembre,
es exactamente ese caso — y es la razón de ser de la familia F1.
