(function attachCityRunControls(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCityRunControls = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCityRunControlsModule() {
  function connect({ elements, on, isActive, isRunning, interactionMode, getPlayback, getController,
    getScenario, buildController, runLoop, stopLoop, resetJourney, selectRunCamera, selectNextScenario,
    focusPrimary, setPaused, onError }) {
    const safely = (operation) => async () => {
      if (!isActive()) return;
      try { await operation(); } catch (error) { if (isActive()) onError(error); }
    };
    const start = safely(async () => {
      if (interactionMode === 'playback') {
        selectRunCamera();
        const playback = getPlayback();
        if (playback.snapshot().phase === 'paused') await playback.resume();
        else await playback.start();
      } else {
        try { await runLoop(); } catch (error) { stopLoop(); throw error; }
      }
    });
    on(elements.startButton, 'click', start);
    on(elements.resumeButton, 'click', start);
    on(elements.newMissionButton, 'click', () => {
      stopLoop(); resetJourney({ clearController: true }); focusPrimary();
    });
    on(elements.shuffleButton, 'click', safely(async () => {
      if (!isRunning()) await selectNextScenario();
    }));
    on(elements.pauseButton, 'click', () => {
      const playback = getPlayback();
      if (playback) playback.pause(); else { stopLoop(); setPaused(); }
    });
    on(elements.stepButton, 'click', safely(async () => {
      const playback = getPlayback();
      if (playback) { await playback.step(); return; }
      stopLoop();
      let controller = getController();
      if (!controller || controller.snapshot().state.status !== 'active') controller = await buildController();
      if (isActive() && controller && controller === getController()) await controller.step();
    }));
    on(elements.resetButton, 'click', safely(async () => {
      stopLoop(); resetJourney();
      const playback = getPlayback();
      if (playback) await playback.reset(getScenario()); else await buildController();
    }));
    on(elements.replayButton, 'click', safely(async () => {
      const playback = getPlayback();
      if (playback) { await playback.replay(); return; }
      stopLoop(); resetJourney();
      try {
        await buildController({ keepMissionLocked: true });
        if (isActive()) await runLoop();
      } catch (error) { stopLoop(); throw error; }
    }));
    on(elements.playbackSpeed, 'change', () => getPlayback()?.setPlaybackRate(Number(elements.playbackSpeed.value)));
    on(elements.playbackTimeline, 'change', safely(() => getPlayback()?.seek(Number(elements.playbackTimeline.value))));
  }
  return Object.freeze({ connect });
});
