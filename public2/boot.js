import Utils from "./utils.js";
import StorageModule from "./storage.js";

const bootstrap = async () => {
  const loadingContainer = Utils.$id("loading-container");
  const bootLog = Utils.$id("boot-log");
  const appRoot = Utils.$id("app-root");

  const logToBootScreen = (level, message, ...details) => {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level.toUpperCase()}] ${message} ${details
      .map((d) => JSON.stringify(d))
      .join(" ")}\n`;
    if (bootLog) {
      bootLog.textContent += line;
      bootLog.scrollTop = bootLog.scrollHeight;
    }

    const consoleMethod =
      level === "error"
        ? console.error
        : level === "warn"
        ? console.warn
        : console.log;
    consoleMethod(line.trim());
  };

  let config = null;
  let storage = null;
  let logger = null;

  try {
    logToBootScreen("info", "Boot sequence started...");

    logToBootScreen("info", "Fetching configuration...");
    const configResponse = await fetch("config.json");
    if (!configResponse.ok)
      throw new Error(`Failed to fetch config.json: ${configResponse.status}`);
    config = await configResponse.json();
    logToBootScreen("info", `Configuration loaded (v${config.version})`);

    Utils.logger.init(config);
    logger = Utils.logger;
    logger.logEvent("info", "Utilities and Logger initialized.");

    storage = StorageModule(config, logger);
    if (!storage) throw new Error("Storage module initialization failed.");
    logger.logEvent("info", "Storage module initialized.");
    const usage = storage.getStorageUsage();
    logger.logEvent(
      "info",
      `Initial storage usage: ${(usage.used / 1024).toFixed(
        1
      )}KB (${usage.percent.toFixed(1)}%)`
    );

    let state = storage.getState();
    if (state) {
      if (state.version !== config.version) {
        logger.logEvent(
          "warn",
          `State version mismatch (State: ${state.version}, Config: ${config.version}). Re-initializing state.`
        );
        state = null;
        storage.removeState();
      } else {
        logger.logEvent("info", `Existing state found (v${state.version}).`);
      }
    } else {
      logger.logEvent(
        "info",
        "No existing state found. Initializing new state."
      );
    }

    logger.logEvent("info", "Loading core application modules...");

    const StateManager = (await import("./state-manager.js")).default(
      config,
      logger,
      storage
    );
    const ApiClient = (await import("./api-client.js")).default(config, logger);
    const MCPConverter = (await import("./mcp-converter.js")).default(
      config,
      logger
    );
    const ToolRunner = (await import("./tool-runner.js")).default(
      config,
      logger
    );
    const CycleLogic = (await import("./cycle-logic.js")).default(
      config,
      logger,
      Utils,
      storage,
      StateManager,
      ApiClient,
      MCPConverter,
      ToolRunner
    );
    const UIManager = (await import("./ui-manager.js")).default(
      config,
      logger,
      Utils,
      storage,
      StateManager,
      CycleLogic
    );

    logger.logEvent("info", "Core modules loaded.");

    StateManager.init(state);
    logger.logEvent("info", "StateManager initialized.");

    CycleLogic.init();
    logger.logEvent("info", "CycleLogic initialized.");

    await UIManager.init();
    logger.logEvent("info", "UIManager initialized.");

    logger.logEvent("info", "Bootstrap complete. Launching application.");
    if (loadingContainer) loadingContainer.classList.add("hidden");
    if (appRoot) appRoot.classList.remove("hidden");
  } catch (error) {
    const errorMsg = `FATAL BOOTSTRAP ERROR: ${error.message}`;
    logToBootScreen("error", errorMsg, error.stack);

    if (bootLog) {
      bootLog.style.color = "var(--error-color)";
      bootLog.style.borderColor = "var(--error-color)";
    }
    if (appRoot) appRoot.classList.add("hidden");

    if (!bootLog && loadingContainer) {
      loadingContainer.innerHTML = `<h1 style="color: var(--error-color);">Initialization Failed</h1><pre style="color: var(--error-color); text-align: left; white-space: pre-wrap;">${errorMsg}\n${
        error.stack || ""
      }</pre>`;
    }
  }
};

bootstrap();