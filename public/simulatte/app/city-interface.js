(function attachCityInterface(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCityInterface = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCityInterface() {
  function wireCameraControls(elements, renderer, signal, hooks = {}) {
    const on = (target, type, handler, options) => target.addEventListener(type, handler, { ...(options || {}), signal });
    const controls = [
      [elements.cameraFollow, 'follow'],
      [elements.cameraPov, 'pov'],
      [elements.cameraBird, 'overview'],
      [elements.cameraTop, 'top'],
      [elements.cameraFree, 'free'],
      [elements.cameraCompare, 'compare'],
    ];
    controls.forEach(([button, mode]) => on(button, 'click', () => {
      hooks.onManualNavigation?.({ control: 'mode', mode, targetIds: [] });
      const target = preferredCameraTarget(renderer.cameraTargets(), mode);
      if (target) {
        renderer.focusCameraTarget(target.id);
      }
      renderer.setCameraMode(mode);
      selectCameraMode(elements, mode);
    }));
  }

  function selectCameraMode(elements, mode) {
    const selectedMode = mode === 'bird' ? 'overview' : mode;
    [
      [elements.cameraFollow, 'follow'],
      [elements.cameraPov, 'pov'],
      [elements.cameraBird, 'overview'],
      [elements.cameraTop, 'top'],
      [elements.cameraFree, 'free'],
      [elements.cameraCompare, 'compare'],
    ].forEach(([button, buttonMode]) => {
      const active = buttonMode === selectedMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function preferredCameraTarget(targets, mode) {
    if (!['follow', 'pov', 'overview', 'compare'].includes(mode)) return null;
    return [...targets]
      .filter((target) => target.viewMode === mode || (mode === 'pov' && target.viewMode === 'follow'))
      .sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0))[0]
      || null;
  }

  function wireInterfaceControls(elements, signal) {
    const on = (target, type, handler, options) => target.addEventListener(type, handler, { ...(options || {}), signal });
    let lastDrawerTrigger = null;
    const popovers = [
      [elements.runtimeToggle, elements.runtimeDetails],
      [elements.dockMoreButton, elements.dockMoreMenu],
    ];

    function setPopover(button, panel, open) {
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    }

    function closeTransientPopovers(except = null) {
      popovers.forEach(([button, panel]) => {
        if (button !== except) setPopover(button, panel, false);
      });
    }

    function openDecisions(sectionId = null) {
      closeTransientPopovers();
      lastDrawerTrigger = document.activeElement;
      elements.decisionsDrawer.classList.add('is-open');
      elements.decisionsDrawer.setAttribute('aria-hidden', 'false');
      elements.decisionsButton.setAttribute('aria-expanded', 'true');
      elements.decisionsBackdrop.hidden = false;
      if (sectionId) {
        const section = document.getElementById(sectionId);
        for (let node = section; node && node !== elements.decisionsDrawer; node = node.parentElement) {
          if (node.tagName === 'DETAILS') node.open = true;
        }
        section?.scrollIntoView({ block: 'start' });
      }
      window.setTimeout(() => elements.decisionsClose.focus(), 0);
    }

    function closeDecisions({ restoreFocus = true } = {}) {
      elements.decisionsDrawer.classList.remove('is-open');
      elements.decisionsDrawer.setAttribute('aria-hidden', 'true');
      elements.decisionsButton.setAttribute('aria-expanded', 'false');
      elements.decisionsBackdrop.hidden = true;
      if (restoreFocus && lastDrawerTrigger instanceof HTMLElement) lastDrawerTrigger.focus();
    }

    popovers.forEach(([button, panel]) => on(button, 'click', () => {
      const open = panel.hidden;
      closeTransientPopovers(open ? button : null);
      setPopover(button, panel, open);
    }));
    on(elements.runtimeDetailsClose, 'click', () => setPopover(elements.runtimeToggle, elements.runtimeDetails, false));
    on(elements.dockMoreMenu, 'click', (event) => {
      if (event.target.closest('button')) setPopover(elements.dockMoreButton, elements.dockMoreMenu, false);
    });
    const sections = Array.from(elements.decisionsDrawer.querySelectorAll(':scope > details.evidence-section'));
    sections.forEach((section) => on(section, 'toggle', () => {
      if (!section.open) return;
      sections.forEach((other) => {
        if (other !== section) other.open = false;
      });
    }));
    const openJourney = () => openDecisions('journey-section');
    on(elements.journeyHud, 'click', openJourney);
    on(elements.journeyHud, 'keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openJourney();
    });
    on(elements.decisionsButton, 'click', () => openDecisions());
    on(elements.decisionsClose, 'click', () => closeDecisions());
    on(elements.decisionsBackdrop, 'click', () => closeDecisions());
    on(document, 'keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (elements.decisionsDrawer.classList.contains('is-open')) closeDecisions();
      else closeTransientPopovers();
    });
    on(document, 'pointerdown', (event) => {
      popovers.forEach(([button, panel]) => {
        if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) setPopover(button, panel, false);
      });
    });
    return { closeDecisions, openDecisions };
  }

  function setJourneyPhase(phase) {
    const allowed = new Set(['loading', 'ready', 'running', 'paused', 'completed', 'failed']);
    document.body.dataset.journeyPhase = allowed.has(phase) ? phase : 'ready';
  }

  function resizeMissionInput(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(150, Math.max(58, textarea.scrollHeight))}px`;
  }

  function clearMissionError(elements) {
    elements.missionError.textContent = '';
    elements.missionInput.removeAttribute('aria-invalid');
  }

  function isMissionInputError(error) {
    if (error?.name === 'AutonomyMissionError') return true;
    return /(_not_grounded|_ambiguous|_not_positive|source_text_missing|route_has_no_extent|ordered_stop_repeated|clock_time_invalid|arrival_deadline_precedes_departure)$/.test(String(error?.code || ''));
  }

  function friendlyMissionError(error) {
    const messages = {
      source_text_missing: 'Describe a supported trip or loop before starting.',
      task_not_grounded: 'Describe a trip between places or a loop around a declared circuit.',
      loop_task_not_grounded: 'For a loop, say around, circle, lap, or loop.',
      mode_not_grounded: 'Say whether to walk, run, bike, scooter, or drive.',
      origin_not_grounded: 'I cannot identify the starting place in the loaded regions.',
      destination_not_grounded: 'I cannot identify the destination in the loaded regions.',
      neural_place_not_grounded: 'Semantic matching could not identify that place safely.',
      circuit_not_grounded: 'I cannot identify a registered loop boundary for that place.',
      termination_not_grounded: 'Add a distance, lap count, or duration for this loop.',
      street_avoidance_not_grounded: 'I cannot identify that street in the loaded regions.',
      embodiment_not_available: 'That travel mode is not available in the loaded world.',
      route_has_no_extent: 'Choose different starting and ending places.',
    };
    if (messages[error?.code]) return messages[error.code];
    if (String(error?.code || '').includes('ambiguous')) return 'That place matches more than one loaded location. Be more specific.';
    return 'I could not ground this mission in the loaded map. Try a named place and a clear travel goal.';
  }

  function updateButtons(elements, running, hasController, status = 'active', hasJourneyStarted = false) {
    const isExperiment = elements.missionInput.ownerDocument.body.dataset.experienceShell === 'experiment';
    const completed = status === 'completed';
    const failed = status === 'failed';
    const paused = !running && hasJourneyStarted && status === 'active';
    const phase = running ? 'running' : completed ? 'completed' : failed ? 'failed' : paused ? 'paused' : 'ready';
    setJourneyPhase(phase);
    elements.missionInput.disabled = running;
    elements.placeResolutionLane.disabled = running;
    elements.shuffleButton.disabled = running;
    elements.startButton.disabled = running;
    elements.pauseButton.disabled = false;
    elements.stepButton.disabled = false;
    elements.resetButton.disabled = false;
    elements.exportButton.disabled = !hasController;
    elements.shuffleButton.hidden = !['ready', 'completed', 'failed'].includes(phase);
    elements.startButton.hidden = phase !== 'ready';
    elements.pauseButton.hidden = !running;
    elements.resumeButton.hidden = phase !== 'paused';
    elements.stepButton.hidden = !['running', 'paused'].includes(phase);
    elements.resetButton.hidden = !['running', 'paused'].includes(phase);
    elements.replayButton.hidden = !['completed', 'failed'].includes(phase);
    elements.newMissionButton.hidden = !['completed', 'failed'].includes(phase);
    elements.whatIfButton.hidden = isExperiment || phase !== 'completed';
    elements.dockMoreButton.hidden = isExperiment || !['running', 'paused', 'completed'].includes(phase);
    elements.dockMoreMenu.hidden = true;
    elements.dockMoreButton.setAttribute('aria-expanded', 'false');
  }

  return Object.freeze({ wireCameraControls, selectCameraMode, preferredCameraTarget, wireInterfaceControls, setJourneyPhase, resizeMissionInput, clearMissionError, isMissionInputError, friendlyMissionError, updateButtons });
});
