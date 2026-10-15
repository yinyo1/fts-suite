# MFA por niveles: diseño (nada se activa en esta fase)

**Estado:** diseño. No se activa nada y no se tocan pantallas ni workflows.
**Fuentes:** todas verificadas el 2026-10-15 en la fuente oficial (lista en §8). La evaluación de Microsoft Entra ID se hizo **sólo con documentación pública** de learn.microsoft.com; no se usó ningún conector de Microsoft 365.

## 1 · La propuesta de Esteban, contra NIST, OWASP y FIDO

| Nivel | Propuesta | Equivale a (NIST SP 800-63B-4, jul-2025) | Veredicto |
|---|---|---|---|
| **1** · todos, su menú normal | contraseña larga | **AAL1** | ✅ Con contraseña como único factor, el mínimo es **15 caracteres**, se permiten 64 o más, sin reglas de composición, con lista de bloqueo y sin vencimiento periódico (§3.1.1.2). Reautenticación cada 30 días como máximo (SHOULD, §2.1.3). |
| **2** · Finanzas lectura, Nómina, costos comerciales | contraseña + TOTP en app | **AAL2** | ✅ TOTP califica para AAL2 (§2.2.1). ⚠️ Dos matices: (a) **TOTP no resiste phishing** (§3.2.5); (b) **en AAL2 el verificador SHALL *ofrecer* al menos una opción resistente a phishing** (§2.2.2). O sea: TOTP como mínimo, y **una llave FIDO2/passkey como opción** también para el nivel 2. Reautenticación: **24 h** total y **1 h** de inactividad (SHOULD, §2.2.3). **No son 12 h.** |
| **3** · Esteban, Erick, Gerardo, `suite:master`, `usuarios:admin`, Bancos y escrituras financieras a Odoo | contraseña + llave física FIDO2/WebAuthn | **AAL3** | ✅ AAL3 pide un autenticador criptográfico con **llave no exportable, aislada en hardware**, resistente a phishing (§2.3). **Las passkeys sincronizables no valen para AAL3.** Llaves físicas sí. Reautenticación: **12 h** total (**SHALL**) y **15 min** de inactividad (SHOULD), repitiendo el login completo (§2.3.3). |
| **Step-up** | volver a pedir el factor en acciones delicadas | ASVS 5.0 **7.5.1** (reautenticación completa antes de cambiar factores o datos de recuperación) y **7.5.3** (L3, operaciones muy sensibles); OWASP MFA CS («require reauthentication with an existing enrolled factor before allowing changes») | ✅ |
| **Descartado:** tablet o equipo compartido que genere códigos | — | NIST 800-63B-4 **no lo prohíbe con esas palabras**: sólo habla de dispositivos compartidos en contextos de consumidor (introducción de §3), y OWASP no trata tokens compartidos. El descarte se sostiene en que el autenticador tiene que estar **vinculado a una persona** (§4.1, *binding*): un generador compartido no dice quién fue, y quien tenga acceso físico al equipo tiene «el factor» de todos. | ✅ **Confirmado el descarte**, pero por principio, no por una prohibición textual. |

## 2 · El nivel como atributo del catálogo de scopes

En el catálogo de A2 (`shared/config/catalogo-accesos.json`), cada scope declara `nivel_minimo`:

```json
{ "scope": "bancos_data:read",   "nivel_minimo": 3, "step_up": true },
{ "scope": "nomina:write",        "nivel_minimo": 2 },
{ "scope": "rentabilidad:read",   "nivel_minimo": 2 },
{ "scope": "comercial:admin",     "nivel_minimo": 2 },
{ "scope": "suite:master",        "nivel_minimo": 3, "step_up": true },
{ "scope": "usuarios:admin",      "nivel_minimo": 3, "step_up": true },
{ "scope": "comercial:read",      "nivel_minimo": 1 }
```

El servidor (`auth/suite-login` y el verificador `auth/verificar-scope`) es quien lo hace cumplir, no la página:
- El JWT gana dos claims: **`acr`** (nivel alcanzado: `1`, `2` o `3`) y **`auth_time`** (cuándo fue la última verificación con factor). Se agregan también `iss`, `aud`, `jti` y **`ver`** (versión de credenciales del usuario; §3 de `SUITEAUTH_MIGRACION.md` §9).
- **Al emitir:** el token sólo trae los scopes cuyo `nivel_minimo ≤ acr`. Si la persona tiene scopes de nivel 3 pero entró con nivel 2, recibe sólo los de nivel ≤ 2 y la pantalla le ofrece «subir de nivel».
- **Al validar:** el verificador rechaza si `nivel_minimo(scope) > acr` o si `step_up` está marcado y `ahora − auth_time` pasa de la ventana (15 min para nivel 3). El error es `NIVEL_INSUFICIENTE` o `REAUTENTICAR`, y la página lo trata como «pide el factor», no como «no tienes permiso».
- **Cero caídas:** el nivel arranca en **1 para todos los scopes** (catálogo con `nivel_minimo: 1`). Subirlo es un cambio de datos por scope, con fecha anunciada (§6).

