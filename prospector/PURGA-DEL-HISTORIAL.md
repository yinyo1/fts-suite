# Purga del historial de git — PLAN, NO EJECUTADO

> **Esto es un plan. No se corrió nada.** Espera una ventana coordinada, porque
> el repo tiene trabajo de otras personas encima y la purga **reescribe todos los
> hashes**. Queda para cuando Esteban la dé.

**Fecha del plan:** 24-sep-2026 · **Estado actual:** enmascarado hacia adelante
(commit `bc1624e`), historial intacto.

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
- [ ] El barredor sobre **todo el historial**, no solo el árbol:
      `git log -p --all | grep -E '<el regex de correos>'` → cero.
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
