const REPLOID_CORE = (() => {
  let Utils;
  let Storage;
  let logger;
  let ToolRunner;
  let loadedStaticTools = [];
  let isCoreInitialized = false;

  const coreBootstrap = {
    LS_PREFIX: "_x0_",
    getArtifactKey: (id, cycle = 0) =>
      `${coreBootstrap.LS_PREFIX}${id}_${cycle}`,
    _lsGet: (key) => {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        console.error(`CORE_BOOTSTRAP LS GET Error: ${key}`, e);
        return null;
      }
    },
    loadAndExecuteReturn: (artifactId, cycle = 0) => {
      const key = coreBootstrap.getArtifactKey(artifactId, cycle);
      const scriptContent = coreBootstrap._lsGet(key);
      if (!scriptContent) {
        throw new Error(
          `Core dependency artifact not found: ${artifactId} (Key: ${key})`
        );
      }
      try {
        const func = new Function(scriptContent + "\nreturn moduleExport;");
        return func();
      } catch (e) {
        try {
          const globalName = artifactId.split(".").pop();
          console.warn(
            `Executing ${artifactId} directly (may use window.${globalName}).`
          );
          const func = new Function(scriptContent);
          func();
          return window[globalName];
        } catch (execError) {
          console.error(
            `Error executing core dependency artifact: ${artifactId}`,
            execError
          );
          throw new Error(
            `Failed to execute core dependency: ${artifactId}. ${execError.message}`
          );
        }
      }
    },
    loadJsonArtifact: (artifactId, cycle = 0) => {
      const key = coreBootstrap.getArtifactKey(artifactId, cycle);
      const jsonContent = coreBootstrap._lsGet(key);
      if (!jsonContent) {
        throw new Error(
          `Core JSON artifact not found: ${artifactId} (Key: ${key})`
        );
      }
      try {
        return JSON.parse(jsonContent);
      } catch (e) {
        console.error(`Error parsing core JSON artifact: ${artifactId}`, e);
        throw new Error(
          `Failed to parse core JSON artifact: ${artifactId}. ${e.message}`
        );
      }
    },
  };

  const initializeCoreDependencies = () => {
    if (isCoreInitialized) return;
    const utilsModule = coreBootstrap.loadAndExecuteReturn(
      "reploid.core.utils",
      0
    );
    const storageModule = coreBootstrap.loadAndExecuteReturn(
      "reploid.core.storage",
      0
    );
    const toolRunnerModule = coreBootstrap.loadAndExecuteReturn(
      "reploid.core.toolrunner",
      0
    );

    Utils = utilsModule || window.Utils;
    Storage = storageModule || window.LS || window.Storage;
    ToolRunner = toolRunnerModule || window.ToolRunner;

    if (!Utils || !Storage || !ToolRunner) {
      throw new Error(
        "Failed to load/execute core Utils/Storage/ToolRunner dependencies."
      );
    }
    logger = Utils.logger;
    if (!logger) {
      throw new Error("Logger not found within loaded Utils module.");
    }

    try {
      loadedStaticTools = coreBootstrap.loadJsonArtifact(
        "reploid.core.static-tools",
        0
      );
    } catch (e) {
      logger.logEvent(
        "error",
        `Failed to load static tools artifact: ${e.message}`
      );
      loadedStaticTools = [];
    }

    isCoreInitialized = true;
    console.log(
      "Core dependencies (Utils, Storage, Logger, ToolRunner, StaticTools) initialized."
    );
  };

  const CTX_WARN_THRESH = 925000;
  const SVG_NS = "http://www.w3.org/2000/svg";

  let globalState = null;
  let uiRefs = {};
  let currentLlmResponse = null;
  let metaSandboxPending = false;
  let activeCoreStepIdx = -1;
  let dynamicToolDefinitions = [];
  let artifactMetadata = {};
  let lastCycleLogItem = null;
  let currentAbortController = null;

  const APP_CONFIG = {
    BASE_GEMINI_MODEL: "gemini-2.0-flash-thinking-exp-01-21",
    ADVANCED_GEMINI_MODEL: "gemini-2.5-pro-exp-03-25",
    GEMINI_MODEL_OPTIMIZER: "model-optimizer-exp-04-09",
  };

  const StateManager = {
    getDefaultState: () => ({
      version: "0.0.0",
      totalCycles: 0,
      agentIterations: 0,
      humanInterventions: 0,
      failCount: 0,
      currentGoal: {
        seed: null,
        cumulative: null,
        latestType: "Idle",
        summaryContext: null,
      },
      lastCritiqueType: "N/A",
      personaMode: "XYZ",
      lastFeedback: null,
      forceHumanReview: false,
      apiKey: "",
      confidenceHistory: [],
      critiqueFailHistory: [],
      tokenHistory: [],
      failHistory: [],
      avgConfidence: null,
      critiqueFailRate: null,
      avgTokens: null,
      contextTokenEstimate: 0,
      lastGeneratedFullSource: null,
      htmlHistory: [],
      lastApiResponse: null,
      retryCount: 0,
      cfg: {
        personaBalance: 50,
        llmCritiqueProb: 50,
        humanReviewProb: 50,
        maxCycleTime: 600,
        autoCritiqueThresh: 0.75,
        maxCycles: 0,
        htmlHistoryLimit: 5,
        pauseAfterCycles: 10,
        maxRetries: 1,
        coreModel: APP_CONFIG.BASE_GEMINI_MODEL,
        critiqueModel: APP_CONFIG.BASE_GEMINI_MODEL,
      },
      artifactMetadata: {},
      dynamicTools: [],
    }),
    init: () => {
      const savedState = Storage.getState();
      if (
        savedState &&
        savedState.version?.split(".")[0] === Utils.STATE_VERSION.split(".")[0]
      ) {
        const defaultState = StateManager.getDefaultState();
        globalState = {
          ...defaultState,
          ...savedState,
          cfg: { ...defaultState.cfg, ...(savedState.cfg || {}) },
        };
        globalState.version = Utils.STATE_VERSION;
        dynamicToolDefinitions = globalState.dynamicTools || [];
        artifactMetadata = globalState.artifactMetadata || {};
        globalState.dynamicTools = dynamicToolDefinitions;
        globalState.artifactMetadata = artifactMetadata;
        logger.logEvent(
          "info",
          `Loaded state v${globalState.version} (Cycle ${globalState.totalCycles})`
        );
        return true;
      } else {
        if (savedState) {
          logger.logEvent(
            "warn",
            `Ignoring incompatible state (v${savedState.version})`
          );
          Storage.removeState();
        }
        globalState = StateManager.getDefaultState();
        globalState.version = Utils.STATE_VERSION;
        artifactMetadata = {
          "reploid.core.logic": {
            id: "reploid.core.logic",
            type: "JS",
            description: "Main application logic",
            latestCycle: 0,
          },
          "reploid.core.style": {
            id: "reploid.core.style",
            type: "CSS",
            description: "Main application styles",
            latestCycle: 0,
          },
          "reploid.core.body": {
            id: "reploid.core.body",
            type: "HTML",
            description: "App root HTML structure",
            latestCycle: 0,
          },
          "reploid.core.utils": {
            id: "reploid.core.utils",
            type: "JS",
            description: "Core utility functions",
            latestCycle: 0,
          },
          "reploid.core.storage": {
            id: "reploid.core.storage",
            type: "JS",
            description: "Core storage functions",
            latestCycle: 0,
          },
          "reploid.core.sys-prompt": {
            id: "reploid.core.sys-prompt",
            type: "PROMPT",
            description: "Core LLM prompt",
            latestCycle: 0,
          },
          "reploid.core.critiquer-prompt": {
            id: "reploid.core.critiquer-prompt",
            type: "PROMPT",
            description: "Critique prompt",
            latestCycle: 0,
          },
          "reploid.core.summarizer-prompt": {
            id: "reploid.core.summarizer-prompt",
            type: "PROMPT",
            description: "Summarization prompt",
            latestCycle: 0,
          },
          "reploid.core.static-tools": {
            id: "reploid.core.static-tools",
            type: "JSON",
            description: "Static tool definitions",
            latestCycle: 0,
          },
          "reploid.core.toolrunner": {
            id: "reploid.core.toolrunner",
            type: "JS",
            description: "Tool execution worker",
            latestCycle: 0,
          },
          "reploid.core.diagram": {
            id: "reploid.core.diagram",
            type: "JSON",
            description: "Default diagram",
            latestCycle: 0,
          },
          "reploid.core.diagram-factory": {
            id: "reploid.core.diagram-factory",
            type: "JS",
            description: "Diagram renderer",
            latestCycle: 0,
          },
          "reploid.core.cycle-steps": {
            id: "reploid.core.cycle-steps",
            type: "TEXT",
            description: "Cycle step definitions",
            latestCycle: 0,
          },
          "target.head": {
            id: "target.head",
            type: "HTML_HEAD",
            description: "Target UI Head",
            latestCycle: -1,
          },
          "target.body": {
            id: "target.body",
            type: "HTML_BODY",
            description: "Target UI Body",
            latestCycle: -1,
          },
          "target.style.main": {
            id: "target.style.main",
            type: "CSS_STYLESHEET",
            description: "Target UI Styles",
            latestCycle: -1,
          },
          "target.script.main": {
            id: "target.script.main",
            type: "JAVASCRIPT_SNIPPET",
            description: "Target UI Script",
            latestCycle: -1,
          },
          "target.diagram": {
            id: "target.diagram",
            type: "DIAGRAM_JSON",
            description: "Target UI Structure Diagram",
            latestCycle: -1,
          },
          "meta.summary_context": {
            id: "meta.summary_context",
            type: "TEXT",
            description: "Last Context Summary",
            latestCycle: -1,
          },
          "reploid.boot.style": {
            id: "reploid.boot.style",
            type: "CSS",
            description: "Bootstrap initial CSS",
            latestCycle: 0,
          },
          "reploid.boot.script": {
            id: "reploid.boot.script",
            type: "JS",
            description: "Bootstrap script source",
            latestCycle: 0,
          },
          "reploid.boot.log": {
            id: "reploid.boot.log",
            type: "LOG",
            description: "Log of the bootstrap process",
            latestCycle: 0,
          },
        };
        globalState.artifactMetadata = artifactMetadata;
        dynamicToolDefinitions = globalState.dynamicTools || [];
        StateManager.save();
        logger.logEvent(
          "info",
          `Initialized new default state v${globalState.version}`
        );
        return false;
      }
    },
    getState: () => globalState,
    setState: (newState) => {
      globalState = newState;
    },
    save: () => {
      if (!globalState || !Storage) return;
      try {
        const stateToSave = JSON.parse(
          JSON.stringify({ ...globalState, lastApiResponse: null })
        );
        Storage.saveState(stateToSave);
        logger.logEvent(
          "debug",
          `Saved state (Cycle ${globalState.totalCycles})`
        );
      } catch (e) {
        logger.logEvent("error", `Save state failed: ${e.message}`);
        UI.showNotification(`Save state failed: ${e.message}`, "error");
      }
    },
    getArtifactMetadata: (id) =>
      artifactMetadata[id] || {
        id: id,
        type: "UNKNOWN",
        description: "Unknown Artifact",
        latestCycle: -1,
      },
    updateArtifactMetadata: (id, type, description, cycle) => {
      const currentMeta = artifactMetadata[id] || {};
      artifactMetadata[id] = {
        id: id,
        type: type || currentMeta.type || "UNKNOWN",
        description: description || currentMeta.description || `Artifact ${id}`,
        latestCycle: Math.max(cycle, currentMeta.latestCycle ?? -1),
      };
      if (globalState) globalState.artifactMetadata = artifactMetadata;
    },
    deleteArtifactMetadata: (id) => {
      delete artifactMetadata[id];
      if (globalState) globalState.artifactMetadata = artifactMetadata;
    },
    getAllArtifactMetadata: () => ({ ...artifactMetadata }),
    capturePreservationState: () => {
      const stateToSave = JSON.parse(
        JSON.stringify({ ...globalState, lastApiResponse: null })
      );
      stateToSave.logBuffer = logger.getLogBuffer();
      stateToSave.timelineHTML = uiRefs.timelineLog
        ? uiRefs.timelineLog.innerHTML
        : "";
      stateToSave.dynamicToolDefinitions = dynamicToolDefinitions;
      stateToSave.artifactMetadata = artifactMetadata;
      stateToSave.metaSandboxPending = metaSandboxPending;
      return stateToSave;
    },
    restoreStateFromSession: () => {
      const preservedData = Storage.getSessionState();
      if (!preservedData) return false;
      logger.logEvent("info", "Preserved session state found.");
      try {
        if (
          preservedData.version?.split(".")[0] !==
          Utils.STATE_VERSION.split(".")[0]
        ) {
          logger.logEvent(
            "warn",
            `Restoring older session state v${preservedData.version}.`
          );
        }
        const defaultState = StateManager.getDefaultState();
        globalState = {
          ...defaultState,
          ...preservedData,
          cfg: { ...defaultState.cfg, ...(preservedData.cfg || {}) },
        };
        globalState.version = Utils.STATE_VERSION;
        logger.setLogBuffer(
          preservedData.logBuffer ||
            `Restored Log ${new Date().toISOString()}\n===\n`
        );
        dynamicToolDefinitions = preservedData.dynamicTools || [];
        artifactMetadata = preservedData.artifactMetadata || {};
        metaSandboxPending = preservedData.metaSandboxPending || false;
        globalState.dynamicTools = dynamicToolDefinitions;
        globalState.artifactMetadata = artifactMetadata;
        UI.initializeUIElementReferences();
        if (uiRefs.timelineLog)
          uiRefs.timelineLog.innerHTML = preservedData.timelineHTML || "";
        UI.updateStateDisplay();
        UI.renderDiagramDisplay(globalState.totalCycles);
        UI.renderGeneratedUI(globalState.totalCycles);
        UI.displayGenesisState();
        UI.loadPromptsFromLS();
        UI.loadCoreLoopSteps();
        logger.logEvent("info", "Session state restored.");
        UI.logToTimeline(
          globalState.totalCycles,
          "[STATE] Restored after self-mod.",
          "info"
        );
        if (uiRefs.runCycleButton)
          uiRefs.runCycleButton.disabled = metaSandboxPending;
        if (uiRefs.runCycleButton)
          uiRefs.runCycleButton.textContent = "Run Cycle";
        UI.updateStatus(
          metaSandboxPending ? "Meta Sandbox Pending..." : "Idle"
        );
        StateManager.save();
        return true;
      } catch (e) {
        logger.logEvent("error", `Restore from session failed: ${e.message}`);
        UI.showNotification(
          `Restore failed: ${e.message}. Reinitializing.`,
          "error"
        );
        if (isCoreInitialized) {
          StateManager.init();
          UI.initializeUIElementReferences();
          UI.logToTimeline(
            0,
            "[STATE] Restore failed. Reinitialized.",
            "error"
          );
          UI.updateStatus("Restore Failed", false, true);
        } else {
          console.error("Cannot re-initialize, core dependencies failed.");
        }
        return false;
      } finally {
        Storage.removeSessionState();
        logger.logEvent("info", "Cleared session state.");
      }
    },
    exportState: () => {
      try {
        const stateData = StateManager.capturePreservationState();
        const fileName = `x0_state_${Utils.STATE_VERSION}_${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}.json`;
        const dataStr = JSON.stringify(stateData, null, 2);
        logger.logEvent("info", "State export initiated.");
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        UI.logToTimeline(
          globalState.totalCycles,
          "[STATE] State exported.",
          "info"
        );
      } catch (e) {
        logger.logEvent("error", `State export failed: ${e.message}`);
        UI.showNotification(`State export failed: ${e.message}`, "error");
        UI.logToTimeline(
          globalState?.totalCycles ?? 0,
          "[STATE] State export failed.",
          "error"
        );
      }
    },
    importState: (file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importedData = JSON.parse(e.target.result);
          if (!importedData.version || importedData.totalCycles === undefined) {
            throw new Error(
              "Imported file missing version or core state data."
            );
          }
          logger.logEvent("info", `Importing state v${importedData.version}`);
          if (
            importedData.version.split(".")[0] !==
            Utils.STATE_VERSION.split(".")[0]
          ) {
            logger.logEvent(
              "warn",
              `State version mismatch (Imported: ${importedData.version}, Current: ${Utils.STATE_VERSION}).`
            );
          }
          const defaultState = StateManager.getDefaultState();
          globalState = {
            ...defaultState,
            ...importedData,
            cfg: { ...defaultState.cfg, ...(importedData.cfg || {}) },
          };
          globalState.version = Utils.STATE_VERSION;
          logger.setLogBuffer(importedData.logBuffer || logger.getLogBuffer());
          currentLlmResponse = null;
          metaSandboxPending = false;
          dynamicToolDefinitions = importedData.dynamicTools || [];
          artifactMetadata = importedData.artifactMetadata || {};
          globalState.artifactMetadata = artifactMetadata;
          globalState.dynamicTools = dynamicToolDefinitions;
          UI.initializeUIElementReferences();
          if (uiRefs.timelineLog)
            uiRefs.timelineLog.innerHTML = importedData.timelineHTML || "";
          UI.clearCurrentCycleDetails();
          UI.updateStateDisplay();
          UI.renderDiagramDisplay(globalState.totalCycles);
          UI.renderGeneratedUI(globalState.totalCycles);
          UI.displayGenesisState();
          UI.loadPromptsFromLS();
          UI.loadCoreLoopSteps();
          logger.logEvent("info", "State imported successfully.");
          UI.logToTimeline(
            globalState.totalCycles,
            "[STATE] State imported.",
            "info"
          );
          UI.showNotification(
            "State imported. Artifacts must be in LocalStorage.",
            "info"
          );
          StateManager.save();
        } catch (err) {
          logger.logEvent("error", `Import failed: ${err.message}`);
          UI.showNotification(`Import failed: ${err.message}`, "error");
          UI.logToTimeline(
            globalState?.totalCycles ?? 0,
            `[STATE] State import failed: ${err.message}`,
            "error"
          );
        } finally {
          if (uiRefs.importFileInput) uiRefs.importFileInput.value = "";
        }
      };
      reader.onerror = (e) => {
        logger.logEvent("error", `File read error: ${reader.error}`);
        UI.showNotification(`Error reading file: ${reader.error}`, "error");
        if (uiRefs.importFileInput) uiRefs.importFileInput.value = "";
      };
      reader.readAsText(file);
    },
  };

  const ApiClient = {
    sanitizeLlmJsonResp: (rawText) => {
      if (!rawText || typeof rawText !== "string") return "{}";
      let s = rawText.trim();
      const codeBlockMatch = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        s = codeBlockMatch[1].trim();
      } else {
        const firstBrace = s.indexOf("{");
        const firstBracket = s.indexOf("[");
        let start = -1;
        if (firstBrace === -1 && firstBracket === -1) return "{}";
        if (firstBrace === -1) start = firstBracket;
        else if (firstBracket === -1) start = firstBrace;
        else start = Math.min(firstBrace, firstBracket);
        if (start === -1) return "{}";
        s = s.substring(start);
      }
      let balance = 0;
      let lastValidIndex = -1;
      const startChar = s[0];
      const endChar = startChar === "{" ? "}" : startChar === "[" ? "]" : null;
      if (!endChar) return "{}";
      for (let i = 0; i < s.length; i++) {
        if (s[i] === startChar) balance++;
        else if (s[i] === endChar) balance--;
        if (balance === 0) {
          lastValidIndex = i;
          break;
        }
      }
      if (lastValidIndex !== -1) {
        s = s.substring(0, lastValidIndex + 1);
      } else {
        return "{}";
      }
      try {
        JSON.parse(s);
        return s;
      } catch (e) {
        logger.logEvent(
          "warn",
          `Sanitized JSON invalid: ${e.message}, Content: ${s.substring(
            0,
            50
          )}...`
        );
        return "{}";
      }
    },

    callGeminiAPIStream: async (
      prompt,
      sysInstr,
      modelName,
      apiKey,
      funcDecls = [],
      prevContent = null,
      abortSignal,
      progressCallback
    ) => {
      const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent`;
      logger.logEvent("info", `Streaming API: ${modelName}`);
      UI.updateApiProgress("Starting...");

      const baseGenCfg = { temperature: 0.777, maxOutputTokens: 8192 };
      const safetySettings = [
        "HARASSMENT",
        "HATE_SPEECH",
        "SEXUALLY_EXPLICIT",
        "DANGEROUS_CONTENT",
      ].map((cat) => ({
        category: `HARM_CATEGORY_${cat}`,
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      }));
      const reqBody = {
        contents: prevContent
          ? [...prevContent, { role: "user", parts: [{ text: prompt }] }]
          : [{ role: "user", parts: [{ text: prompt }] }],
        safetySettings: safetySettings,
        generationConfig: { ...baseGenCfg },
      };
      if (sysInstr) {
        reqBody.systemInstruction = {
          role: "system",
          parts: [{ text: sysInstr }],
        };
      }
      if (funcDecls?.length > 0) {
        reqBody.tools = [{ functionDeclarations: funcDecls }];
        reqBody.tool_config = { function_calling_config: { mode: "AUTO" } };
      } else {
        reqBody.generationConfig.responseMimeType = "application/json";
      }

      let accumulatedText = "";
      let accumulatedFunctionCall = null;
      let totalTokens = 0;
      let finalFinishReason = "UNKNOWN";
      let finalRawResponse = null; // Store the last chunk for metadata

      try {
        const response = await fetch(`${apiEndpoint}?key=${apiKey}&alt=sse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
          signal: abortSignal,
        });
        if (!response.ok) {
          let errBody = await response.text();
          let errJson = {};
          try {
            errJson = JSON.parse(errBody);
          } catch (e) {
            /* ignore */
          }
          throw new Error(
            `API Error (${response.status}): ${
              errJson?.error?.message || response.statusText || "Unknown"
            }`
          );
        }
        UI.updateApiProgress("Receiving...");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop(); // Keep potential partial line

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const chunk = JSON.parse(line.substring(6));
                finalRawResponse = chunk; // Keep overwriting, last one has final metadata
                if (chunk.promptFeedback?.blockReason) {
                  throw new Error(
                    `API Blocked: ${chunk.promptFeedback.blockReason}`
                  );
                }
                if (chunk.error) {
                  throw new Error(
                    `API Error: ${chunk.error.message || "Unknown"}`
                  );
                }

                const candidate = chunk.candidates?.[0];
                if (candidate) {
                  totalTokens =
                    candidate.tokenCount ||
                    chunk.usageMetadata?.totalTokenCount ||
                    totalTokens;
                  finalFinishReason =
                    candidate.finishReason || finalFinishReason;
                  if (finalFinishReason === "SAFETY") {
                    throw new Error(`API Response Blocked: SAFETY`);
                  }

                  const part = candidate.content?.parts?.[0];
                  if (part?.text) {
                    accumulatedText += part.text;
                    if (progressCallback)
                      progressCallback({
                        type: "text",
                        content: part.text,
                        accumulated: accumulatedText,
                      });
                  } else if (part?.functionCall) {
                    if (!accumulatedFunctionCall) {
                      accumulatedFunctionCall = {
                        name: part.functionCall.name,
                        args: {},
                      };
                    }
                    // Deep merge args - Gemini might stream args object incrementally
                    Object.assign(
                      accumulatedFunctionCall.args,
                      part.functionCall.args
                    );
                    if (progressCallback)
                      progressCallback({
                        type: "functionCall",
                        content: part.functionCall,
                        accumulated: accumulatedFunctionCall,
                      });
                  }
                }
                UI.updateApiProgress(`Tokens: ${totalTokens}`);
              } catch (e) {
                logger.logEvent(
                  "warn",
                  `Failed to parse SSE chunk: ${e.message}`,
                  line
                );
              }
            }
          }
        }
        logger.logEvent(
          "info",
          `API Stream OK. Finish:${finalFinishReason}. Tokens:${totalTokens}`
        );
        UI.updateApiProgress("Done");

        if (accumulatedFunctionCall) {
          return {
            type: "functionCall",
            content: accumulatedFunctionCall,
            tokenCount: totalTokens,
            finishReason: finalFinishReason,
            rawResp: finalRawResponse,
          };
        } else if (accumulatedText) {
          return {
            type: "text",
            content: accumulatedText,
            tokenCount: totalTokens,
            finishReason: finalFinishReason,
            rawResp: finalRawResponse,
          };
        } else {
          logger.logEvent(
            "info",
            `API Stream ended with no text or function call. Finish: ${finalFinishReason}`
          );
          return {
            type: "empty",
            content: null,
            tokenCount: totalTokens,
            finishReason: finalFinishReason,
            rawResp: finalRawResponse,
          };
        }
      } catch (error) {
        if (error.name === "AbortError") {
          logger.logEvent("info", "API call aborted by user.");
        } else {
          logger.logEvent("error", `API Stream Error: ${error.message}`);
        }
        UI.updateApiProgress("Error");
        throw error;
      }
    },

    callApiWithRetry: async (
      prompt,
      sysInstr,
      modelName,
      apiKey,
      funcDecls = [],
      isCont = false,
      prevContent = null,
      retries = globalState?.cfg?.maxRetries ?? 1,
      updateStatusFn = () => {},
      logTimelineFn = () => ({}),
      updateTimelineFn = () => {},
      progressCallback = () => {}
    ) => {
      if (currentAbortController) {
        logger.logEvent("warn", "Aborting previous API call.");
        currentAbortController.abort();
      }
      currentAbortController = new AbortController();

      if (!isCont) updateStatusFn(`Calling Gemini (${modelName})...`, true);
      let logItem = logTimelineFn(
        `[API] Calling ${modelName}...`,
        "info",
        true,
        true
      );

      try {
        const result = await ApiClient.callGeminiAPIStream(
          prompt,
          sysInstr,
          modelName,
          apiKey,
          funcDecls,
          prevContent,
          currentAbortController.signal,
          progressCallback
        );
        updateTimelineFn(
          logItem,
          `[API OK:${modelName}] Finish: ${result.finishReason}, Tokens: ${result.tokenCount}`,
          "info",
          true
        );
        currentAbortController = null;
        return result;
      } catch (error) {
        if (error.name === "AbortError") {
          updateTimelineFn(
            logItem,
            `[API Aborted:${modelName}] User cancelled`,
            "warn",
            true
          );
          currentAbortController = null;
          throw error; // Re-throw abort error
        }
        logger.logEvent(
          "warn",
          `API call failed: ${error.message}. Retries left: ${retries}`
        );
        updateTimelineFn(
          logItem,
          `[API ERR:${modelName}] ${Utils.lc(error.message).substring(
            0,
            80
          )} (Retries: ${retries})`,
          "error",
          true
        );
        currentAbortController = null; // Clear controller on non-abort error

        if (
          retries > 0 &&
          (error.message.includes("API Error (5") ||
            error.message.includes("NetworkError") ||
            error.message.includes("Failed to fetch"))
        ) {
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              1500 * (globalState.cfg.maxRetries - retries + 1)
            )
          );
          return ApiClient.callApiWithRetry(
            prompt,
            sysInstr,
            modelName,
            apiKey,
            funcDecls,
            isCont,
            prevContent,
            retries - 1,
            updateStatusFn,
            logTimelineFn,
            updateTimelineFn,
            progressCallback
          );
        } else {
          throw error;
        }
      } finally {
        if (!isCont && !currentAbortController) updateStatusFn("Idle"); // Don't reset status if abort is pending
        UI.updateApiProgress(""); // Clear progress indicator
      }
    },
    abortCurrentCall: () => {
      if (currentAbortController) {
        logger.logEvent("info", "User requested API call abort.");
        currentAbortController.abort();
        currentAbortController = null;
        UI.updateStatus("Aborting API call...");
      } else {
        logger.logEvent("info", "No active API call to abort.");
      }
    },
  };

  const UI = {
    initializeUIElementReferences: () => {
      const elementIds = [
        "total-cycles",
        "max-cycles-display",
        "agent-iterations",
        "human-interventions",
        "fail-count",
        "current-goal",
        "last-critique-type",
        "persona-mode",
        "html-history-count",
        "context-token-estimate",
        "avg-confidence",
        "critique-fail-rate",
        "avg-tokens",
        "context-token-warning",
        "current-cycle-details",
        "current-cycle-content",
        "current-cycle-number",
        "diagram-display-container",
        "diagram-json-display",
        "diagram-svg-container",
        "cycle-diagram",
        "goal-input",
        "seed-prompt-core",
        "seed-prompt-critique",
        "seed-prompt-summarize",
        "api-key-input",
        "lsd-persona-percent-input",
        "xyz-persona-percent-input",
        "llm-critique-prob-input",
        "human-review-prob-input",
        "max-cycle-time-input",
        "auto-critique-thresh-input",
        "max-cycles-input",
        "html-history-limit-input",
        "pause-after-cycles-input",
        "max-retries-input",
        "ui-render-output",
        "timeline-log",
        "status-indicator",
        "core-loop-steps-list",
        "run-cycle-button",
        "force-human-review-button",
        "go-back-button",
        "export-state-button",
        "import-state-button",
        "import-file-input",
        "download-log-button",
        "summarize-context-button",
        "clear-local-storage-button",
        "human-intervention-section",
        "human-intervention-title",
        "human-intervention-reason",
        "human-intervention-reason-summary",
        "hitl-options-mode",
        "hitl-options-list",
        "submit-hitl-options-button",
        "hitl-prompt-mode",
        "human-critique-input",
        "submit-critique-button",
        "hitl-code-edit-mode",
        "human-edit-artifact-selector",
        "human-edit-artifact-textarea",
        "submit-human-code-edit-button",
        "meta-sandbox-container",
        "meta-sandbox-output",
        "approve-meta-change-button",
        "discard-meta-change-button",
        "genesis-state-display",
        "genesis-metrics-display",
        "genesis-diagram-json",
        "notifications-container",
        "core-model-selector",
        "critique-model-selector",
        "streaming-output-container",
        "streaming-output-pre",
        "api-progress",
      ];
      uiRefs = {};
      elementIds.forEach((kebabId) => {
        uiRefs[Utils.kabobToCamel(kebabId)] = Utils.$id(kebabId);
      });
      logger.logEvent("debug", "UI element references initialized.");
    },
    updateStatus: (message, isActive = false, isError = false) => {
      if (!uiRefs.statusIndicator) return;
      uiRefs.statusIndicator.textContent = `Status: ${message}`;
      uiRefs.statusIndicator.classList.toggle("active", isActive);
      uiRefs.statusIndicator.style.borderColor = isError
        ? "red"
        : isActive
        ? "yellow"
        : "gray";
      uiRefs.statusIndicator.style.color = isError
        ? "red"
        : isActive
        ? "yellow"
        : "#ccc";
    },
    updateApiProgress: (message) => {
      if (uiRefs.apiProgress) {
        uiRefs.apiProgress.textContent = message ? `API: ${message}` : "";
      }
    },
    updateStreamingOutput: (content, isFinal = false) => {
      if (uiRefs.streamingOutputContainer && uiRefs.streamingOutputPre) {
        uiRefs.streamingOutputContainer.classList.remove("hidden");
        uiRefs.streamingOutputPre.textContent = content;
        uiRefs.streamingOutputPre.scrollTop =
          uiRefs.streamingOutputPre.scrollHeight;
        if (isFinal) {
          // TODO: Hide after a delay if it's final? Or leave visible?
          // setTimeout(() => uiRefs.streamingOutputContainer.classList.add('hidden'), 3000);
        }
      }
    },
    clearStreamingOutput: () => {
      if (uiRefs.streamingOutputContainer && uiRefs.streamingOutputPre) {
        uiRefs.streamingOutputPre.textContent = "(Stream ended)";
        setTimeout(
          () => uiRefs.streamingOutputContainer.classList.add("hidden"),
          2000
        );
      }
    },
    highlightCoreStep: (stepIndex) => {
      activeCoreStepIdx = stepIndex;
      logger.logEvent("debug", `Highlighting step: ${stepIndex}`);
      if (uiRefs.coreLoopStepsList && uiRefs.coreLoopStepsList.children) {
        Array.from(uiRefs.coreLoopStepsList.children).forEach((li, idx) => {
          li.classList.toggle("active-step", idx === stepIndex);
        });
      }
    },
    showNotification: (message, type = "info", duration = 5000) => {
      const container = Utils.$id("notifications-container");
      if (!container) {
        console.error("Notification container not found!");
        alert(`[${Utils.uc(type)}] ${message}`);
        return;
      }
      const notification = document.createElement("div");
      notification.className = `notification ${type}`;
      notification.innerHTML = `${message}<button style="background:none;border:none;float:right;cursor:pointer;color:inherit;font-size:1.2em;line-height:1;padding:0;margin-left:10px;" onclick="this.parentElement.remove()">×</button>`;
      container.appendChild(notification);
      if (duration > 0) {
        setTimeout(() => {
          if (notification.parentElement) {
            notification.remove();
          }
        }, duration);
      }
    },
    createSvgElement: (name, attrs = {}) => {
      const el = document.createElementNS(SVG_NS, name);
      for (const key in attrs) el.setAttribute(key, attrs[key]);
      return el;
    },
    updateMetricsDisplay: () => {
      if (!globalState || !uiRefs.avgConfidence) return;
      const confHistory = globalState.confidenceHistory.slice(-10);
      if (confHistory.length > 0) {
        globalState.avgConfidence =
          confHistory.reduce((a, b) => a + b, 0) / confHistory.length;
        uiRefs.avgConfidence.textContent = globalState.avgConfidence.toFixed(2);
      } else {
        uiRefs.avgConfidence.textContent = "N/A";
      }
      const critHistory = globalState.critiqueFailHistory.slice(-10);
      if (critHistory.length > 0) {
        const fails = critHistory.filter((v) => v === true).length;
        globalState.critiqueFailRate = (fails / critHistory.length) * 100;
        uiRefs.critiqueFailRate.textContent =
          globalState.critiqueFailRate.toFixed(1) + "%";
      } else {
        uiRefs.critiqueFailRate.textContent = "N/A";
      }
      if (uiRefs.avgTokens)
        uiRefs.avgTokens.textContent =
          globalState.avgTokens?.toFixed(0) || "N/A";
      if (uiRefs.contextTokenEstimate)
        uiRefs.contextTokenEstimate.textContent =
          globalState.contextTokenEstimate?.toLocaleString() || "0";
      if (uiRefs.failCount)
        uiRefs.failCount.textContent = globalState.failCount;
      UI.checkContextTokenWarning();
    },
    checkContextTokenWarning: () => {
      if (!globalState || !uiRefs.contextTokenWarning) return;
      const isWarn = globalState.contextTokenEstimate >= CTX_WARN_THRESH;
      uiRefs.contextTokenWarning.classList.toggle("hidden", !isWarn);
      if (isWarn) {
        logger.logEvent(
          "warn",
          `Context high! (${globalState.contextTokenEstimate.toLocaleString()}). Summarize?`
        );
      }
    },
    updateHtmlHistoryControls: () => {
      if (!uiRefs.htmlHistoryCount || !globalState) return;
      const count = globalState.htmlHistory?.length || 0;
      uiRefs.htmlHistoryCount.textContent = count.toString();
      if (uiRefs.goBackButton) uiRefs.goBackButton.disabled = count === 0;
    },
    updateFieldsetSummaries: () => {
      if (!globalState) return;
      const updateSummary = (fieldsetRefOrId, text) => {
        let fieldset =
          typeof fieldsetRefOrId === "string"
            ? Utils.$id(fieldsetRefOrId)
            : fieldsetRefOrId;
        if (fieldset) {
          const summary = fieldset.querySelector(".summary-line");
          if (summary) {
            summary.textContent = text || "(N/A)";
          }
        }
      };
      updateSummary(
        "genesis-config",
        `LSD:${globalState.cfg.personaBalance}%,Crit:${
          globalState.cfg.llmCritiqueProb
        }%,Rev:${globalState.cfg.humanReviewProb}%,CycleT:${
          globalState.cfg.maxCycleTime
        }s,ConfT:${globalState.cfg.autoCritiqueThresh},MaxC:${
          globalState.cfg.maxCycles || "Inf"
        },CoreM:${globalState.cfg.coreModel.split("-")[1]},CritM:${
          globalState.cfg.critiqueModel.split("-")[1]
        }`
      );
      updateSummary(
        "seed-prompts",
        `Core:${
          Storage.getArtifactContent("reploid.core.sys-prompt", 0)?.length || 0
        }c, Crit:${
          Storage.getArtifactContent("reploid.core.critiquer-prompt", 0)
            ?.length || 0
        }c, Sum:${
          Storage.getArtifactContent("reploid.core.summarizer-prompt", 0)
            ?.length || 0
        }c`
      );
      updateSummary(
        uiRefs.genesisStateDisplay,
        `Diagram JSON: ${
          Storage.getArtifactContent("reploid.core.diagram", 0)?.length || 0
        }c`
      );
      const cycleContent = uiRefs.currentCycleContent?.textContent || "";
      updateSummary(
        uiRefs.currentCycleDetails,
        `Items: ${
          uiRefs.currentCycleContent?.childElementCount || 0
        }, Content: ${cycleContent.length}c`
      );
      updateSummary(
        "timeline-fieldset",
        `Entries: ${uiRefs.timelineLog?.childElementCount || 0}`
      );
      updateSummary(
        "controls-fieldset",
        `API Key: ${globalState.apiKey ? "Set" : "Not Set"}`
      );
    },
    updateStateDisplay: () => {
      if (!globalState || !uiRefs.totalCycles) return;
      uiRefs.lsdPersonaPercentInput.value =
        globalState.cfg.personaBalance ?? 50;
      uiRefs.xyzPersonaPercentInput.value =
        100 - (globalState.cfg.personaBalance ?? 50);
      uiRefs.llmCritiqueProbInput.value = globalState.cfg.llmCritiqueProb ?? 50; // Corrected default
      uiRefs.humanReviewProbInput.value = globalState.cfg.humanReviewProb ?? 50; // Corrected default
      uiRefs.maxCycleTimeInput.value = globalState.cfg.maxCycleTime ?? 600;
      uiRefs.autoCritiqueThreshInput.value =
        globalState.cfg.autoCritiqueThresh ?? 0.75;
      uiRefs.maxCyclesInput.value = globalState.cfg.maxCycles ?? 0;
      uiRefs.htmlHistoryLimitInput.value =
        globalState.cfg.htmlHistoryLimit ?? 5;
      uiRefs.pauseAfterCyclesInput.value =
        globalState.cfg.pauseAfterCycles ?? 10;
      uiRefs.maxRetriesInput.value = globalState.cfg.maxRetries ?? 1;
      uiRefs.apiKeyInput.value = globalState.apiKey || "";
      uiRefs.coreModelSelector.value = globalState.cfg.coreModel;
      uiRefs.critiqueModelSelector.value = globalState.cfg.critiqueModel;
      const maxC = globalState.cfg.maxCycles || 0;
      uiRefs.maxCyclesDisplay.textContent =
        maxC === 0 ? "Inf" : maxC.toString();
      uiRefs.totalCycles.textContent = globalState.totalCycles;
      uiRefs.agentIterations.textContent = globalState.agentIterations;
      uiRefs.humanInterventions.textContent = globalState.humanInterventions;
      uiRefs.failCount.textContent = globalState.failCount;
      const goalInfo = CycleLogic.getActiveGoalInfo();
      let goalText =
        goalInfo.type === "Idle"
          ? "Idle"
          : `${goalInfo.type}: ${goalInfo.latestGoal}`;
      if (globalState.currentGoal.summaryContext) {
        goalText += ` (Ctx: ${globalState.currentGoal.summaryContext.substring(
          0,
          20
        )}...)`;
      }
      uiRefs.currentGoal.textContent =
        goalText.length > 40 ? goalText.substring(0, 37) + "..." : goalText;
      uiRefs.lastCritiqueType.textContent = globalState.lastCritiqueType;
      uiRefs.personaMode.textContent = globalState.personaMode;
      UI.updateMetricsDisplay();
      UI.updateHtmlHistoryControls();
      UI.hideHumanInterventionUI();
      UI.hideMetaSandbox();
      if (
        uiRefs.runCycleButton &&
        !metaSandboxPending &&
        !uiRefs.humanInterventionSection?.classList.contains("hidden")
      ) {
        uiRefs.runCycleButton.disabled = false;
      }
      UI.updateFieldsetSummaries();
    },
    displayGenesisState: () => {
      if (!uiRefs.genesisMetricsDisplay || !uiRefs.genesisDiagramJson) return;
      const metricsEl = Utils.$id("core-metrics-display");
      if (metricsEl) {
        uiRefs.genesisMetricsDisplay.innerHTML = metricsEl.innerHTML;
      } else {
        uiRefs.genesisMetricsDisplay.innerHTML = "Metrics unavailable";
      }
      const diagramJsonContent = Storage.getArtifactContent(
        "reploid.core.diagram",
        0
      );
      uiRefs.genesisDiagramJson.value =
        diagramJsonContent || "(Genesis Diagram JSON Not Found)";
    },
    logToTimeline: (
      cycle,
      message,
      type = "info",
      isSubStep = false,
      animate = false
    ) => {
      if (!uiRefs.timelineLog) return null;
      logger.logEvent(type, `T[${cycle}]: ${message}`);
      const li = document.createElement("li");
      const span = document.createElement("span");
      li.setAttribute("data-cycle", cycle);
      li.setAttribute("data-timestamp", Date.now());
      li.classList.add(isSubStep ? "sub-step" : "log-entry");
      if (type === "error") li.classList.add("error");
      if (type === "warn") li.classList.add("warn");
      const persona = globalState?.personaMode === "XYZ" ? "[X]" : "[L]";
      let icon = "➡️";
      if (message.startsWith("[API")) icon = "☁️";
      else if (message.startsWith("[TOOL")) icon = "🔧";
      else if (message.startsWith("[CRIT")) icon = "🧐";
      else if (message.startsWith("[HUMAN")) icon = "🧑‍💻";
      else if (message.startsWith("[APPLY") || message.startsWith("[ART"))
        icon = "📝";
      else if (message.startsWith("[DECIDE")) icon = "⚙️";
      else if (message.startsWith("[STATE")) icon = "💾";
      else if (message.startsWith("[CTX")) icon = "📜";
      else if (message.startsWith("[GOAL")) icon = "🎯";
      else if (message.startsWith("[CYCLE")) icon = "🔄";
      else if (message.startsWith("[RETRY")) icon = "⏳";
      if (type === "error") icon = "❌";
      else if (type === "warn") icon = "⚠️";
      let iconHTML = `<span class="log-icon" title="${type}">${icon}</span>`;
      if (animate) {
        iconHTML = `<span class="log-icon animated-icon" title="${type}">⚙️</span>`;
      }
      span.innerHTML = `${iconHTML} ${persona} ${message}`;
      li.appendChild(span);
      const targetList = uiRefs.timelineLog;
      targetList.insertBefore(li, targetList.firstChild);
      if (targetList.children.length > 200) {
        targetList.removeChild(targetList.lastChild);
      }
      return li;
    },
    logCoreLoopStep: (cycle, stepIndex, message) => {
      UI.highlightCoreStep(stepIndex);
      if (!uiRefs.timelineLog) return null;
      const li = document.createElement("li");
      li.classList.add("core-step");
      li.setAttribute("data-cycle", cycle);
      li.setAttribute("data-timestamp", Date.now());
      const span = document.createElement("span");
      const icons = ["🎯", "🧠", "💡", "🛠️", "⏱️", "🧐", "💾", "🔄"];
      const stepIcon = icons[stepIndex] || "➡️";
      span.innerHTML = `<span class="log-icon">${stepIcon}</span> <strong>Step ${
        stepIndex + 1
      }:</strong> ${message}`;
      li.appendChild(span);
      uiRefs.timelineLog.insertBefore(li, uiRefs.timelineLog.firstChild);
      return li;
    },
    updateTimelineItem: (
      logItem,
      newMessage,
      newType = "info",
      stopAnimate = true
    ) => {
      if (!logItem) return;
      const span = logItem.querySelector("span");
      if (!span || !globalState) return;
      let icon = span.querySelector(".log-icon")?.textContent || "➡️";
      let iconClass = "log-icon";
      let currentTitle =
        span.querySelector(".log-icon")?.getAttribute("title") || newType;
      if (newMessage.includes(" OK")) icon = "✅";
      else if (newMessage.includes(" ERR")) icon = "❌";
      if (newType === "warn") icon = "⚠️";
      if (newType === "error") icon = "❌";
      const persona = globalState.personaMode === "XYZ" ? "[X]" : "[L]";
      if (stopAnimate) {
        const animatedIconEl = span.querySelector(".animated-icon");
        if (animatedIconEl) {
          animatedIconEl.classList.remove("animated-icon");
          iconClass = "log-icon";
          currentTitle = newType;
        }
      } else {
        if (span.querySelector(".animated-icon")) {
          icon = "⚙️";
          iconClass = "log-icon animated-icon";
        }
      }
      span.innerHTML = `<span class="${iconClass}" title="${currentTitle}">${icon}</span> ${persona} ${newMessage}`;
      logItem.classList.remove("error", "warn");
      if (newType === "error") logItem.classList.add("error");
      if (newType === "warn") logItem.classList.add("warn");
    },
    summarizeCompletedCycleLog: (logItem, outcome) => {
      if (!logItem || !logItem.classList.contains("log-entry")) return;
      logItem.classList.add("summary");
      const firstSpan = logItem.querySelector("span");
      if (firstSpan) {
        firstSpan.innerHTML = `<span class="log-icon">🏁</span> Cycle ${logItem.getAttribute(
          "data-cycle"
        )} Completed: ${outcome} (Expand?)`;
      }
    },
    clearCurrentCycleDetails: () => {
      if (!uiRefs.currentCycleDetails || !uiRefs.currentCycleContent) return;
      uiRefs.currentCycleDetails.classList.add("collapsed");
      UI.updateFieldsetSummaries();
      uiRefs.currentCycleContent.innerHTML = "<p>Waiting for cycle...</p>";
      if (uiRefs.diagramDisplayContainer) {
        uiRefs.diagramDisplayContainer.classList.add("hidden");
      }
      if (uiRefs.streamingOutputContainer) {
        uiRefs.streamingOutputContainer.classList.add("hidden");
      }
      if (uiRefs.streamingOutputPre) {
        uiRefs.streamingOutputPre.textContent = "(No stream active)";
      }
    },
    getArtifactTypeIndicator: (type) => {
      switch (type) {
        case "JS":
          return "[JS]";
        case "CSS":
          return "[CSS]";
        case "HTML_HEAD":
          return "[HEAD]";
        case "HTML_BODY":
          return "[BODY]";
        case "JSON":
          return "[JSON]";
        case "PROMPT":
          return "[TXT]";
        case "FULL_HTML_SOURCE":
          return "[HTML]";
        case "TEXT":
          return "[TXT]";
        case "DIAGRAM_JSON":
          return "[JSON]";
        default:
          return "[???]";
      }
    },
    displayCycleArtifact: (
      label,
      content,
      type = "info",
      isModified = false,
      source = null,
      artifactId = null,
      cycle = null
    ) => {
      if (!uiRefs.currentCycleDetails || !uiRefs.currentCycleContent) return;
      if (uiRefs.currentCycleDetails.classList.contains("collapsed")) {
        uiRefs.currentCycleDetails.classList.remove("collapsed");
        uiRefs.currentCycleContent.innerHTML = "";
      }
      const section = document.createElement("div");
      section.className = "artifact-section";
      const labelEl = document.createElement("span");
      labelEl.className = "artifact-label";
      const meta = artifactId
        ? StateManager.getArtifactMetadata(artifactId)
        : { type: "TEXT" };
      const typeIndicator = UI.getArtifactTypeIndicator(meta.type);
      labelEl.innerHTML = `<span class="type-indicator">${typeIndicator}</span> ${label}`;
      if (artifactId)
        labelEl.innerHTML += ` (<i style="color:#aaa">${artifactId}</i>)`;
      if (cycle !== null)
        labelEl.innerHTML += ` <i style="color:#ccc">[Cyc ${cycle}]</i>`;
      if (source)
        labelEl.innerHTML += ` <span class="source-indicator">(Source: ${source})</span>`;
      if (isModified)
        labelEl.innerHTML +=
          ' <span class="change-indicator" style="color:orange;">*</span>';
      section.appendChild(labelEl);
      const pre = document.createElement("pre");
      pre.textContent =
        content === null || content === undefined ? "(empty)" : String(content);
      pre.classList.add(type);
      if (isModified) pre.classList.add("modified");
      section.appendChild(pre);
      uiRefs.currentCycleContent.appendChild(section);
      UI.updateFieldsetSummaries();
    },
    hideHumanInterventionUI: () => {
      if (!uiRefs.humanInterventionSection) return;
      uiRefs.humanInterventionSection.classList.add("hidden");
      if (uiRefs.hitlOptionsMode)
        uiRefs.hitlOptionsMode.classList.add("hidden");
      if (uiRefs.hitlPromptMode) uiRefs.hitlPromptMode.classList.add("hidden");
      if (uiRefs.hitlCodeEditMode)
        uiRefs.hitlCodeEditMode.classList.add("hidden");
      if (!metaSandboxPending && uiRefs.runCycleButton) {
        uiRefs.runCycleButton.disabled = false;
      }
    },
    showHumanInterventionUI: (
      mode = "prompt",
      reason = "",
      options = [],
      artifactIdToEdit = null
    ) => {
      if (!uiRefs.humanInterventionSection || !globalState) return;
      UI.highlightCoreStep(5);
      UI.hideMetaSandbox();
      uiRefs.humanInterventionSection.classList.remove("hidden");
      uiRefs.humanInterventionSection
        .querySelector("fieldset")
        ?.classList.remove("collapsed");
      uiRefs.humanInterventionTitle.textContent = `Human Intervention Required`;
      uiRefs.humanInterventionReason.textContent = `Reason: ${reason}.`;
      if (uiRefs.humanInterventionReasonSummary) {
        uiRefs.humanInterventionReasonSummary.textContent = `Reason: ${reason.substring(
          0,
          50
        )}...`;
      }
      if (uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = true;
      UI.logToTimeline(
        globalState.totalCycles,
        `[HUMAN] Intervention Required: ${reason}`,
        "warn",
        true
      );
      if (uiRefs.hitlOptionsMode)
        uiRefs.hitlOptionsMode.classList.add("hidden");
      if (uiRefs.hitlPromptMode) uiRefs.hitlPromptMode.classList.add("hidden");
      if (uiRefs.hitlCodeEditMode)
        uiRefs.hitlCodeEditMode.classList.add("hidden");

      if (
        mode === "options" &&
        uiRefs.hitlOptionsMode &&
        uiRefs.hitlOptionsList
      ) {
        uiRefs.hitlOptionsMode.classList.remove("hidden");
        uiRefs.hitlOptionsList.innerHTML = "";
        options.forEach((opt, i) => {
          const div = document.createElement("div");
          const inp = document.createElement("input");
          inp.type = "checkbox";
          inp.id = `hitl_${i}`;
          inp.value = opt.value || opt.label;
          inp.name = "hitl_option";
          const lbl = document.createElement("label");
          lbl.htmlFor = inp.id;
          lbl.textContent = opt.label;
          div.append(inp, lbl);
          uiRefs.hitlOptionsList.appendChild(div);
        });
      } else if (
        mode === "code_edit" &&
        uiRefs.hitlCodeEditMode &&
        uiRefs.humanEditArtifactSelector &&
        uiRefs.humanEditArtifactTextarea
      ) {
        uiRefs.hitlCodeEditMode.classList.remove("hidden");
        uiRefs.humanEditArtifactSelector.innerHTML = "";
        uiRefs.humanEditArtifactTextarea.value = "";
        const editableTypes = [
          "HTML_HEAD",
          "HTML_BODY",
          "CSS",
          "JS",
          "JSON",
          "FULL_HTML_SOURCE",
          "PROMPT",
          "TEXT",
        ];
        const currentCycle = globalState.totalCycles;
        const allMeta = StateManager.getAllArtifactMetadata();
        const relevantArtifacts = Object.values(allMeta)
          .filter(
            (meta) => editableTypes.includes(meta.type) && meta.latestCycle >= 0
          )
          .sort((a, b) => a.id.localeCompare(b.id));
        relevantArtifacts.forEach((meta) => {
          const opt = document.createElement("option");
          opt.value = meta.id;
          opt.textContent = `${meta.id} (${meta.type}) - Last Mod: Cyc ${meta.latestCycle}`;
          uiRefs.humanEditArtifactSelector.appendChild(opt);
        });
        if (
          globalState.lastGeneratedFullSource &&
          artifactIdToEdit === "full_html_source"
        ) {
          const opt = document.createElement("option");
          opt.value = "full_html_source";
          opt.textContent = `Proposed Full HTML Source (Cycle ${currentCycle})`;
          uiRefs.humanEditArtifactSelector.appendChild(opt);
        }
        const selectArtifact = (id) => {
          let content = "";
          let cycle = null;
          if (id === "full_html_source") {
            content =
              globalState.lastGeneratedFullSource ||
              "(Full source not available)";
            cycle = currentCycle;
          } else {
            const meta = StateManager.getArtifactMetadata(id);
            if (meta && meta.latestCycle >= 0) {
              cycle = meta.latestCycle;
              content =
                Storage.getArtifactContent(id, cycle) ??
                `(Artifact ${id} - Cycle ${cycle} content not found)`;
            } else {
              content = `(Artifact ${id} not found)`;
              cycle = -1;
            }
          }
          uiRefs.humanEditArtifactTextarea.value = content;
          uiRefs.humanEditArtifactTextarea.scrollTop = 0;
          uiRefs.humanEditArtifactTextarea.setAttribute(
            "data-current-artifact-id",
            id
          );
          uiRefs.humanEditArtifactTextarea.setAttribute(
            "data-current-artifact-cycle",
            cycle
          );
        };
        uiRefs.humanEditArtifactSelector.onchange = () =>
          selectArtifact(uiRefs.humanEditArtifactSelector.value);
        const initialId =
          artifactIdToEdit &&
          (StateManager.getArtifactMetadata(artifactIdToEdit)?.latestCycle >=
            0 ||
            artifactIdToEdit === "full_html_source")
            ? artifactIdToEdit
            : relevantArtifacts[0]?.id;
        if (initialId) {
          uiRefs.humanEditArtifactSelector.value = initialId;
          selectArtifact(initialId);
        } else {
          uiRefs.humanEditArtifactTextarea.value =
            "(No editable artifacts found)";
          uiRefs.humanEditArtifactTextarea.removeAttribute(
            "data-current-artifact-id"
          );
          uiRefs.humanEditArtifactTextarea.removeAttribute(
            "data-current-artifact-cycle"
          );
        }
      } else {
        if (uiRefs.hitlPromptMode && uiRefs.humanCritiqueInput) {
          uiRefs.hitlPromptMode.classList.remove("hidden");
          uiRefs.humanCritiqueInput.value = "";
          uiRefs.humanCritiqueInput.placeholder = `Feedback/Next Step? (${reason})`;
          uiRefs.humanCritiqueInput.focus();
        }
      }
      uiRefs.humanInterventionSection.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    },
    hideMetaSandbox: () => {
      if (!uiRefs.metaSandboxContainer) return;
      uiRefs.metaSandboxContainer.classList.add("hidden");
      metaSandboxPending = false;
      if (
        uiRefs.humanInterventionSection?.classList.contains("hidden") &&
        uiRefs.runCycleButton
      ) {
        uiRefs.runCycleButton.disabled = false;
      }
    },
    showMetaSandbox: (htmlSource) => {
      if (
        !uiRefs.metaSandboxContainer ||
        !uiRefs.metaSandboxOutput ||
        !globalState
      )
        return;
      UI.highlightCoreStep(6);
      UI.hideHumanInterventionUI();
      uiRefs.metaSandboxContainer.classList.remove("hidden");
      uiRefs.metaSandboxContainer
        .querySelector("fieldset")
        ?.classList.remove("collapsed");
      if (uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = true;
      const iframe = uiRefs.metaSandboxOutput;
      try {
        const doc = iframe.contentWindow?.document;
        if (doc) {
          doc.open();
          doc.write(htmlSource);
          doc.close();
          logger.logEvent("info", "Meta sandbox rendered for approval.");
          metaSandboxPending = true;
          UI.logToTimeline(
            globalState.totalCycles,
            `[STATE] Meta-Sandbox Ready for Review.`,
            "info",
            true
          );
          uiRefs.metaSandboxContainer.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        } else {
          throw new Error("Cannot access meta sandbox iframe document.");
        }
      } catch (e) {
        logger.logEvent("error", `Cannot render meta sandbox: ${e.message}`);
        UI.showNotification(
          "Error: Failed to show meta sandbox preview.",
          "error"
        );
        UI.logToTimeline(
          globalState.totalCycles,
          `[ERROR] Meta-Sandbox failed to render.`,
          "error",
          true
        );
        UI.hideMetaSandbox();
        if (uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = false;
      }
    },
    renderCycleSVG: (cycleData, svgElement) => {
      if (!svgElement) {
        logger.logEvent("error", "SVG element not found for rendering");
        return;
      }
      while (svgElement.firstChild) {
        svgElement.removeChild(svgElement.firstChild);
      }
      const config = {
        nodeWidth: 160,
        nodeHeight: 65,
        decisionSize: 90,
        padding: 40,
        arrowSize: 8,
        strokeWidth: 2,
        fontSize: 13,
        fontFamily: "monospace",
        lineLabelFontSize: 11,
        colors: {
          step: { fill: "#e0e0e0", stroke: "#555" },
          iteration: { fill: "#d0e0ff", stroke: "#3366cc" },
          intervention: { fill: "#fff0b3", stroke: "#cc8400" },
          decision: { fill: "#e0f0e0", stroke: "#4caf50" },
          start_end: { fill: "#f5f5f5", stroke: "#333" },
          pause: { fill: "#f5e0f5", stroke: "#884488" },
          fail_point: { fill: "#ffdddd", stroke: "#d32f2f" },
          retry_decision: { fill: "#e0f0e0", stroke: "#ff9800" },
          final_intervention: { fill: "#fff0b3", stroke: "#d32f2f" },
          text: "#000",
          line_normal: "#555",
          line_success: "#4caf50",
          line_fail: "#f44336",
          line_retry: "#ff9800",
          line_label_bg: "rgba(255, 255, 255, 0.7)",
        },
      };
      const defs = UI.createSvgElement("defs");
      const marker = UI.createSvgElement("marker", {
        id: "arrowhead",
        viewBox: "0 0 10 10",
        refX: "8",
        refY: "5",
        markerUnits: "strokeWidth",
        markerWidth: config.arrowSize,
        markerHeight: config.arrowSize,
        orient: "auto-start-reverse",
      });
      const path = UI.createSvgElement("path", {
        d: "M 0 0 L 10 5 L 0 10 z",
        fill: config.colors.line_normal,
      });
      marker.appendChild(path);
      defs.appendChild(marker);
      ["line_success", "line_fail", "line_retry"].forEach((lineType) => {
        const markerColor = UI.createSvgElement("marker", {
          id: `arrowhead-${lineType}`,
          viewBox: "0 0 10 10",
          refX: "8",
          refY: "5",
          markerUnits: "strokeWidth",
          markerWidth: config.arrowSize,
          markerHeight: config.arrowSize,
          orient: "auto-start-reverse",
        });
        const pathColor = UI.createSvgElement("path", {
          d: "M 0 0 L 10 5 L 0 10 z",
          fill: config.colors[lineType],
        });
        markerColor.appendChild(pathColor);
        defs.appendChild(markerColor);
      });
      svgElement.appendChild(defs);
      function getNodeById(id) {
        return cycleData?.nodes?.find((n) => n.id === id);
      }
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      const nodeElements = {};
      cycleData?.nodes?.forEach((node) => {
        const group = UI.createSvgElement("g");
        let shape;
        const style = config.colors[node.type] || config.colors.step;
        const isDecision =
          node.type === "decision" || node.type === "retry_decision";
        const halfWidth =
          (isDecision ? config.decisionSize : config.nodeWidth) / 2;
        const halfHeight =
          (isDecision ? config.decisionSize : config.nodeHeight) / 2;
        if (isDecision) {
          shape = UI.createSvgElement("path", {
            d: `M ${node.x} ${node.y - halfHeight} L ${node.x + halfWidth} ${
              node.y
            } L ${node.x} ${node.y + halfHeight} L ${node.x - halfWidth} ${
              node.y
            } Z`,
            fill: style.fill,
            stroke: style.stroke,
            "stroke-width": config.strokeWidth,
          });
          node.bounds = {
            top: { x: node.x, y: node.y - halfHeight },
            bottom: { x: node.x, y: node.y + halfHeight },
            left: { x: node.x - halfWidth, y: node.y },
            right: { x: node.x + halfWidth, y: node.y },
          };
        } else {
          const isRound = node.type === "start_end" || node.type === "pause";
          shape = UI.createSvgElement("rect", {
            x: node.x - halfWidth,
            y: node.y - halfHeight,
            width: config.nodeWidth,
            height: config.nodeHeight,
            rx: isRound ? config.nodeHeight / 2 : 8,
            ry: isRound ? config.nodeHeight / 2 : 8,
            fill: style.fill,
            stroke: style.stroke,
            "stroke-width": config.strokeWidth,
          });
          node.bounds = {
            top: { x: node.x, y: node.y - halfHeight },
            bottom: { x: node.x, y: node.y + halfHeight },
            left: { x: node.x - halfWidth, y: node.y },
            right: { x: node.x + halfWidth, y: node.y },
          };
        }
        group.appendChild(shape);
        const text = UI.createSvgElement("text", {
          x: node.x,
          y: node.y,
          fill: config.colors.text,
          "font-family": config.fontFamily,
          "font-size": config.fontSize,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
        });
        const lines = String(node.label || "").split("\n");
        const lineHeight = config.fontSize * 1.2;
        const totalTextHeight = lines.length * lineHeight;
        const startY = node.y - totalTextHeight / 2 + lineHeight / 2;
        lines.forEach((line, index) => {
          const dy = index === 0 ? startY - node.y : lineHeight;
          const tspan = UI.createSvgElement("tspan", {
            x: node.x,
            dy: `${dy}px`,
          });
          tspan.textContent = line;
          text.appendChild(tspan);
        });
        group.appendChild(text);
        svgElement.appendChild(group);
        nodeElements[node.id] = group;
        const nodeMaxX = node.bounds.right.x;
        const nodeMinX = node.bounds.left.x;
        const nodeMaxY = node.bounds.bottom.y;
        const nodeMinY = node.bounds.top.y;
        minX = Math.min(minX, nodeMinX);
        minY = Math.min(minY, nodeMinY);
        maxX = Math.max(maxX, nodeMaxX);
        maxY = Math.max(maxY, nodeMaxY);
      });
      cycleData?.connections?.forEach((conn) => {
        const fromNode = getNodeById(conn.from);
        const toNode = getNodeById(conn.to);
        if (!fromNode || !toNode || !fromNode.bounds || !toNode.bounds) {
          logger.logEvent("warn", `Skipping conn: ${conn.from} -> ${conn.to}`);
          return;
        }
        let startPoint, endPoint;
        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        if (Math.abs(dy) > Math.abs(dx)) {
          startPoint = dy > 0 ? fromNode.bounds.bottom : fromNode.bounds.top;
          endPoint = dy > 0 ? toNode.bounds.top : toNode.bounds.bottom;
        } else {
          startPoint = dx > 0 ? fromNode.bounds.right : fromNode.bounds.left;
          endPoint = dx > 0 ? toNode.bounds.left : toNode.bounds.right;
        }
        const lineType = conn.type || "normal";
        const lineStyle =
          config.colors[`line_${lineType}`] || config.colors.line_normal;
        const markerId = `arrowhead${
          lineType === "normal" ? "" : "-" + "line_" + lineType
        }`;
        const line = UI.createSvgElement("line", {
          x1: startPoint.x,
          y1: startPoint.y,
          x2: endPoint.x,
          y2: endPoint.y,
          stroke: lineStyle,
          "stroke-width": config.strokeWidth,
          "marker-end": `url(#${markerId})`,
        });
        svgElement.appendChild(line);
        if (conn.label) {
          const labelRatio = 0.6;
          const midX =
            startPoint.x * labelRatio + endPoint.x * (1 - labelRatio);
          const midY =
            startPoint.y * labelRatio + endPoint.y * (1 - labelRatio);
          const angle = Math.atan2(dy, dx);
          const offsetX = Math.sin(angle) * 10;
          const offsetY = -Math.cos(angle) * 10;
          const textLabel = UI.createSvgElement("text", {
            x: midX + offsetX,
            y: midY + offsetY,
            fill: config.colors.text,
            "font-family": config.fontFamily,
            "font-size": config.lineLabelFontSize,
            "text-anchor": "middle",
            "dominant-baseline": "middle",
          });
          textLabel.textContent = conn.label;
          const labelWidthEstimate =
            conn.label.length * config.lineLabelFontSize * 0.6;
          const labelHeightEstimate = config.lineLabelFontSize;
          const bgRect = UI.createSvgElement("rect", {
            x: midX + offsetX - labelWidthEstimate / 2 - 2,
            y: midY + offsetY - labelHeightEstimate / 2 - 1,
            width: labelWidthEstimate + 4,
            height: labelHeightEstimate + 2,
            fill: config.colors.line_label_bg,
            rx: 3,
            ry: 3,
          });
          svgElement.insertBefore(bgRect, line);
          svgElement.insertBefore(textLabel, line);
          minX = Math.min(minX, parseFloat(bgRect.getAttribute("x")));
          minY = Math.min(minY, parseFloat(bgRect.getAttribute("y")));
          maxX = Math.max(
            maxX,
            parseFloat(bgRect.getAttribute("x")) +
              parseFloat(bgRect.getAttribute("width"))
          );
          maxY = Math.max(
            maxY,
            parseFloat(bgRect.getAttribute("y")) +
              parseFloat(bgRect.getAttribute("height"))
          );
        }
      });
      if (isFinite(minX)) {
        const viewBoxX = minX - config.padding;
        const viewBoxY = minY - config.padding;
        const viewBoxWidth = maxX - minX + 2 * config.padding;
        const viewBoxHeight = maxY - minY + 2 * config.padding;
        svgElement.setAttribute(
          "viewBox",
          `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`
        );
        svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
      } else {
        svgElement.setAttribute("viewBox", "0 0 800 1400");
        logger.logEvent("warn", "RenderCycleSVG: No finite bounds.");
      }
    },
    renderDiagramDisplay: (cycleNum) => {
      const svgContainer = uiRefs.diagramSvgContainer;
      const jsonDisplay = uiRefs.diagramJsonDisplay;
      const diagramContainer = uiRefs.diagramDisplayContainer;
      const cycleDiagram = uiRefs.cycleDiagram;
      if (!svgContainer || !jsonDisplay || !diagramContainer || !cycleDiagram) {
        logger.logEvent("warn", "Missing UI elements for diagram display.");
        return;
      }
      const jsonContent = Storage.getArtifactContent(
        "reploid.core.diagram",
        cycleNum
      );
      if (jsonContent) {
        jsonDisplay.value = jsonContent;
        try {
          const diagramJson = JSON.parse(jsonContent);
          UI.renderCycleSVG(diagramJson, cycleDiagram);
          diagramContainer.classList.remove("hidden");
        } catch (e) {
          logger.logEvent(
            "warn",
            `Failed parse/render diagram JSON (Cyc ${cycleNum}): ${e.message}`
          );
          cycleDiagram.innerHTML =
            '<text fill="red" x="10" y="20">Error rendering Diagram JSON</text>';
          diagramContainer.classList.remove("hidden");
        }
      } else {
        jsonDisplay.value = "{}";
        cycleDiagram.innerHTML = `<text x="10" y="20">No Diagram for Cycle ${cycleNum}</text>`;
        diagramContainer.classList.remove("hidden");
      }
    },
    renderGeneratedUI: (cycleNum) => {
      const headMeta = StateManager.getArtifactMetadata("target.head");
      const bodyMeta = StateManager.getArtifactMetadata("target.body");
      const allMeta = StateManager.getAllArtifactMetadata();
      const headContent =
        Storage.getArtifactContent(
          "target.head",
          headMeta.latestCycle >= 0 ? headMeta.latestCycle : cycleNum
        ) || "";
      const bodyContent =
        Storage.getArtifactContent(
          "target.body",
          bodyMeta.latestCycle >= 0 ? bodyMeta.latestCycle : cycleNum
        ) || "<p>(No body artifact)</p>";
      const cssContents = Object.keys(allMeta)
        .filter(
          (id) =>
            id.startsWith("target.style.") &&
            allMeta[id].type === "CSS" &&
            allMeta[id].latestCycle >= 0
        )
        .map((id) => Storage.getArtifactContent(id, allMeta[id].latestCycle))
        .filter((content) => !!content)
        .join("\n\n");
      const jsContents = Object.keys(allMeta)
        .filter(
          (id) =>
            id.startsWith("target.script.") &&
            allMeta[id].type === "JS" &&
            allMeta[id].latestCycle >= 0
        )
        .map((id) => {
          const content = Storage.getArtifactContent(
            id,
            allMeta[id].latestCycle
          );
          return content
            ? `<script id="${id}_cyc${allMeta[id].latestCycle}">\n${content}\n</script>`
            : "";
        })
        .filter((scriptTag) => scriptTag !== "")
        .join("\n");
      const iframe = uiRefs.uiRenderOutput;
      if (!iframe) {
        logger.logEvent("warn", "UI Render Output iframe not found.");
        return;
      }
      try {
        const doc = iframe.contentWindow?.document;
        if (!doc) {
          throw new Error("Cannot get UI preview iframe document.");
        }
        doc.open();
        doc.write(
          `<!DOCTYPE html><html><head><title>UI Preview (Cycle ${cycleNum})</title>${headContent}<style>body { margin: 10px; font-family: sans-serif; background-color:#fff; color:#000; } * { box-sizing: border-box; } ${cssContents}</style></head><body>${bodyContent}${jsContents}<script>console.log('UI preview rendered (Cycle ${cycleNum}).');</script></body></html>`
        );
        doc.close();
        logger.logEvent("info", `Rendered UI preview (Cycle ${cycleNum}).`);
      } catch (e) {
        logger.logEvent("error", `Failed to render UI preview: ${e.message}`);
      }
    },
    loadPromptsFromLS: () => {
      if (
        !uiRefs.seedPromptCore ||
        !uiRefs.seedPromptCritique ||
        !uiRefs.seedPromptSummarize
      ) {
        logger.logEvent("warn", "Prompt textareas not found.");
        return;
      }
      uiRefs.seedPromptCore.value =
        Storage.getArtifactContent("reploid.core.sys-prompt", 0) || "";
      uiRefs.seedPromptCritique.value =
        Storage.getArtifactContent("reploid.core.critiquer-prompt", 0) || "";
      uiRefs.seedPromptSummarize.value =
        Storage.getArtifactContent("reploid.core.summarizer-prompt", 0) || "";
      logger.logEvent("info", "Loaded prompts from LS.");
    },
    loadCoreLoopSteps: () => {
      if (!uiRefs.coreLoopStepsList) {
        logger.logEvent("warn", "Core loop steps list not found.");
        return;
      }
      uiRefs.coreLoopStepsList.value =
        Storage.getArtifactContent("reploid.core.cycle-steps", 0) ||
        "Error loading steps.";
      logger.logEvent("info", "Loaded core loop steps from LS.");
    },
    populateModelSelectors: () => {
      const models = [
        APP_CONFIG.BASE_GEMINI_MODEL,
        APP_CONFIG.ADVANCED_GEMINI_MODEL,
        APP_CONFIG.GEMINI_MODEL_OPTIMIZER,
      ];
      [uiRefs.coreModelSelector, uiRefs.critiqueModelSelector].forEach(
        (selector) => {
          if (!selector) return;
          selector.innerHTML = "";
          models.forEach((modelName) => {
            const option = document.createElement("option");
            option.value = modelName;
            option.textContent = modelName;
            selector.appendChild(option);
          });
        }
      );
    },
    setupEventListeners: () => {
      if (!uiRefs.runCycleButton) {
        logger.logEvent("error", "UI elements not ready for event listeners.");
        return;
      }
      uiRefs.runCycleButton.addEventListener("click", () => {
        if (CycleLogic.isRunning()) {
          ApiClient.abortCurrentCall();
        } else {
          CycleLogic.executeCycle();
        }
      });
      uiRefs.submitCritiqueButton?.addEventListener("click", () => {
        CycleLogic.proceedAfterHumanIntervention(
          "Human Prompt",
          uiRefs.humanCritiqueInput.value.trim()
        );
      });
      uiRefs.submitHitlOptionsButton?.addEventListener("click", () => {
        const selected = Array.from(
          uiRefs.hitlOptionsList.querySelectorAll("input:checked")
        )
          .map((el) => el.value)
          .join(", ");
        CycleLogic.proceedAfterHumanIntervention(
          "Human Options",
          selected || "None"
        );
      });
      uiRefs.submitHumanCodeEditButton?.addEventListener("click", async () => {
        const artifactId = uiRefs.humanEditArtifactTextarea.getAttribute(
          "data-current-artifact-id"
        );
        const cycleStr = uiRefs.humanEditArtifactTextarea.getAttribute(
          "data-current-artifact-cycle"
        );
        const newContent = uiRefs.humanEditArtifactTextarea.value;
        const isFullSource = artifactId === "full_html_source";

        if (!artifactId || cycleStr === null) {
          UI.showNotification(
            "Error: No artifact selected or cycle info missing.",
            "error"
          );
          return;
        }
        const cycle = parseInt(cycleStr, 10);
        if (isNaN(cycle)) {
          UI.showNotification(
            "Error: Invalid cycle number for artifact.",
            "error"
          );
          return;
        }

        UI.updateStatus("Validating Edit...", true);
        try {
          let toolResult;
          if (isFullSource) {
            toolResult = {
              success: true,
              validatedContent: newContent,
              artifactId: artifactId,
              cycle: cycle,
              contentChanged:
                newContent !== globalState.lastGeneratedFullSource,
            };
          } else {
            toolResult = await ToolRunner.runTool(
              "code_edit",
              { artifactId, cycle, newContent },
              loadedStaticTools,
              dynamicToolDefinitions
            );
          }
          UI.updateStatus("Idle");
          if (toolResult.success) {
            UI.showNotification(
              `Edit for ${artifactId} validated. Proceeding...`,
              "info"
            );
            CycleLogic.proceedAfterHumanIntervention(
              "Human Code Edit",
              toolResult
            );
          } else {
            UI.showNotification(
              `Edit Validation Failed: ${
                toolResult.error || "Unknown validation error"
              }`,
              "error"
            );
            logger.logEvent(
              "error",
              `Human edit validation failed for ${artifactId}: ${toolResult.error}`
            );
          }
        } catch (e) {
          UI.updateStatus("Idle");
          logger.logEvent(
            "error",
            `Error running code_edit tool for ${artifactId}: ${e.message}`
          );
          UI.showNotification(`Error validating edit: ${e.message}`, "error");
        }
      });
      uiRefs.forceHumanReviewButton?.addEventListener("click", () => {
        if (globalState) globalState.forceHumanReview = true;
        UI.showNotification("Next cycle will pause for Human Review.", "info");
        UI.logToTimeline(
          globalState.totalCycles,
          "[HUMAN] User forced Human Review.",
          "warn"
        );
      });
      uiRefs.downloadLogButton?.addEventListener("click", () => {
        try {
          const blob = new Blob([logger.getLogBuffer()], {
            type: "text/plain",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `x0_log_${new Date()
            .toISOString()
            .replace(/[:.]/g, "-")}.txt`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          logger.logEvent("info", "Log download initiated.");
        } catch (e) {
          logger.logEvent("error", `Log download failed: ${e.message}`);
          UI.showNotification(`Log download failed: ${e.message}`, "error");
        }
      });
      uiRefs.exportStateButton?.addEventListener(
        "click",
        StateManager.exportState
      );
      uiRefs.summarizeContextButton?.addEventListener(
        "click",
        CycleLogic.handleSummarizeContext
      );
      uiRefs.importStateButton?.addEventListener("click", () =>
        uiRefs.importFileInput?.click()
      );
      uiRefs.importFileInput?.addEventListener("change", (event) => {
        const file = event.target.files?.[0];
        if (file) StateManager.importState(file);
      });
      uiRefs.goBackButton?.addEventListener("click", () => {
        if (!globalState?.htmlHistory?.length) {
          UI.showNotification("No history.", "warn");
          return;
        }
        if (
          !confirm(
            "Revert page to previous version? State will attempt restore."
          )
        )
          return;
        const prevStateHtml = globalState.htmlHistory.pop();
        UI.updateHtmlHistoryControls();
        logger.logEvent(
          "info",
          `Reverting page HTML. History size: ${globalState.htmlHistory.length}`
        );
        UI.logToTimeline(
          globalState.totalCycles,
          "[STATE] Reverting HTML (Page Reload).",
          "warn"
        );
        try {
          const stateToPreserve = StateManager.capturePreservationState();
          Storage.saveSessionState(stateToPreserve);
          document.open();
          document.write(prevStateHtml);
          document.close();
        } catch (e) {
          logger.logEvent("error", `Go Back failed: ${e.message}`);
          UI.showNotification(`Go Back failed: ${e.message}`, "error");
          Storage.removeSessionState();
          if (globalState.htmlHistory && prevStateHtml)
            globalState.htmlHistory.push(prevStateHtml);
          UI.updateHtmlHistoryControls();
          StateManager.save();
        }
      });
      uiRefs.clearLocalStorageButton?.addEventListener("click", () => {
        if (
          !confirm(
            "WARNING: Delete ALL Reploid data from LocalStorage? Cannot be undone."
          )
        )
          return;
        try {
          Storage.clearAllReploidData();
          UI.showNotification("LocalStorage cleared. Reloading...", "info", 0);
          setTimeout(() => window.location.reload(), 1000);
        } catch (e) {
          logger.logEvent("error", `Error clearing LocalStorage: ${e.message}`);
          UI.showNotification(
            `Error clearing LocalStorage: ${e.message}`,
            "error"
          );
        }
      });
      uiRefs.approveMetaChangeButton?.addEventListener("click", () => {
        if (metaSandboxPending && globalState?.lastGeneratedFullSource) {
          const sourceToApply = globalState.lastGeneratedFullSource;
          logger.logEvent("info", "Approved meta-change.");
          UI.logToTimeline(
            globalState.totalCycles,
            `[STATE] Approved Meta-Sandbox. Applying & Reloading...`,
            "info",
            true
          );
          UI.hideMetaSandbox();
          const currentHtml = document.documentElement.outerHTML;
          CycleLogic.saveHtmlToHistory(currentHtml);
          const stateToPreserve = StateManager.capturePreservationState();
          try {
            Storage.saveSessionState(stateToPreserve);
            document.open();
            document.write(sourceToApply);
            document.close();
          } catch (e) {
            logger.logEvent("error", `Apply meta-change failed: ${e.message}`);
            UI.showNotification(`Apply failed: ${e.message}`, "error");
            Storage.removeSessionState();
            if (globalState?.htmlHistory?.length > 0)
              globalState.htmlHistory.pop();
            UI.updateHtmlHistoryControls();
          }
        } else {
          UI.showNotification("No sandbox content pending.", "warn");
        }
      });
      uiRefs.discardMetaChangeButton?.addEventListener("click", () => {
        logger.logEvent("info", "Discarded meta-sandbox changes.");
        UI.logToTimeline(
          globalState.totalCycles,
          `[STATE] Discarded Meta-Sandbox changes.`,
          "warn",
          true
        );
        UI.hideMetaSandbox();
        if (globalState) globalState.lastGeneratedFullSource = null;
        CycleLogic.proceedAfterHumanIntervention(
          "Sandbox Discarded",
          "User discarded changes",
          true
        );
      });
      uiRefs.lsdPersonaPercentInput?.addEventListener("input", () => {
        if (
          !globalState ||
          !uiRefs.lsdPersonaPercentInput ||
          !uiRefs.xyzPersonaPercentInput
        )
          return;
        let lsd = parseInt(uiRefs.lsdPersonaPercentInput.value, 10) || 0;
        lsd = Math.max(0, Math.min(100, lsd));
        globalState.cfg.personaBalance = lsd;
        uiRefs.lsdPersonaPercentInput.value = lsd;
        uiRefs.xyzPersonaPercentInput.value = 100 - lsd;
        logger.logEvent("info", `Config: personaBalance = ${lsd}`);
        StateManager.save();
        UI.updateFieldsetSummaries();
      });
      Object.keys(StateManager.getDefaultState().cfg).forEach((key) => {
        if (
          key === "personaBalance" ||
          key === "coreModel" ||
          key === "critiqueModel"
        )
          return;
        const inputId = Utils.camelToKabob(key) + "-input";
        const inputEl = uiRefs[Utils.kabobToCamel(inputId)];
        if (inputEl) {
          inputEl.addEventListener("change", (e) => {
            if (!globalState) return;
            let value;
            const target = e.target;
            if (target.type === "number") {
              value =
                target.step === "any" || target.step?.includes(".")
                  ? parseFloat(target.value)
                  : parseInt(target.value, 10);
              const min = parseFloat(target.min);
              const max = parseFloat(target.max);
              if (!isNaN(min) && value < min) value = min;
              if (!isNaN(max) && value > max) value = max;
              target.value = value;
            } else {
              value = target.value;
            }
            if (globalState.cfg[key] !== value) {
              globalState.cfg[key] = value;
              logger.logEvent("info", `Config: ${key} = ${value}`);
              if (key === "maxCycles" && uiRefs.maxCyclesDisplay)
                uiRefs.maxCyclesDisplay.textContent =
                  value === 0 ? "Inf" : value.toString();
              if (key === "htmlHistoryLimit") UI.updateHtmlHistoryControls();
              StateManager.save();
              UI.updateFieldsetSummaries();
            }
          });
        }
      });
      uiRefs.coreModelSelector?.addEventListener("change", (e) => {
        if (globalState) {
          globalState.cfg.coreModel = e.target.value;
          logger.logEvent("info", `Config: coreModel = ${e.target.value}`);
          StateManager.save();
          UI.updateFieldsetSummaries();
        }
      });
      uiRefs.critiqueModelSelector?.addEventListener("change", (e) => {
        if (globalState) {
          globalState.cfg.critiqueModel = e.target.value;
          logger.logEvent("info", `Config: critiqueModel = ${e.target.value}`);
          StateManager.save();
          UI.updateFieldsetSummaries();
        }
      });
      document.querySelectorAll("fieldset legend").forEach((legend) => {
        legend.addEventListener("click", (event) => {
          if (event.target.closest("button, input, a, select, textarea"))
            return;
          const fieldset = legend.closest("fieldset");
          if (fieldset) {
            fieldset.classList.toggle("collapsed");
          }
        });
      });
      logger.logEvent("info", "UI Event listeners set up.");
    },
  };

  const CycleLogic = {
    _isRunning: false,
    isRunning: () => CycleLogic._isRunning,
    getActiveGoalInfo: () => {
      if (!globalState)
        return {
          seedGoal: "N/A",
          cumulativeGoal: "N/A",
          latestGoal: "Idle",
          type: "Idle",
        };
      const latestGoal =
        globalState.currentGoal.cumulative || globalState.currentGoal.seed;
      return {
        seedGoal: globalState.currentGoal.seed || "None",
        cumulativeGoal: globalState.currentGoal.cumulative || "None",
        latestGoal: latestGoal || "Idle",
        type: globalState.currentGoal.latestType || "Idle",
      };
    },
    getArtifactListSummary: () => {
      const allMeta = StateManager.getAllArtifactMetadata();
      return (
        Object.values(allMeta)
          .map(
            (artMeta) =>
              `* ${artMeta.id} (${artMeta.type}) - Cycle ${artMeta.latestCycle}`
          )
          .join("\n") || "None"
      );
    },
    getToolListSummary: () => {
      const staticToolSummary = loadedStaticTools
        .map((t) => `* [S] ${t.name}: ${t.description}`)
        .join("\n");
      const dynamicToolSummary = dynamicToolDefinitions
        .map((t) => `* [D] ${t.declaration.name}: ${t.declaration.description}`)
        .join("\n");
      return (
        [staticToolSummary, dynamicToolSummary].filter((s) => s).join("\n") ||
        "None"
      );
    },
    runCoreIteration: async (apiKey, currentGoalInfo, currentCycle) => {
      UI.highlightCoreStep(1);
      if (!globalState) throw new Error("Global state is not initialized");
      const personaBalance = globalState.cfg.personaBalance ?? 50;
      const primaryPersona = personaBalance >= 50 ? "LSD" : "XYZ";
      globalState.personaMode = primaryPersona;
      const corePromptTemplate = Storage.getArtifactContent(
        "reploid.core.sys-prompt",
        currentCycle
      );
      if (!corePromptTemplate)
        throw new Error(
          "Core prompt artifact 'reploid.core.sys-prompt' not found for current cycle!"
        );
      let prompt = corePromptTemplate;
      prompt = prompt
        .replace(/\[LSD_PERCENT\]/g, personaBalance)
        .replace(/\[PERSONA_MODE\]/g, primaryPersona)
        .replace(/\[CYCLE_COUNT\]/g, globalState.totalCycles)
        .replace(/\[AGENT_ITR_COUNT\]/g, globalState.agentIterations)
        .replace(/\[HUMAN_INT_COUNT\]/g, globalState.humanInterventions)
        .replace(/\[FAIL_COUNT\]/g, globalState.failCount)
        .replace(
          /\[LAST_FEEDBACK\]/g,
          Utils.trunc(globalState.lastFeedback, 500) || "None"
        )
        .replace(
          /\[AVG_CONF\]/g,
          globalState.avgConfidence?.toFixed(2) || "N/A"
        )
        .replace(
          /\[CRIT_FAIL_RATE\]/g,
          globalState.critiqueFailRate?.toFixed(1) + "%" || "N/A"
        )
        .replace(/\[AVG_TOKENS\]/g, globalState.avgTokens?.toFixed(0) || "N/A")
        .replace(
          /\[CTX_TOKENS\]/g,
          globalState.contextTokenEstimate?.toLocaleString() || "0"
        )
        .replace(/\[\[DYNAMIC_TOOLS_LIST\]\]/g, CycleLogic.getToolListSummary())
        .replace(
          /\[\[RECENT_LOGS\]\]/g,
          Utils.trunc(
            logger.getLogBuffer().split("\n").slice(-15).join("\n"),
            1000
          )
        )
        .replace(/\[\[ARTIFACT_LIST\]\]/g, CycleLogic.getArtifactListSummary())
        .replace(
          /\[\[SEED_GOAL_DESC\]\]/g,
          Utils.trunc(currentGoalInfo.seedGoal, 1000)
        )
        .replace(
          /\[\[CUMULATIVE_GOAL_DESC\]\]/g,
          Utils.trunc(currentGoalInfo.cumulativeGoal, 2000)
        )
        .replace(
          /\[\[SUMMARY_CONTEXT\]\]/g,
          Utils.trunc(globalState.currentGoal.summaryContext, 2000) || "None"
        );
      const allMeta = StateManager.getAllArtifactMetadata();
      const relevantArtifacts = Object.keys(allMeta)
        .filter(
          (id) =>
            allMeta[id].latestCycle >= 0 &&
            (id.startsWith("target.") ||
              (currentGoalInfo.type === "Meta" && id.startsWith("reploid.")))
        )
        .sort((a, b) => allMeta[b].latestCycle - allMeta[a].latestCycle)
        .slice(0, 10);
      let snippets = "";
      for (const id of relevantArtifacts) {
        const meta = allMeta[id];
        const content = Storage.getArtifactContent(id, meta.latestCycle);
        if (content) {
          snippets += `\n---\ Artifact: ${id} (Cycle ${meta.latestCycle}) ---\n`;
          snippets += Utils.trunc(content, 500);
        }
      }
      prompt = prompt.replace(
        /\[\[ARTIFACT_CONTENT_SNIPPETS\]\]/g,
        snippets || "No relevant artifact snippets."
      );

      const sysInstruction = `You are x0. DELIBERATE, adopt ${primaryPersona}. Respond ONLY valid JSON. Refer to artifacts by ID. Use artifactId argument for tools requiring artifact content.`;
      let allFuncDecls = [];
      let conversionMap = {};
      try {
        const staticFuncDecls = (
          await Promise.all(
            loadedStaticTools.map(async (toolDef) => {
              try {
                const result = await ToolRunner.runTool(
                  "convert_to_gemini_fc",
                  { mcpToolDefinition: toolDef },
                  loadedStaticTools,
                  []
                );
                return result.geminiFunctionDeclaration;
              } catch (e) {
                logger.logEvent(
                  "error",
                  `Failed converting static tool ${toolDef.name}: ${e.message}`
                );
                return null;
              }
            })
          )
        ).filter(Boolean);
        const dynamicFuncDecls = (
          await Promise.all(
            dynamicToolDefinitions.map(async (toolDef) => {
              try {
                const result = await ToolRunner.runTool(
                  "convert_to_gemini_fc",
                  { mcpToolDefinition: toolDef.declaration },
                  loadedStaticTools,
                  []
                );
                return result.geminiFunctionDeclaration;
              } catch (e) {
                logger.logEvent(
                  "error",
                  `Failed converting dynamic tool ${toolDef.declaration.name}: ${e.message}`
                );
                return null;
              }
            })
          )
        ).filter(Boolean);
        allFuncDecls = [...staticFuncDecls, ...dynamicFuncDecls];
      } catch (toolConvError) {
        logger.logEvent(
          "error",
          `Error during tool conversion: ${toolConvError.message}`
        );
      }

      const coreModel = globalState.cfg.coreModel;
      const startTime = performance.now();
      let finalResult = null;
      let apiHistory = [];
      UI.displayCycleArtifact(
        "LLM Input",
        prompt,
        "input",
        false,
        "System",
        "prompt.core",
        currentCycle
      );
      if (globalState.currentGoal.summaryContext) {
        UI.displayCycleArtifact(
          "LLM Input Context",
          globalState.currentGoal.summaryContext,
          "input",
          false,
          "System",
          "prompt.summary",
          currentCycle
        );
      }
      UI.clearStreamingOutput();

      try {
        UI.highlightCoreStep(2);
        let accumulatedText = "";
        let functionCallParts = [];
        let currentApiResult = {};
        await ApiClient.callApiWithRetry(
          prompt,
          sysInstruction,
          coreModel,
          apiKey,
          allFuncDecls,
          false,
          null,
          globalState.cfg.maxRetries,
          UI.updateStatus,
          UI.logToTimeline,
          UI.updateTimelineItem,
          (progress) => {
            if (progress.type === "text") {
              accumulatedText += progress.content;
              UI.updateStreamingOutput(accumulatedText);
            } else if (progress.type === "functionCall") {
              functionCallParts.push(
                progress.content
              ); /* Maybe update UI differently for function calls? */
            }
            currentApiResult = progress.accumulatedResult; // Keep track of the last reported state
          }
        );

        UI.updateStreamingOutput(accumulatedText || "(No text output)", true); // Show final accumulated text

        if (functionCallParts.length > 0) {
          UI.updateStatus("Processing Tool Calls...", true);
          apiHistory.push({ role: "user", parts: [{ text: prompt }] });
          if (currentApiResult?.rawResp?.candidates?.[0]?.content)
            apiHistory.push(currentApiResult.rawResp.candidates[0].content);

          for (const fc of functionCallParts) {
            UI.updateStatus(`Running Tool: ${fc.name}...`, true);
            let toolLogItem = UI.logToTimeline(
              currentCycle,
              `[TOOL] Calling '${fc.name}'...`,
              "info",
              true,
              true
            );
            UI.displayCycleArtifact(
              `Tool Call: ${fc.name}`,
              JSON.stringify(fc.args, null, 2),
              "info",
              false,
              "LLM",
              "tool.call",
              currentCycle
            );
            let funcRespContent;
            try {
              const toolResult = await ToolRunner.runTool(
                fc.name,
                fc.args,
                loadedStaticTools,
                dynamicToolDefinitions
              );
              funcRespContent = {
                name: fc.name,
                response: { content: JSON.stringify(toolResult) },
              };
              UI.updateTimelineItem(
                toolLogItem,
                `[TOOL OK] '${fc.name}' success.`,
                "info",
                true
              );
              UI.displayCycleArtifact(
                `Tool Response: ${fc.name}`,
                JSON.stringify(toolResult, null, 2),
                "info",
                false,
                "Tool",
                "tool.response",
                currentCycle
              );
            } catch (e) {
              logger.logEvent("error", `Tool failed ${fc.name}: ${e.message}`);
              funcRespContent = {
                name: fc.name,
                response: { error: `Tool failed: ${e.message}` },
              };
              UI.updateTimelineItem(
                toolLogItem,
                `[TOOL ERR] '${fc.name}': ${e.message}`,
                "error",
                true
              );
              UI.displayCycleArtifact(
                `Tool Error: ${fc.name}`,
                e.message,
                "error",
                false,
                "Tool",
                "tool.error",
                currentCycle
              );
            }
            apiHistory.push({
              role: "function",
              parts: [{ functionResponse: funcRespContent }],
            });
          }

          UI.updateStatus(
            `Calling Gemini (${coreModel}) (tool results)...`,
            true
          );
          accumulatedText = "";
          await ApiClient.callApiWithRetry(
            null,
            sysInstr,
            coreModel,
            apiKey,
            allFuncDecls,
            true,
            apiHistory,
            globalState.cfg.maxRetries,
            UI.updateStatus,
            UI.logToTimeline,
            UI.updateTimelineItem,
            (progress) => {
              if (progress.type === "text") {
                accumulatedText += progress.content;
                UI.updateStreamingOutput(accumulatedText);
              }
              currentApiResult = progress.accumulatedResult;
            }
          );
          UI.updateStreamingOutput(accumulatedText, true);
        }
        UI.updateStatus("Processing Final Response...");
        const finalContent = accumulatedText;
        const sanitized = ApiClient.sanitizeLlmJsonResp(finalContent);
        const cycleMs = performance.now() - startTime;
        let parsedResp;
        UI.displayCycleArtifact(
          "LLM Final Output Raw",
          finalContent,
          "info",
          false,
          "LLM",
          "llm.raw",
          currentCycle
        );
        UI.displayCycleArtifact(
          "LLM Final Output Sanitized",
          sanitized,
          "output",
          false,
          "LLM",
          "llm.sanitized",
          currentCycle
        );
        try {
          parsedResp = JSON.parse(sanitized);
          logger.logEvent("info", "Parsed final LLM JSON.");
          UI.logToTimeline(
            currentCycle,
            `[LLM OK] Received and parsed final response.`
          );
        } catch (e) {
          logger.logEvent(
            "error",
            `LLM final JSON parse failed: ${e.message}. Content: ${Utils.trunc(
              sanitized,
              500
            )}`
          );
          UI.logToTimeline(
            currentCycle,
            `[LLM ERR] Invalid final JSON response.`,
            "error"
          );
          UI.displayCycleArtifact(
            "Parse Error",
            e.message,
            "error",
            false,
            "System",
            "parse.error",
            currentCycle
          );
          throw new Error(`LLM response invalid JSON: ${e.message}`);
        }

        const tokens = currentApiResult?.tokenCount || 0;
        globalState.tokenHistory.push(tokens);
        if (globalState.tokenHistory.length > 20)
          globalState.tokenHistory.shift();
        globalState.avgTokens =
          globalState.tokenHistory.length > 0
            ? globalState.tokenHistory.reduce((a, b) => a + b, 0) /
              globalState.tokenHistory.length
            : 0;
        globalState.contextTokenEstimate += tokens;
        UI.checkContextTokenWarning();

        finalResult = {
          response: parsedResp,
          cycleTimeMillis: cycleMs,
          error: null,
        };
      } catch (error) {
        logger.logEvent("error", `Core Iteration failed: ${error.message}`);
        UI.logToTimeline(currentCycle, `[CYCLE ERR] ${error.message}`, "error");
        const cycleMs = performance.now() - startTime;
        const tokens = currentApiResult?.tokenCount || 0;
        if (tokens > 0) {
          globalState.tokenHistory.push(tokens);
          if (globalState.tokenHistory.length > 20)
            globalState.tokenHistory.shift();
          globalState.avgTokens =
            globalState.tokenHistory.length > 0
              ? globalState.tokenHistory.reduce((a, b) => a + b, 0) /
                globalState.tokenHistory.length
              : 0;
          globalState.contextTokenEstimate += tokens;
          UI.checkContextTokenWarning();
        }
        finalResult = {
          response: null,
          cycleTimeMillis: cycleMs,
          error: error.message,
        };
      } finally {
        UI.updateStatus("Idle");
        UI.highlightCoreStep(-1);
        UI.clearStreamingOutput();
      }
      return finalResult;
    },
    runAutoCritique: async (apiKey, llmProposal, goalInfo, currentCycle) => {
      UI.highlightCoreStep(5);
      UI.updateStatus("Running Auto-Critique...", true);
      if (!globalState) throw new Error("State not initialized for critique");
      const template = Storage.getArtifactContent(
        "reploid.core.critiquer-prompt",
        currentCycle
      );
      if (!template) throw new Error("Critique prompt artifact not found!");
      let prompt = template;
      const critiqueModel = globalState.cfg.critiqueModel;
      prompt = prompt
        .replace(
          /\[\[PROPOSED_CHANGES_DESC\]\]/g,
          Utils.trunc(llmProposal.proposed_changes_description, 1000) || "None"
        )
        .replace(
          /\[\[MODIFIED_ARTIFACT_IDS\]\]/g,
          (llmProposal.modified_artifacts || []).map((a) => a.id).join(", ") ||
            "None"
        )
        .replace(
          /\[\[NEW_ARTIFACT_IDS_TYPES\]\]/g,
          (llmProposal.new_artifacts || [])
            .map((a) => `${a.id} (${a.type})`)
            .join(", ") || "None"
        )
        .replace(
          /\[\[DELETED_ARTIFACT_IDS\]\]/g,
          (llmProposal.deleted_artifacts || []).join(", ") || "None"
        )
        .replace(
          /\[\[GENERATED_FULL_HTML_SOURCE\]\]/g,
          Utils.trunc(llmProposal.full_html_source, 4000)
        )
        .replace(
          /\[\[PROPOSED_NEW_TOOL_DECL_OBJ\]\]/g,
          JSON.stringify(llmProposal.proposed_new_tool_declaration || null)
        )
        .replace(
          /\[\[GENERATED_TOOL_IMPL_JS\]\]/g,
          Utils.trunc(llmProposal.generated_tool_implementation_js, 1000)
        )
        .replace(/\[LATEST_GOAL_TYPE\]/g, goalInfo.type)
        .replace(
          /\[\[CUMULATIVE_GOAL_CONTEXT\]\]/g,
          Utils.trunc(goalInfo.cumulativeGoal, 2000)
        )
        .replace(
          /\[AGENT_CONFIDENCE\]/g,
          llmProposal.agent_confidence_score ?? "N/A"
        );
      const sysInstruction =
        'Critiquer x0. Analyze objectively. Output ONLY valid JSON: {"critique_passed": boolean, "critique_report": "string"}';
      UI.displayCycleArtifact(
        "Critique Input",
        prompt,
        "input",
        false,
        "System",
        "prompt.critique",
        currentCycle
      );
      try {
        let critiqueResultText = "";
        await ApiClient.callApiWithRetry(
          prompt,
          sysInstruction,
          critiqueModel,
          apiKey,
          [],
          false,
          null,
          globalState.cfg.maxRetries,
          UI.updateStatus,
          UI.logToTimeline,
          UI.updateTimelineItem,
          (progress) => {
            if (progress.type === "text") {
              critiqueResultText += progress.content;
              UI.updateStreamingOutput(critiqueResultText);
            }
          } // Stream critique output
        );
        UI.updateStreamingOutput(critiqueResultText, true);
        UI.displayCycleArtifact(
          "Critique Output Raw",
          critiqueResultText,
          "info",
          false,
          "LLM",
          "critique.raw",
          currentCycle
        );
        const sanitized = ApiClient.sanitizeLlmJsonResp(critiqueResultText);
        UI.displayCycleArtifact(
          "Critique Output Sanitized",
          sanitized,
          "output",
          false,
          "LLM",
          "critique.sanitized",
          currentCycle
        );
        try {
          const parsedCritique = JSON.parse(sanitized);
          if (
            typeof parsedCritique.critique_passed !== "boolean" ||
            typeof parsedCritique.critique_report !== "string"
          ) {
            throw new Error("Critique JSON missing fields.");
          }
          UI.logToTimeline(
            currentCycle,
            `[CRITIQUE] Auto-Critique completed. Passed: ${parsedCritique.critique_passed}`
          );
          return parsedCritique;
        } catch (e) {
          logger.logEvent(
            "error",
            `Critique JSON parse failed: ${e.message}. Content: ${Utils.trunc(
              sanitized,
              300
            )}`
          );
          UI.logToTimeline(
            currentCycle,
            `[CRITIQUE ERR] Invalid JSON format.`,
            "error"
          );
          UI.displayCycleArtifact(
            "Critique Parse Error",
            e.message,
            "error",
            false,
            "System",
            "critique.parse.error",
            currentCycle
          );
          return {
            critique_passed: false,
            critique_report: `Critique invalid JSON: ${e.message}`,
          };
        }
      } catch (e) {
        logger.logEvent("error", `Critique API call failed: ${e.message}`);
        UI.logToTimeline(
          currentCycle,
          `[CRITIQUE ERR] API Error: ${e.message}`,
          "error"
        );
        UI.displayCycleArtifact(
          "Critique API Error",
          e.message,
          "error",
          false,
          "System",
          "critique.api.error",
          currentCycle
        );
        return {
          critique_passed: false,
          critique_report: `Critique API failed: ${e.message}`,
        };
      } finally {
        UI.updateStatus("Idle");
        UI.highlightCoreStep(-1);
        UI.clearStreamingOutput();
      }
    },
    runSummarization: async (apiKey, stateSnapshotForSummary, currentCycle) => {
      UI.updateStatus("Running Summarization...", true);
      if (!globalState)
        throw new Error("State not initialized for summarization");
      const template = Storage.getArtifactContent(
        "reploid.core.summarizer-prompt",
        currentCycle
      );
      if (!template)
        throw new Error("Summarization prompt artifact not found!");
      const recentLogs = logger
        .getLogBuffer()
        .split("\n")
        .slice(-20)
        .join("\n");
      let prompt = template;
      prompt = prompt
        .replace(
          /\[\[AGENT_STATE_SUMMARY\]\]/g,
          JSON.stringify(stateSnapshotForSummary, null, 2)
        )
        .replace(/\[\[RECENT_LOGS\]\]/g, Utils.trunc(recentLogs, 1000));
      const critiqueModel = globalState.cfg.critiqueModel;
      UI.logToTimeline(
        currentCycle,
        `[CONTEXT] Running summarization...`,
        "info",
        true
      );
      UI.displayCycleArtifact(
        "Summarize Input",
        prompt,
        "input",
        false,
        "System",
        "prompt.summarize",
        currentCycle
      );
      try {
        let summaryText = "";
        await ApiClient.callApiWithRetry(
          prompt,
          'Summarizer x0. Respond ONLY valid JSON: {"summary": "string"}',
          critiqueModel,
          apiKey,
          [],
          false,
          null,
          globalState.cfg.maxRetries,
          UI.updateStatus,
          UI.logToTimeline,
          UI.updateTimelineItem,
          (progress) => {
            if (progress.type === "text") {
              summaryText += progress.content;
              UI.updateStreamingOutput(summaryText);
            }
          } // Stream summary output
        );
        UI.updateStreamingOutput(summaryText, true);
        UI.displayCycleArtifact(
          "Summarize Output Raw",
          summaryText,
          "info",
          false,
          "LLM",
          "summary.raw",
          currentCycle
        );
        const sanitized = ApiClient.sanitizeLlmJsonResp(summaryText);
        UI.displayCycleArtifact(
          "Summarize Output Sanitized",
          sanitized,
          "output",
          false,
          "LLM",
          "summary.sanitized",
          currentCycle
        );
        try {
          const parsed = JSON.parse(sanitized);
          if (parsed.summary && typeof parsed.summary === "string") {
            UI.logToTimeline(
              currentCycle,
              `[CONTEXT] Summarization successful.`,
              "info",
              true
            );
            return parsed.summary;
          } else {
            throw new Error("Summary format incorrect.");
          }
        } catch (e) {
          logger.logEvent(
            "error",
            `Summarize JSON parse failed: ${e.message}. Content: ${Utils.trunc(
              sanitized,
              300
            )}`
          );
          UI.logToTimeline(
            currentCycle,
            `[CONTEXT ERR] Invalid JSON from summarizer.`,
            "error",
            true
          );
          UI.displayCycleArtifact(
            "Summarize Parse Error",
            e.message,
            "error",
            false,
            "System",
            "summary.parse.error",
            currentCycle
          );
          throw e;
        }
      } catch (e) {
        logger.logEvent("error", `Summarization failed: ${e.message}`);
        UI.logToTimeline(
          currentCycle,
          `[CONTEXT ERR] Summarization API Error: ${e.message}`,
          "error",
          true
        );
        UI.displayCycleArtifact(
          "Summarize API Error",
          e.message,
          "error",
          false,
          "System",
          "summary.api.error",
          currentCycle
        );
        throw e;
      } finally {
        UI.updateStatus("Idle");
        UI.clearStreamingOutput();
      }
    },
    applyLLMChanges: (llmResp, currentCycleNum, critiqueSource) => {
      UI.highlightCoreStep(6);
      if (!globalState)
        return {
          success: false,
          errors: ["State not initialized"],
          nextCycle: currentCycleNum,
        };
      let changesMade = [];
      let errors = [];
      currentLlmResponse = llmResp;
      const nextCycleNum = currentCycleNum + 1;
      (llmResp.modified_artifacts || []).forEach((modArt) => {
        if (!modArt.id || modArt.content === undefined) {
          errors.push(`Invalid mod artifact: ID=${modArt.id}`);
          UI.displayCycleArtifact(
            "Modify Invalid",
            JSON.stringify(modArt),
            "error",
            false,
            critiqueSource
          );
          return;
        }
        const currentMeta = StateManager.getArtifactMetadata(modArt.id);
        if (currentMeta.latestCycle >= 0) {
          const currentContent = Storage.getArtifactContent(
            modArt.id,
            currentMeta.latestCycle
          );
          if (currentContent !== modArt.content) {
            try {
              Storage.setArtifactContent(
                modArt.id,
                nextCycleNum,
                modArt.content
              );
              StateManager.updateArtifactMetadata(
                modArt.id,
                currentMeta.type,
                currentMeta.description,
                nextCycleNum
              );
              changesMade.push(`Modified: ${modArt.id}`);
              UI.displayCycleArtifact(
                "Modified Artifact",
                modArt.content,
                "output",
                true,
                critiqueSource,
                modArt.id,
                nextCycleNum
              );
            } catch (e) {
              errors.push(`Failed save mod ${modArt.id}: ${e.message}`);
              UI.displayCycleArtifact(
                "Save Mod Failed",
                e.message,
                "error",
                false,
                critiqueSource,
                modArt.id
              );
            }
          } else {
            UI.displayCycleArtifact(
              "Modified (No Change)",
              currentContent,
              "info",
              false,
              critiqueSource,
              modArt.id,
              currentMeta.latestCycle
            );
          }
          if (modArt.id === "target.diagram")
            UI.renderDiagramDisplay(nextCycleNum);
          if (modArt.id.startsWith("reploid.")) {
            logger.logEvent("warn", `Core artifact ${modArt.id} modified.`);
          }
        } else {
          errors.push(`Modify non-existent artifact: ${modArt.id}`);
          UI.displayCycleArtifact(
            "Modify Failed",
            `Artifact ${modArt.id} not found.`,
            "error",
            false,
            critiqueSource,
            modArt.id
          );
        }
      });
      (llmResp.new_artifacts || []).forEach((newArt) => {
        if (!newArt.id || !newArt.type || newArt.content === undefined) {
          errors.push(`Invalid new artifact: ID=${newArt.id || "?"}`);
          UI.displayCycleArtifact(
            "New Invalid",
            JSON.stringify(newArt),
            "error",
            false,
            critiqueSource
          );
          return;
        }
        const existingMeta = StateManager.getArtifactMetadata(newArt.id);
        if (existingMeta && existingMeta.latestCycle >= 0) {
          errors.push(`Create failed (ID exists): ${newArt.id}`);
          UI.displayCycleArtifact(
            "Create Failed (ID Exists)",
            newArt.content,
            "error",
            false,
            critiqueSource,
            newArt.id
          );
        } else {
          try {
            Storage.setArtifactContent(newArt.id, nextCycleNum, newArt.content);
            StateManager.updateArtifactMetadata(
              newArt.id,
              newArt.type,
              newArt.description || `New ${newArt.type}`,
              nextCycleNum
            );
            changesMade.push(`Created: ${newArt.id} (${newArt.type})`);
            UI.displayCycleArtifact(
              "New Artifact",
              newArt.content,
              "output",
              true,
              critiqueSource,
              newArt.id,
              nextCycleNum
            );
            if (newArt.id === "target.diagram")
              UI.renderDiagramDisplay(nextCycleNum);
          } catch (e) {
            errors.push(`Failed save new ${newArt.id}: ${e.message}`);
            UI.displayCycleArtifact(
              "Save New Failed",
              e.message,
              "error",
              false,
              critiqueSource,
              newArt.id
            );
          }
        }
      });
      (llmResp.deleted_artifacts || []).forEach((idToDelete) => {
        const meta = StateManager.getArtifactMetadata(idToDelete);
        if (meta && meta.latestCycle >= 0) {
          StateManager.deleteArtifactMetadata(idToDelete);
          changesMade.push(`Deleted: ${idToDelete}`);
          UI.displayCycleArtifact(
            "Deleted Artifact (Meta)",
            idToDelete,
            "output",
            true,
            critiqueSource
          );
          if (
            idToDelete === "target.diagram" &&
            uiRefs.diagramDisplayContainer
          ) {
            uiRefs.diagramDisplayContainer.classList.add("hidden");
          }
        } else {
          errors.push(`Delete non-existent: ${idToDelete}`);
          UI.displayCycleArtifact(
            "Delete Failed",
            `Artifact ${idToDelete} not found.`,
            "error",
            false,
            critiqueSource,
            idToDelete
          );
        }
      });
      if (llmResp.proposed_new_tool_declaration) {
        const decl = llmResp.proposed_new_tool_declaration;
        const impl = llmResp.generated_tool_implementation_js || "";
        UI.displayCycleArtifact(
          "Proposed Tool Decl",
          JSON.stringify(decl, null, 2),
          "output",
          true,
          critiqueSource
        );
        UI.displayCycleArtifact(
          "Generated Tool Impl",
          impl,
          "output",
          true,
          critiqueSource
        );
        if (decl.name && decl.description && decl.inputSchema && impl) {
          const existingIndex = dynamicToolDefinitions.findIndex(
            (t) => t.declaration.name === decl.name
          );
          const toolEntry = { declaration: decl, implementation: impl };
          let toolChangeType = "";
          if (existingIndex !== -1) {
            dynamicToolDefinitions[existingIndex] = toolEntry;
            toolChangeType = `Tool Updated: ${decl.name}`;
          } else {
            dynamicToolDefinitions.push(toolEntry);
            toolChangeType = `Tool Defined: ${decl.name}`;
          }
          globalState.dynamicTools = [...dynamicToolDefinitions];
          changesMade.push(toolChangeType);
          UI.logToTimeline(
            currentCycleNum,
            `[ARTIFACT] ${toolChangeType}`,
            "info",
            true
          );
        } else {
          errors.push(`Invalid tool definition/impl.`);
          UI.logToTimeline(
            currentCycleNum,
            `[APPLY ERR] Tool def/impl invalid.`,
            "error",
            true
          );
        }
      }
      if (llmResp.full_html_source) {
        globalState.lastGeneratedFullSource = llmResp.full_html_source;
        changesMade.push("Generated Full HTML (Sandbox)");
        UI.displayCycleArtifact(
          "Full HTML Source",
          "(Prepared for Sandbox)",
          "output",
          true,
          critiqueSource
        );
        UI.logToTimeline(
          currentCycleNum,
          `[APPLY] SELF-MOD generated. Sandbox required.`,
          "info",
          true
        );
        UI.showMetaSandbox(llmResp.full_html_source);
        return {
          success: errors.length === 0,
          changes: changesMade,
          errors: errors,
          nextCycle: currentCycleNum,
        };
      }
      const targetArtifactChanged = changesMade.some(
        (c) =>
          c.includes("target.head") ||
          c.includes("target.body") ||
          c.includes("target.style") ||
          c.includes("target.script") ||
          c.includes("target.diagram")
      );
      if (targetArtifactChanged && errors.length === 0) {
        UI.logToTimeline(
          currentCycleNum,
          `[APPLY] Applying target changes for Cycle ${nextCycleNum}. Rendering Preview.`,
          "info",
          true
        );
        UI.renderGeneratedUI(nextCycleNum);
      }
      UI.logToTimeline(
        currentCycleNum,
        `[APPLY] Changes saved for Cycle ${nextCycleNum} from ${critiqueSource}: ${
          changesMade.join(", ") || "None"
        }. Errors: ${errors.length}`,
        errors.length > 0 ? "warn" : "info",
        true
      );
      if (errors.length === 0) {
        globalState.totalCycles = nextCycleNum;
      }
      const confidence = llmResp.agent_confidence_score ?? 0.0;
      globalState.confidenceHistory.push(confidence);
      if (globalState.confidenceHistory.length > 20)
        globalState.confidenceHistory.shift();
      UI.updateMetricsDisplay();
      return {
        success: errors.length === 0,
        changes: changesMade,
        errors: errors,
        nextCycle: errors.length === 0 ? nextCycleNum : currentCycleNum,
      };
    },
    proceedAfterHumanIntervention: (
      feedbackType,
      feedbackData = "",
      skipCycleIncrement = false
    ) => {
      if (!globalState) return;
      const currentCycle = globalState.totalCycles;
      let nextCycle = currentCycle;
      let feedbackMsg = feedbackData;
      let applySuccess = true;
      if (feedbackType === "Human Code Edit") {
        const {
          artifactId,
          cycle,
          success,
          validatedContent,
          error,
          contentChanged,
        } = feedbackData;
        feedbackMsg = `Edited ${artifactId}: ${
          success
            ? contentChanged
              ? "Applied successfully."
              : "No changes detected."
            : `Validation Failed: ${error}`
        }`;
        if (success && contentChanged && artifactId !== "full_html_source") {
          nextCycle = currentCycle + 1;
          try {
            Storage.setArtifactContent(artifactId, nextCycle, validatedContent);
            const currentMeta = StateManager.getArtifactMetadata(artifactId);
            StateManager.updateArtifactMetadata(
              artifactId,
              currentMeta.type,
              currentMeta.description,
              nextCycle
            );
            UI.displayCycleArtifact(
              `Human Edit Applied`,
              validatedContent,
              "info",
              true,
              "Human",
              artifactId,
              nextCycle
            );
            logger.logEvent(
              "info",
              `Human edit applied to ${artifactId} for cycle ${nextCycle}`
            );
            UI.logToTimeline(
              currentCycle,
              `[HUMAN] Applied edit to ${artifactId} for cycle ${nextCycle}`,
              "info",
              true
            );
            if (artifactId.startsWith("target."))
              UI.renderGeneratedUI(nextCycle);
            if (artifactId === "target.diagram")
              UI.renderDiagramDisplay(nextCycle);
          } catch (e) {
            logger.logEvent(
              "error",
              `Failed saving human edit for ${artifactId}: ${e.message}`
            );
            UI.showNotification(`Failed saving edit: ${e.message}`, "error");
            applySuccess = false;
            nextCycle = currentCycle;
          }
        } else if (
          artifactId === "full_html_source" &&
          success &&
          contentChanged
        ) {
          logger.logEvent("warn", "Full source edited via HITL.");
          globalState.lastGeneratedFullSource = validatedContent;
          applySuccess = true;
          skipCycleIncrement = true; // Apply immediately via sandbox approval later
        } else if (!success) {
          applySuccess = false;
        }
      } else if (feedbackType === "Human Options") {
        feedbackMsg = `Selected: ${feedbackData}`;
      }
      globalState.lastFeedback = `${feedbackType}: ${Utils.trunc(
        feedbackMsg,
        150
      )}`;
      globalState.critiqueFailHistory.push(
        !applySuccess ||
          feedbackType.includes("Fail") ||
          feedbackType.includes("Discarded")
      );
      if (globalState.critiqueFailHistory.length > 20)
        globalState.critiqueFailHistory.shift();
      if (feedbackType.startsWith("Human") && !skipCycleIncrement) {
        globalState.humanInterventions++;
      }
      if (applySuccess && !skipCycleIncrement) {
        if (nextCycle === currentCycle) {
          nextCycle = currentCycle + 1;
        }
        globalState.totalCycles = nextCycle;
      } else {
        nextCycle = globalState.totalCycles;
      }
      const summaryOutcome =
        !applySuccess ||
        feedbackType.includes("Fail") ||
        feedbackType.includes("Discarded")
          ? `Failed (${feedbackType})`
          : `OK (${feedbackType})`;
      UI.summarizeCompletedCycleLog(lastCycleLogItem, summaryOutcome);
      lastCycleLogItem = null;
      UI.logToTimeline(
        currentCycle,
        `[STATE] ${feedbackType} processed. Feedback: "${Utils.trunc(
          feedbackMsg,
          70
        )}..." Next Cycle: ${globalState.totalCycles}`,
        "info"
      );
      UI.hideHumanInterventionUI();
      globalState.personaMode =
        globalState.cfg.personaBalance < 50 ? "XYZ" : "LSD";
      globalState.retryCount = 0;
      UI.updateStateDisplay();
      UI.clearCurrentCycleDetails();
      UI.logToTimeline(globalState.totalCycles, `[STATE] Ready.`);
      if (uiRefs.goalInput) uiRefs.goalInput.value = "";
      if (uiRefs.runCycleButton) {
        uiRefs.runCycleButton.textContent = "Run Cycle";
        uiRefs.runCycleButton.disabled = false;
      }
      UI.updateStatus("Idle");
      UI.highlightCoreStep(-1);
      StateManager.save();
    },
    saveHtmlToHistory: (htmlContent) => {
      if (!globalState) return;
      const limit = globalState.cfg?.htmlHistoryLimit ?? 5;
      if (!globalState.htmlHistory) globalState.htmlHistory = [];
      globalState.htmlHistory.push(htmlContent);
      while (globalState.htmlHistory.length > limit) {
        globalState.htmlHistory.shift();
      }
      UI.updateHtmlHistoryControls();
      logger.logEvent(
        "info",
        `Saved HTML state. History: ${globalState.htmlHistory.length}`
      );
    },
    handleSummarizeContext: async () => {
      if (!globalState || !globalState.apiKey) {
        UI.showNotification("API Key required.", "warn");
        return;
      }
      UI.updateStatus("Summarizing context...", true);
      const currentCycle = globalState.totalCycles;
      const nextCycle = currentCycle + 1;
      UI.logToTimeline(
        currentCycle,
        "[CTX] Running summarization...",
        "info",
        true
      );
      UI.clearCurrentCycleDetails();
      try {
        const stateSummary = {
          totalCycles: globalState.totalCycles,
          agentIterations: globalState.agentIterations,
          humanInterventions: globalState.humanInterventions,
          failCount: globalState.failCount,
          currentGoal: {
            seed: Utils.trunc(globalState.currentGoal.seed, 200),
            cumulative: Utils.trunc(globalState.currentGoal.cumulative, 500),
            latestType: globalState.currentGoal.latestType,
          },
          lastCritiqueType: globalState.lastCritiqueType,
          lastFeedback: Utils.trunc(globalState.lastFeedback, 200),
          avgConfidence: globalState.avgConfidence?.toFixed(2),
          critiqueFailRate: globalState.critiqueFailRate?.toFixed(1),
          dynamicTools: dynamicToolDefinitions.map((t) => t.declaration.name),
          artifactOverview: Object.values(StateManager.getAllArtifactMetadata())
            .map((a) => `${a.id}(${a.type},C${a.latestCycle})`)
            .join(", "),
        };
        const summaryText = await CycleLogic.runSummarization(
          globalState.apiKey,
          stateSummary,
          currentCycle
        );
        Storage.setArtifactContent(
          "meta.summary_context",
          nextCycle,
          summaryText
        );
        StateManager.updateArtifactMetadata(
          "meta.summary_context",
          "TEXT",
          "Last Context Summary",
          nextCycle
        );
        globalState.currentGoal.summaryContext = summaryText;
        globalState.contextTokenEstimate =
          Math.round((summaryText.length / 4) * 1.1) + 500;
        globalState.lastFeedback = `Context summarized at Cycle ${currentCycle}.`;
        globalState.lastCritiqueType = "Context Summary";
        globalState.totalCycles = nextCycle;
        UI.logToTimeline(
          currentCycle,
          `[CTX] Summarized. Saved as meta.summary_context_${nextCycle}. Est. tokens: ${globalState.contextTokenEstimate.toLocaleString()}.`,
          "info"
        );
        UI.displayCycleArtifact(
          "Generated Context Summary",
          summaryText,
          "output",
          true,
          "System",
          "meta.summary_context",
          nextCycle
        );
        UI.showNotification("Context summarized.", "info");
      } catch (error) {
        logger.logEvent("error", `Summarization failed: ${error.message}`);
        UI.showNotification(`Summarization failed: ${error.message}`, "error");
        UI.logToTimeline(
          currentCycle,
          `[CTX ERR] Summarization failed: ${error.message}`,
          "error"
        );
      } finally {
        UI.updateStateDisplay();
        UI.updateStatus("Idle");
        StateManager.save();
      }
    },
    executeCycle: async () => {
      if (CycleLogic._isRunning) {
        UI.showNotification("Cycle already running.", "warn");
        return;
      }
      CycleLogic._isRunning = true;
      if (uiRefs.runCycleButton) {
        uiRefs.runCycleButton.textContent = "Abort Cycle";
        uiRefs.runCycleButton.disabled = false;
      } // Enable abort

      try {
        if (!globalState) {
          UI.showNotification("State not initialized!", "error");
          return;
        }
        if (metaSandboxPending) {
          UI.showNotification("Meta Sandbox pending.", "warn");
          return;
        }
        if (!uiRefs.humanInterventionSection?.classList.contains("hidden")) {
          UI.showNotification("Human Intervention required.", "warn");
          return;
        }
        if (lastCycleLogItem)
          UI.summarizeCompletedCycleLog(lastCycleLogItem, "Interrupted");
        UI.clearCurrentCycleDetails();
        currentLlmResponse = null;
        globalState.apiKey = uiRefs.apiKeyInput.value.trim();
        if (!globalState.apiKey || globalState.apiKey.length < 10) {
          UI.showNotification("Valid Gemini API Key required.", "warn");
          return;
        }
        UI.logCoreLoopStep(globalState.totalCycles, 0, "Define Goal");
        const goalText = uiRefs.goalInput.value.trim();
        const goalTypeElement = document.querySelector(
          'input[name="goalType"]:checked'
        );
        const goalType = goalTypeElement ? goalTypeElement.value : "System";
        if (!goalText && !globalState.currentGoal.seed) {
          UI.showNotification("Initial Goal required.", "warn");
          return;
        }
        const maxC = globalState.cfg.maxCycles || 0;
        if (maxC > 0 && globalState.totalCycles >= maxC) {
          UI.showNotification(`Max cycles (${maxC}) reached.`, "info");
          if (uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = true;
          return;
        }
        if (globalState.contextTokenEstimate >= CTX_WARN_THRESH) {
          UI.showNotification(
            "Context tokens high. Consider summarizing.",
            "warn"
          );
        }
        const currentCycle = globalState.totalCycles;
        const newGoalProvided = !!goalText;
        if (newGoalProvided) {
          if (!globalState.currentGoal.seed) {
            globalState.currentGoal.seed = goalText;
            globalState.currentGoal.cumulative = goalText;
            globalState.currentGoal.latestType = goalType;
          } else {
            globalState.currentGoal.cumulative += `\n\n[Cycle ${currentCycle} Refinement (${goalType})]: ${goalText}`;
            globalState.currentGoal.latestType = goalType;
          }
          UI.displayCycleArtifact(
            "New Goal Input",
            `${goalType}: ${goalText}`,
            "input",
            false,
            "User",
            "goal.input",
            currentCycle
          );
        } else if (!globalState.currentGoal.seed) {
          UI.showNotification("No goal provided.", "error");
          return;
        }
        const goalInfo = CycleLogic.getActiveGoalInfo();
        globalState.retryCount = 0;
        if (uiRefs.currentCycleNumber)
          uiRefs.currentCycleNumber.textContent = currentCycle;
        UI.updateStatus("Starting Cycle...", true);
        UI.updateStateDisplay();
        lastCycleLogItem = UI.logToTimeline(
          currentCycle,
          `[CYCLE] === Cycle ${currentCycle} Start === Latest Goal Type: ${goalInfo.type}`
        );
        UI.logToTimeline(
          currentCycle,
          `[GOAL] Latest: "${Utils.trunc(goalInfo.latestGoal, 70)}..."`,
          "info",
          true
        );
        UI.displayCycleArtifact(
          "Cumulative Goal",
          goalInfo.cumulativeGoal,
          "input",
          false,
          "System",
          "goal.cumulative",
          currentCycle
        );
        UI.renderDiagramDisplay(currentCycle);

        let iterationResult = null;
        let successfulIteration = false;
        do {
          UI.logToTimeline(
            currentCycle,
            `[STATE] Agent Iteration Attempt (Retry: ${globalState.retryCount})`,
            "info",
            true
          );
          iterationResult = await CycleLogic.runCoreIteration(
            globalState.apiKey,
            goalInfo,
            currentCycle
          );
          if (iterationResult.error || !iterationResult.response) {
            logger.logEvent(
              "error",
              `Iteration attempt failed: ${
                iterationResult.error || "No response"
              }`
            );
            globalState.retryCount++;
            if (globalState.retryCount > globalState.cfg.maxRetries) {
              UI.logToTimeline(
                currentCycle,
                `[RETRY] Max retries exceeded. Forcing HITL.`,
                "error"
              );
              globalState.failCount++;
              UI.updateMetricsDisplay();
              UI.showHumanInterventionUI(
                "prompt",
                `Cycle failed after ${globalState.retryCount} attempts: ${
                  iterationResult.error || "Unknown"
                }`
              );
              StateManager.save();
              return;
            } else {
              UI.logToTimeline(
                currentCycle,
                `[RETRY] Attempting retry ${globalState.retryCount}/${globalState.cfg.maxRetries}...`,
                "warn",
                true
              );
              globalState.lastFeedback = `Retry ${globalState.retryCount}: ${
                Utils.trunc(iterationResult.error, 100) || "No response"
              }`;
              await new Promise((r) =>
                setTimeout(r, 1000 * globalState.retryCount)
              );
            }
          } else {
            successfulIteration = true;
            globalState.retryCount = 0;
            UI.logToTimeline(
              currentCycle,
              `[STATE] Agent Iteration successful.`,
              "info",
              true
            );
          }
        } while (!successfulIteration);

        currentLlmResponse = iterationResult.response;
        UI.displayCycleArtifact(
          "Agent Deliberation",
          currentLlmResponse.persona_analysis_musing || "(N/A)",
          "info",
          false,
          "LLM",
          "llm.musing",
          currentCycle
        );
        UI.displayCycleArtifact(
          "Proposed Changes",
          currentLlmResponse.proposed_changes_description || "(N/A)",
          "info",
          false,
          "LLM",
          "llm.proposal",
          currentCycle
        );
        UI.displayCycleArtifact(
          "Agent Justification",
          currentLlmResponse.justification_persona_musing || "(N/A)",
          "info",
          false,
          "LLM",
          "llm.justification",
          currentCycle
        );
        UI.displayCycleArtifact(
          "Agent Confidence",
          currentLlmResponse.agent_confidence_score?.toFixed(3) || "(N/A)",
          "info",
          false,
          "LLM",
          "llm.confidence",
          currentCycle
        );

        UI.logCoreLoopStep(currentCycle, 4, "Critique Trigger Check");
        const { cycleTimeMillis } = iterationResult;
        const cycleSecs = cycleTimeMillis / 1000;
        const confidence = currentLlmResponse.agent_confidence_score ?? 0.0;
        const pauseThresh = globalState.cfg.pauseAfterCycles || 0;
        const confThresh = globalState.cfg.autoCritiqueThresh ?? 0.75;
        const humanProb = (globalState.cfg.humanReviewProb ?? 50) / 100.0;
        const llmProb = (globalState.cfg.llmCritiqueProb ?? 50) / 100.0;
        const maxTime = globalState.cfg.maxCycleTime ?? 600;
        let humanNeeded = false;
        let critReason = "";
        let hitlModePref = "prompt";
        if (globalState.forceHumanReview) {
          humanNeeded = true;
          critReason = "Forced Review";
          globalState.forceHumanReview = false;
        } else if (
          pauseThresh > 0 &&
          currentCycle > 0 &&
          currentCycle % pauseThresh === 0
        ) {
          humanNeeded = true;
          critReason = `Auto Pause (${currentCycle}/${pauseThresh})`;
        } else if (Math.random() < humanProb) {
          humanNeeded = true;
          critReason = `Random Review (${(humanProb * 100).toFixed(0)}%)`;
          hitlModePref = "code_edit";
        } else if (cycleSecs > maxTime) {
          humanNeeded = true;
          critReason = `Time Limit (${cycleSecs.toFixed(1)}s > ${maxTime}s)`;
        } else if (confidence < confThresh) {
          humanNeeded = true;
          critReason = `Low Confidence (${confidence.toFixed(
            2
          )} < ${confThresh})`;
        }
        UI.logToTimeline(
          currentCycle,
          `[DECIDE] Time:${cycleSecs.toFixed(1)}s, Conf:${confidence.toFixed(
            2
          )}. Human: ${humanNeeded ? critReason : "No"}.`,
          "info",
          true
        );

        let critiquePassed = false;
        let critiqueReport = "Critique Skipped";
        let applySource = "Skipped";
        if (humanNeeded) {
          critiquePassed = false;
          critiqueReport = `Human Intervention: ${critReason}`;
          applySource = "Human";
          globalState.lastCritiqueType = `Human (${critReason})`;
          globalState.critiqueFailHistory.push(false);
          UI.updateMetricsDisplay();
          UI.logCoreLoopStep(
            currentCycle,
            5,
            `Critique: Human Intervention (${critReason})`
          );
          UI.updateStatus(`Paused: Human Review (${critReason})`);
          const firstModifiedId =
            currentLlmResponse.modified_artifacts?.[0]?.id;
          const firstNewId = currentLlmResponse.new_artifacts?.[0]?.id;
          const artifactToEdit =
            firstModifiedId ||
            firstNewId ||
            (currentLlmResponse.full_html_source ? "full_html_source" : null);
          UI.showHumanInterventionUI(
            hitlModePref,
            critReason,
            [],
            artifactToEdit
          );
          StateManager.save();
          return;
        } else if (Math.random() < llmProb) {
          UI.logToTimeline(
            currentCycle,
            `[DECIDE] Triggering Auto Critique (${(llmProb * 100).toFixed(
              0
            )}%).`,
            "info",
            true
          );
          UI.logCoreLoopStep(currentCycle, 5, "Critique: Auto");
          const critiqueResult = await CycleLogic.runAutoCritique(
            globalState.apiKey,
            currentLlmResponse,
            goalInfo,
            currentCycle
          );
          critiquePassed = critiqueResult.critique_passed;
          critiqueReport = critiqueResult.critique_report;
          applySource = `AutoCrit ${critiquePassed ? "Pass" : "Fail"}`;
          globalState.lastCritiqueType = `Automated (${
            critiquePassed ? "Pass" : "Fail"
          })`;
          globalState.critiqueFailHistory.push(!critiquePassed);
          UI.updateMetricsDisplay();
          UI.logToTimeline(
            currentCycle,
            `[CRITIQUE] AutoCrit Result: ${
              critiquePassed ? "Pass" : "Fail"
            }. Report: ${Utils.trunc(critiqueReport, 100)}...`,
            critiquePassed ? "info" : "error",
            true
          );
          UI.displayCycleArtifact(
            "Auto Critique Report",
            critiqueReport,
            critiquePassed ? "info" : "error",
            false,
            "LLM",
            "critique.report",
            currentCycle
          );
          if (!critiquePassed) {
            UI.logToTimeline(
              currentCycle,
              `[STATE] Auto-Critique failed. Forcing HITL.`,
              "warn",
              true
            );
            globalState.failCount++;
            UI.updateMetricsDisplay();
            UI.showHumanInterventionUI(
              "prompt",
              `Auto Critique Failed: ${Utils.trunc(critiqueReport, 150)}...`
            );
            StateManager.save();
            return;
          }
        } else {
          critiquePassed = true;
          applySource = "Skipped";
          globalState.lastCritiqueType = "Skipped";
          globalState.critiqueFailHistory.push(false);
          UI.updateMetricsDisplay();
          UI.logCoreLoopStep(currentCycle, 5, "Critique: Skipped");
          UI.logToTimeline(
            currentCycle,
            `[DECIDE] Critique Skipped (Below threshold). Applying.`,
            "info",
            true
          );
        }

        if (critiquePassed) {
          UI.updateStatus("Applying Changes...", true);
          UI.logCoreLoopStep(currentCycle, 6, "Refine & Apply");
          const applyResult = CycleLogic.applyLLMChanges(
            currentLlmResponse,
            currentCycle,
            applySource
          );
          if (metaSandboxPending) {
            globalState.lastCritiqueType = `${applySource} (Sandbox Pending)`;
            UI.updateStateDisplay();
            UI.updateStatus("Awaiting Meta Sandbox Approval...");
            UI.highlightCoreStep(6);
            StateManager.save();
            return;
          }
          if (applyResult.success) {
            globalState.agentIterations++;
            globalState.lastFeedback = `${applySource}, applied successfully for Cycle ${applyResult.nextCycle}.`;
          } else {
            globalState.lastFeedback = `${applySource}, apply failed: ${applyResult.errors.join(
              ", "
            )}`;
            globalState.failCount++;
            UI.updateMetricsDisplay();
            UI.logToTimeline(
              currentCycle,
              `[APPLY ERR] Failed apply: ${applyResult.errors.join(
                ", "
              )}. Forcing HITL.`,
              "error"
            );
            UI.showHumanInterventionUI(
              "prompt",
              `Failed apply after critique: ${applyResult.errors.join(", ")}`
            );
            StateManager.save();
            return;
          }
          const summaryOutcome = applyResult.success
            ? `OK (${globalState.lastCritiqueType})`
            : `Failed (Apply Fail after ${globalState.lastCritiqueType})`;
          UI.summarizeCompletedCycleLog(lastCycleLogItem, summaryOutcome);
          lastCycleLogItem = null;
          UI.updateStateDisplay();
          UI.clearCurrentCycleDetails();
          UI.logCoreLoopStep(applyResult.nextCycle - 1, 7, "Repeat/Pause");
          UI.logToTimeline(
            globalState.totalCycles,
            `[STATE] Cycle ended (${globalState.lastCritiqueType}). Ready.`
          );
          if (uiRefs.goalInput) uiRefs.goalInput.value = "";
        } else {
          logger.logEvent(
            "error",
            "Reached end of cycle unexpectedly after critique check."
          );
          UI.updateStatus("Error", false, true);
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          logger.logEvent("error", `Unhandled cycle error: ${error.message}`);
          UI.showNotification(`Cycle Error: ${error.message}`, "error");
          UI.logToTimeline(
            globalState.totalCycles || 0,
            `[CYCLE FATAL] ${error.message}`,
            "error"
          );
          UI.updateStatus("Cycle Failed", false, true);
        } else {
          UI.logToTimeline(
            globalState.totalCycles || 0,
            `[CYCLE] Cycle aborted by user.`,
            "warn"
          );
          UI.updateStatus("Aborted");
        }
      } finally {
        CycleLogic._isRunning = false;
        if (uiRefs.runCycleButton) {
          uiRefs.runCycleButton.textContent = "Run Cycle";
          uiRefs.runCycleButton.disabled =
            metaSandboxPending ||
            !uiRefs.humanInterventionSection?.classList.contains("hidden");
        }
        if (
          !CycleLogic._isRunning &&
          !metaSandboxPending &&
          uiRefs.humanInterventionSection?.classList.contains("hidden")
        ) {
          UI.updateStatus("Idle");
        }
        StateManager.save();
      }
    },
  };

  const initialize = () => {
    try {
      initializeCoreDependencies();
    } catch (depError) {
      console.error("FATAL: Core dependency initialization failed.", depError);
      const body = document.body;
      if (body) {
        body.innerHTML = `<div style="color:red; padding: 20px; font-family: monospace;"><h1>FATAL ERROR</h1><p>Could not load core REPLOID dependencies (Utils/Storage/ToolRunner). Check console.</p><p>Ensure core artifacts exist in localStorage (Cycle 0) and are correctly formatted.</p></div>`;
      }
      return;
    }

    logger.logEvent("info", `Initializing x0 Engine v${Utils.STATE_VERSION}`);
    UI.updateStatus("Initializing...");
    const loadedExistingState = StateManager.init();
    const restoredFromSession = StateManager.restoreStateFromSession();
    if (!restoredFromSession) {
      UI.initializeUIElementReferences();
      if (loadedExistingState) {
        logger.logEvent("info", "Loaded existing state.");
        UI.logToTimeline(
          globalState.totalCycles,
          "[STATE] System Initialized (Loaded Session)."
        );
      } else {
        logger.logEvent("info", "Initialized new default state.");
        UI.logToTimeline(0, "[STATE] System Initialized (New Session).");
      }
      UI.updateStateDisplay();
      UI.renderGeneratedUI(globalState.totalCycles);
      UI.displayGenesisState();
      UI.loadPromptsFromLS();
      UI.loadCoreLoopSteps();
    }
    UI.populateModelSelectors();
    UI.setupEventListeners();
    UI.highlightCoreStep(-1);
    UI.updateStatus("Idle");
    document
      .querySelectorAll("fieldset")
      .forEach((fs) => fs.classList.add("collapsed"));
    Utils.$id("controls-fieldset")?.classList.remove("collapsed");
    Utils.$id("current-cycle-details")?.classList.remove("collapsed");
    UI.updateFieldsetSummaries();
    logger.logEvent("info", "Initialization complete.");
  };

  return { initialize };
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", REPLOID_CORE.initialize);
} else {
  REPLOID_CORE.initialize();
}
