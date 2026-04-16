# n8n Workflow: kiosk/resolve-location

Resuelve coordenadas (lat/lng) a partir de una URL de Google Maps.

## Endpoint

```
POST {n8nUrl}/webhook/kiosk/resolve-location
```

## Body

```json
{
  "maps_url": "https://maps.app.goo.gl/AbCdEfGhIjKlMn"
}
```

## Lógica del workflow

### 1. Si URL es corta (`maps.app.goo.gl`):
- **HTTP Request** GET a la URL corta.
- Seguir redirects (la respuesta final es una URL larga de `google.com/maps/...`).
- Extraer coordenadas con regex: `/@(-?\d+\.\d+),(-?\d+\.\d+)/`

### 2. Si URL ya es larga con `@`:
- Extraer directamente con regex: `/@(-?\d+\.\d+),(-?\d+\.\d+)/`

### 3. Si la URL contiene `place/`:
- Extraer el nombre del lugar de la URL.
- (Opcional) Usar Google Geocoding API para resolver a coordenadas.

## Nodo Code (n8n)

```js
const mapsUrl = $input.first().json.body.maps_url;

// Intentar extraer coordenadas de la URL directa
const match = mapsUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
if (match) {
  return { json: { lat: match[1], lng: match[2] } };
}

// Si no, es una URL corta — el HTTP Request node
// ya la resolvió y la URL final está en la respuesta
const finalUrl = $('HTTP Request').first().json.headers?.location
  || $('HTTP Request').first().json.url
  || mapsUrl;

const match2 = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
if (match2) {
  return { json: { lat: match2[1], lng: match2[2] } };
}

return { json: { error: 'No se encontraron coordenadas', url: finalUrl } };
```

## Response exitoso

```json
{
  "lat": "25.686600",
  "lng": "-100.316100"
}
```

## Response error

```json
{
  "error": "No se encontraron coordenadas",
  "url": "https://www.google.com/maps/place/..."
}
```

## Notas

- El frontend tiene un **fallback local**: si n8n no responde o la URL no se resuelve,
  intenta extraer coordenadas directamente del URL con regex. Esto funciona para URLs
  largas de Google Maps pero NO para URLs cortas (`maps.app.goo.gl`).
- Para URLs cortas, se necesita el workflow de n8n que siga los redirects.
- Las coordenadas se guardan en `ops_kiosk_geo_lat` y `ops_kiosk_geo_lng`
  en localStorage, y se usan como sitio central en `validarGeolocacion()`.
