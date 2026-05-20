# Audit — Kiosk empleados fallback (hotfix 20260520)

**Fecha:** 2026-05-20
**Disparador:** Caída Railway 19-may-2026. Kiosk siguió funcionando, pero la lista de empleados que mostró eran los demos hardcoded (`Mateo Salazar`, `Felipe Pérez`, `Esteban De La Cruz`, `Ana Ramírez`, `Carlos Hernández`). PINs eran `1234/5678/0000/1111/2222`. Generó crisis comunicacional: usuarios pensaron que el sistema funcionaba normal e intentaron checkin contra demos.

## Comportamiento actual (pre-hotfix)

`operaciones/kiosk/js/kiosk.js:402-414`:

```javascript
const DEMO_EMPLEADOS = [
  { id:1, nombre:'Mateo Salazar',     puesto:'Ingeniero',  foto:'', pin:'1234' },
  { id:2, nombre:'Felipe Pérez',      puesto:'Supervisor', foto:'', pin:'5678' },
  { id:3, nombre:'Esteban De La Cruz',puesto:'Director',   foto:'', pin:'0000' },
  { id:4, nombre:'Ana Ramírez',       puesto:'Soldador',   foto:'', pin:'1111' },
  { id:5, nombre:'Carlos Hernández',  puesto:'Ayudante',   foto:'', pin:'2222' },
];
// + DEMO_SOS análogo
```

`loadEmpleados` (L416-429) y `loadSOs` (L431-443) tenían patrón idéntico:

```javascript
async function loadEmpleados(){
  if(K.config.demoMode || !K.config.n8nUrl){     // opt-in legítimo
    K.empleados = DEMO_EMPLEADOS.slice();
    return;
  }
  try{
    K.empleados = await window.OdooKiosk.getEmpleados();
  } catch(e){
    console.warn('Odoo no disponible, usando demo:', e);
    K.empleados = DEMO_EMPLEADOS.slice();   // ⬅ EL BUG: catch silencioso → demos
    K.demoMode = true;                       // runtime flag (separado de K.config.demoMode)
  }
}
```

UI `operaciones/kiosk/index.html:36-38`:

```html
<div class="kiosk-list" id="ksEmpleadosList">
  <div style="text-align:center;color:#666;padding:24px">Cargando empleados…</div>
</div>
```

Placeholder estático que nunca se reemplaza por mensaje de error. Cuando user tipea, `renderEmpleados()` toma su lugar mostrando datos (reales o demos, indistintamente).

**Footer connection status** (`updateConnStatus`, L1273-1278) lee `K.config.demoMode` (config explícita) en vez de `K.demoMode` (runtime fallback). Inconsistencia: footer dice `"conectado"` aunque internamente esté usando demos. Usuario engañado doblemente.

## Patrón de referencia — Mi Perfil login

`shared/mi-perfil/index.html:615-632` (`mp_load_empleados`):

```javascript
async function mp_load_empleados(){
  const status = $('mp-search-status');
  status.textContent = '⏳ Cargando empleados…';
  try {
    const res = await fetch(EMPLEADOS_ENDPOINT, { method:'POST', /*...*/ });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    _empleados = Array.isArray(data) ? data : (data && data.empleados) || [];
    status.textContent = _empleados.length + ' empleados disponibles';
  } catch(e) {
    status.textContent = '❌ Error cargando empleados: ' + e.message;
    _empleados = [];   // ⬅ clave: NO fallback a demos
  }
}
```

Mi Perfil ya implementaba el patrón correcto: `_empleados = []` en catch. El kiosk principal quedó atrás.

## Comparación side-by-side

| Aspecto | Mi Perfil (referencia) | Kiosk actual (bug) |
|---|---|---|
| Loading state | `'⏳ Cargando empleados…'` (texto inline) | Placeholder HTML estático que nunca actualiza |
| OK state | `'N empleados disponibles'` | Silencioso |
| Error state | `'❌ Error cargando empleados: HTTP 502'` + `_empleados=[]` | `console.warn` + `K.empleados=DEMO.slice()` + `K.demoMode=true` |
| Schema raro | `_empleados=[]` | `K.empleados=[]` (igual, pero sin warning) |
| Timeout fetch | Default browser | 10s × 3 intentos (~34s peor caso) |

## Fix aplicado (hotfix 20260520)

### Commit refactor — eliminar fallback automático
- `DEMO_EMPLEADOS`/`DEMO_SOS` renombrados a `_LEGACY_DEMOS_FALLBACK_REMOVED_20260520` con comentario explicativo. Solo accesibles por opt-in explícito `K.config.demoMode === true` (controlado por `localStorage.ops_demo_mode === '1'`, mantenido para testing).
- `loadEmpleados` / `loadSOs`: en `catch`, `K.empleados = []` / `K.sos = []`. **No fallback a demos.** Setea `K.empleadosState='error'` / `K.sosState='error'`.
- `updateConnStatus` lee también el state runtime, no solo `K.config.demoMode`.
- `KIOSK_BUILD` → `20260520-kiosk-fix-fallback-error-ux`.

### Commit feat — UX de error con banner + retry
- Nuevo wrapper en `#ks-search`: `#ksLoadEmp` (spinner+texto dinámico) y `#ksErrorEmp` (banner rojo + subtítulo + botón reintentar). Reemplazan el placeholder estático.
- Search input arranca `disabled`, se habilita solo en estado OK.
- Spinner reusa `@keyframes ksSpinAnim` ya existente.
- Texto del loading escala a `"Conectando con el servidor…"` después de 5s sin respuesta.
- Botón **Reintentar** dispara `loadEmpleados()` nuevamente. Banner muestra timestamp último intento + contador.
- Subtítulo del banner: instrucción de fallback humano ("registra tu hora manualmente en la libreta o avisa a tu supervisor").

## Decisión sobre el flag opt-in `localStorage.ops_demo_mode`

**Conservado.** Cuando `ops_demo_mode='1'` está explícitamente puesto, kiosk usa demos (escenario testing local sin n8n). Para el modo de producción (`'0'` o ausente), el catch ya no hace fallback. Esteban sigue pudiendo poner el flag a propósito para test sin red.

## Plan de rollback

Single PR. `git revert <merge-commit>` lo restaura completo en <1 min. GitHub Pages re-publishea automático.
