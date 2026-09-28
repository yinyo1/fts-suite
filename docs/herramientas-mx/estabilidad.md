# Estabilidad de la pila

Sesión nocturna 2 (#338). Script: `scripts/estabilidad.py`. Datos: `datos/estabilidad.json`. El análisis es estático, sin inercia de frenado ni empujones.

## Datos y supuestos

**Del fabricante** (milwaukeetool.com, leído en la sesión 1):
- 8420: 610 × 482 × 502 mm, 13.2 kg. Su cajón grande abre al frente.
- 8443: 564 × 414 × 363 mm, 10.2 kg.
- 8444: mismas medidas que la 8443, 10.9 kg.

**Supuestos**, paramétricos, en el script:
- Borde de apoyo lateral a 226.0 mm del centro y delantero a 280.0 mm.
- Centro de gravedad de la 8420 vacía en [0.0, -40.0, 220.0].
- Correderas de extensión total: el cajón sale 318 mm.
- Cajón vacío: {'48-22-8443': 1.4, '48-22-8444': 1.3, '48-22-8447': 1.4, '48-22-8442': 1.6} kg.
- 8447 y 8442 pesan lo mismo que la 8444.
- Las cajas de arriba pueden quedar con su frente de 564 a lo largo de la 8420, de modo que los cajones abren de lado (**orientación A**), o giradas, abriendo al frente (**orientación B**). Se corren las dos.

**Carga:** la de cada cajón según `interferencias_3d.json` (herramienta + PETG), y también cada cajón lleno a su capacidad.

**Criterio:**
- La pila se voltea si el centro de gravedad, con el cajón abierto, pasa el borde de apoyo.
- Con inclinación, al centro de gravedad se le suma alto × tan(5°) hacia el lado que abre.
- El ángulo de vuelco es atan((borde − cg) / alto del cg).

## Resultado

| Pila | Alto (mm) | Orientación | Peor caso | Masa (kg) | Alto del cg (mm) | Margen plano (mm) | Margen con 5° (mm) | Ángulo de vuelco | Carga extra antes de voltear con 5° |
|---|---|---|---|---|---|---|---|---|---|
| BASE | 1228 | A | BASE C4 | 59.7 | 650 | 184.1 | 127.2 | 15.8° | 39.7 kg |
| BASE | 1228 | A | BASE C5 | 59.7 | 650 | 187.6 | 130.8 | 16.1° | 42.1 kg |
| BASE | 1228 | A | BASE C6 | 59.7 | 650 | 187.6 | 130.7 | 16.1° | 43.5 kg |
| BASE | 1228 | A | BASE C7 | 59.7 | 650 | 188.6 | 131.7 | 16.2° | 45.4 kg |
| BASE | 1228 | A | BASE C1 | 59.7 | 650 | 180.6 | 123.7 | 15.5° | 33.4 kg |
| BASE | 1228 | A | BASE C2 | 59.7 | 650 | 186.8 | 129.9 | 16.0° | 36.4 kg |
| BASE | 1228 | A | BASE C3 | 59.7 | 650 | 188.2 | 131.3 | 16.1° | 38.2 kg |
| BASE | 1228 | A | TODOS los de la caja de arriba | 59.7 | 650 | 111.8 | 55.0 | 9.8° |  |
| BASE | 1228 | B | BASE C4 | 59.7 | 650 | 242.4 | 185.5 | 20.4° | 80.5 kg |
| BASE | 1228 | B | BASE C5 | 59.7 | 650 | 245.9 | 189.1 | 20.7° | 85.9 kg |
| BASE | 1228 | B | BASE C6 | 59.7 | 650 | 245.9 | 189.0 | 20.7° | 90.1 kg |
| BASE | 1228 | B | BASE C7 | 59.7 | 650 | 246.9 | 190.0 | 20.8° | 95.2 kg |
| BASE | 1228 | B | BASE C1 | 59.7 | 650 | 238.9 | 182.0 | 20.2° | 65.1 kg |
| BASE | 1228 | B | BASE C2 | 59.7 | 650 | 245.1 | 188.2 | 20.7° | 70.6 kg |
| BASE | 1228 | B | BASE C3 | 59.7 | 650 | 246.5 | 189.6 | 20.8° | 74.7 kg |
| BASE | 1228 | B | TODOS los de la caja de arriba | 59.7 | 650 | 170.1 | 113.3 | 14.7° |  |
| BASE + ELE | 1591 | A | BASE C4 | 75.1 | 804 | 188.4 | 118.1 | 13.2° | 46.2 kg |
| BASE + ELE | 1591 | A | BASE C5 | 75.1 | 804 | 191.2 | 120.9 | 13.4° | 48.9 kg |
| BASE + ELE | 1591 | A | BASE C6 | 75.1 | 804 | 191.2 | 120.9 | 13.4° | 50.6 kg |
| BASE + ELE | 1591 | A | BASE C7 | 75.1 | 804 | 192.0 | 121.7 | 13.4° | 52.7 kg |
| BASE + ELE | 1591 | A | BASE C1 | 75.1 | 804 | 185.6 | 115.3 | 13.0° | 39.2 kg |
| BASE + ELE | 1591 | A | BASE C2 | 75.1 | 804 | 190.6 | 120.2 | 13.3° | 42.3 kg |
| BASE + ELE | 1591 | A | BASE C3 | 75.1 | 804 | 191.7 | 121.3 | 13.4° | 44.3 kg |
| BASE + ELE | 1591 | A | ELE C1 | 75.1 | 804 | 191.9 | 121.6 | 13.4° | 35.8 kg |
| BASE + ELE | 1591 | A | ELE C2 | 75.1 | 804 | 195.2 | 124.9 | 13.6° | 37.6 kg |
| BASE + ELE | 1591 | A | ELE C3 | 75.1 | 804 | 202.9 | 132.6 | 14.2° | 41.0 kg |
| BASE + ELE | 1591 | A | ELE C4 | 75.1 | 804 | 202.9 | 132.6 | 14.2° | 42.0 kg |
| BASE + ELE | 1591 | A | TODOS los de la caja de arriba | 75.1 | 804 | 167.7 | 97.3 | 11.8° |  |
| BASE + ELE | 1591 | B | BASE C4 | 75.1 | 804 | 245.8 | 175.5 | 17.0° | 95.7 kg |
| BASE + ELE | 1591 | B | BASE C5 | 75.1 | 804 | 248.7 | 178.3 | 17.2° | 101.8 kg |
| BASE + ELE | 1591 | B | BASE C6 | 75.1 | 804 | 248.6 | 178.3 | 17.2° | 106.7 kg |
| BASE + ELE | 1591 | B | BASE C7 | 75.1 | 804 | 249.4 | 179.1 | 17.2° | 112.7 kg |
| BASE + ELE | 1591 | B | BASE C1 | 75.1 | 804 | 243.0 | 172.7 | 16.8° | 77.6 kg |
| BASE + ELE | 1591 | B | BASE C2 | 75.1 | 804 | 248.0 | 177.6 | 17.1° | 83.7 kg |
| BASE + ELE | 1591 | B | BASE C3 | 75.1 | 804 | 249.1 | 178.7 | 17.2° | 88.5 kg |
| BASE + ELE | 1591 | B | ELE C1 | 75.1 | 804 | 249.3 | 179.0 | 17.2° | 66.8 kg |
| BASE + ELE | 1591 | B | ELE C2 | 75.1 | 804 | 252.6 | 182.3 | 17.4° | 70.2 kg |
| BASE + ELE | 1591 | B | ELE C3 | 75.1 | 804 | 260.4 | 190.0 | 17.9° | 75.5 kg |
| BASE + ELE | 1591 | B | ELE C4 | 75.1 | 804 | 260.4 | 190.0 | 17.9° | 78.0 kg |
| BASE + ELE | 1591 | B | TODOS los de la caja de arriba | 75.1 | 804 | 225.1 | 154.8 | 15.6° |  |
| BASE + SOL | 1954 | A | BASE C4 | 101.5 | 1021 | 192.1 | 102.8 | 10.7° | 54.5 kg |
| BASE + SOL | 1954 | A | BASE C5 | 101.5 | 1021 | 194.2 | 104.9 | 10.8° | 57.4 kg |
| BASE + SOL | 1954 | A | BASE C6 | 101.5 | 1021 | 194.2 | 104.9 | 10.8° | 59.4 kg |
| BASE + SOL | 1954 | A | BASE C7 | 101.5 | 1021 | 194.8 | 105.5 | 10.8° | 61.8 kg |
| BASE + SOL | 1954 | A | BASE C1 | 101.5 | 1021 | 190.0 | 100.8 | 10.5° | 46.3 kg |
| BASE + SOL | 1954 | A | BASE C2 | 101.5 | 1021 | 193.7 | 104.4 | 10.7° | 49.7 kg |
| BASE + SOL | 1954 | A | BASE C3 | 101.5 | 1021 | 194.5 | 105.2 | 10.8° | 52.0 kg |
| BASE + SOL | 1954 | A | SOL C1 | 101.5 | 1021 | 184.1 | 94.8 | 10.2° | 37.6 kg |
| BASE + SOL | 1954 | A | SOL C2 | 101.5 | 1021 | 191.1 | 101.8 | 10.6° | 41.5 kg |
| BASE + SOL | 1954 | A | SOL C3 | 101.5 | 1021 | 190.5 | 101.2 | 10.6° | 43.0 kg |
| BASE + SOL | 1954 | A | SOL C4 | 101.5 | 1021 | 194.2 | 104.9 | 10.8° | 37.0 kg |
| BASE + SOL | 1954 | A | SOL C5 | 101.5 | 1021 | 200.3 | 111.0 | 11.1° | 40.1 kg |
| BASE + SOL | 1954 | A | SOL C6 | 101.5 | 1021 | 192.6 | 103.3 | 10.7° | 38.8 kg |
| BASE + SOL | 1954 | A | TODOS los de la caja de arriba | 101.5 | 1021 | 173.2 | 83.9 | 9.6° |  |
| BASE + SOL | 1954 | B | BASE C4 | 101.5 | 1021 | 248.6 | 159.3 | 13.7° | 117.5 kg |
| BASE + SOL | 1954 | B | BASE C5 | 101.5 | 1021 | 250.7 | 161.4 | 13.8° | 124.6 kg |
| BASE + SOL | 1954 | B | BASE C6 | 101.5 | 1021 | 250.7 | 161.4 | 13.8° | 130.7 kg |
| BASE + SOL | 1954 | B | BASE C7 | 101.5 | 1021 | 251.3 | 162.0 | 13.8° | 137.9 kg |
| BASE + SOL | 1954 | B | BASE C1 | 101.5 | 1021 | 246.6 | 157.3 | 13.6° | 95.6 kg |
| BASE + SOL | 1954 | B | BASE C2 | 101.5 | 1021 | 250.2 | 160.9 | 13.8° | 102.6 kg |
| BASE + SOL | 1954 | B | BASE C3 | 101.5 | 1021 | 251.0 | 161.8 | 13.8° | 108.4 kg |
| BASE + SOL | 1954 | B | SOL C1 | 101.5 | 1021 | 240.6 | 151.3 | 13.3° | 76.2 kg |
| BASE + SOL | 1954 | B | SOL C2 | 101.5 | 1021 | 247.6 | 158.3 | 13.6° | 82.4 kg |
| BASE + SOL | 1954 | B | SOL C3 | 101.5 | 1021 | 247.0 | 157.7 | 13.6° | 86.7 kg |
| BASE + SOL | 1954 | B | SOL C4 | 101.5 | 1021 | 250.7 | 161.4 | 13.8° | 70.2 kg |
| BASE + SOL | 1954 | B | SOL C5 | 101.5 | 1021 | 256.8 | 167.5 | 14.1° | 75.0 kg |
| BASE + SOL | 1954 | B | SOL C6 | 101.5 | 1021 | 249.1 | 159.8 | 13.7° | 74.9 kg |
| BASE + SOL | 1954 | B | TODOS los de la caja de arriba | 101.5 | 1021 | 229.7 | 140.4 | 12.7° |  |
| BASE + TUB | 1591 | A | BASE C4 | 77.2 | 820 | 188.7 | 116.9 | 13.0° | 47.1 kg |
| BASE + TUB | 1591 | A | BASE C5 | 77.2 | 820 | 191.4 | 119.7 | 13.1° | 49.8 kg |
| BASE + TUB | 1591 | A | BASE C6 | 77.2 | 820 | 191.4 | 119.6 | 13.1° | 51.5 kg |
| BASE + TUB | 1591 | A | BASE C7 | 77.2 | 820 | 192.2 | 120.4 | 13.2° | 53.7 kg |
| BASE + TUB | 1591 | A | BASE C1 | 77.2 | 820 | 185.9 | 114.2 | 12.8° | 39.9 kg |
| BASE + TUB | 1591 | A | BASE C2 | 77.2 | 820 | 190.8 | 119.0 | 13.1° | 43.1 kg |
| BASE + TUB | 1591 | A | BASE C3 | 77.2 | 820 | 191.8 | 120.1 | 13.2° | 45.1 kg |
| BASE + TUB | 1591 | A | TUB C1 | 77.2 | 820 | 181.4 | 109.7 | 12.5° | 33.5 kg |
| BASE + TUB | 1591 | A | TUB C2 | 77.2 | 820 | 193.4 | 121.6 | 13.3° | 38.3 kg |
| BASE + TUB | 1591 | A | TUB C3 | 77.2 | 820 | 202.4 | 130.6 | 13.9° | 42.5 kg |
| BASE + TUB | 1591 | A | TODOS los de la caja de arriba | 77.2 | 820 | 160.9 | 89.1 | 11.1° |  |
| BASE + TUB | 1591 | B | BASE C4 | 77.2 | 820 | 246.0 | 174.2 | 16.7° | 97.8 kg |
| BASE + TUB | 1591 | B | BASE C5 | 77.2 | 820 | 248.7 | 177.0 | 16.9° | 104.0 kg |
| BASE + TUB | 1591 | B | BASE C6 | 77.2 | 820 | 248.7 | 177.0 | 16.9° | 109.0 kg |
| BASE + TUB | 1591 | B | BASE C7 | 77.2 | 820 | 249.5 | 177.7 | 16.9° | 115.1 kg |
| BASE + TUB | 1591 | B | BASE C1 | 77.2 | 820 | 243.3 | 171.5 | 16.5° | 79.4 kg |
| BASE + TUB | 1591 | B | BASE C2 | 77.2 | 820 | 248.1 | 176.3 | 16.8° | 85.5 kg |
| BASE + TUB | 1591 | B | BASE C3 | 77.2 | 820 | 249.2 | 177.4 | 16.9° | 90.4 kg |
| BASE + TUB | 1591 | B | TUB C1 | 77.2 | 820 | 238.7 | 167.0 | 16.2° | 64.9 kg |
| BASE + TUB | 1591 | B | TUB C2 | 77.2 | 820 | 250.7 | 178.9 | 17.0° | 72.4 kg |
| BASE + TUB | 1591 | B | TUB C3 | 77.2 | 820 | 259.7 | 188.0 | 17.6° | 79.2 kg |
| BASE + TUB | 1591 | B | TODOS los de la caja de arriba | 77.2 | 820 | 218.2 | 146.5 | 14.9° |  |
| BASE + MED | 1591 | A | BASE C4 | 76.7 | 814 | 189.4 | 118.1 | 13.1° | 47.3 kg |
| BASE + MED | 1591 | A | BASE C5 | 76.7 | 814 | 192.1 | 120.9 | 13.3° | 50.0 kg |
| BASE + MED | 1591 | A | BASE C6 | 76.7 | 814 | 192.1 | 120.9 | 13.3° | 51.7 kg |
| BASE + MED | 1591 | A | BASE C7 | 76.7 | 814 | 192.9 | 121.6 | 13.3° | 53.9 kg |
| BASE + MED | 1591 | A | BASE C1 | 76.7 | 814 | 186.6 | 115.4 | 12.9° | 40.1 kg |
| BASE + MED | 1591 | A | BASE C2 | 76.7 | 814 | 191.5 | 120.2 | 13.2° | 43.3 kg |
| BASE + MED | 1591 | A | BASE C3 | 76.7 | 814 | 192.6 | 121.3 | 13.3° | 45.3 kg |
| BASE + MED | 1591 | A | MED C1 | 76.7 | 814 | 180.7 | 109.5 | 12.5° | 33.5 kg |
| BASE + MED | 1591 | A | MED C2 | 76.7 | 814 | 198.6 | 127.4 | 13.7° | 40.9 kg |
| BASE + MED | 1591 | A | TODOS los de la caja de arriba | 76.7 | 814 | 170.4 | 99.1 | 11.8° |  |
| BASE + MED | 1591 | B | BASE C4 | 76.7 | 814 | 246.7 | 175.5 | 16.9° | 97.9 kg |
| BASE + MED | 1591 | B | BASE C5 | 76.7 | 814 | 249.5 | 178.2 | 17.0° | 104.0 kg |
| BASE + MED | 1591 | B | BASE C6 | 76.7 | 814 | 249.4 | 178.2 | 17.0° | 109.1 kg |
| BASE + MED | 1591 | B | BASE C7 | 76.7 | 814 | 250.2 | 179.0 | 17.1° | 115.2 kg |
| BASE + MED | 1591 | B | BASE C1 | 76.7 | 814 | 244.0 | 172.7 | 16.7° | 79.4 kg |
| BASE + MED | 1591 | B | BASE C2 | 76.7 | 814 | 248.8 | 177.6 | 17.0° | 85.6 kg |
| BASE + MED | 1591 | B | BASE C3 | 76.7 | 814 | 249.9 | 178.6 | 17.1° | 90.5 kg |
| BASE + MED | 1591 | B | MED C1 | 76.7 | 814 | 238.1 | 166.8 | 16.3° | 65.0 kg |
| BASE + MED | 1591 | B | MED C2 | 76.7 | 814 | 255.9 | 184.7 | 17.4° | 76.7 kg |
| BASE + MED | 1591 | B | TODOS los de la caja de arriba | 76.7 | 814 | 227.7 | 156.5 | 15.6° |  |

## Conclusión

- **Con un cajón abierto, en ninguna combinación se voltea**, ni en piso plano ni con 5°. El peor caso es BASE + SOL, orientación A, cajón SOL C1: se voltea a los 10.2°, y con 5° le caben 37.6 kg más en ese cajón antes de voltear.
- **El caso más crítico es abrir todos los cajones de la caja de arriba a la vez:** BASE + SOL, orientación A, se voltea a los 9.6°. Con 5° sigue en pie, con 83.9 mm de margen.

**Reglas de uso**, que van a la checklist y a la capacitación:
1. **Un cajón abierto a la vez.** Se cierra antes de abrir otro.
2. **Nunca abrir cajones con el carrito en rampa.** Primero se lleva a piso plano y se frenan las ruedas contra algo. Esto importa sobre todo con el módulo de soldadura arriba: la pila mide 1,954 mm y con todo abierto se voltea a menos de 10°.
3. **Lo pesado va abajo.** El acomodo ya pone la 8444 debajo de la 8443. No se sube un módulo pesado (SOL) arriba de otro módulo.
4. **Nada colgado de las correderas abiertas.** La carga extra que aguanta un cajón abierto con 5° es la de la tabla, y es para herramienta dentro del cajón, no para apoyarse.

**Lo que falta para cerrar esto:**
- medir los apoyos reales de la 8420 (las patas y el ancho entre ruedas);
- confirmar la orientación con la que se acoplan las cajas;
- pesar un cajón vacío.

Los tres son supuestos en el script.
