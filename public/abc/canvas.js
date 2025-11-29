// ============================================
// ABC - Canvas Module (Mouse Trail, Background Shapes)
// ============================================

import { state, elements, colors, MAX_SHAPES, shapeTypes } from './config.js';

// Trail color state
let currentTrailColor = colors[0];
let trailColorIndex = 0;
let trailColorTimer = 0;

export function resizeCanvas() {
  elements.trailCanvas.width = window.innerWidth * window.devicePixelRatio;
  elements.trailCanvas.height = window.innerHeight * window.devicePixelRatio;
  elements.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

export function updateTrail() {
  trailColorTimer++;
  if (trailColorTimer > 60) {
    trailColorTimer = 0;
    trailColorIndex = (trailColorIndex + 1) % colors.length;
    currentTrailColor = colors[trailColorIndex];
  }

  state.trailPoints.push({
    x: state.mouseX,
    y: state.mouseY,
    color: currentTrailColor,
    size: 12,
    life: 1
  });

  if (state.trailPoints.length > 30) {
    state.trailPoints.shift();
  }

  // Clear with fade
  elements.ctx.fillStyle = 'rgba(26, 26, 46, 0.1)';
  elements.ctx.fillRect(0, 0, elements.trailCanvas.width, elements.trailCanvas.height);

  // Draw trail circles
  state.trailPoints.forEach((point) => {
    point.life -= 0.03;
    if (point.life > 0) {
      elements.ctx.beginPath();
      elements.ctx.arc(point.x, point.y, point.size * point.life, 0, Math.PI * 2);
      elements.ctx.fillStyle = point.color;
      elements.ctx.globalAlpha = point.life * 0.6;
      elements.ctx.fill();
    }
  });

  elements.ctx.globalAlpha = 1;
  state.trailPoints = state.trailPoints.filter(p => p.life > 0);

  requestAnimationFrame(updateTrail);
}

// ============================================
// Background Shapes
// ============================================

export function initBackgroundShapes() {
  for (let i = 0; i < MAX_SHAPES; i++) {
    state.backgroundShapes.push(createShape());
  }
  requestAnimationFrame(updateBackgroundShapes);
}

function createShape() {
  const now = Date.now();
  // Random behavior phase duration between 15-30 seconds
  const phaseDuration = (15 + Math.random() * 15) * 1000;

  return {
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    // Faster base velocities
    vx: (Math.random() - 0.5) * 1.2,
    vy: (Math.random() - 0.5) * 1.2,
    // More diverse sizes
    size: 12 + Math.random() * 35,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 1.0,
    type: shapeTypes[Math.floor(Math.random() * shapeTypes.length)],
    color: colors[Math.floor(Math.random() * colors.length)],
    opacity: 0.08 + Math.random() * 0.18,
    // Behavior oscillation
    behaviorPhase: Math.random() > 0.5 ? 'follow' : 'disperse',
    phaseStartTime: now - Math.random() * phaseDuration, // Stagger initial phases
    phaseDuration: phaseDuration,
    // Individual behavior intensity
    followStrength: 0.02 + Math.random() * 0.04,
    disperseStrength: 0.03 + Math.random() * 0.05,
    // Random wander tendency
    wanderAngle: Math.random() * Math.PI * 2,
    wanderSpeed: 0.3 + Math.random() * 0.4
  };
}

function drawShape(shape) {
  const ctx = elements.ctx;
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
  const now = Date.now();

  state.backgroundShapes.forEach(shape => {
    // Check if it's time to switch behavior phase
    if (now - shape.phaseStartTime > shape.phaseDuration) {
      shape.behaviorPhase = shape.behaviorPhase === 'follow' ? 'disperse' : 'follow';
      shape.phaseStartTime = now;
      // Randomize next phase duration (15-30 seconds)
      shape.phaseDuration = (15 + Math.random() * 15) * 1000;
      // Small burst when switching
      const burstAngle = Math.random() * Math.PI * 2;
      shape.vx += Math.cos(burstAngle) * 1.5;
      shape.vy += Math.sin(burstAngle) * 1.5;
    }

    // More frequent random direction changes
    if (Math.random() < 0.04) {
      shape.vx += (Math.random() - 0.5) * 1.2;
      shape.vy += (Math.random() - 0.5) * 1.2;
    }

    // Wandering behavior - slowly rotating preferred direction
    shape.wanderAngle += (Math.random() - 0.5) * 0.15;
    shape.vx += Math.cos(shape.wanderAngle) * shape.wanderSpeed * 0.02;
    shape.vy += Math.sin(shape.wanderAngle) * shape.wanderSpeed * 0.02;

    // Apply velocity
    shape.x += shape.vx;
    shape.y += shape.vy;
    shape.rotation += shape.rotationSpeed;

    // Mouse interaction based on behavior phase
    if (state.mouseX > 0 && state.mouseY > 0) {
      const dx = state.mouseX - shape.x;
      const dy = state.mouseY - shape.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 300 && dist > 15) {
        if (shape.behaviorPhase === 'follow') {
          // Aggressive following during follow phase
          shape.vx += (dx / dist) * shape.followStrength;
          shape.vy += (dy / dist) * shape.followStrength;
        } else {
          // Disperse - flee from mouse
          shape.vx -= (dx / dist) * shape.disperseStrength;
          shape.vy -= (dy / dist) * shape.disperseStrength;
        }
      }
    }

    // Slightly less friction for faster movement
    shape.vx *= 0.992;
    shape.vy *= 0.992;

    const speed = Math.sqrt(shape.vx * shape.vx + shape.vy * shape.vy);

    // Higher minimum speed
    if (speed < 0.5) {
      const angle = Math.random() * Math.PI * 2;
      shape.vx = Math.cos(angle) * 0.8;
      shape.vy = Math.sin(angle) * 0.8;
    }

    // Higher max speed
    if (speed > 4.5) {
      shape.vx = (shape.vx / speed) * 4.5;
      shape.vy = (shape.vy / speed) * 4.5;
    }

    // Soft bounce
    const padding = 50;
    if (shape.x < padding) { shape.x = padding; shape.vx = Math.abs(shape.vx) * 0.7 + 0.5; }
    if (shape.x > w - padding) { shape.x = w - padding; shape.vx = -Math.abs(shape.vx) * 0.7 - 0.5; }
    if (shape.y < padding) { shape.y = padding; shape.vy = Math.abs(shape.vy) * 0.7 + 0.5; }
    if (shape.y > h - padding) { shape.y = h - padding; shape.vy = -Math.abs(shape.vy) * 0.7 - 0.5; }

    // Occasional color change
    if (Math.random() < 0.001) {
      shape.color = colors[Math.floor(Math.random() * colors.length)];
    }

    drawShape(shape);
  });

  requestAnimationFrame(updateBackgroundShapes);
}

