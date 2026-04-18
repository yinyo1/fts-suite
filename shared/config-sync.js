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
    collectOpsKeys(){
      const config = {};
      const EXCLUDE = new Set([
        'ops_sync_password',  // password local, no se cifra a sí mismo
        'ops_last_sync',      // timestamp local
        'fts_session',        // sesión activa (auth-suite)
        'fts_master_hash'     // hash temporal del primer login master
      ]);
      for(let i = 0; i < localStorage.length; i++){
        const key = localStorage.key(i);
        if(!key) continue;
        if(EXCLUDE.has(key)) continue;
        const isOps = key.indexOf('ops_') === 0;
        const isKey = key.indexOf('key_') === 0;
        const isFts = key.indexOf('fts_') === 0;
        if(isOps || isKey || isFts){
          config[key] = localStorage.getItem(key);
        }
      }
      return config;
    },

    // Guardar toda la config cifrada en GitHub
    async save(token, password){
      const config = this.collectOpsKeys();
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
