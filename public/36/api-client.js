const ApiClientModule = (config, logger) => {
  if (!config || !logger) {
    console.error("ApiClientModule requires config and logger.");
    return null;
  }

  let currentAbortController = null;
  const API_ENDPOINT_BASE = config.geminiApiBaseUrl;
  const RETRY_DELAY_BASE_MS = config.apiRetryDelayBaseMs;
  const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

  const sanitizeLlmJsonResponse = (rawText) => {
    if (!rawText || typeof rawText !== "string") return null;
    let text = rawText.trim();

    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      text = codeBlockMatch[1].trim();
      try {
        JSON.parse(text);
        return text;
      } catch (e) {
        logger.logEvent(
          "warn",
          `JSON content within code block failed validation: ${e.message}`
        );
      }
    }

    const firstBrace = text.indexOf("{");
    const firstBracket = text.indexOf("[");
    let startIndex = -1;

    if (firstBrace !== -1 && firstBracket !== -1) {
      startIndex = Math.min(firstBrace, firstBracket);
    } else {
      startIndex = Math.max(firstBrace, firstBracket);
    }

    if (startIndex !== -1) {
      text = text.substring(startIndex);
      const startChar = text[0];
      const endChar = startChar === "{" ? "}" : "]";
      let balance = 0;
      let lastValidIndex = -1;
      let inString = false;
      let escapeNext = false;

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
        if (!inString && balance === 0 && startIndex === 0) {
          lastValidIndex = i;
          break;
        } else if (!inString && balance === 0 && i > 0 && startIndex > 0) {
          lastValidIndex = i;
          break;
        }
      }

      if (lastValidIndex !== -1) {
        const potentialJson = text.substring(0, lastValidIndex + 1);
        try {
          JSON.parse(potentialJson);
          return potentialJson;
        } catch (e) {
          logger.logEvent(
            "warn",
            `Heuristic JSON sanitization failed validation: ${e.message}`
          );
        }
      } else {
        logger.logEvent(
          "warn",
          "JSON sanitization failed: Unbalanced structure found via heuristic."
        );
      }
    }

    logger.logEvent(
      "warn",
      "JSON sanitization failed: Could not extract valid JSON structure."
    );
    return null;
  };

  const callApiWithRetry = async (
    prompt,
    modelName,
    apiKey,
    functionDeclarations = [],
    generationConfigOverrides = {},
    progressCallback = (type, data) => {}
  ) => {
    if (currentAbortController) {
      logger.logEvent(
        "warn",
        "Aborting previous API call before starting new one."
      );
      currentAbortController.abort("New call initiated");
    }
    currentAbortController = new AbortController();
    let attempt = 0;
    const maxRetries = config.apiMaxRetries;
    let currentDelay = RETRY_DELAY_BASE_MS;

    while (attempt <= maxRetries) {
      const attemptMsg = attempt > 0 ? `[RETRY ${attempt}/${maxRetries}]` : "";
      progressCallback("status", {
        message: `${attemptMsg} Calling Gemini (${modelName})...`,
        active: true,
      });

      try {
        const apiEndpoint = `${API_ENDPOINT_BASE}${modelName}:streamGenerateContent`;
        const safetySettings = [
          "HATE_SPEECH",
          "HARASSMENT",
          "SEXUALLY_EXPLICIT",
          "DANGEROUS_CONTENT",
        ].map((cat) => ({
          category: `HARM_CATEGORY_${cat}`,
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        }));

        const generationConfig = {
          temperature: 0.5,
          maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
          ...generationConfigOverrides,
        };

        const requestBody = {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          safetySettings: safetySettings,
          generationConfig: generationConfig,
          ...(functionDeclarations?.length > 0 && {
            tools: [{ functionDeclarations: functionDeclarations }],
            tool_config: { function_calling_config: { mode: "ANY" } },
          }),
        };

        if (functionDeclarations?.length === 0) {
          requestBody.generationConfig.responseMimeType = "application/json";
        }

        logger.logEvent("debug", `API Request Body (Attempt ${attempt})`, {
          endpoint: apiEndpoint,
          hasTools: functionDeclarations.length > 0,
        });

        const response = await fetch(`${apiEndpoint}?key=${apiKey}&alt=sse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: currentAbortController.signal,
        });

        if (!response.ok || !response.body) {
          let errBodyText = "(Failed to read error body)";
          try {
            errBodyText = await response.text();
          } catch (e) {}
          let errJson = {};
          try {
            errJson = JSON.parse(errBodyText);
          } catch (e) {}
          const errorMessage =
            errJson?.error?.message || response.statusText || errBodyText;
          const error = new Error(
            `API Error (${response.status}): ${errorMessage}`
          );
          error.status = response.status;
          throw error;
        }

        progressCallback("status", {
          message: "Receiving stream...",
          active: true,
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedText = "";
        let accumulatedFunctionCalls = [];
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let finalFinishReason = "UNKNOWN";
        let blockReason = null;
        let safetyRatings = [];

        while (true) {
          if (currentAbortController?.signal.aborted)
            throw new Error("Aborted");
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const chunk = JSON.parse(line.substring(6));

                if (chunk.promptFeedback?.blockReason) {
                  blockReason = chunk.promptFeedback.blockReason;
                  safetyRatings = chunk.promptFeedback.safetyRatings || [];
                  throw new Error(`API Blocked (Prompt): ${blockReason}`);
                }
                if (chunk.error) {
                  throw new Error(
                    `API Error in chunk: ${chunk.error.message || "Unknown"}`
                  );
                }

                totalInputTokens =
                  chunk.usageMetadata?.promptTokenCount ?? totalInputTokens;
                totalOutputTokens =
                  chunk.usageMetadata?.candidatesTokenCount ??
                  totalOutputTokens;

                const candidate = chunk.candidates?.[0];
                if (candidate) {
                  finalFinishReason =
                    candidate.finishReason || finalFinishReason;
                  safetyRatings = candidate.safetyRatings || safetyRatings;
                  if (finalFinishReason === "SAFETY") {
                    blockReason = "SAFETY";
                    throw new Error(`API Response Blocked: SAFETY`);
                  }

                  const parts = candidate.content?.parts ?? [];
                  for (const part of parts) {
                    if (part.text) {
                      accumulatedText += part.text;
                      progressCallback("progress", {
                        type: "text",
                        content: part.text,
                        accumulated: accumulatedText,
                      });
                    } else if (part.functionCall) {
                      const existingCallIndex =
                        accumulatedFunctionCalls.findIndex(
                          (fc) => fc.name === part.functionCall.name
                        );
                      if (existingCallIndex > -1) {
                        accumulatedFunctionCalls[existingCallIndex] =
                          part.functionCall;
                      } else {
                        accumulatedFunctionCalls.push(part.functionCall);
                      }
                      progressCallback("progress", {
                        type: "functionCall",
                        content: part.functionCall,
                        accumulated: [...accumulatedFunctionCalls],
                      });
                    }
                  }
                }
                if (totalInputTokens > 0 || totalOutputTokens > 0) {
                  progressCallback("status", {
                    message: `Tokens: In ${totalInputTokens}, Out ${totalOutputTokens}`,
                    active: true,
                  });
                }
              } catch (e) {
                if (
                  e.message.includes("API Blocked") ||
                  e.message.includes("API Error in chunk") ||
                  e.message.includes("Aborted")
                )
                  throw e;
                logger.logEvent(
                  "warn",
                  `Failed to parse/process SSE chunk: ${e.message}`,
                  line
                );
              }
            }
          }
        }

        progressCallback("status", {
          message: `Stream finished (${finalFinishReason}). Processing...`,
          active: true,
        });
        logger.logEvent(
          "info",
          `API Stream OK. Finish:${finalFinishReason}. Tokens In:${totalInputTokens}, Out:${totalOutputTokens}`
        );

        let resultType = "empty";
        let resultData = null;
        if (accumulatedFunctionCalls.length > 0) {
          resultType = "functionCall";
          resultData = accumulatedFunctionCalls;
        } else if (accumulatedText) {
          resultType = "text";
          resultData = accumulatedText;
        }

        const finalResult = {
          type: resultType,
          data: resultData,
          inputTokenCount: totalInputTokens,
          outputTokenCount: totalOutputTokens,
          finishReason: finalFinishReason,
          blockReason: blockReason,
          safetyRatings: safetyRatings,
        };
        progressCallback("result", finalResult);
        currentAbortController = null;
        return finalResult;
      } catch (error) {
        const isAbort = error.message.includes("Aborted");
        if (isAbort) {
          progressCallback("status", { message: "Aborted.", active: false });
          progressCallback("error", { message: error.message });
          currentAbortController = null;
          throw error;
        }

        const status = error.status || 0;
        const reason = error.message || "Unknown API error";
        progressCallback("status", {
          message: `Error (${status}): ${reason.substring(0, 50)}... Retrying?`,
          active: true,
          isError: true,
        });
        progressCallback("error", { message: reason, status: status });

        logger.logEvent(
          "warn",
          `API attempt ${attempt} failed: ${reason}. Status: ${status}. Retries left: ${
            maxRetries - attempt
          }`
        );
        attempt++;

        if (
          attempt > maxRetries ||
          status === 400 ||
          status === 401 ||
          status === 403 ||
          status === 404 ||
          error.message.includes("API Blocked")
        ) {
          logger.logEvent(
            "error",
            `API call failed permanently after ${
              attempt - 1
            } attempts or due to non-retryable error (${status}).`
          );
          progressCallback("status", {
            message: `API Failed (${status})`,
            active: false,
            isError: true,
          });
          currentAbortController = null;
          throw error;
        }

        const delayMs = Math.min(currentDelay * 2 ** (attempt - 1), 30000);
        progressCallback("status", {
          message: `Retrying in ${Math.round(delayMs / 1000)}s...`,
          active: true,
        });
        if (currentAbortController?.signal.aborted)
          throw new Error("Aborted during retry delay");
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (currentAbortController?.signal.aborted)
          throw new Error("Aborted after retry delay");
      }
    }

    currentAbortController = null;
    throw new Error("API call failed after exhausting all retries.");
  };

  const abortCurrentCall = (reason = "User requested abort") => {
    if (currentAbortController) {
      logger.logEvent(
        "info",
        `User requested API call abort. Reason: ${reason}`
      );
      currentAbortController.abort(reason);
      currentAbortController = null;
    } else {
      logger.logEvent("info", "No active API call to abort.");
    }
  };

  return {
    callApiWithRetry,
    abortCurrentCall,
    sanitizeLlmJsonResponse,
  };
};

export default ApiClientModule;
