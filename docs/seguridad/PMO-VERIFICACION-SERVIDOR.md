# PMO · la verificación pasa al servidor (#486)

**El problema.** `pmo/index.html` traía en claro el secreto HMAC que firma las llamadas a
`pmo/chat-apply` (`G9mo4xkJKpbPDaT4`) y `pmo/chat-direct` (`jnegpT9jEQrhR3hI`), en las líneas 999 y 1687
de `main` `48a7403`. Era el mismo valor en las dos líneas. Los dos workflows **escriben en este repo**
(hacen PUT a `pmo/index.html` por la API de GitHub), y `chat-apply` además gasta tokens de Anthropic.
Como el repo es público, cualquiera que lo lea puede firmar.

**El arreglo.** Usamos el patrón de Comercial y Finanzas:
- El navegador manda en el body el **token de sesión de la suite** (`SuiteAuth.getToken()`, de `shared/auth-jwt.js`).
- El workflow lo verifica contra `$env.SUITE_JWT_SECRET` y exige el scope **`pmo:write`**.
- El `userId` sale del token, no del body.
- En el cliente no queda ningún secreto.

## Lo que hay en el repo

| archivo | qué es |
|---|---|
| `docs/n8n-workflows/pmo-verificar-token/logica.js` | Lógica del nodo nuevo `Code - Verificar token`. Va en `try/catch` total (§9) y devuelve un objeto nuevo. |
| `docs/n8n-workflows/pmo-verificar-token/construir.js` | Arma el `jsCode`: la cripto JWT de `fin-bancos-data/code/cripto_jwt.js` más la lógica. Recibe `tolerante\|estricto` y `chat-apply\|chat-direct`. |
| `docs/n8n-workflows/pmo-verificar-token/prueba.js` | 11 casos con un secreto de prueba. Cubre: legado intacto, token válido, `userId` del token, firma ajena, vencido, sin scope, malformado, sin secreto, el secreto no sale, y el modo estricto. |
| `docs/seguridad/pmo-aplicar-frontend.js` | Aplica el cambio al HTML. Lo encuentra **por forma**, no por diff, porque las líneas que quita contienen el secreto. |
| `tests/seguridad/pmo-token.js` | Regresión de la página: 10 casos. **Falla contra `main` a propósito** hasta que se aplique el script. |

## Bloqueo de hoy

Los dos workflows tienen **«Available in MCP» apagado** (`availableInMCP:false`), así que no se pueden leer
ni editar por MCP. **Esteban:** prendan esa opción en los dos (tarjeta del workflow → Settings).
No es una credencial ni cambia lo que corre. Mientras siga apagada, el orden de abajo **no puede
empezar**, y el frontend **no se toca**. Ir primero con el frontend dejaría el chat del PMO trabado,
que es la regla anti-trabón de §8.

## Orden (cada paso con su read-back y su reversa escrita ANTES de ejecutarlo)

### 0 · Preparar (lectura, sin escribir nada)
1. Hacer `get_workflow_details` de los dos workflows y `get_workflow_history` de cada uno. Anotar
   `versionId` y `activeVersionId`, que son **la llave de reversa**.
   - Si en alguno `versionId != activeVersionId`, **parar**: hay un borrador sin publicar (§17 2b), y
     publicar lo arrastraría. Hay que decidir qué hacer con él antes de seguir.
2. Leer la forma de la salida de éxito del validador de `chat-direct`, porque no está exportada al repo.
   Luego completar la rama `chat-direct` de `logica.js` (hoy devuelve `FLUJO_SIN_FORMA`) y agregar sus casos a `prueba.js`.
3. Confirmar con #485 que el scope `pmo:write` exista en `suite_usuarios` para quien usa el PMO.
   **Esta sesión no toca usuarios ni roles.** Sin el scope, el modo estricto deja a todos fuera.

### 1 · Servidor TOLERANTE (en cada uno de los dos workflows)
Con `update_workflow` (operaciones de nodo; el nodo legado `Code - Validar auth` **no se toca**):
- `addNode` **`Set - secreto suite`** (Set, solo el campo `secret` = `={{ $env.SUITE_JWT_SECRET }}`, sin incluir los demás campos).
- `addNode` **`Code - Verificar token`** con `jsCode` = salida de `node construir.js tolerante chat-apply`
  (o `chat-direct`).
- `addNode` **`IF - ¿legado?`** (`typeValidation: loose`, condición `{{ $json._legado }}` es `true`).
- Conexiones:
  `Webhook → Set - secreto suite → Code - Verificar token → IF - ¿legado?`.
  La rama true va a `Code - Validar auth`, que ya existe; la rama false va a `IF - Auth Error?`, que ya existe.
  Hay que quitar la conexión `Webhook → Code - Validar auth`.
- `publish_workflow` con el `versionId` del borrador.
- **Read-back:** `active:true` **y** `versionId == activeVersionId` **y** `sameAsDraft:true`, en los dos workflows (§3).

**Prueba en vivo:** la página **actual** (que firma con HMAC) tiene que seguir funcionando igual, por el
camino legado. Una llamada con token sin `pmo:write` tiene que dar 403. Leer las ejecuciones **solo de los
nodos de lógica**, nunca del `Set - secreto suite` (§9).

**Reversa:** `restore_workflow_version` al `activeVersionId` anotado en el paso 0, y read-back.

### 2 · Frontend
- `node docs/seguridad/pmo-aplicar-frontend.js`, luego `node tests/seguridad/pmo-token.js` (10/10), luego capturas a 380, 760, 900 y 1280.
- Push. Después verificar en Pages con el sha del despliegue (§9): el HTML servido no contiene la cadena de 64 hex.
- **Reversa:** `git revert` del commit. El servidor tolerante sigue aceptando el HMAC, así que no se traba nada.

### 3 · Servidor ESTRICTO
- `setNodeParameter /jsCode` en `Code - Verificar token` con la salida de `construir.js estricto …`, luego publish y read-back.
- Con eso el HMAC queda muerto: el valor filtrado ya no abre nada.
- **Reversa:** `restore_workflow_version` a la versión tolerante.
- (Después y opcional) borrar el nodo `Code - Validar auth`, que es el único lugar donde vive el valor viejo.

## Rotación (Esteban)

- Hoy el secreto HMAC **no vive en Railway**. Vive escrito dentro de los nodos Code de los dos workflows
  (`docs/n8n-workflows/pmo-chat-apply-code-code-validar-auth.js:4`), y por eso no se rota «cambiando una variable».
- La rotación de verdad es el **paso 3**: el servidor deja de aceptar HMAC, y el valor filtrado no sirve para nada.
- El secreto que protege el camino nuevo es `SUITE_JWT_SECRET`, que **ya está en Railway**, nunca estuvo en el repo y no se filtró.

**Si Esteban quiere matar el valor filtrado HOY,** antes de que exista el camino nuevo:
- Hay que reemplazar el literal del nodo por una variable nueva de Railway (`PMO_HMAC_LEGADO`, leída por un `Set`).
  Esteban la crea con un valor nuevo en Railway → Variables del servicio `Primary` → redeploy.
- **Costo:** el chat y la edición directa del PMO dejan de funcionar hasta que salga el frontend con token,
  porque la página publicada firma con el valor viejo.
- Mi recomendación es no hacerlo así y llegar al paso 3, que mata el valor sin dejar el PMO caído.
- **Lo que sí conviene hacer YA:** revisar en `Settings → Usage` de Anthropic y en el historial de
  `pmo/index.html` si hay commits o consumo que nadie del equipo reconozca.
