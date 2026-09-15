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

---

# CONSTRUIDO: `auth/verificar-scope` (2026-09-15)

```
workflow   auth/verificar-scope   QokDKd6rCqSNsP4u
estado     INACTIVO · sub-workflow · sin webhook propio · SOLO LECTURA
versiones  a83df861-…  esqueleto con marcador
           bf3acc33-…  la cripto real          <- la que quedó
```

3 nodos: `Llamado por un endpoint` (executeWorkflowTrigger, passthrough) →
`Set - secreto` (`$env.SUITE_JWT_SECRET`) → `Code - verificar`.

Recibe `{token, scope}`, devuelve `{ok, error, clase, actor, nombre, scopes, hoy}`.

## El scope viaja como DATO

Si estuviera hardcoded haría falta un sub-workflow por panel, que es el problema
otra vez. El llamador dice qué exige; este nodo no sabe nada de paneles. Y un
llamador que **se olvide** de mandarlo recibe `SCOPE_NO_PEDIDO` — **deniega por
omisión**, no abre con cualquier token.

## 15/15 en las pruebas, incluidos tres tokens FORJADOS

`probar-verificar-scope.js`, contra el `crypto` de Node, con `'x'.repeat(48)` de
secreto de prueba. El real no aparece por ningún lado.

```
  OK   token bueno, scope pedido OK      ok:true
  OK   MISMO sub-workflow, otro panel    ok:true          <- una pieza sirve a los dos
  OK   tiene un scope, pide OTRO         SCOPE_INSUFICIENTE
  OK   el llamador NO pide scope         SCOPE_NO_PEDIDO  <- deniega por omisión
  OK   scope vacío                       SCOPE_NO_PEDIDO
  OK   token SIN scopes (legacy)         SCOPE_INSUFICIENTE
  OK   token de Finanzas viejo           SCOPE_INSUFICIENTE
  OK   FORJADO: firma de otro secreto    FIRMA_INVALIDA
  OK   FORJADO: payload manipulado       FIRMA_INVALIDA
  OK   FORJADO: alg none                 FIRMA_INVALIDA
  OK   expirado                          TOKEN_EXPIRADO
  OK   malformado                        TOKEN_MALFORMADO
  OK   ausente                           TOKEN_AUSENTE
  OK   sin secreto en el entorno         SECRETO_NO_CONFIGURADO · clase servidor
  OK   NUNCA devuelve el secreto         el secreto no aparece en la respuesta
```

## ⚠️ Lo que NO está verificado, y hay que decirlo

**La transmisión de esta cripto al servidor NO se comparó byte a byte**, a
diferencia de los parches S4 y S5. El motivo es concreto: la verificación que uso
se apoya en que `get_workflow_versions_diff` **caiga a un archivo** cuando el
resultado es grande (S4: 59 KB, S5: 66 KB), porque entonces se puede hashear con
un script. Este workflow es chico (~9 KB de diff) y el resultado **volvió en
línea**, así que sólo se puede mirar — y mirar es exactamente lo que no acepto
para una criptografía.

Lo que **sí** está anclado:

```
origen local  Code-verificar-scope.js  8500 chars  sha256 3657ef9523e1ed32…
la cripto de fase0 dentro de él        3733 chars  sha256 3093cd1faa5b365a
  -> el prefijo del archivo nuevo ES, byte a byte, el de ../fase0/jwt-verify.js
```

Y el mecanismo de transmisión quedó **byte-verificado dos veces hoy** sobre
payloads mayores (31,828 y 33,040 caracteres, cero deriva). Eso hace la
corrupción improbable, **no imposible**.

**El modo de falla, si la hubiera, es ruidoso y diagnosticable:** una cripto
corrompida rechaza *todos* los tokens con `FIRMA_INVALIDA`. Así que la primera
llamada real lo dice. **La comprobación pendiente es una sola:** llamar al
sub-workflow con un token bueno y ver `ok:true`. No se hizo aquí porque exige
ejecutar contra `$env.SUITE_JWT_SECRET`, o sea contra la configuración de
producción.

## Lo que falta

1. **Publicar** `auth/verificar-scope` y hacer esa primera llamada de prueba.
2. **Construir `ops/semaforo`** llamándolo (nace ya migrado; no hereda ninguna
   copia de la cripto).
3. **Migrar los tres de producción** —`fin/rentabilidad`, `comercial/clientes`,
   `comercial/machotes-leer`— **uno por uno**, con su prueba de token forjado
   antes y después. Un endpoint que hoy funciona no gana nada con migrar el
   mismo día.
