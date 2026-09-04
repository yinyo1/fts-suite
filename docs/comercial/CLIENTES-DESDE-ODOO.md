# El cliente del machote sale de Odoo

> Issue #148 · construido el 2026-09-04 · workflow `RyeFlCTdLu301Gjz`

## Qué pidió Esteban, textual

> «Cuando hago la creacion del machote **sigue sin darme un droplist del cliente
> visual**. podemos ver que sea solo visual y alomejor **publicamente grabe el
> ID**, para que al publico solo se vea el ID y **lo dinamico sea la lectura en
> odoo**. esto en backend. en front end no veriamos eso, en frontend solo
> veriamos **el nombre del cliente** y si se puede tamjien **del usuario**.»

## Lo que se guarda, y lo que se ve

| | dato |
|---|---|
| se **guarda** en el machote | `cliente_id` — un número (`1247`) |
| se **ve** en la pantalla | el nombre, leído de Odoo al pintar |
| respaldo | `cliente` — el último nombre conocido, sólo para cuando Odoo no contesta |

Dos razones, ninguna cosmética:

1. **El nombre vivo corrige solo.** Si a un cliente le cambian la razón social
   en Odoo, las cotizaciones viejas la muestran corregida sin que nadie las
   toque. Un nombre copiado se queda con la versión del día que se capturó.
2. **Este repo es público y sirve Pages** (CLAUDE.md §20 regla 7). El día que
   los machotes salgan del navegador, lo que viaje es `1247`, no la cartera de
   clientes de FTS.

**El catálogo NO se guarda en el repo ni en `localStorage`.** Vive en Odoo, se
pide al vuelo y se cachea en memoria mientras la pestaña está abierta. Un JSON
con los 250 clientes commiteado sería la misma filtración, sólo que más difícil
de deshacer — borrarlo del archivo no lo borra del historial.

## El endpoint

```
POST https://primary-production-5c3c.up.railway.app/webhook/comercial/clientes
body: { "token": "<el de auth/suite-login>" }
→    { "ok": true, "clientes": [{ "id": 49, "nombre": "ABINSA SA DE CV" }, …],
       "total": 250, "_meta": { … } }
```

Workflow n8n **`comercial/clientes`**, id **`RyeFlCTdLu301Gjz`**, 7 nodos.

- **SOLO LECTURA.** No escribe en Odoo. Nunca. Es la restricción que puso
  Esteban para todo este frente («no editar NADA de la base de datos de odoo,
  odoo solo consulta»).
- **Token en el cuerpo, no en `Authorization`**: el header dispara un preflight
  CORS que el webhook de n8n no contesta (CLAUDE.md §15 #5).
- Exige **scope `comercial:read`**, el mismo que abre el módulo.
- La criptografía del nodo `Code - Verificar token` viene **recortada
  programáticamente** de `docs/n8n-workflows/fase0/jwt-verify.js` (9/9 contra
  `crypto` de Node, incluido payload manipulado), no transcrita a mano.

### El dominio de Odoo, y por qué `is_company`

```
is_company    = true
active        = true
customer_rank >= 1        (greaterOrEqual — `greaterThan` NO existe en el nodo
                           Odoo v1 de n8n, CLAUDE.md §17 quirk 1)
fieldsList    = ['id', 'name']
```

Medido el 2026-09-04 contra Odoo:

```
is_company = true  · customer_rank > 0 · active  →  250 empresas
is_company = false · customer_rank > 0 · active  →  483 PERSONAS
```

Esos 483 son los **contactos** de cada cliente (`parent_id` apunta a la
empresa), con nombre y apellido de gente real. **El filtro `is_company` no es
cosmético: es lo que impide mandar 483 nombres de personas a un navegador.** Y
del partner sale únicamente `id` y `name` — ni correo, ni teléfono, ni RFC.

## Degradar sin trabar

El frontend es la mitad **tolerante** del contrato (CLAUDE.md §8, regla
anti-trabón). Si el webhook no está activo, si n8n está caído o si el token
venció:

- el campo de cliente **sigue siendo texto libre y se guarda**,
- `cliente_id` queda en `null`,
- y un aviso ámbar dice por qué la lista está vacía, en vez de dejar un campo
  mudo que parece roto.

Nunca se bloquea crear un machote porque Odoo no contestó. El machote casi
siempre nace antes que la orden, y a veces antes del alta del cliente.

También se acepta un cliente **que no está en el catálogo** — un prospecto — y
se guarda como texto sin id.

## Empate por acento

En Odoo conviven `Alta Extracción S.A. de C.V.` (id 388) y
`ALTA EXTRACCION, S.A. DE C.V` (id 461): son ids distintos y ninguno es un
error de captura. La resolución texto→id busca primero **exacta**, y sólo si
falla compara sin acentos ni mayúsculas. **Ante empate no elige**: deja el
texto libre, y se ve en la pantalla. Elegir al azar habría metido la
cotización en el cliente equivocado sin que nadie lo notara.

## Cómo se verificó, y qué NO se verificó

| | cómo |
|---|---|
| el dominio de Odoo y los conteos | ejecutado contra Odoo por MCP, read-only |
| la criptografía del token | `node docs/n8n-workflows/fase0/test-jwt.js` → 9/9 |
| el workflow existe y su forma | read-back con `get_workflow_details` |
| el frontend, con catálogo | Playwright, `fetch` fingido |
| el frontend, sin catálogo | Playwright, `fetch` que rechaza |

⚠️ **Lo que NO está verificado: la llamada real navegador → n8n → Odoo.** Dos
motivos, los dos del entorno:

1. El contenedor de Claude Code **no alcanza Railway** — 403 del proxy de
   salida— así que no se puede hacer `curl` al webhook.
2. Correr el workflow con `test_workflow` **volcaría `SUITE_JWT_SECRET` al
   transcript**: la herramienta devuelve el output de todos los nodos, y uno de
   ellos es el `Set` que materializa el secreto (CLAUDE.md §9, la regla que
   costó rotar la `ODOO_RPC_KEY`). No se corrió a propósito.

La prueba que falta es de un clic: **activar el workflow en la UI de n8n** y
abrir la pantalla de machote nuevo. Si la lista aparece, el círculo cerró; si
aparece el aviso ámbar, el aviso mismo dice qué falló.

## Pendiente

- **Activar `RyeFlCTdLu301Gjz` en la UI** (el API no deja activar por MCP —
  CLAUDE.md §18 lección 2). Mientras esté inactivo, el campo funciona como
  texto libre y avisa.
- Sin HMAC de webhook, como el resto del Suite. Este endpoint es de lectura y
  exige un JWT con scope, así que no empeora el modelo — pero entra en la misma
  deuda pendiente (CLAUDE.md §9).
