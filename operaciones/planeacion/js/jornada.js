// Build: 20260428-planeacion-f2-empleados-v2
'use strict';

window.PLANEACION_JORNADA = {
  HORAS_NETAS_OBJETIVO: 9.6,
  COMIDA_HORAS:         0.5,

  fmtAMPM(time24){
    if (!time24) return '';
    const parts = time24.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return time24;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + String(m).padStart(2, '0') + ' ' + ampm;
  },

  calcularNeta(entrada, salida){
    if (!entrada || !salida) return 0;
    const e = entrada.split(':').map(Number);
    const s = salida.split(':').map(Number);
    let mins = (s[0] * 60 + s[1]) - (e[0] * 60 + e[1]);
    if (mins < 0) mins += 24 * 60; // turno cruza medianoche
    const horasBrutas = mins / 60;
    return Math.round((horasBrutas - this.COMIDA_HORAS) * 100) / 100;
  },

  sugerirSalida(entrada){
    if (!entrada) return '';
    const e = entrada.split(':').map(Number);
    const totalMins = e[0] * 60 + e[1] +
                      Math.round(this.HORAS_NETAS_OBJETIVO * 60) +
                      Math.round(this.COMIDA_HORAS * 60);
    const sh = Math.floor((totalMins / 60) % 24);
    const sm = totalMins % 60;
    return String(sh).padStart(2, '0') + ':' + String(sm).padStart(2, '0');
  },

  validar(entrada, salida){
    const horas     = this.calcularNeta(entrada, salida);
    const objetivo  = this.HORAS_NETAS_OBJETIVO;

    if (Math.abs(horas - objetivo) < 0.05){
      return {
        ok: true, tipo: 'correcta', horas,
        mensaje: '✓ Jornada: ' + horas.toFixed(1) + 'h netas (con 0.5h comida) — correcta'
      };
    }
    if (horas < objetivo){
      const falta    = (objetivo - horas).toFixed(1);
      const sugerida = this.sugerirSalida(entrada);
      return {
        ok: false, tipo: 'corta', horas, falta, sugerida,
        mensaje: '⚠️ Solo ' + horas.toFixed(1) + 'h netas (faltan ' + falta + 'h). Salida sugerida: <strong>' + this.fmtAMPM(sugerida) + '</strong> (' + sugerida + ')'
      };
    }
    const extra = (horas - objetivo).toFixed(1);
    return {
      ok: true, tipo: 'extra', horas, extra,
      mensaje: 'ℹ️ ' + horas.toFixed(1) + 'h netas — incluye <strong>+' + extra + 'h HE</strong>. Marca HE = ' + extra + ' ↓'
    };
  }
};
