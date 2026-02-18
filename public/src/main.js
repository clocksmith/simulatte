import { WORLD_CONFIG } from './config/world.js';
import { MUSIC_CONFIG } from './config/music.js';
import { WorldModel } from './game/world-model.js';
import { IsoWorldRenderer } from './render/iso-world-renderer.js';
import { MusicEngine } from './audio/music-engine.js';
import { HudController } from './ui/hud-controller.js';
import { SYSTEM_COPY } from './strings/system-copy.js';

const canvas = document.getElementById('worldCanvas');

const world = new WorldModel(WORLD_CONFIG);
const renderer = new IsoWorldRenderer(canvas, WORLD_CONFIG);
const music = new MusicEngine(MUSIC_CONFIG);
const hud = new HudController(document);

let worldView = world.getViewModel();

function refreshHud() {
  worldView = world.getViewModel();
  hud.render(worldView, music.getViewModel());
}

function wakeAudio() {
  music.startFromGesture();
}

function applyResult(result, options = {}) {
  const opts = {
    moveSound: false,
    ...options
  };

  if (opts.moveSound) {
    music.playMove();
  }

  if (result.selectedChanged || result.challengeOpened || result.challengeResolved) {
    music.playSelect();
  }

  if (result.landmarkPulse) {
    music.pulseFromLandmark();
  }

  if (result.musicChanges && result.musicChanges.length > 0) {
    music.queueChanges(result.musicChanges);
  }

  if (result.status) {
    const lower = result.status.toLowerCase();
    if (lower.includes('no region') || lower.includes('sealed') || lower.includes('incorrect')) {
      music.playError();
    }
  }

  refreshHud();
}

function moveCursor(dx, dy, withSound = true) {
  const before = worldView.cursor;
  const result = world.moveCursor(dx, dy);
  const after = world.getViewModel().cursor;
  const moved = before.x !== after.x || before.y !== after.y;

  applyResult(result, { moveSound: withSound && moved });
}

function setCursorToTile(tile, withSound = false) {
  if (!tile) {
    return;
  }

  const before = worldView.cursor;
  const result = world.setCursor(tile.x, tile.y);
  const after = world.getViewModel().cursor;
  const moved = before.x !== after.x || before.y !== after.y;

  applyResult(result, { moveSound: withSound && moved });
}

function handleDirection(dir) {
  wakeAudio();

  if (dir === 'up') {
    moveCursor(0, -1);
  } else if (dir === 'down') {
    moveCursor(0, 1);
  } else if (dir === 'left') {
    moveCursor(-1, 0);
  } else if (dir === 'right') {
    moveCursor(1, 0);
  } else if (dir === 'enter') {
    const result = world.lockSelectionAtCursor();
    applyResult(result);
  }
}

function runInteraction() {
  wakeAudio();
  const pre = world.getViewModel();
  if (!pre.selectedRegionId && pre.focusRegion && pre.focusRegion.unlocked) {
    const lockResult = world.lockSelectionAtCursor();
    applyResult(lockResult);
  }

  const result = world.beginInteraction();
  applyResult(result);
}

function answerInteraction(optionIndex) {
  wakeAudio();
  const result = world.answerInteraction(optionIndex);
  applyResult(result);
}

