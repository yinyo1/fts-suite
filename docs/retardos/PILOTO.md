# Retardos v2 · Piloto de cinco personas

Issue #386. Pedido del 7-oct-2026: cinco personas reciben avisos **reales** desde que se mergea el PR #344; el resto de la plantilla sigue en **sombra** hasta el go-live general (`PASO_A_REAL.md`, una sola bandera).

Quién está en el piloto vive en la base, no en el repo: `retardos.config` clave `piloto_employee_ids` (ids de `hr.employee`). Los correos de copia también viven en la base (`aviso_cc_rh`, `aviso_cc_sin_jefe`).

## 1. Cómo arranca

1. El PR trae el archivo `retardos/config/piloto.json` con `"piloto": true`.
2. Mientras el PR no está mergeado, ese archivo no existe en `main`. El workflow `retardos/enviar` (cada 20 min, lunes a viernes de 7:00 a 20:59 CST) lo busca en `main`, recibe 404 y no hace nada.
3. Al mergear, la siguiente corrida de `retardos/enviar` lo encuentra. Como `raw.githubusercontent.com` cachea hasta unos 5 minutos, puede tardar una corrida más. En esa corrida, `retardos.por_enviar` escribe `piloto_inicio = now()` y deja `piloto_activado` en la bitácora. **Eso sólo habilita el piloto: no define desde cuándo cuenta.**
4. **Desde cuándo cuenta: `piloto_desde`, fecha fija a las 00:00 hora del centro** (`retardos_0012`, decisión del 7-oct-2026: **jueves 8-oct-2026**). Si el merge cae después, los retardos desde el 8 cuentan igual en cuanto se habilita. Un retardo del mismo día, aunque sea anterior a la hora del merge, cuenta.
   - **Retardos:** sólo cuentan los de la pista real con llegada desde `piloto_desde`. Nada anterior suma a retardos del mes, cartas, actas ni reincidencia. Los casos de octubre en sombra no se reenvían ni generan recordatorios. `detectar` corre a las 12:15 y a las 19:15.
   - **Jornada:** cuentan las semanas FTS (viernes a jueves) que **empiezan** desde `piloto_desde`: la primera es la del viernes 9 al jueves 15 (S42), y su corte (viernes 16 a las 8:00) abre el primer aviso de jornada real.
   - **Acta administrativa:** retenida hasta el go-live (`acta_solo_en_real`). Antes del lunes 12 el piloto sólo puede juntar retardos del jueves 8 y el viernes 9, así que en la práctica no se alcanza.
5. `piloto_inicio` queda fijado en la base. Borrar o cambiar el archivo después **no** lo mueve.

Si el merge cae fuera del horario de `retardos/enviar` (noche o fin de semana), el piloto arranca con la primera corrida del siguiente día hábil.

**Read-back de arranque:**

```sql
SELECT retardos.cfg('piloto_inicio')     AS piloto_inicio,      -- la hora de la primera corrida tras el merge
       retardos.cfg_txt('piloto_desde')  AS piloto_desde,       -- 2026-10-08: no cambia con el merge
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

**Volver a encender:** la misma sentencia con `'true'::jsonb`. Ojo: la pista real vuelve a contar desde `piloto_desde`, así que los retardos del periodo apagado pueden abrir casos reales. Para empezar de cero al re-encender, mover la fecha fija:

```sql
UPDATE retardos.config SET valor = to_jsonb(retardos.hoy_local()::text), actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave = 'piloto_desde';
```

**Para parar todo de inmediato**, piloto y sombra: despublicar `retardos/enviar` (`UqhsvXDZjOmatEql`) en la UI de n8n. Nada sale y todo queda en el outbox.

## 4. Agregar o quitar personas

```sql
UPDATE retardos.config SET valor = '[63, 101, 112, 75, 149]'::jsonb, actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave = 'piloto_employee_ids';
```

Una persona agregada después del arranque cuenta desde `piloto_desde`, no desde el día en que se agregó. Si eso importa, agréguela el mismo día del arranque o espere al go-live.

## 5. Cuando llega el go-live

El go-live general (`PASO_A_REAL.md` §2) es `modo = 'real'`. Las cinco personas siguen igual: su pista real ya contaba desde `piloto_desde`. El resto cuenta desde `real_desde` (**lunes 12-oct-2026, 00:00**), sea cual sea la hora del UPDATE. No hace falta apagar el piloto; si se apaga después del go-live, las cinco quedan como todos, contando desde `real_desde`.

## 5b. Casos de personas de RH

Los casos de Ana los atiende Magaly; los de Magaly, ella misma. En los dos, **toda resolución deja copia a Dirección** y los avisos de las dos llevan CC a Dirección. La base lo hace cumplir: si otra persona intenta resolverlos desde el panel, el servidor contesta `CASO_RH_OTRO_RESPONSABLE`; si falta el usuario asignado, `CASO_RH_SIN_RESPONSABLE`; si no hay correo para la copia, `COPIA_RH_FALTANTE`. El usuario de la suite de quien atiende vive en la base (`casos_rh_usuarios`), no en el repo.

## 6. Lo que el piloto NO cambia

- No activa suspensiones (`modo_sanciones = sin_suspension`).
- No calcula el premio de puntualidad: eso es de Nómina · Incidencias. El aviso sólo explica que es otra regla (5 minutos; Retardos usa 15).
- No toca a nadie fuera de la lista.
