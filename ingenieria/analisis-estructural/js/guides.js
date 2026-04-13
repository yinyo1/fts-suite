const GUIDES = {
  polipasto: `*📋 GUÍA DE DATOS — POLIPASTO / GRÚA INDUSTRIAL*
*FTS Full Technology Systems*

Completa todos los campos con R= y envía de regreso.
Mientras más detalle, mejor será el análisis.

*📁 DATOS DEL PROYECTO*
*Cliente y nombre de planta:* R=
*Proyecto (nombre del sistema):* R=
*Municipio y estado:* R=
*Número de documento (ej. MC-HOI-001-2026):* R=
*Nombre del documento:* R=
*Elaboró / Revisó / Aprobó:* R=
*Fecha y revisión:* R=

*🔧 POLIPASTO / GRÚA*
*Capacidad nominal (kg o ton):* R=
*Peso del polipasto (kg, del catálogo):* R=
*Marca y modelo exacto:* R=
*Tipo de sistema (monorriel fijo / puente grúa):* R=
*Clase de servicio CMAA (A/B/C/D):* R=
_A=muy ligero B=ligero-moderado C=moderado D=pesado_
*Claro del monorriel - distancia entre apoyos (mm):* R=
*Longitud física del monorriel (mm):* R=
*Recorrido total del polipasto (mm):* R=
*Altura de izaje (mm):* R=

*⚙️ CARGA A IZAR*
*Qué se va a izar (descripción del objeto):* R=
*Peso vacío del objeto (kg):* R=
*Lleva contenido? Tipo y volumen (litros):* R=
*Densidad del contenido (kg/L):* R=
*Porcentaje de llenado en operación (%):* R=
*Hay accesorios conectados durante el izaje?:* R=

*🏗️ ESTRUCTURA SOPORTE*
*Número de columnas:* R=
*Perfil de columnas (HSS 8x8 IPR etc.):* R=
*Material columnas (A36/A572/A500):* R=
*Altura de columnas (mm) - si hay diferentes alturas listarlas:* R=
*Perfil vigas principales (runway):* R=
*Perfil del monorriel:* R=
*Longitud total de la estructura (mm):* R=
*Ancho total de la estructura (mm):* R=
*Separación entre marcos/columnas (mm):* R=
*Lleva arriostres? Si sí qué perfil?:* R=

*🏠 CIMENTACIÓN Y ANCLAJE*
*fc del concreto de la losa (kg/cm2):* R=
*Va a losa o a dado de concreto?:* R=
*Tipo de taquete (Hilti HIT-RE HST3 mecánico etc.):* R=
*Diámetro del taquete (mm):* R=
*Longitud de empotramiento (mm o pulgadas):* R=
*Número de taquetes por placa base:* R=
*Dimensiones de placa base (largo x ancho x espesor mm):* R=

*💻 VALIDACIÓN FEA (si aplica)*
*Software utilizado (Fusion 360 ANSYS STAAD etc.):* R=
*Esfuerzo Von Mises máximo (MPa):* R=
*Ubicación del esfuerzo máximo:* R=

*📎 DOCUMENTOS A ADJUNTAR*
Adjunta los que tengas disponibles:
📐 Planos CAD o dibujo isométrico con cotas
🖥️ Screenshots de simulación FEA (Von Mises deformación)
   Vistas: frontal lateral isométrica 3D
📸 Foto del equipo instalado o render 3D
📋 Ficha técnica del polipasto (catálogo Yale CM Demag)
📄 Plano de la losa de cimentación
🔩 Catálogo del taquete Hilti si es químico

IMPORTANTE: Nombra las imágenes FEA con fea o fusion
y los planos con plano o render para clasificación automática.`,
  tuberia: `*📋 GUÍA DE DATOS — SOPORTE DE TUBERÍA*
*FTS Full Technology Systems*

*📁 DATOS DEL PROYECTO*
*Cliente y planta:* R=
*Proyecto:* R=
*Municipio y estado:* R=
*Número de documento:* R=
*Elaboró / Revisó / Aprobó:* R=
*Fecha y revisión:* R=

*🔩 TUBERÍA*
*Diámetro nominal (pulgadas):* R=
*Fluido transportado:* R=
*Densidad del fluido (kg/L):* R=
*Presión de operación (PSI o kg/cm2):* R=
*Temperatura de operación (°C):* R=
*Longitud del tramo a soportar (m):* R=
*Número de tuberías paralelas:* R=
*Hay codos? Cuántos y dónde?:* R=
*Los extremos están anclados o libres?:* R=

*💧 GOLPE DE ARIETE*
*Aplica análisis de golpe de ariete?:* R=
*Hay válvula de cierre rápido?:* R=
*Tiempo de cierre de válvula (segundos):* R=
*Caudal de operación (L/s):* R=
*El sistema tiene VFD/variador de frecuencia?:* R=

*🏗️ ESTRUCTURA SOPORTE*
*Perfil de soporte (PTR IPR HSS etc.):* R=
*Material (A36 AISI 304 A500 etc.):* R=
*Altura del soporte (mm):* R=
*Configuración de patas (recta tipo Y etc.):* R=
*Lleva arriostres horizontales?:* R=
*Número de soportes en el tramo:* R=

*🏠 CIMENTACIÓN*
*fc del concreto (kg/cm2):* R=
*Tipo y diámetro de taquetes:* R=
*Longitud de empotramiento (mm):* R=
*Número de taquetes por soporte:* R=
*Dimensiones placa base (mm):* R=

*💻 FEA (si aplica)*
*Software:* R=
*Von Mises máximo (MPa):* R=
*Ubicación del máximo:* R=

*📎 DOCUMENTOS A ADJUNTAR*
📐 Isométrico de tubería con cotas
🖥️ Screenshots FEA si aplica
📋 Ficha técnica de la tubería (schedule material)
📸 Foto o render del sistema
📄 P&ID del sistema si está disponible`,
  mezz_personas: `*📋 GUÍA DE DATOS — MEZZANINE DE PERSONAS*
*FTS Full Technology Systems*

*📁 DATOS DEL PROYECTO*
*Cliente y planta:* R=
*Proyecto:* R=
*Municipio y estado:* R=
*Número de documento:* R=
*Elaboró / Revisó / Aprobó:* R=
*Fecha y revisión:* R=

*👥 USO DEL MEZZANINE*
*Uso principal (oficina paso almacén ligero etc.):* R=
*Número máximo de personas simultáneas:* R=
*Habrá equipos o mobiliario? Peso estimado (kg):* R=
*Carga viva de diseño (kg/m2 - mínimo 250):* R=

*📐 DIMENSIONES*
*Largo x Ancho total del mezzanine (m):* R=
*Altura libre bajo el mezzanine (m):* R=
*Número de niveles:* R=
*Altura entre niveles (m):* R=

*🏗️ ESTRUCTURA*
*Perfil de columnas:* R=
*Perfil de vigas principales:* R=
*Perfil de vigas secundarias (piso):* R=
*Material (A36 A500 etc.):* R=
*Tipo de piso (lámina concreto rejilla madera):* R=
*Peso estimado del piso (kg/m2):* R=
*Lleva arriostres? Dónde?:* R=

*🚪 ACCESO*
*Lleva escalera? Tipo (recta caracol marinera):* R=
*Ancho de escalera (mm):* R=
*Lleva barandal? Altura (mm - mínimo 900mm NOM-001):* R=
*Lleva portilla o puerta de acceso?:* R=

*🏠 CIMENTACIÓN*
*fc del concreto (kg/cm2):* R=
*Tipo de taquetes:* R=
*Diámetro y longitud de empotramiento:* R=
*Taquetes por placa:* R=
*Dimensiones placa base:* R=

*💻 FEA (si aplica)*
*Software:* R=
*Von Mises máximo (MPa):* R=

*📎 DOCUMENTOS A ADJUNTAR*
📐 Plano de planta con dimensiones y columnas
📐 Alzado lateral con alturas y escalera
🖥️ Screenshots FEA (Von Mises deformación flecha de piso)
📸 Foto del área donde se instala`,
  mezz_equipos: `*📋 GUÍA DE DATOS — MEZZANINE PARA EQUIPOS*
*FTS Full Technology Systems*

*📁 DATOS DEL PROYECTO*
*Cliente y planta:* R=
*Proyecto:* R=
*Municipio y estado:* R=
*Número de documento:* R=
*Elaboró / Revisó / Aprobó:* R=
*Fecha y revisión:* R=

*⚙️ EQUIPO A SOPORTAR*
*Nombre y modelo del equipo:* R=
*Peso en operación (kg):* R=
*Peso vacío / en mantenimiento (kg):* R=
*Dimensiones del equipo L x W x H (mm):* R=
*Altura del centro de gravedad (mm desde la base):* R=
*El equipo genera vibración? (bomba compresor motor):* R=
*Frecuencia de operación si vibra (RPM o Hz):* R=
*Factor de impacto del fabricante:* R=
*Número de equipos iguales:* R=

*📐 DIMENSIONES DEL MEZZANINE*
*Largo x Ancho total (m):* R=
*Altura libre bajo el mezzanine (m):* R=
*Necesita acceso de personas para mantenimiento?:* R=

*🏗️ ESTRUCTURA*
*Perfil de columnas:* R=
*Perfil de vigas:* R=
*Material:* R=
*Tipo de piso:* R=
*Lleva arriostres?:* R=

*🏠 CIMENTACIÓN*
*fc concreto (kg/cm2):* R=
*Tipo diámetro y longitud de taquetes:* R=
*Taquetes por placa / dimensiones placa:* R=

*💻 FEA (si aplica)*
*Software:* R=
*Von Mises máximo (MPa):* R=

*📎 DOCUMENTOS A ADJUNTAR*
📐 Plano de planta con posición del equipo y columnas
📋 Ficha técnica del equipo (peso CG vibración RPM)
🖥️ Screenshots FEA (Von Mises deformación modo vibración)
📸 Foto del equipo y del área de instalación
CRÍTICO para equipos vibratorios: incluir frecuencia de
operación para análisis de resonancia`,
  tanque: `*📋 GUÍA DE DATOS — SOPORTE DE TANQUE*
*FTS Full Technology Systems*

*📁 DATOS DEL PROYECTO*
*Cliente y planta:* R=
*Proyecto:* R=
*Municipio y estado:* R=
*Número de documento:* R=
*Elaboró / Revisó / Aprobó:* R=
*Fecha y revisión:* R=

*🛢️ TANQUE*
*Nombre y modelo del tanque:* R=
*Peso vacío (kg):* R=
*Capacidad total (litros):* R=
*Tipo de contenido (agua químico resina etc.):* R=
*Densidad del contenido (kg/L):* R=
*Porcentaje de llenado en operación (%):* R=
*Dimensiones del tanque diámetro x altura o L x W x H (mm):* R=
*Altura del centro de gravedad en operación (mm):* R=
*Presión de operación (PSI - si es a presión):* R=

*📐 ESTRUCTURA SOPORTE*
*Tipo de soporte (patas skid plataforma):* R=
*Perfil de columnas/patas:* R=
*Material:* R=
*Altura del soporte (mm):* R=
*Lleva arriostres?:* R=

*🌍 SISMO Y VIENTO*
*Zona sísmica del sitio:* R=
*Velocidad de viento de diseño (km/h):* R=
*El tanque es elevado (más de 3m)?:* R=

*🏠 CIMENTACIÓN*
*fc concreto (kg/cm2):* R=
*Tipo diámetro y longitud de taquetes:* R=
*Taquetes por placa / dimensiones placa:* R=

*💻 FEA (si aplica)*
*Software:* R=
*Von Mises máximo (MPa):* R=

*📎 DOCUMENTOS A ADJUNTAR*
📐 Plano del tanque con dimensiones y CG
📋 Ficha técnica del tanque (fabricante material presión)
🖥️ Screenshots FEA si aplica
📸 Foto o render del sistema
CRÍTICO: Para tanques elevados incluir altura del CG`,
  general: `*📋 GUÍA DE DATOS — ESTRUCTURA GENERAL*
*FTS Full Technology Systems*

*📁 DATOS DEL PROYECTO*
*Cliente y planta:* R=
*Proyecto:* R=
*Municipio y estado:* R=
*Número de documento:* R=
*Elaboró / Revisó / Aprobó:* R=
*Fecha y revisión:* R=

*🏗️ DESCRIPCIÓN DE LA ESTRUCTURA*
*Tipo de estructura y su función:* R=
*Dimensiones generales L x W x H (mm):* R=
*Perfil de columnas:* R=
*Perfil de vigas:* R=
*Material:* R=
*Lleva arriostres?:* R=

*⚖️ CARGAS*
*Carga muerta (peso propio + elementos fijos kg/m2):* R=
*Carga viva (operación/personas/equipos kg/m2):* R=
*Hay cargas puntuales? Valor y ubicación:* R=
*Hay cargas de impacto o dinámicas?:* R=

*🏠 CIMENTACIÓN*
*fc concreto (kg/cm2):* R=
*Tipo diámetro y longitud de taquetes:* R=
*Taquetes por placa / dimensiones placa:* R=

*💻 FEA (si aplica)*
*Software:* R=
*Von Mises máximo (MPa):* R=

*📎 DOCUMENTOS A ADJUNTAR*
📐 Plano o sketch con dimensiones generales y cotas
📐 Dibujo isométrico con medidas si existe
🖥️ Screenshots FEA (Von Mises deformación)
📸 Foto del área o situación actual
📋 Cualquier especificación técnica relevante`
};
window.GUIDES = GUIDES;
