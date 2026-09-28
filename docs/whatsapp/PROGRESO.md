# Memoria FTS — Progreso de la sesión nocturna (28-sep-2026)

Rama: `claude/whatsapp-memoria-noche` (hija de `claude/whatsapp-auditoria-arquitectura-6pqe5f`). Nunca main.
Inicio: 2026-09-28 07:08 UTC (01:08 CST). Límite: 06:00 CST.

| fase | estado | nota |
|---|---|---|
| F0 auditoría de lo que cambió | hecho | db-migrate no sirve tal cual (N1); verificar-scope y alerta-errores inactivos |
| F1 fundación en la base | **hecho, en vivo** | `memoria_0001` aplicada con read-back (ejecución n8n 116319) |
| F2 almacenamiento | **hecho, en vivo** | buckets `memoria-archivos` y `memoria-respaldos` (ams) |
| F3 receptor | desplegado; **sin base** | `memoria-receptor` corre (config completa); no puede entrar a la base hasta que el mantenimiento ponga la contraseña del rol (N5) |
| F4 pasarela | **preparada (staged)** | Evolution v2.3.7 lista en Railway, falta aplicar el cambio (N5) |
| F5 pruebas de captura | **local 13/13**; en vivo espera N5 | autoprueba embebida en el receptor (`AUTOPRUEBA=1`); VINCULAR-MANANA paso 3 |
| F6 respaldos | **script probado en local** (dump + restauración, 16 tablas, 0 diferencias); servicio preparado sin aplicar (N5) | señales `respaldo_ultimo` / `restauracion_ultima` en alerta hasta que corra |
| F7 bandeja y vínculos | **hecho, en vivo** | `memoria_0002`; `memoria/canales` (scope `memoria:admin`, 401 probado), `memoria/canales-manual`, `whatsapp/bandeja/` |
| F8 motor derivados | **hecho, en vivo (simulado)** | `memoria_0003`; `memoria/motor-derivados` con proveedor enchufable; re-proceso sin duplicar probado en vivo |
| F9 histórico | **hecho (parser)** | `whatsapp/historico/parser.ts`, 6/6 pruebas Android+iOS sintéticas; sin carga real |
| F10 propuestas y resumen | **hecho, en vivo** | propuesta sin citas rechazada, corregida guarda diferencia, D11 publicable sólo tras aprobación |
| F11 retención dry-run | **hecho, en vivo** | `memoria/retencion-simulacro`; foto de 13 meses BLOQUEADO (sin copia fría), acta NO_MOVER |
| F12 tickets | **hecho, en vivo (simulado)** | `memoria/motor-tickets` |
| F13 requis | **hecho, en vivo (simulado)** | `memoria/motor-requis` |
| F14 alertas | **hecho, en vivo (simulado)** | `memoria/motor-alertas` |
| F15 cotizador | **estructura** | `precio_observado`, `so_resultado`, vistas; CONTRATOS §1 |
| F16 watchdog | **hecho** | `v_senales_watchdog`, `api_senales`; CONTRATOS §2 |
| F17 capacidad n8n | **documento** | CAPACIDAD-N8N.md (hallazgo: variables que le faltan al Worker) |
| F18 prototipo | **hecho** | docs/whatsapp/prototipo/index.html, revisado a 380/760/900/1280 |

## Para retomar si se reinicia el contexto
- Leer esta tabla, `DECISIONES-NOCHE.md` y el último comentario de #328.
