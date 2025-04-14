const UtilsModule = (() => {
  const STATE_VERSION = "0.1.0";
  let logBuffer = `REPLOID Session Log - ${new Date().toISOString()}\n=========================================\n`;
  const MAX_LOG_LENGTH = 50000;

  const logger = {
    logEvent: (level, message, ...details) => {
      const timestamp = new Date().toISOString();
      const levelUpper = String(level || "info").toUpperCase();
      let logLine = `[${timestamp}] [${levelUpper}] ${message}`;
      if (details && details.length > 0) {
        logLine += ` | Details: ${details.map((d) => String(d)).join(" ")}`;
      }
      switch (level.toLowerCase()) {
        case "error":
          console.error(logLine);
          break;
        case "warn":
          console.warn(logLine);
          break;
        case "debug":
          console.debug(logLine);
          break;
        case "info":
        default:
          console.log(logLine);
          break;
      }
      logBuffer += logLine + "\n";
      if (logBuffer.length > MAX_LOG_LENGTH) {
        const logLines = logBuffer.split("\n");
        const startIndex = Math.max(
          0,
          logLines.length - Math.floor((MAX_LOG_LENGTH * 0.8) / 80)
        ); // Estimate lines
        logBuffer =
          logLines.slice(startIndex).join("\n") + "\n... (log truncated) ...\n";
      }
    },
    getLogBuffer: () => logBuffer,
    setLogBuffer: (newBuffer) => {
      logBuffer =
        typeof newBuffer === "string"
          ? newBuffer
          : "Log buffer reset/invalid.\n";
    },
  };

  const $id = (id) => document.getElementById(id);
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const kabobToCamel = (s) =>
    s ? s.replace(/-([a-z])/g, (g) => g[1].toUpperCase()) : "";
  const camelToKabob = (s) =>
    s ? s.replace(/([A-Z])/g, "-$1").toLowerCase() : "";
  const trunc = (str, len, ellipsis = "...") => {
    str = String(str ?? "");
    if (str.length <= len) return str;
    return str.substring(0, len - ellipsis.length) + ellipsis;
  };
  const lc = (s) => (s ? String(s).toLowerCase() : "");
  const uc = (s) => (s ? String(s).toUpperCase() : "");
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const getRandomInt = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
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
