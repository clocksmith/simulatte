// ============================================
// ABC - Main Entry Point
// ============================================

import { state, elements, initElements, ALPHABET, shapeTypes, colors } from './config.js';
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

// Shape display for special keys
function showShape(shapeType) {
  const color = colors[Math.floor(Math.random() * colors.length)];
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const size = Math.min(300, window.innerWidth * 0.4);

  // Create shape element
  const shapeEl = document.createElement('div');
  shapeEl.className = 'flying-shape';
  shapeEl.style.position = 'fixed';
  shapeEl.style.left = `${centerX}px`;
  shapeEl.style.top = `${centerY}px`;
  shapeEl.style.transform = 'translate(-50%, -50%)';
  shapeEl.style.zIndex = '100';
  shapeEl.style.pointerEvents = 'none';

  // Create SVG for the shape
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '-50 -50 100 100');
  svg.style.filter = `drop-shadow(0 0 20px ${color}) drop-shadow(0 0 40px ${color})`;
  svg.style.animation = 'shapePop 0.8s ease-out forwards';

  let path;
  switch (shapeType) {
    case 'heart':
      path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M0 -10 C-25 -40, -50 0, 0 35 C50 0, 25 -40, 0 -10');
      break;
    case 'star':
      path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const points = [];
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        points.push(`${Math.cos(angle) * 40},${Math.sin(angle) * 40}`);
      }
      path.setAttribute('d', `M${points.join(' L')} Z`);
      break;
    case 'triangle':
      path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M0 -40 L-35 30 L35 30 Z');
      break;
    case 'circle':
      path = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      path.setAttribute('cx', '0');
      path.setAttribute('cy', '0');
      path.setAttribute('r', '35');
      break;
    case 'diamond':
      path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M0 -40 L25 0 L0 40 L-25 0 Z');
      break;
  }

  path.setAttribute('fill', color);
  svg.appendChild(path);
  shapeEl.appendChild(svg);
  document.body.appendChild(shapeEl);

  // Remove after animation
  setTimeout(() => shapeEl.remove(), 800);

  // Also create some sparkles
  for (let i = 0; i < 10; i++) {
    setTimeout(() => {
      const sparkle = document.createElement('div');
      sparkle.className = 'sparkle';
      sparkle.style.backgroundColor = color;
      sparkle.style.left = `${Math.random() * 100}%`;
      sparkle.style.top = `${Math.random() * 100}%`;
      sparkle.style.width = `${10 + Math.random() * 20}px`;
      sparkle.style.height = sparkle.style.width;
      sparkle.style.boxShadow = `0 0 ${10 + Math.random() * 10}px ${color}`;
      elements.particlesContainer.appendChild(sparkle);
      setTimeout(() => sparkle.remove(), 800);
    }, i * 50);
  }
}

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
