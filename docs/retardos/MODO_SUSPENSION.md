# Retardos v2 · Modo suspensión

Issue #334. Documento para decidir **si** y **cuándo** el nivel 4 de la escalera deja de ser
"nivel de suspensión alcanzado, no aplicado" y pasa a emitir el citatorio y la propuesta de
suspensión. **Nada de esto se ha ejecutado.** El sistema arranca y se queda en
`sin_suspension` hasta que Esteban, RH y Legal corran la sección 5 a mano.

## 1. Por qué se arranca sin suspensiones

- **La suspensión es la única medida que quita salario.** Si el Reglamento Interior de
  Trabajo no la prevé, o la hora de entrada con que se midió estaba mal, el daño es real y
  difícil de revertir. Aviso, carta compromiso y acta no quitan nada: dejan constancia.
- **Las horas de entrada de Odoo todavía no están revisadas.** La calibración de la sección
  3 lo muestra: con la hora de la ficha, casi un tercio de la plantilla activa llegaría a
  acta o más en septiembre; con la hora sugerida por su propio historial, una persona.
  Una diferencia así es de datos, no de conducta.
- **Legal no ha validado los textos.** Ver `PARA_LEGAL.md`.

Mientras tanto la escalera funciona completa hasta el acta, y el nivel 4 se registra:

- el caso abre en estado `RETENIDO` con el motivo "Nivel de suspensión alcanzado, no
  aplicado (modo sin suspensión). Cuenta como antecedente.";
- no se manda correo a la persona ni se emite hoja;
- aparece en el panel en la cubeta "Suspensión alcanzada, no aplicada" y en la columna
  "Suspensión no aplicada" de Reincidencia.

## 2. Qué dispara la recomendación de cambiar

Los disparadores viven en `retardos.config.alerta_disparadores` (nace `confirmado=false`).
Cuando uno se cumple, `evaluar_alertas` (corre dentro de `verificar`, dos veces al día) crea
una alerta **"Recomendación: activar modo suspensión"**:

- se manda por correo a Esteban y RH;
- se repite en el resumen semanal hasta que alguien la atienda;
- en el panel, pestaña Reincidencia, RH o Dirección eligen **cambiar**, **posponer N
  semanas** o **descartar con motivo**, y cada decisión va a la bitácora.

**Ninguna opción cambia el modo.** "Cambiar" sólo registra la decisión; el modo se cambia
con la sección 5.

| Tipo | Disparador | Valor inicial |
|---|---|---|
| Individual | Nivel de suspensión alcanzado en N meses dentro de la ventana | 2 meses en 90 días |
| Individual | N actas firmadas y validadas dentro de la ventana | 2 en 90 días |
| Individual | Un caso nuevo el mes siguiente a firmar un acta | sí |
| Global | Tras N semanas en real, los retardos semanales no bajaron el porcentaje mínimo contra la línea base de sombra | 8 semanas, 30 % |
| Global | Más de este porcentaje de la plantilla activa está en acta o más | 15 % |

Los globales no se evalúan mientras `real_desde` sea `null`. La fecha la escribe el paso a
real (`PASO_A_REAL.md` §2).

## 3. Calibración con agosto y septiembre

Corrida el 28-sep-2026 en producción con `retardos.simular_alertas`, de sólo lectura
(consola TMP, ejecución 116687). Sólo agregados. Supuestos de la función:

- cada umbral cruzado abre caso;
- carta y acta se firman el mes en que se alcanzan (cota alta);
- no se aplica ninguna suspensión.

Escalera 1/3/5/7, tolerancia 20 minutos, 29 activos. Cobertura: primera checada del
29-jun al 25-sep, 65 días, así que la ventana de 90 días todavía no se llena.

| Mes | Hora | En acta o más | % plantilla | Suspensión 2 meses | 2 actas | Reincide tras acta |
|---|---|---|---|---|---|---|
| ago | ficha | 8 | 27.6 | 0 | 0 | 0 |
| sep | ficha | 9 | 31.0 | 6 | 8 | 8 |
| ago | sugerida | 0 | 0.0 | 0 | 0 | 0 |
| sep | sugerida | 1 | 3.4 | 0 | 0 | 0 |

Variantes: con 3 actas en vez de 2, septiembre con hora de ficha baja a 0 en ese
disparador; con ventana de 60 días, la hora sugerida no cambia.

**Lectura.** Con la hora de la ficha, los disparadores sonarían en el segundo mes para
seis a nueve personas, y el global del 15 % sonaría desde el primero. Con la hora sugerida,
nada suena. La alerta no está calibrada mal: está midiendo contra horas de entrada que RH
no ha revisado.

**Recomendación:**

1. Dejar los valores iniciales. 2 meses, 2 actas y el 15 % separan bien a quien reincide de
   verdad cuando la hora es la correcta.
2. **No confirmar `alerta_disparadores` hasta que RH termine la pestaña Calidad de datos.**
   Si se pasa a real antes, esperar ruido de alertas el segundo mes y descartarlas con el
   motivo "hora de entrada sin revisar".
