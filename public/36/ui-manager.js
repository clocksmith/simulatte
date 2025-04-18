import Utils from "./utils.js";
import ToolCardComponent from "./tool-card.wc.js";

const UIManagerModule = (
  config,
  logger,
  Utils,
  storage,
  StateManager,
  CycleLogic
) => {
  if (
    !config ||
    !logger ||
    !Utils ||
    !storage ||
    !StateManager ||
    !CycleLogic
  ) {
    logger?.logEvent("error", "UIManager requires all core modules.");
    return null;
  }

  let uiRefs = {};
  let isInitialized = false;

  const getRefs = () => {
    const ids = [
      "app-version",
      "storage-usage",
      "api-key-input",
      "save-api-key-button",
      "export-state-button",
      "import-state-button",
      "import-file-input",
      "download-log-button",
      "clear-storage-button",
      "status-indicator",
      "tool-request-input",
      "create-tool-button",
      "tool-list-container",
      "notifications-container",
      "main-content",
      "app-root",
    ];
    const refs = {};
    ids.forEach((id) => {
      refs[id.replace(/-(\w)/g, (match, p1) => p1.toUpperCase())] =
        Utils.$id(id);
    });

    return refs;
  };

  const updateStatus = (message, isActive = false, isError = false) => {
    if (uiRefs.statusIndicator) {
      uiRefs.statusIndicator.textContent = `Status: ${message}`;
      uiRefs.statusIndicator.style.color = isError
        ? "var(--error-color)"
        : isActive
        ? "var(--warn-color)"
        : "#aaa";
      uiRefs.statusIndicator.style.fontWeight =
        isActive || isError ? "bold" : "normal";
    }
  };

  const showNotification = (message, type = "info", duration = 5000) => {
    if (!uiRefs.notificationsContainer) return;
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.textContent = message;

    const closeButton = document.createElement("button");
    closeButton.innerHTML = "&times;";
    closeButton.onclick = () => notification.remove();
    notification.appendChild(closeButton);

    uiRefs.notificationsContainer.appendChild(notification);

    if (duration > 0) {
      setTimeout(() => {
        if (notification.parentElement) {
          // Check if still attached
          notification.remove();
        }
      }, duration);
    }
  };

  const updateStorageUsageDisplay = () => {
    if (uiRefs.storageUsage) {
      const usage = storage.getStorageUsage();
      if (usage.used >= 0) {
        uiRefs.storageUsage.textContent = `${(usage.used / 1024).toFixed(
          1
        )}KB (${usage.percent.toFixed(1)}%)`;
        if (usage.percent > config.storageQuotaWarnThreshold * 100) {
          uiRefs.storageUsage.style.color = "var(--warn-color)";
          uiRefs.storageUsage.style.fontWeight = "bold";
        } else {
          uiRefs.storageUsage.style.color = "inherit";
          uiRefs.storageUsage.style.fontWeight = "normal";
        }
      } else {
        uiRefs.storageUsage.textContent = `Error`;
        uiRefs.storageUsage.style.color = "var(--error-color)";
      }
    }
  };

  const renderToolList = () => {
    if (!uiRefs.toolListContainer) return;
    const tools = StateManager.listTools();
    uiRefs.toolListContainer.innerHTML = "";

    if (tools.length === 0) {
      uiRefs.toolListContainer.innerHTML = "<p>No tools generated yet.</p>";
      return;
    }

    tools.sort((a, b) =>
      (a.metadata?.name ?? "").localeCompare(b.metadata?.name ?? "")
    );

    tools.forEach((toolData) => {
      const toolCard = document.createElement("tool-card");
      toolCard.setToolData(toolData);

      toolCard.addEventListener("delete-tool", (event) => {
        const toolIdToDelete = event.detail.toolId;
        if (
          confirm(
            `Are you sure you want to delete the tool "${event.detail.toolName}" (${toolIdToDelete})? This cannot be undone.`
          )
        ) {
          try {
            storage.deleteArtifact(toolIdToDelete, "mcp.json");
            storage.deleteArtifact(toolIdToDelete, "impl.js");

            if (StateManager.deleteTool(toolIdToDelete)) {
              showNotification(
                `Tool "${event.detail.toolName}" deleted.`,
                "success"
              );
              renderToolList();
              updateStorageUsageDisplay();
            } else {
              showNotification(
                `Failed to delete tool "${event.detail.toolName}" from state.`,
                "error"
              );
            }
          } catch (e) {
            logger.logEvent(
              "error",
              `Error deleting tool ${toolIdToDelete} artifacts or state.`,
              e
            );
            showNotification(`Error deleting tool: ${e.message}`, "error");
          }
        }
      });

      toolCard.addEventListener("execute-tool", async (event) => {
        const { toolId, toolName, args } = event.detail;
        const tool = StateManager.getTool(toolId);
        if (tool && ToolRunner) {
          updateStatus(`Executing ${toolName}...`, true);
          try {
            const result = await ToolRunner.runJsImplementation(
              tool.jsImplementation,
              args
            );
            showNotification(
              `Tool ${toolName} executed. Result: ${JSON.stringify(result)}`,
              "info",
              8000
            );
            updateStatus("Idle");
          } catch (e) {
            showNotification(
              `Tool ${toolName} execution failed: ${e.message}`,
              "error"
            );
            updateStatus(`Execution failed`, false, true);
          }
        } else {
          showNotification(
            `Could not find tool or runner for ${toolName}.`,
            "error"
          );
          logger.logEvent(
            "error",
            `Execute failed: Tool data or runner missing for ${toolId}`
          );
        }
      });

      uiRefs.toolListContainer.appendChild(toolCard);
    });
  };

  const setupEventListeners = () => {
    uiRefs.saveApiKeyButton?.addEventListener("click", () => {
      const key = uiRefs.apiKeyInput?.value.trim() ?? "";
      StateManager.setApiKey(key);
      StateManager.saveState();
      showNotification(key ? "API Key saved." : "API Key cleared.", "info");
    });

    uiRefs.createToolButton?.addEventListener("click", async () => {
      const request = uiRefs.toolRequestInput?.value.trim() ?? "";
      if (!request) {
        showNotification("Please enter a description for the tool.", "warn");
        return;
      }
      if (!StateManager.getState()?.apiKey) {
        showNotification("Please set your Gemini API Key first.", "warn");
        return;
      }

      uiRefs.createToolButton.disabled = true;
      uiRefs.createToolButton.textContent = "Generating...";
      updateStatus("Generating tool...", true);

      const progressCallback = (type, data) => {
        logger.logEvent("debug", `Generation Progress - Type: ${type}`, data);
        if (type === "status") {
          updateStatus(data.message, data.active, data.isError);
        } else if (type === "error") {
          showNotification(`Generation Error: ${data.message}`, "error");
        } else if (type === "success") {
          showNotification(
            `Tool "${data.tool?.metadata?.name}" generated successfully!`,
            "success"
          );
          renderToolList();
          if (uiRefs.toolRequestInput) uiRefs.toolRequestInput.value = "";
        } else if (type === "final") {
          uiRefs.createToolButton.disabled = false;
          uiRefs.createToolButton.textContent = "Generate Tool";
          updateStorageUsageDisplay();
        }
      };

      await CycleLogic.generateTool(request, progressCallback);
    });

    uiRefs.exportStateButton?.addEventListener("click", () => {
      try {
        const stateToExport = StateManager.getState();
        if (!stateToExport) {
          showNotification("Cannot export: State not available.", "warn");
          return;
        }
        const dataStr = JSON.stringify(stateToExport, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `reploid-v2-state_${
          new Date().toISOString().split("T")[0]
        }.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification("State exported.", "info");
      } catch (e) {
        logger.logEvent("error", "State export failed", e);
        showNotification(`State export failed: ${e.message}`, "error");
      }
    });

    uiRefs.importStateButton?.addEventListener("click", () => {
      uiRefs.importFileInput?.click();
    });

    uiRefs.importFileInput?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          if (!e.target?.result)
            throw new Error("File content is empty or unreadable.");
          const importedState = JSON.parse(e.target.result);

          if (
            importedState &&
            typeof importedState === "object" &&
            importedState.version
          ) {
            if (importedState.version !== config.version) {
              showNotification(
                `Import failed: Version mismatch (File: ${importedState.version}, App: ${config.version})`,
                "error"
              );
            } else {
              StateManager.updateState(importedState);
              StateManager.saveState();

              if (uiRefs.apiKeyInput)
                uiRefs.apiKeyInput.value = importedState.apiKey || "";
              renderToolList();
              updateStorageUsageDisplay();
              showNotification("State imported successfully.", "success");
            }
          } else {
            throw new Error("Invalid state file format.");
          }
        } catch (err) {
          logger.logEvent("error", "State import failed", err);
          showNotification(`Import failed: ${err.message}`, "error");
        } finally {
          if (uiRefs.importFileInput) uiRefs.importFileInput.value = "";
        }
      };
      reader.onerror = (e) => {
        logger.logEvent("error", "File reading error during import", e);
        showNotification("Failed to read the selected file.", "error");
        if (uiRefs.importFileInput) uiRefs.importFileInput.value = "";
      };
      reader.readAsText(file);
    });

    uiRefs.downloadLogButton?.addEventListener("click", () => {
      try {
        const logData = logger.getLogBuffer();
        const blob = new Blob([logData], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `reploid-v2-log_${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        logger.logEvent("error", "Log download failed", e);
        showNotification(`Log download failed: ${e.message}`, "error");
      }
    });

    uiRefs.clearStorageButton?.addEventListener("click", () => {
      if (
        confirm(
          "WARNING: This will delete ALL Reploid v2 data (state and generated tools) from your browser. Are you sure?"
        )
      ) {
        try {
          const count = storage.clearAllReploidData();
          showNotification(
            `Cleared ${count} items from storage. Reloading...`,
            "warn",
            3000
          );
          setTimeout(() => window.location.reload(), 1500);
        } catch (e) {
          logger.logEvent("error", "Failed to clear storage", e);
          showNotification(`Failed to clear storage: ${e.message}`, "error");
        }
      }
    });
  };

  const init = async () => {
    if (isInitialized) return;
    logger.logEvent("info", "Initializing UIManager...");

    if (!customElements.get("tool-card")) {
      customElements.define("tool-card", ToolCardComponent);
      logger.logEvent("debug", "Registered tool-card Web Component.");
    } else {
      logger.logEvent("debug", "tool-card Web Component already registered.");
    }

    uiRefs = getRefs();

    try {
      const response = await fetch("ui-body.html");
      if (!response.ok)
        throw new Error(`Failed to fetch ui-body.html: ${response.status}`);
      const uiHtml = await response.text();

      const appRoot = uiRefs.appRoot || Utils.$id("app-root");
      if (appRoot) {
        appRoot.innerHTML = uiHtml;
        uiRefs = getRefs();
      } else {
        throw new Error(
          "App root container (#app-root) not found in index.html"
        );
      }
    } catch (e) {
      logger.logEvent("error", "Failed to load main UI body", e);
      document.body.innerHTML = `<div style='color:red'><h1>UI Load Error</h1><p>${e.message}</p></div>`;
      return;
    }

    const initialState = StateManager.getState();
    if (initialState && uiRefs.apiKeyInput) {
      uiRefs.apiKeyInput.value = initialState.apiKey || "";
    }
    if (uiRefs.appVersion) {
      uiRefs.appVersion.textContent = config.version;
    }

    updateStorageUsageDisplay();
    renderToolList();
    setupEventListeners();
    updateStatus("Initialized");

    isInitialized = true;
    logger.logEvent("info", "UIManager initialized.");
  };

  return {
    init,
    showNotification,
    updateStatus,
    renderToolList,
    updateStorageUsageDisplay,
  };
};

export default UIManagerModule;
