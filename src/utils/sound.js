// src/utils/sound.js
let _ctx = null;

function getCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _ctx;
}

function envGain(ctx, duration = 0.25, attack = 0.01, release = 0.12) {
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.9, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  return gain;
}

function playSequence(steps = [], { gap = 0.06, startTime } = {}) {
  const ctx = getCtx();
  let t = startTime ?? ctx.currentTime;
  steps.forEach(({ freq, type = "sine", duration = 0.18, volume = 0.8 }) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;

    const gain = envGain(ctx, duration);
    const master = ctx.createGain();
    master.gain.value = volume;

    osc.connect(gain).connect(master).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
    t += duration + gap;
  });
}

/* ===== Cortos (los que ya usabas) ===== */
export function playSuccess() {
  playSequence([
    { freq: 523.25, type: "sine", duration: 0.16, volume: 0.6 }, // C5
    { freq: 659.25, type: "sine", duration: 0.16, volume: 0.6 }, // E5
    { freq: 783.99, type: "sine", duration: 0.20, volume: 0.6 }, // G5
  ]);
}
export function playWarning() {
  playSequence([
    { freq: 440.00, type: "triangle", duration: 0.14, volume: 0.55 }, // A4
    { freq: 659.25, type: "triangle", duration: 0.16, volume: 0.55 }, // E5
  ]);
}
export function playError() {
  playSequence([
    { freq: 392.00, type: "sawtooth", duration: 0.14, volume: 0.55 }, // G4
    { freq: 329.63, type: "sawtooth", duration: 0.18, volume: 0.55 }, // E4
  ], { gap: 0.08 });
}

/* ===== Largos (nuevos) ===== */

/** Éxito largo: arpegio ascendente + caída suave (agradable, “ganaste”) */
export function playSuccessLong() {
  // C mayor: C4 E4 G4  C5  E5  G5  (rápido) + cadencia G5 → C5
  const seq = [
    { freq: 261.63, type: "sine", duration: 0.13, volume: 0.55 }, // C4
    { freq: 329.63, type: "sine", duration: 0.13, volume: 0.55 }, // E4
    { freq: 392.00, type: "sine", duration: 0.13, volume: 0.55 }, // G4
    { freq: 523.25, type: "sine", duration: 0.13, volume: 0.6  }, // C5
    { freq: 659.25, type: "sine", duration: 0.13, volume: 0.6  }, // E5
    { freq: 783.99, type: "sine", duration: 0.16, volume: 0.6  }, // G5
    // cadencia
    { freq: 783.99, type: "triangle", duration: 0.18, volume: 0.55 }, // G5
    { freq: 523.25, type: "triangle", duration: 0.28, volume: 0.55 }, // C5 (resolución)
  ];
  playSequence(seq, { gap: 0.05 });
}

/** Amarillo largo: motivo “ping” con levísima tensión y release amable */
export function playWarningLong() {
  // A4 → C5 → E5 → D5 → C5 (ligera subida y baja, tono “atento”)
  const seq = [
    { freq: 440.00, type: "triangle", duration: 0.16, volume: 0.5 }, // A4
    { freq: 523.25, type: "triangle", duration: 0.14, volume: 0.5 }, // C5
    { freq: 659.25, type: "triangle", duration: 0.16, volume: 0.52 }, // E5
    { freq: 587.33, type: "triangle", duration: 0.14, volume: 0.5 }, // D5
    { freq: 523.25, type: "triangle", duration: 0.24, volume: 0.48 }, // C5
  ];
  playSequence(seq, { gap: 0.06 });
}

/** Error largo: patrón descendente con onda más áspera, pero sin ser molesto */
export function playErrorLong() {
  // G4 → F#4 → E4 → D4 → C4  (descenso claro)
  const seq = [
    { freq: 392.00, type: "sawtooth", duration: 0.16, volume: 0.5 }, // G4
    { freq: 369.99, type: "sawtooth", duration: 0.16, volume: 0.5 }, // F#4
    { freq: 329.63, type: "sawtooth", duration: 0.18, volume: 0.5 }, // E4
    { freq: 293.66, type: "sawtooth", duration: 0.20, volume: 0.48 }, // D4
    { freq: 261.63, type: "sawtooth", duration: 0.24, volume: 0.48 }, // C4
  ];
  playSequence(seq, { gap: 0.07 });
}

/** Mute global opcional */
export function setMuted(muted) {
  if (muted) {
    if (_ctx && _ctx.state !== "closed") _ctx.close().catch(() => {});
    _ctx = null;
  } else {
    getCtx();
  }
}
