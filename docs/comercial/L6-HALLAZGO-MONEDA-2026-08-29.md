# L6 — La hipótesis "los montos ya están en pesos" es FALSA

**Fecha:** 2026-08-29 · **Issue:** #131 · **Estado:** 🔴 **L6 DETENIDO antes de escribir.** Cero cambios a Odoo.

Esteban autorizó la corrida con una condición explícita:

> "L6 — sí, confirma con 2 o 3 casos más del grupo B antes del write de las 190. […] Si algún caso **NO** cuadra (es decir, el monto sí estaba en dólares reales), **detente y repórtalo antes de escribir**: cambiaría la naturaleza del lote."

**Ese caso ocurrió. En 4 de los 5.**

## Evidencia cruda

`sale.order` del grupo B (`company_id=1` ∧ `currency_id=2` USD ∧ con factura posteada):

```
id    name    state amount_total amount_untaxed currency_id invoice_ids                    partner_id
11438 SO11240 sale  5,015.84     4,324.00       USD         [53163]                        Budenheim Mexico
10880 SO10702 sale  58,580.00    50,500.00      USD         [50670, 49202, 47668]          Visionary
6111  SO6013  sale  424,914.96   366,306.00     USD         [41842,39813,36463,39812,40274] Budenheim Mexico, Leonardo Gandarilla
5990  SO5893  sale  10,885.44    9,384.00       USD         [36759]                        Regal Rexnord
6086  SO5989  sale  44,240.21    38,138.11      USD         [36093]                        Nalco de Mexico, Fernando Guzman
```

Sus `account.move` (la verdad contable):

```
id    name    state  move_type   amount_total amount_untaxed currency_id invoice_origin partner_id
53163 INV1936 posted out_invoice 5,015.84     4,324.00       USD         SO11240        Budenheim Mexico
50670 INV1914 posted out_refund  17,574.00    15,150.00      USD         SO10702        Visionary
49202 INV1907 posted out_invoice 17,574.00    15,150.00      USD         SO10702        Visionary
47668 INV1899 posted out_invoice 41,006.00    35,350.00      USD         SO10702        Visionary
36759 INV1728 posted out_invoice 10,885.44    9,384.00       USD         SO5893         Thomson Technology Power Systems ULC
36463 INV1703 posted out_invoice 254,948.97   219,783.60     USD         SO6013         Budenheim Mexico
36093 INV1688 posted out_invoice 44,240.21    38,138.11      MXN         SO5989         Nalco de Mexico
41842 /       cancel out_invoice 0.00         0.00           USD         SO6013         Budenheim Mexico, Leonardo Gandarilla
40274 /       cancel out_invoice 93,481.29    93,481.29      USD         SO6013         Budenheim Mexico, Leonardo Gandarilla
39812 /       cancel out_invoice 63,737.24    63,737.24      USD         SO6013         Budenheim Mexico, Leonardo Gandarilla
39813 /       cancel out_invoice 0.00         0.00           USD         SO6013         Budenheim Mexico
```

## Lectura

| SO | Factura posteada | Moneda de la factura | ¿La SO estaba mal etiquetada? |
|---|---|---|---|
| SO11240 | INV1936 | **USD** | ❌ No — venta USD real |
| SO10702 | INV1899/1907/1914 | **USD** | ❌ No — venta USD real |
| SO5893 | INV1728 | **USD** | ❌ No — y el cliente es **Thomson Technology Power Systems ULC** (Canadá) |
| SO6013 | INV1703 | **USD** | ❌ No — venta USD real |
| SO5989 | INV1688 | **MXN** por 44,240.21 | ✅ Sí — **el único** |

**SO5989 era la excepción, no la regla.** La sesión anterior generalizó desde un caso: era evidencia fuerte, pero de UNA observación. Los otros cuatro la desmienten.

## Por qué la premisa completa del lote está mal

L6 se diseñó sobre "company MX + moneda USD = error de captura". Es falso: FTS MX **vende en dólares de verdad** — a clientes extranjeros (Thomson Technology ULC y Abbotsford Road Coffee Specialists Inc., ambos canadienses) y a filiales mexicanas de grupos extranjeros que facturan en USD (Budenheim, Visionary).

Distribución de los 198 no cancelados por cliente (top): Nalco 14 · MONDELEZ MEXICO 13 · Bridgestone 9+7 · MAGNEKON 7 · QUIMITEC 6 · CHEMTREAT 6 · BEBIDAS PURIFICADAS 6 · Visionary 5 · **Abbotsford Road Coffee Specialists Inc. 4** · Mission Foods 3 · Budenheim 3+4 · HEINEKEN 3 … (78 clientes distintos).

Si se hubieran convertido las 190 a MXN, una venta de **$5,015.84 USD** habría quedado registrada como **$5,015.84 MXN** — un error de ~17× a la baja, en registros que alimentan facturación y reportes.

**Y el problema es peor de lo que parece:** solo 8 de las 198 tienen factura posteada. Para las otras **190 no existe evidencia independiente** de cuál era su moneda real. No hay forma de distinguir la mislabel legítima (tipo SO5989) de la venta USD real sin revisar cada caso con quien la cotizó.

## Qué se hace con L6

**No se ejecuta como está diseñado.** Opciones para Esteban:

1. **Archivar L6** y tratar el tema como lo que resultó ser: no una limpieza masiva, sino **la causa raíz del default USD** (que ya estaba fuera de alcance de esta sesión). Si el default se corrige, el problema deja de crecer; el histórico se queda como está, que es lo correcto para la mayoría.
2. **Corregir solo casos probados uno por uno** — hoy hay exactamente **1** (SO5989, con INV1688 en MXN como evidencia). Un lote de 1 registro no necesita script.
3. **Revisión con el equipo comercial** de las 190 sin factura, cliente por cliente, para separar venta-USD-real de mislabel. Es trabajo humano, no automatizable con los datos disponibles.

Recomiendo (1) + (2): archivar el lote masivo, corregir el único caso probado si se quiere, y mandar la causa raíz a su propia sesión.

## Lección

La misma que ya está en CLAUDE.md §9 en otra superficie: **una prueba solo vale si el caso ocurrió, y una observación no es una regla.** El dry-run verificó que SO5989 cuadraba y extrapoló a 190 registros. La verificación que pidió Esteban —2 o 3 casos más— costó una consulta y evitó un error de ~17× sobre ventas reales.
