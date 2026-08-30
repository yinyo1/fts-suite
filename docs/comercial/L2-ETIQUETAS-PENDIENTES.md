# L2 — Los 20 leads que faltan etiquetar a mano

**Fuera del alcance de la corrida automatizada** (decisión de Esteban en #131).

`crm.tag` está fuera de la allowlist del MCP de Odoo: no se puede leer si las etiquetas
existen ni confirmar que se aplicaron. Un write no verificable es exactamente lo que L6
enseñó a no hacer, así que L2 movió **solo etapas** —que sí tienen read-back— y las
etiquetas quedan para la UI.

Las etapas de estos 20 leads **ya se movieron** en la corrida. Lo único pendiente es la
etiqueta.

---

## Etiqueta `Topo Chico` — 4 leads

Venían de la etapa *Adiccionales Topo (Monty)* (id 20), que desaparece al consolidarse.
La etiqueta es lo que preserva esa información: sin ella, al fusionar la etapa se pierde
el dato de que eran adicionales de Topo Chico.

| id | Nombre | Cliente |
|---|---|---|
| 2183 | Ajuste por modificación de alcance – Si… | Nalco de Mexico, Tito Everardo Ordaz |
| 2185 | Carretes de Modulante a Resinas | Nalco de Mexico, Tito Everardo Ordaz |
| 2211 | Carretes MAC en Bridgestone | Bridgestone México, Daniel Cruz |
| 2212 | PacDrive para Pineda en GEPP | Jorge Pineda |

## Etiqueta `Mondelez` — 16 leads

Venían de la etapa *Cot Enviada Mdlz* (id 12), misma lógica.

| id | Nombre | Cliente |
|---|---|---|
| 1385 | Paint sales for stockroom | MONDELEZ MEXICO, Mateo Salazar |
| 1387 | SENSOR SICK WL160-F440 photoelectric se… | Mondelez Global LLC, Shabhaz Akbar |
| 1388 | SALE SENSOR SICK IM12-04BPS-ZC1 | Mondelez Global LLC, Shabhaz Akbar |
| 1390 | 2 quotations Supply of hongo de presion… | MONDELEZ MEXICO, Mateo Salazar |
| 1391 | Supply of silo door gaskets | MONDELEZ MEXICO, Mateo Salazar |
| 1392 | Supply of 16-inch neck flange | MONDELEZ MEXICO, Mateo Salazar |
| 1396 | Supply of panel Rittal | Mondelez Global LLC, Danish Naseem |
| 1408 | Quala Prospecto | **Quala** ⚠️ |
| 1413 | mini-split maintenance | MONDELEZ MEXICO, Mateo Salazar |
| 1414 | Supply of Rittal 1547000 | Mondelez Global LLC, Danish Naseem |
| 1415 | Supply and replacement of Morris couple… | MONDELEZ MEXICO, Mateo Salazar |
| 1419 | supply S500-3 NOx Flue Gas Combustion A… | **CORPORATE USA** ⚠️ |
| 1421 | 3/8” x 1-1/2”uns c36000 F.C.HALF HARD B… | Mondelez Global LLC, Shabhaz Akbar |
| 1422 | material supply | Mondelez Global LLC, Shabhaz Akbar |
| 1424 | material supply | Mondelez Global LLC, Shabhaz Akbar |
| 1438 | Replace electrical conduits overhead | **CORPORATE USA** ⚠️ |

### ⚠️ Tres que conviene mirar antes de etiquetar

La lista salió de "todo lo que estaba en la etapa *Cot Enviada Mdlz*", no de "todo lo que
es de Mondelez". Tres no tienen a Mondelez como cliente:

- **1408 "Quala Prospecto"** → cliente **Quala**. No parece Mondelez en absoluto.
- **1419** y **1438** → cliente **CORPORATE USA**. Puede ser la entidad corporativa de
  Mondelez capturada con otro nombre, o puede ser otro cliente.

Etiquetarlos como Mondelez por inercia mete ruido en el dato que la etiqueta pretende
salvar. **Decisión de Esteban al aplicarlas.** Sus etapas ya se movieron igual — eso no
depende de cómo se resuelva la etiqueta.
