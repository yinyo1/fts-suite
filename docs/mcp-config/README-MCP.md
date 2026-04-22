# MCP Setup — FTS Suite sprint 23-abril

Guía rápida para conectar los MCPs de n8n y Odoo a Claude Code antes del sprint. **5 minutos de setup, no bloqueante**: si no monta los MCPs, Claude igual funciona, pero con MCPs las iteraciones sobre workflows n8n y consultas a Odoo son 5-10x más rápidas.

## Qué obtienes con esto

- **n8n MCP** (`@czlonkowski/n8n-mcp`): listar/leer/editar/crear workflows, ver ejecuciones, ver nodos disponibles — sin salir de Claude Code.
- **Odoo MCP** (`@pantalytics/odoo-mcp-server`): consultas read-only (hr.employee, project.project, sale.order, hr.attendance) sin levantar XML-RPC manual.

## Guardrails del sprint (LEER ANTES DE CONECTAR)

| Guardrail | Por qué |
|---|---|
| **Odoo en modo READ-ONLY** durante el sprint | Evita que un error en un prompt meta o escriba asistencias reales. Scope inicial: `hr.employee`, `project.project`, `sale.order`, `hr.attendance` en modo **read**. |
| **n8n: workflows nuevos creados con `active:false`** | Cualquier workflow que Claude genere o modifique queda apagado hasta que lo revises y actives manualmente. |
| **Backup obligatorio** de workflows n8n antes de empezar | Ver `backup-n8n-workflows.md` — correr 1 comando al despertar. Si algo se rompe, restauras en 30s. |
| **No compartir la API key de Odoo en la terminal pública** | Usa variables de entorno o edita el JSON fuera del historial del shell. |

## Paso 1 — Instalar los MCPs globalmente

```bash
npm install -g @czlonkowski/n8n-mcp
npm install -g @pantalytics/odoo-mcp-server
```

Verificar:
```bash
which n8n-mcp
which odoo-mcp-server
```

Si `npm` prompts permisos, usa `sudo` solo si confías en tu cuenta local. En macOS/Linux con Homebrew node, no debería pedir sudo.

## Paso 2 — Generar las API keys

### n8n API key
1. Abre `https://primary-production-5c3c.up.railway.app`
2. Login como owner.
3. Settings → API → **Create API Key** → scope completo (nuevo sprint, necesitamos read+write de workflows).
4. Copia el key a un scratchpad temporal. **No la commitees nunca.**

### Odoo API key
1. `https://serviciosfts.odoo.com`
2. Login como admin FTS.
3. Settings → Users & Companies → Users → tu usuario → Tab **"Account Security"** → **New API Key**.
4. Descripción: `MCP sprint abril`. Scope: read-only para esta sesión (puedes crear otra con write si luego lo necesitas).
5. Copia el key. **Se muestra una sola vez.**

## Paso 3 — Editar la config de Claude Code

Ubicación del archivo de config (depende de la plataforma):

- **Claude Code CLI (macOS)**: `~/Library/Application Support/Claude/claude_desktop_config.json` (o `~/.config/claude/claude_desktop_config.json`)
- **Claude Code CLI (Linux)**: `~/.config/claude/claude_desktop_config.json`
- **Claude Code CLI (Windows)**: `%APPDATA%\Claude\claude_desktop_config.json`

Abre el archivo (si no existe, créalo con `{}` como contenido inicial). Fusiona con lo que ya tengas bajo la llave `mcpServers`. Usa como plantilla los archivos `n8n-mcp-config.json` y `odoo-mcp-config.json` de esta carpeta:

```json
{
  "mcpServers": {
    "n8n": {
      "command": "npx",
      "args": ["-y", "@czlonkowski/n8n-mcp"],
      "env": {
        "N8N_URL": "https://primary-production-5c3c.up.railway.app",
        "N8N_API_KEY": "PEGA_AQUI_TU_KEY_N8N"
      }
    },
    "odoo": {
      "command": "npx",
      "args": ["-y", "@pantalytics/odoo-mcp-server"],
      "env": {
        "ODOO_URL": "https://serviciosfts.odoo.com",
        "ODOO_DB": "serviciosfts",
        "ODOO_USERNAME": "PEGA_TU_USERNAME_ODOO",
        "ODOO_API_KEY": "PEGA_AQUI_TU_KEY_ODOO",
        "ODOO_READ_ONLY": "true",
        "ODOO_ALLOWED_MODELS": "hr.employee,hr.attendance,project.project,sale.order"
      }
    }
  }
}
```

Reemplaza los `PEGA_AQUI_...` y guarda.

## Paso 4 — Reiniciar Claude Code

1. Cierra completamente Claude Code.
2. Vuelve a abrir.
3. En el primer mensaje del sprint, ejecuta `/mcp` para verificar que ambos servers conecten.
4. Esperado: `n8n: connected` y `odoo: connected`.

Si uno falla, los logs típicos están en la misma carpeta que el config JSON (busca `mcp-logs/`).

## Paso 5 — Backup de workflows ANTES de tocar n8n

**Ejecutar `backup-n8n-workflows.md`** antes del primer prompt que modifique workflows. Es 1 comando, 10 segundos, archivado en el repo, te salva el día si algo se rompe.

## Qué hacer si falla algo

### MCP no conecta
1. Verificar que la API key es válida haciendo un curl manual:
   ```bash
   curl -H "X-N8N-API-KEY: $N8N_API_KEY" https://primary-production-5c3c.up.railway.app/api/v1/workflows?limit=1
   ```
   Si retorna 401, regenera la key.
2. Verificar sintaxis del JSON de config:
   ```bash
   cat ~/.config/claude/claude_desktop_config.json | python3 -m json.tool
   ```

### Claude pide escribir en Odoo pero debería ser read-only
Abre el config JSON y confirma que `ODOO_READ_ONLY: "true"`. Si Claude ignora el flag, indícaselo explícitamente: "recuerda que Odoo está en read-only este sprint".

### Un workflow n8n quedó activo por accidente
1. Login a n8n UI.
2. Workflow → toggle **Active** a OFF.
3. Si ya disparó ejecuciones no deseadas, ver sección Executions y borrar los runs erróneos.

## Desconectar los MCPs al terminar el sprint

Borra (o comenta) los bloques `n8n` y `odoo` del `mcpServers` en el config JSON y reinicia. Revoca las API keys en n8n/Odoo para cerrar el ciclo.

---

**Dudas durante el sprint:** revisa el [MCP docs](https://modelcontextprotocol.io) o simplemente descríbele a Claude el problema en prosa.
