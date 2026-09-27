# Purga del historial de git — PLAN, NO EJECUTADO

> **Esto es un plan. No se corrió nada.** Espera una ventana coordinada, porque
> el repo tiene trabajo de otras personas encima y la purga **reescribe todos los
> hashes**. Queda para cuando Esteban la dé.

**Fecha del plan:** 24-sep-2026 · **Ampliado:** 27-sep-2026 (#324)
**Estado actual:** `prospector/` enmascarado hacia adelante (commit `bc1624e`),
historial intacto. **El resto del repo NO esta enmascarado** — ver §4, que es la
parte nueva y la mas grande.

---

## Qué hay que purgar, y por qué no está escrito aquí

El repo es público, así que **este documento no puede listar los valores**. Si
escribiera los 191 correos para decir cuáles purgar, estaría publicándolos otra
vez —que es exactamente el error que ya cometí en el issue #285—.

Lo que sí se puede escribir es **de dónde salen**, para que el archivo de
reemplazos se genere en el momento de la purga y **nunca se commitee**:

| # | Qué | De dónde se extrae en el momento |
|---|---|---|
| 1 | **191 correos y 59 teléfonos del padrón** | Columnas `correoelec` y `telefono` de `prospector/datos/padron_denue.csv` en los commits anteriores a `bc1624e` |
| 2 | **11 correos de personas** en método, fixtures e historial | Diff de `bc1624e` — los valores que ese commit reemplazó por marcadores |
| 3 | **23 nombres completos** de personas reales | El mismo diff de `bc1624e`, más los 3 del segundo barrido |

**La herramienta ya trae el barredor**: `tests/test_sin_datos_personales.py` tiene
los regex que distinguen un correo de persona de un marcador. Los mismos sirven
para generar la lista desde el historial.

---

## §4 · LO QUE LA AUDITORIA DE #324 AGREGO, y es mas grande que §1–§3

La auditoria de #324 recorrio **los 594 blobs de texto de los 64 commits de todas
las ramas** con el escaner de la guardia -- mas la limpieza de etiquetas que #323
agrego-- y encontro esto:

| | valores distintos en el historial | de esos, VIVOS en HEAD |
|---|---|---|
| Correos de persona | **198** | **46** |
| Telefonos | **62** | **10** |

**Por que §1–§3 no los cubrian: la guardia solo mira `prospector/`.** Su `RAIZ` se
calcula como `parent.parent` del archivo de la prueba, que vive en
`prospector/tests/`. Todo lo que esta fuera de esa carpeta nunca fue barrido, y el
plan de purga se escribio sobre lo que la guardia veia.

**Estos datos NO son solo historial: 46 correos y 10 telefonos estan en el arbol de
trabajo de un repo `public`, ahora mismo.** Purgar el historial sin enmascararlos
primero no sirve de nada: el commit siguiente los vuelve a subir.

### Donde estan, por familia (rutas, nunca valores)

| Familia | Archivos | Distintos en HEAD | Que es |
|---|---|---|---|
| `shared/config/empleados-master.json` | 1 | 27 correos · 5 tels | **El maestro de empleados.** Es la concentracion mas alta del repo, y es dato de RH |
| `shared/incidencias-asistencia.json` | 1 | 28 correos · 4 tels | Incidencias de asistencia, con el correo de cada quien |
| `shared/operaciones/*.json`, `shared/comercial/*.json` | 4 | ~15 correos | Destinatarios de watchdogs y SLA |
| `docs/**` (md y json de workflows) | 28 | ~60 apariciones | Correos citados en especificaciones, recons y auditorias |
| `docs/watchdogs/prototipo/correo-propuesto.html` | 1 | 7 correos | **Un prototipo HTML**, la misma clase de artefacto que destapo #323 |
| `comercial/**`, `CLAUDE.md` | 4 | ~10 apariciones | Correos en documentacion de proceso |
| `seguridad/index.html` | 1 | 1 telefono | **Y GitHub Pages esta habilitado** en este repo: conviene confirmar si esa pagina se sirve |

### Los dominios que aparecen, y por que importan

Sin la parte local, que es la que identifica a la persona:

    @fts.mx        190 apariciones   empleados de FTS
    @gmail.com      50               correos personales de empleados
    @hotmail.com     5               idem
    @gmai.com        4               un typo de gmail, repetido
    @outlook.com     1
    @gepp.com        4               CLIENTE
    @mdlz.com        1               CLIENTE
    @calbeeamerica.com  1            CLIENTE

**Los seis de dominio de cliente son los peores**, aunque sean los menos: un correo
de empleado propio es un problema laboral y de RGPD/LFPDPPP; el de la contraparte de
un cliente es eso **y** un problema comercial.

### Los patrones a purgar

Los mismos tres regex ya escritos, aplicados a **todo el repo** y no solo a
`prospector/`. En el momento de la purga, el archivo de reemplazos se genera asi
-- y sigue sin entrar al repo--:

```bash
# La herramienta de #324 enumera todo y NO imprime ningun valor:
python prospector/herramientas/auditar_historial.py . > /tmp/inventario.txt

# El archivo de reemplazos se genera con los MISMOS regex de la guardia,
# resolviendo los literales en el momento. /tmp, nunca el repo.
```

| # | Patron | Alcance | Sustituto |
|---|---|---|---|
| 4a | `CORREO` de `test_sin_datos_personales.py`, menos `PERMITIDO` y `DOMINIO_EJEMPLO` | **todo el repo**, todas las ramas | `[correo]@<dominio>` conservando el dominio |
| 4b | `TELEFONO` del mismo archivo | **todo el repo** | `[telefono]` |
| 4c | Nombres completos de los registros de `shared/config/empleados-master.json` y `shared/incidencias-asistencia.json` | literal, resuelto en el momento | `[persona NN]` |

**4c es el que no tiene atajo.** Igual que los 23 nombres de §3: no hay regex que
distinga un nombre de una razon social sin falsos positivos, asi que hay que
escribirlos, y por eso el archivo de reemplazos no puede vivir en el repo.

### El orden correcto, que NO es purgar primero

1. **Enmascarar hacia adelante** los 37 archivos de HEAD, como se hizo con
   `prospector/` en `bc1624e`. Sin esto, la purga se deshace en el commit siguiente.
2. **Ampliar la guardia a todo el repo** una vez enmascarado. Hoy no se puede: la
   prueba pasaria a rojo con 46 hallazgos y bloquearia a los demas frentes, que no
   tienen por que parar por esto.
3. **Purgar el historial**, con §1–§4 en el mismo `reemplazos.txt` y en la misma
   ventana. Dos purgas son dos `push --force --mirror`, y el segundo cuesta lo mismo
   que el primero.

### Lo que la auditoria NO encontro, y hay que decirlo

**Cero** correos y **cero** telefonos escondidos por etiquetas HTML -- el hueco de
#323-- en los 594 blobs del historial. El unico caso de esa forma fue el prototipo
de #323, que se detecto antes de commitearlo. **Ese vector no dejo rastro en el
historial y queda cerrado.**

---

## El procedimiento

### 0 · Antes de tocar nada

```bash
# Un clon espejo aparte. La purga NO se hace sobre un clon de trabajo.
git clone --mirror git@github.com:yinyo1/fts-suite.git fts-suite-purga.git
cp -a fts-suite-purga.git fts-suite-RESPALDO.git     # respaldo del respaldo
pip install git-filter-repo
```

### 1 · Generar la lista de reemplazos, FUERA del repo

```bash
# reemplazos.txt vive en /tmp o en la sesion. NUNCA se commitea.
# Formato de --replace-text: una linea por reemplazo, literal==>sustituto
#   o  regex:<patron>==>sustituto
```

**Tres reglas que no se negocian al armar ese archivo:**

1. **`reemplazos.txt` no entra al repo.** Ni al índice, ni a `.gitignore` como
   si fuera a estar ahí. Se genera, se usa, se borra.
2. **Los correos van por regex, no uno por uno.** Escribir 191 literales es
   escribir 191 correos en un archivo. El regex de
   `test_sin_datos_personales.py` los cubre y no los nombra.
3. **Los nombres van por literal**, porque no hay regex que distinga «Juan
   Pérez» de una calle sin falsos positivos. Esos 23 sí hay que escribirlos, y
   es la razón principal de que el archivo no pueda vivir en el repo.

### 2 · La purga

```bash
cd fts-suite-purga.git
git filter-repo --replace-text /tmp/reemplazos.txt
```

**Por qué `--replace-text` y no `--path-glob --invert-paths`:** borrar el archivo
entero del historial se llevaría también el mapa de plantas, que es dato
estructural válido y la única forma de comparar el corte 05/2026 contra el
siguiente. Se purga el **contenido**, no el archivo.

### 3 · Empujar, que es el paso que rompe cosas

```bash
git push --force --mirror origin
```

**Esto reescribe `main` y todas las ramas.** De aquí sale todo el costo.

---

## Checklist post-purga

### Lo que hay que verificar

- [ ] `python3 -m pytest prospector/tests -q` — las 108 pasan en el clon purgado.
- [ ] El barredor sobre **todo el historial y todo el repo**, con la herramienta
      de #324 — que recorre blobs, no diffs, y quita etiquetas antes de buscar:
      `python prospector/herramientas/auditar_historial.py .` → los cuatro
      apartados en cero.
- [ ] El padrón sigue con `dominio_correo` y con 238 filas en el último commit.
- [ ] `git log --oneline | wc -l` — el mismo número de commits que antes. Si bajó,
      `filter-repo` se llevó algo más de lo pedido.
- [ ] Los 4 issues de prospección (#268, #281, #284, #285) **siguen citando SHAs
      que ya no existen**. Hay que corregir esas citas o dejar constancia.

### Lo que hay que avisar, antes y después

- [ ] **Avisar a todos los que tengan clon**, antes del push. Su `git pull` va a
      fallar y la salida no explica por qué. Cada uno tiene que:
      `git fetch --all && git reset --hard origin/main`, o reclonar.
- [ ] **PRs abiertos** — hoy son #283 y #286, y ninguno toca `prospector/`. Un PR
      abierto sobre hashes reescritos puede quedar inconsistente: conviene
      mergearlos o cerrarlos **antes**.
- [ ] **Workflows y despliegues que fijen un SHA.** Verificado hoy: este repo no
      tiene workflows. Verificar otra vez el día de la purga.
- [ ] **Railway / cualquier despliegue** que apunte a `main` va a ver toda la
      historia como nueva. Confirmar que no dispare un redespliegue no deseado.

### Lo que la purga NO arregla, y hay que decirlo

- [ ] **Los forks conservan los objetos.** GitHub no los purga en cascada.
- [ ] **El caché de GitHub** puede servir un commit purgado por su SHA un rato.
      Para borrarlo de verdad hay que **abrir ticket con GitHub Support** pidiendo
      la limpieza de referencias sueltas. Sin ese ticket la purga es parcial.
- [ ] **Los issues #268, #284 y #285 no los toca `filter-repo`.** Viven en la base
      de datos de GitHub, no en git. Ver abajo.
- [ ] **El historial de edición de los issues tampoco.** Editar el cuerpo de un
      issue deja la versión anterior visible en «edited».

---

## Los issues son un problema aparte, y peor

`git filter-repo` no toca issues. Y de los cuatro de prospección:

| Issue | Qué contiene |
|---|---|
| **#268** | 2 nombres completos de personas reales |
| **#281** | **limpio** |
| **#284** | 1 correo de persona (×3 apariciones) y 1 nombre (×3) |
| **#285** | **12 correos de personas y 3 nombres** — el issue que reportaba haberlos sacado |

**Ningún PR de `fts-suite` tocó `prospector/`**: los 5 commits fueron directo a
`main`. Ahí no hay exposición.

Para los issues hay dos caminos, y ninguno es limpio:

1. **Editar el cuerpo por API** (`issue_write` / `PATCH /issues/:n`). Quita el
   dato de la vista actual y del índice de búsqueda, **pero GitHub conserva la
   versión anterior en el historial de edición**, visible con un clic. Es
   mitigación, no borrado. No rompe el hilo ni las referencias cruzadas.
2. **Borrar y recrear el issue.** Sí borra, y rompe la cadena
   #268 ← #281 ← #284 ← #285, los enlaces desde el `CHANGELOG` y cualquier cita
   externa. **No recomendado.**

> **Recomendación: (1) para los tres issues, y ticket a GitHub Support** si se
> quiere que el historial de edición también desaparezca. Es la misma
> conversación que el caché de git, y conviene pedir las dos cosas en un solo
> ticket.

---

## Lo que yo haría, en orden

1. **Los issues primero, por API.** Es reversible, no rompe nada, y baja la
   exposición hoy. El #285 es el más urgente: concentra 12 de los 16 correos.
2. **El ticket a GitHub Support**, pidiendo las dos limpiezas —referencias
   sueltas de git y historial de edición de issues—. Tarda, así que se abre
   temprano.
3. **La purga de git al final**, en ventana coordinada, cuando #283 y #286 estén
   cerrados y con aviso previo a todos los que tengan clon.

Hacerlo al revés —purgar git primero— deja los issues expuestos y encima invalida
los SHAs que los issues citan.
