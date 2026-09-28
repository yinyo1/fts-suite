# El sistema visual de Odoo 19, medido

**Para qué.** Las pantallas de la suite que tocan **órdenes y cotizaciones** deben verse y
comportarse **como Odoo 19**, no parecidas. La razón no es estética: el equipo ya sabe usar
esa pantalla, y cada diferencia es algo que tiene que reaprender. Es el mismo ejercicio que
se hizo con el pad y Excel.

**Alcance.** Sólo órdenes y cotizaciones. **El resto de la suite no cambia de aspecto.**

---

## 0 · De dónde salen estos números, y qué NO prueban

Se leyeron del **código fuente de Odoo 19**, no de un blog ni de memoria:

| archivo | bytes | qué aporta |
|---|---|---|
| `addons/web/static/src/scss/primary_variables.scss` | 8,680 | tipografía, paleta, campos, radios, espaciados |
| `addons/web/static/src/scss/secondary_variables.scss` | 2,000 | fondos, separadores, el puente a Bootstrap |
| `addons/web/static/src/scss/ui.scss` | 4,629 | deshabilitado, desplegables, atención |
| `addons/web/static/src/views/list/list_renderer.scss` | 17,947 | la rejilla de renglones |
| `addons/web/static/src/core/notebook/notebook.scss` | 3,255 | las pestañas |

Bajados el **28-sep-2026** de `raw.githubusercontent.com/odoo/odoo/19.0/…`, los cinco con
**HTTP 200**.

⚠️ **Lo que esto NO prueba, y hay que decirlo:** que la instancia de FTS se vea exactamente
así. **`serviciosfts.odoo.com` no se alcanza desde el contenedor** (`CONNECT tunnel failed,
response 403`, la misma política de red que bloquea Pages), así que **no se pudo medir la
pantalla real**. Lo que hay es la **fuente de la versión**, que es la mejor fuente
disponible y no es lo mismo. Dos cosas concretas quedan por confirmar con un ojo humano
frente a la pantalla —están marcadas 🔎 abajo.

---

## 1 · Tipografía

| qué | valor | variable de Odoo |
|---|---|---|
| Familia | la del sistema: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, "Noto Sans", Arial, sans-serif` | `$o-system-fonts` |
| Monoespaciada | `SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace` | `$o-font-family-monospace` |
| Base | **14 px** | `$o-font-size-base` |
| Base en táctil | 16 px | `$o-font-size-base-touch` |
| Pequeña | 13 px | `$o-font-size-base-small` |
| Más pequeña | 12 px | `$o-font-size-base-smaller` |
| **Etiqueta de campo** | **11.2 px** (14 × 0.8) | `$o-label-font-size-factor: 0.8` |
| Interlineado | 1.5 · corto 1.25 · largo 2 | `$o-line-height-base` |
| Pesos | 400 normal · 500 medio · 700 negrita | `$o-font-weight-*` |

📌 **Odoo NO carga una tipografía de fuera para el backend.** Usa la del sistema
operativo. Eso es una ventaja que conviene copiar tal cual: cero peticiones a un CDN de
fuentes, cero salto al cargar, y se ve nativa en cada máquina. **No traer Google Fonts a
estas pantallas.**

---

## 2 · Paleta

### Grises — son los de Bootstrap 5, sin tocar
```
100 #f8f9fa   200 #e9ecef   300 #dee2e6   400 #ced4da   500 #adb5bd
600 #6c757d   700 #495057   800 #343a40   900 #212529
```

### Marca — ✅ **MEDIDO en la instancia el 28-sep-2026**
El código define **dos** y no son el mismo morado:

```
$o-community-color:  #71639e      ← el que la FUENTE pone como primario
$o-enterprise-color: #714B67
$o-brand-primary:    $o-community-color   (en el código de Community)
```

**FTS corre Odoo 19 SaaS Enterprise**, y el módulo `web_enterprise` —que es privado y no se
pudo leer— reasigna `$o-brand-primary` al color Enterprise.

✅ **El 28-sep-2026 Esteban lo midió con el cuentagotas sobre una cotización real: el
primario de la instancia es `#714B67`.** La deducción era correcta, y ahora ya no es una
deducción. `--o19-brand` se queda como está.

