// ═══ FTS Análisis Estructural — Controlador principal ═══
// ES Module — imports de submódulos

import { TYPES, MATS, PERFS, D, currentStep, rawParsedData, rawUploadedFiles } from './data.js';
import { esc, sel, inp, tog, field, hintBox, notes } from './utils.js';
import { getSteps, render, selectType, goStep, nextStep, prevStep, upd, toggl, copyJson, dlJson, toggleJson, renderTipo, renderProyecto, renderEstructura, renderCargas, getCleanData } from './wizard.js';
import { getKey, checkApiKey, toggleKeyVis, testApiKey, streamFromClaude, getSystemPrompt, getModel, getMaxTokens, getTemp, resetSystemPrompt, toggleConfig, logError, statusLog, updateTokenStats } from './api.js';
import { startRaw, processRaw, handleRawFiles, removeRawFile, updateRawCounter, showResults, applyRawToWizard, applyRawAndAnalyze, copyResJson, downloadResJson, toggleResJson } from './raw.js';
import { goToAnalysis, generateAnalysis, sendChat, regenerateAnalysis } from './analysis.js';

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
    if(el) el.value = saved;
    checkApiKey();
  }
  // Cargar system prompt
  const sysp = localStorage.getItem('fts_system_prompt');
  if(sysp){
    const el = document.getElementById('cfgSystemPrompt');
    if(el) el.value = sysp;
  }
});

// ═══ Exponer al window para onclick handlers en HTML ═══
window.showScreen = showScreen;
window.goMode = goMode;
window.startRaw = startRaw;
window.startGuided = startGuided;
window.selectType = selectType;
window.goStep = goStep;
window.nextStep = nextStep;
window.prevStep = prevStep;
window.upd = upd;
window.toggl = toggl;
window.render = render;
window.copyJson = copyJson;
window.dlJson = dlJson;
window.toggleJson = toggleJson;
window.checkApiKey = checkApiKey;
window.toggleKeyVis = toggleKeyVis;
window.testApiKey = testApiKey;
window.toggleConfig = toggleConfig;
window.resetSystemPrompt = resetSystemPrompt;
window.processRaw = processRaw;
window.handleRawFiles = handleRawFiles;
window.removeRawFile = removeRawFile;
window.updateRawCounter = updateRawCounter;
window.showResults = showResults;
window.applyRawToWizard = applyRawToWizard;
window.applyRawAndAnalyze = applyRawAndAnalyze;
window.copyResJson = copyResJson;
window.downloadResJson = downloadResJson;
window.toggleResJson = toggleResJson;
window.goToAnalysis = goToAnalysis;
window.generateAnalysis = generateAnalysis;
window.sendChat = sendChat;
window.regenerateAnalysis = regenerateAnalysis;
window.getKey = getKey;
window.getCleanData = getCleanData;
window.getSystemPrompt = getSystemPrompt;
window.getModel = getModel;
window.getMaxTokens = getMaxTokens;
window.getTemp = getTemp;
window.logError = logError;
window.statusLog = statusLog;
window.updateTokenStats = updateTokenStats;
