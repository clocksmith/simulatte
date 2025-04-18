import Utils from "./utils.js";
import ToolCardComponent from "./tool-card.wc.js"; // Ensure this is imported correctly

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
      "tool-list-search", // Added
      "tool-list-sort",   // Added
      "tool-library-controls" // Added container for search/sort
    ];
    const refs = {};
    ids.forEach((id) => {
      const camelCase = id.replace(/-(\w)/g, (match, p1) => p1.toUpperCase());
      refs[camelCase] = Utils.$id(id);
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
    closeButton.innerHTML = "×";
    closeButton.onclick = () => notification.remove();
    notification.appendChild(closeButton);

    uiRefs.notificationsContainer.appendChild(notification);

    if (duration > 0) {
      setTimeout(() => {
        if (notification.parentElement) {
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
    let tools = StateManager.listTools();
    uiRefs.toolListContainer.innerHTML = "";

    const searchTerm = (uiRefs.toolListSearch?.value || "").toLowerCase();
    const sortBy = uiRefs.toolListSort?.value || "name";

    if (searchTerm) {
      tools = tools.filter((t) => {
        return (t.metadata?.name?.toLowerCase().includes(searchTerm) ||
                t.metadata?.description?.toLowerCase().includes(searchTerm) ||
                t.id?.toLowerCase().includes(searchTerm));
      });
    }

    tools.sort((a, b) => {
      const aVal = sortBy === "date"
        ? a.metadata?.createdAt
        : a.metadata?.name || "";
      const bVal = sortBy === "date"
        ? b.metadata?.createdAt
        : b.metadata?.name || "";

        if (sortBy === 'date') {
            // Sort newest first
            return new Date(bVal || 0) - new Date(aVal || 0);
        } else {
            // Sort alphabetically by name
            return (aVal || "").localeCompare(bVal || "");
        }
    });

    if (tools.length === 0) {
      uiRefs.toolListContainer.innerHTML = `<p>No tools found${searchTerm ? ' matching filter' : ''}.</p>`;
      return;
    }

    tools.forEach((toolData) => {
      const toolCard = document.createElement("tool-card");
      toolCard.setToolData(toolData);
      uiRefs.toolListContainer.appendChild(toolCard);
    });
  };

  const setupEventListeners = () => {
    uiRefs.saveApiKeyButton?.addEventListener("click", () => {
      const key = uiRefs.apiKeyInput?.value.trim() ?? "";
      StateManager.setApiKeyInSession(key);
      showNotification(key ? "API Key saved for session." : "API Key cleared for session.", "info");
    });

    uiRefs.createToolButton?.addEventListener("click", async () => {
      const request = uiRefs.toolRequestInput?.value.trim() ?? "";
      if (!request) {
        showNotification("Please enter a description for the tool.", "warn");
        return;
      }
      const apiKey = StateManager.getApiKeyFromSession();
      if (!apiKey) {
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
        } else if (type === 'success') {
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
        a.download = `dreamer-state_${
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
               // Attempt to get API key from old state format if necessary (should be session now)
              const importedApiKey = importedState.apiKey || "";

              // Update the main state (excluding the api key which is now session-managed)
              const stateToUpdate = { ...importedState };
              delete stateToUpdate.apiKey; // Remove apiKey before updating state

              StateManager.updateState(stateToUpdate);
              StateManager.saveState();

              // Set the API key in session storage
              StateManager.setApiKeyInSession(importedApiKey);
              if (uiRefs.apiKeyInput) uiRefs.apiKeyInput.value = importedApiKey; // Update UI field

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
        a.download = `dreamer-log_${new Date()
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
          "WARNING: This will delete ALL Dreamer data (state and generated tools) from your browser. Are you sure?"
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

    // Listener for search input
     uiRefs.toolListSearch?.addEventListener("input", () => {
         renderToolList();
     });
     // Listener for sort dropdown
     uiRefs.toolListSort?.addEventListener("change", () => {
         renderToolList();
     });

     // Listener for edit tool request events bubbling up from tool cards
     uiRefs.appRoot?.addEventListener("edit-tool-request", (event) => {
        const { toolId, originalRequest } = event.detail;
        if (uiRefs.toolRequestInput) {
            logger.logEvent("info", `Editing request for tool ${toolId}`);
            uiRefs.toolRequestInput.value = originalRequest || "";
            uiRefs.toolRequestInput.focus();
            uiRefs.toolRequestInput.scrollIntoView({ behavior: "smooth", block: "center"});

            // Temporarily change button text
            if(uiRefs.createToolButton){
                uiRefs.createToolButton.textContent = "Regenerate Tool";
                setTimeout(() => {
                     if (uiRefs.createToolButton) { // Check if still exists
                        uiRefs.createToolButton.textContent = "Generate Tool";
                     }
                }, 5000); // Reset after 5 seconds
            }
        }
     });

     // Central listener for tool execution events
     uiRefs.appRoot?.addEventListener("execute-tool", async (event) => {
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

    // Central listener for tool deletion events
    uiRefs.appRoot?.addEventListener("delete-tool", (event) => {
        const { toolId, toolName } = event.detail;
        if (confirm(`Are you sure you want to delete the tool "${toolName}" (${toolId})? This cannot be undone.`)) {
            try {
                storage.deleteArtifact(toolId, "mcp.json");
                storage.deleteArtifact(toolId, "impl.js");

                if (StateManager.deleteTool(toolId)) {
                    showNotification(`Tool "${toolName}" deleted.`, "success");
                    renderToolList();
                    updateStorageUsageDisplay();
                } else {
                    showNotification(`Failed to delete tool "${toolName}" from state.`, "error");
                }
            } catch (e) {
                logger.logEvent("error", `Error deleting tool ${toolId} artifacts or state.`, e);
                showNotification(`Error deleting tool: ${e.message}`, "error");
            }
        }
    });
  };


  const init = async () => {
    if (isInitialized) return;
    logger.logEvent("info", "Initializing UIManager...");

    // Ensure tool-card WC is registered
    if (!customElements.get("tool-card")) {
      customElements.define("tool-card", ToolCardComponent);
    }

    try {
      const response = await fetch("ui-body.html");
      if (!response.ok)
        throw new Error(`Failed to fetch ui-body.html: ${response.status}`);
      const uiHtml = await response.text();

      const appRootContainer = Utils.$id("app-root");
      if (appRootContainer) {
        appRootContainer.innerHTML = uiHtml;
        uiRefs = getRefs(); // Re-fetch refs after loading body
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

    if (uiRefs.apiKeyInput) {
        uiRefs.apiKeyInput.value = StateManager.getApiKeyFromSession() || "";
    }
    if (uiRefs.appVersion) {
      uiRefs.appVersion.textContent = config.version;
    }

    updateStorageUsageDisplay();
    renderToolList(); // Initial render
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