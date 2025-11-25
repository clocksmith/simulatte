import config from "./config.js";
import Storage from "./storage.js";
import Utils from "./utils.js";

const BOOT_TIMEOUT_MS = 30000; // 30 second timeout for boot sequence

const bootstrap = async () => {
  const loadEl = Utils.id("loading");
  const logEl = Utils.id("boot_log");
  const appEl = Utils.id("app");
  const statusEl = Utils.id("loading_status");
  const spinnerEl = Utils.id("loading_spinner");

  let bootComplete = false;

  // Set up boot timeout to prevent infinite spinner
  const bootTimeoutId = setTimeout(() => {
    if (!bootComplete) {
      const errorMsg = "Boot timeout: Application failed to initialize within 30 seconds.";
      if (statusEl) {
        statusEl.textContent = "Initialization timed out";
        statusEl.style.color = "var(--err, #ef5350)";
      }
      if (spinnerEl) spinnerEl.style.display = "none";
      if (logEl) {
        logEl.textContent += `\n[${new Date().toISOString()}] [ERROR] ${errorMsg}\n`;
        logEl.style.color = "var(--err, #ef5350)";
        logEl.style.borderColor = "var(--err, #ef5350)";
        // Auto-expand details on timeout
        const detailsEl = logEl.closest("details");
        if (detailsEl) detailsEl.open = true;
      }
      console.error(errorMsg);
    }
  }, BOOT_TIMEOUT_MS);

  const update_status = (msg) => {
    if (statusEl) statusEl.textContent = msg;
  };

  const boot_log = (lvl, msg, ...details) => {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${lvl.toUpperCase()}] ${msg} ${details
      .map((d) => Utils.stringify(d))
      .join(" ")}\n`;
    if (logEl) {
      logEl.textContent += line;
      logEl.scrollTop = logEl.scrollHeight;
    }
    const method =
      lvl === "error"
        ? console.error
        : lvl === "warn"
        ? console.warn
        : console.log;
    method(line.trim());
  };

  try {
    boot_log("info", "Boot sequence started...");
    boot_log("info", `Config loaded (v${config.version})`);
    update_status("Loading configuration...");

    Utils.logger.init(config);
    const log = Utils.logger;
    log.info("Utils & Logger initialized.");

    update_status("Initializing storage...");
    const storage = Storage(config, log);
    if (!storage) throw new Error("Storage init failed.");
    log.info("Storage initialized.");
    const usage = storage.usage();
    log.info(
      `Initial storage usage: ${(usage.used / 1024).toFixed(
        1
      )}KB (${usage.pct.toFixed(1)}%)`
    );

    const ensurePromptTemplate = async () => {
      const existing = storage.get_artifact(config.promptTemplateArtifactId);
      if (existing && existing.trim().length > 0) {
        log.debug("Prompt template artifact already seeded.");
        return;
      }
      try {
        const response = await fetch(new URL('./prompt.txt', window.location.href), {
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} while fetching prompt template.`);
        }
        const template = await response.text();
        if (!template || !template.trim()) {
          throw new Error('Fetched prompt template is empty.');
        }
        storage.set_artifact(config.promptTemplateArtifactId, template);
        log.info('Seeded default prompt template artifact.', {
          artifact: config.promptTemplateArtifactId,
          bytes: template.length,
        });
      } catch (error) {
        log.error('Failed to seed prompt template artifact from prompt.txt', error);
      }
    };

    await ensurePromptTemplate();

    update_status("Loading core modules...");
    const StateManager = (await import("./state_manager.js")).default(
      config,
      log,
      storage
    );
    const ApiClient = (await import("./api_client.js")).default(config, log);
    const McpConverter = (await import("./mcp_converter.js")).default(
      config,
      log
    );
    const ToolRunner = (await import("./tool_runner.js")).default(config, log);
    const CycleLogic = (await import("./cycle_logic.js")).default(
      config,
      log,
      Utils,
      storage,
      StateManager,
      ApiClient,
      McpConverter,
      ToolRunner
    );
    const UiManager = (await import("./ui_manager.js")).default(
      config,
      log,
      Utils,
      storage,
      StateManager,
      CycleLogic,
      ToolRunner
    ); // Pass ToolRunner too

    log.info("Core modules loaded.");

    update_status("Initializing application...");
    StateManager.init();
    log.info("StateManager initialized.");

    CycleLogic.init();
    log.info("CycleLogic initialized.");

    update_status("Setting up interface...");
    await UiManager.init();
    log.info("UiManager initialized.");

    update_status("Ready!");
    log.info("Bootstrap complete. Launching app.");
    bootComplete = true;
    clearTimeout(bootTimeoutId);
    if (loadEl) loadEl.classList.add("hidden");
    if (appEl) appEl.classList.remove("hidden");
  } catch (error) {
    bootComplete = true;
    clearTimeout(bootTimeoutId);
    const errorMsg = `FATAL BOOTSTRAP ERROR: ${error.message}`;
    boot_log("error", errorMsg, error.stack);
    if (logEl) {
      logEl.style.color = "red";
      logEl.style.borderColor = "red";
    }
    if (appEl) appEl.classList.add("hidden");
    if (!logEl && loadEl) {
      loadEl.innerHTML = `<h1 style="color:red;">Init Failed</h1><pre style="color:red;text-align:left;">${errorMsg}\n${
        error.stack || ""
      }</pre>`;
    }
  }
};
bootstrap();
