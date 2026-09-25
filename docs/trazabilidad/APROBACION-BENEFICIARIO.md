# El alta y la aprobación de un beneficiario de comisión

**Issue:** [#294](https://github.com/yinyo1/fts-suite/issues/294) · especificación hermana
[`ESPECIFICACION-CONFIRMACION.md`](ESPECIFICACION-CONFIRMACION.md) · escenarios
[`COMISIONES-ESCENARIOS.md`](COMISIONES-ESCENARIOS.md)

**2026-09-25 · diseño. No está construido y no se ejerció.** Esta sesión **no mandó ningún
correo**, ni de prueba. Lo de abajo es cómo se construiría.

Sale de la **respuesta 7** de Esteban, que es **la pieza más grande que abrieron las respuestas
y no estaba en el plan maestro**.

---

## 0 · La frase que gobierna todo lo demás

> **La liga aprueba un renglón de catálogo. No aprueba un pago.**

Entre que alguien queda aprobado como beneficiario y que reciba un peso hay **tres actos
humanos más**, todos fuera de este flujo: que un machote le asigne un porcentaje, que la orden
se confirme, y que Contabilidad emita y pague una factura de proveedor a su nombre.

Esto no es un matiz: es **lo que hace tolerable mandar una liga por correo**. El correo es un
canal que se reenvía, se filtra mal y se archiva en sitios que no controlamos. Una liga que
moviera dinero por sí sola no debería existir en un correo. Una que da de alta un renglón de
catálogo, con receso y con aviso, sí.

---

## 1 · Qué problema resuelve, medido

| medición | resultado | fuente |
|---|---|---|
| cuentas analíticas del plan 20 | **32** | `account.analytic.account`, `plan_id = 20` |
| de ellas, con **`code`** poblado | **0 de 32** | mismo · campo `code` |
| de ellas, con **`partner_id`** poblado | **0 de 32** | mismo · campo `partner_id` |
| de ellas, **`active = true`** | **32 de 32** — incluidas las de quien ya salió | mismo · campo `active` |
| empleados de las cías 1 y 6, **activos** | **29** | `hr.employee`, `company_id in (1,6)` |
| los mismos, **archivados** | **89** | ídem, con `active in (true,false)` |
| machotes con sección de comisiones | 19 de 24 | #291 |
| de ésos, con los **cuatro nombres de la plantilla** | 16 de 19 | #291 |
| de esos cuatro, **ya no están en la empresa** | **3** | #291 |

**Dos cosas de esa tabla mandan sobre el diseño:**

🔴 **No hay llave legible por máquina.** El «3.1», el «5.2.1» **viven dentro del nombre**, no en
`code`. Y `partner_id` está vacío, así que **la cuenta analítica no sabe de quién es**. Un
selector que guarde el **id** funciona hoy mismo; uno que case por nombre **reproduce la
enfermedad que se quiere curar**.

⚠️ **Los 89 archivados no se ven con la consulta normal.** Odoo excluye los inactivos salvo que
el dominio lleve `active in (true,false)` explícito. Eso obliga a **dos consultas distintas y a
propósito**:
- **el selector** usa la consulta normal → sólo ofrece gente vigente;
- **el validador** usa la explícita → puede ver a quien ya salió **y decirlo** («esta persona ya
  no está en la empresa») en vez de decir «no existe», que son dos cosas distintas.

---

## 2 · Las cuatro situaciones, y sólo una dispara el flujo

| situación | qué hace la pantalla | ¿dispara aprobación? |
|---|---|---|
| **A** · empleado vigente con rubro | lo elige del selector; guarda el **id** | **no** |
| **B** · empleado vigente **sin** rubro | lo elige; queda `PENDIENTE_RUBRO` | **no** — lo abre Gerardo (§6) |
| **C** · externo **del catálogo** (broker, contacto de cliente) | lo elige del selector del lado cliente | **no** |
| **D** · **externo nuevo** | lo crea ahí mismo | **sí** |

**Sólo D.** Y en D **el machote sigue armándose**: la respuesta 7 lo dice explícitamente —*«deja
seguir armando el machote»*—. Lo que no se puede hacer con un beneficiario sin aprobar es
**confirmar la orden**.

📌 **Por qué se deja seguir:** exigir la aprobación para poder cotizar frenaría al equipo el día
que alguien traiga un broker nuevo, y lo que pasaría es que escribirían el nombre de otro. El
candado está donde el dinero se compromete —la confirmación—, no donde se piensa.

---

## 3 · Los estados, y dónde viven

```
                 ┌──────────────┐
   se crea  ───► │  BORRADOR    │  el machote lo usa; NO bloquea cotizar
                 └──────┬───────┘
                        │ se manda a aprobar (automático al guardar el machote)
                 ┌──────▼───────┐
                 │  PENDIENTE   │  ◄── bloquea CONFIRMAR ────┐
                 └──┬────┬───┬──┘                            │
        aprueba ────┘    │   └──── rechaza                   │
                 ┌───────▼──┐  ┌─────────┐   ┌───────────┐   │
                 │ APROBADO │  │RECHAZADO│   │ CADUCADO  │───┘
                 └────┬─────┘  └─────────┘   └───────────┘
                      │ deja de trabajar con FTS
                 ┌────▼──────┐
                 │ ARCHIVADO │   nunca se borra (respuesta 9)
                 └───────────┘
```

**Nada se borra jamás** — respuesta 9 y principio del [#127](https://github.com/yinyo1/fts-suite/issues/127).

### 3.1 · Las dos tablas

```sql
-- El beneficiario. Uno por persona o contacto, sea interno o externo.
CREATE TABLE comercial.comision_beneficiario (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lado          text NOT NULL,              -- 'interno' | 'cliente'
  nombre        text NOT NULL,
  -- Las tres llaves hacia Odoo. Pueden llegar despues del alta.
  odoo_employee_id integer,                 -- si es interno
  odoo_partner_id  integer,                 -- el proveedor al que se le factura
  odoo_analytic_id integer,                 -- el rubro del plan 20
  odoo_account_id  integer,                 -- la cuenta contable

  estado        text NOT NULL DEFAULT 'borrador',
  -- 'borrador' | 'pendiente' | 'aprobado' | 'rechazado' | 'caducado' | 'archivado'

  creado_at     timestamptz NOT NULL DEFAULT now(),
  creado_por    text NOT NULL,
  archivado_at  timestamptz,
  archivado_por text,

  CONSTRAINT beneficiario_lado_ck   CHECK (lado IN ('interno','cliente')),
  CONSTRAINT beneficiario_estado_ck CHECK (estado IN
      ('borrador','pendiente','aprobado','rechazado','caducado','archivado')),
  CONSTRAINT beneficiario_nombre_ck CHECK (length(btrim(nombre)) > 0),
  -- Un hecho sin autor no es un hecho (mismo criterio que la 006 y la 007).
  CONSTRAINT beneficiario_archivado_con_autor_ck
    CHECK (archivado_at IS NULL OR (archivado_por IS NOT NULL
           AND length(btrim(archivado_por)) > 0))
);

-- APPEND-ONLY. Cada intento de aprobacion, con su token y su desenlace.
CREATE TABLE comercial.comision_aprobacion (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiario_id uuid NOT NULL REFERENCES comercial.comision_beneficiario(id),

  -- A quien se le pidio, congelado: si manana cambia el aprobador, este
  -- renglon sigue diciendo a quien se le pidio entonces.
  aprobador_correo text NOT NULL,
  aprobador_nombre text,
  copia_a          text[] NOT NULL DEFAULT '{}',

  -- El token NO se guarda: se guarda su huella. Ver §4.3.
  token_sha256   text NOT NULL,
  expira_at      timestamptz NOT NULL,

  enviado_at     timestamptz,
  correo_id      text,                      -- lo que devuelve Graph, para rastrear
  abierto_at     timestamptz,
  resuelto_at    timestamptz,
  resultado      text,                      -- 'aprobado' | 'rechazado' | 'caducado'
  motivo         text,                      -- obligatorio al rechazar
  ip             text,
  user_agent     text,

  solicitado_por text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT aprobacion_resultado_ck CHECK (resultado IS NULL OR resultado IN
      ('aprobado','rechazado','caducado')),
  CONSTRAINT aprobacion_motivo_al_rechazar_ck
    CHECK (resultado <> 'rechazado' OR (motivo IS NOT NULL AND length(btrim(motivo)) > 0)),
  CONSTRAINT aprobacion_token_ck CHECK (length(token_sha256) = 64)
);

-- UN pendiente vivo por beneficiario. Sin esto, tres guardados del machote
-- mandan tres correos y cualquiera de las tres ligas aprueba.
CREATE UNIQUE INDEX comision_aprobacion_viva_uq
  ON comercial.comision_aprobacion (beneficiario_id)
  WHERE resuelto_at IS NULL;
```

📌 **El índice parcial es el candado de verdad.** Que la pantalla no deje mandar dos veces no
sirve: dos pestañas, un doble clic o un reintento tras un tiempo de espera producen dos POST.
Sólo la base puede dejar pasar a uno.

---

## 4 · La liga: cómo se firma para que nadie más pueda aprobar

### 4.1 · Qué es

Una URL a una página de Pages con **un token opaco**:

```
https://yinyo1.github.io/fts-suite/comercial/aprobar/#/b/<token>
```

El token es **base64url de tres partes**, firmado:

```
payload  = { s:<id de la solicitud>, a:<correo del aprobador>, exp:<epoch>, n:<nonce de 16 bytes> }
firma    = HMAC-SHA256( payload , COMISION_APROBACION_SECRET )
token    = base64url(payload) + "." + base64url(firma)
```

### 4.2 · Las seis propiedades, y qué ataque para cada una

| # | propiedad | cómo | qué impide |
|---|---|---|---|
| 1 | **no se puede fabricar** | HMAC-SHA256 con secreto de servidor | que alguien arme una liga para un beneficiario suyo |
| 2 | **sólo sirve para UNA solicitud** | el `s` va **dentro de la firma** | reusar la liga de ayer para el alta de hoy |
| 3 | **sólo la puede usar el aprobador** | el `a` va dentro de la firma **y** se re-verifica contra la tabla al resolver | que la liga sirva desde otra cuenta |
| 4 | **caduca** | `exp` dentro de la firma **y** `expira_at` en la tabla — **las dos** | una liga vieja en una bandeja olvidada |
| 5 | **un solo uso** | `resuelto_at` se escribe con `UPDATE ... WHERE resuelto_at IS NULL` | doble clic, reintento, reenvío |
| 6 | **no da sesión** | el token **no** es un JWT de la suite y **no** abre nada más | que una liga filtrada se convierta en acceso al sistema |

⚠️ **La propiedad 4 se comprueba dos veces a propósito.** Si sólo estuviera en la firma, alargar
la vigencia obligaría a reemitir; si sólo estuviera en la tabla, un token filtrado sobreviviría
a que le borren el renglón. Las dos, y gana la más estricta.

### 4.3 · Lo que NO se guarda

**El token no se guarda nunca.** En la tabla va **`sha256(token)`**. Si alguien lee la base de
datos —un volcado, un respaldo, una consulta de apoyo— **no obtiene ligas utilizables**. Al
resolver, el servidor calcula el sha256 de lo que recibe y busca por él.

Es el mismo criterio por el que no se guardan contraseñas: **lo que se guarda sirve para
comprobar, no para actuar.**

### 4.4 · El secreto, y por qué es SUYO

`COMISION_APROBACION_SECRET`, **distinto de `SUITE_JWT_SECRET`**, como variable de Railway
leída por un nodo `Set` (el sandbox de los nodos Code no ve `$env`).

**Tres razones y las tres son de incidentes reales de este repositorio:**
1. **Rotar el de sesión no debe invalidar las aprobaciones en vuelo** — ya pasó que rotar
   `SUITE_JWT_SECRET` dejó pantallas con un token muerto diciendo «no se pudo confirmar con el
   servidor».
2. **Un token de aprobación filtrado no puede convertirse en una sesión.**
3. El cripto es **JS puro** (HMAC-SHA256 a mano), porque el sandbox de n8n no expone
   `node:crypto`. Ya hay implementación probada en `auth/finanzas-login`.

🔴 **Y una regla de construcción que no es negociable:** el nodo que consume el `Set` del
secreto va **entero en `try/catch`** y devuelve el fallo como **dato** (`{ok:false,
error:'FALLO_X'}`), sin tocar el item de entrada. Cuando un nodo lanza, n8n devuelve **su
entrada** en el `nodeExecutionStack` —y la entrada de ese nodo **es el secreto**—. Ya costó dos
rotaciones de credenciales. `onError: continueRegularOutput` **no sirve aquí: es peor**, porque
manda el secreto río abajo.

### 4.5 · El reenvío, que es el hueco honesto

**Si el aprobador reenvía el correo, quien lo reciba puede aprobar.** No hay forma de impedirlo
con una liga en un correo, y fingir lo contrario sería peor que decirlo.

Lo que sí se hace, en capas:

1. **La aprobación queda a nombre del aprobador**, con IP y hora. Reenviar no da anonimato: da
   **una atribución falsa a nombre de quien reenvió**, que es un problema suyo y verificable.
2. **Copia a Esteban en cuanto se aprueba** — lo pidió la respuesta 7, y **es el control de
   detección**: un alta que nadie esperaba llega a un segundo par de ojos el mismo minuto.
3. **La aprobación es reversible.** Un beneficiario aprobado se puede des-aprobar; lo que no se
   puede es borrar su historia.
4. **Y no mueve dinero** (§0).
5. Si el aprobador **tiene cuenta en la suite**, la página **exige la sesión** además de la
   liga. Si no la tiene —que es el caso previsto—, la liga sola basta, con las cuatro capas de
   arriba.

---

## 5 · El correo

**Se manda con Microsoft Graph**, con la credencial que ya existe y desde el buzón que ya está
autorizado. La *Application Access Policy* de Azure limita la aplicación **a ese único buzón**:
no puede mandar como nadie más aunque se lo pidan.

**Asunto:** `[FTS · autorizar comisión] <nombre> — <lado> — cotización <folio>`

**Cuerpo, y cada bloque está por una razón:**

| bloque | por qué |
|---|---|
| **quién lo pide** y cuándo | para que el aprobador sepa a quién preguntarle |
| **quién es el beneficiario**, lado, y de qué cliente | es lo que se aprueba |
| **en qué cotización aparece**, con folio, cliente y monto | el contexto que hace decidible la pregunta |
| **el porcentaje y la bolsa estimada** | lo que se está autorizando, en dinero |
| **dos botones: Autorizar · No autorizar** | dos ligas distintas, las dos firmadas |
| **cuándo caduca**, con fecha y hora | para que «se me pasó» no sea una sorpresa |
| **qué pasa si no hace nada** | ver §7 |

📌 **No lleva adjuntos y no pide responder.** Un flujo que depende de leer una respuesta escrita
a mano es un flujo que se atora el día que alguien conteste «ok» desde el teléfono.

⚠️ **Y no se manda si no hay a quién.** Si la fila del aprobador está vacía, el sistema **no
finge**: el beneficiario queda en `borrador`, la pantalla dice *«no hay aprobador configurado —
habla con Esteban»*, y el candado de confirmación sigue cerrado. Es la diferencia entre
«avisado» y «no había a quién avisar», que son dos estados distintos.

---

## 6 · Las tres escrituras del alta, y por qué la suite no las hace

Dar de alta a alguien nuevo en el catálogo de Odoo son **tres escrituras**, y **sólo una está
probada**:

| escritura | ¿probada? | quién |
|---|---|---|
| `account.analytic.account` del plan 20 | **sí** — la Confirmación crea analíticas desde junio | podría la suite |
| `account.account` (la cuenta contable) | **no** | Gerardo |
| `account.analytic.distribution.model` (la fila de enlace) | **no** | Gerardo |

**Recomendación, que no cambia respecto del plan maestro: el alta en Odoo la hace Gerardo.**
La suite deja el pendiente con nombre, lado y cliente; Gerardo hace las tres y la suite
**re-lee** para confirmar que quedaron.

**Y hay una razón concreta, no prudencia genérica:** la tabla de enlace es justo donde nació la
ambigüedad que hoy estampa el rubro de una persona que ya salió sobre **2,633 renglones de
IVA**. Automatizar un alta de tres piezas mal coordinadas es **exactamente cómo se hizo ese
desastre**. Primero se limpia (R2 y R3), después se automatiza, si acaso.

📌 **Y una reparación nueva que esta sesión destapó, barata y previa a todo:** poblar **`code` y
`partner_id`** en las 19 cuentas de comisión del plan 20. Son minutos de Gerardo y es lo que
convierte el catálogo en algo que una máquina puede leer sin adivinar por el nombre. **Sin
eso, el selector del machote no se puede construir bien.**

---

## 7 · Qué pasa si nadie aprueba

**Caduca a las 72 horas hábiles**, y hay que decir las tres cosas que la gente pregunta:

| momento | qué pasa |
|---|---|
| **+24 h** | recordatorio al aprobador. **Uno solo.** |
| **+48 h** | aviso **a quien lo pidió**: «tu alta sigue sin respuesta» — para que pueda ir a buscar a la persona |
| **+72 h** | pasa a **`caducado`**. El beneficiario vuelve a `borrador` |
| después | quien lo pidió puede **volver a mandarlo** con un clic; se crea **una solicitud nueva**, no se revive la vieja |

**Caducar no es rechazar**, y son estados distintos a propósito: `rechazado` lleva motivo
obligatorio y es una decisión; `caducado` es la ausencia de una decisión. Juntarlos haría que
un olvido se leyera como una negativa.

⚠️ **La caducidad la escribe un vigilante, no la lectura.** Si el estado se calculara al leer
—«está vencido porque ya pasó la fecha»—, nadie tendría constancia de cuándo caducó y el
recordatorio de +24 h no existiría. Un proceso diario los marca y deja su renglón.

📌 **El machote NO se bloquea por una caducidad.** Sigue armándose; lo único cerrado es la
confirmación. Quien cotiza puede trabajar tres días con un beneficiario pendiente sin que nada
se atore.

---

## 8 · El candado en la Confirmación

Candado **14**, `BENEFICIARIO_SIN_APROBAR`. Lo que ve quien confirma:

> **Falta autorizar a quien va a recibir comisión.**
> **\<nombre\>** (\<lado\>) está **pendiente de autorizar** desde el \<fecha\>.
> Se le pidió a **\<aprobador\>** el \<fecha\> y **caduca el \<fecha y hora\>**.
> Sin esa autorización no se puede confirmar la orden, porque el presupuesto de comisión se
> escribe al confirmar.
> `[ Recordarle ]   [ Quitar a esta persona de la cotización ]   [ Volver ]`

**El segundo botón importa tanto como el primero.** Sin una salida, el único camino sería
esperar, y lo que pasaría de verdad es que alguien pondría el nombre de otro con tal de poder
confirmar — que es precisamente el defecto que este flujo viene a quitar.

---

## 9 · Lo que NO se pudo verificar en esta sesión

- **Si el aprobador tiene cuenta en la suite**, lo que decide si §4.5 punto 5 aplica en la
  práctica. No se consultó el padrón de usuarios: no hacía falta para diseñar y **habría traído
  correos de personas a una sesión que escribe en un repositorio público**.
- **Cuánto tarda Graph** en entregar a un buzón externo. La sesión **no mandó correo**, ni de
  prueba, por instrucción.
- **Si `account.analytic.distribution.model` acepta `create` por API** con el usuario del MCP.
  Es una de las dos escrituras no probadas de §6, y la recomendación es no automatizarla, así
  que no se intentó.
