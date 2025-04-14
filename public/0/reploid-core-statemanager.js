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

  const STATE_VERSION_MAJOR = config.STATE_VERSION.split(".")[0];
  const STATE_VERSION_MINOR = config.STATE_VERSION.split(".")[1];
  const STATE_VERSION_PATCH = config.STATE_VERSION.split(".")[2];

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

  const validateStateStructure = (stateObj, source = "unknown") => {
    if (!stateObj || typeof stateObj !== "object")
      return `Invalid state object (${source})`;
    const checks = {
      version: (v) => typeof v === "string" && v.split(".").length === 3,
      totalCycles: (v) => typeof v === "number" && v >= 0,
      agentIterations: (v) => typeof v === "number" && v >= 0,
      humanInterventions: (v) => typeof v === "number" && v >= 0,
      failCount: (v) => typeof v === "number" && v >= 0,
      currentGoal: (v) => typeof v === "object" && v !== null,
      lastCritiqueType: (v) => typeof v === "string" || v === null,
      personaMode: (v) => typeof v === "string",
      lastFeedback: (v) => typeof v === "string" || v === null,
      forceHumanReview: (v) => typeof v === "boolean",
      apiKey: (v) => typeof v === "string",
      confidenceHistory: (v) => Array.isArray(v),
      critiqueFailHistory: (v) => Array.isArray(v),
      tokenHistory: (v) => Array.isArray(v),
      failHistory: (v) => Array.isArray(v),
      contextTokenEstimate: (v) => typeof v === "number",
      htmlHistory: (v) => Array.isArray(v),
      retryCount: (v) => typeof v === "number",
      cfg: (v) => typeof v === "object" && v !== null,
      artifactMetadata: (v) => typeof v === "object" && v !== null,
      dynamicTools: (v) => Array.isArray(v),
    };
    for (const key in checks) {
      if (!checks[key](stateObj[key])) {
        return `Invalid or missing property: '${key}' in state from ${source}`;
      }
    }
    return null;
  };

  const checkAndLogVersionDifference = (loadedVersion, source) => {
    if (!loadedVersion || typeof loadedVersion !== "string") return;
    const [major, minor, patch] = loadedVersion.split(".").map(Number);
    if (isNaN(major) || isNaN(minor) || isNaN(patch)) return;

    if (major !== parseInt(STATE_VERSION_MAJOR, 10)) {
      logger.logEvent(
        "error",
        `Incompatible MAJOR version detected in state from ${source}.`,
        `Loaded: ${loadedVersion}, Required: ${config.STATE_VERSION}. Discarding state.`
      );
      return false;
    } else if (
      minor < parseInt(STATE_VERSION_MINOR, 10) ||
      (minor === parseInt(STATE_VERSION_MINOR, 10) &&
        patch < parseInt(STATE_VERSION_PATCH, 10))
    ) {
      logger.logEvent(
        "warn",
        `Loading older MINOR/PATCH version state from ${source}.`,
        `Loaded: ${loadedVersion}, Current: ${config.STATE_VERSION}. Potential compatibility issues.`
      );
      // TODO: Add migration logic here if needed
    } else if (
      minor > parseInt(STATE_VERSION_MINOR, 10) ||
      (minor === parseInt(STATE_VERSION_MINOR, 10) &&
        patch > parseInt(STATE_VERSION_PATCH, 10))
    ) {
      logger.logEvent(
        "warn",
        `Loading newer MINOR/PATCH version state from ${source}.`,
        `Loaded: ${loadedVersion}, Current: ${config.STATE_VERSION}. Potential compatibility issues.`
      );
    }
    return true;
  };

  const init = () => {
    if (isInitialized) return true;
    const savedState = Storage.getState();

    if (savedState) {
      const validationError = validateStateStructure(
        savedState,
        "localStorage"
      );
      if (validationError) {
        logger.logEvent(
          "error",
          `Saved state validation failed: ${validationError}. Discarding.`
        );
        Storage.removeState();
        globalState = getDefaultState();
        artifactMetadata = {};
        dynamicToolDefinitions = [];
      } else {
        const isCompatible = checkAndLogVersionDifference(
          savedState.version,
          "localStorage"
        );
        if (!isCompatible) {
          Storage.removeState();
          globalState = getDefaultState();
          artifactMetadata = {};
          dynamicToolDefinitions = [];
        } else {
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
            `Loaded state v${savedState.version} (Cycle ${globalState.totalCycles})`
          );
        }
      }
    } else {
      logger.logEvent(
        "info",
        `No saved state found. Initializing new default state v${config.STATE_VERSION}`
      );
      globalState = getDefaultState();
      artifactMetadata = {};
      if (config.GENESIS_ARTIFACT_DEFS) {
        for (const id in config.GENESIS_ARTIFACT_DEFS) {
          if (id === "reploid.core.config") continue;
          const def = config.GENESIS_ARTIFACT_DEFS[id];
          artifactMetadata[id] = {
            id: id,
            type: def.type || "UNKNOWN",
            description: def.description || `Artifact ${id}`,
            latestCycle: -1,
            source: "Initial Definition",
          };
        }
      }
      globalState.artifactMetadata = artifactMetadata;
      dynamicToolDefinitions = globalState.dynamicTools || [];
    }

    save();
    isInitialized = true;
    return globalState && globalState.totalCycles > 0;
  };

  const getState = () => globalState;

  const setState = (newState) => {
    const validationError = validateStateStructure(newState, "setState call");
    if (validationError) {
      logger.logEvent(
        "error",
        `Attempted to set invalid state: ${validationError}`
      );
      return;
    }
    globalState = newState;
    if (globalState) {
      artifactMetadata = globalState.artifactMetadata || {};
      dynamicToolDefinitions = globalState.dynamicTools || [];
    } else {
      artifactMetadata = {};
      dynamicToolDefinitions = [];
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

  const updateArtifactMetadata = (
    id,
    type,
    description,
    cycle,
    checksum = null
  ) => {
    const currentMeta = artifactMetadata[id] || {};
    artifactMetadata[id] = {
      id: id,
      type: type || currentMeta.type || "UNKNOWN",
      description: description || currentMeta.description || `Artifact ${id}`,
      latestCycle: Math.max(cycle, currentMeta.latestCycle ?? -1),
      source: currentMeta.source || "Agent Modified",
      checksum: checksum || currentMeta.checksum,
    };
    if (globalState) globalState.artifactMetadata = artifactMetadata;
  };

  const deleteArtifactMetadata = (id) => {
    delete artifactMetadata[id];
    if (globalState) globalState.artifactMetadata = artifactMetadata;
  };

  const getAllArtifactMetadata = () => ({ ...artifactMetadata });

  const capturePreservationState = (uiRefs = {}) => {
    if (!globalState) return null;
    try {
      const stateToSave = JSON.parse(
        JSON.stringify({ ...globalState, lastApiResponse: null })
      );
      stateToSave.logBuffer = logger.getLogBuffer
        ? logger.getLogBuffer()
        : null;
      stateToSave.timelineHTML = uiRefs.timelineLog?.innerHTML || "";
      stateToSave.dynamicToolDefinitions = dynamicToolDefinitions;
      stateToSave.artifactMetadata = artifactMetadata;
      return stateToSave;
    } catch (e) {
      logger.logEvent(
        "error",
        `Failed to capture preservation state: ${e.message}`,
        e
      );
      return null;
    }
  };

  const restoreStateFromSession = (restoreUIFn = () => {}) => {
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
      const validationError = validateStateStructure(
        preservedData,
        "sessionStorage"
      );
      if (validationError) {
        throw new Error(`Session state validation failed: ${validationError}`);
      }

      const isCompatible = checkAndLogVersionDifference(
        preservedData.version,
        "sessionStorage"
      );
      if (!isCompatible) {
        throw new Error(
          `Incompatible MAJOR version in session state: ${preservedData.version}`
        );
      }

      const defaultState = getDefaultState();
      globalState = {
        ...defaultState,
        ...preservedData,
        cfg: { ...defaultState.cfg, ...(preservedData.cfg || {}) },
      };
      globalState.version = config.STATE_VERSION;

      if (logger.setLogBuffer && preservedData.logBuffer) {
        logger.setLogBuffer(preservedData.logBuffer);
      }
      dynamicToolDefinitions = preservedData.dynamicTools || [];
      artifactMetadata = preservedData.artifactMetadata || {};
      globalState.dynamicTools = dynamicToolDefinitions;
      globalState.artifactMetadata = artifactMetadata;

      restoreUIFn(preservedData);

      logger.logEvent(
        "info",
        "Session state restored successfully by StateManager."
      );
      save();
      return true;
    } catch (e) {
      logger.logEvent("error", `Restore from session failed: ${e.message}`, e);
      init();
      return false;
    } finally {
      Storage.removeSessionState();
      logger.logEvent("debug", "Cleared session state from storage.");
    }
  };

  const exportState = (uiRefs = {}) => {
    logger.logEvent(
      "info",
      "Exporting state (metadata and UI state only, NOT artifact content)..."
    );
    try {
      const stateData = capturePreservationState(uiRefs);
      if (!stateData) {
        logger.logEvent("error", "Failed to capture state for export.");
        showNotification?.("Error capturing state for export.", "error");
        return;
      }
      const fileName = `x0_state_${config.STATE_VERSION}_${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.json`;
      const dataStr = JSON.stringify(stateData, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      logger.logEvent("info", "State export initiated.");
    } catch (e) {
      logger.logEvent("error", `State export failed: ${e.message}`, e);
      showNotification?.(`State export failed: ${e.message}`, "error");
    }
  };

  const importState = (file, importCallback = () => {}) => {
    logger.logEvent(
      "info",
      "Attempting to import state (metadata and UI state only, NOT artifact content)..."
    );
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (!e.target?.result)
          throw new Error("File read returned null result.");
        const importedData = JSON.parse(e.target.result);

        const validationError = validateStateStructure(
          importedData,
          `imported file '${file.name}'`
        );
        if (validationError) {
          throw new Error(
            `Imported state validation failed: ${validationError}`
          );
        }
        logger.logEvent("info", `Importing state v${importedData.version}`);

        const isCompatible = checkAndLogVersionDifference(
          importedData.version,
          `imported file '${file.name}'`
        );
        if (!isCompatible) {
          throw new Error(
            `Incompatible MAJOR version in imported state: ${importedData.version}`
          );
        }

        const defaultState = getDefaultState();
        globalState = {
          ...defaultState,
          ...importedData,
          cfg: { ...defaultState.cfg, ...(importedData.cfg || {}) },
        };
        globalState.version = config.STATE_VERSION;
        if (logger.setLogBuffer && importedData.logBuffer) {
          logger.setLogBuffer(importedData.logBuffer);
        }
        dynamicToolDefinitions = importedData.dynamicTools || [];
        artifactMetadata = importedData.artifactMetadata || {};
        globalState.dynamicTools = dynamicToolDefinitions;
        globalState.artifactMetadata = artifactMetadata;

        importCallback(true, importedData);

        logger.logEvent("info", "State imported successfully by StateManager.");
        save();
      } catch (err) {
        logger.logEvent("error", `Import failed: ${err.message}`, err);
        importCallback(false, null, err.message);
      }
    };
    reader.onerror = (e) => {
      const errorMsg = `File read error: ${reader.error}`;
      logger.logEvent("error", errorMsg);
      importCallback(false, null, errorMsg);
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
    isInitialized: () => isInitialized,
  };
};
