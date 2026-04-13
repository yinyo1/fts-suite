// ═══ FTS Análisis Estructural — Controlador principal ═══
// Script clásico — todas las variables son globales (compatibilidad con HTML original)

// ═══ Navegación entre pantallas ═══
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function goMode(){ showScreen('scr-mode'); }
function startGuided(){ showScreen('scr-wizard'); render(); }

// ═══ Init ═══
window.addEventListener('DOMContentLoaded', function(){
  // Cargar API key de localStorage
  const saved = localStorage.getItem('fts_api_key');
  if(saved){
    const el = document.getElementById('apiKey');
    if(el){ el.value = saved; checkApiKey(); }
  }
  // Cargar system prompt
  const sysp = localStorage.getItem('fts_system_prompt');
  if(sysp){
    const el = document.getElementById('cfgSystemPrompt');
    if(el) el.value = sysp;
  }
});

// ═══ Guías WhatsApp ═══
function copyGuide() {
  const type = document.getElementById('guideType').value;
  if (!type || !window.GUIDES || !window.GUIDES[type]) return;
  const text = window.GUIDES[type];
  navigator.clipboard.writeText(text)
    .then(() => showCopied())
    .catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showCopied();
    });
}

function showCopied() {
  const el = document.getElementById('guideCopied');
  const btn = document.getElementById('btnCopyGuide');
  if (el) {
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 3000);
  }
  if (btn) {
    btn.textContent = '✅ ¡Copiado!';
    btn.style.background = '#107C10';
    setTimeout(() => {
      btn.textContent = '📋 Copiar guía para WhatsApp';
      btn.style.background = '#0078D4';
    }, 3000);
  }
}

window.copyGuide = copyGuide;

// Habilitar botón al seleccionar tipo
document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('guideType');
  const btn = document.getElementById('btnCopyGuide');
  if (sel && btn) {
    sel.addEventListener('change', () => {
      btn.disabled = !sel.value;
      btn.style.opacity = sel.value ? '1' : '0.5';
      btn.style.cursor = sel.value ? 'pointer' : 'default';
    });
  }
});
