# fts_po_radar

Detección y reenvío automático de órdenes de compra que llegan por correo al buzón de
`estebandelacruz@fts.mx`. Issue rector: **#142**.

---

## ⚠️ El corpus NO vive en este repositorio

**Este repo es público. Ningún corpus comercial se guarda aquí: ni CSV, ni PDF, ni correos, ni
extractos redactados.** Solo métricas agregadas y hallazgos.

Hasta la sesión 1 hubo tres CSV en `docs/po-radar/data/` (folios de clientes, formatos de folio y
casos de prueba del buzón). **Se eliminaron en la sesión 2, y la rama se reescribió con
`--force` para que tampoco queden en el historial de git.**

### Dónde vive el corpus ahora

| Qué | Dónde | Estado |
|---|---|---|
| Corpus de folios, formatos y casos etiquetados | Postgres `fts-suite-db` (Railway, proyecto `cheerful-comfort`), esquema **`po_radar`** | **Pendiente de carga** — ver §Bloqueo |
| Expediente comercial (leads, machote, BOM) | Mismo Postgres, esquema **`comercial`** | Pendiente (issue #127) |
| PDF de órdenes de compra | Odoo, `sale.order.x_studio_purchase_order_file` | Es la fuente original |
| Correos y adjuntos del snapshot de FASE B | SharePoint `ComercialFTS`, bajo `Corpus/{snapshot_id}/` | Pendiente (bloqueado, ver §Bloqueo) |

### Cómo se consulta

El Postgres **no tiene proxy TCP público**: solo se alcanza desde la red privada de Railway. La vía
de consulta es una credencial Postgres en n8n y un workflow, igual que cualquier otro acceso a datos
de la suite. No se expone al exterior y no se vuelve a bajar al repo.

### Cómo se regenera si hiciera falta

Los tres CSV eran **derivados**, no fuentes:

- **Folios y formatos** salen de Odoo con
  `sale.order` · `state = 'sale'` · `x_studio_purchase_order_number != false`, excluyendo los
  partners `520` (Galvaprime), `722` (Racing Cargo) y `7`/`749` (Mondelez padre). El porqué de esas
  exclusiones está en [`AUDITORIA-2026-08.md`](AUDITORIA-2026-08.md) §5.
- **Casos de prueba** salen del buzón de Esteban, que desde el 2026-08-31 sí es legible por
  `Mail.Read` (ver [`FASE-B-CORPUS-CORREO.md`](FASE-B-CORPUS-CORREO.md)).

---

## Documentos

| Archivo | Qué es |
|---|---|
| [`AUDITORIA-2026-08.md`](AUDITORIA-2026-08.md) | Sesión 0: estado real de n8n, Azure y Postgres, y el veredicto sobre el bloqueador de `Mail.Read` |
| [`SPEC-1.0.md`](SPEC-1.0.md) | El diseño, en revisión **1.1**. Su §0 lista qué cambió tras calibrar y con qué evidencia |
| [`FASE-A-CALIBRACION.md`](FASE-A-CALIBRACION.md) | Sesión 1: los 486 PDF reales abiertos y medidos |
| [`FASE-B-CORPUS-CORREO.md`](FASE-B-CORPUS-CORREO.md) | El corpus de correo: pipeline, set etiquetado y cómo se miden precisión y recall |
| [`ESQUEMA.sql`](ESQUEMA.sql) | El DDL de los esquemas `comercial` y `po_radar`, listo para correr. Solo estructura, cero datos |
| [`MVP-WORKFLOW.md`](MVP-WORKFLOW.md) | Sesión 3: el workflow construido, cómo se configura, qué se rompió al probarlo y la prueba en vivo |

## Estado

- **Sesión 0** (#143) — auditoría y spec.
- **Sesión 1** (#145) — FASE A calibrada sobre 486 documentos; SPEC a 1.1.
- **Sesión 2** — `Mail.Read` verificado funcionando; corpus fuera del repo; FASE B dimensionada y
  detenida por tamaño.
- **Sesión 3** — **MVP construido, probado contra correo real y activo.** Workflow
  `po/radar-detectar (MVP)` (`sQ5GYhQTq1UHDt6Y`), cada 15 minutos, reenviando desde `sales@fts.mx`.

**El MVP reenvía a `estebandelacruz@fts.mx`, no todavía a `newordersnotification@fts.mx`.** Es un
solo campo del nodo `Set - config`; se cambia cuando Esteban valide lo que le llega.

## Bloqueo abierto

Ninguno de los dos bloquea el MVP, que corre sin Postgres y sin SharePoint. Bloquean FASE B y la
bitácora persistente.

1. **Credencial Postgres en n8n** — el servicio `fts-suite-db` existe y corre, pero no hay credencial
   en n8n que apunte a él, y no se puede crear por API. Sin ella no se cargan los esquemas ni el corpus.
2. **`Sites.Selected` sobre `ComercialFTS`** — Graph responde `403 accessDenied`. Sin almacén no hay
   snapshot de correo, así que FASE B no puede arrancar aunque `Mail.Read` ya funcione.
