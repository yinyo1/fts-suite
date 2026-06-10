// ═══ FTS Suite · Finanzas — estado de UI (FinState) ═══
// Modo por módulo (empty/demo/real) + selección de companies, con pub/sub.
// El modo vive en localStorage['fts_fin_mode_<id>'] (patrón Paso 1).
// Las companies seleccionadas en localStorage['fts_fin_companies'] (default [1,6]).
//
// API: window.FinState.{ getMode, setMode, getCompanies, setCompanies, subscribe, DEFAULT_COMPANIES }

(function () {
  'use strict';

  var COMPANIES_KEY = 'fts_fin_companies';
  var MODE_PREFIX   = 'fts_fin_mode_';
  var DEFAULT_COMPANIES = [1, 6];          // {1 FTS MX, 6 FTS USA} — scope cerrado (decisión Paso 3 #3)
  var VALID = { 1: true, 6: true };
  var subs = [];

  function getMode(id) {
    var v = localStorage.getItem(MODE_PREFIX + id);
    return (v === 'demo' || v === 'real') ? v : 'empty';
  }

  function setMode(id, mode) {
    if (mode !== 'empty' && mode !== 'demo' && mode !== 'real') return;
    localStorage.setItem(MODE_PREFIX + id, mode);
    emit({ type: 'mode', id: id, mode: mode });
  }

  function getCompanies() {
    try {
      var raw = localStorage.getItem(COMPANIES_KEY);
      if (!raw) return DEFAULT_COMPANIES.slice();
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return DEFAULT_COMPANIES.slice();
      var clean = arr.filter(function (x) { return VALID[x]; });
      return clean.length ? clean : DEFAULT_COMPANIES.slice();   // nunca vacío (decisión F9)
    } catch (e) { return DEFAULT_COMPANIES.slice(); }
  }

  function setCompanies(arr) {
    var clean = (Array.isArray(arr) ? arr : []).filter(function (x) { return VALID[x]; });
    if (clean.length === 0) clean = DEFAULT_COMPANIES.slice();   // nunca vacío (decisión F9)
    localStorage.setItem(COMPANIES_KEY, JSON.stringify(clean));
    emit({ type: 'companies', companies: clean.slice() });
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    subs.push(fn);
    return function () { subs = subs.filter(function (f) { return f !== fn; }); };
  }

  function emit(evt) {
    subs.forEach(function (f) { try { f(evt); } catch (e) { /* aislar suscriptores */ } });
  }

  window.FinState = {
    getMode: getMode,
    setMode: setMode,
    getCompanies: getCompanies,
    setCompanies: setCompanies,
    subscribe: subscribe,
    DEFAULT_COMPANIES: DEFAULT_COMPANIES
  };
})();
