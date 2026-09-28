# fts-bancos · workflows de n8n (issue #331)

Sin JSON exportado (regla del repo: los workflows viven en n8n). Aquí sólo qué hace cada uno,
sus disparadores y sus salvaguardas. Todo acceso a OneDrive y correo es por la credencial de
Graph de n8n (app n8n-mail-sender); el remitente siempre es `sales@`. El procesador se llama por
la red privada de Railway (`http://fts-bancos.railway.internal:8080`), sin dominio público.

| workflow | id | estado | disparo (America/Monterrey) |
|---|---|---|---|
| `fts_bancos_procesa` (B) | `714mDJoezup20Np3` | activo | cada 30 min 7:00–19:30 y 20:00; 23:00, 2:00, 5:00; regenerar 20:40; resumen viernes 18:05 |
| `fts_bancos_solicitud` (A) | `ktKYVvYiaoR2ii7C` | activo | mar 29-sep-2026 9:00 (primer envío), luego lunes 9:00 y día 3 9:00 |
| `fts_bancos_cotejo` (C) | `wLyoRQ3vgTrZhKKW` | activo | diario 21:10 |
| `fts_bancos_inventario` (D) | `QBt8CXPOWMjSV7Pe` | manual | Fase 3: recorre carpetas viejas y copia lo válido |
| `fts_bancos_compartir` (E) | `CObf7IHSdsAO3pPT` | manual | una vez: lectura en la raíz y edición en el buzón para el equipo |
| `bancos/db-migrate` | `iiw7YY1FiW5vz74W` | manual, `dry_run=true` | migraciones `bancos_NNNN` |

## B · fts_bancos_procesa
1. Abre una corrida en el procesador. Lee el buzón (metadatos + hijos). Crea `Procesados` y `Rechazados` si faltan.
2. **Graph caído** (403/401/5xx): cierra la corrida con `graph_ok=false` (no toca huecos) y avisa a Esteban **una vez al día**.
3. **Buzón vacío:** cierra la corrida con `graph_ok=true` (sirve de prueba de vida para A).
4. Por archivo (lotes de 1, máx. 25 por corrida, 60 MB): descarga → `/procesar-raw` → manifiesto.
5. Cierre: pares de traspasos, V3, huecos. Acciones: copia canónica (`conflictBehavior=fail`: nunca sobrescribe), pieza rechazada + `.motivo.txt` en `Rechazados`, **mueve** el original a `Procesados`/`Rechazados` (nunca borra).
6. Si algo se rechazó, no cuadró o traía un aviso (p. ej. nombre de mes equivocado): **un** correo a Gerardo con CC a Erick y Esteban, con archivo, qué pasó y qué hacer. Si todo cuadra, no hay correo.
7. Regenera LEEME, base maestra XLSX/CSV y diccionario. El LEEME escrito a mano se respalda una sola vez como `… (version manual original).md` y **sólo** se sobrescribe si ese respaldo existe.

## A · fts_bancos_solicitud
Lee `GET /huecos`. Sólo escribe a Gerardo si hubo una lectura completa del buzón en las últimas 26 h (`listo=true`); si no, avisa a Esteban que no se envió. Si no falta nada, no envía. Una vez por día aunque coincidan lunes y día 3. Marca los huecos solicitados.

## C · fts_bancos_cotejo
Si hay estados validados, lee de Odoo (nodo Odoo, credencial `Odoo FTS`, **solo lectura**) los apuntes de banco (`asset_cash`, posted, company 1) de los journals 8, 96, 75, 74, 61 desde 2024; USD en `amount_currency`. `POST /cotejo` → HTML a `02 Base maestra de transacciones/Reportes/` (vigente + copia fechada).

## D · fts_bancos_inventario (Fase 3)
Fuentes: OneDrive de Esteban (`1.- Finanzas/…/Estados de cuenta Servicios FTS SA de CV`, `Documents/Downloads`), sitio FinanzasFTS (`BBVA2019`) y sitio MKT_FTS (`2026/Des/Compu/Antes de 2026`). Recorre hasta 6 niveles con paginación, manda PDF/ZIP/CSV/XLSX ≤ 40 MB al procesador con `solo_estados=1` (lo que no es estado de cuenta no se guarda) y **copia** lo válido a su carpeta canónica. El original no se toca.

## Pendientes de Esteban
- Dar `Files.ReadWrite.All` y `Sites.Read.All` (aplicación) + consentimiento a la app n8n-mail-sender.
- "Available in MCP": los seis quedaron con `availableInMCP: true` al crearse por MCP; si se quiere quitar, es en la tarjeta del workflow.
- Crear `BANCOS_HMAC_SECRET` en Railway (servicio `fts-bancos`) si se quiere firma además de la red privada.
