# Regresión de Ragasa — 2026-09-18

Corrida de regresión del orquestador sobre **Ragasa Industrias** (Guadalupe,
Nuevo León), en los dos modos de ficha. Solo lectura: no se escribió a Odoo, no
se llamó `enrich_by_duns`, no se gastó ningún crédito de Lusha.

## Lo que cambió respecto de la ficha anterior

Tres hallazgos, y el primero cambia la conclusión de negocio.

### 1. Ragasa no está en Odoo, pero FTS ya trabaja en su planta

`res.partner` con `name|email|website ilike 'ragasa'` devuelve **0 filas**. Leído
solo, eso dice "prospecto frío, sin historia".

Es falso. Outlook trae al menos cuatro hilos de 2025 sobre esa planta:

| Fecha | Asunto | Quién |
|---|---|---|
| 2025-09-11 | `RE: Planos Ragasa` | diego@fts.mx ↔ Vanessa Silva (Ecolab) |
| 2025-09-11 | `RE: SOLICITUD DE PROPUESTA PARA SISTEMA DE SUAVIZACION PLANTA RAGASA` | diego@fts.mx |
| 2025-09-12 | misma cadena, cotización **SO11134** | Vanessa.Silva@ecolab.com |
| 2025-10-09 | `Agua de desperdicio Ragasa`, **SO11126**, *Vendor 1179713 – NALCO* | diego@fts.mx |

Y el cliente sí existe en Odoo: **Nalco de México** (id 94), con
`customer_rank 159` — una de las cuentas grandes— más 13 contactos bajo ella,
entre ellos **Nerit Mcgregor** (`nerit.mcgregor@ecolab.com`, id 817), que es la
"ing. Nerit" de la cadena de suavización.

**La relación con Ragasa existe, pero es indirecta: entra por Nalco/Ecolab.** Una
búsqueda por razón social en Odoo nunca la habría encontrado. Es el mismo error
que ya invalidó el cruce del padrón por razón social, con otra cara: aquí la
planta no es el cliente, es **el sitio donde se instala lo que compra otro**.

### 2. Señal de compra abierta: cogeneración de energía y vapor

Búsqueda web dirigida: Ragasa anunció **633 mdp en energía**, una planta de
**cogeneración de energía y vapor** con un requerimiento de ~4.2 millones de m³
de gas natural al mes.

**Vapor es agua de calderas.** Es el ángulo técnico exacto de FTS, y no salió del
padrón ni de Odoo: salió de la búsqueda. Confirma la regla del modo señal —el
evento predice mejor que el tamaño.

### 3. Personas nuevas, de dos formatos distintos de invitación

Del corpus de LinkedIn en Outlook: un *"Técnico Electromecánico en Ragasa"*
(apellido Ochoa, **sin nombre completo** en el resumen) y **Enrique O. Perez
Salazar**, *"Coordinar proyectos, diseño de tuberías, materiales"*.

El segundo es el perfil que compra tubería y proyecto. El primero es el caso que
el diseño ya preveía: el formato *"esta esperando tu respuesta"* trae puesto y
empresa pero solo el nombre de pila o el apellido.

---

## La prueba que importa: los dos modos tienen que decir lo mismo

El punto de la regresión no es que la ficha traiga más datos. Es que **el modo
limpio y el de procedencia no se contradigan**. El caso decisivo de esta corrida:

> **¿Ragasa es cliente de FTS?**

| Modo | Qué dice |
|---|---|
| **Limpio** | "Sin historia comercial directa. Presencia de FTS en la planta a través de Nalco de México (Ecolab), cuenta activa." |
| **Procedencia** | `relacion_comercial = indirecta_via_nalco` · estado **`supuesto`** · fuentes: `odoo` (res.partner 94, contacto 817) + `outlook` (4 hilos, 2025) · raíz de ambas: **`fts_interno`** |

