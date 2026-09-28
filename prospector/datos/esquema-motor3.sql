-- =============================================================================
--  MOTOR 3 · el esquema del ciclo y del aprendizaje                     (#325)
-- =============================================================================
--
--  POR QUE ESTE ARCHIVO SI PUEDE VIVIR EN EL REPO.
--
--  La regla de arquitectura de este proyecto: los datos de contactos y personas
--  son datos personales y NUNCA se guardan en el repo, porque `fts-suite` es
--  publico. El repo guarda la LOGICA; los contactos reales viven en Postgres.
--
--  Un esquema es logica: dice que FORMA tiene un dato y que reglas lo gobiernan,
--  y no contiene ninguna fila. Por eso esta aqui, y por eso NO hay -- ni puede
--  haber-- un archivo de semillas al lado. Si algun dia aparece un
--  `datos/semillas-motor3.sql` con INSERTs de personas, es un error, no una
--  conveniencia.
--
--  CADA COLUMNA ESTA MARCADA. `[PII]` es dato personal; `[operativo]` no lo es.
--  La marca no es documentacion decorativa: es lo que permite escribir un corte
--  agregado sin arrastrar personas, y lo que le dice a quien haga un respaldo
--  que dos tablas de aqui necesitan otro trato que las demas.
--
--  LAS PERSONAS VIVEN EN DOS TABLAS Y SOLO DOS: `contacto` y `toque_destinatario`.
--  Todo lo demas -- cuentas, senales, tarjetas, toques, cierres, agregados-- es
--  operativo y se puede exportar, graficar y respaldar sin cuidado especial. Esa
--  separacion es deliberada: el expediente de cierre que alimenta los tres lazos
--  (`flujo/aprendizaje.py::expediente_de_cierre`) NO lleva ni nombre ni correo, y
--  esta la razon por la que puede no llevarlos.
--
--  PROHIBIDO, y no es una omision: **celular personal.** No existe como columna
--  en ninguna tabla. No se agrega "por si acaso". El catalogo ya rechaza la
--  fuente que lo recolecta (`cv_celular_masivo`) y el paquete lo declara en
--  `canales_que_no_emite` para que este motor no lo invente.
--
--  ESTE ESQUEMA NO ESCRIBE EN ODOO. Es el registro PROPIO del ciclo. La
--  escritura a Odoo es la etapa 2 y espera OK explicito de Esteban con alcance
--  exacto. Lo que este esquema hace posible sin escribir nada: llevar la
--  cadencia, cerrar tarjetas y alimentar los tres lazos con el CSV de la etapa 1.
--
--  Postgres 14+.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS motor3;
SET search_path TO motor3, public;

-- ---------------------------------------------------------------- vocabularios
-- Los tipos enumerados son la mitad de las reglas duras. Un CHECK en texto libre
-- se rodea con un espacio de mas; un enum no.
--
-- Y hay una razon concreta detras de cada uno: `resultado_de_toque` existe porque
-- la division entre los desenlaces que DESMIENTEN un dato y los que no es lo que
-- hace posible el lazo 2, y esa division tiene que ser la misma aqui y en
-- `flujo/confianza.py::Dato.DESMIENTEN`. Si se separan, el lazo baja niveles por
-- razones que el codigo no reconoce.

CREATE TYPE nivel_de_confianza AS ENUM (
    'confirmado',      -- >=2 fuentes de raiz distinta
    'solido',          -- 1 fuente confiable
    'candidato',       -- derivado de patron, sin ancla
    'en_conflicto',    -- dos fuentes chocan
    'no_encontrado',
    'desmentido'       -- se USO y fallo. Le gana a cualquier cantidad de fuentes
);

CREATE TYPE canal_de_toque AS ENUM (
    'correo_directo', 'linkedin', 'conmutador', 'evento'
    -- 'celular_personal' NO EXISTE, y nunca se agrega.
);

CREATE TYPE resultado_de_toque AS ENUM (
    -- los que DESMIENTEN el dato -> alimentan el lazo 2
    'rebote',                 -- el buzon esta mal
    'persona_equivocada',     -- el emparejamiento nombre/puesto esta mal
    'ya_no_trabaja_aqui',     -- fue cierto y dejo de serlo
    -- los que NO desmienten nada
    'sin_respuesta',          -- el silencio NO es contra-evidencia
    'respuesta_negativa',     -- habla del NEGOCIO: el correo llego y era quien
    'respuesta_positiva'      -- confirma el dato
);

CREATE TYPE destino_de_tarjeta AS ENUM ('caduca', 'recicla', 'evoluciona');

-- OPCION C de #340. `cerrada` significa "se trabajo y termino";
-- `vencida_sin_trabajar` significa "nunca se trabajo", y el lazo 1 TIENE que
-- poder distinguirlas: una cuenta que no convirtio despues de tres toques dice
-- algo de la FUENTE; una que nadie toco no dice nada de la fuente -- dice algo
-- del EQUIPO--. Meterlas en el mismo cajon le ensenaria al radar que sus mejores
-- fuentes no convierten, cuando lo que paso es que nadie llamo.
--
-- Y no es un caso raro: es el caso NORMAL al arrancar el piloto con cuentas ya
-- evaluadas. Coficab Durango nace con la senal caducada seis meses antes.
CREATE TYPE estado_de_tarjeta AS ENUM (
    'abierta',
    'cerrada',
    'vencida_sin_trabajar'
);

CREATE TYPE veredicto_de_compuerta AS ENUM ('sin_datos', 'prematuro', 'alcanza');


-- =============================================================================
--  1 · LA CUENTA
-- =============================================================================
-- La unidad es la PLANTA, no la empresa: Coficab Pesqueria y Coficab Ciudad
-- Juarez son dos cuentas con historia distinta -- y ese dato costo un issue
-- entero de descubrir (#320)--.
CREATE TABLE cuenta (
    id                  bigserial PRIMARY KEY,
    -- [operativo] La llave de RECICLAJE: `dominio_correo|ciudad`. Es la que
    -- reconoce "la misma cuenta" cuando una tarjeta archivada tiene que reabrir.
    --
    -- ES NULLABLE A PROPOSITO, y esto es una decision, no un descuido: la llave
    -- solo se puede armar con un dominio OBSERVADO en un correo ancla. Cuando no
    -- hay ninguno, la respuesta correcta es NULL y el reciclaje se resuelve a
    -- mano. Poner aqui un dominio adivinado del nombre de la empresa volveria a
    -- ser la llave por nombre con un disfraz, que es lo que el diseno rechazo
    -- (`HERSMEX` por Hershey).
    llave_de_reciclaje  text UNIQUE,
    -- [operativo] La llave de la CORRIDA: `Empresa/Ciudad`. Sirve para volver al
    -- estado del motor 2, y NO para reciclar.
    llave_de_corrida    text NOT NULL,
    empresa             text NOT NULL,          -- [operativo] una empresa no es
    planta              text,                   -- [operativo] una persona
    giro                text,                   -- [operativo]
    -- [operativo] Si la cuenta empata con el corte vigente del DENUE. Es FACTOR,
    -- no requisito (decision 3 de #305), y se guarda porque es la unica forma de
    -- contestar el hueco del §3d: si las que convierten NO estan en el padron,
    -- los +8 estan sesgando el radar contra la planta nueva.
    en_padron_denue     boolean,
    -- [operativo] El dueno de la cartera. Es un USUARIO de FTS, no un prospecto:
    -- un empleado en su rol laboral no es el dato personal que este esquema
    -- protege. Aun asi va por id de Odoo y no por correo, para no replicar
    -- buzones de la casa en cada respaldo.
    usuario_odoo_id     integer,
    creada              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cuenta_llave_de_corrida_unica UNIQUE (llave_de_corrida)
);

COMMENT ON COLUMN cuenta.llave_de_reciclaje IS
  'dominio|ciudad, solo de correos ancla observados. NULL cuando no hay ninguno.';


-- =============================================================================
--  2 · LA SENAL, con el puntaje del evaluador TAL COMO FUE
-- =============================================================================
-- Es la tabla que el hallazgo H1 de #325 hizo necesaria. Sin ella, una tarjeta
-- cerrada no se puede atribuir a nada y los lazos 1 y 3 no existen.
--
-- EL PUNTAJE ES UNA FOTO, NO UN CALCULO. No hay vista que lo recalcule, y es a
-- proposito: la frescura de una senal cambia todos los dias, asi que recalcular
-- el puntaje de una senal de hace ocho meses daria un numero distinto del que se
-- uso para decidir gastar 60 consultas. El lazo tiene que comparar el desenlace
-- contra la decision que se tomo, no contra la que se tomaria hoy.
CREATE TABLE senal (
    id                bigserial PRIMARY KEY,
    cuenta_id         bigint NOT NULL REFERENCES cuenta(id) ON DELETE CASCADE,
    -- [operativo] QUIEN nos lo dijo. Tiene que existir en
    -- `flujo/radar.py::FUERZA_DE_FUENTE`: una fuente que el evaluador no conoce
    -- puntua cero y su leccion no tiene donde aterrizar.
    fuente            text NOT NULL,
    -- [operativo] QUE esta pasando. Distinto de la fuente, y la distincion
    -- importa: la fuente dice cuanto CREERLE, el tipo dice CUANDO SE VENCE.
    -- Mezclar los dos ejes es lo que dejo muerta la tabla de caducidad (H2).
    tipo              text,
    texto             text,                     -- [operativo] el hallazgo
    fecha_senal       date,                     -- [operativo] la del evento
    fecha_de_cierre   date,                     -- [operativo] convocatorias
    fecha_del_evento  date,                     -- [operativo] camaras y congresos
    -- [operativo] El veredicto del evaluador, completo.
    puntaje           numeric(5,1),
    veredicto         text,                     -- pasa | guarda | archiva
    familia           text,                     -- electrico, termico_fluidos, ...
    empata_padron     boolean,
    -- El DESGLOSE, no solo el total. Un 72 no dice si vino de un match de
    -- catalogo fuerte con senal vieja o de lo contrario, y son dos lecciones
    -- OPUESTAS para el lazo 1.
    desglose          jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- [operativo] false cuando la senal se declaro a mano sin pasar por el
    -- evaluador. Esas cuentas pueden contar conversiones por fuente y NO pueden
    -- corregir la curva de frescura ni los pesos por familia.
    evaluada          boolean NOT NULL DEFAULT false,
    declarada         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX senal_por_cuenta   ON senal (cuenta_id);
CREATE INDEX senal_por_fuente   ON senal (fuente);
CREATE INDEX senal_por_tipo     ON senal (tipo);

-- Una convocatoria sin fecha de cierre va a caducar por el plazo por omision, y
-- puede vencer DESPUES de que la convocatoria cerro. Se permite guardarla -- el
-- dato existe aunque este incompleto-- y la vista `senal_incompleta` la saca a
-- la luz en vez de dejarla pasar en silencio.
CREATE VIEW senal_incompleta AS
SELECT id, cuenta_id, fuente, tipo,
       CASE
         WHEN tipo = 'convocatoria_abierta' AND fecha_de_cierre IS NULL
              THEN 'convocatoria sin fecha de cierre: el plazo no lo decide FTS'
         WHEN tipo = 'presencia_en_evento' AND fecha_del_evento IS NULL
              THEN 'senal de evento sin fecha: el evento ES el canal'
         WHEN NOT evaluada
              THEN 'sin puntaje del evaluador: no alimenta el lazo de los pesos'
         WHEN fecha_senal IS NULL
              THEN 'sin fecha: el reloj de caducidad arranca en hoy y le regala '
                   'a la senal vieja la ventana de una fresca'
       END AS que_le_falta
FROM senal
WHERE (tipo = 'convocatoria_abierta' AND fecha_de_cierre IS NULL)
   OR (tipo = 'presencia_en_evento'  AND fecha_del_evento IS NULL)
   OR NOT evaluada
   OR fecha_senal IS NULL;


-- =============================================================================
--  3 · LA TARJETA
-- =============================================================================
-- Un `crm.lead` de tipo `lead`, no `opportunity`. Un prospecto que nunca
-- contesto no es una oportunidad perdida: nunca fue una oportunidad.
CREATE TABLE tarjeta (
    id                 bigserial PRIMARY KEY,
    cuenta_id          bigint NOT NULL REFERENCES cuenta(id) ON DELETE CASCADE,
    -- [operativo] La senal VIGENTE, la que puso el reloj actual. Las anteriores
    -- no se pierden: viven en `tarjeta_senal`.
    senal_id           bigint REFERENCES senal(id) ON DELETE SET NULL,
    estado             estado_de_tarjeta NOT NULL DEFAULT 'abierta',
    caduca_el          date,                    -- [operativo]
    -- [operativo] POR QUE esa fecha, en palabras. Sin esto, un plazo de 60 dias
    -- por omision se lee igual que un plazo de 60 dias razonado, y son cosas
    -- distintas: uno no significa nada.
    caduca_por_que     text,
    -- [operativo] Cuantas veces REABRIO. No se reinicia nunca: a la tercera
    -- reapertura sin respuesta la cuenta dice algo, y lo que dice es *el canal
    -- esta mal, no el momento*.
    reaperturas        integer NOT NULL DEFAULT 0,
    -- [operativo] OPCION C de #340. Una tarjeta que nacio vencida y que el
    -- operador decidio trabajar de todas formas se reabre con la caducidad
    -- RECALCULADA DESDE HOY, no con la original: una senal de obra nueva de hace
    -- diez meses no esta muerta como prospecto -- la planta sigue comprando--
    -- pero su ventana de especificacion si cerro. Reabrirla con la caducidad
    -- original la mata en el acto; reabrirla con su plazo desde hoy es honesto
    -- sobre lo que se esta haciendo: tratar una senal vieja como punto de
    -- partida, no como senal fresca.
    --
    -- Y queda ESCRITO, porque el lazo 1 lo necesita: si esa tarjeta convierte, la
    -- curva de frescura tiene un contraejemplo medido, y un contraejemplo medido
    -- vale mas que la curva.
    reabierta_vencida  boolean NOT NULL DEFAULT false,
    caducidad_original date,
    -- [operativo] El id del lead en Odoo, cuando exista. NULL en la etapa 1,
    -- donde el CSV lo sube una persona y nadie devuelve el id.
    odoo_lead_id       integer,
    abierta            timestamptz NOT NULL DEFAULT now(),
    cerrada            timestamptz,
    CONSTRAINT tarjeta_cerrada_tiene_fecha
        CHECK ((estado = 'cerrada') = (cerrada IS NOT NULL)),
    -- Una tarjeta que nace vencida SIN la caducidad que ya se le paso no se puede
    -- auditar: nadie podria decir de cuando era la senal que la mato. Y una
    -- reapertura de vencida sin ese dato es peor, porque borra justo el numero que
    -- el lazo 1 necesita para el contraejemplo.
    CONSTRAINT vencida_sin_trabajar_guarda_su_caducidad
        CHECK (estado <> 'vencida_sin_trabajar' OR caducidad_original IS NOT NULL),
    CONSTRAINT reabierta_vencida_guarda_su_caducidad
        CHECK (NOT reabierta_vencida OR caducidad_original IS NOT NULL)
);

CREATE INDEX tarjeta_por_cuenta ON tarjeta (cuenta_id);
CREATE INDEX tarjeta_por_vencer ON tarjeta (caduca_el) WHERE estado = 'abierta';

-- UNA SOLA TARJETA ABIERTA POR CUENTA. Es el destino 2 del diseno convertido en
-- restriccion, y es la decision de diseno mas importante del motor 3: si cada
-- senal crea una tarjeta, al ano hay seis de la misma cuenta, nadie sabe cual es
-- la vigente, y el equipo vuelve a presentarse como si no se conocieran.
--
-- Escrito como indice unico parcial y no como trigger: una regla que el motor de
-- la base sostiene no se puede rodear desde un flujo de n8n a las 3 de la manana.
CREATE UNIQUE INDEX tarjeta_una_abierta_por_cuenta
    ON tarjeta (cuenta_id) WHERE estado = 'abierta';

-- Las senales ACUMULADAS de una tarjeta. La reapertura SUMA, no reemplaza: la
-- senal nueva se agrega con su fecha y la vieja se queda. Es lo que hace posible
-- el unico mensaje frio que funciona: "el ano pasado platicamos de X, veo que
-- ahora Y".
CREATE TABLE tarjeta_senal (
    tarjeta_id   bigint NOT NULL REFERENCES tarjeta(id) ON DELETE CASCADE,
    senal_id     bigint NOT NULL REFERENCES senal(id)   ON DELETE CASCADE,
    reabrio      boolean NOT NULL DEFAULT false,  -- [operativo] si ESTA reabrio
    agregada     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tarjeta_id, senal_id)
);


-- =============================================================================
--  4 · LOS CONTACTOS  ·  *** LA UNICA TABLA CON DATOS PERSONALES ***
-- =============================================================================
--  TODO LO DE AQUI ES [PII]. Esta tabla y `toque_destinatario` son las dos
--  unicas del esquema que no se pueden exportar, graficar ni respaldar como las
--  demas. Un corte agregado NUNCA las necesita: los lazos leen `toque`, que trae
--  canal, fecha, nivel y resultado, y no trae a nadie.
--
--  Y hay una regla que se cumple aqui por construccion: el correo de nivel
--  `candidato` vive en `correo` con su nivel escrito, y la vista
--  `correo_que_si_se_puede_enviar` es la unica que lo deja salir. De donde Odoo
--  envia no sale un correo derivado de un patron: eso es un rebote con el dominio
--  de FTS, o peor, un correo a la persona equivocada.
-- =============================================================================
CREATE TABLE contacto (
    id                  bigserial PRIMARY KEY,
    cuenta_id           bigint NOT NULL REFERENCES cuenta(id) ON DELETE CASCADE,
    nombre              text,                   -- [PII]
    puesto              text,                   -- [PII] en contexto
    correo              text,                   -- [PII]
    nivel_correo        nivel_de_confianza,     -- [PII] en contexto
    nivel_puesto        nivel_de_confianza,
    -- [operativo] Que tan cerca de la decision. Es un numero del metodo, no de
    -- la persona.
    cercania_decision   integer,
    sigue_en_la_casa    boolean NOT NULL DEFAULT true,
    -- [operativo] Marcado por el motor 2: NO se contacta sin que una persona lo
    -- revise, y NO se crea como partner en Odoo -- ahi un partner con nombre y
    -- puesto se ve identico venga de donde venga--.
    revision_humana     boolean NOT NULL DEFAULT false,
    motivo_revision     text,
    canal_recomendado   canal_de_toque,
    canal_por_que       text,
    modulo_origen       text,                   -- [operativo] M0, M5, M13, ...
    odoo_partner_id     integer,
    creado              timestamptz NOT NULL DEFAULT now()
    -- celular_personal: NO EXISTE. Ver el encabezado.
);

CREATE INDEX contacto_por_cuenta ON contacto (cuenta_id);

-- LOS DESMENTIDOS: la unica via por la que un nivel BAJA.
-- Hallazgo H5 de #325. El nivel de un dato se DERIVA de sus observaciones, y un
-- rebote no es una observacion -- nadie observo un correo, se intento enviar a
-- uno--, asi que sin esta tabla ningun desenlace del CRM podia corregir al motor
-- 2 y el motor 2 nunca se enteraba de si sus correos llegaban.
--
-- El CHECK encierra la regla que mas importa: `sin_respuesta` y
-- `respuesta_negativa` NO pueden entrar aqui. El silencio no es contra-evidencia
-- -- el correo pudo llegar perfectamente y la persona no contestar-- y contarlo
-- acabaria descartando los correos buenos de las cuentas que no contestan.
CREATE TABLE desmentido (
    id             bigserial PRIMARY KEY,
    contacto_id    bigint NOT NULL REFERENCES contacto(id) ON DELETE CASCADE,
    campo          text NOT NULL,             -- correo | puesto | contacto
    que_paso       resultado_de_toque NOT NULL,
    detalle        text,                      -- [PII] posible: "550 mailbox ..."
    fecha          date,
    de_donde       text NOT NULL DEFAULT 'motor3_crm_odoo',
    registrado     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT solo_los_que_de_verdad_desmienten CHECK (
        que_paso IN ('rebote', 'persona_equivocada', 'ya_no_trabaja_aqui'))
);

CREATE INDEX desmentido_por_contacto ON desmentido (contacto_id);

-- Un correo desmentido NO vuelve a salir por aqui, aunque su `nivel_correo`
-- siguiera diciendo `confirmado`: el desmentido le gana a cualquier cantidad de
-- fuentes, porque no es otra opinion sobre el dato -- es el resultado de USARLO--.
CREATE VIEW correo_que_si_se_puede_enviar AS
SELECT c.id AS contacto_id, c.cuenta_id, c.correo, c.nivel_correo
FROM contacto c
WHERE c.correo IS NOT NULL
  AND c.nivel_correo IN ('confirmado', 'solido')
  AND NOT c.revision_humana
  AND c.sigue_en_la_casa
  AND NOT EXISTS (SELECT 1 FROM desmentido d
                  WHERE d.contacto_id = c.id AND d.campo = 'correo');


-- =============================================================================
--  5 · LOS TOQUES  ·  sin personas, a proposito
-- =============================================================================
-- `toque` es la tabla que los tres lazos leen, y NO tiene ni nombre ni correo.
-- Lleva el NIVEL con el que se hizo el toque -- que es el dato que el lazo 2
-- necesita-- y quien fue va aparte, en `toque_destinatario`.
--
-- La separacion no es purismo: es lo que permite sacar el corte de aprendizaje
-- con un `SELECT * FROM toque` sin que nadie tenga que acordarse de excluir
-- columnas. Un corte que hay que recordar limpiar es un corte que un dia sale
-- sin limpiar.
CREATE TABLE toque (
    id                 bigserial PRIMARY KEY,
    tarjeta_id         bigint NOT NULL REFERENCES tarjeta(id) ON DELETE CASCADE,
    n                  integer NOT NULL,        -- [operativo] 1, 2, 3...
    canal              canal_de_toque NOT NULL, -- [operativo]
    programado_para    date,                    -- [operativo]
    hecho_el           date,                    -- [operativo]
    resultado          resultado_de_toque,      -- [operativo] NULL = pendiente
    -- [operativo] El nivel del correo CON EL QUE SE TOCO. Es la mitad del lazo 2:
    -- un rebote sobre un `candidato` mide que el patron esta mal; un rebote sobre
    -- un `confirmado` mide que la persona se fue.
    nivel_del_correo   nivel_de_confianza,
    odoo_activity_id   integer,
    UNIQUE (tarjeta_id, n)
);

CREATE INDEX toque_por_tarjeta   ON toque (tarjeta_id);
CREATE INDEX toque_pendiente     ON toque (programado_para) WHERE resultado IS NULL;

-- A QUIEN se toco.  *** [PII] ***  Tabla aparte por la razon del bloque de
-- arriba: para que `toque` se pueda leer completo sin tocar personas.
CREATE TABLE toque_destinatario (
    toque_id      bigint PRIMARY KEY REFERENCES toque(id) ON DELETE CASCADE,
    contacto_id   bigint NOT NULL REFERENCES contacto(id) ON DELETE CASCADE
);


-- =============================================================================
--  6 · EL CIERRE  ·  el expediente que alimenta los tres lazos
-- =============================================================================
-- Lo que `flujo/aprendizaje.py::expediente_de_cierre` produce, guardado.
--
-- NO LLEVA CONCLUSIONES. Ni "esta fuente sirve" ni "el plazo esta mal": lleva lo
-- que paso. Las conclusiones las saca cada lazo despues, sobre muchos
-- expedientes y con su compuerta. Un registro que ya viene con la conclusion
-- adentro no se puede reinterpretar cuando la regla cambie -- y las reglas de
-- este proyecto cambian cada issue--.
CREATE TABLE cierre (
    id                         bigserial PRIMARY KEY,
    tarjeta_id                 bigint NOT NULL REFERENCES tarjeta(id) ON DELETE CASCADE,
    cuenta_id                  bigint NOT NULL REFERENCES cuenta(id) ON DELETE CASCADE,
    senal_id                   bigint REFERENCES senal(id) ON DELETE SET NULL,
    destino                    destino_de_tarjeta NOT NULL,
    motivo                     text,
    -- [operativo] La razon escrita, con lo que de verdad paso: cuantos toques,
    -- por que canales, que senal la origino. Una tarjeta archivada sin esto no le
    -- ensena nada al radar.
    reaperturas_previas        integer NOT NULL DEFAULT 0,
    convirtio                  boolean NOT NULL DEFAULT false,
    dias_hasta_primera_resp    integer,
    canal_que_funciono         canal_de_toque,
    monto_si_hubo              numeric(14,2),
    moneda                     char(3),         -- Odoo es multi-moneda (medido)
    -- [operativo] Lo que hace al catalogo PREDICTIVO en vez de historico: que
    -- proceso del cliente produjo que tipo de proyecto, de verdad.
    proceso_del_cliente        text,
    tipo_de_proyecto_cotizado  text,
    -- [operativo] true cuando la cuenta no traia expediente de senal. Estas
    -- cuentas NO cuentan para los lazos 1 y 3, y decirlo importa: un tablero que
    -- muestra "8 cierres" cuando 5 no ensenan nada hace creer que el aprendizaje
    -- avanza mas rapido de lo que avanza.
    sin_expediente_de_senal    boolean NOT NULL DEFAULT false,
    emitido                    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tarjeta_id)
);

CREATE INDEX cierre_por_cuenta  ON cierre (cuenta_id);
CREATE INDEX cierre_por_destino ON cierre (destino);


-- =============================================================================
--  7 · LOS AJUSTES PROPUESTOS  ·  y nunca aplicados solos
-- =============================================================================
-- Lo que cada lazo propone mover, con su cuenta. Se guarda PROPUESTO y alguien
-- lo aprueba: un evaluador que se reajusta solo es un evaluador que nadie puede
-- auditar, y su puntaje decide si se gastan 60 consultas por cuenta.
--
-- `aplicado_por` es NOT NULL cuando `aplicado_el` lo es, y el CHECK lo sostiene:
-- un ajuste aplicado sin nombre no se le puede preguntar a nadie.
CREATE TABLE ajuste_propuesto (
    id             bigserial PRIMARY KEY,
    lazo           smallint NOT NULL CHECK (lazo IN (1, 2, 3)),
    celda          text NOT NULL,     -- fuerza_de_fuente[prensa_industrial]
    archivo        text NOT NULL,     -- flujo/radar.py
    constante      text NOT NULL,     -- FUERZA_DE_FUENTE
    n_observado    integer NOT NULL,
    n_minimo       integer NOT NULL,
    veredicto      veredicto_de_compuerta NOT NULL,
    valor_vigente  jsonb,
    valor_sugerido jsonb,
    propuesta      text NOT NULL,     -- la cuenta, en palabras
    calculado_el   timestamptz NOT NULL DEFAULT now(),
    aplicado_el    timestamptz,
    aplicado_por   text,
    CONSTRAINT solo_se_aplica_lo_que_alcanza
        CHECK (aplicado_el IS NULL OR veredicto = 'alcanza'),
    CONSTRAINT un_ajuste_aplicado_tiene_nombre
        CHECK ((aplicado_el IS NULL) = (aplicado_por IS NULL))
);

CREATE INDEX ajuste_por_lazo ON ajuste_propuesto (lazo, calculado_el DESC);


-- =============================================================================
--  8 · LAS VISTAS DEL TABLERO  ·  todas SIN datos personales
-- =============================================================================
-- Ninguna vista de aqui toca `contacto` ni `toque_destinatario`. El tablero se
-- puede abrir, compartir y capturar en pantalla sin exponer a nadie.

-- QUE TOCA HOY. Lo que Odoo ya sabe recordar, pero visible fuera de Odoo para la
-- etapa 1, donde todavia no hay `mail.activity` creada por nadie.
CREATE VIEW toca_hoy AS
SELECT t.id AS tarjeta_id, c.empresa, c.planta, q.n, q.canal, q.programado_para,
       t.caduca_el,
       (t.caduca_el - CURRENT_DATE) AS dias_para_caducar
FROM toque q
JOIN tarjeta t ON t.id = q.tarjeta_id
JOIN cuenta  c ON c.id = t.cuenta_id
WHERE q.resultado IS NULL
  AND t.estado = 'abierta'
  AND q.programado_para <= CURRENT_DATE
ORDER BY q.programado_para, t.caduca_el NULLS LAST;

-- LAS QUE ESTAN POR VENCER sin haber agotado su cadencia. Es la unica alarma que
-- el ciclo necesita: una tarjeta que caduca con toques sin hacer es trabajo que
-- se va a perder por no hacerse, no por no funcionar.
CREATE VIEW caducan_con_toques_pendientes AS
SELECT t.id AS tarjeta_id, c.empresa, c.planta, t.caduca_el,
       (t.caduca_el - CURRENT_DATE) AS dias,
       count(q.id) FILTER (WHERE q.resultado IS NULL) AS toques_sin_hacer
FROM tarjeta t
JOIN cuenta c ON c.id = t.cuenta_id
LEFT JOIN toque q ON q.tarjeta_id = t.id
WHERE t.estado = 'abierta' AND t.caduca_el IS NOT NULL
GROUP BY t.id, c.empresa, c.planta, t.caduca_el
HAVING count(q.id) FILTER (WHERE q.resultado IS NULL) > 0
   AND t.caduca_el <= CURRENT_DATE + 14
ORDER BY t.caduca_el;

-- EL LAZO 1, listo para leer: conversion por fuente contra el peso vigente.
CREATE VIEW conversion_por_fuente AS
SELECT s.fuente,
       count(*)                                  AS cierres,
       count(*) FILTER (WHERE x.convirtio)       AS convirtieron,
       round(100.0 * count(*) FILTER (WHERE x.convirtio) / count(*), 1)
                                                 AS pct,
       -- La compuerta del lazo 1 es POR CELDA: 20 cierres repartidos en once
       -- fuentes son menos de dos por fuente, y dos cierres no dicen nada de una
       -- fuente.
       (count(*) >= 20)                          AS alcanza_la_compuerta
FROM cierre x
JOIN senal s ON s.id = x.senal_id
GROUP BY s.fuente
ORDER BY pct DESC NULLS LAST;

-- EL HUECO DEL §3d, con numero. Es la unica celda del lazo 1 que puede llegar a
-- valer cero: si las que convierten NO estan en el padron, los +8 estan sesgando
-- el radar contra la obra nueva, que es el mejor prospecto que existe.
CREATE VIEW conversion_por_padron AS
SELECT coalesce(s.empata_padron, false) AS en_el_padron,
       count(*) AS cierres,
       count(*) FILTER (WHERE x.convirtio) AS convirtieron,
       round(100.0 * count(*) FILTER (WHERE x.convirtio) / count(*), 1) AS pct
FROM cierre x
JOIN senal s ON s.id = x.senal_id
GROUP BY 1;

-- EL LAZO 3: cuanto tardaron de verdad, contra el plazo vigente.
CREATE VIEW dias_hasta_respuesta_por_tipo AS
SELECT s.tipo,
       count(*) AS cierres,
       count(x.dias_hasta_primera_resp) AS respondieron,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY x.dias_hasta_primera_resp)
                            AS mediana_dias,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY x.dias_hasta_primera_resp)
                            AS p90_dias,
       (count(x.dias_hasta_primera_resp) >= 10) AS alcanza_la_compuerta
