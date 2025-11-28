// ============================================
// ABC - Alphabet Smash
// A toddler-friendly keyboard game with speech recognition
// ============================================

// State
let audioContext = null;
let isStarted = false;
let currentLetter = null;
let mouseX = 0;
let mouseY = 0;
let trailPoints = [];

// Background shapes state
let backgroundShapes = [];
const MAX_SHAPES = 25;
const shapeTypes = ['heart', 'star', 'triangle', 'circle', 'diamond'];

// Marquee state
let marqueeOffset = 0;
const MARQUEE_SPEED = 0.5;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Speech recognition state - using Web Worker for performance
let whisperWorker = null;
let isModelLoading = false;
let isModelLoaded = false;
let isListening = false;
let selectedModel = 'base'; // 'none', 'tiny', 'base', or 'small'

// Audio level monitoring
let audioAnalyser = null;
let audioDataArray = null;
let micStream = null;

// DOM Elements
const app = document.getElementById('app');
const letterDisplay = document.getElementById('letter-display');
const particlesContainer = document.getElementById('particles');
const startScreen = document.getElementById('start-screen');
const trailCanvas = document.getElementById('trail-canvas');
const ctx = trailCanvas.getContext('2d');
const celebrationOverlay = document.getElementById('celebration-overlay');
const micIndicator = document.getElementById('mic-indicator');
const modelLoader = document.getElementById('model-loader');

// Colors
const colors = [
  '#ff6b6b', '#feca57', '#fff200', '#1dd1a1',
  '#48dbfb', '#5f27cd', '#a55eea', '#fd79a8',
  '#00d2d3', '#ff9ff3', '#54a0ff', '#5f27cd'
];

const colorClasses = [
  'color-red', 'color-orange', 'color-yellow', 'color-green',
  'color-cyan', 'color-blue', 'color-purple', 'color-pink'
];

// ABC Song / Twinkle Twinkle Little Star melody frequencies
// C4=261.63, D4=293.66, E4=329.63, F4=349.23, G4=392.00, A4=440.00
// Melody: A-B-C-D-E-F-G (C-C-G-G-A-A-G), H-I-J-K (F-F-E-E), L-M-N-O-P (D-D-C), Q-R-S (G-G-F), T-U-V (E-E-D), W-X-Y-Z (C-C-D-D)
// ABC Song notes - single syllable letters get one note
// Multi-syllable letters (W = "double-you") get multiple notes
const abcSongNotes = {
  'a': { freq: 261.63, duration: 0.4 },  // C - "ay"
  'b': { freq: 261.63, duration: 0.4 },  // C - "bee"
  'c': { freq: 392.00, duration: 0.4 },  // G - "see"
  'd': { freq: 392.00, duration: 0.4 },  // G - "dee"
  'e': { freq: 440.00, duration: 0.4 },  // A - "ee"
  'f': { freq: 440.00, duration: 0.4 },  // A - "eff"
  'g': { freq: 392.00, duration: 0.8 },  // G - "jee" (held)
  'h': { freq: 349.23, duration: 0.4 },  // F - "aitch"
  'i': { freq: 349.23, duration: 0.4 },  // F - "eye"
  'j': { freq: 329.63, duration: 0.4 },  // E - "jay"
  'k': { freq: 329.63, duration: 0.4 },  // E - "kay"
  'l': { freq: 293.66, duration: 0.22 }, // D - "el" (fast LMNOP)
  'm': { freq: 293.66, duration: 0.22 }, // D - "em"
  'n': { freq: 293.66, duration: 0.22 }, // D - "en"
  'o': { freq: 293.66, duration: 0.22 }, // D - "oh"
  'p': { freq: 261.63, duration: 0.5 },  // C - "pee" (resolves down)
  'q': { freq: 392.00, duration: 0.4 },  // G - "cue"
  'r': { freq: 392.00, duration: 0.4 },  // G - "ar"
  's': { freq: 349.23, duration: 0.5 },  // F - "ess"
  't': { freq: 329.63, duration: 0.4 },  // E - "tee"
  'u': { freq: 329.63, duration: 0.4 },  // E - "you"
  'v': { freq: 293.66, duration: 0.5 },  // D - "vee"
  // W is special - "dub-ble-you" (3 syllables, all on G)
  'w': {
    multi: true,
    notes: [
      { freq: 392.00, duration: 0.18 },  // G - "dub-"
      { freq: 392.00, duration: 0.18 },  // G - "-ble-"
      { freq: 392.00, duration: 0.24 }   // G - "-you"
    ]
  },
  'x': { freq: 349.23, duration: 0.4 },  // F - "eks"
  // Y includes "and" - "Y and Z" in the song
  'y': {
    multi: true,
    notes: [
      { freq: 329.63, duration: 0.25 },  // E - "why"
      { freq: 329.63, duration: 0.25 }   // E - "and"
    ]
  },
  'z': { freq: 293.66, duration: 0.8 },  // D - "zee" (held, ending)
  // Numbers use a simple scale
  '0': { freq: 261.63, duration: 0.4 },
  '1': { freq: 293.66, duration: 0.4 },
  '2': { freq: 329.63, duration: 0.4 },
  '3': { freq: 349.23, duration: 0.4 },
  '4': { freq: 392.00, duration: 0.4 },
  '5': { freq: 440.00, duration: 0.4 },
  '6': { freq: 493.88, duration: 0.4 },
  '7': { freq: 523.25, duration: 0.4 },
  '8': { freq: 587.33, duration: 0.4 },
  '9': { freq: 659.25, duration: 0.4 }
};

// Letter name mappings (what Whisper might transcribe) - expanded for robustness
const letterNames = {
  'a': ['a', 'ay', 'eh', 'ey', 'aa', 'ah', 'hey', 'hay', 'letter a', 'the letter a'],
  'b': ['b', 'be', 'bee', 'bea', 'bi', 'bee.', 'bee!', 'the bee', 'letter b', 'the letter b'],
  'c': ['c', 'see', 'sea', 'si', 'ce', 'cee', 'the sea', 'letter c', 'the letter c'],
  'd': ['d', 'de', 'dee', 'di', 'the d', 'letter d', 'the letter d'],
  'e': ['e', 'ee', 'ea', 'eee', 'he', 'letter e', 'the letter e'],
  'f': ['f', 'ef', 'eff', 'if', 'have', 'letter f', 'the letter f'],
  'g': ['g', 'ge', 'gee', 'ji', 'jee', 'the g', 'letter g', 'the letter g'],
  'h': ['h', 'aitch', 'ache', 'age', 'each', 'eich', 'eight', 'hage', 'letter h', 'the letter h'],
  'i': ['i', 'eye', 'ai', 'aye', 'ay', 'I.', 'letter i', 'the letter i'],
  'j': ['j', 'jay', 'je', 'jy', 'jade', 'jae', 'letter j', 'the letter j'],
  'k': ['k', 'kay', 'ke', 'ca', 'key', 'okay', 'kaye', 'letter k', 'the letter k'],
  'l': ['l', 'el', 'ell', 'al', 'elle', 'hell', 'letter l', 'the letter l'],
  'm': ['m', 'em', 'mm', 'am', 'um', 'him', 'letter m', 'the letter m'],
  'n': ['n', 'en', 'nn', 'an', 'in', 'letter n', 'the letter n'],
  'o': ['o', 'oh', 'ow', 'oo', 'hoe', 'letter o', 'the letter o'],
  'p': ['p', 'pe', 'pee', 'pi', 'the p', 'letter p', 'the letter p'],
  'q': ['q', 'cue', 'que', 'queue', 'ku', 'kyu', 'q.', 'letter q', 'the letter q'],
  'r': ['r', 'ar', 'are', 'er', 'or', 'our', 'letter r', 'the letter r'],
  's': ['s', 'es', 'ess', 'as', 'us', 'letter s', 'the letter s'],
  't': ['t', 'te', 'tee', 'tea', 'ti', 'the t', 'letter t', 'the letter t'],
  'u': ['u', 'you', 'yu', 'ew', 'ooh', 'letter u', 'the letter u'],
  'v': ['v', 've', 'vee', 'vi', 'the v', 'letter v', 'the letter v'],
  'w': ['w', 'double u', 'double you', 'doubleyou', 'dub', 'w.', 'letter w', 'the letter w'],
  'x': ['x', 'ex', 'ecks', 'eks', 'ax', 'acts', 'letter x', 'the letter x'],
  'y': ['y', 'why', 'wi', 'wai', 'wie', 'letter y', 'the letter y'],
  'z': ['z', 'ze', 'zee', 'zed', 'zet', 'the z', 'letter z', 'the letter z']
};

