# Cortar antes cuando el buscador no tiene a la empresa · diseño

> **🟡 DISEÑO, NO APLICADO.** Lo que **sí** está aplicado es que la ficha lo
> **declare** cuando ya pasó (`ficha.sin_presencia_en_buscador_publico`, Tarea 4
> de #353): eso no cambia el gasto y no necesita decisión. Lo que aquí se propone
> es **cortar el gasto antes**, y eso sí la necesita, porque puede equivocarse y
> dejar una cuenta sin buscar.

## El caso, medido

En la prueba de cobertura de #353, tres de las diez cuentas devolvieron **cero
perfiles de la empresa** con el bloque completo de M5 —las tres formas, con alias
de marca y con ancla de geografía—:

| Cuenta | Contactos de valor que el humano sí tiene | Lo que la herramienta encontró | Configuraciones probadas |
|---|---|---|---|
| **Ragasa** | 3 | 0 | `site:linkedin.com/in`, `site:mx.linkedin.com/in`, forma simple, alias de marca «Nutrioli» |
| **Cuprum** | 4 | 0 | las tres formas, más el ancla de ciudad en el texto |
| **Qualtia / Xignux** | 2 | 0 | las tres formas |

Ragasa es el caso limpio: se le probó hasta el alias de marca, que es la
configuración que rescata cuentas cuyo nombre legal no es el nombre con el que la
gente escribe su empleador. No fue eso. Los perfiles existen —Sales Navigator los
entrega— y el buscador público no los indexa.

## Lo que cuesta no detectarlo

M5 es **~60% del gasto** de una corrida. En una cuenta sin presencia en el
buscador, ese 60% se gasta entero para llegar a cero. Con el tope adaptativo de
60 consultas por planta, son ~36 consultas que no podían traer nada.

Y el costo no es solo dinero: es que la cuenta **parece trabajada**. Sale una
ficha sin decisores, y quien la lee no sabe si es porque la planta no tiene gente
o porque la herramienta no llegó.

## El detector

> Si las primeras **N** consultas de M5 no devuelven **ni un perfil de la
> empresa**, se declara límite de fuente, se cierra M5 y la cuenta se entrega
> con la búsqueda de Sales Navigator armada.

Tres cosas hay que fijar, y las tres son la decisión:

### 1. Cuánto vale N

| N | Qué ahorra en una cuenta clase (c) | Qué arriesga |
|---|---|---|
| **6** | ~54 de 60 consultas | Alto. Una cuenta cuyo vocabulario de casa es raro puede tardar más de 6 consultas en pegar la primera. |
| **10** | ~50 de 60 | Medio. Es un bloque completo más el margen del tope adaptativo. |
| **12** | ~48 de 60 | Bajo. Ya se probaron las tres formas al menos cuatro veces cada una. |

**Lo que recomiendo: N = 12, y cubriendo las tres formas.** No es solo el número:
es que las 12 no pueden ser 12 de la misma forma. Doce consultas todas con
`site:linkedin.com/in` no prueban que el buscador no tenga a la empresa; prueban
que ese corpus no la tiene, que es exactamente el error que #353 encontró.

### 2. Qué cuenta como «ni un perfil de la empresa»

No «ningún contacto de valor»: **ningún perfil**. Un recepcionista de la empresa
que el filtro descarta **sí** cuenta como perfil —prueba que el buscador tiene a
la empresa, y entonces el problema es de vocabulario o de orden, no de fuente, y
se arregla aquí y no en Sales Navigator.

### 3. Qué pasa con las olas que M5 alimenta

M6 (individuales por nombre) y M7 en su forma fuerte **dependen de que M5 entregue
nombres**. Si M5 se corta seco, esas dos no tienen de dónde partir y hay que
cerrarlas como `no_aplicaba` con razón escrita, no dejarlas abiertas: un módulo
abierto que nunca va a poder cerrarse bloquea el challenge.

## Lo que el detector NO debe hacer

- **No debe apagar M1, M2, M3 ni M12.** Que los perfiles no estén indexados no
  dice nada del patrón de correo, del vocabulario de la casa, de las cámaras ni
  de la prensa. En #353 la capa de vacantes de una cuenta sin perfiles sí cosechó
  vocabulario real de la casa.
- **No debe marcar la cuenta como mala.** Clase (c) es un dato de **fuente**, no
  de calidad: Ragasa tiene una señal de cogeneración de 19.2 MW fechada en
  mar-2025. Es una cuenta buena que se trabaja por otra vía.
- **No debe recordarlo para siempre.** El buscador indexa con el tiempo. Si la
  cuenta se vuelve a correr en seis meses, el detector vuelve a medir desde cero.

## La decisión que se le pide a Esteban

1. **¿Se aplica el corte, o la ficha solo lo declara al final?** Declararlo ya
   está hecho y no cuesta nada. Cortar ahorra ~48 consultas por cuenta clase (c)
   y arriesga dejar sin buscar una cuenta que sí estaba ahí.
2. **Si se aplica: ¿N = 12 con las tres formas cubiertas, o más conservador?**
3. **¿La cuenta clase (c) entra al motor 3 igual, con tarjeta y todo, pero con el
   canal marcado como Sales Navigator?** Hoy el canal del toque #1 lo declara el
   operador; esto lo dejaría declarado desde el radar.
