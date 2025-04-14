const UtilsModule = (() => {
  const STATE_VERSION = "0.1.0";
  const MAX_LOG_ENTRIES = 1000;
  let logBufferArray = new Array(MAX_LOG_ENTRIES);
  let logBufferIndex = 0;
  let logBufferInitialized = false;

  const initializeLogBuffer = () => {
    logBufferArray.fill(null);
    logBufferIndex = 0;
    logBufferArray[
      logBufferIndex++
    ] = `REPLOID Session Log - ${new Date().toISOString()}\n=========================================\n`;
    logBufferInitialized = true;
  };

  const logger = {
    logEvent: (level, message, ...details) => {
      if (!logBufferInitialized) {
        initializeLogBuffer();
      }
      const timestamp = new Date().toISOString();
      const levelUpper = String(level || "info").toUpperCase();
      let logLine = `[${timestamp}] [${levelUpper}] ${message}`;
      if (
        details &&
        details.length > 0 &&
        details.some((d) => d !== undefined && d !== null)
      ) {
        try {
          const detailsString = details
            .map((d) => {
              if (typeof d === "object" && d !== null) {
                try {
                  return JSON.stringify(d);
                } catch (e) {
                  return "[Unserializable Object]";
                }
              }
              return String(d);
            })
            .join(" ");
          logLine += ` | ${detailsString}`;
        } catch (e) {
          logLine += ` | [Error formatting details: ${e.message}]`;
        }
      }

      logBufferArray[logBufferIndex % MAX_LOG_ENTRIES] = logLine;
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
      const bufferSize = Math.min(logBufferIndex, MAX_LOG_ENTRIES);
      const startIndex =
        logBufferIndex <= MAX_LOG_ENTRIES
          ? 0
          : logBufferIndex % MAX_LOG_ENTRIES;
      let logContent = "";
      for (let i = 0; i < bufferSize; i++) {
        const currentIndex = (startIndex + i) % MAX_LOG_ENTRIES;
        if (logBufferArray[currentIndex] !== null) {
          logContent += logBufferArray[currentIndex] + "\n";
        }
      }
      if (logBufferIndex > MAX_LOG_ENTRIES) {
        logContent =
          `... (Log truncated - showing last ${MAX_LOG_ENTRIES} entries) ...\n` +
          logContent;
      }
      return logContent;
    },
    setLogBuffer: (newBuffer) => {
      initializeLogBuffer(); // Reset buffer state
      if (typeof newBuffer === "string") {
        const lines = newBuffer.split("\n");
        const startIdx = Math.max(0, lines.length - MAX_LOG_ENTRIES);
        for (let i = startIdx; i < lines.length; i++) {
          if (lines[i]) {
            logBufferArray[logBufferIndex % MAX_LOG_ENTRIES] = lines[i];
            logBufferIndex++;
          }
        }
        if (lines.length > MAX_LOG_ENTRIES) {
          const header = `... (Log truncated during import - loaded last ${MAX_LOG_ENTRIES} lines) ...`;
          logBufferArray[
            (logBufferIndex - Math.min(lines.length, MAX_LOG_ENTRIES)) %
              MAX_LOG_ENTRIES
          ] = header;
        }
      } else {
        logger.logEvent(
          "warn",
          "setLogBuffer received invalid buffer type, resetting."
        );
      }
    },
  };

  const $id = (id) => document.getElementById(id);
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const kabobToCamel = (s) => {
    if (s === null || s === undefined) return "";
    return String(s).replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  };

  const camelToKabob = (s) => {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/([A-Z])/g, "-$1")
      .toLowerCase();
  };

  const trunc = (str, len, ellipsis = "...") => {
    const s = String(str ?? "");
    if (s.length <= len) return s;
    const ellipsisLen = ellipsis?.length ?? 0;
    return s.substring(0, len - ellipsisLen) + ellipsis;
  };

  const lc = (s) =>
    s === null || s === undefined ? "" : String(s).toLowerCase();
  const uc = (s) =>
    s === null || s === undefined ? "" : String(s).toUpperCase();

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const getRandomInt = (min, max) => {
    const minCeil = Math.ceil(min);
    const maxFloor = Math.floor(max);
    return Math.floor(Math.random() * (maxFloor - minCeil + 1)) + minCeil;
  };

  return {
    STATE_VERSION,
    logger,
    $id,
    $,
    $$,
    kabobToCamel,
    camelToKabob,
    trunc,
    lc,
    uc,
    delay,
    getRandomInt,
  };
})();