// ============================================
// Whisper Speech Recognition (Web Worker)
// ============================================
function loadWhisperModel() {
  // Skip if no model selected
  if (selectedModel === 'none') {
    console.log('🎤 Voice recognition disabled');
    return;
  }

  if (isModelLoading || isModelLoaded) return;

  isModelLoading = true;
  modelLoader.classList.add('active');

  const progressText = modelLoader.querySelector('.loader-progress');
  const statusText = modelLoader.querySelector('.loader-text');

  try {
    statusText.textContent = 'Loading Whisper model...';

    // Create Web Worker for speech recognition
    whisperWorker = new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });

    // Handle messages from worker
    whisperWorker.onmessage = (e) => {
      const { type, status, progress, text, error, silent } = e.data;

      switch (type) {
        case 'status':
          if (status === 'downloading') {
            const loaded = e.data.loaded || 0;
            const total = e.data.total || 0;
            const mb = (loaded / 1024 / 1024).toFixed(1);
            const totalMb = (total / 1024 / 1024).toFixed(1);
            const activeFiles = e.data.activeFiles || 0;
            statusText.textContent = `Downloading model${activeFiles > 1 ? ` (${activeFiles} files)` : ''}...`;
            progressText.textContent = total > 0 ? `${mb} / ${totalMb} MB (${progress}%)` : `${progress}%`;
          } else if (status === 'initiate') {
            const file = e.data.file || '';
            statusText.textContent = file ? `Starting ${file}...` : 'Initializing...';
          } else if (status === 'loading') {
            statusText.textContent = 'Initializing model...';
            progressText.textContent = '';
          } else if (status === 'ready') {
            isModelLoaded = true;
            isModelLoading = false;
            statusText.textContent = 'Model loaded!';
            progressText.textContent = '100%';

            setTimeout(() => {
              modelLoader.classList.remove('active');
              modelLoader.classList.add('loaded');
              startMicrophoneListening();
            }, 500);
          }
          break;

        case 'result':
          const whisperTime = e.data.processingTime || 0;
          if (!silent) {
            if (text && text.trim()) {
              console.log(`🗣️ Whisper: "${text.trim()}" (${whisperTime}ms)`);
              updateTranscriptDisplay(text.trim());
              checkForLetterMatch(text);
            } else {
              console.log(`🔇 Whisper: (no speech) (${whisperTime}ms)`);
              const transcriptEl = micIndicator.querySelector('.mic-transcript');
              if (transcriptEl) {
                transcriptEl.textContent = '(no speech)';
                transcriptEl.classList.remove('heard');
              }
              setTimeout(setTranscriptListening, 1000);
            }
          } else {
            setTranscriptListening();
          }
          break;

        case 'error':
          console.error('Whisper worker error:', error);
          break;
      }
    };

    whisperWorker.onerror = (error) => {
      console.error('Worker error:', error);
      statusText.textContent = 'Failed to load model';
      progressText.textContent = 'Speech recognition unavailable';
      isModelLoading = false;

      setTimeout(() => {
        modelLoader.classList.remove('active');
      }, 2000);
    };

    // Start loading the model in the worker
    whisperWorker.postMessage({ type: 'load', model: selectedModel });

  } catch (error) {
    console.error('Failed to create Whisper worker:', error);
    statusText.textContent = 'Failed to load model';
    progressText.textContent = 'Speech recognition unavailable';
    isModelLoading = false;

    setTimeout(() => {
      modelLoader.classList.remove('active');
    }, 2000);
  }
}

// Separate audio context for level monitoring
let levelAudioContext = null;

async function startMicrophoneListening() {
  if (!isModelLoaded || isListening) return;

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    // Set up audio analyser for level monitoring with its own context
    levelAudioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Resume context (required after user interaction)
    if (levelAudioContext.state === 'suspended') {
      await levelAudioContext.resume();
    }

    const source = levelAudioContext.createMediaStreamSource(micStream);
    audioAnalyser = levelAudioContext.createAnalyser();
    audioAnalyser.fftSize = 512;
    audioAnalyser.smoothingTimeConstant = 0.4;
    audioAnalyser.minDecibels = -90;
    audioAnalyser.maxDecibels = -10;
    source.connect(audioAnalyser);

    // Use time domain data for better level detection
    audioDataArray = new Uint8Array(audioAnalyser.fftSize);

    // Start level monitoring
    updateAudioLevel();

    isListening = true;
    micIndicator.classList.add('visible', 'listening');
    setTranscriptListening();

    // Record in 2-second intervals
    startRecordingCycle();

  } catch (error) {
    console.error('Microphone access denied:', error);
    micIndicator.classList.add('visible');
    const transcriptEl = micIndicator.querySelector('.mic-transcript');
    if (transcriptEl) {
      transcriptEl.textContent = 'Mic Blocked';
      transcriptEl.style.color = '#ff6b6b';
    }
  }
}

// Smoothed level for display
let smoothedLevel = 0;

function updateAudioLevel() {
  if (!audioAnalyser || !isListening) {
    requestAnimationFrame(updateAudioLevel);
    return;
  }

  // Use time domain data for RMS level calculation
  audioAnalyser.getByteTimeDomainData(audioDataArray);

  // Calculate RMS (root mean square) for accurate level
  let sumSquares = 0;
  for (let i = 0; i < audioDataArray.length; i++) {
    const normalized = (audioDataArray[i] - 128) / 128; // Normalize to -1 to 1
    sumSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumSquares / audioDataArray.length);

  // Convert RMS to level (0-100)
  const rawLevel = Math.min(100, rms * 200);

  // Smooth the level (lerp)
  smoothedLevel += (rawLevel - smoothedLevel) * 0.3;

  // Convert to dB (approximate)
  const dB = rms > 0.001 ? Math.round(20 * Math.log10(rms) + 60) : 0;

  // Update UI
  const meterBar = micIndicator.querySelector('.mic-meter-bar');
  const dbDisplay = micIndicator.querySelector('.mic-db');

  if (meterBar) {
    meterBar.style.setProperty('--level', `${smoothedLevel}%`);
  }
  if (dbDisplay) {
    dbDisplay.textContent = `${Math.max(0, Math.min(60, dB))} dB`;
  }

  requestAnimationFrame(updateAudioLevel);
}

// Overlapping recording system with deduplication
let recorderA = null;
let recorderB = null;
let chunksA = [];
let chunksB = [];
const CHUNK_DURATION = 1000; // 1 second per chunk
const OVERLAP_MS = 150;      // 150ms overlap to catch boundary speech

// Letter display queue for handling multiple letters from one transcription
let letterQueue = [];
let isDisplayingQueue = false;

// Deduplication - track recently shown letters
let recentLetters = []; // Array of { letter, time }
const DEDUPE_WINDOW_MS = 800; // Skip same letter if shown within 800ms

function isDuplicateLetter(letter) {
  const now = Date.now();
  // Clean old entries
  recentLetters = recentLetters.filter(r => now - r.time < DEDUPE_WINDOW_MS);
  // Check if duplicate
  return recentLetters.some(r => r.letter === letter.toLowerCase());
}

function markLetterShown(letter) {
  recentLetters.push({ letter: letter.toLowerCase(), time: Date.now() });
}

function setupRecorders() {
  const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';

  recorderA = new MediaRecorder(micStream, { mimeType });
  recorderA.ondataavailable = (e) => {
    if (e.data.size > 0) chunksA.push(e.data);
  };
  recorderA.onstop = () => {
    if (chunksA.length > 0 && isModelLoaded && isListening) {
      const blob = new Blob(chunksA, { type: mimeType });
      chunksA = [];
      processAudio(blob);
    }
  };

  recorderB = new MediaRecorder(micStream, { mimeType });
  recorderB.ondataavailable = (e) => {
    if (e.data.size > 0) chunksB.push(e.data);
  };
  recorderB.onstop = () => {
    if (chunksB.length > 0 && isModelLoaded && isListening) {
      const blob = new Blob(chunksB, { type: mimeType });
      chunksB = [];
      processAudio(blob);
    }
  };
}

function startRecordingCycle() {
  if (!isListening || !micStream) return;

  if (!recorderA || !recorderB) {
    setupRecorders();
  }

  // Start recorder A
  startRecorderLoop(recorderA, 'A');

  // Start recorder B offset by half chunk duration (creates overlap)
  setTimeout(() => {
    if (isListening) {
      startRecorderLoop(recorderB, 'B');
    }
  }, CHUNK_DURATION / 2);
}