📌 **Se deja escrito el camino, no sólo el resultado.** Durante unas horas este valor fue una
suposición razonable marcada como tal, y eso es exactamente lo que permitió resolverla en
diez segundos: la variable estaba en UN sitio y la nota decía qué faltaba comprobar. Una
suposición escrita como hecho se habría quedado ahí para siempre.

### Semánticos
```
éxito   #28a745      info     #17a2b8
aviso   #ffac00      peligro  #dc3545
```
⚠️ El **aviso de Odoo es `#ffac00`**, un ámbar más saturado que el `#ffc107` de Bootstrap.

### Texto y fondos
| qué | valor |
|---|---|
| Texto principal | `#212529` (gris 900) |
| Texto atenuado | `rgba(73,80,87, .76)` — gris 700 al **76 %** |
| Encabezados | negro puro |
| Fondo de la vista | **blanco** |
| Fondo del cliente web | `#f8f9fa` (gris 100) |
| Deshabilitado | opacidad **.5** |

---

## 3 · El campo, que es lo que más se nota

| qué | valor | variable |
|---|---|---|
| Relleno vertical | **2 px** | `$o-input-padding-y` |
| Relleno horizontal | **4 px** | `$o-input-padding-x` |
| Fondo | **transparente** | `$o-input-bg` |
| Fondo si es inválido | rojo al **10 %** sobre el fondo | `$o-input-invalid-bg` |
| Borde si es obligatorio | **el morado de marca** | `$o-input-border-required` |
| Radio | **4 px** (chico 3, grande 6) | `$o-border-radius` |

📌 **Las tres cosas que hacen que una pantalla «se sienta Odoo», y que casi nadie copia:**

1. **El campo no tiene caja hasta que lo tocas.** Fondo transparente y casi sin relleno: un
   formulario de Odoo en reposo parece un documento, no un formulario. La caja aparece al
   enfocar.
2. **Lo obligatorio se marca con el MORADO DE MARCA, no con rojo.** El rojo queda reservado
   para lo que está **mal**; lo que **falta** es morado. Son dos estados distintos y Odoo los
   distingue por color. *(La V1.45 de la suite usa rojo para los dos — ver §6.)*
3. **La etiqueta es chiquita: 11.2 px.** Casi el 80 % del texto. El dato manda, la etiqueta
   acompaña.

---

## 4 · Espaciados, y las alturas que hay que respetar

| qué | valor |
|---|---|
| Espaciador base | **16 px** (= 1 rem) |
| Unidad de forma | **5 px** |
| Relleno horizontal de vista | 16 px |
| Alto de la barra de estado | **33 px** |
| Alto del botón de estadística | 44 px |
| Desplegable: relleno | 20 px horizontal, 3 px vertical |
| Desplegable: alto máximo | 70 vh |
| Modal grande / mediano | 980 px / 650 px |
| Ancho mínimo de la hoja | **990 px** |
| Ancho mínimo de una insignia | 3 caracteres |

⚠️ **El `$o-form-sheet-min-width: 990px` es la confesión de que Odoo de escritorio no está
pensado para un teléfono.** Por eso el límite de §7: a 380 px manda lo que se lea.

---

## 5 · Las pestañas y la rejilla

**Pestañas** (`.o_notebook`): pestañas de Bootstrap con el borde inferior abierto hacia el
contenido — la activa pinta su borde inferior **del color del fondo**, que es el truco que
las «pega» al panel. Borde en reposo **transparente**; al pasar el ratón, gris 200. Los
encabezados hacen **scroll horizontal** cuando no caben, y en móvil se esconde la barra del
scroll.

**Rejilla de renglones** (`.o_list_renderer`): todo por variables CSS propias
(`--ListRenderer-table-padding-x`, `--ListRenderer-thead-padding-y`), relleno de celda
**chico** (`$table-cell-padding-*-sm`), alto máximo de control dentro de celda **30 px**, y
las insignias a 17 px de alto. Es una tabla **densa**: cabe mucho renglón en poca pantalla,
que es justo lo que una orden necesita.

---

## 6 · Dónde CHOCA con lo que la suite ya tiene, y qué se hizo

