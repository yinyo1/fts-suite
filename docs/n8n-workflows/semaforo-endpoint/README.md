# `ops/semaforo` — el endpoint del panel del semáforo

> Issue **#240**, plataforma **#237**, frente **#229**.
> **SOLO LECTURA.** No escribe a Odoo, no commitea nada, no guarda snapshots.
> No toca `ops/watchdog-semaforo` ni ningún workflow de producción.

El panel que lo consume vive en **`operaciones/semaforo/index.html`** y está
montado sobre el armazón `shared/panel/`.

## La forma

```
Webhook POST /webhook/ops/semaforo
  → Set - secreto            ($env.SUITE_JWT_SECRET)
  → Code - Verificar token   (JWT + scope semaforo:read, en el servidor)
  → IF - Token valido?
       ├── true  → Motor - semaforo (RtP77DIATk4nogR5, sub-workflow, cero efectos)
       │            → Code - Armar respuesta → Respond
       └── false → Respond            (el cuerpo ya trae `error` y `clase`)
```

Es la misma forma que `fin/rentabilidad` (`Q71Qqumnq5r3tDFU`), a propósito: el
segundo endpoint tenía que costar poco, igual que el segundo panel.

## Cómo se construyó el verificador — sin transcribir la cripto

`build-verificar.js` **genera** `Code-Verificar-token.js`. La criptografía sale
**tal cual** de `../fase0/jwt-verify.js`, recortada con guardas de conteo (cada
una de las seis funciones tiene que aparecer exactamente una vez, y el recorte
aborta si arrastra el `module.exports` o el fallback legacy). Lo único escrito a
mano es `verifyJWT` y el cuerpo del endpoint.

Esto no es ceremonia: un carácter alterado dentro de un SHA-256 escrito a mano
cambia todas las firmas y **no se detecta leyendo**. La regla de CLAUDE.md §17
—modificar programáticamente, nunca transcribiendo— aplica igual al código nuevo.

```bash
cd docs/n8n-workflows/semaforo-endpoint
node build-verificar.js     # regenera Code-Verificar-token.js
git diff --stat .           # vacío = la reconstrucción es byte a byte
```

## El cambio deliberado: sin el fallback de scopes

`../fase0/jwt-verify.js` concede `['finanzas:read','finanzas:write']` a un token
**sin** `scopes`, para no romper tokens viejos de Finanzas. Aquí **no**:

> Un panel nuevo no tiene tokens viejos que respetar, y heredarlo abriría el
> semáforo a cualquiera con un token de Finanzas. Sin scopes en el token, no hay
> acceso.

Mismo criterio que `fin/rentabilidad`. Está probado, no sólo escrito.

## Las pruebas — 11/11, contra `crypto` de Node

`probar-verificar.js` firma tokens con el `crypto` de Node y los pasa por el nodo.
El secreto de la prueba es `'x'.repeat(48)`; **el real no aparece por ningún lado.**

```
  OK   valido con scope                 ok:true, actor, hoy en formato AAAA-MM-DD
  OK   scope de OTRO panel              SCOPE_INSUFICIENTE · clase sesion
  OK   SIN scopes (fallback legacy)     SCOPE_INSUFICIENTE   <- el fallback NO se heredó
  OK   scopes de Finanzas viejo         SCOPE_INSUFICIENTE   <- un token de Finanzas NO entra
  OK   expirado                         TOKEN_EXPIRADO
  OK   firmado con otro secreto         FIRMA_INVALIDA
  OK   payload manipulado               FIRMA_INVALIDA
  OK   malformado                       TOKEN_MALFORMADO
  OK   ausente                          TOKEN_AUSENTE
  OK   sin secreto en el entorno        SECRETO_NO_CONFIGURADO · clase servidor
  OK   NUNCA devuelve el secreto        el secreto no aparece en la respuesta

*** 11/11 en verde ***
```

Los tres del medio son los que importan: son la prueba de que el fallback se
quitó de verdad y no sólo en el comentario.

