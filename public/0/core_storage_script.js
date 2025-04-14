const StorageModule = (config, logger) => {
  if (!config || !logger) {
    console.error("StorageModule requires config and logger to be provided.");
    // Fallback to console if logger isn't available, but this shouldn't happen in normal flow
    const log = logger || {
      logEvent: (lvl, msg) =>
        console[lvl === "error" ? "error" : "log"](`[STORAGE FALLBACK] ${msg}`),
    };
    log.logEvent(
      "error",
      "StorageModule initialization failed: Missing config or logger."
    );
    // Return a dummy object to prevent immediate crashes elsewhere, but log the error
    return {
      LS_PREFIX: "_x0_",
      getArtifactKey: () => null,
      getArtifactContent: () => null,
      setArtifactContent: () => {
        throw new Error("Storage not initialized");
      },
      deleteArtifactVersion: () => false,
      getState: () => null,
      saveState: () => {
        throw new Error("Storage not initialized");
      },
      removeState: () => false,
      getSessionState: () => null,
      saveSessionState: () => {
        throw new Error("Storage not initialized");
      },
      removeSessionState: () => {},
      clearAllReploidData: () => {
        log.logEvent("error", "Cannot clear storage, module not initialized.");
      },
    };
  }

  const LS_PREFIX = config.LS_PREFIX;
  const STATE_KEY_BASE = config.STATE_KEY_BASE;
  const SESSION_STATE_KEY_BASE = config.SESSION_STATE_KEY_BASE;
  const MAX_ART_TKN_SZ = config.MAX_ARTIFACT_SIZE_BYTES;
  const STATE_VERSION_MAJOR = config.STATE_VERSION.split(".")[0];
  const stateKey = STATE_KEY_BASE + STATE_VERSION_MAJOR;
  const sessionStateKey = SESSION_STATE_KEY_BASE + STATE_VERSION_MAJOR;

  const _get = (key) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      logger.logEvent("error", `LocalStorage GET Error: ${key}`, e);
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
      logger.logEvent("error", `LocalStorage SET Error: ${key}`, e);
      throw e;
    }
  };

  const _remove = (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      logger.logEvent("error", `LocalStorage REMOVE Error: ${key}`, e);
      return false;
    }
  };

  const _key = (id, cycle = 0) => `${LS_PREFIX}${id}_${cycle}`;

  const getArtifactContent = (id, cycle) => _get(_key(id, cycle));

  const setArtifactContent = (id, cycle, content) =>
    _set(_key(id, cycle), content);

  const deleteArtifactVersion = (id, cycle) => _remove(_key(id, cycle));

  const getState = () => {
    const json = _get(stateKey);
    try {
      return json ? JSON.parse(json) : null;
    } catch (e) {
      logger.logEvent(
        "error",
        `Failed to parse state from localStorage: ${e.message}`
      );
      _remove(stateKey);
      return null;
    }
  };

  const saveState = (stateObj) => {
    return _set(stateKey, JSON.stringify(stateObj));
  };

  const removeState = () => {
    return _remove(stateKey);
  };

  const getSessionState = () => {
    try {
      const json = sessionStorage.getItem(sessionStateKey);
      return json ? JSON.parse(json) : null;
    } catch (e) {
      logger.logEvent("error", `Failed to parse session state: ${e.message}`);
      sessionStorage.removeItem(sessionStateKey);
      return null;
    }
  };

  const saveSessionState = (stateObj) => {
    try {
      sessionStorage.setItem(sessionStateKey, JSON.stringify(stateObj));
      return true;
    } catch (e) {
      logger.logEvent("error", `SessionStorage SET Error: ${e.message}`);
      throw e;
    }
  };

  const removeSessionState = () => {
    try {
      sessionStorage.removeItem(sessionStateKey);
    } catch (e) {
      logger.logEvent("error", `SessionStorage REMOVE Error: ${e.message}`);
    }
  };

  const clearAllReploidData = () => {
    logger.logEvent("warn", "Initiating LocalStorage clear for Reploid data.");
    let keysToRemove = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(LS_PREFIX) || key === stateKey)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => _remove(key));
      _remove(stateKey);
      logger.logEvent(
        "info",
        `Removed ${keysToRemove.length} artifact/state keys from localStorage.`
      );
      try {
        sessionStorage.clear();
        logger.logEvent("info", "Cleared SessionStorage.");
      } catch (e) {
        logger.logEvent("warn", "Failed to clear SessionStorage.", e.message);
      }
    } catch (e) {
      logger.logEvent(
        "error",
        `Error during key iteration/removal in clearAllReploidData: ${e.message}`
      );
    }
  };

  return {
    LS_PREFIX,
    getArtifactKey: _key,
    getArtifactContent,
    setArtifactContent,
    deleteArtifactVersion,
    getState,
    saveState,
    removeState,
    getSessionState,
    saveSessionState,
    removeSessionState,
    clearAllReploidData,
  };
};
