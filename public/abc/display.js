// ============================================
// ABC - Display Module (Marquee, Letter Display)
// ============================================

import { state, elements, colors, ALPHABET, MARQUEE_SPEED } from './config.js';
import { playNote, playShapeSound } from './audio.js';
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
  const isNumber = /^[0-9]$/.test(letter);

  const upperTargetSize = Math.min(450, window.innerWidth * 0.38);
  const lowerTargetSize = Math.min(360, window.innerWidth * 0.30);
  const gap = Math.min(80, window.innerWidth * 0.06);

  // For numbers, just show one centered digit
  if (isNumber) {
    const flyingNumber = document.createElement('div');
    flyingNumber.className = 'flying-letter';
    flyingNumber.textContent = letter;
    flyingNumber.dataset.letter = letter;
    flyingNumber.style.color = color;
    flyingNumber.style.left = '0px';
    flyingNumber.style.top = '0px';

    const fromLeft = Math.random() > 0.5;
    const startX = fromLeft ? -80 : window.innerWidth + 80;
    const startY = centerY;

    flyingNumber.style.transform = `translate(${startX}px, ${startY}px)`;
    flyingNumber.style.fontSize = '36px';
    flyingNumber.style.opacity = '0.4';

    document.body.appendChild(flyingNumber);

    const numberSize = Math.min(500, window.innerWidth * 0.45);
    const finalX = centerX - numberSize * 0.3;
    const finalY = centerY - numberSize * 0.4;

    const numberAnim = createLerpAnimation(flyingNumber, {
      x: finalX,
      y: finalY,
      size: numberSize,
      opacity: 1
    });
    numberAnim.current = { x: startX, y: startY, size: 36, opacity: 0.4 };

    activeAnimations.push(numberAnim);
    startAnimationLoop();

    currentFlyingUpper = flyingNumber;
    currentFlyingLower = null;
    currentDisplayColor = color;
    state.currentLetter = letter;

    onLetterChange(color);
    createParticles(letter, color);
    for (let i = 0; i < 15; i++) {
      setTimeout(() => createSparkle(color), i * 60);
    }
    return;
  }

  // Create flying letters (for A-Z)
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

// Show shape (called from main for special keys)
export function showShape(shapeType) {
  const color = colors[Math.floor(Math.random() * colors.length)];

  cancelAllAnimations();
  removeOldFlyingLetters();
  playShapeSound(shapeType);

  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const targetSize = Math.min(400, window.innerWidth * 0.4);

  // Create shape element
  const shapeEl = document.createElement('div');
  shapeEl.className = 'flying-letter flying-shape';
  shapeEl.style.left = '0px';
  shapeEl.style.top = '0px';

  // Create SVG for the shape
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', '-50 -50 100 100');
  svg.style.filter = `drop-shadow(0 0 20px ${color}) drop-shadow(0 0 40px ${color})`;

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

  // Animate from off-screen
  const fromLeft = Math.random() > 0.5;
  const startX = fromLeft ? -100 : window.innerWidth + 100;
  const startY = centerY;

  shapeEl.style.transform = `translate(${startX}px, ${startY}px)`;
  shapeEl.style.width = '50px';
  shapeEl.style.height = '50px';
  shapeEl.style.opacity = '0.4';

  const finalX = centerX - targetSize / 2;
  const finalY = centerY - targetSize / 2;

  const shapeAnim = createLerpAnimation(shapeEl, {
    x: finalX,
    y: finalY,
    size: targetSize,
    opacity: 1
  });
  shapeAnim.current = { x: startX, y: startY, size: 50, opacity: 0.4 };

  // Override the animation update for shapes (width/height instead of fontSize)
  const origElement = shapeAnim.element;
  const updateShape = () => {
    origElement.style.width = `${shapeAnim.current.size}px`;
    origElement.style.height = `${shapeAnim.current.size}px`;
  };
  const origOnComplete = shapeAnim.onComplete;
  shapeAnim.onComplete = () => {
    updateShape();
    if (origOnComplete) origOnComplete();
  };

  activeAnimations.push(shapeAnim);

  // Custom animation loop for shape sizing
  const animateShape = () => {
    if (shapeAnim.done) return;
    updateShape();
    requestAnimationFrame(animateShape);
  };
  animateShape();

  startAnimationLoop();

  currentFlyingUpper = shapeEl;
  currentFlyingLower = null;
  currentDisplayColor = color;
  state.currentLetter = null;

  onLetterChange(color);

  // Create sparkles
  for (let i = 0; i < 15; i++) {
    setTimeout(() => createSparkle(color), i * 60);
  }
}
