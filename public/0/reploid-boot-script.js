(async () => {
  const startPrompt = document.getElementById("start-prompt");
  const loadingContainer = document.getElementById("loading-container");
  const loadingIndicator = document.getElementById("loading-indicator");
  const appRoot = document.getElementById("app-root");
  let bootstrapLogMessages = `REPLOID Bootstrap Log - ${new Date().toISOString()}\n=========================================\n`;
  let audioCtx = null;
  let isAudioInitAttempted = false;
  let holdTimeoutId = null;
  let interactionStarted = false;
  const HOLD_DURATION_MILLIS = 1000;
  let uiUpdatePromise = Promise.resolve();

  let config = null;
  let Utils = null;
  let Storage = null;
  let blLogger = null;

  const bl = (() => {
    const initAudioContext = () => {
      if (!isAudioInitAttempted && !audioCtx) {
        isAudioInitAttempted = true;
        try {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
          if (blLogger)
            blLogger.logEvent("warn", "AudioContext init failed:", e.message);
          else console.warn("AudioContext init failed:", e.message);
          audioCtx = null;
        }
      }
      return audioCtx;
    };
    const playTone = (frequency, charDelay, oscType) => {
      if (!audioCtx || typeof audioCtx.createOscillator !== "function") return;
      try {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        const duration = Math.min(Math.max(charDelay / 1000, 0.01), 0.1);
        oscillator.type = oscType;
        oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.001,
          audioCtx.currentTime + duration
        );
        oscillator.connect(gainNode).connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + duration);
      } catch (e) {
        if (blLogger)
          blLogger.logEvent("warn", "Tone playback error:", e.message);
        else console.warn("Tone playback error:", e.message);
        audioCtx = null;
      }
    };
    return async function blInternal(
      message,
      level = "info",
      detail = null,
      charDelay = 1
    ) {
      let skipOutput = false;
      if (level === "skip") {
        skipOutput = true;
        level = "info";
      }
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}${
        detail ? `\n   └─ ${detail}` : ""
      }`;
      bootstrapLogMessages += logLine + "\n";

      // Use the dedicated Utils logger *if* it has been loaded
      if (blLogger) {
        blLogger.logEvent(level, message, detail || "");
      } else {
        console[level] ? console[level](logLine) : console.log(logLine);
      }

      if (skipOutput || !loadingIndicator) return;
      uiUpdatePromise = uiUpdatePromise
        .then(async () => {
          if (level === "error") {
            playTone(220, charDelay, "square");
          }
          const logEntryContainer = document.createElement("div");
          logEntryContainer.className = `log-entry log-${level}`;
          loadingIndicator.appendChild(logEntryContainer);
          const fullText = `> ${message}${detail ? `\n   └─ ${detail}` : ""}`;
          for (const char of fullText) {
            logEntryContainer.textContent += char;
            if (loadingIndicator.scrollTop !== undefined) {
              loadingIndicator.scrollTop = loadingIndicator.scrollHeight;
            }
            if (char.trim() && level !== "error") {
              playTone(990, charDelay, "triangle");
            }
            await new Promise((resolve) =>
              setTimeout(resolve, Math.max(charDelay, 1))
            );
          }
          if (loadingIndicator.scrollTop !== undefined) {
            loadingIndicator.scrollTop = loadingIndicator.scrollHeight;
          }
        })
        .catch((error) => {
          const logMsg = "Error during bootstrap logging UI update:";
          if (blLogger) blLogger.logEvent("error", logMsg, error);
          else console.error(logMsg, error);
          uiUpdatePromise = Promise.resolve();
        });
      await uiUpdatePromise;
    };
  })();
  bl.initAudioContext = () => {
    if (!isAudioInitAttempted && !audioCtx) {
      isAudioInitAttempted = true;
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        if (blLogger)
          blLogger.logEvent("warn", "AudioContext init failed:", e.message);
        else console.warn("AudioContext init failed:", e.message);
        audioCtx = null;
      }
    }
    return audioCtx;
  };

  async function fetchAndExecuteModule(
    filePath,
    exportName,
    dependencies = {}
  ) {
    try {
      const response = await fetch(filePath);
      if (!response.ok)
        throw new Error(`HTTP ${response.status} for ${filePath}`);
      const scriptContent = await response.text();
      const factoryFunction = new Function(
        scriptContent + `\nreturn ${exportName};`
      );
      // Pass dependencies to the factory function if needed (like for StorageModule)
      return factoryFunction(...Object.values(dependencies));
    } catch (error) {
      bl(
        `Fatal Error loading/executing module ${filePath}`,
        "error",
        error.message
      );
      throw error;
    }
  }

  async function loadCoreDependencies() {
    try {
      const configResponse = await fetch("reploid-core-config.json");
      if (!configResponse.ok)
        throw new Error(`HTTP ${configResponse.status} for config.json`);
      config = await configResponse.json();

      Utils = await fetchAndExecuteModule(
        "reploid-core-utils.js",
        "UtilsModule"
      );
      // Set the logger for bl to use
      blLogger = Utils.logger;

      Storage = await fetchAndExecuteModule(
        "reploid-core-storage.js",
        "StorageModule",
        { config, logger: Utils.logger }
      );

      bl("Core dependencies loaded (Config, Utils, Storage).", "info");
      return true;
    } catch (error) {
      bl("Failed to load core dependencies.", "error", error.message);
      return false;
    }
  }

  function isValidState(parsedState) {
    if (!config) return false; // Config needed for version check
    return (
      parsedState &&
      typeof parsedState === "object" &&
      typeof parsedState.totalCycles === "number" &&
      parsedState.totalCycles >= 0 &&
      parsedState.artifactMetadata &&
      typeof parsedState.artifactMetadata === "object" &&
      parsedState.version?.split(".")[0] === config.STATE_VERSION.split(".")[0]
    );
  }

  function checkEssentialArtifactsPresent(stateCycle, essentialArtifactDefs) {
    if (!Storage) return false;
    bl(`Checking essential artifacts for cycle ${stateCycle}...`, "info");
    let allFound = true;
    for (const id in essentialArtifactDefs) {
      if (id === "reploid.core.config") continue; // Config isn't stored like other artifacts
      const key = Storage.getArtifactKey(id, stateCycle); // Use Storage module
      const content = Storage.getArtifactContent(id, stateCycle); // Use Storage module
      if (content === null) {
        bl(
          `Essential artifact missing: ${id} (Cycle ${stateCycle}, Key: ${key})`,
          "warn"
        );
        allFound = false;
      } else {
        bl(`Verified: ${id} (Cycle ${stateCycle})`, "detail");
      }
    }
    if (!allFound) {
      bl(
        "One or more essential artifacts missing for the state's current cycle.",
        "error"
      );
    } else {
      bl(
        "All essential artifacts verified for the state's current cycle.",
        "info"
      );
    }
    return allFound;
  }

  function clearAllReploidData() {
    if (!Storage) {
      bl("Cannot clear data, Storage module not loaded.", "error");
      return;
    }
    bl("Clearing all REPLOID data from LocalStorage...", "info", null, 16);
    Storage.clearAllReploidData(); // Use Storage module method
    bl("    ", "info", null, 32);
  }

  async function bootstrapReploid(performGenesis = false) {
    bl("Model CPS-9204", "info", null, 32);
    bl("Copyright (c) 2105, 2109, 2114", "info", null, 32);
    bl("NOM Corporation", "info", null, 32);
    bl("All Rights Reserved", "info", null, 32);
    bl(" ", "info", null, 64);

    if (!config || !Utils || !Storage) {
      bl("Core dependencies failed to load, cannot bootstrap.", "error");
      return;
    }
    blLogger = Utils.logger; // Ensure blLogger is set if Utils loaded

    let state = null;
    let needsGenesis = performGenesis;
    let stateSource = performGenesis ? "Forced Genesis" : "None";
    const stateKey = config.STATE_KEY_BASE + config.STATE_VERSION.split(".")[0];

    if (!performGenesis) {
      const stateJSON = Storage.getState(); // Use Storage module
      if (stateJSON) {
        state = stateJSON; // Already parsed by Storage.getState
        if (isValidState(state)) {
          stateSource = `localStorage (Cycle ${state.totalCycles})`;
          if (
            checkEssentialArtifactsPresent(
              state.totalCycles,
              config.GENESIS_ARTIFACT_DEFS
            )
          ) {
            bl(
              `Found valid state and essential artifacts for cycle ${state.totalCycles}.`,
              "info"
            );
            needsGenesis = false;
          } else {
            bl(
              `State object valid (Cycle ${state.totalCycles}) but essential artifacts missing for that cycle. Discarding state.`,
              "error"
            );
            state = null;
            Storage.removeState(); // Use Storage module
            needsGenesis = true;
            stateSource = "Discarded Invalid State";
          }
        } else {
          bl(
            `Found invalid or incompatible state object (v${
              state?.version || "?"
            }). Discarding.`,
            "warn"
          );
          state = null;
          Storage.removeState(); // Use Storage module
          needsGenesis = true;
          stateSource = "Discarded Invalid State";
        }
      } else {
        bl("No existing state found. Initiating genesis.", "info");
        needsGenesis = true;
        stateSource = "Genesis";
      }
    } else {
      bl("Reset requested...", "info");
      bl(".", "info", null, 256);
      bl(".", "info", null, 256);
      bl(".", "info", null, 256);
      needsGenesis = true;
      stateSource = "Forced Genesis";
    }
    try {
      if (needsGenesis) {
        bl("Running genesis boot process...", "info");
        bl("    ", "info", null, 16);
        state = await runGenesisProcess();
        if (!state) {
          bl("genesis boot process failed. REPLOID cannot start.", "error");
          bl("    ", "info", null, 16);
          return;
        }
        bl("Genesis complete.", "success");
      }
      bl(`Loading application with state from: ${stateSource}`, "info");
      await uiUpdatePromise;
      await loadAndExecuteApp(state);
    } catch (error) {
      bl("Fatal bootstrap error", "error", error.message);
      console.error("Bootstrap stack trace:", error);
      loadingIndicator.innerHTML += `<div class="log-error">FATAL BOOTSTRAP ERROR: ${error.message}. Check console.</div>`;
    }
  }

  async function fetchGenesisArtifacts() {
    if (!config) return null;
    bl("Fetching genesis artifacts...", "info");
    const fetchedArtifacts = {};
    let success = true;
    const fetchPromises = Object.entries(config.GENESIS_ARTIFACT_DEFS).map(
      async ([id, def]) => {
        if (id === "reploid.core.config") return; // Skip config file itself
        try {
          const response = await fetch(def.filename);
          if (!response.ok)
            throw new Error(`HTTP ${response.status} for ${def.filename}`);
          const content =
            def.type === "JSON" || def.type === "JSON_CONFIG"
              ? JSON.stringify(await response.json(), null, 2)
              : await response.text();
          fetchedArtifacts[id] = content;
          bl(`Fetched: ${def.filename}`, "detail", `${content.length} bytes`);
        } catch (error) {
          bl(`Failed to fetch ${def.filename}`, "error", error.message);
          success = false;
        }
      }
    );
    await Promise.all(fetchPromises);
    if (!success) {
      bl("Genesis artifact fetch failed.", "error");
      return null;
    }
    bl(
      `Fetched ${Object.keys(fetchedArtifacts).length} genesis artifacts.`,
      "skip"
    );
    return fetchedArtifacts;
  }

  function saveGenesisArtifacts(artifacts) {
    if (!Storage || !config) return null;
    bl("Saving genesis artifacts (Cycle 0)...", "info");
    const metadata = {};
    let success = true;
    const genesisDefs = config.GENESIS_ARTIFACT_DEFS;

    for (const id in artifacts) {
      try {
        Storage.setArtifactContent(id, 0, artifacts[id]); // Use Storage module
        metadata[id] = {
          id: id,
          latestCycle: 0,
          type: genesisDefs[id]?.type || "UNKNOWN",
          description:
            genesisDefs[id]?.description || "Unknown Genesis Artifact",
          source: "Genesis",
        };
        bl(`Saved: ${id} (Cycle 0)`, "detail");
      } catch (e) {
        bl(`Failed to save artifact: ${id} (Cycle 0)`, "error", e.message);
        success = false;
        return null; // Abort if any save fails
      }
    }

    const bootArtifactsToSave = {
      "reploid.boot.style": {
        content: document.getElementById("boot-style")?.textContent || "",
        type: "CSS",
        description: "Bootstrap CSS",
      },
      "reploid.boot.script": {
        content: document.getElementById("boot-script")?.textContent || "",
        type: "JS",
        description: "Bootstrap script",
      },
      "reploid.boot.log": {
        content: bootstrapLogMessages,
        type: "LOG",
        description: "Bootstrap log",
      },
    };

    for (const id in bootArtifactsToSave) {
      const { content, type, description } = bootArtifactsToSave[id];
      try {
        Storage.setArtifactContent(id, 0, content);
        metadata[id] = {
          id: id,
          latestCycle: 0,
          type: type,
          description: description,
          source: "Bootstrap",
        };
        bl(`Saved: ${id} (Cycle 0)`, "detail");
      } catch (e) {
        bl(`Failed to save bootstrap artifact: ${id}`, "warn", e.message);
        // Don't consider bootstrap artifact save failure as fatal for genesis
      }
    }

    bl("Genesis artifact save process completed.", success ? "info" : "warn");
    return metadata;
  }

  async function runGenesisProcess() {
    const fetchedArtifacts = await fetchGenesisArtifacts();
    if (!fetchedArtifacts) return null;
    const artifactMetadata = saveGenesisArtifacts(fetchedArtifacts);
    if (!artifactMetadata) return null;

    if (!config) {
      bl("Config not loaded, cannot create initial state.", "error");
      return null;
    }

    // Ensure genesis defs include the new modules if they are files
    Object.keys(config.GENESIS_ARTIFACT_DEFS).forEach((id) => {
      if (!artifactMetadata[id] && id !== "reploid.core.config") {
        const def = config.GENESIS_ARTIFACT_DEFS[id];
        // Add metadata for potentially new core JS modules defined in config
        // They might not be fetched if they don't exist yet, but we need metadata
        if (def && def.type === "JS" && !fetchedArtifacts[id]) {
          artifactMetadata[id] = {
            id: id,
            latestCycle: -1,
            type: def.type,
            description: def.description,
            source: "Genesis Placeholder",
          };
          bl(`Added placeholder metadata for ${id}`, "detail");
        }
      }
    });

    const defaultCoreModel =
      config.DEFAULT_MODELS.BASE || "gemini-1.5-flash-latest";
    const defaultCritiqueModel =
      config.DEFAULT_MODELS.CRITIQUE || defaultCoreModel;

    const initialState = {
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
      lastFeedback: "Genesis completed.",
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
      cfg: {
        ...config.DEFAULT_CFG, // Use defaults from config
        coreModel: defaultCoreModel,
        critiqueModel: defaultCritiqueModel,
      },
      artifactMetadata: artifactMetadata,
      dynamicTools: [],
    };
    try {
      Storage.saveState(initialState); // Use Storage module
      bl("Initial state saved successfully.", "info");
      return initialState;
    } catch (e) {
      bl("Failed to save initial state!", "error", e.message);
      return null;
    }
  }

  async function loadAndExecuteApp(currentState) {
    bl(
      `Loading application core (State Cycle ${currentState.totalCycles})...`,
      "info"
    );
    if (!config || !Utils || !Storage) {
      bl("Core dependencies not available, cannot execute app.", "error");
      return;
    }

    // The logic to load core tool runner is removed as it will be loaded by the main orchestrator script.
    // Only need to load style and the main orchestrator script here.

    const currentCycle = currentState.totalCycles;
    const coreStyleId = "reploid.core.style";
    const coreLogicId = "reploid.core.logic"; // This is now the orchestrator

    try {
      const styleContent = Storage.getArtifactContent(
        coreStyleId,
        currentCycle
      );
      if (styleContent) {
        const styleElement = document.createElement("style");
        styleElement.id = `${coreStyleId}-loaded-${currentCycle}`;
        styleElement.textContent = styleContent;
        document.head.appendChild(styleElement);
        bl(
          `Applied core style: ${coreStyleId} (Cycle ${currentCycle})`,
          "skip"
        );
      } else {
        bl(`Core style artifact missing for Cycle ${currentCycle}.`, "warn");
      }

      const orchestratorScriptContent = Storage.getArtifactContent(
        coreLogicId,
        currentCycle
      );
      if (!orchestratorScriptContent) {
        throw new Error(
          `Core application orchestrator script artifact missing for Cycle ${currentCycle}.`
        );
      }

      bl(
        `Executing core application orchestrator: ${coreLogicId} (Cycle ${currentCycle})...`,
        "info"
      );
      // Execute the orchestrator script. It's expected to initialize everything else.
      // We pass the already loaded config, Utils, and Storage to it.
      const orchestratorFunction = new Function(
        "config",
        "Utils",
        "Storage",
        orchestratorScriptContent
      );
      orchestratorFunction(config, Utils, Storage);

      bl("Core application orchestrator execution initiated.", "success");

      setTimeout(() => {
        loadingContainer.style.transition = "opacity 0.5s ease-out";
        loadingContainer.style.opacity = "0";
        setTimeout(() => loadingContainer.classList.add("hidden"), 500);
        appRoot.classList.add("visible");
      }, 500);
    } catch (error) {
      bl(
        `Error loading/executing core application components`,
        "error",
        error.message
      );
      bl(`ERROR LOADING CORE APP`, "error", error.message, 4);
      console.error("Core execution failed", error);
    }
  }

  function startInteraction(action) {
    if (interactionStarted) return;
    interactionStarted = true;
    startPrompt.classList.add("hidden");
    loadingContainer.classList.remove("hidden");
    bl.initAudioContext();
    removeInteractionListeners();

    // Load core dependencies *after* interaction starts
    loadCoreDependencies().then((dependenciesLoaded) => {
      if (!dependenciesLoaded) {
        loadingIndicator.innerHTML += `<div class="log-error">FATAL: Could not load core modules. REPLOID cannot start.</div>`;
        return;
      }
      if (action === "reset") {
        clearAllReploidData();
        bl("Rebooting...", "info", null, 64);
        bl("            ", "info", null, 8);
        setTimeout(() => {
          bootstrapReploid(true);
        }, 256);
      } else {
        setTimeout(() => {
          bootstrapReploid(false);
        }, 256);
      }
    });
  }

  function handleKeydown(e) {
    if (e.key === "Enter") startInteraction("continue");
    else if (e.key === " ") startInteraction("reset");
  }
  function handleClick() {
    startInteraction("continue");
  }
  function handleTouchStart() {
    holdTimeoutId = setTimeout(() => {
      startInteraction("reset");
    }, HOLD_DURATION_MILLIS);
  }
  function handleTouchEnd() {
    clearTimeout(holdTimeoutId);
  }
  function removeInteractionListeners() {
    document.removeEventListener("keydown", handleKeydown);
    document.removeEventListener("click", handleClick);
    document.removeEventListener("touchstart", handleTouchStart);
    document.removeEventListener("touchend", handleTouchEnd);
    document.removeEventListener("touchcancel", handleTouchEnd);
  }

  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("click", handleClick);
  document.addEventListener("touchstart", handleTouchStart);
  document.addEventListener("touchend", handleTouchEnd);
  document.addEventListener("touchcancel", handleTouchEnd);
})();
