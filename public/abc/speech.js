// ============================================
// ABC - Speech Recognition Module
// ============================================

import { state, elements, letterNames, ambiguousSounds, phoneticPatterns, ABC_TEMPO, commonWords } from './config.js';

// Module-level state
let levelAudioContext = null;
let smoothedLevel = 0;
let recorderA = null;
let recorderB = null;
let chunksA = [];
let chunksB = [];
const CHUNK_DURATION = 1000;
const OVERLAP_MS = 150;

// Letter queue for handling multiple letters
let letterQueue = [];
let isDisplayingQueue = false;

// Deduplication
let recentLetters = [];
const DEDUPE_WINDOW_MS = 800;

// Callbacks (set by main.js)
let onShowLetter = null;
let onTriggerCelebration = null;

// Cached models state
let cachedModels = new Set();

export function setSpeechCallbacks(showLetterFn, celebrationFn) {
  onShowLetter = showLetterFn;
  onTriggerCelebration = celebrationFn;
}

// ============================================
// Model Cache Detection
// ============================================

export async function checkCachedModels() {
  cachedModels.clear();

  try {
    // Transformers.js uses Cache API with 'transformers-cache'
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();

    // Check for model files
    const modelPatterns = {
      'tiny': 'whisper-tiny',
      'base': 'whisper-base',
      'small': 'whisper-small'
    };

    for (const [modelName, pattern] of Object.entries(modelPatterns)) {
      // Look for the model's config or weights file
      const hasModel = keys.some(req => req.url.includes(pattern));
      if (hasModel) {
        cachedModels.add(modelName);
      }
    }

    console.log('🗄️ Cached models:', [...cachedModels].join(', ') || 'none');
  } catch (e) {
    console.log('Could not check model cache:', e);
  }

  return cachedModels;
}

export function isModelCached(modelName) {
  return cachedModels.has(modelName);
}

export function getCachedModels() {
  return cachedModels;
}

// ============================================
// Whisper Model Loading
// ============================================

export async function switchModel(newModel) {
  console.log(`🔄 Switching model to: ${newModel}`);

  // Stop current listening
  if (state.isListening) {
    toggleMicrophone(false);
  }

  // Terminate existing worker
  if (state.whisperWorker) {
    state.whisperWorker.terminate();
    state.whisperWorker = null;
  }

  // Reset state
  state.isModelLoaded = false;
  state.isModelLoading = false;
  state.selectedModel = newModel;

  // Update UI
  updateModelSelectorUI(newModel);

  // Load new model if not 'none'
  if (newModel !== 'none') {
    loadWhisperModel();
  } else {
    elements.micIndicator.classList.remove('visible', 'listening');
  }
}

function updateModelSelectorUI(model) {
  // Update start screen selector
  document.querySelectorAll('.model-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.model === model);
  });

  // Update runtime selector if it exists
  document.querySelectorAll('.runtime-model-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.model === model);
  });
}