3. Repetir esta calibración después de la revisión, con la misma consulta:
   ```sql
   SELECT retardos.simular_alertas('{"desde":"2026-08-01","hasta":"2026-09-30","hora":"actual"}'::jsonb);
   ```

## 4. Checklist antes de cambiar

Todo debe estar resuelto y anotado en #334 antes de la sección 5.

| # | Condición | Quién |
|---|---|---|
| 1 | El Reglamento Interior de Trabajo prevé la suspensión por retardos, y está depositado ante la autoridad laboral (LFT art. 423 fr. X, art. 424) | Legal |
| 2 | Legal validó los textos del citatorio y la propuesta de suspensión, y el párrafo de reincidencia de carta y acta (marcado "pendiente de validación de Legal") | Legal |
| 3 | Se comunicó a la plantilla, por escrito y con acuse, la fecha desde la que la suspensión aplica | RH |
| 4 | Legal decidió si las actas firmadas **antes** del cambio cuentan como antecedente (`antecedentes_previos_cuentan`) | Legal |
| 5 | RH revisó la hora de entrada de todas las personas en Calidad de datos | RH |
| 6 | El sistema lleva al menos un periodo completo en real sin incidentes | Esteban |
| 7 | Nómina sabe cómo recibe una suspensión programada (el panel la registra; Nómina la descuenta) | RH y Nómina |

## 5. El cambio y su reversa

Correr en la consola de Postgres de Railway o en `psql`, **no** por el nodo Postgres de n8n
(`BLINDAJE.md` §6). Cambiar la fecha y el usuario antes de correr. La fecha es el primer
día cuyos retardos pueden llevar a suspensión; la misma que se comunicó en el punto 3.

**Regla de no retroactividad.** Con `modo_suspension_desde` escrita, un nivel 4 sólo se
emite si los retardos contados **desde esa fecha** alcanzan el umbral por sí solos. Si se
alcanza por reincidencia, el retardo nuevo tiene que ser posterior a la fecha. El
antecedente firmado también, salvo que `antecedentes_previos_cuentan` sea `true`. Lo que
no cumple queda `RETENIDO` con su motivo. Los casos `RETENIDO` de antes del cambio **no** se
reabren.

**Cambio:**

```sql
BEGIN;
UPDATE retardos.config SET valor = to_jsonb('AAAA-MM-DD'::text), confirmado = true,
       actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave = 'modo_suspension_desde';
UPDATE retardos.config SET valor = 'false'::jsonb, confirmado = true,        -- o 'true' si Legal lo decidió
       actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave = 'antecedentes_previos_cuentan';
UPDATE retardos.config SET valor = '"con_suspension"'::jsonb, confirmado = true,
       actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave = 'modo_sanciones';
SELECT retardos.log(NULL, 'modo_sanciones', 'quien.ejecuta', 'Cambio a con_suspension (#334, MODO_SUSPENSION.md)',
       jsonb_build_object('desde', retardos.cfg('modo_suspension_desde'),
                          'antecedentes_previos_cuentan', retardos.cfg('antecedentes_previos_cuentan')));
COMMIT;
```

**Read-back del cambio** (tiene que salir así):

```sql
SELECT jsonb_build_object(
  'modo_sanciones',               retardos.cfg_txt('modo_sanciones'),                 -- con_suspension
  'modo_suspension_desde',        retardos.cfg_txt('modo_suspension_desde'),          -- la fecha
  'antecedentes_previos_cuentan', retardos.cfg('antecedentes_previos_cuentan'),       -- lo que decidió Legal
  'nivel_4_habilitado',           retardos.nivel_habilitado(4::smallint),             -- true
  'bitacora',                     (SELECT max(creado_at) FROM retardos.bitacora WHERE evento = 'modo_sanciones'));
```

**Reversa** (en cualquier momento; los citatorios ya enviados no se recuperan, los casos
abiertos siguen su curso y RH los puede cancelar con motivo):

```sql
BEGIN;
UPDATE retardos.config SET valor = '"sin_suspension"'::jsonb,
       actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave = 'modo_sanciones';
SELECT retardos.log(NULL, 'modo_sanciones', 'quien.ejecuta', 'Regreso a sin_suspension (#334, MODO_SUSPENSION.md)');
COMMIT;
```

`modo_suspension_desde` se deja escrita a propósito: si se vuelve a activar, la regla de no
retroactividad debe partir de la fecha nueva, y ese valor se sobreescribe con el cambio.

**Read-back de la reversa:**

```sql
SELECT retardos.cfg_txt('modo_sanciones') AS modo,          -- sin_suspension
       retardos.nivel_habilitado(4::smallint) AS nivel_4;    -- false
```

**Probado en una copia local del esquema** (Postgres 16, las 6 migraciones) el 28-sep-2026:
cambio, read-back, reversa y read-back salieron como se describe. No se ha corrido en
producción.
