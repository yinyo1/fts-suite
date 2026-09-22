# Corrida de limpieza comercial — 30-ago-2026

Ejecución de los lotes L1–L4 autorizados en el issue #131, con el workflow
`comercial/limpieza-2026-08` (n8n `buJ1oxU7OpwVCxlk`, inactivo, disparado a mano).

**Resultado: 1,859 leads → 154 vivos.** 1,705 archivados, ninguno borrado.

> ⚠️ **Dos decisiones de esta corrida se revirtieron el 4-sep-2026.** Los ganados
> volvieron a estar activos y *Qualified* volvió a ser etapa propia. Lo de abajo
> queda como el registro de lo que pasó el 30-ago; el estado vigente está en
> [Reversiones — 4-sep-2026](#reversiones--4-sep-2026), al final.

---

## Conteos por etapa

De **12 etapas a 4**. Ninguna se borró: las fusionadas quedan vacías.

> Vigente desde el 4-sep-2026: **5 etapas de pipeline + Ganado**. *Qualified* (21)
> volvió y *Proyecto Ganado* (8) volvió a activo. Ver las reversiones al final.

| Etapa | Antes | Después | Qué pasó |
|---|---:|---:|---|
| CANCELADO (9) | 1,173 | **0** | L1 — perdidos + archivados |
| Proyecto Ganado (8) | 530 | **0** | L3 — archivados (532 con los 2 que L2 fusionó) |
| Proyecto Ganado - Con PO (4) | 2 | **0** | L2 → fusionada en 8, luego archivada por L3 |
| Adiccionales Topo (20) | 4 | **0** | L2 → fusionada en 15 |
| Qualified (21) | 9 | **0** | L2 → fusionada en 15 |
| Pendiente Por Enviar (14) | 2 | **0** | L2 → fusionada en 15 |
| Cotizacion... (3) | 4 | **0** | L2 → fusionada en 5 |
| Cot Enviada Mdlz (12) | 16 | **0** | L2 → fusionada en 5 |
| Prospecto Lead (17) | 27 | **22** | −5 que L4B mandó a Revisar |
| Lead Calificado/Por cotizar (15) | 26 | **39** | +15 de L2, −2 que L4B mandó a Revisar |
| Cotizacion Enviada (5) | 32 | **49** | +20 de L2, −3 que L4B mandó a Revisar |
| Revisar (18) | 34 | **44** | +10 de L4B |
| **Total activos** | **1,859** | **154** | |

### Por qué Revisar subió 10 y no 12

L4B escribió 12 leads, pero **1554 y 1730 ya estaban en Revisar** antes de la corrida
(verificado contra el dump previo). Los otros 10 salieron de Prospecto (5), Cotización
Enviada (3) y Lead Calificado (2 — las que L2 acababa de mover desde *Pendiente Por
Enviar*). Los deltas −5/−3/−2 cuadran con el +10.

## Conteos por dándole (`x_studio_dndole`)

| Dándole | Antes (1,859) | Después (154) |
|---|---:|---:|
| Aldo Mendez | 239 | **48** |
| Montalvo | 91 | **26** |
| Esteban | 51 | **11** |
| Oscar | 1 | **1** |
| Ricardo | 1 | **0** |
| Angel | 164 | **0** |
| Yusti | 98 | **0** |
| Diego | 61 | **0** |
| Bethania | 8 | **0** |
| (sin valor) | 1,145 | **68** |

**Los cuatro valores de ex-FTS quedaron en cero sobre leads vivos.** Ese es el
guardarraíl que L5 necesitaba: ya se puede depurar el selector en Studio sin dejar
registros vivos con un valor huérfano.

Ricardo baja a 0 vivos porque su único lead cayó en L1 o L3. **No es motivo para
quitarlo del selector** — sigue siendo uno de los 5 usuarios de 1.0.

---

## Ejecuciones

| # | Lote | Registros | Inicio → fin (UTC) |
|---|---|---:|---|
| 81068 | L0 crear motivo | 1 | 17:17:21 → 17:17:22 |
| 81073 | L1 prueba | 5 | 17:23:13 → 17:23:18 |
| 81108 | L1 tanda 1 | 250 | 18:21:27 → 18:24:38 |
| 81109 | L1 resto | 918 | 18:24:59 → 18:36:22 |
| 81119 | L2 etapas | 37 | 18:40:57 → 18:41:26 |
| 81120 | L3 ganados | 532 | 18:43:51 → 18:50:23 |
| 81126 | L4A dándole | 38 | 18:52:48 → 18:53:17 |
| 81129 | L4B revisar | 12 | 18:59:38 → 18:59:50 |

Las 8 en `success`. (CST = UTC−6.)

---

## Lecciones de la corrida

**El `status` de `get_execution` va con retraso de decenas de minutos.** La ejecución
81108 cerró a las 18:24:38 y el API siguió reportando `running` catorce minutos después.
Si se pilotea la corrida por ese campo, se espera de más o —peor— se concluye que algo
se colgó. **La medida buena es el conteo en Odoo**, que es además la que importa: mide el
efecto, no el reporte del proceso.

**El nodo Odoo procesa por nodo, no por registro.** Primero corren los N updates y
después las N notas de chatter. A media corrida, el conteo de Odoo ya refleja todos los
updates mientras las notas siguen pendientes — no confundir "el conteo ya cuadra" con
"el lote terminó".

---

## Lo que queda pendiente

| Qué | Quién | Dónde |
|---|---|---|
| Etiquetas Topo Chico (4) y Mondelez (16) | Esteban, a mano | `L2-ETIQUETAS-PENDIENTES.md` |
| Depurar el selector "Dándole" | Esteban, en Studio | `L5-INSTRUCTIVO-STUDIO.md` |
| Desmarcar `availableInMCP` del workflow | Esteban, en la UI de n8n | — |
| L6 (moneda de SO) | detenido | `L6-HALLAZGO-MONEDA-2026-08-29.md` |

## Rollback

`ComercialFTS/Documentos compartidos/Respaldos-Limpieza-Comercial-2026-08`

- `rollback-estado-previo-leads-20260829.json` — los 1,859 leads agrupados por etapa y
  por dándole, con el invariante escrito: *estaban `active=true`; restaurar =
  `active:true` + `stage_id` del grupo + `dndole` del grupo + `lost_reason_id:false`*.
- `dump-pre-limpieza-so-usd-20260829.json.gz` — las 231 SO del universo de L6.

---

## Reversiones — 4-sep-2026

Dos decisiones del 30-ago se revirtieron. Ninguna toca los 1,185 de CANCELADO,
que se quedan archivados.

### R3 · Se desarchivan los 532 "Proyecto Ganado"

**Qué se revirtió.** El lote L3 archivó 532 leads en etapa *Proyecto Ganado*
(los 530 que ya estaban ahí más los 2 que L2 fusionó desde *Proyecto Ganado -
Con PO*). Vuelven a `active=true`, en la misma etapa.

**Por qué.**

1. **Se desviaba de la convención de Odoo:** lo ganado se queda activo, lo
   cancelado se archiva. Nosotros archivábamos ambos, con lo que el archivado
   dejó de significar "esto se canceló" y pasó a significar "esto no quiero
   verlo en la hoja".
2. **Los ganados son el histórico** que el asistente del machote
   ([#148](https://github.com/yinyo1/fts-suite/issues/148)) necesita consultar.
   Archivado los vuelve más difíciles de alcanzar: todo consumidor tiene que
   acordarse de pedir `active in [true, false]` — el mismo `active_test`
   implícito que ya mordió en Carga MO (§19 de `CLAUDE.md`).

**La regla que queda.** La etapa decide qué se ve; el archivado se reserva para
cancelados; **filtrar pipeline vivo es trabajo de la vista**, no del estado
global del registro. Queda escrita en el ROADMAP (§5.4).

**Cómo se ejecutó.** Por el mismo workflow `comercial/limpieza-2026-08`
(`buJ1oxU7OpwVCxlk`), con un lote nuevo **`R3`** que **reusa la misma lista
congelada** `L3.ids` del JSON pineado por SHA `5127bedd` — no re-deriva nada, y
la acción es la inversa exacta: `active=true`. No toca `stage_id`, ni
`x_studio_dndole`, ni `lost_reason_id`.

**Verificación previa (antes de escribir).** Los ids salieron del respaldo en
SharePoint (`rollback-estado-previo-leads-20260829.json`), no de una derivación
nueva: `por_etapa["8"]` = 530 ids **+** `por_etapa["4"]` = 2 ids (48 y 1398) =
**532**, idénticos id por id a la lista congelada. Contra Odoo, los 532 estaban
`active=false` en stage 8 — un solo grupo, sin sobrantes ni faltantes.

**Ejecución.** `87421`, manual, `success`, 00:09:12 → 00:15:55 UTC (6m43s).
532 desarchivados + 532 notas de chatter. Antes, un dry-run (`87408`) confirmó
532 ids planeados, una sola nota distinta y **solo tres claves por operación**
(`_ruta`, `lead_id`, `nota`) — o sea, ningún otro campo en el payload.

Nota de chatter en cada uno:

> `[reversion-2026-09] L3 los había archivado; se desarchivan porque lo ganado se`
> `queda activo en Odoo y el historial debe seguir consultable.`

### Qualified (21) vuelve como etapa propia

L2 la había fusionado en *Lead Calificado/Por cotizar* (15). Montalvo confirmó
que **tiene uso real de proceso**, así que vuelve. **Esteban ya había movido los
leads a mano** antes de esta corrida (`write_date` 2026-09-04 23:32–23:34 UTC =
17:32 CST): los 9 de la lista —1879, 2080, 2128, 2134, 2153, 2190, 2197, 2198,
2200— **más un décimo, el 2189** ("Enchaquetado de reactores quimicos"), que
venía de la etapa 15. CC no escribió nada aquí: solo verificó y reporta.

En Odoo *Qualified* tiene `sequence=3`, o sea va **después** de *Cotizacion
Enviada* (`sequence=2`), no antes.

### Conteos medidos contra Odoo

Medidos con `odoo_agrupar` sobre `crm.lead`, no leídos del reporte del workflow.
"Antes" = 2026-09-04 ~23:40 UTC, justo antes de escribir.

| Etapa | Activos antes | Activos después | Archivados antes | Archivados después |
|---|---:|---:|---:|---:|
| Prospecto Lead (17) | 23 | 23 | 0 | 0 |
| Lead Calificado/Por cotizar (15) | 34 | **35** | 0 | 0 |
| Cotizacion Enviada (5) | 54 | 54 | 2 | 2 |
| Qualified (21) | 10 | 10 | 0 | 0 |
| Proyecto Ganado (8) | 0 | **532** | 532 | **0** |
| Revisar (18) | 44 | 44 | 0 | 0 |
| CANCELADO (9) | 0 | 0 | 1,185 | 1,185 |
| **Total** | **165** | **698** | **1,719** | **1,187** |

Los archivados quedan en **1,187**: los 1,185 de CANCELADO más 2 sueltos en
*Cotizacion Enviada*. Es el número esperado.

**El +1 de la etapa 15 no es de esta corrida.** Es el lead **2224**
("Reubicación de Chillers entre Posiciones"), creado a las 23:56:37 UTC, en
medio de la ventana. Se anota para que el delta no quede sin explicar: R3 solo
tocó ids de la etapa 8.

**Estado de los 532 después** (read-back independiente): los 532 en un solo
grupo `stage_id=8, active=true`; **`lost_reason_id` vacío en los 532**;
`x_studio_dndole` intacto (29 Aldo · 40 Angel · 11 Diego · 4 Esteban · 26
Montalvo · 26 Yusti · 396 sin valor — los valores de ex-FTS siguen ahí porque L4
solo tocó los leads vivos, no los ganados).

Crudo de tres de ellos, incluidos los 2 que venían de la etapa 4:

```
id   name                                  active stage_id        dndole  lost_reason_id  write_date (UTC)
48   Tope de puerta Merik Cedis guadalupe  si     Proyecto Ganado                         2026-09-05 00:09:16
1398 5S in the Warehouse                   si     Proyecto Ganado  Yusti                  2026-09-05 00:11:47
2195 Suministro e instalación de injerto…   si     Proyecto Ganado                        2026-09-05 00:12:36
```

**Lo único no verificado contra Odoo: las notas de chatter.** El MCP de Odoo
tiene `mail.message` en denylist dura, así que no se pueden leer desde CC. La
evidencia es el reporte del workflow —el nodo `Odoo - Nota chatter` entregó
**532 items**, ejecución en `success`, sin error— que es el reporte del proceso,
no la medición del destino. Spot check para Esteban: abrir el lead 48 en Odoo y
ver la nota `[reversion-2026-09]` en el chatter.

### Cambio en el workflow

`comercial/limpieza-2026-08` pasó de 13 a 14 nodos. El diff se verificó
server-side (`get_workflow_versions_diff`) y son exactamente tres cosas:

- nodo nuevo `Odoo - R3 desarchivar` (`crm.lead` update, `active` = `={{ true }}`);
- `Code - Plan`: dos hunks — `'R3'` agregado a `LOTES` y la rama `R3`. El resto
  del código quedó byte a byte igual, incluidas las seis reglas del Switch;
- séptima salida del Switch para `R3`; el fallback `SinEscribir` pasó al índice 7.

Llave de reversa: versión `66d15ff6-5dbc-4962-8971-ce96893d8d61` (la del 30-ago),
restaurable con `restore_workflow_version`. El workflow sigue **inactivo y sin
versión publicada** — por eso R3 corrió en modo manual, igual que los lotes del
30-ago.
