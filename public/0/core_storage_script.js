const LS = (() => {
  const LS_PREFIX = "_x0_";
  const STATE_KEY_BASE = "x0_state_v";
  const SESSION_STATE_KEY_BASE = "x0_session_state_v";
  const MAX_ART_TKN_SZ = 4 * 1024 * 1024; // Use same limit as bootstrap

  let stateKey = STATE_KEY_BASE + "0.0"; // Default, needs update from Utils if possible
  let sessionStateKey = SESSION_STATE_KEY_BASE + "0.0";

  const _getLogger = () =>
    window.Utils?.logger || {
      logEvent: (lvl, msg) => console[lvl || "log"](msg),
    };

  const _updateKeys = () => {
    if (window.Utils?.STATE_VERSION) {
      const majorVersion = window.Utils.STATE_VERSION.split(".")[0];
      stateKey = STATE_KEY_BASE + majorVersion;
      sessionStateKey = SESSION_STATE_KEY_BASE + majorVersion;
    }
  };

  const _get = (key) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      _getLogger().logEvent("error", `LocalStorage GET Error: ${key}, ${e}`);
      return null;
    }
  };

  const _set = (key, value) => {
    if (value && typeof value === "string" && value.length > MAX_ART_TKN_SZ) {
      const msg = `Artifact content exceeds size limit (${value.length} > ${MAX_ART_TKN_SZ}) for key: ${key}`;
      _getLogger().logEvent("error", msg);
      throw new Error(msg);
    }
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      _getLogger().logEvent("error", `LocalStorage SET Error: ${key}, ${e}`);
      throw e;
    }
  };

  const _remove = (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      _getLogger().logEvent("error", `LocalStorage REMOVE Error: ${key}, ${e}`);
      return false;
    }
  };

  const _key = (id, cycle = 0) => `${LS_PREFIX}${id}_${cycle}`;

  return {
    LS_PREFIX,
    getArtifactKey: (id, cycle) => _key(id, cycle),
    getArtifactContent: (id, cycle) => _get(_key(id, cycle)),
    setArtifactContent: (id, cycle, content) => _set(_key(id, cycle), content),
    deleteArtifactVersion: (id, cycle) => _remove(_key(id, cycle)),
    getState: () => {
      _updateKeys();
      const json = _get(stateKey);
      try {
        return json ? JSON.parse(json) : null;
      } catch (e) {
        _getLogger().logEvent(
          "error",
          `Failed to parse state from localStorage: ${e.message}`
        );
        _remove(stateKey);
        return null;
      }
    },
    saveState: (stateObj) => {
      _updateKeys();
      return _set(stateKey, JSON.stringify(stateObj));
    },
    removeState: () => {
      _updateKeys();
      return _remove(stateKey);
    },
    getSessionState: () => {
      _updateKeys();
      try {
        const json = sessionStorage.getItem(sessionStateKey);
        return json ? JSON.parse(json) : null;
      } catch (e) {
        _getLogger().logEvent(
          "error",
          `Failed to parse session state: ${e.message}`
        );
        sessionStorage.removeItem(sessionStateKey);
        return null;
      }
    },
    saveSessionState: (stateObj) => {
      _updateKeys();
      try {
        sessionStorage.setItem(sessionStateKey, JSON.stringify(stateObj));
        return true;
      } catch (e) {
        _getLogger().logEvent(
          "error",
          `SessionStorage SET Error: ${e.message}`
        );
        throw e;
      }
    },
    removeSessionState: () => {
      _updateKeys();
      try {
        sessionStorage.removeItem(sessionStateKey);
      } catch (e) {
        _getLogger().logEvent(
          "error",
          `SessionStorage REMOVE Error: ${e.message}`
        );
      }
    },
    clearAllReploidData: () => {
      _updateKeys();
      _getLogger().logEvent(
        "warn",
        "Initiating LocalStorage clear for Reploid data."
      );
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
        _getLogger().logEvent(
          "info",
          `Removed ${keysToRemove.length} artifact/state keys.`
        );
        try {
          sessionStorage.clear();
          _getLogger().logEvent("info", "Cleared SessionStorage.");
        } catch (e) {
          _getLogger().logEvent(
            "warn",
            "Failed to clear SessionStorage.",
            e.message
          );
        }
      } catch (e) {
        _getLogger().logEvent(
          "error",
          `Error during key iteration/removal in clearAllReploidData: ${e.message}`
        );
      }
    },
  };
})();
window.LS = LS;
