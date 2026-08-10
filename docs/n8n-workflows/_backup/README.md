Respaldo del jsCode VIVO de ops/watchdog-semaforo (29eaGe2wkS98lRMU) inmediatamente ANTES de
aplicar la recalibracion v1.2 (PR #112). Este es el punto de rollback.

Lectura en vivo por MCP: updatedAt 2026-08-09T23:12:49.704Z | active true | 29 nodos.
Verificado que data.nodes y data.activeVersion.nodes coincidian (la version publicada era la misma).

  2026-08-09-buildemail-PRE-v12.js   nodo 'Code - buildEmail'   9473 bytes
     sha256 4c41682572c036602f8f23d62ac168538f489821be549fb7c711f65b67262d17

  2026-08-09-main-PRE-v12.js         nodo 'Code - MAIN'         6747 bytes
     sha256 6c8a1e43ac9340789ac65063a6508e066dbf7bec672e0fd06873cdb3f9ab813b

Los sha256 son sobre el contenido con finales de linea LF, tal como viaja en n8n.
OJO en Windows: verificar con 'git show <ref>:<path>', NO contra la copia de trabajo
(core.autocrlf=true la convierte a CRLF y el sha no cuadra).

Para revertir: pegar cada archivo en su nodo desde la UI de n8n y confirmar active=true.
