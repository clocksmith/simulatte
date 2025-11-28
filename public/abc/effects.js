// ============================================
// ABC - Effects Module (Celebrations, Particles)
// ============================================

import { elements } from './config.js';
import { playCelebrationSound } from './audio.js';

// ============================================
// Celebration Effects
// ============================================

export function triggerCelebration() {
  const letterEl = elements.letterDisplay.querySelector('.letter-container');
  if (letterEl) {
    letterEl.classList.add('celebrate');
    setTimeout(() => letterEl.classList.remove('celebrate'), 1500);
  }

  playCelebrationSound();
  createConfetti();
  createStarBurst();

  for (let i = 0; i < 3; i++) {
    setTimeout(() => createRainbowRing(), i * 200);
  }

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

    elements.celebrationOverlay.appendChild(confetti);
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

  elements.celebrationOverlay.appendChild(burst);
  setTimeout(() => burst.remove(), 1000);
}

function createRainbowRing() {
  const ring = document.createElement('div');
  ring.className = 'rainbow-ring';
  elements.celebrationOverlay.appendChild(ring);
  setTimeout(() => ring.remove(), 1000);
}

function showSuccessText() {
  const phrases = ['Amazing!', 'Great Job!', 'Wow!', 'Super!', 'Yay!', 'Perfect!', 'Awesome!'];
  const text = document.createElement('div');
  text.className = 'success-text';
  text.textContent = phrases[Math.floor(Math.random() * phrases.length)];
  elements.app.appendChild(text);
  setTimeout(() => text.remove(), 1500);
}

// ============================================
// Particles
// ============================================

export function createParticles(char, color) {
  const count = 8 + Math.floor(Math.random() * 8);

  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.textContent = char.toUpperCase();
    particle.style.color = color;
    particle.style.left = '50%';
    particle.style.top = '50%';

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const distance = 200 + Math.random() * 300;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    const rot = (Math.random() - 0.5) * 720;

    particle.style.setProperty('--tx', `${tx}px`);
    particle.style.setProperty('--ty', `${ty}px`);
    particle.style.setProperty('--rot', `${rot}deg`);

    elements.particlesContainer.appendChild(particle);
    setTimeout(() => particle.remove(), 1500);
  }
}

export function createSparkle(color) {
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
}

// ============================================
// Shortcut Blocking
// ============================================

export function blockShortcuts(e) {
  const blockedKeys = [
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
    'Tab', 'Escape', 'Meta', 'Alt', 'Control'
  ];

  if (blockedKeys.includes(e.key)) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }

  if (e.ctrlKey || e.metaKey || e.altKey) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }

  return true;
}
