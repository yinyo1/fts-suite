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
| F5 pruebas de captura | pendiente | |
| F6 respaldos | pendiente | |
| F7 bandeja y vínculos | pendiente | |
| F8 motor derivados | pendiente | |
| F9 histórico | pendiente | |
| F10 propuestas y resumen | pendiente | |
| F11 retención dry-run | pendiente | |
| F12–F18 extra | pendiente | |

## Para retomar si se reinicia el contexto
- Leer esta tabla, `DECISIONES-NOCHE.md` y el último comentario de #328.