function startRecorderLoop(recorder, label) {
  if (!isListening || !recorder) return;

  try {
    if (recorder.state === 'inactive') {
      if (label === 'A') chunksA = [];
      else chunksB = [];

      recorder.start();

      // Record for chunk duration + overlap
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
          // Start next cycle for this recorder after a brief pause
          setTimeout(() => startRecorderLoop(recorder, label), 50);
        }
      }, CHUNK_DURATION + OVERLAP_MS);
    }
  } catch (e) {
    console.error('Recorder error:', e);
  }
}

// Resample audio to target sample rate (Whisper needs 16kHz)
function resampleAudio(audioData, originalSampleRate, targetSampleRate = 16000) {
  if (originalSampleRate === targetSampleRate) {
    return audioData;
  }

  const ratio = originalSampleRate / targetSampleRate;
  const newLength = Math.round(audioData.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, audioData.length - 1);
    const frac = srcIndex - low;
    result[i] = audioData[low] * (1 - frac) + audioData[high] * frac;
  }

  return result;
}

// Send audio to worker for processing
async function processAudio(audioBlob) {
  if (!whisperWorker || !isModelLoaded || !isListening) return;

  try {
    const processStart = performance.now();

    // Decode audio at native sample rate first
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const originalSampleRate = audioBuffer.sampleRate;
    const audioData = audioBuffer.getChannelData(0);
    audioCtx.close();

    // Check audio level before sending
    let sumSquares = 0;
    for (let i = 0; i < audioData.length; i++) {
      sumSquares += audioData[i] * audioData[i];
    }
    const rms = Math.sqrt(sumSquares / audioData.length);

    // Skip very quiet audio
    if (rms < 0.003) return;

    // Resample to 16kHz for Whisper
    const resampled = resampleAudio(audioData, originalSampleRate, 16000);
    const duration = (resampled.length / 16000).toFixed(2);
    const prepTime = (performance.now() - processStart).toFixed(0);

    console.log(`🎤 Audio: ${duration}s, RMS: ${rms.toFixed(3)}, prep: ${prepTime}ms`);

    // Show processing indicator
    const transcriptEl = micIndicator.querySelector('.mic-transcript');
    if (transcriptEl && !transcriptEl.textContent.startsWith('"')) {
      transcriptEl.textContent = 'Processing...';
      transcriptEl.style.color = 'rgba(255, 255, 255, 0.5)';
    }

    // Send to worker (transfer the buffer for zero-copy)
    whisperWorker.postMessage(
      { type: 'transcribe', data: resampled.buffer },
      [resampled.buffer]
    );

  } catch (error) {
    console.error('Audio processing error:', error);
  }
}

function updateTranscriptDisplay(text) {
  const transcriptEl = micIndicator.querySelector('.mic-transcript');
  if (transcriptEl) {
    if (text && text.trim().length > 0) {
      transcriptEl.textContent = `"${text}"`;
      transcriptEl.classList.add('heard');
      // Clear after 4 seconds
      setTimeout(() => {
        if (transcriptEl.textContent === `"${text}"`) {
          setTranscriptListening();
        }
      }, 4000);
    }
  }
}

function setTranscriptListening() {
  const transcriptEl = micIndicator.querySelector('.mic-transcript');
  if (transcriptEl && !transcriptEl.textContent.startsWith('"')) {
    transcriptEl.textContent = isListening ? 'Listening' : 'Muted';
    transcriptEl.style.color = 'rgba(255, 255, 255, 0.6)';
    transcriptEl.classList.remove('heard');
  }
}

function toggleMicrophone(enabled) {
  const toggleCheckbox = document.getElementById('mic-toggle');

  if (enabled) {
    // Enable - start listening
    isListening = true;
    toggleCheckbox.checked = true;
    micIndicator.classList.add('listening');

    // Restart recorders
    recorderA = null;
    recorderB = null;
    chunksA = [];
    chunksB = [];
    startRecordingCycle();

    setTranscriptListening();
  } else {
    // Disable - stop listening
    isListening = false;
    toggleCheckbox.checked = false;
    micIndicator.classList.remove('listening');

    // Stop recorders
    if (recorderA && recorderA.state === 'recording') {
      try { recorderA.stop(); } catch(e) {}
    }
    if (recorderB && recorderB.state === 'recording') {
      try { recorderB.stop(); } catch(e) {}
    }

    const transcriptEl = micIndicator.querySelector('.mic-transcript');
    if (transcriptEl) {
      transcriptEl.textContent = 'Muted';
      transcriptEl.style.color = '#ff6b6b';
    }
  }
}

function checkForLetterMatch(transcription) {
  const text = transcription.toLowerCase().trim().replace(/[.,!?]/g, '');

  // Update transcript display
  if (text && text.length > 0) {
    updateTranscriptDisplay(text);
  }

  // Skip empty or very short meaningless transcriptions
  if (!text || text.length === 0) return;

  // Filter out common Whisper hallucinations on short/quiet audio
  // Anything in brackets or parentheses is a sound effect annotation
  if (/^\s*[\[\(].*[\]\)]\s*$/.test(text)) {
    console.log(`🚫 Filtered sound effect: "${text}"`);
    return;
  }

  const hallucinations = [
    'blank_audio', 'blank audio', 'silence', 'no speech',
    'thank you', 'thanks for watching', 'see you next time',
    'subscribe', 'like and subscribe', 'goodbye'
  ];
  const cleanLower = text.replace(/[\[\]\(\)]/g, '').toLowerCase();
  if (hallucinations.some(h => cleanLower.includes(h))) {
    console.log(`🚫 Filtered hallucination: "${text}"`);
    return;
  }

  // Parse multiple letters from transcription
  const { letters: detectedLetters, phonetic } = parseMultipleLetters(text);

  if (detectedLetters.length > 0) {
    const letterStr = detectedLetters.map(l => l.toUpperCase()).join(', ');
    if (phonetic) {
      console.log(`✅ Heard: "${text}" → Phonetic "${phonetic}" → [${letterStr}]`);
    } else {
      console.log(`✅ Heard: "${text}" → [${letterStr}]`);
    }
    queueLetters(detectedLetters);
  }
}

// Phonetic patterns that Whisper produces for SEQUENTIAL letter sequences only
// (consecutive letters in the alphabet like A-B-C, L-M-N-O-P, etc.)
const phoneticPatterns = {
  // A B C D E F G patterns (sequential)
  'abc': ['a', 'b', 'c'],
  'abcd': ['a', 'b', 'c', 'd'],
  'abcde': ['a', 'b', 'c', 'd', 'e'],
  'abcdef': ['a', 'b', 'c', 'd', 'e', 'f'],
  'abcdefg': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  'abie': ['a', 'b'],
  'abi': ['a', 'b'],
  'abbey': ['a', 'b'],
  'abby': ['a', 'b'],
  'bc': ['b', 'c'],
  'bcd': ['b', 'c', 'd'],
  'bcde': ['b', 'c', 'd', 'e'],

  // C D E patterns (sequential)
  'seedy': ['c', 'd'],
  'cd': ['c', 'd'],
  'cde': ['c', 'd', 'e'],
  'cdef': ['c', 'd', 'e', 'f'],
  'de': ['d', 'e'],
  'def': ['d', 'e', 'f'],
  'defy': ['d', 'e', 'f'],
  'defg': ['d', 'e', 'f', 'g'],

  // E F G patterns (sequential)
  'ef': ['e', 'f'],
  'efg': ['e', 'f', 'g'],
  'effigy': ['f', 'g'],
  'fg': ['f', 'g'],
  'fiji': ['f', 'g'],
  'fgh': ['f', 'g', 'h'],
  'gh': ['g', 'h'],
  'ghi': ['g', 'h', 'i'],

  // H I J K patterns (sequential)
  'hi': ['h', 'i'],
  'high': ['h', 'i'],
  'hij': ['h', 'i', 'j'],
  'hijk': ['h', 'i', 'j', 'k'],
  'hijack': ['h', 'i', 'j', 'k'],
  'ij': ['i', 'j'],
  'ijk': ['i', 'j', 'k'],
  'ijkl': ['i', 'j', 'k', 'l'],
  'jk': ['j', 'k'],
  'jake': ['j', 'k'],
  'jkl': ['j', 'k', 'l'],
  'kl': ['k', 'l'],
  'kale': ['k', 'l'],
  'cale': ['k', 'l'],
  'klm': ['k', 'l', 'm'],

  // L M N O P patterns (the famous fast part! - sequential)
  'lm': ['l', 'm'],
  'ellum': ['l', 'm'],
  'elm': ['l', 'm'],
  'lmn': ['l', 'm', 'n'],
  'element': ['l', 'm', 'n'],
  'elements': ['l', 'm', 'n'],
  'elementary': ['l', 'm', 'n'],
  'lmno': ['l', 'm', 'n', 'o'],
  'elemeno': ['l', 'm', 'n', 'o'],
  'elemental': ['l', 'm', 'n'],
  'lmnop': ['l', 'm', 'n', 'o', 'p'],
  'elemenop': ['l', 'm', 'n', 'o', 'p'],
  'elemenopy': ['l', 'm', 'n', 'o', 'p'],
  'elementy': ['l', 'm', 'n'],
  'mn': ['m', 'n'],
  'emanate': ['m', 'n'],
  'eminem': ['m', 'n'],
  'mno': ['m', 'n', 'o'],
  'mnop': ['m', 'n', 'o', 'p'],
  'no': ['n', 'o'],
  'nope': ['n', 'o', 'p'],
  'nop': ['n', 'o', 'p'],
  'noap': ['n', 'o', 'p'],

  // O P Q R S patterns (sequential)
  'op': ['o', 'p'],
  'opie': ['o', 'p'],
  'opi': ['o', 'p'],
  'opy': ['o', 'p'],
  'opq': ['o', 'p', 'q'],
  'pq': ['p', 'q'],
  'pqr': ['p', 'q', 'r'],
  'pqrs': ['p', 'q', 'r', 's'],
  'qr': ['q', 'r'],
  'qrs': ['q', 'r', 's'],
  'cures': ['q', 'r', 's'],
  'curse': ['q', 'r', 's'],
  'curus': ['q', 'r', 's'],
  'qrst': ['q', 'r', 's', 't'],
  'rs': ['r', 's'],
  'rst': ['r', 's', 't'],
  'rstu': ['r', 's', 't', 'u'],
  'arrest': ['r', 's', 't'],
  'rest': ['r', 's', 't'],
  'st': ['s', 't'],
  'stu': ['s', 't', 'u'],
  'stew': ['s', 't', 'u'],
  'stuv': ['s', 't', 'u', 'v'],

  // T U V W patterns (sequential)
  'tu': ['t', 'u'],
  'tuv': ['t', 'u', 'v'],
  'tuvee': ['t', 'u', 'v'],
  'tuvw': ['t', 'u', 'v', 'w'],
  'uv': ['u', 'v'],
  'uvw': ['u', 'v', 'w'],
  'uvwx': ['u', 'v', 'w', 'x'],
  'vw': ['v', 'w'],
  'vwx': ['v', 'w', 'x'],

  // W X Y Z patterns (sequential)
  'wx': ['w', 'x'],
  'wxy': ['w', 'x', 'y'],
  'wxyz': ['w', 'x', 'y', 'z'],
  'xy': ['x', 'y'],
  'xyz': ['x', 'y', 'z'],
  'exwise': ['x', 'y', 'z'],
  'yz': ['y', 'z'],
  'wise': ['y', 'z'],
  'whysy': ['y', 'z'],
  'wises': ['y', 'z'],
  'whys': ['y', 'z'],
};

