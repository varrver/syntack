/**
 * SYNTACK — Web Audio API Synthesizer Engine
 * Handles game sound effects (SFX) and plays custom victory audio.
 */

class CyberAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;

    this.isMuted = localStorage.getItem("syntack_muted") === "true";
    this.volume = parseFloat(localStorage.getItem("syntack_volume") || "0.6");

    // Victory audio is lazy-loaded on first play to avoid unused download
    this._victoryAudio = null;
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.ctx = new AudioContext();

    this.masterGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();

    this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
    this.sfxGain.gain.value = 0.8;

    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  ensureContext() {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.ensureContext();
    this.isMuted = !this.isMuted;
    localStorage.setItem("syntack_muted", this.isMuted);
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(
        this.isMuted ? 0 : this.volume,
        this.ctx.currentTime,
      );
    }
    this._syncMusicVolume();
    return this.isMuted;
  }

  setVolume(val) {
    this.ensureContext();
    this.volume = Math.max(0, Math.min(1, val));
    localStorage.setItem("syntack_volume", this.volume);
    if (this.masterGain && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
    this._syncMusicVolume();
  }

  // --- PROCEDURAL SFX GENERATORS ---

  playHover() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.03);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.03);
  }

  playCard(type) {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (type === "attack") {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.15);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === "defense") {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(540, now + 0.2);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === "variable") {
      [523.25, 1046.5].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + i * 0.04;

        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(startTime);
        osc.stop(startTime + 0.08);
      });
    } else if (type === "loop") {
      [440, 554.37, 659.25].forEach((freq) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.25);
      });
    }
  }

  playInsufficientRam() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.setValueAtTime(110, now + 0.08);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  playExecuteTurn() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.3);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  playDamageTaken() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(800, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    whiteNoise.start(now);
  }

  playBlock() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.12);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  // Impact thud when an attack lands on the enemy. `damage` scales the
  // pitch and punch: bigger hits (crits) sound deeper and louder, small
  // hits stay tight and dry.
  playEnemyHit(damage = 0) {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const dmg = Math.max(0, Math.min(30, Number(damage) || 0));
    const punch = 0.6 + (dmg / 30) * 0.8; // 0.6 (small) → 1.4 (crit)

    const bufferSize = Math.floor(this.ctx.sampleRate * (0.08 + dmg * 0.0008));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const out = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      out[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(500 + dmg * 16, now);
    filter.frequency.exponentialRampToValueAtTime(160 + dmg * 4, now + 0.09);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35 * punch, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(now);
  }

  // --- VICTORY AUDIO (freesound_community-goodresult-82807.mp3.mpeg) ---

  playVictory() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    if (!this._victoryAudio) {
      this._victoryAudio = new Audio("assets/audio/victory.mp3");
    }
    if (this._victoryAudio) {
      this._victoryAudio.currentTime = 0;
      this._victoryAudio.volume = this.volume;
      this._victoryAudio.play().catch((err) => {
        console.warn("Victory audio play error:", err);
      });
    }
  }

  playDefeat() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.6);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  // --- MUSIC THEME MANAGEMENT ---

  _createTrack(src) {
    const audio = new Audio(src);
    audio.loop = true;
    audio.preload = "auto";
    return audio;
  }

  _fadeTrack(track, fromVol, toVol, durationMs, onDone) {
    const steps = 30;
    const stepMs = durationMs / steps;
    const delta = (toVol - fromVol) / steps;
    let step = 0;
    const iv = setInterval(() => {
      step++;
      track.volume = Math.max(0, Math.min(1, fromVol + delta * step));
      if (step >= steps) {
        clearInterval(iv);
        track.volume = toVol;
        if (onDone) onDone();
      }
    }, stepMs);
    return iv;
  }

  _playMusic(src, fadeInMs = 1200) {
    const targetVol = this.isMuted ? 0 : Math.min(this.volume * 0.55, 0.55);

    // Same track already playing — do nothing
    if (this._musicEl && this._musicSrc === src && !this._musicEl.paused) return;

    const oldTrack = this._musicEl;

    // Preload & start new track at 0 volume
    const newTrack = this._createTrack(src);
    newTrack.volume = 0;
    newTrack.play().catch(() => {});
    this._musicEl = newTrack;
    this._musicSrc = src;

    // Fade new track in
    this._fadeTrack(newTrack, 0, targetVol, fadeInMs, null);

    // Crossfade old track out simultaneously
    if (oldTrack && !oldTrack.paused) {
      this._fadeTrack(oldTrack, oldTrack.volume, 0, fadeInMs, () => {
        oldTrack.pause();
        oldTrack.src = "";
      });
    }
  }

  playMainTheme() {
    this._playMusic("assets/audio/Main_theme_night_city_loopable.mp3", 1400);
  }

  playBattleTheme() {
    this._playMusic("assets/audio/Battle_theme_loopable.mp3", 900);
  }

  stopMusic(fadeOutMs = 900) {
    if (!this._musicEl || this._musicEl.paused) return;
    const track = this._musicEl;
    this._musicEl = null;
    this._musicSrc = null;
    this._fadeTrack(track, track.volume, 0, fadeOutMs, () => {
      track.pause();
      track.src = "";
    });
  }

  // Keep music volume in sync when master volume / mute changes
  _syncMusicVolume() {
    if (!this._musicEl || this._musicEl.paused) return;
    this._musicEl.volume = this.isMuted ? 0 : Math.min(this.volume * 0.55, 0.55);
  }
}

export const audioEngine = new CyberAudioEngine();
