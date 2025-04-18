const StorageModule = (config, logger) => {
  if (!config || !logger) {
    console.error("StorageModule requires config and logger.");
    return null;
  }

  const LS_PREFIX = config.storagePrefix;
  const STATE_KEY_BASE = config.stateKeyBase;
  const SESSION_KEY_BASE = config.sessionKeyBase;
  const MAX_ARTIFACT_SIZE_BYTES = config.maxArtifactSizeBytes;
  const VERSION_MAJOR = String(config.version).split(".")[0];
  const stateKey = STATE_KEY_BASE + VERSION_MAJOR;
  const sessionStateKey = SESSION_KEY_BASE + VERSION_MAJOR;
  const QUOTA_BYTES = config.storageQuotaBytes;
  const QUOTA_WARN_THRESHOLD = config.storageQuotaWarnThreshold;

  const getStorageUsage = () => {
    let totalBytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(LS_PREFIX) || key === stateKey)) {
          const value = localStorage.getItem(key);
          totalBytes += (value?.length ?? 0) * 2;
        }
      }
      const percent = QUOTA_BYTES > 0 ? (totalBytes / QUOTA_BYTES) * 100 : 0;
      return { used: totalBytes, quota: QUOTA_BYTES, percent: percent };
    } catch (e) {
      logger.logEvent("error", "Failed to calculate storage usage", e);
      return { used: -1, quota: QUOTA_BYTES, percent: -1 };
    }
  };

  const checkQuotaAndLog = (key, value) => {
    const usage = getStorageUsage();
    const estimatedNewSize = (value?.length ?? 0) * 2;
    const currentItemSize = (localStorage.getItem(key)?.length ?? 0) * 2;
    const estimatedUsageAfter = usage.used - currentItemSize + estimatedNewSize;

    if (
      usage.used >= 0 &&
      estimatedUsageAfter / QUOTA_BYTES > QUOTA_WARN_THRESHOLD
    ) {
      logger.logEvent(
        "warn",
        `LocalStorage usage high (${(
          (estimatedUsageAfter / QUOTA_BYTES) *
          100
        ).toFixed(1)}%) after setting key: ${key}`
      );
    }
    if (usage.used >= 0 && estimatedUsageAfter > QUOTA_BYTES) {
      const errorMsg = `Estimated usage ${(
        (estimatedUsageAfter / QUOTA_BYTES) *
        100
      ).toFixed(1)}% exceeds quota.`;
      logger.logEvent(
        "error",
        `LocalStorage Quota Exceeded estimation for key: ${key}`,
        errorMsg
      );

      return false;
    }
    return true;
  };

  const _get = (key) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      logger.logEvent("error", `LocalStorage GET Error: ${key}`, e);
      return null;
    }
  };

  const _set = (key, value) => {
    if (typeof value !== "string") {
      logger.logEvent(
        "error",
        `Attempted to store non-string value for key: ${key}`,
        { type: typeof value }
      );
      throw new Error(`Invalid value type for localStorage: ${typeof value}`);
    }
    if (value.length * 2 > MAX_ARTIFACT_SIZE_BYTES) {
      const msg = `Value exceeds size limit (${
        value.length * 2
      } > ${MAX_ARTIFACT_SIZE_BYTES} bytes) for key: ${key}`;
      logger.logEvent("error", msg);
      throw new Error(msg);
    }

    checkQuotaAndLog(key, value);

    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      let errorMessage = `LocalStorage SET Error: ${key}`;
      if (
        e.name === "QuotaExceededError" ||
        (e.code && (e.code === 22 || e.code === 1014))
      ) {
        const usage = getStorageUsage();
        errorMessage = `LocalStorage Quota Exceeded for key: ${key}. Usage: ${(
          usage.used /
          1024 /
          1024
        ).toFixed(2)}MB / ${(QUOTA_BYTES / 1024 / 1024).toFixed(2)}MB.`;
        logger.logEvent("error", errorMessage, e);
        throw new Error(errorMessage);
      } else {
        logger.logEvent("error", errorMessage, e);
        throw e;
      }
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

  const getArtifactKey = (artifactId, version = "latest") => {
    if (
      !artifactId ||
      typeof artifactId !== "string" ||
      typeof version !== "string"
    ) {
      throw new Error(
        `Invalid arguments for getArtifactKey: ID=${artifactId}, Version=${version}`
      );
    }
    return `${LS_PREFIX}artifact:${artifactId}:${version}`;
  };

  const getArtifactContent = (artifactId, version = "latest") => {
    return _get(getArtifactKey(artifactId, version));
  };

  const setArtifactContent = (artifactId, version = "latest", content) => {
    return _set(getArtifactKey(artifactId, version), content);
  };

  const deleteArtifact = (artifactId, version = "latest") => {
    return _remove(getArtifactKey(artifactId, version));
  };

  const listArtifacts = () => {
    const artifacts = [];
    const prefix = `${LS_PREFIX}artifact:`;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
          const parts = key.substring(prefix.length).split(":");
          if (parts.length === 2) {
            artifacts.push({ id: parts[0], version: parts[1], key: key });
          } else {
            logger.logEvent("warn", `Found malformed artifact key: ${key}`);
          }
        }
      }
    } catch (e) {
      logger.logEvent("error", "Failed to list artifacts from localStorage", e);
    }
    return artifacts;
  };

  const getState = () => {
    const json = _get(stateKey);
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch (e) {
      logger.logEvent(
        "error",
        `Failed to parse state from localStorage: ${e.message}. Removing invalid state.`
      );
      _remove(stateKey);
      return null;
    }
  };

  const saveState = (stateObj) => {
    if (!stateObj || typeof stateObj !== "object") {
      throw new Error("Invalid state object provided to saveState.");
    }
    try {
      const stateString = JSON.stringify(stateObj);
      return _set(stateKey, stateString);
    } catch (e) {
      logger.logEvent("error", "Failed to save state", e);

      throw new Error(`Failed to save state: ${e.message}`);
    }
  };

  const removeState = () => {
    return _remove(stateKey);
  };

  const getSessionState = () => {
    try {
      const json = sessionStorage.getItem(sessionStateKey);
      if (!json) return null;
      return JSON.parse(json);
    } catch (e) {
      logger.logEvent("error", `Failed to parse session state: ${e.message}`);
      try {
        sessionStorage.removeItem(sessionStateKey);
      } catch (removeError) {
        logger.logEvent(
          "warn",
          "Failed to remove invalid session state item.",
          removeError
        );
      }
      return null;
    }
  };

  const saveSessionState = (stateObj) => {
    if (!stateObj || typeof stateObj !== "object") {
      throw new Error("Invalid state object provided to saveSessionState.");
    }
    try {
      const stateString = JSON.stringify(stateObj);
      sessionStorage.setItem(sessionStateKey, stateString);
      return true;
    } catch (e) {
      logger.logEvent("error", `SessionStorage SET Error`, e);
      if (e.name === "QuotaExceededError") {
        throw new Error(`SessionStorage Quota Exceeded.`);
      }
      throw e;
    }
  };

  const removeSessionState = () => {
    try {
      sessionStorage.removeItem(sessionStateKey);
    } catch (e) {
      logger.logEvent("warn", `SessionStorage REMOVE Error`, e);
    }
  };

  const clearAllReploidData = () => {
    logger.logEvent("warn", "Initiating storage clear for Reploid v2 data.");
    let keysToRemove = [];
    let removedCount = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(LS_PREFIX) || key === stateKey)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => {
        if (_remove(key)) {
          removedCount++;
        }
      });
      logger.logEvent(
        "info",
        `Removed ${removedCount} keys from localStorage.`
      );

      try {
        sessionStorage.clear();
        logger.logEvent("info", "Cleared SessionStorage.");
      } catch (e) {
        logger.logEvent("warn", "Failed to clear SessionStorage.", e);
      }
    } catch (e) {
      logger.logEvent("error", `Error during clearAllReploidData`, e);
    }
    return removedCount;
  };

  return {
    LS_PREFIX,
    getArtifactKey,
    getArtifactContent,
    setArtifactContent,
    deleteArtifact,
    listArtifacts,
    getState,
    saveState,
    removeState,
    getSessionState,
    saveSessionState,
    removeSessionState,
    clearAllReploidData,
    getStorageUsage,
  };
};

export default StorageModule;