// ABC Song tempo map - milliseconds between letters
// The song has different tempos for different sections
const ABC_TEMPO = {
  // Normal tempo letters (about 500ms between)
  normal: 500,
  // Fast section L-M-N-O-P (about 220ms between)
  fast: 220,
  // Held notes (G, P, S, V at end of phrases)
  held: 650,
  // W is slow (3 syllables)
  slow: 700,
  // Final Z
  final: 800,
};

// Get the appropriate delay for displaying a letter based on ABC song timing
// Takes into account what letter comes next for proper phrasing
function getLetterTempo(letter, nextLetter) {
  const l = letter.toLowerCase();
  const next = nextLetter ? nextLetter.toLowerCase() : null;

  // Fast section: L, M, N, O (P ends the phrase so it's held)
  if (['l', 'm', 'n', 'o'].includes(l)) {
    // If next letter continues the fast section, stay fast
    if (next && ['m', 'n', 'o', 'p'].includes(next)) {
      return ABC_TEMPO.fast;
    }
  }

  // Held notes at end of phrases
  if (l === 'g' || l === 'p' || l === 's' || l === 'v') {
    return ABC_TEMPO.held;
  }

  // W is slow (3 syllables: dou-ble-you)
  if (l === 'w') {
    return ABC_TEMPO.slow;
  }

  // Z is the final held note
  if (l === 'z') {
    return ABC_TEMPO.final;
  }

  // Check if we're in a sequential fast run (even if starting mid-sequence)
  if (next) {
    const lCode = l.charCodeAt(0);
    const nextCode = next.charCodeAt(0);
    // If letters are sequential and in LMNOP range
    if (nextCode === lCode + 1 && lCode >= 108 && lCode <= 111) { // l=108, o=111
      return ABC_TEMPO.fast;
    }
  }

  return ABC_TEMPO.normal;
}

// Parse transcription for multiple letter sounds
// Returns { letters: [...], phonetic: string|null }
function parseMultipleLetters(text) {
  let cleanText = text
    .replace(/^(the |a |an |um |uh |oh |ah )/g, '')
    .replace(/(\.|\,|\!|\?)/g, '')
    .trim();

  const detected = [];
  let matchedPhonetic = null;

  // First check for phonetic patterns in the full text
  const lowerText = cleanText.toLowerCase();
  for (const [pattern, letters] of Object.entries(phoneticPatterns)) {
    if (lowerText === pattern || lowerText.includes(pattern)) {
      // Replace the pattern with spaces so we process the letters
      detected.push(...letters);
      matchedPhonetic = pattern;
      cleanText = cleanText.toLowerCase().replace(pattern, '').trim();
      if (cleanText.length === 0) return { letters: detected, phonetic: matchedPhonetic };
    }
  }

  // Split by spaces first to handle word-separated input
  const words = cleanText.split(/[\s,.-]+/).filter(w => w.length > 0);

  for (const word of words) {
    // Check if entire word is just concatenated letters (e.g., "abc", "abcd")
    if (/^[a-z]+$/.test(word) && word.length >= 2 && word.length <= 6) {
      // Check if it looks like concatenated single letters
      // These are common concatenations Whisper produces
      const allSingleLetters = word.split('').every(c => /[a-z]/.test(c));
      if (allSingleLetters && !isCommonWord(word)) {
        // Split into individual letters
        for (const char of word) {
          detected.push(char);
        }
        continue;
      }
    }

    // Try to match against letter name variations
    let foundMatch = false;
    for (const [letter, variations] of Object.entries(letterNames)) {
      for (const variation of variations) {
        if (word === variation) {
          detected.push(letter);
          foundMatch = true;
          break;
        }
      }
      if (foundMatch) break;
    }

    // If no variation match, check if it's a single letter
    if (!foundMatch && word.length === 1 && /[a-z]/.test(word)) {
      detected.push(word);
    }

    // Check for partial matches at start of word (e.g., "abc" -> a, b, c)
    if (!foundMatch && word.length > 1) {
      let remaining = word;
      while (remaining.length > 0) {
        let matched = false;

        // First try longer letter name matches
        for (const [letter, variations] of Object.entries(letterNames)) {
          for (const variation of variations) {
            if (remaining.startsWith(variation) && variation.length > 1) {
              detected.push(letter);
              remaining = remaining.slice(variation.length);
              matched = true;
              break;
            }
          }
          if (matched) break;
        }

        // If no match, take single character if it's a letter
        if (!matched) {
          if (/^[a-z]/.test(remaining)) {
            detected.push(remaining[0]);
            remaining = remaining.slice(1);
          } else {
            break; // Unknown character, stop
          }
        }
      }
    }
  }

  return { letters: detected, phonetic: matchedPhonetic };
}

// Common English words that shouldn't be split into letters
function isCommonWord(word) {
  const commonWords = [
    'be', 'he', 'we', 'me', 'no', 'so', 'go', 'do', 'to', 'of', 'or', 'an', 'as', 'at', 'by', 'if', 'in', 'is', 'it', 'my', 'on', 'up', 'us',
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'let', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'own', 'say', 'she', 'too', 'use',
    'have', 'been', 'call', 'come', 'each', 'find', 'from', 'give', 'good', 'here', 'just', 'know', 'like', 'look', 'make', 'more', 'much', 'over', 'part', 'some', 'such', 'take', 'than', 'that', 'them', 'then', 'they', 'this', 'time', 'very', 'want', 'well', 'were', 'what', 'when', 'will', 'with', 'word', 'work', 'yeah', 'your',
    'gene', 'key', 'sea', 'see', 'bee', 'tea', 'pea', 'hey', 'hay', 'day', 'way', 'say', 'pay', 'may', 'lay', 'jay', 'ray'
  ];
  return commonWords.includes(word.toLowerCase());
}