## Por qué todo el cuerpo va en `try/catch`

El nodo cuelga directamente de `Set - secreto`, así que **su entrada ES el
secreto**. Si lanzara, n8n adjunta el input del nodo que falló al payload de
error, y ahí viaja el secreto en claro — incluso con el filtro de `nodeNames`
puesto. Así se filtró `SUITE_JWT_SECRET` el 8-sep (ejecución `90281`) y hubo que
rotarla. Un nodo que no lanza no produce ese payload. Regla dura de CLAUDE.md §9.

## El sobre que devuelve

El contrato de tabla de #237: `{ok, panel, contrato, actor, salvedades, datos:{resumen, columnas, filas}, _meta}`.
El armazón pinta las `columnas` que el servidor declara; el panel decide el
ancho, el orden, los colores y qué filas se ven.

**Los umbrales de `no_puede_esperar` viven en el SERVIDOR**, no en el navegador,
y son los mismos que la sección del correo (parche S4): rojo **y** (vencido >45d
**o** >90d en la etapa). Dos pantallas que dicen «urgente» de dos cosas distintas
es peor que no tener la sección.

Verificado contra el snapshot real del 14-sep (36 proyectos), sin tocar Odoo:

```
resumen: {"total":36,"rojo":22,"amarillo":0,"verde":14,"no_puede_esperar":9,"pide_algo":26,"en_tiempo_pct":39}
Operaciones  20 vigilados · 9 verdes · 4 urgentes · 45% en tiempo
Admin        16 vigilados · 5 verdes · 5 urgentes · 31% en tiempo
```

Cuadra renglón por renglón con lo que produce el correo del parche S4 sobre el
mismo día. No es coincidencia: es el mismo motor y el mismo criterio.

## Lo que este endpoint NO hace, y lo dice en `salvedades`

| código | qué declara |
|---|---|
| `LINEA_BASE_NO_LEIDA` | La columna «línea base» dice SIN LÍNEA BASE en los 36 **porque este endpoint todavía no lee el bloque `[[SEM]]`**, no porque se haya comprobado que no existe. El código se llama así y no `SIN_LINEA_BASE` a propósito: dice que el panel no mira, no que no haya nada. Un código que dijera «no hay» envejecería hasta volverse mentira el día que el bloque se escriba. |
| `SEGUIMIENTO_NO_MANDA` | El segundo semáforo se muestra pero no decide el color: su verde es inalcanzable por construcción (#220). |
| `FOTO_DE_HOY` | El % en tiempo es de hoy, no un promedio, **y va con su denominador**. |
| `CONTADOR_POR_EDAD` | Los que miden desde `create_date` llevan la EDAD del proyecto, no su tiempo en la etapa (#229). |
| `MEDICION` / `MEDICION_CRITICA` | Los diagnósticos del motor, pasados tal cual **con su limitación dicha**: sus guardas no distinguen «falló» de «hoy no había nada» en 6 de 9 lecturas (ver `docs/watchdogs/GUARDAS-AMBIGUAS.md`), así que pueden ser falsas alarmas. Filtrarlas aquí sería tapar el síntoma en un consumidor más en vez de arreglarlas en `rowsOf`. |

## Lo que falta

1. **Crear y publicar el workflow.** `sdk-ops-semaforo.js` es el código del SDK
   listo para `create_workflow_from_code`. Mientras no exista, el panel muestra
   el aviso «el endpoint todavía no está publicado» — que es el camino que el
   armazón trae de fábrica, y está probado.
2. **El scope `semaforo:read`** hay que darlo de alta en `suite_usuarios` (tabla
   de datos de n8n `YWCP0KoVmgxX2RzL`) para quien deba ver el panel. Sin él, el
   panel dice con todas sus letras qué permiso falta y a quién pedírselo.
3. **Leer la línea base**, cuando `ops/semaforo-linea-base` pase a producción.
   La columna ya existe y el vocabulario ya está; sólo falta la lectura.
