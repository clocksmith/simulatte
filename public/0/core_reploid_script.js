const REPLOID_CORE = (() => {
  // --- Dependencies ---
  // Assumes window.Utils and window.Storage are loaded
  const Utils = window.Utils;
  const Storage = window.Storage;
  const logger = Utils.logger; // Convenience reference

  if (!Utils || !Storage || !logger) {
    console.error("FATAL: Core dependencies (Utils/Storage/Logger) not found!");
    // Prevent further execution
    return {
      initialize: () => console.error("REPLOID_CORE cannot initialize."),
    };
  }

  const CTX_WARN_THRESH = 925000;
  const SVG_NS = "http://www.w3.org/2000/svg";

  // --- Core State Variables ---
  // Kept within the IIFE scope for encapsulation by StateManager/CycleLogic
  let globalState = null;
  let uiRefs = {}; // Remains UI specific, managed by UI module
  let currentLlmResponse = null; // CycleLogic managed
  let metaSandboxPending = false; // CycleLogic/UI managed
  let activeCoreStepIdx = -1; // UI managed
  let dynamicToolDefinitions = []; // StateManager managed
  let artifactMetadata = {}; // StateManager managed
  let lastCycleLogItem = null; // CycleLogic/UI managed

  // --- Configuration ---
  // TODO: Consider moving API Keys/Project ID out of source code (e.g., env vars, config file)
  const APP_CONFIG = {
    API_KEY: "<nope>", // Replace with actual key or method to get it securely
    PROJECT_ID: "<nope>",
    BASE_GEMINI_MODEL: "gemini-1.5-flash-latest", // Updated model name
    ADVANCED_GEMINI_MODEL: "gemini-1.5-pro-latest", // Updated model name
  };

  // --- Static Tool Definitions (Data, not logic) ---
  // ToolRunner will receive this
  const staticTools = [
    {
      name: "code_linter",
      description: "Analyzes code snippet syntax.",
      params: {
        type: "OBJECT",
        properties: {
          code: { type: "STRING" },
          language: {
            type: "STRING",
            enum: ["javascript", "css", "html", "json"],
          },
        },
        required: ["code", "language"],
      },
    },
    {
      name: "json_validator",
      description: "Validates JSON string structure.",
      params: {
        type: "OBJECT",
        properties: { json_string: { type: "STRING" } },
        required: ["json_string"],
      },
    },
    {
      name: "diagram_schema_validator",
      description: "Validates diagram JSON schema.",
      params: {
        type: "OBJECT",
        properties: { diagram_json: { type: "OBJECT" } },
        required: ["diagram_json"],
      },
    },
    {
      name: "svg_diagram_renderer",
      description:
        "Generates SVG markup string for diagram JSON. (Note: Decoupled - currently placeholder)",
      params: {
        type: "OBJECT",
        properties: { diagram_json: { type: "OBJECT" } },
        required: ["diagram_json"],
      },
    },
    {
      name: "token_counter",
      description: "Estimates token count for text.",
      params: {
        type: "OBJECT",
        properties: { text: { type: "STRING" } },
        required: ["text"],
      },
    },
    {
      name: "self_correction",
      description: "Attempts self-correction based on error.",
      params: {
        type: "OBJECT",
        properties: {
          failed_task_description: { type: "STRING" },
          error_message: { type: "STRING" },
          previous_goal: { type: "OBJECT" },
        },
        required: ["failed_task_description", "error_message", "previous_goal"],
      },
    },
  ];

  // --- StateManager Module ---
  const StateManager = {
    // getDefaultState remains mostly the same, using Utils.STATE_VERSION
    getDefaultState: () => ({
      version: Utils.STATE_VERSION,
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
      apiKey:
        APP_CONFIG.API_KEY && APP_CONFIG.API_KEY !== "<nope>"
          ? APP_CONFIG.API_KEY
          : "",
      confidenceHistory: [],
      critiqueFailHistory: [],
      tokenHistory: [],
      failHistory: [],
      avgConfidence: null,
      critiqueFailRate: null,
      avgTokens: null,
      contextTokenEstimate: 0,
      lastGeneratedFullSource: null, // Keep track of this specific state
      htmlHistory: [],
      lastApiResponse: null, // Still useful for debugging? Keep internal to StateManager?
      partialOutput: null, // Managed by CycleLogic during API calls now
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
      artifactMetadata: {}, // Managed here
      dynamicTools: [], // Managed here
    }),

    init: () => {
      // Uses Storage module
      const savedState = Storage.getState();
      if (
        savedState &&
        savedState.version?.split(".")[0] === Utils.STATE_VERSION.split(".")[0]
      ) {
        // Merge carefully, ensuring cfg defaults apply if missing in saved state
        const defaultState = StateManager.getDefaultState();
        globalState = {
          ...defaultState,
          ...savedState,
          cfg: { ...defaultState.cfg, ...(savedState.cfg || {}) }, // Ensure cfg structure
        };
        globalState.version = Utils.STATE_VERSION; // Always update to current version
        // Restore managed state variables
        dynamicToolDefinitions = globalState.dynamicTools || [];
        artifactMetadata = globalState.artifactMetadata || {};
        // Ensure globalState reflects the restored values
        globalState.dynamicTools = dynamicToolDefinitions;
        globalState.artifactMetadata = artifactMetadata;

        logger.logEvent(
          "info",
          `Loaded state from localStorage for cycle ${globalState.totalCycles}`
        );
        return true; // Indicates existing state loaded
      } else {
        if (savedState) {
          logger.logEvent(
            "warn",
            `Ignoring incompatible localStorage state (v${savedState.version})`
          );
          Storage.removeState(); // Use Storage module
        }
        globalState = StateManager.getDefaultState();
        // Initialize managed variables from default state
        // Set default artifact metadata (IDs are now fixed strings)
        artifactMetadata = {
          "reploid.style.main": {
            id: "reploid.style.main",
            type: "CSS_STYLESHEET",
            description: "REPLOID UI Styles",
            latestCycle: 0,
          },
          "reploid.body.main": {
            id: "reploid.body.main",
            type: "HTML_BODY",
            description: "REPLOID UI Body Structure",
            latestCycle: 0,
          },
          "reploid.script.core": {
            id: "reploid.script.core",
            type: "JAVASCRIPT_SNIPPET",
            description: "REPLOID Core Logic",
            latestCycle: 0,
          },
          "reploid.prompt.core": {
            id: "reploid.prompt.core",
            type: "PROMPT",
            description: "Core Logic/Meta Prompt",
            latestCycle: 0,
          },
          "reploid.prompt.critique": {
            id: "reploid.prompt.critique",
            type: "PROMPT",
            description: "Automated Critique Prompt",
            latestCycle: 0,
          },
          "reploid.prompt.summarize": {
            id: "reploid.prompt.summarize",
            type: "PROMPT",
            description: "Context Summarization Prompt",
            latestCycle: 0,
          },
          "reploid.core_steps": {
            id: "reploid.core_steps",
            type: "TEXT",
            description: "Core Loop Steps List",
            latestCycle: 0,
          },
          "target.head": {
            id: "target.head",
            type: "HTML_HEAD",
            description: "Target UI Head",
            latestCycle: 0,
          },
          "target.body": {
            id: "target.body",
            type: "HTML_BODY",
            description: "Target UI Body",
            latestCycle: 0,
          },
          "target.style.main": {
            id: "target.style.main",
            type: "CSS_STYLESHEET",
            description: "Target UI Styles",
            latestCycle: 0,
          },
          "target.script.main": {
            id: "target.script.main",
            type: "JAVASCRIPT_SNIPPET",
            description: "Target UI Script",
            latestCycle: 0,
          },
          "target.diagram": {
            id: "target.diagram",
            type: "DIAGRAM_JSON",
            description: "Target UI Structure Diagram",
            latestCycle: 0,
          },
          "meta.summary_context": {
            id: "meta.summary_context",
            type: "TEXT",
            description: "Last Auto-Generated Context Summary",
            latestCycle: 0,
          },
        };
        globalState.artifactMetadata = artifactMetadata;
        dynamicToolDefinitions = globalState.dynamicTools || []; // Should be [] from default
        StateManager.save(); // Save the newly initialized state
        logger.logEvent("info", "Initialized new default state.");
        return false; // Indicates new state created
      }
    },

    getState: () => globalState,
    // Use sparingly from outside, prefer specific methods
    setState: (newState) => {
      globalState = newState;
    },

    save: () => {
      if (!globalState) return;
      try {
        // Create a clean copy for saving, excluding potentially large/circular refs
        const stateToSave = JSON.parse(
          JSON.stringify({
            ...globalState,
            lastApiResponse: null, // Don't save large API responses
            // partialOutput is no longer in globalState
          })
        );
        Storage.saveState(stateToSave); // Use Storage module
        logger.logEvent(
          "debug",
          `Saved non-artifact state for cycle ${globalState.totalCycles}`
        );
      } catch (e) {
        logger.logEvent(
          "error",
          `Failed to save non-artifact state: ${e.message}`
        );
        UI.showNotification(`Failed to save state: ${e.message}`, "error"); // UI call remains here for now
      }
    },

    // --- Artifact Metadata Management ---
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
      if (globalState) globalState.artifactMetadata = artifactMetadata; // Keep state consistent
      // No direct save here, saving happens explicitly via StateManager.save()
    },
    deleteArtifactMetadata: (id) => {
      delete artifactMetadata[id];
      if (globalState) globalState.artifactMetadata = artifactMetadata;
    },
    getAllArtifactMetadata: () => ({ ...artifactMetadata }), // Return a copy

    // --- State Capture/Restore/Export/Import ---
    // These methods now use Utils.logger and the Storage module

    capturePreservationState: () => {
      const stateToSave = JSON.parse(
        JSON.stringify({ ...globalState, lastApiResponse: null })
      );
      // Capture other volatile state needed for session restore
      stateToSave.logBuffer = Utils.logger.getLogBuffer(); // Use Utils.logger
      stateToSave.timelineHTML = uiRefs.timelineLog
        ? uiRefs.timelineLog.innerHTML
        : ""; // UI interaction
      stateToSave.dynamicToolDefinitions = dynamicToolDefinitions; // Managed variable
      stateToSave.artifactMetadata = artifactMetadata; // Managed variable
      stateToSave.metaSandboxPending = metaSandboxPending; // Managed variable
      return stateToSave;
    },

    restoreStateFromSession: () => {
      const preservedData = Storage.getSessionState(); // Use Storage module
      if (!preservedData) return false;
      logger.logEvent("info", "Preserved session state found.");
      try {
        if (
          preservedData.version?.split(".")[0] !==
          Utils.STATE_VERSION.split(".")[0]
        ) {
          logger.logEvent(
            "warn",
            `Restoring older session state v${preservedData.version}. May have issues.`
          );
        }

        // Merge carefully, similar to init()
        const defaultState = StateManager.getDefaultState();
        globalState = {
          ...defaultState,
          ...preservedData,
          cfg: { ...defaultState.cfg, ...(preservedData.cfg || {}) },
        };
        globalState.version = Utils.STATE_VERSION; // Update version

        // Restore managed variables
        Utils.logger.setLogBuffer(
          preservedData.logBuffer ||
            `Restored Log ${new Date().toISOString()}\n===\n`
        );
        dynamicToolDefinitions = preservedData.dynamicTools || [];
        artifactMetadata = preservedData.artifactMetadata || {};
        metaSandboxPending = preservedData.metaSandboxPending || false;

        // Ensure globalState reflects the restored managed variables
        globalState.dynamicTools = dynamicToolDefinitions;
        globalState.artifactMetadata = artifactMetadata;

        // Restore UI - UI calls remain tightly coupled here
        UI.initializeUIElementReferences(); // Needs to happen after state load potentially
        if (uiRefs.timelineLog)
          uiRefs.timelineLog.innerHTML = preservedData.timelineHTML || "";
        UI.updateStateDisplay();
        UI.renderDiagramDisplay(globalState.totalCycles);
        UI.renderGeneratedUI(globalState.totalCycles);
        UI.displayGenesisState();
        UI.loadPromptsFromLS();
        UI.loadCoreLoopSteps();

        logger.logEvent(
          "info",
          "Session state restored after self-modification."
        );
        UI.logToTimeline(
          globalState.totalCycles,
          "[STATE] Restored after self-modification.",
          "info"
        );
        if (uiRefs.runCycleButton)
          uiRefs.runCycleButton.disabled = metaSandboxPending;
        if (uiRefs.runCycleButton)
          uiRefs.runCycleButton.textContent = "Run Cycle";
        UI.updateStatus(
          metaSandboxPending ? "Awaiting Meta Sandbox Approval..." : "Idle"
        );

        // Save the restored state to localStorage
        StateManager.save();
        return true;
      } catch (e) {
        logger.logEvent(
          "error",
          `Restore from session storage failed: ${e.message}`
        );
        UI.showNotification(
          `Restore failed: ${e.message}. Reinitializing state.`,
          "error"
        );
        StateManager.init(); // Re-initialize fully
        UI.initializeUIElementReferences(); // Re-init UI refs
        UI.logToTimeline(0, "[STATE] Restore failed. Reinitialized.", "error");
        UI.updateStatus("Restore Failed", false, true);
        return false; // Indicate failure
      } finally {
        Storage.removeSessionState(); // Always clear session state after attempt
        logger.logEvent(
          "info",
          "Cleared preserved state from session storage."
        );
      }
    },

    exportState: () => {
      try {
        // Use capturePreservationState to get all necessary data
        const stateData = StateManager.capturePreservationState();
        const fileName = `x0_state_${Utils.STATE_VERSION}_${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}.json`;
        const dataStr = JSON.stringify(stateData, null, 2);
        logger.logEvent("info", "State export initiated.");

        // Browser download logic remains
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
          "[STATE] State exported successfully.",
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
              `State version mismatch (Imported: ${importedData.version}, Current: ${Utils.STATE_VERSION}). Proceeding with caution.`
            );
          }

          // Reset and load state, similar to restoreStateFromSession
          const defaultState = StateManager.getDefaultState();
          globalState = {
            ...defaultState,
            ...importedData,
            cfg: { ...defaultState.cfg, ...(importedData.cfg || {}) },
          };
          globalState.version = Utils.STATE_VERSION; // Set to current version

          // Restore managed variables
          Utils.logger.setLogBuffer(
            importedData.logBuffer || Utils.logger.getLogBuffer()
          ); // Keep current log if import lacks one
          currentLlmResponse = null; // Reset volatile state
          metaSandboxPending = false; // Reset volatile state
          dynamicToolDefinitions = importedData.dynamicTools || [];
          artifactMetadata = importedData.artifactMetadata || {};

          // Ensure globalState reflects managed variables
          globalState.artifactMetadata = artifactMetadata;
          globalState.dynamicTools = dynamicToolDefinitions;

          // Restore UI
          UI.initializeUIElementReferences();
          if (uiRefs.timelineLog)
            uiRefs.timelineLog.innerHTML = importedData.timelineHTML || "";
          UI.clearCurrentCycleDetails();
          UI.updateStateDisplay(); // Update based on newly loaded globalState
          UI.renderDiagramDisplay(globalState.totalCycles);
          UI.renderGeneratedUI(globalState.totalCycles);
          UI.displayGenesisState();
          UI.loadPromptsFromLS();
          UI.loadCoreLoopSteps();

          logger.logEvent("info", "State imported successfully.");
          UI.logToTimeline(
            globalState.totalCycles,
            "[STATE] State imported successfully.",
            "info"
          );
          UI.showNotification(
            "State imported successfully. Artifacts are expected to be in LocalStorage.",
            "info"
          );

          // Save the newly imported state
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
          // Reset file input
          if (uiRefs.importFileInput) uiRefs.importFileInput.value = "";
        }
      };
      reader.onerror = (e) => {
        logger.logEvent(
          "error",
          `File read error during import: ${reader.error}`
        );
        UI.showNotification(`Error reading file: ${reader.error}`, "error");
        if (uiRefs.importFileInput) uiRefs.importFileInput.value = "";
      };
      reader.readAsText(file);
    },
  }; // End StateManager

  // --- ApiClient Module ---
  const ApiClient = {
    // sanitizeLlmJsonResp remains the same, uses Utils.logger
    sanitizeLlmJsonResp: (rawText) => {
      // ... (implementation as before, using logger.logEvent)
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
      // Simple brace/bracket balancing for finding the end
      let balance = 0;
      let lastValidIndex = -1;
      const startChar = s[0];
      const endChar = startChar === "{" ? "}" : startChar === "[" ? "]" : null;
      if (!endChar) return "{}"; // Not starting with { or [

      for (let i = 0; i < s.length; i++) {
        if (s[i] === startChar) balance++;
        else if (s[i] === endChar) balance--;

        if (balance === 0) {
          lastValidIndex = i;
          break; // Found the matching end
        }
      }

      if (lastValidIndex !== -1) {
        s = s.substring(0, lastValidIndex + 1);
      } else {
        // Mismatched braces/brackets, return empty object
        return "{}";
      }

      // Final check if it parses
      try {
        JSON.parse(s);
        return s;
      } catch (e) {
        logger.logEvent(
          "warn",
          `Sanitized JSON still invalid: ${e.message}, Content: ${s.substring(
            0,
            100
          )}...`
        );
        return "{}";
      }
    },

    // callGeminiAPI remains mostly the same, uses Utils.logger
    // It no longer writes to globalState.lastApiResponse directly
    callGeminiAPI: async (
      prompt,
      sysInstr,
      modelName,
      apiKey,
      funcDecls = [],
      isContinuation = false,
      prevContent = null
    ) => {
      // ... (implementation as before, using logger.logEvent)
      // REMOVED: if (globalState) globalState.lastApiResponse = data;
      // Caller (CycleLogic) will handle the response object `data` if needed
      const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
      logger.logEvent(
        "info",
        `Call API: ${modelName}${isContinuation ? " (Cont)" : ""}`
      );

      // Define base generation config and safety settings
      const baseGenCfg = {
        temperature: 0.777, // Example value
        maxOutputTokens: 8192, // Example value
        // responseMimeType will be set based on tools below
      };
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
        generationConfig: { ...baseGenCfg }, // Copy base config
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
        // Default mime type is fine when tools are used
      } else {
        // Explicitly request JSON only when no tools are declared
        reqBody.generationConfig.responseMimeType = "application/json";
      }

      try {
        const resp = await fetch(`${apiEndpoint}?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
        });

        if (!resp.ok) {
          let errBody = await resp.text();
          let errJson = {};
          try {
            errJson = JSON.parse(errBody);
          } catch (e) {
            /* ignore parse error */
          }
          throw new Error(
            `API Error (${resp.status}): ${
              errJson?.error?.message || resp.statusText || "Unknown"
            }`
          );
        }

        const data = await resp.json();

        // Caller (CycleLogic) can decide to store this `data` if needed
        // if (globalState) globalState.lastApiResponse = data; // REMOVED

        if (data.promptFeedback?.blockReason) {
          throw new Error(`API Blocked: ${data.promptFeedback.blockReason}`);
        }
        if (data.error) {
          throw new Error(`API Error: ${data.error.message || "Unknown"}`);
        }

        if (!data.candidates?.length) {
          // Handle potentially empty {} response for streaming-like scenarios if needed,
          // otherwise treat as error or unexpected response.
          if (resp.status === 200 && JSON.stringify(data) === "{}") {
            logger.logEvent("warn", "API returned empty JSON object {}");
            // Decide how to handle this - maybe return empty, maybe throw
            return {
              type: "empty",
              content: null,
              tokenCount: 0,
              finishReason: "STOP",
              rawResp: data,
            };
          }
          throw new Error("API Invalid Response: No candidates.");
        }

        const cand = data.candidates[0];
        const tokenCount =
          cand.tokenCount || data.usageMetadata?.totalTokenCount || 0;
        const finishReason = cand.finishReason || "UNKNOWN";

        // Check for blocks or errors in the candidate itself
        if (
          finishReason !== "STOP" &&
          finishReason !== "MAX_TOKENS" &&
          !cand.content
        ) {
          if (finishReason === "SAFETY") {
            throw new Error(`API Response Blocked: ${finishReason}`);
          }
          // Other reasons like RECITATION, OTHER might occur without content
          logger.logEvent(
            "warn",
            `API finishReason: ${finishReason} with no content.`
          );
          return {
            type: "empty",
            content: null,
            tokenCount: tokenCount,
            finishReason: finishReason,
            rawResp: data,
          };
        }

        const part = cand.content?.parts?.[0];

        if (!part) {
          // It's possible to get a STOP reason with no content part if the model just stops.
          logger.logEvent(
            "info",
            `API OK. Finish:${finishReason}. Tokens:${tokenCount}. No content part.`
          );
          return {
            type: "empty",
            content: null,
            tokenCount: tokenCount,
            finishReason: finishReason,
            rawResp: data,
          };
        }

        logger.logEvent(
          "info",
          `API OK. Finish:${finishReason}. Tokens:${tokenCount}`
        );

        // Determine response type based on content part
        if (part.text !== undefined) {
          // Check for existence, even if empty string
          return {
            type: "text",
            content: part.text,
            tokenCount: tokenCount,
            finishReason: finishReason,
            rawResp: data,
          };
        }
        if (part.functionCall) {
          return {
            type: "functionCall",
            content: part.functionCall,
            tokenCount: tokenCount,
            finishReason: finishReason,
            rawResp: data,
          };
        }

        // Should not happen if API schema is followed, but handle defensively
        throw new Error(
          "API response part contains neither text nor functionCall."
        );
      } catch (error) {
        logger.logEvent("error", `API Fetch Error: ${error.message}`);
        throw error; // Re-throw for handling by callApiWithRetry
      }
    },

    // callApiWithRetry remains mostly the same
    // It now receives callbacks for UI updates instead of calling UI directly
    callApiWithRetry: async (
      prompt,
      sysInstr,
      modelName,
      apiKey,
      funcDecls = [],
      isCont = false,
      prevContent = null,
      retries = globalState?.cfg?.maxRetries ?? 1, // Get retries from state
      // Callbacks for decoupling UI updates:
      updateStatusFn = (/* message, isActive, isError */) => {},
      logTimelineFn = (/* message, type, isSubStep, animate */) => ({}), // Returns dummy item
      updateTimelineFn = (/* item, message, type, stopAnimate */) => {}
    ) => {
      // Use the injected functions for UI updates
      if (!isCont) updateStatusFn(`Calling Gemini (${modelName})...`, true);
      let logItem = logTimelineFn(
        `[API] Calling ${modelName}...`,
        "info",
        true,
        true
      );

      try {
        const result = await ApiClient.callGeminiAPI(
          prompt,
          sysInstr,
          modelName,
          apiKey,
          funcDecls,
          isCont,
          prevContent
        );
        // Use injected function to update timeline
        updateTimelineFn(
          logItem,
          `[API OK:${modelName}] Finish: ${result.finishReason}, Tokens: ${result.tokenCount}`,
          "info",
          true
        );
        return result;
      } catch (error) {
        logger.logEvent(
          "warn",
          `API call failed: ${error.message}. Retries left: ${retries}`
        );
        // Use injected function to update timeline
        updateTimelineFn(
          logItem,
          `[API ERR:${modelName}] ${Utils.lc(error.message).substring(
            0,
            80
          )} (Retries: ${retries})`,
          "error",
          true
        );

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
          // Recursive call passes the UI update functions along
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
            updateTimelineFn
          );
        } else {
          throw error; // Max retries exceeded or non-retryable error
        }
      } finally {
        // Use injected function to update status
        if (!isCont) updateStatusFn("Idle");
      }
    },
  };

  // --- UI Module ---
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
      ];
      uiRefs = {}; // Reset refs
      elementIds.forEach((kebabId) => {
        const camelId = Utils.kabobToCamel(kebabId);
        uiRefs[camelId] = Utils.$id(kebabId);
        // Keep warning for missing elements if needed
        if (
          !uiRefs[camelId] &&
          kebabId !==
            "notifications-container" /* Allow missing notification container */
        ) {
          // console.warn(`UI element not found for ID: #${kebabId} (expected camelCase key: ${camelId})`);
        }
      });
      logger.logEvent("debug", "UI element references initialized."); // Use logger
    },

    updateStatus: (message, isActive = false, isError = false) => {
      // ... (implementation as before, using uiRefs)
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
        : "var(--fg)"; // Assuming --fg CSS var exists
    },

    highlightCoreStep: (stepIndex) => {
      // Simple implementation: log or potentially add class to steps list
      activeCoreStepIdx = stepIndex;
      logger.logEvent("debug", `Highlighting step: ${stepIndex}`);
      // Add visual highlighting logic here if #core-loop-steps-list is populated with step elements
      if (uiRefs.coreLoopStepsList && uiRefs.coreLoopStepsList.children) {
        Array.from(uiRefs.coreLoopStepsList.children).forEach((li, idx) => {
          li.classList.toggle("active-step", idx === stepIndex);
        });
      }
    },

    showNotification: (message, type = "info", duration = 5000) => {
      // Uses Utils.$id directly for the container
      const container = Utils.$id("notifications-container");
      if (!container) {
        console.error("Notification container not found!");
        alert(`[${Utils.uc(type)}] ${message}`); // Fallback
        return;
      }
      const notification = document.createElement("div");
      notification.className = `notification ${type}`;
      // Simple X button to close
      notification.innerHTML = `${message}<button style="background:none;border:none;float:right;cursor:pointer;color:inherit;font-size:1.2em;line-height:1;padding:0;margin-left:10px;" onclick="this.parentElement.remove()">×</button>`;
      container.appendChild(notification);

      if (duration > 0) {
        setTimeout(() => {
          // Check if the element still exists before removing
          if (notification.parentElement) {
            notification.remove();
          }
        }, duration);
      }
    },

    // createSvgElement remains the same
    createSvgElement: (name, attrs = {}) => {
      /* ... as before ... */
      const el = document.createElementNS(SVG_NS, name);
      for (const key in attrs) el.setAttribute(key, attrs[key]);
      return el;
    },

    // updateMetricsDisplay remains the same, reads globalState, uses uiRefs
    updateMetricsDisplay: () => {
      /* ... as before ... */
      if (!globalState || !uiRefs.avgConfidence) return;
      // Confidence History
      const confHistory = globalState.confidenceHistory.slice(-10); // Use last 10 for rolling avg
      if (confHistory.length > 0) {
        const sum = confHistory.reduce((a, b) => a + b, 0);
        globalState.avgConfidence = sum / confHistory.length;
        uiRefs.avgConfidence.textContent = globalState.avgConfidence.toFixed(2);
      } else {
        uiRefs.avgConfidence.textContent = "N/A";
      }
      // Critique Failure History
      const critHistory = globalState.critiqueFailHistory.slice(-10); // Use last 10
      if (critHistory.length > 0) {
        const fails = critHistory.filter((v) => v === true).length; // Count true values (failures)
        globalState.critiqueFailRate = (fails / critHistory.length) * 100;
        uiRefs.critiqueFailRate.textContent =
          globalState.critiqueFailRate.toFixed(1) + "%";
      } else {
        uiRefs.critiqueFailRate.textContent = "N/A";
      }
      // Avg Tokens
      if (uiRefs.avgTokens)
        uiRefs.avgTokens.textContent =
          globalState.avgTokens?.toFixed(0) || "N/A";
      // Context Token Estimate
      if (uiRefs.contextTokenEstimate)
        uiRefs.contextTokenEstimate.textContent =
          globalState.contextTokenEstimate?.toLocaleString() || "0";
      // Fail Count
      if (uiRefs.failCount)
        uiRefs.failCount.textContent = globalState.failCount;

      UI.checkContextTokenWarning(); // Check warning after update
    },

    // checkContextTokenWarning remains the same, reads globalState, uses uiRefs, logs via logger
    checkContextTokenWarning: () => {
      /* ... as before, using logger.logEvent ... */
      if (!globalState || !uiRefs.contextTokenWarning) return;
      const isWarn = globalState.contextTokenEstimate >= CTX_WARN_THRESH;
      uiRefs.contextTokenWarning.classList.toggle("hidden", !isWarn);
      if (isWarn) {
        // Log only once per threshold cross? Or check if already logged recently?
        logger.logEvent(
          "warn",
          `Context high! (${globalState.contextTokenEstimate.toLocaleString()}). Consider summarizing context.`
        );
      }
    },

    // updateHtmlHistoryControls remains the same, reads globalState, uses uiRefs
    updateHtmlHistoryControls: () => {
      /* ... as before ... */
      if (!uiRefs.htmlHistoryCount || !globalState) return;
      const count = globalState.htmlHistory?.length || 0;
      uiRefs.htmlHistoryCount.textContent = count.toString();
      if (uiRefs.goBackButton) uiRefs.goBackButton.disabled = count === 0;
    },

    // updateFieldsetSummaries remains the same, uses uiRefs, Utils.$id, Storage module
    updateFieldsetSummaries: () => {
      /* ... as before, using Utils.$id and Storage.getArtifactContent ... */
      if (!globalState) return;

      // Helper to update a fieldset summary
      const updateSummary = (fieldsetRefOrId, text) => {
        let fieldset;
        if (typeof fieldsetRefOrId === "string") {
          fieldset = Utils.$id(fieldsetRefOrId);
        } else {
          fieldset = fieldsetRefOrId;
        }
        if (fieldset) {
          const summary = fieldset.querySelector(".summary-line");
          if (summary) {
            summary.textContent = text || "(Summary N/A)";
          }
        }
      };

      // Config Summary
      updateSummary(
        "genesis-config",
        `LSD:${globalState.cfg.personaBalance}%, Crit:${
          globalState.cfg.llmCritiqueProb
        }%, Rev:${globalState.cfg.humanReviewProb}%, CycleT:${
          globalState.cfg.maxCycleTime
        }s, ConfT:${globalState.cfg.autoCritiqueThresh}, MaxC:${
          globalState.cfg.maxCycles || "Inf"
        }, CoreM:${globalState.cfg.coreModel.split("-")[1]}, CritM:${
          globalState.cfg.critiqueModel.split("-")[1]
        }`
      );

      // Prompts Summary (uses Storage)
      updateSummary(
        "seed-prompts",
        `Core:${
          Storage.getArtifactContent("reploid.prompt.core", 0)?.length || 0
        }c, Crit:${
          Storage.getArtifactContent("reploid.prompt.critique", 0)?.length || 0
        }c, Sum:${
          Storage.getArtifactContent("reploid.prompt.summarize", 0)?.length || 0
        }c`
      );

      // Genesis State Summary (uses Storage)
      updateSummary(
        uiRefs.genesisStateDisplay,
        `Diagram JSON: ${
          Storage.getArtifactContent("target.diagram", 0)?.length || 0
        }c`
      );

      // Current Cycle Summary
      const cycleContent = uiRefs.currentCycleContent?.textContent || "";
      updateSummary(
        uiRefs.currentCycleDetails,
        `Items: ${
          uiRefs.currentCycleContent?.childElementCount || 0
        }, Content: ${cycleContent.length}c`
      );

      // Timeline Summary
      updateSummary(
        "timeline-fieldset",
        `Entries: ${uiRefs.timelineLog?.childElementCount || 0}`
      );

      // Controls Summary
      updateSummary(
        "controls-fieldset",
        `API Key: ${globalState.apiKey ? "Set" : "Not Set"}`
      );
    },

    // updateStateDisplay remains the same, reads globalState, uses uiRefs, calls other UI methods
    updateStateDisplay: () => {
      /* ... as before, using uiRefs, calling UI.updateMetricsDisplay etc ... */
      if (!globalState || !uiRefs.totalCycles) return; // Check a key element exists

      // Config Inputs
      uiRefs.lsdPersonaPercentInput.value =
        globalState.cfg.personaBalance ?? 50;
      uiRefs.xyzPersonaPercentInput.value =
        100 - (globalState.cfg.personaBalance ?? 50);
      uiRefs.llmCritiqueProbInput.value = globalState.cfg.llmCritiqueProb ?? 70;
      uiRefs.humanReviewProbInput.value = globalState.cfg.humanReviewProb ?? 36;
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

      // Stats Display
      const maxC = globalState.cfg.maxCycles || 0;
      uiRefs.maxCyclesDisplay.textContent =
        maxC === 0 ? "Inf" : maxC.toString();
      uiRefs.totalCycles.textContent = globalState.totalCycles;
      uiRefs.agentIterations.textContent = globalState.agentIterations;
      uiRefs.humanInterventions.textContent = globalState.humanInterventions;
      uiRefs.failCount.textContent = globalState.failCount; // Ensure failCount ref exists and is updated

      // Goal Display
      const goalInfo = CycleLogic.getActiveGoalInfo(); // Assumes CycleLogic is available
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

      // Update dependent UI parts
      UI.updateMetricsDisplay();
      UI.updateHtmlHistoryControls();
      UI.hideHumanInterventionUI(); // Ensure intervention UI is hidden on general update
      UI.hideMetaSandbox(); // Ensure meta sandbox is hidden
      if (
        uiRefs.runCycleButton &&
        !metaSandboxPending &&
        !uiRefs.humanInterventionSection?.classList.contains("hidden")
      ) {
        // Check if HITL is also hidden
        uiRefs.runCycleButton.disabled = false;
      }
      UI.updateFieldsetSummaries();
    },

    // displayGenesisState remains the same, uses Utils.$id, uiRefs, Storage module
    displayGenesisState: () => {
      /* ... as before, using Utils.$id, uiRefs, Storage.getArtifactContent ... */
      if (!uiRefs.genesisMetricsDisplay || !uiRefs.genesisDiagramJson) return;

      // Copy metrics from the main display
      const metricsEl = Utils.$id("core-metrics-display"); // Get the source element
      if (metricsEl) {
        uiRefs.genesisMetricsDisplay.innerHTML = metricsEl.innerHTML;
      } else {
        uiRefs.genesisMetricsDisplay.innerHTML = "Metrics unavailable";
      }

      // Load genesis diagram JSON (Cycle 0)
      const diagramJsonContent = Storage.getArtifactContent(
        "target.diagram",
        0
      );
      uiRefs.genesisDiagramJson.value =
        diagramJsonContent || "(Genesis Diagram JSON Not Found)";
    },

    // logToTimeline remains the same, uses logger, uiRefs, globalState
    logToTimeline: (
      cycle,
      message,
      type = "info",
      isSubStep = false,
      animate = false
    ) => {
      /* ... as before, using logger.logEvent ... */
      if (!uiRefs.timelineLog) return null;

      // Log to console via logger first
      logger.logEvent(type, `T[${cycle}]: ${message}`);

      const li = document.createElement("li");
      const span = document.createElement("span");
      li.setAttribute("data-cycle", cycle);
      li.setAttribute("data-timestamp", Date.now());
      li.classList.add(isSubStep ? "sub-step" : "log-entry");
      if (type === "error") li.classList.add("error");
      if (type === "warn") li.classList.add("warn");

      // Determine persona and icon
      const persona = globalState?.personaMode === "XYZ" ? "[X]" : "[L]"; // Default to L if state unavailable
      let icon = "➡️"; // Default icon
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
        // Replace icon with animated gear, keep original title
        iconHTML = `<span class="log-icon animated-icon" title="${type}">⚙️</span>`;
      }

      span.innerHTML = `${iconHTML} ${persona} ${message}`;
      li.appendChild(span);

      // Add to the top of the list
      const targetList = uiRefs.timelineLog;
      targetList.insertBefore(li, targetList.firstChild);

      // Limit timeline entries
      if (targetList.children.length > 200) {
        targetList.removeChild(targetList.lastChild);
      }

      return li; // Return the list item element for potential updates
    },

    // logCoreLoopStep remains the same, uses UI.highlightCoreStep, uiRefs
    logCoreLoopStep: (cycle, stepIndex, message) => {
      /* ... as before, calling UI.highlightCoreStep ... */
      UI.highlightCoreStep(stepIndex); // Highlight visually

      if (!uiRefs.timelineLog) return null;

      const li = document.createElement("li");
      li.classList.add("core-step");
      li.setAttribute("data-cycle", cycle);
      li.setAttribute("data-timestamp", Date.now());

      const span = document.createElement("span");
      // Define icons for core steps (adjust as needed)
      const icons = ["🎯", "🧠", "💡", "🛠️", "⏱️", "🧐", "💾", "🔄"]; // Example icons
      const stepIcon = icons[stepIndex] || "➡️"; // Default icon

      span.innerHTML = `<span class="log-icon">${stepIcon}</span> <strong>Step ${
        stepIndex + 1
      }:</strong> ${message}`;
      li.appendChild(span);

      // Insert at the top
      uiRefs.timelineLog.insertBefore(li, uiRefs.timelineLog.firstChild);
      return li;
    },

    // updateTimelineItem remains the same, uses globalState, uiRefs
    updateTimelineItem: (
      logItem,
      newMessage,
      newType = "info",
      stopAnimate = true
    ) => {
      /* ... as before ... */
      if (!logItem) return;
      const span = logItem.querySelector("span");
      if (!span || !globalState) return; // Need global state for persona

      let icon = span.querySelector(".log-icon")?.textContent || "➡️"; // Get current text icon
      let iconClass = "log-icon";
      let currentTitle =
        span.querySelector(".log-icon")?.getAttribute("title") || newType;

      // Determine new icon based on message content
      if (newMessage.includes(" OK")) icon = "✅";
      else if (newMessage.includes(" ERR")) icon = "❌";

      // Override icon based on type if needed
      if (newType === "warn") icon = "⚠️";
      if (newType === "error") icon = "❌"; // Ensure error type uses error icon

      const persona = globalState.personaMode === "XYZ" ? "[X]" : "[L]";

      // Handle stopping animation
      if (stopAnimate) {
        const animatedIconEl = span.querySelector(".animated-icon");
        if (animatedIconEl) {
          animatedIconEl.classList.remove("animated-icon");
          // Restore original icon if animation stopped? Or just use the new icon? Let's use the new one.
          iconClass = "log-icon"; // Ensure class is reset
          currentTitle = newType; // Update title to match new state
        }
      } else {
        // If animation should continue, check if it's already animating
        if (span.querySelector(".animated-icon")) {
          icon = "⚙️"; // Keep gear if still animating
          iconClass = "log-icon animated-icon";
        }
      }

      // Update the span content
      span.innerHTML = `<span class="${iconClass}" title="${currentTitle}">${icon}</span> ${persona} ${newMessage}`;

      // Update parent li class based on new type
      logItem.classList.remove("error", "warn");
      if (newType === "error") logItem.classList.add("error");
      if (newType === "warn") logItem.classList.add("warn");
    },

    // summarizeCompletedCycleLog remains the same, uses uiRefs
    summarizeCompletedCycleLog: (logItem, outcome) => {
      /* ... as before ... */
      if (!logItem || !logItem.classList.contains("log-entry")) return; // Only summarize top-level cycle logs

      logItem.classList.add("summary"); // Add class for potential styling/filtering
      const firstSpan = logItem.querySelector("span");
      if (firstSpan) {
        // Replace content with summary, keep original attributes like data-cycle
        firstSpan.innerHTML = `<span class="log-icon">🏁</span> Cycle ${logItem.getAttribute(
          "data-cycle"
        )} Completed: ${outcome} (Expand?)`;
        // Add click listener to expand/collapse details if needed later
        // logItem.onclick = () => { /* toggle details visibility */ };
      }
    },

    // clearCurrentCycleDetails remains the same, uses uiRefs, calls UI.updateFieldsetSummaries
    clearCurrentCycleDetails: () => {
      /* ... as before ... */
      if (!uiRefs.currentCycleDetails || !uiRefs.currentCycleContent) return;
      // Collapse the fieldset
      uiRefs.currentCycleDetails.classList.add("collapsed");
      // Update the summary line now that it's collapsed
      UI.updateFieldsetSummaries();
      // Clear the content area
      uiRefs.currentCycleContent.innerHTML = "<p>Waiting for cycle...</p>";
      // Hide the diagram display when clearing cycle details
      if (uiRefs.diagramDisplayContainer) {
        uiRefs.diagramDisplayContainer.classList.add("hidden");
      }
    },

    // getArtifactTypeIndicator remains the same, uses StateManager
    getArtifactTypeIndicator: (type) => {
      /* ... as before ... */
      switch (type) {
        case "JAVASCRIPT_SNIPPET":
          return "[JS]";
        case "CSS_STYLESHEET":
          return "[CSS]";
        case "HTML_HEAD":
          return "[HEAD]";
        case "HTML_BODY":
          return "[BODY]";
        case "DIAGRAM_JSON":
          return "[JSON]";
        case "PROMPT":
          return "[TXT]";
        case "FULL_HTML_SOURCE":
          return "[HTML]";
        case "TEXT":
          return "[TXT]";
        // Add other types as needed
        default:
          return "[???]";
      }
    },

    // displayCycleArtifact remains the same, uses uiRefs, StateManager, UI.getArtifactTypeIndicator, UI.updateFieldsetSummaries
    displayCycleArtifact: (
      label,
      content,
      type = "info",
      isModified = false,
      source = null,
      artifactId = null,
      cycle = null
    ) => {
      /* ... as before ... */
      if (!uiRefs.currentCycleDetails || !uiRefs.currentCycleContent) return;

      // If collapsed, expand and clear placeholder
      if (uiRefs.currentCycleDetails.classList.contains("collapsed")) {
        uiRefs.currentCycleDetails.classList.remove("collapsed");
        uiRefs.currentCycleContent.innerHTML = ""; // Clear "Waiting..." message
      }

      const section = document.createElement("div");
      section.className = "artifact-section";

      const labelEl = document.createElement("span");
      labelEl.className = "artifact-label";

      // Get metadata if ID provided
      const meta = artifactId
        ? StateManager.getArtifactMetadata(artifactId)
        : { type: "TEXT" }; // Default type
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
          ' <span class="change-indicator" style="color:orange;">*</span>'; // Style indicator

      section.appendChild(labelEl);

      const pre = document.createElement("pre");
      pre.textContent =
        content === null || content === undefined
          ? "(Artifact content not found/empty)"
          : String(content); // Ensure content is string
      pre.classList.add(type); // Use type for potential styling (e.g., input, output, error)
      if (isModified) pre.classList.add("modified");

      section.appendChild(pre);
      uiRefs.currentCycleContent.appendChild(section);

      // Update summary after adding content
      UI.updateFieldsetSummaries();
    },

    // hideHumanInterventionUI remains the same, uses uiRefs, global var metaSandboxPending
    hideHumanInterventionUI: () => {
      /* ... as before ... */
      if (!uiRefs.humanInterventionSection) return;
      uiRefs.humanInterventionSection.classList.add("hidden");

      // Hide all modes
      if (uiRefs.hitlOptionsMode)
        uiRefs.hitlOptionsMode.classList.add("hidden");
      if (uiRefs.hitlPromptMode) uiRefs.hitlPromptMode.classList.add("hidden");
      if (uiRefs.hitlCodeEditMode)
        uiRefs.hitlCodeEditMode.classList.add("hidden");

      // Re-enable run button ONLY if meta sandbox is also not pending
      if (!metaSandboxPending && uiRefs.runCycleButton) {
        uiRefs.runCycleButton.disabled = false;
      }
    },

    // showHumanInterventionUI remains the same, uses uiRefs, logger, StateManager, Storage, UI.logToTimeline, UI.highlightCoreStep, UI.hideMetaSandbox
    showHumanInterventionUI: (
      mode = "prompt",
      reason = "",
      options = [],
      artifactIdToEdit = null
    ) => {
      /* ... as before, using logger.logEvent, StateManager, Storage.getArtifactContent etc. */
      if (!uiRefs.humanInterventionSection || !globalState) return;

      UI.highlightCoreStep(5); // Highlight step 6 (index 5)
      UI.hideMetaSandbox(); // Ensure meta sandbox is hidden

      uiRefs.humanInterventionSection.classList.remove("hidden");
      uiRefs.humanInterventionSection
        .querySelector("fieldset")
        ?.classList.remove("collapsed"); // Ensure fieldset is expanded
      uiRefs.humanInterventionTitle.textContent = `Human Intervention Required`;
      uiRefs.humanInterventionReason.textContent = `Reason: ${reason}.`;

      // Update summary line too
      if (uiRefs.humanInterventionReasonSummary) {
        uiRefs.humanInterventionReasonSummary.textContent = `Reason: ${reason.substring(
          0,
          50
        )}...`;
      }

      // Disable run button
      if (uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = true;

      // Log to timeline
      UI.logToTimeline(
        globalState.totalCycles,
        `[HUMAN] Intervention Required: ${reason}`,
        "warn",
        true
      );

      // Hide all modes first
      if (uiRefs.hitlOptionsMode)
        uiRefs.hitlOptionsMode.classList.add("hidden");
      if (uiRefs.hitlPromptMode) uiRefs.hitlPromptMode.classList.add("hidden");
      if (uiRefs.hitlCodeEditMode)
        uiRefs.hitlCodeEditMode.classList.add("hidden");

      // Show the selected mode
      if (
        mode === "options" &&
        uiRefs.hitlOptionsMode &&
        uiRefs.hitlOptionsList
      ) {
        uiRefs.hitlOptionsMode.classList.remove("hidden");
        uiRefs.hitlOptionsList.innerHTML = ""; // Clear previous options
        options.forEach((opt, i) => {
          const div = document.createElement("div");
          const inp = document.createElement("input");
          inp.type = "checkbox"; // Use checkbox for multiple selections? Or radio? Assume checkbox.
          inp.id = `hitl_${i}`;
          inp.value = opt.value || opt.label; // Use value if provided, else label
          inp.name = "hitl_option"; // Group checkboxes/radios
          const lbl = document.createElement("label"); // Use label for accessibility
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
        uiRefs.humanEditArtifactSelector.innerHTML = ""; // Clear previous options
        uiRefs.humanEditArtifactTextarea.value = ""; // Clear textarea

        const editableTypes = [
          "HTML_HEAD",
          "HTML_BODY",
          "CSS_STYLESHEET",
          "JAVASCRIPT_SNIPPET",
          "DIAGRAM_JSON",
          "FULL_HTML_SOURCE",
          "PROMPT",
          "TEXT",
        ];
        const currentCycle = globalState.totalCycles;
        const allMeta = StateManager.getAllArtifactMetadata(); // Get current metadata

        // Filter and sort relevant artifacts
        const relevantArtifacts = Object.values(allMeta)
          .filter(
            (meta) => editableTypes.includes(meta.type) && meta.latestCycle >= 0
          )
          .sort((a, b) => a.id.localeCompare(b.id)); // Sort alphabetically by ID

        relevantArtifacts.forEach((meta) => {
          const opt = document.createElement("option");
          opt.value = meta.id;
          opt.textContent = `${meta.id} (${meta.type}) - Last Mod: Cyc ${meta.latestCycle}`;
          uiRefs.humanEditArtifactSelector.appendChild(opt);
        });

        // Add option for last generated full source if available
        if (
          globalState.lastGeneratedFullSource &&
          artifactIdToEdit === "full_html_source"
        ) {
          // Also check if it's the suggested one
          const opt = document.createElement("option");
          opt.value = "full_html_source"; // Special value
          opt.textContent = `Proposed Full HTML Source (Cycle ${currentCycle})`;
          uiRefs.humanEditArtifactSelector.appendChild(opt);
        }

        const selectArtifact = (id) => {
          let content = "";
          if (id === "full_html_source") {
            content =
              globalState.lastGeneratedFullSource ||
              "(Full source not available in state)";
          } else {
            const meta = StateManager.getArtifactMetadata(id);
            if (meta && meta.latestCycle >= 0) {
              content =
                Storage.getArtifactContent(id, meta.latestCycle) ??
                `(Artifact ${id} - Cycle ${meta.latestCycle} content not found)`;
            } else {
              content = `(Artifact ${id} not found or no versions available)`;
            }
          }
          uiRefs.humanEditArtifactTextarea.value = content;
          uiRefs.humanEditArtifactTextarea.scrollTop = 0; // Scroll to top
        };

        // Set up event listener for selector change
        uiRefs.humanEditArtifactSelector.onchange = () =>
          selectArtifact(uiRefs.humanEditArtifactSelector.value);

        // Determine initial selection
        const initialId =
          artifactIdToEdit &&
          (StateManager.getArtifactMetadata(artifactIdToEdit)?.latestCycle >=
            0 ||
            artifactIdToEdit === "full_html_source")
            ? artifactIdToEdit
            : relevantArtifacts[0]?.id; // Fallback to first in list

        if (initialId) {
          uiRefs.humanEditArtifactSelector.value = initialId;
          selectArtifact(initialId); // Load initial content
        } else {
          uiRefs.humanEditArtifactTextarea.value =
            "(No editable artifacts found)";
        }
      } else {
        // Default to prompt mode
        if (uiRefs.hitlPromptMode && uiRefs.humanCritiqueInput) {
          uiRefs.hitlPromptMode.classList.remove("hidden");
          uiRefs.humanCritiqueInput.value = ""; // Clear previous input
          uiRefs.humanCritiqueInput.placeholder = `Feedback/Next Step? (${reason})`;
          uiRefs.humanCritiqueInput.focus(); // Focus input field
        }
      }

      // Scroll the intervention section into view
      uiRefs.humanInterventionSection.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    },

    // hideMetaSandbox remains the same, uses uiRefs, global var metaSandboxPending
    hideMetaSandbox: () => {
      /* ... as before ... */
      if (!uiRefs.metaSandboxContainer) return;
      uiRefs.metaSandboxContainer.classList.add("hidden");
      metaSandboxPending = false; // Reset flag when hidden

      // Re-enable run button ONLY if human intervention is also hidden
      if (
        uiRefs.humanInterventionSection?.classList.contains("hidden") &&
        uiRefs.runCycleButton
      ) {
        uiRefs.runCycleButton.disabled = false;
      }
    },

    // showMetaSandbox remains the same, uses uiRefs, logger, globalState, UI.logToTimeline, UI.highlightCoreStep, UI.hideHumanInterventionUI
    showMetaSandbox: (htmlSource) => {
      /* ... as before, using logger.logEvent, UI.logToTimeline etc. */
      if (
        !uiRefs.metaSandboxContainer ||
        !uiRefs.metaSandboxOutput ||
        !globalState
      )
        return;

      UI.highlightCoreStep(6); // Highlight Step 7 (index 6) - Apply
      UI.hideHumanInterventionUI(); // Ensure HITL is hidden

      uiRefs.metaSandboxContainer.classList.remove("hidden");
      uiRefs.metaSandboxContainer
        .querySelector("fieldset")
        ?.classList.remove("collapsed"); // Expand fieldset

      // Disable run button while sandbox is showing
      if (uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = true;

      const iframe = uiRefs.metaSandboxOutput;
      try {
        // Check if contentWindow is accessible (might fail due to cross-origin policies if src is set)
        const doc = iframe.contentWindow?.document;
        if (doc) {
          doc.open();
          doc.write(htmlSource);
          doc.close();
          logger.logEvent("info", "Meta sandbox rendered for approval.");
          metaSandboxPending = true; // Set flag
          UI.logToTimeline(
            globalState.totalCycles,
            `[STATE] Meta-Sandbox Ready for Review.`,
            "info",
            true
          );
          // Scroll into view
          uiRefs.metaSandboxContainer.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        } else {
          throw new Error(
            "Cannot access meta sandbox iframe document (contentWindow is null or inaccessible)."
          );
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
        UI.hideMetaSandbox(); // Hide it if rendering failed
        if (uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = false; // Re-enable button
      }
    },

    // renderCycleSVG remains the same, uses logger, UI.createSvgElement
    // NOTE: This is the complex SVG rendering logic. Ideally, it becomes a pure function.
    renderCycleSVG: (cycleData, svgElement) => {
      /* ... implementation as before ... */
      // ... (Copy the full implementation from the original code)
      // This function is long, ensure it uses UI.createSvgElement and logger.logEvent
      if (!svgElement) {
        logger.logEvent("error", "SVG element not found for rendering");
        return;
      }
      // Clear previous content
      while (svgElement.firstChild) {
        svgElement.removeChild(svgElement.firstChild);
      }

      // --- Configuration (Keep internal to this function for now) ---
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
          /* ... color definitions ... */
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

      // --- Add Arrowhead Marker Definition ---
      const defs = UI.createSvgElement("defs");
      // Normal arrowhead
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
      // Colored arrowheads
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

      // --- Helper Functions (Internal to renderCycleSVG) ---
      function getNodeById(id) {
        // cycleData needs to be passed correctly or accessible here
        return cycleData?.nodes?.find((n) => n.id === id);
      }

      // --- Render Nodes ---
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      const nodeElements = {}; // Store node elements if needed later
      cycleData?.nodes?.forEach((node) => {
        const group = UI.createSvgElement("g");
        let shape;
        const style = config.colors[node.type] || config.colors.step; // Fallback style
        const isDecision =
          node.type === "decision" || node.type === "retry_decision";
        const halfWidth =
          (isDecision ? config.decisionSize : config.nodeWidth) / 2;
        const halfHeight =
          (isDecision ? config.decisionSize : config.nodeHeight) / 2;

        if (isDecision) {
          // Rhombus for decision
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
          // Rectangle (potentially rounded)
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

        // Add text label (handling multi-line)
        const text = UI.createSvgElement("text", {
          x: node.x,
          y: node.y,
          fill: config.colors.text,
          "font-family": config.fontFamily,
          "font-size": config.fontSize,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
        });
        const lines = String(node.label || "").split("\n"); // Ensure label is a string
        const lineHeight = config.fontSize * 1.2;
        const totalTextHeight = lines.length * lineHeight;
        const startY = node.y - totalTextHeight / 2 + lineHeight / 2; // Calculate start Y for vertical centering
        lines.forEach((line, index) => {
          const dy = index === 0 ? startY - node.y : lineHeight; // Use dy for relative positioning
          const tspan = UI.createSvgElement("tspan", {
            x: node.x,
            dy: `${dy}px`,
          });
          tspan.textContent = line;
          text.appendChild(tspan);
        });
        group.appendChild(text);
        svgElement.appendChild(group);
        nodeElements[node.id] = group; // Store group

        // Update bounds tracking
        const nodeMaxX = node.bounds.right.x;
        const nodeMinX = node.bounds.left.x;
        const nodeMaxY = node.bounds.bottom.y;
        const nodeMinY = node.bounds.top.y;
        minX = Math.min(minX, nodeMinX);
        minY = Math.min(minY, nodeMinY);
        maxX = Math.max(maxX, nodeMaxX);
        maxY = Math.max(maxY, nodeMaxY);
      });

      // --- Render Connections ---
      cycleData?.connections?.forEach((conn) => {
        const fromNode = getNodeById(conn.from);
        const toNode = getNodeById(conn.to);
        if (!fromNode || !toNode || !fromNode.bounds || !toNode.bounds) {
          logger.logEvent(
            "warn",
            `Skipping connection due to missing nodes or bounds: ${conn.from} -> ${conn.to}`
          );
          return;
        }

        // Determine start and end points based on relative position
        let startPoint, endPoint;
        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;

        if (Math.abs(dy) > Math.abs(dx)) {
          // Primarily vertical
          startPoint = dy > 0 ? fromNode.bounds.bottom : fromNode.bounds.top;
          endPoint = dy > 0 ? toNode.bounds.top : toNode.bounds.bottom;
        } else {
          // Primarily horizontal
          startPoint = dx > 0 ? fromNode.bounds.right : fromNode.bounds.left;
          endPoint = dx > 0 ? toNode.bounds.left : toNode.bounds.right;
        }

        const lineType = conn.type || "normal";
        const lineStyle =
          config.colors[`line_${lineType}`] || config.colors.line_normal;
        const markerId = `arrowhead${
          lineType === "normal" ? "" : "-" + "line_" + lineType
        }`; // Use specific marker ID

        // Draw the line
        const line = UI.createSvgElement("line", {
          x1: startPoint.x,
          y1: startPoint.y,
          x2: endPoint.x,
          y2: endPoint.y,
          stroke: lineStyle,
          "stroke-width": config.strokeWidth,
          "marker-end": `url(#${markerId})`, // Apply specific arrowhead
        });
        svgElement.appendChild(line);

        // Add connection label if present
        if (conn.label) {
          // Position label slightly offset from the midpoint
          const labelRatio = 0.6; // 0.5 is midpoint, > 0.5 moves towards start
          const midX =
            startPoint.x * labelRatio + endPoint.x * (1 - labelRatio);
          const midY =
            startPoint.y * labelRatio + endPoint.y * (1 - labelRatio);
          const angle = Math.atan2(dy, dx);
          const offsetX = Math.sin(angle) * 10; // Offset perpendicular to line
          const offsetY = -Math.cos(angle) * 10;

          // Add text label
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

          // Add background rectangle for readability
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

          // Insert background behind text, both before the line
          svgElement.insertBefore(bgRect, line);
          svgElement.insertBefore(textLabel, line);

          // Update bounds for label background
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

      // --- Set ViewBox ---
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
        // Default viewbox if no elements rendered
        svgElement.setAttribute("viewBox", "0 0 800 1400"); // Default size
        logger.logEvent(
          "warn",
          "RenderCycleSVG: No finite bounds calculated, using default viewBox."
        );
      }
    },

    // renderCycleSVGToMarkup remains the same, uses SVG_NS, UI.renderCycleSVG
    renderCycleSVGToMarkup: (cycleData) => {
      /* ... as before ... */
      const tempSvg = document.createElementNS(SVG_NS, "svg");
      UI.renderCycleSVG(cycleData, tempSvg); // Render onto the temporary element
      return tempSvg.outerHTML;
    },

    // renderDiagramDisplay remains the same, uses uiRefs, logger, Storage, UI.renderCycleSVG
    renderDiagramDisplay: (cycleNum) => {
      /* ... as before, using logger, Storage.getArtifactContent, uiRefs, UI.renderCycleSVG */
      // Get required elements using uiRefs
      const svgContainer = uiRefs.diagramSvgContainer;
      const jsonDisplay = uiRefs.diagramJsonDisplay;
      const diagramContainer = uiRefs.diagramDisplayContainer;
      const cycleDiagram = uiRefs.cycleDiagram; // The actual <svg> element

      if (!svgContainer || !jsonDisplay || !diagramContainer || !cycleDiagram) {
        logger.logEvent(
          "warn",
          "Missing UI elements required for diagram display."
        );
        return;
      }

      // Attempt to load diagram JSON for the *specific* cycle number requested
      const jsonContent = Storage.getArtifactContent(
        "target.diagram",
        cycleNum
      );

      if (jsonContent) {
        jsonDisplay.value = jsonContent; // Display the JSON source
        try {
          const diagramJson = JSON.parse(jsonContent);
          // TODO: Replace 'cycleFlowData' if it's hardcoded; should use 'diagramJson'
          // This assumes your cycleFlowData structure matches what's in storage
          // If cycleFlowData is a static definition of the *process*, not the *output*,
          // then this call might be incorrect.
          // Let's assume 'diagramJson' IS the data structure for the diagram:
          UI.renderCycleSVG(diagramJson, cycleDiagram); // Render the parsed JSON
          diagramContainer.classList.remove("hidden"); // Show the container
        } catch (e) {
          logger.logEvent(
            "warn",
            `Failed to parse/render diagram JSON (Cycle ${cycleNum}): ${e.message}`
          );
          cycleDiagram.innerHTML =
            '<text fill="red" x="10" y="20">Error parsing/rendering Diagram JSON</text>'; // Display error in SVG
          diagramContainer.classList.remove("hidden"); // Still show container with error message
        }
      } else {
        jsonDisplay.value = "{}"; // Show empty JSON
        cycleDiagram.innerHTML =
          '<text x="10" y="20">No Diagram Artifact Found for Cycle ' +
          cycleNum +
          "</text>"; // Indicate missing artifact
        diagramContainer.classList.remove("hidden"); // Show container with message
      }
    },

    // renderGeneratedUI remains the same, uses uiRefs, logger, StateManager, Storage
    renderGeneratedUI: (cycleNum) => {
      /* ... as before, using logger, StateManager, Storage.getArtifactContent, uiRefs */
      // Get metadata to find the latest relevant cycles for each part
      const headMeta = StateManager.getArtifactMetadata("target.head");
      const bodyMeta = StateManager.getArtifactMetadata("target.body");
      const allMeta = StateManager.getAllArtifactMetadata();

      // Find latest versions, defaulting to current cycleNum if no history exists or requested explicitly?
      // Let's try using latestCycle from metadata for flexibility
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

      // Aggregate latest CSS
      const cssContents = Object.keys(allMeta)
        .filter(
          (id) =>
            id.startsWith("target.style.") &&
            allMeta[id].type === "CSS_STYLESHEET" &&
            allMeta[id].latestCycle >= 0
        )
        .map((id) => Storage.getArtifactContent(id, allMeta[id].latestCycle))
        .filter((content) => !!content) // Remove null/empty content
        .join("\n\n");

      // Aggregate latest JS (wrap in script tags)
      const jsContents = Object.keys(allMeta)
        .filter(
          (id) =>
            id.startsWith("target.script.") &&
            allMeta[id].type === "JAVASCRIPT_SNIPPET" &&
            allMeta[id].latestCycle >= 0
        )
        .map((id) => {
          const content = Storage.getArtifactContent(
            id,
            allMeta[id].latestCycle
          );
          // Add comments or IDs to script tags for easier debugging in the preview
          return content
            ? `<script id="${id}_cyc${allMeta[id].latestCycle}">\n// Source: ${id}, Cycle: ${allMeta[id].latestCycle}\n${content}\n</script>`
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
        doc.write(`<!DOCTYPE html>
                <html>
                <head>
                    <title>UI Preview (Cycle ${cycleNum})</title>
                    ${headContent}
                    <style>
                        /* Basic iframe styling */
                        body { margin: 10px; font-family: sans-serif; background-color:#fff; color:#000; }
                        * { box-sizing: border-box; }
                        /* Injected CSS */
                        ${cssContents}
                    </style>
                </head>
                <body>
                    ${bodyContent}
                    ${jsContents}
                    <script>console.log('UI preview rendered incorporating artifacts up to cycle ${cycleNum}.');</script>
                </body>
                </html>`);
        doc.close();
        logger.logEvent(
          "info",
          `Rendered UI preview using artifacts up to cycle ${cycleNum}.`
        );
        // Log to timeline - this might be too noisy if rendering happens often
        // UI.logToTimeline(globalState.totalCycles, `[ARTIFACT] Rendered External UI Preview (Cycle ${cycleNum}).`, "info", true);
      } catch (e) {
        logger.logEvent("error", `Failed to render UI preview: ${e.message}`);
      }
    },

    // loadPromptsFromLS remains the same, uses uiRefs, logger, Storage
    loadPromptsFromLS: () => {
      /* ... as before, using logger, Storage.getArtifactContent, uiRefs */
      if (
        !uiRefs.seedPromptCore ||
        !uiRefs.seedPromptCritique ||
        !uiRefs.seedPromptSummarize
      ) {
        logger.logEvent(
          "warn",
          "One or more prompt textareas not found in UI refs."
        );
        return;
      }
      // Load from Cycle 0 (Genesis prompts)
      uiRefs.seedPromptCore.value =
        Storage.getArtifactContent("reploid.prompt.core", 0) || "";
      uiRefs.seedPromptCritique.value =
        Storage.getArtifactContent("reploid.prompt.critique", 0) || "";
      uiRefs.seedPromptSummarize.value =
        Storage.getArtifactContent("reploid.prompt.summarize", 0) || "";

      logger.logEvent(
        "info",
        "Loaded prompts from LocalStorage into UI textareas."
      );
    },

    // loadCoreLoopSteps remains the same, uses uiRefs, logger, Storage
    loadCoreLoopSteps: () => {
      /* ... as before, using logger, Storage.getArtifactContent, uiRefs */
      if (!uiRefs.coreLoopStepsList) {
        logger.logEvent(
          "warn",
          "Core loop steps textarea not found in UI refs."
        );
        return;
      }
      uiRefs.coreLoopStepsList.value =
        Storage.getArtifactContent("reploid.core_steps", 0) ||
        "Error loading steps.";
      logger.logEvent("info", "Loaded core loop steps from LocalStorage.");
    },

    // populateModelSelectors remains the same, uses uiRefs, APP_CONFIG
    populateModelSelectors: () => {
      /* ... as before, using uiRefs, APP_CONFIG */
      const models = [
        APP_CONFIG.BASE_GEMINI_MODEL,
        APP_CONFIG.ADVANCED_GEMINI_MODEL,
      ];
      [uiRefs.coreModelSelector, uiRefs.critiqueModelSelector].forEach(
        (selector) => {
          if (!selector) return;
          selector.innerHTML = ""; // Clear existing options
          models.forEach((modelName) => {
            const option = document.createElement("option");
            option.value = modelName;
            option.textContent = modelName;
            selector.appendChild(option);
          });
        }
      );
    },

    // setupEventListeners remains the same, uses uiRefs, logger, Storage, StateManager, CycleLogic, APP_CONFIG
    setupEventListeners: () => {
      /* ... as before, using uiRefs, logger, Storage, StateManager, CycleLogic, APP_CONFIG */
      // Ensure core elements exist before adding listeners
      if (!uiRefs.runCycleButton) {
        logger.logEvent(
          "error",
          "UI elements not ready for event listeners (runCycleButton missing)."
        );
        return;
      }

      // --- Cycle Control ---
      uiRefs.runCycleButton.addEventListener("click", CycleLogic.executeCycle);

      // --- Human Intervention Submissions ---
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

      uiRefs.submitHumanCodeEditButton?.addEventListener("click", () => {
        const artifactId = uiRefs.humanEditArtifactSelector.value;
        const newContent = uiRefs.humanEditArtifactTextarea.value;
        const isFullSource = artifactId === "full_html_source";
        let originalContent = null;
        let currentMeta = null;
        let resultData = {
          id: artifactId,
          success: false,
          summary: `Edit check for ${artifactId}`,
          newContent: newContent,
        }; // Default failure

        try {
          // Get original content for comparison
          if (isFullSource) {
            originalContent = globalState.lastGeneratedFullSource;
          } else {
            currentMeta = StateManager.getArtifactMetadata(artifactId);
            if (currentMeta && currentMeta.latestCycle >= 0) {
              originalContent = Storage.getArtifactContent(
                artifactId,
                currentMeta.latestCycle
              );
            } else {
              throw new Error(
                `Original artifact content not found for ${artifactId}`
              );
            }
          }

          if (newContent !== originalContent) {
            // Basic validation for JSON if applicable
            if (!isFullSource && currentMeta?.type === "DIAGRAM_JSON") {
              JSON.parse(newContent); // Will throw on invalid JSON
            }
            // TODO: Add validation for other types if needed (JS, CSS, etc.)

            resultData.summary = `Content updated for ${artifactId}`;
            resultData.success = true; // Mark as successful change

            // Handle full source edit differently - update state, don't save to artifact storage
            if (isFullSource) {
              logger.logEvent(
                "warn",
                "Full source edited via HITL. State updated, will require meta-apply/sandbox."
              );
              globalState.lastGeneratedFullSource = newContent; // Update state directly
              // Proceed, but CycleLogic needs to know not to save this as an artifact
              CycleLogic.proceedAfterHumanIntervention(
                "Human Code Edit (Full Source)",
                resultData,
                true
              ); // true = skip cycle increment? YES
              return; // Don't proceed with normal artifact saving flow
            }
          } else {
            resultData.summary = `No changes detected for ${artifactId}`;
            resultData.success = true; // No change is also a success in terms of processing
          }
        } catch (e) {
          logger.logEvent(
            "error",
            `Error processing/validating human edit for ${artifactId}: ${e.message}`
          );
          UI.showNotification(
            `Error validating edit for ${artifactId}: ${e.message}`,
            "error"
          );
          resultData.summary = `Validation failed for ${artifactId}: ${e.message}`;
          resultData.success = false;
        }
        // Proceed normally for non-full-source edits
        CycleLogic.proceedAfterHumanIntervention("Human Code Edit", resultData);
      });

      // --- Other Controls ---
      uiRefs.forceHumanReviewButton?.addEventListener("click", () => {
        if (globalState) globalState.forceHumanReview = true;
        UI.showNotification("Next cycle will pause for Human Review.", "info");
        UI.logToTimeline(
          globalState.totalCycles,
          "[HUMAN] User forced Human Review for next cycle.",
          "warn"
        );
      });

      uiRefs.downloadLogButton?.addEventListener("click", () => {
        try {
          const blob = new Blob([Utils.logger.getLogBuffer()], {
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
          UI.showNotification("No history to go back to.", "warn");
          return;
        }
        if (
          !confirm(
            "Revert the entire page to the previous saved version? Current state will attempt to restore after reload."
          )
        )
          return;

        const prevStateHtml = globalState.htmlHistory.pop(); // Get previous state
        UI.updateHtmlHistoryControls(); // Update count display
        logger.logEvent(
          "info",
          `Reverting page HTML via Go Back. History size now: ${globalState.htmlHistory.length}`
        );
        UI.logToTimeline(
          globalState.totalCycles,
          "[STATE] Reverting HTML to previous version (Page Reload).",
          "warn"
        );

        try {
          // Preserve current state in session storage before reloading
          const stateToPreserve = StateManager.capturePreservationState();
          Storage.saveSessionState(stateToPreserve); // Use Storage module

          // Replace current document content
          document.open();
          document.write(prevStateHtml);
          document.close();
          // The browser should re-run scripts on the new content, including initialization
        } catch (e) {
          logger.logEvent(
            "error",
            `Go Back failed during state preservation or document write: ${e.message}`
          );
          UI.showNotification(`Go Back failed: ${e.message}`, "error");
          // Rollback state preservation if failed
          Storage.removeSessionState(); // Use Storage module
          if (globalState.htmlHistory && prevStateHtml)
            globalState.htmlHistory.push(prevStateHtml); // Put it back if failed
          UI.updateHtmlHistoryControls();
          StateManager.save(); // Save potentially reverted history state
        }
      });

      uiRefs.clearLocalStorageButton?.addEventListener("click", () => {
        if (
          !confirm(
            "WARNING: This will delete ALL Reploid artifacts and saved state from your browser's local storage. This cannot be undone. Are you absolutely sure?"
          )
        )
          return;
        try {
          Storage.clearAllReploidData(); // Use Storage module
          UI.showNotification(
            "LocalStorage cleared successfully. Reloading page.",
            "info",
            0
          ); // Keep message until reload
          setTimeout(() => window.location.reload(), 1000);
        } catch (e) {
          logger.logEvent("error", `Error clearing LocalStorage: ${e.message}`);
          UI.showNotification(
            `Error clearing LocalStorage: ${e.message}`,
            "error"
          );
        }
      });

      // --- Meta Sandbox Controls ---
      uiRefs.approveMetaChangeButton?.addEventListener("click", () => {
        if (metaSandboxPending && globalState?.lastGeneratedFullSource) {
          const sourceToApply = globalState.lastGeneratedFullSource;
          logger.logEvent("info", "Approved meta-change from sandbox.");
          UI.logToTimeline(
            globalState.totalCycles,
            `[STATE] Approved Meta-Sandbox changes. Applying & Reloading...`,
            "info",
            true
          );
          UI.hideMetaSandbox(); // Hides and sets metaSandboxPending = false

          const currentHtml = document.documentElement.outerHTML;
          CycleLogic.saveHtmlToHistory(currentHtml); // Save current state before overwrite

          const stateToPreserve = StateManager.capturePreservationState();
          // stateToPreserve.metaSandboxPending = false; // hideMetaSandbox already did this

          try {
            Storage.saveSessionState(stateToPreserve); // Use Storage module
            document.open();
            document.write(sourceToApply);
            document.close(); // Reloads the page with new content
          } catch (e) {
            logger.logEvent(
              "error",
              `Apply meta-change failed during save/reload: ${e.message}`
            );
            UI.showNotification(`Apply failed: ${e.message}`, "error");
            Storage.removeSessionState(); // Clear bad session state
            if (globalState?.htmlHistory?.length > 0)
              globalState.htmlHistory.pop(); // Remove the bad history entry
            UI.updateHtmlHistoryControls();
            // Might need a full reload if doc.write fails badly
            // window.location.reload(); // Consider force reload on error
          }
        } else {
          UI.showNotification(
            "No sandbox content pending approval or state mismatch.",
            "warn"
          );
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
        UI.hideMetaSandbox(); // Hides sandbox, sets pending to false, enables run button
        if (globalState) globalState.lastGeneratedFullSource = null; // Clear the proposed source
        // Proceed as if human intervention finished with a 'discard' action
        CycleLogic.proceedAfterHumanIntervention(
          "Sandbox Discarded",
          "User discarded changes",
          true
        ); // true = skip cycle increment
      });

      // --- Config Input Listeners ---
      uiRefs.lsdPersonaPercentInput?.addEventListener("input", () => {
        if (
          !globalState ||
          !uiRefs.lsdPersonaPercentInput ||
          !uiRefs.xyzPersonaPercentInput
        )
          return;
        let lsd = parseInt(uiRefs.lsdPersonaPercentInput.value, 10) || 0;
        lsd = Math.max(0, Math.min(100, lsd)); // Clamp value
        globalState.cfg.personaBalance = lsd;
        uiRefs.lsdPersonaPercentInput.value = lsd; // Update UI if clamped
        uiRefs.xyzPersonaPercentInput.value = 100 - lsd; // Update the other slider
        logger.logEvent(
          "info",
          `Config Updated: personaBalance (LSD %) = ${lsd}`
        );
        StateManager.save();
        UI.updateFieldsetSummaries();
      });

      // Generic listeners for other config inputs
      Object.keys(StateManager.getDefaultState().cfg).forEach((key) => {
        // Skip ones handled specially or non-inputs
        if (
          key === "personaBalance" ||
          key === "coreModel" ||
          key === "critiqueModel"
        )
          return;

        // Find the corresponding input element (assuming kebab-case ID + 'Input')
        const inputId = Utils.camelToKabob(key) + "-input";
        const inputEl = uiRefs[Utils.kabobToCamel(inputId)]; // Convert back to camelCase for uiRefs lookup

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
              // Add range validation if min/max attributes are set
              const min = parseFloat(target.min);
              const max = parseFloat(target.max);
              if (!isNaN(min) && value < min) value = min;
              if (!isNaN(max) && value > max) value = max;
              target.value = value; // Update input display if clamped
            } else {
              value = target.value; // String value for text/select etc.
            }

            if (globalState.cfg[key] !== value) {
              globalState.cfg[key] = value;
              logger.logEvent("info", `Config Updated: ${key} = ${value}`);
              // Update specific display elements if needed
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

      // Model Selectors
      uiRefs.coreModelSelector?.addEventListener("change", (e) => {
        if (globalState) {
          globalState.cfg.coreModel = e.target.value;
          logger.logEvent(
            "info",
            `Config Updated: coreModel = ${e.target.value}`
          );
          StateManager.save();
          UI.updateFieldsetSummaries();
        }
      });
      uiRefs.critiqueModelSelector?.addEventListener("change", (e) => {
        if (globalState) {
          globalState.cfg.critiqueModel = e.target.value;
          logger.logEvent(
            "info",
            `Config Updated: critiqueModel = ${e.target.value}`
          );
          StateManager.save();
          UI.updateFieldsetSummaries();
        }
      });

      // --- Fieldset Collapse/Expand ---
      document.querySelectorAll("fieldset legend").forEach((legend) => {
        legend.addEventListener("click", (event) => {
          // Prevent toggling when clicking interactive elements inside the legend
          if (event.target.closest("button, input, a, select, textarea"))
            return;

          const fieldset = legend.closest("fieldset");
          if (fieldset) {
            fieldset.classList.toggle("collapsed");
            // Optional: Update summary when toggling, though it might already be up-to-date
            // UI.updateFieldsetSummaries();
          }
        });
      });

      logger.logEvent("info", "UI Event listeners set up.");
    },
  }; // End UI

  // --- CycleLogic Module ---
  // Uses injected logger, Storage, StateManager, ApiClient, ToolRunner, UI
  const CycleLogic = {
    // getActiveGoalInfo remains the same, reads globalState
    getActiveGoalInfo: () => {
      /* ... as before ... */
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
        cumulativeGoal: globalState.currentGoal.cumulative || "None", // Return seed if cumulative is null
        latestGoal: latestGoal || "Idle",
        type: globalState.currentGoal.latestType || "Idle",
      };
    },

    // getArtifactListSummary remains the same, uses StateManager
    getArtifactListSummary: () => {
      /* ... as before, using StateManager.getAllArtifactMetadata ... */
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

    // getToolListSummary uses injected staticTools and dynamicToolDefinitions from state
    getToolListSummary: () => {
      const staticToolSummary = staticTools // Use the IIFE-scope staticTools definition
        .map((t) => `* [S] ${t.name}: ${t.description}`)
        .join("\n");
      const dynamicToolSummary = dynamicToolDefinitions // Use the IIFE-scope dynamic list
        .map((t) => `* [D] ${t.declaration.name}: ${t.declaration.description}`)
        .join("\n");
      return (
        [staticToolSummary, dynamicToolSummary].filter((s) => s).join("\n") ||
        "None"
      );
    },

    // runCoreIteration remains mostly the same
    // Uses ApiClient.callApiWithRetry and passes UI callbacks
    // Uses ToolRunner.runTool and passes tool lists
    // Manages its own partialOutput state if needed for MAX_TOKENS continuation
    runCoreIteration: async (apiKey, currentGoalInfo) => {
      UI.highlightCoreStep(1); // Analyze Goal/Context
      if (!globalState) throw new Error("Global state is not initialized");

      const personaBalance = globalState.cfg.personaBalance ?? 50;
      const primaryPersona = personaBalance >= 50 ? "LSD" : "XYZ";
      globalState.personaMode = primaryPersona; // Update state

      const corePromptTemplate = Storage.getArtifactContent(
        "reploid.prompt.core",
        0
      ); // Use Storage
      if (!corePromptTemplate)
        throw new Error(
          "Core prompt artifact 'reploid.prompt.core' not found!"
        );

      // --- Build Prompt ---
      let prompt = corePromptTemplate;
      // Replace placeholders (use Utils.trunc where needed)
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
        .replace(/\[\[DYNAMIC_TOOLS_LIST\]\]/g, CycleLogic.getToolListSummary()) // Assumes staticTools is available
        .replace(
          /\[\[RECENT_LOGS\]\]/g,
          Utils.trunc(
            Utils.logger.getLogBuffer().split("\n").slice(-15).join("\n"),
            1000
          )
        ) // Truncate logs
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

      // Add relevant artifact snippets
      const allMeta = StateManager.getAllArtifactMetadata();
      const relevantArtifacts = Object.keys(allMeta)
        .filter(
          (id) =>
            allMeta[id].latestCycle >= 0 &&
            (id.startsWith("target.") ||
              (currentGoalInfo.type === "Meta" && id.startsWith("reploid.")))
        )
        .sort((a, b) => allMeta[b].latestCycle - allMeta[a].latestCycle) // Sort by most recent
        .slice(0, 10); // Limit number of snippets

      let snippets = "";
      for (const id of relevantArtifacts) {
        const meta = StateManager.getArtifactMetadata(id);
        const content = Storage.getArtifactContent(id, meta.latestCycle); // Use Storage
        if (content) {
          snippets += `\n---\ Artifact: ${id} (Cycle ${meta.latestCycle}) ---\n`;
          snippets += Utils.trunc(content, 500); // Truncate snippets
        }
      }
      prompt = prompt.replace(
        /\[\[ARTIFACT_CONTENT_SNIPPETS\]\]/g,
        snippets || "No relevant artifact snippets available."
      );

      // --- API Call Setup ---
      let partialOutput = null; // Local variable for handling MAX_TOKENS continuation
      const sysInstruction = `You are x0. DELIBERATE with yourself (XYZ-2048, LSD-1729, and x0), adopt ${primaryPersona}. Respond ONLY valid JSON matching the specified format. Refer to artifacts by their ID.`;
      const allToolsForApi = [
        ...staticTools,
        ...dynamicToolDefinitions.map((t) => t.declaration),
      ];
      const allFuncDecls = allToolsForApi.map(
        ({ name, description, params }) => ({
          name,
          description,
          parameters: params,
        })
      );
      const coreModel = globalState.cfg.coreModel;
      const startTime = performance.now();
      let tokens = 0;
      let apiResult = null;
      let apiHistory = []; // History for multi-turn calls

      // Log input prompt
      UI.displayCycleArtifact(
        "LLM Input",
        prompt,
        "input",
        false,
        "System",
        "prompt.core",
        globalState.totalCycles
      );
      if (globalState.currentGoal.summaryContext) {
        UI.displayCycleArtifact(
          "LLM Input Context",
          globalState.currentGoal.summaryContext,
          "input",
          false,
          "System",
          "prompt.summary",
          globalState.totalCycles
        );
      }

      // --- API Interaction Loop ---
      try {
        UI.highlightCoreStep(2); // Propose Changes
        let currentPromptText = prompt; // Start with the full prompt
        let isContinuation = false;

        do {
          apiResult = await ApiClient.callApiWithRetry(
            currentPromptText,
            sysInstruction,
            coreModel,
            apiKey,
            allFuncDecls,
            isContinuation,
            apiHistory.length > 0 ? apiHistory : null, // Pass history for multi-turn
            globalState.cfg.maxRetries, // Pass max retries from config
            // Pass UI update callbacks
            UI.updateStatus,
            UI.logToTimeline,
            UI.updateTimelineItem
          );

          tokens += apiResult.tokenCount || 0;

          // Add to history for potential multi-turn
          // User part only added on first turn if not already added
          if (!isContinuation && apiHistory.length === 0) {
            apiHistory.push({ role: "user", parts: [{ text: prompt }] }); // Add initial user prompt
          }
          // Add model response/function call to history
          if (apiResult.rawResp?.candidates?.[0]?.content) {
            apiHistory.push(apiResult.rawResp.candidates[0].content);
          }

          isContinuation = false; // Assume next turn is not a continuation unless set below
          currentPromptText = null; // Clear prompt for next turn unless set

          if (apiResult.type === "functionCall") {
            isContinuation = true; // Need to call API again with function result
            const fc = apiResult.content;
            UI.updateStatus(`Running Tool: ${fc.name}...`, true);
            let toolLogItem = UI.logToTimeline(
              globalState.totalCycles,
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
              globalState.totalCycles
            );

            let funcRespContent;
            try {
              // Pass static and dynamic tools to ToolRunner
              const toolResult = await ToolRunner.runTool(
                fc.name,
                fc.args,
                apiKey,
                staticTools,
                dynamicToolDefinitions
              );
              // Stringify result for API
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
                globalState.totalCycles
              );
            } catch (e) {
              logger.logEvent(
                "error",
                `Tool execution failed for ${fc.name}: ${e.message}`
              );
              // Send error back to LLM
              funcRespContent = {
                name: fc.name,
                response: { error: `Tool execution failed: ${e.message}` },
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
                globalState.totalCycles
              );
            }

            UI.updateStatus(
              `Calling Gemini (${coreModel}) (tool resp)...`,
              true
            );
            // Add function response to history
            apiHistory.push({
              role: "function",
              parts: [{ functionResponse: funcRespContent }],
            });
            apiResult = null; // Clear result, loop will call API again
          } else if (apiResult.finishReason === "MAX_TOKENS") {
            isContinuation = true; // Need to call API again to continue generation
            if (apiResult.type === "text") {
              partialOutput = (partialOutput || "") + apiResult.content; // Append partial text
            }
            logger.logEvent(
              "warn",
              "MAX_TOKENS reached. Continuing generation."
            );
            UI.logToTimeline(
              globalState.totalCycles,
              `[API WARN] MAX_TOKENS reached. Continuing...`,
              "warn",
              true
            );
            UI.updateStatus(
              `Calling Gemini (${coreModel}) (MAX_TOKENS cont)...`,
              true
            );
            // No need to add anything to history here, just call API again with same history
            apiResult = null; // Clear result, loop will call API again
          } else if (apiResult.finishReason === "SAFETY") {
            throw new Error("Iteration stopped due to API Safety Filter.");
          }
          // Add other finish reason checks if necessary (e.g., RECITATION)
        } while (isContinuation); // Loop if function call or MAX_TOKENS

        UI.updateStatus("Processing Response...");

        if (!apiResult) {
          // Should have a final result by now
          throw new Error(
            "API interaction loop finished without a final text response."
          );
        }

        if (apiResult.type === "text") {
          const raw = (partialOutput || "") + (apiResult.content || ""); // Combine partial and final text
          partialOutput = null; // Reset partial output tracker
          logger.logEvent("info", `LLM core response length: ${raw.length}.`);

          const sanitized = ApiClient.sanitizeLlmJsonResp(raw); // Use ApiClient's sanitizer
          const cycleMs = performance.now() - startTime;
          let parsedResp;

          UI.displayCycleArtifact(
            "LLM Output Raw",
            raw,
            "info",
            false,
            "LLM",
            "llm.raw",
            globalState.totalCycles
          );
          UI.displayCycleArtifact(
            "LLM Output Sanitized",
            sanitized,
            "output",
            false,
            "LLM",
            "llm.sanitized",
            globalState.totalCycles
          );

          try {
            parsedResp = JSON.parse(sanitized);
            logger.logEvent("info", "Parsed LLM JSON successfully.");
            UI.logToTimeline(
              globalState.totalCycles,
              `[LLM OK] Received and parsed response.`
            );
          } catch (e) {
            logger.logEvent(
              "error",
              `LLM JSON parse failed: ${e.message}. Content: ${Utils.trunc(
                sanitized,
                500
              )}`
            );
            UI.logToTimeline(
              globalState.totalCycles,
              `[LLM ERR] Invalid JSON response.`,
              "error"
            );
            UI.displayCycleArtifact(
              "Parse Error",
              e.message,
              "error",
              false,
              "System",
              "parse.error",
              globalState.totalCycles
            );
            throw new Error(`LLM response was not valid JSON: ${e.message}`);
          }

          // Update token history in global state
          globalState.tokenHistory.push(tokens);
          if (globalState.tokenHistory.length > 20)
            globalState.tokenHistory.shift();
          globalState.avgTokens =
            globalState.tokenHistory.length > 0
              ? globalState.tokenHistory.reduce((a, b) => a + b, 0) /
                globalState.tokenHistory.length
              : 0;
          globalState.contextTokenEstimate += tokens; // Increment context estimate
          UI.checkContextTokenWarning(); // Check threshold

          return {
            response: parsedResp,
            cycleTimeMillis: cycleMs,
            error: null,
          };
        } else {
          // Should be 'text' or 'empty' if loop exited correctly
          logger.logEvent(
            "warn",
            `Unexpected final API response type: ${apiResult?.type}`
          );
          UI.logToTimeline(
            globalState.totalCycles,
            `[API WARN] Unexpected final response type: ${apiResult?.type}. Treating as empty.`,
            "warn"
          );
          // Return a minimal response indicating failure/emptiness
          return {
            response: {
              agent_confidence_score: 0.0,
              proposed_changes_description: "(No valid response)",
            },
            cycleTimeMillis: performance.now() - startTime,
            error: `Unexpected API response type: ${apiResult?.type}`,
          };
        }
      } catch (error) {
        // Catch errors from API calls or parsing
        partialOutput = null; // Reset partial output on error
        logger.logEvent("error", `Core Iteration failed: ${error.message}`);
        UI.logToTimeline(
          globalState.totalCycles,
          `[CYCLE ERR] ${error.message}`,
          "error"
        );
        const cycleMs = performance.now() - startTime;

        // Update token count even on error if some tokens were used
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

        return {
          response: null,
          cycleTimeMillis: cycleMs,
          error: error.message,
        };
      } finally {
        UI.updateStatus("Idle");
        UI.highlightCoreStep(-1); // Clear step highlight
      }
    },

    // runAutoCritique remains mostly the same, uses Storage, ApiClient, UI callbacks
    runAutoCritique: async (apiKey, llmProposal, goalInfo) => {
      UI.highlightCoreStep(5); // Critique Step
      UI.updateStatus("Running Auto-Critique...", true);
      if (!globalState)
        throw new Error("Global state not initialized for critique");

      const template = Storage.getArtifactContent("reploid.prompt.critique", 0); // Use Storage
      if (!template)
        throw new Error(
          "Critique prompt artifact 'reploid.prompt.critique' not found!"
        );

      let prompt = template;
      const critiqueModel = globalState.cfg.critiqueModel;

      // Populate critique prompt template
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
        ) // Truncate heavily
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
        'Critiquer x0. Analyze objectively based on inputs. Output ONLY valid JSON: {"critique_passed": boolean, "critique_report": "string"}';
      UI.displayCycleArtifact(
        "Critique Input",
        prompt,
        "input",
        false,
        "System",
        "prompt.critique",
        globalState.totalCycles
      );

      try {
        const apiResp = await ApiClient.callApiWithRetry(
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
          UI.updateTimelineItem // Pass UI callbacks
        );

        if (apiResp.type === "text") {
          UI.displayCycleArtifact(
            "Critique Output Raw",
            apiResp.content,
            "info",
            false,
            "LLM",
            "critique.raw",
            globalState.totalCycles
          );
          const sanitized = ApiClient.sanitizeLlmJsonResp(apiResp.content);
          UI.displayCycleArtifact(
            "Critique Output Sanitized",
            sanitized,
            "output",
            false,
            "LLM",
            "critique.sanitized",
            globalState.totalCycles
          );

          try {
            const parsedCritique = JSON.parse(sanitized);
            if (
              typeof parsedCritique.critique_passed !== "boolean" ||
              typeof parsedCritique.critique_report !== "string"
            ) {
              throw new Error(
                "Critique JSON missing required fields or invalid types."
              );
            }
            UI.logToTimeline(
              globalState.totalCycles,
              `[CRITIQUE] Auto-Critique completed. Passed: ${parsedCritique.critique_passed}`
            );
            return parsedCritique;
          } catch (e) {
            logger.logEvent(
              "error",
              `Critique JSON parse/validation failed: ${
                e.message
              }. Content: ${Utils.trunc(sanitized, 300)}`
            );
            UI.logToTimeline(
              globalState.totalCycles,
              `[CRITIQUE ERR] Invalid JSON response format.`,
              "error"
            );
            UI.displayCycleArtifact(
              "Critique Parse Error",
              e.message,
              "error",
              false,
              "System",
              "critique.parse.error",
              globalState.totalCycles
            );
            return {
              critique_passed: false,
              critique_report: `Critique response invalid JSON format: ${e.message}`,
            }; // Fail safely
          }
        } else {
          logger.logEvent(
            "warn",
            `Critique API returned non-text response type: ${apiResp.type}.`
          );
          UI.logToTimeline(
            globalState.totalCycles,
            `[CRITIQUE ERR] Non-text response received.`,
            "error"
          );
          return {
            critique_passed: false,
            critique_report: `Critique API failed (non-text response: ${apiResp.type}).`,
          }; // Fail safely
        }
      } catch (e) {
        logger.logEvent("error", `Critique API call failed: ${e.message}`);
        UI.logToTimeline(
          globalState.totalCycles,
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
          globalState.totalCycles
        );
        return {
          critique_passed: false,
          critique_report: `Critique API failed: ${e.message}`,
        }; // Fail safely
      } finally {
        UI.updateStatus("Idle");
        UI.highlightCoreStep(-1);
      }
    },

    // runSummarization remains mostly the same, uses Storage, ApiClient, UI callbacks
    runSummarization: async (apiKey, stateSnapshotForSummary) => {
      // No specific core step for this background task? Or maybe reuse 'Analyze'?
      UI.updateStatus("Running Summarization...", true);
      if (!globalState)
        throw new Error("Global state not initialized for summarization");

      const template = Storage.getArtifactContent(
        "reploid.prompt.summarize",
        0
      ); // Use Storage
      if (!template)
        throw new Error(
          "Summarization prompt artifact 'reploid.prompt.summarize' not found!"
        );

      const recentLogs = Utils.logger
        .getLogBuffer()
        .split("\n")
        .slice(-20)
        .join("\n"); // Use Utils.logger
      let prompt = template;
      prompt = prompt.replace(
        /\[\[AGENT_STATE_SUMMARY\]\]/g,
        JSON.stringify(stateSnapshotForSummary, null, 2)
      ); // Use passed snapshot
      prompt = prompt.replace(
        /\[\[RECENT_LOGS\]\]/g,
        Utils.trunc(recentLogs, 1000)
      ); // Truncate logs

      const critiqueModel = globalState.cfg.critiqueModel; // Use critique model for this? Or dedicated model?
      const currentCycle = globalState.totalCycles; // Log against current cycle

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
        const apiResp = await ApiClient.callApiWithRetry(
          prompt,
          'Summarizer x0 (80% XYZ-2048, 20% LSD-1729). Respond ONLY valid JSON: {"summary": "string"}',
          critiqueModel,
          apiKey,
          [],
          false,
          null,
          globalState.cfg.maxRetries,
          UI.updateStatus,
          UI.logToTimeline,
          UI.updateTimelineItem // Pass UI callbacks
        );

        if (apiResp.type === "text") {
          UI.displayCycleArtifact(
            "Summarize Output Raw",
            apiResp.content,
            "info",
            false,
            "LLM",
            "summary.raw",
            currentCycle
          );
          const sanitized = ApiClient.sanitizeLlmJsonResp(apiResp.content);
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
              throw new Error("Summary format incorrect in JSON response.");
            }
          } catch (e) {
            logger.logEvent(
              "error",
              `Summarize JSON parse/validation failed: ${
                e.message
              }. Content: ${Utils.trunc(sanitized, 300)}`
            );
            UI.logToTimeline(
              currentCycle,
              `[CONTEXT ERR] Invalid JSON response from summarizer.`,
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
            throw e; // Re-throw parse error
          }
        } else {
          logger.logEvent(
            "warn",
            `Summarizer API returned non-text response type: ${apiResp.type}.`
          );
          UI.logToTimeline(
            currentCycle,
            `[CONTEXT ERR] Non-text response from summarizer.`,
            "error",
            true
          );
          throw new Error(
            `Summarizer API failed (non-text response: ${apiResp.type}).`
          );
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
        throw e; // Re-throw API error
      } finally {
        UI.updateStatus("Idle");
        // No specific step highlight to clear here
      }
    },

    // applyLLMChanges now uses Storage module and calls StateManager.updateArtifactMetadata *after* successful storage
    applyLLMChanges: (llmResp, currentCycleNum, critiqueSource) => {
      UI.highlightCoreStep(6); // Apply step
      if (!globalState)
        return {
          success: false,
          errors: ["Global state not initialized"],
          nextCycle: currentCycleNum,
        };

      let changesMade = [];
      let errors = [];
      currentLlmResponse = llmResp; // Keep track of the response that led to these changes
      const nextCycleNum = currentCycleNum + 1;

      // Process Modified Artifacts
      (llmResp.modified_artifacts || []).forEach((modArt) => {
        if (!modArt.id || modArt.content === undefined) {
          errors.push(`Invalid modified artifact structure: ID=${modArt.id}`);
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
          // Only save if content actually changed
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
              ); // Use Storage
              // ** Update metadata AFTER successful storage **
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
              errors.push(
                `Failed to save modified artifact ${modArt.id}: ${e.message}`
              );
              UI.displayCycleArtifact(
                "Save Modified Failed",
                e.message,
                "error",
                false,
                critiqueSource,
                modArt.id
              );
            }
          } else {
            // Log that modification was proposed but content was identical
            UI.displayCycleArtifact(
              "Modified Artifact (No Change)",
              currentContent,
              "info",
              false,
              critiqueSource,
              modArt.id,
              currentMeta.latestCycle
            );
          }
          // Special handling for specific artifacts
          if (modArt.id === "target.diagram")
            UI.renderDiagramDisplay(nextCycleNum); // Update diagram preview
          if (modArt.id.startsWith("reploid.")) {
            logger.logEvent(
              "warn",
              `Core artifact ${modArt.id} modified. Changes take effect on next reload/meta-apply.`
            );
          }
        } else {
          errors.push(
            `Attempted to modify non-existent or unversioned artifact: ${modArt.id}`
          );
          UI.displayCycleArtifact(
            "Modify Failed",
            `Artifact ${modArt.id} not found or has no history.`,
            "error",
            false,
            critiqueSource,
            modArt.id
          );
        }
      });

      // Process New Artifacts
      (llmResp.new_artifacts || []).forEach((newArt) => {
        if (!newArt.id || !newArt.type || newArt.content === undefined) {
          errors.push(
            `Invalid new artifact structure: ID=${newArt.id || "undefined"}`
          );
          UI.displayCycleArtifact(
            "New Artifact Invalid",
            JSON.stringify(newArt),
            "error",
            false,
            critiqueSource
          );
          return;
        }
        const existingMeta = StateManager.getArtifactMetadata(newArt.id);
        if (existingMeta && existingMeta.latestCycle >= 0) {
          errors.push(
            `Attempted to create new artifact with existing ID: ${newArt.id}`
          );
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
            Storage.setArtifactContent(newArt.id, nextCycleNum, newArt.content); // Use Storage
            // ** Update metadata AFTER successful storage **
            StateManager.updateArtifactMetadata(
              newArt.id,
              newArt.type,
              newArt.description || `New ${newArt.type} artifact`,
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
              UI.renderDiagramDisplay(nextCycleNum); // Update diagram preview
          } catch (e) {
            errors.push(
              `Failed to save new artifact ${newArt.id}: ${e.message}`
            );
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

      // Process Deleted Artifacts (only affects metadata)
      (llmResp.deleted_artifacts || []).forEach((idToDelete) => {
        const meta = StateManager.getArtifactMetadata(idToDelete);
        if (meta && meta.latestCycle >= 0) {
          StateManager.deleteArtifactMetadata(idToDelete); // Delete metadata
          changesMade.push(`Deleted: ${idToDelete}`);
          UI.displayCycleArtifact(
            "Deleted Artifact (Metadata Removed)",
            idToDelete,
            "output",
            true,
            critiqueSource
          );
          // If diagram deleted, hide the display
          if (
            idToDelete === "target.diagram" &&
            uiRefs.diagramDisplayContainer
          ) {
            uiRefs.diagramDisplayContainer.classList.add("hidden");
          }
        } else {
          errors.push(
            `Attempted to delete non-existent artifact: ${idToDelete}`
          );
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

      // Process Tool Definition Changes
      if (llmResp.proposed_new_tool_declaration) {
        const decl = llmResp.proposed_new_tool_declaration;
        const impl = llmResp.generated_tool_implementation_js || "";
        UI.displayCycleArtifact(
          "Proposed Tool Declaration",
          JSON.stringify(decl, null, 2),
          "output",
          true,
          critiqueSource
        );
        UI.displayCycleArtifact(
          "Generated Tool Implementation",
          impl,
          "output",
          true,
          critiqueSource
        );

        // Basic validation
        if (decl.name && decl.description && decl.params && impl) {
          const existingIndex = dynamicToolDefinitions.findIndex(
            (t) => t.declaration.name === decl.name
          );
          const toolEntry = { declaration: decl, implementation: impl };
          let toolChangeType = "";
          if (existingIndex !== -1) {
            dynamicToolDefinitions[existingIndex] = toolEntry; // Update existing
            toolChangeType = `Tool Updated: ${decl.name}`;
          } else {
            dynamicToolDefinitions.push(toolEntry); // Add new
            toolChangeType = `Tool Defined: ${decl.name}`;
          }
          globalState.dynamicTools = [...dynamicToolDefinitions]; // Update state
          changesMade.push(toolChangeType);
          UI.logToTimeline(
            currentCycleNum,
            `[ARTIFACT] ${toolChangeType}`,
            "info",
            true
          );
        } else {
          errors.push(`Invalid tool definition/implementation provided.`);
          UI.logToTimeline(
            currentCycleNum,
            `[APPLY ERR] Tool definition/implementation invalid or incomplete.`,
            "error",
            true
          );
        }
      } else {
        // Log that no tool changes were proposed if needed for clarity
        // UI.displayCycleArtifact("Tool Generation", "(Not Proposed)", "info", false, critiqueSource);
      }

      // Handle Full HTML Source Generation (triggers Sandbox)
      if (llmResp.full_html_source) {
        globalState.lastGeneratedFullSource = llmResp.full_html_source; // Store proposed source
        changesMade.push("Generated Full HTML Source (Sandbox)");
        UI.displayCycleArtifact(
          "Full HTML Source",
          "(Prepared for Sandbox)",
          "output",
          true,
          critiqueSource
        );
        UI.logToTimeline(
          currentCycleNum,
          `[APPLY] SELF-MOD (Full Source) generated. Sandbox review required.`,
          "info",
          true
        );
        UI.showMetaSandbox(llmResp.full_html_source); // Show the sandbox UI
        // Return immediately, cycle pauses here awaiting sandbox approval/discard
        return {
          success: errors.length === 0, // Reflect errors encountered SO FAR
          changes: changesMade,
          errors: errors,
          nextCycle: currentCycleNum, // Cycle does NOT advance yet
        };
      }

      // --- Final Updates ---
      const targetArtifactChanged = changesMade.some(
        (c) =>
          c.includes("target.head") ||
          c.includes("target.body") ||
          c.includes("target.style") ||
          c.includes("target.script") ||
          c.includes("target.diagram")
      );

      // Re-render external UI preview if target artifacts changed and no errors
      if (targetArtifactChanged && errors.length === 0) {
        UI.logToTimeline(
          currentCycleNum,
          `[APPLY] Applying changes to target artifacts for Cycle ${nextCycleNum}. Rendering UI Preview.`,
          "info",
          true
        );
        UI.renderGeneratedUI(nextCycleNum); // Render using potentially new content
      }

      // Log overall apply status
      UI.logToTimeline(
        currentCycleNum,
        `[APPLY] Changes saved for Cycle ${nextCycleNum} from ${critiqueSource}: ${
          changesMade.join(", ") || "None"
        }. Errors: ${errors.length}`,
        errors.length > 0 ? "warn" : "info",
        true
      );

      // Increment cycle count ONLY if application was successful
      if (errors.length === 0) {
        globalState.totalCycles = nextCycleNum; // Advance cycle number
      }

      // Update confidence history regardless of errors? Yes, reflects agent's output.
      const confidence = llmResp.agent_confidence_score ?? 0.0;
      globalState.confidenceHistory.push(confidence);
      if (globalState.confidenceHistory.length > 20)
        globalState.confidenceHistory.shift();
      UI.updateMetricsDisplay(); // Update metrics display

      // Return final status
      return {
        success: errors.length === 0,
        changes: changesMade,
        errors: errors,
        nextCycle: errors.length === 0 ? nextCycleNum : currentCycleNum, // Return the *actual* current cycle number
      };
    },

    // proceedAfterHumanIntervention remains mostly the same
    // Uses Storage and calls StateManager.updateArtifactMetadata *after* success
    proceedAfterHumanIntervention: (
      feedbackType,
      feedbackData = "",
      skipCycleIncrement = false
    ) => {
      if (!globalState) return;
      const currentCycle = globalState.totalCycles;
      let nextCycle = currentCycle; // Default to current cycle
      let feedbackMsg = feedbackData;
      let applySuccess = true;

      // Process Code Edit specifically
      if (feedbackType === "Human Code Edit") {
        feedbackMsg = `Edited ${feedbackData.id}: ${feedbackData.summary}`;
        if (feedbackData.success && feedbackData.id !== "full_html_source") {
          // Don't save full source edits as artifacts
          nextCycle = currentCycle + 1; // Tentatively advance cycle
          try {
            Storage.setArtifactContent(
              feedbackData.id,
              nextCycle,
              feedbackData.newContent
            ); // Use Storage
            // ** Update metadata AFTER successful storage **
            const currentMeta = StateManager.getArtifactMetadata(
              feedbackData.id
            ); // Get type etc.
            StateManager.updateArtifactMetadata(
              feedbackData.id,
              currentMeta.type,
              currentMeta.description,
              nextCycle
            );

            UI.displayCycleArtifact(
              `Human Edit Applied`,
              feedbackData.newContent,
              "info",
              true,
              "Human",
              feedbackData.id,
              nextCycle
            );
            logger.logEvent(
              "info",
              `Human edit applied to artifact ${feedbackData.id} for cycle ${nextCycle}`
            );
            UI.logToTimeline(
              currentCycle,
              `[HUMAN] Applied edit to ${feedbackData.id} for cycle ${nextCycle}`,
              "info",
              true
            );

            // Update previews if necessary
            if (feedbackData.id.startsWith("target."))
              UI.renderGeneratedUI(nextCycle);
            if (feedbackData.id === "target.diagram")
              UI.renderDiagramDisplay(nextCycle);
          } catch (e) {
            logger.logEvent(
              "error",
              `Failed saving human edit for ${feedbackData.id}: ${e.message}`
            );
            UI.showNotification(
              `Failed saving human edit: ${e.message}`,
              "error"
            );
            applySuccess = false;
            nextCycle = currentCycle; // Revert cycle advancement on error
          }
        } else if (feedbackData.id === "full_html_source") {
          // Full source was handled during event listener, just log here
          logger.logEvent("info", `Human edit for full_html_source processed.`);
          // Cycle number might have been skipped depending on listener logic
          applySuccess = true; // Assume listener handled success state
        } else {
          applySuccess = false; // If feedbackData.success was false
        }
      } else if (feedbackType === "Human Options") {
        feedbackMsg = `Selected: ${feedbackData}`;
      }

      // Update global state based on intervention outcome
      globalState.lastFeedback = `${feedbackType}: ${Utils.trunc(
        feedbackMsg,
        150
      )}`; // Truncate feedback
      // Record critique history: treat failed edits or discards as critique failures
      globalState.critiqueFailHistory.push(
        !applySuccess ||
          feedbackType.includes("Fail") ||
          feedbackType.includes("Discarded")
      );
      if (globalState.critiqueFailHistory.length > 20)
        globalState.critiqueFailHistory.shift();

      // Increment human intervention count if applicable
      if (feedbackType.startsWith("Human") && !skipCycleIncrement) {
        globalState.humanInterventions++;
      }

      // Advance cycle count if intervention was successful and not skipped
      if (applySuccess && !skipCycleIncrement) {
        // If nextCycle wasn't already advanced by code edit logic, advance it now
        if (nextCycle === currentCycle) {
          nextCycle = currentCycle + 1;
        }
        globalState.totalCycles = nextCycle;
      } else {
        // Ensure nextCycle reflects the actual current cycle if advancement failed or was skipped
        nextCycle = globalState.totalCycles;
      }

      // Summarize the previous cycle log item
      const summaryOutcome =
        !applySuccess ||
        feedbackType.includes("Fail") ||
        feedbackType.includes("Discarded")
          ? `Failed (${feedbackType})`
          : `OK (${feedbackType})`;
      UI.summarizeCompletedCycleLog(lastCycleLogItem, summaryOutcome);
      lastCycleLogItem = null; // Clear the reference

      // Log the end of intervention processing
      UI.logToTimeline(
        currentCycle,
        `[STATE] ${feedbackType} processed. Feedback: "${Utils.trunc(
          feedbackMsg,
          70
        )}..." Next Cycle: ${globalState.totalCycles}`,
        "info"
      );

      // Reset UI and state for next cycle
      UI.hideHumanInterventionUI();
      globalState.personaMode =
        globalState.cfg.personaBalance < 50 ? "XYZ" : "LSD"; // Reset persona based on config
      globalState.retryCount = 0; // Reset retry count
      UI.updateStateDisplay(); // Update all displays
      UI.clearCurrentCycleDetails(); // Clear details pane
      UI.logToTimeline(
        globalState.totalCycles,
        `[STATE] Ready for next action.`
      );
      if (uiRefs.goalInput) uiRefs.goalInput.value = ""; // Clear goal input
      if (uiRefs.runCycleButton) {
        uiRefs.runCycleButton.textContent = "Run Cycle";
        uiRefs.runCycleButton.disabled = false; // Re-enable button
      }
      UI.updateStatus("Idle");
      UI.highlightCoreStep(-1); // Clear step highlight
      StateManager.save(); // Save state after intervention
    },

    // saveHtmlToHistory remains the same, uses globalState, UI, logger
    saveHtmlToHistory: (htmlContent) => {
      /* ... as before, using logger.logEvent, UI.updateHtmlHistoryControls */
      if (!globalState) return;
      const limit = globalState.cfg?.htmlHistoryLimit ?? 5;
      if (!globalState.htmlHistory) globalState.htmlHistory = [];

      globalState.htmlHistory.push(htmlContent);
      while (globalState.htmlHistory.length > limit) {
        globalState.htmlHistory.shift(); // Remove oldest entry
      }
      UI.updateHtmlHistoryControls(); // Update UI display
      logger.logEvent(
        "info",
        `Saved current HTML state to history. Size: ${globalState.htmlHistory.length}`
      );
    },

    // handleSummarizeContext remains mostly the same, uses Storage, StateManager, ApiClient, UI callbacks
    handleSummarizeContext: async () => {
      if (!globalState || !globalState.apiKey) {
        UI.showNotification(
          "API Key is required for summarizing context.",
          "warn"
        );
        return;
      }
      UI.updateStatus("Summarizing context...", true);
      const currentCycle = globalState.totalCycles;
      const nextCycle = currentCycle + 1; // Summarization advances the cycle

      UI.logToTimeline(
        currentCycle,
        "[CTX] Resetting context - running summarization...",
        "info",
        true
      );
      UI.clearCurrentCycleDetails(); // Clear current details

      try {
        // Create a snapshot of relevant state for the summarizer prompt
        const stateSummary = {
          totalCycles: globalState.totalCycles,
          agentIterations: globalState.agentIterations,
          humanInterventions: globalState.humanInterventions,
          failCount: globalState.failCount,
          currentGoal: {
            // Only include essential goal info
            seed: Utils.trunc(globalState.currentGoal.seed, 200),
            cumulative: Utils.trunc(globalState.currentGoal.cumulative, 500),
            latestType: globalState.currentGoal.latestType,
          },
          lastCritiqueType: globalState.lastCritiqueType,
          lastFeedback: Utils.trunc(globalState.lastFeedback, 200),
          avgConfidence: globalState.avgConfidence?.toFixed(2),
          critiqueFailRate: globalState.critiqueFailRate?.toFixed(1),
          dynamicTools: dynamicToolDefinitions.map((t) => t.declaration.name), // List tool names
          artifactOverview: Object.values(StateManager.getAllArtifactMetadata())
            .map((a) => `${a.id}(${a.type},C${a.latestCycle})`) // Concise overview
            .join(", "),
        };

        const summaryText = await CycleLogic.runSummarization(
          globalState.apiKey,
          stateSummary
        );

        // Save the summary as a new artifact version
        Storage.setArtifactContent(
          "meta.summary_context",
          nextCycle,
          summaryText
        ); // Use Storage
        // ** Update metadata AFTER saving **
        StateManager.updateArtifactMetadata(
          "meta.summary_context",
          "TEXT",
          "Last Auto-Generated Context Summary",
          nextCycle
        );

        // Update global state with the new summary and reset context estimate
        globalState.currentGoal.summaryContext = summaryText;
        globalState.contextTokenEstimate =
          Math.round((summaryText.length / 4) * 1.1) + 500; // Estimate new token count
        globalState.lastFeedback = `Context automatically summarized at Cycle ${currentCycle}.`;
        globalState.lastCritiqueType = "Context Summary";
        globalState.totalCycles = nextCycle; // Advance cycle

        UI.logToTimeline(
          currentCycle,
          `[CTX] Context summarized. Saved as meta.summary_context_${nextCycle}. New est. tokens: ${globalState.contextTokenEstimate.toLocaleString()}. Ready for next goal.`,
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
        UI.showNotification(
          "Context summarized and saved. Ready for next goal.",
          "info"
        );
      } catch (error) {
        logger.logEvent(
          "error",
          `Context summarization failed: ${error.message}`
        );
        UI.showNotification(
          `Context summarization failed: ${error.message}`,
          "error"
        );
        UI.logToTimeline(
          currentCycle,
          `[CTX ERR] Context summarization failed: ${error.message}`,
          "error"
        );
        // Do NOT advance cycle count if summarization fails
      } finally {
        UI.updateStateDisplay(); // Update UI reflecting new cycle count/state
        UI.updateStatus("Idle");
        // No specific step highlight for summarization
        StateManager.save(); // Save the updated state (new cycle, summary context, etc.)
      }
    },

    // executeCycle remains the main orchestrator
    // Uses other CycleLogic methods, StateManager, UI, Storage
    executeCycle: async () => {
      if (!globalState) {
        UI.showNotification("State not initialized!", "error");
        return;
      }
      if (metaSandboxPending) {
        UI.showNotification(
          "Cannot run cycle while Meta Sandbox is pending.",
          "warn"
        );
        return;
      }
      if (!uiRefs.humanInterventionSection?.classList.contains("hidden")) {
        UI.showNotification(
          "Cannot run cycle while Human Intervention is required.",
          "warn"
        );
        return;
      }

      // Summarize previous log if interrupted
      if (lastCycleLogItem)
        UI.summarizeCompletedCycleLog(lastCycleLogItem, "Interrupted");

      UI.clearCurrentCycleDetails();
      currentLlmResponse = null; // Reset last response

      // Ensure API key is available
      globalState.apiKey =
        uiRefs.apiKeyInput.value.trim() || APP_CONFIG.API_KEY; // Update from input
      if (
        !globalState.apiKey ||
        globalState.apiKey === "<nope>" ||
        globalState.apiKey.length < 10
      ) {
        UI.showNotification(
          "Valid Gemini API Key required in config or input field.",
          "warn"
        );
        return;
      }

      // --- Goal Definition (Step 1) ---
      UI.logCoreLoopStep(globalState.totalCycles, 0, "Define Goal");
      const goalText = uiRefs.goalInput.value.trim();
      const goalTypeElement = document.querySelector(
        'input[name="goalType"]:checked'
      );
      const goalType = goalTypeElement ? goalTypeElement.value : "System"; // Default goal type

      // Require initial goal if none exists
      if (!goalText && !globalState.currentGoal.seed) {
        UI.showNotification("Initial Goal Input required.", "warn");
        return;
      }

      // Check max cycles limit
      const maxC = globalState.cfg.maxCycles || 0;
      if (maxC > 0 && globalState.totalCycles >= maxC) {
        UI.showNotification(`Max cycles (${maxC}) reached.`, "info");
        if (uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = true;
        return;
      }

      // Check context token warning threshold
      if (globalState.contextTokenEstimate >= CTX_WARN_THRESH) {
        UI.showNotification(
          "Context token estimate is high. Consider summarizing context.",
          "warn"
        );
        // Optionally, force summarization or require user confirmation?
      }

      const currentCycle = globalState.totalCycles;
      const newGoalProvided = !!goalText;

      // Update cumulative goal if new input provided
      if (newGoalProvided) {
        if (!globalState.currentGoal.seed) {
          // First goal ever
          globalState.currentGoal.seed = goalText;
          globalState.currentGoal.cumulative = goalText;
          globalState.currentGoal.latestType = goalType;
        } else {
          // Subsequent goal/refinement
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
        // This case should be caught earlier, but double-check
        UI.showNotification(
          "No goal provided and no seed goal exists.",
          "error"
        );
        return;
      }
      // Goal is now set (either new or existing)
      const goalInfo = CycleLogic.getActiveGoalInfo();
      globalState.retryCount = 0; // Reset retry count for the new cycle

      // --- UI Updates & Logging Start ---
      if (uiRefs.currentCycleNumber)
        uiRefs.currentCycleNumber.textContent = currentCycle;
      if (uiRefs.runCycleButton) {
        uiRefs.runCycleButton.disabled = true;
        uiRefs.runCycleButton.textContent = "Processing...";
      }
      UI.updateStatus("Starting Cycle...", true);
      UI.updateStateDisplay(); // Reflect new goal info, etc.
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
      UI.renderDiagramDisplay(currentCycle); // Show diagram for current state

      // --- Core Iteration Attempt Loop (Handles Retries) ---
      let iterationResult = null;
      let successfulIteration = false;
      do {
        UI.logToTimeline(
          currentCycle,
          `[STATE] Starting Agent Iteration Attempt (Retry: ${globalState.retryCount})`,
          "info",
          true
        );
        iterationResult = await CycleLogic.runCoreIteration(
          globalState.apiKey,
          goalInfo
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
              `[RETRY] Max retries (${globalState.cfg.maxRetries}) exceeded. Forcing Human Intervention.`,
              "error"
            );
            globalState.failCount++; // Increment fail count
            UI.updateMetricsDisplay();
            UI.showHumanInterventionUI(
              "prompt",
              `Cycle failed after ${globalState.retryCount} attempts: ${
                iterationResult.error || "Unknown error"
              }`
            );
            StateManager.save(); // Save state before pausing for HITL
            return; // Exit cycle execution
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
            ); // Exponential backoff?
          }
        } else {
          successfulIteration = true;
          globalState.retryCount = 0; // Reset on success
          UI.logToTimeline(
            currentCycle,
            `[STATE] Agent Iteration successful.`,
            "info",
            true
          );
        }
      } while (!successfulIteration);

      // --- Process Successful Iteration Result ---
      currentLlmResponse = iterationResult.response; // Store the successful response

      // Display key parts of the LLM response
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

      // --- Critique Trigger Check (Step 5) ---
      UI.logCoreLoopStep(currentCycle, 4, "Critique Trigger Check");
      const { cycleTimeMillis } = iterationResult;
      const cycleSecs = cycleTimeMillis / 1000;
      const confidence = currentLlmResponse.agent_confidence_score ?? 0.0;
      const pauseThresh = globalState.cfg.pauseAfterCycles || 0;
      const confThresh = globalState.cfg.autoCritiqueThresh ?? 0.6;
      const humanProb = (globalState.cfg.humanReviewProb ?? 50) / 100.0;
      const llmProb = (globalState.cfg.llmCritiqueProb ?? 50) / 100.0;
      const maxTime = globalState.cfg.maxCycleTime ?? 600;

      let humanNeeded = false;
      let critReason = "";
      let hitlModePref = "prompt"; // Default HITL mode

      // Determine if human intervention is needed
      if (globalState.forceHumanReview) {
        humanNeeded = true;
        critReason = "Forced Review";
        globalState.forceHumanReview = false; // Reset flag
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
        hitlModePref = "code_edit"; // Prefer code edit on random review
      } else if (cycleSecs > maxTime) {
        humanNeeded = true;
        critReason = `Time Limit Exceeded (${cycleSecs.toFixed(
          1
        )}s > ${maxTime}s)`;
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
        )}. Human Needed: ${humanNeeded ? critReason : "No"}.`,
        "info",
        true
      );

      let critiquePassed = false;
      let critiqueReport = "Critique Skipped";
      let applySource = "Skipped"; // Source for logging changes

      if (humanNeeded) {
        critiquePassed = false; // Human needed means critique effectively "failed" or was bypassed
        critiqueReport = `Human Intervention Required: ${critReason}`;
        applySource = "Human"; // Changes will come from human input
        globalState.lastCritiqueType = `Human (${critReason})`;
        globalState.critiqueFailHistory.push(false); // Human review isn't inherently a critique fail
        UI.updateMetricsDisplay();
        UI.logCoreLoopStep(
          currentCycle,
          5,
          `Critique: Human Intervention (${critReason})`
        );
        UI.updateStatus(`Paused: Human Review (${critReason})`);

        // Determine artifact to suggest for editing
        const firstModifiedId = currentLlmResponse.modified_artifacts?.[0]?.id;
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
        StateManager.save(); // Save state before pausing for HITL
        return; // Exit cycle execution, wait for human
      } else if (Math.random() < llmProb) {
        // Check probability for auto-critique
        UI.logToTimeline(
          currentCycle,
          `[DECIDE] Triggering Auto Critique (${(llmProb * 100).toFixed(
            0
          )}% chance).`,
          "info",
          true
        );
        UI.logCoreLoopStep(currentCycle, 5, "Critique: Auto");
        const critiqueResult = await CycleLogic.runAutoCritique(
          globalState.apiKey,
          currentLlmResponse,
          goalInfo
        );
        critiquePassed = critiqueResult.critique_passed;
        critiqueReport = critiqueResult.critique_report;
        applySource = `AutoCrit ${critiquePassed ? "Pass" : "Fail"}`;
        globalState.lastCritiqueType = `Automated (${
          critiquePassed ? "Pass" : "Fail"
        })`;
        globalState.critiqueFailHistory.push(!critiquePassed); // Record failure if critique_passed is false
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
          "Automated Critique Report",
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
            `[STATE] Auto-Critique failed. Forcing Human Intervention.`,
            "warn",
            true
          );
          globalState.failCount++; // Increment fail count on critique fail
          UI.updateMetricsDisplay();
          UI.showHumanInterventionUI(
            "prompt",
            `Automated Critique Failed: ${Utils.trunc(critiqueReport, 150)}...`
          );
          StateManager.save(); // Save state before pausing
          return; // Exit cycle execution, wait for human
        }
      } else {
        // Critique skipped
        critiquePassed = true; // Effectively passed as it wasn't needed/triggered
        applySource = "Skipped";
        globalState.lastCritiqueType = "Skipped";
        globalState.critiqueFailHistory.push(false); // Skipped is not a fail
        UI.updateMetricsDisplay();
        UI.logCoreLoopStep(currentCycle, 5, "Critique: Skipped");
        UI.logToTimeline(
          currentCycle,
          `[DECIDE] Critique Skipped (Below ${(llmProb * 100).toFixed(
            0
          )}% threshold). Applying directly.`,
          "info",
          true
        );
      }

      // --- Apply Changes (Step 7) ---
      // Only reached if human intervention wasn't required OR auto-critique passed
      if (critiquePassed) {
        UI.updateStatus("Applying Changes...", true);
        UI.logCoreLoopStep(currentCycle, 6, "Refine & Apply");
        const applyResult = CycleLogic.applyLLMChanges(
          currentLlmResponse,
          currentCycle,
          applySource
        );

        // Check if sandbox was triggered - if so, the cycle pauses there
        if (metaSandboxPending) {
          globalState.lastCritiqueType = `${applySource} (Sandbox Pending)`;
          UI.updateStateDisplay();
          UI.updateStatus("Awaiting Meta Sandbox Approval...");
          UI.highlightCoreStep(6); // Keep Apply step highlighted
          StateManager.save(); // Save state before pausing for sandbox
          return; // Exit cycle execution
        }

        // --- Finalize Cycle (If no sandbox) ---
        if (applyResult.success) {
          globalState.agentIterations++; // Increment successful agent iterations
          globalState.lastFeedback = `${applySource}, applied successfully for Cycle ${applyResult.nextCycle}.`;
        } else {
          // Application failed after critique passed/skipped
          globalState.lastFeedback = `${applySource}, but application failed: ${applyResult.errors.join(
            ", "
          )}`;
          globalState.failCount++; // Increment fail count
          UI.updateMetricsDisplay();
          UI.logToTimeline(
            currentCycle,
            `[APPLY ERR] Failed to apply changes: ${applyResult.errors.join(
              ", "
            )}. Forcing Human Intervention.`,
            "error"
          );
          UI.showHumanInterventionUI(
            "prompt",
            `Failed to apply changes after critique: ${applyResult.errors.join(
              ", "
            )}`
          );
          StateManager.save(); // Save state before pausing
          return; // Exit cycle execution
        }

        // Summarize completed log item
        const summaryOutcome = applyResult.success
          ? `OK (${globalState.lastCritiqueType})`
          : `Failed (Apply Fail after ${globalState.lastCritiqueType})`;
        UI.summarizeCompletedCycleLog(lastCycleLogItem, summaryOutcome);
        lastCycleLogItem = null; // Clear ref

        // Prepare for next cycle
        UI.updateStateDisplay(); // Reflect new cycle number, stats
        UI.clearCurrentCycleDetails();
        UI.logCoreLoopStep(applyResult.nextCycle - 1, 7, "Repeat/Pause"); // Log against the cycle that just finished
        UI.logToTimeline(
          globalState.totalCycles,
          `[STATE] Cycle ended (${globalState.lastCritiqueType}). Ready for action.`
        );
        if (uiRefs.goalInput) uiRefs.goalInput.value = ""; // Clear goal input
        if (uiRefs.runCycleButton) {
          uiRefs.runCycleButton.disabled = false;
          uiRefs.runCycleButton.textContent = "Run Cycle";
        }
        UI.updateStatus("Idle");
        UI.highlightCoreStep(-1); // Clear highlight
      } else {
        // This block should technically not be reached if logic above is correct
        logger.logEvent(
          "error",
          "Reached end of cycle execution unexpectedly after critique check."
        );
        UI.updateStatus("Error", false, true);
      }

      StateManager.save(); // Save state at the end of a successful cycle or before exiting
    },
  }; // End CycleLogic

  // --- Initialization Function ---
  const initialize = () => {
    logger.logEvent("info", `Initializing x0 Engine v${Utils.STATE_VERSION}`);
    UI.updateStatus("Initializing...");

    const loadedExistingState = StateManager.init(); // Tries to load state from Storage
    const restoredFromSession = StateManager.restoreStateFromSession(); // Tries to restore state from SessionStorage

    // Only do standard UI setup if NOT restored from session (restore handles its own UI setup)
    if (!restoredFromSession) {
      UI.initializeUIElementReferences(); // Get UI element refs
      if (loadedExistingState) {
        logger.logEvent("info", "Loaded existing state from localStorage.");
        UI.logToTimeline(
          globalState.totalCycles,
          "[STATE] System Initialized (Loaded Session)."
        );
      } else {
        logger.logEvent("info", "Initialized with new default state.");
        UI.logToTimeline(0, "[STATE] System Initialized (New Session).");
        // On first run with new state, maybe save default artifacts from files?
        // This would require fetching logic, perhaps moved from original bootstrap
        // Example: loadDefaultArtifactsIntoStorageIfMissing();
      }
      // Initial UI setup based on loaded/new state
      UI.updateStateDisplay();
      UI.renderGeneratedUI(globalState.totalCycles); // Render initial preview
      UI.displayGenesisState();
      UI.loadPromptsFromLS();
      UI.loadCoreLoopSteps();
    }
    // These run regardless of restore source
    UI.populateModelSelectors(); // Populate dropdowns
    UI.setupEventListeners(); // Setup button clicks, input changes etc.
    UI.highlightCoreStep(-1); // Ensure no step is highlighted initially
    UI.updateStatus("Idle");

    // Collapse fieldsets by default for cleaner initial view
    document
      .querySelectorAll("fieldset")
      .forEach((fs) => fs.classList.add("collapsed"));
    // Expand specific ones if desired
    Utils.$id("controls-fieldset")?.classList.remove("collapsed");
    Utils.$id("current-cycle-details")?.classList.remove("collapsed");

    UI.updateFieldsetSummaries(); // Update summaries after collapsing/expanding

    logger.logEvent("info", "Initialization complete.");
  };

  // --- Public API of REPLOID_CORE ---
  return {
    initialize,
    // Expose other modules/methods if needed for debugging or external interaction
    // _state: StateManager, // For debug
    // _ui: UI,             // For debug
    // _cycle: CycleLogic   // For debug
  };
})();

// --- Auto-Initialize ---
// Ensure the DOM is ready before initializing CORE, especially if not using defer
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", REPLOID_CORE.initialize);
} else {
  REPLOID_CORE.initialize();
}

console.log("reploid_core.js loaded and initialized");