// Queue letters and display them one at a time with proper ABC song tempo
function queueLetters(letters) {
  // Store the full sequence for tempo calculation
  const sequence = letters.map(l => l.toLowerCase());

  // Add letters with their sequence context
  for (let i = 0; i < letters.length; i++) {
    letterQueue.push({
      letter: letters[i],
      nextInSequence: i < letters.length - 1 ? letters[i + 1] : null,
      isSequence: letters.length > 1
    });
  }

  processLetterQueue();
}

function processLetterQueue() {
  if (isDisplayingQueue || letterQueue.length === 0) return;

  isDisplayingQueue = true;
  const item = letterQueue.shift();
  const letter = typeof item === 'string' ? item : item.letter;
  const nextInSequence = typeof item === 'object' ? item.nextInSequence : null;
  const isSequence = typeof item === 'object' ? item.isSequence : false;

  // Deduplicate - skip if same letter was shown recently (but allow in sequences)
  if (!isSequence && isDuplicateLetter(letter)) {
    console.log(`🔄 Skipped duplicate: "${letter.toUpperCase()}"`);
    isDisplayingQueue = false;
    processLetterQueue(); // Try next letter immediately
    return;
  }

  markLetterShown(letter);

  const wasCurrentLetter = currentLetter && letter.toLowerCase() === currentLetter.toLowerCase();
  showLetter(letter);

  // If it matches previous letter, trigger celebration
  if (wasCurrentLetter) {
    setTimeout(triggerCelebration, 600);
  }

  // Calculate delay based on ABC song tempo
  const nextItem = letterQueue.length > 0 ? letterQueue[0] : null;
  const nextLetter = nextItem ? (typeof nextItem === 'string' ? nextItem : nextItem.letter) : null;

  // Use sequence context if available, otherwise check next in queue
  const tempoNextLetter = nextInSequence || nextLetter;
  const delay = getLetterTempo(letter, tempoNextLetter);

  // Log tempo for debugging
  if (isSequence) {
    const tempoType = delay === ABC_TEMPO.fast ? '⚡fast' :
                      delay === ABC_TEMPO.held ? '🎵held' :
                      delay === ABC_TEMPO.slow ? '🐢slow' : '▶️normal';
    console.log(`🎶 Tempo: ${letter.toUpperCase()} → ${tempoNextLetter ? tempoNextLetter.toUpperCase() : 'end'} = ${delay}ms (${tempoType})`);
  }

  // Process next letter after tempo-based delay
  setTimeout(() => {
    isDisplayingQueue = false;
    processLetterQueue();
  }, delay);
}

// ============================================
// Audio System
// ============================================
function initAudio() {
  if (audioContext) return;
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
}

// Play a single tone with harmonics
function playSingleNote(freq, duration, startTime) {
  if (!audioContext) return;

  const time = startTime || audioContext.currentTime;

  // Create main oscillator with bell-like tone
  const osc = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, time);

  gainNode.gain.setValueAtTime(0, time);
  gainNode.gain.linearRampToValueAtTime(0.35, time + 0.03);
  gainNode.gain.exponentialRampToValueAtTime(0.01, time + duration);

  osc.connect(gainNode);
  gainNode.connect(audioContext.destination);

  osc.start(time);
  osc.stop(time + duration);

  // Octave harmonic
  const osc2 = audioContext.createOscillator();
  const gain2 = audioContext.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2, time);
  gain2.gain.setValueAtTime(0, time);
  gain2.gain.linearRampToValueAtTime(0.15, time + 0.02);
  gain2.gain.exponentialRampToValueAtTime(0.01, time + duration * 0.7);

  osc2.connect(gain2);
  gain2.connect(audioContext.destination);
  osc2.start(time);
  osc2.stop(time + duration * 0.7);

  // Fifth harmonic for shimmer
  const osc3 = audioContext.createOscillator();
  const gain3 = audioContext.createGain();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(freq * 1.5, time);
  gain3.gain.setValueAtTime(0, time);
  gain3.gain.linearRampToValueAtTime(0.08, time + 0.02);
  gain3.gain.exponentialRampToValueAtTime(0.01, time + duration * 0.5);

  osc3.connect(gain3);
  gain3.connect(audioContext.destination);
  osc3.start(time);
  osc3.stop(time + duration * 0.5);
}

function playNote(char) {
  if (!audioContext) return;

  const noteData = abcSongNotes[char.toLowerCase()] || { freq: 440, duration: 0.4 };

  // Handle multi-syllable letters (like W = "double-you")
  if (noteData.multi && noteData.notes) {
    let time = audioContext.currentTime;
    const gap = 0.05; // 50ms pause between syllables
    for (const note of noteData.notes) {
      playSingleNote(note.freq, note.duration, time);
      time += note.duration + gap;
    }
    return;
  }

  // Single note
  playSingleNote(noteData.freq, noteData.duration);
}

function playCelebrationSound() {
  if (!audioContext) return;

  // Play a happy arpeggio
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C, E, G, C

  notes.forEach((freq, i) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.1);

    gain.gain.setValueAtTime(0, audioContext.currentTime + i * 0.1);
    gain.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + i * 0.1 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.1 + 0.5);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start(audioContext.currentTime + i * 0.1);
    osc.stop(audioContext.currentTime + i * 0.1 + 0.5);
  });
}

// ============================================
// Celebration Effects
// ============================================
function triggerCelebration() {
  // Animate the letter container
  const letterEl = letterDisplay.querySelector('.letter-container');
  if (letterEl) {
    letterEl.classList.add('celebrate');
    setTimeout(() => letterEl.classList.remove('celebrate'), 1500);
  }

  // Play celebration sound
  playCelebrationSound();

  // Create confetti
  createConfetti();

  // Create star burst
  createStarBurst();

  // Create rainbow rings
  for (let i = 0; i < 3; i++) {
    setTimeout(() => createRainbowRing(), i * 200);
  }

  // Show success text
  showSuccessText();
}

function createConfetti() {
  const confettiColors = ['#ff6b6b', '#feca57', '#1dd1a1', '#48dbfb', '#a55eea', '#fd79a8'];
  const shapes = ['circle', 'square', 'triangle'];

  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';

    const color = confettiColors[Math.floor(Math.random() * confettiColors.length)];
    confetti.style.backgroundColor = color;
    confetti.style.left = `${Math.random() * 100}%`;
    confetti.style.top = '-20px';
    confetti.style.animationDelay = `${Math.random() * 0.5}s`;
    confetti.style.animationDuration = `${2 + Math.random() * 2}s`;

    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    if (shape === 'triangle') {
      confetti.style.width = '0';
      confetti.style.height = '0';
      confetti.style.backgroundColor = 'transparent';
      confetti.style.borderLeft = '6px solid transparent';
      confetti.style.borderRight = '6px solid transparent';
      confetti.style.borderBottom = `12px solid ${color}`;
    } else if (shape === 'circle') {
      confetti.style.borderRadius = '50%';
    }

    celebrationOverlay.appendChild(confetti);
    setTimeout(() => confetti.remove(), 3000);
  }
}

function createStarBurst() {
  const burst = document.createElement('div');
  burst.className = 'star-burst';

  const starEmojis = ['⭐', '✨', '🌟', '💫', '⚡'];
  const count = 12;

  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    star.textContent = starEmojis[Math.floor(Math.random() * starEmojis.length)];

    const angle = (Math.PI * 2 * i) / count;
    const distance = 150 + Math.random() * 100;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;

    star.style.setProperty('--tx', `${tx}px`);
    star.style.setProperty('--ty', `${ty}px`);

    burst.appendChild(star);
  }

  celebrationOverlay.appendChild(burst);
  setTimeout(() => burst.remove(), 1000);
}

function createRainbowRing() {
  const ring = document.createElement('div');
  ring.className = 'rainbow-ring';
  celebrationOverlay.appendChild(ring);
  setTimeout(() => ring.remove(), 1000);
}

function showSuccessText() {
  const phrases = ['Amazing!', 'Great Job!', 'Wow!', 'Super!', 'Yay!', 'Perfect!', 'Awesome!'];
  const text = document.createElement('div');
  text.className = 'success-text';
  text.textContent = phrases[Math.floor(Math.random() * phrases.length)];
  app.appendChild(text);
  setTimeout(() => text.remove(), 1500);
}

// ============================================
// Shortcut Blocking
// ============================================
function blockShortcuts(e) {
  // Block common shortcuts that could disrupt the game
  const blockedKeys = [
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
    'Tab', 'Escape', 'Meta', 'Alt', 'Control'
  ];

  // Block if it's a function key or modifier combo
  if (blockedKeys.includes(e.key)) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }

  // Block Ctrl/Cmd combinations
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }

  // Block Alt combinations
  if (e.altKey) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }

  return true;
}

// ============================================
// Letter Display
// ============================================
function showLetter(char) {
  // Use marquee animation system
  selectMarqueeLetter(char.toLowerCase());
}

