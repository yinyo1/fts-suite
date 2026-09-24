# Kiosko de asistencias · Simulador y pruebas

Modelo en memoria, sin dependencias (Node 18 o más), en `tests/kiosko-blindaje/`. No toca producción: ni Odoo, ni n8n, ni la red.

| Archivo | Qué es |
|---|---|
| `odoo-modelo.js` | `hr.attendance` y `_check_validity` deducida (ramas A, B, C; `modelo.md` §1) |
| `sistema.js` | `kiosk/checkin`, `estado-empleado`, `resolver`, los dos olvidos, el watchdog y lo que pinta el kiosko ante 200, 499, timeout o error. Un interruptor por bloque (B1..B10) |
| `invariantes.js` | I1 a I9 como funciones, y la búsqueda de salida para I4 |
| `monitor.js` | Ejecuta pasos y revisa las invariantes después de cada uno |
| `escenarios.js` | El caso de Germán (con los ids de ejecución y de Odoo en cada paso) y un escenario mínimo por bloque |
| `aleatorio.js` | Semanas aleatorias con un empleado "razonable" que persigue lo que de verdad hizo, con fallas inyectadas; y el reductor de contraejemplos |
| `bloques.json` | Qué bloques están construidos (hoy ninguno) |
| `*.test.js`, `run.js` | Las pruebas |

## Cómo correrlo

```bash
node tests/kiosko-blindaje/run.js                 # todo, contra el diseño de HOY
node tests/kiosko-blindaje/run.js --diseno=nuevo  # todo, con B1..B10 encendidos
node tests/kiosko-blindaje/caso-german.test.js --narrar
node tests/kiosko-blindaje/arbol.test.js
node tests/kiosko-blindaje/bloques.test.js --bloque=B3
node tests/kiosko-blindaje/aleatorio.test.js --semillas=500
```

Códigos de salida: el diseño de HOY sale en 0 aunque viole invariantes (es un reporte). Sale en 1 si el caso de Germán deja de reproducirse, si un bloque marcado como construido regresiona, si un escenario de bloque deja de demostrar algo, o si el diseño nuevo viola cualquier invariante.

## Qué demuestra hoy

1. **Caso Germán, diseño de HOY:** llega al bloqueo con los mismos dos mensajes de Odoo que producción (`hasn't checked out since 09/17/2026 06:58:11 AM` y `already checked in on 09/18/2026 10:27:49 AM`) y deja 15589 abierto envolviendo a 15588. Viola I1, I2, I3, I4 (empleado y RH), I5, I6 e I9.
2. **Caso Germán, diseño nuevo:** mismas intenciones, cero violaciones.
3. **Árbol de falla:** cualquiera de P1 a P6, quitada sola, evita el bloqueo.
4. **Bloques:** los 10 están PENDIENTE (fallan hoy) y todos pasan con el diseño nuevo; cada uno, solo, lleva su escenario de violado a limpio.
5. **Aleatoria:** contra el diseño de HOY, las 9 invariantes caen, con contraejemplos mínimos de 2 a 4 eventos. Con el diseño nuevo, 300 semanas en cero.

## Límites honestos del modelo

- Modela, no prueba producción. Que el modelo del bloque pase no prueba que la implementación real cumpla; por eso el PR que construye un bloque también actualiza su modelo y, donde se pueda, agrega un smoke en vivo.
- La rama A de `_check_validity` nunca se observó; viene de la lógica pública de Odoo 17.
- La saturación de n8n (una ejecución para tres POST abortados, como en 104284) está modelada como "ventana en la que n8n no ejecuta".
- El empleado "razonable" de la prueba aleatoria es una política. Una persona real puede hacer cosas que la política no hace; los contraejemplos son un piso, no un techo.
