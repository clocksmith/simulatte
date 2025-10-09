const ApiClient = (cfg, log) => {
  let abortCtrl = null;

  const sanitize_json = (raw) => {
    if (!raw || typeof raw !== "string") return null;
    let text = raw.trim();
    const jsonBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonBlock?.[1]) {
      text = jsonBlock[1].trim();
      try {
        JSON.parse(text);
        return text;
      } catch (e) {
        /* ignore */
      }
    }
    const first = text.search(/[[{]/);
    if (first === -1) return null;
    text = text.substring(first);
    const start = text[0];
    const end = start === "{" ? "}" : "]";
    let balance = 0,
      inStr = false,
      esc = false,
      last = -1;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (char === "\\") esc = true;
        else if (char === '"') inStr = false;
      } else {
        if (char === '"') inStr = true;
        else if (char === start) balance++;
        else if (char === end) balance--;
      }
      if (!inStr && balance === 0) {
        last = i;
        break;
      }
    }
    if (last !== -1) {
      const potential = text.substring(0, last + 1);
      try {
        JSON.parse(potential);
        return potential;
      } catch (e) {
        /* ignore */
      }
    }
    return null;
  };

  const call = async (
    prompt,
    apiKey,
    genCfgOverrides = {},
    cb = () => {},
    modelName = cfg.model
  ) => {
    if (abortCtrl) {
      log.warn("Aborting previous API call");
      abortCtrl.abort("New call");
    }
    abortCtrl = new AbortController();
    let attempt = 0;

    while (attempt <= cfg.apiMaxRetries) {
      const retryMsg =
        attempt > 0 ? `[RETRY ${attempt}/${cfg.apiMaxRetries}]` : "";
      const modelForCall = modelName || cfg.model;
      cb("status", {
        msg: `${retryMsg} Calling Gemini (${modelForCall})...`,
        active: true,
      });

      try {
        const url = `${cfg.apiBaseUrl}${modelForCall}:streamGenerateContent?key=${apiKey}&alt=sse`;
        const safety = cfg.apiSafetySettings.map((cat) => ({
          category: `HARM_CATEGORY_${cat}`,
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        }));

        const generationConfig = {
          temperature: cfg.apiTemperature,
          topP: cfg.apiTopP,
          // topK: cfg.apiTopK, // Often omit if using temp/topP
          maxOutputTokens: cfg.apiMaxOutputTokens,
          responseMimeType: "application/json", // Expecting JSON containing mcp, impl, wc
          ...genCfgOverrides,
        };

        const body = {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          safetySettings: safety,
          generationConfig: generationConfig,
          // No tools needed for this specific generation task
        };

        log.debug(`API Request (Attempt ${attempt})`, { url });

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: abortCtrl.signal,
        });

        if (!res.ok || !res.body) {
          let errBody = "(Failed to read error body)";
          try {
            errBody = await res.text();
          } catch (e) {}
          let errJson = {};
          try {
            errJson = JSON.parse(errBody);
          } catch (e) {}
          const errMsg = errJson?.error?.message || res.statusText || errBody;
          const err = new Error(`API Error (${res.status}): ${errMsg}`);
          err.status = res.status;
          throw err;
        }

        cb("status", { msg: "Receiving stream...", active: true });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "",
          text = "",
          tokensIn = 0,
          tokensOut = 0;
        let finishReason = "UNKNOWN",
          blockReason = null,
          ratings = [];

        while (true) {
          if (abortCtrl?.signal.aborted) throw new Error("Aborted");
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
                  ratings = chunk.promptFeedback.safetyRatings || [];
                  throw new Error(`API Blocked (Prompt): ${blockReason}`);
                }
                if (chunk.error)
                  throw new Error(
                    `API Error chunk: ${chunk.error.message || "Unknown"}`
                  );

                tokensIn = chunk.usageMetadata?.promptTokenCount ?? tokensIn;
                tokensOut =
                  chunk.usageMetadata?.candidatesTokenCount ?? tokensOut;

                const cand = chunk.candidates?.[0];
                if (cand) {
                  finishReason = cand.finishReason || finishReason;
                  ratings = cand.safetyRatings || ratings;
                  if (finishReason === "SAFETY") {
                    blockReason = "SAFETY";
                    throw new Error(`API Resp Blocked: SAFETY`);
                  }
                  const parts = cand.content?.parts ?? [];
                  for (const part of parts) {
                    if (part.text) {
                      text += part.text;
                      cb("progress", {
                        type: "text",
                        chunk: part.text,
                        full: text,
                      });
                    }
                    // Function calls not expected in this response format
                  }
                }
                if (tokensIn > 0 || tokensOut > 0) {
                  cb("status", {
                    msg: `Tokens: In ${tokensIn}, Out ${tokensOut}`,
                    active: true,
                  });
                }
              } catch (e) {
                if (
                  e.message.includes("API Blocked") ||
                  e.message.includes("API Error chunk") ||
                  e.message.includes("Aborted")
                )
                  throw e;
                log.warn(`SSE chunk parse error: ${e.message}`, line);
              }
            }
          }
        }

        cb("status", {
          msg: `Stream finished (${finishReason}). Processing...`,
          active: true,
        });
        log.info(
          `API OK. Finish:${finishReason}. Tokens In:${tokensIn}, Out:${tokensOut}`
        );

        // Since we requested application/json, the full response should be in 'text'
        const result = {
          type: "text",
          data: text,
          tokensIn,
          tokensOut,
          finishReason,
          blockReason,
          ratings,
        };
        cb("result", result); // Callback with the raw text result
        abortCtrl = null;
        return result; // Return the raw text result
      } catch (error) {
        const isAbort = error.message.includes("Aborted");
        if (isAbort) {
          cb("status", { msg: "Aborted.", active: false });
          cb("error", { msg: error.message });
          abortCtrl = null;
          throw error;
        }

        const status = error.status || 0;
        let reason = error.message || "Unknown API error";
        if (status === 404 && reason.includes('models/')) {
          reason += "\nHint: Check the model alias. e.g. gemini-2.5-flash or gemini-flash-latest.";
        }
        cb("status", {
          msg: `Error (${status}): ${reason.substring(0, 50)}... Retrying?`,
          active: true,
          isError: true,
        });
        cb("error", { msg: reason, status });
        log.warn(
          `API attempt ${attempt} failed: ${reason}. Status: ${status}. Left: ${
            cfg.apiMaxRetries - attempt
          }`
        );
        attempt++;

        const noRetry =
          status === 400 ||
          status === 401 ||
          status === 403 ||
          status === 404 ||
          error.message.includes("API Blocked");
        if (attempt > cfg.apiMaxRetries || noRetry) {
          log.error(
            `API call failed permanently after ${
              attempt - 1
            } attempts or non-retryable error (${status}).`
          );
          cb("status", {
            msg: `API Failed (${status})`,
            active: false,
            isError: true,
          });
          abortCtrl = null;
          throw error;
        }

        const delayMs = Math.min(cfg.apiRetryDelay * 2 ** (attempt - 1), 30000);
        cb("status", {
          msg: `Retrying in ${Math.round(delayMs / 1000)}s...`,
          active: true,
        });
        if (abortCtrl?.signal.aborted)
          throw new Error("Aborted during retry delay");
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (abortCtrl?.signal.aborted)
          throw new Error("Aborted after retry delay");
      }
    }
    abortCtrl = null;
    throw new Error("API call failed after exhausting retries.");
  };

  const abort = (reason = "User abort") => {
    if (abortCtrl) {
      log.info(`API call abort requested. Reason: ${reason}`);
      abortCtrl.abort(reason);
      abortCtrl = null;
    } else {
      log.info("No active API call to abort.");
    }
  };

  return { call, abort, sanitize_json };
};
export default ApiClient;
