  const STATE_VERSION = "0.0.0";
  const LS_PREFIX = "x_art_";
  const STATE_KEY = "x0_state_v0.0";
  const SESSION_STATE_KEY = "x0_session_state_v0.0";
  const MAX_ART_TKN_SZ = 65000;
  const CTX_WARN_THRESH = 925000;
  const SVG_NS = "http://www.w3.org/2000/svg";

  let logBuffer = `x0 Engine Log v${STATE_VERSION} - ${new Date().toISOString()}\n=========================================\n`;
  let globalState = null;
  let uiRefs = {};
  let currentLlmResponse = null;
  let metaSandboxPending = false;
  let activeCoreStepIdx = -1;
  let dynamicToolDefinitions = [];
  let artifactMetadata = {};
  let lastCycleLogItem = null;

  const APP_CONFIG = {
      API_KEY: "<nope>",
      PROJECT_ID: "<nope>",
      BASE_GEMINI_MODEL: "gemini-1.5-flash-latest",
      ADVANCED_GEMINI_MODEL: "gemini-1.5-pro-latest",
      // GEMINI_MODEL_OPTIMIZER: "model-optimizer-exp-04-09", // Optimizer might require specific API endpoint/structure, omitting for now
  };

  const staticTools = [
    { name: "code_linter", description: "Analyzes code snippet syntax.", params: { type: "OBJECT", properties: { code: { type: "STRING" }, language: { type: "STRING", enum: ["javascript", "css", "html", "json"], }, }, required: ["code", "language"], }, },
    { name: "json_validator", description: "Validates JSON string structure.", params: { type: "OBJECT", properties: { json_string: { type: "STRING" } }, required: ["json_string"], }, },
    { name: "diagram_schema_validator", description: "Validates diagram JSON schema.", params: { type: "OBJECT", properties: { diagram_json: { type: "OBJECT" } }, required: ["diagram_json"], }, },
    { name: "svg_diagram_renderer", description: "Generates SVG markup string for diagram JSON.", params: { type: "OBJECT", properties: { diagram_json: { type: "OBJECT" } }, required: ["diagram_json"], }, },
    { name: "token_counter", description: "Estimates token count for text.", params: { type: "OBJECT", properties: { text: { type: "STRING" } }, required: ["text"], }, },
    { name: "self_correction", description: "Attempts self-correction based on error.", params: { type: "OBJECT", properties: { failed_task_description: { type: "STRING" }, error_message: { type: "STRING" }, previous_goal: { type: "OBJECT" }, }, required: [ "failed_task_description", "error_message", "previous_goal", ], }, },
  ];

   const cycleFlowData = {
      nodes: [
        { id: "start", label: "Start Cycle", type: "start_end", x: 400, y: 50 },
        { id: "step1", label: "1. Define Goal", type: "step", x: 400, y: 150 },
        { id: "step2", label: "2. Analyze", type: "iteration", x: 400, y: 250 },
        { id: "step3", label: "3. Propose", type: "iteration", x: 400, y: 350 },
        { id: "step4", label: "4. Generate Artifacts", type: "iteration", x: 400, y: 450, },
        { id: "decision_gen", label: "Generation OK?", type: "decision", x: 400, y: 550, },
        { id: "step5", label: "5. Critique Trigger?", type: "decision", x: 400, y: 650, },
        { id: "step7", label: "7. Refine & Apply", type: "step", x: 400, y: 980 },
        { id: "decision_apply", label: "Apply OK?", type: "decision", x: 400, y: 1080, },
        { id: "step6_human", label: "6a. Human\nIntervention", type: "intervention", x: 150, y: 780, },
        { id: "step6_auto", label: "6b. Auto Critique", type: "step", x: 400, y: 780, },
        { id: "decision_auto_crit", label: "Critique Pass?", type: "decision", x: 400, y: 880, },
        { id: "step6_skip", label: "6c. Critique Skipped", type: "step", x: 650, y: 780, },
        { id: "fail_point_gen", label: "Generation\nFailed", type: "fail_point", x: 150, y: 550, },
        { id: "fail_point_apply", label: "Apply\nFailed", type: "fail_point", x: 150, y: 1080, },
        { id: "decision_retry_limit", label: "Retry Limit\nReached?", type: "retry_decision", x: 150, y: 880, },
        { id: "human_intervention_final", label: "Forced Human\nIntervention (Fail)", type: "final_intervention", x: 150, y: 980, },
        { id: "end_success", label: "End\n(Success)", type: "start_end", x: 650, y: 1180, },
        { id: "pause_sandbox", label: "Pause\n(Sandbox Review)", type: "pause", x: 400, y: 1180, },
      ],
      connections: [
        { from: "start", to: "step1", type: "normal" }, { from: "step1", to: "step2", type: "normal" },
        { from: "step2", to: "step3", type: "normal" }, { from: "step3", to: "step4", type: "normal" },
        { from: "step4", to: "decision_gen", type: "normal" },
        { from: "decision_gen", to: "step5", type: "success", label: "OK" },
        { from: "step5", to: "step6_human", type: "normal", label: "Human Req." },
        { from: "step5", to: "step6_auto", type: "normal", label: "Auto-Critique" },
        { from: "step5", to: "step6_skip", type: "normal", label: "Skip Critique" },
        { from: "step6_auto", to: "decision_auto_crit", type: "normal" },
        { from: "decision_auto_crit", to: "step7", type: "success", label: "Pass" },
        { from: "decision_auto_crit", to: "step6_human", type: "fail", label: "Fail", },
        { from: "step6_human", to: "step7", type: "normal", label: "Input Provided", },
        { from: "step6_skip", to: "step7", type: "normal" },
        { from: "human_intervention_final", to: "step7", type: "normal", label: "Input Provided", },
        { from: "step7", to: "decision_apply", type: "normal" },
        { from: "decision_apply", to: "end_success", type: "success", label: "OK" },
        { from: "decision_apply", to: "pause_sandbox", type: "normal", label: "Sandbox", },
        { from: "decision_gen", to: "fail_point_gen", type: "fail", label: "Fail" },
        { from: "decision_apply", to: "fail_point_apply", type: "fail", label: "Fail", },
        { from: "fail_point_gen", to: "decision_retry_limit", type: "normal" },
        { from: "fail_point_apply", to: "decision_retry_limit", type: "normal" },
        { from: "decision_retry_limit", to: "step2", type: "retry", label: "Retry (Limit OK)", },
        { from: "decision_retry_limit", to: "human_intervention_final", type: "fail", label: "Limit Reached", },
      ],
  };

  const logger = {
      logEvent: (level, message) => {
          const ts = new Date().toISOString();
          const fm = `[${ts}] [${level.toUpperCase()}] ${message}`;
          logBuffer += fm + "\n";
          const logFn = console[level] || console.log;
          logFn(fm);
      },
      getLogBuffer: () => logBuffer,
      setLogBuffer: (buffer) => { logBuffer = buffer; }
  };

  const Storage = {
      _get: (key) => { try { return localStorage.getItem(key); } catch (e) { logger.logEvent("error", `LocalStorage GET Error: ${key}, ${e}`); return null; } },
      _set: (key, value) => {
          if (value && value.length > MAX_ART_TKN_SZ) {
              const msg = `Artifact content exceeds size limit (${value.length} > ${MAX_ART_TKN_SZ}) for key: ${key}`;
              logger.logEvent("error", msg);
              UI.showNotification(msg, "error");
              throw new Error(msg);
          }
          try { localStorage.setItem(key, value); } catch (e) {
              logger.logEvent("error", `LocalStorage SET Error: ${key}, ${e}`);
              if (e.name === 'QuotaExceededError' || e.message.toLowerCase().includes('quota')) {
                  UI.showNotification('LocalStorage quota exceeded! Cannot save artifact. Please clear storage or export state.', 'error');
              }
              throw e;
          }
      },
      _remove: (key) => { try { localStorage.removeItem(key); } catch (e) { logger.logEvent("error", `LocalStorage REMOVE Error: ${key}, ${e}`); } },
      _key: (id, cycle = 0) => `${LS_PREFIX}${id}_${cycle}`,

      getArtifactContent: (id, cycle) => Storage._get(Storage._key(id, cycle)),
      setArtifactContent: (id, cycle, content) => {
          Storage._set(Storage._key(id, cycle), content);
          StateManager.updateArtifactMetadata(id, artifactMetadata[id]?.type, artifactMetadata[id]?.description, cycle);
      },
      deleteArtifactVersion: (id, cycle) => Storage._remove(Storage._key(id, cycle)),

      getState: () => { const json = Storage._get(STATE_KEY); return json ? JSON.parse(json) : null; },
      saveState: (stateObj) => Storage._set(STATE_KEY, JSON.stringify(stateObj)),
      removeState: () => Storage._remove(STATE_KEY),

      getSessionState: () => { const json = sessionStorage.getItem(SESSION_STATE_KEY); return json ? JSON.parse(json) : null; },
      saveSessionState: (stateObj) => sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(stateObj)),
      removeSessionState: () => sessionStorage.removeItem(SESSION_STATE_KEY),

      clearAllReploidData: () => {
          logger.logEvent('warn', 'User initiated LocalStorage clear.');
          let keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && (key.startsWith(LS_PREFIX) || key === STATE_KEY)) {
                  keysToRemove.push(key);
              }
          }
          keysToRemove.forEach(key => {
              Storage._remove(key);
              logger.logEvent('info', `Removed key: ${key}`);
          });
          Storage.removeState();
          Storage.removeSessionState();
      }
  };

  const StateManager = {
      getDefaultState: () => ({
          version: STATE_VERSION,
          total-cycles: 0, agentIterations: 0, humanInterventions: 0, failCount: 0,
          currentGoal: { seed: null, cumulative: null, latestType: "Idle", summaryContext: null },
          lastCritiqueType: "N/A", personaMode: "XYZ", lastFeedback: null, forceHumanReview: false,
          apiKey: APP_CONFIG.API_KEY && APP_CONFIG.API_KEY !== "<nope>" ? APP_CONFIG.API_KEY : "",
          confidenceHistory: [], critiqueFailHistory: [], tokenHistory: [], failHistory: [],
          avgConfidence: null, critiqueFailRate: null, avgTokens: null,
          contextTokenEstimate: 0, lastGeneratedFullSource: null, htmlHistory: [],
          lastApiResponse: null, partialOutput: null, retryCount: 0,
          cfg: {
              personaBalance: 50, llmCritiqueProb: 50, humanReviewProb: 50, maxCycleTime: 600,
              autoCritiqueThresh: 0.75, maxCycles: 0, htmlHistoryLimit: 5, pauseAfterCycles: 10, maxRetries: 1,
              coreModel: APP_CONFIG.BASE_GEMINI_MODEL,
              critiqueModel: APP_CONFIG.BASE_GEMINI_MODEL,
          },
          artifactMetadata: {},
          dynamicTools: [],
      }),

      init: () => {
          const savedState = Storage.getState();
          if (savedState && savedState.version?.split('.')[0] === STATE_VERSION.split('.')[0]) {
              globalState = { ...StateManager.getDefaultState(), ...savedState };
              globalState.version = STATE_VERSION;
              dynamicToolDefinitions = globalState.dynamicTools || [];
              artifactMetadata = globalState.artifactMetadata || {};
              logger.logEvent('info', `Loaded state from localStorage for cycle ${globalState.total-cycles}`);
              return true;
          } else {
              if (savedState) {
                 logger.logEvent('warn', `Ignoring incompatible localStorage state (v${savedState.version})`);
                 Storage.removeState();
              }
              globalState = StateManager.getDefaultState();
              artifactMetadata = {
                  'reploid.style.main': { id: 'reploid.style.main', type: 'CSS_STYLESHEET', description: 'REPLOID UI Styles', latestCycle: 0 },
                  'reploid.body.main': { id: 'reploid.body.main', type: 'HTML_BODY', description: 'REPLOID UI Body Structure', latestCycle: 0 },
                  'reploid.script.core': { id: 'reploid.script.core', type: 'JAVASCRIPT_SNIPPET', description: 'REPLOID Core Logic', latestCycle: 0 },
                  'reploid.prompt.core': { id: 'reploid.prompt.core', type: 'PROMPT', description: 'Core Logic/Meta Prompt', latestCycle: 0 },
                  'reploid.prompt.critique': { id: 'reploid.prompt.critique', type: 'PROMPT', description: 'Automated Critique Prompt', latestCycle: 0 },
                  'reploid.prompt.summarize': { id: 'reploid.prompt.summarize', type: 'PROMPT', description: 'Context Summarization Prompt', latestCycle: 0 },
                  'reploid.core_steps': { id: 'reploid.core_steps', type: 'TEXT', description: 'Core Loop Steps List', latestCycle: 0 },
                  'target.head': { id: 'target.head', type: 'HTML_HEAD', description: 'Target UI Head', latestCycle: 0 },
                  'target.body': { id: 'target.body', type: 'HTML_BODY', description: 'Target UI Body', latestCycle: 0 },
                  'target.style.main': { id: 'target.style.main', type: 'CSS_STYLESHEET', description: 'Target UI Styles', latestCycle: 0 },
                  'target.script.main': { id: 'target.script.main', type: 'JAVASCRIPT_SNIPPET', description: 'Target UI Script', latestCycle: 0 },
                  'target.diagram': { id: 'target.diagram', type: 'DIAGRAM_JSON', description: 'Target UI Structure Diagram', latestCycle: 0 },
                  'meta.summary_context': { id: 'meta.summary_context', type: 'TEXT', description: 'Last Auto-Generated Context Summary', latestCycle: 0 },
              };
              globalState.artifactMetadata = artifactMetadata;
              dynamicToolDefinitions = globalState.dynamicTools;
              StateManager.save();
              logger.logEvent('info', 'Initialized new default state.');
              return false;
          }
      },

      getState: () => globalState,
      setState: (newState) => { globalState = newState; },
      save: () => {
          if (!globalState) return;
          try {
              const stateToSave = JSON.parse(JSON.stringify({ ...globalState, lastApiResponse: null }));
              Storage.saveState(stateToSave);
              logger.logEvent('debug', `Saved non-artifact state for cycle ${globalState.total-cycles}`);
          } catch (e) {
              logger.logEvent('error', `Failed to save non-artifact state: ${e.message}`);
              UI.showNotification(`Failed to save state: ${e.message}`, 'error');
          }
      },

      getArtifactMetadata: (id) => artifactMetadata[id] || { id: id, type: 'UNKNOWN', description: 'Unknown Artifact', latestCycle: -1 },
      updateArtifactMetadata: (id, type, description, cycle) => {
          artifactMetadata[id] = {
              id: id, type: type || artifactMetadata[id]?.type || 'UNKNOWN',
              description: description || artifactMetadata[id]?.description || `Artifact ${id}`,
              latestCycle: Math.max(cycle, artifactMetadata[id]?.latestCycle ?? -1)
          };
          if (globalState) globalState.artifactMetadata = artifactMetadata;
      },
      deleteArtifactMetadata: (id) => {
          delete artifactMetadata[id];
          if (globalState) globalState.artifactMetadata = artifactMetadata;
      },
      getAllArtifactMetadata: () => artifactMetadata,

      capturePreservationState: () => {
         const stateToSave = JSON.parse(JSON.stringify({ ...globalState, lastApiResponse: null, }));
         stateToSave.logBuffer = logger.getLogBuffer();
         stateToSave.timelineHTML = uiRefs.timelineLog ? uiRefs.timelineLog.innerHTML : "";
         stateToSave.dynamicToolDefinitions = dynamicToolDefinitions;
         stateToSave.artifactMetadata = artifactMetadata;
         stateToSave.metaSandboxPending = metaSandboxPending;
         return stateToSave;
      },

      restoreStateFromSession: () => {
        const preservedData = Storage.getSessionState();
        if (!preservedData) return false;
        logger.logEvent( "info", "Preserved session state found from self-modification reload." );
        try {
          if ( preservedData.version?.split(".")[0] !== STATE_VERSION.split(".")[0] ) { logger.logEvent( "warn", `Restoring older session state v${preservedData.version}. May have issues.` ); }

          globalState = { ...StateManager.getDefaultState(), ...preservedData };
          globalState.version = STATE_VERSION;
          logger.setLogBuffer(preservedData.logBuffer || `Restored Log ${new Date().toISOString()}\n===\n`);
          dynamicToolDefinitions = preservedData.dynamicTools || [];
          artifactMetadata = preservedData.artifactMetadata || {};
          metaSandboxPending = preservedData.metaSandboxPending || false;
          globalState.dynamicTools = dynamicToolDefinitions;
          globalState.artifactMetadata = artifactMetadata;

          UI.initializeUIElementReferences();
          if (uiRefs.timelineLog) uiRefs.timelineLog.innerHTML = preservedData.timelineHTML || "";
          UI.updateStateDisplay();
          UI.renderDiagramDisplay(globalState.total-cycles);
          UI.renderGeneratedUI(globalState.total-cycles);
          UI.displayGenesisState();
          UI.loadPromptsFromLS();
          UI.loadCoreLoopSteps();

          logger.logEvent("info", "Session state restored after self-modification.");
          UI.logToTimeline( globalState.total-cycles, "[STATE] Restored after self-modification.", "info" );
          if (uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = metaSandboxPending;
          if (uiRefs.runCycleButton) uiRefs.runCycleButton.textContent = "Run Cycle";
          UI.updateStatus( metaSandboxPending ? "Awaiting Meta Sandbox Approval..." : "Idle" );
          StateManager.save();
          return true;
        } catch (e) {
          logger.logEvent("error", `Restore from session storage failed: ${e.message}`);
          UI.showNotification(`Restore failed: ${e.message}. Reinitializing state.`, 'error');
          StateManager.init(); // Reinitialize default state
          UI.initializeUIElementReferences(); // Re-initialize refs for potentially new state
          UI.logToTimeline(0, "[STATE] Restore failed. Reinitialized.", "error");
          UI.updateStatus("Restore Failed", false, true);
        } finally { Storage.removeSessionState(); logger.logEvent("info", "Cleared preserved state from session storage."); }
        return false;
      },

       exportState: () => {
        try {
          const stateData = StateManager.capturePreservationState();
          const fileName = `x0_state_${STATE_VERSION}_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
          const dataStr = JSON.stringify(stateData, null, 2);
          logger.logEvent("info", "State export initiated.");
          const blob = new Blob([dataStr], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = fileName;
          document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
          UI.logToTimeline( globalState.total-cycles, "[STATE] State exported successfully.", "info" );
        } catch (e) {
          logger.logEvent("error", `State export failed: ${e.message}`);
          UI.showNotification(`State export failed: ${e.message}`, 'error');
          UI.logToTimeline( globalState?.total-cycles ?? 0, "[STATE] State export failed.", "error" );
        }
      },

       importState: (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const importedData = JSON.parse(e.target.result);
            if (!importedData.version || importedData.total-cycles === undefined) throw new Error("Imported file missing version or core state data.");
            logger.logEvent("info", `Importing state v${importedData.version}`);
            if ( importedData.version.split(".")[0] !== STATE_VERSION.split(".")[0] ) { logger.logEvent( "warn", `State version mismatch (Imported: ${importedData.version}, Current: ${STATE_VERSION}). Proceeding with caution.` ); }

            globalState = { ...StateManager.getDefaultState(), ...importedData };
            globalState.version = STATE_VERSION;
            logger.setLogBuffer(importedData.logBuffer || logBuffer);
            currentLlmResponse = null;
            metaSandboxPending = false;
            dynamicToolDefinitions = importedData.dynamicTools || [];
            artifactMetadata = importedData.artifactMetadata || {};
            globalState.artifactMetadata = artifactMetadata;
            globalState.dynamicTools = dynamicToolDefinitions;

            UI.initializeUIElementReferences();
            if (uiRefs.timelineLog) uiRefs.timelineLog.innerHTML = importedData.timelineHTML || "";
            UI.clearCurrentCycleDetails();
            UI.updateStateDisplay();
            UI.renderDiagramDisplay(globalState.total-cycles);
            UI.renderGeneratedUI(globalState.total-cycles);
            UI.displayGenesisState();
            UI.loadPromptsFromLS();
            UI.loadCoreLoopSteps();

            logger.logEvent("info", "State imported successfully.");
            UI.logToTimeline( globalState.total-cycles, "[STATE] State imported successfully.", "info" );
            UI.showNotification("State imported successfully. Artifacts are expected to be in LocalStorage.", 'info');
            StateManager.save();
          } catch (err) {
            logger.logEvent("error", `Import failed: ${err.message}`);
            UI.showNotification(`Import failed: ${err.message}`, 'error');
            UI.logToTimeline( globalState?.total-cycles ?? 0, `[STATE] State import failed: ${err.message}`, "error" );
          } finally { if (uiRefs.importFileInput) uiRefs.importFileInput.value = ""; }
        };
        reader.onerror = (e) => {
            logger.logEvent("error", `File read error during import: ${reader.error}`);
            UI.showNotification(`Error reading file: ${reader.error}`, 'error');
            if (uiRefs.importFileInput) uiRefs.importFileInput.value = "";
        };
        reader.readAsText(file);
      },
  };

  const ApiClient = {
      sanitizeLlmJsonResp: (rawText) => {
        if (!rawText || typeof rawText !== 'string') return '{}';
        let s = rawText.trim();
        const codeBlockMatch = s.match(/```(?:json)?\\s*([\\s\\S]*?)\\s*```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
             s = codeBlockMatch[1].trim();
        } else {
             const firstBrace = s.indexOf('{');
             const firstBracket = s.indexOf('[');
             let start = -1;
             if (firstBrace === -1 && firstBracket === -1) return '{}';
             if (firstBrace === -1) start = firstBracket;
             else if (firstBracket === -1) start = firstBrace;
             else start = Math.min(firstBrace, firstBracket);
             if (start === -1) return '{}';
             s = s.substring(start);
        }

        let balance = 0;
        let lastValidIndex = -1;
        const startChar = s[0];
        const endChar = (startChar === '{') ? '}' : (startChar === '[') ? ']' : null;

        if (!endChar) return '{}';

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
            return '{}';
        }

        try {
            JSON.parse(s);
            return s;
        } catch (e) {
            logger.logEvent("warn", `Sanitized JSON still invalid: ${e.message}, Content: ${s.substring(0,100)}...`);
            return '{}';
        }
      },

      callGeminiAPI: async ( prompt, sysInstr, modelName, apiKey, funcDecls = [], isContinuation = false, prevContent = null ) => {
        const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
        logger.logEvent( "info", `Call API: ${modelName}${ isContinuation ? " (Cont)" : "" }` );
        const baseGenCfg = { temperature: 0.777, maxOutputTokens: 8192 };
        const safetySettings = [ "HARASSMENT", "HATE_SPEECH", "SEXUALLY_EXPLICIT", "DANGEROUS_CONTENT", ].map((cat) => ({ category: `HARM_CATEGORY_${cat}`, threshold: "BLOCK_MEDIUM_AND_ABOVE", }));

        const reqBody = {
          contents: prevContent ? [...prevContent, { role: "user", parts: [{ text: prompt }] }] : [{ role: "user", parts: [{ text: prompt }] }],
          safetySettings: safetySettings,
          generationConfig: baseGenCfg,
        };

        if (sysInstr) reqBody.systemInstruction = { role: "system", parts: [{ text: sysInstr }], };
        if (funcDecls?.length > 0) { reqBody.tools = [{ functionDeclarations: funcDecls }]; reqBody.tool_config = { function_calling_config: { mode: "AUTO" } }; }
        else { reqBody.generationConfig.responseMimeType = "application/json"; }

        try {
          const resp = await fetch(`${apiEndpoint}?key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reqBody), });
          if (!resp.ok) {
            let errBody = await resp.text();
            let errJson = {};
            try { errJson = JSON.parse(errBody); } catch (e) {/* ignore */}
            throw new Error( `API Error (${resp.status}): ${ errJson?.error?.message || resp.statusText || "Unknown" }` );
          }
          const data = await resp.json();
          if(globalState) globalState.lastApiResponse = data; // Store raw response in state

          if (data.promptFeedback?.blockReason) throw new Error(`API Blocked: ${data.promptFeedback.blockReason}`);
          if (data.error) throw new Error(`API Error: ${data.error.message || "Unknown"}`);
          if (!data.candidates?.length) {
            if (resp.status === 200 && JSON.stringify(data) === "{}") return { type: "empty", content: null, tokenCount: 0, finishReason: "STOP", rawResp: data, };
            throw new Error("API Invalid Response: No candidates.");
          }

          const cand = data.candidates[0];
          const tokenCount = cand.tokenCount || data.usageMetadata?.totalTokenCount || 0;
          const finishReason = cand.finishReason || "UNKNOWN";

          if ( finishReason !== "STOP" && finishReason !== "MAX_TOKENS" && !cand.content ) {
            if (finishReason === "SAFETY") throw new Error(`API Response Blocked: ${finishReason}`);
            logger.logEvent( "warn", `API finishReason: ${finishReason} with no content.` );
            return { type: "empty", content: null, tokenCount: tokenCount, finishReason: finishReason, rawResp: data, };
          }

          const part = cand.content?.parts?.[0];
          if (!part) {
            logger.logEvent( "info", `API OK. Finish:${finishReason}. Tokens:${tokenCount}. No content part.` );
            return { type: "empty", content: null, tokenCount: tokenCount, finishReason: finishReason, rawResp: data, };
          }

          logger.logEvent( "info", `API OK. Finish:${finishReason}. Tokens:${tokenCount}` );
          if (part.text !== undefined) return { type: "text", content: part.text, tokenCount: tokenCount, finishReason: finishReason, rawResp: data, };
          if (part.functionCall) return { type: "functionCall", content: part.functionCall, tokenCount: tokenCount, finishReason: finishReason, rawResp: data, };

          throw new Error( "API response part contains neither text nor functionCall." );
        } catch (error) {
          logger.logEvent("error", `API Fetch Error: ${error.message}`);
          throw error;
        }
      },

       callApiWithRetry: async ( prompt, sysInstr, modelName, apiKey, funcDecls = [], isCont = false, prevContent = null, retries = globalState.cfg.maxRetries ) => {
          if (!isCont) UI.updateStatus(`Calling Gemini (${modelName})...`, true);
          let logItem = UI.logToTimeline( globalState.total-cycles, `[API] Calling ${modelName}...`, "info", true, true );
          try {
            const result = await ApiClient.callGeminiAPI( prompt, sysInstr, modelName, apiKey, funcDecls, isCont, prevContent );
            UI.updateTimelineItem( logItem, `[API OK:${modelName}] Finish: ${result.finishReason}, Tokens: ${result.tokenCount}`, "info", true );
            return result;
          } catch (error) {
            logger.logEvent( "warn", `API call failed: ${error.message}. Retries left: ${retries}` );
            UI.updateTimelineItem( logItem, `[API ERR:${modelName}] ${error.message.substring(0, 80)} (Retries: ${retries})`, "error", true );
            if ( retries > 0 && (error.message.includes("API Error (5") || error.message.includes("NetworkError") || error.message.includes("Failed to fetch")) ) {
              await new Promise((resolve) => setTimeout(resolve, 1500 * (globalState.cfg.maxRetries - retries + 1)) );
              return ApiClient.callApiWithRetry( prompt, sysInstr, modelName, apiKey, funcDecls, isCont, prevContent, retries - 1 );
            } else { throw error; }
          } finally { if (!isCont) UI.updateStatus("Idle"); }
       }
  };

  const ToolRunner = {
      runTool: async (toolName, toolArgs, apiKey) => {
          logger.logEvent("info", `Run tool: ${toolName}`);
          await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));

          const staticTool = staticTools.find((t) => t.name === toolName);
          if (staticTool) {
              switch (toolName) {
                  case "code_linter":
                      const code = toolArgs.code || ""; let hasError = false;
                      if ( toolArgs.language === "html" && code.includes("<script") && !code.includes("</script>") ) hasError = true;
                      if ( toolArgs.language === "json" || toolArgs.language === "javascript" ) {
                          if ( (code.match(/{/g) || []).length !== (code.match(/}/g) || []).length ) hasError = true;
                          if ( (code.match(/\\(/g) || []).length !== (code.match(/\\)/g) || []).length ) hasError = true;
                      }
                      return { result: `Basic lint ${hasError ? "failed" : "passed"} for ${ toolArgs.language }.`, linting_passed: !hasError, };
                  case "json_validator":
                      try { JSON.parse(toolArgs.json_string); return { result: "JSON structure is valid.", valid: true }; }
                      catch (e) { return { result: `JSON invalid: ${e.message}`, valid: false }; }
                  case "diagram_schema_validator":
                      const d = toolArgs.diagram_json;
                      if ( !d || typeof d !== "object" || !Array.isArray(d.components) || !Array.isArray(d.connections) || d.components.some((c) => !c.id || !c.type) ) { return { result: "Diagram JSON schema invalid.", schema_valid: false, }; }
                      return { result: "Diagram JSON schema appears valid.", schema_valid: true, };
                  case "svg_diagram_renderer":
                      try {
                           const diagramJson = toolArgs.diagram_json;
                           const svgMarkup = UI.renderCycleSVGToMarkup(cycleFlowData); // Using fixed cycleFlowData for now
                           // const svgMarkup = UI.renderCycleSVGToMarkup(diagramJson); // TODO: Use actual diagram content if needed
                           return { svgMarkup: svgMarkup || '<svg><text>Render Error</text></svg>' };
                       }
                      catch (e) { logger.logEvent("error", `SVG rendering tool failed: ${e.message}`); return { error: `Failed to render SVG: ${e.message}` }; }
                  case "token_counter":
                      return { token_estimate: Math.floor((toolArgs.text || "").length / 4), };
                  case "self_correction":
                      logger.logEvent( "warn", "Self-correction tool called (triggering retry logic)." );
                      return { result: "Self-correction acknowledged. Cycle will attempt retry if applicable.", };
                  default:
                      throw new Error(`Unknown static tool: ${toolName}`);
              }
          }

          const dynamicTool = dynamicToolDefinitions.find( (t) => t.declaration.name === toolName );
          if (dynamicTool) {
              if (!dynamicTool.implementation) throw new Error( `Dynamic tool '${toolName}' has no implementation defined in state.` );
              logger.logEvent( "info", `Executing dynamic tool '${toolName}' in Web Worker sandbox.` );

              return new Promise((resolve, reject) => {
                  const workerCode = `
                      self.onmessage = async (event) => {
                          const { toolCode, toolArgs } = event.data;
                          try {
                              const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                              const func = new AsyncFunction('params', toolCode);
                              const result = await func(toolArgs);
                              self.postMessage({ success: true, result: result });
                          } catch (e) {
                              self.postMessage({ success: false, error: e.message });
                          }
                      };
                  `;
                  let worker = null;
                  let timeoutId = null;
                  let workerUrl = null;
                  try {
                     const blob = new Blob([workerCode], { type: 'application/javascript' });
                     workerUrl = URL.createObjectURL(blob);
                     worker = new Worker(workerUrl);

                     timeoutId = setTimeout(() => {
                          logger.logEvent("error", `Dynamic tool '${toolName}' timed out after 10 seconds.`);
                          if(worker) worker.terminate();
                          if(workerUrl) URL.revokeObjectURL(workerUrl);
                          reject(new Error(`Dynamic tool '${toolName}' execution timed out.`));
                     }, 10000);

                     worker.onmessage = (event) => {
                         clearTimeout(timeoutId);
                         if (event.data.success) {
                             logger.logEvent("info", `Dynamic tool '${toolName}' execution succeeded.`);
                             resolve({ result: event.data.result, success: true });
                         } else {
                             logger.logEvent("error", `Dynamic tool '${toolName}' execution failed in worker: ${event.data.error}`);
                             reject(new Error(`Dynamic tool '${toolName}' failed: ${event.data.error}`));
                         }
                         if(worker) worker.terminate();
                         if(workerUrl) URL.revokeObjectURL(workerUrl);
                     };

                     worker.onerror = (error) => {
                          clearTimeout(timeoutId);
                         logger.logEvent("error", `Web Worker error for tool '${toolName}': ${error.message}`);
                         reject(new Error(`Worker error for dynamic tool '${toolName}': ${error.message}`));
                         if(worker) worker.terminate();
                          if(workerUrl) URL.revokeObjectURL(workerUrl);
                     };

                     worker.postMessage({ toolCode: dynamicTool.implementation, toolArgs: toolArgs });
                   } catch (e) {
                       clearTimeout(timeoutId);
                       logger.logEvent("error", `Error setting up worker for '${toolName}': ${e.message}`);
                        if(worker) worker.terminate();
                        if(workerUrl) URL.revokeObjectURL(workerUrl);
                       reject(new Error(`Failed to initialize worker for tool '${toolName}': ${e.message}`));
                   }
              });
          }

          throw new Error(`Tool not found: ${toolName}`);
      }
  };

  const UI = {
       initializeUIElementReferences: () => {
          const elementIds = [
              "total-cycles", "maxCyclesDisplay", "agentIterations", "humanInterventions", "failCount", "currentGoal",
              "lastCritiqueType", "personaMode", "htmlHistoryCount", "contextTokenEstimate", "avgConfidence",
              "critiqueFailRate", "avgTokens", "contextTokenWarning", "currentCycleDetails", "currentCycleContent",
              "currentCycleNumber", "diagram-display-container", "diagramJsonDisplay", "diagram-svg-container", "cycle-diagram",
              "goal-input", "seed-prompt-core", "seed-prompt-critique", "seed-promptsummarize",
              "apiKeyInput", "lsdPersonaPercentInput", "xyzPersonaPercentInput", "llmCritiqueProbInput",
              "humanReviewProbInput", "maxCycleTimeInput", "autoCritiqueThreshInput", "maxCyclesInput",
              "htmlHistoryLimitInput", "pauseAfterCyclesInput", "maxRetriesInput", "uiRenderOutput", "timelineLog",
              "statusIndicator", "coreLoopStepsList", "runCycleButton", "forceHumanReviewButton", "goBackButton",
              "exportStateButton", "importStateButton", "importFileInput", "downloadLogButton", "summarizeContextButton",
              "clearLocalStorageButton", "humanInterventionSection", "humanInterventionTitle", "humanInterventionReason",
              "humanInterventionReasonSummary", "hitlOptionsMode", "hitlOptionsList", "submitHitlOptionsButton",
              "hitlPromptMode", "humanCritiqueInput", "submitCritiqueButton", "hitlCodeEditMode",
              "humanEditArtifactSelector", "human-edit-artifact-textarea", "submitHumanCodeEditButton",
              "meta-sandbox-container", "metaSandboxOutput", "approveMetaChangeButton", "discardMetaChangeButton",
              "genesisStateDisplay", "genesisMetricsDisplay", "genesisDiagramJson", "notifications-container",
              "coreModelSelector", "critiqueModelSelector"
          ];
          elementIds.forEach(id => {
              uiRefs[id] = document.getElementById(id);
              if (!uiRefs[id] && id !== 'notifications-container') console.warn(`UI element not found: #${id}`);
          });
          console.log("UI element references initialized.");
       },

       updateStatus: (message, isActive = false, isError = false) => {
        if(!uiRefs.statusIndicator) return;
        uiRefs.statusIndicator.textContent = `Status: ${message}`;
        uiRefs.statusIndicator.classList.toggle("active", isActive);
        uiRefs.statusIndicator.style.borderColor = isError ? "red" : isActive ? "yellow" : "gray";
        uiRefs.statusIndicator.style.color = isError ? "red" : isActive ? "yellow" : "var(--fg)";
       },

       highlightCoreStep: (stepIndex) => {
          activeCoreStepIdx = stepIndex;
       },

       showNotification: (message, type = 'info', duration = 5000) => {
          if (!uiRefs.notificationsContainer) {
              console.error("Notification container not found!");
              alert(`[${type.toUpperCase()}] ${message}`); // Fallback
              return;
          }
          const notification = document.createElement('div');
          notification.className = `notification ${type}`;
          notification.innerHTML = `${message}<button onclick="this.parentElement.remove()">×</button>`;
          uiRefs.notificationsContainer.appendChild(notification);

          if (duration > 0) {
              setTimeout(() => {
                  notification.remove();
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
        if (confHistory.length > 0) { const sum = confHistory.reduce((a, b) => a + b, 0); globalState.avgConfidence = sum / confHistory.length; uiRefs.avgConfidence.textContent = globalState.avgConfidence.toFixed(2); }
        else { uiRefs.avgConfidence.textContent = "N/A"; }

        const critHistory = globalState.critiqueFailHistory.slice(-10);
        if (critHistory.length > 0) { const fails = critHistory.filter((v) => v === true).length; globalState.critiqueFailRate = (fails / critHistory.length) * 100; uiRefs.critiqueFailRate.textContent = globalState.critiqueFailRate.toFixed(1) + "%"; }
        else { uiRefs.critiqueFailRate.textContent = "N/A"; }

        if(uiRefs.avgTokens) uiRefs.avgTokens.textContent = globalState.avgTokens?.toFixed(0) || "N/A";
        if(uiRefs.contextTokenEstimate) uiRefs.contextTokenEstimate.textContent = globalState.contextTokenEstimate?.toLocaleString() || "0";
        if(uiRefs.failCount) uiRefs.failCount.textContent = globalState.failCount;
        UI.checkContextTokenWarning();
       },

      checkContextTokenWarning: () => {
        if(!globalState) return;
        const isWarn = globalState.contextTokenEstimate >= CTX_WARN_THRESH;
        uiRefs.contextTokenWarning?.classList.toggle("hidden", !isWarn);
        if (isWarn) logger.logEvent( "warn", `Context high! (${globalState.contextTokenEstimate}). Consider resetting context.` );
      },

      updateHtmlHistoryControls: () => {
         if (!uiRefs.htmlHistoryCount || !globalState) return;
        const count = globalState.htmlHistory?.length || 0;
        uiRefs.htmlHistoryCount.textContent = count.toString();
        if(uiRefs.goBackButton) uiRefs.goBackButton.disabled = count === 0;
      },

       updateFieldsetSummaries: () => {
           if (!globalState) return;
           const configFieldset = document.getElementById('genesisConfig');
           if (configFieldset) {
               const summary = configFieldset.querySelector('.summary-line');
               if(summary) summary.textContent = `LSD:${globalState.cfg.personaBalance}%, Crit:${globalState.cfg.llmCritiqueProb}%, Rev:${globalState.cfg.humanReviewProb}%, CycleT:${globalState.cfg.maxCycleTime}s, ConfT:${globalState.cfg.autoCritiqueThresh}, MaxC:${globalState.cfg.maxCycles||'Inf'}, CoreM:${globalState.cfg.coreModel.split('-')[1]}, CritM:${globalState.cfg.critiqueModel.split('-')[1]}`;
           }
           const promptsFieldset = document.getElementById('seed-prompts');
           if (promptsFieldset) {
               const summary = promptsFieldset.querySelector('.summary-line');
               if(summary) summary.textContent = `Core:${Storage.getArtifactContent('reploid.prompt.core',0)?.length || 0}c, Crit:${Storage.getArtifactContent('reploid.prompt.critique',0)?.length || 0}c, Sum:${Storage.getArtifactContent('reploid.prompt.summarize',0)?.length || 0}c`;
           }
          const genesisFieldset = document.getElementById('genesisStateDisplay');
           if (genesisFieldset) {
               const summary = genesisFieldset.querySelector('.summary-line');
               if(summary) summary.textContent = `Diagram JSON: ${Storage.getArtifactContent('target.diagram', 0)?.length || 0}c`;
           }
          const cycleFieldset = document.getElementById('currentCycleDetails');
           if (cycleFieldset) {
               const summary = cycleFieldset.querySelector('.summary-line');
               const content = uiRefs.currentCycleContent?.textContent || '';
               if(summary) summary.textContent = `Items: ${uiRefs.currentCycleContent?.childElementCount || 0}, Content: ${content.length}c`;
           }
           const timelineFieldset = document.getElementById('timelineFieldset');
           if (timelineFieldset) {
               const summary = timelineFieldset.querySelector('.summary-line');
               if(summary) summary.textContent = `Entries: ${uiRefs.timelineLog?.childElementCount || 0}`;
           }
           const controlsFieldset = document.getElementById('controlsFieldset');
           if (controlsFieldset) {
               const summary = controlsFieldset.querySelector('.summary-line');
               if(summary) summary.textContent = `API Key: ${globalState.apiKey ? 'Set' : 'Not Set'}`;
           }
       },

      updateStateDisplay: () => {
        if (!globalState || !uiRefs.total-cycles) return;
        uiRefs.lsdPersonaPercentInput.value = globalState.cfg.personaBalance ?? 50;
        uiRefs.xyzPersonaPercentInput.value = 100 - (globalState.cfg.personaBalance ?? 50);
        uiRefs.llmCritiqueProbInput.value = globalState.cfg.llmCritiqueProb ?? 70;
        uiRefs.humanReviewProbInput.value = globalState.cfg.humanReviewProb ?? 36;
        uiRefs.maxCycleTimeInput.value = globalState.cfg.maxCycleTime ?? 600;
        uiRefs.autoCritiqueThreshInput.value = globalState.cfg.autoCritiqueThresh ?? 0.75;
        uiRefs.maxCyclesInput.value = globalState.cfg.maxCycles ?? 0;
        uiRefs.htmlHistoryLimitInput.value = globalState.cfg.htmlHistoryLimit ?? 5;
        uiRefs.pauseAfterCyclesInput.value = globalState.cfg.pauseAfterCycles ?? 10;
        uiRefs.maxRetriesInput.value = globalState.cfg.maxRetries ?? 1;
        uiRefs.apiKeyInput.value = globalState.apiKey || "";
        uiRefs.coreModelSelector.value = globalState.cfg.coreModel;
        uiRefs.critiqueModelSelector.value = globalState.cfg.critiqueModel;


        const maxC = globalState.cfg.maxCycles || 0;
        uiRefs.maxCyclesDisplay.textContent = maxC === 0 ? "Inf" : maxC.toString();
        uiRefs.total-cycles.textContent = globalState.total-cycles;
        uiRefs.agentIterations.textContent = globalState.agentIterations;
        uiRefs.humanInterventions.textContent = globalState.humanInterventions;

        const goalInfo = CycleLogic.getActiveGoalInfo();
        let goalText = goalInfo.type === "Idle" ? "Idle" : `${goalInfo.type}: ${goalInfo.latestGoal}`;
        if (globalState.currentGoal.summaryContext) goalText += ` (Ctx: ${globalState.currentGoal.summaryContext.substring( 0, 20 )}...)`;
        uiRefs.currentGoal.textContent = goalText.length > 40 ? goalText.substring(0, 37) + "..." : goalText;
        uiRefs.lastCritiqueType.textContent = globalState.lastCritiqueType;
        uiRefs.personaMode.textContent = globalState.personaMode;

        UI.updateMetricsDisplay();
        UI.updateHtmlHistoryControls();
        UI.hideHumanInterventionUI();
        UI.hideMetaSandbox();
        if(uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = false;
        UI.updateFieldsetSummaries();
       },

       displayGenesisState: () => {
          if (!uiRefs.genesisMetricsDisplay || !uiRefs.genesisDiagramJson) return;
          const metricsEl = document.getElementById("core-metrics-display");
          if(metricsEl) uiRefs.genesisMetricsDisplay.innerHTML = metricsEl.innerHTML;
          else uiRefs.genesisMetricsDisplay.innerHTML = "Metrics unavailable";

          const diagramJsonContent = Storage.getArtifactContent("target.diagram", 0);
          uiRefs.genesisDiagramJson.value = diagramJsonContent || "(Genesis Diagram JSON Not Found)";
       },

       logToTimeline: ( cycle, message, type = "info", isSubStep = false, animate = false ) => {
        if (!uiRefs.timelineLog) return null;
        logger.logEvent(type, `T[${cycle}]: ${message}`);
        const li = document.createElement("li");
        const span = document.createElement("span");
        li.setAttribute("data-cycle", cycle);
        li.setAttribute("data-timestamp", Date.now());
        li.classList.add(isSubStep ? "sub-step" : "log-entry");

        const persona = globalState?.personaMode === "XYZ" ? "[X]" : "[L]";
        let icon = "➡️";
        if (message.startsWith("[API")) icon = "☁️"; else if (message.startsWith("[TOOL")) icon = "🔧"; else if (message.startsWith("[CRIT")) icon = "🧐"; else if (message.startsWith("[HUMAN")) icon = "🧑‍💻"; else if (message.startsWith("[APPLY") || message.startsWith("[ART")) icon = "📝"; else if (message.startsWith("[DECIDE")) icon = "⚙️"; else if (message.startsWith("[STATE")) icon = "💾"; else if (message.startsWith("[CTX")) icon = "📜"; else if (message.startsWith("[GOAL")) icon = "🎯"; else if (message.startsWith("[CYCLE")) icon = "🔄"; else if (message.startsWith("[RETRY")) icon = "⏳"; else if (type === "error") icon = "❌"; else if (type === "warn") icon = "⚠️";

        let iconHTML = `<span class="log-icon" title="${type}">${icon}</span>`;
        if (animate) iconHTML = `<span class="log-icon animated-icon" title="${type}">⚙️</span>`;

        span.innerHTML = `${iconHTML} ${persona} ${message}`;
        li.appendChild(span);

        const targetList = uiRefs.timelineLog;
        targetList.insertBefore(li, targetList.firstChild);
        if (targetList.children.length > 200) targetList.removeChild(targetList.lastChild);

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
        span.innerHTML = `<span class="log-icon">${ icons[stepIndex] || "➡️" }</span> <strong>Step ${stepIndex + 1}:</strong> ${message}`;
        li.appendChild(span);
        uiRefs.timelineLog.insertBefore(li, uiRefs.timelineLog.firstChild);
        return li;
       },

       updateTimelineItem: ( logItem, newMessage, newType = "info", stopAnimate = true ) => {
        if (!logItem) return;
        const span = logItem.querySelector("span");
        if (!span || !globalState) return;
        let icon = span.querySelector(".log-icon")?.textContent || "➡️";
        if (newMessage.includes(" OK")) icon = "✅"; else if (newMessage.includes(" ERR")) icon = "❌";
        if (newType === "warn") icon = "⚠️";

        const persona = globalState.personaMode === "XYZ" ? "[X]" : "[L]";
        const currentIconHTML = span.querySelector(".log-icon")?.outerHTML || `<span class="log-icon" title="${newType}">${icon}</span>`;
        span.innerHTML = `${currentIconHTML} ${persona} ${newMessage}`;

        if (stopAnimate) { const animatedIcon = span.querySelector(".animated-icon"); if (animatedIcon) animatedIcon.classList.remove("animated-icon"); }
       },

       summarizeCompletedCycleLog: (logItem, outcome) => {
        if (!logItem) return;
        logItem.classList.add("summary");
        const firstSpan = logItem.querySelector("span");
        if (firstSpan) { firstSpan.textContent = `... Cycle ${logItem.getAttribute( "data-cycle" )} Completed: ${outcome} (Expand?)`; }
       },

       clearCurrentCycleDetails: () => {
        if (!uiRefs.currentCycleDetails || !uiRefs.currentCycleContent) return;
        uiRefs.currentCycleDetails.classList.add("collapsed");
        UI.updateFieldsetSummaries();
        uiRefs.currentCycleContent.innerHTML = "<p>Waiting for cycle...</p>";
        if (uiRefs.diagram-display-container) uiRefs.diagram-display-container.classList.add("hidden");
       },

       getArtifactTypeIndicator: (type) => {
         switch(type) {
             case 'JAVASCRIPT_SNIPPET': return '[JS]'; case 'CSS_STYLESHEET': return '[CSS]';
             case 'HTML_HEAD': return '[HEAD]'; case 'HTML_BODY': return '[BODY]';
             case 'DIAGRAM_JSON': return '[JSON]'; case 'PROMPT': return '[TXT]';
             case 'FULL_HTML_SOURCE': return '[HTML]'; case 'TEXT': return '[TXT]';
             default: return '[???]';
         }
       },

       displayCycleArtifact: (label, content, type = "info", isModified = false, source = null, artifactId = null, cycle = null) => {
           if (!uiRefs.currentCycleDetails || !uiRefs.currentCycleContent) return;
           if (uiRefs.currentCycleDetails.classList.contains("collapsed")) {
               uiRefs.currentCycleDetails.classList.remove("collapsed");
               UI.updateFieldsetSummaries();
               uiRefs.currentCycleContent.innerHTML = "";
           }

           const section = document.createElement("div");
           section.className = "artifact-section";

           const labelEl = document.createElement("span");
           labelEl.className = "artifact-label";

           const meta = artifactId ? StateManager.getArtifactMetadata(artifactId) : { type: 'TEXT' };
           const typeIndicator = UI.getArtifactTypeIndicator(meta.type);

           labelEl.innerHTML = `<span class="type-indicator">${typeIndicator}</span> ${label}`;
           if (artifactId) labelEl.innerHTML += ` (\<i style="color:#aaa">${artifactId}\</i>)`;
           if (cycle !== null) labelEl.innerHTML += ` \<i style="color:#ccc">[Cyc ${cycle}]</i>`;
           if (source) labelEl.innerHTML += ` <span class="source-indicator">(Source: ${source})</span>`;
           if (isModified) labelEl.innerHTML += ' <span class="change-indicator">*</span>';

           section.appendChild(labelEl);

           const pre = document.createElement("pre");
           pre.textContent = content === null || content === undefined ? "(Artifact content not found/empty)" : String(content);
           pre.classList.add(type);
           if (isModified) pre.classList.add("modified");
           section.appendChild(pre);

           uiRefs.currentCycleContent.appendChild(section);
           UI.updateFieldsetSummaries();
       },

       hideHumanInterventionUI: () => {
         if (!uiRefs.humanInterventionSection) return;
        uiRefs.humanInterventionSection.classList.add("hidden");
        if(uiRefs.hitlOptionsMode) uiRefs.hitlOptionsMode.classList.add("hidden");
        if(uiRefs.hitlPromptMode) uiRefs.hitlPromptMode.classList.add("hidden");
        if(uiRefs.hitlCodeEditMode) uiRefs.hitlCodeEditMode.classList.add("hidden");
        if (!metaSandboxPending && uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = false;
       },

       showHumanInterventionUI: ( mode = "prompt", reason = "", options = [], artifactIdToEdit = null ) => {
         if (!uiRefs.humanInterventionSection || !globalState) return;
        UI.highlightCoreStep(5);
        UI.hideMetaSandbox();
        uiRefs.humanInterventionSection.classList.remove("hidden");
        uiRefs.humanInterventionSection.querySelector('fieldset')?.classList.remove('collapsed');
        uiRefs.humanInterventionTitle.textContent = `Human Intervention Required`;
        uiRefs.humanInterventionReason.textContent = `Reason: ${reason}.`;
        if(uiRefs.humanInterventionReasonSummary) uiRefs.humanInterventionReasonSummary.textContent = `Reason: ${reason.substring(0,50)}...`;
        if(uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = true;
        UI.logToTimeline( globalState.total-cycles, `[HUMAN] Intervention Required: ${reason}`, "warn", true );

        if (mode === "options" && uiRefs.hitlOptionsMode && uiRefs.hitlOptionsList) {
          uiRefs.hitlOptionsMode.classList.remove("hidden");
          uiRefs.hitlOptionsList.innerHTML = "";
          options.forEach((opt, i) => {
            const div = document.createElement("div");
            const inp = UI.createSvgElement("input", { type: "checkbox", id: `hitl_${i}`, value: opt.value || opt.label, name: "hitl_option", });
            const lbl = UI.createSvgElement("label", { htmlFor: inp.id }); lbl.textContent = opt.label;
            div.append(inp, lbl); uiRefs.hitlOptionsList.appendChild(div);
          });
        } else if (mode === "code_edit" && uiRefs.hitlCodeEditMode && uiRefs.humanEditArtifactSelector && uiRefs.human-edit-artifact-textarea) {
          uiRefs.hitlCodeEditMode.classList.remove("hidden");
          uiRefs.humanEditArtifactSelector.innerHTML = "";
          const editableTypes = [ "HTML_HEAD", "HTML_BODY", "CSS_STYLESHEET", "JAVASCRIPT_SNIPPET", "DIAGRAM_JSON", "FULL_HTML_SOURCE", "PROMPT", "TEXT" ];
          const currentCycle = globalState.total-cycles;
          const allMeta = StateManager.getAllArtifactMetadata();

          const artifactKeys = Object.keys(allMeta);
          const relevantArtifacts = artifactKeys
             .map(id => StateManager.getArtifactMetadata(id))
             .filter(meta => editableTypes.includes(meta.type) && meta.latestCycle >= 0)
             .sort((a,b) => a.id.localeCompare(b.id));

          relevantArtifacts.forEach((meta) => {
              const opt = document.createElement("option"); opt.value = meta.id;
              opt.textContent = `${meta.id} (${meta.type}) - Last Mod: Cyc ${meta.latestCycle}`;
              uiRefs.humanEditArtifactSelector.appendChild(opt);
          });

          if (globalState.lastGeneratedFullSource && artifactIdToEdit === 'full_html_source') {
               const opt = document.createElement("option"); opt.value = 'full_html_source';
               opt.textContent = `Proposed Full HTML Source (Cycle ${currentCycle})`;
               uiRefs.humanEditArtifactSelector.appendChild(opt);
          }

          const selectArtifact = (id) => {
              let content = "";
              if (id === "full_html_source") { content = globalState.lastGeneratedFullSource || "(Full source not available in state)"; }
              else {
                  const meta = StateManager.getArtifactMetadata(id);
                  content = Storage.getArtifactContent(id, meta.latestCycle) ?? `(Artifact ${id} - Cycle ${meta.latestCycle} content not found)`;
              }
              uiRefs.human-edit-artifact-textarea.value = content;
              uiRefs.human-edit-artifact-textarea.scrollTop = 0;
          };

          uiRefs.humanEditArtifactSelector.onchange = () => selectArtifact(uiRefs.humanEditArtifactSelector.value);

          const initialId = artifactIdToEdit && (StateManager.getArtifactMetadata(artifactIdToEdit).latestCycle >= 0 || artifactIdToEdit === 'full_html_source') ? artifactIdToEdit : uiRefs.humanEditArtifactSelector.options[0]?.value;
          if (initialId) { uiRefs.humanEditArtifactSelector.value = initialId; selectArtifact(initialId); }
          else { uiRefs.human-edit-artifact-textarea.value = "(No editable artifacts found)"; }

        } else if(uiRefs.hitlPromptMode && uiRefs.humanCritiqueInput) {
          uiRefs.hitlPromptMode.classList.remove("hidden");
          uiRefs.humanCritiqueInput.value = "";
          uiRefs.humanCritiqueInput.placeholder = `Feedback/Next Step? (${reason})`;
          uiRefs.humanCritiqueInput.focus();
        }
        uiRefs.humanInterventionSection.scrollIntoView({ behavior: "smooth", block: "center", });
       },

       hideMetaSandbox: () => {
         if(!uiRefs.meta-sandbox-container) return;
        uiRefs.meta-sandbox-container.classList.add("hidden");
        metaSandboxPending = false;
        if (uiRefs.humanInterventionSection?.classList.contains("hidden") && uiRefs.runCycleButton) {
            uiRefs.runCycleButton.disabled = false;
        }
       },

      showMetaSandbox: (htmlSource) => {
         if(!uiRefs.meta-sandbox-container || !uiRefs.metaSandboxOutput || !globalState) return;
        UI.highlightCoreStep(6);
        UI.hideHumanInterventionUI();
        uiRefs.meta-sandbox-container.classList.remove("hidden");
        uiRefs.meta-sandbox-container.querySelector('fieldset')?.classList.remove('collapsed');
        if(uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = true;
        const iframe = uiRefs.metaSandboxOutput;
        const doc = iframe.contentWindow?.document;
        if (doc) {
          doc.open(); doc.write(htmlSource); doc.close();
          logger.logEvent("info", "Meta sandbox rendered for approval.");
          metaSandboxPending = true;
          UI.logToTimeline( globalState.total-cycles, `[STATE] Meta-Sandbox Ready for Review.`, "info", true );
          uiRefs.meta-sandbox-container.scrollIntoView({ behavior: "smooth", block: "center", });
        } else {
          logger.logEvent("error", "Cannot access meta sandbox iframe document.");
          UI.showNotification("Error: Failed to show meta sandbox preview.", 'error');
          UI.logToTimeline( globalState.total-cycles, `[ERROR] Meta-Sandbox failed to render.`, "error", true );
          UI.hideMetaSandbox(); if(uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = false;
        }
       },

      renderCycleSVG: (cycleData, svgElement) => {
        if (!svgElement) { logger.logEvent("error", "SVG element not found for rendering"); return; }
        while (svgElement.firstChild) { svgElement.removeChild(svgElement.firstChild); }

        const config = { nodeWidth: 160, nodeHeight: 65, decisionSize: 90, padding: 40, arrowSize: 8, strokeWidth: 2, fontSize: 13, fontFamily: "monospace", lineLabelFontSize: 11,
          colors: {
            step: { fill: "#e0e0e0", stroke: "#555" }, iteration: { fill: "#d0e0ff", stroke: "#3366cc" }, intervention: { fill: "#fff0b3", stroke: "#cc8400" }, decision: { fill: "#e0f0e0", stroke: "#4caf50" }, start_end: { fill: "#f5f5f5", stroke: "#333" }, pause: { fill: "#f5e0f5", stroke: "#884488" }, fail_point: { fill: "#ffdddd", stroke: "#d32f2f" }, retry_decision: { fill: "#e0f0e0", stroke: "#ff9800" }, final_intervention: { fill: "#fff0b3", stroke: "#d32f2f" }, text: "#000", line_normal: "#555", line_success: "#4caf50", line_fail: "#f44336", line_retry: "#ff9800", line_label_bg: "rgba(255, 255, 255, 0.7)",
          },
        };

        const defs = UI.createSvgElement("defs");
        const marker = UI.createSvgElement("marker", { id: "arrowhead", viewBox: "0 0 10 10", refX: "8", refY: "5", markerUnits: "strokeWidth", markerWidth: config.arrowSize, markerHeight: config.arrowSize, orient: "auto-start-reverse"});
        const path = UI.createSvgElement("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: config.colors.line_normal }); marker.appendChild(path); defs.appendChild(marker);

        ["line_normal", "line_success", "line_fail", "line_retry"].forEach( (lineType) => {
            if (lineType === "line_normal") return;
            const markerColor = UI.createSvgElement("marker", { id: `arrowhead-${lineType}`, viewBox: "0 0 10 10", refX: "8", refY: "5", markerUnits: "strokeWidth", markerWidth: config.arrowSize, markerHeight: config.arrowSize, orient: "auto-start-reverse"});
            const pathColor = UI.createSvgElement("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: config.colors[lineType] }); markerColor.appendChild(pathColor); defs.appendChild(markerColor);
        });
        svgElement.appendChild(defs);

        function getNodeById(id) { return cycleData.nodes.find((n) => n.id === id); }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const nodeElements = {};

        cycleData.nodes.forEach((node) => {
          const group = UI.createSvgElement("g"); let shape;
          const style = config.colors[node.type] || config.colors.step;
          const halfWidth = (node.type === "decision" || node.type === "retry_decision" ? config.decisionSize : config.nodeWidth) / 2;
          const halfHeight = (node.type === "decision" || node.type === "retry_decision" ? config.decisionSize : config.nodeHeight) / 2;

          if (node.type === "decision" || node.type === "retry_decision") {
            shape = UI.createSvgElement("path", { d: `M ${node.x} ${node.y - halfHeight} L ${node.x + halfWidth} ${ node.y } L ${node.x} ${node.y + halfHeight} L ${node.x - halfWidth} ${ node.y } Z`, fill: style.fill, stroke: style.stroke, "stroke-width": config.strokeWidth, });
            node.bounds = { top: { x: node.x, y: node.y - halfHeight }, bottom: { x: node.x, y: node.y + halfHeight }, left: { x: node.x - halfWidth, y: node.y }, right: { x: node.x + halfWidth, y: node.y }, };
          } else {
            const isRound = node.type === "start_end" || node.type === "pause";
            shape = UI.createSvgElement("rect", { x: node.x - halfWidth, y: node.y - halfHeight, width: config.nodeWidth, height: config.nodeHeight, rx: isRound ? config.nodeHeight / 2 : 8, ry: isRound ? config.nodeHeight / 2 : 8, fill: style.fill, stroke: style.stroke, "stroke-width": config.strokeWidth, });
            node.bounds = { top: { x: node.x, y: node.y - halfHeight }, bottom: { x: node.x, y: node.y + halfHeight }, left: { x: node.x - halfWidth, y: node.y }, right: { x: node.x + halfWidth, y: node.y }, };
          }
          group.appendChild(shape);

          const text = UI.createSvgElement("text", { x: node.x, y: node.y, fill: config.colors.text, "font-family": config.fontFamily, "font-size": config.fontSize, "text-anchor": "middle", "dominant-baseline": "middle", });
          const lines = node.label.split("\n");
          const lineHeight = config.fontSize * 1.2; const totalTextHeight = lines.length * lineHeight; const startY = node.y - totalTextHeight / 2 + lineHeight / 2;
          lines.forEach((line, index) => { const dy = index === 0 ? startY - node.y : lineHeight; const tspan = UI.createSvgElement("tspan", { x: node.x, dy: `${dy}`, }); tspan.textContent = line; text.appendChild(tspan); });
          group.appendChild(text); svgElement.appendChild(group); nodeElements[node.id] = group;

          const nodeMaxX = node.bounds.right.x; const nodeMinX = node.bounds.left.x; const nodeMaxY = node.bounds.bottom.y; const nodeMinY = node.bounds.top.y;
          minX = Math.min(minX, nodeMinX); minY = Math.min(minY, nodeMinY); maxX = Math.max(maxX, nodeMaxX); maxY = Math.max(maxY, nodeMaxY);
        });

        cycleData.connections.forEach((conn) => {
          const fromNode = getNodeById(conn.from); const toNode = getNodeById(conn.to);
          if (!fromNode || !toNode) { console.warn("Connection nodes not found:", conn.from, conn.to); return; }
          let startPoint, endPoint; const dx = toNode.x - fromNode.x; const dy = toNode.y - fromNode.y;
          if (Math.abs(dy) > Math.abs(dx)) { startPoint = dy > 0 ? fromNode.bounds.bottom : fromNode.bounds.top; endPoint = dy > 0 ? toNode.bounds.top : toNode.bounds.bottom; }
          else { startPoint = dx > 0 ? fromNode.bounds.right : fromNode.bounds.left; endPoint = dx > 0 ? toNode.bounds.left : toNode.bounds.right; }

          const lineType = conn.type || "normal";
          const lineStyle = config.colors[`line_${lineType}`] || config.colors.line_normal;
          const markerId = `arrowhead${ lineType === "normal" ? "" : "-line_" + lineType }`;

          const line = UI.createSvgElement("line", { x1: startPoint.x, y1: startPoint.y, x2: endPoint.x, y2: endPoint.y, stroke: lineStyle, "stroke-width": config.strokeWidth, "marker-end": `url(#${markerId})`, });
          svgElement.appendChild(line);

          if (conn.label) {
            const labelRatio = 0.6; const midX = startPoint.x * labelRatio + endPoint.x * (1 - labelRatio); const midY = startPoint.y * labelRatio + endPoint.y * (1 - labelRatio);
            const angle = Math.atan2(dy, dx); const offsetX = Math.sin(angle) * 10; const offsetY = -Math.cos(angle) * 10;
            const textLabel = UI.createSvgElement("text", { x: midX + offsetX, y: midY + offsetY, fill: config.colors.text, "font-family": config.fontFamily, "font-size": config.lineLabelFontSize, "text-anchor": "middle", "dominant-baseline": "middle", }); textLabel.textContent = conn.label;
            const labelWidthEstimate = conn.label.length * config.lineLabelFontSize * 0.6; const labelHeightEstimate = config.lineLabelFontSize;
            const bgRect = UI.createSvgElement("rect", { x: midX + offsetX - labelWidthEstimate / 2 - 2, y: midY + offsetY - labelHeightEstimate / 2 - 1, width: labelWidthEstimate + 4, height: labelHeightEstimate + 2, fill: config.colors.line_label_bg, rx: 3, ry: 3, });
            svgElement.insertBefore(bgRect, line); svgElement.insertBefore(textLabel, line);
            minX = Math.min(minX, parseFloat(bgRect.getAttribute("x"))); minY = Math.min(minY, parseFloat(bgRect.getAttribute("y"))); maxX = Math.max( maxX, parseFloat(bgRect.getAttribute("x")) + parseFloat(bgRect.getAttribute("width")) ); maxY = Math.max( maxY, parseFloat(bgRect.getAttribute("y")) + parseFloat(bgRect.getAttribute("height")) );
          }
        });

        if (isFinite(minX)) {
          const viewBoxX = minX - config.padding; const viewBoxY = minY - config.padding; const viewBoxWidth = maxX - minX + 2 * config.padding; const viewBoxHeight = maxY - minY + 2 * config.padding;
          svgElement.setAttribute( "viewBox", `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}` ); svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
        } else { svgElement.setAttribute("viewBox", "0 0 800 1400"); }
      },

       renderCycleSVGToMarkup: (cycleData) => {
          const tempSvg = document.createElementNS(SVG_NS, "svg");
          UI.renderCycleSVG(cycleData, tempSvg);
          return tempSvg.outerHTML;
       },

       renderDiagramDisplay: (cycleNum) => {
           const jsonContent = Storage.getArtifactContent("target.diagram", cycleNum);
           const svgContainer = uiRefs.diagram-svg-container;
           if (!svgContainer || !uiRefs.diagramJsonDisplay || !uiRefs.diagram-display-container || !uiRefs.cycle-diagram) return;

           if (jsonContent) {
                uiRefs.diagramJsonDisplay.value = jsonContent;
                 try {
                     const diagramJson = JSON.parse(jsonContent);
                     UI.renderCycleSVG(cycleFlowData, uiRefs.cycle-diagram); // Using fixed flow data for now
                     // UI.renderCycleSVG(diagramJson, uiRefs.cycle-diagram); // TODO: Use actual diagram if needed
                     uiRefs.diagram-display-container.classList.remove("hidden");
                 } catch (e) {
                     logger.logEvent( "warn", `Failed to parse/render diagram JSON (Cycle ${cycleNum}): ${e.message}` );
                     uiRefs.cycle-diagram.innerHTML = '<text fill="red">Error parsing/rendering Diagram JSON</text>';
                     uiRefs.diagram-display-container.classList.remove("hidden");
                 }
           } else {
                uiRefs.diagramJsonDisplay.value = '{}';
                uiRefs.cycle-diagram.innerHTML = '<text>No Diagram Artifact Found</text>';
                uiRefs.diagram-display-container.classList.remove("hidden");
           }
       },

       renderGeneratedUI: (cycleNum) => {
        const headMeta = StateManager.getArtifactMetadata("target.head");
        const bodyMeta = StateManager.getArtifactMetadata("target.body");
        const headContent = Storage.getArtifactContent("target.head", headMeta.latestCycle >= 0 ? headMeta.latestCycle : cycleNum) || "";
        const bodyContent = Storage.getArtifactContent("target.body", bodyMeta.latestCycle >= 0 ? bodyMeta.latestCycle : cycleNum) || "<p>(No body artifact)</p>";
        const allMeta = StateManager.getAllArtifactMetadata();

        const cssContents = Object.keys(allMeta)
            .filter(id => id.startsWith("target.style.") && allMeta[id].type === 'CSS_STYLESHEET')
            .map(id => Storage.getArtifactContent(id, allMeta[id].latestCycle))
            .filter(content => content !== null)
            .join("\n\n");
         const jsContents = Object.keys(allMeta)
             .filter(id => id.startsWith("target.script.") && allMeta[id].type === 'JAVASCRIPT_SNIPPET')
             .map(id => {
                 const content = Storage.getArtifactContent(id, allMeta[id].latestCycle);
                 return content ? `<script id="${id}_cyc${allMeta[id].latestCycle}">\n${content}\n</script>` : '';
              })
              .filter(scriptTag => scriptTag !== '')
              .join("\n");

        const iframe = uiRefs.uiRenderOutput;
        if(!iframe) return;
        const doc = iframe.contentWindow?.document;
        if (!doc) { logger.logEvent("error", "Cannot get UI preview iframe document."); return; }

        doc.open();
        doc.write(`<!DOCTYPE html>
            <html>
            <head><title>UI Preview (Cycle ${cycleNum})</title>${headContent}<style>body { margin: 10px; font-family: sans-serif; background-color:#fff; color:#000; } * { box-sizing: border-box; } ${cssContents}</style></head>
            <body>${bodyContent}${jsContents}<script>console.log('UI preview rendered for cycle ${cycleNum}.');</script></body>
            </html>`);
        doc.close();
        logger.logEvent("info", `Rendered UI preview using artifacts up to cycle ${cycleNum}.`);
        UI.logToTimeline( globalState.total-cycles, `[ARTIFACT] Rendered External UI Preview (Cycle ${cycleNum}).`, "info", true );
       },

       loadPromptsFromLS: () => {
          if (!uiRefs.seed-prompt-core) return;
          uiRefs.seed-prompt-core.value = Storage.getArtifactContent('reploid.prompt.core', 0) || '';
          uiRefs.seed-prompt-critique.value = Storage.getArtifactContent('reploid.prompt.critique', 0) || '';
          uiRefs.seed-promptsummarize.value = Storage.getArtifactContent('reploid.prompt.summarize', 0) || '';
          logger.logEvent('info', 'Loaded prompts from LocalStorage into UI textareas.');
       },

       loadCoreLoopSteps: () => {
         if (!uiRefs.coreLoopStepsList) return;
         uiRefs.coreLoopStepsList.value = Storage.getArtifactContent('reploid.core_steps', 0) || 'Error loading steps.';
         logger.logEvent('info', 'Loaded core loop steps from LocalStorage.');
       },

       populateModelSelectors: () => {
          const models = [APP_CONFIG.BASE_GEMINI_MODEL, APP_CONFIG.ADVANCED_GEMINI_MODEL];
          // Add optimizer if needed: models.push(APP_CONFIG.GEMINI_MODEL_OPTIMIZER);

          [uiRefs.coreModelSelector, uiRefs.critiqueModelSelector].forEach(selector => {
              if (!selector) return;
              selector.innerHTML = '';
              models.forEach(modelName => {
                  const option = document.createElement('option');
                  option.value = modelName;
                  option.textContent = modelName;
                  selector.appendChild(option);
              });
          });
       },

       setupEventListeners: () => {
         if(!uiRefs.runCycleButton) { logger.logEvent("error", "UI elements not ready for event listeners."); return; }

         uiRefs.runCycleButton.addEventListener("click", CycleLogic.executeCycle);
         uiRefs.submitCritiqueButton?.addEventListener("click", () => CycleLogic.proceedAfterHumanIntervention( "Human Prompt", uiRefs.humanCritiqueInput.value.trim() ) );
         uiRefs.submitHitlOptionsButton?.addEventListener("click", () => { const selected = Array.from( uiRefs.hitlOptionsList.querySelectorAll("input:checked") ).map((el) => el.value).join(", "); CycleLogic.proceedAfterHumanIntervention("Human Options", selected || "None"); });
         uiRefs.submitHumanCodeEditButton?.addEventListener("click", () => {
            const artifactId = uiRefs.humanEditArtifactSelector.value;
            const newContent = uiRefs.human-edit-artifact-textarea.value;
            const isFullSource = artifactId === 'full_html_source';
            let originalContent = null; let currentMeta = null;
            if (isFullSource) { originalContent = globalState.lastGeneratedFullSource; }
            else { currentMeta = StateManager.getArtifactMetadata(artifactId); originalContent = Storage.getArtifactContent(artifactId, currentMeta.latestCycle); }

            let resultData = { id: artifactId, success: true, summary: `No changes detected for ${artifactId}`, newContent: newContent, };
            if (newContent !== originalContent) {
                 try {
                     if (!isFullSource && currentMeta?.type === "DIAGRAM_JSON") { JSON.parse(newContent); }
                     resultData.summary = `Content updated for ${artifactId}`; resultData.success = true;
                     if (isFullSource) {
                         logger.logEvent( "warn", "Full source edited via HITL. State updated, but won't apply automatically." );
                         UI.showNotification( "Full source updated in agent state. Use Sandbox flow or Meta Goal to apply.", 'warn' );
                         globalState.lastGeneratedFullSource = newContent;
                         CycleLogic.proceedAfterHumanIntervention("Human Code Edit", resultData, true); return;
                     }
                 } catch (e) {
                     logger.logEvent( "error", `Error validating human edit for ${artifactId}: ${e.message}` );
                     UI.showNotification(`Error validating edit for ${artifactId}: ${e.message}`, 'error');
                     resultData.summary = `Validation failed for ${artifactId}: ${e.message}`; resultData.success = false;
                 }
            }
             CycleLogic.proceedAfterHumanIntervention("Human Code Edit", resultData);
         });

        uiRefs.forceHumanReviewButton?.addEventListener("click", () => { if(globalState) globalState.forceHumanReview = true; UI.showNotification("Next cycle will pause for Human Review.", 'info'); UI.logToTimeline( globalState.total-cycles, "[HUMAN] User forced Human Review for next cycle.", "warn" ); });
        uiRefs.downloadLogButton?.addEventListener("click", () => {
              const blob = new Blob([logger.getLogBuffer()], { type: "text/plain" }); const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = `x0_log_${new Date() .toISOString() .replace(/[:.]/g, "-")}.txt`;
              document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); logger.logEvent("info", "Log download initiated.");
        });
        uiRefs.exportStateButton?.addEventListener("click", StateManager.exportState);
        uiRefs.summarizeContextButton?.addEventListener( "click", CycleLogic.handleSummarizeContext );
        uiRefs.importStateButton?.addEventListener("click", () => uiRefs.importFileInput?.click());
        uiRefs.importFileInput?.addEventListener("change", (event) => { const file = event.target.files[0]; if (file) StateManager.importState(file); });
        uiRefs.goBackButton?.addEventListener("click", () => {
            if (!globalState?.htmlHistory?.length) { UI.showNotification("No history to go back to.", 'warn'); return; }
            if ( !confirm( "Revert the entire page to the previous saved version? Current state will attempt to restore after reload." ) ) return;

            const prevStateHtml = globalState.htmlHistory.pop();
            UI.updateHtmlHistoryControls();
            logger.logEvent( "info", `Reverting page HTML via Go Back. History size now: ${globalState.htmlHistory.length}` );
            UI.logToTimeline( globalState.total-cycles, "[STATE] Reverting HTML to previous version (Page Reload).", "warn" );

            try {
              const stateToPreserve = StateManager.capturePreservationState();
              Storage.saveSessionState(stateToPreserve);
              document.open(); document.write(prevStateHtml); document.close();
            } catch (e) {
              logger.logEvent( "error", `Go Back failed during state preservation or document write: ${e.message}` );
              UI.showNotification(`Go Back failed: ${e.message}`, 'error');
              Storage.removeSessionState();
              if (globalState.htmlHistory) globalState.htmlHistory.push(prevStateHtml);
              UI.updateHtmlHistoryControls();
              StateManager.save(); // Save potentially reverted history state
            }
        });
        uiRefs.clearLocalStorageButton?.addEventListener("click", () => {
            if (!confirm("WARNING: This will delete ALL Reploid artifacts and saved state from your browser's local storage. This cannot be undone. Are you absolutely sure?")) return;
            try {
                Storage.clearAllReploidData();
                UI.showNotification('LocalStorage cleared successfully. Reloading page.', 'info', 0); // Persist until reload
                setTimeout(() => window.location.reload(), 1000);
            } catch (e) {
                logger.logEvent('error', `Error clearing LocalStorage: ${e.message}`);
                UI.showNotification(`Error clearing LocalStorage: ${e.message}`, 'error');
            }
        });
        uiRefs.approveMetaChangeButton?.addEventListener("click", () => {
          if (metaSandboxPending && globalState?.lastGeneratedFullSource) {
            const sourceToApply = globalState.lastGeneratedFullSource;
            logger.logEvent("info", "Approved meta-change from sandbox.");
            UI.logToTimeline( globalState.total-cycles, `[STATE] Approved Meta-Sandbox changes. Applying & Reloading...`, "info", true );
            UI.hideMetaSandbox();
            const currentHtml = document.documentElement.outerHTML;
            CycleLogic.saveHtmlToHistory(currentHtml); // Save before overwriting
            const stateToPreserve = StateManager.capturePreservationState();
            stateToPreserve.metaSandboxPending = false;
            try {
              Storage.saveSessionState(stateToPreserve);
              document.open(); document.write(sourceToApply); document.close();
            } catch (e) {
              logger.logEvent( "error", `Apply meta-change failed during save/reload: ${e.message}` );
              UI.showNotification(`Apply failed: ${e.message}`, 'error');
              Storage.removeSessionState();
              if (globalState?.htmlHistory?.length > 0) globalState.htmlHistory.pop(); // Revert history save
              UI.updateHtmlHistoryControls();
              window.location.reload(); // Force reload on failure
            }
          } else { UI.showNotification("No sandbox content pending approval or state mismatch.", 'warn'); }
        });
        uiRefs.discardMetaChangeButton?.addEventListener("click", () => {
          logger.logEvent("info", "Discarded meta-sandbox changes.");
          UI.logToTimeline( globalState.total-cycles, `[STATE] Discarded Meta-Sandbox changes.`, "warn", true );
          UI.hideMetaSandbox(); if(globalState) globalState.lastGeneratedFullSource = null;
          CycleLogic.proceedAfterHumanIntervention( "Sandbox Discarded", "User discarded changes", true );
        });

        uiRefs.lsdPersonaPercentInput?.addEventListener("input", () => {
            if(!globalState) return;
            let lsd = parseInt(uiRefs.lsdPersonaPercentInput.value, 10) || 0; lsd = Math.max(0, Math.min(100, lsd));
            globalState.cfg.personaBalance = lsd; uiRefs.lsdPersonaPercentInput.value = lsd; uiRefs.xyzPersonaPercentInput.value = 100 - lsd;
            logger.logEvent("info", `Config Updated: personaBalance (LSD %) = ${lsd}`); StateManager.save();
        });

        Object.keys(StateManager.getDefaultState().cfg).forEach((key) => {
          if (key === "personaBalance" || key === "coreModel" || key === "critiqueModel") return; // Handled separately
          const inputEl = uiRefs[key + "Input"] || uiRefs[key + "ProbInput"] || uiRefs[key + "ThreshInput"];
          if (inputEl) {
            inputEl.addEventListener("change", (e) => {
              if(!globalState) return;
              let value; const target = e.target;
              if (target.type === "number") { value = target.step === "any" || target.step?.includes(".") ? parseFloat(target.value) : parseInt(target.value, 10); }
              else { value = target.value; }
              if (globalState.cfg[key] !== value) {
                globalState.cfg[key] = value; logger.logEvent("info", `Config Updated: ${key} = ${value}`);
                if (key === "maxCycles" && uiRefs.maxCyclesDisplay) uiRefs.maxCyclesDisplay.textContent = value === 0 ? "Inf" : value.toString();
                if (key === "htmlHistoryLimit") UI.updateHtmlHistoryControls();
                 StateManager.save();
                 UI.updateFieldsetSummaries(); // Update summary on config change
              }
            });
          }
        });

        uiRefs.coreModelSelector?.addEventListener('change', (e) => { if(globalState) { globalState.cfg.coreModel = e.target.value; StateManager.save(); UI.updateFieldsetSummaries();} });
        uiRefs.critiqueModelSelector?.addEventListener('change', (e) => { if(globalState) { globalState.cfg.critiqueModel = e.target.value; StateManager.save(); UI.updateFieldsetSummaries();} });


         document.querySelectorAll('fieldset legend').forEach(legend => {
             legend.addEventListener('click', (event) => {
                  if (event.target.closest('button, input, a, select, textarea')) return;
                 const fieldset = legend.closest('fieldset');
                 if (fieldset) {
                     fieldset.classList.toggle('collapsed');
                     UI.updateFieldsetSummaries();
                 }
             });
         });
       },
  };

  const CycleLogic = {
      getActiveGoalInfo: () => {
          if (!globalState) return { seedGoal: "N/A", cumulativeGoal: "N/A", latestGoal: "Idle", type: "Idle" };
          const latestGoal = globalState.currentGoal.cumulative || globalState.currentGoal.seed;
          return {
              seedGoal: globalState.currentGoal.seed || "None",
              cumulativeGoal: globalState.currentGoal.cumulative || "None",
              latestGoal: latestGoal || "Idle",
              type: globalState.currentGoal.latestType || "Idle",
          };
      },

      getArtifactListSummary: () => {
          const allMeta = StateManager.getAllArtifactMetadata();
          return Object.values(allMeta)
              .map(artMeta => `*   ${artMeta.id} (${artMeta.type}) - Cycle ${artMeta.latestCycle}`)
              .join("\n") || "None";
      },

      getToolListSummary: () => {
        const staticToolSummary = staticTools.map((t) => `*   [S] ${t.name}: ${t.description}`).join("\n");
        const dynamicToolSummary = dynamicToolDefinitions.map((t) => `*   [D] ${t.declaration.name}: ${t.declaration.description}`).join("\n");
        return [staticToolSummary, dynamicToolSummary].filter((s) => s).join("\n") || "None";
      },

       runCoreIteration: async (apiKey, currentGoalInfo) => {
        UI.highlightCoreStep(1); // Analyze
        if (!globalState) throw new Error("Global state is not initialized");
        const personaBalance = globalState.cfg.personaBalance ?? 50;
        const primaryPersona = personaBalance >= 50 ? "LSD" : "XYZ";
        globalState.personaMode = primaryPersona;

        const corePromptTemplate = Storage.getArtifactContent("reploid.prompt.core", 0);
        if (!corePromptTemplate) throw new Error("Core prompt artifact not found!");
        let prompt = corePromptTemplate;

        prompt = prompt
          .replace(/\\\[LSD_PERCENT\\\]/g, personaBalance)
          .replace(/\\\[PERSONA_MODE\\\]/g, primaryPersona)
          .replace(/\\\[CYCLE_COUNT\\\]/g, globalState.total-cycles)
          .replace(/\\\[AGENT_ITR_COUNT\\\]/g, globalState.agentIterations)
          .replace(/\\\[HUMAN_INT_COUNT\\\]/g, globalState.humanInterventions)
          .replace(/\\\[FAIL_COUNT\\\]/g, globalState.failCount)
          .replace(/\\\[LAST_FEEDBACK\\\]/g, globalState.lastFeedback || "None")
          .replace(/\\\[AVG_CONF\\\]/g, globalState.avgConfidence?.toFixed(2) || "N/A")
          .replace(/\\\[CRIT_FAIL_RATE\\\]/g, globalState.critiqueFailRate?.toFixed(1) + "%" || "N/A" )
          .replace(/\\\[AVG_TOKENS\\\]/g, globalState.avgTokens?.toFixed(0) || "N/A")
          .replace(/\\\[CTX_TOKENS\\\]/g, globalState.contextTokenEstimate?.toLocaleString() || "0" )
          .replace(/\\\[\\\[DYNAMIC_TOOLS_LIST\\\]\\\]/g, CycleLogic.getToolListSummary())
          .replace(/\\\[\\\[RECENT_LOGS\\\]\\\]/g, logger.getLogBuffer().split("\n").slice(-15).join("\n").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;") )
          .replace(/\\\[\\\[ARTIFACT_LIST\\\]\\\]/g, CycleLogic.getArtifactListSummary())
          .replace(/\\\[\\\[SEED_GOAL_DESC\\\]\\\]/g, currentGoalInfo.seedGoal.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;"))
          .replace(/\\\[\\\[CUMULATIVE_GOAL_DESC\\\]\\\]/g, currentGoalInfo.cumulativeGoal.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;"))
          .replace(/\\\[\\\[SUMMARY_CONTEXT\\\]\\\]/g, globalState.currentGoal.summaryContext || "None" );

        const allMeta = StateManager.getAllArtifactMetadata();
        const relevantArtifacts = Object.keys(allMeta)
             .filter(id => allMeta[id].latestCycle >= 0 && (id.startsWith('target.') || (currentGoalInfo.type === 'Meta' && id.startsWith('reploid.'))))
             .sort((a,b) => allMeta[b].latestCycle - allMeta[a].latestCycle)
             .slice(0, 10);
         let snippets = "";
         for (const id of relevantArtifacts) {
             const meta = StateManager.getArtifactMetadata(id);
             const content = Storage.getArtifactContent(id, meta.latestCycle);
             if (content) {
                 snippets += `\n---\ Artifact: ${id} (Cycle ${meta.latestCycle}) ---\n`;
                 snippets += content.substring(0, 500) + (content.length > 500 ? '\n...' : '');
             }
         }
         prompt = prompt.replace(/\\\[\\\[ARTIFACT_CONTENT_SNIPPETS\\\]\\\]/g, snippets || "No relevant artifact snippets available.");


        globalState.partialOutput = null;
        const sysInstruction = `You are x0. DELIBERATE with yourself (XYZ-2048, LSD-1729, and x0), adopt ${primaryPersona}. Respond ONLY valid JSON matching the specified format. Refer to artifacts by their ID.`;
        const allTools = [ ...staticTools, ...dynamicToolDefinitions.map((t) => t.declaration), ];
        const allFuncDecls = allTools.map(({ name, description, params }) => ({ name, description, parameters: params, }));
        const coreModel = globalState.cfg.coreModel;

        const startTime = performance.now();
        let tokens = 0;
        let apiResult = null;
        let apiHistory = [];

        UI.displayCycleArtifact("LLM Input", prompt, "input", false, "System", "prompt.core", globalState.total-cycles);
        if (globalState.currentGoal.summaryContext) UI.displayCycleArtifact( "LLM Input Context", globalState.currentGoal.summaryContext, "input", false, "System", "prompt.summary", globalState.total-cycles );

        try {
          UI.highlightCoreStep(2); // Propose
          let currentPromptText = prompt;
          let isContinuation = false;

          do {
            apiResult = await ApiClient.callApiWithRetry( currentPromptText, sysInstruction, coreModel, apiKey, allFuncDecls, isContinuation, apiHistory.length > 0 ? apiHistory : null );
            tokens += apiResult.tokenCount || 0;

            if (!isContinuation && apiHistory.length === 0) apiHistory.push({ role: "user", parts: [{ text: prompt }] });
            if (apiResult.rawResp?.candidates?.[0]?.content) apiHistory.push(apiResult.rawResp.candidates[0].content);

            isContinuation = false;
            currentPromptText = null;

            if (apiResult.type === "functionCall") {
              isContinuation = true;
              const fc = apiResult.content;
              UI.updateStatus(`Running Tool: ${fc.name}...`, true);
              let toolLogItem = UI.logToTimeline( globalState.total-cycles, `[TOOL] Calling '${fc.name}'...`, "info", true, true );
              UI.displayCycleArtifact( `Tool Call: ${fc.name}`, JSON.stringify(fc.args, null, 2), "info", false, "LLM", "tool.call", globalState.total-cycles );
              let funcRespContent;
              try {
                const toolResult = await ToolRunner.runTool(fc.name, fc.args, apiKey);
                funcRespContent = { name: fc.name, response: { content: JSON.stringify(toolResult) }, };
                UI.updateTimelineItem( toolLogItem, `[TOOL OK] '${fc.name}' success.`, "info", true );
                UI.displayCycleArtifact( `Tool Response: ${fc.name}`, JSON.stringify(toolResult, null, 2), "info", false, "Tool", "tool.response", globalState.total-cycles );
              } catch (e) {
                funcRespContent = { name: fc.name, response: { error: `Tool execution failed: ${e.message}` }, };
                UI.updateTimelineItem( toolLogItem, `[TOOL ERR] '${fc.name}': ${e.message}`, "error", true );
                UI.displayCycleArtifact( `Tool Error: ${fc.name}`, e.message, "error", false, "Tool", "tool.error", globalState.total-cycles );
              }
              UI.updateStatus(`Calling Gemini (${coreModel}) (tool resp)...`, true);
              apiHistory.push({ role: "function", parts: [{ functionResponse: funcRespContent }], });
              apiResult = null;
            } else if (apiResult.finishReason === "MAX_TOKENS") {
              isContinuation = true;
              if (apiResult.type === "text") globalState.partialOutput = (globalState.partialOutput || "") + apiResult.content;
              logger.logEvent("warn", "MAX_TOKENS reached. Continuing generation.");
              UI.logToTimeline( globalState.total-cycles, `[API WARN] MAX_TOKENS reached. Continuing...`, "warn", true );
              UI.updateStatus(`Calling Gemini (${coreModel}) (MAX_TOKENS cont)...`, true);
              apiResult = null;
            } else if (apiResult.finishReason === "SAFETY") { throw new Error("Iteration stopped due to API Safety Filter."); }
          } while (isContinuation);

          UI.updateStatus("Processing Response...");
          if (!apiResult) throw new Error( "API interaction loop finished without a final text response." );

          if (apiResult.type === "text") {
            const raw = (globalState.partialOutput || "") + (apiResult.content || "");
            globalState.partialOutput = null;
            logger.logEvent("info", `LLM core response length: ${raw.length}.`);
            const sanitized = ApiClient.sanitizeLlmJsonResp(raw);
            const cycleMs = performance.now() - startTime;
            let parsedResp;

            UI.displayCycleArtifact("LLM Output Raw", raw, "info", false, "LLM", "llm.raw", globalState.total-cycles);
            UI.displayCycleArtifact( "LLM Output Sanitized", sanitized, "output", false, "LLM", "llm.sanitized", globalState.total-cycles );

            try {
              parsedResp = JSON.parse(sanitized);
              logger.logEvent("info", "Parsed LLM JSON successfully.");
              UI.logToTimeline( globalState.total-cycles, `[LLM OK] Received and parsed response.` );
            } catch (e) {
              logger.logEvent( "error", `LLM JSON parse failed: ${ e.message }. Content: ${sanitized.substring(0, 500)}` );
              UI.logToTimeline( globalState.total-cycles, `[LLM ERR] Invalid JSON response.`, "error" );
              UI.displayCycleArtifact( "Parse Error", e.message, "error", false, "System", "parse.error", globalState.total-cycles );
              throw new Error(`LLM response was not valid JSON: ${e.message}`);
            }

            globalState.tokenHistory.push(tokens);
            if (globalState.tokenHistory.length > 20) globalState.tokenHistory.shift();
            globalState.avgTokens = globalState.tokenHistory.length > 0 ? globalState.tokenHistory.reduce((a, b) => a + b, 0) / globalState.tokenHistory.length : 0;
            globalState.contextTokenEstimate += tokens;
            UI.checkContextTokenWarning();

            return { response: parsedResp, cycleTimeMillis: cycleMs, error: null, };
          } else {
            logger.logEvent( "warn", `Unexpected final API response type: ${apiResult?.type}` );
            UI.logToTimeline( globalState.total-cycles, `[API WARN] Unexpected final response type: ${apiResult?.type}. Treating as empty.`, "warn" );
            return { response: { agent_confidence_score: 0.0, proposed_changes_description: "(No valid response)", }, cycleTimeMillis: performance.now() - startTime, error: `Unexpected API response type: ${apiResult?.type}`, };
          }
        } catch (error) {
          globalState.partialOutput = null;
          logger.logEvent("error", `Core Iteration failed: ${error.message}`);
          UI.logToTimeline( globalState.total-cycles, `[CYCLE ERR] ${error.message}`, "error" );
          const cycleMs = performance.now() - startTime;
          if (tokens > 0) {
            globalState.tokenHistory.push(tokens);
            if (globalState.tokenHistory.length > 20) globalState.tokenHistory.shift();
            globalState.avgTokens = globalState.tokenHistory.length > 0 ? globalState.tokenHistory.reduce((a, b) => a + b, 0) / globalState.tokenHistory.length : 0;
            globalState.contextTokenEstimate += tokens;
            UI.checkContextTokenWarning();
          }
          return { response: null, cycleTimeMillis: cycleMs, error: error.message, };
        } finally { UI.updateStatus("Idle"); UI.highlightCoreStep(-1); }
       },

       runAutoCritique: async (apiKey, llmProposal, goalInfo) => {
         UI.highlightCoreStep(5); // Critique Trigger
         UI.updateStatus("Running Auto-Critique...", true);
         if (!globalState) throw new Error("Global state not initialized for critique");
         const template = Storage.getArtifactContent("reploid.prompt.critique", 0);
         if (!template) throw new Error("Critique prompt artifact not found!");
         let prompt = template;
         const critiqueModel = globalState.cfg.critiqueModel;

         const trunc = (s, l = 1000) => !s || typeof s !== "string" || s.length <= l ? s || "" : s.substring(0, l / 2) + "\n...\n" + s.substring(s.length - l / 2);

         prompt = prompt
           .replace(/\\\[\\\[PROPOSED_CHANGES_DESC\\\]\\\]/g, llmProposal.proposed_changes_description || "" )
           .replace(/\\\[\\\[MODIFIED_ARTIFACT_IDS\\\]\\\]/g, (llmProposal.modified_artifacts || []).map((a) => a.id).join(", ") || "None" )
           .replace(/\\\[\\\[NEW_ARTIFACT_IDS_TYPES\\\]\\\]/g, (llmProposal.new_artifacts || []).map((a) => `${a.id} (${a.type})`).join(", ") || "None" )
           .replace(/\\\[\\\[DELETED_ARTIFACT_IDS\\\]\\\]/g, (llmProposal.deleted_artifacts || []).join(", ") || "None" )
           .replace(/\\\[\\\[GENERATED_FULL_HTML_SOURCE\\\]\\\]/g, trunc(llmProposal.full_html_source, 4000) )
           .replace(/\\\[\\\[PROPOSED_NEW_TOOL_DECL_OBJ\\\]\\\]/g, JSON.stringify(llmProposal.proposed_new_tool_declaration || null) )
           .replace(/\\\[\\\[GENERATED_TOOL_IMPL_JS\\\]\\\]/g, trunc(llmProposal.generated_tool_implementation_js) )
           .replace(/\\\[\\\[LATEST_GOAL_TYPE\\\]\\\]/g, goalInfo.type)
           .replace(/\\\[\\\[CUMULATIVE_GOAL_CONTEXT\\\]\\\]/g, goalInfo.cumulativeGoal.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;"))
           .replace(/\\\[\\\[AGENT_CONFIDENCE\\\]\\\]/g, llmProposal.agent_confidence_score ?? "N/A" );

         const sysInstruction = 'Critiquer x0. Analyze objectively based on inputs. Output ONLY valid JSON: {"critique_passed": boolean, "critique_report": "string"}';
         UI.displayCycleArtifact("Critique Input", prompt, "input", false, "System", "prompt.critique", globalState.total-cycles);

         try {
           const apiResp = await ApiClient.callApiWithRetry( prompt, sysInstruction, critiqueModel, apiKey );
           if (apiResp.type === "text") {
             UI.displayCycleArtifact( "Critique Output Raw", apiResp.content, "info", false, "LLM", "critique.raw", globalState.total-cycles);
             const sanitized = ApiClient.sanitizeLlmJsonResp(apiResp.content);
             UI.displayCycleArtifact( "Critique Output Sanitized", sanitized, "output", false, "LLM", "critique.sanitized", globalState.total-cycles );
             try {
               const parsedCritique = JSON.parse(sanitized);
               if ( typeof parsedCritique.critique_passed !== "boolean" || typeof parsedCritique.critique_report !== "string" ) { throw new Error( "Critique JSON missing required fields or invalid types." ); }
               UI.logToTimeline( globalState.total-cycles, `[CRITIQUE] Auto-Critique completed. Passed: ${parsedCritique.critique_passed}` );
               return parsedCritique;
             } catch (e) {
               logger.logEvent( "error", `Critique JSON parse/validation failed: ${ e.message }. Content: ${sanitized.substring(0, 300)}` );
               UI.logToTimeline( globalState.total-cycles, `[CRITIQUE ERR] Invalid JSON response format.`, "error" );
               UI.displayCycleArtifact( "Critique Parse Error", e.message, "error", false, "System", "critique.parse.error", globalState.total-cycles );
               return { critique_passed: false, critique_report: `Critique response invalid JSON format: ${e.message}`, };
             }
           } else {
             logger.logEvent( "warn", `Critique API returned non-text response type: ${apiResp.type}.` );
             UI.logToTimeline( globalState.total-cycles, `[CRITIQUE ERR] Non-text response received.`, "error" );
             return { critique_passed: false, critique_report: `Critique API failed (non-text response: ${apiResp.type}).`, };
           }
         } catch (e) {
           logger.logEvent("error", `Critique API call failed: ${e.message}`);
           UI.logToTimeline( globalState.total-cycles, `[CRITIQUE ERR] API Error: ${e.message}`, "error" );
           UI.displayCycleArtifact( "Critique API Error", e.message, "error", false, "System", "critique.api.error", globalState.total-cycles );
           return { critique_passed: false, critique_report: `Critique API failed: ${e.message}`, };
         } finally { UI.updateStatus("Idle"); UI.highlightCoreStep(-1); }
       },

       runSummarization: async (apiKey, stateSnapshotForSummary) => {
        UI.highlightCoreStep(-1);
        UI.updateStatus("Running Summarization...", true);
        if (!globalState) throw new Error("Global state not initialized for summarization");
        const template = Storage.getArtifactContent("reploid.prompt.summarize", 0);
        if (!template) throw new Error("Summarization prompt artifact not found!");
        const recentLogs = logger.getLogBuffer().split("\n").slice(-20).join("\n");
        let prompt = template;
        prompt = prompt.replace( /\\\[\\\[AGENT_STATE_SUMMARY\\\]\\\]/g, JSON.stringify(stateSnapshotForSummary, null, 2) );
        prompt = prompt.replace( /\\\[\\\[RECENT_LOGS\\\]\\\]/g, recentLogs.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;") );
        const critiqueModel = globalState.cfg.critiqueModel;

        const currentCycle = globalState.total-cycles;
        UI.logToTimeline( currentCycle, `[CONTEXT] Running summarization...`, "info", true );
        UI.displayCycleArtifact("Summarize Input", prompt, "input", false, "System", "prompt.summarize", currentCycle);

        try {
          const apiResp = await ApiClient.callApiWithRetry( prompt, 'Summarizer x0 (80% XYZ-2048, 20% LSD-1729). Respond ONLY valid JSON: {"summary": "string"}', critiqueModel, apiKey );
          if (apiResp.type === "text") {
            UI.displayCycleArtifact( "Summarize Output Raw", apiResp.content, "info", false, "LLM", "summary.raw", currentCycle);
            const sanitized = ApiClient.sanitizeLlmJsonResp(apiResp.content);
            UI.displayCycleArtifact( "Summarize Output Sanitized", sanitized, "output", false, "LLM", "summary.sanitized", currentCycle );
            try {
              const parsed = JSON.parse(sanitized);
              if (parsed.summary && typeof parsed.summary === "string") {
                UI.logToTimeline( currentCycle, `[CONTEXT] Summarization successful.`, "info", true );
                return parsed.summary;
              } else { throw new Error("Summary format incorrect in JSON response."); }
            } catch (e) {
              logger.logEvent( "error", `Summarize JSON parse/validation failed: ${ e.message }. Content: ${sanitized.substring(0, 300)}` );
              UI.logToTimeline( currentCycle, `[CONTEXT ERR] Invalid JSON response from summarizer.`, "error", true );
              UI.displayCycleArtifact( "Summarize Parse Error", e.message, "error", false, "System", "summary.parse.error", currentCycle );
              throw e;
            }
          } else {
            logger.logEvent( "warn", `Summarizer API returned non-text response type: ${apiResp.type}.` );
            UI.logToTimeline( currentCycle, `[CONTEXT ERR] Non-text response from summarizer.`, "error", true );
            throw new Error( `Summarizer API failed (non-text response: ${apiResp.type}).` );
          }
        } catch (e) {
          logger.logEvent("error", `Summarization failed: ${e.message}`);
          UI.logToTimeline( currentCycle, `[CONTEXT ERR] Summarization API Error: ${e.message}`, "error", true );
          UI.displayCycleArtifact( "Summarize API Error", e.message, "error", false, "System", "summary.api.error", currentCycle );
          throw e;
        } finally { UI.updateStatus("Idle"); }
      },

      applyLLMChanges: (llmResp, currentCycleNum, critiqueSource) => {
        UI.highlightCoreStep(6); // Refine & Apply
        if (!globalState) return { success: false, errors: ["Global state not initialized"], nextCycle: currentCycleNum };

        let changesMade = [];
        let errors = [];
        currentLlmResponse = llmResp;
        const nextCycleNum = currentCycleNum + 1;

        (llmResp.modified_artifacts || []).forEach((modArt) => {
            const currentMeta = StateManager.getArtifactMetadata(modArt.id);
            if (currentMeta.latestCycle >= 0) {
                const currentContent = Storage.getArtifactContent(modArt.id, currentMeta.latestCycle);
                if (currentContent !== modArt.content) {
                     try {
                         Storage.setArtifactContent(modArt.id, nextCycleNum, modArt.content);
                         changesMade.push(`Modified: ${modArt.id}`);
                         UI.displayCycleArtifact( "Modified Artifact", modArt.content, "output", true, critiqueSource, modArt.id, nextCycleNum );
                     } catch (e) { errors.push(`Failed to save modified artifact ${modArt.id}: ${e.message}`); UI.displayCycleArtifact( "Save Modified Failed", e.message, "error", false, critiqueSource, modArt.id ); }
                } else { UI.displayCycleArtifact( "Modified Artifact (No Change)", currentContent, "info", false, critiqueSource, modArt.id, currentMeta.latestCycle ); }
                if ( modArt.id === "target.diagram" ) { UI.renderDiagramDisplay(nextCycleNum); }
                 if ( modArt.id === 'reploid.script.core' || modArt.id === 'reploid.style.main' || modArt.id === 'reploid.body.main' ) { logger.logEvent('warn', `Core artifact ${modArt.id} modified. Changes take effect on next reload/meta-apply.`); }
             } else { errors.push( `Attempted to modify non-existent or unversioned artifact: ${modArt.id}` ); UI.displayCycleArtifact( "Modify Failed", `Artifact ${modArt.id} not found or has no history.`, "error", false, critiqueSource, modArt.id ); }
        });

        (llmResp.new_artifacts || []).forEach((newArt) => {
          if (!newArt.id || !newArt.type || newArt.content === undefined) { errors.push( `Invalid new artifact structure provided by LLM for ID: ${newArt.id || "undefined"}` ); UI.displayCycleArtifact( "New Artifact Invalid", JSON.stringify(newArt), "error", false, critiqueSource ); return; }
          const existingMeta = StateManager.getArtifactMetadata(newArt.id);
          if (existingMeta && existingMeta.latestCycle >= 0) { errors.push( `Attempted to create new artifact with existing ID: ${newArt.id}` ); UI.displayCycleArtifact( "Create Failed (ID Exists)", newArt.content, "error", false, critiqueSource, newArt.id ); }
          else {
              try {
                 Storage.setArtifactContent(newArt.id, nextCycleNum, newArt.content);
                 StateManager.updateArtifactMetadata(newArt.id, newArt.type, newArt.description || `New ${newArt.type} artifact`, nextCycleNum);
                 changesMade.push(`Created: ${newArt.id} (${newArt.type})`);
                 UI.displayCycleArtifact( "New Artifact", newArt.content, "output", true, critiqueSource, newArt.id, nextCycleNum );
                 if ( newArt.id === "target.diagram" ) { UI.renderDiagramDisplay(nextCycleNum); }
               } catch (e) { errors.push(`Failed to save new artifact ${newArt.id}: ${e.message}`); UI.displayCycleArtifact( "Save New Failed", e.message, "error", false, critiqueSource, newArt.id ); }
           }
        });

        (llmResp.deleted_artifacts || []).forEach((idToDelete) => {
           const meta = StateManager.getArtifactMetadata(idToDelete);
           if (meta && meta.latestCycle >= 0) { // Only delete if it exists and is versioned
             StateManager.deleteArtifactMetadata(idToDelete); // Remove metadata
             // Optionally remove actual LS entries? Be careful not to delete Cycle 0 defaults accidentally.
             // For now, just removing metadata makes it invisible to the agent.
             changesMade.push(`Deleted: ${idToDelete}`);
             UI.displayCycleArtifact( "Deleted Artifact (Metadata Removed)", idToDelete, "output", true, critiqueSource );
             if (idToDelete === "target.diagram" && uiRefs.diagram-display-container) { uiRefs.diagram-display-container.classList.add("hidden"); }
           } else { errors.push( `Attempted to delete non-existent artifact: ${idToDelete}` ); UI.displayCycleArtifact( "Delete Failed", `Artifact ${idToDelete} not found.`, "error", false, critiqueSource, idToDelete ); }
        });

        if (llmResp.proposed_new_tool_declaration) {
          const decl = llmResp.proposed_new_tool_declaration;
          const impl = llmResp.generated_tool_implementation_js || "";
          UI.displayCycleArtifact( "Proposed Tool Declaration", JSON.stringify(decl, null, 2), "output", true, critiqueSource );
          UI.displayCycleArtifact( "Generated Tool Implementation", impl, "output", true, critiqueSource );
          if (decl.name && decl.description && decl.params && impl) {
            const existingIndex = dynamicToolDefinitions.findIndex( (t) => t.declaration.name === decl.name );
            const toolEntry = { declaration: decl, implementation: impl };
            let toolChangeType = "";
            if (existingIndex !== -1) { dynamicToolDefinitions[existingIndex] = toolEntry; toolChangeType = `Tool Updated: ${decl.name}`; }
            else { dynamicToolDefinitions.push(toolEntry); toolChangeType = `Tool Defined: ${decl.name}`; }
            globalState.dynamicTools = [...dynamicToolDefinitions]; // Update state
            changesMade.push(toolChangeType);
            UI.logToTimeline( currentCycleNum, `[ARTIFACT] ${toolChangeType}`, "info", true );
          } else { errors.push(`Invalid tool definition/implementation provided.`); UI.logToTimeline( currentCycleNum, `[APPLY ERR] Tool definition/implementation invalid or incomplete.`, "error", true ); }
        } else { UI.displayCycleArtifact( "Tool Generation", "(Not Proposed)", "info", false, critiqueSource ); }


        if (llmResp.full_html_source) {
          globalState.lastGeneratedFullSource = llmResp.full_html_source;
          changesMade.push("Generated Full HTML Source (Sandbox)");
          UI.displayCycleArtifact( "Full HTML Source", "(Prepared for Sandbox)", "output", true, critiqueSource );
          UI.logToTimeline( currentCycleNum, `[APPLY] SELF-MOD (Full Source) generated. Sandbox review required.`, "info", true );
          UI.showMetaSandbox(llmResp.full_html_source);
          return { success: errors.length === 0, changes: changesMade, errors: errors, nextCycle: currentCycleNum }; // Stay on current cycle until approved
        }

        const targetArtifactChanged = changesMade.some( c => c.includes("target.head") || c.includes("target.body") || c.includes("target.style") || c.includes("target.script") || c.includes("target.diagram") );
        if (targetArtifactChanged && errors.length === 0) {
          UI.logToTimeline( currentCycleNum, `[APPLY] Applying changes to target artifacts for Cycle ${nextCycleNum}. Rendering UI Preview.`, "info", true );
          UI.renderGeneratedUI(nextCycleNum);
        }

        UI.logToTimeline( currentCycleNum, `[APPLY] Changes saved for Cycle ${nextCycleNum} from ${critiqueSource}: ${changesMade.join(", ") || "None"}. Errors: ${errors.length}`, errors.length > 0 ? "warn" : "info", true );

        if (errors.length === 0) {
           globalState.total-cycles = nextCycleNum;
        }

        const confidence = llmResp.agent_confidence_score ?? 0.0;
        globalState.confidenceHistory.push(confidence);
        if (globalState.confidenceHistory.length > 20) globalState.confidenceHistory.shift();
        UI.updateMetricsDisplay();

        return { success: errors.length === 0, changes: changesMade, errors: errors, nextCycle: errors.length === 0 ? nextCycleNum : currentCycleNum };
      },

      proceedAfterHumanIntervention: ( feedbackType, feedbackData = "", skipCycleIncrement = false ) => {
           if (!globalState) return;
           const currentCycle = globalState.total-cycles;
           let nextCycle = currentCycle;
           let feedbackMsg = feedbackData;
           if (feedbackType === "Human Code Edit") feedbackMsg = `Edited ${feedbackData.id}: ${feedbackData.summary}`;
           else if (feedbackType === "Human Options") feedbackMsg = `Selected: ${feedbackData}`;

           globalState.lastFeedback = `${feedbackType}: ${feedbackMsg.substring(0, 150)}...`;
           globalState.critiqueFailHistory.push(feedbackType.includes("Failed") || feedbackType.includes("Discarded"));
           if (feedbackType.startsWith("Human") && !skipCycleIncrement) globalState.humanInterventions++;

           let applySuccess = true;
           if (feedbackType === "Human Code Edit" && feedbackData.success) {
               nextCycle = currentCycle + 1;
               try {
                   if (feedbackData.id === 'full_html_source') {
                       globalState.lastGeneratedFullSource = feedbackData.newContent;
                       logger.logEvent( "info", `Human edit applied to pending full_html_source state.` );
                   } else {
                       Storage.setArtifactContent(feedbackData.id, nextCycle, feedbackData.newContent);
                       UI.displayCycleArtifact( `Human Edit Applied`, feedbackData.newContent, "info", true, "Human", feedbackData.id, nextCycle );
                   }
                   logger.logEvent( "info", `Human edit applied to artifact ${feedbackData.id} for cycle ${nextCycle}` );
                   UI.logToTimeline( currentCycle, `[HUMAN] Applied edit to ${feedbackData.id} for cycle ${nextCycle}`, "info", true );
                   if (feedbackData.id.startsWith("target.")) UI.renderGeneratedUI(nextCycle);
                   if (feedbackData.id === "target.diagram") UI.renderDiagramDisplay(nextCycle);
                   if (!skipCycleIncrement) globalState.total-cycles = nextCycle;
               } catch (e) {
                   logger.logEvent('error', `Failed saving human edit for ${feedbackData.id}: ${e.message}`);
                   UI.showNotification(`Failed saving human edit: ${e.message}`, 'error');
                   applySuccess = false; nextCycle = currentCycle;
               }

           } else if ( feedbackType === "Human Code Edit" && !feedbackData.success ) { applySuccess = false; }
             else if (!skipCycleIncrement) { nextCycle = currentCycle + 1; globalState.total-cycles = nextCycle; }

           const summaryOutcome = !applySuccess || feedbackType.includes("Fail") || feedbackType.includes("Discard") ? `Failed (${feedbackType})` : `OK (${feedbackType})`;
           UI.summarizeCompletedCycleLog(lastCycleLogItem, summaryOutcome);
           lastCycleLogItem = null;

           UI.logToTimeline( currentCycle, `[STATE] ${feedbackType} processed. Feedback: "${feedbackMsg.substring(0, 70)}..." Next Cycle: ${globalState.total-cycles}`, "info" );
           UI.hideHumanInterventionUI();
           globalState.personaMode = globalState.cfg.personaBalance < 50 ? "XYZ" : "LSD";
           globalState.retryCount = 0;
           UI.updateStateDisplay();
           UI.clearCurrentCycleDetails();
           UI.logToTimeline(globalState.total-cycles, `[STATE] Ready for next action.`);
           if(uiRefs.goal-input) uiRefs.goal-input.value = "";
           if(uiRefs.runCycleButton) {
              uiRefs.runCycleButton.textContent = "Run Cycle";
              uiRefs.runCycleButton.disabled = false;
           }
           UI.updateStatus("Idle");
           UI.highlightCoreStep(-1);
           StateManager.save();
       },

       saveHtmlToHistory: (htmlContent) => {
        if(!globalState) return;
        const limit = globalState.cfg?.htmlHistoryLimit ?? 5;
        if (!globalState.htmlHistory) globalState.htmlHistory = [];
        globalState.htmlHistory.push(htmlContent);
        while (globalState.htmlHistory.length > limit) globalState.htmlHistory.shift();
        UI.updateHtmlHistoryControls();
        logger.logEvent( "info", `Saved current HTML state to history. Size: ${globalState.htmlHistory.length}` );
       },

       handleSummarizeContext: async () => {
          if (!globalState || !globalState.apiKey) { UI.showNotification("API Key is required for resetting context.", 'warn'); return; }

          UI.updateStatus("Resetting context...", true);
          const currentCycle = globalState.total-cycles;
          const nextCycle = currentCycle + 1;
          UI.logToTimeline( currentCycle, "[CTX] Resetting context - running summarization...", "info", true );
          UI.clearCurrentCycleDetails();

          try {
              const stateSummary = {
                  total-cycles: globalState.total-cycles, agentIterations: globalState.agentIterations, humanInterventions: globalState.humanInterventions, failCount: globalState.failCount,
                  currentGoal: globalState.currentGoal, lastCritiqueType: globalState.lastCritiqueType, lastFeedback: globalState.lastFeedback?.substring(0, 200),
                  avgConfidence: globalState.avgConfidence, critiqueFailRate: globalState.critiqueFailRate,
                  dynamicTools: dynamicToolDefinitions.map((t) => t.declaration.name),
                  artifactOverview: Object.values(StateManager.getAllArtifactMetadata()).map(a => `${a.id} (${a.type}, Cyc ${a.latestCycle})`).join(", "),
              };

              const summaryText = await CycleLogic.runSummarization( globalState.apiKey, stateSummary );

              Storage.setArtifactContent('meta.summary_context', nextCycle, summaryText);

              globalState.currentGoal.summaryContext = summaryText;
              globalState.contextTokenEstimate = Math.round((summaryText.length / 4) * 1.1) + 500; // Rough estimate
              globalState.lastFeedback = `Context automatically reset and summarized at Cycle ${currentCycle}.`;
              globalState.lastCritiqueType = "Context Reset";
              globalState.total-cycles = nextCycle;

              UI.logToTimeline( currentCycle, `[CTX] Context reset. Summary saved as meta.summary_context_${nextCycle}. New est. tokens: ${globalState.contextTokenEstimate.toLocaleString()}. Ready for next goal.`, "info" );
              UI.displayCycleArtifact( "Generated Context Summary", summaryText, "output", true, 'System', "meta.summary_context", nextCycle );
              UI.showNotification( "Context reset. A summary has been generated and will be used.", 'info' );
          } catch (error) {
              logger.logEvent("error", `Context reset failed: ${error.message}`);
              UI.showNotification(`Context reset failed: ${error.message}`, 'error');
              UI.logToTimeline( currentCycle, `[CTX ERR] Context reset failed: ${error.message}`, "error" );
          } finally {
              UI.updateStateDisplay();
              UI.updateStatus("Idle");
              UI.highlightCoreStep(-1);
              StateManager.save();
          }
      },

      executeCycle: async () => {
        if (!globalState) { UI.showNotification("State not initialized!", 'error'); return; }
        if (lastCycleLogItem) UI.summarizeCompletedCycleLog(lastCycleLogItem, "Interrupted");
        UI.clearCurrentCycleDetails();
        currentLlmResponse = null;
        globalState.apiKey = uiRefs.apiKeyInput.value.trim() || APP_CONFIG.API_KEY;
        if ( !globalState.apiKey || globalState.apiKey === "<nope>" || globalState.apiKey.length < 10 ) { UI.showNotification("Valid API Key required in config or input field.", 'warn'); return; }

        UI.logCoreLoopStep(globalState.total-cycles, 0, "Define Goal");
        const goalText = uiRefs.goal-input.value.trim();
        const goalTypeElement = document.querySelector('input[name="goalType"]:checked');
        const goalType = goalTypeElement ? goalTypeElement.value : "System";

        if (!goalText && !globalState.currentGoal.seed) { UI.showNotification("Initial Goal Input required.", 'warn'); return; }

        const maxC = globalState.cfg.maxCycles || 0;
        if (maxC > 0 && globalState.total-cycles >= maxC) { UI.showNotification(`Max cycles (${maxC}) reached.`, 'info'); if(uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = true; return; }
        if (globalState.contextTokenEstimate >= CTX_WARN_THRESH) { UI.showNotification('Context token limit high. Consider resetting context.', 'warn'); }

        const currentCycle = globalState.total-cycles;
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
             UI.displayCycleArtifact( "New Goal Input", `${goalType}: ${goalText}`, "input", false, "User", "goal.input", currentCycle );
        } else if (!globalState.currentGoal.seed) { UI.showNotification("No goal provided and no seed goal exists.", 'error'); return; }

        const goalInfo = CycleLogic.getActiveGoalInfo();
        globalState.retryCount = 0;
        if(uiRefs.currentCycleNumber) uiRefs.currentCycleNumber.textContent = currentCycle;
        if(uiRefs.runCycleButton) { uiRefs.runCycleButton.disabled = true; uiRefs.runCycleButton.textContent = "Processing..."; }
        UI.updateStatus("Starting Cycle...", true);
        UI.updateStateDisplay(); // Update display with new goal info if any
        lastCycleLogItem = UI.logToTimeline( currentCycle, `[CYCLE] === Cycle ${currentCycle} Start === Latest Goal Type: ${goalInfo.type}` );
        UI.logToTimeline( currentCycle, `[GOAL] Latest: "${goalInfo.latestGoal.substring(0, 70)}..."`, "info", true );
        UI.displayCycleArtifact( "Cumulative Goal", goalInfo.cumulativeGoal, "input", false, "System", "goal.cumulative", currentCycle );
        UI.renderDiagramDisplay(currentCycle);

        let iterationResult = null;
        let successfulIteration = false;
        do {
          UI.logToTimeline( currentCycle, `[STATE] Starting Agent Iteration Attempt (Retry: ${globalState.retryCount})`, "info", true );
          iterationResult = await CycleLogic.runCoreIteration(globalState.apiKey, goalInfo);

          if (iterationResult.error || !iterationResult.response) {
            logger.logEvent( "error", `Iteration attempt failed: ${iterationResult.error || "No response"}` );
            globalState.retryCount++;
            if (globalState.retryCount > globalState.cfg.maxRetries) {
              UI.logToTimeline( currentCycle, `[RETRY] Max retries (${globalState.cfg.maxRetries}) exceeded. Forcing Human Intervention.`, "error" );
              globalState.failCount++; UI.updateMetricsDisplay();
              UI.showHumanInterventionUI( "prompt", `Cycle failed after ${globalState.retryCount} attempts: ${iterationResult.error || "Unknown error"}` );
              StateManager.save(); return;
            } else {
              UI.logToTimeline( currentCycle, `[RETRY] Attempting retry ${globalState.retryCount}/${globalState.cfg.maxRetries}...`, "warn", true );
              globalState.lastFeedback = `Retry ${globalState.retryCount}: ${iterationResult.error || "No response"}`;
              await new Promise((r) => setTimeout(r, 1000 * globalState.retryCount));
            }
          } else { successfulIteration = true; globalState.retryCount = 0; UI.logToTimeline( currentCycle, `[STATE] Agent Iteration successful.`, "info", true ); }
        } while (!successfulIteration);

        currentLlmResponse = iterationResult.response;
        UI.displayCycleArtifact( "Agent Deliberation", currentLlmResponse.persona_analysis_musing || "(N/A)", "info", false, "LLM", "llm.musing", currentCycle );
        UI.displayCycleArtifact( "Proposed Changes", currentLlmResponse.proposed_changes_description || "(N/A)", "info", false, "LLM", "llm.proposal", currentCycle );
        UI.displayCycleArtifact( "Agent Justification", currentLlmResponse.justification_persona_musing || "(N/A)", "info", false, "LLM", "llm.justification", currentCycle );
        UI.displayCycleArtifact( "Agent Confidence", currentLlmResponse.agent_confidence_score?.toFixed(3) || "(N/A)", "info", false, "LLM", "llm.confidence", currentCycle );

        UI.logCoreLoopStep(currentCycle, 4, "Critique Trigger Check");
        const { cycleTimeMillis } = iterationResult;
        const cycleSecs = cycleTimeMillis / 1000;
        const confidence = currentLlmResponse.agent_confidence_score ?? 0.0;

        const pauseThresh = globalState.cfg.pauseAfterCycles || 0;
        const confThresh = globalState.cfg.autoCritiqueThresh ?? 0.6;
        const humanProb = (globalState.cfg.humanReviewProb ?? 50) / 100.0;
        const llmProb = (globalState.cfg.llmCritiqueProb ?? 50) / 100.0;
        const maxTime = globalState.cfg.maxCycleTime ?? 600;
        let humanNeeded = false; let critReason = ""; let hitlModePref = "prompt";

        if (globalState.forceHumanReview) { humanNeeded = true; critReason = "Forced Review"; globalState.forceHumanReview = false; }
        else if (pauseThresh > 0 && currentCycle > 0 && currentCycle % pauseThresh === 0) { humanNeeded = true; critReason = `Auto Pause (${currentCycle}/${pauseThresh})`; }
        else if (Math.random() < humanProb) { humanNeeded = true; critReason = `Random Review (${(
          humanProb * 100
        ).toFixed(0)}%)`; hitlModePref = "code_edit"; }
        else if (cycleSecs > maxTime) { humanNeeded = true; critReason = `Time Limit Exceeded (${cycleSecs.toFixed(1)}s > ${maxTime}s)`; }
        else if (confidence < confThresh) { humanNeeded = true; critReason = `Low Confidence (${confidence.toFixed(2)} < ${confThresh})`; }

        UI.logToTimeline( currentCycle, `[DECIDE] Time:${cycleSecs.toFixed(1)}s, Conf:${confidence.toFixed(2)}. Human Needed: ${humanNeeded ? critReason : "No"}.`, "info", true );

        let critiquePassed = false; let critiqueReport = "Critique Skipped"; let applySource = "Skipped";

        if (humanNeeded) {
          critiquePassed = false; critiqueReport = `Human Intervention Required: ${critReason}`; applySource = "Human"; globalState.lastCritiqueType = `Human (${critReason})`; globalState.critiqueFailHistory.push(false);
          UI.logCoreLoopStep( currentCycle, 5, `Critique: Human Intervention (${critReason})` );
          UI.updateStatus(`Paused: Human Review (${critReason})`);
          const firstModifiedId = currentLlmResponse.modified_artifacts?.[0]?.id; const firstNewId = currentLlmResponse.new_artifacts?.[0]?.id;
          const artifactToEdit = firstModifiedId || firstNewId || (currentLlmResponse.full_html_source ? "full_html_source" : null);
          UI.showHumanInterventionUI(hitlModePref, critReason, [], artifactToEdit);
          StateManager.save(); return;
        } else if (Math.random() < llmProb) {
          UI.logToTimeline( currentCycle, `[DECIDE] Triggering Auto Critique (${(
            llmProb * 100
          ).toFixed(0)}% chance).`, "info", true );
          UI.logCoreLoopStep(currentCycle, 5, "Critique: Auto");
          const critiqueResult = await CycleLogic.runAutoCritique( globalState.apiKey, currentLlmResponse, goalInfo );
          critiquePassed = critiqueResult.critique_passed; critiqueReport = critiqueResult.critique_report; applySource = `AutoCrit ${critiquePassed ? "Pass" : "Fail"}`; globalState.lastCritiqueType = `Automated (${critiquePassed ? "Pass" : "Fail"})`; globalState.critiqueFailHistory.push(!critiquePassed); UI.updateMetricsDisplay();
          UI.logToTimeline( currentCycle, `[CRITIQUE] AutoCrit Result: ${critiquePassed ? "Pass" : "Fail"}. Report: ${critiqueReport.substring(0, 100)}...`, critiquePassed ? "info" : "error", true );
          UI.displayCycleArtifact( "Automated Critique Report", critiqueReport, critiquePassed ? "info" : "error", false, "LLM", "critique.report", currentCycle );

          if (!critiquePassed) {
            UI.logToTimeline( currentCycle, `[STATE] Auto-Critique failed. Forcing Human Intervention.`, "warn", true );
            globalState.failCount++; UI.updateMetricsDisplay();
            UI.showHumanInterventionUI( "prompt", `Automated Critique Failed: ${critiqueReport.substring(0, 150)}...` );
            StateManager.save(); return;
          }
        } else {
          critiquePassed = true; applySource = "Skipped"; globalState.lastCritiqueType = "Skipped"; globalState.critiqueFailHistory.push(false); UI.updateMetricsDisplay();
          UI.logCoreLoopStep(currentCycle, 5, "Critique: Skipped");
          UI.logToTimeline( currentCycle, `[DECIDE] Critique Skipped (Below ${(
            llmProb * 100
          ).toFixed(
            0
          )}% threshold). Applying directly.`, "info", true );
        }

        if (critiquePassed) {
          UI.updateStatus("Applying Changes...", true);
          const applyResult = CycleLogic.applyLLMChanges( currentLlmResponse, currentCycle, applySource );
          UI.logCoreLoopStep(currentCycle, 6, "Refine & Apply");

          if (!metaSandboxPending) {
            if (applyResult.success) {
              globalState.agentIterations++;
              globalState.lastFeedback = `${applySource}, applied successfully for Cycle ${applyResult.nextCycle}.`;
            } else {
              globalState.lastFeedback = `${applySource}, but application failed: ${applyResult.errors.join(", ")}`;
              globalState.failCount++; UI.updateMetricsDisplay();
              UI.logToTimeline( currentCycle, `[APPLY ERR] Failed to apply changes: ${applyResult.errors.join(", ")}. Forcing Human Intervention.`, "error" );
              UI.showHumanInterventionUI( "prompt", `Failed to apply changes after critique: ${applyResult.errors.join(", ")}` );
              StateManager.save(); return;
            }

            const summaryOutcome = applyResult.success ? `OK (${globalState.lastCritiqueType})` : `Failed (Apply Fail after ${globalState.lastCritiqueType})`;
            UI.summarizeCompletedCycleLog(lastCycleLogItem, summaryOutcome);
            lastCycleLogItem = null;

            UI.updateStateDisplay();
            UI.clearCurrentCycleDetails();
            UI.logCoreLoopStep(applyResult.nextCycle -1, 7, "Repeat/Pause"); // Log step 8
            UI.logToTimeline( globalState.total-cycles, `[STATE] Cycle ended (${globalState.lastCritiqueType}). Ready for action.` );
            if(uiRefs.goal-input) uiRefs.goal-input.value = "";
            if(uiRefs.runCycleButton) { uiRefs.runCycleButton.disabled = false; uiRefs.runCycleButton.textContent = "Run Cycle"; }
            UI.updateStatus("Idle"); UI.highlightCoreStep(-1);
          } else {
            globalState.lastCritiqueType = `${applySource} (Sandbox Pending)`;
            UI.updateStateDisplay(); UI.updateStatus("Awaiting Meta Sandbox Approval...");
            UI.highlightCoreStep(6); // Still in Apply phase
          }
        }
        StateManager.save();
      }
  };

  const initialize = () => {
      logger.logEvent("info", `Initializing x0 Engine v${STATE_VERSION}`);
      UI.updateStatus("Initializing...");

      const loadedExistingState = StateManager.init();
      const restoredFromSession = StateManager.restoreStateFromSession();

      if (!restoredFromSession) {
          UI.initializeUIElementReferences();
          if (loadedExistingState) {
               UI.logToTimeline(globalState.total-cycles, "[STATE] System Initialized (Loaded Session).");
          } else {
               UI.logToTimeline(0, "[STATE] System Initialized (New Session).");
          }
          UI.updateStateDisplay();
          UI.renderGeneratedUI(globalState.total-cycles);
          UI.displayGenesisState();
          UI.loadPromptsFromLS();
          UI.loadCoreLoopSteps();
      }

      UI.populateModelSelectors(); // Populate after refs are initialized
      UI.updateStateDisplay(); // Call again to set selected models correctly

      UI.setupEventListeners();
      UI.highlightCoreStep(-1);
      UI.updateStatus("Idle");
       document.querySelectorAll('fieldset').forEach(fs => fs.classList.add('collapsed'));
       document.getElementById('currentCycleDetails')?.classList.remove('collapsed');
       document.getElementById('controlsFieldset')?.classList.remove('collapsed'); // Keep controls open initially
       UI.updateFieldsetSummaries();
      logger.logEvent("info", "Initialization complete.");
  };

  return {
    initialize // Expose only the init function publicly
  };

})();

// Start the application
REPLOID_CORE.initialize();