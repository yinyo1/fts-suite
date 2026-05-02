# Hatch — Procurement Infrastructure (FTS Suite Module)

Módulo de FTS Suite. Acceso restringido a usuarios con `role: "master"` (FTSAuth).

**Versión:** 0.4.1-integrated · Fase A+B · GitHub-as-DB (lectura) · FTSAuth integrated

---

## Estructura del módulo

```
/hatch/
├── index.html              # Aplicación completa (single-file SPA)
├── version.json            # Heartbeat y metadata
├── data/
│   ├── catalog.json        # Catálogo de productos (lectura)
│   └── logistics.json      # Paqueterías y tarifas (lectura)
└── README.md               # Este archivo
```

## Cómo funciona la persistencia

**Datos maestros (este repo):**
- `data/catalog.json` — productos, vendors, precios MX/USA
- `data/logistics.json` — paqueterías disponibles y tarifas base

**Datos de sesión (localStorage del navegador):**
- Sesión FTS Suite (gestionada por FTSAuth, key `fts_session`)
- Mercado seleccionado MX/USA
- Carrito en proceso (drafts antes de ejecutar orden)
- Histórico local de órdenes ejecutadas (Fase C lo migrará a n8n)

**Fallback:** Si `data/*.json` no se carga (red caída, archivo inexistente), el módulo usa datos default embedded en el HTML para no romper. Esto permite probarlo en local sin servidor.

## Cómo agregar un producto al catálogo

Editar `data/catalog.json` directamente y commit. Estructura:

```json
{
  "id": "kebab-case-unique-id",
  "brand": "Nombre del fabricante",
  "sku": "SKU oficial del fabricante",
  "title": "Título descriptivo completo",
  "category": "PLCs | HMI | VFDs | Sensores | ...",
  "keywords": ["lowercase", "keywords", "para", "matching"],
  "specs": [
    { "l": "Etiqueta corta", "v": "Valor" }
  ],
  "vendors": [
    {
      "name": "Distribuidor genérico (sin nombre real, vendor blind)",
      "mx": 1234,
      "us": 1300,
      "stock": 5,
      "eta": "1–2 días",
      "loc": "Ubicación",
      "recommended": false,
      "badges": ["auth", "credit", "cross", "dropship", "refurb", "partner", "warning", "used"],
      "savings": 100
    }
  ]
}
```

**Campos vendor opcionales:**
- `recommended: true` → muestra tag azul "Opción recomendada" sobre la card
- `badges` → array de keys que mapean a etiquetas visuales en el frontend
- `savings` → valor en USD que se muestra en verde como ahorro vs promedio

**Vendor blind:** Nunca poner nombres reales de proveedores en `name`. El vendor real solo se revela al ejecutar la compra (en Fase C, el real va a n8n).

## Cómo agregar una paquetería

Editar `data/logistics.json`:

```json
{
  "id": "snake_case_unique",
  "name": "Nombre comercial",
  "eta": "Tiempo y ruta",
  "price": 100
}
```

## URLs públicas

GitHub Pages servirá:
- `https://yinyo1.github.io/fts-suite/hatch/` → app
- `https://yinyo1.github.io/fts-suite/hatch/data/catalog.json` → catálogo
- `https://yinyo1.github.io/fts-suite/hatch/data/logistics.json` → logística

## Autenticación

Capa única: el launcher de FTS Suite muestra la tarjeta de Hatch solo si el usuario logueado tiene role master. El módulo verifica adicionalmente al cargar (defensa en profundidad) y redirige al launcher si no se cumple.

## Roadmap

- **Fase A** ✓ Refactor HTML para leer JSONs del repo
- **Fase B** ✓ Estructura inicial de datos
- **Fase C** Pendiente: workflows n8n para crear cotización + ejecutar orden + integración Odoo (sale.order + account.analytic.line)
- **Fase D** Pendiente: workflows de carga automática de catálogo (Mercado Libre API, Grainger scraper, bulk CSV upload)

## Acceso

Hatch usa el sistema de autenticación de FTS Suite (FTSAuth).
El acceso está restringido a usuarios con `role: "master"` en `shared/users-suite.json`.

Para dar acceso a otro usuario, asignarle role master en el JSON de usuarios o agregar lógica de permisos granulares en el módulo (no implementado en MVP).

La sesión persiste 30 minutos por inactividad (manejado por FTSAuth). Logout limpia la sesión globalmente para todo FTS Suite.
