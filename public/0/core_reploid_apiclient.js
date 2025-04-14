const ApiClientModule = (config, logger) => {
  if (!config || !logger) {
    console.error("ApiClientModule requires config and logger.");
    const log = logger || {
      logEvent: (lvl, msg) =>
        console[lvl === "error" ? "error" : "log"](
          `[APICLIENT FALLBACK] ${msg}`
        ),
    };
    log.logEvent(
      "error",
      "ApiClientModule initialization failed: Missing dependencies."
    );
    return {
      callApiWithRetry: async () => {
        throw new Error("ApiClient not initialized");
      },
      abortCurrentCall: () => {
        log.logEvent("warn", "ApiClient not initialized, cannot abort.");
      },
      sanitizeLlmJsonResp: (rawText) => "{}",
    };
  }

  let currentAbortController = null;
  const API_ENDPOINT_BASE =
    config.GEMINI_STREAM_ENDPOINT_BASE ||
    "https://generativelanguage.googleapis.com/v1beta/models/";
  const RETRY_DELAY_BASE = config.API_RETRY_DELAY_BASE_MS || 1500;

  const sanitizeLlmJsonResp = (rawText) => {
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

    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < s.length; i++) {
      const char = s[i];

      if (inString) {
        if (escapeNext) {
          escapeNext = false;
        } else if (char === "\\") {
          escapeNext = true;
        } else if (char === '"') {
          inString = false;
        }
      } else {
        if (char === '"') {
          inString = true;
        } else if (char === startChar) {
          balance++;
        } else if (char === endChar) {
          balance--;
        }
      }

      if (!inString && balance === 0) {
        if (start === -1) start = i;
        lastValidIndex = i;
        break;
      }
    }

    if (lastValidIndex !== -1) {
      s = s.substring(0, lastValidIndex + 1);
    } else {
      // If balance never reached 0, it's likely truncated/invalid
      logger.logEvent(
        "warn",
        "JSON sanitization failed: Unbalanced structure.",
        s.substring(0, 50)
      );
      return "{}";
    }

    try {
      JSON.parse(s);
      return s;
    } catch (e) {
      logger.logEvent(
        "warn",
        `Sanitized JSON still invalid: ${e.message}`,
        s.substring(0, 50) + "..."
      );
      return "{}";
    }
  };

  const callGeminiAPIStream = async (
    prompt,
    sysInstr,
    modelName,
    apiKey,
    funcDecls = [],
    prevContent = null,
    abortSignal,
    progressCallback = () => {}
  ) => {
    const apiEndpoint = `${API_ENDPOINT_BASE}${modelName}:streamGenerateContent`;
    logger.logEvent("info", `Streaming API Call: ${modelName}`, {
      endpoint: apiEndpoint,
    });
    if (progressCallback)
      progressCallback({ type: "status", content: "Starting..." });

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
    let finalRawResponse = null;
    let lastReportedAccumulatedResult = null;

    try {
      const response = await fetch(`${apiEndpoint}?key=${apiKey}&alt=sse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
        signal: abortSignal,
      });

      if (!response.ok || !response.body) {
        let errBodyText = "Unknown error structure";
        try {
          errBodyText = await response.text();
        } catch (e) {
          /* ignore read error */
        }
        let errJson = {};
        try {
          errJson = JSON.parse(errBodyText);
        } catch (e) {
          /* ignore parse error */
        }
        throw new Error(
          `API Error (${response.status}): ${
            errJson?.error?.message || response.statusText || errBodyText
          }`
        );
      }

      if (progressCallback)
        progressCallback({ type: "status", content: "Receiving..." });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        if (abortSignal?.aborted) throw new Error("Aborted");
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const chunk = JSON.parse(line.substring(6));
              finalRawResponse = chunk;

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
                finalFinishReason = candidate.finishReason || finalFinishReason;

                if (
                  finalFinishReason === "SAFETY" ||
                  candidate.finishReason === "SAFETY"
                ) {
                  throw new Error(`API Response Blocked: SAFETY`);
                }

                const part = candidate.content?.parts?.[0];
                let progressUpdate = null;

                if (part?.text) {
                  accumulatedText += part.text;
                  progressUpdate = {
                    type: "text",
                    content: part.text,
                    accumulated: accumulatedText,
                  };
                } else if (part?.functionCall) {
                  if (!accumulatedFunctionCall) {
                    accumulatedFunctionCall = {
                      name: part.functionCall.name,
                      args: {},
                    };
                  }
                  // Deep merge args to handle potential object streaming
                  if (
                    typeof part.functionCall.args === "object" &&
                    part.functionCall.args !== null
                  ) {
                    for (const key in part.functionCall.args) {
                      if (
                        typeof part.functionCall.args[key] === "object" &&
                        accumulatedFunctionCall.args[key] &&
                        typeof accumulatedFunctionCall.args[key] === "object"
                      ) {
                        Object.assign(
                          accumulatedFunctionCall.args[key],
                          part.functionCall.args[key]
                        );
                      } else {
                        accumulatedFunctionCall.args[key] =
                          part.functionCall.args[key];
                      }
                    }
                  }
                  progressUpdate = {
                    type: "functionCall",
                    content: part.functionCall,
                    accumulated: { ...accumulatedFunctionCall },
                  };
                }

                if (progressCallback && progressUpdate) {
                  lastReportedAccumulatedResult = {
                    type: accumulatedFunctionCall
                      ? "functionCall"
                      : accumulatedText
                      ? "text"
                      : "empty",
                    content: accumulatedFunctionCall
                      ? { ...accumulatedFunctionCall }
                      : accumulatedText,
                    tokenCount: totalTokens,
                    finishReason: finalFinishReason,
                    rawResp: finalRawResponse,
                  };
                  progressUpdate.accumulatedResult =
                    lastReportedAccumulatedResult;
                  progressCallback(progressUpdate);
                }
              }
              if (progressCallback)
                progressCallback({
                  type: "status",
                  content: `Tokens: ${totalTokens}`,
                });
            } catch (e) {
              // Don't throw here, just log, could be a single bad chunk
              logger.logEvent(
                "warn",
                `Failed to parse/process SSE chunk: ${e.message}`,
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
      if (progressCallback)
        progressCallback({ type: "status", content: "Done" });

      if (lastReportedAccumulatedResult) return lastReportedAccumulatedResult;

      // Construct final result if no progress was reported but stream finished
      const finalResultType = accumulatedFunctionCall
        ? "functionCall"
        : accumulatedText
        ? "text"
        : "empty";
      return {
        type: finalResultType,
        content: accumulatedFunctionCall
          ? accumulatedFunctionCall
          : accumulatedText,
        tokenCount: totalTokens,
        finishReason: finalFinishReason,
        rawResp: finalRawResponse,
      };
    } catch (error) {
      // Don't log AbortError as an error, it's expected user action
      if (error.message !== "Aborted" && error.name !== "AbortError") {
        logger.logEvent("error", `API Stream Error: ${error.message}`, error);
      } else {
        logger.logEvent("info", "API call aborted by user or signal.");
      }
      if (progressCallback)
        progressCallback({
          type: "status",
          content: error.message === "Aborted" ? "Aborted" : "Error",
        });
      throw error; // Re-throw error after logging
    }
  };

  const callApiWithRetry = async (
    prompt,
    sysInstr,
    modelName,
    apiKey,
    funcDecls = [],
    isContinuation = false, // Renamed for clarity
    prevContent = null,
    maxRetries = 1,
    updateStatusFn = () => {},
    logTimelineFn = () => ({}),
    updateTimelineFn = () => {},
    progressCallback = () => {}
  ) => {
    if (currentAbortController) {
      logger.logEvent(
        "warn",
        "Aborting previous API call before starting new one."
      );
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();
    let attempt = 0;

    while (attempt <= maxRetries) {
      let logItem = null;
      try {
        if (attempt === 0 && !isContinuation) {
          updateStatusFn(`Calling Gemini (${modelName})...`, true);
          logItem = logTimelineFn(
            `[API] Calling ${modelName}...`,
            "info",
            true,
            true
          );
        } else if (attempt > 0) {
          updateStatusFn(
            `Retrying Gemini (${modelName}) [${attempt}/${maxRetries}]...`,
            true
          );
          logItem = logTimelineFn(
            `[API RETRY ${attempt}] Calling ${modelName}...`,
            "warn",
            true,
            true
          );
        }

        const result = await callGeminiAPIStream(
          prompt,
          sysInstr,
          modelName,
          apiKey,
          funcDecls,
          prevContent,
          currentAbortController.signal,
          (progress) => {
            // Pass merged progress handler
            if (
              progress.type === "status" &&
              progress.content !== "Starting..." &&
              progress.content !== "Receiving..." &&
              progress.content !== "Done"
            ) {
              // Update timeline item with status like token count
              if (logItem)
                updateTimelineFn(
                  logItem,
                  `[API:${modelName}] ${progress.content}`,
                  "info",
                  false
                );
            }
            // Forward original progress object
            progressCallback(progress);
            if (
              progress.type === "status" &&
              progress.content !== "Starting..."
            ) {
              updateStatusFn(
                progress.content === "Done" ? "Processing..." : progress.content
              );
            }
          }
        );

        if (logItem)
          updateTimelineFn(
            logItem,
            `[API OK:${modelName}] Finish: ${result.finishReason}, Tokens: ${result.tokenCount}`,
            "info",
            true
          );
        if (!isContinuation) updateStatusFn("Processing...");

        if (attempt === maxRetries || result) currentAbortController = null;
        return result; // Success
      } catch (error) {
        if (error.name === "AbortError" || error.message === "Aborted") {
          if (logItem)
            updateTimelineFn(
              logItem,
              `[API Aborted:${modelName}] User cancelled`,
              "warn",
              true
            );
          if (!isContinuation) updateStatusFn("Aborted");
          currentAbortController = null;
          throw error;
        }

        logger.logEvent(
          "warn",
          `API attempt ${attempt} failed: ${error.message}. Retries left: ${
            maxRetries - attempt
          }`
        );
        if (logItem)
          updateTimelineFn(
            logItem,
            `[API ERR ${attempt}:${modelName}] ${String(
              error.message || "Unknown"
            ).substring(0, 80)} (Retries left: ${maxRetries - attempt})`,
            "error",
            true
          );

        attempt++;
        if (attempt > maxRetries) {
          logger.logEvent(
            "error",
            `API call failed after ${maxRetries} retries.`
          );
          if (!isContinuation) updateStatusFn("API Failed", false, true);
          currentAbortController = null; // Clear controller on final failure
          throw error; // Throw final error
        }

        // Check if error is retryable
        const isRetryable =
          error.message.includes("API Error (5") ||
          error.message.includes("NetworkError") ||
          error.message.includes("Failed to fetch");
        if (!isRetryable) {
          logger.logEvent(
            "error",
            `API error deemed non-retryable: ${error.message}`
          );
          if (!isContinuation)
            updateStatusFn("API Failed (Non-retryable)", false, true);
          currentAbortController = null;
          throw error;
        }

        const delayMs = RETRY_DELAY_BASE * attempt;
        if (!isContinuation)
          updateStatusFn(`API Error. Retrying in ${delayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // If retrying, need to ensure prevContent reflects the *start* of this attempt sequence
        // For now, assuming prevContent passed initially is static for the retry sequence
      }
    }
    throw new Error("callApiWithRetry reached end unexpectedly.");
  };

  const abortCurrentCall = () => {
    if (currentAbortController) {
      logger.logEvent("info", "User requested API call abort.");
      currentAbortController.abort();
      currentAbortController = null;
    } else {
      logger.logEvent("info", "No active API call to abort.");
    }
  };

  return {
    callApiWithRetry,
    abortCurrentCall,
    sanitizeLlmJsonResp,
  };
};
