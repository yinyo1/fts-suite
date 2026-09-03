# Acceso al módulo Comercial

**Un solo emisor de identidad: `auth/suite-login`** (workflow n8n `kLhyPxVSMbDRwxfC`,
Fase 0 del issue #136 — el mismo que usa RH). Login server-side, PBKDF2-SHA256 100k,
JWT HS256 de 8 h, usuarios en la Data Table `suite_usuarios` de n8n.

Dar de alta a una persona **no toca el repo ni Railway**: es un renglón en una tabla.

---

## Lo que este gate NO hace

**GitHub Pages es público.** El gate decide si la pantalla **se pinta**, no si el
archivo **se puede descargar**: cualquiera con la URL ve el HTML y el JS, con
contraseña o sin ella.

Lo que sí protege de verdad es que **cada webhook exija el token y verifique su
firma en el servidor**. Mientras el machote no tenga datos en servidor, el gate
sirve para saber **quién** entró —y que el input de la prueba sea atribuible—,
no para esconder nada. Conviene tenerlo claro antes de tratarlo como una pared.

---

## Dar de alta a alguien

**1 · Genera salt y hash** (en tu máquina, no aquí):

```bash
node scripts/generar-usuario-suite.js aldo.mendez
```

Pide la contraseña por teclado —nunca por argumento, que quedaría en el historial
del shell— e imprime el renglón en JSON. **La contraseña no aparece en la salida.**

**Sólo el username es obligatorio.** `nombre`, `scopes` y `empleado_id` se pueden
pasar también, pero conviene llenarlos al insertar: **PowerShell de Windows
destroza los acentos** al pasarlos a un programa nativo, y «Méndez» llegaría al
renglón como «MÃ©ndez». Si un dato no tiene que pasar por la línea de comandos,
que no pase.

En PowerShell, para varios de un jalón:

```powershell
cd <la carpeta del repo>
foreach ($u in @('aldo.mendez','francisco.montalvo','pablo.bayly')) {
  node scripts\generar-usuario-suite.js $u
}
```

**2 · Ese JSON se inserta como renglón** en la Data Table `suite_usuarios`
(`YWCP0KoVmgxX2RzL`). Se puede desde la UI de n8n o por MCP.

**3 · La contraseña temporal se la das a la persona por un canal aparte** — no por
el chat de Claude Code, no por un issue, no por el repo (CLAUDE.md §15 #4).

### Columnas

| columna | qué es |
|---|---|
| `username` | en minúsculas; el login lo normaliza |
| `nombre` | como se ve en la barra |
| `salt` · `hash` | los que imprime el generador |
| `scopes` | separados por coma. El machote pide `comercial:read` |
| `activo` | `false` da de baja sin borrar el renglón |
| `empleado_id` | el de `hr.employee` en Odoo, o vacío |
| `debe_cambiar_password` | ver el pendiente de abajo |

---

## ⚠️ El salt se interpreta como TEXTO, no como bytes

`auth/suite-login` hace `strBytes(saltStr)` sobre el valor de la columna: usa los
**32 caracteres del hex**, no los 16 bytes que ese hex representa.

Esto tumbó al generador anterior. Comprobado ejecutando el algoritmo real del
workflow contra `crypto.pbkdf2Sync` (2026-09-03), misma contraseña y mismo salt:

```
workflow (JS puro)           2fbf1d39fd529a38a63b9b644d3ad02f…
salt como TEXTO (utf8)       2fbf1d39fd529a38a63b9b644d3ad02f…   ← coincide
salt como BYTES (hex-decode) 26bf2b5fed1f09a6141636bde1ddd557…   ← no
```

`comercial/scripts/generar-hash.js` usaba la segunda forma. Un hash suyo se
habría guardado sin queja y el login habría dicho *"usuario o contraseña
incorrectos"* **para siempre, sin un solo error en ningún lado**. Por eso se
borró, y por eso `scripts/generar-usuario-suite.js` **corre el algoritmo del
workflow y se niega a imprimir si no coincide** con lo que él mismo produce.

Es el mismo modo de falla de CLAUDE.md §3 y §8: dos piezas que tienen que casar,
y ninguna de las dos avisa cuando dejan de casar.

---

## Lo que se retiró

- **`auth/comercial-login`** (`GhSt6pNUDhL0e0hx`) — segundo emisor de identidad
  para el mismo módulo, construido en la sesión 2, inactivo. Guardaba a los
  usuarios en una variable de entorno de Railway: cada alta era una variable más
  y un redeploy. **Archivado.** Dos fuentes de verdad sobre quién es quién es una
  carrera silenciosa esperando a pasar (CLAUDE.md §20 #4).
- `comercial/js/auth-com.js`, `comercial/scripts/generar-hash.js` y
  `comercial/scripts/n8n-auth-comercial-login.js` — sus piezas.

Lo que ese emisor tenía de más era `dndole` (el valor del selection de Odoo que
dice quién cotiza). Cuando el CRM lo necesite, entra como **columna nueva** en
`suite_usuarios`, no como un emisor aparte.

---

## Pendientes

- **Cambiar la contraseña no existe.** La columna `debe_cambiar_password` está en
  la tabla y el login la devuelve, pero **no hay pantalla ni workflow** para
  cambiarla. Hoy sólo se avisa una vez al entrar. Mientras eso no exista, la
  contraseña temporal es la definitiva — lo cual está bien para una prueba y no
  está bien para operar.
- **Ningún webhook exige todavía el token.** El machote no llama a ninguno, así
  que no hay hueco abierto hoy; pero el día que se conecte el almacén, validar el
  scope **en el servidor** es parte del mismo trabajo, no un extra.
- **FTSAuth sigue vivo** en RH y en el resto de la suite (`shared/auth-suite.js`,
  SHA-256 sin sal contra un JSON del repo público). Migrar eso es su propio
  frente; está diagnosticado en el issue #136 §2.
