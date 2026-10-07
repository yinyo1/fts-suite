# Retardos v2 · Reinicio de conteo (decisiones del 7-oct-2026)

Issue #386. **Nada de esto se ha ejecutado.** Se corre en este orden después del "va" de Esteban.

| Decisión | Qué la cumple |
|---|---|
| A. Piloto cuenta desde el jueves 8-oct, resto desde el lunes 12-oct, 00:00 CST | `retardos_0012`: `piloto_desde` y `real_desde` fijas |
| B1. Acta retenida hasta el go-live, piloto incluido | `retardos_0012`: `acta_solo_en_real` |
| B2. Cancelar los casos viejos | Paso 3 de este documento |
| B3. Casos de RH con responsable y copia a Dirección | `retardos_0012` + paso 2 |
| B4. Correo de FTS primero, personal sólo si no hay | Ya es la regla de hoy (`correo_modo = preferente`); RH corrige los datos |
| B5. `jornada_desde` alineado | `retardos_0012`: 9-oct para el piloto; el 16-oct del resto sale de `real_desde` |

## 1. Aplicar `retardos_0012`

Con el runner `retardos/db-migrate` (`7u2IPDSuX5x40TGY`), igual que las anteriores: `Set - Config` con el SHA del commit y `archivo = retardos/retardos_0012_conteo_desde_cero.sql`, ejecutar a mano y leer el read-back (12 migraciones).

**Read-back:**

```sql
SELECT retardos.cfg_txt('piloto_desde') AS piloto_desde,        -- 2026-10-08
       retardos.cfg_txt('real_desde')   AS real_desde,          -- 2026-10-12
       retardos.cfg_txt('jornada_desde') AS jornada_desde,      -- 2026-10-09
       retardos.nivel_habilitado(3::smallint) AS acta,          -- false mientras modo = sombra
       retardos.conteo_info() AS conteo;
```

## 2. Responsable de los casos de RH

El usuario de la suite de quien atiende (Magaly, `employee_id` 63) se escribe en la base, no en el repo:

```sql
UPDATE retardos.config SET valor = '{"63": "USUARIO_DE_LA_SUITE"}'::jsonb, confirmado = true,
       actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave = 'casos_rh_usuarios';
SELECT retardos.responsable_rh(101) - 'atiende_usuario', retardos.responsable_rh(63) - 'atiende_usuario';
```

Mientras no se escriba, **nadie** puede resolver un caso de Ana o de Magaly desde el panel (`CASO_RH_SIN_RESPONSABLE`). Es a propósito: falla cerrado.

## 3. B2: cancelar los casos viejos

Folios leídos en producción el 7-oct-2026 (ejecución 132369): los 21 de agosto y septiembre en `DETECTADO`, más `RET-2026-0003` (suspensión de septiembre en `ESCALADO`). La lista va explícita y además se exige el estado: si un caso cambió, no se toca.

```sql
WITH sel AS (
  SELECT id, folio FROM retardos.caso
   WHERE folio = ANY (ARRAY['RET-2026-0003','RET-2026-0004','RET-2026-0005','RET-2026-0006','RET-2026-0007','RET-2026-0008',
                            'RET-2026-0009','RET-2026-0010','RET-2026-0011','RET-2026-0012','RET-2026-0014','RET-2026-0015',
                            'RET-2026-0016','RET-2026-0017','RET-2026-0018','RET-2026-0019','RET-2026-0020','RET-2026-0021',
                            'RET-2026-0022','RET-2026-0023','RET-2026-0024','RET-2026-0025'])
     AND estado IN ('DETECTADO','ESCALADO'))
SELECT count(*) AS cancelados, jsonb_agg(folio ORDER BY folio) AS folios
  FROM sel, LATERAL (SELECT retardos.transicionar(sel.id, 'CANCELADO_POR_RH', 'sistema',
                       'Reinicio de conteo, decisión de Dirección 7-oct',
                       jsonb_build_object('decision', 'Dirección 7-oct-2026', 'issue', 386))) x;
```

Lo esperado: `cancelados = 22`. Cancelar es terminal: no hay reversa. La bitácora queda con actor `sistema`, el motivo y la decisión.

**Read-back:**

```sql
SELECT estado, count(*) FROM retardos.caso WHERE periodo IN ('2026-08','2026-09') GROUP BY 1 ORDER BY 1;
```

**Quedan abiertos, en sombra, 12 casos más** (5 de septiembre vencidos y 7 de octubre esperando firma). Con `retardos_0012` ya no vencen ni escalan; si se decide cancelarlos también, es la misma sentencia con su lista.

## 4. Merge del PR #344

Después de 1 a 3. Con el merge, `retardos/enviar` habilita el piloto en su siguiente corrida. Ver `PILOTO.md`.
