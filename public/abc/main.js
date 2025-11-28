// ============================================
// ABC - Main Entry Point
// ============================================

import { state, elements, initElements, ALPHABET } from './config.js';
import { initAudio } from './audio.js';
import { loadWhisperModel, toggleMicrophone, setSpeechCallbacks } from './speech.js';
import { triggerCelebration, blockShortcuts } from './effects.js';
import { resizeCanvas, updateTrail, initBackgroundShapes, createBackgroundLetter, startBackgroundLetters } from './canvas.js';
import { initMarquee, selectMarqueeLetter, showLetter, setDisplayCallbacks } from './display.js';

// ============================================
// Start Game
// ============================================

function startGame() {
  if (state.isStarted) return;
  state.isStarted = true;

  initAudio();
  elements.startScreen.classList.add('hidden');

  // Request fullscreen
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }

  // Load Whisper model
  loadWhisperModel();
}

// ============================================
// Event Handlers
// ============================================

function handleKeyDown(e) {
  if (!blockShortcuts(e)) return;

  if (!state.isStarted) {
    startGame();
  }

  const char = e.key;
  if (/^[a-zA-Z]$/.test(char)) {
    e.preventDefault();
    showLetter(char);
  }
}

function handleMouseMove(e) {
  state.mouseX = e.clientX;
  state.mouseY = e.clientY;
}

function getNextLetter(current) {
  if (!current) return 'a';
  const index = ALPHABET.toLowerCase().indexOf(current.toLowerCase());
  if (index === -1) return 'a';
  return ALPHABET[(index + 1) % 26].toLowerCase();
}

function handleClick(e) {
  if (!state.isStarted) {
    startGame();
    return;
  }

  const nextChar = getNextLetter(state.currentLetter);
  selectMarqueeLetter(nextChar);
}

function handleTouchStart(e) {
  e.preventDefault();
  if (!state.isStarted) {
    startGame();
    return;
  }
  const nextChar = getNextLetter(state.currentLetter);
  selectMarqueeLetter(nextChar);
}

function handleTouchMove(e) {
  e.preventDefault();
  if (e.touches[0]) {
    state.mouseX = e.touches[0].clientX;
    state.mouseY = e.touches[0].clientY;
  }
}

// ============================================
// Initialization
// ============================================

function init() {
  // Initialize DOM elements
  initElements();

  // Setup callbacks between modules
  setSpeechCallbacks(showLetter, triggerCelebration);
  setDisplayCallbacks(startGame);

  // Setup canvas
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Keyboard events
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keyup', (e) => e.preventDefault(), true);

  // Mouse events
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('click', handleClick);

  // Touch events
  document.addEventListener('touchstart', handleTouchStart, { passive: false });
  document.addEventListener('touchmove', handleTouchMove, { passive: false });

  // Prevent navigation
  window.addEventListener('beforeunload', (e) => {
    if (state.isStarted) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Block drag events
  document.addEventListener('dragstart', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());

  // Start animations
  updateTrail();
  initBackgroundShapes();
  initMarquee();

  // Model selector - handle both click and touch to prevent game start
  const modelOptions = document.querySelectorAll('.model-option');

  // Set initial selected based on device (mobile=tiny, desktop=base)
  modelOptions.forEach(opt => opt.classList.remove('selected'));
  const defaultOption = document.querySelector(`.model-option[data-model="${state.selectedModel}"]`);
  if (defaultOption) defaultOption.classList.add('selected');

  modelOptions.forEach(option => {
    const selectModel = (e) => {
      e.stopPropagation();
      e.preventDefault();
      modelOptions.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      state.selectedModel = option.dataset.model;
    };
    option.addEventListener('click', selectModel);
    option.addEventListener('touchstart', selectModel, { passive: false });
  });

  // Prevent touches on start screen controls from starting the game
  const startScreenControls = document.querySelectorAll('.model-selector, .splash-info');
  startScreenControls.forEach(el => {
    el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false });
  });

  // Mic toggle
  const micToggle = document.getElementById('mic-toggle');
  if (micToggle) {
    micToggle.addEventListener('change', (e) => {
      e.stopPropagation();
      if (state.isModelLoaded) {
        toggleMicrophone(e.target.checked);
      } else {
        e.target.checked = false;
      }
    });
  }

  // Background letters
  startBackgroundLetters();

  // Visibility change handling
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.audioContext) state.audioContext.suspend();
      // Notify whisper worker to throttle progress updates
      if (state.whisperWorker) {
        state.whisperWorker.postMessage({ type: 'visibility', hidden: true });
      }
    } else {
      if (state.audioContext) state.audioContext.resume();
      // Notify whisper worker to resume progress updates
      if (state.whisperWorker) {
        state.whisperWorker.postMessage({ type: 'visibility', hidden: false });
      }
      if (state.isModelLoading && !state.isModelLoaded) {
        elements.modelLoader.classList.add('active');
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