// ============================================
// Particles
// ============================================
function createParticles(char, color) {
  const count = 8 + Math.floor(Math.random() * 8);

  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.textContent = char.toUpperCase();
    particle.style.color = color;
    particle.style.left = '50%';
    particle.style.top = '50%';

    // Random trajectory
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const distance = 200 + Math.random() * 300;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    const rot = (Math.random() - 0.5) * 720;

    particle.style.setProperty('--tx', `${tx}px`);
    particle.style.setProperty('--ty', `${ty}px`);
    particle.style.setProperty('--rot', `${rot}deg`);

    particlesContainer.appendChild(particle);

    // Clean up
    setTimeout(() => particle.remove(), 1500);
  }
}

function createSparkle(color) {
  const sparkle = document.createElement('div');
  sparkle.className = 'sparkle';
  sparkle.style.backgroundColor = color;
  sparkle.style.left = `${Math.random() * 100}%`;
  sparkle.style.top = `${Math.random() * 100}%`;
  sparkle.style.width = `${10 + Math.random() * 20}px`;
  sparkle.style.height = sparkle.style.width;
  sparkle.style.boxShadow = `0 0 ${10 + Math.random() * 10}px ${color}`;

  particlesContainer.appendChild(sparkle);
  setTimeout(() => sparkle.remove(), 800);
}

// ============================================
// Mouse Trail
// ============================================
function resizeCanvas() {
  trailCanvas.width = window.innerWidth * window.devicePixelRatio;
  trailCanvas.height = window.innerHeight * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

// Trail color state - changes slowly
let currentTrailColor = colors[0];
let trailColorIndex = 0;
let trailColorTimer = 0;

function updateTrail() {
  // Change color slowly (every 60 frames = ~1 second)
  trailColorTimer++;
  if (trailColorTimer > 60) {
    trailColorTimer = 0;
    trailColorIndex = (trailColorIndex + 1) % colors.length;
    currentTrailColor = colors[trailColorIndex];
  }

  // Add current mouse position with consistent color
  trailPoints.push({
    x: mouseX,
    y: mouseY,
    color: currentTrailColor,
    size: 12,
    life: 1
  });

  // Limit trail length
  if (trailPoints.length > 30) {
    trailPoints.shift();
  }

  // Clear canvas with fade effect
  ctx.fillStyle = 'rgba(26, 26, 46, 0.1)';
  ctx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);

  // Draw simple circles for trail
  trailPoints.forEach((point) => {
    point.life -= 0.03;

    if (point.life > 0) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.size * point.life, 0, Math.PI * 2);
      ctx.fillStyle = point.color;
      ctx.globalAlpha = point.life * 0.6;
      ctx.fill();
    }
  });

  ctx.globalAlpha = 1;

  // Remove dead points
  trailPoints = trailPoints.filter(p => p.life > 0);

  requestAnimationFrame(updateTrail);
}

// ============================================
// Background Shapes
// ============================================
function initBackgroundShapes() {
  // Create initial shapes
  for (let i = 0; i < MAX_SHAPES; i++) {
    backgroundShapes.push(createShape());
  }
  // Start animation loop
  requestAnimationFrame(updateBackgroundShapes);
}

function createShape() {
  return {
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    vx: (Math.random() - 0.5) * 0.5,
    vy: (Math.random() - 0.5) * 0.5,
    size: 15 + Math.random() * 25,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 0.5,
    type: shapeTypes[Math.floor(Math.random() * shapeTypes.length)],
    color: colors[Math.floor(Math.random() * colors.length)],
    opacity: 0.1 + Math.random() * 0.15,
    targetX: null,
    targetY: null
  };
}

function drawShape(shape) {
  ctx.save();
  ctx.translate(shape.x, shape.y);
  ctx.rotate(shape.rotation * Math.PI / 180);
  ctx.globalAlpha = shape.opacity;
  ctx.fillStyle = shape.color;
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = 2;

  const s = shape.size;

  switch (shape.type) {
    case 'heart':
      ctx.beginPath();
      ctx.moveTo(0, s * 0.3);
      ctx.bezierCurveTo(-s * 0.5, -s * 0.3, -s, s * 0.3, 0, s);
      ctx.bezierCurveTo(s, s * 0.3, s * 0.5, -s * 0.3, 0, s * 0.3);
      ctx.fill();
      break;
    case 'star':
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const x = Math.cos(angle) * s;
        const y = Math.sin(angle) * s;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(-s * 0.866, s * 0.5);
      ctx.lineTo(s * 0.866, s * 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'circle':
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.6, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.6, 0);
      ctx.closePath();
      ctx.fill();
      break;
  }

  ctx.restore();
}

function updateBackgroundShapes() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  // Draw shapes (trail canvas handles clearing)
  backgroundShapes.forEach(shape => {
    // Random walk - occasionally add random velocity
    if (Math.random() < 0.02) {
      shape.vx += (Math.random() - 0.5) * 0.8;
      shape.vy += (Math.random() - 0.5) * 0.8;
    }

    // Apply velocity
    shape.x += shape.vx;
    shape.y += shape.vy;
    shape.rotation += shape.rotationSpeed;

    // Gentle attraction to mouse (only when mouse has moved)
    if (mouseX > 0 && mouseY > 0) {
      const dx = mouseX - shape.x;
      const dy = mouseY - shape.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 250 && dist > 20) {
        shape.vx += (dx / dist) * 0.015;
        shape.vy += (dy / dist) * 0.015;
      }
    }

    // Light damping (keep movement going)
    shape.vx *= 0.995;
    shape.vy *= 0.995;

    // Ensure minimum velocity (keep things moving)
    const speed = Math.sqrt(shape.vx * shape.vx + shape.vy * shape.vy);
    if (speed < 0.3) {
      const angle = Math.random() * Math.PI * 2;
      shape.vx = Math.cos(angle) * 0.5;
      shape.vy = Math.sin(angle) * 0.5;
    }

    // Limit max speed
    if (speed > 3) {
      shape.vx = (shape.vx / speed) * 3;
      shape.vy = (shape.vy / speed) * 3;
    }

    // Soft bounce off edges with padding
    const padding = 60;
    if (shape.x < padding) {
      shape.x = padding;
      shape.vx = Math.abs(shape.vx) * 0.8 + 0.3;
    }
    if (shape.x > w - padding) {
      shape.x = w - padding;
      shape.vx = -Math.abs(shape.vx) * 0.8 - 0.3;
    }
    if (shape.y < padding) {
      shape.y = padding;
      shape.vy = Math.abs(shape.vy) * 0.8 + 0.3;
    }
    if (shape.y > h - padding) {
      shape.y = h - padding;
      shape.vy = -Math.abs(shape.vy) * 0.8 - 0.3;
    }

    // Draw the shape
    drawShape(shape);
  });

  requestAnimationFrame(updateBackgroundShapes);
}

function onLetterChange(color) {
  // React to letter changes - briefly brighten shapes and give them a little push
  backgroundShapes.forEach(shape => {
    // Small chance to change color to match the letter
    if (Math.random() < 0.3) {
      shape.color = color;
    }
    // Give a little outward push
    const dx = shape.x - window.innerWidth / 2;
    const dy = shape.y - window.innerHeight / 2;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    shape.vx += (dx / dist) * 1;
    shape.vy += (dy / dist) * 1;
    // Brief opacity boost
    shape.opacity = Math.min(0.4, shape.opacity + 0.1);
    setTimeout(() => {
      shape.opacity = 0.1 + Math.random() * 0.15;
    }, 500);
  });
}

// ============================================
// Marquee System
// ============================================
const marqueeUpper = document.getElementById('marquee-upper');
const marqueeLower = document.getElementById('marquee-lower');

// Track current displayed letters for lerping back
let currentFlyingUpper = null;
let currentFlyingLower = null;
let currentDisplayColor = null;

// Animation state for smooth lerping
let activeAnimations = [];
let animationLoopRunning = false;

const LETTER_BOX_WIDTH = 50;
const LERP_SPEED = 0.08; // Smooth lerp factor (lower = smoother but slower)

function initMarquee() {
  // Create letters for both rows (quadruple for seamless loop)
  const letters = ALPHABET + ALPHABET + ALPHABET + ALPHABET;

  letters.split('').forEach((letter) => {
    // Uppercase row (top)
    const upperEl = document.createElement('span');
    upperEl.className = 'marquee-letter';
    upperEl.textContent = letter;
    upperEl.dataset.letter = letter.toLowerCase();
    upperEl.addEventListener('click', (e) => {
      e.stopPropagation();
      selectMarqueeLetter(letter.toLowerCase());
    });
    marqueeUpper.appendChild(upperEl);

    // Lowercase row (bottom)
    const lowerEl = document.createElement('span');
    lowerEl.className = 'marquee-letter';
    lowerEl.textContent = letter.toLowerCase();
    lowerEl.dataset.letter = letter.toLowerCase();
    lowerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      selectMarqueeLetter(letter.toLowerCase());
    });
    marqueeLower.appendChild(lowerEl);
  });

  // Start animation
  animateMarquee();
}

