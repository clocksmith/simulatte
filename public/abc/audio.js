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

// Shape sounds - different sounds for each shape
const shapeSounds = {
  heart: { freq: 440, duration: 0.5, type: 'sine' },      // Warm A note
  star: { freq: 880, duration: 0.3, type: 'triangle' },   // Bright high A
  triangle: { freq: 330, duration: 0.4, type: 'square' }, // E note, edgy
  circle: { freq: 523.25, duration: 0.5, type: 'sine' },  // Smooth C
  diamond: { freq: 659.25, duration: 0.4, type: 'sawtooth' } // Sparkly E
};

export function playShapeSound(shapeType) {
  if (!state.audioContext) return;

  const sound = shapeSounds[shapeType] || shapeSounds.circle;
  const time = state.audioContext.currentTime;

  // Main tone
  const osc = state.audioContext.createOscillator();
  const gain = state.audioContext.createGain();

  osc.type = sound.type;
  osc.frequency.setValueAtTime(sound.freq, time);

  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.3, time + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.01, time + sound.duration);

  osc.connect(gain);
  gain.connect(state.audioContext.destination);

  osc.start(time);
  osc.stop(time + sound.duration);

  // Add a harmonic for richness
  const osc2 = state.audioContext.createOscillator();
  const gain2 = state.audioContext.createGain();

  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(sound.freq * 2, time);

  gain2.gain.setValueAtTime(0, time);
  gain2.gain.linearRampToValueAtTime(0.12, time + 0.03);
  gain2.gain.exponentialRampToValueAtTime(0.01, time + sound.duration * 0.6);

  osc2.connect(gain2);
  gain2.connect(state.audioContext.destination);

  osc2.start(time);
  osc2.stop(time + sound.duration * 0.6);
}
