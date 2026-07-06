import { midiToFreq } from '../utils/notes.js';
import { round } from '../utils/math.js';

function sortedKeys(object) {
  return Object.keys(object)
    .map((key) => Number(key))
    .filter((key) => Number.isFinite(key))
    .sort((a, b) => a - b);
}

export class MusicEngine {
  constructor(config) {
    this.config = config;

    this.ctx = null;
    this.musicBus = null;
    this.stemBuses = null;
    this.sfxBus = null;
    this.compressor = null;
    this.output = null;
    this.noiseBuffer = null;

    this.enabled = true;
    this.sfxEnabled = true;
    this.started = false;

    this.stepIndex = 0;
    this.barIndex = 0;
    this.nextStepTime = 0;
    this.schedulerId = null;
    this.transportInitialized = false;

    this.stepDuration = 60 / this.config.bpm / 4;

    this.stemLevels = { ...this.config.initialStemLevels };
    this.queuedChanges = [];
    this.landmarkPulseSteps = 0;

    this.onTransport = null;
  }

  setTransportListener(listener) {
    this.onTransport = listener;
  }

  getViewModel() {
    return {
      enabled: this.enabled,
      sfxEnabled: this.sfxEnabled,
      started: this.started,
      bar: this.barIndex,
      step: this.stepIndex,
      stemLevels: { ...this.stemLevels },
      queuedCount: this.queuedChanges.length
    };
  }

  ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        return null;
      }

      this.ctx = new AC();

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.0001;

      this.stemBuses = {
        drums: this.ctx.createGain(),
        bass: this.ctx.createGain(),
        harmony: this.ctx.createGain(),
        lead: this.ctx.createGain()
      };
      for (const [stem, bus] of Object.entries(this.stemBuses)) {
        bus.gain.value = (this.stemLevels[stem] || 0) > 0 ? 1 : 0.0001;
        bus.connect(this.musicBus);
      }

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.28;

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -20;
      this.compressor.knee.value = 22;
      this.compressor.ratio.value = 12;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.14;

      this.output = this.ctx.createGain();
      this.output.gain.value = this.config.outputGain;

      this.musicBus.connect(this.compressor);
      this.sfxBus.connect(this.compressor);
      this.compressor.connect(this.output);
      this.output.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (!this.noiseBuffer) {
      this.noiseBuffer = this._createNoiseBuffer();
    }

    return this.ctx;
  }

  startFromGesture() {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    if (!this.enabled) {
      return;
    }

    this.musicBus.gain.cancelScheduledValues(ctx.currentTime);
    this.musicBus.gain.setValueAtTime(Math.max(0.0001, this.musicBus.gain.value), ctx.currentTime);
    this.musicBus.gain.exponentialRampToValueAtTime(this.config.baseVolume, ctx.currentTime + 0.08);

    if (this.started) {
      return;
    }

    this.started = true;
    if (!this.transportInitialized) {
      this.stepIndex = 0;
      this.barIndex = 0;
      this.transportInitialized = true;
    }
    this.nextStepTime = ctx.currentTime + 0.04;

    if (this.schedulerId) {
      clearInterval(this.schedulerId);
    }

    this.schedulerId = setInterval(() => this._schedulerTick(), this.config.schedulerIntervalMs);
    this._schedulerTick();
  }

  stop() {
    if (this.schedulerId) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }

    this.started = false;

    if (this.ctx && this.musicBus) {
      this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicBus.gain.setValueAtTime(Math.max(0.0001, this.musicBus.gain.value), this.ctx.currentTime);
      this.musicBus.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.12);
    }
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (!this.enabled) {
      this.stop();
      return;
    }

    this.startFromGesture();
  }

  setSfxEnabled(value) {
    this.sfxEnabled = Boolean(value);
  }

  queueChanges(changes) {
    for (const change of changes) {
      if (!change || !change.stem || !Number.isFinite(change.level)) {
        continue;
      }

      const existing = this.queuedChanges.find((item) => item.stem === change.stem);
      if (existing) {
        existing.level = Math.max(existing.level, change.level);
      } else {
        this.queuedChanges.push({ stem: change.stem, level: change.level });
      }
    }
  }

  pulseFromLandmark() {
    this.landmarkPulseSteps = Math.max(this.landmarkPulseSteps, 12);
  }

  playMove() {
    if (!this.sfxEnabled) {
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    this._playTone(ctx, this.sfxBus, 610, 0.05, ctx.currentTime, {
      type: 'square',
      gain: 0.035,
      slide: -60,
      cutoff: 4200
    });
  }

  playSelect() {
    if (!this.sfxEnabled) {
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    this._playTone(ctx, this.sfxBus, 380, 0.06, ctx.currentTime, {
      type: 'square',
      gain: 0.04,
      slide: 24,
      cutoff: 4200
    });

    this._playTone(ctx, this.sfxBus, 540, 0.08, ctx.currentTime + 0.04, {
      type: 'square',
      gain: 0.04,
      slide: 30,
      cutoff: 4500
    });
  }

  playError() {
    if (!this.sfxEnabled) {
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    this._playTone(ctx, this.sfxBus, 160, 0.08, ctx.currentTime, {
      type: 'triangle',
      gain: 0.05,
      slide: -42,
      cutoff: 1600
    });
  }

  _schedulerTick() {
    if (!this.enabled || !this.started) {
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    while (this.nextStepTime < ctx.currentTime + this.config.lookAheadSeconds) {
      this._scheduleStep(this.stepIndex, this.nextStepTime);

      this.stepIndex += 1;
      if (this.stepIndex >= this.config.stepsPerBar) {
        this.stepIndex = 0;
        this.barIndex += 1;
      }

      this.nextStepTime += this.stepDuration;
    }
  }

  _scheduleStep(step, time) {
    const ctx = this.ctx;
    if (!ctx) {
      return;
    }

    if (step === 0) {
      this._applyQueuedChanges();
    }

    const drumsPattern = this._patternFor('drums', this.stemLevels.drums);
    const bassPattern = this._patternFor('bass', this.stemLevels.bass);
    const harmonyPattern = this._patternFor('harmony', this.stemLevels.harmony);
    const leadPattern = this._patternFor('lead', this.stemLevels.lead);
    const drumsBus = this._stemBus('drums');
    const bassBus = this._stemBus('bass');
    const harmonyBus = this._stemBus('harmony');
    const leadBus = this._stemBus('lead');

    const drumsActive = this._isStemActiveAtStep('drums', this.stemLevels.drums, step);
    const bassActive = this._isStemActiveAtStep('bass', this.stemLevels.bass, step);
    const harmonyActive = this._isStemActiveAtStep('harmony', this.stemLevels.harmony, step);
    const leadActive = this._isStemActiveAtStep('lead', this.stemLevels.lead, step);

    if (drumsActive) {
      this._playDrumsStep(drumsPattern[step] || 0, time, drumsBus);
    }

    const bassMidi = bassPattern[step];
    if (bassActive && Number.isFinite(bassMidi)) {
      this._playTone(ctx, bassBus, midiToFreq(bassMidi), this.stepDuration * 1.6, time, {
        type: 'triangle',
        gain: 0.24,
        cutoff: 1500
      });
    }

    const chord = harmonyPattern[step];
    if (harmonyActive && Array.isArray(chord)) {
      for (const midi of chord) {
        this._playTone(ctx, harmonyBus, midiToFreq(midi), this.stepDuration * 1.8, time, {
          type: 'triangle',
          gain: 0.08,
          cutoff: 2400
        });
      }
    }

    const leadMidi = leadPattern[step];
    if (leadActive && Number.isFinite(leadMidi)) {
      this._playTone(ctx, leadBus, midiToFreq(leadMidi), this.stepDuration * 0.9, time, {
        type: 'triangle',
        gain: 0.11,
        cutoff: 3000,
        slide: 8
      });
    }

    if (this.landmarkPulseSteps > 0) {
      if (step % 2 === 0) {
        this._playHat(time, 0.02, drumsBus);
      }
      this.landmarkPulseSteps -= 1;
    }

    if (typeof this.onTransport === 'function') {
      this.onTransport({
        bar: this.barIndex,
        step,
        stemLevels: { ...this.stemLevels },
        queuedCount: this.queuedChanges.length
      });
    }
  }

  _applyQueuedChanges() {
    if (this.queuedChanges.length === 0) {
      return;
    }

    for (const change of this.queuedChanges) {
      const stem = change.stem;
      const previous = this.stemLevels[stem] || 0;
      const next = Math.max(previous, change.level);
      this.stemLevels[stem] = next;

      if (next > previous) {
        this._fadeStemIn(stem);
      }
    }

    this.queuedChanges.length = 0;
  }

  _patternFor(stem, level) {
    const all = this.config.patterns[stem] || {};
    const levels = sortedKeys(all);
    if (levels.length === 0) {
      return Array(this.config.stepsPerBar).fill(null);
    }

    let selected = levels[0];
    for (const candidate of levels) {
      if (candidate <= level) {
        selected = candidate;
      }
    }

    const base = all[selected];
    if (!Array.isArray(base) || base.length === 0) {
      return Array(this.config.stepsPerBar).fill(null);
    }

    if (base.length === this.config.stepsPerBar) {
      return base;
    }

    const normalized = Array(this.config.stepsPerBar).fill(null);
    for (let i = 0; i < this.config.stepsPerBar; i += 1) {
      normalized[i] = base[i % base.length];
    }
    return normalized;
  }

  _isStemActiveAtStep(stem, level, step) {
    const windows = this._windowsFor(stem, level);
    if (windows === null) {
      return true;
    }

    if (!Array.isArray(windows) || windows.length === 0) {
      return false;
    }

    for (const window of windows) {
      if (!Array.isArray(window) || window.length < 2) {
        continue;
      }
      const start = Math.max(0, Math.min(this.config.stepsPerBar - 1, Number(window[0])));
      const end = Math.max(start, Math.min(this.config.stepsPerBar - 1, Number(window[1])));
      if (step >= start && step <= end) {
        return true;
      }
    }

    return false;
  }

  _windowsFor(stem, level) {
    const all = this.config.activityWindows?.[stem];
    if (!all) {
      return null;
    }

    const levels = sortedKeys(all);
    if (levels.length === 0) {
      return null;
    }

    let selected = levels[0];
    for (const candidate of levels) {
      if (candidate <= level) {
        selected = candidate;
      }
    }

    return all[selected] ?? null;
  }

  _stemBus(stem) {
    return this.stemBuses?.[stem] || this.musicBus;
  }

  _fadeStemIn(stem) {
    if (!this.ctx || !this.stemBuses || !this.stemBuses[stem]) {
      return;
    }

    const bus = this.stemBuses[stem];
    const now = this.ctx.currentTime;
    const fadeSeconds = Math.max(0.08, this.stepDuration * 8);
    const start = Math.max(0.0001, bus.gain.value || 0.0001);

    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(start, now);
    bus.gain.linearRampToValueAtTime(1, now + fadeSeconds);
  }

  _playDrumsStep(value, time, bus = this.musicBus) {
    if (!value) {
      return;
    }

    if (value === 1 || value === 4 || value === 6) {
      this._playKick(time, bus);
    }

    if (value === 2 || value === 5 || value === 6) {
      this._playSnare(time, bus);
    }

    if (value === 3 || value === 4 || value === 5) {
      this._playHat(time, 0.06, bus);
    }
  }

  _playKick(time, bus = this.musicBus) {
    const ctx = this.ctx;
    if (!ctx) {
      return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(118, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.11);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(180, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.42, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(bus);

    osc.start(time);
    osc.stop(time + 0.14);
  }

  _playSnare(time, bus = this.musicBus) {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer) {
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);

    source.start(time);
    source.stop(time + 0.085);
  }

  _playHat(time, gainValue, bus = this.musicBus) {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer) {
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(4200, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.0001, gainValue), time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);

    source.start(time);
    source.stop(time + 0.032);
  }

  _playTone(ctx, bus, freq, duration, startTime, options = {}) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    const type = options.type || 'square';
    const gainValue = options.gain || 0.05;
    const cutoff = options.cutoff || 3000;
    const slide = options.slide || 0;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    if (slide !== 0) {
      osc.frequency.linearRampToValueAtTime(Math.max(35, freq + slide), startTime + duration);
    }

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.007);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(bus);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  _createNoiseBuffer() {
    const ctx = this.ctx;
    if (!ctx) {
      return null;
    }

    const length = Math.floor(ctx.sampleRate * 0.2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }

    return buffer;
  }

  debugSnapshot() {
    return {
      enabled: this.enabled,
      started: this.started,
      bar: this.barIndex,
      step: this.stepIndex,
      nextStepTime: round(this.nextStepTime, 4),
      stemLevels: { ...this.stemLevels },
      queuedChanges: [...this.queuedChanges]
    };
  }
}
