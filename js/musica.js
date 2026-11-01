"use strict";

// Banda sonora original: menu, cinco tramos de oleadas y un desafio final.
// Sintesis de consola: pulsos, bajo triangular y percusion de ruido.
// No requiere descargas ni archivos externos; funciona tambien bajo file://.
var Music = (() => {
  let stepDuration = 60 / 112 / 4;
  const totalSteps = 32 * 16;
  let volume = 0.25;
  try {
    const raw = localStorage.getItem("marea-infernal-music-volume");
    if (raw !== null && Number.isFinite(Number(raw))) volume = Math.max(0, Math.min(1, Number(raw)));
  } catch (e) {}
  let channel = null, session = null, timer = null;
  let step = 0, nextTime = 0;
  let wanted = false;
  let muted = false; // silencia solo la musica (los efectos siguen); se recuerda entre partidas
  try { muted = localStorage.getItem("marea-infernal-music-muted") === "1"; } catch (e) {}
  let noiseBuffer = null;
  const voices = new Set();
  const originalRiffs = [
    [0, null, 0, 3, null, 0, null, 5, 0, null, 0, null, 6, null, 3, 1],
    [0, null, 7, null, 0, 0, null, 3, 0, null, 1, null, 5, 3, null, 0],
    [0, 0, null, 3, null, 5, 6, null, 0, null, 7, null, 3, 1, 0, null],
    [0, null, null, 0, null, null, 1, null, 0, null, null, 6, null, 1, null, null]
  ];
  const tracks = [
    { name: "Ceniza digital", bpm: 112, root: 38, groove: true, riffs: originalRiffs,
      chords: [0, -4, 3, -2], kick: [0, 6, 8, 10],
      melody: [12, null, 19, 17, null, 15, null, 14, 12, null, 10, null, 7, 10, null, 12] },
    { name: "Pulso de hierro", bpm: 140, root: 41, breakbeat: true,
      riffs: [
        [0, 0, null, 3, 0, null, 0, 6, null, 0, 3, null, 1, 0, null, 0],
        [0, null, 0, 1, null, 0, 3, null, 0, 0, 6, null, 3, null, 1, 0],
        [0, 0, 0, null, 6, null, 3, 1, 0, null, 0, 3, null, 6, 1, null],
        [0, null, null, 0, 3, null, null, 1, 0, null, 0, null, 6, null, null, null]],
      chords: [0, 3, -2, 1], kick: [0, 3, 6, 8, 11],
      melody: [7, null, 12, 15, null, 14, 12, null, 7, null, 10, 12, null, 15, 14, null] },
    { name: "Marea espectral", bpm: 84, root: 33, atmospheric: true,
      riffs: [
        [0, null, null, 7, 0, null, 3, null, 0, null, 6, 5, null, 3, null, 1],
        [0, null, 3, null, 0, 0, null, 1, null, 7, null, 6, 0, null, 3, null],
        [0, null, 7, null, 6, null, 3, 1, 0, null, 0, null, 5, null, 3, null],
        [0, null, null, null, 1, null, 0, null, 6, null, null, null, 3, null, 1, null]],
      chords: [0, 5, 3, -2], kick: [0, 5, 8, 14],
      melody: [19, null, null, 15, 14, null, 12, null, 17, null, 15, null, 12, null, 10, null] },
    { name: "Falla tectonica", bpm: 128, root: 34,
      riffs: [
        [0, 0, null, 1, 0, 0, null, 6, 0, null, 3, 0, null, 1, 0, null],
        [0, null, 6, 0, 0, null, 3, 1, 0, 0, null, 7, null, 6, 3, null],
        [0, 0, 3, null, 6, 0, null, 1, 0, null, 0, 0, 3, null, 6, 1],
        [0, null, 0, null, null, 1, 0, null, 0, null, null, 6, 0, null, null, 1]],
      chords: [0, 1, -2, 3], kick: [0, 2, 6, 8, 10, 15],
      melody: [12, 15, null, 18, 19, null, 18, 15, 12, null, 13, 12, null, 10, 7, null] },
    { name: "Antes del umbral", bpm: 136, root: 37,
      riffs: [
        [0, null, 0, 6, 0, null, 1, 0, 0, null, 7, 6, 0, 3, null, 1],
        [0, 0, 1, null, 0, 6, null, 3, 0, null, 0, 7, 6, null, 1, 0],
        [0, null, 3, 0, null, 1, 6, null, 0, 0, 7, null, 6, 3, 1, null],
        [0, null, null, 1, 0, null, 6, null, 0, 0, null, null, 7, null, 1, null]],
      chords: [0, -2, 1, -5], kick: [0, 3, 6, 8, 10, 14],
      melody: [12, null, 13, 19, null, 18, 15, null, 12, 13, null, 10, 7, null, 6, null] },
    { name: "Alarma en el bastion", bpm: 156, root: 36, tension: true,
      // Motivo cromatico original y ostinato rapido de castillo, sin citar melodias existentes.
      riffs: originalRiffs, chords: [0, 1, 0, -1], kick: [0, 3, 6, 8, 11, 14],
      melody: [0, 6, 12, 13, 7, 1, 12, 6, 0, 7, 13, 12, 6, 1, 7, 18] },
    { name: "Refugio de cenizas", bpm: 76, root: 45, chill: true,
      chords: [0, 5, 3, 7], melody: [12, null, 16, null, 19, null, 23, null, 19, null, 16, null, 14, null, 11, null] }
  ];
  let trackIndex = 0;
  let currentTrack = tracks[0];
  const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);

  function track(source, gain, time, duration) {
    source.connect(gain);
    gain.connect(session);
    voices.add(source);
    source.onended = () => { voices.delete(source); source.disconnect(); gain.disconnect(); };
    source.start(time);
    source.stop(time + duration);
  }
  function note(midi, time, duration, level, type, slide) {
    const c = channel.context;
    const osc = c.createOscillator(), gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz(midi), time);
    if (slide != null) osc.frequency.exponentialRampToValueAtTime(hz(slide), time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    track(osc, gain, time, duration);
  }
  function noise(time, duration, level, highpass) {
    const c = channel.context;
    const source = c.createBufferSource(), gain = c.createGain(), filter = c.createBiquadFilter();
    source.buffer = noiseBuffer;
    filter.type = "highpass"; filter.frequency.value = highpass;
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter); filter.connect(gain); gain.connect(session);
    voices.add(source);
    source.onended = () => { voices.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(time); source.stop(time + duration);
  }
  function schedule(index, time) {
    const bar = Math.floor(index / 16), beat = index % 16;
    const { riffs, melody } = currentTrack;
    if (currentTrack.chill) {
      const root = currentTrack.root + currentTrack.chords[Math.floor(bar / 2) % 4];
      const t = stepDuration;
      if (beat === 0) {
        [0, 7, 14, 16].forEach((interval, i) => note(root + 12 + interval, time + i * t * 0.08, t * 12, 0.025, "sine"));
        note(root - 12, time, t * 7, 0.16, "triangle");
      }
      if (beat === 8) note(root - 5, time, t * 6, 0.12, "triangle");
      if (melody[beat] !== null && bar % 4 !== 3) note(root + 12 + melody[beat], time, t * 2.5, 0.045, "sine");
      if (beat === 0 || beat === 10) note(38, time, 0.18, 0.12, "sine", 25);
      if (beat === 4 || beat === 12) noise(time, 0.08, 0.035, 2200);
      if (beat % 4 === 2) noise(time, 0.025, 0.018, 7500);
      return;
    }
    if (currentTrack.breakbeat) {
      const root = currentTrack.root + currentTrack.chords[bar % 4];
      const t = stepDuration;
      const riff = riffs[bar % 4][beat];
      // Bajo movil y plucks brillantes; la bateria lleva los cortes de semicorchea.
      if (riff !== null) {
        note(root - 12 + riff, time, t * 0.9, 0.23, "sawtooth");
        if (beat % 2 === 0) note(root + 12 + riff, time, t * 0.48, 0.075, "square");
      }
      const lead = melody[(beat + (bar % 2) * 2) % 16];
      if (lead !== null) note(root + 24 + lead, time, t * 0.8, 0.075, "square");
      if ([0, 3, 7, 8, 10].includes(beat)) note(45, time, 0.11, 0.32, "sine", 24);
      if ([4, 12].includes(beat)) { noise(time, 0.10, 0.20, 1700); note(53, time, 0.06, 0.09, "triangle", 42); }
      if (beat === 11 || (bar % 2 && beat === 15)) noise(time, 0.05, 0.075, 2400);
      noise(time, beat === 14 ? 0.09 : 0.018, beat % 2 ? 0.022 : 0.045, 7000);
      return;
    }
    if (currentTrack.atmospheric) {
      const root = currentTrack.root + currentTrack.chords[Math.floor(bar / 2) % 4];
      const t = stepDuration;
      if (beat === 0 || beat === 8) {
        note(root - 12, time, t * 5.5, 0.24, "triangle");
        [0, 7, 14].forEach((interval, i) => note(root + 12 + interval, time + i * t * 0.14, t * 7, 0.035, "sine"));
      }
      if (beat % 4 === 2) note(root + 24 + [0, 7, 10, 3][Math.floor(beat / 4)], time, t * 3, 0.07, "triangle");
      if (beat === 0 || beat === 7) note(40, time, 0.22, 0.32, "sine", 20);
      if (beat === 8) { noise(time, 0.19, 0.16, 1100); note(47, time, 0.13, 0.08, "triangle", 35); }
      if (beat % 4 === 0) noise(time, 0.05, 0.028, 6000);
      if (bar % 4 >= 2 && (beat === 0 || beat === 11)) {
        note(root, time, t * 1.6, 0.10, "sawtooth");
        note(root + 7, time, t * 1.5, 0.045, "square");
      }
      return;
    }
    if (currentTrack.tension) {
      const root = currentTrack.root + currentTrack.chords[Math.floor(bar / 2) % 4];
      const phrase = bar % 8 >= 4 ? -1 : 0;
      note(root + 24 + melody[(beat + (bar % 2) * 4) % 16] + phrase, time, stepDuration * 0.70, 0.09, "square");
      if (beat % 2 === 0) note(root - 12 + (beat % 4 === 2 ? 6 : 0), time, stepDuration * 1.5, 0.23, "triangle");
      if (beat % 4 === 0) note(root + 12 + (bar % 2 ? 1 : 0), time, stepDuration * 2.4, 0.045, "triangle");
      if (currentTrack.kick.includes(beat)) note(45, time, 0.12, 0.36, "sine", 22);
      if (beat === 4 || beat === 12 || (bar % 4 === 3 && beat >= 14)) noise(time, 0.09, 0.17, 1400);
      if (beat % 2 === 0) noise(time, 0.025, 0.06, 6500);
      return;
    }
    const intro = bar < 4;
    const chorus = (bar >= 12 && bar < 20) || bar >= 24;
    const breakdown = bar >= 20 && bar < 24;
    const root = currentTrack.root + (chorus ? currentTrack.chords[Math.floor((bar % 8) / 2)] : 0);
    const riff = riffs[breakdown ? 3 : bar % 3];
    let offset = riff[beat];
    if (intro && bar < 2 && beat % 4 !== 0) offset = null;
    if (offset !== null) {
      // Cortes breves como palm mute y quinta aguda para el peso del riff.
      const length = stepDuration * (chorus && beat % 4 === 0 ? 1.8 : 0.68);
      note(root + offset, time, length, 0.17, "square");
      note(root + offset + 7, time, length * 0.85, 0.065, "square");
      note(root + offset - 12, time, stepDuration * 0.92, 0.24, "triangle");
    }
    const kick = breakdown ? [0, 3, 8, 11] : currentTrack.kick;
    if (kick.includes(beat) || (!intro && bar % 4 === 3 && beat === 14)) {
      note(43, time, 0.16, 0.42, "sine", 21);
      noise(time, 0.018, 0.08, 1400);
    }
    if ((!intro || bar >= 2) && (beat === 4 || beat === 12)) {
      noise(time, 0.14, 0.22, 900);
      note(50, time, 0.09, 0.13, "triangle", 40);
    }
    if ((!intro || bar >= 2) && beat % 2 === 0) noise(time, beat === 14 ? 0.12 : 0.035, beat % 4 ? 0.055 : 0.08, 6500);
    if (!intro && bar % 4 === 3 && beat >= 13) noise(time, 0.07, 0.10, 1600);
    if ((chorus || (currentTrack.groove && bar >= 2 && bar % 4 < 2)) && melody[beat] !== null) {
      note(root + 24 + melody[beat], time, stepDuration * 1.6, 0.07, currentTrack.groove ? "square" : "triangle");
    }
    if (intro && beat === 0) note(root + 24 + [0, 7, 3, 1][bar], time, stepDuration * 7, 0.045, "triangle");
  }
  function tick() {
    const c = channel.context;
    if (c.state !== "running") return;
    // Tras un bloqueo del hilo, retomar sin emitir los pasos atrasados juntos.
    if (nextTime < c.currentTime) nextTime = c.currentTime + 0.02;
    while (nextTime < c.currentTime + 0.12) {
      schedule(step, nextTime);
      step = (step + 1) % totalSteps;
      nextTime += stepDuration;
    }
  }
  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    // Recuperar el paso anticipado que aun no llego a sonar.
    if (channel) step = (step - Math.max(0, Math.ceil((nextTime - channel.context.currentTime) / stepDuration)) + totalSteps) % totalSteps;
    for (const source of voices) { try { source.stop(); } catch (e) {} }
    voices.clear();
    if (session) session.disconnect();
    session = null;
  }
  function start() {
    if (session || !wanted || muted || volume === 0 || !Sound.enabled || Sound.volume === 0) return;
    if (!channel) channel = Sound.createMusicChannel();
    if (!channel) return;
    const c = channel.context;
    if (!noiseBuffer) {
      noiseBuffer = c.createBuffer(1, Math.ceil(c.sampleRate * 0.25), c.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    session = c.createGain(); session.gain.value = volume; session.connect(channel.output);
    nextTime = c.currentTime + 0.025;
    tick(); timer = setInterval(tick, 25);
  }
  function selectTrack(next) {
    if (next === trackIndex) return;
    if (session) stop();
    trackIndex = next; currentTrack = tracks[next];
    stepDuration = 60 / currentTrack.bpm / 4;
    step = 0;
    el("music-track").textContent = currentTrack.name + " · 8 bits";
    start();
  }
  return {
    get volume() { return volume; },
    get muted() { return muted; },
    setMuted(value) {
      muted = !!value;
      try { localStorage.setItem("marea-infernal-music-muted", muted ? "1" : "0"); } catch (e) {}
      if (muted) { if (session) stop(); }
      else start();
    },
    get trackName() { return currentTrack.name; },
    selectMenu() { selectTrack(6); },
    selectForWave(wave, finalChallenge) {
      const stage = Math.max(0, Math.min(4, Math.floor(((Number(wave) || 1) - 1) / 10)));
      const next = finalChallenge ? 5 : [3, 0, 2, 4, 1][stage];
      selectTrack(next);
    },
    setVolume(value) {
      if (!Number.isFinite(value)) return;
      volume = Math.max(0, Math.min(1, value));
      try { localStorage.setItem("marea-infernal-music-volume", String(volume)); } catch (e) {}
      if (session) session.gain.setTargetAtTime(volume, channel.context.currentTime, 0.02);
      if (volume === 0 && session) stop();
      else start();
    },
    setPlaying(value) {
      wanted = value;
      if (!wanted || !Sound.enabled || Sound.volume === 0) { if (session) stop(); }
      else start();
    }
  };
})();

el("music-slider").value = Math.round(Music.volume * 100);
el("music-value").textContent = Math.round(Music.volume * 100) + " %";
el("music-slider").addEventListener("input", e => {
  Music.setVolume(Number(e.target.value) / 100);
  el("music-value").textContent = Math.round(Music.volume * 100) + " %";
});
// Boton de silenciar solo la musica (esquina inferior derecha, junto al de sonido).
function syncMusicBtn() {
  const b = el("music-mute-btn"), m = Music.muted;
  const label = m ? "Activar música" : "Silenciar música";
  b.textContent = m ? "🔕" : "🎵";
  b.title = label;
  b.setAttribute("aria-label", label);
  b.setAttribute("aria-pressed", String(m));
}
el("music-mute-btn").addEventListener("click", () => { Music.setMuted(!Music.muted); syncMusicBtn(); });
syncMusicBtn();
document.addEventListener("visibilitychange", () => {
  if (document.hidden) Music.setPlaying(false);
});
// Browsers unlock menu music after the first user gesture.
function unlockMenuAudio() { if (Sound.enabled) Sound.resume(); }
document.addEventListener("pointerdown", unlockMenuAudio, { once: true, capture: true });
document.addEventListener("keydown", unlockMenuAudio, { once: true, capture: true });
