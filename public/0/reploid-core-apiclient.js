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
  const RETRY_DELAY_BASE_MS = config.API_RETRY_DELAY_BASE_MS || 1500;
  const RETRY_DELAY_MAX_MS = 30000;

  const sanitizeLlmJsonResp = (rawText) => {
    if (!rawText || typeof rawText !== "string") return "{}";
    let text = rawText.trim();
    let jsonString = null;
    let method = "none";

    try {
      JSON.parse(text);
      jsonString = text;
      method = "direct parse";
    } catch (e1) {
      const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        text = codeBlockMatch[1].trim();
        method = "code block";
        try {
          JSON.parse(text);
          jsonString = text;
        } catch (e2) {
          // Code block content wasn't valid JSON, fall through to heuristic
        }
      }

      if (!jsonString) {
        const firstBrace = text.indexOf("{");
        const firstBracket = text.indexOf("[");
        let startIndex = -1;
        if (firstBrace !== -1 && firstBracket !== -1) {
          startIndex = Math.min(firstBrace, firstBracket);
        } else if (firstBrace !== -1) {
          startIndex = firstBrace;
        } else {
          startIndex = firstBracket;
        }

        if (startIndex !== -1) {
          text = text.substring(startIndex);
          const startChar = text[0];
          const endChar = startChar === "{" ? "}" : "]";
          let balance = 0;
          let lastValidIndex = -1;
          let inString = false;
          let escapeNext = false;
          method = "heuristic balance";

          for (let i = 0; i < text.length; i++) {
            const char = text[i];
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
              lastValidIndex = i;
              break;
            }
          }

          if (lastValidIndex !== -1) {
            text = text.substring(0, lastValidIndex + 1);
            try {
              JSON.parse(text);
              jsonString = text;
            } catch (e3) {
              logger.logEvent(
                "warn",
                `JSON sanitization failed (heuristic parse): ${e3.message}`,
                text.substring(0, 50) + "..."
              );
              method = "heuristic failed";
              jsonString = null;
            }
          } else {
            logger.logEvent(
              "warn",
              "JSON sanitization failed: Unbalanced structure after heuristic.",
              text.substring(0, 50)
            );
            method = "heuristic unbalanced";
            jsonString = null;
          }
        } else {
          method = "no structure found";
          jsonString = null;
        }
      }
    }

    logger.logEvent("debug", `JSON sanitization method: ${method}`);
    return jsonString || "{}";
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
    let responseStatus = 0;
    let responseHeaders = {};

    try {
      const response = await fetch(`${apiEndpoint}?key=${apiKey}&alt=sse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
        signal: abortSignal,
      });

      responseStatus = response.status;
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      if (!response.ok || !response.body) {
        let errBodyText = "(Failed to read error body)";
        try {
          errBodyText = await response.text();
        } catch (e) {
          /* ignore */
        }
        let errJson = {};
        try {
          errJson = JSON.parse(errBodyText);
        } catch (e) {
          /* ignore */
        }
        const errorMessage =
          errJson?.error?.message || response.statusText || errBodyText;
        const error = new Error(
          `API Error (${response.status}): ${errorMessage}`
        );
        error.status = response.status;
        error.headers = responseHeaders;
        error.body = errBodyText;
        throw error;
      }

      if (progressCallback)
        progressCallback({ type: "status", content: "Receiving..." });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        if (abortSignal?.aborted) {
          const abortError = new Error("Aborted");
          abortError.name = "AbortError";
          throw abortError;
        }
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
                const blockError = new Error(
                  `API Blocked: ${chunk.promptFeedback.blockReason}`
                );
                blockError.status = 400; // Indicate a client-side type error (prompt caused block)
                blockError.reason = "PROMPT_BLOCK";
                throw blockError;
              }
              if (chunk.error) {
                const apiError = new Error(
                  `API Error in chunk: ${chunk.error.message || "Unknown"}`
                );
                apiError.status = chunk.error.code || 500;
                apiError.reason = "API_CHUNK_ERROR";
                throw apiError;
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
                  const safetyError = new Error(`API Response Blocked: SAFETY`);
                  safetyError.status = 400; // Indicate content generated was blocked
                  safetyError.reason = "RESPONSE_BLOCK_SAFETY";
                  throw safetyError;
                }
                if (
                  finalFinishReason === "RECITATION" ||
                  candidate.finishReason === "RECITATION"
                ) {
                  const recitationError = new Error(
                    `API Response Blocked: RECITATION`
                  );
                  safetyError.status = 400;
                  safetyError.reason = "RESPONSE_BLOCK_RECITATION";
                  throw safetyError;
                }
                if (
                  finalFinishReason === "OTHER" ||
                  candidate.finishReason === "OTHER"
                ) {
                  logger.logEvent(
                    "warn",
                    `API response finished with reason OTHER.`,
                    chunk
                  );
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
                  if (
                    typeof part.functionCall.args === "object" &&
                    part.functionCall.args !== null
                  ) {
                    Object.assign(
                      accumulatedFunctionCall.args,
                      part.functionCall.args
                    );
                  } else if (
                    part.functionCall.name &&
                    !accumulatedFunctionCall.name
                  ) {
                    accumulatedFunctionCall.name = part.functionCall.name;
                  }
                  logger.logEvent(
                    "debug",
                    `Received function call chunk: ${part.functionCall.name}`,
                    part.functionCall.args
                  );
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
                    status: responseStatus,
                    headers: responseHeaders,
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
              if (e.name === "AbortError") throw e;
              logger.logEvent(
                "warn",
                `Failed to parse/process SSE chunk: ${e.message}`,
                line
              );
              // Don't re-throw here unless it's a critical blocking error
              if (e.reason?.includes("_BLOCK")) throw e;
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
        status: responseStatus,
        headers: responseHeaders,
      };
    } catch (error) {
      if (error.name !== "AbortError") {
        logger.logEvent("error", `API Stream Error: ${error.message}`, {
          status: error.status,
          reason: error.reason,
          error,
        });
      } else {
        logger.logEvent("info", "API call aborted by user or signal.");
      }
      if (progressCallback)
        progressCallback({
          type: "status",
          content: error.name === "AbortError" ? "Aborted" : "Error",
        });
      throw error;
    }
  };

  const callApiWithRetry = async (
    prompt,
    sysInstr,
    modelName,
    apiKey,
    funcDecls = [],
    isContinuation = false,
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
    let currentDelay = RETRY_DELAY_BASE_MS;

    while (attempt <= maxRetries) {
      let logItem = null;
      try {
        const attemptMsg =
          attempt > 0 ? `[RETRY ${attempt}/${maxRetries}]` : "";
        const statusMsg = `${attemptMsg} Calling Gemini (${modelName})...`;
        if (attempt === 0 && !isContinuation) {
          updateStatusFn(statusMsg, true);
          logItem = logTimelineFn(
            `[API] Calling ${modelName}...`,
            "info",
            true,
            true
          );
        } else if (attempt > 0) {
          updateStatusFn(statusMsg, true);
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
            if (
              progress.type === "status" &&
              !["Starting...", "Receiving...", "Done"].includes(
                progress.content
              )
            ) {
              if (logItem)
                updateTimelineFn(
                  logItem,
                  `[API:${modelName}] ${progress.content}`,
                  "info",
                  false
                );
            }
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
            `[API OK:${modelName}] Finish: ${result.finishReason}, Tokens: ${result.tokenCount}, Status: ${result.status}`,
            "info",
            true
          );
        if (!isContinuation) updateStatusFn("Processing...");

        currentAbortController = null;
        return result;
      } catch (error) {
        const isAbort = error.name === "AbortError";
        if (isAbort) {
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

        const status = error.status || 0;
        const reason = error.reason || "UNKNOWN_ERROR";
        const errorMessage = error.message || "Unknown API error";

        logger.logEvent(
          "warn",
          `API attempt ${attempt} failed: ${errorMessage}. Status: ${status}, Reason: ${reason}. Retries left: ${
            maxRetries - attempt
          }`
        );
        if (logItem)
          updateTimelineFn(
            logItem,
            `[API ERR ${attempt}:${modelName}] ${status} ${reason} ${String(
              errorMessage
            ).substring(0, 50)} (Retries left: ${maxRetries - attempt})`,
            "error",
            true
          );

        attempt++;
        if (attempt > maxRetries) {
          logger.logEvent(
            "error",
            `API call failed after ${maxRetries} retries.`
          );
          if (!isContinuation)
            updateStatusFn(`API Failed (${status} ${reason})`, false, true);
          currentAbortController = null;
          error.finalAttempt = true; // Mark the error as the final one
          throw error;
        }

        // Retry logic based on status code
        let shouldRetry = false;
        let specificDelay = null;

        if (status === 429) {
          shouldRetry = true;
          const retryAfterHeader = error.headers?.["retry-after"];
          if (retryAfterHeader) {
            const retrySeconds = parseInt(retryAfterHeader, 10);
            if (!isNaN(retrySeconds)) {
              specificDelay = Math.min(retrySeconds * 1000, RETRY_DELAY_MAX_MS);
              logger.logEvent(
                "info",
                `API Rate limit hit (429). Retrying after specified ${retrySeconds}s.`
              );
            }
          }
          if (!specificDelay) {
            logger.logEvent(
              "info",
              `API Rate limit hit (429). Retrying with exponential backoff.`
            );
          }
        } else if (status >= 500 && status < 600) {
          shouldRetry = true; // Retry on server errors
          logger.logEvent(
            "info",
            `API server error (${status}). Retrying with exponential backoff.`
          );
        } else if (
          reason === "PROMPT_BLOCK" ||
          reason === "RESPONSE_BLOCK_SAFETY" ||
          reason === "RESPONSE_BLOCK_RECITATION"
        ) {
          shouldRetry = false; // Don't retry content blocks
          logger.logEvent(
            "error",
            `API error non-retryable (content block): ${reason}`
          );
        } else if (
          error.message.includes("Failed to fetch") ||
          error.message.includes("NetworkError")
        ) {
          shouldRetry = true; // Retry network errors
          logger.logEvent(
            "info",
            `API network error. Retrying with exponential backoff.`
          );
        } else {
          // Consider other errors (e.g., 400 bad request unless block) non-retryable by default
          shouldRetry = false;
          logger.logEvent(
            "error",
            `API error deemed non-retryable: Status ${status}, Reason ${reason}, Msg: ${errorMessage}`
          );
        }

        if (!shouldRetry) {
          if (!isContinuation)
            updateStatusFn(`API Failed (${status} Non-retryable)`, false, true);
          currentAbortController = null;
          error.finalAttempt = true;
          throw error;
        }

        const delayMs = specificDelay !== null ? specificDelay : currentDelay;
        if (!isContinuation)
          updateStatusFn(
            `API Error (${status}). Retrying in ${Math.round(
              delayMs / 1000
            )}s...`
          );
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // Increase delay for next potential retry (exponential backoff)
        currentDelay = Math.min(currentDelay * 2, RETRY_DELAY_MAX_MS);
      }
    }
    // Should not be reached if loop logic is correct
    const finalError = new Error("callApiWithRetry reached end unexpectedly.");
    currentAbortController = null;
    throw finalError;
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
