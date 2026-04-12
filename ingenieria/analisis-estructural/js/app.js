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
