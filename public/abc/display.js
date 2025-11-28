// ============================================
// ABC - Display Module (Marquee, Letter Display)
// ============================================

import { state, elements, colors, ALPHABET, MARQUEE_SPEED } from './config.js';
import { playNote } from './audio.js';
import { createParticles, createSparkle } from './effects.js';
import { onLetterChange } from './canvas.js';

// Marquee elements
let marqueeUpper = null;
let marqueeLower = null;

// Current flying letters
let currentFlyingUpper = null;
let currentFlyingLower = null;
let currentDisplayColor = null;

// Animation state
let activeAnimations = [];
let animationLoopRunning = false;

const LETTER_BOX_WIDTH = 50;
const LERP_SPEED = 0.08;

// Callbacks
let onStartGame = null;

export function setDisplayCallbacks(startGameFn) {
  onStartGame = startGameFn;
}

export function initMarquee() {
  marqueeUpper = document.getElementById('marquee-upper');
  marqueeLower = document.getElementById('marquee-lower');

  const letters = ALPHABET + ALPHABET + ALPHABET + ALPHABET;

  letters.split('').forEach((letter) => {
    const upperEl = document.createElement('span');
    upperEl.className = 'marquee-letter';
    upperEl.textContent = letter;
    upperEl.dataset.letter = letter.toLowerCase();
    upperEl.addEventListener('click', (e) => {
      e.stopPropagation();
      selectMarqueeLetter(letter.toLowerCase());
    });
    marqueeUpper.appendChild(upperEl);

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

  animateMarquee();
}

function animateMarquee() {
  state.marqueeOffset -= MARQUEE_SPEED;

  const resetPoint = LETTER_BOX_WIDTH * 26;
  if (Math.abs(state.marqueeOffset) >= resetPoint) {
    state.marqueeOffset += resetPoint;
  }

  marqueeUpper.style.transform = `translateX(${state.marqueeOffset}px)`;
  marqueeLower.style.transform = `translateX(${state.marqueeOffset}px)`;

  requestAnimationFrame(animateMarquee);
}

export function selectMarqueeLetter(letter) {
  if (!state.isStarted && onStartGame) {
    onStartGame();
  }

  const color = colors[Math.floor(Math.random() * colors.length)];

  cancelAllAnimations();
  removeOldFlyingLetters();

  const screenWidth = window.innerWidth;
  let visibleUpper = findVisibleLetter(marqueeUpper, letter, screenWidth);
  let visibleLower = findVisibleLetter(marqueeLower, letter, screenWidth);

  animateLetterToCenter(letter, color, visibleUpper, visibleLower);
  playNote(letter);
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

function lerp(start, end, t) {
  return start + (end - start) * t;
}

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

function runAnimations() {
  const stillAnimating = [];

  for (const anim of activeAnimations) {
    if (anim.done) continue;

    anim.current.x = lerp(anim.current.x, anim.target.x, LERP_SPEED);
    anim.current.y = lerp(anim.current.y, anim.target.y, LERP_SPEED);
    anim.current.size = lerp(anim.current.size, anim.target.size, LERP_SPEED);
    anim.current.opacity = lerp(anim.current.opacity, anim.target.opacity, LERP_SPEED);

    anim.element.style.transform = `translate(${anim.current.x}px, ${anim.current.y}px)`;
    anim.element.style.fontSize = `${anim.current.size}px`;
    anim.element.style.opacity = anim.current.opacity;

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

function cancelAllAnimations() {
  for (const anim of activeAnimations) {
    if (!anim.done && anim.onComplete) {
      anim.onComplete();
    }
    anim.done = true;
  }
  activeAnimations = [];
}

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

function animateLetterToCenter(letter, color, upperSource, lowerSource) {
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  const upperTargetSize = Math.min(450, window.innerWidth * 0.38);
  const lowerTargetSize = Math.min(360, window.innerWidth * 0.30);
  const gap = Math.min(80, window.innerWidth * 0.06);

  // Create flying letters
  const flyingUpper = document.createElement('div');
  flyingUpper.className = 'flying-letter';
  flyingUpper.textContent = letter.toUpperCase();
  flyingUpper.dataset.letter = letter.toLowerCase();
  flyingUpper.style.color = color;
  flyingUpper.style.left = '0px';
  flyingUpper.style.top = '0px';

  const flyingLower = document.createElement('div');
  flyingLower.className = 'flying-letter';
  flyingLower.textContent = letter.toLowerCase();
  flyingLower.dataset.letter = letter.toLowerCase();
  flyingLower.style.color = color;
  flyingLower.style.left = '0px';
  flyingLower.style.top = '0px';

  // Calculate start positions
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

  flyingUpper.style.transform = `translate(${upperStartX}px, ${upperStartY}px)`;
  flyingUpper.style.fontSize = '36px';
  flyingUpper.style.opacity = '0.4';

  flyingLower.style.transform = `translate(${lowerStartX}px, ${lowerStartY}px)`;
  flyingLower.style.fontSize = '36px';
  flyingLower.style.opacity = '0.4';

  document.body.appendChild(flyingUpper);
  document.body.appendChild(flyingLower);

  // Calculate final positions
  const totalWidth = upperTargetSize * 0.55 + lowerTargetSize * 0.45 + gap;
  const upperFinalX = centerX - totalWidth / 2;
  const lowerFinalX = upperFinalX + upperTargetSize * 0.55 + gap;
  const finalY = centerY - upperTargetSize * 0.4;

  const upperAnim = createLerpAnimation(flyingUpper, {
    x: upperFinalX,
    y: finalY,
    size: upperTargetSize,
    opacity: 1
  });
  upperAnim.current = { x: upperStartX, y: upperStartY, size: 36, opacity: 0.4 };

  const baselineOffset = (upperTargetSize - lowerTargetSize) * 0.72;
  const lowerAnim = createLerpAnimation(flyingLower, {
    x: lowerFinalX,
    y: finalY + baselineOffset,
    size: lowerTargetSize,
    opacity: 0.85
  });
  lowerAnim.current = { x: lowerStartX, y: lowerStartY, size: 36, opacity: 0.4 };

  activeAnimations.push(upperAnim, lowerAnim);
  startAnimationLoop();

  currentFlyingUpper = flyingUpper;
  currentFlyingLower = flyingLower;
  currentDisplayColor = color;
  state.currentLetter = letter;

  onLetterChange(color);

  createParticles(letter, color);
  for (let i = 0; i < 15; i++) {
    setTimeout(() => createSparkle(color), i * 60);
  }
}

function highlightMarqueeLetter(letter, color) {
  document.querySelectorAll('.marquee-letter.active').forEach(el => {
    el.classList.remove('active');
    el.style.removeProperty('--active-color');
  });

  document.querySelectorAll(`.marquee-letter[data-letter="${letter}"]`).forEach(el => {
    el.classList.add('active');
    el.style.setProperty('--active-color', color);
  });
}

// Show letter (called from speech module)
export function showLetter(char) {
  selectMarqueeLetter(char.toLowerCase());
}
