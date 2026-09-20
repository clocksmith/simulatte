(function attachMotorcycleAudio(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteMotorcycleAudio = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMotorcycleAudioApi() {
  'use strict';

  function createAudioEngine() {
    let audioCtx = null;
    let masterGain = null;
    let engineGain = null;
    let antiPhaseGain = null;
    let isMuted = true;
    let isInitialized = false;

    // Pool of oscillator nodes for the motorcycle swarm
    const MAX_ACTIVE_VOICES = 6;
    const voices = [];

    // White noise buffer for exhaust hiss
    let noiseNode = null;
    let noiseFilter = null;
    let noiseGain = null;

    function initAudio() {
      if (isInitialized && audioCtx) {
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
        return true;
      }

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        console.warn('Web Audio API not supported in this environment.');
        return false;
      }

      try {
        audioCtx = new AudioContextClass();

        // Master output bus
        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(isMuted ? 0 : 0.25, audioCtx.currentTime);
        masterGain.connect(audioCtx.destination);

        // Motorcycle exhaust engine bus
        engineGain = audioCtx.createGain();
        engineGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
        engineGain.connect(masterGain);

        // Anti-phase cancellation bus (generates phase-inverted cancel tone)
        antiPhaseGain = audioCtx.createGain();
        antiPhaseGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
        antiPhaseGain.connect(masterGain);

        // Setup noise generator for mechanical / exhaust turbulent rush
        setupExhaustNoise();

        // Initialize voice pool
        setupVoicePool();

        isInitialized = true;
        return true;
      } catch (err) {
        console.error('Failed to initialize Web Audio:', err);
        return false;
      }
    }

    function setupExhaustNoise() {
      if (!audioCtx) return;
      const bufferSize = audioCtx.sampleRate * 2;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = audioCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;
      whiteNoise.start(0);

      noiseFilter = audioCtx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(450, audioCtx.currentTime);
      noiseFilter.Q.setValueAtTime(2.0, audioCtx.currentTime);

      noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.05, audioCtx.currentTime);

      whiteNoise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(engineGain);
    }

    function setupVoicePool() {
      for (let i = 0; i < MAX_ACTIVE_VOICES; i++) {
        // Fundamental oscillator (sawtooth for rich combustion harmonics)
        const fundamental = audioCtx.createOscillator();
        fundamental.type = 'sawtooth';

        // Secondary oscillator (subharmonic rumble)
        const subOsc = audioCtx.createOscillator();
        subOsc.type = 'triangle';

        // Low-pass filter simulating exhaust pipe resonance
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, audioCtx.currentTime);
        filter.Q.setValueAtTime(3.5, audioCtx.currentTime);

        const voiceGain = audioCtx.createGain();
        voiceGain.gain.setValueAtTime(0, audioCtx.currentTime);

        // Anti-phase cancellation inverter node
        const cancelOsc = audioCtx.createOscillator();
        cancelOsc.type = 'sawtooth';
        const cancelGain = audioCtx.createGain();
        cancelGain.gain.setValueAtTime(0, audioCtx.currentTime);

        fundamental.connect(filter);
        subOsc.connect(filter);
        filter.connect(voiceGain);
        voiceGain.connect(engineGain);

        cancelOsc.connect(cancelGain);
        cancelGain.connect(antiPhaseGain);

        fundamental.start(0);
        subOsc.start(0);
        cancelOsc.start(0);

        voices.push({
          fundamental,
          subOsc,
          filter,
          voiceGain,
          cancelOsc,
          cancelGain,
          active: false,
          bikeId: null,
        });
      }
    }

    function updateFromSimulation(simulationState) {
      if (!isInitialized || !audioCtx || isMuted) return;

      const { bikes = [], controls = {}, soundProbes = [] } = simulationState;
      const reverseSoundEnabled = controls.reverseSoundEnabled;
      const reverseSoundPower = controls.reverseSoundPower || 0;

      // Sort loudest active non-stalled bikes
      const audibleBikes = bikes
        .filter((b) => b.engineState !== 'stalled')
        .sort((a, b) => (b.spl || 0) - (a.spl || 0))
        .slice(0, MAX_ACTIVE_VOICES);

      const now = audioCtx.currentTime;

      // Anti-phase overall acoustic destructive gain reduction
      if (reverseSoundEnabled && reverseSoundPower > 0) {
        // Linear attenuation factor simulating real sound reduction
        const cancelFactor = Math.max(0.1, 1.0 - (reverseSoundPower * 0.85));
        engineGain.gain.setTargetAtTime(cancelFactor, now, 0.05);
      } else {
        engineGain.gain.setTargetAtTime(1.0, now, 0.05);
      }

      for (let i = 0; i < MAX_ACTIVE_VOICES; i++) {
        const voice = voices[i];
        const bike = audibleBikes[i];

        if (!bike) {
          voice.voiceGain.gain.setTargetAtTime(0, now, 0.08);
          voice.cancelGain.gain.setTargetAtTime(0, now, 0.08);
          voice.active = false;
          continue;
        }

        voice.active = true;
        voice.bikeId = bike.id;

        // Calculate 4-stroke firing fundamental: f = (RPM / 60) * (cylinders / 2)
        const cylinders = bike.engineProfile ? bike.engineProfile.cylinders : 4;
        const fundamentalFreq = Math.max(25, (bike.rpm / 60) * (cylinders / 2));
        const subFreq = fundamentalFreq * 0.5;

        // Apply misfire stutter if engine is in misfire state
        let misfireDamping = 1.0;
        if (bike.engineState === 'misfire') {
          misfireDamping = Math.sin(now * 40) > 0 ? 0.3 : 1.1;
        }

        voice.fundamental.frequency.setTargetAtTime(fundamentalFreq, now, 0.04);
        voice.subOsc.frequency.setTargetAtTime(subFreq, now, 0.04);

        // Adjust resonance filter based on revving aggression
        const filterCutoff = Math.min(6000, 800 + (bike.rpm / 12000) * 3500);
        voice.filter.frequency.setTargetAtTime(filterCutoff, now, 0.05);

        // Gain scaled by calculated SPL
        const normalizedSpl = Math.max(0, ((bike.spl || 90) - 75) / 55);
        const targetGain = (normalizedSpl * 0.18 / MAX_ACTIVE_VOICES) * misfireDamping;
        voice.voiceGain.gain.setTargetAtTime(targetGain, now, 0.04);

        // Anti-phase oscillator: phase-inverted waveform representation
        if (reverseSoundEnabled && reverseSoundPower > 0) {
          voice.cancelOsc.frequency.setTargetAtTime(fundamentalFreq, now, 0.04);
          // 180-degree inverted acoustic representation (gain reduction demonstration)
          const cancelVol = targetGain * reverseSoundPower * 0.9;
          voice.cancelGain.gain.setTargetAtTime(cancelVol, now, 0.04);
        } else {
          voice.cancelGain.gain.setTargetAtTime(0, now, 0.08);
        }
      }

      // Modulate exhaust hiss based on average swarm revving
      if (noiseGain && noiseFilter) {
        const avgRpm = bikes.reduce((acc, b) => acc + (b.rpm || 3000), 0) / Math.max(1, bikes.length);
        const noiseFreq = 300 + (avgRpm / 12000) * 1200;
        noiseFilter.frequency.setTargetAtTime(noiseFreq, now, 0.1);
        noiseGain.gain.setTargetAtTime(0.04 * (reverseSoundEnabled ? 0.4 : 1.0), now, 0.1);
      }
    }

    function triggerMistSound() {
      if (!audioCtx || isMuted) return;
      try {
        const now = audioCtx.currentTime;
        const mistOsc = audioCtx.createOscillator();
        const mistFilter = audioCtx.createBiquadFilter();
        const mistEnv = audioCtx.createGain();

        mistOsc.type = 'triangle';
        mistOsc.frequency.setValueAtTime(2200, now);
        mistOsc.frequency.exponentialRampToValueAtTime(600, now + 0.4);

        mistFilter.type = 'highpass';
        mistFilter.frequency.setValueAtTime(1000, now);

        mistEnv.gain.setValueAtTime(0.08, now);
        mistEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        mistOsc.connect(mistFilter);
        mistFilter.connect(mistEnv);
        mistEnv.connect(masterGain);

        mistOsc.start(now);
        mistOsc.stop(now + 0.45);
      } catch (err) {
        // ignore in non-audio environments
      }
    }

    function triggerStallSound() {
      if (!audioCtx || isMuted) return;
      try {
        const now = audioCtx.currentTime;
        const stallOsc = audioCtx.createOscillator();
        const stallEnv = audioCtx.createGain();

        stallOsc.type = 'sawtooth';
        stallOsc.frequency.setValueAtTime(180, now);
        stallOsc.frequency.exponentialRampToValueAtTime(30, now + 0.5);

        stallEnv.gain.setValueAtTime(0.12, now);
        stallEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        stallOsc.connect(stallEnv);
        stallEnv.connect(masterGain);

        stallOsc.start(now);
        stallOsc.stop(now + 0.55);
      } catch (err) {
        // ignore
      }
    }

    function setMuted(muted) {
      isMuted = Boolean(muted);
      if (!audioCtx) {
        if (!isMuted) initAudio();
        return;
      }
      if (audioCtx.state === 'suspended' && !isMuted) {
        audioCtx.resume();
      }
      const now = audioCtx.currentTime;
      masterGain.gain.setTargetAtTime(isMuted ? 0 : 0.25, now, 0.04);
    }

    function toggleMute() {
      setMuted(!isMuted);
      return isMuted;
    }

    function isAudioActive() {
      return !isMuted && audioCtx && audioCtx.state === 'running';
    }

    return Object.freeze({
      initAudio,
      updateFromSimulation,
      setMuted,
      toggleMute,
      isAudioActive,
      triggerMistSound,
      triggerStallSound,
    });
  }

  return Object.freeze({
    createAudioEngine,
  });
});
