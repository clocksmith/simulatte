window.LS = (() => {
  let logger = window.Utils?.logger;
  if (!logger) {
    console.error("FATAL: Utils.logger not found for Storage module!");
    // Default to console logger.
    logger = {
      logEvent: (level, message) => console[level](message),
    };
  }

  const LS_PREFIX = "_x0_";
  const STATE_KEY = "x0_state_v0.0";
  const SESSION_STATE_KEY = "x0_session_state_v0.0";
  const MAX_ART_TKN_SZ = 65000;

  const _get = (key) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      logger.logEvent("error", `LocalStorage GET Error: ${key}, ${e}`);
      return null;
    }
  };

  const _set = (key, value) => {
    if (value && typeof value === "string" && value.length > MAX_ART_TKN_SZ) {
      const msg = `Artifact content exceeds size limit (${value.length} > ${MAX_ART_TKN_SZ}) for key: ${key}`;
      logger.logEvent("error", msg);
      throw new Error(msg);
    }
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      logger.logEvent("error", `LocalStorage SET Error: ${key}, ${e}`);
      throw e;
    }
  };

  const _remove = (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      logger.logEvent("error", `LocalStorage REMOVE Error: ${key}, ${e}`);
      return false;
    }
  };

  const _key = (id, cycle = 0) => `${LS_PREFIX}${id}_${cycle}`;

  return {
    LS_PREFIX,
    getArtifactKey: (id, cycle) => _key(id, cycle),
    getArtifactContent: (id, cycle) => _get(_key(id, cycle)),
    setArtifactContent: (id, cycle, content) => {
      return _set(_key(id, cycle), content);
    },
    deleteArtifactVersion: (id, cycle) => _remove(_key(id, cycle)),
    getState: () => {
      const json = _get(STATE_KEY);
      try {
        return json ? JSON.parse(json) : null;
      } catch (e) {
        logger.logEvent(
          "error",
          `Failed to parse state from localStorage: ${e.message}`
        );
        _remove(STATE_KEY);
        return null;
      }
    },
    saveState: (stateObj) => _set(STATE_KEY, JSON.stringify(stateObj)),
    removeState: () => _remove(STATE_KEY),
    getSessionState: () => {
      try {
        const json = sessionStorage.getItem(SESSION_STATE_KEY);
        return json ? JSON.parse(json) : null;
      } catch (e) {
        logger.logEvent("error", `Failed to parse session state: ${e.message}`);
        sessionStorage.removeItem(SESSION_STATE_KEY);
        return null;
      }
    },
    saveSessionState: (stateObj) => {
      try {
        sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(stateObj));
        return true;
      } catch (e) {
        logger.logEvent("error", `SessionStorage SET Error: ${e.message}`);
        throw e;
      }
    },
    removeSessionState: () => {
      try {
        sessionStorage.removeItem(SESSION_STATE_KEY);
      } catch (e) {
        logger.logEvent("error", `SessionStorage REMOVE Error: ${e.message}`);
      }
    },
    clearAllReploidData: () => {
      logger.logEvent("warn", "User initiated LocalStorage clear.");
      let keysToRemove = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith(LS_PREFIX) || key === STATE_KEY)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => {
          _remove(key);
          logger.logEvent("info", `Removed key: ${key}`);
        });
        _remove(STATE_KEY);
        logger.logEvent("info", `Removed state key: ${STATE_KEY}`);
      } catch (e) {
        logger.logEvent(
          "error",
          `Error during key iteration/removal in clearAllReploidData: ${e.message}`
        );
      } finally {
        Storage.removeSessionState();
      }
    },
  };
})();
