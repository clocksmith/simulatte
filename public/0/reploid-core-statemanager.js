const StateManagerModule = (config, logger, Storage) => {
  if (!config || !logger || !Storage) {
    console.error("StateManagerModule requires config, logger, and Storage.");
    const log = logger || {
      logEvent: (lvl, msg) =>
        console[lvl === "error" ? "error" : "log"](
          `[STATEMANAGER FALLBACK] ${msg}`
        ),
    };
    log.logEvent(
      "error",
      "StateManagerModule initialization failed: Missing dependencies."
    );
    return {
      init: () => {
        log.logEvent("error", "StateManager not initialized.");
        return false;
      },
      getState: () => null,
      setState: () => {
        log.logEvent("error", "StateManager not initialized.");
      },
      save: () => {
        log.logEvent("error", "StateManager not initialized.");
      },
      getArtifactMetadata: () => ({
        id: "unknown",
        type: "UNKNOWN",
        description: "StateManager not initialized",
        latestCycle: -1,
      }),
      updateArtifactMetadata: () => {},
      deleteArtifactMetadata: () => {},
      getAllArtifactMetadata: () => ({}),
      capturePreservationState: () => null,
      restoreStateFromSession: () => false,
      exportState: () => {},
      importState: () => {},
      getDefaultState: () => ({}),
    };
  }

  let globalState = null;
  let artifactMetadata = {};
  let dynamicToolDefinitions = [];
  let isInitialized = false;

  const getDefaultState = () => ({
    version: config.STATE_VERSION,
    totalCycles: 0,
    agentIterations: 0,
    humanInterventions: 0,
    failCount: 0,
    currentGoal: {
      seed: null,
      cumulative: null,
      latestType: "Idle",
      summaryContext: null,
    },
    lastCritiqueType: "N/A",
    personaMode: "XYZ",
    lastFeedback: null,
    forceHumanReview: false,
    apiKey: "",
    confidenceHistory: [],
    critiqueFailHistory: [],
    tokenHistory: [],
    failHistory: [],
    avgConfidence: null,
    critiqueFailRate: null,
    avgTokens: null,
    contextTokenEstimate: 0,
    lastGeneratedFullSource: null,
    htmlHistory: [],
    lastApiResponse: null,
    retryCount: 0,
    cfg: { ...config.DEFAULT_CFG },
    artifactMetadata: {},
    dynamicTools: [],
  });

  const init = () => {
    if (isInitialized) return true;
    const savedState = Storage.getState();
    const stateVersionMajor = config.STATE_VERSION.split(".")[0];

    if (savedState && savedState.version?.split(".")[0] === stateVersionMajor) {
      const defaultState = getDefaultState();
      globalState = {
        ...defaultState,
        ...savedState,
        cfg: { ...defaultState.cfg, ...(savedState.cfg || {}) },
      };
      globalState.version = config.STATE_VERSION;
      dynamicToolDefinitions = globalState.dynamicTools || [];
      artifactMetadata = globalState.artifactMetadata || {};
      globalState.dynamicTools = dynamicToolDefinitions;
      globalState.artifactMetadata = artifactMetadata;
      logger.logEvent(
        "info",
        `Loaded state v${globalState.version} (Cycle ${globalState.totalCycles})`
      );
      isInitialized = true;
      return true;
    } else {
      if (savedState) {
        logger.logEvent(
          "warn",
          `Ignoring incompatible state (v${savedState.version})`
        );
        Storage.removeState();
      }
      globalState = getDefaultState();
      artifactMetadata = {}; // Start fresh
      // Populate initial metadata based on config definitions
      if (config.GENESIS_ARTIFACT_DEFS) {
        for (const id in config.GENESIS_ARTIFACT_DEFS) {
          if (id === "reploid.core.config") continue;
          const def = config.GENESIS_ARTIFACT_DEFS[id];
          artifactMetadata[id] = {
            id: id,
            type: def.type || "UNKNOWN",
            description: def.description || `Artifact ${id}`,
            latestCycle: -1, // Mark as not yet loaded/created unless state says otherwise
            source: "Initial Definition",
          };
        }
      }
      // Attempt to overlay cycle 0 metadata if state indicates genesis occurred
      const cycleZeroState = Storage.getState(); // Re-check if maybe genesis *did* save state but failed loading before
      if (
        cycleZeroState &&
        cycleZeroState.totalCycles === 0 &&
        cycleZeroState.artifactMetadata
      ) {
        logger.logEvent(
          "info",
          "Applying Cycle 0 metadata from potentially recovered state."
        );
        artifactMetadata = {
          ...artifactMetadata,
          ...cycleZeroState.artifactMetadata,
        };
      } else {
        // Check if cycle 0 artifacts exist directly for core components as fallback
        const coreGenesisArtifacts = [
          "reploid.core.logic",
          "reploid.core.style",
          "reploid.core.body",
          "reploid.core.utils",
          "reploid.core.storage",
        ];
        coreGenesisArtifacts.forEach((id) => {
          if (
            Storage.getArtifactContent(id, 0) !== null &&
            artifactMetadata[id]
          ) {
            artifactMetadata[id].latestCycle = 0;
            artifactMetadata[id].source = "Genesis";
          }
        });
      }

      globalState.artifactMetadata = artifactMetadata;
      dynamicToolDefinitions = globalState.dynamicTools || [];
      save();
      logger.logEvent(
        "info",
        `Initialized new default state v${globalState.version}`
      );
      isInitialized = true;
      return false;
    }
  };

  const getState = () => globalState;

  const setState = (newState) => {
    globalState = newState;
    if (globalState) {
      artifactMetadata = globalState.artifactMetadata || {};
      dynamicToolDefinitions = globalState.dynamicTools || [];
    }
  };

  const save = () => {
    if (!globalState || !Storage) return;
    try {
      const stateToSave = JSON.parse(
        JSON.stringify({ ...globalState, lastApiResponse: null })
      );
      Storage.saveState(stateToSave);
      logger.logEvent(
        "debug",
        `Saved state (Cycle ${globalState.totalCycles})`
      );
    } catch (e) {
      logger.logEvent("error", `Save state failed: ${e.message}`, e);
    }
  };

  const getArtifactMetadata = (id) =>
    artifactMetadata[id] || {
      id: id,
      type: "UNKNOWN",
      description: "Unknown Artifact",
      latestCycle: -1,
    };

  const updateArtifactMetadata = (id, type, description, cycle) => {
    const currentMeta = artifactMetadata[id] || {};
    artifactMetadata[id] = {
      id: id,
      type: type || currentMeta.type || "UNKNOWN",
      description: description || currentMeta.description || `Artifact ${id}`,
      latestCycle: Math.max(cycle, currentMeta.latestCycle ?? -1),
      source: currentMeta.source || "Agent Modified", // Preserve original source if possible
    };
    if (globalState) globalState.artifactMetadata = artifactMetadata;
  };

  const deleteArtifactMetadata = (id) => {
    delete artifactMetadata[id];
    if (globalState) globalState.artifactMetadata = artifactMetadata;
  };

  const getAllArtifactMetadata = () => ({ ...artifactMetadata });

  const capturePreservationState = (uiRefs = {}) => {
    // Accept uiRefs optionally
    if (!globalState) return null;
    const stateToSave = JSON.parse(
      JSON.stringify({ ...globalState, lastApiResponse: null })
    );
    stateToSave.logBuffer = logger.getLogBuffer();
    stateToSave.timelineHTML = uiRefs.timelineLog
      ? uiRefs.timelineLog.innerHTML
      : ""; // Get timeline HTML if refs provided
    stateToSave.dynamicToolDefinitions = dynamicToolDefinitions; // Use the module's copy
    stateToSave.artifactMetadata = artifactMetadata; // Use the module's copy
    // Add any other transient UI state if needed
    // stateToSave.metaSandboxPending = metaSandboxPending; // Need to decide where this lives
    return stateToSave;
  };

  const restoreStateFromSession = (restoreUIFn = () => {}) => {
    // Accept a UI restoration function
    if (!isInitialized) {
      logger.logEvent(
        "warn",
        "Cannot restore session, StateManager not initialized."
      );
      return false;
    }
    const preservedData = Storage.getSessionState();
    if (!preservedData) return false;

    logger.logEvent("info", "Preserved session state found.");
    try {
      if (
        preservedData.version?.split(".")[0] !==
        config.STATE_VERSION.split(".")[0]
      ) {
        logger.logEvent(
          "warn",
          `Restoring older session state v${preservedData.version}.`
        );
      }
      const defaultState = getDefaultState();
      globalState = {
        ...defaultState,
        ...preservedData,
        cfg: { ...defaultState.cfg, ...(preservedData.cfg || {}) },
      };
      globalState.version = config.STATE_VERSION; // Ensure current version
      logger.setLogBuffer(preservedData.logBuffer || logger.getLogBuffer());
      dynamicToolDefinitions = preservedData.dynamicTools || [];
      artifactMetadata = preservedData.artifactMetadata || {};
      globalState.dynamicTools = dynamicToolDefinitions;
      globalState.artifactMetadata = artifactMetadata;

      // Call the provided UI restoration function
      restoreUIFn(preservedData);

      logger.logEvent("info", "Session state restored by StateManager.");
      save(); // Save the restored state
      return true;
    } catch (e) {
      logger.logEvent("error", `Restore from session failed: ${e.message}`, e);
      // Optionally trigger UI notification via logger/callback?
      // Re-initialize to a default state after failure
      init(); // Re-run init to get a clean default state
      return false;
    } finally {
      Storage.removeSessionState();
      logger.logEvent("info", "Cleared session state from storage.");
    }
  };

  const exportState = (uiRefs = {}) => {
    // Accept uiRefs optionally
    try {
      const stateData = capturePreservationState(uiRefs);
      if (!stateData) {
        logger.logEvent("error", "Failed to capture state for export.");
        return;
      }
      const fileName = `x0_state_${config.STATE_VERSION}_${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.json`;
      const dataStr = JSON.stringify(stateData, null, 2);
      logger.logEvent("info", "State export initiated.");
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      // Log success via logger or callback?
    } catch (e) {
      logger.logEvent("error", `State export failed: ${e.message}`, e);
      // Log failure via logger or callback?
    }
  };

  const importState = (file, importCallback = () => {}) => {
    // Accept a callback
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        if (!importedData.version || importedData.totalCycles === undefined) {
          throw new Error("Imported file missing version or core state data.");
        }
        logger.logEvent("info", `Importing state v${importedData.version}`);
        if (
          importedData.version.split(".")[0] !==
          config.STATE_VERSION.split(".")[0]
        ) {
          logger.logEvent(
            "warn",
            `State version mismatch (Imported: ${importedData.version}, Current: ${config.STATE_VERSION}).`
          );
        }
        const defaultState = getDefaultState();
        globalState = {
          ...defaultState,
          ...importedData,
          cfg: { ...defaultState.cfg, ...(importedData.cfg || {}) },
        };
        globalState.version = config.STATE_VERSION; // Ensure current version
        logger.setLogBuffer(importedData.logBuffer || logger.getLogBuffer());
        dynamicToolDefinitions = importedData.dynamicTools || [];
        artifactMetadata = importedData.artifactMetadata || {};
        globalState.dynamicTools = dynamicToolDefinitions;
        globalState.artifactMetadata = artifactMetadata;

        // Call the callback to handle UI updates etc.
        importCallback(true, importedData);

        logger.logEvent("info", "State imported successfully by StateManager.");
        save(); // Save the imported state
      } catch (err) {
        logger.logEvent("error", `Import failed: ${err.message}`, err);
        importCallback(false, null, err.message); // Notify caller of failure
      }
    };
    reader.onerror = (e) => {
      const errorMsg = `File read error: ${reader.error}`;
      logger.logEvent("error", errorMsg);
      importCallback(false, null, errorMsg); // Notify caller of failure
    };
    reader.readAsText(file);
  };

  return {
    init,
    getState,
    setState,
    save,
    getArtifactMetadata,
    updateArtifactMetadata,
    deleteArtifactMetadata,
    getAllArtifactMetadata,
    capturePreservationState,
    restoreStateFromSession,
    exportState,
    importState,
    getDefaultState,
  };
};
