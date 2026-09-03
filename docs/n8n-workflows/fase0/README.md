# Fase 0 · Verificación JWT con scopes (issue #136)

`jwt-verify.js` es el cuerpo del nodo Code que se inserta **justo después del Webhook**
en cada workflow protegido. JS puro: el sandbox de n8n no expone `require` ni `crypto`
(CLAUDE.md §15 convención 1).

## Estado

Cripto **validada contra `crypto` de Node**, no asumida:

- SHA-256: 5 casos (vacío, ascii, frase larga, UTF-8 con acentos y emoji, 1000 chars)
- HMAC-SHA256: 4 casos (clave corta, vacía, >64 bytes, con acentos)
- JWT: 9/9 — token válido, expirado, scope insuficiente, secreto equivocado,
  **payload manipulado**, malformado, ausente, y los dos casos de compatibilidad legacy.

Reproducir: `node docs/n8n-workflows/fase0/test-jwt.js`

## Contrato

    verifyJWT(token, secret, scopeRequerido)
      -> { ok:true,  actor, scopes, exp }
      -> { ok:false, error: TOKEN_AUSENTE | TOKEN_MALFORMADO | FIRMA_INVALIDA
                          | PAYLOAD_ILEGIBLE | TOKEN_EXPIRADO | SCOPE_INSUFICIENTE }

## Compatibilidad hacia atrás (regla §8 anti-trabón)

Un token de Finanzas emitido **antes** de esta fase no trae `scopes`. En vez de
rechazarlo, se le heredan `['finanzas:read','finanzas:write']`. Así el lado que valida
puede desplegarse ANTES que el que emite, sin trabar Finanzas — que es el orden seguro:
nunca el lado estricto primero.

Consecuencia deliberada: un token legacy **no** alcanza para `nomina:write` (probado).

---

## ⚠️ Corre el generador de hashes en Git Bash, NO en PowerShell

`scripts/local-ejemplo/generate-suite-hash.js` lee la contraseña **sin eco**, apagando
el eco del TTY con `setRawMode(true)`. En **PowerShell esa lectura no se comporta igual**
y la corrida puede fallar con «No coinciden» aunque la contraseña se haya tecleado bien
las dos veces.

Reportado en vivo el 2026-08-31 (alta de Ana y Magaly): la primera corrida en PowerShell
falló sin error de tecleo; la segunda pasó escribiendo despacio y **sin usar backspace**.

**Es un fallo del lado seguro** — aborta y no genera nada — pero desconcierta, y el
"arreglo" intuitivo (teclear despacio) no es el arreglo: es **cambiar de shell**.

```bash
# Git Bash, desde la raiz del repo
node scripts/local-ejemplo/generate-suite-hash.js <username> "<scope1,scope2>"
```

Si por lo que sea hay que correrlo en PowerShell: teclear sin backspace y, si dice
«No coinciden» dos veces seguidas, es el shell, no la contraseña.

**Por qué importa más de lo que parece:** el backspace en un prompt sin eco que no
maneja bien el `^?` mete un carácter invisible en la contraseña. El hash se genera con
ese carácter incluido, y después **el login nunca coincide** — con la contraseña
"correcta" fallando para siempre y sin ninguna pista de por qué. En Git Bash el
manejo de `^?` está verificado; en PowerShell no.

## PBKDF2 y firma — `pbkdf2-sign.js`

Completa lo que faltaba para el login: verificar la contraseña contra `{salt, hash}` y
firmar el JWT. Mismo criterio que el resto: JS puro, sin `require` ni `crypto`.

```
node docs/n8n-workflows/fase0/test-pbkdf2.js     # 19/19
```

Validado contra **dos oráculos independientes**: los vectores estándar publicados de
PBKDF2-HMAC-SHA256 (c=1, c=2, c=4096) y `crypto` de Node. Coincidir solo con Node
probaría que reproduzco a Node; los vectores prueban que ambos hacen el algoritmo bueno.

**Rendimiento medido: 621 ms** para los parámetros reales (100k iteraciones, 32 bytes).
Aceptable para un login.

⚠️ **El salt se usa como STRING HEX, no como bytes decodificados** — porque así lo pasa
`crypto.pbkdf2Sync` en el generador. Si alguien "arregla" esto decodificando el hex,
**todos los hashes existentes dejan de validar en silencio**.
