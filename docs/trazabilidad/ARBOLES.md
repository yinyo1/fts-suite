# Tres árboles reales, como están hoy

**Este repo es público:** aquí van números de documento, ids e indicadores relativos. Los
nombres de cliente y los importes están en `_privado/arboles-detalle.md`, que no se commitea.

Leído el 2026-09-24. ❌ marca una liga rota, ✅ una que funciona, ⚠️ una que existe a medias.

---

## 1 · SO11547 — el que factura bien y lo cuenta mal

```
oportunidad ✅ (existe y está ligada)
  └── machote ❌  (la orden es anterior a que la suite creara órdenes)
       └── SO11547 · SERVICIOS FTS · MXN · confirmada 2026-02-28 · cotizador Monty
            ├── project_id nativo ................. ❌ VACÍO
            ├── project_account_id nativo ......... ❌ VACÍO
            ├── x_studio_project_id_created_1 ..... ✅ proyecto 2302 (lo creó el radar)
            │     └── project.sale_order_id ....... ❌ VACÍO  (el radar no lo escribe)
            ├── analítica 3034 (plan 1) ........... ✅
            ├── número de PO del cliente .......... ❌ VACÍO
            ├── archivo de la PO .................. ✅ (hay archivo SIN número)
            ├── términos de pago .................. ✅ 60 días
            ├── facturas
            │    ├── INV1980 ... posted, pagada ... ❌ sin sale_line_ids
            │    └── INV1985 ... posted, pagada ... ❌ sin sale_line_ids · NO está en invoice_ids
            ├── presupuesto (budget 11 renglones) . ✅ ingreso, MO, materiales y 8 de comisiones
            │     ├── achieved de MANO DE OBRA .... ✅ 54 % del presupuestado
            │     └── achieved de MATERIALES ...... ⚠️ 0.9 % del costo real
            ├── libro analítico (2,408 renglones)
            │     ├── costo (601.84.01) ........... ✅ 817 renglones
            │     ├── mano de obra (Carga MO) ..... ✅ 70 renglones
            │     ├── IVA ......................... ⚠️ 859 renglones de ruido
            │     ├── base imponible .............. ⚠️ 662 renglones de importe cero
            │     └── INGRESO ..................... ❌ CERO renglones
            └── órdenes de compra ................. ⚠️ cuelgan por la analítica del renglón, 0 por cabecera
```

**Lo que este árbol enseña:** las dos facturas están pagadas y el proyecto **no tiene un solo
renglón de ingreso** en su libro analítico, mientras sí tiene todo el costo. Leído desde la
analítica, el proyecto pierde dinero. Leído desde la orden, Odoo declara facturado sólo lo de
la primera factura. **Ninguna de las dos lecturas es cierta.**

---

## 2 · SO11771 — el más grande, y el más suelto por arriba

```
oportunidad ❌ NO HAY
  └── machote ❌
       └── SO11771 · SERVICIOS FTS · MXN · confirmada 2026-07-24 · la mayor del periodo
            ├── project_id nativo ................. ✅ proyecto 2359
            ├── project_account_id ................ ✅
            ├── x_studio_project_id_created_1 ..... ✅ (el radar la alcanzó)
            │     └── project.sale_order_id ....... ❌ VACÍO
            ├── analítica 3101 (plan 1) ........... ✅
            ├── número de PO del cliente .......... ✅
            ├── archivo de la PO .................. ✅
            ├── términos de pago .................. ❌ VACÍO
            ├── facturas .......................... (ninguna todavía)
            ├── presupuesto (budget 3 renglones)
            │     ├── ingreso ..................... ✅ cuadra con el subtotal de la orden
            │     ├── MANO DE OBRA ................ ❌ budget_amount = −1  (esqueleto)
            │     └── MATERIALES .................. ❌ budget_amount = −1  (esqueleto)
            └── libro analítico
                  ├── costo acumulado ............. ✅ y es grande
                  └── ingreso ..................... (correcto que sea cero: no se ha facturado)
```

**Lo que este árbol enseña:** el proyecto de mayor monto del periodo no tiene oportunidad, no
tiene términos de pago, y su presupuesto de costo es **literalmente un `−1`** —el placeholder
que el radar escribe cuando no sabe los montos—. Hay costo real corriendo contra un
presupuesto que no existe. Nadie puede decir si va bien.

---

## 3 · SO10300 — el del anticipo hecho a mano

```
oportunidad ✅
  └── machote ❌
       └── SO10300 · SERVICIOS FTS · MXN · confirmada 2025-06-03 · cotizador Aldo
            ├── project_id nativo ................. ✅ proyecto 160
            │     └── project.sale_order_id ....... ✅ (creado por el camino nativo)
            ├── analítica 668 (plan 1) ............ ✅
            ├── número y archivo de PO ............ ✅ los dos
            ├── términos de pago .................. ✅
            ├── facturas (6, y aquí está la historia)
            │    ├── INV1881 ... anticipo ......... ❌ sin sale_line_ids
            │    ├── INV1954 ... CANCELADA ........ (intento fallido)
            │    ├── INV1955 ... CANCELADA ........ (segundo intento fallido)
            │    ├── INV1998 ... segundo anticipo . ❌ sin sale_line_ids
            │    ├── INV2019 ... NC de INV1881 .... ✅ reversed_entry_id · CFDI 01
            │    ├── INV2020 ... NC de INV1998 .... ✅ reversed_entry_id · CFDI 01
            │    └── INV2021 ... factura final .... ✅ CON sale_line_ids · CFDI 07 (aplica anticipo)
            ├── cuadre contable ................... ✅ los importes netean con el total de la orden
            ├── lo que Odoo declara ............... ⚠️ invoice_status «to invoice» con todo facturado
            ├── presupuesto (5 renglones) ......... ✅ ingreso, materiales, MO y 2 de comisiones
            │     ├── achieved de MATERIALES ...... ⚠️ 42 % del costo real del libro analítico
            │     └── achieved de INGRESO ......... ❌ cero, aunque el ingreso sí está en la analítica
            └── libro analítico (444 renglones)
                  ├── ingreso (401.01.01) ......... ✅ 7 renglones, cuadra con el subtotal
                  ├── costo (601.84.01) ........... ✅ 113 renglones
                  ├── nómina + Carga MO ........... ✅ 24 renglones
                  ├── IVA ......................... ⚠️ 148 renglones
                  ├── base imponible .............. ⚠️ 150 renglones de importe cero
                  ├── COMISIÓN como gasto ......... ❌ 1 renglón (2023.51) — lo que octubre prohíbe
                  └── una línea de proveedores .... ⚠️ 1 renglón de pasivo dentro del proyecto
```

**Lo que este árbol enseña:** el ciclo de anticipos **está bien hecho contablemente** —los
importes netean exacto— y **mal hecho relacionalmente**: cuatro de los seis documentos no
tienen liga de renglón, y la única que la tiene es la factura final. Es el retrato del §4.1:
no es descuido, es que nadie usa el asistente nativo de anticipos.

Y el `achieved` del ingreso está en cero **teniendo** el ingreso en la analítica, porque la
distribución de la factura final va **separada** (`{proyecto:100, rubro:100}`) en vez de
**compuesta** (`{"proyecto,rubro":100}`) — el problema R2 que CLAUDE.md §17 ya documenta,
vivo y medible en el documento más reciente de los tres.
