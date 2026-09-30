# Censo de callejones · un requisito enunciado sin puerta para cumplirlo

**Medido el 30-sep-2026 (V1.50), issue #294.** Recorrido en navegador desde los **dos**
caminos —la cotización y la vista de órdenes— con el caso peor: un machote **sin orden
ligada, sin cliente del catálogo y sin oportunidad**.

El guion que lo produce es [`comercial/machote/tests/capturas-v150.js`](../../comercial/machote/tests/capturas-v150.js);
se corre con `node comercial/machote/tests/capturas-v150.js` y deja las capturas en
`_capturas-v150/`. No se dedujo leyendo el código: en cada pantalla anota el texto, los
botones **con su estado**, y cuántos de ellos se pueden apretar de verdad.

---

## Qué cuenta como callejón

Una pantalla que **enuncia un requisito** y no ofrece manera de cumplirlo. No es lo mismo
que una puerta cerrada con su letrero: «el paso 3 está apagado a propósito, y éstas son las
tres condiciones para encenderlo» **no** es un callejón — dice qué falta, quién lo hace y
dónde está escrito. El callejón es el que deja sin respuesta la pregunta «¿y ahora qué
hago?».

⚠️ **Dos de los tres que se encontraron eran invisibles al releer el diff.** El segundo
sólo apareció midiendo con `document.elementFromPoint`, y el tercero, en una captura.

---

## 1 · ARREGLADO · El paso 1 desde la cotización (lo que reportó Esteban)

**Antes (V1.49).** Con una cotización sin orden ligada, el diálogo decía *«Esta cotización
no tiene ninguna orden ligada. Se liga antes de confirmar…»* y ofrecía **Cancelar** y un
**Continuar al checklist** deshabilitado. Nada más.

**Ahora (V1.50).** Medido a los cuatro anchos: **4 botones accionables, 1 apagado.**

```
× | Buscar la orden y ligarla | Y si esta cotización todavía no tiene orden… |
Cancelar | Continuar al checklist [apagado]
```

La puerta abre `comercial/machote/js/orden-buscar.js`, que busca **en el servidor**: entre
las órdenes del cliente de la cotización (el caso normal) o **por número** (cuando la orden
está a nombre de otro contacto, o cuando el cliente se escribió a mano). Se liga ahí mismo
y se sigue **derecho al checklist**, sin volver a pasar por el diálogo.

**Continuar sigue apagado**, y es correcto: que exista la puerta no relaja el requisito.

## 2 · ARREGLADO · El paso 1 desde la orden

Mismo defecto, camino espejo: *«Esta orden todavía no tiene ninguna cotización ligada»* sin
manera de ligarla. Ahora ofrece **«Elegir la cotización que manda»**, que abre `OrdenLigar`
—la pieza que **ya existía** y no se estaba ofreciendo en ese punto—. Medido: **3
accionables**, y el selector abre con 2 botones vivos.

## 3 · ARREGLADO · El checklist mandaba a una pantalla que él mismo tapaba

El peor de los tres, y el que ninguna prueba veía.

**Medido:** de los **8 candados que frenan** en el caso peor, **7 terminan en «Arriba, en
DATOS»**. Y dentro del cuadro había exactamente tres controles:

```
× | Cancelar | Confirmar en Odoo — apagado [apagado]
```

El botón de DATOS del machote **existe y está visible**, pero:

```js
document.elementFromPoint(centro del botón Datos)  →  puVelo
```

o sea que **el velo del checklist se come el clic**. La pantalla que el mensaje nombra
estaba tapada por la pantalla que lo dice, y la única salida era «Cancelar», que se lee
como abandonar.

**Ahora** el cuadro ofrece **«Abrir DATOS de la cotización (7 pendientes)»**, que cierra el
checklist y abre DATOS. Va **pegado al veredicto, arriba**, no al final: concatenado
abajo quedaba después de los ocho candados, y quien lee «Arriba, en DATOS» en el primero
tenía que bajar por todos para encontrarlo. **Eso lo dijo la captura de 1280, no la
prueba** —que pasaba igual, porque el botón existía y funcionaba.

Cuando la cotización **no está en este navegador** (caso de la vista de órdenes con un
machote ajeno) el botón **no se pone**: ahí la puerta de verdad no existe, y se dice con
esas palabras, con lo que sí se puede hacer —pedirle a quien la capturó que la complete,
con la lista de lo que falta a la vista para podérsela copiar—.

---

## Lo que NO es callejón (puerta cerrada con letrero)

