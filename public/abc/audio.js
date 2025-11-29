// ============================================
// ABC - Audio System Module
// ============================================

import { state, abcSongNotes } from './config.js';

export function initAudio() {
  if (state.audioContext) return;
  state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
}

// Play a single tone with harmonics (bell-like)
function playSingleNote(freq, duration, startTime) {
  if (!state.audioContext) return;

  const time = startTime || state.audioContext.currentTime;

  // Main oscillator
  const osc = state.audioContext.createOscillator();
  const gainNode = state.audioContext.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, time);

  gainNode.gain.setValueAtTime(0, time);
  gainNode.gain.linearRampToValueAtTime(0.35, time + 0.03);
  gainNode.gain.exponentialRampToValueAtTime(0.01, time + duration);

  osc.connect(gainNode);
  gainNode.connect(state.audioContext.destination);

  osc.start(time);
  osc.stop(time + duration);

  // Octave harmonic
  const osc2 = state.audioContext.createOscillator();
  const gain2 = state.audioContext.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2, time);
  gain2.gain.setValueAtTime(0, time);
  gain2.gain.linearRampToValueAtTime(0.15, time + 0.02);
  gain2.gain.exponentialRampToValueAtTime(0.01, time + duration * 0.7);

  osc2.connect(gain2);
  gain2.connect(state.audioContext.destination);
  osc2.start(time);
  osc2.stop(time + duration * 0.7);

  // Fifth harmonic for shimmer
  const osc3 = state.audioContext.createOscillator();
  const gain3 = state.audioContext.createGain();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(freq * 1.5, time);
  gain3.gain.setValueAtTime(0, time);
  gain3.gain.linearRampToValueAtTime(0.08, time + 0.02);
  gain3.gain.exponentialRampToValueAtTime(0.01, time + duration * 0.5);

  osc3.connect(gain3);
  gain3.connect(state.audioContext.destination);
  osc3.start(time);
  osc3.stop(time + duration * 0.5);
}

export function playNote(char) {
  if (!state.audioContext) return;

  const noteData = abcSongNotes[char.toLowerCase()] || { freq: 440, duration: 0.4 };

  // Handle multi-syllable letters (like W = "double-you", Y = "and")
  if (noteData.multi && noteData.notes) {
    let time = state.audioContext.currentTime;
    const gap = noteData.gap || 0.05;
    for (const note of noteData.notes) {
      playSingleNote(note.freq, note.duration, time);
      time += note.duration + gap;
    }
    return;
  }

  playSingleNote(noteData.freq, noteData.duration);
}

export function playCelebrationSound() {
  if (!state.audioContext) return;

  // Happy arpeggio: C, E, G, C
  const notes = [523.25, 659.25, 783.99, 1046.50];

  notes.forEach((freq, i) => {
    const osc = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, state.audioContext.currentTime + i * 0.1);

    gain.gain.setValueAtTime(0, state.audioContext.currentTime + i * 0.1);
    gain.gain.linearRampToValueAtTime(0.2, state.audioContext.currentTime + i * 0.1 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, state.audioContext.currentTime + i * 0.1 + 0.5);

    osc.connect(gain);
    gain.connect(state.audioContext.destination);

    osc.start(state.audioContext.currentTime + i * 0.1);
    osc.stop(state.audioContext.currentTime + i * 0.1 + 0.5);
  });
}

// Melodic shape sounds with harmonic progressions
// Multiple chord progressions to cycle through
const chordProgressions = [
  // I - IV - V - I (Classic)
  [[261.63, 329.63, 392.00], [349.23, 440.00, 523.25], [392.00, 493.88, 587.33], [523.25, 659.25, 783.99]],
  // I - vi - IV - V (Pop)
  [[261.63, 329.63, 392.00], [440.00, 523.25, 659.25], [349.23, 440.00, 523.25], [392.00, 493.88, 587.33]],
  // I - V - vi - IV (Modern Pop)
  [[261.63, 329.63, 392.00], [392.00, 493.88, 587.33], [440.00, 523.25, 659.25], [349.23, 440.00, 523.25]],
  // i - VI - III - VII (Minor)
  [[261.63, 311.13, 392.00], [440.00, 523.25, 659.25], [329.63, 392.00, 493.88], [466.16, 587.33, 698.46]],
  // I - iii - vi - ii (Jazzy)
  [[261.63, 329.63, 392.00], [329.63, 392.00, 493.88], [440.00, 523.25, 659.25], [293.66, 349.23, 440.00]],
  // Pentatonic ascending
  [[261.63, 293.66, 329.63], [329.63, 392.00, 440.00], [440.00, 523.25, 587.33], [587.33, 659.25, 783.99]],
];

