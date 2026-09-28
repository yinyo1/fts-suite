-- ═══════════════════════════════════════════════════════════════════════════
-- 010_comision_beneficiario.sql · a quién le toca la comisión, con id
-- Issue #294 (Estación 3) · sesión de construcción del 27/28-sep-2026
--
-- ── EL PROBLEMA, MEDIDO ───────────────────────────────────────────────────
-- La tabla de comisiones del machote guarda NOMBRES en texto libre. Los cuatro
-- que traía la plantilla salían de una hoja de Excel de hace años:
--
--     de los 4 nombres de la plantilla, 3 ya no están en la empresa
--     2 personas activas con cuenta de comisión propia no aparecían en ninguna
--     las 32 cuentas del plan 20 de Odoo tienen `code` VACÍO, las 32
--     y `partner_id` VACÍO, las 32
--
-- O sea: el «3.1» y el «5.2.1» viven DENTRO DEL NOMBRE de la cuenta, y no hay
-- una sola llave por la que una máquina pueda casar «MONTY» con la cuenta 1156.
-- Mientras eso siga así, el presupuesto del proyecto no puede saber a qué
-- cuenta analítica va el dinero de una comisión.
--
-- ── QUÉ RESUELVE ESTA MIGRACIÓN, Y QUÉ NO ─────────────────────────────────
-- Resuelve la LLAVE: un catálogo propio de beneficiarios que apunta a la cuenta
-- del plan 20 por id, y al empleado de Odoo por id cuando es interno. Desde el
-- machote se guarda `cuenta_id`, no un nombre.
--
-- NO resuelve el catálogo de Odoo. `code` y `partner_id` siguen vacíos allá, y
-- poblarlos es la reparación R11 del plan maestro —minutos en la interfaz de
-- Odoo, trabajo de Gerardo—. Esta tabla existe para que el sistema funcione
-- MIENTRAS eso pasa, y para que después siga funcionando igual: cuando R11 se
-- haga, `cuenta_id` seguirá siendo la llave y no habrá nada que tirar.
--
-- ── LA APROBACIÓN, Y LA FRASE QUE LA GOBIERNA ─────────────────────────────
-- Decisión de Esteban (respuesta 7 del #294): crear un beneficiario pre-crea su
-- plan de comisión, queda PENDIENTE DE AUTORIZAR y deja seguir armando el
-- machote; lo que bloquea es CONFIRMAR la orden. La autoriza Erick por correo.
--
--     LA LIGA APRUEBA UN RENGLÓN DE CATÁLOGO. NO APRUEBA UN PAGO.
--
-- Ningún peso se mueve por aprobar esto. Lo que se aprueba es que esa persona
-- PUEDA aparecer como beneficiaria; cuánto se le paga y cuándo son decisiones
-- posteriores y separadas, y cada una tiene su propio acto humano. Es lo que
-- permite que la liga viaje por correo sin ser una llave del banco.
--
-- ── POR QUÉ DOS TABLAS ────────────────────────────────────────────────────
-- Porque son dos cosas con dos vidas distintas: el BENEFICIARIO dura años, y la
-- SOLICITUD de aprobación dura horas y se puede repetir. Metidas en una, cada
-- reenvío de correo pisaría el historial de la anterior — y «ya le pedí tres
-- veces» es exactamente lo que hay que poder contestar.
--
-- Idempotente: se puede correr dos veces sin romper nada.
-- ═══════════════════════════════════════════════════════════════════════════


-- ══ 1 · El beneficiario ════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS comercial.comision_beneficiario (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'interno' = empleado de FTS · 'externo' = broker o contacto del cliente.
  -- La distinción manda en qué se puede crear desde una cotización: un externo
  -- sí, un interno NO. Un interno es un empleado, y los empleados se dan de
  -- alta en RH.
  tipo          text        NOT NULL,

  nombre        text        NOT NULL,

  -- ── Las dos referencias a Odoo. Ninguna es llave foránea ────────────────
  -- Regla 3 del esquema: el día que un dominio salga de Odoo, esto no queda
  -- huérfano. Y `cuenta_id` puede ser NULL un instante: el renglón se crea
  -- antes de que exista la cuenta, y se completa con el read-back.
  odoo_empleado_id integer,                 -- hr.employee, sólo internos
  odoo_cuenta_id   integer,                 -- account.analytic.account, plan 20
  odoo_plan_id     integer NOT NULL DEFAULT 20,

  -- La empresa que paga (1 = SERVICIOS FTS, 6 = la LLC). Importa porque las
  -- cuentas del plan 20 tienen company_id y una cuenta de la LLC no sirve para
  -- una orden de México.
  odoo_company_id  integer,

  -- El cliente por el que existe, cuando es un contacto del lado del cliente.
  -- Referencia, no llave: sirve para proponer candidatos y para auditar.
  odoo_partner_id  integer,

  -- ── El estado, que es lo que decide si bloquea ──────────────────────────
  --   'pendiente'  → creado, cuenta pre-creada, SIN autorizar. Deja capturar,
  --                  bloquea confirmar.
  --   'vigente'    → autorizado. No bloquea nada.
  --   'rechazado'  → alguien dijo que no. No se ofrece, y se dice por qué.
  --   'archivado'  → la persona salió. NO se borra: lo devengado y no pagado se
  --                  sigue viendo (respuesta 9 de Esteban).
  estado        text        NOT NULL DEFAULT 'pendiente',

  -- Por qué le toca. Va aquí y no en la solicitud porque es del beneficiario,
  -- y quien aprueba lo lee para decidir.
  motivo        text,

  creado_at     timestamptz NOT NULL DEFAULT now(),
  creado_por    text        NOT NULL,
  -- Quién lo autorizó y cuándo. NULL mientras esté pendiente; y se conservan al
  -- archivar, porque «quién dijo que sí» no deja de ser cierto después.
  aprobado_at   timestamptz,
  aprobado_por  text,
  archivado_at  timestamptz,
  archivado_por text,
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT comision_ben_tipo_ck   CHECK (tipo IN ('interno','externo')),
  CONSTRAINT comision_ben_estado_ck CHECK (estado IN ('pendiente','vigente','rechazado','archivado')),
  -- Un interno SIN empleado de Odoo no es un interno: es un nombre. El CHECK lo
  -- exige aquí y no en el código para que no dependa de qué workflow escribió.
  CONSTRAINT comision_ben_interno_ck CHECK (tipo <> 'interno' OR odoo_empleado_id IS NOT NULL),
  -- Vigente sin cuenta sería un beneficiario aprobado al que no se le puede
  -- pagar: aprobado y sin dónde cargarlo.
  CONSTRAINT comision_ben_vigente_ck CHECK (estado <> 'vigente' OR odoo_cuenta_id IS NOT NULL)
);

COMMENT ON TABLE comercial.comision_beneficiario IS
  'A quien le toca una comision, con ID: apunta a la cuenta del plan 20 de Odoo y, si es interno, al hr.employee. Existe porque las 32 cuentas del plan 20 tienen code y partner_id vacios y no hay llave por la que casar un nombre con una cuenta.';
COMMENT ON COLUMN comercial.comision_beneficiario.estado IS
  'pendiente bloquea CONFIRMAR la orden, nunca capturar. archivado conserva todo: lo devengado y no pagado se sigue viendo.';

-- Una sola cuenta por beneficiario vivo. Los archivados quedan fuera del
-- indice a proposito: si mañana vuelve la misma persona, se le puede crear
-- otro renglon sin chocar con su historia.
CREATE UNIQUE INDEX IF NOT EXISTS comision_ben_cuenta_uq
  ON comercial.comision_beneficiario (odoo_cuenta_id)
  WHERE odoo_cuenta_id IS NOT NULL AND estado <> 'archivado';

-- Y un solo renglon vivo por empleado: dos cuentas de comision para la misma
-- persona es como se parte un pago en dos sin que nadie lo decida.
CREATE UNIQUE INDEX IF NOT EXISTS comision_ben_empleado_uq
  ON comercial.comision_beneficiario (odoo_empleado_id)
  WHERE odoo_empleado_id IS NOT NULL AND estado <> 'archivado';

CREATE INDEX IF NOT EXISTS comision_ben_estado_ix
  ON comercial.comision_beneficiario (estado, creado_at DESC);

DROP TRIGGER IF EXISTS comision_ben_touch ON comercial.comision_beneficiario;
CREATE TRIGGER comision_ben_touch BEFORE UPDATE ON comercial.comision_beneficiario
  FOR EACH ROW EXECUTE FUNCTION comercial.touch_updated_at();


-- ══ 2 · La solicitud de aprobación ═════════════════════════════════════════
CREATE TABLE IF NOT EXISTS comercial.comision_aprobacion (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiario_id uuid       NOT NULL REFERENCES comercial.comision_beneficiario(id),

  -- ── EL TOKEN NO SE GUARDA ───────────────────────────────────────────────
  -- Sólo su huella. Si esta base se filtra, lo que se filtra no aprueba nada:
  -- de un sha256 no se saca el token. Es la misma razón por la que una
  -- contraseña se guarda hasheada, aplicada a una liga.
  --
  -- La liga en sí va FIRMADA (HMAC con un secreto que vive en n8n y no aquí),
  -- así que hay dos candados independientes: la firma prueba que la liga la
  -- emitimos nosotros, y la huella prueba que es LA liga de esta solicitud y
  -- que no se ha usado.
  token_sha256   text        NOT NULL,

  -- A quién se le pidió. Se guarda el correo porque «a quién le pedí» tiene que
  -- ser comprobable después aunque la configuración cambie.
  pedido_a       text        NOT NULL,
  pedido_at      timestamptz NOT NULL DEFAULT now(),
  pedido_por     text        NOT NULL,
  -- Cuándo deja de servir. 72 horas por omisión: una liga que aprueba algo no
  -- puede vivir para siempre en una bandeja de correo.
  vence_at       timestamptz NOT NULL,

  --   'viva'      → mandada, sin contestar y sin vencer
  --   'aprobada'  → contestada que sí
  --   'rechazada' → contestada que no, con motivo
  --   'vencida'   → se le pasó el tiempo. NO es un rechazo: nadie dijo que no.
  --   'anulada'   → se mandó otra y ésta dejó de servir
  estado         text        NOT NULL DEFAULT 'viva',

  -- La huella de quien abrió la liga. No es seguridad —una liga reenviada la
  -- abre quien la reciba, y eso no lo arregla la criptografía— pero deja
  -- rastro, que es lo que permite auditar un «yo no aprobé eso».
  respondido_at  timestamptz,
  respondido_ip  text,
  respondido_ua  text,
  motivo_rechazo text,

  -- Cuántos recordatorios se mandaron. Un aviso que nadie puede atender es peor
  -- que ninguno, y diez avisos idénticos se convierten en filtro de correo.
  recordatorios  integer     NOT NULL DEFAULT 0,
  ultimo_aviso_at timestamptz,

  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT comision_apr_estado_ck CHECK (estado IN ('viva','aprobada','rechazada','vencida','anulada')),
  CONSTRAINT comision_apr_vence_ck  CHECK (vence_at > pedido_at),
  -- Un rechazo sin motivo es un «no» que nadie puede atender.
  CONSTRAINT comision_apr_motivo_ck CHECK (estado <> 'rechazada' OR motivo_rechazo IS NOT NULL)
);

COMMENT ON TABLE comercial.comision_aprobacion IS
  'La solicitud de autorizacion de un beneficiario de comision. La liga aprueba un RENGLON DE CATALOGO, no un pago: ningun peso se mueve sin un acto humano posterior y separado. Del token solo se guarda el sha256.';

-- UNA sola solicitud viva por beneficiario. Es el candado que evita que dos
-- correos con dos ligas distintas aprueben lo mismo dos veces; mandar otra
-- exige anular la anterior, y eso queda escrito.
CREATE UNIQUE INDEX IF NOT EXISTS comision_apr_viva_uq
  ON comercial.comision_aprobacion (beneficiario_id)
  WHERE estado = 'viva';

-- Por donde se busca al responder la liga: llega la huella del token y hay que
-- encontrar su solicitud en una lectura.
CREATE UNIQUE INDEX IF NOT EXISTS comision_apr_token_uq
  ON comercial.comision_aprobacion (token_sha256);

CREATE INDEX IF NOT EXISTS comision_apr_vence_ix
  ON comercial.comision_aprobacion (vence_at)
  WHERE estado = 'viva';

DROP TRIGGER IF EXISTS comision_apr_touch ON comercial.comision_aprobacion;
CREATE TRIGGER comision_apr_touch BEFORE UPDATE ON comercial.comision_aprobacion
  FOR EACH ROW EXECUTE FUNCTION comercial.touch_updated_at();


-- ══ 3 · Permisos ═══════════════════════════════════════════════════════════
-- Sin DELETE, como en todo este esquema: aqui no se borra. Un beneficiario que
-- salio se ARCHIVA, y una solicitud vencida se marca vencida.
GRANT SELECT, INSERT, UPDATE ON comercial.comision_beneficiario TO comercial_app;
GRANT SELECT, INSERT, UPDATE ON comercial.comision_aprobacion   TO comercial_app;