| Pantalla | Qué dice | Por qué no es callejón |
|---|---|---|
| Paso 3 · Confirmar en Odoo | Apagado, con los tres cambios que lo encienden y el documento donde viven | Dice qué falta, quién lo aplica y dónde está escrito |
| Emitir la orden | Apagado, con el motivo medido (v2 tarda ~29 min, el navegador corta a los 10 s) | Igual: motivo real, no «no tienes permiso» |
| Cotización sin subir al servidor | «Guárdala una vez y vuelve: no hay que capturar nada de nuevo» | Remedio de un clic, dicho en la misma pantalla |
| Cliente escrito a mano | Deshabilita buscar-por-cliente **y dice por qué**, y manda a buscar por número | La otra puerta sirve y está al lado |
| `OrdenLigar` con machotes de otros | «Aquí sólo salen las de este navegador» | Dice que la lista es parcial; ver abierto #2 abajo |

---

## Abiertos · no se arreglaron, y por qué

### 1. La liga entera está inerte hasta que se publique `comercial/ordenes` 🔴

**En los DOS sentidos.** Ligar, desligar, buscar y la lista de órdenes pasan todas por ese
webhook, que **nace sin publicar**. Hoy la pantalla lo dice con nombre y remedio —«el
endpoint `comercial/ordenes` está construido y sin publicar; es un clic de quien administra
la suite»— en vez de «no se pudo contactar al servidor», pero **nada se puede ligar hasta
ese clic**.

Es lo único de esta entrega que **depende de Esteban**, y está en la sección de abajo.

### 2. Desde la orden sólo se pueden ofrecer machotes de ESTE navegador 🟡

`OrdenLigar` lista `MachoteApp.todos()`, que es la libreta local. Si la cotización la
capturó otra persona, quien mira la orden **no puede ligarla** — la pantalla lo dice, pero
el remedio («que la ligue esa persona») está fuera de la aplicación.

**Propuesta, cuando el endpoint esté publicado:** buscar cotizaciones del lado del servidor,
como ya se hace con las órdenes. `comercial/machotes-leer` ya lista por dueño y el admin ve
todas (#140), así que es un modo más, no una pieza nueva. **No se hizo ahora** porque el
endpoint todavía no se puede probar en vivo, y una búsqueda que no se puede probar con una
fila que deba salir no está verificada (§20 #11).

### 3. Las cinco duras y los diecisiete huecos siguen siendo trabajo de captura 🟢

No es un defecto: son los datos que faltan. Lo que cambió es que **ahora hay una puerta
desde donde se leen**. Con el machote del caso real el checklist muestra 8 que frenan —7 de
DATOS, 1 que se resuelve sola al abrir el cuadro— y las demás aparecen conforme se llenan.

---

## Qué tiene que publicar Esteban

**Un solo clic, en n8n:** publicar el workflow **`comercial/ordenes`**, id
**`y9hucRX0ZEExjIub`**.

- Leído el 30-sep-2026: `active: false` · `activeVersionId: null` · `triggerCount: 0` ·
  24 nodos. Nunca se ha publicado, y esta sesión no lo publicó a propósito.
- **Antes de publicarlo**, confirmar que `SUITE_JWT_SECRET` está en el entorno de n8n: es
  la misma que usan los demás endpoints de comercial. Si falta, el endpoint contesta
  `SECRETO_NO_CONFIGURADO` y lo dice con esas palabras.
- URL de producción:
  `https://primary-production-5c3c.up.railway.app/webhook/comercial/ordenes`.

**Qué se enciende con ese clic:** la vista de Órdenes de venta deja de decir «no se pudo
contactar al servidor», y el paso 1 puede ligar de verdad por los dos caminos.

**Lo que NO enciende:** el paso 3 sigue apagado, y el botón de emitir también. Son
interruptores aparte, en `almacen.js`, con sus condiciones en
[`POR-QUE-NO-SE-PODIA-CONFIRMAR.md`](POR-QUE-NO-SE-PODIA-CONFIRMAR.md).

⚠️ **De los cinco modos, cuatro son de lectura o escriben en la BASE; sólo `descripcion`
escribe en Odoo**, y escribe un campo de texto (`x_studio_proyect_description`) releyéndolo
después para contestar con lo que Odoo tiene, no con lo que se pidió. Rechaza una
descripción vacía en vez de borrar la de Odoo: esta pantalla no tiene deshacer.

---

## Cómo volver a correr el censo

```bash
node comercial/machote/tests/capturas-v150.js
```

Imprime, por ancho, cuántos botones accionables hay en cada pantalla, y al final el censo
completo con el texto de cada una. **Las capturas se miran** — dos de los tres callejones de
arriba no se veían de otra forma.
