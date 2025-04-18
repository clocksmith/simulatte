const StateManagerModule = (config, logger, storage) => {
  if (!config || !logger || !storage) {
    logger?.logEvent(
      "error",
      "StateManager requires config, logger, and storage."
    );
    return null;
  }

  let state = null;
  let isInitialized = false;

  const getDefaultState = () => ({
    version: config.version,
    apiKey: "",
    tools: {},
    lastError: null,
    stats: {
      toolsGenerated: 0,
      cyclesRun: 0,
      apiCalls: 0,
      errors: 0,
    },
  });

  const validateState = (loadedState) => {
    if (!loadedState || typeof loadedState !== "object") return false;
    if (loadedState.version !== config.version) {
      logger.logEvent(
        "warn",
        `State version mismatch. Loaded: ${loadedState.version}, Expected: ${config.version}. Discarding loaded state.`
      );
      return false;
    }

    if (typeof loadedState.tools !== "object" || loadedState.tools === null)
      return false;
    if (typeof loadedState.stats !== "object" || loadedState.stats === null)
      return false;

    return true;
  };

  const init = (initialStateFromStorage = null) => {
    if (isInitialized) {
      logger.logEvent("warn", "StateManager init called multiple times.");
      return;
    }
    logger.logEvent("info", "Initializing StateManager...");

    if (initialStateFromStorage && validateState(initialStateFromStorage)) {
      state = initialStateFromStorage;
      isInitialized = true;
      logger.logEvent(
        "info",
        `StateManager initialized with existing state v${state.version}`
      );
    } else {
      if (initialStateFromStorage) {
        logger.logEvent(
          "warn",
          "Invalid initial state provided or validation failed. Initializing with default."
        );
      }
      state = getDefaultState();
      isInitialized = true;
      logger.logEvent(
        "info",
        `StateManager initialized with default state v${state.version}`
      );
      saveState();
    }
  };

  const getState = () => {
    if (!isInitialized) {
      logger.logEvent(
        "error",
        "Attempted to get state before StateManager initialized."
      );
      return null;
    }
    return state;
  };

  const updateState = (newState) => {
    if (!isInitialized) throw new Error("StateManager not initialized.");
    if (!validateState(newState)) {
      throw new Error("Attempted to set invalid state.");
    }
    state = newState;
  };

  const saveState = () => {
    if (!isInitialized) throw new Error("StateManager not initialized.");
    try {
      storage.saveState(state);
      logger.logEvent("debug", "State saved successfully.");
    } catch (e) {
      logger.logEvent("error", "Failed to save state to storage.", e);
      state.lastError = `Failed to save state: ${e.message}`;
    }
  };

  const addTool = (
    toolId,
    mcpDefinition,
    jsImplementation,
    toolMetadata = {}
  ) => {
    if (!isInitialized) throw new Error("StateManager not initialized.");
    if (!state.tools) state.tools = {};
    if (state.tools[toolId]) {
      logger.logEvent(
        "warn",
        `Overwriting existing tool definition for ID: ${toolId}`
      );
    }
    if (
      !mcpDefinition ||
      typeof mcpDefinition !== "object" ||
      !mcpDefinition.name
    ) {
      throw new Error(`Invalid MCP definition provided for tool ID: ${toolId}`);
    }
    if (typeof jsImplementation !== "string" || jsImplementation.length === 0) {
      throw new Error(
        `Invalid JS implementation provided for tool ID: ${toolId}`
      );
    }

    state.tools[toolId] = {
      id: toolId,
      mcpDefinition: mcpDefinition,
      jsImplementation: jsImplementation,
      metadata: {
        createdAt: new Date().toISOString(),
        createdBy: "LLM",
        version: toolMetadata.version || "1.0.0",
        description: mcpDefinition.description || "(No description)",
        name: mcpDefinition.name,
        ...toolMetadata,
      },
    };
    state.stats.toolsGenerated = (state.stats.toolsGenerated || 0) + 1;
    logger.logEvent(
      "info",
      `Tool added/updated: ${toolId} (${mcpDefinition.name})`
    );
    saveState();
  };

  const getTool = (toolId) => {
    if (!isInitialized) return null;
    return state.tools?.[toolId] ?? null;
  };

  const listTools = () => {
    if (!isInitialized) return [];
    return Object.values(state.tools || {});
  };

  const deleteTool = (toolId) => {
    if (!isInitialized) throw new Error("StateManager not initialized.");
    if (state.tools && state.tools[toolId]) {
      delete state.tools[toolId];
      logger.logEvent("info", `Tool deleted: ${toolId}`);
      saveState();
      return true;
    }
    logger.logEvent("warn", `Attempted to delete non-existent tool: ${toolId}`);
    return false;
  };

  const setApiKey = (key) => {
    if (!isInitialized) throw new Error("StateManager not initialized.");
    if (typeof key !== "string") return;
    state.apiKey = key;
    logger.logEvent("info", `API Key ${key ? "set" : "cleared"} in state.`);
  };

  const incrementCycle = () => {
    if (!isInitialized) throw new Error("StateManager not initialized.");
    state.stats.cyclesRun = (state.stats.cyclesRun || 0) + 1;
  };

  const incrementApiCall = () => {
    if (!isInitialized) throw new Error("StateManager not initialized.");
    state.stats.apiCalls = (state.stats.apiCalls || 0) + 1;
  };

  const incrementErrorCount = () => {
    if (!isInitialized) throw new Error("StateManager not initialized.");
    state.stats.errors = (state.stats.errors || 0) + 1;
  };

  const setLastError = (errorMessage) => {
    if (!isInitialized) throw new Error("StateManager not initialized.");
    state.lastError = errorMessage;
  };

  return {
    init,
    getState,
    updateState,
    saveState,
    addTool,
    getTool,
    listTools,
    deleteTool,
    setApiKey,
    incrementCycle,
    incrementApiCall,
    incrementErrorCount,
    setLastError,
    isInitialized: () => isInitialized,
  };
};

export default StateManagerModule;
