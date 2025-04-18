const UtilsModule = (() => {
  let config = null;
  let logBufferArray = [];
  let logBufferIndex = 0;
  let logBufferInitialized = false;

  const MAX_LOG_ENTRIES = () => config?.maxLogEntries ?? 1000;

  const initLogBuffer = (cfg) => {
    config = cfg;
    logBufferArray = new Array(MAX_LOG_ENTRIES());
    logBufferArray.fill(null);
    logBufferIndex = 0;
    logBufferArray[
      logBufferIndex++
    ] = `Reploid v2 Log Start - ${new Date().toISOString()}\n=========================================\n`;
    logBufferInitialized = true;
  };

  const stringifyDetail = (detail) => {
    if (detail === undefined || detail === null) return "";
    if (typeof detail === "string") return detail;
    if (detail instanceof Error)
      return `Error: ${detail.message}${
        detail.stack ? `\nStack: ${detail.stack}` : ""
      }`;
    try {
      return JSON.stringify(
        detail,
        (key, value) =>
          typeof value === "bigint" ? value.toString() + "n" : value,
        null,
        2
      );
    } catch (e) {
      return "[Unserializable Object]";
    }
  };

  const logger = {
    init: initLogBuffer,
    logEvent: (level = "info", message = "[No Message]", ...details) => {
      if (!logBufferInitialized) {
        console.warn(
          "Logger not initialized before first log event. Attempting default init."
        );
        initLogBuffer({});
      }

      const timestamp = new Date().toISOString();
      const levelUpper = String(level).toUpperCase();
      let logLine = `[${timestamp}] [${levelUpper}] ${String(message)}`;

      const detailsString = details
        .map(stringifyDetail)
        .filter((s) => s !== "")
        .join(" | ");
      if (detailsString) {
        logLine += ` | ${detailsString}`;
      }

      const currentMaxEntries = MAX_LOG_ENTRIES();
      logBufferArray[logBufferIndex % currentMaxEntries] = logLine;
      logBufferIndex++;

      const consoleMethod =
        level?.toLowerCase() === "error"
          ? console.error
          : level?.toLowerCase() === "warn"
          ? console.warn
          : level?.toLowerCase() === "debug"
          ? console.debug
          : console.log;

      consoleMethod(logLine);
    },

    getLogBuffer: () => {
      if (!logBufferInitialized) return "Log buffer not initialized.\n";
      const currentMaxEntries = MAX_LOG_ENTRIES();
      const bufferSize = Math.min(logBufferIndex, currentMaxEntries);
      const startIndex =
        logBufferIndex <= currentMaxEntries
          ? 0
          : logBufferIndex % currentMaxEntries;
      const logLines = [];
      for (let i = 0; i < bufferSize; i++) {
        const currentIndex = (startIndex + i) % currentMaxEntries;
        if (logBufferArray[currentIndex] !== null) {
          logLines.push(logBufferArray[currentIndex]);
        }
      }
      let logContent = logLines.join("\n") + "\n";

      if (logBufferIndex > currentMaxEntries) {
        logContent =
          `... (Log truncated - showing last ${currentMaxEntries} entries) ...\n` +
          logContent;
      }
      return logContent;
    },
    setLogBuffer: (newBuffer) => {
      if (!logBufferInitialized) {
        initLogBuffer({});
      }
      if (typeof newBuffer === "string") {
        const lines = newBuffer.split("\n").filter((line) => line.trim());
        const currentMaxEntries = MAX_LOG_ENTRIES();
        logBufferArray = new Array(currentMaxEntries).fill(null);

        const startIndex = Math.max(0, lines.length - currentMaxEntries);
        logBufferIndex = 0;

        let loadedCount = 0;
        for (let i = startIndex; i < lines.length; i++) {
          if (logBufferIndex < currentMaxEntries) {
            logBufferArray[logBufferIndex] = lines[i];
            logBufferIndex++;
            loadedCount++;
          } else {
            break;
          }
        }

        if (lines.length > currentMaxEntries) {
          const header = `... (Log truncated during import - loaded last ${loadedCount} lines) ...`;

          logBufferArray.unshift(header);
          if (logBufferIndex < currentMaxEntries) {
            logBufferIndex++;
          } else {
            logBufferArray[currentMaxEntries - 1] =
              logBufferArray[currentMaxEntries - 2];
            logBufferArray[0] = header;
          }
        } else {
          logBufferIndex = loadedCount;
        }
      } else {
        logger.logEvent(
          "warn",
          "setLogBuffer received invalid buffer type, resetting."
        );
        initLogBuffer(config);
      }
    },
    getConfig: () => config,
  };

  const $id = (id) => document.getElementById(id);
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) =>
    Array.from(parent.querySelectorAll(selector));

  const escapeHtml = (unsafe) => {
    if (unsafe === null || unsafe === undefined) return "";
    return String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const generateUUID = () => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0,
          v = c == "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  };

  return {
    logger,
    $id,
    $,
    $$,
    escapeHtml,
    delay,
    generateUUID,
  };
})();

export default UtilsModule;
