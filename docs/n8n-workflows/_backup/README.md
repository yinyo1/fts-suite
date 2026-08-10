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


-------------------------------------------------------------------------------
DOS TRAMPAS AL VERIFICAR UN SHA CONTRA UN NODO DE n8n
-------------------------------------------------------------------------------

Ambas producen un sha que no cuadra sin que haya drift real. Verificadas en el
despliegue del 2026-08-10 (PR #112).


1) CRLF en la copia de trabajo (Windows, core.autocrlf=true)

   Git convierte el archivo a CRLF al hacer checkout, asi que la copia de trabajo
   NUNCA cuadra contra n8n, que guarda LF. El blob commiteado si cuadra.

   MAL : sha256sum docs/n8n-workflows/<archivo>.js
   BIEN: git show origin/main:docs/n8n-workflows/<archivo>.js | sha256sum

   Caso real: el archivo de Code - MAIN dio 2ee919f7... en el working tree y
   6c8a1e43... en el blob. El segundo es el que coincide con n8n.


2) El editor de n8n RECORTA el salto de linea final al guardar

   Un archivo de texto normal termina en \n. Al pegarlo en un nodo Code y
   guardar, n8n descarta ese ultimo \n. El nodo queda con 1 byte menos que el
   archivo del repo y el sha256 difiere, aunque el contenido sea identico.

   Caso real (Code - buildEmail, 2026-08-10):
     blob en origin/main : 11857 bytes  0f9562b1d728c47c410c6124e4ddc214c72934d6049ee4256a18bac06a55cb25
     nodo en n8n         : 11856 bytes  812f2c571ad2e9e9ce63d70b6fe302d56b1b5bbba2437b8ba8aa851ed7e34dfe
     blob[:-1]           : 11856 bytes  812f2c571ad2e9e9ce63d70b6fe302d56b1b5bbba2437b8ba8aa851ed7e34dfe  <- cuadra

   Las 115 lineas de contenido eran identicas; la unica diferencia era la linea
   116, vacia, del final del archivo.

   Se decidio DEJARLO ASI y documentar la excepcion, en vez de quitar el salto
   final del archivo del repo. Al verificar, comparar tambien contra blob[:-1]
   antes de declarar drift.

   Nota: Code - MAIN cuadro exacto porque su archivo no termina en \n. La
   diferencia entre los dos archivos es solo como quedaron escritos, no algo
   sistematico de n8n.


REGLA: un sha que no cuadra no se asume ni se ignora. Se explica. Comparar linea
a linea antes de concluir que hay drift; en los dos casos de arriba el contenido
era identico y la diferencia estaba fuera del codigo.
