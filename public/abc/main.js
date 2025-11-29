// ============================================
// ABC - Main Entry Point
// ============================================

import { state, elements, initElements, ALPHABET, shapeTypes } from './config.js';
import { initAudio } from './audio.js';
import { loadWhisperModel, toggleMicrophone, setSpeechCallbacks, checkCachedModels, isModelCached, switchModel } from './speech.js';
import { triggerCelebration, blockShortcuts } from './effects.js';
import { resizeCanvas, updateTrail, initBackgroundShapes, createBackgroundLetter, startBackgroundLetters } from './canvas.js';
import { initMarquee, selectMarqueeLetter, showLetter, setDisplayCallbacks, showShape } from './display.js';

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

  // Show mic indicator for runtime model switching
  elements.micIndicator.classList.add('visible');

  // Load Whisper model (if one is selected)
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

  // Letters and numbers
  if (/^[a-zA-Z0-9]$/.test(char)) {
    e.preventDefault();
    showLetter(char);
    return;
  }

  // Space bar = next letter (like click)
  if (char === ' ') {
    e.preventDefault();
    const nextChar = getNextLetter(state.currentLetter);
    selectMarqueeLetter(nextChar);
    return;
  }

  // Special keys = show shapes
  const specialKeys = ['Shift', 'Enter', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'CapsLock', 'Insert', 'Home', 'End', 'PageUp', 'PageDown'];
  if (specialKeys.includes(char)) {
    e.preventDefault();
    const randomShape = shapeTypes[Math.floor(Math.random() * shapeTypes.length)];
    showShape(randomShape);
    return;
  }

  // Punctuation keys = show shapes too
  const punctuationKeys = [',', '.', '/', ';', "'", '[', ']', '-', '=', '`', '\\'];
  if (punctuationKeys.includes(char)) {
    e.preventDefault();
    const randomShape = shapeTypes[Math.floor(Math.random() * shapeTypes.length)];
    showShape(randomShape);
    return;
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

async function init() {
  // Initialize DOM elements
  initElements();

  // Check which models are cached
  await checkCachedModels();
  updateCachedModelIndicators();

  // Setup callbacks between modules
  setSpeechCallbacks(showLetter, triggerCelebration, showShape);
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
  setupModelSelector();

  // Prevent touches on start screen controls from starting the game
  const startScreenControls = document.querySelectorAll('.model-selector, .splash-info');
  startScreenControls.forEach(el => {
    el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false });
  });

  // Mic toggle - now also allows enabling voice when model is not loaded
  const micToggle = document.getElementById('mic-toggle');
  if (micToggle) {
    micToggle.addEventListener('change', (e) => {
      e.stopPropagation();
      if (state.isModelLoaded) {
        toggleMicrophone(e.target.checked);
      } else if (e.target.checked && state.selectedModel === 'none') {
        // Prompt to select a model
        e.target.checked = false;
        showModelSelector();
      } else {
        e.target.checked = false;
      }
    });
  }

  // Setup runtime model selector in mic indicator
  setupRuntimeModelSelector();

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

function updateCachedModelIndicators() {
  document.querySelectorAll('.model-option').forEach(opt => {
    const model = opt.dataset.model;
    if (model && model !== 'none' && isModelCached(model)) {
      opt.classList.add('cached');
      // Add cached indicator if not present
      if (!opt.querySelector('.cached-indicator')) {
        const indicator = document.createElement('span');
        indicator.className = 'cached-indicator';
        indicator.textContent = '✓';
        indicator.title = 'Downloaded';
        opt.appendChild(indicator);
      }
    }
  });
}

function setupModelSelector() {
  const modelOptions = document.querySelectorAll('.model-option');

  // Set initial selected (default is 'none')
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
}

function setupRuntimeModelSelector() {
  // Create runtime model selector in mic indicator
  const micIndicator = document.getElementById('mic-indicator');
  if (!micIndicator) return;

  const runtimeSelector = document.createElement('div');
  runtimeSelector.className = 'runtime-model-selector';
  runtimeSelector.innerHTML = `
    <div class="runtime-model-options">
      <button type="button" class="runtime-model-option" data-model="none" title="Off">Off</button>
      <button type="button" class="runtime-model-option" data-model="tiny" title="Tiny model">T</button>
      <button type="button" class="runtime-model-option" data-model="base" title="Base model">B</button>
      <button type="button" class="runtime-model-option" data-model="small" title="Small model">S</button>
    </div>
  `;
  micIndicator.appendChild(runtimeSelector);

  // Update cached indicators and selected state
  runtimeSelector.querySelectorAll('.runtime-model-option').forEach(opt => {
    const model = opt.dataset.model;

    // Mark cached models
    if (model !== 'none' && isModelCached(model)) {
      opt.classList.add('cached');
    }

    // Set initial selected
    if (model === state.selectedModel) {
      opt.classList.add('selected');
    }

    // Handle clicks
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      if (model !== state.selectedModel) {
        switchModel(model);
        // Update all runtime options
        runtimeSelector.querySelectorAll('.runtime-model-option').forEach(o => {
          o.classList.toggle('selected', o.dataset.model === model);
        });
      }
    });
  });
}

function showModelSelector() {
  // Make mic indicator visible with the runtime selector
  elements.micIndicator.classList.add('visible');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
