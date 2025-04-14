const REPLOID_CORE_Orchestrator = (
  initialConfig,
  initialUtils,
  initialStorage
) => {
  const loadModule = async (filePath, exportName, dependencies = {}) => {
    try {
      const response = await fetch(filePath);
      if (!response.ok)
        throw new Error(`HTTP ${response.status} for ${filePath}`);
      const scriptContent = await response.text();
      const factoryFunction = new Function(
        ...Object.keys(dependencies),
        scriptContent + `\nreturn ${exportName};`
      );
      return factoryFunction(...Object.values(dependencies));
    } catch (error) {
      console.error(`Fatal Error loading/executing module ${filePath}`, error);
      // Use initial logger if available, otherwise console
      const log = initialUtils?.logger || {
        logEvent: (lvl, msg) => console.error(`[ORCHESTRATOR FALLBACK] ${msg}`),
      };
      log.logEvent(
        "error",
        `Fatal Error loading/executing module ${filePath}`,
        error
      );
      throw error; // Re-throw to stop initialization
    }
  };

  const initializeApplication = async () => {
    let config = initialConfig;
    let Utils = initialUtils;
    let Storage = initialStorage;
    let logger = null;

    try {
      // Ensure base modules are loaded (they should be passed from bootstrap)
      if (!config || !Utils || !Storage) {
        console.error(
          "Orchestrator did not receive essential modules from bootstrap."
        );
        // Attempt fallback loading? For simplicity, we'll error out here.
        document.body.innerHTML =
          '<div style="color:red; padding: 20px; font-family: monospace;"><h1>FATAL ERROR</h1><p>Core modules (Config, Utils, Storage) not passed from bootstrap.</p></div>';
        return;
      }
      logger = Utils.logger; // Assign logger now that Utils is confirmed

      logger.logEvent("info", "Orchestrator: Loading application modules...");

      // Load remaining modules, passing dependencies
      const ToolRunner = await loadModule(
        "core_tool_runner.js",
        "ToolRunnerModule",
        { config, logger, Storage, StateManager: null }
      ); // StateManager not needed directly by ToolRunner init usually
      const StateManager = await loadModule(
        "reploid-core-statemanager.js",
        "StateManagerModule",
        { config, logger, Storage }
      );
      const ApiClient = await loadModule(
        "reploid-core-apiclient.js",
        "ApiClientModule",
        { config, logger }
      );
      const UI = await loadModule("reploid-core-ui.js", "UIModule", {
        config,
        logger,
        Utils,
        Storage,
      }); // UI needs Utils/Storage early
      const CycleLogic = await loadModule(
        "reploid-core-cyclelogic.js",
        "CycleLogicModule",
        {
          config,
          logger,
          Utils,
          Storage,
          StateManager,
          UI,
          ApiClient,
          ToolRunner,
        }
      );

      logger.logEvent("info", "Orchestrator: All modules loaded.");

      // Initialize modules that require it, passing further dependencies
      StateManager.init();
      CycleLogic.init(); // CycleLogic might need static tools loaded etc.

      // Initialize UI last, passing StateManager and CycleLogic
      UI.init(StateManager, CycleLogic);

      logger.logEvent(
        "info",
        "Orchestrator: Application initialization sequence complete."
      );
    } catch (error) {
      console.error("Orchestrator: Initialization failed.", error);
      const log = logger || {
        logEvent: (lvl, msg) => console.error(`[ORCHESTRATOR FALLBACK] ${msg}`),
      };
      log.logEvent("error", "Orchestrator: Initialization failed.", error);
      // Display error to user
      document.body.innerHTML = `<div style="color:red; padding: 20px; font-family: monospace;"><h1>FATAL ERROR</h1><p>Application initialization failed. Check console.</p><p>${error.message}</p></div>`;
    }
  };

  // Start the initialization process immediately when this script is executed
  initializeApplication();
};

// The bootstrap script (in index.html) should execute this like:
// const orchestratorFunction = new Function('config', 'Utils', 'Storage', orchestratorScriptContent);
// orchestratorFunction(config, Utils, Storage);
// This assumes config, Utils, Storage are loaded and available in bootstrap's scope.
