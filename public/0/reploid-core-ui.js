const UIModule = (config, logger, Utils, Storage) => {
  if (!config || !logger || !Utils || !Storage) {
    console.error("UIModule requires config, logger, Utils, and Storage.");
    const log = logger || {
      logEvent: (lvl, msg) =>
        console[lvl === "error" ? "error" : "log"](`[UI FALLBACK] ${msg}`),
    };
    log.logEvent(
      "error",
      "UIModule initialization failed: Missing base dependencies."
    );
    return { init: () => log.logEvent("error", "UI not initialized.") }; // Return dummy object
  }

  let uiRefs = {};
  let isInitialized = false;
  let StateManager = null; // Will be injected via init
  let CycleLogic = null; // Will be injected via init
  let metaSandboxPending = false; // Internal UI state flag
  let activeCoreStepIdx = -1;
  let lastCycleLogItem = null; // Track the main cycle log item

  const APP_MODELS = [
    config.DEFAULT_MODELS.BASE,
    config.DEFAULT_MODELS.ADVANCED,
    // Add other models from config if needed e.g., config.DEFAULT_MODELS.OPTIMIZER
  ];
  if (
    config.DEFAULT_MODELS.CRITIQUE &&
    !APP_MODELS.includes(config.DEFAULT_MODELS.CRITIQUE)
  ) {
    APP_MODELS.push(config.DEFAULT_MODELS.CRITIQUE);
  }

  const CTX_WARN_THRESH = config.CTX_WARN_THRESH;
  const SVG_NS = config.SVG_NS;

  const initializeUIElementReferences = () => {
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
  };

  const updateStatus = (message, isActive = false, isError = false) => {
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
  };

  const updateApiProgress = (message) => {
    if (uiRefs.apiProgress) {
      uiRefs.apiProgress.textContent = message ? `API: ${message}` : "";
    }
  };

  const updateStreamingOutput = (content, isFinal = false) => {
    if (uiRefs.streamingOutputContainer && uiRefs.streamingOutputPre) {
      uiRefs.streamingOutputContainer.classList.remove("hidden");
      uiRefs.streamingOutputPre.textContent = content;
      uiRefs.streamingOutputPre.scrollTop =
        uiRefs.streamingOutputPre.scrollHeight;
      // Decide later if we want auto-hide on final
    }
  };

  const clearStreamingOutput = () => {
    if (uiRefs.streamingOutputContainer && uiRefs.streamingOutputPre) {
      uiRefs.streamingOutputPre.textContent = "(Stream ended)";
      setTimeout(() => {
        if (uiRefs.streamingOutputContainer) {
          // Check again in case UI removed
          uiRefs.streamingOutputContainer.classList.add("hidden");
        }
      }, 2000);
    }
  };

  const highlightCoreStep = (stepIndex) => {
    activeCoreStepIdx = stepIndex;
    logger.logEvent("debug", `UI Highlighting step: ${stepIndex}`);
    if (uiRefs.coreLoopStepsList && uiRefs.coreLoopStepsList.children) {
      Array.from(uiRefs.coreLoopStepsList.children).forEach((li, idx) => {
        li.classList.toggle("active-step", idx === stepIndex);
      });
    }
  };

  const showNotification = (message, type = "info", duration = 5000) => {
    const container =
      uiRefs.notificationsContainer || Utils.$id("notifications-container"); // Fallback if refs not ready
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
  };

  const createSvgElement = (name, attrs = {}) => {
    const el = document.createElementNS(SVG_NS, name);
    for (const key in attrs) el.setAttribute(key, attrs[key]);
    return el;
  };

  const updateMetricsDisplay = (state) => {
    if (!state || !uiRefs.avgConfidence) return;
    const confHistory = state.confidenceHistory.slice(-10);
    if (confHistory.length > 0) {
      state.avgConfidence =
        confHistory.reduce((a, b) => a + b, 0) / confHistory.length;
      uiRefs.avgConfidence.textContent = state.avgConfidence.toFixed(2);
    } else {
      if (uiRefs.avgConfidence) uiRefs.avgConfidence.textContent = "N/A";
    }
    const critHistory = state.critiqueFailHistory.slice(-10);
    if (critHistory.length > 0) {
      const fails = critHistory.filter((v) => v === true).length;
      state.critiqueFailRate = (fails / critHistory.length) * 100;
      if (uiRefs.critiqueFailRate)
        uiRefs.critiqueFailRate.textContent =
          state.critiqueFailRate.toFixed(1) + "%";
    } else {
      if (uiRefs.critiqueFailRate) uiRefs.critiqueFailRate.textContent = "N/A";
    }
    if (uiRefs.avgTokens)
      uiRefs.avgTokens.textContent = state.avgTokens?.toFixed(0) || "N/A";
    if (uiRefs.contextTokenEstimate)
      uiRefs.contextTokenEstimate.textContent =
        state.contextTokenEstimate?.toLocaleString() || "0";
    if (uiRefs.failCount) uiRefs.failCount.textContent = state.failCount;
    checkContextTokenWarning(state);
  };

  const checkContextTokenWarning = (state) => {
    if (!state || !uiRefs.contextTokenWarning) return;
    const isWarn = state.contextTokenEstimate >= CTX_WARN_THRESH;
    uiRefs.contextTokenWarning.classList.toggle("hidden", !isWarn);
    if (
      isWarn &&
      !uiRefs.contextTokenWarning.classList.contains("warning-logged")
    ) {
      logger.logEvent(
        "warn",
        `Context high! (${state.contextTokenEstimate.toLocaleString()}). Consider summarizing.`
      );
      uiRefs.contextTokenWarning.classList.add("warning-logged"); // Prevent repeated logs
    } else if (!isWarn) {
      uiRefs.contextTokenWarning.classList.remove("warning-logged");
    }
  };

  const updateHtmlHistoryControls = (state) => {
    if (!uiRefs.htmlHistoryCount || !state) return;
    const count = state.htmlHistory?.length || 0;
    uiRefs.htmlHistoryCount.textContent = count.toString();
    if (uiRefs.goBackButton) uiRefs.goBackButton.disabled = count === 0;
  };

  const updateFieldsetSummaries = (state) => {
    if (!state || !StateManager) return;

    const updateSummary = (fieldsetRefOrId, text) => {
      let fieldset =
        typeof fieldsetRefOrId === "string"
          ? Utils.$id(fieldsetRefOrId)
          : fieldsetRefOrId;
      if (fieldset) {
        const summary = fieldset.querySelector(".summary-line");
        if (summary) summary.textContent = text || "(N/A)";
      }
    };

    const cfg = state.cfg || {};
    updateSummary(
      "genesis-config",
      `LSD:${cfg.personaBalance}%,Crit:${cfg.llmCritiqueProb}%,Rev:${
        cfg.humanReviewProb
      }%,CycleT:${cfg.maxCycleTime}s,ConfT:${cfg.autoCritiqueThresh},MaxC:${
        cfg.maxCycles || "Inf"
      },CoreM:${(cfg.coreModel || "").split("-")[1]},CritM:${
        (cfg.critiqueModel || "").split("-")[1]
      }`
    );

    const promptLens = {
      core:
        Storage.getArtifactContent("reploid.core.sys-prompt", 0)?.length || 0,
      crit:
        Storage.getArtifactContent("reploid.core.critiquer-prompt", 0)
          ?.length || 0,
      sum:
        Storage.getArtifactContent("reploid.core.summarizer-prompt", 0)
          ?.length || 0,
    };
    updateSummary(
      "seed-prompts",
      `Core:${promptLens.core}c, Crit:${promptLens.crit}c, Sum:${promptLens.sum}c`
    );

    const genesisDiagramLen =
      Storage.getArtifactContent("reploid.core.diagram", 0)?.length || 0;
    updateSummary(
      uiRefs.genesisStateDisplay,
      `Diagram JSON: ${genesisDiagramLen}c`
    );

    const cycleContent = uiRefs.currentCycleContent?.textContent || "";
    updateSummary(
      uiRefs.currentCycleDetails,
      `Items: ${uiRefs.currentCycleContent?.childElementCount || 0}, Content: ${
        cycleContent.length
      }c`
    );
    updateSummary(
      "timeline-fieldset",
      `Entries: ${uiRefs.timelineLog?.childElementCount || 0}`
    );
    updateSummary(
      "controls-fieldset",
      `API Key: ${state.apiKey ? "Set" : "Not Set"}`
    );
  };

  const updateStateDisplay = () => {
    if (!StateManager) return;
    const state = StateManager.getState();
    if (!state || !uiRefs.totalCycles) return;

    const cfg = state.cfg || {};
    if (uiRefs.lsdPersonaPercentInput)
      uiRefs.lsdPersonaPercentInput.value = cfg.personaBalance ?? 50;
    if (uiRefs.xyzPersonaPercentInput)
      uiRefs.xyzPersonaPercentInput.value = 100 - (cfg.personaBalance ?? 50);
    if (uiRefs.llmCritiqueProbInput)
      uiRefs.llmCritiqueProbInput.value = cfg.llmCritiqueProb ?? 50;
    if (uiRefs.humanReviewProbInput)
      uiRefs.humanReviewProbInput.value = cfg.humanReviewProb ?? 50;
    if (uiRefs.maxCycleTimeInput)
      uiRefs.maxCycleTimeInput.value = cfg.maxCycleTime ?? 600;
    if (uiRefs.autoCritiqueThreshInput)
      uiRefs.autoCritiqueThreshInput.value = cfg.autoCritiqueThresh ?? 0.75;
    if (uiRefs.maxCyclesInput) uiRefs.maxCyclesInput.value = cfg.maxCycles ?? 0;
    if (uiRefs.htmlHistoryLimitInput)
      uiRefs.htmlHistoryLimitInput.value = cfg.htmlHistoryLimit ?? 5;
    if (uiRefs.pauseAfterCyclesInput)
      uiRefs.pauseAfterCyclesInput.value = cfg.pauseAfterCycles ?? 10;
    if (uiRefs.maxRetriesInput)
      uiRefs.maxRetriesInput.value = cfg.maxRetries ?? 1;
    if (uiRefs.apiKeyInput) uiRefs.apiKeyInput.value = state.apiKey || "";

    if (uiRefs.coreModelSelector)
      uiRefs.coreModelSelector.value =
        cfg.coreModel || config.DEFAULT_MODELS.BASE;
    if (uiRefs.critiqueModelSelector)
      uiRefs.critiqueModelSelector.value =
        cfg.critiqueModel || config.DEFAULT_MODELS.CRITIQUE;

    const maxC = cfg.maxCycles || 0;
    if (uiRefs.maxCyclesDisplay)
      uiRefs.maxCyclesDisplay.textContent =
        maxC === 0 ? "Inf" : maxC.toString();
    if (uiRefs.totalCycles) uiRefs.totalCycles.textContent = state.totalCycles;
    if (uiRefs.agentIterations)
      uiRefs.agentIterations.textContent = state.agentIterations;
    if (uiRefs.humanInterventions)
      uiRefs.humanInterventions.textContent = state.humanInterventions;
    if (uiRefs.failCount) uiRefs.failCount.textContent = state.failCount;

    const goalInfo = CycleLogic?.getActiveGoalInfo() || {
      type: "Idle",
      latestGoal: "Idle",
    }; // Use injected CycleLogic
    let goalText =
      goalInfo.type === "Idle"
        ? "Idle"
        : `${goalInfo.type}: ${goalInfo.latestGoal}`;
    if (state.currentGoal?.summaryContext) {
      goalText += ` (Ctx: ${state.currentGoal.summaryContext.substring(
        0,
        20
      )}...)`;
    }
    if (uiRefs.currentGoal)
      uiRefs.currentGoal.textContent = Utils.trunc(goalText, 60);

    if (uiRefs.lastCritiqueType)
      uiRefs.lastCritiqueType.textContent = state.lastCritiqueType;
    if (uiRefs.personaMode) uiRefs.personaMode.textContent = state.personaMode;

    updateMetricsDisplay(state);
    updateHtmlHistoryControls(state);
    // Logic for showing/hiding intervention/sandbox UI depends on state managed elsewhere (e.g., CycleLogic)
    // Only update button states based on known UI state here
    const humanInterventionVisible =
      !uiRefs.humanInterventionSection?.classList.contains("hidden");
    if (uiRefs.runCycleButton) {
      uiRefs.runCycleButton.disabled =
        metaSandboxPending ||
        humanInterventionVisible ||
        (CycleLogic ? CycleLogic.isRunning() : false);
    }
    updateFieldsetSummaries(state);
  };

  const displayGenesisState = () => {
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
  };

  const logToTimeline = (
    cycle,
    message,
    type = "info",
    isSubStep = false,
    animate = false
  ) => {
    if (!uiRefs.timelineLog || !StateManager) return null;
    logger.logEvent(type, `T[${cycle}]: ${message}`);

    const state = StateManager.getState();
    const persona = state?.personaMode === "XYZ" ? "[X]" : "[L]";
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

    const li = document.createElement("li");
    const span = document.createElement("span");
    li.setAttribute("data-cycle", cycle);
    li.setAttribute("data-timestamp", Date.now());
    li.classList.add(isSubStep ? "sub-step" : "log-entry");
    if (type === "error") li.classList.add("error");
    if (type === "warn") li.classList.add("warn");

    let iconHTML = `<span class="log-icon" title="${type}">${icon}</span>`;
    if (animate) {
      iconHTML = `<span class="log-icon animated-icon" title="${type}">⚙️</span>`;
    }
    span.innerHTML = `${iconHTML} ${persona} ${message}`;
    li.appendChild(span);
    const targetList = uiRefs.timelineLog;
    targetList.insertBefore(li, targetList.firstChild);

    // Limit timeline length
    while (targetList.children.length > 200) {
      targetList.removeChild(targetList.lastChild);
    }

    // Track the main cycle log item for summarization later
    if (message.startsWith("[CYCLE] === Cycle")) {
      lastCycleLogItem = li;
    }
    return li;
  };

  const logCoreLoopStep = (cycle, stepIndex, message) => {
    highlightCoreStep(stepIndex);
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
    while (uiRefs.timelineLog.children.length > 200) {
      // Also limit here
      uiRefs.timelineLog.removeChild(uiRefs.timelineLog.lastChild);
    }
    return li;
  };

  const updateTimelineItem = (
    logItem,
    newMessage,
    newType = "info",
    stopAnimate = true
  ) => {
    if (!logItem || !StateManager) return;
    const span = logItem.querySelector("span");
    if (!span) return;

    const state = StateManager.getState();
    const persona = state?.personaMode === "XYZ" ? "[X]" : "[L]";
    let iconElement = span.querySelector(".log-icon");
    let icon = iconElement?.textContent || "➡️";
    let iconClass = "log-icon";
    let currentTitle = iconElement?.getAttribute("title") || newType;

    if (newMessage.includes(" OK")) icon = "✅";
    else if (newMessage.includes(" ERR")) icon = "❌";
    if (newType === "warn") icon = "⚠️";
    if (newType === "error") icon = "❌";

    if (stopAnimate) {
      const animatedIconEl = span.querySelector(".animated-icon");
      if (animatedIconEl) {
        animatedIconEl.classList.remove("animated-icon");
        iconClass = "log-icon";
        currentTitle = newType; // Reset title when stopping animation
      }
    } else {
      if (span.querySelector(".animated-icon")) {
        icon = "⚙️";
        iconClass = "log-icon animated-icon";
        // Keep existing title during animation
      }
    }

    span.innerHTML = `<span class="${iconClass}" title="${currentTitle}">${icon}</span> ${persona} ${newMessage}`;
    logItem.classList.remove("error", "warn");
    if (newType === "error") logItem.classList.add("error");
    if (newType === "warn") logItem.classList.add("warn");
  };

  const summarizeCompletedCycleLog = (outcome) => {
    if (!lastCycleLogItem || !lastCycleLogItem.classList.contains("log-entry"))
      return;
    lastCycleLogItem.classList.add("summary");
    const firstSpan = lastCycleLogItem.querySelector("span");
    if (firstSpan) {
      firstSpan.innerHTML = `<span class="log-icon">🏁</span> Cycle ${lastCycleLogItem.getAttribute(
        "data-cycle"
      )} Completed: ${outcome} (Expand?)`;
    }
    lastCycleLogItem = null; // Reset tracker
  };

  const clearCurrentCycleDetails = () => {
    if (!uiRefs.currentCycleDetails || !uiRefs.currentCycleContent) return;
    if (!uiRefs.currentCycleDetails.classList.contains("collapsed")) {
      uiRefs.currentCycleDetails.classList.add("collapsed");
    }
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
    updateFieldsetSummaries(StateManager?.getState()); // Update summary when clearing
  };

  const getArtifactTypeIndicator = (type) => {
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
      case "JSON_CONFIG":
        return "[CFG]";
      case "LOG":
        return "[LOG]";
      default:
        return "[???]";
    }
  };

  const displayCycleArtifact = (
    label,
    content,
    type = "info",
    isModified = false,
    source = null,
    artifactId = null,
    cycle = null
  ) => {
    if (
      !uiRefs.currentCycleDetails ||
      !uiRefs.currentCycleContent ||
      !StateManager
    )
      return;

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
    const typeIndicator = getArtifactTypeIndicator(meta.type);

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
    pre.classList.add(type); // e.g., 'info', 'input', 'output', 'error'
    if (isModified) pre.classList.add("modified");
    section.appendChild(pre);

    uiRefs.currentCycleContent.appendChild(section);
    updateFieldsetSummaries(StateManager.getState());
  };

  const hideHumanInterventionUI = () => {
    if (!uiRefs.humanInterventionSection) return;
    uiRefs.humanInterventionSection.classList.add("hidden");
    if (uiRefs.hitlOptionsMode) uiRefs.hitlOptionsMode.classList.add("hidden");
    if (uiRefs.hitlPromptMode) uiRefs.hitlPromptMode.classList.add("hidden");
    if (uiRefs.hitlCodeEditMode)
      uiRefs.hitlCodeEditMode.classList.add("hidden");

    // Re-enable run button only if not in sandbox mode and cycle not running
    const state = StateManager?.getState();
    if (
      !metaSandboxPending &&
      uiRefs.runCycleButton &&
      state &&
      !(CycleLogic ? CycleLogic.isRunning() : false)
    ) {
      uiRefs.runCycleButton.disabled = false;
    }
  };

  const showHumanInterventionUI = (
    mode = "prompt",
    reason = "",
    options = [],
    artifactIdToEdit = null
  ) => {
    if (!uiRefs.humanInterventionSection || !StateManager) return;
    const state = StateManager.getState();
    if (!state) return;

    highlightCoreStep(5);
    hideMetaSandbox(); // Hide sandbox if HITL comes up
    uiRefs.humanInterventionSection.classList.remove("hidden");
    const fieldset = uiRefs.humanInterventionSection.querySelector("fieldset");
    if (fieldset) fieldset.classList.remove("collapsed");

    if (uiRefs.humanInterventionTitle)
      uiRefs.humanInterventionTitle.textContent = `Human Intervention Required`;
    if (uiRefs.humanInterventionReason)
      uiRefs.humanInterventionReason.textContent = `Reason: ${reason}.`;
    if (uiRefs.humanInterventionReasonSummary)
      uiRefs.humanInterventionReasonSummary.textContent = `Reason: ${Utils.trunc(
        reason,
        50
      )}...`;

    if (uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = true; // Disable run during HITL
    logToTimeline(
      state.totalCycles,
      `[HUMAN] Intervention Required: ${reason}`,
      "warn",
      true
    );

    if (uiRefs.hitlOptionsMode) uiRefs.hitlOptionsMode.classList.add("hidden");
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
      const currentCycle = state.totalCycles;
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

      // Special case for pending full source
      if (
        state.lastGeneratedFullSource &&
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
            state.lastGeneratedFullSource || "(Full source not available)";
          cycle = currentCycle;
        } else {
          const meta = StateManager.getArtifactMetadata(id);
          if (meta && meta.latestCycle >= 0) {
            cycle = meta.latestCycle;
            content =
              Storage.getArtifactContent(id, cycle) ??
              `(Artifact ${id} - Cycle ${cycle} content not found)`;
          } else {
            content = `(Artifact ${id} not found or no cycles)`;
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
        (StateManager.getArtifactMetadata(artifactIdToEdit)?.latestCycle >= 0 ||
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
      // Default to prompt mode
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
  };

  const hideMetaSandbox = () => {
    if (!uiRefs.metaSandboxContainer) return;
    uiRefs.metaSandboxContainer.classList.add("hidden");
    metaSandboxPending = false;
    // Re-enable run button if appropriate
    const humanInterventionVisible =
      !uiRefs.humanInterventionSection?.classList.contains("hidden");
    if (
      !humanInterventionVisible &&
      uiRefs.runCycleButton &&
      !(CycleLogic ? CycleLogic.isRunning() : false)
    ) {
      uiRefs.runCycleButton.disabled = false;
    }
  };

  const showMetaSandbox = (htmlSource) => {
    if (
      !uiRefs.metaSandboxContainer ||
      !uiRefs.metaSandboxOutput ||
      !StateManager
    )
      return;
    const state = StateManager.getState();
    if (!state) return;

    highlightCoreStep(6);
    hideHumanInterventionUI(); // Hide HITL if sandbox comes up
    uiRefs.metaSandboxContainer.classList.remove("hidden");
    const fieldset = uiRefs.metaSandboxContainer.querySelector("fieldset");
    if (fieldset) fieldset.classList.remove("collapsed");

    if (uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = true; // Disable run during sandbox review

    const iframe = uiRefs.metaSandboxOutput;
    try {
      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(htmlSource);
        doc.close();
        logger.logEvent("info", "Meta sandbox rendered for approval.");
        metaSandboxPending = true;
        logToTimeline(
          state.totalCycles,
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
      logger.logEvent("error", `Cannot render meta sandbox: ${e.message}`, e);
      showNotification("Error: Failed to show meta sandbox preview.", "error");
      logToTimeline(
        state.totalCycles,
        `[ERROR] Meta-Sandbox failed to render.`,
        "error",
        true
      );
      hideMetaSandbox(); // Hide it if rendering failed
      if (uiRefs.runCycleButton) uiRefs.runCycleButton.disabled = false; // Re-enable run if sandbox failed
    }
  };

  const renderCycleSVG = (cycleData, svgElement) => {
    if (!svgElement) {
      logger.logEvent("error", "SVG element not found for rendering");
      return;
    }
    while (svgElement.firstChild) {
      svgElement.removeChild(svgElement.firstChild);
    }

    const svgConfig = {
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

    const defs = createSvgElement("defs");
    const marker = createSvgElement("marker", {
      id: "arrowhead",
      viewBox: "0 0 10 10",
      refX: "8",
      refY: "5",
      markerUnits: "strokeWidth",
      markerWidth: svgConfig.arrowSize,
      markerHeight: svgConfig.arrowSize,
      orient: "auto-start-reverse",
    });
    const path = createSvgElement("path", {
      d: "M 0 0 L 10 5 L 0 10 z",
      fill: svgConfig.colors.line_normal,
    });
    marker.appendChild(path);
    defs.appendChild(marker);

    ["line_success", "line_fail", "line_retry"].forEach((lineType) => {
      const markerColor = createSvgElement("marker", {
        id: `arrowhead-${lineType}`,
        viewBox: "0 0 10 10",
        refX: "8",
        refY: "5",
        markerUnits: "strokeWidth",
        markerWidth: svgConfig.arrowSize,
        markerHeight: svgConfig.arrowSize,
        orient: "auto-start-reverse",
      });
      const pathColor = createSvgElement("path", {
        d: "M 0 0 L 10 5 L 0 10 z",
        fill: svgConfig.colors[lineType],
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
      const group = createSvgElement("g");
      let shape;
      const style = svgConfig.colors[node.type] || svgConfig.colors.step;
      const isDecision =
        node.type === "decision" || node.type === "retry_decision";
      const halfWidth =
        (isDecision ? svgConfig.decisionSize : svgConfig.nodeWidth) / 2;
      const halfHeight =
        (isDecision ? svgConfig.decisionSize : svgConfig.nodeHeight) / 2;

      if (isDecision) {
        shape = createSvgElement("path", {
          d: `M ${node.x} ${node.y - halfHeight} L ${node.x + halfWidth} ${
            node.y
          } L ${node.x} ${node.y + halfHeight} L ${node.x - halfWidth} ${
            node.y
          } Z`,
          fill: style.fill,
          stroke: style.stroke,
          "stroke-width": svgConfig.strokeWidth,
        });
        node.bounds = {
          top: { x: node.x, y: node.y - halfHeight },
          bottom: { x: node.x, y: node.y + halfHeight },
          left: { x: node.x - halfWidth, y: node.y },
          right: { x: node.x + halfWidth, y: node.y },
        };
      } else {
        const isRound = node.type === "start_end" || node.type === "pause";
        shape = createSvgElement("rect", {
          x: node.x - halfWidth,
          y: node.y - halfHeight,
          width: svgConfig.nodeWidth,
          height: svgConfig.nodeHeight,
          rx: isRound ? svgConfig.nodeHeight / 2 : 8,
          ry: isRound ? svgConfig.nodeHeight / 2 : 8,
          fill: style.fill,
          stroke: style.stroke,
          "stroke-width": svgConfig.strokeWidth,
        });
        node.bounds = {
          top: { x: node.x, y: node.y - halfHeight },
          bottom: { x: node.x, y: node.y + halfHeight },
          left: { x: node.x - halfWidth, y: node.y },
          right: { x: node.x + halfWidth, y: node.y },
        };
      }
      group.appendChild(shape);

      const text = createSvgElement("text", {
        x: node.x,
        y: node.y,
        fill: svgConfig.colors.text,
        "font-family": svgConfig.fontFamily,
        "font-size": svgConfig.fontSize,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
      });
      const lines = String(node.label || "").split("\n");
      const lineHeight = svgConfig.fontSize * 1.2;
      const totalTextHeight = lines.length * lineHeight;
      const startY = node.y - totalTextHeight / 2 + lineHeight / 2;
      lines.forEach((line, index) => {
        const dy = index === 0 ? startY - node.y : lineHeight;
        const tspan = createSvgElement("tspan", { x: node.x, dy: `${dy}px` });
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
        svgConfig.colors[`line_${lineType}`] || svgConfig.colors.line_normal;
      const markerId = `arrowhead${
        lineType === "normal" ? "" : "-" + "line_" + lineType
      }`;

      const line = createSvgElement("line", {
        x1: startPoint.x,
        y1: startPoint.y,
        x2: endPoint.x,
        y2: endPoint.y,
        stroke: lineStyle,
        "stroke-width": svgConfig.strokeWidth,
        "marker-end": `url(#${markerId})`,
      });
      svgElement.appendChild(line);

      if (conn.label) {
        const labelRatio = 0.6;
        const midX = startPoint.x * labelRatio + endPoint.x * (1 - labelRatio);
        const midY = startPoint.y * labelRatio + endPoint.y * (1 - labelRatio);
        const angle = Math.atan2(dy, dx);
        const offsetX = Math.sin(angle) * 10;
        const offsetY = -Math.cos(angle) * 10;

        const textLabel = createSvgElement("text", {
          x: midX + offsetX,
          y: midY + offsetY,
          fill: svgConfig.colors.text,
          "font-family": svgConfig.fontFamily,
          "font-size": svgConfig.lineLabelFontSize,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
        });
        textLabel.textContent = conn.label;

        const textBBox = textLabel.getBBox
          ? textLabel.getBBox()
          : {
              width: conn.label.length * svgConfig.lineLabelFontSize * 0.6,
              height: svgConfig.lineLabelFontSize,
            };
        const bgRect = createSvgElement("rect", {
          x: midX + offsetX - textBBox.width / 2 - 2,
          y: midY + offsetY - textBBox.height / 2 - 1,
          width: textBBox.width + 4,
          height: textBBox.height + 2,
          fill: svgConfig.colors.line_label_bg,
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
      const viewBoxX = minX - svgConfig.padding;
      const viewBoxY = minY - svgConfig.padding;
      const viewBoxWidth = maxX - minX + 2 * svgConfig.padding;
      const viewBoxHeight = maxY - minY + 2 * svgConfig.padding;
      svgElement.setAttribute(
        "viewBox",
        `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`
      );
      svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
    } else {
      svgElement.setAttribute("viewBox", "0 0 800 1400"); // Fallback
      logger.logEvent("warn", "RenderCycleSVG: No finite bounds calculated.");
    }
  };

  const renderDiagramDisplay = (cycleNum) => {
    if (!uiRefs.diagramDisplayContainer || !StateManager) return;
    const svgContainer = uiRefs.diagramSvgContainer;
    const jsonDisplay = uiRefs.diagramJsonDisplay;
    const diagramContainer = uiRefs.diagramDisplayContainer;
    const cycleDiagram = uiRefs.cycleDiagram;
    if (!svgContainer || !jsonDisplay || !diagramContainer || !cycleDiagram) {
      logger.logEvent("warn", "Missing UI elements for diagram display.");
      return;
    }

    const jsonContent =
      Storage.getArtifactContent("target.diagram", cycleNum) ||
      Storage.getArtifactContent("reploid.core.diagram", 0); // Fallback to genesis diagram

    if (jsonContent) {
      jsonDisplay.value = jsonContent;
      try {
        const diagramJson = JSON.parse(jsonContent);
        renderCycleSVG(diagramJson, cycleDiagram);
        diagramContainer.classList.remove("hidden");
      } catch (e) {
        logger.logEvent(
          "warn",
          `Failed parse/render diagram JSON (Cyc ${cycleNum}): ${e.message}`
        );
        cycleDiagram.innerHTML =
          '<text fill="red" x="10" y="20">Error rendering Diagram JSON</text>';
        diagramContainer.classList.remove("hidden"); // Show even if error
      }
    } else {
      jsonDisplay.value = "{}";
      cycleDiagram.innerHTML = `<text x="10" y="20">No Diagram found (Cycle ${cycleNum})</text>`;
      diagramContainer.classList.add("hidden"); // Hide if no diagram at all
    }
  };

  const renderGeneratedUI = (cycleNum) => {
    if (!StateManager) return;
    const allMeta = StateManager.getAllArtifactMetadata();
    const getLatestContent = (idPrefix, defaultCycle) => {
      const meta = allMeta[idPrefix];
      const cycleToUse =
        meta?.latestCycle >= 0 ? meta.latestCycle : defaultCycle;
      return cycleToUse >= 0
        ? Storage.getArtifactContent(idPrefix, cycleToUse) || ""
        : "";
    };

    const headContent = getLatestContent("target.head", cycleNum);
    const bodyContent =
      getLatestContent("target.body", cycleNum) ||
      "<p>(No target.body artifact)</p>";

    const cssContents = Object.keys(allMeta)
      .filter(
        (id) =>
          id.startsWith("target.style.") &&
          allMeta[id].type.startsWith("CSS") &&
          allMeta[id].latestCycle >= 0
      )
      .map((id) => Storage.getArtifactContent(id, allMeta[id].latestCycle))
      .filter((content) => !!content)
      .join("\n\n");

    const jsContents = Object.keys(allMeta)
      .filter(
        (id) =>
          id.startsWith("target.script.") &&
          allMeta[id].type.startsWith("JS") &&
          allMeta[id].latestCycle >= 0
      )
      .map((id) => {
        const content = Storage.getArtifactContent(id, allMeta[id].latestCycle);
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
      if (!doc) throw new Error("Cannot get UI preview iframe document.");

      doc.open();
      doc.write(
        `<!DOCTYPE html><html><head><title>UI Preview (Cycle ${cycleNum})</title>${headContent}<style>body { margin: 10px; font-family: sans-serif; background-color:#fff; color:#000; } * { box-sizing: border-box; } ${cssContents}</style></head><body>${bodyContent}${jsContents}<script>console.log('UI preview rendered (Cycle ${cycleNum}).');</script></body></html>`
      );
      doc.close();
      logger.logEvent("info", `Rendered UI preview (Cycle ${cycleNum}).`);
    } catch (e) {
      logger.logEvent("error", `Failed to render UI preview: ${e.message}`, e);
    }
  };

  const loadPromptsFromLS = () => {
    if (
      !uiRefs.seedPromptCore ||
      !uiRefs.seedPromptCritique ||
      !uiRefs.seedPromptSummarize
    ) {
      logger.logEvent("warn", "Prompt textareas not found during UI init.");
      return;
    }
    uiRefs.seedPromptCore.value =
      Storage.getArtifactContent("reploid.core.sys-prompt", 0) || "";
    uiRefs.seedPromptCritique.value =
      Storage.getArtifactContent("reploid.core.critiquer-prompt", 0) || "";
    uiRefs.seedPromptSummarize.value =
      Storage.getArtifactContent("reploid.core.summarizer-prompt", 0) || "";
    logger.logEvent("debug", "Loaded prompts from LS into UI.");
  };

  const loadCoreLoopSteps = () => {
    if (!uiRefs.coreLoopStepsList) {
      logger.logEvent("warn", "Core loop steps list element not found.");
      return;
    }
    uiRefs.coreLoopStepsList.value =
      Storage.getArtifactContent("reploid.core.cycle-steps", 0) ||
      "Error loading steps.";
    logger.logEvent("debug", "Loaded core loop steps from LS into UI.");
  };

  const populateModelSelectors = () => {
    [uiRefs.coreModelSelector, uiRefs.critiqueModelSelector].forEach(
      (selector) => {
        if (!selector) return;
        selector.innerHTML = "";
        APP_MODELS.forEach((modelName) => {
          const option = document.createElement("option");
          option.value = modelName;
          option.textContent = modelName;
          selector.appendChild(option);
        });
      }
    );
  };

  const setupEventListeners = () => {
    if (!uiRefs.runCycleButton || !CycleLogic || !StateManager) {
      // Ensure dependencies injected
      logger.logEvent(
        "error",
        "UI elements or core logic refs not ready for event listeners."
      );
      return;
    }

    uiRefs.runCycleButton.addEventListener("click", () => {
      if (CycleLogic.isRunning()) {
        CycleLogic.abortCurrentCycle(); // Assumes CycleLogic exposes this
      } else {
        CycleLogic.executeCycle(); // Assumes CycleLogic exposes this
      }
    });

    uiRefs.submitCritiqueButton?.addEventListener("click", () => {
      if (
        CycleLogic.proceedAfterHumanIntervention &&
        uiRefs.humanCritiqueInput
      ) {
        CycleLogic.proceedAfterHumanIntervention(
          "Human Prompt",
          uiRefs.humanCritiqueInput.value.trim()
        );
      }
    });

    uiRefs.submitHitlOptionsButton?.addEventListener("click", () => {
      if (CycleLogic.proceedAfterHumanIntervention && uiRefs.hitlOptionsList) {
        const selected = Array.from(
          uiRefs.hitlOptionsList.querySelectorAll("input:checked")
        )
          .map((el) => el.value)
          .join(", ");
        CycleLogic.proceedAfterHumanIntervention(
          "Human Options",
          selected || "None"
        );
      }
    });

    uiRefs.submitHumanCodeEditButton?.addEventListener("click", async () => {
      if (
        !CycleLogic.proceedAfterHumanIntervention ||
        !uiRefs.humanEditArtifactTextarea ||
        !StateManager
      )
        return;

      const artifactId = uiRefs.humanEditArtifactTextarea.getAttribute(
        "data-current-artifact-id"
      );
      const cycleStr = uiRefs.humanEditArtifactTextarea.getAttribute(
        "data-current-artifact-cycle"
      );
      const newContent = uiRefs.humanEditArtifactTextarea.value;
      const state = StateManager.getState();
      if (!state) return;

      if (!artifactId || cycleStr === null) {
        showNotification(
          "Error: No artifact selected or cycle info missing.",
          "error"
        );
        return;
      }
      const cycle = parseInt(cycleStr, 10);
      if (isNaN(cycle)) {
        showNotification("Error: Invalid cycle number for artifact.", "error");
        return;
      }

      updateStatus("Validating Edit...", true);
      try {
        // TODO: Use ToolRunner via CycleLogic or directly if passed to UI module? Pass via CycleLogic for now.
        const toolResult = await CycleLogic.runTool("code_edit", {
          artifactId,
          cycle,
          newContent,
        });

        updateStatus("Idle");
        if (toolResult?.success) {
          showNotification(
            `Edit for ${artifactId} validated. Proceeding...`,
            "info"
          );
          CycleLogic.proceedAfterHumanIntervention(
            "Human Code Edit",
            toolResult
          );
        } else {
          showNotification(
            `Edit Validation Failed: ${
              toolResult?.error || "Unknown validation error"
            }`,
            "error"
          );
          logger.logEvent(
            "error",
            `Human edit validation failed for ${artifactId}: ${toolResult?.error}`
          );
        }
      } catch (e) {
        updateStatus("Idle");
        logger.logEvent(
          "error",
          `Error running code_edit tool for ${artifactId}: ${e.message}`,
          e
        );
        showNotification(`Error validating edit: ${e.message}`, "error");
      }
    });

    uiRefs.forceHumanReviewButton?.addEventListener("click", () => {
      const state = StateManager?.getState();
      if (state) state.forceHumanReview = true;
      showNotification("Next cycle will pause for Human Review.", "info");
      logToTimeline(
        state?.totalCycles || 0,
        "[HUMAN] User forced Human Review.",
        "warn"
      );
    });

    uiRefs.downloadLogButton?.addEventListener("click", () => {
      try {
        const blob = new Blob([logger.getLogBuffer()], { type: "text/plain" });
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
        logger.logEvent("error", `Log download failed: ${e.message}`, e);
        showNotification(`Log download failed: ${e.message}`, "error");
      }
    });

    uiRefs.exportStateButton?.addEventListener("click", () =>
      StateManager?.exportState(uiRefs)
    );

    uiRefs.summarizeContextButton?.addEventListener("click", () =>
      CycleLogic?.handleSummarizeContext()
    );

    uiRefs.importStateButton?.addEventListener("click", () =>
      uiRefs.importFileInput?.click()
    );

    uiRefs.importFileInput?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file && StateManager) {
        StateManager.importState(file, (success, importedData, errorMsg) => {
          if (success && importedData) {
            // Restore UI elements after state import
            if (uiRefs.timelineLog)
              uiRefs.timelineLog.innerHTML = importedData.timelineHTML || "";
            clearCurrentCycleDetails();
            updateStateDisplay();
            renderDiagramDisplay(importedData.totalCycles);
            renderGeneratedUI(importedData.totalCycles);
            displayGenesisState();
            loadPromptsFromLS();
            loadCoreLoopSteps();
            logToTimeline(
              importedData.totalCycles,
              "[STATE] State imported.",
              "info"
            );
            showNotification("State imported. Ensure artifacts exist.", "info");
          } else {
            showNotification(
              `Import failed: ${errorMsg || "Unknown error"}`,
              "error"
            );
            logToTimeline(
              StateManager?.getState()?.totalCycles ?? 0,
              `[STATE] State import failed: ${errorMsg || "Unknown"}`,
              "error"
            );
          }
          if (uiRefs.importFileInput) uiRefs.importFileInput.value = "";
        });
      }
    });

    uiRefs.goBackButton?.addEventListener("click", () => {
      const state = StateManager?.getState();
      if (!state?.htmlHistory?.length) {
        showNotification("No history.", "warn");
        return;
      }
      if (
        !confirm("Revert page to previous version? State will attempt restore.")
      )
        return;

      const prevStateHtml = state.htmlHistory.pop();
      updateHtmlHistoryControls(state);
      logger.logEvent(
        "info",
        `Reverting page HTML. History size: ${state.htmlHistory.length}`
      );
      logToTimeline(
        state.totalCycles,
        "[STATE] Reverting HTML (Page Reload).",
        "warn"
      );

      try {
        const stateToPreserve = StateManager.capturePreservationState(uiRefs);
        Storage.saveSessionState(stateToPreserve);
        document.open();
        document.write(prevStateHtml);
        document.close();
        // Reload handles the rest via restoreStateFromSession
      } catch (e) {
        logger.logEvent("error", `Go Back failed: ${e.message}`, e);
        showNotification(`Go Back failed: ${e.message}`, "error");
        Storage.removeSessionState(); // Clear session state if save failed
        if (state.htmlHistory && prevStateHtml)
          state.htmlHistory.push(prevStateHtml); // Put it back if failed
        updateHtmlHistoryControls(state);
        StateManager.save(); // Save the state with history corrected
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
        showNotification("LocalStorage cleared. Reloading...", "info", 0);
        setTimeout(() => window.location.reload(), 1000);
      } catch (e) {
        logger.logEvent(
          "error",
          `Error clearing LocalStorage: ${e.message}`,
          e
        );
        showNotification(`Error clearing LocalStorage: ${e.message}`, "error");
      }
    });

    uiRefs.approveMetaChangeButton?.addEventListener("click", () => {
      const state = StateManager?.getState();
      if (metaSandboxPending && state?.lastGeneratedFullSource) {
        const sourceToApply = state.lastGeneratedFullSource;
        logger.logEvent("info", "Approved meta-change.");
        logToTimeline(
          state.totalCycles,
          `[STATE] Approved Meta-Sandbox. Applying & Reloading...`,
          "info",
          true
        );
        hideMetaSandbox();

        const currentHtml = document.documentElement.outerHTML;
        CycleLogic?.saveHtmlToHistory(currentHtml);

        const stateToPreserve = StateManager.capturePreservationState(uiRefs);
        stateToPreserve.metaSandboxPending = false;

        try {
          Storage.saveSessionState(stateToPreserve);
          document.open();
          document.write(sourceToApply);
          document.close();
          // Reload will trigger restore
        } catch (e) {
          logger.logEvent("error", `Apply meta-change failed: ${e.message}`, e);
          showNotification(`Apply failed: ${e.message}`, "error");
          Storage.removeSessionState();
          if (state?.htmlHistory?.length > 0) state.htmlHistory.pop();
          updateHtmlHistoryControls(state);
          metaSandboxPending = true;
        }
      } else {
        showNotification(
          "No sandbox content pending or state missing.",
          "warn"
        );
      }
    });

    uiRefs.discardMetaChangeButton?.addEventListener("click", () => {
      const state = StateManager?.getState();
      logger.logEvent("info", "Discarded meta-sandbox changes.");
      logToTimeline(
        state?.totalCycles || 0,
        `[STATE] Discarded Meta-Sandbox changes.`,
        "warn",
        true
      );
      hideMetaSandbox();
      if (state) state.lastGeneratedFullSource = null;
      CycleLogic?.proceedAfterHumanIntervention(
        "Sandbox Discarded",
        "User discarded changes",
        true
      );
    });

    uiRefs.lsdPersonaPercentInput?.addEventListener("input", () => {
      const state = StateManager?.getState();
      if (
        !state ||
        !uiRefs.lsdPersonaPercentInput ||
        !uiRefs.xyzPersonaPercentInput
      )
        return;
      let lsd = parseInt(uiRefs.lsdPersonaPercentInput.value, 10) || 0;
      lsd = Math.max(0, Math.min(100, lsd));
      if (!state.cfg) state.cfg = {};
      state.cfg.personaBalance = lsd;
      uiRefs.lsdPersonaPercentInput.value = lsd;
      uiRefs.xyzPersonaPercentInput.value = 100 - lsd;
      logger.logEvent("info", `UI Config Update: personaBalance = ${lsd}`);
      StateManager.save();
      updateFieldsetSummaries(state);
    });

    // Generic config listeners
    const defaultConfig = config.DEFAULT_CFG || {};
    Object.keys(defaultConfig).forEach((key) => {
      if (
        key === "personaBalance" ||
        key === "coreModel" ||
        key === "critiqueModel"
      )
        return; // Handled separately
      const inputId = Utils.camelToKabob(key) + "-input";
      const inputEl = uiRefs[Utils.kabobToCamel(inputId)];
      if (inputEl) {
        inputEl.addEventListener("change", (e) => {
          const state = StateManager?.getState();
          if (!state) return;
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
          if (!state.cfg) state.cfg = {};
          if (state.cfg[key] !== value) {
            state.cfg[key] = value;
            logger.logEvent("info", `UI Config Update: ${key} = ${value}`);
            if (key === "maxCycles" && uiRefs.maxCyclesDisplay)
              uiRefs.maxCyclesDisplay.textContent =
                value === 0 ? "Inf" : value.toString();
            if (key === "htmlHistoryLimit") updateHtmlHistoryControls(state);
            StateManager.save();
            updateFieldsetSummaries(state);
          }
        });
      }
    });

    uiRefs.coreModelSelector?.addEventListener("change", (e) => {
      const state = StateManager?.getState();
      if (state) {
        if (!state.cfg) state.cfg = {};
        state.cfg.coreModel = e.target.value;
        logger.logEvent(
          "info",
          `UI Config Update: coreModel = ${e.target.value}`
        );
        StateManager.save();
        updateFieldsetSummaries(state);
      }
    });

    uiRefs.critiqueModelSelector?.addEventListener("change", (e) => {
      const state = StateManager?.getState();
      if (state) {
        if (!state.cfg) state.cfg = {};
        state.cfg.critiqueModel = e.target.value;
        logger.logEvent(
          "info",
          `UI Config Update: critiqueModel = ${e.target.value}`
        );
        StateManager.save();
        updateFieldsetSummaries(state);
      }
    });

    document.querySelectorAll("fieldset legend").forEach((legend) => {
      legend.addEventListener("click", (event) => {
        if (event.target.closest("button, input, a, select, textarea")) return;
        const fieldset = legend.closest("fieldset");
        if (fieldset) {
          fieldset.classList.toggle("collapsed");
          // TODO: Optionally save collapsed state? Maybe too much overhead.
        }
      });
    });

    logger.logEvent("info", "UI Event listeners set up.");
  };

  const restoreUIState = (preservedData) => {
    if (!isInitialized || !uiRefs.timelineLog) {
      logger.logEvent(
        "warn",
        "Cannot restore UI state, UI not fully initialized or timeline missing."
      );
      return;
    }
    metaSandboxPending = preservedData.metaSandboxPending || false;

    if (uiRefs.timelineLog)
      uiRefs.timelineLog.innerHTML = preservedData.timelineHTML || "";

    updateStateDisplay();
    renderDiagramDisplay(preservedData.totalCycles);
    renderGeneratedUI(preservedData.totalCycles);
    displayGenesisState();
    loadPromptsFromLS();
    loadCoreLoopSteps();

    logToTimeline(
      preservedData.totalCycles,
      "[STATE] Restored after self-mod.",
      "info"
    );

    if (uiRefs.runCycleButton) {
      uiRefs.runCycleButton.disabled = metaSandboxPending;
      uiRefs.runCycleButton.textContent = "Run Cycle";
    }
    updateStatus(metaSandboxPending ? "Meta Sandbox Pending..." : "Idle");

    document.querySelectorAll("fieldset").forEach((fs) => {
      if (
        !fs.classList.contains("collapsed") &&
        fs.id !== "controls-fieldset" &&
        fs.id !== "current-cycle-details"
      ) {
        fs.classList.add("collapsed");
      }
    });
    updateFieldsetSummaries(preservedData);

    logger.logEvent("info", "UI state restored from session data.");
  };

  const init = (injectedStateManager, injectedCycleLogic) => {
    if (isInitialized) return;
    logger.logEvent("info", "Initializing UI Module...");
    StateManager = injectedStateManager;
    CycleLogic = injectedCycleLogic;
    if (!StateManager || !CycleLogic) {
      logger.logEvent(
        "error",
        "UI Init failed: StateManager or CycleLogic not provided."
      );
      return;
    }

    initializeUIElementReferences();
    populateModelSelectors();

    const restored = StateManager.restoreStateFromSession(restoreUIState);

    if (!restored) {
      updateStateDisplay();
      renderGeneratedUI(StateManager.getState()?.totalCycles || 0);
      displayGenesisState();
      loadPromptsFromLS();
      loadCoreLoopSteps();
      // Collapse fieldsets on initial load
      document.querySelectorAll("fieldset").forEach((fs) => {
        if (
          fs.id !== "controls-fieldset" &&
          fs.id !== "current-cycle-details"
        ) {
          fs.classList.add("collapsed");
        } else {
          fs.classList.remove("collapsed");
        }
      });
      updateFieldsetSummaries(StateManager.getState());
      logToTimeline(
        StateManager.getState()?.totalCycles || 0,
        "[STATE] System Initialized.",
        "info"
      );
    }

    // Setup listeners AFTER potential restore
    setupEventListeners();
    highlightCoreStep(-1);
    updateStatus("Idle");
    isInitialized = true;
    logger.logEvent("info", "UI Module initialization complete.");
  };

  return {
    init,
    updateStatus,
    updateApiProgress,
    updateStreamingOutput,
    clearStreamingOutput,
    highlightCoreStep,
    showNotification,
    logToTimeline,
    logCoreLoopStep,
    updateTimelineItem,
    summarizeCompletedCycleLog,
    clearCurrentCycleDetails,
    displayCycleArtifact,
    hideHumanInterventionUI,
    showHumanInterventionUI,
    hideMetaSandbox,
    showMetaSandbox,
    renderDiagramDisplay,
    renderGeneratedUI,
    updateStateDisplay,
    getRefs: () => uiRefs,
  };
};
