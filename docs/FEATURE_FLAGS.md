# Feature Flags activos en FTS Suite

Lista canónica de features con su estado actual y mecanismo de activación/desactivación. Mantener actualizado al introducir nuevos flags o cambiar defaults.

---

## Kiosk Operaciones (`operaciones/kiosk/`)

### `face_recognition` — verificación facial face-api.js

- **Estado:** **DESACTIVADO por default** (21-may-2026)
- **Archivo:** `operaciones/kiosk/js/kiosk.js` L37 (dentro de `loadKioskConfig()`)
- **Lectura:** `K.config.faceEnabled = localStorage.getItem('ops_kiosk_face_enabled') === '1'`

#### Cómo activar (por dispositivo)

```js
localStorage.setItem('ops_kiosk_face_enabled', '1')
// hard refresh (Ctrl+Shift+R)
```

#### Cómo desactivar

```js
localStorage.removeItem('ops_kiosk_face_enabled')
// o cualquier valor distinto de '1' ('', '0', 'false', etc.)
```

#### Threshold (si activado)

- `localStorage.ops_kiosk_face_threshold` — default `'0.5'`
- Semántica: **distance** euclidiana (menor = más parecido). `match = distance < threshold`.
- El "X%" mostrado al usuario es `similarity = (1 - distance) * 100`. Un "43%" significa distance ≈ 0.57 → rechazo bajo threshold 0.5.
- Recomendado por face-api.js: `'0.6'`.

#### Override CDN de modelos

- `localStorage.ops_kiosk_face_models_url` — útil para servir modelos desde server local (testing).
- Default: `https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights` (post-PR #44).

#### Histórico (cronología del incidente 21-may-2026)

| Periodo | URL modelos | Modelos cargan | Face valida | Bloqueo usuarios |
|---|---|---|---|---|
| d0aafaa..pre-fallo CDN | `cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights` | Sí (al inicio) | Sí | — (pocos usuarios) |
| Pre-PR #44 (CDN npm cae a 404) | mismo | **No** (throw silencioso) | **No** (bypass `!K.faceReady` L668) | 0 — nadie notaba |
| 20-may 22:55 PR #44 merge | `cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights` | **Sí** | **Sí (reactivado real)** | 4+ empleados rechazados 21-may |
| 21-may post-fix (este commit) | misma URL, feature opt-in | Sí solo si user opta | Solo si opta | 0 — PIN suficiente |

PR #44 (`d34d915`) accidentalmente "activó" una validación que llevaba semanas operando en bypass. El presente flag invierte el default a OFF mientras se completa el plan de reactivación bien hecho.

#### TODO para reactivación global responsable

- [ ] UI de config (en `config/index.html` que hoy no existe — el `operaciones/kiosk/config.html` redirige a un path roto).
- [ ] Subir fotos `image_512` o `image_1024` en Odoo (cambiar default de `ops_kiosk_field_photo`); `image_128` es muy poca señal para descriptor confiable.
- [ ] Fallback supervisor-approve cuando `match:false` (hoy solo `shake + clearPin`, sin escape).
- [ ] Threshold ajustable por dispositivo / global con UI.
- [ ] Mensajes claros al usuario (en lugar de "Rostro no coincide (43%)").
- [ ] Tests E2E con fotos reales pre-deploy.
- [ ] Métricas: rate de rechazo por empleado, calidad de foto en Odoo.

---

## Notas

- Este archivo es la **fuente única de verdad** para feature flags. Cualquier nuevo flag debe documentarse aquí en el mismo formato.
- Convención de naming: `ops_<modulo>_<feature>_<atributo>` para keys de `localStorage`.
- Convención de defaults: features experimentales/riesgosas son **opt-in** (`=== '1'`); features estables y maduras pueden ser opt-out (`!== '0'`).
