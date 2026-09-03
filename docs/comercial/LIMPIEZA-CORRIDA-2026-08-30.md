# Corrida de limpieza comercial — 30-ago-2026

Ejecución de los lotes L1–L4 autorizados en el issue #131, con el workflow
`comercial/limpieza-2026-08` (n8n `buJ1oxU7OpwVCxlk`, inactivo, disparado a mano).

**Resultado: 1,859 leads → 154 vivos.** 1,705 archivados, ninguno borrado.

---

## Conteos por etapa

De **12 etapas a 4**. Ninguna se borró: las fusionadas quedan vacías.

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
