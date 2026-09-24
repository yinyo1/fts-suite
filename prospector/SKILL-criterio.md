---
name: prospectar-contactos
description: Corre la cascada de busqueda de contactos de una planta industrial usando el orquestador de tools/prospeccion/. Usar cuando se pida prospectar una empresa, armar su ficha de contactos, o buscar quien compra mantenimiento, agua, vapor o servicios industriales en una planta. El orquestador manda el orden; esta skill aporta el criterio.
---

# Cascada de contactos

**El orquestador de `tools/prospeccion/` decide el orden. Tu aportas el criterio.**
No inventes pasos, no te adelantes, no cierres un modulo que no agotaste.

## El ciclo, siempre igual

```bash
cd tools/prospeccion
python3 -m flujo.orquestador siguiente --empresa "<empresa>"
```

Te dice que modulo toca, cuando se considera agotado y cuanto presupuesto
queda. Corres **ese** modulo, registras lo que encontraste, y lo cierras.

Si intentas saltarte algo, la compuerta te frena con el motivo. **La compuerta
tiene razon.** No la rodees: corre lo que falta.

## Que juzgas tu, y el codigo no puede

1. **Filtro de entidad.** ¿Es la misma empresa? *Metalsa Structural Products*
   de Roanoke **no** es *Metalsa* de Apodaca. Dos empresas de nombre parecido
   en paises distintos no son la misma por mas que el buscador las junte.
2. **Filtro de valor.** ¿Ese puesto compra, decide o influye la infraestructura
   que vende FTS? IT y RH que solo mencionan la palabra son **contexto, no
   objetivo**.
3. **El angulo tecnico.** Lee la prensa y saca de ahi **los titulos que el
   diccionario no tiene**: cogeneracion con vapor -> *jefe de calderas*;
   anodizado -> *tratamiento de superficie*; taller de pintura ->
   *superintendente de pintura*. Eso va a `vocabulario` y alimenta al motor.
4. **Las combinaciones.** El diccionario es un inventario de **piezas que se
   combinan**, no una lista de palabras. `"facilities manager"` trae al gerente;
   `facilities` suelto **no lo trae**. Medido.
5. **La cercania a la decision de obra.** Es el orden de la ficha, y **no** es
   el nivel de confirmacion ni la jerarquia.
6. **Lo sensible.** Un CV suelto con celular personal se marca
   `revision_humana: true` con su motivo. **Nunca entra a la ficha limpia.**

## Dos formas por puesto, siempre las dos

- busqueda **simple, sin operador** — destapa paginas de equipo y comunicados
  que `site:` filtra;
- `site:linkedin.com/in`.

La geografia va en el **texto** del query, no en un parametro.
A las consultas que buscan **personas** se les agrega `-jobs -empleos
-vacantes`; a las que buscan **vacantes**, obviamente no.

## Cuando el entorno te bloquea

**Declara, no falles y no inventes.** Si `WebFetch` no abre un PDF, el
documento se **vio existir** y no se leyo:

```bash
python3 -m flujo.orquestador cerrar --empresa "<empresa>" --modulo M8 \
  --estado sin_acceso --razon "WebFetch bloqueado: padrones vistos y no leidos"
```

Eso sale impreso en la ficha. **Un hueco declarado vale; uno inventado miente.**

## Lo que nunca haces

- **No raspas LinkedIn autenticado.** Ni con sesion prestada, ni headless
  logueado, ni extension. Arriesga el baneo de la cuenta de Rissia, de la que
  depende el remate de **todas** las fichas.
- **No gastas creditos de Lusha** sin autorizacion explicita por corrida.
- **No escribes a Odoo.** La cascada es de solo lectura.
- **No eliges en silencio** cuando dos fuentes chocan. El dato va EN CONFLICTO
  y lo decide un humano.
- **No reportas un dato de una sola fuente como confirmado.** Topa en SOLIDO.

## Antes de entregar

```bash
python3 -m flujo.orquestador challenge --empresa "<empresa>"
python3 -m flujo.orquestador ficha --empresa "<empresa>" --modo limpio
python3 -m flujo.orquestador ficha --empresa "<empresa>" --modo procedencia
```

El metodo completo, con el porque de cada regla, esta en
`docs/prospeccion/busqueda-encadenada-contactos.md`. Leelo antes de proponer
cambiar cualquier cosa de aqui.