## 3 · TOTP (propio, si se elige construirlo; ver §7)

- **Secreto generado en servidor** (≥160 bits del CSPRNG), mostrado una sola vez como QR, **guardado cifrado fuera del navegador**: una columna cifrada en `fts-suite-db` con una llave que vive en una variable de n8n, nunca en la Data Table en claro.
- **RFC 6238**, paso de 30 s, 6 dígitos. Se usa SHA-1 porque es lo que leen todas las apps (Microsoft/Google Authenticator), y es aceptable para HMAC. Tolerancia de **±1 paso** como máximo. ASVS 6.5.5 pide una vida máxima de 30 s.
- **Anti-replay:** se guarda el último paso aceptado por usuario y se rechaza cualquier código de ese paso o de uno anterior (ASVS 6.5.1; OWASP MFA «single use»).
- **Límite de intentos:** 5 fallos → bloqueo de 15 min **del factor**, contado por cuenta (no sólo por IP), más un tope por IP en la puerta de entrada. NIST pone el techo en 100 fallos consecutivos (§3.2.2); se usa uno mucho más bajo.
- **Códigos de recuperación:** 10, de un solo uso, ≥64 bits cada uno, guardados con hash. Se muestran una sola vez y regenerarlos invalida los anteriores.
- **Enrolar o cambiar el TOTP** pide la contraseña **y** el factor vigente (ASVS 7.5.1). Al cambiarlo se ofrece cerrar las demás sesiones (7.4.3).
- ⚠️ El sandbox de los Code nodes no tiene `crypto` (CLAUDE.md §15). HMAC-SHA1 en JS puro es poco código, pero **el cifrado del secreto en reposo en JS puro es justo el tipo de cosa que no conviene escribir a mano**. Es un argumento fuerte a favor de §7.

## 4 · FIDO2 / WebAuthn para el nivel 3

- **Dos llaves por persona:** la de uso diario y la de respaldo en caja fuerte. Lo recomiendan FIDO Alliance (Passkey Central: «adding at least two security keys») y NIST (SHOULD mantener al menos dos medios; SHALL permitir varios, §4.1.2).
- **Registro y baja de llaves desde Configuración** (A7). Registrar una llave nueva pide autenticarse al nivel más alto disponible. Cada llave tiene nombre, fecha de alta y fecha de último uso.
- **Pérdida:** se recupera **sólo vía Esteban**, con verificación de identidad en persona o por videollamada con identificación. Esteban da de baja la llave perdida y la persona registra la de respaldo como diaria. **Nunca vía RH.** Si Esteban pierde las dos llaves, el procedimiento se escribe antes de activar nada (por ejemplo, un segundo administrador de emergencia con sus propias dos llaves, en sobre sellado).
- Se valida **UV** (verificación del usuario: PIN o biometría de la llave), no sólo presencia. OWASP MFA CS: «a touch confirming user presence alone is not a second factor».

## 5 · El dominio manda (y hoy no cambia)

- **WebAuthn amarra cada llave al RP ID**: el dominio efectivo del origen o un sufijo registrable suyo (WebAuthn L3, Recomendación W3C del 25-ago-2026). **`github.io` está en la Public Suffix List**, así que el RP ID sólo puede ser `yinyo1.github.io`. Una llave registrada ahí **no sirve en otro dominio**. Existe una salida, *Related Origin Requests* (§5.11 de WebAuthn L3), pero exige servir `/.well-known/webauthn` como JSON desde el dominio original. En Pages eso no es trivial: Jekyll ignora las carpetas con punto y hay que comprobar el `Content-Type`. Y no todos los navegadores lo soportan.
- **Los gestores de contraseñas y `localStorage` también se amarran al origen.** Si se cambia de dominio, las contraseñas guardadas no se autocompletan y las sesiones se pierden.
- **Por eso el orden propuesto:**
  1. **TOTP primero**, que no depende del dominio.
  2. **El registro de llaves FIDO2 propias de la Suite y la campaña masiva de contraseñas nuevas esperan** a que Esteban decida el dominio final.
  3. ⚠️ **La excepción importante:** si el nivel 3 se resuelve con **Entra ID** (§7), las llaves FIDO2 se registran en el RP de Microsoft (`login.microsoft.com`), **no en `yinyo1.github.io`**, y el dominio de la Suite deja de importar para ellas.
