(function attachSimulatteMainControllerBuilder(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteMainControllerBuilder = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSimulatteMainControllerBuilder() {
  function create(options) {
    const {
      elements,
      data,
      interaction,
      worldApi,
      ensureRenderer,
      nextRevision,
      currentRevision,
      clearMissionError,
      extensions,
      getRenderer,
      setActiveState,
      renderPluginExperience,
      renderIdentity,
      setRuntimeStatus,
      setJourneyPhase,
      updateButtons,
      hasJourneyStarted,
      modelSelection,
      runtimeLoaderApi,
      neuralPlaceApi,
      hostRoot,
      getPlaceResolver,
      setPlaceResolver,
      missionApi,
      applyPluginMissionContributions,
      log,
      renderPlaceResolution,
      yieldToFrame,
      controllerApi,
      traceView,
      runtimeLabel,
      setRetrievalLaneLogged,
      isRetrievalLaneLogged,
      setTerminalJourneyLogged,
      isTerminalJourneyLogged,
      recordJourney,
      stopLoop,
      renderPlanning,
    } = options;

    async function build({ keepMissionLocked = false } = {}) {
      const revision = nextRevision();
      const isCurrent = () => revision === currentRevision();
      clearMissionError(elements);
      const requestedSourceText = elements.missionInput.value;
      const preflightContributions = await extensions.contributeRequest({
        sourceText: requestedSourceText,
      });
      if (!isCurrent()) return null;
      const sourceOverrides = preflightContributions.filter((row) => row.executableSourceText);
      if (sourceOverrides.length > 1) {
        throw new Error(`Plugin request conflict: ${sourceOverrides.map((row) => row.pluginId).join(', ')} proposed executable source`);
      }
      const executableSourceText = sourceOverrides[0]?.executableSourceText || requestedSourceText;
      if (interaction.mode === 'playback') {
        return buildPlayback({
          isCurrent,
          keepMissionLocked,
        });
      }

      const placeSelection = modelSelection.selectedRuntimeRef('place-resolution');
      const useNeuralPlaces = placeSelection.kind === 'embedding';
      if (useNeuralPlaces && await modelSelection.ensureConsent() !== true) {
        throw new Error('Selected place model requires local model consent');
      }
      if (!isCurrent()) return null;
      let placeResolver = getPlaceResolver();
      if (useNeuralPlaces && !placeResolver) {
        await runtimeLoaderApi.loadOptionalModel();
        if (!isCurrent()) return null;
        const activeNeuralPlaceApi = neuralPlaceApi || hostRoot.SimulatteNeuralPlaceResolver;
        if (!activeNeuralPlaceApi?.createPlaceResolver) {
          throw new Error('Neural place resolver failed to load');
        }
        placeResolver = activeNeuralPlaceApi.createPlaceResolver({
          index: data.placeEmbeddingIndex,
          modelLock: data.modelRuntimeLock,
          onProgress(event) {
            if (event?.phase === 'ready') {
              setRuntimeStatus(elements, 'Ready', 'ready');
              elements.placeLaneNote.textContent = 'Semantic test ready. It currently adds no diagnostic matches.';
            } else if (event?.percent != null) {
              setRuntimeStatus(elements, `Loading semantic matching ${Math.round(event.percent)}%`, 'loading');
              elements.placeLaneNote.textContent = `Downloading semantic matching ${Math.round(event.percent)}%.`;
            }
          },
        });
        setPlaceResolver(placeResolver);
      }
      const mission = useNeuralPlaces && sourceOverrides.length === 0
        ? await missionApi.compileMissionWithResolver(
          executableSourceText,
          data.world,
          data.embodiments,
          placeResolver,
        )
        : missionApi.compileMission(executableSourceText, data.world, data.embodiments);
      if (!isCurrent()) return null;
      const pluginContributions = await extensions.contributeRequest({
        sourceText: requestedSourceText,
        executableSourceText,
        mission,
      });
      if (!isCurrent()) return null;
      applyPluginMissionContributions(mission, pluginContributions);
      log.info('mission.compiled', {
        missionId: mission.id,
        sourceText: requestedSourceText,
        executableSourceText,
        embodimentId: mission.embodimentId,
        task: mission.task,
        constraints: mission.constraints,
        grounding: mission.grounding,
        placeResolution: mission.placeResolution,
        modelSelection: modelSelection.receipt(),
      });
      renderPlaceResolution(elements, mission, placeResolver?.receipt() || null, data.placeResolutionEvidence);
      await yieldToFrame();
      if (!isCurrent()) return null;
      const embodiment = data.embodiments.find((row) => row.id === mission.embodimentId);
      if (!embodiment) throw new Error(`Mission selected unavailable embodiment ${mission.embodimentId}`);
      const nextController = controllerApi.createAutonomyController({
        world: data.world,
        featureCatalog: data.featureCatalog,
        occurrenceCatalog: data.occurrenceCatalog,
        routeContributors: extensions.routeContributors({ mission }),
        routeObjective: data.applicationProfile.routeObjective,
        embodiment,
        policy: data.policy,
        mission,
        regionComposition: data.regionComposition,
        onTick: ({ entry, snapshot }) => {
          getRenderer().render(snapshot, entry.payload);
          traceView.renderTick(entry, snapshot);
          setRuntimeStatus(elements, runtimeLabel(snapshot.state), snapshot.state.status);
          const retrieval = entry.payload?.observation?.featureRetrieval;
          if (!isRetrievalLaneLogged() && retrieval) {
            setRetrievalLaneLogged(true);
            log.info('retrieval.lane.executed', {
              missionId: mission.id,
              method: retrieval.method,
              reranker: retrieval.reranker,
              modelExecution: retrieval.modelExecution,
              counts: retrieval.counts,
            });
          }
          if (!isTerminalJourneyLogged() && snapshot.state.status !== 'active') {
            setTerminalJourneyLogged(true);
            setJourneyPhase(snapshot.state.status === 'completed' ? 'completed' : 'failed');
            log.info('journey.terminal', {
              missionId: mission.id,
              status: snapshot.state.status,
              terminalReason: snapshot.state.terminalReason || null,
              tick: snapshot.state.tick,
              distanceTraveledM: snapshot.state.distanceTraveledM,
              simulatedTimeSeconds: snapshot.state.simulatedTimeSeconds,
              completedLaps: snapshot.state.completedLaps,
            });
            recordJourney(nextController).catch((error) => {
              log.error('journey.ledger.failed', log.serializeError(error));
            });
          }
          if (snapshot.state.status !== 'active') stopLoop();
        },
      });
      await ensureRenderer(nextController.worldModel);
      if (!isCurrent()) return null;
      setRetrievalLaneLogged(false);
      setTerminalJourneyLogged(false);
      await yieldToFrame();
      if (!isCurrent()) return null;
      const renderer = getRenderer();
      renderer.reset();
      const snapshot = nextController.snapshot();
      renderer.render(snapshot);
      await yieldToFrame();
      if (!isCurrent()) return null;
      setActiveState({ controller: nextController, mission });
      traceView.renderInitial(snapshot, renderer.receipt());
      renderPlanning(elements, nextController.planning());
      renderPluginExperience({ mission });
      elements.renderIdentity.textContent = renderIdentity(renderer.receipt());
      setRuntimeStatus(
        elements,
        snapshot.state.status === 'active' ? 'Ready' : runtimeLabel(snapshot.state),
        snapshot.state.status === 'active' ? 'ready' : 'failed',
      );
      setJourneyPhase(snapshot.state.status === 'active' ? 'ready' : 'failed');
      updateButtons(
        elements,
        keepMissionLocked,
        true,
        snapshot.state.status,
        hasJourneyStarted(),
      );
      if (snapshot.state.status !== 'active') await recordJourney(nextController);
      return nextController;
    }

    async function buildPlayback({ isCurrent, keepMissionLocked }) {
      const playbackWorld = worldApi.createWorldModel(data.world);
      await ensureRenderer(playbackWorld);
      if (!isCurrent()) return null;
      const initialNode = data.world.nodes[0];
      const initialPosition = initialNode?.position || { x: 0, y: 0 };
      const snapshot = {
        route: { segmentIds: [] },
        state: {
          tick: 0,
          taskType: 'playback',
          currentNodeId: initialNode?.id || null,
          position: { ...initialPosition },
          suppressPrimaryActor: true,
          distanceTraveledM: 0,
          speedMps: 0,
          simulatedTimeSeconds: 0,
          status: 'active',
        },
      };
      const renderer = getRenderer();
      renderer.reset();
      renderer.render(snapshot);
      setActiveState({ controller: null, mission: null });
      await renderPluginExperience({ mission: null });
      elements.renderIdentity.textContent = renderIdentity(renderer.receipt());
      setRuntimeStatus(elements, 'Ready', 'ready');
      setJourneyPhase('ready');
      updateButtons(
        elements,
        keepMissionLocked,
        true,
        'active',
        hasJourneyStarted(),
      );
      return null;
    }

    return Object.freeze({ build });
  }

  return Object.freeze({ create });
});
