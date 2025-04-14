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
    console.error(
      "CycleLogicModule requires all core modules (config, logger, Utils, Storage, StateManager, UI, ApiClient, ToolRunner)."
    );
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
          `CycleLogic loaded ${loadedStaticTools.length} static tools.`
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
    if (!state)
      return {
        seedGoal: "N/A",
        cumulativeGoal: "N/A",
        latestGoal: "Idle",
        type: "Idle",
      };
    const latestGoal = state.currentGoal?.cumulative || state.currentGoal?.seed;
    return {
      seedGoal: state.currentGoal?.seed || "None",
      cumulativeGoal: state.currentGoal?.cumulative || "None",
      latestGoal: latestGoal || "Idle",
      type: state.currentGoal?.latestType || "Idle",
    };
  };

  const getArtifactListSummary = () => {
    if (!StateManager) return "Error: StateManager not available.";
    const allMeta = StateManager.getAllArtifactMetadata();
    return (
      Object.values(allMeta)
        .filter((artMeta) => artMeta.latestCycle >= 0) // Only list artifacts that have been created
        .map(
          (artMeta) =>
            `* ${artMeta.id} (${artMeta.type}) - Cycle ${artMeta.latestCycle}`
        )
        .join("\n") || "None"
    );
  };

  const getToolListSummary = () => {
    if (!StateManager) return "Error: StateManager not available.";
    const state = StateManager.getState();
    const dynamicTools = state?.dynamicTools || [];
    const staticToolSummary = loadedStaticTools
      .map((t) => `* [S] ${t.name}: ${t.description}`)
      .join("\n");
    const dynamicToolSummary = dynamicTools
      .map((t) => `* [D] ${t.declaration.name}: ${t.declaration.description}`)
      .join("\n");
    return (
      [staticToolSummary, dynamicToolSummary].filter((s) => s).join("\n") ||
      "None"
    );
  };

  const runCoreIteration = async (apiKey, currentGoalInfo, currentCycle) => {
    UI.highlightCoreStep(1);
    const state = StateManager?.getState();
    if (!state) throw new Error("Global state is not initialized");

    const personaBalance = state.cfg?.personaBalance ?? 50;
    const primaryPersona = personaBalance >= 50 ? "LSD" : "XYZ";
    state.personaMode = primaryPersona;

    const corePromptTemplate =
      Storage.getArtifactContent("reploid.core.sys-prompt", currentCycle) ||
      Storage.getArtifactContent("reploid.core.sys-prompt", 0);
    if (!corePromptTemplate)
      throw new Error(
        "Core prompt artifact 'reploid.core.sys-prompt' not found!"
      );

    let prompt = corePromptTemplate
      .replace(/\[LSD_PERCENT\]/g, personaBalance)
      .replace(/\[PERSONA_MODE\]/g, primaryPersona)
      .replace(/\[CYCLE_COUNT\]/g, state.totalCycles)
      .replace(/\[AGENT_ITR_COUNT\]/g, state.agentIterations)
      .replace(/\[HUMAN_INT_COUNT\]/g, state.humanInterventions)
      .replace(/\[FAIL_COUNT\]/g, state.failCount)
      .replace(
        /\[LAST_FEEDBACK\]/g,
        Utils.trunc(state.lastFeedback, 500) || "None"
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
      .replace(/\[\[DYNAMIC_TOOLS_LIST\]\]/g, getToolListSummary())
      .replace(
        /\[\[RECENT_LOGS\]\]/g,
        Utils.trunc(
          logger.getLogBuffer().split("\n").slice(-15).join("\n"),
          1000
        )
      )
      .replace(/\[\[ARTIFACT_LIST\]\]/g, getArtifactListSummary())
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
        Utils.trunc(state.currentGoal?.summaryContext, 2000) || "None"
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
    const dynamicTools = state.dynamicTools || [];

    try {
      const staticFuncDecls = (
        await Promise.all(
          loadedStaticTools.map(async (toolDef) => {
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
          })
        )
      ).filter(Boolean);

      const dynamicFuncDecls = (
        await Promise.all(
          dynamicTools.map(async (toolDef) => {
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
          })
        )
      ).filter(Boolean);

      allFuncDecls = [...staticFuncDecls, ...dynamicFuncDecls];
    } catch (toolConvError) {
      logger.logEvent(
        "error",
        `Error during tool conversion: ${toolConvError.message}`,
        toolConvError
      );
    }

    const coreModel = state.cfg?.coreModel || config.DEFAULT_MODELS.BASE;
    const startTime = performance.now();
    let finalResult = null;
    let apiHistory = [];
    let currentApiResult = null; // Define outside loop

    UI.displayCycleArtifact(
      "LLM Input",
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
    UI.clearStreamingOutput();

    try {
      UI.highlightCoreStep(2);
      let accumulatedText = "";
      let accumulatedFunctionCallParts = []; // Store parts streamed from API

      currentApiResult = await ApiClient.callApiWithRetry(
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
            accumulatedFunctionCallParts.push(progress.content);
            UI.updateStreamingOutput(
              "Function Call received: " +
                progress.content.name +
                "\nArgs:\n" +
                JSON.stringify(progress.content.args, null, 2)
            );
          }
          // currentApiResult is set by the return value now, not here
        }
      );

      UI.updateStreamingOutput(
        currentApiResult?.content || "(No final text output)",
        true
      );

      if (
        currentApiResult?.type === "functionCall" &&
        currentApiResult.content
      ) {
        UI.updateStatus("Processing Tool Calls...", true);
        apiHistory.push({ role: "user", parts: [{ text: prompt }] });
        if (currentApiResult.rawResp?.candidates?.[0]?.content) {
          apiHistory.push(currentApiResult.rawResp.candidates[0].content);
        }

        // Process the single function call returned
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
            dynamicTools
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

        currentApiResult = await ApiClient.callApiWithRetry(
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
            // Handle potential nested function calls if API supports it, otherwise ignore/log
          }
        );
        UI.updateStreamingOutput(
          currentApiResult?.content || accumulatedText,
          true
        ); // Show final text
      }

      UI.updateStatus("Processing Final Response...");
      const finalContent =
        currentApiResult?.type === "text"
          ? currentApiResult.content
          : accumulatedText; // Prefer result content if text type
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
        throw new Error(`LLM response invalid JSON: ${e.message}`);
      }

      const tokens = currentApiResult?.tokenCount || 0;
      if (tokens > 0) {
        state.tokenHistory.push(tokens);
        if (state.tokenHistory.length > 20) state.tokenHistory.shift();
        state.avgTokens =
          state.tokenHistory.length > 0
            ? state.tokenHistory.reduce((a, b) => a + b, 0) /
              state.tokenHistory.length
            : 0;
        state.contextTokenEstimate += tokens;
        UI.checkContextTokenWarning(state); // Assumes UI exposes this check or updates metric display
      }

      finalResult = {
        response: parsedResp,
        cycleTimeMillis: cycleMs,
        error: null,
      };
    } catch (error) {
      logger.logEvent(
        "error",
        `Core Iteration failed: ${error.message}`,
        error
      );
      UI.logToTimeline(currentCycle, `[CYCLE ERR] ${error.message}`, "error");
      const cycleMs = performance.now() - startTime;
      const tokens = currentApiResult?.tokenCount || 0; // Use last known token count
      if (tokens > 0) {
        state.tokenHistory.push(tokens);
        if (state.tokenHistory.length > 20) state.tokenHistory.shift();
        state.avgTokens =
          state.tokenHistory.length > 0
            ? state.tokenHistory.reduce((a, b) => a + b, 0) /
              state.tokenHistory.length
            : 0;
        state.contextTokenEstimate += tokens;
        UI.checkContextTokenWarning(state);
      }
      finalResult = {
        response: null,
        cycleTimeMillis: cycleMs,
        error: error.message,
      };
    } finally {
      if (error.name !== "AbortError") UI.updateStatus("Idle"); // Don't reset status on abort immediately
      UI.highlightCoreStep(-1);
      UI.clearStreamingOutput();
    }
    return finalResult;
  };

  const runAutoCritique = async (
    apiKey,
    llmProposal,
    goalInfo,
    currentCycle
  ) => {
    UI.highlightCoreStep(5);
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
    try {
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
            critiqueResultText += progress.content;
            UI.updateStreamingOutput(critiqueResultText);
          }
        }
      );
      UI.updateStreamingOutput(
        critiqueResultText ||
          critiqueApiResult?.content ||
          "(No critique text output)",
        true
      );
      UI.displayCycleArtifact(
        "Critique Output Raw",
        critiqueResultText || critiqueApiResult?.content || "(No text content)",
        "info",
        false,
        "LLM",
        "critique.raw",
        currentCycle
      );

      const sanitized = ApiClient.sanitizeLlmJsonResp(
        critiqueResultText || critiqueApiResult?.content
      );
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
        return {
          critique_passed: false,
          critique_report: `Critique response invalid JSON: ${e.message}`,
        };
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
      return {
        critique_passed: false,
        critique_report: `Critique API failed: ${e.message}`,
      };
    } finally {
      UI.updateStatus("Idle");
      UI.highlightCoreStep(-1);
      UI.clearStreamingOutput();
    }
  };

  const runSummarization = async (
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

    const recentLogs = logger.getLogBuffer().split("\n").slice(-20).join("\n");
    const allMeta = StateManager.getAllArtifactMetadata();
    const latestArtifactsSummary = Object.values(allMeta)
      .filter((m) => m.latestCycle >= 0)
      .sort((a, b) => b.latestCycle - a.latestCycle)
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
    try {
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
            summaryText += progress.content;
            UI.updateStreamingOutput(summaryText);
          }
        }
      );
      UI.updateStreamingOutput(
        summaryText || summaryApiResult?.content || "(No summary text output)",
        true
      );
      UI.displayCycleArtifact(
        "Summarize Output Raw",
        summaryText || summaryApiResult?.content || "(No text content)",
        "info",
        false,
        "LLM",
        "summary.raw",
        currentCycle
      );

      const sanitized = ApiClient.sanitizeLlmJsonResp(
        summaryText || summaryApiResult?.content
      );
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
          UI.logToTimeline(currentCycle, `[CONTEXT] Summarization successful.`);
          return parsed.summary;
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
        throw e;
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
      throw e;
    } finally {
      UI.updateStatus("Idle");
      UI.clearStreamingOutput();
    }
  };

  const applyLLMChanges = (llmResp, currentCycleNum, critiqueSource) => {
    UI.highlightCoreStep(6);
    const state = StateManager?.getState();
    if (!state)
      return {
        success: false,
        errors: ["State not initialized"],
        nextCycle: currentCycleNum,
      };

    let changesMade = [];
    let errors = [];
    currentLlmResponse = llmResp; // Store for potential HITL reference
    const nextCycleNum = currentCycleNum + 1;

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
      if (currentMeta.latestCycle >= 0) {
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
          idToDelete === "target.diagram" ||
          idToDelete === "reploid.core.diagram"
        )
          UI.renderDiagramDisplay(currentCycleNum); // Re-render with potentially genesis diagram
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
        // Validate implementation basic structure
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
          state.dynamicTools = dynamicTools; // Update state
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
      UI.showMetaSandbox(llmResp.full_html_source);
      return {
        success: errors.length === 0,
        changes: changesMade,
        errors: errors,
        nextCycle: currentCycleNum,
        requiresSandbox: true,
      };
    }

    const targetArtifactChanged = changesMade.some(
      (c) => c.includes("target.") || c.includes("reploid.core.diagram")
    );
    if (targetArtifactChanged && errors.length === 0) {
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

    if (errors.length === 0) {
      state.totalCycles = nextCycleNum;
    }

    const confidence = llmResp.agent_confidence_score ?? 0.0;
    state.confidenceHistory.push(confidence);
    if (state.confidenceHistory.length > 20) state.confidenceHistory.shift();
    UI.updateMetricsDisplay(state); // Update UI metrics

    return {
      success: errors.length === 0,
      changes: changesMade,
      errors: errors,
      nextCycle: errors.length === 0 ? nextCycleNum : currentCycleNum,
      requiresSandbox: false,
    };
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

    if (feedbackType === "Human Code Edit") {
      const {
        artifactId,
        cycle,
        success,
        validatedContent,
        error,
        contentChanged,
      } = feedbackData; // feedbackData is the toolResult object
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
          nextCycle = currentCycle; // Rollback cycle increment on save failure
        }
      } else if (artifactId === "full_html_source" && isCodeEditSuccess) {
        logger.logEvent(
          "warn",
          "Full source edited via HITL. Staging for sandbox."
        );
        state.lastGeneratedFullSource = validatedContent;
        applySuccess = true;
        // Don't increment cycle yet, sandbox approval will handle state transition
        // Show sandbox immediately after successful edit?
        UI.showMetaSandbox(validatedContent);
        skipCycleIncrement = true; // Prevent cycle increment here
      } else if (!success) {
        applySuccess = false;
      }
    } else if (feedbackType === "Human Options") {
      feedbackMsg = `Selected: ${feedbackData || "None"}`;
    } else if (feedbackType === "Sandbox Discarded") {
      applySuccess = true; // Discarding isn't a failure state for the cycle itself
    } else if (feedbackType === "Human Prompt") {
      applySuccess = true; // Just feedback, cycle continues
    }

    state.lastFeedback = `${feedbackType}: ${Utils.trunc(feedbackMsg, 150)}`;

    // Only push to critique fail history if it wasn't a successful code edit or simple prompt/option
    if (
      !isCodeEditSuccess &&
      feedbackType !== "Human Prompt" &&
      feedbackType !== "Human Options" &&
      feedbackType !== "Sandbox Discarded"
    ) {
      state.critiqueFailHistory.push(!applySuccess);
      if (state.critiqueFailHistory.length > 20)
        state.critiqueFailHistory.shift();
    }

    if (feedbackType.startsWith("Human")) {
      state.humanInterventions++;
    }

    if (applySuccess && !skipCycleIncrement) {
      // Increment cycle only if apply succeeded AND we are not waiting for sandbox
      state.totalCycles =
        nextCycle === currentCycle ? currentCycle + 1 : nextCycle;
    } else if (!applySuccess) {
      // Don't increment cycle on failure
      state.totalCycles = currentCycle;
    }
    // If skipCycleIncrement is true (sandbox pending), totalCycles remains currentCycle

    const summaryOutcome = !applySuccess
      ? `Failed (${feedbackType})`
      : `OK (${feedbackType})`;
    UI.summarizeCompletedCycleLog(summaryOutcome);

    UI.logToTimeline(
      currentCycle,
      `[STATE] ${feedbackType} processed. Feedback: "${Utils.trunc(
        feedbackMsg,
        70
      )}..." Next Cycle Target: ${state.totalCycles}`,
      "info"
    );
    UI.hideHumanInterventionUI();

    if (!skipCycleIncrement) {
      // Don't reset persona/retry if waiting for sandbox
      state.personaMode = state.cfg?.personaBalance < 50 ? "XYZ" : "LSD";
      state.retryCount = 0;
      const uiRefs = UI.getRefs(); // Get refs if needed for goal input reset
      if (uiRefs.goalInput) uiRefs.goalInput.value = "";
      if (uiRefs.runCycleButton)
        uiRefs.runCycleButton.textContent = "Run Cycle";
      UI.updateStatus("Idle");
    } else {
      UI.updateStatus("Meta Sandbox Pending...");
    }

    UI.updateStateDisplay(); // Update UI based on potentially modified state
    UI.clearCurrentCycleDetails(); // Clear details for the *next* cycle run
    if (!skipCycleIncrement)
      UI.logToTimeline(state.totalCycles, `[STATE] Ready.`);
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
    UI.updateHtmlHistoryControls(state); // Update UI indicator
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
      "[CTX] Running summarization...",
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
          .filter((m) => m.latestCycle >= 0)
          .map((a) => `${a.id}(${a.type},C${a.latestCycle})`)
          .slice(0, 30)
          .join(", "), // Limit overview length
      };
      const summaryText = await runSummarization(
        state.apiKey,
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

      state.currentGoal = {
        // Reset goal context, keeping seed if exists
        seed: state.currentGoal?.seed,
        cumulative: `Context summarized up to Cycle ${currentCycle}. Original Seed: ${
          state.currentGoal?.seed || "None"
        }. New Summary:\n${summaryText}`,
        latestType: "Idle", // Reset type after summary
        summaryContext: summaryText,
      };
      state.contextTokenEstimate =
        Math.round((summaryText.length / 4) * 1.1) + 500; // Rough estimate
      state.lastFeedback = `Context summarized at Cycle ${currentCycle}.`;
      state.lastCritiqueType = "Context Summary";
      state.totalCycles = nextCycle; // Increment cycle after summary

      UI.logToTimeline(
        currentCycle,
        `[CTX] Summarized. Saved as meta.summary_context_${nextCycle}. Est. tokens: ${state.contextTokenEstimate.toLocaleString()}.`,
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
        `[CTX ERR] Summarization failed: ${error.message}`,
        "error"
      );
    } finally {
      UI.updateStateDisplay();
      UI.updateStatus("Idle");
      StateManager.save();
    }
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
      uiRefs.runCycleButton.disabled = false; // Ensure abort is enabled
    }

    const state = StateManager?.getState();
    try {
      if (!state) {
        throw new Error("State not initialized!");
      }
      if (!StateManager.isInitialized) {
        throw new Error("StateManager lost initialization!");
      } // Sanity check
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
      state.apiKey = uiRefs.apiKeyInput?.value.trim() || state.apiKey; // Update API key from UI if present
      if (!state.apiKey || state.apiKey.length < 10) {
        throw new Error("Valid Gemini API Key required.");
      }

      UI.logCoreLoopStep(state.totalCycles, 0, "Define Goal");
      const goalText = uiRefs.goalInput?.value.trim() || "";
      const goalTypeElement = document.querySelector(
        'input[name="goalType"]:checked'
      );
      const goalType = goalTypeElement ? goalTypeElement.value : "System";

      if (!goalText && !state.currentGoal?.seed) {
        throw new Error("Initial Goal required.");
      }

      const maxC = state.cfg?.maxCycles || 0;
      if (maxC > 0 && state.totalCycles >= maxC) {
        throw new Error(`Max cycles (${maxC}) reached.`);
      }
      if (state.contextTokenEstimate >= CTX_WARN_THRESH) {
        UI.showNotification(
          "Context tokens high. Consider summarizing.",
          "warn"
        );
      }

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
          // Keep existing summaryContext if present
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
      } else if (!state.currentGoal?.seed && !state.currentGoal?.cumulative) {
        throw new Error("No active goal context."); // Should not happen if initial check passed
      }

      const goalInfo = getActiveGoalInfo();
      state.retryCount = 0; // Reset retry count for the new cycle
      UI.updateStatus("Starting Cycle...", true);
      if (uiRefs.currentCycleNumber)
        uiRefs.currentCycleNumber.textContent = currentCycle;
      UI.updateStateDisplay();
      UI.logToTimeline(
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

      let iterationResult = null;
      let successfulIteration = false;
      do {
        UI.logToTimeline(
          currentCycle,
          `[STATE] Agent Iteration Attempt (Retry: ${state.retryCount})`,
          "info",
          true
        );
        iterationResult = await runCoreIteration(
          state.apiKey,
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
          state.retryCount++;
          if (state.retryCount > (state.cfg?.maxRetries ?? 1)) {
            UI.logToTimeline(
              currentCycle,
              `[RETRY] Max retries exceeded. Forcing HITL.`,
              "error"
            );
            state.failCount++;
            UI.updateMetricsDisplay(state);
            UI.showHumanInterventionUI(
              "prompt",
              `Cycle failed after ${state.retryCount} attempts: ${
                iterationResult.error || "Unknown error"
              }`
            );
            StateManager.save();
            _isRunning = false; // Reset running state before returning due to HITL
            if (uiRefs.runCycleButton)
              uiRefs.runCycleButton.textContent = "Run Cycle"; // Reset button text
            return; // Stop cycle execution
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
              Utils.trunc(iterationResult.error, 100) || "No response"
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
        state.lastCritiqueType = `Human (${critReason})`;
        state.critiqueFailHistory.push(false); // HITL itself isn't a critique failure
        UI.updateMetricsDisplay(state);
        UI.logCoreLoopStep(
          currentCycle,
          5,
          `Critique: Human Intervention (${critReason})`
        );
        UI.updateStatus(`Paused: Human Review (${critReason})`);
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
        StateManager.save();
        _isRunning = false; // Reset running state before returning due to HITL
        if (uiRefs.runCycleButton)
          uiRefs.runCycleButton.textContent = "Run Cycle"; // Reset button text
        return;
      } else if (Math.random() < llmProb) {
        UI.logToTimeline(
          currentCycle,
          `[DECIDE] Triggering Auto Critique (${(llmProb * 100).toFixed(0)}%).`,
          "info",
          true
        );
        UI.logCoreLoopStep(currentCycle, 5, "Critique: Auto");
        const critiqueResult = await runAutoCritique(
          state.apiKey,
          currentLlmResponse,
          goalInfo,
          currentCycle
        );
        critiquePassed = critiqueResult.critique_passed;
        critiqueReport = critiqueResult.critique_report;
        applySource = `AutoCrit ${critiquePassed ? "Pass" : "Fail"}`;
        state.lastCritiqueType = `Automated (${
          critiquePassed ? "Pass" : "Fail"
        })`;
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
          state.failCount++;
          UI.updateMetricsDisplay(state);
          UI.showHumanInterventionUI(
            "prompt",
            `Auto Critique Failed: ${Utils.trunc(critiqueReport, 150)}...`
          );
          StateManager.save();
          _isRunning = false; // Reset running state before returning due to HITL
          if (uiRefs.runCycleButton)
            uiRefs.runCycleButton.textContent = "Run Cycle"; // Reset button text
          return;
        }
      } else {
        critiquePassed = true;
        applySource = "Skipped";
        state.lastCritiqueType = "Skipped";
        state.critiqueFailHistory.push(false); // Skipped critique isn't a failure
        UI.updateMetricsDisplay(state);
        UI.logCoreLoopStep(currentCycle, 5, "Critique: Skipped");
        UI.logToTimeline(
          currentCycle,
          `[DECIDE] Critique Skipped. Applying.`,
          "info",
          true
        );
      }

      if (critiquePassed) {
        UI.updateStatus("Applying Changes...", true);
        UI.logCoreLoopStep(currentCycle, 6, "Refine & Apply");
        const applyResult = applyLLMChanges(
          currentLlmResponse,
          currentCycle,
          applySource
        );

        if (applyResult.requiresSandbox) {
          state.lastCritiqueType = `${applySource} (Sandbox Pending)`;
          UI.updateStateDisplay();
          UI.updateStatus("Awaiting Meta Sandbox Approval...");
          UI.highlightCoreStep(6); // Stay on apply step visually
          StateManager.save();
          _isRunning = false; // Not technically running while waiting for sandbox
          return; // Stop cycle execution, wait for user sandbox action
        }

        if (applyResult.success) {
          state.agentIterations++;
          state.lastFeedback = `${applySource}, applied successfully for Cycle ${applyResult.nextCycle}.`;
          // Cycle number already incremented in applyLLMChanges if successful
        } else {
          state.lastFeedback = `${applySource}, apply failed: ${applyResult.errors.join(
            ", "
          )}`;
          state.failCount++;
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
          StateManager.save();
          _isRunning = false; // Reset running state before returning due to HITL
          if (uiRefs.runCycleButton)
            uiRefs.runCycleButton.textContent = "Run Cycle"; // Reset button text
          return;
        }
        const summaryOutcome = applyResult.success
          ? `OK (${state.lastCritiqueType})`
          : `Failed (Apply Fail after ${state.lastCritiqueType})`;
        UI.summarizeCompletedCycleLog(summaryOutcome);
        UI.updateStateDisplay();
        UI.clearCurrentCycleDetails();
        UI.logCoreLoopStep(state.totalCycles - 1, 7, "Repeat/Pause"); // Log step 8 based on the cycle that just finished
        UI.logToTimeline(
          state.totalCycles,
          `[STATE] Cycle ended (${state.lastCritiqueType}). Ready.`
        );
        if (uiRefs.goalInput) uiRefs.goalInput.value = ""; // Clear goal input for next cycle
      } else {
        logger.logEvent(
          "error",
          "Reached end of cycle unexpectedly after critique check (should have triggered HITL)."
        );
        UI.updateStatus("Error", false, true);
      }
    } catch (error) {
      if (
        error.message !== "Aborted" &&
        error.name !== "AbortError" &&
        error.message !== "Sandbox Pending" &&
        error.message !== "HITL Required" &&
        error.message !== "Max cycles reached." &&
        !error.message.startsWith("Valid Gemini API Key required") &&
        !error.message.startsWith("Initial Goal required")
      ) {
        logger.logEvent(
          "error",
          `Unhandled cycle error: ${error.message}`,
          error
        );
        UI.showNotification(`Cycle Error: ${error.message}`, "error");
        UI.logToTimeline(
          StateManager?.getState()?.totalCycles || 0,
          `[CYCLE FATAL] ${error.message}`,
          "error"
        );
        UI.updateStatus("Cycle Failed", false, true);
      } else if (error.name === "AbortError" || error.message === "Aborted") {
        UI.logToTimeline(
          StateManager?.getState()?.totalCycles || 0,
          `[CYCLE] Cycle aborted by user.`,
          "warn"
        );
        UI.updateStatus("Aborted");
      } else {
        UI.showNotification(error.message, "warn"); // Show non-fatal errors as warnings
        UI.updateStatus("Idle"); // Reset status for known non-fatal stops
      }
    } finally {
      _isRunning = false;
      const uiRefs = UI.getRefs();
      if (uiRefs.runCycleButton) {
        uiRefs.runCycleButton.textContent = "Run Cycle";
        // Disable state depends on sandbox/hitl, re-checked in updateStateDisplay called below
      }
      // Final state update after cycle finishes or errors out
      if (StateManager?.getState()) {
        UI.updateStateDisplay();
        StateManager.save();
      }
      // Ensure status is reset if not waiting for HITL/Sandbox
      if (!UI.isMetaSandboxPending() && UI.isHumanInterventionHidden()) {
        UI.updateStatus("Idle");
      }
    }
  };

  const abortCurrentCycle = () => {
    logger.logEvent(
      "info",
      "Attempting to abort current cycle via API client."
    );
    ApiClient.abortCurrentCall();
    // The API client's error handler in callApiWithRetry should update status/timeline
    _isRunning = false;
    const uiRefs = UI.getRefs();
    if (uiRefs.runCycleButton) {
      uiRefs.runCycleButton.textContent = "Run Cycle";
      uiRefs.runCycleButton.disabled = false;
    }
    UI.updateStatus("Aborting...");
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
