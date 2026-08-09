(function attachSimulatteMainSupport(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteMainSupport = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSimulatteMainSupport() {
  function create(options) {
    const {
      hostRoot,
      receiptsApi,
      civilTimeApi,
      setJourneyPhase,
      isMissionInputError,
      friendlyMissionError,
      setRuntimeStatus,
      updateButtons,
      canvasApi,
      wireCameraControls,
      selectCameraMode,
      log,
    } = options;

    function failRuntime(elements, error) {
      setJourneyPhase('failed');
      try {
        if (typeof window !== 'undefined') {
          window.__simulatteLastFailError = {
            code: error?.code || null,
            name: error?.name || null,
            message: error?.message || String(error),
            evidence: error?.evidence || null,
            stack: typeof error?.stack === 'string'
              ? error.stack.split('\n').slice(0, 6).join('\n')
              : null,
          };
        }
      } catch (_error) { /* diagnostic only */ }
      log.error('runtime.failed', log.serializeError(error));
      if (isMissionInputError(error)) {
        elements.missionError.textContent = friendlyMissionError(error);
        elements.missionInput.setAttribute('aria-invalid', 'true');
        setRuntimeStatus(elements, 'Check mission', 'changed');
        updateButtons(elements, false, false, 'active', false);
        elements.missionInput.focus();
        return;
      }
      elements.missionError.textContent = 'The simulator stopped. Open status for technical details.';
      setRuntimeStatus(elements, 'Stopped', 'error');
      updateButtons(elements, false, false, 'failed', true);
    }

    function applyPluginMissionContributions(mission, contributions) {
      const patches = contributions.filter((row) => row.missionPatch);
      const routePatches = patches.filter((row) => row.missionPatch.routeOverride);
      if (routePatches.length > 1) {
        throw new Error(`Plugin mission conflict: ${routePatches.map((row) => row.pluginId).join(', ')} proposed route overrides`);
      }
      patches.forEach((row) => {
        const keys = Object.keys(row.missionPatch);
        if (keys.some((key) => key !== 'routeOverride')) {
          throw new Error(`Plugin ${row.pluginId} proposed unsupported mission fields: ${keys.join(', ')}`);
        }
      });
      if (routePatches.length) {
        mission.constraints.routeOverride = structuredClone(routePatches[0].missionPatch.routeOverride);
      }
      mission.extensions = Object.freeze(Object.fromEntries(contributions.map((row) => [
        row.pluginId,
        structuredClone({
          recognized: Boolean(row.recognized),
          obligations: row.obligations || [],
          unresolved: row.unresolved || [],
        }),
      ])));
      return mission;
    }

    function environmentInstant(world, mission) {
      const snapshotDate = world.provenance?.snapshotDate || '2026-07-14';
      const localMinutes = mission.constraints.departureLocalMinutes;
      const hour = String(Math.floor(localMinutes / 60)).padStart(2, '0');
      const minute = String(localMinutes % 60).padStart(2, '0');
      return civilTimeApi.resolve({
        civilTime: `${snapshotDate}T${hour}:${minute}:00`,
        timeZone: world.scenario?.timeZone || 'America/New_York',
      }).utcInstant;
    }

    async function renderLedger(elements, ledger, curriculum = null, worldContentVersion = null) {
      try {
        const summary = await ledger.summary();
        const error = summary.meanAbsoluteEtaErrorSeconds;
        const curriculumProgress = curriculum
          ? await ledger.curriculumProgress(curriculum, worldContentVersion)
          : null;
        elements.ledgerProof.textContent = `${summary.trialCount} trial${summary.trialCount === 1 ? '' : 's'}${error === null ? '' : ` · MAE ${error.toFixed(1)} s`}${curriculumProgress ? ` · curriculum ${curriculumProgress.completedCount}/${curriculumProgress.missionCount}` : ''}`;
      } catch (error) {
        elements.ledgerProof.textContent = `integrity failure · ${error.code || 'invalid'}`;
      }
    }

    function renderPolicyArena(elements, evidence) {
      const leader = evidence?.diagnosticSelection;
      const lane = evidence?.lanes?.find((row) => row.id === leader?.laneId);
      elements.policyArenaProof.textContent = leader?.status === 'diagnostic_leader_only' && lane
        ? `${lane.id} · ${lane.metrics.safetyAdjustedCompletionScore.toFixed(3)} · promotion blocked`
        : 'no qualified diagnostic leader';
    }

    function downloadJson(filename, value) {
      const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    }

    async function validateImportedJourneyReceipt(value, receiptTools = receiptsApi) {
      if (!value || value.schema !== 'simulatte.autonomyJourneyReceipt.v2') {
        throw new Error('expected simulatte.autonomyJourneyReceipt.v2');
      }
      if (!value.mission || typeof value.mission.sourceText !== 'string' || !value.mission.sourceText.trim()) {
        throw new Error('receipt has no replayable mission source text');
      }
      if (!value.integrity || !Array.isArray(value.trace) || !receiptTools?.verifyReceiptChain) {
        throw new Error('receipt integrity evidence is unavailable');
      }
      const verification = await receiptTools.verifyReceiptChain({
        schema: 'simulatte.autonomyReceiptChain.v1',
        algorithm: value.integrity.algorithm,
        terminalHash: value.integrity.terminalHash,
        entries: value.trace,
      });
      if (!verification.pass || verification.entryCount !== value.integrity.entryCount) {
        throw new Error(`receipt chain failed verification: ${verification.reason}`);
      }
      return verification;
    }

    function wireProfileSelection(options) {
      const {
        elements,
        data,
        applicationProfileSelectApi,
        populateApplicationProfiles,
        on,
        navigate,
        dispose,
      } = options;
      populateApplicationProfiles(
        elements.applicationProfile,
        data.manifest,
        data.applicationProfile.id,
      );
      if (!applicationProfileSelectApi?.createApplicationProfileSelect) {
        throw new Error('Application profile select dependency is unavailable');
      }
      const profileSelect = applicationProfileSelectApi.createApplicationProfileSelect({
        select: elements.applicationProfile,
        root: elements.applicationProfileControl,
        trigger: elements.applicationProfileTrigger,
        label: elements.applicationProfileLabel,
        listbox: elements.applicationProfileOptions,
      });
      on(elements.applicationProfile, 'change', () => {
        const profileId = elements.applicationProfile.value;
        if (!profileId || profileId === data.applicationProfile.id) return;
        navigate?.({ tier: 'city', experience: profileId });
      });
      on(window, 'pagehide', () => { void dispose(); }, { once: true });
      return profileSelect;
    }

    async function createRenderer(options) {
      const {
        elements,
        worldModel,
        data,
        lifecycle,
        stopLoop,
        fail,
        onCameraInteraction,
        onManualNavigation,
      } = options;
      const renderer = await canvasApi.createCanvasRenderer(elements.autonomyCanvas, worldModel, {
        minimapCanvas: elements.followMinimap,
        labelCanvas: elements.semanticLabelCanvas,
        regionRegistry: data.applicationProfile.experience?.worldDetail === 'plugin-owned' ? null : data.regionRegistry,
        regionPacks: data.applicationProfile.experience?.worldDetail === 'plugin-owned' ? [] : data.regionPacks,
        onFailure: (error) => {
          stopLoop();
          fail(error);
        },
        onCameraInteraction,
      });
      wireCameraControls(elements, renderer, lifecycle.signal, { onManualNavigation });
      const receipt = renderer.receipt();
      log.info('renderer.ready', {
        backend: receipt.backend,
        adapter: receipt.adapter,
        buildingCount: receipt.buildingCount,
        staticVertexCount: receipt.staticVertexCount,
        ambientTraffic: receipt.ambientTraffic,
      });
      return renderer;
    }

    function wireReceiptControls(options) {
      const {
        on,
        elements,
        getController,
        getRenderer,
        data,
        extensions,
        journeyLedger,
        stopLoop,
        resizeMissionInput,
        resetJourneyState,
      } = options;
      on(elements.exportButton, 'click', async () => {
        const controller = getController();
        if (!controller) return;
        const receipt = await controller.journeyReceipt();
        receipt.rendering = getRenderer().receipt();
        receipt.dataLoad = structuredClone(data.receipt);
        receipt.pluginRuntime = extensions.runtimeReceipt();
        log.info('journey.receipt.exported', {
          missionId: receipt.mission.id,
          terminalHash: receipt.integrity.terminalHash,
          traceEntryCount: receipt.trace.length,
        });
        downloadJson(`simulatte-autonomy-${receipt.mission.id}.json`, receipt);
      });
      on(elements.exportLedgerButton, 'click', async () => {
        downloadJson('simulatte-local-settlement-ledger.json', await journeyLedger.exportLedger());
      });
      on(elements.importReceiptButton, 'click', () => elements.importReceiptFile.click());
      on(elements.importReceiptFile, 'change', async () => {
        const [file] = elements.importReceiptFile.files || [];
        elements.importReceiptFile.value = '';
        if (!file) return;
        try {
          const imported = JSON.parse(await file.text());
          await validateImportedJourneyReceipt(imported, receiptsApi);
          stopLoop();
          elements.missionInput.value = imported.mission.sourceText;
          resizeMissionInput(elements.missionInput);
          resetJourneyState();
          setRuntimeStatus(elements, 'Receipt verified. Ready to replay.', 'ready');
          log.info('journey.receipt.imported', {
            filename: file.name,
            missionId: imported.mission.id,
            terminalHash: imported.integrity.terminalHash,
            worldContentVersion: imported.identities.worldContentVersion,
            networkWrite: false,
          });
        } catch (error) {
          setRuntimeStatus(elements, `Receipt import refused: ${error.message}`, 'error');
          log.error('journey.receipt.import_failed', log.serializeError(error));
        }
      });
    }

    function launchBrowserApp(start, collectElements) {
      if (typeof document === 'undefined') return;
      const launch = () => {
        const router = hostRoot.SimulatteRouter.createRouter(window);
        const navigate = (route, options) => router.navigate(route, options);
        const governedContext = {
          collectElements,
          setJourneyPhase,
          setRuntimeStatus,
          createTierVisualizer: hostRoot.SimulatteMultiTierVisualizer.createTierVisualizer,
          navigate,
          onSelectTier: (tier) => navigate({ tier, experience: null }),
        };
        const boot = (tier, experience, bootOptions) => tier === 'city'
          ? start('city', experience, { navigate, signal: bootOptions?.signal, simulation: bootOptions?.simulation || null, routeState: bootOptions?.routeState || null })
          : hostRoot.SimulatteWorldTiersBoot.bootGovernedTierExplorer(
            governedContext,
            tier,
            experience,
            bootOptions,
          );
        const shell = hostRoot.SimulatteWorldTiersBoot.createAppShell({
          router,
          boot,
          landing: document.getElementById('world-tiers-landing-page'),
          documentationLink: document.getElementById('experience-doc-link'),
        });
        void Promise.resolve(shell.start()).catch((error) => {
          try {
            failRuntime(collectElements(), error);
          } catch (boundaryError) {
            log.error('runtime.bootstrap_failed', log.serializeError(boundaryError));
          }
        });
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', launch, { once: true });
      } else {
        launch();
      }
    }

    return Object.freeze({
      applyPluginMissionContributions,
      createRenderer,
      downloadJson,
      environmentInstant,
      failRuntime,
      launchBrowserApp,
      renderLedger,
      renderPolicyArena,
      validateImportedJourneyReceipt,
      wireProfileSelection,
      wireReceiptControls,
    });
  }

  return Object.freeze({ create });
});