FROM cierre x
JOIN senal s ON s.id = x.senal_id
GROUP BY s.tipo
ORDER BY s.tipo;

-- LAS QUE NACIERON VENCIDAS Y NADIE TRABAJO. OPCION C de #340.
--
-- ESTO NO ES UNA METRICA DEL RADAR, ES UNA METRICA DEL PROCESO: mide cuanto tarda
-- el equipo en trabajar lo que el radar detona. Si esta lista crece, el problema no
-- es que el radar detecte mal -- es que lo que detecta se queda sin trabajar--.
--
-- Deliberadamente NO lleva a los lazos: no hay `cierre`, asi que
-- `conversion_por_fuente`, `conversion_por_padron` y
-- `dias_hasta_respuesta_por_tipo` no la ven. Eso es el punto entero de la opcion C.
CREATE VIEW vencidas_sin_trabajar AS
SELECT t.id AS tarjeta_id, c.empresa, c.planta, c.llave_de_corrida,
       s.fuente, s.tipo, s.fecha_senal,
       t.caducidad_original,
       (CURRENT_DATE - t.caducidad_original) AS dias_vencida,
       t.caduca_por_que,
       t.reabierta_vencida
FROM tarjeta t
JOIN cuenta c ON c.id = t.cuenta_id
LEFT JOIN senal s ON s.id = t.senal_id
WHERE t.estado = 'vencida_sin_trabajar'
ORDER BY t.caducidad_original;

-- LAS CUENTAS QUE HAY QUE REGENERAR: cerraron sin expediente de senal, asi que
-- no pueden ensenarle nada a los lazos 1 y 3.
CREATE VIEW cuentas_por_regenerar AS
SELECT c.llave_de_corrida, c.empresa, c.planta, count(x.id) AS cierres_perdidos
FROM cierre x
JOIN cuenta c ON c.id = x.cuenta_id
WHERE x.sin_expediente_de_senal
GROUP BY c.llave_de_corrida, c.empresa, c.planta
ORDER BY cierres_perdidos DESC;
