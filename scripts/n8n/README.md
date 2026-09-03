# scripts/n8n

Scripts de edición de workflows n8n por el **API público** (método §17 quirk 2 de `CLAUDE.md`).

> ⚠️ **Desde 2026-08-30 esto es el camino ALTERNO, no el principal.** El servidor MCP nuevo
> (`n8n_FTS`) **sí edita workflows** y **preserva `active`** — ver `CLAUDE.md` §17 quirk 2.
> Claude puede aplicar el cambio solo. Estos scripts quedan para cuando el MCP no esté
> disponible, o cuando el edit sea tan grande que reescribir el `jsCode` completo por
> parámetro sea peor que transformarlo programáticamente.

Se corren en la **laptop de Esteban**, no en la sesión remota de Claude Code. Verificado
2026-08-30 en el contenedor: `curl` al API de n8n devuelve **error 56** (el proxy de salida
corta la conexión) y no existe `~/.claude.json` con `mcpServers`, o sea que ahí no hay llave.

Ninguno de estos scripts contiene secretos — la llave se lee en tiempo de ejecución desde
`~/.claude.json` y nunca se imprime.

---

## `transform-resolver-attid.js` — arreglo del resolver (issue #137)

Corrige el guard `limpiaTAG` de `incidencias/resolver` (`Oc2ceMHX2O0L0y2X`), que exige
`inc.attendance_id` — campo que las incidencias `auto_cierre_pendiente` no tienen (usan
`attendance_id_cerrado`). Por eso el TAG de disputa nunca se limpia para ese tipo: **0 de 64**.

### Requisitos de ambiente

**1 · La llave.** No hay que crear ninguna variable a mano: el bloque la lee en tiempo de
ejecución de `~/.claude.json`, del bloque del MCP de n8n, y **nunca la imprime**. Confirma
primero cómo se llama ese bloque en tu laptop:

```bash
node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync(process.env.HOME+'/.claude.json','utf8')).mcpServers))"
```

Si sale `n8n-mcp`, el bloque de abajo funciona tal cual. **Si sale otro nombre** (p.ej. `n8n_FTS`),
cambia esa cadena en la línea del `KEY=`. Y si no sale ninguno, saca una llave nueva en n8n:
**Settings → n8n API → Create an API key**, y úsala directo: `KEY='<la llave>'`.

**2 · El shell: Git Bash, no PowerShell.** El bloque es bash — usa `$(...)`, `&&` y comillas
simples de POSIX. En PowerShell no corre (falla en la primera línea). Abre **Git Bash** desde el
menú inicio, o `bash` desde la terminal de VS Code.

**3 · Node.** Ya está (`gh` y los scripts locales lo usan). Verifica con `node -v`.

### Encadenado completo

⚠️ Todo con `&&`, **nunca con saltos de línea**: si el transform aborta, el `curl` del PUT
no debe correr con un `put_body.json` viejo (§17 — ya pasó una vez).

```bash
cd ~/ruta/donde/quieras/trabajar

KEY=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME+'/.claude.json','utf8')).mcpServers['n8n-mcp'].env.N8N_API_KEY)")
BASE=https://primary-production-5c3c.up.railway.app/api/v1/workflows
ID=Oc2ceMHX2O0L0y2X
S=~/fts-suite/scripts/n8n/transform-resolver-attid.js

rm -f put_body.json cur.json rb.json && \
curl -s -H "X-N8N-API-KEY: $KEY" "$BASE/$ID" -o cur.json && \
node $S build && \
curl -s -X PUT -H "X-N8N-API-KEY: $KEY" -H "Content-Type: application/json" \
     --data-binary @put_body.json "$BASE/$ID" -o /dev/null && \
curl -s -H "X-N8N-API-KEY: $KEY" "$BASE/$ID" -o rb.json && \
node $S verify
```

### Qué esperar

`build` imprime el **sha256 del `jsCode` antes y después**, el delta de tamaño, y el estado
que debe conservarse. Aborta sin escribir nada si algún `find` no calza exactamente 1 vez.

`verify` imprime un checklist en claro y **sale con código 1** si algo no cuadra:

```
  ✓ sha256 del jsCode ........ coincide con el esperado
  ✓ el arreglo ............... attId con fallback presente en el server
  ✓ active ................... true
  ✓ triggerCount ............. 1
  ✓ settings.binaryMode ...... "separate"
  ✓ settings.callerPolicy .... "workflowsFromSameOwner"
  ✓ settings.timeSavedMode ... "fixed"
  ✓ settings.availableInMCP .. true
```

- **`active: false` → FALLA fuerte.** Reactivar a mano en la UI de inmediato.
- **`availableInMCP: true → false` → AVISO, no falla.** Es el único de los cuatro cuyo valor
  actual **no** es el default, así que es el que el PUT puede perder al reponerlos del lado
  del server. Solo afecta que Claude pueda leer el workflow; la producción sigue igual. Se
  recupera con el toggle de la UI.

Si sale cualquier FALLA: **pegarle la salida a Claude antes de tocar nada más.**

### Lo que esto NO prueba

Que el read-back esté limpio significa que el código en el server es el correcto — **no** que
el arreglo funcione. Por §9 (*una prueba de que algo no se rompió solo vale si el caso
ocurrió*), la prueba real es que Ana resuelva una `auto_cierre_pendiente` y el TAG quede
apagado en Odoo. Hay 7 pendientes; la verificación está agendada en el issue #137.