El complemento dice: aplicarlo **donde no choque con lo ya hecho**. Tres choques reales:

| choque | qué hace Odoo | qué hace la suite hoy | decisión |
|---|---|---|---|
| **Lo que falta** | borde **morado** | borde **rojo** (`.cfx-mal`) | **Se deja el rojo por ahora** y se apunta. Cambiarlo toca los mensajes de los candados, que se acaban de probar; hacerlo esta noche sería mover el piso de lo recién validado. |
| **Campo sin caja** | transparente, 2 px de relleno | caja visible, relleno cómodo | **Se deja lo de la suite** en el bloque de la confirmación: sus campos son de **captura activa**, no de lectura de un documento. Aplica cuando la cotización nazca en la suite (fase 2). |
| **Ancho mínimo 990 px** | hoja de escritorio | la suite sirve desde 380 px | **Gana la suite.** El límite de §7 es explícito. |

**Lo que SÍ se aplicó esta noche, porque no choca con nada:** la tipografía del sistema con
sus tamaños medidos, la paleta de grises, los semánticos con el ámbar correcto, los radios,
y los espaciados. Vive en `comercial/machote/css/odoo19.css` como **variables**, no como
estilos sueltos.

---

## 7 · Los límites, escritos para que no se discutan dos veces

1. **El resto de la suite no cambia.** Esto es sólo órdenes y cotizaciones.
2. **Copiar el aspecto no es copiar el comportamiento.** Si Odoo hace algo que estorba, se
   dice y se decide — no se imita por imitar. *(Ejemplo ya decidido: el campo sin caja es
   bonito para leer y peor para capturar.)*
3. **Nada de traerse una biblioteca de estilos de Odoo al repo.** Esto es propio, con las
   medidas medidas. Cero dependencias nuevas.
4. **A 380 px manda lo que se lea.** Odoo de escritorio no está pensado para un teléfono, y
   su propio `min-width: 990px` lo dice.

---

## 8 · Lo que falta, para no fingir que está completo

- ~~El morado vivo~~ — ✅ **resuelto el 28-sep-2026: `#714B67`**, medido con cuentagotas.
- 🔎 **El aspecto del campo enfocado y del inválido** en Enterprise: el `web_enterprise` es
  privado y puede alterarlos. La fuente da el Community.
- **La barra de estado de arriba** (`.o_statusbar_status`): se tiene su **altura** (33 px)
  pero no su hoja de estilo; el archivo no está en la ruta esperada de la 19.0 y el listado
  del árbol por el API devolvió 403 desde el contenedor.
- **Los nombres de campo en español** de la pantalla de órdenes: ésos **sí** hay que sacarlos
  de la instancia, no del código, porque dependen de la traducción instalada. Es lo que más
  va a importar en la fase 2 y es trabajo de una pasada con la pantalla enfrente.

---

## 9 · Lo que la instancia enseñó, y el código no decía

De la misma mirada del 28-sep-2026 salieron tres cosas que **ninguna hoja de estilo podía
contar**, y están en `docs/trazabilidad/ESPECIFICACION-CONFIRMACION.md` §9:

1. **Los campos de Studio que hacen falta YA existen** (`Purchase order No.`,
   `Purchase order or email file`, `Cotizador`, y una pestaña `Handoff` propia). No hay que
   crear nada: hay que **llenarlos desde la suite**.
2. **El bloque de condiciones comerciales al pie llega de plantilla con los huecos vacíos.**
   Por eso el compromiso tiene que ser CAMPO y no párrafo: un hueco en un párrafo no se puede
   exigir.
3. 🔴 **`Payment Terms` arranca en «Immediate»**, así que quien no lo cambia deja lo que vino
   solo — y desde fuera una orden puesta a propósito y una que nadie tocó **se ven idénticas**.
   De ahí sale la regla que vale para TODOS los candados: **un valor por omisión no es una
   elección**.

📌 **Y la lección sobre este documento:** las tres se vieron **mirando la pantalla**, no
leyendo el código — igual que los bugs de `CLAUDE.md` §20 #12. Un sistema visual se puede
leer del código; **cómo se usa de verdad, no.**