function animateMarquee() {
  marqueeOffset -= MARQUEE_SPEED;

  const resetPoint = LETTER_BOX_WIDTH * 26; // One alphabet length

  if (Math.abs(marqueeOffset) >= resetPoint) {
    marqueeOffset += resetPoint;
  }

  marqueeUpper.style.transform = `translateX(${marqueeOffset}px)`;
  marqueeLower.style.transform = `translateX(${marqueeOffset}px)`;

  requestAnimationFrame(animateMarquee);
}

function selectMarqueeLetter(letter) {
  if (!isStarted) {
    startGame();
  }

  const color = colors[Math.floor(Math.random() * colors.length)];

  // Cancel any existing animations and clean up old letters
  cancelAllAnimations();
  removeOldFlyingLetters();

  // Find visible letter elements
  const screenWidth = window.innerWidth;
  let visibleUpper = findVisibleLetter(marqueeUpper, letter, screenWidth);
  let visibleLower = findVisibleLetter(marqueeLower, letter, screenWidth);

  // Animate new letters to center
  animateLetterToCenter(letter, color, visibleUpper, visibleLower);

  // Play sound
  playNote(letter);

  // Highlight in marquee
  highlightMarqueeLetter(letter, color);
}

function findVisibleLetter(container, letter, screenWidth) {
  const letters = container.querySelectorAll(`[data-letter="${letter}"]`);
  let best = null;
  let bestDist = Infinity;

  letters.forEach(el => {
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    if (centerX > 0 && centerX < screenWidth) {
      const dist = Math.abs(centerX - screenWidth / 2);
      if (dist < bestDist) {
        bestDist = dist;
        best = el;
      }
    }
  });

  return best;
}

// Smooth lerp helper
function lerp(start, end, t) {
  return start + (end - start) * t;
}

// Animation object for smooth lerping
function createLerpAnimation(element, target, onComplete) {
  return {
    element,
    current: {
      x: parseFloat(element.style.left) || 0,
      y: parseFloat(element.style.top) || 0,
      size: parseFloat(element.style.fontSize) || 36,
      opacity: parseFloat(element.style.opacity) || 1
    },
    target,
    onComplete,
    done: false
  };
}

// Main animation loop for all lerping elements
function runAnimations() {
  const stillAnimating = [];

  for (const anim of activeAnimations) {
    if (anim.done) continue;

    // Lerp all properties
    anim.current.x = lerp(anim.current.x, anim.target.x, LERP_SPEED);
    anim.current.y = lerp(anim.current.y, anim.target.y, LERP_SPEED);
    anim.current.size = lerp(anim.current.size, anim.target.size, LERP_SPEED);
    anim.current.opacity = lerp(anim.current.opacity, anim.target.opacity, LERP_SPEED);

    // Apply using transform for GPU acceleration
    anim.element.style.transform = `translate(${anim.current.x}px, ${anim.current.y}px)`;
    anim.element.style.fontSize = `${anim.current.size}px`;
    anim.element.style.opacity = anim.current.opacity;

    // Check if close enough to target
    const dx = Math.abs(anim.current.x - anim.target.x);
    const dy = Math.abs(anim.current.y - anim.target.y);
    const ds = Math.abs(anim.current.size - anim.target.size);
    const dop = Math.abs(anim.current.opacity - anim.target.opacity);

    if (dx < 0.5 && dy < 0.5 && ds < 0.5 && dop < 0.01) {
      anim.done = true;
      if (anim.onComplete) anim.onComplete();
    } else {
      stillAnimating.push(anim);
    }
  }

  activeAnimations = stillAnimating;

  if (activeAnimations.length > 0) {
    requestAnimationFrame(runAnimations);
  } else {
    animationLoopRunning = false;
  }
}

function startAnimationLoop() {
  if (!animationLoopRunning && activeAnimations.length > 0) {
    animationLoopRunning = true;
    requestAnimationFrame(runAnimations);
  }
}

// Cancel all animations and immediately clean up
function cancelAllAnimations() {
  // Mark all animations as done and run their cleanup
  for (const anim of activeAnimations) {
    if (!anim.done && anim.onComplete) {
      anim.onComplete();
    }
    anim.done = true;
  }
  activeAnimations = [];
}

// Immediately remove old flying letters without animation
function removeOldFlyingLetters() {
  if (currentFlyingUpper) {
    currentFlyingUpper.remove();
    currentFlyingUpper = null;
  }
  if (currentFlyingLower) {
    currentFlyingLower.remove();
    currentFlyingLower = null;
  }
}

