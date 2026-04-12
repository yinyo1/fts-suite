// ═══ Datos constantes del módulo ═══

export const TYPES=[
  {id:"tuberia",icon:"🔧",label:"Soporte de Tubería",desc:"Racks, soportes para líneas de proceso"},
  {id:"mezz_personas",icon:"🚶",label:"Mezzanine — Personas",desc:"Plataformas, pasarelas, escaleras"},
  {id:"mezz_equipos",icon:"⚙️",label:"Mezzanine — Equipos",desc:"Plataformas para bombas, filtros, equipos"},
  {id:"polipasto",icon:"🏗️",label:"Polipasto / Grúa",desc:"Monorrieles, puentes grúa, pórticos"},
  {id:"tanque",icon:"🛢️",label:"Soporte Tanque",desc:"Bases para tanques, recipientes a presión"},
  {id:"general",icon:"🔩",label:"Estructura General",desc:"Marcos, pórticos, techumbres u otro"}
];
export const MATS=["AISI 304 (Inox)","AISI 316 (Inox)","ASTM A36 (Carbón)","ASTM A500 Gr.B (HSS)","ASTM A992 (Estructural)","ASTM A572 Gr.50","Otro (especificar)"];
export const PERFS=["HSS 2x2x3/16\"","HSS 2x2x1/4\"","HSS 3x3x3/16\"","HSS 3x3x1/4\"","HSS 4x4x1/4\"","HSS 4x4x3/8\"","HSS 6x4x1/4\"","PTR 2\"x2\" Cal.14","PTR 2\"x2\" Cal.12","PTR 3\"x3\" Cal.14","PTR 3\"x3\" Cal.12","PTR 4\"x4\" Cal.11","Ángulo L2x2x3/16\"","Ángulo L2x2x1/4\"","Ángulo L3x3x1/4\"","Canal C4x5.4","Canal C6x8.2","Canal C8x11.5","IPR W6x9","IPR W8x10","IPR W8x15","IPR W10x22","IPR W12x26","IPR W14x30","Tubo Ø2\" Cal.14","Tubo Ø3\" Cal.14","Tubo Ø4\" Cal.11","Monorriel S6x12.5","Monorriel S8x18.4","Monorriel W8x10","Rejilla Irving 19-W-4","Rejilla Irving 15-W-4","Placa antiderrap. Cal.14","Placa antiderrap. Cal.11","Otro (especificar)"];
export const FLUIDS=["Agua tratada","Agua cruda","Agua de proceso","Solución química","Aire comprimido","Vapor","Otro"];
export const PISOS=["Rejilla Irving 19-W-4","Rejilla Irving 15-W-4","Placa antiderrapante Cal.14","Placa antiderrapante Cal.11","Losacero","Otro"];
export const PATAS=["Columna simple","Tipo Y (3 patas)","Tipo H (4 patas)","Tipo L (2 patas)","Pórtico"];
export const TAQUETES=["Hilti HST3","Hilti HAS-E","Hilti HSA","Simpson Strong-Tie","Red Head Trubolt","Ancla embebida","Otro"];
export const ZONAS=["Zona A (Monterrey)","Zona B","Zona C","Zona D (Alta sismicidad)"];
export const EXPOS=["B (Urbana)","C (Industrial)","D (Abierta)"];

export let D={tipo_estructura:"",cliente:"",proyecto:"",ubicacion_planta:"",ubicacion_municipio:"",ubicacion_estado:"Nuevo León",num_documento:"",nombre_documento:"",material_columnas:"",perfil_columnas:"",material_columnas_otro:"",perfil_columnas_otro:"",material_vigas:"",perfil_vigas:"",material_vigas_otro:"",perfil_vigas_otro:"",material_piso:"",perfil_piso:"",num_columnas:"",altura_columna_mm:"",longitud_total_mm:"",ancho_total_mm:"",separacion_marcos_mm:"",config_patas:"Columna simple",usa_arriostres:false,perfil_arriostres:"",num_niveles:"1",altura_entrenivel_mm:"",carga_muerta_estructura_kg_m2:"",carga_muerta_piso_kg_m2:"",carga_muerta_tuberia_kg:"",carga_muerta_agua_kg:"",carga_muerta_accesorios_kg:"",carga_muerta_valvulas_kg:"",carga_muerta_equipo_kg:"",carga_por_columna_kg:"",carga_viva_kg_m2:"",carga_viva_justificacion:"",carga_puntual_kg:"",carga_puntual_ubicacion:"",diametro_tuberia_pulg:"",longitud_tuberia_m:"",num_tuberias:"",fluido:"",presion_operacion_psi:"",aplica_ariete:false,caudal_ls:"",tiempo_cierre_seg:"",tiene_vfd:false,num_codos:"",ubicacion_codos:"",extremos_anclados:true,longitud_tramo_m:"",equipo_nombre:"",equipo_peso_kg:"",equipo_dimensiones:"",equipo_peso_operacion_kg:"",equipo_cg_altura_mm:"",equipo_es_vibratorio:false,factor_impacto:"1.0",num_equipos:"1",capacidad_polipasto_kg:"",peso_polipasto_kg:"",marca_modelo_polipasto:"",clase_servicio_cmaa:"B",tipo_sistema_grua:"monorriel",claro_monorriel_mm:"",recorrido_mm:"",altura_izaje_mm:"",tipo_monorriel:"",carga_dinamica_factor:"1.25",peso_recipiente_vacio_kg:"",contenido_volumen_lt:"",contenido_densidad:"1.0",contenido_porciento_llenado:"100",accesorios_conectados:"",software_fea:"",esfuerzo_von_mises_max_mpa:"",ubicacion_von_mises:"",tipo_piso:"",tipo_barandal:"",altura_barandal_mm:"1070",tiene_escalera:false,tipo_escalera:"",ancho_escalera_mm:"",tiene_portilla:false,zona_sismica:"Zona A (Monterrey)",coef_sismico_manual:"",velocidad_viento_kmh:"",categoria_exposicion:"C",factor_importancia:"1.0",fc_concreto_kgcm2:"250",tipo_taquete:"Hilti HST3",diametro_taquete:'1/2"',longitud_empotramiento_mm:"",num_taquetes_por_placa:"4",espesor_placa_base_mm:"",dimensiones_placa_base:"",cimenta_en_losa:true,cimenta_en_dado:false,dimensiones_dado:"",elaboro:"",reviso:"",aprobo:"",rev_numero:"0",rev_fecha:"",rev_descripcion:"Emisión inicial",notas_adicionales:"",notas_proyecto:"",notas_estructura:"",notas_cargas:"",notas_tuberia:"",notas_ariete:"",notas_equipos:"",notas_izaje:"",notas_acceso:"",notas_sismo_viento:"",notas_cimentacion:"",notas_fea:"",tiene_img_fea_frontal:false,tiene_img_fea_lateral:false,tiene_img_fea_3d:false,archivo_planos:false,archivo_render_3d:false,archivo_cargas:false,archivo_fea_frontal:false,archivo_fea_lateral:false,archivo_fea_3d:false,archivo_render_equipo:false,archivo_escalera:false,archivo_datasheet:false,archivo_polipasto:false,archivo_tanque:false,archivo_extra:false};

// Estado runtime del wizard
export let currentStep = 0;
export function setCurrentStep(n){ currentStep = n; }
export let rawParsedData = null;
export function setRawParsedData(d){ rawParsedData = d; }
export let rawUploadedFiles = [];
