# Estabilidad de la pila

Sesión nocturna 2 (#338). Script: `scripts/estabilidad.py`. Datos: `datos/estabilidad.json`. El análisis es estático, sin inercia de frenado ni empujones.

## Datos y supuestos

**Del fabricante** (milwaukeetool.com, leído en la sesión 1):
- 8410 (base plana con ruedas, desde #343): 620 × 480 × 193 mm, 5.0 kg. Arriba van 8442, 8444 y 8443.
- 8443: 564 × 414 × 363 mm, 10.2 kg.
- 8444: mismas medidas que la 8443, 10.9 kg.

**Supuestos**, paramétricos, en el script:
- Borde de apoyo lateral a 210.0 mm del centro y delantero a 275.0 mm.
- Centro de gravedad de la 8410 vacía en [0.0, 0.0, 100.0].
- Correderas de extensión total: el cajón sale 318 mm.
- Cajón vacío: {'48-22-8443': 1.4, '48-22-8444': 1.3, '48-22-8447': 1.4, '48-22-8442': 1.6} kg.
- 8447 y 8442 pesan lo mismo que la 8444.
- Las cajas de arriba pueden quedar con su frente de 564 a lo largo de la 8410, de modo que los cajones abren de lado (**orientación A**), o giradas, abriendo al frente (**orientación B**). Se corren las dos.

**Carga:** la de cada cajón según `interferencias_3d.json` (herramienta + PETG), y también cada cajón lleno a su capacidad.

**Criterio:**
- La pila se voltea si el centro de gravedad, con el cajón abierto, pasa el borde de apoyo.
- Con inclinación, al centro de gravedad se le suma alto × tan(5°) hacia el lado que abre.
- El ángulo de vuelco es atan((borde − cg) / alto del cg).

## Resultado

| Pila | Alto (mm) | Orientación | Peor caso | Masa (kg) | Alto del cg (mm) | Margen plano (mm) | Margen con 5° (mm) | Ángulo de vuelco | Carga extra antes de voltear con 5° |
|---|---|---|---|---|---|---|---|---|---|
| BASE | 1282 | A | BASE C8 | 68.8 | 704 | 171.3 | 109.7 | 13.7° | 42.8 kg |
| BASE | 1282 | A | BASE C9 | 68.8 | 704 | 174.8 | 113.2 | 13.9° | 47.5 kg |
| BASE | 1282 | A | BASE C4 | 68.8 | 704 | 133.0 | 71.4 | 10.7° | 23.2 kg |
| BASE | 1282 | A | BASE C5 | 68.8 | 704 | 169.9 | 108.3 | 13.6° | 36.2 kg |
| BASE | 1282 | A | BASE C6 | 68.8 | 704 | 169.9 | 108.3 | 13.6° | 37.3 kg |
| BASE | 1282 | A | BASE C7 | 68.8 | 704 | 170.8 | 109.2 | 13.6° | 38.8 kg |
| BASE | 1282 | A | BASE C1 | 68.8 | 704 | 163.8 | 102.2 | 13.1° | 29.1 kg |
| BASE | 1282 | A | BASE C2 | 68.8 | 704 | 169.2 | 107.6 | 13.5° | 31.7 kg |
| BASE | 1282 | A | BASE C3 | 68.8 | 704 | 170.3 | 108.7 | 13.6° | 33.1 kg |
| BASE | 1282 | A | TODOS los de la caja de arriba | 68.8 | 704 | 70.2 | 8.6 | 5.7° |  |
| BASE | 1282 | B | BASE C8 | 68.8 | 704 | 236.3 | 174.7 | 18.6° | 108.0 kg |
| BASE | 1282 | B | BASE C9 | 68.8 | 704 | 239.8 | 178.2 | 18.8° | 123.7 kg |
| BASE | 1282 | B | BASE C4 | 68.8 | 704 | 198.0 | 136.4 | 15.7° | 63.7 kg |
| BASE | 1282 | B | BASE C5 | 68.8 | 704 | 234.9 | 173.3 | 18.5° | 84.5 kg |
| BASE | 1282 | B | BASE C6 | 68.8 | 704 | 234.9 | 173.3 | 18.4° | 88.3 kg |
| BASE | 1282 | B | BASE C7 | 68.8 | 704 | 235.8 | 174.2 | 18.5° | 93.0 kg |
| BASE | 1282 | B | BASE C1 | 68.8 | 704 | 228.8 | 167.2 | 18.0° | 65.2 kg |
| BASE | 1282 | B | BASE C2 | 68.8 | 704 | 234.2 | 172.6 | 18.4° | 70.3 kg |
| BASE | 1282 | B | BASE C3 | 68.8 | 704 | 235.3 | 173.7 | 18.5° | 74.2 kg |
| BASE | 1282 | B | TODOS los de la caja de arriba | 68.8 | 704 | 135.2 | 73.6 | 10.9° |  |
| BASE + ELE | 1645 | A | BASE C8 | 84.2 | 841 | 174.6 | 101.0 | 11.7° | 48.2 kg |
| BASE + ELE | 1645 | A | BASE C9 | 84.2 | 841 | 177.4 | 103.8 | 11.9° | 53.2 kg |
| BASE + ELE | 1645 | A | BASE C4 | 84.2 | 841 | 143.2 | 69.6 | 9.7° | 27.6 kg |
| BASE + ELE | 1645 | A | BASE C5 | 84.2 | 841 | 173.5 | 99.9 | 11.6° | 40.8 kg |
| BASE + ELE | 1645 | A | BASE C6 | 84.2 | 841 | 173.4 | 99.8 | 11.6° | 42.0 kg |
| BASE + ELE | 1645 | A | BASE C7 | 84.2 | 841 | 174.1 | 100.5 | 11.7° | 43.6 kg |
| BASE + ELE | 1645 | A | BASE C1 | 84.2 | 841 | 168.4 | 94.8 | 11.3° | 33.0 kg |
| BASE + ELE | 1645 | A | BASE C2 | 84.2 | 841 | 172.9 | 99.2 | 11.6° | 35.7 kg |
| BASE + ELE | 1645 | A | BASE C3 | 84.2 | 841 | 173.7 | 100.1 | 11.7° | 37.2 kg |
| BASE + ELE | 1645 | A | ELE C1 | 84.2 | 841 | 174.1 | 100.5 | 11.7° | 30.7 kg |
| BASE + ELE | 1645 | A | ELE C2 | 84.2 | 841 | 177.0 | 103.4 | 11.9° | 32.3 kg |
| BASE + ELE | 1645 | A | ELE C3 | 84.2 | 841 | 183.9 | 110.3 | 12.3° | 35.2 kg |
| BASE + ELE | 1645 | A | ELE C4 | 84.2 | 841 | 183.9 | 110.3 | 12.3° | 36.1 kg |
| BASE + ELE | 1645 | A | TODOS los de la caja de arriba | 84.2 | 841 | 152.5 | 78.8 | 10.3° |  |
| BASE + ELE | 1645 | B | BASE C8 | 84.2 | 841 | 239.6 | 166.0 | 15.9° | 125.4 kg |
| BASE + ELE | 1645 | B | BASE C9 | 84.2 | 841 | 242.4 | 168.8 | 16.1° | 143.2 kg |
| BASE + ELE | 1645 | B | BASE C4 | 84.2 | 841 | 208.2 | 134.6 | 13.9° | 76.9 kg |
| BASE + ELE | 1645 | B | BASE C5 | 84.2 | 841 | 238.5 | 164.9 | 15.8° | 98.3 kg |
| BASE + ELE | 1645 | B | BASE C6 | 84.2 | 841 | 238.4 | 164.8 | 15.8° | 102.7 kg |
| BASE + ELE | 1645 | B | BASE C7 | 84.2 | 841 | 239.1 | 165.5 | 15.9° | 108.0 kg |
| BASE + ELE | 1645 | B | BASE C1 | 84.2 | 841 | 233.4 | 159.8 | 15.5° | 76.2 kg |
| BASE + ELE | 1645 | B | BASE C2 | 84.2 | 841 | 237.9 | 164.2 | 15.8° | 81.8 kg |
| BASE + ELE | 1645 | B | BASE C3 | 84.2 | 841 | 238.7 | 165.1 | 15.8° | 86.2 kg |
| BASE + ELE | 1645 | B | ELE C1 | 84.2 | 841 | 239.1 | 165.5 | 15.9° | 66.0 kg |
| BASE + ELE | 1645 | B | ELE C2 | 84.2 | 841 | 242.0 | 168.4 | 16.0° | 69.2 kg |
| BASE + ELE | 1645 | B | ELE C3 | 84.2 | 841 | 248.9 | 175.3 | 16.5° | 74.3 kg |
| BASE + ELE | 1645 | B | ELE C4 | 84.2 | 841 | 248.9 | 175.3 | 16.5° | 76.6 kg |
| BASE + ELE | 1645 | B | TODOS los de la caja de arriba | 84.2 | 841 | 217.5 | 143.8 | 14.5° |  |
| BASE + SOL | 2008 | A | BASE C8 | 110.6 | 1044 | 177.5 | 86.1 | 9.6° | 54.0 kg |
| BASE + SOL | 2008 | A | BASE C9 | 110.6 | 1044 | 179.6 | 88.3 | 9.8° | 59.5 kg |
| BASE + SOL | 2008 | A | BASE C4 | 110.6 | 1044 | 153.6 | 62.3 | 8.4° | 32.4 kg |
| BASE + SOL | 2008 | A | BASE C5 | 110.6 | 1044 | 176.6 | 85.3 | 9.6° | 45.7 kg |
| BASE + SOL | 2008 | A | BASE C6 | 110.6 | 1044 | 176.5 | 85.2 | 9.6° | 47.1 kg |
| BASE + SOL | 2008 | A | BASE C7 | 110.6 | 1044 | 177.1 | 85.8 | 9.6° | 48.9 kg |
| BASE + SOL | 2008 | A | BASE C1 | 110.6 | 1044 | 172.8 | 81.4 | 9.4° | 37.3 kg |
| BASE + SOL | 2008 | A | BASE C2 | 110.6 | 1044 | 176.1 | 84.8 | 9.6° | 40.1 kg |
| BASE + SOL | 2008 | A | BASE C3 | 110.6 | 1044 | 176.8 | 85.5 | 9.6° | 41.8 kg |
| BASE + SOL | 2008 | A | SOL C1 | 110.6 | 1044 | 167.3 | 76.0 | 9.1° | 30.4 kg |
| BASE + SOL | 2008 | A | SOL C2 | 110.6 | 1044 | 173.8 | 82.4 | 9.4° | 33.8 kg |
| BASE + SOL | 2008 | A | SOL C3 | 110.6 | 1044 | 173.2 | 81.9 | 9.4° | 34.9 kg |
| BASE + SOL | 2008 | A | SOL C4 | 110.6 | 1044 | 176.6 | 85.2 | 9.6° | 30.6 kg |
| BASE + SOL | 2008 | A | SOL C5 | 110.6 | 1044 | 182.2 | 90.8 | 9.9° | 33.3 kg |
| BASE + SOL | 2008 | A | SOL C6 | 110.6 | 1044 | 175.1 | 83.8 | 9.5° | 31.8 kg |
| BASE + SOL | 2008 | A | TODOS los de la caja de arriba | 110.6 | 1044 | 157.3 | 65.9 | 8.6° |  |
| BASE + SOL | 2008 | B | BASE C8 | 110.6 | 1044 | 242.5 | 151.1 | 13.1° | 150.1 kg |
| BASE + SOL | 2008 | B | BASE C9 | 110.6 | 1044 | 244.6 | 153.3 | 13.2° | 170.9 kg |
| BASE + SOL | 2008 | B | BASE C4 | 110.6 | 1044 | 218.6 | 127.3 | 11.8° | 95.5 kg |
| BASE + SOL | 2008 | B | BASE C5 | 110.6 | 1044 | 241.6 | 150.3 | 13.0° | 117.7 kg |
| BASE + SOL | 2008 | B | BASE C6 | 110.6 | 1044 | 241.5 | 150.2 | 13.0° | 123.0 kg |
| BASE + SOL | 2008 | B | BASE C7 | 110.6 | 1044 | 242.1 | 150.8 | 13.1° | 129.3 kg |
| BASE + SOL | 2008 | B | BASE C1 | 110.6 | 1044 | 237.8 | 146.4 | 12.8° | 91.7 kg |
| BASE + SOL | 2008 | B | BASE C2 | 110.6 | 1044 | 241.1 | 149.8 | 13.0° | 98.1 kg |
| BASE + SOL | 2008 | B | BASE C3 | 110.6 | 1044 | 241.8 | 150.5 | 13.0° | 103.2 kg |
| BASE + SOL | 2008 | B | SOL C1 | 110.6 | 1044 | 232.3 | 141.0 | 12.5° | 73.8 kg |
| BASE + SOL | 2008 | B | SOL C2 | 110.6 | 1044 | 238.8 | 147.4 | 12.9° | 79.6 kg |
| BASE + SOL | 2008 | B | SOL C3 | 110.6 | 1044 | 238.2 | 146.9 | 12.9° | 83.5 kg |
| BASE + SOL | 2008 | B | SOL C4 | 110.6 | 1044 | 241.6 | 150.2 | 13.0° | 68.4 kg |
| BASE + SOL | 2008 | B | SOL C5 | 110.6 | 1044 | 247.2 | 155.8 | 13.3° | 72.9 kg |
| BASE + SOL | 2008 | B | SOL C6 | 110.6 | 1044 | 240.1 | 148.8 | 13.0° | 72.7 kg |
| BASE + SOL | 2008 | B | TODOS los de la caja de arriba | 110.6 | 1044 | 222.3 | 130.9 | 12.0° |  |
| BASE + TUB | 1645 | A | BASE C8 | 86.3 | 856 | 174.8 | 99.9 | 11.5° | 48.9 kg |
| BASE + TUB | 1645 | A | BASE C9 | 86.3 | 856 | 177.5 | 102.6 | 11.7° | 54.0 kg |
| BASE + TUB | 1645 | A | BASE C4 | 86.3 | 856 | 144.2 | 69.3 | 9.6° | 28.2 kg |
| BASE + TUB | 1645 | A | BASE C5 | 86.3 | 856 | 173.7 | 98.8 | 11.5° | 41.4 kg |
| BASE + TUB | 1645 | A | BASE C6 | 86.3 | 856 | 173.6 | 98.7 | 11.5° | 42.6 kg |
| BASE + TUB | 1645 | A | BASE C7 | 86.3 | 856 | 174.3 | 99.4 | 11.5° | 44.3 kg |
| BASE + TUB | 1645 | A | BASE C1 | 86.3 | 856 | 168.8 | 93.9 | 11.2° | 33.5 kg |
| BASE + TUB | 1645 | A | BASE C2 | 86.3 | 856 | 173.1 | 98.2 | 11.4° | 36.2 kg |
| BASE + TUB | 1645 | A | BASE C3 | 86.3 | 856 | 173.9 | 99.0 | 11.5° | 37.8 kg |
| BASE + TUB | 1645 | A | TUB C1 | 86.3 | 856 | 164.7 | 89.8 | 10.9° | 28.4 kg |
| BASE + TUB | 1645 | A | TUB C2 | 86.3 | 856 | 175.4 | 100.5 | 11.6° | 32.7 kg |
| BASE + TUB | 1645 | A | TUB C3 | 86.3 | 856 | 183.5 | 108.6 | 12.1° | 36.3 kg |
| BASE + TUB | 1645 | A | TODOS los de la caja de arriba | 86.3 | 856 | 146.3 | 71.4 | 9.7° |  |
| BASE + TUB | 1645 | B | BASE C8 | 86.3 | 856 | 239.8 | 164.9 | 15.6° | 127.8 kg |
| BASE + TUB | 1645 | B | BASE C9 | 86.3 | 856 | 242.5 | 167.6 | 15.8° | 145.9 kg |
| BASE + TUB | 1645 | B | BASE C4 | 86.3 | 856 | 209.2 | 134.3 | 13.7° | 78.7 kg |
| BASE + TUB | 1645 | B | BASE C5 | 86.3 | 856 | 238.7 | 163.8 | 15.6° | 100.1 kg |
| BASE + TUB | 1645 | B | BASE C6 | 86.3 | 856 | 238.6 | 163.7 | 15.6° | 104.6 kg |
| BASE + TUB | 1645 | B | BASE C7 | 86.3 | 856 | 239.3 | 164.4 | 15.6° | 110.1 kg |
| BASE + TUB | 1645 | B | BASE C1 | 86.3 | 856 | 233.8 | 158.9 | 15.3° | 77.7 kg |
| BASE + TUB | 1645 | B | BASE C2 | 86.3 | 856 | 238.1 | 163.2 | 15.5° | 83.4 kg |
| BASE + TUB | 1645 | B | BASE C3 | 86.3 | 856 | 238.9 | 164.0 | 15.6° | 87.8 kg |
| BASE + TUB | 1645 | B | TUB C1 | 86.3 | 856 | 229.7 | 154.8 | 15.0° | 64.1 kg |
| BASE + TUB | 1645 | B | TUB C2 | 86.3 | 856 | 240.4 | 165.5 | 15.7° | 71.2 kg |
| BASE + TUB | 1645 | B | TUB C3 | 86.3 | 856 | 248.5 | 173.6 | 16.2° | 77.6 kg |
| BASE + TUB | 1645 | B | TODOS los de la caja de arriba | 86.3 | 856 | 211.3 | 136.4 | 13.9° |  |
| BASE + MED | 1645 | A | BASE C8 | 85.9 | 851 | 175.4 | 101.0 | 11.6° | 49.2 kg |
| BASE + MED | 1645 | A | BASE C9 | 85.9 | 851 | 178.2 | 103.7 | 11.8° | 54.2 kg |
| BASE + MED | 1645 | A | BASE C4 | 85.9 | 851 | 144.7 | 70.2 | 9.6° | 28.4 kg |
| BASE + MED | 1645 | A | BASE C5 | 85.9 | 851 | 174.3 | 99.9 | 11.6° | 41.6 kg |
| BASE + MED | 1645 | A | BASE C6 | 85.9 | 851 | 174.2 | 99.8 | 11.6° | 42.8 kg |
| BASE + MED | 1645 | A | BASE C7 | 85.9 | 851 | 175.0 | 100.5 | 11.6° | 44.5 kg |
| BASE + MED | 1645 | A | BASE C1 | 85.9 | 851 | 169.4 | 94.9 | 11.3° | 33.7 kg |
| BASE + MED | 1645 | A | BASE C2 | 85.9 | 851 | 173.7 | 99.3 | 11.5° | 36.4 kg |
| BASE + MED | 1645 | A | BASE C3 | 85.9 | 851 | 174.6 | 100.1 | 11.6° | 38.0 kg |
| BASE + MED | 1645 | A | MED C1 | 85.9 | 851 | 164.1 | 89.7 | 10.9° | 28.3 kg |
| BASE + MED | 1645 | A | MED C2 | 85.9 | 851 | 180.1 | 105.6 | 11.9° | 35.0 kg |
| BASE + MED | 1645 | A | TODOS los de la caja de arriba | 85.9 | 851 | 154.9 | 80.4 | 10.3° |  |
| BASE + MED | 1645 | B | BASE C8 | 85.9 | 851 | 240.4 | 166.0 | 15.8° | 127.9 kg |
| BASE + MED | 1645 | B | BASE C9 | 85.9 | 851 | 243.2 | 168.7 | 16.0° | 146.0 kg |
| BASE + MED | 1645 | B | BASE C4 | 85.9 | 851 | 209.7 | 135.2 | 13.8° | 78.8 kg |
| BASE + MED | 1645 | B | BASE C5 | 85.9 | 851 | 239.3 | 164.9 | 15.7° | 100.2 kg |
| BASE + MED | 1645 | B | BASE C6 | 85.9 | 851 | 239.2 | 164.8 | 15.7° | 104.7 kg |
| BASE + MED | 1645 | B | BASE C7 | 85.9 | 851 | 240.0 | 165.5 | 15.7° | 110.2 kg |
| BASE + MED | 1645 | B | BASE C1 | 85.9 | 851 | 234.4 | 159.9 | 15.4° | 77.7 kg |
| BASE + MED | 1645 | B | BASE C2 | 85.9 | 851 | 238.7 | 164.3 | 15.7° | 83.5 kg |
| BASE + MED | 1645 | B | BASE C3 | 85.9 | 851 | 239.6 | 165.1 | 15.7° | 87.9 kg |
| BASE + MED | 1645 | B | MED C1 | 85.9 | 851 | 229.1 | 154.7 | 15.1° | 64.3 kg |
| BASE + MED | 1645 | B | MED C2 | 85.9 | 851 | 245.1 | 170.6 | 16.1° | 75.3 kg |
| BASE + MED | 1645 | B | TODOS los de la caja de arriba | 85.9 | 851 | 219.9 | 145.4 | 14.5° |  |

## Conclusión

- **Con un cajón abierto, en ninguna combinación se voltea**, ni en piso plano ni con 5°. El peor caso es BASE + SOL, orientación A, cajón BASE C4: se voltea a los 8.4°, y con 5° le caben 32.4 kg más en ese cajón antes de voltear.
- **El caso más crítico es abrir todos los cajones de la caja de arriba a la vez:** BASE, orientación A, se voltea a los 5.7°. Con 5° sigue en pie, con 8.6 mm de margen.

**Reglas de uso**, que van a la checklist y a la capacitación:
1. **Un cajón abierto a la vez.** Se cierra antes de abrir otro.
2. **Nunca abrir cajones con el carrito en rampa.** Primero se lleva a piso plano y se frenan las ruedas contra algo. Con todos los cajones de arriba abiertos, la pila más baja ya se voltea a 5.7°, y la más alta (con soldadura) mide 2,008 mm.
3. **Lo pesado va abajo.** El acomodo pone la 8442 y la 8444 debajo de la 8443. No se sube un módulo pesado (SOL) arriba de otro módulo.
4. **Nada colgado de las correderas abiertas.** La carga extra que aguanta un cajón abierto con 5° es la de la tabla, y es para herramienta dentro del cajón, no para apoyarse.

**Lo que falta para cerrar esto:**
- medir los apoyos reales de la 8410 (las ruedas y el ancho entre ellas);
- confirmar la orientación con la que se acoplan las cajas;
- pesar un cajón vacío.

Los tres son supuestos en el script.
