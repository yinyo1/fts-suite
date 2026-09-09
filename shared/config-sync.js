// ═══ FTS Suite — Config Sync (AES-256 + GitHub API) ═══
// Cifra/descifra la configuración ops_* y la sincroniza en
// un archivo JSON dentro del repo `yinyo1/fts-suite`.
// Uso: window.ConfigSync.save(token, password) / .load(password, token)

(function(){
  'use strict';

  const CONFIG_REPO = 'yinyo1/fts-suite';
  const CONFIG_FILE = 'shared/ops-config.json';
  const CONFIG_RAW  = 'https://raw.githubusercontent.com/' + CONFIG_REPO + '/main/' + CONFIG_FILE;

  // ─── CIFRADO AES-256-GCM con Web Crypto API ───

  async function deriveKey(password, salt){
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(password),
      { name:'PBKDF2' }, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name:'PBKDF2', salt, iterations:100000, hash:'SHA-256' },
      keyMaterial,
      { name:'AES-GCM', length:256 },
      false, ['encrypt','decrypt']
    );
  }

  async function encryptConfig(data, password){
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await deriveKey(password, salt);
    const enc  = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
      { name:'AES-GCM', iv },
      key,
      enc.encode(JSON.stringify(data))
    );
    // Empaquetar salt + iv + datos cifrados en base64
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, 16);
    combined.set(new Uint8Array(encrypted), 28);
    // btoa de binario
    let binStr = '';
    for(let i = 0; i < combined.length; i++) binStr += String.fromCharCode(combined[i]);
    return btoa(binStr);
  }

  async function decryptConfig(b64, password){
    const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const salt = combined.slice(0, 16);
    const iv   = combined.slice(16, 28);
    const data = combined.slice(28);
    const key  = await deriveKey(password, salt);
    const dec  = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, data);
    return JSON.parse(new TextDecoder().decode(dec));
  }

  // ─── GITHUB API ───

  async function githubGetFile(token){
    const res = await fetch(
      'https://api.github.com/repos/' + CONFIG_REPO + '/contents/' + CONFIG_FILE,
      { headers: {
          'Authorization': 'token ' + token,
          'Accept':        'application/vnd.github.v3+json'
      }}
    );
    if(res.status === 404) return null;
    if(!res.ok) throw new Error('GitHub error ' + res.status);
    return res.json();
  }

  async function githubSaveFile(token, content, sha){
    const body = {
      message: 'Config update desde FTS Suite',
      content: btoa(unescape(encodeURIComponent(content))),
      branch:  'main'
    };
    if(sha) body.sha = sha;
    const res = await fetch(
      'https://api.github.com/repos/' + CONFIG_REPO + '/contents/' + CONFIG_FILE,
      { method: 'PUT',
        headers: {
          'Authorization': 'token ' + token,
          'Accept':        'application/vnd.github.v3+json',
          'Content-Type':  'application/json'
        },
        body: JSON.stringify(body)
      }
    );
    if(!res.ok){
      let err;
      try{ err = await res.json(); } catch(e){ err = {}; }
      throw new Error(err.message || 'GitHub save error ' + res.status);
    }
    return res.json();
  }

  // ─── API PÚBLICA ───

  const ConfigSync = {

    // Recolecta todas las keys ops_*, key_* y fts_* del localStorage
    // Excluye keys de auth/sesión locales que NO deben subirse a GitHub
    /* ── LISTA BLANCA. Antes era lista negra, y por eso había que cambiarla.
     *
     * Hasta el 9-sep-2026 esto barría TODA llave `ops_*`, `key_*` y `fts_*` y
     * excluía cuatro. El archivo que produce, `shared/ops-config.json`, está
     * COMMITEADO en un repo PÚBLICO. O sea: cada llave nueva que estrenara
     * cualquier módulo del Suite entraba sola, cifrada, al repo público — sin
     * que nadie lo decidiera.
     *
     * Y ya había pasado: `fts_machote_v1` (las cotizaciones del equipo, con
     * costos y comisiones), `fts_suite_session` (el JWT), `fts_fin_session`,
     * `fts_mi_perfil_session`, `fts_comercial_hmac` y `fts_employees` NO
     * estaban excluidas. Nada se filtró todavía —el blob es del 18-abr-2026 y
     * el machote no existía hasta el 3-sep— pero la siguiente sincronización
     * se lo llevaba.
     *
     * El cifrado es honesto (AES-256-GCM + PBKDF2-SHA256 100k). El problema no
     * era el cifrado: era el ALCANCE. Una contraseña elegida por una persona
     * protegiendo, en un archivo público y PARA SIEMPRE, la captura comercial
     * de tres personas.
     *
     * Con lista blanca el modo de fallo se invierte, que es lo único que
     * importa: olvidar una llave de configuración cuesta volver a teclearla en
     * el otro dispositivo; olvidar una de datos costaba publicarla. Se rompe
     * hacia el lado soportable (CLAUDE.md §9).
     *
     * PARA AGREGAR UNA LLAVE: métela abajo, en su grupo, y sólo si es
     * CONFIGURACIÓN del panel de operaciones. Nunca datos de trabajo, ni
     * sesiones, ni PINes de personas, ni nada que identifique a alguien.
     * `sinSincronizar()` te dice qué se está quedando fuera. */
    PERMITIDAS: [
      // Dónde vive el backend
      'ops_n8n_url', 'ops_odoo_url', 'ops_odoo_db', 'ops_demo_mode', 'ops_migrated',
      // Kiosko: geocercas y ajustes de la pantalla
      'ops_kiosk_geolocations', 'ops_geo_sync_timestamp', 'ops_kiosk_stages',
      'ops_kiosk_company_id', 'ops_kiosk_face_enabled', 'ops_kiosk_face_required',
      'ops_kiosk_face_threshold', 'ops_kiosk_face_models_url', 'ops_kiosk_field_photo',
      'ops_kiosk_notify_email', 'ops_kiosk_notify_email_fallback',
      'ops_kiosk_notify_wa', 'ops_kiosk_notify_wa_webhook',
      // Tablero y planeación: umbrales y horarios
      'ops_dash_refresh', 'ops_dash_alerta_sin_checar', 'ops_dash_alerta_fuera_zona',
      'ops_dash_alerta_extra', 'ops_plan_hora_entrada', 'ops_plan_hora_salida',
      'ops_plan_hora_limite', 'ops_plan_recordatorio', 'ops_plan_wa_webhook',
      // Llaves de API que este panel administra a propósito
      'key_claude', 'key_groq', 'key_openrouter', 'key_gemini',
      'key_github_token', 'key_odoo_api', 'ops_github_token'
    ],

    /* Lo que HAY en este navegador y NO se sincroniza. No es un aviso de
     * error: es la lista de lo que se queda aquí a propósito. Se enseña al
     * guardar para que el cambio no sea invisible — una lista blanca que
     * silenciosamente deja de llevar algo es igual de mala que la negra. */
    sinSincronizar(){
      const fuera = [];
      const ok = new Set(this.PERMITIDAS);
      for(let i = 0; i < localStorage.length; i++){
        const key = localStorage.key(i);
        if(!key) continue;
        if(ok.has(key)) continue;
        if(key.indexOf('ops_') === 0 || key.indexOf('key_') === 0 || key.indexOf('fts_') === 0){
          fuera.push(key);
        }
      }
      return fuera.sort();
    },

    collectOpsKeys(){
      const config = {};
      /* Nada de recorrer `localStorage`: se pide EXACTAMENTE lo permitido. Es
       * la diferencia entre «todo menos esto» y «sólo esto», y es toda la
       * corrección. */
      for(const key of this.PERMITIDAS){
        const v = localStorage.getItem(key);
        if(v !== null) config[key] = v;
      }
      return config;
    },

    // Guardar toda la config cifrada en GitHub
    async save(token, password){
      const config = this.collectOpsKeys();
      /* Lo que se queda fuera se DICE, no se calla. Una lista blanca que deja
       * de llevar algo en silencio es tan mala como la lista negra que se
       * llevaba de más: en los dos casos nadie se entera. */
      const fuera = this.sinSincronizar();
      if(fuera.length){
        try{ console.info('[config-sync] NO se sincronizan ' + fuera.length +
          ' llave(s), se quedan en este navegador: ' + fuera.join(', ')); }catch(e){}
      }
      // Incluir el token cifrado para poder recuperarlo en otros dispositivos
      config['_github_token'] = token;

      const encrypted = await encryptConfig(config, password);
      const existing = await githubGetFile(token);
      const sha = (existing && existing.sha) || null;

      const fileContent = JSON.stringify({
        v:       1,
        updated: new Date().toISOString(),
        data:    encrypted
      }, null, 2);

      await githubSaveFile(token, fileContent, sha);

      // Persistir localmente el token, password y timestamp
      localStorage.setItem('ops_github_token',  token);
      localStorage.setItem('ops_sync_password', password);
      localStorage.setItem('ops_last_sync',     new Date().toISOString());

      return true;
    },

    // Cargar config desde GitHub y aplicar al localStorage
    async load(password, token){
      const t = token || localStorage.getItem('ops_github_token');

      // Primero intentar raw (sin auth, más rápido y sin rate-limit)
      let fileData = null;
      try{
        const res = await fetch(CONFIG_RAW + '?_=' + Date.now(), { cache:'no-store' });
        if(res.ok) fileData = await res.json();
      } catch(e){}

      // Fallback al endpoint autenticado si raw no funcionó
      if(!fileData){
        if(!t) throw new Error('Sin token de GitHub');
        const gh = await githubGetFile(t);
        if(!gh) throw new Error('No hay config guardada en GitHub');
        // gh.content viene en base64 con saltos de línea
        const cleanB64 = (gh.content || '').replace(/\n/g, '');
        fileData = JSON.parse(atob(cleanB64));
      }

      if(!fileData || !fileData.data) throw new Error('Archivo de config vacío');

      const config = await decryptConfig(fileData.data, password);

      // Aplicar al localStorage (excepto _github_token que se guarda aparte)
      Object.keys(config).forEach(function(key){
        if(key !== '_github_token'){
          localStorage.setItem(key, config[key]);
        }
      });

      // Guardar token recuperado si venía en el payload
      if(config._github_token){
        localStorage.setItem('ops_github_token', config._github_token);
      }

      // Dual-write para keys críticas (sin prefijo ops_)
      if(config['ops_n8n_url'])  localStorage.setItem('n8n_url',  config['ops_n8n_url']);
      if(config['ops_odoo_url']) localStorage.setItem('odoo_url', config['ops_odoo_url']);
      if(config['ops_demo_mode'] !== undefined) localStorage.setItem('demo_mode', config['ops_demo_mode'] === '1' ? 'true' : 'false');
      if(config['ops_github_token']) localStorage.setItem('key_github_token', config['ops_github_token']);
      if(config._github_token)       localStorage.setItem('key_github_token', config._github_token);
      if(config['key_claude'])       localStorage.setItem('key_claude', config['key_claude']);
      if(config['key_groq'])         localStorage.setItem('key_groq', config['key_groq']);
      if(config['key_openrouter'])   localStorage.setItem('key_openrouter', config['key_openrouter']);
      if(config['key_gemini'])       localStorage.setItem('key_gemini', config['key_gemini']);

      localStorage.setItem('ops_sync_password', password);
      localStorage.setItem('ops_last_sync',     new Date().toISOString());

      return config;
    },

    // Verificar si hay config guardada (sin descifrar)
    async check(){
      try{
        const res = await fetch(CONFIG_RAW + '?_=' + Date.now(), { cache:'no-store' });
        if(!res.ok) return false;
        const data = await res.json();
        return !!(data && data.data);
      } catch(e){
        return false;
      }
    },

    getLastSync(){
      return localStorage.getItem('ops_last_sync');
    },

    hasToken(){
      return !!localStorage.getItem('ops_github_token');
    }
  };

  window.ConfigSync = ConfigSync;
})();
