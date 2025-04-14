const CycleLogicModule = (
  config,
  logger,
  Utils,
  Storage,
  StateManager,
  UI,
  ApiClient,
  ToolRunner
) => {
  if (
    !config ||
    !logger ||
    !Utils ||
    !Storage ||
    !StateManager ||
    !UI ||
    !ApiClient ||
    !ToolRunner
  ) {
    console.error("CycleLogicModule requires all core modules.");
    const log = logger || {
      logEvent: (lvl, msg) =>
        console[lvl === "error" ? "error" : "log"](
          `[CYCLELOGIC FALLBACK] ${msg}`
        ),
    };
    log.logEvent(
      "error",
      "CycleLogicModule initialization failed: Missing dependencies."
    );
    return {
      init: () => log.logEvent("error", "CycleLogic not initialized."),
      executeCycle: async () => {
        log.logEvent("error", "CycleLogic not initialized.");
      },
      isRunning: () => false,
      getActiveGoalInfo: () => ({ type: "Idle", latestGoal: "Idle" }),
      proceedAfterHumanIntervention: () => {
        log.logEvent("error", "CycleLogic not initialized.");
      },
      handleSummarizeContext: async () => {
        log.logEvent("error", "CycleLogic not initialized.");
      },
      abortCurrentCycle: () => {
        log.logEvent("error", "CycleLogic not initialized.");
      },
      saveHtmlToHistory: () => {
        log.logEvent("error", "CycleLogic not initialized.");
      },
      runTool: async () => {
        throw new Error("CycleLogic not initialized.");
      },
    };
  }

  let _isRunning = false;
  let currentLlmResponse = null;
  let loadedStaticTools = [];
  let isLogicInitialized = false;

  const init = () => {
    if (isLogicInitialized) return;
    logger.logEvent("info", "Initializing CycleLogic Module...");
    try {
      const staticToolsContent = Storage.getArtifactContent(
        "reploid.core.static-tools",
        0
      );
      if (staticToolsContent) {
        loadedStaticTools = JSON.parse(staticToolsContent);
        logger.logEvent(
          "debug",
          `CycleLogic loaded ${loadedStaticTools.length} static tools definitions.`
        );
      } else {
        logger.logEvent(
          "warn",
          "Static tools artifact not found during CycleLogic init."
        );
        loadedStaticTools = [];
      }
    } catch (e) {
      logger.logEvent(
        "error",
        `Failed to load/parse static tools in CycleLogic: ${e.message}`,
        e
      );
      loadedStaticTools = [];
    }
    isLogicInitialized = true;
    logger.logEvent("info", "CycleLogic Module initialized.");
  };

  const isRunning = () => _isRunning;

  const getActiveGoalInfo = () => {
    const state = StateManager?.getState();
    if (!state || !state.currentGoal)
      return {
        seedGoal: "N/A",
        cumulativeGoal: "N/A",
        latestGoal: "Idle",
        type: "Idle",
      };
    const latestGoal = state.currentGoal.cumulative || state.currentGoal.seed;
    return {
      seedGoal: state.currentGoal.seed || "None",
      cumulativeGoal: state.currentGoal.cumulative || "None",
      latestGoal: latestGoal || "Idle",
      type: state.currentGoal.latestType || "Idle",
    };
  };

  const _getArtifactListSummary = () => {
    if (!StateManager) return "Error: StateManager not available.";
    const allMeta = StateManager.getAllArtifactMetadata();
    return (
      Object.values(allMeta)
        .filter((artMeta) => artMeta && artMeta.latestCycle >= 0)
        .map(
          (artMeta) =>
            `* ${artMeta.id} (${artMeta.type}) - Cycle ${artMeta.latestCycle}`
        )
        .join("\n") || "None"
    );
  };

  const _getToolListSummary = () => {
    if (!StateManager) return "Error: StateManager not available.";
    const state = StateManager.getState();
    const dynamicTools = state?.dynamicTools || [];
    const staticToolSummary = loadedStaticTools
      .map((t) => `* [S] ${t.name}: ${Utils.trunc(t.description, 60)}`)
      .join("\n");
    const dynamicToolSummary = dynamicTools
      .map(
        (t) =>
          `* [D] ${t.declaration.name}: ${Utils.trunc(
            t.declaration.description,
            60
          )}`
      )
      .join("\n");
    return (
      [staticToolSummary, dynamicToolSummary].filter((s) => s).join("\n") ||
      "None"
    );
  };

  const _assembleCorePrompt = (state, goalInfo, currentCycle) => {
    const corePromptTemplate =
      Storage.getArtifactContent("reploid.core.sys-prompt", currentCycle) ||
      Storage.getArtifactContent("reploid.core.sys-prompt", 0);
    if (!corePromptTemplate)
      throw new Error(
        "Core prompt artifact 'reploid.core.sys-prompt' not found!"
      );

    const personaBalance = state.cfg?.personaBalance ?? 50;
    const primaryPersona = state.personaMode; // Already set before calling

    let prompt = corePromptTemplate
      .replace(/\[LSD_PERCENT\]/g, String(personaBalance))
      .replace(/\[PERSONA_MODE\]/g, primaryPersona)
      .replace(/\[CYCLE_COUNT\]/g, String(state.totalCycles))
      .replace(/\[AGENT_ITR_COUNT\]/g, String(state.agentIterations))
      .replace(/\[HUMAN_INT_COUNT\]/g, String(state.humanInterventions))
      .replace(/\[FAIL_COUNT\]/g, String(state.failCount))
      .replace(
        /\[LAST_FEEDBACK\]/g,
        Utils.trunc(state.lastFeedback || "None", 500)
      )
      .replace(/\[AVG_CONF\]/g, state.avgConfidence?.toFixed(2) || "N/A")
      .replace(
        /\[CRIT_FAIL_RATE\]/g,
        state.critiqueFailRate?.toFixed(1) + "%" || "N/A"
      )
      .replace(/\[AVG_TOKENS\]/g, state.avgTokens?.toFixed(0) || "N/A")
      .replace(
        /\[CTX_TOKENS\]/g,
        state.contextTokenEstimate?.toLocaleString() || "0"
      )
      .replace(/\[\[DYNAMIC_TOOLS_LIST\]\]/g, _getToolListSummary())
      .replace(
        /\[\[RECENT_LOGS\]\]/g,
        Utils.trunc(
          logger.getLogBuffer
            ? logger.getLogBuffer().split("\n").slice(-15).join("\n")
            : "Logs unavailable",
          1000
        )
      )
      .replace(/\[\[ARTIFACT_LIST\]\]/g, _getArtifactListSummary())
      .replace(
        /\[\[SEED_GOAL_DESC\]\]/g,
        Utils.trunc(goalInfo.seedGoal || "None", 1000)
      )
      .replace(
        /\[\[CUMULATIVE_GOAL_DESC\]\]/g,
        Utils.trunc(goalInfo.cumulativeGoal || "None", 2000)
      )
      .replace(
        /\[\[SUMMARY_CONTEXT\]\]/g,
        Utils.trunc(state.currentGoal?.summaryContext || "None", 2000)
      );

    const allMeta = StateManager.getAllArtifactMetadata();
    const relevantArtifacts = Object.keys(allMeta)
      .filter(
        (id) =>
          allMeta[id]?.latestCycle >= 0 &&
          (id.startsWith("target.") ||
            (goalInfo.type === "Meta" && id.startsWith("reploid.")))
      )
      .sort(
        (a, b) =>
          (allMeta[b]?.latestCycle ?? -1) - (allMeta[a]?.latestCycle ?? -1)
      )
      .slice(0, 10);

    let snippets = "";
    for (const id of relevantArtifacts) {
      const meta = allMeta[id];
      if (!meta) continue;
      const content = Storage.getArtifactContent(id, meta.latestCycle);
      if (content !== null) {
        snippets += `\n---\nArtifact: ${id} (Cycle ${
          meta.latestCycle
        })\n${Utils.trunc(content, 500)}\n---`;
      }
    }
    prompt = prompt.replace(
      /\[\[ARTIFACT_CONTENT_SNIPPETS\]\]/g,
      snippets || "No relevant artifact snippets found or loaded."
    );

    UI.displayCycleArtifact(
      "LLM Input Prompt",
      prompt,
      "input",
      false,
      "System",
      "prompt.core",
      currentCycle
    );
    if (state.currentGoal?.summaryContext) {
      UI.displayCycleArtifact(
        "LLM Input Context",
        state.currentGoal.summaryContext,
        "input",
        false,
        "System",
        "prompt.summary",
        currentCycle
      );
    }
    return prompt;
  };

  const _prepareFunctionDeclarations = async (state) => {
    let allFuncDecls = [];
    const dynamicTools = state?.dynamicTools || [];
    try {
      const staticToolPromises = loadedStaticTools.map(async (toolDef) => {
        try {
          return (
            await ToolRunner.runTool(
              "convert_to_gemini_fc",
              { mcpToolDefinition: toolDef },
              loadedStaticTools,
              []
            )
          ).geminiFunctionDeclaration;
        } catch (e) {
          logger.logEvent(
            "error",
            `Failed converting static tool ${toolDef.name}: ${e.message}`
          );
          return null;
        }
      });
      const dynamicToolPromises = dynamicTools.map(async (toolDef) => {
        try {
          return (
            await ToolRunner.runTool(
              "convert_to_gemini_fc",
              { mcpToolDefinition: toolDef.declaration },
              loadedStaticTools,
              []
            )
          ).geminiFunctionDeclaration;
        } catch (e) {
          logger.logEvent(
            "error",
            `Failed converting dynamic tool ${toolDef.declaration.name}: ${e.message}`
          );
          return null;
        }
      });
      const results = await Promise.all([
        ...staticToolPromises,
        ...dynamicToolPromises,
      ]);
      allFuncDecls = results.filter(Boolean);
    } catch (toolConvError) {
      logger.logEvent(
        "error",
        `Error during tool conversion phase: ${toolConvError.message}`,
        toolConvError
      );
    }
    return allFuncDecls;
  };

  const _runLlmIteration = async (state, goalInfo, currentCycle) => {
    UI.highlightCoreStep(1); // Analyze Step visually starts here
    const prompt = _assembleCorePrompt(state, goalInfo, currentCycle);
    const sysInstruction = `You are x0. DELIBERATE, adopt ${state.personaMode}. Respond ONLY valid JSON. Refer to artifacts by ID. Use artifactId argument for tools requiring artifact content.`;
    const allFuncDecls = await _prepareFunctionDeclarations(state);
    const coreModel = state.cfg?.coreModel || config.DEFAULT_MODELS.BASE;
    const apiKey = state.apiKey;
    const startTime = performance.now();
    let finalResult = null;
    let apiHistory = [];
    let currentApiResult = null;

    UI.clearStreamingOutput();
    UI.highlightCoreStep(2); // Propose Step (LLM Call)

    try {
      let accumulatedText = "";
      let streamingResult = null; // Holds the object returned by callApiWithRetry

      streamingResult = await ApiClient.callApiWithRetry(
        prompt,
        sysInstruction,
        coreModel,
        apiKey,
        allFuncDecls,
        false,
        null,
        state.cfg?.maxRetries ?? 1,
        UI.updateStatus,
        UI.logToTimeline,
        UI.updateTimelineItem,
        (progress) => {
          if (progress.type === "text") {
            accumulatedText += progress.content;
            UI.updateStreamingOutput(accumulatedText);
          } else if (progress.type === "functionCall") {
            UI.updateStreamingOutput(
              "Function Call received: " +
                progress.content.name +
                "\nArgs:\n" +
                JSON.stringify(progress.content.args, null, 2)
            );
          }
          currentApiResult = progress.accumulatedResult; // Store the latest accumulated result
        }
      );

      if (!currentApiResult) currentApiResult = streamingResult; // Use final result if no streaming updates happened

      if (
        currentApiResult?.type === "functionCall" &&
        currentApiResult.content
      ) {
        UI.updateStatus("Processing Tool Calls...", true);
        apiHistory.push({ role: "user", parts: [{ text: prompt }] });
        if (currentApiResult.rawResp?.candidates?.[0]?.content) {
          apiHistory.push(currentApiResult.rawResp.candidates[0].content);
        }

        const fc = currentApiResult.content;
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
            state.dynamicTools || []
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
          logger.logEvent("error", `Tool failed ${fc.name}: ${e.message}`, e);
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
          throw new Error(`Tool execution failed: ${fc.name} - ${e.message}`); // Propagate tool failure
        }
        apiHistory.push({
          role: "function",
          parts: [{ functionResponse: funcRespContent }],
        });

        UI.updateStatus(
          `Calling Gemini (${coreModel}) (tool results)...`,
          true
        );
        accumulatedText = ""; // Reset for the next call's text output
        currentApiResult = null; // Reset result for the next call

        streamingResult = await ApiClient.callApiWithRetry(
          null,
          sysInstruction,
          coreModel,
          apiKey,
          allFuncDecls,
          true,
          apiHistory,
          state.cfg?.maxRetries ?? 1,
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
        if (!currentApiResult) currentApiResult = streamingResult;
      }

      UI.updateStatus("Processing Final Response...");
      const finalContent =
        currentApiResult?.type === "text"
          ? currentApiResult.content
          : accumulatedText;
      UI.updateStreamingOutput(finalContent || "(No final text output)", true);

      const sanitized = ApiClient.sanitizeLlmJsonResp(finalContent);
      const cycleMs = performance.now() - startTime;
      let parsedResp;

      UI.displayCycleArtifact(
        "LLM Final Output Raw",
        finalContent || "(No text content)",
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
        logger.logEvent(
          "info",
          `Parsed final LLM JSON after iteration ${currentCycle}.`
        );
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
          )}`,
          e
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
        throw new Error(`LLM response invalid JSON: ${e.message}`); // Propagate parse failure
      }

      const tokens = currentApiResult?.tokenCount || 0;
      if (tokens > 0 && state.tokenHistory) {
        state.tokenHistory.push(tokens);
        if (state.tokenHistory.length > 20) state.tokenHistory.shift();
        state.avgTokens =
          state.tokenHistory.length > 0
            ? state.tokenHistory.reduce((a, b) => a + b, 0) /
              state.tokenHistory.length
            : 0;
        state.contextTokenEstimate += tokens;
        UI.updateMetricsDisplay(state); // Update UI after token calculation
      }

      finalResult = {
        response: parsedResp,
        cycleTimeMillis: cycleMs,
        error: null,
      };
    } catch (error) {
      const cycleMs = performance.now() - startTime;
      const tokens = currentApiResult?.tokenCount || 0; // Use last known token count if available
      if (tokens > 0 && state.tokenHistory) {
        state.tokenHistory.push(tokens);
        if (state.tokenHistory.length > 20) state.tokenHistory.shift();
        state.avgTokens =
          state.tokenHistory.length > 0
            ? state.tokenHistory.reduce((a, b) => a + b, 0) /
              state.tokenHistory.length
            : 0;
        state.contextTokenEstimate += tokens; // Estimate even on error
        UI.updateMetricsDisplay(state);
      }
      // Don't log AbortError as a cycle logic error here, it's handled by the main loop
      if (error.name !== "AbortError") {
        logger.logEvent(
          "error",
          `Core LLM Iteration failed (Cycle ${currentCycle}): ${error.message}`,
          error
        );
        UI.logToTimeline(
          currentCycle,
          `[LLM ERR] Iteration failed: ${error.message}`,
          "error"
        );
      }
      finalResult = { response: null, cycleTimeMillis: cycleMs, error: error }; // Pass the full error object
    } finally {
      UI.clearStreamingOutput();
      UI.highlightCoreStep(3); // Generate Artifacts step visually follows LLM response processing
    }
    return finalResult;
  };

  const _runAutoCritique = async (
    apiKey,
    llmProposal,
    goalInfo,
    currentCycle
  ) => {
    UI.highlightCoreStep(5); // Critique step
    UI.updateStatus("Running Auto-Critique...", true);
    const state = StateManager?.getState();
    if (!state) throw new Error("State not initialized for critique");

    const template =
      Storage.getArtifactContent(
        "reploid.core.critiquer-prompt",
        currentCycle
      ) || Storage.getArtifactContent("reploid.core.critiquer-prompt", 0);
    if (!template) throw new Error("Critique prompt artifact not found!");

    let prompt = template
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
        llmProposal.full_html_source
          ? Utils.trunc(llmProposal.full_html_source, 4000)
          : "(Not provided)"
      )
      .replace(
        /\[\[PROPOSED_NEW_TOOL_DECL_OBJ\]\]/g,
        JSON.stringify(llmProposal.proposed_new_tool_declaration || null)
      )
      .replace(
        /\[\[GENERATED_TOOL_IMPL_JS\]\]/g,
        llmProposal.generated_tool_implementation_js
          ? Utils.trunc(llmProposal.generated_tool_implementation_js, 1000)
          : "(Not provided)"
      )
      .replace(/\[LATEST_GOAL_TYPE\]/g, goalInfo.type)
      .replace(
        /\[\[CUMULATIVE_GOAL_CONTEXT\]\]/g,
        Utils.trunc(goalInfo.cumulativeGoal, 2000)
      )
      .replace(
        /\[AGENT_CONFIDENCE\]/g,
        llmProposal.agent_confidence_score?.toFixed(3) ?? "N/A"
      );

    const critiqueModel =
      state.cfg?.critiqueModel || config.DEFAULT_MODELS.CRITIQUE;
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
    let critiqueResultText = "";
    let critiqueApiResult = null;
    let finalResult = {
      critique_passed: false,
      critique_report: "Critique execution failed",
    }; // Default failure

    try {
      let accumulatedCritiqueText = "";
      critiqueApiResult = await ApiClient.callApiWithRetry(
        prompt,
        sysInstruction,
        critiqueModel,
        apiKey,
        [],
        false,
        null,
        state.cfg?.maxRetries ?? 1,
        UI.updateStatus,
        UI.logToTimeline,
        UI.updateTimelineItem,
        (progress) => {
          if (progress.type === "text") {
            accumulatedCritiqueText += progress.content;
            UI.updateStreamingOutput(accumulatedCritiqueText);
          }
          critiqueResultText =
            progress.accumulatedResult?.content || accumulatedCritiqueText;
        }
      );
      if (!critiqueResultText) critiqueResultText = critiqueApiResult?.content;

      UI.updateStreamingOutput(
        critiqueResultText || "(No critique text output)",
        true
      );
      UI.displayCycleArtifact(
        "Critique Output Raw",
        critiqueResultText || "(No text content)",
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
          throw new Error(
            "Critique JSON missing required fields (critique_passed: boolean, critique_report: string)."
          );
        }
        finalResult = parsedCritique; // Success case
        UI.logToTimeline(
          currentCycle,
          `[CRITIQUE] Auto-Critique completed. Passed: ${finalResult.critique_passed}`
        );
      } catch (e) {
        logger.logEvent(
          "error",
          `Critique JSON parse failed: ${e.message}. Content: ${Utils.trunc(
            sanitized,
            300
          )}`,
          e
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
        finalResult.critique_report = `Critique response invalid JSON: ${e.message}`; // Keep passed: false
      }
    } catch (e) {
      logger.logEvent("error", `Critique API call failed: ${e.message}`, e);
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
      finalResult.critique_report = `Critique API failed: ${e.message}`; // Keep passed: false
    } finally {
      UI.updateStatus("Idle");
      UI.highlightCoreStep(-1);
      UI.clearStreamingOutput();
    }
    return finalResult;
  };

  const _runSummarization = async (
    apiKey,
    stateSnapshotForSummary,
    currentCycle
  ) => {
    UI.updateStatus("Running Summarization...", true);
    const state = StateManager?.getState();
    if (!state) throw new Error("State not initialized for summarization");

    const template =
      Storage.getArtifactContent(
        "reploid.core.summarizer-prompt",
        currentCycle
      ) || Storage.getArtifactContent("reploid.core.summarizer-prompt", 0);
    if (!template) throw new Error("Summarization prompt artifact not found!");

    const recentLogs = logger.getLogBuffer
      ? logger.getLogBuffer().split("\n").slice(-20).join("\n")
      : "Logs unavailable";
    const allMeta = StateManager.getAllArtifactMetadata();
    const latestArtifactsSummary = Object.values(allMeta)
      .filter((m) => m?.latestCycle >= 0)
      .sort((a, b) => (b.latestCycle ?? -1) - (a.latestCycle ?? -1))
      .slice(0, 15)
      .map((m) => `* ${m.id} (${m.type}, C${m.latestCycle})`)
      .join("\n");

    let prompt = template
      .replace(
        /\[\[AGENT_STATE_SUMMARY\]\]/g,
        JSON.stringify(stateSnapshotForSummary, null, 2)
      )
      .replace(/\[\[RECENT_LOGS\]\]/g, Utils.trunc(recentLogs, 1000))
      .replace(/\[\[LATEST_ARTIFACTS\]\]/g, latestArtifactsSummary || "None");

    const critiqueModel =
      state.cfg?.critiqueModel || config.DEFAULT_MODELS.CRITIQUE;
    const sysInstruction =
      'Summarizer x0. Respond ONLY valid JSON: {"summary": "string"}';
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

    let summaryText = "";
    let summaryApiResult = null;
    let finalSummary = null;

    try {
      let accumulatedSummaryText = "";
      summaryApiResult = await ApiClient.callApiWithRetry(
        prompt,
        sysInstruction,
        critiqueModel,
        apiKey,
        [],
        false,
        null,
        state.cfg?.maxRetries ?? 1,
        UI.updateStatus,
        UI.logToTimeline,
        UI.updateTimelineItem,
        (progress) => {
          if (progress.type === "text") {
            accumulatedSummaryText += progress.content;
            UI.updateStreamingOutput(accumulatedSummaryText);
          }
          summaryText =
            progress.accumulatedResult?.content || accumulatedSummaryText;
        }
      );
      if (!summaryText) summaryText = summaryApiResult?.content;

      UI.updateStreamingOutput(summaryText || "(No summary text output)", true);
      UI.displayCycleArtifact(
        "Summarize Output Raw",
        summaryText || "(No text content)",
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
          finalSummary = parsed.summary; // Success case
          UI.logToTimeline(currentCycle, `[CONTEXT] Summarization successful.`);
        } else {
          throw new Error(
            "Summary JSON format incorrect, missing 'summary' string field."
          );
        }
      } catch (e) {
        logger.logEvent(
          "error",
          `Summarize JSON parse failed: ${e.message}. Content: ${Utils.trunc(
            sanitized,
            300
          )}`,
          e
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
        throw e; // Propagate parse error
      }
    } catch (e) {
      logger.logEvent("error", `Summarization failed: ${e.message}`, e);
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
      throw e; // Propagate API error
    } finally {
      UI.updateStatus("Idle");
      UI.clearStreamingOutput();
    }
    return finalSummary; // Return the summary string or null on failure
  };

  const _applyLLMChanges = (llmResp, currentCycleNum, critiqueSource) => {
    UI.highlightCoreStep(6); // Apply step
    const state = StateManager?.getState();
    if (!state)
      return {
        success: false,
        errors: ["State not initialized"],
        nextCycle: currentCycleNum,
        requiresSandbox: false,
      };

    let changesMade = [];
    let errors = [];
    currentLlmResponse = llmResp;
    const nextCycleNum = currentCycleNum + 1;
    let requiresSandbox = false;
    let success = true;

    (llmResp.modified_artifacts || []).forEach((modArt) => {
      if (!modArt.id || modArt.content === undefined) {
        errors.push(`Invalid mod artifact structure: ID=${modArt.id || "?"}`);
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
      if (currentMeta?.latestCycle >= 0) {
        const currentContent = Storage.getArtifactContent(
          modArt.id,
          currentMeta.latestCycle
        );
        if (currentContent !== modArt.content) {
          try {
            Storage.setArtifactContent(modArt.id, nextCycleNum, modArt.content);
            StateManager.updateArtifactMetadata(
              modArt.id,
              currentMeta.type,
              currentMeta.description,
              nextCycleNum
            ); // Checksum handled by saveArtifactContent later? Or add here?
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
            if (
              modArt.id === "target.diagram" ||
              modArt.id === "reploid.core.diagram"
            )
              UI.renderDiagramDisplay(nextCycleNum);
            if (modArt.id.startsWith("reploid."))
              logger.logEvent("warn", `Core artifact ${modArt.id} modified.`);
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
      } else {
        errors.push(`Modify failed (artifact not found): ${modArt.id}`);
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
        errors.push(`Invalid new artifact structure: ID=${newArt.id || "?"}`);
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
      if (existingMeta?.latestCycle >= 0) {
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
          if (
            newArt.id === "target.diagram" ||
            newArt.id === "reploid.core.diagram"
          )
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
      if (meta?.latestCycle >= 0) {
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
          idToDelete === "target.diagram" ||
          idToDelete === "reploid.core.diagram"
        )
          UI.renderDiagramDisplay(currentCycleNum);
      } else {
        errors.push(`Delete failed (not found): ${idToDelete}`);
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
        if (
          !impl.includes("async function run(params)") &&
          !impl.includes("async (params)") &&
          !impl.includes("run = async (params)")
        ) {
          errors.push(
            `Generated tool implementation for ${decl.name} missing valid async run(params) function.`
          );
          UI.logToTimeline(
            currentCycleNum,
            `[APPLY ERR] Tool impl invalid structure.`,
            "error",
            true
          );
        } else {
          const dynamicTools = state.dynamicTools || [];
          const existingIndex = dynamicTools.findIndex(
            (t) => t.declaration.name === decl.name
          );
          const toolEntry = { declaration: decl, implementation: impl };
          let toolChangeType = "";
          if (existingIndex !== -1) {
            dynamicTools[existingIndex] = toolEntry;
            toolChangeType = `Tool Updated: ${decl.name}`;
          } else {
            dynamicTools.push(toolEntry);
            toolChangeType = `Tool Defined: ${decl.name}`;
          }
          state.dynamicTools = dynamicTools;
          changesMade.push(toolChangeType);
          UI.logToTimeline(
            currentCycleNum,
            `[ARTIFACT] ${toolChangeType}`,
            "info",
            true
          );
        }
      } else {
        errors.push(`Invalid tool definition/impl structure.`);
        UI.logToTimeline(
          currentCycleNum,
          `[APPLY ERR] Tool def/impl invalid structure.`,
          "error",
          true
        );
      }
    }

    if (llmResp.full_html_source) {
      state.lastGeneratedFullSource = llmResp.full_html_source;
      changesMade.push("Generated Full HTML (Sandbox Required)");
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
      requiresSandbox = true; // Set flag
    }

    success = errors.length === 0;
    if (success) {
      if (!requiresSandbox) state.totalCycles = nextCycleNum; // Increment cycle only if apply fully succeeded and no sandbox needed
      const confidence = llmResp.agent_confidence_score ?? 0.0;
      state.confidenceHistory.push(confidence);
      if (state.confidenceHistory.length > 20) state.confidenceHistory.shift();
      UI.updateMetricsDisplay(state);
    }

    const targetArtifactChanged = changesMade.some(
      (c) => c.includes("target.") || c.includes("reploid.core.diagram")
    );
    if (targetArtifactChanged && success) {
      UI.logToTimeline(
        currentCycleNum,
        `[APPLY] Applying target/diagram changes for Cycle ${nextCycleNum}. Rendering Preview/Diagram.`,
        "info",
        true
      );
      UI.renderGeneratedUI(nextCycleNum);
      if (changesMade.some((c) => c.includes("diagram")))
        UI.renderDiagramDisplay(nextCycleNum);
    }

    UI.logToTimeline(
      currentCycleNum,
      `[APPLY] Changes saved for Cycle ${nextCycleNum} from ${critiqueSource}: ${
        changesMade.join(", ") || "None"
      }. Errors: ${errors.length}`,
      errors.length > 0 ? "warn" : "info",
      true
    );

    return {
      success: success,
      changes: changesMade,
      errors: errors,
      nextCycle: success ? nextCycleNum : currentCycleNum,
      requiresSandbox: requiresSandbox,
    };
  };

  const _handleCritiqueDecision = async (
    state,
    llmResponse,
    goalInfo,
    currentCycle
  ) => {
    UI.logCoreLoopStep(currentCycle, 4, "Critique Trigger Check");
    const cycleTimeMillis = llmResponse.cycleTimeMillis || 0;
    const cycleSecs = cycleTimeMillis / 1000;
    const confidence = llmResponse.response?.agent_confidence_score ?? 0.0;
    const pauseThresh = state.cfg?.pauseAfterCycles || 0;
    const confThresh = state.cfg?.autoCritiqueThresh ?? 0.75;
    const humanProb = (state.cfg?.humanReviewProb ?? 0) / 100.0;
    const llmProb = (state.cfg?.llmCritiqueProb ?? 50) / 100.0;
    const maxTime = state.cfg?.maxCycleTime ?? 600;

    let humanNeeded = false;
    let critReason = "";
    let hitlModePref = "prompt";
    if (state.forceHumanReview) {
      humanNeeded = true;
      critReason = "Forced Review";
      state.forceHumanReview = false;
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
      critReason = `Low Confidence (${confidence.toFixed(2)} < ${confThresh})`;
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
      state.lastCritiqueType = `Human (${critReason})`;
      if (state.critiqueFailHistory) state.critiqueFailHistory.push(false);
      UI.updateMetricsDisplay(state);
      UI.logCoreLoopStep(
        currentCycle,
        5,
        `Critique: Human Intervention (${critReason})`
      );
      UI.updateStatus(`Paused: Human Review (${critReason})`);
      const firstModifiedId = llmResponse.response?.modified_artifacts?.[0]?.id;
      const firstNewId = llmResponse.response?.new_artifacts?.[0]?.id;
      const artifactToEdit =
        firstModifiedId ||
        firstNewId ||
        (llmResponse.response?.full_html_source ? "full_html_source" : null);
      UI.showHumanInterventionUI(hitlModePref, critReason, [], artifactToEdit);
      return {
        status: "HITL_REQUIRED",
        critiquePassed: false,
        critiqueReport: `Human Intervention: ${critReason}`,
      };
    } else if (Math.random() < llmProb) {
      UI.logToTimeline(
        currentCycle,
        `[DECIDE] Triggering Auto Critique (${(llmProb * 100).toFixed(0)}%).`,
        "info",
        true
      );
      UI.logCoreLoopStep(currentCycle, 5, "Critique: Auto");
      const critiqueResult = await _runAutoCritique(
        state.apiKey,
        llmResponse.response,
        goalInfo,
        currentCycle
      );
      critiquePassed = critiqueResult.critique_passed;
      critiqueReport = critiqueResult.critique_report;
      applySource = `AutoCrit ${critiquePassed ? "Pass" : "Fail"}`;
      state.lastCritiqueType = `Automated (${
        critiquePassed ? "Pass" : "Fail"
      })`;
      if (state.critiqueFailHistory)
        state.critiqueFailHistory.push(!critiquePassed);
      UI.updateMetricsDisplay(state);
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
        if (state.failCount !== undefined) state.failCount++;
        UI.updateMetricsDisplay(state);
        UI.showHumanInterventionUI(
          "prompt",
          `Auto Critique Failed: ${Utils.trunc(critiqueReport, 150)}...`
        );
        return {
          status: "HITL_REQUIRED",
          critiquePassed: false,
          critiqueReport: critiqueReport,
        };
      }
    } else {
      critiquePassed = true;
      applySource = "Skipped";
      state.lastCritiqueType = "Skipped";
      if (state.critiqueFailHistory) state.critiqueFailHistory.push(false);
      UI.updateMetricsDisplay(state);
      UI.logCoreLoopStep(currentCycle, 5, "Critique: Skipped");
      UI.logToTimeline(
        currentCycle,
        `[DECIDE] Critique Skipped. Applying.`,
        "info",
        true
      );
    }
    return {
      status: "PROCEED",
      critiquePassed: critiquePassed,
      critiqueReport: critiqueReport,
      applySource: applySource,
    };
  };

  const _prepareCycle = () => {
    const state = StateManager?.getState();
    if (!state) throw new Error("State not initialized!");
    if (!StateManager.isInitialized())
      throw new Error("StateManager lost initialization!");
    if (UI.isMetaSandboxPending()) {
      UI.showNotification("Meta Sandbox approval pending.", "warn");
      throw new Error("Sandbox Pending");
    }
    if (!UI.isHumanInterventionHidden()) {
      UI.showNotification("Human Intervention required.", "warn");
      throw new Error("HITL Required");
    }

    UI.clearCurrentCycleDetails();
    currentLlmResponse = null;
    const uiRefs = UI.getRefs();
    state.apiKey = uiRefs.apiKeyInput?.value.trim() || state.apiKey;
    if (!state.apiKey || state.apiKey.length < 10)
      throw new Error("Valid Gemini API Key required.");

    UI.logCoreLoopStep(state.totalCycles, 0, "Define Goal");
    const goalText = uiRefs.goalInput?.value.trim() || "";
    const goalTypeElement = document.querySelector(
      'input[name="goalType"]:checked'
    );
    const goalType = goalTypeElement ? goalTypeElement.value : "System";

    if (!goalText && !state.currentGoal?.seed)
      throw new Error("Initial Goal required.");

    const maxC = state.cfg?.maxCycles || 0;
    if (maxC > 0 && state.totalCycles >= maxC)
      throw new Error(`Max cycles (${maxC}) reached.`);
    if (state.contextTokenEstimate >= CTX_WARN_THRESH)
      UI.showNotification("Context tokens high. Consider summarizing.", "warn");

    const currentCycle = state.totalCycles;
    const newGoalProvided = !!goalText;
    if (newGoalProvided) {
      if (!state.currentGoal?.seed) {
        state.currentGoal = {
          seed: goalText,
          cumulative: goalText,
          latestType: goalType,
          summaryContext: null,
        };
      } else {
        state.currentGoal.cumulative =
          (state.currentGoal.cumulative || state.currentGoal.seed || "") +
          `\n\n[Cycle ${currentCycle} Refinement (${goalType})]: ${goalText}`;
        state.currentGoal.latestType = goalType;
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
      if (uiRefs.goalInput) uiRefs.goalInput.value = ""; // Clear input after processing
    } else if (!state.currentGoal?.seed && !state.currentGoal?.cumulative) {
      throw new Error("No active goal context.");
    }

    const goalInfo = getActiveGoalInfo();
    state.retryCount = 0;
    state.personaMode = (state.cfg?.personaBalance ?? 50) >= 50 ? "LSD" : "XYZ"; // Set persona for the upcoming iteration

    UI.updateStatus("Starting Cycle...", true);
    if (uiRefs.currentCycleNumber)
      uiRefs.currentCycleNumber.textContent = currentCycle;
    UI.updateStateDisplay();
    UI.logToTimeline(
      currentCycle,
      `[CYCLE] === Cycle ${currentCycle} Start === Goal: ${goalInfo.type}, Persona: ${state.personaMode}`
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
    if (state.currentGoal?.summaryContext)
      UI.displayCycleArtifact(
        "Summary Context",
        state.currentGoal.summaryContext,
        "input",
        false,
        "System",
        "meta.summary_context",
        currentCycle
      );
    UI.renderDiagramDisplay(currentCycle);

    return { state, goalInfo, currentCycle };
  };

  const executeCycle = async () => {
    if (_isRunning) {
      UI.showNotification("Cycle already running.", "warn");
      return;
    }
    _isRunning = true;
    const uiRefs = UI.getRefs();
    if (uiRefs.runCycleButton) {
      uiRefs.runCycleButton.textContent = "Abort Cycle";
      uiRefs.runCycleButton.disabled = false;
    }

    let state, goalInfo, currentCycle;
    let cycleOutcome = "Unknown";
    let llmIterationResult = null;

    try {
      const prepResult = _prepareCycle();
      state = prepResult.state;
      goalInfo = prepResult.goalInfo;
      currentCycle = prepResult.currentCycle;

      let successfulIteration = false;
      do {
        UI.logToTimeline(
          currentCycle,
          `[STATE] Agent Iteration Attempt (Retry: ${state.retryCount})`,
          "info",
          true
        );
        llmIterationResult = await _runLlmIteration(
          state,
          goalInfo,
          currentCycle
        );

        if (llmIterationResult.error) {
          if (llmIterationResult.error.name === "AbortError")
            throw llmIterationResult.error; // Propagate abort immediately

          logger.logEvent(
            "error",
            `Iteration attempt ${state.retryCount} failed: ${llmIterationResult.error.message}`
          );
          state.retryCount++;
          if (state.retryCount > (state.cfg?.maxRetries ?? 1)) {
            UI.logToTimeline(
              currentCycle,
              `[RETRY] Max retries exceeded. Forcing HITL.`,
              "error"
            );
            if (state.failCount !== undefined) state.failCount++;
            UI.updateMetricsDisplay(state);
            UI.showHumanInterventionUI(
              "prompt",
              `Cycle failed after ${state.retryCount} attempts: ${
                llmIterationResult.error.message || "Unknown error"
              }`
            );
            cycleOutcome = `Failed (Retries Exceeded)`;
            throw new Error("HITL Required"); // Signal to finally block
          } else {
            UI.logToTimeline(
              currentCycle,
              `[RETRY] Attempting retry ${state.retryCount}/${
                state.cfg?.maxRetries ?? 1
              }...`,
              "warn",
              true
            );
            state.lastFeedback = `Retry ${state.retryCount}: ${
              Utils.trunc(llmIterationResult.error.message, 100) ||
              "No response"
            }`;
            await Utils.delay(1000 * state.retryCount);
          }
        } else {
          successfulIteration = true;
          state.retryCount = 0; // Reset on success
          UI.logToTimeline(
            currentCycle,
            `[STATE] Agent Iteration successful.`,
            "info",
            true
          );
          UI.displayCycleArtifact(
            "Agent Deliberation",
            llmIterationResult.response?.persona_analysis_musing || "(N/A)",
            "info",
            false,
            "LLM",
            "llm.musing",
            currentCycle
          );
          UI.displayCycleArtifact(
            "Proposed Changes",
            llmIterationResult.response?.proposed_changes_description ||
              "(N/A)",
            "info",
            false,
            "LLM",
            "llm.proposal",
            currentCycle
          );
          UI.displayCycleArtifact(
            "Agent Justification",
            llmIterationResult.response?.justification_persona_musing ||
              "(N/A)",
            "info",
            false,
            "LLM",
            "llm.justification",
            currentCycle
          );
          UI.displayCycleArtifact(
            "Agent Confidence",
            llmIterationResult.response?.agent_confidence_score?.toFixed(3) ||
              "(N/A)",
            "info",
            false,
            "LLM",
            "llm.confidence",
            currentCycle
          );
        }
      } while (!successfulIteration);

      const critiqueDecision = await _handleCritiqueDecision(
        state,
        llmIterationResult,
        goalInfo,
        currentCycle
      );

      if (critiqueDecision.status === "HITL_REQUIRED") {
        cycleOutcome = `Paused (HITL: ${
          critiqueDecision.critiqueReport.split(":")[0]
        })`;
        throw new Error("HITL Required"); // Signal to finally block
      }

      if (critiqueDecision.critiquePassed) {
        UI.updateStatus("Applying Changes...", true);
        UI.logCoreLoopStep(currentCycle, 6, "Refine & Apply");
        const applyResult = _applyLLMChanges(
          llmIterationResult.response,
          currentCycle,
          critiqueDecision.applySource
        );

        if (applyResult.requiresSandbox) {
          state.lastCritiqueType = `${critiqueDecision.applySource} (Sandbox Pending)`;
          UI.showMetaSandbox(llmIterationResult.response.full_html_source);
          cycleOutcome = `Paused (Sandbox Pending)`;
          throw new Error("Sandbox Pending"); // Signal to finally block
        }

        if (applyResult.success) {
          state.agentIterations++;
          state.lastFeedback = `${critiqueDecision.applySource}, applied successfully for Cycle ${applyResult.nextCycle}.`;
          cycleOutcome = `OK (${state.lastCritiqueType})`;
        } else {
          state.lastFeedback = `${
            critiqueDecision.applySource
          }, apply failed: ${applyResult.errors.join(", ")}`;
          if (state.failCount !== undefined) state.failCount++;
          UI.updateMetricsDisplay(state);
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
          cycleOutcome = `Failed (Apply after ${state.lastCritiqueType})`;
          throw new Error("HITL Required"); // Signal to finally block
        }
      } else {
        // This case should technically be handled by the HITL trigger inside _handleCritiqueDecision
        logger.logEvent(
          "error",
          "Reached unexpected state where critique failed but HITL was not triggered."
        );
        cycleOutcome = `Failed (Critique Failed)`;
        throw new Error("Critique Failed");
      }

      UI.logCoreLoopStep(currentCycle, 7, "Repeat/Pause"); // Log step 8 for the completed cycle
    } catch (error) {
      const knownStops = [
        "AbortError",
        "Sandbox Pending",
        "HITL Required",
        "Max cycles reached.",
        "Critique Failed",
      ];
      const isKnownStop =
        knownStops.some((stopMsg) => error.message.includes(stopMsg)) ||
        error.name === "AbortError";

      if (
        !isKnownStop &&
        !error.message.startsWith("Valid Gemini API Key required") &&
        !error.message.startsWith("Initial Goal required")
      ) {
        logger.logEvent(
          "error",
          `Unhandled cycle error (Cycle ${currentCycle ?? "N/A"}): ${
            error.message
          }`,
          error
        );
        UI.showNotification(`Cycle Error: ${error.message}`, "error");
        UI.logToTimeline(
          currentCycle ?? 0,
          `[CYCLE FATAL] ${error.message}`,
          "error"
        );
        cycleOutcome = `Failed (Fatal Error)`;
        UI.updateStatus("Cycle Failed", false, true);
      } else if (error.name === "AbortError") {
        UI.logToTimeline(
          currentCycle ?? 0,
          `[CYCLE] Cycle aborted by user.`,
          "warn"
        );
        cycleOutcome = "Aborted";
        UI.updateStatus("Aborted");
      } else if (error.message !== "Critique Failed") {
        // For known stops like HITL/Sandbox, status is already set by the triggering function
        logger.logEvent("info", `Cycle stopped: ${error.message}`);
        if (!cycleOutcome || cycleOutcome === "Unknown")
          cycleOutcome = `Paused (${error.message})`;
      } else {
        cycleOutcome = `Failed (Critique Failed)`;
        UI.updateStatus("Critique Failed", false, true);
      }
    } finally {
      _isRunning = false;
      if (uiRefs.runCycleButton) {
        uiRefs.runCycleButton.textContent = "Run Cycle";
      }
      // Final state update and save after cycle finishes or errors out (unless HITL/Sandbox pending)
      if (
        state &&
        !UI.isMetaSandboxPending() &&
        UI.isHumanInterventionHidden()
      ) {
        UI.summarizeCompletedCycleLog(cycleOutcome);
        UI.updateStateDisplay();
        UI.clearCurrentCycleDetails();
        UI.logToTimeline(
          state.totalCycles,
          `[STATE] Cycle ended (${
            state.lastCritiqueType || cycleOutcome
          }). Ready.`
        );
        StateManager.save();
        UI.updateStatus("Idle");
      } else if (state) {
        // Still save state even if paused for HITL/Sandbox
        StateManager.save();
      }
      UI.highlightCoreStep(-1);
    }
  };

  const proceedAfterHumanIntervention = (
    feedbackType,
    feedbackData = "",
    skipCycleIncrement = false
  ) => {
    const state = StateManager?.getState();
    if (!state) {
      logger.logEvent("error", "Cannot proceed HITL, state missing.");
      return;
    }
    const currentCycle = state.totalCycles;
    let nextCycle = currentCycle;
    let feedbackMsg = String(feedbackData);
    let applySuccess = true;
    let isCodeEditSuccess = false;
    let requiresSandbox = false;

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
          : `Validation Failed: ${error || "Unknown"}`
      }`;
      isCodeEditSuccess = success && contentChanged;

      if (isCodeEditSuccess && artifactId !== "full_html_source") {
        nextCycle = currentCycle + 1;
        try {
          Storage.setArtifactContent(artifactId, nextCycle, validatedContent);
          const currentMeta = StateManager.getArtifactMetadata(artifactId);
          StateManager.updateArtifactMetadata(
            artifactId,
            currentMeta?.type,
            currentMeta?.description,
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
          if (artifactId.startsWith("target.")) UI.renderGeneratedUI(nextCycle);
          if (
            artifactId === "target.diagram" ||
            artifactId === "reploid.core.diagram"
          )
            UI.renderDiagramDisplay(nextCycle);
        } catch (e) {
          logger.logEvent(
            "error",
            `Failed saving human edit for ${artifactId}: ${e.message}`,
            e
          );
          UI.showNotification(`Failed saving edit: ${e.message}`, "error");
          applySuccess = false;
          nextCycle = currentCycle;
        }
      } else if (artifactId === "full_html_source" && isCodeEditSuccess) {
        logger.logEvent(
          "warn",
          "Full source edited via HITL. Staging for sandbox."
        );
        state.lastGeneratedFullSource = validatedContent;
        applySuccess = true;
        requiresSandbox = true;
        skipCycleIncrement = true; // Prevent cycle increment here
        UI.showMetaSandbox(validatedContent);
      } else if (!success) {
        applySuccess = false;
      }
    } else if (feedbackType === "Human Options") {
      feedbackMsg = `Selected: ${feedbackData || "None"}`;
    } else if (feedbackType === "Sandbox Discarded") {
      applySuccess = true;
    } else if (feedbackType === "Human Prompt") {
      applySuccess = true;
    }

    state.lastFeedback = `${feedbackType}: ${Utils.trunc(feedbackMsg, 150)}`;
    if (
      !isCodeEditSuccess &&
      feedbackType !== "Human Prompt" &&
      feedbackType !== "Human Options" &&
      feedbackType !== "Sandbox Discarded"
    ) {
      if (state.critiqueFailHistory)
        state.critiqueFailHistory.push(!applySuccess);
      if (state.critiqueFailHistory?.length > 20)
        state.critiqueFailHistory.shift();
    }
    if (feedbackType.startsWith("Human")) {
      if (state.humanInterventions !== undefined) state.humanInterventions++;
    }

    const summaryOutcome = !applySuccess
      ? `Failed (${feedbackType})`
      : `OK (${feedbackType})`;
    UI.summarizeCompletedCycleLog(summaryOutcome);
    UI.logToTimeline(
      currentCycle,
      `[STATE] ${feedbackType} processed. Feedback: "${Utils.trunc(
        feedbackMsg,
        70
      )}..."`,
      "info"
    );
    UI.hideHumanInterventionUI();

    if (applySuccess && !skipCycleIncrement) {
      state.totalCycles =
        nextCycle === currentCycle ? currentCycle + 1 : nextCycle;
    } else if (!applySuccess) {
      state.totalCycles = currentCycle;
    } // If skipCycleIncrement, totalCycles remains currentCycle

    if (!skipCycleIncrement) {
      state.personaMode =
        (state.cfg?.personaBalance ?? 50) < 50 ? "XYZ" : "LSD";
      state.retryCount = 0;
      const uiRefs = UI.getRefs();
      if (uiRefs.goalInput) uiRefs.goalInput.value = "";
      UI.updateStatus("Idle");
      UI.clearCurrentCycleDetails();
      UI.logToTimeline(state.totalCycles, `[STATE] Ready.`);
    } else {
      UI.updateStatus("Meta Sandbox Pending...");
    }
    UI.updateStateDisplay();
    UI.highlightCoreStep(-1);
    StateManager.save();
  };

  const saveHtmlToHistory = (htmlContent) => {
    const state = StateManager?.getState();
    if (!state) return;
    const limit = state.cfg?.htmlHistoryLimit ?? 5;
    if (!state.htmlHistory) state.htmlHistory = [];
    state.htmlHistory.push(htmlContent);
    while (state.htmlHistory.length > limit) {
      state.htmlHistory.shift();
    }
    UI.updateHtmlHistoryControls(state);
    logger.logEvent(
      "info",
      `Saved HTML state. History size: ${state.htmlHistory.length}`
    );
  };

  const handleSummarizeContext = async () => {
    const state = StateManager?.getState();
    if (!state || !state.apiKey) {
      UI.showNotification("API Key required for summarization.", "warn");
      return;
    }
    if (_isRunning) {
      UI.showNotification(
        "Cannot summarize context while cycle is running.",
        "warn"
      );
      return;
    }
    UI.updateStatus("Summarizing context...", true);
    const currentCycle = state.totalCycles;
    const nextCycle = currentCycle + 1;
    UI.logToTimeline(
      currentCycle,
      "[CONTEXT] Running summarization...",
      "info",
      true
    );
    UI.clearCurrentCycleDetails();
    try {
      const stateSummary = {
        totalCycles: state.totalCycles,
        agentIterations: state.agentIterations,
        humanInterventions: state.humanInterventions,
        failCount: state.failCount,
        currentGoal: {
          seed: Utils.trunc(state.currentGoal?.seed, 200),
          cumulative: Utils.trunc(state.currentGoal?.cumulative, 500),
          latestType: state.currentGoal?.latestType,
        },
        lastCritiqueType: state.lastCritiqueType,
        lastFeedback: Utils.trunc(state.lastFeedback, 200),
        avgConfidence: state.avgConfidence?.toFixed(2),
        critiqueFailRate: state.critiqueFailRate?.toFixed(1),
        dynamicTools: (state.dynamicTools || []).map((t) => t.declaration.name),
        artifactOverview: Object.values(StateManager.getAllArtifactMetadata())
          .filter((m) => m?.latestCycle >= 0)
          .sort((a, b) => (b.latestCycle ?? -1) - (a.latestCycle ?? -1))
          .slice(0, 30)
          .map((a) => `${a.id}(${a.type},C${a.latestCycle})`)
          .join(", "),
      };
      const summaryText = await _runSummarization(
        state.apiKey,
        stateSummary,
        currentCycle
      );
      if (summaryText === null)
        throw new Error("Summarization LLM call or parsing failed.");

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

      state.currentGoal = {
        seed: state.currentGoal?.seed,
        cumulative: `Context summarized up to Cycle ${currentCycle}. Original Seed: ${
          state.currentGoal?.seed || "None"
        }. New Summary:\n${summaryText}`,
        latestType: "Idle",
        summaryContext: summaryText,
      };
      state.contextTokenEstimate =
        Math.round((summaryText.length / 4) * 1.1) + 500;
      state.lastFeedback = `Context summarized at Cycle ${currentCycle}.`;
      state.lastCritiqueType = "Context Summary";
      state.totalCycles = nextCycle;

      UI.logToTimeline(
        currentCycle,
        `[CONTEXT] Summarized. Saved as meta.summary_context_${nextCycle}. Est. tokens: ${state.contextTokenEstimate.toLocaleString()}.`,
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
      UI.showNotification("Context summarized and applied.", "info");
    } catch (error) {
      logger.logEvent("error", `Summarization failed: ${error.message}`, error);
      UI.showNotification(`Summarization failed: ${error.message}`, "error");
      UI.logToTimeline(
        currentCycle,
        `[CONTEXT ERR] Summarization failed: ${error.message}`,
        "error"
      );
    } finally {
      UI.updateStateDisplay();
      UI.updateStatus("Idle");
      StateManager.save();
    }
  };

  const abortCurrentCycle = () => {
    logger.logEvent(
      "info",
      "Attempting to abort current cycle via API client."
    );
    ApiClient.abortCurrentCall();
    _isRunning = false;
    const uiRefs = UI.getRefs();
    if (uiRefs.runCycleButton) {
      uiRefs.runCycleButton.textContent = "Run Cycle";
      uiRefs.runCycleButton.disabled = false;
    }
    // Status update handled by the executeCycle finally block or error handler
  };

  const runTool = async (toolName, args) => {
    const state = StateManager?.getState();
    if (!state) throw new Error("Cannot run tool, state not available.");
    const dynamicTools = state.dynamicTools || [];
    return await ToolRunner.runTool(
      toolName,
      args,
      loadedStaticTools,
      dynamicTools
    );
  };

  return {
    init,
    executeCycle,
    isRunning,
    getActiveGoalInfo,
    proceedAfterHumanIntervention,
    handleSummarizeContext,
    abortCurrentCycle,
    saveHtmlToHistory,
    runTool,
  };
};