export function loadWhisperModel() {
  if (state.selectedModel === 'none') {
    console.log('🎤 Voice recognition disabled');
    return;
  }

  if (state.isModelLoading) return;
  if (state.isModelLoaded && state.whisperWorker) return;

  state.isModelLoading = true;
  elements.modelLoader.classList.add('active');

  const progressText = elements.modelLoader.querySelector('.loader-progress');
  const statusText = elements.modelLoader.querySelector('.loader-text');

  try {
    statusText.textContent = 'Loading Whisper model...';

    state.whisperWorker = new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });

    state.whisperWorker.onmessage = (e) => {
      const { type, status, text, error, silent } = e.data;

      switch (type) {
        case 'status':
          if (status === 'downloading') {
            const loaded = e.data.loaded || 0;
            const total = e.data.total || 0;
            const mb = (loaded / 1024 / 1024).toFixed(1);
            const totalMb = (total / 1024 / 1024).toFixed(1);
            const activeFiles = e.data.activeFiles || 0;
            statusText.textContent = `Downloading model${activeFiles > 1 ? ` (${activeFiles} files)` : ''}...`;
            progressText.textContent = total > 0 ? `${mb} / ${totalMb} MB (${e.data.progress}%)` : `${e.data.progress}%`;
          } else if (status === 'initiate') {
            statusText.textContent = e.data.file ? `Starting ${e.data.file}...` : 'Initializing...';
          } else if (status === 'loading') {
            statusText.textContent = 'Initializing model...';
            progressText.textContent = '';
          } else if (status === 'ready') {
            state.isModelLoaded = true;
            state.isModelLoading = false;
            statusText.textContent = 'Model loaded!';
            progressText.textContent = '100%';
            setTimeout(() => {
              elements.modelLoader.classList.remove('active');
              elements.modelLoader.classList.add('loaded');
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
              const transcriptEl = elements.micIndicator.querySelector('.mic-transcript');
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

    state.whisperWorker.onerror = (error) => {
      console.error('Worker error:', error);
      statusText.textContent = 'Failed to load model';
      progressText.textContent = 'Speech recognition unavailable';
      state.isModelLoading = false;
      setTimeout(() => elements.modelLoader.classList.remove('active'), 2000);
    };

    state.whisperWorker.postMessage({ type: 'load', model: state.selectedModel });

  } catch (error) {
    console.error('Failed to create Whisper worker:', error);
    statusText.textContent = 'Failed to load model';
    progressText.textContent = 'Speech recognition unavailable';
    state.isModelLoading = false;
    setTimeout(() => elements.modelLoader.classList.remove('active'), 2000);
  }
}

// ============================================
// Microphone Handling
// ============================================

async function startMicrophoneListening() {
  if (!state.isModelLoaded || state.isListening) return;

  try {
    state.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });

    levelAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (levelAudioContext.state === 'suspended') {
      await levelAudioContext.resume();
    }

    const source = levelAudioContext.createMediaStreamSource(state.micStream);
    state.audioAnalyser = levelAudioContext.createAnalyser();
    state.audioAnalyser.fftSize = 512;
    state.audioAnalyser.smoothingTimeConstant = 0.4;
    state.audioAnalyser.minDecibels = -90;
    state.audioAnalyser.maxDecibels = -10;
    source.connect(state.audioAnalyser);

    state.audioDataArray = new Uint8Array(state.audioAnalyser.fftSize);
    updateAudioLevel();

    state.isListening = true;
    elements.micIndicator.classList.add('visible', 'listening');
    setTranscriptListening();
    startRecordingCycle();

  } catch (error) {
    console.error('Microphone access denied:', error);
    elements.micIndicator.classList.add('visible');
    const transcriptEl = elements.micIndicator.querySelector('.mic-transcript');
    if (transcriptEl) {
      transcriptEl.textContent = 'Mic Blocked';
      transcriptEl.style.color = '#ff6b6b';
    }
  }
}

function updateAudioLevel() {
  if (!state.audioAnalyser || !state.isListening) {
    requestAnimationFrame(updateAudioLevel);
    return;
  }

  state.audioAnalyser.getByteTimeDomainData(state.audioDataArray);

  let sumSquares = 0;
  for (let i = 0; i < state.audioDataArray.length; i++) {
    const normalized = (state.audioDataArray[i] - 128) / 128;
    sumSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumSquares / state.audioDataArray.length);
  const rawLevel = Math.min(100, rms * 200);
  smoothedLevel += (rawLevel - smoothedLevel) * 0.3;
  const dB = rms > 0.001 ? Math.round(20 * Math.log10(rms) + 60) : 0;

  const meterBar = elements.micIndicator.querySelector('.mic-meter-bar');
  const dbDisplay = elements.micIndicator.querySelector('.mic-db');
  if (meterBar) meterBar.style.setProperty('--level', `${smoothedLevel}%`);
  if (dbDisplay) dbDisplay.textContent = `${Math.max(0, Math.min(60, dB))} dB`;

  requestAnimationFrame(updateAudioLevel);
}

// ============================================
// Recording System
// ============================================

function setupRecorders() {
  const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';

  recorderA = new MediaRecorder(state.micStream, { mimeType });
  recorderA.ondataavailable = (e) => { if (e.data.size > 0) chunksA.push(e.data); };
  recorderA.onstop = () => {
    if (chunksA.length > 0 && state.isModelLoaded && state.isListening) {
      const blob = new Blob(chunksA, { type: mimeType });
      chunksA = [];
      processAudio(blob);
    }
  };

  recorderB = new MediaRecorder(state.micStream, { mimeType });
  recorderB.ondataavailable = (e) => { if (e.data.size > 0) chunksB.push(e.data); };
  recorderB.onstop = () => {
    if (chunksB.length > 0 && state.isModelLoaded && state.isListening) {
      const blob = new Blob(chunksB, { type: mimeType });
      chunksB = [];
      processAudio(blob);
    }
  };
}

function startRecordingCycle() {
  if (!state.isListening || !state.micStream) return;
  if (!recorderA || !recorderB) setupRecorders();

  startRecorderLoop(recorderA, 'A');
  setTimeout(() => {
    if (state.isListening) startRecorderLoop(recorderB, 'B');
  }, CHUNK_DURATION / 2);
}

function startRecorderLoop(recorder, label) {
  if (!state.isListening || !recorder) return;

  try {
    if (recorder.state === 'inactive') {
      if (label === 'A') chunksA = [];
      else chunksB = [];
      recorder.start();
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
          setTimeout(() => startRecorderLoop(recorder, label), 50);
        }
      }, CHUNK_DURATION + OVERLAP_MS);
    }
  } catch (e) {
    console.error('Recorder error:', e);
  }
}

