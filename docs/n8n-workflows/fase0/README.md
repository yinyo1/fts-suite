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