export function onLetterChange(color) {
  state.backgroundShapes.forEach(shape => {
    if (Math.random() < 0.3) {
      shape.color = color;
    }

    // Random burst in any direction instead of pushing to corners
    const burstAngle = Math.random() * Math.PI * 2;
    const burstStrength = 0.8 + Math.random() * 1.2;
    shape.vx += Math.cos(burstAngle) * burstStrength;
    shape.vy += Math.sin(burstAngle) * burstStrength;

    // Slight rotation burst
    shape.rotationSpeed += (Math.random() - 0.5) * 0.5;

    shape.opacity = Math.min(0.4, shape.opacity + 0.1);
    setTimeout(() => {
      shape.opacity = 0.08 + Math.random() * 0.18;
    }, 500);
  });
}

// ============================================
// Background Floating Letters
// ============================================

export function createBackgroundLetter() {
  const letter = document.createElement('div');
  letter.className = 'bg-letter';
  letter.textContent = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  letter.style.left = `${Math.random() * 100}%`;
  letter.style.animationDuration = `${15 + Math.random() * 15}s`;
  letter.style.animationDelay = `${Math.random() * 5}s`;
  letter.style.fontSize = `${30 + Math.random() * 40}px`;
  letter.style.color = colors[Math.floor(Math.random() * colors.length)];
  elements.app.appendChild(letter);
  setTimeout(() => letter.remove(), 30000);
}

export function startBackgroundLetters() {
  // Create initial letters
  for (let i = 0; i < 5; i++) {
    setTimeout(createBackgroundLetter, i * 2000);
  }
  // Continue creating
  setInterval(createBackgroundLetter, 6000);
}
