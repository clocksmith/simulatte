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
  let skipBootstrapAnimation = false;

  let config = null;
  let Utils = null;
  let Storage = null;
  let blLogger = null;

  const bl = (() => {
    const MIN_TONE_INTERVAL_MS = 32;
    const TONE_DURATION_MS = 50;
    let lastToneTime = 0;

    const initAudioContextInternal = () => {
      if (!isAudioInitAttempted && !audioCtx) {
        isAudioInitAttempted = true;
        try {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
          const logFunc = blLogger ? blLogger.logEvent : console.warn;
          logFunc("warn", "AudioContext init failed:", e.message);
          audioCtx = null;
        }
      }
      return audioCtx;
    };

    const playTone = (frequency, fixedDurationMs, oscType) => {
      if (skipBootstrapAnimation) return;
      const currentAudioCtx = initAudioContextInternal();
      if (
        !currentAudioCtx ||
        typeof currentAudioCtx.createOscillator !== "function"
      )
        return;
      try {
        const oscillator = currentAudioCtx.createOscillator();
        const gainNode = currentAudioCtx.createGain();
        const duration = Math.max(fixedDurationMs / 1000, 0.01);
        oscillator.type = oscType;
        oscillator.frequency.setValueAtTime(
          frequency,
          currentAudioCtx.currentTime
        );
        gainNode.gain.setValueAtTime(0.3, currentAudioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.001,
          currentAudioCtx.currentTime + duration
        );
        oscillator.connect(gainNode).connect(currentAudioCtx.destination);
        oscillator.start();
        oscillator.stop(currentAudioCtx.currentTime + duration);
      } catch (e) {
        const logFunc = blLogger ? blLogger.logEvent : console.warn;
        logFunc("warn", "Tone playback error:", e.message);
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
        detail ? ` | ${detail}` : ""
      }`;
      bootstrapLogMessages += logLine + "\n";

      const logFunc = blLogger
        ? blLogger.logEvent
        : console[
            level === "error" ? "error" : level === "warn" ? "warn" : "log"
          ];
      if (blLogger) {
        logFunc(level, message, detail || "");
      } else {
        logFunc(logLine);
      }

      if (skipOutput || !loadingIndicator) return;
      uiUpdatePromise = uiUpdatePromise
        .then(async () => {
          const logEntryContainer = document.createElement("div");
          logEntryContainer.className = `log-entry log-${level}`;
          loadingIndicator.appendChild(logEntryContainer);
          const fullText = `> ${message}${detail ? ` | ${detail}` : ""}`;

          if (skipBootstrapAnimation) {
            logEntryContainer.textContent = fullText;
          } else {
            if (level === "error") playTone(220, TONE_DURATION_MS, "square");
            lastToneTime = performance.now();

            for (const char of fullText) {
              logEntryContainer.textContent += char;
              if (loadingIndicator.scrollTop !== undefined) {
                loadingIndicator.scrollTop = loadingIndicator.scrollHeight;
              }
              const currentTime = performance.now();
              if (
                char.trim() &&
                level !== "error" &&
                currentTime - lastToneTime >= MIN_TONE_INTERVAL_MS
              ) {
                playTone(990, TONE_DURATION_MS, "triangle");
                lastToneTime = currentTime;
              }
              if (charDelay > 0) {
                await new Promise((resolve) =>
                  setTimeout(resolve, Math.max(charDelay, 1))
                );
              }
              if (skipBootstrapAnimation) {
                logEntryContainer.textContent = fullText;
                break;
              }
            }
          }
          if (loadingIndicator.scrollTop !== undefined) {
            loadingIndicator.scrollTop = loadingIndicator.scrollHeight;
          }
        })
        .catch((error) => {
          const logMsg = "Error during bootstrap logging UI update:";
          const errorLogFunc = blLogger ? blLogger.logEvent : console.error;
          errorLogFunc("error", logMsg, error);
          uiUpdatePromise = Promise.resolve();
        });
      await uiUpdatePromise;
    };
  })();

  const initAudioContext = () => {
    if (!isAudioInitAttempted && !audioCtx) {
      isAudioInitAttempted = true;
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        const logFunc = blLogger ? blLogger.logEvent : console.warn;
        logFunc("warn", "AudioContext init failed on demand:", e.message);
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
    const depNames = Object.keys(dependencies);
    const depValues = Object.values(dependencies);

    const logError = (msg, det) =>
      bl ? bl(msg, "error", det) : console.error(msg, det || "");

    if (
      depNames.length !== depValues.length ||
      depValues.some((dep) => dep === undefined || dep === null)
    ) {
      const missing = depNames.filter(
        (name, i) => depValues[i] === undefined || depValues[i] === null
      );
      logError(
        `Cannot load module ${filePath}: Missing dependencies: ${missing.join(
          ", "
        )}`,
        dependencies
      );
      throw new Error(`Dependency error for ${filePath}`);
    }

    try {
      const response = await fetch(filePath);
      if (!response.ok)
        throw new Error(`HTTP ${response.status} for ${filePath}`);
      const scriptContent = await response.text();

      const tempScope = {};
      const funcArgs = ["tempScope", ...depNames];

      const funcBody = `
        ${scriptContent}
        if (typeof ${exportName} !== 'undefined') {
            if (typeof ${exportName} === 'function') {
                tempScope.result = ${exportName}(${depNames.join(", ")});
            } else {
                tempScope.result = ${exportName};
            }
        } else {
            tempScope.result = undefined;
        }
      `;

      const factoryFunction = new Function(...funcArgs, funcBody);
      factoryFunction(tempScope, ...depValues);

      if (tempScope.result === undefined) {
        const logWarn = bl
          ? (msg, det) => bl(msg, "warn", det)
          : (msg, det) => console.warn(msg, det || "");
        logWarn(
          `Module ${filePath} executed, but export '${exportName}' was not found or not assigned correctly.`,
          scriptContent.substring(0, 200)
        );
        throw new Error(
          `Module ${filePath} did not yield expected export '${exportName}'.`
        );
      }
      return tempScope.result;
    } catch (error) {
      logError(
        `Fatal Error loading/executing module ${filePath}`,
        error.message + (error.stack ? `\nStack: ${error.stack}` : "")
      );
      throw error;
    }
  }

  async function loadCoreDependencies() {
    try {
      await bl("Loading core configuration...", "info");
      const configResponse = await fetch("reploid-core-config.json");
      if (!configResponse.ok)
        throw new Error(`HTTP ${configResponse.status} loading config.json`);
      config = await configResponse.json();
      if (!config) throw new Error("Failed to parse config.json");
      await bl("Config loaded.", "detail", `Version: ${config.STATE_VERSION}`);

      await bl("Loading core utilities...", "info");
      Utils = await fetchAndExecuteModule(
        "reploid-core-utils.js",
        "UtilsModule"
      );
      if (!Utils || !Utils.logger)
        throw new Error("Failed to load or execute UtilsModule correctly.");
      blLogger = Utils.logger;
      await bl("Utils loaded.", "detail");

      await bl("Loading core storage...", "info");
      Storage = await fetchAndExecuteModule(
        "reploid-core-storage.js",
        "StorageModule",
        { config, logger: Utils.logger }
      );
      if (!Storage || typeof Storage.getState !== "function")
        throw new Error("Failed to load or execute StorageModule correctly.");
      await bl("Storage loaded.", "detail");

      await bl("Core dependencies loaded (Config, Utils, Storage).", "info");
      return true;
    } catch (error) {
      await bl(
        "FATAL: Failed to load core dependencies.",
        "error",
        error.message
      );
      console.error("Dependency Load Error:", error);
      if (loadingIndicator) {
        loadingIndicator.innerHTML = `<div class="log-entry log-error">> FATAL BOOTSTRAP ERROR: ${error.message}. Cannot continue. Check console.</div>`;
      }
      if (loadingContainer) loadingContainer.classList.remove("hidden");
      if (startPrompt) startPrompt.classList.add("hidden");
      removeInteractionListeners();
      return false;
    }
  }

  function isValidState(parsedState) {
    if (!config || !parsedState) return false;
    const stateVersionMajor = config.STATE_VERSION.split(".")[0];
    const parsedVersionMajor = parsedState.version?.split(".")[0];
    const validVersion = parsedVersionMajor === stateVersionMajor;
    const basicStructureValid =
      typeof parsedState.totalCycles === "number" &&
      parsedState.totalCycles >= 0 &&
      parsedState.artifactMetadata &&
      typeof parsedState.artifactMetadata === "object";

    if (!validVersion) {
      bl(
        "State version mismatch.",
        "warn",
        `Found: ${parsedState.version}, Required: ${config.STATE_VERSION} (Major: ${stateVersionMajor})`
      );
    }
    if (!basicStructureValid) {
      bl(
        "State basic structure invalid.",
        "warn",
        `Missing cycles or metadata.`
      );
    }
    return validVersion && basicStructureValid;
  }

  async function verifyArtifactChecksum(id, cycle, expectedChecksum) {
    if (!expectedChecksum) return true;
    const content = Storage.getArtifactContent(id, cycle);
    if (content === null) return false;

    let actualChecksum = null;
    try {
      // Placeholder: Replace with actual async SHA-256 hashing if library available
      // const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
      // const hashArray = Array.from(new Uint8Array(hashBuffer));
      // actualChecksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      actualChecksum = `sha256-placeholder-${content.length}`; // Simple placeholder
    } catch (e) {
      bl(`Checksum calculation failed for ${id}_${cycle}`, "error", e.message);
      return false;
    }

    if (actualChecksum !== expectedChecksum) {
      bl(
        `Checksum mismatch for ${id}_${cycle}`,
        "warn",
        `Expected: ${expectedChecksum}, Actual: ${actualChecksum}`
      );
      return false;
    }
    return true;
  }

  async function checkEssentialArtifactsPresent(stateCycle, artifactMetadata) {
    if (!Storage || !config || !artifactMetadata) return false;
    await bl(
      `Verifying essential artifacts for state cycle ${stateCycle}...`,
      "info"
    );
    let allFoundAndValid = true;
    const essentialDefs = config.GENESIS_ARTIFACT_DEFS || {};
    const verificationPromises = [];

    for (const id in essentialDefs) {
      if (id === "reploid.core.config") continue;
      const meta = artifactMetadata[id];
      const cycleToCheck = meta?.latestCycle >= 0 ? meta.latestCycle : 0; // Check latest or genesis
      const key = Storage.getArtifactKey(id, cycleToCheck);
      const content = Storage.getArtifactContent(id, cycleToCheck);

      if (content === null) {
        await bl(
          `Essential artifact MISSING: ${id}`,
          "error",
          `Cycle: ${cycleToCheck}, Key: ${key}`
        );
        allFoundAndValid = false;
      } else {
        // Checksum verification (using placeholder)
        const expectedChecksum = meta?.checksum; // Assuming metadata might store checksum
        verificationPromises.push(
          verifyArtifactChecksum(id, cycleToCheck, expectedChecksum).then(
            (isValid) => {
              if (!isValid) {
                allFoundAndValid = false;
                bl(
                  `Essential artifact INVALID (Checksum): ${id}`,
                  "error",
                  `Cycle: ${cycleToCheck}`
                );
              } else {
                bl(
                  `Verified: ${id}`,
                  "detail",
                  `Cycle: ${cycleToCheck}, Length: ${content.length}${
                    expectedChecksum ? ", Checksum OK" : ""
                  }`
                );
              }
            }
          )
        );
      }
    }

    await Promise.all(verificationPromises);

    if (!allFoundAndValid) {
      await bl(
        "One or more essential artifacts missing or invalid for the loaded state.",
        "error"
      );
    } else {
      await bl(
        "All essential artifacts verified for the loaded state.",
        "info"
      );
    }
    return allFoundAndValid;
  }

  async function clearAllReploidData() {
    if (!Storage || typeof Storage.clearAllReploidData !== "function") {
      await bl(
        "Cannot clear data, Storage module or function not loaded correctly.",
        "error"
      );
      return;
    }
    await bl(
      "Clearing all REPLOID data from LocalStorage...",
      "warn",
      "This cannot be undone.",
      16
    );
    try {
      Storage.clearAllReploidData();
      await bl("LocalStorage cleared.", "info", null, 8);
    } catch (e) {
      await bl(
        "Error occurred during Storage.clearAllReploidData() call.",
        "error",
        e.message
      );
    }
  }

  async function bootstrapReploid(performGenesis = false) {
    await bl("Model CPS-9204", "info", null, 32);
    await bl("Copyright (c) 2105, 2109, 2114", "info", null, 32);
    await bl("NOM Corporation", "info", null, 32);
    await bl("All Rights Reserved", "info", null, 32);
    await bl(" ", "info", null, 64);

    if (!config || !Utils || !Storage) {
      await bl("Core dependencies check failed, cannot bootstrap.", "error");
      return;
    }
    blLogger = Utils.logger;

    let state = null;
    let needsGenesis = performGenesis;
    let stateSource = performGenesis ? "Forced Genesis" : "None";

    if (!performGenesis) {
      await bl("Checking for existing state...", "info");
      const stateJSON = Storage.getState();
      if (stateJSON) {
        state = stateJSON;
        if (isValidState(state)) {
          if (
            await checkEssentialArtifactsPresent(
              state.totalCycles,
              state.artifactMetadata
            )
          ) {
            stateSource = `localStorage (Cycle ${state.totalCycles})`;
            await bl(
              `Found valid state and artifacts.`,
              "info",
              `Source: ${stateSource}`
            );
            needsGenesis = false;
          } else {
            await bl(
              `State object valid (Cycle ${state.totalCycles}) but essential artifacts missing/invalid. Discarding state.`,
              "error"
            );
            state = null;
            Storage.removeState();
            needsGenesis = true;
            stateSource = "Discarded Invalid State";
          }
        } else {
          await bl(
            `Found invalid/incompatible state (v${
              state?.version || "?"
            }). Discarding.`,
            "warn"
          );
          state = null;
          Storage.removeState();
          needsGenesis = true;
          stateSource = "Discarded Invalid State";
        }
      } else {
        await bl("No existing state found. Initiating genesis.", "info");
        needsGenesis = true;
        stateSource = "Genesis";
      }
    } else {
      await bl("Reset requested...", "info", null, 1);
      await bl(".", "info", null, 256);
      await bl(".", "info", null, 256);
      await bl(".", "info", null, 256);
      needsGenesis = true;
      stateSource = "Forced Genesis";
    }

    try {
      if (needsGenesis) {
        await bl("Running genesis boot process...", "info");
        await bl("    ", "info", null, 16);
        state = await runGenesisProcess();
        if (!state) {
          await bl(
            "Genesis boot process failed. REPLOID cannot start.",
            "error"
          );
          await bl("    ", "info", null, 16);
          return;
        }
        await bl("Genesis complete.", "success");
      }
      await bl(`Loading application with state from: ${stateSource}`, "info");
      await uiUpdatePromise;
      await loadAndExecuteApp(state);
    } catch (error) {
      await bl("Fatal bootstrap error", "error", error.message);
      console.error("Bootstrap stack trace:", error);
      if (loadingIndicator)
        loadingIndicator.innerHTML += `<div class="log-error">FATAL BOOTSTRAP ERROR: ${error.message}. Check console.</div>`;
    }
  }

  async function fetchGenesisArtifacts() {
    if (!config || !config.GENESIS_ARTIFACT_DEFS) {
      await bl(
        "Cannot fetch genesis artifacts: Config or definitions missing.",
        "error"
      );
      return null;
    }
    await bl("Fetching genesis artifacts...", "info");
    const fetchedArtifacts = {};
    let success = true;
    const fetchPromises = Object.entries(config.GENESIS_ARTIFACT_DEFS).map(
      async ([id, def]) => {
        if (id === "reploid.core.config" || !def.filename) return;
        try {
          const response = await fetch(def.filename);
          if (!response.ok)
            throw new Error(`HTTP ${response.status} for ${def.filename}`);
          let content;
          if (def.type === "JSON" || def.type === "JSON_CONFIG") {
            const jsonContent = await response.json();
            content = JSON.stringify(jsonContent, null, 2);
          } else {
            content = await response.text();
          }
          fetchedArtifacts[id] = content;
          await bl(
            `Fetched: ${def.filename}`,
            "detail",
            `${content.length} bytes`
          );
        } catch (error) {
          await bl(`Failed to fetch ${def.filename}`, "error", error.message);
          success = false;
        }
      }
    );
    await Promise.all(fetchPromises);
    if (!success) {
      await bl(
        "Genesis artifact fetch failed. One or more artifacts could not be retrieved.",
        "error"
      );
      return null;
    }
    await bl(
      `Fetched ${Object.keys(fetchedArtifacts).length} genesis artifacts.`,
      "skip"
    );
    return fetchedArtifacts;
  }

  async function saveGenesisArtifacts(artifacts) {
    if (!Storage || !config || !artifacts) return null;
    await bl("Saving genesis artifacts (Cycle 0)...", "info");
    const metadata = {};
    let success = true;
    const genesisDefs = config.GENESIS_ARTIFACT_DEFS || {};

    for (const id in artifacts) {
      try {
        Storage.setArtifactContent(id, 0, artifacts[id]);
        // Placeholder for checksum calculation
        const checksum = `sha256-placeholder-${artifacts[id].length}`;
        metadata[id] = {
          id: id,
          latestCycle: 0,
          type: genesisDefs[id]?.type || "UNKNOWN",
          description:
            genesisDefs[id]?.description || "Unknown Genesis Artifact",
          source: "Genesis",
          checksum: checksum,
        };
        await bl(
          `Saved: ${id}`,
          "detail",
          `Cycle 0, Checksum: ${checksum.substring(0, 15)}...`
        );
      } catch (e) {
        await bl(
          `Failed to save artifact: ${id} (Cycle 0)`,
          "error",
          e.message
        );
        success = false;
        // Continue saving others if possible, but report failure overall
      }
    }

    const bootScriptElement = document.querySelector(
      'script[src="reploid-boot-script.js"]'
    );
    const bootScriptContent = bootScriptElement
      ? await fetch(bootScriptElement.src).then((res) =>
          res.ok ? res.text() : "(Failed to fetch self)"
        )
      : "(Boot Script Element Not Found)";
    const bootStyleContent =
      document.getElementById("boot-style")?.textContent || "";
    const bootArtifactsToSave = {
      "reploid.boot.style": {
        content: bootStyleContent,
        type: "CSS",
        description: "Bootstrap CSS",
      },
      "reploid.boot.script": {
        content: bootScriptContent,
        type: "JS",
        description: "Bootstrap script (Initial snapshot)",
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
        const checksum = `sha256-placeholder-${content.length}`;
        metadata[id] = {
          id: id,
          latestCycle: 0,
          type: type,
          description: description,
          source: "Bootstrap",
          checksum: checksum,
        };
        await bl(
          `Saved: ${id}`,
          "detail",
          `Cycle 0, Checksum: ${checksum.substring(0, 15)}...`
        );
      } catch (e) {
        await bl(`Failed to save bootstrap artifact: ${id}`, "warn", e.message);
        success = false;
      }
    }

    await bl(
      "Genesis artifact save process completed.",
      success ? "info" : "error"
    );
    return success ? metadata : null;
  }

  async function runGenesisProcess() {
    const fetchedArtifacts = await fetchGenesisArtifacts();
    if (!fetchedArtifacts) return null;
    const artifactMetadata = await saveGenesisArtifacts(fetchedArtifacts);
    if (!artifactMetadata) return null;
    if (!config) {
      await bl("Config not loaded, cannot create initial state.", "error");
      return null;
    }

    // Add metadata for JS files defined but not fetched (if any)
    Object.keys(config.GENESIS_ARTIFACT_DEFS || {}).forEach((id) => {
      if (!artifactMetadata[id] && id !== "reploid.core.config") {
        const def = config.GENESIS_ARTIFACT_DEFS[id];
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
      config.DEFAULT_MODELS?.BASE || "gemini-1.5-flash-latest";
    const defaultCritiqueModel =
      config.DEFAULT_MODELS?.CRITIQUE || defaultCoreModel;

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
        ...config.DEFAULT_CFG,
        coreModel: defaultCoreModel,
        critiqueModel: defaultCritiqueModel,
      },
      artifactMetadata: artifactMetadata,
      dynamicTools: [],
    };
    try {
      Storage.saveState(initialState);
      await bl("Initial state saved successfully.", "info");
      return initialState;
    } catch (e) {
      await bl("Failed to save initial state!", "error", e.message);
      return null;
    }
  }

  async function loadAndExecuteApp(currentState) {
    await bl(
      `Loading application core (State Cycle ${currentState.totalCycles})...`,
      "info"
    );
    if (!config || !Utils || !Storage) {
      await bl("Core dependencies not available, cannot execute app.", "error");
      return;
    }

    const currentCycle = currentState.totalCycles;
    const coreStyleId = "reploid.core.style";
    const coreLogicId = "reploid.core.logic";
    const coreBodyId = "reploid.core.body";

    try {
      const styleContent =
        Storage.getArtifactContent(coreStyleId, currentCycle) ||
        Storage.getArtifactContent(coreStyleId, 0);
      if (styleContent) {
        const styleElement = document.createElement("style");
        styleElement.id = `${coreStyleId}-loaded-${currentCycle}`;
        styleElement.textContent = styleContent;
        document.head.appendChild(styleElement);
        await bl(
          `Applied core style: ${coreStyleId} (Cycle ${currentCycle})`,
          "skip"
        );
      } else {
        await bl(
          `Core style artifact missing for Cycle ${currentCycle} and 0.`,
          "warn"
        );
      }

      const coreBodyContent =
        Storage.getArtifactContent(coreBodyId, currentCycle) ||
        Storage.getArtifactContent(coreBodyId, 0);
      if (coreBodyContent && appRoot) {
        await bl(
          `Injecting core body HTML: ${coreBodyId} (Cycle ${currentCycle})`,
          "info"
        );
        appRoot.innerHTML = coreBodyContent;
      } else {
        await bl(
          `Core body artifact or #app-root missing. Cannot inject UI structure.`,
          "error"
        );
        throw new Error("Failed to load core UI structure.");
      }

      const orchestratorScriptContent =
        Storage.getArtifactContent(coreLogicId, currentCycle) ||
        Storage.getArtifactContent(coreLogicId, 0);
      if (!orchestratorScriptContent) {
        throw new Error(
          `Core application orchestrator script artifact missing for Cycle ${currentCycle} and 0.`
        );
      }

      await bl(
        `Executing core application orchestrator: ${coreLogicId} (Cycle ${currentCycle})...`,
        "info"
      );

      // Execute the orchestrator script
      const orchestratorFunction = new Function(
        "config",
        "Utils",
        "Storage",
        orchestratorScriptContent +
          "\nreturn CoreLogicModule(config, Utils, Storage);"
      );
      const maybePromise = orchestratorFunction(config, Utils, Storage);
      if (maybePromise instanceof Promise) {
        await maybePromise;
      }

      await bl("Core application orchestrator execution initiated.", "success");

      setTimeout(() => {
        if (loadingContainer) {
          loadingContainer.style.transition = "opacity 0.5s ease-out";
          loadingContainer.style.opacity = "0";
          setTimeout(() => loadingContainer.classList.add("hidden"), 500);
        }
        if (appRoot) appRoot.classList.add("visible");
      }, 500);
    } catch (error) {
      await bl(
        `Error loading/executing core application components`,
        "error",
        error.message
      );
      console.error("Core execution failed", error);
      if (loadingIndicator)
        loadingIndicator.innerHTML += `<div class="log-error">FATAL CORE EXECUTION ERROR: ${error.message}. Check console.</div>`;
    }
  }

  function startInteraction(action) {
    if (interactionStarted) return;
    interactionStarted = true;
    skipBootstrapAnimation = false;
    if (startPrompt) startPrompt.classList.add("hidden");
    if (loadingContainer) loadingContainer.classList.remove("hidden");
    initAudioContext();
    removeInteractionListeners();
    addSkipListener();

    loadCoreDependencies().then(async (dependenciesLoaded) => {
      if (!dependenciesLoaded) {
        removeSkipListener();
        return;
      }
      if (action === "reset") {
        await clearAllReploidData();
        await bl("Rebooting...", "info", null, 64);
        await bl("            ", "info", null, 8);
        await bootstrapReploid(true);
      } else {
        await bootstrapReploid(false);
      }
      removeSkipListener();
    });
  }

  function handleSkip(e) {
    if (e.key === "Enter" || e.type === "click" || e.type === "touchstart") {
      if (!skipBootstrapAnimation) {
        skipBootstrapAnimation = true;
        bl("[BOOTSTRAP SKIP]", "info", null, 0);
        if (e.type === "touchstart") e.preventDefault();
      }
    }
  }

  function handleKeydown(e) {
    if (!interactionStarted) {
      if (e.key === "Enter") startInteraction("continue");
      else if (e.key === " ") startInteraction("reset");
    }
  }
  function handleClick() {
    if (!interactionStarted) {
      startInteraction("continue");
    }
  }
  function handleTouchStart(e) {
    if (!interactionStarted) {
      e.preventDefault();
      holdTimeoutId = setTimeout(() => {
        startInteraction("reset");
      }, HOLD_DURATION_MILLIS);
    }
  }
  function handleTouchEnd(e) {
    if (!interactionStarted) {
      e.preventDefault();
      clearTimeout(holdTimeoutId);
    }
  }
  function removeInteractionListeners() {
    document.removeEventListener("keydown", handleKeydown);
    document.removeEventListener("click", handleClick);
    document.removeEventListener("touchstart", handleTouchStart);
    document.removeEventListener("touchend", handleTouchEnd);
    document.removeEventListener("touchcancel", handleTouchEnd);
  }
  function addSkipListener() {
    document.addEventListener("keydown", handleSkip);
    document.addEventListener("click", handleSkip);
    document.addEventListener("touchstart", handleSkip, { passive: false });
  }
  function removeSkipListener() {
    document.removeEventListener("keydown", handleSkip);
    document.removeEventListener("click", handleSkip);
    document.removeEventListener("touchstart", handleSkip);
  }

  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("click", handleClick);
  document.addEventListener("touchstart", handleTouchStart, { passive: false });
  document.addEventListener("touchend", handleTouchEnd);
  document.addEventListener("touchcancel", handleTouchEnd);
})();
