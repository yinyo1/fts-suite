# El grafo objetivo, y el que hay hoy

Los porcentajes son los medidos el 2026-09-24 sobre 2025-01-01 → hoy, compañías 1 y 6.
El detalle de cada número está en [`INFORME.md` §3](INFORME.md).

## 1 · El grafo objetivo

```mermaid
graph LR
  LEAD[crm.lead<br/>oportunidad]
  MACH[(comercial.machote<br/>Postgres · append-only)]
  COT[sale.order<br/>draft/sent<br/>cotizaciones]
  SO[sale.order<br/>state=sale<br/>CONFIRMADA]
  ADI[sale.order<br/>ADICIONAL]
  PROY[project.project]
  AA[account.analytic.account<br/>EL HILO]
  BUD[budget.analytic<br/>+ budget.line por rubro]
  FAC[account.move<br/>out_invoice]
  NC[account.move<br/>out_refund]
  REF[account.move<br/>refactura]
  PO[purchase.order]
  BILL[account.move<br/>in_invoice]
  TAR[Tarjeta<br/>Jeeves MX / Chase USA]
  MO[account.analytic.line<br/>mano de obra]
  PAGO[account.payment]
  COM[Comisiones<br/>modulo futuro]

  LEAD -->|1..N| MACH
  LEAD -->|1..N| COT
  MACH -->|de que machote salio| COT
  COT -->|Confirmacion en la suite| SO
  SO -->|adicional = orden nueva| ADI
  ADI -.->|orden o proyecto padre| SO
  SO --> PROY
  PROY --- AA
  SO --> AA
  AA --> BUD
  MACH -->|MO y materiales| BUD
  SO -->|sale_line_ids| FAC
  FAC -->|reversed_entry_id| NC
  NC -.->|CFDI 01 o 07| REF
  REF -.->|sin arista nativa| FAC
  AA -->|analytic_distribution| PO
  PO -->|purchase_line_id| BILL
  BILL --> AA
  TAR -->|conciliacion| BILL
  MO --> AA
  FAC --> PAGO
  BILL --> PAGO
  SO -.->|sobre cobros reales| COM
```

## 2 · El grafo que hay hoy

Verde = la arista funciona. Ámbar = existe y falla a menudo. Rojo = no existe o está en cero.

```mermaid
graph LR
  LEAD[oportunidad]
  MACH[(machote)]
  COT[cotizacion]
  SO[SO confirmada]
  PROY[proyecto]
  AA[cuenta analitica]
  BUD[presupuesto]
  FAC[factura]
  NC[nota de credito]
  REF[refactura]
  PO[orden de compra]
  BILL[factura proveedor]
  TAR[tarjeta]
  MO[mano de obra]
  PAGO[pago]
  ADI[adicional]

  LEAD -->|38 por ciento rotas| COT
  LEAD -->|CERO: campo vacio en todos| MACH
  MACH -->|2 de 19| COT
  COT --> SO
  SO -->|16 por ciento sin ninguno<br/>DOS aristas parciales| PROY
  PROY --- AA
  AA -->|esqueleto -1 en proyectos nuevos| BUD
  MACH -->|no llega| BUD
  SO -->|27 por ciento de renglones sin liga| FAC
  FAC -->|13 de 13 OK| NC
  NC -->|NO EXISTE| REF
  AA -->|505 POs cuelgan de aqui| PO
  PO -->|98 por ciento OK| BILL
  BILL --> AA
  TAR -->|no lleva analitica<br/>y es correcto| BILL
  MO -->|66 por ciento sin proyecto<br/>por diseno| AA
  FAC --> PAGO
  SO -->|NO EXISTE| ADI

  classDef ok fill:#1D6F42,color:#fff,stroke:#0f3d24
  classDef mal fill:#b3261e,color:#fff,stroke:#6b1611
  classDef medio fill:#c07a00,color:#fff,stroke:#7a4d00
  class PO,BILL ok
  class MACH,REF,ADI mal
  class SO,FAC,BUD,PROY medio
```

## 3 · Las cardinalidades del encargo, contra la realidad

| cardinalidad propuesta | ¿se cumple? | medido |
|---|---|---|
| 1 lead → N machotes | **no se puede saber** | la arista no existe: 0 machotes con lead |
| 1 lead → N cotizaciones | **sí** | 698 cotizaciones en 483 oportunidades; ≥215 son la 2ª o posterior |
| cada cotización sabe de qué machote salió | **casi nunca** | 2 de 19 machotes vivos tienen orden |
| 1 lead → varias SO confirmadas | **sí, y es lo normal** | consecuencia de la anterior |
| adicional = SO nueva ligada al padre | **no existe la arista** | no hay campo de orden padre en `sale.order` |
| SO ↔ proyecto ↔ analítica | **sí, pero por dos caminos que no coinciden** | 106 sólo por el nativo, 13 sólo por el del radar, 32 por los dos, 28 por ninguno |
| presupuesto de MO y materiales del machote | **la estructura sí, los montos no** | los proyectos nuevos nacen con `budget_amount = −1` |
| SO → N facturas de todo tipo | **sí** | y el 25 % de ellas sin liga de renglón |
| cada NC ligada a su factura | **sí, nativo** | 13 de 13 |
| cada refactura ligada a la que corrige | **no** | sólo rastro CFDI |
| proyecto → N POs | **sí, por la analítica del renglón** | 505 en 3 proyectos; 0 por cabecera |
| proyecto → N bills | **sí** | 98 % de los renglones ligados a su PO |
| proyecto → gastos de tarjeta y MO | **MO sí; tarjeta por la vía del bill** | ver §4.3 del informe |
| factura/bill → N líneas de pago | **sí** | 98 % de los cobros conciliados |
| SO → comisiones sobre cobros reales | **no existe** | hoy las comisiones viven en el machote y en `budget.line` |
