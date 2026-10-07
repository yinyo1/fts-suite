# Retardos v2 · Piloto de cinco personas

Issue #386. Pedido del 7-oct-2026: cinco personas reciben avisos **reales** desde que se mergea el PR #344; el resto de la plantilla sigue en **sombra** hasta el go-live general (`PASO_A_REAL.md`, una sola bandera).

Quién está en el piloto vive en la base, no en el repo: `retardos.config` clave `piloto_employee_ids` (ids de `hr.employee`). Los correos de copia también viven en la base (`aviso_cc_rh`, `aviso_cc_sin_jefe`).

## 1. Cómo arranca

1. El PR trae el archivo `retardos/config/piloto.json` con `"piloto": true`.
2. Mientras el PR no está mergeado, ese archivo no existe en `main`. El workflow `retardos/enviar` (cada 20 min, lunes a viernes de 7:00 a 20:59 CST) lo busca en `main`, recibe 404 y no hace nada.
3. Al mergear, la siguiente corrida de `retardos/enviar` lo encuentra. Como `raw.githubusercontent.com` cachea hasta unos 5 minutos, puede tardar una corrida más. En esa corrida, `retardos.por_enviar` escribe `piloto_inicio = now()` y deja `piloto_activado` en la bitácora.
4. **Desde `piloto_inicio`**, las cinco personas están en pista real:
   - **Retardos:** sólo cuentan los que ocurren después de `piloto_inicio`. Los de octubre anteriores se quedan en sus casos de sombra y no se reenvían. El primer aviso real sale con el siguiente retardo de cada persona; `detectar` corre a las 12:15 y a las 19:15.
   - **Jornada:** cuentan las semanas FTS (viernes a jueves) que **empiezan** después de `piloto_inicio`. Con merge el 7 u 8 de octubre, la primera semana real es la del viernes 9 al jueves 15, y su corte (viernes 16 a las 8:00) abre el primer aviso de jornada real.
5. `piloto_inicio` queda fijado en la base. Borrar o cambiar el archivo después **no** lo mueve.

Si el merge cae fuera del horario de `retardos/enviar` (noche o fin de semana), el piloto arranca con la primera corrida del siguiente día hábil.

**Read-back de arranque:**

```sql
SELECT retardos.cfg('piloto_inicio')     AS piloto_inicio,      -- la hora de la primera corrida tras el merge
       retardos.cfg('piloto_habilitado') AS habilitado,         -- true
       (SELECT max(creado_at) FROM retardos.bitacora WHERE evento = 'piloto_activado') AS en_bitacora;
```

El panel de RH lo dice arriba: "Piloto activo desde ...".

## 2. A quién le llega cada aviso

| Caso | Para | CC | Arriba del correo |
|---|---|---|---|
| Con jefe directo en Odoo | la persona | `aviso_cc_rh` + su jefe directo | nada |
| Sin jefe directo en Odoo | la persona | `aviso_cc_rh` + `aviso_cc_sin_jefe` | "Falta asignarle jefe en Odoo" |
| Jefe directo sin correo utilizable | la persona | `aviso_cc_rh` + `aviso_cc_sin_jefe` | aviso de jefe sin correo |
| La persona es su propio jefe (dirección) | la persona | `aviso_cc_rh` | nada |

Nadie recibe copia de su propio aviso: si alguien de `aviso_cc_rh` está en el piloto, su aviso le llega en Para y la copia va sólo a los demás. Los casos sin jefe también salen marcados en el panel, en la bandeja **Falta jefe en Odoo**.

## 3. Apagar el piloto (interruptor)

```sql
UPDATE retardos.config SET valor = 'false'::jsonb, actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave = 'piloto_habilitado';
SELECT retardos.cfg('piloto_habilitado');   -- read-back: false
```

- Lo pendiente de la pista real del piloto **vuelve a salir como sombra** al instante.
- Los retardos nuevos de esas personas cuentan en sombra, como los de todos.
- Los correos que ya salieron no se recuperan.

**Volver a encender:** la misma sentencia con `'true'::jsonb`. Ojo: la pista real vuelve a contar desde el `piloto_inicio` original, así que los retardos del periodo apagado pueden abrir casos reales. Para empezar de cero al re-encender:

```sql
UPDATE retardos.config SET valor = to_jsonb(now()::text), actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave = 'piloto_inicio';
```

**Para parar todo de inmediato**, piloto y sombra: despublicar `retardos/enviar` (`UqhsvXDZjOmatEql`) en la UI de n8n. Nada sale y todo queda en el outbox.

## 4. Agregar o quitar personas

```sql
UPDATE retardos.config SET valor = '[63, 101, 112, 75, 149]'::jsonb, actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave = 'piloto_employee_ids';
```

Una persona agregada después del arranque cuenta desde `piloto_inicio`, no desde el día en que se agregó. Si eso importa, agréguela el mismo día del arranque o espere al go-live.

## 5. Cuando llega el go-live

El go-live general (`PASO_A_REAL.md` §2) es `modo = 'real'`. Las cinco personas siguen igual: su pista real ya contaba desde `piloto_inicio`. El resto pasa a pista real desde ese instante. No hace falta apagar el piloto; si se apaga después del go-live, las cinco quedan como todos, contando desde `real_inicio`.

## 6. Lo que el piloto NO cambia

- No activa suspensiones (`modo_sanciones = sin_suspension`).
- No calcula el premio de puntualidad: eso es de Nómina · Incidencias. El aviso sólo explica que es otra regla (5 minutos; Retardos usa 15).
- No toca a nadie fuera de la lista.
