# Listo para usar de trabajo — lista de verificación

Corre `./prospector listo` para los tres primeros. Los conectores los comprueba
Claude llamándolos, porque desde Python no se ven.

---

## Lo que verifica la máquina

| # | Qué | Cómo se sabe | Umbral |
|---|---|---|---|
| 1 | **Padrón vigente** | `./prospector listo` | Menos de **6 meses** desde el corte. Pasado eso avisa —el INEGI publica dos cortes al año— y **no frena** |
| 2 | **Pruebas en verde** | `python3 -m pytest tests -q` | **146 de 146** |
| 3 | **La salida cae fuera del repo** | `./prospector listo` | La ruta **no** es relativa a la raíz del repositorio |

## Lo que solo Claude puede comprobar

| # | Qué | La comprobación real |
|---|---|---|
| 4 | **Odoo vivo** | Una lectura a `res.partner`. Si contesta `session expired`, reautenticar `FTS_Odoo` |
| 5 | **Outlook vivo** | Una búsqueda en el buzón. **La fuente más rentable de las dos corridas anteriores** |
| 6 | **WebSearch vivo** | Una consulta cualquiera. **Sin esto la cascada no sirve** |
| 7 | **WebFetch** | Bloqueado por egress en este entorno, medido. **Que salga bloqueado es lo esperado**, no una falla: M7 y M8 se declaran `sin_acceso` |

> **Por qué no los verifica el script:** decir que un conector está bien sin
> haberlo llamado es contar una declaración como evidencia — exactamente lo que
> la compuerta de agotado existe para impedir. La herramienta no se exime de su
> propia regla.

## La corrida de humo

Con una cuenta cualquiera, para confirmar que el arranque de **un comando**
funciona de punta a punta:

```bash
./prospector prospecta --empresa "Galletera Santa Maria"
```

Tiene que:

- [ ] abrir la corrida e imprimir **la ruta fuera del repo**;
- [ ] **inferir** ciudad, entidad, giro y dominio sin que se los digas;
- [ ] registrar **M13** con lo que el padrón contestó;
- [ ] imprimir el plan de **12 pasos** con los comandos ya escritos;
- [ ] terminar diciendo **qué paso toca** (`M0 · Odoo`).

Y los dos casos de borde:

```bash
./prospector prospecta --empresa "Bimbo"          # 3 plantas -> pregunta, salida 3
./prospector prospecta --empresa "Grupo Cuprum" --ciudad "San Nicolas" \
    --entidad "Nuevo León" --giro 331             # fuera del padrón -> bandera, arranca
```

- [ ] Con **Bimbo** pregunta en una línea y **no abre la corrida** — elegir una
      planta en silencio es el caso de los cinco DUNS de Ragasa.
- [ ] Con **Cuprum** levanta `FUERA_DEL_ALCANCE_DEL_PADRON`, dice que hace falta
      un corte **más amplio** —no más nuevo— y **arranca igual**.

---

## Lo que NO está listo, y conviene saberlo antes de usarla

| Qué | Estado |
|---|---|
| **La consulta puede ser falsa** | La compuerta exige que esté escrita; no puede comprobar que se corrió. **Es el hueco más grande que queda** |
| **`resultados` es palabra de Claude** | Decir 52 y entregar cero es legal. Lo contrario no |
| **El challenge no es la matriz completa** | Corre C1, C1-bis y la regla de raíces. Los cruces C2 a C9 están en el método y **no en código** |
| **Postgres** | Postergado a propósito. Los contactos viven en la sesión |
| **Fase 2 del padrón** | 95 plantas apartadas, bloqueadas por el tope de 128 MiB del runner de n8n |
| **Migraciones 010–013** | Escritas y **sin aplicar** en `fts-suite-db` |
