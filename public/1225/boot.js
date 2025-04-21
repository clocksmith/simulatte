import config from "./config.js";
import Storage from "./storage.js";

const bootstrap = async () => {
  const loadEl = Utils.id("loading");
  const logEl = Utils.id("boot_log");
  const appEl = Utils.id("app");

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

    Utils.logger.init(config);
    const log = Utils.logger;
    log.info("Utils & Logger initialized.");

    const storage = Storage(config, log);
    if (!storage) throw new Error("Storage init failed.");
    log.info("Storage initialized.");
    const usage = storage.usage();
    log.info(
      `Initial storage usage: ${(usage.used / 1024).toFixed(
        1
      )}KB (${usage.pct.toFixed(1)}%)`
    );

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

    StateManager.init();
    log.info("StateManager initialized.");

    CycleLogic.init();
    log.info("CycleLogic initialized.");

    await UiManager.init();
    log.info("UiManager initialized.");

    log.info("Bootstrap complete. Launching app.");
    if (loadEl) loadEl.classList.add("hidden");
    if (appEl) appEl.classList.remove("hidden");
  } catch (error) {
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
