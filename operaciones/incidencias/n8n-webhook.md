# n8n Webhook — Incidencias Push

Proxy seguro para que empleados sin GitHub token puedan
crear y actualizar incidencias. El token vive solo en las
variables de entorno de n8n, nunca en el navegador del
empleado.

## Endpoint

```
POST {n8nUrl}/webhook/incidencias/push
```

## Body esperado

```json
{
  "incidencia": {
    "id": "1744638291000_a3b2c",
    "username": "felipe.perez",
    "nombre": "Felipe Pérez",
    "tipo": "permiso_goce",
    "fecha": "2026-04-15",
    "motivo": "Cita médica",
    "medio_dia": true,
    "status": "pendiente",
    "timestamp": "2026-04-14T18:24:51.000Z",
    "face_verificado": true,
    "foto_face": "data:image/jpeg;base64,...",
    "aprobado_por": null,
    "aprobado_timestamp": null,
    "foto_aprobacion": null
  }
}
```

## Lógica del workflow n8n

1. **Webhook trigger** recibe la request POST con el body.
2. **HTTP Request** — GET `shared/incidencias.json` desde GitHub API:
   - URL: `https://api.github.com/repos/{{$env.GITHUB_REPO}}/contents/shared/incidencias.json?ref=main&t={{Date.now()}}`
   - Headers:
     - `Authorization: token {{$env.GITHUB_TOKEN}}`
     - `Accept: application/vnd.github.v3+json`
   - Responde con `{content, sha}` (content en base64).
3. **Function** — Decodificar y mergear:
   ```js
   const file = $json;
   const existing = JSON.parse(
     Buffer.from(file.content, 'base64').toString('utf8')
   );
   const incs = existing.incidencias || [];
   const nueva = $('Webhook').first().json.body.incidencia;
   const idx = incs.findIndex(i => i.id === nueva.id);
   if (idx >= 0) incs[idx] = nueva;
   else incs.unshift(nueva);
   return {
     json: {
       content: Buffer.from(
         JSON.stringify({incidencias: incs}, null, 2)
       ).toString('base64'),
       sha: file.sha,
       message: `Incidencia ${nueva.tipo} de ${nueva.username}`
     }
   };
   ```
4. **HTTP Request** — PUT de vuelta a GitHub:
   - URL: `https://api.github.com/repos/{{$env.GITHUB_REPO}}/contents/shared/incidencias.json`
   - Method: PUT
   - Headers:
     - `Authorization: token {{$env.GITHUB_TOKEN}}`
     - `Accept: application/vnd.github.v3+json`
     - `Content-Type: application/json`
   - Body JSON:
     ```json
     {
       "message": "{{$json.message}}",
       "content": "{{$json.content}}",
       "branch": "main",
       "sha": "{{$json.sha}}"
     }
     ```
5. **Respond to Webhook** con:
   ```json
   { "ok": true, "id": "{{$('Webhook').first().json.body.incidencia.id}}" }
   ```

## Variables de entorno requeridas en n8n

- `GITHUB_TOKEN`: Personal access token con scope `repo` (acceso de escritura al repo).
- `GITHUB_REPO`: `yinyo1/fts-suite`

## Configuración en n8n Railway

1. Abrir el panel de n8n → **Settings → Environment Variables**.
2. Agregar:
   ```
   GITHUB_TOKEN = ghp_xxxxxxxxxxxxxxxxxxxx
   GITHUB_REPO  = yinyo1/fts-suite
   ```
3. Reiniciar el workflow para que tome los nuevos valores.

## Seguridad

- **El token nunca llega al navegador**. Solo está en la
  memoria del servidor n8n durante la ejecución del workflow.
- Los empleados solo conocen la URL pública del webhook,
  no tienen acceso al token.
- Considerar agregar verificación de origen (`Origin`
  header) o HMAC para evitar que terceros pusheen
  incidencias falsas al repo.

## Flujo end-to-end

1. Empleado crea incidencia en `empleado/index.html`.
2. `IncDB.save()` guarda local y dispara `githubPush()`.
3. `githubPush()` no encuentra `ops_github_token` → fallback a n8n.
4. POST a `{ops_n8n_url}/webhook/incidencias/push` con el body.
5. n8n workflow: GET → merge → PUT a GitHub con su propio token.
6. Respuesta `{ok:true}` → la incidencia queda persistida en
   `shared/incidencias.json`.
7. Cuando el supervisor abre su panel, `IncDB.pull()` la descarga
   y la ve en pendientes.

## Nota de reintentos

Si el PUT a GitHub devuelve 409 (SHA conflict por edición
concurrente), el workflow debería reintentar: volver al paso 2
con un SHA fresco. En n8n esto se implementa con un loop
error-wait-retry (máx 3 intentos).
