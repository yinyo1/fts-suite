# ¿Se puede extraer la validación del JWT a un sub-workflow, sin retipear la cripto?

Issue #240, punto 3. **Sí se puede. Y además ya no hace falta «no retipear»:
ahora la transmisión se puede verificar byte a byte.**

## Corrección a lo que reporté ayer

Dije que no podía crear el endpoint porque transmitir la cripto por MCP era
retipearla, **y que no tenía forma de comprobar que no se hubiera movido un
carácter**. La primera mitad es cierta. **La segunda ya no**, y lo sé porque hoy
lo hice y lo medí.

Al aplicar el parche S4 (31,828 caracteres por `setNodeParameter`),
`get_workflow_versions_diff` devolvió un resultado tan grande que **el harness lo
guardó en un archivo** en vez de imprimirlo. Ese archivo trae el `__old` y el
`__new` completos, así que se pueden comparar **con un script, no con la vista**:

```
BASE local    25798  sha256 6d0798e5444abd36
__old server  25797  sha256 da011f174ec6395d   IGUAL   (n8n quita el \n final)
S4 local      31829  sha256 b09307eb4b655c42
__new server  31828  sha256 e7f4f67762a68d94   IGUAL
hunks servidor viejo -> servidor nuevo: 9      (exactamente los 9 esperados)
```

Y más: el `__new` del servidor se extrajo a un archivo, se le pasó `node --check`
y se corrió por el arnés local con datos reales. **La copia que quedó en n8n
produce los dos correos correctos.**

O sea que el modo de falla que me frenó —una firma corrompida en silencio que se
disfraza de sesión vencida— **es detectable antes de publicar**. La receta:

1. Crear el workflow con un `jsCode` **mínimo** de marcador.
2. `setNodeParameter` con la cripto real.
3. `get_workflow_versions_diff` v1 → v2; el resultado cae a archivo.
4. Comparar `__new` contra el archivo local **con sha256**, no con los ojos.
5. Recién entonces, publicar.

El paso 1 existe para que haya dos versiones que diferenciar: un workflow recién
creado tiene una sola y no hay contra qué comparar.

## Pero la mejor razón para el sub-workflow no es ésa

Hoy la misma criptografía vive **cuatro veces**: `comercial/clientes`,
`fin/rentabilidad`, `comercial/machotes-leer` y la copia que preparé para
`ops/semaforo`. Son **3,735 caracteres** de SHA-256 y HMAC por copia.

Lo que de verdad duele no es el tamaño, es esto: **`SUITE_JWT_SECRET` se
materializa en un nodo `Set` en cada uno de esos workflows.** Cada copia es una
superficie más donde el secreto puede acabar en un payload de error — que es
exactamente lo que pasó el 8-sep (ejecución `90281`) y costó una rotación.

Un solo `auth/verificar-scope` deja **un** lugar donde vive el secreto, **uno**
donde puede estar mal la cripto, y **uno** que arreglar el día que haya que rotar
el algoritmo o añadir un claim.

## La forma propuesta

```
auth/verificar-scope  (NUEVO, sub-workflow, sin webhook propio)
  Execute Workflow Trigger  (passthrough: recibe { token, scope })
    → Set - secreto         ($env.SUITE_JWT_SECRET)   <- el UNICO sitio
    → Code - verificar      (la cripto, una sola copia, todo en try/catch)
    → devuelve { ok, error, clase, actor, nombre, scopes }
```

Y cada endpoint se queda con:

```
Webhook → Execute Sub-workflow (auth/verificar-scope, waitForSubWorkflow)
        → IF ok? → su motor → su respuesta
                 → Respond   (el cuerpo ya trae error y clase)
```

El endpoint pierde su `Set - secreto` y sus 3,735 caracteres de cripto. El scope
que exige viaja como dato (`{ scope: 'semaforo:read' }`), así que el sub-workflow
no sabe nada de paneles.

### Lo que hay que comprobar antes de darlo por bueno

1. **Que `callerPolicy` lo permita.** `ops/semaforo-motor` ya se llama así desde
   `ops/watchdog-semaforo`, con `workflowsFromSameOwner`, y funciona — mismo dueño.
2. **Que el token no acabe en el payload de error del padre.** El nodo
   `Execute Workflow` del padre recibe `{token, scope}` como entrada; si el
   sub-workflow lanza, esa entrada puede viajar en el error. **El token no es el
   secreto de firma**, así que el daño es menor, pero la regla sigue siendo que
   el sub-workflow **no lance nunca** y devuelva el fallo como dato. Ya está
   escrito así.
3. **Que el sub-workflow no pueda devolver `ok:true` por omisión.** Si el
   `Execute Workflow` falla y el padre tiene `onError: continueRegularOutput`, el
   `IF - Token valido?` vería un objeto sin `ok` → `false` → deniega. **Falla
   cerrado**, que es el lado correcto. Hay que comprobarlo, no suponerlo.

## Coste y orden

- Crear `auth/verificar-scope` (nuevo, inactivo): **autorizado**, no toca nada.
- Migrar `ops/semaforo` (aún no existe): gratis, nace ya migrado.
- Migrar `fin/rentabilidad`, `comercial/clientes`, `machotes-leer`: **son
  producción, y son tres contratos vivos**. Eso es propón-y-espera, uno por uno,
  con su prueba de token forjado antes y después.

**Recomendación: los dos primeros ahora; los tres de producción, uno por uno y
sin prisa.** Un endpoint que hoy funciona no gana nada con migrar el mismo día.