**Queda en `supuesto`, no en `verificado`, aunque dos fuentes coincidan** — porque
Odoo y Outlook comparten raíz. Es exactamente la regla escrita, aplicándose donde
duele: el dato *se siente* sólido (una cotización con folio y un contacto
nombrado), y aun así no sube. Para subirlo haría falta una raíz distinta: que
Ragasa o Ecolab lo publiquen, o un tercero.

Si el modo limpio dijera "cliente de FTS", estaría mintiendo. Dice
"presencia a través de", que es lo que el estado `supuesto` permite afirmar.

El segundo caso, el de la señal, sí sube:

| Campo | Estado | Por qué |
|---|---|---|
| `proyecto_cogeneracion_vapor` | **`verificado`** | `web_abierta` (nota de prensa) + el sitio de la empresa. **Dos raíces distintas.** |
| `patron_correo` de `ragasa.com.mx` | **`supuesto`** | Derivado, y `ck_patron_nunca_verificado` lo impide por diseño. |
| `duns` | **no se usó como llave** | Ragasa tiene 5 DUNS, uno en Jalisco. Identificador entre cortes y nada más. |

Nota aparte, medida de paso: los 14 contactos de Nalco en Odoo siguen
`nombre.apellido@ecolab.com` en 13 de 14 casos. Eso valida el patrón **de
ecolab.com**, no el de ragasa.com.mx. No se transfiere.

---

## Cobertura de fuentes de esta corrida

Cada fuente declarada, respondiera o no.

| Fuente | Estado | Detalle |
|---|---|---|
| Padrón DENUE | `respondio` | Ragasa en el padrón firme, corte `2026-05` |
| Odoo · lectura de negocio | `respondio` | **0 filas para Ragasa.** Cero ES una respuesta |
| Odoo · `autocomplete_by_name` (razón social canónica y DUNS) | `respondio` | Vía `res.partner`; sin alta de Ragasa, sin DUNS que traer |
| Outlook · historia de la cuenta | `respondio` | 4 hilos de 2025 sobre la planta |
| Outlook · corpus de invitaciones LinkedIn | `respondio` | 2 personas, una sin nombre completo |
| Búsqueda web · proyecto | `respondio` | 633 mdp, cogeneración |
| Búsqueda web · ángulo técnico | `respondio` | Vapor → agua de calderas |
| Derivación del patrón de correo | `respondio` | Candidato, nunca verificado |
| Lectura de artículos vía n8n · Vanguardia Industrial | `no_intentada` | **Pendiente.** Requiere el workflow de lectura, que no está construido |
| Lectura de artículos vía n8n · Somos Industria | `no_intentada` | idem |
| Lectura de artículos vía n8n · Solili | `no_intentada` | idem |
| Lectura de artículos vía n8n · Cluster Industrial | `no_intentada` | idem |
| Lectura de artículos vía n8n · México Industry | `no_intentada` | idem |
| Vibe (capa gratuita) | `omitida_por_costo` | Segunda opinión; no había contradicción que dirimir. Decidido por Claude, sin gasto |
| Lusha | `omitida_por_costo` | **Sin autorización de esta corrida.** Quedan 20 de 480 créditos |
| Google Places | `sin_acceso` | No hay llave |
| D&B directo | `sin_acceso` | Sin contrato |
| SIEM | `sin_acceso` | — |
| CAINTRA | `sin_acceso` | Sin credencial. *Nota: un correo de CAINTRA de 2025-10-17 en la bandeja menciona a RAGASA en una lista de socios. Es un hallazgo de Outlook, no de CAINTRA como fuente* |
| AMPIP | `sin_acceso` | — |

**Cinco filas en `no_intentada` y eso es un hueco declarado, no una casilla
verde.** El estado no existía en el catálogo: `fuentes.json` y la migración 013
sólo contemplan `respondio`, `no_aplicaba`, `fallo`, `omitida_por_costo` y
`sin_acceso`. Ninguno describe "la fuente existe, aplica, y todavía no hay con
qué preguntarle". Llamarla `sin_acceso` sería mentir —el acceso está medido y
funciona desde n8n— y llamarla `no_aplicaba` sería peor. **Queda anotado como
deuda del catálogo, no maquillado.**