function resampleAudio(audioData, originalSampleRate, targetSampleRate = 16000) {
  if (originalSampleRate === targetSampleRate) return audioData;

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

async function processAudio(audioBlob) {
  if (!state.whisperWorker || !state.isModelLoaded || !state.isListening) return;

  try {
    const processStart = performance.now();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const originalSampleRate = audioBuffer.sampleRate;
    const audioData = audioBuffer.getChannelData(0);
    audioCtx.close();

    let sumSquares = 0;
    for (let i = 0; i < audioData.length; i++) {
      sumSquares += audioData[i] * audioData[i];
    }
    const rms = Math.sqrt(sumSquares / audioData.length);
    if (rms < 0.003) return;

    const resampled = resampleAudio(audioData, originalSampleRate, 16000);
    const duration = (resampled.length / 16000).toFixed(2);
    const prepTime = (performance.now() - processStart).toFixed(0);
    console.log(`🎤 Audio: ${duration}s, RMS: ${rms.toFixed(3)}, prep: ${prepTime}ms`);

    const transcriptEl = elements.micIndicator.querySelector('.mic-transcript');
    if (transcriptEl && !transcriptEl.textContent.startsWith('"')) {
      transcriptEl.textContent = 'Processing...';
      transcriptEl.style.color = 'rgba(255, 255, 255, 0.5)';
    }

    state.whisperWorker.postMessage(
      { type: 'transcribe', data: resampled.buffer },
      [resampled.buffer]
    );

  } catch (error) {
    console.error('Audio processing error:', error);
  }
}

// ============================================
// Transcript Display
// ============================================

function updateTranscriptDisplay(text) {
  const transcriptEl = elements.micIndicator.querySelector('.mic-transcript');
  if (transcriptEl && text && text.trim().length > 0) {
    transcriptEl.textContent = `"${text}"`;
    transcriptEl.classList.add('heard');
    setTimeout(() => {
      if (transcriptEl.textContent === `"${text}"`) setTranscriptListening();
    }, 4000);
  }
}

function setTranscriptListening() {
  const transcriptEl = elements.micIndicator.querySelector('.mic-transcript');
  if (transcriptEl && !transcriptEl.textContent.startsWith('"')) {
    transcriptEl.textContent = state.isListening ? 'Listening' : 'Muted';
    transcriptEl.style.color = 'rgba(255, 255, 255, 0.6)';
    transcriptEl.classList.remove('heard');
  }
}

export function toggleMicrophone(enabled) {
  const toggleCheckbox = document.getElementById('mic-toggle');

  if (enabled) {
    state.isListening = true;
    toggleCheckbox.checked = true;
    elements.micIndicator.classList.add('listening');
    recorderA = null;
    recorderB = null;
    chunksA = [];
    chunksB = [];
    startRecordingCycle();
    setTranscriptListening();
  } else {
    state.isListening = false;
    toggleCheckbox.checked = false;
    elements.micIndicator.classList.remove('listening');
    if (recorderA && recorderA.state === 'recording') try { recorderA.stop(); } catch(e) {}
    if (recorderB && recorderB.state === 'recording') try { recorderB.stop(); } catch(e) {}
    const transcriptEl = elements.micIndicator.querySelector('.mic-transcript');
    if (transcriptEl) {
      transcriptEl.textContent = 'Muted';
      transcriptEl.style.color = '#ff6b6b';
    }
  }
}

// ============================================
// Letter Matching & Parsing
// ============================================

function checkForLetterMatch(transcription) {
  let text = transcription.toLowerCase().trim()
    .replace(/[.,!?'"]/g, '')
    .replace(/♪/g, '')
    .replace(/🎵/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (text && text.length > 0) updateTranscriptDisplay(text);
  if (!text || text.length === 0) return;

  // Filter sound effect annotations
  if (/^\s*[\[\(].*[\]\)]\s*$/.test(text)) {
    console.log(`🚫 Filtered sound effect: "${text}"`);
    return;
  }

  // Filter hallucinations
  const hallucinations = [
    'blank_audio', 'blank audio', 'silence', 'no speech',
    'thank you', 'thanks for watching', 'see you next time',
    'subscribe', 'like and subscribe', 'goodbye', 'music',
    'music playing', 'soft music', 'upbeat music'
  ];
  const cleanLower = text.replace(/[\[\]\(\)]/g, '').toLowerCase();
  if (hallucinations.some(h => cleanLower.includes(h))) {
    console.log(`🚫 Filtered hallucination: "${text}"`);
    return;
  }

  const { letters: detectedLetters, phonetic } = parseMultipleLetters(text);

  if (detectedLetters.length > 0) {
    const letterStr = detectedLetters.map(l => l.toUpperCase()).join(', ');
    if (phonetic) {
      console.log(`✅ Heard: "${text}" → Phonetic "${phonetic}" → [${letterStr}]`);
    } else {
      console.log(`✅ Heard: "${text}" → [${letterStr}]`);
    }
    queueLetters(detectedLetters);
  } else {
    console.log(`❓ No match: "${text}"`);
  }
}

function parseMultipleLetters(text) {
  let cleanText = text
    .replace(/^(the |an |um |uh |oh |ah )/g, '')
    .replace(/(\.|\,|\!|\?)/g, '')
    .trim();

  const detected = [];
  let matchedPhonetic = null;

  // Check phonetic patterns first
  const lowerText = cleanText.toLowerCase();
  for (const [pattern, letters] of Object.entries(phoneticPatterns)) {
    if (lowerText === pattern || lowerText.includes(pattern)) {
      detected.push(...letters);
      matchedPhonetic = pattern;
      console.log(`   📖 Phonetic match: "${pattern}" → [${letters.join(', ')}]`);
      cleanText = cleanText.toLowerCase().replace(pattern, '').trim();
      if (cleanText.length === 0) return { letters: detected, phonetic: matchedPhonetic };
    }
  }

  const words = cleanText.split(/[\s,.-]+/).filter(w => w.length > 0);
  if (words.length > 0) console.log(`   🔍 Parsing words: [${words.join(', ')}]`);

  // Get sequence confidence once for all words
  const { confidence: seqConfidence, streak: seqStreak } = getSequenceConfidence();
  const expectedNext = getExpectedNextLetter();
  const highConfidence = seqConfidence >= 0.8; // 3+ letters in sequence

  for (const word of words) {
    const wordLower = word.toLowerCase();

    // HIGH CONFIDENCE SEQUENCE: If we have a strong sequence (A-B-C),
    // strongly prefer the expected next letter for any fuzzy match
    if (highConfidence && expectedNext && fuzzyMatchesLetter(wordLower, expectedNext)) {
      console.log(`   🔥 High confidence (${seqStreak} streak) "${word}" → ${expectedNext.toUpperCase()} (expected after ${getLastLetter()?.toUpperCase()})`);
      detected.push(expectedNext);
      continue;
    }

    // Check ambiguous sounds - use sequential context to disambiguate
    if (ambiguousSounds[wordLower]) {
      const possibleLetters = ambiguousSounds[wordLower];

      if (expectedNext && possibleLetters.includes(expectedNext)) {
        console.log(`   🎯 Ambiguous "${word}" → ${expectedNext.toUpperCase()} (context: after ${getLastLetter()?.toUpperCase() || '?'})`);
        detected.push(expectedNext);
        continue;
      }
      // No context match - use first option (alphabetically earlier)
      const defaultLetter = possibleLetters[0];
      console.log(`   🎲 Ambiguous "${word}" → ${defaultLetter.toUpperCase()} (no context, default)`);
      detected.push(defaultLetter);
      continue;
    }

    // Check letter name variations
    let foundMatch = false;
    for (const [letter, variations] of Object.entries(letterNames)) {
      for (const variation of variations) {
        if (wordLower === variation) {
          console.log(`   📝 Word "${word}" matches letter ${letter.toUpperCase()}`);
          detected.push(letter);
          foundMatch = true;
          break;
        }
      }
      if (foundMatch) break;
    }
    if (foundMatch) continue;

    // Single letter
    if (wordLower.length === 1 && /[a-z]/.test(wordLower)) {
      console.log(`   📝 Single char "${word}" → ${wordLower.toUpperCase()}`);
      detected.push(wordLower);
      continue;
    }

    // MEDIUM CONFIDENCE: Even with some sequence, try expected letter before skipping
    if (seqConfidence >= 0.5 && expectedNext && fuzzyMatchesLetter(wordLower, expectedNext)) {
      console.log(`   🔮 Sequence hint (${seqStreak} streak) "${word}" → ${expectedNext.toUpperCase()}`);
      detected.push(expectedNext);
      continue;
    }

    // Skip common words (but only if no sequence match above)
    if (isCommonWord(word)) {
      console.log(`   ⏭️ Skipped common word: "${word}"`);
      continue;
    }

    // Phonetic patterns for sequential letter detection
    if (wordLower.length >= 2 && wordLower.length <= 3 && /^[a-z]+$/.test(wordLower)) {
      if (phoneticPatterns[wordLower]) {
        console.log(`   📖 Sequential pattern: "${word}" → [${phoneticPatterns[wordLower].join(', ')}]`);
        detected.push(...phoneticPatterns[wordLower]);
        continue;
      }

      if (wordLower.length === 2) {
        console.log(`   🔤 Split 2-char "${word}" → [${wordLower.split('').join(', ')}]`);
        for (const char of wordLower) detected.push(char);
        continue;
      }

      console.log(`   ⏭️ Skipped unknown 3-char word: "${word}"`);
      continue;
    }

    // Last resort: try expected next with loose matching
    if (expectedNext && matchesExpectedNext(wordLower, expectedNext)) {
      console.log(`   🔮 Sequential match: "${word}" → ${expectedNext.toUpperCase()}`);
      detected.push(expectedNext);
      continue;
    }

    console.log(`   ⚠️ Unmatched word: "${word}"`);
  }

  return { letters: detected, phonetic: matchedPhonetic };
}

function isCommonWord(word) {
  return commonWords.includes(word.toLowerCase());
}

// Get the last letter shown (for logging/context)
function getLastLetter() {
  const now = Date.now();
  const recent = recentLetters
    .filter(r => now - r.time < 3000)
    .map(r => r.letter);
  return recent.length > 0 ? recent[recent.length - 1] : null;
}

// Get sequence confidence: how many recent letters are in consecutive order
// Returns { confidence: 0-1, streak: number }
function getSequenceConfidence() {
  const now = Date.now();
  const recent = recentLetters
    .filter(r => now - r.time < 5000) // 5 second window for sequence
    .map(r => r.letter);

  if (recent.length < 2) return { confidence: 0, streak: recent.length };

  // Count consecutive letters from the end
  let streak = 1;
  for (let i = recent.length - 1; i > 0; i--) {
    const curr = recent[i].charCodeAt(0);
    const prev = recent[i - 1].charCodeAt(0);
    if (curr === prev + 1) {
      streak++;
    } else {
      break;
    }
  }

  // Confidence: 2 in a row = 0.5, 3+ = 0.8, 4+ = 0.95
  let confidence = 0;
  if (streak >= 4) confidence = 0.95;
  else if (streak >= 3) confidence = 0.8;
  else if (streak >= 2) confidence = 0.5;

  return { confidence, streak };
}

// Get expected next letter based on recent history (for sequential intelligence)
function getExpectedNextLetter() {
  const lastLetter = getLastLetter();
  if (!lastLetter) return null;

  const lastCode = lastLetter.charCodeAt(0);

  // If it's a-y, the expected next is the following letter
  if (lastCode >= 97 && lastCode < 122) { // 'a' to 'y'
    return String.fromCharCode(lastCode + 1);
  }

  return null;
}

// Check if a word loosely/fuzzily matches a letter (for high-confidence sequences)
function fuzzyMatchesLetter(word, letter) {
  const variations = letterNames[letter];
  if (!variations) return false;

  const w = word.toLowerCase();

  // Exact match with any variation
  for (const v of variations) {
    if (w === v) return true;
  }

  // Starts with the letter
  if (w.startsWith(letter)) return true;

  // First letter matches and word is short (likely mishearing)
  if (w.length <= 3 && w[0] === letter) return true;

  // Check if any variation starts with the word or vice versa
  for (const v of variations) {
    if (v.startsWith(w) || w.startsWith(v)) return true;
  }

  // Phonetic similarity: same first consonant/vowel pattern
  const letterSound = variations[1] || letter; // Usually the phonetic spelling
  if (letterSound && w.length >= 2) {
    // Similar ending sounds (ee, ay, etc.)
    if (letterSound.endsWith('ee') && w.endsWith('ee')) return true;
    if (letterSound.endsWith('ay') && w.endsWith('ay')) return true;
  }

  return false;
}

// Check if a word could match the expected next letter
function matchesExpectedNext(word, expectedLetter) {
  if (!expectedLetter) return false;

  const w = word.toLowerCase();
  const exp = expectedLetter.toLowerCase();

  // Direct match with first char
  if (w.startsWith(exp)) return true;

  // Check if this letter's variations could match
  const variations = letterNames[exp];
  if (variations) {
    for (const v of variations) {
      if (w === v || w.startsWith(v)) return true;
    }
  }

  return false;
}

// ============================================
// Letter Queue & Tempo
// ============================================

function isDuplicateLetter(letter) {
  const now = Date.now();
  recentLetters = recentLetters.filter(r => now - r.time < DEDUPE_WINDOW_MS);
  return recentLetters.some(r => r.letter === letter.toLowerCase());
}

function markLetterShown(letter) {
  recentLetters.push({ letter: letter.toLowerCase(), time: Date.now() });
}

function getLetterTempo(letter, nextLetter) {
  const l = letter.toLowerCase();
  const next = nextLetter ? nextLetter.toLowerCase() : null;

  if (['l', 'm', 'n', 'o'].includes(l)) {
    if (next && ['m', 'n', 'o', 'p'].includes(next)) return ABC_TEMPO.fast;
  }

  if (l === 'g' || l === 'p' || l === 's' || l === 'v') return ABC_TEMPO.held;
  if (l === 'w' || l === 'y') return ABC_TEMPO.slow;
  if (l === 'z') return ABC_TEMPO.final;

  if (next) {
    const lCode = l.charCodeAt(0);
    const nextCode = next.charCodeAt(0);
    if (nextCode === lCode + 1 && lCode >= 108 && lCode <= 111) return ABC_TEMPO.fast;
  }

  return ABC_TEMPO.normal;
}

function queueLetters(letters) {
  const sequence = letters.map(l => l.toLowerCase());

  for (let i = 0; i < letters.length; i++) {
    letterQueue.push({
      letter: letters[i],
      nextInSequence: i < letters.length - 1 ? letters[i + 1] : null,
      isSequence: letters.length > 1
    });
  }

  const queueStr = letterQueue.map(item =>
    typeof item === 'string' ? item.toUpperCase() : item.letter.toUpperCase()
  ).join('→');
  console.log(`📬 Queue: [${queueStr}] (${letterQueue.length} pending)`);

  processLetterQueue();
}

function processLetterQueue() {
  if (isDisplayingQueue || letterQueue.length === 0) return;

  isDisplayingQueue = true;
  const item = letterQueue.shift();
  const letter = typeof item === 'string' ? item : item.letter;
  const nextInSequence = typeof item === 'object' ? item.nextInSequence : null;
  const isSequence = typeof item === 'object' ? item.isSequence : false;

  if (!isSequence && isDuplicateLetter(letter)) {
    console.log(`🔄 Skipped duplicate: "${letter.toUpperCase()}"`);
    isDisplayingQueue = false;
    processLetterQueue();
    return;
  }

  markLetterShown(letter);

  // Call the showLetter callback
  const wasCurrentLetter = state.currentLetter && letter.toLowerCase() === state.currentLetter.toLowerCase();
  if (onShowLetter) onShowLetter(letter);

  if (wasCurrentLetter && onTriggerCelebration) {
    setTimeout(onTriggerCelebration, 600);
  }

  const nextItem = letterQueue.length > 0 ? letterQueue[0] : null;
  const nextLetter = nextItem ? (typeof nextItem === 'string' ? nextItem : nextItem.letter) : null;
  const tempoNextLetter = nextInSequence || nextLetter;
  const delay = getLetterTempo(letter, tempoNextLetter);

  if (isSequence) {
    const tempoType = delay === ABC_TEMPO.fast ? '⚡fast' :
                      delay === ABC_TEMPO.held ? '🎵held' :
                      delay === ABC_TEMPO.slow ? '🐢slow' : '▶️normal';
    console.log(`🎶 Tempo: ${letter.toUpperCase()} → ${tempoNextLetter ? tempoNextLetter.toUpperCase() : 'end'} = ${delay}ms (${tempoType})`);
  }

  setTimeout(() => {
    isDisplayingQueue = false;
    processLetterQueue();
  }, delay);
}
