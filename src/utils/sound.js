// src/utils/sound.js
let ctx;
let masterGain;
let unlocked = false;

// Canales para cortar/evitar superposiciones por tipo
const channels = {
  success: [],
  warning: [],
  error: [],
};

// ==== AudioContext + Master Gain ====
function ensureContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.9; // volumen general (0..1)
    masterGain.connect(ctx.destination);
  }
  return ctx;
}

/** Llama esto apenas inicie tu app (o importalo desde el modal al abrir)
 *  para “desbloquear” el audio en el primer gesto del usuario.
 */
export function unlockAudio() {
  if (unlocked) return;
  const a = ensureContext();

  const resume = async () => {
    try {
      if (a.state === "suspended") await a.resume();
      unlocked = true;
      removeListeners();
    } catch {}
  };

  const removeListeners = () => {
    window.removeEventListener("pointerdown", resume);
    window.removeEventListener("keydown", resume);
    window.removeEventListener("touchstart", resume, { passive: true });
  };

  window.addEventListener("pointerdown", resume, { once: true });
  window.addEventListener("keydown", resume, { once: true });
  window.addEventListener("touchstart", resume, { once: true, passive: true });
}

/** Control de volumen global */
export function setVolume(v = 0.9) {
  ensureContext();
  masterGain.gain.value = Math.max(0, Math.min(1, Number(v)));
}
export function mute()  { setVolume(0); }
export function unmute(){ if (masterGain.gain.value === 0) setVolume(0.9); }

// ==== Helpers de sonido ====

/** Crea una nota con envolvente para evitar “clicks” */
function note({ startTime, freq = 880, duration = 0.12, type = "sine", gain = 0.08 }) {
  const a = ensureContext();
  const osc = a.createOscillator();
  const g   = a.createGain();

  // Envolvente: pequeño fade-in/out
  const attack = 0.008;
  const release = 0.04;

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  g.gain.setValueAtTime(0, startTime);
  g.gain.linearRampToValueAtTime(gain, startTime + attack);
  g.gain.setValueAtTime(gain, startTime + duration - release);
  g.gain.linearRampToValueAtTime(0, startTime + duration);

  osc.connect(g);
  g.connect(masterGain);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.001);

  return osc;
}

/** Ejecuta una secuencia de notas; si `channel` está definido, corta la anterior */
function playSeq(steps, { channel } = {}) {
  const a = ensureContext();
  if (!unlocked && a.state === "suspended") {
    // el navegador aún no “desbloqueó” el audio; intentar resume
    a.resume().catch(() => {});
  }

  // Si hay canal, cancelar osciladores anteriores
  if (channel && channels[channel]) {
    channels[channel].forEach((o) => {
      try { o.stop(); } catch {}
    });
    channels[channel] = [];
  }

  let t = a.currentTime;
  const local = [];
  for (const s of steps) {
    const dur   = ((s.duration ?? 120) / 1000);
    const pause = ((s.pause    ?? 40)  / 1000);
    const osc = note({
      startTime: t,
      freq: s.freq ?? 880,
      duration: dur,
      type: s.type || "sine",
      gain: s.gain ?? 0.07,
    });
    local.push(osc);
    t += dur + pause;
  }

  if (channel && channels[channel]) {
    channels[channel].push(...local);
    // limpieza automática al terminar
    setTimeout(() => {
      channels[channel] = channels[channel].filter(o => {
        try { return o.context && o.context.state !== "closed"; }
        catch { return false; }
      });
    }, Math.ceil((t - a.currentTime) * 1000) + 50);
  }
}

// ==== Presets (ajusté leves para que suenen más “limpios”) ====

// Cortos
export function playSuccess() {
  playSeq([
    { freq: 740, duration: 90, gain: .075 },
    { freq: 880, duration: 120, gain: .085, pause: 50 },
  ], { channel: "success" });
}

export function playWarning() {
  playSeq([
    { freq: 600, duration: 110, type: "triangle", gain: .075 },
    { freq: 600, duration: 110, type: "triangle", gain: .075, pause: 70 },
  ], { channel: "warning" });
}

export function playError() {
  playSeq([
    { freq: 460, duration: 160, type: "square", gain: .07 },
    { freq: 360, duration: 180, type: "square", gain: .07, pause: 40 },
  ], { channel: "error" });
}

// Largos
export function playSuccessLong() {
  playSeq([
    { freq: 660, duration: 140, gain: .075 },
    { freq: 880, duration: 180, gain: .085, pause: 60 },
    { freq: 990, duration: 200, gain: .085 },
  ], { channel: "success" });
}

export function playWarningLong() {
  playSeq([
    { freq: 520, duration: 240, type: "triangle", gain: .075 },
    { freq: 520, duration: 240, type: "triangle", gain: .075, pause: 110 },
    { freq: 520, duration: 240, type: "triangle", gain: .075 },
  ], { channel: "warning" });
}

export function playErrorLong() {
  playSeq([
    { freq: 440, duration: 240, type: "square", gain: .075 },
    { freq: 380, duration: 280, type: "square", gain: .075, pause: 90 },
    { freq: 300, duration: 320, type: "square", gain: .075 },
  ], { channel: "error" });
}

// Util genérico por tipo
export function playForType(type, { long = false } = {}) {
  if (type === "green") return long ? playSuccessLong() : playSuccess();
  if (type === "yellow") return long ? playWarningLong() : playWarning();
  return long ? playErrorLong() : playError();
}