function lerpOldLettersBack() {
  if (currentFlyingUpper) {
    const oldUpper = currentFlyingUpper;
    const oldLower = currentFlyingLower;
    const oldLetter = oldUpper.dataset.letter;

    // Find target positions in marquee
    const upperTarget = findVisibleLetter(marqueeUpper, oldLetter, window.innerWidth);
    const lowerTarget = findVisibleLetter(marqueeLower, oldLetter, window.innerWidth);

    // Calculate target for upper
    let upperTargetPos;
    if (upperTarget) {
      const rect = upperTarget.getBoundingClientRect();
      upperTargetPos = { x: rect.left + rect.width / 2 - 18, y: rect.top, size: 36, opacity: 0 };
    } else {
      const goLeft = Math.random() > 0.5;
      upperTargetPos = { x: goLeft ? -100 : window.innerWidth + 100, y: parseFloat(oldUpper.style.transform?.match(/translate\(([^,]+)/)?.[1]) || 0, size: 36, opacity: 0 };
    }

    // Calculate target for lower
    let lowerTargetPos;
    if (lowerTarget) {
      const rect = lowerTarget.getBoundingClientRect();
      lowerTargetPos = { x: rect.left + rect.width / 2 - 18, y: rect.top, size: 36, opacity: 0 };
    } else {
      const goLeft = Math.random() > 0.5;
      lowerTargetPos = { x: goLeft ? -100 : window.innerWidth + 100, y: parseFloat(oldLower.style.transform?.match(/translate\(([^,]+)/)?.[1]) || 0, size: 36, opacity: 0 };
    }

    // Get current positions from transform
    const upperMatch = oldUpper.style.transform?.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
    const lowerMatch = oldLower.style.transform?.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);

    const upperAnim = createLerpAnimation(oldUpper, upperTargetPos, () => oldUpper.remove());
    if (upperMatch) {
      upperAnim.current.x = parseFloat(upperMatch[1]);
      upperAnim.current.y = parseFloat(upperMatch[2]);
    }
    upperAnim.current.size = parseFloat(oldUpper.style.fontSize) || 36;
    upperAnim.current.opacity = parseFloat(oldUpper.style.opacity) || 1;

    const lowerAnim = createLerpAnimation(oldLower, lowerTargetPos, () => oldLower.remove());
    if (lowerMatch) {
      lowerAnim.current.x = parseFloat(lowerMatch[1]);
      lowerAnim.current.y = parseFloat(lowerMatch[2]);
    }
    lowerAnim.current.size = parseFloat(oldLower.style.fontSize) || 36;
    lowerAnim.current.opacity = parseFloat(oldLower.style.opacity) || 1;

    activeAnimations.push(upperAnim, lowerAnim);
    startAnimationLoop();

    currentFlyingUpper = null;
    currentFlyingLower = null;
  }

  // Clear letter display
  const existing = letterDisplay.querySelector('.letter-container');
  if (existing) {
    existing.remove();
  }
}

function animateLetterToCenter(letter, color, upperSource, lowerSource) {
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  // Target sizes
  const upperTargetSize = Math.min(450, window.innerWidth * 0.38);
  const lowerTargetSize = Math.min(360, window.innerWidth * 0.30);
  const gap = Math.min(80, window.innerWidth * 0.06); // Increased gap between letters

  // Create flying upper letter
  const flyingUpper = document.createElement('div');
  flyingUpper.className = 'flying-letter';
  flyingUpper.textContent = letter.toUpperCase();
  flyingUpper.dataset.letter = letter.toLowerCase();
  flyingUpper.style.color = color;
  flyingUpper.style.left = '0px';
  flyingUpper.style.top = '0px';

  // Create flying lower letter
  const flyingLower = document.createElement('div');
  flyingLower.className = 'flying-letter';
  flyingLower.textContent = letter.toLowerCase();
  flyingLower.dataset.letter = letter.toLowerCase();
  flyingLower.style.color = color;
  flyingLower.style.left = '0px';
  flyingLower.style.top = '0px';

  // Calculate starting positions
  let upperStartX, upperStartY, lowerStartX, lowerStartY;

  if (upperSource) {
    const rect = upperSource.getBoundingClientRect();
    upperStartX = rect.left + rect.width / 2 - 18;
    upperStartY = rect.top;
  } else {
    const fromLeft = Math.random() > 0.5;
    upperStartX = fromLeft ? -80 : window.innerWidth + 80;
    upperStartY = centerY - upperTargetSize / 3;
  }

  if (lowerSource) {
    const rect = lowerSource.getBoundingClientRect();
    lowerStartX = rect.left + rect.width / 2 - 18;
    lowerStartY = rect.top;
  } else {
    const fromLeft = Math.random() > 0.5;
    lowerStartX = fromLeft ? -80 : window.innerWidth + 80;
    lowerStartY = centerY + gap;
  }

  // Set initial transform position
  flyingUpper.style.transform = `translate(${upperStartX}px, ${upperStartY}px)`;
  flyingUpper.style.fontSize = '36px';
  flyingUpper.style.opacity = '0.4';

  flyingLower.style.transform = `translate(${lowerStartX}px, ${lowerStartY}px)`;
  flyingLower.style.fontSize = '36px';
  flyingLower.style.opacity = '0.4';

  document.body.appendChild(flyingUpper);
  document.body.appendChild(flyingLower);

  // Calculate final positions (side by side, centered)
  const totalWidth = upperTargetSize * 0.55 + lowerTargetSize * 0.45 + gap;
  const upperFinalX = centerX - totalWidth / 2;
  const lowerFinalX = upperFinalX + upperTargetSize * 0.55 + gap;
  // Vertically center the letter pair
  // Use half font size to center the letter box, then adjust for visual weight
  // Letters sit above baseline, so multiply by ~0.4 to center visually
  const finalY = centerY - upperTargetSize * 0.4;

  // Create lerp animations for incoming letters
  const upperAnim = createLerpAnimation(flyingUpper, {
    x: upperFinalX,
    y: finalY,
    size: upperTargetSize,
    opacity: 1
  });
  upperAnim.current = { x: upperStartX, y: upperStartY, size: 36, opacity: 0.4 };
  upperAnim.color = color;
  upperAnim.isIncoming = true;

  // Align baselines: lower letter positioned so baselines match
  const baselineOffset = (upperTargetSize - lowerTargetSize) * 0.72;
  const lowerAnim = createLerpAnimation(flyingLower, {
    x: lowerFinalX,
    y: finalY + baselineOffset,
    size: lowerTargetSize,
    opacity: 0.85
  });
  lowerAnim.current = { x: lowerStartX, y: lowerStartY, size: 36, opacity: 0.4 };
  lowerAnim.color = color;
  lowerAnim.isIncoming = true;

  activeAnimations.push(upperAnim, lowerAnim);
  startAnimationLoop();

  // Store references for lerping back later
  currentFlyingUpper = flyingUpper;
  currentFlyingLower = flyingLower;
  currentDisplayColor = color;
  currentLetter = letter;

  // Notify background shapes
  onLetterChange(color);

  // Create particles and sparkles
  createParticles(letter, color);
  for (let i = 0; i < 15; i++) {
    setTimeout(() => createSparkle(color), i * 60);
  }
}

function highlightMarqueeLetter(letter, color) {
  // Remove previous highlights
  document.querySelectorAll('.marquee-letter.active').forEach(el => {
    el.classList.remove('active');
    el.style.removeProperty('--active-color');
  });

  // Add new highlights
  document.querySelectorAll(`.marquee-letter[data-letter="${letter}"]`).forEach(el => {
    el.classList.add('active');
    el.style.setProperty('--active-color', color);
  });
}

// ============================================
// Background Floating Letters
// ============================================
function createBackgroundLetter() {
  const letter = document.createElement('div');
  letter.className = 'bg-letter';
  letter.textContent = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  letter.style.left = `${Math.random() * 100}%`;
  letter.style.animationDuration = `${15 + Math.random() * 15}s`;
  letter.style.animationDelay = `${Math.random() * 5}s`;

  app.appendChild(letter);

  // Remove after animation
  setTimeout(() => letter.remove(), 30000);
}


// ============================================
// Start Game
// ============================================
function startGame() {
  if (isStarted) return;
  isStarted = true;

  initAudio();
  startScreen.classList.add('hidden');

  // Request fullscreen
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {
      // Fullscreen not available, continue anyway
    });
  }

  // Load Whisper model in background
  loadWhisperModel();
}

// ============================================
// Event Handlers
// ============================================
function handleKeyDown(e) {
  // Block shortcuts first
  if (!blockShortcuts(e)) {
    return;
  }

  // Start game on first key
  if (!isStarted) {
    startGame();
  }

  // Only process letter and number keys
  const char = e.key;
  if (/^[a-zA-Z]$/.test(char)) {
    e.preventDefault();
    showLetter(char);
    // playNote is called by selectMarqueeLetter
  }
}

function handleMouseMove(e) {
  mouseX = e.clientX;
  mouseY = e.clientY;
}

function getNextLetter(current) {
  if (!current) return 'a';
  const index = ALPHABET.toLowerCase().indexOf(current.toLowerCase());
  if (index === -1) return 'a';
  return ALPHABET[(index + 1) % 26].toLowerCase();
}

function handleClick(e) {
  if (!isStarted) {
    startGame();
    return;
  }

  // Go to next letter (A->B->C...Z->A)
  const nextChar = getNextLetter(currentLetter);
  selectMarqueeLetter(nextChar);
}


// ============================================
// Initialization
// ============================================
function init() {
  // Setup canvas
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Block shortcuts
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keyup', (e) => e.preventDefault(), true);

  // Mouse events
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('click', handleClick);

  // Touch events for tablets
  document.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!isStarted) {
      startGame();
      return;
    }
    // Go to next letter (A->B->C...Z->A)
    const nextChar = getNextLetter(currentLetter);
    selectMarqueeLetter(nextChar);
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches[0]) {
      mouseX = e.touches[0].clientX;
      mouseY = e.touches[0].clientY;
    }
  }, { passive: false });

  // Prevent page navigation
  window.addEventListener('beforeunload', (e) => {
    if (isStarted) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Block drag events
  document.addEventListener('dragstart', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());

  // Start trail animation
  updateTrail();

  // Initialize background shapes
  initBackgroundShapes();

  // Initialize marquee
  initMarquee();

  // Model selector on splash screen
  const modelOptions = document.querySelectorAll('.model-option');
  modelOptions.forEach(option => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      // Update selection
      modelOptions.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      selectedModel = option.dataset.model;
    });
  });

  // Mic toggle switch
  const micToggle = document.getElementById('mic-toggle');
  if (micToggle) {
    micToggle.addEventListener('change', (e) => {
      e.stopPropagation();
      if (isModelLoaded) {
        toggleMicrophone(e.target.checked);
      } else {
        // Model not loaded yet, revert the toggle
        e.target.checked = false;
      }
    });
  }

  // Create background letters periodically
  setInterval(createBackgroundLetter, 3000);
  for (let i = 0; i < 5; i++) {
    setTimeout(createBackgroundLetter, i * 500);
  }

  // Handle visibility change (tab switching)
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
      // Tab hidden - pause audio
      if (audioContext) audioContext.suspend();
      if (levelAudioContext) levelAudioContext.suspend();
      // Stop recorders cleanly
      if (recorderA && recorderA.state === 'recording') {
        try { recorderA.stop(); } catch(e) {}
      }
      if (recorderB && recorderB.state === 'recording') {
        try { recorderB.stop(); } catch(e) {}
      }
    } else {
      // Tab visible - resume audio
      if (audioContext) audioContext.resume();
      if (levelAudioContext) levelAudioContext.resume();

      // Check if mic stream is still active
      if (isListening && micStream) {
        const tracks = micStream.getAudioTracks();
        const streamActive = tracks.length > 0 && tracks[0].readyState === 'live';

        if (!streamActive) {
          // Mic stream died, need to restart everything
          console.log('Mic stream died, restarting...');
          isListening = false;
          recorderA = null;
          recorderB = null;
          // Re-acquire mic and restart
          if (isModelLoaded) {
            startMicrophoneListening();
          }
        } else {
          // Stream still active, just restart recorders
          recorderA = null;
          recorderB = null;
          chunksA = [];
          chunksB = [];
          setTimeout(startRecordingCycle, 100);
        }
      }
    }
  });
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
