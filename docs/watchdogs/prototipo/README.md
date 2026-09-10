# Prototipos del semáforo — cuál manda

## ✅ CANÓNICO: `semaforo-modulo.html`

**Un solo formato para el correo Y para el módulo.** Cinco secciones:

1. **🚨 No puede esperar** — cuenta por cobrar vencida, que vence dentro de 14 días, o por
   más de $1,000,000 MXN. **Se imprime siempre, haya cambiado o no.**
2. **✅ Se resolvió desde el reporte anterior** — pedían algo y ya no.
3. **Lo que cambió desde el reporte anterior** — entró, empeoró, mejoró o estrenó bandera.
4. **Siguen pendientes, sin cambio** — contados a diario, desplegados el lunes.
5. **Ya no piden nada** + **🔧 Problemas del propio reporte**.

Las cinco son **disjuntas** y el pie reconcilia la suma contra el encabezado.

## ⛔ SUPERSEDED: `correo-propuesto.html`

La maqueta original de #230. Proponía **tres** secciones y **no tenía la capa de siempre
visible**. Se queda en el repo como registro de la auditoría de forma que la originó —los
seis descuadres medidos, el vocabulario, los cuatro sistemas de color, la arqueología de
capas— que sigue siendo válida y es lo que justifica el formato nuevo.

**Su propuesta de estructura ya no aplica.** Con tres secciones, SO10337 —vencida hoy, la
que motivó todo esto— se esconde en «siguen pendientes, sin cambio», que no despliega entre
semana. Esa es exactamente la razón de la sección 1.

## Por qué UN solo formato

Si el correo y la pantalla se renderizan desde dos diseños distintos, divergen en dos
semanas y se pierde la única garantía que tiene el sistema: que las dos superficies digan
lo mismo porque leen el mismo snapshot y ninguna recalcula nada.

## Capturas

`modulo-operaciones.png` · `modulo-admin.png` — del canónico, a 980 px.
`correo-lunes.png` · `correo-diario.png` · `correo-escritura-fallida.png` — del renderizador
del correo tal como está desplegado hoy, que todavía **no** tiene las cinco secciones: eso
entra con el edit grande.
