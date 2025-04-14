const CoreLogicModule = (initialConfig, initialUtils, initialStorage) => {
  const loadModule = async (filePath, exportName, dependencies = {}) => {
    const logger = initialUtils?.logger || {
      logEvent: (lvl, msg, det) =>
        console.error(`[ORCHESTRATOR FALLBACK] ${msg}`, det || ""),
    };
    const depNames = Object.keys(dependencies);
    const depValues = Object.values(dependencies);

    if (
      depNames.length !== depValues.length ||
      depValues.some((dep) => dep === undefined || dep === null)
    ) {
      logger.logEvent(
        "error",
        `Cannot load module ${filePath}: Missing dependencies ${depNames.join(
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
        logger.logEvent(
          "warn",
          `Module ${filePath} executed, but export '${exportName}' was not found or not assigned correctly.`,
          scriptContent.substring(0, 200)
        );
        throw new Error(
          `Module ${filePath} did not yield expected export '${exportName}'.`
        );
      }

      return tempScope.result;
    } catch (error) {
      logger.logEvent(
        "error",
        `Fatal Error loading/executing module ${filePath}`,
        error.message + (error.stack ? `\nStack: ${error.stack}` : "")
      );
      throw error;
    }
  };

  const initializeApplication = async () => {
    let config = initialConfig;
    let Utils = initialUtils;
    let Storage = initialStorage;
    let logger = null;

    try {
      if (!config || !Utils || !Storage) {
        console.error(
          "Orchestrator did not receive essential modules from bootstrap."
        );
        document.body.innerHTML =
          '<div style="color:red; padding: 20px; font-family: monospace;"><h1>FATAL ERROR</h1><p>Core modules (Config, Utils, Storage) not passed from bootstrap.</p></div>';
        return;
      }
      logger = Utils.logger;

      logger.logEvent("info", "Orchestrator: Loading application modules...");

      const StateManager = await loadModule(
        "reploid-core-statemanager.js",
        "StateManagerModule",
        { config, logger, Storage }
      );
      const ToolRunner = await loadModule(
        "reploid-core-toolrunner.js",
        "ToolRunnerModule",
        { config, logger, Storage, StateManager }
      );
      const ApiClient = await loadModule(
        "reploid-core-apiclient.js",
        "ApiClientModule",
        { config, logger }
      );
      const DiagramFactory = await loadModule(
        "reploid-core-diagram-factory.js",
        "renderCycleSVG"
      );
      const UI = await loadModule("reploid-core-ui.js", "UIModule", {
        config,
        logger,
        Utils,
        Storage,
        DiagramFactory, // Pass the loaded function
      });
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

      StateManager.init();
      CycleLogic.init();

      setTimeout(() => {
        try {
          UI.init(StateManager, CycleLogic); // UI init still deferred
          logger.logEvent(
            "info",
            "Orchestrator: Application initialization sequence complete."
          );
        } catch (uiError) {
          logger.logEvent(
            "error",
            "Orchestrator: UI Initialization failed inside setTimeout.",
            uiError
          );
          document.body.innerHTML = `<div style="color:red; padding: 20px; font-family: monospace;"><h1>FATAL ERROR</h1><p>UI initialization failed. Check console.</p><p>${uiError.message}</p></div>`;
        }
      }, 0);
    } catch (error) {
      console.error("Orchestrator: Initialization failed.", error);
      const log = logger || {
        logEvent: (lvl, msg) => console.error(`[ORCHESTRATOR FALLBACK] ${msg}`),
      };
      log.logEvent("error", "Orchestrator: Initialization failed.", error);
      document.body.innerHTML = `<div style="color:red; padding: 20px; font-family: monospace;"><h1>FATAL ERROR</h1><p>Application initialization failed. Check console.</p><p>${error.message}</p></div>`;
    }
  };

  initializeApplication();
};
