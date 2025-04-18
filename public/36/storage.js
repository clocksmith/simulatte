const StorageModule = (config, logger) => {
  if (!config || !logger) {
    console.error("StorageModule requires config and logger.");
    return null;
  }

  const LS_PREFIX = config.storagePrefix;
  const STATE_KEY_BASE = config.stateKeyBase;
  const MAX_ARTIFACT_SIZE_BYTES = config.maxArtifactSizeBytes;
  const VERSION_MAJOR = String(config.version).split(".")[0];
  const stateKey = STATE_KEY_BASE + VERSION_MAJOR;
  const QUOTA_BYTES = config.storageQuotaBytes;
  const QUOTA_WARN_THRESHOLD = config.storageQuotaWarnThreshold;

  const getStorageUsage = () => {
    let totalBytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(LS_PREFIX) || key === stateKey)) {
          const value = localStorage.getItem(key);
          totalBytes += (value?.length ?? 0) * 2; // Estimate bytes (UTF-16)
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
      QUOTA_BYTES > 0 &&
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
    if (
      usage.used >= 0 &&
      MAX_ARTIFACT_SIZE_BYTES > 0 &&
      estimatedUsageAfter > QUOTA_BYTES
    ) {
      const errMng = `Estimated usage ${(
        (estimatedUsageAfter / QUOTA_BYTES) *
        100
      ).toFixed(1)}% exceeds quota.`;
      logger.logEvent(
        "error",
        `LocalStorage Quota Exceeded estimation for key: ${key}`,
        errMng
      );
      // We will let the setItem fail naturally, but we logged the warning/error
      // Returning false here is less useful as the actual setItem might still succeed briefly
      // return false;
    }
    return true; // Indicate check passed (doesn't guarantee setItem success)
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

    checkQuotaAndLog(key, value); // Log warnings/errors but don't prevent the attempt

    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      let errorMessage = `LocalStorage SET Error: ${key}`;
      if (
        e.name === "QuotaExceededError" ||
        (e.code && (e.code === 22 || e.code === 1014)) // DOMException codes for quota exceeded in older browsers
      ) {
        const usage = getStorageUsage();
        errorMessage = `LocalStorage Quota Exceeded for key: ${key}. Usage: ${(
          usage.used /
          1024 /
          1024
        ).toFixed(2)}MB / ${(QUOTA_BYTES / 1024 / 1024).toFixed(2)}MB.`;
        logger.logEvent("error", errorMessage, e);
        throw new Error(errorMessage); // Throw a specific error for quota
      } else {
        // Other potential errors (security, etc.)
        logger.logEvent("error", errorMessage, e);
        throw e; // Re-throw the original error
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
    // Using simple concatenation, ensuring parts are valid strings
    if (
      !artifactId ||
      typeof artifactId !== "string" ||
      typeof version !== "string"
    ) {
      throw new Error(
        `Invalid arguments for getArtifactKey: ID=${artifactId}, Version=${version}`
      );
    }
    // Basic sanitization: replace potentially problematic chars like ':' or '/'
    const cleanId = artifactId.replace(/[:/]/g, "_");
    const cleanVersion = version.replace(/[:/]/g, "_");
    return `${LS_PREFIX}artifact:${cleanId}:${cleanVersion}`;
  };

  const getArtifactContent = (artifactId, version = "latest") => {
    return _get(getArtifactKey(artifactId, version));
  };

  const setArtifactContent = (artifactId, version = "latest", content) => {
    // Important: Use the same key generation logic as getArtifactContent
    const key = getArtifactKey(
      artifactId,
      version.endsWith(".js") || version.endsWith(".json")
        ? version
        : `${version}.impl.js`
    ); // Adjust based on how version is used
    if (version === "mcp.json" || version === "impl.js") {
      key = getArtifactKey(artifactId, version);
    } else {
      // Fallback or default if only ID and content are passed
      key = getArtifactKey(artifactId, "latest");
    }

    return _set(key, content);
  };

  const deleteArtifact = (artifactId, version = "latest") => {
    // Allow deleting specific versions like "mcp.json" or "impl.js" directly
    const key = getArtifactKey(artifactId, version);
    return _remove(key);
  };

  const listArtifacts = () => {
    const artifacts = [];
    const prefix = `${LS_PREFIX}artifact:`;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
          const parts = key.substring(prefix.length).split(":");
          if (parts.length >= 2) {
            // Expecting ID:version at least
            const id = parts[0];
            const version = parts.slice(1).join(":"); // Rejoin if version had ':'
            artifacts.push({ id: id, version: version, key: key });
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
      // Re-throw specific QuotaExceededError if caught by _set
      if (e.message.includes("Quota Exceeded")) {
        throw e;
      }
      throw new Error(`Failed to save state: ${e.message}`);
    }
  };

  const removeState = () => {
    return _remove(stateKey);
  };

  // Session state functions removed as API key is handled directly by StateManager now.

  const clearAllReploidData = () => {
    logger.logEvent("warn", "Initiating storage clear for Dreamer data.");
    let keysToRemove = [];
    let removedCount = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith(LS_PREFIX) ||
            key === stateKey ||
            key === "sessionKey") /* old session key */
        ) {
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
        sessionStorage.clear(); // Clear session storage too
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
    // No session state methods exported
    clearAllReploidData,
    getStorageUsage,
  };
};

export default StorageModule;