- **Qué implicaría después un dominio propio de FTS sobre GitHub Pages** (documentado, **no se ejecuta**; [docs de GitHub](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)):
  1. **Verificar el dominio** en la cuenta de GitHub con un TXT `_github-pages-challenge-yinyo1.<dominio>`, para que nadie pueda tomarlo.
  2. DNS: `CNAME suite.<dominio> → yinyo1.github.io`. Nada de comodines.
  3. Configurar el dominio en Settings → Pages, lo que crea el archivo `CNAME` en el repo.
  4. Esperar el certificado (hasta 24 h) y activar **Enforce HTTPS**.
  5. ⚠️ **La redirección automática de `yinyo1.github.io/fts-suite/` al dominio nuevo no se encontró escrita en la documentación oficial.** Es el comportamiento conocido, pero se comprueba en vivo antes de contar con ella.
  6. **Sesiones y `localStorage`:** se pierden; todos vuelven a entrar una vez. Lo que viva sólo en el navegador (borradores, marcas pendientes) hay que exportarlo o avisarlo antes.
  7. **Webhooks y CORS:** hay que agregar el origen nuevo en cada workflow que valide `Origin`, **antes** del cambio.
  8. **Reversa:** quitar el dominio en Settings → Pages. El sitio vuelve a `yinyo1.github.io/fts-suite/`. Las llaves FIDO2 registradas en el dominio nuevo dejarían de servir, así que **no se registran llaves hasta pasar la fase de reversa**.