function showAtlasSummary() {
  const latest = world.getViewModel();
  if (!latest.summaryUnlocked) {
    return;
  }

  const origin = latest.regions.find((region) => region.id === 'origin-gate');
  const mission = origin?.dossier?.mission
    || SYSTEM_COPY.atlas.missionFallback;
  const vision = origin?.dossier?.vision
    || SYSTEM_COPY.atlas.visionFallback;

  const regionRows = latest.regions
    .map((region) => {
      const status = region.completed ? '[x]' : '[ ]';
      const access = region.unlocked ? 'open' : 'locked';
      const lines = [
        `${status} ${region.name} (${region.domain}) [${region.kind}] [${access}]`,
        `  ${SYSTEM_COPY.atlas.regionMissionLabel}: ${region.dossier?.mission || region.summary}`,
        region.dossier?.vision ? `  ${SYSTEM_COPY.atlas.regionVisionLabel}: ${region.dossier.vision}` : null,
        region.dossier?.relation ? `  ${SYSTEM_COPY.atlas.regionRoleLabel}: ${region.dossier.relation}` : null,
        region.dossier?.why ? `  ${SYSTEM_COPY.atlas.regionWhyLabel}: ${region.dossier.why}` : null,
        region.dossier?.funFact ? `  ${SYSTEM_COPY.atlas.regionFunFactLabel}: ${region.dossier.funFact}` : null
      ].filter(Boolean);
      return lines.join('\n');
    })
    .join('\n\n');

  const summary = [
    SYSTEM_COPY.atlas.title,
    '',
    SYSTEM_COPY.atlas.companyLabel,
    SYSTEM_COPY.atlas.companyName,
    '',
    SYSTEM_COPY.atlas.missionLabel,
    mission,
    '',
    SYSTEM_COPY.atlas.visionLabel,
    vision,
    '',
    SYSTEM_COPY.atlas.chainLabel,
    SYSTEM_COPY.atlas.chainText,
    '',
    SYSTEM_COPY.atlas.dossiersLabel,
    regionRows
  ].join('\n');

  window.alert(summary);
}

function toggleBgm() {
  const next = !music.getViewModel().enabled;
  music.setEnabled(next);
  refreshHud();
}

function toggleSfx() {
  const next = !music.getViewModel().sfxEnabled;
  music.setSfxEnabled(next);
  refreshHud();
}

function bindControls() {
  hud.setCallbacks({
    onDirection: handleDirection,
    onInteract: runInteraction,
    onSummary: showAtlasSummary,
    onAnswer: answerInteraction,
    onToggleBgm: toggleBgm,
    onToggleSfx: toggleSfx
  });

  window.addEventListener('keydown', (event) => {
    const key = event.key;
    if (key === 'ArrowUp') {
      event.preventDefault();
      handleDirection('up');
      return;
    }
    if (key === 'ArrowDown') {
      event.preventDefault();
      handleDirection('down');
      return;
    }
    if (key === 'ArrowLeft') {
      event.preventDefault();
      handleDirection('left');
      return;
    }
    if (key === 'ArrowRight') {
      event.preventDefault();
      handleDirection('right');
      return;
    }
    if (key === 'Enter') {
      event.preventDefault();
      handleDirection('enter');
    }
  });

  canvas.addEventListener('mousemove', (event) => {
    const tile = renderer.pickTile(event.clientX, event.clientY);
    setCursorToTile(tile, false);
  });

  canvas.addEventListener('click', (event) => {
    wakeAudio();
    const tile = renderer.pickTile(event.clientX, event.clientY);
    setCursorToTile(tile, true);
    const lockResult = world.lockSelectionAtCursor();
    applyResult(lockResult);
  });

  let touchStart = null;
  canvas.addEventListener('touchstart', (event) => {
    if (!event.changedTouches || event.changedTouches.length === 0) {
      return;
    }
    wakeAudio();
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });

  canvas.addEventListener('touchend', (event) => {
    if (!touchStart || !event.changedTouches || event.changedTouches.length === 0) {
      return;
    }

    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 20) {
      const tile = renderer.pickTile(touch.clientX, touch.clientY);
      setCursorToTile(tile, true);
      const lockResult = world.lockSelectionAtCursor();
      applyResult(lockResult);
    } else if (Math.abs(dx) > Math.abs(dy)) {
      handleDirection(dx > 0 ? 'right' : 'left');
    } else {
      handleDirection(dy > 0 ? 'down' : 'up');
    }

    touchStart = null;
  }, { passive: true });

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      music.stop();
    } else if (music.getViewModel().enabled) {
      music.startFromGesture();
    }
  });
}

function onResize() {
  renderer.resize(window.innerWidth, window.innerHeight);
}

function frame(nowMs) {
  renderer.render(worldView, nowMs);
  requestAnimationFrame(frame);
}

function boot() {
  onResize();
  bindControls();

  music.setTransportListener(() => {
    hud.render(worldView, music.getViewModel());
  });

  refreshHud();
  requestAnimationFrame(frame);
}

boot();
