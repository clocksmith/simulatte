import { createTextureFromCanvas } from '../core/texture.js';
import { createSpriteSheetSelector, loadSpriteSheet, loopFrame } from './sprite-sheet-loader.js';

const ARCHETYPE_ICON_KEYS = [
  'gate',
  'library',
  'arcade',
  'citadel',
  'reactor',
  'archive',
  'spire',
  'campus',
  'forge',
  'vault',
  'garden',
  'plaza-glyph',
  'basin',
  'delta',
  'ridge',
  'plains'
];

function paintSpriteBackdrop(ctx, size, top = '#172036', bottom = '#0b101d') {
  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 2) {
    ctx.fillStyle = y % 4 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, y, size, 1);
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(0, size - 11, size, 11);
}

function isoProject(scene, x, y, z = 0) {
  return {
    x: scene.cx + (x - y) * scene.scale,
    y: scene.cy + (x + y) * scene.scale * 0.5 - z * scene.scale
  };
}

function fillPoly(ctx, points, fillStyle) {
  if (!points || points.length < 3) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function strokePoly(ctx, points, strokeStyle, width = 1) {
  if (!points || points.length < 2) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawIsoBlock(ctx, scene, block) {
  const x = block.x || 0;
  const y = block.y || 0;
  const z = block.z || 0;
  const w = block.w || 1;
  const d = block.d || 1;
  const h = block.h || 1;

  const a0 = isoProject(scene, x, y, z);
  const b0 = isoProject(scene, x + w, y, z);
  const c0 = isoProject(scene, x + w, y + d, z);
  const d0 = isoProject(scene, x, y + d, z);

  const a = isoProject(scene, x, y, z + h);
  const b = isoProject(scene, x + w, y, z + h);
  const c = isoProject(scene, x + w, y + d, z + h);
  const dTop = isoProject(scene, x, y + d, z + h);

  fillPoly(ctx, [b, c, c0, b0], block.east);
  fillPoly(ctx, [dTop, c, c0, d0], block.south);
  fillPoly(ctx, [a, b, c, dTop], block.top);

  const outline = block.outline || 'rgba(0,0,0,0.34)';
  strokePoly(ctx, [a, b, c, dTop], outline, 1);
  strokePoly(ctx, [b, c, c0, b0], outline, 1);
  strokePoly(ctx, [dTop, c, c0, d0], outline, 1);

  return {
    a,
    b,
    c,
    d: dTop,
    a0,
    b0,
    c0,
    d0,
    center: isoProject(scene, x + w * 0.5, y + d * 0.5, z + h)
  };
}

function drawArchetypeIcon(ctx, key, size) {
  const c = size * 0.5;
  const scene = {
    cx: c,
    cy: size * 0.74,
    scale: size / 15.5
  };

  const tone = {
    stone: { top: '#cfbe9d', east: '#9f8257', south: '#7e6746', outline: '#20160f' },
    steel: { top: '#b9c5dc', east: '#77829d', south: '#5e667d', outline: '#1a2234' },
    plum: { top: '#d9b4d2', east: '#99738f', south: '#7b5b70', outline: '#2a1e2a' },
    verdant: { top: '#9fd6ac', east: '#618f6d', south: '#4a6f55', outline: '#1d2a21' },
    cyan: { top: '#9fd8e7', east: '#5f97ab', south: '#4c7989', outline: '#1a2e36' },
    ember: { top: '#e6b193', east: '#a57658', south: '#855c45', outline: '#2b1a12' }
  };

  paintSpriteBackdrop(ctx, size, '#1a2337', '#0b111f');
  drawIsoBlock(ctx, scene, {
    x: 1.2,
    y: 1.2,
    z: 0,
    w: 5.6,
    d: 5.6,
    h: 0.7,
    top: '#3a4462',
    east: '#242d44',
    south: '#1e263b',
    outline: '#121826'
  });

  switch (key) {
    case 'gate': {
      drawIsoBlock(ctx, scene, { x: 1.6, y: 3.0, z: 0.7, w: 1.2, d: 1.2, h: 3.8, ...tone.stone });
      drawIsoBlock(ctx, scene, { x: 5.2, y: 3.0, z: 0.7, w: 1.2, d: 1.2, h: 3.8, ...tone.stone });
      drawIsoBlock(ctx, scene, { x: 2.8, y: 3.0, z: 3.3, w: 2.4, d: 1.2, h: 1.2, ...tone.stone });
      const arch = isoProject(scene, 4.0, 3.6, 1.5);
      ctx.fillStyle = 'rgba(20, 14, 10, 0.56)';
      ctx.beginPath();
      ctx.ellipse(arch.x, arch.y, 2.6, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'garden': {
      drawIsoBlock(ctx, scene, { x: 2.2, y: 2.2, z: 0.7, w: 3.6, d: 3.6, h: 0.9, ...tone.verdant });
      const treeA = isoProject(scene, 3.0, 3.0, 2.6);
      const treeB = isoProject(scene, 4.8, 3.4, 2.9);
      const treeC = isoProject(scene, 4.0, 4.8, 2.5);
      ctx.fillStyle = '#8de0a3';
      ctx.beginPath();
      ctx.arc(treeA.x, treeA.y, 4, 0, Math.PI * 2);
      ctx.arc(treeB.x, treeB.y, 4.2, 0, Math.PI * 2);
      ctx.arc(treeC.x, treeC.y, 3.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'plaza-glyph': {
      const hub = drawIsoBlock(ctx, scene, { x: 2.1, y: 2.1, z: 0.7, w: 3.8, d: 3.8, h: 1.4, ...tone.plum });
      ctx.strokeStyle = '#f2d3ff';
      ctx.lineWidth = 1.4;
      strokePoly(ctx, [hub.a, hub.b, hub.c, hub.d], '#f2d3ff', 1.4);
      const g0 = isoProject(scene, 4.0, 4.0, 2.8);
      const g1 = isoProject(scene, 4.0, 3.0, 2.2);
      const g2 = isoProject(scene, 5.0, 4.0, 2.2);
      const g3 = isoProject(scene, 4.0, 5.0, 2.2);
      const g4 = isoProject(scene, 3.0, 4.0, 2.2);
      strokePoly(ctx, [g1, g2, g3, g4], '#f7e5ff', 1.2);
      ctx.fillStyle = '#ffe9ff';
      ctx.fillRect(g0.x - 1, g0.y - 1, 2, 2);
      break;
    }
    case 'citadel': {
      drawIsoBlock(ctx, scene, { x: 2.0, y: 2.0, z: 0.7, w: 4.0, d: 3.9, h: 2.6, ...tone.plum });
      drawIsoBlock(ctx, scene, { x: 1.6, y: 2.2, z: 0.7, w: 1.1, d: 1.1, h: 3.8, ...tone.plum });
      drawIsoBlock(ctx, scene, { x: 5.3, y: 2.2, z: 0.7, w: 1.1, d: 1.1, h: 3.8, ...tone.plum });
      break;
    }
    case 'basin': {
      const basin = drawIsoBlock(ctx, scene, { x: 2.0, y: 2.0, z: 0.7, w: 4.0, d: 4.0, h: 0.8, ...tone.cyan });
      ctx.fillStyle = 'rgba(180, 236, 255, 0.55)';
      ctx.beginPath();
      ctx.ellipse(basin.center.x, basin.center.y + 1, 7.5, 4.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(220, 248, 255, 0.7)';
      ctx.stroke();
      break;
    }
    case 'delta': {
      drawIsoBlock(ctx, scene, { x: 1.9, y: 2.2, z: 0.7, w: 4.2, d: 3.5, h: 0.8, ...tone.cyan });
      const root = isoProject(scene, 4.0, 2.6, 1.6);
      const l = isoProject(scene, 2.4, 5.4, 1.1);
      const r = isoProject(scene, 5.6, 5.4, 1.1);
      ctx.strokeStyle = '#c7f2ff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(root.x, root.y);
      ctx.lineTo(l.x, l.y);
      ctx.moveTo(root.x, root.y);
      ctx.lineTo(r.x, r.y);
      ctx.moveTo(root.x, root.y);
      ctx.lineTo(root.x, isoProject(scene, 4.0, 4.9, 1.2).y);
      ctx.stroke();
      break;
    }
    case 'ridge': {
      drawIsoBlock(ctx, scene, { x: 1.8, y: 2.3, z: 0.7, w: 4.4, d: 3.4, h: 0.8, ...tone.stone });
      drawIsoBlock(ctx, scene, { x: 2.3, y: 2.7, z: 1.5, w: 1.2, d: 1.1, h: 2.4, ...tone.stone });
      drawIsoBlock(ctx, scene, { x: 3.9, y: 3.2, z: 1.5, w: 1.6, d: 1.3, h: 3.0, ...tone.stone });
      break;
    }
    case 'plains': {
      drawIsoBlock(ctx, scene, { x: 2.0, y: 2.0, z: 0.7, w: 4.0, d: 4.0, h: 0.8, ...tone.verdant });
      ctx.strokeStyle = '#c3f4cc';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i += 1) {
        const stem = isoProject(scene, 2.5 + i * 0.55, 4.8 - i * 0.2, 1.6 + (i % 2) * 0.4);
        ctx.beginPath();
        ctx.moveTo(stem.x, stem.y + 4);
        ctx.lineTo(stem.x + 1.8, stem.y - 2.2);
        ctx.stroke();
      }
      break;
    }
    case 'forge': {
      drawIsoBlock(ctx, scene, { x: 2.0, y: 2.3, z: 0.7, w: 4.1, d: 3.3, h: 2.0, ...tone.ember });
      const stack = drawIsoBlock(ctx, scene, { x: 5.0, y: 2.6, z: 2.7, w: 0.8, d: 0.8, h: 2.5, ...tone.stone });
      ctx.fillStyle = '#ff9a6f';
      ctx.beginPath();
      ctx.moveTo(stack.center.x, stack.center.y - 3.4);
      ctx.lineTo(stack.center.x + 2.8, stack.center.y - 8.2);
      ctx.lineTo(stack.center.x - 0.2, stack.center.y - 7.4);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'vault': {
      drawIsoBlock(ctx, scene, { x: 2.0, y: 2.2, z: 0.7, w: 4.0, d: 3.8, h: 2.6, ...tone.steel });
      const door = isoProject(scene, 4.9, 4.2, 1.9);
      ctx.strokeStyle = '#e8f3ff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(door.x, door.y, 3.4, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'reactor': {
      drawIsoBlock(ctx, scene, { x: 2.3, y: 2.3, z: 0.7, w: 3.6, d: 3.3, h: 2.2, ...tone.cyan });
      const dome = isoProject(scene, 4.1, 3.9, 3.3);
      ctx.fillStyle = 'rgba(196, 239, 255, 0.85)';
      ctx.beginPath();
      ctx.ellipse(dome.x, dome.y, 5.6, 3.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d9f8ff';
      ctx.stroke();
      break;
    }
    case 'archive': {
      drawIsoBlock(ctx, scene, { x: 2.1, y: 2.2, z: 0.7, w: 3.9, d: 3.6, h: 2.1, ...tone.steel });
      drawIsoBlock(ctx, scene, { x: 2.5, y: 2.6, z: 2.8, w: 3.1, d: 1.0, h: 0.7, ...tone.plum });
      break;
    }
    case 'library': {
      drawIsoBlock(ctx, scene, { x: 2.0, y: 2.2, z: 0.7, w: 4.0, d: 3.8, h: 1.9, ...tone.plum });
      for (let i = 0; i < 4; i += 1) {
        drawIsoBlock(ctx, scene, { x: 2.4 + i * 0.88, y: 4.5, z: 0.7, w: 0.45, d: 0.45, h: 1.3, ...tone.stone });
      }
      break;
    }
    case 'arcade': {
      drawIsoBlock(ctx, scene, { x: 2.6, y: 2.0, z: 0.7, w: 3.0, d: 3.8, h: 2.6, ...tone.cyan });
      const screen = isoProject(scene, 4.0, 4.3, 2.2);
      ctx.fillStyle = '#1f385e';
      ctx.fillRect(screen.x - 4, screen.y - 2, 8, 4);
      ctx.fillStyle = '#d6f0ff';
      ctx.fillRect(screen.x - 2, screen.y + 3, 4, 1.5);
      break;
    }
    case 'campus': {
      drawIsoBlock(ctx, scene, { x: 1.8, y: 2.8, z: 0.7, w: 2.1, d: 2.5, h: 1.8, ...tone.verdant });
      drawIsoBlock(ctx, scene, { x: 4.2, y: 2.1, z: 0.7, w: 2.1, d: 2.8, h: 2.5, ...tone.verdant });
      break;
    }
    case 'spire': {
      drawIsoBlock(ctx, scene, { x: 3.6, y: 3.1, z: 0.7, w: 0.9, d: 0.9, h: 5.3, ...tone.steel });
      const tip = isoProject(scene, 4.05, 3.55, 6.6);
      ctx.fillStyle = '#eaf2ff';
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y - 3.1);
      ctx.lineTo(tip.x + 2.2, tip.y);
      ctx.lineTo(tip.x - 2.2, tip.y);
      ctx.closePath();
      ctx.fill();
      break;
    }
    default: {
      drawIsoBlock(ctx, scene, { x: 2.3, y: 2.3, z: 0.7, w: 3.6, d: 3.6, h: 2.1, ...tone.steel });
    }
  }

  ctx.strokeStyle = 'rgba(227, 238, 255, 0.26)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
}

function drawLandmarkIcon(ctx, key, size) {
  const c = size * 0.5;
  const scene = {
    cx: c,
    cy: size * 0.74,
    scale: size / 17
  };

  paintSpriteBackdrop(ctx, size, '#211734', '#100d1a');
  drawIsoBlock(ctx, scene, {
    x: 1.3,
    y: 1.3,
    z: 0,
    w: 5.4,
    d: 5.4,
    h: 0.7,
    top: '#4d325f',
    east: '#321f41',
    south: '#281834',
    outline: '#1b1023'
  });

  const markTone = {
    top: '#d6c7ff',
    east: '#9784bd',
    south: '#77669a',
    outline: '#2a2137'
  };

  switch (key) {
    case 'relay-south': {
      drawIsoBlock(ctx, scene, { x: 3.5, y: 3.4, z: 0.7, w: 0.8, d: 0.8, h: 4.6, ...markTone });
      const ring = isoProject(scene, 3.9, 3.8, 5.7);
      ctx.strokeStyle = '#efe8ff';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, 3.3, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'mirror-canal': {
      const p0 = isoProject(scene, 2.1, 4.8, 1.2);
      const p1 = isoProject(scene, 3.9, 2.4, 1.5);
      const p2 = isoProject(scene, 5.8, 4.8, 1.2);
      ctx.strokeStyle = '#b8e5ff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
      ctx.stroke();
      break;
    }
    case 'archive-node': {
      drawIsoBlock(ctx, scene, { x: 2.3, y: 2.7, z: 0.7, w: 3.4, d: 3.0, h: 2.2, ...markTone });
      drawIsoBlock(ctx, scene, { x: 2.6, y: 3.0, z: 3.2, w: 2.8, d: 0.8, h: 0.6, ...markTone });
      break;
    }
    case 'kernel-obelisk': {
      drawIsoBlock(ctx, scene, { x: 3.4, y: 3.2, z: 0.7, w: 1.0, d: 1.0, h: 4.9, ...markTone });
      const tip = isoProject(scene, 3.9, 3.7, 6.2);
      ctx.fillStyle = '#efe8ff';
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y - 2.7);
      ctx.lineTo(tip.x + 2.0, tip.y);
      ctx.lineTo(tip.x - 2.0, tip.y);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'aurora-garden': {
      drawIsoBlock(ctx, scene, { x: 2.2, y: 2.2, z: 0.7, w: 3.8, d: 3.8, h: 0.8, top: '#9edec1', east: '#649b82', south: '#4f7d68', outline: '#1e2e26' });
      const bloomA = isoProject(scene, 3.1, 3.5, 2.4);
      const bloomB = isoProject(scene, 4.8, 3.2, 2.7);
      const bloomC = isoProject(scene, 4.2, 4.8, 2.5);
      ctx.fillStyle = '#c5ffe6';
      ctx.beginPath();
      ctx.arc(bloomA.x, bloomA.y, 2.4, 0, Math.PI * 2);
      ctx.arc(bloomB.x, bloomB.y, 2.7, 0, Math.PI * 2);
      ctx.arc(bloomC.x, bloomC.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'echo-lake': {
      const basin = drawIsoBlock(ctx, scene, { x: 2.2, y: 2.4, z: 0.7, w: 3.8, d: 3.6, h: 0.7, top: '#8dc5df', east: '#4f8199', south: '#3f6880', outline: '#182a35' });
      ctx.strokeStyle = 'rgba(212, 243, 255, 0.85)';
      ctx.beginPath();
      ctx.ellipse(basin.center.x, basin.center.y + 1.5, 5.2, 2.9, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'compass-grove': {
      const center = isoProject(scene, 4.0, 4.0, 1.8);
      ctx.strokeStyle = '#efe8ff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y - 7);
      ctx.lineTo(center.x, center.y + 7);
      ctx.moveTo(center.x - 7, center.y);
      ctx.lineTo(center.x + 7, center.y);
      ctx.stroke();
      ctx.fillStyle = '#ffdff0';
      ctx.beginPath();
      ctx.moveTo(center.x, center.y - 7);
      ctx.lineTo(center.x + 2.6, center.y - 2.2);
      ctx.lineTo(center.x - 2.6, center.y - 2.2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'glitch-mural': {
      drawIsoBlock(ctx, scene, { x: 2.1, y: 2.8, z: 0.7, w: 3.8, d: 2.6, h: 1.9, ...markTone });
      const wall = isoProject(scene, 5.7, 4.8, 1.9);
      for (let y = 0; y < 3; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          if ((x + y) % 2 === 0) {
            ctx.fillStyle = 'rgba(244, 186, 255, 0.8)';
            ctx.fillRect(wall.x - 12 + x * 4, wall.y - 9 + y * 3, 3, 2);
          }
        }
      }
      break;
    }
    default: {
      drawIsoBlock(ctx, scene, { x: 2.4, y: 2.4, z: 0.7, w: 3.2, d: 3.2, h: 2.0, ...markTone });
    }
  }

  ctx.strokeStyle = 'rgba(245, 236, 255, 0.24)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
}

const WORLD_FX_SHEET_URL = '/assets/sprites/simulatte_world_fx.png';
const PRISM_SHEET_URL = '/assets/sprites/simulatte_prism_buildings.png';
const WORLD_LABEL_SHEET_URL = '/assets/sprites/simulatte_world_labels.png';

const LANDMARK_SHEET_URLS = {
  'relay-south': '/assets/sprites/simulatte_landmarks_relay-south.png',
  'mirror-canal': '/assets/sprites/simulatte_landmarks_mirror-canal.png',
  'archive-node': '/assets/sprites/simulatte_landmarks_archive-node.png',
  'kernel-obelisk': '/assets/sprites/simulatte_landmarks_kernel-obelisk.png',
  'aurora-garden': '/assets/sprites/simulatte_landmarks_aurora-garden.png',
  'echo-lake': '/assets/sprites/simulatte_landmarks_echo-lake.png',
  'compass-grove': '/assets/sprites/simulatte_landmarks_compass-grove.png',
  'glitch-mural': '/assets/sprites/simulatte_landmarks_glitch-mural.png'
};

const PRISM_COLUMN_BY_ARCHETYPE = {
  gate: 0,
  spire: 0,
  citadel: 0,
  ridge: 0,
  reactor: 1,
  archive: 1,
  vault: 1,
  arcade: 1,
  library: 2,
  campus: 2,
  forge: 2,
  garden: 2,
  'plaza-glyph': 2,
  basin: 2,
  delta: 2,
  plains: 2
};

const REGION_LABEL_FRAME_BY_COLOR = {
  neutral: 0,
  purple: 2,
  green: 3,
  red: 4
};

function landmarkFrameIndex(elapsedSec, discovered) {
  if (discovered) {
    return loopFrame(5, 6, elapsedSec, 7);
  }

  if (Math.sin(Math.max(0, elapsedSec) * 0.9) > 0.9) {
    return 0;
  }
  return loopFrame(1, 4, elapsedSec, 2.4);
}

function prismFrameIndex(region) {
  const col = PRISM_COLUMN_BY_ARCHETYPE[region.archetype] ?? 1;
  const baseElevation = Number.isFinite(region.elevation)
    ? region.elevation
    : (region.kind === 'private' ? 44 : 38);

  let row = 0;
  if (baseElevation >= 48) {
    row = 3;
  } else if (baseElevation >= 43) {
    row = 2;
  } else if (baseElevation >= 37) {
    row = 1;
  }

  if (region.selected) {
    row = Math.min(3, row + 1);
  }

  return row * 3 + col;
}

function regionLabelFrame(region) {
  if (!region.unlocked) {
    return 5; // locked
  }
  if (region.completed) {
    return 6; // completed
  }
  if (region.kind === 'private') {
    return 4; // amber
  }
  return REGION_LABEL_FRAME_BY_COLOR[region.color] ?? 1; // neutral/cyan
}

export function createSpriteTextures(gl, worldConfig) {
  const fallback = new Map();
  const selector = createSpriteSheetSelector();

  const createSprite = (key, drawer, size = 64) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    drawer(ctx, key, size);
    fallback.set(key, createTextureFromCanvas(gl, canvas, { filter: 'nearest' }));
  };

  for (const key of ARCHETYPE_ICON_KEYS) {
    createSprite(`arch:${key}`, (ctx, id, size) => drawArchetypeIcon(ctx, key, size));
  }

  createSprite('arch:default', (ctx, id, size) => drawArchetypeIcon(ctx, 'default', size));

  for (const mark of worldConfig.landmarks) {
    createSprite(`landmark:${mark.id}`, (ctx, id, size) => drawLandmarkIcon(ctx, mark.id, size), 56);
  }

  createSprite('cursor', (ctx, id, size) => {
    const c = size * 0.5;
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#d8e8ff';
    ctx.beginPath();
    ctx.moveTo(c, c - 13);
    ctx.lineTo(c + 10, c + 1);
    ctx.lineTo(c + 4, c + 1);
    ctx.lineTo(c + 4, c + 13);
    ctx.lineTo(c - 4, c + 13);
    ctx.lineTo(c - 4, c + 1);
    ctx.lineTo(c - 10, c + 1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#9dc0ff';
    ctx.stroke();
  }, 32);

  loadSpriteSheet(gl, WORLD_FX_SHEET_URL, {
    frameWidth: 64,
    frameHeight: 64,
    columns: 4,
    rows: 4,
    frameCount: 16,
    insetPx: 0.5,
    filter: 'nearest'
  }).then((sheet) => {
    if (sheet) {
      selector.register('world-fx', sheet);
    }
  });

  loadSpriteSheet(gl, PRISM_SHEET_URL, {
    frameWidth: 96,
    frameHeight: 96,
    columns: 3,
    rows: 4,
    frameCount: 12,
    insetPx: 0.5,
    filter: 'nearest'
  }).then((sheet) => {
    if (sheet) {
      selector.register('prism-buildings', sheet);
    }
  });

  loadSpriteSheet(gl, WORLD_LABEL_SHEET_URL, {
    frameWidth: 256,
    frameHeight: 40,
    columns: 8,
    rows: 1,
    frameCount: 8,
    insetPx: 0.5,
    filter: 'nearest'
  }).then((sheet) => {
    if (sheet) {
      selector.register('world-labels', sheet);
    }
  });

  for (const mark of worldConfig.landmarks) {
    const url = LANDMARK_SHEET_URLS[mark.id];
    if (!url) {
      continue;
    }
    loadSpriteSheet(gl, url, {
      frameWidth: 128,
      frameHeight: 128,
      columns: 4,
      rows: 3,
      frameCount: 11,
      insetPx: 0.5,
      filter: 'nearest'
    }).then((sheet) => {
      if (sheet) {
        selector.register(`landmark:${mark.id}`, sheet);
      }
    });
  }

  return {
    get(key) {
      return fallback.get(key) || null;
    },
    getCursor(elapsedSec = 0) {
      return selector.select('world-fx', 0) || fallback.get('cursor') || null;
    },
    getWorldFx(frameIndex) {
      return selector.select('world-fx', frameIndex) || null;
    },
    getPrism(region) {
      const prism = selector.select('prism-buildings', prismFrameIndex(region));
      if (prism) {
        return prism;
      }
      return fallback.get(`arch:${region.archetype}`) || fallback.get('arch:default') || null;
    },
    getLandmark(markId, elapsedSec = 0, discovered = false) {
      const frameIndex = landmarkFrameIndex(elapsedSec, discovered);
      return selector.select(`landmark:${markId}`, frameIndex) || fallback.get(`landmark:${markId}`) || null;
    },
    getRegionLabelPlate(region) {
      return selector.select('world-labels', regionLabelFrame(region));
    },
    getLandmarkLabelPlate(discovered = false) {
      return selector.select('world-labels', discovered ? 6 : 1);
    }
  };
}