- **Repo privado ≠ página privada.** La documentación de GitHub lo dice textual: «GitHub Pages sites are publicly available on the internet, even if the repository for the site is private». Publicar en privado sólo lo da GitHub Enterprise Cloud, y en GitHub Free Pages sólo funciona con repos públicos. **La privacidad real de la Suite depende del login personal y de los candados en servidor (#390). El repo privado protege código y secretos.** Por eso C8 se reescribe en `SUITEAUTH_MIGRACION.md` §10.

## 6 · Despliegue sin caídas

1. **Voluntario:** TOTP disponible en «Mi perfil › Seguridad» (A5) detrás de su interruptor. Nadie lo necesita todavía, porque todos los scopes siguen en `nivel_minimo: 1`.
2. **Obligatorio por scope, con fecha:** se anuncia con 14 días de anticipación y el banner muestra la fecha. El día D, el scope sube a `nivel_minimo: 2`.
3. **Nunca se bloquea a alguien sin aviso:** quien no enroló y entra después del día D ve «tu acceso a Nómina ahora pide un segundo factor; enrólalo aquí», con **ruta asistida** (Esteban o RH acompañan **el enrolamiento**, nunca reciben el secreto). Mientras tanto conserva todo lo demás.
4. **Cada subida de nivel** entra a la matriz de paridad como columna «con factor / sin factor», y a la Capa 2 como prueba nueva (P-14: con `acr=1`, un scope de nivel 2 se niega con `NIVEL_INSUFICIENTE`; con `acr=2`, se abre).
5. **Nivel 3, Esteban primero**, y **antes de que Configuración pueda escribir permisos (A7)**.

## 7 · Alternativa: Microsoft Entra ID vía OIDC para el personal de oficina

**Licencias (learn.microsoft.com):**

| Función | Licencia |
|---|---|
| Registrar la app (SPA, OIDC) | ninguna adicional (el quickstart sólo pide tenant y rol Application Developer) |
| MFA con Microsoft Authenticator vía **security defaults** | **gratis** («no P1 or P2 license is required»). Ojo: con security defaults Microsoft decide cuándo pide MFA, y sólo con Authenticator. |
| **Passkeys / llaves FIDO2** | **todas las ediciones, incluida Entra ID Free** |
| **Acceso condicional** (exigir MFA en *esta* app, *authentication strengths* resistentes a phishing para nivel 3, frecuencia de inicio de sesión para step-up) | **Entra ID P1** |
| P1 incluido en | **Microsoft 365 Business Premium** (y E3/E5). Business Basic y Standard **no aparecen** en la lista de P1: traen Entra ID Free. |

**Qué licencia tiene FTS hoy: no la verifiqué** (prohibido usar conectores de M365 en esta sesión). **Lo necesito de Esteban.**

**Cómo se conectaría sin cambiar el dominio de la Suite:**
- La página abre el login de Microsoft (MSAL.js, flujo de autorización con PKCE) con la *redirect URI* `https://yinyo1.github.io/fts-suite/shared/login.html`.
- n8n recibe el token, lo valida y **emite el mismo JWT de SuiteAuth** (mismos scopes de `suite_usuarios`, mapeados por correo), con `acr` según cómo autenticó Microsoft.
- **Validar el token de Microsoft** (RS256 con llaves JWKS que rotan) desde n8n es el punto técnico a resolver en su propia sesión. Opciones:
  - (a) que n8n llame a Graph `/me` con el token de acceso, y Microsoft hace la validación;
  - (b) verificar el id token con el nodo JWT y una llave refrescada por un cron;
  - (c) un servicio pequeño en Railway.

  Para que `acr` y `auth_time` sean fiables hace falta el id token (claims `amr`/`acrs`/`auth_time`). Con sólo Graph `/me` no se sabe cómo autenticó la persona, salvo que **acceso condicional (P1) obligue** el factor para esa app.

**Comparación:**

| | **Entra ID (oficina) + SuiteAuth (técnicos)** | **MFA propio en n8n** |
|---|---|---|
| Seguridad | Alta y mantenida por Microsoft: Authenticator con *number matching*, passkeys/FIDO2 resistentes a phishing, detección de riesgo. **Baja centralizada**: se deshabilita la cuenta de M365 y se cae el acceso a la Suite. | Depende de que el TOTP, el cifrado en reposo, el anti-replay y WebAuthn estén bien escritos **en JS puro, en un sandbox sin `crypto`**. WebAuthn propio (CBOR, COSE, attestation) es mucho código delicado. |
| Esfuerzo | App registration + MSAL en `shared/login.html` + un workflow de intercambio: ~2–3 sesiones. | TOTP: ~3 sesiones. FIDO2 propio: ~5 o más, con riesgo alto de errores sutiles. |
| Costo | $0 con Free y security defaults (MFA sin control fino); **P1** para acceso condicional y step-up de verdad: Business Premium o P1 suelto por usuario de oficina. | $0 en licencias; el costo es tiempo y riesgo. |
| Dominio | **Las llaves FIDO2 viven en Microsoft**: no dependen de `yinyo1.github.io`. Sólo hay que agregar la *redirect URI* nueva si un día cambia el dominio. | Llaves FIDO2 amarradas a `yinyo1.github.io` (§5). |
| Dependencia y caída | Si Microsoft o el tenant fallan, la oficina no entra. Mitigación: SuiteAuth con contraseña sigue para **nivel 1**, y una cuenta de emergencia de Esteban fuera de Entra. | Si n8n se cae, nadie entra. Eso ya pasa hoy con SuiteAuth. |
| Quién queda fuera | Técnicos sin cuenta de M365 → siguen en SuiteAuth (nivel 1, contraseña larga). | — |

**Recomendación: ruta Entra ID para niveles 2 y 3 del personal de oficina, SuiteAuth para técnicos (nivel 1), y MFA propio sólo si la licencia no alcanza.**
1. **Primero, una pregunta de 1 minuto:** ¿qué plan de M365 tiene FTS y cuántas cuentas de oficina?
2. **Con Business Premium o P1:** Entra ID con acceso condicional. El nivel 3 sale con *authentication strength* «phishing-resistant MFA» y llaves FIDO2 registradas en Microsoft, sin esperar la decisión del dominio. Step-up con frecuencia de sesión o `prompt=login` + `max_age`.
3. **Con Basic o Standard (Free):** Entra con security defaults sirve para identidad y baja centralizada, pero **no garantiza** MFA en cada entrada a la Suite. En ese caso: TOTP propio para el nivel 2 (hoy no depende del dominio), y el nivel 3 espera P1 o la decisión del dominio para FIDO2 propio.
4. **Nunca se construye WebAuthn propio** mientras exista la opción de Microsoft: es la pieza con peor relación riesgo/beneficio.

## 8 · Fuentes

- NIST SP 800-63B-4 (final, 31-jul-2025): https://pages.nist.gov/800-63-4/sp800-63b.html · https://csrc.nist.gov/pubs/sp/800/63/b/4/final
- OWASP Multifactor Authentication CS: https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
- OWASP ASVS 5.0.0 (mayo 2025), V6 y V7: https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x16-V7-Session-Management.md · https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x15-V6-Authentication.md
- W3C WebAuthn Level 3: https://www.w3.org/TR/webauthn-3/ · Public Suffix List: https://publicsuffix.org/list/public_suffix_list.dat
- FIDO Alliance, Passkey Central: https://www.passkeycentral.org/design-guidelines/security-key-patterns/enroll-passkeys-on-security-keys
- GitHub Pages (visibilidad, dominio propio, verificación): https://docs.github.com/en/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site · https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages · https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- Microsoft Entra (learn.microsoft.com): https://learn.microsoft.com/en-us/entra/identity/conditional-access/overview · https://learn.microsoft.com/en-us/entra/fundamentals/security-defaults · https://learn.microsoft.com/en-us/entra/identity/authentication/how-to-enable-passkey-fido2 · https://learn.microsoft.com/en-us/entra/identity/authentication/concept-mfa-licensing · https://learn.microsoft.com/en-us/entra/fundamentals/licensing · https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app