// Track state for melodic progression
let currentProgressionIndex = 0;
let currentChordIndex = 0;
let lastProgressionTime = 0;
let recentProgressions = [];

// Shape-specific timbres
const shapeTimbre = {
  heart: { type: 'sine', attack: 0.08, decay: 0.6, harmonics: [1, 0.5, 0.25] },
  star: { type: 'triangle', attack: 0.02, decay: 0.4, harmonics: [1, 0.3, 0.1, 0.05] },
  triangle: { type: 'triangle', attack: 0.01, decay: 0.35, harmonics: [1, 0, 0.3] },
  circle: { type: 'sine', attack: 0.05, decay: 0.5, harmonics: [1, 0.4, 0.2] },
  diamond: { type: 'sawtooth', attack: 0.02, decay: 0.45, harmonics: [1, 0.2, 0.1] }
};

export function playShapeSound(shapeType) {
  if (!state.audioContext) return;

  const time = state.audioContext.currentTime;
  const timbre = shapeTimbre[shapeType] || shapeTimbre.circle;

  // Switch progression if it's been a while (3+ seconds) or we've gone through the whole progression
  const timeSinceLastPress = time - lastProgressionTime;
  if (timeSinceLastPress > 3 || currentChordIndex >= chordProgressions[currentProgressionIndex].length) {
    // Pick a new progression that wasn't used recently
    let newIndex;
    let attempts = 0;
    do {
      newIndex = Math.floor(Math.random() * chordProgressions.length);
      attempts++;
    } while (recentProgressions.includes(newIndex) && attempts < 10);

    currentProgressionIndex = newIndex;
    currentChordIndex = 0;

    // Track recent progressions (keep last 3)
    recentProgressions.push(newIndex);
    if (recentProgressions.length > 3) {
      recentProgressions.shift();
    }
  }

  lastProgressionTime = time;

  // Get current chord
  const progression = chordProgressions[currentProgressionIndex];
  const chord = progression[currentChordIndex % progression.length];
  currentChordIndex++;

  // Play chord with shape's timbre
  chord.forEach((freq, i) => {
    // Slightly stagger notes for arpeggio effect
    const noteTime = time + i * 0.03;

    // Play each harmonic
    timbre.harmonics.forEach((harmonicGain, h) => {
      if (harmonicGain === 0) return;

      const osc = state.audioContext.createOscillator();
      const gain = state.audioContext.createGain();

      osc.type = timbre.type;
      osc.frequency.setValueAtTime(freq * (h + 1), noteTime);

      const volume = 0.15 * harmonicGain * (1 - i * 0.15); // Fade lower notes slightly
      gain.gain.setValueAtTime(0, noteTime);
      gain.gain.linearRampToValueAtTime(volume, noteTime + timbre.attack);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + timbre.decay);

      osc.connect(gain);
      gain.connect(state.audioContext.destination);

      osc.start(noteTime);
      osc.stop(noteTime + timbre.decay);
    });
  });

  // Add a subtle bass note for depth
  const bassFreq = chord[0] / 2;
  const bassOsc = state.audioContext.createOscillator();
  const bassGain = state.audioContext.createGain();

  bassOsc.type = 'sine';
  bassOsc.frequency.setValueAtTime(bassFreq, time);

  bassGain.gain.setValueAtTime(0, time);
  bassGain.gain.linearRampToValueAtTime(0.08, time + 0.05);
  bassGain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);

  bassOsc.connect(bassGain);
  bassGain.connect(state.audioContext.destination);

  bassOsc.start(time);
  bassOsc.stop(time + 0.5);
}
